/**
 * CFO Dashboard — Chief Financial Officer
 * Revenue cycle, cash flow, AR, payer mix, department margin
 */
import { useState, useEffect } from 'react';
import HospitalLayout from '@/components/hospital/HospitalLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { PlaceholderBanner } from '@/components/ui/placeholder-banner';
import {
  ResponsiveContainer, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';
import {
  DollarSign, TrendingUp, Wallet, Receipt, RefreshCw, Download,
  CheckCircle2, PieChart as PieIcon, Shield, FileText, Banknote, Loader2,
} from 'lucide-react';
import api from '@/utils/api';
import { useHospitalAuth } from '@/hooks/useHospitalAuth';

// WP-0.3c: this dashboard used to render seed AR aging / cash flow / department
// margin / payer settlement arrays that were shown regardless of what the API
// returned (the API itself fabricated apOutstanding/dso/budgetUtilization/
// cashFlow/deptMargin too — see server/routes/hospital/executive-dashboard.route.js).
// Those fields have no backing table (no expense ledger / chart of accounts /
// vendor-payables table exists yet), so the server now returns them as honest
// nulls and this page shows a placeholder instead of a fabricated number.

interface ArAgingRow { bucket: string; amount: number }
interface RevenueByModeRow { payment_method: string; total: string; cnt: number }

interface CfoData {
  cashPosition: number | null;
  arOutstanding: number | null;
  collectionEfficiency: number | null;
  claimsPending: number | null;
  claimsSettledMtd: number | null;
  arAging: ArAgingRow[];
  revenueByMode: RevenueByModeRow[];
  apOutstanding: number | null;
  dso: number | null;
  budgetUtilization: number | null;
  cashFlow: unknown;
  deptMargin: unknown;
  payerSettlements: unknown;
}

function KPI({ label, value, sub, icon: Icon, color }: {
  label: string; value: string; sub: string; icon: React.ComponentType<any>; color: string;
}) {
  return (
    <Card className="border-0 shadow-sm hover:shadow-md transition-all">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground font-medium">{label}</p>
            <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
            <p className="text-xs text-muted-foreground mt-1">{sub}</p>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800">
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
  const [data, setData] = useState<CfoData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const finRes = await api.get('/hospital/cfo/financials');
      setData(finRes.data?.data ?? null);
      setLastUpdated(new Date());
    } catch (err: unknown) {
      const message = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
        : undefined;
      setError(message || 'Failed to load CFO dashboard data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const fmt = (n: number | null | undefined) => (n == null ? '—' : `₹${n}L`);

  return (
    <HospitalLayout title="CFO Dashboard" subtitle="Finance & Revenue Cycle Command Centre">
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
          <Button variant="outline" size="sm" className="gap-1" onClick={load}>
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
          <Button size="sm" className="gap-1 bg-emerald-600 hover:bg-emerald-700" disabled>
            <Download className="h-3.5 w-3.5" /> MIS Export
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24"><Loader2 className="h-8 w-8 animate-spin text-emerald-600" /></div>
      ) : error ? (
        <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 mb-6 flex items-center justify-between">
          <span>{error}</span>
          <Button size="sm" variant="outline" onClick={load}>Retry</Button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
            <KPI label="Cash Position" value={fmt(data?.cashPosition)} sub="Collections, last 30d" icon={Wallet} color="text-emerald-600" />
            <KPI label="AR Outstanding" value={fmt(data?.arOutstanding)} sub="Open invoices" icon={Receipt} color="text-amber-600" />
            <KPI label="Collection %" value={data?.collectionEfficiency != null ? `${data.collectionEfficiency}%` : '—'} sub="Last 30d efficiency" icon={TrendingUp} color="text-teal-600" />
            <KPI label="Claims Pending" value={fmt(data?.claimsPending)} sub="TPA / insurance" icon={Shield} color="text-orange-600" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
            <KPI label="Settled MTD" value={fmt(data?.claimsSettledMtd)} sub="Insurance receipts" icon={CheckCircle2} color="text-green-600" />
            <KPI label="AP Outstanding" value="—" sub="Not tracked yet" icon={DollarSign} color="text-slate-400" />
            <KPI label="Budget Used" value="—" sub="Not tracked yet" icon={PieIcon} color="text-slate-400" />
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
                  <CardTitle className="text-sm font-semibold">Cash Inflow vs Outflow</CardTitle>
                </CardHeader>
                <CardContent>
                  <PlaceholderBanner
                    title="Cash flow trend isn't tracked yet"
                    reason="Monthly inflow/outflow needs an expense ledger, which doesn't exist in this schema yet."
                  />
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
                    {data?.arAging && data.arAging.some((r) => r.amount > 0) ? (
                      <ResponsiveContainer width="100%" height={240}>
                        <BarChart data={data.arAging}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                          <XAxis dataKey="bucket" tick={{ fontSize: 10 }} />
                          <YAxis tick={{ fontSize: 11 }} />
                          <Tooltip />
                          <Bar dataKey="amount" fill="#6366f1" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <p className="text-sm text-muted-foreground py-10 text-center">No outstanding receivables.</p>
                    )}
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
                        <span className="font-semibold text-emerald-600">{data?.collectionEfficiency != null ? `${data.collectionEfficiency}%` : '—'}</span>
                      </div>
                      <Progress value={data?.collectionEfficiency ?? 0} className="h-2" />
                    </div>
                    <PlaceholderBanner
                      title="Budget utilization isn't tracked yet"
                      reason="Needs an approved-budget figure per period, which doesn't exist in this schema yet."
                    />
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="payers" className="space-y-4">
              <Card className="border-0 shadow-sm">
                <CardContent className="pt-5">
                  <PlaceholderBanner
                    title="Per-payer settlement tracking isn't wired yet"
                    reason="Needs a payer/settlement view over insurance_claims that doesn't exist yet — claims data is aggregated by status only today (see Claims Pending / Settled MTD above)."
                  />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="margin">
              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <FileText className="h-4 w-4" /> Department Revenue & Margin
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <PlaceholderBanner
                    title="Department margin isn't tracked yet"
                    reason="Margin needs a per-department expense allocation that doesn't exist in this schema yet."
                  />
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      )}
    </HospitalLayout>
  );
}
