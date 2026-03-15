import HospDeptLayout, { DeptNavSection } from '@/components/hosp-dept/HospDeptLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  HeartPulse, LayoutDashboard, Bed, Activity, Pill, Wrench,
  Users, AlertTriangle, BarChart3, Settings, HelpCircle,
  PlusCircle, Clock, AlertCircle, CheckCircle2, Thermometer,
  Droplets, Wind,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const navSections: DeptNavSection[] = [
  {
    title: 'Overview',
    items: [
      { icon: LayoutDashboard, label: 'Dashboard',        href: '/icu/dashboard' },
    ],
  },
  {
    title: 'Patient Care',
    items: [
      { icon: Activity,       label: 'Patient Monitor',   href: '/icu/patients' },
      { icon: Bed,            label: 'Bed Management',    href: '/icu/beds' },
      { icon: Pill,           label: 'Medications',       href: '/icu/medications' },
      { icon: Thermometer,    label: 'Vitals',            href: '/icu/vitals' },
    ],
  },
  {
    title: 'Operations',
    items: [
      { icon: Wrench,         label: 'Equipment',         href: '/icu/equipment' },
      { icon: Users,          label: 'Critical Team',     href: '/icu/team' },
      { icon: AlertTriangle,  label: 'Critical Alerts',   href: '/icu/alerts' },
    ],
  },
  {
    title: 'System',
    items: [
      { icon: BarChart3,      label: 'Reports',     href: '/icu/reports' },
      { icon: Settings,       label: 'Settings',    href: '/icu/settings' },
      { icon: HelpCircle,     label: 'Support',     href: '/icu/support' },
    ],
  },
];

const kpis = [
  { label: 'Total ICU Beds',   value: '20',  sub: '16 occupied, 4 free',  icon: Bed,       color: 'text-teal-600' },
  { label: 'Critical Patients',value: '5',   sub: 'Immediate attention',  icon: AlertCircle,color: 'text-red-600' },
  { label: 'Stable Patients',  value: '11',  sub: 'On ventilator: 4',     icon: CheckCircle2,color:'text-emerald-600'},
  { label: 'Available Beds',   value: '4',   sub: '1 under decontam.',    icon: HeartPulse, color: 'text-blue-600' },
];

// ICU beds with patient status
const bedStatus = [
  { bed: 'ICU-1',  patient: 'Ajay Kumar',       age: 62, diagnosis: 'MI + Cardiogenic Shock', status: 'Critical', vent: true,  hrs: 48 },
  { bed: 'ICU-2',  patient: 'Sunita Joshi',      age: 45, diagnosis: 'ARDS',                   status: 'Critical', vent: true,  hrs: 72 },
  { bed: 'ICU-3',  patient: 'Pradeep Nair',      age: 71, diagnosis: 'Septic Shock',            status: 'Critical', vent: false, hrs: 24 },
  { bed: 'ICU-4',  patient: 'Lalita Singh',       age: 55, diagnosis: 'Post-Op CABG',           status: 'Stable',   vent: false, hrs: 18 },
  { bed: 'ICU-5',  patient: 'Harish Mehta',       age: 68, diagnosis: 'Diabetic Ketoacidosis',  status: 'Stable',   vent: false, hrs: 30 },
  { bed: 'ICU-6',  patient: 'Radhika Rao',        age: 38, diagnosis: 'Eclampsia (post-LUCS)',  status: 'Improving',vent: false, hrs: 12 },
  { bed: 'ICU-7',  patient: 'Deepak Tiwari',      age: 50, diagnosis: 'Head Injury',            status: 'Critical', vent: true,  hrs: 96 },
  { bed: 'ICU-8',  patient: 'Parveen Siddiqui',   age: 60, diagnosis: 'ALF',                    status: 'Stable',   vent: false, hrs: 42 },
  { bed: 'ICU-9',  patient: '—',                   age: 0,  diagnosis: '—',                      status: 'Available',vent: false, hrs: 0  },
  { bed: 'ICU-10', patient: 'Kiran Doshi',        age: 44, diagnosis: 'Hemorrhagic Stroke',      status: 'Critical', vent: true,  hrs: 60 },
];

const alerts = [
  { bed: 'ICU-1',  alert: 'HR 128 bpm — Tachycardia',         severity: 'Critical', time: '14:32' },
  { bed: 'ICU-7',  alert: 'ICP rising — 22 mmHg',             severity: 'Critical', time: '14:28' },
  { bed: 'ICU-3',  alert: 'MAP < 65 — Vasopressor review',    severity: 'High',     time: '14:15' },
  { bed: 'ICU-10', alert: 'SpO2 88% — Check ventilator',      severity: 'Critical', time: '14:10' },
  { bed: 'ICU-2',  alert: 'Plateau pressure > 30 cmH2O',      severity: 'High',     time: '13:55' },
];

const statusColor: Record<string, string> = {
  Critical:  'bg-red-100 text-red-700',
  Stable:    'bg-emerald-100 text-emerald-700',
  Improving: 'bg-blue-100 text-blue-700',
  Available: 'bg-slate-100 text-slate-500',
};
const alertColor: Record<string, string> = {
  Critical: 'bg-red-50 border-l-2 border-red-500',
  High:     'bg-amber-50 border-l-2 border-amber-500',
};

const ICUDashboard = () => {
  const navigate = useNavigate();
  return (
    <HospDeptLayout
      deptKey="icu"
      deptName="ICU"
      badgeLabel="ICU"
      loginPath="/icu/login"
      DeptIcon={HeartPulse}
      navSections={navSections}
      title="ICU Dashboard"
      subtitle="Intensive care unit — live patient monitoring"
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
        {/* Bed Status Grid */}
        <div className="lg:col-span-2 space-y-5">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base">ICU Bed Status</CardTitle>
              <Button variant="outline" size="sm" onClick={() => navigate('/icu/beds')}>Bed Management</Button>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {bedStatus.map((b) => (
                  <div key={b.bed}
                    onClick={() => navigate('/icu/patients')}
                    className={`p-3 rounded-xl border cursor-pointer hover:shadow-sm transition-shadow ${
                      b.status === 'Critical' ? 'border-red-200 bg-red-50/50 dark:bg-red-950/30' :
                      b.status === 'Available' ? 'border-slate-200 bg-slate-50 dark:bg-slate-800' :
                      'border-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-teal-700 dark:text-teal-400">{b.bed}</span>
                      <div className="flex items-center gap-1">
                        {b.vent && <Wind className="h-3 w-3 text-blue-500" title="On ventilator" />}
                        <Badge className={`${statusColor[b.status]} border-0 text-[10px] h-4 px-1`}>{b.status}</Badge>
                      </div>
                    </div>
                    {b.status !== 'Available' ? (
                      <>
                        <p className="text-sm font-medium truncate">{b.patient}</p>
                        <p className="text-xs text-muted-foreground truncate">{b.diagnosis}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Age {b.age} · {b.hrs}h in ICU</p>
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground mt-1">Free — ready for admission</p>
                    )}
                  </div>
                ))}
              </div>
              <Button variant="ghost" size="sm" className="mt-3 w-full text-teal-600" onClick={() => navigate('/icu/patients')}>
                Full patient monitor →
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Right Column */}
        <div className="space-y-5">
          {/* Quick Actions */}
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Quick Actions</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-2">
              {[
                { label: 'Admit Patient',  icon: PlusCircle,    path: '/icu/beds',       color: 'bg-teal-50 text-teal-700 hover:bg-teal-100' },
                { label: 'Vitals Entry',   icon: Thermometer,   path: '/icu/vitals',     color: 'bg-blue-50 text-blue-700 hover:bg-blue-100' },
                { label: 'Drug Chart',     icon: Pill,          path: '/icu/medications',color: 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' },
                { label: 'Monitor',        icon: Activity,      path: '/icu/patients',   color: 'bg-violet-50 text-violet-700 hover:bg-violet-100' },
                { label: 'Equipment',      icon: Wrench,        path: '/icu/equipment',  color: 'bg-amber-50 text-amber-700 hover:bg-amber-100' },
                { label: 'Critical Team',  icon: Users,         path: '/icu/team',       color: 'bg-red-50 text-red-700 hover:bg-red-100' },
              ].map((a) => (
                <button key={a.label} onClick={() => navigate(a.path)}
                  className={`flex flex-col items-center gap-1.5 p-3 rounded-xl text-xs font-medium transition-colors ${a.color}`}>
                  <a.icon className="h-5 w-5" />
                  {a.label}
                </button>
              ))}
            </CardContent>
          </Card>

          {/* Alerts */}
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-red-500 animate-pulse" /> Live Alerts
            </CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {alerts.map((a, i) => (
                <div key={i} className={`p-2 rounded-lg text-sm ${alertColor[a.severity]}`}>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{a.bed}</span>
                    <span className="text-xs text-muted-foreground">{a.time}</span>
                  </div>
                  <p className="text-xs mt-0.5">{a.alert}</p>
                </div>
              ))}
              <Button variant="ghost" size="sm" className="w-full text-red-600 mt-1" onClick={() => navigate('/icu/alerts')}>
                View all alerts →
              </Button>
            </CardContent>
          </Card>

          {/* Summary */}
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4 text-teal-500" /> Shift Summary
            </CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {[
                { label: 'Occupied Beds',        value: '16', color: '' },
                { label: 'On Ventilator',        value: '5',  color: 'text-blue-600 font-bold' },
                { label: 'Critical Patients',    value: '5',  color: 'text-red-600 font-bold' },
                { label: 'Medications Due',      value: '12', color: 'text-amber-600' },
                { label: 'ICU Admissions Today', value: '3',  color: '' },
                { label: 'Discharges Today',     value: '1',  color: 'text-emerald-600' },
              ].map((s) => (
                <div key={s.label} className="flex justify-between">
                  <span className="text-muted-foreground">{s.label}</span>
                  <span className={`font-semibold ${s.color}`}>{s.value}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </HospDeptLayout>
  );
};

export default ICUDashboard;
