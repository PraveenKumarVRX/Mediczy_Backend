import React, { useState } from 'react';
import HospDeptLayout, { DeptNavSection } from '@/components/hosp-dept/HospDeptLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import {
  ShieldCheck, Star, ClipboardList, FileText, CheckCircle2,
  AlertTriangle, TrendingUp, MessageSquare, BarChart3, Settings, HelpCircle,
  PlusCircle, Download, Search, Filter, Clock3, Users,
  BellRing, CalendarDays, Award, BookOpen, Target, ArrowUpRight, Loader2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useQualityPortalData } from './useQualityPortalData';
import api from '@/utils/api';

export const qualityNavSections: DeptNavSection[] = [
  {
    title: 'Overview',
    items: [{ icon: ShieldCheck, label: 'Dashboard', href: '/quality/dashboard' }],
  },
  {
    title: 'Accreditation',
    items: [
      { icon: Star, label: 'NABH Standards', href: '/quality/nabh-standards' },
      { icon: ClipboardList, label: 'Assessments', href: '/quality/assessments' },
      { icon: FileText, label: 'Audit Reports', href: '/quality/audit-reports' },
      { icon: Award, label: 'Accreditation', href: '/quality/accreditation' },
    ],
  },
  {
    title: 'Operations',
    items: [
      { icon: AlertTriangle, label: 'Incidents', href: '/quality/incidents' },
      { icon: TrendingUp, label: 'KPIs & Indicators', href: '/quality/kpis' },
      { icon: BookOpen, label: 'SOPs & Policies', href: '/quality/sops' },
      { icon: MessageSquare, label: 'Patient Feedback', href: '/quality/feedback' },
    ],
  },
  {
    title: 'Governance',
    items: [
      { icon: BarChart3, label: 'Reports', href: '/quality/reports' },
      { icon: Settings, label: 'Settings', href: '/quality/settings' },
      { icon: HelpCircle, label: 'Support', href: '/quality/support' },
    ],
  },
];

const complianceRows = [
  { chapter: 'AAC', title: 'Access, Assessment and Continuity of Care', owner: 'Clinical Ops', score: 93, gap: 2, status: 'Compliant' },
  { chapter: 'COP', title: 'Care of Patients', owner: 'Nursing', score: 88, gap: 6, status: 'Watchlist' },
  { chapter: 'MOM', title: 'Management of Medication', owner: 'Pharmacy', score: 84, gap: 9, status: 'Action' },
  { chapter: 'HIC', title: 'Hospital Infection Control', owner: 'Infection Control', score: 96, gap: 1, status: 'Compliant' },
  { chapter: 'FMS', title: 'Facility Management & Safety', owner: 'Admin', score: 82, gap: 11, status: 'Action' },
  { chapter: 'IMS', title: 'Information Management System', owner: 'IT/EDP', score: 79, gap: 13, status: 'Action' },
];

const assessmentRows = [
  { name: 'Mock NABH Round 1', scope: 'All Depts', date: '26 Mar 2026', auditor: 'QA Core Team', status: 'Scheduled' },
  { name: 'Medication Safety Audit', scope: 'Pharmacy + ICU', date: '24 Mar 2026', auditor: 'Dr. Menon', status: 'In Progress' },
  { name: 'Fire & Safety Drill', scope: 'Campus', date: '30 Mar 2026', auditor: 'Safety Officer', status: 'Planned' },
  { name: 'Consent Documentation Review', scope: 'OT + Wards', date: '02 Apr 2026', auditor: 'Legal & Quality', status: 'Planned' },
];

const auditRows = [
  { report: 'RCA Summary - ICU Event', type: 'Adverse Event', findings: 5, closed: 3, owner: 'Quality Lead', status: 'Open' },
  { report: 'NABH Documentation Audit', type: 'Internal Audit', findings: 12, closed: 10, owner: 'NABH Coordinator', status: 'Review' },
  { report: 'Medication Reconciliation Audit', type: 'Clinical Audit', findings: 8, closed: 8, owner: 'Pharmacy QA', status: 'Closed' },
  { report: 'Biomedical Calibration Audit', type: 'Compliance Audit', findings: 4, closed: 2, owner: 'Bio-Med', status: 'Open' },
];

const accreditationMilestones = [
  { milestone: 'Gap Closure Submission', due: '28 Mar 2026', owner: 'NABH Coordinator', completion: 72 },
  { milestone: 'Policy Harmonization', due: '04 Apr 2026', owner: 'Quality Secretariat', completion: 64 },
  { milestone: 'Departmental Mock Survey', due: '12 Apr 2026', owner: 'Dept Champions', completion: 41 },
  { milestone: 'Board Readiness Review', due: '18 Apr 2026', owner: 'Leadership', completion: 22 },
];

const incidentRows = [
  { id: 'INC-2407', category: 'Patient Safety', location: 'ICU', severity: 'High', aging: '2 days', owner: 'Dr. Rekha', status: 'RCA Pending' },
  { id: 'INC-2406', category: 'Medication Error', location: 'Pharmacy', severity: 'Medium', aging: '1 day', owner: 'Pharm QA', status: 'CAPA Open' },
  { id: 'INC-2405', category: 'Near Miss', location: 'OT', severity: 'Low', aging: '6 hrs', owner: 'OT Manager', status: 'Under Review' },
  { id: 'INC-2404', category: 'Falls', location: 'Ward 5A', severity: 'Medium', aging: '4 days', owner: 'Nursing Lead', status: 'Closed' },
  { id: 'INC-2403', category: 'Equipment', location: 'NICU', severity: 'High', aging: '3 days', owner: 'Bio-Med', status: 'CAPA Open' },
];

const indicatorRows = [
  { metric: 'Hand Hygiene Compliance', target: '95%', actual: '92%', trend: '+3%', owner: 'HIC Team' },
  { metric: 'Patient Identification Accuracy', target: '100%', actual: '99.4%', trend: '+0.4%', owner: 'Nursing' },
  { metric: 'Medication Turnaround', target: '< 15 min', actual: '18 min', trend: '-2 min', owner: 'Pharmacy' },
  { metric: 'Discharge Summary TAT', target: '< 2 hrs', actual: '1.6 hrs', trend: '+0.3 hrs', owner: 'MRD' },
  { metric: 'Incident Closure SLA', target: '90%', actual: '86%', trend: '+5%', owner: 'Quality' },
];

const sopRows = [
  { title: 'Medication Error Disclosure', version: 'v3.2', owner: 'Quality Office', review: '15 Apr 2026', status: 'Approved' },
  { title: 'Sentinel Event RCA Workflow', version: 'v2.8', owner: 'Clinical Governance', review: '30 Mar 2026', status: 'Review Due' },
  { title: 'Hand Hygiene Observation SOP', version: 'v4.1', owner: 'HIC Team', review: '09 May 2026', status: 'Approved' },
  { title: 'Document Control Matrix', version: 'v1.9', owner: 'Accreditation Cell', review: '22 Mar 2026', status: 'Review Due' },
];

const feedbackRows = [
  { channel: 'IP Survey', responses: 186, nps: 71, complaints: 4, owner: 'Patient Relations' },
  { channel: 'OPD Kiosk', responses: 322, nps: 64, complaints: 11, owner: 'Front Office' },
  { channel: 'WhatsApp Follow-up', responses: 140, nps: 74, complaints: 3, owner: 'CRM Team' },
  { channel: 'Discharge Callback', responses: 92, nps: 69, complaints: 2, owner: 'Nursing Audit' },
];

const reportRows = [
  { name: 'Board Quality Pack', cadence: 'Monthly', audience: 'Leadership', status: 'Ready' },
  { name: 'NABH Gap Tracker', cadence: 'Weekly', audience: 'NABH Cell', status: 'Live' },
  { name: 'Incident Aging Dashboard', cadence: 'Daily', audience: 'Dept Heads', status: 'Live' },
  { name: 'Patient Feedback Digest', cadence: 'Weekly', audience: 'Patient Experience', status: 'Draft' },
];

const settingRows = [
  { title: 'Escalation Matrix', text: 'Severity-based incident routing to quality lead, medical superintendent, and unit heads.' },
  { title: 'Document Control', text: 'Versioning, archival retention, review reminders, and approval authority mapping.' },
  { title: 'Audit Templates', text: 'Reusable mock survey checklists, tracer tools, and departmental scorecards.' },
];

const supportRows = [
  { title: 'NABH Command Desk', text: 'Daily war-room for standards interpretation, gap tracking, and survey readiness.' },
  { title: 'Quality Training Library', text: 'Orientation decks, CAPA guides, RCA templates, and mock audit playbooks.' },
  { title: 'Escalation Help', text: 'Critical event support for sentinel events, patient safety incidents, and compliance breaches.' },
];

const statusTone: Record<string, string> = {
  Compliant: 'bg-emerald-100 text-emerald-700',
  Watchlist: 'bg-amber-100 text-amber-700',
  Action: 'bg-red-100 text-red-700',
  Scheduled: 'bg-blue-100 text-blue-700',
  'In Progress': 'bg-amber-100 text-amber-700',
  Planned: 'bg-slate-100 text-slate-700',
  Open: 'bg-red-100 text-red-700',
  Review: 'bg-blue-100 text-blue-700',
  Closed: 'bg-emerald-100 text-emerald-700',
  'RCA Pending': 'bg-red-100 text-red-700',
  'CAPA Open': 'bg-amber-100 text-amber-700',
  'Under Review': 'bg-blue-100 text-blue-700',
  Approved: 'bg-emerald-100 text-emerald-700',
  'Review Due': 'bg-amber-100 text-amber-700',
  Ready: 'bg-emerald-100 text-emerald-700',
  Live: 'bg-blue-100 text-blue-700',
  Draft: 'bg-slate-100 text-slate-700',
};

const ToneBadge = ({ value }: { value: string }) => (
  <Badge className={`${statusTone[value] ?? 'bg-slate-100 text-slate-700'} border-0 text-xs`}>{value}</Badge>
);

const PageShell = ({ title, subtitle, actions, children }: {
  title: string;
  subtitle: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) => (
  <HospDeptLayout
    deptKey="quality"
    deptName="Quality & NABH"
    badgeLabel="Quality"
    loginPath="/quality/login"
    DeptIcon={ShieldCheck}
    navSections={qualityNavSections}
    title={title}
    subtitle={subtitle}
  >
    <div className="space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2">
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search quality records" className="pl-9" />
          </div>
          <Button variant="outline" size="sm" className="gap-1"><Filter className="h-4 w-4" />Filter</Button>
        </div>
        <div className="flex flex-wrap gap-2">{actions}</div>
      </div>
      {children}
    </div>
  </HospDeptLayout>
);

const StatCard = ({ label, value, sub, icon: Icon, color }: {
  label: string;
  value: string;
  sub: string;
  icon: LucideIcon;
  color: string;
}) => (
  <Card className="hover:shadow-md transition-shadow">
    <CardContent className="p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <p className={`mt-1 text-2xl font-bold ${color}`}>{value}</p>
          <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
        </div>
        <div className="rounded-xl bg-slate-50 p-2.5 dark:bg-slate-800">
          <Icon className={`h-5 w-5 ${color}`} />
        </div>
      </div>
    </CardContent>
  </Card>
);

const SectionTable = ({ headers, rows }: { headers: string[]; rows: React.ReactNode[][] }) => (
  <table className="w-full text-sm">
    <thead>
      <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
        {headers.map((header) => <th key={header} className="py-2 pr-3 font-medium">{header}</th>)}
      </tr>
    </thead>
    <tbody>
      {rows.map((row, index) => (
        <tr key={index} className="border-b last:border-0 hover:bg-muted/30">
          {row.map((cell, cellIndex) => <td key={cellIndex} className="py-3 pr-3 align-top">{cell}</td>)}
        </tr>
      ))}
    </tbody>
  </table>
);

const QualityDataState = ({ loading, error, refresh }: { loading: boolean; error: string | null; refresh: () => void }) => {
  if (!loading && !error) {
    return null;
  }

  return (
    <Card className="border-dashed">
      <CardContent className="flex items-center justify-between gap-3 p-4 text-sm">
        <div className="flex items-center gap-2 text-muted-foreground">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <AlertTriangle className="h-4 w-4 text-amber-600" />}
          <span>{loading ? 'Loading live quality data...' : error}</span>
        </div>
        {!loading && <Button variant="outline" size="sm" onClick={refresh}>Retry</Button>}
      </CardContent>
    </Card>
  );
};

export const QualityNABHStandardsPage = () => {
  const { data, loading, error, refresh } = useQualityPortalData();
  const chapters = data?.chapters ?? complianceRows;

  return (
    <PageShell
      title="NABH Standards"
      subtitle="Chapter-wise readiness, ownership, and gap closure visibility"
      actions={<><Button variant="outline" size="sm" className="gap-1"><Download className="h-4 w-4" />Export Matrix</Button><Button size="sm" className="gap-1 bg-teal-600 hover:bg-teal-700"><PlusCircle className="h-4 w-4" />Add Observation</Button></>}
    >
      <QualityDataState loading={loading} error={error} refresh={refresh} />
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label="Average Compliance" value={`${Math.round(chapters.reduce((sum, row) => sum + row.score, 0) / Math.max(chapters.length, 1))}%`} sub={`Across ${chapters.length} key chapters`} icon={Star} color="text-amber-600" />
        <StatCard label="Critical Gaps" value={String(chapters.reduce((sum, row) => sum + row.gap, 0))} sub="Need leadership action" icon={AlertTriangle} color="text-red-600" />
        <StatCard label="Department Champions" value={String(new Set(chapters.map((row) => row.owner)).size)} sub="Mapped to chapters" icon={Users} color="text-blue-600" />
        <StatCard label="Policies Synced" value={String((data?.policies ?? sopRows).length)} sub="Controlled documents" icon={BookOpen} color="text-emerald-600" />
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">Standards Compliance Matrix</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {chapters.map((row) => (
            <div key={row.chapter} className="space-y-1.5">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="font-medium">{row.chapter} <span className="text-muted-foreground">{row.title}</span></p>
                  <p className="text-xs text-muted-foreground">Owner: {row.owner} • Gaps open: {row.gap}</p>
                </div>
                <div className="flex items-center gap-3">
                  <ToneBadge value={row.status} />
                  <span className="text-sm font-semibold text-teal-700">{row.score}%</span>
                </div>
              </div>
              <Progress value={row.score} className="h-2" />
            </div>
          ))}
        </CardContent>
      </Card>
    </PageShell>
  );
};

export const QualityAssessmentsPage = () => {
  const { data, loading, error, refresh } = useQualityPortalData();
  const assessments = data?.assessments ?? assessmentRows;

  return (
  <PageShell
    title="Assessments"
    subtitle="Mock surveys, internal assessments, tracer rounds, and audit calendar"
    actions={<><Button variant="outline" size="sm" className="gap-1"><CalendarDays className="h-4 w-4" />Audit Calendar</Button><Button size="sm" className="gap-1 bg-teal-600 hover:bg-teal-700"><PlusCircle className="h-4 w-4" />Schedule Assessment</Button></>}
  >
    <QualityDataState loading={loading} error={error} refresh={refresh} />
    <Card>
      <CardHeader><CardTitle className="text-base">Assessment Pipeline</CardTitle></CardHeader>
      <CardContent>
        <SectionTable
          headers={['Assessment', 'Scope', 'Date', 'Auditor', 'Status']}
          rows={assessments.map((row) => [row.name, row.scope, row.date, row.auditor, <ToneBadge value={row.status} />])}
        />
      </CardContent>
    </Card>
  </PageShell>
  );
};

export const QualityAuditReportsPage = () => {
  const { data, loading, error, refresh } = useQualityPortalData();
  const reports = data?.auditReports ?? auditRows;

  return (
  <PageShell
    title="Audit Reports"
    subtitle="Findings, closure progress, and cross-functional accountability"
    actions={<><Button variant="outline" size="sm" className="gap-1"><Download className="h-4 w-4" />Download Pack</Button><Button size="sm" className="gap-1 bg-teal-600 hover:bg-teal-700"><FileText className="h-4 w-4" />New Report</Button></>}
  >
    <QualityDataState loading={loading} error={error} refresh={refresh} />
    <Card>
      <CardHeader><CardTitle className="text-base">Open and Closed Audit Reports</CardTitle></CardHeader>
      <CardContent>
        <SectionTable
          headers={['Report', 'Type', 'Findings', 'Closed', 'Owner', 'Status']}
          rows={reports.map((row) => [row.report, row.type, String(row.findings), String(row.closed), row.owner, <ToneBadge value={row.status} />])}
        />
      </CardContent>
    </Card>
  </PageShell>
  );
};

export const QualityAccreditationPage = () => {
  const { data, loading, error, refresh } = useQualityPortalData();
  const milestones = data?.accreditation ?? accreditationMilestones;

  return (
  <PageShell
    title="Accreditation"
    subtitle="Readiness milestones, document control, and survey governance"
    actions={<><Button variant="outline" size="sm" className="gap-1"><BellRing className="h-4 w-4" />Notify Owners</Button><Button size="sm" className="gap-1 bg-teal-600 hover:bg-teal-700"><Target className="h-4 w-4" />Update Milestone</Button></>}
  >
    <QualityDataState loading={loading} error={error} refresh={refresh} />
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
      <Card>
        <CardHeader><CardTitle className="text-base">Accreditation Timeline</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {milestones.map((item) => (
            <div key={item.milestone} className="space-y-1.5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{item.milestone}</p>
                  <p className="text-xs text-muted-foreground">Due {item.due} • {item.owner}</p>
                </div>
                <span className="text-sm font-semibold">{item.completion}%</span>
              </div>
              <Progress value={item.completion} className="h-2" />
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">Readiness Summary</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          {[
            ['Document Approval Rate', '91%'],
            ['Department Mock Completion', '63%'],
            ['Closure Evidence Uploaded', '74%'],
            ['Leadership Review Frequency', 'Weekly'],
            ['Survey Window', 'Q2 FY26'],
          ].map(([label, value]) => (
            <div key={label} className="flex justify-between">
              <span className="text-muted-foreground">{label}</span>
              <span className="font-semibold">{value}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  </PageShell>
  );
};

export const QualityIncidentsPage = () => {
  const { data, loading, error, refresh } = useQualityPortalData();
  const incidents = data?.incidents ?? incidentRows;

  return (
  <PageShell
    title="Incidents"
    subtitle="Patient safety events, near misses, RCA workflow, and CAPA tracking"
    actions={<><Button variant="outline" size="sm" className="gap-1"><Download className="h-4 w-4" />Export Register</Button><Button size="sm" className="gap-1 bg-teal-600 hover:bg-teal-700"><PlusCircle className="h-4 w-4" />Report Incident</Button></>}
  >
    <QualityDataState loading={loading} error={error} refresh={refresh} />
    <Card>
      <CardHeader><CardTitle className="text-base">Incident Register</CardTitle></CardHeader>
      <CardContent>
        <SectionTable
          headers={['ID', 'Category', 'Location', 'Severity', 'Aging', 'Owner', 'Status']}
          rows={incidents.map((row) => [row.id, row.category, row.location, row.severity, row.aging, row.owner, <ToneBadge value={row.status} />])}
        />
      </CardContent>
    </Card>
  </PageShell>
  );
};

export const QualityKPIsPage = () => {
  const { data, loading, error, refresh } = useQualityPortalData();
  const indicators = data?.indicators ?? indicatorRows;
  const [antibiogram, setAntibiogram] = useState<any[]>([]);
  const [infectionAlerts, setInfectionAlerts] = useState<any[]>([]);

  React.useEffect(() => {
    Promise.all([
      api.get('/roadmap-intelligence/antibiogram/summary'),
      api.get('/roadmap-intelligence/infection-surveillance/alerts'),
    ]).then(([antibiogramRes, alertsRes]) => {
      setAntibiogram(antibiogramRes.data?.data ?? []);
      setInfectionAlerts(alertsRes.data?.data ?? []);
    }).catch(() => {
      setAntibiogram([]);
      setInfectionAlerts([]);
    });
  }, []);

  return (
  <PageShell
    title="KPIs & Indicators"
    subtitle="Operational and clinical quality metrics with department ownership"
    actions={<><Button variant="outline" size="sm" className="gap-1"><BarChart3 className="h-4 w-4" />View Trends</Button><Button size="sm" className="gap-1 bg-teal-600 hover:bg-teal-700"><Target className="h-4 w-4" />Set Threshold</Button></>}
  >
    <QualityDataState loading={loading} error={error} refresh={refresh} />
    <div className="grid gap-5 xl:grid-cols-[1.2fr_1fr]">
      <Card>
        <CardHeader><CardTitle className="text-base">Indicator Control Sheet</CardTitle></CardHeader>
        <CardContent>
          <SectionTable
            headers={['Metric', 'Target', 'Actual', 'Trend', 'Owner']}
            rows={indicators.map((row) => [row.metric, row.target, row.actual, <span className="inline-flex items-center gap-1 font-medium text-emerald-600"><ArrowUpRight className="h-4 w-4" />{row.trend}</span>, row.owner])}
          />
        </CardContent>
      </Card>
      <div className="space-y-5">
        <Card>
          <CardHeader><CardTitle className="text-base">Infection Surveillance Alerts</CardTitle></CardHeader>
          <CardContent>
            {infectionAlerts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No 7-day organism cluster alerts.</p>
            ) : (
              <SectionTable
                headers={['Organism', 'Isolates', 'Severity']}
                rows={infectionAlerts.map((row) => [
                  row.organism,
                  String(row.isolates),
                  <Badge className={row.severity === 'high' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}>{row.severity}</Badge>,
                ])}
              />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Antibiogram Snapshot</CardTitle></CardHeader>
          <CardContent>
            {antibiogram.length === 0 ? (
              <p className="text-sm text-muted-foreground">No culture data captured yet.</p>
            ) : (
              <SectionTable
                headers={['Organism', 'Antibiotic', 'Sensitivity']}
                rows={antibiogram.slice(0, 6).map((row) => [
                  row.organism,
                  row.antibiotic,
                  `${row.sensitivity_percent ?? 0}% (${row.sensitive}/${row.total})`,
                ])}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  </PageShell>
  );
};

export const QualitySOPsPage = () => {
  const { data, loading, error, refresh } = useQualityPortalData();
  const policies = data?.policies ?? sopRows;
  const nabhTemplates = data?.nabhTemplates ?? [];

  return (
  <PageShell
    title="SOPs & Policies"
    subtitle="Controlled documents, reviews due, and version governance"
    actions={<><Button variant="outline" size="sm" className="gap-1"><Download className="h-4 w-4" />Policy Index</Button><Button size="sm" className="gap-1 bg-teal-600 hover:bg-teal-700"><PlusCircle className="h-4 w-4" />Add SOP</Button></>}
  >
    <QualityDataState loading={loading} error={error} refresh={refresh} />
    <div className="grid gap-5 xl:grid-cols-2">
      <Card>
        <CardHeader><CardTitle className="text-base">Document Control Register</CardTitle></CardHeader>
        <CardContent>
          <SectionTable
            headers={['Document', 'Version', 'Owner', 'Next Review', 'Status']}
            rows={policies.map((row) => [row.title, row.version, row.owner, row.review, <ToneBadge value={row.status} />])}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">NABH Template Pack</CardTitle></CardHeader>
        <CardContent>
          <SectionTable
            headers={['Code', 'Template', 'Version', 'Owner', 'Format']}
            rows={nabhTemplates.map((row) => [row.code, row.title, row.version, row.owner, row.format])}
          />
        </CardContent>
      </Card>
    </div>
  </PageShell>
  );
};

export const QualityFeedbackPage = () => {
  const { data, loading, error, refresh } = useQualityPortalData();
  const feedback = data?.feedback ?? feedbackRows;
  const [form, setForm] = useState({ patientId: '', visitType: 'opd', rating: '5', communicationScore: '5', cleanlinessScore: '5', waitTimeScore: '5', comment: '' });
  const qualityHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('qualityToken') || ''}` });

  const submitPrems = async () => {
    await api.post('/hospital/practice/prems/responses', {
      patientId: form.patientId || undefined,
      visitType: form.visitType,
      rating: Number(form.rating),
      communicationScore: Number(form.communicationScore),
      cleanlinessScore: Number(form.cleanlinessScore),
      waitTimeScore: Number(form.waitTimeScore),
      comment: form.comment,
    }, { headers: qualityHeaders() });
    setForm({ patientId: '', visitType: 'opd', rating: '5', communicationScore: '5', cleanlinessScore: '5', waitTimeScore: '5', comment: '' });
    refresh();
  };

  return (
  <PageShell
    title="Patient Feedback"
    subtitle="Experience scores, complaint volume, and follow-up accountability"
    actions={<><Button variant="outline" size="sm" className="gap-1"><MessageSquare className="h-4 w-4" />Response Queue</Button><Button size="sm" className="gap-1 bg-teal-600 hover:bg-teal-700"><Download className="h-4 w-4" />Export Feedback</Button></>}
  >
    <QualityDataState loading={loading} error={error} refresh={refresh} />
    <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
      <Card>
        <CardHeader><CardTitle className="text-base">Feedback Channels</CardTitle></CardHeader>
        <CardContent>
          <SectionTable
            headers={['Channel', 'Responses', 'NPS', 'Complaints', 'Owner']}
            rows={feedback.map((row) => [row.channel, String(row.responses), String(row.nps), String(row.complaints), row.owner])}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">Capture PREMS Response</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Input placeholder="Patient ID" value={form.patientId} onChange={(e) => setForm({ ...form, patientId: e.target.value })} />
          <Select value={form.visitType} onValueChange={(visitType) => setForm({ ...form, visitType })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="opd">OPD</SelectItem><SelectItem value="ipd">IPD</SelectItem></SelectContent>
          </Select>
          <Input type="number" min="1" max="5" placeholder="Overall rating" value={form.rating} onChange={(e) => setForm({ ...form, rating: e.target.value })} />
          <Input placeholder="Comment" value={form.comment} onChange={(e) => setForm({ ...form, comment: e.target.value })} />
          <Button onClick={submitPrems} className="w-full">Save Response</Button>
        </CardContent>
      </Card>
    </div>
  </PageShell>
  );
};

export const QualityReportsPage = () => {
  const { data, loading, error, refresh } = useQualityPortalData();
  const reports = data?.reports ?? reportRows;

  return (
  <PageShell
    title="Reports"
    subtitle="Leadership packs, operational scorecards, and live governance reporting"
    actions={<><Button variant="outline" size="sm" className="gap-1"><CalendarDays className="h-4 w-4" />Schedule Mailout</Button><Button size="sm" className="gap-1 bg-teal-600 hover:bg-teal-700"><Download className="h-4 w-4" />Generate Report</Button></>}
  >
    <QualityDataState loading={loading} error={error} refresh={refresh} />
    <Card>
      <CardHeader><CardTitle className="text-base">Reporting Catalogue</CardTitle></CardHeader>
      <CardContent>
        <SectionTable
          headers={['Report', 'Cadence', 'Audience', 'Status']}
          rows={reports.map((row) => [row.name, row.cadence, row.audience, <ToneBadge value={row.status} />])}
        />
      </CardContent>
    </Card>
  </PageShell>
  );
};

export const QualitySettingsPage = () => {
  const { data, loading, error, refresh } = useQualityPortalData();
  const settings = data?.settings ?? settingRows;

  return (
  <PageShell
    title="Settings"
    subtitle="Governance controls, automation rules, and document management preferences"
    actions={<Button size="sm" className="gap-1 bg-teal-600 hover:bg-teal-700"><Settings className="h-4 w-4" />Save Changes</Button>}
  >
    <QualityDataState loading={loading} error={error} refresh={refresh} />
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
      {settings.map((row) => (
        <Card key={row.title}>
          <CardHeader><CardTitle className="text-base">{row.title}</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground">{row.text}</CardContent>
        </Card>
      ))}
    </div>
  </PageShell>
  );
};

export const QualitySupportPage = () => {
  const { data, loading, error, refresh } = useQualityPortalData();
  const support = data?.support ?? supportRows;

  return (
  <PageShell
    title="Support"
    subtitle="Quality office support channels, training resources, and escalation guidance"
    actions={<Button size="sm" className="gap-1 bg-teal-600 hover:bg-teal-700"><HelpCircle className="h-4 w-4" />Open Ticket</Button>}
  >
    <QualityDataState loading={loading} error={error} refresh={refresh} />
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
      {support.map((row) => (
        <Card key={row.title}>
          <CardHeader><CardTitle className="text-base">{row.title}</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>{row.text}</p>
            <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/70">
              <p className="font-medium text-slate-900 dark:text-white">Response SLA</p>
              <p className="mt-1">Business critical requests: 30 minutes. Governance requests: same working day.</p>
            </div>
          </CardContent>
        </Card>
      ))}
      <Card className="xl:col-span-3">
        <CardHeader><CardTitle className="text-base">Key Contacts</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          {[
            ['Quality Secretariat', 'quality@mediczy.com'],
            ['NABH Coordinator', 'nabh@mediczy.com'],
            ['Patient Safety Escalation', 'safety@mediczy.com'],
          ].map(([name, mail]) => (
            <div key={name} className="rounded-xl border p-4">
              <p className="font-semibold">{name}</p>
              <p className="mt-1 text-muted-foreground">{mail}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  </PageShell>
  );
};
