import axios, { AxiosRequestConfig } from "axios";
import { getToken, getUserType } from "../hooks/auth"; // Import function to get stored token

// Resolve baseURL safely for local and remote access
const resolveBaseURL = () => {
  const envBase = import.meta.env.VITE_API_URL as string | undefined;
  const isBrowser = typeof window !== "undefined";
  const ensureApiSuffix = (base: string) => {
    const trimmed = base.replace(/\/+$/, "");
    try {
      const url = new URL(trimmed, isBrowser ? window.location.origin : "http://localhost");
      const path = url.pathname.replace(/\/+$/, "");
      if (!path || path === "/") {
        url.pathname = "/api";
        return url.toString().replace(/\/+$/, "");
      }
      if (!path.includes("/api")) {
        url.pathname = `${path}/api`;
        return url.toString().replace(/\/+$/, "");
      }
      return trimmed;
    } catch {
      if (!trimmed.endsWith("/api") && !trimmed.includes("/api")) {
        return `${trimmed}/api`;
      }
      return trimmed;
    }
  };
  if (!isBrowser) return envBase ? ensureApiSuffix(envBase) : "http://localhost:8000/api";

  const hostname = window.location.hostname;
  const isLocalHostName = hostname === "localhost" || hostname === "127.0.0.1";
  // Only treat private LAN IP access as a signal to use localhost API.
  // Any real domain (e.g., mediczy.com) must NOT be forced to localhost.
  const isPrivateLanIp =
    /^10\./.test(hostname) ||
    /^192\.168\./.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname);

  // For network access (like 192.168.1.72), use localhost API
  if (isPrivateLanIp && !isLocalHostName) {
    return "http://localhost:8000/api";
  }

  // If env points to localhost but the site isn't being accessed via localhost, use same-origin proxy
  if (envBase && envBase.includes("localhost") && !isLocalHostName) {
    return "/api";
  }

  // Prefer env base when available; otherwise use same-origin proxy.
  return envBase ? ensureApiSuffix(envBase) : "/api";
};

// Resolve tenant id from env or localStorage
const resolveTenantId = (): string | undefined => {
  try {
    const envTenant = import.meta.env.VITE_TENANT_ID as string | undefined;
    // Prefer explicit env variable when set
    if (envTenant && envTenant.trim()) return envTenant.trim();
    // Fall back to localStorage if available in browser
    if (typeof window !== "undefined") {
      const lsTenant = window.localStorage.getItem("tenantId") || window.localStorage.getItem("X-Tenant-ID");
      if (lsTenant && lsTenant.trim()) return lsTenant.trim();
    }
  } catch (e) {
    // no-op: keep requests working even if storage not accessible
  }
  return undefined;
};

// Create an Axios instance
const api = axios.create({
  baseURL: resolveBaseURL(),
  timeout: 30000, // 30 second timeout (video call initiation needs time for LiveKit + notifications)
  withCredentials: true, // Send httpOnly auth cookies on every request (web sessions)
});

// Attach token dynamically to every request
api.interceptors.request.use(
  (config) => {
    // Allow callers to explicitly skip auth injection (e.g., login endpoints)
    if ((config as any).skipAuth) {
      return config;
    }

    // Respect explicit Authorization header if already set (e.g., admin token)
    const hasAuth = config.headers && (config.headers as any).Authorization;
    if (!hasAuth) {
      const token = getToken();
      if (token) {
        config.headers = { ...(config.headers || {}), Authorization: `Bearer ${token}` } as any;
      }
    }

    // Inject tenant header when available and not already provided
    const hasTenantHeader = config.headers && (config.headers as any)["X-Tenant-ID"];
    if (!hasTenantHeader) {
      const tenantId = resolveTenantId();
      if (tenantId) {
        config.headers = { ...(config.headers || {}), "X-Tenant-ID": tenantId } as any;
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// ── Shared refresh state — one in-flight refresh across all user types ───────
let _isRefreshing = false;
let _refreshQueue: Array<(token: string) => void> = [];

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config as AxiosRequestConfig & { _retry?: boolean };

    // Only auto-refresh for team users hitting 401, not an already-retried request
    if (
      error.response?.status === 401 &&
      !originalRequest._retry &&
      typeof window !== "undefined" &&
      getUserType() === "team"
    ) {
      const refreshToken = window.localStorage.getItem("teamRefreshToken");
      if (!refreshToken) {
        window.location.href = "/team/login";
        return Promise.reject(error);
      }

      originalRequest._retry = true;

      // If a refresh is already in flight, queue this request until it resolves
      if (_isRefreshing) {
        return new Promise<string>((resolve) => {
          _refreshQueue.push(resolve);
        }).then((newToken) => {
          (originalRequest as any).headers = {
            ...(originalRequest.headers || {}),
            Authorization: `Bearer ${newToken}`,
          };
          return api(originalRequest);
        });
      }

      _isRefreshing = true;
      try {
        const { data } = await axios.post(
          `${api.defaults.baseURL}/team/auth/refresh`,
          { refreshToken },
          { skipAuth: true } as any
        );
        if (data.success && data.token) {
          window.localStorage.setItem("teamToken", data.token);
          if (data.refreshToken) {
            window.localStorage.setItem("teamRefreshToken", data.refreshToken);
          }
          // Resolve all queued requests with the new token
          _refreshQueue.forEach((cb) => cb(data.token));
          _refreshQueue = [];
          (originalRequest as any).headers = {
            ...(originalRequest.headers || {}),
            Authorization: `Bearer ${data.token}`,
          };
          return api(originalRequest);
        }
      } catch {
        // Refresh failed — clear team auth and redirect
      } finally {
        _isRefreshing = false;
      }

      // Refresh returned no success token or threw — clear and redirect
      window.localStorage.removeItem("teamToken");
      window.localStorage.removeItem("teamRefreshToken");
      window.localStorage.removeItem("userType");
      window.location.href = "/team/login";
    }

    // Admin 401 — clear session and redirect to admin login
    if (
      error.response?.status === 401 &&
      typeof window !== "undefined" &&
      getUserType() === "admin"
    ) {
      window.localStorage.removeItem("adminToken");
      window.localStorage.removeItem("token");
      window.localStorage.removeItem("userType");
      window.localStorage.removeItem("adminData");
      if (!window.location.pathname.startsWith("/admin/login")) {
        window.location.href = "/admin/login";
      }
    }

    // CRM 401 — auto-refresh or redirect
    if (
      error.response?.status === 401 &&
      !originalRequest._retry &&
      typeof window !== "undefined" &&
      getUserType() === "crm"
    ) {
      const crmRefresh = window.localStorage.getItem("crmRefreshToken");
      if (crmRefresh) {
        originalRequest._retry = true;
        try {
          const { data } = await axios.post(
            `${api.defaults.baseURL}/crm/auth/refresh`,
            { refreshToken: crmRefresh },
            { skipAuth: true } as any
          );
          if (data.success && data.token) {
            window.localStorage.setItem("crmToken", data.token);
            if (data.refreshToken) window.localStorage.setItem("crmRefreshToken", data.refreshToken);
            (originalRequest as any).headers = { ...(originalRequest.headers || {}), Authorization: `Bearer ${data.token}` };
            return api(originalRequest);
          }
        } catch {}
      }
      window.localStorage.removeItem("crmToken");
      window.localStorage.removeItem("crmRefreshToken");
      window.localStorage.removeItem("crmUserData");
      window.localStorage.removeItem("userType");
      if (!window.location.pathname.startsWith("/crm/login")) {
        window.location.href = "/crm/login";
      }
    }

    // Doctor 401 — try silent refresh first, then clear and redirect
    if (
      error.response?.status === 401 &&
      !originalRequest._retry &&
      typeof window !== "undefined" &&
      getUserType() === "doctor"
    ) {
      // Mark as retried IMMEDIATELY so concurrent 401s from other requests don't
      // each trigger their own refresh or fall through to the patient handler.
      originalRequest._retry = true;

      // Support both old sessions ("refreshToken") and new sessions ("doctorRefreshToken")
      const refreshToken =
        window.localStorage.getItem("doctorRefreshToken") ||
        window.localStorage.getItem("refreshToken");

      if (refreshToken) {
        if (_isRefreshing) {
          return new Promise<string>((resolve) => {
            _refreshQueue.push(resolve);
          }).then((newToken) => {
            (originalRequest as any).headers = {
              ...(originalRequest.headers || {}),
              Authorization: `Bearer ${newToken}`,
            };
            return api(originalRequest);
          });
        }

        _isRefreshing = true;
        try {
          const { data } = await axios.post(
            `${api.defaults.baseURL}/doctors/refresh`,
            { refreshToken },
            { skipAuth: true } as any
          );
          if (data.success && data.token) {
            window.localStorage.setItem("doctorToken", data.token);
            window.localStorage.setItem("token", data.token);
            // Migrate old "refreshToken" key to the dedicated doctor key
            const nextRefresh = data.refreshToken || refreshToken;
            window.localStorage.setItem("doctorRefreshToken", nextRefresh);
            window.localStorage.removeItem("refreshToken");
            _refreshQueue.forEach((cb) => cb(data.token));
            _refreshQueue = [];
            (originalRequest as any).headers = {
              ...(originalRequest.headers || {}),
              Authorization: `Bearer ${data.token}`,
            };
            return api(originalRequest);
          }
        } catch {
          // Refresh failed — fall through to clear session
        } finally {
          _isRefreshing = false;
        }
      }

      // No refresh token or refresh failed — clear session and redirect to doctor login.
      // Clear userType LAST so any concurrent 401s still match getUserType() === "doctor"
      // and don't cascade into the patient handler below.
      window.localStorage.removeItem("doctorToken");
      window.localStorage.removeItem("doctorRefreshToken");
      window.localStorage.removeItem("refreshToken");
      window.localStorage.removeItem("token");
      window.localStorage.removeItem("userType");
      if (!window.location.pathname.startsWith("/doctor/login")) {
        window.location.href = "/doctor/login";
      }
      return Promise.reject(error);
    }

    // Lab 401 — clear stale token and redirect to lab login
    if (
      error.response?.status === 401 &&
      typeof window !== "undefined" &&
      getUserType() === "lab"
    ) {
      const hadToken = window.localStorage.getItem("labToken");
      if (hadToken) {
        window.localStorage.removeItem("labToken");
        window.localStorage.removeItem("token");
        window.localStorage.removeItem("userType");
        window.localStorage.removeItem("labData");
        if (!window.location.pathname.startsWith("/lab/login")) {
          window.location.href = "/lab/login";
        }
      }
    }

    // Patient/user 401 — attempt silent token refresh before redirecting to login.
    // The server sets httpOnly cookies, so the refresh call goes out with withCredentials:true
    // and the cookie is rotated transparently. The refreshToken in localStorage is a fallback
    // for environments where the cookie path scoping prevents automatic sending.
    if (
      error.response?.status === 401 &&
      !originalRequest._retry &&
      typeof window !== "undefined" &&
      (getUserType() === "user" || getUserType() === "individual" || !getUserType())
    ) {
      const refreshToken = window.localStorage.getItem("refreshToken");

      // If no refresh token at all, fall through to hard redirect
      if (!refreshToken) {
        window.localStorage.removeItem("token");
        window.localStorage.removeItem("userId");
        window.localStorage.removeItem("userData");
        window.localStorage.removeItem("userType");
        window.localStorage.removeItem("refreshToken");
        if (!window.location.pathname.startsWith("/login")) {
          window.location.href = "/login";
        }
        return Promise.reject(error);
      }

      originalRequest._retry = true;

      // Queue concurrent requests while refresh is in-flight
      if (_isRefreshing) {
        return new Promise<string>((resolve) => {
          _refreshQueue.push(resolve);
        }).then((newToken) => {
          (originalRequest as any).headers = {
            ...(originalRequest.headers || {}),
            Authorization: `Bearer ${newToken}`,
          };
          return api(originalRequest);
        });
      }

      _isRefreshing = true;
      try {
        // withCredentials:true sends the msz_refresh httpOnly cookie automatically;
        // the body refreshToken is a belt-and-suspenders fallback.
        const { data } = await axios.post(
          `${api.defaults.baseURL}/auth/refresh`,
          { refreshToken },
          { skipAuth: true, withCredentials: true } as any
        );
        if (data.success && data.accessToken) {
          window.localStorage.setItem("token", data.accessToken);
          if (data.refreshToken) {
            window.localStorage.setItem("refreshToken", data.refreshToken);
          }
          _refreshQueue.forEach((cb) => cb(data.accessToken));
          _refreshQueue = [];
          (originalRequest as any).headers = {
            ...(originalRequest.headers || {}),
            Authorization: `Bearer ${data.accessToken}`,
          };
          return api(originalRequest);
        }
      } catch {
        // Refresh failed — clean up and redirect
      } finally {
        _isRefreshing = false;
      }

      // Refresh returned no token or threw — clear everything and force re-login
      window.localStorage.removeItem("token");
      window.localStorage.removeItem("userId");
      window.localStorage.removeItem("userData");
      window.localStorage.removeItem("userType");
      window.localStorage.removeItem("refreshToken");
      if (!window.location.pathname.startsWith("/login")) {
        window.location.href = "/login";
      }
    }

    return Promise.reject(error);
  }
);

export default api;
