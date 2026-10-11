/**
 * Per-command dialogs for the collector worklist, plus `TaskActions`, which renders exactly one
 * button per entry in `task.permittedCommands` — never a hardcoded step list, per the API's own
 * first rule (docs/api/PHLEBOTOMY_MOBILE_API_INTEGRATION.md §5.4). Simple commands (`accept`,
 * `depart`, `start_transit`) fire directly; the rest open a small dialog for their required fields.
 * `onCommand` does the network call (in PhlebotomistDashboard.tsx) — these components only build the
 * body and report success/failure.
 */
import { useState } from "react";
import {
  CheckCircle2, Car, MapPin, BedDouble, UserCheck, ClipboardCheck, ScanBarcode, Syringe, Truck, PackageCheck, XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import type { ApiProblem, Task, Test } from "./types";

const IDENTIFIER_TYPES = ["name", "dob", "phone", "photo_id"];

type CommandFn = (command: string, body?: Record<string, unknown>) => Promise<void>;

function DeclineDialog({ open, onOpenChange, onCommand }: { open: boolean; onOpenChange: (o: boolean) => void; onCommand: CommandFn }) {
  const { toast } = useToast();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try { await onCommand("decline", { reason: reason.trim() }); setReason(""); onOpenChange(false); }
    catch (err) { toast({ variant: "destructive", title: "Could not decline the task", description: (err as ApiProblem).message }); }
    finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Decline this task</DialogTitle><DialogDescription>The task returns to dispatch's unassigned pool.</DialogDescription></DialogHeader>
        <div className="space-y-1.5"><Label htmlFor="decline-reason">Reason</Label><Textarea id="decline-reason" value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} /></div>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button variant="destructive" disabled={busy || reason.trim().length < 2} onClick={submit}>{busy ? "Declining…" : "Decline task"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ArrivalDialog({ open, onOpenChange, onCommand }: { open: boolean; onOpenChange: (o: boolean) => void; onCommand: CommandFn }) {
  const { toast } = useToast();
  const [method, setMethod] = useState<"manual" | "geo" | "otp">("manual");
  const [withinRadius, setWithinRadius] = useState(true);
  const [accuracyM, setAccuracyM] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const selectGeoMethod = () => {
    setMethod("geo");
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((pos) => setAccuracyM(Math.round(pos.coords.accuracy)), () => setAccuracyM(null), { enableHighAccuracy: true, timeout: 8000 });
  };

  const submit = async () => {
    setBusy(true);
    try {
      const evidence = method === "manual" ? { method, withinRadius } : { method, withinRadius, ...(accuracyM != null ? { accuracyM } : {}) };
      await onCommand("arrive", { evidence });
      onOpenChange(false); setMethod("manual"); setWithinRadius(true); setAccuracyM(null);
    } catch (err) { toast({ variant: "destructive", title: "Could not record arrival", description: (err as ApiProblem).message }); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Confirm arrival</DialogTitle><DialogDescription>Evidence is bounded — the app never sends raw coordinates.</DialogDescription></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>How are you confirming arrival?</Label>
            <RadioGroup value={method} onValueChange={(v) => (v === "geo" ? selectGeoMethod() : setMethod(v as typeof method))} className="gap-2">
              <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="manual" />Manual — I'm at the address</label>
              <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="geo" />Device location</label>
              <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="otp" />Confirmed by OTP with the patient</label>
            </RadioGroup>
          </div>
          {method === "geo" && <p className="text-xs text-muted-foreground">{accuracyM != null ? `Location captured (±${accuracyM}m).` : "Requesting device location…"}</p>}
          <label className="flex items-center gap-2 text-sm"><Checkbox checked={withinRadius} onCheckedChange={(c) => setWithinRadius(c === true)} />Within the service radius of the address</label>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button disabled={busy} onClick={submit}>{busy ? "Saving…" : "Confirm arrival"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BedsideDialog({ open, onOpenChange, onCommand }: { open: boolean; onOpenChange: (o: boolean) => void; onCommand: CommandFn }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try { await onCommand("bedside", { locationConfirmed: true }); onOpenChange(false); }
    catch (err) { toast({ variant: "destructive", title: "Could not confirm bedside", description: (err as ApiProblem).message }); }
    finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>At the bedside</DialogTitle><DialogDescription>Confirm you are at the correct ward and bed. The server rechecks the admission — a discharged or moved patient will raise an exception instead.</DialogDescription></DialogHeader>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button disabled={busy} onClick={submit}>{busy ? "Confirming…" : "Confirm location"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function VerifyPatientDialog({ open, onOpenChange, onCommand }: { open: boolean; onOpenChange: (o: boolean) => void; onCommand: CommandFn }) {
  const { toast } = useToast();
  const [method, setMethod] = useState<"two_identifiers" | "wristband">("two_identifiers");
  const [types, setTypes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const minTypes = method === "two_identifiers" ? 2 : 1;
  const toggle = (t: string) => setTypes((ts) => (ts.includes(t) ? ts.filter((x) => x !== t) : [...ts, t]));

  const run = async (result: "match" | "mismatch") => {
    setBusy(true);
    try {
      await onCommand("verify_patient", { method, result, identifierTypes: types });
      onOpenChange(false); setTypes([]);
      if (result === "mismatch") toast({ variant: "destructive", title: "Mismatch recorded", description: "Do not collect. Dispatch has been notified." });
    } catch (err) { toast({ variant: "destructive", title: "Could not record verification", description: (err as ApiProblem).message }); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Verify patient identity</DialogTitle><DialogDescription>Record which identifiers you checked — never the identifiers themselves.</DialogDescription></DialogHeader>
        <div className="space-y-3">
          <RadioGroup value={method} onValueChange={(v) => { setMethod(v as typeof method); setTypes([]); }} className="gap-2">
            <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="two_identifiers" />Two identifiers</label>
            <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="wristband" />Wristband</label>
          </RadioGroup>
          <div className="flex flex-wrap gap-3">
            {(method === "wristband" ? ["wristband_id", ...IDENTIFIER_TYPES] : IDENTIFIER_TYPES).map((t) => (
              <label key={t} className="flex items-center gap-1.5 text-sm"><Checkbox checked={types.includes(t)} onCheckedChange={() => toggle(t)} />{t.replaceAll("_", " ")}</label>
            ))}
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="destructive" disabled={busy || types.length < minTypes} onClick={() => run("mismatch")}>Mismatch</Button>
          <Button disabled={busy || types.length < minTypes} onClick={() => run("match")}>{busy ? "Saving…" : "Confirms match"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ConsentDialog({ open, onOpenChange, onCommand }: { open: boolean; onOpenChange: (o: boolean) => void; onCommand: CommandFn }) {
  const { toast } = useToast();
  const [method, setMethod] = useState("verbal");
  const [language, setLanguage] = useState("en");
  const [givenBy, setGivenBy] = useState("patient");
  const [busy, setBusy] = useState(false);

  const run = async (outcome: "granted" | "refused") => {
    setBusy(true);
    try {
      await onCommand("consent", { outcome, consentVersion: "v1", method, language: language.trim() || "en", givenBy });
      onOpenChange(false);
    } catch (err) { toast({ variant: "destructive", title: "Could not record consent", description: (err as ApiProblem).message }); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Patient consent</DialogTitle><DialogDescription>A refusal closes the task and notifies dispatch.</DialogDescription></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="consent-method">How was consent given?</Label>
            <Select value={method} onValueChange={setMethod}><SelectTrigger id="consent-method"><SelectValue /></SelectTrigger><SelectContent>{["verbal", "written", "digital"].map((v) => <SelectItem key={v} value={v}>{v[0].toUpperCase() + v.slice(1)}</SelectItem>)}</SelectContent></Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="consent-by">Given by</Label>
            <Select value={givenBy} onValueChange={setGivenBy}><SelectTrigger id="consent-by"><SelectValue /></SelectTrigger><SelectContent>{["patient", "guardian", "witnessed"].map((v) => <SelectItem key={v} value={v}>{v[0].toUpperCase() + v.slice(1)}</SelectItem>)}</SelectContent></Select>
          </div>
          <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="consent-lang">Language</Label><Input id="consent-lang" value={language} maxLength={40} onChange={(e) => setLanguage(e.target.value)} /></div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="destructive" disabled={busy} onClick={() => run("refused")}>Patient refused</Button>
          <Button disabled={busy} onClick={() => run("granted")}>{busy ? "Saving…" : "Consent granted"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ScanDialog({ open, onOpenChange, tests, onCommand }: { open: boolean; onOpenChange: (o: boolean) => void; tests: Test[]; onCommand: CommandFn }) {
  const { toast } = useToast();
  const required = tests.filter((t) => t.status === "required");
  const containerTypes = Array.from(new Set(required.map((t) => t.containerType)));
  const [containerType, setContainerType] = useState(containerTypes[0] ?? "");
  const [barcode, setBarcode] = useState("");
  const [testIds, setTestIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const group = required.filter((t) => t.containerType === containerType);
  const toggle = (id: string) => setTestIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  const submit = async () => {
    setBusy(true);
    try {
      await onCommand("scan_specimen", { barcode: barcode.trim(), testIds });
      setBarcode(""); setTestIds([]);
      toast({ title: "Tube scanned", description: barcode.trim() });
    } catch (err) { toast({ variant: "destructive", title: "Could not scan tube", description: (err as ApiProblem).message }); }
    finally { setBusy(false); }
  };

  if (required.length === 0) return (
    <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-w-sm"><DialogHeader><DialogTitle>Scan tube</DialogTitle><DialogDescription>Every test already has a specimen.</DialogDescription></DialogHeader><DialogFooter><Button onClick={() => onOpenChange(false)}>Close</Button></DialogFooter></DialogContent></Dialog>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Scan tube</DialogTitle><DialogDescription>Each barcode must cover tests of one container type only.</DialogDescription></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5"><Label htmlFor="scan-barcode">Barcode</Label><Input id="scan-barcode" value={barcode} maxLength={80} onChange={(e) => setBarcode(e.target.value)} autoFocus /></div>
          {containerTypes.length > 1 && (
            <div className="space-y-1.5">
              <Label htmlFor="scan-container">Container type</Label>
              <Select value={containerType} onValueChange={(v) => { setContainerType(v); setTestIds([]); }}><SelectTrigger id="scan-container"><SelectValue /></SelectTrigger><SelectContent>{containerTypes.map((c) => <SelectItem key={c} value={c}>{c.replaceAll("_", " ")}</SelectItem>)}</SelectContent></Select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Tests on this tube</Label>
            {group.map((t) => (
              <label key={t.id} className="flex items-center gap-2 text-sm"><Checkbox checked={testIds.includes(t.id)} onCheckedChange={() => toggle(t.id)} />{t.name}{t.code ? ` (${t.code})` : ""}</label>
            ))}
          </div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button><Button disabled={busy || !barcode.trim() || testIds.length === 0} onClick={submit}>{busy ? "Scanning…" : "Scan"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CollectDialog({ open, onOpenChange, task, onCommand }: { open: boolean; onOpenChange: (o: boolean) => void; task: Task; onCommand: CommandFn }) {
  const { toast } = useToast();
  const needsIsolationAck = task.mode === "ward" && Boolean(task.ward?.isolationRequired) && !task.ward?.isolationAckAt;
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try { await onCommand("collect", needsIsolationAck ? { isolationAcknowledged: true } : {}); onOpenChange(false); setAck(false); }
    catch (err) { toast({ variant: "destructive", title: "Could not mark collected", description: (err as ApiProblem).message }); }
    finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Mark collection complete</DialogTitle><DialogDescription>Every required test must already have a scanned tube.</DialogDescription></DialogHeader>
        {needsIsolationAck && <label className="flex items-center gap-2 text-sm"><Checkbox checked={ack} onCheckedChange={(c) => setAck(c === true)} />I acknowledge isolation precautions for this bed</label>}
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button disabled={busy || (needsIsolationAck && !ack)} onClick={submit}>{busy ? "Saving…" : "Collected"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function HandoffDialog({ open, onOpenChange, task, onCommand }: { open: boolean; onOpenChange: (o: boolean) => void; task: Task; onCommand: CommandFn }) {
  const { toast } = useToast();
  const options = task.mode === "ward" ? ["lab", "collection_point"] : ["lab"];
  const [receiverKind, setReceiverKind] = useState(options[0]);
  const [receiverRef, setReceiverRef] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try { await onCommand("handoff", { receiverKind, ...(receiverRef.trim() ? { receiverRef: receiverRef.trim() } : {}) }); onOpenChange(false); setReceiverRef(""); }
    catch (err) { toast({ variant: "destructive", title: "Could not hand off", description: (err as ApiProblem).message }); }
    finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Hand off specimens</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {options.length > 1 && (
            <div className="space-y-1.5"><Label htmlFor="ho-kind">Receiver</Label><Select value={receiverKind} onValueChange={setReceiverKind}><SelectTrigger id="ho-kind"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="lab">Lab</SelectItem><SelectItem value="collection_point">Collection point</SelectItem></SelectContent></Select></div>
          )}
          <div className="space-y-1.5"><Label htmlFor="ho-ref">Receiver name (optional)</Label><Input id="ho-ref" value={receiverRef} maxLength={80} placeholder="e.g. Front desk" onChange={(e) => setReceiverRef(e.target.value)} /></div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button disabled={busy} onClick={submit}>{busy ? "Saving…" : "Hand off"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const SIMPLE: Record<string, { label: string; icon: typeof CheckCircle2; body: (task: Task) => Record<string, unknown> }> = {
  accept: { label: "Accept task", icon: CheckCircle2, body: (t) => ({ assignmentVersion: t.assignmentVersion }) },
  depart: { label: "Mark departed", icon: Car, body: () => ({}) },
  start_transit: { label: "Start transit", icon: Truck, body: () => ({}) },
};
const DIALOG_META: Record<string, { label: string; icon: typeof CheckCircle2; variant?: "destructive" }> = {
  decline: { label: "Decline", icon: XCircle, variant: "destructive" },
  arrive: { label: "Confirm arrival", icon: MapPin },
  bedside: { label: "At bedside", icon: BedDouble },
  verify_patient: { label: "Verify patient", icon: UserCheck },
  consent: { label: "Record consent", icon: ClipboardCheck },
  scan_specimen: { label: "Scan tube", icon: ScanBarcode },
  collect: { label: "Mark collected", icon: Syringe },
  handoff: { label: "Hand off", icon: PackageCheck },
};

/** Renders exactly the buttons `task.permittedCommands` allows, nothing more. */
export function TaskActions({ task, tests, onCommand }: { task: Task; tests: Test[]; onCommand: CommandFn }) {
  const { toast } = useToast();
  const [openDialog, setOpenDialog] = useState<string | null>(null);
  const [firing, setFiring] = useState<string | null>(null);

  const fireSimple = async (command: string) => {
    setFiring(command);
    try { await onCommand(command, SIMPLE[command].body(task)); }
    catch (err) { toast({ variant: "destructive", title: "Action failed", description: (err as ApiProblem).message }); }
    finally { setFiring(null); }
  };

  if (task.permittedCommands.length === 0) return <p className="text-sm text-muted-foreground">No further action — this task is closed.</p>;

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {task.permittedCommands.map((cmd) => {
          if (SIMPLE[cmd]) {
            const { label, icon: Icon } = SIMPLE[cmd];
            return <Button key={cmd} size="sm" disabled={firing === cmd} onClick={() => fireSimple(cmd)}><Icon className="mr-1.5 size-4" aria-hidden />{firing === cmd ? "Working…" : label}</Button>;
          }
          const meta = DIALOG_META[cmd];
          if (!meta) return null;
          const { label, icon: Icon, variant } = meta;
          return <Button key={cmd} size="sm" variant={variant} onClick={() => setOpenDialog(cmd)}><Icon className="mr-1.5 size-4" aria-hidden />{label}</Button>;
        })}
      </div>
      <DeclineDialog open={openDialog === "decline"} onOpenChange={(o) => setOpenDialog(o ? "decline" : null)} onCommand={onCommand} />
      <ArrivalDialog open={openDialog === "arrive"} onOpenChange={(o) => setOpenDialog(o ? "arrive" : null)} onCommand={onCommand} />
      <BedsideDialog open={openDialog === "bedside"} onOpenChange={(o) => setOpenDialog(o ? "bedside" : null)} onCommand={onCommand} />
      <VerifyPatientDialog open={openDialog === "verify_patient"} onOpenChange={(o) => setOpenDialog(o ? "verify_patient" : null)} onCommand={onCommand} />
      <ConsentDialog open={openDialog === "consent"} onOpenChange={(o) => setOpenDialog(o ? "consent" : null)} onCommand={onCommand} />
      <ScanDialog open={openDialog === "scan_specimen"} onOpenChange={(o) => setOpenDialog(o ? "scan_specimen" : null)} tests={tests} onCommand={onCommand} />
      <CollectDialog open={openDialog === "collect"} onOpenChange={(o) => setOpenDialog(o ? "collect" : null)} task={task} onCommand={onCommand} />
      <HandoffDialog open={openDialog === "handoff"} onOpenChange={(o) => setOpenDialog(o ? "handoff" : null)} task={task} onCommand={onCommand} />
    </>
  );
}
