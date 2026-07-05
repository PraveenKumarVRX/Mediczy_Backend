import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Clock } from 'lucide-react';
import { useWorkspace } from '@/features/workspace/hooks/useWorkspace';
import { SEVERITY_STYLE } from '@/features/workspace/constants';
import { ClinicalEmptyState } from '@/components/clinical/ClinicalEmptyState';

export default function ClinicalTimelinePage() {
  const { workspace } = useWorkspace();
  const timeline = workspace?.sections?.timeline?.events || [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Clock className="h-4 w-4" />
          Clinical Timeline
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 max-h-[70vh] overflow-y-auto">
        {timeline.length === 0 ? (
          <ClinicalEmptyState
            title="No timeline events yet"
            description="Every clinical event, AI alert, and team action appears here as a searchable audit trail."
          />
        ) : (
          timeline.map((e) => (
            <div key={e.id} className={`border-l-4 pl-3 py-2 rounded-r ${SEVERITY_STYLE[e.severity || 'info']}`}>
              <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                <span>{new Date(e.event_at).toLocaleString()}</span>
                <Badge variant="outline" className="text-[10px]">{e.event_type}</Badge>
                {e.actor_name && <span>{e.actor_name}</span>}
              </div>
              <p className="font-medium text-sm mt-0.5">{e.title}</p>
              {e.body && <p className="text-sm text-slate-600 mt-1">{e.body}</p>}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
