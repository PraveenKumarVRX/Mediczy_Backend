/**
 * Real bug: bulk corporate-employee upload — 24/24 rows failed with
 * "Date of Birth must be YYYY-MM-DD" even though every date was real and
 * valid. Root cause: the CSV template's date columns get reformatted by
 * Excel into a locale short-date (D/M/YYYY, M/D/YYYY, 2-digit year) the
 * moment a user opens and re-saves the file, and the old QC check was a
 * bare ISO regex with no parsing step at all. These are the exact dates
 * from that real failed upload.
 */
import { normalizeFlexibleDate } from '../utils/flexibleDate.js';

describe('normalizeFlexibleDate', () => {
  test('already-ISO passes through unchanged', () => {
    expect(normalizeFlexibleDate('1990-05-12')).toEqual({ iso: '1990-05-12', ambiguous: false });
  });

  test('unambiguous day-first date (day > 12) resolves correctly — real case from the failed upload', () => {
    expect(normalizeFlexibleDate('16/10/91')).toEqual({ iso: '1991-10-16', ambiguous: false });
  });

  test('unambiguous month-first date (second part > 12) resolves correctly — real case from the failed upload', () => {
    expect(normalizeFlexibleDate('5/25/1996')).toEqual({ iso: '1996-05-25', ambiguous: false });
    expect(normalizeFlexibleDate('5/14/1998')).toEqual({ iso: '1998-05-14', ambiguous: false });
  });

  test('genuinely ambiguous dates are flagged, never silently guessed — a wrong DOB has real consequences', () => {
    const a = normalizeFlexibleDate('11/2/1991');
    expect(a.ambiguous).toBe(true);
    const b = normalizeFlexibleDate('3/5/1992');
    expect(b.ambiguous).toBe(true);
  });

  test('two-digit year pivots sanely (91 -> 1991, not 2091)', () => {
    expect(normalizeFlexibleDate('16/10/91').iso).toBe('1991-10-16');
    expect(normalizeFlexibleDate('1/1/05').iso).toMatch(/^2005-/);
  });

  test('dash and dot separators are also accepted, not just slash', () => {
    expect(normalizeFlexibleDate('16-10-1991')).toEqual({ iso: '1991-10-16', ambiguous: false });
    expect(normalizeFlexibleDate('16.10.1991')).toEqual({ iso: '1991-10-16', ambiguous: false });
  });

  test('genuinely invalid dates (no valid interpretation) return null, not a guessed date', () => {
    expect(normalizeFlexibleDate('13/13/1990')).toBeNull();
    expect(normalizeFlexibleDate('31/2/1990')).toBeNull();
    expect(normalizeFlexibleDate('not-a-date')).toBeNull();
    expect(normalizeFlexibleDate('')).toBeNull();
    expect(normalizeFlexibleDate(null)).toBeNull();
  });

  test('a same-value date (e.g. 5/5/1990) is unambiguous even though both readings "match" — day and month are identical', () => {
    expect(normalizeFlexibleDate('5/5/1990')).toEqual({ iso: '1990-05-05', ambiguous: false });
  });
});
