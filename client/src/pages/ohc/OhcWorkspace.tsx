/**
 * /ohc — the OHC workspace for an OHC doctor or OHC staff member: the employees of the one company the OHC serves, and the fitness
 * certificates it issues. The unit and the company come from the server (the signed-in worker's assignment), never from this page.
 */
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FileDown, LogOut, ShieldCheck, Stethoscope } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { InlineError } from "@/components/ui/inline-error";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { FITNESS_LABEL, formatDate } from "../care-units/format";
import type { Employee, OhcMe } from "../care-units/types";
import { OhcError, changePassword, downloadCertificate, getCertificates, getEmployees, getMe, hasSession, issueCertificate, logout } from "./ohcClient";

type Cert = { id: number; patient_name: string | null; employee_id: string | null; fitness_status: string; restrictions: string | null; valid_until: string | null; created_at: string };

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

function IssueDialog({ employee, unit, open, onOpenChange, onIssued }: { employee: Employee | null; unit: string; open: boolean; onOpenChange: (o: boolean) => void; onIssued: () => void }) {
  const { toast } = useToast();
  const [status, setStatus] = useState("fit");
  const [job, setJob] = useState("");
  const [restrictions, setRestrictions] = useState("");
  const [from, setFrom] = useState("");
  const [until, setUntil] = useState("");
  const [remarks, setRemarks] = useState("");
  const [busy, setBusy] = useState(false);
  const needsNote = status !== "fit";

  const submit = async () => {
    if (!employee) return;
    setBusy(true);
    try {
      const r = await issueCertificate({
        unit, employeeUserId: employee.id, fitnessStatus: status, jobDescription: job.trim() || undefined, restrictions: restrictions.trim() || undefined,
        validFrom: from || undefined, validUntil: until || undefined, remarks: remarks.trim() || undefined,
      });
      toast({ title: "Certificate issued", description: `${employee.name} · ${FITNESS_LABEL[status]}${r.pdfUrl ? "" : " (PDF could not be generated; reissue the download later)"}` });
      setJob(""); setRestrictions(""); setFrom(""); setUntil(""); setRemarks(""); setStatus("fit");
      onOpenChange(false); onIssued();
    } catch (err) { toast({ variant: "destructive", title: "Could not issue the certificate", description: (err as OhcError).message }); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader><DialogTitle>Fitness certificate</DialogTitle><DialogDescription>{employee?.name}{employee?.employeeId ? ` · ${employee.employeeId}` : ""}{employee?.department ? ` · ${employee.department}` : ""}</DialogDescription></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="ic-status">Result</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger id="ic-status"><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(FITNESS_LABEL).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="ic-job">Job role assessed</Label><Input id="ic-job" value={job} maxLength={300} onChange={(e) => setJob(e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="ic-from">Valid from</Label><Input id="ic-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="ic-until">Valid until</Label><Input id="ic-until" type="date" value={until} onChange={(e) => setUntil(e.target.value)} /></div>
          {needsNote && <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="ic-res">Restrictions</Label><Textarea id="ic-res" value={restrictions} maxLength={500} onChange={(e) => setRestrictions(e.target.value)} /></div>}
          <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="ic-rem">Remarks</Label><Textarea id="ic-rem" value={remarks} maxLength={1000} onChange={(e) => setRemarks(e.target.value)} /></div>
        </div>
        <p className="text-xs text-muted-foreground">Your company will see this certificate in full, including these remarks. Do not put clinical findings that should not reach the employer.</p>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button disabled={busy || (needsNote && !restrictions.trim())} onClick={submit}>{busy ? "Signing…" : "Sign and issue"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function OhcWorkspace() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [me, setMe] = useState<OhcMe | null>(null);
  const [error, setError] = useState<OhcError | null>(null);
  const [tab, setTab] = useState<"employees" | "certificates">("employees");
  const [search, setSearch] = useState("");
  const [employees, setEmployees] = useState<Employee[] | null>(null);
  const [certs, setCerts] = useState<Cert[] | null>(null);
  const [listError, setListError] = useState(false);
  const [issueFor, setIssueFor] = useState<Employee | null>(null);

  const unit = me?.units[0];
  const load = useCallback(async () => {
    try { setMe(await getMe()); setError(null); } catch (e) { setError(e as OhcError); }
  }, []);
  useEffect(() => { if (!hasSession()) { navigate("/ohc/login", { replace: true }); return; } load(); }, [load, navigate]);
  useEffect(() => { if (error && (error.status === 401 || error.code === "account_unavailable")) navigate("/ohc/login", { replace: true }); }, [error, navigate]);

  const loadEmployees = useCallback(async () => {
    if (!unit) return;
    try { setEmployees((await getEmployees(unit.uid, search)).employees); setListError(false); } catch { setListError(true); }
  }, [unit, search]);
  const loadCerts = useCallback(async () => {
    if (!unit) return;
    try { setCerts((await getCertificates(unit.uid)).certificates as unknown as Cert[]); setListError(false); } catch { setListError(true); }
  }, [unit]);
  useEffect(() => { if (tab === "employees") { const t = setTimeout(loadEmployees, 250); return () => clearTimeout(t); } loadCerts(); return undefined; }, [tab, loadEmployees, loadCerts]);

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
            <div><p className="font-semibold leading-tight">{unit.name}</p><p className="text-xs text-muted-foreground">for {unit.corporateName ?? "your company"} · operated by {unit.operatorName ?? "your hospital/clinic"}</p></div>
          </div>
          <div className="flex items-center gap-3 text-sm"><span className="text-right"><span className="block font-medium">{me.worker.displayName}</span><span className="block text-xs text-muted-foreground">{me.worker.role === "ohc_doctor" ? "OHC doctor" : "OHC staff"}</span></span>
            <Button variant="outline" size="sm" onClick={signOut}><LogOut className="mr-2 size-4" aria-hidden />Sign out</Button></div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl space-y-4 px-4 py-5">
        {!canSign && (
          <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
            {me.worker.role === "ohc_doctor" ? "Your medical registration number is not on file, so you cannot sign certificates yet. Ask your administrator to add it." : "Only an OHC doctor can sign a fitness certificate. You can look up employees here."}
          </p>
        )}
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList><TabsTrigger value="employees">Employees</TabsTrigger><TabsTrigger value="certificates">Certificates issued</TabsTrigger></TabsList>
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
            {listError && <InlineError message="Could not load certificates." onRetry={loadCerts} />}
            {certs === null && !listError && <Skeleton className="h-24" />}
            {certs?.length === 0 && <EmptyState icon={ShieldCheck} title="No certificates yet" description="Certificates you issue for the company's employees appear here." />}
            {certs && certs.length > 0 && (
              <div className="overflow-x-auto rounded-lg border bg-card">
                <table className="w-full text-left text-sm">
                  <thead className="bg-muted/50 text-xs text-muted-foreground"><tr><th className="p-3">Employee</th><th>Result</th><th>Valid until</th><th>Issued</th><th><span className="sr-only">PDF</span></th></tr></thead>
                  <tbody>{certs.map((c) => (
                    <tr key={c.id} className="border-t">
                      <td className="p-3">{c.patient_name}<span className="block text-xs text-muted-foreground">{c.employee_id}</span></td>
                      <td>{FITNESS_LABEL[c.fitness_status] ?? c.fitness_status}{c.restrictions ? <span className="block text-xs text-muted-foreground">{c.restrictions}</span> : null}</td>
                      <td>{formatDate(c.valid_until)}</td><td>{formatDate(c.created_at)}</td>
                      <td className="pr-3 text-right"><Button size="sm" variant="outline" onClick={() => downloadCertificate(c.id).catch((e) => toast({ variant: "destructive", title: "PDF unavailable", description: (e as OhcError).message }))}><FileDown className="mr-1 size-4" aria-hidden />PDF</Button></td>
                    </tr>))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}
      </main>
      <IssueDialog employee={issueFor} unit={unit.uid} open={issueFor !== null} onOpenChange={(o) => !o && setIssueFor(null)} onIssued={() => { loadCerts(); }} />
    </div>
  );
}
