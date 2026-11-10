import { useCallback, useEffect, useState } from 'react';
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
type FeatureState = 'checking' | 'ready' | 'disabled' | 'auth_required';

const initialReport = JSON.stringify({
  test: 'Haemoglobin', value: 12.4, unit: 'g/dL', referenceRange: '12-16', flag: 'normal',
}, null, 2);
const initialHistory = JSON.stringify([
  { date: '2026-08-01', quantity: 20 }, { date: '2026-09-01', quantity: 24 }, { date: '2026-10-01', quantity: 22 },
], null, 2);

function ResultPanel({ result }: { result: Result | null }) {
  if (!result) return null;
  const failed = result.success === false || Boolean(result.code && result.code !== 'ok');
  return <div className="space-y-2" role={failed ? 'alert' : 'status'} aria-live="polite">
    <p className={`text-xs font-medium ${failed ? 'text-destructive' : 'text-muted-foreground'}`}>{failed ? 'Request was not completed' : 'Operation result'}</p>
    <pre className="max-h-64 overflow-auto rounded-md bg-muted p-3 text-xs" aria-label="Operation result">{JSON.stringify(result, null, 2)}</pre>
  </div>;
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
  const [adherenceSchedule, setAdherenceSchedule] = useState('{"timeZone":"Asia/Kolkata","startDate":"2026-11-08","endDate":"2026-12-07","times":["08:00"],"recurrence":"daily"}');
  const [itemId, setItemId] = useState('medicine-1');
  const [history, setHistory] = useState(initialHistory);
  const [metricKey, setMetricKey] = useState('triage_routing_accuracy');
  const [results, setResults] = useState<Record<string, Result | null>>({});
  const [featureState, setFeatureState] = useState<FeatureState>('checking');
  const [queueError, setQueueError] = useState('');
  const [running, setRunning] = useState<Record<string, boolean>>({});

  const run = useCallback(async (key: string, operation: () => Promise<{ data: Result }>) => {
    setRunning((current) => ({ ...current, [key]: true }));
    try {
      const response = await operation();
      setResults((current) => ({ ...current, [key]: response.data }));
      if (response.data?.code === 'feature_disabled') setFeatureState('disabled');
      else if (response.data?.success !== false) setFeatureState('ready');
      return response.data;
    } catch (error: any) {
      const data = error?.response?.data || { success: false, code: 'request_failed', message: error?.message || 'Request failed' };
      setResults((current) => ({ ...current, [key]: data }));
      if (data.code === 'feature_disabled') setFeatureState('disabled');
      else if (error?.response?.status === 401 || data.code === 'unauthenticated') setFeatureState('auth_required');
      toast({ title: 'AI capability unavailable', description: data.message || data.code || 'Request failed', variant: 'destructive' });
      return data;
    } finally {
      setRunning((current) => ({ ...current, [key]: false }));
    }
  }, [toast]);

  const loadQueue = useCallback(async () => {
    setLoadingQueue(true);
    setQueueError('');
    setFeatureState((current) => current === 'ready' ? current : 'checking');
    try {
      const response = await api.get('/medcore-adoption/agent-handoffs?status=pending');
      setResults((current) => ({ ...current, capability: { success: true } }));
      setFeatureState('ready');
      setHandoffs(response.data?.handoffs || []);
    } catch (error: any) {
      const data = error?.response?.data;
      if (data?.code === 'feature_disabled') {
        setFeatureState('disabled');
        setResults((current) => ({ ...current, capability: data }));
      } else if (error?.response?.status === 401 || data?.code === 'unauthenticated') {
        setFeatureState('auth_required');
        setQueueError('Sign in with a team account to load the clinical handoff queue.');
      } else {
        // Queue access is role-scoped. A reviewer permission error should not disable
        // the other AI actions for an authenticated team member.
        setFeatureState('ready');
        setQueueError(data?.message || 'The handoff queue is unavailable for this role.');
      }
    } finally { setLoadingQueue(false); }
  }, [toast]);

  useEffect(() => { loadQueue(); }, [loadQueue]);

  const isBusy = (key: string) => Boolean(running[key]);
  const actionsDisabled = featureState === 'checking' || featureState === 'disabled' || featureState === 'auth_required';
  const parseJson = (value: string, label: string, array = false) => {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || (array ? !Array.isArray(parsed) : Array.isArray(parsed))) {
      throw new Error(`${label} must be a JSON ${array ? 'array' : 'object'}.`);
    }
    return parsed;
  };

  const submitTriage = () => run('triage', () => api.post('/medcore-adoption/triage', { symptoms: triageSymptoms, language: triageLanguage }));
  const checkSafety = () => run('safety', () => api.post('/medcore-adoption/drug-safety/signoff', { medications: medications.split(',').map((name) => name.trim()).filter(Boolean) }));
  const createDraft = () => {
    try { return run('lab', () => api.post('/medcore-adoption/lab-explainer/drafts', { report: parseJson(report, 'Report') })); }
    catch (error: any) { toast({ title: 'Invalid report JSON', description: error.message, variant: 'destructive' }); return Promise.resolve(null); }
  };
  const createPlan = () => {
    try {
      return run('adherence', () => api.post('/medcore-adoption/adherence/plans', {
        patientId: patientId.trim(),
        medication: parseJson(medication, 'Medication'),
        schedule: parseJson(adherenceSchedule, 'Schedule'),
      }));
    } catch (error: any) { toast({ title: 'Invalid reminder plan JSON', description: error.message, variant: 'destructive' }); return Promise.resolve(null); }
  };
  const forecast = () => {
    try { return run('forecast', () => api.post('/medcore-adoption/pharmacy/forecast', { itemId: itemId.trim(), history: parseJson(history, 'History', true) })); }
    catch (error: any) { toast({ title: 'Invalid history JSON', description: error.message, variant: 'destructive' }); return Promise.resolve(null); }
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

  const stateLabel = featureState === 'checking' ? 'Checking access' : featureState === 'disabled' ? 'Feature flag disabled' : featureState === 'auth_required' ? 'Sign-in required' : 'API surface ready';

  return <main className="container mx-auto max-w-7xl space-y-6 p-6">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="text-sm font-medium text-primary">AI operations workspace</p><h1 className="text-3xl font-semibold tracking-tight">AI Workbench</h1><p className="mt-1 max-w-3xl text-muted-foreground">One operator surface for triage, safety, human handoff, lab explanation, adherence and pharmacy forecasting. Clinical outputs remain approval-gated.</p></div>
      <Badge variant={featureState === 'ready' ? 'default' : 'secondary'} aria-live="polite">{stateLabel}</Badge>
    </header>
    <div className="rounded-lg border bg-muted/40 p-4 text-sm" role="status" aria-live="polite">
      {featureState === 'checking' && 'Checking AI capability access…'}
      {featureState === 'disabled' && 'AI workflows are disabled by the production feature flag. No clinical operation will be submitted.'}
      {featureState === 'auth_required' && 'Sign in with an authorized team or clinical account to use AI workflows.'}
      {featureState === 'ready' && 'AI results are advisory. Clinical review, approval and audit remain required before patient delivery.'}
    </div>

    <Card><CardHeader><CardTitle>Human handoff queue</CardTitle></CardHeader><CardContent className="space-y-4">
      <div className="space-y-2"><Label htmlFor="handoff-transcript">Conversation transcript</Label><Textarea id="handoff-transcript" value={transcript} onChange={(event) => setTranscript(event.target.value)} placeholder="Paste or dictate a conversation that needs clinical review" /><Button onClick={createHandoff} disabled={actionsDisabled || !transcript.trim() || isBusy('handoff')}>{isBusy('handoff') ? 'Sending…' : 'Send to clinical queue'}</Button></div>
      <div className="flex items-center justify-between"><p className="text-sm text-muted-foreground">{loadingQueue ? 'Loading…' : `${handoffs.length} pending handoff${handoffs.length === 1 ? '' : 's'}`}</p><Button variant="outline" size="sm" onClick={loadQueue} disabled={loadingQueue}>{loadingQueue ? 'Refreshing…' : 'Refresh'}</Button></div>
      {queueError && <p className="text-sm text-amber-700" role="status">{queueError}</p>}
      <div className="grid gap-3 md:grid-cols-2">{handoffs.map((handoff) => <div key={handoff.id} className="rounded-lg border p-4"><div className="mb-2 flex items-center justify-between"><strong>Handoff #{handoff.id}</strong><Badge variant="outline">{handoff.status}</Badge></div><p className="whitespace-pre-wrap text-sm">{handoff.transcript || handoff.handoff_reason || 'No transcript'}</p>{handoff.red_flags?.length ? <p className="mt-2 text-sm text-destructive">Red flags: {JSON.stringify(handoff.red_flags)}</p> : null}<div className="mt-3 flex gap-2"><Button size="sm" onClick={() => updateHandoff(handoff.id, 'claimed')} disabled={actionsDisabled || isBusy(`handoff-${handoff.id}`)}>{isBusy(`handoff-${handoff.id}`) ? 'Updating…' : 'Claim'}</Button><Button size="sm" variant="outline" onClick={() => updateHandoff(handoff.id, 'completed')} disabled={actionsDisabled || isBusy(`handoff-${handoff.id}`)}>Complete</Button></div></div>)}{!handoffs.length && <p className="text-sm text-muted-foreground">No pending handoffs.</p>}</div>
    </CardContent></Card>

    <div className="grid gap-6 lg:grid-cols-2">
      <Card><CardHeader><CardTitle>Multilingual triage</CardTitle></CardHeader><CardContent className="space-y-3"><Label htmlFor="triage-language">Language</Label><select id="triage-language" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={triageLanguage} onChange={(event) => setTriageLanguage(event.target.value)}><option value="en">English</option><option value="hi">Hindi</option><option value="ta">Tamil</option><option value="te">Telugu</option><option value="bn">Bengali</option><option value="mr">Marathi</option><option value="kn">Kannada</option><option value="ml">Malayalam</option></select><Label htmlFor="triage-symptoms">Symptoms</Label><Textarea id="triage-symptoms" value={triageSymptoms} onChange={(event) => setTriageSymptoms(event.target.value)} placeholder="Describe symptoms" /><Button onClick={submitTriage} disabled={actionsDisabled || !triageSymptoms.trim() || isBusy('triage')}>{isBusy('triage') ? 'Assessing…' : 'Assess and route'}</Button><ResultPanel result={results.triage} /></CardContent></Card>
      <Card><CardHeader><CardTitle>Prescription safety sign-off</CardTitle></CardHeader><CardContent className="space-y-3"><Label htmlFor="medications">Medications (comma separated)</Label><Input id="medications" value={medications} onChange={(event) => setMedications(event.target.value)} /><p className="text-xs text-muted-foreground">A contraindicated result must be explicitly acknowledged and audited before sign-off.</p><Button onClick={checkSafety} disabled={actionsDisabled || isBusy('safety')}>{isBusy('safety') ? 'Checking…' : 'Run safety check'}</Button><ResultPanel result={results.safety} /></CardContent></Card>
      <Card><CardHeader><CardTitle>Lab report explainer (doctor approval)</CardTitle></CardHeader><CardContent className="space-y-3"><Label htmlFor="lab-report">Report JSON</Label><Textarea id="lab-report" className="min-h-32 font-mono text-xs" value={report} onChange={(event) => setReport(event.target.value)} /><Button onClick={createDraft} disabled={actionsDisabled || isBusy('lab')}>{isBusy('lab') ? 'Creating…' : 'Create pending draft'}</Button><ResultPanel result={results.lab} /></CardContent></Card>
      <Card><CardHeader><CardTitle>Medication adherence plan</CardTitle></CardHeader><CardContent className="space-y-3"><Label htmlFor="patient-id">Patient ID</Label><Input id="patient-id" value={patientId} onChange={(event) => setPatientId(event.target.value)} placeholder="Patient UID" /><Label htmlFor="medication-json">Medication JSON</Label><Textarea id="medication-json" className="min-h-24 font-mono text-xs" value={medication} onChange={(event) => setMedication(event.target.value)} /><Label htmlFor="adherence-schedule-json">Schedule JSON</Label><Textarea id="adherence-schedule-json" className="min-h-28 font-mono text-xs" value={adherenceSchedule} onChange={(event) => setAdherenceSchedule(event.target.value)} /><p className="text-xs text-muted-foreground">A daily plan requires an IANA timezone, start/end dates, and one or more local HH:MM times. The server materializes each occurrence before confirming creation.</p><Button onClick={createPlan} disabled={actionsDisabled || !patientId.trim() || isBusy('adherence')}>{isBusy('adherence') ? 'Creating…' : 'Create reminder plan'}</Button><ResultPanel result={results.adherence} /></CardContent></Card>
      <Card><CardHeader><CardTitle>Pharmacy demand forecast</CardTitle></CardHeader><CardContent className="space-y-3"><Label htmlFor="item-id">Item ID</Label><Input id="item-id" value={itemId} onChange={(event) => setItemId(event.target.value)} /><Label htmlFor="history-json">Monthly history JSON</Label><Textarea id="history-json" className="min-h-24 font-mono text-xs" value={history} onChange={(event) => setHistory(event.target.value)} /><Button onClick={forecast} disabled={actionsDisabled || !itemId.trim() || isBusy('forecast')}>{isBusy('forecast') ? 'Forecasting…' : 'Forecast demand'}</Button><ResultPanel result={results.forecast} /></CardContent></Card>
      <Card><CardHeader><CardTitle>Metric integrity</CardTitle></CardHeader><CardContent className="space-y-3"><Label htmlFor="metric-key">Metric key</Label><Input id="metric-key" value={metricKey} onChange={(event) => setMetricKey(event.target.value)} /><p className="text-xs text-muted-foreground">Unavailable metrics stay unavailable; the UI never turns missing data into zero.</p><Button onClick={metric} disabled={actionsDisabled || !metricKey.trim() || isBusy('metric')}>{isBusy('metric') ? 'Reading…' : 'Read metric'}</Button><ResultPanel result={results.metric} /></CardContent></Card>
    </div>
  </main>;
}
