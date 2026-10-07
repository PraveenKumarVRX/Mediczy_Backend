-- One active corporate_admin per corporate, keyed on the corporate's UID.  (2026-10-07)
--
-- idx_one_active_corporate_admin_per_org is keyed on users.organization_id, an integer that holds a tenants id for
-- some users and a corporates id for others. Ninjacart had two active admins that it could not see because their
-- organization_id values differed (58 vs 49) for the same corporate (CMR4ET). This is the same rule on the unambiguous key.
--
-- MUST be applied AFTER scripts/ops/make-corporate-super-hr.mjs --apply: it fails (23505) while two active admins
-- exist, which is the point, and the checked runner then rolls everything back.
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_corporate_admin_per_org_uid
  ON users (organization_uid)
  WHERE role::text = 'corporate_admin' AND status = 'active'::enum_users_status AND organization_uid IS NOT NULL;
