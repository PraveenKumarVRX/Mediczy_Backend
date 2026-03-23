import { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Target, Users, DollarSign, TrendingUp, Activity, BarChart3,
  ArrowUpRight, ArrowDownRight, Clock, AlertCircle, LogOut,
  Phone, Mail, Calendar, FileText, Briefcase, ChevronRight, ChevronLeft,
  Home, UserPlus, PieChart, Settings, Plus, Search, Filter, Trash2, Edit,
  CheckCircle, XCircle, MoreHorizontal, Eye, X, Save,
} from 'lucide-react';
import api from '@/utils/api';

// ─── Shared CRM layout wrapper ────────────────────────────────────────────────

const navItems = [
  { icon: Home, label: 'Dashboard', path: '/crm/dashboard' },
  { icon: Target, label: 'Leads', path: '/crm/leads' },
  { icon: Briefcase, label: 'Deals', path: '/crm/deals' },
  { icon: Users, label: 'Contacts', path: '/crm/contacts' },
  { icon: Activity, label: 'Activities', path: '/crm/activities' },
  { icon: BarChart3, label: 'Pipeline', path: '/crm/pipeline' },
  { icon: PieChart, label: 'Reports', path: '/crm/reports' },
];

function CRMLayout({ title, activePath, children }: { title: string; activePath: string; children: React.ReactNode }) {
  const navigate = useNavigate();
  const [crmUser, setCrmUser] = useState<any>(null);

  useEffect(() => {
    const token = localStorage.getItem('crmToken');
    if (!token) { navigate('/crm/login'); return; }
    try { const d = localStorage.getItem('crmUserData'); if (d) setCrmUser(JSON.parse(d)); } catch {}
  }, [navigate]);

  const handleLogout = async () => {
    try {
      const token = localStorage.getItem('crmToken');
      await api.post('/crm/logout', {}, { headers: { Authorization: `Bearer ${token}` } });
    } catch {}
    localStorage.removeItem('crmToken');
    localStorage.removeItem('crmRefreshToken');
    localStorage.removeItem('crmUserData');
    localStorage.removeItem('userType');
    navigate('/crm/login');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-lg border-b border-slate-200 shadow-sm">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 flex items-center justify-between h-14">
          <div className="flex items-center gap-3">
            <Link to="/crm/dashboard" className="p-2 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500">
              <Target className="h-5 w-5 text-white" />
            </Link>
            <h1 className="text-base font-bold text-slate-800">{title}</h1>
          </div>
          <nav className="hidden md:flex items-center gap-1">
            {navItems.map(({ icon: Icon, label, path }) => (
              <Link key={path} to={path}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors
                  ${activePath === path ? 'bg-emerald-50 text-emerald-700' : 'text-slate-600 hover:bg-slate-100'}`}>
                <Icon className="h-4 w-4" />{label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            {crmUser && <span className="text-sm text-slate-600 hidden lg:block">{crmUser.firstName} {crmUser.lastName}</span>}
            <Button variant="ghost" size="sm" onClick={handleLogout}><LogOut className="h-4 w-4 text-slate-500 hover:text-red-500" /></Button>
          </div>
        </div>
      </header>
      <main className="max-w-[1600px] mx-auto px-4 sm:px-6 py-6">{children}</main>
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 px-2 py-1 z-50">
        <div className="flex justify-around">
          {navItems.slice(0, 5).map(({ icon: Icon, label, path }) => (
            <Link key={path} to={path} className={`flex flex-col items-center gap-0.5 p-2 rounded-lg text-[10px] ${activePath === path ? 'text-emerald-600' : 'text-slate-400'}`}>
              <Icon className="h-5 w-5" />{label}
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}

function authHeaders() {
  const t = localStorage.getItem('crmToken');
  return t ? { Authorization: `Bearer ${t}` } : {};
}

// ─── Pagination helper ─────────────────────────────────────────────────────────
function Pagination({ page, totalPages, setPage }: { page: number; totalPages: number; setPage: (p: number) => void }) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-center gap-2 mt-4">
      <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft className="h-4 w-4" /></Button>
      <span className="text-sm text-slate-600">Page {page} of {totalPages}</span>
      <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}><ChevronRight className="h-4 w-4" /></Button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// LEADS PAGE
// ═══════════════════════════════════════════════════════════════════════════════

export function CRMLeadsPage() {
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [editLead, setEditLead] = useState<any>(null);
  const [form, setForm] = useState({ name: '', email: '', phone: '', company: '', source: 'manual', status: 'new', priority: 'medium', notes: '' });
  const navigate = useNavigate();

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = { page, limit: 25 };
      if (search) params.search = search;
      if (statusFilter !== 'all') params.status = statusFilter;
      const { data } = await api.get('/crm/leads', { headers: authHeaders(), params });
      if (data.success) { setLeads(data.data); setTotalPages(data.pagination?.totalPages || 1); }
    } catch (err: any) { if (err.response?.status === 401) navigate('/crm/login'); }
    finally { setLoading(false); }
  }, [page, search, statusFilter, navigate]);

  useEffect(() => { fetchLeads(); }, [fetchLeads]);

  const handleSave = async () => {
    try {
      if (editLead) {
        await api.put(`/crm/leads/${editLead.id}`, form, { headers: authHeaders() });
      } else {
        await api.post('/crm/leads', form, { headers: authHeaders() });
      }
      setShowForm(false); setEditLead(null);
      setForm({ name: '', email: '', phone: '', company: '', source: 'manual', status: 'new', priority: 'medium', notes: '' });
      fetchLeads();
    } catch {}
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Delete this lead?')) return;
    try { await api.delete(`/crm/leads/${id}`, { headers: authHeaders() }); fetchLeads(); } catch {}
  };

  const openEdit = (lead: any) => {
    setEditLead(lead);
    setForm({ name: lead.name, email: lead.email || '', phone: lead.phone || '', company: lead.company || '', source: lead.source || 'manual', status: lead.status, priority: lead.priority || 'medium', notes: lead.notes || '' });
    setShowForm(true);
  };

  const statusColors: Record<string, string> = { new: 'bg-blue-100 text-blue-700', contacted: 'bg-sky-100 text-sky-700', qualified: 'bg-indigo-100 text-indigo-700', converted: 'bg-emerald-100 text-emerald-700', lost: 'bg-red-100 text-red-700' };
  const priorityColors: Record<string, string> = { high: 'bg-red-100 text-red-700', medium: 'bg-yellow-100 text-yellow-700', low: 'bg-slate-100 text-slate-600' };

  return (
    <CRMLayout title="Leads Management" activePath="/crm/leads">
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-3 justify-between">
          <div className="flex gap-2 flex-1">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input placeholder="Search leads..." className="pl-9" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
            </div>
            <select className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white" value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}>
              <option value="all">All Status</option>
              {['new', 'contacted', 'qualified', 'converted', 'lost'].map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
            </select>
          </div>
          <Button onClick={() => { setEditLead(null); setForm({ name: '', email: '', phone: '', company: '', source: 'manual', status: 'new', priority: 'medium', notes: '' }); setShowForm(true); }}
            className="bg-emerald-500 hover:bg-emerald-600 text-white">
            <Plus className="h-4 w-4 mr-1" /> New Lead
          </Button>
        </div>

        {showForm && (
          <Card className="border-0 shadow-lg">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-sm">{editLead ? 'Edit Lead' : 'Create New Lead'}</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => { setShowForm(false); setEditLead(null); }}><X className="h-4 w-4" /></Button>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div><Label className="text-xs">Name *</Label><Input value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="Lead name" /></div>
                <div><Label className="text-xs">Email</Label><Input type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} placeholder="Email" /></div>
                <div><Label className="text-xs">Phone</Label><Input value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} placeholder="Phone" /></div>
                <div><Label className="text-xs">Company</Label><Input value={form.company} onChange={e => setForm({...form, company: e.target.value})} placeholder="Company" /></div>
                <div><Label className="text-xs">Source</Label>
                  <select className="w-full border rounded-md px-3 py-2 text-sm" value={form.source} onChange={e => setForm({...form, source: e.target.value})}>
                    {['manual', 'website', 'referral', 'social', 'cold_call', 'event', 'partner', 'advertisement'].map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                  </select>
                </div>
                <div><Label className="text-xs">Status</Label>
                  <select className="w-full border rounded-md px-3 py-2 text-sm" value={form.status} onChange={e => setForm({...form, status: e.target.value})}>
                    {['new', 'contacted', 'qualified', 'converted', 'lost'].map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                  </select>
                </div>
                <div><Label className="text-xs">Priority</Label>
                  <select className="w-full border rounded-md px-3 py-2 text-sm" value={form.priority} onChange={e => setForm({...form, priority: e.target.value})}>
                    {['low', 'medium', 'high'].map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
                  </select>
                </div>
                <div className="sm:col-span-2 lg:col-span-4"><Label className="text-xs">Notes</Label><Input value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} placeholder="Notes..." /></div>
              </div>
              <div className="flex justify-end mt-4">
                <Button onClick={handleSave} className="bg-emerald-500 hover:bg-emerald-600 text-white"><Save className="h-4 w-4 mr-1" /> {editLead ? 'Update' : 'Create'} Lead</Button>
              </div>
            </CardContent>
          </Card>
        )}

        {loading ? (
          <div className="py-20 text-center"><div className="w-8 h-8 border-4 border-emerald-100 border-t-emerald-500 rounded-full animate-spin mx-auto mb-2" /><p className="text-sm text-slate-500">Loading leads...</p></div>
        ) : leads.length === 0 ? (
          <div className="py-20 text-center"><Target className="h-12 w-12 text-slate-300 mx-auto mb-3" /><p className="text-slate-500">No leads found</p></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-slate-200 text-left">
                <th className="pb-2 font-medium text-slate-500">Name</th><th className="pb-2 font-medium text-slate-500">Company</th>
                <th className="pb-2 font-medium text-slate-500">Status</th><th className="pb-2 font-medium text-slate-500">Priority</th>
                <th className="pb-2 font-medium text-slate-500">Source</th><th className="pb-2 font-medium text-slate-500">Created</th>
                <th className="pb-2 font-medium text-slate-500 text-right">Actions</th>
              </tr></thead>
              <tbody>
                {leads.map(l => (
                  <tr key={l.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                    <td className="py-3">
                      <p className="font-medium text-slate-800">{l.name}</p>
                      <p className="text-xs text-slate-400">{l.email || l.phone}</p>
                    </td>
                    <td className="py-3 text-slate-600">{l.company || '-'}</td>
                    <td className="py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[l.status] || 'bg-slate-100 text-slate-600'}`}>{l.status}</span></td>
                    <td className="py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${priorityColors[l.priority] || ''}`}>{l.priority}</span></td>
                    <td className="py-3 text-slate-500 text-xs">{l.source}</td>
                    <td className="py-3 text-slate-400 text-xs">{new Date(l.created_at).toLocaleDateString()}</td>
                    <td className="py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(l)}><Edit className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="sm" onClick={() => handleDelete(l.id)}><Trash2 className="h-3.5 w-3.5 text-red-400" /></Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={page} totalPages={totalPages} setPage={setPage} />
      </div>
    </CRMLayout>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// DEALS PAGE
// ═══════════════════════════════════════════════════════════════════════════════

export function CRMDealsPage() {
  const [deals, setDeals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [editDeal, setEditDeal] = useState<any>(null);
  const [form, setForm] = useState({ title: '', value: '', stage: 'qualification', probability: '10', expected_close: '', contact_name: '', contact_email: '', company: '', notes: '' });
  const navigate = useNavigate();

  const stages = ['qualification', 'discovery', 'proposal', 'negotiation', 'contract', 'won', 'lost'];
  const stageColors: Record<string,string> = { qualification: 'bg-gray-100 text-gray-700', discovery: 'bg-blue-100 text-blue-700', proposal: 'bg-indigo-100 text-indigo-700', negotiation: 'bg-amber-100 text-amber-700', contract: 'bg-purple-100 text-purple-700', won: 'bg-emerald-100 text-emerald-700', lost: 'bg-red-100 text-red-700' };

  const fetchDeals = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = { page, limit: 25 };
      if (search) params.search = search;
      if (stageFilter !== 'all') params.stage = stageFilter;
      const { data } = await api.get('/crm/deals', { headers: authHeaders(), params });
      if (data.success) { setDeals(data.data); setTotalPages(data.pagination?.totalPages || 1); }
    } catch (err: any) { if (err.response?.status === 401) navigate('/crm/login'); }
    finally { setLoading(false); }
  }, [page, search, stageFilter, navigate]);

  useEffect(() => { fetchDeals(); }, [fetchDeals]);

  const handleSave = async () => {
    try {
      const payload = { ...form, value: parseFloat(form.value) || 0, probability: parseInt(form.probability) || 10 };
      if (editDeal) await api.put(`/crm/deals/${editDeal.id}`, payload, { headers: authHeaders() });
      else await api.post('/crm/deals', payload, { headers: authHeaders() });
      setShowForm(false); setEditDeal(null); fetchDeals();
    } catch {}
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Delete this deal?')) return;
    try { await api.delete(`/crm/deals/${id}`, { headers: authHeaders() }); fetchDeals(); } catch {}
  };

  const openEdit = (deal: any) => {
    setEditDeal(deal);
    setForm({ title: deal.title, value: deal.value?.toString() || '', stage: deal.stage, probability: deal.probability?.toString() || '10', expected_close: deal.expected_close?.split('T')[0] || '', contact_name: deal.contact_name || '', contact_email: deal.contact_email || '', company: deal.company || '', notes: deal.notes || '' });
    setShowForm(true);
  };

  const fmtCurr = (v: any) => `₹${(parseFloat(v || 0)).toLocaleString('en-IN')}`;

  return (
    <CRMLayout title="Deals Management" activePath="/crm/deals">
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-3 justify-between">
          <div className="flex gap-2 flex-1">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input placeholder="Search deals..." className="pl-9" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
            </div>
            <select className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white" value={stageFilter} onChange={e => { setStageFilter(e.target.value); setPage(1); }}>
              <option value="all">All Stages</option>
              {stages.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
            </select>
          </div>
          <Button onClick={() => { setEditDeal(null); setForm({ title: '', value: '', stage: 'qualification', probability: '10', expected_close: '', contact_name: '', contact_email: '', company: '', notes: '' }); setShowForm(true); }}
            className="bg-blue-500 hover:bg-blue-600 text-white">
            <Plus className="h-4 w-4 mr-1" /> New Deal
          </Button>
        </div>

        {showForm && (
          <Card className="border-0 shadow-lg">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-sm">{editDeal ? 'Edit Deal' : 'Create New Deal'}</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => { setShowForm(false); setEditDeal(null); }}><X className="h-4 w-4" /></Button>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div><Label className="text-xs">Title *</Label><Input value={form.title} onChange={e => setForm({...form, title: e.target.value})} placeholder="Deal title" /></div>
                <div><Label className="text-xs">Value (₹)</Label><Input type="number" value={form.value} onChange={e => setForm({...form, value: e.target.value})} placeholder="0" /></div>
                <div><Label className="text-xs">Stage</Label>
                  <select className="w-full border rounded-md px-3 py-2 text-sm" value={form.stage} onChange={e => setForm({...form, stage: e.target.value})}>
                    {stages.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                  </select>
                </div>
                <div><Label className="text-xs">Probability (%)</Label><Input type="number" min="0" max="100" value={form.probability} onChange={e => setForm({...form, probability: e.target.value})} /></div>
                <div><Label className="text-xs">Expected Close</Label><Input type="date" value={form.expected_close} onChange={e => setForm({...form, expected_close: e.target.value})} /></div>
                <div><Label className="text-xs">Contact Name</Label><Input value={form.contact_name} onChange={e => setForm({...form, contact_name: e.target.value})} placeholder="Contact" /></div>
                <div><Label className="text-xs">Contact Email</Label><Input type="email" value={form.contact_email} onChange={e => setForm({...form, contact_email: e.target.value})} /></div>
                <div><Label className="text-xs">Company</Label><Input value={form.company} onChange={e => setForm({...form, company: e.target.value})} placeholder="Company" /></div>
                <div className="sm:col-span-2 lg:col-span-4"><Label className="text-xs">Notes</Label><Input value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} placeholder="Notes..." /></div>
              </div>
              <div className="flex justify-end mt-4">
                <Button onClick={handleSave} className="bg-blue-500 hover:bg-blue-600 text-white"><Save className="h-4 w-4 mr-1" /> {editDeal ? 'Update' : 'Create'} Deal</Button>
              </div>
            </CardContent>
          </Card>
        )}

        {loading ? (
          <div className="py-20 text-center"><div className="w-8 h-8 border-4 border-blue-100 border-t-blue-500 rounded-full animate-spin mx-auto mb-2" /><p className="text-sm text-slate-500">Loading deals...</p></div>
        ) : deals.length === 0 ? (
          <div className="py-20 text-center"><Briefcase className="h-12 w-12 text-slate-300 mx-auto mb-3" /><p className="text-slate-500">No deals found</p></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-slate-200 text-left">
                <th className="pb-2 font-medium text-slate-500">Title</th><th className="pb-2 font-medium text-slate-500">Value</th>
                <th className="pb-2 font-medium text-slate-500">Stage</th><th className="pb-2 font-medium text-slate-500">Prob.</th>
                <th className="pb-2 font-medium text-slate-500">Company</th><th className="pb-2 font-medium text-slate-500">Close Date</th>
                <th className="pb-2 font-medium text-slate-500 text-right">Actions</th>
              </tr></thead>
              <tbody>
                {deals.map(d => (
                  <tr key={d.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                    <td className="py-3">
                      <p className="font-medium text-slate-800">{d.title}</p>
                      <p className="text-xs text-slate-400">{d.contact_name || d.contact_email || ''}</p>
                    </td>
                    <td className="py-3 font-medium text-slate-800">{fmtCurr(d.value)}</td>
                    <td className="py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${stageColors[d.stage] || ''}`}>{d.stage}</span></td>
                    <td className="py-3 text-slate-600">{d.probability}%</td>
                    <td className="py-3 text-slate-500">{d.company || '-'}</td>
                    <td className="py-3 text-slate-400 text-xs">{d.expected_close ? new Date(d.expected_close).toLocaleDateString() : '-'}</td>
                    <td className="py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(d)}><Edit className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="sm" onClick={() => handleDelete(d.id)}><Trash2 className="h-3.5 w-3.5 text-red-400" /></Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={page} totalPages={totalPages} setPage={setPage} />
      </div>
    </CRMLayout>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONTACTS PAGE
// ═══════════════════════════════════════════════════════════════════════════════

export function CRMContactsPage() {
  const [contacts, setContacts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editContact, setEditContact] = useState<any>(null);
  const [form, setForm] = useState({ name: '', email: '', phone: '', company: '', designation: '', city: '', state: '', notes: '' });
  const navigate = useNavigate();

  const fetchContacts = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = { page, limit: 25 };
      if (search) params.search = search;
      const { data } = await api.get('/crm/contacts', { headers: authHeaders(), params });
      if (data.success) { setContacts(data.data); setTotalPages(data.pagination?.totalPages || 1); }
    } catch (err: any) { if (err.response?.status === 401) navigate('/crm/login'); }
    finally { setLoading(false); }
  }, [page, search, navigate]);

  useEffect(() => { fetchContacts(); }, [fetchContacts]);

  const handleSave = async () => {
    try {
      if (editContact) await api.put(`/crm/contacts/${editContact.id}`, form, { headers: authHeaders() });
      else await api.post('/crm/contacts', form, { headers: authHeaders() });
      setShowForm(false); setEditContact(null); fetchContacts();
    } catch {}
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Delete this contact?')) return;
    try { await api.delete(`/crm/contacts/${id}`, { headers: authHeaders() }); fetchContacts(); } catch {}
  };

  const openEdit = (c: any) => {
    setEditContact(c);
    setForm({ name: c.name, email: c.email || '', phone: c.phone || '', company: c.company || '', designation: c.designation || '', city: c.city || '', state: c.state || '', notes: c.notes || '' });
    setShowForm(true);
  };

  return (
    <CRMLayout title="Contacts" activePath="/crm/contacts">
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-3 justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input placeholder="Search contacts..." className="pl-9" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
          </div>
          <Button onClick={() => { setEditContact(null); setForm({ name: '', email: '', phone: '', company: '', designation: '', city: '', state: '', notes: '' }); setShowForm(true); }}
            className="bg-purple-500 hover:bg-purple-600 text-white">
            <Plus className="h-4 w-4 mr-1" /> New Contact
          </Button>
        </div>

        {showForm && (
          <Card className="border-0 shadow-lg">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-sm">{editContact ? 'Edit Contact' : 'New Contact'}</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => { setShowForm(false); setEditContact(null); }}><X className="h-4 w-4" /></Button>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div><Label className="text-xs">Name *</Label><Input value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="Full name" /></div>
                <div><Label className="text-xs">Email</Label><Input type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} /></div>
                <div><Label className="text-xs">Phone</Label><Input value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} /></div>
                <div><Label className="text-xs">Company</Label><Input value={form.company} onChange={e => setForm({...form, company: e.target.value})} /></div>
                <div><Label className="text-xs">Designation</Label><Input value={form.designation} onChange={e => setForm({...form, designation: e.target.value})} /></div>
                <div><Label className="text-xs">City</Label><Input value={form.city} onChange={e => setForm({...form, city: e.target.value})} /></div>
                <div><Label className="text-xs">State</Label><Input value={form.state} onChange={e => setForm({...form, state: e.target.value})} /></div>
                <div className="sm:col-span-2 lg:col-span-4"><Label className="text-xs">Notes</Label><Input value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} placeholder="Notes..." /></div>
              </div>
              <div className="flex justify-end mt-4">
                <Button onClick={handleSave} className="bg-purple-500 hover:bg-purple-600 text-white"><Save className="h-4 w-4 mr-1" /> {editContact ? 'Update' : 'Create'}</Button>
              </div>
            </CardContent>
          </Card>
        )}

        {loading ? (
          <div className="py-20 text-center"><div className="w-8 h-8 border-4 border-purple-100 border-t-purple-500 rounded-full animate-spin mx-auto mb-2" /></div>
        ) : contacts.length === 0 ? (
          <div className="py-20 text-center"><Users className="h-12 w-12 text-slate-300 mx-auto mb-3" /><p className="text-slate-500">No contacts found</p></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-slate-200 text-left">
                <th className="pb-2 font-medium text-slate-500">Name</th><th className="pb-2 font-medium text-slate-500">Company</th>
                <th className="pb-2 font-medium text-slate-500">Phone</th><th className="pb-2 font-medium text-slate-500">Location</th>
                <th className="pb-2 font-medium text-slate-500 text-right">Actions</th>
              </tr></thead>
              <tbody>
                {contacts.map(c => (
                  <tr key={c.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                    <td className="py-3"><p className="font-medium text-slate-800">{c.name}</p><p className="text-xs text-slate-400">{c.email || c.designation}</p></td>
                    <td className="py-3 text-slate-600">{c.company || '-'}</td>
                    <td className="py-3 text-slate-600">{c.phone || '-'}</td>
                    <td className="py-3 text-slate-500 text-xs">{[c.city,c.state].filter(Boolean).join(', ') || '-'}</td>
                    <td className="py-3 text-right"><div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(c)}><Edit className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(c.id)}><Trash2 className="h-3.5 w-3.5 text-red-400" /></Button>
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={page} totalPages={totalPages} setPage={setPage} />
      </div>
    </CRMLayout>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ACTIVITIES PAGE
// ═══════════════════════════════════════════════════════════════════════════════

export function CRMActivitiesPage() {
  const [activities, setActivities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [typeFilter, setTypeFilter] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ type: 'call', title: '', description: '', scheduled_at: '' });
  const navigate = useNavigate();

  const types = ['call', 'email', 'meeting', 'task', 'note', 'followup'];
  const typeColors: Record<string,string> = { call: 'bg-purple-100 text-purple-700', email: 'bg-blue-100 text-blue-700', meeting: 'bg-cyan-100 text-cyan-700', task: 'bg-amber-100 text-amber-700', note: 'bg-slate-100 text-slate-700', followup: 'bg-pink-100 text-pink-700' };
  const typeIcons: Record<string,any> = { call: Phone, email: Mail, meeting: Calendar, task: CheckCircle, note: FileText, followup: Clock };

  const fetchActivities = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = { page, limit: 25 };
      if (typeFilter !== 'all') params.type = typeFilter;
      const { data } = await api.get('/crm/activities', { headers: authHeaders(), params });
      if (data.success) { setActivities(data.data); setTotalPages(data.pagination?.totalPages || 1); }
    } catch (err: any) { if (err.response?.status === 401) navigate('/crm/login'); }
    finally { setLoading(false); }
  }, [page, typeFilter, navigate]);

  useEffect(() => { fetchActivities(); }, [fetchActivities]);

  const handleSave = async () => {
    try {
      await api.post('/crm/activities', form, { headers: authHeaders() });
      setShowForm(false); setForm({ type: 'call', title: '', description: '', scheduled_at: '' }); fetchActivities();
    } catch {}
  };

  const handleComplete = async (id: number) => {
    try { await api.put(`/crm/activities/${id}/complete`, { outcome: 'completed' }, { headers: authHeaders() }); fetchActivities(); } catch {}
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Delete?')) return;
    try { await api.delete(`/crm/activities/${id}`, { headers: authHeaders() }); fetchActivities(); } catch {}
  };

  return (
    <CRMLayout title="Activities" activePath="/crm/activities">
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-3 justify-between">
          <select className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white" value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setPage(1); }}>
            <option value="all">All Types</option>
            {types.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
          </select>
          <Button onClick={() => setShowForm(true)} className="bg-purple-500 hover:bg-purple-600 text-white">
            <Plus className="h-4 w-4 mr-1" /> Log Activity
          </Button>
        </div>

        {showForm && (
          <Card className="border-0 shadow-lg">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-sm">Log New Activity</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setShowForm(false)}><X className="h-4 w-4" /></Button>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div><Label className="text-xs">Type *</Label>
                  <select className="w-full border rounded-md px-3 py-2 text-sm" value={form.type} onChange={e => setForm({...form, type: e.target.value})}>
                    {types.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                  </select>
                </div>
                <div><Label className="text-xs">Title *</Label><Input value={form.title} onChange={e => setForm({...form, title: e.target.value})} placeholder="Activity title" /></div>
                <div><Label className="text-xs">Scheduled At</Label><Input type="datetime-local" value={form.scheduled_at} onChange={e => setForm({...form, scheduled_at: e.target.value})} /></div>
                <div className="sm:col-span-2 lg:col-span-4"><Label className="text-xs">Description</Label><Input value={form.description} onChange={e => setForm({...form, description: e.target.value})} placeholder="Description..." /></div>
              </div>
              <div className="flex justify-end mt-4">
                <Button onClick={handleSave} className="bg-purple-500 hover:bg-purple-600 text-white"><Save className="h-4 w-4 mr-1" /> Log Activity</Button>
              </div>
            </CardContent>
          </Card>
        )}

        {loading ? (
          <div className="py-20 text-center"><div className="w-8 h-8 border-4 border-purple-100 border-t-purple-500 rounded-full animate-spin mx-auto mb-2" /></div>
        ) : activities.length === 0 ? (
          <div className="py-20 text-center"><Activity className="h-12 w-12 text-slate-300 mx-auto mb-3" /><p className="text-slate-500">No activities</p></div>
        ) : (
          <div className="space-y-2">
            {activities.map(a => {
              const Icon = typeIcons[a.type] || Activity;
              const isOverdue = !a.completed_at && a.scheduled_at && new Date(a.scheduled_at) < new Date();
              return (
                <div key={a.id} className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${isOverdue ? 'border-red-200 bg-red-50' : a.completed_at ? 'border-green-100 bg-green-50/50' : 'border-slate-100 bg-white hover:bg-slate-50'}`}>
                  <div className={`p-2 rounded-lg ${typeColors[a.type] || 'bg-slate-100'}`}><Icon className="h-4 w-4" /></div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${a.completed_at ? 'line-through text-slate-400' : 'text-slate-800'}`}>{a.title}</p>
                    <p className="text-xs text-slate-400">{a.description || ''}</p>
                    {a.scheduled_at && <p className="text-[10px] text-slate-400 mt-0.5"><Clock className="inline h-3 w-3 mr-1" />{new Date(a.scheduled_at).toLocaleString()}</p>}
                  </div>
                  <div className="flex items-center gap-1">
                    {!a.completed_at && <Button variant="ghost" size="sm" onClick={() => handleComplete(a.id)}><CheckCircle className="h-4 w-4 text-green-500" /></Button>}
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(a.id)}><Trash2 className="h-3.5 w-3.5 text-red-400" /></Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <Pagination page={page} totalPages={totalPages} setPage={setPage} />
      </div>
    </CRMLayout>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PIPELINE PAGE (Kanban-style)
// ═══════════════════════════════════════════════════════════════════════════════

export function CRMPipelinePage() {
  const [pipeline, setPipeline] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const stageLabels: Record<string,string> = { qualification: 'Qualification', discovery: 'Discovery', proposal: 'Proposal', negotiation: 'Negotiation', contract: 'Contract' };
  const stageColors: Record<string,string> = { qualification: 'border-gray-300 bg-gray-50', discovery: 'border-blue-300 bg-blue-50', proposal: 'border-indigo-300 bg-indigo-50', negotiation: 'border-amber-300 bg-amber-50', contract: 'border-purple-300 bg-purple-50' };

  useEffect(() => {
    const fetchPipeline = async () => {
      try {
        const { data } = await api.get('/crm/deals/pipeline', { headers: authHeaders() });
        if (data.success) setPipeline(data.data);
      } catch (err: any) { if (err.response?.status === 401) navigate('/crm/login'); }
      finally { setLoading(false); }
    };
    fetchPipeline();
  }, [navigate]);

  const fmtCurr = (v: any) => `₹${(parseFloat(v || 0)).toLocaleString('en-IN')}`;

  if (loading) return <CRMLayout title="Sales Pipeline" activePath="/crm/pipeline"><div className="py-20 text-center"><div className="w-8 h-8 border-4 border-emerald-100 border-t-emerald-500 rounded-full animate-spin mx-auto" /></div></CRMLayout>;

  const orderedStages = ['qualification', 'discovery', 'proposal', 'negotiation', 'contract'];
  const pipelineMap = Object.fromEntries(pipeline.map(p => [p.stage, p]));
  const totalPipeline = pipeline.reduce((s, p) => s + parseFloat(p.total_value || 0), 0);
  const totalWeighted = pipeline.reduce((s, p) => s + parseFloat(p.weighted_value || 0), 0);

  return (
    <CRMLayout title="Sales Pipeline" activePath="/crm/pipeline">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <div>
            <p className="text-2xl font-bold text-slate-900">{fmtCurr(totalPipeline)}</p>
            <p className="text-sm text-slate-500">Total pipeline value ({fmtCurr(totalWeighted)} weighted)</p>
          </div>
          <Link to="/crm/deals">
            <Button className="bg-blue-500 hover:bg-blue-600 text-white"><Plus className="h-4 w-4 mr-1" /> New Deal</Button>
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          {orderedStages.map(stage => {
            const data = pipelineMap[stage] || { count: 0, total_value: '0', weighted_value: '0' };
            return (
              <Card key={stage} className={`border-2 ${stageColors[stage] || 'border-slate-200'}`}>
                <CardHeader className="pb-2 pt-3 px-4">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-600">{stageLabels[stage] || stage}</CardTitle>
                    <span className="text-xs font-bold bg-white px-2 py-0.5 rounded-full shadow-sm">{parseInt(data.count)}</span>
                  </div>
                </CardHeader>
                <CardContent className="px-4 pb-3">
                  <p className="text-lg font-bold text-slate-800">{fmtCurr(data.total_value)}</p>
                  <p className="text-[10px] text-slate-500">Weighted: {fmtCurr(data.weighted_value)}</p>
                  <div className="mt-3 h-1.5 bg-white/80 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-400 rounded-full" style={{ width: `${totalPipeline > 0 ? (parseFloat(data.total_value || '0') / totalPipeline * 100) : 0}%` }} />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </CRMLayout>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// REPORTS PAGE
// ═══════════════════════════════════════════════════════════════════════════════

export function CRMReportsPage() {
  const [funnel, setFunnel] = useState<any[]>([]);
  const [revenue, setRevenue] = useState<any>(null);
  const [teamPerf, setTeamPerf] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('30');
  const navigate = useNavigate();

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const [fRes, rRes, tRes] = await Promise.all([
          api.get('/crm/reports/sales-funnel', { headers: authHeaders() }),
          api.get('/crm/reports/revenue', { headers: authHeaders(), params: { period } }),
          api.get('/crm/reports/team-performance', { headers: authHeaders() }),
        ]);
        if (fRes.data.success) setFunnel(fRes.data.data);
        if (rRes.data.success) setRevenue(rRes.data.data);
        if (tRes.data.success) setTeamPerf(tRes.data.data);
      } catch (err: any) { if (err.response?.status === 401) navigate('/crm/login'); }
      finally { setLoading(false); }
    };
    fetchAll();
  }, [period, navigate]);

  const fmtCurr = (v: any) => `₹${(parseFloat(v || 0)).toLocaleString('en-IN')}`;
  const funnelColors = ['bg-blue-500', 'bg-sky-500', 'bg-indigo-500', 'bg-violet-500', 'bg-amber-500', 'bg-emerald-500', 'bg-red-500'];
  const maxFunnel = Math.max(...funnel.map(f => parseInt(f.count || '0')), 1);

  if (loading) return <CRMLayout title="Sales Reports" activePath="/crm/reports"><div className="py-20 text-center"><div className="w-8 h-8 border-4 border-emerald-100 border-t-emerald-500 rounded-full animate-spin mx-auto" /></div></CRMLayout>;

  return (
    <CRMLayout title="Sales Reports" activePath="/crm/reports">
      <div className="space-y-6">
        {/* Sales Funnel */}
        <Card className="border-0 shadow-md">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold flex items-center gap-2"><TrendingUp className="h-4 w-4 text-emerald-500" /> Sales Funnel</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {funnel.map((f, i) => {
                const pct = maxFunnel > 0 ? Math.round((parseInt(f.count) / maxFunnel) * 100) : 0;
                return (
                  <div key={f.stage}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="capitalize text-slate-700 font-medium">{f.stage}</span>
                      <span className="text-slate-500">{f.count}</span>
                    </div>
                    <div className="h-6 bg-slate-100 rounded overflow-hidden relative">
                      <div className={`h-full ${funnelColors[i] || 'bg-slate-400'} rounded transition-all duration-700`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Revenue */}
        <Card className="border-0 shadow-md">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2"><DollarSign className="h-4 w-4 text-green-500" /> Revenue Report</CardTitle>
            <select className="border rounded-md px-2 py-1 text-xs" value={period} onChange={e => setPeriod(e.target.value)}>
              <option value="7">7 days</option><option value="30">30 days</option><option value="90">90 days</option><option value="365">1 year</option>
            </select>
          </CardHeader>
          <CardContent>
            {revenue && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-green-50 rounded-xl">
                    <p className="text-2xl font-bold text-green-700">{fmtCurr(revenue.totals?.total_revenue)}</p>
                    <p className="text-xs text-green-600">Total Revenue ({period} days)</p>
                  </div>
                  <div className="p-4 bg-blue-50 rounded-xl">
                    <p className="text-2xl font-bold text-blue-700">{revenue.totals?.total_won || 0}</p>
                    <p className="text-xs text-blue-600">Deals Won</p>
                  </div>
                </div>
                {revenue.daily?.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs text-slate-500 font-medium">Daily Breakdown</p>
                    {revenue.daily.slice(-10).map((d: any) => (
                      <div key={d.date} className="flex items-center justify-between text-xs py-1 border-b border-slate-50">
                        <span className="text-slate-500">{new Date(d.date).toLocaleDateString()}</span>
                        <span className="font-medium text-slate-700">{fmtCurr(d.revenue)} ({d.deals_won} deals)</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Team Performance */}
        <Card className="border-0 shadow-md">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold flex items-center gap-2"><Users className="h-4 w-4 text-purple-500" /> Team Performance</CardTitle></CardHeader>
          <CardContent>
            {teamPerf.length === 0 ? (
              <p className="text-sm text-slate-400 py-4 text-center">No team data yet</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-slate-200 text-left">
                    <th className="pb-2 font-medium text-slate-500">Name</th>
                    <th className="pb-2 font-medium text-slate-500 text-center">Leads</th>
                    <th className="pb-2 font-medium text-slate-500 text-center">Converted</th>
                    <th className="pb-2 font-medium text-slate-500 text-center">Deals Won</th>
                    <th className="pb-2 font-medium text-slate-500 text-right">Revenue</th>
                    <th className="pb-2 font-medium text-slate-500 text-center">Activities</th>
                  </tr></thead>
                  <tbody>
                    {teamPerf.map((t: any) => (
                      <tr key={t.id} className="border-b border-slate-100">
                        <td className="py-2"><p className="font-medium text-slate-800">{t.firstName} {t.lastName}</p><p className="text-xs text-slate-400">{t.email}</p></td>
                        <td className="py-2 text-center">{t.total_leads}</td>
                        <td className="py-2 text-center text-emerald-600 font-medium">{t.converted_leads}</td>
                        <td className="py-2 text-center text-blue-600 font-medium">{t.won_deals}</td>
                        <td className="py-2 text-right font-medium text-green-600">{fmtCurr(t.revenue)}</td>
                        <td className="py-2 text-center">{t.total_activities}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </CRMLayout>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// CRM SETTINGS PAGE
// ═══════════════════════════════════════════════════════════════════════════════

export function CRMSettingsPage() {
  const navigate = useNavigate();
  const [crmUser, setCrmUser] = useState<any>(null);

  useEffect(() => {
    const token = localStorage.getItem('crmToken');
    if (!token) { navigate('/crm/login'); return; }
    const fetchProfile = async () => {
      try {
        const { data } = await api.get('/crm/profile', { headers: authHeaders() });
        if (data.success) setCrmUser(data.crmUser);
      } catch {}
    };
    fetchProfile();
  }, [navigate]);

  return (
    <CRMLayout title="Settings" activePath="/crm/settings">
      <Card className="border-0 shadow-md max-w-2xl">
        <CardHeader><CardTitle className="text-base">CRM Profile</CardTitle></CardHeader>
        <CardContent>
          {crmUser ? (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 font-bold text-xl">
                  {(crmUser.firstName?.[0] || '') + (crmUser.lastName?.[0] || '')}
                </div>
                <div>
                  <p className="text-lg font-bold text-slate-800">{crmUser.firstName} {crmUser.lastName}</p>
                  <p className="text-sm text-slate-500">{crmUser.email}</p>
                  <p className="text-xs text-slate-400">{crmUser.designation} &middot; {crmUser.department}</p>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-400">Loading profile...</p>
          )}
        </CardContent>
      </Card>
    </CRMLayout>
  );
}
