import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { CheckCircle2 } from 'lucide-react';
import { useWorkspace } from '@/features/workspace/hooks/useWorkspace';

export default function TreatmentPathwayPage() {
  const { workspace } = useWorkspace();
  const pathway = workspace?.pathway;

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Living Treatment Pathway</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-sm font-medium">Current: {pathway?.current_goal || 'Stabilize clinical status'}</p>
          <Progress value={pathway?.current_progress || 0} className="mt-2" />
          <p className="text-xs text-muted-foreground mt-1">{pathway?.current_progress || 0}% toward goal</p>
        </div>
        <div className="space-y-2">
          {(pathway?.steps || []).map((s, i) => (
            <div key={s.id || i} className="flex items-center gap-3 text-sm border rounded-lg p-3">
              {s.status === 'completed' ? (
                <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
              ) : (
                <div className="h-4 w-4 rounded-full border-2 border-slate-300 shrink-0" />
              )}
              <span className={s.status === 'in_progress' ? 'font-semibold' : ''}>{s.label}</span>
              <Badge variant="outline" className="ml-auto text-[10px]">{s.status || 'pending'}</Badge>
            </div>
          ))}
          {!pathway?.steps?.length && (
            <p className="text-sm text-muted-foreground">Pathway milestones will appear as care progresses.</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
