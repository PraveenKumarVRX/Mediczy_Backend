/**
 * AccountsModulePages — World-class Hospital Accounts Department Portal.
 * Complete finance & billing management: 17 functional module pages.
 */
import React, { useState, useEffect } from 'react';
import HospDeptLayout, { DeptNavSection } from '@/components/hosp-dept/HospDeptLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DollarSign, Receipt, CreditCard, Banknote, ShieldCheck,
  Wallet, Users, ClipboardList, TrendingUp, BarChart3,
  Settings, HelpCircle, PlusCircle, Download, Search, Eye, Pencil,
  CheckCircle2, AlertCircle, Clock, Building2, FileText, BookOpen,
  List, Target, FileCheck, LayoutDashboard, ArrowUpRight, ArrowDownRight,
  Calendar, Printer, AlertTriangle, XCircle, RefreshCw, IndianRupee,
  Landmark, Filter, ChevronRight, Mail, Phone,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import hospitalBillingService from '@/services/hospital-billing.service';
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
  title: string; subtitle: string; children: React.ReactNode;
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

const TH = ({ children }: { children: React.ReactNode }) => (
  <th className="pb-2 text-left font-medium text-xs text-muted-foreground whitespace-nowrap">{children}</th>
);
const TD = ({ children, className }: { children: React.ReactNode; className?: string }) => (
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
  <NotAvailablePage title="Expense Management" subtitle="Operating expenses" needs="an expense ledger" />
);

// ═══════════════════════════════════════════════════════════════════════════
// 6. VENDOR MANAGEMENT (NEW)
// ═══════════════════════════════════════════════════════════════════════════
export const AccountsVendorsPage = () => (
  <NotAvailablePage title="Vendor Management" subtitle="Suppliers & payables" needs="a vendor-payables ledger in Accounts (Supply Chain has its own vendor master)" />
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
export const AccountsBudgetPage = () => (
  <NotAvailablePage title="Budget" subtitle="Budget planning & tracking" needs="budgets" />
);

// ═══════════════════════════════════════════════════════════════════════════
// 9. GENERAL LEDGER
// ═══════════════════════════════════════════════════════════════════════════
export const AccountsLedgerPage = () => (
  <NotAvailablePage title="General Ledger" subtitle="Ledger entries" needs="a general ledger" />
);

// ═══════════════════════════════════════════════════════════════════════════
// 10. JOURNAL ENTRIES (NEW)
// ═══════════════════════════════════════════════════════════════════════════
export const AccountsJournalEntriesPage = () => (
  <NotAvailablePage title="Journal Entries" subtitle="Manual journal postings" needs="journal entries" />
);

// ═══════════════════════════════════════════════════════════════════════════
// 11. CHART OF ACCOUNTS (NEW)
// ═══════════════════════════════════════════════════════════════════════════
export const AccountsChartOfAccountsPage = () => (
  <NotAvailablePage title="Chart of Accounts" subtitle="Account master" needs="a chart of accounts" />
);

// ═══════════════════════════════════════════════════════════════════════════
// 12. FINANCIAL REPORTS
// ═══════════════════════════════════════════════════════════════════════════
export const AccountsReportsPage = () => (
  <NotAvailablePage title="Financial Reports" subtitle="P&L, balance sheet & MIS" needs="an expense ledger and chart of accounts (P&L and balance sheet cannot be computed from billing alone)" />
);

// ═══════════════════════════════════════════════════════════════════════════
// 13. TAX & COMPLIANCE (NEW)
// ═══════════════════════════════════════════════════════════════════════════
export const AccountsTaxCompliancePage = () => (
  <NotAvailablePage title="Tax & Compliance" subtitle="GST, TDS & filings" needs="tax filing records" />
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
