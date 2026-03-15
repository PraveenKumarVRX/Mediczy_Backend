/**
 * useHospDeptAuth — generic auth hook for hospital department portals.
 *
 * Each department portal (Accounts, MRD, HR, IT/EDP, OT, ICU, Insurance Desk)
 * stores its own token in localStorage under `{deptKey}Token`. Verification
 * is performed against the shared hospital auth endpoint.
 */
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '@/utils/api';

export interface DeptAuthData {
  id?: string | number;
  name?: string;
  email?: string;
  department?: string;
  role?: string;
  hospitalName?: string;
  [key: string]: unknown;
}

export function useDeptAuth(deptKey: string, loginPath: string) {
  const navigate = useNavigate();
  const [deptData, setDeptData] = useState<DeptAuthData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const tokenKey   = `${deptKey}Token`;
  const refreshKey = `${deptKey}RefreshToken`;
  const dataKey    = `${deptKey}Data`;

  useEffect(() => {
    const token = localStorage.getItem(tokenKey);
    if (!token) {
      navigate(loginPath);
      setIsLoading(false);
      return;
    }

    api
      .get('/hospital/auth/verify', {
        headers: { Authorization: `Bearer ${token}` },
        skipAuth: true,
      } as any)
      .then((res) => {
        const decoded = res.data?.hospital ?? res.data?.user ?? null;
        const cached  = (() => {
          try { return JSON.parse(localStorage.getItem(dataKey) || 'null'); } catch { return null; }
        })();
        setDeptData({ ...(cached ?? {}), ...(decoded ?? {}) });
      })
      .catch(() => {
        const refreshToken = localStorage.getItem(refreshKey);
        if (refreshToken) {
          api
            .post('/hospital/auth/refresh', { refreshToken }, { skipAuth: true } as any)
            .then((res) => {
              localStorage.setItem(tokenKey, res.data.token);
              if (res.data.refreshToken) localStorage.setItem(refreshKey, res.data.refreshToken);
            })
            .catch(() => {
              clearDeptSession(deptKey);
              navigate(loginPath);
            });
        } else {
          clearDeptSession(deptKey);
          navigate(loginPath);
        }
      })
      .finally(() => setIsLoading(false));
   
  }, [deptKey, loginPath]);

  const logout = useCallback(async () => {
    try {
      await api.post(
        '/hospital/auth/logout',
        { refreshToken: localStorage.getItem(refreshKey) },
        { skipAuth: true } as any
      );
    } catch { /* ignore */ }
    clearDeptSession(deptKey);
    navigate(loginPath);
  }, [navigate, deptKey, loginPath, refreshKey]);

  return { deptData, isLoading, logout };
}

export function clearDeptSession(deptKey: string) {
  localStorage.removeItem(`${deptKey}Token`);
  localStorage.removeItem(`${deptKey}RefreshToken`);
  localStorage.removeItem(`${deptKey}Data`);
}
