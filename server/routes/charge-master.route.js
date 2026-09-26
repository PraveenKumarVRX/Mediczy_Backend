/** GAP-BIL-001 — Charge master CRUD */
import express from 'express';
import { hospitalContextFromToken } from '../middleware/hospitalContext.middleware.js';
import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import { QueryTypes } from 'sequelize';
import { runBedDayCharging } from '../services/ip-bed-day-charging.service.js';
import { evaluateBillingClearance, autoFinalizeEstimate } from '../services/discharge-billing-clearance.service.js';
import { resolveTenantId } from '../utils/tenant-identity.js';

const router = express.Router();
const orgId = (req) => req.hospitalId || req.hospitalOrgId || resolveTenantId(req.user);

router.use(hospitalContextFromToken);

router.get('/charges', async (req, res) => {
  const rows = await sequelize.query(
    'SELECT * FROM charge_master WHERE organization_id = :orgId ORDER BY category, code',
    { replacements: { orgId: orgId(req) }, type: QueryTypes.SELECT },
  ).catch(() => []);
  res.json({ success: true, data: rows });
});

router.post('/charges', async (req, res) => {
  const { code, name, category, unitPrice, taxPercent, insurancePayable } = req.body;
  const [row] = await sequelize.query(
    `INSERT INTO charge_master (organization_id, code, name, category, unit_price, tax_percent, insurance_payable, active, created_at, updated_at)
     VALUES (:orgId, :code, :name, :cat, :price, :tax, :ins, true, NOW(), NOW()) RETURNING *`,
    {
      replacements: {
        orgId: orgId(req), code, name, cat: category, price: unitPrice ?? 0,
        tax: taxPercent ?? 0, ins: insurancePayable !== false,
      },
      type: QueryTypes.INSERT,
    },
  );
  res.status(201).json({ success: true, data: row });
});

router.post('/bed-day-charge/run', async (req, res) => {
  const result = await runBedDayCharging(orgId(req));
  res.json({ success: true, data: result });
});

router.get('/clearance/:admissionId', async (req, res) => {
  const data = await evaluateBillingClearance(parseInt(req.params.admissionId, 10), orgId(req));
  res.json({ success: true, data });
});

router.post('/clearance/:admissionId/finalize', async (req, res) => {
  const data = await autoFinalizeEstimate(parseInt(req.params.admissionId, 10), orgId(req), req.userId || req.user?.id);
  res.json({ success: true, data });
});

// ── Fee schedule versioning (Wave 2) ─────────────────────────────────────────
router.get('/versions', async (req, res) => {
  try {
    const feeSchedule = (await import('../services/fee-schedule-versioning.service.js')).default;
    const versions = await feeSchedule.listVersions(orgId(req));
    res.json({ success: true, data: versions });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

router.post('/versions', async (req, res) => {
  try {
    const feeSchedule = (await import('../services/fee-schedule-versioning.service.js')).default;
    const version = await feeSchedule.createVersion(orgId(req), {
      versionCode: req.body.versionCode,
      effectiveFrom: req.body.effectiveFrom,
      effectiveTo: req.body.effectiveTo,
      createdBy: req.userId || req.user?.id,
    });
    res.status(201).json({ success: true, data: version });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
});

router.get('/resolve/:code', async (req, res) => {
  try {
    const feeSchedule = (await import('../services/fee-schedule-versioning.service.js')).default;
    const charge = await feeSchedule.resolveCharge(orgId(req), req.params.code, req.query.asOf);
    res.json({ success: true, data: charge });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

export default router;
