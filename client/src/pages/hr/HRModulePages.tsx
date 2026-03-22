import React, { useState } from 'react';
import HospDeptLayout, { DeptNavSection } from '@/components/hosp-dept/HospDeptLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Users, UserCog, Calendar, CalendarOff, Wallet, Briefcase,
  GraduationCap, Star, BarChart3, Settings, HelpCircle,
  PlusCircle, Download, Search, Filter, Clock, UserPlus,
  ShieldCheck, Gift, FileText, TrendingUp, ClipboardCheck,
  Building2, Phone, Mail, MapPin, CheckCircle2, AlertCircle,
  XCircle, MoreHorizontal, Edit, Eye, CalendarCheck,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

// ─── Shared Nav (exported for Dashboard) ───────────────────────────────────
export const hrNavSections: DeptNavSection[] = [
  {
    title: 'Overview',
    items: [{ icon: Users, label: 'Dashboard', href: '/hr/dashboard' }],
  },
  {
    title: 'Workforce',
    items: [
      { icon: UserCog,     label: 'Staff Directory',    href: '/hr/staff' },
      { icon: Calendar,    label: 'Attendance',         href: '/hr/attendance' },
      { icon: CalendarOff, label: 'Leave Management',   href: '/hr/leaves' },
      { icon: Clock,       label: 'Shifts & Roster',    href: '/hr/shifts' },
      { icon: ClipboardCheck, label: 'Onboarding',      href: '/hr/onboarding' },
    ],
  },
  {
    title: 'Payroll & Benefits',
    items: [
      { icon: Wallet,     label: 'Payroll',      href: '/hr/payroll' },
      { icon: ShieldCheck,label: 'PF & ESI',     href: '/hr/pf-esi' },
      { icon: Gift,       label: 'Benefits',     href: '/hr/benefits' },
    ],
  },
  {
    title: 'Talent',
    items: [
      { icon: Briefcase,    label: 'Recruitment', href: '/hr/recruitment' },
      { icon: GraduationCap,label: 'Training',    href: '/hr/training' },
      { icon: Star,         label: 'Performance', href: '/hr/performance' },
      { icon: TrendingUp,   label: 'Appraisals',  href: '/hr/appraisals' },
    ],
  },
  {
    title: 'Reports',
    items: [
      { icon: BarChart3,  label: 'HR Reports',   href: '/hr/reports' },
      { icon: FileText,   label: 'HR Analytics', href: '/hr/analytics' },
      { icon: ShieldCheck,label: 'Compliance',   href: '/hr/compliance' },
    ],
  },
  {
    title: 'System',
    items: [
      { icon: Settings,   label: 'Settings', href: '/hr/settings' },
      { icon: HelpCircle, label: 'Support',  href: '/hr/support' },
    ],
  },
];

// ─── Shared helpers ──────────────────────────────────────────────────────────
const Wrap = ({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) => (
  <HospDeptLayout deptKey="hr" deptName="Human Resources" badgeLabel="HR"
    loginPath="/hr/login" DeptIcon={Users} navSections={hrNavSections}
    title={title} subtitle={subtitle}>
    {children}
  </HospDeptLayout>
);

const KPI = ({ label, value, sub, color = 'text-teal-600', icon: Icon }:
  { label: string; value: string; sub: string; color?: string; icon: LucideIcon }) => (
  <Card className="hover:shadow-md transition-shadow">
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

const sc: Record<string, string> = {
  Active:    'bg-emerald-100 text-emerald-700',
  Inactive:  'bg-slate-100 text-slate-600',
  Pending:   'bg-amber-100 text-amber-700',
  Approved:  'bg-emerald-100 text-emerald-700',
  Rejected:  'bg-red-100 text-red-700',
  Present:   'bg-emerald-100 text-emerald-700',
  Absent:    'bg-red-100 text-red-700',
  Late:      'bg-amber-100 text-amber-700',
  Open:      'bg-blue-100 text-blue-700',
  Closed:    'bg-slate-100 text-slate-600',
  Scheduled: 'bg-violet-100 text-violet-700',
  Completed: 'bg-emerald-100 text-emerald-700',
  Hold:      'bg-orange-100 text-orange-700',
  Due:       'bg-amber-100 text-amber-700',
  Filed:     'bg-emerald-100 text-emerald-700',
  Overdue:   'bg-red-100 text-red-700',
};
const Bdg = ({ s }: { s: string }) => <Badge className={`${sc[s] ?? 'bg-slate-100 text-slate-600'} border-0 text-xs`}>{s}</Badge>;
const TH = ({ children }: { children: React.ReactNode }) => <th className="pb-2 text-left font-medium text-muted-foreground text-xs tracking-wide">{children}</th>;
const TD = ({ children, center }: { children: React.ReactNode; center?: boolean }) => (
  <td className={`py-2.5 text-sm ${center ? 'text-center' : ''}`}>{children}</td>
);

// ═══════════════════════════════════════════════════════════════════════════════
// 1. STAFF DIRECTORY
// ═══════════════════════════════════════════════════════════════════════════════
const staff = [
  { id: 'EMP001', name: 'Dr. Kavita Joshi',   dept: 'Cardiology',   role: 'Consultant',     phone: '9876543210', joined: '01-Mar-26', status: 'Active' },
  { id: 'EMP002', name: 'Sanjay Kumar',        dept: 'Nursing',      role: 'Staff Nurse',    phone: '9876543211', joined: '05-Mar-26', status: 'Active' },
  { id: 'EMP003', name: 'Pooja Verma',         dept: 'Accounts',     role: 'Billing Exec',   phone: '9876543212', joined: '10-Mar-26', status: 'Active' },
  { id: 'EMP004', name: 'Mohammed Iqbal',      dept: 'Housekeeping', role: 'Ward Attender',  phone: '9876543213', joined: '12-Mar-26', status: 'Active' },
  { id: 'EMP005', name: 'Dr. Ramesh Pillai',   dept: 'Orthopaedics', role: 'Consultant',     phone: '9876543214', joined: '15-Feb-26', status: 'Active' },
  { id: 'EMP006', name: 'Sunita Rao',          dept: 'OT',           role: 'OT Technician',  phone: '9876543215', joined: '20-Jan-26', status: 'Active' },
  { id: 'EMP007', name: 'Arun Sharma',         dept: 'Radiology',    role: 'Radiographer',   phone: '9876543216', joined: '01-Jan-26', status: 'Inactive' },
  { id: 'EMP008', name: 'Meena Nair',          dept: 'Pharmacy',     role: 'Pharmacist',     phone: '9876543217', joined: '15-Dec-25', status: 'Active' },
];

export const HRStaffPage = () => {
  const [q, setQ] = useState('');
  const [deptF, setDeptF] = useState('All');
  const depts = ['All', ...Array.from(new Set(staff.map(s => s.dept)))];
  const rows = staff.filter(s =>
    (deptF === 'All' || s.dept === deptF) &&
    (s.name.toLowerCase().includes(q.toLowerCase()) || s.id.toLowerCase().includes(q.toLowerCase()))
  );
  return (
    <Wrap title="Staff Directory" subtitle="Search & manage all hospital staff records">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <KPI label="Total Staff"    value="482" sub="All departments"       icon={Users}       color="text-teal-600" />
        <KPI label="Active"         value="466" sub="Currently employed"    icon={CheckCircle2} color="text-emerald-600" />
        <KPI label="On Probation"   value="14"  sub="Joined last 3 months"  icon={Clock}       color="text-amber-600" />
        <KPI label="Resigned (YTD)" value="8"   sub="Jan–Mar 2026"          icon={XCircle}     color="text-red-600" />
      </div>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base">Staff Register</CardTitle>
          <div className="flex gap-2">
            <div className="relative"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pl-8 h-8 w-48 text-sm" placeholder="Search name/ID" value={q} onChange={e => setQ(e.target.value)} /></div>
            <select className="h-8 text-sm border rounded-md px-2" value={deptF} onChange={e => setDeptF(e.target.value)}>{depts.map(d => <option key={d}>{d}</option>)}</select>
            <Button size="sm" className="gap-1 bg-teal-600 hover:bg-teal-700"><PlusCircle className="h-4 w-4" />Add Staff</Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b"><TH>Emp ID</TH><TH>Name</TH><TH>Department</TH><TH>Role</TH><TH>Phone</TH><TH>Joined</TH><TH>Status</TH><TH>Actions</TH></tr></thead>
              <tbody className="divide-y">
                {rows.map(r => (
                  <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <TD><span className="font-mono text-xs">{r.id}</span></TD>
                    <TD><span className="font-medium">{r.name}</span></TD>
                    <TD>{r.dept}</TD>
                    <TD>{r.role}</TD>
                    <TD>{r.phone}</TD>
                    <TD>{r.joined}</TD>
                    <TD><Bdg s={r.status} /></TD>
                    <TD>
                      <div className="flex gap-1">
                        <button className="p-1 hover:bg-slate-100 rounded"><Eye className="h-4 w-4 text-slate-500" /></button>
                        <button className="p-1 hover:bg-slate-100 rounded"><Edit className="h-4 w-4 text-slate-500" /></button>
                      </div>
                    </TD>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </Wrap>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// 2. ATTENDANCE
// ═══════════════════════════════════════════════════════════════════════════════
const attendance = [
  { id: 'EMP001', name: 'Dr. Kavita Joshi',   dept: 'Cardiology',   in: '08:02', out: '16:05', hours: '8h 03m', status: 'Present' },
  { id: 'EMP002', name: 'Sanjay Kumar',        dept: 'Nursing',      in: '07:55', out: '15:58', hours: '8h 03m', status: 'Present' },
  { id: 'EMP003', name: 'Pooja Verma',         dept: 'Accounts',     in: '09:18', out: '18:10', hours: '8h 52m', status: 'Late' },
  { id: 'EMP004', name: 'Mohammed Iqbal',      dept: 'Housekeeping', in: '—',     out: '—',     hours: '—',      status: 'Absent' },
  { id: 'EMP005', name: 'Dr. Ramesh Pillai',   dept: 'Orthopaedics', in: '09:00', out: '17:00', hours: '8h 00m', status: 'Present' },
  { id: 'EMP006', name: 'Sunita Rao',          dept: 'OT',           in: '07:30', out: '15:35', hours: '8h 05m', status: 'Present' },
  { id: 'EMP007', name: 'Arun Sharma',         dept: 'Radiology',    in: '—',     out: '—',     hours: '—',      status: 'Absent' },
  { id: 'EMP008', name: 'Meena Nair',          dept: 'Pharmacy',     in: '09:05', out: '17:10', hours: '8h 05m', status: 'Present' },
];

export const HRAttendancePage = () => {
  const [dateF, setDateF] = useState('21-Mar-2026');
  return (
    <Wrap title="Attendance" subtitle="Daily attendance, biometric logs & exceptions">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <KPI label="Present Today"  value="431" sub="89.4% of total"     icon={CheckCircle2}  color="text-emerald-600" />
        <KPI label="Absent Today"   value="29"  sub="6 on leave + 23 UA" icon={XCircle}       color="text-red-600" />
        <KPI label="Late Arrivals"  value="18"  sub=">9:00 AM check-in"  icon={Clock}         color="text-amber-600" />
        <KPI label="On Night Shift" value="62"  sub="Currently on duty"   icon={CalendarCheck} color="text-blue-600" />
      </div>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base">Attendance Register</CardTitle>
          <div className="flex gap-2">
            <Input type="date" className="h-8 text-sm w-44" defaultValue="2026-03-21" onChange={e => setDateF(e.target.value)} />
            <Button variant="outline" size="sm" className="gap-1"><Download className="h-4 w-4" />Export</Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b"><TH>Emp ID</TH><TH>Name</TH><TH>Department</TH><TH>Check-In</TH><TH>Check-Out</TH><TH>Hours</TH><TH>Status</TH></tr></thead>
              <tbody className="divide-y">
                {attendance.map(r => (
                  <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <TD><span className="font-mono text-xs">{r.id}</span></TD>
                    <TD><span className="font-medium">{r.name}</span></TD>
                    <TD>{r.dept}</TD>
                    <TD><span className="font-mono">{r.in}</span></TD>
                    <TD><span className="font-mono">{r.out}</span></TD>
                    <TD><span className="font-mono">{r.hours}</span></TD>
                    <TD><Bdg s={r.status} /></TD>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </Wrap>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// 3. LEAVE MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════
const leaves = [
  { id: 'LV001', name: 'Dr. Priya S.',    dept: 'Medicine',     type: 'Casual',  from: '17-Mar-26', to: '18-Mar-26', days: 2, status: 'Pending',  reason: 'Personal work' },
  { id: 'LV002', name: 'Nurse Rekha D.', dept: 'ICU',          type: 'Medical', from: '18-Mar-26', to: '20-Mar-26', days: 3, status: 'Approved', reason: 'Fever/illness' },
  { id: 'LV003', name: 'Ramesh H.',       dept: 'Housekeeping', type: 'Casual',  from: '16-Mar-26', to: '16-Mar-26', days: 1, status: 'Approved', reason: 'Family function' },
  { id: 'LV004', name: 'Anita M.',        dept: 'OPD',          type: 'Annual',  from: '20-Mar-26', to: '24-Mar-26', days: 5, status: 'Pending',  reason: 'Vacation' },
  { id: 'LV005', name: 'Rajesh P.',       dept: 'Lab',          type: 'LOP',     from: '15-Mar-26', to: '15-Mar-26', days: 1, status: 'Rejected', reason: 'Unauthorized' },
  { id: 'LV006', name: 'Sunita R.',       dept: 'OT',           type: 'Maternity',from:'01-Mar-26', to: '30-May-26', days: 90, status: 'Approved', reason: 'Maternity leave' },
];

const leaveBalance = [
  { type: 'Casual Leave',   allotted: 12, used: 5,  balance: 7  },
  { type: 'Medical Leave',  allotted: 12, used: 3,  balance: 9  },
  { type: 'Annual Leave',   allotted: 21, used: 8,  balance: 13 },
  { type: 'Maternity',      allotted: 90, used: 90, balance: 0  },
  { type: 'LOP',            allotted: 0,  used: 1,  balance: -1 },
];

export const HRLeavesPage = () => {
  const [tab, setTab] = useState<'requests' | 'balance'>('requests');
  return (
    <Wrap title="Leave Management" subtitle="Apply, approve & track all employee leaves">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <KPI label="On Leave Today"   value="28"  sub="6 medical, 22 casual"   icon={CalendarOff}   color="text-amber-600" />
        <KPI label="Pending Approval" value="4"   sub="Requires manager review" icon={AlertCircle}   color="text-red-600" />
        <KPI label="Approved (Month)" value="39"  sub="March 2026"              icon={CheckCircle2}  color="text-emerald-600" />
        <KPI label="LOP (Month)"      value="3"   sub="Loss of pay days"        icon={XCircle}       color="text-red-600" />
      </div>
      <div className="flex gap-2 mb-4">
        {(['requests', 'balance'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${tab === t ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>
            {t === 'requests' ? 'Leave Requests' : 'Leave Balance'}
          </button>
        ))}
        <Button size="sm" className="gap-1 bg-teal-600 hover:bg-teal-700 ml-auto"><PlusCircle className="h-4 w-4" />Apply Leave</Button>
      </div>
      {tab === 'requests' ? (
        <Card>
          <CardContent className="pt-4">
            <table className="w-full text-sm">
              <thead><tr className="border-b"><TH>ID</TH><TH>Employee</TH><TH>Type</TH><TH>From</TH><TH>To</TH><TH>Days</TH><TH>Reason</TH><TH>Status</TH></tr></thead>
              <tbody className="divide-y">
                {leaves.map(l => (
                  <tr key={l.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <TD><span className="font-mono text-xs">{l.id}</span></TD>
                    <TD><span className="font-medium">{l.name}</span><br /><span className="text-xs text-muted-foreground">{l.dept}</span></TD>
                    <TD>{l.type}</TD>
                    <TD>{l.from}</TD>
                    <TD>{l.to}</TD>
                    <TD center><span className="font-semibold">{l.days}</span></TD>
                    <TD><span className="text-xs text-muted-foreground">{l.reason}</span></TD>
                    <TD><Bdg s={l.status} /></TD>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="pt-4">
            <table className="w-full text-sm">
              <thead><tr className="border-b"><TH>Leave Type</TH><TH>Allotted</TH><TH>Used</TH><TH>Balance</TH></tr></thead>
              <tbody className="divide-y">
                {leaveBalance.map(b => (
                  <tr key={b.type} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <TD><span className="font-medium">{b.type}</span></TD>
                    <TD center>{b.allotted}</TD>
                    <TD center>{b.used}</TD>
                    <TD center><span className={`font-semibold ${b.balance < 0 ? 'text-red-600' : 'text-emerald-600'}`}>{b.balance}</span></TD>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </Wrap>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// 4. SHIFTS & ROSTER (NEW)
// ═══════════════════════════════════════════════════════════════════════════════
const shifts = [
  { name: 'Dr. Kavita Joshi',   dept: 'Cardiology',   shift: 'Morning (6A-2P)',  week: ['M','T','W','T','F','—','—'], status: 'Active' },
  { name: 'Sanjay Kumar',       dept: 'Nursing',       shift: 'Evening (2P-10P)', week: ['M','T','W','T','F','S','—'], status: 'Active' },
  { name: 'Pooja Verma',        dept: 'Accounts',      shift: 'General (9A-6P)',  week: ['M','T','W','T','F','—','—'], status: 'Active' },
  { name: 'Sunita Rao',         dept: 'OT',            shift: 'Morning (6A-2P)',  week: ['—','T','W','T','F','S','S'], status: 'Active' },
  { name: 'Mohammed Iqbal',     dept: 'Housekeeping',  shift: 'Night (10P-6A)',   week: ['M','—','W','T','F','S','—'], status: 'Active' },
  { name: 'Meena Nair',         dept: 'Pharmacy',      shift: 'General (9A-6P)',  week: ['M','T','—','T','F','—','—'], status: 'Active' },
];
const days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

export const HRShiftsPage = () => (
  <Wrap title="Shifts & Roster" subtitle="Weekly shift scheduling and roster management">
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
      <KPI label="Morning Shift"  value="186" sub="06:00 AM – 02:00 PM" icon={CalendarCheck} color="text-teal-600" />
      <KPI label="Evening Shift"  value="154" sub="02:00 PM – 10:00 PM" icon={Clock}         color="text-amber-600" />
      <KPI label="Night Shift"    value="62"  sub="10:00 PM – 06:00 AM" icon={Star}          color="text-blue-600" />
      <KPI label="Weekly Off Today" value="80" sub="Roster off today"   icon={CalendarOff}   color="text-slate-600" />
    </div>
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base">Weekly Roster — Mar 17–23, 2026</CardTitle>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-1"><Download className="h-4 w-4" />Export</Button>
          <Button size="sm" className="gap-1 bg-teal-600 hover:bg-teal-700"><PlusCircle className="h-4 w-4" />Assign Shift</Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <TH>Employee</TH><TH>Department</TH><TH>Shift</TH>
                {days.map(d => <TH key={d}>{d}</TH>)}
                <TH>Status</TH>
              </tr>
            </thead>
            <tbody className="divide-y">
              {shifts.map(r => (
                <tr key={r.name} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <TD><span className="font-medium">{r.name}</span></TD>
                  <TD>{r.dept}</TD>
                  <TD><span className="text-xs">{r.shift}</span></TD>
                  {r.week.map((w, i) => (
                    <td key={i} className="py-2.5 text-center">
                      <span className={`text-xs font-bold ${w === '—' ? 'text-slate-300' : 'text-teal-600'}`}>{w}</span>
                    </td>
                  ))}
                  <TD><Bdg s={r.status} /></TD>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  </Wrap>
);

// ═══════════════════════════════════════════════════════════════════════════════
// 5. ONBOARDING (NEW)
// ═══════════════════════════════════════════════════════════════════════════════
const onboarding = [
  { name: 'Dr. Kavita Joshi',  role: 'Cardiologist',   joined: '01-Mar-26', daysIn: 20,
    tasks: { docs: true, id: true, email: true, training: true, mentor: true, payroll: false } },
  { name: 'Sanjay Kumar',      role: 'Staff Nurse',    joined: '05-Mar-26', daysIn: 16,
    tasks: { docs: true, id: true, email: true, training: true, mentor: false, payroll: false } },
  { name: 'Pooja Verma',       role: 'Billing Exec',   joined: '10-Mar-26', daysIn: 11,
    tasks: { docs: true, id: true, email: false, training: false, mentor: false, payroll: false } },
  { name: 'Mohammed Iqbal',    role: 'Ward Attender',  joined: '12-Mar-26', daysIn: 9,
    tasks: { docs: true, id: false, email: false, training: false, mentor: false, payroll: false } },
];
const taskLabels: Record<string, string> = {
  docs: 'Documents', id: 'ID Card', email: 'Email Setup',
  training: 'Training', mentor: 'Mentor Assigned', payroll: 'Payroll Setup',
};

export const HROnboardingPage = () => (
  <Wrap title="Employee Onboarding" subtitle="Track onboarding progress for new joiners">
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
      <KPI label="Active Onboarding" value="4"  sub="Joined last 30 days"   icon={UserPlus}     color="text-teal-600" />
      <KPI label="Tasks Completed"   value="62%" sub="Across all joiners"    icon={CheckCircle2} color="text-emerald-600" />
      <KPI label="Pending Tasks"     value="14" sub="Need immediate action"  icon={AlertCircle}  color="text-amber-600" />
      <KPI label="Fully Onboarded"   value="1"  sub="This month"             icon={Star}         color="text-blue-600" />
    </div>
    <div className="space-y-4">
      {onboarding.map(emp => {
        const done = Object.values(emp.tasks).filter(Boolean).length;
        const total = Object.values(emp.tasks).length;
        const pct = Math.round((done / total) * 100);
        return (
          <Card key={emp.name}>
            <CardContent className="pt-4">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="font-semibold">{emp.name}</p>
                  <p className="text-xs text-muted-foreground">{emp.role} · Joined {emp.joined} ({emp.daysIn} days)</p>
                </div>
                <div className="text-right">
                  <span className={`text-sm font-bold ${pct === 100 ? 'text-emerald-600' : pct > 50 ? 'text-amber-600' : 'text-red-600'}`}>{pct}%</span>
                  <p className="text-xs text-muted-foreground">{done}/{total} done</p>
                </div>
              </div>
              <div className="h-1.5 bg-slate-100 rounded-full mb-3">
                <div className={`h-full rounded-full ${pct === 100 ? 'bg-emerald-500' : pct > 50 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${pct}%` }} />
              </div>
              <div className="flex flex-wrap gap-2">
                {Object.entries(emp.tasks).map(([k, v]) => (
                  <span key={k} className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full ${v ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                    {v ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                    {taskLabels[k]}
                  </span>
                ))}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  </Wrap>
);

// ═══════════════════════════════════════════════════════════════════════════════
// 6. PAYROLL
// ═══════════════════════════════════════════════════════════════════════════════
const payroll = [
  { id: 'EMP001', name: 'Dr. Kavita Joshi',  dept: 'Cardiology',  gross: 180000, pf: 12000, tds: 18000, other: 2000, net: 148000, status: 'Pending' },
  { id: 'EMP002', name: 'Sanjay Kumar',       dept: 'Nursing',     gross: 45000,  pf: 5400,  tds: 2000,  other: 500,  net: 37100,  status: 'Pending' },
  { id: 'EMP003', name: 'Pooja Verma',        dept: 'Accounts',    gross: 38000,  pf: 4560,  tds: 1500,  other: 400,  net: 31540,  status: 'Pending' },
  { id: 'EMP004', name: 'Mohammed Iqbal',     dept: 'Housekeeping',gross: 22000,  pf: 2640,  tds: 0,     other: 200,  net: 19160,  status: 'Pending' },
  { id: 'EMP005', name: 'Dr. Ramesh Pillai',  dept: 'Orthopaedics',gross: 220000, pf: 12000, tds: 32000, other: 3000, net: 173000, status: 'Pending' },
  { id: 'EMP006', name: 'Sunita Rao',         dept: 'OT',          gross: 32000,  pf: 3840,  tds: 800,   other: 300,  net: 27060,  status: 'Pending' },
];
const fmt = (n: number) => '₹' + n.toLocaleString('en-IN');

export const HRPayrollPage = () => (
  <Wrap title="Payroll Processing" subtitle="Monthly salary computation and disbursement">
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
      <KPI label="Total Payable"    value="₹82.4L" sub="March 2026 gross"    icon={Wallet}     color="text-teal-600" />
      <KPI label="Net Disbursable"  value="₹68.9L" sub="After all deductions" icon={CheckCircle2} color="text-emerald-600" />
      <KPI label="PF Contribution"  value="₹9.8L"  sub="Employer + Employee"  icon={ShieldCheck} color="text-blue-600" />
      <KPI label="TDS Deducted"     value="₹4.2L"  sub="To be remitted"       icon={FileText}   color="text-amber-600" />
    </div>
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base">Payroll Register — March 2026</CardTitle>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-1"><Download className="h-4 w-4" />Export</Button>
          <Button size="sm" className="gap-1 bg-teal-600 hover:bg-teal-700"><CheckCircle2 className="h-4 w-4" />Run Payroll</Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b"><TH>Emp ID</TH><TH>Name</TH><TH>Department</TH><TH>Gross</TH><TH>PF</TH><TH>TDS</TH><TH>Other Ded.</TH><TH>Net Pay</TH><TH>Status</TH></tr></thead>
            <tbody className="divide-y">
              {payroll.map(r => (
                <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <TD><span className="font-mono text-xs">{r.id}</span></TD>
                  <TD><span className="font-medium">{r.name}</span></TD>
                  <TD>{r.dept}</TD>
                  <TD><span className="text-slate-700">{fmt(r.gross)}</span></TD>
                  <TD><span className="text-red-600">-{fmt(r.pf)}</span></TD>
                  <TD><span className="text-red-600">-{fmt(r.tds)}</span></TD>
                  <TD><span className="text-red-600">-{fmt(r.other)}</span></TD>
                  <TD><span className="font-bold text-emerald-700">{fmt(r.net)}</span></TD>
                  <TD><Bdg s={r.status} /></TD>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  </Wrap>
);

// ═══════════════════════════════════════════════════════════════════════════════
// 7. PF & ESI (NEW)
// ═══════════════════════════════════════════════════════════════════════════════
const pfesi = [
  { month: 'Mar-2026', employees: 466, pfEmployee: 980000, pfEmployer: 1100000, esi: 420000, totalPF: 2080000, status: 'Pending' },
  { month: 'Feb-2026', employees: 461, pfEmployee: 970000, pfEmployer: 1090000, esi: 415000, totalPF: 2060000, status: 'Filed' },
  { month: 'Jan-2026', employees: 458, pfEmployee: 965000, pfEmployer: 1085000, esi: 412000, totalPF: 2050000, status: 'Filed' },
  { month: 'Dec-2025', employees: 455, pfEmployee: 960000, pfEmployer: 1080000, esi: 410000, totalPF: 2040000, status: 'Filed' },
];

export const HRPfEsiPage = () => (
  <Wrap title="PF & ESI" subtitle="Provident Fund and ESI contribution register & challan">
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
      <KPI label="PF Account No."  value="KN/25894" sub="Registered with EPFO"    icon={ShieldCheck} color="text-teal-600" />
      <KPI label="ESI Account No." value="32-00001" sub="Registered with ESIC"    icon={ShieldCheck} color="text-blue-600" />
      <KPI label="PF Rate"         value="12%"      sub="Employee & Employer each" icon={Wallet}      color="text-emerald-600" />
      <KPI label="ESI Rate"        value="3.25%"    sub="Employer / 0.75% Employee" icon={FileText}   color="text-amber-600" />
    </div>
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base">PF & ESI Challan Register</CardTitle>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-1"><Download className="h-4 w-4" />Download Challan</Button>
          <Button size="sm" className="gap-1 bg-teal-600 hover:bg-teal-700"><PlusCircle className="h-4 w-4" />Generate Challan</Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b"><TH>Month</TH><TH>Employees</TH><TH>PF (Employee)</TH><TH>PF (Employer)</TH><TH>ESI</TH><TH>Total PF</TH><TH>Status</TH></tr></thead>
            <tbody className="divide-y">
              {pfesi.map(r => (
                <tr key={r.month} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <TD><span className="font-medium">{r.month}</span></TD>
                  <TD center>{r.employees}</TD>
                  <TD>{fmt(r.pfEmployee)}</TD>
                  <TD>{fmt(r.pfEmployer)}</TD>
                  <TD>{fmt(r.esi)}</TD>
                  <TD><span className="font-bold">{fmt(r.totalPF)}</span></TD>
                  <TD><Bdg s={r.status} /></TD>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  </Wrap>
);

// ═══════════════════════════════════════════════════════════════════════════════
// 8. BENEFITS (NEW)
// ═══════════════════════════════════════════════════════════════════════════════
const benefits = [
  { name: 'Group Health Insurance', provider: 'Star Health', coverage: '₹3L/employee', enrolled: 462, premium: '₹12.4L/yr', status: 'Active' },
  { name: 'Term Life Insurance',    provider: 'LIC',         coverage: '₹15L',         enrolled: 450, premium: '₹8.2L/yr',  status: 'Active' },
  { name: 'Accident Insurance',     provider: 'New India',   coverage: '₹5L',          enrolled: 466, premium: '₹3.1L/yr',  status: 'Active' },
  { name: 'Canteen Subsidy',        provider: 'Internal',    coverage: '₹50/day',      enrolled: 380, premium: '₹5.7L/yr',  status: 'Active' },
  { name: 'Transport Allowance',    provider: 'Internal',    coverage: '₹2,000/month', enrolled: 290, premium: '₹5.8L/yr',  status: 'Active' },
  { name: 'Children Education',     provider: 'LIC',         coverage: '₹15,000/yr',   enrolled: 120, premium: '₹1.8L/yr',  status: 'Active' },
];

export const HRBenefitsPage = () => (
  <Wrap title="Employee Benefits" subtitle="Insurance, allowances & wellness benefits management">
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
      <KPI label="Total Benefits"    value="6"      sub="Active benefit programs"  icon={Gift}        color="text-teal-600" />
      <KPI label="Annual Cost"       value="₹37L"   sub="FY 2025-26"               icon={Wallet}      color="text-emerald-600" />
      <KPI label="Health Enrolled"   value="462"    sub="Group health insurance"   icon={ShieldCheck} color="text-blue-600" />
      <KPI label="Renewal (Apr)"     value="3"      sub="Policies up for renewal"  icon={AlertCircle} color="text-amber-600" />
    </div>
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base">Benefits Register</CardTitle>
        <Button size="sm" className="gap-1 bg-teal-600 hover:bg-teal-700"><PlusCircle className="h-4 w-4" />Add Benefit</Button>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b"><TH>Benefit</TH><TH>Provider</TH><TH>Coverage</TH><TH>Enrolled</TH><TH>Annual Premium</TH><TH>Status</TH></tr></thead>
            <tbody className="divide-y">
              {benefits.map(b => (
                <tr key={b.name} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <TD><span className="font-medium">{b.name}</span></TD>
                  <TD>{b.provider}</TD>
                  <TD>{b.coverage}</TD>
                  <TD center><span className="font-semibold">{b.enrolled}</span></TD>
                  <TD><span className="font-semibold text-emerald-700">{b.premium}</span></TD>
                  <TD><Bdg s={b.status} /></TD>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  </Wrap>
);

// ═══════════════════════════════════════════════════════════════════════════════
// 9. RECRUITMENT
// ═══════════════════════════════════════════════════════════════════════════════
const jobs = [
  { id: 'JD001', title: 'Cardiologist',       dept: 'Cardiology',  posted: '01-Mar-26', applicants: 18, shortlisted: 5, status: 'Open' },
  { id: 'JD002', title: 'ICU Nurse',          dept: 'Nursing',     posted: '05-Mar-26', applicants: 42, shortlisted: 8, status: 'Open' },
  { id: 'JD003', title: 'Radiographer',       dept: 'Radiology',   posted: '10-Mar-26', applicants: 12, shortlisted: 3, status: 'Open' },
  { id: 'JD004', title: 'Medical Coder',      dept: 'Accounts',    posted: '01-Feb-26', applicants: 35, shortlisted: 6, status: 'Closed' },
  { id: 'JD005', title: 'Lab Technician',     dept: 'Lab',         posted: '15-Mar-26', applicants: 8,  shortlisted: 2, status: 'Open' },
  { id: 'JD006', title: 'Ward Admin',         dept: 'Admin',       posted: '18-Mar-26', applicants: 22, shortlisted: 4, status: 'Open' },
];

export const HRRecruitmentPage = () => (
  <Wrap title="Recruitment" subtitle="Job postings, candidate pipeline & interview tracking">
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
      <KPI label="Open Positions"    value="5"   sub="Active job postings"     icon={Briefcase}   color="text-teal-600" />
      <KPI label="Total Applicants"  value="102" sub="Across all roles"        icon={Users}       color="text-blue-600" />
      <KPI label="Shortlisted"       value="22"  sub="Pending interview"       icon={UserPlus}    color="text-amber-600" />
      <KPI label="Hired (Month)"     value="4"   sub="Offer letters issued"    icon={CheckCircle2} color="text-emerald-600" />
    </div>
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base">Job Postings</CardTitle>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-1"><Download className="h-4 w-4" />Export</Button>
          <Button size="sm" className="gap-1 bg-teal-600 hover:bg-teal-700"><PlusCircle className="h-4 w-4" />New Posting</Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b"><TH>JD ID</TH><TH>Position</TH><TH>Department</TH><TH>Posted</TH><TH>Applicants</TH><TH>Shortlisted</TH><TH>Status</TH><TH>Actions</TH></tr></thead>
            <tbody className="divide-y">
              {jobs.map(j => (
                <tr key={j.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <TD><span className="font-mono text-xs">{j.id}</span></TD>
                  <TD><span className="font-medium">{j.title}</span></TD>
                  <TD>{j.dept}</TD>
                  <TD>{j.posted}</TD>
                  <TD center><span className="font-semibold">{j.applicants}</span></TD>
                  <TD center><span className="font-semibold text-teal-600">{j.shortlisted}</span></TD>
                  <TD><Bdg s={j.status} /></TD>
                  <TD><button className="p-1 hover:bg-slate-100 rounded"><Eye className="h-4 w-4 text-slate-500" /></button></TD>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  </Wrap>
);

// ═══════════════════════════════════════════════════════════════════════════════
// 10. TRAINING
// ═══════════════════════════════════════════════════════════════════════════════
const trainings = [
  { id: 'TR001', title: 'BLS & CPR Certification',        dept: 'All Clinical',  trainer: 'Dr. Mohan R.',   date: '15-Mar-26', enrolled: 45, completed: 42, status: 'Completed' },
  { id: 'TR002', title: 'Fire Safety & Evacuation Drill', dept: 'All',           trainer: 'Safety Officer', date: '18-Mar-26', enrolled: 120,completed: 118,status: 'Completed' },
  { id: 'TR003', title: 'Infection Control Protocol',     dept: 'Nursing & OT',  trainer: 'ICNO Team',      date: '22-Mar-26', enrolled: 60, completed: 0,  status: 'Scheduled' },
  { id: 'TR004', title: 'EHR System Training',            dept: 'Admin & Billing',trainer: 'IT Team',       date: '25-Mar-26', enrolled: 35, completed: 0,  status: 'Scheduled' },
  { id: 'TR005', title: 'NABH Standards Refresher',       dept: 'All HODs',      trainer: 'QA Team',        date: '28-Mar-26', enrolled: 22, completed: 0,  status: 'Scheduled' },
];

export const HRTrainingPage = () => (
  <Wrap title="Training & Development" subtitle="Training schedules, completions & certifications">
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
      <KPI label="Programs (Month)" value="5"  sub="March 2026"                icon={GraduationCap} color="text-teal-600" />
      <KPI label="Completed"        value="2"  sub="BLS, Fire Safety"           icon={CheckCircle2}  color="text-emerald-600" />
      <KPI label="Upcoming"        value="3"  sub="Next 10 days"               icon={Calendar}      color="text-amber-600" />
      <KPI label="Certifications Expiring" value="5" sub="Within 30 days"     icon={AlertCircle}   color="text-red-600" />
    </div>
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base">Training Calendar</CardTitle>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-1"><Download className="h-4 w-4" />Export</Button>
          <Button size="sm" className="gap-1 bg-teal-600 hover:bg-teal-700"><PlusCircle className="h-4 w-4" />Schedule</Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b"><TH>ID</TH><TH>Program</TH><TH>Department</TH><TH>Trainer</TH><TH>Date</TH><TH>Enrolled</TH><TH>Completed</TH><TH>Status</TH></tr></thead>
            <tbody className="divide-y">
              {trainings.map(t => (
                <tr key={t.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <TD><span className="font-mono text-xs">{t.id}</span></TD>
                  <TD><span className="font-medium">{t.title}</span></TD>
                  <TD><span className="text-xs">{t.dept}</span></TD>
                  <TD>{t.trainer}</TD>
                  <TD>{t.date}</TD>
                  <TD center>{t.enrolled}</TD>
                  <TD center><span className={t.completed === t.enrolled && t.enrolled > 0 ? 'text-emerald-600 font-semibold' : ''}>{t.completed}</span></TD>
                  <TD><Bdg s={t.status} /></TD>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  </Wrap>
);

// ═══════════════════════════════════════════════════════════════════════════════
// 11. PERFORMANCE
// ═══════════════════════════════════════════════════════════════════════════════
const perf = [
  { name: 'Dr. Kavita Joshi',  dept: 'Cardiology', rating: 5, kra: 92, attendance: 98, patient: 96, overall: 'Exceptional' },
  { name: 'Sanjay Kumar',      dept: 'Nursing',    rating: 4, kra: 85, attendance: 94, patient: 88, overall: 'Good' },
  { name: 'Pooja Verma',       dept: 'Accounts',   rating: 4, kra: 80, attendance: 90, patient: 82, overall: 'Good' },
  { name: 'Mohammed Iqbal',    dept: 'Housekeeping',rating:3, kra: 72, attendance: 75, patient: 78, overall: 'Average' },
  { name: 'Dr. Ramesh Pillai', dept: 'Orthopaedics',rating:5, kra: 95, attendance: 99, patient: 97, overall: 'Exceptional' },
  { name: 'Sunita Rao',        dept: 'OT',         rating: 4, kra: 88, attendance: 96, patient: 90, overall: 'Good' },
];
const ratingColor: Record<string, string> = {
  Exceptional: 'text-emerald-600', Good: 'text-blue-600', Average: 'text-amber-600', Poor: 'text-red-600',
};

export const HRPerformancePage = () => (
  <Wrap title="Performance Management" subtitle="KRA reviews, ratings & performance tracking">
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
      <KPI label="Reviews Due (Q1)"  value="82"   sub="Jan–Mar 2026"           icon={Star}        color="text-amber-600" />
      <KPI label="Exceptional"       value="24"   sub="Rating ≥ 4.5"           icon={Star}        color="text-emerald-600" />
      <KPI label="Needs Improvement" value="11"   sub="Rating < 3"             icon={AlertCircle} color="text-red-600" />
      <KPI label="Avg Dept Score"    value="86%"  sub="Hospital-wide"          icon={BarChart3}   color="text-teal-600" />
    </div>
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base">Performance Reviews — Q1 2026</CardTitle>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-1"><Download className="h-4 w-4" />Export</Button>
          <Button size="sm" className="gap-1 bg-teal-600 hover:bg-teal-700"><PlusCircle className="h-4 w-4" />Start Review</Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b"><TH>Employee</TH><TH>Department</TH><TH>KRA Score</TH><TH>Attendance</TH><TH>Patient Score</TH><TH>Rating</TH><TH>Overall</TH></tr></thead>
            <tbody className="divide-y">
              {perf.map(p => (
                <tr key={p.name} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <TD><span className="font-medium">{p.name}</span></TD>
                  <TD>{p.dept}</TD>
                  <TD center><span className="font-semibold">{p.kra}%</span></TD>
                  <TD center><span className="font-semibold">{p.attendance}%</span></TD>
                  <TD center><span className="font-semibold">{p.patient}%</span></TD>
                  <TD center>{'★'.repeat(p.rating)}<span className="text-slate-300">{'★'.repeat(5 - p.rating)}</span></TD>
                  <TD><span className={`font-semibold ${ratingColor[p.overall]}`}>{p.overall}</span></TD>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  </Wrap>
);

// ═══════════════════════════════════════════════════════════════════════════════
// 12. APPRAISALS (NEW)
// ═══════════════════════════════════════════════════════════════════════════════
const appraisals = [
  { name: 'Dr. Kavita Joshi',  dept: 'Cardiology',  current: 180000, increment: 18000, revised: 198000, effectiveFrom: 'Apr-2026', status: 'Approved' },
  { name: 'Sanjay Kumar',      dept: 'Nursing',     current: 45000,  increment: 3600,  revised: 48600,  effectiveFrom: 'Apr-2026', status: 'Approved' },
  { name: 'Pooja Verma',       dept: 'Accounts',    current: 38000,  increment: 2660,  revised: 40660,  effectiveFrom: 'Apr-2026', status: 'Pending' },
  { name: 'Mohammed Iqbal',    dept: 'Housekeeping',current: 22000,  increment: 1100,  revised: 23100,  effectiveFrom: 'Apr-2026', status: 'Pending' },
  { name: 'Dr. Ramesh Pillai', dept: 'Orthopaedics',current: 220000, increment: 33000, revised: 253000, effectiveFrom: 'Apr-2026', status: 'Approved' },
];

export const HRAppraisalsPage = () => (
  <Wrap title="Appraisals & Increments" subtitle="Annual salary revision and increment tracking">
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
      <KPI label="Appraisal Cycle"   value="Apr-2026" sub="Effective date"          icon={Calendar}    color="text-teal-600" />
      <KPI label="Total Employees"   value="466"      sub="Eligible for appraisal"  icon={Users}       color="text-blue-600" />
      <KPI label="Approved"          value="312"      sub="Letters issued"           icon={CheckCircle2} color="text-emerald-600" />
      <KPI label="Pending"           value="154"      sub="Awaiting manager sign-off" icon={AlertCircle} color="text-amber-600" />
    </div>
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base">Increment Register — FY 2026-27</CardTitle>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-1"><Download className="h-4 w-4" />Export</Button>
          <Button size="sm" className="gap-1 bg-teal-600 hover:bg-teal-700"><PlusCircle className="h-4 w-4" />Issue Letter</Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b"><TH>Employee</TH><TH>Department</TH><TH>Current CTC</TH><TH>Increment</TH><TH>Revised CTC</TH><TH>Effective From</TH><TH>Status</TH></tr></thead>
            <tbody className="divide-y">
              {appraisals.map(a => (
                <tr key={a.name} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <TD><span className="font-medium">{a.name}</span></TD>
                  <TD>{a.dept}</TD>
                  <TD>{fmt(a.current)}</TD>
                  <TD><span className="text-emerald-600 font-semibold">+{fmt(a.increment)}</span></TD>
                  <TD><span className="font-bold">{fmt(a.revised)}</span></TD>
                  <TD>{a.effectiveFrom}</TD>
                  <TD><Bdg s={a.status} /></TD>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  </Wrap>
);

// ═══════════════════════════════════════════════════════════════════════════════
// 13. HR REPORTS
// ═══════════════════════════════════════════════════════════════════════════════
const reportTypes = [
  { name: 'Headcount Report',     icon: Users,       desc: 'Total staff by dept, type, and grade' },
  { name: 'Attendance Summary',   icon: CalendarCheck,desc: 'Monthly presence/absence/late analysis' },
  { name: 'Leave Utilization',    icon: CalendarOff, desc: 'Leave availed vs entitlement by type' },
  { name: 'Payroll Summary',      icon: Wallet,       desc: 'Gross, deductions, net disbursable' },
  { name: 'Turnover Report',      icon: TrendingUp,   desc: 'Attrition rate, exits, new hires' },
  { name: 'Training Completion',  icon: GraduationCap,desc: 'Program-wise completion rates' },
  { name: 'PF & ESI Remittance',  icon: ShieldCheck,  desc: 'Monthly challan & compliance status' },
  { name: 'Performance Summary',  icon: Star,         desc: 'Ratings distribution and top performers' },
];

export const HRReportsPage = () => (
  <Wrap title="HR Reports" subtitle="Workforce analytics, compliance & statutory reports">
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
      <KPI label="Reports Generated" value="24"  sub="This month"             icon={FileText}  color="text-teal-600" />
      <KPI label="Compliance Reports" value="6"  sub="PF, ESI, TDS, etc."    icon={ShieldCheck} color="text-emerald-600" />
      <KPI label="Scheduled Reports" value="8"   sub="Auto-generated monthly" icon={Calendar}  color="text-blue-600" />
      <KPI label="Pending Reviews"   value="3"   sub="Awaiting HOD sign-off"  icon={AlertCircle} color="text-amber-600" />
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
      {reportTypes.map(r => (
        <Card key={r.name} className="hover:shadow-md transition-shadow cursor-pointer group">
          <CardContent className="p-5">
            <div className="p-3 rounded-xl bg-teal-50 dark:bg-teal-950 w-fit mb-3 group-hover:bg-teal-100 transition-colors">
              <r.icon className="h-6 w-6 text-teal-600" />
            </div>
            <p className="font-semibold text-sm">{r.name}</p>
            <p className="text-xs text-muted-foreground mt-1">{r.desc}</p>
            <Button variant="ghost" size="sm" className="mt-3 text-teal-600 p-0 h-auto text-xs gap-1">
              <Download className="h-3 w-3" />Generate →
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  </Wrap>
);

// ═══════════════════════════════════════════════════════════════════════════════
// 14. HR ANALYTICS (NEW)
// ═══════════════════════════════════════════════════════════════════════════════
const deptHeadcount = [
  { dept: 'Nursing',           count: 132, male: 30, female: 102, attrition: 2.1 },
  { dept: 'Clinical Staff',    count: 86,  male: 48, female: 38,  attrition: 1.2 },
  { dept: 'Administration',    count: 62,  male: 28, female: 34,  attrition: 3.2 },
  { dept: 'Housekeeping',      count: 78,  male: 62, female: 16,  attrition: 8.5 },
  { dept: 'Lab & Radiology',   count: 44,  male: 22, female: 22,  attrition: 1.8 },
  { dept: 'Pharmacy',          count: 28,  male: 12, female: 16,  attrition: 0.0 },
  { dept: 'OT & Anaesthesia',  count: 32,  male: 14, female: 18,  attrition: 1.5 },
  { dept: 'ICU',               count: 20,  male: 8,  female: 12,  attrition: 3.0 },
];

export const HRAnalyticsPage = () => (
  <Wrap title="HR Analytics" subtitle="Workforce trends, attrition analysis & cost insights">
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
      <KPI label="Total Headcount"  value="482"  sub="Mar 2026"              icon={Users}     color="text-teal-600" />
      <KPI label="Attrition Rate"   value="3.2%" sub="Rolling 12 months"    icon={TrendingUp} color="text-red-600" />
      <KPI label="Male / Female"    value="266/216" sub="55% / 45%"         icon={UserCog}   color="text-blue-600" />
      <KPI label="Avg Tenure"       value="4.2 yrs" sub="Hospital-wide"    icon={Star}       color="text-emerald-600" />
    </div>
    <Card>
      <CardHeader className="pb-3"><CardTitle className="text-base">Department-wise Headcount & Attrition</CardTitle></CardHeader>
      <CardContent>
        <div className="space-y-4">
          {deptHeadcount.map(d => {
            const maxCount = Math.max(...deptHeadcount.map(x => x.count));
            const pct = Math.round((d.count / maxCount) * 100);
            return (
              <div key={d.dept}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="font-medium">{d.dept}</span>
                  <span className="text-muted-foreground">
                    {d.count} staff · M:{d.male} F:{d.female} ·{' '}
                    <span className={d.attrition > 5 ? 'text-red-600 font-semibold' : d.attrition > 2 ? 'text-amber-600' : 'text-emerald-600'}>
                      {d.attrition}% attrition
                    </span>
                  </span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-teal-500 rounded-full" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  </Wrap>
);

// ═══════════════════════════════════════════════════════════════════════════════
// 15. COMPLIANCE (NEW)
// ═══════════════════════════════════════════════════════════════════════════════
const compliance = [
  { act: 'EPF & MP Act 1952',     filing: 'Monthly Challan',        due: '15-Apr-26', status: 'Due',     ref: 'EPFO' },
  { act: 'ESI Act 1948',          filing: 'Monthly Contribution',   due: '21-Apr-26', status: 'Due',     ref: 'ESIC' },
  { act: 'Income Tax Act',        filing: 'Form 24Q (TDS Q4)',      due: '31-May-26', status: 'Pending', ref: 'TRACES' },
  { act: 'Payment of Gratuity',   filing: 'Annual Return Form F',   due: '30-Apr-26', status: 'Pending', ref: 'Labour Dept' },
  { act: 'Maternity Benefit Act', filing: 'Annual Return',          due: '31-Jan-26', status: 'Filed',   ref: 'Labour Dept' },
  { act: 'Minimum Wages Act',     filing: 'Half-Yearly Return',     due: '31-Mar-26', status: 'Filed',   ref: 'Labour Dept' },
  { act: 'Contract Labour Act',   filing: 'Annual Return XII',      due: '15-Feb-26', status: 'Filed',   ref: 'Labour Dept' },
  { act: 'POSH Act 2013',         filing: 'Annual Report to Dist.', due: '31-Jan-26', status: 'Filed',   ref: 'District Off.' },
];

export const HRCompliancePage = () => (
  <Wrap title="HR Compliance" subtitle="Labour law compliance, statutory filings & due dates">
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
      <KPI label="Total Filings"   value="12"  sub="FY 2025-26"              icon={FileText}    color="text-teal-600" />
      <KPI label="Filed"           value="5"   sub="On time"                 icon={CheckCircle2} color="text-emerald-600" />
      <KPI label="Due (Apr)"       value="4"   sub="Upcoming deadlines"      icon={AlertCircle} color="text-amber-600" />
      <KPI label="Overdue"         value="0"   sub="No pending violations"   icon={ShieldCheck} color="text-emerald-600" />
    </div>
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base">Statutory Compliance Register</CardTitle>
        <Button size="sm" className="gap-1 bg-teal-600 hover:bg-teal-700"><PlusCircle className="h-4 w-4" />Add Filing</Button>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b"><TH>Act / Law</TH><TH>Filing Type</TH><TH>Due Date</TH><TH>Authority</TH><TH>Status</TH></tr></thead>
            <tbody className="divide-y">
              {compliance.map(c => (
                <tr key={c.act} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <TD><span className="font-medium">{c.act}</span></TD>
                  <TD>{c.filing}</TD>
                  <TD>{c.due}</TD>
                  <TD><span className="text-xs text-muted-foreground">{c.ref}</span></TD>
                  <TD><Bdg s={c.status} /></TD>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  </Wrap>
);

// ═══════════════════════════════════════════════════════════════════════════════
// 16. SETTINGS
// ═══════════════════════════════════════════════════════════════════════════════
export const HRSettingsPage = () => (
  <Wrap title="HR Settings" subtitle="Configure HR portal, policies and access controls">
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {[
        { title: 'Organisation Details', icon: Building2, fields: [
          { label: 'Hospital Name',    value: 'Mediczy Hospital' },
          { label: 'PF Account No.',   value: 'KN/25894' },
          { label: 'ESI Account No.',  value: '32-00001' },
          { label: 'TAN Number',       value: 'BLRM01234F' },
        ]},
        { title: 'Leave Policy', icon: CalendarOff, fields: [
          { label: 'Casual Leave / Year',  value: '12 days' },
          { label: 'Medical Leave / Year', value: '12 days' },
          { label: 'Annual Leave / Year',  value: '21 days' },
          { label: 'Carry Forward Limit',  value: '15 days' },
        ]},
        { title: 'Payroll Config', icon: Wallet, fields: [
          { label: 'Payroll Cycle',    value: 'Monthly (Last Working Day)' },
          { label: 'PF Rate',          value: '12% (Employee & Employer)' },
          { label: 'ESI Rate',         value: '3.25% (Employer) / 0.75%' },
          { label: 'Gratuity Formula', value: '15/26 × Basic × Years' },
        ]},
        { title: 'Access Controls', icon: ShieldCheck, fields: [
          { label: 'HR Manager',       value: 'Full Access' },
          { label: 'Dept HODs',        value: 'View + Approve Leaves' },
          { label: 'Payroll Team',     value: 'Payroll Module Only' },
          { label: 'Staff',            value: 'Self-Service (Leaves, Slip)' },
        ]},
      ].map(sec => (
        <Card key={sec.title}>
          <CardHeader className="flex flex-row items-center gap-2 pb-3">
            <div className="p-2 rounded-xl bg-teal-50 dark:bg-teal-950">
              <sec.icon className="h-4 w-4 text-teal-600" />
            </div>
            <CardTitle className="text-sm">{sec.title}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {sec.fields.map(f => (
              <div key={f.label} className="flex justify-between text-sm border-b pb-2 last:border-0 last:pb-0">
                <span className="text-muted-foreground">{f.label}</span>
                <span className="font-medium text-right max-w-[55%]">{f.value}</span>
              </div>
            ))}
            <Button variant="outline" size="sm" className="w-full mt-2 gap-1"><Edit className="h-4 w-4" />Edit</Button>
          </CardContent>
        </Card>
      ))}
    </div>
  </Wrap>
);

// ═══════════════════════════════════════════════════════════════════════════════
// 17. SUPPORT
// ═══════════════════════════════════════════════════════════════════════════════
const faqs = [
  { q: 'How do I apply for leave?',          a: 'Go to Leave Management → Apply Leave. Your manager will be notified for approval.' },
  { q: 'When is salary credited?',           a: 'Salary is processed on the last working day of each month via bank transfer.' },
  { q: 'How to get a salary slip?',          a: 'Download from Payroll module → select month → Download Slip.' },
  { q: 'How to update personal details?',    a: 'Contact HR admin with supporting documents. Profile updates require HR approval.' },
  { q: 'PF withdrawal process?',             a: 'Submit Form 19 (PF withdrawal) or Form 31 (advance) to HR, will be processed via EPFO portal.' },
];

export const HRSupportPage = () => (
  <Wrap title="Help & Support" subtitle="HR helpdesk, FAQs and contact information">
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-4">
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Frequently Asked Questions</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {faqs.map(f => (
              <div key={f.q} className="border-b pb-4 last:border-0">
                <p className="font-semibold text-sm mb-1">{f.q}</p>
                <p className="text-sm text-muted-foreground">{f.a}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">HR Contact</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            {[
              { icon: Phone,   label: 'HR Helpdesk', value: '080-4567-8901' },
              { icon: Mail,    label: 'Email',        value: 'hr@mediczy.com' },
              { icon: MapPin,  label: 'Office',       value: 'Admin Block, 2nd Floor' },
              { icon: Clock,   label: 'Hours',        value: 'Mon–Sat 9AM–6PM' },
            ].map(c => (
              <div key={c.label} className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-teal-50 dark:bg-teal-950">
                  <c.icon className="h-4 w-4 text-teal-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{c.label}</p>
                  <p className="font-medium">{c.value}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Quick Links</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {[
              { label: 'EPFO Portal',    href: 'https://www.epfindia.gov.in' },
              { label: 'ESIC Portal',    href: 'https://www.esic.in' },
              { label: 'TRACES (TDS)',   href: 'https://www.tdscpc.gov.in' },
              { label: 'Labour Dept.',   href: 'https://labour.gov.in' },
            ].map(l => (
              <a key={l.label} href={l.href} target="_blank" rel="noopener noreferrer"
                className="flex items-center justify-between text-sm p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                <span className="text-teal-600 font-medium">{l.label}</span>
                <span className="text-muted-foreground text-xs">→</span>
              </a>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  </Wrap>
);
