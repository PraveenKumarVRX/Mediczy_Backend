/**
 * Patient Navigation Service — Phase 1
 *
 * Records every patient journey touchpoint as a lightweight event
 * independent of ADT.  ADT events (A01/A02/A03) are also mirrored here
 * so the timeline API gives a single chronological view.
 *
 * Event categories: registration | appointment | triage | consultation |
 *   lab_order | lab_result | imaging_order | imaging_result | admission |
 *   transfer | ot_booking | ot_status | discharge | follow_up | payment |
 *   notification | custom
 */

import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import { QueryTypes } from 'sequelize';

import { schemaVerifier } from '../utils/schema-guard.js';
const SCHEMA_TABLES = ['patient_navigation_events'];

// Schema is owned by the migration, not created here. A missing table
// fails closed with SCHEMA_NOT_MIGRATED naming what to apply, instead of
// this service quietly building a table the migration never shaped.
const ensureTables = schemaVerifier({
  sequelize: sequelize,
  tables: SCHEMA_TABLES,
  code: 'SCHEMA_NOT_MIGRATED',
  message: 'Apply migration 20260526000001-create-hmis-phase3-5-tables before using patient navigation',
});

export async function recordNavigationEvent({
  organizationId,
  patientId,
  encounterId,
  admissionId,
  category,
  eventCode,
  title,
  description,
  status = 'completed',
  location = {},
  performedBy,
  metadata = {},
  eventAt
}) {
  await ensureTables();
  const [result] = await sequelize.query(
    `INSERT INTO patient_navigation_events
       (organization_id, patient_id, encounter_id, admission_id, category, event_code,
        title, description, status, location, performed_by, metadata, event_at)
     VALUES
       (:orgId, :patientId, :encId, :admId, :category, :code,
        :title, :desc, :status, :loc::jsonb, :by, :meta::jsonb, :eventAt)
     RETURNING *`,
    {
      replacements: {
        orgId: organizationId || null, patientId, encId: encounterId || null,
        admId: admissionId || null, category, code: eventCode || null,
        title, desc: description || null, status,
        loc: JSON.stringify(location), by: performedBy || null,
        meta: JSON.stringify(metadata), eventAt: eventAt || new Date()
      },
      type: QueryTypes.INSERT
    }
  );
  return result[0];
}

export async function getPatientTimeline(patientId, organizationId, { limit = 100, offset = 0, since } = {}) {
  await ensureTables();
  let where = 'patient_id = :patientId';
  const replacements = { patientId, limit, offset };

  if (organizationId) {
    where += ' AND (organization_id = :orgId OR organization_id IS NULL)';
    replacements.orgId = organizationId;
  }
  if (since) {
    where += ' AND event_at >= :since';
    replacements.since = new Date(since);
  }

  const events = await sequelize.query(
    `SELECT * FROM patient_navigation_events
     WHERE ${where}
     ORDER BY event_at DESC
     LIMIT :limit OFFSET :offset`,
    { replacements, type: QueryTypes.SELECT }
  );

  // Also pull ADT events for completeness
  const adtEvents = await sequelize.query(
    `SELECT
       e.id, e.event_datetime as event_at, e.event_type as event_code,
       e.reason as description, e.performed_by, e.from_location, e.to_location,
       a.admission_number
     FROM adt_events e
     JOIN ip_admissions a ON a.id = e.admission_id
     WHERE e.patient_id = :patientId
     ORDER BY e.event_datetime DESC
     LIMIT 50`,
    { replacements: { patientId }, type: QueryTypes.SELECT }
  ).catch(() => []);

  const adtMapped = adtEvents.map(e => ({
    id: `adt-${e.id}`,
    category: 'admission',
    event_code: e.event_code,
    title: { A01: 'Patient Admitted', A02: 'Patient Transferred', A03: 'Patient Discharged', A04: 'OP Registered', A11: 'Admission Cancelled' }[e.event_code] || e.event_code,
    description: e.description,
    status: 'completed',
    location: e.to_location || e.from_location || {},
    performed_by: e.performed_by,
    metadata: { admission_number: e.admission_number },
    event_at: e.event_at,
    source: 'adt'
  }));

  const merged = [...events.map(e => ({ ...e, source: 'navigation' })), ...adtMapped]
    .sort((a, b) => new Date(b.event_at) - new Date(a.event_at))
    .slice(offset, offset + limit);

  return { patientId, total: merged.length, events: merged };
}
