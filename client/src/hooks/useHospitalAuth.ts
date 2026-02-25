import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '@/utils/api';

export interface HospitalAuthData {
  id?: string | number;
  name?: string;
  email?: string;
  role?: string;
  plan?: string;
  subdomain?: string;
  slug?: string;
  [key: string]: unknown;
}

export function useHospitalAuth() {
  const navigate = useNavigate();
  const [hospitalData, setHospitalData] = useState<HospitalAuthData | null>(null);
  const [isVerified, setIsVerified] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('hospitalToken');
    if (!token) {
      navigate('/hospital/login');
      return;
    }

    api
      .get('/hospital/auth/verify', {
        headers: { Authorization: `Bearer ${token}` },
        // @ts-ignore — skipAuth is a custom flag consumed by the api interceptor
        skipAuth: true,
      })
      .then((res) => {
        const decoded = res.data?.hospital ?? res.data?.user ?? null;
        // Also merge any cached hospitalData from localStorage for richer display
        const cached = (() => {
          try {
            const raw = localStorage.getItem('hospitalData');
            return raw ? JSON.parse(raw) : null;
          } catch {
            return null;
          }
        })();
        setHospitalData({ ...(cached ?? {}), ...(decoded ?? {}) });
        setIsVerified(true);
      })
      .catch(() => {
        // Token invalid or revoked — attempt silent refresh before evicting
        const refreshToken = localStorage.getItem('hospitalRefreshToken');
        if (refreshToken) {
          api
            .post('/hospital/auth/refresh', { refreshToken }, { skipAuth: true } as any)
            .then((res) => {
              localStorage.setItem('hospitalToken', res.data.token);
              if (res.data.refreshToken) {
                localStorage.setItem('hospitalRefreshToken', res.data.refreshToken);
              }
              setIsVerified(true);
            })
            .catch(() => {
              clearHospitalSession();
              navigate('/hospital/login');
            });
        } else {
          clearHospitalSession();
          navigate('/hospital/login');
        }
      })
      .finally(() => setIsLoading(false));
  }, []);  

  const logout = useCallback(async (logoutAll = false) => {
    const refreshToken = localStorage.getItem('hospitalRefreshToken');
    try {
      await api.post(
        '/hospital/auth/logout',
        { refreshToken, logoutAll },
        { skipAuth: true } as any
      );
    } catch { /* ignore — clear client state regardless */ }
    clearHospitalSession();
    navigate('/hospital/login');
  }, [navigate]);

  return { hospitalData, isVerified, isLoading, logout };
}

function clearHospitalSession() {
  localStorage.removeItem('hospitalToken');
  localStorage.removeItem('hospitalRefreshToken');
  localStorage.removeItem('hospitalData');
}
