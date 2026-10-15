import { useState } from "react";
import { CheckCircle2, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { InlineError } from "@/components/ui/inline-error";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useCollectionMutations, useIncidents } from "./collectionApi";
import { useProblemToast } from "./useProblemToast";
import { formatWhen } from "./format";
import type { CollectionIncident } from "./types";

export function IncidentsPanel({ onOpenTask }: { onOpenTask: (id: string) => void }) {
  const open = useIncidents("open");
  const { resolveIncident } = useCollectionMutations();
  const problem = useProblemToast();
  const [target, setTarget] = useState<CollectionIncident | null>(null);
  const [resolution, setResolution] = useState("");
  const submit = async () => {
    if (!target) return;
    try { await resolveIncident.mutateAsync({ id: target.id, resolution: resolution.trim() }); setTarget(null); setResolution(""); }
    catch (e) { problem(e, "Could not resolve incident"); }
  };
  if (open.isLoading) return <div className="space-y-2" aria-busy="true"><Skeleton className="h-12" /><Skeleton className="h-12" /><Skeleton className="h-12" /></div>;
  if (open.isError) return <InlineError message="Could not load incidents." onRetry={() => open.refetch()} />;
  const rows = open.data?.incidents ?? [];
  if (!rows.length) return <EmptyState icon={CheckCircle2} title="No open incidents" description="Safety and operational incidents reported by collectors appear here for dispatch review." />;
  return <>
    <div className="overflow-x-auto rounded-md border"><Table><TableHeader><TableRow><TableHead>Type</TableHead><TableHead>Severity</TableHead><TableHead>Description</TableHead><TableHead>Reported</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader><TableBody>
      {rows.map((x) => <TableRow key={x.id}><TableCell className="font-medium"><span className="inline-flex items-center gap-1.5">{["high", "critical"].includes(x.severity) && <TriangleAlert className="h-4 w-4 text-red-600" aria-label="High severity" />}{x.incidentType.replace(/_/g, " ")}</span></TableCell><TableCell><Badge variant={x.severity === "critical" ? "destructive" : "outline"}>{x.severity}</Badge></TableCell><TableCell className="max-w-sm"><span className="block truncate" title={x.description}>{x.description}</span></TableCell><TableCell>{formatWhen(x.occurredAt)}</TableCell><TableCell className="text-right"><div className="flex justify-end gap-2"><Button size="sm" variant="outline" onClick={() => onOpenTask(x.taskId)}>Open task</Button><Button size="sm" onClick={() => setTarget(x)}>Resolve</Button></div></TableCell></TableRow>)}
    </TableBody></Table></div>
    <Dialog open={Boolean(target)} onOpenChange={(o) => !o && setTarget(null)}><DialogContent><DialogHeader><DialogTitle>Resolve collection incident</DialogTitle><DialogDescription>Record the action taken. This remains on the audit trail.</DialogDescription></DialogHeader><div className="space-y-1.5"><Label htmlFor="incident-resolution">Resolution</Label><Textarea id="incident-resolution" value={resolution} maxLength={2000} onChange={(e) => setResolution(e.target.value)} /></div><DialogFooter><Button variant="outline" onClick={() => setTarget(null)}>Cancel</Button><Button disabled={!resolution.trim() || resolveIncident.isPending} onClick={submit}>{resolveIncident.isPending ? "Saving…" : "Mark resolved"}</Button></DialogFooter></DialogContent></Dialog>
  </>;
}
