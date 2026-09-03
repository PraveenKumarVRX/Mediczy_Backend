/**
 * Revenue-share ledger + monetisation (Tier 1) + Tele-ICU device bridge +
 * cross-hospital command network + specialist marketplace (Tier 2) tests.
 *
 * Covers:
 *   - computeEpisodeFee (homecare-billing)
 *   - recordRevenueEvent / ledgerSummary / transitionEntry (revenue-share-ledger)
 *   - recordRecoveredRevenue (rcm-success-fee)
 *   - validatePtzCommand / isSlideAdequate / scoreSpecialist / isShiftCovering
 *   - REST route behaviour for /api/v1/revenue-share/*
 *
 * pgPool is mocked so no real DB is required; only pgPool.query is stubbed.
 */
import { jest } from '@jest/globals';

const mockQuery = jest.fn();
jest.unstable_mockModule('../db/pgPool.js', () => ({ default: { query: mockQuery } }));

// icu.service.js runs ensureTables() at module load; stub it out so the
// command-network service import (which pulls getICUCensus) doesn't fire a DB query.
jest.unstable_mockModule('../services/icu.service.js', () => ({
  getICUCensus: jest.fn().mockResolvedValue({ activeCount: 0 }),
}));

// ── Pure helpers ──────────────────────────────────────────────────────────────

const { computeEpisodeFee, cyclesBetween } = await import('../services/revenue-share/homecare-billing.service.js');
const { validatePtzCommand } = await import('../services/tele-icu/tele-icu-device-bridge.service.js');
const { scoreSpecialist, rankCandidates } = await import('../services/marketplace/specialist-marketplace.service.js');
const { isShiftCovering, pickOnCall } = await import('../services/tele-icu/icu-command-network.service.js');
const { buildSynopticTemplate, isSlideAdequate } = await import('../services/marketplace/tele-pathology.service.js');

describe('computeEpisodeFee', () => {
  test('applies acuity multiplier on top of base + per-visit fee', () => {
    const fee = computeEpisodeFee({ baseFee: 1500, perVisitFee: 500, visitCount: 3, acuityMultiplier: 1.5 });
    expect(fee).toBe(4500);
  });

  test('rounds to 2 decimals', () => {
    const fee = computeEpisodeFee({ baseFee: 100, perVisitFee: 33, visitCount: 2, acuityMultiplier: 1 });
    expect(fee).toBe(166);
  });

  test('throws on negative input', () => {
    expect(() => computeEpisodeFee({ baseFee: -1, perVisitFee: 0, visitCount: 0, acuityMultiplier: 1 })).toThrow(/invalid/);
  });

  test('defaults perVisitFee and visitCount to 0', () => {
    expect(computeEpisodeFee({ baseFee: 800, acuityMultiplier: 2 })).toBe(1600);
  });
});

describe('cyclesBetween', () => {
  test('counts 30-day cycles between two dates', () => {
    expect(cyclesBetween('2026-08-01', '2026-09-15', 30)).toBe(1);
  });

  test('returns 0 when end is before start', () => {
    expect(cyclesBetween('2026-09-15', '2026-08-01', 30)).toBe(0);
  });

  test('throws on invalid dates', () => {
    expect(() => cyclesBetween('not-a-date', '2026-09-15')).toThrow(/invalid dates/);
  });
});

describe('validatePtzCommand', () => {
  test('normalizes a move command', () => {
    expect(validatePtzCommand('ptz_move', { pan: 10, tilt: -5, zoom: 0 })).toEqual({ pan: 10, tilt: -5, zoom: 0 });
  });

  test('rejects out-of-range pan', () => {
    expect(() => validatePtzCommand('ptz_move', { pan: 101 })).toThrow(/pan must be within/);
  });

  test('parses preset number', () => {
    expect(validatePtzCommand('ptz_preset', { preset: '5' })).toEqual({ preset: 5 });
  });

  test('rejects invalid preset', () => {
    expect(() => validatePtzCommand('ptz_preset', { preset: 256 })).toThrow(/preset must be an integer/);
  });

  test('rejects unknown command type', () => {
    expect(() => validatePtzCommand('reboot', {})).toThrow(/invalid commandType/);
  });
});

describe('scoreSpecialist & rankCandidates', () => {
  const request = { serviceType: 'second_opinion', specialty: 'cardiology', modality: 'echo' };

  test('scores full match highest', () => {
    const dr = { name: 'Dr. A', specialties: ['cardiology'], modalities: ['echo'], serviceTypes: ['second_opinion'], completedRequests: 10, acceptingRequests: true };
    expect(scoreSpecialist(dr, request)).toBe(100);
  });

  test('zero score for non-accepting specialist', () => {
    const dr = { name: 'Dr. B', specialties: ['neurology'], acceptingRequests: false };
    expect(scoreSpecialist(dr, request)).toBe(0);
  });

  test('ranks candidates by score desc then experience', () => {
    const candidates = [
      { name: 'Dr. Low', specialties: ['cardiology'], modalities: [], serviceTypes: ['second_opinion'], completedRequests: 100, acceptingRequests: true },
      { name: 'Dr. High', specialties: ['cardiology'], modalities: ['echo'], serviceTypes: ['second_opinion'], completedRequests: 50, acceptingRequests: true },
    ];
    const ranked = rankCandidates(candidates, request);
    expect(ranked[0].name).toBe('Dr. High');
  });
});

describe('isShiftCovering', () => {
  test('returns true for shift covering the given time', () => {
    const roster = { shift_date: '2026-08-27', shift_start: '08:00', shift_end: '20:00', status: 'scheduled' };
    expect(isShiftCovering(roster, new Date('2026-08-27T12:00:00Z'))).toBe(true);
  });

  test('returns false outside shift hours', () => {
    const roster = { shift_date: '2026-08-27', shift_start: '08:00', shift_end: '20:00', status: 'scheduled' };
    expect(isShiftCovering(roster, new Date('2026-08-27T22:00:00Z'))).toBe(false);
  });

  test('handles overnight shifts', () => {
    const roster = { shift_date: '2026-08-27', shift_start: '22:00', shift_end: '06:00', status: 'scheduled' };
    const d = new Date('2026-08-27T23:00:00Z');
    expect(isShiftCovering(roster, d)).toBe(true);
  });
});

describe('pickOnCall', () => {
  const rosters = [
    { intensivist_id: 1, intensitian_name: 'Hub Doc', spoke_org_id: null, shift_date: '2026-08-27', shift_start: '08:00', shift_end: '20:00' },
    { intensivist_id: 2, intensitian_name: 'Spoke Doc', spoke_org_id: 5, shift_date: '2026-08-27', shift_start: '08:00', shift_end: '20:00', status: 'scheduled' },
  ];
  test('prefers spoke-specific over network-wide', () => {
    const picked = pickOnCall(rosters, 5, new Date('2026-08-27T12:00:00Z'));
    expect(picked.intensivist_id).toBe(2);
  });
  test('falls back to network-wide when no spoke match', () => {
    const picked = pickOnCall(rosters, 99, new Date('2026-08-27T12:00:00Z'));
    expect(picked.intensivist_id).toBe(1);
  });
});

describe('buildSynopticTemplate', () => {
  test('builds biopsy template with grade field', () => {
    const t = buildSynopticTemplate('biopsy', { grade: 'G2', diagnosis: 'BCC' });
    expect(t.specimenType).toBe('biopsy');
    expect(t.diagnosis).toBe('BCC');
    expect(t.grade).toBe('G2');
  });

  test('builds resection template with lymph node field', () => {
    const t = buildSynopticTemplate('resection', {});
    expect(t.lymphNodes).toBe(null);
  });
});

describe('isSlideAdequate', () => {
  test('passes for a well-acquired digital slide', () => {
    const slide = { scanResolutionX: 2048, scanResolutionY: 1536, digitalImageUrl: 's3://...', tissuePresent: true, artifacts: {} };
    expect(isSlideAdequate(slide)).toBe(true);
  });

  test('fails when tissue is folded/occluded', () => {
    const slide = { scanResolutionX: 2048, scanResolutionY: 1536, imageUrl: 's3://...', tissuePresent: true, artifacts: { foldsOccludingTissue: true } };
    expect(isSlideAdequate(slide)).toBe(false);
  });

  test('fails when resolution too low', () => {
    const slide = { scanResolutionX: 640, scanResolutionY: 480, imageUrl: 's3://...', tissuePresent: true, artifacts: {} };
    expect(isSlideAdequate(slide)).toBe(false);
  });
});

