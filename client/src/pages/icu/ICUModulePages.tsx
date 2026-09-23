import React, { useState } from 'react';
import HospDeptLayout, { DeptNavSection } from '@/components/hosp-dept/HospDeptLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/empty-state';
import { PlaceholderBanner } from '@/components/ui/placeholder-banner';
import {
  HeartPulse, LayoutDashboard, Activity, BedDouble, Pill, Thermometer,
  Droplets, Wind, Stethoscope, Users, ClipboardCheck, Bell, BarChart3,
  TrendingUp, Settings, HelpCircle, PlusCircle, Download, Search,
  AlertTriangle, CheckCircle2, Clock3, LayoutGrid,
  FileText, Syringe, RefreshCw, ShieldCheck, Loader2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useICUPortalData, type ICUPortalPatient } from './useICUPortalData';

// WP-0.3b: every page in this module used to render one of ~14 hardcoded seed arrays (patients, beds,
// medication orders, vitals, fluid balance, ventilators, devices, infection bundles, team roster,
// protocols, alerts, reports), several unconditionally even after useICUPortalData() returned real
// data (`data?.X?.length ? data.X : seedArray` only protects against an *empty* real response, not
// against the seed showing while real data is still loading). Rewired to the real per-patient detail
// the hook now fetches (census + ventilator/drip/goals/score/events via
// server/routes/icu.route.js). Screens with no real backend at all (devices, team roster, protocols,
// infection-bundle compliance, scheduled reports, analytics trends) now say so explicitly instead of
// inventing numbers — per the plan, this is the documented exception for WP-1.7-scoped work.

export const icuNavSections: DeptNavSection[] = [
  {
    title: 'Overview',
    items: [
      { icon: LayoutDashboard, label: 'Dashboard', href: '/icu/dashboard' },
      { icon: LayoutGrid, label: 'Live Monitor', href: '/icu/live-monitor' },
    ],
  },
  {
    title: 'Patient Flow',
    items: [
      { icon: Activity, label: 'Patient Register', href: '/icu/patients' },
      { icon: BedDouble, label: 'Bed Management', href: '/icu/beds' },
    ],
  },
  {
    title: 'Clinical',
    items: [
      { icon: Thermometer, label: 'Vitals', href: '/icu/vitals' },
      { icon: Droplets, label: 'Fluid Balance', href: '/icu/fluid-balance' },
      { icon: Pill, label: 'Medications', href: '/icu/medications' },
      { icon: Wind, label: 'Ventilators', href: '/icu/ventilators' },
      { icon: ShieldCheck, label: 'Infections', href: '/icu/infections' },
    ],
  },
  {
    title: 'Operations',
    items: [
      { icon: Stethoscope, label: 'Equipment', href: '/icu/equipment' },
      { icon: Users, label: 'Critical Team', href: '/icu/team' },
      { icon: ClipboardCheck, label: 'Protocols', href: '/icu/protocols' },
      { icon: Bell, label: 'Alerts', href: '/icu/alerts' },
    ],
  },
  {
    title: 'Reports',
    items: [
      { icon: BarChart3, label: 'Reports', href: '/icu/reports' },
      { icon: TrendingUp, label: 'Analytics', href: '/icu/analytics' },
    ],
  },
  {
    title: 'System',
    items: [
      { icon: Settings, label: 'Settings', href: '/icu/settings' },
      { icon: HelpCircle, label: 'Support', href: '/icu/support' },
    ],
  },
];

type WrapProps = {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
};

const Wrap = ({ title, subtitle, children, actions }: WrapProps) => (
  <HospDeptLayout
    deptKey="icu"
    deptName="ICU"
    badgeLabel="ICU"
    loginPath="/icu/login"
    DeptIcon={HeartPulse}
    navSections={icuNavSections}
    title={title}
    subtitle={subtitle}
    copilotModule="icu"
  >
    <div className="space-y-5">
      <div className="flex items-center justify-between"><div /><div className="flex gap-2">{actions}</div></div>
      {children}
    </div>
  </HospDeptLayout>
);

const KPI = ({ label, value, sub, icon: Icon, color }: {
  label: string; value: string; sub: string; icon: LucideIcon; color: string;
}) => (
  <Card className="hover:shadow-md transition-shadow">
    <CardContent className="p-5">
      <div className="flex items-start justify-between gap-4">
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

const statusClass: Record<string, string> = {
  Critical: 'bg-red-100 text-red-700',
  Stable: 'bg-emerald-100 text-emerald-700',
  Improving: 'bg-blue-100 text-blue-700',
  Occupied: 'bg-red-100 text-red-700',
  mild: 'bg-slate-100 text-slate-600',
  moderate: 'bg-amber-100 text-amber-700',
  severe: 'bg-orange-100 text-orange-700',
  critical: 'bg-red-100 text-red-700',
};

const Bdg = ({ status }: { status: string }) => (
  <Badge className={`${statusClass[status] || 'bg-slate-100 text-slate-600'} border-0 text-xs capitalize`}>{status}</Badge>
);

const TH = ({ children, cls = '' }: { children: React.ReactNode; cls?: string }) => (
  <th className={`pb-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground ${cls}`}>{children}</th>
);

const TD = ({ children, cls = '' }: { children: React.ReactNode; cls?: string }) => (
  <td className={`py-2.5 text-sm ${cls}`}>{children}</td>
);

const NotAvailable = ({ title, reason }: { title: string; reason: string }) => (
  <Card><CardContent className="pt-6"><PlaceholderBanner title={title} reason={reason} /></CardContent></Card>
);

const LoadingBlock = () => (
  <div className="flex items-center justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-red-600" /></div>
);

const ErrorBlock = ({ error }: { error: string }) => (
  <div className="flex items-center gap-2 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
    <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
  </div>
);

const supportCards = [
  { title: 'Clinical Escalation', text: 'Reach ICU command desk, RRT activation, and on-call intensivist matrix.' },
  { title: 'Bio-Med Support', text: 'Open breakdown tickets for monitors, ventilators, and infusion stack issues.' },
  { title: 'Training Library', text: 'Access SOP videos, quick guides, and mock code drill references.' },
];

// ── Live Monitor ────────────────────────────────────────────────────────────

export const ICULiveMonitorPage = () => {
  const { data, loading, error, refresh } = useICUPortalData(15000);

  return (
    <Wrap
      title="ICU Live Monitor"
      subtitle="Command view for critical beds, ventilators, and recent events"
      actions={
        <>
          <Button variant="outline" size="sm" className="gap-1" onClick={refresh}><RefreshCw className="h-4 w-4" />Sync</Button>
          <Button size="sm" className="gap-1 bg-red-600 hover:bg-red-700"><Bell className="h-4 w-4" />Escalate</Button>
        </>
      }
    >
      {loading ? <LoadingBlock /> : error ? <ErrorBlock error={error} /> : (
        <>
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
            {[
              { label: 'Occupied Beds', value: `${data!.summary.occupiedBeds}`, sub: 'Currently admitted', icon: LayoutGrid, color: 'text-red-600' },
              { label: 'On Ventilator', value: `${data!.summary.onVentilator}`, sub: 'Active vent charts', icon: Wind, color: 'text-blue-600' },
              { label: 'Active Drips', value: `${data!.summary.withActiveDrips}`, sub: 'Patients on infusions', icon: Syringe, color: 'text-amber-600' },
              { label: 'Events (24h)', value: `${data!.summary.eventsLast24h}`, sub: 'Across all patients', icon: AlertTriangle, color: 'text-emerald-600' },
            ].map((item) => <KPI key={item.label} {...item} />)}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-4 gap-5">
            <div className="xl:col-span-3 grid grid-cols-1 lg:grid-cols-2 gap-4">
              {data!.patients.length === 0 ? (
                <div className="lg:col-span-2"><EmptyState icon={HeartPulse} title="No patients currently admitted" description="Occupied ICU beds appear here." /></div>
              ) : (
                data!.patients.map((patient) => (
                  <Card key={patient.admissionId} className="border-l-4 border-l-red-500">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-red-700">{patient.bed}</span>
                            {patient.latestScore?.interpretation && <Bdg status={patient.latestScore.interpretation} />}
                          </div>
                          <CardTitle className="mt-1 text-base">{patient.patient}</CardTitle>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {patient.ventilator?.mode || 'Not on ventilator'}
                            {patient.activeDrips.length > 0 && ` · ${patient.activeDrips.map((d) => d.drugName).join(', ')}`}
                          </p>
                        </div>
                        {patient.latestScore && (
                          <Badge className="border-0 bg-slate-100 text-slate-700 text-xs">
                            {patient.latestScore.scoreType} {patient.latestScore.totalScore ?? '—'}
                          </Badge>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {patient.ventilator ? (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          {[
                            { label: 'SpO2', value: patient.ventilator.spo2Percent != null ? `${patient.ventilator.spo2Percent}%` : '—', tone: 'text-blue-600' },
                            { label: 'FiO2', value: patient.ventilator.fio2Percent != null ? `${patient.ventilator.fio2Percent}%` : '—', tone: 'text-amber-600' },
                            { label: 'PEEP', value: patient.ventilator.peepCmh2o != null ? `${patient.ventilator.peepCmh2o}` : '—', tone: 'text-slate-700' },
                            { label: 'Mode', value: patient.ventilator.mode || '—', tone: 'text-emerald-600' },
                          ].map((metric) => (
                            <div key={metric.label} className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/70">
                              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{metric.label}</p>
                              <p className={`mt-1 text-lg font-bold ${metric.tone}`}>{metric.value}</p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">No ventilator chart on record for this patient.</p>
                      )}
                      {patient.recentEvents.length > 0 && (
                        <div className="rounded-lg border-l-4 border-l-amber-400 bg-amber-50 dark:bg-amber-950/20 p-2.5 text-xs">
                          <p className="font-semibold">{patient.recentEvents[0].description}</p>
                          <p className="text-muted-foreground mt-0.5">{new Date(patient.recentEvents[0].eventAt).toLocaleString()}</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))
              )}
            </div>

            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-3"><CardTitle className="text-base">Recent Events</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {data!.patients.flatMap((p) => p.recentEvents.map((e) => ({ ...e, bed: p.bed })))
                    .sort((a, b) => new Date(b.eventAt).getTime() - new Date(a.eventAt).getTime())
                    .slice(0, 6)
                    .map((item, i) => (
                      <div key={i} className="rounded-lg border-l-4 border-l-red-500 bg-red-50 p-3 text-sm dark:bg-red-950/20">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold">{item.bed}</span>
                          <span className="text-xs text-muted-foreground">{new Date(item.eventAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                        <p className="mt-1 text-xs">{item.description}</p>
                      </div>
                    ))}
                  {data!.patients.every((p) => p.recentEvents.length === 0) && (
                    <p className="text-sm text-muted-foreground text-center py-4">No events recorded recently</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </>
      )}
    </Wrap>
  );
};

// ── Patient Register ────────────────────────────────────────────────────────

export const ICUPatientsPage = () => {
  const [query, setQuery] = useState('');
  const { data, loading, error } = useICUPortalData(30000);

  const rows: ICUPortalPatient[] = (data?.patients ?? []).filter((row) =>
    row.patient.toLowerCase().includes(query.toLowerCase()) ||
    row.diagnosis.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <Wrap
      title="Patient Register"
      subtitle="Central registry for ICU admissions, diagnoses, and acuity"
      actions={
        <>
          <Button variant="outline" size="sm" className="gap-1"><Download className="h-4 w-4" />Export</Button>
          <Button size="sm" className="gap-1 bg-red-600 hover:bg-red-700"><PlusCircle className="h-4 w-4" />Admit Patient</Button>
        </>
      }
    >
      {loading ? <LoadingBlock /> : error ? <ErrorBlock error={error} /> : (
        <>
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
            <KPI label="Active Patients" value={`${data!.summary.occupiedBeds}`} sub="Currently admitted" icon={Users} color="text-red-600" />
            <KPI label="On Ventilator" value={`${data!.summary.onVentilator}`} sub="Active vent charts" icon={Wind} color="text-blue-600" />
            <KPI label="Active Drips" value={`${data!.summary.withActiveDrips}`} sub="On infusions" icon={Syringe} color="text-emerald-600" />
            <KPI label="Events (24h)" value={`${data!.summary.eventsLast24h}`} sub="Across all patients" icon={AlertTriangle} color="text-amber-600" />
          </div>

          <Card>
            <CardHeader className="pb-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={query} onChange={(event) => setQuery(event.target.value)} className="pl-9" placeholder="Search by patient or diagnosis..." />
              </div>
            </CardHeader>
            <CardContent>
              {rows.length === 0 ? (
                <EmptyState icon={Users} title="No patients found" description={query ? 'No admissions match your search.' : 'No patients currently admitted.'} size="sm" />
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <TH>Bed</TH><TH>Patient</TH><TH cls="hidden md:table-cell">Diagnosis</TH>
                      <TH>Ventilation</TH><TH>Score</TH><TH>Hrs in ICU</TH>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {rows.map((row) => (
                      <tr key={row.admissionId} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <TD cls="font-bold text-red-700">{row.bed}</TD>
                        <TD><div className="font-medium">{row.patient}</div><div className="text-xs text-muted-foreground">{row.age != null ? `Age ${row.age}` : 'Age unknown'}</div></TD>
                        <TD cls="hidden md:table-cell text-muted-foreground">{row.diagnosis}</TD>
                        <TD>{row.ventilator?.mode || '—'}</TD>
                        <TD>{row.latestScore ? <Badge className="border-0 bg-slate-100 text-slate-700 text-xs">{row.latestScore.scoreType} {row.latestScore.totalScore ?? ''}</Badge> : '—'}</TD>
                        <TD>{row.hrs}h</TD>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </Wrap>
  );
};

// ── Bed Management ──────────────────────────────────────────────────────────

export const ICUBedsPage = () => {
  const { data, loading, error } = useICUPortalData(30000);

  return (
    <Wrap
      title="Bed Management"
      subtitle="Occupied-bed board — there is no bed-capacity/ward-config data source yet, so total and available counts aren't shown rather than guessed"
      actions={<Button size="sm" className="gap-1 bg-red-600 hover:bg-red-700"><PlusCircle className="h-4 w-4" />Allocate Bed</Button>}
    >
      {loading ? <LoadingBlock /> : error ? <ErrorBlock error={error} /> : (
        <>
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
            <KPI label="Occupied Beds" value={`${data!.summary.occupiedBeds}`} sub="Currently admitted" icon={BedDouble} color="text-red-600" />
            <KPI label="On Ventilator" value={`${data!.summary.onVentilator}`} sub="Active vent charts" icon={Wind} color="text-blue-600" />
            <KPI label="Active Drips" value={`${data!.summary.withActiveDrips}`} sub="On infusions" icon={Syringe} color="text-amber-600" />
            <KPI label="Events (24h)" value={`${data!.summary.eventsLast24h}`} sub="Across all patients" icon={AlertTriangle} color="text-emerald-600" />
          </div>

          {data!.patients.length === 0 ? (
            <EmptyState icon={BedDouble} title="No occupied beds" description="Admitted patients' beds appear here." />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              {data!.patients.map((p) => (
                <Card key={p.admissionId} className="border-l-4 border-l-red-500">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm font-bold text-red-700">{p.bed}</p>
                        <p className="text-xs text-muted-foreground">{p.zone}</p>
                      </div>
                      <Bdg status="Occupied" />
                    </div>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between"><span className="text-muted-foreground">Patient</span><span className="font-medium">{p.patient}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Time in ICU</span><span className="font-medium">{p.hrs}h</span></div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </Wrap>
  );
};

// ── Vitals ───────────────────────────────────────────────────────────────────

export const ICUVitalsPage = () => {
  const { data, loading, error } = useICUPortalData(30000);
  const withVent = (data?.patients ?? []).filter((p) => p.ventilator);

  return (
    <Wrap
      title="Vitals"
      subtitle="SpO2 from the latest ventilator chart per patient — no separate standalone ICU vitals stream exists yet"
      actions={<Button variant="outline" size="sm" className="gap-1"><Download className="h-4 w-4" />Trend Export</Button>}
    >
      {loading ? <LoadingBlock /> : error ? <ErrorBlock error={error} /> : (
        <>
          {withVent.length === 0 ? (
            <EmptyState icon={Thermometer} title="No ventilator-derived vitals available" description="No patients currently have a charted ventilator reading." />
          ) : (
            <Card>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-slate-50/80 dark:bg-slate-800/40">
                      <TH cls="pl-4">Patient</TH><TH>Bed</TH><TH>SpO2</TH><TH>FiO2</TH><TH>PEEP</TH><TH>Mode</TH><TH>Charted</TH>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {withVent.map((row) => (
                      <tr key={row.admissionId} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <TD cls="pl-4 font-medium">{row.patient}</TD>
                        <TD>{row.bed}</TD>
                        <TD cls="font-semibold text-blue-600">{row.ventilator!.spo2Percent != null ? `${row.ventilator!.spo2Percent}%` : '—'}</TD>
                        <TD>{row.ventilator!.fio2Percent != null ? `${row.ventilator!.fio2Percent}%` : '—'}</TD>
                        <TD>{row.ventilator!.peepCmh2o ?? '—'}</TD>
                        <TD>{row.ventilator!.mode || '—'}</TD>
                        <TD cls="text-muted-foreground">{new Date(row.ventilator!.chartedAt).toLocaleString()}</TD>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </Wrap>
  );
};

// ── Fluid Balance ────────────────────────────────────────────────────────────

export const ICUFluidBalancePage = () => {
  const { data, loading, error } = useICUPortalData(30000);
  const withGoals = (data?.patients ?? []).filter((p) => p.dailyGoals);

  return (
    <Wrap
      title="Fluid Balance"
      subtitle="Daily fluid-balance target from each patient's care goals — hourly IN/OUT charting isn't tracked by the backend yet"
      actions={<Button size="sm" className="gap-1 bg-red-600 hover:bg-red-700"><Droplets className="h-4 w-4" />Record Balance</Button>}
    >
      {loading ? <LoadingBlock /> : error ? <ErrorBlock error={error} /> : withGoals.length === 0 ? (
        <NotAvailable title="No fluid-balance goals on record." reason="Set a daily goal for a patient to see it here — detailed hourly IN/OUT charting itself isn't available yet." />
      ) : (
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-slate-50/80 dark:bg-slate-800/40">
                  <TH cls="pl-4">Patient</TH><TH>Bed</TH><TH>Fluid Balance Target</TH><TH>Goal Date</TH>
                </tr>
              </thead>
              <tbody className="divide-y">
                {withGoals.map((row) => (
                  <tr key={row.admissionId} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <TD cls="pl-4 font-medium">{row.patient}</TD>
                    <TD>{row.bed}</TD>
                    <TD>{row.dailyGoals!.fluidBalanceMl != null ? `${row.dailyGoals!.fluidBalanceMl} mL` : '—'}</TD>
                    <TD cls="text-muted-foreground">{row.dailyGoals!.goalDate}</TD>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </Wrap>
  );
};

// ── Medications (active drips) ──────────────────────────────────────────────

export const ICUMedicationsPage = () => {
  const { data, loading, error } = useICUPortalData(30000);
  const drips = (data?.patients ?? []).flatMap((p) => p.activeDrips.map((d) => ({ ...d, patient: p.patient, bed: p.bed })));

  return (
    <Wrap
      title="Medications"
      subtitle="Active infusion drips currently charted per patient"
      actions={
        <>
          <Button variant="outline" size="sm" className="gap-1"><Download className="h-4 w-4" />MAR Export</Button>
          <Button size="sm" className="gap-1 bg-red-600 hover:bg-red-700"><PlusCircle className="h-4 w-4" />New Order</Button>
        </>
      }
    >
      {loading ? <LoadingBlock /> : error ? <ErrorBlock error={error} /> : (
        <>
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
            <KPI label="Active Drips" value={`${drips.length}`} sub="Across all patients" icon={Syringe} color="text-red-600" />
            <KPI label="Patients on Infusions" value={`${data!.summary.withActiveDrips}`} sub="Of occupied beds" icon={Users} color="text-blue-600" />
          </div>
          {drips.length === 0 ? (
            <EmptyState icon={Pill} title="No active drips" description="Active infusion orders will appear here." />
          ) : (
            <Card>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-slate-50/80 dark:bg-slate-800/40">
                      <TH cls="pl-4">Patient</TH><TH>Bed</TH><TH>Drug</TH><TH>Rate</TH><TH>Dose</TH>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {drips.map((row, i) => (
                      <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <TD cls="pl-4 font-medium">{row.patient}</TD>
                        <TD>{row.bed}</TD>
                        <TD>{row.drugName}{row.concentration ? ` (${row.concentration})` : ''}</TD>
                        <TD>{row.rateMlHr != null ? `${row.rateMlHr} mL/hr` : '—'}</TD>
                        <TD>{row.doseValue != null ? `${row.doseValue} ${row.doseUnit || ''}` : '—'}</TD>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </Wrap>
  );
};

// ── Ventilators ──────────────────────────────────────────────────────────────

export const ICUVentilatorsPage = () => {
  const { data, loading, error } = useICUPortalData(30000);
  const onVent = (data?.patients ?? []).filter((p) => p.ventilator);

  return (
    <Wrap
      title="Ventilators"
      subtitle="Mode, oxygen load and SpO2 from each patient's latest ventilator chart"
      actions={<Button size="sm" className="gap-1 bg-red-600 hover:bg-red-700"><Wind className="h-4 w-4" />Chart Ventilator</Button>}
    >
      {loading ? <LoadingBlock /> : error ? <ErrorBlock error={error} /> : (
        <>
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
            <KPI label="On Ventilator" value={`${onVent.length}`} sub="Of occupied beds" icon={Wind} color="text-red-600" />
          </div>
          {onVent.length === 0 ? (
            <EmptyState icon={Wind} title="No patients on a charted ventilator" description="Ventilator charts appear here once recorded." />
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {onVent.map((row) => (
                <Card key={row.admissionId}>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm font-bold text-red-700">{row.bed}</p>
                        <p className="text-sm font-medium">{row.patient}</p>
                      </div>
                      <p className="text-xs text-muted-foreground">{new Date(row.ventilator!.chartedAt).toLocaleString()}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/70"><p className="text-xs text-muted-foreground">Mode</p><p className="mt-1 font-semibold">{row.ventilator!.mode || '—'}</p></div>
                      <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/70"><p className="text-xs text-muted-foreground">SpO2</p><p className="mt-1 font-semibold">{row.ventilator!.spo2Percent != null ? `${row.ventilator!.spo2Percent}%` : '—'}</p></div>
                      <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/70"><p className="text-xs text-muted-foreground">FiO2</p><p className="mt-1 font-semibold">{row.ventilator!.fio2Percent != null ? `${row.ventilator!.fio2Percent}%` : '—'}</p></div>
                      <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/70"><p className="text-xs text-muted-foreground">PEEP</p><p className="mt-1 font-semibold">{row.ventilator!.peepCmh2o ?? '—'} cmH2O</p></div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </Wrap>
  );
};

// ── Screens with no backend at all yet ──────────────────────────────────────

export const ICUEquipmentPage = () => (
  <Wrap title="Equipment" subtitle="Device readiness and maintenance tracking" actions={<Button variant="outline" size="sm" className="gap-1"><Download className="h-4 w-4" />Asset Register</Button>}>
    <NotAvailable title="Equipment tracking isn't connected yet." reason="Bedside device inventory and maintenance scheduling aren't wired to a backend — this is planned as part of the CMMS/cold-chain work package." />
  </Wrap>
);

export const ICUInfectionsPage = () => (
  <Wrap title="Infections" subtitle="Bundle compliance and infection prevention" actions={<Button size="sm" className="gap-1 bg-red-600 hover:bg-red-700"><ShieldCheck className="h-4 w-4" />Open Audit</Button>}>
    <NotAvailable title="Infection bundle tracking isn't connected yet." reason="No backend records bundle compliance (VAP, CLABSI, CAUTI, hand hygiene) yet." />
  </Wrap>
);

export const ICUTeamPage = () => (
  <Wrap title="Critical Team" subtitle="Shift roster and resource planning" actions={<Button size="sm" className="gap-1 bg-red-600 hover:bg-red-700"><Users className="h-4 w-4" />Assign Shift</Button>}>
    <NotAvailable title="Shift roster isn't connected yet." reason="Staff scheduling for the ICU isn't wired to a backend yet." />
  </Wrap>
);

export const ICUProtocolsPage = () => (
  <Wrap title="Protocols" subtitle="Care bundles and standing orders" actions={<Button size="sm" className="gap-1 bg-red-600 hover:bg-red-700"><FileText className="h-4 w-4" />New Protocol</Button>}>
    <NotAvailable title="Protocol governance isn't connected yet." reason="Care-bundle/protocol version tracking isn't wired to a backend yet." />
  </Wrap>
);

export const ICUReportsPage = () => (
  <Wrap title="Reports" subtitle="Operational reporting" actions={<Button size="sm" className="gap-1 bg-red-600 hover:bg-red-700"><Download className="h-4 w-4" />Generate Pack</Button>}>
    <NotAvailable title="Scheduled reporting isn't connected yet." reason="Census/mortality/utilization report generation isn't wired to a backend yet." />
  </Wrap>
);

export const ICUAnalyticsPage = () => (
  <Wrap title="Analytics" subtitle="Utilization and severity trends" actions={<Button variant="outline" size="sm" className="gap-1"><Download className="h-4 w-4" />Export Analytics</Button>}>
    <NotAvailable title="Trend analytics aren't connected yet." reason="Occupancy trends, protocol-compliance trends and pharmacy SLA metrics need historical data aggregation that doesn't exist yet." />
  </Wrap>
);

// ── Alerts (real events) ────────────────────────────────────────────────────

export const ICUAlertsPage = () => {
  const { data, loading, error } = useICUPortalData(30000);
  const events = (data?.patients ?? []).flatMap((p) => p.recentEvents.map((e) => ({ ...e, bed: p.bed })))
    .sort((a, b) => new Date(b.eventAt).getTime() - new Date(a.eventAt).getTime());

  return (
    <Wrap
      title="Alerts"
      subtitle="Recorded clinical events across all currently-admitted patients"
      actions={<Button variant="outline" size="sm" className="gap-1"><Bell className="h-4 w-4" />Alert Rules</Button>}
    >
      {loading ? <LoadingBlock /> : error ? <ErrorBlock error={error} /> : events.length === 0 ? (
        <EmptyState icon={CheckCircle2} title="No events recorded" description="Clinical events logged for admitted patients appear here." />
      ) : (
        <div className="space-y-3">
          {events.map((row, i) => (
            <Card key={i} className={`border-l-4 ${row.severity === 'critical' ? 'border-l-red-500' : row.severity === 'severe' ? 'border-l-orange-500' : row.severity === 'moderate' ? 'border-l-amber-500' : 'border-l-slate-400'}`}>
              <CardContent className="p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold">{row.bed}</p>
                      <Bdg status={row.severity} />
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{row.description}</p>
                    {row.actionTaken && <p className="mt-0.5 text-xs text-muted-foreground">Action: {row.actionTaken}</p>}
                  </div>
                  <div className="text-sm">
                    {row.reportedBy && <p className="font-medium">{row.reportedBy}</p>}
                    <p className="text-xs text-muted-foreground">{new Date(row.eventAt).toLocaleString()}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </Wrap>
  );
};

// ── Settings / Support (genuinely static content, not patient data) ────────

export const ICUSettingsPage = () => (
  <Wrap
    title="Settings"
    subtitle="Escalation policies, alert thresholds, dashboard widgets, and integration controls"
    actions={<Button size="sm" className="gap-1 bg-red-600 hover:bg-red-700"><Settings className="h-4 w-4" />Save Changes</Button>}
  >
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {[
        { title: 'Alert Thresholds', text: 'Heart rate, MAP, SpO2, ventilator disconnection, and infusion stop thresholds mapped to ICU policy.' },
        { title: 'Notification Routing', text: 'Escalate alerts to bedside nurse, charge nurse, intensivist, and rapid response tree based on severity.' },
        { title: 'Widget Preferences', text: 'Configure wallboard tiles, live monitor density, and role-based quick action cards.' },
        { title: 'Integration Health', text: 'Monitor HIS, bedside monitor gateway, LIS, ABG analyzer, and pharmacy interface connectivity.' },
      ].map((card) => (
        <Card key={card.title}>
          <CardContent className="p-5">
            <h3 className="text-sm font-semibold">{card.title}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{card.text}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  </Wrap>
);

export const ICUSupportPage = () => (
  <Wrap
    title="Support"
    subtitle="Operational help, clinical escalation contacts, and ICU training resources"
    actions={<Button variant="outline" size="sm" className="gap-1"><HelpCircle className="h-4 w-4" />Open Ticket</Button>}
  >
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {supportCards.map((card) => (
        <Card key={card.title}>
          <CardContent className="p-5">
            <h3 className="text-sm font-semibold">{card.title}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{card.text}</p>
          </CardContent>
        </Card>
      ))}
    </div>

    <Card>
      <CardHeader className="pb-3"><CardTitle className="text-base">Support Channels</CardTitle></CardHeader>
      <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
        <div className="rounded-xl bg-slate-50 p-4 dark:bg-slate-800/70">
          <p className="font-semibold">ICU Command Desk</p>
          <p className="mt-1 text-muted-foreground">Ext 2201 · 24x7 escalation desk</p>
        </div>
        <div className="rounded-xl bg-slate-50 p-4 dark:bg-slate-800/70">
          <p className="font-semibold">Bio-Med Hotline</p>
          <p className="mt-1 text-muted-foreground">Ext 4410 · Device breakdown triage</p>
        </div>
        <div className="rounded-xl bg-slate-50 p-4 dark:bg-slate-800/70">
          <p className="font-semibold">Training Coordinator</p>
          <p className="mt-1 text-muted-foreground">icu.training@mediczy.com</p>
        </div>
      </CardContent>
    </Card>
  </Wrap>
);
