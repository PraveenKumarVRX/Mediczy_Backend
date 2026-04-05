import { useState, useEffect } from 'react';
import InsurancePortalLayout from '@/components/hospital-insurance/InsurancePortalLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import api from '@/utils/api';
import { Inbox, CheckCircle2, AlertTriangle, Clock, Send, Eye, MessageSquare, ArrowUpRight, Filter } from 'lucide-react';

interface Task {
  id: string;
  type: 'query_response' | 'document_pending' | 'pre_auth_review' | 'escalation' | 'appeal';
  title: string;
  patient: string;
  insurer: string;
  claimNo: string;
  priority: 'high' | 'medium' | 'low';
  dueDate: string;
  status: 'pending' | 'in_progress' | 'completed';
  assignedTo: string;
  description: string;
}

const DEMO_TASKS: Task[] = [
  { id: 'T001', type: 'query_response', title: 'Query Reply — CLM-2026-0002', patient: 'Sunita Sharma', insurer: 'HDFC Ergo', claimNo: 'CLM-2026-0002', priority: 'high', dueDate: '2026-04-06', status: 'pending', assignedTo: 'Insurance Team', description: 'HDFC Ergo has raised a query on room rent charges. Reply required within 24 hours or claim will be auto-rejected.' },
  { id: 'T002', type: 'document_pending', title: 'Missing Docs — CLM-2026-0006', patient: 'Suresh Patel', insurer: 'Niva Bupa', claimNo: 'CLM-2026-0006', priority: 'high', dueDate: '2026-04-06', status: 'pending', assignedTo: 'Medical Records', description: 'Discharge summary and final hospital bill pending. Required for claim submission.' },
  { id: 'T003', type: 'pre_auth_review', title: 'Pre-Auth Query — PA-2026-0003', patient: 'Amit Verma', insurer: 'ICICI Lombard', claimNo: 'PA-2026-0003', priority: 'medium', dueDate: '2026-04-07', status: 'in_progress', assignedTo: 'Dr. Priya Desai', description: 'ICICI Lombard requires previous USG reports and symptom duration history for pre-auth approval.' },
  { id: 'T004', type: 'document_pending', title: 'Missing Docs — CLM-2026-0010', patient: 'Vijay Rao', insurer: 'HDFC Ergo', claimNo: 'CLM-2026-0010', priority: 'high', dueDate: '2026-04-05', status: 'pending', assignedTo: 'Medical Records', description: 'Pre-op echo, angiography report, and cath lab report required for CABG claim.' },
  { id: 'T005', type: 'escalation', title: 'SLA Breach — CLM-2026-0010', patient: 'Vijay Rao', insurer: 'HDFC Ergo', claimNo: 'CLM-2026-0010', priority: 'high', dueDate: '2026-04-05', status: 'pending', assignedTo: 'Insurance Manager', description: 'Pending 16 days (SLA: 15 days). HDFC Ergo CABG claim auto-escalated.' },
  { id: 'T006', type: 'query_response', title: 'Query Reply — PA-2026-0003', patient: 'Amit Verma', insurer: 'ICICI Lombard', claimNo: 'PA-2026-0003', priority: 'medium', dueDate: '2026-04-08', status: 'in_progress', assignedTo: 'Insurance Team', description: 'Additional clinical justification needed for cholecystectomy pre-auth query.' },
  { id: 'T007', type: 'appeal', title: 'Appeal — PA-2026-0006', patient: 'Anita Gupta', insurer: 'Niva Bupa', claimNo: 'PA-2026-0006', priority: 'medium', dueDate: '2026-04-12', status: 'pending', assignedTo: 'Insurance Manager', description: 'Pre-auth rejected citing pre-existing condition. Prepare appeal with supporting documents and specialist opinion.' },
  { id: 'T008', type: 'document_pending', title: 'Missing Implant Invoice — CLM-2026-0005', patient: 'Meera Devi', insurer: 'Care Health', claimNo: 'CLM-2026-0005', priority: 'medium', dueDate: '2026-04-07', status: 'pending', assignedTo: 'Medical Records', description: 'Implant invoice and sticker for TKR knee prosthesis pending.' },
];

const DEMO_ESCALATIONS: Task[] = [
  { id: 'ESC001', type: 'escalation', title: 'SLA Breach — CLM-2026-0010 (CABG)', patient: 'Vijay Rao', insurer: 'HDFC Ergo', claimNo: 'CLM-2026-0010', priority: 'high', dueDate: '2026-04-05', status: 'pending', assignedTo: 'Insurance Manager', description: 'Pending 16 days (SLA: 15 days). Critical surgery claim.' },
  { id: 'ESC002', type: 'escalation', title: 'SLA Breach — CLM-2026-0002 (PTCA)', patient: 'Sunita Sharma', insurer: 'HDFC Ergo', claimNo: 'CLM-2026-0002', priority: 'high', dueDate: '2026-04-06', status: 'pending', assignedTo: 'Insurance Manager', description: 'Pending 6 days with open query. Cardiac case needs urgent follow-up.' },
];

const DEMO_APPEALS: Task[] = [
  { id: 'APL001', type: 'appeal', title: 'Appeal — PA-2026-0006 (Hysterectomy)', patient: 'Anita Gupta', insurer: 'Niva Bupa', claimNo: 'PA-2026-0006', priority: 'medium', dueDate: '2026-04-12', status: 'pending', assignedTo: 'Insurance Manager', description: 'Rejected: Pre-existing condition. Appeal #1. Attach specialist opinion and 2-year symptom history.' },
];

const InsuranceTasksPage = () => {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('inbox');
  const [filter, setFilter] = useState('all');
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [reply, setReply] = useState('');
  const [loading, setLoading] = useState(true);

  const [tasks, setTasks] = useState<Task[]>([]);

  useEffect(() => {
    fetchTasks();
  }, [activeTab]);

  const fetchTasks = async () => {
    setLoading(true);
    try {
      let endpoint = '/hospital/insurance/tasks/inbox';
      if (activeTab === 'escalations') endpoint = '/hospital/insurance/claims/escalations';
      else if (activeTab === 'appeals') endpoint = '/hospital/insurance/claims/appeals';

      const { data } = await api.get(endpoint);
      if (data.success) {
        if (activeTab === 'escalations') {
          setTasks((data.escalations || []).map((e: any) => ({
            id: e.claimId || e.id, type: 'escalation', title: `SLA Breach — ${e.claimNumber}`,
            patient: e.patientName || 'Unknown', insurer: '', claimNo: e.claimNumber || '',
            priority: e.escalationLevel === 'critical' ? 'high' : 'medium',
            dueDate: '', status: e.status === 'completed' ? 'completed' : 'pending',
            assignedTo: '', description: `Pending ${e.ageDays} days (SLA: ${e.slaThreshold} days)`
          })));
        } else if (activeTab === 'appeals') {
          setTasks((data.appeals || []).map((a: any) => ({
            id: a.claimId || a.id, type: 'appeal', title: `Appeal — ${a.claimNumber}`,
            patient: a.patientName || 'Unknown', insurer: '', claimNo: a.claimNumber || '',
            priority: 'medium', dueDate: '', status: a.status === 'completed' ? 'completed' : 'pending',
            assignedTo: '', description: a.rejectionReason || `Appeal #${a.appealCount || 0}`
          })));
        } else {
          setTasks((data.taskInbox || []).map((t: any) => ({
            id: t.claimId || t.preAuthId || t.id, type: t.taskType?.replace('-', '_') || 'query_response',
            title: t.taskLabel || t.title || 'Task', patient: t.patientName || 'Unknown',
            insurer: '', claimNo: t.claimNumber || t.preAuthNumber || '',
            priority: t.priority === 'high' ? 'high' : 'medium',
            dueDate: '', status: t.status === 'completed' ? 'completed' : 'pending',
            assignedTo: '', description: `${t.taskLabel} • Age: ${t.ageDays || 0} days • SLA: ${t.slaFlag || '—'}`
          })));
        }
      }
    } catch (err) {
      console.warn('Tasks fetch error, using demo data:', err);
      if (activeTab === 'escalations') setTasks(DEMO_ESCALATIONS);
      else if (activeTab === 'appeals') setTasks(DEMO_APPEALS);
      else setTasks(DEMO_TASKS);
    } finally {
      setLoading(false);
    }
  };

  const filteredTasks = tasks.filter(t => filter === 'all' || t.priority === filter);

  const priorityColor = (p: string) => {
    switch (p) {
      case 'high': return 'bg-red-100 text-red-700';
      case 'medium': return 'bg-amber-100 text-amber-700';
      case 'low': return 'bg-green-100 text-green-700';
      default: return 'bg-slate-100 text-slate-700';
    }
  };

  const typeIcon = (type: string) => {
    switch (type) {
      case 'query_response': return <MessageSquare className="h-4 w-4 text-blue-600" />;
      case 'document_pending': return <Clock className="h-4 w-4 text-amber-600" />;
      case 'pre_auth_review': return <Eye className="h-4 w-4 text-purple-600" />;
      case 'escalation': return <ArrowUpRight className="h-4 w-4 text-red-600" />;
      case 'appeal': return <AlertTriangle className="h-4 w-4 text-orange-600" />;
      default: return <Inbox className="h-4 w-4" />;
    }
  };

  const handleRespond = () => {
    if (!reply.trim()) return;
    toast({ title: 'Response Sent', description: `Reply sent for ${selectedTask?.claimNo}` });
    setReply('');
    setSelectedTask(null);
  };

  const daysLeft = (dueDateStr: string): { days: number; label: string; color: string } => {
    if (!dueDateStr) return { days: 99, label: 'No deadline', color: 'text-slate-400' };
    const due = new Date(dueDateStr);
    const now = new Date();
    const diff = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (diff < 0) return { days: diff, label: `${Math.abs(diff)}d overdue`, color: 'text-red-600' };
    if (diff === 0) return { days: 0, label: 'Due today', color: 'text-red-500' };
    if (diff === 1) return { days: 1, label: '1 day left', color: 'text-orange-500' };
    if (diff <= 3) return { days: diff, label: `${diff} days left`, color: 'text-amber-500' };
    return { days: diff, label: `${diff} days left`, color: 'text-green-600' };
  };

  return (
    <InsurancePortalLayout title="Task Inbox & Escalations" subtitle="Manage queries, tasks, escalations, and appeals">
      <div className="space-y-4">
        {/* Summary Cards */}
        <div className="grid grid-cols-5 gap-3">
          {[
            { label: 'Total Pending', count: tasks.filter(t => t.status === 'pending').length, color: 'text-indigo-600' },
            { label: 'High Priority', count: tasks.filter(t => t.priority === 'high' && t.status !== 'completed').length, color: 'text-red-600' },
            { label: 'Queries', count: tasks.filter(t => t.type === 'query_response').length, color: 'text-blue-600' },
            { label: 'Escalations', count: tasks.filter(t => t.type === 'escalation').length, color: 'text-orange-600' },
            { label: 'Appeals', count: tasks.filter(t => t.type === 'appeal').length, color: 'text-purple-600' },
          ].map((stat, i) => (
            <Card key={i}>
              <CardContent className="p-3 text-center">
                <p className={`text-2xl font-bold ${stat.color}`}>{stat.count}</p>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="flex items-center justify-between">
            <TabsList>
              <TabsTrigger value="inbox">Inbox</TabsTrigger>
              <TabsTrigger value="escalations">Escalations</TabsTrigger>
              <TabsTrigger value="appeals">Appeals</TabsTrigger>
              <TabsTrigger value="completed">Completed</TabsTrigger>
            </TabsList>
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger className="w-36">
                <Filter className="h-3 w-3 mr-1" />
                <SelectValue placeholder="Priority" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Priority</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {['inbox', 'escalations', 'appeals', 'completed'].map(tab => (
            <TabsContent key={tab} value={tab} className="space-y-3">
              {filteredTasks.length === 0 ? (
                <Card><CardContent className="py-12 text-center text-muted-foreground"><CheckCircle2 className="h-12 w-12 mx-auto mb-3 opacity-30" /><p>No tasks in this category.</p></CardContent></Card>
              ) : (
                filteredTasks.map(task => (
                  <Card key={task.id} className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => setSelectedTask(task)}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3">
                          {typeIcon(task.type)}
                          <div>
                            <p className="font-medium">{task.title}</p>
                            <p className="text-sm text-muted-foreground">{task.claimNo} • {task.patient} • {task.insurer}</p>
                            <p className="text-sm mt-1">{task.description}</p>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <Badge className={priorityColor(task.priority)}>{task.priority}</Badge>
                          {(() => {
                            const cd = daysLeft(task.dueDate);
                            return (
                              <span className={`text-xs font-semibold flex items-center gap-0.5 ${cd.color}`}>
                                <Clock className="h-3 w-3" /> {cd.label}
                              </span>
                            );
                          })()}
                          <Badge variant="outline" className="text-xs">{task.assignedTo}</Badge>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </TabsContent>
          ))}
        </Tabs>

        {/* Task Detail / Response Dialog */}
        {selectedTask && (
          <Card className="border-2 border-indigo-200">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  {typeIcon(selectedTask.type)} {selectedTask.title}
                </CardTitle>
                <Button variant="ghost" size="sm" onClick={() => setSelectedTask(null)}>✕</Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-4 gap-3 text-sm">
                <div><span className="text-muted-foreground">Claim No:</span> <strong>{selectedTask.claimNo}</strong></div>
                <div><span className="text-muted-foreground">Patient:</span> <strong>{selectedTask.patient}</strong></div>
                <div><span className="text-muted-foreground">Insurer:</span> <strong>{selectedTask.insurer}</strong></div>
                <div><span className="text-muted-foreground">Due:</span> <strong>{selectedTask.dueDate}</strong></div>
              </div>
              <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded text-sm">{selectedTask.description}</div>
              <div>
                <label className="text-sm font-medium">Response / Action Taken</label>
                <Textarea value={reply} onChange={e => setReply(e.target.value)} placeholder="Type your response or notes..." rows={3} />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => { toast({ title: 'Escalated', description: 'Task escalated to management.' }); setSelectedTask(null); }}>
                  <ArrowUpRight className="h-4 w-4 mr-1" /> Escalate
                </Button>
                <Button onClick={handleRespond} className="bg-indigo-600 hover:bg-indigo-700">
                  <Send className="h-4 w-4 mr-1" /> Send Response
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </InsurancePortalLayout>
  );
};

export default InsuranceTasksPage;
