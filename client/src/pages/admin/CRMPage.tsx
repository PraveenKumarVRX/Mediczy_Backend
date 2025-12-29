import { useEffect, useState } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, ClipboardList, CheckCircle2, Target, TrendingUp, Users, DollarSign } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { MODULE_COLORS } from '@/constants/admin-branding';
import axios from 'axios';

interface Lead {
  id: number; name: string; company?: string; stage: string; value: number; assignedTo?: number; source?: string; notesSnapshot?: string;
}

const stages = ['New','Qualified','Proposal','Negotiation','Closed Won','Closed Lost'];

const CRMPage = () => {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string|undefined>();
  const [filterStage, setFilterStage] = useState<string>('');
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name:'', company:'', email:'', phone:'', source:'', value:'', stage:'New' });
  const [stats, setStats] = useState<any>(null);

  const token = localStorage.getItem('adminToken');

  const fetchLeads = async () => {
    setLoading(true); setError(undefined);
    try {
      const params: any = {}; if (filterStage) params.stage = filterStage;
      const res = await axios.get('/api/crm/leads', { headers: { Authorization: `Bearer ${token}` }, params });
      setLeads(res.data.leads || []);
    } catch (e:any) { setError(e.message); }
    finally { setLoading(false); }
  };

  const fetchStats = async () => {
    try {
      const res = await axios.get('/api/crm/stats', { headers: { Authorization: `Bearer ${token}` } });
      setStats(res.data);
    } catch (e:any) { console.error('Failed to fetch CRM stats', e); }
  };

  useEffect(() => { fetchLeads(); fetchStats(); }, [filterStage]);

  const createLead = async () => {
    setCreating(true);
    try {
      const payload = { ...form, value: parseFloat(form.value || '0') };
      const res = await axios.post('/api/crm/leads', payload, { headers: { Authorization: `Bearer ${token}` } });
      setShowCreate(false); setForm({ name:'', company:'', email:'', phone:'', source:'', value:'', stage:'New' });
      setLeads([res.data.lead, ...leads]);
    } catch (e:any) { setError(e.message); }
    finally { setCreating(false); }
  };

  const grouped = stages.map(stage => ({ stage, items: leads.filter(l => l.stage === stage) }));
  
  const colors = MODULE_COLORS.crm;

  return (
    <AdminLayout>
      {/* Standardized Header */}
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className={cn(
              "p-3 rounded-xl bg-gradient-to-br border shadow-sm",
              colors.bg,
              colors.border
            )}>
              <Target className={cn("h-6 w-6", colors.text)} />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">CRM Pipeline</h1>
              <p className="text-muted-foreground text-sm md:text-base">Manage leads, conversions, and sales pipeline</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Select value={filterStage} onValueChange={(v:string) => setFilterStage(v)}>
              <option value="">All Stages</option>
              {stages.map(s => <option key={s} value={s}>{s}</option>)}
            </Select>
            <Dialog open={showCreate} onOpenChange={setShowCreate}>
              <DialogTrigger asChild>
                <Button className="gap-2 bg-gradient-to-r from-fuchsia-500 to-fuchsia-600 hover:from-fuchsia-600 hover:to-fuchsia-700">
                  <Plus className="h-4 w-4" /> New Lead
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Create Lead</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <Input placeholder="Name" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} />
                  <Input placeholder="Company" value={form.company} onChange={e=>setForm(f=>({...f,company:e.target.value}))} />
                  <Input placeholder="Email" value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))} />
                  <Input placeholder="Phone" value={form.phone} onChange={e=>setForm(f=>({...f,phone:e.target.value}))} />
                  <Input placeholder="Source" value={form.source} onChange={e=>setForm(f=>({...f,source:e.target.value}))} />
                  <Input placeholder="Value" value={form.value} onChange={e=>setForm(f=>({...f,value:e.target.value}))} />
                  <Select value={form.stage} onValueChange={(v:string)=>setForm(f=>({...f,stage:v}))}>
                    {stages.map(s => <option key={s} value={s}>{s}</option>)}
                  </Select>
                  <Button disabled={creating || !form.name} onClick={createLead} className="w-full bg-gradient-to-r from-fuchsia-500 to-fuchsia-600 hover:from-fuchsia-600 hover:to-fuchsia-700">
                    {creating ? 'Saving...' : 'Create Lead'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
        
        {error && <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-600">{error}</div>}
        
        {/* Stats Overview - Standardized */}
        {stats && (
          <div className="grid gap-4 md:grid-cols-4">
            <Card className="border border-border/50 shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="p-2 rounded-lg bg-emerald-500/10">
                    <DollarSign className="h-4 w-4 text-emerald-500" />
                  </div>
                </div>
                <div className="mt-3">
                  <p className="text-2xl font-bold text-foreground">₹{(stats.openValue||0).toLocaleString()}</p>
                  <p className="text-sm text-muted-foreground">Open Value</p>
                </div>
              </CardContent>
            </Card>
            <Card className="border border-border/50 shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="p-2 rounded-lg bg-blue-500/10">
                    <TrendingUp className="h-4 w-4 text-blue-500" />
                  </div>
                </div>
                <div className="mt-3">
                  <p className="text-2xl font-bold text-foreground">{stats.conversionRate||0}%</p>
                  <p className="text-sm text-muted-foreground">Conversion Rate</p>
                </div>
              </CardContent>
            </Card>
            <Card className="border border-border/50 shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="p-2 rounded-lg bg-fuchsia-500/10">
                    <Users className="h-4 w-4 text-fuchsia-500" />
                  </div>
                </div>
                <div className="mt-3">
                  <p className="text-2xl font-bold text-foreground">{Object.values(stats.counts||{}).reduce((a: number, b: any) => a + Number(b || 0), 0)}</p>
                  <p className="text-sm text-muted-foreground">Total Leads</p>
                </div>
              </CardContent>
            </Card>
            <Card className="border border-border/50 shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="p-2 rounded-lg bg-green-500/10">
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  </div>
                </div>
                <div className="mt-3">
                  <p className="text-2xl font-bold text-emerald-600">{stats.counts?.['Closed Won']||0}</p>
                  <p className="text-sm text-muted-foreground">Closed Won</p>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

      {/* Stage Bar Chart - Standardized */}
      {stats && stats.counts && (
        <Card className="border border-border/50 shadow-sm">
          <CardHeader><CardTitle className="text-sm font-medium text-foreground">Leads by Stage</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {stages.map(stage => {
                const count = stats.counts[stage] || 0;
                const total = Object.values(stats.counts).reduce((a:any,b:any)=>a+b,0) as number;
                const pct = total > 0 ? (count / total * 100).toFixed(1) : 0;
                const color = stage === 'Closed Won' ? 'bg-emerald-500' : stage === 'Closed Lost' ? 'bg-red-500' : 'bg-fuchsia-500';
                return (
                  <div key={stage}>
                    <div className="mb-1 flex justify-between text-xs">
                      <span className="font-medium text-foreground">{stage}</span>
                      <span className="text-muted-foreground">{count} ({pct}%)</span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-muted">
                      <div className={`h-2 rounded-full ${color}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Source Distribution - Standardized */}
      {stats && stats.sourceCounts && Object.keys(stats.sourceCounts).length > 0 && (
        <Card className="border border-border/50 shadow-sm">
          <CardHeader><CardTitle className="text-sm font-medium text-foreground">Leads by Source</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {Object.entries(stats.sourceCounts).map(([source, count]: [string, any]) => (
                <div key={source} className="flex justify-between text-sm">
                  <span className="font-medium text-foreground">{source}</span>
                  <span className="text-muted-foreground">{count}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Kanban Board - Standardized */}
      {loading ? (
        <div className="flex items-center justify-center p-8 text-muted-foreground">Loading...</div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {grouped.map(col => (
            <Card key={col.stage} className="flex h-[500px] flex-col border border-border/50 shadow-sm">
              <CardHeader className="pb-2 border-b border-border/30">
                <CardTitle className="text-sm flex items-center gap-2 text-foreground">
                  {col.stage === 'Closed Won' ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  ) : (
                    <ClipboardList className="h-4 w-4 text-fuchsia-500" />
                  )}
                  {col.stage}
                </CardTitle>
                <div className="text-xs text-muted-foreground">{col.items.length} lead(s)</div>
              </CardHeader>
              <CardContent className="flex-1 overflow-y-auto space-y-2 p-3">
                {col.items.map(item => (
                  <Link 
                    to={`/admin/crm/lead/${item.id}`} 
                    key={item.id} 
                    className="block rounded-lg border border-border/50 bg-card p-3 shadow-sm hover:shadow-md hover:border-fuchsia-500/30 transition-all"
                  >
                    <div className="text-sm font-medium text-foreground">{item.name}</div>
                    {item.company && <div className="text-xs text-muted-foreground">{item.company}</div>}
                    {item.value > 0 && <div className="text-xs font-semibold text-emerald-600 mt-1">₹{item.value.toLocaleString()}</div>}
                    {item.notesSnapshot && <div className="mt-1 line-clamp-2 text-xs italic text-muted-foreground">{item.notesSnapshot}</div>}
                  </Link>
                ))}
                {col.items.length === 0 && <div className="text-xs text-muted-foreground text-center py-4">No leads</div>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      </div>
    </AdminLayout>
  );
};

export default CRMPage;
