-- Migration: Corporate Plans - Make doctor, lab, hospital plan-dependent
-- Allow multiple plans per corporate with validity periods
-- Date: 2026-02-12
-- Step 1: Add clinicId and doctorId to corporate_plan_sponsorships
ALTER TABLE corporate_plan_sponsorships
ADD COLUMN IF NOT EXISTS "clinicId" INTEGER,
    ADD COLUMN IF NOT EXISTS "doctorId" INTEGER;
-- Step 2: Add sponsorshipId to tenant_partners to link partners to specific plans
ALTER TABLE tenant_partners
ADD COLUMN IF NOT EXISTS "sponsorshipId" INTEGER;
-- Step 3: Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_tenant_partners_sponsorship ON tenant_partners("sponsorshipId");
CREATE INDEX IF NOT EXISTS idx_corporate_plan_sponsorships_corporate ON corporate_plan_sponsorships("corporateId");
-- Step 4: Add foreign key constraints
ALTER TABLE corporate_plan_sponsorships
ADD CONSTRAINT fk_clinic FOREIGN KEY ("clinicId") REFERENCES clinics(id) ON DELETE
SET NULL,
    ADD CONSTRAINT fk_doctor FOREIGN KEY ("doctorId") REFERENCES users(id) ON DELETE
SET NULL;
ALTER TABLE tenant_partners
ADD CONSTRAINT fk_sponsorship FOREIGN KEY ("sponsorshipId") REFERENCES corporate_plan_sponsorships(id) ON DELETE CASCADE;
-- Step 5: Migrate existing data
-- For existing corporates with metadata.clinicId, doctorId, membershipPlanId
-- Move them to the corporate_plan_sponsorships table
DO $$
DECLARE corp RECORD;
sponsorship_id INTEGER;
BEGIN FOR corp IN
SELECT id,
    "assignedTo",
    metadata
FROM corporates
WHERE metadata IS NOT NULL
    AND (
        (metadata->>'membershipPlanId') IS NOT NULL
        OR (metadata->>'clinicId') IS NOT NULL
        OR (metadata->>'doctorId') IS NOT NULL
    ) LOOP -- Check if sponsorship already exists
SELECT id INTO sponsorship_id
FROM corporate_plan_sponsorships
WHERE "corporateId" = corp.id
LIMIT 1;
IF sponsorship_id IS NOT NULL THEN -- Update existing sponsorship with clinic and doctor
UPDATE corporate_plan_sponsorships
SET "clinicId" = NULLIF((corp.metadata->>'clinicId')::INTEGER, 0),
    "doctorId" = NULLIF((corp.metadata->>'doctorId')::INTEGER, 0)
WHERE id = sponsorship_id;
ELSIF (corp.metadata->>'membershipPlanId') IS NOT NULL THEN -- Create new sponsorship if plan exists in metadata
INSERT INTO corporate_plan_sponsorships (
        "corporateId",
        "planId",
        "clinicId",
        "doctorId",
        "sponsorshipType",
        "coveragePercentage",
        "startDate",
        "endDate",
        status,
        "createdAt",
        "updatedAt"
    )
VALUES (
        corp.id,
        (corp.metadata->>'membershipPlanId')::INTEGER,
        NULLIF((corp.metadata->>'clinicId')::INTEGER, 0),
        NULLIF((corp.metadata->>'doctorId')::INTEGER, 0),
        'full',
        100,
        NOW(),
        NOW() + INTERVAL '1 year',
        'active',
        NOW(),
        NOW()
    )
RETURNING id INTO sponsorship_id;
END IF;
-- Migrate network partners to be linked to the sponsorship
IF sponsorship_id IS NOT NULL THEN
UPDATE tenant_partners
SET "sponsorshipId" = sponsorship_id
WHERE "tenantId" = corp.id
    AND "tenantType" = 'corporate'
    AND "sponsorshipId" IS NULL;
END IF;
END LOOP;
END $$;
-- Step 6: Clean up old metadata fields (optional - keep for backward compatibility)
-- UPDATE corporates SET metadata = metadata - 'clinicId' - 'doctorId' - 'membershipPlanId' WHERE metadata IS NOT NULL;
-- Verify migration
SELECT 'Migration Summary' as report,
    (
        SELECT COUNT(*)
        FROM corporate_plan_sponsorships
    ) as total_sponsorships,
    (
        SELECT COUNT(*)
        FROM corporate_plan_sponsorships
        WHERE "clinicId" IS NOT NULL
    ) as with_clinic,
    (
        SELECT COUNT(*)
        FROM corporate_plan_sponsorships
        WHERE "doctorId" IS NOT NULL
    ) as with_doctor,
    (
        SELECT COUNT(*)
        FROM tenant_partners
        WHERE "sponsorshipId" IS NOT NULL
    ) as partners_linked_to_plans;