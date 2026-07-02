/**
 * Hospital Billing Suite — centralized billing, multi-station cashiering,
 * cash/credit/insurance collection, PGI, and audit trail.
 */

import pool from '../db/pgPool.js';
import paymentGateway from '../services/payment-gateway.service.js';
import { generateHospitalBillPdf } from './hospital-bill-template.service.js';

let tablesReady = false;

async function ensureTables() {
  if (tablesReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS billing_stations (
      id SERIAL PRIMARY KEY, hospital_id INTEGER NOT NULL, station_code VARCHAR(40) NOT NULL,
      station_name VARCHAR(120) NOT NULL, location VARCHAR(200), station_type VARCHAR(30) DEFAULT 'cashier',
      accepts_cash BOOLEAN DEFAULT TRUE, accepts_card BOOLEAN DEFAULT TRUE, accepts_upi BOOLEAN DEFAULT TRUE,
      accepts_credit BOOLEAN DEFAULT TRUE, accepts_insurance BOOLEAN DEFAULT TRUE, is_active BOOLEAN DEFAULT TRUE,
      settings JSONB DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (hospital_id, station_code)
    );
    CREATE TABLE IF NOT EXISTS billing_cashier_sessions (
      id BIGSERIAL PRIMARY KEY, hospital_id INTEGER NOT NULL, station_id INTEGER NOT NULL,
      cashier_user_id INTEGER, cashier_name VARCHAR(200), status VARCHAR(20) DEFAULT 'open',
      opening_float NUMERIC(12,2) DEFAULT 0, cash_collected NUMERIC(12,2) DEFAULT 0,
      card_collected NUMERIC(12,2) DEFAULT 0, upi_collected NUMERIC(12,2) DEFAULT 0,
      credit_collected NUMERIC(12,2) DEFAULT 0, insurance_collected NUMERIC(12,2) DEFAULT 0,
      total_collected NUMERIC(12,2) DEFAULT 0, closing_total NUMERIC(12,2),
      opened_at TIMESTAMPTZ DEFAULT NOW(), closed_at TIMESTAMPTZ, notes TEXT
    );
    CREATE TABLE IF NOT EXISTS hospital_bill_templates (
      id SERIAL PRIMARY KEY, hospital_id INTEGER NOT NULL, template_code VARCHAR(40) NOT NULL,
      template_name VARCHAR(120) NOT NULL, template_type VARCHAR(30) DEFAULT 'itemized',
      payer_type VARCHAR(30) DEFAULT 'all', header_config JSONB DEFAULT '{}'::jsonb,
      footer_config JSONB DEFAULT '{}'::jsonb, line_layout JSONB DEFAULT '{}'::jsonb,
      is_default BOOLEAN DEFAULT FALSE, is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (hospital_id, template_code)
    );
    CREATE TABLE IF NOT EXISTS hospital_invoices (
      id BIGSERIAL PRIMARY KEY, hospital_id INTEGER NOT NULL, bill_number VARCHAR(50) NOT NULL,
      patient_id INTEGER, admission_id BIGINT, station_id INTEGER, session_id BIGINT, template_id INTEGER,
      bill_type VARCHAR(30) DEFAULT 'ipd', payment_mode VARCHAR(30) DEFAULT 'mixed',
      subtotal NUMERIC(14,2) DEFAULT 0, discount_amount NUMERIC(14,2) DEFAULT 0, tax_amount NUMERIC(14,2) DEFAULT 0,
      total_amount NUMERIC(14,2) DEFAULT 0, insurance_amount NUMERIC(14,2) DEFAULT 0,
      patient_liability NUMERIC(14,2) DEFAULT 0, amount_paid NUMERIC(14,2) DEFAULT 0, amount_due NUMERIC(14,2) DEFAULT 0,
      status VARCHAR(30) DEFAULT 'draft', insurance_claim_id INTEGER, pgi_order_id VARCHAR(120),
      pgi_payment_link TEXT, pgi_status VARCHAR(30), metadata JSONB DEFAULT '{}'::jsonb,
      finalized_at TIMESTAMPTZ, created_by INTEGER, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (hospital_id, bill_number)
    );
    CREATE TABLE IF NOT EXISTS hospital_invoice_lines (
      id BIGSERIAL PRIMARY KEY, invoice_id BIGINT NOT NULL, charge_source VARCHAR(40), charge_source_id BIGINT,
      charge_code VARCHAR(60), description TEXT NOT NULL, category VARCHAR(60), quantity NUMERIC(10,2) DEFAULT 1,
      unit_price NUMERIC(14,2) DEFAULT 0, tax_percent NUMERIC(6,2) DEFAULT 0, line_total NUMERIC(14,2) DEFAULT 0,
      insurance_payable BOOLEAN DEFAULT TRUE, created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS hospital_payments (
      id BIGSERIAL PRIMARY KEY, hospital_id INTEGER NOT NULL, invoice_id BIGINT NOT NULL,
      station_id INTEGER, session_id BIGINT, payment_method VARCHAR(30) NOT NULL, amount NUMERIC(14,2) NOT NULL,
      reference_number VARCHAR(120), gateway VARCHAR(40), gateway_order_id VARCHAR(120),
      gateway_payment_id VARCHAR(120), gateway_status VARCHAR(30), insurance_claim_id INTEGER,
      received_by INTEGER, received_by_name VARCHAR(200), notes TEXT, status VARCHAR(20) DEFAULT 'completed',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS hospital_credit_accounts (
      id BIGSERIAL PRIMARY KEY, hospital_id INTEGER NOT NULL, patient_id INTEGER NOT NULL,
      credit_limit NUMERIC(14,2) DEFAULT 0, balance NUMERIC(14,2) DEFAULT 0, status VARCHAR(20) DEFAULT 'active',
      approved_by VARCHAR(200), notes TEXT, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (hospital_id, patient_id)
    );
    CREATE TABLE IF NOT EXISTS hospital_credit_ledger (
      id BIGSERIAL PRIMARY KEY, credit_account_id BIGINT NOT NULL, invoice_id BIGINT, payment_id BIGINT,
      entry_type VARCHAR(20) NOT NULL, amount NUMERIC(14,2) NOT NULL, balance_after NUMERIC(14,2) NOT NULL,
      notes TEXT, created_by INTEGER, created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS billing_audit_log (
      id BIGSERIAL PRIMARY KEY, hospital_id INTEGER NOT NULL, station_id INTEGER, session_id BIGINT,
      actor_id INTEGER, actor_name VARCHAR(200), action VARCHAR(80) NOT NULL, resource_type VARCHAR(60) NOT NULL,
      resource_id VARCHAR(80), before_state JSONB, after_state JSONB, ip_address VARCHAR(64), user_agent TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  tablesReady = true;
}

export async function logBillingAudit({
  hospitalId, stationId, sessionId, actorId, actorName, action, resourceType, resourceId,
  beforeState, afterState, req
}) {
  await ensureTables();
  await pool.query(
    `INSERT INTO billing_audit_log
      (hospital_id, station_id, session_id, actor_id, actor_name, action, resource_type, resource_id,
       before_state, after_state, ip_address, user_agent)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11,$12)`,
    [
      hospitalId, stationId || null, sessionId || null, actorId || null, actorName || null,
      action, resourceType, resourceId || null,
      beforeState ? JSON.stringify(beforeState) : null,
      afterState ? JSON.stringify(afterState) : null,
      req?.ip || null, req?.headers?.['user-agent'] || null
    ]
  );
}

function billNumber(hospitalId) {
  return `BILL-${hospitalId}-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

export async function listStations(hospitalId) {
  await ensureTables();
  const { rows } = await pool.query(
    `SELECT * FROM billing_stations WHERE hospital_id = $1 AND is_active = TRUE ORDER BY station_name`,
    [hospitalId]
  );
  return rows;
}

export async function createStation(hospitalId, data) {
  await ensureTables();
  const { rows } = await pool.query(
    `INSERT INTO billing_stations
      (hospital_id, station_code, station_name, location, station_type,
       accepts_cash, accepts_card, accepts_upi, accepts_credit, accepts_insurance)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [
      hospitalId, data.stationCode, data.stationName, data.location || null, data.stationType || 'cashier',
      data.acceptsCash !== false, data.acceptsCard !== false, data.acceptsUpi !== false,
      data.acceptsCredit !== false, data.acceptsInsurance !== false
    ]
  );
  return rows[0];
}

export async function openCashierSession(hospitalId, { stationId, cashierUserId, cashierName, openingFloat }, ctx = {}) {
  await ensureTables();
  const existing = await pool.query(
    `SELECT id FROM billing_cashier_sessions WHERE station_id = $1 AND status = 'open' LIMIT 1`,
    [stationId]
  );
  if (existing.rows[0]) {
    throw new Error('Station already has an open cashier session');
  }
  const { rows } = await pool.query(
    `INSERT INTO billing_cashier_sessions
      (hospital_id, station_id, cashier_user_id, cashier_name, opening_float, status)
     VALUES ($1,$2,$3,$4,$5,'open') RETURNING *`,
    [hospitalId, stationId, cashierUserId || null, cashierName || null, Number(openingFloat) || 0]
  );
  await logBillingAudit({
    hospitalId, stationId, sessionId: rows[0].id, actorId: cashierUserId, actorName: cashierName,
    action: 'session.open', resourceType: 'cashier_session', resourceId: String(rows[0].id),
    afterState: rows[0], req: ctx.req
  });
  return rows[0];
}

export async function closeCashierSession(hospitalId, sessionId, { closingTotal, notes }, ctx = {}) {
  await ensureTables();
  const { rows } = await pool.query(
    `UPDATE billing_cashier_sessions
     SET status = 'closed', closing_total = $1, closed_at = NOW(), notes = COALESCE($2, notes)
     WHERE id = $3 AND hospital_id = $4 AND status = 'open' RETURNING *`,
    [Number(closingTotal) || 0, notes || null, sessionId, hospitalId]
  );
  if (!rows[0]) throw new Error('Open session not found');
  await logBillingAudit({
    hospitalId, stationId: rows[0].station_id, sessionId, action: 'session.close',
    resourceType: 'cashier_session', resourceId: String(sessionId), afterState: rows[0], req: ctx.req
  });
  return rows[0];
}

export async function getActiveSession(hospitalId, stationId) {
  await ensureTables();
  const { rows } = await pool.query(
    `SELECT s.*, st.station_name, st.station_code
     FROM billing_cashier_sessions s
     JOIN billing_stations st ON st.id = s.station_id
     WHERE s.hospital_id = $1 AND s.station_id = $2 AND s.status = 'open'
     ORDER BY s.opened_at DESC LIMIT 1`,
    [hospitalId, stationId]
  );
  return rows[0] || null;
}

export async function listTemplates(hospitalId) {
  await ensureTables();
  const { rows } = await pool.query(
    `SELECT * FROM hospital_bill_templates WHERE hospital_id = $1 AND is_active = TRUE ORDER BY is_default DESC, template_name`,
    [hospitalId]
  );
  return rows;
}

export async function aggregatePatientAccount(hospitalId, { patientId, admissionId }) {
  await ensureTables();
  const charges = await pool.query(
    `SELECT id, charge_type, description, amount, status, source_type, source_id, created_at
     FROM hospital_billing_charges
     WHERE hospital_id = $1 AND patient_id = $2
     ORDER BY created_at DESC`,
    [hospitalId, patientId]
  );

  const estimates = await pool.query(
    `SELECT * FROM billing_estimates
     WHERE organization_id = $1 AND patient_id = $2
     ${admissionId ? 'AND admission_id = $3' : ''}
     ORDER BY created_at DESC LIMIT 5`,
    admissionId ? [hospitalId, patientId, admissionId] : [hospitalId, patientId]
  );

  const invoices = await pool.query(
    `SELECT id, bill_number, total_amount, amount_paid, amount_due, status, payment_mode, created_at
     FROM hospital_invoices
     WHERE hospital_id = $1 AND patient_id = $2
     ORDER BY created_at DESC LIMIT 20`,
    [hospitalId, patientId]
  );

  const credit = await pool.query(
    `SELECT * FROM hospital_credit_accounts WHERE hospital_id = $1 AND patient_id = $2`,
    [hospitalId, patientId]
  );

  const pendingCharges = charges.rows.filter((c) => c.status === 'pending' || c.status === 'posted');
  const totalPending = pendingCharges.reduce((s, c) => s + Number(c.amount || 0), 0);

  return {
    charges: charges.rows,
    estimates: estimates.rows,
    invoices: invoices.rows,
    creditAccount: credit.rows[0] || null,
    summary: {
      pendingCharges: totalPending,
      openInvoices: invoices.rows.filter((i) => ['draft', 'issued', 'partial'].includes(i.status)).length,
      totalDue: invoices.rows.reduce((s, i) => s + Number(i.amount_due || 0), 0)
    }
  };
}

export async function getCentralizedDashboard(hospitalId) {
  await ensureTables();
  const [stations, sessions, invoices, payments, audit] = await Promise.all([
    pool.query(`SELECT COUNT(*)::int AS count FROM billing_stations WHERE hospital_id = $1 AND is_active`, [hospitalId]),
    pool.query(`SELECT COUNT(*)::int AS open_sessions FROM billing_cashier_sessions WHERE hospital_id = $1 AND status = 'open'`, [hospitalId]),
    pool.query(
      `SELECT status, COUNT(*)::int AS count, COALESCE(SUM(total_amount),0) AS total
       FROM hospital_invoices WHERE hospital_id = $1 AND created_at > NOW() - INTERVAL '30 days'
       GROUP BY status`, [hospitalId]
    ),
    pool.query(
      `SELECT payment_method, COUNT(*)::int AS count, COALESCE(SUM(amount),0) AS total
       FROM hospital_payments WHERE hospital_id = $1 AND created_at > NOW() - INTERVAL '30 days'
       GROUP BY payment_method`, [hospitalId]
    ),
    pool.query(
      `SELECT action, resource_type, actor_name, created_at
       FROM billing_audit_log WHERE hospital_id = $1 ORDER BY created_at DESC LIMIT 15`, [hospitalId]
    )
  ]);

  const pendingCharges = await pool.query(
    `SELECT COALESCE(SUM(amount),0) AS total, COUNT(*)::int AS count
     FROM hospital_billing_charges WHERE hospital_id = $1 AND status IN ('pending','posted')`,
    [hospitalId]
  );

  return {
    stations: stations.rows[0]?.count || 0,
    openSessions: sessions.rows[0]?.open_sessions || 0,
    invoiceStats: invoices.rows,
    paymentBreakdown: payments.rows,
    pendingCharges: pendingCharges.rows[0],
    recentAudit: audit.rows
  };
}

async function buildLinesFromCharges(hospitalId, patientId, admissionId) {
  const { rows } = await pool.query(
    `SELECT id, charge_type, description, amount, source_type, source_id
     FROM hospital_billing_charges
     WHERE hospital_id = $1 AND patient_id = $2 AND status IN ('pending','posted')
     ORDER BY created_at ASC`,
    [hospitalId, patientId]
  );
  return rows.map((c) => ({
    chargeSource: c.source_type || 'charge',
    chargeSourceId: c.source_id || c.id,
    chargeCode: c.charge_type,
    description: c.description || c.charge_type,
    category: c.charge_type,
    quantity: 1,
    unitPrice: Number(c.amount),
    lineTotal: Number(c.amount)
  }));
}

export async function createInvoice(hospitalId, data, ctx = {}) {
  await ensureTables();
  const {
    patientId, admissionId, stationId, sessionId, templateId, billType, paymentMode,
    discountAmount, taxAmount, insuranceAmount, lines, autoPgi, insuranceClaimId, createdBy
  } = data;

  let invoiceLines = Array.isArray(lines) && lines.length > 0 ? lines : await buildLinesFromCharges(hospitalId, patientId, admissionId);
  if (invoiceLines.length === 0) {
    throw new Error('No billable charges found for this patient');
  }

  const subtotal = invoiceLines.reduce((s, l) => s + Number(l.lineTotal ?? l.unitPrice * (l.quantity || 1)), 0);
  const discount = Number(discountAmount) || 0;
  const tax = Number(taxAmount) || 0;
  const insurance = Number(insuranceAmount) || 0;
  const total = subtotal - discount + tax;
  const patientLiability = Math.max(0, total - insurance);

  let template = templateId;
  if (!template) {
    const tpl = await pool.query(
      `SELECT id FROM hospital_bill_templates WHERE hospital_id = $1 AND is_default = TRUE LIMIT 1`,
      [hospitalId]
    );
    template = tpl.rows[0]?.id || null;
  }

  const number = billNumber(hospitalId);
  const { rows } = await pool.query(
    `INSERT INTO hospital_invoices
      (hospital_id, bill_number, patient_id, admission_id, station_id, session_id, template_id,
       bill_type, payment_mode, subtotal, discount_amount, tax_amount, total_amount,
       insurance_amount, patient_liability, amount_due, status, insurance_claim_id, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'issued',$17,$18)
     RETURNING *`,
    [
      hospitalId, number, patientId, admissionId || null, stationId || null, sessionId || null, template,
      billType || 'ipd', paymentMode || 'mixed', subtotal, discount, tax, total, insurance, patientLiability,
      patientLiability, insuranceClaimId || null, createdBy || null
    ]
  );
  const invoice = rows[0];

  for (const line of invoiceLines) {
    const qty = Number(line.quantity) || 1;
    const unit = Number(line.unitPrice) || 0;
    const lineTotal = Number(line.lineTotal) || qty * unit;
    await pool.query(
      `INSERT INTO hospital_invoice_lines
        (invoice_id, charge_source, charge_source_id, charge_code, description, category,
         quantity, unit_price, tax_percent, line_total, insurance_payable)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        invoice.id, line.chargeSource || null, line.chargeSourceId || null, line.chargeCode || null,
        line.description, line.category || 'general', qty, unit, line.taxPercent || 0, lineTotal,
        line.insurancePayable !== false
      ]
    );
  }

  await pool.query(
    `UPDATE hospital_billing_charges SET status = 'invoiced', updated_at = NOW()
     WHERE hospital_id = $1 AND patient_id = $2 AND status IN ('pending','posted')`,
    [hospitalId, patientId]
  );

  await logBillingAudit({
    hospitalId, stationId, sessionId, actorId: createdBy, action: 'invoice.create',
    resourceType: 'hospital_invoice', resourceId: String(invoice.id), afterState: invoice, req: ctx.req
  });

  let pgi = null;
  if (autoPgi && patientLiability > 0) {
    pgi = await createPaymentLink(hospitalId, invoice.id, ctx);
  }

  return { invoice, pgi };
}

export async function recordPayment(hospitalId, invoiceId, data, ctx = {}) {
  await ensureTables();
  const method = String(data.paymentMethod || 'cash').toLowerCase();
  const amount = Number(data.amount);
  if (!amount || amount <= 0) throw new Error('Payment amount must be positive');

  const inv = await pool.query(`SELECT * FROM hospital_invoices WHERE id = $1 AND hospital_id = $2`, [invoiceId, hospitalId]);
  const invoice = inv.rows[0];
  if (!invoice) throw new Error('Invoice not found');

  if (method === 'credit') {
    await applyCreditPayment(hospitalId, invoice.patient_id, amount, invoiceId, ctx);
  }

  const { rows: payRows } = await pool.query(
    `INSERT INTO hospital_payments
      (hospital_id, invoice_id, station_id, session_id, payment_method, amount, reference_number,
       insurance_claim_id, received_by, received_by_name, notes, gateway_status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'captured') RETURNING *`,
    [
      hospitalId, invoiceId, data.stationId || invoice.station_id, data.sessionId || invoice.session_id,
      method, amount, data.referenceNumber || null, data.insuranceClaimId || invoice.insurance_claim_id || null,
      data.receivedBy || ctx.actorId || null, data.receivedByName || ctx.actorName || null, data.notes || null
    ]
  );

  const newPaid = Number(invoice.amount_paid) + amount;
  const newDue = Math.max(0, Number(invoice.patient_liability) - newPaid);
  const status = newDue <= 0 ? 'paid' : 'partial';

  await pool.query(
    `UPDATE hospital_invoices
     SET amount_paid = $1, amount_due = $2, status = $3, payment_mode = $4, updated_at = NOW(),
         finalized_at = CASE WHEN $2 <= 0 THEN COALESCE(finalized_at, NOW()) ELSE finalized_at END
     WHERE id = $5`,
    [newPaid, newDue, status, method, invoiceId]
  );

  if (data.sessionId) {
    const col = {
      cash: 'cash_collected', card: 'card_collected', upi: 'upi_collected',
      credit: 'credit_collected', insurance: 'insurance_collected'
    }[method] || 'cash_collected';
    await pool.query(
      `UPDATE billing_cashier_sessions
       SET ${col} = ${col} + $1, total_collected = total_collected + $1
       WHERE id = $2`,
      [amount, data.sessionId]
    );
  }

  await logBillingAudit({
    hospitalId, stationId: data.stationId, sessionId: data.sessionId, actorId: data.receivedBy,
    actorName: data.receivedByName, action: 'payment.record', resourceType: 'hospital_payment',
    resourceId: String(payRows[0].id), afterState: payRows[0], req: ctx.req
  });

  return { payment: payRows[0], invoiceStatus: status, amountDue: newDue };
}

async function applyCreditPayment(hospitalId, patientId, amount, invoiceId, ctx) {
  let account = await pool.query(
    `SELECT * FROM hospital_credit_accounts WHERE hospital_id = $1 AND patient_id = $2`,
    [hospitalId, patientId]
  );
  if (!account.rows[0]) {
    const created = await pool.query(
      `INSERT INTO hospital_credit_accounts (hospital_id, patient_id, credit_limit, balance)
       VALUES ($1,$2,50000,0) RETURNING *`,
      [hospitalId, patientId]
    );
    account = created;
  }
  const acct = account.rows[0];
  const newBalance = Number(acct.balance) + amount;
  if (acct.credit_limit > 0 && newBalance > Number(acct.credit_limit)) {
    throw new Error('Credit limit exceeded');
  }
  await pool.query(`UPDATE hospital_credit_accounts SET balance = $1, updated_at = NOW() WHERE id = $2`, [newBalance, acct.id]);
  await pool.query(
    `INSERT INTO hospital_credit_ledger (credit_account_id, invoice_id, entry_type, amount, balance_after, created_by)
     VALUES ($1,$2,'debit',$3,$4,$5)`,
    [acct.id, invoiceId, amount, newBalance, ctx.actorId || null]
  );
}

export async function createPaymentLink(hospitalId, invoiceId, ctx = {}) {
  await ensureTables();
  const inv = await pool.query(`SELECT * FROM hospital_invoices WHERE id = $1 AND hospital_id = $2`, [invoiceId, hospitalId]);
  const invoice = inv.rows[0];
  if (!invoice) throw new Error('Invoice not found');

  const due = Number(invoice.amount_due ?? invoice.patient_liability) - Number(invoice.amount_paid || 0);
  if (due <= 0) throw new Error('No amount due on this invoice');

  const order = await paymentGateway.createRazorpayOrder({
    amount: due,
    currency: 'INR',
    receipt: invoice.bill_number,
    notes: {
      hospitalId: String(hospitalId),
      invoiceId: String(invoiceId),
      patientId: String(invoice.patient_id || ''),
      billNumber: invoice.bill_number
    }
  });

  await pool.query(
    `UPDATE hospital_invoices
     SET pgi_order_id = $1, pgi_status = 'created', metadata = metadata || $2::jsonb, updated_at = NOW()
     WHERE id = $3`,
    [order.orderId, JSON.stringify({ pgiAmount: due, pgiGateway: 'razorpay' }), invoiceId]
  );

  await logBillingAudit({
    hospitalId, action: 'pgi.link_created', resourceType: 'hospital_invoice', resourceId: String(invoiceId),
    afterState: { orderId: order.orderId, amount: due }, req: ctx.req
  });

  return { orderId: order.orderId, amount: due, gateway: 'razorpay', keyId: process.env.RAZORPAY_KEY_ID || null };
}

export async function confirmPgiPayment(hospitalId, { invoiceId, razorpayOrderId, razorpayPaymentId, signature }) {
  await ensureTables();
  const verified = paymentGateway.verifyRazorpaySignature(razorpayOrderId, razorpayPaymentId, signature);
  if (!verified) throw new Error('PGI signature verification failed');

  const inv = await pool.query(
    `SELECT * FROM hospital_invoices WHERE id = $1 AND hospital_id = $2 AND pgi_order_id = $3`,
    [invoiceId, hospitalId, razorpayOrderId]
  );
  const invoice = inv.rows[0];
  if (!invoice) throw new Error('Invoice not found for PGI order');

  const due = Number(invoice.amount_due ?? invoice.patient_liability);
  const result = await recordPayment(hospitalId, invoiceId, {
    paymentMethod: 'upi',
    amount: due,
    referenceNumber: razorpayPaymentId,
    stationId: invoice.station_id,
    sessionId: invoice.session_id,
    notes: `Auto PGI capture ${razorpayPaymentId}`
  });

  await pool.query(
    `UPDATE hospital_payments SET gateway = 'razorpay', gateway_order_id = $1, gateway_payment_id = $2 WHERE id = $3`,
    [razorpayOrderId, razorpayPaymentId, result.payment.id]
  );
  await pool.query(
    `UPDATE hospital_invoices SET pgi_status = 'paid', updated_at = NOW() WHERE id = $1`,
    [invoiceId]
  );

  return result;
}

export async function getInvoice(hospitalId, invoiceId) {
  await ensureTables();
  const inv = await pool.query(`SELECT * FROM hospital_invoices WHERE id = $1 AND hospital_id = $2`, [invoiceId, hospitalId]);
  if (!inv.rows[0]) return null;
  const lines = await pool.query(`SELECT * FROM hospital_invoice_lines WHERE invoice_id = $1 ORDER BY id`, [invoiceId]);
  const payments = await pool.query(`SELECT * FROM hospital_payments WHERE invoice_id = $1 ORDER BY created_at`, [invoiceId]);
  return { ...inv.rows[0], lines: lines.rows, payments: payments.rows };
}

export async function listInvoices(hospitalId, { status, patientId, limit = 50, offset = 0 } = {}) {
  await ensureTables();
  const params = [hospitalId];
  let clauses = '';
  if (status) { params.push(status); clauses += ` AND status = $${params.length}`; }
  if (patientId) { params.push(patientId); clauses += ` AND patient_id = $${params.length}`; }
  params.push(Math.min(200, limit), offset);
  const { rows } = await pool.query(
    `SELECT * FROM hospital_invoices WHERE hospital_id = $1 ${clauses}
     ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return rows;
}

export async function generateInvoicePdf(hospitalId, invoiceId, hospitalName) {
  const invoice = await getInvoice(hospitalId, invoiceId);
  if (!invoice) throw new Error('Invoice not found');
  let template = null;
  if (invoice.template_id) {
    const tpl = await pool.query(`SELECT * FROM hospital_bill_templates WHERE id = $1`, [invoice.template_id]);
    template = tpl.rows[0];
  }
  return generateHospitalBillPdf({ invoice, template, hospitalName });
}

export async function listAuditLog(hospitalId, { limit = 100, offset = 0 } = {}) {
  await ensureTables();
  const { rows } = await pool.query(
    `SELECT * FROM billing_audit_log WHERE hospital_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
    [hospitalId, limit, offset]
  );
  return rows;
}

export default {
  listStations, createStation, openCashierSession, closeCashierSession, getActiveSession,
  listTemplates, aggregatePatientAccount, getCentralizedDashboard, createInvoice, recordPayment,
  createPaymentLink, confirmPgiPayment, getInvoice, listInvoices, generateInvoicePdf, listAuditLog,
  logBillingAudit
};
