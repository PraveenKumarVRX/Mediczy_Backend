/**
 * FHIR Bulk $export Service (ITEM-20)
 *
 * Implements the HL7 FHIR Bulk Data Access (BDA) specification:
 * https://hl7.org/fhir/uv/bulkdata/
 *
 * Supported resource types: Patient, Observation, Condition, MedicationRequest, Encounter
 *
 * Export jobs are tracked in Redis (fhir:export:<jobId>).
 * Output files are written as NDJSON to /tmp/fhir-exports/<jobId>/<ResourceType>.ndjson
 * and can be streamed back via GET /fhir/r4/bulkdata/:jobId/:filename
 */

import { randomUUID } from 'crypto';
import { mkdir, writeFile, appendFile } from 'fs/promises';
import path from 'path';
import redisClient from '../config/redis.js';
import { connectPostgres } from '../db/postgres.js';
import fhirMapper from './fhir-mapper.service.js';

const EXPORT_TTL_SECONDS = 60 * 60 * 24; // 24 hours — files and job state retained for 1 day
const EXPORT_DIR_BASE = '/tmp/fhir-exports';

// ── Supported resource type queries ──────────────────────────────────────────

/**
 * Return all rows and a mapper function for the given resource type.
 * Returns { rows, mapper } where mapper(row) → FHIR resource object.
 */
async function fetchResourceRows(pool, resourceType, since) {
  const sinceClause = since ? `AND updated_at >= '${since}'` : '';

  switch (resourceType) {
    case 'Patient': {
      const { rows } = await pool.query(
        `SELECT * FROM users WHERE role IN ('patient','user') ${sinceClause} ORDER BY id`
      ).catch(() => ({ rows: [] }));
      return { rows, mapper: (r) => fhirMapper.mapPatient(r) };
    }

    case 'Encounter': {
      const { rows } = await pool.query(
        `SELECT * FROM appointments ${since ? `WHERE updated_at >= '${since}'` : ''} ORDER BY id`
      ).catch(() => ({ rows: [] }));
      return { rows, mapper: (r) => fhirMapper.mapEncounter(r) };
    }

    case 'Observation': {
      const { rows } = await pool.query(
        `SELECT * FROM vitals ${since ? `WHERE recorded_at >= '${since}'` : ''} ORDER BY id`
      ).catch(() => ({ rows: [] }));
      return { rows, mapper: (r) => fhirMapper.mapObservation(r, String(r.patient_id)) };
    }

    case 'Condition': {
      // Flatten clinical_notes ICD-10 codes into individual Condition resources
      const { rows } = await pool.query(
        `SELECT id, patient_id, assessment AS description, icd10_codes, created_at
         FROM clinical_notes
         WHERE assessment IS NOT NULL ${sinceClause}
         ORDER BY id`
      ).catch(() => ({ rows: [] }));

      const conditions = [];
      for (const row of rows) {
        const codes = Array.isArray(row.icd10_codes) ? row.icd10_codes : [];
        const patientRef = String(row.patient_id);
        if (codes.length > 0) {
          for (const code of codes) {
            conditions.push(fhirMapper.mapCondition({
              id: `${row.id}-${typeof code === 'string' ? code : code.code}`,
              patient_id: row.patient_id,
              icd10_code: typeof code === 'string' ? code : code.code,
              description: typeof code === 'object' ? code.description : row.description,
              created_at: row.created_at,
            }, patientRef));
          }
        } else if (row.description) {
          conditions.push(fhirMapper.mapCondition({
            id: row.id,
            description: row.description,
            created_at: row.created_at,
          }, patientRef));
        }
      }
      // Return pre-mapped resources (mapper is identity)
      return { rows: conditions, mapper: (r) => r };
    }

    case 'MedicationRequest': {
      const { rows } = await pool.query(
        `SELECT * FROM prescriptions ${since ? `WHERE updated_at >= '${since}'` : ''} ORDER BY id`
      ).catch(() => ({ rows: [] }));
      return { rows, mapper: (r) => fhirMapper.mapMedicationRequest(r, String(r.patient_id)) };
    }

    default:
      return { rows: [], mapper: (r) => r };
  }
}

// ── Job management ────────────────────────────────────────────────────────────

/**
 * Persist job state to Redis.
 */
async function saveJobState(jobId, state) {
  await redisClient.set(`fhir:export:${jobId}`, JSON.stringify(state), 'EX', EXPORT_TTL_SECONDS);
}

/**
 * Start an async export job.
 *
 * @param {Object} params
 * @param {string[]} params.resourceTypes - e.g. ['Patient', 'Observation']
 * @param {string|null} params.since      - ISO date string or null
 * @param {string} params.outputFormat    - MIME type (informational only)
 * @param {string} params.initiatedBy     - user ID or 'anonymous'
 *
 * @returns {{ jobId: string }}
 */
export async function startExport(params) {
  const jobId = randomUUID();
  const startedAt = new Date().toISOString();

  const initialState = {
    jobId,
    status: 'in-progress',
    progress: 0,
    startedAt,
    resourceTypes: params.resourceTypes,
    outputFormat: params.outputFormat || 'application/fhir+ndjson',
    initiatedBy: params.initiatedBy || 'anonymous',
    output: [],
    error: null,
  };

  await saveJobState(jobId, initialState);

  // Fire-and-forget: run processing asynchronously
  processExport(jobId, params).catch((err) => {
    console.error(`[fhir-bulk-export] Job ${jobId} failed:`, err);
    saveJobState(jobId, { ...initialState, status: 'error', error: err.message }).catch(() => {});
  });

  return { jobId };
}

/**
 * Retrieve job status from Redis.
 *
 * @param {string} jobId
 * @returns {Object|null}
 */
export async function getExportStatus(jobId) {
  try {
    const raw = await redisClient.get(`fhir:export:${jobId}`);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    console.error(`[fhir-bulk-export] getExportStatus error for ${jobId}:`, e);
    return null;
  }
}

/**
 * Process the export job: query each resource type, write NDJSON files, update Redis.
 *
 * @param {string} jobId
 * @param {Object} params
 */
export async function processExport(jobId, params) {
  const { resourceTypes, since } = params;
  const jobDir = path.join(EXPORT_DIR_BASE, jobId);

  // Create output directory
  await mkdir(jobDir, { recursive: true });

  const pool = await connectPostgres();
  const outputFiles = [];
  const total = resourceTypes.length;
  let completed = 0;

  for (const resourceType of resourceTypes) {
    try {
      const { rows, mapper } = await fetchResourceRows(pool, resourceType, since);

      const filename = `${resourceType}.ndjson`;
      const filePath = path.join(jobDir, filename);

      // Write NDJSON — one JSON object per line
      const lines = rows.map((row) => {
        try {
          return JSON.stringify(mapper(row));
        } catch {
          return null;
        }
      }).filter(Boolean).join('\n');

      await writeFile(filePath, lines.length > 0 ? lines + '\n' : '', 'utf8');

      const downloadUrl = `${process.env.FHIR_BASE_URL || 'https://api.mediqzy.com/api/fhir/r4'}/bulkdata/${jobId}/${filename}`;
      outputFiles.push({
        type: resourceType,
        url: downloadUrl,
        count: rows.length,
      });
    } catch (err) {
      console.error(`[fhir-bulk-export] Error exporting ${resourceType} for job ${jobId}:`, err);
      // Continue with other resource types; log but don't abort the whole job
      outputFiles.push({ type: resourceType, url: null, count: 0, error: err.message });
    }

    completed++;
    const progress = Math.round((completed / total) * 100);

    // Update progress in Redis after each resource type
    const currentState = await getExportStatus(jobId);
    if (currentState) {
      await saveJobState(jobId, { ...currentState, progress, output: outputFiles });
    }
  }

  // Mark complete
  const finalState = {
    jobId,
    status: 'complete',
    progress: 100,
    completedAt: new Date().toISOString(),
    resourceTypes,
    outputFormat: params.outputFormat || 'application/fhir+ndjson',
    initiatedBy: params.initiatedBy || 'anonymous',
    output: outputFiles,
    error: null,
    requiresAccessToken: true,
    transactionTime: new Date().toISOString(),
  };

  await saveJobState(jobId, finalState);
  return finalState;
}
