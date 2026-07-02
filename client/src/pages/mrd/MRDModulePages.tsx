import HospDeptLayout, { DeptNavSection } from '@/components/hosp-dept/HospDeptLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  FolderOpen, FileText, UserPlus, ClipboardCheck, Inbox,
  Code2, Scale, FolderKanban, BarChart3, Settings, HelpCircle,
  PlusCircle, Download,
} from 'lucide-react';

const navSections: DeptNavSection[] = [
  { title: 'Overview', items: [{ icon: FolderOpen, label: 'Dashboard', href: '/mrd/dashboard' }] },
  { title: 'Records', items: [
    { icon: FileText,       label: 'Patient Records',    href: '/mrd/records' },
    { icon: UserPlus,       label: 'Admissions',         href: '/mrd/admissions' },
    { icon: ClipboardCheck, label: 'Discharge Summary',  href: '/mrd/discharge' },
    { icon: Inbox,          label: 'Record Requests',    href: '/mrd/requests' },
  ]},
  { title: 'Coding & Legal', items: [
    { icon: Code2,         label: 'ICD-10 Coding',      href: '/mrd/icd-coding' },
    { icon: Scale,         label: 'Medico-Legal Cases', href: '/mrd/medico-legal' },
    { icon: FolderKanban,  label: 'File Tracking',      href: '/mrd/file-tracking' },
  ]},
  { title: 'System', items: [
    { icon: BarChart3,  label: 'Statistics', href: '/mrd/statistics' },
    { icon: Settings,   label: 'Settings',   href: '/mrd/settings' },
    { icon: HelpCircle, label: 'Support',    href: '/mrd/support' },
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
    <HospDeptLayout deptKey="mrd" deptName="Medical Records" badgeLabel="MRD"
      loginPath="/mrd/login" DeptIcon={FolderOpen} navSections={navSections}
      title={title} subtitle={subtitle} copilotModule="mrd">
      <PlaceholderPage title={title} description={subtitle} icon={Icon} addBtn={addBtn} />
    </HospDeptLayout>
  );

export const MRDRecordsPage        = wrap('Patient Records',    'Search & manage patient records',  FileText,       'New Record');
export const MRDAdmissionsPage     = wrap('Admissions',        'Register new admissions',           UserPlus,       'New Admission');
export const MRDDischargePage      = wrap('Discharge Summary', 'Complete discharge summaries',      ClipboardCheck, 'New Summary');
export const MRDRequestsPage       = wrap('Record Requests',   'Pending record request queue',      Inbox);
export const MRDICDCodingPage      = wrap('ICD-10 Coding',     'Assign diagnosis & procedure codes',Code2,          'New Code');
export const MRDMedicoLegalPage    = wrap('Medico-Legal Cases','Legal & medico-legal proceedings',  Scale,          'New Case');
export const MRDFileTrackingPage   = wrap('File Tracking',     'Track physical & digital files',    FolderKanban);
export const MRDStatisticsPage     = wrap('Statistics',        'Admission & discharge analytics',   BarChart3);
export const MRDSettingsPage       = wrap('Settings',          'MRD portal configuration',         Settings);
export const MRDSupportPage        = wrap('Help & Support',    'Contact support or view docs',      HelpCircle);
