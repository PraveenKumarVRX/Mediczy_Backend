# PostgreSQL Migration Scripts - Usage Guide

**Created**: December 9, 2025  
**Status**: ✅ Ready to Use

---

## 📁 Scripts Overview

| Script | Purpose | Risk Level |
|--------|---------|------------|
| `sync-postgres-tables.js` | Create/update PostgreSQL table schemas | 🟢 Safe |
| `migrate-data-to-postgres.js` | Copy data from MariaDB to PostgreSQL | 🟡 Medium |
| `check-data-consistency.js` | Verify data consistency between databases | 🟢 Safe |

---

## 🚀 Step-by-Step Migration Process

### Step 1: Prepare PostgreSQL Database

```bash
# Create PostgreSQL database if it doesn't exist
sudo -u postgres psql -c "CREATE DATABASE mediczy_ai;"

# Grant permissions to user
sudo -u postgres psql -c "
  CREATE USER mediczy_helper WITH PASSWORD 'Mediczy2024Helper';
  GRANT ALL PRIVILEGES ON DATABASE mediczy_ai TO mediczy_helper;
"

# Test connection
psql -h 127.0.0.1 -U mediczy_helper -d mediczy_ai -c "SELECT version();"
```

### Step 2: Sync Table Schemas

Create PostgreSQL tables from models:

```bash
cd /home/ubuntu/Mediczy/server

# Safe mode - create tables if not exist (RECOMMENDED FIRST TIME)
node scripts/sync-postgres-tables.js

# Alter mode - update existing tables to match models
node scripts/sync-postgres-tables.js --alter

# Force mode - DROP and recreate all tables (⚠️  DESTRUCTIVE!)
# Only use this if you want to start fresh
# node scripts/sync-postgres-tables.js --force
```

**What it does:**
- Creates `users`, `doctors`, `appointments`, `prescriptions` tables
- Sets up indexes (B-tree, GIN for JSONB/arrays, full-text search)
- Creates triggers for automatic full-text search indexing
- Enables PostgreSQL extensions (uuid-ossp, pgcrypto, pg_trgm)

### Step 3: Migrate Data

Copy all data from MariaDB to PostgreSQL:

```bash
# Dry run first - see what would happen without actually migrating
node scripts/migrate-data-to-postgres.js --dry-run

# Migrate all tables
node scripts/migrate-data-to-postgres.js

# Migrate specific table only
node scripts/migrate-data-to-postgres.js --table=users

# Custom batch size (default: 1000)
node scripts/migrate-data-to-postgres.js --batch-size=500

# Combination example
node scripts/migrate-data-to-postgres.js --table=doctors --batch-size=100
```

**What it does:**
- Reads data from MariaDB in batches
- Transforms data to PostgreSQL format:
  - Converts TEXT allergies to ARRAY
  - Converts JSON strings to JSONB objects
  - Adds multi-tenant fields (organization_id, organization_type)
  - Combines date+time into datetime fields
- Uses `UPSERT` to avoid duplicates
- Shows progress bar and statistics
- Handles errors gracefully

**Migration Features:**
- ✅ Batch processing (memory efficient)
- ✅ Progress tracking
- ✅ Error handling with retry
- ✅ Duplicate detection (skips existing records)
- ✅ Data transformation (MariaDB → PostgreSQL format)
- ✅ Speed metrics (records/sec)

### Step 4: Verify Consistency

Check if data matches between databases:

```bash
# Check all tables
node scripts/check-data-consistency.js

# Check specific table
node scripts/check-data-consistency.js users
node scripts/check-data-consistency.js doctors
node scripts/check-data-consistency.js appointments
node scripts/check-data-consistency.js prescriptions
```

**What it checks:**
- ✅ Record count comparison
- ✅ Sample field values match
- ✅ Missing records in PostgreSQL
- ✅ Extra records in PostgreSQL
- ✅ Detailed diff report

---

## 📊 Expected Results

### Successful Migration Output

```
🚀 MariaDB → PostgreSQL Data Migration
======================================================================

📊 Total records in MariaDB: 1,523
📊 Existing records in PostgreSQL: 0

📦 Processing batch 1 (1000 records)...
✅ Progress: 65.7% (1000 migrated, 0 skipped, 0 errors)

📦 Processing batch 2 (523 records)...
✅ Progress: 100.0% (1523 migrated, 0 skipped, 0 errors)

✅ users migration complete!
   Migrated: 1,523
   Skipped: 0
   Errors: 0
   Duration: 3.45s
   Speed: 441 records/sec

======================================================================
📊 MIGRATION SUMMARY
======================================================================

Total Migrated: 1,523
Total Skipped: 0
Total Errors: 0
Total Duration: 3.45s
Average Speed: 441 records/sec

🎉 Migration completed successfully!
```

### Consistency Check Output

```
🔍 Data Consistency Checker: MariaDB ↔ PostgreSQL
======================================================================

📊 Record Counts:
   MariaDB:    1,523
   PostgreSQL: 1,523
   Difference: 0
   Status:     ✅ MATCH

🔬 Sampling 5 records...
   Sample Results: 5 matches, 0 mismatches

🔍 Checking for missing records...
   ✅ All MariaDB records present in PostgreSQL

✅ Overall Status: CONSISTENT
```

---

## 🔧 Troubleshooting

### Issue: PostgreSQL connection fails

```bash
# Check if PostgreSQL is running
sudo systemctl status postgresql

# Check if database exists
psql -h 127.0.0.1 -U postgres -l | grep mediczy

# Check permissions
sudo -u postgres psql -d mediczy_ai -c "\du"
```

**Fix:**
```bash
# Restart PostgreSQL
sudo systemctl restart postgresql

# Recreate database with correct permissions
sudo -u postgres psql << EOF
DROP DATABASE IF EXISTS mediczy_ai;
CREATE DATABASE mediczy_ai;
GRANT ALL PRIVILEGES ON DATABASE mediczy_ai TO mediczy_helper;
\c mediczy_ai
GRANT ALL ON SCHEMA public TO mediczy_helper;
EOF
```

### Issue: Migration fails with "column does not exist"

This means the table schema doesn't match the model.

**Fix:**
```bash
# Re-sync tables with --alter flag
node scripts/sync-postgres-tables.js --alter

# Or force recreate (⚠️  loses data)
node scripts/sync-postgres-tables.js --force
```

### Issue: Data inconsistency after migration

```bash
# Check which records are missing
node scripts/check-data-consistency.js

# Re-run migration (will skip existing records)
node scripts/migrate-data-to-postgres.js

# Or validate mode to see gaps
node scripts/migrate-data-to-postgres.js --validate
```

### Issue: Memory errors with large tables

```bash
# Reduce batch size
node scripts/migrate-data-to-postgres.js --batch-size=100
```

### Issue: Too many errors during migration

Check the error messages - common issues:
- **Foreign key constraints**: Migrate tables in order (users → doctors → appointments → prescriptions)
- **Data type mismatches**: Fix in transform functions in the migration script
- **Duplicate keys**: Already migrated, use `--validate` to check

---

## 🎯 Migration Checklist

### Pre-Migration
- [ ] PostgreSQL is running and accessible
- [ ] Database `mediczy_ai` exists with correct permissions
- [ ] Environment variables in `.env` are correct
- [ ] Backup MariaDB data (`mysqldump`)
- [ ] Test connection to both databases

### During Migration
- [ ] Run `sync-postgres-tables.js` first
- [ ] Verify tables created: `psql -h 127.0.0.1 -U mediczy_helper -d mediczy_ai -c "\dt"`
- [ ] Run `migrate-data-to-postgres.js --dry-run` to preview
- [ ] Run actual migration: `migrate-data-to-postgres.js`
- [ ] Monitor for errors in output
- [ ] Check completion statistics

### Post-Migration
- [ ] Run `check-data-consistency.js` for all tables
- [ ] Verify record counts match
- [ ] Test a few sample queries:
  ```bash
  psql -h 127.0.0.1 -U mediczy_helper -d mediczy_ai << EOF
  SELECT COUNT(*) FROM users;
  SELECT COUNT(*) FROM doctors;
  SELECT COUNT(*) FROM appointments;
  SELECT COUNT(*) FROM prescriptions;
  EOF
  ```
- [ ] Test full-text search:
  ```sql
  SELECT * FROM users 
  WHERE search_vector @@ plainto_tsquery('english', 'john');
  ```
- [ ] Test JSONB queries:
  ```sql
  SELECT * FROM doctors 
  WHERE 'General Practitioner' = ANY(specializations);
  ```

---

## 📈 Performance Tips

### For Large Datasets (100,000+ records)

1. **Increase batch size for faster migration:**
   ```bash
   node scripts/migrate-data-to-postgres.js --batch-size=5000
   ```

2. **Disable indexes during migration, rebuild after:**
   ```sql
   -- Before migration
   DROP INDEX IF EXISTS idx_users_email;
   DROP INDEX IF EXISTS idx_doctors_email;
   
   -- After migration
   CREATE UNIQUE INDEX idx_users_email ON users(email);
   CREATE UNIQUE INDEX idx_doctors_email ON doctors(email);
   ```

3. **Use connection pooling in `.env`:**
   ```bash
   POSTGRES_POOL_MAX=50
   POSTGRES_POOL_MIN=10
   ```

4. **Migrate in stages:**
   ```bash
   # Day 1: Core tables
   node scripts/migrate-data-to-postgres.js --table=users
   node scripts/migrate-data-to-postgres.js --table=doctors
   
   # Day 2: Transaction tables
   node scripts/migrate-data-to-postgres.js --table=appointments
   node scripts/migrate-data-to-postgres.js --table=prescriptions
   ```

---

## 🔒 Safety Features

All scripts include:
- ✅ **Dry-run mode** - Preview without making changes
- ✅ **Duplicate detection** - Won't overwrite existing data
- ✅ **Error handling** - Continues on errors, logs issues
- ✅ **Progress tracking** - Real-time feedback
- ✅ **Validation mode** - Verify consistency after migration
- ✅ **Rollback support** - Original MariaDB data untouched

---

## 🎯 Next Steps After Migration

1. **Test Application**: Start server and test all CRUD operations
2. **Enable Dual-Write**: Set `MIGRATION_MODE=dual-write` in `.env`
3. **Monitor**: Watch logs for any PostgreSQL errors
4. **Performance**: Check query speeds with `EXPLAIN ANALYZE`
5. **Backup**: Set up PostgreSQL automated backups
6. **Scale**: Consider read replicas or Citus for horizontal scaling

---

## 📚 Related Documentation

- [POSTGRES_MIGRATION_PLAN.md](./POSTGRES_MIGRATION_PLAN.md) - Full migration strategy
- [POSTGRES_QUICKSTART.md](./POSTGRES_QUICKSTART.md) - Getting started guide
- [POSTGRES_IMPLEMENTATION_SUMMARY.md](./POSTGRES_IMPLEMENTATION_SUMMARY.md) - Current status

---

**Ready to migrate?** Start with Step 1! 🚀
