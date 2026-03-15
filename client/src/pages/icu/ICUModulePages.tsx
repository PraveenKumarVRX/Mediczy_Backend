import HospDeptLayout, { DeptNavSection } from '@/components/hosp-dept/HospDeptLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  HeartPulse, Activity, BedDouble, Pill, TrendingUp,
  Stethoscope, Users, Bell, BarChart3, Settings, HelpCircle,
  PlusCircle, Download,
} from 'lucide-react';

const navSections: DeptNavSection[] = [
  { title: 'Overview', items: [{ icon: HeartPulse, label: 'Dashboard', href: '/icu/dashboard' }] },
  { title: 'Patient Care', items: [
    { icon: Activity,     label: 'Patient Monitor', href: '/icu/patients' },
    { icon: BedDouble,    label: 'Bed Management',  href: '/icu/beds' },
    { icon: Pill,         label: 'Medications',     href: '/icu/medications' },
    { icon: TrendingUp,   label: 'Vitals',          href: '/icu/vitals' },
  ]},
  { title: 'Operations', items: [
    { icon: Stethoscope,  label: 'Equipment',     href: '/icu/equipment' },
    { icon: Users,        label: 'Critical Team', href: '/icu/team' },
    { icon: Bell,         label: 'Alerts',        href: '/icu/alerts' },
  ]},
  { title: 'System', items: [
    { icon: BarChart3,  label: 'Reports',  href: '/icu/reports' },
    { icon: Settings,   label: 'Settings', href: '/icu/settings' },
    { icon: HelpCircle, label: 'Support',  href: '/icu/support' },
  ]},
];

const PlaceholderPage = ({ title, description, icon: Icon, addBtn }: {
  title: string; description: string; icon: React.ElementType; addBtn?: string;
}) => (
  <Card>
    <CardHeader className="flex flex-row items-center justify-between pb-3">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-xl bg-teal-50 dark:bg-teal-950">
          <Icon className="h-5 w-5 text-teal-600" />
        </div>
        <div>
          <CardTitle className="text-base">{title}</CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        </div>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" className="gap-1"><Download className="h-4 w-4" />Export</Button>
        {addBtn && <Button size="sm" className="gap-1 bg-teal-600 hover:bg-teal-700"><PlusCircle className="h-4 w-4" />{addBtn}</Button>}
      </div>
    </CardHeader>
    <CardContent>
      <div className="h-64 flex items-center justify-center border-2 border-dashed rounded-xl text-muted-foreground">
        <div className="text-center">
          <Icon className="h-10 w-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm font-medium">{title}</p>
          <p className="text-xs mt-1">Data loads from backend API</p>
        </div>
      </div>
    </CardContent>
  </Card>
);

const wrap = (title: string, subtitle: string, Icon: React.ElementType, addBtn?: string) =>
  () => (
    <HospDeptLayout deptKey="icu" deptName="ICU" badgeLabel="ICU"
      loginPath="/icu/login" DeptIcon={HeartPulse} navSections={navSections}
      title={title} subtitle={subtitle}>
      <PlaceholderPage title={title} description={subtitle} icon={Icon} addBtn={addBtn} />
    </HospDeptLayout>
  );

export const ICUPatientsPage   = wrap('Patient Monitor',  'Live patient status & interventions',  Activity,    'Admit Patient');
export const ICUBedsPage       = wrap('Bed Management',   'ICU bed allocation & transfers',       BedDouble,   'Allocate Bed');
export const ICUMedicationsPage= wrap('Medications',      'Drug orders & administration log',     Pill,        'New Order');
export const ICUVitalsPage     = wrap('Vitals',           'Continuous vitals tracking & trends',  TrendingUp);
export const ICUEquipmentPage  = wrap('Equipment',        'Ventilators, monitors & devices',      Stethoscope);
export const ICUTeamPage       = wrap('Critical Team',    'ICU team roster & on-call schedule',   Users);
export const ICUAlertsPage     = wrap('Critical Alerts',  'Active alarms & escalation log',       Bell);
export const ICUReportsPage    = wrap('Reports',          'ICU outcomes & occupancy analytics',   BarChart3);
export const ICUSettingsPage   = wrap('Settings',         'ICU portal configuration',             Settings);
export const ICUSupportPage    = wrap('Help & Support',   'Contact support or view docs',         HelpCircle);
