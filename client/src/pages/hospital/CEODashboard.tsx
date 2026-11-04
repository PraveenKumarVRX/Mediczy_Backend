/**
 * CEO Dashboard — Hospital Chief Executive Officer
 * Financial command center + strategic intelligence
 */

import { useState, useEffect, useCallback } from 'react';
import HospitalLayout from '@/components/hospital/HospitalLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PlaceholderBanner } from '@/components/ui/placeholder-banner';
import {
  ResponsiveContainer, AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, RadialBarChart, RadialBar,
} from 'recharts';
import {
  TrendingUp, DollarSign, Users, Bed, Activity,
  Target, Download,
  BarChart3, ArrowUpRight, Zap, Stethoscope, Heart, Briefcase,
  RefreshCw, Loader2,
} from 'lucide-react';
import api from '@/utils/api';
import { useHospitalAuth } from '@/hooks/useHospitalAuth';

// WP-0.3c: this dashboard used to render a 12-month revenue/expense/target trend, department revenue
// breakdown, patient volume trend, "strategic initiatives" progress, NABH/JCI/AERB/CDSCO/Fire-NOC
// compliance scores, and "executive alerts" (including a fabricated insurance settlement notification)
// — all static seed data shown as if live, with real API responses either ignored or only partially
// applied. Revenue trend, ALOS, bed occupancy, OPD/IPD/ER volume and MTD surgeries are now real
// (server/services/hospital-billing.service.js's getCeoDashboard()). Department revenue, strategic
// initiatives, compliance scores and executive alerts have no backing data source in this schema and
// are shown as honest placeholders rather than invented — building those out is a separate feature,
// not a "remove invented data" fix.

const C = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#06b6d4', '#a855f7', '#ec4899', '#84cc16'];

interface RevenueTrendRow { month: string; revenue: number }
interface VolumeRow { month: string; opd: number; ipd: number; er: number }
interface PayerMixRow { name: string; value: number }

interface StatsData {
  opdToday: number;
  ipdCensus: number;
  bedOccupancy: number;
  totalBeds: number;
  occupiedBeds: number;
}

interface CeoFinData {
  monthlyRevenue: number | null;
  revenueTrend: RevenueTrendRow[];
  alos: number | null;
  volume: VolumeRow[];
  surgeriesMtd: number;
  payerMix: PayerMixRow[] | null;
  revenueTarget: number | null;
  ebitdaMargin: number | null;
  arpob: number | null;
}

const seedPayerMix: PayerMixRow[] = [
  { name: 'Insurance/TPA', value: 38 },
  { name: 'Corporate', value: 22 },
  { name: 'Govt Schemes', value: 18 },
  { name: 'Self Pay', value: 22 },
];

function KPI({ label, value, sub, icon: Icon, color, up }: {
  label: string; value: string; sub: string; icon: React.ComponentType<any>; color: string; up?: boolean;
}) {
  return (
    <Card className="hover:shadow-lg transition-all duration-200 border-0 shadow-sm">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground font-medium truncate">{label}</p>
            <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
              {up && <ArrowUpRight className="h-3 w-3 text-emerald-500 shrink-0" />}
              {sub}
            </p>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 shrink-0 ml-3">
            <Icon className={`h-5 w-5 ${color}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function CEODashboard() {
  const { hospitalData } = useHospitalAuth();
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [stats, setStats] = useState<StatsData | null>(null);
  const [fin, setFin] = useState<CeoFinData | null>(null);
  const [payerMixIsSample, setPayerMixIsSample] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [statsRes, finRes] = await Promise.allSettled([
      api.get('/hospital/dashboard/stats'),
      api.get('/hospital/ceo/financials'),
    ]);

    if (statsRes.status === 'fulfilled') {
      const d = statsRes.value.data;
      setStats({
        opdToday: d.todayOPD ?? 0,
        ipdCensus: d.totalPatients ?? 0,
        bedOccupancy: d.bedOccupancy ?? 0,
        totalBeds: d.totalBeds ?? 0,
        occupiedBeds: d.occupiedBeds ?? 0,
      });
    }
    if (finRes.status === 'fulfilled') {
      const f = finRes.value.data?.data ?? finRes.value.data;
      setFin({
        monthlyRevenue: f?.monthlyRevenue ?? null,
        revenueTrend: Array.isArray(f?.revenueTrend) ? f.revenueTrend : [],
        alos: f?.alos ?? null,
        volume: Array.isArray(f?.volume) ? f.volume : [],
        surgeriesMtd: f?.surgeriesMtd ?? 0,
        payerMix: Array.isArray(f?.payerMix) && f.payerMix.length > 0 ? f.payerMix : null,
        revenueTarget: f?.revenueTarget ?? null,
        ebitdaMargin: f?.ebitdaMargin ?? null,
        arpob: f?.arpob ?? null,
      });
      setPayerMixIsSample(!(Array.isArray(f?.payerMix) && f.payerMix.length > 0));
    }
    setError(statsRes.status === 'rejected' && finRes.status === 'rejected' ? 'Failed to load CEO dashboard data' : null);
    setLastUpdated(new Date());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const monthlyRevenue = fin?.monthlyRevenue ?? null;
  const revenueTarget = fin?.revenueTarget ?? null;
  const achievementPct = monthlyRevenue != null && revenueTarget != null ? Math.round((monthlyRevenue / revenueTarget) * 100) : null;
  const payerMix = fin?.payerMix ?? seedPayerMix;
  const latestVolume = fin?.volume && fin.volume.length > 0 ? fin.volume[fin.volume.length - 1] : null;

  return (
    <HospitalLayout title="CEO Dashboard" subtitle="Executive Financial & Strategic Command Centre">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white">
            <Briefcase className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold">CEO Command Centre</h1>
            <p className="text-xs text-muted-foreground">
              {hospitalData?.name || 'Hospital'} · Last updated {lastUpdated.toLocaleTimeString()}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" className="gap-1" onClick={load}>
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
          <Button size="sm" className="gap-1 bg-emerald-600 hover:bg-emerald-700" disabled>
            <Download className="h-3.5 w-3.5" /> Board Report
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24"><Loader2 className="h-8 w-8 animate-spin text-indigo-600" /></div>
      ) : error ? (
        <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 mb-6 flex items-center justify-between">
          <span>{error}</span>
          <Button size="sm" variant="outline" onClick={load}>Retry</Button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-4 mb-6">
            <KPI label="Monthly Revenue" value={monthlyRevenue != null ? `₹${monthlyRevenue}L` : '—'} sub={achievementPct == null ? 'No revenue target set' : `${achievementPct}% of target`} icon={DollarSign} color="text-emerald-600" up={monthlyRevenue != null} />
            <KPI label="EBITDA Margin" value="—" sub="Not tracked yet" icon={TrendingUp} color="text-slate-400" />
            <KPI label="Bed Occupancy" value={`${stats?.bedOccupancy ?? 0}%`} sub={`${stats?.occupiedBeds ?? 0} / ${stats?.totalBeds ?? 0} beds`} icon={Bed} color="text-blue-600" />
            <KPI label="ARPOB/Day" value="—" sub="Not tracked yet" icon={Target} color="text-slate-400" />
            <KPI label="OPD Today" value={String(stats?.opdToday ?? 0)} sub="Checked in today" icon={Users} color="text-teal-600" />
            <KPI label="ALOS" value={fin?.alos != null ? `${fin.alos}d` : '—'} sub="Last 5 months, discharged" icon={Activity} color="text-amber-600" />
          </div>

          <Tabs defaultValue="command" className="space-y-5">
            <TabsList className="flex flex-wrap gap-1 h-auto">
              <TabsTrigger value="command">Command</TabsTrigger>
              <TabsTrigger value="volume">Volume & Mix</TabsTrigger>
              <TabsTrigger value="strategy">Strategy</TabsTrigger>
            </TabsList>

            <TabsContent value="command" className="space-y-5">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                <Card className="border-0 shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <Target className="h-4 w-4 text-indigo-500" /> Revenue vs Target
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-center py-4">
                      <div className="relative w-40 h-40">
                        <RadialBarChart
                          width={160} height={160}
                          cx={80} cy={80}
                          innerRadius={50} outerRadius={70}
                          startAngle={180} endAngle={0}
                          data={[{ value: achievementPct ?? 0, fill: (achievementPct ?? 0) >= 100 ? '#22c55e' : '#6366f1' }]}>
                          <RadialBar dataKey="value" background={{ fill: '#f1f5f9' }} cornerRadius={6} />
                        </RadialBarChart>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                          <span className="text-2xl font-bold text-indigo-600">{achievementPct == null ? '—' : `${achievementPct}%`}</span>
                          <span className="text-xs text-muted-foreground">{achievementPct == null ? 'no target set' : 'achieved'}</span>
                        </div>
                      </div>
                    </div>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between"><span className="text-muted-foreground">Actual</span><span className="font-semibold text-emerald-600">{monthlyRevenue != null ? `₹${monthlyRevenue}L` : '—'}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Target</span><span className="font-semibold">{revenueTarget != null ? `₹${revenueTarget}L` : '—'}</span></div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-0 shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      Payer Mix
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {payerMixIsSample && (
                      <PlaceholderBanner reason="Payer-category billing data is not yet captured; these figures are illustrative." />
                    )}
                    <ResponsiveContainer width="100%" height={150}>
                      <PieChart>
                        <Pie data={payerMix} dataKey="value" cx="50%" cy="50%" outerRadius={60} paddingAngle={3}>
                          {payerMix.map((_, i) => <Cell key={i} fill={C[i]} />)}
                        </Pie>
                        <Tooltip formatter={(v: number) => `${v}%`} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="grid grid-cols-2 gap-1 mt-2">
                      {payerMix.map((p, i) => (
                        <div key={p.name} className="flex items-center gap-1.5 text-xs">
                          <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: C[i] }} />
                          <span className="text-muted-foreground truncate">{p.name}</span>
                          <span className="font-semibold ml-auto">{p.value}%</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-0 shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <Zap className="h-4 w-4 text-amber-500" /> Executive Alerts
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <PlaceholderBanner
                      title="Executive alerts aren't wired here yet"
                      reason="Needs a notifications/events feed across inventory, claims and occupancy that doesn't exist yet."
                    />
                  </CardContent>
                </Card>
              </div>

              <Card className="border-0 shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-indigo-500" /> Revenue Trend (₹ Lakhs)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {!fin?.revenueTrend || fin.revenueTrend.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-10 text-center">No completed payments recorded yet.</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={260}>
                      <AreaChart data={fin.revenueTrend} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.15} />
                            <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip formatter={(v: number) => [`₹${v}L`, 'Revenue']} />
                        <Legend />
                        <Area type="monotone" dataKey="revenue" stroke="#6366f1" fill="url(#revGrad)" strokeWidth={2.5} name="Revenue" />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">Department Revenue Contribution</CardTitle>
                </CardHeader>
                <CardContent>
                  <PlaceholderBanner
                    title="Per-department revenue isn't tracked yet"
                    reason="Invoices aren't tagged by department in the current schema."
                  />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="volume" className="space-y-5">
              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">Patient Volume Trends (12 Months)</CardTitle>
                </CardHeader>
                <CardContent>
                  {!fin?.volume || fin.volume.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-10 text-center">No OPD, IPD or ER activity recorded yet.</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={280}>
                      <AreaChart data={fin.volume} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                        <defs>
                          {['#6366f1', '#22c55e', '#f59e0b'].map((c, i) => (
                            <linearGradient key={i} id={`vg${i}`} x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor={c} stopOpacity={0.15} />
                              <stop offset="95%" stopColor={c} stopOpacity={0} />
                            </linearGradient>
                          ))}
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                        <Tooltip />
                        <Legend />
                        <Area type="monotone" dataKey="opd" stroke="#6366f1" fill="url(#vg0)" strokeWidth={2.5} name="OPD" />
                        <Area type="monotone" dataKey="ipd" stroke="#22c55e" fill="url(#vg1)" strokeWidth={2} name="IPD" />
                        <Area type="monotone" dataKey="er" stroke="#f59e0b" fill="url(#vg2)" strokeWidth={2} name="Emergency" />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: 'OPD (this month)', value: String(latestVolume?.opd ?? 0), icon: Users, color: 'text-indigo-600' },
                  { label: 'IPD Admissions', value: String(latestVolume?.ipd ?? 0), icon: Bed, color: 'text-emerald-600' },
                  { label: 'Surgeries (MTD)', value: String(fin?.surgeriesMtd ?? 0), icon: Stethoscope, color: 'text-purple-600' },
                  { label: 'ER Attendances', value: String(latestVolume?.er ?? 0), icon: Heart, color: 'text-red-500' },
                ].map((k) => (
                  <Card key={k.label} className="border-0 shadow-sm">
                    <CardContent className="p-4 flex items-start gap-3">
                      <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800">
                        <k.icon className={`h-4 w-4 ${k.color}`} />
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">{k.label}</p>
                        <p className={`text-xl font-bold ${k.color}`}>{k.value}</p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="strategy" className="space-y-5">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <Card className="border-0 shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <Target className="h-4 w-4 text-indigo-500" /> Strategic Initiatives
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <PlaceholderBanner
                      title="Strategic initiative tracking isn't wired here yet"
                      reason="Needs a project/initiative tracker that doesn't exist yet — a real feature to build, not just data to reconnect."
                    />
                  </CardContent>
                </Card>

                <Card className="border-0 shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      Accreditation & Compliance Status
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <PlaceholderBanner
                      title="Compliance status isn't tracked in-app yet"
                      reason="Showing fabricated NABH/JCI/AERB/CDSCO figures here would be a regulatory-accuracy risk — this needs a real compliance-tracking module before it can be shown."
                    />
                  </CardContent>
                </Card>
              </div>

              <Card className="border-0 shadow-sm bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-950/30 dark:to-purple-950/30">
                <CardContent className="p-5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <h3 className="font-semibold text-base">Board & Investor Reports</h3>
                      <p className="text-sm text-muted-foreground mt-0.5">Report generation isn't wired to a backend yet.</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {['Monthly Board Pack', 'Financial Summary', 'Ops Review', 'Quality Report'].map((r) => (
                        <Button key={r} variant="outline" size="sm" className="gap-1.5 bg-white dark:bg-slate-900" disabled>
                          <Download className="h-3.5 w-3.5" /> {r}
                        </Button>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      )}
    </HospitalLayout>
  );
}
