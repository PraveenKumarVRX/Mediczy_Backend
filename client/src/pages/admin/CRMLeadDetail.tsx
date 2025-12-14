import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import AdminLayout from '@/components/layout/AdminLayout';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import axios from 'axios';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';

interface LeadDetail {
  lead: any; activities: any[]; notes: any[]; tasks: any[];
}

const stages = ['New','Qualified','Proposal','Negotiation','Closed Won','Closed Lost'];

const CRMLeadDetail = () => {
  const { id } = useParams();
  const [data, setData] = useState<LeadDetail|null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string|undefined>();
  const [noteContent, setNoteContent] = useState('');
  const [taskForm, setTaskForm] = useState({ title:'', description:'', dueDate:'', priority:'Medium' });
  const [stageUpdating, setStageUpdating] = useState(false);
  const token = localStorage.getItem('adminToken');

  const fetchDetail = async () => {
    setLoading(true); setError(undefined);
    try {
      const res = await axios.get(`/api/crm/leads/${id}`, { headers: { Authorization: `Bearer ${token}` } });
      setData(res.data);
    } catch (e:any) { setError(e.message); }
    finally { setLoading(false); }
  };
  useEffect(()=>{ fetchDetail(); }, [id]);

  const addNote = async () => {
    if (!noteContent.trim()) return;
    try {
      await axios.post(`/api/crm/leads/${id}/notes`, { content: noteContent }, { headers: { Authorization: `Bearer ${token}` } });
      setNoteContent('');
      fetchDetail();
    } catch (e:any) { setError(e.message); }
  };

  const addTask = async () => {
    if (!taskForm.title.trim()) return;
    try {
      await axios.post(`/api/crm/leads/${id}/tasks`, taskForm, { headers: { Authorization: `Bearer ${token}` } });
      setTaskForm({ title:'', description:'', dueDate:'', priority:'Medium' });
      fetchDetail();
    } catch (e:any) { setError(e.message); }
  };

  const changeStage = async (stage:string) => {
    setStageUpdating(true);
    try {
      await axios.put(`/api/crm/leads/${id}`, { stage }, { headers: { Authorization: `Bearer ${token}` } });
      fetchDetail();
    } catch (e:any) { setError(e.message); }
    finally { setStageUpdating(false); }
  };

  const completeTask = async (taskId:number) => {
    try {
      await axios.post(`/api/crm/tasks/${taskId}/complete`, {}, { headers: { Authorization: `Bearer ${token}` } });
      fetchDetail();
    } catch (e:any) { setError(e.message); }
  };

  return (
    <AdminLayout>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/admin/crm"><Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4" /></Button></Link>
          <h2 className="text-2xl font-bold">Lead Detail</h2>
        </div>
        {data?.lead && (
          <Select value={data.lead.stage} onValueChange={changeStage} disabled={stageUpdating}>
            {stages.map(s => <option key={s} value={s}>{s}</option>)}
          </Select>
        )}
      </div>
      {error && <div className="mb-4 rounded bg-red-100 p-3 text-sm text-red-700">{error}</div>}
      {loading || !data ? <div>Loading...</div> : (
        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-4 md:col-span-1">
            <Card>
              <CardHeader><CardTitle>{data.lead.name}</CardTitle></CardHeader>
              <CardContent className="space-y-1 text-sm">
                {data.lead.company && <div><span className="font-medium">Company:</span> {data.lead.company}</div>}
                {data.lead.email && <div><span className="font-medium">Email:</span> {data.lead.email}</div>}
                {data.lead.phone && <div><span className="font-medium">Phone:</span> {data.lead.phone}</div>}
                <div><span className="font-medium">Stage:</span> {data.lead.stage}</div>
                <div><span className="font-medium">Value:</span> ₹{data.lead.value || 0}</div>
                {data.lead.source && <div><span className="font-medium">Source:</span> {data.lead.source}</div>}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Add Note</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                <Textarea placeholder="Note content" value={noteContent} onChange={e=>setNoteContent(e.target.value)} />
                <Button size="sm" disabled={!noteContent.trim()} onClick={addNote}>Add Note</Button>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>New Task</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                <Input placeholder="Title" value={taskForm.title} onChange={e=>setTaskForm(f=>({...f,title:e.target.value}))} />
                <Input placeholder="Description" value={taskForm.description} onChange={e=>setTaskForm(f=>({...f,description:e.target.value}))} />
                <Input type="date" value={taskForm.dueDate} onChange={e=>setTaskForm(f=>({...f,dueDate:e.target.value}))} />
                <Select value={taskForm.priority} onValueChange={(v:string)=>setTaskForm(f=>({...f,priority:v}))}>
                  <option value="Low">Low</option>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                </Select>
                <Button size="sm" disabled={!taskForm.title.trim()} onClick={addTask}>Add Task</Button>
              </CardContent>
            </Card>
          </div>
          <div className="md:col-span-2 space-y-4">
            <Card>
              <CardHeader><CardTitle>Notes</CardTitle></CardHeader>
              <CardContent className="space-y-2 max-h-64 overflow-y-auto">
                {data.notes.map(n => (
                  <div key={n.id} className="rounded border p-2 text-sm">
                    <div className="font-medium">#{n.id} {n.pinned && <CheckCircle2 className="inline h-4 w-4 text-green-600" />}</div>
                    <div>{n.content}</div>
                    <div className="text-xs text-muted-foreground">{new Date(n.createdAt).toLocaleString()}</div>
                  </div>
                ))}
                {data.notes.length === 0 && <div className="text-xs text-muted-foreground">No notes yet.</div>}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Tasks</CardTitle></CardHeader>
              <CardContent className="space-y-2 max-h-64 overflow-y-auto">
                {data.tasks.map(t => (
                  <div key={t.id} className="flex items-start justify-between rounded border p-2 text-sm">
                    <div>
                      <div className="font-medium">{t.title}</div>
                      {t.description && <div className="text-xs text-muted-foreground">{t.description}</div>}
                      {t.dueDate && <div className="text-xs">Due: {new Date(t.dueDate).toLocaleDateString()}</div>}
                      {t.completed && <div className="text-xs text-green-600">Completed</div>}
                    </div>
                    {!t.completed && <Button size="sm" variant="outline" onClick={()=>completeTask(t.id)}>Mark Done</Button>}
                  </div>
                ))}
                {data.tasks.length === 0 && <div className="text-xs text-muted-foreground">No tasks yet.</div>}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Activity Timeline</CardTitle></CardHeader>
              <CardContent className="space-y-2 max-h-64 overflow-y-auto">
                {data.activities.map(a => (
                  <div key={a.id} className="rounded border p-2 text-xs">
                    <div className="font-medium">{a.type} {a.subject && ('• ' + a.subject)}</div>
                    {a.content && <div>{a.content}</div>}
                    <div className="text-muted-foreground">{new Date(a.createdAt).toLocaleString()}</div>
                  </div>
                ))}
                {data.activities.length === 0 && <div className="text-xs text-muted-foreground">No activities yet.</div>}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </AdminLayout>
  );
};

export default CRMLeadDetail;
