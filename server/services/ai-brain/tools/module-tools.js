/**
 * Module Copilot Tools — hospital operations (billing, ADT, lab, pharmacy, quality)
 */
import pool from '../../../db/pgPool.js';
import { postgresSequelize as sequelize } from '../../../db/postgres-sequelize.js';
import { QueryTypes } from 'sequelize';
import { register } from './index.js';

function orgId(ctx) {
  return ctx.hospitalId || ctx.organizationId || ctx.tenantId;
}

register({
  name: 'get_billing_account_summary',
  description: 'Get patient billing summary: pending charges, invoices, balance due for a hospital patient.',
  category: 'billing',
  parameters: {
    type: 'object',
    properties: {
      patient_id: { type: 'string', description: 'Patient ID' },
      admission_id: { type: 'string', description: 'Optional admission ID' },
    },
    required: ['patient_id'],
  },
  async execute(params, ctx) {
    const hospitalId = orgId(ctx);
    const patientId = Number(params.patient_id);
    if (!hospitalId || !patientId) return { error: 'Hospital and patient context required' };

    const [charges, invoices] = await Promise.all([
      pool.query(
        `SELECT COUNT(*)::int AS cnt, COALESCE(SUM(amount),0) AS total
         FROM hospital_billing_charges WHERE hospital_id = $1 AND patient_id = $2 AND status IN ('pending','posted')`,
        [hospitalId, patientId]
      ),
      pool.query(
        `SELECT COUNT(*)::int AS cnt, COALESCE(SUM(amount_due),0) AS due, COALESCE(SUM(amount_paid),0) AS paid
         FROM hospital_invoices WHERE hospital_id = $1 AND patient_id = $2 AND voided_at IS NULL AND status NOT IN ('voided','paid')`,
        [hospitalId, patientId]
      ),
    ]);

    return {
      pendingCharges: charges.rows[0]?.total || 0,
      openChargeCount: charges.rows[0]?.cnt || 0,
      amountDue: invoices.rows[0]?.due || 0,
      amountPaid: invoices.rows[0]?.paid || 0,
      openInvoiceCount: invoices.rows[0]?.cnt || 0,
    };
  },
});

register({
  name: 'get_open_invoices',
  description: 'List open hospital invoices for a patient or hospital.',
  category: 'billing',
  parameters: {
    type: 'object',
    properties: {
      patient_id: { type: 'string' },
      limit: { type: 'string', description: 'Max rows (default 10)' },
    },
    required: [],
  },
  async execute(params, ctx) {
    const hospitalId = orgId(ctx);
    if (!hospitalId) return { error: 'Hospital context required' };
    const limit = Math.min(20, Number(params.limit) || 10);
    const clauses = ['hospital_id = $1', "status IN ('issued','partial','overdue','draft')", 'voided_at IS NULL'];
    const values = [hospitalId];
    if (params.patient_id) {
      values.push(Number(params.patient_id));
      clauses.push(`patient_id = $${values.length}`);
    }
    values.push(limit);
    const { rows } = await pool.query(
      `SELECT id, bill_number, patient_id, total_amount, amount_paid, amount_due, status, created_at
       FROM hospital_invoices WHERE ${clauses.join(' AND ')}
       ORDER BY created_at DESC LIMIT $${values.length}`,
      values
    );
    return { invoices: rows };
  },
});

register({
  name: 'get_admission_status',
  description: 'Get IP admission status, ward, bed for an admission or patient.',
  category: 'adt',
  parameters: {
    type: 'object',
    properties: {
      admission_id: { type: 'string' },
      patient_id: { type: 'string' },
    },
    required: [],
  },
  async execute(params, ctx) {
    const orgIdVal = orgId(ctx);
    if (!orgIdVal) return { error: 'Organization context required' };
    let sql = `SELECT a.*, w.name AS ward_name, b.bed_number FROM ip_admissions a
      LEFT JOIN wards w ON w.id = a.ward_id LEFT JOIN beds b ON b.id = a.bed_id
      WHERE a.organization_id = :orgId`;
    const replacements = { orgId: orgIdVal };
    if (params.admission_id) {
      sql += ' AND a.id = :admId';
      replacements.admId = Number(params.admission_id);
    } else if (params.patient_id) {
      sql += " AND a.patient_id = :pid AND a.status != 'discharged' ORDER BY a.admission_datetime DESC LIMIT 1";
      replacements.pid = Number(params.patient_id);
    } else {
      return { error: 'admission_id or patient_id required' };
    }
    const [row] = await sequelize.query(sql, { replacements, type: QueryTypes.SELECT });
    return row || { message: 'Admission not found' };
  },
});

register({
  name: 'get_discharge_clearance',
  description: 'Evaluate billing/discharge clearance for an admission.',
  category: 'adt',
  parameters: {
    type: 'object',
    properties: { admission_id: { type: 'string' } },
    required: ['admission_id'],
  },
  async execute(params, ctx) {
    const orgIdVal = orgId(ctx);
    const { evaluateBillingClearance } = await import('../../discharge-billing-clearance.service.js');
    return evaluateBillingClearance(Number(params.admission_id), orgIdVal);
  },
});

register({
  name: 'get_lab_orders_pending',
  description: 'Count pending lab orders for hospital or admission.',
  category: 'lab',
  parameters: {
    type: 'object',
    properties: {
      admission_id: { type: 'string' },
      patient_id: { type: 'string' },
    },
    required: [],
  },
  async execute(params, ctx) {
    const hospitalId = orgId(ctx);
    let sql = `SELECT COUNT(*)::int AS cnt FROM emr_order_events
      WHERE hospital_id = $1 AND order_type = 'lab' AND status IN ('pending','sent','in_progress')`;
    const values = [hospitalId];
    if (params.admission_id) {
      values.push(Number(params.admission_id));
      sql += ` AND admission_id = $${values.length}`;
    }
    if (params.patient_id) {
      values.push(Number(params.patient_id));
      sql += ` AND patient_id = $${values.length}`;
    }
    const r = await pool.query(sql, values).catch(() => ({ rows: [{ cnt: 0 }] }));
    return { pendingLabOrders: r.rows[0]?.cnt || 0 };
  },
});

register({
  name: 'get_early_warning_alerts',
  description: 'Get active NEWS2 / deterioration alerts for ward or admission.',
  category: 'clinical',
  parameters: {
    type: 'object',
    properties: {
      admission_id: { type: 'string' },
      ward_id: { type: 'string' },
      severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
    },
    required: [],
  },
  async execute(params, ctx) {
    const { getActiveAlerts } = await import('../../vitals-ews.service.js');
    const alerts = await getActiveAlerts(orgId(ctx), {
      admissionId: params.admission_id ? Number(params.admission_id) : undefined,
      wardId: params.ward_id ? Number(params.ward_id) : undefined,
      severity: params.severity || undefined,
    });
    return { alerts: alerts.slice(0, 15) };
  },
});

register({
  name: 'query_patient_cohort',
  description: 'Search patients by structured filters (diagnosis, last visit, balance due). Read-only.',
  category: 'clinical',
  parameters: {
    type: 'object',
    properties: {
      chronic_condition: { type: 'string', description: 'e.g. diabetes, hypertension' },
      min_balance_due: { type: 'string' },
      days_since_visit: { type: 'string' },
      limit: { type: 'string' },
    },
    required: [],
  },
  async execute(params, ctx) {
    const hospitalId = orgId(ctx);
    const limit = Math.min(50, Number(params.limit) || 20);
    const conditions = ['1=1'];
    const values = [];
    if (params.chronic_condition) {
      values.push(`%${params.chronic_condition}%`);
      conditions.push(`(p.chronic_conditions ILIKE $${values.length} OR p."chronicConditions"::text ILIKE $${values.length})`);
    }
    if (params.min_balance_due) {
      values.push(Number(params.min_balance_due));
      conditions.push(`EXISTS (
        SELECT 1 FROM hospital_invoices hi
        WHERE hi.patient_id = p.id AND hi.hospital_id = $${values.length + 1} AND hi.amount_due >= $${values.length}
      )`);
      values.push(hospitalId);
    }
    values.push(limit);
    const { rows } = await pool.query(
      `SELECT p.id, p."fullName", p."chronicConditions", p."lastVisitAt"
       FROM patients p WHERE ${conditions.join(' AND ')}
       ORDER BY p."lastVisitAt" DESC NULLS LAST LIMIT $${values.length}`,
      values
    ).catch(() => ({ rows: [] }));
    return { patients: rows, count: rows.length };
  },
});

register({
  name: 'get_insurance_claims_summary',
  description: 'Summary of insurance claims by status for hospital.',
  category: 'billing',
  parameters: {
    type: 'object',
    properties: {
      patient_id: { type: 'string' },
      status: { type: 'string' },
    },
    required: [],
  },
  async execute(params, ctx) {
    const hospitalId = orgId(ctx);
    let sql = `SELECT status, COUNT(*)::int AS cnt, COALESCE(SUM(total_claimed),0) AS claimed
      FROM insurance_claims WHERE hospital_id = $1`;
    const values = [hospitalId];
    if (params.patient_id) {
      values.push(Number(params.patient_id));
      sql += ` AND patient_id = $${values.length}`;
    }
    if (params.status) {
      values.push(params.status);
      sql += ` AND status = $${values.length}`;
    }
    sql += ' GROUP BY status';
    const { rows } = await pool.query(sql, values).catch(() => ({ rows: [] }));
    return { claims: rows };
  },
});

register({
  name: 'get_quality_kpi_snapshot',
  description: 'NABH/JCI quality KPI snapshot for compliance copilot.',
  category: 'quality',
  parameters: { type: 'object', properties: {}, required: [] },
  async execute(_params, ctx) {
    const orgIdVal = orgId(ctx);
    const [incidents, assessments] = await Promise.all([
      sequelize.query(
        `SELECT COUNT(*)::int AS open FROM quality_incidents WHERE organization_id = :orgId AND status = 'open'`,
        { replacements: { orgId: orgIdVal }, type: QueryTypes.SELECT }
      ).catch(() => [{ open: 0 }]),
      sequelize.query(
        `SELECT COUNT(*)::int AS pending FROM quality_assessments WHERE organization_id = :orgId AND status = 'pending'`,
        { replacements: { orgId: orgIdVal }, type: QueryTypes.SELECT }
      ).catch(() => [{ pending: 0 }]),
    ]);
    return { openIncidents: incidents[0]?.open || 0, pendingAssessments: assessments[0]?.pending || 0 };
  },
});
