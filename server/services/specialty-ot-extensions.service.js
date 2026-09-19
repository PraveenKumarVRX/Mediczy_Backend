/**
 * Specialty OT Extensions Service
 * ==================================
 * Ophthalmology, cardiac surgery, and orthopaedic structured fields merge
 * into operative_notes.note_data (JSONB) — additive, doesn't touch any
 * existing column. Post-op follow-up plans are a separate tracking list;
 * see migrations/specialty-ot-extensions.migration.js for why this isn't
 * a direct integration into the live appointments table.
 */

import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import { QueryTypes } from 'sequelize';
import pool from '../db/pgPool.js';

async function mergeNoteData(noteId, organizationId, key, value) {
  if (!organizationId) throw new Error('Organization context missing');
  const patch = JSON.stringify({ [key]: value });
  const [rows] = await sequelize.query(
    `UPDATE operative_notes SET note_data = note_data || :patch::jsonb, updated_at = NOW()
     WHERE id = :noteId AND organization_id = :organizationId AND status = 'draft'
     RETURNING *`,
    { replacements: { noteId, organizationId, patch }, type: QueryTypes.UPDATE }
  );
  if (!rows.length) throw new Error(`Operative note ${noteId} not found or already signed (specialty fields can only be added to a draft note)`);
  return rows[0];
}

class SpecialtyOtExtensionsService {
  // ── Ophthalmology ────────────────────────────────────────────────────────
  async recordOphthalmologyDetails(noteId, organizationId, { iolPower, iolModel, iolLotNumber }) {
    return mergeNoteData(noteId, organizationId, 'ophthalmology', { iolPower, iolModel, iolLotNumber, recordedAt: new Date().toISOString() });
  }

  // ── Cardiac / cardiothoracic surgery ─────────────────────────────────────
  async recordCardiacSurgeryDetails(noteId, organizationId, { procedureType, graftVessels, stentType, stentSize, anticoagulationPlan }) {
    return mergeNoteData(noteId, organizationId, 'cardiacSurgery', { procedureType, graftVessels, stentType, stentSize, anticoagulationPlan, recordedAt: new Date().toISOString() });
  }

  // ── Orthopaedic implant ──────────────────────────────────────────────────
  async recordOrthopaedicImplant(noteId, organizationId, { jointReplaced, implantManufacturer, implantModel, implantSize }) {
    return mergeNoteData(noteId, organizationId, 'orthopaedicImplant', { jointReplaced, implantManufacturer, implantModel, implantSize, recordedAt: new Date().toISOString() });
  }

  // ── Post-op follow-up plan (all specialties) ────────────────────────────
  /** Throws unless the OT booking belongs to the caller's organization. */
  async assertBookingInOrg(otBookingId, organizationId) {
    if (!organizationId) throw new Error('Organization context missing');
    const { rows } = await pool.query('SELECT 1 FROM ot_bookings WHERE id = $1 AND organization_id = $2', [otBookingId, organizationId]);
    if (!rows.length) throw new Error(`OT booking ${otBookingId} not found`);
  }

  async generateFollowUpPlan(otBookingId, organizationId, patientId, surgeryDate = new Date()) {
    await this.assertBookingInOrg(otBookingId, organizationId);
    const base = new Date(surgeryDate);
    const offsets = [
      ['day1', 1],
      ['week1', 7],
      ['month1', 30],
    ];
    const created = [];
    for (const [type, days] of offsets) {
      const due = new Date(base);
      due.setDate(due.getDate() + days);
      const { rows } = await pool.query(
        `INSERT INTO post_op_followup_plan (ot_booking_id, patient_id, followup_type, due_date)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (ot_booking_id, followup_type) DO UPDATE SET due_date = EXCLUDED.due_date
         RETURNING *`,
        [otBookingId, patientId, type, due.toISOString().slice(0, 10)]
      );
      created.push(rows[0]);
    }
    return created;
  }

  async listFollowUpPlan(otBookingId, organizationId) {
    const { rows } = await pool.query(
      `SELECT p.* FROM post_op_followup_plan p
       JOIN ot_bookings b ON b.id = p.ot_booking_id
       WHERE p.ot_booking_id = $1 AND b.organization_id = $2
       ORDER BY p.due_date`,
      [otBookingId, organizationId]
    );
    return rows;
  }

  async markFollowUpStatus(id, organizationId, status, notes) {
    const { rows } = await pool.query(
      `UPDATE post_op_followup_plan SET status = $2, notes = COALESCE($3, notes)
       WHERE id = $1 AND ot_booking_id IN (SELECT id FROM ot_bookings WHERE organization_id = $4)
       RETURNING *`,
      [id, status, notes, organizationId]
    );
    return rows[0];
  }

  /** Due-soon list across all bookings — a front-desk worklist. */
  async listDueSoon(withinDays = 7, organizationId) {
    const { rows } = await pool.query(
      `SELECT p.* FROM post_op_followup_plan p
       JOIN ot_bookings b ON b.id = p.ot_booking_id
       WHERE b.organization_id = $2 AND p.status = 'pending' AND p.due_date <= CURRENT_DATE + ($1 || ' days')::interval
       ORDER BY p.due_date`,
      [withinDays, organizationId]
    );
    return rows;
  }
}

export default new SpecialtyOtExtensionsService();
