/**
 * Versioned guideline objects (P8 of CLINICAL_AI_PLATFORM_V1_IMPLEMENTATION_ROADMAP.md).
 *
 * Before this, "guidelines" in the Evidence Bundle (P2) was just the string
 * "See knowledge base PATH-..." pulled off a matched clinical rule — a
 * pointer, not a real, versioned, sourced guideline object with its own
 * organization/publication date/review status. This is that real object,
 * for the one pathway a genuinely matching, citable guideline exists for.
 *
 * Deliberately one real entry, not padded coverage: WebSearch (2026-08-23)
 * found a precise match for the BraTS tumor_flag pathway (ACR
 * Appropriateness Criteria Brain Tumors, 2025) but no equally precise ACR
 * guideline for incidental ventricular-asymmetry follow-up specifically —
 * only tangential ones about hydrocephalus/dementia workup that don't
 * actually address this pipeline's use case (an incidental volumetric
 * asymmetry finding, not a hydrocephalus/dementia work-up). Forcing a loose
 * citation to look complete would be exactly the kind of fabricated
 * coverage this whole codebase's KB content has avoided — the
 * ventricular_asymmetry pathway keeps only its existing informal KB
 * reference until a real, precisely-applicable guideline is found.
 */
import pool from '../../db/pgPool.js';

import { schemaVerifier, guardedQuery } from '../../utils/schema-guard.js';
const SCHEMA_TABLES = ['imaging_guidelines'];

// Owned by the migration, verified here. Creating these on demand would let a
// skipped migration look healthy on tables without its indexes and constraints.
const ensureTable = schemaVerifier({
  pool,
  tables: SCHEMA_TABLES,
  code: 'SCHEMA_NOT_MIGRATED',
  message: 'Apply migration 20261015004600-imaging-ops-governance before using imaging guidelines',
});

// Queries fail closed on a missing table, and the check above also runs at
// startup so an unmigrated environment shows up in the log rather than only
// when a request arrives.
const guardedPool = guardedQuery(pool, 'Apply migration 20261015004600-imaging-ops-governance before using imaging guidelines');

const SEED_GUIDELINES = [
  {
    guidelineId: 'ACR-AC-BRAIN-TUMORS-2025',
    pathway: 'tumor_flag',
    title: 'ACR Appropriateness Criteria® Brain Tumors',
    organization: 'American College of Radiology',
    publicationDate: '2025-01-01',
    version: '2025',
    jurisdiction: 'US',
    population: 'Adult and pediatric patients with known or suspected brain tumor',
    reviewStatus: 'current',
    sourceUrl: 'https://www.jacr.org/article/S1546-1440(25)00142-5/fulltext',
    summary:
      'Conventional MRI is the reference standard for brain tumor surveillance imaging. For posttreatment ' +
      'surveillance (Variant 5), MRI head with and without IV contrast (and MRI head perfusion with IV contrast) ' +
      'are rated Usually Appropriate. WHO grade 1 tumors are typically followed with contrast-enhanced MRI every ' +
      '6-12 months, with frequency optimized by histologic/molecular profiling. Six variants cover genetic-risk ' +
      'screening, metastasis screening, pretreatment evaluation, and posttreatment surveillance separately — this ' +
      'summary reflects only the posttreatment-surveillance variant, the one this pipeline\'s tumor_flag pathway is relevant to.',
    retrievedAt: '2026-08-23',
  },
];

export async function seedGuidelines() {
  for (const g of SEED_GUIDELINES) {
    await guardedPool(
      `INSERT INTO imaging_guidelines
         (guideline_id, pathway, title, organization, publication_date, version, jurisdiction, population, review_status, source_url, summary, retrieved_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (guideline_id) DO UPDATE SET
         title = EXCLUDED.title, organization = EXCLUDED.organization, publication_date = EXCLUDED.publication_date,
         version = EXCLUDED.version, jurisdiction = EXCLUDED.jurisdiction, population = EXCLUDED.population,
         review_status = EXCLUDED.review_status, source_url = EXCLUDED.source_url, summary = EXCLUDED.summary,
         retrieved_at = EXCLUDED.retrieved_at`,
      [g.guidelineId, g.pathway, g.title, g.organization, g.publicationDate, g.version, g.jurisdiction, g.population, g.reviewStatus, g.sourceUrl, g.summary, g.retrievedAt],
    );
  }
  return SEED_GUIDELINES.length;
}

export async function getGuidelinesForPathway(pathway) {
  const { rows } = await guardedPool(
    `SELECT * FROM imaging_guidelines WHERE pathway = $1 AND review_status = 'current'`,
    [pathway],
  );
  return rows;
}
