/**
 * Smart Force Field Force — API client
 * Uses the same teamToken / api instance as the Team portal.
 * All calls go to /api/field/*.
 */
import api from '@/utils/api';

function headers() {
  const t = localStorage.getItem('teamToken');
  return t ? { Authorization: `Bearer ${t}` } : {};
}

export async function getAttendanceToday() {
  const { data } = await api.get('/field/attendance/today', { headers: headers() });
  return data;
}

export async function clockIn(payload: {
  lat?: number; lng?: number; accuracy_m?: number; address?: string;
  exception_type?: string; exception_reason?: string;
}) {
  const { data } = await api.post('/field/attendance/clock-in', payload, { headers: headers() });
  return data;
}

export async function clockOut(payload: { lat?: number; lng?: number; accuracy_m?: number }) {
  const { data } = await api.patch('/field/attendance/clock-out', payload, { headers: headers() });
  return data;
}

export async function getAttendanceHistory(month?: string) {
  const { data } = await api.get('/field/attendance/history', {
    headers: headers(),
    params: month ? { month } : undefined,
  });
  return data;
}

export async function submitException(payload: {
  date: string; exception_type: string; exception_reason: string;
}) {
  const { data } = await api.post('/field/attendance/exception', payload, { headers: headers() });
  return data;
}

export async function getVisits(params?: {
  date?: string; status?: string; entity_type?: string; page?: number;
}) {
  const { data } = await api.get('/field/visits', { headers: headers(), params });
  return data;
}

export async function createVisit(payload: {
  entity_name: string; purpose: string;
  entity_type?: string; entity_uid?: string; entity_id?: number;
  planned_at?: string; notes_planned?: string;
}) {
  const { data } = await api.post('/field/visits', payload, { headers: headers() });
  return data;
}

export async function checkInVisit(
  id: number,
  payload: { lat?: number; lng?: number; accuracy_m?: number; address?: string }
) {
  const { data } = await api.patch(`/field/visits/${id}/check-in`, payload, { headers: headers() });
  return data;
}

export async function checkOutVisit(
  id: number,
  payload: {
    lat?: number; lng?: number; accuracy_m?: number;
    met_person?: string; met_designation?: string; outcome?: string;
    services_discussed?: string[]; materials_shared?: string[];
    next_action?: string; follow_up_date?: string;
  }
) {
  const { data } = await api.patch(`/field/visits/${id}/check-out`, payload, { headers: headers() });
  return data;
}

export async function cancelVisit(id: number) {
  const { data } = await api.put(`/field/visits/${id}`, { status: 'cancelled' }, { headers: headers() });
  return data;
}

export async function getDailyReportToday() {
  const { data } = await api.get('/field/daily-report/today', { headers: headers() });
  return data;
}

export async function submitDailyReport(payload: {
  planned_visits: number; completed_visits: number; missed_visits: number;
  leads_generated: number; follow_ups_done: number;
  key_achievements?: string; challenges?: string; next_day_plan?: string;
}) {
  const { data } = await api.post('/field/daily-report', payload, { headers: headers() });
  return data;
}

// ─── TRAVEL ──────────────────────────────────────────────────────────────────

export async function getTravelRequests(params?: { month?: string; status?: string }) {
  const { data } = await api.get('/field/travel', { headers: headers(), params });
  return data as any[];
}

export async function createTravelRequest(payload: {
  travel_date: string; from_location: string; to_location: string; purpose: string;
  mode_of_transport?: string; estimated_km?: number; estimated_amount?: number;
  advance_requested?: number; camp_id?: number; notes?: string;
}) {
  const { data } = await api.post('/field/travel', payload, { headers: headers() });
  return data;
}

// ─── EXPENSES ────────────────────────────────────────────────────────────────

export async function getExpenseClaims(params?: { month?: string }) {
  const { data } = await api.get('/field/expenses', { headers: headers(), params });
  return data as any[];
}

export async function getExpenseClaim(id: number) {
  const { data } = await api.get(`/field/expenses/${id}`, { headers: headers() });
  return data;
}

export async function createExpenseClaim(payload: { claim_month: string; title: string; travel_request_id?: number; notes?: string }) {
  const { data } = await api.post('/field/expenses', payload, { headers: headers() });
  return data;
}

export async function addExpenseItem(claimId: number, payload: {
  expense_date: string; category: string; amount: number;
  description?: string; km_travelled?: number; receipt_url?: string;
}) {
  const { data } = await api.post(`/field/expenses/${claimId}/items`, payload, { headers: headers() });
  return data;
}

export async function deleteExpenseItem(claimId: number, itemId: number) {
  const { data } = await api.delete(`/field/expenses/${claimId}/items/${itemId}`, { headers: headers() });
  return data;
}

export async function submitExpenseClaim(claimId: number) {
  const { data } = await api.patch(`/field/expenses/${claimId}/submit`, {}, { headers: headers() });
  return data;
}

// ─── CAMPS ───────────────────────────────────────────────────────────────────

export async function getCamps(params?: { status?: string }) {
  const { data } = await api.get('/field/camps', { headers: headers(), params });
  return data as any[];
}

export async function getCamp(id: number) {
  const { data } = await api.get(`/field/camps/${id}`, { headers: headers() });
  return data;
}

export async function proposeCamp(payload: {
  camp_name: string; start_date: string; camp_type?: string;
  location?: string; address?: string; end_date?: string;
  organized_by?: string; expected_patients?: number; services_offered?: string[];
}) {
  const { data } = await api.post('/field/camps', payload, { headers: headers() });
  return data;
}

// ─── EMPANELMENT ──────────────────────────────────────────────────────────────

export async function getEmpanelmentApplications(params?: { status?: string }) {
  const { data } = await api.get('/field/empanelment', { headers: headers(), params });
  return data as any[];
}

export async function createEmpanelmentApplication(payload: {
  insurer_name: string; insurer_type?: string;
  contact_person?: string; contact_phone?: string; contact_email?: string;
  panel_type?: string; target_date?: string; notes?: string;
}) {
  const { data } = await api.post('/field/empanelment', payload, { headers: headers() });
  return data;
}

export async function updateEmpanelmentApplication(id: number, payload: Record<string, any>) {
  const { data } = await api.patch(`/field/empanelment/${id}`, payload, { headers: headers() });
  return data;
}

export async function addEmpanelmentMilestone(appId: number, payload: {
  milestone: string; status?: string; due_date?: string; notes?: string;
}) {
  const { data } = await api.post(`/field/empanelment/${appId}/milestone`, payload, { headers: headers() });
  return data;
}

export async function updateEmpanelmentMilestone(appId: number, milestoneId: number, payload: { status?: string; notes?: string }) {
  const { data } = await api.patch(`/field/empanelment/${appId}/milestone/${milestoneId}`, payload, { headers: headers() });
  return data;
}

// ─── OUTREACH ACCOUNTS ────────────────────────────────────────────────────────

export async function getOutreachAccounts(params?: { type?: string; relationship_status?: string; search?: string }) {
  const { data } = await api.get('/field/outreach', { headers: headers(), params });
  return data as any[];
}

export async function createOutreachAccount(payload: {
  name: string; type: string;
  address?: string; area?: string; city?: string; pin_code?: string;
  primary_contact?: string; contact_phone?: string; contact_email?: string;
  designation?: string; population_served?: number; notes?: string; tags?: string[];
}) {
  const { data } = await api.post('/field/outreach', payload, { headers: headers() });
  return data;
}

export async function updateOutreachAccount(id: number, payload: Record<string, any>) {
  const { data } = await api.patch(`/field/outreach/${id}`, payload, { headers: headers() });
  return data;
}

// ─── GPS ─────────────────────────────────────────────────────────────────────

export function getGps(): Promise<{ lat: number; lng: number; accuracy_m: number } | null> {
  return new Promise(resolve => {
    if (!navigator.geolocation) { resolve(null); return; }
    navigator.geolocation.getCurrentPosition(
      p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy_m: Math.round(p.coords.accuracy) }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  });
}
