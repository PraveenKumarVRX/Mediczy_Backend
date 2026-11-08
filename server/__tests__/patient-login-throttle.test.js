/**
 * The patient login throttle in controller/unified-patient.controller.js.
 *
 * It used to increment on every attempt and clear only when the 15-minute
 * window expired, so five *correct* logins locked the account out of the
 * sixth — reachable in ordinary use, because the access token lives 15 minutes
 * and signing out and back in, or using two devices, spends attempts with the
 * right password every time. These tests pin the corrected contract: failures
 * count, success clears, and the map does not grow without bound.
 */
import { jest } from '@jest/globals';

jest.unstable_mockModule('../db/pgPool.js', () => ({ default: { query: jest.fn() } }));

const { __loginThrottleTestHooks: throttle } = await import('../controller/unified-patient.controller.js');

const EMAIL = 'patient@example.org';

describe('patient login throttle', () => {
  beforeEach(() => throttle.reset());

  test('a correct password is never spent — repeated successful logins stay allowed', () => {
    for (let i = 0; i < throttle.MAX_ATTEMPTS * 4; i++) {
      expect(throttle.isRateLimited(EMAIL)).toBe(false);
      throttle.clearFailedLogins(EMAIL);
    }
    expect(throttle.isRateLimited(EMAIL)).toBe(false);
    expect(throttle.size()).toBe(0);
  });

  test('five failures lock the window, and the sixth attempt is refused', () => {
    for (let i = 0; i < throttle.MAX_ATTEMPTS; i++) {
      expect(throttle.isRateLimited(EMAIL)).toBe(false);
      throttle.registerFailedLogin(EMAIL);
    }
    expect(throttle.isRateLimited(EMAIL)).toBe(true);
  });

  test('four failures then a success clears the count, so the next wrong guess is not the fifth', () => {
    for (let i = 0; i < throttle.MAX_ATTEMPTS - 1; i++) throttle.registerFailedLogin(EMAIL);
    expect(throttle.isRateLimited(EMAIL)).toBe(false);

    throttle.clearFailedLogins(EMAIL);
    expect(throttle.size()).toBe(0);

    throttle.registerFailedLogin(EMAIL);
    expect(throttle.isRateLimited(EMAIL)).toBe(false);
  });

  test('the lock is per email and case-insensitive, so one account cannot lock another', () => {
    for (let i = 0; i < throttle.MAX_ATTEMPTS; i++) throttle.registerFailedLogin('  Victim@Example.ORG ');
    expect(throttle.isRateLimited('victim@example.org')).toBe(true);
    expect(throttle.isRateLimited('someone.else@example.org')).toBe(false);
  });

  test('the window expires on its own', () => {
    const now = Date.now();
    const sixteenMinutes = 16 * 60 * 1000;
    for (let i = 0; i < throttle.MAX_ATTEMPTS; i++) throttle.registerFailedLogin(EMAIL);
    expect(throttle.isRateLimited(EMAIL)).toBe(true);

    jest.spyOn(Date, 'now').mockReturnValue(now + sixteenMinutes);
    try {
      expect(throttle.isRateLimited(EMAIL)).toBe(false);
      expect(throttle.size()).toBe(0);
    } finally {
      Date.now.mockRestore();
    }
  });

  test('the attempt map is bounded — an attacker cannot grow it with unique emails', () => {
    const overshoot = throttle.MAX_TRACKED_IDENTIFIERS + 500;
    for (let i = 0; i < overshoot; i++) throttle.registerFailedLogin(`throwaway-${i}@example.org`);
    expect(throttle.size()).toBeLessThanOrEqual(throttle.MAX_TRACKED_IDENTIFIERS);

    // Eviction is oldest-first, so the most recent failures are still counted.
    for (let i = 1; i < throttle.MAX_ATTEMPTS; i++) throttle.registerFailedLogin(`throwaway-${overshoot - 1}@example.org`);
    expect(throttle.isRateLimited(`throwaway-${overshoot - 1}@example.org`)).toBe(true);
  });
});
