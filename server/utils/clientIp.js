/**
 * Real client IP resolution behind Cloudflare.
 *
 * The request chain is Client -> Cloudflare -> nginx -> Node. nginx's
 * X-Real-IP/X-Forwarded-For are set from $remote_addr, which is Cloudflare's
 * own edge IP (it changes per-request/per-PoP, not the visitor's real IP).
 * Cloudflare's CF-Connecting-IP header carries the true client IP and nginx
 * does not strip it, so it reaches Node untouched — that's the trustworthy
 * source. Falls back to X-Forwarded-For / req.ip for non-Cloudflare traffic
 * (e.g. direct localhost/internal health checks).
 */
export function getClientIp(req) {
  const cfIp = req?.headers?.['cf-connecting-ip'];
  if (cfIp) return normalize(cfIp);

  const xff = req?.headers?.['x-forwarded-for'];
  if (xff) return normalize(String(xff).split(',')[0].trim());

  return normalize(req?.ip || req?.connection?.remoteAddress || '127.0.0.1');
}

function normalize(ip) {
  if (ip === '::1' || ip === '::ffff:127.0.0.1') return '127.0.0.1';
  return ip;
}

export default getClientIp;
