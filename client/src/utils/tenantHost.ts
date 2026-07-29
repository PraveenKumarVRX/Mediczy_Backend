/**
 * Tenant host helpers — resolve hospital/clinic slug from the browser Host.
 * Mirrors HospitalLogin subdomain detection for department portals.
 */

const PLATFORM_APEX = 'mediqzy.com';

const RESERVED_SUBDOMAINS = new Set([
  'www',
  'app',
  'api',
  'admin',
  'video',
  'cdn',
  'static',
  'mail',
  'status',
  'docs',
  'uat',
  'staging',
  'dev',
]);

/**
 * Returns the leftmost subdomain label for *.mediqzy.com hosts, or null
 * for apex / reserved platform hosts (app, api, www, ...).
 *
 * Examples:
 *   hycare.mediqzy.com      → "hycare"
 *   app.mediqzy.com         → null
 *   www.mediqzy.com         → null
 *   localhost               → null
 */
export function getTenantSubdomain(hostname = typeof window !== 'undefined' ? window.location.hostname : ''): string | null {
  const host = String(hostname || '').trim().toLowerCase();
  if (!host || host === 'localhost' || host === '127.0.0.1') return null;
  if (host === PLATFORM_APEX || host === `www.${PLATFORM_APEX}` || host === `app.${PLATFORM_APEX}`) {
    return null;
  }

  if (!host.endsWith(`.${PLATFORM_APEX}`)) return null;

  const label = host.slice(0, -(PLATFORM_APEX.length + 1)).split('.')[0];
  if (!label || RESERVED_SUBDOMAINS.has(label)) return null;
  return label;
}

export function slugToDisplayName(slug: string): string {
  return String(slug || '')
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
