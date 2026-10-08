import { useState } from "react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { InlineError } from "@/components/ui/inline-error";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { toProblem, useUnitLog, useUnitMutations, useUnitStaff } from "./careUnitsApi";
import { CONTRACT_LABEL, CONTRACT_TONE, PATTERN_LABEL, TYPE_LABEL, formatDate } from "./format";
import type { CareUnit } from "./types";

function AddStaffDialog({ unit, open, onOpenChange }: { unit: CareUnit; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { createStaff } = useUnitMutations();
  const { toast } = useToast();
  const [role, setRole] = useState<"ohc_doctor" | "ohc_staff">("ohc_doctor");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [reg, setReg] = useState("");
  const [issued, setIssued] = useState<{ email: string; tempPassword: string } | null>(null);
  const valid = firstName.trim() && lastName.trim() && /^[^@\s]+@[^@\s]+$/.test(email.trim()) && (role !== "ohc_doctor" || reg.trim().length > 2);

  const submit = async () => {
    try {
      const r = await createStaff.mutateAsync({ uid: unit.uid, input: { role, firstName: firstName.trim(), lastName: lastName.trim(), email: email.trim(), phone: phone.trim() || undefined, registrationNumber: role === "ohc_doctor" ? reg.trim() : undefined } });
      setIssued({ email: r.staff.email, tempPassword: r.tempPassword });
    } catch (e) { toast({ variant: "destructive", title: "Could not add the person", description: toProblem(e).message }); }
  };
  const close = (o: boolean) => { if (!o) { setIssued(null); setFirstName(""); setLastName(""); setEmail(""); setPhone(""); setReg(""); } onOpenChange(o); };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        {issued ? (
          <>
            <DialogHeader><DialogTitle>Account created</DialogTitle><DialogDescription>Give these details to the person now. The password is shown only once and cannot be recovered; you can reset it later.</DialogDescription></DialogHeader>
            <dl className="space-y-2 rounded-md border bg-muted/40 p-3 text-sm">
              <div><dt className="text-xs text-muted-foreground">Sign in at</dt><dd className="font-mono">/ohc/login</dd></div>
              <div><dt className="text-xs text-muted-foreground">Email</dt><dd className="font-mono break-all">{issued.email}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Temporary password</dt><dd className="select-all font-mono break-all">{issued.tempPassword}</dd></div>
            </dl>
            <DialogFooter><Button onClick={() => close(false)}>Done</Button></DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader><DialogTitle>Add OHC staff</DialogTitle><DialogDescription>They will work at {unit.name} only, and see only {unit.corporateName ?? "the company"}'s employees.</DialogDescription></DialogHeader>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="as-role">Role</Label>
                <Select value={role} onValueChange={(v) => setRole(v as "ohc_doctor" | "ohc_staff")}>
                  <SelectTrigger id="as-role"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="ohc_doctor">OHC doctor (signs fitness certificates)</SelectItem><SelectItem value="ohc_staff">OHC staff (nurse, technician, front desk)</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label htmlFor="as-first">First name</Label><Input id="as-first" value={firstName} maxLength={80} onChange={(e) => setFirstName(e.target.value)} /></div>
              <div className="space-y-1.5"><Label htmlFor="as-last">Last name</Label><Input id="as-last" value={lastName} maxLength={80} onChange={(e) => setLastName(e.target.value)} /></div>
              <div className="space-y-1.5"><Label htmlFor="as-email">Email (sign-in)</Label><Input id="as-email" type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
              <div className="space-y-1.5"><Label htmlFor="as-phone">Phone</Label><Input id="as-phone" inputMode="tel" value={phone} maxLength={20} onChange={(e) => setPhone(e.target.value)} /></div>
              {role === "ohc_doctor" && <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="as-reg">Medical registration number</Label><Input id="as-reg" value={reg} maxLength={60} onChange={(e) => setReg(e.target.value)} /></div>}
            </div>
            <DialogFooter><Button variant="outline" onClick={() => close(false)}>Cancel</Button><Button disabled={!valid || createStaff.isPending} onClick={submit}>{createStaff.isPending ? "Creating…" : "Create account"}</Button></DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function UnitDrawer({ unit, onClose }: { unit: CareUnit | null; onClose: () => void }) {
  const staff = useUnitStaff(unit?.type === "ohc" ? unit.uid : null);
  const log = useUnitLog(unit?.type === "ohc" ? unit.uid : null);
  const { removeStaff, endContract } = useUnitMutations();
  const { toast } = useToast();
  const [addOpen, setAddOpen] = useState(false);
  const [endOpen, setEndOpen] = useState(false);
  const [reason, setReason] = useState("");

  const doEnd = async () => {
    if (!unit) return;
    try { await endContract.mutateAsync({ uid: unit.uid, reason: reason.trim() }); setEndOpen(false); setReason(""); onClose(); toast({ title: "Contract ended", description: "OHC staff can no longer sign in." }); }
    catch (e) { toast({ variant: "destructive", title: "Could not end the contract", description: toProblem(e).message }); }
  };

  return (
    <>
      <Sheet open={Boolean(unit)} onOpenChange={(o) => !o && onClose()}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          {unit && (
            <>
              <SheetHeader>
                <SheetTitle>{unit.name}</SheetTitle>
                <SheetDescription>{TYPE_LABEL[unit.type]}{unit.parent ? ` · under ${unit.parent.name}` : ""} · <span className="font-mono">{unit.uid}</span></SheetDescription>
              </SheetHeader>
              <div className="mt-5 space-y-6">
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <div><dt className="text-muted-foreground">Status</dt><dd>{unit.active ? "Active" : "Inactive"}</dd></div>
                  <div><dt className="text-muted-foreground">Ownership</dt><dd>{unit.ownership === "co_owned" ? "Co-owned" : unit.ownership === "owned" ? "100% owned" : "—"}</dd></div>
                  {unit.brandName && <div><dt className="text-muted-foreground">Brand</dt><dd>{unit.brandName}</dd></div>}
                  {unit.visitPattern && <div><dt className="text-muted-foreground">Visits</dt><dd>{PATTERN_LABEL[unit.visitPattern]}</dd></div>}
                  <div><dt className="text-muted-foreground">Location</dt><dd>{[unit.address.line, unit.address.city].filter(Boolean).join(", ") || "—"}</dd></div>
                  <div><dt className="text-muted-foreground">Phone</dt><dd>{unit.phone || "—"}</dd></div>
                  {unit.services.length > 0 && <div className="col-span-2"><dt className="text-muted-foreground">Services</dt><dd className="mt-1 flex flex-wrap gap-1.5">{unit.services.map((s) => <Badge key={s} variant="outline">{s}</Badge>)}</dd></div>}
                </dl>

                {unit.type === "ohc" && unit.contract && (
                  <section aria-labelledby="ct-h" className="space-y-2 rounded-md border p-3">
                    <div className="flex items-center justify-between"><h3 id="ct-h" className="text-sm font-semibold">Contract with {unit.corporateName ?? "the company"}</h3>
                      <Badge variant="outline" className={`border-transparent ${CONTRACT_TONE[unit.contract.status]}`}>{CONTRACT_LABEL[unit.contract.status]}</Badge></div>
                    <dl className="grid grid-cols-2 gap-2 text-sm">
                      <div><dt className="text-muted-foreground">Reference</dt><dd>{unit.contract.ref || "—"}</dd></div>
                      <div><dt className="text-muted-foreground">Set up by</dt><dd>{unit.contract.initiatedBy === "corporate" ? "The company" : "Us"}</dd></div>
                      <div><dt className="text-muted-foreground">Period</dt><dd>{formatDate(unit.contract.start)} – {formatDate(unit.contract.end)}</dd></div>
                      <div><dt className="text-muted-foreground">Accepted</dt><dd>us {formatDate(unit.contract.acceptedByOperatorAt)} · company {formatDate(unit.contract.acceptedByCorporateAt)}</dd></div>
                    </dl>
                    {unit.contract.status === "proposed" && <p className="text-xs text-muted-foreground">Waiting for the company to accept in its portal. Staff cannot sign in until then.</p>}
                    {unit.contract.status !== "ended" && <Button variant="outline" size="sm" onClick={() => setEndOpen(true)}>End contract</Button>}
                  </section>
                )}

                {unit.type === "ohc" && (
                  <section aria-labelledby="st-h" className="space-y-2">
                    <div className="flex items-center justify-between"><h3 id="st-h" className="text-sm font-semibold">OHC staff</h3>
                      {unit.contract?.status !== "ended" && <Button size="sm" onClick={() => setAddOpen(true)}>Add staff</Button>}</div>
                    {staff.isLoading && <Skeleton className="h-16" />}
                    {staff.isError && <InlineError compact message="Could not load staff." onRetry={() => staff.refetch()} />}
                    {staff.data && staff.data.length === 0 && <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">No staff yet. Add an OHC doctor to enable fitness certificates.</p>}
                    <ul className="divide-y rounded-md border">
                      {(staff.data ?? []).map((s) => (
                        <li key={s.uid} className="flex items-center justify-between gap-3 p-3 text-sm">
                          <span><span className="font-medium">{s.name}</span><span className="block text-xs text-muted-foreground">{s.role === "ohc_doctor" ? "OHC doctor" : "OHC staff"} · {s.email}</span></span>
                          <span className="flex items-center gap-2">
                            {!s.active && <Badge variant="secondary">Removed</Badge>}
                            {s.active && <Button size="sm" variant="outline" onClick={() => removeStaff.mutate({ uid: unit.uid, userUid: s.uid })}>Remove</Button>}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                {unit.type === "ohc" && (
                  <section aria-labelledby="lg-h" className="space-y-2">
                    <h3 id="lg-h" className="text-sm font-semibold">Who accessed this OHC's data</h3>
                    {log.isLoading && <Skeleton className="h-12" />}
                    {log.data && log.data.length === 0 && <p className="text-sm text-muted-foreground">No access recorded yet.</p>}
                    <ul className="space-y-1 text-xs">
                      {(log.data ?? []).slice(0, 15).map((e, i) => <li key={i} className="flex justify-between gap-3 border-b py-1"><span>{e.action.replace(/[._]/g, " ")} · {e.actorKind.replace("_", " ")}</span><span className="text-muted-foreground">{formatDate(e.at)}</span></li>)}
                    </ul>
                  </section>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
      {unit?.type === "ohc" && <AddStaffDialog unit={unit} open={addOpen} onOpenChange={setAddOpen} />}
      <Dialog open={endOpen} onOpenChange={setEndOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>End this contract?</DialogTitle><DialogDescription>The OHC stops working immediately and its staff lose access. Certificates already issued are kept.</DialogDescription></DialogHeader>
          <div className="space-y-1.5"><Label htmlFor="ec-reason">Reason</Label><Textarea id="ec-reason" value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} /></div>
          <DialogFooter><Button variant="outline" onClick={() => setEndOpen(false)}>Keep it</Button><Button variant="destructive" disabled={!reason.trim() || endContract.isPending} onClick={doEnd}>End contract</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
