import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Sparkles, Loader2, Brain } from 'lucide-react';
import { useWorkspace } from '@/features/workspace/hooks/useWorkspace';
import { runCoordinatorAnalysis, acknowledgeCoordinatorAlert } from '@/services/workspace.service';
import { AgentRosterCard } from '@/components/ai/AgentRosterCard';
import { AIRecommendationCard } from '@/components/ai/AIRecommendationCard';
import { AI_AGENT_ROSTER } from '@/features/workspace/types/workspace.types';
import type { AIAgentRosterEntry, CoordinatorAlert } from '@/features/workspace/types/workspace.types';
import { ClinicalEmptyState } from '@/components/clinical/ClinicalEmptyState';
import { normalizeCoordinatorAlert } from '@/features/workspace/utils/normalizeAlerts';
import { SHAPAttributionDrawer } from '@/components/ai/SHAPAttributionDrawer';
import { AgentActivityLog } from '@/components/ai/AgentActivityLog';

export default function AICareTeamPage() {
  const { workspace, refresh, patientId, actionLoading, setActionLoading } = useWorkspace();
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [localAlerts, setLocalAlerts] = useState<CoordinatorAlert[]>([]);
  const [shapOpen, setShapOpen] = useState(false);

  const rawAlerts = workspace?.sections?.ai?.coordinatorAlerts || [];
  const alerts: CoordinatorAlert[] = localAlerts.length
    ? localAlerts
    : rawAlerts.map((a) => normalizeCoordinatorAlert(a as Record<string, unknown>));

  const roster: AIAgentRosterEntry[] = useMemo(() => {
    const alertCountByAgent = alerts.reduce<Record<string, number>>((acc, a) => {
      const key = a.agent || 'Clinical Coordinator';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    return AI_AGENT_ROSTER.map((agent) => {
      const hasAlert =
        (agent.id === 'monitoring' && alerts.some((a) => /vital|monitor|deteriorat/i.test(a.message))) ||
        (agent.id === 'clinical' && alerts.length > 0);
      return {
        ...agent,
        status: hasAlert ? 'alert' : alerts.length ? 'active' : 'idle',
        alertCount: agent.id === 'clinical' ? alerts.length : alertCountByAgent[agent.name] || 0,
        lastActivity: alerts[0]?.created_at ? new Date(alerts[0].created_at!).toLocaleTimeString() : undefined,
      } as AIAgentRosterEntry;
    });
  }, [alerts]);

  const runAll = async () => {
    setActionLoading('coordinator');
    try {
      await runCoordinatorAnalysis(patientId);
      await refresh();
    } finally {
      setActionLoading(null);
    }
  };

  const handleAck = async (alert: CoordinatorAlert, action: 'approve' | 'dismiss') => {
    setActionLoading(`ack-${alert.id}`);
    try {
      try {
        await acknowledgeCoordinatorAlert(patientId, alert.id, action);
      } catch {
        // Endpoint may not exist yet — update UI optimistically
      }
      setLocalAlerts((prev) => {
        const base = prev.length ? prev : [...alerts];
        return base.map((a) => (a.id === alert.id ? { ...a, status: action === 'approve' ? 'approved' : 'dismissed' } : a));
      });
    } finally {
      setActionLoading(null);
    }
  };

  const pending = alerts.filter((a) => a.status !== 'approved' && a.status !== 'dismissed');

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-violet-600" />
            AI Care Team
          </h2>
          <p className="text-sm text-muted-foreground">
            Augmented intelligence — specialized agents recommend; clinicians decide.
          </p>
        </div>
        <Button onClick={runAll} disabled={actionLoading === 'coordinator'}>
          {actionLoading === 'coordinator' ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
          Run analysis
        </Button>
        <Button variant="outline" onClick={() => setShapOpen(true)}>
          <Brain className="h-4 w-4 mr-1" />
          SHAP
        </Button>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {roster.map((agent) => (
          <AgentRosterCard
            key={agent.id}
            agent={agent}
            selected={selectedAgent === agent.id}
            onClick={() => setSelectedAgent(agent.id === selectedAgent ? null : agent.id)}
          />
        ))}
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-700">
          Active recommendations ({pending.length})
        </h3>
        {pending.length === 0 ? (
          <ClinicalEmptyState
            title="No pending recommendations"
            description="Run analysis or wait for clinical events to trigger agent observations."
          />
        ) : (
          pending.map((alert) => (
            <AIRecommendationCard
              key={alert.id}
              alert={alert}
              busy={actionLoading === `ack-${alert.id}`}
              onApprove={() => handleAck(alert, 'approve')}
              onDismiss={() => handleAck(alert, 'dismiss')}
            />
          ))
        )}
      </div>

      <AgentActivityLog patientId={patientId} />

      <SHAPAttributionDrawer patientId={patientId} open={shapOpen} onOpenChange={setShapOpen} />
    </div>
  );
}
