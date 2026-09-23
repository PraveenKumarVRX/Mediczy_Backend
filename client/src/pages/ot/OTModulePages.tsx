import React, { useState } from 'react';
import HospDeptLayout, { DeptNavSection } from '@/components/hosp-dept/HospDeptLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/empty-state';
import { PlaceholderBanner } from '@/components/ui/placeholder-banner';
import {
  Scissors, CalendarDays, Users, Syringe, HeartPulse,
  BarChart3, Settings, HelpCircle, PlusCircle, Download,
  Search, CheckCircle2, AlertCircle, FileText, Package,
  ShieldCheck, TrendingUp, Activity, Clock, ClipboardCheck, Wrench,
  FlaskConical, LayoutDashboard,
  LayoutGrid, Loader2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useOTPortalData, type OTBooking } from './useOTPortalData';

// WP-0.3b: this module used to render 14 hardcoded seed arrays (schedule, pre-op checks, consent
// forms, teams, equipment, sterilization, implants, anesthesia records, safety checklists, post-op
// patients, OT records, reports, analytics) plus an OTTheatreViewPage that fabricated jittering "live"
// vital signs for named patients under "Active Surgery" with a "● live" badge and zero backend behind
// it — the single most severe invented-data finding of this whole pass; a clinician mistaking that for
// a real intra-operative monitor is a genuine safety risk. Rewired to server/routes/ot-scheduling.route.js
// (schedule, checklist, implants, operative notes) via useOTPortalData(); anything with no real backend
// (consent tracking, surgical teams, equipment/asset tracking, sterilization, detailed anesthesia
// charting, reports, analytics, and the theatre-view IoT board) now says so explicitly.

export const otNavSections: DeptNavSection[] = [
  {
    title: 'Overview',
    items: [
      { icon: LayoutDashboard, label: 'Dashboard', href: '/ot/dashboard' },
      { icon: LayoutGrid, label: 'Theatre View', href: '/ot/theatre-view' },
    ],
  },
  {
    title: 'Scheduling',
    items: [
      { icon: CalendarDays, label: 'OT Schedule', href: '/ot/schedule' },
      { icon: ClipboardCheck, label: 'Pre-Op Checklist', href: '/ot/pre-op' },
      { icon: FileText, label: 'Consent Forms', href: '/ot/consent' },
    ],
  },
  {
    title: 'Theatre Management',
    items: [
      { icon: Users, label: 'Surgical Teams', href: '/ot/teams' },
      { icon: Wrench, label: 'Equipment', href: '/ot/equipment' },
      { icon: FlaskConical, label: 'Sterilization', href: '/ot/sterilization' },
      { icon: Package, label: 'Implants & Supplies', href: '/ot/implants' },
    ],
  },
  {
    title: 'Clinical',
    items: [
      { icon: Syringe, label: 'Anesthesia', href: '/ot/anesthesia' },
      { icon: ShieldCheck, label: 'Surgical Safety', href: '/ot/safety' },
      { icon: HeartPulse, label: 'Post-Op Care', href: '/ot/post-op' },
      { icon: Activity, label: 'OT Records', href: '/ot/records' },
    ],
  },
  {
    title: 'Reports',
    items: [
      { icon: BarChart3, label: 'Reports', href: '/ot/reports' },
      { icon: TrendingUp, label: 'Analytics', href: '/ot/analytics' },
    ],
  },
  {
    title: 'System',
    items: [
      { icon: Settings, label: 'Settings', href: '/ot/settings' },
      { icon: HelpCircle, label: 'Support', href: '/ot/support' },
    ],
  },
];

const Wrap = ({ title, subtitle, children, actions }: {
  title: string; subtitle: string; children: React.ReactNode; actions?: React.ReactNode;
}) => (
  <HospDeptLayout deptKey="ot" deptName="Operation Theatre" badgeLabel="OT"
    loginPath="/ot/login" DeptIcon={Scissors} navSections={otNavSections}
    title={title} subtitle={subtitle} copilotModule="ot">
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
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-muted-foreground font-medium">{label}</p>
          <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
          <p className="text-xs text-muted-foreground mt-1">{sub}</p>
        </div>
        <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800">
          {React.createElement(Icon, { className: `h-5 w-5 ${color}` })}
        </div>
      </div>
    </CardContent>
  </Card>
);

const sc: Record<string, string> = {
  scheduled: 'bg-slate-100 text-slate-600',
  patient_in: 'bg-blue-100 text-blue-700',
  prep: 'bg-blue-100 text-blue-700',
  incision: 'bg-blue-100 text-blue-700',
  closure: 'bg-blue-100 text-blue-700',
  completed: 'bg-emerald-100 text-emerald-700',
  cancelled: 'bg-red-100 text-red-700',
  postponed: 'bg-amber-100 text-amber-700',
  emergency: 'bg-red-100 text-red-700',
  elective: 'bg-slate-100 text-slate-600',
  urgent: 'bg-amber-100 text-amber-700',
  draft: 'bg-amber-100 text-amber-700',
  signed: 'bg-emerald-100 text-emerald-700',
};

const Bdg = ({ s }: { s: string }) => (
  <Badge className={`${sc[s] || 'bg-slate-100 text-slate-600'} border-0 text-xs capitalize`}>{s.replace(/_/g, ' ')}</Badge>
);

const TH = ({ children, cls = '' }: { children: React.ReactNode; cls?: string }) => (
  <th className={`pb-2 text-left font-medium text-muted-foreground text-xs uppercase tracking-wide ${cls}`}>{children}</th>
);

const TD = ({ children, cls = '' }: { children: React.ReactNode; cls?: string }) => (
  <td className={`py-2.5 text-sm ${cls}`}>{children}</td>
);

const NotAvailable = ({ title, reason }: { title: string; reason: string }) => (
  <Card><CardContent className="pt-6"><PlaceholderBanner title={title} reason={reason} /></CardContent></Card>
);

const LoadingBlock = () => (
  <div className="flex items-center justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-teal-600" /></div>
);

const ErrorBlock = ({ error }: { error: string }) => (
  <div className="flex items-center gap-2 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
    <AlertCircle className="h-4 w-4 shrink-0" /> {error}
  </div>
);

const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
const patientLabel = (b: OTBooking) => b.operativeNote?.patientName || `Patient #${b.patientId}`;

// ── 1. OT Schedule ──────────────────────────────────────────────────────────

export const OTSchedulePage = () => {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('All');
  const { data, loading, error } = useOTPortalData(30000);
  const statuses = ['All', 'scheduled', 'patient_in', 'incision', 'completed', 'postponed'];

  const rows = (data?.bookings ?? []).filter((r) =>
    (filter === 'All' || r.otStatus === filter) &&
    (patientLabel(r).toLowerCase().includes(q.toLowerCase()) || r.procedureName.toLowerCase().includes(q.toLowerCase()))
  );

  return (
    <Wrap title="OT Schedule" subtitle="Today's surgical schedule"
      actions={<>
        <Button variant="outline" size="sm" className="gap-1"><Download className="h-4 w-4" />Export</Button>
        <Button size="sm" className="gap-1 bg-teal-600 hover:bg-teal-700"><PlusCircle className="h-4 w-4" />Book Slot</Button>
      </>}>
      {loading ? <LoadingBlock /> : error ? <ErrorBlock error={error} /> : (
        <>
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
            <KPI label="Total Scheduled" value={`${data!.bookings.length}`} sub="Today" icon={CalendarDays} color="text-teal-600" />
            <KPI label="In Progress" value={`${data!.bookings.filter((b) => ['patient_in', 'prep', 'incision', 'closure'].includes(b.otStatus)).length}`} sub="Active theatres" icon={Activity} color="text-blue-600" />
            <KPI label="Completed" value={`${data!.bookings.filter((b) => b.otStatus === 'completed').length}`} sub="Today" icon={CheckCircle2} color="text-emerald-600" />
            <KPI label="Postponed/Cancelled" value={`${data!.bookings.filter((b) => ['postponed', 'cancelled'].includes(b.otStatus)).length}`} sub="Today" icon={AlertCircle} color="text-amber-600" />
          </div>
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Search patient or procedure..." className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} />
                </div>
                <div className="flex gap-1 flex-wrap">
                  {statuses.map((s) => (
                    <button key={s} onClick={() => setFilter(s)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors capitalize ${filter === s ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                      {s.replace(/_/g, ' ')}
                    </button>
                  ))}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {rows.length === 0 ? (
                <EmptyState icon={CalendarDays} title="No cases found" description="No bookings match the current filter." size="sm" />
              ) : (
                <table className="w-full text-sm">
                  <thead><tr className="border-b">
                    <TH>Room</TH><TH>Patient</TH><TH cls="hidden md:table-cell">Procedure</TH>
                    <TH>Time</TH><TH cls="hidden lg:table-cell">Type</TH><TH>Status</TH>
                  </tr></thead>
                  <tbody className="divide-y">
                    {rows.map((r) => (
                      <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <TD cls="font-bold text-teal-700">{r.roomName || 'Unassigned'}</TD>
                        <TD><div className="font-medium">{patientLabel(r)}</div></TD>
                        <TD cls="hidden md:table-cell text-muted-foreground">{r.procedureName}</TD>
                        <TD cls="font-medium">{fmtTime(r.scheduledStart)}</TD>
                        <TD cls="hidden lg:table-cell"><Bdg s={r.bookingType} /></TD>
                        <TD><Bdg s={r.otStatus} /></TD>
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

// ── 2. Pre-Op Checklist (real: WHO sign-in phase) ───────────────────────────

export const OTPreOpPage = () => {
  const { data, loading, error } = useOTPortalData(30000);
  const upcoming = (data?.bookings ?? []).filter((b) => ['scheduled', 'patient_in', 'prep'].includes(b.otStatus));

  return (
    <Wrap title="Pre-Op Checklist" subtitle="WHO sign-in status for today's upcoming cases"
      actions={<Button variant="outline" size="sm" className="gap-1"><Download className="h-4 w-4" />Export</Button>}>
      {loading ? <LoadingBlock /> : error ? <ErrorBlock error={error} /> : upcoming.length === 0 ? (
        <EmptyState icon={ClipboardCheck} title="No upcoming cases" description="Pre-op checklist status appears here once cases are scheduled." />
      ) : (
        <Card>
          <CardContent className="overflow-x-auto pt-6">
            <table className="w-full text-sm min-w-[600px]">
              <thead><tr className="border-b">
                <TH>Patient</TH><TH>Procedure</TH><TH>Room</TH><TH cls="text-center">Sign-In Complete</TH><TH>Status</TH>
              </tr></thead>
              <tbody className="divide-y">
                {upcoming.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <TD><div className="font-medium">{patientLabel(r)}</div></TD>
                    <TD cls="text-muted-foreground">{r.procedureName}</TD>
                    <TD cls="text-xs font-medium text-teal-700">{r.roomName || 'Unassigned'}</TD>
                    <TD cls="text-center">
                      {r.checklist?.sign_in.completed
                        ? <CheckCircle2 className="h-4 w-4 text-emerald-500 mx-auto" />
                        : <AlertCircle className="h-4 w-4 text-amber-400 mx-auto" />}
                    </TD>
                    <TD><Bdg s={r.otStatus} /></TD>
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

// ── 3. Consent Forms — no backend ───────────────────────────────────────────

export const OTConsentPage = () => (
  <Wrap title="Consent Forms" subtitle="Surgical consent tracking" actions={<Button variant="outline" size="sm" className="gap-1"><Download className="h-4 w-4" />Export</Button>}>
    <NotAvailable title="Consent-form tracking isn't connected yet." reason="Signed-consent status per booking isn't wired to a backend yet." />
  </Wrap>
);

// ── 4. Surgical Teams — no backend ──────────────────────────────────────────

export const OTTeamsPage = () => (
  <Wrap title="Surgical Teams" subtitle="Shift roster and team assignment" actions={<Button size="sm" className="gap-1 bg-teal-600 hover:bg-teal-700"><Users className="h-4 w-4" />Assign Team</Button>}>
    <NotAvailable title="Team roster isn't connected yet." reason="Surgical team/shift scheduling isn't wired to a backend yet." />
  </Wrap>
);

// ── 5. Equipment — no backend ───────────────────────────────────────────────

export const OTEquipmentPage = () => (
  <Wrap title="Equipment" subtitle="Theatre equipment readiness" actions={<Button variant="outline" size="sm" className="gap-1"><Download className="h-4 w-4" />Asset Register</Button>}>
    <NotAvailable title="Equipment tracking isn't connected yet." reason="Theatre device inventory and readiness status isn't wired to a backend yet — planned as part of the CMMS/cold-chain work package." />
  </Wrap>
);

// ── 6. Sterilization — no backend ───────────────────────────────────────────

export const OTSterilizationPage = () => (
  <Wrap title="Sterilization" subtitle="CSSD cycle tracking" actions={<Button variant="outline" size="sm" className="gap-1"><Download className="h-4 w-4" />Export</Button>}>
    <NotAvailable title="Sterilization cycle tracking isn't connected yet." reason="CSSD cycle status for theatre instrument sets isn't wired to a backend yet." />
  </Wrap>
);

// ── 7. Implants & Supplies (real) ───────────────────────────────────────────

export const OTImplantsPage = () => {
  const { data, loading, error } = useOTPortalData(30000);
  const implantRows = (data?.bookings ?? []).flatMap((b) => b.implants.map((im) => ({ ...im, booking: b })));

  return (
    <Wrap title="Implants & Supplies" subtitle="Implant records logged for today's cases" actions={<Button size="sm" className="gap-1 bg-teal-600 hover:bg-teal-700"><PlusCircle className="h-4 w-4" />Log Implant</Button>}>
      {loading ? <LoadingBlock /> : error ? <ErrorBlock error={error} /> : implantRows.length === 0 ? (
        <EmptyState icon={Package} title="No implants logged today" description="Implant records appear here once logged against a booking." />
      ) : (
        <Card>
          <CardContent className="p-0 pt-2">
            <table className="w-full text-sm">
              <thead><tr className="border-b bg-slate-50/80 dark:bg-slate-800/40">
                <TH cls="pl-4">Patient</TH><TH>Implant</TH><TH>Manufacturer</TH><TH>Lot #</TH><TH>Location</TH>
              </tr></thead>
              <tbody className="divide-y">
                {implantRows.map((row, i) => (
                  <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <TD cls="pl-4 font-medium">{patientLabel(row.booking)}</TD>
                    <TD>{row.implantName}</TD>
                    <TD cls="text-muted-foreground">{row.manufacturer || '—'}</TD>
                    <TD cls="text-muted-foreground">{row.lotNumber || '—'}</TD>
                    <TD cls="text-muted-foreground">{row.bodyLocation || '—'}</TD>
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

// ── 8. Anesthesia — minimal real field only ─────────────────────────────────

export const OTAnesthesiaPage = () => {
  const { data, loading, error } = useOTPortalData(30000);
  const withAnesthesia = (data?.bookings ?? []).filter((b) => b.anesthesiaType);

  return (
    <Wrap title="Anesthesia" subtitle="Anesthesia type per booking — detailed intra-operative anesthesia charting isn't tracked yet" actions={<Button variant="outline" size="sm" className="gap-1"><Download className="h-4 w-4" />Export</Button>}>
      {loading ? <LoadingBlock /> : error ? <ErrorBlock error={error} /> : withAnesthesia.length === 0 ? (
        <NotAvailable title="No anesthesia type recorded for today's cases." reason="Detailed anesthesia charting (agents, dosing, monitoring) isn't wired to a backend yet — only the booking's anesthesia type field is real." />
      ) : (
        <Card>
          <CardContent className="p-0 pt-2">
            <table className="w-full text-sm">
              <thead><tr className="border-b bg-slate-50/80 dark:bg-slate-800/40">
                <TH cls="pl-4">Patient</TH><TH>Procedure</TH><TH>Anesthesia Type</TH><TH>Room</TH>
              </tr></thead>
              <tbody className="divide-y">
                {withAnesthesia.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <TD cls="pl-4 font-medium">{patientLabel(r)}</TD>
                    <TD cls="text-muted-foreground">{r.procedureName}</TD>
                    <TD>{r.anesthesiaType}</TD>
                    <TD cls="text-muted-foreground">{r.roomName || '—'}</TD>
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

// ── 9. Surgical Safety (real: WHO 3-phase checklist) ────────────────────────

const PhaseChip = ({ label, phase }: { label: string; phase?: { completed: boolean } }) => (
  <div className={`px-2 py-1 rounded text-xs font-medium ${phase?.completed ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
    {label}: {phase?.completed ? 'Done' : 'Pending'}
  </div>
);

export const OTSafetyPage = () => {
  const { data, loading, error } = useOTPortalData(30000);

  return (
    <Wrap title="Surgical Safety" subtitle="WHO Surgical Safety Checklist status (sign-in / time-out / sign-out)" actions={<Button size="sm" className="gap-1 bg-teal-600 hover:bg-teal-700"><ShieldCheck className="h-4 w-4" />Open Checklist</Button>}>
      {loading ? <LoadingBlock /> : error ? <ErrorBlock error={error} /> : (data?.bookings.length ?? 0) === 0 ? (
        <EmptyState icon={ShieldCheck} title="No cases today" description="Checklist status appears here once cases are scheduled." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {data!.bookings.map((r) => (
            <Card key={r.id}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-semibold">{patientLabel(r)}</p>
                    <p className="text-xs text-muted-foreground">{r.procedureName}</p>
                  </div>
                  <Bdg s={r.otStatus} />
                </div>
                <div className="flex gap-2 flex-wrap">
                  <PhaseChip label="Sign-In" phase={r.checklist?.sign_in} />
                  <PhaseChip label="Time-Out" phase={r.checklist?.time_out} />
                  <PhaseChip label="Sign-Out" phase={r.checklist?.sign_out} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </Wrap>
  );
};

// ── 10. Post-Op Care (real: completed bookings) ─────────────────────────────

export const OTPostOpPage = () => {
  const { data, loading, error } = useOTPortalData(30000);
  const postOp = (data?.bookings ?? []).filter((b) => b.otStatus === 'completed');

  return (
    <Wrap title="Post-Op Care" subtitle="Completed cases today" actions={<Button variant="outline" size="sm" className="gap-1"><Download className="h-4 w-4" />Export</Button>}>
      {loading ? <LoadingBlock /> : error ? <ErrorBlock error={error} /> : postOp.length === 0 ? (
        <EmptyState icon={HeartPulse} title="No completed cases yet" description="Post-op patients appear here once their procedure is marked complete." />
      ) : (
        <Card>
          <CardContent className="p-0 pt-2">
            <table className="w-full text-sm">
              <thead><tr className="border-b bg-slate-50/80 dark:bg-slate-800/40">
                <TH cls="pl-4">Patient</TH><TH>Procedure</TH><TH>Room</TH><TH>Ended</TH><TH>Note</TH>
              </tr></thead>
              <tbody className="divide-y">
                {postOp.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <TD cls="pl-4 font-medium">{patientLabel(r)}</TD>
                    <TD cls="text-muted-foreground">{r.procedureName}</TD>
                    <TD cls="text-muted-foreground">{r.roomName || '—'}</TD>
                    <TD cls="text-muted-foreground">{r.actualEnd ? new Date(r.actualEnd).toLocaleString() : '—'}</TD>
                    <TD>{r.operativeNote ? <Bdg s={r.operativeNote.status} /> : <span className="text-xs text-muted-foreground">Not drafted</span>}</TD>
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

// ── 11. OT Records (real: operative notes) ──────────────────────────────────

export const OTRecordsPage = () => {
  const { data, loading, error } = useOTPortalData(30000);
  const withNotes = (data?.bookings ?? []).filter((b) => b.operativeNote);

  return (
    <Wrap title="OT Records" subtitle="Operative notes for today's cases" actions={<Button variant="outline" size="sm" className="gap-1"><Download className="h-4 w-4" />Export</Button>}>
      {loading ? <LoadingBlock /> : error ? <ErrorBlock error={error} /> : withNotes.length === 0 ? (
        <EmptyState icon={Activity} title="No operative notes drafted yet" description="Operative notes appear here once drafted for a case." />
      ) : (
        <div className="space-y-3">
          {withNotes.map((r) => (
            <Card key={r.id}>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-semibold">{r.operativeNote!.patientName || patientLabel(r)}</p>
                    <p className="text-xs text-muted-foreground">{r.operativeNote!.procedureName}</p>
                  </div>
                  <Bdg s={r.operativeNote!.status} />
                </div>
                {r.operativeNote!.findings && <p className="text-sm text-muted-foreground">Findings: {r.operativeNote!.findings}</p>}
                {r.operativeNote!.complications && <p className="text-sm text-red-600">Complications: {r.operativeNote!.complications}</p>}
                {r.operativeNote!.bloodLossMl != null && <p className="text-xs text-muted-foreground">Blood loss: {r.operativeNote!.bloodLossMl} mL</p>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </Wrap>
  );
};

// ── 12. Reports — no backend ─────────────────────────────────────────────────

export const OTReportsPage = () => (
  <Wrap title="Reports" subtitle="Operational reporting" actions={<Button size="sm" className="gap-1 bg-teal-600 hover:bg-teal-700"><Download className="h-4 w-4" />Generate Pack</Button>}>
    <NotAvailable title="Scheduled reporting isn't connected yet." reason="Utilization/turnover/case-mix report generation isn't wired to a backend yet." />
  </Wrap>
);

// ── 13. Analytics — no backend ───────────────────────────────────────────────

export const OTAnalyticsPage = () => (
  <Wrap title="Analytics" subtitle="Utilization and performance trends" actions={<Button variant="outline" size="sm" className="gap-1"><Download className="h-4 w-4" />Export Analytics</Button>}>
    <NotAvailable title="Trend analytics aren't connected yet." reason="Theatre-utilization and turnover-time trends need historical aggregation that doesn't exist yet." />
  </Wrap>
);

// ── Settings / Support — genuinely static content ───────────────────────────

export const OTSettingsPage = () => (
  <Wrap title="Settings" subtitle="Scheduling rules, checklist templates, and notification routing" actions={<Button size="sm" className="gap-1 bg-teal-600 hover:bg-teal-700"><Settings className="h-4 w-4" />Save Changes</Button>}>
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {[
        { title: 'Booking Rules', text: 'Default slot duration, buffer time between cases, and emergency override policy.' },
        { title: 'Checklist Templates', text: 'WHO Surgical Safety Checklist phases and mandatory fields per specialty.' },
        { title: 'Notification Routing', text: 'Family notification triggers and recipient channels per case milestone.' },
        { title: 'Integration Health', text: 'Monitor HIS, blood bank, pharmacy, and consumables-scan interface connectivity.' },
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

export const OTSupportPage = () => (
  <Wrap title="Support" subtitle="Operational help and escalation contacts" actions={<Button variant="outline" size="sm" className="gap-1"><HelpCircle className="h-4 w-4" />Open Ticket</Button>}>
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {[
        { title: 'Clinical Escalation', text: 'Reach the OT command desk and on-call surgical/anesthesia lead.' },
        { title: 'Bio-Med Support', text: 'Open breakdown tickets for theatre equipment issues.' },
        { title: 'Training Library', text: 'Access SOP videos and surgical safety drill references.' },
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

// ── Theatre View — was entirely fabricated "live" vitals with no backend ────

export const OTTheatreViewPage = () => {
  const { data, loading, error, refresh } = useOTPortalData(15000);
  const active = (data?.bookings ?? []).filter((b) => ['patient_in', 'prep', 'incision', 'closure'].includes(b.otStatus));

  return (
    <HospDeptLayout deptKey="ot" deptName="Operation Theatre" badgeLabel="OT"
      loginPath="/ot/login" DeptIcon={Scissors} navSections={otNavSections}
      title="Theatre View" subtitle="Active cases — there is no real-time IoT vitals/HVAC/gas-supply feed connected yet">
      <div className="space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={refresh}>Refresh</Button>
        </div>

        <NotAvailable
          title="Live intra-operative monitoring isn't connected."
          reason="This screen previously showed simulated, randomly-jittering vital signs, HVAC readings and gas-supply levels for named patients under a '● live' badge, with no real device integration behind any of it. That has been removed rather than fixed cosmetically — showing fabricated vitals during active surgery is a genuine patient-safety risk, not just a UI issue. Below are the real, currently-active bookings; no IoT/vitals feed exists yet to attach to them."
        />

        {loading ? <LoadingBlock /> : error ? <ErrorBlock error={error} /> : active.length === 0 ? (
          <EmptyState icon={Activity} title="No active cases" description="Bookings currently in progress appear here." />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {active.map((r) => (
              <Card key={r.id} className="border-l-4 border-l-blue-500">
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-teal-700">{r.roomName || 'Unassigned'}</span>
                    <Bdg s={r.otStatus} />
                  </div>
                  <p className="text-sm font-semibold">{patientLabel(r)}</p>
                  <p className="text-xs text-muted-foreground">{r.procedureName}</p>
                  {r.actualStart && <p className="text-xs text-muted-foreground">Started {new Date(r.actualStart).toLocaleTimeString()}</p>}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </HospDeptLayout>
  );
};
