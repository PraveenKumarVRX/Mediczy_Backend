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

const InsuranceTasksPage = () => {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('inbox');
  const [filter, setFilter] = useState('all');
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [reply, setReply] = useState('');

  const [tasks] = useState<Task[]>([
    { id: 'T001', type: 'query_response', title: 'Query on Room Rent Charges', patient: 'Rajesh Kumar', insurer: 'Star Health', claimNo: 'CLM-2025-0042', priority: 'high', dueDate: '2025-06-20', status: 'pending', assignedTo: 'Dr. Sharma', description: 'Insurer queries about room rent exceeding policy limit. Need to provide cost justification with supporting documents.' },
    { id: 'T002', type: 'document_pending', title: 'Upload Discharge Summary', patient: 'Priya Singh', insurer: 'ICICI Lombard', claimNo: 'CLM-2025-0041', priority: 'high', dueDate: '2025-06-19', status: 'pending', assignedTo: 'Nurse Patel', description: 'Discharge summary required for claim processing. Upload signed copy.' },
    { id: 'T003', type: 'pre_auth_review', title: 'Pre-Auth Enhancement Request', patient: 'Amit Verma', insurer: 'HDFC Ergo', claimNo: 'PA-2025-0089', priority: 'medium', dueDate: '2025-06-21', status: 'in_progress', assignedTo: 'Dr. Gupta', description: 'Enhancement from ₹1,50,000 to ₹2,20,000 due to complications. Provide updated treatment plan.' },
    { id: 'T004', type: 'escalation', title: 'Settlement Delayed > 30 Days', patient: 'Meera Devi', insurer: 'Bajaj Allianz', claimNo: 'CLM-2025-0028', priority: 'high', dueDate: '2025-06-18', status: 'pending', assignedTo: 'Finance Team', description: 'Claim approved but settlement pending for 35 days. Escalate to insurer regional office.' },
    { id: 'T005', type: 'appeal', title: 'Appeal Against Rejection', patient: 'Suresh Patel', insurer: 'New India', claimNo: 'CLM-2025-0035', priority: 'medium', dueDate: '2025-06-25', status: 'pending', assignedTo: 'Claims Exec', description: 'Claim rejected due to pre-existing condition exclusion. Patient has continuous coverage > 4 years. File appeal with documentation.' },
  ]);

  const filteredTasks = tasks.filter(t => {
    if (activeTab === 'inbox') return t.status !== 'completed';
    if (activeTab === 'escalations') return t.type === 'escalation';
    if (activeTab === 'appeals') return t.type === 'appeal';
    if (activeTab === 'completed') return t.status === 'completed';
    return true;
  }).filter(t => filter === 'all' || t.priority === filter);

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
                          <span className="text-xs text-muted-foreground">Due: {task.dueDate}</span>
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
