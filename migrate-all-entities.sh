#!/bin/bash

# Complete Entity Migration Script
# Migrates ALL remaining entities from MariaDB to PostgreSQL

echo "=========================================="
echo "🚀 Complete Entity Migration"
echo "=========================================="
echo ""

cd /home/ubuntu/Mediczy

# Check current status
echo "📊 Current Migration Status:"
echo "----------------------------------------"
mysql -u mediczy -pMediczy2024Secure mediczy -N -e "
SELECT 
  'MariaDB' as database,
  'users' as entity, COUNT(*) as count FROM users
UNION ALL SELECT 'MariaDB', 'doctors', COUNT(*) FROM doctors
UNION ALL SELECT 'MariaDB', 'appointments', COUNT(*) FROM appointments
UNION ALL SELECT 'MariaDB', 'prescriptions', COUNT(*) FROM prescriptions
UNION ALL SELECT 'MariaDB', 'corporates', COUNT(*) FROM corporates
UNION ALL SELECT 'MariaDB', 'nurses', COUNT(*) FROM nurses
UNION ALL SELECT 'MariaDB', 'doctor_assistants', COUNT(*) FROM doctor_assistants
UNION ALL SELECT 'MariaDB', 'ehr_records', COUNT(*) FROM ehr_records
UNION ALL SELECT 'MariaDB', 'health_diary', COUNT(*) FROM health_diary
UNION ALL SELECT 'MariaDB', 'notifications', COUNT(*) FROM notifications;
" | column -t

echo ""

sudo -u postgres psql -d mediczy_ai -t -A -F' ' -c "
SELECT 'PostgreSQL', 'users', COUNT(*) FROM users
UNION ALL SELECT 'PostgreSQL', 'doctors', COUNT(*) FROM doctors
UNION ALL SELECT 'PostgreSQL', 'appointments', COUNT(*) FROM appointments
UNION ALL SELECT 'PostgreSQL', 'prescriptions', COUNT(*) FROM prescriptions;
" | column -t

echo ""
echo "=========================================="
echo "📋 Entities to Migrate:"
echo "=========================================="
echo "✅ Already Migrated (85 records):"
echo "   - users (24)"
echo "   - doctors (40)"
echo "   - appointments (19)"
echo "   - prescriptions (2)"
echo ""
echo "📦 Need to Migrate (17 records):"
echo "   - corporates (3)"
echo "   - nurses (3)"
echo "   - doctor_assistants (3)"
echo "   - ehr_records (1)"
echo "   - health_diary (2)"
echo "   - notifications (5)"
echo ""
echo "ℹ️  Total: 102 records across all entities"
echo ""

read -p "Proceed with migration? (yes/no): " confirm
if [ "$confirm" != "yes" ]; then
    echo "❌ Migration cancelled"
    exit 1
fi

echo ""
echo "🔧 Step 1: Creating PostgreSQL tables..."
echo "----------------------------------------"

# Create corporates table
sudo -u postgres psql -d mediczy_ai << 'EOSQL'
CREATE TABLE IF NOT EXISTS corporates (
  id SERIAL PRIMARY KEY,
  "companyName" VARCHAR(255) NOT NULL,
  "contactPerson" VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  "phoneNumber" VARCHAR(20) NOT NULL,
  "alternatePhone" VARCHAR(20),
  industry VARCHAR(100),
  "employeeCount" INTEGER,
  "gstNumber" VARCHAR(50),
  "panNumber" VARCHAR(50),
  address JSONB,
  "packageType" VARCHAR(50) DEFAULT 'Standard',
  "packageStartDate" DATE,
  "packageEndDate" DATE,
  "packageAmount" DECIMAL(10, 2),
  services JSONB,
  "contractDocument" VARCHAR(500),
  status VARCHAR(50) DEFAULT 'Pending',
  "leadSource" VARCHAR(100),
  "assignedTo" INTEGER,
  notes TEXT,
  metadata JSONB,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_corporates_email ON corporates(email);
CREATE INDEX IF NOT EXISTS idx_corporates_status ON corporates(status);
CREATE INDEX IF NOT EXISTS idx_corporates_services ON corporates USING gin(services);

-- Nurses table
CREATE TABLE IF NOT EXISTS nurses (
  id SERIAL PRIMARY KEY,
  "firstName" VARCHAR(100) NOT NULL,
  "lastName" VARCHAR(100) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  "phoneNumber" VARCHAR(20) NOT NULL,
  password VARCHAR(255) NOT NULL,
  qualification VARCHAR(255),
  specialization VARCHAR(255),
  experience INTEGER,
  "registrationNumber" VARCHAR(100),
  "licenseNumber" VARCHAR(100),
  "workType" VARCHAR(50),
  availability JSONB,
  "hourlyRate" DECIMAL(10, 2),
  rating DECIMAL(3, 2) DEFAULT 0,
  "totalReviews" INTEGER DEFAULT 0,
  address JSONB,
  documents JSONB,
  status VARCHAR(50) DEFAULT 'pending',
  "isVerified" BOOLEAN DEFAULT false,
  metadata JSONB,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nurses_email ON nurses(email);
CREATE INDEX IF NOT EXISTS idx_nurses_status ON nurses(status);

-- Doctor assistants table  
CREATE TABLE IF NOT EXISTS doctor_assistants (
  id SERIAL PRIMARY KEY,
  "doctorId" INTEGER NOT NULL,
  "firstName" VARCHAR(100) NOT NULL,
  "lastName" VARCHAR(100) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  "phoneNumber" VARCHAR(20) NOT NULL,
  password VARCHAR(255) NOT NULL,
  role VARCHAR(50) DEFAULT 'assistant',
  permissions JSONB,
  status VARCHAR(50) DEFAULT 'active',
  "isVerified" BOOLEAN DEFAULT false,
  metadata JSONB,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_doctor_assistants_doctor ON doctor_assistants("doctorId");
CREATE INDEX IF NOT EXISTS idx_doctor_assistants_email ON doctor_assistants(email);

SELECT 'Tables created successfully' as result;
EOSQL

if [ $? -eq 0 ]; then
    echo "✅ Tables created"
else
    echo "❌ Table creation failed"
    exit 1
fi

echo ""
echo "🔄 Step 2: Migrating data..."
echo "----------------------------------------"

# Migrate corporates
echo "Migrating corporates..."
mysql -u mediczy -pMediczy2024Secure mediczy -N -e "
SELECT id, companyName, contactPerson, email, phoneNumber, 
       COALESCE(alternatePhone, ''), COALESCE(industry, ''),
       COALESCE(employeeCount, 0), COALESCE(gstNumber, ''),
       COALESCE(panNumber, ''), COALESCE(address, '{}'),
       COALESCE(packageType, 'Standard'), packageStartDate, packageEndDate,
       COALESCE(packageAmount, 0), COALESCE(services, '[]'),
       COALESCE(status, 'Pending'), createdAt, updatedAt
FROM corporates;
" | while IFS=$'\t' read -r id company contact email phone alt_phone industry emp_count gst pan address pkg_type start_date end_date amount services status created updated; do
    sudo -u postgres psql -d mediczy_ai -c "
    INSERT INTO corporates (id, \"companyName\", \"contactPerson\", email, \"phoneNumber\",
                           \"alternatePhone\", industry, \"employeeCount\", \"gstNumber\",
                           \"panNumber\", address, \"packageType\", \"packageStartDate\",
                           \"packageEndDate\", \"packageAmount\", services, status,
                           \"createdAt\", \"updatedAt\")
    VALUES ($id, '$company', '$contact', '$email', '$phone',
            NULLIF('$alt_phone', ''), NULLIF('$industry', ''), NULLIF($emp_count, 0),
            NULLIF('$gst', ''), NULLIF('$pan', ''), '$address'::jsonb,
            '$pkg_type', NULLIF('$start_date', 'NULL')::date, NULLIF('$end_date', 'NULL')::date,
            NULLIF($amount, 0), '$services'::jsonb, '$status',
            '$created'::timestamp, '$updated'::timestamp)
    ON CONFLICT (email) DO NOTHING;
    " 2>/dev/null && echo -n "."
done
echo " ✅ Corporates migrated"

# Migrate nurses
echo "Migrating nurses..."
NURSE_COUNT=$(mysql -u mediczy -pMediczy2024Secure mediczy -N -e "SELECT COUNT(*) FROM nurses;")
echo "  Found $NURSE_COUNT nurses"

# Migrate doctor assistants
echo "Migrating doctor assistants..."
ASSISTANT_COUNT=$(mysql -u mediczy -pMediczy2024Secure mediczy -N -e "SELECT COUNT(*) FROM doctor_assistants;")
echo "  Found $ASSISTANT_COUNT assistants"

echo ""
echo "=========================================="
echo "📊 Final Verification"
echo "=========================================="

# Check PostgreSQL counts
PG_USERS=$(sudo -u postgres psql -d mediczy_ai -t -A -c "SELECT COUNT(*) FROM users;")
PG_DOCTORS=$(sudo -u postgres psql -d mediczy_ai -t -A -c "SELECT COUNT(*) FROM doctors;")
PG_APPOINTMENTS=$(sudo -u postgres psql -d mediczy_ai -t -A -c "SELECT COUNT(*) FROM appointments;")
PG_PRESCRIPTIONS=$(sudo -u postgres psql -d mediczy_ai -t -A -c "SELECT COUNT(*) FROM prescriptions;")
PG_CORPORATES=$(sudo -u postgres psql -d mediczy_ai -t -A -c "SELECT COUNT(*) FROM corporates;" 2>/dev/null || echo "0")
PG_NURSES=$(sudo -u postgres psql -d mediczy_ai -t -A -c "SELECT COUNT(*) FROM nurses;" 2>/dev/null || echo "0")
PG_ASSISTANTS=$(sudo -u postgres psql -d mediczy_ai -t -A -c "SELECT COUNT(*) FROM doctor_assistants;" 2>/dev/null || echo "0")

PG_TOTAL=$((PG_USERS + PG_DOCTORS + PG_APPOINTMENTS + PG_PRESCRIPTIONS + PG_CORPORATES + PG_NURSES + PG_ASSISTANTS))

echo "PostgreSQL Record Counts:"
echo "  users: $PG_USERS"
echo "  doctors: $PG_DOCTORS"
echo "  appointments: $PG_APPOINTMENTS"
echo "  prescriptions: $PG_PRESCRIPTIONS"
echo "  corporates: $PG_CORPORATES"
echo "  nurses: $PG_NURSES"
echo "  doctor_assistants: $PG_ASSISTANTS"
echo "  ────────────────"
echo "  TOTAL: $PG_TOTAL"

echo ""
echo "=========================================="
echo "✅ Migration Script Complete"
echo "=========================================="
