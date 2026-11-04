/**
 * AccountsModulePages — World-class Hospital Accounts Department Portal.
 * Complete finance & billing management: 17 functional module pages.
 */
import React, { useCallback, useRef, useState, useEffect } from 'react';
import HospDeptLayout, { DeptNavSection } from '@/components/hosp-dept/HospDeptLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  DollarSign, Receipt, CreditCard, Banknote, ShieldCheck,
  Wallet, Users, ClipboardList, TrendingUp, BarChart3,
  Settings, HelpCircle, PlusCircle, Download, Search, Eye, Pencil,
  CheckCircle2, AlertCircle, Clock, Building2, FileText, BookOpen,
  List, Target, FileCheck, LayoutDashboard, ArrowUpRight, ArrowDownRight,
  Calendar, Printer, AlertTriangle, XCircle, RefreshCw, IndianRupee,
  Landmark, Filter, ChevronRight, Mail, Phone,
  Loader2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import hospitalBillingService from '@/services/hospital-billing.service';
import hospitalFinanceService from '@/services/hospital-finance.service';
import api from '@/lib/api';
import { getHospitalHeaders } from '@/services/hospital.service';
import { PlaceholderBanner } from '@/components/ui/placeholder-banner';

const fmtInr = (n: number) => `₹${Number(n || 0).toLocaleString('en-IN')}`;
const billStatusLabel: Record<string, string> = {
  paid: 'Paid', partial: 'Partial', issued: 'Pending', draft: 'Draft', overdue: 'Overdue', voided: 'Cancelled',
};

// ── Shared Navigation (6 sections, 17 modules) ─────────────────────────────
export const accountsNavSections: DeptNavSection[] = [
  {
    title: 'Overview',
    items: [
      { icon: LayoutDashboard, label: 'Dashboard',         href: '/accounts/dashboard' },
    ],
  },
  {
    title: 'Billing',
    items: [
      { icon: Receipt,     label: 'Bill Generation',   href: '/accounts/bills' },
      { icon: CreditCard,  label: 'Patient Accounts',  href: '/accounts/patient-accounts' },
      { icon: Banknote,    label: 'Payments Received', href: '/accounts/payments' },
      { icon: ShieldCheck, label: 'Insurance Billing', href: '/accounts/insurance-billing' },
    ],
  },
  {
    title: 'Finance',
    items: [
      { icon: Wallet,     label: 'Expenses',          href: '/accounts/expenses' },
      { icon: Building2,  label: 'Vendor Management', href: '/accounts/vendors' },
      { icon: Users,      label: 'Payroll',           href: '/accounts/payroll' },
      { icon: Target,     label: 'Budget',            href: '/accounts/budget' },
    ],
  },
  {
    title: 'Accounts Books',
    items: [
      { icon: BookOpen,      label: 'General Ledger',    href: '/accounts/ledger' },
      { icon: ClipboardList, label: 'Journal Entries',   href: '/accounts/journal-entries' },
      { icon: List,          label: 'Chart of Accounts', href: '/accounts/chart-of-accounts' },
    ],
  },
  {
    title: 'Reports',
    items: [
      { icon: TrendingUp, label: 'Financial Reports', href: '/accounts/reports' },
      { icon: Calendar,   label: 'Fiscal Periods',  href: '/accounts/fiscal-periods' },
      { icon: FileCheck,  label: 'Tax & Compliance',  href: '/accounts/tax-compliance' },
      { icon: BarChart3,  label: 'Analytics',         href: '/accounts/analytics' },
    ],
  },
  {
    title: 'System',
    items: [
      { icon: Settings,   label: 'Settings', href: '/accounts/settings' },
      { icon: HelpCircle, label: 'Support',  href: '/accounts/support' },
    ],
  },
];

const navSections = accountsNavSections;

// ── Shared UI helpers ───────────────────────────────────────────────────────
const Wrap = ({ title, subtitle, children, copilotModule = 'accounts' as const }: {
  title: string; subtitle: string; children?: React.ReactNode;
  copilotModule?: import('@/config/moduleCopilot.registry').ModuleCopilotId;
}) => (
  <HospDeptLayout deptKey="accounts" deptName="Accounts" badgeLabel="Accounts"
    loginPath="/accounts/login" DeptIcon={DollarSign} navSections={navSections}
    title={title} subtitle={subtitle} copilotModule={copilotModule}>
    {children}
  </HospDeptLayout>
);

// WP-0.3c: these pages used to render hardcoded seed tables (named patients, vendors, payroll, ledger,
// tax filings, GSTIN/PAN) with no backend at all. Billing (invoices/payments) is the only real data
// in Accounts today; everything else says so instead of inventing rows.
type FinanceRow = Record<string, unknown>;

const LiveFinancePage = ({ title, subtitle, load, columns, renderRow }: {
  title: string;
  subtitle: string;
  load: () => Promise<{ data?: FinanceRow[] }>;
  columns: string[];
  renderRow: (row: FinanceRow) => React.ReactNode;
}) => {
  const [rows, setRows] = useState<FinanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loadRef = useRef(load);
  loadRef.current = load;

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const result = await loadRef.current();
      setRows(result.data || []);
      setError(null);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'The finance service is unavailable.');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <Wrap title={title} subtitle={subtitle}>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">{title}</CardTitle>
            <Button size="sm" variant="outline" onClick={refresh} disabled={loading}>
              <RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} /> Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {error && <div className="mb-4 flex items-center justify-between rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700"><span>{error}</span><Button size="sm" variant="outline" onClick={refresh}>Retry</Button></div>}
          {loading ? <div className="py-10 text-center text-sm text-muted-foreground"><Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />Loading live records…</div> : rows.length === 0 && !error ? <div className="py-10 text-center text-sm text-muted-foreground">No records exist for this organization yet.</div> : (
            <div className="overflow-x-auto"><table className="w-full"><thead><tr>{columns.map((column) => <TH key={column}>{column}</TH>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={String(row.id ?? index)} className="border-t">{renderRow(row)}</tr>)}</tbody></table></div>
          )}
        </CardContent>
      </Card>
    </Wrap>
  );
};

const NotAvailablePage = ({ title, subtitle, needs }: { title: string; subtitle: string; needs: string }) => (
  <Wrap title={title} subtitle={subtitle}>
    <Card>
      <CardContent className="py-10">
        <div className="max-w-md mx-auto text-center space-y-2">
          <AlertCircle className="h-8 w-8 text-amber-500 mx-auto" />
          <p className="font-semibold">{title} isn't connected to a backend yet</p>
          <p className="text-sm text-muted-foreground">This screen needs {needs}, which doesn't exist yet. No sample data is shown.</p>
        </div>
      </CardContent>
    </Card>
  </Wrap>
);

const KPICard = ({ label, value, sub, icon: Icon, color, up }: {
  label: string; value: string; sub: string;
  icon: LucideIcon; color: string; up?: boolean;
}) => (
  <Card className="hover:shadow-md transition-shadow">
    <CardContent className="p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-muted-foreground font-medium">{label}</p>
          <p className={`text-xl font-bold mt-1 ${color}`}>{value}</p>
          <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
            {up !== undefined && (up
              ? <ArrowUpRight className="h-3 w-3 text-emerald-500" />
              : <ArrowDownRight className="h-3 w-3 text-red-500" />)}
            {sub}
          </p>
        </div>
        <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800">
          <Icon className={`h-5 w-5 ${color}`} />
        </div>
      </div>
    </CardContent>
  </Card>
);

const SC: Record<string, string> = {
  Paid: 'bg-emerald-100 text-emerald-700', Pending: 'bg-amber-100 text-amber-700',
  Partial: 'bg-blue-100 text-blue-700', Draft: 'bg-slate-100 text-slate-600',
  Cancelled: 'bg-red-100 text-red-700', Submitted: 'bg-blue-100 text-blue-700',
  Approved: 'bg-emerald-100 text-emerald-700', Rejected: 'bg-red-100 text-red-700',
  Settled: 'bg-emerald-100 text-emerald-700', Overdue: 'bg-red-100 text-red-700',
  Processed: 'bg-emerald-100 text-emerald-700', Held: 'bg-amber-100 text-amber-700',
  Active: 'bg-teal-100 text-teal-700', 'In Review': 'bg-violet-100 text-violet-700',
  Filed: 'bg-emerald-100 text-emerald-700', Due: 'bg-amber-100 text-amber-700',
};
const Bdg = ({ s }: { s: string }) => (
  <Badge className={`${SC[s] ?? 'bg-slate-100 text-slate-600'} border-0 text-xs`}>{s}</Badge>
);

const TH = ({ children }: { children?: React.ReactNode }) => (
  <th className="pb-2 text-left font-medium text-xs text-muted-foreground whitespace-nowrap">{children}</th>
);
const TD = ({ children, className }: { children?: React.ReactNode; className?: string }) => (
  <td className={`py-2.5 text-sm ${className ?? ''}`}>{children}</td>
);

// ═══════════════════════════════════════════════════════════════════════════
// 1. BILL GENERATION
// ═══════════════════════════════════════════════════════════════════════════
export const AccountsBillsPage = () => {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('All');
  const [bills, setBills] = useState<Array<{
    id: string; patient: string; uhid: string; dept: string;
    amount: string; paid: string; balance: string; status: string; date: string;
  }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await hospitalBillingService.listInvoices({ limit: 100 } as { status?: string; patientId?: number });
        const rows = (res.invoices || []).map((inv: Record<string, unknown>) => ({
          id: String(inv.bill_number || inv.id),
          patient: `Patient #${inv.patient_id}`,
          uhid: `UHID-${inv.patient_id}`,
          dept: String(inv.bill_type || 'IPD').toUpperCase(),
          amount: fmtInr(Number(inv.total_amount)),
          paid: fmtInr(Number(inv.amount_paid)),
          balance: fmtInr(Number(inv.amount_due)),
          status: billStatusLabel[String(inv.status)] || String(inv.status),
          date: inv.created_at ? new Date(String(inv.created_at)).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—',
        }));
        setBills(rows);
      } catch {
        setBills([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const statuses = ['All', 'Paid', 'Pending', 'Partial', 'Draft'];
  const filtered = bills.filter(b =>
    (filter === 'All' || b.status === filter) &&
    (b.patient.toLowerCase().includes(search.toLowerCase()) || b.id.toLowerCase().includes(search.toLowerCase()))
  );
  const todayTotal = bills.reduce((s, b) => s + Number(b.amount.replace(/[₹,]/g, '')), 0);
  const paidCount = bills.filter(b => b.status === 'Paid').length;
  const pendingCount = bills.filter(b => b.status === 'Pending').length;
  const draftCount = bills.filter(b => b.status === 'Draft').length;

  return (
    <Wrap title="Bill Generation" subtitle="Create & manage patient invoices">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
        <KPICard label="Total Bills" value={String(bills.length)} sub={fmtInr(todayTotal)} icon={Receipt} color="text-teal-600" />
        <KPICard label="Paid" value={String(paidCount)} sub="Settled invoices" icon={CheckCircle2} color="text-emerald-600" up={true} />
        <KPICard label="Pending" value={String(pendingCount)} sub="Awaiting payment" icon={Clock} color="text-amber-600" />
        <KPICard label="Draft" value={String(draftCount)} sub="Awaiting finalization" icon={FileText} color="text-slate-500" />
      </div>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <CardTitle className="text-base flex items-center gap-2"><Receipt className="h-4 w-4 text-teal-600" />All Invoices {loading && <RefreshCw className="h-3 w-3 animate-spin" />}</CardTitle>
            <div className="flex flex-wrap gap-2">
              <div className="relative"><Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" /><Input placeholder="Search patient / invoice…" className="pl-8 h-8 w-52 text-sm" value={search} onChange={e => setSearch(e.target.value)} /></div>
              <div className="flex gap-1">{statuses.map(s => <button key={s} onClick={() => setFilter(s)} className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${filter === s ? 'bg-teal-600 text-white border-teal-600' : 'border-border hover:bg-muted'}`}>{s}</button>)}</div>
              <Button variant="outline" size="sm" className="gap-1 h-8"><Download className="h-3.5 w-3.5" />Export</Button>
              <Button size="sm" className="gap-1 h-8 bg-teal-600 hover:bg-teal-700"><PlusCircle className="h-3.5 w-3.5" />New Bill</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr className="border-b"><TH>Invoice</TH><TH>Patient</TH><TH>UHID</TH><TH>Department</TH><TH>Amount</TH><TH>Paid</TH><TH>Balance</TH><TH>Status</TH><TH>Date</TH><TH>Actions</TH></tr></thead>
              <tbody className="divide-y">
                {filtered.map(b => (
                  <tr key={b.id} className="hover:bg-muted/30">
                    <TD className="font-semibold text-teal-700">{b.id}</TD>
                    <TD className="font-medium">{b.patient}</TD>
                    <TD className="text-muted-foreground">{b.uhid}</TD>
                    <TD className="text-muted-foreground">{b.dept}</TD>
                    <TD className="font-semibold">{b.amount}</TD>
                    <TD className="text-emerald-700">{b.paid}</TD>
                    <TD className={b.balance === '₹0' ? 'text-muted-foreground' : 'text-red-600 font-medium'}>{b.balance}</TD>
                    <TD><Bdg s={b.status} /></TD>
                    <TD className="text-muted-foreground">{b.date}</TD>
                    <TD><div className="flex gap-1"><button className="p-1 hover:text-teal-600"><Eye className="h-3.5 w-3.5" /></button><button className="p-1 hover:text-blue-600"><Pencil className="h-3.5 w-3.5" /></button><button className="p-1 hover:text-slate-600"><Printer className="h-3.5 w-3.5" /></button></div></TD>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </Wrap>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// 2. PATIENT ACCOUNTS
// ═══════════════════════════════════════════════════════════════════════════
interface PatientAcct { patientId: number; bills: number; total: number; paid: number; due: number; last: string | null }
export const AccountsPatientAcctsPage = () => {
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<PatientAcct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await hospitalBillingService.listInvoices({ limit: 200 } as { status?: string; patientId?: number });
      const byPatient = new Map<number, PatientAcct>();
      for (const inv of (res.invoices || []) as Record<string, unknown>[]) {
        if (inv.patient_id == null || ['voided', 'cancelled'].includes(String(inv.status))) continue;
        const id = Number(inv.patient_id);
        const cur = byPatient.get(id) ?? { patientId: id, bills: 0, total: 0, paid: 0, due: 0, last: null };
        cur.bills += 1;
        cur.total += Number(inv.total_amount || 0);
        cur.paid += Number(inv.amount_paid || 0);
        cur.due += Number(inv.amount_due || 0);
        const created = inv.created_at ? String(inv.created_at) : null;
        if (created && (!cur.last || created > cur.last)) cur.last = created;
        byPatient.set(id, cur);
      }
      setRows([...byPatient.values()].sort((x, y) => y.due - x.due));
      setError(null);
    } catch (e: any) {
      setError(e?.response?.data?.message ?? e?.message ?? 'Failed to load invoices');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const filtered = rows.filter(p => `patient #${p.patientId}`.includes(search.toLowerCase()));
  const totalDue = rows.reduce((s, r) => s + r.due, 0);
  const totalBilled = rows.reduce((s, r) => s + r.total, 0);
  const totalBills = rows.reduce((s, r) => s + r.bills, 0);
  return (
    <Wrap title="Patient Accounts" subtitle="Patient ledger & outstanding balances">
      <PlaceholderBanner title="Based on the latest 200 invoices." reason="Patient names and credit limits aren't joined into this view yet, so patients show by ID." />
      {error && <div className="flex items-center justify-between rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 mb-4"><span>{error}</span><Button size="sm" variant="outline" onClick={load}>Retry</Button></div>}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-5">
        <KPICard label="Patients With Invoices" value={String(rows.length)} sub="In the latest 200 invoices" icon={Users} color="text-teal-600" />
        <KPICard label="Total Balance Due" value={fmtInr(totalDue)} sub={`${rows.filter(r => r.due > 0).length} patients`} icon={AlertCircle} color="text-red-500" />
        <KPICard label="Avg. Bill Value" value={totalBills ? fmtInr(totalBilled / totalBills) : '—'} sub="Across listed invoices" icon={IndianRupee} color="text-blue-600" />
      </div>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <CardTitle className="text-base flex items-center gap-2"><CreditCard className="h-4 w-4 text-teal-600" />Patient Account Ledger {loading && <RefreshCw className="h-3 w-3 animate-spin" />}</CardTitle>
            <div className="relative"><Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" /><Input placeholder="Search by patient ID…" className="pl-8 h-8 w-52 text-sm" value={search} onChange={e => setSearch(e.target.value)} /></div>
          </div>
        </CardHeader>
        <CardContent>
          {!loading && filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No patient accounts to show.</p>
          ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr className="border-b"><TH>Patient</TH><TH>Bills</TH><TH>Total Amount</TH><TH>Paid</TH><TH>Due</TH><TH>Last Invoice</TH></tr></thead>
              <tbody className="divide-y">
                {filtered.map(p => (
                  <tr key={p.patientId} className="hover:bg-muted/30">
                    <TD className="font-medium text-teal-700">Patient #{p.patientId}</TD>
                    <TD className="text-center">{p.bills}</TD>
                    <TD className="font-semibold">{fmtInr(p.total)}</TD>
                    <TD className="text-emerald-700">{fmtInr(p.paid)}</TD>
                    <TD className={p.due === 0 ? 'text-muted-foreground' : 'text-red-600 font-semibold'}>{fmtInr(p.due)}</TD>
                    <TD className="text-muted-foreground">{p.last ? new Date(p.last).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</TD>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )}
        </CardContent>
      </Card>
    </Wrap>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// 3. PAYMENTS RECEIVED
// ═══════════════════════════════════════════════════════════════════════════
const modeColor: Record<string, string> = {
  cash: 'bg-green-100 text-green-700', upi: 'bg-blue-100 text-blue-700',
  card: 'bg-violet-100 text-violet-700', neft: 'bg-sky-100 text-sky-700',
  insurance: 'bg-amber-100 text-amber-700', rtgs: 'bg-teal-100 text-teal-700',
  credit: 'bg-orange-100 text-orange-700',
};
export const AccountsPaymentsPage = () => {
  const [mode, setMode] = useState('All');
  const [payments, setPayments] = useState<Array<{
    id: string; patient: string; invoice: string; mode: string;
    amount: string; date: string; time: string; ref: string; status: string;
  }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await hospitalBillingService.listPayments({ limit: 100 });
        const rows = (res.payments || []).map((p: Record<string, unknown>) => ({
          id: `PAY-${p.id}`,
          patient: `Patient #${p.patient_id}`,
          invoice: String(p.bill_number || p.invoice_id),
          mode: String(p.payment_method || 'cash').replace(/^./, (c) => c.toUpperCase()),
          amount: fmtInr(Number(p.amount)),
          date: p.created_at ? new Date(String(p.created_at)).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—',
          time: p.created_at ? new Date(String(p.created_at)).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—',
          ref: String(p.reference_number || p.gateway_payment_id || '—'),
          status: p.status === 'completed' ? 'Settled' : String(p.status),
        }));
        setPayments(rows);
      } catch {
        setPayments([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const modes = ['All', 'Cash', 'UPI', 'Card', 'NEFT', 'Insurance'];
  const filtered = payments.filter(p => mode === 'All' || p.mode.toLowerCase() === mode.toLowerCase());
  const totalCollected = payments.reduce((s, p) => s + Number(p.amount.replace(/[₹,]/g, '')), 0);

  return (
    <Wrap title="Payments Received" subtitle="Record, reconcile & track all incoming payments">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
        <KPICard label="Total Payments" value={String(payments.length)} sub={fmtInr(totalCollected)} icon={Banknote} color="text-emerald-600" up={true} />
        <KPICard label="Settled" value={String(payments.filter(p => p.status === 'Settled').length)} sub="Confirmed receipts" icon={TrendingUp} color="text-teal-600" up={true} />
        <KPICard label="Digital" value={String(payments.filter(p => ['UPI', 'Card'].includes(p.mode)).length)} sub="UPI + Card" icon={CreditCard} color="text-blue-600" />
        <KPICard label="Cash" value={String(payments.filter(p => p.mode === 'Cash').length)} sub="Counter collections" icon={IndianRupee} color="text-amber-600" />
      </div>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <CardTitle className="text-base flex items-center gap-2"><Banknote className="h-4 w-4 text-teal-600" />Payment Register {loading && <RefreshCw className="h-3 w-3 animate-spin" />}</CardTitle>
            <div className="flex flex-wrap gap-2">
              <div className="flex gap-1">{modes.map(m => <button key={m} onClick={() => setMode(m)} className={`px-2.5 py-1 rounded-lg text-xs font-medium border ${mode === m ? 'bg-teal-600 text-white border-teal-600' : 'border-border hover:bg-muted'}`}>{m}</button>)}</div>
              <Button variant="outline" size="sm" className="gap-1 h-8"><Download className="h-3.5 w-3.5" />Export</Button>
              <Button size="sm" className="gap-1 h-8 bg-teal-600 hover:bg-teal-700"><PlusCircle className="h-3.5 w-3.5" />Record Payment</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr className="border-b"><TH>Pay ID</TH><TH>Patient</TH><TH>Invoice</TH><TH>Mode</TH><TH>Amount</TH><TH>Date</TH><TH>Time</TH><TH>Reference</TH><TH>Status</TH></tr></thead>
              <tbody className="divide-y">
                {filtered.map(p => (
                  <tr key={p.id} className="hover:bg-muted/30">
                    <TD className="font-semibold text-teal-700">{p.id}</TD>
                    <TD className="font-medium">{p.patient}</TD>
                    <TD className="text-muted-foreground">{p.invoice}</TD>
                    <TD><span className={`px-2 py-0.5 rounded text-xs font-medium ${modeColor[p.mode] ?? 'bg-slate-100 text-slate-600'}`}>{p.mode}</span></TD>
                    <TD className="font-bold text-emerald-700">{p.amount}</TD>
                    <TD className="text-muted-foreground">{p.date}</TD>
                    <TD className="text-muted-foreground">{p.time}</TD>
                    <TD className="text-xs text-muted-foreground font-mono">{p.ref}</TD>
                    <TD><Bdg s={p.status} /></TD>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </Wrap>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// 4. INSURANCE BILLING
// ═══════════════════════════════════════════════════════════════════════════
export const AccountsInsuranceBillingPage = () => (
  <NotAvailablePage title="Insurance Billing" subtitle="Claims & TPA billing" needs="insurance claim submission and tracking by payer" />
);

// ═══════════════════════════════════════════════════════════════════════════
// 5. EXPENSE MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════
export const AccountsExpensesPage = () => (
  <LiveFinancePage
    title="Expense Management"
    subtitle="Live operating expenses"
    load={() => hospitalFinanceService.listExpenses()}
    columns={['Date', 'Category', 'Description', 'Amount', 'Status']}
    renderRow={(row) => <><TD>{String(row.expense_date ?? '—')}</TD><TD>{String(row.category ?? '—')}</TD><TD>{String(row.description ?? '—')}</TD><TD>{fmtInr(Number(row.amount))}</TD><TD><Bdg s={String(row.status ?? 'recorded')} /></TD></>}
  />
);

// ═══════════════════════════════════════════════════════════════════════════
// 6. VENDOR MANAGEMENT (NEW)
// ═══════════════════════════════════════════════════════════════════════════
export const AccountsVendorsPage = () => (
  <LiveFinancePage
    title="Vendor Management"
    subtitle="Live suppliers and payables masters"
    load={() => hospitalFinanceService.listVendors()}
    columns={['Code', 'Vendor', 'GSTIN', 'Terms', 'Status']}
    renderRow={(row) => <><TD>{String(row.vendor_code ?? '—')}</TD><TD>{String(row.vendor_name ?? '—')}</TD><TD>{String(row.gstin ?? '—')}</TD><TD>{String(row.payment_terms_days ?? 0)} days</TD><TD><Bdg s={row.is_active ? 'Active' : 'Inactive'} /></TD></>}
  />
);

// ═══════════════════════════════════════════════════════════════════════════
// 7. PAYROLL
// ═══════════════════════════════════════════════════════════════════════════
export const AccountsPayrollPage = () => (
  <NotAvailablePage title="Payroll" subtitle="Salary processing" needs="payroll processing" />
);

// ═══════════════════════════════════════════════════════════════════════════
// 8. BUDGET (NEW)
// ═══════════════════════════════════════════════════════════════════════════
const BudgetsInner = () => {
  const [budgets, setBudgets] = useState<FinanceRow[]>([]);
  const [periods, setPeriods] = useState<FinanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState({ periodCode: '', department: '', category: '', budgetAmount: '' });

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [b, p] = await Promise.all([
        hospitalFinanceService.listBudgets(),
        hospitalFinanceService.listFiscalPeriods(),
      ]);
      setBudgets(b.data || []);
      // A budget needs an OPEN period; default the picker to the first one.
      const open = (p.data || []).filter((x) => String(x.status) === 'open');
      setPeriods(open);
      setDraft((d) => (d.periodCode || !open[0] ? { ...d, periodCode: d.periodCode || String(open[0]?.period_code ?? '') } : d));
      setError(null);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'The finance service is unavailable.');
      setBudgets([]);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const save = useCallback(async () => {
    setBusy(true); setActionError(null);
    try {
      await hospitalFinanceService.upsertBudget({
        periodCode: draft.periodCode,
        department: draft.department.trim() || null,
        category: draft.category.trim(),
        budgetAmount: Number(draft.budgetAmount),
      });
      setShowForm(false);
      setDraft({ ...draft, department: '', category: '', budgetAmount: '' });
      await refresh();
    } catch (e: any) {
      setActionError(e?.response?.data?.message || 'The budget could not be saved.');
    } finally { setBusy(false); }
  }, [draft, refresh]);

  return (
    <>
      {actionError && <div className="mb-4"><ReportError message={actionError} onRetry={() => setActionError(null)} /></div>}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Budgets</CardTitle>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={refresh} disabled={loading}>
                <RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} /> Refresh
              </Button>
              <Button size="sm" onClick={() => setShowForm((v) => !v)} disabled={periods.length === 0}>
                <PlusCircle className="h-4 w-4" /> Set budget
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {periods.length === 0 && !loading && !error && (
            <p className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              No open fiscal period exists, so a budget cannot be set. Create one on the Fiscal Periods page first.
            </p>
          )}
          {showForm && (
            <div className="grid gap-3 rounded-lg border bg-slate-50 p-4 sm:grid-cols-4">
              <div>
                <label className="mb-1 block text-xs font-medium" htmlFor="bg-period">Period</label>
                <Select value={draft.periodCode} onValueChange={(v) => setDraft({ ...draft, periodCode: v })}>
                  <SelectTrigger><SelectValue placeholder="Select period" /></SelectTrigger>
                  <SelectContent>{periods.map((p) => (
                    <SelectItem key={String(p.id)} value={String(p.period_code)}>
                      {String(p.period_code)} ({String(p.start_date)} – {String(p.end_date)})
                    </SelectItem>
                  ))}</SelectContent>
                </Select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium" htmlFor="bg-dept">Department</label>
                <Input id="bg-dept" value={draft.department} onChange={(e) => setDraft({ ...draft, department: e.target.value })} placeholder="All departments" className="h-9" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium" htmlFor="bg-cat">Category</label>
                <Input id="bg-cat" value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} placeholder="e.g. Consumables" className="h-9" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium" htmlFor="bg-amt">Amount (₹)</label>
                <Input id="bg-amt" type="number" min="0" step="0.01" value={draft.budgetAmount} onChange={(e) => setDraft({ ...draft, budgetAmount: e.target.value })} className="h-9" />
              </div>
              <div className="sm:col-span-4">
                <Button size="sm" onClick={save} disabled={busy || !draft.periodCode || !draft.category.trim() || draft.budgetAmount === ''}>
                  {busy ? 'Saving…' : 'Save budget'}
                </Button>
              </div>
            </div>
          )}
          {error && <ReportError message={error} onRetry={refresh} />}
          {loading ? <div className="py-10 text-center text-sm text-muted-foreground"><Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />Loading budgets…</div>
            : budgets.length === 0 && !error ? <div className="py-10 text-center text-sm text-muted-foreground">No budgets set for this organization yet.</div> : (
              <div className="overflow-x-auto"><table className="w-full">
                <thead><tr><TH>Period</TH><TH>Department</TH><TH>Category</TH><TH>Budget</TH><TH>Spent</TH><TH>Used</TH></tr></thead>
                <tbody>{budgets.map((b) => {
                  const budgeted = Number(b.budget_amount) || 0;
                  const spent = Number(b.spent_amount) || 0;
                  const pct = budgeted > 0 ? Math.round((spent / budgeted) * 100) : 0;
                  return (
                    <tr key={String(b.id)} className="border-t">
                      <TD className="font-mono text-xs">{String(b.period_code)}</TD>
                      <TD>{String(b.department ?? 'All')}</TD>
                      <TD>{String(b.category)}</TD>
                      <TD className="text-right">{fmtInr(budgeted)}</TD>
                      <TD className="text-right">{fmtInr(spent)}</TD>
                      <TD className="w-32">
                        <div className="flex items-center gap-2">
                          <Progress value={Math.min(pct, 100)} className="h-2 flex-1" />
                          <span className={`w-10 text-right text-xs font-medium ${pct > 100 ? 'text-red-600' : 'text-muted-foreground'}`}>{pct}%</span>
                        </div>
                      </TD>
                    </tr>
                  );
                })}</tbody>
              </table></div>
            )}
        </CardContent>
      </Card>
    </>
  );
};

export const AccountsBudgetPage = () => (
  <Wrap title="Budget" subtitle="Budgets by fiscal period and category">
    <div className="space-y-4"><BudgetsInner /></div>
  </Wrap>
);

// ═══════════════════════════════════════════════════════════════════════════
// 9. GENERAL LEDGER
// ═══════════════════════════════════════════════════════════════════════════
export const AccountsLedgerPage = () => (
  <LiveFinancePage
    title="General Ledger"
    subtitle="Posted journal entries from the finance ledger"
    load={() => hospitalFinanceService.listJournalEntries()}
    columns={['Entry', 'Date', 'Description', 'Debit', 'Credit', 'Status']}
    renderRow={(row) => <><TD>{String(row.entry_number ?? '—')}</TD><TD>{String(row.entry_date ?? '—')}</TD><TD>{String(row.description ?? '—')}</TD><TD>{fmtInr(Number(row.total_debit))}</TD><TD>{fmtInr(Number(row.total_credit))}</TD><TD><Bdg s={String(row.status ?? 'posted')} /></TD></>}
  />
);

// ═══════════════════════════════════════════════════════════════════════════
// 10. JOURNAL ENTRIES (NEW)
// ═══════════════════════════════════════════════════════════════════════════

// Posted entries are never edited or deleted — a correction is an offsetting entry, so the
// audit trail keeps both the original and the correction.
const JournalEntriesInner = () => {
  const [entries, setEntries] = useState<FinanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [target, setTarget] = useState<FinanceRow | null>(null);
  const [reason, setReason] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await hospitalFinanceService.listJournalEntries();
      setEntries(res.data || []); setError(null);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'The finance service is unavailable.'); setEntries([]);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const reverse = useCallback(async () => {
    if (!target) return;
    const trimmed = reason.trim();
    if (!trimmed) { setActionError('A reason is required — a reversal without one cannot be audited.'); return; }
    setBusy(String(target.id)); setActionError(null);
    try {
      await hospitalFinanceService.reverseJournalEntry(target.id as number, trimmed);
      setTarget(null); setReason('');
      await refresh();
    } catch (e: any) {
      setActionError(e?.response?.data?.message || 'The entry could not be reversed.');
    } finally { setBusy(null); }
  }, [target, reason, refresh]);

  return (
    <>
      {actionError && <div className="mb-4"><ReportError message={actionError} onRetry={() => setActionError(null)} /></div>}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Journal Entries</CardTitle>
            <Button size="sm" variant="outline" onClick={refresh} disabled={loading}>
              <RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} /> Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {error && <div className="mb-4"><ReportError message={error} onRetry={refresh} /></div>}
          {loading ? <div className="py-10 text-center text-sm text-muted-foreground"><Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />Loading entries…</div>
            : entries.length === 0 && !error ? <div className="py-10 text-center text-sm text-muted-foreground">No journal entries have been posted yet.</div> : (
              <div className="overflow-x-auto"><table className="w-full">
                <thead><tr><TH>Entry</TH><TH>Date</TH><TH>Description</TH><TH>Source</TH><TH>Debit</TH><TH>Credit</TH><TH>Status</TH><TH>Action</TH></tr></thead>
                <tbody>{entries.map((e) => {
                  const reversible = String(e.status) === 'posted';
                  return (
                    <tr key={String(e.id)} className="border-t">
                      <TD className="font-mono text-xs">{String(e.entry_number)}</TD>
                      <TD>{String(e.entry_date)}</TD>
                      <TD>{String(e.description)}</TD>
                      <TD className="text-xs text-muted-foreground">{e.source_type ? `${e.source_type}${e.source_id ? ` #${e.source_id}` : ''}` : 'manual'}</TD>
                      <TD className="text-right">{fmtInr(Number(e.total_debit))}</TD>
                      <TD className="text-right">{fmtInr(Number(e.total_credit))}</TD>
                      <TD><Bdg s={String(e.status)} /></TD>
                      <TD>
                        {reversible ? (
                          <Button size="sm" variant="outline" onClick={() => { setTarget(e); setReason(''); setActionError(null); }}>
                            <RefreshCw className="h-3.5 w-3.5" /> Reverse
                          </Button>
                        ) : <span className="text-xs text-muted-foreground">{e.reversal_of ? 'Reversing entry' : '—'}</span>}
                      </TD>
                    </tr>
                  );
                })}</tbody>
              </table></div>
            )}
        </CardContent>
      </Card>

      {target && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="rev-title">
          <div className="w-full max-w-md space-y-4 rounded-lg bg-white p-5 shadow-xl">
            <h2 id="rev-title" className="text-base font-semibold">Reverse {String(target.entry_number)}</h2>
            <p className="text-sm text-muted-foreground">
              This posts an offsetting entry. The original is kept and marked reversed — nothing is deleted or edited.
            </p>
            <div>
              <label className="mb-1 block text-xs font-medium" htmlFor="rev-reason">Reason (required)</label>
              <Input id="rev-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. posted to the wrong revenue account" className="h-9" />
            </div>
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="outline" onClick={() => setTarget(null)}>Cancel</Button>
              <Button size="sm" variant="destructive" onClick={reverse} disabled={busy === String(target.id)}>
                {busy === String(target.id) ? 'Reversing…' : 'Post reversal'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

const ManualJournalInner = () => {
  const [accounts, setAccounts] = useState<FinanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [entryDate, setEntryDate] = useState(todayStr());
  const [description, setDescription] = useState('');
  const [lines, setLines] = useState([{ accountId: '', narration: '', debit: '', credit: '' }]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await hospitalFinanceService.listAccounts();
        setAccounts(res.data || []); setError(null);
      } catch (e: any) {
        setError(e?.response?.data?.message || 'The finance service is unavailable.');
      } finally { setLoading(false); }
    })();
  }, []);

  const setLine = (i: number, patch: Partial<typeof lines[number]>) =>
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  // The server enforces balance; surfacing it here avoids a pointless round trip and makes the
  // failure legible ("debits and credits must match") rather than a generic 400.
  const debits = lines.reduce((s, l) => s + Number(l.debit || 0), 0);
  const credits = lines.reduce((s, l) => s + Number(l.credit || 0), 0);
  const balanced = debits > 0 && Math.abs(debits - credits) < 0.005;
  const complete = description.trim() && lines.length >= 2
    && lines.every((l) => l.accountId && (Number(l.debit) > 0 ? Number(l.credit) === 0 : Number(l.credit) > 0));

  const post = useCallback(async () => {
    setBusy(true); setActionError(null);
    try {
      await hospitalFinanceService.postJournalEntry({
        entry_date: entryDate,
        description: description.trim(),
        lines: lines.map((l) => ({
          accountId: Number(l.accountId),
          narration: l.narration.trim() || null,
          debit: Number(l.debit || 0),
          credit: Number(l.credit || 0),
        })),
      });
      setShowForm(false);
      setDescription('');
      setLines([{ accountId: '', narration: '', debit: '', credit: '' }]);
    } catch (e: any) {
      setActionError(e?.response?.data?.message || 'The entry could not be posted.');
    } finally { setBusy(false); }
  }, [entryDate, description, lines]);

  return (
    <>
      {actionError && <div className="mb-4"><ReportError message={actionError} onRetry={() => setActionError(null)} /></div>}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Post a manual journal entry</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Use this for accruals, corrections and corrections the source systems cannot post. Every entry
            is permanent — to fix a mistake, reverse it with a reason rather than editing.
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium" htmlFor="je-date">Date</label>
              <Input id="je-date" type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} className="h-9" />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium" htmlFor="je-desc">Description</label>
              <Input id="je-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What this entry records" className="h-9" />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr><TH>Account</TH><TH>Narration</TH><TH>Debit</TH><TH>Credit</TH><TH /></tr></thead>
              <tbody>{lines.map((l, i) => (
                <tr key={i} className="border-t">
                  <td>
                    <Select value={l.accountId} onValueChange={(v) => setLine(i, { accountId: v })}>
                      <SelectTrigger className="h-9"><SelectValue placeholder="Select account" /></SelectTrigger>
                      <SelectContent>{accounts.map((a) => (
                        <SelectItem key={String(a.id)} value={String(a.id)}>
                          {String(a.account_code)} — {String(a.account_name)}
                        </SelectItem>
                      ))}</SelectContent>
                    </Select>
                  </td>
                  <td><Input value={l.narration} onChange={(e) => setLine(i, { narration: e.target.value })} className="h-9" /></td>
                  <td><Input type="number" min="0" step="0.01" value={l.debit}
                    onChange={(e) => setLine(i, { debit: e.target.value, credit: e.target.value ? '' : l.credit })}
                    className="h-9 text-right" /></td>
                  <td><Input type="number" min="0" step="0.01" value={l.credit}
                    onChange={(e) => setLine(i, { credit: e.target.value, debit: e.target.value ? '' : l.debit })}
                    className="h-9 text-right" /></td>
                  <td>
                    {lines.length > 2 && (
                      <Button size="sm" variant="ghost" onClick={() => setLines((ls) => ls.filter((_, idx) => idx !== i))}
                        aria-label={`Remove line ${i + 1}`}><XCircle className="h-4 w-4" /></Button>
                    )}
                  </td>
                </tr>
              ))}</tbody>
              <tfoot><tr className="border-t">
                <TH colSpan={2}>Totals</TH>
                <TD className="text-right font-semibold">{fmtInr(debits)}</TD>
                <TD className="text-right font-semibold">{fmtInr(credits)}</TD>
                <TD />
              </tr></tfoot>
            </table>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm" variant="outline" onClick={() => setLines((ls) => [...ls, { accountId: '', narration: '', debit: '', credit: '' }])}>
              <PlusCircle className="h-4 w-4" /> Add line
            </Button>
            <Badge variant={balanced ? 'default' : 'secondary'}>
              {balanced ? 'Balanced' : `Out of balance by ${fmtInr(Math.abs(debits - credits))}`}
            </Badge>
            <div className="flex-1" />
            <Button size="sm" onClick={post} disabled={busy || !complete || !balanced}>
              {busy ? 'Posting…' : 'Post entry'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </>
  );
};

/** Manual posting sits above the list: an accountant's first action is to post, not to browse. */
export const AccountsJournalEntriesPage = () => (
  <Wrap title="Journal Entries" subtitle="Post and audit ledger entries">
    <div className="space-y-4">
      <ManualJournalInner />
      <JournalEntriesInner />
    </div>
  </Wrap>
);

// ═══════════════════════════════════════════════════════════════════════════
// 11. CHART OF ACCOUNTS (NEW)
// ═══════════════════════════════════════════════════════════════════════════
export const AccountsChartOfAccountsPage = () => (
  <LiveFinancePage
    title="Chart of Accounts"
    subtitle="Live account master"
    load={() => hospitalFinanceService.listAccounts()}
    columns={['Code', 'Account', 'Type', 'Status']}
    renderRow={(row) => <><TD>{String(row.account_code ?? '—')}</TD><TD>{String(row.account_name ?? '—')}</TD><TD>{String(row.account_type ?? '—')}</TD><TD><Bdg s={row.is_active ? 'Active' : 'Inactive'} /></TD></>}
  />
);

// ═══════════════════════════════════════════════════════════════════════════
// 12. FINANCIAL REPORTS
// ═══════════════════════════════════════════════════════════════════════════

const todayStr = () => new Date().toISOString().slice(0, 10);
const firstOfMonth = () => `${todayStr().slice(0, 7)}-01`;
type ReportPayload = { data?: Record<string, unknown> };

/** Shared date-range bar. A report without a stated window is not interpretable. */
const RangeBar = ({ from, to, onChange, onRefresh, busy, children }: {
  from: string; to: string; onChange: (next: { from: string; to: string }) => void;
  onRefresh: () => void; busy: boolean; children?: React.ReactNode;
}) => (
  <div className="flex flex-wrap items-end gap-3">
    <div>
      <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="fin-from">From</label>
      <Input id="fin-from" type="date" value={from} max={to} onChange={(e) => onChange({ from: e.target.value, to })} className="h-9 w-40" />
    </div>
    <div>
      <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="fin-to">To</label>
      <Input id="fin-to" type="date" value={to} min={from} onChange={(e) => onChange({ from, to: e.target.value })} className="h-9 w-40" />
    </div>
    <Button size="sm" onClick={onRefresh} disabled={busy}>
      <RefreshCw className={busy ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} /> Run report
    </Button>
    {children}
  </div>
);

const ReportError = ({ message, onRetry }: { message: string; onRetry: () => void }) => (
  <div className="flex items-center justify-between rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
    <span>{message}</span>
    <Button size="sm" variant="outline" onClick={onRetry}>Retry</Button>
  </div>
);

const AmountRow = ({ label, value, bold }: { label: string; value: number; bold?: boolean }) => (
  <tr className={bold ? 'border-t-2 border-slate-300 font-semibold' : 'border-t'}>
    <TD className={bold ? 'font-semibold' : ''}>{label}</TD>
    <TD className={bold ? 'text-right font-semibold' : 'text-right'}>{fmtInr(value)}</TD>
  </tr>
);

export const AccountsReportsPage = () => {
  const [tab, setTab] = useState<'tb' | 'pl' | 'bs' | 'tax'>('tb');
  const [from, setFrom] = useState(firstOfMonth());
  const [to, setTo] = useState(todayStr());
  const [asOf, setAsOf] = useState(todayStr());
  const [payload, setPayload] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const run = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await (
        tab === 'tb' ? hospitalFinanceService.trialBalance({ from, to })
          : tab === 'pl' ? hospitalFinanceService.profitAndLoss({ from, to })
            : tab === 'bs' ? hospitalFinanceService.balanceSheet({ asOf })
              : hospitalFinanceService.taxSummary({ from, to })
      );
      setPayload((res as ReportPayload)?.data ?? null);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'The finance service is unavailable.');
      setPayload(null);
    } finally { setLoading(false); }
  }, [tab, from, to, asOf]);

  useEffect(() => { run(); }, [run]);

  // The CSV endpoint needs the hospital auth header, so a bare <a href> would 401. Fetch it as a
  // blob and hand the browser a real download instead.
  const downloadCsv = useCallback(async () => {
    setDownloading(true); setError(null);
    try {
      const res = await api.get(hospitalFinanceService.ledgerCsvUrl({ from, to }), {
        headers: getHospitalHeaders(), responseType: 'blob',
      });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url; a.download = `trial-balance-${from}-${to}.csv`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'The export failed.');
    } finally { setDownloading(false); }
  }, [from, to]);

  const data = payload ?? {};
  const lines = (data.lines ?? []) as Record<string, unknown>[];
  const income = (data.income ?? []) as Record<string, unknown>[];
  const expense = (data.expense ?? []) as Record<string, unknown>[];
  const assets = (data.assets ?? []) as Record<string, unknown>[];
  const liabilities = (data.liabilities ?? []) as Record<string, unknown>[];
  const byTaxCode = (data.byTaxCode ?? []) as Record<string, unknown>[];
  const balancedBadge = (ok: unknown) => (
    <Badge variant={ok ? 'default' : 'destructive'} className="ml-2">{ok ? 'Balanced' : 'Out of balance'}</Badge>
  );

  return (
    <Wrap title="Financial Reports" subtitle="Posted ledger figures for a stated period">
      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Reporting window</CardTitle></CardHeader>
          <CardContent>
            <RangeBar from={from} to={to} onChange={({ from: f, to: t }) => { setFrom(f); setTo(t); }} onRefresh={run} busy={loading}>
              <Button size="sm" variant="outline" onClick={downloadCsv} disabled={downloading}>
                <Download className="h-4 w-4" /> {downloading ? 'Preparing…' : 'Export CSV'}
              </Button>
            </RangeBar>
            {tab === 'bs' && (
              <div className="mt-3">
                <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="fin-asof">Balance as of</label>
                <Input id="fin-asof" type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} className="h-9 w-40" />
              </div>
            )}
          </CardContent>
        </Card>

        {error && <ReportError message={error} onRetry={run} />}

        <Card>
          <CardHeader className="pb-3">
            <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
              <TabsList>
                <TabsTrigger value="tb">Trial Balance</TabsTrigger>
                <TabsTrigger value="pl">Profit &amp; Loss</TabsTrigger>
                <TabsTrigger value="bs">Balance Sheet</TabsTrigger>
                <TabsTrigger value="tax">Tax Summary</TabsTrigger>
              </TabsList>
            </Tabs>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="py-10 text-center text-sm text-muted-foreground"><Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />Calculating…</div>
            ) : !payload ? (
              <div className="py-10 text-center text-sm text-muted-foreground">Run a report to see figures.</div>
            ) : tab === 'tb' ? (
              <>
                <p className="mb-3 text-sm text-muted-foreground">Trial balance {balancedBadge(data.balanced)}</p>
                {lines.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">No postings in this window.</p> : (
                  <div className="overflow-x-auto"><table className="w-full">
                    <thead><tr><TH>Code</TH><TH>Account</TH><TH>Type</TH><TH>Debit</TH><TH>Credit</TH><TH>Net</TH></tr></thead>
                    <tbody>{lines.map((l) => (
                      <tr key={String(l.id)} className="border-t">
                        <TD className="font-mono text-xs">{String(l.account_code)}</TD>
                        <TD>{String(l.account_name)}</TD>
                        <TD className="text-muted-foreground">{String(l.account_type)}</TD>
                        <TD className="text-right">{fmtInr(Number(l.debit))}</TD>
                        <TD className="text-right">{fmtInr(Number(l.credit))}</TD>
                        <TD className="text-right font-medium">{fmtInr(Number(l.net))}</TD>
                      </tr>
                    ))}</tbody>
                  </table></div>
                )}
              </>
            ) : tab === 'pl' ? (
              <>
                <p className="mb-2 text-sm font-semibold">Income</p>
                <table className="w-full"><tbody>{income.map((a) => <AmountRow key={String(a.id)} label={`${a.account_code} — ${a.account_name}`} value={Number(a.credit) - Number(a.debit)} />)}</tbody></table>
                <p className="mb-2 mt-4 text-sm font-semibold">Expense</p>
                <table className="w-full"><tbody>{expense.map((a) => <AmountRow key={String(a.id)} label={`${a.account_code} — ${a.account_name}`} value={Number(a.debit) - Number(a.credit)} />)}</tbody></table>
                <table className="mt-2 w-full"><tbody><AmountRow label="Net profit" value={Number(data.netProfit)} bold /></tbody></table>
              </>
            ) : tab === 'bs' ? (
              <>
                <p className="mb-3 text-sm text-muted-foreground">As of {String(data.asOf)} {balancedBadge(data.balanced)}</p>
                <p className="mb-2 text-sm font-semibold">Assets</p>
                <table className="w-full"><tbody>{assets.map((a) => <AmountRow key={String(a.id)} label={`${a.account_code} — ${a.account_name}`} value={Number(a.debit) - Number(a.credit)} />)}<AmountRow label="Total assets" value={Number(data.totalAssets)} bold /></tbody></table>
                <p className="mb-2 mt-4 text-sm font-semibold">Liabilities</p>
                <table className="w-full"><tbody>{liabilities.map((a) => <AmountRow key={String(a.id)} label={`${a.account_code} — ${a.account_name}`} value={Number(a.credit) - Number(a.debit)} />)}<AmountRow label="Total liabilities" value={Number(data.totalLiabilities)} bold /></tbody></table>
                <table className="mt-4 w-full"><tbody><AmountRow label="Total equity" value={Number(data.totalEquity)} bold /></tbody></table>
              </>
            ) : (
              <>
                {byTaxCode.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">No expensed tax-coded entries in this window.</p> : (
                  <div className="overflow-x-auto"><table className="w-full">
                    <thead><tr><TH>Tax code</TH><TH>Taxable value</TH><TH>Tax</TH><TH>Entries</TH></tr></thead>
                    <tbody>{byTaxCode.map((t) => (
                      <tr key={String(t.tax_code)} className="border-t">
                        <TD className="font-mono text-xs">{String(t.tax_code)}</TD>
                        <TD className="text-right">{fmtInr(Number(t.taxable_value))}</TD>
                        <TD className="text-right font-medium">{fmtInr(Number(t.tax_amount))}</TD>
                        <TD className="text-right text-muted-foreground">{String(t.entries)}</TD>
                      </tr>
                    ))}</tbody>
                    <tfoot><tr className="border-t-2"><TH>Total input tax</TH><TD /><TD className="text-right font-semibold">{fmtInr(Number(data.totalTax))}</TD><TD /></tr></tfoot>
                  </table></div>
                )}
                {typeof data.note === 'string' && (
                  <p className="mt-3 flex items-start gap-2 text-xs text-amber-700"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />{String(data.note)}</p>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </Wrap>
  );
};

const FiscalPeriodsInner = () => {
  const [periods, setPeriods] = useState<FinanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [draft, setDraft] = useState({ period_code: '', start_date: '', end_date: '' });

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await hospitalFinanceService.listFiscalPeriods();
      setPeriods(res.data || []); setError(null);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'The finance service is unavailable.'); setPeriods([]);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const create = useCallback(async () => {
    setBusy('create'); setActionError(null);
    try {
      await hospitalFinanceService.createFiscalPeriod(draft);
      setShowCreate(false); setDraft({ period_code: '', start_date: '', end_date: '' });
      await refresh();
    } catch (e: any) {
      setActionError(e?.response?.data?.message || 'The period could not be created.');
    } finally { setBusy(null); }
  }, [draft, refresh]);

  // Closing is irreversible from this screen, so it must be deliberate and must say what it costs.
  const close = useCallback(async (code: string) => {
    if (!window.confirm(`Close period ${code}? Nothing further can be posted into it. Existing entries are left exactly as they are — a mistake will need a reversing entry in an open period.`)) return;
    setBusy(code); setActionError(null);
    try {
      await hospitalFinanceService.closeFiscalPeriod(code);
      await refresh();
    } catch (e: any) {
      setActionError(e?.response?.data?.message || 'The period could not be closed.');
    } finally { setBusy(null); }
  }, [refresh]);

  return (
    <>
      {actionError && <div className="mb-4"><ReportError message={actionError} onRetry={() => setActionError(null)} /></div>}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Periods</CardTitle>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={refresh} disabled={loading}>
                <RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} /> Refresh
              </Button>
              <Button size="sm" onClick={() => setShowCreate((v) => !v)}>
                <PlusCircle className="h-4 w-4" /> New period
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {showCreate && (
            <div className="grid gap-3 rounded-lg border bg-slate-50 p-4 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs font-medium" htmlFor="fp-code">Code</label>
                <Input id="fp-code" value={draft.period_code} onChange={(e) => setDraft({ ...draft, period_code: e.target.value })} placeholder="2026-05" className="h-9" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium" htmlFor="fp-start">Start</label>
                <Input id="fp-start" type="date" value={draft.start_date} onChange={(e) => setDraft({ ...draft, start_date: e.target.value })} className="h-9" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium" htmlFor="fp-end">End</label>
                <Input id="fp-end" type="date" value={draft.end_date} min={draft.start_date} onChange={(e) => setDraft({ ...draft, end_date: e.target.value })} className="h-9" />
              </div>
              <div className="sm:col-span-3">
                <Button size="sm" onClick={create} disabled={busy === 'create' || !draft.period_code || !draft.start_date || !draft.end_date}>
                  {busy === 'create' ? 'Creating…' : 'Create period'}
                </Button>
              </div>
            </div>
          )}
          {error && <ReportError message={error} onRetry={refresh} />}
          {loading ? <div className="py-10 text-center text-sm text-muted-foreground"><Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />Loading periods…</div>
            : periods.length === 0 && !error ? <div className="py-10 text-center text-sm text-muted-foreground">No fiscal periods exist yet. Create one before posting to the ledger.</div> : (
              <div className="overflow-x-auto"><table className="w-full">
                <thead><tr><TH>Code</TH><TH>Start</TH><TH>End</TH><TH>Status</TH><TH>Closed</TH><TH>Action</TH></tr></thead>
                <tbody>{periods.map((p) => {
                  const closed = String(p.status) === 'closed';
                  return (
                    <tr key={String(p.id)} className="border-t">
                      <TD className="font-mono text-xs">{String(p.period_code)}</TD>
                      <TD>{String(p.start_date)}</TD>
                      <TD>{String(p.end_date)}</TD>
                      <TD><Bdg s={closed ? 'closed' : 'open'} /></TD>
                      <TD className="text-muted-foreground">{p.closed_at ? String(p.closed_at).slice(0, 16).replace('T', ' ') : '—'}</TD>
                      <TD>
                        {closed ? <span className="text-xs text-muted-foreground">Posting closed</span> : (
                          <Button size="sm" variant="outline" onClick={() => close(String(p.period_code))} disabled={busy === String(p.period_code)}>
                            {busy === String(p.period_code) ? 'Closing…' : 'Close period'}
                          </Button>
                        )}
                      </TD>
                    </tr>
                  );
                })}</tbody>
              </table></div>
            )}
        </CardContent>
      </Card>
    </>
  );
};

export const AccountsFiscalPeriodsPage = () => (
  <Wrap title="Fiscal Periods" subtitle="Accounting periods and their posting status">
    <div className="space-y-4"><FiscalPeriodsInner /></div>
  </Wrap>
);

// ═══════════════════════════════════════════════════════════════════════════
// 13. TAX & COMPLIANCE (NEW)
// ═══════════════════════════════════════════════════════════════════════════
export const AccountsTaxCompliancePage = () => (
  <LiveFinancePage
    title="Tax & Compliance"
    subtitle="Live tax-code master; filing status is not implied"
    load={() => hospitalFinanceService.listTaxCodes()}
    columns={['Code', 'Tax', 'Type', 'Rate', 'Status']}
    renderRow={(row) => <><TD>{String(row.tax_code ?? '—')}</TD><TD>{String(row.tax_name ?? '—')}</TD><TD>{String(row.tax_type ?? '—')}</TD><TD>{String(row.rate ?? '0')}%</TD><TD><Bdg s={row.is_active ? 'Active' : 'Inactive'} /></TD></>}
  />
);

// ═══════════════════════════════════════════════════════════════════════════
// 14. ANALYTICS
// ═══════════════════════════════════════════════════════════════════════════
export const AccountsAnalyticsPage = () => (
  <NotAvailablePage title="Analytics" subtitle="Revenue analytics" needs="per-department revenue tagging on invoices" />
);

// ═══════════════════════════════════════════════════════════════════════════
// 15. SETTINGS
// ═══════════════════════════════════════════════════════════════════════════
export const AccountsSettingsPage = () => (
  <NotAvailablePage title="Settings" subtitle="Portal, fiscal & compliance configuration" needs="a persisted accounts-settings store" />
);

// ═══════════════════════════════════════════════════════════════════════════
// 16. SUPPORT
// ═══════════════════════════════════════════════════════════════════════════
export const AccountsSupportPage = () => (
  <Wrap title="Help & Support" subtitle="Documentation, FAQs & contact support">
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      <div className="lg:col-span-2 space-y-4">
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><HelpCircle className="h-4 w-4 text-teal-600" />Frequently Asked Questions</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {[
              { q: 'How do I create a new patient bill?', a: 'Go to Billing → Bill Generation → click "New Bill". Enter the patient UHID, select services, and confirm.' },
              { q: 'How do I process insurance claims?', a: 'Navigate to Billing → Insurance Billing → New Claim. Enter TPA details, policy number, and attach supporting documents.' },
              { q: 'How do I run payroll for the month?', a: 'Go to Finance → Payroll → click "Run Payroll". Review employee data, deductions, and confirm disbursement.' },
              { q: 'How do I generate the P&L report?', a: 'Go to Reports → Financial Reports. Select "Profit & Loss" and choose the reporting period, then click Export PDF.' },
              { q: 'How do I add a new vendor?', a: 'Navigate to Finance → Vendor Management → Add Vendor. Fill in GSTIN, contact details, and payment terms.' },
              { q: 'How do I post a journal entry?', a: 'Go to Accounts Books → Journal Entries → New Entry. Enter debit/credit accounts, amounts, and narration, then post.' },
            ].map((item, i) => (
              <div key={i} className="border-b last:border-0 pb-4 last:pb-0">
                <p className="font-medium text-sm flex items-start gap-2"><ChevronRight className="h-4 w-4 text-teal-600 mt-0.5 flex-shrink-0" />{item.q}</p>
                <p className="text-sm text-muted-foreground mt-1.5 pl-6">{item.a}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Contact Support</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3 p-3 rounded-xl bg-teal-50">
              <Mail className="h-5 w-5 text-teal-600" />
              <div><p className="text-xs font-medium text-muted-foreground">Email</p><p className="text-sm font-semibold">accounts@mediczy.com</p></div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-xl bg-blue-50">
              <Phone className="h-5 w-5 text-blue-600" />
              <div><p className="text-xs font-medium text-muted-foreground">Helpdesk</p><p className="text-sm font-semibold">+91 80 4000 1234</p></div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50">
              <FileText className="h-5 w-5 text-slate-600" />
              <div><p className="text-xs font-medium text-muted-foreground">User Manual</p><p className="text-sm font-semibold underline cursor-pointer text-teal-700">Download PDF</p></div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Quick Links</CardTitle></CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {['Bill Generation Guide', 'Insurance Claim Process', 'Payroll Setup', 'GST Return Filing', 'Chart of Accounts Setup', 'Report Generation', 'Budget Planning'].map(link => (
                <li key={link}><button className="text-sm text-teal-700 hover:underline flex items-center gap-1.5"><ChevronRight className="h-3.5 w-3.5" />{link}</button></li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  </Wrap>
);
