import { readFileSync } from 'node:fs';
import { jest } from '@jest/globals';

// Team QA 2026-11-21: Team bookings never reached Approvals, could not be confirmed or
// completed, had no history, and the status board showed them as Confirmed while pending.

const queries = [];
let respond = () => [];
jest.unstable_mockModule('../db/postgres-sequelize.js', () => ({
  postgresSequelize: {
    query: jest.fn(async (sql, opts = {}) => { queries.push({ sql, opts }); return respond(sql, opts); }),
    QueryTypes: { SELECT: 'SELECT' },
  },
}));
const contexts = [];
jest.unstable_mockModule('../services/corporate-health-checkup-booking.service.js', () => ({
  withCorporateBookingContext: async (ctx, fn) => { contexts.push(ctx); return fn('tx'); },
}));

const svc = await import('../services/team-checkup-lifecycle.service.js');
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

const order = (over = {}) => ({
  id: 46, order_number: 'CHK-45-1', status: 'pending', test_type: 'DairyDay AHC', patient_id: 7109, lab_id: 2400,
  created_at: '2026-11-01T10:00:00Z', updated_at: '2026-11-01T10:00:00Z', appointment_date: '2026-11-02', time_slot: '09:30 AM',
  lab_name: 'Likitha Diagnostics', employee_name: 'MAHESH S', employee_email: 'm@example.com', is_demo: false, ...over,
});

beforeEach(() => { queries.length = 0; contexts.length = 0; respond = () => []; });

describe('Team booking lifecycle', () => {
  test('pending -> confirmed is written in the corporate context and recorded in the history', async () => {
    respond = (sql) => {
      if (sql.includes('FOR UPDATE OF o')) return [order()];
      if (sql.startsWith('UPDATE lab_orders') || sql.includes('UPDATE lab_orders')) return [{ id: 46 }];
      if (sql.includes('AND o.id = :id')) return [order({ status: 'confirmed' })];
      return [];
    };
    const out = await svc.transitionTeamOrder({ corporateId: 45, orderId: '46', action: 'confirm', actorUserId: 110, note: 'Lab confirmed' });
    expect(out).toMatchObject({ id: '46', source: 'team', status: 'confirmed', lab: { name: 'Likitha Diagnostics' } });
    expect(contexts).toEqual([{ corporateId: 45, bookedByUserId: 110 }]);
    const update = queries.find((q) => q.sql.includes('UPDATE lab_orders'));
    expect(update.opts.replacements).toMatchObject({ id: 46, corporateId: 45, to: 'confirmed', from: 'pending' });
    expect(update.sql).toContain('organization_id = :corporateId AND status = :from');
    const event = queries.find((q) => q.sql.includes('INSERT INTO checkup_booking_events'));
    expect(event.opts.replacements).toMatchObject({ corporateId: 45, source: 'team', bookingId: 46, employeeUserId: 7109, fromStatus: 'pending', toStatus: 'confirmed', actorUserId: 110, note: 'Lab confirmed' });
  });

  test('steps cannot be skipped, a future visit cannot be completed and a cancel needs a reason', async () => {
    respond = (sql) => (sql.includes('FOR UPDATE OF o') ? [order()] : []);
    await expect(svc.transitionTeamOrder({ corporateId: 45, orderId: 46, action: 'complete', actorUserId: 110 }))
      .rejects.toMatchObject({ status: 409, code: 'invalid_transition' });
    respond = (sql) => (sql.includes('FOR UPDATE OF o') ? [order({ status: 'confirmed', appointment_date: '2999-01-01' })] : []);
    await expect(svc.transitionTeamOrder({ corporateId: 45, orderId: 46, action: 'complete', actorUserId: 110 }))
      .rejects.toMatchObject({ status: 409, code: 'appointment_not_yet_due' });
    await expect(svc.transitionTeamOrder({ corporateId: 45, orderId: 46, action: 'cancel', actorUserId: 110 }))
      .rejects.toMatchObject({ status: 400 });
    await expect(svc.transitionTeamOrder({ corporateId: 45, orderId: 46, action: 'delete', actorUserId: 110 }))
      .rejects.toMatchObject({ status: 400 });
  });

  test("another company's booking is not found", async () => {
    respond = () => [];
    await expect(svc.transitionTeamOrder({ corporateId: 5, orderId: 46, action: 'confirm', actorUserId: 110 }))
      .rejects.toMatchObject({ status: 404 });
    expect(queries[0].opts.replacements).toMatchObject({ corporateId: 5, id: 46 });
    expect(queries[0].sql).toContain("o.organization_id = :corporateId AND o.test_category = 'corporate_health_checkup'");
  });

  test('a history write that fails never blocks the status change', async () => {
    respond = (sql) => {
      if (sql.includes('INSERT INTO checkup_booking_events')) throw new Error('relation "checkup_booking_events" does not exist');
      if (sql.includes('FOR UPDATE OF o')) return [order()];
      if (sql.includes('UPDATE lab_orders')) return [{ id: 46 }];
      if (sql.includes('AND o.id = :id')) return [order({ status: 'confirmed' })];
      return [];
    };
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    await expect(svc.transitionTeamOrder({ corporateId: 45, orderId: 46, action: 'confirm', actorUserId: 110 })).resolves.toMatchObject({ status: 'confirmed' });
    expect(queries.some((q) => q.sql === 'ROLLBACK TO SAVEPOINT checkup_event')).toBe(true);
    spy.mockRestore();
  });

  test('history starts with the booking and lists who changed what', async () => {
    respond = (sql) => {
      if (sql.includes('FROM lab_orders o WHERE o.id')) return [{ id: 46, status: 'confirmed', created_at: '2026-11-01', booked_by: 'parinitha@mysmarthealth.in' }];
      if (sql.includes('FROM checkup_booking_events')) return [{ from_status: 'pending', to_status: 'confirmed', created_at: '2026-11-02', actor_name: 'Parinitha M', note: 'Lab confirmed' }];
      return [];
    };
    const h = await svc.bookingHistory({ corporateId: 45, source: 'team', bookingId: '46', actorUserId: 110 });
    expect(h.events).toEqual([
      { status: 'pending', at: '2026-11-01', by: 'parinitha@mysmarthealth.in', note: 'Booked' },
      { from: 'pending', status: 'confirmed', at: '2026-11-02', by: 'Parinitha M', note: 'Lab confirmed' },
    ]);
    await expect(svc.bookingHistory({ corporateId: 45, source: 'lab', bookingId: 1, actorUserId: 110 })).rejects.toMatchObject({ status: 400 });
  });
});

describe('wiring', () => {
  const routes = read('routes/corporate-bookings.route.js');
  test('Approvals lists Team bookings beside employee bookings, and the new routes check corporate access', () => {
    expect(routes).toContain("const team = await listTeamOrders({ corporateId: req.resolvedCorporate.id, actorUserId: req.user.id, status: teamStatus });");
    expect(routes).toMatch(/router\.post\('\/team-orders\/:orderId\/:action\(confirm\|complete\|cancel\)', authUser, requireTeamOrAdmin, requireCorporateAccess,/);
    expect(routes).toMatch(/router\.get\('\/bookings\/:source\(team\|employee\)\/:bookingId\/history', authUser, requireTeamOrAdmin, requireCorporateAccess,/);
  });

  test('the status board shows a pending Team booking as booked, not confirmed (#14)', () => {
    const board = read('services/checkup-status.service.js');
    expect(board).toContain("OR lo.status IN ('scheduled', 'confirmed') THEN 'confirmed'");
    expect(board).toContain("OR lo.status IN ('pending', 'booked', 'ordered') THEN 'booked'");
    expect(board).not.toMatch(/lo\.status IN \('pending'[^)]*\) THEN 'confirmed'/);
  });

  test('the history migration is in the runner list and puts uid twins on every reference', () => {
    expect(read('scripts/migrate-all.mjs')).toContain("'20261121000100-checkup-booking-events.migration.js'");
    const m = read('migrations/20261121000100-checkup-booking-events.migration.js');
    for (const col of ["'corporate_id', 'corporate_uid'", "'employee_user_id', 'employee_uid'", "'actor_user_id', 'actor_uid'"]) expect(m).toContain(col);
  });
});
