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
