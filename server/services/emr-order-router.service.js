/**
 * EMR Order Router — pushes hospital prescriptions and lab orders
 * to pharmacy_prescriptions / lab portal queues and creates billing charges.
 */

import pool from '../db/pgPool.js';
import { issueFefo } from './pharmacy-inventory-governance.service.js';

let tablesReady = false;

const DEFAULT_LAB_ID = Number(process.env.DEFAULT_LAB_ID || 0) || null;
const DEFAULT_PHARMACY_ID = Number(process.env.DEFAULT_PHARMACY_ID || 0) || null;

async function ensureTables() {
  if (tablesReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS hospital_partner_orgs (
      id SERIAL PRIMARY KEY,
      hospital_id INTEGER NOT NULL,
      partner_type VARCHAR(20) NOT NULL,
      partner_id INTEGER NOT NULL,
      is_default BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (hospital_id, partner_type, partner_id)
    );
    CREATE TABLE IF NOT EXISTS emr_order_events (
      id BIGSERIAL PRIMARY KEY,
      hospital_id INTEGER,
      event_type VARCHAR(60) NOT NULL,
      source_type VARCHAR(40) NOT NULL,
      source_id INTEGER NOT NULL,
      target_type VARCHAR(40),
      target_id INTEGER,
      status VARCHAR(30) DEFAULT 'routed',
      payload JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS hospital_billing_charges (
      id BIGSERIAL PRIMARY KEY,
      hospital_id INTEGER NOT NULL,
      patient_id INTEGER,
      charge_type VARCHAR(40) NOT NULL,
      source_type VARCHAR(40) NOT NULL,
      source_id INTEGER NOT NULL,
      description TEXT,
      amount NUMERIC(12,2) NOT NULL DEFAULT 0,
      currency VARCHAR(8) DEFAULT 'INR',
      status VARCHAR(30) DEFAULT 'pending',
      invoice_id INTEGER,
      metadata JSONB DEFAULT '{}'::jsonb,
      posted_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE lab_orders ADD COLUMN IF NOT EXISTS lab_id INTEGER;
    ALTER TABLE lab_orders ADD COLUMN IF NOT EXISTS source_type VARCHAR(40);
    ALTER TABLE lab_orders ADD COLUMN IF NOT EXISTS source_id INTEGER;
    ALTER TABLE lab_orders ADD COLUMN IF NOT EXISTS billing_charge_id BIGINT;
    ALTER TABLE lab_orders ADD COLUMN IF NOT EXISTS hospital_id INTEGER;
    ALTER TABLE lab_orders ADD COLUMN IF NOT EXISTS tests JSONB DEFAULT '[]'::jsonb;
    ALTER TABLE lab_orders ADD COLUMN IF NOT EXISTS total_amount NUMERIC(12,2) DEFAULT 0;
    ALTER TABLE pharmacy_prescriptions ADD COLUMN IF NOT EXISTS hospital_id INTEGER;
    ALTER TABLE pharmacy_prescriptions ADD COLUMN IF NOT EXISTS source_prescription_id INTEGER;
    ALTER TABLE pharmacy_prescriptions ADD COLUMN IF NOT EXISTS source_type VARCHAR(40) DEFAULT 'emr';
    ALTER TABLE pharmacy_prescriptions ADD COLUMN IF NOT EXISTS billing_charge_id BIGINT;
  `);
  tablesReady = true;
}

async function logEvent({ hospitalId, eventType, sourceType, sourceId, targetType, targetId, status, payload }) {
  await pool.query(
    `INSERT INTO emr_order_events
      (hospital_id, event_type, source_type, source_id, target_type, target_id, status, payload)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
    [hospitalId || null, eventType, sourceType, sourceId, targetType || null, targetId || null, status || 'routed', JSON.stringify(payload || {})]
  );
}

async function createBillingCharge({ hospitalId, patientId, chargeType, sourceType, sourceId, description, amount, metadata }) {
  const { rows } = await pool.query(
    `INSERT INTO hospital_billing_charges
      (hospital_id, patient_id, charge_type, source_type, source_id, description, amount, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
     RETURNING *`,
    [hospitalId, patientId || null, chargeType, sourceType, sourceId, description || null, Number(amount) || 0, JSON.stringify(metadata || {})]
  );
  return rows[0];
}

export async function resolvePartners(hospitalId) {
  await ensureTables();
  const hid = Number(hospitalId) || 1;

  const { rows } = await pool.query(
    `SELECT partner_type, partner_id
     FROM hospital_partner_orgs
     WHERE hospital_id = $1 AND is_default = TRUE`,
    [hid]
  );

  let labId = rows.find((r) => r.partner_type === 'lab')?.partner_id || DEFAULT_LAB_ID;
  let pharmacyId = rows.find((r) => r.partner_type === 'pharmacy')?.partner_id || DEFAULT_PHARMACY_ID;

  if (!labId) {
    const fallback = await pool.query(`SELECT id FROM labs WHERE status = 'active' ORDER BY id ASC LIMIT 1`);
    labId = fallback.rows[0]?.id || null;
  }
  if (!pharmacyId) {
    const fallback = await pool.query(`SELECT id FROM pharmacies WHERE status = 'active' ORDER BY id ASC LIMIT 1`).catch(() => ({ rows: [] }));
    if (!fallback.rows[0]) {
      const alt = await pool.query(`SELECT id FROM "Pharmacies" ORDER BY id ASC LIMIT 1`).catch(() => ({ rows: [] }));
      pharmacyId = alt.rows[0]?.id || null;
    } else {
      pharmacyId = fallback.rows[0].id;
    }
  }

  return { labId: labId ? Number(labId) : null, pharmacyId: pharmacyId ? Number(pharmacyId) : null };
}

function normalizeMedications(medications = []) {
  if (!Array.isArray(medications)) return [];
  return medications.map((item) => {
    const med = item.medication || item;
    const name = med.name || med.medicineName || med.drugName || item.name || 'Medication';
    return {
      name: String(name).trim(),
      dosage: item.dosage || med.dosage || med.strength || null,
      frequency: item.frequency || med.frequency || null,
      days: Number(item.days || item.duration?.replace?.(/\D/g, '') || med.days || 0) || null,
      quantity: Math.max(1, Number(item.quantity || med.quantity || 1))
    };
  }).filter((m) => m.name);
}

function normalizeLabTests(tests = []) {
  if (!Array.isArray(tests)) return [];
  return tests.map((t) => {
    if (typeof t === 'string') return { name: t, price: 0 };
    return {
      name: t.name || t.testName || t.testType || t.test_type || 'Lab Test',
      code: t.code || t.testCode || null,
      price: Number(t.price || t.amount || 0)
    };
  }).filter((t) => t.name);
}

async function resolveMedicineId(name) {
  const search = String(name).trim();
  const existing = await pool.query(
    `SELECT id FROM pharmacy_medicines
     WHERE name ILIKE $1 OR generic_name ILIKE $1 OR brand_name ILIKE $1
     LIMIT 1`,
    [search]
  );
  if (existing.rows[0]) return existing.rows[0].id;

  const inserted = await pool.query(
    `INSERT INTO pharmacy_medicines (name, unit_price, created_at, updated_at)
     VALUES ($1, 0, NOW(), NOW())
     RETURNING id`,
    [search]
  );
  return inserted.rows[0].id;
}

export async function routeLabOrder({
  labOrderId,
  hospitalId,
  patientId,
  doctorId,
  tests,
  testType,
  totalAmount,
  orderNumber,
  priority,
  notes
}) {
  await ensureTables();
  const partners = await resolvePartners(hospitalId);
  const normalizedTests = normalizeLabTests(
    Array.isArray(tests) && tests.length > 0 ? tests : (testType ? [{ name: testType, price: totalAmount }] : [])
  );
  const amount = Number(totalAmount) || normalizedTests.reduce((sum, t) => sum + (t.price || 0), 0);
  const description = normalizedTests.map((t) => t.name).join(', ') || testType || 'Lab order';

  const charge = await createBillingCharge({
    hospitalId,
    patientId,
    chargeType: 'lab',
    sourceType: 'lab_order',
    sourceId: labOrderId,
    description,
    amount,
    metadata: { orderNumber, tests: normalizedTests }
  });

  if (partners.labId) {
    await pool.query(
      `UPDATE lab_orders
       SET lab_id = $1,
           hospital_id = COALESCE(hospital_id, $2),
           source_type = COALESCE(source_type, 'hospital_emr'),
           source_id = COALESCE(source_id, $3),
           billing_charge_id = $4,
           updated_at = NOW()
       WHERE id = $3`,
      [partners.labId, hospitalId, labOrderId, charge.id]
    );
  } else {
    await pool.query(
      `UPDATE lab_orders
       SET hospital_id = COALESCE(hospital_id, $1),
           billing_charge_id = $2,
           updated_at = NOW()
       WHERE id = $3`,
      [hospitalId, charge.id, labOrderId]
    );
  }

  await logEvent({
    hospitalId,
    eventType: 'lab_order_routed',
    sourceType: 'lab_order',
    sourceId: labOrderId,
    targetType: partners.labId ? 'lab' : null,
    targetId: partners.labId,
    status: partners.labId ? 'routed' : 'pending_partner',
    payload: { orderNumber, labId: partners.labId, amount }
  });

  return { labId: partners.labId, billingChargeId: charge.id, amount };
}

export async function routePrescription({
  prescriptionId,
  hospitalId,
  patientId,
  doctorId,
  medications,
  notes,
  diagnosis,
  labTests
}) {
  await ensureTables();
  const partners = await resolvePartners(hospitalId);
  const meds = normalizeMedications(medications);
  const results = { pharmacyPrescriptionId: null, labOrderIds: [], billingChargeIds: [] };

  if (partners.pharmacyId && meds.length > 0) {
    const rxResult = await pool.query(
      `INSERT INTO pharmacy_prescriptions
        (pharmacy_id, patient_id, doctor_id, notes, status, verification_status,
         hospital_id, source_prescription_id, source_type, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'pending', 'pending', $5, $6, 'hospital_emr', NOW(), NOW())
       RETURNING id`,
      [partners.pharmacyId, patientId || null, doctorId || null, notes || diagnosis || null, hospitalId, prescriptionId]
    );
    const pharmacyRxId = rxResult.rows[0].id;
    results.pharmacyPrescriptionId = pharmacyRxId;

    let rxTotal = 0;
    for (const med of meds) {
      const medicineId = await resolveMedicineId(med.name);
      const priceRow = await pool.query(`SELECT unit_price FROM pharmacy_medicines WHERE id = $1`, [medicineId]);
      const unitPrice = Number(priceRow.rows[0]?.unit_price || 0);
      rxTotal += unitPrice * med.quantity;

      await pool.query(
        `INSERT INTO pharmacy_prescription_medicines
          (prescription_id, medicine_id, quantity, dosage, frequency, days)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [pharmacyRxId, medicineId, med.quantity, med.dosage, med.frequency, med.days]
      );
    }

    const charge = await createBillingCharge({
      hospitalId,
      patientId,
      chargeType: 'pharmacy',
      sourceType: 'pharmacy_prescription',
      sourceId: pharmacyRxId,
      description: `Pharmacy Rx #${pharmacyRxId}: ${meds.map((m) => m.name).join(', ')}`,
      amount: rxTotal,
      metadata: { sourcePrescriptionId: prescriptionId, medications: meds }
    });
    results.billingChargeIds.push(charge.id);

    await pool.query(
      `UPDATE pharmacy_prescriptions SET billing_charge_id = $1, updated_at = NOW() WHERE id = $2`,
      [charge.id, pharmacyRxId]
    );

    await logEvent({
      hospitalId,
      eventType: 'prescription_routed',
      sourceType: 'prescription',
      sourceId: prescriptionId,
      targetType: 'pharmacy_prescription',
      targetId: pharmacyRxId,
      payload: { pharmacyId: partners.pharmacyId, amount: rxTotal }
    });
  }

  const tests = normalizeLabTests(labTests);
  for (const test of tests) {
    const orderNumber = `LAB-RX-${prescriptionId}-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
    const orderResult = await pool.query(
      `INSERT INTO lab_orders
        (order_number, patient_id, hospital_id, doctor_id, test_type, tests, priority, notes, total_amount, status, lab_id, source_type, source_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, 'routine', $7, $8, 'ordered', $9, 'prescription_lab_test', $10, NOW(), NOW())
       RETURNING id`,
      [
        orderNumber,
        patientId,
        hospitalId,
        doctorId || null,
        test.name,
        JSON.stringify([test]),
        notes || diagnosis || null,
        test.price || 0,
        partners.labId,
        prescriptionId
      ]
    );
    const labOrderId = orderResult.rows[0].id;
    results.labOrderIds.push(labOrderId);

    const routed = await routeLabOrder({
      labOrderId,
      hospitalId,
      patientId,
      doctorId,
      tests: [test],
      testType: test.name,
      totalAmount: test.price,
      orderNumber,
      notes
    });
    if (routed.billingChargeId) results.billingChargeIds.push(routed.billingChargeId);
  }

  return results;
}

export async function finalizeLabOrderBilling(labOrderId, { amount } = {}) {
  await ensureTables();
  const { rows } = await pool.query(`SELECT * FROM lab_orders WHERE id = $1`, [labOrderId]);
  const order = rows[0];
  if (!order) return null;

  const chargeAmount = Number(amount ?? order.total_amount ?? 0);
  let chargeId = order.billing_charge_id;

  if (!chargeId) {
    const charge = await createBillingCharge({
      hospitalId: order.hospital_id || order.organization_id,
      patientId: order.patient_id,
      chargeType: 'lab',
      sourceType: 'lab_order',
      sourceId: labOrderId,
      description: order.test_type || 'Lab order completed',
      amount: chargeAmount
    });
    chargeId = charge.id;
    await pool.query(`UPDATE lab_orders SET billing_charge_id = $1 WHERE id = $2`, [chargeId, labOrderId]);
  }

  await pool.query(
    `UPDATE hospital_billing_charges
     SET status = 'posted', amount = GREATEST(amount, $1), posted_at = NOW(), updated_at = NOW()
     WHERE id = $2`,
    [chargeAmount, chargeId]
  );

  await logEvent({
    hospitalId: order.hospital_id || order.organization_id,
    eventType: 'lab_billing_posted',
    sourceType: 'lab_order',
    sourceId: labOrderId,
    targetType: 'billing_charge',
    targetId: chargeId,
    status: 'posted',
    payload: { amount: chargeAmount }
  });

  return { billingChargeId: chargeId, amount: chargeAmount };
}

export async function finalizePharmacyDispenseBilling(pharmacyPrescriptionId, { pharmacyId, totalAmount, items } = {}) {
  await ensureTables();
  const { rows } = await pool.query(
    `SELECT * FROM pharmacy_prescriptions WHERE id = $1`,
    [pharmacyPrescriptionId]
  );
  const rx = rows[0];
  if (!rx) return null;

  const pid = pharmacyId || rx.pharmacy_id;
  let invoiceId = null;
  let computedTotal = Number(totalAmount || 0);

  if (!computedTotal && Array.isArray(items) && items.length > 0) {
    computedTotal = items.reduce((sum, item) => sum + (Number(item.quantity) * Number(item.price || 0)), 0);
  }

  if (!computedTotal) {
    const medRows = await pool.query(
      `SELECT pmx.quantity, COALESCE(m.unit_price, 0) AS unit_price
       FROM pharmacy_prescription_medicines pmx
       LEFT JOIN pharmacy_medicines m ON m.id = pmx.medicine_id
       WHERE pmx.prescription_id = $1`,
      [pharmacyPrescriptionId]
    );
    computedTotal = medRows.rows.reduce((sum, row) => sum + Number(row.quantity) * Number(row.unit_price), 0);
  }

  if (pid && computedTotal > 0) {
    const invoiceResult = await pool.query(
      `INSERT INTO pharmacy_invoices
        (pharmacy_id, total_amount, payment_method, notes, status, created_at)
       VALUES ($1, $2, 'hospital_emr', $3, 'issued', NOW())
       RETURNING id`,
      [pid, computedTotal, `EMR dispense for Rx #${pharmacyPrescriptionId}`]
    );
    invoiceId = invoiceResult.rows[0].id;

    const medItems = await pool.query(
      `SELECT pmx.medicine_id, pmx.quantity, COALESCE(m.unit_price, 0) AS price
       FROM pharmacy_prescription_medicines pmx
       LEFT JOIN pharmacy_medicines m ON m.id = pmx.medicine_id
       WHERE pmx.prescription_id = $1`,
      [pharmacyPrescriptionId]
    );
    for (const item of medItems.rows) {
      await pool.query(
        `INSERT INTO pharmacy_invoice_items (invoice_id, medicine_id, quantity, price, subtotal)
         VALUES ($1, $2, $3, $4, $5)`,
        [invoiceId, item.medicine_id, item.quantity, item.price, item.quantity * item.price]
      );
    }

    // Actually consume stock (FEFO across batches) — billing alone used to have no inventory effect.
    const stockClient = await pool.connect();
    try {
      await stockClient.query('BEGIN');
      for (const item of medItems.rows) {
        await stockClient.query(
          `UPDATE pharmacy_stock SET quantity = quantity - $1, updated_at = NOW()
           WHERE medicine_id = $2 AND pharmacy_id = $3 AND quantity >= $1`,
          [item.quantity, item.medicine_id, pid]
        );
        await issueFefo(stockClient, {
          pharmacyId: pid,
          medicineId: item.medicine_id,
          quantity: Number(item.quantity),
          referenceType: 'opd_prescription',
          referenceId: pharmacyPrescriptionId,
          idempotencyKey: `opd-rx-${pharmacyPrescriptionId}-${item.medicine_id}`,
        });
      }
      await stockClient.query('COMMIT');
    } catch (stockErr) {
      await stockClient.query('ROLLBACK').catch(() => {});
      console.error('[emr-order-router] FEFO stock deduction failed for Rx', pharmacyPrescriptionId, stockErr.message);
    } finally {
      stockClient.release();
    }
  }

  let chargeId = rx.billing_charge_id;
  if (!chargeId) {
    const charge = await createBillingCharge({
      hospitalId: rx.hospital_id,
      patientId: rx.patient_id,
      chargeType: 'pharmacy',
      sourceType: 'pharmacy_prescription',
      sourceId: pharmacyPrescriptionId,
      description: `Pharmacy dispense Rx #${pharmacyPrescriptionId}`,
      amount: computedTotal
    });
    chargeId = charge.id;
  } else {
    await pool.query(
      `UPDATE hospital_billing_charges
       SET amount = GREATEST(amount, $1), invoice_id = COALESCE($2, invoice_id), updated_at = NOW()
       WHERE id = $3`,
      [computedTotal, invoiceId, chargeId]
    );
  }

  await pool.query(
    `UPDATE hospital_billing_charges
     SET status = 'posted', posted_at = NOW(), updated_at = NOW()
     WHERE id = $1`,
    [chargeId]
  );

  await logEvent({
    hospitalId: rx.hospital_id,
    eventType: 'pharmacy_billing_posted',
    sourceType: 'pharmacy_prescription',
    sourceId: pharmacyPrescriptionId,
    targetType: 'billing_charge',
    targetId: chargeId,
    status: 'posted',
    payload: { amount: computedTotal, invoiceId }
  });

  return { billingChargeId: chargeId, invoiceId, amount: computedTotal };
}

export async function getPatientOrderStatus(hospitalId, patientId) {
  await ensureTables();
  const hid = Number(hospitalId);
  const pid = Number(patientId);

  const labOrders = await pool.query(
    `SELECT lo.id, lo.order_number, lo.status, lo.priority, lo.test_type, lo.tests,
            lo.total_amount, lo.lab_id, lo.created_at, lo.updated_at,
            e.status AS route_status, e.target_id AS routed_lab_id
     FROM lab_orders lo
     LEFT JOIN LATERAL (
       SELECT status, target_id FROM emr_order_events
       WHERE source_type = 'lab_order' AND source_id = lo.id
       ORDER BY created_at DESC LIMIT 1
     ) e ON TRUE
     WHERE lo.patient_id = $1
       AND (lo.hospital_id = $2 OR lo.organization_id = $2)
     ORDER BY lo.created_at DESC
     LIMIT 50`,
    [pid, hid]
  );

  const prescriptions = await pool.query(
    `SELECT p.id, p.status, p.diagnosis, p.medications, p.created_at,
            pp.id AS pharmacy_rx_id, pp.status AS pharmacy_status,
            pp.verification_status, pp.dispensed_at
     FROM prescriptions p
     LEFT JOIN pharmacy_prescriptions pp ON pp.source_prescription_id = p.id
     WHERE p.patient_id = $1 AND p.hospital_id = $2
     ORDER BY p.created_at DESC
     LIMIT 50`,
    [pid, hid]
  );

  const billing = await pool.query(
    `SELECT id, charge_type, description, amount, status, source_type, source_id, posted_at, created_at
     FROM hospital_billing_charges
     WHERE patient_id = $1 AND hospital_id = $2
     ORDER BY created_at DESC
     LIMIT 50`,
    [pid, hid]
  );

  return {
    labOrders: labOrders.rows,
    prescriptions: prescriptions.rows,
    billingCharges: billing.rows
  };
}

export default {
  resolvePartners,
  routeLabOrder,
  routePrescription,
  finalizeLabOrderBilling,
  finalizePharmacyDispenseBilling,
  getPatientOrderStatus
};
