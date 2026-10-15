import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import api from '@/lib/api';

type Handoff = { id: number; status: string; transcript: string; soap: Record<string, unknown>; doctor_matches: unknown[]; red_flags: unknown[]; handoff_reason?: string };

export default function AgentConsole() {
  const [handoffs, setHandoffs] = useState<Handoff[]>([]);
  const [transcript, setTranscript] = useState('');
  const { toast } = useToast();

  const load = async () => {
    try {
      const response = await api.get('/medcore-adoption/agent-handoffs?status=pending');
      setHandoffs(response.data.handoffs || []);
    } catch {
      toast({ title: 'Agent console unavailable', description: 'Sign in with a support or clinical account and retry.', variant: 'destructive' });
    }
  };
  useEffect(() => { load(); }, []);

  const createHandoff = async () => {
    if (!transcript.trim()) return;
    await api.post('/medcore-adoption/agent-handoffs', { transcript, handoffReason: 'Agent requested clinical review' });
    setTranscript('');
    await load();
  };

  const update = async (id: number, status: string) => {
    await api.patch(`/medcore-adoption/agent-handoffs/${id}`, { status });
    await load();
  };

  return <div className="container mx-auto max-w-6xl space-y-6 p-6">
    <div>
      <h1 className="text-2xl font-semibold">Agent Console</h1>
      <p className="text-muted-foreground">Triage transcript, extracted context, red flags and audited clinical handoff.</p>
    </div>
    <Card>
      <CardHeader><CardTitle>Create human handoff</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <Textarea value={transcript} onChange={(event) => setTranscript(event.target.value)} placeholder="Paste or dictate the conversation transcript" />
        <Button onClick={createHandoff} disabled={!transcript.trim()}>Send to clinical queue</Button>
      </CardContent>
    </Card>
    <div className="grid gap-4 md:grid-cols-2">
      {handoffs.map((handoff) => <Card key={handoff.id}>
        <CardHeader className="flex-row items-center justify-between space-y-0"><CardTitle>Handoff #{handoff.id}</CardTitle><Badge>{handoff.status}</Badge></CardHeader>
        <CardContent className="space-y-3"><p className="whitespace-pre-wrap text-sm">{handoff.transcript}</p>
          {handoff.red_flags?.length > 0 && <p className="text-sm text-destructive">Red flags: {JSON.stringify(handoff.red_flags)}</p>}
          <div className="flex gap-2"><Button size="sm" onClick={() => update(handoff.id, 'claimed')}>Claim</Button><Button size="sm" variant="outline" onClick={() => update(handoff.id, 'completed')}>Complete</Button></div>
        </CardContent>
      </Card>)}
      {!handoffs.length && <p className="text-muted-foreground">No pending handoffs.</p>}
    </div>
  </div>;
}
