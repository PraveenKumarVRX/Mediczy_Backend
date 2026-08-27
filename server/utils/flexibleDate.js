/**
 * Flexible date normalization for bulk-upload QC.
 *
 * Real bug this exists to fix: the corporate bulk-employee-upload CSV
 * template instructs YYYY-MM-DD, but once a user opens that CSV in Excel
 * to fill it in, Excel silently reformats the Date of Birth column into a
 * locale short-date display (D/M/YYYY or M/D/YYYY, sometimes a 2-digit
 * year) and writes that text back out on save — CSV has no underlying
 * date serial to preserve. The QC check used to be a bare
 * `/^\d{4}-\d{2}-\d{2}$/` regex with no parsing step at all, so every row
 * with a reformatted date failed outright (24/24 in one real upload).
 *
 * This does NOT guess when a date is genuinely ambiguous (e.g. "5/6/1998"
 * is validly either May 6 or June 5) — a wrong date of birth has real
 * consequences on a healthcare platform (eligibility, insurance). It only
 * resolves a date when exactly one of the two readings (day-first vs
 * month-first) produces a real calendar date; otherwise it reports the
 * ambiguity so the uploader can fix it by hand, same as any other QC
 * failure.
 */

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
const DATE_PARTS_RE = /^(\d{1,4})[/\-.](\d{1,2})[/\-.](\d{1,4})$/;

// 00-30 -> 20xx, 31-99 -> 19xx — the standard two-digit-year pivot, and
// also the sane reading for every real case seen so far in DOB data
// (e.g. "91" -> 1991, not 2091).
function pivotTwoDigitYear(yy) {
  return yy <= 30 ? 2000 + yy : 1900 + yy;
}

function isValidCalendarDate(year, month, day) {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

function toIso(year, month, day) {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Normalizes a raw date cell value. Returns:
 *  - `{ iso, ambiguous: false }` — already ISO, or exactly one of the two
 *    readings produced a valid calendar date; `iso` is safe to store.
 *  - `{ iso, ambiguous: true }` — BOTH day-first and month-first readings
 *    produced valid, DIFFERENT calendar dates; `iso` here is only the
 *    day-first reading, for display in an error message — never store it.
 *  - `null` — not parseable as a date in any supported format at all.
 */
export function normalizeFlexibleDate(raw) {
  const value = String(raw ?? '').trim();
  if (!value) return null;
  if (ISO_RE.test(value)) return { iso: value, ambiguous: false };

  const m = value.match(DATE_PARTS_RE);
  if (!m) return null;
  const [, p1, p2, p3] = m;

  let year, a, b; // a/b are the two non-year parts, in their original order
  if (p1.length === 4) {
    year = parseInt(p1, 10);
    a = parseInt(p2, 10);
    b = parseInt(p3, 10);
  } else if (p3.length === 4 || p3.length === 2) {
    year = p3.length === 4 ? parseInt(p3, 10) : pivotTwoDigitYear(parseInt(p3, 10));
    a = parseInt(p1, 10);
    b = parseInt(p2, 10);
  } else {
    return null;
  }

  const dayFirstValid = isValidCalendarDate(year, b, a); // a=day, b=month
  const monthFirstValid = isValidCalendarDate(year, a, b); // a=month, b=day

  if (dayFirstValid && monthFirstValid && a !== b) {
    return { iso: toIso(year, b, a), ambiguous: true };
  }
  if (dayFirstValid) return { iso: toIso(year, b, a), ambiguous: false };
  if (monthFirstValid) return { iso: toIso(year, a, b), ambiguous: false };
  return null;
}
