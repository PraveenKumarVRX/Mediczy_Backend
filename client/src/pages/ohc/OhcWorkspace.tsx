/**
 * /ohc — the OHC workspace for an OHC doctor or OHC staff member: the employees of the one company the OHC serves, and the fitness
 * certificates it issues. The unit and the company come from the server (the signed-in worker's assignment), never from this page.
 */
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, LogOut, ShieldCheck, Stethoscope } from "lucide-react";
import { Sidebar } from "@/components/layout/Sidebar";
import { useSidebarCollapsed } from "@/hooks/useSidebarCollapsed";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { InlineError } from "@/components/ui/inline-error";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { CertificatesTable, EmergenciesPanel, EmergencyReportDialog, IssueCertificateDialog, PrescriptionDialog, PrescriptionsTable, ReferralDialog, StaffList } from "../care-units/ohcPanels";
import type { ClinicalPrescription, EmergencyMetrics, Employee, OccupationalSummary, OhcAppointment, OhcEncounter, OhcMe, OhcResponder, OhcStaffMember, OhcStaffMessage, WorkplaceEmergency, WorkspaceCertificate } from "../care-units/types";
import { OhcError, addEmergencyNote, assignEmergencyResponder, changePassword, createAppointment, createOhcStaffMessage, createPrescription, createReferral, fetchCertificatePdfBlob, finalizeEmergencyReport, getAppointments, getCertificates, getEmergencyDetail, getEmergencyMetrics, getEmployees, getEmergencies, getMe, getMyPrescriptions, getOccupationalEncounters, getOccupationalSummary, getOhcStaffMessages, getResponders, getStaff, hasSession, issueCertificate, logout, remindAppointment, reportEmergency, respondToEmergencyAssignment, saveEmergencyReportDraft, setMyResponderAvailability, updateAppointment, updateEmergency } from "./ohcClient";

function ChangePassword({ onDone }: { onDone: () => void }) {
  const { toast } = useToast();
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true);
    try { await changePassword(cur, next); toast({ title: "Password changed", description: "Sign in again with your new password." }); onDone(); }
    catch (err) { toast({ variant: "destructive", title: "Could not change the password", description: (err as OhcError).message }); }
    finally { setBusy(false); }
  };
  return (
    <main className="grid min-h-screen place-items-center bg-background px-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-xl border bg-card p-6" aria-labelledby="cp-h">
        <h1 id="cp-h" className="text-lg font-semibold">Choose a new password</h1>
        <p className="text-sm text-muted-foreground">You signed in with a temporary password. Choose your own before you continue: at least 10 characters with a letter and a digit.</p>
        <div className="space-y-1.5"><Label htmlFor="cp-cur">Temporary password</Label><Input id="cp-cur" type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} /></div>
        <div className="space-y-1.5"><Label htmlFor="cp-new">New password</Label><Input id="cp-new" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} /></div>
        <Button type="submit" className="w-full" disabled={busy || !cur || next.length < 10}>{busy ? "Saving…" : "Change password"}</Button>
      </form>
    </main>
  );
}

export default function OhcWorkspace() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [sidebarCollapsed] = useSidebarCollapsed();
  const [me, setMe] = useState<OhcMe | null>(null);
  const [error, setError] = useState<OhcError | null>(null);
  const [tab, setTab] = useState<"employees" | "occupational" | "certificates" | "prescriptions" | "staff" | "emergencies">("employees");
  const [search, setSearch] = useState("");
  const [employees, setEmployees] = useState<Employee[] | null>(null);
  const [certs, setCerts] = useState<WorkspaceCertificate[] | null>(null);
  const [prescriptions, setPrescriptions] = useState<ClinicalPrescription[] | null>(null);
  const [staff, setStaff] = useState<OhcStaffMember[] | null>(null);
  const [responders, setResponders] = useState<OhcResponder[] | null>(null);
  const [emergencies, setEmergencies] = useState<WorkplaceEmergency[] | null>(null);
  const [emergencyMetrics, setEmergencyMetrics] = useState<EmergencyMetrics | null>(null);
  const [appointments, setAppointments] = useState<OhcAppointment[] | null>(null);
  const [encounters, setEncounters] = useState<OhcEncounter[] | null>(null);
  const [staffMessages, setStaffMessages] = useState<OhcStaffMessage[] | null>(null);
  const [occupationalSummary, setOccupationalSummary] = useState<OccupationalSummary | null>(null);
  const [appointmentEmployeeId, setAppointmentEmployeeId] = useState("");
  const [appointmentAt, setAppointmentAt] = useState("");
  const [appointmentType, setAppointmentType] = useState("occupational_visit");
  const [messageTitle, setMessageTitle] = useState("");
  const [messageBody, setMessageBody] = useState("");
  const [listError, setListError] = useState(false);
  const [issueFor, setIssueFor] = useState<Employee | null>(null);
  const [prescribeFor, setPrescribeFor] = useState<Employee | null>(null);
  const [referFor, setReferFor] = useState<Employee | null>(null);
  const [emergencyOpen, setEmergencyOpen] = useState(false);
  const [activeUnitUid, setActiveUnitUid] = useState("");
  const [historyFor, setHistoryFor] = useState<Employee | null>(null);
  const [historyData, setHistoryData] = useState<{ appointments: OhcAppointment[]; encounters: OhcEncounter[]; certificates: WorkspaceCertificate[] } | null>(null);
  const [historyError, setHistoryError] = useState(false);

  const unit = me?.units.find((u) => u.uid === activeUnitUid) || me?.units[0];
  const load = useCallback(async () => {
    try { setMe(await getMe()); setError(null); } catch (e) { setError(e as OhcError); }
  }, []);
  useEffect(() => { if (me?.units.length && !me.units.some((u) => u.uid === activeUnitUid)) setActiveUnitUid(me.units[0].uid); }, [me, activeUnitUid]);
  useEffect(() => { if (!hasSession()) { navigate("/ohc/login", { replace: true }); return; } load(); }, [load, navigate]);
  useEffect(() => { if (error && (error.status === 401 || error.code === "account_unavailable")) navigate("/ohc/login", { replace: true }); }, [error, navigate]);

  const loadEmployees = useCallback(async () => {
    if (!unit) return;
    try { setEmployees((await getEmployees(unit.uid, search)).employees); setListError(false); } catch { setListError(true); }
  }, [unit, search]);
  const loadCerts = useCallback(async () => {
    if (!unit) return;
    try { setCerts((await getCertificates(unit.uid)).certificates as unknown as WorkspaceCertificate[]); setListError(false); } catch { setListError(true); }
  }, [unit]);
  const loadPrescriptions = useCallback(async () => { try { setPrescriptions((await getMyPrescriptions()).prescriptions); setListError(false); } catch { setListError(true); } }, []);
  const loadStaff = useCallback(async () => { if (!unit) return; try { setStaff((await getStaff(unit.uid)).staff); setListError(false); } catch { setListError(true); } }, [unit]);
  const loadHistory = useCallback(async (employee: Employee) => {
    if (!unit) return;
    setHistoryData(null); setHistoryError(false);
    try {
      const [a, e, c] = await Promise.all([
        getAppointments(unit.uid, employee.id), getOccupationalEncounters(unit.uid, employee.id), getCertificates(unit.uid, employee.id),
      ]);
      setHistoryData({ appointments: a.appointments, encounters: e.encounters, certificates: c.certificates as unknown as WorkspaceCertificate[] });
    } catch { setHistoryError(true); }
  }, [unit]);
  useEffect(() => { if (historyFor) void loadHistory(historyFor); }, [historyFor, loadHistory]);
  const loadEmergencies = useCallback(async () => { if (!unit) return; try { setEmergencies((await getEmergencies(unit.uid)).emergencies); setListError(false); } catch { setListError(true); } }, [unit]);
  const loadEmergencyMetrics = useCallback(async () => { if (!unit) return; try { setEmergencyMetrics((await getEmergencyMetrics(unit.uid)).metrics); } catch { setEmergencyMetrics(null); } }, [unit]);
  const loadResponders = useCallback(async () => { if (!unit) return; try { setResponders((await getResponders(unit.uid)).responders); } catch { setResponders([]); } }, [unit]);
  const loadOccupational = useCallback(async () => { if (!unit) return; try { const [a, e, m, s] = await Promise.all([getAppointments(unit.uid), getOccupationalEncounters(unit.uid), getOhcStaffMessages(unit.uid), getOccupationalSummary(unit.uid)]); setAppointments(a.appointments); setEncounters(e.encounters); setStaffMessages(m.messages); setOccupationalSummary(s.summary); setListError(false); } catch { setListError(true); } }, [unit]);
  useEffect(() => {
    if (tab === "employees") { const t = setTimeout(loadEmployees, 250); return () => clearTimeout(t); }
    if (tab === "certificates") { loadCerts(); return undefined; }
    if (tab === "prescriptions") { loadPrescriptions(); return undefined; }
    if (tab === "staff") { loadStaff(); return undefined; }
    if (tab === "occupational") { loadOccupational(); return undefined; }
    loadEmergencies(); loadResponders(); loadEmergencyMetrics(); return undefined;
  }, [tab, loadEmployees, loadCerts, loadPrescriptions, loadStaff, loadOccupational, loadEmergencies, loadResponders, loadEmergencyMetrics]);
  useEffect(() => {
    if (tab !== "emergencies") return undefined;
    const timer = window.setInterval(() => { loadEmergencies(); loadResponders(); loadEmergencyMetrics(); }, 15000);
    return () => window.clearInterval(timer);
  }, [tab, loadEmergencies, loadResponders, loadEmergencyMetrics]);

  const signOut = async () => { await logout(); navigate("/ohc/login", { replace: true }); };

  if (error?.code === "password_change_required" || me?.worker.mustChangePassword) return <ChangePassword onDone={() => navigate("/ohc/login", { replace: true })} />;
  if (error && error.status !== 401 && error.code !== "account_unavailable") return <main className="p-6"><InlineError message="Could not load your workspace." onRetry={load} /></main>;
  if (!me || !unit) return <main className="p-6" aria-busy="true"><Skeleton className="h-16" /></main>;
  const canSign = me.worker.canSign;

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <div className={`transition-[margin] duration-300 ${sidebarCollapsed ? 'md:ml-0' : 'md:ml-64'}`}>
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-lg bg-primary text-primary-foreground"><Stethoscope className="size-4" aria-hidden /></span>
            <div><p className="font-semibold leading-tight">{unit.name}</p><p className="text-xs text-muted-foreground">for {unit.corporateName ?? "your company"} · operated by {unit.operatorName ?? "your hospital/clinic"}</p>{me.units.length > 1 && <Select value={unit.uid} onValueChange={setActiveUnitUid}><SelectTrigger className="mt-1 h-8 w-64 text-xs"><SelectValue /></SelectTrigger><SelectContent>{me.units.map((u) => <SelectItem key={u.uid} value={u.uid}>{u.name} · {u.operatorName ?? "operator"}</SelectItem>)}</SelectContent></Select>}</div>
          </div>
          <div className="flex items-center gap-3 text-sm"><span className="text-right"><span className="block font-medium">{me.worker.displayName}</span><span className="block text-xs text-muted-foreground">{me.worker.role === "corporate_cmo" ? "Chief Medical Officer · corporate OHC admin" : me.worker.role === "ohc_doctor" ? "OHC doctor" : "OHC staff"}</span></span>
            <Button variant="outline" size="sm" onClick={signOut}><LogOut className="mr-2 size-4" aria-hidden />Sign out</Button></div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl space-y-4 px-4 py-5">
        {!canSign && (
          <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
            {me.worker.role === "ohc_doctor" || me.worker.role === "corporate_cmo" ? "Your medical registration number is not on file, so you cannot sign certificates yet. Ask your administrator to add it." : "Only an OHC doctor can sign a fitness certificate; a corporate CMO can also sign once registered. You can look up employees here."}
          </p>
        )}
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList><TabsTrigger value="employees" onClick={() => setTab("employees")}>Employees</TabsTrigger><TabsTrigger value="occupational" onClick={() => setTab("occupational")}>Occupational care</TabsTrigger><TabsTrigger value="certificates" onClick={() => setTab("certificates")}>Certificates issued</TabsTrigger><TabsTrigger value="prescriptions" onClick={() => setTab("prescriptions")}>Prescriptions</TabsTrigger><TabsTrigger value="staff" onClick={() => setTab("staff")}>Clinic staff</TabsTrigger><TabsTrigger value="emergencies" onClick={() => setTab("emergencies")}>Emergencies</TabsTrigger></TabsList>
        </Tabs>

        {tab === "employees" && (
          <section className="space-y-3" aria-label="Employees">
            <div className="max-w-sm space-y-1.5"><Label htmlFor="emp-search">Find an employee</Label><Input id="emp-search" value={search} placeholder="Name or employee id" onChange={(e) => setSearch(e.target.value)} /></div>
            {listError && <InlineError message="Could not load employees." onRetry={loadEmployees} />}
            {employees === null && !listError && <Skeleton className="h-24" />}
            {employees?.length === 0 && <EmptyState icon={ShieldCheck} title="No employees found" description={search ? "Try a different name or employee id." : "The company has no active employees on record yet."} />}
            {employees && employees.length > 0 && (
              <ul className="divide-y rounded-lg border bg-card">
                {employees.map((e) => (
                  <li key={e.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                    <span><span className="font-medium">{e.name}</span><span className="block text-xs text-muted-foreground">{[e.employeeId, e.department, e.designation].filter(Boolean).join(" · ")}</span></span>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => setHistoryFor(e)}>View history</Button>
                      <Button size="sm" variant="outline" disabled={!canSign} onClick={() => setIssueFor(e)}>Issue certificate</Button>
                      <Button size="sm" variant="outline" disabled={!canSign} onClick={() => setPrescribeFor(e)}>Prescribe</Button>
                      <Button size="sm" variant="outline" disabled={!canSign} onClick={() => setReferFor(e)}>Refer</Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {tab === "occupational" && (
          <section aria-label="Occupational care" className="space-y-4">
            <div><h2 className="text-base font-semibold">Occupational care</h2><p className="text-sm text-muted-foreground">Schedule workplace visits, retain occupational encounters and share OHC operational updates.</p></div>
            {occupationalSummary ? <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3"><div className="rounded-md border p-2"><span className="block text-xs text-muted-foreground">Visits completed</span>{occupationalSummary.appointments.completed} / {occupationalSummary.appointments.total}</div><div className="rounded-md border p-2"><span className="block text-xs text-muted-foreground">Finalized encounters</span>{occupationalSummary.encounters.finalized} / {occupationalSummary.encounters.total}</div><div className="rounded-md border p-2"><span className="block text-xs text-muted-foreground">Screenings needing attention</span>{occupationalSummary.screenings.attention_required}</div></div> : null}
            <form className="grid gap-2 rounded-lg border p-3 sm:grid-cols-4" onSubmit={(event) => { event.preventDefault(); if (!appointmentEmployeeId || !appointmentAt) return; void createAppointment({ unit: unit.uid, employeeUserId: Number(appointmentEmployeeId), scheduledAt: new Date(appointmentAt).toISOString(), appointmentType }).then(async () => { setAppointmentEmployeeId(""); setAppointmentAt(""); await loadOccupational(); toast({ title: "Occupational visit scheduled" }); }).catch((err: OhcError) => toast({ variant: "destructive", title: "Could not schedule visit", description: err.message })); }}><div><Label htmlFor="ohc-employee-id">Employee user ID</Label><Input id="ohc-employee-id" value={appointmentEmployeeId} inputMode="numeric" onChange={(event) => setAppointmentEmployeeId(event.target.value)} /></div><div><Label htmlFor="ohc-scheduled-at">Date and time</Label><Input id="ohc-scheduled-at" type="datetime-local" value={appointmentAt} onChange={(event) => setAppointmentAt(event.target.value)} /></div><div><Label htmlFor="ohc-visit-type">Visit type</Label><Select value={appointmentType} onValueChange={setAppointmentType}><SelectTrigger id="ohc-visit-type"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="occupational_visit">Occupational visit</SelectItem><SelectItem value="pre_employment">Pre-employment</SelectItem><SelectItem value="periodic">Periodic</SelectItem><SelectItem value="return_to_work">Return to work</SelectItem><SelectItem value="screening">Screening</SelectItem><SelectItem value="dot_testing">DOT testing</SelectItem></SelectContent></Select></div><div className="self-end"><Button type="submit">Schedule visit</Button></div></form>
            {listError ? <InlineError message="Could not load occupational care." onRetry={loadOccupational} /> : null}
            <div className="rounded-lg border"><p className="border-b p-3 text-sm font-medium">Scheduled visits</p>{appointments?.length ? <ul className="divide-y">{appointments.map((appointment) => <li key={appointment.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm"><span><span className="font-medium">{appointment.employee_name}</span><span className="block text-xs text-muted-foreground">{appointment.appointment_type.replaceAll("_", " ")} · {new Date(appointment.scheduled_at).toLocaleString()} · {appointment.status}</span></span>{appointment.status === "scheduled" ? <span className="flex gap-2"><Button size="sm" variant="outline" onClick={() => void remindAppointment(appointment.id, { unit: unit.uid }).then((outcome) => toast({ title: outcome.notificationSent ? "Reminder sent" : "Reminder queued" }))}>Send reminder</Button><Button size="sm" variant="outline" onClick={() => void updateAppointment(appointment.id, { unit: unit.uid, status: "completed" }).then(loadOccupational)}>Mark completed</Button></span> : null}</li>)}</ul> : <p className="p-3 text-sm text-muted-foreground">No occupational visits scheduled.</p>}</div>
            <div className="rounded-lg border"><p className="border-b p-3 text-sm font-medium">OHC staff communications</p><div className="space-y-2 p-3"><Input aria-label="Announcement title" value={messageTitle} maxLength={160} placeholder="Announcement title" onChange={(event) => setMessageTitle(event.target.value)} /><Textarea aria-label="Announcement message" value={messageBody} maxLength={4000} placeholder="Operational update, handover or announcement" onChange={(event) => setMessageBody(event.target.value)} /><Button size="sm" disabled={!messageTitle.trim() || !messageBody.trim()} onClick={() => void createOhcStaffMessage({ unit: unit.uid, title: messageTitle.trim(), body: messageBody.trim(), messageType: "announcement" }).then(async () => { setMessageTitle(""); setMessageBody(""); await loadOccupational(); })}>Post announcement</Button></div>{staffMessages?.map((message) => <div key={message.id} className="border-t p-3 text-sm"><span className="font-medium">{message.title}</span><span className="block text-xs text-muted-foreground">{message.author_name} · {message.message_type}</span><p className="mt-1">{message.body}</p></div>)}</div>
            <div className="rounded-lg border"><p className="border-b p-3 text-sm font-medium">Recent occupational encounters</p>{encounters?.length ? <ul className="divide-y">{encounters.map((encounter) => <li key={encounter.id} className="p-3 text-sm"><span className="font-medium">{encounter.employee_name}</span><span className="block text-xs text-muted-foreground">{encounter.encounter_type.replaceAll("_", " ")} · {encounter.status}</span>{encounter.assessment ? <p className="mt-1">{encounter.assessment}</p> : null}</li>)}</ul> : <p className="p-3 text-sm text-muted-foreground">No encounters recorded.</p>}</div>
          </section>
        )}

        {tab === "certificates" && (
          <section aria-label="Certificates issued">
            <CertificatesTable certs={certs} listError={listError} onRetry={loadCerts} onFetchPdf={fetchCertificatePdfBlob} />
          </section>
        )}
        {tab === "prescriptions" && (
          <section aria-label="Prescriptions" className="space-y-3">
            <div><h2 className="text-base font-semibold">Prescriptions</h2><p className="text-sm text-muted-foreground">Issued through the hospital's own prescription system — use "Prescribe" on the Employees tab to write a new one.</p></div>
            <PrescriptionsTable prescriptions={prescriptions} listError={listError} onRetry={loadPrescriptions} />
          </section>
        )}
        {tab === "staff" && (
          <section aria-label="Clinic staff" className="space-y-3">
            <h2 className="text-base font-semibold">Clinic staff</h2>
            <StaffList staff={staff} listError={listError} onRetry={loadStaff} />
          </section>
        )}
        {tab === "emergencies" && (
          <section aria-label="Workplace emergencies" className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div><h2 className="text-base font-semibold">Workplace emergencies</h2><p className="text-sm text-muted-foreground">Triage and track medical events reported at the corporate workplace.</p></div>
              <Button onClick={() => setEmergencyOpen(true)}><AlertTriangle className="mr-2 size-4" aria-hidden />Report emergency</Button>
            </div>
            {emergencyMetrics ? <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4"><div className="rounded-md border p-2"><span className="block text-xs text-muted-foreground">Active</span>{emergencyMetrics.activeIncidents}</div><div className="rounded-md border p-2"><span className="block text-xs text-muted-foreground">Critical active</span>{emergencyMetrics.criticalActiveIncidents}</div><div className="rounded-md border p-2"><span className="block text-xs text-muted-foreground">Today</span>{emergencyMetrics.incidentsToday}</div><div className="rounded-md border p-2"><span className="block text-xs text-muted-foreground">Avg acknowledgement</span>{emergencyMetrics.averageAcknowledgementSeconds == null ? "—" : `${Math.round(emergencyMetrics.averageAcknowledgementSeconds / 60)} min`}</div></div> : null}
            {me.worker.role !== "corporate_cmo" && <div className="flex max-w-sm items-center gap-2 rounded-md border p-3"><Label htmlFor="responder-availability">My response availability</Label><Select value={responders?.find((responder) => responder.uid === me.worker.uid)?.availability || "available"} onValueChange={async (availability) => { try { await setMyResponderAvailability({ unit: unit.uid, availability }); await loadResponders(); } catch (err) { toast({ variant: "destructive", title: "Could not update availability", description: (err as OhcError).message }); } }}><SelectTrigger id="responder-availability"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="available">Available</SelectItem><SelectItem value="busy">Busy</SelectItem><SelectItem value="off_duty">Off duty</SelectItem></SelectContent></Select></div>}
            <EmergenciesPanel emergencies={emergencies} responders={responders} listError={listError} onRetry={() => { loadEmergencies(); loadResponders(); }} onAdvance={async (id, status) => { await updateEmergency(id, { unit: unit.uid, status }); await loadEmergencies(); }} onAssign={async (id, responderUid) => { await assignEmergencyResponder(id, { unit: unit.uid, responderUid }); await loadEmergencies(); await loadResponders(); }} onRespond={async (emergencyId, assignmentId, status) => { await respondToEmergencyAssignment(emergencyId, assignmentId, { unit: unit.uid, status }); await loadEmergencies(); await loadResponders(); }} onOpenTimeline={(id) => getEmergencyDetail(id, unit.uid)} onAddNote={async (id, input) => { await addEmergencyNote(id, { unit: unit.uid, ...input }); }} onSaveReportDraft={async (id, summary) => { await saveEmergencyReportDraft(id, { unit: unit.uid, summary }); }} onFinalizeReport={async (id) => { await finalizeEmergencyReport(id, { unit: unit.uid }); }} canFinalizeReport={me.worker.role === "ohc_doctor"} />
          </section>
        )}
      </main>
      <IssueCertificateDialog employee={issueFor} open={issueFor !== null} onOpenChange={(o) => !o && setIssueFor(null)} onIssue={(input) => issueCertificate({ ...input, unit: unit.uid })} onIssued={loadCerts} />
      <EmergencyReportDialog employees={employees || []} open={emergencyOpen} onOpenChange={setEmergencyOpen} onReport={(input) => reportEmergency({ ...input, unit: unit.uid })} onReported={loadEmergencies} />
      <PrescriptionDialog employee={prescribeFor} open={prescribeFor !== null} onOpenChange={(o) => !o && setPrescribeFor(null)} onIssue={createPrescription} onIssued={loadPrescriptions} />
      <ReferralDialog employee={referFor} open={referFor !== null} onOpenChange={(o) => !o && setReferFor(null)} onRefer={createReferral} onReferred={() => undefined} />
      <Dialog open={historyFor !== null} onOpenChange={(o) => { if (!o) { setHistoryFor(null); setHistoryData(null); } }}>
        <DialogContent className="max-h-[80vh] max-w-2xl overflow-y-auto">
          <DialogHeader><DialogTitle>{historyFor?.name} — occupational history</DialogTitle></DialogHeader>
          {historyError && <InlineError message="Could not load this employee's history." onRetry={() => historyFor && void loadHistory(historyFor)} />}
          {!historyError && !historyData && <Skeleton className="h-40" />}
          {historyData && (
            <div className="space-y-4">
              <section>
                <h3 className="mb-1 text-sm font-semibold">Appointments</h3>
                {historyData.appointments.length ? (
                  <ul className="divide-y rounded-md border text-sm">
                    {historyData.appointments.map((a) => (
                      <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 p-2">
                        <span>{a.appointment_type.replaceAll("_", " ")} · {new Date(a.scheduled_at).toLocaleString()}</span>
                        <span className="text-xs text-muted-foreground">{a.status}</span>
                      </li>
                    ))}
                  </ul>
                ) : <p className="text-sm text-muted-foreground">No occupational appointments on record.</p>}
              </section>
              <section>
                <h3 className="mb-1 text-sm font-semibold">Occupational encounters</h3>
                {historyData.encounters.length ? (
                  <ul className="divide-y rounded-md border text-sm">
                    {historyData.encounters.map((enc) => (
                      <li key={enc.id} className="p-2">
                        <span className="font-medium">{enc.encounter_type.replaceAll("_", " ")}</span>
                        <span className="ml-2 text-xs text-muted-foreground">{enc.status} · {new Date(enc.created_at).toLocaleDateString()}</span>
                        {enc.assessment ? <p className="mt-1 text-muted-foreground">{enc.assessment}</p> : null}
                      </li>
                    ))}
                  </ul>
                ) : <p className="text-sm text-muted-foreground">No occupational encounters on record.</p>}
              </section>
              <section>
                <h3 className="mb-1 text-sm font-semibold">Fitness certificates</h3>
                {historyData.certificates.length ? (
                  <ul className="divide-y rounded-md border text-sm">
                    {historyData.certificates.map((cert) => (
                      <li key={cert.id} className="flex flex-wrap items-center justify-between gap-2 p-2">
                        <span>{cert.fitness_status.replaceAll("_", " ")}</span>
                        <span className="text-xs text-muted-foreground">{cert.valid_until ? `valid until ${new Date(cert.valid_until).toLocaleDateString()}` : "no expiry"}</span>
                      </li>
                    ))}
                  </ul>
                ) : <p className="text-sm text-muted-foreground">No fitness certificates issued.</p>}
              </section>
            </div>
          )}
        </DialogContent>
      </Dialog>
      </div>
    </div>
  );
}
