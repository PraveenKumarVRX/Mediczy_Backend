import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Clock } from 'lucide-react';
import { useWorkspace } from '@/features/workspace/hooks/useWorkspace';
import { TimelineEventCard } from '@/components/clinical/TimelineEventCard';
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
          timeline.map((e) => <TimelineEventCard key={e.id} event={e} />)
        )}
      </CardContent>
    </Card>
  );
}
