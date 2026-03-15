import HospDeptLayout, { DeptNavSection } from '@/components/hosp-dept/HospDeptLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Monitor, Ticket, Users, Package, Activity,
  Network, HardDrive, Shield, Lock, BarChart3, Settings, HelpCircle,
  PlusCircle, Download,
} from 'lucide-react';

const navSections: DeptNavSection[] = [
  { title: 'Overview', items: [{ icon: Monitor, label: 'Dashboard', href: '/it-edp/dashboard' }] },
  { title: 'Support', items: [
    { icon: Ticket,  label: 'Help Desk Tickets', href: '/it-edp/tickets' },
    { icon: Users,   label: 'User Accounts',     href: '/it-edp/users' },
    { icon: Package, label: 'Asset Management',  href: '/it-edp/assets' },
  ]},
  { title: 'Infrastructure', items: [
    { icon: Activity,   label: 'System Monitor',    href: '/it-edp/systems' },
    { icon: Network,    label: 'Network Status',    href: '/it-edp/network' },
    { icon: HardDrive,  label: 'Backup & Recovery', href: '/it-edp/backup' },
  ]},
  { title: 'Security', items: [
    { icon: Shield, label: 'Security Logs',  href: '/it-edp/security' },
    { icon: Lock,   label: 'Access Control', href: '/it-edp/access' },
  ]},
  { title: 'System', items: [
    { icon: BarChart3,  label: 'Reports',  href: '/it-edp/reports' },
    { icon: Settings,   label: 'Settings', href: '/it-edp/settings' },
    { icon: HelpCircle, label: 'Support',  href: '/it-edp/support' },
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
    <HospDeptLayout deptKey="it-edp" deptName="IT / EDP" badgeLabel="IT/EDP"
      loginPath="/it-edp/login" DeptIcon={Monitor} navSections={navSections}
      title={title} subtitle={subtitle}>
      <PlaceholderPage title={title} description={subtitle} icon={Icon} addBtn={addBtn} />
    </HospDeptLayout>
  );

export const ITEDPTicketsPage  = wrap('Help Desk Tickets', 'Create & track IT support tickets',   Ticket,    'New Ticket');
export const ITEDPUsersPage    = wrap('User Accounts',     'Manage system user access & roles',    Users,     'Add User');
export const ITEDPAssetsPage   = wrap('Asset Management',  'Track hardware & software assets',     Package,   'Add Asset');
export const ITEDPSystemsPage  = wrap('System Monitor',    'Live server and service health',        Activity);
export const ITEDPNetworkPage  = wrap('Network Status',    'LAN/WAN connectivity overview',        Network);
export const ITEDPBackupPage   = wrap('Backup & Recovery', 'Schedule and monitor backups',         HardDrive, 'Run Backup');
export const ITEDPSecurityPage = wrap('Security Logs',     'Audit trails and security events',     Shield);
export const ITEDPAccessPage   = wrap('Access Control',    'Role & permission management',         Lock,      'Add Rule');
export const ITEDPReportsPage  = wrap('Reports',           'IT analytics and SLA reports',         BarChart3);
export const ITEDPSettingsPage = wrap('Settings',          'IT/EDP portal configuration',          Settings);
export const ITEDPSupportPage  = wrap('Help & Support',    'Contact support or view docs',         HelpCircle);
