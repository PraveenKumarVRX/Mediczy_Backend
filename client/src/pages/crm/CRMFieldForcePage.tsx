/**
 * Smart-Force Management — Business Head view
 * Mounted at /crm/field-force and sub-paths.
 * Requires: CRM login, field_force:read capability.
 * Requires field_force:manage for approve/reject/targets/territories.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  MapPin, Users, BarChart3, CheckCircle2, Clock,
  IndianRupee, TrendingUp, Target, Stethoscope,
  Building2, Plus, ChevronRight, RefreshCw,
  ThumbsUp, ThumbsDown, AlertTriangle, UserRound,
  Calendar, Phone, Mail,
} from 'lucide-react';
import { CRMLayout } from './CRMModulePages';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

// ─── API helpers ──────────────────────────────────────────────────────────────

const authHdrs = (): Record<string, string> => {
  const t = localStorage.getItem('crmToken');
  return t ? { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
};

const ffApi = async (path: string, method = 'GET', body?: unknown) => {
  const res = await fetch(`/api/crm/field-force${path}`, {
    method,
    headers: authHdrs(),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}`);
  return res.json();
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface Summary {
  date: string;
  month: string;
  attendance: { present: string; exceptions: string; total: string };
  visits: { total: string; completed: string; in_progress: string };
  leads: { total: string; new_leads: string };
  expenses: { pending_approval: string; pending_amount: string; approved_amount: string };
  targets: { visits_target: string; leads_target: string };
}

interface AttendanceRow {
  user_id: number;
  exec_name: string;
  exec_email: string;
  date: string;
  status: string;
  clock_in_at: string | null;
  clock_out_at: string | null;
  hours_so_far: string;
  visits_done: string;
  visits_total: string;
  exception_type: string | null;
}

interface ExpenseClaim {
  id: number;
  user_id: number;
  exec_name: string;
  title: string;
  claim_month: string;
  status: string;
  total_amount: string;
  approved_amount: string | null;
  submitted_at: string | null;
  approval_notes: string | null;
  items?: ExpenseItem[];
}

interface ExpenseItem {
  id: number;
  category: string;
  amount: string;
  expense_date: string;
  description: string | null;
}

interface TargetRow {
  id: number;
  user_id: number;
  exec_name: string;
  month: string;
  visits_target: number;
  leads_target: number;
  doctors_target: number;
  corporates_target: number;
  camps_target: number;
  empanelment_target: number;
  revenue_target: string;
  visits_done: string;
  leads_done: string;
  doctors_done: string;
  corporates_done: string;
}

interface TeamMember {
  id: number;
  name: string;
  email: string;
  last_attendance: string | null;
  visits_this_month: string;
}

interface DoctorCRM {
  id: number;
  doctor_name: string;
  specialty: string | null;
  hospital_affiliation: string | null;
  city: string | null;
  phone: string | null;
  relationship_status: string;
  referral_potential: string;
  next_visit_date: string | null;
  assigned_exec_id: number | null;
}

interface Lead {
  id: number;
  exec_name: string;
  entity_name: string;
  lead_type: string;
  contact_name: string | null;
  contact_phone: string | null;
  status: string;
  estimated_value: string | null;
  created_at: string;
  crm_lead_id: number | null;
}

// ─── KPI chip ─────────────────────────────────────────────────────────────────

function KpiChip({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className={`rounded-xl border p-4 flex flex-col gap-1 ${color || 'bg-card'}`}>
      <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

// ─── Status badge ─────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  present: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  exception: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  absent: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  submitted: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  approved: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  rejected: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  draft: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  new: 'bg-blue-100 text-blue-800',
  contacted: 'bg-purple-100 text-purple-800',
  active_referrer: 'bg-green-100 text-green-800',
  champion: 'bg-amber-100 text-amber-800',
  prospect: 'bg-gray-100 text-gray-700',
  high: 'bg-red-100 text-red-700',
  medium: 'bg-yellow-100 text-yellow-700',
  low: 'bg-gray-100 text-gray-600',
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[status] || 'bg-muted text-muted-foreground'}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

// ─── Progress bar ─────────────────────────────────────────────────────────────

function ProgressBar({ done, target, label }: { done: number; target: number; label: string }) {
  const pct = target > 0 ? Math.min(100, Math.round((done / target) * 100)) : 0;
  const color = pct >= 90 ? 'bg-green-500' : pct >= 60 ? 'bg-yellow-500' : 'bg-red-500';
  return (
    <div className="space-y-0.5">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        <span>{done}/{target} ({pct}%)</span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ─── Sub-pages ────────────────────────────────────────────────────────────────

// Summary KPIs + attendance overview
function OverviewTab() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [attendance, setAttendance] = useState<AttendanceRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, a] = await Promise.all([
        ffApi('/summary'),
        ffApi('/attendance'),
      ]);
      setSummary(s);
      setAttendance(a);
    } catch { /* shown as empty */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <p className="text-muted-foreground text-sm p-4">Loading…</p>;
  if (!summary) return <p className="text-destructive text-sm p-4">Failed to load summary.</p>;

  const s = summary;
  const presentCount = parseInt(s.attendance.present || '0');
  const totalCount   = parseInt(s.attendance.total   || '0');
  const visitsTarget = parseInt(s.targets.visits_target || '0');
  const visitsDone   = parseInt(s.visits.completed || '0');
  const leadsTarget  = parseInt(s.targets.leads_target || '0');
  const leadsTotal   = parseInt(s.leads.total || '0');

  return (
    <div className="space-y-6">
      {/* KPI chips */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiChip label="Present today" value={`${presentCount}/${totalCount}`} sub="field execs" color="bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800" />
        <KpiChip label="Visits completed" value={s.visits.completed} sub={`of ${s.visits.total} planned`} />
        <KpiChip label="Leads this month" value={s.leads.total} sub={`${s.leads.new_leads} new`} />
        <KpiChip label="Expenses pending" value={parseInt(s.expenses.pending_approval || '0')} sub={s.expenses.pending_amount ? `₹${parseInt(s.expenses.pending_amount).toLocaleString('en-IN')}` : undefined} color="bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800" />
      </div>

      {/* Monthly progress */}
      {(visitsTarget > 0 || leadsTarget > 0) && (
        <div className="rounded-xl border p-4 space-y-3">
          <h3 className="text-sm font-semibold">Monthly progress — {s.month}</h3>
          {visitsTarget > 0 && <ProgressBar done={visitsDone} target={visitsTarget} label="Visits target" />}
          {leadsTarget > 0 && <ProgressBar done={leadsTotal} target={leadsTarget} label="Leads target" />}
        </div>
      )}

      {/* Today's attendance table */}
      <div className="rounded-xl border overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2 bg-muted/40 border-b">
          <h3 className="text-sm font-semibold">Today's attendance — {s.date}</h3>
          <Button size="sm" variant="ghost" onClick={load}><RefreshCw className="h-3.5 w-3.5" /></Button>
        </div>
        {attendance.length === 0 ? (
          <p className="text-sm text-muted-foreground p-4">No records yet for today.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/20 text-xs text-muted-foreground">
                <tr>
                  <th className="text-left p-3">Exec</th>
                  <th className="text-left p-3">Status</th>
                  <th className="text-left p-3">Clock in</th>
                  <th className="text-left p-3">Clock out</th>
                  <th className="text-left p-3">Hours</th>
                  <th className="text-left p-3">Visits</th>
                </tr>
              </thead>
              <tbody>
                {attendance.map(a => (
                  <tr key={a.user_id} className="border-t hover:bg-muted/10">
                    <td className="p-3 font-medium">{a.exec_name}</td>
                    <td className="p-3"><StatusBadge status={a.status} /></td>
                    <td className="p-3 text-muted-foreground">{a.clock_in_at ? new Date(a.clock_in_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                    <td className="p-3 text-muted-foreground">{a.clock_out_at ? new Date(a.clock_out_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                    <td className="p-3">{parseFloat(a.hours_so_far || '0').toFixed(1)}h</td>
                    <td className="p-3">{a.visits_done}/{a.visits_total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// Expense approvals
function ExpensesTab() {
  const [claims, setClaims] = useState<ExpenseClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<ExpenseClaim | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [approveDialog, setApproveDialog] = useState<{ claim: ExpenseClaim; action: 'approve' | 'reject' } | null>(null);
  const [approvedAmount, setApprovedAmount] = useState('');
  const [approvalNotes, setApprovalNotes] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [statusFilter, setStatusFilter] = useState('submitted');

  const load = useCallback(async () => {
    setLoading(true);
    try { setClaims(await ffApi(`/expenses?status=${statusFilter}`)); }
    catch { /* empty */ }
    finally { setLoading(false); }
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);

  const openDetail = async (claim: ExpenseClaim) => {
    setSelected({ ...claim, items: undefined });
    setDetailLoading(true);
    try {
      const d = await ffApi(`/expenses/${claim.id}`);
      setSelected(d);
    } finally { setDetailLoading(false); }
  };

  const doAction = async () => {
    if (!approveDialog) return;
    setSubmitting(true);
    try {
      if (approveDialog.action === 'approve') {
        await ffApi(`/expenses/${approveDialog.claim.id}/approve`, 'PATCH', {
          approved_amount: parseFloat(approvedAmount) || approveDialog.claim.total_amount,
          approval_notes: approvalNotes || null,
        });
      } else {
        if (!rejectionReason.trim()) { alert('Rejection reason is required'); setSubmitting(false); return; }
        await ffApi(`/expenses/${approveDialog.claim.id}/reject`, 'PATCH', { rejection_reason: rejectionReason });
      }
      setApproveDialog(null);
      setApprovedAmount(''); setApprovalNotes(''); setRejectionReason('');
      setSelected(null);
      load();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Action failed');
    } finally { setSubmitting(false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        {['submitted', 'approved', 'rejected', 'draft'].map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${statusFilter === s ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>
            {s}
          </button>
        ))}
      </div>

      {loading ? <p className="text-sm text-muted-foreground">Loading…</p> : claims.length === 0 ? (
        <p className="text-sm text-muted-foreground">No {statusFilter} claims.</p>
      ) : (
        <div className="rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/20 text-xs text-muted-foreground">
              <tr>
                <th className="text-left p-3">Exec</th>
                <th className="text-left p-3">Title</th>
                <th className="text-left p-3">Month</th>
                <th className="text-right p-3">Amount</th>
                <th className="text-left p-3">Status</th>
                <th className="text-left p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {claims.map(c => (
                <tr key={c.id} className="border-t hover:bg-muted/10">
                  <td className="p-3 font-medium">{c.exec_name}</td>
                  <td className="p-3">{c.title}</td>
                  <td className="p-3 text-muted-foreground">{c.claim_month}</td>
                  <td className="p-3 text-right">₹{parseInt(c.total_amount || '0').toLocaleString('en-IN')}</td>
                  <td className="p-3"><StatusBadge status={c.status} /></td>
                  <td className="p-3">
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => openDetail(c)}>View</Button>
                      {c.status === 'submitted' && (
                        <>
                          <Button size="sm" variant="ghost" className="text-green-600" onClick={() => { setApproveDialog({ claim: c, action: 'approve' }); setApprovedAmount(c.total_amount); }}>
                            <ThumbsUp className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="sm" variant="ghost" className="text-red-500" onClick={() => setApproveDialog({ claim: c, action: 'reject' })}>
                            <ThumbsDown className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail drawer */}
      <Dialog open={selected !== null} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Expense claim #{selected?.id} — {selected?.exec_name}</DialogTitle>
          </DialogHeader>
          {detailLoading ? <p className="text-sm text-muted-foreground">Loading items…</p> : selected && (
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{selected.claim_month}</span>
                <StatusBadge status={selected.status} />
              </div>
              {selected.items && selected.items.length > 0 && (
                <div className="rounded-lg border overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/20"><tr><th className="text-left p-2">Date</th><th className="text-left p-2">Category</th><th className="text-left p-2">Description</th><th className="text-right p-2">Amount</th></tr></thead>
                    <tbody>
                      {selected.items.map(i => (
                        <tr key={i.id} className="border-t">
                          <td className="p-2">{i.expense_date}</td>
                          <td className="p-2">{i.category.replace(/_/g, ' ')}</td>
                          <td className="p-2 text-muted-foreground">{i.description || '—'}</td>
                          <td className="p-2 text-right">₹{parseFloat(i.amount).toLocaleString('en-IN')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="flex justify-between font-semibold border-t pt-2">
                <span>Total</span>
                <span>₹{parseInt(selected.total_amount || '0').toLocaleString('en-IN')}</span>
              </div>
              {selected.approval_notes && <p className="text-xs text-muted-foreground italic">{selected.approval_notes}</p>}
              {selected.status === 'submitted' && (
                <div className="flex gap-2 pt-1">
                  <Button className="flex-1" variant="outline" onClick={() => { setApproveDialog({ claim: selected, action: 'approve' }); setApprovedAmount(selected.total_amount); }}>
                    <ThumbsUp className="h-4 w-4 mr-1" />Approve
                  </Button>
                  <Button className="flex-1" variant="outline" onClick={() => setApproveDialog({ claim: selected, action: 'reject' })}>
                    <ThumbsDown className="h-4 w-4 mr-1" />Reject
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Approve / reject dialog */}
      <Dialog open={approveDialog !== null} onOpenChange={(o) => !o && setApproveDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{approveDialog?.action === 'approve' ? 'Approve expense' : 'Reject expense'}</DialogTitle>
          </DialogHeader>
          {approveDialog?.action === 'approve' ? (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Approved amount (₹)</Label>
                <Input type="number" value={approvedAmount} onChange={e => setApprovedAmount(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Notes (optional)</Label>
                <Input value={approvalNotes} onChange={e => setApprovalNotes(e.target.value)} placeholder="Any notes for the exec" />
              </div>
              <Button className="w-full" onClick={doAction} disabled={submitting}>
                {submitting ? 'Approving…' : 'Approve'}
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Rejection reason <span className="text-destructive">*</span></Label>
                <Input value={rejectionReason} onChange={e => setRejectionReason(e.target.value)} placeholder="Reason for rejection" />
              </div>
              <Button variant="destructive" className="w-full" onClick={doAction} disabled={submitting}>
                {submitting ? 'Rejecting…' : 'Reject'}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Targets
function TargetsTab() {
  const [targets, setTargets] = useState<TargetRow[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [loading, setLoading] = useState(true);
  const [setDialog, setSetDialog] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [t, tm] = await Promise.all([ffApi(`/targets?month=${month}`), ffApi('/team')]);
      setTargets(t);
      setTeam(tm);
    } catch { /* empty */ }
    finally { setLoading(false); }
  }, [month]);

  useEffect(() => { load(); }, [load]);

  const saveTarget = async () => {
    try {
      await ffApi('/targets', 'POST', {
        user_id: parseInt(form.user_id),
        month,
        visits_target:      parseInt(form.visits_target || '0'),
        doctors_target:     parseInt(form.doctors_target || '0'),
        corporates_target:  parseInt(form.corporates_target || '0'),
        camps_target:       parseInt(form.camps_target || '0'),
        leads_target:       parseInt(form.leads_target || '0'),
        empanelment_target: parseInt(form.empanelment_target || '0'),
        revenue_target:     parseFloat(form.revenue_target || '0'),
        notes:              form.notes || null,
      });
      setSetDialog(false);
      setForm({});
      load();
    } catch (e: unknown) { alert(e instanceof Error ? e.message : 'Save failed'); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <Input type="month" value={month} onChange={e => setMonth(e.target.value)} className="w-36" />
        <Button size="sm" onClick={() => setSetDialog(true)}>
          <Plus className="h-4 w-4 mr-1" />Set target
        </Button>
      </div>

      {loading ? <p className="text-sm text-muted-foreground">Loading…</p> : targets.length === 0 ? (
        <p className="text-sm text-muted-foreground">No targets set for {month}.</p>
      ) : (
        <div className="space-y-4">
          {targets.map(t => (
            <div key={t.id} className="rounded-xl border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">{t.exec_name}</h3>
                <span className="text-xs text-muted-foreground">{t.month}</span>
              </div>
              <div className="grid grid-cols-1 gap-2">
                <ProgressBar done={parseInt(t.visits_done || '0')} target={t.visits_target} label="Visits" />
                <ProgressBar done={parseInt(t.leads_done || '0')} target={t.leads_target} label="Leads" />
                {t.doctors_target > 0 && <ProgressBar done={parseInt(t.doctors_done || '0')} target={t.doctors_target} label="Doctor visits" />}
                {t.corporates_target > 0 && <ProgressBar done={parseInt(t.corporates_done || '0')} target={t.corporates_target} label="Corporate visits" />}
              </div>
              {t.revenue_target && parseFloat(t.revenue_target) > 0 && (
                <p className="text-xs text-muted-foreground">Revenue target: ₹{parseFloat(t.revenue_target).toLocaleString('en-IN')}</p>
              )}
            </div>
          ))}
        </div>
      )}

      <Dialog open={setDialog} onOpenChange={setSetDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Set targets — {month}</DialogTitle></DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="space-y-1">
              <Label>Executive</Label>
              <select className="w-full border rounded px-2 py-1.5 bg-background text-sm" value={form.user_id || ''} onChange={e => setForm(f => ({ ...f, user_id: e.target.value }))}>
                <option value="">Select exec…</option>
                {team.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            {[
              { key: 'visits_target', label: 'Visits' },
              { key: 'leads_target', label: 'Leads' },
              { key: 'doctors_target', label: 'Doctor visits' },
              { key: 'corporates_target', label: 'Corporate visits' },
              { key: 'camps_target', label: 'Camps' },
              { key: 'empanelment_target', label: 'Empanelments' },
            ].map(({ key, label }) => (
              <div key={key} className="space-y-1">
                <Label>{label}</Label>
                <Input type="number" min="0" value={form[key] || ''} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} />
              </div>
            ))}
            <div className="space-y-1">
              <Label>Revenue target (₹)</Label>
              <Input type="number" min="0" value={form.revenue_target || ''} onChange={e => setForm(f => ({ ...f, revenue_target: e.target.value }))} />
            </div>
            <Button className="w-full" disabled={!form.user_id} onClick={saveTarget}>Save</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Doctor CRM
function DoctorCRMTab() {
  const [doctors, setDoctors] = useState<DoctorCRM[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [relFilter, setRelFilter] = useState('');
  const [addDialog, setAddDialog] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (relFilter) params.set('relationship_status', relFilter);
      setDoctors(await ffApi(`/doctor-crm?${params}`));
    } catch { /* empty */ }
    finally { setLoading(false); }
  }, [search, relFilter]);

  useEffect(() => { const t = setTimeout(load, 300); return () => clearTimeout(t); }, [load]);

  const save = async () => {
    if (!form.doctor_name) { alert('Doctor name is required'); return; }
    setSaving(true);
    try {
      await ffApi('/doctor-crm', 'POST', form);
      setAddDialog(false);
      setForm({});
      load();
    } catch (e: unknown) { alert(e instanceof Error ? e.message : 'Save failed'); }
    finally { setSaving(false); }
  };

  const REL_STATUSES = ['prospect', 'contacted', 'visiting', 'active_referrer', 'champion', 'inactive', 'competitor_locked'];

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        <Input placeholder="Search doctors…" value={search} onChange={e => setSearch(e.target.value)} className="flex-1 min-w-[160px]" />
        <select className="border rounded px-2 py-1.5 text-sm bg-background" value={relFilter} onChange={e => setRelFilter(e.target.value)}>
          <option value="">All statuses</option>
          {REL_STATUSES.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
        </select>
        <Button size="sm" onClick={() => setAddDialog(true)}><Plus className="h-4 w-4 mr-1" />Add doctor</Button>
      </div>

      {loading ? <p className="text-sm text-muted-foreground">Loading…</p> : doctors.length === 0 ? (
        <p className="text-sm text-muted-foreground">No doctors found.</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {doctors.map(d => (
            <div key={d.id} className="rounded-xl border p-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{d.doctor_name}</p>
                  {d.specialty && <p className="text-xs text-muted-foreground">{d.specialty}</p>}
                  {d.hospital_affiliation && <p className="text-xs text-muted-foreground">{d.hospital_affiliation}</p>}
                </div>
                <div className="flex flex-col items-end gap-1">
                  <StatusBadge status={d.relationship_status} />
                  <StatusBadge status={d.referral_potential} />
                </div>
              </div>
              <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                {d.city && <span><MapPin className="h-3 w-3 inline mr-0.5" />{d.city}</span>}
                {d.phone && <span><Phone className="h-3 w-3 inline mr-0.5" />{d.phone}</span>}
                {d.next_visit_date && <span><Calendar className="h-3 w-3 inline mr-0.5" />Next: {d.next_visit_date}</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={addDialog} onOpenChange={setAddDialog}>
        <DialogContent className="max-w-sm max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Add doctor</DialogTitle></DialogHeader>
          <div className="space-y-3 text-sm">
            {[
              { key: 'doctor_name', label: 'Name *' },
              { key: 'qualification', label: 'Qualification' },
              { key: 'specialty', label: 'Specialty' },
              { key: 'hospital_affiliation', label: 'Hospital' },
              { key: 'area', label: 'Area' },
              { key: 'city', label: 'City' },
              { key: 'phone', label: 'Phone' },
              { key: 'email', label: 'Email' },
              { key: 'opd_days', label: 'OPD days' },
            ].map(({ key, label }) => (
              <div key={key} className="space-y-1">
                <Label>{label}</Label>
                <Input value={form[key] || ''} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} />
              </div>
            ))}
            <div className="space-y-1">
              <Label>Referral potential</Label>
              <select className="w-full border rounded px-2 py-1.5 bg-background text-sm" value={form.referral_potential || 'medium'} onChange={e => setForm(f => ({ ...f, referral_potential: e.target.value }))}>
                {['low', 'medium', 'high', 'champion'].map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <Label>Relationship status</Label>
              <select className="w-full border rounded px-2 py-1.5 bg-background text-sm" value={form.relationship_status || 'prospect'} onChange={e => setForm(f => ({ ...f, relationship_status: e.target.value }))}>
                {REL_STATUSES.map(v => <option key={v} value={v}>{v.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <Label>Notes</Label>
              <textarea className="w-full border rounded px-2 py-1.5 bg-background text-sm resize-none" rows={2} value={form.notes || ''} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
            <Button className="w-full" onClick={save} disabled={saving || !form.doctor_name}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Leads
function LeadsTab() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [pushing, setPushing] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = statusFilter ? `?status=${statusFilter}` : '';
      setLeads(await ffApi(`/leads${params}`));
    } catch { /* empty */ }
    finally { setLoading(false); }
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);

  const pushToCRM = async (id: number) => {
    setPushing(id);
    try {
      await ffApi(`/leads/${id}/push-to-crm`, 'PATCH');
      load();
    } catch (e: unknown) { alert(e instanceof Error ? e.message : 'Push failed'); }
    finally { setPushing(null); }
  };

  const STATUSES = ['', 'new', 'contacted', 'qualified', 'proposal', 'negotiation', 'won', 'lost', 'parked'];

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        {STATUSES.map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${statusFilter === s ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>
            {s || 'All'}
          </button>
        ))}
      </div>

      {loading ? <p className="text-sm text-muted-foreground">Loading…</p> : leads.length === 0 ? (
        <p className="text-sm text-muted-foreground">No leads found.</p>
      ) : (
        <div className="rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/20 text-xs text-muted-foreground">
              <tr>
                <th className="text-left p-3">Entity</th>
                <th className="text-left p-3">Exec</th>
                <th className="text-left p-3">Type</th>
                <th className="text-left p-3">Contact</th>
                <th className="text-left p-3">Status</th>
                <th className="text-right p-3">Value</th>
                <th className="text-left p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {leads.map(l => (
                <tr key={l.id} className="border-t hover:bg-muted/10">
                  <td className="p-3 font-medium">{l.entity_name}</td>
                  <td className="p-3 text-muted-foreground">{l.exec_name}</td>
                  <td className="p-3">{l.lead_type?.replace(/_/g, ' ')}</td>
                  <td className="p-3 text-muted-foreground">{l.contact_name || '—'}</td>
                  <td className="p-3"><StatusBadge status={l.status} /></td>
                  <td className="p-3 text-right">{l.estimated_value ? `₹${parseFloat(l.estimated_value).toLocaleString('en-IN')}` : '—'}</td>
                  <td className="p-3">
                    {!l.crm_lead_id && (
                      <Button size="sm" variant="outline" disabled={pushing === l.id} onClick={() => pushToCRM(l.id)}>
                        {pushing === l.id ? '…' : <><ChevronRight className="h-3.5 w-3.5 mr-1" />Push to CRM</>}
                      </Button>
                    )}
                    {l.crm_lead_id && <span className="text-xs text-green-600">In CRM #{l.crm_lead_id}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

type TabId = 'overview' | 'expenses' | 'targets' | 'doctors' | 'leads';

const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: 'overview',  label: 'Overview',     icon: BarChart3 },
  { id: 'expenses',  label: 'Expenses',     icon: IndianRupee },
  { id: 'targets',   label: 'Targets',      icon: Target },
  { id: 'doctors',   label: 'Doctor CRM',   icon: Stethoscope },
  { id: 'leads',     label: 'Field Leads',  icon: TrendingUp },
];

export default function CRMFieldForcePage() {
  const [tab, setTab] = useState<TabId>('overview');

  return (
    <CRMLayout title="Smart-Force">
      <div className="p-4 md:p-6 space-y-5 max-w-screen-xl">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <MapPin className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Smart-Force</h1>
            <p className="text-sm text-muted-foreground">Field force management — Business Head view</p>
          </div>
        </div>

        {/* Tab nav */}
        <div className="flex gap-1 border-b overflow-x-auto">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setTab(id)}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${tab === id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
              <Icon className="h-4 w-4" />{label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {tab === 'overview'  && <OverviewTab />}
        {tab === 'expenses'  && <ExpensesTab />}
        {tab === 'targets'   && <TargetsTab />}
        {tab === 'doctors'   && <DoctorCRMTab />}
        {tab === 'leads'     && <LeadsTab />}
      </div>
    </CRMLayout>
  );
}
