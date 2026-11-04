/**
 * report-extraction-benchmark.mjs  (Step 3 — shadow benchmark runner)
 * ===================================================================
 * Runs the shared extractor against real reports and stores the results in the SHADOW table
 * `report_extraction_candidates` (never clinical rows). Lets us compare the new LLM/OCR path
 * against the legacy output before any cutover.
 *
 * SAFE: read-only on clinical data; writes only the shadow table. It DOES make LLM calls and
 * download/decrypt report files, so keep --limit small.
 *
 * Usage (via the SSM loader, prod creds):
 *   node server/scripts/ssm-env-loader.mjs server/scripts/report-extraction-benchmark.mjs --limit 5
 *   node server/scripts/ssm-env-loader.mjs server/scripts/report-extraction-benchmark.mjs --report-id 142
 */

import pool from '../db/pgPool.js';
import Report from '../models/postgres/report.model.postgres.js';
import { downloadDecryptedReport } from '../services/minio-upload.service.js';
import { getCorporateReportClient, readCorporateReportFile } from '../services/corporate-report-storage-client.js';
import { extractReportObservations, EXTRACTION_VERSION } from '../services/report-extraction.service.js';

const args = process.argv.slice(2);
const getArg = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const limit = Number(getArg('--limit', '5'));
const onlyId = getArg('--report-id', null);

async function fetchBuffer(report) {
  const meta = report.metadata || {};
  const enc = meta.encryption || {};
  if (meta.storageBackend === 'corporate_minio' && !enc.iv) {
    return await readCorporateReportFile(report.filePath, meta.bucket);
  }
  const { buffer } = await downloadDecryptedReport({
    key: report.filePath, bucket: meta.bucket, iv: enc.iv, authTag: enc.authTag,
    compressionMethod: meta.compressionMethod, mimeType: report.mimeType,
    client: meta.storageBackend === 'corporate_minio' ? getCorporateReportClient() : undefined,
  });
  return buffer;
}

async function run() {
  const where = { status: 'active' };
  if (onlyId) where.id = Number(onlyId);
  const reports = await Report.findAll({ where, limit: onlyId ? 1 : limit, order: [['id', 'DESC']] });
  console.log(`\nBenchmark: ${reports.length} report(s), extractor ${EXTRACTION_VERSION}\n`);
  console.log('report  mime                 method          status     obs  conf~  ms');
  console.log('------  -------------------  --------------  ---------  ---  -----  -----');

  for (const r of reports) {
    if (!r.filePath) { console.log(`${String(r.id).padEnd(6)}  (no filePath — skipped)`); continue; }
    let buffer;
    try { buffer = await fetchBuffer(r); }
    catch (e) { console.log(`${String(r.id).padEnd(6)}  download failed: ${e.message.slice(0, 50)}`); continue; }

    const { status, observations, meta } = await extractReportObservations(buffer, r.mimeType, { reportId: r.id });
    const confs = observations.map((o) => o.confidence).filter((c) => typeof c === 'number');
    const avgConf = confs.length ? (confs.reduce((a, b) => a + b, 0) / confs.length).toFixed(2) : '—';

    await pool.query(
      `INSERT INTO report_extraction_candidates (report_id, engine, extraction_version, status, observation_count, observations, meta)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [r.id, meta.ocr_method || 'unknown', EXTRACTION_VERSION, status, observations.length,
       JSON.stringify(observations), JSON.stringify(meta)]
    );

    console.log(
      `${String(r.id).padEnd(6)}  ${String(r.mimeType || '').padEnd(19)}  ${String(meta.ocr_method || '').padEnd(14)}  ${status.padEnd(9)}  ${String(observations.length).padStart(3)}  ${String(avgConf).padStart(5)}  ${String(meta.latency_ms || '').padStart(5)}`
    );
  }
  console.log('\nStored in report_extraction_candidates (shadow). Inspect vs legacy before cutover.\n');
  process.exit(0);
}

run().catch((e) => { console.error('benchmark error:', e.message); process.exit(1); });
