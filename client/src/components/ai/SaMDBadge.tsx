import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const SAMD_STYLES: Record<string, string> = {
  'Class III': 'bg-red-100 text-red-800 border-red-200',
  'Class IIb': 'bg-amber-100 text-amber-900 border-amber-200',
  'Class IIa': 'bg-yellow-100 text-yellow-900 border-yellow-200',
  'NOT SaMD': 'bg-slate-100 text-slate-600 border-slate-200',
};

export function SaMDBadge({ classification = 'Class IIb' }: { classification?: string }) {
  return (
    <Badge variant="outline" className={cn('text-[10px] font-medium', SAMD_STYLES[classification] || SAMD_STYLES['Class IIb'])}>
      {classification}
    </Badge>
  );
}
