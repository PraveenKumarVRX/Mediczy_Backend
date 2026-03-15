import HospDeptLayout, { DeptNavSection } from '@/components/hosp-dept/HospDeptLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Users, UserCog, Calendar, CalendarOff, Wallet,
  Briefcase, GraduationCap, Star, BarChart3, Settings, HelpCircle,
  PlusCircle, Download,
} from 'lucide-react';

const navSections: DeptNavSection[] = [
  { title: 'Overview', items: [{ icon: Users, label: 'Dashboard', href: '/hr/dashboard' }] },
  { title: 'Workforce', items: [
    { icon: UserCog,     label: 'Staff Directory',    href: '/hr/staff' },
    { icon: Calendar,    label: 'Attendance',         href: '/hr/attendance' },
    { icon: CalendarOff, label: 'Leave Management',   href: '/hr/leaves' },
    { icon: Wallet,      label: 'Payroll',            href: '/hr/payroll' },
  ]},
  { title: 'Talent', items: [
    { icon: Briefcase,    label: 'Recruitment', href: '/hr/recruitment' },
    { icon: GraduationCap,label: 'Training',    href: '/hr/training' },
    { icon: Star,         label: 'Performance', href: '/hr/performance' },
  ]},
  { title: 'System', items: [
    { icon: BarChart3,  label: 'HR Reports', href: '/hr/reports' },
    { icon: Settings,   label: 'Settings',   href: '/hr/settings' },
    { icon: HelpCircle, label: 'Support',    href: '/hr/support' },
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
    <HospDeptLayout deptKey="hr" deptName="Human Resources" badgeLabel="HR"
      loginPath="/hr/login" DeptIcon={Users} navSections={navSections}
      title={title} subtitle={subtitle}>
      <PlaceholderPage title={title} description={subtitle} icon={Icon} addBtn={addBtn} />
    </HospDeptLayout>
  );

export const HRStaffPage       = wrap('Staff Directory',  'Search & manage staff records',       UserCog,      'Add Staff');
export const HRAttendancePage  = wrap('Attendance',       'Daily attendance & biometric logs',   Calendar);
export const HRLeavesPage      = wrap('Leave Management', 'Apply, approve & track leaves',       CalendarOff,  'Apply Leave');
export const HRPayrollPage     = wrap('Payroll',          'Monthly salary processing',           Wallet,       'Run Payroll');
export const HRRecruitmentPage = wrap('Recruitment',      'Open postings & candidate tracking',  Briefcase,    'New Posting');
export const HRTrainingPage    = wrap('Training',         'Training schedules & completions',    GraduationCap,'Schedule');
export const HRPerformancePage = wrap('Performance',      'KRA reviews & appraisals',            Star,         'Start Review');
export const HRReportsPage     = wrap('HR Reports',       'Workforce analytics & compliance',    BarChart3);
export const HRSettingsPage    = wrap('Settings',         'HR portal configuration',             Settings);
export const HRSupportPage     = wrap('Help & Support',   'Contact support or view docs',        HelpCircle);
