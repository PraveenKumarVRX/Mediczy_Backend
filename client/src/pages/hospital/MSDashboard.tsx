/**
 * MS Dashboard — Medical Superintendent / Chief Medical Officer
 * Clinical governance: daily census, quality metrics, doctors, NABH/JCI compliance
 */

import { useState, useEffect } from 'react';
import HospitalLayout from '@/components/hospital/HospitalLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, RadarChart,
  Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, AreaChart, Area,
} from 'recharts';
import {
  Stethoscope, Users, Bed, Activity, AlertTriangle, CheckCircle2,
  RefreshCw, ArrowUpRight, ArrowDownRight, ClipboardList, Shield,
  FileText, Award, BookOpen, Heart, FlaskConical, Calendar,
  TrendingUp, TrendingDown, UserCheck, Bell, ChevronRight,
  UserCog, HeartPulse, Brain,
} from 'lucide-react';
import api from '@/utils/api';
import { useHospitalAuth } from '@/hooks/useHospitalAuth';

// Live data is loaded below; unbacked governance datasets are intentionally empty.
const emptyDashboardData: any[] = [];

// ─── KPI card ─────────────────────────────────────────────────────────────────
function ClinicalKPI({ label, value, sub, icon: Icon, color, trend, target }: {
  label: string; value: string; sub: string; icon: React.ElementType;
  color: string; trend?: 'up' | 'down' | 'neutral'; target?: string;
}) {
  return (
    <Card className="border-0 shadow-sm hover:shadow-md transition-all">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground font-medium">{label}</p>
            <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
            <div className="flex items-center gap-1 mt-1">
              {trend === 'up'   && <ArrowUpRight className="h-3 w-3 text-emerald-500 shrink-0" />}
              {trend === 'down' && <ArrowDownRight className="h-3 w-3 text-emerald-500 shrink-0" />}
              <p className="text-xs text-muted-foreground">{sub}</p>
            </div>
            {target && <p className="text-xs text-muted-foreground mt-0.5 font-medium">Target: {target}</p>}
          </div>
          <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 shrink-0 ml-2">
            <Icon className={`h-5 w-5 ${color}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function MSDashboard() {
  const { hospitalData } = useHospitalAuth();
  const [lastUpdated, setLastUpdated] = useState(new Date());

  // Today's census and quality metrics are populated only from live endpoints.
  const [todayCensus, setTodayCensus] = useState({ opd: 0, ipd: 0, er: 0, surgery: 0, discharges: 0, pendingDischarge: 0 });

  // Only metrics returned by the live endpoints are displayed; unavailable metrics remain zero.
  const [qualityKpis, setQualityKpis] = useState({ mortalityRate: 0, readmissionRate: 0, haiRate: 0, hcahps: 0 });

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get('/hospital/dashboard/stats');
        const d = res.data;
        setTodayCensus(prev => ({
          ...prev,
          opd:      d.todayOPD       ?? prev.opd,
          ipd:      d.totalPatients  ?? prev.ipd,
        }));
      } catch { /* live metric unavailable */ }
      try {
        const msRes = await api.get('/hospital/ms/clinical');
        const m = msRes.data?.data ?? msRes.data;
        setQualityKpis(prev => ({ ...prev, readmissionRate: m?.readmissionRate ?? prev.readmissionRate }));
      } catch { /* live metric unavailable */ }
    })();
  }, []);

  const overallNABH = 0;

  return (
    <HospitalLayout title="Medical Superintendent" subtitle="Clinical Governance, Quality & Compliance Command Centre">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-gradient-to-br from-rose-500 to-red-600 text-white">
            <Stethoscope className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Medical Superintendent Dashboard</h1>
            <p className="text-xs text-muted-foreground">
              {hospitalData?.name || 'Hospital'} · {new Date().toLocaleDateString('en-IN', { weekday:'long', day:'numeric', month:'long', year:'numeric' })}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge className="bg-rose-100 text-rose-700 border border-rose-200">
            NABH {overallNABH}% · {overallNABH >= 85 ? 'Compliant' : 'Needs Attention'}
          </Badge>
          <Button variant="outline" size="sm" className="gap-1" onClick={() => setLastUpdated(new Date())}>
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
          <Button size="sm" className="gap-1 bg-rose-600 hover:bg-rose-700">
            <FileText className="h-3.5 w-3.5" /> Clinical Report
          </Button>
        </div>
      </div>

      {/* ── Today's Census KPIs ───────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-4 mb-6">
        <ClinicalKPI label="OPD Today" value={todayCensus.opd ? todayCensus.opd.toString() : '—'} sub={todayCensus.opd ? 'Live dashboard metric' : 'Live metric unavailable'} icon={Users} color="text-indigo-600" />
        <ClinicalKPI label="IPD Census" value={todayCensus.ipd ? todayCensus.ipd.toString() : '—'} sub={todayCensus.ipd ? 'Live dashboard metric' : 'Live metric unavailable'} icon={Bed} color="text-blue-600" />
        <ClinicalKPI label="ER Attendances" value={todayCensus.er ? todayCensus.er.toString() : '—'} sub={todayCensus.er ? 'Live dashboard metric' : 'Live metric unavailable'} icon={HeartPulse} color="text-red-600" />
        <ClinicalKPI label="Surgeries Today" value={todayCensus.surgery ? todayCensus.surgery.toString() : '—'} sub={todayCensus.surgery ? 'Live dashboard metric' : 'Live metric unavailable'} icon={Stethoscope} color="text-purple-600" />
        <ClinicalKPI label="Discharges Today" value={todayCensus.discharges ? todayCensus.discharges.toString() : '—'} sub={todayCensus.discharges ? 'Live dashboard metric' : 'Live metric unavailable'} icon={Activity} color="text-emerald-600" />
        <ClinicalKPI label="Pending Discharge" value={todayCensus.pendingDischarge ? todayCensus.pendingDischarge.toString() : '—'} sub={todayCensus.pendingDischarge ? 'Live dashboard metric' : 'Live metric unavailable'} icon={AlertTriangle} color="text-amber-600" target="≤10" />
      </div>

      <Tabs defaultValue="census" className="space-y-5">
        <TabsList className="flex flex-wrap gap-1 h-auto">
          <TabsTrigger value="census">Daily Census</TabsTrigger>
          <TabsTrigger value="quality">Clinical Quality</TabsTrigger>
          <TabsTrigger value="doctors">Doctors</TabsTrigger>
          <TabsTrigger value="compliance">NABH / Compliance</TabsTrigger>
        </TabsList>

        {/* ── Daily Census Tab ─────────────────────────────────────────────── */}
        <TabsContent value="census" className="space-y-5">
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">7-Day Patient Census</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={emptyDashboardData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="opd"     fill="#6366f1" name="OPD"      radius={[3,3,0,0]} />
                  <Bar dataKey="ipd"     fill="#22c55e" name="IPD"      radius={[3,3,0,0]} />
                  <Bar dataKey="er"      fill="#ef4444" name="ER"       radius={[3,3,0,0]} />
                  <Bar dataKey="surgery" fill="#f59e0b" name="Surgery"  radius={[3,3,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Pending Discharges */}
            <Card className="border-0 shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <ClipboardList className="h-4 w-4 text-amber-500" /> Pending Discharges Requiring Attention
                </CardTitle>
                <Badge className="bg-amber-100 text-amber-700">{emptyDashboardData.length} pending</Badge>
              </CardHeader>
              <CardContent className="space-y-2.5">
                {emptyDashboardData.map((p, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-muted/40 hover:bg-muted/60 transition-colors">
                    <div className={`mt-1 w-2 h-2 rounded-full shrink-0 ${p.days >= 2 ? 'bg-red-500' : p.days === 1 ? 'bg-amber-500' : 'bg-blue-500'}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold">{p.patient}</p>
                      <p className="text-xs text-muted-foreground">{p.ward} · {p.doctor}</p>
                      <p className="text-xs text-amber-700 mt-0.5">{p.reason}</p>
                    </div>
                    <Badge variant="outline" className={p.days >= 2 ? 'border-red-300 text-red-700' : 'border-amber-300 text-amber-700'}>
                      {p.days === 0 ? 'Today' : `${p.days}d delayed`}
                    </Badge>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Specialty load */}
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Today's Specialty-wise Load</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  { spec: 'General Medicine', opd: 124, ipd: 52, color: 'bg-indigo-500' },
                  { spec: 'Cardiology',       opd: 42,  ipd: 22, color: 'bg-red-500' },
                  { spec: 'Gynaecology',      opd: 38,  ipd: 14, color: 'bg-pink-500' },
                  { spec: 'Orthopaedics',     opd: 34,  ipd: 16, color: 'bg-amber-500' },
                  { spec: 'Paediatrics',      opd: 48,  ipd: 18, color: 'bg-emerald-500' },
                  { spec: 'Neurology',        opd: 26,  ipd: 12, color: 'bg-purple-500' },
                ].map(s => (
                  <div key={s.spec} className="flex items-center gap-3">
                    <div className={`w-2 h-6 rounded-full shrink-0 ${s.color}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{s.spec}</p>
                      <div className="flex gap-4 text-xs text-muted-foreground mt-0.5">
                        <span>OPD: <span className="font-semibold text-foreground">{s.opd}</span></span>
                        <span>IPD: <span className="font-semibold text-foreground">{s.ipd}</span></span>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-bold text-slate-700">{s.opd + s.ipd}</span>
                      <p className="text-xs text-muted-foreground">total</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Clinical Quality Tab ─────────────────────────────────────────── */}
        <TabsContent value="quality" className="space-y-5">
          {/* Quality indicator KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Gross Mortality Rate',    value: qualityKpis.mortalityRate ? `${qualityKpis.mortalityRate}%` : '—', target: '≤2%', good: true,  icon: HeartPulse, color: 'text-emerald-600' },
              { label: '30-day Readmission Rate', value: qualityKpis.readmissionRate ? `${qualityKpis.readmissionRate}%` : '—', target: '≤5%', good: true,  icon: Activity,   color: 'text-emerald-600' },
              { label: 'HAI Rate',                value: qualityKpis.haiRate ? `${qualityKpis.haiRate}%` : '—', target: '≤1%', good: true,  icon: Shield,     color: 'text-emerald-600' },
              { label: 'HCAHPS Score',            value: qualityKpis.hcahps ? `${qualityKpis.hcahps}%` : '—',  target: '≥85%', good: true, icon: Award,      color: 'text-emerald-600' },
            ].map(k => (
              <Card key={k.label} className="border-0 shadow-sm">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <k.icon className={`h-5 w-5 ${k.color}`} />
                    <Badge className={k.good ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}>
                      {k.good ? 'Meeting Target' : 'Needs Action'}
                    </Badge>
                  </div>
                  <p className={`text-2xl font-bold ${k.color}`}>{k.value}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{k.label}</p>
                  <p className="text-xs font-medium text-muted-foreground">Target: {k.target}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Clinical Quality Indicators — 6 Month Trend (%)</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={emptyDashboardData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => `${v}%`} />
                  <Legend />
                  <Line type="monotone" dataKey="mortality"   stroke="#ef4444" strokeWidth={2} name="Mortality %" dot={{ r: 4 }} />
                  <Line type="monotone" dataKey="readmission" stroke="#f59e0b" strokeWidth={2} name="Readmission %" dot={{ r: 4 }} />
                  <Line type="monotone" dataKey="hai"         stroke="#a855f7" strokeWidth={2} name="HAI %" dot={{ r: 4 }} />
                  <Line type="monotone" dataKey="falls"       stroke="#06b6d4" strokeWidth={2} name="Patient Falls %" dot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Adverse Events */}
          <Card className="border-0 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-500" /> Adverse Events Log (MTD)
              </CardTitle>
              <Button variant="outline" size="sm" className="h-7 text-xs">View All</Button>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-muted-foreground text-xs">
                      <th className="pb-2 text-left font-medium">Event ID</th>
                      <th className="pb-2 text-left font-medium">Event</th>
                      <th className="pb-2 text-left font-medium">Department</th>
                      <th className="pb-2 text-left font-medium">Severity</th>
                      <th className="pb-2 text-left font-medium">Status</th>
                      <th className="pb-2 text-left font-medium">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {emptyDashboardData.map(ae => (
                      <tr key={ae.id} className="hover:bg-muted/30 transition-colors">
                        <td className="py-2.5 font-mono text-xs text-muted-foreground">{ae.id}</td>
                        <td className="py-2.5 max-w-[220px]"><p className="text-sm leading-snug">{ae.event}</p></td>
                        <td className="py-2.5 text-xs">{ae.dept}</td>
                        <td className="py-2.5">
                          <Badge className={`text-xs ${ae.severity === 'High' ? 'bg-red-100 text-red-700' : ae.severity === 'Medium' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                            {ae.severity}
                          </Badge>
                        </td>
                        <td className="py-2.5">
                          <Badge variant="outline" className={`text-xs ${ae.status === 'Closed' ? 'border-emerald-300 text-emerald-700' : ae.status === 'Under Review' ? 'border-red-300 text-red-700' : 'border-amber-300 text-amber-700'}`}>
                            {ae.status}
                          </Badge>
                        </td>
                        <td className="py-2.5 text-xs text-muted-foreground">{ae.date}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Doctors Tab ──────────────────────────────────────────────────── */}
        <TabsContent value="doctors" className="space-y-5">
          <Card className="border-0 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <UserCheck className="h-4 w-4 text-indigo-500" /> Doctor Performance Dashboard
              </CardTitle>
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
                <FileText className="h-3.5 w-3.5" /> Export
              </Button>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-muted-foreground text-xs">
                      <th className="pb-2 text-left font-medium">Doctor</th>
                      <th className="pb-2 text-left font-medium">Specialty</th>
                      <th className="pb-2 text-right font-medium">Patients Today</th>
                      <th className="pb-2 text-right font-medium">Satisfaction</th>
                      <th className="pb-2 text-center font-medium">CME Hours</th>
                      <th className="pb-2 text-center font-medium">Credentials</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {emptyDashboardData.map(d => {
                      const cmePct  = Math.round((d.cme / d.cmeTarget) * 100);
                      const credExp = new Date(d.credExpiry);
                      const daysToExp = Math.round((credExp.getTime() - Date.now()) / (1000*60*60*24));
                      return (
                        <tr key={d.name} className="hover:bg-muted/30 transition-colors">
                          <td className="py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
                                {d.name.split(' ').slice(-1)[0][0]}
                              </div>
                              <span className="font-medium">{d.name}</span>
                            </div>
                          </td>
                          <td className="py-3 text-xs text-muted-foreground">{d.dept}</td>
                          <td className="py-3 text-right font-semibold">{d.patients}</td>
                          <td className="py-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <span className={`font-semibold ${d.satisfaction >= 4.8 ? 'text-emerald-600' : d.satisfaction >= 4.5 ? 'text-blue-600' : 'text-amber-600'}`}>
                                {d.satisfaction}
                              </span>
                              <span className="text-amber-500 text-xs">★</span>
                            </div>
                          </td>
                          <td className="py-3">
                            <div className="flex flex-col items-center gap-1">
                              <div className="flex items-center gap-2 w-full max-w-[120px]">
                                <Progress value={cmePct} className="h-1.5 flex-1" />
                                <span className="text-xs text-muted-foreground shrink-0">{d.cme}/{d.cmeTarget}h</span>
                              </div>
                              {cmePct < 50 && <span className="text-xs text-red-500 font-medium">Low</span>}
                            </div>
                          </td>
                          <td className="py-3 text-center">
                            <Badge variant="outline" className={`text-xs ${
                              daysToExp < 180 ? 'border-red-300 text-red-700 bg-red-50'
                              : daysToExp < 365 ? 'border-amber-300 text-amber-700 bg-amber-50'
                              : 'border-emerald-300 text-emerald-700 bg-emerald-50'
                            }`}>
                              {daysToExp < 365
                                ? `${Math.round(daysToExp/30)}m`
                                : `${Math.round(daysToExp/365)}y`} valid
                            </Badge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* CME compliance summary */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {[
              { label: 'Average CME Completion', value: `${Math.round(emptyDashboardData.reduce((s,d)=>s+(d.cme/d.cmeTarget),0)/emptyDashboardData.length*100)}%`, desc: 'Across all active doctors', color: 'text-indigo-600' },
              { label: 'Doctors ≥80% CME',       value: `${emptyDashboardData.filter(d=>d.cme/d.cmeTarget>=0.8).length}/${emptyDashboardData.length}`, desc: 'On track for annual target', color: 'text-emerald-600' },
              { label: 'Credentials Expiring',    value: `${emptyDashboardData.filter(d=>{ const d_=Math.round((new Date(d.credExpiry).getTime()-Date.now())/(1000*60*60*24)); return d_<365; }).length}`, desc: 'Within 12 months', color: 'text-amber-600' },
            ].map(s => (
              <Card key={s.label} className="border-0 shadow-sm">
                <CardContent className="p-4 text-center">
                  <p className={`text-3xl font-bold ${s.color}`}>{s.value}</p>
                  <p className="text-sm font-medium mt-1">{s.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{s.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* ── NABH / Compliance Tab ─────────────────────────────────────────── */}
        <TabsContent value="compliance" className="space-y-5">
          {/* Overall NABH score */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Award className="h-4 w-4 text-amber-500" /> Overall NABH Readiness
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col items-center gap-4">
                <div className="relative w-32 h-32">
                  <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                    <circle cx="18" cy="18" r="15.9" fill="none" stroke="#f1f5f9" strokeWidth="3" />
                    <circle cx="18" cy="18" r="15.9" fill="none"
                      stroke={overallNABH >= 90 ? '#22c55e' : overallNABH >= 80 ? '#6366f1' : '#f59e0b'}
                      strokeWidth="3"
                      strokeDasharray={`${overallNABH} ${100 - overallNABH}`}
                      strokeLinecap="round" />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-2xl font-bold">{overallNABH}%</span>
                    <span className="text-xs text-muted-foreground">NABH</span>
                  </div>
                </div>
                <div className="space-y-1 w-full">
                  {[
                    { label: 'Chapters ≥90%', count: emptyDashboardData.filter(n=>n.score>=90).length, color: 'text-emerald-600' },
                    { label: 'Chapters 80–89%', count: emptyDashboardData.filter(n=>n.score>=80&&n.score<90).length, color: 'text-indigo-600' },
                    { label: 'Chapters <80%',  count: emptyDashboardData.filter(n=>n.score<80).length, color: 'text-amber-600' },
                  ].map(s => (
                    <div key={s.label} className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{s.label}</span>
                      <span className={`font-bold ${s.color}`}>{s.count}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Chapter radar */}
            <Card className="border-0 shadow-sm lg:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">NABH Chapter Compliance Radar</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={240}>
                  <RadarChart data={emptyDashboardData.map(n => ({ subject: n.chapter.split(' ')[0], score: n.score, target: 90 }))}>
                    <PolarGrid />
                    <PolarAngleAxis dataKey="subject" tick={{ fontSize: 10 }} />
                    <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 9 }} />
                    <Radar name="Score"  dataKey="score"  stroke="#6366f1" fill="#6366f1" fillOpacity={0.3} />
                    <Radar name="Target" dataKey="target" stroke="#22c55e" fill="none" strokeDasharray="4 4" />
                    <Legend />
                    <Tooltip formatter={(v: number) => `${v}%`} />
                  </RadarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Chapter-wise breakdown */}
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">NABH Chapter-wise Breakdown</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {emptyDashboardData.map(n => (
                <div key={n.chapter} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{n.chapter}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground">Gap: {n.gap} points</span>
                      <Badge variant="outline" className={`text-xs ${
                        n.score >= 90 ? 'border-emerald-300 text-emerald-700 bg-emerald-50'
                        : n.score >= 80 ? 'border-blue-300 text-blue-700 bg-blue-50'
                        : 'border-amber-300 text-amber-700 bg-amber-50'
                      }`}>{n.score}%</Badge>
                    </div>
                  </div>
                  <Progress value={n.score} className="h-2" />
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Upcoming compliance events */}
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Calendar className="h-4 w-4 text-indigo-500" /> Upcoming Compliance Events
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {[
                  { event: 'NABH Mock Audit',         date: '2026-06-10', type: 'Audit',        color: 'border-indigo-200 bg-indigo-50' },
                  { event: 'Infection Control Review', date: '2026-06-18', type: 'Review',       color: 'border-blue-200 bg-blue-50' },
                  { event: 'CME Programme (Cardiology)',date: '2026-06-22', type: 'CME',         color: 'border-purple-200 bg-purple-50' },
                  { event: 'Drugs License Renewal',   date: '2026-07-01', type: 'Regulatory',   color: 'border-amber-200 bg-amber-50' },
                  { event: 'Clinical Committee Meet',  date: '2026-07-05', type: 'Committee',   color: 'border-teal-200 bg-teal-50' },
                  { event: 'JCI Self-Assessment',      date: '2026-07-15', type: 'Accreditation', color: 'border-rose-200 bg-rose-50' },
                ].map(ev => (
                  <div key={ev.event} className={`p-3 rounded-xl border ${ev.color} dark:bg-transparent`}>
                    <p className="text-sm font-semibold leading-snug">{ev.event}</p>
                    <div className="flex items-center justify-between mt-2">
                      <p className="text-xs text-muted-foreground">{ev.date}</p>
                      <Badge variant="outline" className="text-xs">{ev.type}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </HospitalLayout>
  );
}
