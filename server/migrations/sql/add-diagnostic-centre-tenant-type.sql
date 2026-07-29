-- Add diagnostic_centre to tenants.type ENUM.
-- Must run as the OWNER of type enum_tenants_type (or a superuser / RDS master).
--
-- Find owner:
--   SELECT t.typname, r.rolname AS owner
--   FROM pg_type t JOIN pg_roles r ON r.oid = t.typowner
--   WHERE t.typname = 'enum_tenants_type';
--
-- Then (as that role):
ALTER TYPE "enum_tenants_type" ADD VALUE IF NOT EXISTS 'diagnostic_centre';

-- Optional: let the app role manage this ENUM going forward
-- ALTER TYPE "enum_tenants_type" OWNER TO mediczy_ai;
