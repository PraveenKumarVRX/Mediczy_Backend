import HospDeptLayout from '@/components/hosp-dept/HospDeptLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DollarSign, Receipt, CreditCard, FileText,
  TrendingUp, Users, BarChart3, PlusCircle,
  ArrowUpRight, ArrowDownRight, Clock, CheckCircle2, AlertCircle,
  Banknote, Wallet, ShieldCheck, ClipboardList, Download, Loader2,
  Building2, Target, BookOpen, FileCheck,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useCallback, useEffect, useState } from 'react';
import api from '@/utils/api';
import { PlaceholderBanner } from '@/components/ui/placeholder-banner';
import { EmptyState } from '@/components/ui/empty-state';
import { accountsNavSections } from './AccountsModulePages';

const navSections = accountsNavSections;

interface RecentInvoice { id: number; billNumber: string; patientId: number | null; billType: string | null; totalAmount: number; status: string; createdAt: string }
interface AccountsToday {
  todaysCollection: number;
  collectionByMethod: { method: string; total: number; count: number }[];
  billsGeneratedToday: number;
  pendingBills: number;
  pendingBillsOlderThan7d: number;
  outstandingAmount: number;
  monthCollection: number;
  refundsToday: number;
  recentInvoices: RecentInvoice[];
}

// WP-0.3c: KPIs, recent transactions (named patients), "pending from payers" (named TPAs) and today's
// summary were all hardcoded. Now backed by GET /hospital/accounts/today. Named-payer breakdown has no
// data source (invoices carry no payer name), so it is shown as an honest placeholder.
const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

const statusColor: Record<string, string> = {
  paid:    'bg-emerald-100 text-emerald-700',
  issued:  'bg-amber-100 text-amber-700',
  overdue: 'bg-red-100 text-red-700',
  partial: 'bg-blue-100 text-blue-700',
};

const AccountsDashboard = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<AccountsToday | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/hospital/accounts/today');
      setData(res.data?.data ?? null);
      setError(null);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? err?.message ?? 'Failed to load accounts data');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const kpis = [
    { label: "Today's Collection", value: data ? inr(data.todaysCollection) : '—', sub: 'Completed payments today', icon: DollarSign, up: true, color: 'text-emerald-600' },
    { label: 'Pending Bills', value: data ? String(data.pendingBills) : '—', sub: data ? `${data.pendingBillsOlderThan7d} older than 7 days` : '', icon: Receipt, up: false, color: 'text-amber-600' },
    { label: 'Month Collection', value: data ? inr(data.monthCollection) : '—', sub: 'Month to date', icon: TrendingUp, up: true, color: 'text-teal-600' },
    { label: 'Outstanding Amount', value: data ? inr(data.outstandingAmount) : '—', sub: data ? `${data.pendingBills} open invoices` : '', icon: AlertCircle, up: false, color: 'text-red-500' },
  ];
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
      {loading && !data ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-teal-600" /></div>
      ) : error ? (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 mb-6">
          <span>{error}</span><Button size="sm" variant="outline" onClick={load}>Retry</Button>
        </div>
      ) : null}
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
              {!data || data.recentInvoices.length === 0 ? (
                <EmptyState icon={Receipt} title="No invoices yet" description="Generated bills appear here." size="sm" />
              ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="pb-2 text-left font-medium">Invoice</th>
                      <th className="pb-2 text-left font-medium">Patient</th>
                      <th className="pb-2 text-left font-medium hidden md:table-cell">Type</th>
                      <th className="pb-2 text-right font-medium">Amount</th>
                      <th className="pb-2 text-center font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {data.recentInvoices.map((t) => (
                      <tr key={t.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer" onClick={() => navigate('/accounts/bills')}>
                        <td className="py-2.5 font-medium text-teal-700">{t.billNumber}</td>
                        <td className="py-2.5">{t.patientId != null ? `Patient #${t.patientId}` : '—'}</td>
                        <td className="py-2.5 text-muted-foreground hidden md:table-cell capitalize">{t.billType ?? '—'}</td>
                        <td className="py-2.5 text-right font-semibold">{inr(t.totalAmount)}</td>
                        <td className="py-2.5 text-center">
                          <Badge className={`${statusColor[t.status] ?? 'bg-slate-100 text-slate-600'} border-0 text-xs capitalize`}>{t.status}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              )}
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
            <CardContent className="grid grid-cols-3 gap-2">
              {[
                { label: 'New Bill',      icon: PlusCircle,   path: '/accounts/bills',             color: 'bg-teal-50 text-teal-700 hover:bg-teal-100' },
                { label: 'Payment In',   icon: Banknote,     path: '/accounts/payments',          color: 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' },
                { label: 'Day Report',   icon: FileText,     path: '/accounts/reports',           color: 'bg-blue-50 text-blue-700 hover:bg-blue-100' },
                { label: 'Ledger',       icon: BookOpen,     path: '/accounts/ledger',            color: 'bg-violet-50 text-violet-700 hover:bg-violet-100' },
                { label: 'Insurance',    icon: ShieldCheck,  path: '/accounts/insurance-billing', color: 'bg-amber-50 text-amber-700 hover:bg-amber-100' },
                { label: 'Payroll',      icon: Users,        path: '/accounts/payroll',           color: 'bg-pink-50 text-pink-700 hover:bg-pink-100' },
                { label: 'Vendors',      icon: Building2,    path: '/accounts/vendors',           color: 'bg-orange-50 text-orange-700 hover:bg-orange-100' },
                { label: 'Tax',          icon: FileCheck,    path: '/accounts/tax-compliance',    color: 'bg-lime-50 text-lime-700 hover:bg-lime-100' },
                { label: 'Budget',       icon: Target,       path: '/accounts/budget',            color: 'bg-cyan-50 text-cyan-700 hover:bg-cyan-100' },
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
              <PlaceholderBanner
                title="Per-payer pending isn't tracked yet"
                reason={`Invoices carry no payer name, so a TPA/insurer breakdown can't be derived. Total outstanding: ${data ? inr(data.outstandingAmount) : '—'}.`}
              />
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
                { label: 'Bills Generated', value: data ? String(data.billsGeneratedToday) : '—' },
                ...(data?.collectionByMethod ?? []).map((m) => ({ label: `Collected — ${m.method}`, value: inr(m.total) })),
                { label: 'Refunds Issued', value: data ? inr(data.refundsToday) : '—' },
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
