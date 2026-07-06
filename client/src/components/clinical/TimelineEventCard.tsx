import { Badge } from '@/components/ui/badge';
import { SEVERITY_STYLE } from '@/features/workspace/constants';

export interface TimelineEvent {
  id: number | string;
  event_at: string;
  event_type?: string;
  title: string;
  body?: string;
  severity?: string;
  actor_name?: string;
}

export function TimelineEventCard({ event }: { event: TimelineEvent }) {
  const severity = event.severity || 'info';
  return (
    <div className={`border-l-4 pl-3 py-2 rounded-r ${SEVERITY_STYLE[severity] || SEVERITY_STYLE.info}`}>
      <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
        <span>{new Date(event.event_at).toLocaleString()}</span>
        {event.event_type && <Badge variant="outline" className="text-[10px]">{event.event_type}</Badge>}
        {event.actor_name && <span>{event.actor_name}</span>}
      </div>
      <p className="font-medium text-sm mt-0.5">{event.title}</p>
      {event.body && <p className="text-sm text-slate-600 mt-1">{event.body}</p>}
    </div>
  );
}
