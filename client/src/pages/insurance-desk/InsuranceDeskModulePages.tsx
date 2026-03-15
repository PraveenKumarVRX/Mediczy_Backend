import HospDeptLayout, { DeptNavSection } from '@/components/hosp-dept/HospDeptLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  ShieldCheck, ClipboardList, FileText, Building2, UserCheck,
  Search, BarChart3, Settings, HelpCircle, PlusCircle, Download,
} from 'lucide-react';

const navSections: DeptNavSection[] = [
  { title: 'Overview', items: [{ icon: ShieldCheck, label: 'Dashboard', href: '/insurance-desk/dashboard' }] },
  { title: 'Claims & Auth', items: [
    { icon: ClipboardList, label: 'Pre-Authorization',   href: '/insurance-desk/pre-auth' },
    { icon: FileText,      label: 'Active Claims',       href: '/insurance-desk/claims' },
    { icon: FileText,      label: 'Documents',           href: '/insurance-desk/documents' },
  ]},
  { title: 'Management', items: [
    { icon: Building2,  label: 'TPA Management',      href: '/insurance-desk/tpa' },
    { icon: UserCheck,  label: 'Patient Insurance',   href: '/insurance-desk/patient-insurance' },
    { icon: Search,     label: 'Claim Search',        href: '/insurance-desk/search' },
  ]},
  { title: 'Reports', items: [
    { icon: BarChart3,  label: 'Analytics', href: '/insurance-desk/analytics' },
    { icon: Settings,   label: 'Settings',  href: '/insurance-desk/settings' },
    { icon: HelpCircle, label: 'Support',   href: '/insurance-desk/support' },
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
    <HospDeptLayout deptKey="insurance-desk" deptName="Insurance Desk" badgeLabel="Ins. Desk"
      loginPath="/insurance-desk/login" DeptIcon={ShieldCheck} navSections={navSections}
      title={title} subtitle={subtitle}>
      <PlaceholderPage title={title} description={subtitle} icon={Icon} addBtn={addBtn} />
    </HospDeptLayout>
  );

export const InsuranceDeskPreAuthPage        = wrap('Pre-Authorization',  'Request & track pre-auth approvals',  ClipboardList, 'New Pre-Auth');
export const InsuranceDeskClaimsPage         = wrap('Active Claims',      'Monitor claim lifecycle',             FileText,      'New Claim');
export const InsuranceDeskDocumentsPage      = wrap('Documents',          'Upload & manage claim documents',     FileText,      'Upload');
export const InsuranceDeskTPAPage            = wrap('TPA Management',     'Third-party administrator directory', Building2,     'Add TPA');
export const InsuranceDeskPatientInsurancePage = wrap('Patient Insurance','Patient policy & beneficiary info',   UserCheck);
export const InsuranceDeskSearchPage         = wrap('Claim Search',       'Search claims by ID, patient, TPA',   Search);
export const InsuranceDeskAnalyticsPage      = wrap('Analytics',          'Claims trends and settlement stats',  BarChart3);
export const InsuranceDeskSettingsPage       = wrap('Settings',           'Insurance portal configuration',     Settings);
export const InsuranceDeskSupportPage        = wrap('Help & Support',     'Contact support or view docs',        HelpCircle);
