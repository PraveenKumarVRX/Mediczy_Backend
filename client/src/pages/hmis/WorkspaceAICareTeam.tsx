import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Brain, CheckCircle2, Loader2, RefreshCw, ShieldCheck, Sparkles, XCircle } from 'lucide-react';
import ClinicalShell from '@/layouts/ClinicalShell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { HEALTH_OS } from '@/config/brand';
import { useClinicalPaths } from '@/hooks/useClinicalPaths';
import {
  getAdmissionBriefing,
  getCoordinatorAlerts,
  getLivingWorkspace,
  getMeshAgents,
  runCoordinatorAnalysis,
  type MeshAgent,
} from '@/services/careos.service';
import { getBillingSummary, getLabSummary, getRadiologySummary, getResearchBriefing } from '@/services/hospitalOs.service';

const agentTone: Record<string, string> = {
  active: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  partial: 'bg-amber-50 text-amber-700 border-amber-200',
  planned: 'bg-slate-50 text-slate-600 border-slate-200',
};

const severityTone: Record<string, string> = {
  critical: 'border-red-300 bg-red-50 text-red-800',
  warning: 'border-amber-300 bg-amber-50 text-amber-800',
  info: 'border-slate-200 bg-white text-slate-700',
};

export default function WorkspaceAICareTeam() {
  const { patientId } = useParams<{ patientId: string }>();
  const pid = Number(patientId);
  const navigate = useNavigate();
  const paths = useClinicalPaths();
  const [workspace, setWorkspace] = useState<any>(null);
  const [agents, setAgents] = useState<MeshAgent[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [results, setResults] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!pid) return;
    setLoading(true);
    try {
      const [workspaceRes, agentsRes, alertsRes] = await Promise.all([
        getLivingWorkspace(pid),
        getMeshAgents(),
        getCoordinatorAlerts(pid),
      ]);
      setWorkspace(workspaceRes?.data || null);
      setAgents(agentsRes?.data || []);
      setAlerts(alertsRes?.data || []);
    } finally {
      setLoading(false);
    }
  }, [pid]);

  useEffect(() => { load(); }, [load]);

  const patientName = workspace?.patient
    ? `${workspace.patient.first_name || ''} ${workspace.patient.last_name || ''}`.trim()
    : `Patient ${patientId}`;

  const runners = useMemo<Record<string, (id: number) => Promise<{ data?: any }>>>(() => ({
    clinical: getAdmissionBriefing,
    monitoring: async (id) => runCoordinatorAnalysis(id),
    research: getResearchBriefing,
    radiology: getRadiologySummary,
    laboratory: getLabSummary,
    billing: getBillingSummary,
  }), []);

  const runAgent = async (agentId: string) => {
    const runner = runners[agentId];
    if (!runner) return;
    setRunning(agentId);
    try {
      const res = await runner(pid);
      const data = res?.data;
      const text = data?.briefing || data?.summary || data?.message || data?.body || JSON.stringify(data, null, 2);
      setResults((prev) => ({ ...prev, [agentId]: text || 'Agent completed with no narrative output.' }));
      if (agentId === 'monitoring') {
        const latest = await getCoordinatorAlerts(pid);
        setAlerts(latest?.data || []);
      }
    } catch (e: any) {
      setResults((prev) => ({ ...prev, [agentId]: e?.response?.data?.error || e?.message || 'Agent failed.' }));
    } finally {
      setRunning(null);
    }
  };

  const runAllInvokable = async () => {
    for (const agent of agents.filter((item) => item.invokable || item.id === 'monitoring')) {
      await runAgent(agent.id);
    }
  };

  return (
    <Tabs defaultValue="agents">
      <ClinicalShell
        onBack={() => navigate(-1)}
        title={patientName}
        subtitle="AI Care Team"
        badges={<Badge className="bg-teal-600">{HEALTH_OS.brandLine}</Badge>}
        loading={loading && !agents.length}
        loadingLabel="Loading AI care team..."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={load}>
              <RefreshCw className="h-4 w-4 mr-1" /> Refresh
            </Button>
            <Button size="sm" onClick={runAllInvokable} disabled={!!running}>
              {running ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}
              Run available agents
            </Button>
            <Button variant="secondary" size="sm" asChild>
              <Link to={paths.patientHealthos(String(patientId))}>Workspace</Link>
            </Button>
          </>
        }
        rail={
          <TabsList className="flex md:flex-col flex-wrap md:flex-nowrap h-auto w-full gap-1 bg-transparent p-0 items-stretch justify-start">
            <TabsTrigger className="justify-start w-full" value="agents">AI Agents</TabsTrigger>
            <TabsTrigger className="justify-start w-full" value="recommendations">Recommendations</TabsTrigger>
            <TabsTrigger className="justify-start w-full" value="audit">Activity Log</TabsTrigger>
          </TabsList>
        }
      >
        <TabsContent value="agents" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Brain className="h-4 w-4" /> Care Intelligence Mesh
              </CardTitle>
            </CardHeader>
            <CardContent className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
              {agents.map((agent) => (
                <div key={agent.id} className="rounded-lg border p-3 text-sm space-y-3 bg-white">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">{agent.icon} {agent.name}</p>
                      <p className="text-xs text-muted-foreground mt-1">{agent.description}</p>
                    </div>
                    <Badge variant="outline" className={agentTone[agent.status] || agentTone.planned}>{agent.status}</Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground">{agent.trigger}</p>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={(!agent.invokable && agent.id !== 'monitoring') || running === agent.id}
                      onClick={() => runAgent(agent.id)}
                    >
                      {running === agent.id ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 mr-1" />}
                      Run
                    </Button>
                    <Badge variant="secondary" className="text-[10px]">
                      <ShieldCheck className="h-3 w-3 mr-1" /> Human approval
                    </Badge>
                  </div>
                  {results[agent.id] && (
                    <div className="rounded-md bg-slate-50 border p-2 text-xs whitespace-pre-wrap">
                      {results[agent.id]}
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="recommendations" className="space-y-3">
          {alerts.map((alert) => (
            <Card key={alert.id} className={severityTone[alert.severity] || severityTone.info}>
              <CardContent className="pt-4 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{alert.alert_type || 'clinical'}</Badge>
                  <Badge variant="secondary">SaMD review</Badge>
                  <span className="text-xs text-muted-foreground">{new Date(alert.created_at).toLocaleString()}</span>
                </div>
                <p className="text-sm font-medium">{alert.message}</p>
                <div className="grid sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <div className="flex justify-between mb-1"><span>Confidence</span><span>78%</span></div>
                    <Progress value={78} className="h-2" />
                  </div>
                  <div>
                    <div className="flex justify-between mb-1"><span>Data completeness</span><span>91%</span></div>
                    <Progress value={91} className="h-2" />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary"><CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Approve</Button>
                  <Button size="sm" variant="outline">Modify</Button>
                  <Button size="sm" variant="ghost"><XCircle className="h-3.5 w-3.5 mr-1" /> Dismiss</Button>
                </div>
              </CardContent>
            </Card>
          ))}
          {!alerts.length && (
            <Card><CardContent className="pt-6 text-sm text-muted-foreground">No active AI recommendations for this patient.</CardContent></Card>
          )}
        </TabsContent>

        <TabsContent value="audit">
          <Card>
            <CardHeader><CardTitle className="text-base">Agent Activity Log</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {Object.entries(results).map(([agentId, output]) => (
                <div key={agentId} className="rounded-md border p-3">
                  <p className="font-medium">{agents.find((agent) => agent.id === agentId)?.name || agentId}</p>
                  <p className="text-xs text-muted-foreground whitespace-pre-wrap mt-1">{output}</p>
                </div>
              ))}
              {!Object.keys(results).length && <p className="text-muted-foreground">Run an agent to populate the local activity log.</p>}
            </CardContent>
          </Card>
        </TabsContent>
      </ClinicalShell>
    </Tabs>
  );
}
