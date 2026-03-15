import HospDeptLayout, { DeptNavSection } from '@/components/hosp-dept/HospDeptLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  ShieldCheck, Star, ClipboardList, FileText, CheckCircle2,
  AlertTriangle, TrendingUp, MessageSquare, BarChart3, Settings, HelpCircle,
  PlusCircle, Download,
} from 'lucide-react';

const navSections: DeptNavSection[] = [
  { title: 'Overview', items: [{ icon: ShieldCheck, label: 'Dashboard', href: '/quality/dashboard' }] },
  { title: 'NABH', items: [
    { icon: Star,          label: 'NABH Standards',    href: '/quality/nabh-standards' },
    { icon: ClipboardList, label: 'Assessments',       href: '/quality/assessments' },
    { icon: FileText,      label: 'Audit Reports',     href: '/quality/audit-reports' },
    { icon: CheckCircle2,  label: 'Accreditation',     href: '/quality/accreditation' },
  ]},
  { title: 'Quality', items: [
    { icon: AlertTriangle, label: 'Incident Reports',  href: '/quality/incidents' },
    { icon: TrendingUp,    label: 'KPIs & Indicators', href: '/quality/kpis' },
    { icon: FileText,      label: 'SOPs & Policies',   href: '/quality/sops' },
    { icon: MessageSquare, label: 'Patient Feedback',  href: '/quality/feedback' },
  ]},
  { title: 'System', items: [
    { icon: BarChart3,  label: 'Reports',  href: '/quality/reports' },
    { icon: Settings,   label: 'Settings', href: '/quality/settings' },
    { icon: HelpCircle, label: 'Support',  href: '/quality/support' },
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
    <HospDeptLayout deptKey="quality" deptName="Quality & NABH" badgeLabel="Quality"
      loginPath="/quality/login" DeptIcon={ShieldCheck} navSections={navSections}
      title={title} subtitle={subtitle}>
      <PlaceholderPage title={title} description={subtitle} icon={Icon} addBtn={addBtn} />
    </HospDeptLayout>
  );

export const QualityNABHStandardsPage = wrap('NABH Standards',    'Chapter-wise compliance checklist',        Star,          'New Checklist');
export const QualityAssessmentsPage   = wrap('Assessments',       'Internal & external assessment records',   ClipboardList, 'Schedule');
export const QualityAuditReportsPage  = wrap('Audit Reports',     'Completed audit summaries & findings',     FileText,      'New Report');
export const QualityAccreditationPage = wrap('Accreditation',     'NABH certificate & renewal status',        CheckCircle2);
export const QualityIncidentsPage     = wrap('Incident Reports',  'Log and track quality incidents',          AlertTriangle, 'Report Incident');
export const QualityKPIsPage          = wrap('KPIs & Indicators', 'Clinical & operational quality KPIs',      TrendingUp);
export const QualitySOPsPage          = wrap('SOPs & Policies',   'Standard operating procedures library',    FileText,      'Add SOP');
export const QualityFeedbackPage      = wrap('Patient Feedback',  'Satisfaction surveys & complaints',        MessageSquare);
export const QualityReportsPage       = wrap('Reports',           'Quality analytics & NABH reports',         BarChart3);
export const QualitySettingsPage      = wrap('Settings',          'Quality portal configuration',             Settings);
export const QualitySupportPage       = wrap('Help & Support',    'Contact support or view docs',             HelpCircle);
