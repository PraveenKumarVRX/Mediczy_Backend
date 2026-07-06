import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Activity, Sparkles, Route, AlertTriangle, Loader2 } from 'lucide-react';
import { useWorkspace } from '@/features/workspace/hooks/useWorkspace';
import { runCoordinatorAnalysis } from '@/services/workspace.service';
import { SEVERITY_STYLE } from '@/features/workspace/constants';
import { normalizeCoordinatorAlert } from '@/features/workspace/utils/normalizeAlerts';
import { Link } from 'react-router-dom';
import { useClinicalPaths } from '@/hooks/useClinicalPaths';
import { useParams } from 'react-router-dom';

export default function WorkspaceOverview() {
  const { workspace, refresh, actionLoading, setActionLoading, patientId } = useWorkspace();
  const paths = useClinicalPaths();
  const { patientId: pidParam } = useParams();

  const alerts = (workspace?.sections?.ai?.coordinatorAlerts || []).map((a) =>
    normalizeCoordinatorAlert(a as Record<string, unknown>)
  );
  const pathway = workspace?.pathway;
  const tasks = workspace?.sections?.tasks || [];
  const team = workspace?.careTeam?.members || [];

  const runCoordinator = async () => {
    setActionLoading('coordinator');
    try {
      await runCoordinatorAnalysis(patientId);
      await refresh();
    } finally {
      setActionLoading(null);
    }
  };

  const openTasks = tasks.filter((t) => t.status !== 'completed').length;

  return (
    <div className="space-y-4">
      <div className="grid md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Live Vitals
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-1">
            {(workspace?.sections?.liveVitals || []).slice(0, 5).map((v, i) => (
              <div key={i} className="flex justify-between">
                <span>{v.label || v.type}</span>
                <span className="font-medium">{v.value} {v.unit}</span>
              </div>
            ))}
            {!workspace?.sections?.liveVitals?.length && (
              <p className="text-muted-foreground">No vitals in workspace</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              AI Briefing
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {alerts.slice(0, 3).map((a) => (
              <div key={a.id} className={`text-xs p-2 rounded border-l-4 ${SEVERITY_STYLE[a.severity || 'info']}`}>
                {a.message}
              </div>
            ))}
            {!alerts.length && (
              <p className="text-sm text-muted-foreground">No active AI alerts — run analysis for a clinical briefing.</p>
            )}
            <div className="flex gap-2 flex-wrap">
              <Button size="sm" variant="outline" onClick={runCoordinator} disabled={actionLoading === 'coordinator'}>
                {actionLoading === 'coordinator' ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Run analysis'}
              </Button>
              <Button size="sm" variant="link" className="px-0" asChild>
                <Link to={`${paths.patientHealthos(pidParam!)}/ai-team`}>AI Care Team →</Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Route className="h-4 w-4" />
              Current Goal
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-medium text-sm">{pathway?.current_goal || 'Stabilize clinical status'}</p>
            <Progress value={pathway?.current_progress || 0} className="mt-2 h-2" />
            <p className="text-xs text-muted-foreground mt-1">{pathway?.current_progress || 0}% complete</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Care Team</CardTitle></CardHeader>
          <CardContent className="text-sm">
            <p className="font-medium">{team.length} member(s)</p>
            <Button size="sm" variant="link" className="px-0 mt-1" asChild>
              <Link to={`${paths.patientHealthos(pidParam!)}/team`}>View team →</Link>
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Open Tasks</CardTitle></CardHeader>
          <CardContent className="text-sm">
            <p className="font-medium">{openTasks} open</p>
            <Button size="sm" variant="link" className="px-0 mt-1" asChild>
              <Link to={`${paths.patientHealthos(pidParam!)}/tasks`}>View tasks →</Link>
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Active AI Alerts</CardTitle></CardHeader>
          <CardContent className="text-sm">
            <p className="font-medium">{alerts.length}</p>
            <Button size="sm" variant="link" className="px-0 mt-1" asChild>
              <Link to={`${paths.patientHealthos(pidParam!)}/ai-team`}>Review →</Link>
            </Button>
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
    </div>
  );
}
