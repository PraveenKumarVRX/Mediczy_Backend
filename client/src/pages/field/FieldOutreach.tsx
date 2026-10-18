import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Users, MapPin, Phone, Mail, ChevronRight, X, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { getOutreachAccounts, createOutreachAccount, updateOutreachAccount } from './fieldClient';

const ACCOUNT_TYPES = [
  { value: 'ngo', label: 'NGO' },
  { value: 'rwa', label: 'RWA' },
  { value: 'government_hospital', label: 'Govt Hospital' },
  { value: 'govt_clinic', label: 'Govt Clinic' },
  { value: 'psu', label: 'PSU / Govt Enterprise' },
  { value: 'school', label: 'School' },
  { value: 'college', label: 'College / University' },
  { value: 'defence', label: 'Defence' },
  { value: 'police', label: 'Police' },
  { value: 'fire_dept', label: 'Fire Department' },
  { value: 'other_govt', label: 'Other Govt' },
];

const REL_STATUSES = [
  { value: 'prospect', label: 'Prospect', color: 'bg-slate-100 text-slate-500' },
  { value: 'contacted', label: 'Contacted', color: 'bg-blue-50 text-blue-700' },
  { value: 'active_partner', label: 'Active Partner', color: 'bg-green-50 text-green-700' },
  { value: 'camp_done', label: 'Camp Done', color: 'bg-emerald-50 text-emerald-700' },
  { value: 'renewal', label: 'Renewal', color: 'bg-amber-50 text-amber-700' },
  { value: 'inactive', label: 'Inactive', color: 'bg-gray-100 text-gray-400' },
];

type Account = {
  id: number; name: string; type: string; area?: string; city?: string;
  primary_contact?: string; contact_phone?: string; contact_email?: string;
  designation?: string; population_served?: number;
  relationship_status: string; next_followup_date?: string;
  last_camp_date?: string; notes?: string; tags?: string[];
};

function relColor(s: string) {
  return REL_STATUSES.find(r => r.value === s)?.color ?? 'bg-gray-100 text-gray-400';
}

function fmtDate(d?: string) {
  if (!d) return null;
  return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function FieldOutreach() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterRel, setFilterRel] = useState('');

  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState<Account | null>(null);
  const [showEdit, setShowEdit] = useState(false);

  const [form, setForm] = useState({
    name: '', type: 'ngo', area: '', city: '', pin_code: '',
    primary_contact: '', contact_phone: '', contact_email: '', designation: '',
    population_served: '', notes: '', address: '',
  });

  const [editForm, setEditForm] = useState({
    primary_contact: '', contact_phone: '', contact_email: '', designation: '',
    relationship_status: '', next_followup_date: '', last_camp_date: '',
    population_served: '', notes: '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getOutreachAccounts({
        type: filterType || undefined,
        relationship_status: filterRel || undefined,
        search: search.trim() || undefined,
      });
      setAccounts(data);
    } finally { setLoading(false); }
  }, [filterType, filterRel, search]);

  useEffect(() => {
    const t = setTimeout(() => load(), 400);
    return () => clearTimeout(t);
  }, [load]);

  const handleCreate = async () => {
    if (!form.name.trim() || !form.type) {
      toast({ title: 'Name and type are required', variant: 'destructive' }); return;
    }
    try {
      await createOutreachAccount({
        name: form.name, type: form.type,
        address: form.address || undefined, area: form.area || undefined,
        city: form.city || undefined, pin_code: form.pin_code || undefined,
        primary_contact: form.primary_contact || undefined,
        contact_phone: form.contact_phone || undefined,
        contact_email: form.contact_email || undefined,
        designation: form.designation || undefined,
        population_served: form.population_served ? parseInt(form.population_served) : undefined,
        notes: form.notes || undefined,
      });
      toast({ title: 'Account added ✓' });
      setShowCreate(false);
      setForm({ name: '', type: 'ngo', area: '', city: '', pin_code: '', primary_contact: '', contact_phone: '', contact_email: '', designation: '', population_served: '', notes: '', address: '' });
      load();
    } catch (e: any) {
      toast({ title: 'Failed', description: e?.response?.data?.error || e.message, variant: 'destructive' });
    }
  };

  const openEdit = (a: Account) => {
    setSelected(a);
    setEditForm({
      primary_contact: a.primary_contact ?? '',
      contact_phone: a.contact_phone ?? '',
      contact_email: a.contact_email ?? '',
      designation: a.designation ?? '',
      relationship_status: a.relationship_status,
      next_followup_date: a.next_followup_date ?? '',
      last_camp_date: a.last_camp_date ?? '',
      population_served: a.population_served?.toString() ?? '',
      notes: a.notes ?? '',
    });
    setShowEdit(true);
  };

  const handleEdit = async () => {
    if (!selected) return;
    try {
      await updateOutreachAccount(selected.id, {
        primary_contact: editForm.primary_contact || undefined,
        contact_phone: editForm.contact_phone || undefined,
        contact_email: editForm.contact_email || undefined,
        designation: editForm.designation || undefined,
        relationship_status: editForm.relationship_status || undefined,
        next_followup_date: editForm.next_followup_date || undefined,
        last_camp_date: editForm.last_camp_date || undefined,
        population_served: editForm.population_served ? parseInt(editForm.population_served) : undefined,
        notes: editForm.notes || undefined,
      });
      toast({ title: 'Updated ✓' });
      setShowEdit(false);
      setSelected(null);
      load();
    } catch (e: any) {
      toast({ title: 'Failed', description: e?.response?.data?.error || e.message, variant: 'destructive' });
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-10">
      <div className="bg-[#17365D] text-white px-4 pt-10 pb-6">
        <button onClick={() => navigate('/team/field')} className="flex items-center gap-2 text-blue-200 text-sm mb-3 hover:text-white">
          <ArrowLeft size={15} /> Dashboard
        </button>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Outreach Accounts</h1>
            <p className="text-blue-200 text-sm mt-0.5">NGO · RWA · Govt institutions</p>
          </div>
          <Button size="sm" onClick={() => setShowCreate(true)} className="bg-white/15 hover:bg-white/25 text-white border-0">
            <Plus size={15} className="mr-1" /> Add
          </Button>
        </div>
      </div>

      {/* Search + filters */}
      <div className="bg-white border-b border-slate-100 px-4 py-3 space-y-2">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or area…"
            className="w-full pl-8 border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#17365D]" />
        </div>
        <div className="flex gap-2 overflow-x-auto">
          <button onClick={() => setFilterType('')}
            className={`px-3 py-1 rounded-full text-xs font-medium flex-shrink-0 border transition-colors ${filterType === '' ? 'bg-[#17365D] text-white border-[#17365D]' : 'bg-white text-slate-600 border-slate-200'}`}>
            All
          </button>
          {ACCOUNT_TYPES.slice(0, 6).map(t => (
            <button key={t.value} onClick={() => setFilterType(t.value === filterType ? '' : t.value)}
              className={`px-3 py-1 rounded-full text-xs font-medium flex-shrink-0 border transition-colors ${filterType === t.value ? 'bg-[#17365D] text-white border-[#17365D]' : 'bg-white text-slate-600 border-slate-200'}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 pt-4 space-y-3">
        {loading ? [1,2,3].map(i => <div key={i} className="h-20 bg-white animate-pulse rounded-xl" />) :
         accounts.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <Users size={36} className="mx-auto mb-3 opacity-25" />
            <p className="font-medium">No outreach accounts</p>
            <Button onClick={() => setShowCreate(true)} className="mt-4 bg-[#17365D] text-white"><Plus size={14} className="mr-1" />Add Account</Button>
          </div>
        ) : accounts.map(a => (
          <Card key={a.id} className="shadow-sm border border-slate-100 cursor-pointer" onClick={() => { setSelected(a); }}>
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <Users size={15} className="text-slate-400 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-sm text-slate-800 truncate">{a.name}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${relColor(a.relationship_status)}`}>
                      {REL_STATUSES.find(r => r.value === a.relationship_status)?.label ?? a.relationship_status}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400">
                    {ACCOUNT_TYPES.find(t => t.value === a.type)?.label ?? a.type}
                    {a.area ? ' · ' + a.area : ''}{a.city ? ', ' + a.city : ''}
                  </p>
                  {a.primary_contact && <p className="text-xs text-slate-500 mt-0.5">{a.primary_contact}{a.designation ? ' · ' + a.designation : ''}</p>}
                  {a.next_followup_date && (
                    <p className="text-xs text-amber-600 mt-0.5">Follow-up: {fmtDate(a.next_followup_date)}</p>
                  )}
                </div>
                <ChevronRight size={14} className="text-slate-300 mt-1 flex-shrink-0" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Detail sheet */}
      {selected && !showEdit && (
        <BottomSheet title={selected.name} onClose={() => setSelected(null)}>
          <div className="space-y-3 pt-1 text-sm">
            <Row label="Type" val={ACCOUNT_TYPES.find(t => t.value === selected.type)?.label ?? selected.type} />
            <Row label="Status" val={<span className={`text-xs px-2 py-0.5 rounded-full font-medium ${relColor(selected.relationship_status)}`}>{REL_STATUSES.find(r => r.value === selected.relationship_status)?.label ?? selected.relationship_status}</span>} />
            {selected.area && <Row label="Area" val={`${selected.area}${selected.city ? ', ' + selected.city : ''}`} />}
            {selected.population_served && <Row label="Population" val={selected.population_served.toLocaleString('en-IN')} />}
            {selected.primary_contact && <Row label="Contact" val={`${selected.primary_contact}${selected.designation ? ' · ' + selected.designation : ''}`} />}
            {selected.contact_phone && (
              <div className="flex items-center gap-2"><Phone size={13} className="text-slate-400" /><span>{selected.contact_phone}</span></div>
            )}
            {selected.contact_email && (
              <div className="flex items-center gap-2"><Mail size={13} className="text-slate-400" /><span className="text-[#17365D]">{selected.contact_email}</span></div>
            )}
            {selected.last_camp_date && <Row label="Last camp" val={fmtDate(selected.last_camp_date) ?? '—'} />}
            {selected.next_followup_date && <Row label="Next follow-up" val={<span className="text-amber-700">{fmtDate(selected.next_followup_date)}</span>} />}
            {selected.notes && <div><p className="text-slate-400 mb-1">Notes</p><p className="bg-slate-50 rounded-lg p-2 text-sm">{selected.notes}</p></div>}
            <Button onClick={() => openEdit(selected)} className="w-full bg-[#17365D] text-white">Edit Contact Info</Button>
          </div>
        </BottomSheet>
      )}

      {/* Edit sheet */}
      {showEdit && selected && (
        <BottomSheet title={`Edit — ${selected.name}`} onClose={() => { setShowEdit(false); setSelected(null); }}>
          <div className="space-y-3 pt-1">
            <LF label="Relationship status">
              <div className="flex flex-wrap gap-2">
                {REL_STATUSES.map(r => (
                  <button key={r.value} onClick={() => setEditForm(f => ({ ...f, relationship_status: r.value }))}
                    className={`px-3 py-1 rounded-full text-xs border transition-colors ${editForm.relationship_status === r.value ? r.color + ' border-current font-medium' : 'bg-white text-slate-500 border-slate-200'}`}>
                    {r.label}
                  </button>
                ))}
              </div>
            </LF>
            <LF label="Primary contact name">
              <input value={editForm.primary_contact} onChange={e => setEditForm(f => ({ ...f, primary_contact: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#17365D]" />
            </LF>
            <div className="grid grid-cols-2 gap-3">
              <LF label="Phone">
                <input value={editForm.contact_phone} onChange={e => setEditForm(f => ({ ...f, contact_phone: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#17365D]" />
              </LF>
              <LF label="Designation">
                <input value={editForm.designation} onChange={e => setEditForm(f => ({ ...f, designation: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#17365D]" />
              </LF>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <LF label="Last camp date">
                <input type="date" value={editForm.last_camp_date} max={new Date().toISOString().slice(0,10)} onChange={e => setEditForm(f => ({ ...f, last_camp_date: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#17365D]" />
              </LF>
              <LF label="Next follow-up">
                <input type="date" value={editForm.next_followup_date} onChange={e => setEditForm(f => ({ ...f, next_followup_date: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#17365D]" />
              </LF>
            </div>
            <LF label="Population served">
              <input type="number" min="0" value={editForm.population_served} onChange={e => setEditForm(f => ({ ...f, population_served: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#17365D]" />
            </LF>
            <LF label="Notes">
              <textarea rows={2} value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-[#17365D]" />
            </LF>
            <Button onClick={handleEdit} className="w-full bg-[#17365D] text-white">Save Changes</Button>
          </div>
        </BottomSheet>
      )}

      {/* Create account sheet */}
      {showCreate && (
        <BottomSheet title="Add Outreach Account" onClose={() => setShowCreate(false)}>
          <div className="space-y-3 pt-1">
            <LF label="Organisation name *">
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Pratham Foundation / Ward 7 RWA"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#17365D]" />
            </LF>
            <LF label="Type *">
              <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#17365D]">
                {ACCOUNT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </LF>
            <div className="grid grid-cols-2 gap-3">
              <LF label="Area / Locality">
                <input value={form.area} onChange={e => setForm(f => ({ ...f, area: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#17365D]" />
              </LF>
              <LF label="City">
                <input value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#17365D]" />
              </LF>
            </div>
            <LF label="Primary contact person">
              <input value={form.primary_contact} onChange={e => setForm(f => ({ ...f, primary_contact: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#17365D]" />
            </LF>
            <div className="grid grid-cols-2 gap-3">
              <LF label="Phone">
                <input value={form.contact_phone} onChange={e => setForm(f => ({ ...f, contact_phone: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#17365D]" />
              </LF>
              <LF label="Population served">
                <input type="number" min="0" value={form.population_served} onChange={e => setForm(f => ({ ...f, population_served: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#17365D]" />
              </LF>
            </div>
            <Button onClick={handleCreate} className="w-full bg-[#17365D] text-white">Add Account</Button>
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

function Row({ label, val }: { label: string; val: React.ReactNode }) {
  return <div className="flex justify-between gap-4"><span className="text-slate-400 flex-shrink-0">{label}</span><span className="text-slate-700 text-right">{val}</span></div>;
}
