import api from '@/lib/api';
import { getHospitalHeaders } from './hospital.service';

const BASE = '/api/hospital/billing';

const hospitalBillingService = {
  getCentralizedDashboard: async () => {
    const res = await api.get(`${BASE}/centralized`, { headers: getHospitalHeaders() });
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

  listTemplates: async () => {
    const res = await api.get(`${BASE}/templates`, { headers: getHospitalHeaders() });
    return res.data;
  },

  listInvoices: async (params?: { status?: string; patientId?: number }) => {
    const res = await api.get(`${BASE}/invoices`, { params, headers: getHospitalHeaders() });
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

  recordPayment: async (invoiceId: number, data: Record<string, unknown>) => {
    const res = await api.post(`${BASE}/invoices/${invoiceId}/payments`, data, { headers: getHospitalHeaders() });
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
