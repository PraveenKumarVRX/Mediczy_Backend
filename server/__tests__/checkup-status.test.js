import { readFileSync } from 'node:fs';
import { jest } from '@jest/globals';

const queries = [];
const contexts = [];
let respond = () => [];
jest.unstable_mockModule('../db/postgres-sequelize.js', () => ({
  postgresSequelize: { query: jest.fn(async (sql, opts = {}) => { queries.push({ sql, opts }); return respond(sql, opts); }), QueryTypes: { SELECT: 'SELECT' } },
}));
jest.unstable_mockModule('../services/corporate-health-checkup-booking.service.js', () => ({
  withCorporateBookingContext: async (ctx, fn) => { contexts.push(ctx); return fn('tx'); },
}));
jest.unstable_mockModule('../services/corporate-report-storage-client.js', () => ({ readStoredReportFile: jest.fn() }));

const svc = await import('../services/checkup-status.service.js');
const src = readFileSync(new URL('../services/checkup-status.service.js', import.meta.url), 'utf8');

const base = { user_id: 7109, first_name: 'AMARNATH', last_name: 'SHETTY', email: 'a@example.com', phone: '9000000000', employee_code: '103617', department: 'Sales', designation: 'SR', roster_active: true };

beforeEach(() => { queries.length = 0; contexts.length = 0; respond = () => []; });

describe('financial year', () => {
  test('a chosen year is used as given; anything else falls back to the current one', () => {
    expect(svc.financialYear('2025-26')).toEqual({ label: '2025-26', start: '2025-04-01', end: '2026-03-31' });
    expect(svc.financialYear('2025-27').label).toBe(svc.financialYear().label);
    expect(svc.financialYear("x'; --").label).toBe(svc.financialYear().label);
    expect(svc.financialYear().start).toMatch(/^\d{4}-04-01$/);
  });
});

describe('listCheckupStatus', () => {
  test('runs in the corporate context for one year, counts every stage, filters by stage', async () => {
    respond = (sql) => (sql.includes('GROUP BY stage')
      ? [{ stage: 'not_eligible', n: 125 }, { stage: 'confirmed', n: 1 }, { stage: 'delivered', n: 2 }]
      : [{ ...base, stage: 'confirmed', package_name: 'DairyDay_AHC ', valid_to: '2027-09-26', benefit_active: false,
          lo_id: 45, lo_status: 'pending', lo_date: '2026-11-02', lo_slot: '09:30 AM', lo_lab: 'Agilus', lo_ref: 'CHK-45', lo_created: '2026-10-31' }]);
    const out = await svc.listCheckupStatus({ corporateId: 45, actorUserId: 9, fy: '2026-27', stage: 'confirmed', limit: 999 });
    expect(contexts).toEqual([{ corporateId: 45, bookedByUserId: 9 }]);
    expect(queries[0].opts.replacements).toMatchObject({ corporateId: 45, from: '2026-04-01', to: '2027-03-31', stage: 'confirmed', limit: 200, reportSearch: '' });
    expect(queries[1].opts.replacements.stage).toBeUndefined();
    expect(out.summary).toEqual({ all: 128, eligible: 3, byStage: { not_eligible: 125, not_booked: 0, booked: 0, confirmed: 1, checkup_done: 0, report_ready: 0, delivered: 2 } });
    expect(out.total).toBe(1);
    expect(out.rows[0]).toMatchObject({
      key: 'emp-7109', stage: 'confirmed',
      employee: { userId: 7109, name: 'AMARNATH SHETTY', employeeId: '103617', onRoster: true },
      benefit: { packageName: 'DairyDay_AHC', active: false },
      appointment: { source: 'team', id: 45, status: 'pending', date: '2026-11-02', slot: '09:30 AM', lab: 'Agilus' },
      report: null,
    });
  });

  test("the employee's own booking is shown over Team's, unless it was cancelled", async () => {
    const row = { ...base, stage: 'booked', bk_id: 3, bk_status: 'booked', bk_date: '2026-12-01', lo_id: 9, lo_status: 'pending', lo_date: '2026-12-02' };
    respond = (sql) => (sql.includes('GROUP BY stage') ? [] : [row, { ...row, user_id: 8, bk_status: 'cancelled' }]);
    const out = await svc.listCheckupStatus({ corporateId: 5, actorUserId: 1 });
    expect(out.rows[0].appointment).toMatchObject({ source: 'employee', id: 3 });
    expect(out.rows[1].appointment).toMatchObject({ source: 'team', id: 9 });
  });

  test('an unknown stage is ignored, and a report carries what the actions need', async () => {
    respond = (sql) => (sql.includes('GROUP BY stage') ? [] : [{ ...base, stage: 'delivered', rep_source: 'manual', report_id: 47, report_name: 'AHC', has_file: true, notified_email: true, report_count: '2' }]);
    const out = await svc.listCheckupStatus({ corporateId: 45, actorUserId: 1, stage: 'nope' });
    expect(out.stage).toBeNull();
    expect(queries[0].opts.replacements.stage).toBe('');
    expect(out.rows[0].report).toMatchObject({ source: 'manual', reportId: 47, hasFile: true, notifiedEmail: true, count: 2, canShare: true });
  });
});

describe('the journey rules', () => {
  test('stages run from most to least advanced, and delivery means emailed, WhatsApped or a lab email report', () => {
    const order = ['delivered', 'report_ready', 'checkup_done', 'confirmed', 'booked', 'not_booked', 'not_eligible'].map((s) => src.indexOf(`THEN '${s}'`) === -1 ? src.indexOf(`ELSE '${s}'`) : src.indexOf(`THEN '${s}'`));
    expect(order.every((v, i) => v > 0 && (i === 0 || v > order[i - 1]))).toBe(true);
    expect(src).toContain("(rep.source = 'email' OR rep.notified_email OR rep.notified_whatsapp) THEN 'delivered'");
  });

  test('people are the active roster plus anyone with an active benefit, a booking or a report this year', () => {
    expect(src).toContain('SELECT user_id FROM roster WHERE roster_active');
    expect(src).toContain('UNION SELECT user_id FROM ent WHERE active');
    expect(src).toMatch(/lower\(COALESCE\(cat\.metadata->>'workflowClass'[\s\S]*IN \('annual', 'annual_benefit'\)/);
  });

  test('every source is limited to the corporate and the year', () => {
    expect(src).toContain('WHERE ce.corporate_id = :corporateId');
    expect(src).toContain('WHERE uhp.corporate_id = :corporateId');
    expect(src).toContain('WHERE b.corporate_id = :corporateId');
    expect(src).toContain("WHERE o.organization_id = :corporateId AND o.test_category = 'corporate_health_checkup'");
    expect(src).toContain('b.appointment_date BETWEEN :from::date AND :to::date');
  });
});

describe('routes', () => {
  test('Team and HR endpoints exist; HR access is audited', () => {
    const team = readFileSync(new URL('../routes/corporate-bookings.route.js', import.meta.url), 'utf8');
    const hr = readFileSync(new URL('../routes/corporate.route.js', import.meta.url), 'utf8');
    expect(team).toMatch(/router\.get\('\/checkup-status', authUser, requireTeamOrAdmin, requireCorporateAccess/);
    expect(hr).toMatch(/router\.get\('\/checkup-status', authCorporate/);
    expect(hr).toContain("action: 'hr_list_checkup_status'");
    expect('hr_list_checkup_status'.length).toBeLessThanOrEqual(30);
  });
});
