import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { InlineError } from "@/components/ui/inline-error";
import { cn } from "@/lib/utils";
import { useCollectionMutations, useCollectors } from "./collectionApi";
import { useProblemToast } from "./useProblemToast";
import type { CollectionTask } from "./types";

interface Props { task: CollectionTask; open: boolean; onOpenChange: (open: boolean) => void }

/**
 * Pick a collector for a task. The list is the server's eligibility computation (active, verified, qualified,
 * enabled for this mode) — the dialog never decides who is eligible, and the server re-checks on submit.
 */
export function AssignDialog({ task, open, onOpenChange }: Props) {
  const reassigning = task.permittedCommands.includes("reassign") && task.status !== "unassigned";
  const collectors = useCollectors();
  const { assign, reassign } = useCollectionMutations();
  const problem = useProblemToast();
  const [selected, setSelected] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const candidates = useMemo(
    () => (collectors.data?.phlebotomists ?? []).filter((c) => c.eligible && (task.mode === "home" ? c.membership.canHome : c.membership.canWard) && c.id !== task.assignedTo),
    [collectors.data, task.mode, task.assignedTo],
  );
  const pending = assign.isPending || reassign.isPending;
  const canSubmit = Boolean(selected) && (!reassigning || reason.trim().length > 0) && !pending;

  const submit = async () => {
    if (!selected) return;
    try {
      if (reassigning) await reassign.mutateAsync({ id: task.id, version: task.version, phlebotomistId: selected, reason: reason.trim() });
      else await assign.mutateAsync({ id: task.id, version: task.version, phlebotomistId: selected });
      setSelected(null); setReason(""); onOpenChange(false);
    } catch (e) {
      problem(e, reassigning ? "Could not reassign" : "Could not assign");
      if ((e as { response?: { status?: number } })?.response?.status === 409) onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{reassigning ? "Reassign collection" : "Assign collector"}</DialogTitle>
          <DialogDescription>
            {task.patient.name || "Patient"} · {task.mode === "home" ? "Home collection" : "Ward collection"}. Only eligible collectors are listed.
          </DialogDescription>
        </DialogHeader>

        {collectors.isLoading && <div className="space-y-2" aria-busy="true"><Skeleton className="h-14" /><Skeleton className="h-14" /></div>}
        {collectors.isError && <InlineError message="Could not load collectors." onRetry={() => collectors.refetch()} />}
        {collectors.data && candidates.length === 0 && (
          <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            No eligible {task.mode} collectors. Add one or re-enable an existing collector under Collectors.
          </p>
        )}
        <ul className="max-h-72 space-y-2 overflow-y-auto" role="radiogroup" aria-label="Eligible collectors">
          {candidates.map((c) => (
            <li key={c.id}>
              <button
                type="button" role="radio" aria-checked={selected === c.id} onClick={() => setSelected(c.id)}
                className={cn("flex w-full items-center justify-between rounded-md border p-3 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  selected === c.id && "border-primary bg-accent")}
              >
                <span>
                  <span className="block font-medium">{c.displayName}</span>
                  <span className="block text-xs text-muted-foreground">{c.phone || c.email}</span>
                </span>
                <span className="text-right text-xs text-muted-foreground">
                  <span className="block">{c.workload.openTasks} open</span>
                  {c.workload.carryingSpecimens > 0 && <span className="block">carrying {c.workload.carryingSpecimens}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>

        {reassigning && (
          <div className="space-y-1.5">
            <Label htmlFor="reassign-reason">Reason for reassigning</Label>
            <Textarea id="reassign-reason" value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Closer to the address" />
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>Cancel</Button>
          <Button onClick={submit} disabled={!canSubmit}>{pending ? "Saving…" : reassigning ? "Reassign" : "Assign"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
