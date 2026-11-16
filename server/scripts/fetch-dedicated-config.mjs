// Pull-only: the dedicated instance asks the control plane for its current config.
// Mirrors report-dedicated-installation.mjs's request conventions (same token format,
// same strict origin check) but reads instead of writes. No endpoint exists on the
// control plane for this yet — callers must treat every failure as "nothing changed".
// Contract (agreed with the Mediqzy control plane, 2026-11-15):
//  GET {origin}/api/admin/dedicated-installations/config, Authorization: Bearer <connector key>.
//  If a revision was applied before, sends If-None-Match: "<revision>"; 304 means unchanged.
//  200 body: { revision: string, mobileApps?: object|null, branding?: object|null }. A 200 with
//  the already-applied revision is also treated as unchanged. 404 = endpoint not deployed (no-op).
export async function fetchDedicatedInstallationConfig({ origin, token, revision = null, fetcher = fetch }) {
  const url = new URL(origin);
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('Control-plane URL must be an HTTPS origin');
  if (!/^mdi_[a-f0-9]{64}$/.test(token)) throw new Error('Invalid connector credential');
  const response = await fetcher(new URL('/api/admin/dedicated-installations/config', url), {
    method: 'GET', redirect: 'error', signal: AbortSignal.timeout(15000),
    headers: { Authorization: `Bearer ${token}`, ...(revision ? { 'If-None-Match': `"${String(revision).replace(/"/g, '')}"` } : {}) },
  });
  if (response.status === 304) return null; // Unchanged since the revision we sent.
  if (response.status === 404) return null; // Not implemented on the control plane yet — not an error.
  if (!response.ok) throw new Error(`Config fetch rejected (HTTP ${response.status})`);
  const body = await response.json();
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Control plane returned an invalid config body');
  if (body.revision != null && typeof body.revision !== 'string') throw new Error('Invalid revision');
  if (body.mobileApps != null && (typeof body.mobileApps !== 'object' || Array.isArray(body.mobileApps))) throw new Error('Invalid mobileApps payload');
  if (body.branding != null && (typeof body.branding !== 'object' || Array.isArray(body.branding))) throw new Error('Invalid branding payload');
  return { revision: body.revision ?? null, mobileApps: body.mobileApps ?? null, branding: body.branding ?? null };
}
