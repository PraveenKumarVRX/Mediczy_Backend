/**
 * Hospital AI Scribe — ambient documentation demo (hospital portal context).
 */
import { useState } from 'react';
import HospitalLayout from '@/components/hospital/HospitalLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Mic, MicOff, FileText, Loader2, Copy, CheckCircle2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const SAMPLE_NOTE = `SUBJECTIVE:
45-year-old male with chest discomfort for 2 hours. Denies syncope.

OBJECTIVE:
BP 138/88, HR 78, SpO2 98%. ECG: sinus rhythm, no acute ST changes.

ASSESSMENT:
1. Atypical chest pain — low-risk ACS
2. Hypertension — controlled

PLAN:
- Troponin, lipid panel
- Continue antihypertensives
- Cardiology follow-up in 48h`;

export default function HospitalAIScribe() {
  const { toast } = useToast();
  const [recording, setRecording] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [note, setNote] = useState('');

  const toggleRecord = async () => {
    if (recording) {
      setRecording(false);
      setProcessing(true);
      await new Promise(r => setTimeout(r, 1200));
      setNote(SAMPLE_NOTE);
      setProcessing(false);
      toast({ title: 'Note generated', description: 'AI scribe structured the consultation.' });
    } else {
      setRecording(true);
      setNote('');
    }
  };

  return (
    <HospitalLayout title="AI Scribe" subtitle="Ambient voice-to-clinical-note">
      <div className="p-6 max-w-3xl mx-auto space-y-6">
        <Card className="border-violet-200 bg-gradient-to-br from-violet-50 to-indigo-50">
          <CardContent className="p-6 text-center space-y-4">
            <Badge className="bg-violet-600">AI · Demo Mode</Badge>
            <p className="text-slate-600 text-sm">Patient: Priya Singh · Post-op appendectomy · Ward GEN-11</p>
            <Button
              size="lg"
              className={`rounded-full h-20 w-20 ${recording ? 'bg-red-500 hover:bg-red-600 animate-pulse' : 'bg-violet-600 hover:bg-violet-700'}`}
              onClick={toggleRecord}
              disabled={processing}
            >
              {processing ? <Loader2 className="h-8 w-8 animate-spin" /> : recording ? <MicOff className="h-8 w-8" /> : <Mic className="h-8 w-8" />}
            </Button>
            <p className="font-medium text-slate-700">
              {processing ? 'Transcribing & structuring…' : recording ? 'Recording — tap to stop' : 'Tap to start ambient scribe'}
            </p>
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
                toast({ title: 'Copied to clipboard' });
              }}>
                <Copy className="h-3.5 w-3.5" /> Copy
              </Button>
            </CardHeader>
            <CardContent>
              <pre className="text-sm whitespace-pre-wrap font-sans text-slate-700 bg-slate-50 rounded-lg p-4">{note}</pre>
              <Button className="mt-4 gap-2 bg-emerald-600 hover:bg-emerald-700">
                <CheckCircle2 className="h-4 w-4" /> Sign & Save to EHR
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </HospitalLayout>
  );
}
