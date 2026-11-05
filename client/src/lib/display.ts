/**
 * Shared display helpers to stop raw/placeholder data leaking into the UI.
 *
 * These guard the common QA failures: raw ISO timestamps rendered verbatim
 * ("2026-10-27T12:34:51.709Z"), "[object Object]" from rendering an object,
 * "undefined"/"null"/"NaN" text, and "₹?" / "Rs. Not provided" money.
 *
 * Every helper takes an optional `fallback` shown when the value is missing or
 * unrenderable, so callers never have to hand-roll placeholder text.
 */

const BAD_TOKENS = new Set(['', 'undefined', 'null', 'nan', '[object object]', 'invalid date']);

/** True when a value is effectively empty / an unrenderable placeholder. */
const isBlank = (value: unknown): boolean => {
  if (value === null || value === undefined) return true;
  if (typeof value === 'number') return Number.isNaN(value);
  if (typeof value === 'object') return true; // objects/arrays should never be rendered as text
  return BAD_TOKENS.has(String(value).trim().toLowerCase());
};

/** Safe text: returns the value as a string, or `fallback` for blanks/objects/placeholders. */
export const safeText = (value: unknown, fallback = '—'): string =>
  isBlank(value) ? fallback : String(value).trim();

/**
 * Format a date value for display. Accepts Date | ISO string | epoch ms.
 * Returns `fallback` for missing/invalid dates instead of a raw ISO string.
 */
export const formatDate = (
  value: unknown,
  fallback = '—',
  opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' },
): string => {
  if (value === null || value === undefined || value === '') return fallback;
  const d = value instanceof Date ? value : new Date(value as string | number);
  if (Number.isNaN(d.getTime())) return fallback;
  try {
    return new Intl.DateTimeFormat('en-IN', { ...opts, timeZone: opts.timeZone || 'Asia/Kolkata' }).format(d);
  } catch {
    return fallback;
  }
};

/** Date + time variant. */
export const formatDateTime = (value: unknown, fallback = '—'): string =>
  formatDate(value, fallback, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/**
 * Format an amount as INR. Returns `fallback` (default "—", not "₹?") when the
 * amount is missing or not a finite number, so the rupee symbol never pairs
 * with "?" or "Not provided".
 */
export const formatMoney = (value: unknown, fallback = '—'): string => {
  const n = typeof value === 'number' ? value : Number(value);
  if (value === null || value === undefined || value === '' || !Number.isFinite(n)) return fallback;
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);
  } catch {
    return `₹${Math.round(n).toLocaleString('en-IN')}`;
  }
};

/**
 * Render an address that may be a string or an object (city/line/state/…).
 * Guards the "[object Object], undefined" failure.
 */
export const formatAddress = (value: unknown, fallback = '—'): string => {
  if (!value) return fallback;
  if (typeof value === 'string') return isBlank(value) ? fallback : value.trim();
  if (typeof value === 'object') {
    const a = value as Record<string, unknown>;
    const parts = [a.line1 || a.address || a.street, a.area || a.locality, a.city, a.state, a.pincode || a.zip || a.zipCode]
      .map((p) => (isBlank(p) ? '' : String(p).trim()))
      .filter(Boolean);
    return parts.length ? parts.join(', ') : fallback;
  }
  return fallback;
};
