/**
 * Hospital AI Scribe — ambient voice-to-clinical-note (live offline-scribe pipeline).
 */
import { useState, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import HospitalLayout from '@/components/hospital/HospitalLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Mic, MicOff, FileText, Loader2, Copy, CheckCircle2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import api from '@/utils/api';

type RecordingState = 'idle' | 'recording' | 'done';

const DOC_TYPES = [
  { code: 'ipd_notes', label: 'IPD Progress Note' },
  { code: 'opd_notes', label: 'OPD Clinical Note' },
  { code: 'discharge_summary', label: 'Discharge Summary' },
];

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

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = mr;
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => stream.getTracks().forEach((t) => t.stop());
      mr.start(500);
      setRecState('recording');
      setElapsed(0);
      setNote('');
      timerRef.current = setInterval(() => setElapsed((n) => n + 1), 1000);
    } catch {
      toast({ variant: 'destructive', title: 'Microphone access denied' });
    }
  }, [toast]);

  const stopRecording = useCallback(async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    mediaRecorderRef.current?.stop();
    setRecState('done');
    const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
    if (!blob.size) return;

    setProcessing(true);
    try {
      const fd = new FormData();
      fd.append('audio', blob, 'recording.webm');
      fd.append('language', 'auto');
      fd.append('document_type', docType);
      setProgress('Transcribing…');
      const res = await api.post('/offline-scribe/full-pipeline', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 180000,
      });
      const doc = res.data?.document || res.data;
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
      setProcessing(false);
      setProgress('');
    }
  }, [docType, toast]);

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
                <Select value={docType} onValueChange={setDocType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DOC_TYPES.map((d) => <SelectItem key={d.code} value={d.code}>{d.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Patient ID</Label>
                <Input value={patientId} onChange={(e) => setPatientId(e.target.value)} placeholder="Required to save" />
              </div>
              <div>
                <Label className="text-xs">Admission ID</Label>
                <Input value={admissionId} onChange={(e) => setAdmissionId(e.target.value)} placeholder="Optional" />
              </div>
            </div>
            <div className="text-center">
              <Button
                size="lg"
                className={`rounded-full h-20 w-20 ${recState === 'recording' ? 'bg-red-500 hover:bg-red-600 animate-pulse' : 'bg-violet-600 hover:bg-violet-700'}`}
                onClick={recState === 'recording' ? stopRecording : startRecording}
                disabled={processing}
              >
                {processing ? <Loader2 className="h-8 w-8 animate-spin" /> : recState === 'recording' ? <MicOff className="h-8 w-8" /> : <Mic className="h-8 w-8" />}
              </Button>
              <p className="font-medium text-slate-700 mt-3">
                {processing ? progress || 'Processing…' : recState === 'recording' ? `Recording ${fmt(elapsed)} — tap to stop` : 'Tap to start ambient scribe'}
              </p>
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
