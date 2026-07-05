import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export interface CareTask {
  id: number;
  title: string;
  status: string;
  priority?: string;
  owner_role?: string;
}

interface TaskCardProps {
  task: CareTask;
  onComplete?: (id: number) => void;
}

export function TaskCard({ task, onComplete }: TaskCardProps) {
  const done = task.status === 'completed';
  return (
    <div className="flex items-center gap-2 border rounded-lg p-3 text-sm">
      <div className="flex-1 min-w-0">
        <p className={done ? 'line-through text-muted-foreground' : 'font-medium'}>{task.title}</p>
        {task.owner_role && <p className="text-xs text-muted-foreground capitalize">{task.owner_role}</p>}
      </div>
      {task.priority && task.priority !== 'normal' && (
        <Badge variant={task.priority === 'high' ? 'destructive' : 'secondary'} className="text-[10px]">
          {task.priority}
        </Badge>
      )}
      <Badge variant="outline" className="text-[10px]">{task.status}</Badge>
      {!done && onComplete && (
        <Button size="sm" variant="ghost" onClick={() => onComplete(task.id)}>Done</Button>
      )}
    </div>
  );
}
