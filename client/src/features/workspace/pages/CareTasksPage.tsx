import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TaskCard } from '@/components/clinical/TaskCard';
import { ListTodo } from 'lucide-react';
import { useWorkspace } from '@/features/workspace/hooks/useWorkspace';
import { createCareTask, updateCareTask } from '@/services/workspace.service';
import { ClinicalEmptyState } from '@/components/clinical/ClinicalEmptyState';

export default function CareTasksPage() {
  const { workspace, refresh, patientId, actionLoading, setActionLoading } = useWorkspace();
  const [newTask, setNewTask] = useState('');
  const tasks = workspace?.sections?.tasks || [];

  const addTask = async () => {
    if (!newTask.trim()) return;
    setActionLoading('task');
    try {
      await createCareTask(patientId, { title: newTask.trim(), priority: 'normal' });
      setNewTask('');
      await refresh();
    } finally {
      setActionLoading(null);
    }
  };

  const completeTask = async (taskId: number) => {
    await updateCareTask(taskId, 'completed');
    await refresh();
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input
          placeholder="New care task…"
          value={newTask}
          onChange={(e) => setNewTask(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addTask()}
        />
        <Button onClick={addTask} disabled={actionLoading === 'task'}>Add</Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><ListTodo className="h-4 w-4" /> Tasks</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {tasks.length === 0 ? (
            <ClinicalEmptyState title="No tasks" description="Add care tasks for the nursing and medical team." />
          ) : (
            tasks.map((t) => (
              <TaskCard key={t.id} task={t} onComplete={completeTask} />
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
