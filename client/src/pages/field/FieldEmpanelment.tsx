import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Plus, Building2, CheckCircle2, Clock, AlertCircle,
  ChevronDown, ChevronUp, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import {
  getEmpanelmentApplications, createEmpanelmentApplication,
  updateEmpanelmentApplication, addEmpanelmentMilestone, updateEmpanelmentMilestone,
} from './fieldClient';

type Milestone = { id: number; milestone: string; status: string; due_date?: string; notes?: string };
type Application = {
  id: number; insurer_name: string; insurer_type?: string;
  contact_person?: string; contact_phone?: string; status: string;
  panel_type: string; target_date?: string; empanelled_date?: string;
  tariff_agreed: boolean; mou_signed: boolean; panel_code?: string; notes?: string;
  milestones?: Milestone[];
};

const INSURER_TYPES = [
  { value: 'private_insurer', label: 'Private Insurer' },
  { value: 'tpa', label: 'TPA' },
  { value: 'government', label: 'Govt Scheme' },
  { value: 'esic', label: 'ESIC' },
  { value: 'cghs', label: 'CGHS' },
  { value: 'echs', label: 'ECHS' },
  { value: 'other', label: 'Other' },
];

const STATUSES = [
  { value: '', label: 'All' },
  { value: 'identified', label: 'Identified' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'document_collection', label: 'Documents' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'under_review', label: 'Under Review' },
  { value: 'site_visit_scheduled', label: 'Site Visit' },
  { value: 'approved', label: 'Approved' },
  { value: 'empanelled', label: 'Empanelled' },
  { value: 'renewal_due', label: 'Renewal Due' },
  { value: 'rejected', label: 'Rejected' },
];

const DEFAULT_MILESTONES = [
  'Initial meeting / introductory call',
  'Document checklist shared',
  'Documents collected & verified',
  'Application form submitted',
  'Site inspection scheduled',
  'Site inspection completed',
  'Tariff negotiation',
  'MoU / agreement signed',
  'Panel code issued',
  'Cashless portal access',
];

function statusColor(s: string) {
  const m: Record<string, string> = {
    identified: 'bg-slate-100 text-slate-500',
    contacted: 'bg-blue-50 text-blue-600',
    document_collection: 'bg-amber-50 text-amber-700',
    submitted: 'bg-blue-100 text-blue-700',
    under_review: 'bg-violet-50 text-violet-700',
    site_visit_scheduled: 'bg-orange-50 text-orange-700',
    site_visit_done: 'bg-orange-100 text-orange-700',
    approved: 'bg-green-50 text-green-700',
    empanelled: 'bg-emerald-100 text-emerald-800',
    renewal_due: 'bg-yellow-50 text-yellow-700',
    renewal_submitted: 'bg-yellow-100 text-yellow-800',
    rejected: 'bg-red-50 text-red-600',
    on_hold: 'bg-gray-100 text-gray-400',
  };
  return m[s] ?? 'bg-gray-100 text-gray-500';
}

export default function FieldEmpanelment() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [apps, setApps] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('');
  const [expanded, setExpanded] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showMilestone, setShowMilestone] = useState<number | null>(null);

  const [form, setForm] = useState({
    insurer_name: '', insurer_type: 'private_insurer',
    contact_person: '', contact_phone: '', contact_email: '',
    panel_type: 'cashless', target_date: '', notes: '',
  });

  const [milestoneForm, setMilestoneForm] = useState({ milestone: '', due_date: '', notes: '' });
  const [customMilestone, setCustomMilestone] = useState('');
  const [statusUpdate, setStatusUpdate] = useState<{ appId: number; status: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getEmpanelmentApplications(filterStatus ? { status: filterStatus } : {});
      setApps(data);
    } finally { setLoading(false); }
  }, [filterStatus]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    if (!form.insurer_name.trim()) { toast({ title: 'Insurer name is required', variant: 'destructive' }); return; }
    try {
      const app = await createEmpanelmentApplication({
        insurer_name: form.insurer_name, insurer_type: form.insurer_type || undefined,
        contact_person: form.contact_person || undefined, contact_phone: form.contact_phone || undefined,
        contact_email: form.contact_email || undefined, panel_type: form.panel_type || undefined,
        target_date: form.target_date || undefined, notes: form.notes || undefined,
      });
      // add default milestones in background
      const defaults = DEFAULT_MILESTONES.slice(0, 5);
      await Promise.all(defaults.map(m => addEmpanelmentMilestone(app.id, { milestone: m })));
      toast({ title: 'Application created ✓' });
      setShowCreate(false);
      setForm({ insurer_name: '', insurer_type: 'private_insurer', contact_person: '', contact_phone: '', contact_email: '', panel_type: 'cashless', target_date: '', notes: '' });
      load();
    } catch (e: any) {
      toast({ title: 'Failed', description: e?.response?.data?.error || e.message, variant: 'destructive' });
    }
  };

  const handleStatusUpdate = async (appId: number, newStatus: string) => {
    try {
      await updateEmpanelmentApplication(appId, { status: newStatus });
      toast({ title: 'Status updated ✓' });
      setStatusUpdate(null);
      load();
    } catch (e: any) {
      toast({ title: 'Failed', description: e?.response?.data?.error || e.message, variant: 'destructive' });
    }
  };

  const handleMilestone = async (appId: number) => {
    const m = milestoneForm.milestone || customMilestone;
    if (!m.trim()) { toast({ title: 'Milestone is required', variant: 'destructive' }); return; }
    try {
      await addEmpanelmentMilestone(appId, {
        milestone: m, due_date: milestoneForm.due_date || undefined, notes: milestoneForm.notes || undefined,
      });
      toast({ title: 'Milestone added ✓' });
      setShowMilestone(null);
      setMilestoneForm({ milestone: '', due_date: '', notes: '' });
      setCustomMilestone('');
      load();
    } catch (e: any) {
      toast({ title: 'Failed', description: e?.response?.data?.error || e.message, variant: 'destructive' });
    }
  };

  const toggleMilestone = async (appId: number, mid: number, currentStatus: string) => {
    const next = currentStatus === 'done' ? 'pending' : 'done';
    try {
      await updateEmpanelmentMilestone(appId, mid, { status: next });
      load();
    } catch {}
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-10">
      <div className="bg-[#17365D] text-white px-4 pt-10 pb-6">
        <button onClick={() => navigate('/team/field')} className="flex items-center gap-2 text-blue-200 text-sm mb-3 hover:text-white">
          <ArrowLeft size={15} /> Dashboard
        </button>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Empanelment</h1>
            <p className="text-blue-200 text-sm mt-0.5">{apps.length} application{apps.length !== 1 ? 's' : ''}</p>
          </div>
          <Button size="sm" onClick={() => setShowCreate(true)} className="bg-white/15 hover:bg-white/25 text-white border-0">
            <Plus size={15} className="mr-1" /> New
          </Button>
        </div>
      </div>

      {/* Status filter */}
      <div className="px-4 py-3 bg-white border-b border-slate-100 flex gap-2 overflow-x-auto">
        {STATUSES.slice(0, 7).map(s => (
          <button key={s.value} onClick={() => setFilterStatus(s.value)}
            className={`px-3 py-1 rounded-full text-xs font-medium flex-shrink-0 border transition-colors ${
              filterStatus === s.value ? 'bg-[#17365D] text-white border-[#17365D]' : 'bg-white text-slate-600 border-slate-200'}`}>
            {s.label}
          </button>
        ))}
      </div>

      <div className="px-4 pt-4 space-y-3">
        {loading ? [1,2,3].map(i => <div key={i} className="h-24 bg-white animate-pulse rounded-xl" />) :
         apps.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <Building2 size={36} className="mx-auto mb-3 opacity-25" />
            <p className="font-medium">No empanelment applications</p>
            <Button onClick={() => setShowCreate(true)} className="mt-4 bg-[#17365D] text-white"><Plus size={14} className="mr-1" />Add Application</Button>
          </div>
        ) : apps.map(app => {
          const milestones = app.milestones ?? [];
          const done = milestones.filter(m => m.status === 'done').length;
          const pct = milestones.length ? Math.round((done / milestones.length) * 100) : 0;
          const isOpen = expanded === app.id;

          return (
            <Card key={app.id} className="shadow-sm border border-slate-100">
              <CardContent className="p-4">
                <div className="flex items-start gap-3 cursor-pointer" onClick={() => setExpanded(isOpen ? null : app.id)}>
                  <Building2 size={15} className="text-slate-400 mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-sm text-slate-800 truncate">{app.insurer_name}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${statusColor(app.status)}`}>
                        {app.status.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {INSURER_TYPES.find(t => t.value === app.insurer_type)?.label ?? app.insurer_type ?? ''}
                      {app.contact_person ? ' · ' + app.contact_person : ''}
                    </p>
                    {milestones.length > 0 && (
                      <div className="flex items-center gap-2 mt-2">
                        <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full bg-[#0D9488] rounded-full transition-all" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-xs text-slate-400">{done}/{milestones.length}</span>
                      </div>
                    )}
                  </div>
                  {isOpen ? <ChevronUp size={14} className="text-slate-400 flex-shrink-0 mt-1" /> : <ChevronDown size={14} className="text-slate-400 flex-shrink-0 mt-1" />}
                </div>

                {isOpen && (
                  <div className="mt-4 space-y-3 border-t border-slate-100 pt-3">
                    {/* Info rows */}
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      {app.target_date && <div><span className="text-slate-400">Target: </span><span>{new Date(app.target_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span></div>}
                      {app.panel_code && <div><span className="text-slate-400">Panel: </span><span className="font-medium">{app.panel_code}</span></div>}
                      <div className="flex items-center gap-1">{app.tariff_agreed ? <CheckCircle2 size={12} className="text-green-600"/> : <Clock size={12} className="text-slate-300"/>}<span className={app.tariff_agreed ? 'text-green-700' : 'text-slate-400'}>Tariff</span></div>
                      <div className="flex items-center gap-1">{app.mou_signed ? <CheckCircle2 size={12} className="text-green-600"/> : <Clock size={12} className="text-slate-300"/>}<span className={app.mou_signed ? 'text-green-700' : 'text-slate-400'}>MoU</span></div>
                    </div>

                    {/* Milestones */}
                    {milestones.length > 0 && (
                      <div className="space-y-1.5">
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Milestones</p>
                        {milestones.map(m => (
                          <div key={m.id} className="flex items-center gap-2 cursor-pointer" onClick={() => toggleMilestone(app.id, m.id, m.status)}>
                            {m.status === 'done' ? <CheckCircle2 size={14} className="text-green-600 flex-shrink-0" /> :
                             m.status === 'in_progress' ? <Clock size={14} className="text-amber-500 flex-shrink-0" /> :
                             <div className="w-3.5 h-3.5 rounded-full border-2 border-slate-300 flex-shrink-0" />}
                            <span className={`text-sm ${m.status === 'done' ? 'line-through text-slate-400' : 'text-slate-700'}`}>{m.milestone}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-2 flex-wrap">
                      <Button size="sm" variant="outline" className="text-xs h-7 border-slate-200" onClick={() => setShowMilestone(app.id)}>
                        <Plus size={11} className="mr-1" /> Milestone
                      </Button>
                      <Button size="sm" variant="outline" className="text-xs h-7 border-[#17365D] text-[#17365D]" onClick={() => setStatusUpdate({ appId: app.id, status: app.status })}>
                        Update Status
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Create application sheet */}
      {showCreate && (
        <BottomSheet title="New Empanelment Application" onClose={() => setShowCreate(false)}>
          <div className="space-y-3 pt-1">
            <LF label="Insurer / Scheme name *">
              <input value={form.insurer_name} onChange={e => setForm(f => ({ ...f, insurer_name: e.target.value }))}
                placeholder="Star Health, CGHS, Bajaj Allianz…"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#17365D]" />
            </LF>
            <div className="grid grid-cols-2 gap-3">
              <LF label="Type">
                <select value={form.insurer_type} onChange={e => setForm(f => ({ ...f, insurer_type: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#17365D]">
                  {INSURER_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </LF>
              <LF label="Panel type">
                <select value={form.panel_type} onChange={e => setForm(f => ({ ...f, panel_type: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#17365D]">
                  <option value="cashless">Cashless</option>
                  <option value="reimbursement">Reimbursement</option>
                  <option value="both">Both</option>
                </select>
              </LF>
            </div>
            <LF label="Contact person">
              <input value={form.contact_person} onChange={e => setForm(f => ({ ...f, contact_person: e.target.value }))}
                placeholder="Name at insurer"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#17365D]" />
            </LF>
            <div className="grid grid-cols-2 gap-3">
              <LF label="Phone">
                <input value={form.contact_phone} onChange={e => setForm(f => ({ ...f, contact_phone: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#17365D]" />
              </LF>
              <LF label="Target date">
                <input type="date" value={form.target_date} onChange={e => setForm(f => ({ ...f, target_date: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#17365D]" />
              </LF>
            </div>
            <LF label="Notes">
              <textarea rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-[#17365D]" />
            </LF>
            <Button onClick={handleCreate} className="w-full bg-[#17365D] text-white">Create Application</Button>
          </div>
        </BottomSheet>
      )}

      {/* Add milestone sheet */}
      {showMilestone !== null && (
        <BottomSheet title="Add Milestone" onClose={() => setShowMilestone(null)}>
          <div className="space-y-3 pt-1">
            <LF label="Milestone">
              <select value={milestoneForm.milestone} onChange={e => { setMilestoneForm(f => ({ ...f, milestone: e.target.value })); setCustomMilestone(''); }}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#17365D]">
                <option value="">— Choose or type below —</option>
                {DEFAULT_MILESTONES.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </LF>
            <LF label="Or custom milestone">
              <input value={customMilestone} onChange={e => { setCustomMilestone(e.target.value); setMilestoneForm(f => ({ ...f, milestone: '' })); }}
                placeholder="Custom step…"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#17365D]" />
            </LF>
            <LF label="Due date">
              <input type="date" value={milestoneForm.due_date} onChange={e => setMilestoneForm(f => ({ ...f, due_date: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#17365D]" />
            </LF>
            <Button onClick={() => handleMilestone(showMilestone!)} className="w-full bg-[#17365D] text-white">Add Milestone</Button>
          </div>
        </BottomSheet>
      )}

      {/* Status update sheet */}
      {statusUpdate && (
        <BottomSheet title="Update Application Status" onClose={() => setStatusUpdate(null)}>
          <div className="space-y-2 pt-1">
            {STATUSES.filter(s => s.value).map(s => (
              <button key={s.value} onClick={() => handleStatusUpdate(statusUpdate.appId, s.value)}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border text-sm ${
                  statusUpdate.status === s.value ? 'bg-[#17365D] text-white border-[#17365D]' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}>
                {s.label}
                {statusUpdate.status === s.value && <CheckCircle2 size={14} />}
              </button>
            ))}
          </div>
        </BottomSheet>
      )}
    </div>
  );
}

function BottomSheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" onClick={onClose}>
      <div className="bg-black/40 absolute inset-0" />
      <div className="relative bg-white rounded-t-2xl shadow-2xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-4 border-b border-slate-100 flex-shrink-0">
          <h2 className="font-semibold text-slate-800 truncate pr-4">{title}</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100"><X size={18} /></button>
        </div>
        <div className="overflow-y-auto flex-1 px-4 pb-6">{children}</div>
      </div>
    </div>
  );
}

function LF({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="text-xs text-slate-500 block mb-1">{label}</label>{children}</div>;
}
