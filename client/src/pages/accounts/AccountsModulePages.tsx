/**
 * AccountsModulePages — World-class Hospital Accounts Department Portal.
 * Complete finance & billing management: 17 functional module pages.
 */
import React, { useState } from 'react';
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
const Wrap = ({ title, subtitle, children }: {
  title: string; subtitle: string; children: React.ReactNode;
}) => (
  <HospDeptLayout deptKey="accounts" deptName="Accounts" badgeLabel="Accounts"
    loginPath="/accounts/login" DeptIcon={DollarSign} navSections={navSections}
    title={title} subtitle={subtitle}>
    {children}
  </HospDeptLayout>
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
const bills = [
  { id: 'INV-2460', patient: 'Ramesh Kumar',     uhid: 'UHID-10041', dept: 'Cardiology',   amount: '₹18,400', paid: '₹18,400', balance: '₹0',     status: 'Paid',    date: '21 Mar 2026' },
  { id: 'INV-2459', patient: 'Sunita Sharma',    uhid: 'UHID-10035', dept: 'Orthopaedics', amount: '₹12,200', paid: '₹6,000',  balance: '₹6,200', status: 'Partial', date: '21 Mar 2026' },
  { id: 'INV-2458', patient: 'Ajay Verma',       uhid: 'UHID-10022', dept: 'General OPD',  amount: '₹1,800',  paid: '₹0',      balance: '₹1,800', status: 'Pending', date: '20 Mar 2026' },
  { id: 'INV-2457', patient: 'Priya Nair',       uhid: 'UHID-10056', dept: 'Gynaecology',  amount: '₹28,000', paid: '₹28,000', balance: '₹0',     status: 'Paid',    date: '20 Mar 2026' },
  { id: 'INV-2456', patient: 'Deepak Mishra',    uhid: 'UHID-10018', dept: 'Neurology',    amount: '₹42,600', paid: '₹0',      balance: '₹42,600',status: 'Pending', date: '19 Mar 2026' },
  { id: 'INV-2455', patient: 'Ananya Singh',     uhid: 'UHID-10061', dept: 'Oncology',     amount: '₹85,000', paid: '₹85,000', balance: '₹0',     status: 'Paid',    date: '19 Mar 2026' },
  { id: 'INV-2454', patient: 'Rakesh Gupta',     uhid: 'UHID-10009', dept: 'Urology',      amount: '₹22,000', paid: '₹0',      balance: '₹22,000',status: 'Draft',   date: '18 Mar 2026' },
  { id: 'INV-2453', patient: 'Meena Patel',      uhid: 'UHID-10073', dept: 'Dermatology',  amount: '₹4,500',  paid: '₹4,500',  balance: '₹0',     status: 'Paid',    date: '18 Mar 2026' },
];
export const AccountsBillsPage = () => {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('All');
  const statuses = ['All', 'Paid', 'Pending', 'Partial', 'Draft'];
  const filtered = bills.filter(b =>
    (filter === 'All' || b.status === filter) &&
    (b.patient.toLowerCase().includes(search.toLowerCase()) || b.id.toLowerCase().includes(search.toLowerCase()))
  );
  return (
    <Wrap title="Bill Generation" subtitle="Create & manage patient invoices">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
        <KPICard label="Today's Bills" value="24" sub="₹1,24,500 total" icon={Receipt} color="text-teal-600" />
        <KPICard label="Paid" value="17" sub="₹98,200 collected" icon={CheckCircle2} color="text-emerald-600" up={true} />
        <KPICard label="Pending" value="5" sub="₹18,800 outstanding" icon={Clock} color="text-amber-600" />
        <KPICard label="Draft" value="2" sub="Awaiting finalization" icon={FileText} color="text-slate-500" />
      </div>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <CardTitle className="text-base flex items-center gap-2"><Receipt className="h-4 w-4 text-teal-600" />All Invoices</CardTitle>
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
const patientAccts = [
  { uhid: 'UHID-10041', name: 'Ramesh Kumar',   phone: '98100-00001', bills: 8,  total: '₹1,24,200', paid: '₹1,24,200', due: '₹0',      lastVisit: '21 Mar', status: 'Active' },
  { uhid: 'UHID-10035', name: 'Sunita Sharma',  phone: '98100-00002', bills: 5,  total: '₹56,800',   paid: '₹50,600',   due: '₹6,200',  lastVisit: '21 Mar', status: 'Active' },
  { uhid: 'UHID-10022', name: 'Ajay Verma',     phone: '98100-00003', bills: 3,  total: '₹12,400',   paid: '₹10,600',   due: '₹1,800',  lastVisit: '20 Mar', status: 'Active' },
  { uhid: 'UHID-10056', name: 'Priya Nair',     phone: '98100-00004', bills: 12, total: '₹2,82,000', paid: '₹2,82,000', due: '₹0',      lastVisit: '20 Mar', status: 'Active' },
  { uhid: 'UHID-10018', name: 'Deepak Mishra',  phone: '98100-00005', bills: 6,  total: '₹98,400',   paid: '₹55,800',   due: '₹42,600', lastVisit: '19 Mar', status: 'Active' },
  { uhid: 'UHID-10061', name: 'Ananya Singh',   phone: '98100-00006', bills: 9,  total: '₹4,50,000', paid: '₹4,50,000', due: '₹0',      lastVisit: '19 Mar', status: 'Active' },
  { uhid: 'UHID-10009', name: 'Rakesh Gupta',   phone: '98100-00007', bills: 2,  total: '₹22,000',   paid: '₹0',        due: '₹22,000', lastVisit: '18 Mar', status: 'Active' },
  { uhid: 'UHID-10073', name: 'Meena Patel',    phone: '98100-00008', bills: 4,  total: '₹18,200',   paid: '₹18,200',   due: '₹0',      lastVisit: '18 Mar', status: 'Active' },
];
export const AccountsPatientAcctsPage = () => {
  const [search, setSearch] = useState('');
  const filtered = patientAccts.filter(p => p.name.toLowerCase().includes(search.toLowerCase()) || p.uhid.toLowerCase().includes(search.toLowerCase()));
  return (
    <Wrap title="Patient Accounts" subtitle="Patient ledger & outstanding balances">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
        <KPICard label="Total Patients" value="3,842" sub="Active accounts" icon={Users} color="text-teal-600" />
        <KPICard label="Total Balance Due" value="₹5,68,000" sub="24 patients" icon={AlertCircle} color="text-red-500" />
        <KPICard label="Avg. Bill Value" value="₹8,240" sub="Current month" icon={IndianRupee} color="text-blue-600" />
        <KPICard label="Credit Limit Used" value="₹2,14,000" sub="12 patients on credit" icon={CreditCard} color="text-amber-600" />
      </div>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <CardTitle className="text-base flex items-center gap-2"><CreditCard className="h-4 w-4 text-teal-600" />Patient Account Ledger</CardTitle>
            <div className="flex gap-2">
              <div className="relative"><Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" /><Input placeholder="Search by name / UHID…" className="pl-8 h-8 w-52 text-sm" value={search} onChange={e => setSearch(e.target.value)} /></div>
              <Button variant="outline" size="sm" className="gap-1 h-8"><Download className="h-3.5 w-3.5" />Export</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr className="border-b"><TH>UHID</TH><TH>Patient Name</TH><TH>Phone</TH><TH>Total Bills</TH><TH>Total Amount</TH><TH>Paid</TH><TH>Due</TH><TH>Last Visit</TH><TH>Actions</TH></tr></thead>
              <tbody className="divide-y">
                {filtered.map(p => (
                  <tr key={p.uhid} className="hover:bg-muted/30">
                    <TD className="font-medium text-teal-700">{p.uhid}</TD>
                    <TD className="font-medium">{p.name}</TD>
                    <TD className="text-muted-foreground">{p.phone}</TD>
                    <TD className="text-center">{p.bills}</TD>
                    <TD className="font-semibold">{p.total}</TD>
                    <TD className="text-emerald-700">{p.paid}</TD>
                    <TD className={p.due === '₹0' ? 'text-muted-foreground' : 'text-red-600 font-semibold'}>{p.due}</TD>
                    <TD className="text-muted-foreground">{p.lastVisit}</TD>
                    <TD><div className="flex gap-1"><button className="p-1 hover:text-teal-600"><Eye className="h-3.5 w-3.5" /></button><button className="p-1 hover:text-blue-600"><FileText className="h-3.5 w-3.5" /></button></div></TD>
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
// 3. PAYMENTS RECEIVED
// ═══════════════════════════════════════════════════════════════════════════
const payments = [
  { id: 'PAY-8821', patient: 'Ananya Singh',  invoice: 'INV-2455', mode: 'UPI',       amount: '₹85,000', date: '19 Mar 2026', time: '14:32', ref: 'UPI8821XYZ', status: 'Settled' },
  { id: 'PAY-8820', patient: 'Priya Nair',    invoice: 'INV-2457', mode: 'Card',      amount: '₹28,000', date: '20 Mar 2026', time: '11:15', ref: 'CARD7720ABC', status: 'Settled' },
  { id: 'PAY-8819', patient: 'Ramesh Kumar',  invoice: 'INV-2460', mode: 'Cash',      amount: '₹18,400', date: '21 Mar 2026', time: '09:50', ref: 'CASH-001',    status: 'Settled' },
  { id: 'PAY-8818', patient: 'Sunita Sharma', invoice: 'INV-2459', mode: 'NEFT',      amount: '₹6,000',  date: '21 Mar 2026', time: '08:45', ref: 'NEFT9918XY',  status: 'Settled' },
  { id: 'PAY-8817', patient: 'Meena Patel',   invoice: 'INV-2453', mode: 'UPI',       amount: '₹4,500',  date: '18 Mar 2026', time: '16:20', ref: 'UPI8817ZZZ', status: 'Settled' },
  { id: 'PAY-8816', patient: 'Kiran Rao',     invoice: 'INV-2440', mode: 'Insurance', amount: '₹1,20,000',date:'17 Mar 2026',time: '10:00', ref: 'TPA-MEDI-44', status: 'Pending' },
];
const modeColor: Record<string, string> = {
  Cash: 'bg-green-100 text-green-700', UPI: 'bg-blue-100 text-blue-700',
  Card: 'bg-violet-100 text-violet-700', NEFT: 'bg-sky-100 text-sky-700',
  Insurance: 'bg-amber-100 text-amber-700', RTGS: 'bg-teal-100 text-teal-700',
};
export const AccountsPaymentsPage = () => {
  const [mode, setMode] = useState('All');
  const modes = ['All', 'Cash', 'UPI', 'Card', 'NEFT', 'Insurance'];
  const filtered = payments.filter(p => mode === 'All' || p.mode === mode);
  return (
    <Wrap title="Payments Received" subtitle="Record, reconcile & track all incoming payments">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
        <KPICard label="Today's Collection" value="₹1,24,500" sub="+8.2% vs yesterday" icon={Banknote} color="text-emerald-600" up={true} />
        <KPICard label="Monthly Collection" value="₹38,20,000" sub="Mar 2026" icon={TrendingUp} color="text-teal-600" up={true} />
        <KPICard label="UPI / Digital" value="₹22,80,000" sub="59.8% of total" icon={CreditCard} color="text-blue-600" />
        <KPICard label="Cash" value="₹8,40,000" sub="22% of total" icon={IndianRupee} color="text-amber-600" />
      </div>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <CardTitle className="text-base flex items-center gap-2"><Banknote className="h-4 w-4 text-teal-600" />Payment Register</CardTitle>
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
const insuranceClaims = [
  { id: 'CLM-4411', patient: 'Kiran Rao',       tpa: 'Medi Assist',    policy: 'MA-2024-001', admission: '10 Mar', discharge: '16 Mar', amount: '₹1,20,000', approved: '₹1,08,000', balance: '₹12,000', status: 'Approved' },
  { id: 'CLM-4410', patient: 'Neha Joshi',      tpa: 'Star Health',    policy: 'SH-5567-X',   admission: '12 Mar', discharge: '18 Mar', amount: '₹85,000',  approved: '—',         balance: '₹85,000', status: 'Submitted' },
  { id: 'CLM-4409', patient: 'Vinod Sharma',    tpa: 'CGHS',           policy: 'CGHS-INP-99', admission: '08 Mar', discharge: '14 Mar', amount: '₹64,200',  approved: '₹64,200',  balance: '₹0',      status: 'Settled' },
  { id: 'CLM-4408', patient: 'Leela Menon',     tpa: 'Niva Bupa',      policy: 'NB-998-2024', admission: '05 Mar', discharge: '10 Mar', amount: '₹1,45,000', approved: '—',        balance: '₹1,45,000',status: 'In Review' },
  { id: 'CLM-4407', patient: 'Sanjay Kulkarni', tpa: 'Medi Assist',    policy: 'MA-2024-888', admission: '18 Mar', discharge: '20 Mar', amount: '₹38,500',  approved: '—',         balance: '₹38,500', status: 'Submitted' },
  { id: 'CLM-4406', patient: 'Geeta Iyer',      tpa: 'ESIC',           policy: 'ESIC-7892',   admission: '01 Mar', discharge: '07 Mar', amount: '₹29,800',  approved: '₹24,000',  balance: '₹5,800',  status: 'Approved' },
  { id: 'CLM-4405', patient: 'Amit Saxena',     tpa: 'Care Health',    policy: 'CH-441-23',   admission: '25 Feb', discharge: '01 Mar', amount: '₹72,000',  approved: '—',         balance: '₹72,000', status: 'Rejected' },
];
export const AccountsInsuranceBillingPage = () => {
  const [search, setSearch] = useState('');
  const filtered = insuranceClaims.filter(c => c.patient.toLowerCase().includes(search.toLowerCase()) || c.tpa.toLowerCase().includes(search.toLowerCase()) || c.id.toLowerCase().includes(search.toLowerCase()));
  const totalPending = '₹3,41,000'; const totalSettled = '₹1,82,000';
  return (
    <Wrap title="Insurance Billing" subtitle="TPA & insurance claim management">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
        <KPICard label="Active Claims" value="14" sub="Awaiting settlement" icon={ShieldCheck} color="text-teal-600" />
        <KPICard label="Pending Amount" value={totalPending} sub="3 TPAs" icon={Clock} color="text-amber-600" />
        <KPICard label="Settled This Month" value={totalSettled} sub="8 claims" icon={CheckCircle2} color="text-emerald-600" up={true} />
        <KPICard label="Rejected Claims" value="1" sub="₹72,000 at risk" icon={XCircle} color="text-red-500" />
      </div>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <CardTitle className="text-base flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-teal-600" />Insurance Claims Register</CardTitle>
            <div className="flex gap-2">
              <div className="relative"><Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" /><Input placeholder="Patient / TPA / Claim ID…" className="pl-8 h-8 w-52 text-sm" value={search} onChange={e => setSearch(e.target.value)} /></div>
              <Button variant="outline" size="sm" className="gap-1 h-8"><Download className="h-3.5 w-3.5" />Export</Button>
              <Button size="sm" className="gap-1 h-8 bg-teal-600 hover:bg-teal-700"><PlusCircle className="h-3.5 w-3.5" />New Claim</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr className="border-b"><TH>Claim ID</TH><TH>Patient</TH><TH>TPA</TH><TH>Policy No.</TH><TH>Admission</TH><TH>Discharge</TH><TH>Claim Amt</TH><TH>Approved</TH><TH>Balance</TH><TH>Status</TH><TH>Actions</TH></tr></thead>
              <tbody className="divide-y">
                {filtered.map(c => (
                  <tr key={c.id} className="hover:bg-muted/30">
                    <TD className="font-semibold text-teal-700">{c.id}</TD>
                    <TD className="font-medium">{c.patient}</TD>
                    <TD className="text-muted-foreground">{c.tpa}</TD>
                    <TD className="font-mono text-xs">{c.policy}</TD>
                    <TD className="text-muted-foreground">{c.admission}</TD>
                    <TD className="text-muted-foreground">{c.discharge}</TD>
                    <TD className="font-semibold">{c.amount}</TD>
                    <TD className="text-emerald-700">{c.approved}</TD>
                    <TD className={c.balance === '₹0' ? 'text-muted-foreground' : 'text-amber-700 font-medium'}>{c.balance}</TD>
                    <TD><Bdg s={c.status} /></TD>
                    <TD><div className="flex gap-1"><button className="p-1 hover:text-teal-600"><Eye className="h-3.5 w-3.5" /></button><button className="p-1 hover:text-blue-600"><Pencil className="h-3.5 w-3.5" /></button></div></TD>
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
// 5. EXPENSE MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════
const expenses = [
  { id: 'EXP-1120', dept: 'Pharmacy',    category: 'Medicines',      vendor: 'Cipla Ltd',         amount: '₹4,20,000', date: '20 Mar', approvedBy: 'Dr. Mehra',  status: 'Approved' },
  { id: 'EXP-1119', dept: 'Facilities', category: 'Maintenance',     vendor: 'GreenTech Services', amount: '₹18,500',   date: '19 Mar', approvedBy: 'Admin HOD',  status: 'Approved' },
  { id: 'EXP-1118', dept: 'Radiology',  category: 'Equipment Rent',  vendor: 'Siemens Healthcare', amount: '₹85,000',   date: '18 Mar', approvedBy: 'Pending',    status: 'Pending' },
  { id: 'EXP-1117', dept: 'General',   category: 'Stationary',      vendor: 'Office Needs Co',    amount: '₹4,200',    date: '17 Mar', approvedBy: 'HOD Accts',  status: 'Approved' },
  { id: 'EXP-1116', dept: 'ICU',        category: 'Medical Supplies', vendor: 'B Braun India',     amount: '₹62,800',   date: '15 Mar', approvedBy: 'ICU HOD',    status: 'Approved' },
  { id: 'EXP-1115', dept: 'HR',         category: 'Training',        vendor: 'MedSkills Academy',  amount: '₹28,000',   date: '14 Mar', approvedBy: 'Pending',    status: 'Pending' },
  { id: 'EXP-1114', dept: 'Marketing',  category: 'Digital Ads',     vendor: 'Google Ads',         amount: '₹12,000',   date: '12 Mar', approvedBy: 'Marketing HOD',status:'Approved' },
];
const catColors: Record<string, string> = {
  Medicines: 'bg-teal-100 text-teal-700', Maintenance: 'bg-blue-100 text-blue-700',
  'Equipment Rent': 'bg-violet-100 text-violet-700', Stationary: 'bg-slate-100 text-slate-600',
  'Medical Supplies': 'bg-green-100 text-green-700', Training: 'bg-amber-100 text-amber-700',
  'Digital Ads': 'bg-pink-100 text-pink-700',
};
export const AccountsExpensesPage = () => {
  const [search, setSearch] = useState('');
  const filtered = expenses.filter(e => e.dept.toLowerCase().includes(search.toLowerCase()) || e.vendor.toLowerCase().includes(search.toLowerCase()) || e.category.toLowerCase().includes(search.toLowerCase()));
  return (
    <Wrap title="Expense Management" subtitle="Departmental & operational expense tracking">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
        <KPICard label="This Month Expenses" value="₹6,30,500" sub="-3.2% vs last month" icon={Wallet} color="text-teal-600" up={false} />
        <KPICard label="Pending Approval" value="₹1,13,000" sub="2 requests" icon={Clock} color="text-amber-600" />
        <KPICard label="Largest Category" value="Medicines" sub="₹4,20,000 (66%)" icon={Receipt} color="text-blue-600" />
        <KPICard label="Vendors" value="28" sub="Active this month" icon={Building2} color="text-slate-600" />
      </div>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <CardTitle className="text-base flex items-center gap-2"><Wallet className="h-4 w-4 text-teal-600" />Expense Register</CardTitle>
            <div className="flex gap-2">
              <div className="relative"><Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" /><Input placeholder="Dept / vendor / category…" className="pl-8 h-8 w-52 text-sm" value={search} onChange={e => setSearch(e.target.value)} /></div>
              <Button variant="outline" size="sm" className="gap-1 h-8"><Download className="h-3.5 w-3.5" />Export</Button>
              <Button size="sm" className="gap-1 h-8 bg-teal-600 hover:bg-teal-700"><PlusCircle className="h-3.5 w-3.5" />New Expense</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr className="border-b"><TH>Exp ID</TH><TH>Department</TH><TH>Category</TH><TH>Vendor</TH><TH>Amount</TH><TH>Date</TH><TH>Approved By</TH><TH>Status</TH><TH>Actions</TH></tr></thead>
              <tbody className="divide-y">
                {filtered.map(e => (
                  <tr key={e.id} className="hover:bg-muted/30">
                    <TD className="font-semibold text-teal-700">{e.id}</TD>
                    <TD className="font-medium">{e.dept}</TD>
                    <TD><span className={`px-2 py-0.5 rounded text-xs font-medium ${catColors[e.category] ?? 'bg-slate-100 text-slate-600'}`}>{e.category}</span></TD>
                    <TD className="text-muted-foreground">{e.vendor}</TD>
                    <TD className="font-bold">{e.amount}</TD>
                    <TD className="text-muted-foreground">{e.date}</TD>
                    <TD className="text-muted-foreground">{e.approvedBy}</TD>
                    <TD><Bdg s={e.status} /></TD>
                    <TD><div className="flex gap-1"><button className="p-1 hover:text-teal-600"><Eye className="h-3.5 w-3.5" /></button><button className="p-1 hover:text-blue-600"><CheckCircle2 className="h-3.5 w-3.5" /></button></div></TD>
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
// 6. VENDOR MANAGEMENT (NEW)
// ═══════════════════════════════════════════════════════════════════════════
const vendors = [
  { id: 'VND-001', name: 'Cipla Ltd',           category: 'Pharma',     contact: 'Rajiv - 9810001111', gstin: '27ABCCD1234E1Z5', outstanding: '₹4,20,000', terms: 'Net 30', status: 'Active' },
  { id: 'VND-002', name: 'Siemens Healthcare',   category: 'Equipment',  contact: 'Asha - 9810002222',  gstin: '06ABCDE5678F2G6', outstanding: '₹85,000',  terms: 'Net 45', status: 'Active' },
  { id: 'VND-003', name: 'B Braun India',        category: 'Supplies',   contact: 'Mohan - 9810003333', gstin: '07DEFGH9012I3J7', outstanding: '₹62,800',  terms: 'Net 30', status: 'Active' },
  { id: 'VND-004', name: 'GreenTech Services',   category: 'Facilities', contact: 'Priya - 9810004444', gstin: '09GHIJK3456K4L8', outstanding: '₹18,500',  terms: 'Net 15', status: 'Active' },
  { id: 'VND-005', name: 'Office Needs Co',      category: 'Stationary', contact: 'Rahul - 9810005555', gstin: '29LMNOP7890M5N9', outstanding: '₹4,200',   terms: 'Advance', status: 'Active' },
  { id: 'VND-006', name: 'MedSkills Academy',    category: 'Training',   contact: 'Seema - 9810006666', gstin: '24PQRST1234O6P0', outstanding: '₹28,000',  terms: 'Net 15', status: 'Active' },
  { id: 'VND-007', name: 'LabSupply India',      category: 'Lab',        contact: 'Anil - 9810007777',  gstin: '33UVWXY5678P7Q1', outstanding: '₹0',        terms: 'Net 30', status: 'Active' },
];
export const AccountsVendorsPage = () => {
  const [search, setSearch] = useState('');
  const filtered = vendors.filter(v => v.name.toLowerCase().includes(search.toLowerCase()) || v.category.toLowerCase().includes(search.toLowerCase()));
  return (
    <Wrap title="Vendor Management" subtitle="Supplier directory, payables & purchase orders">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
        <KPICard label="Total Vendors" value="28" sub="7 categories" icon={Building2} color="text-teal-600" />
        <KPICard label="Total Payable" value="₹6,18,500" sub="This month" icon={Landmark} color="text-amber-600" />
        <KPICard label="Overdue Payments" value="₹85,000" sub="1 vendor" icon={AlertTriangle} color="text-red-500" />
        <KPICard label="Avg. Payment Term" value="28 days" sub="Across all vendors" icon={Calendar} color="text-blue-600" />
      </div>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <CardTitle className="text-base flex items-center gap-2"><Building2 className="h-4 w-4 text-teal-600" />Vendor Directory</CardTitle>
            <div className="flex gap-2">
              <div className="relative"><Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" /><Input placeholder="Search vendor / category…" className="pl-8 h-8 w-52 text-sm" value={search} onChange={e => setSearch(e.target.value)} /></div>
              <Button variant="outline" size="sm" className="gap-1 h-8"><Download className="h-3.5 w-3.5" />Export</Button>
              <Button size="sm" className="gap-1 h-8 bg-teal-600 hover:bg-teal-700"><PlusCircle className="h-3.5 w-3.5" />Add Vendor</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr className="border-b"><TH>Vendor ID</TH><TH>Name</TH><TH>Category</TH><TH>Contact</TH><TH>GSTIN</TH><TH>Outstanding</TH><TH>Payment Terms</TH><TH>Status</TH><TH>Actions</TH></tr></thead>
              <tbody className="divide-y">
                {filtered.map(v => (
                  <tr key={v.id} className="hover:bg-muted/30">
                    <TD className="font-semibold text-teal-700">{v.id}</TD>
                    <TD className="font-medium">{v.name}</TD>
                    <TD><span className="px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700">{v.category}</span></TD>
                    <TD className="text-muted-foreground text-xs">{v.contact}</TD>
                    <TD className="font-mono text-xs text-muted-foreground">{v.gstin}</TD>
                    <TD className={v.outstanding === '₹0' ? 'text-emerald-600' : 'text-amber-700 font-semibold'}>{v.outstanding}</TD>
                    <TD className="text-muted-foreground">{v.terms}</TD>
                    <TD><Bdg s={v.status} /></TD>
                    <TD><div className="flex gap-1"><button className="p-1 hover:text-teal-600"><Eye className="h-3.5 w-3.5" /></button><button className="p-1 hover:text-blue-600"><Pencil className="h-3.5 w-3.5" /></button></div></TD>
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
// 7. PAYROLL
// ═══════════════════════════════════════════════════════════════════════════
const payrollData = [
  { empId: 'EMP-1001', name: 'Dr. Sunita Verma',  dept: 'Cardiology',   designation: 'Senior Consultant', gross: '₹1,80,000', deductions: '₹28,440', net: '₹1,51,560', pf: '₹21,600', status: 'Processed' },
  { empId: 'EMP-1002', name: 'Rajesh Nair',        dept: 'Nursing',      designation: 'Head Nurse',        gross: '₹65,000',   deductions: '₹8,450',  net: '₹56,550',   pf: '₹7,800',  status: 'Processed' },
  { empId: 'EMP-1003', name: 'Priya Sharma',       dept: 'Accounts',     designation: 'Senior Accountant', gross: '₹55,000',   deductions: '₹7,150',  net: '₹47,850',   pf: '₹6,600',  status: 'Processed' },
  { empId: 'EMP-1004', name: 'Anil Kumar',         dept: 'Radiology',    designation: 'Radiologist',       gross: '₹1,20,000', deductions: '₹17,940', net: '₹1,02,060', pf: '₹14,400', status: 'Held' },
  { empId: 'EMP-1005', name: 'Meena Pillai',       dept: 'Pharmacy',     designation: 'Pharmacist',        gross: '₹48,000',   deductions: '₹6,240',  net: '₹41,760',   pf: '₹5,760',  status: 'Processed' },
  { empId: 'EMP-1006', name: 'Suresh Patel',       dept: 'Housekeeping', designation: 'Supervisor',        gross: '₹28,000',   deductions: '₹3,640',  net: '₹24,360',   pf: '₹3,360',  status: 'Processed' },
];
export const AccountsPayrollPage = () => {
  const [month] = useState('March 2026');
  const total = '₹41,08,000'; const processed = 312; const held = 3;
  return (
    <Wrap title="Payroll" subtitle="Staff salary processing, PF, ESI & deductions">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
        <KPICard label={`${month} Payroll`} value={total} sub="315 employees" icon={Users} color="text-teal-600" />
        <KPICard label="Processed" value={String(processed)} sub="Ready for disbursement" icon={CheckCircle2} color="text-emerald-600" up={true} />
        <KPICard label="On Hold" value={String(held)} sub="Needs review" icon={AlertCircle} color="text-amber-600" />
        <KPICard label="PF Liability" value="₹4,92,960" sub="Due 15 Apr 2026" icon={Landmark} color="text-blue-600" />
      </div>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <CardTitle className="text-base flex items-center gap-2"><Users className="h-4 w-4 text-teal-600" />Payroll Register — {month}</CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="gap-1 h-8"><Download className="h-3.5 w-3.5" />Export Payslips</Button>
              <Button size="sm" className="gap-1 h-8 bg-teal-600 hover:bg-teal-700"><RefreshCw className="h-3.5 w-3.5" />Run Payroll</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr className="border-b"><TH>Emp ID</TH><TH>Name</TH><TH>Department</TH><TH>Designation</TH><TH>Gross</TH><TH>Deductions</TH><TH>PF</TH><TH>Net Pay</TH><TH>Status</TH><TH>Actions</TH></tr></thead>
              <tbody className="divide-y">
                {payrollData.map(e => (
                  <tr key={e.empId} className="hover:bg-muted/30">
                    <TD className="font-semibold text-teal-700">{e.empId}</TD>
                    <TD className="font-medium">{e.name}</TD>
                    <TD className="text-muted-foreground">{e.dept}</TD>
                    <TD className="text-muted-foreground">{e.designation}</TD>
                    <TD className="font-semibold">{e.gross}</TD>
                    <TD className="text-red-600">{e.deductions}</TD>
                    <TD className="text-muted-foreground">{e.pf}</TD>
                    <TD className="font-bold text-emerald-700">{e.net}</TD>
                    <TD><Bdg s={e.status} /></TD>
                    <TD><div className="flex gap-1"><button className="p-1 hover:text-teal-600"><Eye className="h-3.5 w-3.5" /></button><button className="p-1 hover:text-slate-600"><Printer className="h-3.5 w-3.5" /></button></div></TD>
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
// 8. BUDGET (NEW)
// ═══════════════════════════════════════════════════════════════════════════
const budgetData = [
  { dept: 'Pharmacy',       annual: 50_00_000, used: 42_00_000, pct: 84 },
  { dept: 'Radiology',      annual: 30_00_000, used: 22_50_000, pct: 75 },
  { dept: 'OT & Surgery',   annual: 40_00_000, used: 28_00_000, pct: 70 },
  { dept: 'ICU',            annual: 35_00_000, used: 21_00_000, pct: 60 },
  { dept: 'Laboratory',     annual: 15_00_000, used: 10_50_000, pct: 70 },
  { dept: 'Marketing',      annual:  5_00_000, used:  1_80_000, pct: 36 },
  { dept: 'HR & Training',  annual:  8_00_000, used:  4_80_000, pct: 60 },
  { dept: 'IT & Systems',   annual:  6_00_000, used:  3_96_000, pct: 66 },
];
const fmt = (n: number) => '₹' + (n / 1_00_000).toFixed(1) + 'L';
const barColor = (p: number) => p >= 90 ? 'bg-red-500' : p >= 75 ? 'bg-amber-500' : 'bg-teal-500';
export const AccountsBudgetPage = () => (
  <Wrap title="Budget Management" subtitle="Annual & departmental budget tracking — FY 2025-26">
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
      <KPICard label="Total Budget" value="₹1.89 Cr" sub="FY 2025-26" icon={Target} color="text-teal-600" />
      <KPICard label="Utilized" value="₹1.34 Cr" sub="71% consumed" icon={TrendingUp} color="text-amber-600" />
      <KPICard label="Remaining" value="₹55 L" sub="3 months left" icon={IndianRupee} color="text-emerald-600" />
      <KPICard label="Over Budget" value="0 depts" sub="All within limits" icon={CheckCircle2} color="text-blue-600" up={true} />
    </div>
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2"><Target className="h-4 w-4 text-teal-600" />Department-wise Budget Utilization</CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="gap-1 h-8"><Download className="h-3.5 w-3.5" />Export</Button>
            <Button size="sm" className="gap-1 h-8 bg-teal-600 hover:bg-teal-700"><Pencil className="h-3.5 w-3.5" />Revise Budget</Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {budgetData.map(b => (
            <div key={b.dept}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm font-medium">{b.dept}</span>
                <div className="flex items-center gap-4">
                  <span className="text-xs text-muted-foreground">Used: <strong>{fmt(b.used)}</strong> / {fmt(b.annual)}</span>
                  <span className={`text-xs font-bold ${b.pct >= 90 ? 'text-red-600' : b.pct >= 75 ? 'text-amber-600' : 'text-teal-600'}`}>{b.pct}%</span>
                </div>
              </div>
              <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2.5">
                <div className={`h-2.5 rounded-full ${barColor(b.pct)}`} style={{ width: `${b.pct}%` }} />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  </Wrap>
);

// ═══════════════════════════════════════════════════════════════════════════
// 9. GENERAL LEDGER
// ═══════════════════════════════════════════════════════════════════════════
const ledgerEntries = [
  { date: '21 Mar', entryNo: 'JNL-4421', account: 'Cash & Bank',          debit: '₹1,24,500', credit: '—',          narration: 'Daily collection receipt', balance: '₹38,42,100' },
  { date: '21 Mar', entryNo: 'JNL-4420', account: 'Patient Revenue',       debit: '—',          credit: '₹1,24,500', narration: 'OPD & IPD revenue',         balance: '₹1,24,18,400' },
  { date: '20 Mar', entryNo: 'JNL-4419', account: 'Insurance Receivable',  debit: '₹1,08,000', credit: '—',          narration: 'Medi Assist CLM-4411',      balance: '₹18,22,000' },
  { date: '20 Mar', entryNo: 'JNL-4418', account: 'Vendor Payable',        debit: '—',          credit: '₹4,20,000', narration: 'Cipla invoice Mar-2026',     balance: '₹24,80,000' },
  { date: '19 Mar', entryNo: 'JNL-4417', account: 'Salary Expense',        debit: '₹41,08,000',credit: '—',          narration: 'Mar 2026 payroll',           balance: '₹1,84,32,000' },
  { date: '19 Mar', entryNo: 'JNL-4416', account: 'Bank Account',          debit: '—',          credit: '₹41,08,000',narration: 'Salary transfer NEFT',       balance: '₹2,84,20,000' },
  { date: '18 Mar', entryNo: 'JNL-4415', account: 'GST Input Credit',      debit: '₹62,400',   credit: '—',          narration: 'Input credit Mar week 3',    balance: '₹4,12,800' },
];
export const AccountsLedgerPage = () => {
  const [account, setAccount] = useState('');
  const filtered = ledgerEntries.filter(e => account === '' || e.account.toLowerCase().includes(account.toLowerCase()) || e.entryNo.toLowerCase().includes(account.toLowerCase()));
  return (
    <Wrap title="General Ledger" subtitle="Double-entry bookkeeping & account balances">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
        <KPICard label="Total Assets" value="₹12.4 Cr" sub="Mar 2026" icon={Landmark} color="text-teal-600" />
        <KPICard label="Total Liabilities" value="₹4.8 Cr" sub="Mar 2026" icon={ClipboardList} color="text-amber-600" />
        <KPICard label="Net Worth" value="₹7.6 Cr" sub="+12% YoY" icon={TrendingUp} color="text-emerald-600" up={true} />
        <KPICard label="Journal Entries" value="4,421" sub="This FY" icon={BookOpen} color="text-blue-600" />
      </div>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <CardTitle className="text-base flex items-center gap-2"><BookOpen className="h-4 w-4 text-teal-600" />Ledger Entries</CardTitle>
            <div className="flex gap-2">
              <div className="relative"><Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" /><Input placeholder="Account / entry no…" className="pl-8 h-8 w-52 text-sm" value={account} onChange={e => setAccount(e.target.value)} /></div>
              <Button variant="outline" size="sm" className="gap-1 h-8"><Download className="h-3.5 w-3.5" />Export</Button>
              <Button size="sm" className="gap-1 h-8 bg-teal-600 hover:bg-teal-700"><PlusCircle className="h-3.5 w-3.5" />New Entry</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr className="border-b"><TH>Date</TH><TH>Entry No.</TH><TH>Account</TH><TH>Debit</TH><TH>Credit</TH><TH>Narration</TH><TH>Balance</TH></tr></thead>
              <tbody className="divide-y">
                {filtered.map(e => (
                  <tr key={e.entryNo} className="hover:bg-muted/30">
                    <TD className="text-muted-foreground">{e.date}</TD>
                    <TD className="font-semibold text-teal-700">{e.entryNo}</TD>
                    <TD className="font-medium">{e.account}</TD>
                    <TD className="text-blue-700 font-medium">{e.debit}</TD>
                    <TD className="text-red-600 font-medium">{e.credit}</TD>
                    <TD className="text-muted-foreground text-xs">{e.narration}</TD>
                    <TD className="font-semibold">{e.balance}</TD>
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
// 10. JOURNAL ENTRIES (NEW)
// ═══════════════════════════════════════════════════════════════════════════
const journals = [
  { id: 'JNL-4421', date: '21 Mar 2026', type: 'Receipt', lines: 2, amount: '₹1,24,500', narration: 'Daily collection receipt — OPD & IPD', createdBy: 'Priya Sharma', status: 'Posted' },
  { id: 'JNL-4420', date: '21 Mar 2026', type: 'Revenue', lines: 2, amount: '₹1,24,500', narration: 'Revenue recognition — patient services', createdBy: 'Priya Sharma', status: 'Posted' },
  { id: 'JNL-4419', date: '20 Mar 2026', type: 'Receivable', lines: 2, amount: '₹1,08,000', narration: 'TPA receivable — Medi Assist CLM-4411', createdBy: 'Arjun Nair', status: 'Posted' },
  { id: 'JNL-4418', date: '20 Mar 2026', type: 'Purchase', lines: 4, amount: '₹4,20,000', narration: 'Cipla pharma invoice — Mar 2026', createdBy: 'Arjun Nair', status: 'Posted' },
  { id: 'JNL-4417', date: '19 Mar 2026', type: 'Payroll', lines: 6, amount: '₹41,08,000', narration: 'March 2026 salary disbursement', createdBy: 'Priya Sharma', status: 'Posted' },
  { id: 'JNL-4414', date: '17 Mar 2026', type: 'Adjustment', lines: 2, amount: '₹14,200', narration: 'Write-off — bad debt adjustment', createdBy: 'HOD Accounts', status: 'Draft' },
];
export const AccountsJournalEntriesPage = () => (
  <Wrap title="Journal Entries" subtitle="Post, review & audit all accounting journal entries">
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
      <KPICard label="This Month Entries" value="142" sub="Mar 2026" icon={ClipboardList} color="text-teal-600" />
      <KPICard label="Posted" value="139" sub="Finalised in ledger" icon={CheckCircle2} color="text-emerald-600" />
      <KPICard label="Draft" value="3" sub="Pending review" icon={Clock} color="text-amber-600" />
      <KPICard label="Adjustments" value="4" sub="Write-offs & corrections" icon={RefreshCw} color="text-blue-600" />
    </div>
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2"><ClipboardList className="h-4 w-4 text-teal-600" />Journal Entry Log</CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="gap-1 h-8"><Download className="h-3.5 w-3.5" />Export</Button>
            <Button size="sm" className="gap-1 h-8 bg-teal-600 hover:bg-teal-700"><PlusCircle className="h-3.5 w-3.5" />New Entry</Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead><tr className="border-b"><TH>Entry No.</TH><TH>Date</TH><TH>Type</TH><TH>Lines</TH><TH>Amount</TH><TH>Narration</TH><TH>Created By</TH><TH>Status</TH><TH>Actions</TH></tr></thead>
            <tbody className="divide-y">
              {journals.map(j => (
                <tr key={j.id} className="hover:bg-muted/30">
                  <TD className="font-semibold text-teal-700">{j.id}</TD>
                  <TD className="text-muted-foreground">{j.date}</TD>
                  <TD><span className="px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700">{j.type}</span></TD>
                  <TD className="text-center text-muted-foreground">{j.lines}</TD>
                  <TD className="font-bold">{j.amount}</TD>
                  <TD className="text-xs text-muted-foreground max-w-xs truncate">{j.narration}</TD>
                  <TD className="text-muted-foreground">{j.createdBy}</TD>
                  <TD><Bdg s={j.status} /></TD>
                  <TD><div className="flex gap-1"><button className="p-1 hover:text-teal-600"><Eye className="h-3.5 w-3.5" /></button><button className="p-1 hover:text-blue-600"><Pencil className="h-3.5 w-3.5" /></button></div></TD>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  </Wrap>
);

// ═══════════════════════════════════════════════════════════════════════════
// 11. CHART OF ACCOUNTS (NEW)
// ═══════════════════════════════════════════════════════════════════════════
const coa = [
  { code: '1000', name: 'Cash & Cash Equivalents', type: 'Asset',   subtype: 'Current Asset',     balance: '₹38,42,100', normal: 'Debit' },
  { code: '1100', name: 'Accounts Receivable',     type: 'Asset',   subtype: 'Current Asset',     balance: '₹18,22,000', normal: 'Debit' },
  { code: '1200', name: 'Inventory — Pharmacy',    type: 'Asset',   subtype: 'Current Asset',     balance: '₹12,80,400', normal: 'Debit' },
  { code: '1500', name: 'Medical Equipment',       type: 'Asset',   subtype: 'Fixed Asset',       balance: '₹4,20,00,000', normal: 'Debit' },
  { code: '2000', name: 'Accounts Payable',        type: 'Liability','subtype': 'Current Liability', balance: '₹24,80,000', normal: 'Credit' },
  { code: '2100', name: 'Salary Payable',          type: 'Liability','subtype': 'Current Liability', balance: '₹41,08,000', normal: 'Credit' },
  { code: '2200', name: 'GST Payable',             type: 'Liability','subtype': 'Tax Liability',   balance: '₹4,82,000',  normal: 'Credit' },
  { code: '3000', name: 'Share Capital',           type: 'Equity',  subtype: 'Owner\'s Equity',   balance: '₹5,00,00,000', normal: 'Credit' },
  { code: '4000', name: 'Patient Revenue',         type: 'Income',  subtype: 'Operating Revenue', balance: '₹1,24,18,400', normal: 'Credit' },
  { code: '4100', name: 'Insurance Revenue',       type: 'Income',  subtype: 'Operating Revenue', balance: '₹38,42,000', normal: 'Credit' },
  { code: '5000', name: 'Salary Expense',          type: 'Expense', subtype: 'Staff Cost',        balance: '₹1,84,32,000', normal: 'Debit' },
  { code: '5100', name: 'Medical Supply Expense',  type: 'Expense', subtype: 'Clinical Cost',     balance: '₹42,80,000', normal: 'Debit' },
];
const typeColor: Record<string, string> = {
  Asset: 'bg-teal-100 text-teal-700', Liability: 'bg-red-100 text-red-700',
  Equity: 'bg-violet-100 text-violet-700', Income: 'bg-emerald-100 text-emerald-700',
  Expense: 'bg-amber-100 text-amber-700',
};
export const AccountsChartOfAccountsPage = () => {
  const [type, setType] = useState('All');
  const types = ['All', 'Asset', 'Liability', 'Equity', 'Income', 'Expense'];
  const filtered = coa.filter(a => type === 'All' || a.type === type);
  return (
    <Wrap title="Chart of Accounts" subtitle="Structured account hierarchy for double-entry accounting">
      <div className="grid grid-cols-5 gap-3 mb-5">
        {['Asset', 'Liability', 'Equity', 'Income', 'Expense'].map(t => (
          <Card key={t} className={`cursor-pointer border-2 transition-all ${type === t ? 'border-teal-500 bg-teal-50' : 'border-transparent hover:border-slate-200'}`} onClick={() => setType(type === t ? 'All' : t)}>
            <CardContent className="p-3 text-center">
              <p className="text-xs font-medium text-muted-foreground">{t}</p>
              <p className="font-bold text-sm mt-0.5">{coa.filter(a => a.type === t).length} accounts</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2"><List className="h-4 w-4 text-teal-600" />Account List</CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="gap-1 h-8"><Download className="h-3.5 w-3.5" />Export</Button>
              <Button size="sm" className="gap-1 h-8 bg-teal-600 hover:bg-teal-700"><PlusCircle className="h-3.5 w-3.5" />Add Account</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr className="border-b"><TH>Code</TH><TH>Account Name</TH><TH>Type</TH><TH>Sub-type</TH><TH>Balance</TH><TH>Normal Balance</TH><TH>Actions</TH></tr></thead>
              <tbody className="divide-y">
                {filtered.map(a => (
                  <tr key={a.code} className="hover:bg-muted/30">
                    <TD className="font-mono font-semibold text-teal-700">{a.code}</TD>
                    <TD className="font-medium">{a.name}</TD>
                    <TD><span className={`px-2 py-0.5 rounded text-xs font-medium ${typeColor[a.type]}`}>{a.type}</span></TD>
                    <TD className="text-muted-foreground text-xs">{a.subtype}</TD>
                    <TD className="font-semibold">{a.balance}</TD>
                    <TD><span className={`px-2 py-0.5 rounded text-xs font-medium ${a.normal === 'Debit' ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700'}`}>{a.normal}</span></TD>
                    <TD><div className="flex gap-1"><button className="p-1 hover:text-teal-600"><Eye className="h-3.5 w-3.5" /></button><button className="p-1 hover:text-blue-600"><Pencil className="h-3.5 w-3.5" /></button></div></TD>
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
// 12. FINANCIAL REPORTS
// ═══════════════════════════════════════════════════════════════════════════
const reportTypes = [
  { icon: TrendingUp,   title: 'Profit & Loss',       subtitle: 'Monthly / Quarterly / Annual P&L statement',  color: 'bg-teal-50 text-teal-700' },
  { icon: Landmark,     title: 'Balance Sheet',        subtitle: 'Assets, liabilities & equity snapshot',       color: 'bg-blue-50 text-blue-700' },
  { icon: Banknote,     title: 'Cash Flow Statement',  subtitle: 'Operating, investing & financing activities',  color: 'bg-emerald-50 text-emerald-700' },
  { icon: BarChart3,    title: 'Revenue by Department',subtitle: 'Department-wise revenue breakdown',            color: 'bg-violet-50 text-violet-700' },
  { icon: Receipt,      title: 'Outstanding Dues',     subtitle: 'Patient & insurance pending receivables',      color: 'bg-amber-50 text-amber-700' },
  { icon: Users,        title: 'Payroll Summary',      subtitle: 'Staff cost analysis by department',           color: 'bg-pink-50 text-pink-700' },
  { icon: FileText,     title: 'Day Book',             subtitle: 'Daily receipt & payment summary',             color: 'bg-slate-50 text-slate-700' },
  { icon: IndianRupee,  title: 'MIS Report',           subtitle: 'Management information system report',        color: 'bg-orange-50 text-orange-700' },
];
const plData = [
  { label: 'Patient Revenue',       value: '₹1,24,18,400', type: 'income' },
  { label: 'Insurance Revenue',     value: '₹38,42,000',   type: 'income' },
  { label: 'Other Income',          value: '₹2,80,000',    type: 'income' },
  { label: 'Total Revenue',         value: '₹1,65,40,400', type: 'total' },
  { label: 'Salary Expense',        value: '₹41,08,000',   type: 'expense' },
  { label: 'Medical Supplies',      value: '₹42,80,000',   type: 'expense' },
  { label: 'Other Overheads',       value: '₹18,40,000',   type: 'expense' },
  { label: 'Depreciation',          value: '₹8,20,000',    type: 'expense' },
  { label: 'Total Expenses',        value: '₹1,10,48,000', type: 'total' },
  { label: 'Net Profit',            value: '₹54,92,400',   type: 'profit' },
];
export const AccountsReportsPage = () => {
  const [activeReport, setActiveReport] = useState('P&L');
  return (
    <Wrap title="Financial Reports" subtitle="P&L, Balance Sheet, MIS & more">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
        <KPICard label="Monthly Revenue" value="₹1.65 Cr" sub="Mar 2026" icon={TrendingUp} color="text-teal-600" up={true} />
        <KPICard label="Monthly Expenses" value="₹1.10 Cr" sub="Mar 2026" icon={Wallet} color="text-red-500" up={false} />
        <KPICard label="Net Profit" value="₹54.9 L" sub="33.2% margin" icon={IndianRupee} color="text-emerald-600" up={true} />
        <KPICard label="YoY Growth" value="+18.4%" sub="vs Mar 2025" icon={BarChart3} color="text-blue-600" up={true} />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        {reportTypes.map(r => (
          <button key={r.title} onClick={() => setActiveReport(r.title)} className={`p-3 rounded-xl border-2 text-left transition-all hover:shadow-sm ${activeReport === r.title ? 'border-teal-500 bg-teal-50' : 'border-border'}`}>
            <div className={`p-2 rounded-lg w-fit mb-2 ${r.color}`}><r.icon className="h-4 w-4" /></div>
            <p className="text-xs font-semibold">{r.title}</p>
            <p className="text-xs text-muted-foreground mt-0.5 hidden sm:block">{r.subtitle}</p>
          </button>
        ))}
      </div>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Profit & Loss — March 2026</CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="gap-1 h-8"><Printer className="h-3.5 w-3.5" />Print</Button>
              <Button variant="outline" size="sm" className="gap-1 h-8"><Download className="h-3.5 w-3.5" />Export PDF</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="max-w-md">
            {plData.map(row => (
              <div key={row.label} className={`flex justify-between py-2 ${row.type === 'total' ? 'border-t border-b font-bold' : row.type === 'profit' ? 'border-t-2 border-b-2 font-bold text-emerald-700 text-lg mt-2' : ''}`}>
                <span className={row.type === 'expense' ? 'text-muted-foreground pl-4' : row.type === 'income' ? 'pl-4' : ''}>{row.label}</span>
                <span className={row.type === 'profit' ? 'text-emerald-700' : row.type === 'expense' ? 'text-red-600' : ''}>{row.value}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </Wrap>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// 13. TAX & COMPLIANCE (NEW)
// ═══════════════════════════════════════════════════════════════════════════
const taxItems = [
  { type: 'GST Return',   period: 'Feb 2026',  dueDate: '20 Mar 2026', filed: '18 Mar 2026', liability: '₹4,82,000', inputCredit: '₹1,24,000', netPayable: '₹3,58,000', status: 'Filed' },
  { type: 'GST Return',   period: 'Mar 2026',  dueDate: '20 Apr 2026', filed: '—',           liability: '₹5,10,000', inputCredit: '₹1,38,000', netPayable: '₹3,72,000', status: 'Due' },
  { type: 'TDS',          period: 'Feb 2026',  dueDate: '07 Mar 2026', filed: '05 Mar 2026', liability: '₹1,80,000', inputCredit: '—',          netPayable: '₹1,80,000', status: 'Filed' },
  { type: 'TDS',          period: 'Mar 2026',  dueDate: '07 Apr 2026', filed: '—',           liability: '₹1,92,000', inputCredit: '—',          netPayable: '₹1,92,000', status: 'Due' },
  { type: 'PF (EPF)',     period: 'Feb 2026',  dueDate: '15 Mar 2026', filed: '14 Mar 2026', liability: '₹4,92,960', inputCredit: '—',          netPayable: '₹4,92,960', status: 'Filed' },
  { type: 'PF (EPF)',     period: 'Mar 2026',  dueDate: '15 Apr 2026', filed: '—',           liability: '₹4,92,960', inputCredit: '—',          netPayable: '₹4,92,960', status: 'Due' },
  { type: 'ESI',          period: 'Feb 2026',  dueDate: '15 Mar 2026', filed: '14 Mar 2026', liability: '₹1,22,400', inputCredit: '—',          netPayable: '₹1,22,400', status: 'Filed' },
  { type: 'Income Tax (Adv.)', period: 'Q3 FY25-26', dueDate: '15 Dec 2025', filed: '12 Dec 2025', liability: '₹18,00,000', inputCredit: '—', netPayable: '₹18,00,000', status: 'Filed' },
];
export const AccountsTaxCompliancePage = () => {
  const upcoming = taxItems.filter(t => t.status === 'Due');
  return (
    <Wrap title="Tax & Compliance" subtitle="GST, TDS, PF, ESI filings & statutory obligations">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
        <KPICard label="Upcoming Filings" value={String(upcoming.length)} sub="Next 30 days" icon={Calendar} color="text-amber-600" />
        <KPICard label="Total Dues" value="₹10,56,960" sub="Mar–Apr 2026" icon={IndianRupee} color="text-red-500" />
        <KPICard label="Filed This Month" value="4" sub="100% on time" icon={FileCheck} color="text-emerald-600" up={true} />
        <KPICard label="GST Input Credit" value="₹1,38,000" sub="Mar 2026" icon={ShieldCheck} color="text-teal-600" />
      </div>
      {upcoming.length > 0 && (
        <div className="mb-4 p-3 rounded-xl border border-amber-200 bg-amber-50 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
          <div className="text-sm"><strong className="text-amber-800">Upcoming Deadlines:</strong>{' '}
            {upcoming.map(u => `${u.type} (${u.period})`).join(', ')} — ensure timely filing to avoid penalties.
          </div>
        </div>
      )}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2"><FileCheck className="h-4 w-4 text-teal-600" />Statutory Filing Register</CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="gap-1 h-8"><Download className="h-3.5 w-3.5" />Export</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr className="border-b"><TH>Tax Type</TH><TH>Period</TH><TH>Due Date</TH><TH>Filed On</TH><TH>Liability</TH><TH>Input Credit</TH><TH>Net Payable</TH><TH>Status</TH></tr></thead>
              <tbody className="divide-y">
                {taxItems.map((t, i) => (
                  <tr key={i} className="hover:bg-muted/30">
                    <TD className="font-semibold">{t.type}</TD>
                    <TD className="text-muted-foreground">{t.period}</TD>
                    <TD className={t.status === 'Due' ? 'text-amber-600 font-medium' : 'text-muted-foreground'}>{t.dueDate}</TD>
                    <TD className="text-emerald-700">{t.filed}</TD>
                    <TD className="font-medium">{t.liability}</TD>
                    <TD className="text-teal-700">{t.inputCredit}</TD>
                    <TD className="font-bold">{t.netPayable}</TD>
                    <TD><Bdg s={t.status} /></TD>
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
// 14. ANALYTICS
// ═══════════════════════════════════════════════════════════════════════════
const monthlyRevenue = [
  { month: 'Oct', rev: 128, exp: 95 }, { month: 'Nov', rev: 134, exp: 98 },
  { month: 'Dec', rev: 142, exp: 102 }, { month: 'Jan', rev: 138, exp: 99 },
  { month: 'Feb', rev: 151, exp: 107 }, { month: 'Mar', rev: 165, exp: 110 },
];
const maxRev = Math.max(...monthlyRevenue.map(m => m.rev));
const deptRevenue = [
  { dept: 'IPD', amount: '₹48.2 L', pct: 29 }, { dept: 'OPD', amount: '₹32.8 L', pct: 20 },
  { dept: 'Surgery', amount: '₹28.4 L', pct: 17 }, { dept: 'Pharmacy', amount: '₹18.6 L', pct: 11 },
  { dept: 'Radiology', amount: '₹14.2 L', pct: 9 }, { dept: 'Lab', amount: '₹12.8 L', pct: 8 },
  { dept: 'Others', amount: '₹10.4 L', pct: 6 },
];
export const AccountsAnalyticsPage = () => (
  <Wrap title="Analytics" subtitle="Revenue trends, cost analysis & financial KPIs">
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
      <KPICard label="Revenue Growth" value="+18.4%" sub="YoY Mar 2026" icon={TrendingUp} color="text-emerald-600" up={true} />
      <KPICard label="Cost Ratio" value="66.8%" sub="Expenses / Revenue" icon={BarChart3} color="text-amber-600" />
      <KPICard label="Collection Efficiency" value="94.2%" sub="Bills collected on time" icon={CheckCircle2} color="text-teal-600" up={true} />
      <KPICard label="Avg. Revenue / Patient" value="₹8,240" sub="Mar 2026" icon={IndianRupee} color="text-blue-600" />
    </div>
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      <div className="lg:col-span-2">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Revenue vs Expenses (₹ Lakhs) — Oct 25 to Mar 26</CardTitle></CardHeader>
          <CardContent>
            <div className="flex items-end gap-4 h-40 mt-2">
              {monthlyRevenue.map(m => (
                <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full flex gap-1 items-end" style={{ height: '120px' }}>
                    <div className="flex-1 rounded-t bg-teal-500 opacity-90" style={{ height: `${(m.rev / maxRev) * 100}%` }} title={`₹${m.rev}L`} />
                    <div className="flex-1 rounded-t bg-red-300" style={{ height: `${(m.exp / maxRev) * 100}%` }} title={`₹${m.exp}L`} />
                  </div>
                  <span className="text-xs text-muted-foreground">{m.month}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-teal-500 inline-block" />Revenue</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-300 inline-block" />Expenses</span>
            </div>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Revenue by Department</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-3">
            {deptRevenue.map(d => (
              <div key={d.dept}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="font-medium">{d.dept}</span>
                  <span className="text-muted-foreground">{d.amount} <strong className="text-foreground">({d.pct}%)</strong></span>
                </div>
                <Progress value={d.pct} className="h-1.5" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  </Wrap>
);

// ═══════════════════════════════════════════════════════════════════════════
// 15. SETTINGS
// ═══════════════════════════════════════════════════════════════════════════
export const AccountsSettingsPage = () => {
  const [gst, setGst] = useState('27MEDICZY1234H1Z5');
  const [pan, setPan] = useState('AABCM1234H');
  const [fyStart, setFyStart] = useState('April');
  const [currency, setCurrency] = useState('INR (₹)');
  return (
    <Wrap title="Settings" subtitle="Portal, fiscal & compliance configuration">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Settings className="h-4 w-4 text-teal-600" />Organisation Details</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div><label className="text-xs font-medium text-muted-foreground">Hospital Name</label><Input defaultValue="Mediczy Test Hospital" className="mt-1" /></div>
            <div><label className="text-xs font-medium text-muted-foreground">GSTIN</label><Input value={gst} onChange={e => setGst(e.target.value)} className="mt-1 font-mono" /></div>
            <div><label className="text-xs font-medium text-muted-foreground">PAN</label><Input value={pan} onChange={e => setPan(e.target.value)} className="mt-1 font-mono" /></div>
            <div><label className="text-xs font-medium text-muted-foreground">Address</label><Input defaultValue="MG Road, Bengaluru, Karnataka — 560001" className="mt-1" /></div>
            <Button size="sm" className="bg-teal-600 hover:bg-teal-700">Save Changes</Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><FileCheck className="h-4 w-4 text-teal-600" />Accounting Configuration</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div><label className="text-xs font-medium text-muted-foreground">Financial Year Start</label><Input value={fyStart} onChange={e => setFyStart(e.target.value)} className="mt-1" /></div>
            <div><label className="text-xs font-medium text-muted-foreground">Base Currency</label><Input value={currency} onChange={e => setCurrency(e.target.value)} className="mt-1" /></div>
            <div><label className="text-xs font-medium text-muted-foreground">Bill Prefix</label><Input defaultValue="INV-" className="mt-1 font-mono" /></div>
            <div><label className="text-xs font-medium text-muted-foreground">Journal Entry Prefix</label><Input defaultValue="JNL-" className="mt-1 font-mono" /></div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="autopost" defaultChecked className="rounded" />
              <label htmlFor="autopost" className="text-sm">Auto-post journal entries on bill creation</label>
            </div>
            <Button size="sm" className="bg-teal-600 hover:bg-teal-700">Save Settings</Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Users className="h-4 w-4 text-teal-600" />Staff Access Control</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {['Bill Creation', 'Payment Recording', 'Journal Entries', 'Payroll Processing', 'Report Generation', 'Settings Administration'].map(perm => (
              <div key={perm} className="flex items-center justify-between py-1 border-b last:border-0">
                <span className="text-sm">{perm}</span>
                <span className="text-xs px-2 py-0.5 rounded bg-teal-100 text-teal-700 font-medium">Allowed</span>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-teal-600" />Compliance Reminders</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {[
              { name: 'GST Return', day: '20th of every month', enabled: true },
              { name: 'TDS Deposit', day: '7th of every month', enabled: true },
              { name: 'PF / ESI', day: '15th of every month', enabled: true },
              { name: 'Advance Tax', day: 'Quarterly deadlines', enabled: false },
            ].map(r => (
              <div key={r.name} className="flex items-center justify-between py-1 border-b last:border-0">
                <div><p className="text-sm font-medium">{r.name}</p><p className="text-xs text-muted-foreground">{r.day}</p></div>
                <span className={`text-xs px-2 py-0.5 rounded font-medium ${r.enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{r.enabled ? 'Active' : 'Inactive'}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </Wrap>
  );
};

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
