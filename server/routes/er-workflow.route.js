/**
 * ER Workflow Routes
 *
 * Extends the existing emergency triage with:
 * - Rapid temp registration with MLC tagging
 * - STAT order flag
 * - Emergency OT activation (one-click)
 * - ER-to-IP conversion
 * - Family notification
 *
 * WP-1.8 (ER triage correctness): registration and triage-update used to swallow every database error and,
 * on registration, return a fabricated record ({ id: null, ... }) as if the write had succeeded — a nurse
 * charting against that patient would have been charting against nothing. Neither route ever set
 * triage_time, so "when was this patient triaged" was always null. Both are fixed below: a real failure is
 * now a real error response, and triage_time is always set whenever a triage decision is actually recorded.
 * The three-colour triage_level is now joined by a real ESI level (1-5) — see
 * migrations/er-triage-esi-fields.migration.js for why the two are never auto-converted into each other.
 */

import express from 'express';
import { authUser } from '../middleware/auth.middleware.js';
import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import { QueryTypes } from 'sequelize';
import { convertErToIp } from '../services/adt.service.js';
import { emergencyActivateOT } from '../services/ot-scheduling.service.js';
import { notifyERArrival } from '../services/family-notification.service.js';
import { resolveTenantId } from '../utils/tenant-identity.js';

const router = express.Router();

const VALID_COLOURS = new Set(['red', 'yellow', 'green']);
const validEsiLevel = (v) => Number.isInteger(v) && v >= 1 && v <= 5;

// POST /api/v1/er/register
// Rapid registration — works with unknown/unconscious patients
router.post('/register', authUser, async (req, res) => {
  try {
    const organizationId = resolveTenantId(req.user);
    const {
      patientId, patientName, age, gender, phone,
      triageLevel, esiLevel, triageInputs,
      chiefComplaint,
      mlcCase = false, injuryType, broughtBy,
      familyPhone
    } = req.body;

    if (esiLevel != null && !validEsiLevel(Number(esiLevel))) {
      return res.status(400).json({ success: false, message: 'esiLevel must be an integer 1-5' });
    }
    if (triageLevel != null && !VALID_COLOURS.has(triageLevel)) {
      return res.status(400).json({ success: false, message: 'triageLevel must be one of red, yellow, green' });
    }
    const hasTriageDecision = esiLevel != null || triageLevel != null;

    // Generate temp ER ID if no patient ID
    const tempId = patientId ? null : `ER${Date.now().toString().slice(-8)}`;

    // A failed insert must be reported as a failure, not papered over with a fabricated { id: null } record —
    // charting, orders and the queue itself all key off a real er_visits.id. (Sequelize's raw INSERT..RETURNING
    // return shape is [[row], rowCount] — the pre-existing `const [erRecord] = ...` here destructured to the
    // ARRAY, not the row, so every caller of this endpoint has been receiving `data: [{...}]` instead of
    // `data: {...}`; fixed by unwrapping one level further.)
    // A colour-only decision (no ESI level) is a queue-ordering hint only, not a reviewed assessment — a nurse
    // still needs to confirm it with a real level (WP-1.8 plan: "a colour-only write ... is treated as a
    // queue-ordering hint only until confirmed"). No triage decision at all is trivially "not reviewed" too.
    const reviewed = esiLevel != null;
    const [[erRecord]] = await sequelize.query(
      `INSERT INTO er_visits (
        organization_id, patient_id, temp_id, patient_name, age, gender, phone,
        triage_level, esi_level, triage_source, triage_time, triage_reviewed,
        triage_confirmed_by, triage_confirmed_at, triage_inputs,
        chief_complaint, mlc_case, injury_type, brought_by,
        arrival_time, status, created_at, updated_at
      ) VALUES (
        :orgId, :patientId, :tempId, :name, :age, :gender, :phone,
        :triage, :esiLevel, 'registration', :triageTime, :reviewed,
        :confirmedBy, :confirmedAt, :triageInputs,
        :complaint, :mlc, :injType, :broughtBy,
        NOW(), 'active', NOW(), NOW()
      ) RETURNING *
      `,
      {
        replacements: {
          orgId: organizationId,
          patientId: patientId || null,
          tempId, name: patientName || 'Unknown', age: age || null, gender: gender || null,
          phone: phone || null,
          triage: triageLevel || (esiLevel == null ? 'yellow' : null),
          esiLevel: esiLevel != null ? Number(esiLevel) : null,
          triageTime: hasTriageDecision ? new Date() : null,
          reviewed,
          confirmedBy: reviewed ? req.user.id : null,
          confirmedAt: reviewed ? new Date() : null,
          triageInputs: triageInputs ? JSON.stringify(triageInputs) : null,
          complaint: chiefComplaint || null, mlc: mlcCase,
          injType: injuryType || null, broughtBy: broughtBy || null
        },
        type: QueryTypes.INSERT
      }
    );

    // Notify family if phone provided — best-effort side effect; losing a notification is not the same as
    // losing the ER record itself, so this alone stays non-fatal.
    if (familyPhone && patientName) {
      await notifyERArrival({
        patientId: patientId || 0, organizationId, patientName, tempId: tempId || patientId
      }).catch((e) => { console.error('[er-workflow] family notification failed:', e.message); });
    }

    res.status(201).json({ success: true, data: erRecord, tempId });
  } catch (err) {
    console.error('[er-workflow] register failed:', err.message);
    res.status(400).json({ success: false, message: err.message });
  }
});

// POST /api/v1/er/emergency-ot
// One-click emergency OT activation from ER queue
router.post('/emergency-ot', authUser, async (req, res) => {
  try {
    const organizationId = resolveTenantId(req.user);
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
    const organizationId = resolveTenantId(req.user);
    const admission = await convertErToIp({ ...req.body, organizationId, performedBy: req.user.id });
    res.status(201).json({ success: true, data: admission });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// GET /api/v1/er/queue
// Active ER patients, ordered by ESI level when known (a real, reviewed level always outranks a colour hint —
// see hospital-queue.service.js's ESI_PRIORITY), grouped both the old way (red/yellow/green, for screens not
// yet moved to five ESI lanes) and the new way (esi1..esi5 + unclassified).
router.get('/queue', authUser, async (req, res) => {
  try {
    const organizationId = resolveTenantId(req.user);
    const queue = await sequelize.query(
      `SELECT * FROM er_visits WHERE organization_id = :orgId AND status = 'active' ORDER BY
       CASE
         WHEN esi_level IS NOT NULL THEN esi_level
         WHEN triage_level = 'red' THEN 1
         WHEN triage_level = 'yellow' THEN 3
         WHEN triage_level = 'green' THEN 4
         ELSE 6
       END,
       arrival_time ASC`,
      { replacements: { orgId: organizationId }, type: QueryTypes.SELECT }
    );

    const grouped = { red: [], yellow: [], green: [] };
    const byEsi = { esi1: [], esi2: [], esi3: [], esi4: [], esi5: [], unclassified: [] };
    let unreviewed = 0;
    for (const p of queue) {
      if (p.triage_level && grouped[p.triage_level]) grouped[p.triage_level].push(p);
      if (p.esi_level) byEsi[`esi${p.esi_level}`]?.push(p);
      else byEsi.unclassified.push(p);
      if (p.triage_reviewed === false) unreviewed += 1;
    }

    res.json({ success: true, data: grouped, byEsi, total: queue.length, unreviewed });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/v1/er/triage/:id
// A level (esiLevel) is authoritative when given; a colour-only update (triageLevel with no esiLevel) is
// accepted too — e.g. a first-look colour tag before full ESI assessment — but is NOT marked reviewed unless
// esiLevel is also present, matching the plan's "colour-only write is a queue-ordering hint only until
// confirmed". Every real update sets triage_time — the field the old route declared but never actually wrote.
router.put('/triage/:id', authUser, async (req, res) => {
  try {
    const organizationId = resolveTenantId(req.user);
    const { triageLevel, esiLevel, triageInputs, chiefComplaint, mlcCase } = req.body;

    if (esiLevel == null && triageLevel == null) {
      return res.status(400).json({ success: false, message: 'Provide esiLevel or triageLevel' });
    }
    if (esiLevel != null && !validEsiLevel(Number(esiLevel))) {
      return res.status(400).json({ success: false, message: 'esiLevel must be an integer 1-5' });
    }
    if (triageLevel != null && !VALID_COLOURS.has(triageLevel)) {
      return res.status(400).json({ success: false, message: 'triageLevel must be one of red, yellow, green' });
    }

    const esiGiven = esiLevel != null;
    const [rows] = await sequelize.query(
      `UPDATE er_visits SET
         triage_level = COALESCE(:triage, triage_level),
         esi_level = COALESCE(:esiLevel, esi_level),
         triage_source = 'nurse',
         triage_time = NOW(),
         triage_reviewed = :esiGiven,
         triage_confirmed_by = CASE WHEN :esiGiven THEN :confirmedBy ELSE triage_confirmed_by END,
         triage_confirmed_at = CASE WHEN :esiGiven THEN NOW() ELSE triage_confirmed_at END,
         triage_inputs = COALESCE(:triageInputs, triage_inputs),
         chief_complaint = COALESCE(:complaint, chief_complaint),
         mlc_case = COALESCE(:mlc, mlc_case),
         updated_at = NOW()
       WHERE id = :id AND organization_id = :orgId
       RETURNING *`,
      {
        replacements: {
          triage: triageLevel || null, esiLevel: esiGiven ? Number(esiLevel) : null, esiGiven,
          confirmedBy: req.user.id, triageInputs: triageInputs ? JSON.stringify(triageInputs) : null,
          complaint: chiefComplaint || null, mlc: mlcCase != null ? mlcCase : null,
          id: req.params.id, orgId: organizationId
        },
        type: QueryTypes.UPDATE
      }
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'ER visit not found' });
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    console.error('[er-workflow] triage update failed:', err.message);
    res.status(400).json({ success: false, message: err.message });
  }
});

export default router;
