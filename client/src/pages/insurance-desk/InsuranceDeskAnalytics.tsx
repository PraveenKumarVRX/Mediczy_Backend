import { useEffect, useState, useCallback } from 'react';
import HospDeptLayout, { DeptNavSection } from '@/components/hosp-dept/HospDeptLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, Cell,
} from 'recharts';
import {
  ShieldCheck, ClipboardList, FileText, Building2, UserCheck,
  Search, BarChart3, Settings, HelpCircle, RefreshCw, Loader2, IndianRupee, Clock, AlertTriangle,
} from 'lucide-react';
import api from '@/utils/api';

import { navSections } from './navSections';

// Validated categorical palette (see dataviz skill) — fixed slot order, never cycled.
const SEQUENTIAL_BLUE = '#2a78d6';
const CATEGORICAL = ['#2a78d6', '#1baf7a', '#eda100'];

const formatCurrency = (amount?: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0, notation: 'compact' }).format(amount || 0);

interface AgingBucket { bucket: string; count: number; amount: number; }
interface TatByInsurer { insurer: string; avgHrs: number; totalClaims: number; }
interface TrendPoint { month: string; submitted: number; approved: number; rejected: number; queries: number; }

function StatTile({ icon: Icon, label, value, tone }: { icon: React.ElementType; label: string; value: string; tone: string }) {
  return (
    <Card>
      <CardContent className="pt-6 flex items-center gap-4">
        <div className={`p-3 rounded-xl ${tone}`}><Icon className="h-5 w-5" /></div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-xl font-bold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

const InsuranceDeskAnalytics = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [receivables, setReceivables] = useState({ approvedNotSettled: 0, settled: 0, pending: 0, total: 0 });
  const [agingBuckets, setAgingBuckets] = useState<AgingBucket[]>([]);
  const [avgTAT, setAvgTAT] = useState(0);
  const [tatByInsurer, setTatByInsurer] = useState<TatByInsurer[]>([]);
  const [trends, setTrends] = useState<{ queries: number; rejections: number; approvals: number }>({ queries: 0, rejections: 0, approvals: 0 });
  const [timeline, setTimeline] = useState<TrendPoint[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [receivablesRes, agingRes, tatRes, trendsRes] = await Promise.all([
        api.get('/hospital/insurance/revenue/receivables'),
        api.get('/hospital/insurance/reports/claims-aging'),
        api.get('/hospital/insurance/reports/tat'),
        api.get('/hospital/insurance/reports/query-rejection-trends'),
      ]);
      setReceivables(receivablesRes.data.receivables || { approvedNotSettled: 0, settled: 0, pending: 0, total: 0 });
      setAgingBuckets(agingRes.data.agingBuckets || []);
      setAvgTAT(tatRes.data.tatReport?.averageTAT || 0);
      // report/byInsurer is an array of { insurer, avgHrs, totalClaims } — not a map.
      setTatByInsurer(tatRes.data.tatReport?.byInsurer || tatRes.data.report || []);
      setTrends(trendsRes.data.trends || { queries: 0, rejections: 0, approvals: 0 });
      setTimeline(trendsRes.data.timeline || []);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Could not load analytics.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <HospDeptLayout deptKey="insurance-desk" deptName="Insurance Desk" badgeLabel="Ins. Desk"
      loginPath="/insurance-desk/login" DeptIcon={ShieldCheck} navSections={navSections}
      title="Analytics" subtitle="Claims trends and settlement stats" copilotModule="insurance">
      <div className="flex justify-end mb-3">
        <Button variant="outline" size="sm" className="gap-1" onClick={load}>
          <RefreshCw className="h-4 w-4" /> Refresh
        </Button>
      </div>
      {error && <p className="text-sm text-amber-600 mb-3">{error}</p>}
      {loading ? (
        <div className="h-64 flex items-center justify-center text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading analytics…
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatTile icon={IndianRupee} label="Approved, Not Settled" value={formatCurrency(receivables.approvedNotSettled)} tone="bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-300" />
            <StatTile icon={IndianRupee} label="Settled" value={formatCurrency(receivables.settled)} tone="bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-300" />
            <StatTile icon={IndianRupee} label="Pending Claims" value={formatCurrency(receivables.pending)} tone="bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-300" />
            <StatTile icon={Clock} label="Average TAT" value={`${avgTAT} days`} tone="bg-violet-50 text-violet-600 dark:bg-violet-950 dark:text-violet-300" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ChartCard title="Claims Aging (open claims)">
              {agingBuckets.length === 0 ? (
                <p className="text-sm text-muted-foreground h-48 flex items-center justify-center">No open claims to age.</p>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={agingBuckets} barGap={2}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" opacity={0.4} />
                    <XAxis dataKey="bucket" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip formatter={(v: number, name: string) => name === 'amount' ? formatCurrency(v) : v} />
                    <Bar dataKey="count" name="Claims" fill={SEQUENTIAL_BLUE} radius={[4, 4, 0, 0]} maxBarSize={48} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            <ChartCard title="Turnaround Time by Insurer">
              {tatByInsurer.length === 0 ? (
                <p className="text-sm text-muted-foreground h-48 flex items-center justify-center">No resolved claims yet.</p>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={tatByInsurer.map((t) => ({ ...t, avgDays: Math.round((t.avgHrs / 24) * 10) / 10 }))} barGap={2}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" opacity={0.4} />
                    <XAxis dataKey="insurer" fontSize={11} tickLine={false} axisLine={false} interval={0} angle={-15} textAnchor="end" height={50} />
                    <YAxis fontSize={12} tickLine={false} axisLine={false} unit="d" />
                    <Tooltip formatter={(v: number, name: string) => name === 'Avg TAT' ? `${v} days` : v} />
                    <Bar dataKey="avgDays" name="Avg TAT" radius={[4, 4, 0, 0]} maxBarSize={48}>
                      {tatByInsurer.map((_, i) => <Cell key={i} fill={CATEGORICAL[i % CATEGORICAL.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>
          </div>

          <ChartCard title="Query / Rejection / Approval Trend">
            {timeline.length === 0 ? (
              <div className="h-48 flex flex-col items-center justify-center text-muted-foreground">
                <AlertTriangle className="h-6 w-6 mb-2 opacity-40" />
                <p className="text-sm">No trend data for the selected period.</p>
                <p className="text-xs mt-1">
                  Lifetime: {trends.queries} queries · {trends.rejections} rejections · {trends.approvals} approvals
                </p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={timeline}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" opacity={0.4} />
                  <XAxis dataKey="month" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="queries" name="Queries" stroke={CATEGORICAL[0]} strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="rejected" name="Rejections" stroke={CATEGORICAL[1]} strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="approved" name="Approvals" stroke={CATEGORICAL[2]} strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
        </div>
      )}
    </HospDeptLayout>
  );
};

export default InsuranceDeskAnalytics;
