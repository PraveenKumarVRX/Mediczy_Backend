/**
 * CRM Telecaller Dialer — API client
 * Uses the same crmToken / api instance as the desktop CRM portal.
 * Calls go to /api/crm/contact-center/* (the Exotel two-leg dialer) and /api/crm/leads.
 */
import api from '@/utils/api';

function headers(extra?: Record<string, string>) {
  const t = localStorage.getItem('crmToken');
  return { ...(t ? { Authorization: `Bearer ${t}` } : {}), ...(extra || {}) };
}

export type CCOverview = {
  providerConfigured: boolean;
  agents: Array<{ user_id: string | number; name: string; phone: string; role: string; presence: string; active_call_id: string | null }>;
  calls: Array<{ id: string; agent_id: string | number; destination: string; state: string; started_at: string }>;
  callbacks: Array<{ id: string; call_id: string; owner_id: string | number; status: string; due_at: string; attempts: number; destination: string }>;
  metrics: { total: number; active: number };
};

export async function getOverview(): Promise<CCOverview> {
  const { data } = await api.get('/crm/contact-center', { headers: headers() });
  return data;
}

export async function setPresence(presence: 'available' | 'offline' | 'busy') {
  const { data } = await api.patch('/crm/contact-center/presence', { presence }, { headers: headers() });
  return data;
}

export async function dial(payload: { to: string; callback_id?: string }, idempotencyKey: string) {
  const { data } = await api.post('/crm/contact-center/calls', payload, {
    headers: headers({ 'Idempotency-Key': idempotencyKey }),
  });
  return data;
}

export async function getCall(id: string) {
  const { data } = await api.get(`/crm/contact-center/calls/${id}`, { headers: headers() });
  return data as { call: Record<string, any>; events: any[]; transcripts: any[]; artifacts: any[]; recordings: any[] };
}

export async function reconcileCall(id: string) {
  const { data } = await api.post(`/crm/contact-center/calls/${id}/reconcile`, {}, { headers: headers() });
  return data;
}

export async function setDisposition(
  id: string,
  disposition: 'appointment_followup' | 'information_provided' | 'callback_required' | 'wrong_number' | 'no_action'
) {
  const { data } = await api.post(`/crm/contact-center/calls/${id}/disposition`, { disposition }, { headers: headers() });
  return data;
}

export async function claimCallback(id: string) {
  const { data } = await api.patch(`/crm/contact-center/callbacks/${id}`, { status: 'in_progress' }, { headers: headers() });
  return data;
}

export async function resolveCallback(id: string, resolution: string) {
  const { data } = await api.patch(`/crm/contact-center/callbacks/${id}`, { status: 'resolved', resolution }, { headers: headers() });
  return data;
}

export type CRMLead = { id: number; name: string; phone: string; status: string; company?: string };

export async function getMyLeads(assignedTo: string | number): Promise<CRMLead[]> {
  const { data } = await api.get('/crm/leads', {
    headers: headers(),
    params: { assigned_to: assignedTo, status: 'new', limit: 50 },
  });
  return data.data ?? [];
}

// Terminal call states — mirrors the constant already used in CRMContactCenterPage.tsx and
// the server's own `terminal` set in services/contact-center/policy.js.
export const TERMINAL_CALL_STATES = new Set(['completed', 'failed', 'busy', 'no-answer', 'canceled']);
