# PostgreSQL Migration Plan - MariaDB to PostgreSQL Transition

**Status**: 🚀 In Progress  
**Date**: December 9, 2025  
**Objective**: Migrate from MariaDB to PostgreSQL as primary database and phase out MariaDB completely

---

## 🎯 Strategy Overview

### Why PostgreSQL?
✅ **Superior JSON/JSONB support** - Native indexing and querying  
✅ **Vector embeddings** - PGVector for AI/ML features  
✅ **Horizontal scaling** - Citus extension for distributed tables  
✅ **Full-text search** - Built-in advanced search capabilities  
✅ **Better concurrency** - MVCC without locking issues  
✅ **Rich data types** - Arrays, JSONB, hstore, ranges, etc.  
✅ **Advanced indexing** - GiST, GIN, BRIN, partial indexes  
✅ **Row-level security** - Native multi-tenant support  
✅ **Foreign Data Wrappers** - Connect to external data sources  
✅ **Active development** - Better community and enterprise support  

### Migration Approach: **Gradual Phase-Out**

```
Phase 1: Dual-Write (Current) ─────────────────────────────────────────────┐
├─ Write to both MariaDB + PostgreSQL                                      │
├─ Read from PostgreSQL (with MariaDB fallback)                            │
├─ Run parallel for 30-60 days                                             │
└─ Monitor data consistency                                                │
                                                                            │
Phase 2: PostgreSQL Primary (3-6 months) ──────────────────────────────────┤
├─ All new features use PostgreSQL only                                    │
├─ Migrate remaining tables batch by batch                                 │
├─ MariaDB becomes read-only archive                                       │
└─ Update all ORMs to use PostgreSQL                                       │
                                                                            │
Phase 3: MariaDB Decommission (6-12 months) ───────────────────────────────┘
├─ Export MariaDB data to PostgreSQL archives
├─ Remove MariaDB dependencies
├─ Clean up code and configuration
└─ Full PostgreSQL operation
```

---

## 📊 Current State Analysis

### Databases in Use
| Database | Role | Status | Tables | Notes |
|----------|------|--------|--------|-------|
| **MariaDB** | Primary OLTP | ✅ Active | 50+ tables | Current primary database |
| **PostgreSQL** | AI/Helper | ✅ Active | 3 tables | chatbot_sessions, medical_embeddings, helper_replicas |
| **MongoDB** | Audit logs | ✅ Active | 1 collection | auditlogs only |
| **DuckDB** | Analytics | ✅ Optional | N/A | OLAP queries |
| **Redis** | Cache | ✅ Active | N/A | Sessions, queues, cache |

### MariaDB Tables to Migrate (50+ tables)

**Core User & Authentication:**
- users
- doctors
- nurses
- assistants

**Healthcare Operations:**
- appointments
- prescriptions
- ehr_records
- health_diaries
- vitals_records
- patient_notes
- medications
- doctor_availability
- consent_records

**Provider Organizations:**
- hospitals
- clinics
- corporates
- labs
- pharmacies
- ambulances
- homecare_providers

**Insurance System:**
- insurance_providers
- insurance_policies
- user_insurances
- insurance_claims

**CRM & Lead Management:**
- crm_leads
- lead_activities
- lead_notes
- lead_tasks

**Membership & Plans:**
- membership_plans
- user_plans

**Administrative:**
- audit_logs (MariaDB version - will consolidate with MongoDB)

---

## 🔧 Phase 1: Dual-Write Implementation (Weeks 1-4)

### Step 1.1: Create PostgreSQL Schema with Sequelize Support

**File**: `/server/db/postgres-sequelize.js`

```javascript
import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';

dotenv.config();

const postgresSequelize = new Sequelize({
  host: process.env.POSTGRES_HOST || '127.0.0.1',
  port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
  database: process.env.POSTGRES_DATABASE || 'mediczy_primary',
  username: process.env.POSTGRES_USER || 'mediczy',
  password: process.env.POSTGRES_PASSWORD || 'change_me',
  dialect: 'postgres',
  dialectOptions: {
    ssl: process.env.POSTGRES_SSL === 'true' 
      ? { rejectUnauthorized: false } 
      : false,
    connectTimeout: 10000,
  },
  logging: process.env.NODE_ENV === 'development' ? console.log : false,
  pool: {
    max: parseInt(process.env.POSTGRES_POOL_MAX || '20', 10),
    min: parseInt(process.env.POSTGRES_POOL_MIN || '5', 10),
    acquire: 30000,
    idle: 10000,
    evict: 10000
  },
  benchmark: process.env.NODE_ENV === 'development'
});

export { postgresSequelize };
```

### Step 1.2: Create PostgreSQL Model Definitions

Convert all MariaDB models to PostgreSQL-compatible models:

**Priority 1 - Core Tables (Week 1):**
- ✅ users
- ✅ doctors
- ✅ appointments
- ✅ prescriptions

**Priority 2 - Organizations (Week 2):**
- ✅ hospitals
- ✅ clinics
- ✅ corporates
- ✅ labs
- ✅ pharmacies

**Priority 3 - Insurance & CRM (Week 3):**
- ✅ insurance_providers
- ✅ insurance_policies
- ✅ user_insurances
- ✅ crm_leads

**Priority 4 - Remaining Tables (Week 4):**
- ✅ All other tables

### Step 1.3: Database Abstraction Layer

**File**: `/server/db/dual-write-adapter.js`

```javascript
/**
 * Dual-Write Adapter for MariaDB → PostgreSQL Migration
 * Writes to both databases, reads from PostgreSQL with MariaDB fallback
 */

import { sequelize as mariadb } from './mariadb.js';
import { postgresSequelize as postgres } from './postgres-sequelize.js';

class DualWriteAdapter {
  constructor() {
    this.readFromPostgres = process.env.READ_FROM_POSTGRES !== 'false';
    this.writeToMariaDB = process.env.WRITE_TO_MARIADB !== 'false';
    this.writeToPostgres = process.env.WRITE_TO_POSTGRES !== 'false';
  }

  async create(MariaModel, PostgresModel, data) {
    const results = {};
    
    // Write to PostgreSQL (primary target)
    if (this.writeToPostgres) {
      try {
        results.postgres = await PostgresModel.create(data);
      } catch (error) {
        console.error('PostgreSQL write failed:', error.message);
        results.postgresError = error.message;
      }
    }
    
    // Write to MariaDB (legacy support)
    if (this.writeToMariaDB) {
      try {
        results.mariadb = await MariaModel.create(data);
      } catch (error) {
        console.error('MariaDB write failed:', error.message);
        results.mariadbError = error.message;
      }
    }
    
    return results.postgres || results.mariadb;
  }

  async findAll(MariaModel, PostgresModel, options = {}) {
    // Try PostgreSQL first
    if (this.readFromPostgres) {
      try {
        return await PostgresModel.findAll(options);
      } catch (error) {
        console.warn('PostgreSQL read failed, falling back to MariaDB:', error.message);
      }
    }
    
    // Fallback to MariaDB
    return await MariaModel.findAll(options);
  }

  async findByPk(MariaModel, PostgresModel, id, options = {}) {
    if (this.readFromPostgres) {
      try {
        return await PostgresModel.findByPk(id, options);
      } catch (error) {
        console.warn('PostgreSQL read failed, falling back to MariaDB:', error.message);
      }
    }
    
    return await MariaModel.findByPk(id, options);
  }

  async update(MariaModel, PostgresModel, data, where) {
    const results = {};
    
    if (this.writeToPostgres) {
      try {
        results.postgres = await PostgresModel.update(data, { where });
      } catch (error) {
        console.error('PostgreSQL update failed:', error.message);
      }
    }
    
    if (this.writeToMariaDB) {
      try {
        results.mariadb = await MariaModel.update(data, { where });
      } catch (error) {
        console.error('MariaDB update failed:', error.message);
      }
    }
    
    return results.postgres || results.mariadb;
  }

  async destroy(MariaModel, PostgresModel, where) {
    const results = {};
    
    if (this.writeToPostgres) {
      try {
        results.postgres = await PostgresModel.destroy({ where });
      } catch (error) {
        console.error('PostgreSQL delete failed:', error.message);
      }
    }
    
    if (this.writeToMariaDB) {
      try {
        results.mariadb = await MariaModel.destroy({ where });
      } catch (error) {
        console.error('MariaDB delete failed:', error.message);
      }
    }
    
    return results.postgres || results.mariadb;
  }
}

export const dualWriteAdapter = new DualWriteAdapter();
```

### Step 1.4: Data Migration Scripts

**File**: `/server/scripts/migrate-data-to-postgres.js`

```javascript
/**
 * Data Migration Script: MariaDB → PostgreSQL
 * Copies all existing data from MariaDB to PostgreSQL
 */

import { sequelize as mariadb } from '../db/mariadb.js';
import { postgresSequelize as postgres } from '../db/postgres-sequelize.js';

const BATCH_SIZE = 1000;

async function migrateTable(tableName, MariaModel, PostgresModel) {
  console.log(`\n🔄 Migrating ${tableName}...`);
  
  const totalCount = await MariaModel.count();
  console.log(`   Total records: ${totalCount}`);
  
  let migrated = 0;
  let errors = 0;
  
  for (let offset = 0; offset < totalCount; offset += BATCH_SIZE) {
    const batch = await MariaModel.findAll({
      limit: BATCH_SIZE,
      offset: offset,
      raw: true
    });
    
    for (const record of batch) {
      try {
        await PostgresModel.upsert(record, {
          conflictFields: ['id']
        });
        migrated++;
      } catch (error) {
        console.error(`   ❌ Error migrating record ${record.id}:`, error.message);
        errors++;
      }
    }
    
    console.log(`   Progress: ${migrated}/${totalCount} (${Math.round(migrated/totalCount*100)}%)`);
  }
  
  console.log(`✅ ${tableName} migration complete: ${migrated} migrated, ${errors} errors`);
  
  return { migrated, errors };
}

async function runMigration() {
  console.log('🚀 Starting MariaDB → PostgreSQL data migration...\n');
  
  const migrations = [
    // Add table migrations here
    // { name: 'users', maria: MariaUser, postgres: PostgresUser },
  ];
  
  const results = {
    totalMigrated: 0,
    totalErrors: 0,
    startTime: Date.now()
  };
  
  for (const migration of migrations) {
    const result = await migrateTable(
      migration.name,
      migration.maria,
      migration.postgres
    );
    results.totalMigrated += result.migrated;
    results.totalErrors += result.errors;
  }
  
  const duration = ((Date.now() - results.startTime) / 1000).toFixed(2);
  console.log(`\n✅ Migration complete!`);
  console.log(`   Total migrated: ${results.totalMigrated}`);
  console.log(`   Total errors: ${results.totalErrors}`);
  console.log(`   Duration: ${duration}s`);
}

runMigration().catch(console.error);
```

---

## 🔄 Phase 2: PostgreSQL Primary (Months 2-6)

### Multi-Tenant Architecture with PostgreSQL

PostgreSQL offers **native row-level security** which is perfect for multi-tenant:

```sql
-- Enable row-level security
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Create policy for tenant isolation
CREATE POLICY tenant_isolation ON users
  USING (organization_id = current_setting('app.current_organization_id')::integer);

-- In application code, set context:
-- SET LOCAL app.current_organization_id = '123';
```

### PostgreSQL-Specific Features to Implement

**1. JSONB for Flexible Schemas**
```sql
-- Store flexible metadata
ALTER TABLE appointments ADD COLUMN metadata JSONB DEFAULT '{}'::jsonb;
CREATE INDEX idx_appointments_metadata ON appointments USING GIN (metadata);

-- Query JSONB efficiently
SELECT * FROM appointments WHERE metadata @> '{"priority": "high"}';
```

**2. Full-Text Search**
```sql
-- Add tsvector column for search
ALTER TABLE prescriptions ADD COLUMN search_vector tsvector;

-- Create index
CREATE INDEX idx_prescriptions_search ON prescriptions USING GIN (search_vector);

-- Update trigger for auto-indexing
CREATE TRIGGER prescriptions_search_update
BEFORE INSERT OR UPDATE ON prescriptions
FOR EACH ROW EXECUTE FUNCTION tsvector_update_trigger(
  search_vector, 'pg_catalog.english',
  diagnosis, advice, patient_name
);
```

**3. Vector Embeddings (Already Implemented)**
```sql
-- Medical knowledge embeddings
SELECT * FROM medical_embeddings
ORDER BY vector <=> '[0.1, 0.2, ...]'::vector
LIMIT 10;
```

**4. Citus Distribution for Scale**
```sql
-- Distribute large tables
SELECT create_distributed_table('appointments', 'organization_id');
SELECT create_distributed_table('prescriptions', 'organization_id');
SELECT create_distributed_table('ehr_records', 'patient_id');
```

---

## 📋 Migration Checklist

### Week 1: Setup & Core Tables
- [ ] Create `postgres-sequelize.js` connection
- [ ] Create `dual-write-adapter.js`
- [ ] Convert `user.model` to PostgreSQL
- [ ] Convert `doctor.model` to PostgreSQL
- [ ] Convert `appointment.model` to PostgreSQL
- [ ] Convert `prescription.model` to PostgreSQL
- [ ] Run initial data migration for core tables
- [ ] Update API routes to use dual-write adapter
- [ ] Test CRUD operations

### Week 2: Organization Tables
- [ ] Convert `hospital.model` to PostgreSQL
- [ ] Convert `clinic.model` to PostgreSQL
- [ ] Convert `corporate.model` to PostgreSQL
- [ ] Convert `lab.model` to PostgreSQL
- [ ] Convert `pharmacy.model` to PostgreSQL
- [ ] Convert `ambulance.model` to PostgreSQL
- [ ] Convert `homecare_provider.model` to PostgreSQL
- [ ] Migrate organization data
- [ ] Add `organization_id` to all tables
- [ ] Implement row-level security policies

### Week 3: Insurance & CRM
- [ ] Convert insurance models to PostgreSQL
- [ ] Convert CRM models to PostgreSQL
- [ ] Migrate insurance data
- [ ] Migrate CRM data
- [ ] Test insurance workflows
- [ ] Test CRM workflows

### Week 4: Remaining Tables & Testing
- [ ] Convert all remaining models
- [ ] Complete data migration
- [ ] Run consistency checks
- [ ] Load testing
- [ ] Performance benchmarking
- [ ] Monitor error rates

### Month 2-3: Feature Development
- [ ] Implement JSONB features
- [ ] Implement full-text search
- [ ] Optimize indexes
- [ ] Add materialized views
- [ ] Set up read replicas
- [ ] Configure connection pooling (PgBouncer)

### Month 4-6: Gradual Cutover
- [ ] Disable writes to MariaDB (read-only mode)
- [ ] Monitor PostgreSQL performance
- [ ] Fix any issues
- [ ] Update all documentation
- [ ] Train team on PostgreSQL

### Month 6-12: Decommission MariaDB
- [ ] Archive MariaDB data
- [ ] Remove MariaDB dependencies from code
- [ ] Update deployment scripts
- [ ] Clean up configuration files
- [ ] Celebrate! 🎉

---

## ⚙️ Configuration Changes

### Environment Variables

**Add to `.env`:**
```bash
# PostgreSQL Primary Database (replaces MariaDB)
POSTGRES_PRIMARY_HOST=127.0.0.1
POSTGRES_PRIMARY_PORT=5432
POSTGRES_PRIMARY_DATABASE=mediczy_primary
POSTGRES_PRIMARY_USER=mediczy
POSTGRES_PRIMARY_PASSWORD=StrongPassword123!
POSTGRES_PRIMARY_POOL_MAX=20
POSTGRES_PRIMARY_POOL_MIN=5
POSTGRES_PRIMARY_SSL=false

# Migration Control Flags
READ_FROM_POSTGRES=true
WRITE_TO_POSTGRES=true
WRITE_TO_MARIADB=true  # Set to false after migration complete
MIGRATION_MODE=dual-write  # dual-write | postgres-only | mariadb-only

# PostgreSQL Features
POSTGRES_RLS_ENABLED=true  # Row-Level Security
POSTGRES_FTS_ENABLED=true  # Full-Text Search
CITUS_ENABLED=true  # Distributed tables
PGVECTOR_ENABLED=true  # Vector embeddings
```

---

## 🎯 Success Metrics

### Performance Targets
- **Query response time**: < 100ms (95th percentile)
- **Write throughput**: > 10,000 writes/sec
- **Read throughput**: > 50,000 reads/sec
- **Data consistency**: 99.99% match between MariaDB and PostgreSQL during dual-write phase

### Monitoring
- Set up PostgreSQL monitoring (pg_stat_statements, pg_stat_activity)
- Track slow queries (> 1 second)
- Monitor connection pool usage
- Alert on replication lag (if using read replicas)

---

## 🔐 Security Enhancements

### Row-Level Security (RLS)
```sql
-- Enable RLS on all multi-tenant tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE doctors ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY org_isolation ON users
  USING (organization_id = current_setting('app.current_organization_id')::integer);
```

### Encryption at Rest
- Enable PostgreSQL transparent data encryption (TDE)
- Use encrypted tablespaces for sensitive data

### Audit Logging
- Use PostgreSQL pgAudit extension
- Consolidate MongoDB audit logs into PostgreSQL

---

## 📝 Rollback Plan

If migration fails:

1. **Immediate**: Set `WRITE_TO_MARIADB=true` and `READ_FROM_POSTGRES=false`
2. **Data Sync**: Run reverse sync script (PostgreSQL → MariaDB)
3. **Verification**: Compare record counts and checksums
4. **Communication**: Notify team and stakeholders
5. **Root Cause**: Analyze failure and plan retry

---

## 🚀 Next Steps

1. **Review this plan** - Get team approval
2. **Set up staging environment** - Test migration on staging first
3. **Create PostgreSQL database** - `CREATE DATABASE mediczy_primary;`
4. **Start Week 1 tasks** - Begin core table migration
5. **Daily standups** - Track progress and blockers

---

## 📚 Resources

- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [Sequelize PostgreSQL Guide](https://sequelize.org/docs/v6/other-topics/dialect-specific-things/#postgresql)
- [Citus Documentation](https://docs.citusdata.com/)
- [PGVector Documentation](https://github.com/pgvector/pgvector)
- [PostgreSQL Row-Level Security](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)

---

**Status**: 📋 Plan Complete - Ready for Implementation  
**Next Action**: Create postgres-sequelize.js and start Week 1 tasks
