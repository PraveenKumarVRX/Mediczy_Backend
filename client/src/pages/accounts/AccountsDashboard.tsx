import HospDeptLayout, { DeptNavSection } from '@/components/hosp-dept/HospDeptLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DollarSign, LayoutDashboard, Receipt, CreditCard, FileText,
  TrendingUp, Users, BarChart3, Settings, HelpCircle, PlusCircle,
  ArrowUpRight, ArrowDownRight, Clock, CheckCircle2, AlertCircle,
  Banknote, Wallet, ShieldCheck, ClipboardList, Download,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const navSections: DeptNavSection[] = [
  {
    title: 'Overview',
    items: [
      { icon: LayoutDashboard, label: 'Dashboard',      href: '/accounts/dashboard' },
    ],
  },
  {
    title: 'Billing & Payments',
    items: [
      { icon: Receipt,         label: 'Bill Generation',     href: '/accounts/bills' },
      { icon: CreditCard,      label: 'Patient Accounts',    href: '/accounts/patient-accounts' },
      { icon: Banknote,        label: 'Payments Received',   href: '/accounts/payments' },
      { icon: ShieldCheck,     label: 'Insurance Billing',   href: '/accounts/insurance-billing' },
    ],
  },
  {
    title: 'Finance',
    items: [
      { icon: Wallet,          label: 'Expense Management',  href: '/accounts/expenses' },
      { icon: Users,           label: 'Payroll',             href: '/accounts/payroll' },
      { icon: ClipboardList,   label: 'Ledger',              href: '/accounts/ledger' },
      { icon: TrendingUp,      label: 'Financial Reports',   href: '/accounts/reports' },
    ],
  },
  {
    title: 'System',
    items: [
      { icon: BarChart3,      label: 'Analytics',   href: '/accounts/analytics' },
      { icon: Settings,       label: 'Settings',    href: '/accounts/settings' },
      { icon: HelpCircle,     label: 'Support',     href: '/accounts/support' },
    ],
  },
];

const kpis = [
  { label: "Today's Collection", value: '₹1,24,500', sub: '+8.2% vs yesterday', icon: DollarSign, up: true, color: 'text-emerald-600' },
  { label: 'Pending Bills',      value: '38',         sub: '12 urgent (>7 days)', icon: Receipt,    up: false, color: 'text-amber-600' },
  { label: 'Monthly Revenue',    value: '₹38,20,000', sub: '₹42L target',         icon: TrendingUp, up: true,  color: 'text-teal-600' },
  { label: 'Outstanding Amount', value: '₹5,68,000',  sub: '24 accounts',          icon: AlertCircle,up: false, color: 'text-red-500' },
];

const recentTransactions = [
  { id: 'INV-2451', patient: 'Ramesh Kumar',    dept: 'Cardiology',  amount: '₹12,400', status: 'Paid',    date: 'Today 10:23' },
  { id: 'INV-2450', patient: 'Sunita Sharma',   dept: 'Orthopaedics',amount: '₹8,200',  status: 'Pending', date: 'Today 09:45' },
  { id: 'INV-2449', patient: 'Ajay Verma',      dept: 'General OPD', amount: '₹1,800',  status: 'Paid',    date: 'Today 09:12' },
  { id: 'INV-2448', patient: 'Priya Nair',      dept: 'Gynaecology', amount: '₹22,000', status: 'Partial', date: 'Yesterday' },
  { id: 'INV-2447', patient: 'Deepak Mishra',   dept: 'Neurology',   amount: '₹35,600', status: 'Pending', date: 'Yesterday' },
];

const pendingPayments = [
  { payer: 'Medi Assist TPA',  amount: '₹1,82,000', bills: 14, daysOld: 18 },
  { payer: 'Star Health',      amount: '₹98,500',   bills: 8,  daysOld: 12 },
  { payer: 'CGHS',             amount: '₹74,200',   bills: 11, daysOld: 25 },
  { payer: 'Patients (OOP)',   amount: '₹2,13,800', bills: 31, daysOld: 7  },
];

const statusColor: Record<string, string> = {
  Paid:    'bg-emerald-100 text-emerald-700',
  Pending: 'bg-amber-100 text-amber-700',
  Partial: 'bg-blue-100 text-blue-700',
};

const AccountsDashboard = () => {
  const navigate = useNavigate();
  return (
    <HospDeptLayout
      deptKey="accounts"
      deptName="Accounts"
      badgeLabel="Accounts"
      loginPath="/accounts/login"
      DeptIcon={DollarSign}
      navSections={navSections}
      title="Accounts Dashboard"
      subtitle="Finance & billing overview"
    >
      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5 mb-6">
        {kpis.map((k) => (
          <Card key={k.label} className="hover:shadow-md transition-shadow">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-medium">{k.label}</p>
                  <p className={`text-2xl font-bold mt-1 ${k.color}`}>{k.value}</p>
                  <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                    {k.up ? <ArrowUpRight className="h-3 w-3 text-emerald-500" /> : <ArrowDownRight className="h-3 w-3 text-red-500" />}
                    {k.sub}
                  </p>
                </div>
                <div className={`p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800`}>
                  <k.icon className={`h-5 w-5 ${k.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Transactions */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base">Recent Transactions</CardTitle>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="gap-1"><Download className="h-4 w-4" />Export</Button>
                <Button size="sm" className="gap-1 bg-teal-600 hover:bg-teal-700" onClick={() => navigate('/accounts/bills')}>
                  <PlusCircle className="h-4 w-4" />New Bill
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="pb-2 text-left font-medium">Invoice</th>
                      <th className="pb-2 text-left font-medium">Patient</th>
                      <th className="pb-2 text-left font-medium hidden md:table-cell">Dept</th>
                      <th className="pb-2 text-right font-medium">Amount</th>
                      <th className="pb-2 text-center font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {recentTransactions.map((t) => (
                      <tr key={t.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer">
                        <td className="py-2.5 font-medium text-teal-700">{t.id}</td>
                        <td className="py-2.5">{t.patient}</td>
                        <td className="py-2.5 text-muted-foreground hidden md:table-cell">{t.dept}</td>
                        <td className="py-2.5 text-right font-semibold">{t.amount}</td>
                        <td className="py-2.5 text-center">
                          <Badge className={`${statusColor[t.status]} border-0 text-xs`}>{t.status}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Button variant="ghost" size="sm" className="mt-3 w-full text-teal-600" onClick={() => navigate('/accounts/bills')}>
                View all transactions →
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Right Column */}
        <div className="space-y-5">
          {/* Quick Actions */}
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Quick Actions</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-2">
              {[
                { label: 'New Bill',      icon: PlusCircle,  path: '/accounts/bills',     color: 'bg-teal-50 text-teal-700 hover:bg-teal-100' },
                { label: 'Payment In',   icon: Banknote,    path: '/accounts/payments',  color: 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' },
                { label: 'Day Report',   icon: FileText,    path: '/accounts/reports',   color: 'bg-blue-50 text-blue-700 hover:bg-blue-100' },
                { label: 'Ledger',       icon: ClipboardList,path:'/accounts/ledger',    color: 'bg-violet-50 text-violet-700 hover:bg-violet-100' },
                { label: 'Insurance',    icon: ShieldCheck,  path: '/accounts/insurance-billing', color: 'bg-amber-50 text-amber-700 hover:bg-amber-100' },
                { label: 'Payroll',      icon: Users,        path: '/accounts/payroll',  color: 'bg-pink-50 text-pink-700 hover:bg-pink-100' },
              ].map((a) => (
                <button
                  key={a.label}
                  onClick={() => navigate(a.path)}
                  className={`flex flex-col items-center gap-1.5 p-3 rounded-xl text-xs font-medium transition-colors ${a.color}`}
                >
                  <a.icon className="h-5 w-5" />
                  {a.label}
                </button>
              ))}
            </CardContent>
          </Card>

          {/* Pending from Payers */}
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4 text-amber-500" /> Pending from Payers
            </CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {pendingPayments.map((p) => (
                <div key={p.payer} className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{p.payer}</p>
                    <p className="text-xs text-muted-foreground">{p.bills} bills · {p.daysOld}d old</p>
                  </div>
                  <span className="text-sm font-bold text-red-600">{p.amount}</span>
                </div>
              ))}
              <Button variant="ghost" size="sm" className="w-full text-teal-600 mt-1" onClick={() => navigate('/accounts/insurance-billing')}>
                Manage all →
              </Button>
            </CardContent>
          </Card>

          {/* Today's Summary */}
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-teal-500" /> Today's Summary
            </CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {[
                { label: 'Bills Generated', value: '47' },
                { label: 'Cash Collected',  value: '₹68,200' },
                { label: 'Online Payments', value: '₹43,100' },
                { label: 'Insurance Paid',  value: '₹13,200' },
                { label: 'Refunds Issued',  value: '₹3,800' },
              ].map((s) => (
                <div key={s.label} className="flex justify-between">
                  <span className="text-muted-foreground">{s.label}</span>
                  <span className="font-semibold">{s.value}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </HospDeptLayout>
  );
};

export default AccountsDashboard;
