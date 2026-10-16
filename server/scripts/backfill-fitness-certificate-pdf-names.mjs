/**
 * Rename PDFs created before the descriptive fitness-certificate filename
 * contract was introduced.
 *
 * Dry-run by default:
 *   NODE_ENV=production node scripts/ssm-env-loader.mjs scripts/backfill-fitness-certificate-pdf-names.mjs
 * Apply explicitly:
 *   ... backfill-fitness-certificate-pdf-names.mjs --apply
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from '../db/pgPool.js';
import {
  fitnessCertificatePdfPath,
  fitnessCertificatePdfFileName,
  legacyFitnessCertificatePdfPath,
} from '../services/fitness-certificate-pdf.service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PDF_DIR = path.join(__dirname, '../public/pdfs/fitness-certificates');
const apply = process.argv.includes('--apply');

const { rows } = await pool.query(
  `SELECT id, patient_id, employee_id, signed_at, created_at
     FROM fitness_certificates
    ORDER BY id`
);
const byId = new Map(rows.map((row) => [String(row.id), row]));
const legacyFiles = fs.existsSync(PDF_DIR)
  ? fs.readdirSync(PDF_DIR).filter((name) => /^fitness-cert-[0-9]+\.pdf$/.test(name))
  : [];

let renamed = 0;
let skipped = 0;
let missingRows = 0;
let collisions = 0;

for (const name of legacyFiles) {
  const id = name.slice('fitness-cert-'.length, -'.pdf'.length);
  const cert = byId.get(id);
  if (!cert) {
    missingRows += 1;
    console.warn(`[fitness-pdf] no database row for ${name}; leaving it untouched`);
    continue;
  }

  const source = legacyFitnessCertificatePdfPath(cert.id);
  const target = fitnessCertificatePdfPath(cert);
  if (source === target || fs.existsSync(target)) {
    skipped += 1;
    if (source !== target && fs.existsSync(target)) {
      collisions += 1;
      console.error(`[fitness-pdf] target already exists; leaving ${name} untouched: ${fitnessCertificatePdfFileName(cert)}`);
    }
    continue;
  }

  console.log(`${apply ? 'rename' : 'would rename'} ${name} -> ${fitnessCertificatePdfFileName(cert)}`);
  if (apply) fs.renameSync(source, target);
  renamed += 1;
}

console.log(JSON.stringify({ apply, legacyFiles: legacyFiles.length, renamed, skipped, missingRows, collisions }));
await pool.end();
if (collisions > 0) process.exitCode = 1;
