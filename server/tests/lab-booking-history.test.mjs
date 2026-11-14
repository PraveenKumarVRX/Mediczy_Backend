import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { ensureLabAppointmentHistory, updateLinkedLabHistory } from '../services/lab-appointment-history.service.js';

// Execute the real Express route handlers with an in-memory transactional
// database. No server startup, credentials, dependencies or live writes.
async function fixture({ failHistory = false, failLink = false, failHistoryUpdate = false } = {}) {
  const appointments = [];
  const histories = [];
  const rls = [];
  const reads = [];
  let transactionId = 0;
  let rolledBack = 0;
  const transaction = async work => {
    const tx = {
      id: ++transactionId, pending: [], LOCK: { UPDATE: 'UPDATE' },
      commit: async () => { tx.pending.forEach(action => action()); },
      rollback: async () => { tx.pending = []; rolledBack += 1; },
    };
    if (!work) return tx;
    try { const result = await work(tx); await tx.commit(); return result; }
    catch (error) { await tx.rollback(); throw error; }
  };
  const database = { transaction, query: async (sql, options) => {
    assert.ok(options.transaction);
    rls.push({ sql, ...options });
  } };
  const inOperator = Symbol('in');
  const matches = (row, where) => Object.entries(where).every(([key, value]) =>
    key === 'metadata'
      ? Object.entries(value).every(([field, expected]) => row.metadata?.[field] === expected)
      : value?.[inOperator] ? value[inOperator].includes(row[key]) : String(row[key]) === String(value));
  const LabTest = {
    sequelize: database,
    findOne: async ({ where }) => histories.find(row => matches(row, where)) || null,
    create: async (data, { transaction: tx }) => {
      if (failHistory) throw new Error('History insert failed');
      const row = { id: histories.length + 501, ...data };
      row.update = async (changes, { transaction: updateTx }) => {
        if (failHistoryUpdate) throw new Error('History update failed');
        updateTx.pending.push(() => Object.assign(row, changes));
      };
      tx.pending.push(() => histories.push(row));
      return row;
    },
    findAll: async options => {
      assert.ok(options.transaction);
      reads.push(options);
      return histories.filter(row => matches(row, options.where)).slice(options.offset, options.offset + options.limit);
    },
    count: async options => {
      assert.ok(options.transaction);
      reads.push(options);
      return histories.filter(row => matches(row, options.where)).length;
    },
  };
  const Appointment = {
    sequelize: database,
    findOne: async ({ where }) => appointments.find(row => matches(row, where)) || null,
    create: async (data, { transaction: tx }) => {
      const row = { id: appointments.length + 77, createdAt: new Date('2026-11-14T01:00:00Z'), ...data };
      row.update = async (changes, { transaction: updateTx }) => {
        assert.ok(updateTx);
        if (failLink) throw new Error('Link update failed');
        updateTx.pending.push(() => Object.assign(row, changes));
      };
      tx.pending.push(() => appointments.push(row));
      return row;
    },
  };
  const modules = {
    express: { default: { Router: () => {
      const routes = [];
      const router = { routes };
      for (const method of ['get', 'post', 'put', 'delete']) {
        router[method] = (path, ...handlers) => routes.push({ method, path, handler: handlers.at(-1) });
      }
      return router;
    } } },
    sequelize: { Op: { in: inOperator }, Sequelize: {} },
    '../models/postgres/lab.model.postgres.js': { default: { findByPk: async id => ({ id, name: 'QA Lab', address: { city: 'Pune' } }) } },
    '../models/postgres/family-member.model.postgres.js': { default: {} },
    '../models/index.js': { Appointment, LabTest, Report: {} },
    '../models/billing.model.intelligent.js': { Order: { create: async () => ({ id: 'billing-1' }) } },
    '../middleware/auth.middleware.js': { authUser: () => {} },
    '../middleware/authLab.middleware.js': { authLab: () => {} },
    '../db/orchestrator.js': { orchestrator: {} },
    '../db/pgPool.js': { default: {} },
    '../utils/placeholder-contact.js': { sanitiseContact: value => value },
    '../services/lab-appointment-history.service.js': { ensureLabAppointmentHistory, updateLinkedLabHistory },
    '../services/patient-lab-checkout.service.js': { prepareLabCheckout: () => {}, completeLabCheckout: () => {} },
    '../services/minio-upload.service.js': { uploadEncryptedReport: () => {} },
    '../services/coupon-validation.service.js': {
      testTypeToDiagnosticScope: () => {}, validateOrderCoupon: () => {}, recordCouponUsage: () => {}, diagnosticScopeLabel: () => {},
    },
    '../middleware/rls-context.middleware.js': { setRlsContext: async (tx, context) => rls.push({ transaction: tx, context }) },
  };
  const multer = () => ({ single: () => () => {} });
  multer.memoryStorage = () => ({});
  modules.multer = { default: multer };
  async function loadRoute(name) {
    const code = await readFile(new URL(`../routes/${name}`, import.meta.url), 'utf8');
    const context = vm.createContext({ console: { log() {}, warn() {}, error() {} }, Date, Math });
    const module = new vm.SourceTextModule(code, { context });
    await module.link(specifier => {
      assert.ok(modules[specifier], `Unexpected import: ${specifier}`);
      const values = modules[specifier];
      return new vm.SyntheticModule(Object.keys(values), function () {
        for (const [key, value] of Object.entries(values)) this.setExport(key, value);
      }, { context });
    });
    await module.evaluate();
    return module.namespace.default;
  }
  const bookingRouter = await loadRoute('lab.route.enhanced.js');
  const historyRouter = await loadRoute('lab-tests.route.js');
  async function request(router, method, path, { body = {}, userId = 42, query = {}, params = {} } = {}) {
    const route = router.routes.find(item => item.method === method && item.path === path);
    assert.ok(route, `${method} ${path} exists`);
    const response = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(payload) { this.body = payload; return this; } };
    await route.handler({ user: { id: userId, organization_id: 3, name: 'QA Patient' }, body, query, params, get: () => 'node:test' }, response);
    return response;
  }
  return { appointments, histories, reads, rls, LabTest, database, rolledBack: () => rolledBack,
    book: body => request(bookingRouter, 'post', '/book', { body }),
    list: (options = {}) => request(historyRouter, 'get', '/', options),
    mutate: (method, path, body = {}, userId = 42) => request(historyRouter, method, path, { body, userId, params: { id: 501 } }),
  };
}

const body = {
  labId: 7, appointmentDate: '2026-12-20', appointmentTime: '10:00', serviceType: 'checkup',
  testType: 'Health Checkup', tests: [{ id: 'cbc', name: 'CBC', price: 500 }],
};

test('POST booking is returned by GET history for its owner with both IDs linked', async () => {
  const f = await fixture();
  const booking = await f.book(body);
  assert.equal(booking.statusCode, 201);
  assert.equal(booking.body.success, true);
  assert.equal(booking.body.labTestId, 501);
  assert.equal(booking.body.appointment.id, 77);
  assert.equal(f.appointments[0].metadata.labTestId, 501);
  assert.equal(f.appointments[0].organization_id, 3);
  assert.equal(f.histories[0].metadata.appointmentId, 77);
  assert.equal(f.histories[0].userId, 42);
  assert.equal(f.histories[0].organization_id, 3);
  assert.equal(f.histories[0].testName, 'CBC');
  assert.equal(f.histories[0].testType, 'other');
  assert.equal(f.histories[0].metadata.labId, 7);
  assert.equal(f.histories[0].hospitalId, undefined);
  const history = await f.list();
  assert.equal(history.body.data.length, 1);
  assert.equal(history.body.data[0].id, booking.body.labTestId);
  assert.equal(history.body.pagination.total, 1);
  assert.equal(f.reads[0].transaction, f.reads[1].transaction);
  assert.ok(f.rls.some(call => call.transaction === f.reads[0].transaction && call.context?.userId === 42));
});

test('history is never returned to a different patient in the same organization', async () => {
  const f = await fixture();
  await f.book(body);
  const history = await f.list({ userId: 43 });
  assert.equal(history.body.data.length, 0);
  assert.equal(history.body.pagination.total, 0);
});

test('both records roll back when the history insert fails', async () => {
  const f = await fixture({ failHistory: true });
  const result = await f.book(body);
  assert.equal(result.statusCode, 500);
  assert.equal(result.body.success, false);
  assert.equal(f.appointments.length, 0);
  assert.equal(f.histories.length, 0);
  assert.equal(f.rolledBack(), 1);
});

test('both records roll back when the reverse link fails', async () => {
  const f = await fixture({ failLink: true });
  const result = await f.book(body);
  assert.equal(result.statusCode, 500);
  assert.equal(f.appointments.length, 0);
  assert.equal(f.histories.length, 0);
});

test('pagination and status filters still apply to the patient history', async () => {
  const f = await fixture();
  await f.book(body);
  await f.book(body);
  const first = await f.list({ query: { limit: '1', skip: '0', status: 'pending_confirmation' } });
  assert.equal(first.body.data.length, 1);
  assert.equal(first.body.pagination.total, 2);
  assert.equal(first.body.pagination.hasMore, true);
  const second = await f.list({ query: { limit: '1', skip: '1' } });
  assert.notEqual(first.body.data[0].id, second.body.data[0].id);
  assert.equal(second.body.pagination.hasMore, false);
  assert.equal((await f.list({ query: { status: 'cancelled' } })).body.data.length, 0);
});

test('repairing the same historical appointment reuses its history row', async () => {
  const f = await fixture();
  await f.book(body);
  const appointment = f.appointments[0];
  appointment.update = async changes => Object.assign(appointment, changes);
  appointment.metadata = { ...appointment.metadata, labTestId: null };
  const history = await f.database.transaction(transaction => ensureLabAppointmentHistory(appointment, { LabTest: f.LabTest, transaction }));
  assert.equal(history.id, 501);
  assert.equal(appointment.metadata.labTestId, 501);
  assert.equal(f.histories.length, 1);
});

test('projection cannot run without a transaction or for a non-lab appointment', async () => {
  await assert.rejects(ensureLabAppointmentHistory({}, { LabTest: {} }), /transaction/);
  await assert.rejects(ensureLabAppointmentHistory({ type: 'consultation', userId: 42 }, { LabTest: {}, transaction: {} }), /patient-owned lab/);
});

test('cancelling through Lab Orders cancels the linked appointment and its slot', async () => {
  const f = await fixture();
  await f.book(body);
  const result = await f.mutate('post', '/:id/cancel', { reason: 'Changed plans' });
  assert.equal(result.statusCode, 200);
  assert.equal(f.histories[0].status, 'cancelled');
  assert.equal(f.appointments[0].status, 'cancelled');
  assert.equal(f.appointments[0].cancellationReason, 'Changed plans');
  assert.equal(f.appointments[0].cancelledBy, 42);
});

test('rescheduling through Lab Orders updates both records without losing links or metadata', async () => {
  const f = await fixture();
  await f.book(body);
  const result = await f.mutate('put', '/:id', { appointmentDate: '2026-12-21', appointmentTime: '11:00', notes: 'Updated notes' });
  assert.equal(result.statusCode, 200);
  assert.equal(f.appointments[0].appointmentDate, '2026-12-21');
  assert.equal(f.appointments[0].appointmentTime, '11:00');
  assert.equal(f.appointments[0].patientDetails.notes, 'Updated notes');
  assert.equal(f.histories[0].appointmentDate.toISOString().slice(0, 10), '2026-12-21');
  assert.equal(f.histories[0].appointmentTime, '11:00');
  assert.equal(f.appointments[0].metadata.labTestId, 501);
});

test('confirming through Lab Orders updates both statuses', async () => {
  const f = await fixture();
  await f.book(body);
  const result = await f.mutate('post', '/:id/confirm');
  assert.equal(result.statusCode, 200);
  assert.equal(f.histories[0].status, 'booked');
  assert.equal(f.appointments[0].status, 'confirmed');
});

test('an update failure rolls back the linked appointment change too', async () => {
  const f = await fixture({ failHistoryUpdate: true });
  await f.book(body);
  const result = await f.mutate('post', '/:id/cancel');
  assert.equal(result.statusCode, 500);
  assert.equal(f.appointments[0].status, 'scheduled');
  assert.equal(f.histories[0].status, 'pending_confirmation');
});

test('another user cannot cancel a linked lab booking', async () => {
  const f = await fixture();
  await f.book(body);
  const result = await f.mutate('post', '/:id/cancel', {}, 43);
  assert.equal(result.statusCode, 404);
  assert.equal(f.appointments[0].status, 'scheduled');
});

test('linked history cannot be deleted while leaving a booked appointment behind', async () => {
  const f = await fixture();
  await f.book(body);
  const result = await f.mutate('delete', '/:id');
  assert.equal(result.statusCode, 409);
  assert.equal(f.histories.length, 1);
  assert.equal(f.appointments[0].status, 'scheduled');
});

test('historical lab-test appointments with missing type are recovered and normalized', async () => {
  const f = await fixture();
  await f.book(body);
  const appointment = f.appointments[0];
  f.histories.length = 0;
  appointment.type = null;
  appointment.metadata = { ...appointment.metadata, labTestId: null };
  await f.database.transaction(transaction => ensureLabAppointmentHistory(appointment, { LabTest: f.LabTest, transaction }));
  assert.equal(appointment.type, 'lab');
  assert.equal(appointment.metadata.labTestId, 501);
  assert.equal(f.histories[0].metadata.appointmentId, appointment.id);
});
