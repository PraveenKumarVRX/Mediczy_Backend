/**
 * Live HTTP health checks against the known services on this box — the
 * same manual `curl .../health` checks done throughout real incident
 * triage, made callable by an agent instead of a human typing them.
 */
const TIMEOUT_MS = 5000;

// Real, current service endpoints on this deployment. Deliberately a fixed
// list, not user-supplied — this tool answers "is my known fleet healthy",
// not "fetch this arbitrary URL".
const SERVICES = [
  { name: 'mediczy-server', url: 'http://127.0.0.1:8888/api/health' },
  { name: 'imaging-triage', url: 'http://127.0.0.1:8010/health' },
];

async function checkOne({ name, url }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const startedAt = Date.now();
  try {
    const res = await fetch(url, { signal: controller.signal });
    const latencyMs = Date.now() - startedAt;
    let body = null;
    try { body = await res.json(); } catch { /* non-JSON body is fine, still report status */ }
    return { name, url, ok: res.ok, http_status: res.status, latency_ms: latencyMs, body };
  } catch (err) {
    return { name, url, ok: false, http_status: null, latency_ms: Date.now() - startedAt, error: err.message };
  } finally {
    clearTimeout(timer);
  }
}

export async function getServiceHealth() {
  return Promise.all(SERVICES.map(checkOne));
}
