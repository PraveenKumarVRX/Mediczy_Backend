/**
 * Medical-director approval of the clinical knowledge base.
 *
 * Dr. iSHA is fail-closed: `ai-engine/doctor_bot/app.py` refuses to answer
 * without retrieved evidence, and `sib/retrieval/unified_rag.py` only returns a
 * chunk whose document is approved, versioned, in-review-date and hash-verified.
 * With nothing approved, every question gets
 * "I could not retrieve supporting medical information for this question."
 *
 * This script does not invent an approval. It drives the existing workflow in
 * services/medical-knowledge-review.js, which enforces:
 *   - the reviewer holds the medical_director role
 *   - the reviewer has a registered 6-character UID (the entity-UID rule)
 *   - the approved content hash matches the chunks as they are RIGHT NOW, so a
 *     document that changes after approval stops being retrievable until it is
 *     reviewed again
 *
 * Usage (preview first, always):
 *   node scripts/ssm-env-loader.mjs scripts/ops/approve-medical-knowledge.mjs \
 *     --reviewer-uid=XXXXXX --version="2026-11 initial clinical set" \
 *     --due=2027-11-08 --ids=3,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19 --dry-run
 *
 * Drop --dry-run to apply. Every approval is written to the document's
 * metadata.medical_review and appended to metadata.medical_review_history.
 */
import dotenv from 'dotenv';
dotenv.config();
import pool from '../../db/pgPool.js';
import { previewMedicalKnowledge, reviewMedicalKnowledge } from '../../services/medical-knowledge-review.js';

const arg = (name, fallback = null) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const has = (name) => process.argv.includes(`--${name}`);

/**
 * Documents excluded from the default set, with the reason. Kept explicit so
 * the exclusion is reviewable rather than silent.
 */
const EXCLUDED = {
  1: 'status=processing, 0 chunks — nothing to retrieve (duplicate of 3)',
  2: 'status=processing, 0 chunks — nothing to retrieve (duplicate of 3)',
  4: '"Test efficiency fix" is an engineering note about the FastAPI event loop, not clinical content',
};

async function main() {
  const reviewerUid = String(arg('reviewer-uid') || '').toUpperCase();
  const version = arg('version');
  const due = arg('due');
  const dryRun = has('dry-run');
  const role = arg('role', 'medical_director');

  if (!/^[A-Z0-9]{6}$/.test(reviewerUid)) {
    throw new Error('--reviewer-uid must be the reviewer\'s registered 6-character UID (e.g. DFD1F2)');
  }
  if (!version) throw new Error('--version is required (what source/edition is being approved)');
  if (!due || !Number.isFinite(new Date(due).getTime()) || new Date(due) <= new Date()) {
    throw new Error('--due must be a future date, e.g. --due=2027-11-08');
  }

  const requested = arg('ids');
  let ids;
  if (requested) {
    ids = requested.split(',').map((n) => Number(n.trim())).filter(Number.isInteger);
  } else {
    const { rows } = await pool.query(
      `SELECT id FROM ai_knowledge_documents WHERE scope='global' AND status='ready' ORDER BY id`
    );
    ids = rows.map((r) => r.id).filter((id) => !EXCLUDED[id]);
  }

  console.log(`Reviewer UID : ${reviewerUid} (role: ${role})`);
  console.log(`Version      : ${version}`);
  console.log(`Review due   : ${new Date(due).toISOString().slice(0, 10)}`);
  console.log(`Documents    : ${ids.join(', ')}`);
  for (const [id, why] of Object.entries(EXCLUDED)) {
    if (!ids.includes(Number(id))) console.log(`  excluded ${id}: ${why}`);
  }
  console.log(dryRun ? '\nDRY RUN — nothing will be written.\n' : '\nAPPLYING.\n');

  let approved = 0;
  const failures = [];
  for (const id of ids) {
    try {
      // Preview computes the fingerprint over the chunks as they stand; the
      // approval then has to match it, so content cannot change in between.
      const preview = await previewMedicalKnowledge(pool, { id, role });
      const title = String(preview.title || '').slice(0, 54);
      if (dryRun) {
        console.log(`  would approve ${String(id).padStart(3)}  ${preview.fingerprint.slice(0, 12)}…  ${title}`);
        approved++;
        continue;
      }
      const result = await reviewMedicalKnowledge(pool, {
        id, status: 'approved', version, dueAt: due, reviewerUid, role,
        expectedFingerprint: preview.fingerprint,
      });
      console.log(`  approved ${String(id).padStart(3)}  due ${new Date(result.review_due_at).toISOString().slice(0, 10)}  ${title}`);
      approved++;
    } catch (error) {
      console.error(`  FAILED   ${String(id).padStart(3)}  ${error.message}`);
      failures.push({ id, message: error.message });
    }
  }

  console.log(`\n${dryRun ? 'Would approve' : 'Approved'}: ${approved}/${ids.length}`);
  if (failures.length) {
    console.log('Failures:');
    for (const f of failures) console.log(`  ${f.id}: ${f.message}`);
  }

  if (!dryRun && approved) {
    const { rows } = await pool.query(
      `SELECT count(*)::int retrievable FROM ai_knowledge_documents d
        WHERE d.status='ready' AND d.review_status='approved'
          AND d.review_due_at > NOW() AND d.source_version IS NOT NULL
          AND d.approved_content_hash = (
            SELECT encode(sha256(convert_to(COALESCE(string_agg(c.content, chr(10) ORDER BY c.chunk_index, c.id), ''), 'UTF8')), 'hex')
              FROM ai_document_chunks c WHERE c.document_id = d.id)`
    );
    console.log(`\nRetrievable by Dr. iSHA now: ${rows[0].retrievable} document(s).`);
  }

  process.exit(failures.length ? 1 : 0);
}

main().catch((error) => {
  console.error('approve-medical-knowledge failed:', error.message);
  process.exit(1);
});
