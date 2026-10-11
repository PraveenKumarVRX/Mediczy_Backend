/**
 * /ohc — the OHC workspace for an OHC doctor or OHC staff member: the employees of the one company the OHC serves, and the fitness
 * certificates it issues. The unit and the company come from the server (the signed-in worker's assignment), never from this page.
 */
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, LogOut, ShieldCheck, Stethoscope } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { InlineError } from "@/components/ui/inline-error";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { CertificatesTable, EmergenciesPanel, EmergencyReportDialog, IssueCertificateDialog, StaffList } from "../care-units/ohcPanels";
import type { Employee, OhcMe, OhcStaffMember, WorkplaceEmergency, WorkspaceCertificate } from "../care-units/types";
import { OhcError, changePassword, downloadCertificate, getCertificates, getEmployees, getEmergencies, getMe, getStaff, hasSession, issueCertificate, logout, reportEmergency, updateEmergency } from "./ohcClient";

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
  const [me, setMe] = useState<OhcMe | null>(null);
  const [error, setError] = useState<OhcError | null>(null);
  const [tab, setTab] = useState<"employees" | "certificates" | "staff" | "emergencies">("employees");
  const [search, setSearch] = useState("");
  const [employees, setEmployees] = useState<Employee[] | null>(null);
  const [certs, setCerts] = useState<WorkspaceCertificate[] | null>(null);
  const [staff, setStaff] = useState<OhcStaffMember[] | null>(null);
  const [emergencies, setEmergencies] = useState<WorkplaceEmergency[] | null>(null);
  const [listError, setListError] = useState(false);
  const [issueFor, setIssueFor] = useState<Employee | null>(null);
  const [emergencyOpen, setEmergencyOpen] = useState(false);
  const [activeUnitUid, setActiveUnitUid] = useState("");

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
  const loadStaff = useCallback(async () => { if (!unit) return; try { setStaff((await getStaff(unit.uid)).staff); setListError(false); } catch { setListError(true); } }, [unit]);
  const loadEmergencies = useCallback(async () => { if (!unit) return; try { setEmergencies((await getEmergencies(unit.uid)).emergencies); setListError(false); } catch { setListError(true); } }, [unit]);
  useEffect(() => { if (tab === "employees") { const t = setTimeout(loadEmployees, 250); return () => clearTimeout(t); } if (tab === "certificates") { loadCerts(); return undefined; } if (tab === "staff") { loadStaff(); return undefined; } loadEmergencies(); return undefined; }, [tab, loadEmployees, loadCerts, loadStaff, loadEmergencies]);

  const signOut = async () => { await logout(); navigate("/ohc/login", { replace: true }); };

  if (error?.code === "password_change_required" || me?.worker.mustChangePassword) return <ChangePassword onDone={() => navigate("/ohc/login", { replace: true })} />;
  if (error && error.status !== 401 && error.code !== "account_unavailable") return <main className="p-6"><InlineError message="Could not load your workspace." onRetry={load} /></main>;
  if (!me || !unit) return <main className="p-6" aria-busy="true"><Skeleton className="h-16" /></main>;
  const canSign = me.worker.canSign;

  return (
    <div className="min-h-screen bg-background">
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
          <TabsList><TabsTrigger value="employees">Employees</TabsTrigger><TabsTrigger value="certificates">Certificates issued</TabsTrigger><TabsTrigger value="staff">Clinic staff</TabsTrigger><TabsTrigger value="emergencies">Emergencies</TabsTrigger></TabsList>
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
                    <Button size="sm" disabled={!canSign} onClick={() => setIssueFor(e)}>Issue certificate</Button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {tab === "certificates" && (
          <section aria-label="Certificates issued">
            <CertificatesTable certs={certs} listError={listError} onRetry={loadCerts} onDownload={downloadCertificate} />
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
            <EmergenciesPanel emergencies={emergencies} listError={listError} onRetry={loadEmergencies} onAdvance={async (id, status) => { await updateEmergency(id, { unit: unit.uid, status }); loadEmergencies(); }} />
          </section>
        )}
      </main>
      <IssueCertificateDialog employee={issueFor} open={issueFor !== null} onOpenChange={(o) => !o && setIssueFor(null)} onIssue={(input) => issueCertificate({ ...input, unit: unit.uid })} onIssued={loadCerts} />
      <EmergencyReportDialog employees={employees || []} open={emergencyOpen} onOpenChange={setEmergencyOpen} onReport={(input) => reportEmergency({ ...input, unit: unit.uid })} onReported={loadEmergencies} />
    </div>
  );
}
