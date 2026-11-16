/**
 * Referral network: the doctors who refer patients to the hospital, and the field work around them.
 * Web counterpart of the Smart-Force app (which writes visits, intel, CME, camps and samples).
 *
 *   /crm/doctors            directory: filters, visit-overdue view, add, CSV import, assign
 *   /crm/doctors/:id        doctor 360: referred patients and their journey, visits, samples, events, intel
 *   /crm/referral-network   Business Head view: league, falling referrals, not visited, coverage, executives
 *   /crm/field-activity     visits, approvals queue, daily reports, samples log, team scorecard
 *   /crm/events             CME (speakers, compliance, invites, attendance) and health camps (registrations)
 *
 * API: /api/crm/referral-network (one module, { success, data }); approvals decide through the existing
 * /api/crm/field-force endpoints, which notify the executive.
 */
import { BRAND, templateLabel } from '@/config/brand';
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Search, Plus, Upload, Stethoscope, Phone, MessageCircle, MapPin, Users, TrendingUp, TrendingDown, CalendarClock,
  ChevronLeft, CheckCircle2, XCircle, Building2, IndianRupee, AlertTriangle, FileText, Package, CalendarDays,
  Tent, Mic, UserPlus, Pencil, X, Camera, Route as RouteIcon, ShieldCheck, Inbox as InboxIcon, Send, Map as MapIcon, Landmark,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import api from '@/utils/api';
import { CRMLayout } from './CRMModulePages';
import { hasCRMCapability } from './shared/crmRoles';

// ─── API ──────────────────────────────────────────────────────────────────────
const auth = () => { const t = localStorage.getItem('crmToken'); return t ? { Authorization: `Bearer ${t}` } : {}; };
async function rn<T = any>(path: string, method: 'get' | 'post' | 'patch' | 'put' = 'get', body?: unknown, params?: Record<string, any>): Promise<T> {
  try {
    const res = await api.request({ url: `/crm/referral-network${path}`, method, data: body, params, headers: auth() });
    return res.data?.data as T;
  } catch (err: any) {
    if (err.response?.status === 401) window.location.assign('/crm/login');
    throw new Error(err.response?.data?.message || err.response?.data?.error || err.message || 'Request failed');
  }
}
async function ff(path: string, body: unknown) {
  try { return (await api.patch(`/crm/field-force${path}`, body, { headers: auth() })).data; }
  catch (err: any) { throw new Error(err.response?.data?.error || err.response?.data?.message || err.message); }
}
const me = () => { try { return JSON.parse(localStorage.getItem('crmUserData') || 'null'); } catch { return null; } };

// ─── Formatting ───────────────────────────────────────────────────────────────
const inr = (n: any) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const date = (d?: string | null) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const dateTime = (d?: string | null) => (d ? new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
const ago = (d?: string | null) => {
  if (!d) return 'never';
  const days = Math.floor((Date.now() - new Date(d).getTime()) / 864e5);
  return days <= 0 ? 'today' : days === 1 ? 'yesterday' : days < 31 ? `${days} days ago` : date(d);
};
const words = (s?: string | null) => String(s || '').replace(/_/g, ' ');
const initials = (n: string) => n.replace(/^dr\.?\s+/i, '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || '?';
const digits = (p?: string | null) => String(p || '').replace(/\D/g, '');
const waLink = (p?: string | null) => { const d = digits(p); return d ? `https://wa.me/${d.length === 10 ? `91${d}` : d}` : null; };
const itemsText = (items: any) => (Array.isArray(items) ? items.map((i: any) => (typeof i === 'string' ? i : `${i.name || i.item || 'item'}${i.qty ? ` × ${i.qty}` : ''}`)).join(', ') : '—');

const STAGE: Record<string, { label: string; tone: string }> = {
  new: { label: 'New enquiry', tone: 'slate' }, attempting_contact: { label: 'Trying to reach', tone: 'slate' },
  contacted: { label: 'Contacted', tone: 'sky' }, qualified: { label: 'Qualified', tone: 'sky' },
  appointment_requested: { label: 'Appointment requested', tone: 'violet' }, appointment_booked: { label: 'Appointment booked', tone: 'violet' },
  appointment_confirmed: { label: 'Appointment confirmed', tone: 'violet' }, visited: { label: 'Visited', tone: 'amber' },
  consulted: { label: 'Consulted', tone: 'amber' }, investigation_advised: { label: 'Tests advised', tone: 'amber' },
  procedure_advised: { label: 'Procedure advised', tone: 'amber' }, admission_advised: { label: 'Admission advised', tone: 'amber' },
  billing_completed: { label: 'Treated and billed', tone: 'emerald' }, won: { label: 'Treated and billed', tone: 'emerald' },
  nurture: { label: 'Follow up later', tone: 'slate' }, lost: { label: 'Lost', tone: 'red' }, dormant: { label: 'Dormant', tone: 'red' },
};
const TONE: Record<string, string> = {
  slate: 'bg-slate-500/15 text-slate-300 border-slate-500/20', sky: 'bg-sky-500/15 text-sky-300 border-sky-500/20',
  violet: 'bg-violet-500/15 text-violet-300 border-violet-500/25', amber: 'bg-amber-500/15 text-amber-300 border-amber-500/20',
  emerald: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/20', red: 'bg-red-500/15 text-red-300 border-red-500/20',
  blue: 'bg-blue-500/15 text-blue-300 border-blue-500/20',
};
const POTENTIAL_TONE: Record<string, string> = { champion: 'emerald', high: 'violet', medium: 'sky', low: 'slate' };
const REL_TONE: Record<string, string> = { prospect: 'slate', contacted: 'sky', visiting: 'blue', active_referrer: 'emerald', champion: 'emerald', inactive: 'red', competitor_locked: 'red' };
const VISIT_TONE: Record<string, string> = { planned: 'slate', checked_in: 'blue', completed: 'emerald', cancelled: 'red', exception: 'amber' };

// ─── UI primitives ────────────────────────────────────────────────────────────
function Pill({ tone = 'slate', children, title }: { tone?: string; children: React.ReactNode; title?: string }) {
  return <span title={title} className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium ${TONE[tone] || TONE.slate}`}>{children}</span>;
}
function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-2xl bg-white/[0.03] border border-white/[0.06] ${className}`}>{children}</section>;
}
function CardHead({ title, sub, right }: { title: string; sub?: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3">
      <div><h3 className="text-sm font-semibold text-white">{title}</h3>{sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}</div>
      {right}
    </div>
  );
}
function Kpi({ label, value, sub, tone, icon: Icon }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: 'up' | 'down' | 'warn'; icon?: any }) {
  return (
    <div className="rounded-2xl bg-white/[0.03] border border-white/[0.06] p-4">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-slate-500">{Icon && <Icon className="h-3.5 w-3.5" />}{label}</div>
      <div className="mt-1.5 text-2xl font-semibold text-white tabular-nums">{value}</div>
      {sub && <div className={`mt-0.5 text-xs ${tone === 'up' ? 'text-emerald-400' : tone === 'down' ? 'text-red-400' : tone === 'warn' ? 'text-amber-400' : 'text-slate-500'}`}>{sub}</div>}
    </div>
  );
}
const inputCls = 'h-10 w-full px-3 rounded-xl bg-white/[0.05] border border-white/[0.08] text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-violet-500/40';
const selectCls = 'h-10 px-3 rounded-xl bg-white/[0.05] border border-white/[0.08] text-sm text-slate-200 focus:outline-none focus:border-violet-500/40';
const primaryCls = 'h-10 bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 text-white rounded-xl shadow-lg shadow-violet-600/20';
const ghostCls = 'h-10 px-4 rounded-xl border border-white/[0.08] text-sm text-slate-200 hover:bg-white/[0.05] inline-flex items-center gap-2 disabled:opacity-40';
function Field({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return <label className={`space-y-1 block ${wide ? 'sm:col-span-2' : ''}`}><span className="text-[10px] font-medium uppercase tracking-wider text-slate-500">{label}</span>{children}</label>;
}
function Opt({ value, children }: { value: string; children: React.ReactNode }) { return <option value={value} className="bg-[#0d1120]">{children}</option>; }
function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string; count?: number }[]; value: T; onChange: (t: T) => void }) {
  return (
    <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-white/[0.06]">
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={value === t.id} onClick={() => onChange(t.id)}
          className={`whitespace-nowrap px-3.5 py-2.5 text-sm border-b-2 -mb-px transition-colors ${value === t.id ? 'border-violet-400 text-white' : 'border-transparent text-slate-400 hover:text-slate-200'}`}>
          {t.label}{t.count != null && <span className="ml-1.5 text-xs text-slate-500">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}
function Empty({ icon: Icon, title, body, action }: { icon: any; title: string; body?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-14 px-6">
      <div className="h-11 w-11 rounded-2xl bg-violet-500/10 grid place-items-center mb-3"><Icon className="h-5 w-5 text-violet-300" /></div>
      <p className="text-sm font-medium text-white">{title}</p>
      {body && <p className="mt-1 max-w-md text-xs text-slate-500">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
function Flash({ msg, onClose }: { msg: { text: string; ok: boolean } | null; onClose: () => void }) {
  useEffect(() => { if (msg?.ok) { const t = setTimeout(onClose, 4000); return () => clearTimeout(t); } }, [msg, onClose]);
  if (!msg) return null;
  return (
    <div role="status" className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-2.5 text-sm ${msg.ok ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300' : 'border-red-500/20 bg-red-500/10 text-red-300'}`}>
      <span>{msg.text}</span><button onClick={onClose} aria-label="Dismiss"><X className="h-4 w-4" /></button>
    </div>
  );
}
function Loading() { return <div className="py-16 text-center text-sm text-slate-500">Loading…</div>; }
function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-sm">
        <thead><tr>{head.map((h, i) => <th key={`${h}-${i}`} className="px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-slate-500">{h}</th>)}</tr></thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
const rowCls = 'border-t border-white/[0.04] hover:bg-white/[0.025]';
const cellCls = 'px-4 py-3 align-top';
type FlashMsg = { text: string; ok: boolean } | null;

// ─── Doctor form (add / edit) ─────────────────────────────────────────────────
const EMPTY_DOC: Record<string, string> = { doctor_name: '', qualification: '', specialty: '', hospital_affiliation: '', area: '', city: '', phone: '', email: '', opd_days: '', referral_potential: 'medium', relationship_status: 'prospect', visit_frequency_target: '2', notes: '', assigned_exec_id: '' };
function DoctorDialog({ open, onClose, initial, team, manager, onSaved }: { open: boolean; onClose: () => void; initial?: any; team: any[]; manager: boolean; onSaved: (d: any) => void }) {
  const [form, setForm] = useState<Record<string, string>>(EMPTY_DOC);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setErr('');
    setForm(initial ? Object.fromEntries(Object.keys(EMPTY_DOC).map((k) => [k, initial[k] == null ? '' : String(initial[k])])) : EMPTY_DOC);
  }, [open, initial]);
  const set = (k: string) => (e: any) => setForm({ ...form, [k]: e.target.value });
  const save = async () => {
    setBusy(true); setErr('');
    try {
      const body: any = { ...form, visit_frequency_target: Number(form.visit_frequency_target) || 1 };
      if (!manager) delete body.assigned_exec_id; else body.assigned_exec_id = form.assigned_exec_id ? Number(form.assigned_exec_id) : null;
      const d = initial ? await rn(`/doctors/${initial.id}`, 'patch', body) : await rn('/doctors', 'post', body);
      onSaved(d); onClose();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl bg-[#0d1120] border-white/[0.08] text-white">
        <DialogHeader><DialogTitle>{initial ? 'Edit doctor' : 'Add a doctor'}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Name *" wide><input className={inputCls} value={form.doctor_name} onChange={set('doctor_name')} placeholder="Dr Anil Rao" autoFocus /></Field>
          <Field label="Specialty"><input className={inputCls} value={form.specialty} onChange={set('specialty')} placeholder="Cardiology" /></Field>
          <Field label="Qualification"><input className={inputCls} value={form.qualification} onChange={set('qualification')} placeholder="MD, DM" /></Field>
          <Field label="Hospital or clinic" wide><input className={inputCls} value={form.hospital_affiliation} onChange={set('hospital_affiliation')} /></Field>
          <Field label="Area"><input className={inputCls} value={form.area} onChange={set('area')} /></Field>
          <Field label="City"><input className={inputCls} value={form.city} onChange={set('city')} /></Field>
          <Field label="Mobile"><input className={inputCls} value={form.phone} onChange={set('phone')} inputMode="tel" placeholder="10-digit mobile" /></Field>
          <Field label="Email"><input className={inputCls} value={form.email} onChange={set('email')} type="email" /></Field>
          <Field label="OPD days and times"><input className={inputCls} value={form.opd_days} onChange={set('opd_days')} placeholder="Mon–Sat, 10 am–1 pm" /></Field>
          <Field label="Visits a month (target)"><input className={inputCls} value={form.visit_frequency_target} onChange={set('visit_frequency_target')} inputMode="numeric" /></Field>
          <Field label="Referral potential">
            <select className={`${selectCls} w-full`} value={form.referral_potential} onChange={set('referral_potential')}>{['champion', 'high', 'medium', 'low'].map((p) => <Opt key={p} value={p}>{words(p)}</Opt>)}</select>
          </Field>
          <Field label="Relationship">
            <select className={`${selectCls} w-full`} value={form.relationship_status} onChange={set('relationship_status')}>{['prospect', 'contacted', 'visiting', 'active_referrer', 'champion', 'inactive', 'competitor_locked'].map((p) => <Opt key={p} value={p}>{words(p)}</Opt>)}</select>
          </Field>
          {manager && (
            <Field label="Field executive" wide>
              <select className={`${selectCls} w-full`} value={form.assigned_exec_id} onChange={set('assigned_exec_id')}>
                <Opt value="">Not assigned</Opt>{team.map((t) => <Opt key={t.id} value={String(t.id)}>{t.name || t.email}</Opt>)}
              </select>
            </Field>
          )}
          <Field label="Notes" wide><textarea className={`${inputCls} h-20 py-2`} value={form.notes} onChange={set('notes')} /></Field>
        </div>
        {err && <p className="text-sm text-red-300">{err}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button className={ghostCls} onClick={onClose}>Cancel</button>
          <Button className={primaryCls} onClick={save} disabled={busy || !form.doctor_name.trim()}>{busy ? 'Saving…' : initial ? 'Save changes' : 'Add doctor'}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// CSV: header row with any of these columns (case-insensitive); quoted fields supported.
const CSV_COLUMNS: Record<string, string> = {
  name: 'doctor_name', doctor: 'doctor_name', doctor_name: 'doctor_name', specialty: 'specialty', speciality: 'specialty', qualification: 'qualification',
  hospital: 'hospital_affiliation', clinic: 'hospital_affiliation', hospital_affiliation: 'hospital_affiliation', area: 'area', locality: 'area', city: 'city',
  mobile: 'phone', phone: 'phone', email: 'email', opd: 'opd_days', opd_days: 'opd_days', potential: 'referral_potential', referral_potential: 'referral_potential',
  relationship: 'relationship_status', owner_email: 'owner_email', executive_email: 'owner_email', notes: 'notes',
};
function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = []; let row: string[] = []; let cell = ''; let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i += 1; } else if (c === '"') quoted = false; else cell += c; continue; }
    if (c === '"') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i += 1; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [head, ...body] = rows.filter((r) => r.some((x) => x.trim()));
  if (!head) return [];
  const keys = head.map((h) => CSV_COLUMNS[h.trim().toLowerCase().replace(/^﻿/, '').replace(/[\s-]+/g, '_')] || null);
  return body.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] || '').trim()]).filter(([k]) => k)) as Record<string, string>);
}
function ImportDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: (msg: string) => void }) {
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);
  useEffect(() => { if (open) { setRows([]); setErr(''); setResult(null); } }, [open]);
  const pick = async (file?: File | null) => {
    if (!file) return;
    setErr(''); setResult(null);
    const parsed = parseCsv(await file.text());
    if (!parsed.length || !parsed.some((r) => r.doctor_name)) { setErr('No doctors found. The first row must name the columns, including "name".'); setRows([]); return; }
    setRows(parsed);
  };
  const run = async () => {
    setBusy(true); setErr('');
    try { const r: any = await rn('/doctors/import', 'post', { rows }); setResult(r); onDone(`Imported: ${r.created} added, ${r.updated} updated${r.skipped.length ? `, ${r.skipped.length} skipped` : ''}.`); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl bg-[#0d1120] border-white/[0.08] text-white">
        <DialogHeader><DialogTitle>Import doctors from a spreadsheet</DialogTitle></DialogHeader>
        <p className="text-sm text-slate-400">Save the sheet as CSV. The first row names the columns: <span className="text-slate-200">name</span> (required), specialty, qualification, hospital, area, city, mobile, email, opd, potential, relationship, executive_email, notes. A doctor whose mobile, or name and area, is already in the CRM is updated (blanks filled), not duplicated.</p>
        <button type="button" className="self-start text-sm text-violet-300 hover:text-violet-200 underline-offset-2 hover:underline" onClick={() => {
          const csv = 'name,specialty,qualification,hospital,area,city,mobile,email,opd,potential,relationship,executive_email,notes\r\nDr Anil Rao,Cardiology,"MD, DM",Rao Heart Clinic,Banjara Hills,Hyderabad,9800000000,anil@example.com,Mon-Sat 10 am-1 pm,high,visiting,,Prefers visits after OPD\r\n';
          const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
          const a = document.createElement('a'); a.href = url; a.download = 'doctors-template.csv'; a.click(); URL.revokeObjectURL(url);
        }}>Download a template spreadsheet</button>
        <input type="file" accept=".csv,text/csv" onChange={(e) => pick(e.target.files?.[0])} className="text-sm text-slate-300 file:mr-3 file:rounded-lg file:border-0 file:bg-violet-600 file:px-3 file:py-2 file:text-white" />
        {rows.length > 0 && !result && (
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-sm">
            <p className="text-slate-200">{rows.length} doctor{rows.length === 1 ? '' : 's'} found. First rows:</p>
            <ul className="mt-2 space-y-1 text-xs text-slate-400">{rows.slice(0, 5).map((r, i) => <li key={i}>{r.doctor_name || '(no name)'}{r.specialty ? ` · ${r.specialty}` : ''}{r.area ? ` · ${r.area}` : ''}</li>)}</ul>
          </div>
        )}
        {result && (
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-200">
            {result.created} added, {result.updated} updated.
            {result.skipped.length > 0 && <ul className="mt-2 text-xs text-amber-200">{result.skipped.slice(0, 8).map((s: any) => <li key={s.row}>Row {s.row}: {s.reason}</li>)}</ul>}
          </div>
        )}
        {err && <p className="text-sm text-red-300">{err}</p>}
        <div className="flex justify-end gap-2">
          <button className={ghostCls} onClick={onClose}>{result ? 'Close' : 'Cancel'}</button>
          {!result && <Button className={primaryCls} disabled={!rows.length || busy} onClick={run}>{busy ? 'Importing…' : `Import ${rows.length || ''}`}</Button>}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Doctors directory ────────────────────────────────────────────────────────
export function DoctorsPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState<{ doctors: any[]; total: number } | null>(null);
  const [facets, setFacets] = useState<any>(null);
  const [search, setSearch] = useState(params.get('q') || '');
  const [filters, setFilters] = useState<Record<string, string>>({ specialty: '', area: '', potential: '', relationship: '', owner: '', view: params.get('view') || '', sort: 'referrals' });
  const [page, setPage] = useState(1);
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [flash, setFlash] = useState<FlashMsg>(null);

  const load = useCallback(async () => {
    try { setData(await rn('/doctors', 'get', undefined, { ...filters, search, page, limit: 50 })); }
    catch (e: any) { setFlash({ text: e.message, ok: false }); setData({ doctors: [], total: 0 }); }
  }, [filters, search, page]);
  useEffect(() => { const t = setTimeout(load, search ? 250 : 0); return () => clearTimeout(t); }, [load, search]);
  const loadFacets = () => rn('/doctors/facets').then(setFacets).catch(() => {});
  useEffect(() => { loadFacets(); }, []);
  const setF = (k: string) => (e: any) => { setFilters({ ...filters, [k]: e.target.value }); setPage(1); if (k === 'view') setParams(e.target.value ? { view: e.target.value } : {}, { replace: true }); };
  const manager = Boolean(facets?.manager);
  const pages = Math.max(1, Math.ceil((data?.total || 0) / 50));
  const filtered = Boolean(search) || ['specialty', 'area', 'potential', 'relationship', 'owner', 'view'].some((k) => filters[k]);

  return (
    <CRMLayout title="Doctors">
      <div className="space-y-4">
        <Flash msg={flash} onClose={() => setFlash(null)} />
        <div className="flex flex-col xl:flex-row gap-3 justify-between">
          <div className="flex flex-wrap gap-2 flex-1">
            <div className="relative flex-1 min-w-[220px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-600" />
              <input aria-label="Search doctors" placeholder="Search name, hospital, area or mobile" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className={`${inputCls} pl-10`} />
            </div>
            <select aria-label="View" className={selectCls} value={filters.view} onChange={setF('view')}><Opt value="">All doctors</Opt><Opt value="overdue">Visit overdue</Opt></select>
            <select aria-label="Specialty" className={selectCls} value={filters.specialty} onChange={setF('specialty')}><Opt value="">All specialties</Opt>{facets?.specialties?.map((s: any) => <Opt key={s.value} value={s.value}>{s.value} ({s.n})</Opt>)}</select>
            <select aria-label="Area" className={selectCls} value={filters.area} onChange={setF('area')}><Opt value="">All areas</Opt>{facets?.areas?.map((s: any) => <Opt key={s.value} value={s.value}>{s.value} ({s.n})</Opt>)}</select>
            <select aria-label="Referral potential" className={selectCls} value={filters.potential} onChange={setF('potential')}><Opt value="">Any potential</Opt>{['champion', 'high', 'medium', 'low'].map((p) => <Opt key={p} value={p}>{words(p)}</Opt>)}</select>
            <select aria-label="Relationship" className={selectCls} value={filters.relationship} onChange={setF('relationship')}><Opt value="">Any relationship</Opt>{facets?.relationship?.map((p: string) => <Opt key={p} value={p}>{words(p)}</Opt>)}</select>
            {manager && <select aria-label="Field executive" className={selectCls} value={filters.owner} onChange={setF('owner')}><Opt value="">Every executive</Opt><Opt value="none">Not assigned</Opt>{facets?.team?.map((t: any) => <Opt key={t.id} value={String(t.id)}>{t.name || t.email}</Opt>)}</select>}
            <select aria-label="Sort" className={selectCls} value={filters.sort} onChange={setF('sort')}><Opt value="referrals">Most referrals</Opt><Opt value="last_visit">Longest since visit</Opt><Opt value="potential">Highest potential</Opt><Opt value="name">Name</Opt></select>
          </div>
          <div className="flex gap-2">
            {manager && <button className={ghostCls} onClick={() => setImporting(true)}><Upload className="h-4 w-4" /> Import</button>}
            {facets?.canEdit && <Button className={primaryCls} onClick={() => setAdding(true)}><Plus className="h-4 w-4 mr-1.5" /> Add doctor</Button>}
          </div>
        </div>

        <Card>
          {!data ? <Loading /> : data.doctors.length === 0 ? (
            <Empty icon={Stethoscope} title={filtered ? 'No doctors match these filters' : 'No doctors yet'}
              body="Doctors added here or by field executives in the app appear in one list, with their referrals and visits."
              action={!filtered && facets?.canEdit ? <div className="flex gap-2">{manager && <button className={ghostCls} onClick={() => setImporting(true)}><Upload className="h-4 w-4" /> Import a spreadsheet</button>}<Button className={primaryCls} onClick={() => setAdding(true)}><Plus className="h-4 w-4 mr-1.5" /> Add a doctor</Button></div> : undefined} />
          ) : (
            <>
              <Table head={['Doctor', 'Area', 'Potential', 'Relationship', 'Referrals (30 days / all)', 'Treated', 'Last visit', 'Executive']}>
                {data.doctors.map((d) => (
                  <tr key={d.id} className={`${rowCls} cursor-pointer`} onClick={() => navigate(`/crm/doctors/${d.id}`)}>
                    <td className={cellCls}>
                      <Link to={`/crm/doctors/${d.id}`} onClick={(e) => e.stopPropagation()} className="font-medium text-white hover:text-violet-300">{d.doctor_name}</Link>
                      <div className="text-xs text-slate-500">{[d.specialty, d.hospital_affiliation].filter(Boolean).join(' · ') || '—'}</div>
                    </td>
                    <td className={`${cellCls} text-slate-300`}>{d.area || d.city || '—'}</td>
                    <td className={cellCls}><Pill tone={POTENTIAL_TONE[d.referral_potential]}>{words(d.referral_potential)}</Pill></td>
                    <td className={cellCls}><Pill tone={REL_TONE[d.relationship_status]}>{words(d.relationship_status)}</Pill></td>
                    <td className={`${cellCls} tabular-nums`}><span className="text-white font-medium">{d.referrals_30d}</span><span className="text-slate-500"> / {d.referrals_total}</span></td>
                    <td className={`${cellCls} tabular-nums text-slate-300`}>{d.treated_total}</td>
                    <td className={cellCls}><span className={d.visit_overdue ? 'text-amber-300' : 'text-slate-300'}>{ago(d.last_visit_date)}</span>{d.visit_overdue && <div className="text-[11px] text-amber-400/80">visit due</div>}</td>
                    <td className={`${cellCls} text-slate-300`}>{d.owner_name || <span className="text-slate-600">Not assigned</span>}</td>
                  </tr>
                ))}
              </Table>
              <div className="flex items-center justify-between px-4 py-3 border-t border-white/[0.04] text-xs text-slate-500">
                <span>{data.total} doctor{data.total === 1 ? '' : 's'}</span>
                {pages > 1 && <div className="flex gap-2"><button className={ghostCls} disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button><span className="self-center">Page {page} of {pages}</span><button className={ghostCls} disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button></div>}
              </div>
            </>
          )}
        </Card>
      </div>
      <DoctorDialog open={adding} onClose={() => setAdding(false)} team={facets?.team || []} manager={manager} onSaved={(d) => navigate(`/crm/doctors/${d.id}`)} />
      <ImportDialog open={importing} onClose={() => setImporting(false)} onDone={(m) => { setFlash({ text: m, ok: true }); load(); loadFacets(); }} />
    </CRMLayout>
  );
}

// ─── Refer a patient ──────────────────────────────────────────────────────────
function ReferDialog({ open, onClose, doctor, onDone }: { open: boolean; onClose: () => void; doctor: any; onDone: (r: any) => void }) {
  const [form, setForm] = useState({ patient_name: '', phone: '', need: '', urgent: false, notify_doctor: true });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setForm({ patient_name: '', phone: '', need: '', urgent: false, notify_doctor: Boolean(doctor?.phone) }); setErr(''); } }, [open, doctor]);
  const save = async () => {
    setBusy(true); setErr('');
    try { onDone(await rn(`/doctors/${doctor.id}/referrals`, 'post', form)); onClose(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md bg-[#0d1120] border-white/[0.08] text-white">
        <DialogHeader><DialogTitle>Record a referral from {doctor?.doctor_name}</DialogTitle></DialogHeader>
        <p className="text-sm text-slate-400">Creates the patient in Leads and the Inbox, credited to this doctor. If the mobile is already a patient, the credit is added to that record.</p>
        <div className="space-y-3">
          <Field label="Patient name *"><input className={inputCls} value={form.patient_name} onChange={(e) => setForm({ ...form, patient_name: e.target.value })} autoFocus /></Field>
          <Field label="Mobile *"><input className={inputCls} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} inputMode="tel" placeholder="10-digit mobile" /></Field>
          <Field label="What they need"><input className={inputCls} value={form.need} onChange={(e) => setForm({ ...form, need: e.target.value })} placeholder="e.g. Angiography, knee replacement consult" /></Field>
          <label className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" checked={form.urgent} onChange={(e) => setForm({ ...form, urgent: e.target.checked })} /> Urgent: call today</label>
          <label className={`flex items-center gap-2 text-sm ${doctor?.phone ? 'text-slate-300' : 'text-slate-600'}`}><input type="checkbox" disabled={!doctor?.phone} checked={form.notify_doctor} onChange={(e) => setForm({ ...form, notify_doctor: e.target.checked })} /> Thank the doctor on WhatsApp{doctor?.phone ? '' : ' (no mobile on file)'}</label>
        </div>
        {err && <p className="text-sm text-red-300">{err}</p>}
        <div className="flex justify-end gap-2"><button className={ghostCls} onClick={onClose}>Cancel</button><Button className={primaryCls} disabled={busy || !form.patient_name.trim() || digits(form.phone).length < 10} onClick={save}>{busy ? 'Saving…' : 'Record referral'}</Button></div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Doctor profile ───────────────────────────────────────────────────────────
type ProfileTab = 'referrals' | 'visits' | 'samples' | 'events' | 'messages' | 'intel';
export function DoctorProfilePage() {
  const { id } = useParams();
  const [p, setP] = useState<any>(null);
  const [team, setTeam] = useState<any[]>([]);
  const [tab, setTab] = useState<ProfileTab>('referrals');
  const [editing, setEditing] = useState(false);
  const [referring, setReferring] = useState(false);
  const [messaging, setMessaging] = useState(false);
  const [flash, setFlash] = useState<FlashMsg>(null);
  const [notFound, setNotFound] = useState('');
  const load = useCallback(async () => { try { setP(await rn(`/doctors/${id}`)); } catch (e: any) { setNotFound(e.message); } }, [id]);
  useEffect(() => { load(); rn('/team').then(setTeam).catch(() => {}); }, [load]);

  if (notFound) return <CRMLayout title="Doctor"><Card><Empty icon={Stethoscope} title={notFound} action={<Link to="/crm/doctors" className={ghostCls}>Back to doctors</Link>} /></Card></CRMLayout>;
  if (!p) return <CRMLayout title="Doctor"><Loading /></CRMLayout>;
  const d = p.doctor, s = p.stats;
  const trend = s.referrals_prev_30d ? Math.round(((s.referrals_30d - s.referrals_prev_30d) / s.referrals_prev_30d) * 100) : null;
  const wa = waLink(d.phone);
  const funnel = [{ k: 'Referred', v: s.referrals }, { k: 'Booked', v: s.booked }, { k: 'Visited', v: s.visited }, { k: 'Treated', v: s.treated }];
  const pct = (n: number) => (s.referrals ? `${Math.round((n / s.referrals) * 100)}% of referrals` : 'No referrals yet');

  return (
    <CRMLayout title="Doctor">
      <div className="space-y-4">
        <Link to="/crm/doctors" className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-white"><ChevronLeft className="h-4 w-4" /> Doctors</Link>
        <Flash msg={flash} onClose={() => setFlash(null)} />

        <Card className="p-5">
          <div className="flex flex-col lg:flex-row lg:items-start gap-5">
            <div className="flex items-start gap-4 flex-1 min-w-0">
              <div className="h-14 w-14 shrink-0 rounded-2xl bg-gradient-to-br from-violet-600 to-blue-600 grid place-items-center text-lg font-semibold text-white">{initials(d.doctor_name)}</div>
              <div className="min-w-0">
                <h2 className="text-xl font-semibold text-white">{d.doctor_name}</h2>
                <p className="text-sm text-slate-400">{[d.qualification, d.specialty].filter(Boolean).join(' · ') || 'Specialty not recorded'}</p>
                <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-400">
                  {d.hospital_affiliation && <span className="inline-flex items-center gap-1"><Building2 className="h-3.5 w-3.5" />{d.hospital_affiliation}</span>}
                  {(d.area || d.city) && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{[d.area, d.city].filter(Boolean).join(', ')}</span>}
                  {d.opd_days && <span className="inline-flex items-center gap-1"><CalendarClock className="h-3.5 w-3.5" />OPD {d.opd_days}</span>}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Pill tone={POTENTIAL_TONE[d.referral_potential]}>{words(d.referral_potential)} potential</Pill>
                  <Pill tone={REL_TONE[d.relationship_status]}>{words(d.relationship_status)}</Pill>
                  <Pill tone="slate">{d.visit_frequency_target || 1} visit{Number(d.visit_frequency_target) === 1 ? '' : 's'} a month</Pill>
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-3 lg:items-end">
              <div className="flex flex-wrap gap-2">
                <Button className={primaryCls} onClick={() => setReferring(true)}><UserPlus className="h-4 w-4 mr-1.5" /> Record referral</Button>
                {d.phone && <a className={ghostCls} href={`tel:${digits(d.phone)}`}><Phone className="h-4 w-4" /> Call</a>}
                {d.phone && p.canEdit && <button className={ghostCls} onClick={() => setMessaging(true)}><Send className="h-4 w-4" /> Message</button>}
                {wa && <a className={ghostCls} href={wa} target="_blank" rel="noreferrer" title="Open WhatsApp on this device"><MessageCircle className="h-4 w-4" /> WhatsApp</a>}
                {p.canEdit && <button className={ghostCls} onClick={() => setEditing(true)}><Pencil className="h-4 w-4" /> Edit</button>}
              </div>
              <div className="text-sm text-slate-400">
                Executive:{' '}
                {p.manager ? (
                  <select aria-label="Field executive" className={`${selectCls} h-8 ml-1`} value={d.assigned_exec_id || ''} onChange={async (e) => {
                    try { await rn(`/doctors/${d.id}`, 'patch', { assigned_exec_id: e.target.value ? Number(e.target.value) : null }); setFlash({ text: 'Executive updated.', ok: true }); load(); }
                    catch (er: any) { setFlash({ text: er.message, ok: false }); }
                  }}><Opt value="">Not assigned</Opt>{team.map((t) => <Opt key={t.id} value={String(t.id)}>{t.name || t.email}</Opt>)}</select>
                ) : <span className="text-slate-200">{d.owner_name || 'Not assigned'}</span>}
              </div>
              <div className="text-xs text-slate-500">Last visit {ago(d.last_visit_date)}{d.next_visit_date ? ` · next ${date(d.next_visit_date)}` : ''}</div>
            </div>
          </div>
        </Card>

        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <Kpi icon={TrendingUp} label="Referrals, 30 days" value={s.referrals_30d} sub={trend == null ? `${s.referrals} in total` : `${trend >= 0 ? '▲' : '▼'} ${Math.abs(trend)}% on the 30 days before`} tone={trend == null ? undefined : trend >= 0 ? 'up' : 'down'} />
          <Kpi label="Booked" value={s.booked} sub={pct(s.booked)} />
          <Kpi label="Visited" value={s.visited} sub={pct(s.visited)} />
          <Kpi label="Treated" value={s.treated} sub={Number(s.revenue) > 0 ? `${inr(s.revenue)} billed` : pct(s.treated)} />
          <Kpi icon={RouteIcon} label="Visits by our team" value={p.visits.filter((v: any) => v.status === 'completed').length} sub={`${p.samples.length} sample handover${p.samples.length === 1 ? '' : 's'}`} />
        </div>

        {s.referrals > 0 && (
          <Card className="px-5 py-4">
            <div className="flex items-center gap-3">
              {funnel.map((f, i) => (
                <div key={f.k} className="flex-1">
                  <div className="flex justify-between text-xs text-slate-400"><span>{f.k}</span><span className="tabular-nums text-slate-200">{f.v}</span></div>
                  <div className="mt-1 h-2 rounded-full bg-white/[0.05] overflow-hidden"><div className={`h-full rounded-full ${['bg-slate-400', 'bg-violet-500', 'bg-amber-400', 'bg-emerald-400'][i]}`} style={{ width: `${Math.max(3, (f.v / s.referrals) * 100)}%` }} /></div>
                </div>
              ))}
            </div>
          </Card>
        )}

        <Card>
          <div className="px-3"><Tabs<ProfileTab> value={tab} onChange={setTab} tabs={[
            { id: 'referrals', label: 'Referred patients', count: p.referrals.length }, { id: 'visits', label: 'Visits', count: p.visits.length },
            { id: 'samples', label: 'Samples', count: p.samples.length }, { id: 'events', label: 'CME and camps', count: p.events.length + p.camp_referrals.length },
            { id: 'messages', label: 'Messages', count: (p.messages || []).length },
            { id: 'intel', label: 'Relationship notes' },
          ]} /></div>
          {tab === 'referrals' && (p.referrals.length === 0 ? (
            <Empty icon={UserPlus} title="No referrals recorded yet" body="Record a referral here, or field executives record them from the app after a visit. Each one becomes a patient in Leads and the Inbox." action={<Button className={primaryCls} onClick={() => setReferring(true)}><UserPlus className="h-4 w-4 mr-1.5" /> Record referral</Button>} />
          ) : (
            <Table head={['Patient', 'Journey stage', 'Next step', 'Owner', 'Referred', '']}>
              {p.referrals.map((r: any) => (
                <tr key={r.lead_id} className={rowCls}>
                  <td className={cellCls}><div className="font-medium text-white">{r.name}</div><div className="text-xs text-slate-500">{r.phone}</div></td>
                  <td className={cellCls}><Pill tone={STAGE[r.lifecycle_stage]?.tone}>{STAGE[r.lifecycle_stage]?.label || words(r.lifecycle_stage)}</Pill></td>
                  <td className={`${cellCls} text-slate-300`}>{r.next_action ? <>{r.next_action}<div className="text-xs text-slate-500">{dateTime(r.next_action_at)}</div></> : <span className="text-slate-600">None</span>}</td>
                  <td className={`${cellCls} text-slate-300`}>{r.owner_name || <span className="text-slate-600">Unassigned</span>}</td>
                  <td className={`${cellCls} text-slate-400`}>{date(r.created_at)}{r.referred_by_name && <div className="text-xs text-slate-500">by {r.referred_by_name}</div>}</td>
                  <td className={cellCls}><Link to={`/crm/inbox#lead=${r.lead_id}`} className="inline-flex items-center gap-1 text-xs text-violet-300 hover:text-violet-200"><InboxIcon className="h-3.5 w-3.5" /> Open</Link></td>
                </tr>
              ))}
            </Table>
          ))}
          {tab === 'visits' && (p.visits.length === 0 ? <Empty icon={RouteIcon} title="No visits yet" body="Visits checked in from the Smart-Force app appear here with GPS, who was met, outcome and samples." /> : (
            <ol className="px-5 py-4 space-y-3">
              {p.visits.map((v: any) => (
                <li key={v.id} className="rounded-xl border border-white/[0.05] bg-white/[0.02] p-3">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-medium text-white">{dateTime(v.check_in_at || v.planned_at)}</span>
                    <Pill tone={VISIT_TONE[v.status]}>{words(v.status)}</Pill>
                    {v.is_unplanned && <Pill tone="amber">unplanned</Pill>}
                    <span className="text-slate-400">{v.exec_name}</span>
                    {v.duration_seconds ? <span className="text-slate-500">· {Math.round(v.duration_seconds / 60)} min</span> : null}
                    {v.check_in_lat && <a className="ml-auto inline-flex items-center gap-1 text-xs text-violet-300" href={`https://www.google.com/maps?q=${v.check_in_lat},${v.check_in_lng}`} target="_blank" rel="noreferrer"><MapPin className="h-3.5 w-3.5" /> GPS{v.check_in_accuracy_m ? ` ±${Math.round(v.check_in_accuracy_m)} m` : ''}</a>}
                    {v.has_photo && <span className="inline-flex items-center gap-1 text-xs text-slate-400"><Camera className="h-3.5 w-3.5" /> photo</span>}
                  </div>
                  <div className="mt-1.5 grid gap-1 text-sm text-slate-300">
                    {v.met_person && <div><span className="text-slate-500">Met </span>{v.met_person}{v.met_designation ? ` (${v.met_designation})` : ''}</div>}
                    {v.outcome && <div><span className="text-slate-500">Outcome </span>{v.outcome}</div>}
                    {v.materials_shared?.length > 0 && <div><span className="text-slate-500">Materials </span>{v.materials_shared.join(', ')}</div>}
                    {v.next_action && <div><span className="text-slate-500">Next </span>{v.next_action}{v.follow_up_date ? ` · ${date(v.follow_up_date)}` : ''}</div>}
                  </div>
                </li>
              ))}
            </ol>
          ))}
          {tab === 'samples' && (p.samples.length === 0 ? <Empty icon={Package} title="No samples or collateral handed over" body="Handovers recorded in the app, with the doctor's signature, appear here." /> : (
            <Table head={['Date', 'Items', 'Signed', 'By']}>
              {p.samples.map((h: any) => (
                <tr key={h.id} className={rowCls}>
                  <td className={`${cellCls} text-slate-300`}>{dateTime(h.created_at)}</td>
                  <td className={`${cellCls} text-slate-200`}>{itemsText(h.items)}</td>
                  <td className={cellCls}>{h.signed ? <Pill tone="emerald"><ShieldCheck className="h-3 w-3" /> signed</Pill> : <Pill tone="amber">no signature</Pill>}</td>
                  <td className={`${cellCls} text-slate-400`}>{h.exec_name}</td>
                </tr>
              ))}
            </Table>
          ))}
          {tab === 'events' && (p.events.length + p.camp_referrals.length === 0 ? <Empty icon={CalendarDays} title="No CME or camp history" body="Invite this doctor to a CME, or add them as a speaker, from Events." action={<Link to="/crm/events" className={ghostCls}>Go to Events</Link>} /> : (
            <ul className="px-5 py-4 space-y-2">
              {p.events.map((e: any) => (
                <li key={`${e.role}-${e.id}`} className="flex flex-wrap items-center gap-2 text-sm">
                  {e.role === 'speaker' ? <Mic className="h-4 w-4 text-violet-300" /> : <Users className="h-4 w-4 text-sky-300" />}
                  <span className="text-white">{e.name}</span><span className="text-slate-500">{date(e.scheduled_at)}</span>
                  <Pill tone={e.role === 'speaker' ? 'violet' : e.attended ? 'emerald' : 'slate'}>{e.role === 'speaker' ? 'speaker' : e.attended ? 'attended' : 'invited'}</Pill>
                  {e.role === 'speaker' && !e.compliance_cleared && <Pill tone="amber">compliance pending</Pill>}
                </li>
              ))}
              {p.camp_referrals.map((c: any) => (
                <li key={`camp-${c.id}`} className="flex items-center gap-2 text-sm"><Tent className="h-4 w-4 text-amber-300" /><span className="text-white">{c.patient_name}</span><span className="text-slate-500">referred to this doctor at {c.camp_name || 'a camp'} · {date(c.created_at)}</span></li>
              ))}
            </ul>
          ))}
          {tab === 'messages' && ((p.messages || []).length === 0 ? <Empty icon={Send} title="No messages sent to this doctor" body="WhatsApp messages sent from the CRM (thank-yous, CME invitations, patient updates) are listed here." action={d.phone && p.canEdit ? <button className={ghostCls} onClick={() => setMessaging(true)}><Send className="h-4 w-4" /> Send a message</button> : undefined} /> : (
            <ul className="px-5 py-4 space-y-2">{p.messages.map((m: any) => (
              <li key={m.id} className="rounded-xl border border-white/[0.05] bg-white/[0.02] p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500"><span>{dateTime(m.created_at)}</span>{m.by_name && <span>· {m.by_name}</span>}<Pill tone={m.status === 'read' ? 'emerald' : m.status === 'failed' ? 'red' : 'slate'}>{m.status}</Pill></div>
                <p className="mt-1 text-slate-200 whitespace-pre-wrap">{m.body}</p>
              </li>
            ))}</ul>
          ))}
          {tab === 'intel' && <IntelForm doctor={d} intel={p.intel} canEdit={p.canEdit} onSaved={() => { setFlash({ text: 'Relationship notes saved.', ok: true }); load(); }} />}
        </Card>
      </div>
      <DoctorDialog open={editing} onClose={() => setEditing(false)} initial={d} team={team} manager={p.manager} onSaved={() => { setFlash({ text: 'Doctor updated.', ok: true }); load(); }} />
      <ReferDialog open={referring} onClose={() => setReferring(false)} doctor={d} onDone={(r) => { const base = r.created ? 'Referral recorded. The patient is in Leads and the Inbox.' : 'Credit added to the existing patient record.'; const thanks = r.notified ? (r.notified.sent ? ' The doctor was thanked on WhatsApp.' : ` The WhatsApp thank-you was not sent: ${r.notified.reason}`) : ''; setFlash({ text: base + thanks, ok: true }); setTab('referrals'); load(); }} />
      <MessageDialog open={messaging} onClose={() => setMessaging(false)} doctor={d} onSent={(m) => { setFlash({ text: m, ok: true }); setTab('messages'); load(); }} />
    </CRMLayout>
  );
}

function MessageDialog({ open, onClose, doctor, onSent }: { open: boolean; onClose: () => void; doctor: any; onSent: (m: string) => void }) {
  const [templates, setTemplates] = useState<any[] | null>(null);
  const [pick, setPick] = useState('');
  const [vals, setVals] = useState<string[]>([]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!open) return; setErr(''); setPick(''); setVals([]); rn('/doctor-templates').then(setTemplates).catch((e) => { setErr(e.message); setTemplates([]); }); }, [open]);
  const t = templates?.find((x) => String(x.id) === pick);
  useEffect(() => { if (t) setVals(Array.from({ length: t.placeholders }, (_, i) => (i === 0 ? String(doctor?.doctor_name || '').replace(/^dr\.?\s+/i, '') : ''))); }, [pick]); // eslint-disable-line react-hooks/exhaustive-deps
  const preview = t ? String(t.body).replace(/\{\{(\d+)\}\}/g, (m: string, n: string) => vals[Number(n) - 1] || m) : '';
  const label = (x: any) => templateLabel(String(x.family || x.name)).replace(/^doctor /, '');
  const send = async () => { setBusy(true); setErr(''); try { const r: any = await rn(`/doctors/${doctor.id}/send`, 'post', { templateId: t.id, params: vals }); onSent(`WhatsApp sent to ${doctor.doctor_name} (${r.to}).`); onClose(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg bg-[#0d1120] border-white/[0.08] text-white">
        <DialogHeader><DialogTitle>WhatsApp {doctor?.doctor_name}</DialogTitle></DialogHeader>
        <p className="text-sm text-slate-400">Doctors receive Meta-approved templates only. Sent from {BRAND.name}'s WhatsApp number to {doctor?.phone}, and logged on this profile.</p>
        {!templates ? <Loading /> : templates.length === 0 ? <p className="text-sm text-slate-400">No doctor templates yet. Add them on the WhatsApp templates page.</p> : (
          <>
            <Field label="Template">
              <select className={`${selectCls} w-full`} value={pick} onChange={(e) => setPick(e.target.value)}>
                <Opt value="">Choose…</Opt>
                {templates.map((x) => <option key={x.id} value={String(x.id)} disabled={x.status !== 'approved'} className="bg-[#0d1120]">{label(x)}{x.status !== 'approved' ? ` (${words(x.status)}: waiting for Meta)` : ''}</option>)}
              </select>
            </Field>
            {templates.every((x) => x.status !== 'approved') && <p className="text-xs text-amber-300">The doctor templates are waiting for Meta's approval, usually a few hours. They become available here as soon as Meta approves them.</p>}
            {t && <div className="space-y-2">
              {vals.map((v, i) => <Field key={i} label={`Value {{${i + 1}}}`}><input className={inputCls} value={v} onChange={(e) => setVals(vals.map((x, j) => (j === i ? e.target.value : x)))} /></Field>)}
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-sm text-slate-200 whitespace-pre-wrap">{preview}</div>
            </div>}
          </>
        )}
        {err && <p className="text-sm text-red-300">{err}</p>}
        <div className="flex justify-end gap-2"><button className={ghostCls} onClick={onClose}>Cancel</button><Button className={primaryCls} disabled={!t || busy || vals.some((v) => !v.trim())} onClick={send}><Send className="h-4 w-4 mr-1.5" />{busy ? 'Sending…' : 'Send'}</Button></div>
      </DialogContent>
    </Dialog>
  );
}

function IntelForm({ doctor, intel, canEdit, onSaved }: { doctor: any; intel: any; canEdit: boolean; onSaved: () => void }) {
  const [form, setForm] = useState({ gatekeeper_name: '', gatekeeper_phone: '', opd_days: '', best_visit_time: '', notes: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => { setForm({ gatekeeper_name: intel?.gatekeeper_name || '', gatekeeper_phone: intel?.gatekeeper_phone || '', opd_days: intel?.opd_days || doctor.opd_days || '', best_visit_time: intel?.best_visit_time || '', notes: intel?.notes || '' }); }, [intel, doctor]);
  const set = (k: string) => (e: any) => setForm({ ...form, [k]: e.target.value });
  const save = async () => { setBusy(true); setErr(''); try { await rn(`/doctors/${doctor.id}/intel`, 'put', form); onSaved(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } };
  return (
    <div className="px-5 py-4 space-y-3">
      <p className="text-xs text-slate-500">Who to go through, when the doctor is free, and what matters to them. Shared with everyone who visits this doctor.{intel?.updated_at ? ` Updated ${ago(intel.updated_at)}.` : ''}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Gatekeeper (assistant, receptionist)"><input className={inputCls} value={form.gatekeeper_name} onChange={set('gatekeeper_name')} disabled={!canEdit} /></Field>
        <Field label="Gatekeeper's mobile"><input className={inputCls} value={form.gatekeeper_phone} onChange={set('gatekeeper_phone')} disabled={!canEdit} inputMode="tel" /></Field>
        <Field label="OPD days and times"><input className={inputCls} value={form.opd_days} onChange={set('opd_days')} disabled={!canEdit} /></Field>
        <Field label="Best time to visit"><input className={inputCls} value={form.best_visit_time} onChange={set('best_visit_time')} disabled={!canEdit} placeholder="After OPD, 1–2 pm" /></Field>
        <Field label="Notes" wide><textarea className={`${inputCls} h-24 py-2`} value={form.notes} onChange={set('notes')} disabled={!canEdit} placeholder="Interests, concerns, what they need from Medstar" /></Field>
      </div>
      {err && <p className="text-sm text-red-300">{err}</p>}
      {canEdit && <div className="flex justify-end"><Button className={primaryCls} onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save notes'}</Button></div>}
    </div>
  );
}

// ─── Referral network (Business Head) ─────────────────────────────────────────
export function ReferralNetworkPage() {
  const [days, setDays] = useState('30');
  const [o, setO] = useState<any>(null);
  const [err, setErr] = useState('');
  useEffect(() => { setO(null); rn('/overview', 'get', undefined, { days }).then(setO).catch((e) => setErr(e.message)); }, [days]);
  const k = o?.kpi;
  const change = k && k.referrals_prev ? Math.round(((k.referrals - k.referrals_prev) / k.referrals_prev) * 100) : null;
  return (
    <CRMLayout title="Referral network">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-400">Which doctors send patients, how far those patients get, and where the field team should go next.</p>
          <select aria-label="Period" className={selectCls} value={days} onChange={(e) => setDays(e.target.value)}><Opt value="30">Last 30 days</Opt><Opt value="90">Last 90 days</Opt><Opt value="180">Last 6 months</Opt><Opt value="365">Last 12 months</Opt></select>
        </div>
        {err && <Flash msg={{ text: err, ok: false }} onClose={() => setErr('')} />}
        {!o ? (!err && <Loading />) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
              <Kpi icon={Stethoscope} label="Doctors" value={k.doctors} sub={`${k.active_referrers} referred in the period`} />
              <Kpi icon={TrendingUp} label="Referrals" value={k.referrals} sub={change == null ? 'No earlier period to compare' : `${change >= 0 ? '▲' : '▼'} ${Math.abs(change)}% on the period before`} tone={change == null ? undefined : change >= 0 ? 'up' : 'down'} />
              <Kpi label="Visited the hospital" value={k.visited} sub={k.referrals ? `${Math.round((k.visited / k.referrals) * 100)}% of referrals` : '—'} />
              <Kpi label="Treated" value={k.treated} sub={k.referrals ? `${Math.round((k.treated / k.referrals) * 100)}% of referrals` : '—'} />
              <Kpi icon={IndianRupee} label="Billed" value={Number(k.revenue) > 0 ? inr(k.revenue) : '—'} sub={Number(k.revenue) > 0 ? 'From referred patients' : 'Billing amounts not recorded yet'} />
              <Kpi icon={RouteIcon} label="Doctor visits" value={k.visits} sub="Completed by the field team" />
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
              <Card className="xl:col-span-2">
                <CardHead title="Doctor league" sub="Ranked by referrals in the period, with how far each doctor's patients got" right={<Link to="/crm/doctors" className="text-xs text-violet-300">All doctors →</Link>} />
                {o.league.length === 0 ? <Empty icon={TrendingUp} title="No referrals in this period" body="Record referrals on a doctor's profile, or from the app after a visit." /> : (
                  <Table head={['#', 'Doctor', 'Referrals', 'Booked', 'Visited', 'Treated', 'Billed', 'Executive']}>
                    {o.league.map((d: any, i: number) => (
                      <tr key={d.id} className={rowCls}>
                        <td className={`${cellCls} text-slate-500 tabular-nums`}>{i + 1}</td>
                        <td className={cellCls}><Link to={`/crm/doctors/${d.id}`} className="font-medium text-white hover:text-violet-300">{d.doctor_name}</Link><div className="text-xs text-slate-500">{[d.specialty, d.area].filter(Boolean).join(' · ')}</div></td>
                        <td className={`${cellCls} tabular-nums font-medium text-white`}>{d.referrals}</td>
                        <td className={`${cellCls} tabular-nums text-slate-300`}>{d.booked}</td>
                        <td className={`${cellCls} tabular-nums text-slate-300`}>{d.visited}</td>
                        <td className={`${cellCls} tabular-nums text-emerald-300`}>{d.treated}</td>
                        <td className={`${cellCls} tabular-nums text-slate-300`}>{Number(d.revenue) > 0 ? inr(d.revenue) : '—'}</td>
                        <td className={`${cellCls} text-slate-400`}>{d.owner_name || '—'}</td>
                      </tr>
                    ))}
                  </Table>
                )}
              </Card>
              <div className="space-y-4">
                <Card>
                  <CardHead title="Referrals falling" sub="Half or less of the period before (at least 2 before)" />
                  {o.falling.length === 0 ? <p className="px-5 pb-4 text-sm text-slate-500">No doctor's referrals have dropped by half.</p> : (
                    <ul className="px-5 pb-4 space-y-2">{o.falling.map((d: any) => (
                      <li key={d.id} className="flex items-center justify-between gap-2 text-sm"><Link to={`/crm/doctors/${d.id}`} className="text-white hover:text-violet-300 truncate">{d.doctor_name}</Link><span className="inline-flex items-center gap-1 text-red-300 tabular-nums"><TrendingDown className="h-3.5 w-3.5" />{d.before_count} → {d.now_count}</span></li>
                    ))}</ul>
                  )}
                </Card>
                <Card>
                  <CardHead title="Not visited in 30 days" sub="Highest potential first" right={<Link to="/crm/doctors?view=overdue" className="text-xs text-violet-300">See all →</Link>} />
                  {o.not_visited.length === 0 ? <p className="px-5 pb-4 text-sm text-slate-500">Every active doctor was visited in the last 30 days.</p> : (
                    <ul className="px-5 pb-4 space-y-2">{o.not_visited.map((d: any) => (
                      <li key={d.id} className="flex items-center justify-between gap-2 text-sm"><Link to={`/crm/doctors/${d.id}`} className="text-white hover:text-violet-300 truncate">{d.doctor_name}</Link><span className="flex items-center gap-2"><Pill tone={POTENTIAL_TONE[d.referral_potential]}>{d.referral_potential}</Pill><span className="text-xs text-amber-300 whitespace-nowrap">{ago(d.last_visit_date)}</span></span></li>
                    ))}</ul>
                  )}
                </Card>
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <Card>
                <CardHead title="Coverage by potential" sub="Doctors visited in the last 30 days, and referring in the period" />
                {o.coverage.length === 0 ? <p className="px-5 pb-4 text-sm text-slate-500">No doctors yet.</p> : (
                  <div className="px-5 pb-5 space-y-3">{o.coverage.map((c: any) => (
                    <div key={c.tier}>
                      <div className="flex justify-between text-sm"><span className="capitalize text-slate-200">{c.tier}</span><span className="text-slate-400 tabular-nums">{c.visited_30d} of {c.doctors} visited · {c.referring} referring</span></div>
                      <div className="mt-1 h-2 rounded-full bg-white/[0.05] overflow-hidden"><div className="h-full bg-violet-500" style={{ width: `${c.doctors ? (c.visited_30d / c.doctors) * 100 : 0}%` }} /></div>
                    </div>
                  ))}</div>
                )}
              </Card>
              <Card>
                <CardHead title="Field executives" sub="In the period" right={<Link to="/crm/field-activity?tab=team" className="text-xs text-violet-300">Scorecard →</Link>} />
                {o.by_exec.length === 0 ? <p className="px-5 pb-4 text-sm text-slate-500">No field executives yet. Add team members with the Field Marketing Executive role.</p> : (
                  <Table head={['Executive', 'Doctors', 'Visits', 'Referrals', 'Treated']}>
                    {o.by_exec.map((e: any) => (
                      <tr key={e.id} className={rowCls}><td className={`${cellCls} text-white`}>{e.name || '—'}</td><td className={`${cellCls} tabular-nums text-slate-300`}>{e.doctors}</td><td className={`${cellCls} tabular-nums text-slate-300`}>{e.visits}</td><td className={`${cellCls} tabular-nums text-white`}>{e.referrals}</td><td className={`${cellCls} tabular-nums text-emerald-300`}>{e.treated}</td></tr>
                    ))}
                  </Table>
                )}
              </Card>
            </div>
          </>
        )}
      </div>
    </CRMLayout>
  );
}

// ─── Field activity ───────────────────────────────────────────────────────────
type ActivityTab = 'visits' | 'approvals' | 'reports' | 'samples' | 'team' | 'territories' | 'empanelment';
const KIND_LABEL: Record<string, { label: string; tone: string; icon: any }> = {
  expense: { label: 'Expenses', tone: 'blue', icon: IndianRupee }, tour_plan: { label: 'Tour plan', tone: 'violet', icon: CalendarDays },
  exception: { label: 'Out-of-beat visit', tone: 'amber', icon: AlertTriangle }, event_budget: { label: 'Event budget', tone: 'emerald', icon: Mic },
};
export function FieldActivityPage() {
  const [params, setParams] = useSearchParams();
  const user = me();
  const manager = hasCRMCapability(user, 'field_force:manage');
  const [tab, setTabState] = useState<ActivityTab>((params.get('tab') as ActivityTab) || 'visits');
  const setTab = (t: ActivityTab) => { setTabState(t); setParams({ tab: t }, { replace: true }); };
  const [approvalCount, setApprovalCount] = useState<number | undefined>();
  useEffect(() => { if (manager) rn('/approvals').then((a: any) => setApprovalCount(a.items.length)).catch(() => {}); }, [manager]);
  const tabs = [{ id: 'visits' as const, label: 'Visits' }, ...(manager ? [{ id: 'approvals' as const, label: 'Approvals', count: approvalCount }] : []),
    { id: 'reports' as const, label: 'Daily reports' }, { id: 'samples' as const, label: 'Samples log' }, { id: 'team' as const, label: 'Team scorecard' },
    { id: 'territories' as const, label: 'Territories' }, { id: 'empanelment' as const, label: 'Empanelment' }];
  return (
    <CRMLayout title="Field activity">
      <div className="space-y-4">
        <Tabs<ActivityTab> tabs={tabs} value={tab} onChange={setTab} />
        {tab === 'visits' && <VisitsTab manager={manager} />}
        {tab === 'approvals' && manager && <ApprovalsTab onCount={setApprovalCount} />}
        {tab === 'reports' && <ReportsTab />}
        {tab === 'samples' && <SamplesTab />}
        {tab === 'team' && <TeamTab />}
        {tab === 'territories' && <TerritoriesTab />}
        {tab === 'empanelment' && <EmpanelmentTab />}
      </div>
    </CRMLayout>
  );
}

function VisitsTab({ manager }: { manager: boolean }) {
  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 6 * 864e5).toISOString().slice(0, 10);
  const [q, setQ] = useState({ from: weekAgo, to: today, exec: '', status: '' });
  const [team, setTeam] = useState<any[]>([]);
  const [v, setV] = useState<any>(null);
  useEffect(() => { if (manager) rn('/team').then(setTeam).catch(() => {}); }, [manager]);
  useEffect(() => { setV(null); rn('/visits', 'get', undefined, q).then(setV).catch(() => setV({ visits: [], summary: {} })); }, [q]);
  const set = (k: string) => (e: any) => setQ({ ...q, [k]: e.target.value });
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        <input type="date" aria-label="From" className={selectCls} value={q.from} onChange={set('from')} />
        <span className="text-slate-500 text-sm">to</span>
        <input type="date" aria-label="To" className={selectCls} value={q.to} onChange={set('to')} />
        {manager && <select aria-label="Executive" className={selectCls} value={q.exec} onChange={set('exec')}><Opt value="">Every executive</Opt>{team.map((t) => <Opt key={t.id} value={String(t.id)}>{t.name || t.email}</Opt>)}</select>}
        <select aria-label="Status" className={selectCls} value={q.status} onChange={set('status')}><Opt value="">Any status</Opt>{['completed', 'planned', 'checked_in', 'exception', 'cancelled'].map((s) => <Opt key={s} value={s}>{words(s)}</Opt>)}</select>
      </div>
      {v && <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Kpi label="Visits" value={v.summary.total ?? 0} /><Kpi label="Completed" value={v.summary.completed ?? 0} /><Kpi label="Planned" value={v.summary.planned ?? 0} />
        <Kpi label="Out of beat" value={v.summary.exceptions ?? 0} tone={v.summary.exceptions ? 'warn' : undefined} sub={v.summary.exceptions ? 'Need approval' : undefined} /><Kpi label="Unplanned" value={v.summary.unplanned ?? 0} />
      </div>}
      <Card>
        {!v ? <Loading /> : v.visits.length === 0 ? <Empty icon={RouteIcon} title="No visits in these dates" body="Visits are checked in from the Smart-Force app with GPS. Try a wider date range." /> : (
          <Table head={['When', 'Executive', 'Doctor or place', 'Status', 'Outcome', 'Proof']}>
            {v.visits.map((x: any) => (
              <tr key={x.id} className={rowCls}>
                <td className={`${cellCls} text-slate-300 whitespace-nowrap`}>{dateTime(x.check_in_at || x.planned_at)}{x.duration_seconds ? <div className="text-xs text-slate-500">{Math.round(x.duration_seconds / 60)} min</div> : null}</td>
                <td className={`${cellCls} text-slate-200`}>{x.exec_name}</td>
                <td className={cellCls}>{x.doctor_crm_id ? <Link to={`/crm/doctors/${x.doctor_crm_id}`} className="text-white hover:text-violet-300">{x.doctor_name}</Link> : <span className="text-white">{x.entity_name || '—'}</span>}<div className="text-xs text-slate-500">{words(x.purpose)}{x.is_unplanned ? ' · unplanned' : ''}</div></td>
                <td className={cellCls}><Pill tone={VISIT_TONE[x.status]}>{words(x.status)}</Pill></td>
                <td className={`${cellCls} text-slate-300 max-w-[280px]`}>{x.outcome || <span className="text-slate-600">—</span>}{x.next_action && <div className="text-xs text-slate-500">Next: {x.next_action}</div>}</td>
                <td className={cellCls}><div className="flex items-center gap-2 text-xs">{x.check_in_lat && <a className="inline-flex items-center gap-1 text-violet-300" href={`https://www.google.com/maps?q=${x.check_in_lat},${x.check_in_lng}`} target="_blank" rel="noreferrer"><MapPin className="h-3.5 w-3.5" />GPS</a>}{x.has_photo && <span className="inline-flex items-center gap-1 text-slate-400"><Camera className="h-3.5 w-3.5" />photo</span>}</div></td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}

function ApprovalsTab({ onCount }: { onCount: (n: number) => void }) {
  const [view, setView] = useState<'pending' | 'decided'>('pending');
  const [a, setA] = useState<any>(null);
  const [flash, setFlash] = useState<FlashMsg>(null);
  const [rejecting, setRejecting] = useState<any>(null);
  const [approving, setApproving] = useState<any>(null);
  const [note, setNote] = useState('');
  const [amount, setAmount] = useState('');
  const load = useCallback(() => rn('/approvals', 'get', undefined, { status: view }).then((x: any) => { setA(x); if (view === 'pending') onCount(x.items.length); }).catch((e) => { setFlash({ text: e.message, ok: false }); setA({ items: [] }); }), [view, onCount]);
  useEffect(() => { setA(null); load(); }, [load]);
  const decide = async (item: any, approve: boolean) => {
    try {
      if (item.kind === 'expense') await ff(`/expenses/${item.id}/${approve ? 'approve' : 'reject'}`, approve ? { approved_amount: Number(amount || item.amount), approval_notes: note || undefined } : { rejection_reason: note });
      if (item.kind === 'tour_plan') await ff(`/approvals/tour-plans/${item.id}/${approve ? 'approve' : 'reject'}`, { review_note: note || undefined });
      if (item.kind === 'exception') await ff(`/approvals/exceptions/${item.id}/${approve ? 'approve' : 'reject'}`, { review_note: note || undefined });
      if (item.kind === 'event_budget') await rn(`/approvals/budgets/${item.id}`, 'patch', { approve, note: note || undefined });
      setFlash({ text: `${approve ? 'Approved' : 'Rejected'}: ${item.title}.${item.kind === 'event_budget' ? '' : ` ${item.requester || 'The executive'} is notified in the app.`}`, ok: true });
      setRejecting(null); setApproving(null); setNote(''); setAmount(''); load();
    } catch (e: any) { setFlash({ text: e.message, ok: false }); }
  };
  return (
    <div className="space-y-3">
      <Flash msg={flash} onClose={() => setFlash(null)} />
      <div className="flex gap-2"><button className={`${ghostCls} ${view === 'pending' ? 'border-violet-500/40 text-white' : ''}`} onClick={() => setView('pending')}>Waiting</button><button className={`${ghostCls} ${view === 'decided' ? 'border-violet-500/40 text-white' : ''}`} onClick={() => setView('decided')}>Decided</button></div>
      {!a ? <Loading /> : a.items.length === 0 ? <Card><Empty icon={CheckCircle2} title={view === 'pending' ? 'Nothing waiting for approval' : 'No decisions yet'} body="Expense claims, tour plans, out-of-beat visits and event budgets from the field team appear here." /></Card> : (
        <ul className="space-y-2">
          {a.items.map((it: any) => { const K = KIND_LABEL[it.kind]; return (
            <li key={`${it.kind}-${it.id}`}>
              <Card className="p-4">
                <div className="flex flex-col md:flex-row md:items-center gap-3">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="h-9 w-9 shrink-0 rounded-xl bg-white/[0.04] grid place-items-center"><K.icon className="h-4 w-4 text-slate-300" /></div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2"><span className="font-medium text-white">{it.title}</span><Pill tone={K.tone}>{K.label}</Pill>{view === 'decided' && <Pill tone={it.status === 'approved' || it.status === 'paid' ? 'emerald' : 'red'}>{words(it.status)}</Pill>}</div>
                      <div className="mt-0.5 text-xs text-slate-500">{[it.requester, it.submitted_at ? `submitted ${ago(it.submitted_at)}` : null, it.detail].filter(Boolean).join(' · ')}</div>
                      {it.note && <div className="mt-1 text-xs text-slate-400">Note: {it.note}</div>}
                    </div>
                  </div>
                  {it.amount != null && <div className="text-lg font-semibold text-white tabular-nums">{inr(it.amount)}</div>}
                  {view === 'pending' && <div className="flex gap-2">
                    <button className={`${ghostCls} text-red-300`} onClick={() => { setRejecting(it); setNote(''); }}><XCircle className="h-4 w-4" /> Reject</button>
                    <Button className={primaryCls} onClick={() => { if (it.kind === 'expense') { setApproving(it); setAmount(String(Number(it.amount) || '')); setNote(''); } else decide(it, true); }}><CheckCircle2 className="h-4 w-4 mr-1.5" /> Approve</Button>
                  </div>}
                </div>
              </Card>
            </li>
          ); })}
        </ul>
      )}
      <Dialog open={Boolean(rejecting)} onOpenChange={(o) => !o && setRejecting(null)}>
        <DialogContent className="max-w-md bg-[#0d1120] border-white/[0.08] text-white">
          <DialogHeader><DialogTitle>Reject: {rejecting?.title}</DialogTitle></DialogHeader>
          <Field label="Reason (sent to the executive) *"><textarea className={`${inputCls} h-24 py-2`} value={note} onChange={(e) => setNote(e.target.value)} autoFocus /></Field>
          <div className="flex justify-end gap-2"><button className={ghostCls} onClick={() => setRejecting(null)}>Cancel</button><Button className="h-10 rounded-xl bg-red-600 hover:bg-red-500 text-white" disabled={!note.trim()} onClick={() => decide(rejecting, false)}>Reject</Button></div>
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(approving)} onOpenChange={(o) => !o && setApproving(null)}>
        <DialogContent className="max-w-md bg-[#0d1120] border-white/[0.08] text-white">
          <DialogHeader><DialogTitle>Approve: {approving?.title}</DialogTitle></DialogHeader>
          <Field label={`Amount to approve (claimed ${inr(approving?.amount)})`}><input className={inputCls} value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" /></Field>
          <Field label="Note (optional)"><input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          <div className="flex justify-end gap-2"><button className={ghostCls} onClick={() => setApproving(null)}>Cancel</button><Button className={primaryCls} disabled={amount === '' || !(Number(amount) >= 0) || Number(amount) > Number(approving?.amount)} onClick={() => decide(approving, true)}>Approve {amount ? inr(amount) : ''}</Button></div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ReportsTab() {
  const [r, setR] = useState<any[] | null>(null);
  const [day, setDay] = useState('');
  useEffect(() => { setR(null); rn('/daily-reports', 'get', undefined, day ? { date: day } : {}).then(setR).catch(() => setR([])); }, [day]);
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2"><input type="date" aria-label="Report date" className={selectCls} value={day} onChange={(e) => setDay(e.target.value)} />{day && <button className={ghostCls} onClick={() => setDay('')}>All dates</button>}</div>
      {!r ? <Loading /> : r.length === 0 ? <Card><Empty icon={FileText} title="No daily reports" body="Field executives submit their end-of-day report from the app." /></Card> : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
          {r.map((x) => (
            <Card key={x.id} className="p-4">
              <div className="flex items-center justify-between"><span className="font-medium text-white">{x.exec_name}</span><span className="text-xs text-slate-500">{date(x.report_date)}</span></div>
              <div className="mt-2 grid grid-cols-4 gap-2 text-center">
                {([['Planned', x.planned_visits], ['Done', x.completed_visits], ['Missed', x.missed_visits], ['Leads', x.leads_generated]] as [string, number][]).map(([l, n]) => (
                  <div key={l} className="rounded-lg bg-white/[0.03] py-2"><div className="text-base font-semibold text-white tabular-nums">{n ?? 0}</div><div className="text-[11px] text-slate-500">{l}</div></div>
                ))}
              </div>
              {x.key_achievements && <p className="mt-2 text-sm text-slate-300"><span className="text-slate-500">Achieved </span>{x.key_achievements}</p>}
              {x.challenges && <p className="mt-1 text-sm text-slate-300"><span className="text-slate-500">Challenges </span>{x.challenges}</p>}
              {x.next_day_plan && <p className="mt-1 text-sm text-slate-300"><span className="text-slate-500">Tomorrow </span>{x.next_day_plan}</p>}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function SamplesTab() {
  const [s, setS] = useState<any[] | null>(null);
  const [days, setDays] = useState('30');
  useEffect(() => { setS(null); rn('/samples', 'get', undefined, { days }).then(setS).catch(() => setS([])); }, [days]);
  return (
    <div className="space-y-3">
      <select aria-label="Period" className={selectCls} value={days} onChange={(e) => setDays(e.target.value)}><Opt value="7">Last 7 days</Opt><Opt value="30">Last 30 days</Opt><Opt value="90">Last 90 days</Opt></select>
      <Card>
        {!s ? <Loading /> : s.length === 0 ? <Empty icon={Package} title="No samples or collateral handed over" body="Each handover recorded in the app, with the doctor's signature and location check, is logged here for compliance." /> : (
          <Table head={['When', 'Doctor', 'Items', 'Signature', 'Location', 'By']}>
            {s.map((h) => (
              <tr key={h.id} className={rowCls}>
                <td className={`${cellCls} text-slate-300 whitespace-nowrap`}>{dateTime(h.created_at)}</td>
                <td className={cellCls}>{h.doctor_crm_id ? <Link to={`/crm/doctors/${h.doctor_crm_id}`} className="text-white hover:text-violet-300">{h.doctor_name}</Link> : '—'}</td>
                <td className={`${cellCls} text-slate-200`}>{itemsText(h.items)}</td>
                <td className={cellCls}>{h.signed ? <Pill tone="emerald">signed</Pill> : <Pill tone="amber">missing</Pill>}</td>
                <td className={cellCls}>{h.geofence_verified ? <Pill tone="emerald">verified</Pill> : <Pill tone="slate">not checked</Pill>}</td>
                <td className={`${cellCls} text-slate-400`}>{h.exec_name}</td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}

function TeamTab() {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [t, setT] = useState<any>(null);
  useEffect(() => { setT(null); rn('/team-performance', 'get', undefined, { month }).then(setT).catch(() => setT({ team: [] })); }, [month]);
  const cell = (done: number, target: number | null) => (
    <div className="min-w-[110px]">
      <div className="flex justify-between text-xs"><span className="text-white tabular-nums">{done}</span><span className="text-slate-500 tabular-nums">{target ? `of ${target}` : 'no target'}</span></div>
      {target ? <div className="mt-1 h-1.5 rounded-full bg-white/[0.05] overflow-hidden"><div className={`h-full rounded-full ${done / target >= 0.9 ? 'bg-emerald-400' : done / target >= 0.6 ? 'bg-amber-400' : 'bg-red-400'}`} style={{ width: `${Math.min(100, (done / target) * 100)}%` }} /></div> : null}
    </div>
  );
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3"><input type="month" aria-label="Month" className={selectCls} value={month} onChange={(e) => setMonth(e.target.value)} /><Link to="/crm/field-force" className="text-xs text-violet-300">Set targets in Smart-Force →</Link></div>
      <Card>
        {!t ? <Loading /> : t.team.length === 0 ? <Empty icon={Users} title="No field executives" body="Team members with the Field Marketing Executive role appear here with their targets." /> : (
          <Table head={['Executive', 'Visits', 'Doctors seen', 'Referrals', 'Treated', 'Days present', 'Expenses approved', 'Score']}>
            {t.team.map((x: any) => (
              <tr key={x.id} className={rowCls}>
                <td className={`${cellCls} text-white`}>{x.name || '—'}{x.needs_plan && <div className="mt-0.5"><Pill tone="red" title="Below 60% of target after mid-month">improvement plan</Pill></div>}</td>
                <td className={cellCls}>{cell(x.visits_done, x.visits_target)}</td>
                <td className={cellCls}>{cell(x.doctors_done, x.doctors_target)}</td>
                <td className={cellCls}>{cell(x.referrals_done, x.leads_target)}</td>
                <td className={`${cellCls} tabular-nums text-emerald-300`}>{x.treated_done}</td>
                <td className={`${cellCls} tabular-nums text-slate-300`}>{x.days_present}</td>
                <td className={`${cellCls} tabular-nums text-slate-300`}>{inr(x.expenses_approved)}</td>
                <td className={cellCls}>{x.score == null ? <span className="text-slate-600">—</span> : <span className={`text-base font-semibold tabular-nums ${x.score >= 90 ? 'text-emerald-300' : x.score >= 60 ? 'text-amber-300' : 'text-red-300'}`}>{x.score}%</span>}</td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}

function TerritoriesTab() {
  const [d, setD] = useState<any>(null);
  const [team, setTeam] = useState<any[]>([]);
  const [form, setForm] = useState<any>(null);
  const [flash, setFlash] = useState<FlashMsg>(null);
  const load = useCallback(() => rn('/territories').then(setD).catch((e) => { setFlash({ text: e.message, ok: false }); setD({ territories: [] }); }), []);
  useEffect(() => { load(); rn('/team').then(setTeam).catch(() => {}); }, [load]);
  const save = async () => {
    try { setD(form.id ? await rn(`/territories/${form.id}`, 'patch', form) : await rn('/territories', 'post', form)); setForm(null); setFlash({ text: 'Territory saved.', ok: true }); }
    catch (e: any) { setFlash({ text: e.message, ok: false }); }
  };
  const toggle = async (t: any) => { try { setD(await rn(`/territories/${t.id}`, 'patch', { ...t, active: !t.active })); } catch (e: any) { setFlash({ text: e.message, ok: false }); } };
  return (
    <div className="space-y-3">
      <Flash msg={flash} onClose={() => setFlash(null)} />
      <div className="flex items-center justify-between gap-2"><p className="text-sm text-slate-400">Each field executive's beat: the areas they cover. Out-of-beat visits need approval.</p>
        {d?.manager && <Button className={primaryCls} onClick={() => setForm({ territory: '', city: '', zone: '', description: '', user_id: '' })}><Plus className="h-4 w-4 mr-1.5" /> New territory</Button>}</div>
      <Card>
        {!d ? <Loading /> : d.territories.length === 0 ? <Empty icon={MapIcon} title="No territories yet" body="Create a territory for each beat and assign it to a field executive." /> : (
          <Table head={['Territory', 'Zone', 'City', 'Executive', 'Doctors', 'Status', '']}>
            {d.territories.map((t: any) => (
              <tr key={t.id} className={rowCls}>
                <td className={cellCls}><div className="text-white">{t.territory}</div>{t.description && <div className="text-xs text-slate-500">{t.description}</div>}</td>
                <td className={`${cellCls} text-slate-300`}>{t.zone || '—'}</td>
                <td className={`${cellCls} text-slate-300`}>{t.city || '—'}</td>
                <td className={`${cellCls} text-slate-300`}>{t.exec_name || <span className="text-slate-600">Not assigned</span>}</td>
                <td className={`${cellCls} tabular-nums text-slate-300`}>{t.doctors}</td>
                <td className={cellCls}><Pill tone={t.active ? 'emerald' : 'slate'}>{t.active ? 'active' : 'inactive'}</Pill></td>
                <td className={cellCls}>{d.manager && <div className="flex gap-3 text-xs"><button className="text-violet-300" onClick={() => setForm({ ...t, user_id: t.user_id ? String(t.user_id) : '' })}>Edit</button><button className="text-slate-400" onClick={() => toggle(t)}>{t.active ? 'Deactivate' : 'Activate'}</button></div>}</td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
      <Dialog open={Boolean(form)} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="max-w-lg bg-[#0d1120] border-white/[0.08] text-white">
          <DialogHeader><DialogTitle>{form?.id ? 'Edit territory' : 'New territory'}</DialogTitle></DialogHeader>
          {form && <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Name *" wide><input className={inputCls} value={form.territory} onChange={(e) => setForm({ ...form, territory: e.target.value })} placeholder="Kukatpally – KPHB beat" autoFocus /></Field>
            <Field label="Zone"><input className={inputCls} value={form.zone || ''} onChange={(e) => setForm({ ...form, zone: e.target.value })} placeholder="West" /></Field>
            <Field label="City"><input className={inputCls} value={form.city || ''} onChange={(e) => setForm({ ...form, city: e.target.value })} /></Field>
            <Field label="Field executive *" wide><select className={`${selectCls} w-full`} value={form.user_id || ''} onChange={(e) => setForm({ ...form, user_id: e.target.value })}><Opt value="">Choose…</Opt>{team.map((t) => <Opt key={t.id} value={String(t.id)}>{t.name || t.email}</Opt>)}</select></Field>
            <Field label="Areas covered" wide><input className={inputCls} value={form.description || ''} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="KPHB, Miyapur, Nizampet" /></Field>
          </div>}
          <div className="flex justify-end gap-2"><button className={ghostCls} onClick={() => setForm(null)}>Cancel</button><Button className={primaryCls} disabled={!form?.territory?.trim() || !form?.user_id} onClick={save}>Save</Button></div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const EMP_TONE: Record<string, string> = { empanelled: 'emerald', approved: 'emerald', rejected: 'red', on_hold: 'slate', renewal_due: 'amber' };
function EmpanelmentTab() {
  const [d, setD] = useState<any>(null);
  const [team, setTeam] = useState<any[]>([]);
  const [form, setForm] = useState<any>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [ms, setMs] = useState({ milestone: '', due_date: '' });
  const [flash, setFlash] = useState<FlashMsg>(null);
  const load = useCallback(() => rn('/empanelment').then(setD).catch((e) => { setFlash({ text: e.message, ok: false }); setD({ applications: [], statuses: [], types: [] }); }), []);
  useEffect(() => { load(); rn('/team').then(setTeam).catch(() => {}); }, [load]);
  const act = async (fn: () => Promise<any>, msg?: string) => { try { setD(await fn()); if (msg) setFlash({ text: msg, ok: true }); return true; } catch (e: any) { setFlash({ text: e.message, ok: false }); return false; } };
  const blank = { insurer_name: '', insurer_type: 'private_insurer', panel_type: 'cashless', status: 'identified', contact_person: '', contact_phone: '', contact_email: '', target_date: '', panel_code: '', tariff_agreed: false, mou_signed: false, notes: '', assigned_to: '' };
  const edit = (a: any) => setForm({ ...blank, ...Object.fromEntries(Object.entries(a).map(([k, v]) => [k, v == null ? '' : v])), target_date: a.target_date?.slice(0, 10) || '', empanelled_date: a.empanelled_date?.slice(0, 10) || '', expiry_date: a.expiry_date?.slice(0, 10) || '', assigned_to: a.assigned_to ? String(a.assigned_to) : '' });
  return (
    <div className="space-y-3">
      <Flash msg={flash} onClose={() => setFlash(null)} />
      <div className="flex items-center justify-between gap-2"><p className="text-sm text-slate-400">Getting {BRAND.name} onto insurer, TPA and government panels, step by step.</p>
        {d?.manager && <Button className={primaryCls} onClick={() => setForm(blank)}><Plus className="h-4 w-4 mr-1.5" /> New application</Button>}</div>
      {!d ? <Loading /> : d.applications.length === 0 ? <Card><Empty icon={Landmark} title="No empanelment applications" body="Track each insurer, TPA, CGHS, ECHS or ESIC panel: documents, site visit, tariff, MoU and renewal." /></Card> : (
        <ul className="space-y-2">{d.applications.map((a: any) => {
          const done = a.milestones.filter((m: any) => m.status === 'done').length;
          return (
            <li key={a.id}><Card className="p-4">
              <div className="flex flex-col md:flex-row md:items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2"><span className="font-medium text-white">{a.insurer_name}</span><Pill tone="blue">{words(a.insurer_type)}</Pill><Pill tone={EMP_TONE[a.status] || 'violet'}>{words(a.status)}</Pill>{a.tariff_agreed && <Pill tone="emerald">tariff agreed</Pill>}{a.mou_signed && <Pill tone="emerald">MoU signed</Pill>}</div>
                  <div className="mt-0.5 text-xs text-slate-500">{[words(a.panel_type), a.owner_name, a.target_date ? `target ${date(a.target_date)}` : null, a.expiry_date ? `expires ${date(a.expiry_date)}` : null, a.panel_code ? `code ${a.panel_code}` : null].filter(Boolean).join(' · ')}</div>
                </div>
                <div className="text-sm text-slate-400 tabular-nums">{done} of {a.milestones.length} steps done</div>
                <div className="flex gap-2"><button className={ghostCls} onClick={() => setOpen(open === a.id ? null : a.id)}>{open === a.id ? 'Hide steps' : 'Steps'}</button>{d.manager && <button className={ghostCls} onClick={() => edit(a)}><Pencil className="h-4 w-4" /> Edit</button>}</div>
              </div>
              {open === a.id && <div className="mt-3 border-t border-white/[0.05] pt-3 space-y-2">
                {a.milestones.length === 0 && <p className="text-sm text-slate-500">No steps yet.</p>}
                {a.milestones.map((m: any) => (
                  <div key={m.id} className="flex items-center gap-2 text-sm">
                    <button disabled={!d.manager} aria-label={m.status === 'done' ? `Mark "${m.milestone}" not done` : `Mark "${m.milestone}" done`} onClick={() => act(() => rn(`/empanelment/milestones/${m.id}`, 'patch', { status: m.status === 'done' ? 'pending' : 'done' }))}
                      className={`h-5 w-5 rounded-md border grid place-items-center ${m.status === 'done' ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-500'}`}>{m.status === 'done' ? '✓' : ''}</button>
                    <span className={m.status === 'done' ? 'text-slate-500 line-through' : 'text-slate-200'}>{m.milestone}</span>
                    {m.due_date && <span className={`text-xs ${m.status !== 'done' && new Date(m.due_date) < new Date() ? 'text-red-300' : 'text-slate-500'}`}>due {date(m.due_date)}</span>}
                  </div>
                ))}
                {d.manager && <div className="flex flex-wrap gap-2 pt-1"><input className={`${inputCls} flex-1 min-w-[200px]`} placeholder="Add a step, e.g. Submit NABH certificate" value={ms.milestone} onChange={(e) => setMs({ ...ms, milestone: e.target.value })} /><input type="date" className={selectCls} value={ms.due_date} onChange={(e) => setMs({ ...ms, due_date: e.target.value })} /><button className={ghostCls} disabled={!ms.milestone.trim()} onClick={async () => { if (await act(() => rn(`/empanelment/${a.id}/milestones`, 'post', ms))) setMs({ milestone: '', due_date: '' }); }}><Plus className="h-4 w-4" /> Add</button></div>}
              </div>}
            </Card></li>
          );
        })}</ul>
      )}
      <Dialog open={Boolean(form)} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="max-w-2xl bg-[#0d1120] border-white/[0.08] text-white">
          <DialogHeader><DialogTitle>{form?.id ? 'Edit application' : 'New empanelment application'}</DialogTitle></DialogHeader>
          {form && <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Insurer, TPA or scheme *" wide><input className={inputCls} value={form.insurer_name} onChange={(e) => setForm({ ...form, insurer_name: e.target.value })} autoFocus /></Field>
            <Field label="Type"><select className={`${selectCls} w-full`} value={form.insurer_type} onChange={(e) => setForm({ ...form, insurer_type: e.target.value })}>{(d?.types || []).map((t: string) => <Opt key={t} value={t}>{words(t)}</Opt>)}</select></Field>
            <Field label="Panel"><select className={`${selectCls} w-full`} value={form.panel_type} onChange={(e) => setForm({ ...form, panel_type: e.target.value })}>{['cashless', 'reimbursement', 'both'].map((t) => <Opt key={t} value={t}>{t}</Opt>)}</select></Field>
            <Field label="Status"><select className={`${selectCls} w-full`} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>{(d?.statuses || []).map((t: string) => <Opt key={t} value={t}>{words(t)}</Opt>)}</select></Field>
            <Field label="Owner"><select className={`${selectCls} w-full`} value={form.assigned_to} onChange={(e) => setForm({ ...form, assigned_to: e.target.value })}><Opt value="">Not assigned</Opt>{team.map((t) => <Opt key={t.id} value={String(t.id)}>{t.name || t.email}</Opt>)}</select></Field>
            <Field label="Contact person"><input className={inputCls} value={form.contact_person} onChange={(e) => setForm({ ...form, contact_person: e.target.value })} /></Field>
            <Field label="Contact mobile"><input className={inputCls} value={form.contact_phone} onChange={(e) => setForm({ ...form, contact_phone: e.target.value })} /></Field>
            <Field label="Contact email"><input className={inputCls} value={form.contact_email} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} /></Field>
            <Field label="Target date"><input type="date" className={inputCls} value={form.target_date} onChange={(e) => setForm({ ...form, target_date: e.target.value })} /></Field>
            <Field label="Empanelled on"><input type="date" className={inputCls} value={form.empanelled_date || ''} onChange={(e) => setForm({ ...form, empanelled_date: e.target.value })} /></Field>
            <Field label="Expires on"><input type="date" className={inputCls} value={form.expiry_date || ''} onChange={(e) => setForm({ ...form, expiry_date: e.target.value })} /></Field>
            <Field label="Panel code"><input className={inputCls} value={form.panel_code} onChange={(e) => setForm({ ...form, panel_code: e.target.value })} /></Field>
            <div className="flex items-end gap-4 text-sm text-slate-300"><label className="flex items-center gap-2"><input type="checkbox" checked={Boolean(form.tariff_agreed)} onChange={(e) => setForm({ ...form, tariff_agreed: e.target.checked })} /> Tariff agreed</label><label className="flex items-center gap-2"><input type="checkbox" checked={Boolean(form.mou_signed)} onChange={(e) => setForm({ ...form, mou_signed: e.target.checked })} /> MoU signed</label></div>
            <Field label="Notes" wide><textarea className={`${inputCls} h-20 py-2`} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
          </div>}
          <div className="flex justify-end gap-2"><button className={ghostCls} onClick={() => setForm(null)}>Cancel</button><Button className={primaryCls} disabled={!form?.insurer_name?.trim()} onClick={async () => { if (await act(() => (form.id ? rn(`/empanelment/${form.id}`, 'patch', form) : rn('/empanelment', 'post', form)), 'Application saved.')) setForm(null); }}>Save</Button></div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Events: CME and camps ────────────────────────────────────────────────────
type EventsTab = 'cme' | 'camps';
export function EventsPage() {
  const [tab, setTab] = useState<EventsTab>('cme');
  const [ev, setEv] = useState<any>(null);
  const [open, setOpen] = useState<{ kind: 'cme' | 'camp'; id: number } | null>(null);
  const [creating, setCreating] = useState<'cme' | 'camp' | null>(null);
  const [flash, setFlash] = useState<FlashMsg>(null);
  const load = useCallback(() => rn('/events').then(setEv).catch((e) => { setFlash({ text: e.message, ok: false }); setEv({ cme: [], camps: [] }); }), []);
  useEffect(() => { load(); }, [load]);
  const manager = Boolean(ev?.manager);
  return (
    <CRMLayout title="Events">
      <div className="space-y-4">
        <Flash msg={flash} onClose={() => setFlash(null)} />
        <div className="flex items-end justify-between gap-3">
          <div className="flex-1 min-w-0"><Tabs<EventsTab> value={tab} onChange={setTab} tabs={[{ id: 'cme', label: 'CME and doctor events', count: ev?.cme?.length }, { id: 'camps', label: 'Health camps', count: ev?.camps?.length }]} /></div>
          {manager && <Button className={primaryCls} onClick={() => setCreating(tab === 'cme' ? 'cme' : 'camp')}><Plus className="h-4 w-4 mr-1.5" /> {tab === 'cme' ? 'New CME' : 'New camp'}</Button>}
        </div>
        {!ev ? <Loading /> : tab === 'cme' ? (
          ev.cme.length === 0 ? <Card><Empty icon={Mic} title="No CME events yet" body="Plan CMEs, round tables and webinars for referring doctors: speakers, compliance, invitations and QR attendance." /></Card> : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {ev.cme.map((e: any) => (
                <button key={e.id} className="text-left" onClick={() => setOpen({ kind: 'cme', id: e.id })}>
                  <Card className="p-4 hover:border-violet-500/30 transition-colors">
                    <div className="flex items-start justify-between gap-2"><div><div className="font-medium text-white">{e.name}</div><div className="text-xs text-slate-500">{dateTime(e.scheduled_at)}{e.venue ? ` · ${e.venue}` : ''}{e.city ? `, ${e.city}` : ''}</div></div><Pill tone={e.status === 'completed' ? 'emerald' : e.status === 'cancelled' ? 'red' : 'violet'}>{words(e.status)}</Pill></div>
                    <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-400">
                      <span><Mic className="inline h-3.5 w-3.5 mr-1" />{e.speakers} speaker{e.speakers === 1 ? '' : 's'}{e.speakers_uncleared ? <span className="text-amber-300"> · {e.speakers_uncleared} compliance pending</span> : ''}</span>
                      <span><Users className="inline h-3.5 w-3.5 mr-1" />{e.attended} of {e.invited} invited attended</span>
                      {e.budget_status && <span><IndianRupee className="inline h-3.5 w-3.5 mr-1" />budget {e.budget_status}</span>}
                    </div>
                  </Card>
                </button>
              ))}
            </div>
          )
        ) : (
          ev.camps.length === 0 ? <Card><Empty icon={Tent} title="No health camps yet" body="Camps registered in the app list their patients here; each registration with a mobile becomes a patient lead." /></Card> : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {ev.camps.map((c: any) => (
                <button key={c.id} className="text-left" onClick={() => setOpen({ kind: 'camp', id: c.id })}>
                  <Card className="p-4 hover:border-violet-500/30 transition-colors">
                    <div className="flex items-start justify-between gap-2"><div><div className="font-medium text-white">{c.camp_name}</div><div className="text-xs text-slate-500">{date(c.start_date)} · {words(c.camp_type)}{c.address ? ` · ${c.address}` : ''}</div></div><Pill tone={c.status === 'completed' ? 'emerald' : c.status === 'cancelled' ? 'red' : 'violet'}>{words(c.status)}</Pill></div>
                    <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-400">
                      <span><Users className="inline h-3.5 w-3.5 mr-1" />{c.registrations} registered{c.expected_patients ? ` of ${c.expected_patients} expected` : ''}</span>
                      {c.high_risk > 0 && <span className="text-amber-300"><AlertTriangle className="inline h-3.5 w-3.5 mr-1" />{c.high_risk} high risk</span>}
                      <span><InboxIcon className="inline h-3.5 w-3.5 mr-1" />{c.leads} in Leads</span>
                    </div>
                  </Card>
                </button>
              ))}
            </div>
          )
        )}
      </div>
      <EventDrawer target={open} manager={manager} onClose={() => setOpen(null)} onChanged={(m) => { if (m) setFlash({ text: m, ok: true }); load(); }} />
      <CreateEventDialog kind={creating} onClose={() => setCreating(null)} onCreated={(k, id) => { setCreating(null); load(); setOpen({ kind: k, id }); }} />
    </CRMLayout>
  );
}

function CreateEventDialog({ kind, onClose, onCreated }: { kind: 'cme' | 'camp' | null; onClose: () => void; onCreated: (k: 'cme' | 'camp', id: number) => void }) {
  const [f, setF] = useState<Record<string, string>>({});
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { setF(kind === 'cme' ? { event_type: 'cme' } : { camp_type: 'general' }); setErr(''); }, [kind]);
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
  const save = async () => {
    setBusy(true); setErr('');
    try {
      const r: any = kind === 'cme'
        ? await rn('/events/cme', 'post', { ...f, scheduled_at: f.scheduled_at ? new Date(f.scheduled_at).toISOString() : null })
        : await rn('/events/camps', 'post', { ...f, start_date: f.start_date ? new Date(f.start_date).toISOString() : null, end_date: f.end_date ? new Date(f.end_date).toISOString() : null });
      onCreated(kind as 'cme' | 'camp', r.event.id);
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <Dialog open={Boolean(kind)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg bg-[#0d1120] border-white/[0.08] text-white">
        <DialogHeader><DialogTitle>{kind === 'cme' ? 'New CME or doctor event' : 'New health camp'}</DialogTitle></DialogHeader>
        {kind === 'cme' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Name *" wide><input className={inputCls} value={f.name || ''} onChange={set('name')} placeholder="Advances in interventional cardiology" autoFocus /></Field>
            <Field label="Type"><select className={`${selectCls} w-full`} value={f.event_type} onChange={set('event_type')}>{['cme', 'roundtable', 'webinar', 'symposium', 'other'].map((t) => <Opt key={t} value={t}>{t === 'cme' ? 'CME' : words(t)}</Opt>)}</select></Field>
            <Field label="Date and time *"><input type="datetime-local" className={inputCls} value={f.scheduled_at || ''} onChange={set('scheduled_at')} /></Field>
            <Field label="Venue"><input className={inputCls} value={f.venue || ''} onChange={set('venue')} /></Field>
            <Field label="City"><input className={inputCls} value={f.city || ''} onChange={set('city')} /></Field>
            <Field label="Seats"><input className={inputCls} value={f.max_attendees || ''} onChange={set('max_attendees')} inputMode="numeric" /></Field>
            <Field label="Budget (₹)"><input className={inputCls} value={f.budget_allocated || ''} onChange={set('budget_allocated')} inputMode="decimal" /></Field>
            <Field label="Compliance notes" wide><input className={inputCls} value={f.compliance_notes || ''} onChange={set('compliance_notes')} placeholder="e.g. NMC guidelines, honorarium caps" /></Field>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Name *" wide><input className={inputCls} value={f.camp_name || ''} onChange={set('camp_name')} placeholder="Free heart check-up, Kukatpally" autoFocus /></Field>
            <Field label="Type"><select className={`${selectCls} w-full`} value={f.camp_type} onChange={set('camp_type')}>{['general', 'diabetes', 'cardiac', 'eye', 'dental', 'women_health', 'pediatric', 'vaccination'].map((t) => <Opt key={t} value={t}>{words(t)}</Opt>)}</select></Field>
            <Field label="Expected patients"><input className={inputCls} value={f.expected_patients || ''} onChange={set('expected_patients')} inputMode="numeric" /></Field>
            <Field label="Starts *"><input type="datetime-local" className={inputCls} value={f.start_date || ''} onChange={set('start_date')} /></Field>
            <Field label="Ends"><input type="datetime-local" className={inputCls} value={f.end_date || ''} onChange={set('end_date')} /></Field>
            <Field label="Address" wide><input className={inputCls} value={f.address || ''} onChange={set('address')} /></Field>
          </div>
        )}
        {err && <p className="text-sm text-red-300">{err}</p>}
        <div className="flex justify-end gap-2"><button className={ghostCls} onClick={onClose}>Cancel</button><Button className={primaryCls} onClick={save} disabled={busy}>{busy ? 'Creating…' : 'Create'}</Button></div>
      </DialogContent>
    </Dialog>
  );
}

function EventDrawer({ target, manager, onClose, onChanged }: { target: { kind: 'cme' | 'camp'; id: number } | null; manager: boolean; onClose: () => void; onChanged: (msg?: string) => void }) {
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState('');
  const [speaker, setSpeaker] = useState({ speaker_name: '', speaker_type: 'keynote', honorarium: '' });
  const [inviteQ, setInviteQ] = useState('');
  const [matches, setMatches] = useState<any[]>([]);
  const [picked, setPicked] = useState<Record<string, any>>({});
  const load = useCallback(async () => { if (!target) return; setErr(''); try { setD(await rn(`/events/${target.kind}/${target.id}`)); } catch (e: any) { setErr(e.message); } }, [target]);
  useEffect(() => { setD(null); setPicked({}); setInviteQ(''); load(); }, [load]);
  useEffect(() => { if (!inviteQ.trim()) { setMatches([]); return; } const t = setTimeout(() => rn('/doctors', 'get', undefined, { search: inviteQ, limit: 8 }).then((r: any) => setMatches(r.doctors)).catch(() => {}), 250); return () => clearTimeout(t); }, [inviteQ]);
  const act = async (fn: () => Promise<any>, msg: string) => { try { const r = await fn(); if (r?.kind) setD(r); else await load(); onChanged(msg); return true; } catch (e: any) { setErr(e.message); return false; } };
  return (
    <Dialog open={Boolean(target)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[88vh] overflow-y-auto bg-[#0d1120] border-white/[0.08] text-white">
        {!d ? (err ? <p className="text-red-300 text-sm">{err}</p> : <Loading />) : d.kind === 'cme' ? (
          <div className="space-y-5">
            <DialogHeader><DialogTitle>{d.event.name}</DialogTitle></DialogHeader>
            <p className="-mt-3 text-sm text-slate-400">{dateTime(d.event.scheduled_at)}{d.event.venue ? ` · ${d.event.venue}` : ''}{d.event.max_attendees ? ` · ${d.event.max_attendees} seats` : ''}{d.event.budget_allocated ? ` · budget ${inr(d.event.budget_allocated)}` : ''}</p>
            {err && <p className="text-sm text-red-300">{err}</p>}
            <section>
              <h4 className="text-sm font-semibold text-white mb-2">Speakers</h4>
              {d.speakers.length === 0 ? <p className="text-sm text-slate-500">No speakers yet.</p> : (
                <ul className="space-y-2">{d.speakers.map((s: any) => (
                  <li key={s.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-white/[0.05] bg-white/[0.02] px-3 py-2 text-sm">
                    <span className="text-white">{s.speaker_name}</span><span className="text-slate-500">{[words(s.speaker_type), s.speciality, s.honorarium ? inr(s.honorarium) : null].filter(Boolean).join(' · ')}</span>
                    <span className="ml-auto">{s.compliance_cleared ? <Pill tone="emerald"><ShieldCheck className="h-3 w-3" /> compliance cleared</Pill> : manager ? <button className="text-xs text-amber-300 hover:text-amber-200" onClick={() => act(() => rn(`/events/speakers/${s.id}`, 'patch', { compliance_cleared: true }), 'Speaker cleared.')}>Mark compliance cleared</button> : <Pill tone="amber">compliance pending</Pill>}</span>
                  </li>
                ))}</ul>
              )}
              {manager && <div className="mt-2 flex flex-wrap gap-2">
                <input className={`${inputCls} flex-1 min-w-[180px]`} placeholder="Speaker name" value={speaker.speaker_name} onChange={(e) => setSpeaker({ ...speaker, speaker_name: e.target.value })} />
                <select className={selectCls} value={speaker.speaker_type} onChange={(e) => setSpeaker({ ...speaker, speaker_type: e.target.value })}>{['keynote', 'panelist', 'moderator', 'other'].map((t) => <Opt key={t} value={t}>{t}</Opt>)}</select>
                <input className={`${inputCls} w-32`} placeholder="Fee ₹" value={speaker.honorarium} onChange={(e) => setSpeaker({ ...speaker, honorarium: e.target.value })} inputMode="decimal" />
                <button className={ghostCls} disabled={!speaker.speaker_name.trim()} onClick={async () => { if (await act(() => rn(`/events/cme/${d.event.id}/speakers`, 'post', speaker), 'Speaker added.')) setSpeaker({ speaker_name: '', speaker_type: 'keynote', honorarium: '' }); }}><Plus className="h-4 w-4" /> Add</button>
              </div>}
            </section>
            <section>
              <h4 className="text-sm font-semibold text-white mb-2">Invited doctors <span className="text-xs font-normal text-slate-500">{d.attendees.filter((a: any) => a.attended).length} attended of {d.attendees.length}</span></h4>
              {manager && <div className="relative mb-2">
                <input className={inputCls} placeholder="Search doctors to invite" value={inviteQ} onChange={(e) => setInviteQ(e.target.value)} />
                {matches.length > 0 && <ul className="absolute z-10 mt-1 w-full rounded-xl border border-white/[0.08] bg-[#0d1120] shadow-xl">{matches.map((m) => (
                  <li key={m.id}><button className="w-full px-3 py-2 text-left text-sm hover:bg-white/[0.05]" onClick={() => { setPicked({ ...picked, [m.id]: m }); setInviteQ(''); }}>{m.doctor_name} <span className="text-slate-500">{[m.specialty, m.area].filter(Boolean).join(' · ')}</span></button></li>
                ))}</ul>}
                {Object.keys(picked).length > 0 && <div className="mt-2 flex flex-wrap items-center gap-2">{Object.values(picked).map((m: any) => <Pill key={m.id} tone="violet">{m.doctor_name}<button aria-label={`Remove ${m.doctor_name}`} onClick={() => { const n = { ...picked }; delete n[m.id]; setPicked(n); }}><X className="h-3 w-3" /></button></Pill>)}
                  <Button className={primaryCls} onClick={async () => { if (await act(() => rn(`/events/cme/${d.event.id}/invite`, 'post', { doctor_ids: Object.keys(picked).map(Number) }), 'Doctors invited.')) setPicked({}); }}>Invite {Object.keys(picked).length}</Button></div>}
              </div>}
              {manager && d.attendees.some((a: any) => !a.invitation_sent_at) && (
                <div className="mb-2 flex flex-wrap items-center gap-2 rounded-xl border border-violet-500/20 bg-violet-500/5 p-3">
                  <span className="text-sm text-slate-300 flex-1 min-w-[200px]">{d.attendees.filter((a: any) => !a.invitation_sent_at).length} invited doctor(s) have not had a WhatsApp invitation yet.</span>
                  <Button className={primaryCls} onClick={async () => {
                    try { const r: any = await rn(`/events/cme/${d.event.id}/invites/send`, 'post', {}); await load(); onChanged(`Invitations sent: ${r.sent}.${r.failed.length ? ` Not sent: ${r.failed.map((f: any) => `${f.doctor} (${f.reason})`).join('; ')}` : ''}`); }
                    catch (e: any) { setErr(e.message); }
                  }}><Send className="h-4 w-4 mr-1.5" /> Send WhatsApp invitations</Button>
                </div>
              )}
              {d.attendees.length === 0 ? <p className="text-sm text-slate-500">No doctors invited yet. Invitations carry a QR code that the field team scans at the door.</p> : (
                <ul className="divide-y divide-white/[0.04] rounded-xl border border-white/[0.05]">{d.attendees.map((a: any) => (
                  <li key={a.id} className="flex items-center gap-2 px-3 py-2 text-sm">{a.doctor_crm_id ? <Link to={`/crm/doctors/${a.doctor_crm_id}`} className="text-white hover:text-violet-300">{a.doctor_name}</Link> : <span className="text-white">{a.doctor_name}</span>}<span className="ml-auto flex items-center gap-2">{a.invitation_sent_at && !a.attended && <span className="text-xs text-slate-500">WhatsApp sent {ago(a.invitation_sent_at)}</span>}{a.attended ? <Pill tone="emerald">attended {a.checkin_at ? dateTime(a.checkin_at) : ''}</Pill> : <Pill tone="slate">invited</Pill>}</span></li>
                ))}</ul>
              )}
            </section>
            {d.budgets.length > 0 && <section><h4 className="text-sm font-semibold text-white mb-2">Budget</h4>{d.budgets.map((b: any) => <p key={b.id} className="text-sm text-slate-300">{inr(b.approved_amount)} · used {inr(b.utilized_amount)} · <Pill tone={b.status === 'approved' ? 'emerald' : b.status === 'rejected' ? 'red' : 'amber'}>{b.status}</Pill></p>)}</section>}
          </div>
        ) : (
          <div className="space-y-4">
            <DialogHeader><DialogTitle>{d.event.camp_name}</DialogTitle></DialogHeader>
            <p className="-mt-2 text-sm text-slate-400">{date(d.event.start_date)} · {words(d.event.camp_type)}{d.event.address ? ` · ${d.event.address}` : ''}</p>
            {err && <p className="text-sm text-red-300">{err}</p>}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm text-slate-300">{d.registrations.length} registered · {d.registrations.filter((r: any) => r.crm_lead_id).length} in Leads · {d.registrations.filter((r: any) => r.high_risk_flag).length} high risk</span>
              {d.registrations.some((r: any) => !r.crm_lead_id && r.phone) && <Button className={primaryCls} onClick={() => act(() => rn(`/events/camps/${d.event.id}/convert`, 'post', {}), 'Registrations added to Leads.')}><InboxIcon className="h-4 w-4 mr-1.5" /> Add the rest to Leads</Button>}
            </div>
            {d.registrations.length === 0 ? <p className="text-sm text-slate-500">No registrations yet. Field executives register patients at the camp from the app.</p> : (
              <Table head={['Patient', 'Age', 'Mobile', 'Screening', 'Referred to', 'Lead']}>
                {d.registrations.map((r: any) => (
                  <tr key={r.id} className={rowCls}>
                    <td className={cellCls}><span className="text-white">{r.patient_name}</span>{r.high_risk_flag && <div><Pill tone="red">high risk</Pill></div>}</td>
                    <td className={`${cellCls} text-slate-300`}>{r.age ? `${r.age}${r.gender ? ` · ${r.gender}` : ''}` : '—'}</td>
                    <td className={`${cellCls} text-slate-300`}>{r.phone || '—'}</td>
                    <td className={`${cellCls} text-slate-300 max-w-[220px]`}>{r.screening_notes || '—'}</td>
                    <td className={`${cellCls} text-slate-300`}>{r.referred_to || '—'}</td>
                    <td className={cellCls}>{r.crm_lead_id ? <Link to={`/crm/inbox#lead=${r.crm_lead_id}`} className="text-xs text-violet-300">Open</Link> : <span className="text-xs text-slate-600">{r.phone ? 'not yet' : 'no mobile'}</span>}</td>
                  </tr>
                ))}
              </Table>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default DoctorsPage;
