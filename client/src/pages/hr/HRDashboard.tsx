import HospDeptLayout, { DeptNavSection } from '@/components/hosp-dept/HospDeptLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Users, LayoutDashboard, CalendarCheck, DollarSign, UserPlus,
  GraduationCap, BarChart3, Settings, HelpCircle, PlusCircle,
  Clock, CheckCircle2, AlertCircle, UserCheck, BriefcaseBusiness,
  Star, Download,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const navSections: DeptNavSection[] = [
  {
    title: 'Overview',
    items: [
      { icon: LayoutDashboard, label: 'Dashboard',       href: '/hr/dashboard' },
    ],
  },
  {
    title: 'Workforce',
    items: [
      { icon: Users,           label: 'Staff Directory', href: '/hr/staff' },
      { icon: CalendarCheck,   label: 'Attendance',      href: '/hr/attendance' },
      { icon: Clock,           label: 'Leave Management',href: '/hr/leaves' },
      { icon: DollarSign,      label: 'Payroll',         href: '/hr/payroll' },
    ],
  },
  {
    title: 'Talent',
    items: [
      { icon: UserPlus,        label: 'Recruitment',     href: '/hr/recruitment' },
      { icon: GraduationCap,   label: 'Training',        href: '/hr/training' },
      { icon: Star,            label: 'Performance',     href: '/hr/performance' },
    ],
  },
  {
    title: 'System',
    items: [
      { icon: BarChart3,       label: 'HR Reports',   href: '/hr/reports' },
      { icon: Settings,        label: 'Settings',     href: '/hr/settings' },
      { icon: HelpCircle,      label: 'Support',      href: '/hr/support' },
    ],
  },
];

const kpis = [
  { label: 'Total Staff',          value: '482',  sub: 'Across all depts',    icon: Users,       color: 'text-teal-600' },
  { label: 'Present Today',        value: '431',  sub: '89.4% attendance',    icon: UserCheck,   color: 'text-emerald-600' },
  { label: 'On Leave Today',       value: '28',   sub: '6 medical, 22 casual',icon: Clock,       color: 'text-amber-600' },
  { label: 'New Joiners (Month)',   value: '14',   sub: '3 exits',             icon: UserPlus,    color: 'text-blue-600' },
];

const deptAttendance = [
  { dept: 'Clinical Staff',    present: 198, total: 210, absent: 12 },
  { dept: 'Nursing',           present: 124, total: 132, absent: 8  },
  { dept: 'Administration',    present: 56,  total: 62,  absent: 6  },
  { dept: 'Support / Housekeeping', present: 53, total: 78, absent: 25 },
];

const leaveRequests = [
  { name: 'Dr. Priya S.',    dept: 'Medicine',    from: '17-Mar', days: 2, type: 'Casual',  status: 'Pending' },
  { name: 'Nurse Rekha D.',  dept: 'ICU',         from: '18-Mar', days: 3, type: 'Medical', status: 'Pending' },
  { name: 'Ramesh H.',       dept: 'Housekeeping',from: '16-Mar', days: 1, type: 'Casual',  status: 'Approved' },
  { name: 'Anita M.',        dept: 'OPD',         from: '20-Mar', days: 5, type: 'Annual',  status: 'Pending' },
];

const recentHires = [
  { name: 'Dr. Kavita Joshi',    role: 'Cardiologist',     joined: '01-Mar-26' },
  { name: 'Sanjay Kumar',        role: 'Staff Nurse',      joined: '05-Mar-26' },
  { name: 'Pooja Verma',         role: 'Billing Exec.',    joined: '10-Mar-26' },
  { name: 'Mohammed Iqbal',      role: 'Ward Attender',    joined: '12-Mar-26' },
];

const statusColor: Record<string, string> = {
  Pending:  'bg-amber-100 text-amber-700',
  Approved: 'bg-emerald-100 text-emerald-700',
  Rejected: 'bg-red-100 text-red-700',
};

const HRDashboard = () => {
  const navigate = useNavigate();
  return (
    <HospDeptLayout
      deptKey="hr"
      deptName="Human Resources"
      badgeLabel="HR"
      loginPath="/hr/login"
      DeptIcon={Users}
      navSections={navSections}
      title="HR Dashboard"
      subtitle="Staff & workforce management"
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
        {/* Main content */}
        <div className="lg:col-span-2 space-y-5">
          {/* Dept Attendance */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base">Today's Attendance by Department</CardTitle>
              <Button variant="outline" size="sm" className="gap-1" onClick={() => navigate('/hr/attendance')}>
                <Download className="h-4 w-4" />Full Report
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {deptAttendance.map((d) => {
                const pct = Math.round((d.present / d.total) * 100);
                return (
                  <div key={d.dept}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="font-medium">{d.dept}</span>
                      <span className="text-muted-foreground">{d.present}/{d.total} — <span className={pct < 85 ? 'text-red-600 font-semibold' : 'text-emerald-600'}>{pct}%</span></span>
                    </div>
                    <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${pct >= 90 ? 'bg-emerald-500' : pct >= 80 ? 'bg-amber-500' : 'bg-red-500'}`}
                           style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* Leave Requests */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base">Leave Requests — Pending Approval</CardTitle>
              <Button size="sm" className="gap-1 bg-teal-600 hover:bg-teal-700" onClick={() => navigate('/hr/leaves')}>
                View All
              </Button>
            </CardHeader>
            <CardContent>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="pb-2 text-left font-medium">Employee</th>
                    <th className="pb-2 text-left font-medium hidden md:table-cell">Dept</th>
                    <th className="pb-2 text-left font-medium">From</th>
                    <th className="pb-2 text-center font-medium">Days</th>
                    <th className="pb-2 text-center font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {leaveRequests.map((l) => (
                    <tr key={l.name + l.from} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <td className="py-2.5 font-medium">{l.name}<br/><span className="text-xs text-muted-foreground">{l.type}</span></td>
                      <td className="py-2.5 text-muted-foreground hidden md:table-cell">{l.dept}</td>
                      <td className="py-2.5">{l.from}</td>
                      <td className="py-2.5 text-center font-semibold">{l.days}</td>
                      <td className="py-2.5 text-center">
                        <Badge className={`${statusColor[l.status]} border-0 text-xs`}>{l.status}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

          {/* Recent Hires */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <UserPlus className="h-4 w-4 text-teal-500" /> Recent Hires
              </CardTitle>
              <Button variant="outline" size="sm" onClick={() => navigate('/hr/recruitment')}>Recruitment</Button>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {recentHires.map((h) => (
                  <div key={h.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-teal-100 to-teal-200 flex items-center justify-center text-teal-700 font-semibold text-sm">
                        {h.name.charAt(0)}
                      </div>
                      <div>
                        <p className="text-sm font-medium">{h.name}</p>
                        <p className="text-xs text-muted-foreground">{h.role}</p>
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground">{h.joined}</span>
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
                { label: 'Attendance',   icon: CalendarCheck,    path: '/hr/attendance',  color: 'bg-teal-50 text-teal-700 hover:bg-teal-100' },
                { label: 'Leave Mgmt',   icon: Clock,            path: '/hr/leaves',      color: 'bg-amber-50 text-amber-700 hover:bg-amber-100' },
                { label: 'Payroll',      icon: DollarSign,       path: '/hr/payroll',     color: 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' },
                { label: 'Staff Dir.',   icon: Users,            path: '/hr/staff',       color: 'bg-blue-50 text-blue-700 hover:bg-blue-100' },
                { label: 'Recruitment',  icon: UserPlus,         path: '/hr/recruitment', color: 'bg-violet-50 text-violet-700 hover:bg-violet-100' },
                { label: 'Training',     icon: GraduationCap,    path: '/hr/training',    color: 'bg-pink-50 text-pink-700 hover:bg-pink-100' },
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
              <BriefcaseBusiness className="h-4 w-4 text-teal-500" /> Payroll Status
            </CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {[
                { label: 'Processed (Mar)',     value: '466' },
                { label: 'Pending',             value: '16' },
                { label: 'Total Disbursed',     value: '₹82.4L' },
                { label: 'PF Deducted',         value: '₹9.8L' },
                { label: 'TDS Deducted',        value: '₹4.2L' },
              ].map((s) => (
                <div key={s.label} className="flex justify-between">
                  <span className="text-muted-foreground">{s.label}</span>
                  <span className="font-semibold">{s.value}</span>
                </div>
              ))}
              <Button variant="ghost" size="sm" className="w-full text-teal-600 mt-1" onClick={() => navigate('/hr/payroll')}>
                Run Payroll →
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-amber-500" /> Alerts
            </CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {[
                { text: '3 contracts expiring this month', color: 'text-red-600' },
                { text: '8 employees: appraisal due',      color: 'text-amber-600' },
                { text: '2 PF non-compliance notices',     color: 'text-red-600' },
                { text: '5 training certifications lapse', color: 'text-amber-600' },
              ].map((a) => (
                <div key={a.text} className={`text-xs font-medium ${a.color} bg-opacity-10 p-2 rounded-lg bg-current`}
                     style={{ backgroundColor: 'rgb(255 251 235)' }}>
                  {a.text}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </HospDeptLayout>
  );
};

export default HRDashboard;
