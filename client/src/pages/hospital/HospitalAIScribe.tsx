/**
 * Hospital AI Scribe — ambient voice-to-clinical-note (live offline-scribe pipeline).
 *
 * FIX (2026-09-30): previously recorded the entire consultation in the browser, then
 * uploaded it as one blob only when the doctor tapped stop — no progressive capture (a
 * browser crash/tab close mid-visit lost everything), and no consent capture anywhere.
 * Now uses the session/chunks/finalize API: a session (which requires consent) is opened
 * before recording, and audio is uploaded in ~8s chunks as they are produced, so at most
 * one chunk is ever at risk. A discard control lets the doctor delete an in-progress
 * recording (e.g. wrong patient, consent withdrawn) without transcribing it.
 */
import { useState, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import HospitalLayout from '@/components/hospital/HospitalLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Mic, MicOff, FileText, Loader2, Copy, CheckCircle2, Trash2, ShieldCheck } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import api from '@/utils/api';

type RecordingState = 'idle' | 'recording' | 'done';

const DOC_TYPES = [
  { code: 'ipd_notes', label: 'IPD Progress Note' },
  { code: 'opd_notes', label: 'OPD Clinical Note' },
  { code: 'discharge_summary', label: 'Discharge Summary' },
];

const CHUNK_INTERVAL_MS = 8000;

const formatDoc = (doc: unknown): string => {
  if (typeof doc === 'string') return doc;
  if (doc && typeof doc === 'object') {
    const d = doc as Record<string, unknown>;
    if (typeof d.formatted_text === 'string') return d.formatted_text;
    if (d.structured_data && typeof d.structured_data === 'object') {
      const s = d.structured_data as Record<string, string>;
      return ['subjective', 'objective', 'assessment', 'plan']
        .filter((k) => s[k])
        .map((k) => `${k.toUpperCase()}:\n${s[k]}`)
        .join('\n\n');
    }
    return JSON.stringify(doc, null, 2);
  }
  return String(doc ?? '');
};

export default function HospitalAIScribe() {
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const [recState, setRecState] = useState<RecordingState>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState('');
  const [note, setNote] = useState('');
  const [structured, setStructured] = useState<Record<string, string>>({});
  const [docType, setDocType] = useState(searchParams.get('docType') || 'ipd_notes');
  const [patientId, setPatientId] = useState(searchParams.get('patientId') || '');
  const [admissionId, setAdmissionId] = useState(searchParams.get('admissionId') || '');
  const [saving, setSaving] = useState(false);
  const [consentGranted, setConsentGranted] = useState(false);
  const [chunksUploaded, setChunksUploaded] = useState(0);
  const [chunksFailed, setChunksFailed] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const pendingUploadsRef = useRef<Promise<unknown>[]>([]);

  const uploadChunk = useCallback((sessionId: string, blob: Blob) => {
    if (!blob.size) return;
    const fd = new FormData();
    fd.append('audio', blob, 'chunk.webm');
    const p = api
      .post(`/offline-scribe/sessions/${sessionId}/chunks`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      .then(() => setChunksUploaded((n) => n + 1))
      .catch(() => setChunksFailed((n) => n + 1));
    pendingUploadsRef.current.push(p);
  }, []);

  const startRecording = useCallback(async () => {
    if (!consentGranted) {
      toast({ variant: 'destructive', title: 'Patient consent required', description: 'Confirm consent before recording.' });
      return;
    }
    try {
      const sessionRes = await api.post('/offline-scribe/sessions', {
        document_type: docType,
        language: 'auto',
        consent_granted: true,
        consent_method: 'verbal',
        patient_context: patientId ? { patient_id: patientId } : {},
      });
      const sessionId = sessionRes.data?.sessionId;
      if (!sessionId) throw new Error('No session id returned');
      sessionIdRef.current = sessionId;
      setChunksUploaded(0);
      setChunksFailed(0);
      pendingUploadsRef.current = [];

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = mr;
      mr.ondataavailable = (e) => {
        if (e.data.size > 0 && sessionIdRef.current) uploadChunk(sessionIdRef.current, e.data);
      };
      mr.onstop = () => stream.getTracks().forEach((t) => t.stop());
      mr.start(CHUNK_INTERVAL_MS);
      setRecState('recording');
      setElapsed(0);
      setNote('');
      timerRef.current = setInterval(() => setElapsed((n) => n + 1), 1000);
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Could not start recording', description: e?.response?.data?.message || e?.message });
    }
  }, [consentGranted, docType, patientId, toast, uploadChunk]);

  const discardRecording = useCallback(async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    mediaRecorderRef.current?.stop();
    const sessionId = sessionIdRef.current;
    sessionIdRef.current = null;
    setRecState('idle');
    setElapsed(0);
    if (sessionId) {
      try {
        await Promise.allSettled(pendingUploadsRef.current);
        await api.post(`/offline-scribe/sessions/${sessionId}/discard`, { reason: 'doctor discarded' });
        toast({ title: 'Recording discarded' });
      } catch {
        toast({ variant: 'destructive', title: 'Discard may not have completed', description: 'The session will still expire automatically.' });
      }
    }
  }, [toast]);

  const stopRecording = useCallback(async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    const sessionId = sessionIdRef.current;
    mediaRecorderRef.current?.stop();
    setRecState('done');
    if (!sessionId) return;

    setProcessing(true);
    try {
      setProgress('Uploading final audio…');
      await Promise.allSettled(pendingUploadsRef.current);
      if (chunksFailed > 0) {
        toast({ variant: 'destructive', title: `${chunksFailed} audio chunk(s) failed to upload`, description: 'The note may be based on partial audio.' });
      }
      setProgress('Transcribing…');
      const res = await api.post(`/offline-scribe/sessions/${sessionId}/finalize`, {}, { timeout: 600000 });
      const result = res.data?.result;
      const doc = result?.document || result;
      const text = formatDoc(doc);
      setNote(text);
      const sd = (doc as any)?.structured_data || {};
      setStructured({
        subjective: sd.subjective || '',
        objective: sd.objective || '',
        assessment: sd.assessment || '',
        plan: sd.plan || '',
      });
      toast({ title: 'Note generated' });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Scribe failed', description: e?.response?.data?.message });
    } finally {
      sessionIdRef.current = null;
      setProcessing(false);
      setProgress('');
    }
  }, [chunksFailed, toast]);

  const saveToEhr = async () => {
    if (!patientId) {
      toast({ variant: 'destructive', title: 'Patient ID required to save' });
      return;
    }
    setSaving(true);
    try {
      await api.post('/hospital/clinical-notes/notes', {
        patientId: Number(patientId),
        admissionId: admissionId ? Number(admissionId) : undefined,
        noteType: docType === 'ipd_notes' ? 'ipd_progress_note' : docType,
        subjective: structured.subjective || note,
        objective: structured.objective || '',
        assessment: structured.assessment || '',
        plan: structured.plan || '',
        content: note,
      });
      toast({ title: 'Saved to EHR', description: 'Clinical note persisted.' });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Save failed', description: e?.response?.data?.message });
    } finally {
      setSaving(false);
    }
  };

  const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  return (
    <HospitalLayout title="AI Scribe" subtitle="Ambient voice-to-clinical-note">
      <div className="p-6 max-w-3xl mx-auto space-y-6">
        <Card className="border-violet-200 bg-gradient-to-br from-violet-50 to-indigo-50">
          <CardContent className="p-6 space-y-4">
            <Badge className="bg-violet-600">AI · Live Scribe</Badge>
            <div className="grid sm:grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">Document type</Label>
                <Select value={docType} onValueChange={setDocType} disabled={recState === 'recording'}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DOC_TYPES.map((d) => <SelectItem key={d.code} value={d.code}>{d.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Patient ID</Label>
                <Input value={patientId} onChange={(e) => setPatientId(e.target.value)} placeholder="Required to save" disabled={recState === 'recording'} />
              </div>
              <div>
                <Label className="text-xs">Admission ID</Label>
                <Input value={admissionId} onChange={(e) => setAdmissionId(e.target.value)} placeholder="Optional" disabled={recState === 'recording'} />
              </div>
            </div>

            {recState === 'idle' && (
              <label className="flex items-start gap-2 rounded-lg border border-violet-200 bg-white/70 p-3 text-sm cursor-pointer">
                <Checkbox checked={consentGranted} onCheckedChange={(v) => setConsentGranted(v === true)} className="mt-0.5" />
                <span className="text-slate-700">
                  <ShieldCheck className="inline h-3.5 w-3.5 mr-1 text-violet-600" />
                  I confirm the patient has been informed this consultation is being recorded for AI-assisted
                  documentation, and has consented.
                </span>
              </label>
            )}

            <div className="text-center">
              <Button
                size="lg"
                className={`rounded-full h-20 w-20 ${recState === 'recording' ? 'bg-red-500 hover:bg-red-600 animate-pulse' : 'bg-violet-600 hover:bg-violet-700'}`}
                onClick={recState === 'recording' ? stopRecording : startRecording}
                disabled={processing || (recState === 'idle' && !consentGranted)}
              >
                {processing ? <Loader2 className="h-8 w-8 animate-spin" /> : recState === 'recording' ? <MicOff className="h-8 w-8" /> : <Mic className="h-8 w-8" />}
              </Button>
              <p className="font-medium text-slate-700 mt-3">
                {processing
                  ? progress || 'Processing…'
                  : recState === 'recording'
                    ? `Recording ${fmt(elapsed)} — tap to stop`
                    : consentGranted
                      ? 'Tap to start ambient scribe'
                      : 'Confirm consent above to enable recording'}
              </p>
              {recState === 'recording' && (
                <div className="mt-2 flex items-center justify-center gap-3 text-xs text-slate-500">
                  <span>{chunksUploaded} chunk{chunksUploaded === 1 ? '' : 's'} uploaded{chunksFailed > 0 ? `, ${chunksFailed} failed` : ''}</span>
                  <Button variant="ghost" size="sm" className="h-6 gap-1 text-red-600 hover:text-red-700" onClick={discardRecording}>
                    <Trash2 className="h-3 w-3" /> Discard
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {note && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4 text-violet-600" /> Structured Clinical Note
              </CardTitle>
              <Button variant="outline" size="sm" className="gap-1" onClick={() => {
                navigator.clipboard.writeText(note);
                toast({ title: 'Copied' });
              }}>
                <Copy className="h-3.5 w-3.5" /> Copy
              </Button>
            </CardHeader>
            <CardContent>
              <pre className="text-sm whitespace-pre-wrap font-sans text-slate-700 bg-slate-50 rounded-lg p-4">{note}</pre>
              <Button className="mt-4 gap-2 bg-emerald-600 hover:bg-emerald-700" onClick={saveToEhr} disabled={saving}>
                <CheckCircle2 className="h-4 w-4" /> {saving ? 'Saving…' : 'Sign & Save to EHR'}
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </HospitalLayout>
  );
}
