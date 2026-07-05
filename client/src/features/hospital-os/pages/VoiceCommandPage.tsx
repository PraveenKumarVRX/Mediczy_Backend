import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Mic, Loader2 } from 'lucide-react';
import { draftVoiceLabOrder, draftVoiceImagingOrder } from '@/services/hospitalOs.service';

export default function VoiceCommandPage() {
  const [patientId, setPatientId] = useState('');
  const [transcript, setTranscript] = useState('');
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const draft = async (type: 'lab' | 'imaging') => {
    const pid = Number(patientId);
    if (!pid || !transcript.trim()) return;
    setLoading(true);
    try {
      const body = { patientId: pid, transcript: transcript.trim() };
      const res = type === 'lab' ? await draftVoiceLabOrder(body) : await draftVoiceImagingOrder(body);
      setResult(res?.data);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold flex items-center gap-2">
        <Mic className="h-5 w-5 text-violet-600" />
        Voice-First Commands (Pillar 15)
      </h2>
      <p className="text-sm text-muted-foreground">T1+ drafts route to approval inbox — never auto-execute.</p>
      <Card>
        <CardHeader><CardTitle className="text-base">Draft from voice transcript</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Input placeholder="Patient ID" value={patientId} onChange={(e) => setPatientId(e.target.value)} />
          <Textarea placeholder="e.g. Order CBC and BMP for patient..." value={transcript} onChange={(e) => setTranscript(e.target.value)} rows={4} />
          <div className="flex gap-2">
            <Button onClick={() => draft('lab')} disabled={loading}>Draft lab order</Button>
            <Button variant="outline" onClick={() => draft('imaging')} disabled={loading}>Draft imaging</Button>
          </div>
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          {result && (
            <pre className="text-xs bg-slate-100 p-3 rounded overflow-auto">{JSON.stringify(result, null, 2)}</pre>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
