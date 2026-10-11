/**
 * /lab/phlebotomist — a collector's own worklist and task workflow, the web counterpart of the
 * native app (docs/api/PHLEBOTOMY_MOBILE_API_INTEGRATION.md). The server drives the workflow: visible
 * actions always come from the selected task's own `permittedCommands` (see phleboPanels.tsx).
 *
 * Visual language follows the design reference (phlebotomy-app-development.zip) — the same mobile-card
 * aesthetic, restyled onto real data and real commands rather than the reference's local useState mockup.
 * Colours are literal, matching the reference file's own values, deliberately not routed through the
 * shared admin theme since this is a standalone mobile-style surface, not part of the lab admin console.
 */
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bell, BedDouble, Building2, Check, ChevronLeft, CircleCheck, ClipboardCheck, Clock3, FileText,
  Home, IdCard, LogOut, MapPin, Navigation, Phone, ShieldCheck, Syringe, TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { TaskActions } from "./phleboPanels";
import type { Me, Task, TaskDetail, TaskStatus, Priority } from "./types";
import {
  COMMAND_ENDPOINT, PhleboError, changePassword, command as sendCommand, getMe, getTask, getWorklist, hasSession, logout,
} from "./phleboClient";

const SHELL = "min-h-screen bg-[#f4f7f8] text-[#15252d]";
const FRAME = "mx-auto flex min-h-screen max-w-md flex-col bg-[#f4f7f8] shadow-[0_0_48px_rgba(22,45,55,0.08)]";
const CARD = "rounded-[24px] border border-[#dce9e7] bg-white p-4 shadow-[0_8px_24px_rgba(30,75,77,0.06)]";

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString(undefined, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

const CLOSED_BAD = new Set<TaskStatus>(["refused", "cancelled", "rejected_by_lab"]);
const CLOSED_GOOD = new Set<TaskStatus>(["lab_received"]);

function statusTone(status: TaskStatus) {
  if (CLOSED_BAD.has(status)) return "bg-[#fff1ed] text-[#c75e43]";
  if (CLOSED_GOOD.has(status) || status === "handed_over" || status === "ward_handoff") return "bg-[#dff2eb] text-[#0e6f69]";
  if (status === "assigned") return "bg-[#fff2dc] text-[#a36b21]";
  return "bg-[#e8f5f2] text-[#0e6f69]";
}
const PRIORITY_TONE: Record<Priority, string> = {
  stat: "bg-[#fff1ed] text-[#c75e43]", urgent: "bg-[#fff2dc] text-[#a36b21]", routine: "bg-[#f1f5f5] text-[#5f7378]",
};
const CONTAINER_DOT: Record<string, string> = {
  edta: "bg-[#a581c2]", serum: "bg-[#d9ad54]", plasma_heparin: "bg-[#d9ad54]", citrate: "bg-[#7fa7c9]",
};
const TEST_STATUS_LABEL: Record<string, string> = {
  required: "Needs scan", scanned: "Linked", collected: "Collected", received: "Received by lab", rejected: "Rejected",
};

type StepKey = "accept" | "travel" | "arrive" | "bedside" | "verify" | "consent" | "collect" | "transit" | "handoff";
const HOME_STEPS: { key: StepKey; label: string; statuses: TaskStatus[] }[] = [
  { key: "accept", label: "Accept", statuses: ["assigned", "accepted"] },
  { key: "travel", label: "Travel", statuses: ["en_route"] },
  { key: "arrive", label: "Arrive", statuses: ["arrived"] },
  { key: "verify", label: "Verify", statuses: ["verified"] },
  { key: "consent", label: "Consent", statuses: ["consented"] },
  { key: "collect", label: "Collect", statuses: ["collected"] },
  { key: "transit", label: "Transit", statuses: ["in_transit"] },
  { key: "handoff", label: "Handoff", statuses: ["handed_over", "lab_received"] },
];
const WARD_STEPS: { key: StepKey; label: string; statuses: TaskStatus[] }[] = [
  { key: "accept", label: "Accept", statuses: ["assigned", "accepted"] },
  { key: "bedside", label: "Bedside", statuses: ["at_bedside"] },
  { key: "verify", label: "Verify", statuses: ["verified"] },
  { key: "consent", label: "Consent", statuses: ["consented"] },
  { key: "collect", label: "Collect", statuses: ["collected"] },
  { key: "handoff", label: "Handoff", statuses: ["ward_handoff", "lab_received"] },
];
const STEP_INFO: Record<StepKey, { icon: typeof Navigation; title: string; description: string }> = {
  accept: { icon: ClipboardCheck, title: "Accept this task", description: "Review the assignment before you head out." },
  travel: { icon: Navigation, title: "On the way", description: "Mark yourself departed, then confirm arrival at the address." },
  arrive: { icon: MapPin, title: "Confirm arrival", description: "Evidence is bounded — no raw location is ever sent." },
  bedside: { icon: BedDouble, title: "At the bedside", description: "Confirm the ward and bed before verifying the patient." },
  verify: { icon: IdCard, title: "Verify patient identity", description: "Check two identifiers before anything else." },
  consent: { icon: FileText, title: "Confirm consent", description: "Record the patient's consent to proceed." },
  collect: { icon: CircleCheck, title: "Collect & label samples", description: "Every tube must be scanned before collection can be marked complete." },
  transit: { icon: Navigation, title: "In transit", description: "Hand off to the lab once you arrive." },
  handoff: { icon: ClipboardCheck, title: "Handoff & custody", description: "Log who received the specimens." },
};

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
    <main className={`grid ${SHELL} place-items-center px-4`}>
      <form onSubmit={submit} className={`w-full max-w-sm space-y-4 p-6 ${CARD}`} aria-labelledby="cp-h">
        <h1 id="cp-h" className="text-lg font-semibold text-[#17333a]">Choose a new password</h1>
        <p className="text-sm text-[#71868b]">You signed in with a temporary password. Choose your own before you continue: at least 10 characters with a letter and a digit.</p>
        <div className="space-y-1.5"><Label htmlFor="cp-cur">Temporary password</Label><Input id="cp-cur" type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} /></div>
        <div className="space-y-1.5"><Label htmlFor="cp-new">New password</Label><Input id="cp-new" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} /></div>
        <button type="submit" disabled={busy || !cur || next.length < 10} className="flex h-12 w-full items-center justify-center rounded-2xl bg-[#0e6f69] text-sm font-semibold text-white shadow-[0_5px_12px_rgba(14,111,105,0.2)] transition hover:bg-[#0b5e59] disabled:cursor-not-allowed disabled:bg-[#b4c8c9]">{busy ? "Saving…" : "Change password"}</button>
      </form>
    </main>
  );
}

function TaskCard({ task, onSelect }: { task: Task; onSelect: () => void }) {
  return (
    <button type="button" onClick={onSelect} className={`w-full text-left transition active:scale-[0.99] ${CARD}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${statusTone(task.status)}`}>{task.status.replaceAll("_", " ")}</span>
            <span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${PRIORITY_TONE[task.priority]}`}>{task.priority}</span>
          </div>
          <h2 className="mt-2 text-base font-semibold text-[#17333a]">{task.patient.name ?? "Patient"}</h2>
          <p className="mt-1 text-xs text-[#71868b]">{task.patient.age != null ? `${task.patient.age} yrs` : ""}{task.patient.gender ? ` · ${task.patient.gender}` : ""}</p>
        </div>
        {task.mode === "ward" ? <Building2 className="size-5 text-[#0e6f69]" aria-hidden /> : <Home className="size-5 text-[#0e6f69]" aria-hidden />}
      </div>
      <div className="mt-3 flex items-center gap-2 rounded-xl bg-[#f7faf9] p-3 text-xs text-[#516b71]">
        <MapPin className="size-4 shrink-0 text-[#0e6f69]" aria-hidden />
        <span className="flex-1 truncate">{task.mode === "ward" ? [task.ward?.wardName, task.ward?.bedLabel].filter(Boolean).join(" · ") || "Ward" : [task.home?.address?.line1, task.home?.address?.city].filter(Boolean).join(", ") || "Home visit"}</span>
      </div>
      {task.scheduledStart && <div className="mt-2 flex items-center gap-2 text-xs text-[#698086]"><Clock3 className="size-3.5" aria-hidden />{formatDateTime(task.scheduledStart)}</div>}
    </button>
  );
}

function StepBar({ steps, currentIndex }: { steps: { key: StepKey; label: string }[]; currentIndex: number }) {
  return (
    <div className="flex items-start justify-between gap-1 overflow-x-auto px-1 pb-1">
      {steps.map((step, index) => (
        <div key={step.key} className="flex flex-1 flex-col items-center gap-1.5">
          <div className={`grid size-7 shrink-0 place-items-center rounded-full text-[11px] font-semibold ${index < currentIndex ? "bg-[#0e6f69] text-white" : index === currentIndex ? "border-2 border-[#0e6f69] bg-white text-[#0e6f69]" : "bg-[#e3ebec] text-[#809399]"}`}>
            {index < currentIndex ? <Check className="size-3.5" /> : index + 1}
          </div>
          <span className={`text-center text-[9px] font-semibold leading-tight ${index === currentIndex ? "text-[#0e6f69]" : "text-[#84969b]"}`}>{step.label}</span>
        </div>
      ))}
    </div>
  );
}

function TaskDetailView({ detail, onBack, onCommand, serverTime }: {
  detail: TaskDetail; onBack: () => void; onCommand: (cmd: string, body?: Record<string, unknown>) => Promise<void>; serverTime: string;
}) {
  const { task, tests, specimens } = detail;
  const steps = task.mode === "ward" ? WARD_STEPS : HOME_STEPS;
  const currentIndex = steps.findIndex((s) => s.statuses.includes(task.status));
  const info = currentIndex >= 0 ? STEP_INFO[steps[currentIndex].key] : null;
  const addressStr = task.mode === "home" ? [task.home?.address?.line1, task.home?.address?.line2, task.home?.address?.city, task.home?.address?.pincode].filter(Boolean).join(", ") : "";

  return (
    <div className="flex-1 px-5 pb-10 pt-5">
      <button type="button" onClick={onBack} className="mb-4 flex items-center gap-1 text-sm font-semibold text-[#0e6f69]"><ChevronLeft className="size-4" aria-hidden />Back to worklist</button>

      {CLOSED_BAD.has(task.status) && (
        <section className="mb-4 flex items-center gap-3 rounded-2xl border border-[#f0ddd5] bg-[#fff8f5] p-4">
          <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#fde9e1] text-[#c75e43]"><TriangleAlert className="size-[18px]" /></div>
          <div><p className="text-xs font-semibold text-[#754b3c]">This task is {task.status.replaceAll("_", " ")}</p><p className="mt-0.5 text-[11px] leading-4 text-[#926e62]">No further action is possible here — contact dispatch if this is unexpected.</p></div>
        </section>
      )}

      <section className={CARD}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="grid size-12 place-items-center rounded-2xl bg-[#e8f5f2] text-[#0e6f69]"><IdCard className="size-5" /></div>
            <div>
              <h2 className="font-semibold text-[#17333a]">{task.patient.name ?? "Patient"}</h2>
              <p className="mt-1 text-xs text-[#71868b]">{task.patient.age != null ? `${task.patient.age} years` : ""}{task.patient.gender ? ` · ${task.patient.gender}` : ""} · {task.mode === "ward" ? "Ward" : "Home visit"}</p>
            </div>
          </div>
          <span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase ${PRIORITY_TONE[task.priority]}`}>{task.priority}</span>
        </div>

        {task.mode === "home" ? (
          <>
            {addressStr && <div className="mt-4 flex items-center gap-2 rounded-xl bg-[#f8faf9] px-3 py-2.5 text-xs text-[#4c666d]"><MapPin className="size-4 shrink-0 text-[#0e6f69]" />{addressStr}</div>}
            <div className="mt-3 flex items-center justify-between gap-2 border-t border-[#edf1f1] pt-3">
              <div className="flex items-center gap-2 text-xs text-[#698086]"><Clock3 className="size-4" />{task.scheduledStart ? formatDateTime(task.scheduledStart) : "No fixed window"}</div>
              <div className="flex items-center gap-3">
                {task.home?.contactPhone && <a href={`tel:${task.home.contactPhone}`} className="flex items-center gap-1 text-xs font-semibold text-[#0e6f69]"><Phone className="size-3.5" />Call</a>}
                {addressStr && <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addressStr)}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs font-semibold text-[#0e6f69]"><Navigation className="size-3.5" />Navigate</a>}
              </div>
            </div>
          </>
        ) : (
          <div className="mt-4 rounded-xl bg-[#f8faf9] px-3 py-2.5 text-xs text-[#4c666d]">
            <div className="flex items-center gap-2"><Building2 className="size-4 shrink-0 text-[#0e6f69]" />{[task.ward?.wardName, task.ward?.bedLabel, task.ward?.roundLabel].filter(Boolean).join(" · ") || "Ward"}</div>
            {task.ward?.isolationRequired && <span className="mt-2 inline-block rounded-full bg-[#fff2dc] px-2 py-1 text-[10px] font-bold uppercase text-[#a36b21]">Isolation precautions</span>}
          </div>
        )}
      </section>

      {currentIndex >= 0 && (
        <section className="mt-6">
          <div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-semibold text-[#17333a]">Collection workflow</h2><span className="text-xs font-medium text-[#6f858b]">Step {currentIndex + 1} of {steps.length}</span></div>
          <StepBar steps={steps} currentIndex={currentIndex} />
        </section>
      )}

      <section className={`mt-4 ${CARD}`}>
        {info && (
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-xl bg-[#e8f5f2] text-[#0e6f69]"><info.icon className="size-5" /></div>
            <div><h3 className="font-semibold text-[#17333a]">{info.title}</h3><p className="mt-1 text-xs text-[#71868b]">{info.description}</p></div>
          </div>
        )}
        {CLOSED_GOOD.has(task.status) && (
          <div className="flex flex-col items-center py-2 text-center">
            <div className="grid size-16 place-items-center rounded-full bg-[#dff2eb] text-[#0e6f69]"><Check className="size-8" /></div>
            <h3 className="mt-4 text-lg font-semibold text-[#17333a]">Collection complete</h3>
            <p className="mt-2 max-w-[250px] text-xs leading-5 text-[#71868b]">The lab has received this specimen. Nothing further is needed from you.</p>
          </div>
        )}
        {(tests.length > 0 || specimens.length > 0) && (
          <div className="mt-4 flex flex-col gap-2 border-t border-[#edf1f1] pt-4">
            {tests.map((t) => (
              <div key={t.id} className="rounded-2xl border border-[#e4eceb] bg-white p-3">
                <div className="flex items-center gap-3">
                  <span className={`size-3 shrink-0 rounded-full ${CONTAINER_DOT[t.containerType] ?? "bg-[#9aa7ad]"}`} />
                  <span className="flex-1 text-xs font-medium text-[#334349]">{t.name}{t.code ? ` (${t.code})` : ""} · {t.containerType.replaceAll("_", " ")}</span>
                  <span className={`text-[10px] font-semibold ${t.status === "required" ? "text-[#9aa8aa]" : t.status === "rejected" ? "text-[#c75e43]" : "text-[#0e6f69]"}`}>{TEST_STATUS_LABEL[t.status] ?? t.status}</span>
                </div>
              </div>
            ))}
            {specimens.map((s) => (
              <div key={s.id} className="flex items-center justify-between rounded-xl bg-[#f7faf9] px-3 py-2 text-xs text-[#516b71]">
                <span>{s.barcode}</span><span className="font-medium text-[#0e6f69]">{s.status}</span>
              </div>
            ))}
          </div>
        )}
        <div className="mt-4 border-t border-[#edf1f1] pt-4">
          <TaskActions task={task} tests={tests} onCommand={onCommand} />
        </div>
      </section>

      <section className="mt-5 flex items-center gap-3 rounded-2xl border border-[#f0ddd5] bg-[#fff8f5] p-4">
        <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#fde9e1] text-[#c75e43]"><ShieldCheck className="size-[18px]" /></div>
        <div><p className="text-xs font-semibold text-[#754b3c]">Safety reminder</p><p className="mt-0.5 text-[11px] leading-4 text-[#926e62]">Confirm two patient identifiers before every collection.</p></div>
      </section>
      <p className="mt-3 text-center text-[10px] text-[#9aa8aa]">Last synced {formatDateTime(serverTime)}</p>
    </div>
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
  const back = () => { setSelectedId(null); setDetail(null); loadWorklist(); };

  const onCommand = async (cmd: string, body: Record<string, unknown> = {}) => {
    if (!detail) return;
    const idempotencyKey = crypto.randomUUID();
    await sendCommand(detail.task.id, COMMAND_ENDPOINT[cmd], { ...body, expectedVersion: detail.task.version }, idempotencyKey);
    await loadTask(detail.task.id);
  };

  const signOut = async () => { await logout(); navigate("/lab/phlebotomist/login", { replace: true }); };

  if (error?.code === "password_change_required" || me?.worker.mustChangePassword) return <ChangePassword onDone={() => navigate("/lab/phlebotomist/login", { replace: true })} />;

  if (error && error.status !== 401 && error.code !== "account_unavailable") {
    return (
      <main className={`grid ${SHELL} place-items-center px-4`}>
        <div className={`w-full max-w-sm space-y-3 p-6 text-center ${CARD}`}>
          <p className="text-sm text-[#71868b]">Could not load your worklist.</p>
          <button onClick={load} className="rounded-xl bg-[#0e6f69] px-4 py-2 text-xs font-semibold text-white">Try again</button>
        </div>
      </main>
    );
  }
  if (!me) return <main className={`grid ${SHELL} place-items-center`}><div className="size-8 animate-pulse rounded-full bg-[#0e6f69]/30" /></main>;

  return (
    <main className={SHELL}>
      <div className={FRAME}>
        <header className="sticky top-0 z-20 border-b border-[#dfe8ea] bg-[#f7fafb]/95 px-5 pb-4 pt-5 backdrop-blur">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="grid size-10 place-items-center rounded-2xl bg-[#0e6f69] text-white shadow-sm"><Syringe aria-hidden="true" className="size-5" /></div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#5e777e]">Collection worklist</p>
                <p className="text-sm font-semibold text-[#17333a]">{me.worker.displayName}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="relative grid size-10 place-items-center rounded-full border border-[#dfe8ea] bg-white text-[#426068]"><Bell className="size-[18px]" /></span>
              <button aria-label="Sign out" onClick={signOut} className="grid size-10 place-items-center rounded-full border border-[#dfe8ea] bg-white text-[#426068]"><LogOut className="size-[18px]" /></button>
            </div>
          </div>
          {!selectedId && (
            <div className="mt-5 flex items-center gap-2">
              {(["all", "home", "ward"] as const).filter((m) => m === "all" || (m === "home" ? me.capabilities.home : me.capabilities.ward)).map((m) => (
                <button key={m} onClick={() => setMode(m)} className={`rounded-full px-3 py-1.5 text-xs font-semibold capitalize transition ${mode === m ? "bg-[#0e6f69] text-white" : "bg-white text-[#526c72] border border-[#dce8e7]"}`}>{m}</button>
              ))}
            </div>
          )}
        </header>

        {selectedId ? (
          detailError ? (
            <div className="flex-1 px-5 pt-5">
              <div className={`space-y-3 p-6 text-center ${CARD}`}>
                <p className="text-sm text-[#71868b]">Could not load this task.</p>
                <button onClick={() => loadTask(selectedId)} className="rounded-xl bg-[#0e6f69] px-4 py-2 text-xs font-semibold text-white">Try again</button>
              </div>
            </div>
          ) : detail ? (
            <TaskDetailView detail={detail} onBack={back} onCommand={onCommand} serverTime={me.serverTime} />
          ) : (
            <div className="flex-1 px-5 pt-5"><div className="h-40 animate-pulse rounded-[24px] bg-white" /></div>
          )
        ) : (
          <div className="flex-1 px-5 pb-10 pt-5">
            <div className="mb-4">
              <p className="text-xs font-medium text-[#6a8288]">{new Date().toLocaleDateString(undefined, { weekday: "short", day: "2-digit", month: "short" })}</p>
              <h1 className="mt-1 text-[23px] font-semibold tracking-[-0.03em] text-[#17333a]">Your worklist</h1>
            </div>
            {listError && (
              <div className={`space-y-3 p-6 text-center ${CARD}`}>
                <p className="text-sm text-[#71868b]">Could not load your worklist.</p>
                <button onClick={loadWorklist} className="rounded-xl bg-[#0e6f69] px-4 py-2 text-xs font-semibold text-white">Try again</button>
              </div>
            )}
            {tasks === null && !listError && <div className="h-24 animate-pulse rounded-[24px] bg-white" />}
            {tasks?.length === 0 && (
              <div className={`flex flex-col items-center gap-2 p-8 text-center ${CARD}`}>
                <Syringe className="size-6 text-[#0e6f69]" />
                <p className="text-sm font-semibold text-[#17333a]">Nothing assigned</p>
                <p className="text-xs text-[#71868b]">New tasks dispatch assigns to you will appear here.</p>
              </div>
            )}
            {tasks && tasks.length > 0 && (
              <div className="space-y-3">
                {tasks.map((t) => <TaskCard key={t.id} task={t} onSelect={() => selectTask(t.id)} />)}
                {nextCursor && <button onClick={loadMore} className="w-full rounded-2xl border border-[#dce8e7] bg-white py-2.5 text-xs font-semibold text-[#526c72]">Load more</button>}
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
