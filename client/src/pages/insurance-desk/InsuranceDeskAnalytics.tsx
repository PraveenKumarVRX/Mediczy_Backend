import { useEffect, useState, useCallback } from 'react';
import HospDeptLayout, { DeptNavSection } from '@/components/hosp-dept/HospDeptLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
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
const formatPercent = (value?: number) => `${Math.round((value || 0) * 1000) / 10}%`;

interface AgingBucket { bucket: string; count: number; amount: number; }
interface TatByInsurer { insurer: string; avgHrs: number; totalClaims: number; }
interface TrendPoint { month: string; submitted: number; approved: number; rejected: number; queries: number; }
interface PayerRcm {
  payer: string;
  claim_count: number;
  outstanding_amount: number | string;
  ar_0_30: number | string;
  ar_31_60: number | string;
  ar_61_90: number | string;
  ar_90_plus: number | string;
  cleanClaimRate: number;
  denialRate: number;
  collectionRate: number;
}

function StatTile({ icon: Icon, label, value, tone }: { icon: React.ComponentType<any>; label: string; value: string; tone: string }) {
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
  const [payerRcm, setPayerRcm] = useState<PayerRcm[]>([]);
  const [cockpit, setCockpit] = useState<any | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [receivablesRes, agingRes, tatRes, trendsRes, payerRcmRes, cockpitRes] = await Promise.all([
        api.get('/hospital/insurance/revenue/receivables'),
        api.get('/hospital/insurance/reports/claims-aging'),
        api.get('/hospital/insurance/reports/tat'),
        api.get('/hospital/insurance/reports/query-rejection-trends'),
        api.get('/hospital/insurance/rcm/payer-analytics'),
        api.get('/hospital/insurance/rcm/cockpit').catch(() => null),
      ]);
      setReceivables(receivablesRes.data.receivables || { approvedNotSettled: 0, settled: 0, pending: 0, total: 0 });
      setAgingBuckets(agingRes.data.agingBuckets || []);
      setAvgTAT(tatRes.data.tatReport?.averageTAT || 0);
      // report/byInsurer is an array of { insurer, avgHrs, totalClaims } — not a map.
      setTatByInsurer(tatRes.data.tatReport?.byInsurer || tatRes.data.report || []);
      setTrends(trendsRes.data.trends || { queries: 0, rejections: 0, approvals: 0 });
      setTimeline(trendsRes.data.timeline || []);
      setPayerRcm(payerRcmRes.data.payers || []);
      setCockpit(cockpitRes?.data || null);
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
          {cockpit?.kpis && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
                <StatTile icon={Clock} label="Days in AR" value={`${cockpit.kpis.daysInAr} d`} tone="bg-violet-50 text-violet-600 dark:bg-violet-950 dark:text-violet-300" />
                <StatTile icon={IndianRupee} label="Outstanding" value={formatCurrency(cockpit.kpis.outstandingAmount)} tone="bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-300" />
                <StatTile icon={BarChart3} label="Collection" value={formatPercent(cockpit.kpis.collectionRate)} tone="bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-300" />
                <StatTile icon={AlertTriangle} label="Denial Rate" value={formatPercent(cockpit.kpis.denialRate)} tone="bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-300" />
                <StatTile icon={AlertTriangle} label="Est. Leakage" value={formatCurrency(cockpit.kpis.estimatedLeakage)} tone="bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-300" />
                <StatTile icon={ClipboardList} label="Open AR Items" value={String(cockpit.kpis.openArItems || 0)} tone="bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-300" />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <ChartCard title="AR Aging (outstanding by bucket)">
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={Object.entries(cockpit.agingBuckets || {}).map(([bucket, amount]) => ({ bucket, amount: Number(amount) }))} barGap={2}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" opacity={0.4} />
                      <XAxis dataKey="bucket" fontSize={12} tickLine={false} axisLine={false} />
                      <YAxis fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v: number) => formatCurrency(v)} width={70} />
                      <Tooltip formatter={(v: number) => formatCurrency(v)} />
                      <Bar dataKey="amount" name="Outstanding" fill={SEQUENTIAL_BLUE} radius={[4, 4, 0, 0]} maxBarSize={48} />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>

                <ChartCard title="Denial Pareto (top reasons by amount)">
                  {(!cockpit.denialPareto || cockpit.denialPareto.length === 0) ? (
                    <p className="text-sm text-muted-foreground h-48 flex items-center justify-center">No denials in the period.</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow><TableHead>Code</TableHead><TableHead>Reason</TableHead><TableHead className="text-right">Count</TableHead><TableHead className="text-right">Denied</TableHead><TableHead className="text-right">Cum %</TableHead></TableRow>
                      </TableHeader>
                      <TableBody>
                        {cockpit.denialPareto.map((d: any) => (
                          <TableRow key={d.code}>
                            <TableCell className="font-medium">{d.code}</TableCell>
                            <TableCell className="max-w-[180px] truncate" title={d.code_description || d.sample_reason || ''}>{d.code_description || d.sample_reason || '—'}</TableCell>
                            <TableCell className="text-right">{d.denial_count}</TableCell>
                            <TableCell className="text-right">{formatCurrency(Number(d.denied_amount))}</TableCell>
                            <TableCell className="text-right">{d.cumulativePct}%</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </ChartCard>
              </div>
            </>
          )}

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

          <ChartCard title="Payer-wise RCM performance & A/R ageing">
            {payerRcm.length === 0 ? (
              <p className="text-sm text-muted-foreground h-32 flex items-center justify-center">No payer claims in the current 90-day reporting period.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Payer</TableHead><TableHead className="text-right">Claims</TableHead><TableHead className="text-right">Outstanding</TableHead>
                    <TableHead className="text-right">0–30</TableHead><TableHead className="text-right">31–60</TableHead><TableHead className="text-right">61–90</TableHead><TableHead className="text-right">90+</TableHead>
                    <TableHead className="text-right">Clean</TableHead><TableHead className="text-right">Denial</TableHead><TableHead className="text-right">Collection</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>{payerRcm.map((payer) => <TableRow key={payer.payer}>
                    <TableCell className="font-medium whitespace-nowrap">{payer.payer}</TableCell>
                    <TableCell className="text-right">{payer.claim_count}</TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(Number(payer.outstanding_amount))}</TableCell>
                    <TableCell className="text-right">{formatCurrency(Number(payer.ar_0_30))}</TableCell>
                    <TableCell className="text-right">{formatCurrency(Number(payer.ar_31_60))}</TableCell>
                    <TableCell className="text-right">{formatCurrency(Number(payer.ar_61_90))}</TableCell>
                    <TableCell className="text-right text-amber-700">{formatCurrency(Number(payer.ar_90_plus))}</TableCell>
                    <TableCell className="text-right">{formatPercent(payer.cleanClaimRate)}</TableCell>
                    <TableCell className="text-right">{formatPercent(payer.denialRate)}</TableCell>
                    <TableCell className="text-right">{formatPercent(payer.collectionRate)}</TableCell>
                  </TableRow>)}</TableBody>
                </Table>
              </div>
            )}
          </ChartCard>
        </div>
      )}
    </HospDeptLayout>
  );
};

export default InsuranceDeskAnalytics;
