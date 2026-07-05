import type { CoordinatorAlert } from '@/features/workspace/types/workspace.types';

/** Normalize API coordinator alert rows for UI components */
export function normalizeCoordinatorAlert(row: Record<string, unknown>): CoordinatorAlert {
  return {
    id: row.id as number | string,
    message: String(row.message || ''),
    severity: (row.severity as CoordinatorAlert['severity']) || 'info',
    status:
      row.status === 'approved' || row.status === 'dismissed'
        ? row.status
        : row.status === 'active'
          ? undefined
          : (row.status as CoordinatorAlert['status']),
    created_at: (row.created_at as string) || undefined,
    agent: 'Clinical Coordinator',
    samd_class: 'Class IIb',
    confidence_score: 0.78,
    data_completeness: 0.88,
  };
}
