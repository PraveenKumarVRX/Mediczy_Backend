import type { ClinicalSeverity } from './types/workspace.types';

export const SEVERITY_STYLE: Record<string, string> = {
  critical: 'border-l-red-500 bg-red-50',
  warning: 'border-l-amber-500 bg-amber-50',
  high: 'border-l-orange-500 bg-orange-50',
  moderate: 'border-l-yellow-500 bg-yellow-50',
  info: 'border-l-slate-300 bg-white',
};

export function severityLabel(severity?: ClinicalSeverity): string {
  if (!severity) return 'Info';
  return severity.charAt(0).toUpperCase() + severity.slice(1);
}
