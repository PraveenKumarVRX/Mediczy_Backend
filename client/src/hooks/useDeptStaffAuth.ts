/**
 * useDeptStaffAuth — auth hook for department staff portals.
 *
 * Unlike useDeptAuth (which verifies against /hospital/auth/verify),
 * this hook validates the JWT client-side by decoding the payload and
 * checking the `exp` claim. This works for dept staff tokens issued by
 * POST /api/{dept}/login, which are signed with JWT_CONFIG.SECRET and
 * are NOT accepted by the hospital auth endpoint.
 *
 * Security note: We only decode — never verify — the JWT here. The
 * backend verifies the signature on every API call. Client-side decoding
 * merely checks expiry so we can redirect early without an extra network
 * round-trip.
 */
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { clearDeptSession, DeptAuthData } from '@/hooks/useHospDeptAuth';

function decodeJWT(token: string): Record<string, unknown> | null {
  try {
    const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(b64));
  } catch {
    return null;
  }
}

export function useDeptStaffAuth(deptKey: string, loginPath: string) {
  const navigate = useNavigate();
  const tokenKey = `${deptKey}Token`;
  const dataKey  = `${deptKey}Data`;

  const [deptData, setDeptData]   = useState<DeptAuthData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem(tokenKey);

    if (!token) {
      clearDeptSession(deptKey);
      navigate(loginPath, { replace: true });
      setIsLoading(false);
      return;
    }

    const payload = decodeJWT(token);

    if (!payload) {
      // Malformed token
      clearDeptSession(deptKey);
      navigate(loginPath, { replace: true });
      setIsLoading(false);
      return;
    }

    const nowSec = Math.floor(Date.now() / 1000);
    if (typeof payload.exp === 'number' && payload.exp < nowSec) {
      // Token expired
      clearDeptSession(deptKey);
      navigate(loginPath, { replace: true });
      setIsLoading(false);
      return;
    }

    // Token is valid — merge cached data with decoded payload
    const cached: DeptAuthData = (() => {
      try {
        return JSON.parse(localStorage.getItem(dataKey) || '{}');
      } catch {
        return {};
      }
    })();

    setDeptData({ ...(payload as DeptAuthData), ...cached });
    setIsLoading(false);
  }, [deptKey, loginPath, tokenKey, dataKey]);

  const logout = useCallback(() => {
    clearDeptSession(deptKey);
    navigate(loginPath, { replace: true });
  }, [navigate, deptKey, loginPath]);

  return { deptData, isLoading, logout };
}
