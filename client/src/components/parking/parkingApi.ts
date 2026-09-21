import { useCallback, useEffect, useRef, useState } from 'react';
import api from '@/utils/api';

export type VehicleType = 'two_wheeler' | 'car';
export type PassType = 'monthly' | 'vip' | 'free' | 'token' | 'staff';

export interface Lot {
  id: number;
  name: string;
  two_wheeler_capacity: number;
  car_capacity: number;
  two_wheelers: number;
  cars: number;
  max_parking_minutes: number | null;
  security_enabled: boolean;
}

export const VEHICLE_LABEL: Record<VehicleType, string> = { two_wheeler: 'Two-wheeler', car: 'Car' };
export const PASS_LABEL: Record<PassType, string> = { monthly: 'Monthly', vip: 'VIP', free: 'Free', token: 'Token', staff: 'Staff' };

export const errorMessage = (e: any, fallback = 'Request failed') =>
  e?.response?.data?.message || e?.message || fallback;

/** Upper-cases and strips everything but letters/digits, same as the server. */
export const normalizePlate = (v: string) => v.toUpperCase().replace(/[^A-Z0-9]/g, '');

export const formatDuration = (minutes: number | null | undefined) => {
  if (minutes == null) return '—';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
};

export const formatDateTime = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—';

/**
 * GET helper with the four states every screen needs: loading, error (with retry),
 * data, and a refresh that keeps showing the last good data while it reloads.
 */
export function useParkingQuery<T>(path: string | null, params?: Record<string, unknown>) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(path !== null);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);
  const key = JSON.stringify([path, params ?? null]);

  const load = useCallback(async () => {
    if (path === null) { setData(null); setLoading(false); return; }
    const mine = ++seq.current;
    setLoading(true);
    setError(null);
    try {
      const res = await api.get(`/parking${path}`, { params });
      if (mine === seq.current) setData((res.data?.data ?? null) as T);
    } catch (e: any) {
      if (mine === seq.current) setError(errorMessage(e, 'Could not load parking data'));
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, [key]);

  useEffect(() => { load(); }, [load]);
  return { data, loading, error, reload: load };
}

export const parkingPost = <T = any>(path: string, body?: unknown) => api.post(`/parking${path}`, body).then((r) => r.data?.data as T);
export const parkingPut = <T = any>(path: string, body?: unknown) => api.put(`/parking${path}`, body).then((r) => r.data?.data as T);
export const parkingPatch = <T = any>(path: string, body?: unknown) => api.patch(`/parking${path}`, body).then((r) => r.data?.data as T);
export const parkingDelete = <T = any>(path: string) => api.delete(`/parking${path}`).then((r) => r.data?.data as T);
