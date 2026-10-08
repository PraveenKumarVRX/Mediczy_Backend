/**
 * DoctorVoiceScribe — Ambient AI Voice-to-Document page
 * ───────────────────────────────────────────────────────
 * Records audio via the browser MediaRecorder API, uploads to the
 * offline-scribe full-pipeline endpoint, and displays the structured result.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import MainLayout from '@/components/layout/MainLayoutdoctor';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import api from '@/utils/api';
import {
  Mic,
  MicOff,
  Square,
  Play,
  Upload,
  Languages,
  FileText,
  Loader2,
  CheckCircle,
  Copy,
  Brain,
  Stethoscope,
} from 'lucide-react';

// ─── Supported languages ─────────────────────────────────────────────────────
const LANGUAGES = [
  { code: 'auto', label: 'Auto Detect' },
  { code: 'en',   label: 'English' },
  { code: 'hi',   label: 'Hindi' },
  { code: 'bn',   label: 'Bengali' },
  { code: 'te',   label: 'Telugu' },
  { code: 'ta',   label: 'Tamil' },
  { code: 'mr',   label: 'Marathi' },
  { code: 'gu',   label: 'Gujarati' },
  { code: 'kn',   label: 'Kannada' },
  { code: 'ml',   label: 'Malayalam' },
  { code: 'pa',   label: 'Punjabi' },
  { code: 'or',   label: 'Odia' },
  { code: 'as',   label: 'Assamese' },
  { code: 'ur',   label: 'Urdu' },
  { code: 'ne',   label: 'Nepali' },
  { code: 'mai',  label: 'Maithili' },
  { code: 'bho',  label: 'Bhojpuri' },
  { code: 'kok',  label: 'Konkani' },
  { code: 'sa',   label: 'Sanskrit' },
  { code: 'mni',  label: 'Manipuri' },
  { code: 'ks',   label: 'Kashmiri' },
  { code: 'sd',   label: 'Sindhi' },
  { code: 'sat',  label: 'Santali' },
  { code: 'doi',  label: 'Dogri' },
];

// ─── Document types ───────────────────────────────────────────────────────────
const DOC_TYPES = [
  { code: 'prescription',      label: 'Prescription' },
  { code: 'opd_notes',         label: 'OPD Notes' },
  { code: 'ipd_notes',         label: 'IPD Notes' },
  { code: 'discharge_summary', label: 'Discharge Summary' },
];

type RecordingState = 'idle' | 'recording' | 'paused' | 'done';

interface ScribeResult {
  transcription?: string;
  document?: unknown;
  text?: string;
  detected_language?: string;
  duration_seconds?: number;
}

// ─── Format result object to readable text ────────────────────────────────────
const formatDoc = (doc: unknown): string => {
  if (typeof doc === 'string') return doc;
  if (doc && typeof doc === 'object') {
    const lines: string[] = [];
    const walk = (obj: Record<string, unknown>, depth = 0) => {
      Object.entries(obj).forEach(([key, val]) => {
        const label = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        if (typeof val === 'string' && val.trim()) {
          lines.push(`${depth === 0 ? '• ' : '  '}${label}: ${val}`);
        } else if (Array.isArray(val) && val.length > 0) {
          lines.push(`${depth === 0 ? '• ' : '  '}${label}:`);
          val.forEach((item, i) => {
            if (typeof item === 'string') {
              lines.push(`    ${i + 1}. ${item}`);
            } else if (item && typeof item === 'object') {
              const row = Object.entries(item as Record<string, unknown>)
                .filter(([, v]) => v && typeof v === 'string')
                .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`)
                .join(' | ');
              if (row) lines.push(`    ${i + 1}. ${row}`);
            }
          });
        } else if (val && typeof val === 'object') {
          lines.push(`${depth === 0 ? '• ' : '  '}${label}:`);
          walk(val as Record<string, unknown>, depth + 1);
        }
      });
    };
    walk(doc as Record<string, unknown>);
    return lines.join('\n') || JSON.stringify(doc, null, 2);
  }
  return String(doc ?? '');
};

// ─── Main page component ─────────────────────────────────────────────────────
const DoctorVoiceScribe = () => {
  const { toast } = useToast();
  const [searchParams] = useSearchParams();

  // Recording
  const [recState, setRecState]    = useState<RecordingState>('idle');
  const [elapsed, setElapsed]      = useState(0);
  const mediaRecorderRef           = useRef<MediaRecorder | null>(null);
  const chunksRef                  = useRef<Blob[]>([]);
  const timerRef                   = useRef<NodeJS.Timeout | null>(null);
  const [audioBlob, setAudioBlob]  = useState<Blob | null>(null);

  // File upload alternative
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);

  // Form
  const [language, setLanguage]     = useState('auto');
  const [docType, setDocType]       = useState(searchParams.get('docType') || 'prescription');

  useEffect(() => {
    const dt = searchParams.get('docType');
    if (dt) setDocType(dt);
  }, [searchParams]);
  const [patientName, setPatientName] = useState('');
  const [patientAge, setPatientAge]   = useState('');
  const [patientGender, setPatientGender] = useState('');
  const patientId = searchParams.get('patientId') || searchParams.get('patient_id') || '';

  // Processing
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress]     = useState('');
  const [result, setResult]         = useState<ScribeResult | null>(null);

  // ── Start recording ──────────────────────────────────────────────────────
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = mr;
      chunksRef.current = [];

      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        setAudioBlob(blob);
        stream.getTracks().forEach(t => t.stop());
      };

      mr.start(500);
      setRecState('recording');
      setElapsed(0);
      setResult(null);

      timerRef.current = setInterval(() => setElapsed(n => n + 1), 1000);
    } catch {
      toast({ title: 'Microphone Error', description: 'Cannot access microphone. Please allow permission.', variant: 'destructive' });
    }
  }, [toast]);

  // ── Stop recording ───────────────────────────────────────────────────────
  const stopRecording = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    mediaRecorderRef.current?.stop();
    setRecState('done');
  }, []);

  // ── Format elapsed time ──────────────────────────────────────────────────
  const fmtTime = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  // ── Handle file upload ───────────────────────────────────────────────────
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadedFile(file);
      setAudioBlob(null);
      setRecState('done');
      setResult(null);
    }
  };

  // ── Copy to clipboard ────────────────────────────────────────────────────
  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: 'Copied', description: 'Result copied to clipboard.' });
  };

  // ── Process audio ─────────────────────────────────────────────────────────
  const handleProcess = useCallback(async () => {
    const source = uploadedFile || audioBlob;
    if (!source) {
      toast({ title: 'No Audio', description: 'Record or upload an audio file first.', variant: 'destructive' });
      return;
    }

    setProcessing(true);
    setResult(null);

    try {
      const fd = new FormData();

      if (uploadedFile) {
        fd.append('audio', uploadedFile, uploadedFile.name);
      } else if (audioBlob) {
        fd.append('audio', audioBlob, 'recording.webm');
      }

      fd.append('language', language);
      fd.append('document_type', docType);
      if (patientId) fd.append('patient_id', patientId);
      fd.append('patient_context', JSON.stringify({
        patientId: patientId || undefined,
        name: patientName.trim() || undefined,
        age: patientAge.trim() || undefined,
        gender: patientGender || undefined,
      }));
      if (patientName.trim()) fd.append('patient_name', patientName.trim());
      if (patientAge.trim())  fd.append('patient_age', patientAge.trim());
      if (patientGender)      fd.append('patient_gender', patientGender);

      setProgress('Uploading audio…');
      const res = await api.post('/offline-scribe/full-pipeline', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 180000,
        onUploadProgress: (evt) => {
          if (evt.total) {
            const pct = Math.round((evt.loaded / evt.total) * 100);
            setProgress(`Uploading… ${pct}%`);
          }
        },
      });

      setProgress('Processing complete!');
      setResult(res.data);
      toast({ title: '✅ Document Generated', description: 'AI processing complete.' });
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast({ title: 'Processing Failed', description: msg || 'Could not process audio. Please try again.', variant: 'destructive' });
    } finally {
      setProcessing(false);
      setProgress('');
    }
  }, [audioBlob, uploadedFile, language, docType, patientName, patientAge, patientGender, patientId, toast]);

  // ── Render ────────────────────────────────────────────────────────────────
  const hasAudio = !!(audioBlob || uploadedFile);

  return (
    <MainLayout>
      <div className="max-w-4xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="p-3 bg-purple-600 rounded-xl">
            <Mic className="h-7 w-7 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Voice Scribe</h1>
            <p className="text-sm text-muted-foreground">Ambient AI documentation — record or upload, get a structured document</p>
          </div>
          <Badge variant="secondary" className="ml-auto gap-1">
            <Brain className="h-3 w-3" /> 24 Languages
          </Badge>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          {/* Left: Record / Upload */}
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Mic className="h-4 w-4 text-purple-600" /> Step 1: Capture Audio
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">

                {/* Recording controls */}
                <div className="flex flex-col items-center gap-3 p-6 rounded-xl bg-muted/40 border border-dashed">
                  {recState === 'recording' && (
                    <div className="flex items-center gap-2 text-red-500 animate-pulse">
                      <div className="h-2 w-2 rounded-full bg-red-500" />
                      <span className="text-sm font-semibold">Recording</span>
                    </div>
                  )}
                  <span className="text-3xl font-mono font-bold text-foreground">{fmtTime(elapsed)}</span>

                  {recState === 'idle' || recState === 'done' ? (
                    <Button
                      onClick={startRecording}
                      className="gap-2 bg-purple-600 hover:bg-purple-700"
                      disabled={processing}
                    >
                      <Mic className="h-4 w-4" />
                      {recState === 'done' ? 'Record Again' : 'Start Recording'}
                    </Button>
                  ) : (
                    <Button
                      onClick={stopRecording}
                      variant="destructive"
                      className="gap-2"
                    >
                      <Square className="h-4 w-4" /> Stop
                    </Button>
                  )}

                  {hasAudio && recState !== 'recording' && (
                    <p className="text-xs text-green-600 font-medium flex items-center gap-1">
                      <CheckCircle className="h-3 w-3" />
                      {uploadedFile ? uploadedFile.name : `Recording ready (${fmtTime(elapsed)})`}
                    </p>
                  )}
                </div>

                {/* File upload alternative */}
                <div className="text-center text-xs text-muted-foreground">— or upload an audio file —</div>
                <div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="audio/*,.m4a,.mp3,.wav,.ogg,.webm,.aac"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                  <Button
                    variant="outline"
                    className="w-full gap-2"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={processing}
                  >
                    <Upload className="h-4 w-4" /> Upload Audio File
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Settings */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Languages className="h-4 w-4 text-blue-600" /> Step 2: Settings
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label className="text-xs text-muted-foreground mb-1 block">Language</Label>
                  <Select value={language} onValueChange={setLanguage}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LANGUAGES.map(l => (
                        <SelectItem key={l.code} value={l.code}>{l.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-xs text-muted-foreground mb-1 block">Document Type</Label>
                  <Select value={docType} onValueChange={setDocType}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DOC_TYPES.map(d => (
                        <SelectItem key={d.code} value={d.code}>{d.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">Patient Name</Label>
                    <Input
                      value={patientName}
                      onChange={e => setPatientName(e.target.value)}
                      placeholder="Optional"
                      className="h-9 text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">Age</Label>
                    <Input
                      value={patientAge}
                      onChange={e => setPatientAge(e.target.value)}
                      placeholder="Optional"
                      className="h-9 text-sm"
                      type="number"
                    />
                  </div>
                </div>

                <div>
                  <Label className="text-xs text-muted-foreground mb-1 block">Gender</Label>
                  <div className="flex gap-2">
                    {['Male', 'Female', 'Other'].map(g => (
                      <Button
                        key={g}
                        variant={patientGender === g ? 'default' : 'outline'}
                        size="sm"
                        className="flex-1 h-8 text-xs"
                        onClick={() => setPatientGender(patientGender === g ? '' : g)}
                      >
                        {g}
                      </Button>
                    ))}
                  </div>
                </div>

                <Button
                  className="w-full gap-2 bg-purple-600 hover:bg-purple-700 mt-2"
                  onClick={handleProcess}
                  disabled={!hasAudio || processing}
                >
                  {processing ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> {progress || 'Processing…'}</>
                  ) : (
                    <><Brain className="h-4 w-4" /> Process with AI</>
                  )}
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Right: Result */}
          <div>
            <Card className="h-full">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="h-4 w-4 text-green-600" /> Step 3: Generated Document
                </CardTitle>
              </CardHeader>
              <CardContent>
                {!result && !processing && (
                  <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                    <Stethoscope className="h-12 w-12 text-muted-foreground/40" />
                    <p className="text-sm text-muted-foreground">
                      Record or upload audio, configure settings, then click "Process with AI" to generate a clinical document.
                    </p>
                  </div>
                )}

                {processing && (
                  <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                    <Loader2 className="h-10 w-10 animate-spin text-purple-600" />
                    <p className="text-sm font-medium text-foreground">{progress || 'Processing…'}</p>
                    <p className="text-xs text-muted-foreground">This may take 30–90 seconds depending on audio length.</p>
                  </div>
                )}

                {result && !processing && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <Badge className="bg-green-100 text-green-700 border-green-200">
                        <CheckCircle className="h-3 w-3 mr-1" /> Success
                      </Badge>
                      {result.detected_language && (
                        <Badge variant="outline" className="text-xs">
                          🌐 {result.detected_language}
                        </Badge>
                      )}
                      {result.duration_seconds && (
                        <span className="text-xs text-muted-foreground">
                          {result.duration_seconds.toFixed(1)}s audio
                        </span>
                      )}
                    </div>

                    {result.transcription && (
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <Label className="text-xs text-muted-foreground">Transcription</Label>
                          <Button
                            variant="ghost" size="sm"
                            className="h-6 px-2 text-xs gap-1"
                            onClick={() => handleCopy(result.transcription!)}
                          >
                            <Copy className="h-3 w-3" /> Copy
                          </Button>
                        </div>
                        <div className="text-xs bg-muted/50 rounded-lg p-3 leading-relaxed max-h-40 overflow-y-auto">
                          {result.transcription}
                        </div>
                      </div>
                    )}

                    {result.document && (
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <Label className="text-xs text-muted-foreground">
                            {DOC_TYPES.find(d => d.code === docType)?.label || 'Document'}
                          </Label>
                          <Button
                            variant="ghost" size="sm"
                            className="h-6 px-2 text-xs gap-1"
                            onClick={() => handleCopy(formatDoc(result.document))}
                          >
                            <Copy className="h-3 w-3" /> Copy
                          </Button>
                        </div>
                        <pre className="text-xs bg-muted/50 rounded-lg p-3 leading-relaxed max-h-80 overflow-y-auto whitespace-pre-wrap font-sans">
                          {formatDoc(result.document)}
                        </pre>
                      </div>
                    )}

                    {!result.transcription && !result.document && result.text && (
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <Label className="text-xs text-muted-foreground">Result</Label>
                          <Button
                            variant="ghost" size="sm"
                            className="h-6 px-2 text-xs gap-1"
                            onClick={() => handleCopy(result.text!)}
                          >
                            <Copy className="h-3 w-3" /> Copy
                          </Button>
                        </div>
                        <pre className="text-xs bg-muted/50 rounded-lg p-3 leading-relaxed max-h-80 overflow-y-auto whitespace-pre-wrap font-sans">
                          {result.text}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </MainLayout>
  );
};

export default DoctorVoiceScribe;
