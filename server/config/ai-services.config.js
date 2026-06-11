/**
 * AI Services Configuration — single source of truth for AI microservice endpoints
 * ================================================================================
 * The codebase historically read AI service URLs ad-hoc with divergent env-var
 * names and defaults (SIB_URL vs SIB_API_URL vs SIB_FASTAPI_URL; scribe :8005
 * vs :8006; LiveKit health hardcoded to localhost:7880 which breaks on LiveKit
 * Cloud). Centralise resolution here so every reader behaves consistently and
 * a self-hosted → cloud migration only needs env changes.
 *
 * NOTE: defaults are kept identical to the previous per-file defaults to avoid
 * behavioural drift; this module only unifies precedence and adds cloud-safe
 * derivation helpers.
 */

const stripTrailingSlash = (u) => (u ? String(u).trim().replace(/\/+$/, '') : '');
const toHttp = (u) =>
  stripTrailingSlash(u).replace(/^wss:\/\//i, 'https://').replace(/^ws:\/\//i, 'http://');

// ── SIB FastAPI (primary AI router) ─────────────────────────────────────────
// Accept the three historical env names; prefer SIB_URL.
export const SIB_URL = stripTrailingSlash(
  process.env.SIB_URL || process.env.SIB_API_URL || process.env.SIB_FASTAPI_URL || 'http://localhost:8001'
);

// ── Scribe services ─────────────────────────────────────────────────────────
export const GPU_SCRIBE_URL = stripTrailingSlash(process.env.SCRIBE_API_URL || 'http://localhost:8005');
export const OFFLINE_SCRIBE_URL = stripTrailingSlash(
  process.env.OFFLINE_SCRIBE_URL || process.env.SCRIBE_API_URL || 'http://localhost:8006'
);

// ── LiveKit ─────────────────────────────────────────────────────────────────
// WebSocket URL used for tokens/agent dispatch. Prefer LIVEKIT_API_URL (https)
// converted to ws, else LIVEKIT_URL.
export const LIVEKIT_URL = stripTrailingSlash(process.env.LIVEKIT_URL || process.env.LIVEKIT_API_URL || '');

/** True when the configured LiveKit endpoint is LiveKit Cloud. */
export function isLiveKitCloud() {
  return /\.livekit\.cloud/i.test(LIVEKIT_URL);
}

/**
 * Cloud-safe LiveKit health URL.
 * - explicit LIVEKIT_HEALTH_URL wins
 * - else derive an http(s) URL from the configured ws URL
 * - else fall back to the legacy self-hosted local port
 * (Callers should treat Cloud specially: there is no public :7880 health
 *  endpoint, so prefer config-presence checks over pinging.)
 */
export function resolveLiveKitHealthUrl() {
  if (process.env.LIVEKIT_HEALTH_URL) return stripTrailingSlash(process.env.LIVEKIT_HEALTH_URL);
  if (LIVEKIT_URL) return toHttp(LIVEKIT_URL);
  return 'http://127.0.0.1:7880';
}

export default {
  SIB_URL,
  GPU_SCRIBE_URL,
  OFFLINE_SCRIBE_URL,
  LIVEKIT_URL,
  isLiveKitCloud,
  resolveLiveKitHealthUrl,
};
