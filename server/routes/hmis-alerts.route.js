import express from 'express';
import { authUser } from '../middleware/auth.middleware.js';
import { getActiveAlerts } from '../services/vitals-ews.service.js';
import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import { QueryTypes } from 'sequelize';
import { resolveTenantId } from '../utils/tenant-identity.js';

const router = express.Router();

// GET /api/v1/alerts/clinical — document §8 Phase 2 canonical path
// Unified clinical alert feed: vitals EWS + lab CDSS rule alerts
router.get('/clinical', authUser, async (req, res) => {
  try {
    const organizationId = resolveTenantId(req.user);
    const { patientId, admissionId, severity, limit = 50 } = req.query;

    const [vitalsAlerts, labAlerts] = await Promise.all([
      getActiveAlerts(organizationId, {
        admissionId: admissionId ? parseInt(admissionId) : undefined,
        severity
      }),
      sequelize.query(
        `SELECT id, patient_id, admission_id, rule_id, rule_name, severity, title, message,
                guideline, lab_values, status, created_at, acknowledged_at
         FROM lab_rule_alerts
         WHERE organization_id = :orgId
           ${patientId ? 'AND patient_id = :patientId' : ''}
           ${severity  ? 'AND severity = :severity'    : ''}
           AND status = 'active'
         ORDER BY created_at DESC
         LIMIT :lim`,
        {
          replacements: {
            orgId: organizationId,
            patientId: patientId ? parseInt(patientId) : null,
            severity: severity || null,
            lim: parseInt(limit)
          },
          type: QueryTypes.SELECT
        }
      ).catch(() => [])
    ]);

    const combined = [
      ...vitalsAlerts.map(a => ({ ...a, source: 'vitals_ews' })),
      ...labAlerts.map(a => ({ ...a, source: 'lab_cdss' })),
    ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
     .slice(0, parseInt(limit));

    res.json({ success: true, count: combined.length, data: combined });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
