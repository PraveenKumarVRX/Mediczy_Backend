/**
 * /lab/phlebotomist — a collector's own worklist and task workflow, the web counterpart of the
 * native app (docs/api/PHLEBOTOMY_MOBILE_API_INTEGRATION.md). The server drives the workflow: visible
 * actions always come from the selected task's own `permittedCommands` (see phleboPanels.tsx).
 */
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Home, LogOut, Syringe, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { InlineError } from "@/components/ui/inline-error";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { StatusBadge, PriorityBadge } from "../collection/StatusBadge";
import { TaskActions } from "./phleboPanels";
import type { Me, Task, TaskDetail } from "./types";
import {
  COMMAND_ENDPOINT, PhleboError, changePassword, command as sendCommand, getMe, getTask, getWorklist, hasSession, logout,
} from "./phleboClient";

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString(undefined, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function ChangePassword({ onDone }: { onDone: () => void }) {
  const { toast } = useToast();
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true);
    try { await changePassword(cur, next); toast({ title: "Password changed", description: "Sign in again with your new password." }); onDone(); }
    catch (err) { toast({ variant: "destructive", title: "Could not change the password", description: (err as PhleboError).message }); }
    finally { setBusy(false); }
  };
  return (
    <main className="grid min-h-screen place-items-center bg-background px-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-xl border bg-card p-6" aria-labelledby="cp-h">
        <h1 id="cp-h" className="text-lg font-semibold">Choose a new password</h1>
        <p className="text-sm text-muted-foreground">You signed in with a temporary password. Choose your own before you continue: at least 10 characters with a letter and a digit.</p>
        <div className="space-y-1.5"><Label htmlFor="cp-cur">Temporary password</Label><Input id="cp-cur" type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} /></div>
        <div className="space-y-1.5"><Label htmlFor="cp-new">New password</Label><Input id="cp-new" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} /></div>
        <Button type="submit" className="w-full" disabled={busy || !cur || next.length < 10}>{busy ? "Saving…" : "Change password"}</Button>
      </form>
    </main>
  );
}

function TaskCard({ task, selected, onSelect }: { task: Task; selected: boolean; onSelect: () => void }) {
  return (
    <button type="button" onClick={onSelect} className={`w-full rounded-lg border p-3 text-left transition-colors ${selected ? "border-primary bg-primary/5" : "bg-card hover:bg-muted/50"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium">{task.patient.name ?? "Patient"}{task.patient.age != null ? `, ${task.patient.age}${task.patient.gender ? ` · ${task.patient.gender[0].toUpperCase()}` : ""}` : ""}</span>
        <span className="flex items-center gap-1.5">{task.mode === "ward" ? <Building2 className="size-3.5 text-muted-foreground" aria-hidden /> : <Home className="size-3.5 text-muted-foreground" aria-hidden />}<StatusBadge status={task.status} /><PriorityBadge priority={task.priority} /></span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {task.mode === "ward" ? [task.ward?.wardName, task.ward?.bedLabel].filter(Boolean).join(" · ") : [task.home?.address?.line1, task.home?.address?.city].filter(Boolean).join(", ")}
        {task.scheduledStart ? ` · ${formatDateTime(task.scheduledStart)}` : ""}
      </p>
    </button>
  );
}

export default function PhlebotomistDashboard() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<PhleboError | null>(null);
  const [mode, setMode] = useState<"all" | "home" | "ward">("all");
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [listError, setListError] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [detailError, setDetailError] = useState(false);

  const load = useCallback(async () => { try { setMe(await getMe()); setError(null); } catch (e) { setError(e as PhleboError); } }, []);
  useEffect(() => { if (!hasSession()) { navigate("/lab/phlebotomist/login", { replace: true }); return; } load(); }, [load, navigate]);
  useEffect(() => { if (error && (error.status === 401 || error.code === "account_unavailable")) navigate("/lab/phlebotomist/login", { replace: true }); }, [error, navigate]);

  const loadWorklist = useCallback(async () => {
    try { const r = await getWorklist({ mode: mode === "all" ? undefined : mode }); setTasks(r.tasks); setNextCursor(r.nextCursor); setListError(false); }
    catch { setListError(true); }
  }, [mode]);
  useEffect(() => { if (me && !me.worker.mustChangePassword) loadWorklist(); }, [me, loadWorklist]);

  const loadMore = async () => {
    if (!nextCursor) return;
    try { const r = await getWorklist({ mode: mode === "all" ? undefined : mode, cursor: nextCursor }); setTasks((t) => [...(t ?? []), ...r.tasks]); setNextCursor(r.nextCursor); }
    catch { toast({ variant: "destructive", title: "Could not load more tasks" }); }
  };

  const loadTask = useCallback(async (id: string) => {
    try { setDetail(await getTask(id)); setDetailError(false); }
    catch { setDetailError(true); }
  }, []);
  const selectTask = (id: string) => { setSelectedId(id); loadTask(id); };
  useEffect(() => { if (selectedId) loadTask(selectedId); }, [selectedId, loadTask]);

  const onCommand = async (cmd: string, body: Record<string, unknown> = {}) => {
    if (!detail) return;
    const idempotencyKey = crypto.randomUUID();
    await sendCommand(detail.task.id, COMMAND_ENDPOINT[cmd], { ...body, expectedVersion: detail.task.version }, idempotencyKey);
    await loadTask(detail.task.id);
    loadWorklist();
  };

  const signOut = async () => { await logout(); navigate("/lab/phlebotomist/login", { replace: true }); };

  if (error?.code === "password_change_required" || me?.worker.mustChangePassword) return <ChangePassword onDone={() => navigate("/lab/phlebotomist/login", { replace: true })} />;
  if (error && error.status !== 401 && error.code !== "account_unavailable") return <main className="p-6"><InlineError message="Could not load your worklist." onRetry={load} /></main>;
  if (!me) return <main className="p-6" aria-busy="true"><Skeleton className="h-16" /></main>;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-lg bg-primary text-primary-foreground"><Syringe className="size-4" aria-hidden /></span>
            <div><p className="font-semibold leading-tight">Collection Worklist</p><p className="text-xs text-muted-foreground">{me.worker.displayName}</p></div>
          </div>
          <Button variant="outline" size="sm" onClick={signOut}><LogOut className="mr-2 size-4" aria-hidden />Sign out</Button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl gap-4 px-4 py-5 md:grid md:grid-cols-[320px_1fr]">
        <section className="space-y-3" aria-label="Worklist">
          <Tabs value={mode} onValueChange={(v) => setMode(v as typeof mode)}>
            <TabsList>
              {me.capabilities.home && <TabsTrigger value="home">Home</TabsTrigger>}
              {me.capabilities.ward && <TabsTrigger value="ward">Ward</TabsTrigger>}
              <TabsTrigger value="all">All</TabsTrigger>
            </TabsList>
          </Tabs>
          {listError && <InlineError message="Could not load your worklist." onRetry={loadWorklist} />}
          {tasks === null && !listError && <Skeleton className="h-24" />}
          {tasks?.length === 0 && <EmptyState icon={Syringe} title="Nothing assigned" description="New tasks dispatch assigns to you will appear here." />}
          {tasks && tasks.length > 0 && (
            <div className="space-y-2">
              {tasks.map((t) => <TaskCard key={t.id} task={t} selected={t.id === selectedId} onSelect={() => selectTask(t.id)} />)}
              {nextCursor && <Button variant="outline" size="sm" className="w-full" onClick={loadMore}>Load more</Button>}
            </div>
          )}
        </section>

        <section aria-label="Task detail" className="mt-4 md:mt-0">
          {!selectedId && <EmptyState icon={Syringe} title="Select a task" description="Choose a task from your worklist to see its details and next steps." />}
          {selectedId && detailError && <InlineError message="Could not load this task." onRetry={() => loadTask(selectedId)} />}
          {selectedId && !detailError && !detail && <Skeleton className="h-40" />}
          {detail && (
            <div className="space-y-4 rounded-lg border bg-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-base font-semibold">{detail.task.patient.name ?? "Patient"}</h2>
                  <p className="text-xs text-muted-foreground">{detail.task.patient.age != null ? `${detail.task.patient.age} yrs` : ""}{detail.task.patient.gender ? ` · ${detail.task.patient.gender}` : ""}</p>
                </div>
                <span className="flex items-center gap-1.5"><StatusBadge status={detail.task.status} /><PriorityBadge priority={detail.task.priority} /></span>
              </div>

              {detail.task.mode === "home" ? (
                <div className="text-sm">
                  <p className="text-muted-foreground">{[detail.task.home?.address?.line1, detail.task.home?.address?.line2, detail.task.home?.address?.city, detail.task.home?.address?.pincode].filter(Boolean).join(", ")}</p>
                  {detail.task.home?.contactPhone && <p className="text-muted-foreground">Contact: {detail.task.home.contactPhone}</p>}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">
                  {[detail.task.ward?.wardName, detail.task.ward?.bedLabel, detail.task.ward?.roundLabel].filter(Boolean).join(" · ")}
                  {detail.task.ward?.isolationRequired && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-200">Isolation precautions</span>}
                </div>
              )}

              <div>
                <h3 className="text-sm font-medium">Tests</h3>
                <ul className="mt-1 divide-y rounded-md border text-sm">
                  {detail.tests.map((t) => (
                    <li key={t.id} className="flex items-center justify-between p-2">
                      <span>{t.name}{t.code ? ` (${t.code})` : ""}<span className="block text-xs text-muted-foreground">{t.containerType.replaceAll("_", " ")}</span></span>
                      <span className="text-xs font-medium uppercase text-muted-foreground">{t.status}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {detail.specimens.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium">Specimens</h3>
                  <ul className="mt-1 space-y-1 text-sm text-muted-foreground">{detail.specimens.map((s) => <li key={s.id}>{s.barcode} · {s.containerType.replaceAll("_", " ")} · {s.status}</li>)}</ul>
                </div>
              )}

              <div className="border-t pt-3">
                <h3 className="mb-2 text-sm font-medium">Next step</h3>
                <TaskActions task={detail.task} tests={detail.tests} onCommand={onCommand} />
              </div>
              <p className="text-xs text-muted-foreground">Last updated {formatDateTime(me.serverTime)}</p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
