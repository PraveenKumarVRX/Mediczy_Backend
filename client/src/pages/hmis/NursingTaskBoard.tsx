import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  ArrowLeft, RefreshCw, CheckCircle2, Clock, AlertCircle,
  Syringe, Stethoscope, Activity, ClipboardList, Zap
} from 'lucide-react';
import api from '@/utils/api';

interface NursingTask {
  id: number;
  task_type: string;
  title: string;
  description?: string;
  priority: 'routine' | 'urgent' | 'stat';
  status: 'pending' | 'in_progress' | 'completed' | 'skipped';
  scheduled_at?: string;
  completed_at?: string;
  completed_by?: string;
  notes?: string;
}

const TASK_ICON: Record<string, React.ElementType> = {
  medication:    Syringe,
  vitals:        Activity,
  assessment:    Stethoscope,
  procedure:     ClipboardList,
  documentation: ClipboardList,
};

const PRIORITY_COLOR: Record<string, string> = {
  routine: 'bg-slate-100 text-slate-600',
  urgent:  'bg-amber-100 text-amber-700',
  stat:    'bg-red-100 text-red-700',
};

const STATUS_COLOR: Record<string, string> = {
  pending:     'bg-amber-100 text-amber-700',
  in_progress: 'bg-blue-100 text-blue-700',
  completed:   'bg-emerald-100 text-emerald-700',
  skipped:     'bg-slate-100 text-slate-500',
};

export default function NursingTaskBoard() {
  const { admissionId } = useParams<{ admissionId: string }>();
  const navigate = useNavigate();

  const [tasks, setTasks] = useState<NursingTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [completing, setCompleting] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('pending');

  const load = useCallback(async () => {
    if (!admissionId) return;
    setLoading(true);
    try {
      const res = await api.get(`/api/v1/nursing/tasks?admissionId=${admissionId}`);
      setTasks(res.data?.data ?? []);
      setError(null);
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Failed to load tasks');
    } finally {
      setLoading(false);
    }
  }, [admissionId]);

  useEffect(() => { load(); }, [load]);

  const autoGenerate = async () => {
    if (!admissionId) return;
    setGenerating(true);
    try {
      await api.post('/api/v1/nursing/tasks/auto-generate', { admissionId: parseInt(admissionId) });
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Auto-generate failed');
    } finally {
      setGenerating(false);
    }
  };

  const completeTask = async (taskId: number) => {
    setCompleting(taskId);
    try {
      await api.put(`/api/v1/nursing/tasks/${taskId}/complete`, { notes: '' });
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: 'completed' } : t));
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Could not complete task');
    } finally {
      setCompleting(null);
    }
  };

  const filtered = filter === 'all' ? tasks : tasks.filter(t => t.status === filter);

  const counts = {
    pending:     tasks.filter(t => t.status === 'pending').length,
    in_progress: tasks.filter(t => t.status === 'in_progress').length,
    completed:   tasks.filter(t => t.status === 'completed').length,
    stat:        tasks.filter(t => t.priority === 'stat' && t.status !== 'completed').length,
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}><ArrowLeft className="h-4 w-4" /></Button>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-teal-600" /> Nursing Task Board
            </h1>
            <p className="text-sm text-muted-foreground">Admission ID: {admissionId}</p>
          </div>
          <Button variant="outline" size="sm" onClick={autoGenerate} disabled={generating}>
            <Zap className={`h-4 w-4 mr-1 ${generating ? 'animate-pulse' : ''}`} /> Auto-Generate
          </Button>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>

        {/* Summary badges */}
        <div className="flex gap-3 mb-5 flex-wrap">
          {counts.stat > 0 && (
            <div className="flex items-center gap-1 bg-red-100 text-red-700 rounded-full px-3 py-1 text-sm font-medium">
              <AlertCircle className="h-3.5 w-3.5" /> {counts.stat} STAT
            </div>
          )}
          <div className="flex items-center gap-1 bg-amber-100 text-amber-700 rounded-full px-3 py-1 text-sm">
            <Clock className="h-3.5 w-3.5" /> {counts.pending} Pending
          </div>
          <div className="flex items-center gap-1 bg-blue-100 text-blue-700 rounded-full px-3 py-1 text-sm">
            <Activity className="h-3.5 w-3.5" /> {counts.in_progress} In Progress
          </div>
          <div className="flex items-center gap-1 bg-emerald-100 text-emerald-700 rounded-full px-3 py-1 text-sm">
            <CheckCircle2 className="h-3.5 w-3.5" /> {counts.completed} Done
          </div>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1 mb-5 bg-white border rounded-lg p-1 w-fit">
          {['pending', 'in_progress', 'completed', 'all'].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${filter === f ? 'bg-teal-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              {f === 'in_progress' ? 'In Progress' : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 mb-4 text-sm">{error}</div>}

        {loading ? (
          <div className="text-center py-12 text-muted-foreground">Loading tasks…</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">No {filter === 'all' ? '' : filter} tasks found</div>
        ) : (
          <div className="space-y-3">
            {filtered.map(task => {
              const Icon = TASK_ICON[task.task_type] ?? ClipboardList;
              const isCompleted = task.status === 'completed';
              return (
                <Card key={task.id} className={`hover:shadow-md transition-shadow ${isCompleted ? 'opacity-60' : ''}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className={`flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center ${PRIORITY_COLOR[task.priority]}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <p className="font-medium text-slate-800 text-sm">{task.title}</p>
                          <Badge className={`text-xs px-1.5 ${STATUS_COLOR[task.status]}`}>{task.status.replace('_', ' ')}</Badge>
                          <Badge className={`text-xs px-1.5 ${PRIORITY_COLOR[task.priority]}`}>{task.priority}</Badge>
                        </div>
                        {task.description && <p className="text-sm text-muted-foreground">{task.description}</p>}
                        {task.scheduled_at && (
                          <p className="text-xs text-slate-400 mt-1">
                            Scheduled: {new Date(task.scheduled_at).toLocaleString('en-IN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' })}
                          </p>
                        )}
                        {task.completed_at && (
                          <p className="text-xs text-emerald-600 mt-1">
                            Completed: {new Date(task.completed_at).toLocaleString('en-IN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' })}
                          </p>
                        )}
                      </div>
                      {!isCompleted && task.status !== 'skipped' && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-shrink-0 text-emerald-700 border-emerald-300 hover:bg-emerald-50"
                          onClick={() => completeTask(task.id)}
                          disabled={completing === task.id}
                        >
                          <CheckCircle2 className="h-4 w-4 mr-1" />
                          {completing === task.id ? 'Saving…' : 'Complete'}
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
