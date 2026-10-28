import crypto from 'node:crypto';
import pool from '../db/pgPool.js';
import { postgresSequelize } from '../db/postgres-sequelize.js';
import { Order, Payment } from '../models/billing.model.intelligent.js';
import LabTest from '../models/postgres/labTest.model.postgres.js';
import { setRlsContext } from '../middleware/rls-context.middleware.js';
import { appointmentSlotInstant } from '../utils/appointmentSlotTime.js';

const invalid = message => Object.assign(new Error(message), { statusCode: 400 });

export async function prepareLabCheckout(userId, input) {
  if (!Array.isArray(input.testIds)) throw invalid('Select tests from the catalogue.');
  const ids = [...new Set(input.testIds.map(String))];
  if (!ids.length || ids.length > 30) throw invalid('Select between 1 and 30 catalogue tests.');
  if (!['home', 'lab'].includes(input.collectionType)) throw invalid('Choose home collection or a lab visit.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date || '') || !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.time || '')) throw invalid('Choose a complete collection date and time.');
  if (!(appointmentSlotInstant(input.date, input.time)?.getTime() > Date.now())) throw invalid('Choose a valid future collection time.');
  if (input.collectionType === 'home' && (!/^[1-9]\d{5}$/.test(input.address?.pincode || '') || String(input.address?.city || '').trim().length < 2 || String(input.address?.street || '').trim().length < 10)) throw invalid('Enter a street address, city and valid six-digit pincode.');
  const lab = await pool.query(`SELECT id, name, "homeSampleCollection", metadata FROM labs WHERE id = $1 AND status = 'active' AND "isVerified" = true`, [Number(input.labId) || 0]);
  if (!lab.rows.length) throw invalid('Choose an active, verified lab.');
  if (input.collectionType === 'home' && !lab.rows[0].homeSampleCollection) throw invalid('This lab does not offer home collection. Choose a lab visit or another lab.');
  const { rows } = await pool.query("SELECT test_id, name, price, home_collection_charge, category, currency FROM api_lab_tests WHERE status = 'active' AND test_id::text = ANY($1::text[])", [ids]);
  if (rows.length !== ids.length || rows.some(test => test.price == null || !Number.isFinite(Number(test.price)) || Number(test.price) < 0 || !Number.isFinite(Number(test.home_collection_charge || 0)) || Number(test.home_collection_charge || 0) < 0 || (test.currency && test.currency !== 'INR'))) throw invalid('A selected test is unavailable. Refresh the catalogue and try again.');
  const total = rows.reduce((sum, test) => sum + Number(test.price) + (input.collectionType === 'home' ? Number(test.home_collection_charge || 0) : 0), 0);
  const metadata = { source: 'patient_lab_checkout', tests: rows, collectionType: input.collectionType, labId: lab.rows[0].id, labName: lab.rows[0].name, organizationId: Number(lab.rows[0].metadata?.organizationId) || 0, date: input.date, time: input.time, address: input.address || null, notes: String(input.notes || '').slice(0, 2000) };
  return Order.create({ orderNumber: `LAB-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`, userId, orderType: 'lab_test', status: total === 0 ? 'completed' : 'pending', subtotal: total, total, currency: 'INR', metadata, notes: rows.map(test => test.name).join(', ') });
}

export async function completeLabCheckout(userId, orderId) {
  return postgresSequelize.transaction(async transaction => {
    await setRlsContext(transaction, { userId, orgId: 0 });
    const order = await Order.findOne({ where: { id: orderId, userId, orderType: 'lab_test' }, transaction, lock: transaction.LOCK.UPDATE });
    if (!order || order.metadata?.source !== 'patient_lab_checkout') throw invalid('Lab checkout was not found.');
    if (order.metadata.labTestIds?.length) return { labTestIds: order.metadata.labTestIds };
    const payment = Number(order.total) === 0 ? true : await Payment.findOne({ where: { orderId: order.id, userId, status: 'success' }, transaction });
    if (order.status !== 'completed' || !payment) throw invalid('Payment must be verified before tests are booked.');
    const details = order.metadata;
    const labTestIds = [];
    for (const test of details.tests) {
      const testTotal = Number(test.price) + (details.collectionType === 'home' ? Number(test.home_collection_charge || 0) : 0);
      const reading = await LabTest.create({ userId, testName: test.name, testType: 'other', appointmentDate: details.date, appointmentTime: details.time,
        status: 'pending_confirmation', confirmationStatus: 'pending', resultStatus: 'pending', confirmationDeadline: new Date(Date.now() + 48 * 3600000), price: Number(test.price), total_amount: testTotal, currency: 'INR', notes: details.notes,
        metadata: { billingOrderId: order.id, catalogTestId: test.test_id, labId: details.labId, labName: details.labName, collectionType: details.collectionType, address: details.address, paymentStatus: 'paid' },
      }, { transaction });
      // Lab staff read lab_orders. Create their work item atomically after
      // payment verification, with an explicit link to the patient's booking.
      await postgresSequelize.query(`INSERT INTO lab_orders (order_number, patient_id, organization_id, test_type, test_category,
        status, priority, lab_id, source_type, source_id, tests, total_amount, notes, created_at, updated_at)
        VALUES (:number, :userId, :orgId, :name, :category, 'pending', 'routine', :labId, 'patient_lab_checkout', :testId,
        CAST(:tests AS jsonb), :total, :notes, NOW(), NOW())`, {
        transaction, replacements: { number: `${order.orderNumber || `LAB-${order.id}`}-${reading.id}`, userId, orgId: details.organizationId || 0,
          name: test.name, category: test.category || 'Lab test', labId: details.labId, testId: reading.id,
          tests: JSON.stringify([{ ...test, collectionType: details.collectionType, requestedDate: details.date, requestedTime: details.time, address: details.address }]), total: testTotal, notes: details.notes || null },
      });
      labTestIds.push(reading.id);
    }
    await order.update({ metadata: { ...details, labTestIds } }, { transaction });
    return { labTestIds };
  });
}
