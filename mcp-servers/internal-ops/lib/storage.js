/**
 * Object storage (MinIO) reachability check — the exact diagnostic used to
 * catch the real minio.mediqzy.com outage during this project (Cloudflare
 * error 1033, tunnel down): DNS resolves fine but the origin doesn't
 * answer. A plain "can I reach it" HTTP check surfaces that immediately.
 */
const TIMEOUT_MS = 8000;

export async function checkObjectStorage() {
  const publicUrl = process.env.MINIO_PUBLIC_URL || process.env.MINIO_ENDPOINT;
  if (!publicUrl) {
    return { configured: false, message: 'Neither MINIO_PUBLIC_URL nor MINIO_ENDPOINT is set in the environment' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const startedAt = Date.now();
  try {
    const res = await fetch(publicUrl, { signal: controller.signal });
    return {
      configured: true,
      url: publicUrl,
      reachable: true,
      http_status: res.status,
      latency_ms: Date.now() - startedAt,
      note: res.status >= 500
        ? 'Non-2xx/4xx from the edge — check for a Cloudflare tunnel/origin issue (real precedent: error 1033)'
        : undefined,
    };
  } catch (err) {
    return {
      configured: true,
      url: publicUrl,
      reachable: false,
      error: err.message,
    };
  } finally {
    clearTimeout(timer);
  }
}
