import { cn } from '@/lib/utils';

type BedStatus = 'stable' | 'monitoring' | 'alert' | 'available' | string;

const STYLES: Record<string, string> = {
  stable: 'bg-emerald-100 text-emerald-800',
  monitoring: 'bg-blue-100 text-blue-800',
  alert: 'bg-red-100 text-red-800',
  available: 'bg-slate-100 text-slate-600',
};

interface BedStatusChipProps {
  status: BedStatus;
  className?: string;
}

export function BedStatusChip({ status, className }: BedStatusChipProps) {
  const key = status in STYLES ? status : 'stable';
  return (
    <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium capitalize', STYLES[key], className)}>
      {status.replace('_', ' ')}
    </span>
  );
}
