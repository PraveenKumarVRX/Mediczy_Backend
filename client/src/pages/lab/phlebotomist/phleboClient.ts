/**
 * Client for /api/phlebotomy — the collector's own portal. Deliberately does NOT use the shared axios
 * instance: that one assumes one lab-admin token per browser. Collectors have their own short-lived
 * access token (15 min) and a rotating single-use refresh token (7 days); the worker is re-checked by
 * the server on every request. See docs/api/PHLEBOTOMY_MOBILE_API_INTEGRATION.md for the full contract
 * this adapts (§14 has a reference client with the same rules, in class form).
 */
import api from "@/utils/api";
import type { ApiProblem, CollectionMode, Me, Task, TaskDetail, Worklist } from "./types";

const ACCESS = "phleboAccessToken";
const REFRESH = "phleboRefreshToken";
const DEVICE = "phleboDeviceId";

const read = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string | null) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* storage unavailable: the session lasts until reload */ } };

export class PhleboError extends Error implements ApiProblem {
  constructor(public status: number, public code: string, message: string, public details?: Record<string, unknown>) { super(message); }
}

export const hasSession = () => Boolean(read(ACCESS) || read(REFRESH));
export function signOutLocal() { write(ACCESS, null); write(REFRESH, null); }

/** A stable per-browser id, generated once — the closest a web build can do to the native app's device id. */
export function deviceId(): string {
  let id = read(DEVICE);
  if (!id) { id = crypto.randomUUID(); write(DEVICE, id); }
  return id;
}

const base = () => String(api.defaults.baseURL || "/api").replace(/\/$/, "");
let refreshing: Promise<boolean> | null = null;

async function raw(method: string, path: string, opts: { body?: unknown; headers?: Record<string, string>; auth?: boolean } = {}): Promise<Response> {
  const headers: Record<string, string> = { "Content-Type": "application/json", "X-Device-Id": deviceId(), ...opts.headers };
  if (opts.auth !== false) { const token = read(ACCESS); if (token) headers.Authorization = `Bearer ${token}`; }
  return fetch(`${base()}/phlebotomy${path}`, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
}

async function refresh(): Promise<boolean> {
  refreshing ??= (async () => {
    try {
      const rt = read(REFRESH);
      if (!rt) return false;
      const res = await raw("POST", "/auth/refresh", { body: { refreshToken: rt }, auth: false });
      if (!res.ok) return false;
      const j = await res.json();
      write(ACCESS, j.accessToken); write(REFRESH, j.refreshToken);
      return true;
    } finally { refreshing = null; }
  })();
  return refreshing;
}

async function request<T>(method: string, path: string, opts: { body?: unknown; headers?: Record<string, string> } = {}): Promise<T> {
  let res = await raw(method, path, opts);
  if (res.status === 401 && (await res.clone().json().catch(() => ({}))).code === "token_expired" && (await refresh())) res = await raw(method, path, opts);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 || json.code === "account_unavailable") signOutLocal();
    throw new PhleboError(res.status, json.code ?? "error", json.message ?? res.statusText, json.details);
  }
  return json as T;
}

export async function login(email: string, password: string) {
  const res = await raw("POST", "/auth/login", { body: { email, password }, auth: false });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new PhleboError(res.status, json.code ?? "error", json.message ?? "Sign-in failed");
  write(ACCESS, json.accessToken); write(REFRESH, json.refreshToken);
  return json as { mustChangePassword: boolean; worker: { uid: string; displayName: string } };
}

export async function logout() {
  const rt = read(REFRESH);
  signOutLocal();
  if (rt) await raw("POST", "/auth/logout", { body: { refreshToken: rt }, auth: false }).catch(() => undefined);
}

export const changePassword = (currentPassword: string, newPassword: string) =>
  request<{ ok: boolean }>("POST", "/auth/change-password", { body: { currentPassword, newPassword } }).then((r) => { signOutLocal(); return r; });

export const getMe = () => request<Me & { success: boolean }>("GET", "/me");

export const getWorklist = (params: { cursor?: string; mode?: CollectionMode } = {}) => {
  const q = new URLSearchParams();
  if (params.cursor) q.set("cursor", params.cursor);
  if (params.mode) q.set("mode", params.mode);
  const qs = q.toString();
  return request<Worklist & { success: boolean }>("GET", `/tasks${qs ? `?${qs}` : ""}`);
};

export const getTask = (id: string) => request<TaskDetail & { success: boolean }>("GET", `/tasks/${id}`);

/** Command name (from `task.permittedCommands`, snake_case) → URL segment. Doc §5.4's own table — the
 * two differ for `arrive`, `verify_patient`, `scan_specimen`, `start_transit`. */
export const COMMAND_ENDPOINT: Record<string, string> = {
  accept: "accept", decline: "decline", depart: "depart", arrive: "arrival", bedside: "bedside",
  verify_patient: "verify-patient", consent: "consent", scan_specimen: "specimens/scan",
  collect: "collect", start_transit: "start-transit", handoff: "handoff",
};

/**
 * One task command. `idempotencyKey` must be generated once per user action (button click / dialog
 * submit) and reused only for the automatic single retry this function already does on token
 * expiry — never for a fresh attempt after the user corrects something and resubmits.
 */
export function command<T = { task: Task; tests: unknown[]; result?: unknown; outcome?: string; message?: string }>(
  taskId: string, endpoint: string, body: Record<string, unknown>, idempotencyKey: string,
) {
  return request<T & { success: boolean }>("POST", `/tasks/${taskId}/${endpoint}`, {
    body, headers: { "Idempotency-Key": idempotencyKey },
  });
}
