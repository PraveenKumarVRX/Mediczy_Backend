/**
 * Points policy_members and policy_rules at the table they actually mean, and
 * gives a claim the policy it was made against.
 *
 * Three faults, all found by running the seed rather than reading the code:
 *
 * 1. policy_members."policyId" and policy_rules."policyId" both carried
 *    `REFERENCES insurance_policy_products(id)`. Their only writer,
 *    routes/insurance-policy.route.js, looks the parent up with
 *    `InsurancePolicy.findByPk(req.params.policyId)` and then inserts that id
 *    — an insurance_policies id — into both tables. So neither insert could
 *    ever succeed, and both tables are empty for that reason rather than for
 *    want of use. insurance_policy_products is a product catalogue: name,
 *    code, coverage and premium, with no policy number, no corporate and no
 *    dates. A "member of a product", holding their own sumInsuredUsed and
 *    coverage window, is not a thing that table can parent.
 *
 *    user_insurances also references the catalogue and is left alone: that one
 *    is correct. A patient holds a product, and insurance_claims.user_insurance_id
 *    completes that chain.
 *
 * 2. insurance_claims has no policy id at all — only a free-text
 *    `policy_number` — so claims could not be listed per policy, which the
 *    policy-detail screen needs. A nullable policy_id is added and backfilled
 *    from policy_number where it resolves to exactly one policy.
 *
 * Both repointed constraints are verified before they are replaced: a row that
 * would be orphaned aborts the migration rather than being deleted.
 */
import pool from '../db/pgPool.js';

const REPOINT = [
  { table: 'policy_members', constraint: 'policy_members_policyId_fkey', onDelete: 'CASCADE' },
  { table: 'policy_rules', constraint: 'policy_rules_policyId_fkey', onDelete: 'CASCADE' },
];

export async function up(db = pool) {
  for (const { table, constraint, onDelete } of REPOINT) {
    const { rows } = await db.query(
      `SELECT count(*)::int AS orphans
         FROM "${table}" t
        WHERE t."policyId" IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM insurance_policies p WHERE p.id = t."policyId")`
    );
    const orphans = rows[0]?.orphans ?? 0;
    if (orphans > 0) {
      throw new Error(
        `${table} has ${orphans} row(s) whose policyId is not an insurance_policies id. `
        + 'Repointing the foreign key would reject them. Resolve them first; this migration will not delete data.'
      );
    }

    await db.query(`
      ALTER TABLE "${table}" DROP CONSTRAINT IF EXISTS "${constraint}";
      ALTER TABLE "${table}"
        ADD CONSTRAINT "${constraint}"
        FOREIGN KEY ("policyId") REFERENCES insurance_policies (id) ON DELETE ${onDelete};
    `);
  }

  await db.query(`
    ALTER TABLE insurance_claims
      ADD COLUMN IF NOT EXISTS policy_id INTEGER;

    -- Nullable and ON DELETE SET NULL: a claim is a record of something that
    -- happened and must survive the policy row being removed.
    ALTER TABLE insurance_claims DROP CONSTRAINT IF EXISTS insurance_claims_policy_id_fkey;
    ALTER TABLE insurance_claims
      ADD CONSTRAINT insurance_claims_policy_id_fkey
      FOREIGN KEY (policy_id) REFERENCES insurance_policies (id) ON DELETE SET NULL;

    CREATE INDEX IF NOT EXISTS idx_insurance_claims_policy
      ON insurance_claims (policy_id, patient_id)
      WHERE policy_id IS NOT NULL;
  `);

  // Only where the number identifies exactly one policy. A number shared by
  // two policies is left for a human: attaching a claim to the wrong policy
  // moves money against the wrong sum insured.
  await db.query(`
    UPDATE insurance_claims c
       SET policy_id = p.id
      FROM insurance_policies p
     WHERE c.policy_id IS NULL
       AND c.policy_number IS NOT NULL
       AND btrim(c.policy_number) = btrim(p."policyNumber")
       AND (SELECT count(*) FROM insurance_policies x
             WHERE btrim(x."policyNumber") = btrim(c.policy_number)) = 1
  `);
}

export async function down(db = pool) {
  for (const { table, constraint, onDelete } of REPOINT) {
    await db.query(`
      ALTER TABLE "${table}" DROP CONSTRAINT IF EXISTS "${constraint}";
      ALTER TABLE "${table}"
        ADD CONSTRAINT "${constraint}"
        FOREIGN KEY ("policyId") REFERENCES insurance_policy_products (id) ON DELETE ${onDelete};
    `);
  }
  await db.query(`
    DROP INDEX IF EXISTS idx_insurance_claims_policy;
    ALTER TABLE insurance_claims DROP CONSTRAINT IF EXISTS insurance_claims_policy_id_fkey;
    ALTER TABLE insurance_claims DROP COLUMN IF EXISTS policy_id;
  `);
}

if ((process.argv[1] || '').includes('20261111000400-policy-member-foreign-keys')) {
  up().then(() => { console.log('policy member foreign keys applied'); process.exit(0); })
      .catch((error) => { console.error(error.message); process.exit(1); });
}
