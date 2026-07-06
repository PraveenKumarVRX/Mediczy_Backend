import { Badge } from '@/components/ui/badge';
import type { CoordinatorAlert } from '@/features/workspace/types/workspace.types';

export function AcuityBadge({ alerts }: { alerts?: CoordinatorAlert[] }) {
  const critical = alerts?.some((a) => a.severity === 'critical');
  const warning = alerts?.some((a) => a.severity === 'warning' || a.severity === 'high');

  if (critical) {
    return <Badge variant="destructive">Critical</Badge>;
  }
  if (warning) {
    return <Badge className="bg-amber-500 hover:bg-amber-600">Elevated</Badge>;
  }
  return <Badge variant="secondary">Stable</Badge>;
}
