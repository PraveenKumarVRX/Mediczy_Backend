import axios from "axios";
import { getToken } from "../hooks/auth"; // Import function to get stored token

// Resolve baseURL safely for local and remote access
const resolveBaseURL = () => {
  const envBase = import.meta.env.VITE_API_URL as string | undefined;
  const isBrowser = typeof window !== "undefined";
  if (!isBrowser) return envBase || "http://localhost:8000/api";

  const hostname = window.location.hostname;
  const isLocalHostName = hostname === "localhost" || hostname === "127.0.0.1";

  // If env points to localhost but the site isn't being accessed via localhost, use same-origin proxy
  if (envBase && envBase.includes("localhost") && !isLocalHostName) {
    return "/api";
  }

  // Prefer env base when it's not localhost or when we're on localhost; otherwise use proxy
  return envBase || "/api";
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
    // Respect explicit Authorization header if already set (e.g., admin token)
    const hasAuth = config.headers && (config.headers as any).Authorization;
    if (!hasAuth) {
      const token = getToken();
      if (token) {
        config.headers = { ...(config.headers || {}), Authorization: `Bearer ${token}` } as any;
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);

export default api;
