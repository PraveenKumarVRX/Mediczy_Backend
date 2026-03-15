import HospDeptLayout, { DeptNavSection } from '@/components/hosp-dept/HospDeptLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Lock, Camera, MapPin, KeyRound, ShieldAlert,
  AlertTriangle, Radio, Users, ClipboardList, BarChart3,
  Settings, HelpCircle, PlusCircle, Download,
} from 'lucide-react';

const navSections: DeptNavSection[] = [
  { title: 'Overview', items: [{ icon: Lock, label: 'Dashboard', href: '/security/dashboard' }] },
  { title: 'Surveillance', items: [
    { icon: Camera,   label: 'CCTV Monitor',   href: '/security/cctv' },
    { icon: MapPin,   label: 'Access Points',  href: '/security/access-points' },
    { icon: KeyRound, label: 'Access Logs',    href: '/security/access-logs' },
  ]},
  { title: 'Incidents', items: [
    { icon: ShieldAlert,   label: 'Incident Log',  href: '/security/incidents' },
    { icon: AlertTriangle, label: 'Active Alerts', href: '/security/alerts' },
    { icon: Radio,         label: 'Guard Duty',    href: '/security/guard-duty' },
  ]},
  { title: 'People', items: [
    { icon: Users,        label: 'Visitor Mgmt',   href: '/security/visitors' },
    { icon: ClipboardList,label: 'Staff Entry Log',href: '/security/staff-log' },
  ]},
  { title: 'System', items: [
    { icon: BarChart3,    label: 'Reports',  href: '/security/reports' },
    { icon: Lock,         label: 'Settings', href: '/security/settings' },
    { icon: HelpCircle,   label: 'Support',  href: '/security/support' },
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
    <HospDeptLayout deptKey="security" deptName="Security" badgeLabel="Security"
      loginPath="/security/login" DeptIcon={Lock} navSections={navSections}
      title={title} subtitle={subtitle}>
      <PlaceholderPage title={title} description={subtitle} icon={Icon} addBtn={addBtn} />
    </HospDeptLayout>
  );

export const SecurityCCTVPage        = wrap('CCTV Monitor',    'Live and recorded camera feeds',             Camera);
export const SecurityAccessPointsPage= wrap('Access Points',   'Door access status and controls',            MapPin);
export const SecurityAccessLogsPage  = wrap('Access Logs',     'Entry/exit audit trail',                     KeyRound);
export const SecurityIncidentsPage   = wrap('Incident Log',    'Security incidents and follow-ups',          ShieldAlert, 'Log Incident');
export const SecurityAlertsPage      = wrap('Active Alerts',   'Real-time alerts and escalations',           AlertTriangle);
export const SecurityGuardDutyPage   = wrap('Guard Duty',      'Shift roster and patrol assignments',        Radio,       'Assign Patrol');
export const SecurityVisitorsPage    = wrap('Visitor Management','Visitor passes and check-in/out',          Users,       'Issue Pass');
export const SecurityStaffLogPage    = wrap('Staff Entry Log',  'Staff biometric & entry logs',              ClipboardList);
export const SecurityReportsPage     = wrap('Reports',          'Security analytics and audit reports',      BarChart3);
export const SecuritySettingsPage    = wrap('Settings',         'Security portal configuration',             Settings);
export const SecuritySupportPage     = wrap('Help & Support',   'Contact support or view docs',              HelpCircle);
