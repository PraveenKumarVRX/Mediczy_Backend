/**
 * Client for /api/ohc-workspace. It deliberately does NOT use the shared axios instance: that one injects whichever portal token it finds
 * and redirects on 401 for other portals. OHC staff have their own short-lived access token (30 min) and a rotating refresh token; the
 * worker is re-checked by the server on every request, so a suspended account or an ended contract fails on the next call.
 * Browser storage is the best a web build can do; a native shell should keep these in the platform secure store.
 */
import api from "@/utils/api";
import type { ApiProblem, Employee, OhcMe } from "../care-units/types";

const ACCESS = "ohcAccessToken";
const REFRESH = "ohcRefreshToken";
const read = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string | null) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* storage unavailable: the session lasts until reload */ } };

export class OhcError extends Error implements ApiProblem {
  constructor(public status: number, public code: string, message: string, public details?: Record<string, unknown>) { super(message); }
}

export const hasSession = () => Boolean(read(ACCESS) || read(REFRESH));
export function signOutLocal() { write(ACCESS, null); write(REFRESH, null); }

const base = () => String(api.defaults.baseURL || "/api").replace(/\/$/, "");
let refreshing: Promise<boolean> | null = null;

async function raw(method: string, path: string, body?: unknown, auth = true): Promise<Response> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = read(ACCESS);
  if (auth && token) headers.Authorization = `Bearer ${token}`;
  return fetch(`${base()}/ohc-workspace${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}

async function refresh(): Promise<boolean> {
  refreshing ??= (async () => {
    try {
      const rt = read(REFRESH);
      if (!rt) return false;
      const res = await raw("POST", "/auth/refresh", { refreshToken: rt }, false);
      if (!res.ok) return false;
      const j = await res.json();
      write(ACCESS, j.accessToken); write(REFRESH, j.refreshToken);
      return true;
    } finally { refreshing = null; }
  })();
  return refreshing;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res = await raw(method, path, body);
  if (res.status === 401 && (await res.clone().json().catch(() => ({}))).code === "token_expired" && (await refresh())) res = await raw(method, path, body);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 || json.code === "account_unavailable") signOutLocal();
    throw new OhcError(res.status, json.code ?? "error", json.message ?? res.statusText, json.details);
  }
  return json as T;
}

export async function login(email: string, password: string) {
  const res = await raw("POST", "/auth/login", { email, password }, false);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new OhcError(res.status, json.code ?? "error", json.message ?? "Sign-in failed");
  write(ACCESS, json.accessToken); write(REFRESH, json.refreshToken);
  return json as { worker: { uid: string; displayName: string; role: string }; units: OhcMe["units"] };
}
export async function logout() {
  const rt = read(REFRESH);
  signOutLocal();
  if (rt) await raw("POST", "/auth/logout", { refreshToken: rt }, false).catch(() => undefined);
}

export const changePassword = (currentPassword: string, newPassword: string) => request<{ ok: boolean }>("POST", "/auth/change-password", { currentPassword, newPassword }).then((r) => { signOutLocal(); return r; });
export const getMe = () => request<OhcMe & { success: boolean }>("GET", "/me");
export const getEmployees = (unit: string, search: string) =>
  request<{ employees: Employee[] }>("GET", `/employees?unit=${encodeURIComponent(unit)}&search=${encodeURIComponent(search)}`);
export const getCertificates = (unit: string) => request<{ certificates: Record<string, unknown>[] }>("GET", `/certificates?unit=${encodeURIComponent(unit)}`);
export const issueCertificate = (input: Record<string, unknown>) => request<{ certificate: { id: number }; pdfUrl: string | null }>("POST", "/certificates", input);

/** Fetch the certificate PDF with the session token and hand it to the browser as a download. */
export async function downloadCertificate(id: number) {
  let res = await raw("GET", `/certificates/${id}/pdf`);
  if (res.status === 401 && (await refresh())) res = await raw("GET", `/certificates/${id}/pdf`);
  if (!res.ok) throw new OhcError(res.status, "pdf_unavailable", "The PDF is not available for this certificate.");
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url; a.download = `fitness-certificate-${id}.pdf`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
