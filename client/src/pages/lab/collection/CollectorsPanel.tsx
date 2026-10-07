import { useState } from "react";
import { UserPlus, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { InlineError } from "@/components/ui/inline-error";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useCollectionMutations, useCollectors } from "./collectionApi";
import { useProblemToast } from "./useProblemToast";
import { formatWhen } from "./format";
import type { Collector } from "./types";

const PASSWORD_HINT = "At least 10 characters, with a letter and a digit. The collector must change it at first sign-in.";

function AddCollectorDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { createCollector } = useCollectionMutations();
  const problem = useProblemToast();
  const [f, setF] = useState({ displayName: "", email: "", phone: "", qualification: "", qualificationExpires: "", password: "", canHome: true, canWard: false });
  const set = (k: keyof typeof f, v: string | boolean) => setF((s) => ({ ...s, [k]: v }));
  const valid = f.displayName.trim().length >= 2 && /^[^@\s]+@[^@\s]+$/.test(f.email.trim()) && f.password.length >= 10 && (f.canHome || f.canWard);
  const submit = async () => {
    try {
      await createCollector.mutateAsync({
        displayName: f.displayName.trim(), email: f.email.trim(), phone: f.phone.trim() || undefined, qualification: f.qualification.trim() || undefined,
        qualificationExpires: f.qualificationExpires ? new Date(f.qualificationExpires).toISOString() : undefined, password: f.password, canHome: f.canHome, canWard: f.canWard,
      });
      setF({ displayName: "", email: "", phone: "", qualification: "", qualificationExpires: "", password: "", canHome: true, canWard: false });
      onOpenChange(false);
    } catch (e) { problem(e, "Could not add the collector"); }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Add a collector</DialogTitle><DialogDescription>By adding them you confirm you have verified their identity and qualification.</DialogDescription></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="co-name">Full name</Label><Input id="co-name" value={f.displayName} maxLength={120} onChange={(e) => set("displayName", e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="co-email">Email (sign-in)</Label><Input id="co-email" type="email" autoComplete="off" value={f.email} onChange={(e) => set("email", e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="co-phone">Phone</Label><Input id="co-phone" inputMode="tel" value={f.phone} maxLength={20} onChange={(e) => set("phone", e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="co-qual">Qualification</Label><Input id="co-qual" value={f.qualification} maxLength={120} onChange={(e) => set("qualification", e.target.value)} placeholder="e.g. DMLT" /></div>
          <div className="space-y-1.5"><Label htmlFor="co-exp">Qualification valid until</Label><Input id="co-exp" type="date" value={f.qualificationExpires} onChange={(e) => set("qualificationExpires", e.target.value)} /></div>
          <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="co-pw">Temporary password</Label><Input id="co-pw" type="password" autoComplete="new-password" value={f.password} maxLength={128} onChange={(e) => set("password", e.target.value)} /><p className="text-xs text-muted-foreground">{PASSWORD_HINT}</p></div>
          <label className="flex items-center gap-2 text-sm"><Checkbox checked={f.canHome} onCheckedChange={(v) => set("canHome", v === true)} />Home collection</label>
          <label className="flex items-center gap-2 text-sm"><Checkbox checked={f.canWard} onCheckedChange={(v) => set("canWard", v === true)} />Ward collection</label>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button disabled={!valid || createCollector.isPending} onClick={submit}>{createCollector.isPending ? "Adding…" : "Add collector"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ResetPasswordDialog({ collector, onClose }: { collector: Collector | null; onClose: () => void }) {
  const { resetPassword } = useCollectionMutations();
  const problem = useProblemToast();
  const [pw, setPw] = useState("");
  const submit = async () => {
    if (!collector) return;
    try { await resetPassword.mutateAsync({ id: collector.uid, password: pw }); setPw(""); onClose(); }
    catch (e) { problem(e, "Could not reset the password"); }
  };
  return (
    <Dialog open={Boolean(collector)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Reset password for {collector?.displayName}</DialogTitle><DialogDescription>All their sessions are signed out. {PASSWORD_HINT}</DialogDescription></DialogHeader>
        <div className="space-y-1.5"><Label htmlFor="rp-pw">New temporary password</Label><Input id="rp-pw" type="password" autoComplete="new-password" value={pw} maxLength={128} onChange={(e) => setPw(e.target.value)} /></div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button disabled={pw.length < 10 || resetPassword.isPending} onClick={submit}>{resetPassword.isPending ? "Saving…" : "Reset password"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CollectorsPanel() {
  const list = useCollectors();
  const { setMembership } = useCollectionMutations();
  const problem = useProblemToast();
  const [adding, setAdding] = useState(false);
  const [resetting, setResetting] = useState<Collector | null>(null);

  const toggle = async (c: Collector) => {
    try { await setMembership.mutateAsync({ id: c.uid, status: c.membership.status === "active" ? "suspended" : "active" }); }
    catch (e) { problem(e, "Could not update the collector"); }
  };

  const rows = list.data?.phlebotomists ?? [];
  return (
    <div className="space-y-4">
      <div className="flex justify-end"><Button onClick={() => setAdding(true)}><UserPlus className="mr-2 h-4 w-4" />Add collector</Button></div>
      {list.isLoading && <div className="space-y-2" aria-busy="true"><Skeleton className="h-12" /><Skeleton className="h-12" /></div>}
      {list.isError && <InlineError message="Could not load collectors." onRetry={() => list.refetch()} />}
      {list.data && rows.length === 0 && <EmptyState icon={Users} title="No collectors yet" description="Add the phlebotomists who collect for this lab. Each signs in to the phlebotomist app with their own account." action={{ label: "Add collector", onClick: () => setAdding(true) }} />}
      {rows.length > 0 && (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader><TableRow><TableHead>Collector</TableHead><TableHead>Covers</TableHead><TableHead>Qualification</TableHead><TableHead>Workload</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
            <TableBody>
              {rows.map((c) => (
                <TableRow key={c.uid}>
                  <TableCell><span className="block font-medium">{c.displayName}</span><span className="block text-xs text-muted-foreground">{c.email}</span><span className="block font-mono text-xs text-muted-foreground">{c.uid}</span></TableCell>
                  <TableCell>{[c.membership.canHome && "Home", c.membership.canWard && "Ward"].filter(Boolean).join(" + ")}</TableCell>
                  <TableCell>{c.qualification || "—"}{c.qualificationExpires && <span className="block text-xs text-muted-foreground">until {new Date(c.qualificationExpires).toLocaleDateString()}</span>}</TableCell>
                  <TableCell>{c.workload.openTasks} open{c.workload.carryingSpecimens > 0 && `, carrying ${c.workload.carryingSpecimens}`}<span className="block text-xs text-muted-foreground">last sign-in {formatWhen(c.lastLoginAt)}</span></TableCell>
                  <TableCell>
                    <Badge variant={c.eligible ? "default" : "secondary"}>{c.eligible ? "Eligible" : c.membership.status !== "active" ? "Suspended" : "Not eligible"}</Badge>
                    {c.mustChangePassword && <span className="block text-xs text-muted-foreground">temporary password</span>}
                  </TableCell>
                  <TableCell className="text-right"><div className="flex justify-end gap-2">
                    <Button size="sm" variant="outline" onClick={() => setResetting(c)}>Reset password</Button>
                    <Button size="sm" variant={c.membership.status === "active" ? "outline" : "default"} disabled={setMembership.isPending} onClick={() => toggle(c)}>{c.membership.status === "active" ? "Suspend" : "Reinstate"}</Button>
                  </div></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <AddCollectorDialog open={adding} onOpenChange={setAdding} />
      <ResetPasswordDialog collector={resetting} onClose={() => setResetting(null)} />
    </div>
  );
}
