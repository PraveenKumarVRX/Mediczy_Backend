import React, { useState } from 'react';
import HospDeptLayout from '@/components/hosp-dept/HospDeptLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  ShieldCheck, ClipboardList, AlertTriangle, TrendingUp,
  CheckCircle2, FileText, Star, Globe,
  Download, PlusCircle, BellRing, BookOpen, Target, MessageSquare, Loader2,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { qualityNavSections } from './QualityModulePages';
import { useQualityPortalData } from './useQualityPortalData';

const kpiDecorators: Record<string, { icon: typeof Star; color: string; iconColor: string }> = {
  'NABH Score': { icon: Star, color: 'bg-amber-50 dark:bg-amber-950', iconColor: 'text-amber-600' },
  'JCI Score':  { icon: Globe, color: 'bg-blue-50 dark:bg-blue-950', iconColor: 'text-blue-600' },
  'Open NCRs': { icon: AlertTriangle, color: 'bg-red-50 dark:bg-red-950', iconColor: 'text-red-600' },
  'Closed NCRs': { icon: CheckCircle2, color: 'bg-teal-50 dark:bg-teal-950', iconColor: 'text-teal-600' },
  'Patient Experience': { icon: TrendingUp, color: 'bg-indigo-50 dark:bg-indigo-950', iconColor: 'text-indigo-600' },
};

const severityBadge = (s: string) => {
  const m: Record<string, string> = {
    High: 'bg-red-100 text-red-700',
    Medium: 'bg-amber-100 text-amber-700',
    Low: 'bg-slate-100 text-slate-700',
  };
  return <Badge className={`${m[s] ?? 'bg-slate-100 text-slate-700'} border-0 text-xs`}>{s}</Badge>;
};
const statusBadge = (s: string) => {
  const m: Record<string, string> = { Closed:'bg-teal-100 text-teal-700', 'Under Review':'bg-blue-100 text-blue-700', 'RCA Pending':'bg-amber-100 text-amber-700' };
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${m[s] ?? 'bg-gray-100 text-gray-700'}`}>{s}</span>;
};
const complianceBadge = (s: string) => s === 'Compliant'
  ? <span className="flex items-center gap-1 text-teal-600 text-xs font-medium"><CheckCircle2 className="h-3 w-3" />Compliant</span>
  : <span className="flex items-center gap-1 text-amber-600 text-xs font-medium"><AlertTriangle className="h-3 w-3" />Partial</span>;

const jciComplianceFallback = [
  { chapter: 'IPSG', title: 'International Patient Safety Goals', owner: 'Patient Safety', score: 85, gap: 6, status: 'Watchlist' },
  { chapter: 'ACC',  title: 'Access to Care and Continuity', owner: 'Clinical Ops', score: 90, gap: 3, status: 'Compliant' },
  { chapter: 'COP',  title: 'Care of Patients', owner: 'Nursing', score: 88, gap: 5, status: 'Watchlist' },
  { chapter: 'ASC',  title: 'Anesthesia and Surgical Care', owner: 'OT Manager', score: 91, gap: 2, status: 'Compliant' },
  { chapter: 'MMU',  title: 'Medication Management and Use', owner: 'Pharmacy', score: 83, gap: 9, status: 'Action' },
  { chapter: 'PCI',  title: 'Prevention and Control of Infections', owner: 'Infection Control', score: 94, gap: 2, status: 'Compliant' },
];

type Framework = 'nabh' | 'jci' | 'both';

export default function QualityDashboard() {
  const navigate = useNavigate();
  const [framework, setFramework] = useState<Framework>(() => {
    return (localStorage.getItem('qualityFramework') as Framework) ?? 'both';
  });
  const { data, loading, error, refresh } = useQualityPortalData();
  const kpis = data?.kpis ?? [];
  const workQueues = data?.workQueues ?? [];
  const nabhChapters = data?.chapters ?? [];
  const jciChapters = data?.jciChapters ?? jciComplianceFallback;
  const incidents = data?.incidents ?? [];
  const audits = data?.audits ?? [];
  const leadership = data?.leadership ?? [];

  const setAndPersistFramework = (f: Framework) => {
    setFramework(f);
    localStorage.setItem('qualityFramework', f);
  };

  return (
    <HospDeptLayout deptKey="quality" deptName="Quality & Accreditation" badgeLabel="Quality"
      loginPath="/quality/login" DeptIcon={ShieldCheck} navSections={qualityNavSections}
      title="Quality Dashboard" subtitle="NABH & JCI compliance, audits & incident management">

      {(loading || error) && (
        <Card className="mb-4 border-dashed">
          <CardContent className="flex items-center justify-between gap-3 p-4 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <AlertTriangle className="h-4 w-4 text-amber-600" />}
              <span>{loading ? 'Loading live quality portal data...' : error}</span>
            </div>
            {!loading && (
              <Button variant="outline" size="sm" onClick={refresh}>Retry</Button>
            )}
          </CardContent>
        </Card>
      )}

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
              <div className={`p-2 rounded-xl ${kpiDecorators[k.label]?.color ?? 'bg-slate-100 dark:bg-slate-900'}`}>
                {React.createElement(kpiDecorators[k.label]?.icon ?? FileText, {
                  className: `h-5 w-5 ${kpiDecorators[k.label]?.iconColor ?? 'text-slate-600'}`,
                })}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Framework toggle */}
      <div className="mt-4 flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Accreditation view:</span>
        {(['nabh', 'jci', 'both'] as const).map((f) => (
          <Button key={f} size="sm" variant={framework === f ? 'default' : 'outline'}
            className={`text-xs px-3 ${framework === f ? 'bg-teal-600 hover:bg-teal-700' : ''}`}
            onClick={() => setAndPersistFramework(f)}>
            {f === 'both' ? 'Both' : f.toUpperCase()}
          </Button>
        ))}
      </div>

      {/* Chapter Compliance + Incidents */}
      <div className={`grid grid-cols-1 gap-4 mt-4 ${framework === 'both' ? 'lg:grid-cols-3' : 'lg:grid-cols-2'}`}>
        {/* NABH Chapters */}
        {(framework === 'nabh' || framework === 'both') && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Star className="h-4 w-4 text-amber-500" />NABH Chapter Compliance
            </CardTitle>
            <Button variant="ghost" size="sm" className="gap-1 text-xs" onClick={() => navigate('/quality/nabh-standards')}>View Matrix</Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {nabhChapters.map(c => (
              <div key={c.chapter} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium">{c.chapter} <span className="text-muted-foreground">{c.title}</span></span>
                  <div className="flex items-center gap-3">
                    {complianceBadge(c.status)}
                    <span className="font-semibold text-amber-700">{c.score}%</span>
                  </div>
                </div>
                <Progress value={c.score} className="h-1.5" />
              </div>
            ))}
          </CardContent>
        </Card>
        )}

        {/* JCI Chapters */}
        {(framework === 'jci' || framework === 'both') && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Globe className="h-4 w-4 text-blue-500" />JCI Chapter Compliance
            </CardTitle>
            <Button variant="ghost" size="sm" className="gap-1 text-xs" onClick={() => navigate('/quality/jci-standards')}>View Matrix</Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {jciChapters.map(c => (
              <div key={c.chapter} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium">{c.chapter} <span className="text-muted-foreground">{c.title}</span></span>
                  <div className="flex items-center gap-3">
                    {complianceBadge(c.status)}
                    <span className="font-semibold text-blue-700">{c.score}%</span>
                  </div>
                </div>
                <Progress value={c.score} className="h-1.5" />
              </div>
            ))}
          </CardContent>
        </Card>
        )}

        {/* Recent Incidents */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-500" />Incident Reports
            </CardTitle>
            <Button size="sm" className="gap-1 text-xs bg-teal-600 hover:bg-teal-700" onClick={() => navigate('/quality/incidents')}>
              <PlusCircle className="h-3 w-3" />Report Incident
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {incidents.map(i => (
                <div key={i.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/40 hover:bg-muted/70 transition-colors">
                  <div>
                    <p className="text-xs font-medium">{i.id} — {i.category}</p>
                    <p className="text-xs text-muted-foreground">{i.location} · {i.aging}</p>
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

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mt-4">
        {workQueues.map((queue) => (
          <Card key={queue.label}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{queue.label}</p>
              <p className={`mt-1 text-2xl font-bold ${queue.tone}`}>{queue.value}</p>
              <p className="mt-1 text-xs text-muted-foreground">{queue.detail}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick Actions + Upcoming Audits */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Quick Actions</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-2">
            {[
              { label: 'Report Incident', icon: AlertTriangle, path: '/quality/incidents' },
              { label: 'Schedule Audit', icon: ClipboardList, path: '/quality/assessments' },
              { label: 'NABH Matrix', icon: Star, path: '/quality/nabh-standards' },
              { label: 'JCI Matrix', icon: Globe, path: '/quality/jci-standards' },
              { label: 'Patient Feedback', icon: MessageSquare, path: '/quality/feedback' },
              { label: 'Gap Closure', icon: Target, path: '/quality/accreditation' },
              { label: 'Leadership Reports', icon: Download, path: '/quality/reports' },
              { label: 'Escalations', icon: BellRing, path: '/quality/support' },
            ].map(a => (
              <Button key={a.label} variant="outline" className="flex-col h-16 gap-1 text-xs" onClick={() => navigate(a.path)}>
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
                {audits.map((r, i) => (
                  <tr key={i} className="border-b last:border-0 hover:bg-muted/30">
                    {r.map((c, j) => <td key={j} className="py-2 pr-3">{j === 4 ? <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs">{c}</span> : c}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Leadership Snapshot</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-4 text-sm">
            {leadership.map(([label, value]) => (
              <div key={label} className="rounded-xl border p-4">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="mt-1 font-semibold">{value}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Escalation Queue</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            {[
              ['ICU adverse event RCA', 'Due in 12 hours'],
              ['Medication variance review', 'Awaiting CAPA owner'],
              ['OT consent deviation', 'Committee review tomorrow'],
              ['Fire drill closure memo', 'Pending sign-off'],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg bg-muted/40 p-3">
                <p className="font-medium">{label}</p>
                <p className="mt-1 text-xs text-muted-foreground">{value}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </HospDeptLayout>
  );
}
