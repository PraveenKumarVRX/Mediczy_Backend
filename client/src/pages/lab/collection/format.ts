import type { ApiProblem, CollectionMode, Priority, TaskStatus } from "./types";

export const STATUS_LABEL: Record<TaskStatus, string> = {
  unassigned: "Unassigned", assigned: "Assigned", accepted: "Accepted", en_route: "En route", arrived: "Arrived", at_bedside: "At bedside",
  verified: "Patient verified", consented: "Consented", collected: "Collected", in_transit: "In transit", handed_over: "Handed over",
  ward_handoff: "Ward handoff", lab_received: "Received by lab", rejected_by_lab: "Rejected by lab", refused: "Patient refused", cancelled: "Cancelled",
};

/** Badge classes per status family: pending work is neutral/blue, field work amber, specimen in custody violet, done green, problems red/orange. */
export function statusTone(status: TaskStatus): string {
  switch (status) {
    case "unassigned": return "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200";
    case "assigned": case "accepted": return "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200";
    case "en_route": case "arrived": case "at_bedside": return "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200";
    case "verified": case "consented": return "bg-cyan-100 text-cyan-900 dark:bg-cyan-950 dark:text-cyan-200";
    case "collected": case "in_transit": case "handed_over": case "ward_handoff": return "bg-violet-100 text-violet-900 dark:bg-violet-950 dark:text-violet-200";
    case "lab_received": return "bg-green-100 text-green-900 dark:bg-green-950 dark:text-green-200";
    case "rejected_by_lab": return "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200";
    case "refused": return "bg-orange-100 text-orange-900 dark:bg-orange-950 dark:text-orange-200";
    default: return "bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400";
  }
}

export const PRIORITY_TONE: Record<Priority, string> = {
  routine: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
  urgent: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  stat: "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200",
};

export const EXCEPTION_LABEL: Record<string, string> = {
  identity_mismatch: "Identity mismatch", patient_refused: "Patient refused", patient_unavailable: "Patient unavailable",
  specimen_rejected: "Specimen rejected", declined_by_worker: "Declined by collector", source_changed: "Order changed", other: "Other",
};

export const FINAL_STATUSES: TaskStatus[] = ["lab_received", "rejected_by_lab", "refused", "cancelled"];
export const isFinal = (s: TaskStatus) => FINAL_STATUSES.includes(s);

/** The ordered stages of a mode, for the progress strip in the task drawer. */
export const STAGES: Record<CollectionMode, TaskStatus[]> = {
  home: ["assigned", "accepted", "en_route", "arrived", "verified", "consented", "collected", "in_transit", "handed_over", "lab_received"],
  ward: ["assigned", "accepted", "at_bedside", "verified", "consented", "collected", "ward_handoff", "lab_received"],
};

export function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return "—";
  if (seconds < 90) return `${seconds}s`;
  const m = Math.round(seconds / 60);
  return m < 90 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
}

/** Where the collector goes: the address city/street for a home task, ward/bed for a ward task. */
export function whereOf(task: { mode: CollectionMode; home?: { address?: Record<string, string | null> }; ward?: { wardName: string | null; bedLabel: string | null } }): string {
  if (task.mode === "ward") return [task.ward?.wardName, task.ward?.bedLabel].filter(Boolean).join(" · ") || "—";
  const a = task.home?.address;
  if (!a) return "—";
  return [a.line1 || a.street, a.city].filter(Boolean).join(", ") || "—";
}

/** Reduce an axios error (or anything thrown) to a stable shape. Never trusts the message to be a string. */
export function toProblem(err: unknown): ApiProblem {
  const e = err as { response?: { status?: number; data?: { code?: string; message?: string; details?: Record<string, unknown> } }; message?: string };
  const data = e?.response?.data;
  return {
    status: e?.response?.status ?? 0,
    code: typeof data?.code === "string" ? data.code : (e?.response ? "error" : "network_error"),
    message: typeof data?.message === "string" ? data.message : (e?.response ? "The request failed." : "Could not reach the server."),
    details: data?.details,
  };
}

export const newOperationKey = (): string =>
  (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `op-${Date.now()}-${Math.random().toString(36).slice(2)}`);
