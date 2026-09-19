/**
 * Housekeeping Management — hospital ops UI
 * Task tracker for routine/terminal cleaning, disinfection, linen change,
 * biomedical waste collection and pest control. Administrative/operational
 * workflow only — not a clinical or SaMD component. Talks to
 * /api/housekeeping (server/routes/housekeeping.route.js).
 */

import { useState, useEffect } from 'react';
import HospitalLayout from '@/components/hospital/HospitalLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { ClipboardList, Plus, Clock, Loader2, CheckCircle2, ShieldCheck } from 'lucide-react';
import api from '@/utils/api';
import { useToast } from '@/hooks/use-toast';

type TaskType =
  | 'routine_cleaning'
  | 'terminal_cleaning'
  | 'disinfection'
  | 'linen_change'
  | 'biomedical_waste_collection'
  | 'pest_control'
  | 'other';

type Priority = 'routine' | 'urgent' | 'stat';
type Status = 'pending' | 'in_progress' | 'completed' | 'verified';

type HousekeepingTask = {
  id: number;
  organization_id: number;
  location: string;
  ward: string | null;
  room_number: string | null;
  task_type: TaskType;
  priority: Priority;
  status: Status;
  assigned_to: number | null;
  created_by: number | null;
  notes: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  verified_by: number | null;
  verified_at: string | null;
};

type Stats = {
  pending: number;
  inProgress: number;
  completedToday: number;
  verifiedToday: number;
};

const TASK_TYPE_LABELS: Record<TaskType, string> = {
  routine_cleaning: 'Routine Cleaning',
  terminal_cleaning: 'Terminal Cleaning',
  disinfection: 'Disinfection',
  linen_change: 'Linen Change',
  biomedical_waste_collection: 'Biomedical Waste Collection',
  pest_control: 'Pest Control',
  other: 'Other',
};

const PRIORITY_BADGE: Record<Priority, string> = {
  stat: 'bg-red-100 text-red-700',
  urgent: 'bg-orange-100 text-orange-700',
  routine: 'bg-slate-100 text-slate-600',
};

const STATUS_BADGE: Record<Status, string> = {
  pending: 'bg-slate-100 text-slate-600',
  in_progress: 'bg-blue-100 text-blue-700',
  completed: 'bg-emerald-100 text-emerald-700',
  verified: 'bg-indigo-100 text-indigo-700',
};

export default function HousekeepingManagement() {
  const { toast } = useToast();
  const [tasks, setTasks] = useState<HousekeepingTask[]>([]);
  const [stats, setStats] = useState<Stats>({ pending: 0, inProgress: 0, completedToday: 0, verifiedToday: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [busyTaskId, setBusyTaskId] = useState<number | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [newLocation, setNewLocation] = useState('');
  const [newWard, setNewWard] = useState('');
  const [newRoomNumber, setNewRoomNumber] = useState('');
  const [newTaskType, setNewTaskType] = useState<string>('');
  const [newPriority, setNewPriority] = useState<string>('routine');
  const [newNotes, setNewNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const loadStats = async () => {
    try {
      const res = await api.get('/housekeeping/stats');
      const data = res.data?.data ?? res.data;
      if (data) setStats(data);
    } catch {
      // stats are supplementary — a failure here shouldn't block the task list
    }
  };

  const loadTasks = async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = {};
      if (statusFilter !== 'all') params.status = statusFilter;
      const res = await api.get('/housekeeping/tasks', { params });
      const data = res.data?.data ?? res.data;
      setTasks(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Could not load housekeeping tasks. Your account may not have organization context set up yet.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStats();
  }, []);

  useEffect(() => {
    loadTasks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const refresh = () => {
    loadTasks();
    loadStats();
  };

  const createTask = async () => {
    if (!newLocation.trim() || !newTaskType) {
      toast({ title: 'Location and task type are required', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      await api.post('/housekeeping/tasks', {
        location: newLocation.trim(),
        ward: newWard.trim() || undefined,
        roomNumber: newRoomNumber.trim() || undefined,
        taskType: newTaskType,
        priority: newPriority,
        notes: newNotes.trim() || undefined,
      });
      toast({ title: 'Task created', description: `${TASK_TYPE_LABELS[newTaskType as TaskType] || newTaskType} added.` });
      setDialogOpen(false);
      setNewLocation('');
      setNewWard('');
      setNewRoomNumber('');
      setNewTaskType('');
      setNewPriority('routine');
      setNewNotes('');
      refresh();
    } catch (e: any) {
      toast({ title: 'Failed to create task', description: e?.response?.data?.message || e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const startTask = async (task: HousekeepingTask) => {
    setBusyTaskId(task.id);
    try {
      await api.patch(`/housekeeping/tasks/${task.id}/start`);
      toast({ title: 'Task started' });
      refresh();
    } catch (e: any) {
      toast({ title: 'Failed to start task', description: e?.response?.data?.message || e.message, variant: 'destructive' });
    } finally {
      setBusyTaskId(null);
    }
  };

  const completeTask = async (task: HousekeepingTask) => {
    setBusyTaskId(task.id);
    try {
      await api.patch(`/housekeeping/tasks/${task.id}/complete`, {});
      toast({ title: 'Task completed' });
      refresh();
    } catch (e: any) {
      toast({ title: 'Failed to complete task', description: e?.response?.data?.message || e.message, variant: 'destructive' });
    } finally {
      setBusyTaskId(null);
    }
  };

  const verifyTask = async (task: HousekeepingTask) => {
    setBusyTaskId(task.id);
    try {
      await api.patch(`/housekeeping/tasks/${task.id}/verify`);
      toast({ title: 'Task verified' });
      refresh();
    } catch (e: any) {
      toast({ title: 'Failed to verify task', description: e?.response?.data?.message || e.message, variant: 'destructive' });
    } finally {
      setBusyTaskId(null);
    }
  };

  return (
    <HospitalLayout title="Housekeeping" subtitle="Cleaning, disinfection, linen and waste-collection task tracking">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">Pending</CardTitle>
              <Clock className="h-5 w-5 text-slate-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-slate-700">{stats.pending}</div>
            <p className="text-xs text-muted-foreground mt-1">Awaiting pickup</p>
          </CardContent>
        </Card>

        <Card className="border-blue-200 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">In Progress</CardTitle>
              <Loader2 className="h-5 w-5 text-blue-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-600">{stats.inProgress}</div>
            <p className="text-xs text-muted-foreground mt-1">Being worked on now</p>
          </CardContent>
        </Card>

        <Card className="border-emerald-200 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">Completed Today</CardTitle>
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-emerald-600">{stats.completedToday}</div>
            <p className="text-xs text-muted-foreground mt-1">Awaiting verification</p>
          </CardContent>
        </Card>

        <Card className="border-indigo-200 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">Verified Today</CardTitle>
              <ShieldCheck className="h-5 w-5 text-indigo-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-indigo-600">{stats.verifiedToday}</div>
            <p className="text-xs text-muted-foreground mt-1">Signed off by quality/nursing</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <ClipboardList className="h-5 w-5 text-indigo-500" />
          <h2 className="text-lg font-semibold">Tasks</h2>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="verified">Verified</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="h-4 w-4 mr-1" /> New Task</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Create a housekeeping task</DialogTitle></DialogHeader>
            <div className="space-y-3 py-2">
              <div>
                <Label htmlFor="hk-location">Location</Label>
                <Input id="hk-location" value={newLocation} onChange={(e) => setNewLocation(e.target.value)} placeholder="e.g. 3rd Floor, ICU Block" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="hk-ward">Ward (optional)</Label>
                  <Input id="hk-ward" value={newWard} onChange={(e) => setNewWard(e.target.value)} placeholder="e.g. ICU" />
                </div>
                <div>
                  <Label htmlFor="hk-room">Room number (optional)</Label>
                  <Input id="hk-room" value={newRoomNumber} onChange={(e) => setNewRoomNumber(e.target.value)} placeholder="e.g. 304" />
                </div>
              </div>
              <div>
                <Label htmlFor="hk-task-type">Task type</Label>
                <Select value={newTaskType} onValueChange={setNewTaskType}>
                  <SelectTrigger id="hk-task-type">
                    <SelectValue placeholder="Select a task type" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(TASK_TYPE_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="hk-priority">Priority</Label>
                <Select value={newPriority} onValueChange={setNewPriority}>
                  <SelectTrigger id="hk-priority">
                    <SelectValue placeholder="Select priority" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="routine">Routine</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                    <SelectItem value="stat">Stat</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="hk-notes">Notes (optional)</Label>
                <Textarea id="hk-notes" value={newNotes} onChange={(e) => setNewNotes(e.target.value)} placeholder="Any special instructions" />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={createTask} disabled={saving}>{saving ? 'Saving...' : 'Create Task'}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="border-0 shadow-sm">
        <CardContent className="pt-6">
          {loading && <p className="text-sm text-muted-foreground py-6 text-center">Loading...</p>}
          {!loading && error && <p className="text-sm text-red-500 py-6 text-center">{error}</p>}
          {!loading && !error && tasks.length === 0 && (
            <p className="text-sm text-muted-foreground py-6 text-center">
              No housekeeping tasks yet. Create one above to get started.
            </p>
          )}
          {!loading && !error && tasks.length > 0 && (
            <div className="space-y-3">
              {tasks.map((task) => (
                <div key={task.id} className="flex flex-wrap items-center justify-between gap-3 border rounded-md px-4 py-3">
                  <div className="min-w-0">
                    <p className="font-medium text-sm">
                      {task.location}
                      {task.ward && <span className="text-muted-foreground"> · {task.ward}</span>}
                      {task.room_number && <span className="text-muted-foreground"> · Room {task.room_number}</span>}
                    </p>
                    <div className="flex items-center gap-2 flex-wrap mt-1.5">
                      <Badge variant="outline">{TASK_TYPE_LABELS[task.task_type] || task.task_type}</Badge>
                      <Badge className={PRIORITY_BADGE[task.priority]}>{task.priority}</Badge>
                      <Badge className={STATUS_BADGE[task.status]}>{task.status.replace('_', ' ')}</Badge>
                      {task.assigned_to && <span className="text-xs text-muted-foreground">Assigned to #{task.assigned_to}</span>}
                    </div>
                    {task.notes && <p className="text-xs text-muted-foreground mt-1 whitespace-pre-line">{task.notes}</p>}
                  </div>
                  <div className="flex gap-2 shrink-0">
                    {task.status === 'pending' && (
                      <Button variant="outline" size="sm" className="text-xs" disabled={busyTaskId === task.id} onClick={() => startTask(task)}>
                        Start
                      </Button>
                    )}
                    {task.status === 'in_progress' && (
                      <Button variant="outline" size="sm" className="text-xs" disabled={busyTaskId === task.id} onClick={() => completeTask(task)}>
                        Complete
                      </Button>
                    )}
                    {task.status === 'completed' && (
                      <Button variant="outline" size="sm" className="text-xs" disabled={busyTaskId === task.id} onClick={() => verifyTask(task)}>
                        Verify
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </HospitalLayout>
  );
}
