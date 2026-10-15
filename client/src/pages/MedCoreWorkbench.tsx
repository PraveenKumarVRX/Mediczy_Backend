import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import api from '@/lib/api';

type Handoff = { id: number; status: string; transcript?: string; red_flags?: unknown[]; handoff_reason?: string };
type Result = { success?: boolean; code?: string; message?: string; [key: string]: unknown };

const initialReport = JSON.stringify({
  test: 'Haemoglobin', value: 12.4, unit: 'g/dL', referenceRange: '12-16', flag: 'normal',
}, null, 2);
const initialHistory = JSON.stringify([
  { date: '2026-08-01', quantity: 20 }, { date: '2026-09-01', quantity: 24 }, { date: '2026-10-01', quantity: 22 },
], null, 2);

function ResultPanel({ result }: { result: Result | null }) {
  if (!result) return null;
  return <pre className="max-h-64 overflow-auto rounded-md bg-muted p-3 text-xs" aria-label="Operation result">{JSON.stringify(result, null, 2)}</pre>;
}

export default function MedCoreWorkbench() {
  const { toast } = useToast();
  const [handoffs, setHandoffs] = useState<Handoff[]>([]);
  const [loadingQueue, setLoadingQueue] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [triageSymptoms, setTriageSymptoms] = useState('');
  const [triageLanguage, setTriageLanguage] = useState('en');
  const [medications, setMedications] = useState('warfarin, ibuprofen');
  const [report, setReport] = useState(initialReport);
  const [patientId, setPatientId] = useState('');
  const [medication, setMedication] = useState('{"name":"Metformin","dose":"500 mg","times":["08:00"]}');
  const [itemId, setItemId] = useState('medicine-1');
  const [history, setHistory] = useState(initialHistory);
  const [metricKey, setMetricKey] = useState('triage_routing_accuracy');
  const [results, setResults] = useState<Record<string, Result | null>>({});

  const run = useCallback(async (key: string, operation: () => Promise<{ data: Result }>) => {
    try {
      const response = await operation();
      setResults((current) => ({ ...current, [key]: response.data }));
      return response.data;
    } catch (error: any) {
      const data = error?.response?.data || { success: false, code: 'request_failed', message: error?.message || 'Request failed' };
      setResults((current) => ({ ...current, [key]: data }));
      toast({ title: 'MedCore capability unavailable', description: data.message || data.code || 'Request failed', variant: 'destructive' });
      return data;
    }
  }, [toast]);

  const loadQueue = useCallback(async () => {
    setLoadingQueue(true);
    try {
      const response = await api.get('/medcore-adoption/agent-handoffs?status=pending');
      setResults((current) => ({ ...current, capability: { success: true } }));
      setHandoffs(response.data?.handoffs || []);
    } catch (error: any) {
      const data = error?.response?.data;
      if (data?.code === 'feature_disabled') setResults((current) => ({ ...current, capability: data }));
      else toast({ title: 'Could not load handoff queue', description: data?.message || 'Sign in with a clinical account and retry.', variant: 'destructive' });
    } finally { setLoadingQueue(false); }
  }, [toast]);

  useEffect(() => { loadQueue(); }, [loadQueue]);

  const featureState = useMemo(() => {
    const disabled = Object.values(results).some((value) => value?.code === 'feature_disabled');
    return disabled ? 'disabled' : 'ready';
  }, [results]);

  const submitTriage = () => run('triage', () => api.post('/medcore-adoption/triage', { symptoms: triageSymptoms, language: triageLanguage }));
  const checkSafety = () => run('safety', () => api.post('/medcore-adoption/drug-safety/signoff', { medications: medications.split(',').map((name) => name.trim()).filter(Boolean) }));
  const createDraft = () => {
    try { return run('lab', () => api.post('/medcore-adoption/lab-explainer/drafts', { report: JSON.parse(report) })); }
    catch { toast({ title: 'Invalid report JSON', description: 'Enter a valid JSON object before creating a draft.', variant: 'destructive' }); return Promise.resolve(null); }
  };
  const createPlan = () => {
    try { return run('adherence', () => api.post('/medcore-adoption/adherence/plans', { patientId, medication: JSON.parse(medication) })); }
    catch { toast({ title: 'Invalid medication JSON', description: 'Enter a valid JSON object before creating a plan.', variant: 'destructive' }); return Promise.resolve(null); }
  };
  const forecast = () => {
    try { return run('forecast', () => api.post('/medcore-adoption/pharmacy/forecast', { itemId, history: JSON.parse(history) })); }
    catch { toast({ title: 'Invalid history JSON', description: 'Enter a valid JSON array before forecasting.', variant: 'destructive' }); return Promise.resolve(null); }
  };
  const metric = () => run('metric', () => api.get(`/medcore-adoption/metrics/${encodeURIComponent(metricKey)}`));
  const createHandoff = async () => {
    if (!transcript.trim()) return;
    await run('handoff', () => api.post('/medcore-adoption/agent-handoffs', { transcript, handoffReason: 'Operator requested clinical review' }));
    setTranscript(''); await loadQueue();
  };
  const updateHandoff = async (id: number, status: string) => {
    await run(`handoff-${id}`, () => api.patch(`/medcore-adoption/agent-handoffs/${id}`, { status }));
    await loadQueue();
  };

  return <main className="container mx-auto max-w-7xl space-y-6 p-6">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="text-sm font-medium text-primary">Clean-room capability surface</p><h1 className="text-3xl font-semibold tracking-tight">MedCore workbench</h1><p className="mt-1 max-w-3xl text-muted-foreground">One operator surface for triage, safety, human handoff, lab explanation, adherence and pharmacy forecasting. Clinical outputs remain approval-gated.</p></div>
      <Badge variant={featureState === 'disabled' ? 'secondary' : 'default'}>{featureState === 'disabled' ? 'Feature flag disabled' : 'API surface ready'}</Badge>
    </header>

    <Card><CardHeader><CardTitle>Human handoff queue</CardTitle></CardHeader><CardContent className="space-y-4">
      <div className="space-y-2"><Label htmlFor="handoff-transcript">Conversation transcript</Label><Textarea id="handoff-transcript" value={transcript} onChange={(event) => setTranscript(event.target.value)} placeholder="Paste or dictate a conversation that needs clinical review" /><Button onClick={createHandoff} disabled={!transcript.trim()}>Send to clinical queue</Button></div>
      <div className="flex items-center justify-between"><p className="text-sm text-muted-foreground">{loadingQueue ? 'Loading…' : `${handoffs.length} pending handoff${handoffs.length === 1 ? '' : 's'}`}</p><Button variant="outline" size="sm" onClick={loadQueue}>Refresh</Button></div>
      <div className="grid gap-3 md:grid-cols-2">{handoffs.map((handoff) => <div key={handoff.id} className="rounded-lg border p-4"><div className="mb-2 flex items-center justify-between"><strong>Handoff #{handoff.id}</strong><Badge variant="outline">{handoff.status}</Badge></div><p className="whitespace-pre-wrap text-sm">{handoff.transcript || handoff.handoff_reason || 'No transcript'}</p>{handoff.red_flags?.length ? <p className="mt-2 text-sm text-destructive">Red flags: {JSON.stringify(handoff.red_flags)}</p> : null}<div className="mt-3 flex gap-2"><Button size="sm" onClick={() => updateHandoff(handoff.id, 'claimed')}>Claim</Button><Button size="sm" variant="outline" onClick={() => updateHandoff(handoff.id, 'completed')}>Complete</Button></div></div>)}{!handoffs.length && <p className="text-sm text-muted-foreground">No pending handoffs.</p>}</div>
    </CardContent></Card>

    <div className="grid gap-6 lg:grid-cols-2">
      <Card><CardHeader><CardTitle>Multilingual triage</CardTitle></CardHeader><CardContent className="space-y-3"><Label htmlFor="triage-language">Language</Label><select id="triage-language" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={triageLanguage} onChange={(event) => setTriageLanguage(event.target.value)}><option value="en">English</option><option value="hi">Hindi</option><option value="ta">Tamil</option><option value="te">Telugu</option><option value="bn">Bengali</option><option value="mr">Marathi</option><option value="kn">Kannada</option><option value="ml">Malayalam</option></select><Label htmlFor="triage-symptoms">Symptoms</Label><Textarea id="triage-symptoms" value={triageSymptoms} onChange={(event) => setTriageSymptoms(event.target.value)} placeholder="Describe symptoms" /><Button onClick={submitTriage} disabled={!triageSymptoms.trim()}>Assess and route</Button><ResultPanel result={results.triage} /></CardContent></Card>
      <Card><CardHeader><CardTitle>Prescription safety sign-off</CardTitle></CardHeader><CardContent className="space-y-3"><Label htmlFor="medications">Medications (comma separated)</Label><Input id="medications" value={medications} onChange={(event) => setMedications(event.target.value)} /><p className="text-xs text-muted-foreground">A contraindicated result must be explicitly acknowledged and audited before sign-off.</p><Button onClick={checkSafety}>Run safety check</Button><ResultPanel result={results.safety} /></CardContent></Card>
      <Card><CardHeader><CardTitle>Lab report explainer (doctor approval)</CardTitle></CardHeader><CardContent className="space-y-3"><Label htmlFor="lab-report">Report JSON</Label><Textarea id="lab-report" className="min-h-32 font-mono text-xs" value={report} onChange={(event) => setReport(event.target.value)} /><Button onClick={createDraft}>Create pending draft</Button><ResultPanel result={results.lab} /></CardContent></Card>
      <Card><CardHeader><CardTitle>Medication adherence plan</CardTitle></CardHeader><CardContent className="space-y-3"><Label htmlFor="patient-id">Patient ID</Label><Input id="patient-id" value={patientId} onChange={(event) => setPatientId(event.target.value)} placeholder="Patient UID" /><Label htmlFor="medication-json">Medication JSON</Label><Textarea id="medication-json" className="min-h-24 font-mono text-xs" value={medication} onChange={(event) => setMedication(event.target.value)} /><Button onClick={createPlan} disabled={!patientId.trim()}>Create reminder plan</Button><ResultPanel result={results.adherence} /></CardContent></Card>
      <Card><CardHeader><CardTitle>Pharmacy demand forecast</CardTitle></CardHeader><CardContent className="space-y-3"><Label htmlFor="item-id">Item ID</Label><Input id="item-id" value={itemId} onChange={(event) => setItemId(event.target.value)} /><Label htmlFor="history-json">Monthly history JSON</Label><Textarea id="history-json" className="min-h-24 font-mono text-xs" value={history} onChange={(event) => setHistory(event.target.value)} /><Button onClick={forecast} disabled={!itemId.trim()}>Forecast demand</Button><ResultPanel result={results.forecast} /></CardContent></Card>
      <Card><CardHeader><CardTitle>Metric integrity</CardTitle></CardHeader><CardContent className="space-y-3"><Label htmlFor="metric-key">Metric key</Label><Input id="metric-key" value={metricKey} onChange={(event) => setMetricKey(event.target.value)} /><p className="text-xs text-muted-foreground">Unavailable metrics stay unavailable; the UI never turns missing data into zero.</p><Button onClick={metric} disabled={!metricKey.trim()}>Read metric</Button><ResultPanel result={results.metric} /></CardContent></Card>
    </div>
  </main>;
}
