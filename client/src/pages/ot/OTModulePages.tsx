import React, { useState, useEffect } from 'react';
import HospDeptLayout, { DeptNavSection } from '@/components/hosp-dept/HospDeptLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Scissors, CalendarDays, Users, Stethoscope, Syringe, HeartPulse,
  ClipboardList, BarChart3, Settings, HelpCircle, PlusCircle, Download,
  Search, Eye, Edit2, CheckCircle2, AlertCircle, FileText, Package,
  ShieldCheck, TrendingUp, Activity, Clock, ClipboardCheck, Wrench,
  FlaskConical, RefreshCw, LayoutDashboard,
  Wifi, Thermometer, Wind, Gauge, Signal, LayoutGrid,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

// ─── Shared nav (imported by OTDashboard) ─────────────────────────────────────
export const otNavSections: DeptNavSection[] = [
  {
    title: 'Overview',
    items: [
      { icon: LayoutDashboard, label: 'Dashboard',    href: '/ot/dashboard'      },
      { icon: LayoutGrid,      label: 'Theatre View', href: '/ot/theatre-view'   },
    ],
  },
  {
    title: 'Scheduling',
    items: [
      { icon: CalendarDays,   label: 'OT Schedule',      href: '/ot/schedule' },
      { icon: ClipboardCheck, label: 'Pre-Op Checklist', href: '/ot/pre-op' },
      { icon: FileText,       label: 'Consent Forms',    href: '/ot/consent' },
    ],
  },
  {
    title: 'Theatre Management',
    items: [
      { icon: Users,        label: 'Surgical Teams',     href: '/ot/teams' },
      { icon: Wrench,       label: 'Equipment',          href: '/ot/equipment' },
      { icon: FlaskConical, label: 'Sterilization',      href: '/ot/sterilization' },
      { icon: Package,      label: 'Implants & Supplies',href: '/ot/implants' },
    ],
  },
  {
    title: 'Clinical',
    items: [
      { icon: Syringe,       label: 'Anesthesia',     href: '/ot/anesthesia' },
      { icon: ShieldCheck,   label: 'Surgical Safety', href: '/ot/safety' },
      { icon: HeartPulse,    label: 'Post-Op Care',    href: '/ot/post-op' },
      { icon: ClipboardList, label: 'OT Records',      href: '/ot/records' },
    ],
  },
  {
    title: 'Reports',
    items: [
      { icon: BarChart3,  label: 'Reports',   href: '/ot/reports' },
      { icon: TrendingUp, label: 'Analytics', href: '/ot/analytics' },
    ],
  },
  {
    title: 'System',
    items: [
      { icon: Settings,   label: 'Settings', href: '/ot/settings' },
      { icon: HelpCircle, label: 'Support',  href: '/ot/support' },
    ],
  },
];

// ─── Shared helpers ───────────────────────────────────────────────────────────
const Wrap = ({ title, subtitle, children, actions }: {
  title: string; subtitle: string; children: React.ReactNode; actions?: React.ReactNode;
}) => (
  <HospDeptLayout deptKey="ot" deptName="Operation Theatre" badgeLabel="OT"
    loginPath="/ot/login" DeptIcon={Scissors} navSections={otNavSections}
    title={title} subtitle={subtitle} copilotModule="ot">
    <div className="space-y-5">
      <div className="flex items-center justify-between"><div /><div className="flex gap-2">{actions}</div></div>
      {children}
    </div>
  </HospDeptLayout>
);

const KPI = ({ label, value, sub, icon: Icon, color }: {
  label: string; value: string; sub: string; icon: LucideIcon; color: string;
}) => (
  <Card className="hover:shadow-md transition-shadow">
    <CardContent className="p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-muted-foreground font-medium">{label}</p>
          <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
          <p className="text-xs text-muted-foreground mt-1">{sub}</p>
        </div>
        <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800">
          {React.createElement(Icon, { className: `h-5 w-5 ${color}` })}
        </div>
      </div>
    </CardContent>
  </Card>
);

const sc: Record<string, string> = {
  Completed:    'bg-emerald-100 text-emerald-700',
  'In Progress':'bg-blue-100 text-blue-700',
  Upcoming:     'bg-slate-100 text-slate-600',
  Postponed:    'bg-amber-100 text-amber-700',
  Emergency:    'bg-red-100 text-red-700',
  Cancelled:    'bg-red-100 text-red-700',
  Ready:        'bg-emerald-100 text-emerald-700',
  'In Use':     'bg-blue-100 text-blue-700',
  Maintenance:  'bg-amber-100 text-amber-700',
  Sterilized:   'bg-emerald-100 text-emerald-700',
  Running:      'bg-teal-100 text-teal-700',
  Pending:      'bg-amber-100 text-amber-700',
  Done:         'bg-emerald-100 text-emerald-700',
  Active:       'bg-emerald-100 text-emerald-700',
  Inactive:     'bg-slate-100 text-slate-600',
  Signed:       'bg-emerald-100 text-emerald-700',
  Unsigned:     'bg-amber-100 text-amber-700',
  Available:    'bg-emerald-100 text-emerald-700',
  'Low Stock':  'bg-amber-100 text-amber-700',
  'Out of Stock':'bg-red-100 text-red-700',
  Used:         'bg-slate-100 text-slate-600',
};

const Bdg = ({ s }: { s: string }) => (
  <Badge className={`${sc[s] || 'bg-slate-100 text-slate-600'} border-0 text-xs`}>{s}</Badge>
);

const TH = ({ children, cls = '' }: { children: React.ReactNode; cls?: string }) => (
  <th className={`pb-2 text-left font-medium text-muted-foreground text-xs uppercase tracking-wide ${cls}`}>{children}</th>
);

const TD = ({ children, cls = '' }: { children: React.ReactNode; cls?: string }) => (
  <td className={`py-2.5 text-sm ${cls}`}>{children}</td>
);

const fmt = (n: number) => n.toLocaleString('en-IN');

// ─── 1. OT Schedule ───────────────────────────────────────────────────────────
const schedule = [
  { otNo: 'OT-1', patient: 'Rajesh Malhotra', surgeon: 'Dr. Mehta',  procedure: 'CABG',             specialty: 'Cardiothoracic', time: '08:00', duration: '4h 30m', status: 'Completed',   asa: 'III' },
  { otNo: 'OT-2', patient: 'Sangita Rao',      surgeon: 'Dr. Sharma', procedure: 'Hip Replacement',  specialty: 'Orthopaedic',    time: '09:30', duration: '2h 45m', status: 'In Progress', asa: 'II'  },
  { otNo: 'OT-3', patient: 'Fatima Khan',      surgeon: 'Dr. Joshi',  procedure: 'Lap Chole',        specialty: 'General Surg.',  time: '10:00', duration: '1h 15m', status: 'Completed',   asa: 'I'   },
  { otNo: 'OT-3', patient: 'Ramesh Tiwari',    surgeon: 'Dr. Joshi',  procedure: 'Inguinal Hernia',  specialty: 'General Surg.',  time: '12:30', duration: '1h 30m', status: 'In Progress', asa: 'II'  },
  { otNo: 'OT-1', patient: 'Nikhil Desai',     surgeon: 'Dr. Mehta',  procedure: 'Appendectomy',     specialty: 'General Surg.',  time: '14:00', duration: '1h 00m', status: 'Upcoming',    asa: 'I'   },
  { otNo: 'OT-2', patient: 'Priya Nair',       surgeon: 'Dr. Gupta',  procedure: 'Knee Replacement', specialty: 'Orthopaedic',    time: '15:00', duration: '2h 30m', status: 'Upcoming',    asa: 'II'  },
  { otNo: 'OT-4', patient: 'Arun Krishnan',    surgeon: 'Dr. Rao',    procedure: 'Craniotomy',       specialty: 'Neuro Surg.',    time: '07:30', duration: '6h 00m', status: 'In Progress', asa: 'IV'  },
  { otNo: 'OT-4', patient: 'Suman Patel',      surgeon: 'Dr. Singh',  procedure: 'Cataract (L)',     specialty: 'Ophthalmology',  time: '11:00', duration: '0h 45m', status: 'Postponed',   asa: 'I'   },
];

export const OTSchedulePage = () => {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('All');
  const statuses = ['All', 'Upcoming', 'In Progress', 'Completed', 'Postponed', 'Emergency'];
  const rows = schedule.filter(r =>
    (filter === 'All' || r.status === filter) &&
    (r.patient.toLowerCase().includes(q.toLowerCase()) ||
     r.procedure.toLowerCase().includes(q.toLowerCase()) ||
     r.surgeon.toLowerCase().includes(q.toLowerCase()))
  );
  return (
    <Wrap title="OT Schedule" subtitle="Today's surgical schedule — 21 Mar 2026"
      actions={<>
        <Button variant="outline" size="sm" className="gap-1"><Download className="h-4 w-4" />Export</Button>
        <Button size="sm" className="gap-1 bg-teal-600 hover:bg-teal-700"><PlusCircle className="h-4 w-4" />Book Slot</Button>
      </>}>
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          { label: 'Total Scheduled', value: '12', sub: 'Today',                icon: CalendarDays,  color: 'text-teal-600' },
          { label: 'In Progress',     value: '3',  sub: 'OT 1, 2, 4 active',   icon: Activity,      color: 'text-blue-600' },
          { label: 'Completed',       value: '4',  sub: 'As of 14:00',          icon: CheckCircle2,  color: 'text-emerald-600' },
          { label: 'Postponed',       value: '1',  sub: 'Rescheduled',          icon: AlertCircle,   color: 'text-amber-600' },
        ].map(k => <KPI key={k.label} {...k} />)}
      </div>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search patient, procedure, surgeon..." className="pl-9" value={q} onChange={e => setQ(e.target.value)} />
            </div>
            <div className="flex gap-1 flex-wrap">
              {statuses.map(s => (
                <button key={s} onClick={() => setFilter(s)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filter === s ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead><tr className="border-b">
              <TH>OT</TH><TH>Patient</TH><TH cls="hidden md:table-cell">Procedure</TH>
              <TH cls="hidden lg:table-cell">Specialty</TH><TH>Time</TH>
              <TH cls="hidden md:table-cell">Duration</TH><TH cls="hidden lg:table-cell">ASA</TH>
              <TH>Status</TH><TH>Actions</TH>
            </tr></thead>
            <tbody className="divide-y">
              {rows.map((r, i) => (
                <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <TD cls="font-bold text-teal-700">{r.otNo}</TD>
                  <TD><div className="font-medium">{r.patient}</div><div className="text-xs text-muted-foreground">{r.surgeon}</div></TD>
                  <TD cls="hidden md:table-cell text-muted-foreground">{r.procedure}</TD>
                  <TD cls="hidden lg:table-cell text-muted-foreground">{r.specialty}</TD>
                  <TD cls="font-medium">{r.time}</TD>
                  <TD cls="hidden md:table-cell text-muted-foreground">{r.duration}</TD>
                  <TD cls="hidden lg:table-cell"><Badge className="bg-slate-100 text-slate-700 border-0 text-xs">ASA {r.asa}</Badge></TD>
                  <TD><Bdg s={r.status} /></TD>
                  <TD><div className="flex gap-1">
                    <button className="p-1.5 rounded hover:bg-slate-100"><Eye className="h-3.5 w-3.5 text-slate-500" /></button>
                    <button className="p-1.5 rounded hover:bg-slate-100"><Edit2 className="h-3.5 w-3.5 text-slate-500" /></button>
                  </div></TD>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </Wrap>
  );
};

// ─── 2. Pre-Op Checklist (NEW) ────────────────────────────────────────────────
const preOpPatients = [
  { patient: 'Rajesh Malhotra', procedure: 'CABG',            surgeon: 'Dr. Mehta',  slot: '08:00 OT-1', consented: true,  labsDone: true,  anaesthesiaCleared: true,  crossmatched: true,  npoConfirmed: true,  status: 'Ready'   },
  { patient: 'Sangita Rao',     procedure: 'Hip Replacement',  surgeon: 'Dr. Sharma', slot: '09:30 OT-2', consented: true,  labsDone: true,  anaesthesiaCleared: true,  crossmatched: false, npoConfirmed: true,  status: 'Ready'   },
  { patient: 'Fatima Khan',     procedure: 'Lap Chole',        surgeon: 'Dr. Joshi',  slot: '10:00 OT-3', consented: true,  labsDone: true,  anaesthesiaCleared: true,  crossmatched: false, npoConfirmed: true,  status: 'Ready'   },
  { patient: 'Ramesh Tiwari',   procedure: 'Inguinal Hernia',  surgeon: 'Dr. Joshi',  slot: '12:30 OT-3', consented: true,  labsDone: false, anaesthesiaCleared: false, crossmatched: false, npoConfirmed: true,  status: 'Pending' },
  { patient: 'Nikhil Desai',    procedure: 'Appendectomy',     surgeon: 'Dr. Mehta',  slot: '14:00 OT-1', consented: false, labsDone: true,  anaesthesiaCleared: false, crossmatched: false, npoConfirmed: false, status: 'Pending' },
  { patient: 'Priya Nair',      procedure: 'Knee Replacement', surgeon: 'Dr. Gupta',  slot: '15:00 OT-2', consented: true,  labsDone: true,  anaesthesiaCleared: true,  crossmatched: false, npoConfirmed: true,  status: 'Ready'   },
];

const Tick = ({ v }: { v: boolean }) => v
  ? <CheckCircle2 className="h-4 w-4 text-emerald-500 mx-auto" />
  : <AlertCircle  className="h-4 w-4 text-amber-400 mx-auto" />;

export const OTPreOpPage = () => {
  const [q, setQ] = useState('');
  const rows = preOpPatients.filter(r =>
    r.patient.toLowerCase().includes(q.toLowerCase()) || r.procedure.toLowerCase().includes(q.toLowerCase())
  );
  return (
    <Wrap title="Pre-Op Checklist" subtitle="Surgical preparation verification for today's cases"
      actions={<>
        <Button variant="outline" size="sm" className="gap-1"><Download className="h-4 w-4" />Export</Button>
        <Button size="sm" className="gap-1 bg-teal-600 hover:bg-teal-700"><PlusCircle className="h-4 w-4" />Add Patient</Button>
      </>}>
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          { label: 'Total Cases',   value: '8', sub: 'Scheduled today',    icon: CalendarDays, color: 'text-teal-600'    },
          { label: 'Pre-Op Ready',  value: '5', sub: 'All checks cleared', icon: CheckCircle2, color: 'text-emerald-600' },
          { label: 'Pending Items', value: '3', sub: 'Action required',    icon: AlertCircle,  color: 'text-amber-600'   },
          { label: 'Emergency Add', value: '0', sub: 'Unplanned cases',    icon: Activity,     color: 'text-red-500'     },
        ].map(k => <KPI key={k.label} {...k} />)}
      </div>
      <Card>
        <CardHeader className="pb-3">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search patient or procedure..." className="pl-9" value={q} onChange={e => setQ(e.target.value)} />
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm min-w-[700px]">
            <thead><tr className="border-b">
              <TH>Patient</TH><TH>Procedure</TH><TH>Slot</TH>
              <TH cls="text-center">Consent</TH><TH cls="text-center">Labs</TH>
              <TH cls="text-center">Anaesthesia</TH><TH cls="text-center">Crossmatch</TH>
              <TH cls="text-center">NPO</TH><TH>Status</TH>
            </tr></thead>
            <tbody className="divide-y">
              {rows.map((r, i) => (
                <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <TD><div className="font-medium">{r.patient}</div><div className="text-xs text-muted-foreground">{r.surgeon}</div></TD>
                  <TD cls="text-muted-foreground">{r.procedure}</TD>
                  <TD cls="text-xs font-medium text-teal-700">{r.slot}</TD>
                  <TD cls="text-center"><Tick v={r.consented} /></TD>
                  <TD cls="text-center"><Tick v={r.labsDone} /></TD>
                  <TD cls="text-center"><Tick v={r.anaesthesiaCleared} /></TD>
                  <TD cls="text-center"><Tick v={r.crossmatched} /></TD>
                  <TD cls="text-center"><Tick v={r.npoConfirmed} /></TD>
                  <TD><Bdg s={r.status} /></TD>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </Wrap>
  );
};

// ─── 3. Consent Forms (NEW) ───────────────────────────────────────────────────
const consents = [
  { id: 'CNS-0021', patient: 'Rajesh Malhotra', procedure: 'CABG',            surgeon: 'Dr. Mehta',  date: '20 Mar 2026', signedBy: 'Patient',  witness: 'Nurse Kavita', status: 'Signed'   },
  { id: 'CNS-0022', patient: 'Sangita Rao',     procedure: 'Hip Replacement',  surgeon: 'Dr. Sharma', date: '20 Mar 2026', signedBy: 'Patient',  witness: 'Nurse Ritu',   status: 'Signed'   },
  { id: 'CNS-0023', patient: 'Fatima Khan',     procedure: 'Lap Chole',        surgeon: 'Dr. Joshi',  date: '21 Mar 2026', signedBy: 'Patient',  witness: 'Nurse Priya',  status: 'Signed'   },
  { id: 'CNS-0024', patient: 'Ramesh Tiwari',   procedure: 'Inguinal Hernia',  surgeon: 'Dr. Joshi',  date: '21 Mar 2026', signedBy: '—',        witness: '—',            status: 'Unsigned' },
  { id: 'CNS-0025', patient: 'Nikhil Desai',    procedure: 'Appendectomy',     surgeon: 'Dr. Mehta',  date: '21 Mar 2026', signedBy: '—',        witness: '—',            status: 'Unsigned' },
  { id: 'CNS-0026', patient: 'Priya Nair',      procedure: 'Knee Replacement', surgeon: 'Dr. Gupta',  date: '20 Mar 2026', signedBy: 'Guardian', witness: 'Nurse Meera',  status: 'Signed'   },
  { id: 'CNS-0027', patient: 'Arun Krishnan',   procedure: 'Craniotomy',       surgeon: 'Dr. Rao',    date: '19 Mar 2026', signedBy: 'Guardian', witness: 'Nurse Anuja',  status: 'Signed'   },
];

export const OTConsentPage = () => {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('All');
  const rows = consents.filter(r =>
    (filter === 'All' || r.status === filter) &&
    r.patient.toLowerCase().includes(q.toLowerCase())
  );
  return (
    <Wrap title="Consent Forms" subtitle="Surgical consent documentation and audit trail"
      actions={<>
        <Button variant="outline" size="sm" className="gap-1"><Download className="h-4 w-4" />Export</Button>
        <Button size="sm" className="gap-1 bg-teal-600 hover:bg-teal-700"><PlusCircle className="h-4 w-4" />New Consent</Button>
      </>}>
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          { label: 'Total Forms',    value: '12', sub: 'This week', icon: FileText,    color: 'text-teal-600'    },
          { label: 'Signed',         value: '10', sub: 'Complete',  icon: CheckCircle2,color: 'text-emerald-600' },
          { label: 'Unsigned',       value: '2',  sub: 'Pending',   icon: AlertCircle, color: 'text-amber-600'   },
          { label: 'Digital Copies', value: '10', sub: 'On record', icon: FileText,    color: 'text-blue-600'    },
        ].map(k => <KPI key={k.label} {...k} />)}
      </div>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search patient..." className="pl-9" value={q} onChange={e => setQ(e.target.value)} />
            </div>
            {['All', 'Signed', 'Unsigned'].map(s => (
              <button key={s} onClick={() => setFilter(s)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filter === s ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                {s}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead><tr className="border-b">
              <TH>Consent ID</TH><TH>Patient</TH><TH cls="hidden md:table-cell">Procedure</TH>
              <TH cls="hidden lg:table-cell">Date</TH><TH cls="hidden lg:table-cell">Signed By</TH>
              <TH cls="hidden md:table-cell">Witness</TH><TH>Status</TH><TH>Actions</TH>
            </tr></thead>
            <tbody className="divide-y">
              {rows.map((r, i) => (
                <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <TD cls="font-medium text-teal-700">{r.id}</TD>
                  <TD><div className="font-medium">{r.patient}</div><div className="text-xs text-muted-foreground">{r.surgeon}</div></TD>
                  <TD cls="hidden md:table-cell text-muted-foreground">{r.procedure}</TD>
                  <TD cls="hidden lg:table-cell text-muted-foreground">{r.date}</TD>
                  <TD cls="hidden lg:table-cell">{r.signedBy}</TD>
                  <TD cls="hidden md:table-cell text-muted-foreground">{r.witness}</TD>
                  <TD><Bdg s={r.status} /></TD>
                  <TD><div className="flex gap-1">
                    <button className="p-1.5 rounded hover:bg-slate-100"><Eye className="h-3.5 w-3.5 text-slate-500" /></button>
                    <button className="p-1.5 rounded hover:bg-slate-100"><Download className="h-3.5 w-3.5 text-slate-500" /></button>
                  </div></TD>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </Wrap>
  );
};

// ─── 4. Surgical Teams ────────────────────────────────────────────────────────
const teams = [
  { team: 'Cardiothoracic Team A', surgeon: 'Dr. Mehta',  assistant: 'Dr. Pillai', scrubNurse: 'Sr. Kavita', circNurse: 'Sr. Meera', anaesthetist: 'Dr. Patel',  ot: 'OT-1', status: 'Active'   },
  { team: 'Orthopaedic Team B',    surgeon: 'Dr. Sharma', assistant: 'Dr. Verma',  scrubNurse: 'Sr. Ritu',   circNurse: 'Sr. Uma',   anaesthetist: 'Dr. Khanna', ot: 'OT-2', status: 'Active'   },
  { team: 'General Surgery C',     surgeon: 'Dr. Joshi',  assistant: 'Dr. Das',    scrubNurse: 'Sr. Priya',  circNurse: 'Sr. Lata',  anaesthetist: 'Dr. Nair',   ot: 'OT-3', status: 'Active'   },
  { team: 'Neuro Team D',          surgeon: 'Dr. Rao',    assistant: 'Dr. Bose',   scrubNurse: 'Sr. Anuja',  circNurse: 'Sr. Minu',  anaesthetist: 'Dr. Arora',  ot: 'OT-4', status: 'Active'   },
  { team: 'Ophthalmology Team E',  surgeon: 'Dr. Singh',  assistant: '—',          scrubNurse: 'Sr. Sunita', circNurse: 'Sr. Reena', anaesthetist: 'Dr. Kumar',  ot: 'OT-5', status: 'Inactive' },
  { team: 'Urology Team F',        surgeon: 'Dr. Gupta',  assistant: 'Dr. Iyer',   scrubNurse: 'Sr. Deepa',  circNurse: 'Sr. Nisha', anaesthetist: 'Dr. Reddy',  ot: 'OT-2', status: 'Active'   },
];

export const OTTeamsPage = () => {
  const [q, setQ] = useState('');
  const rows = teams.filter(r =>
    r.team.toLowerCase().includes(q.toLowerCase()) || r.surgeon.toLowerCase().includes(q.toLowerCase())
  );
  return (
    <Wrap title="Surgical Teams" subtitle="Surgeon, nurse & support staff assignments"
      actions={<>
        <Button variant="outline" size="sm" className="gap-1"><Download className="h-4 w-4" />Export</Button>
        <Button size="sm" className="gap-1 bg-teal-600 hover:bg-teal-700"><PlusCircle className="h-4 w-4" />Add Team</Button>
      </>}>
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          { label: 'Total Teams',   value: '6',  sub: 'Registered',    icon: Users,       color: 'text-teal-600'    },
          { label: 'Active Today',  value: '4',  sub: 'In surgery',    icon: Activity,    color: 'text-blue-600'    },
          { label: 'Surgeons',      value: '8',  sub: 'On duty',       icon: Stethoscope, color: 'text-emerald-600' },
          { label: 'Nursing Staff', value: '12', sub: 'Scrub + Circ.', icon: HeartPulse,  color: 'text-violet-600'  },
        ].map(k => <KPI key={k.label} {...k} />)}
      </div>
      <Card>
        <CardHeader className="pb-3">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search team or surgeon..." className="pl-9" value={q} onChange={e => setQ(e.target.value)} />
          </div>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead><tr className="border-b">
              <TH>Team</TH><TH>Surgeon</TH><TH cls="hidden lg:table-cell">Assistant</TH>
              <TH cls="hidden md:table-cell">Scrub Nurse</TH><TH cls="hidden lg:table-cell">Anaesthetist</TH>
              <TH cls="hidden md:table-cell">OT</TH><TH>Status</TH><TH>Actions</TH>
            </tr></thead>
            <tbody className="divide-y">
              {rows.map((r, i) => (
                <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <TD cls="font-medium">{r.team}</TD>
                  <TD cls="font-medium text-teal-700">{r.surgeon}</TD>
                  <TD cls="hidden lg:table-cell text-muted-foreground">{r.assistant}</TD>
                  <TD cls="hidden md:table-cell text-muted-foreground">{r.scrubNurse}</TD>
                  <TD cls="hidden lg:table-cell text-muted-foreground">{r.anaesthetist}</TD>
                  <TD cls="hidden md:table-cell"><Badge className="bg-teal-50 text-teal-700 border-0 text-xs">{r.ot}</Badge></TD>
                  <TD><Bdg s={r.status} /></TD>
                  <TD><div className="flex gap-1">
                    <button className="p-1.5 rounded hover:bg-slate-100"><Eye className="h-3.5 w-3.5 text-slate-500" /></button>
                    <button className="p-1.5 rounded hover:bg-slate-100"><Edit2 className="h-3.5 w-3.5 text-slate-500" /></button>
                  </div></TD>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </Wrap>
  );
};

// ─── 5. Equipment Status ──────────────────────────────────────────────────────
const equipment = [
  { id: 'EQ-001', name: 'Anaesthesia Machine (Draeger)', ot: 'OT-1', make: 'Draeger',    lastAMC: '15 Jan 2026', nextAMC: '15 Jul 2026', status: 'In Use',      calibrated: 'Yes' },
  { id: 'EQ-002', name: 'C-ARM Fluoroscopy',             ot: 'OT-2', make: 'GE Health',  lastAMC: '10 Feb 2026', nextAMC: '10 Aug 2026', status: 'In Use',      calibrated: 'Yes' },
  { id: 'EQ-003', name: 'Laparoscopy Tower (Karl Storz)',ot: 'OT-3', make: 'Karl Storz', lastAMC: '01 Mar 2026', nextAMC: '01 Sep 2026', status: 'In Use',      calibrated: 'Yes' },
  { id: 'EQ-004', name: 'Electrosurgical Unit (ERBE)',   ot: 'OT-4', make: 'ERBE',       lastAMC: '20 Dec 2025', nextAMC: '20 Jun 2026', status: 'Ready',       calibrated: 'Yes' },
  { id: 'EQ-005', name: 'Operating Microscope',          ot: 'OT-4', make: 'Zeiss',      lastAMC: '05 Feb 2026', nextAMC: '05 Aug 2026', status: 'In Use',      calibrated: 'Yes' },
  { id: 'EQ-006', name: 'Pulse Oximeter (x4)',           ot: 'All',  make: 'Nellcor',    lastAMC: '01 Jan 2026', nextAMC: '01 Jul 2026', status: 'Ready',       calibrated: 'Yes' },
  { id: 'EQ-007', name: 'Defibrillator',                 ot: 'PACU', make: 'Philips',    lastAMC: '10 Mar 2026', nextAMC: '10 Sep 2026', status: 'Ready',       calibrated: 'Yes' },
  { id: 'EQ-008', name: 'Ventilator (ICU Grade)',        ot: 'PACU', make: 'Medtronic',  lastAMC: '01 Feb 2026', nextAMC: '01 Aug 2026', status: 'Maintenance', calibrated: 'No'  },
];

export const OTEquipmentPage = () => {
  const [q, setQ] = useState('');
  const rows = equipment.filter(r =>
    r.name.toLowerCase().includes(q.toLowerCase()) || r.ot.toLowerCase().includes(q.toLowerCase())
  );
  return (
    <Wrap title="Equipment Status" subtitle="Surgical instruments, machines and AMC tracking"
      actions={<>
        <Button variant="outline" size="sm" className="gap-1"><Download className="h-4 w-4" />Export</Button>
        <Button size="sm" className="gap-1 bg-teal-600 hover:bg-teal-700"><PlusCircle className="h-4 w-4" />Add Equipment</Button>
      </>}>
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          { label: 'Total Equipment', value: fmt(equipment.length), sub: 'Registered',    icon: Wrench,      color: 'text-teal-600'    },
          { label: 'In Use',          value: '5',                   sub: 'Active theatres',icon: Activity,    color: 'text-blue-600'    },
          { label: 'Ready',           value: '2',                   sub: 'Standby',        icon: CheckCircle2,color: 'text-emerald-600' },
          { label: 'Maintenance',     value: '1',                   sub: 'Out of service', icon: AlertCircle, color: 'text-amber-600'   },
        ].map(k => <KPI key={k.label} {...k} />)}
      </div>
      <Card>
        <CardHeader className="pb-3">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search equipment or OT..." className="pl-9" value={q} onChange={e => setQ(e.target.value)} />
          </div>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead><tr className="border-b">
              <TH>ID</TH><TH>Equipment</TH><TH cls="hidden md:table-cell">OT</TH>
              <TH cls="hidden lg:table-cell">Make</TH><TH cls="hidden lg:table-cell">Last AMC</TH>
              <TH cls="hidden md:table-cell">Next AMC</TH><TH cls="hidden lg:table-cell">Calibrated</TH>
              <TH>Status</TH><TH>Actions</TH>
            </tr></thead>
            <tbody className="divide-y">
              {rows.map((r, i) => (
                <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <TD cls="font-medium text-teal-700">{r.id}</TD>
                  <TD cls="font-medium">{r.name}</TD>
                  <TD cls="hidden md:table-cell text-muted-foreground">{r.ot}</TD>
                  <TD cls="hidden lg:table-cell text-muted-foreground">{r.make}</TD>
                  <TD cls="hidden lg:table-cell text-muted-foreground">{r.lastAMC}</TD>
                  <TD cls="hidden md:table-cell text-muted-foreground">{r.nextAMC}</TD>
                  <TD cls="hidden lg:table-cell">
                    <Badge className={`border-0 text-xs ${r.calibrated === 'Yes' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{r.calibrated}</Badge>
                  </TD>
                  <TD><Bdg s={r.status} /></TD>
                  <TD><div className="flex gap-1">
                    <button className="p-1.5 rounded hover:bg-slate-100"><Eye className="h-3.5 w-3.5 text-slate-500" /></button>
                    <button className="p-1.5 rounded hover:bg-slate-100"><Edit2 className="h-3.5 w-3.5 text-slate-500" /></button>
                  </div></TD>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </Wrap>
  );
};

// ─── 6. Sterilization (CSSD) ──────────────────────────────────────────────────
const sterilization = [
  { batchId: 'STE-1101', items: 'Lap Set + Trocar (OT-3)',  method: 'Autoclave (134°C)', startTime: '06:00', endTime: '06:35', operator: 'Technician A', biTest: 'Pass',    status: 'Sterilized' },
  { batchId: 'STE-1102', items: 'CABG Instrument Set',       method: 'Autoclave (134°C)', startTime: '06:10', endTime: '06:45', operator: 'Technician B', biTest: 'Pass',    status: 'Sterilized' },
  { batchId: 'STE-1103', items: 'Ortho Implant Tools',       method: 'ETO (25°C)',         startTime: '05:00', endTime: '11:00', operator: 'Technician A', biTest: 'Pass',    status: 'Sterilized' },
  { batchId: 'STE-1104', items: 'Flexible Scopes (Lap)',     method: 'Glutaraldehyde',     startTime: '07:00', endTime: '07:45', operator: 'Technician C', biTest: 'Pending', status: 'Running'    },
  { batchId: 'STE-1105', items: 'Suture & Dressing Tray',   method: 'Autoclave (121°C)',  startTime: '09:00', endTime: '09:25', operator: 'Technician B', biTest: '—',       status: 'Pending'    },
  { batchId: 'STE-1106', items: 'Neuro Craniotomy Set',      method: 'Autoclave (134°C)', startTime: '05:30', endTime: '06:05', operator: 'Technician A', biTest: 'Pass',    status: 'Sterilized' },
];

export const OTSterilizationPage = () => {
  const [q, setQ] = useState('');
  const rows = sterilization.filter(r =>
    r.batchId.toLowerCase().includes(q.toLowerCase()) || r.items.toLowerCase().includes(q.toLowerCase())
  );
  return (
    <Wrap title="Sterilization (CSSD)" subtitle="Instrument sterilization batches and biological test results"
      actions={<>
        <Button variant="outline" size="sm" className="gap-1"><Download className="h-4 w-4" />Export</Button>
        <Button size="sm" className="gap-1 bg-teal-600 hover:bg-teal-700"><PlusCircle className="h-4 w-4" />New Batch</Button>
      </>}>
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          { label: "Today's Batches", value: '6', sub: 'Total cycles', icon: FlaskConical, color: 'text-teal-600'    },
          { label: 'Sterilized',      value: '4', sub: 'Ready for use', icon: CheckCircle2, color: 'text-emerald-600' },
          { label: 'Running',         value: '1', sub: 'In cycle',      icon: RefreshCw,    color: 'text-blue-600'    },
          { label: 'Pending',         value: '1', sub: 'Queued',        icon: Clock,        color: 'text-amber-600'   },
        ].map(k => <KPI key={k.label} {...k} />)}
      </div>
      <Card>
        <CardHeader className="pb-3">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search batch or items..." className="pl-9" value={q} onChange={e => setQ(e.target.value)} />
          </div>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead><tr className="border-b">
              <TH>Batch ID</TH><TH>Items</TH><TH cls="hidden md:table-cell">Method</TH>
              <TH cls="hidden lg:table-cell">Start</TH><TH cls="hidden lg:table-cell">End</TH>
              <TH cls="hidden md:table-cell">Operator</TH><TH cls="hidden lg:table-cell">BI Test</TH>
              <TH>Status</TH>
            </tr></thead>
            <tbody className="divide-y">
              {rows.map((r, i) => (
                <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <TD cls="font-medium text-teal-700">{r.batchId}</TD>
                  <TD cls="font-medium">{r.items}</TD>
                  <TD cls="hidden md:table-cell text-muted-foreground">{r.method}</TD>
                  <TD cls="hidden lg:table-cell text-muted-foreground">{r.startTime}</TD>
                  <TD cls="hidden lg:table-cell text-muted-foreground">{r.endTime}</TD>
                  <TD cls="hidden md:table-cell text-muted-foreground">{r.operator}</TD>
                  <TD cls="hidden lg:table-cell">
                    <Badge className={`border-0 text-xs ${r.biTest === 'Pass' ? 'bg-emerald-100 text-emerald-700' : r.biTest === 'Pending' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>{r.biTest}</Badge>
                  </TD>
                  <TD><Bdg s={r.status} /></TD>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </Wrap>
  );
};

// ─── 7. Implants & Supplies (NEW) ─────────────────────────────────────────────
const implants = [
  { id: 'IMP-001', item: 'Hip Prosthesis (Cemented, L)',     category: 'Orthopaedic',    make: 'Stryker',  lotNo: 'H4521', qty: 1,  unitCost: 85000, status: 'Used'      },
  { id: 'IMP-002', item: 'Knee Prosthesis (Total, R)',       category: 'Orthopaedic',    make: 'Zimmer',   lotNo: 'K7823', qty: 1,  unitCost: 92000, status: 'Pending'   },
  { id: 'IMP-003', item: 'Coronary Stent DES (3.0×28 mm)',  category: 'Cardiothoracic', make: 'Abbott',   lotNo: 'C0114', qty: 2,  unitCost: 45000, status: 'Used'      },
  { id: 'IMP-004', item: 'Mesh (Prolene, Medium)',           category: 'General',        make: 'Ethicon',  lotNo: 'M5567', qty: 1,  unitCost: 2800,  status: 'Pending'   },
  { id: 'IMP-005', item: 'Intraocular Lens (Monofocal)',    category: 'Ophthalmology',  make: 'Alcon',    lotNo: 'L3342', qty: 10, unitCost: 6500,  status: 'Available' },
  { id: 'IMP-006', item: 'Bone Cement (Palacos-R, 40 g)',   category: 'Orthopaedic',    make: 'Heraeus',  lotNo: 'BC910', qty: 2,  unitCost: 4200,  status: 'Used'      },
  { id: 'IMP-007', item: 'Haemostatic Gauze (Surgicel)',    category: 'Consumable',     make: 'J&J',      lotNo: 'SG221', qty: 20, unitCost: 1200,  status: 'Low Stock' },
  { id: 'IMP-008', item: 'Absorbable Suture (Vicryl 2-0)', category: 'Consumable',     make: 'Ethicon',  lotNo: 'VS992', qty: 50, unitCost: 180,   status: 'Available' },
];

export const OTImplantsPage = () => {
  const [q, setQ] = useState('');
  const rows = implants.filter(r =>
    r.item.toLowerCase().includes(q.toLowerCase()) || r.category.toLowerCase().includes(q.toLowerCase())
  );
  return (
    <Wrap title="Implants & Supplies" subtitle="Surgical implants, consumables and lot traceability"
      actions={<>
        <Button variant="outline" size="sm" className="gap-1"><Download className="h-4 w-4" />Export</Button>
        <Button size="sm" className="gap-1 bg-teal-600 hover:bg-teal-700"><PlusCircle className="h-4 w-4" />Add Item</Button>
      </>}>
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          { label: 'Total Items',  value: fmt(implants.length), sub: 'Registered',     icon: Package,     color: 'text-teal-600'    },
          { label: 'Used Today',   value: '3',                  sub: 'Implanted',       icon: CheckCircle2,color: 'text-emerald-600' },
          { label: 'Pending Use',  value: '2',                  sub: 'Assigned',        icon: Clock,       color: 'text-blue-600'    },
          { label: 'Low Stock',    value: '1',                  sub: 'Reorder needed',  icon: AlertCircle, color: 'text-amber-600'   },
        ].map(k => <KPI key={k.label} {...k} />)}
      </div>
      <Card>
        <CardHeader className="pb-3">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search item or category..." className="pl-9" value={q} onChange={e => setQ(e.target.value)} />
          </div>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead><tr className="border-b">
              <TH>ID</TH><TH>Item</TH><TH cls="hidden md:table-cell">Category</TH>
              <TH cls="hidden lg:table-cell">Make</TH><TH cls="hidden lg:table-cell">Lot No.</TH>
              <TH cls="hidden md:table-cell">Qty</TH><TH cls="hidden lg:table-cell">Unit Cost (₹)</TH>
              <TH>Status</TH>
            </tr></thead>
            <tbody className="divide-y">
              {rows.map((r, i) => (
                <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <TD cls="font-medium text-teal-700">{r.id}</TD>
                  <TD cls="font-medium">{r.item}</TD>
                  <TD cls="hidden md:table-cell text-muted-foreground">{r.category}</TD>
                  <TD cls="hidden lg:table-cell text-muted-foreground">{r.make}</TD>
                  <TD cls="hidden lg:table-cell text-xs font-mono">{r.lotNo}</TD>
                  <TD cls="hidden md:table-cell">{r.qty}</TD>
                  <TD cls="hidden lg:table-cell">₹{fmt(r.unitCost)}</TD>
                  <TD><Bdg s={r.status} /></TD>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </Wrap>
  );
};

// ─── 8. Anesthesia ────────────────────────────────────────────────────────────
const anesthesiaRecords = [
  { id: 'ANS-001', patient: 'Rajesh Malhotra', procedure: 'CABG',            type: 'General (ETT)',     anaesthetist: 'Dr. Patel',  asa: 'III', premedGiven: 'Yes', intubated: 'Yes', reversal: 'Done',    status: 'Completed'   },
  { id: 'ANS-002', patient: 'Sangita Rao',     procedure: 'Hip Replacement',  type: 'Spinal',            anaesthetist: 'Dr. Khanna', asa: 'II',  premedGiven: 'Yes', intubated: 'N/A', reversal: 'N/A',     status: 'In Progress' },
  { id: 'ANS-003', patient: 'Fatima Khan',     procedure: 'Lap Chole',        type: 'General (LMA)',     anaesthetist: 'Dr. Nair',   asa: 'I',   premedGiven: 'Yes', intubated: 'Yes', reversal: 'Done',    status: 'Completed'   },
  { id: 'ANS-004', patient: 'Ramesh Tiwari',   procedure: 'Inguinal Hernia',  type: 'Spinal + Sedation', anaesthetist: 'Dr. Nair',   asa: 'II',  premedGiven: 'Yes', intubated: 'N/A', reversal: 'N/A',     status: 'In Progress' },
  { id: 'ANS-005', patient: 'Nikhil Desai',    procedure: 'Appendectomy',     type: 'General (ETT)',     anaesthetist: 'Dr. Patel',  asa: 'I',   premedGiven: 'No',  intubated: 'No',  reversal: '—',       status: 'Upcoming'    },
  { id: 'ANS-006', patient: 'Arun Krishnan',   procedure: 'Craniotomy',       type: 'General (ETT)',     anaesthetist: 'Dr. Arora',  asa: 'IV',  premedGiven: 'Yes', intubated: 'Yes', reversal: 'Pending', status: 'In Progress' },
];

export const OTAnesthesiaPage = () => {
  const [q, setQ] = useState('');
  const rows = anesthesiaRecords.filter(r =>
    r.patient.toLowerCase().includes(q.toLowerCase()) || r.procedure.toLowerCase().includes(q.toLowerCase())
  );
  return (
    <Wrap title="Anesthesia" subtitle="Pre-op / intra-op anesthesia plans, ASA classification & reversal"
      actions={<>
        <Button variant="outline" size="sm" className="gap-1"><Download className="h-4 w-4" />Export</Button>
        <Button size="sm" className="gap-1 bg-teal-600 hover:bg-teal-700"><PlusCircle className="h-4 w-4" />Add Plan</Button>
      </>}>
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          { label: 'Plans Today',      value: '6', sub: 'Total anaesthesia', icon: Syringe,     color: 'text-teal-600'    },
          { label: 'In Progress',      value: '3', sub: 'Intra-op',          icon: Activity,    color: 'text-blue-600'    },
          { label: 'Completed',        value: '2', sub: 'Reversed & stable', icon: CheckCircle2,color: 'text-emerald-600' },
          { label: 'High Risk (IV+)',  value: '1', sub: 'ASA IV or above',   icon: AlertCircle, color: 'text-red-500'     },
        ].map(k => <KPI key={k.label} {...k} />)}
      </div>
      <Card>
        <CardHeader className="pb-3">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search patient or procedure..." className="pl-9" value={q} onChange={e => setQ(e.target.value)} />
          </div>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead><tr className="border-b">
              <TH>ID</TH><TH>Patient</TH><TH cls="hidden md:table-cell">Procedure</TH>
              <TH cls="hidden lg:table-cell">Type</TH><TH cls="hidden lg:table-cell">Anaesthetist</TH>
              <TH cls="hidden md:table-cell">ASA</TH><TH cls="hidden lg:table-cell">Intubated</TH>
              <TH cls="hidden lg:table-cell">Reversal</TH><TH>Status</TH>
            </tr></thead>
            <tbody className="divide-y">
              {rows.map((r, i) => (
                <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <TD cls="font-medium text-teal-700">{r.id}</TD>
                  <TD cls="font-medium">{r.patient}</TD>
                  <TD cls="hidden md:table-cell text-muted-foreground">{r.procedure}</TD>
                  <TD cls="hidden lg:table-cell text-muted-foreground">{r.type}</TD>
                  <TD cls="hidden lg:table-cell text-muted-foreground">{r.anaesthetist}</TD>
                  <TD cls="hidden md:table-cell">
                    <Badge className={`border-0 text-xs ${r.asa === 'IV' || r.asa === 'V' ? 'bg-red-100 text-red-700' : r.asa === 'III' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>ASA {r.asa}</Badge>
                  </TD>
                  <TD cls="hidden lg:table-cell text-muted-foreground">{r.intubated}</TD>
                  <TD cls="hidden lg:table-cell text-muted-foreground">{r.reversal}</TD>
                  <TD><Bdg s={r.status} /></TD>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </Wrap>
  );
};

// ─── 9. Surgical Safety — WHO Checklist (NEW) ─────────────────────────────────
const safetyChecklists = [
  { id: 'SFT-001', patient: 'Rajesh Malhotra', procedure: 'CABG',            ot: 'OT-1', signIn: 'Done',    timeout: 'Done',    signOut: 'Done',    siteMarked: 'Yes', antibiotic: 'Yes', spongeCount: 'Correct', status: 'Done'        },
  { id: 'SFT-002', patient: 'Sangita Rao',     procedure: 'Hip Replacement',  ot: 'OT-2', signIn: 'Done',    timeout: 'Done',    signOut: 'Pending', siteMarked: 'Yes', antibiotic: 'Yes', spongeCount: '—',       status: 'In Progress' },
  { id: 'SFT-003', patient: 'Fatima Khan',     procedure: 'Lap Chole',        ot: 'OT-3', signIn: 'Done',    timeout: 'Done',    signOut: 'Done',    siteMarked: 'Yes', antibiotic: 'Yes', spongeCount: 'Correct', status: 'Done'        },
  { id: 'SFT-004', patient: 'Ramesh Tiwari',   procedure: 'Inguinal Hernia',  ot: 'OT-3', signIn: 'Done',    timeout: 'Done',    signOut: 'Pending', siteMarked: 'Yes', antibiotic: 'Yes', spongeCount: '—',       status: 'In Progress' },
  { id: 'SFT-005', patient: 'Nikhil Desai',    procedure: 'Appendectomy',     ot: 'OT-1', signIn: 'Pending', timeout: 'Pending', signOut: 'Pending', siteMarked: 'No',  antibiotic: 'No',  spongeCount: '—',       status: 'Pending'     },
  { id: 'SFT-006', patient: 'Arun Krishnan',   procedure: 'Craniotomy',       ot: 'OT-4', signIn: 'Done',    timeout: 'Done',    signOut: 'Pending', siteMarked: 'Yes', antibiotic: 'Yes', spongeCount: '—',       status: 'In Progress' },
];

const PhaseChip = ({ v }: { v: string }) => (
  <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${v === 'Done' ? 'bg-emerald-100 text-emerald-700' : v === 'Pending' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>{v}</span>
);

export const OTSafetyPage = () => {
  const [q, setQ] = useState('');
  const rows = safetyChecklists.filter(r =>
    r.patient.toLowerCase().includes(q.toLowerCase()) || r.procedure.toLowerCase().includes(q.toLowerCase())
  );
  return (
    <Wrap title="Surgical Safety" subtitle="WHO Surgical Safety Checklist — Sign-In / Time-Out / Sign-Out"
      actions={<>
        <Button variant="outline" size="sm" className="gap-1"><Download className="h-4 w-4" />Export</Button>
        <Button size="sm" className="gap-1 bg-teal-600 hover:bg-teal-700"><PlusCircle className="h-4 w-4" />New Checklist</Button>
      </>}>
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          { label: 'Total Cases',  value: '6', sub: 'Today',                icon: ShieldCheck, color: 'text-teal-600'    },
          { label: 'Fully Done',   value: '2', sub: 'All 3 phases clear',   icon: CheckCircle2,color: 'text-emerald-600' },
          { label: 'In Progress',  value: '3', sub: 'Partial completion',   icon: Activity,    color: 'text-blue-600'    },
          { label: 'Pending',      value: '1', sub: 'Not yet started',      icon: AlertCircle, color: 'text-amber-600'   },
        ].map(k => <KPI key={k.label} {...k} />)}
      </div>
      <Card>
        <CardHeader className="pb-3">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search patient or procedure..." className="pl-9" value={q} onChange={e => setQ(e.target.value)} />
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm min-w-[700px]">
            <thead><tr className="border-b">
              <TH>ID</TH><TH>Patient</TH><TH>Procedure</TH><TH cls="hidden md:table-cell">OT</TH>
              <TH cls="text-center">Sign-In</TH><TH cls="text-center">Time-Out</TH><TH cls="text-center">Sign-Out</TH>
              <TH cls="hidden lg:table-cell text-center">Site Marked</TH>
              <TH cls="hidden lg:table-cell text-center">Antibiotic</TH>
              <TH cls="hidden lg:table-cell text-center">Sponge Count</TH>
              <TH>Status</TH>
            </tr></thead>
            <tbody className="divide-y">
              {rows.map((r, i) => (
                <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <TD cls="font-medium text-teal-700">{r.id}</TD>
                  <TD cls="font-medium">{r.patient}</TD>
                  <TD cls="text-muted-foreground">{r.procedure}</TD>
                  <TD cls="hidden md:table-cell text-muted-foreground">{r.ot}</TD>
                  <TD cls="text-center"><PhaseChip v={r.signIn} /></TD>
                  <TD cls="text-center"><PhaseChip v={r.timeout} /></TD>
                  <TD cls="text-center"><PhaseChip v={r.signOut} /></TD>
                  <TD cls="hidden lg:table-cell text-center text-xs text-muted-foreground">{r.siteMarked}</TD>
                  <TD cls="hidden lg:table-cell text-center text-xs text-muted-foreground">{r.antibiotic}</TD>
                  <TD cls="hidden lg:table-cell text-center text-xs text-muted-foreground">{r.spongeCount}</TD>
                  <TD><Bdg s={r.status} /></TD>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </Wrap>
  );
};

// ─── 10. Post-Op Care (PACU) ──────────────────────────────────────────────────
const postOpPatients = [
  { id: 'PAR-001', patient: 'Rajesh Malhotra', procedure: 'CABG',            surgeon: 'Dr. Mehta',  transferredAt: '12:40', bp: '118/76', hr: '72', spo2: '98%', pain: '2/10', aldrete: '9',  status: 'Ready'       },
  { id: 'PAR-002', patient: 'Fatima Khan',     procedure: 'Lap Chole',        surgeon: 'Dr. Joshi',  transferredAt: '11:20', bp: '124/82', hr: '80', spo2: '99%', pain: '3/10', aldrete: '9',  status: 'Ready'       },
  { id: 'PAR-003', patient: 'Sangita Rao',     procedure: 'Hip Replacement',  surgeon: 'Dr. Sharma', transferredAt: '—',     bp: '—',      hr: '—',  spo2: '—',   pain: '—',    aldrete: '—',  status: 'In Progress' },
  { id: 'PAR-004', patient: 'Ramesh Tiwari',   procedure: 'Inguinal Hernia',  surgeon: 'Dr. Joshi',  transferredAt: '—',     bp: '—',      hr: '—',  spo2: '—',   pain: '—',    aldrete: '—',  status: 'In Progress' },
  { id: 'PAR-005', patient: 'Arun Krishnan',   procedure: 'Craniotomy',       surgeon: 'Dr. Rao',    transferredAt: '—',     bp: '—',      hr: '—',  spo2: '—',   pain: '—',    aldrete: '—',  status: 'In Progress' },
];

export const OTPostOpPage = () => {
  const [q, setQ] = useState('');
  const rows = postOpPatients.filter(r =>
    r.patient.toLowerCase().includes(q.toLowerCase()) || r.procedure.toLowerCase().includes(q.toLowerCase())
  );
  return (
    <Wrap title="Post-Op Care (PACU)" subtitle="Post-anaesthesia care unit — recovery monitoring"
      actions={<>
        <Button variant="outline" size="sm" className="gap-1"><Download className="h-4 w-4" />Export</Button>
        <Button size="sm" className="gap-1 bg-teal-600 hover:bg-teal-700"><PlusCircle className="h-4 w-4" />Admit Patient</Button>
      </>}>
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          { label: 'In PACU',         value: '5', sub: 'Recovering now',    icon: HeartPulse,  color: 'text-teal-600'    },
          { label: 'Ready to Ward',   value: '2', sub: 'Aldrete ≥ 9',       icon: CheckCircle2,color: 'text-emerald-600' },
          { label: 'Monitoring',      value: '3', sub: 'Active recovery',   icon: Activity,    color: 'text-blue-600'    },
          { label: 'High Pain (>6)',  value: '0', sub: 'Pain score > 6/10', icon: AlertCircle, color: 'text-red-500'     },
        ].map(k => <KPI key={k.label} {...k} />)}
      </div>
      <Card>
        <CardHeader className="pb-3">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search patient or procedure..." className="pl-9" value={q} onChange={e => setQ(e.target.value)} />
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm min-w-[600px]">
            <thead><tr className="border-b">
              <TH>ID</TH><TH>Patient</TH><TH cls="hidden md:table-cell">Procedure</TH>
              <TH cls="hidden lg:table-cell">Transferred</TH><TH cls="hidden md:table-cell">BP</TH>
              <TH cls="hidden md:table-cell">HR</TH><TH cls="hidden md:table-cell">SpO₂</TH>
              <TH cls="hidden lg:table-cell">Pain</TH><TH cls="hidden lg:table-cell">Aldrete</TH>
              <TH>Status</TH>
            </tr></thead>
            <tbody className="divide-y">
              {rows.map((r, i) => (
                <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <TD cls="font-medium text-teal-700">{r.id}</TD>
                  <TD cls="font-medium">{r.patient}</TD>
                  <TD cls="hidden md:table-cell text-muted-foreground">{r.procedure}</TD>
                  <TD cls="hidden lg:table-cell text-muted-foreground">{r.transferredAt}</TD>
                  <TD cls="hidden md:table-cell font-mono text-sm">{r.bp}</TD>
                  <TD cls="hidden md:table-cell">{r.hr}</TD>
                  <TD cls="hidden md:table-cell">{r.spo2}</TD>
                  <TD cls="hidden lg:table-cell">{r.pain}</TD>
                  <TD cls="hidden lg:table-cell">
                    <span className={`font-semibold ${r.aldrete === '9' || r.aldrete === '10' ? 'text-emerald-600' : r.aldrete === '—' ? 'text-slate-400' : 'text-amber-600'}`}>{r.aldrete}</span>
                  </TD>
                  <TD><Bdg s={r.status} /></TD>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </Wrap>
  );
};

// ─── 11. OT Records ───────────────────────────────────────────────────────────
const otRecords = [
  { id: 'OTR-2601', patient: 'Ramesh Kumar',   procedure: 'Appendectomy',    surgeon: 'Dr. Joshi',  date: '20 Mar', duration: '55m',    bloodLoss: '50 mL',  complications: 'None', status: 'Completed'   },
  { id: 'OTR-2602', patient: 'Sneha Gupta',    procedure: 'C-Section',       surgeon: 'Dr. Mehta',  date: '20 Mar', duration: '45m',    bloodLoss: '450 mL', complications: 'None', status: 'Completed'   },
  { id: 'OTR-2603', patient: 'Vijay Patel',    procedure: 'TURP',            surgeon: 'Dr. Gupta',  date: '21 Mar', duration: '1h 20m', bloodLoss: '120 mL', complications: 'None', status: 'Completed'   },
  { id: 'OTR-2604', patient: 'Rajesh Malhotra',procedure: 'CABG',            surgeon: 'Dr. Mehta',  date: '21 Mar', duration: '4h 20m', bloodLoss: '800 mL', complications: 'None', status: 'Completed'   },
  { id: 'OTR-2605', patient: 'Fatima Khan',    procedure: 'Lap Chole',       surgeon: 'Dr. Joshi',  date: '21 Mar', duration: '1h 15m', bloodLoss: '30 mL',  complications: 'None', status: 'Completed'   },
  { id: 'OTR-2606', patient: 'Sangita Rao',    procedure: 'Hip Replacement', surgeon: 'Dr. Sharma', date: '21 Mar', duration: '—',      bloodLoss: '—',      complications: '—',    status: 'In Progress' },
  { id: 'OTR-2607', patient: 'Arun Krishnan',  procedure: 'Craniotomy',      surgeon: 'Dr. Rao',    date: '21 Mar', duration: '—',      bloodLoss: '—',      complications: '—',    status: 'In Progress' },
];

export const OTRecordsPage = () => {
  const [q, setQ] = useState('');
  const rows = otRecords.filter(r =>
    r.patient.toLowerCase().includes(q.toLowerCase()) || r.procedure.toLowerCase().includes(q.toLowerCase())
  );
  return (
    <Wrap title="OT Records" subtitle="Surgical notes, operative logs and outcome documentation"
      actions={<>
        <Button variant="outline" size="sm" className="gap-1"><Download className="h-4 w-4" />Export</Button>
        <Button size="sm" className="gap-1 bg-teal-600 hover:bg-teal-700"><PlusCircle className="h-4 w-4" />New Record</Button>
      </>}>
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          { label: "Today's Cases", value: '7',   sub: 'All theatres',      icon: ClipboardList,color: 'text-teal-600'    },
          { label: 'Completed',     value: '5',   sub: 'Records finalised', icon: CheckCircle2, color: 'text-emerald-600' },
          { label: 'In Progress',   value: '2',   sub: 'Notes pending',     icon: Activity,     color: 'text-blue-600'    },
          { label: 'This Month',    value: '142', sub: 'Total procedures',  icon: BarChart3,    color: 'text-violet-600'  },
        ].map(k => <KPI key={k.label} {...k} />)}
      </div>
      <Card>
        <CardHeader className="pb-3">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search patient or procedure..." className="pl-9" value={q} onChange={e => setQ(e.target.value)} />
          </div>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead><tr className="border-b">
              <TH>Record ID</TH><TH>Patient</TH><TH cls="hidden md:table-cell">Procedure</TH>
              <TH cls="hidden lg:table-cell">Surgeon</TH><TH cls="hidden lg:table-cell">Date</TH>
              <TH cls="hidden md:table-cell">Duration</TH><TH cls="hidden lg:table-cell">Blood Loss</TH>
              <TH cls="hidden lg:table-cell">Complications</TH><TH>Status</TH><TH cls="hidden md:table-cell">Actions</TH>
            </tr></thead>
            <tbody className="divide-y">
              {rows.map((r, i) => (
                <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <TD cls="font-medium text-teal-700">{r.id}</TD>
                  <TD cls="font-medium">{r.patient}</TD>
                  <TD cls="hidden md:table-cell text-muted-foreground">{r.procedure}</TD>
                  <TD cls="hidden lg:table-cell text-muted-foreground">{r.surgeon}</TD>
                  <TD cls="hidden lg:table-cell text-muted-foreground">{r.date}</TD>
                  <TD cls="hidden md:table-cell text-muted-foreground">{r.duration}</TD>
                  <TD cls="hidden lg:table-cell text-muted-foreground">{r.bloodLoss}</TD>
                  <TD cls="hidden lg:table-cell text-muted-foreground">{r.complications}</TD>
                  <TD><Bdg s={r.status} /></TD>
                  <TD cls="hidden md:table-cell"><div className="flex gap-1">
                    <button className="p-1.5 rounded hover:bg-slate-100"><Eye className="h-3.5 w-3.5 text-slate-500" /></button>
                    <button className="p-1.5 rounded hover:bg-slate-100"><Download className="h-3.5 w-3.5 text-slate-500" /></button>
                  </div></TD>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </Wrap>
  );
};

// ─── 12. Reports ──────────────────────────────────────────────────────────────
const reportTypes = [
  { title: 'OT Utilization Report',      icon: BarChart3,    desc: 'OT-wise time utilization and idle time analysis',      tag: 'Daily / Monthly' },
  { title: 'Surgeon Performance',        icon: Stethoscope,  desc: 'Cases per surgeon, average duration, outcomes',        tag: 'Monthly'         },
  { title: 'Anaesthesia Summary',        icon: Syringe,      desc: 'ASA classification, reversal rates, incidents',        tag: 'Monthly'         },
  { title: 'Sterilization Compliance',   icon: FlaskConical, desc: 'Batch counts, BI test pass rates, trend charts',       tag: 'Monthly'         },
  { title: 'Infection Rate Report',      icon: ShieldCheck,  desc: 'Post-surgical site infections (SSI) per procedure',    tag: 'Quarterly'       },
  { title: 'Implant Traceability',       icon: Package,      desc: 'Lot-wise implant register with patient mapping',       tag: 'On Demand'       },
  { title: 'Consent Compliance',         icon: FileText,     desc: 'Signed vs unsigned consent rate by ward',              tag: 'Weekly'          },
  { title: 'OT Incident Log',            icon: AlertCircle,  desc: 'Near-miss events, equipment failures, incidents',      tag: 'Monthly'         },
];

export const OTReportsPage = () => (
  <Wrap title="OT Reports" subtitle="Performance analytics, compliance and audit reports"
    actions={<Button variant="outline" size="sm" className="gap-1"><Download className="h-4 w-4" />Export All</Button>}>
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
      {[
        { label: 'Reports Generated', value: '28', sub: 'This month',       icon: BarChart3,   color: 'text-teal-600'    },
        { label: 'Scheduled',         value: '6',  sub: 'Auto-generated',   icon: Clock,       color: 'text-blue-600'    },
        { label: 'Pending Review',    value: '3',  sub: 'Awaiting sign-off',icon: AlertCircle, color: 'text-amber-600'   },
        { label: 'Downloaded',        value: '18', sub: 'This month',       icon: Download,    color: 'text-emerald-600' },
      ].map(k => <KPI key={k.label} {...k} />)}
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {reportTypes.map((r) => (
        <Card key={r.title} className="hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-xl bg-teal-50 dark:bg-teal-950 flex-shrink-0">
                <r.icon className="h-5 w-5 text-teal-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium text-sm">{r.title}</p>
                  <Badge className="bg-slate-100 text-slate-600 border-0 text-xs flex-shrink-0">{r.tag}</Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{r.desc}</p>
                <Button size="sm" variant="outline" className="mt-3 h-7 text-xs gap-1">
                  <Download className="h-3 w-3" />Generate
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  </Wrap>
);

// ─── 13. Analytics (NEW) ──────────────────────────────────────────────────────
const analyticsData = [
  { ot: 'OT-1', specialty: 'Cardiothoracic', mtd: 24, utilPct: 82, avgDuration: '3h 20m', cancellations: 2, turnover: '28m' },
  { ot: 'OT-2', specialty: 'Orthopaedic',    mtd: 31, utilPct: 75, avgDuration: '2h 15m', cancellations: 1, turnover: '22m' },
  { ot: 'OT-3', specialty: 'General Surgery',mtd: 48, utilPct: 91, avgDuration: '1h 10m', cancellations: 3, turnover: '15m' },
  { ot: 'OT-4', specialty: 'Neuro / Ophthal',mtd: 18, utilPct: 40, avgDuration: '4h 45m', cancellations: 0, turnover: '35m' },
];

export const OTAnalyticsPage = () => (
  <Wrap title="OT Analytics" subtitle="Utilization trends, cancellations and turnover time analysis"
    actions={<Button variant="outline" size="sm" className="gap-1"><Download className="h-4 w-4" />Export</Button>}>
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
      {[
        { label: 'MTD Procedures',   value: '121',  sub: 'March 2026',       icon: BarChart3,  color: 'text-teal-600'  },
        { label: 'Avg Utilization',  value: '72%',  sub: 'Across all OTs',   icon: TrendingUp, color: 'text-blue-600'  },
        { label: 'Cancellation Rate',value: '4.9%', sub: '6 / 121 cases',    icon: AlertCircle,color: 'text-amber-600' },
        { label: 'Avg Turnover',     value: '25m',  sub: 'Between cases',    icon: Clock,      color: 'text-emerald-600'},
      ].map(k => <KPI key={k.label} {...k} />)}
    </div>
    <Card>
      <CardHeader className="pb-3"><CardTitle className="text-base">OT Utilization — March 2026</CardTitle></CardHeader>
      <CardContent className="space-y-6">
        {analyticsData.map((d) => (
          <div key={d.ot}>
            <div className="flex justify-between text-sm mb-1">
              <div>
                <span className="font-semibold">{d.ot}</span>
                <span className="text-muted-foreground ml-2 text-xs">({d.specialty})</span>
              </div>
              <span className={`font-semibold ${d.utilPct > 85 ? 'text-amber-600' : 'text-teal-600'}`}>{d.utilPct}%</span>
            </div>
            <div className="h-2.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${d.utilPct > 90 ? 'bg-amber-500' : d.utilPct > 70 ? 'bg-teal-500' : 'bg-slate-400'}`} style={{ width: `${d.utilPct}%` }} />
            </div>
            <div className="flex gap-6 text-xs text-muted-foreground mt-1.5">
              <span>MTD Cases: <strong className="text-foreground">{d.mtd}</strong></span>
              <span>Avg Duration: <strong className="text-foreground">{d.avgDuration}</strong></span>
              <span>Cancellations: <strong className="text-foreground">{d.cancellations}</strong></span>
              <span>Turnover: <strong className="text-foreground">{d.turnover}</strong></span>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Top Procedures (MTD)</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {[
            { name: 'Appendectomy',    count: 22, pct: 18 },
            { name: 'C-Section',       count: 18, pct: 15 },
            { name: 'Lap Chole',       count: 16, pct: 13 },
            { name: 'Hip Replacement', count: 12, pct: 10 },
            { name: 'CABG',            count: 8,  pct: 7  },
            { name: 'Craniotomy',      count: 6,  pct: 5  },
          ].map((p) => (
            <div key={p.name}>
              <div className="flex justify-between text-sm mb-0.5">
                <span>{p.name}</span>
                <span className="text-muted-foreground">{p.count} cases</span>
              </div>
              <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-teal-500 rounded-full" style={{ width: `${p.pct * 5}%` }} />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Monthly Trend (Jan–Mar 2026)</CardTitle></CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead><tr className="border-b">
              <TH>Month</TH><TH>Cases</TH><TH>Util%</TH><TH>Cancel</TH><TH>SSI</TH>
            </tr></thead>
            <tbody className="divide-y">
              {[
                { month: 'January',  cases: '118', util: '71%', cancel: '5', ssi: '1' },
                { month: 'February', cases: '132', util: '79%', cancel: '4', ssi: '0' },
                { month: 'March',    cases: '121', util: '72%', cancel: '6', ssi: '0' },
              ].map((r) => (
                <tr key={r.month} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <TD cls="font-medium">{r.month}</TD>
                  <TD cls="text-teal-600 font-semibold">{r.cases}</TD>
                  <TD>{r.util}</TD>
                  <TD>{r.cancel}</TD>
                  <TD>{r.ssi}</TD>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  </Wrap>
);

// ─── 14. Settings ─────────────────────────────────────────────────────────────
export const OTSettingsPage = () => (
  <Wrap title="Settings" subtitle="OT portal configuration and access management"
    actions={<Button size="sm" className="bg-teal-600 hover:bg-teal-700">Save Changes</Button>}>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {[
        {
          title: 'Theatre Configuration', icon: Scissors,
          items: ['OT-1: Cardiothoracic (Floor 3)', 'OT-2: Orthopaedic (Floor 3)', 'OT-3: General Surgery (Floor 3)', 'OT-4: Neuro / Ophthal (Floor 4)', 'PACU: 8 Beds (Floor 3)', 'CSSD: Sterilization Hub (Floor 1)'],
        },
        {
          title: 'Booking & Scheduling Rules', icon: CalendarDays,
          items: ['OT hours: 07:00 – 22:00', 'Emergency slots: 24×7 OT-3 reserved', 'Min booking notice: 24 hours', 'Max cases / OT / day: 6', 'Turnover buffer: 20 minutes', 'Block booking: Allowed up to 7 days'],
        },
        {
          title: 'Consent & Compliance', icon: ShieldCheck,
          items: ['Consent form template: v4.2', 'WHO checklist: Mandatory for all cases', 'NABH audit trail: Enabled', 'Digital signature: DigiSign API v2', 'Consent language: Bilingual (Eng + Hindi)', 'Retention period: 10 years'],
        },
        {
          title: 'Notifications & Alerts', icon: AlertCircle,
          items: ['Pre-op reminder: 2 hours before', 'Equipment AMC alert: 30 days prior', 'Sterilization BI failure: Immediate SMS', 'Post-op SpO₂ alert threshold: < 94%', 'Cancellation notification: Surgeon + Ward', 'Emergency OT: All-staff broadcast'],
        },
      ].map((card) => (
        <Card key={card.title}>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-teal-50 dark:bg-teal-950">
                <card.icon className="h-4 w-4 text-teal-600" />
              </div>
              <CardTitle className="text-sm">{card.title}</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {card.items.map((item) => (
                <li key={item} className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800">
                  <span className="text-sm">{item}</span>
                  <button className="p-1 rounded hover:bg-slate-100"><Edit2 className="h-3.5 w-3.5 text-slate-400" /></button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ))}
    </div>
  </Wrap>
);

// ─── 15. Support ──────────────────────────────────────────────────────────────
export const OTSupportPage = () => (
  <Wrap title="Help & Support" subtitle="OT portal documentation, FAQs and contact information"
    actions={<Button size="sm" className="bg-teal-600 hover:bg-teal-700">Raise Ticket</Button>}>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm">Frequently Asked Questions</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {[
            { q: 'How do I book an emergency OT slot?',   a: 'Contact the OT coordinator on extension 2200 or use the Emergency Slot button on the Schedule page.' },
            { q: 'Who approves OT schedule changes?',     a: 'The OT In-charge or Medical Director. A notification is sent to the surgeon on approval.' },
            { q: 'How do I generate a sterilization report?', a: 'Navigate to Sterilization → Export to download the batch log in PDF or CSV.' },
            { q: 'What is the WHO Safety Checklist used for?', a: 'It is a mandatory 3-phase (Sign In, Time Out, Sign Out) safety protocol for every surgical case.' },
            { q: 'Can I add post-op vitals from a mobile device?', a: 'Yes, the PACU page is mobile-responsive. Use the nurse login at the bedside terminal.' },
          ].map((f, i) => (
            <div key={i} className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800">
              <p className="text-sm font-medium">{f.q}</p>
              <p className="text-xs text-muted-foreground mt-1">{f.a}</p>
            </div>
          ))}
        </CardContent>
      </Card>
      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm">Contact OT Administration</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {[
              { label: 'OT Coordinator',   value: 'Ext. 2200 / ot.coord@mediczy.com' },
              { label: 'CSSD In-charge',   value: 'Ext. 2205' },
              { label: 'Medical Director', value: 'Ext. 2001' },
              { label: 'Biomedical Eng.',  value: 'Ext. 2410 / bme@mediczy.com' },
              { label: 'IT Helpdesk',      value: 'Ext. 9000 / it@mediczy.com' },
            ].map((c) => (
              <div key={c.label} className="flex justify-between py-1.5 border-b last:border-0">
                <span className="text-muted-foreground">{c.label}</span>
                <span className="font-medium">{c.value}</span>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm">Quick Links</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {[
              { label: 'NABH OT Standards (5th Edition)',  href: '#' },
              { label: 'WHO Surgical Safety Checklist',    href: '#' },
              { label: 'CSSD Sterilization Guidelines',    href: '#' },
              { label: 'OT User Manual (PDF)',             href: '#' },
              { label: 'Biomedical Equipment AMC Schedule',href: '#' },
            ].map((l) => (
              <a key={l.label} href={l.href} className="flex items-center gap-2 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 text-sm text-teal-600 hover:underline">
                <FileText className="h-4 w-4 flex-shrink-0" />{l.label}
              </a>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  </Wrap>
);

// ─── Theatre View — Real-Time IoT Board ──────────────────────────────────────
const jitter = (base: number, amp: number, seed: number, t: number) =>
  Math.round((base + Math.sin(t * 1.3 + seed) * amp) * 10) / 10;

const theatres = [
  {
    id: 'OT-1', floor: 'Floor 3', specialty: 'Cardiothoracic',
    borderCls: 'border-l-blue-500', badgeCls: 'bg-blue-100 text-blue-700',
    status: 'Active Surgery',
    patient: 'Arun Krishnan', procedure: 'Craniotomy', surgeon: 'Dr. Rao',
    elapsedMin: 386,
    vitals: { hr: 68, spo2: 98, sbp: 118, dbp: 74, etco2: 35, temp: 36.6 },
    hvac: { roomTemp: 20.1, rh: 49, diffPa: 2.5, ach: 25 },
    gases: { o2: 60, n2o: 55, air: 58, vac: 48 },
    next: { patient: 'Nikhil Desai', procedure: 'Appendectomy', time: '14:00' },
    iot: { online: 6, total: 6 },
  },
  {
    id: 'OT-2', floor: 'Floor 3', specialty: 'Orthopaedic',
    borderCls: 'border-l-emerald-500', badgeCls: 'bg-emerald-100 text-emerald-700',
    status: 'Active Surgery',
    patient: 'Sangita Rao', procedure: 'Hip Replacement', surgeon: 'Dr. Sharma',
    elapsedMin: 263,
    vitals: { hr: 72, spo2: 99, sbp: 124, dbp: 78, etco2: 36, temp: 36.4 },
    hvac: { roomTemp: 20.4, rh: 51, diffPa: 2.3, ach: 22 },
    gases: { o2: 58, n2o: 0, air: 60, vac: 47 },
    next: { patient: 'Priya Nair', procedure: 'Knee Replacement', time: '15:00' },
    iot: { online: 6, total: 6 },
  },
  {
    id: 'OT-3', floor: 'Floor 3', specialty: 'General Surgery',
    borderCls: 'border-l-violet-500', badgeCls: 'bg-violet-100 text-violet-700',
    status: 'Active Surgery',
    patient: 'Ramesh Tiwari', procedure: 'Inguinal Hernia', surgeon: 'Dr. Joshi',
    elapsedMin: 83,
    vitals: { hr: 80, spo2: 99, sbp: 132, dbp: 82, etco2: 37, temp: 36.8 },
    hvac: { roomTemp: 19.8, rh: 48, diffPa: 2.6, ach: 24 },
    gases: { o2: 62, n2o: 0, air: 61, vac: 49 },
    next: { patient: '', procedure: 'No further cases', time: '' },
    iot: { online: 5, total: 6 },
  },
  {
    id: 'OT-4', floor: 'Floor 4', specialty: 'Neuro / Ophthal',
    borderCls: 'border-l-slate-400', badgeCls: 'bg-slate-100 text-slate-600',
    status: 'Ready',
    patient: '', procedure: '', surgeon: '',
    elapsedMin: 0,
    vitals: null as null | { hr: number; spo2: number; sbp: number; dbp: number; etco2: number; temp: number },
    hvac: { roomTemp: 21.0, rh: 52, diffPa: 2.4, ach: 21 },
    gases: { o2: 61, n2o: 53, air: 59, vac: 48 },
    next: { patient: 'Suman Patel', procedure: 'Cataract (L)', time: '16:00' },
    iot: { online: 4, total: 6 },
  },
];

const VitalChip = ({ label, value, unit, warn = false }: { label: string; value: string; unit: string; warn?: boolean }) => (
  <div className={`rounded-lg p-2 ${warn ? 'bg-red-50 dark:bg-red-950/40' : 'bg-slate-50 dark:bg-slate-800'}`}>
    <div className="text-xs text-muted-foreground leading-none">{label}</div>
    <div className={`text-base font-bold tabular-nums mt-0.5 ${warn ? 'text-red-600' : ''}`}>
      {value}<span className="text-xs font-normal ml-0.5 text-muted-foreground">{unit}</span>
    </div>
  </div>
);

const GasBar = ({ label, val, max, warn }: { label: string; val: number; max: number; warn: number }) => (
  <div className="flex items-center gap-2">
    <span className="text-xs text-muted-foreground w-14 flex-shrink-0">{label}</span>
    <div className="flex-1 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full transition-all duration-700 ${val < warn ? 'bg-red-500' : val < warn * 1.4 ? 'bg-amber-500' : 'bg-teal-500'}`}
        style={{ width: `${Math.min(100, (val / max) * 100)}%` }}
      />
    </div>
    <span className={`text-xs font-medium w-6 text-right tabular-nums ${val < warn ? 'text-red-600' : ''}`}>{val}</span>
  </div>
);

export const OTTheatreViewPage = () => {
  const [tick, setTick] = useState(0);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => { setTick(t => t + 1); setLastUpdated(new Date()); }, 3000);
    return () => clearInterval(id);
  }, []);
  const ts = lastUpdated.toLocaleTimeString('en-IN', { hour12: false });

  return (
    <HospDeptLayout deptKey="ot" deptName="Operation Theatre" badgeLabel="OT"
      loginPath="/ot/login" DeptIcon={Scissors} navSections={otNavSections}
      title="Theatre View" subtitle="Real-time IoT board — all operating theatres live">
      <div className="space-y-5">
        {/* Status bar */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
              </span>
              <span className="text-xs font-bold text-red-600 tracking-widest uppercase">Live</span>
            </div>
            <span className="text-sm text-muted-foreground">Updated {ts}</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-sm">
              <Wifi className="h-4 w-4 text-emerald-500" />
              <span className="text-emerald-600 font-medium">IoT Hub Connected</span>
              <Badge className="bg-emerald-100 text-emerald-700 border-0">21/24 online</Badge>
            </div>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setTick(t => t + 1)}>
              <RefreshCw className="h-3.5 w-3.5" />Refresh
            </Button>
          </div>
        </div>

        {/* Theatre Kanban */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {theatres.map((ot, idx) => {
            const v = ot.vitals;
            const s = idx * 10;
            const hr    = v ? Math.round(jitter(v.hr,   3,   s+1, tick)) : 0;
            const spo2  = v ? Math.round(jitter(v.spo2, 0.5, s+2, tick)) : 0;
            const sbp   = v ? Math.round(jitter(v.sbp,  5,   s+3, tick)) : 0;
            const dbp   = v ? Math.round(jitter(v.dbp,  3,   s+4, tick)) : 0;
            const etco2 = v ? Math.round(jitter(v.etco2,1.5, s+5, tick)) : 0;
            const temp  = v ? jitter(v.temp, 0.1, s+6, tick) : 0;
            const roomTemp = jitter(ot.hvac.roomTemp, 0.15, s+7, tick);
            const rh    = Math.round(jitter(ot.hvac.rh, 1.5, s+8, tick));
            const o2    = Math.max(0, Math.round(jitter(ot.gases.o2, 1, s+9, tick)));
            const elapsedTotal = ot.elapsedMin + Math.floor(tick * 3 / 60);
            const elapsedStr = ot.elapsedMin > 0
              ? `${Math.floor(elapsedTotal / 60)}h ${elapsedTotal % 60}m`
              : '—';
            return (
              <Card key={ot.id} className={`border-l-4 ${ot.borderCls} hover:shadow-lg transition-shadow`}>
                <CardHeader className="pb-2 pt-4 px-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-bold text-lg">{ot.id}</span>
                        <Badge className={`${ot.badgeCls} border-0 text-xs`}>{ot.status}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">{ot.specialty} · {ot.floor}</p>
                    </div>
                    <div className="text-right">
                      <div className={`flex items-center gap-1 justify-end ${ot.iot.online === ot.iot.total ? 'text-emerald-600' : 'text-amber-500'}`}>
                        <Wifi className="h-3.5 w-3.5" />
                        <span className="text-xs font-semibold">{ot.iot.online}/{ot.iot.total}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">devices</p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="px-4 pb-4 space-y-3">
                  {/* Current Case */}
                  <div className={`p-2.5 rounded-xl ${v ? 'bg-slate-50 dark:bg-slate-800' : 'bg-slate-50/50 dark:bg-slate-800/50 border border-dashed'}`}>
                    {v ? (
                      <>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Current Case</span>
                          <span className="text-xs text-teal-600 font-medium flex items-center gap-1">
                            <Clock className="h-3 w-3" />{elapsedStr}
                          </span>
                        </div>
                        <p className="font-semibold text-sm leading-tight">{ot.patient}</p>
                        <p className="text-xs text-muted-foreground">{ot.procedure}</p>
                        <p className="text-xs text-muted-foreground">{ot.surgeon}</p>
                      </>
                    ) : (
                      <p className="text-xs text-muted-foreground text-center py-2">No active case · Theatre ready</p>
                    )}
                  </div>

                  {/* Patient Vitals (IoT) */}
                  {v && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1 mb-1.5">
                        <Activity className="h-3 w-3 text-rose-500" />Patient Vitals
                        <span className="ml-auto text-emerald-500 text-xs normal-case font-normal">● live</span>
                      </p>
                      <div className="grid grid-cols-3 gap-1">
                        <VitalChip label="HR" value={String(hr)} unit="bpm" warn={hr > 100 || hr < 50} />
                        <VitalChip label="SpO₂" value={String(spo2)} unit="%" warn={spo2 < 95} />
                        <VitalChip label="EtCO₂" value={String(etco2)} unit="mmHg" warn={etco2 > 45 || etco2 < 30} />
                        <div className="col-span-2">
                          <VitalChip label="BP" value={`${sbp}/${dbp}`} unit="mmHg" warn={sbp > 160 || sbp < 90} />
                        </div>
                        <VitalChip label="Temp" value={temp.toFixed(1)} unit="°C" warn={temp > 38 || temp < 35.5} />
                      </div>
                    </div>
                  )}

                  {/* Room Environment (HVAC IoT) */}
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1 mb-1.5">
                      <Wind className="h-3 w-3 text-cyan-500" />Room Environment
                    </p>
                    <div className="grid grid-cols-2 gap-1">
                      <div className="flex items-center gap-1.5 p-2 rounded-lg bg-slate-50 dark:bg-slate-800">
                        <Thermometer className="h-3.5 w-3.5 text-orange-400 flex-shrink-0" />
                        <div>
                          <div className="text-xs text-muted-foreground">Temp</div>
                          <div className={`text-sm font-bold tabular-nums ${roomTemp > 22 || roomTemp < 18 ? 'text-amber-600' : ''}`}>{roomTemp.toFixed(1)}°C</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 p-2 rounded-lg bg-slate-50 dark:bg-slate-800">
                        <Gauge className="h-3.5 w-3.5 text-blue-400 flex-shrink-0" />
                        <div>
                          <div className="text-xs text-muted-foreground">Humidity</div>
                          <div className={`text-sm font-bold tabular-nums ${rh > 60 || rh < 40 ? 'text-amber-600' : ''}`}>{rh}% RH</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 p-2 rounded-lg bg-slate-50 dark:bg-slate-800">
                        <Wind className="h-3.5 w-3.5 text-cyan-400 flex-shrink-0" />
                        <div>
                          <div className="text-xs text-muted-foreground">Diff. Pressure</div>
                          <div className="text-sm font-bold">+{ot.hvac.diffPa} Pa</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 p-2 rounded-lg bg-slate-50 dark:bg-slate-800">
                        <Signal className="h-3.5 w-3.5 text-teal-400 flex-shrink-0" />
                        <div>
                          <div className="text-xs text-muted-foreground">Air Changes</div>
                          <div className="text-sm font-bold">{ot.hvac.ach} ACH</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Gas Supply */}
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1 mb-1.5">
                      <Gauge className="h-3 w-3 text-violet-500" />Gas Supply (PSI / Hg)
                    </p>
                    <div className="space-y-1.5 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800">
                      <GasBar label="O₂" val={o2} max={80} warn={40} />
                      <GasBar label="N₂O" val={ot.gases.n2o} max={80} warn={30} />
                      <GasBar label="Med Air" val={ot.gases.air} max={80} warn={40} />
                      <GasBar label="Vacuum" val={ot.gases.vac} max={60} warn={30} />
                    </div>
                  </div>

                  {/* Next Case */}
                  <div className="p-2.5 rounded-xl border border-dashed">
                    <p className="text-xs font-medium text-muted-foreground">Next Case</p>
                    {ot.next.time ? (
                      <>
                        <p className="text-sm font-semibold mt-0.5">{ot.next.time} · {ot.next.patient}</p>
                        <p className="text-xs text-muted-foreground">{ot.next.procedure}</p>
                      </>
                    ) : (
                      <p className="text-xs text-muted-foreground mt-0.5">No further cases today</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* IoT Device Registry */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Wifi className="h-4 w-4 text-teal-500" />
              IoT Device Registry
              <Badge className="bg-emerald-100 text-emerald-700 border-0 ml-1">21 Online</Badge>
              <Badge className="bg-red-100 text-red-700 border-0">3 Offline</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3">
              {(([
                { device: 'Patient Monitor',  ot: 'OT-1', type: 'Vital Signs',    status: 'Online',  signal: 98 },
                { device: 'Anaesthesia Unit', ot: 'OT-1', type: 'Anaesthesia',    status: 'Online',  signal: 95 },
                { device: 'HVAC Sensor',      ot: 'OT-1', type: 'Environment',    status: 'Online',  signal: 99 },
                { device: 'Gas Monitor',      ot: 'OT-1', type: 'Gas Supply',     status: 'Online',  signal: 97 },
                { device: 'Patient Monitor',  ot: 'OT-2', type: 'Vital Signs',    status: 'Online',  signal: 93 },
                { device: 'HVAC Sensor',      ot: 'OT-2', type: 'Environment',    status: 'Online',  signal: 96 },
                { device: 'Gas Monitor',      ot: 'OT-2', type: 'Gas Supply',     status: 'Online',  signal: 91 },
                { device: 'Anaesthesia Unit', ot: 'OT-2', type: 'Anaesthesia',    status: 'Online',  signal: 88 },
                { device: 'Patient Monitor',  ot: 'OT-3', type: 'Vital Signs',    status: 'Online',  signal: 89 },
                { device: 'HVAC Sensor',      ot: 'OT-3', type: 'Environment',    status: 'Online',  signal: 94 },
                { device: 'Gas Monitor',      ot: 'OT-3', type: 'Gas Supply',     status: 'Offline', signal: 0  },
                { device: 'Anaesthesia Unit', ot: 'OT-3', type: 'Anaesthesia',    status: 'Online',  signal: 86 },
                { device: 'HVAC Sensor',      ot: 'OT-4', type: 'Environment',    status: 'Offline', signal: 0  },
                { device: 'Patient Monitor',  ot: 'OT-4', type: 'Vital Signs',    status: 'Online',  signal: 82 },
                { device: 'Gas Monitor',      ot: 'OT-4', type: 'Gas Supply',     status: 'Online',  signal: 84 },
                { device: 'Sterilizer IoT',   ot: 'CSSD', type: 'Sterilization',  status: 'Online',  signal: 92 },
                { device: 'Temp Logger',      ot: 'CSSD', type: 'Environment',    status: 'Online',  signal: 90 },
                { device: 'PACU Monitor A',   ot: 'PACU', type: 'Vital Signs',    status: 'Online',  signal: 96 },
                { device: 'PACU Monitor B',   ot: 'PACU', type: 'Vital Signs',    status: 'Offline', signal: 0  },
                { device: 'OT Camera 1',      ot: 'OT-1', type: 'Surveillance',   status: 'Online',  signal: 99 },
                { device: 'OT Camera 2',      ot: 'OT-2', type: 'Surveillance',   status: 'Online',  signal: 98 },
                { device: 'Access Control',   ot: 'Entry',type: 'Security',       status: 'Online',  signal: 99 },
                { device: 'Fire Detector',    ot: 'All',  type: 'Safety',         status: 'Online',  signal: 99 },
                { device: 'UPS Monitor',      ot: 'Elec', type: 'Power',          status: 'Online',  signal: 98 },
              ]) as { device: string; ot: string; type: string; status: string; signal: number }[]).map((d, i) => (
                <div key={i} className={`p-3 rounded-xl border transition-colors ${
                  d.status === 'Online'
                    ? 'border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20 dark:border-emerald-800'
                    : 'border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-800'
                }`}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="relative flex h-2 w-2">
                      {d.status === 'Online' && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />}
                      <span className={`relative inline-flex h-2 w-2 rounded-full ${d.status === 'Online' ? 'bg-emerald-500' : 'bg-red-400'}`} />
                    </div>
                    <span className="text-xs font-medium text-muted-foreground">{d.ot}</span>
                  </div>
                  <p className="text-xs font-semibold leading-snug">{d.device}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{d.type}</p>
                  {d.status === 'Online' ? (
                    <div className="mt-2">
                      <div className="h-1 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${d.signal}%` }} />
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{d.signal}% signal</p>
                    </div>
                  ) : (
                    <p className="text-xs text-red-500 font-medium mt-1">Offline</p>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </HospDeptLayout>
  );
};
