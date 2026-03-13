/**
 * API Client Configuration
 * Centralized axios instance for API calls
 *
 * Uses role-aware token detection so portal-specific tokens
 * (teamToken, adminToken, doctorToken, etc.) are sent correctly.
 */

import axios from 'axios';
import { getToken, getUserType } from '@/hooks/auth';

const ROLE_LOGIN_PATHS: Record<string, string> = {
  user: '/login',
  doctor: '/doctor/login',
  admin: '/admin/login',
  team: '/team/login',
  nurse: '/nurse/login',
  assistant: '/assistant/login',
  corporate: '/corporate/login',
  hospital: '/hospital/login',
  clinic: '/clinic/login',
  lab: '/lab/login',
  pharmacy: '/pharmacy/login',
  ambulance: '/ambulance/login',
  homecare: '/homecare/login',
  tpa: '/tpa/login',
  psu: '/psu/login',
  insurer: '/insurer/login',
  ngo: '/ngo/login',
};

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000/api',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token (role-aware)
api.interceptors.request.use(
  (config) => {
    // Skip auth injection when explicitly requested
    if ((config as any).skipAuth) return config;

    const hasAuth = config.headers && (config.headers as any).Authorization;
    if (!hasAuth) {
      const token = getToken();
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor for error handling (role-aware redirect)
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const userType = getUserType();
      const loginPath = (userType && ROLE_LOGIN_PATHS[userType]) || '/login';
      window.location.href = loginPath;
    }
    return Promise.reject(error);
  }
);

export default api;
