import { useState, useEffect } from 'react';
import HospDeptLayout from '@/components/hosp-dept/HospDeptLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Scissors, CalendarCheck, Users, Wrench,
  Stethoscope, ClipboardList,
  PlusCircle, Clock, CheckCircle2, AlertCircle,
  XCircle, Activity, FileText, ShieldCheck, ClipboardCheck, LayoutGrid, RefreshCw,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { otNavSections } from './OTModulePages';
import api from '@/utils/api';

const navSections = otNavSections;

interface ScheduleRow {
  otNo: string;
  patient: string;
  surgeon: string;
  procedure: string;
  time: string;
  status: string;
  duration: string;
}

function mapApiStatus(s: string): string {
  const m: Record<string, string> = {
    scheduled: 'Upcoming', patient_in: 'In Progress', prep: 'In Progress',
    incision: 'In Progress', closure: 'In Progress', completed: 'Completed',
    cancelled: 'Postponed', postponed: 'Postponed',
  };
  return m[s] ?? 'Upcoming';
}

const equipmentStatus = [
  { name: 'Anaesthesia Machine',  ot: 'OT-1', status: 'In Use',      last: '—' },
  { name: 'C-ARM / Fluoro',       ot: 'OT-2', status: 'In Use',      last: '—' },
  { name: 'Laparoscopy Tower',    ot: 'OT-3', status: 'In Use',      last: '—' },
  { name: 'Electrosurgical Unit', ot: 'OT-4', status: 'Ready',       last: 'Today 07:30' },
  { name: 'Sterilizer (CSSD)',    ot: 'CSSD', status: 'Running',     last: 'Cycle 3/5' },
];

const statusColor: Record<string, string> = {
  Completed:    'bg-emerald-100 text-emerald-700',
  'In Progress':'bg-blue-100 text-blue-700',
  Upcoming:     'bg-slate-100 text-slate-600',
  Postponed:    'bg-amber-100 text-amber-700',
  'In Use':     'bg-blue-100 text-blue-700',
  Ready:        'bg-emerald-100 text-emerald-700',
  Running:      'bg-teal-100 text-teal-700',
  Maintenance:  'bg-red-100 text-red-700',
};

const OTDashboard = () => {
  const navigate = useNavigate();
  const [schedule, setSchedule] = useState<ScheduleRow[]>([]);
  const [scheduleLoading, setScheduleLoading] = useState(true);
  const [kpiValues, setKpiValues] = useState({ scheduled: 0, completed: 0, inProgress: 0, postponed: 0 });

  const loadSchedule = async () => {
    setScheduleLoading(true);
    try {
      const res = await api.get('/api/v1/ot/schedule');
      const raw: any[] = res.data?.data ?? [];
      const rows: ScheduleRow[] = raw.map(b => ({
        otNo:      b.room_name ?? b.room_id ?? '—',
        patient:   b.patient_name ?? `Patient #${b.patient_id}`,
        surgeon:   b.surgeon_name ?? b.surgeon_id ?? '—',
        procedure: b.procedure_name ?? '—',
        time:      b.scheduled_start ? new Date(b.scheduled_start).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—',
        status:    mapApiStatus(b.status ?? ''),
        duration:  b.actual_duration_min ? `${Math.floor(b.actual_duration_min / 60)}h ${b.actual_duration_min % 60}m` : '—',
      }));
      setSchedule(rows);
      setKpiValues({
        scheduled:  rows.length,
        completed:  rows.filter(r => r.status === 'Completed').length,
        inProgress: rows.filter(r => r.status === 'In Progress').length,
        postponed:  rows.filter(r => r.status === 'Postponed').length,
      });
    } catch {
      // silently keep empty; fallback static data shown if needed
    } finally {
      setScheduleLoading(false);
    }
  };

  useEffect(() => { loadSchedule(); }, []);

  const displaySchedule = schedule;
  const kpis = [
    { label: 'Scheduled Today',  value: String(kpiValues.scheduled),  sub: `${kpiValues.inProgress} in progress now`,  icon: CalendarCheck, color: 'text-teal-600' },
    { label: 'Completed',        value: String(kpiValues.completed),   sub: 'Today',                                    icon: CheckCircle2,  color: 'text-emerald-600' },
    { label: 'In Progress',      value: String(kpiValues.inProgress),  sub: 'Active theatres',                          icon: Activity,      color: 'text-blue-600' },
    { label: 'Postponed',        value: String(kpiValues.postponed),   sub: 'Rescheduled',                              icon: XCircle,       color: 'text-amber-600' },
  ];

  return (
    <HospDeptLayout
      deptKey="ot"
      deptName="Operation Theatre"
      badgeLabel="OT"
      loginPath="/ot/login"
      DeptIcon={Scissors}
      navSections={navSections}
      title="OT Dashboard"
      subtitle="Surgical scheduling & theatre management"
    >
      {/* KPI Cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-5 mb-6">
        {kpis.map((k) => (
          <Card key={k.label} className="hover:shadow-md transition-shadow">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-medium">{k.label}</p>
                  <p className={`text-2xl font-bold mt-1 ${k.color}`}>{k.value}</p>
                  <p className="text-xs text-muted-foreground mt-1">{k.sub}</p>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800">
                  <k.icon className={`h-5 w-5 ${k.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Today's schedule */}
        <div className="lg:col-span-2 space-y-5">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base">Today's OT Schedule</CardTitle>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={loadSchedule} disabled={scheduleLoading}>
                  <RefreshCw className={`h-4 w-4 ${scheduleLoading ? 'animate-spin' : ''}`} />
                </Button>
                <Button size="sm" className="gap-1 bg-teal-600 hover:bg-teal-700" onClick={() => navigate('/ot/schedule')}>
                  <PlusCircle className="h-4 w-4" />Schedule OT
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {scheduleLoading ? (
                <p className="text-sm text-muted-foreground text-center py-4">Loading schedule…</p>
              ) : displaySchedule.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No procedures scheduled today</p>
              ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="pb-2 text-left font-medium">OT</th>
                    <th className="pb-2 text-left font-medium">Patient</th>
                    <th className="pb-2 text-left font-medium hidden md:table-cell">Procedure</th>
                    <th className="pb-2 text-left font-medium">Time</th>
                    <th className="pb-2 text-center font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {displaySchedule.map((s, i) => (
                    <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer"
                        onClick={() => navigate('/ot/schedule')}>
                      <td className="py-2.5 font-bold text-teal-700">{s.otNo}</td>
                      <td className="py-2.5">{s.patient}<br/><span className="text-xs text-muted-foreground">{s.surgeon}</span></td>
                      <td className="py-2.5 text-muted-foreground hidden md:table-cell">{s.procedure}</td>
                      <td className="py-2.5">{s.time}</td>
                      <td className="py-2.5 text-center">
                        <Badge className={`${statusColor[s.status]} border-0 text-xs`}>{s.status}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              )}
              <Button variant="ghost" size="sm" className="mt-3 w-full text-teal-600" onClick={() => navigate('/ot/schedule')}>
                View full schedule →
              </Button>
            </CardContent>
          </Card>

          {/* Equipment */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base">Equipment Status</CardTitle>
              <Button variant="outline" size="sm" onClick={() => navigate('/ot/equipment')}>Manage</Button>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {equipmentStatus.map((e) => (
                  <div key={e.name} className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800">
                    <div>
                      <p className="text-sm font-medium">{e.name}</p>
                      <p className="text-xs text-muted-foreground">{e.ot} · {e.last}</p>
                    </div>
                    <Badge className={`${statusColor[e.status]} border-0 text-xs`}>{e.status}</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column */}
        <div className="space-y-5">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Quick Actions</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-3 gap-2">
              {[
                { label: 'Theatre View', icon: LayoutGrid,    path: '/ot/theatre-view',  color: 'bg-rose-50 text-rose-700 hover:bg-rose-100' },
                { label: 'Schedule OT', icon: CalendarCheck,  path: '/ot/schedule',      color: 'bg-teal-50 text-teal-700 hover:bg-teal-100' },
                { label: 'Pre-Op',      icon: ClipboardCheck, path: '/ot/pre-op',        color: 'bg-blue-50 text-blue-700 hover:bg-blue-100' },
                { label: 'Consents',    icon: FileText,       path: '/ot/consent',       color: 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100' },
                { label: 'Teams',       icon: Users,          path: '/ot/teams',         color: 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' },
                { label: 'Equipment',   icon: Wrench,         path: '/ot/equipment',     color: 'bg-violet-50 text-violet-700 hover:bg-violet-100' },
                { label: 'Anesthesia',  icon: Stethoscope,    path: '/ot/anesthesia',    color: 'bg-amber-50 text-amber-700 hover:bg-amber-100' },
                { label: 'Safety',      icon: ShieldCheck,    path: '/ot/safety',        color: 'bg-cyan-50 text-cyan-700 hover:bg-cyan-100' },
                { label: 'OT Records',  icon: ClipboardList,  path: '/ot/records',       color: 'bg-pink-50 text-pink-700 hover:bg-pink-100' },
              ].map((a) => (
                <button key={a.label} onClick={() => navigate(a.path)}
                  className={`flex flex-col items-center gap-1.5 p-3 rounded-xl text-xs font-medium transition-colors ${a.color}`}>
                  <a.icon className="h-5 w-5" />
                  {a.label}
                </button>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4 text-teal-500" /> OT Utilization
            </CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {['OT-1','OT-2','OT-3','OT-4'].map((ot, i) => {
                const pct = [82, 75, 91, 40][i];
                return (
                  <div key={ot}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="font-medium">{ot}</span>
                      <span className={pct > 85 ? 'text-amber-600 font-semibold' : 'text-teal-600'}>{pct}%</span>
                    </div>
                    <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${pct > 90 ? 'bg-amber-500' : 'bg-teal-500'}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-amber-500" /> Today's Summary
            </CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {[
                { label: 'Total Scheduled',   value: String(kpiValues.scheduled) },
                { label: 'Completed',         value: String(kpiValues.completed) },
                { label: 'In Progress',       value: String(kpiValues.inProgress) },
                { label: 'Upcoming',          value: String(schedule.filter(r => r.status === 'Upcoming').length) },
                { label: 'Postponed',         value: String(kpiValues.postponed) },
                { label: 'Emergency OTs',     value: '—' },
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

export default OTDashboard;
