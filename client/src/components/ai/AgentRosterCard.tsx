import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { AIAgentRosterEntry } from '@/features/workspace/types/workspace.types';

const STATUS_DOT: Record<AIAgentRosterEntry['status'], string> = {
  active: 'bg-emerald-500',
  idle: 'bg-slate-300',
  alert: 'bg-amber-500 animate-pulse',
};

export function AgentRosterCard({
  agent,
  onClick,
  selected,
}: {
  agent: AIAgentRosterEntry;
  onClick?: () => void;
  selected?: boolean;
}) {
  return (
    <Card
      className={cn(
        'cursor-pointer transition-shadow hover:shadow-md border',
        selected && 'ring-2 ring-teal-500 border-teal-200'
      )}
      onClick={onClick}
    >
      <CardContent className="p-3">
        <div className="flex items-start gap-2">
          <span className={cn('mt-1.5 h-2.5 w-2.5 rounded-full shrink-0', STATUS_DOT[agent.status])} />
          <div className="min-w-0">
            <p className="font-medium text-sm leading-tight">{agent.name}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{agent.description}</p>
            {agent.lastActivity && (
              <p className="text-[10px] text-muted-foreground mt-1">Last: {agent.lastActivity}</p>
            )}
            {(agent.alertCount ?? 0) > 0 && (
              <p className="text-[10px] font-medium text-amber-700 mt-1">{agent.alertCount} alert(s)</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
