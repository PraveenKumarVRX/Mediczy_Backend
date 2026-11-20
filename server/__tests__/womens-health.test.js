import { readFileSync } from 'node:fs';
import { jest } from '@jest/globals';

const rlsCalls = [];
const queries = [];
let nextRows = () => ({ rows: [], rowCount: 0 });
const client = { query: jest.fn(async (sql, params) => { queries.push({ sql, params }); return nextRows(sql, params); }) };

jest.unstable_mockModule('../db/pgPool.js', () => ({ default: { query: jest.fn() } }));
jest.unstable_mockModule('../middleware/rls-context.middleware.js', () => ({
  withRlsTransaction: async (_pool, ctx, fn) => { rlsCalls.push(ctx); return fn(client); },
}));

const wh = await import('../services/womens-health.service.js');
const { buildEstimates, buildSigns, validateCycle, validateSettings, parseDate, DEFAULTS } = wh;

const day = (s) => parseDate(s);
const SETTINGS = { ...DEFAULTS, enabled: true };
const cycle = (periodStart, periodLengthDays = 5, flow = 'medium') => ({ periodStart, periodLengthDays, flow });

describe('cycle estimates', () => {
  test('with nothing logged there are no dates, only the settings', () => {
    const e = buildEstimates(SETTINGS, [], day('2026-11-20'));
    expect(e).toMatchObject({ basedOn: 'settings', cycleLengthDays: 28, upcoming: [], expectedPeriodStart: null });
  });

  test('one logged period uses the cycle length setting', () => {
    const e = buildEstimates({ ...SETTINGS, cycleLengthDays: 30 }, [cycle('2026-11-10')], day('2026-11-20'));
    expect(e.basedOn).toBe('settings');
    expect(e.expectedPeriodStart).toBe('2026-12-10');
    expect(e.cycleDay).toBe(11);
  });

  test('logged periods set the cycle length, ovulation and fertile window', () => {
    const cycles = [cycle('2026-11-01'), cycle('2026-10-04'), cycle('2026-09-06')]; // newest first, 28-day gaps
    const e = buildEstimates(SETTINGS, cycles, day('2026-11-10'));
    expect(e).toMatchObject({ basedOn: 'logged_cycles', cyclesUsed: 2, cycleLengthDays: 28, periodLengthDays: 5, cycleDay: 10, daysLate: 0 });
    expect(e.upcoming[0]).toEqual({
      periodStart: '2026-11-29', periodEnd: '2026-12-03', ovulationDay: '2026-11-15',
      fertileWindowStart: '2026-11-10', fertileWindowEnd: '2026-11-16',
    });
    expect(e.upcoming.map((u) => u.periodStart)).toEqual(['2026-11-29', '2026-12-27', '2027-01-24']);
  });

  test('a gap longer than 60 days is a missed log, not a cycle', () => {
    const e = buildEstimates(SETTINGS, [cycle('2026-11-01'), cycle('2026-10-04'), cycle('2026-06-01')], day('2026-11-10'));
    expect(e.cyclesUsed).toBe(1);
    expect(e.cycleLengthDays).toBe(28);
  });

  test('pregnancy and breastfeeding pause the estimates and the late warning', () => {
    for (const status of ['PREGNANCY', 'LACTATION']) {
      const s = { ...SETTINGS, status };
      const e = buildEstimates(s, [cycle('2026-08-01')], day('2026-11-20'));
      expect(e).toMatchObject({ paused: true, upcoming: [], expectedPeriodStart: null });
      expect(buildSigns(s, [cycle('2026-08-01')], e)).toEqual([]);
    }
  });

  test('a late period moves the next estimates forward to dates that have not passed', () => {
    const cycles = [cycle('2026-10-01')];
    const e = buildEstimates(SETTINGS, cycles, day('2026-11-08'));
    expect(e.expectedPeriodStart).toBe('2026-10-29');
    expect(e.daysLate).toBe(10);
    expect(day(e.upcoming[0].periodEnd) >= day('2026-11-08')).toBe(true);
  });
});

describe('signs worth raising with a gynaecologist', () => {
  const codes = (cycles, today = '2026-11-10', settings = SETTINGS) =>
    buildSigns(settings, cycles, buildEstimates(settings, cycles, day(today))).map((s) => s.code);

  test('a regular cycle raises nothing', () => {
    expect(codes([cycle('2026-11-01'), cycle('2026-10-04'), cycle('2026-09-06')])).toEqual([]);
  });

  test('long, very heavy, short, varying and late periods each raise their sign', () => {
    expect(codes([cycle('2026-11-01', 9)])).toContain('PERIOD_OVER_7_DAYS');
    expect(codes([cycle('2026-11-01', 5, 'very_heavy')])).toContain('VERY_HEAVY_FLOW');
    expect(codes([cycle('2026-11-01'), cycle('2026-10-14'), cycle('2026-09-26')])).toContain('CYCLE_UNDER_21_DAYS');
    expect(codes([cycle('2026-11-01'), cycle('2026-09-22'), cycle('2026-08-13')], '2026-11-05')).toContain('CYCLE_OVER_35_DAYS');
    expect(codes([cycle('2026-11-01'), cycle('2026-10-10'), cycle('2026-08-31'), cycle('2026-08-08')])).toContain('CYCLE_LENGTH_VARIES');
    expect(codes([cycle('2026-10-01')], '2026-11-05')).toContain('PERIOD_LATE');
  });

  test('every sign suggests a gynaecologist and none states a diagnosis', () => {
    const signs = buildSigns(SETTINGS, [cycle('2026-11-01', 9, 'very_heavy')], buildEstimates(SETTINGS, [cycle('2026-11-01', 9, 'very_heavy')], day('2026-11-10')));
    for (const s of signs) {
      expect(s.suggestion).toBe('consult_gynaecologist');
      expect(s.message).not.toMatch(/PCOS|endometriosis|fibroid|anaemia|pregnan/i);
    }
  });
});

describe('validation', () => {
  const today = day('2026-11-20');
  test('a period needs a real, past start date', () => {
    expect(() => validateCycle({}, { today })).toThrow('periodStart');
    expect(() => validateCycle({ periodStart: '2026-02-30' }, { today })).toThrow('periodStart');
    expect(validateCycle({ periodStart: '2026-11-21' }, { today })).toMatchObject({ periodStart: '2026-11-21' }); // phone east of India
    expect(() => validateCycle({ periodStart: '2026-11-22' }, { today })).toThrow('future');
  });
  test('end, flow, symptoms and notes are checked', () => {
    expect(() => validateCycle({ periodStart: '2026-11-10', periodEnd: '2026-11-09' }, { today })).toThrow('before');
    expect(() => validateCycle({ periodStart: '2026-11-10', flow: 'extreme' }, { today })).toThrow('flow');
    expect(() => validateCycle({ periodStart: '2026-11-10', symptoms: ['cramps', 'other'] }, { today })).toThrow('symptoms');
    expect(() => validateCycle({ periodStart: '2026-11-10', notes: 'x'.repeat(501) }, { today })).toThrow('500');
    expect(validateCycle({ periodStart: '2026-11-10', symptoms: ['cramps', 'cramps'], notes: '  ' }, { today }))
      .toEqual({ periodStart: '2026-11-10', symptoms: ['cramps'], notes: null });
  });
  test('settings stay inside their ranges', () => {
    expect(() => validateSettings({ cycleLengthDays: 70 })).toThrow('15 to 60');
    expect(() => validateSettings({ status: 'PERIOD' })).toThrow('status');
    expect(() => validateSettings({})).toThrow('Nothing');
    expect(validateSettings({ enabled: true, status: 'PREGNANCY' })).toEqual({ enabled: true, status: 'PREGNANCY' });
  });
});

describe('data access stays inside the member\'s own rows', () => {
  beforeEach(() => { rlsCalls.length = 0; queries.length = 0; nextRows = () => ({ rows: [], rowCount: 0 }); });

  test('every read and write runs in the member\'s RLS context and filters by their id', async () => {
    await wh.getOverview(41, { gender: 'Female' });
    nextRows = () => ({ rows: [{ id: '7', period_start: '2026-11-01', period_end: null, flow: null, symptoms: [], notes: null }], rowCount: 1 });
    await wh.addCycle(41, { periodStart: '2026-11-01' });
    await wh.updateCycle(41, 7, { flow: 'light' });
    await wh.deleteCycle(41, 7);
    await wh.clearAll(41);
    expect(rlsCalls.length).toBe(5);
    expect(rlsCalls.every((c) => c.userId === 41)).toBe(true);
    for (const { sql, params } of queries) {
      expect(sql).toMatch(/user_id = \$1|VALUES \(\$1/);
      expect(params[0]).toBe(41);
    }
  });

  test('first visit suggests the section from gender but stores nothing', async () => {
    const out = await wh.getOverview(41, { gender: 'Female' });
    expect(out.suggestEnable).toBe(true);
    expect(out.settings.enabled).toBe(false);
    expect((await wh.getOverview(41, { gender: 'Male' })).suggestEnable).toBe(false);
    expect(queries.every((q) => q.sql.trim().startsWith('SELECT'))).toBe(true);
  });

  test('a second period with the same start date is a 409, another member\'s period a 404', async () => {
    nextRows = (sql) => { if (sql.includes('INSERT')) { const e = new Error('dup'); e.code = '23505'; throw e; } return { rows: [], rowCount: 0 }; };
    await expect(wh.addCycle(41, { periodStart: '2026-11-01' })).rejects.toMatchObject({ status: 409 });
    nextRows = () => ({ rows: [], rowCount: 0 });
    await expect(wh.updateCycle(41, 999, { flow: 'light' })).rejects.toMatchObject({ status: 404 });
    await expect(wh.deleteCycle(41, 999)).rejects.toMatchObject({ status: 404 });
  });
});

describe('storage, privacy and wiring', () => {
  const migration = readFileSync(new URL('../migrations/20261120000200-womens-health.migration.js', import.meta.url), 'utf8');
  test('both tables are FORCED RLS to the member, carry the user uid twin and go with the account', () => {
    expect(migration).toMatch(/ENABLE ROW LEVEL SECURITY/);
    expect(migration).toMatch(/FORCE ROW LEVEL SECURITY/);
    expect(migration).toContain("current_setting('app.current_user_id', true)");
    expect(migration).toContain("attach_uid_reference('menstrual_cycle_logs', 'user_id', 'user_uid', 'users')");
    expect(migration).toContain("attach_uid_reference('womens_health_settings', 'user_id', 'user_uid', 'users')");
    expect(migration.match(/REFERENCES users\(id\) ON DELETE CASCADE/g)).toHaveLength(2);
  });
  test('DPDP export includes it and erasure deletes it', () => {
    const svc = readFileSync(new URL('../services/data-export.service.js', import.meta.url), 'utf8');
    expect(svc).toContain('FROM menstrual_cycle_logs WHERE user_id = $1 ORDER BY');
    expect(svc).toContain('DELETE FROM menstrual_cycle_logs   WHERE user_id = $1');
    expect(svc).toContain('DELETE FROM womens_health_settings WHERE user_id = $1');
  });
  test('mounted under /api/wellness, which members are already allowed', () => {
    const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
    expect(app).toContain('app.use("/api/wellness/womens-health", womensHealthRouter)');
    const fencing = readFileSync(new URL('../middleware/ringFencing.js', import.meta.url), 'utf8');
    expect(fencing.match(/'\/api\/wellness'/g).length).toBeGreaterThanOrEqual(2);
  });
});
