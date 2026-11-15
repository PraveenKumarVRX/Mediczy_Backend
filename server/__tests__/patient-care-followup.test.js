import { jest } from '@jest/globals';
jest.unstable_mockModule('../db/postgres-sequelize.js', () => ({ postgresSequelize: {} }));
jest.unstable_mockModule('../middleware/rls-context.middleware.js', () => ({ setRlsContext: jest.fn() }));
const { followUpUnconfirmedCare } = await import('../services/patient-care-followup.service.js');

it('records confirmation follow-ups and deduplication markers in one transaction without cancelling paid care', async () => {
  const transaction = {};
  const queries = [];
  const database = { QueryTypes: { SELECT: 'SELECT' }, transaction: async work => work(transaction), query: jest.fn(async (sql, options) => {
    queries.push({ sql, options });
    if (sql.startsWith('SELECT id, "userId", "doctorName"')) return [{ id: 1, userId: 42, doctorName: 'Dr. Test' }];
    if (sql.startsWith('SELECT id, "userId", "testName"')) return [{ id: 2, userId: 42, testName: 'CBC' }];
    if (sql.startsWith('SELECT id, "userId", "orderNumber"')) return [{ id: 3, userId: 42, orderNumber: 'ORD-3' }];
    return [{ id: 1 }];
  }) };
  const setContext = jest.fn();
  expect(await followUpUnconfirmedCare({ database, setContext })).toEqual({ appointments: 1, labTests: 1, pharmacyOrders: 1 });
  expect(queries.filter(query => query.sql.startsWith('INSERT INTO notifications'))).toHaveLength(3);
  expect(queries.every(query => query.options.transaction === transaction)).toBe(true);
  expect(queries.filter(query => query.sql.startsWith('UPDATE')).every(query => !/SET status|cancelled/.test(query.sql))).toBe(true);
  expect(queries.find(query => query.sql.includes('FROM lab_tests')).sql).toContain("careFollowupNotified' IS NULL");
  expect(setContext).toHaveBeenCalledWith(transaction, { orgId: 0, userId: 0, isPlatformAdmin: true });
});
it('does not create notifications when there are no pending records', async () => {
  const query = jest.fn().mockResolvedValue([]);
  const database = { QueryTypes: { SELECT: 'SELECT' }, transaction: async work => work({}), query };
  expect(await followUpUnconfirmedCare({ database, setContext: jest.fn() })).toEqual({ appointments: 0, labTests: 0, pharmacyOrders: 0 });
  expect(query).toHaveBeenCalledTimes(3);
});
it('sends the doctor-confirmation reminder for doctor consultations only, never for lab bookings', async () => {
  const query = jest.fn().mockResolvedValue([]);
  const database = { QueryTypes: { SELECT: 'SELECT' }, transaction: async work => work({}), query };
  await followUpUnconfirmedCare({ database, setContext: jest.fn() });
  const appointmentSql = query.mock.calls.map(([sql]) => sql).find(sql => sql.startsWith('SELECT id, "userId", "doctorName"'));
  expect(appointmentSql).toContain('"doctorId" IS NOT NULL');
  expect(appointmentSql).toContain("<> 'lab-test'");
});
