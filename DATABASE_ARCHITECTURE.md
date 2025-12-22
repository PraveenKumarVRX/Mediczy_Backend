# Multi-Database Architecture for Mediczy

## 🎯 Architecture Overview

Mediczy uses a **robust 3-database ecosystem** with each database serving specific purposes:

```
┌─────────────────────────────────────────────────────────────┐
│                     APPLICATION LAYER                        │
│                    (Node.js / Express)                       │
└───────┬──────────────┬──────────────┬──────────────┬───────┘
    │              │              │              │
    ▼              ▼              ▼              ▼
  ┌──────────┐   ┌───────────────┐   ┌──────────┐   ┌──────────┐
  │ MariaDB  │   │ PostgreSQL    │   │ DuckDB   │   │ Kafka    │
  │ PRIMARY  │   │(Citus+PGVector│   │ANALYTICS │   │ EVENTS   │
  │ OLTP     │   │ JSONB Helper) │   │ OLAP     │   │ BUS      │
  └──────────┘   └───────────────┘   └──────────┘   └──────────┘
    │              │              │
    └──────┬───────┴──────────────┘
       ▼
     ┌──────────┐
     │ Redis    │
     │ CACHE    │
     │ + QUEUES │
     └──────────┘
```

---

## 1️⃣ MariaDB - PRIMARY DATABASE

**Version**: 10.5.29  
**Role**: Primary transactional database  
**Status**: ✅ Running

### Purpose
- **Core application data** with ACID compliance
- **Relational data** requiring strong consistency
- **Transactional operations**

### Use Cases
✅ User accounts and authentication  
✅ Patient records (PHI/PII data)  
✅ Doctor profiles and schedules  
✅ Appointments and bookings  
✅ Prescriptions and medications  
✅ Hospital/clinic information  
✅ Insurance policies  
✅ Billing and payments  
✅ Medical records with relationships  

### Configuration
```javascript
Host: localhost
Port: 3306
Database: mediczy
Connection Pool: 20 connections
Idle Timeout: 60 seconds
```

### When to Use MariaDB
- **CREATE/UPDATE/DELETE** operations requiring transactions
- **Complex JOINs** across multiple tables
- **Data integrity** is critical
- **ACID compliance** needed

---

## 2️⃣ PostgreSQL Helper - CITUS + PGVECTOR + JSONB

**Version**: 16.x (Citus 12.x extension)  
**Role**: Distributed helper datastore for semi-structured documents, replicas, and embeddings  
**Status**: ✅ Running (coordinator) / ⚙️ Scales horizontally with worker nodes

### Purpose
- **JSONB-powered helper** for unstructured and semi-structured payloads
- **Citus distributed sharding** for high write/lookup throughput
- **PGVector** for AI embeddings, semantic search, and RAG pipelines
- **Context cache** for chatbot sessions, helper replicas, and analytics staging

### Key Capabilities
| Feature | Description |
|---------|-------------|
| JSONB Documents | Flexible payloads with GIN indexes for filtered lookups |
| Citus Distribution | Hash-distributed tables across worker nodes via `CITUS_WORKERS` |
| PGVector | Native vector column + IVFFlat index for similarity search |
| Helper Replicas | Keeps denormalized snapshots from MariaDB for Docsgpt replacement |

### Use Cases
✅ Chatbot session transcripts + context snapshots (JSONB + distributed)  
✅ Helper replica tables for Docsgpt retirement (JSONB payloads)  
✅ AI embeddings (`medical_embeddings`) with semantic search (PGVector)  
✅ Audit/context logs needing flexible schema  
✅ Feature toggles, personalization metadata, rapid prototyping datasets  

### Configuration Snippet
```bash
POSTGRES_HOST=postgres-coordinator
POSTGRES_USER=mediczy_helper
POSTGRES_DATABASE=mediczy_ai
POSTGRES_PASSWORD=********
CITUS_ENABLED=true
CITUS_WORKERS=pg-worker-1:5432,pg-worker-2:5432
PGVECTOR_ENABLED=true
PGVECTOR_DIMENSION=1536
PGVECTOR_DISTANCE=cosine
```

### Schema Highlights
```sql
CREATE TABLE chatbot_sessions (
  session_id TEXT PRIMARY KEY,
  user_id TEXT,
  context_snapshot JSONB,
  messages JSONB,
  metadata JSONB,
  last_provider TEXT,
  last_intent TEXT,
  last_interaction_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE helper_replicas (
  collection TEXT,
  source_id TEXT,
  payload JSONB NOT NULL,
  metadata JSONB,
  replicated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (collection, source_id)
);

CREATE TABLE medical_embeddings (
  embedding_id TEXT PRIMARY KEY,
  namespace TEXT DEFAULT 'default',
  metadata JSONB,
  vector VECTOR(1536) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

Tables automatically call `create_distributed_table` when Citus is enabled and build IVFFlat indexes for PGVector.

### When to Use the PostgreSQL Helper
- **JSONB documents** that need SQL joins/filters
- **Embeddings or semantic search** inside the primary data plane
- **Distributed helper workloads** replacing Docsgpt/Mongo
 - **Distributed helper workloads** replacing Docsgpt/Mongo
- **Cross-service caches** that benefit from SQL semantics

---

## 3️⃣ Redis - CACHE + EDGE SESSION LAYER

**Version**: 7.x (cluster-ready)  
**Role**: Low-latency cache for embeddings metadata, chatbot sessions, rate limits, and queue coordination  
**Status**: ✅ Running (ioredis client with auto-retry)

### Purpose
- Keep hot embedding metadata close to the edge for sub-millisecond lookups
- Provide TTL-based session + token storage for compliance-friendly expiration
- Maintain realtime sorted sets for "most recent" embeddings per namespace and globally
- Serve as ephemeral queue/lock layer for async workers processing Kafka events

### Key Structures
- `mediczy:embeddings:item:{namespace}:{id}` → JSON blob with metadata + timestamps
- `mediczy:embeddings:recent:{namespace}` → Sorted set (score = updatedAt) for namespace paging
- `mediczy:embeddings:recent:__all__` → Global sorted set powering cross-namespace listings
- `bull:*` / `queue:*` → BullMQ / async queues (existing workers)

### Integration with PostgreSQL Helper
1. Embedding upsert lands in Postgres (JSONB + vector) via PGVector.
2. Repository writes Redis item + sorted set entries with TTL (`EMBEDDING_CACHE_TTL`).
3. List/search endpoints read from Redis first; cache misses fall back to Postgres.
4. Deletes evict Redis keys + sorted set members to avoid stale reads.

### Configuration
```bash
REDIS_URL=redis://:secure@redis:6379
EMBEDDING_CACHE_TTL=86400   # seconds
```

### When to Use Redis
- Eliminating round-trips for frequently-read helper documents
- Serving embeddings metadata to UI/LLM providers without touching Postgres
- Coordinating rate limits, sessions, OTPs, and queue locks

## 4️⃣ Kafka - EVENT STREAMING FABRIC

**Version**: Kafka 3.x (via `kafkajs`)  
**Role**: Durable bus for helper replica + embedding lifecycle events  
**Status**: ✅ Producer/consumer auto-connect (skips when `DISABLE_KAFKA=true`)

### Purpose
- Broadcast embedding mutations (`EMBEDDING_EVENTS`) so downstream AI workers can refresh indexes
- Stream analytics/systems events without coupling to OLTP transactions
- Provide at-least-once delivery for Docsgpt replacement services (e.g., search assistants, audit sinks)

### Topics
| Topic | Description |
|-------|-------------|
| `embedding-events` | CRUD + search telemetry for embeddings (PGVector/JSONB)
| `analytics-events` | Existing system analytics events (fallback for embeddings if dedicated topic unavailable)
| `system-events`, `notification-events`, etc. | Legacy topics described in `server/config/kafka.js`

### Integration Flow
1. API writes embeddings into Postgres helper.
2. Repository emits Kafka event `{ action: 'embedding.upserted', data: {...} }` via producer.
3. Workers consume topic → update derivative indexes (OpenSearch, Pinecone, etc.) or fire audits.
4. Deletes broadcast `embedding.deleted`, prompting workers to purge caches/search indexes.

### Configuration
```bash
KAFKA_CLIENT_ID=mediczy-server
KAFKA_BROKERS=broker-1:9092,broker-2:9092
KAFKA_CONSUMER_GROUP=mediczy-consumers
DISABLE_KAFKA=false
```

### When to Use Kafka
- Fan-out embedding or helper changes to external search stacks
- Stream compliance/audit notifications derived from PostgreSQL helper events
- Drive async enrichment or analytics tasks without blocking API threads

## 5️⃣ DuckDB - ANALYTICS ENGINE

**Version**: 1.1.3  
**Role**: OLAP analytics and data warehouse  
**Status**: ✅ Running

### Purpose
- **Analytical queries** (OLAP)
- **Business intelligence**
- **Complex aggregations**
- **Historical data analysis**

### Use Cases
✅ Monthly/yearly business reports  
✅ Patient statistics and trends  
✅ Revenue analytics  
✅ Performance metrics dashboards  
✅ Complex aggregations (GROUP BY, WINDOW functions)  
✅ Historical data analysis  
✅ Data export for ML/AI  
✅ Ad-hoc analytical queries  

### Configuration
```javascript
Path: ./data/analytics.duckdb
Type: Embedded database (file-based)
Access: Via CLI or Python/Node bindings
```

### When to Use DuckDB
- **Read-heavy analytics** queries
- **Aggregations** across large datasets
- **Report generation**
- **Data warehousing** needs
- **OLAP queries** (not OLTP)

---

## 📊 Data Flow Patterns

### Pattern 1: Write to Primary, Replicate to PostgreSQL Helper
```
User Action → MariaDB (transaction) → PostgreSQL Helper (JSONB replica/log)
```

**Example**: User creates appointment
1. Insert into `appointments` table (MariaDB)
2. Push contextual snapshot into `helper_replicas` (PostgreSQL JSONB) for Docsgpt replacement

### Pattern 2: Primary Data + Analytics Sync
```
MariaDB (daily data) → DuckDB (nightly ETL) → Reports
```

**Example**: Generate monthly revenue report
1. Query transactional data from MariaDB
2. ETL process copies data to DuckDB
3. Run complex analytics on DuckDB
4. Generate reports/dashboards

### Pattern 3: Real-time Context + Historical
```
PostgreSQL Helper (chatbot sessions + embeddings) ← → MariaDB (source of truth)
```

**Example**: Dr. iSHA chatbot session
1. Chatbot payload persists to `chatbot_sessions` (JSONB + Citus distribution)
2. Embedding stored in `medical_embeddings` for semantic recall
3. Derived insights periodically synced back to MariaDB for compliance or billing

### Pattern 4: Embedding Pipeline (Postgres + Redis + Kafka)
```
API → PostgreSQL (PGVector JSONB) → Redis cache → Kafka embedding-events → Workers/Search
```

1. `POST /api/embeddings` upserts vector/document into PostgreSQL helper.
2. Repository caches metadata in Redis sorted sets for low-latency listings.
3. Kafka producer emits `embedding.upserted` so downstream consumers refresh derived stores.
4. Deletes follow the same path, purging Redis + notifying via Kafka.

---

## 🔄 Data Synchronization Strategy

### Helper Replica Sync
**Direction**: MariaDB → PostgreSQL Helper (real-time)

```javascript
import { upsertHelperReplica } from '../repositories/helperReplica.repository.js';

await upsertHelperReplica('appointments', {
  sourceId: appointment.id,
  payload: appointment,
  metadata: { actor: userId }
});
```

### Analytics Data Sync
**Direction**: MariaDB → DuckDB (scheduled)

**Frequency**: Daily at 2 AM

```sql
-- Extract data from MariaDB
SELECT * FROM appointments 
WHERE DATE(created_at) = CURDATE() - INTERVAL 1 DAY;

-- Load into DuckDB
INSERT INTO analytics.appointments SELECT * FROM ...;
```

### Session & Embedding Sync
**Direction**: MariaDB ← → PostgreSQL Helper (bidirectional)

- PostgreSQL helper: Active chatbot sessions + embeddings (JSONB + vector)
- MariaDB: Durable history + compliance snapshots

---

## 🔧 Configuration Files

### Database Configuration
**File**: `/root/Mediczy/server/config/databases.js`

Functions:
- `initMariaDB()` - Initialize MariaDB pool
- `initPostgresHelper()` - Connect to PostgreSQL helper (Citus/PGVector)
- `initDuckDB()` - Initialize DuckDB
- `initAllDatabases()` - Initialize all databases
- `closeAllDatabases()` - Graceful shutdown

### Environment Variables
**File**: `/root/Mediczy/server/.env`

```bash
# MariaDB
DB_HOST=localhost
DB_PORT=3306
DB_NAME=mediczy
DB_USER=mediczy
DB_PASSWORD=Mediczy2024Secure

# PostgreSQL Helper (Citus + PGVector)
POSTGRES_HOST=postgres-coordinator
POSTGRES_PORT=5432
POSTGRES_DATABASE=mediczy_ai
POSTGRES_USER=mediczy_helper
POSTGRES_PASSWORD=ChangeMe
CITUS_ENABLED=true
CITUS_WORKERS=pg-worker-1:5432,pg-worker-2:5432
PGVECTOR_ENABLED=true
PGVECTOR_DIMENSION=1536
PGVECTOR_DISTANCE=cosine

# DuckDB
DUCKDB_PATH=./data/analytics.duckdb
```

---

## 🧪 Testing

### Test All Databases
```bash
cd /root/Mediczy/server
node test-databases.js
```

### Expected Output
```
✅ MariaDB (Primary DB) connected successfully
✅ PostgreSQL Helper (Citus + PGVector) connected successfully
✅ DuckDB (Analytics Engine) initialized successfully

📊 Database Architecture Status:
  MariaDB      (Primary):      ✅
  PostgreSQL   (Helper JSONB): ✅
  DuckDB       (Analytics):    ✅

🎉 All databases initialized successfully!
```

---

## 📈 Performance Optimization

### MariaDB
- Connection pooling (20 connections)
- Indexed foreign keys
- Query optimization with EXPLAIN
- Regular ANALYZE TABLE

### PostgreSQL Helper
- JSONB GIN indexes for metadata-rich queries
- `create_distributed_table` for Citus sharding
- Analyze/vacuum to keep statistics fresh
- IVFFlat index maintenance for PGVector embeddings

### DuckDB
- Columnar storage (automatic)
- Parallel query execution
- Vector processing (SIMD)
- Compression (automatic)

---

## 🔒 Security

### MariaDB
- Encrypted connections (SSL/TLS)
- Field-level encryption for PHI
- Row-level security
- Audit logging

### PostgreSQL Helper
- SCRAM or certificate auth via coordinator + workers
- Row-Level Security (optional) for helper replicas
- Encryption at rest / TLS via cloud provider
- Citus worker network isolation + firewalling

### DuckDB
- File-system level security
- Read-only access for analysts
- Separate analytics user credentials

---

## 📊 Monitoring

### Health Checks
```javascript
// Check database status
const health = await initAllDatabases();
console.log(health); // { mariadb: true, postgres: true, duckdb: true }
```

### Metrics to Monitor
- **MariaDB**: Connection pool usage, query time, deadlocks
- **PostgreSQL Helper**: Citus worker health, pool usage, replication lag
- **Redis**: Cache hit ratio, memory usage, key eviction rate, replication lag (if clustered)
- **Kafka**: Producer/consumer lag, broker availability, topic offset growth, rebalance frequency
- **DuckDB**: Query execution time, disk usage

---

## 🚀 Best Practices

### 1. Database Selection
```javascript
// ✅ Use MariaDB for
- User authentication
- Financial transactions
- Data with relationships

// ✅ Use PostgreSQL Helper for
- Logging and contextual replicas
- Flexible JSONB payloads
- Embeddings and similarity search

// ✅ Use Redis for
- Low-latency embedding metadata
- Session/token caches with TTL
- Queue coordination + rate limiting

// ✅ Use Kafka for
- Streaming embedding/helper events
- Downstream analytics fan-out
- Auditable, ordered event logs

// ✅ Use DuckDB for
- Analytics and reporting
- Data warehousing
- Complex aggregations
```

### 2. Data Consistency
- **MariaDB**: Source of truth
- **PostgreSQL Helper**: Eventually consistent helper replicas / embeddings
- **Redis**: Ephemeral cache (eventually consistent, TTL enforced)
- **Kafka**: Authoritative sequence of helper events for async consumers
- **DuckDB**: Read-only analytics (no updates)

### 3. Backup Strategy
- **MariaDB**: Daily mysqldump + binary logs
- **PostgreSQL Helper**: `pg_dump` + WAL archiving + Citus coordinator metadata
- **Redis**: Snapshotting/AOF for critical caches (optional) otherwise rely on Postgres rebuilds
- **Kafka**: Multi-replica topics + tiered storage / snapshot of offsets for disaster recovery
- **DuckDB**: File-based backups (.duckdb file)

---

## 📚 Additional Resources

### Documentation
- MariaDB Config: `/root/Mediczy/server/config/databases.js`
- PostgreSQL Helper Repos: `/root/Mediczy/server/repositories/*`
- Redis Client & helpers: `/root/Mediczy/server/config/redis.js`
- Kafka Client & topics: `/root/Mediczy/server/config/kafka.js`
- Test Script: `/root/Mediczy/server/test-databases.js`

### Tools
- MariaDB CLI: `mysql -u mediczy -p`
- PostgreSQL CLI: `psql`
- Redis CLI: `redis-cli -u $REDIS_URL`
- Kafka CLI: `kafka-console-consumer --topic embedding-events --bootstrap-server ...`
- DuckDB CLI: `duckdb ./data/analytics.duckdb`

---

## ✅ Status Summary

| Database | Version | Status | Purpose |
|----------|---------|--------|---------|
| MariaDB  | 10.5.29 | ✅ Running | Primary/Transactional |
| PostgreSQL Helper | 16.x + Citus | ✅ Running | JSONB Helper / Embeddings |
| Redis    | 7.x     | ✅ Running | Cache / Session / Queue |
| Kafka    | 3.x     | ✅ Running | Event Streaming |
| DuckDB   | 1.1.3   | ✅ Running | Analytics/OLAP |

**System Optimized**: Reduced from 32 to 4 PM2 instances for better performance.

---

**Your multi-database ecosystem is production-ready!** 🎉
