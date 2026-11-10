import { useCallback, useEffect, useState } from 'react';
import api from '@/utils/api';

export interface SecurityPortalData {
  source: string;
  organizationId: number | null;
  kpis: Array<{ label: string; value: string; sub: string }>;
  incidents: Array<{ id: string; type: string; location: string; time: string; priority: string; status: string; owner?: string }>;
  cctv: Array<{ zone: string; cameras: number; online: number; analytics: string; status: string }>;
  accessPoints: Array<{ name: string; area: string; status: string; credential: string; lastEvent: string; owner: string }>;
  accessLogs: Array<{ time: string; person: string; point: string; direction: string; method: string; result: string }>;
  alerts: Array<{ id: string; alert: string; zone: string; severity: string; owner: string; status: string }>;
  guards: Array<{ name: string; shift: string; post: string; status: string; patrol: string; radio: string }>;
  visitors: Array<{ id: string; visitor: string; patient: string; passType: string; checkIn: string; status: string; version?: number }>;
  staffLog: Array<{ person: string; department: string; point: string; time: string; result: string }>;
  reports: Array<{ name: string; cadence: string; audience: string; status: string }>;
  settings: Array<{ title: string; text: string }>;
  support: Array<{ title: string; text: string }>;
  workQueues: Array<{ label: string; value: string; detail: string; tone: string }>;
  heatmap: string[][];
}

const getSecurityAuthHeaders = () => {
  const token = window.localStorage.getItem('securityToken');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export const fetchSecurityPortalData = async () => {
  const response = await api.get('/hospital/staff/security/portal-data', {
    headers: getSecurityAuthHeaders(),
  });
  return response.data?.data as SecurityPortalData;
};

export const useSecurityPortalData = () => {
  const [data, setData] = useState<SecurityPortalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const nextData = await fetchSecurityPortalData();
      setData(nextData);
      setError(null);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? err?.message ?? 'Failed to fetch security portal data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { data, loading, error, refresh };
};
