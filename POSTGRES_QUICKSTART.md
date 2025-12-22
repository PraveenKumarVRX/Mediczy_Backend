# PostgreSQL Migration - Quick Start Guide

**Status**: ✅ Infrastructure Ready  
**Next Step**: Start using PostgreSQL models

---

## 🎯 What We Built

### 3 Core Files Created

1. **`/server/db/postgres-sequelize.js`** - PostgreSQL connection with Sequelize
2. **`/server/db/dual-write-adapter.js`** - Write to both databases, read from PostgreSQL
3. **`/server/models/postgres/user.model.postgres.js`** - First PostgreSQL model example

### Architecture Changed

```
BEFORE: MariaDB (Primary) + PostgreSQL (Helper for AI only)
AFTER:  PostgreSQL (Primary) + MariaDB (Legacy backup)
```

---

## 🚀 How to Start Using It

### Step 1: Environment Setup

Your existing `.env` already has PostgreSQL configured:
```bash
POSTGRES_HOST=127.0.0.1
POSTGRES_PORT=5432
POSTGRES_DATABASE=mediczy_ai
POSTGRES_USER=mediczy_helper
POSTGRES_PASSWORD=Mediczy2024Helper
```

Add these new variables:
```bash
# Migration Control
MIGRATION_MODE=dual-write          # Write to both, read from PostgreSQL
READ_FROM_POSTGRES=true
WRITE_TO_POSTGRES=true
WRITE_TO_MARIADB=true             # Keep as backup during migration
```

### Step 2: Test PostgreSQL Connection

```bash
cd /home/ubuntu/Mediczy/server
node -e "
import { connectToPostgresDB } from './db/postgres-sequelize.js';
await connectToPostgresDB();
console.log('✅ PostgreSQL connected!');
process.exit(0);
"
```

### Step 3: Create User Table in PostgreSQL

```bash
# Connect to PostgreSQL
psql -h 127.0.0.1 -U mediczy_helper -d mediczy_ai

# Inside psql, sync the User model
# (Or run this from Node.js)
```

From Node.js:
```javascript
import User from './models/postgres/user.model.postgres.js';

// Sync table (creates if not exists)
await User.sync({ alter: true });
console.log('✅ User table created in PostgreSQL');
```

### Step 4: Use Dual-Write in Your Routes

**Example: User Registration Route**

```javascript
// BEFORE (MariaDB only):
import User from './models/user.model.mariadb.js';

app.post('/api/auth/register', async (req, res) => {
  const user = await User.create(req.body);
  res.json(user);
});

// AFTER (Dual-write to both databases):
import { dualWriteAdapter } from './db/dual-write-adapter.js';
import UserMaria from './models/user.model.mariadb.js';
import UserPostgres from './models/postgres/user.model.postgres.js';

app.post('/api/auth/register', async (req, res) => {
  // Writes to both PostgreSQL AND MariaDB
  const user = await dualWriteAdapter.create(
    UserMaria, 
    UserPostgres, 
    req.body
  );
  res.json(user);
});
```

**Example: Get All Users**

```javascript
// AFTER (Reads from PostgreSQL first, falls back to MariaDB):
app.get('/api/users', async (req, res) => {
  // Reads from PostgreSQL, falls back to MariaDB if error
  const users = await dualWriteAdapter.findAll(
    UserMaria,
    UserPostgres,
    { where: { status: 'active' } }
  );
  res.json(users);
});
```

---

## 🎨 PostgreSQL-Specific Features in User Model

### 1. JSONB Fields (Flexible Schema)

```javascript
// Store any JSON data with fast queries
const user = await UserPostgres.create({
  firstName: 'John',
  lastName: 'Doe',
  email: 'john@example.com',
  
  // JSONB field - can store any structure
  preferences: {
    language: 'en',
    notifications: {
      email: true,
      sms: false,
      push: true
    },
    theme: 'dark'
  },
  
  // Another JSONB field
  metadata: {
    source: 'mobile_app',
    campaign: 'holiday_2024',
    referral_code: 'ABC123'
  }
});

// Query JSONB efficiently with GIN index
const darkModeUsers = await UserPostgres.findAll({
  where: sequelize.literal(
    "preferences @> '{\"theme\": \"dark\"}'"
  )
});
```

### 2. Array Fields (Native PostgreSQL Arrays)

```javascript
// Store arrays directly (not JSON strings!)
const user = await UserPostgres.create({
  firstName: 'Jane',
  lastName: 'Smith',
  email: 'jane@example.com',
  
  // PostgreSQL array types
  allergies: ['Penicillin', 'Peanuts', 'Shellfish'],
  medications: ['Lisinopril 10mg', 'Metformin 500mg'],
  chronicConditions: ['Hypertension', 'Type 2 Diabetes']
});

// Query arrays
const penicillinAllergic = await UserPostgres.findAll({
  where: sequelize.literal(
    "'Penicillin' = ANY(allergies)"
  )
});
```

### 3. Full-Text Search

```javascript
// Search across firstName, lastName, email, phone
const results = await UserPostgres.findBySearch('john smith');

// Custom search query
const advancedResults = await UserPostgres.findAll({
  where: sequelize.literal(
    "search_vector @@ to_tsquery('english', 'john & smith')"
  )
});
```

### 4. Multi-Tenant Support

```javascript
// Create user in specific organization
const user = await UserPostgres.create({
  firstName: 'Dr. Sarah',
  lastName: 'Johnson',
  email: 'sarah@hospital.com',
  organization_id: 123,              // Hospital ID
  organization_type: 'hospital'
});

// Find all users in an organization
const orgUsers = await UserPostgres.findByOrganization(123);
```

---

## 📊 Data Migration Strategy

### Option 1: Migrate Existing Data (Recommended)

```bash
# Create migration script
node server/scripts/migrate-users-to-postgres.js
```

Script template:
```javascript
import UserMaria from './models/user.model.mariadb.js';
import UserPostgres from './models/postgres/user.model.postgres.js';

async function migrateUsers() {
  const mariaUsers = await UserMaria.findAll({ raw: true });
  
  for (const user of mariaUsers) {
    try {
      await UserPostgres.upsert(user);
      console.log(`✅ Migrated user ${user.id}`);
    } catch (error) {
      console.error(`❌ Failed to migrate user ${user.id}:`, error.message);
    }
  }
  
  console.log(`✅ Migrated ${mariaUsers.length} users`);
}

migrateUsers();
```

### Option 2: Gradual Migration (Low Risk)

1. **New users** → written to both databases automatically (dual-write)
2. **Existing users** → remain in MariaDB, read from there
3. **After 30 days** → migrate remaining users from MariaDB to PostgreSQL
4. **After 60 days** → switch to PostgreSQL-only mode

---

## 🔧 PostgreSQL Advantages You Now Have

### 1. Better JSON Support
- **MariaDB**: JSON stored as TEXT, slow queries
- **PostgreSQL**: Native JSONB with GIN indexes, 10-100x faster

### 2. Array Types
- **MariaDB**: Store as comma-separated strings `"A,B,C"`
- **PostgreSQL**: Native arrays `['A', 'B', 'C']` with array operators

### 3. Full-Text Search
- **MariaDB**: LIKE queries, slow, no relevance ranking
- **PostgreSQL**: Built-in tsvector, fast, ranked results

### 4. Better Concurrency
- **MariaDB**: Table-level locks can block
- **PostgreSQL**: MVCC (Multi-Version Concurrency Control) = no blocking

### 5. Advanced Indexes
- **MariaDB**: B-tree indexes only
- **PostgreSQL**: GIN, GiST, BRIN, partial, expression indexes

### 6. Row-Level Security (Coming Soon)
```sql
-- PostgreSQL can enforce multi-tenant isolation at DB level
CREATE POLICY tenant_isolation ON users
  USING (organization_id = current_setting('app.current_org_id')::int);
```

---

## 🎯 Next Steps

### Immediate (This Week)
1. ✅ Test PostgreSQL connection
2. ✅ Sync User model to PostgreSQL
3. ⏳ Migrate existing users data
4. ⏳ Update 1-2 API routes to use dual-write
5. ⏳ Test and verify data consistency

### Short-Term (Next 2 Weeks)
1. Create Doctor model for PostgreSQL
2. Create Appointment model for PostgreSQL
3. Create Prescription model for PostgreSQL
4. Update all user-related routes
5. Update all appointment routes

### Medium-Term (1-2 Months)
1. Migrate all remaining tables
2. Implement full-text search for prescriptions
3. Add JSONB fields for flexible metadata
4. Implement row-level security for multi-tenant
5. Set up read replicas for scaling

### Long-Term (3-6 Months)
1. Switch to `postgres-only` mode
2. Make MariaDB read-only (backup only)
3. Archive MariaDB data
4. Remove MariaDB dependencies
5. Celebrate! 🎉

---

## 🆘 Troubleshooting

### PostgreSQL won't connect
```bash
# Check if PostgreSQL is running
sudo systemctl status postgresql

# Check if database exists
psql -h 127.0.0.1 -U postgres -l | grep mediczy

# Create database if missing
psql -h 127.0.0.1 -U postgres -c "CREATE DATABASE mediczy_ai;"

# Grant permissions
psql -h 127.0.0.1 -U postgres -c "
  CREATE USER mediczy_helper WITH PASSWORD 'Mediczy2024Helper';
  GRANT ALL PRIVILEGES ON DATABASE mediczy_ai TO mediczy_helper;
"
```

### Dual-write errors
```bash
# Temporary: Use PostgreSQL only
export MIGRATION_MODE=postgres-only

# Or rollback to MariaDB
export MIGRATION_MODE=mariadb-only
```

### Data not syncing
```bash
# Check dual-write adapter logs
tail -f logs/app.log | grep "PostgreSQL\|MariaDB"

# Verify both databases have data
# PostgreSQL:
psql -h 127.0.0.1 -U mediczy_helper -d mediczy_ai -c "SELECT COUNT(*) FROM users;"

# MariaDB:
mysql -u root -p mediczy -e "SELECT COUNT(*) FROM users;"
```

---

## 📚 Resources

- [PostgreSQL JSONB Documentation](https://www.postgresql.org/docs/current/datatype-json.html)
- [PostgreSQL Array Types](https://www.postgresql.org/docs/current/arrays.html)
- [PostgreSQL Full-Text Search](https://www.postgresql.org/docs/current/textsearch.html)
- [Sequelize PostgreSQL Guide](https://sequelize.org/docs/v6/other-topics/dialect-specific-things/#postgresql)

---

**You're all set!** The infrastructure is ready. Start with Step 1 (test connection) and gradually migrate your tables. 🚀
