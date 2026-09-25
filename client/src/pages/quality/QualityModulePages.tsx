import React, { useState } from 'react';
import HospDeptLayout, { DeptNavSection } from '@/components/hosp-dept/HospDeptLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  ShieldCheck, Star, ClipboardList, FileText, CheckCircle2,
  AlertTriangle, TrendingUp, MessageSquare, BarChart3, Settings, HelpCircle,
  PlusCircle, Download, Search, Filter, Users, Globe,
  BellRing, CalendarDays, Award, BookOpen, Target, ArrowUpRight, Loader2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  useQualityPortalData,
  type QualityPortalAccreditation,
  type QualityPortalChapter,
} from './useQualityPortalData';
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
      { icon: Globe, label: 'JCI Standards', href: '/quality/jci-standards' },
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
    deptName="Quality & Accreditation"
    badgeLabel="Quality"
    loginPath="/quality/login"
    DeptIcon={ShieldCheck}
    navSections={qualityNavSections}
    title={title}
    subtitle={subtitle}
    copilotModule="quality"
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

const EmptyMessage = ({ children }: { children: React.ReactNode }) => (
  <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
    {children}
  </p>
);

const SectionTable = ({ headers, rows, emptyMessage = 'No records are available yet.' }: {
  headers: string[];
  rows: React.ReactNode[][];
  emptyMessage?: React.ReactNode;
}) => (
  rows.length ? (
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
  ) : <EmptyMessage>{emptyMessage}</EmptyMessage>
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

const ChapterComplianceMatrix = ({ chapters, accentColor = 'text-teal-700' }: {
  chapters: QualityPortalChapter[];
  accentColor?: string;
}) => (
  chapters.length ? (
    <div className="space-y-4">
      {chapters.map((row) => (
        <div key={row.chapter} className="space-y-1.5">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="font-medium">{row.chapter} <span className="text-muted-foreground">{row.title}</span></p>
              <p className="text-xs text-muted-foreground">Owner: {row.owner} • Gaps open: {row.gap}</p>
            </div>
            <div className="flex items-center gap-3">
              <ToneBadge value={row.status} />
              <span className={`text-sm font-semibold ${accentColor}`}>{row.score}%</span>
            </div>
          </div>
          <Progress value={row.score} className="h-2" />
        </div>
      ))}
    </div>
  ) : <EmptyMessage>No accreditation chapter assessments are connected yet.</EmptyMessage>
);

export const QualityNABHStandardsPage = () => {
  const { data, loading, error, refresh } = useQualityPortalData();
  const chapters = data?.chapters ?? [];

  return (
    <PageShell
      title="NABH Standards"
      subtitle="Chapter-wise readiness, ownership, and gap closure visibility"
      actions={<><Button variant="outline" size="sm" className="gap-1"><Download className="h-4 w-4" />Export Matrix</Button><Button size="sm" className="gap-1 bg-teal-600 hover:bg-teal-700"><PlusCircle className="h-4 w-4" />Add Observation</Button></>}
    >
      <QualityDataState loading={loading} error={error} refresh={refresh} />
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label="Average Compliance" value={chapters.length ? `${Math.round(chapters.reduce((sum, row) => sum + row.score, 0) / chapters.length)}%` : '—'} sub={chapters.length ? `Across ${chapters.length} recorded chapters` : 'No chapter assessments'} icon={Star} color="text-amber-600" />
        <StatCard label="Critical Gaps" value={chapters.length ? String(chapters.reduce((sum, row) => sum + row.gap, 0)) : '—'} sub={chapters.length ? 'Recorded against chapters' : 'No chapter assessments'} icon={AlertTriangle} color="text-red-600" />
        <StatCard label="Department Champions" value={chapters.length ? String(new Set(chapters.map((row) => row.owner)).size) : '—'} sub="Mapped to recorded chapters" icon={Users} color="text-blue-600" />
        <StatCard label="Policies Synced" value={String((data?.policies ?? []).length)} sub="Controlled documents" icon={BookOpen} color="text-emerald-600" />
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">NABH Standards Compliance Matrix</CardTitle></CardHeader>
        <CardContent><ChapterComplianceMatrix chapters={chapters} accentColor="text-amber-700" /></CardContent>
      </Card>
    </PageShell>
  );
};

export const QualityJCIStandardsPage = () => {
  const { data, loading, error, refresh } = useQualityPortalData();
  const chapters = data?.jciChapters ?? [];
  const templates = data?.jciTemplates ?? [];

  return (
    <PageShell
      title="JCI Standards"
      subtitle="Joint Commission International chapter readiness, measurable elements, and survey preparation"
      actions={<><Button variant="outline" size="sm" className="gap-1"><Download className="h-4 w-4" />Export Matrix</Button><Button size="sm" className="gap-1 bg-blue-600 hover:bg-blue-700"><PlusCircle className="h-4 w-4" />Add Observation</Button></>}
    >
      <QualityDataState loading={loading} error={error} refresh={refresh} />
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label="JCI Score" value={chapters.length ? `${Math.round(chapters.reduce((sum, r) => sum + r.score, 0) / chapters.length)}%` : '—'} sub={chapters.length ? `Across ${chapters.length} recorded chapters` : 'No chapter assessments'} icon={Globe} color="text-blue-600" />
        <StatCard label="Open Gaps" value={chapters.length ? String(chapters.reduce((sum, r) => sum + r.gap, 0)) : '—'} sub="Recorded against chapters" icon={AlertTriangle} color="text-red-600" />
        <StatCard label="Chapter Owners" value={chapters.length ? String(new Set(chapters.map((r) => r.owner)).size) : '—'} sub="Assigned leads" icon={Users} color="text-indigo-600" />
        <StatCard label="JCI Templates" value={String(templates.length)} sub="Survey-ready documents" icon={FileText} color="text-teal-600" />
      </div>
      <div className="grid gap-5 xl:grid-cols-[1.5fr_1fr]">
        <Card>
          <CardHeader><CardTitle className="text-base">JCI Chapter Compliance Matrix</CardTitle></CardHeader>
          <CardContent><ChapterComplianceMatrix chapters={chapters} accentColor="text-blue-700" /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">JCI Template Pack</CardTitle></CardHeader>
          <CardContent>
            <SectionTable
              headers={['Code', 'Template', 'Version', 'Owner', 'Format']}
              rows={templates.map((row) => [row.code, row.title, row.version, row.owner, row.format])}
            />
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">IPSG — International Patient Safety Goals</CardTitle></CardHeader>
        <CardContent>
          <EmptyMessage>International Patient Safety Goal readiness has not been assessed yet.</EmptyMessage>
        </CardContent>
      </Card>
    </PageShell>
  );
};

export const QualityAssessmentsPage = () => {
  const { data, loading, error, refresh } = useQualityPortalData();
  const assessments = data?.assessments ?? [];

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
  const reports = data?.auditReports ?? [];

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

const MilestoneTimeline = ({ milestones, accentColor = 'text-teal-700', emptyMessage = 'No accreditation milestones are connected yet.' }: {
  milestones: QualityPortalAccreditation[];
  accentColor?: string;
  emptyMessage?: React.ReactNode;
}) => (
  milestones.length ? (
    <div className="space-y-4">
      {milestones.map((item) => (
        <div key={item.milestone} className="space-y-1.5">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">{item.milestone}</p>
              <p className="text-xs text-muted-foreground">Due {item.due} • {item.owner}</p>
            </div>
            <span className={`text-sm font-semibold ${accentColor}`}>{item.completion}%</span>
          </div>
          <Progress value={item.completion} className="h-2" />
        </div>
      ))}
    </div>
  ) : <EmptyMessage>{emptyMessage}</EmptyMessage>
);

export const QualityAccreditationPage = () => {
  const [framework, setFramework] = useState<'nabh' | 'jci' | 'both'>('both');
  const { data, loading, error, refresh } = useQualityPortalData();
  const nabhMilestones = data?.accreditation ?? [];
  const jciMilestones: QualityPortalAccreditation[] = [];

  return (
  <PageShell
    title="Accreditation"
    subtitle="NABH & JCI readiness milestones, document control, and survey governance"
    actions={<><Button variant="outline" size="sm" className="gap-1"><BellRing className="h-4 w-4" />Notify Owners</Button><Button size="sm" className="gap-1 bg-teal-600 hover:bg-teal-700"><Target className="h-4 w-4" />Update Milestone</Button></>}
  >
    <QualityDataState loading={loading} error={error} refresh={refresh} />

    {/* Framework toggle */}
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground">View:</span>
      {(['nabh', 'jci', 'both'] as const).map((f) => (
        <Button key={f} size="sm" variant={framework === f ? 'default' : 'outline'}
          className={framework === f ? 'bg-teal-600 hover:bg-teal-700' : ''}
          onClick={() => setFramework(f)}>
          {f === 'both' ? 'Both' : f.toUpperCase()}
        </Button>
      ))}
    </div>

    <div className={`grid gap-5 ${framework === 'both' ? 'xl:grid-cols-2' : 'xl:grid-cols-[1.2fr_0.8fr]'}`}>
      {(framework === 'nabh' || framework === 'both') && (
        <Card>
          <CardHeader className="flex flex-row items-center gap-2 pb-3">
            <Star className="h-4 w-4 text-amber-500" />
            <CardTitle className="text-base">NABH Timeline</CardTitle>
          </CardHeader>
          <CardContent><MilestoneTimeline milestones={nabhMilestones} accentColor="text-amber-700" /></CardContent>
        </Card>
      )}
      {(framework === 'jci' || framework === 'both') && (
        <Card>
          <CardHeader className="flex flex-row items-center gap-2 pb-3">
            <Globe className="h-4 w-4 text-blue-500" />
            <CardTitle className="text-base">JCI Timeline</CardTitle>
          </CardHeader>
          <CardContent><MilestoneTimeline milestones={jciMilestones} accentColor="text-blue-700" /></CardContent>
        </Card>
      )}
    </div>

    <Card>
      <CardHeader><CardTitle className="text-base">Readiness Summary</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 xl:grid-cols-4 gap-4 text-sm">
            <EmptyMessage>Readiness metrics are not yet connected to a source. Use the timeline above for recorded milestones.</EmptyMessage>
          </CardContent>
    </Card>
  </PageShell>
  );
};

export const QualityIncidentsPage = () => {
  const { data, loading, error, refresh } = useQualityPortalData();
  const incidents = data?.incidents ?? [];

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
  const indicators = data?.indicators ?? [];
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
  const policies = data?.policies ?? [];
  const nabhTemplates = data?.nabhTemplates ?? [];
  const jciTemplates = data?.jciTemplates ?? [];

  return (
  <PageShell
    title="SOPs & Policies"
    subtitle="Controlled documents, reviews due, and version governance"
    actions={<><Button variant="outline" size="sm" className="gap-1"><Download className="h-4 w-4" />Policy Index</Button><Button size="sm" className="gap-1 bg-teal-600 hover:bg-teal-700"><PlusCircle className="h-4 w-4" />Add SOP</Button></>}
  >
    <QualityDataState loading={loading} error={error} refresh={refresh} />
    <Card>
      <CardHeader><CardTitle className="text-base">Document Control Register</CardTitle></CardHeader>
      <CardContent>
        <SectionTable
          headers={['Document', 'Version', 'Owner', 'Next Review', 'Status']}
          rows={policies.map((row) => [row.title, row.version, row.owner, row.review, <ToneBadge value={row.status} />])}
        />
      </CardContent>
    </Card>
    <div className="grid gap-5 xl:grid-cols-2">
      <Card>
        <CardHeader className="flex flex-row items-center gap-2 pb-3">
          <Star className="h-4 w-4 text-amber-500" />
          <CardTitle className="text-base">NABH Template Pack</CardTitle>
        </CardHeader>
        <CardContent>
          <SectionTable
            headers={['Code', 'Template', 'Version', 'Owner', 'Format']}
            rows={nabhTemplates.map((row) => [row.code, row.title, row.version, row.owner, row.format])}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center gap-2 pb-3">
          <Globe className="h-4 w-4 text-blue-500" />
          <CardTitle className="text-base">JCI Template Pack</CardTitle>
        </CardHeader>
        <CardContent>
          <SectionTable
            headers={['Code', 'Template', 'Version', 'Owner', 'Format']}
            rows={jciTemplates.map((row) => [row.code, row.title, row.version, row.owner, row.format])}
          />
        </CardContent>
      </Card>
    </div>
  </PageShell>
  );
};

export const QualityFeedbackPage = () => {
  const { data, loading, error, refresh } = useQualityPortalData();
  const feedback = data?.feedback ?? [];
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
  const reports = data?.reports ?? [];

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
  const settings = data?.settings ?? [];
  const activeFrameworks = data?.activeFrameworks ?? [];

  return (
  <PageShell
    title="Settings"
    subtitle="Governance controls, automation rules, and document management preferences"
    actions={<Button size="sm" className="gap-1 bg-teal-600 hover:bg-teal-700"><Settings className="h-4 w-4" />Save Changes</Button>}
  >
    <QualityDataState loading={loading} error={error} refresh={refresh} />
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
      <Card className="xl:col-span-3">
        <CardHeader><CardTitle className="text-base">Active Accreditation Frameworks</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-3 text-sm">
          {[
            { key: 'nabh', label: 'NABH (National Accreditation Board for Hospitals)', icon: Star, color: 'text-amber-600' },
            { key: 'jci', label: 'JCI (Joint Commission International)', icon: Globe, color: 'text-blue-600' },
          ].map(({ key, label, icon: Icon, color }) => (
            <div key={key} className={`flex items-center gap-2 rounded-xl border px-4 py-3 ${activeFrameworks.includes(key) ? 'border-teal-300 bg-teal-50 dark:bg-teal-950' : 'opacity-50'}`}>
              <Icon className={`h-4 w-4 ${color}`} />
              <span className="font-medium">{label}</span>
              {activeFrameworks.includes(key) && <CheckCircle2 className="h-4 w-4 text-teal-600 ml-1" />}
            </div>
          ))}
        </CardContent>
      </Card>
      {settings.length ? settings.map((row) => (
        <Card key={row.title}>
          <CardHeader><CardTitle className="text-base">{row.title}</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground">{row.text}</CardContent>
        </Card>
      )) : <EmptyMessage>No governance settings have been configured.</EmptyMessage>}
    </div>
  </PageShell>
  );
};

export const QualitySupportPage = () => {
  const { data, loading, error, refresh } = useQualityPortalData();
  const support = data?.support ?? [];

  return (
  <PageShell
    title="Support"
    subtitle="Quality office support channels, training resources, and escalation guidance"
    actions={<Button size="sm" className="gap-1 bg-teal-600 hover:bg-teal-700"><HelpCircle className="h-4 w-4" />Open Ticket</Button>}
  >
    <QualityDataState loading={loading} error={error} refresh={refresh} />
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
      {support.length ? support.map((row) => (
        <Card key={row.title}>
          <CardHeader><CardTitle className="text-base">{row.title}</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>{row.text}</p>
          </CardContent>
        </Card>
      )) : <EmptyMessage>No support channels have been configured.</EmptyMessage>}
      <Card className="xl:col-span-3">
        <CardHeader><CardTitle className="text-base">Key Contacts</CardTitle></CardHeader>
        <CardContent>
          <EmptyMessage>No quality office contacts have been configured.</EmptyMessage>
        </CardContent>
      </Card>
    </div>
  </PageShell>
  );
};
