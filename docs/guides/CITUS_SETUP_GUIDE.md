# Citus Distributed PostgreSQL Setup Guide

## Overview
Citus transforms PostgreSQL into a distributed database for horizontal scaling. Currently **disabled** - requires PostgreSQL extension installation.

## Current Status
- **DuckDB**: ✅ **Enabled** (analytics engine for OLAP queries)
- **Citus**: ❌ **Not installed** (requires PostgreSQL extension)

## Prerequisites

### 1. Install Citus Extension
```bash
# Ubuntu/Debian
curl https://install.citusdata.com/community/deb.sh | sudo bash
sudo apt-get install postgresql-16-citus-12.1

# Or compile from source
git clone https://github.com/citusdata/citus.git
cd citus
./configure
make
sudo make install
```

### 2. Configure PostgreSQL
Edit `/etc/postgresql/16/main/postgresql.conf`:
```conf
# Add to shared_preload_libraries
shared_preload_libraries = 'citus,pg_stat_statements'

# Citus configuration
citus.node_conninfo = 'sslmode=prefer'
citus.max_cached_connection_lifetime = 600000
citus.max_cached_connections_per_worker = 1
```

### 3. Restart PostgreSQL
```bash
sudo systemctl restart postgresql
```

### 4. Enable Citus Extension
```sql
-- Connect as superuser
psql -U postgres -d mediczy_ai

-- Create extension
CREATE EXTENSION IF NOT EXISTS citus;

-- Verify installation
SELECT * FROM citus_version();
```

## Enabling Citus in Mediczy

### 1. Update Environment Variables
Edit `/home/ubuntu/Mediczy/.env`:
```env
# PostgreSQL Extensions Configuration
CITUS_ENABLED=true
CITUS_WORKERS=worker1:5432,worker2:5432  # Optional: Add worker nodes
```

### 2. Configure Distributed Tables
```sql
-- Make tables distributed (shard by user_id for multi-tenancy)
SELECT create_distributed_table('appointments', 'user_id');
SELECT create_distributed_table('medical_records', 'user_id');
SELECT create_distributed_table('consultations', 'user_id');
SELECT create_distributed_table('notifications', 'user_id');

-- Or use reference tables (replicated on all nodes)
SELECT create_reference_table('hospitals');
SELECT create_reference_table('specializations');
```

### 3. Add Worker Nodes (Optional)
```sql
-- Add worker nodes to the cluster
SELECT citus_add_node('worker1.example.com', 5432);
SELECT citus_add_node('worker2.example.com', 5432);

-- Verify cluster
SELECT * FROM citus_get_active_worker_nodes();
```

### 4. Restart Mediczy
```bash
pm2 restart mediczy-server
```

## Verification

Check health endpoint:
```bash
curl -s http://localhost:8000/api/db/health | jq '.databases.citus'
# Should return: true
```

Check Citus status:
```sql
-- View distributed tables
SELECT * FROM citus_tables;

-- View shard distribution
SELECT * FROM citus_shards;

-- View worker nodes
SELECT * FROM citus_get_active_worker_nodes();
```

## Architecture Patterns

### Single-Node Citus (Current Setup)
- **Use Case**: Vertical scaling, advanced PostgreSQL features
- **Benefits**: Columnar storage, parallel query execution
- **No Workers Required**: Runs on coordinator only

### Multi-Node Citus (Production Scale)
- **Use Case**: Horizontal scaling, high throughput
- **Benefits**: Distributed queries, data sharding
- **Requires**: 2+ worker nodes

## Performance Tuning

### Shard Count
```sql
-- Set shard count (default: 32)
-- Higher for more parallelism, lower for smaller datasets
SET citus.shard_count = 64;
```

### Columnar Storage
```sql
-- Convert table to columnar for analytics
SELECT alter_table_set_access_method('appointment_analytics', 'columnar');
```

### Query Optimization
```sql
-- Enable parallel execution
SET citus.enable_repartition_joins = on;
SET citus.enable_parallel_aggregates = on;
```

## Current Database Health

```json
{
  "databases": {
    "postgresSequelize": true,  // ✅ Primary transactional DB
    "postgres": true,            // ✅ Helper DB with pgvector
    "pgvector": true,            // ✅ Vector embeddings
    "citus": false,              // ❌ Not installed (optional)
    "duckdb": true,              // ✅ Analytics engine (enabled)
    "redis": true,               // ✅ Cache layer
    "timescale": false,          // ❌ Not installed (optional)
    "columnar": false,           // ❌ Requires Citus
    "jsonb": true                // ✅ Native PostgreSQL
  },
  "connections": "6/9"
}
```

## Benefits of Enabling Citus

### Performance
- **Parallel Query Execution**: Utilize multiple cores
- **Columnar Storage**: 10-100x compression for analytics
- **Distributed Aggregations**: Faster GROUP BY queries

### Scalability
- **Horizontal Scaling**: Add worker nodes for more capacity
- **Sharding**: Distribute data across nodes
- **Load Balancing**: Automatic query distribution

### Multi-Tenancy
- **Tenant Isolation**: Shard by tenant_id/user_id
- **Performance Isolation**: Each tenant gets dedicated shards
- **Cost Efficiency**: Single cluster for all tenants

## When to Enable Citus

✅ **Enable Citus If:**
- Handling > 10M records
- Need distributed PostgreSQL
- Multi-tenant architecture
- Heavy analytics workload
- Horizontal scaling required

❌ **Skip Citus If:**
- Small to medium datasets (< 10M records)
- Single-node sufficient
- DuckDB handles analytics needs
- Simpler architecture preferred

## Troubleshooting

### Citus not detected
```bash
# Check if extension is installed
psql -U postgres -d mediczy_ai -c "SELECT * FROM pg_available_extensions WHERE name='citus';"

# Check shared libraries
psql -U postgres -c "SHOW shared_preload_libraries;"
```

### Worker connection issues
```sql
-- Test worker connectivity
SELECT citus_check_cluster_node_health();

-- Remove problematic worker
SELECT citus_remove_node('worker1', 5432);
```

### Performance issues
```sql
-- View query statistics
SELECT * FROM citus_stat_statements;

-- View shard placement
SELECT * FROM citus_shard_placement;
```

## References

- [Citus Documentation](https://docs.citusdata.com/)
- [Citus GitHub](https://github.com/citusdata/citus)
- [Multi-Tenant Applications](https://docs.citusdata.com/en/stable/use_cases/multi_tenant.html)
- [Real-Time Analytics](https://docs.citusdata.com/en/stable/use_cases/real_time_analytics.html)

---

**Status**: ✅ DuckDB enabled for analytics | ❌ Citus available but not installed  
**Recommendation**: Current setup sufficient for < 10M records. Enable Citus when scaling beyond single-node capacity.
