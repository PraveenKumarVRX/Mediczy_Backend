process.env.NODE_ENV = 'test';

import { describe, expect, it } from '@jest/globals';

/**
 * Mirrors admin.route.js firstReturningRow — Sequelize INSERT…RETURNING
 * returns [rows, rowCount]; SELECT returns rows[]. Bulk onboarding must
 * always resolve a plan/user row object with `.id`.
 */
function firstReturningRow(queryResult) {
  if (!queryResult) return null;
  const head = Array.isArray(queryResult) ? queryResult[0] : queryResult;
  if (!head) return null;
  if (Array.isArray(head)) return head[0] || null;
  if (typeof head === 'object') return head;
  return null;
}

describe('corporate employee bulk plan helpers', () => {
  it('extracts INSERT RETURNING row from Sequelize [rows, rowCount] tuple', () => {
    const row = { id: 42, slug: 'corp-7-123', name: 'Truvae Corporate Basic Plus' };
    expect(firstReturningRow([[row], 1])).toEqual(row);
    expect(firstReturningRow([[row], 1])?.id).toBe(42);
  });

  it('extracts SELECT-shaped single-row arrays', () => {
    const row = { id: 9, name: 'Plan' };
    expect(firstReturningRow([row])).toEqual(row);
  });

  it('returns null for empty / malformed INSERT results (previous silent fail mode)', () => {
    expect(firstReturningRow([[], 0])).toBeNull();
    expect(firstReturningRow([undefined, 1])).toBeNull();
    expect(firstReturningRow(null)).toBeNull();
  });

  it('documents that returning an array as "plan" breaks assignUserToActiveCorporatePlan', () => {
    // Old bug: `const [inserted] = await query(INSERT); return inserted` returned
    // the rows ARRAY, so corporatePlan.id was undefined and plan assignment threw.
    const buggyReturn = [{ id: 5, slug: 'corp-1-x' }]; // array, not row
    expect(Number(buggyReturn?.id)).toBeNaN();
    const fixed = firstReturningRow([buggyReturn, 1]);
    expect(Number(fixed?.id)).toBe(5);
  });
});
