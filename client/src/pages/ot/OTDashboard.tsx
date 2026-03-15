import HospDeptLayout, { DeptNavSection } from '@/components/hosp-dept/HospDeptLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Scissors, LayoutDashboard, CalendarCheck, Users, Wrench,
  FlaskConical, Stethoscope, ClipboardList, BarChart3, Settings,
  HelpCircle, PlusCircle, Clock, CheckCircle2, AlertCircle,
  XCircle, Activity, FileText,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const navSections: DeptNavSection[] = [
  {
    title: 'Overview',
    items: [
      { icon: LayoutDashboard, label: 'Dashboard',        href: '/ot/dashboard' },
    ],
  },
  {
    title: 'Operations',
    items: [
      { icon: CalendarCheck,  label: 'OT Schedule',       href: '/ot/schedule' },
      { icon: Users,          label: 'Surgical Teams',    href: '/ot/teams' },
      { icon: Wrench,         label: 'Equipment Status',  href: '/ot/equipment' },
      { icon: FlaskConical,   label: 'Sterilization',     href: '/ot/sterilization' },
    ],
  },
  {
    title: 'Clinical',
    items: [
      { icon: Stethoscope,    label: 'Anesthesia',        href: '/ot/anesthesia' },
      { icon: Activity,       label: 'Post-Op Care',      href: '/ot/post-op' },
      { icon: ClipboardList,  label: 'OT Records',        href: '/ot/records' },
    ],
  },
  {
    title: 'System',
    items: [
      { icon: BarChart3,      label: 'Reports',    href: '/ot/reports' },
      { icon: Settings,       label: 'Settings',   href: '/ot/settings' },
      { icon: HelpCircle,     label: 'Support',    href: '/ot/support' },
    ],
  },
];

const kpis = [
  { label: 'Scheduled Today',  value: '12',  sub: '3 in progress now',   icon: CalendarCheck, color: 'text-teal-600' },
  { label: 'Completed',        value: '8',   sub: 'As of 3:00 PM',       icon: CheckCircle2,  color: 'text-emerald-600' },
  { label: 'In Progress',      value: '3',   sub: 'OT 1, 2 & 3 active',  icon: Activity,      color: 'text-blue-600' },
  { label: 'Postponed',        value: '1',   sub: 'Rescheduled: 19 Mar', icon: XCircle,       color: 'text-amber-600' },
];

const todaySchedule = [
  { otNo: 'OT-1', patient: 'Rajesh Malhotra', surgeon: 'Dr. Mehta',   procedure: 'CABG',              time: '08:00',   status: 'Completed', duration: '4h 20m' },
  { otNo: 'OT-2', patient: 'Sangita Rao',      surgeon: 'Dr. Sharma',  procedure: 'Hip Replacement',   time: '09:30',   status: 'In Progress',duration: '—' },
  { otNo: 'OT-1', patient: 'Nikhil Desai',     surgeon: 'Dr. Mehta',   procedure: 'Appendectomy',      time: '14:00',   status: 'Upcoming',  duration: '—' },
  { otNo: 'OT-3', patient: 'Fatima Khan',       surgeon: 'Dr. Joshi',   procedure: 'Lap Chole',         time: '10:00',   status: 'Completed', duration: '1h 15m' },
  { otNo: 'OT-3', patient: 'Ramesh Tiwari',     surgeon: 'Dr. Joshi',   procedure: 'Inguinal Hernia',   time: '12:30',   status: 'In Progress',duration: '—' },
  { otNo: 'OT-2', patient: 'Priya Nair',        surgeon: 'Dr. Gupta',   procedure: 'Knee Replacement',  time: '15:00',   status: 'Upcoming',  duration: '—' },
];

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
              <CardTitle className="text-base">Today's OT Schedule — 15 Mar 2026</CardTitle>
              <Button size="sm" className="gap-1 bg-teal-600 hover:bg-teal-700" onClick={() => navigate('/ot/schedule')}>
                <PlusCircle className="h-4 w-4" />Schedule OT
              </Button>
            </CardHeader>
            <CardContent>
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
                  {todaySchedule.map((s, i) => (
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
            <CardContent className="grid grid-cols-2 gap-2">
              {[
                { label: 'Schedule OT',    icon: CalendarCheck,path: '/ot/schedule',       color: 'bg-teal-50 text-teal-700 hover:bg-teal-100' },
                { label: 'Teams',          icon: Users,        path: '/ot/teams',          color: 'bg-blue-50 text-blue-700 hover:bg-blue-100' },
                { label: 'Equipment',      icon: Wrench,       path: '/ot/equipment',      color: 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' },
                { label: 'Sterilization',  icon: FlaskConical, path: '/ot/sterilization',  color: 'bg-violet-50 text-violet-700 hover:bg-violet-100' },
                { label: 'Anesthesia',     icon: Stethoscope,  path: '/ot/anesthesia',     color: 'bg-amber-50 text-amber-700 hover:bg-amber-100' },
                { label: 'OT Records',     icon: FileText,     path: '/ot/records',        color: 'bg-pink-50 text-pink-700 hover:bg-pink-100' },
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
                { label: 'Total Scheduled',   value: '12' },
                { label: 'Completed',         value: '8' },
                { label: 'In Progress',       value: '3' },
                { label: 'Upcoming',          value: '2' },
                { label: 'Postponed',         value: '1' },
                { label: 'Emergency OTs',     value: '0' },
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
