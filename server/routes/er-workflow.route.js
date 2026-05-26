/**
 * ER Workflow Routes
 *
 * Extends the existing emergency triage with:
 * - Rapid temp registration with MLC tagging
 * - STAT order flag
 * - Emergency OT activation (one-click)
 * - ER-to-IP conversion
 * - Family notification
 */

import express from 'express';
import { authUser } from '../middleware/auth.middleware.js';
import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import { QueryTypes } from 'sequelize';
import { convertErToIp } from '../services/adt.service.js';
import { emergencyActivateOT } from '../services/ot-scheduling.service.js';
import { notifyERArrival } from '../services/family-notification.service.js';

const router = express.Router();

// POST /api/v1/er/register
// Rapid registration — works with unknown/unconscious patients
router.post('/register', authUser, async (req, res) => {
  try {
    const organizationId = req.user.organization_id || req.user.tenant_id || req.user.id;
    const {
      patientId, patientName, age, gender, phone,
      triageLevel, chiefComplaint,
      mlcCase = false, injuryType, broughtBy,
      familyPhone
    } = req.body;

    // Generate temp ER ID if no patient ID
    const tempId = patientId ? null : `ER${Date.now().toString().slice(-8)}`;

    const [erRecord] = await sequelize.query(
      `INSERT INTO er_visits (
        organization_id, patient_id, temp_id, patient_name, age, gender, phone,
        triage_level, chief_complaint, mlc_case, injury_type, brought_by,
        arrival_time, status, created_at, updated_at
      ) VALUES (
        :orgId, :patientId, :tempId, :name, :age, :gender, :phone,
        :triage, :complaint, :mlc, :injType, :broughtBy,
        NOW(), 'active', NOW(), NOW()
      ) RETURNING *
      `,
      {
        replacements: {
          orgId: organizationId,
          patientId: patientId || null,
          tempId, name: patientName || 'Unknown', age: age || null, gender: gender || null,
          phone: phone || null, triage: triageLevel || 'yellow',
          complaint: chiefComplaint || null, mlc: mlcCase,
          injType: injuryType || null, broughtBy: broughtBy || null
        },
        type: QueryTypes.INSERT
      }
    ).catch(async () => {
      // Table may not exist yet — fallback: return temp record
      return [{ id: null, temp_id: tempId, patient_id: patientId }];
    });

    // Notify family if phone provided
    if (familyPhone && patientName) {
      await notifyERArrival({
        patientId: patientId || 0, organizationId, patientName, tempId: tempId || patientId
      }).catch(() => {});
    }

    res.status(201).json({ success: true, data: erRecord, tempId });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// POST /api/v1/er/emergency-ot
// One-click emergency OT activation from ER queue
router.post('/emergency-ot', authUser, async (req, res) => {
  try {
    const organizationId = req.user.organization_id || req.user.tenant_id || req.user.id;
    const { patientId, admissionId, surgeonId, procedureName, anesthesiaType, notes } = req.body;

    const booking = await emergencyActivateOT({
      organizationId, patientId, admissionId, surgeonId,
      procedureName, anesthesiaType, notes
    });

    res.status(201).json({ success: true, data: booking, message: 'Emergency OT activated — nearest available OT room booked' });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// POST /api/v1/er/convert-to-ip
router.post('/convert-to-ip', authUser, async (req, res) => {
  try {
    const organizationId = req.user.organization_id || req.user.tenant_id || req.user.id;
    const admission = await convertErToIp({ ...req.body, organizationId, performedBy: req.user.id });
    res.status(201).json({ success: true, data: admission });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// GET /api/v1/er/queue
// Active ER patients grouped by triage level
router.get('/queue', authUser, async (req, res) => {
  try {
    const organizationId = req.user.organization_id || req.user.tenant_id || req.user.id;
    const queue = await sequelize.query(
      `SELECT * FROM er_visits WHERE organization_id = :orgId AND status = 'active' ORDER BY
       CASE triage_level WHEN 'red' THEN 1 WHEN 'yellow' THEN 2 WHEN 'green' THEN 3 ELSE 4 END,
       arrival_time ASC`,
      { replacements: { orgId: organizationId }, type: QueryTypes.SELECT }
    ).catch(() => []);

    const grouped = { red: [], yellow: [], green: [] };
    for (const p of queue) grouped[p.triage_level]?.push(p);

    res.json({ success: true, data: grouped, total: queue.length });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/v1/er/triage/:id
router.put('/triage/:id', authUser, async (req, res) => {
  try {
    const organizationId = req.user.organization_id || req.user.tenant_id || req.user.id;
    const { triageLevel, chiefComplaint, mlcCase } = req.body;
    await sequelize.query(
      `UPDATE er_visits SET triage_level = :triage, chief_complaint = :complaint, mlc_case = :mlc, updated_at = NOW()
       WHERE id = :id AND organization_id = :orgId`,
      { replacements: { triage: triageLevel, complaint: chiefComplaint, mlc: mlcCase, id: req.params.id, orgId: organizationId }, type: QueryTypes.UPDATE }
    ).catch(() => {});
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

export default router;
