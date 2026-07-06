import { Card, CardContent } from '@/components/ui/card';
import { SaMDBadge } from './SaMDBadge';
import { ConfidenceMeter } from './ConfidenceMeter';
import { ApprovalActionBar } from './ApprovalActionBar';
import { SEVERITY_STYLE } from '@/features/workspace/constants';
import type { CoordinatorAlert } from '@/features/workspace/types/workspace.types';

export function AIRecommendationCard({
  alert,
  onApprove,
  onDismiss,
  busy,
}: {
  alert: CoordinatorAlert;
  onApprove?: () => void;
  onDismiss?: () => void;
  busy?: boolean;
}) {
  const agentName = alert.agent || 'Clinical Coordinator';
  const severity = alert.severity || 'info';

  return (
    <Card className={`border-l-4 ${SEVERITY_STYLE[severity] || SEVERITY_STYLE.info}`}>
      <CardContent className="pt-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-violet-800">{agentName}</span>
          <SaMDBadge classification={alert.samd_class || 'Class IIb'} />
          {alert.created_at && (
            <span className="text-[10px] text-muted-foreground ml-auto">
              {new Date(alert.created_at).toLocaleString()}
            </span>
          )}
        </div>
        <p className="text-sm text-slate-800">{alert.message}</p>
        <ConfidenceMeter
          confidence={
            (alert.confidence_score ?? 0.75) <= 1
              ? (alert.confidence_score ?? 0.75) * 100
              : (alert.confidence_score ?? 75)
          }
          completeness={
            (alert.data_completeness ?? 0.85) <= 1
              ? (alert.data_completeness ?? 0.85) * 100
              : (alert.data_completeness ?? 85)
          }
        />
        <p className="text-[10px] text-muted-foreground">
          Augmented intelligence — recommendations require clinician approval. AI does not replace clinical judgment.
        </p>
        {alert.status !== 'approved' && alert.status !== 'dismissed' && (
          <ApprovalActionBar onApprove={onApprove} onDismiss={onDismiss} busy={busy} />
        )}
        {alert.status === 'approved' && (
          <p className="text-xs text-emerald-700 font-medium">Acknowledged by care team</p>
        )}
        {alert.status === 'dismissed' && (
          <p className="text-xs text-muted-foreground">Dismissed</p>
        )}
      </CardContent>
    </Card>
  );
}
