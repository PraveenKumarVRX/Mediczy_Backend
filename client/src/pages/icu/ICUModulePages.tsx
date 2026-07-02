import React, { useEffect, useState } from 'react';
import HospDeptLayout, { DeptNavSection } from '@/components/hosp-dept/HospDeptLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  HeartPulse, LayoutDashboard, Activity, BedDouble, Pill, Thermometer,
  Droplets, Wind, Stethoscope, Users, ClipboardCheck, Bell, BarChart3,
  TrendingUp, Settings, HelpCircle, PlusCircle, Download, Search, Eye,
  Edit2, AlertTriangle, CheckCircle2, Clock3, Gauge, Signal, LayoutGrid,
  FileText, Syringe, RefreshCw, Wrench, ShieldCheck,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useICUPortalData } from './useICUPortalData';

export const icuNavSections: DeptNavSection[] = [
  {
    title: 'Overview',
    items: [
      { icon: LayoutDashboard, label: 'Dashboard', href: '/icu/dashboard' },
      { icon: LayoutGrid, label: 'Live Monitor', href: '/icu/live-monitor' },
    ],
  },
  {
    title: 'Patient Flow',
    items: [
      { icon: Activity, label: 'Patient Register', href: '/icu/patients' },
      { icon: BedDouble, label: 'Bed Management', href: '/icu/beds' },
    ],
  },
  {
    title: 'Clinical',
    items: [
      { icon: Thermometer, label: 'Vitals', href: '/icu/vitals' },
      { icon: Droplets, label: 'Fluid Balance', href: '/icu/fluid-balance' },
      { icon: Pill, label: 'Medications', href: '/icu/medications' },
      { icon: Wind, label: 'Ventilators', href: '/icu/ventilators' },
      { icon: ShieldCheck, label: 'Infections', href: '/icu/infections' },
    ],
  },
  {
    title: 'Operations',
    items: [
      { icon: Stethoscope, label: 'Equipment', href: '/icu/equipment' },
      { icon: Users, label: 'Critical Team', href: '/icu/team' },
      { icon: ClipboardCheck, label: 'Protocols', href: '/icu/protocols' },
      { icon: Bell, label: 'Alerts', href: '/icu/alerts' },
    ],
  },
  {
    title: 'Reports',
    items: [
      { icon: BarChart3, label: 'Reports', href: '/icu/reports' },
      { icon: TrendingUp, label: 'Analytics', href: '/icu/analytics' },
    ],
  },
  {
    title: 'System',
    items: [
      { icon: Settings, label: 'Settings', href: '/icu/settings' },
      { icon: HelpCircle, label: 'Support', href: '/icu/support' },
    ],
  },
];

type WrapProps = {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
};

const Wrap = ({ title, subtitle, children, actions }: WrapProps) => (
  <HospDeptLayout
    deptKey="icu"
    deptName="ICU"
    badgeLabel="ICU"
    loginPath="/icu/login"
    DeptIcon={HeartPulse}
    navSections={icuNavSections}
    title={title}
    subtitle={subtitle}
    copilotModule="icu"
  >
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
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <p className={`mt-1 text-2xl font-bold ${color}`}>{value}</p>
          <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
        </div>
        <div className="rounded-xl bg-slate-50 p-2.5 dark:bg-slate-800">
          <Icon className={`h-5 w-5 ${color}`} />
        </div>
      </div>
    </CardContent>
  </Card>
);

const statusClass: Record<string, string> = {
  Critical: 'bg-red-100 text-red-700',
  Stable: 'bg-emerald-100 text-emerald-700',
  Improving: 'bg-blue-100 text-blue-700',
  Available: 'bg-slate-100 text-slate-600',
  Occupied: 'bg-red-100 text-red-700',
  Reserved: 'bg-amber-100 text-amber-700',
  Ready: 'bg-emerald-100 text-emerald-700',
  Running: 'bg-blue-100 text-blue-700',
  Standby: 'bg-slate-100 text-slate-600',
  Completed: 'bg-emerald-100 text-emerald-700',
  Pending: 'bg-amber-100 text-amber-700',
  Due: 'bg-red-100 text-red-700',
  Active: 'bg-blue-100 text-blue-700',
  Escalated: 'bg-red-100 text-red-700',
  Normal: 'bg-emerald-100 text-emerald-700',
  Open: 'bg-amber-100 text-amber-700',
  Closed: 'bg-emerald-100 text-emerald-700',
  Review: 'bg-blue-100 text-blue-700',
  High: 'bg-red-100 text-red-700',
  Medium: 'bg-amber-100 text-amber-700',
  Low: 'bg-emerald-100 text-emerald-700',
};

const Bdg = ({ status }: { status: string }) => (
  <Badge className={`${statusClass[status] || 'bg-slate-100 text-slate-600'} border-0 text-xs`}>{status}</Badge>
);

const TH = ({ children, cls = '' }: { children: React.ReactNode; cls?: string }) => (
  <th className={`pb-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground ${cls}`}>{children}</th>
);

const TD = ({ children, cls = '' }: { children: React.ReactNode; cls?: string }) => (
  <td className={`py-2.5 text-sm ${cls}`}>{children}</td>
);

const Meter = ({ value, color }: { value: number; color: string }) => (
  <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800">
    <div className={`h-2 rounded-full ${color}`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
  </div>
);

const fmt = (n: number) => n.toLocaleString('en-IN');

const patients = [
  { bed: 'ICU-01', patient: 'Ajay Kumar', age: 62, consultant: 'Dr. Raman', diagnosis: 'Cardiogenic shock', status: 'Critical', vent: 'VCV', score: 'APACHE II 28' },
  { bed: 'ICU-02', patient: 'Sunita Joshi', age: 45, consultant: 'Dr. Farah', diagnosis: 'ARDS', status: 'Critical', vent: 'PCV', score: 'SOFA 13' },
  { bed: 'ICU-03', patient: 'Pradeep Nair', age: 71, consultant: 'Dr. Dinesh', diagnosis: 'Septic shock', status: 'Critical', vent: 'HFNC', score: 'SOFA 11' },
  { bed: 'ICU-04', patient: 'Lalita Singh', age: 55, consultant: 'Dr. Mehra', diagnosis: 'Post-op CABG', status: 'Stable', vent: 'Room air', score: 'NEWS 3' },
  { bed: 'ICU-05', patient: 'Harish Mehta', age: 68, consultant: 'Dr. Bhatt', diagnosis: 'DKA', status: 'Stable', vent: 'Room air', score: 'NEWS 4' },
  { bed: 'ICU-06', patient: 'Radhika Rao', age: 38, consultant: 'Dr. Farah', diagnosis: 'Eclampsia', status: 'Improving', vent: 'Nasal O2', score: 'MEWS 2' },
  { bed: 'ICU-07', patient: 'Deepak Tiwari', age: 50, consultant: 'Dr. Shah', diagnosis: 'Head injury', status: 'Critical', vent: 'SIMV', score: 'GCS 7' },
  { bed: 'ICU-08', patient: 'Parveen Siddiqui', age: 60, consultant: 'Dr. Dinesh', diagnosis: 'Acute liver failure', status: 'Stable', vent: 'Room air', score: 'MELD 22' },
];

const beds = [
  { bed: 'ICU-01', zone: 'Red Zone', type: 'Isolation', nurseRatio: '1:1', status: 'Occupied', turnaround: '0 min' },
  { bed: 'ICU-02', zone: 'Red Zone', type: 'Ventilator', nurseRatio: '1:1', status: 'Occupied', turnaround: '0 min' },
  { bed: 'ICU-03', zone: 'Red Zone', type: 'HDU+', nurseRatio: '1:1', status: 'Occupied', turnaround: '0 min' },
  { bed: 'ICU-04', zone: 'Amber Zone', type: 'Post-op', nurseRatio: '1:2', status: 'Occupied', turnaround: '0 min' },
  { bed: 'ICU-09', zone: 'Amber Zone', type: 'General ICU', nurseRatio: '1:2', status: 'Available', turnaround: '15 min' },
  { bed: 'ICU-10', zone: 'Amber Zone', type: 'General ICU', nurseRatio: '1:2', status: 'Reserved', turnaround: '40 min' },
  { bed: 'ICU-11', zone: 'Green Zone', type: 'Step-down', nurseRatio: '1:3', status: 'Available', turnaround: 'Ready' },
  { bed: 'ICU-12', zone: 'Green Zone', type: 'Step-down', nurseRatio: '1:3', status: 'Available', turnaround: 'Ready' },
];

const medicationOrders = [
  { patient: 'Ajay Kumar', drug: 'Noradrenaline', route: 'Infusion', dose: '0.12 mcg/kg/min', time: '14:00', status: 'Active' },
  { patient: 'Sunita Joshi', drug: 'Meropenem', route: 'IV', dose: '1 g q8h', time: '14:30', status: 'Due' },
  { patient: 'Pradeep Nair', drug: 'Hydrocortisone', route: 'IV', dose: '50 mg q6h', time: '15:00', status: 'Pending' },
  { patient: 'Lalita Singh', drug: 'Aspirin', route: 'NG', dose: '150 mg OD', time: '12:00', status: 'Completed' },
  { patient: 'Deepak Tiwari', drug: 'Mannitol', route: 'IV', dose: '100 mL stat', time: '14:10', status: 'Completed' },
  { patient: 'Radhika Rao', drug: 'Magnesium Sulfate', route: 'IV', dose: '1 g/hr', time: 'Ongoing', status: 'Active' },
];

const vitalsRows = [
  { patient: 'Ajay Kumar', bed: 'ICU-01', hr: 126, spo2: 93, map: 61, rr: 28, temp: 38.1, status: 'Critical' },
  { patient: 'Sunita Joshi', bed: 'ICU-02', hr: 112, spo2: 89, map: 67, rr: 24, temp: 37.8, status: 'Critical' },
  { patient: 'Pradeep Nair', bed: 'ICU-03', hr: 108, spo2: 95, map: 63, rr: 22, temp: 38.4, status: 'Critical' },
  { patient: 'Lalita Singh', bed: 'ICU-04', hr: 84, spo2: 98, map: 78, rr: 18, temp: 37.0, status: 'Stable' },
  { patient: 'Radhika Rao', bed: 'ICU-06', hr: 92, spo2: 97, map: 81, rr: 19, temp: 36.9, status: 'Improving' },
];

const fluidRows = [
  { patient: 'Ajay Kumar', input: 2450, output: 1710, balance: 740, risk: 'High' },
  { patient: 'Sunita Joshi', input: 2280, output: 2050, balance: 230, risk: 'Medium' },
  { patient: 'Pradeep Nair', input: 1960, output: 980, balance: 980, risk: 'High' },
  { patient: 'Lalita Singh', input: 1820, output: 2140, balance: -320, risk: 'Low' },
  { patient: 'Radhika Rao', input: 2040, output: 1860, balance: 180, risk: 'Low' },
];

const ventilators = [
  { bed: 'ICU-01', patient: 'Ajay Kumar', model: 'Hamilton C6', mode: 'VCV', fio2: 60, peep: 8, compliance: '34 mL/cmH2O', status: 'Running' },
  { bed: 'ICU-02', patient: 'Sunita Joshi', model: 'Maquet Servo-U', mode: 'PCV', fio2: 75, peep: 12, compliance: '22 mL/cmH2O', status: 'Running' },
  { bed: 'ICU-07', patient: 'Deepak Tiwari', model: 'Puritan 980', mode: 'SIMV', fio2: 45, peep: 6, compliance: '40 mL/cmH2O', status: 'Running' },
  { bed: 'Backup-01', patient: 'Unassigned', model: 'Hamilton T1', mode: 'Standby', fio2: 21, peep: 5, compliance: 'NA', status: 'Standby' },
];

const devices = [
  { asset: 'INF-2241', device: 'Syringe Pump', location: 'ICU-02', lastService: '02 Mar 2026', nextDue: '02 Jun 2026', status: 'Ready' },
  { asset: 'MON-1123', device: 'Multipara Monitor', location: 'ICU-03', lastService: '18 Feb 2026', nextDue: '18 May 2026', status: 'Ready' },
  { asset: 'VEN-3207', device: 'Ventilator', location: 'ICU-07', lastService: '01 Mar 2026', nextDue: '01 Apr 2026', status: 'Running' },
  { asset: 'ABG-0912', device: 'ABG Analyzer', location: 'Point-of-care', lastService: '11 Jan 2026', nextDue: '11 Apr 2026', status: 'Pending' },
  { asset: 'DEF-0430', device: 'Defibrillator', location: 'Crash Cart', lastService: '14 Mar 2026', nextDue: '14 Jun 2026', status: 'Ready' },
];

const infectionRows = [
  { bundle: 'VAP Bundle', compliance: 94, owner: 'Respiratory team', open: 1, status: 'Normal' },
  { bundle: 'CLABSI Bundle', compliance: 91, owner: 'Line care team', open: 2, status: 'Review' },
  { bundle: 'CAUTI Bundle', compliance: 96, owner: 'Nursing team', open: 0, status: 'Normal' },
  { bundle: 'Hand Hygiene', compliance: 88, owner: 'All staff', open: 3, status: 'Open' },
];

const teamRoster = [
  { name: 'Dr. Raman', role: 'ICU Consultant', shift: 'Day', patients: 6, status: 'Active' },
  { name: 'Dr. Farah', role: 'Intensivist', shift: 'Day', patients: 5, status: 'Active' },
  { name: 'Dr. Dinesh', role: 'Intensivist', shift: 'Night', patients: 5, status: 'Active' },
  { name: 'Sister Anita', role: 'Charge Nurse', shift: 'Day', patients: 8, status: 'Active' },
  { name: 'Rohan Iyer', role: 'Respiratory Therapist', shift: 'Day', patients: 4, status: 'Active' },
  { name: 'Asha Kulkarni', role: 'ICU Pharmacist', shift: 'On-call', patients: 16, status: 'Standby' },
];

const protocolRows = [
  { protocol: 'Sepsis 1-Hour Bundle', owner: 'Dr. Farah', revision: 'v3.2', audit: '18 Mar 2026', status: 'Active' },
  { protocol: 'Ventilator Liberation', owner: 'Rohan Iyer', revision: 'v2.5', audit: '20 Mar 2026', status: 'Active' },
  { protocol: 'Sedation Vacation', owner: 'Dr. Raman', revision: 'v1.9', audit: '16 Mar 2026', status: 'Review' },
  { protocol: 'Massive Transfusion', owner: 'Blood Bank', revision: 'v4.1', audit: '14 Mar 2026', status: 'Active' },
];

const alertRows = [
  { source: 'ICU-01', alert: 'MAP below 65 mmHg for 8 min', severity: 'Critical', owner: 'Dr. Raman', time: '14:32' },
  { source: 'ICU-02', alert: 'SpO2 below 90% despite FiO2 75%', severity: 'Critical', owner: 'Respiratory team', time: '14:27' },
  { source: 'ICU-03', alert: 'Urine output below 0.3 mL/kg/hr', severity: 'High', owner: 'Charge Nurse', time: '14:05' },
  { source: 'ICU-07', alert: 'ICP trend rising over 30 min', severity: 'High', owner: 'Dr. Shah', time: '13:52' },
  { source: 'Inventory', alert: 'Meropenem stock below par level', severity: 'Medium', owner: 'ICU Pharmacist', time: '13:40' },
];

const reportRows = [
  { name: 'Daily Census', scope: 'Operations', cadence: 'Daily 07:00', owner: 'Charge Nurse', status: 'Completed' },
  { name: 'Mortality Review', scope: 'Clinical', cadence: 'Weekly', owner: 'ICU Committee', status: 'Pending' },
  { name: 'Antibiotic Utilization', scope: 'Pharmacy', cadence: 'Weekly', owner: 'ICU Pharmacist', status: 'Completed' },
  { name: 'Ventilator Days', scope: 'Quality', cadence: 'Monthly', owner: 'Respiratory team', status: 'Pending' },
];

const supportCards = [
  { title: 'Clinical Escalation', text: 'Reach ICU command desk, RRT activation, and on-call intensivist matrix.' },
  { title: 'Bio-Med Support', text: 'Open breakdown tickets for monitors, ventilators, and infusion stack issues.' },
  { title: 'Training Library', text: 'Access SOP videos, quick guides, and mock code drill references.' },
];

const livePatients = [
  { bed: 'ICU-01', patient: 'Ajay Kumar', mode: 'VCV', infusions: 'Norad + Vasopressin', hr: 126, spo2: 93, map: 61, rr: 28, temp: 38.1, score: 'SOFA 12', risk: 'Critical' },
  { bed: 'ICU-02', patient: 'Sunita Joshi', mode: 'PCV', infusions: 'Propofol + Meropenem', hr: 112, spo2: 89, map: 67, rr: 24, temp: 37.8, score: 'P/F 118', risk: 'Critical' },
  { bed: 'ICU-03', patient: 'Pradeep Nair', mode: 'HFNC', infusions: 'Norad + Hydrocortisone', hr: 108, spo2: 95, map: 63, rr: 22, temp: 38.4, score: 'Lactate 3.9', risk: 'Critical' },
  { bed: 'ICU-04', patient: 'Lalita Singh', mode: 'Room air', infusions: 'Insulin + Heparin', hr: 84, spo2: 98, map: 78, rr: 18, temp: 37.0, score: 'Post-op Day 2', risk: 'Stable' },
  { bed: 'ICU-06', patient: 'Radhika Rao', mode: 'Nasal O2', infusions: 'MgSO4 + Labetalol', hr: 92, spo2: 97, map: 81, rr: 19, temp: 36.9, score: 'Improving', risk: 'Improving' },
  { bed: 'ICU-07', patient: 'Deepak Tiwari', mode: 'SIMV', infusions: 'Mannitol + Fentanyl', hr: 101, spo2: 96, map: 74, rr: 20, temp: 37.1, score: 'GCS 7', risk: 'Critical' },
];

const jitter = (base: number, tick: number, seed: number, amplitude: number, digits = 0) => {
  const factor = base + Math.sin(tick * 1.3 + seed) * amplitude;
  const scale = 10 ** digits;
  return Math.round(factor * scale) / scale;
};

export const ICULiveMonitorPage = () => {
  const [tick, setTick] = useState(0);
  const { data, refresh } = useICUPortalData(10000);

  const monitoredPatients = data?.livePatients?.length ? data.livePatients : livePatients;
  const monitorAlerts = data?.alerts?.length ? data.alerts.slice(0, 4) : alertRows.slice(0, 4);
  const liveSummary = data?.summary;

  useEffect(() => {
    const id = setInterval(() => setTick((prev) => prev + 1), 3000);
    return () => clearInterval(id);
  }, []);

  return (
    <Wrap
      title="ICU Live Monitor"
      subtitle="Real-time command view for critical beds, ventilators, and physiologic trends"
      actions={
        <>
          <Button variant="outline" size="sm" className="gap-1" onClick={refresh}><RefreshCw className="h-4 w-4" />Sync</Button>
          <Button size="sm" className="gap-1 bg-red-600 hover:bg-red-700"><Bell className="h-4 w-4" />Escalate</Button>
        </>
      }
    >
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          { label: 'Monitored Beds', value: liveSummary ? `${liveSummary.monitoredBeds}/${liveSummary.totalBeds}` : '16/20', sub: 'Beds with latest vitals', icon: LayoutGrid, color: 'text-red-600' },
          { label: 'Ventilated Patients', value: `${monitoredPatients.filter((patient) => String(patient.mode || '').toLowerCase() !== 'not charted').length || 0}`, sub: 'Derived from ICU bed assignments', icon: Wind, color: 'text-blue-600' },
          { label: 'Open Alerts', value: `${liveSummary?.openAlerts ?? 7}`, sub: 'Threshold breaches from latest vitals', icon: AlertTriangle, color: 'text-amber-600' },
          { label: 'IoT Uptime', value: '99.2%', sub: '24 bedside devices online', icon: Signal, color: 'text-emerald-600' },
        ].map((item) => <KPI key={item.label} {...item} />)}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-5">
        <div className="xl:col-span-3 grid grid-cols-1 lg:grid-cols-2 gap-4">
          {monitoredPatients.map((patient, index) => {
            const hr = jitter(patient.hr, tick, index, 4);
            const spo2 = jitter(patient.spo2, tick, index + 2, 1);
            const map = jitter(patient.map, tick, index + 3, 3);
            const rr = jitter(patient.rr, tick, index + 4, 2);
            const temp = jitter(patient.temp, tick, index + 5, 0.2, 1);

            return (
              <Card key={patient.bed} className={`border-l-4 ${patient.risk === 'Critical' ? 'border-l-red-500' : patient.risk === 'Improving' ? 'border-l-blue-500' : 'border-l-emerald-500'}`}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-red-700">{patient.bed}</span>
                        <Bdg status={patient.risk} />
                      </div>
                      <CardTitle className="mt-1 text-base">{patient.patient}</CardTitle>
                      <p className="mt-1 text-xs text-muted-foreground">{patient.mode} · {patient.infusions}</p>
                    </div>
                    <Badge className="border-0 bg-slate-100 text-slate-700 text-xs">{patient.score}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    {[
                      { label: 'HR', value: `${hr}`, tone: 'text-red-600' },
                      { label: 'SpO2', value: `${spo2}%`, tone: 'text-blue-600' },
                      { label: 'MAP', value: `${map}`, tone: 'text-amber-600' },
                      { label: 'RR', value: `${rr}`, tone: 'text-slate-700' },
                      { label: 'Temp', value: `${temp} C`, tone: 'text-emerald-600' },
                    ].map((metric) => (
                      <div key={metric.label} className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/70">
                        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{metric.label}</p>
                        <p className={`mt-1 text-lg font-bold ${metric.tone}`}>{metric.value}</p>
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="rounded-xl border p-3">
                      <p className="text-xs font-medium text-muted-foreground">Ventilator Load</p>
                      <p className="mt-1 text-sm font-semibold">FiO2 {patient.mode === 'HFNC' ? '50%' : patient.mode === 'Room air' ? '21%' : '55%'}</p>
                      <Meter value={patient.risk === 'Critical' ? 78 : 42} color="bg-blue-500" />
                    </div>
                    <div className="rounded-xl border p-3">
                      <p className="text-xs font-medium text-muted-foreground">Hemodynamic Stability</p>
                      <p className="mt-1 text-sm font-semibold">Target MAP compliance</p>
                      <Meter value={patient.risk === 'Critical' ? 46 : 84} color="bg-red-500" />
                    </div>
                    <div className="rounded-xl border p-3">
                      <p className="text-xs font-medium text-muted-foreground">Infusion Safety</p>
                      <p className="mt-1 text-sm font-semibold">Smart pump sync</p>
                      <Meter value={92} color="bg-emerald-500" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Environment</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              {[
                { label: 'ICU Temp', value: '22.1 C', icon: Thermometer, tone: 'text-blue-600' },
                { label: 'Humidity', value: '48%', icon: Droplets, tone: 'text-cyan-600' },
                { label: 'Negative Pressure Rooms', value: '3/3 OK', icon: Gauge, tone: 'text-emerald-600' },
                { label: 'Network', value: 'Primary + LTE backup', icon: Signal, tone: 'text-emerald-600' },
              ].map((item) => (
                <div key={item.label} className="flex items-center justify-between rounded-lg bg-slate-50 p-3 dark:bg-slate-800/70">
                  <div className="flex items-center gap-2">
                    <item.icon className={`h-4 w-4 ${item.tone}`} />
                    <span className="text-muted-foreground">{item.label}</span>
                  </div>
                  <span className="font-semibold">{item.value}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Escalation Queue</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {monitorAlerts.map((item) => (
                <div key={`${item.source}-${item.time || item.alert}`} className="rounded-lg border-l-4 border-l-red-500 bg-red-50 p-3 text-sm dark:bg-red-950/20">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{item.source}</span>
                    <span className="text-xs text-muted-foreground">{item.time ? new Date(item.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}</span>
                  </div>
                  <p className="mt-1 text-xs">{item.alert}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </Wrap>
  );
};

export const ICUPatientsPage = () => {
  const [query, setQuery] = useState('');
  const { data } = useICUPortalData(30000);
  const sourceRows = data?.patients?.length ? data.patients : patients;
  const rows = sourceRows.filter((row) =>
    row.patient.toLowerCase().includes(query.toLowerCase()) ||
    row.diagnosis.toLowerCase().includes(query.toLowerCase()) ||
    row.consultant.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <Wrap
      title="Patient Register"
      subtitle="Central registry for ICU admissions, diagnoses, acuity, and consultant ownership"
      actions={
        <>
          <Button variant="outline" size="sm" className="gap-1"><Download className="h-4 w-4" />Export</Button>
          <Button size="sm" className="gap-1 bg-red-600 hover:bg-red-700"><PlusCircle className="h-4 w-4" />Admit Patient</Button>
        </>
      }
    >
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          { label: 'Active Patients', value: `${data?.summary.monitoredBeds ?? 16}`, sub: 'Beds with assigned patients', icon: Users, color: 'text-red-600' },
          { label: 'Critical', value: `${data?.summary.criticalPatients ?? 5}`, sub: 'Flagged by latest vitals', icon: AlertTriangle, color: 'text-amber-600' },
          { label: 'Discharge Ready', value: '3', sub: 'Step-down today', icon: CheckCircle2, color: 'text-emerald-600' },
          { label: 'Mean LOS', value: '3.8 d', sub: 'Rolling 30-day average', icon: Clock3, color: 'text-blue-600' },
        ].map((item) => <KPI key={item.label} {...item} />)}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(event) => setQuery(event.target.value)} className="pl-9" placeholder="Search by patient, diagnosis, or consultant..." />
          </div>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <TH>Bed</TH><TH>Patient</TH><TH cls="hidden md:table-cell">Diagnosis</TH>
                <TH cls="hidden lg:table-cell">Consultant</TH><TH>Ventilation</TH><TH>Status</TH><TH>Score</TH><TH>Actions</TH>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((row) => (
                <tr key={row.bed} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <TD cls="font-bold text-red-700">{row.bed}</TD>
                  <TD><div className="font-medium">{row.patient}</div><div className="text-xs text-muted-foreground">Age {row.age}</div></TD>
                  <TD cls="hidden md:table-cell text-muted-foreground">{row.diagnosis}</TD>
                  <TD cls="hidden lg:table-cell text-muted-foreground">{row.consultant}</TD>
                  <TD>{row.vent}</TD>
                  <TD><Bdg status={row.status} /></TD>
                  <TD><Badge className="border-0 bg-slate-100 text-slate-700 text-xs">{row.score}</Badge></TD>
                  <TD>
                    <div className="flex gap-1">
                      <button className="rounded p-1.5 hover:bg-slate-100"><Eye className="h-3.5 w-3.5 text-slate-500" /></button>
                      <button className="rounded p-1.5 hover:bg-slate-100"><Edit2 className="h-3.5 w-3.5 text-slate-500" /></button>
                    </div>
                  </TD>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </Wrap>
  );
};

export const ICUBedsPage = () => (
  <ICUBedsPageInner />
);

const ICUBedsPageInner = () => {
  const { data } = useICUPortalData(30000);
  const bedRows = data?.beds?.length ? data.beds : beds;

  return (
  <Wrap
    title="Bed Management"
    subtitle="Live occupancy board, isolation readiness, and transfer planning"
    actions={<Button size="sm" className="gap-1 bg-red-600 hover:bg-red-700"><PlusCircle className="h-4 w-4" />Allocate Bed</Button>}
  >
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
      {[
        { label: 'Total Beds', value: `${data?.summary.totalBeds ?? 20}`, sub: `${data?.summary.occupiedBeds ?? 16} occupied, ${data?.summary.availableBeds ?? 4} open`, icon: BedDouble, color: 'text-red-600' },
        { label: 'Isolation Beds', value: '3', sub: '1 open with negative pressure', icon: ShieldCheck, color: 'text-blue-600' },
        { label: 'Reserved Transfers', value: `${data?.summary.reservedBeds ?? 2}`, sub: 'Bed hold queue', icon: Clock3, color: 'text-amber-600' },
        { label: 'Turnaround', value: '22 min', sub: 'Median post discharge', icon: RefreshCw, color: 'text-emerald-600' },
      ].map((item) => <KPI key={item.label} {...item} />)}
    </div>

    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
      {bedRows.map((bed) => (
        <Card key={bed.bed} className={`border-l-4 ${bed.status === 'Occupied' ? 'border-l-red-500' : bed.status === 'Reserved' ? 'border-l-amber-500' : 'border-l-emerald-500'}`}>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-bold text-red-700">{bed.bed}</p>
                <p className="text-xs text-muted-foreground">{bed.zone}</p>
              </div>
              <Bdg status={bed.status} />
            </div>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Type</span><span className="font-medium">{bed.type}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Nurse Ratio</span><span className="font-medium">{bed.nurseRatio}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Turnaround</span><span className="font-medium">{bed.turnaround}</span></div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  </Wrap>
  );
};

export const ICUVitalsPage = () => {
  const { data } = useICUPortalData(30000);
  const rows = data?.vitals?.length ? data.vitals : vitalsRows;

  return (
  <Wrap
    title="Vitals"
    subtitle="Continuous vital signs surveillance with bedside escalation thresholds"
    actions={<Button variant="outline" size="sm" className="gap-1"><Download className="h-4 w-4" />Trend Export</Button>}
  >
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
      {[
        { label: 'Auto-captured', value: '93%', sub: 'Last 6 hours', icon: Signal, color: 'text-emerald-600' },
        { label: 'Out-of-range', value: `${data?.summary.openAlerts ?? 14}`, sub: 'Across monitored beds', icon: AlertTriangle, color: 'text-red-600' },
        { label: 'Median MAP', value: `${Math.round((rows.filter((row) => row.map !== null).reduce((sum, row) => sum + Number(row.map || 0), 0) / Math.max(rows.filter((row) => row.map !== null).length, 1)) || 69)}`, sub: 'All occupied beds', icon: Gauge, color: 'text-amber-600' },
        { label: 'Trend Reviews', value: '8', sub: 'Consultant verified', icon: TrendingUp, color: 'text-blue-600' },
      ].map((item) => <KPI key={item.label} {...item} />)}
    </div>

    <Card>
      <CardContent className="p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-slate-50/80 dark:bg-slate-800/40">
              <TH cls="pl-4">Patient</TH><TH>Bed</TH><TH>HR</TH><TH>SpO2</TH><TH>MAP</TH><TH>RR</TH><TH>Temp</TH><TH>Status</TH>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((row) => (
              <tr key={row.bed} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                <TD cls="pl-4 font-medium">{row.patient}</TD>
                <TD>{row.bed}</TD>
                <TD cls="font-semibold text-red-600">{row.hr}</TD>
                <TD cls="font-semibold text-blue-600">{row.spo2}%</TD>
                <TD cls="font-semibold text-amber-600">{row.map}</TD>
                <TD>{row.rr}</TD>
                <TD>{row.temp} C</TD>
                <TD><Bdg status={row.status} /></TD>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  </Wrap>
  );
};

export const ICUFluidBalancePage = () => (
  <Wrap
    title="Fluid Balance"
    subtitle="Hourly fluid accounting, renal watchlists, and cumulative balance review"
    actions={<Button size="sm" className="gap-1 bg-red-600 hover:bg-red-700"><Droplets className="h-4 w-4" />Record Balance</Button>}
  >
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
      {[
        { label: 'Positive Balance', value: '3', sub: 'Review before rounds', icon: Droplets, color: 'text-red-600' },
        { label: 'Negative Balance', value: '1', sub: 'Diuretic response monitored', icon: TrendingUp, color: 'text-blue-600' },
        { label: 'Renal Watch', value: '2', sub: 'AKI escalation list', icon: AlertTriangle, color: 'text-amber-600' },
        { label: 'Chart Completion', value: '97%', sub: 'Last 24h nursing close', icon: CheckCircle2, color: 'text-emerald-600' },
      ].map((item) => <KPI key={item.label} {...item} />)}
    </div>

    <Card>
      <CardContent className="p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-slate-50/80 dark:bg-slate-800/40">
              <TH cls="pl-4">Patient</TH><TH>Input</TH><TH>Output</TH><TH>Balance</TH><TH>Risk</TH>
            </tr>
          </thead>
          <tbody className="divide-y">
            {fluidRows.map((row) => (
              <tr key={row.patient} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                <TD cls="pl-4 font-medium">{row.patient}</TD>
                <TD>{fmt(row.input)} mL</TD>
                <TD>{fmt(row.output)} mL</TD>
                <TD cls={row.balance > 500 ? 'font-semibold text-red-600' : row.balance < 0 ? 'font-semibold text-blue-600' : 'font-semibold'}>
                  {row.balance > 0 ? '+' : ''}{fmt(row.balance)} mL
                </TD>
                <TD><Bdg status={row.risk} /></TD>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  </Wrap>
);

export const ICUMedicationsPage = () => (
  <Wrap
    title="Medications"
    subtitle="Active infusion orders, due doses, and high-alert medication visibility"
    actions={
      <>
        <Button variant="outline" size="sm" className="gap-1"><Download className="h-4 w-4" />MAR Export</Button>
        <Button size="sm" className="gap-1 bg-red-600 hover:bg-red-700"><PlusCircle className="h-4 w-4" />New Order</Button>
      </>
    }
  >
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
      {[
        { label: 'Active Drips', value: '9', sub: '4 vasoactive, 2 sedation', icon: Syringe, color: 'text-red-600' },
        { label: 'Due in 60 Min', value: '6', sub: 'Antibiotics and insulin', icon: Pill, color: 'text-amber-600' },
        { label: 'Closed Loop', value: '88%', sub: 'Order to administration', icon: CheckCircle2, color: 'text-emerald-600' },
        { label: 'High Alert', value: '4', sub: 'Double sign required', icon: AlertTriangle, color: 'text-blue-600' },
      ].map((item) => <KPI key={item.label} {...item} />)}
    </div>

    <Card>
      <CardContent className="p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-slate-50/80 dark:bg-slate-800/40">
              <TH cls="pl-4">Patient</TH><TH>Drug</TH><TH>Route</TH><TH>Dose</TH><TH>Next Time</TH><TH>Status</TH>
            </tr>
          </thead>
          <tbody className="divide-y">
            {medicationOrders.map((row) => (
              <tr key={`${row.patient}-${row.drug}`} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                <TD cls="pl-4 font-medium">{row.patient}</TD>
                <TD>{row.drug}</TD>
                <TD>{row.route}</TD>
                <TD>{row.dose}</TD>
                <TD>{row.time}</TD>
                <TD><Bdg status={row.status} /></TD>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  </Wrap>
);

export const ICUVentilatorsPage = () => (
  <Wrap
    title="Ventilators"
    subtitle="Mode oversight, oxygen load, and readiness for spontaneous breathing trials"
    actions={<Button size="sm" className="gap-1 bg-red-600 hover:bg-red-700"><Wind className="h-4 w-4" />Assign Ventilator</Button>}
  >
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
      {[
        { label: 'Invasive Ventilation', value: '3', sub: '2 severe hypoxemia', icon: Wind, color: 'text-red-600' },
        { label: 'NIV/HFNC', value: '2', sub: 'Step-down candidates tracked', icon: Activity, color: 'text-blue-600' },
        { label: 'SBT Planned', value: '2', sub: 'Tomorrow morning round', icon: CheckCircle2, color: 'text-emerald-600' },
        { label: 'Backup Capacity', value: '1', sub: 'Portable unit on standby', icon: Wrench, color: 'text-amber-600' },
      ].map((item) => <KPI key={item.label} {...item} />)}
    </div>

    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
      {ventilators.map((row) => (
        <Card key={row.bed}>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-bold text-red-700">{row.bed}</p>
                <p className="text-sm font-medium">{row.patient}</p>
              </div>
              <Bdg status={row.status} />
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/70"><p className="text-xs text-muted-foreground">Model</p><p className="mt-1 font-semibold">{row.model}</p></div>
              <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/70"><p className="text-xs text-muted-foreground">Mode</p><p className="mt-1 font-semibold">{row.mode}</p></div>
              <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/70"><p className="text-xs text-muted-foreground">FiO2</p><p className="mt-1 font-semibold">{row.fio2}%</p></div>
              <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/70"><p className="text-xs text-muted-foreground">PEEP</p><p className="mt-1 font-semibold">{row.peep} cmH2O</p></div>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Compliance</p>
              <p className="mt-1 text-sm font-semibold">{row.compliance}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  </Wrap>
);

export const ICUEquipmentPage = () => (
  <Wrap
    title="Equipment"
    subtitle="Critical device readiness, preventive maintenance, and calibration status"
    actions={<Button variant="outline" size="sm" className="gap-1"><Download className="h-4 w-4" />Asset Register</Button>}
  >
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
      {[
        { label: 'Ready Assets', value: '42', sub: 'Across bedsides and carts', icon: Stethoscope, color: 'text-emerald-600' },
        { label: 'Running Assets', value: '11', sub: 'Connected to patient care', icon: Signal, color: 'text-blue-600' },
        { label: 'PM Due Soon', value: '3', sub: 'Within next 14 days', icon: Wrench, color: 'text-amber-600' },
        { label: 'Calibration Overdue', value: '1', sub: 'ABG analyzer queue', icon: AlertTriangle, color: 'text-red-600' },
      ].map((item) => <KPI key={item.label} {...item} />)}
    </div>

    <Card>
      <CardContent className="p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-slate-50/80 dark:bg-slate-800/40">
              <TH cls="pl-4">Asset</TH><TH>Device</TH><TH>Location</TH><TH>Last Service</TH><TH>Next Due</TH><TH>Status</TH>
            </tr>
          </thead>
          <tbody className="divide-y">
            {devices.map((row) => (
              <tr key={row.asset} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                <TD cls="pl-4 font-medium">{row.asset}</TD>
                <TD>{row.device}</TD>
                <TD>{row.location}</TD>
                <TD>{row.lastService}</TD>
                <TD>{row.nextDue}</TD>
                <TD><Bdg status={row.status} /></TD>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  </Wrap>
);

export const ICUInfectionsPage = () => (
  <Wrap
    title="Infections"
    subtitle="Bundle compliance, device-associated infection prevention, and outbreak watchlist"
    actions={<Button size="sm" className="gap-1 bg-red-600 hover:bg-red-700"><ShieldCheck className="h-4 w-4" />Open Audit</Button>}
  >
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
      {[
        { label: 'Bundle Compliance', value: '92%', sub: 'Weighted across all bundles', icon: ShieldCheck, color: 'text-emerald-600' },
        { label: 'Open Deviations', value: '6', sub: 'Hand hygiene and line care', icon: AlertTriangle, color: 'text-red-600' },
        { label: 'Zero Harm Days', value: '18', sub: 'No CLABSI event', icon: CheckCircle2, color: 'text-blue-600' },
        { label: 'Audit Coverage', value: '100%', sub: 'All occupied beds reviewed', icon: ClipboardCheck, color: 'text-amber-600' },
      ].map((item) => <KPI key={item.label} {...item} />)}
    </div>

    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
      {infectionRows.map((row) => (
        <Card key={row.bundle}>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-semibold">{row.bundle}</p>
                <p className="text-xs text-muted-foreground">Owner: {row.owner}</p>
              </div>
              <Bdg status={row.status} />
            </div>
            <div>
              <div className="mb-1 flex justify-between text-xs text-muted-foreground"><span>Compliance</span><span>{row.compliance}%</span></div>
              <Meter value={row.compliance} color={row.compliance >= 90 ? 'bg-emerald-500' : 'bg-amber-500'} />
            </div>
            <div className="text-sm">
              <span className="text-muted-foreground">Open findings:</span> <span className="font-semibold">{row.open}</span>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  </Wrap>
);

export const ICUTeamPage = () => (
  <Wrap
    title="Critical Team"
    subtitle="Shift roster, consultant load, and allied critical care resource planning"
    actions={<Button size="sm" className="gap-1 bg-red-600 hover:bg-red-700"><Users className="h-4 w-4" />Assign Shift</Button>}
  >
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
      {[
        { label: 'Consultants On Duty', value: '3', sub: '24x7 intensivist cover', icon: Users, color: 'text-red-600' },
        { label: 'Nurses On Floor', value: '12', sub: '1:1 and 1:2 mapped', icon: HeartPulse, color: 'text-blue-600' },
        { label: 'Respiratory Staff', value: '2', sub: 'Ventilator rounds active', icon: Wind, color: 'text-emerald-600' },
        { label: 'Open Shifts', value: '1', sub: 'Night RT backup', icon: Clock3, color: 'text-amber-600' },
      ].map((item) => <KPI key={item.label} {...item} />)}
    </div>

    <Card>
      <CardContent className="p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-slate-50/80 dark:bg-slate-800/40">
              <TH cls="pl-4">Name</TH><TH>Role</TH><TH>Shift</TH><TH>Patient Load</TH><TH>Status</TH>
            </tr>
          </thead>
          <tbody className="divide-y">
            {teamRoster.map((row) => (
              <tr key={row.name} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                <TD cls="pl-4 font-medium">{row.name}</TD>
                <TD>{row.role}</TD>
                <TD>{row.shift}</TD>
                <TD>{row.patients}</TD>
                <TD><Bdg status={row.status} /></TD>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  </Wrap>
);

export const ICUProtocolsPage = () => (
  <Wrap
    title="Protocols"
    subtitle="ICU care bundles, standing orders, and protocol revision governance"
    actions={<Button size="sm" className="gap-1 bg-red-600 hover:bg-red-700"><FileText className="h-4 w-4" />New Protocol</Button>}
  >
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
      {[
        { label: 'Active Protocols', value: '28', sub: 'Clinical + emergency pathways', icon: ClipboardCheck, color: 'text-red-600' },
        { label: 'Due for Review', value: '4', sub: 'Within 30 days', icon: Clock3, color: 'text-amber-600' },
        { label: 'Audit Pass Rate', value: '95%', sub: 'Quarter-to-date', icon: CheckCircle2, color: 'text-emerald-600' },
        { label: 'Drill Coverage', value: '87%', sub: 'Code blue refresher complete', icon: Activity, color: 'text-blue-600' },
      ].map((item) => <KPI key={item.label} {...item} />)}
    </div>

    <Card>
      <CardContent className="p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-slate-50/80 dark:bg-slate-800/40">
              <TH cls="pl-4">Protocol</TH><TH>Owner</TH><TH>Revision</TH><TH>Last Audit</TH><TH>Status</TH>
            </tr>
          </thead>
          <tbody className="divide-y">
            {protocolRows.map((row) => (
              <tr key={row.protocol} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                <TD cls="pl-4 font-medium">{row.protocol}</TD>
                <TD>{row.owner}</TD>
                <TD>{row.revision}</TD>
                <TD>{row.audit}</TD>
                <TD><Bdg status={row.status} /></TD>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  </Wrap>
);

export const ICUAlertsPage = () => (
  <Wrap
    title="Alerts"
    subtitle="Physiologic, operational, and stock alerts with ownership and escalation trails"
    actions={<Button variant="outline" size="sm" className="gap-1"><Bell className="h-4 w-4" />Alert Rules</Button>}
  >
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
      {[
        { label: 'Critical Alerts', value: '2', sub: 'Need bedside response', icon: AlertTriangle, color: 'text-red-600' },
        { label: 'High Alerts', value: '2', sub: 'Review within 15 min', icon: Bell, color: 'text-amber-600' },
        { label: 'Escalated', value: '1', sub: 'RRT aware and tracking', icon: Users, color: 'text-blue-600' },
        { label: 'Closed Today', value: '11', sub: 'Median closure 9 min', icon: CheckCircle2, color: 'text-emerald-600' },
      ].map((item) => <KPI key={item.label} {...item} />)}
    </div>

    <div className="space-y-3">
      {alertRows.map((row) => (
        <Card key={`${row.source}-${row.time}`} className={`border-l-4 ${row.severity === 'Critical' ? 'border-l-red-500' : row.severity === 'High' ? 'border-l-amber-500' : 'border-l-blue-500'}`}>
          <CardContent className="p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold">{row.source}</p>
                  <Bdg status={row.severity} />
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{row.alert}</p>
              </div>
              <div className="text-sm">
                <p className="font-medium">{row.owner}</p>
                <p className="text-xs text-muted-foreground">{row.time}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  </Wrap>
);

export const ICUReportsPage = () => (
  <Wrap
    title="Reports"
    subtitle="Operational reporting cadence for census, mortality, utilization, and stewardship"
    actions={<Button size="sm" className="gap-1 bg-red-600 hover:bg-red-700"><Download className="h-4 w-4" />Generate Pack</Button>}
  >
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
      {[
        { label: 'Scheduled Reports', value: '12', sub: 'Auto-generated templates', icon: FileText, color: 'text-red-600' },
        { label: 'Completed Today', value: '5', sub: 'Morning run successful', icon: CheckCircle2, color: 'text-emerald-600' },
        { label: 'Pending Reviews', value: '2', sub: 'Committee sign-off pending', icon: Clock3, color: 'text-amber-600' },
        { label: 'Distribution Lists', value: '7', sub: 'Consultants, quality, admin', icon: Users, color: 'text-blue-600' },
      ].map((item) => <KPI key={item.label} {...item} />)}
    </div>

    <Card>
      <CardContent className="p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-slate-50/80 dark:bg-slate-800/40">
              <TH cls="pl-4">Report</TH><TH>Scope</TH><TH>Cadence</TH><TH>Owner</TH><TH>Status</TH>
            </tr>
          </thead>
          <tbody className="divide-y">
            {reportRows.map((row) => (
              <tr key={row.name} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                <TD cls="pl-4 font-medium">{row.name}</TD>
                <TD>{row.scope}</TD>
                <TD>{row.cadence}</TD>
                <TD>{row.owner}</TD>
                <TD><Bdg status={row.status} /></TD>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  </Wrap>
);

export const ICUAnalyticsPage = () => (
  <Wrap
    title="Analytics"
    subtitle="Utilization, severity, ventilation, and medication trends for ICU performance management"
    actions={<Button variant="outline" size="sm" className="gap-1"><Download className="h-4 w-4" />Export Analytics</Button>}
  >
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
      {[
        { label: 'Occupancy', value: '80%', sub: '7-day trailing average', icon: BarChart3, color: 'text-red-600' },
        { label: 'Ventilator Days', value: '28', sub: 'This month to date', icon: Wind, color: 'text-blue-600' },
        { label: 'ICU Mortality', value: '7.1%', sub: 'Risk adjusted', icon: TrendingUp, color: 'text-amber-600' },
        { label: 'Medication Turnaround', value: '11 min', sub: 'Median order to admin', icon: Pill, color: 'text-emerald-600' },
      ].map((item) => <KPI key={item.label} {...item} />)}
    </div>

    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {[
        { title: 'Occupancy by Zone', rows: [{ label: 'Red Zone', value: 92 }, { label: 'Amber Zone', value: 78 }, { label: 'Green Zone', value: 55 }], color: 'bg-red-500' },
        { title: 'Protocol Compliance', rows: [{ label: 'Sepsis', value: 96 }, { label: 'Ventilator', value: 91 }, { label: 'Sedation', value: 87 }], color: 'bg-blue-500' },
        { title: 'Pharmacy SLA', rows: [{ label: 'STAT meds', value: 94 }, { label: 'Routine meds', value: 88 }, { label: 'Infusions', value: 91 }], color: 'bg-emerald-500' },
      ].map((card) => (
        <Card key={card.title}>
          <CardHeader className="pb-3"><CardTitle className="text-base">{card.title}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {card.rows.map((row) => (
              <div key={row.label}>
                <div className="mb-1 flex justify-between text-sm"><span className="text-muted-foreground">{row.label}</span><span className="font-semibold">{row.value}%</span></div>
                <Meter value={row.value} color={card.color} />
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  </Wrap>
);

export const ICUSettingsPage = () => (
  <Wrap
    title="Settings"
    subtitle="Escalation policies, alert thresholds, dashboard widgets, and integration controls"
    actions={<Button size="sm" className="gap-1 bg-red-600 hover:bg-red-700"><Settings className="h-4 w-4" />Save Changes</Button>}
  >
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {[
        { title: 'Alert Thresholds', text: 'Heart rate, MAP, SpO2, ventilator disconnection, and infusion stop thresholds mapped to ICU policy.' },
        { title: 'Notification Routing', text: 'Escalate alerts to bedside nurse, charge nurse, intensivist, and rapid response tree based on severity.' },
        { title: 'Widget Preferences', text: 'Configure wallboard tiles, live monitor density, and role-based quick action cards.' },
        { title: 'Integration Health', text: 'Monitor HIS, bedside monitor gateway, LIS, ABG analyzer, and pharmacy interface connectivity.' },
      ].map((card) => (
        <Card key={card.title}>
          <CardContent className="p-5">
            <h3 className="text-sm font-semibold">{card.title}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{card.text}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  </Wrap>
);

export const ICUSupportPage = () => (
  <Wrap
    title="Support"
    subtitle="Operational help, clinical escalation contacts, and ICU training resources"
    actions={<Button variant="outline" size="sm" className="gap-1"><HelpCircle className="h-4 w-4" />Open Ticket</Button>}
  >
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {supportCards.map((card) => (
        <Card key={card.title}>
          <CardContent className="p-5">
            <h3 className="text-sm font-semibold">{card.title}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{card.text}</p>
          </CardContent>
        </Card>
      ))}
    </div>

    <Card>
      <CardHeader className="pb-3"><CardTitle className="text-base">Support Channels</CardTitle></CardHeader>
      <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
        <div className="rounded-xl bg-slate-50 p-4 dark:bg-slate-800/70">
          <p className="font-semibold">ICU Command Desk</p>
          <p className="mt-1 text-muted-foreground">Ext 2201 · 24x7 escalation desk</p>
        </div>
        <div className="rounded-xl bg-slate-50 p-4 dark:bg-slate-800/70">
          <p className="font-semibold">Bio-Med Hotline</p>
          <p className="mt-1 text-muted-foreground">Ext 4410 · Device breakdown triage</p>
        </div>
        <div className="rounded-xl bg-slate-50 p-4 dark:bg-slate-800/70">
          <p className="font-semibold">Training Coordinator</p>
          <p className="mt-1 text-muted-foreground">icu.training@mediczy.com</p>
        </div>
      </CardContent>
    </Card>
  </Wrap>
);
