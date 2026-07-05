import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import {
  ArrowLeft, RefreshCw, Activity, Users, ListTodo, Brain, Route, PlayCircle,
  Video, Sparkles, Clock, AlertTriangle, CheckCircle2, Loader2,
} from 'lucide-react';
import { HEALTH_OS } from '@/config/brand';
import {
  getLivingWorkspace,
  runCoordinatorAnalysis,
  autoInviteMDT,
  startClinicalBoard,
  getClinicalPlayback,
  createCareTask,
  updateCareTask,
  getClinicalCallToken,
  recordMDTOpinion,
  getMDTConsensus,
  joinMDT,
  publishFamilyUpdate,
  listFamilyUpdates,
  syncFhirLabs,
  listPatientImaging,
} from '@/services/careos.service';
import { useClinicalPaths } from '@/hooks/useClinicalPaths';

const SEVERITY_STYLE: Record<string, string> = {
  critical: 'border-l-red-500 bg-red-50',
  warning: 'border-l-amber-500 bg-amber-50',
  info: 'border-l-slate-300 bg-white',
};

export default function LivingPatientWorkspace() {
  const { patientId } = useParams<{ patientId: string }>();
  const navigate = useNavigate();
  const paths = useClinicalPaths();
  const pid = Number(patientId);

  const [workspace, setWorkspace] = useState<any>(null);
  const [playback, setPlayback] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newTask, setNewTask] = useState('');
  const [callInfo, setCallInfo] = useState<any>(null);
  const [mdtSession, setMdtSession] = useState<any>(null);
  const [mdtConsensus, setMdtConsensus] = useState<any>(null);
  const [mdtOpinion, setMdtOpinion] = useState({ role: '', text: '', rec: '' });
  const [familyTitle, setFamilyTitle] = useState('');
  const [familyBody, setFamilyBody] = useState('');
  const [familyUpdates, setFamilyUpdates] = useState<any[]>([]);
  const [imagingStudies, setImagingStudies] = useState<any[]>([]);

  const load = useCallback(async () => {
    if (!pid) return;
    setLoading(true);
    try {
      const res = await getLivingWorkspace(pid);
      setWorkspace(res?.data || null);
      setError(null);
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || 'Failed to load HealthOS workspace');
    } finally {
      setLoading(false);
    }
  }, [pid]);

  useEffect(() => { load(); }, [load]);

  const runCoordinator = async () => {
    setActionLoading('coordinator');
    try {
      await runCoordinatorAnalysis(pid);
      await load();
    } finally {
      setActionLoading(null);
    }
  };

  const inviteMDT = async () => {
    setActionLoading('mdt');
    try {
      await autoInviteMDT(pid, workspace?.diagnosis || workspace?.admission?.diagnosis || 'complex case');
      await load();
    } finally {
      setActionLoading(null);
    }
  };

  const startBoard = async () => {
    setActionLoading('board');
    try {
      const res = await startClinicalBoard(pid, `Clinical Board — Patient ${pid}`);
      setMdtSession(res?.data);
      await load();
    } finally {
      setActionLoading(null);
    }
  };

  const submitOpinion = async () => {
    if (!mdtSession?.id || !mdtOpinion.text) return;
    await recordMDTOpinion(mdtSession.id, { specialistRole: mdtOpinion.role || 'specialist', opinion: mdtOpinion.text, recommendation: mdtOpinion.rec });
    const c = await getMDTConsensus(mdtSession.id);
    setMdtConsensus(c?.data);
  };

  const loadFamily = async () => {
    const res = await listFamilyUpdates(pid);
    setFamilyUpdates(res?.data || []);
  };

  const publishFamily = async () => {
    if (!familyTitle.trim() || !familyBody.trim()) return;
    await publishFamilyUpdate(pid, { title: familyTitle, body: familyBody, visibleToFamily: true });
    setFamilyTitle('');
    setFamilyBody('');
    await loadFamily();
  };

  const syncLabs = async () => {
    setActionLoading('labs');
    try {
      await syncFhirLabs(pid);
      await load();
    } finally { setActionLoading(null); }
  };

  const loadPlayback = async () => {
    setActionLoading('playback');
    try {
      const res = await getClinicalPlayback(pid, 48);
      setPlayback(res?.data || null);
    } finally {
      setActionLoading(null);
    }
  };

  const addTask = async () => {
    if (!newTask.trim()) return;
    setActionLoading('task');
    try {
      await createCareTask(pid, { title: newTask.trim(), priority: 'normal' });
      setNewTask('');
      await load();
    } finally {
      setActionLoading(null);
    }
  };

  const completeTask = async (taskId: number) => {
    await updateCareTask(taskId, 'completed');
    await load();
  };

  const joinCall = async () => {
    setActionLoading('call');
    try {
      const res = await getClinicalCallToken(pid);
      setCallInfo(res?.data || null);
    } finally {
      setActionLoading(null);
    }
  };

  const patientName = workspace?.patient
    ? `${workspace.patient.first_name || ''} ${workspace.patient.last_name || ''}`.trim()
  : `Patient ${patientId}`;

  const timeline = workspace?.sections?.timeline?.events || [];
  const pathway = workspace?.pathway;
  const tasks = workspace?.sections?.tasks || [];
  const alerts = workspace?.sections?.ai?.coordinatorAlerts || [];
  const team = workspace?.careTeam?.members || [];

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}><ArrowLeft className="h-4 w-4" /></Button>
          <div className="flex-1 min-w-[200px]">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-slate-800">{patientName}</h1>
              <Badge className="bg-teal-600">{HEALTH_OS.brandLine}</Badge>
            </div>
            <p className="text-sm text-slate-500">Living Patient Workspace</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </Button>
            <Button size="sm" onClick={joinCall} disabled={actionLoading === 'call'}>
              <Video className="h-4 w-4 mr-1" /> One-touch Call
            </Button>
            <Button variant="secondary" size="sm" asChild>
              <Link to={paths.healthosHub}>
                <Brain className="h-4 w-4 mr-1" /> HealthOS Platform
              </Link>
            </Button>
          </div>
        </div>

        {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{error}</div>}
        {callInfo && (
          <Card className="border-teal-200 bg-teal-50">
            <CardContent className="pt-4 text-sm">
              {callInfo.configured
                ? <span>LiveKit room <strong>{callInfo.room}</strong> ready — connect with your video client.</span>
                : <span>{callInfo.message}</span>}
            </CardContent>
          </Card>
        )}

        {loading && !workspace ? (
          <div className="flex items-center justify-center py-20 text-slate-500">
            <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading workspace…
          </div>
        ) : (
          <Tabs defaultValue="overview">
            <TabsList className="flex flex-wrap h-auto gap-1">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="timeline">Clinical Timeline</TabsTrigger>
              <TabsTrigger value="team">Care Team</TabsTrigger>
              <TabsTrigger value="pathway">Treatment Pathway</TabsTrigger>
              <TabsTrigger value="tasks">Tasks</TabsTrigger>
              <TabsTrigger value="playback">Clinical Playback</TabsTrigger>
              <TabsTrigger value="ecosystem" onClick={() => listPatientImaging(pid).then((r) => setImagingStudies(r?.data || [])).catch(() => {})}>Ecosystem</TabsTrigger>
              <TabsTrigger value="mdt">Clinical Board</TabsTrigger>
              <TabsTrigger value="family" onClick={() => loadFamily()}>Family</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-4">
              <div className="grid md:grid-cols-3 gap-4">
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Activity className="h-4 w-4" /> Live Vitals</CardTitle></CardHeader>
                  <CardContent className="text-sm space-y-1">
                    {(workspace?.sections?.liveVitals || []).slice(0, 5).map((v: any, i: number) => (
                      <div key={i} className="flex justify-between"><span>{v.label || v.type}</span><span className="font-medium">{v.value} {v.unit}</span></div>
                    ))}
                    {!workspace?.sections?.liveVitals?.length && <p className="text-muted-foreground">No vitals in workspace</p>}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Sparkles className="h-4 w-4" /> AI Coordinator</CardTitle></CardHeader>
                  <CardContent className="space-y-2">
                    {alerts.slice(0, 3).map((a: any) => (
                      <div key={a.id} className={`text-xs p-2 rounded border-l-4 ${SEVERITY_STYLE[a.severity] || SEVERITY_STYLE.info}`}>
                        {a.message}
                      </div>
                    ))}
                    {!alerts.length && <p className="text-sm text-muted-foreground">No active coordinator alerts</p>}
                    <Button size="sm" variant="outline" onClick={runCoordinator} disabled={actionLoading === 'coordinator'}>
                      {actionLoading === 'coordinator' ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Run analysis'}
                    </Button>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Route className="h-4 w-4" /> Current Goal</CardTitle></CardHeader>
                  <CardContent>
                    <p className="font-medium text-sm">{pathway?.current_goal || 'Stabilize clinical status'}</p>
                    <Progress value={pathway?.current_progress || 0} className="mt-2 h-2" />
                    <p className="text-xs text-muted-foreground mt-1">{pathway?.current_progress || 0}% complete</p>
                  </CardContent>
                </Card>
              </div>

              {workspace?.sections?.ai?.similarCases?.prompt && (
                <Card className="border-violet-200 bg-violet-50">
                  <CardContent className="pt-4 flex items-start gap-2 text-sm">
                    <AlertTriangle className="h-4 w-4 text-violet-600 mt-0.5 shrink-0" />
                    <span><strong>Hospital Memory:</strong> {workspace.sections.ai.similarCases.prompt}</span>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="timeline">
              <Card>
                <CardHeader><CardTitle className="text-base flex items-center gap-2"><Clock className="h-4 w-4" /> Clinical Timeline</CardTitle></CardHeader>
                <CardContent className="space-y-3 max-h-[600px] overflow-y-auto">
                  {timeline.length === 0 && <p className="text-sm text-muted-foreground">No events yet — timeline replaces chat. Every clinical event is searchable forever.</p>}
                  {timeline.map((e: any) => (
                    <div key={e.id} className={`border-l-4 pl-3 py-2 rounded-r ${SEVERITY_STYLE[e.severity] || SEVERITY_STYLE.info}`}>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{new Date(e.event_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        <Badge variant="outline" className="text-[10px]">{e.event_type}</Badge>
                        {e.actor_name && <span>{e.actor_name}</span>}
                      </div>
                      <p className="font-medium text-sm mt-0.5">{e.title}</p>
                      {e.body && <p className="text-sm text-slate-600 mt-1">{e.body}</p>}
                    </div>
                  ))}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="team" className="space-y-4">
              <div className="flex gap-2 flex-wrap">
                <Button size="sm" onClick={inviteMDT} disabled={actionLoading === 'mdt'}>
                  <Users className="h-4 w-4 mr-1" /> AI Auto-invite MDT
                </Button>
                <Button size="sm" variant="secondary" onClick={startBoard} disabled={actionLoading === 'board'}>
                  Start Clinical Board
                </Button>
              </div>
              <Card>
                <CardHeader><CardTitle className="text-base">Dynamic Care Team</CardTitle></CardHeader>
                <CardContent className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {team.map((m: any) => (
                    <div key={m.id} className="border rounded-lg p-3 text-sm">
                      <p className="font-medium">{m.display_name || m.role}</p>
                      <p className="text-xs text-muted-foreground capitalize">{m.role?.replace(/_/g, ' ')}</p>
                      {m.invited_by === 'ai_mdt' && <Badge variant="secondary" className="mt-1 text-[10px]">AI invited</Badge>}
                    </div>
                  ))}
                  {!team.length && <p className="text-sm text-muted-foreground col-span-full">No team members yet</p>}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="pathway">
              <Card>
                <CardHeader><CardTitle className="text-base">Living Treatment Pathway</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <p className="text-sm font-medium">Current: {pathway?.current_goal}</p>
                    <Progress value={pathway?.current_progress || 0} className="mt-2" />
                  </div>
                  <div className="space-y-2">
                    {(pathway?.steps || []).map((s: any, i: number) => (
                      <div key={s.id || i} className="flex items-center gap-3 text-sm border rounded-lg p-3">
                        {s.status === 'completed' ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <div className="h-4 w-4 rounded-full border-2 border-slate-300" />}
                        <span className={s.status === 'in_progress' ? 'font-semibold' : ''}>{s.label}</span>
                        <Badge variant="outline" className="ml-auto text-[10px]">{s.status}</Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="tasks" className="space-y-4">
              <div className="flex gap-2">
                <Input placeholder="New care task…" value={newTask} onChange={(e) => setNewTask(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addTask()} />
                <Button onClick={addTask} disabled={actionLoading === 'task'}>Add</Button>
              </div>
              <Card>
                <CardHeader><CardTitle className="text-base flex items-center gap-2"><ListTodo className="h-4 w-4" /> Tasks</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {tasks.map((t: any) => (
                    <div key={t.id} className="flex items-center gap-2 border rounded-lg p-3 text-sm">
                      <span className={t.status === 'completed' ? 'line-through text-muted-foreground' : ''}>{t.title}</span>
                      <Badge variant="outline" className="ml-auto text-[10px]">{t.status}</Badge>
                      {t.status !== 'completed' && (
                        <Button size="sm" variant="ghost" onClick={() => completeTask(t.id)}>Done</Button>
                      )}
                    </div>
                  ))}
                  {!tasks.length && <p className="text-sm text-muted-foreground">No tasks</p>}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="playback" className="space-y-4">
              <Button onClick={loadPlayback} disabled={actionLoading === 'playback'}>
                <PlayCircle className="h-4 w-4 mr-1" /> Replay last 48 hours
              </Button>
              {playback && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">{playback.replayLabel}</CardTitle>
                    <p className="text-sm text-muted-foreground">{playback.summary}</p>
                  </CardHeader>
                  <CardContent className="space-y-3 max-h-[500px] overflow-y-auto">
                    {(playback.chapters || []).map((c: any, i: number) => (
                      <div key={i} className="flex gap-3 text-sm">
                        <span className="text-muted-foreground shrink-0 w-16">{new Date(c.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        <div>
                          <p className="font-medium">{c.title}</p>
                          {c.detail && <p className="text-slate-600">{c.detail}</p>}
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="ecosystem" className="space-y-4">
              <div className="flex gap-2 flex-wrap">
                <Button size="sm" variant="outline" onClick={syncLabs} disabled={actionLoading === 'labs'}>Sync FHIR labs</Button>
                <Button size="sm" variant="outline" asChild>
                  <Link to={paths.passport(patientId!)}>Medical Passport</Link>
                </Button>
                <Button size="sm" variant="outline" asChild>
                  <Link to={paths.globalBoard(patientId!)}>Global Board</Link>
                </Button>
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                <Card>
                  <CardHeader><CardTitle className="text-base">Labs (Stage 2)</CardTitle></CardHeader>
                  <CardContent className="text-sm space-y-1">
                    {(workspace?.sections?.labs || []).slice(0, 5).map((l: any, i: number) => (
                      <p key={i}>{l.test_name || l.test}: {l.result_value || l.value} {l.result_unit || ''}</p>
                    ))}
                    {!workspace?.sections?.labs?.length && <p className="text-muted-foreground">No lab results synced</p>}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader><CardTitle className="text-base">Pharmacy</CardTitle></CardHeader>
                  <CardContent className="text-sm space-y-1">
                    {(workspace?.sections?.pharmacy || []).map((p: any) => (
                      <p key={p.id}>{p.drug_name} — <Badge variant="outline" className="text-[10px]">{p.status}</Badge></p>
                    ))}
                    {!workspace?.sections?.pharmacy?.length && <p className="text-muted-foreground">No pharmacy orders</p>}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader><CardTitle className="text-base">Wearables</CardTitle></CardHeader>
                  <CardContent className="text-sm">
                    {(workspace?.sections?.monitoring?.summary || []).map((m: any) => (
                      <p key={m.metricType}>{m.metricType}: {m.latest?.value} (avg {Math.round(m.avg)})</p>
                    ))}
                    {!workspace?.sections?.monitoring?.summary?.length && <p className="text-muted-foreground">No wearable data</p>}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader><CardTitle className="text-base">DICOMweb Imaging</CardTitle></CardHeader>
                  <CardContent className="text-sm space-y-1">
                    {imagingStudies.slice(0, 5).map((s: any) => (
                      <p key={s.studyUID || s.id}>
                        {s.modality || 'IMG'} — {s.study_description || s.studyUID}
                        <span className="text-muted-foreground text-xs ml-1">({s.instance_count || 0} instances)</span>
                      </p>
                    ))}
                    {!imagingStudies.length && <p className="text-muted-foreground">No DICOM studies — HyperGrid PACS</p>}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader><CardTitle className="text-base">Medical Passport</CardTitle></CardHeader>
                  <CardContent className="text-sm">
                    {workspace?.medicalPassport ? (
                      <>
                        <p className="font-mono text-xs text-teal-700">{workspace.medicalPassport.careos_patient_id}</p>
                        <p className="text-muted-foreground mt-1">{workspace.medicalPassport.summary_text || 'Synced profile'}</p>
                      </>
                    ) : <p className="text-muted-foreground">Passport not synced</p>}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="mdt" className="space-y-4">
              <div className="flex gap-2">
                <Button onClick={startBoard} disabled={actionLoading === 'board'}>Start Clinical Board</Button>
                {mdtSession && <Button variant="outline" onClick={() => joinMDT(mdtSession.id)}>Join session</Button>}
              </div>
              {mdtSession && (
                <Card>
                  <CardContent className="pt-4 text-sm space-y-3">
                    <p>Session #{mdtSession.id} — Room: {mdtSession.livekit_room}</p>
                    <Input placeholder="Your role" value={mdtOpinion.role} onChange={(e) => setMdtOpinion({ ...mdtOpinion, role: e.target.value })} />
                    <Input placeholder="Opinion" value={mdtOpinion.text} onChange={(e) => setMdtOpinion({ ...mdtOpinion, text: e.target.value })} />
                    <Input placeholder="Recommendation" value={mdtOpinion.rec} onChange={(e) => setMdtOpinion({ ...mdtOpinion, rec: e.target.value })} />
                    <Button onClick={submitOpinion}>Submit opinion</Button>
                    {mdtConsensus?.consensus && (
                      <div className="bg-slate-100 p-3 rounded text-xs">
                        <p><strong>AI Consensus:</strong> {mdtConsensus.consensus.consensusPercent}%</p>
                        <p>{mdtConsensus.consensus.summary}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="family" className="space-y-4">
              <Card>
                <CardHeader><CardTitle className="text-base">Publish family update</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  <Input placeholder="Title" value={familyTitle} onChange={(e) => setFamilyTitle(e.target.value)} />
                  <Input placeholder="Message for family" value={familyBody} onChange={(e) => setFamilyBody(e.target.value)} />
                  <Button onClick={publishFamily}>Publish (clinician-approved)</Button>
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="text-base">Family updates</CardTitle></CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {familyUpdates.map((u) => (
                    <div key={u.id} className="border rounded p-2">
                      <p className="font-medium">{u.title}</p>
                      <p className="text-muted-foreground">{u.body}</p>
                    </div>
                  ))}
                  {!familyUpdates.length && <p className="text-muted-foreground">No updates yet</p>}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  );
}
