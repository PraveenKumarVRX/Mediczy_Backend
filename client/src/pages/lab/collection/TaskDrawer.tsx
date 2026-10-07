import { useState } from "react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { InlineError } from "@/components/ui/inline-error";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useCollectionMutations, useTaskDetail, useTimeline } from "./collectionApi";
import { useProblemToast } from "./useProblemToast";
import { AssignDialog } from "./AssignDialog";
import { PriorityBadge, StatusBadge } from "./StatusBadge";
import { STAGES, STATUS_LABEL, formatWhen, isFinal, whereOf } from "./format";
import type { Specimen, TimelineItem } from "./types";

interface Props { taskId: string | null; onClose: () => void; onOpenTask: (id: string) => void }

function Stages({ mode, status }: { mode: "home" | "ward"; status: keyof typeof STATUS_LABEL }) {
  const stages = STAGES[mode];
  const idx = stages.indexOf(status);
  return (
    <ol className="flex flex-wrap gap-1.5" aria-label="Progress">
      {stages.map((s, i) => (
        <li key={s} className={cn("rounded-full px-2.5 py-1 text-xs",
          i < idx || status === "lab_received" ? "bg-green-100 text-green-900 dark:bg-green-950 dark:text-green-200"
            : i === idx ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}
          aria-current={i === idx ? "step" : undefined}>{STATUS_LABEL[s]}</li>
      ))}
    </ol>
  );
}

function describe(item: TimelineItem): string {
  const d = item.data ?? {};
  switch (item.kind) {
    case "task": return item.from ? `${STATUS_LABEL[item.from as keyof typeof STATUS_LABEL] ?? item.from} → ${STATUS_LABEL[item.to as keyof typeof STATUS_LABEL] ?? item.to}` : `Created (${String(d.mode ?? "")})`;
    case "custody": return `${item.barcode ?? "Specimen"} · ${String(item.type).replace(/_/g, " ")}`;
    case "consent": return `Consent ${item.type}${d.method ? ` (${String(d.method)})` : ""}`;
    case "verification": return `Identity ${item.type}${d.method ? ` (${String(d.method).replace(/_/g, " ")})` : ""}`;
    default: return item.type;
  }
}

function ReceiveDialog({ specimen, onClose }: { specimen: Specimen | null; onClose: () => void }) {
  const { receive } = useCollectionMutations();
  const problem = useProblemToast();
  const [rejecting, setRejecting] = useState(false);
  const [condition, setCondition] = useState("");
  const [reason, setReason] = useState("");
  const close = () => { setRejecting(false); setCondition(""); setReason(""); onClose(); };
  const run = async (outcome: "accepted" | "rejected") => {
    if (!specimen) return;
    try { await receive.mutateAsync({ specimenId: specimen.id, outcome, condition: condition.trim() || undefined, reason: reason.trim() || undefined }); close(); }
    catch (e) { problem(e, outcome === "accepted" ? "Could not receive the specimen" : "Could not reject the specimen"); }
  };
  return (
    <Dialog open={Boolean(specimen)} onOpenChange={(o) => !o && close()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Receive specimen {specimen?.barcode}</DialogTitle>
          <DialogDescription>Check the tube against the label, then record its condition. Rejecting needs a reason and raises a redraw for dispatch.</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5"><Label htmlFor="rc-cond">Condition (optional)</Label><Input id="rc-cond" value={condition} maxLength={120} onChange={(e) => setCondition(e.target.value)} placeholder="e.g. acceptable" /></div>
        {rejecting && (
          <div className="space-y-1.5"><Label htmlFor="rc-reason">Rejection reason</Label><Textarea id="rc-reason" value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Haemolysed" /></div>
        )}
        <DialogFooter className="gap-2 sm:justify-between">
          {rejecting
            ? <Button variant="destructive" disabled={!reason.trim() || receive.isPending} onClick={() => run("rejected")}>Confirm rejection</Button>
            : <Button variant="outline" onClick={() => setRejecting(true)}>Reject…</Button>}
          <Button disabled={receive.isPending || rejecting} onClick={() => run("accepted")}>{receive.isPending ? "Saving…" : "Accept specimen"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function TaskDrawer({ taskId, onClose, onOpenTask }: Props) {
  const detail = useTaskDetail(taskId);
  const timeline = useTimeline(taskId);
  const { cancel, redraw } = useCollectionMutations();
  const problem = useProblemToast();
  const [assignOpen, setAssignOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [receiving, setReceiving] = useState<Specimen | null>(null);

  const task = detail.data?.task;
  const can = (c: string) => Boolean(task?.permittedCommands.includes(c));

  const doCancel = async () => {
    if (!task) return;
    try { await cancel.mutateAsync({ id: task.id, version: task.version, reason: cancelReason.trim() }); setCancelOpen(false); setCancelReason(""); }
    catch (e) { problem(e, "Could not cancel"); setCancelOpen(false); }
  };
  const doRedraw = async () => {
    if (!task) return;
    try {
      const r = await redraw.mutateAsync({ id: task.id }) as { redrawTaskId?: string };
      if (r?.redrawTaskId) onOpenTask(r.redrawTaskId);
    } catch (e) { problem(e, "Could not request a redraw"); }
  };

  return (
    <>
      <Sheet open={Boolean(taskId)} onOpenChange={(o) => !o && onClose()}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>{task?.patient.name || "Collection task"}</SheetTitle>
            <SheetDescription>{task ? `${task.mode === "home" ? "Home" : "Ward"} collection · ${whereOf(task)}` : "Loading…"}</SheetDescription>
          </SheetHeader>

          {detail.isLoading && <div className="mt-6 space-y-3" aria-busy="true"><Skeleton className="h-8" /><Skeleton className="h-24" /><Skeleton className="h-40" /></div>}
          {detail.isError && <div className="mt-6"><InlineError message="Could not load this task." onRetry={() => detail.refetch()} /></div>}

          {detail.data && task && (
            <div className="mt-6 space-y-6">
              <section className="space-y-3">
                <div className="flex flex-wrap items-center gap-2"><StatusBadge status={task.status} /><PriorityBadge priority={task.priority} />
                  {task.redrawOf && <Badge variant="outline" className="cursor-pointer" onClick={() => onOpenTask(task.redrawOf!)}>Redraw of an earlier task</Badge>}
                  {task.ward?.isolationRequired && <Badge variant="destructive">Isolation</Badge>}</div>
                <Stages mode={task.mode} status={task.status} />
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <div><dt className="text-muted-foreground">Collector</dt><dd>{task.assigneeName || "Unassigned"}</dd></div>
                  <div><dt className="text-muted-foreground">Window</dt><dd>{task.patient.scheduleSlot || `${formatWhen(task.scheduledStart)} – ${formatWhen(task.scheduledEnd)}`}</dd></div>
                  <div><dt className="text-muted-foreground">Patient</dt><dd>{[task.patient.age ? `${task.patient.age} y` : null, task.patient.gender].filter(Boolean).join(" · ") || "—"}</dd></div>
                  <div><dt className="text-muted-foreground">Source</dt><dd className="capitalize">{task.sourceKind}</dd></div>
                  {task.home?.contactPhone && <div><dt className="text-muted-foreground">Phone</dt><dd>{task.home.contactPhone}</dd></div>}
                  {task.cancelReason && <div className="col-span-2"><dt className="text-muted-foreground">Cancelled because</dt><dd>{task.cancelReason}</dd></div>}
                </dl>
              </section>

              <section className="flex flex-wrap gap-2" aria-label="Actions">
                {can("assign") && <Button onClick={() => setAssignOpen(true)}>Assign collector</Button>}
                {can("reassign") && task.status !== "unassigned" && <Button variant="outline" onClick={() => setAssignOpen(true)}>Reassign</Button>}
                {can("cancel") && <Button variant="outline" onClick={() => setCancelOpen(true)}>Cancel task</Button>}
                {task.status === "rejected_by_lab" && <Button onClick={doRedraw} disabled={redraw.isPending}>{redraw.isPending ? "Requesting…" : "Request redraw"}</Button>}
                {isFinal(task.status) && task.status !== "rejected_by_lab" && <p className="text-sm text-muted-foreground">This task is closed.</p>}
              </section>

              <section aria-labelledby="tests-h" className="space-y-2">
                <h3 id="tests-h" className="text-sm font-semibold">Tests and specimens</h3>
                <ul className="divide-y rounded-md border">
                  {detail.data.tests.map((t) => {
                    const sp = detail.data!.specimens.find((s) => s.id === t.specimenId);
                    return (
                      <li key={t.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                        <span><span className="font-medium">{t.name}</span><span className="block text-xs text-muted-foreground">{t.containerType.replace(/_/g, " ")}{sp ? ` · ${sp.barcode}` : ""}</span></span>
                        <span className="flex items-center gap-2">
                          <Badge variant="outline" className="capitalize">{sp ? sp.status.replace(/_/g, " ") : t.status}</Badge>
                          {sp?.status === "handed_over" && can("receive") && <Button size="sm" onClick={() => setReceiving(sp)}>Receive</Button>}
                        </span>
                      </li>
                    );
                  })}
                  {detail.data.tests.length === 0 && <li className="p-3 text-sm text-muted-foreground">No tests on this task.</li>}
                </ul>
              </section>

              <section aria-labelledby="tl-h" className="space-y-2">
                <h3 id="tl-h" className="text-sm font-semibold">Timeline</h3>
                {timeline.isLoading && <Skeleton className="h-24" />}
                {timeline.isError && <InlineError compact message="Could not load the timeline." onRetry={() => timeline.refetch()} />}
                <ol className="space-y-2 border-l pl-4">
                  {(timeline.data?.items ?? []).map((it, i) => (
                    <li key={`${it.at}-${i}`} className="relative text-sm">
                      <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-primary" aria-hidden />
                      <div>{describe(it)}</div>
                      <div className="text-xs text-muted-foreground">{formatWhen(it.at)} · {it.actor.startsWith("lab:") ? "Lab" : it.actor.startsWith("phleb:") ? "Collector" : it.actor}</div>
                    </li>
                  ))}
                </ol>
              </section>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {task && <AssignDialog key={`${task.id}-${task.version}`} task={task} open={assignOpen} onOpenChange={setAssignOpen} />}
      <ReceiveDialog specimen={receiving} onClose={() => setReceiving(null)} />
      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Cancel this collection?</DialogTitle><DialogDescription>The collector is released and the reason is kept on the timeline. A collected task cannot be cancelled.</DialogDescription></DialogHeader>
          <div className="space-y-1.5"><Label htmlFor="cancel-reason">Reason</Label><Textarea id="cancel-reason" value={cancelReason} maxLength={300} onChange={(e) => setCancelReason(e.target.value)} /></div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOpen(false)}>Keep task</Button>
            <Button variant="destructive" disabled={!cancelReason.trim() || cancel.isPending} onClick={doCancel}>{cancel.isPending ? "Cancelling…" : "Cancel task"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
