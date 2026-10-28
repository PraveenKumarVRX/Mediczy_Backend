import { jest } from '@jest/globals';

const query = jest.fn();
const createOrder = jest.fn();
const findOrder = jest.fn();
const findPayment = jest.fn();
const createTest = jest.fn();
const queueQuery = jest.fn().mockResolvedValue([[], 1]);
const transaction = { LOCK: { UPDATE: 'UPDATE' } };
jest.unstable_mockModule('../db/pgPool.js', () => ({ default: { query } }));
jest.unstable_mockModule('../db/postgres-sequelize.js', () => ({ postgresSequelize: { query: queueQuery, transaction: async work => work(transaction) } }));
jest.unstable_mockModule('../models/billing.model.intelligent.js', () => ({ Order: { create: createOrder, findOne: findOrder }, Payment: { findOne: findPayment } }));
jest.unstable_mockModule('../models/postgres/labTest.model.postgres.js', () => ({ default: { create: createTest } }));
jest.unstable_mockModule('../middleware/rls-context.middleware.js', () => ({ setRlsContext: jest.fn() }));
const { prepareLabCheckout, completeLabCheckout } = await import('../services/patient-lab-checkout.service.js');

beforeEach(() => jest.clearAllMocks());
const request = { testIds: ['cbc'], labId: 9, collectionType: 'lab', date: '2099-10-29', time: '10:30', total: 1 };

it('uses catalogue prices and creates no lab booking while checkout is unpaid', async () => {
  query.mockResolvedValueOnce({ rows: [{ id: 9, name: 'Test lab' }] }).mockResolvedValueOnce({ rows: [{ test_id: 'cbc', name: 'CBC', price: '350', home_collection_charge: 50 }] });
  createOrder.mockImplementationOnce(async data => ({ id: 12, ...data }));
  const order = await prepareLabCheckout(42, request);
  expect(order.total).toBe(350);
  expect(order.status).toBe('pending');
  expect(createTest).not.toHaveBeenCalled();
  expect(order.metadata.tests[0].test_id).toBe('cbc');
});
it('rejects unknown catalogue tests without creating a billing order', async () => {
  query.mockResolvedValueOnce({ rows: [{ id: 9 }] }).mockResolvedValueOnce({ rows: [] });
  await expect(prepareLabCheckout(42, { ...request, testIds: ['SomeObscureTestNotInCatalog123'] })).rejects.toThrow('unavailable');
  expect(createOrder).not.toHaveBeenCalled();
});
it('rejects incomplete time and invalid collection addresses before querying', async () => {
  await expect(prepareLabCheckout(42, { ...request, time: '10:' })).rejects.toThrow('complete');
  await expect(prepareLabCheckout(42, { ...request, collectionType: 'home', address: { street: 'swswcsccs', city: '', pincode: '123' } })).rejects.toThrow('address');
  expect(query).not.toHaveBeenCalled();
});
it('rejects impossible calendar dates before opening checkout', async () => {
  await expect(prepareLabCheckout(42, { ...request, date: '2099-02-30' })).rejects.toThrow('valid future');
  expect(query).not.toHaveBeenCalled();
});
it('requires a successful payment belonging to the same user and order', async () => {
  findOrder.mockResolvedValueOnce({ id: 12, userId: 42, status: 'completed', total: 350, metadata: { source: 'patient_lab_checkout', tests: [] } });
  findPayment.mockResolvedValueOnce(null);
  await expect(completeLabCheckout(42, 12)).rejects.toThrow('verified');
  expect(findPayment).toHaveBeenCalledWith(expect.objectContaining({ where: { orderId: 12, userId: 42, status: 'success' } }));
  expect(createTest).not.toHaveBeenCalled();
});
it('creates paid bookings in one locked transaction and makes retries idempotent', async () => {
  const update = jest.fn();
  const order = { id: 12, userId: 42, status: 'completed', total: 350, metadata: { source: 'patient_lab_checkout', tests: [{ test_id: 'cbc', name: 'CBC', price: 350 }], date: request.date, time: request.time, labId: 9, collectionType: 'lab' }, update };
  findOrder.mockResolvedValueOnce(order);
  findPayment.mockResolvedValueOnce({ id: 22, status: 'success' });
  createTest.mockResolvedValueOnce({ id: 100 });
  expect(await completeLabCheckout(42, 12)).toEqual({ labTestIds: [100] });
  expect(createTest).toHaveBeenCalledWith(expect.objectContaining({ userId: 42, testName: 'CBC', metadata: expect.objectContaining({ billingOrderId: 12, paymentStatus: 'paid' }) }), { transaction });
  expect(queueQuery).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO lab_orders'), expect.objectContaining({ transaction, replacements: expect.objectContaining({ testId: 100, userId: 42, labId: 9 }) }));
  expect(update).toHaveBeenCalledWith(expect.objectContaining({ metadata: expect.objectContaining({ labTestIds: [100] }) }), { transaction });
  findOrder.mockResolvedValueOnce({ ...order, metadata: { ...order.metadata, labTestIds: [100] } });
  expect(await completeLabCheckout(42, 12)).toEqual({ labTestIds: [100] });
  expect(createTest).toHaveBeenCalledTimes(1);
});
