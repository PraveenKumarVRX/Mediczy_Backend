/**
 * Collection operations: the dispatch / receipt / exceptions board for home and ward collection.
 * Replaces the old home-collection page. Every row comes from the server; there is no seed data, no fallback
 * list and no local copy of task state, so an API failure shows an error rather than invented work.
 */
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AlertTriangle, ClipboardList, Download, Plus } from "lucide-react";
import LabLayout from "@/components/lab/LabLayout";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { InlineError } from "@/components/ui/inline-error";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import api from "@/utils/api";
import { cn } from "@/lib/utils";
import { useBoard, useCollectors, useExceptions, useKpis } from "./collectionApi";
import { CreateTaskDialog } from "./CreateTaskDialog";
import { CollectorsPanel } from "./CollectorsPanel";
import { ExceptionsPanel } from "./ExceptionsPanel";
import { TaskDrawer } from "./TaskDrawer";
import { PriorityBadge, StatusBadge } from "./StatusBadge";
import { STATUS_LABEL, formatDuration, formatWhen, whereOf } from "./format";
import type { CollectionMode, Kpis, TaskStatus } from "./types";

type Tab = CollectionMode | "exceptions" | "collectors";
const TABS: Tab[] = ["home", "ward", "exceptions", "collectors"];
const ALL = "__all__";
const FILTERABLE: TaskStatus[] = ["unassigned", "assigned", "accepted", "en_route", "arrived", "at_bedside", "verified", "consented", "collected", "in_transit", "handed_over", "ward_handoff", "lab_received", "rejected_by_lab", "refused", "cancelled"];

function Kpi({ label, value, tone, hint }: { label: string; value: string | number; tone?: "alert"; hint?: string }) {
  return (
    <div className={cn("rounded-lg border bg-card p-3", tone === "alert" && Number(value) > 0 && "border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/40")}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

function KpiStrip({ kpis, unassigned }: { kpis: Kpis | undefined; unassigned: number | undefined }) {
  if (!kpis) return <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7" aria-busy="true">{Array.from({ length: 7 }).map((_, i) => <Skeleton key={i} className="h-[74px]" />)}</div>;
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
      <Kpi label="Unassigned" value={unassigned ?? kpis.openBeforeCollection} />
      <Kpi label="Overdue" value={kpis.overdue} tone="alert" />
      <Kpi label="In the field" value={kpis.inField} />
      <Kpi label="Collected, not handed over" value={kpis.collected} />
      <Kpi label="Awaiting lab receipt" value={kpis.handedOverPendingReceipt} />
      <Kpi label="Rejected" value={kpis.rejected} hint={`last ${kpis.windowDays} days`} tone="alert" />
      <Kpi label="Median collect → handoff" value={formatDuration(kpis.medianCollectToHandoffSeconds)} hint={`last ${kpis.windowDays} days`} />
    </div>
  );
}

function BoardTab({ mode, onOpenTask, onCreate }: { mode: CollectionMode; onOpenTask: (id: string) => void; onCreate: () => void }) {
  const [status, setStatus] = useState(ALL);
  const [assignedTo, setAssignedTo] = useState(ALL);
  const [overdue, setOverdue] = useState(false);
  const collectors = useCollectors();
  const board = useBoard(mode, { status: status === ALL ? undefined : status, assignedUid: assignedTo === ALL ? undefined : assignedTo, overdue });
  const tasks = useMemo(() => board.data?.pages.flatMap((p) => p.tasks) ?? [], [board.data]);
  const filtered = status !== ALL || assignedTo !== ALL || overdue;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="f-status">Status</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger id="f-status" className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value={ALL}>All statuses</SelectItem>{FILTERABLE.filter((s) => mode === "ward" ? s !== "en_route" && s !== "arrived" && s !== "in_transit" && s !== "handed_over" : s !== "at_bedside" && s !== "ward_handoff").map((s) => <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="f-collector">Collector</Label>
          <Select value={assignedTo} onValueChange={setAssignedTo}>
            <SelectTrigger id="f-collector" className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value={ALL}>Everyone</SelectItem>{(collectors.data?.phlebotomists ?? []).map((c) => <SelectItem key={c.uid} value={c.uid}>{c.displayName}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <label className="flex items-center gap-2 pb-2 text-sm"><Checkbox checked={overdue} onCheckedChange={(v) => setOverdue(v === true)} />Overdue only</label>
        <div className="ml-auto"><Button onClick={onCreate}><Plus className="mr-2 h-4 w-4" />New {mode} collection</Button></div>
      </div>

      {board.isLoading && <div className="space-y-2" aria-busy="true"><Skeleton className="h-12" /><Skeleton className="h-12" /><Skeleton className="h-12" /><Skeleton className="h-12" /></div>}
      {board.isError && <InlineError message="Could not load the board." description="Nothing is shown rather than stale or invented work. Check your connection and retry." onRetry={() => board.refetch()} />}
      {board.data && tasks.length === 0 && (
        <EmptyState icon={ClipboardList} title={filtered ? "No tasks match these filters" : `No ${mode} collections yet`}
          description={filtered ? "Clear a filter to see more." : mode === "home" ? "Create one from a confirmed booking or enter it manually." : "Create one from an admitted patient at a linked hospital."}
          action={filtered ? undefined : { label: `New ${mode} collection`, onClick: onCreate }} />
      )}
      {tasks.length > 0 && (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow><TableHead>Patient</TableHead><TableHead>When</TableHead><TableHead>{mode === "home" ? "Where" : "Ward · bed"}</TableHead><TableHead>Collector</TableHead><TableHead>Status</TableHead><TableHead className="text-right"><span className="sr-only">Open</span></TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {tasks.map((t) => {
                const late = Boolean(t.scheduledEnd && new Date(t.scheduledEnd) < new Date() && ["unassigned", "assigned", "accepted", "en_route", "arrived", "at_bedside", "verified", "consented"].includes(t.status));
                return (
                  <TableRow key={t.id} className="cursor-pointer" onClick={() => onOpenTask(t.id)}>
                    <TableCell>
                      <button type="button" className="text-left font-medium underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={(e) => { e.stopPropagation(); onOpenTask(t.id); }}>{t.patient.name || "Patient"}</button>
                      <span className="block text-xs text-muted-foreground">{[t.patient.age ? `${t.patient.age} y` : null, t.patient.gender].filter(Boolean).join(" · ")}</span>
                    </TableCell>
                    <TableCell className={late ? "text-red-700 dark:text-red-400" : ""}>
                      {late && <AlertTriangle className="mr-1 inline h-3.5 w-3.5" aria-label="Overdue" />}{t.patient.scheduleSlot || formatWhen(t.scheduledStart)}
                    </TableCell>
                    <TableCell className="max-w-[16rem] truncate" title={whereOf(t)}>{whereOf(t)}</TableCell>
                    <TableCell>{t.assigneeName || <span className="text-muted-foreground">Unassigned</span>}</TableCell>
                    <TableCell><div className="flex flex-wrap items-center gap-1.5"><StatusBadge status={t.status} /><PriorityBadge priority={t.priority} />{t.redrawOf && <Badge variant="outline">Redraw</Badge>}</div></TableCell>
                    <TableCell className="text-right"><Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); onOpenTask(t.id); }}>Open</Button></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
      {board.hasNextPage && <div className="flex justify-center"><Button variant="outline" disabled={board.isFetchingNextPage} onClick={() => board.fetchNextPage()}>{board.isFetchingNextPage ? "Loading…" : "Load more"}</Button></div>}
    </div>
  );
}

export function CollectionOpsPage() {
  const [params, setParams] = useSearchParams();
  const tab: Tab = (TABS as string[]).includes(params.get("mode") ?? "") ? (params.get("mode") as Tab) : "home";
  const taskId = params.get("task");
  const [creating, setCreating] = useState(false);
  const kpis = useKpis();
  const exceptions = useExceptions("open");
  const homeBoard = useBoard("home", {});
  const openCount = exceptions.data?.exceptions.length ?? 0;

  const update = (next: Record<string, string | null>) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next)) { if (v === null) p.delete(k); else p.set(k, v); }
    setParams(p, { replace: true });
  };

  const exportCsv = async () => {
    const res = await api.get("/lab/collection/export.csv", { responseType: "blob" });
    const url = URL.createObjectURL(res.data as Blob);
    const a = document.createElement("a");
    a.href = url; a.download = "collection-tasks.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <LabLayout title="Collection Operations" subtitle="Dispatch, track and receive home and ward collections">
      <div className="space-y-5">
        <KpiStrip kpis={kpis.data} unassigned={homeBoard.data?.pages[0]?.summary.unassigned} />
        {kpis.isError && <InlineError compact message="Could not load the summary figures." onRetry={() => kpis.refetch()} />}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <Tabs value={tab} onValueChange={(v) => update({ mode: v, task: null })}>
            <TabsList>
              <TabsTrigger value="home">Home</TabsTrigger>
              <TabsTrigger value="ward">Ward</TabsTrigger>
              <TabsTrigger value="exceptions">Exceptions{openCount > 0 && <Badge variant="destructive" className="ml-2">{openCount}</Badge>}</TabsTrigger>
              <TabsTrigger value="collectors">Collectors</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button variant="outline" size="sm" onClick={exportCsv}><Download className="mr-2 h-4 w-4" />Export CSV</Button>
        </div>

        {(tab === "home" || tab === "ward") && <BoardTab key={tab} mode={tab} onOpenTask={(id) => update({ task: id })} onCreate={() => setCreating(true)} />}
        {tab === "exceptions" && <ExceptionsPanel onOpenTask={(id) => update({ task: id })} />}
        {tab === "collectors" && <CollectorsPanel />}
      </div>

      <CreateTaskDialog mode={tab === "ward" ? "ward" : "home"} open={creating} onOpenChange={setCreating} onCreated={(id) => update({ task: id })} />
      <TaskDrawer taskId={taskId} onClose={() => update({ task: null })} onOpenTask={(id) => update({ task: id })} />
    </LabLayout>
  );
}

export default CollectionOpsPage;
