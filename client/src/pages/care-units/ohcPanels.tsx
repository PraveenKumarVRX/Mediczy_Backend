/**
 * Shared OHC clinical-workspace UI — certificate issuance, the certificates table, the emergencies
 * panel and the staff list. Used by both the OHC-login workspace (../ohc/OhcWorkspace.tsx) and the
 * corporate CMO dashboard (../corporate/CorporateOhc.tsx): they hit different APIs with the same
 * response shapes, so callers pass in the data plus the actions (issue/report/advance/toggle) as
 * props rather than this file importing either API client.
 */
import { useState } from "react";
import { AlertTriangle, FileDown, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { InlineError } from "@/components/ui/inline-error";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { FITNESS_LABEL, formatDate } from "./format";
import type { ApiProblem, Employee, OhcStaffMember, WorkplaceEmergency, WorkspaceCertificate } from "./types";

const NEXT_STATUS: Record<WorkplaceEmergency["status"], WorkplaceEmergency["status"] | null> = {
  open: "triaged", triaged: "resolved", resolved: "closed", closed: null, transferred: null,
};
const ADVANCE_LABEL: Record<WorkplaceEmergency["status"], string> = { open: "Mark triaged", triaged: "Mark resolved", resolved: "Close", closed: "Closed", transferred: "Transferred" };

export function IssueCertificateDialog({ employee, open, onOpenChange, onIssue, onIssued }: {
  employee: Employee | null; open: boolean; onOpenChange: (o: boolean) => void;
  onIssue: (input: Record<string, unknown>) => Promise<{ pdfUrl: string | null }>; onIssued: () => void;
}) {
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
      const r = await onIssue({
        employeeUserId: employee.id, fitnessStatus: status, jobDescription: job.trim() || undefined, restrictions: restrictions.trim() || undefined,
        validFrom: from || undefined, validUntil: until || undefined, remarks: remarks.trim() || undefined,
      });
      toast({ title: "Certificate issued", description: `${employee.name} · ${FITNESS_LABEL[status]}${r.pdfUrl ? "" : " (PDF could not be generated; reissue the download later)"}` });
      setJob(""); setRestrictions(""); setFrom(""); setUntil(""); setRemarks(""); setStatus("fit");
      onOpenChange(false); onIssued();
    } catch (err) { toast({ variant: "destructive", title: "Could not issue the certificate", description: (err as ApiProblem).message }); }
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

export function EmergencyReportDialog({ employees, open, onOpenChange, onReport, onReported }: {
  employees: Employee[]; open: boolean; onOpenChange: (o: boolean) => void;
  onReport: (input: Record<string, unknown>) => Promise<void>; onReported: () => void;
}) {
  const { toast } = useToast();
  const [employeeUserId, setEmployeeUserId] = useState(""); const [severity, setSeverity] = useState("medium");
  const [incidentType, setIncidentType] = useState("medical_emergency"); const [location, setLocation] = useState("");
  const [description, setDescription] = useState(""); const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      await onReport({ employeeUserId: employeeUserId ? Number(employeeUserId) : undefined, incidentType, severity, location: location.trim() || undefined, description: description.trim() });
      toast({ title: "Emergency logged", description: "The OHC team can now triage and track this workplace event." });
      setEmployeeUserId(""); setSeverity("medium"); setIncidentType("medical_emergency"); setLocation(""); setDescription(""); onOpenChange(false); onReported();
    } catch (err) { toast({ variant: "destructive", title: "Could not log emergency", description: (err as ApiProblem).message }); }
    finally { setBusy(false); }
  };
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-w-lg"><DialogHeader><DialogTitle>Report workplace emergency</DialogTitle><DialogDescription>Record the minimum necessary information so the OHC can triage the employee and coordinate escalation.</DialogDescription></DialogHeader><div className="grid gap-3 sm:grid-cols-2"><div className="space-y-1.5"><Label htmlFor="em-type">Event type</Label><Input id="em-type" value={incidentType} maxLength={80} onChange={(e) => setIncidentType(e.target.value)} /></div><div className="space-y-1.5"><Label htmlFor="em-severity">Severity</Label><Select value={severity} onValueChange={setSeverity}><SelectTrigger id="em-severity"><SelectValue /></SelectTrigger><SelectContent>{["low", "medium", "high", "critical"].map((v) => <SelectItem key={v} value={v}>{v[0].toUpperCase() + v.slice(1)}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1.5 sm:col-span-2"><Label htmlFor="em-employee">Employee (optional)</Label><Select value={employeeUserId || "none"} onValueChange={(v) => setEmployeeUserId(v === "none" ? "" : v)}><SelectTrigger id="em-employee"><SelectValue placeholder="Select an employee" /></SelectTrigger><SelectContent><SelectItem value="none">Not specified</SelectItem>{employees.map((e) => <SelectItem key={e.id} value={String(e.id)}>{e.name}{e.employeeId ? ` · ${e.employeeId}` : ""}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1.5 sm:col-span-2"><Label htmlFor="em-location">Location</Label><Input id="em-location" value={location} maxLength={200} placeholder="Building, floor or clinic room" onChange={(e) => setLocation(e.target.value)} /></div><div className="space-y-1.5 sm:col-span-2"><Label htmlFor="em-description">What happened</Label><Textarea id="em-description" value={description} maxLength={2000} onChange={(e) => setDescription(e.target.value)} /></div></div><DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button disabled={busy || description.trim().length < 2} onClick={submit}>{busy ? "Saving…" : "Log emergency"}</Button></DialogFooter></DialogContent></Dialog>;
}

export function EmergenciesPanel({ emergencies, listError, onRetry, onAdvance }: {
  emergencies: WorkplaceEmergency[] | null; listError: boolean; onRetry: () => void; onAdvance: (id: number, nextStatus: string) => Promise<void>;
}) {
  const { toast } = useToast();
  if (listError) return <InlineError message="Could not load emergencies." onRetry={onRetry} />;
  if (emergencies === null) return <Skeleton className="h-24" />;
  if (emergencies.length === 0) return <EmptyState icon={AlertTriangle} title="No workplace emergencies" description="New reports will appear here for triage." />;
  return (
    <div className="space-y-2">
      {emergencies.map((e) => {
        const next = NEXT_STATUS[e.status];
        return (
          <div key={e.id} className="rounded-lg border bg-card p-3">
            <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium">{e.incident_type.replaceAll("_", " ")}</span><span className="text-xs font-medium uppercase text-muted-foreground">{e.severity} · {e.status}</span></div>
            <p className="mt-1 text-sm">{e.description}</p>
            <p className="mt-1 text-xs text-muted-foreground">{e.employee_name || "Employee not specified"}{e.location ? ` · ${e.location}` : ""} · {formatDate(e.occurred_at)}</p>
            {next && <div className="mt-2 flex gap-2"><Button size="sm" variant="outline" onClick={async () => { try { await onAdvance(e.id, next); } catch (err) { toast({ variant: "destructive", title: "Could not update emergency", description: (err as ApiProblem).message }); } }}>{ADVANCE_LABEL[e.status]}</Button></div>}
          </div>
        );
      })}
    </div>
  );
}

export function CertificatesTable({ certs, listError, onRetry, onDownload }: {
  certs: WorkspaceCertificate[] | null; listError: boolean; onRetry: () => void; onDownload: (id: number) => Promise<void>;
}) {
  const { toast } = useToast();
  if (listError) return <InlineError message="Could not load certificates." onRetry={onRetry} />;
  if (certs === null) return <Skeleton className="h-24" />;
  if (certs.length === 0) return <EmptyState icon={ShieldCheck} title="No certificates yet" description="Certificates issued for the company's employees appear here." />;
  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <table className="w-full text-left text-sm">
        <thead className="bg-muted/50 text-xs text-muted-foreground"><tr><th className="p-3">Employee</th><th>Result</th><th>Valid until</th><th>Issued</th><th><span className="sr-only">PDF</span></th></tr></thead>
        <tbody>{certs.map((c) => (
          <tr key={c.id} className="border-t">
            <td className="p-3">{c.patient_name}<span className="block text-xs text-muted-foreground">{c.employee_id}</span></td>
            <td>{FITNESS_LABEL[c.fitness_status] ?? c.fitness_status}{c.restrictions ? <span className="block text-xs text-muted-foreground">{c.restrictions}</span> : null}</td>
            <td>{formatDate(c.valid_until)}</td><td>{formatDate(c.created_at)}</td>
            <td className="pr-3 text-right"><Button size="sm" variant="outline" onClick={() => onDownload(c.id).catch((e) => toast({ variant: "destructive", title: "PDF unavailable", description: (e as ApiProblem).message }))}><FileDown className="mr-1 size-4" aria-hidden />PDF</Button></td>
          </tr>))}
        </tbody>
      </table>
    </div>
  );
}

type StaffRow = Pick<OhcStaffMember, "uid" | "name" | "role" | "active"> & { email?: string | null };

export function StaffList({ staff, listError, onRetry, onToggleActive }: {
  staff: StaffRow[] | null; listError: boolean; onRetry: () => void; onToggleActive?: (uid: string, active: boolean) => Promise<void>;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  if (listError) return <InlineError message="Could not load clinic staff." onRetry={onRetry} />;
  if (staff === null) return <Skeleton className="h-24" />;
  if (staff.length === 0) return <EmptyState icon={ShieldCheck} title="No staff assigned" description="The operator has not assigned staff to this OHC yet." />;
  const toggle = async (s: StaffRow) => {
    if (!onToggleActive) return;
    setBusy(s.uid);
    try { await onToggleActive(s.uid, !s.active); }
    catch (err) { toast({ variant: "destructive", title: "Could not update staff access", description: (err as ApiProblem).message }); }
    finally { setBusy(null); }
  };
  return (
    <div className="divide-y rounded-lg border bg-card">
      {staff.map((s) => (
        <div key={s.uid} className="flex items-center justify-between p-3">
          <span><span className="font-medium">{s.name}</span><span className="block text-xs text-muted-foreground">{s.email} · {s.role}</span></span>
          {onToggleActive
            ? <Button size="sm" variant="outline" disabled={busy === s.uid} onClick={() => toggle(s)}>{busy === s.uid ? "Saving…" : s.active ? "Deactivate" : "Reactivate"}</Button>
            : <span className="text-xs text-muted-foreground">{s.active ? "Active" : "Inactive"}</span>}
        </div>
      ))}
    </div>
  );
}
