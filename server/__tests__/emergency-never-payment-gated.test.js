import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFileSync(join(ROOT, file), 'utf8');

/**
 * A safety invariant, not a style rule.
 *
 * The emergency consultation endpoint used to answer 402 Payment Required when
 * a signed-in patient had an unpaid balance, telling them to settle up or buy
 * Health Coins before a doctor would be connected — while an unauthenticated
 * stranger was waved through up to five times a day. Care comes first; the
 * balance is recorded and chased afterwards.
 */
describe('emergency consultation is never withheld for payment', () => {
  const source = read('routes/medical-ai.route.js');
  // The emergency handler, from its credit bookkeeping to the doctor lookup.
  const emergencySection = source.slice(
    source.indexOf('Credit checking only applies to registered users'),
    source.indexOf('Find only doctors who are online')
  );

  it('isolates the section under test', () => {
    expect(emergencySection.length).toBeGreaterThan(200);
  });

  it('does not refuse the consultation over an unpaid balance', () => {
    expect(emergencySection).not.toMatch(/status\(402\)/);
    expect(emergencySection).not.toMatch(/paymentRequired/);
    expect(emergencySection).not.toMatch(/Emergency credit exhausted/);
  });

  it('still records that the consultation happened on an unpaid balance', () => {
    expect(emergencySection).toContain('billingDeferred = true');
    // The fee must reach the account even when no credit was available.
    expect(source).toContain('(isUsingCredit || billingDeferred) && user');
    expect(source).toMatch(/emergencyTriagePendingAmount: pendingAmount \+ consultationFee/);
  });
});

describe('clinical risk scores reject impossible measurements', () => {
  const source = read('routes/health-assessment.route.js');

  it('bounds every measurement that feeds a clinical score', () => {
    // waist -> FINDRISC, neck -> STOP-BANG: an impossible value does not fail,
    // it produces a confident wrong score.
    for (const field of ['height', 'weight', 'waist', 'hip', 'neck', 'sbp', 'bmi']) {
      expect(source).toMatch(new RegExp(`${field}:\\s*\\[`));
    }
  });

  it('routes those measurements through the plausibility check', () => {
    expect(source).toMatch(/waist: plausibleMeasurement\('waist'/);
    expect(source).toMatch(/neckCircumferenceCm: plausibleMeasurement\('neck'/);
    expect(source).toMatch(/sbp: plausibleMeasurement\('sbp'/);
    // And says what it dropped rather than scoring silently.
    expect(source).toContain('ignoredMeasurements');
  });
});
