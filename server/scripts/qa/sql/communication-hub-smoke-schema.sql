-- Minimal schema for Communication Hub live API smoke tests.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  uid UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
  unique_id VARCHAR(6),
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255),
  "firstName" VARCHAR(100) NOT NULL DEFAULT 'Smoke',
  "lastName" VARCHAR(100) NOT NULL DEFAULT 'Team',
  role VARCHAR(50) DEFAULT 'team',
  status VARCHAR(50) DEFAULT 'active',
  "isAdmin" BOOLEAN DEFAULT FALSE,
  "isTeam" BOOLEAN DEFAULT FALSE,
  "isActive" BOOLEAN DEFAULT TRUE,
  membership_type VARCHAR(50) DEFAULT 'team',
  metadata JSONB DEFAULT '{}'::jsonb,
  organization_id INTEGER,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS unique_id VARCHAR(6);

CREATE TABLE IF NOT EXISTS corporates (
  id SERIAL PRIMARY KEY,
  "companyName" VARCHAR(255) NOT NULL DEFAULT 'Smoke Corporate',
  "contactPerson" VARCHAR(255),
  email VARCHAR(255),
  "phoneNumber" VARCHAR(50),
  industry VARCHAR(100),
  "employeeCount" INTEGER DEFAULT 0,
  "packageType" VARCHAR(100),
  status VARCHAR(50) DEFAULT 'Pending',
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO corporates (id, "companyName", status)
VALUES (1, 'Smoke Corporate', 'Pending')
ON CONFLICT (id) DO UPDATE SET "companyName" = EXCLUDED."companyName", status = EXCLUDED.status;
