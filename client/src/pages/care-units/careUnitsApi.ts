/** React Query layer for hospital/clinic administration of care units and for the corporate's OHC view. Domain state lives on the server. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/utils/api";
import type { AccessEntry, CareUnit, ClinicalPrescription, CorporateDashboard, Employee, UnitStaff, WorkplaceEmergency, WorkspaceCertificate, ApiProblem } from "./types";

export const keys = {
  all: ["care-units"] as const,
  list: ["care-units", "list"] as const,
  unit: (uid: string) => ["care-units", "unit", uid] as const,
  staff: (uid: string) => ["care-units", "staff", uid] as const,
  log: (uid: string) => ["care-units", "log", uid] as const,
  corporate: ["care-units", "corporate"] as const,
  dashboard: (uid: string) => ["care-units", "corporate", uid] as const,
};

export function toProblem(err: unknown): ApiProblem {
  const e = err as { response?: { status?: number; data?: { code?: string; message?: string; details?: Record<string, unknown> } } };
  const d = e?.response?.data;
  return {
    status: e?.response?.status ?? 0,
    code: typeof d?.code === "string" ? d.code : (e?.response ? "error" : "network_error"),
    message: typeof d?.message === "string" ? d.message : (e?.response ? "The request failed." : "Could not reach the server."),
    details: d?.details,
  };
}

export const useUnits = () => useQuery({ queryKey: keys.list, queryFn: async () => (await api.get("/care-units")).data.units as CareUnit[] });
export const useUnitStaff = (uid: string | null) =>
  useQuery({ queryKey: keys.staff(uid ?? ""), enabled: Boolean(uid), queryFn: async () => (await api.get(`/care-units/${uid}/staff`)).data.staff as UnitStaff[] });
export const useUnitLog = (uid: string | null) =>
  useQuery({ queryKey: keys.log(uid ?? ""), enabled: Boolean(uid), queryFn: async () => (await api.get(`/care-units/${uid}/access-log`)).data.entries as AccessEntry[] });

export async function searchCorporates(search: string) {
  return ((await api.get("/care-units/corporates", { params: { search } })).data.corporates ?? []) as { uid: string; name: string }[];
}
export async function searchCoOwners(search: string) {
  return ((await api.get("/care-units/co-owners", { params: { search } })).data.entities ?? []) as { uid: string; name: string; kind: string }[];
}

export function useUnitMutations() {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: keys.all });
  const useOp = <V, R = unknown>(fn: (v: V) => Promise<R>) => useMutation({ mutationFn: fn, onSettled: refresh });
  return {
    create: useOp((input: Record<string, unknown>) => api.post("/care-units", input).then((r) => r.data.unit as CareUnit)),
    update: useOp((v: { uid: string; patch: Record<string, unknown> }) => api.patch(`/care-units/${v.uid}`, v.patch).then((r) => r.data.unit as CareUnit)),
    createStaff: useOp<{ uid: string; input: Record<string, unknown> }, { staff: { uid: string; email: string; role: string }; tempPassword: string }>((v) =>
      api.post(`/care-units/${v.uid}/staff/new`, v.input).then((r) => r.data)),
    removeStaff: useOp((v: { uid: string; userUid: string }) => api.delete(`/care-units/${v.uid}/staff/${v.userUid}`).then((r) => r.data)),
    endContract: useOp((v: { uid: string; reason: string }) => api.post(`/care-units/${v.uid}/end-contract`, { reason: v.reason }).then((r) => r.data.unit as CareUnit)),
    corporateAccept: useOp((uid: string) => api.post(`/corporate/ohc-units/${uid}/accept`).then((r) => r.data.unit as CareUnit)),
    corporateEnd: useOp((v: { uid: string; reason: string }) => api.post(`/corporate/ohc-units/${v.uid}/end-contract`, { reason: v.reason }).then((r) => r.data.unit as CareUnit)),
  };
}

export const useCorporateOhcs = () =>
  useQuery({ queryKey: keys.corporate, queryFn: async () => (await api.get("/corporate/ohc-units")).data.units as CareUnit[] });
export const useCorporateDashboard = (uid: string | null) =>
  useQuery({ queryKey: keys.dashboard(uid ?? ""), enabled: Boolean(uid), queryFn: async () => (await api.get(`/corporate/ohc-units/${uid}`)).data as CorporateDashboard });
export const useCorporateLog = (uid: string | null) =>
  useQuery({ queryKey: [...keys.dashboard(uid ?? ""), "log"], enabled: Boolean(uid), queryFn: async () => (await api.get(`/corporate/ohc-units/${uid}/access-log`)).data.entries as AccessEntry[] });

// ── CMO clinical operations on /corporate/ohc-units (reuses the OHC workspace's own endpoints) ──
export const useCorporateOhcEmployees = (uid: string | null, search: string) =>
  useQuery({ queryKey: [...keys.dashboard(uid ?? ""), "employees", search], enabled: Boolean(uid), queryFn: async () => (await api.get(`/corporate/ohc-units/${uid}/employees`, { params: { search } })).data.employees as Employee[] });
export const useCorporateOhcCertificates = (uid: string | null) =>
  useQuery({ queryKey: [...keys.dashboard(uid ?? ""), "certificates"], enabled: Boolean(uid), queryFn: async () => (await api.get(`/corporate/ohc-units/${uid}/certificates`)).data.certificates as WorkspaceCertificate[] });
export const useCorporateOhcEmergencies = (uid: string | null) =>
  useQuery({ queryKey: [...keys.dashboard(uid ?? ""), "emergencies"], enabled: Boolean(uid), queryFn: async () => (await api.get(`/corporate/ohc-units/${uid}/emergencies`)).data.emergencies as WorkplaceEmergency[] });

export async function fetchCorporateCertificatePdfBlob(uid: string, id: number): Promise<Blob> {
  const res = await api.get(`/corporate/ohc-units/${uid}/certificates/${id}/pdf`, { responseType: "blob" });
  return res.data as Blob;
}

export function useCorporateOhcMutations(uid: string | null) {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: keys.dashboard(uid ?? "") });
  const useOp = <V, R = unknown>(fn: (v: V) => Promise<R>) => useMutation({ mutationFn: fn, onSettled: refresh });
  return {
    issueCertificate: useOp((input: Record<string, unknown>) => api.post(`/corporate/ohc-units/${uid}/certificates`, input).then((r) => r.data as { certificate: { id: number }; pdfUrl: string | null })),
    reportEmergency: useOp((input: Record<string, unknown>) => api.post(`/corporate/ohc-units/${uid}/emergencies`, input).then((r) => r.data.emergency as WorkplaceEmergency)),
    updateEmergency: useOp((v: { id: number; patch: Record<string, unknown> }) => api.patch(`/corporate/ohc-units/${uid}/emergencies/${v.id}`, v.patch).then((r) => r.data.emergency as WorkplaceEmergency)),
    setStaffActive: useOp((v: { staffUid: string; active: boolean }) => api.patch(`/corporate/ohc-units/${uid}/staff/${v.staffUid}`, { active: v.active }).then((r) => r.data)),
  };
}

// ── The real hospital prescription + clinical-referral systems, reached directly (not through the
// /corporate/ohc-units proxy) — ohcClinicianAuth.middleware.js accepts this same corporate bearer
// token on /api/prescriptions and /api/careos/network/referrals, same as it does the OHC-login token. ──
// `enabled` matters here, not just as an optimization: a corporate_admin/hr_staff token is NOT
// corporate_cmo, so ohcClinicianAuth.middleware.js falls through to the real authDoctor — which looks
// up a `doctors` row by the caller's own numeric id. Never fire this call for a non-CMO corporate role.
export const useMyPrescriptions = (enabled: boolean) =>
  useQuery({ queryKey: ["clinician", "prescriptions"], enabled, queryFn: async () => (await api.get("/prescriptions/doctor")).data.prescriptions as ClinicalPrescription[] });

export function useClinicianMutations() {
  const qc = useQueryClient();
  const useOp = <V, R = unknown>(fn: (v: V) => Promise<R>) => useMutation({ mutationFn: fn, onSettled: () => qc.invalidateQueries({ queryKey: ["clinician", "prescriptions"] }) });
  return {
    issuePrescription: useOp((input: Record<string, unknown>) => api.post("/prescriptions", input).then((r) => r.data)),
    createReferral: useOp((input: Record<string, unknown>) => api.post("/careos/network/referrals", input).then((r) => r.data)),
  };
}
