import { useCallback, useEffect, useState } from 'react';
import api from '@/utils/api';

const PORTAL_CACHE_TTL_MS = 30_000;

export interface ITEDPPortalData {
  source: string;
  organizationId: number | null;
  kpis: Array<{ label: string; value: string; sub: string }>;
  tickets: Array<{ id: string; title: string; department: string; priority: string; status: string; owner: string; aging: string; note?: string }>;
  users: Array<{ id: string; name: string; department: string; role: string; state: string; access: string; lastSeen: string; note?: string }>;
  assets: Array<{ asset: string; assetTag: string; type: string; location: string; lifecycle: string; labelStatus: string; owner: string; note?: string }>;
  assetLabels: Array<{ assetTag: string; asset: string; template: string; status: string; lastAction: string; owner: string; note?: string }>;
  systems: Array<{ name: string; status: string; uptime: string; cpu: string; memory: string; owner: string }>;
  network: Array<{ zone: string; health: string; wan: string; wifi: string; latency: string }>;
  networkAdmin: Array<{ id: string; scope: string; admin: string; changeWindow: string; configState: string; note: string }>;
  backups: Array<{ workload: string; lastRun: string; result: string; rpo: string; owner: string }>;
  security: Array<{ control: string; state: string; owner: string; note: string }>;
  access: Array<{ queue: string; count: string; detail: string; status: string }>;
  reports: Array<{ name: string; cadence: string; audience: string; status: string }>;
  settings: Array<{ title: string; text: string }>;
  support: Array<{ title: string; text: string }>;
  ticketHistory: Array<{ action: string; resourceType: string; resourceId: string; actor: string; time: string; summary: string }>;
  userHistory: Array<{ action: string; resourceType: string; resourceId: string; actor: string; time: string; summary: string }>;
  assetHistory: Array<{ action: string; resourceType: string; resourceId: string; actor: string; time: string; summary: string }>;
  networkHistory: Array<{ action: string; resourceType: string; resourceId: string; actor: string; time: string; summary: string }>;
  workQueues: Array<{ label: string; value: string; detail: string; tone: string }>;
  serviceHeatmap: string[][];
}

const getITEDPAuthHeaders = () => {
  const token = window.localStorage.getItem('it-edpToken');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

let portalCache: ITEDPPortalData | null = null;
let portalCacheFetchedAt = 0;
let inflightPortalRequest: Promise<ITEDPPortalData> | null = null;

const itEdpRequest = async <T>(method: 'post' | 'patch' | 'delete', path: string, payload?: Record<string, unknown>) => {
  const response = method === 'delete'
    ? await api.delete(path, { headers: getITEDPAuthHeaders() })
    : await api[method](path, payload, {
        headers: getITEDPAuthHeaders(),
      });
  return response.data?.data as T;
};

export const fetchITEDPPortalData = async ({ force = false }: { force?: boolean } = {}) => {
  const isCacheFresh = portalCache && (Date.now() - portalCacheFetchedAt) < PORTAL_CACHE_TTL_MS;
  if (!force && isCacheFresh) {
    return portalCache;
  }

  if (!force && inflightPortalRequest) {
    return inflightPortalRequest;
  }

  inflightPortalRequest = api.get('/hospital/staff/it-edp/portal-data', {
    headers: getITEDPAuthHeaders(),
  }).then((response) => {
    const nextData = response.data?.data as ITEDPPortalData;
    portalCache = nextData;
    portalCacheFetchedAt = Date.now();
    return nextData;
  }).finally(() => {
    inflightPortalRequest = null;
  });

  return inflightPortalRequest;
};

export const createITEDPTicket = (payload: {
  title: string;
  department?: string;
  priority?: string;
  status?: string;
  owner?: string;
  aging?: string;
  note?: string;
}) => itEdpRequest<ITEDPPortalData['tickets'][number]>('post', '/hospital/staff/it-edp/tickets', payload);

export const updateITEDPTicket = (id: string, payload: {
  title?: string;
  department?: string;
  priority?: string;
  status?: string;
  owner?: string;
  aging?: string;
  note?: string;
}) => itEdpRequest<ITEDPPortalData['tickets'][number]>('patch', `/hospital/staff/it-edp/tickets/${encodeURIComponent(id)}`, payload);

export const deleteITEDPTicket = (id: string) => itEdpRequest<{ id: string }>('delete', `/hospital/staff/it-edp/tickets/${encodeURIComponent(id)}`);

export const createITEDPUserProvision = (payload: {
  name: string;
  department?: string;
  role?: string;
  state?: string;
  access?: string;
  lastSeen?: string;
  note?: string;
}) => itEdpRequest<ITEDPPortalData['users'][number]>('post', '/hospital/staff/it-edp/users', payload);

export const updateITEDPUserProvision = (id: string, payload: {
  name?: string;
  department?: string;
  role?: string;
  state?: string;
  access?: string;
  lastSeen?: string;
  note?: string;
}) => itEdpRequest<ITEDPPortalData['users'][number]>('patch', `/hospital/staff/it-edp/users/${encodeURIComponent(id)}`, payload);

export const deleteITEDPUserProvision = (id: string) => itEdpRequest<{ id: string }>('delete', `/hospital/staff/it-edp/users/${encodeURIComponent(id)}`);

export const createITEDPAsset = (payload: {
  asset: string;
  assetTag?: string;
  type?: string;
  location?: string;
  lifecycle?: string;
  labelStatus?: string;
  owner?: string;
  note?: string;
}) => itEdpRequest<ITEDPPortalData['assets'][number]>('post', '/hospital/staff/it-edp/assets', payload);

export const updateITEDPAsset = (id: string, payload: {
  asset?: string;
  type?: string;
  location?: string;
  lifecycle?: string;
  labelStatus?: string;
  owner?: string;
  note?: string;
}) => itEdpRequest<ITEDPPortalData['assets'][number]>('patch', `/hospital/staff/it-edp/assets/${encodeURIComponent(id)}`, payload);

export const deleteITEDPAsset = (id: string) => itEdpRequest<{ assetTag: string }>('delete', `/hospital/staff/it-edp/assets/${encodeURIComponent(id)}`);

export const createITEDPAssetLabel = (payload: {
  assetTag: string;
  asset?: string;
  template?: string;
  status?: string;
  owner?: string;
  note?: string;
}) => itEdpRequest<ITEDPPortalData['assetLabels'][number]>('post', '/hospital/staff/it-edp/asset-labels', payload);

export const updateITEDPAssetLabel = (id: string, payload: {
  asset?: string;
  template?: string;
  status?: string;
  owner?: string;
  note?: string;
}) => itEdpRequest<ITEDPPortalData['assetLabels'][number]>('patch', `/hospital/staff/it-edp/asset-labels/${encodeURIComponent(id)}`, payload);

export const deleteITEDPAssetLabel = (id: string) => itEdpRequest<{ assetTag: string }>('delete', `/hospital/staff/it-edp/asset-labels/${encodeURIComponent(id)}`);

export const createITEDPNetworkAdmin = (payload: {
  scope: string;
  admin?: string;
  changeWindow?: string;
  configState?: string;
  note?: string;
}) => itEdpRequest<ITEDPPortalData['networkAdmin'][number]>('post', '/hospital/staff/it-edp/network-admin', payload);

export const updateITEDPNetworkAdmin = (id: string, payload: {
  scope?: string;
  admin?: string;
  changeWindow?: string;
  configState?: string;
  note?: string;
}) => itEdpRequest<ITEDPPortalData['networkAdmin'][number]>('patch', `/hospital/staff/it-edp/network-admin/${encodeURIComponent(id)}`, payload);

export const deleteITEDPNetworkAdmin = (id: string) => itEdpRequest<{ id: string }>('delete', `/hospital/staff/it-edp/network-admin/${encodeURIComponent(id)}`);

export const useITEDPPortalData = () => {
  const [data, setData] = useState<ITEDPPortalData | null>(portalCache);
  const [loading, setLoading] = useState(!portalCache);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (options: { force?: boolean; silent?: boolean } = {}) => {
    if (!options.silent) {
      setLoading(!portalCache);
    }

    try {
      const nextData = await fetchITEDPPortalData({ force: options.force });
      setData(nextData);
      setError(null);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? err?.message ?? 'Failed to fetch IT/EDP portal data');
    } finally {
      if (!options.silent || !portalCache) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    refresh({ force: !portalCache, silent: Boolean(portalCache) });
  }, [refresh]);

  return { data, loading, error, refresh };
};