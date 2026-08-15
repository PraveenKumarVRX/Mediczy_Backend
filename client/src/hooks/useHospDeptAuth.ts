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

// insurance-desk only: a hospital that logs in via the older, shared-tenant-
// credential flow (hospital-insurance/auth/login, still fully functional —
// see routes/hospital-insurance/auth.routes.js) lands on this same portal
// instead of the retired pages/hospital-insurance/* tree. That token has a
// different shape (no tokenType/jti) and is verified through its own
// endpoint, not /hospital/auth/verify.
const LEGACY_BRIDGE: Record<string, { tokenKey: string; verifyPath: string }> = {
  'insurance-desk': { tokenKey: 'hospitalInsuranceToken', verifyPath: '/hospital-insurance/auth/verify' },
};

export function useDeptAuth(deptKey: string, loginPath: string) {
  const navigate = useNavigate();
  const [deptData, setDeptData] = useState<DeptAuthData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const tokenKey   = `${deptKey}Token`;
  const refreshKey = `${deptKey}RefreshToken`;
  const dataKey    = `${deptKey}Data`;
  const legacy     = LEGACY_BRIDGE[deptKey];

  useEffect(() => {
    const token = localStorage.getItem(tokenKey);
    const legacyToken = !token && legacy ? localStorage.getItem(legacy.tokenKey) : null;

    if (!token && !legacyToken) {
      navigate(loginPath);
      setIsLoading(false);
      return;
    }

    if (legacyToken) {
      api
        .get(legacy.verifyPath, {
          headers: { Authorization: `Bearer ${legacyToken}` },
          skipAuth: true,
        } as any)
        .then((res) => {
          setDeptData(res.data?.user ?? null);
        })
        .catch(() => {
          localStorage.removeItem(legacy.tokenKey);
          navigate(loginPath);
        })
        .finally(() => setIsLoading(false));
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
    if (legacy) {
      localStorage.removeItem(legacy.tokenKey);
      localStorage.removeItem('hospitalInsuranceData');
      localStorage.removeItem('hospitalInsuranceSlug');
      localStorage.removeItem('token');
      localStorage.removeItem('userType');
    }
    navigate(loginPath);
  }, [navigate, deptKey, loginPath, refreshKey, legacy]);

  return { deptData, isLoading, logout };
}

export function clearDeptSession(deptKey: string) {
  localStorage.removeItem(`${deptKey}Token`);
  localStorage.removeItem(`${deptKey}RefreshToken`);
  localStorage.removeItem(`${deptKey}Data`);
}
