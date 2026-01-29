import axios from "axios";
import { getToken } from "../hooks/auth"; // Import function to get stored token

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
  timeout: 10000, // 10 second timeout
  withCredentials: false, // Disable credentials for CORS
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

export default api;
