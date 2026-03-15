import HospDeptLayout, { DeptNavSection } from '@/components/hosp-dept/HospDeptLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  ShieldCheck, ClipboardList, AlertTriangle, TrendingUp,
  CheckCircle2, XCircle, Clock, FileText, Star,
  ChevronRight, Download, PlusCircle,
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
    { icon: ClipboardList, label: 'Patient Feedback',  href: '/quality/feedback' },
  ]},
  { title: 'System', items: [
    { icon: TrendingUp,  label: 'Reports',   href: '/quality/reports' },
    { icon: ShieldCheck, label: 'Settings',  href: '/quality/settings' },
    { icon: FileText,    label: 'Support',   href: '/quality/support' },
  ]},
];

const kpis = [
  { label: 'NABH Score', value: '87%',  sub: '+2% this quarter',    icon: Star,          color: 'bg-amber-50 dark:bg-amber-950',  iconColor: 'text-amber-600' },
  { label: 'Open NCRs',  value: '14',   sub: '4 critical',          icon: AlertTriangle, color: 'bg-red-50 dark:bg-red-950',      iconColor: 'text-red-600' },
  { label: 'Closed NCRs',value: '38',   sub: 'This month',          icon: CheckCircle2,  color: 'bg-teal-50 dark:bg-teal-950',    iconColor: 'text-teal-600' },
  { label: 'Audits Due', value: '6',    sub: 'Next 30 days',        icon: Clock,         color: 'bg-violet-50 dark:bg-violet-950',iconColor: 'text-violet-600' },
];

const nabh_chapters = [
  { chapter: 'Patient Care', code: 'PCC', compliance: 91, status: 'Compliant' },
  { chapter: 'Medication Management', code: 'MMU', compliance: 84, status: 'Partial' },
  { chapter: 'Infection Control', code: 'IPSG', compliance: 96, status: 'Compliant' },
  { chapter: 'HR Management', code: 'HRM', compliance: 78, status: 'Partial' },
  { chapter: 'Facility Management', code: 'FMS', compliance: 88, status: 'Compliant' },
  { chapter: 'Information Management', code: 'MIS', compliance: 72, status: 'Partial' },
];

const incidents = [
  { id: 'INC-2401', type: 'Near Miss',    dept: 'Pharmacy',   date: '14 Mar',  severity: 'Low',    status: 'Under Review' },
  { id: 'INC-2400', type: 'Adverse Event',dept: 'ICU',        date: '13 Mar',  severity: 'High',   status: 'RCA Pending' },
  { id: 'INC-2399', type: 'Complaint',    dept: 'OPD',        date: '12 Mar',  severity: 'Medium', status: 'Closed' },
  { id: 'INC-2398', type: 'Near Miss',    dept: 'OT',         date: '11 Mar',  severity: 'Medium', status: 'Closed' },
  { id: 'INC-2397', type: 'Adverse Event',dept: 'Lab',        date: '10 Mar',  severity: 'High',   status: 'RCA Pending' },
];

const severityBadge = (s: string) => {
  const m: Record<string, string> = { High:'destructive', Medium:'warning', Low:'secondary' };
  return <Badge variant={(m[s] as any) ?? 'secondary'} className="text-xs">{s}</Badge>;
};
const statusBadge = (s: string) => {
  const m: Record<string, string> = { Closed:'bg-teal-100 text-teal-700', 'Under Review':'bg-blue-100 text-blue-700', 'RCA Pending':'bg-amber-100 text-amber-700' };
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${m[s] ?? 'bg-gray-100 text-gray-700'}`}>{s}</span>;
};
const complianceBadge = (s: string) => s === 'Compliant'
  ? <span className="flex items-center gap-1 text-teal-600 text-xs font-medium"><CheckCircle2 className="h-3 w-3" />Compliant</span>
  : <span className="flex items-center gap-1 text-amber-600 text-xs font-medium"><XCircle className="h-3 w-3" />Partial</span>;

export default function QualityDashboard() {
  return (
    <HospDeptLayout deptKey="quality" deptName="Quality & NABH" badgeLabel="Quality"
      loginPath="/quality/login" DeptIcon={ShieldCheck} navSections={navSections}
      title="Quality Dashboard" subtitle="NABH compliance, audits & incident management">

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map(k => (
          <Card key={k.label}>
            <CardContent className="p-4 flex items-start justify-between">
              <div>
                <p className="text-xs text-muted-foreground">{k.label}</p>
                <p className="text-2xl font-bold mt-1">{k.value}</p>
                <p className="text-xs text-muted-foreground mt-1">{k.sub}</p>
              </div>
              <div className={`p-2 rounded-xl ${k.color}`}>
                <k.icon className={`h-5 w-5 ${k.iconColor}`} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* NABH Chapter Compliance + Incidents */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* NABH Chapters */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Star className="h-4 w-4 text-amber-500" />NABH Chapter Compliance
            </CardTitle>
            <Button variant="ghost" size="sm" className="gap-1 text-xs">View All<ChevronRight className="h-3 w-3" /></Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {nabh_chapters.map(c => (
              <div key={c.code} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium">{c.chapter} <span className="text-muted-foreground">({c.code})</span></span>
                  <div className="flex items-center gap-3">
                    {complianceBadge(c.status)}
                    <span className="font-semibold text-teal-700">{c.compliance}%</span>
                  </div>
                </div>
                <Progress value={c.compliance} className="h-1.5" />
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Recent Incidents */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-500" />Incident Reports
            </CardTitle>
            <Button size="sm" className="gap-1 text-xs bg-teal-600 hover:bg-teal-700">
              <PlusCircle className="h-3 w-3" />Report Incident
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {incidents.map(i => (
                <div key={i.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/40 hover:bg-muted/70 transition-colors">
                  <div>
                    <p className="text-xs font-medium">{i.id} — {i.type}</p>
                    <p className="text-xs text-muted-foreground">{i.dept} · {i.date}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {severityBadge(i.severity)}
                    {statusBadge(i.status)}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions + Upcoming Audits */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Quick Actions</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-2">
            {[
              { label: 'Report Incident',   icon: AlertTriangle },
              { label: 'Schedule Audit',    icon: ClipboardList },
              { label: 'Update SOP',        icon: FileText },
              { label: 'Export NABH Report',icon: Download },
            ].map(a => (
              <Button key={a.label} variant="outline" className="flex-col h-16 gap-1 text-xs">
                <a.icon className="h-4 w-4 text-teal-600" />
                {a.label}
              </Button>
            ))}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Upcoming Audits</CardTitle></CardHeader>
          <CardContent>
            <table className="w-full text-xs">
              <thead><tr className="text-muted-foreground border-b">{['Audit','Department','Date','Auditor','Status'].map(h => <th key={h} className="text-left py-1.5 pr-3 font-medium">{h}</th>)}</tr></thead>
              <tbody>
                {[
                  ['Internal Audit', 'ICU',       '18 Mar', 'Dr. Mehta',  'Scheduled'],
                  ['NABH Mock',      'Pharmacy',  '22 Mar', 'QA Team',    'Scheduled'],
                  ['Infection Control','OT',      '25 Mar', 'Dr. Verma',  'Confirmed'],
                  ['Fire Safety',    'All Depts', '30 Mar', 'Safety Ofcr','Pending'],
                ].map((r, i) => (
                  <tr key={i} className="border-b last:border-0 hover:bg-muted/30">
                    {r.map((c, j) => <td key={j} className="py-2 pr-3">{j === 4 ? <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs">{c}</span> : c}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </HospDeptLayout>
  );
}
