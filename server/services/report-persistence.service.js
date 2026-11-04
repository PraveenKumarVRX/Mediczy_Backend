/**
 * report-persistence.service.js  (WP3 Stage B — the single canonical observation writer)
 * =======================================================================================
 * Writes extracted observations to the canonical `lab_results` table with full identity
 * (subject/org uids via the entity registry), provenance (page/source/confidence), canonical
 * coding and verification state. Upserts on the org/subject/document scoped key so concurrent or
 * repeated ingest never produces duplicate clinical rows.
 *
 * Stage B contract: everything is written with verification_status='pending'. Nothing here flips a
 * consumer to read these rows — that is Stage C (the verify gate + verified-only reads). This writer
 * is called only behind REPORT_EXTRACTION_DUAL_WRITE while it is shadow-validated.
 */

import pool from '../db/pgPool.js';
import { resolveReportSubject } from './report-identity.service.js';

const ABNORMAL = /^(h|l|hh|ll|high|low|critical|crit|abnormal|a|\*|positive|reactive)$/i;
const isAbnormalFlag = (flag) => (flag ? ABNORMAL.test(String(flag).trim()) : false);

/**
 * @param {object} args
 * @param {number} args.reportId
 * @param {number} args.userId
 * @param {number} [args.corporateId]
 * @param {number} [args.tenantId]
 * @param {string} args.documentHash         sha256 of the source document (from the extractor meta)
 * @param {number} [args.documentVersion=1]
 * @param {Array}  args.observations          the extractor's observation contract array
 * @param {object} [args.meta]                extractor meta (ocr_method, …)
 * @param {object} [db=pool]
 * @returns {Promise<{written:number, subject:object}>}
 */
export async function persistObservations(args, db = pool) {
  const { reportId, userId, corporateId = null, tenantId = null,
    documentHash, documentVersion = 1, observations = [], meta = {} } = args;
  if (!userId || !documentHash || !observations.length) return { written: 0, subject: null };

  const subject = await resolveReportSubject({ userId, corporateId, tenantId }, db);
  // Resolve the integer patient_id (compat column) from the patient uid when one exists.
  let patientId = null;
  if (subject.patient_uid) {
    const { rows } = await db.query(`SELECT id FROM patients WHERE unique_id=$1 LIMIT 1`, [subject.patient_uid]);
    patientId = rows[0]?.id ?? null;
  }
  const reportDate = args.reportDate || null;
  const ocrMethod = meta.ocr_method || null;

  const client = await db.connect();
  let written = 0;
  try {
    await client.query('BEGIN');
    for (const o of observations) {
      const testName = (o.canonical_name || o.raw_name || 'Unknown').toString().slice(0, 255);
      await client.query(
        `INSERT INTO lab_results
           ("reportId","userId",patient_id,subject_uid,subject_kind,organization_uid,patient_uid,
            "testName",canonical_name,loinc_code,"value","numericValue",unit,"referenceRange",flag,"isAbnormal",
            confidence,page,source_text,ocr_method,extraction_method,verification_status,
            document_hash,document_version,"reportDate","createdAt","updatedAt")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,'llm','pending',$21,$22,$23,NOW(),NOW())
         ON CONFLICT (organization_uid, subject_uid, document_hash, document_version, COALESCE(canonical_name, "testName"))
         DO UPDATE SET "value"=EXCLUDED."value", "numericValue"=EXCLUDED."numericValue", unit=EXCLUDED.unit,
            "referenceRange"=EXCLUDED."referenceRange", flag=EXCLUDED.flag, "isAbnormal"=EXCLUDED."isAbnormal",
            canonical_name=EXCLUDED.canonical_name, loinc_code=EXCLUDED.loinc_code, confidence=EXCLUDED.confidence,
            page=EXCLUDED.page, source_text=EXCLUDED.source_text, "updatedAt"=NOW()`,
        [reportId, userId, patientId, subject.subject_uid, subject.subject_kind, subject.organization_uid, subject.patient_uid,
         testName, o.canonical_name || null, o.loinc_code || null,
         (o.raw_value == null ? '' : String(o.raw_value)).slice(0, 255),
         (typeof o.typed_value === 'number' ? o.typed_value : null),
         (o.unit_original || null), (o.reference_range_source || null), (o.flag_source || null), isAbnormalFlag(o.flag_source),
         (typeof o.confidence === 'number' ? o.confidence : null), (Number.isInteger(o.page) ? o.page : null),
         (o.source_text || null), ocrMethod, documentHash, documentVersion, reportDate]
      );
      written++;
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  return { written, subject };
}

export default { persistObservations };
