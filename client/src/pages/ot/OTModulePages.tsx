import HospDeptLayout, { DeptNavSection } from '@/components/hosp-dept/HospDeptLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Scissors, CalendarDays, Users, Stethoscope, Sparkles,
  Syringe, HeartPulse, ClipboardList, BarChart3, Settings, HelpCircle,
  PlusCircle, Download,
} from 'lucide-react';

const navSections: DeptNavSection[] = [
  { title: 'Overview', items: [{ icon: Scissors, label: 'Dashboard', href: '/ot/dashboard' }] },
  { title: 'Operations', items: [
    { icon: CalendarDays, label: 'OT Schedule',    href: '/ot/schedule' },
    { icon: Users,        label: 'Surgical Teams', href: '/ot/teams' },
    { icon: Stethoscope,  label: 'Equipment',      href: '/ot/equipment' },
    { icon: Sparkles,     label: 'Sterilization',  href: '/ot/sterilization' },
  ]},
  { title: 'Clinical', items: [
    { icon: Syringe,     label: 'Anesthesia',   href: '/ot/anesthesia' },
    { icon: HeartPulse,  label: 'Post-Op Care', href: '/ot/post-op' },
    { icon: ClipboardList,label: 'OT Records',  href: '/ot/records' },
  ]},
  { title: 'System', items: [
    { icon: BarChart3,  label: 'Reports',  href: '/ot/reports' },
    { icon: Settings,   label: 'Settings', href: '/ot/settings' },
    { icon: HelpCircle, label: 'Support',  href: '/ot/support' },
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
    <HospDeptLayout deptKey="ot" deptName="Operation Theatre" badgeLabel="OT"
      loginPath="/ot/login" DeptIcon={Scissors} navSections={navSections}
      title={title} subtitle={subtitle}>
      <PlaceholderPage title={title} description={subtitle} icon={Icon} addBtn={addBtn} />
    </HospDeptLayout>
  );

export const OTSchedulePage      = wrap('OT Schedule',     'View & manage today\'s surgeries',     CalendarDays, 'Book Slot');
export const OTTeamsPage         = wrap('Surgical Teams',  'Surgeons, nurses & OT staff',          Users);
export const OTEquipmentPage     = wrap('Equipment Status','Surgical instruments & machines',      Stethoscope);
export const OTSterilizationPage = wrap('Sterilization',   'CSR sterilization tracking',           Sparkles,     'New Batch');
export const OTAnesthesiaPage    = wrap('Anesthesia',      'Anesthesia plans & records',           Syringe,      'Add Plan');
export const OTPostOpPage        = wrap('Post-Op Care',    'Post-surgery recovery monitoring',     HeartPulse);
export const OTRecordsPage       = wrap('OT Records',      'Surgical notes & procedure logs',      ClipboardList);
export const OTReportsPage       = wrap('Reports',         'OT utilization & outcome analytics',   BarChart3);
export const OTSettingsPage      = wrap('Settings',        'OT portal configuration',              Settings);
export const OTSupportPage       = wrap('Help & Support',  'Contact support or view docs',         HelpCircle);
