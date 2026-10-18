import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Tent, Calendar, MapPin, Users, ChevronRight, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { getCamps, proposeCamp } from './fieldClient';

const CAMP_TYPES = ['General OPD', 'Eye Camp', 'Dental Camp', 'Cardiac Screening', 'Diabetes & BP',
  'Cancer Screening', 'Women\'s Health', 'Child Health', 'Multi-Specialty', 'Vaccination', 'Other'];

type Camp = {
  id: number; camp_name: string; camp_type?: string; location?: string; address?: string;
  start_date: string; end_date?: string; start_time?: string; end_time?: string;
  organized_by?: string; expected_patients?: number; registered_patients?: number; status: string;
  services_offered?: string[];
};

function statusColor(s: string) {
  return { planned: 'bg-blue-50 text-blue-700', active: 'bg-green-50 text-green-700',
    completed: 'bg-slate-100 text-slate-500', cancelled: 'bg-red-50 text-red-500' }[s] ?? 'bg-gray-100 text-gray-500';
}

function fmtDate(d?: string) {
  if (!d) return '';
  return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export default function FieldCamps() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [camps, setCamps] = useState<Camp[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState<Camp | null>(null);
  const [form, setForm] = useState({
    camp_name: '', camp_type: 'General OPD', location: '', address: '',
    start_date: '', end_date: '', organized_by: '', expected_patients: '',
    services_offered: [] as string[],
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getCamps(filterStatus ? { status: filterStatus } : {});
      setCamps(data);
    } finally { setLoading(false); }
  }, [filterStatus]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    if (!form.camp_name || !form.start_date) {
      toast({ title: 'Camp name and start date are required', variant: 'destructive' }); return;
    }
    try {
      await proposeCamp({
        camp_name: form.camp_name, camp_type: form.camp_type || undefined,
        location: form.location || undefined, address: form.address || undefined,
        start_date: form.start_date, end_date: form.end_date || undefined,
        organized_by: form.organized_by || undefined,
        expected_patients: form.expected_patients ? parseInt(form.expected_patients) : undefined,
        services_offered: form.services_offered.length ? form.services_offered : undefined,
      });
      toast({ title: 'Camp proposed ✓', description: 'Ops team will review and activate it.' });
      setShowCreate(false);
      setForm({ camp_name: '', camp_type: 'General OPD', location: '', address: '', start_date: '', end_date: '', organized_by: '', expected_patients: '', services_offered: [] });
      load();
    } catch (e: any) {
      toast({ title: 'Failed', description: e?.response?.data?.error || e.message, variant: 'destructive' });
    }
  };

  const STATUS_FILTERS = ['', 'planned', 'active', 'completed'];

  return (
    <div className="min-h-screen bg-slate-50 pb-10">
      <div className="bg-[#17365D] text-white px-4 pt-10 pb-6">
        <button onClick={() => navigate('/team/field')} className="flex items-center gap-2 text-blue-200 text-sm mb-3 hover:text-white">
          <ArrowLeft size={15} /> Dashboard
        </button>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Health Camps</h1>
            <p className="text-blue-200 text-sm mt-0.5">{camps.length} camp{camps.length !== 1 ? 's' : ''}</p>
          </div>
          <Button size="sm" onClick={() => setShowCreate(true)} className="bg-white/15 hover:bg-white/25 text-white border-0">
            <Plus size={15} className="mr-1" /> Propose
          </Button>
        </div>
      </div>

      {/* Status filter tabs */}
      <div className="px-4 py-3 bg-white border-b border-slate-100 flex gap-2 overflow-x-auto">
        {STATUS_FILTERS.map(s => (
          <button key={s || 'all'} onClick={() => setFilterStatus(s)}
            className={`px-3 py-1 rounded-full text-xs font-medium flex-shrink-0 border transition-colors ${
              filterStatus === s ? 'bg-[#17365D] text-white border-[#17365D]' : 'bg-white text-slate-600 border-slate-200'}`}>
            {s === '' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      <div className="px-4 pt-4 space-y-3">
        {loading ? (
          [1,2,3].map(i => <div key={i} className="h-24 bg-white animate-pulse rounded-xl" />)
        ) : camps.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <Tent size={36} className="mx-auto mb-3 opacity-25" />
            <p className="font-medium">No camps</p>
            <Button onClick={() => setShowCreate(true)} className="mt-4 bg-[#17365D] text-white">
              <Plus size={14} className="mr-1" /> Propose Camp
            </Button>
          </div>
        ) : camps.map(c => (
          <Card key={c.id} className="shadow-sm border border-slate-100 cursor-pointer" onClick={() => setSelected(c)}>
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <Tent size={15} className="text-slate-400 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-sm text-slate-800 truncate">{c.camp_name}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${statusColor(c.status)}`}>{c.status}</span>
                  </div>
                  {c.camp_type && <p className="text-xs text-slate-400">{c.camp_type}</p>}
                  <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
                    {c.start_date && <span className="flex items-center gap-1"><Calendar size={11}/>{fmtDate(c.start_date)}{c.end_date && c.end_date !== c.start_date ? ' – ' + fmtDate(c.end_date) : ''}</span>}
                    {c.location && <span className="flex items-center gap-1 truncate"><MapPin size={11}/>{c.location}</span>}
                    {c.expected_patients && <span className="flex items-center gap-1"><Users size={11}/>{c.registered_patients ?? 0}/{c.expected_patients}</span>}
                  </div>
                </div>
                <ChevronRight size={14} className="text-slate-300 mt-1 flex-shrink-0" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Camp detail */}
      {selected && (
        <BottomSheet title={selected.camp_name} onClose={() => setSelected(null)}>
          <div className="space-y-3 pt-1 text-sm">
            <Row label="Type" val={selected.camp_type ?? '—'} />
            <Row label="Status" val={<span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor(selected.status)}`}>{selected.status}</span>} />
            <Row label="Date" val={`${fmtDate(selected.start_date)}${selected.end_date && selected.end_date !== selected.start_date ? ' – ' + fmtDate(selected.end_date) : ''}`} />
            {selected.start_time && <Row label="Time" val={`${selected.start_time}${selected.end_time ? ' – ' + selected.end_time : ''}`} />}
            {selected.location && <Row label="Location" val={selected.location} />}
            {selected.address && <div><p className="text-slate-400 mb-1">Address</p><p className="bg-slate-50 rounded-lg p-2">{selected.address}</p></div>}
            {selected.organized_by && <Row label="Organised by" val={selected.organized_by} />}
            <Row label="Patients" val={`${selected.registered_patients ?? 0} / ${selected.expected_patients ?? '—'}`} />
            {selected.services_offered?.length ? (
              <div>
                <p className="text-slate-400 mb-1">Services</p>
                <div className="flex flex-wrap gap-1.5">
                  {selected.services_offered.map(s => <span key={s} className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">{s}</span>)}
                </div>
              </div>
            ) : null}
          </div>
        </BottomSheet>
      )}

      {/* Create camp sheet */}
      {showCreate && (
        <BottomSheet title="Propose a Health Camp" onClose={() => setShowCreate(false)}>
          <div className="space-y-3 pt-1">
            <LF label="Camp name *">
              <input value={form.camp_name} onChange={e => setForm(f => ({ ...f, camp_name: e.target.value }))}
                placeholder="Free Eye Camp – Manek Chowk"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#17365D]" />
            </LF>
            <LF label="Type">
              <select value={form.camp_type} onChange={e => setForm(f => ({ ...f, camp_type: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#17365D]">
                {CAMP_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </LF>
            <div className="grid grid-cols-2 gap-3">
              <LF label="Start date *">
                <input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#17365D]" />
              </LF>
              <LF label="End date">
                <input type="date" value={form.end_date} min={form.start_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#17365D]" />
              </LF>
            </div>
            <LF label="Location / Venue name">
              <input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
                placeholder="Community Hall, Ward 14"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#17365D]" />
            </LF>
            <LF label="Full address">
              <textarea rows={2} value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-[#17365D]" />
            </LF>
            <div className="grid grid-cols-2 gap-3">
              <LF label="Organised by">
                <input value={form.organized_by} onChange={e => setForm(f => ({ ...f, organized_by: e.target.value }))}
                  placeholder="NGO / RWA name"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#17365D]" />
              </LF>
              <LF label="Expected patients">
                <input type="number" min="1" value={form.expected_patients} onChange={e => setForm(f => ({ ...f, expected_patients: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#17365D]" />
              </LF>
            </div>
            <Button onClick={handleCreate} className="w-full bg-[#17365D] text-white">Propose Camp</Button>
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
