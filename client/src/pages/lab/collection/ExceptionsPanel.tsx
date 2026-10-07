import { useState } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { InlineError } from "@/components/ui/inline-error";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useCollectionMutations, useExceptions } from "./collectionApi";
import { useProblemToast } from "./useProblemToast";
import { EXCEPTION_LABEL, formatWhen } from "./format";
import type { CollectionException } from "./types";

export function ExceptionsPanel({ onOpenTask }: { onOpenTask: (id: string) => void }) {
  const open = useExceptions("open");
  const { resolveException } = useCollectionMutations();
  const problem = useProblemToast();
  const [target, setTarget] = useState<CollectionException | null>(null);
  const [resolution, setResolution] = useState("");

  const submit = async () => {
    if (!target) return;
    try { await resolveException.mutateAsync({ id: target.id, resolution: resolution.trim() }); setTarget(null); setResolution(""); }
    catch (e) { problem(e, "Could not resolve"); }
  };

  if (open.isLoading) return <div className="space-y-2" aria-busy="true"><Skeleton className="h-12" /><Skeleton className="h-12" /><Skeleton className="h-12" /></div>;
  if (open.isError) return <InlineError message="Could not load exceptions." onRetry={() => open.refetch()} />;
  const rows = open.data?.exceptions ?? [];
  if (rows.length === 0) return <EmptyState icon={CheckCircle2} title="No open exceptions" description="Identity mismatches, refusals, declines and rejected specimens appear here until dispatch resolves them." />;

  return (
    <>
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader><TableRow><TableHead>Issue</TableHead><TableHead>Detail</TableHead><TableHead>Owner</TableHead><TableHead>Due</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
          <TableBody>
            {rows.map((x) => (
              <TableRow key={x.id}>
                <TableCell className="font-medium"><span className="inline-flex items-center gap-1.5">{x.overdue && <AlertTriangle className="h-4 w-4 text-red-600" aria-label="Overdue" />}{EXCEPTION_LABEL[x.code] ?? x.code}</span></TableCell>
                <TableCell className="max-w-xs"><span className="block truncate" title={x.reason ?? ""}>{x.reason || "—"}</span>{x.nextAction && <span className="block text-xs text-muted-foreground">{x.nextAction}</span>}</TableCell>
                <TableCell><Badge variant="outline">{x.ownerRole === "dispatch" ? "Dispatch" : "Lab"}</Badge></TableCell>
                <TableCell className={x.overdue ? "text-red-700 dark:text-red-400" : ""}>{formatWhen(x.dueAt)}</TableCell>
                <TableCell className="text-right"><div className="flex justify-end gap-2">
                  <Button size="sm" variant="outline" onClick={() => onOpenTask(x.taskId)}>Open task</Button>
                  <Button size="sm" onClick={() => setTarget(x)}>Resolve</Button>
                </div></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <Dialog open={Boolean(target)} onOpenChange={(o) => !o && setTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Resolve: {target ? EXCEPTION_LABEL[target.code] ?? target.code : ""}</DialogTitle><DialogDescription>Say what was done. This is kept on the audit trail.</DialogDescription></DialogHeader>
          <div className="space-y-1.5"><Label htmlFor="ex-res">Resolution</Label><Textarea id="ex-res" value={resolution} maxLength={300} onChange={(e) => setResolution(e.target.value)} /></div>
          <DialogFooter><Button variant="outline" onClick={() => setTarget(null)}>Cancel</Button><Button disabled={!resolution.trim() || resolveException.isPending} onClick={submit}>{resolveException.isPending ? "Saving…" : "Mark resolved"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
