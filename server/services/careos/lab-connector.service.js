/**
 * HealthOS Stage 2 — Laboratory connector (FHIR DiagnosticReport → timeline)
 */
import pool from '../../db/pgPool.js';
import { up as migrate } from '../../migrations/healthos-phases-2-4.migration.js';
import { appendClinicalEvent } from './clinical-timeline.service.js';

let ready = false;
async function ensure() { if (!ready) { await migrate(); ready = true; } }

export async function ingestLabResult({ organizationId, patientId, testName, resultValue, resultUnit, referenceRange, severity, fhirResourceId }) {
  await ensure();
  const { rows } = await pool.query(
    `INSERT INTO healthos_lab_results
      (organization_id, patient_id, fhir_resource_id, test_name, result_value, result_unit, reference_range, severity)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [organizationId, patientId, fhirResourceId || null, testName, resultValue, resultUnit, referenceRange, severity || 'normal']
  );
  const lab = rows[0];

  const flag = severity === 'critical' || severity === 'high' ? severity : 'info';
  await appendClinicalEvent({
    organizationId, patientId,
    eventType: 'lab_trend',
    title: `${testName}: ${resultValue}${resultUnit ? ` ${resultUnit}` : ''}`,
    body: referenceRange ? `Reference: ${referenceRange}` : null,
    actorType: 'system', actorName: 'Lab Interface',
    severity: flag,
    metadata: { labResultId: lab.id, fhirResourceId },
  });

  await pool.query(`UPDATE healthos_lab_results SET synced_to_timeline = true WHERE id = $1`, [lab.id]);
  return lab;
}

export async function listLabResults(patientId, organizationId, limit = 50) {
  await ensure();
  const { rows } = await pool.query(
    `SELECT * FROM healthos_lab_results WHERE patient_id = $1 AND ($2::bigint IS NULL OR organization_id = $2)
     ORDER BY reported_at DESC LIMIT $3`,
    [patientId, organizationId || null, limit]
  );
  return rows;
}

export default { ingestLabResult, listLabResults };
