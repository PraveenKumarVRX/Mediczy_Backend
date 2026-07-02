/**
 * Hospital AI Scribe — ambient voice-to-clinical-note via WebSocket stream
 */
import { useMemo, useState } from 'react';
import HospitalLayout from '@/components/hospital/HospitalLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Mic, MicOff, FileText, Loader2, Copy, CheckCircle2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAmbientScribe } from '@/hooks/useAmbientScribe';
import api from '@/utils/api';

function formatStructuredNote(structured: unknown, transcript: string): string {
  if (!structured || typeof structured !== 'object') return transcript;
  const s = structured as Record<string, unknown>;
  if (typeof s.note === 'string') return s.note;
  if (typeof s.structuredNote === 'string') return s.structuredNote;
  const sections = ['subjective', 'objective', 'assessment', 'plan'];
  const lines: string[] = [];
  for (const key of sections) {
    if (s[key]) lines.push(`${key.toUpperCase()}:\n${s[key]}`);
  }
  if (lines.length) return lines.join('\n\n');
  return transcript;
}

export default function HospitalAIScribe() {
  const { toast } = useToast();
  const token = useMemo(() => localStorage.getItem('hospitalToken') || '', []);
  const { state, start, sendText, end } = useAmbientScribe(token);
  const [manualNote, setManualNote] = useState('');
  const [saving, setSaving] = useState(false);

  const note = manualNote || formatStructuredNote(state.structured, state.fullTranscript);
  const isLive = state.active;
  const isProcessing = !state.active && state.sessionId && !state.fullTranscript && !state.error;

  const toggleRecord = () => {
    if (isLive) {
      end('ipd');
      toast({ title: 'Processing', description: 'Structuring consultation note…' });
    } else {
      setManualNote('');
      start();
      toast({ title: 'Ambient scribe started', description: 'Speak naturally — tap again to finish.' });
    }
  };

  const handleSave = async () => {
    if (!note.trim()) return;
    setSaving(true);
    try {
      await api.post('/hospital/practice/clinical-notes', {
        noteType: 'ipd',
        content: note,
        source: 'ambient_scribe',
      });
      toast({ title: 'Saved to EHR', description: 'Clinical note signed and saved.' });
    } catch {
      toast({ title: 'Note copied locally', description: 'EHR save unavailable — note retained in session.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <HospitalLayout title="AI Scribe" subtitle="Ambient voice-to-clinical-note">
      <div className="p-6 max-w-3xl mx-auto space-y-6">
        <Card className="border-violet-200 bg-gradient-to-br from-violet-50 to-indigo-50">
          <CardContent className="p-6 text-center space-y-4">
            <Badge className="bg-violet-600">{isLive ? 'Live' : 'Ambient Scribe'}</Badge>
            {state.partialText && isLive && (
              <p className="text-sm text-slate-600 italic">"{state.partialText}"</p>
            )}
            <Button
              size="lg"
              className={`rounded-full h-20 w-20 ${isLive ? 'bg-red-500 hover:bg-red-600 animate-pulse' : 'bg-violet-600 hover:bg-violet-700'}`}
              onClick={toggleRecord}
              disabled={!token}
            >
              {isProcessing ? <Loader2 className="h-8 w-8 animate-spin" /> : isLive ? <MicOff className="h-8 w-8" /> : <Mic className="h-8 w-8" />}
            </Button>
            <p className="font-medium text-slate-700">
              {!token ? 'Hospital login required' : isProcessing ? 'Transcribing & structuring…' : isLive ? 'Recording — tap to stop' : 'Tap to start ambient scribe'}
            </p>
            {state.error && <p className="text-sm text-red-600">{state.error}</p>}
          </CardContent>
        </Card>

        {(note || !isLive) && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4 text-violet-600" /> Structured Clinical Note
              </CardTitle>
              <Button variant="outline" size="sm" className="gap-1" onClick={() => {
                navigator.clipboard.writeText(note);
                toast({ title: 'Copied to clipboard' });
              }}>
                <Copy className="h-3.5 w-3.5" /> Copy
              </Button>
            </CardHeader>
            <CardContent>
              <Textarea
                className="min-h-[240px] font-sans text-sm"
                value={note}
                onChange={(e) => setManualNote(e.target.value)}
                placeholder="Structured note will appear here after recording, or type manually…"
              />
              {!isLive && (
                <div className="mt-3 flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => sendText(manualNote)}>Send chunk to scribe</Button>
                  <Button className="gap-2 bg-emerald-600 hover:bg-emerald-700" onClick={handleSave} disabled={saving || !note.trim()}>
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    Sign & Save to EHR
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </HospitalLayout>
  );
}
