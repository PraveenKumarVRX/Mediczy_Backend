import { cn } from '@/lib/utils';

interface LiveIndicatorProps {
  live?: boolean;
  className?: string;
}

/** Pulse dot for realtime / polling surfaces */
export function LiveIndicator({ live = true, className }: LiveIndicatorProps) {
  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <span
        className={cn(
          'h-2 w-2 rounded-full',
          live ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'
        )}
      />
      <span className={cn('text-xs font-medium', live ? 'text-emerald-700' : 'text-slate-500')}>
        {live ? 'Live' : 'Offline'}
      </span>
    </span>
  );
}
