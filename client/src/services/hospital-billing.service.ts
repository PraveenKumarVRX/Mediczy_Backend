import api from '@/lib/api';
import { getHospitalHeaders } from './hospital.service';

const BASE = '/api/hospital/billing';

const hospitalBillingService = {
  getCentralizedDashboard: async () => {
    const res = await api.get(`${BASE}/centralized`, { headers: getHospitalHeaders() });
    return res.data;
  },

  getCfoDashboard: async (params?: { from?: string; to?: string }) => {
    const res = await api.get(`${BASE}/cfo/dashboard`, { params, headers: getHospitalHeaders() });
    return res.data;
  },

  listStations: async () => {
    const res = await api.get(`${BASE}/stations`, { headers: getHospitalHeaders() });
    return res.data;
  },

  createStation: async (data: Record<string, unknown>) => {
    const res = await api.post(`${BASE}/stations`, data, { headers: getHospitalHeaders() });
    return res.data;
  },

  openSession: async (data: { stationId: number; cashierName?: string; openingFloat?: number }) => {
    const res = await api.post(`${BASE}/sessions/open`, data, { headers: getHospitalHeaders() });
    return res.data;
  },

  closeSession: async (sessionId: number, data: { closingTotal?: number; notes?: string }) => {
    const res = await api.post(`${BASE}/sessions/${sessionId}/close`, data, { headers: getHospitalHeaders() });
    return res.data;
  },

  reconcileSession: async (sessionId: number, data: { countedCash?: number; notes?: string }) => {
    const res = await api.post(`${BASE}/sessions/${sessionId}/reconcile`, data, { headers: getHospitalHeaders() });
    return res.data;
  },

  getActiveSession: async (stationId: number) => {
    const res = await api.get(`${BASE}/sessions/active`, {
      params: { stationId },
      headers: getHospitalHeaders(),
    });
    return res.data;
  },

  getPatientAccount: async (patientId: number | string, admissionId?: number | string) => {
    const res = await api.get(`${BASE}/patients/${patientId}/account`, {
      params: admissionId ? { admissionId } : undefined,
      headers: getHospitalHeaders(),
    });
    return res.data;
  },

  generateStatement: async (patientId: number, admissionId?: number) => {
    const res = await api.post(`${BASE}/patients/${patientId}/statements`, { admissionId }, { headers: getHospitalHeaders() });
    return res.data;
  },

  listTemplates: async () => {
    const res = await api.get(`${BASE}/templates`, { headers: getHospitalHeaders() });
    return res.data;
  },

  listInvoices: async (params?: { status?: string; patientId?: number }) => {
    const res = await api.get(`${BASE}/invoices`, { params, headers: getHospitalHeaders() });
    return res.data;
  },

  listPayments: async (params?: { limit?: number; patientId?: number }) => {
    const res = await api.get(`${BASE}/payments`, { params, headers: getHospitalHeaders() });
    return res.data;
  },

  createInvoice: async (data: Record<string, unknown>) => {
    const res = await api.post(`${BASE}/invoices`, data, { headers: getHospitalHeaders() });
    return res.data;
  },

  getInvoice: async (invoiceId: number) => {
    const res = await api.get(`${BASE}/invoices/${invoiceId}`, { headers: getHospitalHeaders() });
    return res.data;
  },

  voidInvoice: async (invoiceId: number, reason: string, supervisorPin?: string) => {
    const res = await api.post(`${BASE}/invoices/${invoiceId}/void`, { reason, supervisorPin }, { headers: getHospitalHeaders() });
    return res.data;
  },

  createAdjustment: async (invoiceId: number, data: Record<string, unknown>) => {
    const res = await api.post(`${BASE}/invoices/${invoiceId}/adjustments`, data, { headers: getHospitalHeaders() });
    return res.data;
  },

  recordPayment: async (invoiceId: number, data: Record<string, unknown>) => {
    const res = await api.post(`${BASE}/invoices/${invoiceId}/payments`, data, { headers: getHospitalHeaders() });
    return res.data;
  },

  voidPayment: async (paymentId: number, reason: string, supervisorPin?: string) => {
    const res = await api.post(`${BASE}/payments/${paymentId}/void`, { reason, supervisorPin }, { headers: getHospitalHeaders() });
    return res.data;
  },

  refundPayment: async (paymentId: number, amount: number, reason: string, supervisorPin?: string) => {
    const res = await api.post(`${BASE}/payments/${paymentId}/refund`, { amount, reason, supervisorPin }, { headers: getHospitalHeaders() });
    return res.data;
  },

  postEra: async (data: Record<string, unknown>) => {
    const res = await api.post(`${BASE}/era/post`, data, { headers: getHospitalHeaders() });
    return res.data;
  },

  exportGl: async (params?: { from?: string; to?: string; format?: string }) => {
    const res = await api.get(`${BASE}/gl/export`, { params, headers: getHospitalHeaders() });
    return res.data;
  },

  closePeriod: async (periodStart: string, periodEnd: string, supervisorPin?: string) => {
    const res = await api.post(`${BASE}/periods/close`, { periodStart, periodEnd, supervisorPin }, { headers: getHospitalHeaders() });
    return res.data;
  },

  createPaymentLink: async (invoiceId: number) => {
    const res = await api.post(`${BASE}/invoices/${invoiceId}/payment-link`, {}, { headers: getHospitalHeaders() });
    return res.data;
  },

  confirmPgi: async (data: { invoiceId: number; razorpayOrderId: string; razorpayPaymentId: string; signature: string }) => {
    const res = await api.post(`${BASE}/pgi/confirm`, data, { headers: getHospitalHeaders() });
    return res.data;
  },

  getInvoicePdf: async (invoiceId: number) => {
    const res = await api.get(`${BASE}/invoices/${invoiceId}/pdf`, { headers: getHospitalHeaders() });
    return res.data;
  },

  listAudit: async (params?: { limit?: number; offset?: number }) => {
    const res = await api.get(`${BASE}/audit`, { params, headers: getHospitalHeaders() });
    return res.data;
  },
};

export default hospitalBillingService;
