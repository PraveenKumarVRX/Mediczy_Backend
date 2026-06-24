/**
 * CFO Dashboard — Chief Financial Officer
 * Revenue cycle, cash flow, AR/AP, payer settlements, budget control
 */
import { useState, useEffect } from 'react';
import HospitalLayout from '@/components/hospital/HospitalLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, PieChart, Pie, Cell,
} from 'recharts';
import {
  DollarSign, TrendingUp, TrendingDown, Wallet, Receipt, CreditCard,
  RefreshCw, Download, AlertTriangle, CheckCircle2, Building2,
  PieChart as PieIcon, ArrowUpRight, Shield, FileText, Banknote,
} from 'lucide-react';
import api from '@/utils/api';
import { useHospitalAuth } from '@/hooks/useHospitalAuth';

const C = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#06b6d4', '#a855f7'];

const seedArAging = [
  { bucket: '0-30 days', amount: 820 },
  { bucket: '31-60 days', amount: 540 },
  { bucket: '61-90 days', amount: 320 },
  { bucket: '90+ days', amount: 180 },
];

const seedCashFlow = [
  { month: 'Jan', inflow: 3820, outflow: 2980 },
  { month: 'Feb', inflow: 4010, outflow: 3050 },
  { month: 'Mar', inflow: 4180, outflow: 3120 },
  { month: 'Apr', inflow: 4390, outflow: 3180 },
  { month: 'May', inflow: 4620, outflow: 3240 },
];

const seedDeptMargin = [
  { dept: 'Cardiology', revenue: 920, margin: 42 },
  { dept: 'Orthopaedics', revenue: 780, margin: 38 },
  { dept: 'Oncology', revenue: 480, margin: 35 },
  { dept: 'General Surgery', revenue: 510, margin: 32 },
  { dept: 'Neurology', revenue: 580, margin: 36 },
  { dept: 'Radiology', revenue: 360, margin: 48 },
];

const seedSettlements = [
  { payer: 'Star Health TPA', amount: 420, status: 'Settled', date: '2025-05-28' },
  { payer: 'ICICI Lombard', amount: 280, status: 'Processing', date: '2025-05-27' },
  { payer: 'CGHS', amount: 156, status: 'Query Raised', date: '2025-05-26' },
  { payer: 'Corporate — TCS', amount: 340, status: 'Settled', date: '2025-05-25' },
];

function KPI({ label, value, sub, icon: Icon, color, trend }: {
  label: string; value: string; sub: string; icon: React.ElementType;
  color: string; trend?: 'up' | 'down';
}) {
  return (
    <Card className="border-0 shadow-sm hover:shadow-md transition-all">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground font-medium">{label}</p>
            <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
            <div className="flex items-center gap-1 mt-1">
              {trend === 'up' && <ArrowUpRight className="h-3 w-3 text-emerald-500" />}
              {trend === 'down' && <TrendingDown className="h-3 w-3 text-red-500" />}
              <p className="text-xs text-muted-foreground">{sub}</p>
            </div>
          </div>
          <div className={`p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800`}>
            <Icon className={`h-5 w-5 ${color}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function CFODashboard() {
  const { hospitalData } = useHospitalAuth();
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [arAging, setArAging] = useState(seedArAging);
  const [cashFlow, setCashFlow] = useState(seedCashFlow);
  const [deptMargin, setDeptMargin] = useState(seedDeptMargin);
  const [kpis, setKpis] = useState({
    cashPosition: 1240,
    arOutstanding: 1860,
    apOutstanding: 420,
    collectionEfficiency: 94.2,
    dso: 28,
    budgetUtilization: 87,
    claimsPending: 312,
    claimsSettledMtd: 1840,
  });

  useEffect(() => {
    (async () => {
      try {
        const [statsRes, finRes] = await Promise.allSettled([
          api.get('/hospital/dashboard/stats'),
          api.get('/hospital/cfo/financials'),
        ]);
        if (finRes.status === 'fulfilled') {
          const d = finRes.value.data?.data;
          if (d) {
            setKpis(prev => ({
              ...prev,
              cashPosition: d.cashPosition ?? prev.cashPosition,
              arOutstanding: d.arOutstanding ?? prev.arOutstanding,
              apOutstanding: d.apOutstanding ?? prev.apOutstanding,
              collectionEfficiency: d.collectionEfficiency ?? prev.collectionEfficiency,
              dso: d.dso ?? prev.dso,
              budgetUtilization: d.budgetUtilization ?? prev.budgetUtilization,
              claimsPending: d.claimsPending ?? prev.claimsPending,
              claimsSettledMtd: d.claimsSettledMtd ?? prev.claimsSettledMtd,
            }));
            if (d.arAging) setArAging(d.arAging.map((r: { bucket: string; amount: number }) => ({ bucket: r.bucket, amount: r.amount })));
            if (d.cashFlow) setCashFlow(d.cashFlow);
            if (d.deptMargin) setDeptMargin(d.deptMargin);
          }
        }
        if (statsRes.status === 'fulfilled') {
          setLastUpdated(new Date());
        }
      } catch { /* seed data */ }
    })();
  }, []);

  const netCash = cashFlow[cashFlow.length - 1]
    ? cashFlow[cashFlow.length - 1].inflow - cashFlow[cashFlow.length - 1].outflow
    : 0;

  return (
    <HospitalLayout title="CFO Dashboard" subtitle="Finance, Revenue Cycle & Treasury Command Centre">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white">
            <Banknote className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold">CFO Finance Command</h1>
            <p className="text-xs text-muted-foreground">
              {(hospitalData as { hospitalName?: string; name?: string })?.hospitalName || hospitalData?.name || 'Hospital'} · Updated {lastUpdated.toLocaleTimeString()}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-1" onClick={() => setLastUpdated(new Date())}>
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
          <Button size="sm" className="gap-1 bg-emerald-600 hover:bg-emerald-700">
            <Download className="h-3.5 w-3.5" /> MIS Export
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-4 mb-6">
        <KPI label="Cash Position" value={`₹${kpis.cashPosition}L`} sub="Treasury balance" icon={Wallet} color="text-emerald-600" trend="up" />
        <KPI label="AR Outstanding" value={`₹${kpis.arOutstanding}L`} sub={`DSO ${kpis.dso} days`} icon={Receipt} color="text-amber-600" />
        <KPI label="AP Outstanding" value={`₹${kpis.apOutstanding}L`} sub="Vendor payables" icon={CreditCard} color="text-blue-600" />
        <KPI label="Collection %" value={`${kpis.collectionEfficiency}%`} sub="MTD efficiency" icon={TrendingUp} color="text-teal-600" trend="up" />
        <KPI label="Budget Used" value={`${kpis.budgetUtilization}%`} sub="FY operational" icon={PieIcon} color="text-indigo-600" />
        <KPI label="Claims Pending" value={`₹${kpis.claimsPending}L`} sub="TPA / insurance" icon={Shield} color="text-orange-600" />
        <KPI label="Settled MTD" value={`₹${kpis.claimsSettledMtd}L`} sub="Insurance receipts" icon={CheckCircle2} color="text-green-600" trend="up" />
        <KPI label="Net Cash (May)" value={`₹${netCash}L`} sub="Inflow − outflow" icon={DollarSign} color="text-purple-600" trend="up" />
      </div>

      <Tabs defaultValue="treasury" className="space-y-5">
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="treasury">Treasury</TabsTrigger>
          <TabsTrigger value="receivables">Receivables</TabsTrigger>
          <TabsTrigger value="payers">Payer Settlements</TabsTrigger>
          <TabsTrigger value="margin">Department Margin</TabsTrigger>
        </TabsList>

        <TabsContent value="treasury" className="space-y-5">
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Cash Inflow vs Outflow (₹ Lakhs)</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={cashFlow}>
                  <defs>
                    <linearGradient id="inG" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#22c55e" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="outG" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Area type="monotone" dataKey="inflow" stroke="#22c55e" fill="url(#inG)" strokeWidth={2} name="Inflow" />
                  <Area type="monotone" dataKey="outflow" stroke="#ef4444" fill="url(#outG)" strokeWidth={2} name="Outflow" />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="receivables" className="space-y-5">
          <div className="grid lg:grid-cols-2 gap-5">
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">AR Aging (₹ Lakhs)</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={arAging}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="bucket" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="amount" fill="#6366f1" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Collection Health</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span>Collection efficiency</span>
                    <span className="font-semibold text-emerald-600">{kpis.collectionEfficiency}%</span>
                  </div>
                  <Progress value={kpis.collectionEfficiency} className="h-2" />
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span>Budget utilization</span>
                    <span className="font-semibold">{kpis.budgetUtilization}%</span>
                  </div>
                  <Progress value={kpis.budgetUtilization} className="h-2" />
                </div>
                <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm">
                  <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-amber-800">₹180L receivables aged 90+ days — escalation to billing HOD recommended.</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="payers" className="space-y-4">
          {seedSettlements.map(row => (
            <Card key={row.payer} className="border-0 shadow-sm">
              <CardContent className="p-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Building2 className="h-5 w-5 text-slate-400" />
                  <div>
                    <p className="font-medium">{row.payer}</p>
                    <p className="text-xs text-muted-foreground">{row.date}</p>
                  </div>
                </div>
                <p className="text-lg font-bold text-slate-800">₹{row.amount}L</p>
                <Badge variant="outline" className={
                  row.status === 'Settled' ? 'border-emerald-300 text-emerald-700 bg-emerald-50' :
                  row.status === 'Processing' ? 'border-blue-300 text-blue-700 bg-blue-50' :
                  'border-amber-300 text-amber-700 bg-amber-50'
                }>{row.status}</Badge>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="margin">
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <FileText className="h-4 w-4" /> Department Revenue & EBITDA Margin
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={deptMargin} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis dataKey="dept" type="category" width={100} tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="revenue" fill="#6366f1" name="Revenue (₹L)" radius={[0, 4, 4, 0]} />
                  <Bar dataKey="margin" fill="#22c55e" name="Margin %" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </HospitalLayout>
  );
}
