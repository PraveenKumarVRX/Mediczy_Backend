import { useCallback, useEffect, useRef, useState } from 'react';
import api from '@/utils/api';

export type Severity = 'low' | 'medium' | 'high';
export type PrivacyClass = 'public' | 'restricted' | 'clinical';

export interface Camera {
  id: number; name: string; zone: string | null; zone_type: string; privacy_class: PrivacyClass; privacy_approved_at: string | null; privacy_note: string | null;
  status: 'unknown' | 'online' | 'offline'; last_frame_at: string | null; analysis_interval_seconds: number; daily_frame_budget: number; is_enabled: boolean;
  recorder_id: number | null; recorder_name: string | null; channel_no: number | null; rule_count: number; new_events: number; analytics_allowed: boolean;
}
export interface Recorder { id: number; name: string; kind: string; vendor: string; model: string | null; host: string | null; port: number | null; channel_count: number | null; status: string; last_seen_at: string | null; gateway_id: number | null; gateway_name: string | null; cameras: number }
export interface Gateway { id: number; name: string; site_label: string | null; is_active: boolean; last_seen_at: string | null; agent_version: string | null; online: boolean; recorders: number }
export interface Rule { id: number; camera_id: number; analytic: string; threshold: number | null; severity: Severity; cooldown_minutes: number; schedule: { start: string; end: string } | null; is_enabled: boolean }
export interface CatalogItem { key: string; label: string; help: string; threshold: 'required' | 'none'; cmp: string; defaultSeverity: Severity; needsSchedule: boolean }
export interface SurvEvent { id: string; camera_id: number; camera_name: string; camera_zone: string | null; source: 'vision' | 'camera_native' | 'system'; analytic: string; severity: Severity; observed_count: number | null; confidence: string | null; description: string | null; detected_at: string; status: 'new' | 'acknowledged' | 'dismissed' | 'escalated'; handler_note: string | null }

export const ZONE_TYPES = ['entrance', 'perimeter', 'parking', 'corridor', 'lobby', 'emergency', 'pharmacy', 'server_room', 'store', 'ward', 'icu', 'ot', 'other'];
export const VENDORS = ['hikvision', 'dahua', 'cpplus', 'uniview', 'axis', 'onvif_generic', 'other'];
export const SEV_CLS: Record<Severity, string> = { high: 'bg-red-100 text-red-700', medium: 'bg-amber-100 text-amber-700', low: 'bg-slate-100 text-slate-700' };
export const NATIVE_LABEL: Record<string, string> = { intrusion: 'Intrusion (camera alarm)', line_crossing: 'Line crossing (camera alarm)', tamper: 'Camera tampering', video_loss: 'Video loss' };
export const pretty = (s: string) => s.replace(/_/g, ' ');

export const errorMessage = (e: any, fallback = 'Request failed') => e?.response?.data?.message || e?.message || fallback;
export const formatDateTime = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—');
export const timeAgo = (iso: string | null | undefined) => {
  if (!iso) return 'never';
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
};

/** GET with loading / error (retry) / data, keeping the last good data while reloading. */
export function useSurvQuery<T>(path: string | null, params?: Record<string, unknown>) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(path !== null);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);
  const key = JSON.stringify([path, params ?? null]);
  const load = useCallback(async () => {
    if (path === null) { setData(null); setLoading(false); return; }
    const mine = ++seq.current;
    setLoading(true); setError(null);
    try {
      const res = await api.get(`/surveillance${path}`, { params });
      if (mine === seq.current) setData((res.data?.data ?? null) as T);
    } catch (e: any) {
      if (mine === seq.current) setError(errorMessage(e, 'Could not load camera data'));
    } finally { if (mine === seq.current) setLoading(false); }
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);
  return { data, loading, error, reload: load };
}

export const survPost = <T = any>(path: string, body?: unknown) => api.post(`/surveillance${path}`, body).then((r) => r.data?.data as T);
export const survPatch = <T = any>(path: string, body?: unknown) => api.patch(`/surveillance${path}`, body).then((r) => r.data?.data as T);
export const survDelete = <T = any>(path: string) => api.delete(`/surveillance${path}`).then((r) => r.data?.data as T);
