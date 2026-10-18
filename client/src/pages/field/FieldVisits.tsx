import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, MapPin, Clock, CheckCircle2, X, ChevronRight, Building2, Stethoscope, Briefcase } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import {
  getVisits, createVisit, checkInVisit, checkOutVisit, cancelVisit, getGps,
} from './fieldClient';

type Visit = {
  id: number; entity_name: string; entity_type?: string;
  purpose: string; planned_at?: string; status: string;
  met_person?: string; met_designation?: string;
  outcome?: string; next_action?: string; follow_up_date?: string;
  check_in_at?: string; check_out_at?: string;
  check_in_accuracy_m?: number;
};

const PURPOSE_OPTS = [
  { value: 'initial_visit', label: 'Initial Visit' },
  { value: 'follow_up', label: 'Follow-up' },
  { value: 'proposal', label: 'Proposal' },
  { value: 'camp_planning', label: 'Camp Planning' },
  { value: 'relationship', label: 'Relationship' },
  { value: 'meeting', label: 'Meeting' },
  { value: 'survey', label: 'Survey' },
  { value: 'other', label: 'Other' },
];

const ENTITY_OPTS = [
  { value: 'doctor', label: 'Doctor' },
  { value: 'corporate', label: 'Corporate' },
  { value: 'hospital', label: 'Hospital / Clinic' },
  { value: 'insurer', label: 'Insurance Company' },
  { value: 'ngo', label: 'NGO' },
  { value: 'other', label: 'Other' },
];

const SERVICES_LIST = [
  'Cardiology', 'Orthopaedics', 'Oncology', 'Neurology',
  'Gynaecology', 'Paediatrics', 'Diagnostics', 'Emergency',
  'OPD Package', 'Health Check-up', 'Camp Services',
];

function entityIcon(t?: string) {
  if (t === 'doctor') return <Stethoscope size={13} className="text-slate-400" />;
  if (t === 'corporate') return <Briefcase size={13} className="text-slate-400" />;
  return <Building2 size={13} className="text-slate-400" />;
}

function fmt(ts?: string) {
  if (!ts) return '';
  return new Date(ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function statusColor(s: string) {
  return {
    planned:    'bg-blue-50 text-blue-700 border-blue-200',
    checked_in: 'bg-amber-50 text-amber-700 border-amber-200',
    completed:  'bg-green-50 text-green-700 border-green-200',
    cancelled:  'bg-gray-100 text-gray-400 border-gray-200',
  }[s] ?? 'bg-gray-100 text-gray-400 border-gray-200';
}

type Panel = 'none' | 'create' | 'checkin' | 'checkout' | 'detail';

export default function FieldVisits() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [visits, setVisits] = useState<Visit[]>([]);
  const [loading, setLoading] = useState(true);
  const [panel, setPanel] = useState<Panel>('none');
  const [selected, setSelected] = useState<Visit | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [filterDate, setFilterDate] = useState(new Date().toISOString().slice(0, 10));

  // create form
  const [create, setCreate] = useState({
    entity_name: '', entity_type: 'doctor', purpose: 'follow_up', planned_at: '', notes_planned: '',
  });

  // checkout form
  const [checkout, setCheckout] = useState({
    met_person: '', met_designation: '', outcome: '',
    services_discussed: [] as string[], next_action: '', follow_up_date: '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getVisits({ date: filterDate });
      setVisits((data as any).visits ?? []);
    } finally {
      setLoading(false);
    }
  }, [filterDate]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    if (!create.entity_name.trim()) { toast({ title: 'Organisation / contact name is required', variant: 'destructive' }); return; }
    try {
      await createVisit(create);
      toast({ title: 'Visit planned ✓' });
      setPanel('none');
      setCreate({ entity_name: '', entity_type: 'doctor', purpose: 'follow_up', planned_at: '', notes_planned: '' });
      load();
    } catch (e: any) {
      toast({ title: 'Failed', description: e?.response?.data?.error || e.message, variant: 'destructive' });
    }
  };

  const handleCheckIn = async (v: Visit) => {
    setGpsLoading(true);
    try {
      const gps = await getGps();
      const updated = await checkInVisit(v.id, gps
        ? { lat: gps.lat, lng: gps.lng, accuracy_m: gps.accuracy_m }
        : {});
      setVisits(vs => vs.map(x => x.id === v.id ? { ...x, ...updated } : x));
      toast({ title: 'Checked in ✓', description: gps ? `±${gps.accuracy_m}m GPS` : 'No GPS — location not captured' });
      setPanel('none');
    } catch (e: any) {
      toast({ title: 'Check-in failed', description: e?.response?.data?.error || e.message, variant: 'destructive' });
    } finally {
      setGpsLoading(false);
    }
  };

  const handleCheckOut = async () => {
    if (!selected) return;
    setGpsLoading(true);
    try {
      const gps = await getGps();
      const updated = await checkOutVisit(selected.id, {
        ...gps ? { lat: gps.lat, lng: gps.lng, accuracy_m: gps.accuracy_m } : {},
        met_person: checkout.met_person || undefined,
        met_designation: checkout.met_designation || undefined,
        outcome: checkout.outcome || undefined,
        services_discussed: checkout.services_discussed.length ? checkout.services_discussed : undefined,
        next_action: checkout.next_action || undefined,
        follow_up_date: checkout.follow_up_date || undefined,
      });
      setVisits(vs => vs.map(x => x.id === selected.id ? { ...x, ...updated } : x));
      toast({ title: 'Visit completed ✓' });
      setPanel('none');
      setSelected(null);
    } catch (e: any) {
      toast({ title: 'Check-out failed', description: e?.response?.data?.error || e.message, variant: 'destructive' });
    } finally {
      setGpsLoading(false);
    }
  };

  const handleCancel = async (v: Visit) => {
    try {
      await cancelVisit(v.id);
      setVisits(vs => vs.map(x => x.id === v.id ? { ...x, status: 'cancelled' } : x));
      toast({ title: 'Visit cancelled' });
    } catch (e: any) {
      toast({ title: 'Failed', description: e?.response?.data?.error || e.message, variant: 'destructive' });
    }
  };

  const openCheckout = (v: Visit) => {
    setSelected(v);
    setCheckout({ met_person: '', met_designation: '', outcome: '', services_discussed: [], next_action: '', follow_up_date: '' });
    setPanel('checkout');
  };

  const grouped = {
    in_progress: visits.filter(v => v.status === 'checked_in'),
    planned: visits.filter(v => v.status === 'planned'),
    completed: visits.filter(v => v.status === 'completed'),
    cancelled: visits.filter(v => v.status === 'cancelled'),
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-10">
      {/* Header */}
      <div className="bg-[#17365D] text-white px-4 pt-10 pb-6">
        <button onClick={() => navigate('/team/field')} className="flex items-center gap-2 text-blue-200 text-sm mb-3 hover:text-white">
          <ArrowLeft size={15} /> Dashboard
        </button>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Field Visits</h1>
            <p className="text-blue-200 text-sm mt-0.5">{visits.length} visit{visits.length !== 1 ? 's' : ''} · {new Date(filterDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</p>
          </div>
          <Button size="sm" onClick={() => setPanel('create')}
            className="bg-white/15 hover:bg-white/25 text-white border-0">
            <Plus size={15} className="mr-1" /> Add
          </Button>
        </div>
      </div>

      {/* Date filter */}
      <div className="px-4 py-3 bg-white border-b border-slate-100">
        <input type="date" value={filterDate} max={new Date().toISOString().slice(0, 10)}
          onChange={e => setFilterDate(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#17365D]" />
      </div>

      <div className="px-4 pt-4 space-y-4">
        {loading ? (
          <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-20 bg-white animate-pulse rounded-xl" />)}</div>
        ) : visits.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <MapPin size={36} className="mx-auto mb-3 opacity-25" />
            <p className="font-medium">No visits for this date</p>
            <Button onClick={() => setPanel('create')} className="mt-4 bg-[#17365D] text-white">
              <Plus size={14} className="mr-1" /> Plan a Visit
            </Button>
          </div>
        ) : (
          <>
            {grouped.in_progress.length > 0 && <VisitSection title="In Progress" visits={grouped.in_progress} onCheckOut={openCheckout} onDetail={v => { setSelected(v); setPanel('detail'); }} />}
            {grouped.planned.length > 0 && <VisitSection title="Planned" visits={grouped.planned} onCheckIn={v => handleCheckIn(v)} onCancel={handleCancel} onDetail={v => { setSelected(v); setPanel('detail'); }} />}
            {grouped.completed.length > 0 && <VisitSection title="Completed" visits={grouped.completed} onDetail={v => { setSelected(v); setPanel('detail'); }} />}
            {grouped.cancelled.length > 0 && <VisitSection title="Cancelled" visits={grouped.cancelled} />}
          </>
        )}
      </div>

      {/* Create visit bottom sheet */}
      {panel === 'create' && (
        <BottomSheet title="Plan a Visit" onClose={() => setPanel('none')}>
          <div className="space-y-3 pt-1">
            <LabeledField label="Organisation / Contact name *">
              <input value={create.entity_name} onChange={e => setCreate(f => ({ ...f, entity_name: e.target.value }))}
                placeholder="Dr. Ramesh Kumar / TATA Motors HR"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#17365D]" />
            </LabeledField>
            <LabeledField label="Type">
              <select value={create.entity_type} onChange={e => setCreate(f => ({ ...f, entity_type: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#17365D]">
                {ENTITY_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </LabeledField>
            <LabeledField label="Purpose">
              <select value={create.purpose} onChange={e => setCreate(f => ({ ...f, purpose: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#17365D]">
                {PURPOSE_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </LabeledField>
            <LabeledField label="Planned time (optional)">
              <input type="datetime-local" value={create.planned_at} onChange={e => setCreate(f => ({ ...f, planned_at: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#17365D]" />
            </LabeledField>
            <LabeledField label="Preparation notes">
              <textarea rows={2} value={create.notes_planned} onChange={e => setCreate(f => ({ ...f, notes_planned: e.target.value }))}
                placeholder="Agenda, materials to bring…"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-[#17365D]" />
            </LabeledField>
            <Button onClick={handleCreate} className="w-full bg-[#17365D] text-white">Save Visit</Button>
          </div>
        </BottomSheet>
      )}

      {/* Check-out bottom sheet */}
      {panel === 'checkout' && selected && (
        <BottomSheet title={`Check out — ${selected.entity_name}`} onClose={() => setPanel('none')}>
          <div className="space-y-3 pt-1">
            <div className="grid grid-cols-2 gap-3">
              <LabeledField label="Person met">
                <input value={checkout.met_person} onChange={e => setCheckout(f => ({ ...f, met_person: e.target.value }))}
                  placeholder="Name"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#17365D]" />
              </LabeledField>
              <LabeledField label="Designation">
                <input value={checkout.met_designation} onChange={e => setCheckout(f => ({ ...f, met_designation: e.target.value }))}
                  placeholder="HOD / HR Manager"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#17365D]" />
              </LabeledField>
            </div>
            <LabeledField label="Meeting outcome">
              <textarea rows={3} value={checkout.outcome} onChange={e => setCheckout(f => ({ ...f, outcome: e.target.value }))}
                placeholder="What was discussed, decisions made, interest shown…"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-[#17365D]" />
            </LabeledField>
            <LabeledField label="Services discussed">
              <div className="flex flex-wrap gap-2">
                {SERVICES_LIST.map(s => (
                  <button key={s} onClick={() => setCheckout(f => ({
                    ...f, services_discussed: f.services_discussed.includes(s)
                      ? f.services_discussed.filter(x => x !== s)
                      : [...f.services_discussed, s]
                  }))}
                    className={`px-3 py-1 rounded-full text-xs border transition-colors ${
                      checkout.services_discussed.includes(s)
                        ? 'bg-[#17365D] text-white border-[#17365D]'
                        : 'bg-white text-slate-600 border-slate-200 hover:border-[#17365D]'
                    }`}>
                    {s}
                  </button>
                ))}
              </div>
            </LabeledField>
            <LabeledField label="Next action">
              <input value={checkout.next_action} onChange={e => setCheckout(f => ({ ...f, next_action: e.target.value }))}
                placeholder="Send proposal / Schedule demo…"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#17365D]" />
            </LabeledField>
            <LabeledField label="Follow-up date">
              <input type="date" value={checkout.follow_up_date} min={new Date().toISOString().slice(0, 10)}
                onChange={e => setCheckout(f => ({ ...f, follow_up_date: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#17365D]" />
            </LabeledField>
            <Button onClick={handleCheckOut} disabled={gpsLoading} className="w-full bg-[#0D9488] hover:bg-[#0B7A70] text-white">
              {gpsLoading ? 'Getting location…' : 'Complete Visit ✓'}
            </Button>
          </div>
        </BottomSheet>
      )}

      {/* Detail bottom sheet */}
      {panel === 'detail' && selected && (
        <BottomSheet title={selected.entity_name} onClose={() => setPanel('none')}>
          <div className="space-y-3 pt-1 text-sm">
            <Row label="Type" val={ENTITY_OPTS.find(o => o.value === selected.entity_type)?.label ?? selected.entity_type ?? '—'} />
            <Row label="Purpose" val={PURPOSE_OPTS.find(o => o.value === selected.purpose)?.label ?? selected.purpose} />
            <Row label="Status" val={
              <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${statusColor(selected.status)}`}>
                {selected.status}
              </span>
            } />
            {selected.check_in_at && <Row label="Checked in" val={fmt(selected.check_in_at)} />}
            {selected.check_out_at && <Row label="Checked out" val={fmt(selected.check_out_at)} />}
            {selected.met_person && <Row label="Met" val={`${selected.met_person}${selected.met_designation ? ' · ' + selected.met_designation : ''}`} />}
            {selected.outcome && (
              <div>
                <p className="text-xs text-slate-400 mb-1">Outcome</p>
                <p className="text-slate-700 text-sm bg-slate-50 rounded-lg p-2">{selected.outcome}</p>
              </div>
            )}
            {selected.next_action && <Row label="Next action" val={selected.next_action} />}
            {selected.follow_up_date && <Row label="Follow-up" val={new Date(selected.follow_up_date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} />}
          </div>
        </BottomSheet>
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function VisitSection({ title, visits, onCheckIn, onCheckOut, onCancel, onDetail }: {
  title: string; visits: Visit[];
  onCheckIn?: (v: Visit) => void; onCheckOut?: (v: Visit) => void;
  onCancel?: (v: Visit) => void; onDetail?: (v: Visit) => void;
}) {
  return (
    <div>
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">{title}</p>
      <div className="space-y-2">
        {visits.map(v => (
          <Card key={v.id} className="shadow-sm border border-slate-100 cursor-pointer" onClick={() => onDetail?.(v)}>
            <CardContent className="p-3">
              <div className="flex items-start gap-3">
                <div className="mt-0.5">{entityIcon(v.entity_type)}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-slate-800 truncate">{v.entity_name}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium flex-shrink-0 ${statusColor(v.status)}`}>
                      {v.status === 'checked_in' ? 'In Progress' : v.status.charAt(0).toUpperCase() + v.status.slice(1)}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {PURPOSE_OPTS.find(o => o.value === v.purpose)?.label ?? v.purpose}
                    {v.planned_at ? ' · ' + new Date(v.planned_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }) : ''}
                  </p>
                  {v.next_action && <p className="text-xs text-[#0D9488] mt-0.5 truncate">→ {v.next_action}</p>}
                </div>
                <ChevronRight size={14} className="text-slate-300 flex-shrink-0 mt-1" />
              </div>
              {(onCheckIn || onCheckOut) && (
                <div className="flex gap-2 mt-2.5" onClick={e => e.stopPropagation()}>
                  {onCheckIn && v.status === 'planned' && (
                    <Button size="sm" onClick={() => onCheckIn(v)}
                      className="flex-1 bg-[#17365D] text-white h-8 text-xs">
                      <MapPin size={12} className="mr-1" /> Check In
                    </Button>
                  )}
                  {onCheckOut && v.status === 'checked_in' && (
                    <Button size="sm" onClick={() => onCheckOut(v)}
                      className="flex-1 bg-[#0D9488] hover:bg-[#0B7A70] text-white h-8 text-xs">
                      <CheckCircle2 size={12} className="mr-1" /> Check Out
                    </Button>
                  )}
                  {onCancel && v.status === 'planned' && (
                    <Button size="sm" variant="ghost" onClick={() => onCancel(v)}
                      className="text-slate-400 h-8 text-xs px-2">
                      <X size={12} />
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function BottomSheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" onClick={onClose}>
      <div className="bg-black/40 absolute inset-0" />
      <div className="relative bg-white rounded-t-2xl shadow-2xl max-h-[85vh] flex flex-col"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-4 border-b border-slate-100 flex-shrink-0">
          <h2 className="font-semibold text-slate-800 truncate pr-4">{title}</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100"><X size={18} /></button>
        </div>
        <div className="overflow-y-auto flex-1 px-4 pb-6">{children}</div>
      </div>
    </div>
  );
}

function LabeledField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs text-slate-500 block mb-1">{label}</label>
      {children}
    </div>
  );
}

function Row({ label, val }: { label: string; val: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-slate-400 flex-shrink-0">{label}</span>
      <span className="text-slate-700 text-right">{val}</span>
    </div>
  );
}
