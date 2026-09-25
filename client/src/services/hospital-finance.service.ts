import api from '@/lib/api';
import { getHospitalHeaders } from './hospital.service';

const BASE = '/api/hospital/finance';
const headers = () => getHospitalHeaders();

export const hospitalFinanceService = {
  listAccounts: async () => (await api.get(`${BASE}/accounts`, { headers: headers() })).data,
  listVendors: async () => (await api.get(`${BASE}/vendors`, { headers: headers() })).data,
  createVendor: async (data: Record<string, unknown>) => (await api.post(`${BASE}/vendors`, data, { headers: headers() })).data,
  listExpenses: async (params?: { from?: string; to?: string; status?: string }) => (await api.get(`${BASE}/expenses`, { params, headers: headers() })).data,
  createExpense: async (data: Record<string, unknown>) => (await api.post(`${BASE}/expenses`, data, { headers: headers() })).data,
  listBudgets: async () => (await api.get(`${BASE}/budgets`, { headers: headers() })).data,
  listTaxCodes: async () => (await api.get(`${BASE}/tax-codes`, { headers: headers() })).data,
  listJournalEntries: async (params?: { from?: string; to?: string; limit?: number }) => (await api.get(`${BASE}/journal-entries`, { params, headers: headers() })).data,
  postJournalEntry: async (data: Record<string, unknown>) => (await api.post(`${BASE}/journal-entries`, data, { headers: headers() })).data,
  reverseJournalEntry: async (id: number | string, reason: string) => (await api.post(`${BASE}/journal-entries/${encodeURIComponent(String(id))}/reverse`, { reason }, { headers: headers() })).data,
  listFiscalPeriods: async () => (await api.get(`${BASE}/fiscal-periods`, { headers: headers() })).data,
  createFiscalPeriod: async (data: Record<string, unknown>) => (await api.post(`${BASE}/fiscal-periods`, data, { headers: headers() })).data,
  closeFiscalPeriod: async (periodCode: string) => (await api.post(`${BASE}/fiscal-periods/${encodeURIComponent(periodCode)}/close`, {}, { headers: headers() })).data,
  trialBalance: async (params?: { from?: string; to?: string }) => (await api.get(`${BASE}/reports/trial-balance`, { params, headers: headers() })).data,
  profitAndLoss: async (params?: { from?: string; to?: string }) => (await api.get(`${BASE}/reports/profit-and-loss`, { params, headers: headers() })).data,
  balanceSheet: async (params?: { asOf?: string }) => (await api.get(`${BASE}/reports/balance-sheet`, { params, headers: headers() })).data,
  taxSummary: async (params?: { from?: string; to?: string }) => (await api.get(`${BASE}/reports/tax-summary`, { params, headers: headers() })).data,
  ledgerCsvUrl: (params?: { from?: string; to?: string }) => {
    const search = new URLSearchParams();
    if (params?.from) search.set('from', params.from);
    if (params?.to) search.set('to', params.to);
    return `${BASE}/reports/ledger.csv${search.toString() ? `?${search.toString()}` : ''}`;
  },
};

export default hospitalFinanceService;
