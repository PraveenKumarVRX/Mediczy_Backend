import { Progress } from '@/components/ui/progress';

export function ConfidenceMeter({
  confidence,
  completeness,
  label = 'Confidence',
}: {
  confidence?: number;
  completeness?: number;
  label?: string;
}) {
  const value = confidence ?? 0;
  const dataQuality = completeness ?? 0;

  return (
    <div className="space-y-2 text-xs">
      <div>
        <div className="flex justify-between mb-1">
          <span className="text-muted-foreground">{label}</span>
          <span className="font-medium">{Math.round(value)}%</span>
        </div>
        <Progress value={value} className="h-1.5" />
      </div>
      {completeness != null && (
        <div>
          <div className="flex justify-between mb-1">
            <span className="text-muted-foreground">Data completeness</span>
            <span className="font-medium">{Math.round(dataQuality)}%</span>
          </div>
          <Progress value={dataQuality} className="h-1.5" />
        </div>
      )}
    </div>
  );
}
