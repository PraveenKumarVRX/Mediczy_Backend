/**
 * Phase 2: Enterprise search — OpenSearch with Postgres full-text fallback.
 */
import pool from '../../db/pgPool.js';

const OPENSEARCH_URL = process.env.OPENSEARCH_URL || process.env.ELASTICSEARCH_URL || '';

async function opensearchQuery(index, body) {
  if (!OPENSEARCH_URL) return null;
  const res = await fetch(`${OPENSEARCH_URL.replace(/\/$/, '')}/${index}/_search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) return null;
  return res.json();
}

export async function indexStudyDocument(doc) {
  if (!OPENSEARCH_URL) return { indexed: false, backend: 'postgres' };
  try {
    const id = `${doc.tenantId}:${doc.studyInstanceUID}`;
    await fetch(`${OPENSEARCH_URL}/imaging-studies/_doc/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tenant_id: doc.tenantId,
        study_instance_uid: doc.studyInstanceUID,
        patient_name: doc.patientName,
        modality: doc.modality,
        findings: doc.findings || '',
        impression: doc.impression || '',
        report_text: doc.reportText || '',
        study_date: doc.studyDate,
        indexed_at: new Date().toISOString(),
      }),
    });
    return { indexed: true, backend: 'opensearch' };
  } catch {
    return { indexed: false, backend: 'postgres' };
  }
}

export async function searchImaging(tenantId, query, { limit = 20 } = {}) {
  if (OPENSEARCH_URL) {
    const result = await opensearchQuery('imaging-studies', {
      size: limit,
      query: {
        bool: {
          must: [
            { term: { tenant_id: tenantId } },
            {
              multi_match: {
                query,
                fields: ['patient_name', 'findings', 'impression', 'report_text', 'modality'],
                fuzziness: 'AUTO',
              },
            },
          ],
        },
      },
    });
    if (result?.hits?.hits) {
      return result.hits.hits.map((h) => ({ score: h._score, ...h._source }));
    }
  }

  const r = await pool.query(
    `SELECT id, patient_name, modality, study_date, study_instance_uid, report_text, study_description
     FROM ris_studies
     WHERE lab_id = $1
       AND (
         patient_name ILIKE $2 OR report_text ILIKE $2 OR study_description ILIKE $2
         OR study_instance_uid ILIKE $2 OR modality ILIKE $2
       )
     ORDER BY created_at DESC LIMIT $3`,
    [tenantId, `%${query}%`, limit],
  );
  return r.rows.map((row) => ({ ...row, backend: 'postgres' }));
}
