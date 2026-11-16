/**
 * The installation's branding, loaded once before the first render from GET /api/branding (public,
 * pre-login; served by the CRM API from the tenant record, which the control plane keeps in step).
 * Nothing hospital-specific is compiled into this app: one build serves every installation.
 */
type Brand = {
  name: string;
  fullName: string;
  logo: string;
  /** Prefix of this installation's WhatsApp template names (for example "medstar_"), hidden in labels. */
  templatePrefix: string;
  support: { email: string };
};

export const BRAND: Brand = {
  name: 'CRM',
  fullName: 'CRM',
  logo: '/brand/crm.svg',
  templatePrefix: '',
  support: { email: '' },
};

const safeUrl = (v: unknown) => typeof v === 'string' && (/^\/[\w./-]*$/.test(v) || /^https:\/\/[^\s"'<>]+$/.test(v)) ? v : null;

export async function loadBranding(timeoutMs = 2500): Promise<void> {
  let favicon: string | null = null;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch('/api/branding', { signal: ctrl.signal, credentials: 'same-origin' });
    clearTimeout(timer);
    if (res.ok) {
      const b = await res.json();
      if (typeof b.name === 'string' && b.name.trim()) BRAND.name = b.name.trim().slice(0, 60);
      BRAND.logo = safeUrl(b.logoUrl) || BRAND.logo;
      favicon = safeUrl(b.faviconUrl);
      if (typeof b.templatePrefix === 'string' && /^[a-z0-9_]{0,30}$/.test(b.templatePrefix)) BRAND.templatePrefix = b.templatePrefix;
      if (typeof b.supportEmail === 'string' && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(b.supportEmail)) BRAND.support.email = b.supportEmail;
    }
  } catch { /* the defaults stand */ }
  BRAND.fullName = BRAND.name === 'CRM' ? 'CRM' : `${BRAND.name} CRM`;
  document.title = BRAND.fullName;
  const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (icon) icon.href = favicon || BRAND.logo;
}

/** A template name without this installation's prefix, for display ("medstar_doctor_cme" -> "doctor cme"). */
export const templateLabel = (name: string) =>
  String(name || '').replace(BRAND.templatePrefix ? new RegExp(`^${BRAND.templatePrefix}`) : /^$/, '').replace(/_/g, ' ');

export default BRAND;
