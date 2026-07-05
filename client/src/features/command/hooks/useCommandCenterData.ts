import { useCallback, useEffect, useState } from 'react';
import api from '@/utils/api';
import { getCommandCenterAI } from '@/services/hospitalOs.service';

export interface CommandSnapshot {
  bedOccupancyPct: number;
  activeAdmissions: number;
  todayOTCases: number;
  criticalAlerts: number;
  pendingDischarges: number;
  preAuthsPending: number;
}

export interface OpsKPI {
  name: string;
  value: string;
  target: string;
  status: 'on-track' | 'needs-attention' | 'critical';
}

export interface ClinicalAdoption {
  label: string;
  value: number;
}

export interface QualityMetric {
  label: string;
  value: string;
  trend: 'up' | 'down' | 'flat';
  good: 'up' | 'down';
}

export interface DisplayCommandData {
  census?: {
    icuBeds: number;
    icuOccupied: number;
    icuCritical: number;
    otRooms: number;
    otInProgress: number;
  };
  queues?: {
    opdWaiting: number;
    erWaiting: number;
    completedToday: number;
    byDepartment?: Array<{
      department: string;
      completed: number;
      active: number;
      p50_wait: number;
      p90_wait: number;
    }>;
  };
  incidents?: { codeBlueActive: number; nurseCallsOpen: number };
  live?: boolean;
}

export function useCommandCenterData(intervalMs = 30_000) {
  const [snapshot, setSnapshot] = useState<CommandSnapshot | null>(null);
  const [ops, setOps] = useState<OpsKPI[]>([]);
  const [clinical, setClinical] = useState<ClinicalAdoption[]>([]);
  const [quality, setQuality] = useState<QualityMetric[]>([]);
  const [displayData, setDisplayData] = useState<DisplayCommandData | null>(null);
  const [aiRecs, setAiRecs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ccRes, opsRes, clinRes, qualRes, displayRes] = await Promise.allSettled([
        api.get('/v1/analytics/command-center'),
        api.get('/v1/analytics/operational'),
        api.get('/v1/analytics/clinical'),
        api.get('/v1/analytics/quality'),
        fetch('/api/display/command').then((r) => r.json()),
      ]);
      if (ccRes.status === 'fulfilled') setSnapshot(ccRes.value.data?.data ?? null);
      if (opsRes.status === 'fulfilled') {
        const raw = opsRes.value.data?.data;
        setOps(Array.isArray(raw) ? raw : []);
      }
      if (clinRes.status === 'fulfilled') {
        const raw = clinRes.value.data?.data;
        setClinical(Array.isArray(raw) ? raw : []);
      }
      if (qualRes.status === 'fulfilled') {
        const raw = qualRes.value.data?.data;
        setQuality(Array.isArray(raw) ? raw : []);
      }
      if (displayRes.status === 'fulfilled' && displayRes.value?.success) {
        setDisplayData(displayRes.value);
      }
      setLastUpdated(new Date());
      setError(null);
      getCommandCenterAI()
        .then((r) => setAiRecs(r?.data?.recommendations || []))
        .catch(() => {});
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Failed to load command center data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, intervalMs);
    return () => clearInterval(id);
  }, [load, intervalMs]);

  return {
    snapshot,
    ops,
    clinical,
    quality,
    displayData,
    aiRecs,
    loading,
    error,
    lastUpdated,
    refresh: load,
  };
}
