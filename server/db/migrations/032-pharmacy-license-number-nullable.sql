-- Pharmacy registration currently allows applications before license review.
-- Keep this as an explicit migration instead of mutating schema at route import time.
ALTER TABLE pharmacies
  ALTER COLUMN "licenseNumber" DROP NOT NULL;
