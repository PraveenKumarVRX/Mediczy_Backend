/**
 * COO Dashboard — Chief Operating Officer
 * Operational excellence: live beds, throughput, staffing, supply chain
 */

import { useState, useEffect, useRef } from 'react';
import HospitalLayout from '@/components/hospital/HospitalLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, AreaChart, Area,
} from 'recharts';
import {
  Bed, Users, Clock, Activity, AlertTriangle, CheckCircle2,
  RefreshCw, ArrowUpRight, ArrowDownRight, Wrench, Package,
  Stethoscope, FlaskConical, Scan, Shield, Zap,
  ChevronRight, TrendingUp, TrendingDown, Timer, LayoutGrid,
  Settings, Thermometer,
} from 'lucide-react';
import api from '@/utils/api';
import { useHospitalAuth } from '@/hooks/useHospitalAuth';

// ─── Colour tokens ────────────────────────────────────────────────────────────
const STATUS_CLS: Record<string, string> = {
  available:  'bg-emerald-500',
  occupied:   'bg-blue-500',
  reserved:   'bg-amber-400',
  maintenance: 'bg-red-400',
};

// ─── Seed data ─────────────────────────────────────────────────────────────────
const seedBedsByWard = [
  { ward: 'General Medicine', total: 60, occupied: 52, reserved: 4, maintenance: 0 },
  { ward: 'Cardiology',       total: 24, occupied: 22, reserved: 1, maintenance: 1 },
  { ward: 'Orthopaedics',     total: 20, occupied: 16, reserved: 2, maintenance: 0 },
  { ward: 'Gynaecology',      total: 18, occupied: 14, reserved: 2, maintenance: 0 },
  { ward: 'ICU',              total: 12, occupied: 11, reserved: 1, maintenance: 0 },
  { ward: 'NICU',             total: 8,  occupied: 6,  reserved: 1, maintenance: 0 },
  { ward: 'Neurology',        total: 16, occupied: 12, reserved: 2, maintenance: 0 },
  { ward: 'Oncology',         total: 20, occupied: 18, reserved: 0, maintenance: 0 },
  { ward: 'HDU',              total: 10, occupied: 8,  reserved: 1, maintenance: 1 },
  { ward: 'Surgical',         total: 18, occupied: 13, reserved: 3, maintenance: 0 },
];

const seedThroughput = [
  { hour: '08', admissions: 12, discharges: 4,  er: 8 },
  { hour: '09', admissions: 18, discharges: 8,  er: 12 },
  { hour: '10', admissions: 24, discharges: 14, er: 16 },
  { hour: '11', admissions: 20, discharges: 18, er: 14 },
  { hour: '12', admissions: 14, discharges: 22, er: 10 },
  { hour: '13', admissions: 10, discharges: 16, er: 8  },
  { hour: '14', admissions: 16, discharges: 20, er: 12 },
  { hour: '15', admissions: 22, discharges: 24, er: 18 },
  { hour: '16', admissions: 18, discharges: 28, er: 14 },
];

const seedALOS = [
  { dept: 'General Medicine', alos: 5.2, target: 4.5 },
  { dept: 'Cardiology',       alos: 6.1, target: 5.0 },
  { dept: 'Orthopaedics',     alos: 7.4, target: 6.5 },
  { dept: 'Gynaecology',      alos: 3.8, target: 4.0 },
  { dept: 'Neurology',        alos: 8.2, target: 7.0 },
  { dept: 'Surgical',         alos: 4.6, target: 4.5 },
];

const seedStaff = [
  { dept: 'Doctors',    total: 48, present: 42, onLeave: 4, shortage: 2 },
  { dept: 'Nurses',     total: 120, present: 108, onLeave: 8, shortage: 4 },
  { dept: 'Paramedics', total: 36, present: 32, onLeave: 2, shortage: 2 },
  { dept: 'Housekeeping', total: 40, present: 38, onLeave: 2, shortage: 0 },
  { dept: 'Radiology',  total: 12, present: 11, onLeave: 1, shortage: 0 },
  { dept: 'Lab Tech',   total: 18, present: 16, onLeave: 2, shortage: 0 },
];

const seedSupplyAlerts = [
  { item: 'Piperacillin/Tazobactam 4.5g', level: 8, reorder: 20, status: 'critical', dept: 'Pharmacy' },
  { item: 'Sterile Gloves (L)',            level: 142, reorder: 200, status: 'low', dept: 'CSSD' },
  { item: 'IV Fluid NS 500ml',             level: 85, reorder: 150, status: 'low', dept: 'Pharmacy' },
  { item: 'Surgical Sutures 3-0',          level: 34, reorder: 50, status: 'low', dept: 'OT' },
  { item: 'Oxygen Cylinders (D-type)',     level: 12, reorder: 10, status: 'ok', dept: 'Maintenance' },
];

const seedMaintenance = [
  { ticket: 'MNT-1042', item: 'CT Scanner — calibration error', priority: 'high', dept: 'Radiology', raised: '2h ago', status: 'In Progress' },
  { ticket: 'MNT-1041', item: 'Lift B — door sensor fault',      priority: 'medium', dept: 'Admin', raised: '4h ago', status: 'Assigned' },
  { ticket: 'MNT-1040', item: 'ICU Bed 4 — pump motor noise',   priority: 'high', dept: 'ICU', raised: '6h ago', status: 'In Progress' },
  { ticket: 'MNT-1039', item: 'AC Unit Floor 2 West — leak',     priority: 'low', dept: 'Admin', raised: '1d ago', status: 'Pending' },
  { ticket: 'MNT-1038', item: 'Autoclave 2 — pressure gauge',    priority: 'medium', dept: 'CSSD', raised: '1d ago', status: 'Resolved' },
];

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KPI({ label, value, sub, icon: Icon, color, badge, badgeColor }: {
  label: string; value: string; sub: string; icon: React.ElementType;
  color: string; badge?: string; badgeColor?: string;
}) {
  return (
    <Card className="border-0 shadow-sm hover:shadow-md transition-all">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground font-medium">{label}</p>
            <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
            <p className="text-xs text-muted-foreground mt-1">{sub}</p>
          </div>
          <div className="flex flex-col items-end gap-2 ml-2">
            <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800">
              <Icon className={`h-5 w-5 ${color}`} />
            </div>
            {badge && (
              <Badge className={`text-xs ${badgeColor || 'bg-slate-100 text-slate-700'}`}>{badge}</Badge>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Bed occupancy mini-bar ───────────────────────────────────────────────────
function BedBar({ ward, total, occupied, reserved, maintenance }: {
  ward: string; total: number; occupied: number; reserved: number; maintenance: number;
}) {
  const available = total - occupied - reserved - maintenance;
  const pct = Math.round((occupied / total) * 100);
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium truncate max-w-[140px]" title={ward}>{ward}</span>
        <span className="text-muted-foreground ml-2 shrink-0">{occupied}/{total} · <span className={pct >= 90 ? 'text-red-500 font-semibold' : pct >= 75 ? 'text-amber-600' : 'text-emerald-600'}>{pct}%</span></span>
      </div>
      <div className="flex h-2 rounded-full overflow-hidden gap-px bg-slate-100">
        <div className="bg-blue-500 transition-all" style={{ width: `${(occupied/total)*100}%` }} />
        <div className="bg-amber-400 transition-all" style={{ width: `${(reserved/total)*100}%` }} />
        <div className="bg-red-400 transition-all" style={{ width: `${(maintenance/total)*100}%` }} />
        <div className="bg-emerald-200 flex-1" />
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function COODashboard() {
  const { hospitalData } = useHospitalAuth();
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const totalBeds    = seedBedsByWard.reduce((s,w) => s + w.total, 0);
  const occupiedBeds = seedBedsByWard.reduce((s,w) => s + w.occupied, 0);
  const occupancyPct = Math.round((occupiedBeds / totalBeds) * 100);

  // Auto-refresh every 60s
  useEffect(() => {
    intervalRef.current = setInterval(() => setLastUpdated(new Date()), 60_000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  return (
    <HospitalLayout title="COO Dashboard" subtitle="Operational Excellence & Live Situational Awareness">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-gradient-to-br from-teal-500 to-emerald-600 text-white">
            <LayoutGrid className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold">COO Operations Centre</h1>
            <p className="text-xs text-muted-foreground">
              {hospitalData?.name || 'Hospital'} · Live · {lastUpdated.toLocaleTimeString()}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 dark:bg-emerald-950/30 rounded-full border border-emerald-200">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-medium text-emerald-700">Live Feed</span>
          </div>
          <Button variant="outline" size="sm" className="gap-1" onClick={() => setLastUpdated(new Date())}>
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
        </div>
      </div>

      {/* ── Headline KPIs ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-4 mb-6">
        <KPI label="Bed Occupancy" value={`${occupancyPct}%`} sub={`${occupiedBeds}/${totalBeds} beds`}
          icon={Bed} color={occupancyPct >= 90 ? 'text-red-500' : 'text-teal-600'}
          badge={occupancyPct >= 90 ? 'Critical' : occupancyPct >= 80 ? 'High' : 'Normal'}
          badgeColor={occupancyPct >= 90 ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'} />
        <KPI label="ER Wait Time" value="22 min" sub="Target: ≤30 min" icon={Timer} color="text-emerald-600" badge="On Target" badgeColor="bg-emerald-100 text-emerald-700" />
        <KPI label="OT Utilisation" value="87%" sub="6/7 theatres active" icon={Stethoscope} color="text-indigo-600" />
        <KPI label="Lab TAT (avg)" value="48 min" sub="Target: ≤60 min" icon={FlaskConical} color="text-blue-600" badge="On Target" badgeColor="bg-blue-100 text-blue-700" />
        <KPI label="Discharge Rate" value="32/day" sub="ALOS 4.8 days" icon={Activity} color="text-purple-600" />
        <KPI label="Open Maint Tickets" value="4" sub="1 high priority" icon={Wrench} color="text-amber-600" badge="1 High" badgeColor="bg-amber-100 text-amber-700" />
      </div>

      <Tabs defaultValue="beds" className="space-y-5">
        <TabsList className="flex flex-wrap gap-1 h-auto">
          <TabsTrigger value="beds">Live Beds</TabsTrigger>
          <TabsTrigger value="throughput">Throughput</TabsTrigger>
          <TabsTrigger value="staffing">Staffing</TabsTrigger>
          <TabsTrigger value="supply">Supply & Maintenance</TabsTrigger>
        </TabsList>

        {/* ── Live Beds Tab ────────────────────────────────────────────────── */}
        <TabsContent value="beds" className="space-y-5">
          {/* Legend */}
          <div className="flex flex-wrap gap-4 text-xs">
            {[
              { color: 'bg-blue-500',    label: 'Occupied' },
              { color: 'bg-amber-400',   label: 'Reserved' },
              { color: 'bg-red-400',     label: 'Maintenance' },
              { color: 'bg-emerald-200', label: 'Available' },
            ].map(l => (
              <div key={l.label} className="flex items-center gap-1.5">
                <div className={`w-3 h-3 rounded ${l.color}`} />
                <span className="text-muted-foreground">{l.label}</span>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Ward occupancy bars */}
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Bed className="h-4 w-4 text-teal-500" /> Ward-wise Occupancy
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {seedBedsByWard.map(w => <BedBar key={w.ward} {...w} />)}
              </CardContent>
            </Card>

            {/* Summary + high-risk wards */}
            <div className="space-y-5">
              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">Hospital-wide Summary</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4">
                    {[
                      { label: 'Total Beds',   value: totalBeds,                   color: 'text-slate-700' },
                      { label: 'Occupied',     value: occupiedBeds,                color: 'text-blue-600' },
                      { label: 'Available',    value: totalBeds - occupiedBeds - seedBedsByWard.reduce((s,w)=>s+w.reserved+w.maintenance,0), color: 'text-emerald-600' },
                      { label: 'Reserved',     value: seedBedsByWard.reduce((s,w)=>s+w.reserved,0), color: 'text-amber-600' },
                      { label: 'Maintenance',  value: seedBedsByWard.reduce((s,w)=>s+w.maintenance,0), color: 'text-red-500' },
                      { label: 'Occupancy %',  value: `${occupancyPct}%`,          color: occupancyPct >= 90 ? 'text-red-500' : 'text-teal-600' },
                    ].map(s => (
                      <div key={s.label} className="p-3 rounded-xl bg-muted/40 text-center">
                        <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* High-occupancy alerts */}
              <Card className="border-0 shadow-sm border-l-4 border-l-red-400">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-red-500" /> High Occupancy Wards
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2.5">
                  {seedBedsByWard
                    .filter(w => Math.round((w.occupied/w.total)*100) >= 85)
                    .sort((a,b) => (b.occupied/b.total) - (a.occupied/a.total))
                    .map(w => {
                      const pct = Math.round((w.occupied/w.total)*100);
                      return (
                        <div key={w.ward} className="flex items-center justify-between p-2.5 rounded-lg bg-red-50/60 dark:bg-red-950/20">
                          <div>
                            <p className="text-sm font-medium">{w.ward}</p>
                            <p className="text-xs text-muted-foreground">{w.occupied}/{w.total} beds occupied</p>
                          </div>
                          <Badge className={`${pct >= 95 ? 'bg-red-600' : 'bg-amber-500'} text-white`}>{pct}%</Badge>
                        </div>
                      );
                  })}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* ── Throughput Tab ───────────────────────────────────────────────── */}
        <TabsContent value="throughput" className="space-y-5">
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Today's Patient Flow — Hourly</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={seedThroughput} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="hour" tickFormatter={h => `${h}:00`} tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip labelFormatter={h => `${h}:00 hrs`} />
                  <Legend />
                  <Bar dataKey="admissions" fill="#6366f1" name="Admissions" radius={[3,3,0,0]} />
                  <Bar dataKey="discharges" fill="#22c55e" name="Discharges"  radius={[3,3,0,0]} />
                  <Bar dataKey="er"         fill="#f59e0b" name="ER Arrivals" radius={[3,3,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* ALOS by dept */}
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Average Length of Stay vs Target (Days)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {seedALOS.map(d => {
                    const over = d.alos > d.target;
                    const pct  = Math.min(100, Math.round((d.alos / (d.target * 1.5)) * 100));
                    return (
                      <div key={d.dept} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium">{d.dept}</span>
                          <span className={`font-semibold ${over ? 'text-red-500' : 'text-emerald-600'}`}>
                            {d.alos}d {over ? `(+${(d.alos-d.target).toFixed(1)} over target)` : '✓ on target'}
                          </span>
                        </div>
                        <div className="relative h-2 rounded-full bg-slate-100 overflow-hidden">
                          <div className={`h-full rounded-full transition-all ${over ? 'bg-red-400' : 'bg-emerald-500'}`} style={{ width: `${pct}%` }} />
                          <div className="absolute top-0 h-full border-l-2 border-indigo-500/60 border-dashed" style={{ left: `${Math.min(100,Math.round((d.target/(d.target*1.5))*100))}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* TAT Summary */}
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Service Turnaround Times</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  { service: 'Lab Results (routine)', avg: '48 min', target: '60 min', ok: true },
                  { service: 'Lab Results (urgent)',  avg: '18 min', target: '30 min', ok: true },
                  { service: 'Radiology (X-Ray)',     avg: '22 min', target: '30 min', ok: true },
                  { service: 'Radiology (CT Scan)',   avg: '68 min', target: '60 min', ok: false },
                  { service: 'OT Turnaround',         avg: '26 min', target: '30 min', ok: true },
                  { service: 'Discharge Processing',  avg: '3.2 hrs', target: '2 hrs', ok: false },
                  { service: 'ER to Ward Transfer',   avg: '1.8 hrs', target: '2 hrs', ok: true },
                  { service: 'Pharmacy Dispensing',   avg: '12 min', target: '15 min', ok: true },
                ].map(t => (
                  <div key={t.service} className="flex items-center justify-between p-2.5 rounded-lg hover:bg-muted/40 transition-colors">
                    <div>
                      <p className="text-sm font-medium">{t.service}</p>
                      <p className="text-xs text-muted-foreground">Target: {t.target}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-bold ${t.ok ? 'text-emerald-600' : 'text-red-500'}`}>{t.avg}</span>
                      {t.ok
                        ? <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                        : <AlertTriangle className="h-4 w-4 text-red-500" />}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Staffing Tab ─────────────────────────────────────────────────── */}
        <TabsContent value="staffing" className="space-y-5">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Users className="h-4 w-4 text-indigo-500" /> Today's Attendance by Category
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {seedStaff.map(s => {
                    const pct = Math.round((s.present / s.total) * 100);
                    return (
                      <div key={s.dept} className="space-y-1.5">
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium">{s.dept}</span>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground">
                            <span className="text-emerald-600 font-semibold">{s.present} present</span>
                            <span>{s.onLeave} leave</span>
                            {s.shortage > 0 && <span className="text-red-500 font-semibold">{s.shortage} shortage</span>}
                          </div>
                        </div>
                        <Progress value={pct} className="h-2" />
                        <p className="text-xs text-muted-foreground text-right">{pct}% coverage</p>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            <div className="space-y-5">
              {/* Shift coverage */}
              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">Shift Coverage — Nursing</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {[
                      { shift: 'Morning (06-14)', required: 40, assigned: 38, present: 36 },
                      { shift: 'Evening (14-22)', required: 32, assigned: 31, present: 30 },
                      { shift: 'Night (22-06)',   required: 28, assigned: 26, present: 25 },
                    ].map(s => (
                      <div key={s.shift} className="p-3 rounded-xl bg-muted/40">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-sm font-medium">{s.shift}</p>
                          <Badge variant="outline" className={s.present >= s.required
                            ? 'border-emerald-300 text-emerald-700'
                            : s.present >= s.required * 0.9
                            ? 'border-amber-300 text-amber-700'
                            : 'border-red-300 text-red-700'
                          }>{s.present}/{s.required} nurses</Badge>
                        </div>
                        <Progress value={Math.round((s.present/s.required)*100)} className="h-1.5" />
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Doctor availability */}
              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">Doctor Availability — Specialties</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { spec: 'General Medicine', avail: 8, total: 9 },
                      { spec: 'Cardiology',       avail: 4, total: 4 },
                      { spec: 'Orthopaedics',     avail: 3, total: 4 },
                      { spec: 'Gynaecology',      avail: 3, total: 3 },
                      { spec: 'Neurology',        avail: 2, total: 3 },
                      { spec: 'Anaesthesia',      avail: 5, total: 6 },
                    ].map(d => (
                      <div key={d.spec} className="p-2.5 rounded-lg bg-muted/40 flex items-center justify-between gap-2">
                        <p className="text-xs font-medium truncate">{d.spec}</p>
                        <Badge variant="outline" className={d.avail === d.total
                          ? 'border-emerald-300 text-emerald-700 bg-emerald-50'
                          : 'border-amber-300 text-amber-700 bg-amber-50'
                        } >{d.avail}/{d.total}</Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* ── Supply & Maintenance Tab ─────────────────────────────────────── */}
        <TabsContent value="supply" className="space-y-5">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Supply alerts */}
            <Card className="border-0 shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Package className="h-4 w-4 text-amber-500" /> Inventory Alerts
                </CardTitle>
                <Badge className="bg-red-100 text-red-700">
                  {seedSupplyAlerts.filter(a=>a.status==='critical').length} Critical
                </Badge>
              </CardHeader>
              <CardContent className="space-y-3">
                {seedSupplyAlerts.map(a => (
                  <div key={a.item} className={`p-3 rounded-xl border ${
                    a.status === 'critical' ? 'border-red-200 bg-red-50/60 dark:bg-red-950/20'
                    : a.status === 'low' ? 'border-amber-200 bg-amber-50/60 dark:bg-amber-950/20'
                    : 'border-emerald-200 bg-emerald-50/60 dark:bg-emerald-950/20'
                  }`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{a.item}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{a.dept} · Reorder at {a.reorder} units</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className={`text-lg font-bold ${a.status==='critical' ? 'text-red-600' : a.status==='low' ? 'text-amber-600' : 'text-emerald-600'}`}>{a.level}</p>
                        <Badge className={`text-xs ${a.status==='critical' ? 'bg-red-600' : a.status==='low' ? 'bg-amber-500' : 'bg-emerald-500'} text-white`}>
                          {a.status}
                        </Badge>
                      </div>
                    </div>
                    <Progress value={Math.min(100, Math.round((a.level/a.reorder)*100))} className="h-1.5 mt-2" />
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Maintenance tickets */}
            <Card className="border-0 shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Wrench className="h-4 w-4 text-purple-500" /> Maintenance Tickets
                </CardTitle>
                <Button variant="ghost" size="sm" className="h-7 text-xs">View All</Button>
              </CardHeader>
              <CardContent className="space-y-2.5">
                {seedMaintenance.map(t => (
                  <div key={t.ticket} className="flex items-start gap-3 p-3 rounded-xl hover:bg-muted/40 border transition-colors">
                    <div className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${
                      t.priority === 'high' ? 'bg-red-500' : t.priority === 'medium' ? 'bg-amber-500' : 'bg-blue-400'
                    }`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-mono text-muted-foreground">{t.ticket}</p>
                        <Badge variant="outline" className={`text-xs shrink-0 ${
                          t.status === 'Resolved' ? 'border-emerald-300 text-emerald-700' :
                          t.status === 'In Progress' ? 'border-blue-300 text-blue-700' :
                          t.status === 'Assigned' ? 'border-indigo-300 text-indigo-700' :
                          'border-slate-300 text-slate-700'
                        }`}>{t.status}</Badge>
                      </div>
                      <p className="text-sm font-medium mt-0.5 leading-snug">{t.item}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{t.dept} · {t.raised}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Equipment Status */}
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Settings className="h-4 w-4 text-slate-500" /> Critical Equipment Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {[
                  { name: 'CT Scanner',    status: 'Degraded', icon: Scan },
                  { name: 'MRI Machine',   status: 'Online',   icon: Activity },
                  { name: 'Ventilators',   status: 'Online',   icon: Thermometer },
                  { name: 'Defibrillators',status: 'Online',   icon: Zap },
                  { name: 'Autoclave 1',   status: 'Online',   icon: Shield },
                  { name: 'Autoclave 2',   status: 'Servicing',icon: Wrench },
                ].map(e => (
                  <div key={e.name} className={`p-3 rounded-xl text-center border ${
                    e.status === 'Online'   ? 'border-emerald-200 bg-emerald-50/60 dark:bg-emerald-950/20'
                    : e.status === 'Degraded' ? 'border-amber-200 bg-amber-50/60 dark:bg-amber-950/20'
                    : 'border-blue-200 bg-blue-50/60 dark:bg-blue-950/20'
                  }`}>
                    <e.icon className={`h-5 w-5 mx-auto mb-1 ${
                      e.status === 'Online' ? 'text-emerald-600' : e.status === 'Degraded' ? 'text-amber-600' : 'text-blue-600'
                    }`} />
                    <p className="text-xs font-semibold">{e.name}</p>
                    <p className={`text-xs mt-0.5 ${
                      e.status === 'Online' ? 'text-emerald-600' : e.status === 'Degraded' ? 'text-amber-600' : 'text-blue-600'
                    }`}>{e.status}</p>
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
