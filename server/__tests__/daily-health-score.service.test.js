import { computeDailyScore } from '../services/daily-health-score.service.js';

const profile = {
  dateOfBirth: '1979-09-08',
  gender: 'male',
  height: 173,
  weight: 69,
};

describe('daily health score data-quality guard', () => {
  it('withholds a score when counters contain no measured health data', () => {
    const result = computeDailyScore({
      steps: 0,
      sleep_hours: 0,
      heart_rate: 0,
      water_glasses: 0,
    }, profile, '2026-10-27');

    expect(result.score).toBeNull();
    expect(result.dataQuality).toEqual({
      status: 'insufficient',
      observedDomains: [],
      minimumDomainsForScore: 3,
    });
  });

  it('withholds a score until three independent domains have data', () => {
    const result = computeDailyScore({ steps: 4500 }, profile, '2026-10-27');

    expect(result.score).toBeNull();
    expect(result.dataQuality.status).toBe('partial');
    expect(result.dataQuality.observedDomains).toEqual(['activity']);
  });

  it('returns a score once activity, sleep and vitals are observed', () => {
    const result = computeDailyScore({
      steps: 8000,
      sleep_hours: 7.5,
      heart_rate: 70,
    }, profile, '2026-10-27');

    expect(result.dataQuality.status).toBe('complete');
    expect(result.ageBand).toBe('middle_age');
    expect(result.score).toEqual(expect.any(Number));
    expect(result.score).toBeGreaterThanOrEqual(0);
  });
});
