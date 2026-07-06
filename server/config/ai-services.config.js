/**
 * AI Services Configuration — single source of truth for AI microservice endpoints
 * ================================================================================
 * Centralises URL resolution so every reader behaves consistently and a
 * self-hosted → cloud migration only needs env changes.
 */

function trimTrailingSlash(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

const toHttp = (u) =>
  trimTrailingSlash(u).replace(/^wss:\/\//i, 'https://').replace(/^ws:\/\//i, 'http://');

// ── SIB FastAPI (primary AI router) ─────────────────────────────────────────
export function resolveSibBaseUrl() {
  return trimTrailingSlash(
    process.env.SIB_URL
      || process.env.SIB_API_URL
      || process.env.SIB_FASTAPI_URL
      || 'http://localhost:8001'
  );
}

export const SIB_URL = resolveSibBaseUrl();

// ── Scribe services ─────────────────────────────────────────────────────────
export const GPU_SCRIBE_URL = trimTrailingSlash(process.env.SCRIBE_API_URL || 'http://localhost:8005');

export function resolveOfflineScribeUrl() {
  return trimTrailingSlash(
    process.env.OFFLINE_SCRIBE_URL
      || process.env.SCRIBE_SERVICE_URL
      || process.env.SCRIBE_URL
      || process.env.SCRIBE_API_URL
      || 'http://localhost:8006'
  );
}

export const OFFLINE_SCRIBE_URL = resolveOfflineScribeUrl();

// ── LiveKit ─────────────────────────────────────────────────────────────────
export function resolveLiveKitUrl() {
  return trimTrailingSlash(process.env.LIVEKIT_URL || process.env.LIVEKIT_API_URL || '');
}

export const LIVEKIT_URL = resolveLiveKitUrl();

export function isLiveKitCloudUrl(url = resolveLiveKitUrl()) {
  try {
    const parsed = new URL(String(url || ''));
    return parsed.hostname.endsWith('.livekit.cloud') || parsed.hostname === 'livekit.cloud';
  } catch {
    return /\.livekit\.cloud/i.test(String(url || ''));
  }
}

/** Alias for consumers expecting isLiveKitCloud() with no args */
export function isLiveKitCloud() {
  return isLiveKitCloudUrl(LIVEKIT_URL);
}

/**
 * Cloud-safe LiveKit health URL.
 * - explicit LIVEKIT_HEALTH_URL wins
 * - self-hosted: derive http(s) from ws URL
 * - cloud: null (no public :7880 health endpoint)
 */
export function resolveLiveKitHealthUrl() {
  if (process.env.LIVEKIT_HEALTH_URL) {
    return trimTrailingSlash(process.env.LIVEKIT_HEALTH_URL);
  }

  const liveKitUrl = resolveLiveKitUrl();
  if (!liveKitUrl) {
    return 'http://127.0.0.1:7880';
  }
  if (isLiveKitCloudUrl(liveKitUrl)) {
    return null;
  }

  try {
    const parsed = new URL(liveKitUrl);
    parsed.protocol = parsed.protocol === 'wss:' ? 'https:' : parsed.protocol === 'ws:' ? 'http:' : parsed.protocol;
    parsed.pathname = '/';
    parsed.search = '';
    parsed.hash = '';
    return trimTrailingSlash(parsed.toString());
  } catch {
    return toHttp(liveKitUrl);
  }
}

export function getAIServiceConfig() {
  const liveKitUrl = resolveLiveKitUrl();
  return {
    sibUrl: resolveSibBaseUrl(),
    offlineScribeUrl: resolveOfflineScribeUrl(),
    liveKitUrl,
    liveKitHealthUrl: resolveLiveKitHealthUrl(),
    liveKitUsesCloud: isLiveKitCloudUrl(liveKitUrl),
  };
}

export default getAIServiceConfig;
