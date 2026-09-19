/**
 * Care Series Service — recurring-treatment workflow (dialysis, chemo, etc.)
 * =============================================================================
 * Workflow shell only. See migrations/care-series.migration.js for the
 * governance note: clinical content for a domain lives in the Clinical
 * Knowledge Fabric and requires medical-director approval before use.
 *
 * TENANT ISOLATION: care_series.organization_id is the single ownership
 * anchor. care_series_session (and every dialysis_* / chemo_* row keyed by
 * session_id) belongs to an organization only via
 * care_series_session.series_id -> care_series.organization_id. Every method
 * that touches a series or session by id therefore takes the caller's
 * organizationId and enforces it in SQL. A row owned by another organization
 * is reported exactly like a missing one (NotFoundError, HTTP 404) so record
 * ids cannot be probed across hospitals.
 */

import pool from '../db/pgPool.js';
import knowledgeFabric from './clinical-knowledge-fabric.service.js';

export class NotFoundError extends Error {
  constructor(message = 'not found') {
    super(message);
    this.name = 'NotFoundError';
    this.status = 404;
  }
}

export class BadRequestError extends Error {
  constructor(message) {
    super(message);
    this.name = 'BadRequestError';
    this.status = 400;
  }
}

/** Normalises an org id to an integer; rejects anything missing/non-numeric. */
export function requireOrgId(organizationId) {
  const n = Number(organizationId);
  if (organizationId === null || organizationId === undefined || organizationId === '' || !Number.isInteger(n) || n <= 0) {
    throw new BadRequestError('Organization context missing');
  }
  return n;
}

const SESSION_STATUSES = ['scheduled', 'in_progress', 'completed', 'missed', 'cancelled'];

class CareSeriesService {
  /** Throws NotFoundError unless the series belongs to organizationId. Returns the series row. */
  async assertSeriesOwned(seriesId, organizationId) {
    const org = requireOrgId(organizationId);
    const id = Number(seriesId);
    if (!Number.isInteger(id)) throw new NotFoundError('series not found');
    const { rows } = await pool.query(
      'SELECT * FROM care_series WHERE id = $1 AND organization_id = $2',
      [id, org]
    );
    if (!rows.length) throw new NotFoundError('series not found');
    return rows[0];
  }

  /**
   * Throws NotFoundError unless the care_series_session belongs (via its
   * series) to organizationId. Every dialysis/chemo service method calls this
   * BEFORE reading or writing a session-keyed row (including upserts).
   */
  async assertSessionOwned(sessionId, organizationId) {
    const org = requireOrgId(organizationId);
    const id = Number(sessionId);
    if (!Number.isInteger(id)) throw new NotFoundError('session not found');
    const { rows } = await pool.query(
      `SELECT s.id FROM care_series_session s
         JOIN care_series c ON c.id = s.series_id
        WHERE s.id = $1 AND c.organization_id = $2`,
      [id, org]
    );
    if (!rows.length) throw new NotFoundError('session not found');
    return rows[0];
  }

  async startSeries({ patientId, organizationId, domainKey, seriesType, plannedSessions, protocolReference, createdBy }) {
    const org = requireOrgId(organizationId);
    const { rows } = await pool.query(
      `INSERT INTO care_series (patient_id, organization_id, domain_key, series_type, planned_sessions, protocol_reference, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [patientId, org, domainKey, seriesType, plannedSessions, protocolReference, createdBy]
    );
    return rows[0];
  }

  async getActiveSeriesForPatient(patientId, organizationId) {
    const org = requireOrgId(organizationId);
    const { rows } = await pool.query(
      `SELECT * FROM care_series WHERE patient_id = $1 AND organization_id = $2 AND status = 'active' ORDER BY started_at DESC`,
      [patientId, org]
    );
    return rows;
  }

  async completeSeries(seriesId, organizationId) {
    const org = requireOrgId(organizationId);
    const { rows } = await pool.query(
      `UPDATE care_series SET status = 'completed', completed_at = NOW() WHERE id = $1 AND organization_id = $2 RETURNING *`,
      [seriesId, org]
    );
    if (!rows.length) throw new NotFoundError('series not found');
    return rows[0];
  }

  /**
   * Creates (or re-times) a session in a series. Ownership of the series is
   * enforced inside the INSERT ... SELECT itself, so the ON CONFLICT branch
   * can never touch another organization's session row. Omitted scheduledAt
   * keeps the existing schedule on conflict.
   */
  async scheduleSession({ seriesId, sessionNumber, scheduledAt, organizationId }) {
    const org = requireOrgId(organizationId);
    const { rows } = await pool.query(
      `INSERT INTO care_series_session (series_id, session_number, scheduled_at)
       SELECT c.id, $2::int, $3::timestamptz
         FROM care_series c
        WHERE c.id = $1 AND c.organization_id = $4
       ON CONFLICT (series_id, session_number) DO UPDATE
         SET scheduled_at = COALESCE(EXCLUDED.scheduled_at, care_series_session.scheduled_at)
       RETURNING *`,
      [seriesId, sessionNumber, scheduledAt ?? null, org]
    );
    if (!rows.length) throw new NotFoundError('series not found');
    return rows[0];
  }

  /** Omitted vitals/notes keep their existing values; only supplied fields are overwritten. */
  async recordSession({ sessionId, vitals, notes, status = 'completed', recordedBy, organizationId }) {
    const org = requireOrgId(organizationId);
    if (!SESSION_STATUSES.includes(status)) throw new BadRequestError(`status must be one of ${SESSION_STATUSES.join(', ')}`);
    const { rows } = await pool.query(
      `UPDATE care_series_session s
          SET vitals = COALESCE($2::jsonb, s.vitals),
              notes = COALESCE($3::text, s.notes),
              status = $4::text,
              recorded_by = $5,
              started_at = COALESCE(s.started_at, NOW()),
              completed_at = CASE WHEN $4::text = 'completed' THEN NOW() ELSE s.completed_at END
         FROM care_series c
        WHERE s.id = $1 AND c.id = s.series_id AND c.organization_id = $6
        RETURNING s.*`,
      [sessionId, vitals === undefined || vitals === null ? null : JSON.stringify(vitals), notes ?? null, status, recordedBy, org]
    );
    if (!rows.length) throw new NotFoundError('session not found');
    return rows[0];
  }

  /** The session history for one series — feeds the trend view (weight/BP/UF across dialysis sessions, toxicity across chemo cycles). */
  async getSeriesHistory(seriesId, organizationId) {
    await this.assertSeriesOwned(seriesId, organizationId);
    const { rows } = await pool.query(
      `SELECT s.* FROM care_series_session s
         JOIN care_series c ON c.id = s.series_id
        WHERE s.series_id = $1 AND c.organization_id = $2
        ORDER BY s.session_number`,
      [Number(seriesId), requireOrgId(organizationId)]
    );
    return rows;
  }

  /**
   * The approved knowledge-fabric content (red flags, checklists) for this
   * series' domain. Returns an empty array until a medical director has
   * approved rules for that domain — never returns draft content.
   */
  async getSeriesGuidance(seriesId, organizationId) {
    const series = await this.assertSeriesOwned(seriesId, organizationId);
    const domainKey = series.domain_key;
    if (!domainKey) return [];
    return knowledgeFabric.getApplicableKnowledge({ specialty: domainKey });
  }
}

export default new CareSeriesService();
