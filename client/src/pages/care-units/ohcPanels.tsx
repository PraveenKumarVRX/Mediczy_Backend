/**
 * Shared OHC clinical-workspace UI — certificate issuance, the certificates table, the emergencies
 * panel and the staff list. Used by both the OHC-login workspace (../ohc/OhcWorkspace.tsx) and the
 * corporate CMO dashboard (../corporate/CorporateOhc.tsx): they hit different APIs with the same
 * response shapes, so callers pass in the data plus the actions (issue/report/advance/toggle) as
 * props rather than this file importing either API client.
 */
import { useState } from "react";
import { AlertTriangle, Eye, FileDown, Pill, Send, Share2, ShieldCheck } from "lucide-react";
import { downloadPdfBlob, previewPdfBlob, sharePdfBlob } from "@/utils/pdfActions";
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
import type { ApiProblem, ClinicalPrescription, Employee, Medication, OhcStaffMember, WorkplaceEmergency, WorkspaceCertificate } from "./types";

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
  const [examinationDate, setExaminationDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [examinationPlace, setExaminationPlace] = useState("");
  const [issuedDate, setIssuedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [restrictions, setRestrictions] = useState("");
  const [remarks, setRemarks] = useState("");
  const [busy, setBusy] = useState(false);
  const needsNote = status !== "fit";

  const submit = async () => {
    if (!employee) return;
    setBusy(true);
    try {
      const r = await onIssue({
        employeeUserId: employee.id, fitnessStatus: status, jobDescription: job.trim() || undefined, examinationDate: examinationDate || undefined,
        examinationPlace: examinationPlace.trim() || undefined, issuedDate: issuedDate || undefined,
        restrictions: restrictions.trim() || undefined, remarks: remarks.trim() || undefined,
      });
      toast({ title: "Certificate issued", description: `${employee.name} · ${FITNESS_LABEL[status]}${r.pdfUrl ? "" : " (PDF could not be generated; reissue the download later)"}` });
      setJob(""); setExaminationDate(new Date().toISOString().slice(0, 10)); setExaminationPlace(""); setIssuedDate(new Date().toISOString().slice(0, 10)); setRestrictions(""); setRemarks(""); setStatus("fit");
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
          <div className="space-y-1.5"><Label htmlFor="ic-job">Job role assessed</Label><Input id="ic-job" value={job} maxLength={300} onChange={(e) => setJob(e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="ic-exam">Examination date</Label><Input id="ic-exam" type="date" value={examinationDate} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setExaminationDate(e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="ic-place">City</Label><Input id="ic-place" placeholder="e.g. Bengaluru" value={examinationPlace} maxLength={80} onChange={(e) => setExaminationPlace(e.target.value)} /></div>
          <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="ic-issued">Issue date</Label><Input id="ic-issued" type="date" value={issuedDate} onChange={(e) => setIssuedDate(e.target.value)} /></div>
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

export function CertificatesTable({ certs, listError, onRetry, onFetchPdf }: {
  certs: WorkspaceCertificate[] | null; listError: boolean; onRetry: () => void; onFetchPdf: (id: number) => Promise<Blob>;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  const withCert = async (c: WorkspaceCertificate, action: "preview" | "download" | "share", win?: Window | null) => {
    const key = `${c.id}:${action}`;
    setBusy(key);
    const filename = `fitness-certificate-${c.id}.pdf`;
    try {
      const blob = await onFetchPdf(c.id);
      if (action === "preview") previewPdfBlob(blob, win ?? null, filename);
      else if (action === "download") downloadPdfBlob(blob, filename);
      else {
        const outcome = await sharePdfBlob(blob, filename, `Fitness certificate — ${c.patient_name}`);
        if (outcome === "downloaded") toast({ title: "Downloaded", description: "Sharing isn't supported on this device — the PDF was downloaded instead." });
      }
    } catch (e) {
      win?.close();
      toast({ variant: "destructive", title: "PDF unavailable", description: (e as ApiProblem).message });
    } finally {
      setBusy(null);
    }
  };

  if (listError) return <InlineError message="Could not load certificates." onRetry={onRetry} />;
  if (certs === null) return <Skeleton className="h-24" />;
  if (certs.length === 0) return <EmptyState icon={ShieldCheck} title="No certificates yet" description="Certificates issued for the company's employees appear here." />;
  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <table className="w-full text-left text-sm">
        <thead className="bg-muted/50 text-xs text-muted-foreground"><tr><th className="p-3">Employee</th><th>Result</th><th>Valid until</th><th>Issued</th><th><span className="sr-only">PDF actions</span></th></tr></thead>
        <tbody>{certs.map((c) => (
          <tr key={c.id} className="border-t">
            <td className="p-3">{c.patient_name}<span className="block text-xs text-muted-foreground">{c.employee_id}</span></td>
            <td>{FITNESS_LABEL[c.fitness_status] ?? c.fitness_status}{c.restrictions ? <span className="block text-xs text-muted-foreground">{c.restrictions}</span> : null}</td>
            <td>{formatDate(c.valid_until)}</td><td>{formatDate(c.created_at)}</td>
            <td className="pr-3 text-right">
              <div className="inline-flex gap-1.5">
                <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => { const win = window.open("", "_blank"); void withCert(c, "preview", win); }}><Eye className="mr-1 size-4" aria-hidden />Preview</Button>
                <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void withCert(c, "download")}><FileDown className="mr-1 size-4" aria-hidden />Download</Button>
                <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void withCert(c, "share")}><Share2 className="mr-1 size-4" aria-hidden />Share</Button>
              </div>
            </td>
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

const EMPTY_MED: Medication = { name: "", dosage: "", frequency: "", duration: "" };

/** Issues through the hospital's real prescription system (not an OHC-only record) — see
 * ohcClinicianAuth.middleware.js. `onIssue` is called only once registrationNumberOnFile is true. */
export function PrescriptionDialog({ employee, open, onOpenChange, onIssue, onIssued }: {
  employee: Employee | null; open: boolean; onOpenChange: (o: boolean) => void;
  onIssue: (input: Record<string, unknown>) => Promise<unknown>; onIssued: () => void;
}) {
  const { toast } = useToast();
  const [diagnosis, setDiagnosis] = useState("");
  const [meds, setMeds] = useState<Medication[]>([{ ...EMPTY_MED }]);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const updateMed = (i: number, patch: Partial<Medication>) => setMeds((m) => m.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  const removeMed = (i: number) => setMeds((m) => (m.length > 1 ? m.filter((_, idx) => idx !== i) : m));
  const valid = diagnosis.trim().length > 0 && meds.every((m) => m.name.trim());

  const submit = async () => {
    if (!employee || !valid) return;
    setBusy(true);
    try {
      await onIssue({
        patientId: employee.id, diagnosis: diagnosis.trim(),
        medications: meds.map((m) => ({ name: m.name.trim(), dosage: m.dosage.trim() || "As directed", frequency: m.frequency.trim() || "As directed", duration: m.duration.trim() || "As directed" })),
        notes: notes.trim() || undefined,
      });
      toast({ title: "Prescription issued", description: employee.name });
      setDiagnosis(""); setMeds([{ ...EMPTY_MED }]); setNotes("");
      onOpenChange(false); onIssued();
    } catch (err) { toast({ variant: "destructive", title: "Could not issue the prescription", description: (err as ApiProblem).message }); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader><DialogTitle>Prescription</DialogTitle><DialogDescription>{employee?.name}{employee?.employeeId ? ` · ${employee.employeeId}` : ""}{employee?.department ? ` · ${employee.department}` : ""}</DialogDescription></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5"><Label htmlFor="rx-diagnosis">Diagnosis</Label><Input id="rx-diagnosis" value={diagnosis} maxLength={300} onChange={(e) => setDiagnosis(e.target.value)} /></div>
          <div className="space-y-2">
            <Label>Medications</Label>
            {meds.map((m, i) => (
              <div key={i} className="grid grid-cols-2 gap-2 rounded-md border p-2">
                <Input placeholder="Medicine name" value={m.name} maxLength={120} className="col-span-2" onChange={(e) => updateMed(i, { name: e.target.value })} />
                <Input placeholder="Dosage (e.g. 500mg)" value={m.dosage} maxLength={60} onChange={(e) => updateMed(i, { dosage: e.target.value })} />
                <Input placeholder="Frequency (e.g. Twice daily)" value={m.frequency} maxLength={60} onChange={(e) => updateMed(i, { frequency: e.target.value })} />
                <Input placeholder="Duration (e.g. 5 days)" value={m.duration} maxLength={60} onChange={(e) => updateMed(i, { duration: e.target.value })} />
                {meds.length > 1 && <Button type="button" variant="ghost" size="sm" onClick={() => removeMed(i)}>Remove</Button>}
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={() => setMeds((m) => [...m, { ...EMPTY_MED }])}>+ Add medication</Button>
          </div>
          <div className="space-y-1.5"><Label htmlFor="rx-notes">Notes (optional)</Label><Textarea id="rx-notes" value={notes} maxLength={1000} onChange={(e) => setNotes(e.target.value)} /></div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button disabled={busy || !valid} onClick={submit}>{busy ? "Issuing…" : "Issue prescription"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PrescriptionsTable({ prescriptions, listError, onRetry }: {
  prescriptions: ClinicalPrescription[] | null; listError: boolean; onRetry: () => void;
}) {
  if (listError) return <InlineError message="Could not load prescriptions." onRetry={onRetry} />;
  if (prescriptions === null) return <Skeleton className="h-24" />;
  if (prescriptions.length === 0) return <EmptyState icon={Pill} title="No prescriptions yet" description="Prescriptions issued for employees appear here." />;
  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <table className="w-full text-left text-sm">
        <thead className="bg-muted/50 text-xs text-muted-foreground"><tr><th className="p-3">Patient</th><th>Diagnosis</th><th>Medications</th><th>Issued</th></tr></thead>
        <tbody>{prescriptions.map((p) => (
          <tr key={p.id} className="border-t">
            <td className="p-3">{p.patientName || "—"}</td>
            <td>{p.diagnosis || "—"}</td>
            <td>{(p.medications || []).map((m) => m.name).filter(Boolean).join(", ") || "—"}</td>
            <td>{formatDate(p.createdAt)}</td>
          </tr>))}
        </tbody>
      </table>
    </div>
  );
}

/** Creates a real `healthos_referrals` row via the careos federation. There is no network-org
 * directory lookup wired for this identity yet — the receiving org id must be known already. */
export function ReferralDialog({ employee, open, onOpenChange, onRefer, onReferred }: {
  employee: Employee | null; open: boolean; onOpenChange: (o: boolean) => void;
  onRefer: (input: Record<string, unknown>) => Promise<unknown>; onReferred: () => void;
}) {
  const { toast } = useToast();
  const [toOrgId, setToOrgId] = useState("");
  const [reason, setReason] = useState("");
  const [urgency, setUrgency] = useState("routine");
  const [busy, setBusy] = useState(false);
  const valid = toOrgId.trim().length > 0 && reason.trim().length >= 2;

  const submit = async () => {
    if (!employee || !valid) return;
    setBusy(true);
    try {
      await onRefer({ toOrgId: Number(toOrgId), patientId: employee.id, reason: reason.trim(), urgency });
      toast({ title: "Referral sent", description: employee.name });
      setToOrgId(""); setReason(""); setUrgency("routine");
      onOpenChange(false); onReferred();
    } catch (err) { toast({ variant: "destructive", title: "Could not create the referral", description: (err as ApiProblem).message }); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Refer to another hospital</DialogTitle><DialogDescription>{employee?.name}{employee?.employeeId ? ` · ${employee.employeeId}` : ""}</DialogDescription></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5"><Label htmlFor="ref-org">Receiving organisation id</Label><Input id="ref-org" type="number" min="1" value={toOrgId} onChange={(e) => setToOrgId(e.target.value)} placeholder="Network org id" /></div>
          <div className="space-y-1.5">
            <Label htmlFor="ref-urgency">Urgency</Label>
            <Select value={urgency} onValueChange={setUrgency}>
              <SelectTrigger id="ref-urgency"><SelectValue /></SelectTrigger>
              <SelectContent>{["routine", "urgent", "emergency"].map((v) => <SelectItem key={v} value={v}>{v[0].toUpperCase() + v.slice(1)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="ref-reason">Reason / clinical summary</Label><Textarea id="ref-reason" value={reason} maxLength={2000} onChange={(e) => setReason(e.target.value)} /></div>
        </div>
        <p className="text-xs text-muted-foreground">Ask your administrator for the receiving hospital's network organisation id — there is no directory lookup for this yet.</p>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button disabled={busy || !valid} onClick={submit}><Send className="mr-2 size-4" aria-hidden />{busy ? "Sending…" : "Send referral"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
