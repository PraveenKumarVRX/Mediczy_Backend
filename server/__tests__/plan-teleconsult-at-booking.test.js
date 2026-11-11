import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFileSync(join(ROOT, file), 'utf8');

/**
 * D-23: a member whose plan includes free teleconsults was still shown and
 * charged the full fee.
 *
 * The entitlement was applied on the online-consultation route and nowhere
 * else, so the same member booking the same consultation through the
 * appointment flow paid for a benefit they had already bought. The allowance
 * was never spent either, so the plan looked unused.
 */
describe('a plan that includes teleconsults pays for one at booking', () => {
  const controller = read('controller/appointment.controller.js');
  const booking = controller.slice(
    controller.indexOf('consultationFee = appointmentFee('),
    controller.indexOf("if (requestedConsultationType === 'review')")
  );

  it('checks the entitlement while pricing the appointment', () => {
    expect(booking).toContain('getTeleconsultEntitlement(userId');
    expect(booking).toContain('entitlement?.covered');
  });

  it('only waives a fee there is one to waive', () => {
    expect(booking).toContain('consultationFee > 0');
  });

  it('matches the service\'s own rule rather than widening it', () => {
    // getTeleconsultEntitlement answers not_an_online_consultation for
    // anything but 'online', so claiming coverage for video or chat here
    // would waive a fee the plan never covered.
    expect(booking).toContain("requestedConsultationType === 'online'");
  });

  it('spends the allowance in the booking transaction', () => {
    expect(booking).toContain('consumeTeleconsult(');
    expect(booking).toContain('{ transaction }');
  });

  it('waives the fee only once the allowance is actually decremented', () => {
    // A failed write must not hand out an unlimited free consultation.
    expect(booking).toMatch(/if \(consumed\)[\s\S]{0,200}consultationFee = 0/);
    expect(booking).toMatch(/if \(consumed\)[\s\S]{0,200}paymentStatus = 'paid'/);
  });

  it('marks the appointment as paid, not as owing nothing by accident', () => {
    expect(booking).toContain("paymentStatus = 'paid'");
  });
});

describe('the app is told why the consultation is free', () => {
  const controller = read('controller/appointment.controller.js');

  it('reports it on the appointment and on the booking responses', () => {
    // Without this the app has a zero fee and no reason for it, which is how
    // a covered consultation still displayed a price.
    expect((controller.match(/planTeleconsultApplied/g) || []).length).toBeGreaterThanOrEqual(4);
  });

  it('keeps the free-review waiver separate, since they are different benefits', () => {
    expect(controller).toContain('freeReviewApplied');
    expect(controller).toContain('planTeleconsultApplied');
    expect(controller).not.toMatch(/planTeleconsultApplied\s*=\s*freeReviewApplied/);
  });
});
