/**
 * Typed group policies, and the family a policy member belongs to.
 *
 * A corporate employee can hold up to seven group policies at once — GHI, its
 * top-up, Parents GHI, its top-up, GPA, GTLI and OPD — and each has a
 * different claim route, so one generic "Insurance" card cannot serve them.
 * `insurance_policies` already carries policyType, sumInsured and the JSONB
 * bags, but nothing that lets a member be told when a top-up starts paying,
 * what a parent's co-pay is, what an accident policy pays for which event, or
 * who the nominee is.
 *
 * Two of the columns here are not conveniences, they are load-bearing:
 *
 *   policy_members."primaryMemberUserId" — whose family this member belongs
 *     to. A group policy covers every employee of the corporate, so without
 *     it "the members of my policy" is every employee's spouse and children.
 *     Returning that list to a member would disclose other families'
 *     dependants, their relations and their dates of birth. Every read of
 *     members[] filters on this column.
 *
 *   policy_members."userId" becomes NULLABLE, with "memberName" and
 *     "dateOfBirth" beside it. A covered parent or child usually has no
 *     account on the platform, so NOT NULL made them unrepresentable — which
 *     is why "is my mother covered?" had no answer to give.
 *
 * Everything is additive and nullable. An existing row keeps working: its
 * primary member defaults to its own userId in the backfill below, which is
 * correct for the 'self' rows that are all there is today.
 */
import pool from '../db/pgPool.js';

export async function up(db = pool) {
  await db.query(`
    ALTER TABLE insurance_policies
      ADD COLUMN IF NOT EXISTS "deductible" NUMERIC(14,2),
      ADD COLUMN IF NOT EXISTS "baseSumInsured" NUMERIC(14,2),
      ADD COLUMN IF NOT EXISTS "linkedBasePolicyId" INTEGER,
      ADD COLUMN IF NOT EXISTS "floater" BOOLEAN,
      ADD COLUMN IF NOT EXISTS "copayPercent" NUMERIC(6,2),
      ADD COLUMN IF NOT EXISTS "roomRentLimit" NUMERIC(14,2),
      ADD COLUMN IF NOT EXISTS "maternityCovered" BOOLEAN,
      ADD COLUMN IF NOT EXISTS "coverAmount" NUMERIC(14,2),
      ADD COLUMN IF NOT EXISTS "benefitSchedule" JSONB NOT NULL DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS "opLimits" JSONB NOT NULL DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS "voluntary" BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS "premiumPerYear" NUMERIC(14,2),
      ADD COLUMN IF NOT EXISTS "enrolmentFrom" DATE,
      ADD COLUMN IF NOT EXISTS "enrolmentTo" DATE,
      ADD COLUMN IF NOT EXISTS "policyDocumentUrl" TEXT,
      ADD COLUMN IF NOT EXISTS "claimFormUrl" TEXT;

    -- A top-up points at the policy whose sum insured is its deductible. Self
    -- reference, so a policy cannot be its own base.
    ALTER TABLE insurance_policies
      DROP CONSTRAINT IF EXISTS insurance_policies_linked_base_not_self;
    ALTER TABLE insurance_policies
      ADD CONSTRAINT insurance_policies_linked_base_not_self
      CHECK ("linkedBasePolicyId" IS NULL OR "linkedBasePolicyId" <> id);

    CREATE INDEX IF NOT EXISTS idx_insurance_policies_corporate_type
      ON insurance_policies ("corporateId", "policyType")
      WHERE "corporateId" IS NOT NULL;

    ALTER TABLE policy_members
      ADD COLUMN IF NOT EXISTS "primaryMemberUserId" INTEGER,
      ADD COLUMN IF NOT EXISTS "memberName" VARCHAR(255),
      ADD COLUMN IF NOT EXISTS "dateOfBirth" DATE,
      ADD COLUMN IF NOT EXISTS "nomineeName" VARCHAR(255),
      ADD COLUMN IF NOT EXISTS "nomineeRelation" VARCHAR(60),
      ADD COLUMN IF NOT EXISTS "nomineeUpdatedAt" TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS "memberCardNumber" VARCHAR(80);
  `);

  // Existing rows are all 'self': the member is their own family's primary.
  // Done before the column is used for filtering, so no row is invisible.
  await db.query(`
    UPDATE policy_members
       SET "primaryMemberUserId" = "userId"
     WHERE "primaryMemberUserId" IS NULL AND "userId" IS NOT NULL
  `);

  await db.query(`
    ALTER TABLE policy_members ALTER COLUMN "userId" DROP NOT NULL;

    -- A row must identify a person one way or the other, or it is a covered
    -- nobody: an account, or a name for a dependant who has none.
    ALTER TABLE policy_members
      DROP CONSTRAINT IF EXISTS policy_members_identifies_someone;
    ALTER TABLE policy_members
      ADD CONSTRAINT policy_members_identifies_someone
      CHECK ("userId" IS NOT NULL OR NULLIF(btrim("memberName"), '') IS NOT NULL);

    CREATE INDEX IF NOT EXISTS idx_policy_members_primary
      ON policy_members ("primaryMemberUserId", "policyId")
      WHERE "primaryMemberUserId" IS NOT NULL;

    CREATE UNIQUE INDEX IF NOT EXISTS uq_policy_members_card
      ON policy_members ("memberCardNumber")
      WHERE "memberCardNumber" IS NOT NULL;
  `);
}

export async function down(db = pool) {
  await db.query(`
    DROP INDEX IF EXISTS uq_policy_members_card;
    DROP INDEX IF EXISTS idx_policy_members_primary;
    DROP INDEX IF EXISTS idx_insurance_policies_corporate_type;

    ALTER TABLE policy_members DROP CONSTRAINT IF EXISTS policy_members_identifies_someone;
    ALTER TABLE insurance_policies DROP CONSTRAINT IF EXISTS insurance_policies_linked_base_not_self;

    ALTER TABLE policy_members
      DROP COLUMN IF EXISTS "primaryMemberUserId",
      DROP COLUMN IF EXISTS "memberName",
      DROP COLUMN IF EXISTS "dateOfBirth",
      DROP COLUMN IF EXISTS "nomineeName",
      DROP COLUMN IF EXISTS "nomineeRelation",
      DROP COLUMN IF EXISTS "nomineeUpdatedAt",
      DROP COLUMN IF EXISTS "memberCardNumber";

    ALTER TABLE insurance_policies
      DROP COLUMN IF EXISTS "deductible",
      DROP COLUMN IF EXISTS "baseSumInsured",
      DROP COLUMN IF EXISTS "linkedBasePolicyId",
      DROP COLUMN IF EXISTS "floater",
      DROP COLUMN IF EXISTS "copayPercent",
      DROP COLUMN IF EXISTS "roomRentLimit",
      DROP COLUMN IF EXISTS "maternityCovered",
      DROP COLUMN IF EXISTS "coverAmount",
      DROP COLUMN IF EXISTS "benefitSchedule",
      DROP COLUMN IF EXISTS "opLimits",
      DROP COLUMN IF EXISTS "voluntary",
      DROP COLUMN IF EXISTS "premiumPerYear",
      DROP COLUMN IF EXISTS "enrolmentFrom",
      DROP COLUMN IF EXISTS "enrolmentTo",
      DROP COLUMN IF EXISTS "policyDocumentUrl",
      DROP COLUMN IF EXISTS "claimFormUrl";
  `);
  // userId is left nullable: restoring NOT NULL would fail on any dependant
  // row created since, and deleting those rows to satisfy it is not a
  // migration's call.
}

if ((process.argv[1] || '').includes('20261111000300-typed-group-policies')) {
  up().then(() => { console.log('typed group policies applied'); process.exit(0); })
      .catch((error) => { console.error(error); process.exit(1); });
}
