/**
 * Hospital Billing Suite — centralized billing, multi-station cashiering,
 * cash/credit/insurance collection, PGI, and audit trail.
 */

import pool from '../db/pgPool.js';
import paymentGateway from '../services/payment-gateway.service.js';
import * as glPosting from './finance-gl-posting.service.js';
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
    CREATE TABLE IF NOT EXISTS hospital_patient_statements (
      id BIGSERIAL PRIMARY KEY,
      hospital_id INTEGER NOT NULL,
      patient_id INTEGER NOT NULL,
      statement_number VARCHAR(50) NOT NULL,
      total_due NUMERIC(14,2) DEFAULT 0,
      delivery_method VARCHAR(20) DEFAULT 'print',
      status VARCHAR(20) DEFAULT 'issued',
      metadata JSONB DEFAULT '{}'::jsonb,
      issued_at TIMESTAMPTZ DEFAULT NOW(),
      delivered_at TIMESTAMPTZ,
      UNIQUE (hospital_id, statement_number)
    );
    ALTER TABLE hospital_patient_statements ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;
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

async function buildLinesFromCharges(hospitalId, patientId, admissionId, chargeIds = null) {
  const params = [hospitalId, patientId];
  let admissionClause = '';
  let idClause = '';
  if (admissionId) {
    params.push(admissionId);
    admissionClause = ` AND (admission_id = $${params.length} OR admission_id IS NULL)`;
  }
  if (Array.isArray(chargeIds) && chargeIds.length > 0) {
    params.push(chargeIds);
    idClause = ` AND id = ANY($${params.length}::bigint[])`;
  }
  const { rows } = await pool.query(
    `SELECT id, charge_type, description, amount, source_type, source_id, admission_id
     FROM hospital_billing_charges
     WHERE hospital_id = $1 AND patient_id = $2 AND status IN ('pending','posted')
     ${admissionClause}${idClause}
     ORDER BY created_at ASC`,
    params
  );
  return rows.map((c) => ({
    chargeId: c.id,
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
    discountAmount, taxAmount, insuranceAmount, lines, chargeIds, autoPgi, insuranceClaimId, createdBy
  } = data;

  let invoiceLines = Array.isArray(lines) && lines.length > 0
    ? lines
    : await buildLinesFromCharges(hospitalId, patientId, admissionId, chargeIds);
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
  const chargeIdsToLink = invoiceLines.map((l) => l.chargeId).filter(Boolean);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO hospital_invoices
        (hospital_id, bill_number, patient_id, admission_id, station_id, session_id, template_id,
         bill_type, payment_mode, subtotal, discount_amount, tax_amount, total_amount,
         insurance_amount, patient_liability, amount_paid, amount_due, status, insurance_claim_id, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,0,$15,'issued',$16,$17)
       RETURNING *`,
      [
        hospitalId, number, patientId, admissionId || null, stationId || null, sessionId || null, template,
        billType || 'ipd', paymentMode || 'mixed', subtotal, discount, tax, total, insurance, patientLiability,
        insuranceClaimId || null, createdBy || null
      ]
    );
    const invoice = rows[0];

    for (const line of invoiceLines) {
      const qty = Number(line.quantity) || 1;
      const unit = Number(line.unitPrice) || 0;
      const lineTotal = Number(line.lineTotal) || qty * unit;
      await client.query(
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

    if (chargeIdsToLink.length > 0) {
      await client.query(
        `UPDATE hospital_billing_charges
         SET status = 'invoiced', invoice_id = $1, updated_at = NOW()
         WHERE hospital_id = $2 AND id = ANY($3::bigint[]) AND status IN ('pending','posted')`,
        [invoice.id, hospitalId, chargeIdsToLink]
      );
    } else {
      const chargeParams = [invoice.id, hospitalId, patientId];
      let chargeSql = `UPDATE hospital_billing_charges SET status = 'invoiced', invoice_id = $1, updated_at = NOW()
         WHERE hospital_id = $2 AND patient_id = $3 AND status IN ('pending','posted')`;
      if (admissionId) {
        chargeParams.push(admissionId);
        chargeSql += ` AND (admission_id = $${chargeParams.length} OR admission_id IS NULL)`;
      }
      await client.query(chargeSql, chargeParams);
    }

    await client.query('COMMIT');

    await logBillingAudit({
      hospitalId, stationId, sessionId, actorId: createdBy, action: 'invoice.create',
      resourceType: 'hospital_invoice', resourceId: String(invoice.id), afterState: invoice, req: ctx.req
    });

    // Revenue recognition into the tenant ledger. Best-effort by design: a ledger outage must not
    // roll back an issued invoice, so the outcome is reported rather than thrown.
    const ledger = await glPosting.postInvoice(hospitalId, invoice, createdBy || ctx.actorId);
    if (ledger.posted) {
      await pool.query(
        `UPDATE hospital_invoices SET metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb WHERE id = $1 AND hospital_id = $3`,
        [invoice.id, JSON.stringify({ ledger }), hospitalId]
      );
    }

    let pgi = null;
    if (autoPgi && patientLiability > 0) {
      pgi = await createPaymentLink(hospitalId, invoice.id, ctx);
    }
    return { invoice, pgi };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

const round2 = (n) => Math.round(Number(n) * 100) / 100;

function validPaymentAmount(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) throw new Error('Payment amount must be positive');
  return round2(n);
}

export async function recordPayment(hospitalId, invoiceId, data, ctx = {}) {
  await ensureTables();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await recordPaymentTx(client, hospitalId, invoiceId, data, ctx);
    await client.query('COMMIT');
    await auditPayment(hospitalId, data, ctx, result.payment);

    // A credit payment moves no money, so it must not post a cash entry to the GL.
    if (result.payment.status !== 'credit_pending') {
      result.ledger = await glPosting.postPayment(hospitalId, result.payment, data.receivedBy || ctx.actorId);
    }
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

function auditPayment(hospitalId, data, ctx, payment, action = 'payment.record') {
  return logBillingAudit({
    hospitalId, stationId: data.stationId, sessionId: data.sessionId, actorId: data.receivedBy || ctx.actorId,
    actorName: data.receivedByName || ctx.actorName, action, resourceType: 'hospital_payment',
    resourceId: String(payment.id), afterState: payment, req: ctx.req
  });
}

/**
 * Records one payment inside a caller-owned transaction: locks the invoice, inserts the payment
 * (including any gateway identifiers in the SAME statement) and updates the invoice totals.
 * `data.gateway = { name, orderId, paymentId }` marks a gateway capture.
 */
async function recordPaymentTx(client, hospitalId, invoiceId, data, ctx = {}) {
  const method = String(data.paymentMethod || 'cash').toLowerCase();
  const amount = validPaymentAmount(data.amount);
  const gw = data.gateway || null;

  const inv = await client.query(
    `SELECT * FROM hospital_invoices WHERE id = $1 AND hospital_id = $2 AND voided_at IS NULL FOR UPDATE`,
    [invoiceId, hospitalId]
  );
  const invoice = inv.rows[0];
  if (!invoice) throw new Error('Invoice not found');

  if (method === 'credit') {
    await applyCreditPayment(client, hospitalId, invoice.patient_id, amount, invoiceId, ctx, data.creditApproved);
  }

  const payStatus = method === 'credit' ? 'credit_pending' : 'completed';
  const { rows: payRows } = await client.query(
    `INSERT INTO hospital_payments
      (hospital_id, invoice_id, station_id, session_id, payment_method, amount, reference_number,
       insurance_claim_id, received_by, received_by_name, notes, gateway, gateway_order_id, gateway_payment_id,
       gateway_status, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'captured',$15) RETURNING *`,
    [
      hospitalId, invoiceId, data.stationId || invoice.station_id, data.sessionId || invoice.session_id,
      method, amount, data.referenceNumber || null, data.insuranceClaimId || invoice.insurance_claim_id || null,
      data.receivedBy || ctx.actorId || null, data.receivedByName || ctx.actorName || null, data.notes || null,
      gw?.name || null, gw?.orderId || null, gw?.paymentId || null, payStatus
    ]
  );

  const newPaid = Number(invoice.amount_paid) + (method === 'credit' ? 0 : amount);
  const creditApplied = method === 'credit' ? amount : 0;
  const effectivePaid = newPaid + creditApplied;
  const newDue = Math.max(0, Number(invoice.patient_liability) - effectivePaid);
  const status = newDue <= 0 ? 'paid' : 'partial';
  const payMode = invoice.payment_mode === 'mixed' || invoice.amount_paid > 0 ? 'mixed' : method;

  await client.query(
    `UPDATE hospital_invoices
     SET amount_paid = $1::numeric, amount_due = $2::numeric, status = $3,
         payment_mode = CASE WHEN payment_mode = 'mixed' OR $4 = 'mixed' THEN 'mixed' ELSE $4 END,
         pgi_status = CASE WHEN $6::boolean THEN 'paid' ELSE pgi_status END,
         updated_at = NOW(),
         finalized_at = CASE WHEN $2::numeric <= 0 THEN COALESCE(finalized_at, NOW()) ELSE finalized_at END
     WHERE id = $5`,
    [effectivePaid, newDue, status, payMode, invoiceId, Boolean(gw)]
  );

  if (data.sessionId && method !== 'credit') {
    const col = {
      cash: 'cash_collected', card: 'card_collected', upi: 'upi_collected',
      insurance: 'insurance_collected'
    }[method] || 'cash_collected';
    await client.query(
      `UPDATE billing_cashier_sessions SET ${col} = ${col} + $1, total_collected = total_collected + $1 WHERE id = $2`,
      [amount, data.sessionId]
    );
  }

  return { payment: payRows[0], invoiceStatus: status, amountDue: newDue };
}

async function applyCreditPayment(client, hospitalId, patientId, amount, invoiceId, ctx, creditApproved = false) {
  let account = await client.query(
    `SELECT * FROM hospital_credit_accounts WHERE hospital_id = $1 AND patient_id = $2 FOR UPDATE`,
    [hospitalId, patientId]
  );
  if (!account.rows[0]) {
    if (!creditApproved) throw new Error('Credit account required — supervisor approval needed');
    const created = await client.query(
      `INSERT INTO hospital_credit_accounts (hospital_id, patient_id, credit_limit, balance, approved_by, status)
       VALUES ($1,$2,0,0,$3,'active') RETURNING *`,
      [hospitalId, patientId, ctx.actorName || 'supervisor']
    );
    account = created;
  }
  const acct = account.rows[0];
  if (acct.status !== 'active') throw new Error('Credit account is not active');
  const newBalance = Number(acct.balance) + amount;
  if (acct.credit_limit > 0 && newBalance > Number(acct.credit_limit)) {
    throw new Error('Credit limit exceeded');
  }
  await client.query(`UPDATE hospital_credit_accounts SET balance = $1, updated_at = NOW() WHERE id = $2`, [newBalance, acct.id]);
  await client.query(
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

/**
 * One core for every gateway capture (checkout callback and webhook). In a single transaction it locks
 * the invoice, returns `duplicate: true` if this gateway payment id was already recorded, otherwise
 * inserts the payment with its gateway identifiers and updates the invoice. The captured amount is
 * applied capped at what is still due; any excess is reported as `overpaid` for refund, never lost.
 * A racing webhook and checkout callback serialise on the invoice lock and the unique index on
 * (gateway, gateway_payment_id), so the payment posts exactly once.
 */
async function captureGatewayPayment(hospitalId, { invoiceId, orderId, paymentId, amount, source }, ctx = {}) {
  await ensureTables();
  if (!paymentId || !orderId) throw new Error('Gateway order and payment ids are required');
  const client = await pool.connect();
  let out; let unapplied = null;
  try {
    await client.query('BEGIN');
    const { rows: inv } = await client.query(
      `SELECT * FROM hospital_invoices WHERE id = $1 AND hospital_id = $2 AND pgi_order_id = $3 AND voided_at IS NULL FOR UPDATE`,
      [invoiceId, hospitalId, orderId]
    );
    const invoice = inv[0];
    if (!invoice) throw new Error('Invoice not found for PGI order');

    const { rows: existing } = await client.query(
      `SELECT * FROM hospital_payments WHERE gateway = 'razorpay' AND gateway_payment_id = $1`, [paymentId]
    );
    if (existing[0]) {
      if (Number(existing[0].hospital_id) !== Number(hospitalId) || String(existing[0].invoice_id) !== String(invoiceId)) {
        throw new Error('Gateway payment id is already recorded against a different invoice');
      }
      await client.query('COMMIT');
      return { duplicate: true, payment: existing[0], invoiceStatus: invoice.status, amountDue: Number(invoice.amount_due) };
    }

    // Checkout confirmations carry no amount: the order was created for metadata.pgiAmount.
    const captured = round2(amount == null ? Number(invoice.metadata?.pgiAmount) : amount);
    if (!Number.isFinite(captured) || captured <= 0) throw new Error('Captured amount is not valid');
    const due = round2(Number(invoice.amount_due ?? invoice.patient_liability));
    if (due <= 0) {
      await client.query('COMMIT');
      unapplied = { invoiceId, paymentId, captured };
      out = { duplicate: false, unapplied: true, overpaid: captured, invoiceStatus: invoice.status, amountDue: 0 };
    } else {
      const applied = Math.min(captured, due);
      const result = await recordPaymentTx(client, hospitalId, invoiceId, {
        paymentMethod: 'upi', amount: applied, referenceNumber: paymentId,
        stationId: invoice.station_id, sessionId: invoice.session_id,
        notes: `Auto PGI capture ${paymentId} (${source})`,
        gateway: { name: 'razorpay', orderId, paymentId },
      }, ctx);
      await client.query('COMMIT');
      out = { ...result, duplicate: false, overpaid: round2(captured - applied) };
    }
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    if (e.code === '23505') { // lost a race for this gateway payment id: the other writer posted it
      const { rows } = await pool.query(`SELECT * FROM hospital_payments WHERE gateway = 'razorpay' AND gateway_payment_id = $1 AND hospital_id = $2`, [paymentId, hospitalId]);
      if (rows[0]) return { duplicate: true, payment: rows[0] };
    }
    throw e;
  } finally {
    client.release();
  }

  if (unapplied) {
    await logBillingAudit({ hospitalId, action: 'pgi.capture_unapplied', resourceType: 'hospital_invoice', resourceId: String(invoiceId), afterState: unapplied, reason: 'Payment captured for an invoice with nothing due; needs refund review' });
  } else {
    await auditPayment(hospitalId, {}, ctx, out.payment, 'pgi.capture');
    if (out.overpaid > 0) await logBillingAudit({ hospitalId, action: 'pgi.overpaid', resourceType: 'hospital_payment', resourceId: String(out.payment.id), afterState: { overpaid: out.overpaid }, reason: 'Captured more than was due; excess needs refund' });
  }
  return out;
}

/** Checkout callback (browser): verified with the checkout signature over `orderId|paymentId`. */
export async function confirmPgiPayment(hospitalId, { invoiceId, razorpayOrderId, razorpayPaymentId, signature }) {
  const verified = paymentGateway.verifyRazorpaySignature(razorpayOrderId, razorpayPaymentId, signature);
  if (!verified) throw new Error('PGI signature verification failed');
  return captureGatewayPayment(hospitalId, { invoiceId, orderId: razorpayOrderId, paymentId: razorpayPaymentId, amount: null, source: 'checkout' });
}

/**
 * Webhook capture. ONLY call after paymentGateway.verifyRazorpayWebhook() passed on the raw body:
 * the webhook signature is a different secret and payload from the checkout signature.
 */
export async function applyVerifiedPgiCapture(hospitalId, { invoiceId, orderId, paymentId, amountPaise }) {
  const paise = Number(amountPaise);
  if (!Number.isFinite(paise) || paise <= 0) throw new Error('Captured amount is not valid');
  return captureGatewayPayment(hospitalId, { invoiceId, orderId, paymentId, amount: paise / 100, source: 'webhook' });
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

export async function listPayments(hospitalId, { limit = 50, offset = 0, patientId } = {}) {
  await ensureTables();
  const params = [hospitalId];
  let clauses = '';
  if (patientId) {
    params.push(patientId);
    clauses += ` AND p.invoice_id IN (SELECT id FROM hospital_invoices WHERE patient_id = $${params.length})`;
  }
  params.push(Math.min(200, limit), offset);
  const { rows } = await pool.query(
    `SELECT p.*, i.bill_number, i.patient_id
     FROM hospital_payments p
     JOIN hospital_invoices i ON i.id = p.invoice_id
     WHERE p.hospital_id = $1 ${clauses}
     ORDER BY p.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
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

// ─── Phase 1: Adjustments, void, refund ─────────────────────────────────────

export async function createAdjustment(hospitalId, data, ctx = {}) {
  await ensureTables();
  const { invoiceId, adjustmentType, reason, approvedByName } = data;
  const amount = Number(data.amount);
  if (!invoiceId || !adjustmentType || data.amount == null || !Number.isFinite(amount) || amount === 0) {
    throw new Error('invoiceId, adjustmentType and a non-zero numeric amount are required');
  }

  const client = await pool.connect();
  let adj; let before; let after;
  try {
    await client.query('BEGIN');
    const inv = await client.query(
      `SELECT * FROM hospital_invoices WHERE id = $1 AND hospital_id = $2 AND voided_at IS NULL FOR UPDATE`,
      [invoiceId, hospitalId]
    );
    const invoice = inv.rows[0];
    if (!invoice) throw new Error('Invoice not found');

    const total = Number(invoice.total_amount);
    if (Math.abs(amount) > total + 0.005) throw new Error('Adjustment cannot exceed the invoice total');
    const paid = Number(invoice.amount_paid);
    const insurance = Number(invoice.insurance_amount || 0);

    // The patient's share is recomputed from the insurance split, never overwritten with the total.
    const newTotal = round2(Math.max(0, total - amount));
    const newLiability = round2(Math.max(0, newTotal - insurance));
    const newDue = round2(Math.max(0, newLiability - paid));
    const status = newDue <= 0 ? 'paid' : paid > 0 ? 'partial' : 'issued';
    before = { total_amount: total, patient_liability: Number(invoice.patient_liability), amount_due: Number(invoice.amount_due), status: invoice.status };
    after = { total_amount: newTotal, patient_liability: newLiability, amount_due: newDue, status };

    const r = await client.query(
      `INSERT INTO hospital_bill_adjustments
         (hospital_id, invoice_id, adjustment_type, amount, reason, approved_by_name, approved_by, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb) RETURNING *`,
      [hospitalId, invoiceId, adjustmentType, amount, reason || null, approvedByName || null, ctx.actorId || null, JSON.stringify({ before, after })]
    );
    adj = r.rows[0];
    await client.query(
      `UPDATE hospital_invoices SET total_amount = $2, patient_liability = $3, amount_due = $4, status = $5, updated_at = NOW() WHERE id = $1`,
      [invoiceId, newTotal, newLiability, newDue, status]
    );
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }

  await logBillingAudit({
    hospitalId, actorId: ctx.actorId, actorName: ctx.actorName,
    action: 'adjustment.create', resourceType: 'adjustment', resourceId: String(adj.id),
    beforeState: before, afterState: after, req: ctx.req
  });
  adj.ledger = await glPosting.postAdjustment(hospitalId, { ...adj, invoiceId, adjustmentType, amount }, ctx.actorId);
  return adj;
}

export async function voidInvoice(hospitalId, invoiceId, ctx = {}, reason) {
  await ensureTables();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const inv = await client.query(
      `SELECT * FROM hospital_invoices WHERE id = $1 AND hospital_id = $2 AND voided_at IS NULL FOR UPDATE`,
      [invoiceId, hospitalId]
    );
    if (!inv.rows[0]) throw new Error('Invoice not found or already voided');

    await client.query(
      `UPDATE hospital_invoices SET status = 'voided', voided_at = NOW(), voided_by = $2, void_reason = $3, updated_at = NOW() WHERE id = $1`,
      [invoiceId, ctx.actorId || null, reason || null]
    );
    await client.query(
      `UPDATE hospital_billing_charges SET status = 'pending', invoice_id = NULL, updated_at = NOW()
       WHERE invoice_id = $1 AND hospital_id = $2`,
      [invoiceId, hospitalId]
    );
    await client.query('COMMIT');

    await logBillingAudit({
      hospitalId, actorId: ctx.actorId, actorName: ctx.actorName,
      action: 'invoice.void', resourceType: 'hospital_invoice', resourceId: String(invoiceId),
      beforeState: inv.rows[0], reason, req: ctx.req
    });
    return { success: true, invoiceId };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export async function voidPayment(hospitalId, paymentId, ctx = {}, reason) {
  await ensureTables();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const pay = await client.query(
      `SELECT * FROM hospital_payments WHERE id = $1 AND hospital_id = $2 AND voided_at IS NULL FOR UPDATE`,
      [paymentId, hospitalId]
    );
    if (!pay.rows[0]) throw new Error('Payment not found or already voided');

    const amount = Number(pay.rows[0].amount);
    const invoiceId = pay.rows[0].invoice_id;

    await client.query(
      `UPDATE hospital_payments SET status = 'voided', voided_at = NOW(), voided_by = $2, void_reason = $3 WHERE id = $1`,
      [paymentId, ctx.actorId || null, reason || null]
    );

    if (invoiceId) {
      const inv = await client.query(`SELECT amount_paid, patient_liability FROM hospital_invoices WHERE id = $1 FOR UPDATE`, [invoiceId]);
      if (inv.rows[0]) {
        const newPaid = Math.max(0, Number(inv.rows[0].amount_paid) - amount);
        const liability = Number(inv.rows[0].patient_liability);
        const newDue = Math.max(0, liability - newPaid);
        const status = newDue <= 0 ? 'paid' : newPaid > 0 ? 'partial' : 'issued';
        await client.query(
          `UPDATE hospital_invoices SET amount_paid = $2, amount_due = $3, status = $4, updated_at = NOW() WHERE id = $1`,
          [invoiceId, newPaid, newDue, status]
        );
      }
    }

    await client.query('COMMIT');
    await logBillingAudit({
      hospitalId, actorId: ctx.actorId, action: 'payment.void',
      resourceType: 'hospital_payment', resourceId: String(paymentId),
      beforeState: pay.rows[0], reason, req: ctx.req
    });
    return { success: true, paymentId };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// ─── Gateway refund lifecycle ─────────────────────────────────────────────────
// A gateway refund is a two-step fact: we ASK the gateway to refund, then the gateway
// CONFIRMS it. Cash left the hospital the moment the gateway moved it, so the GL must be
// posted on confirmation — posting at request time would permanently overstate cash if the
// gateway later rejects the refund, and understate it if the request is replayed.

/** Ask the gateway to refund a pending refund row. Idempotent: an already-issued row is returned as-is. */
export async function requestGatewayRefund(hospitalId, refundRowId, ctx = {}) {
  await ensureTables();
  const refund = (await pool.query(
    `SELECT r.*, p.gateway_payment_id, p.gateway
     FROM hospital_payment_refunds r JOIN hospital_payments p ON p.id = r.payment_id
     WHERE r.id = $1 AND r.hospital_id = $2`, [refundRowId, hospitalId]
  )).rows[0];
  if (!refund) throw new Error('Refund not found');
  if (refund.status !== 'pending_gateway') return { ...refund, alreadySettled: true };
  if (!refund.gateway_payment_id) throw new Error('This payment was not taken through a gateway, so it needs no gateway refund');

  const result = await paymentGateway.createRazorpayRefund(
    refund.gateway_payment_id, Number(refund.amount),
    { hospitalId: String(hospitalId), refundId: String(refund.id) }
  );
  const { rows } = await pool.query(
    `UPDATE hospital_payment_refunds SET status = 'requested', gateway_refund_id = $3
     WHERE id = $1 AND hospital_id = $2 RETURNING *`, [refundRowId, hospitalId, result.refundId]
  );
  await logBillingAudit({
    hospitalId, actorId: ctx.actorId, action: 'refund.gateway.requested',
    resourceType: 'hospital_payment_refund', resourceId: String(refundRowId),
    metadata: { gatewayRefundId: result.refundId, amount: Number(refund.amount) }, req: ctx.req,
  });
  return rows[0];
}

/**
 * Apply a confirmed gateway refund. Safe to call repeatedly: the row only transitions out of a
 * pending state once, and the GL posting is keyed on the refund row id.
 */
export async function confirmGatewayRefund(hospitalId, { gatewayRefundId, refundId, status }, ctx = {}) {
  await ensureTables();
  const found = (await pool.query(
    `SELECT * FROM hospital_payment_refunds
     WHERE hospital_id = $1 AND (($2::bigint IS NOT NULL AND id = $2) OR ($3::text IS NOT NULL AND gateway_refund_id = $3))`,
    [hospitalId, refundId || null, gatewayRefundId || null]
  )).rows[0];
  if (!found) return { applied: false, reason: 'no_matching_refund' };
  // A webhook for an already-final refund is a redelivery, not a failure.
  if (found.status === 'completed') return { applied: false, reason: 'already_completed', refundId: found.id };
  if (found.status === 'failed') return { applied: false, reason: 'already_failed', refundId: found.id };

  const rejected = String(status || '').toLowerCase() === 'failed';
  const { rows } = await pool.query(
    `UPDATE hospital_payment_refunds SET status = $3
     WHERE id = $1 AND hospital_id = $2 AND status NOT IN ('completed','failed') RETURNING *`,
    [found.id, hospitalId, rejected ? 'failed' : 'completed']
  );
  if (!rows[0]) return { applied: false, reason: 'raced', refundId: found.id };
  const refund = rows[0];

  // A failed refund never moved money, so the invoice and payment must go back to what they were.
  if (rejected) {
    if (refund.invoice_id) {
      await pool.query(
        `UPDATE hospital_invoices i SET amount_paid = i.amount_paid + $2,
           amount_due = GREATEST(0, i.patient_liability - (i.amount_paid + $2)),
           status = CASE WHEN i.patient_liability - (i.amount_paid + $2) <= 0 THEN 'paid'
                         WHEN i.patient_liability - (i.amount_paid + $2) < i.patient_liability THEN 'partial'
                         ELSE i.status END,
           updated_at = NOW()
         WHERE i.id = $1 AND i.hospital_id = $3`,
        [refund.invoice_id, Number(refund.amount), hospitalId]
      );
    }
    await pool.query(
      `UPDATE hospital_payments SET refund_amount = GREATEST(0, refund_amount - $2), status = 'completed', refunded_at = NULL
       WHERE id = $1 AND hospital_id = $2`, [refund.payment_id, hospitalId, Number(refund.amount)]
    );
    await logBillingAudit({
      hospitalId, actorId: ctx.actorId, action: 'refund.gateway.failed',
      resourceType: 'hospital_payment_refund', resourceId: String(refund.id),
      metadata: { gatewayRefundId: refund.gateway_refund_id, amount: Number(refund.amount) }, req: ctx.req,
    });
    return { applied: true, posted: false, refundId: refund.id, status: 'failed' };
  }

  await pool.query(
    `UPDATE hospital_payments SET status = CASE WHEN refund_amount >= amount - 0.005 THEN 'refunded' ELSE status END
     WHERE id = $1 AND hospital_id = $2`, [refund.payment_id, hospitalId]
  );
  await logBillingAudit({
    hospitalId, actorId: ctx.actorId, action: 'refund.gateway.confirmed',
    resourceType: 'hospital_payment_refund', resourceId: String(refund.id),
    metadata: { gatewayRefundId: refund.gateway_refund_id, amount: Number(refund.amount) }, req: ctx.req,
  });

  // Only now does cash actually leave — this is the single point where the GL is touched.
  const method = (await pool.query('SELECT payment_method FROM hospital_payments WHERE id = $1', [refund.payment_id])).rows[0]?.payment_method;
  const ledger = await glPosting.postRefund(hospitalId, {
    refundId: refund.id, paymentId: refund.payment_id, amount: Number(refund.amount), paymentMethod: method,
  }, ctx.actorId);
  return { applied: true, posted: ledger.posted, ledger, refundId: refund.id, status: 'completed' };
}

/** Sweep refunds still awaiting a gateway answer. Returns the rows an operator should chase. */
export async function listStaleGatewayRefunds(hospitalId, { olderThanHours = 24 } = {}) {
  await ensureTables();
  const { rows } = await pool.query(
    `SELECT id, payment_id, amount, gateway_refund_id, created_at, status
     FROM hospital_payment_refunds
     WHERE hospital_id = $1 AND status IN ('pending_gateway','requested')
       AND created_at < NOW() - ($2 || ' hours')::interval
     ORDER BY created_at ASC`,
    [hospitalId, String(olderThanHours)]
  );
  return rows;
}
export async function refundPayment(hospitalId, paymentId, refundAmount, ctx = {}, reason) {
  await ensureTables();
  const client = await pool.connect();
  let result;
  try {
    await client.query('BEGIN');
    // Row lock: two concurrent refunds on one payment serialise here, so their sum cannot exceed the payment.
    const pay = await client.query(
      `SELECT * FROM hospital_payments WHERE id = $1 AND hospital_id = $2 FOR UPDATE`, [paymentId, hospitalId]
    );
    const payment = pay.rows[0];
    if (!payment) throw new Error('Payment not found');
    if (payment.voided_at || payment.status === 'voided') throw new Error('A voided payment cannot be refunded');
    if (payment.status === 'credit_pending') throw new Error('A credit payment has no money to refund');

    const prior = Number((await client.query(
      `SELECT COALESCE(SUM(amount), 0) AS s FROM hospital_payment_refunds WHERE payment_id = $1 AND hospital_id = $2 AND status <> 'failed'`,
      [paymentId, hospitalId]
    )).rows[0].s);
    const refundable = round2(Number(payment.amount) - prior);
    if (refundable <= 0) throw new Error('This payment has already been fully refunded');
    const amt = refundAmount == null || refundAmount === '' ? refundable : round2(Number(refundAmount));
    if (!Number.isFinite(amt) || amt <= 0) throw new Error('Refund amount must be positive');
    if (amt > refundable + 0.005) throw new Error(`Refund exceeds the refundable balance (${refundable.toFixed(2)})`);

    const viaGateway = Boolean(payment.gateway_payment_id);
    const refundRow = await client.query(
      `INSERT INTO hospital_payment_refunds (hospital_id, payment_id, invoice_id, amount, reason, approved_by, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [hospitalId, paymentId, payment.invoice_id, amt, reason || null, ctx.actorId || null, viaGateway ? 'pending_gateway' : 'completed']
    );
    const totalRefunded = round2(prior + amt);
    await client.query(
      `UPDATE hospital_payments SET status = CASE WHEN $2 >= amount - 0.005 THEN 'refunded' ELSE status END,
              refund_amount = $2, refund_reason = $3, refunded_at = NOW(), refunded_by = $4 WHERE id = $1`,
      [paymentId, totalRefunded, reason || null, ctx.actorId || null]
    );

    if (payment.invoice_id) {
      const inv = await client.query(`SELECT amount_paid, patient_liability FROM hospital_invoices WHERE id = $1 AND hospital_id = $2 FOR UPDATE`, [payment.invoice_id, hospitalId]);
      if (inv.rows[0]) {
        const newPaid = Math.max(0, Number(inv.rows[0].amount_paid) - amt);
        const newDue = Math.max(0, Number(inv.rows[0].patient_liability) - newPaid);
        const status = newDue <= 0 ? 'paid' : newPaid > 0 ? 'partial' : 'issued';
        await client.query(`UPDATE hospital_invoices SET amount_paid = $2, amount_due = $3, status = $4, updated_at = NOW() WHERE id = $1`, [payment.invoice_id, newPaid, newDue, status]);
      }
    }
    await client.query('COMMIT');
    result = { success: true, paymentId, refundId: refundRow.rows[0].id, paymentMethod: payment.payment_method, refundAmount: amt, remainingRefundable: round2(refundable - amt), gatewayRefundRequired: viaGateway };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }

  await logBillingAudit({
    hospitalId, actorId: ctx.actorId, action: 'payment.refund',
    resourceType: 'hospital_payment', resourceId: String(paymentId),
    metadata: { refundAmount: result.refundAmount, gatewayRefundRequired: result.gatewayRefundRequired }, reason, req: ctx.req
  });
  // A gateway refund is only a request until the gateway confirms it; posting cash out before then
  // would leave the ledger permanently wrong if the gateway rejects the refund. Ask the gateway now,
  // and let confirmGatewayRefund() do the GL posting when the confirmation lands.
  if (result.gatewayRefundRequired) {
    try {
      const requested = await requestGatewayRefund(hospitalId, result.refundId, ctx);
      result.gatewayRefundId = requested.gateway_refund_id || null;
      result.gatewayRefundStatus = requested.status;
    } catch (e) {
      // The refund row stays pending_gateway; an operator can retry or the stale-refund sweep will
      // surface it. Losing the gateway call must not lose the refund record.
      result.gatewayRequestError = e.message;
      console.error('[billing] gateway refund request failed:', e.message);
    }
    result.ledger = { posted: false, code: 'GATEWAY_REFUND_PENDING', error: 'Awaiting gateway refund confirmation before GL posting' };
  } else {
    result.ledger = await glPosting.postRefund(hospitalId, { ...result, paymentId }, ctx.actorId);
  }
  return result;
}

// ─── Phase 2: Session reconciliation, credit approval, allocations, statements

export async function reconcileSession(hospitalId, sessionId, ctx = {}, { countedCash, notes } = {}) {
  await ensureTables();
  const session = await pool.query(
    `SELECT * FROM billing_cashier_sessions WHERE id = $1 AND hospital_id = $2`,
    [sessionId, hospitalId]
  );
  if (!session.rows[0]) throw new Error('Session not found');
  if (session.rows[0].status !== 'open') throw new Error('Session not open');

  const expectedCash = Number(session.rows[0].cash_collected || 0);
  const counted = countedCash != null ? Number(countedCash) : expectedCash;
  const variance = counted - expectedCash;

  await pool.query(
    `UPDATE billing_cashier_sessions
     SET status = 'reconciled', closed_at = NOW(), closing_total = total_collected,
         closing_cash_counted = $2, closing_cash_expected = $3, cash_variance = $4,
         reconciliation_notes = $5, notes = COALESCE($5, notes)
     WHERE id = $1`,
    [sessionId, counted, expectedCash, variance, notes || null]
  );

  await logBillingAudit({
    hospitalId, sessionId, actorId: ctx.actorId,
    action: 'session.reconcile', resourceType: 'cashier_session', resourceId: String(sessionId),
    metadata: { expectedCash, countedCash: counted, variance }, req: ctx.req
  });

  return { sessionId, expectedCash, countedCash: counted, variance };
}

export async function approveCreditAccount(hospitalId, creditAccountId, ctx = {}, { approvedLimit, notes } = {}) {
  await ensureTables();
  const r = await pool.query(
    `UPDATE hospital_credit_accounts
     SET status = 'active', credit_limit = COALESCE($3, credit_limit),
         approved_by = $4, approved_by_id = $5, approved_at = NOW(), notes = COALESCE($6, notes), updated_at = NOW()
     WHERE id = $1 AND hospital_id = $2 RETURNING *`,
    [creditAccountId, hospitalId, approvedLimit || null, ctx.actorName || null, ctx.actorId || null, notes || null]
  );
  if (!r.rows[0]) throw new Error('Credit account not found');

  await logBillingAudit({
    hospitalId, actorId: ctx.actorId, action: 'credit.approve',
    resourceType: 'credit_account', resourceId: String(creditAccountId), afterState: r.rows[0], req: ctx.req
  });
  return r.rows[0];
}

/**
 * Re-applies part of a completed payment to OTHER invoices of the same patient in the same hospital.
 * The money moves: the payment's own invoice is reduced by what is allocated away, so the total credited
 * across invoices never exceeds what was actually received. Everything runs in one transaction with the
 * payment and every invoice locked (invoices in id order, so concurrent allocations cannot deadlock).
 * PRODUCT DECISION for the finance lead: whether allocation should be limited to advance/deposit payments.
 */
export async function allocatePayment(hospitalId, paymentId, allocations, ctx = {}) {
  await ensureTables();
  if (!Array.isArray(allocations) || allocations.length === 0) throw new Error('At least one allocation is required');
  const wanted = new Map();
  for (const a of allocations) {
    const id = Number(a.invoiceId); const amt = round2(Number(a.amount));
    if (!Number.isInteger(id) || id <= 0) throw new Error('Each allocation needs a valid invoiceId');
    if (!Number.isFinite(amt) || amt <= 0) throw new Error('Each allocation amount must be positive');
    wanted.set(id, round2((wanted.get(id) || 0) + amt));
  }
  const total = round2([...wanted.values()].reduce((s, v) => s + v, 0));

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const pay = await client.query(`SELECT * FROM hospital_payments WHERE id = $1 AND hospital_id = $2 FOR UPDATE`, [paymentId, hospitalId]);
    const payment = pay.rows[0];
    if (!payment) throw new Error('Payment not found');
    if (payment.status !== 'completed' || payment.voided_at) throw new Error('Only a completed, unvoided payment can be allocated');
    if (wanted.has(Number(payment.invoice_id))) throw new Error("A payment cannot be allocated to the invoice it was received for");

    const already = Number((await client.query(`SELECT COALESCE(SUM(amount),0) AS s FROM hospital_payment_allocations WHERE payment_id = $1`, [paymentId])).rows[0].s);
    const refunded = Number(payment.refund_amount || 0);
    if (round2(already + total) > round2(Number(payment.amount) - refunded) + 0.005) throw new Error('Allocations exceed the amount available on this payment');

    const ids = [...new Set([Number(payment.invoice_id), ...wanted.keys()])].sort((a, b) => a - b);
    const locked = await client.query(`SELECT * FROM hospital_invoices WHERE id = ANY($1::bigint[]) AND hospital_id = $2 AND voided_at IS NULL ORDER BY id FOR UPDATE`, [ids, hospitalId]);
    const byId = new Map(locked.rows.map((r) => [Number(r.id), r]));
    const source = byId.get(Number(payment.invoice_id));
    if (!source) throw new Error('The payment\'s own invoice was not found');
    for (const [invId, amt] of wanted) {
      const target = byId.get(invId);
      if (!target) throw new Error(`Invoice ${invId} not found in this hospital`);
      if (String(target.patient_id) !== String(source.patient_id)) throw new Error(`Invoice ${invId} belongs to a different patient`);
      if (amt > round2(Number(target.amount_due)) + 0.005) throw new Error(`Allocation to invoice ${invId} exceeds its amount due`);
    }

    const settle = async (inv, newPaid) => {
      const due = Math.max(0, Number(inv.patient_liability) - newPaid);
      const status = due <= 0 ? 'paid' : newPaid > 0 ? 'partial' : 'issued';
      await client.query(`UPDATE hospital_invoices SET amount_paid = $2, amount_due = $3, status = $4, updated_at = NOW() WHERE id = $1`, [inv.id, newPaid, due, status]);
    };
    for (const [invId, amt] of wanted) {
      await client.query(`INSERT INTO hospital_payment_allocations (payment_id, invoice_id, amount) VALUES ($1,$2,$3)`, [paymentId, invId, amt]);
      await settle(byId.get(invId), round2(Number(byId.get(invId).amount_paid) + amt));
    }
    await settle(source, Math.max(0, round2(Number(source.amount_paid) - total)));
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }

  await logBillingAudit({
    hospitalId, actorId: ctx.actorId, action: 'payment.allocate',
    resourceType: 'hospital_payment', resourceId: String(paymentId),
    metadata: { allocations: [...wanted].map(([invoiceId, amount]) => ({ invoiceId, amount })) }, req: ctx.req
  });
  return { paymentId, allocations: [...wanted].map(([invoiceId, amount]) => ({ invoiceId, amount })) };
}

export async function generatePatientStatement(hospitalId, patientId, admissionId = null, options = {}) {
  await ensureTables();
  const account = await aggregatePatientAccount(hospitalId, { patientId, admissionId });
  const closingBalance = account.summary.totalDue;
  const deliveryMethod = options.deliveryMethod || 'print';

  const stmt = await pool.query(
    `INSERT INTO hospital_patient_statements
       (hospital_id, patient_id, statement_number, total_due, delivery_method, metadata, status)
     VALUES ($1,$2,$3,$4,$5,$6,'issued') RETURNING *`,
    [
      hospitalId, patientId,
      `STMT-${Date.now().toString(36).toUpperCase()}`,
      closingBalance,
      deliveryMethod,
      JSON.stringify({ charges: account.charges.slice(0, 50), invoices: account.invoices, admissionId }),
    ]
  );

  const result = { statement: stmt.rows[0], account };

  if (['sms', 'whatsapp', 'both'].includes(deliveryMethod)) {
    result.delivery = await deliverPatientStatement(hospitalId, stmt.rows[0].id, {
      channels: deliveryMethod === 'both' ? ['sms', 'whatsapp'] : [deliveryMethod],
      actorId: options.actorId,
    });
  }

  return result;
}

export async function listPatientStatements(hospitalId, patientId, { limit = 20 } = {}) {
  await ensureTables();
  const { rows } = await pool.query(
    `SELECT * FROM hospital_patient_statements
     WHERE hospital_id = $1 AND patient_id = $2
     ORDER BY issued_at DESC LIMIT $3`,
    [hospitalId, patientId, Math.min(100, limit)]
  );
  return rows;
}

export async function deliverPatientStatement(hospitalId, statementId, { channels = ['sms'], actorId } = {}) {
  await ensureTables();
  const stmt = await pool.query(
    `SELECT * FROM hospital_patient_statements WHERE id = $1 AND hospital_id = $2`,
    [statementId, hospitalId]
  );
  if (!stmt.rows[0]) throw new Error('Statement not found');

  const row = stmt.rows[0];
  const patient = await pool.query(
    `SELECT id, email, phone_number, phone, name FROM users WHERE id = $1 LIMIT 1`,
    [row.patient_id]
  ).catch(() => ({ rows: [] }));

  const user = patient.rows[0];
  if (!user?.id) throw new Error('Patient contact not found');

  let paymentLink = null;
  const openInv = await pool.query(
    `SELECT id FROM hospital_invoices
     WHERE hospital_id = $1 AND patient_id = $2 AND amount_due > 0 AND status NOT IN ('voided','paid')
     ORDER BY created_at DESC LIMIT 1`,
    [hospitalId, row.patient_id]
  );
  if (openInv.rows[0]) {
    try {
      const pgi = await createPaymentLink(hospitalId, openInv.rows[0].id, { actorId });
      paymentLink = pgi?.paymentLink || pgi?.shortUrl || null;
    } catch {
      // optional payment link
    }
  }

  const notificationService = (await import('./notification.service.js')).default;
  const deliveryChannels = channels.filter((c) => ['sms', 'whatsapp', 'email'].includes(c));

  const sendResult = await notificationService.send({
    userId: user.id,
    userType: 'patient',
    type: 'hospital_patient_statement',
    channels: deliveryChannels.length ? deliveryChannels : ['sms', 'whatsapp'],
    variables: {
      patientName: user.name || 'Patient',
      statementNumber: row.statement_number,
      totalDue: Number(row.total_due).toLocaleString('en-IN'),
      paymentLink: paymentLink || 'Contact billing desk',
      hospitalName: process.env.HOSPITAL_NAME || 'Hospital',
    },
    data: { statementId: row.id, hospitalId },
  });

  await pool.query(
    `UPDATE hospital_patient_statements
     SET delivery_method = $2, status = 'delivered', delivered_at = NOW(),
         metadata = metadata || $3::jsonb
     WHERE id = $1`,
    [row.id, deliveryChannels.join('+') || 'sms', JSON.stringify({ delivery: sendResult })]
  );

  await logBillingAudit({
    hospitalId, actorId, action: 'statement.deliver',
    resourceType: 'patient_statement', resourceId: String(row.id),
    afterState: { channels: deliveryChannels, statementNumber: row.statement_number },
  });

  return { success: true, statementId: row.id, delivery: sendResult };
}

// ─── Phase 3: Billing period close + CFO dashboard ────────────────────────────

export async function closeBillingPeriod(hospitalId, periodStart, periodEnd, ctx = {}) {
  await ensureTables();
  const periodCode = `${periodStart}_${periodEnd}`;
  const summary = await pool.query(
    `SELECT
       COALESCE(SUM(CASE WHEN status NOT IN ('voided','cancelled') THEN total_amount ELSE 0 END), 0) AS invoiced,
       COALESCE(SUM(CASE WHEN status NOT IN ('voided','cancelled') THEN amount_paid ELSE 0 END), 0) AS collected
     FROM hospital_invoices
     WHERE hospital_id = $1 AND created_at >= $2::date AND created_at < ($3::date + INTERVAL '1 day')`,
    [hospitalId, periodStart, periodEnd]
  );

  const r = await pool.query(
    `INSERT INTO billing_periods (hospital_id, period_code, start_date, end_date, status, closed_by, closed_at)
     VALUES ($1,$2,$3,$4,'closed',$5,NOW())
     ON CONFLICT (hospital_id, period_code) DO UPDATE SET status = 'closed', closed_by = $5, closed_at = NOW()
     RETURNING *`,
    [hospitalId, periodCode, periodStart, periodEnd, ctx.actorId || null]
  );

  await logBillingAudit({
    hospitalId, actorId: ctx.actorId, action: 'period.close',
    resourceType: 'billing_period', resourceId: String(r.rows[0].id),
    metadata: summary.rows[0], req: ctx.req
  });
  return { period: r.rows[0], summary: summary.rows[0] };
}

export async function getCfoDashboard(hospitalId, { from, to } = {}) {
  await ensureTables();
  const fromDate = from || new Date(Date.now() - 30 * 86400000).toISOString();
  const toDate = to || new Date().toISOString();

  const [revenue, ar, sessions, claims] = await Promise.all([
    pool.query(
      `SELECT payment_method, SUM(amount) AS total, COUNT(*)::int AS cnt
       FROM hospital_payments
       WHERE hospital_id = $1 AND status = 'completed' AND created_at >= $2 AND created_at < $3
       GROUP BY payment_method`,
      [hospitalId, fromDate, toDate]
    ),
    pool.query(
      `SELECT status, SUM(amount_due) AS outstanding, COUNT(*)::int AS cnt
       FROM hospital_invoices
       WHERE hospital_id = $1 AND status IN ('issued','partial','overdue') AND voided_at IS NULL
       GROUP BY status`,
      [hospitalId]
    ),
    pool.query(
      `SELECT COUNT(*) FILTER (WHERE status = 'open')::int AS open_sessions,
              COUNT(*) FILTER (WHERE status = 'reconciled' AND closed_at >= $2)::int AS reconciled_recent
       FROM billing_cashier_sessions WHERE hospital_id = $1`,
      [hospitalId, fromDate]
    ),
    pool.query(
      `SELECT status, COUNT(*)::int AS cnt, COALESCE(SUM(total_claimed),0) AS claimed, COALESCE(SUM(total_paid),0) AS paid
       FROM insurance_claims WHERE hospital_id = $1 GROUP BY status`,
      [hospitalId]
    ).catch(() => ({ rows: [] })),
  ]);

  const totalCollected = revenue.rows.reduce((s, r) => s + Number(r.total || 0), 0);
  const arOutstanding = ar.rows.reduce((s, r) => s + Number(r.outstanding || 0), 0);

  return {
    period: { from: fromDate, to: toDate },
    cashPosition: totalCollected,
    arOutstanding,
    collectionEfficiency: arOutstanding + totalCollected > 0
      ? Math.round((totalCollected / (totalCollected + arOutstanding)) * 1000) / 10 : 100,
    revenueByMode: revenue.rows,
    accountsReceivable: ar.rows,
    sessions: sessions.rows[0],
    claims: claims.rows,
    claimsPending: claims.rows.filter((c) => !['paid', 'settled'].includes(c.status)).reduce((s, c) => s + c.cnt, 0),
    claimsSettledMtd: claims.rows.filter((c) => ['paid', 'settled'].includes(c.status)).reduce((s, c) => s + Number(c.paid || 0), 0),
  };
}

/**
 * CEO Dashboard — real revenue trend (Rs lakhs) and ALOS. Added 2026-09-18
 * to replace the hardcoded numbers the audit found in
 * routes/hospital/executive-dashboard.route.js's /ceo/financials.
 *
 * Honesty note: ebitdaMargin, revenueTarget, arpob and payerMix are returned as null
 * with a dataAvailable flag rather than fabricated — there is no expense
 * ledger / chart-of-accounts table in this schema (the Accounting module is
 * a UI shell per the audit), so a real EBITDA margin cannot be computed.
 * Shipping a plausible-looking fake number would be worse than an honest
 * null — this mirrors the "never guess, mark unverified" standard the
 * audit itself was held to.
 */
export async function getCeoDashboard(hospitalId, { months = 5 } = {}) {
  const since = new Date();
  since.setMonth(since.getMonth() - months);
  // WP-0.3c: volume trend added 2026-09-23 to replace the client's own
  // 12-month hardcoded OPD/IPD/ER seed array (seedVolume in CEODashboard.tsx).
  const volumeMonths = new Date();
  volumeMonths.setMonth(volumeMonths.getMonth() - 11);

  const [revenueTrend, alos, opdByMonth, ipdByMonth, erByMonth, surgeriesMtdRes] = await Promise.all([
    pool.query(
      `SELECT to_char(date_trunc('month', created_at), 'Mon') AS month,
              date_trunc('month', created_at) AS month_start,
              COALESCE(SUM(amount), 0) AS revenue
       FROM hospital_payments
       WHERE hospital_id = $1 AND status = 'completed' AND created_at >= $2
       GROUP BY date_trunc('month', created_at)
       ORDER BY month_start`,
      [hospitalId, since.toISOString()]
    ).catch(() => ({ rows: [] })),
    pool.query(
      `SELECT ROUND(AVG(EXTRACT(EPOCH FROM (discharge_datetime - admission_datetime)) / 86400)::numeric, 1) AS alos
       FROM ip_admissions WHERE organization_id = $1 AND discharge_datetime IS NOT NULL AND admission_datetime >= $2`,
      [hospitalId, since.toISOString()]
    ).catch(() => ({ rows: [{ alos: null }] })),
    pool.query(
      `SELECT to_char(date_trunc('month', check_in_at), 'Mon') AS month, date_trunc('month', check_in_at) AS month_start, COUNT(*)::int AS cnt
       FROM hospital_queue_entries WHERE organization_id = $1 AND department = 'opd' AND check_in_at >= $2
       GROUP BY date_trunc('month', check_in_at) ORDER BY month_start`,
      [hospitalId, volumeMonths.toISOString()]
    ).catch(() => ({ rows: [] })),
    pool.query(
      `SELECT to_char(date_trunc('month', admission_datetime), 'Mon') AS month, date_trunc('month', admission_datetime) AS month_start, COUNT(*)::int AS cnt
       FROM ip_admissions WHERE organization_id = $1 AND admission_datetime >= $2
       GROUP BY date_trunc('month', admission_datetime) ORDER BY month_start`,
      [hospitalId, volumeMonths.toISOString()]
    ).catch(() => ({ rows: [] })),
    pool.query(
      `SELECT to_char(date_trunc('month', check_in_at), 'Mon') AS month, date_trunc('month', check_in_at) AS month_start, COUNT(*)::int AS cnt
       FROM hospital_queue_entries WHERE organization_id = $1 AND department = 'er' AND check_in_at >= $2
       GROUP BY date_trunc('month', check_in_at) ORDER BY month_start`,
      [hospitalId, volumeMonths.toISOString()]
    ).catch(() => ({ rows: [] })),
    pool.query(
      `SELECT COUNT(*)::int AS cnt FROM ot_bookings
       WHERE organization_id = $1 AND ot_status = 'completed' AND scheduled_start >= date_trunc('month', CURRENT_DATE)`,
      [hospitalId]
    ).catch(() => ({ rows: [{ cnt: 0 }] })),
  ]);

  const monthKey = (d) => new Date(d).toISOString().slice(0, 7);
  const opdMap = new Map(opdByMonth.rows.map((r) => [monthKey(r.month_start), r.cnt]));
  const ipdMap = new Map(ipdByMonth.rows.map((r) => [monthKey(r.month_start), r.cnt]));
  const erMap = new Map(erByMonth.rows.map((r) => [monthKey(r.month_start), r.cnt]));
  const allMonthKeys = new Set([...opdMap.keys(), ...ipdMap.keys(), ...erMap.keys()]);
  const volume = [...allMonthKeys].sort().map((key) => ({
    month: new Date(`${key}-01`).toLocaleString('en-US', { month: 'short' }),
    opd: opdMap.get(key) || 0,
    ipd: ipdMap.get(key) || 0,
    er: erMap.get(key) || 0,
  }));

  // UNITS: the CEO frontend's seed values, chart axis and labels ("₹4780L",
  // "Revenue ... (₹ Lakhs)") are all in Rs LAKHS, so monthlyRevenue and the
  // revenueTrend[].revenue series are returned in lakhs (rupees / 100000,
  // 2 decimals). The raw rupee figure is exposed as monthlyRevenueRupees.
  const toLakhs = (rupees) => Math.round((Number(rupees) / 100000) * 100) / 100;
  const latest = revenueTrend.rows.length ? Number(revenueTrend.rows[revenueTrend.rows.length - 1].revenue) : null;

  return {
    monthlyRevenue: latest != null ? toLakhs(latest) : null,          // Rs lakhs
    monthlyRevenueRupees: latest,                                      // raw Rs
    revenueTrend: revenueTrend.rows.map((r) => ({ month: r.month, revenue: toLakhs(r.revenue) })), // Rs lakhs
    // payerMix intentionally null: hospital_payments/hospital_invoices carry
    // only payment METHOD (cash/card/upi) and an optional insurance_claim_id.
    // There is no corporate-account or govt-scheme link on invoices, so a
    // true Insurance/Corporate/Govt/Self-Pay split cannot be derived reliably.
    // Payment-method mix must NOT be returned under a payer-mix name.
    payerMix: null,
    alos: alos.rows[0]?.alos != null ? Number(alos.rows[0].alos) : null,
    volume,
    surgeriesMtd: surgeriesMtdRes.rows[0]?.cnt ?? 0,
    // Not computable from current schema — no expense ledger exists yet.
    revenueTarget: null,
    ebitdaMargin: null,
    arpob: null,
    deptRevenue: null,
    dataAvailable: { revenueTrend: true, payerMix: false, alos: true, volume: true, ebitdaMargin: false, revenueTarget: false, arpob: false, deptRevenue: false },
  };
}

/**
 * RCM Team Dashboard — claim status, denial trends, days-to-payment, and the
 * pending pre-authorization queue. Added 2026-09-18: the audit found this
 * dashboard didn't exist at all (only CEO/CFO/COO/MS were built), despite
 * the proposal explicitly listing it. Built on the same real tables
 * getCfoDashboard() already uses correctly (insurance_claims, plus
 * claim_denials and pre_authorizations).
 */
export async function getRcmDashboard(hospitalId, { from, to } = {}) {
  const fromDate = from || new Date(Date.now() - 90 * 86400000).toISOString();
  const toDate = to || new Date().toISOString();

  const [claimsByStatus, denials, daysToPayment, pendingPreauth] = await Promise.all([
    pool.query(
      `SELECT status, COUNT(*)::int AS cnt, COALESCE(SUM(claim_amount),0) AS claimed, COALESCE(SUM(settled_amount),0) AS settled
       FROM insurance_claims WHERE hospital_id = $1 AND submitted_date >= $2 AND submitted_date < $3
       GROUP BY status`,
      [hospitalId, fromDate, toDate]
    ).catch(() => ({ rows: [] })),
    pool.query(
      `SELECT denial_code, COUNT(*)::int AS cnt, COALESCE(SUM(denied_amount),0) AS amount
       FROM claim_denials WHERE hospital_id = $1 AND created_at >= $2 AND created_at < $3
       GROUP BY denial_code ORDER BY cnt DESC LIMIT 10`,
      [hospitalId, fromDate, toDate]
    ).catch(() => ({ rows: [] })),
    pool.query(
      `SELECT ROUND(AVG(payment_date - submitted_date)::numeric, 1) AS avg_days
       FROM insurance_claims
       WHERE hospital_id = $1 AND status = 'paid' AND payment_date IS NOT NULL AND submitted_date IS NOT NULL
         AND submitted_date >= $2 AND submitted_date < $3`,
      [hospitalId, fromDate, toDate]
    ).catch(() => ({ rows: [{ avg_days: null }] })),
    pool.query(
      `SELECT COUNT(*)::int AS cnt, COALESCE(SUM(estimated_amount),0) AS estimated
       FROM pre_authorizations WHERE hospital_id = $1 AND status = 'pending'`,
      [hospitalId]
    ).catch(() => ({ rows: [{ cnt: 0, estimated: 0 }] })),
  ]);

  const totalClaims = claimsByStatus.rows.reduce((s, r) => s + r.cnt, 0);
  const totalDenied = claimsByStatus.rows.find((r) => r.status === 'rejected')?.cnt || 0;

  return {
    period: { from: fromDate, to: toDate },
    claimStatus: claimsByStatus.rows,
    denialRate: totalClaims > 0 ? Math.round((totalDenied / totalClaims) * 1000) / 10 : 0,
    denialTrends: denials.rows,
    avgDaysToPayment: daysToPayment.rows[0]?.avg_days != null ? Number(daysToPayment.rows[0].avg_days) : null,
    pendingPreauth: {
      count: pendingPreauth.rows[0]?.cnt || 0,
      estimatedAmount: Number(pendingPreauth.rows[0]?.estimated || 0),
    },
  };
}

export default {
  listStations, createStation, openCashierSession, closeCashierSession, getActiveSession,
  listTemplates, aggregatePatientAccount, getCentralizedDashboard, createInvoice, recordPayment,
  createPaymentLink, confirmPgiPayment, applyVerifiedPgiCapture, getInvoice, listInvoices, listPayments, generateInvoicePdf, listAuditLog,
  logBillingAudit, createAdjustment, voidInvoice, voidPayment, refundPayment,
  requestGatewayRefund, confirmGatewayRefund, listStaleGatewayRefunds,
  reconcileSession, approveCreditAccount, allocatePayment, generatePatientStatement,
  listPatientStatements, deliverPatientStatement,
  closeBillingPeriod, getCfoDashboard, getRcmDashboard, getCeoDashboard,
};
