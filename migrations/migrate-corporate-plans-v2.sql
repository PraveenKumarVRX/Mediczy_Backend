-- Migration: Corporate Plans - Make doctor, lab, hospital plan-dependent
-- Allow multiple plans per corporate with validity periods
-- Date: 2026-02-12
-- Using snake_case column names to match existing schema
-- Step 1: Add clinic_id and doctor_id to corporate_plan_sponsorships
ALTER TABLE corporate_plan_sponsorships
ADD COLUMN IF NOT EXISTS clinic_id INTEGER,
    ADD COLUMN IF NOT EXISTS doctor_id INTEGER;
-- Step 2: Add sponsorship_id to tenant_partners to link partners to specific plans
ALTER TABLE tenant_partners
ADD COLUMN IF NOT EXISTS sponsorship_id INTEGER;
-- Step 3: Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_tenant_partners_sponsorship ON tenant_partners(sponsorship_id);
CREATE INDEX IF NOT EXISTS idx_corporate_plan_sponsorships_corp ON corporate_plan_sponsorships(corporate_id);
-- Step 4: Verification query
SELECT 'Migration completed' as status,
    'Added clinic_id, doctor_id to corporate_plan_sponsorships' as detail1,
    'Added sponsorship_id to tenant_partners' as detail2;