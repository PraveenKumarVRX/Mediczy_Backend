import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

const query = jest.fn();
const release = jest.fn();
const finalizeBilling = jest.fn();
jest.unstable_mockModule('../db/pgPool.js', () => ({ default: { connect: async () => ({ query, release }) } }));
jest.unstable_mockModule('../middleware/authLab.middleware.js', () => ({ authLab: (req, res, next) => { req.lab = { id: 9 }; next(); } }));
jest.unstable_mockModule('../services/emr-order-router.service.js', () => ({ default: { finalizeLabOrderBilling: finalizeBilling } }));
const { default: router } = await import('../routes/lab/orders.route.js');
const app = express();
app.use(express.json());
app.use('/orders', router);
const order = { id: 100, patient_id: 42, lab_id: 9, source_type: 'patient_lab_checkout', source_id: 12, release_status: 'draft' };

beforeEach(() => {
  jest.clearAllMocks();
  query.mockImplementation(async sql => ({ rows: sql.startsWith('SELECT') || sql.startsWith('UPDATE lab_orders') ? [order] : [] }));
});

it('confirms a paid booking and patient status in one transaction without billing twice', async () => {
  await request(app).patch('/orders/100/status').send({ status: 'confirmed' }).expect(200);
  const patientUpdate = query.mock.calls.find(([sql]) => sql.startsWith('UPDATE lab_tests'));
  expect(patientUpdate[1]).toEqual(['booked', 'confirmed', 12, 42, '9']);
  expect(query.mock.calls[0]).toEqual(['BEGIN']);
  expect(query.mock.calls.at(-1)).toEqual(['COMMIT']);
  expect(finalizeBilling).not.toHaveBeenCalled();
  expect(release).toHaveBeenCalledTimes(1);
});

it('does not publish draft lab results as ready', async () => {
  await request(app).patch('/orders/100/status').send({ status: 'completed' }).expect(200);
  const patientUpdate = query.mock.calls.find(([sql]) => sql.startsWith('UPDATE lab_tests'));
  expect(patientUpdate[1][0]).toBe('booked');
});

it('rolls back both sides if the patient booking update fails', async () => {
  query.mockImplementation(async sql => {
    if (sql.startsWith('UPDATE lab_tests')) throw new Error('simulated update failure');
    return { rows: sql.startsWith('SELECT') || sql.startsWith('UPDATE lab_orders') ? [order] : [] };
  });
  const log = jest.spyOn(console, 'error').mockImplementation(() => {});
  try { await request(app).patch('/orders/100/status').send({ status: 'confirmed' }).expect(500); }
  finally { log.mockRestore(); }
  expect(query.mock.calls.at(-1)).toEqual(['ROLLBACK']);
  expect(query.mock.calls.some(([sql]) => sql === 'COMMIT')).toBe(false);
  expect(release).toHaveBeenCalledTimes(1);
});

it('does not update a booking outside the authenticated lab', async () => {
  query.mockResolvedValue({ rows: [] });
  await request(app).patch('/orders/100/status').send({ status: 'confirmed' }).expect(404);
  expect(query.mock.calls.find(([sql]) => sql.startsWith('SELECT'))[1]).toEqual(['100', 9]);
  expect(query.mock.calls.some(([sql]) => sql.startsWith('UPDATE'))).toBe(false);
});
