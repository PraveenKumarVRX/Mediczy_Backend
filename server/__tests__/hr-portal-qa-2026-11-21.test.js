import { readFileSync } from 'node:fs';
import { jest } from '@jest/globals';

// HR (corporate portal) QA 2026-11-21.

const queries = [];
let respond = () => [];
const tx = { id: 'tx' };
jest.unstable_mockModule('../db/postgres-sequelize.js', () => ({
  postgresSequelize: {
    query: jest.fn(async (sql, opts = {}) => { queries.push({ sql, opts }); return respond(sql, opts); }),
    transaction: jest.fn(async (fn) => fn(tx)),
    QueryTypes: { SELECT: 'SELECT' },
  },
}));
const rls = [];
jest.unstable_mockModule('../middleware/rls-context.middleware.js', () => ({
  setRlsContext: jest.fn(async (transaction, ctx) => { rls.push({ transaction, ctx }); }),
}));
jest.unstable_mockModule('../services/emailService.js', () => ({ default: {} }));
jest.unstable_mockModule('../services/team-sent-folder.service.js', () => ({ recordAutomatedSend: jest.fn() }));

const mis = await import('../services/corporate-wellness-mis.service.js');
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

beforeEach(() => { queries.length = 0; rls.length = 0; respond = () => []; });

describe('#6 Weekly MIS counts bookings', () => {
  test('Team bookings are counted inside the corporate context, with app bookings, by status and type', async () => {
    respond = (sql) => {
      if (sql.includes('WITH b AS')) return [{ annual_booked: 3, pending: 2, confirmed: 1, completed: 0, cancelled: 0, completed_in_week: 1 }];
      if (sql.includes('FROM pre_employment_cases')) return [{ booked: 2, completed: 1, created: 4 }];
      return [{}];
    };
    const m = await mis.buildCorporateMisMetrics(45, '2026-11-16', '2026-11-22');
    expect(rls).toEqual([{ transaction: tx, ctx: { orgId: 45, userId: 0 } }]);
    const counted = queries.find((q) => q.sql.includes('WITH b AS'));
    expect(counted.opts.transaction).toBe(tx);
    expect(counted.sql).toContain('FROM lab_orders');
    expect(counted.sql).toContain('FROM health_checkup_bookings');
    expect(m).toMatchObject({ annualCheckupsBooked: 3, preEmploymentBooked: 2, bookedCheckups: 5, completedCheckups: 2,
      bookingsByStatus: { pending: 2, confirmed: 1, completed: 0, cancelled: 0 } });
    const rows = mis.misMetricsToRows(m).map((r) => r.metric);
    expect(rows).toEqual(expect.arrayContaining(['Annual health check-ups booked', 'Pre-employment check-ups booked', 'Booked this week: pending', 'Booked this week: confirmed']));
  });

  test('a failed count reads as zero rather than breaking the MIS', async () => {
    respond = (sql) => { if (sql.includes('WITH b AS')) throw new Error('boom'); return [{}]; };
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    await expect(mis.buildCorporateMisMetrics(45, '2026-11-16', '2026-11-22')).resolves.toMatchObject({ bookedCheckups: 0 });
    spy.mockRestore();
  });
});

describe('#3-4 generated reports are saved and listed', () => {
  test('every offered report type is a real query, and old category names map to one', async () => {
    const { REPORT_TYPES, reportTypeOf } = await import('../services/corporate-report-builder.service.js');
    expect(REPORT_TYPES.map((t) => t.key)).toEqual(['checkup_status', 'pre_employment', 'weekly_mis', 'employees', 'claims', 'health_risk']);
    expect(reportTypeOf('MIS')).toBe('weekly_mis');
    expect(reportTypeOf('Claims Summary')).toBe('claims');
    expect(reportTypeOf('Health Metrics')).toBe('health_risk');
    expect(reportTypeOf('Custom Report')).toBe('employees');
  });

  test('generate saves the rows with the report; preview and download read them back', () => {
    const src = read('routes/corporate.route.js');
    const gen = src.slice(src.indexOf("router.post('/reports/generate'"), src.indexOf("router.post('/reports/weekly-mis/generate'"));
    expect(gen).toContain('snapshot, row_count');
    expect(gen).toContain('JSON.stringify({ headers: built.headers, rows: built.rows })');
    expect(gen).toContain('generatedBy: req.user?.userId || null'); // never the corporate's own id
    expect(src).toContain('rows: data.rows.slice(0, 50), totalRows: data.rows.length');
    expect(read('migrations/20261121000200-corporate-report-snapshots.migration.js')).toContain('ADD COLUMN IF NOT EXISTS snapshot jsonb');
  });
});

describe('#1-2 status in the Employees list and the pre-employment workflow', () => {
  test('the Employees list gets each employee\'s stage from the status board, and PEME by email', () => {
    const src = read('routes/corporate.route.js');
    expect(src).toContain("router.get('/checkup-status/by-employee', authCorporate,");
    expect(read('services/checkup-status.service.js')).toContain('export async function checkupStageIndex');
  });

  test('a case can be cancelled and its history read; the actor is never the corporate id', () => {
    const src = read('routes/pre-employment.route.js');
    expect(src).toContain("router.post('/cases/:caseId/cancel', authCorporate,");
    expect(src).toContain("router.get('/cases/:caseId/events', authCorporate,");
    expect(src).toContain('const actorId = (req) => Number(req.user?.userId) || null;');
    expect(src).not.toContain("'http://localhost:5173'");
  });
});

describe('Team booking messages match the status', () => {
  test('the booking message says booked, and a Team status change notifies the employee', () => {
    const src = read('routes/corporate-bookings.route.js');
    expect(src).not.toContain('Health Checkup Booking Confirmed');
    expect(src).not.toContain('🏥 Health Checkup Confirmed');
    expect(src).toContain("const kind = { confirm: 'approved', complete: 'completed', cancel: 'cancelled' }[req.params.action];");
  });
});
