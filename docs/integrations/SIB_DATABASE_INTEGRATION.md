# 🔌 SIB Database Integration Complete

## Overview

The Synthetic Intelligence Brain (SIB) is now fully connected to the Mediczy Intelligent DB Infrastructure, providing persistent storage and advanced database capabilities.

## Database Architecture

```
┌──────────────────────────────────────────────────────────────┐
│              SIB - INTELLIGENT DB INTEGRATION                 │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │          PostgreSQL (Primary Database)                │   │
│  │  • Transactional data storage                        │   │
│  │  • Chat history (sib_chat_history)                   │   │
│  │  • Patient context (sib_patient_context)             │   │
│  │  • Tasks (sib_tasks)                                 │   │
│  │  • Notifications (sib_notifications)                 │   │
│  │  • EHR logs (sib_ehr_logs)                           │   │
│  │  • JSONB support for flexible schemas                │   │
│  └──────────────────────────────────────────────────────┘   │
│                           │                                  │
│  ┌──────────────────────────────────────────────────────┐   │
│  │         pgvector (Vector Database)                    │   │
│  │  • Vector embeddings (sib_embeddings)                │   │
│  │  • Semantic search capability                        │   │
│  │  • Cosine similarity search                          │   │
│  │  • 1536-dimension vectors                            │   │
│  │  • IVFFlat index for fast retrieval                  │   │
│  └──────────────────────────────────────────────────────┘   │
│                           │                                  │
│  ┌──────────────────────────────────────────────────────┐   │
│  │            DuckDB (Analytics Engine)                  │   │
│  │  • OLAP queries                                      │   │
│  │  • Aggregations and reporting                        │   │
│  │  • Data export for analysis                          │   │
│  │  • PostgreSQL data sync                              │   │
│  └──────────────────────────────────────────────────────┘   │
│                           │                                  │
│  ┌──────────────────────────────────────────────────────┐   │
│  │             Citus (Distributed PostgreSQL)            │   │
│  │  • Horizontal scaling capability                     │   │
│  │  • Distributed queries                               │   │
│  │  • Multi-tenant support                              │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

## Database Tables Created

### 1. `sib_chat_history`
Stores multi-turn conversation history.

```sql
CREATE TABLE sib_chat_history (
    id SERIAL PRIMARY KEY,
    conversation_id VARCHAR(255) NOT NULL,
    patient_id VARCHAR(255),
    role VARCHAR(50) NOT NULL,
    content TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 2. `sib_patient_context`
Patient context and health data with JSONB.

```sql
CREATE TABLE sib_patient_context (
    id SERIAL PRIMARY KEY,
    patient_id VARCHAR(255) UNIQUE NOT NULL,
    context_data JSONB NOT NULL,
    health_metrics JSONB DEFAULT '{}',
    preferences JSONB DEFAULT '{}',
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 3. `sib_tasks`
Task management and workflow tracking.

```sql
CREATE TABLE sib_tasks (
    id SERIAL PRIMARY KEY,
    task_id VARCHAR(255) UNIQUE NOT NULL,
    patient_id VARCHAR(255),
    title VARCHAR(500) NOT NULL,
    description TEXT,
    task_type VARCHAR(100),
    priority VARCHAR(50) DEFAULT 'medium',
    status VARCHAR(50) DEFAULT 'pending',
    due_date TIMESTAMP,
    completed_at TIMESTAMP,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 4. `sib_notifications`
Notifications and alerts.

```sql
CREATE TABLE sib_notifications (
    id SERIAL PRIMARY KEY,
    notification_id VARCHAR(255) UNIQUE NOT NULL,
    patient_id VARCHAR(255),
    title VARCHAR(500) NOT NULL,
    message TEXT NOT NULL,
    type VARCHAR(100) DEFAULT 'info',
    severity VARCHAR(50) DEFAULT 'low',
    channels JSONB DEFAULT '[]',
    status VARCHAR(50) DEFAULT 'pending',
    scheduled_for TIMESTAMP,
    sent_at TIMESTAMP,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 5. `sib_embeddings` (pgvector)
Vector embeddings for semantic search.

```sql
CREATE TABLE sib_embeddings (
    id SERIAL PRIMARY KEY,
    source_type VARCHAR(100) NOT NULL,
    source_id VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    embedding vector(1536),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_sib_embeddings_vector 
ON sib_embeddings 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);
```

### 6. `sib_ehr_logs`
EHR file processing logs.

```sql
CREATE TABLE sib_ehr_logs (
    id SERIAL PRIMARY KEY,
    patient_id VARCHAR(255),
    file_name VARCHAR(500),
    file_type VARCHAR(50),
    file_size INTEGER,
    processing_status VARCHAR(50) DEFAULT 'pending',
    extracted_data JSONB DEFAULT '{}',
    error_message TEXT,
    processed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## Features Enabled

### ✅ Persistent Storage
- **Chat history survives restarts** - No more lost conversations
- **Patient context persists** - Health data maintained across sessions
- **Tasks stored permanently** - Workflow tracking with history
- **Notifications queued** - Scheduled alerts preserved

### ✅ Vector Search (pgvector)
- **Semantic medical search** - Find similar cases, symptoms, treatments
- **RAG enhancement** - Retrieve relevant context for AI responses
- **1536-dimension embeddings** - Compatible with OpenAI/Sentence-Transformers
- **IVFFlat indexing** - Fast approximate nearest neighbor search

### ✅ Analytics (DuckDB)
- **OLAP queries** - Complex aggregations on medical data
- **Reporting** - Generate insights from historical data
- **Data export** - Extract data for analysis tools
- **PostgreSQL sync** - Replicate tables for analytics workloads

### ✅ Distributed Queries (Citus)
- **Horizontal scaling** - Shard data across nodes
- **Multi-tenant support** - Isolate data by organization
- **Distributed joins** - Query across sharded tables

### ✅ JSONB Support
- **Flexible schemas** - Store nested medical data
- **Fast queries** - Index JSONB fields
- **Schema evolution** - Adapt to changing requirements

## Connection Configuration

SIB uses the same environment variables as the Node.js backend:

```bash
# PostgreSQL Primary
POSTGRES_HOST=127.0.0.1
POSTGRES_PORT=5432
POSTGRES_DATABASE=mediczy_ai
POSTGRES_USER=mediczy_helper
POSTGRES_PASSWORD=your_password

# pgvector
PGVECTOR_DIMENSION=1536

# DuckDB
DUCKDB_ENABLED=true
DUCKDB_PATH=:memory:  # or /path/to/duckdb.db

# Citus (if available)
CITUS_ENABLED=true
```

## Usage Examples

### Chat with Persistence

```python
from sib.database import get_db_manager

db = get_db_manager()

# Save chat message (automatically persisted)
await db.save_chat_message(
    conversation_id="conv_123",
    patient_id="P12345",
    role="user",
    content="I have a headache",
    metadata={"severity": "moderate"}
)

# Retrieve history
history = await db.get_chat_history("conv_123", limit=20)
```

### Patient Context with JSONB

```python
# Save patient context
await db.save_patient_context(
    patient_id="P12345",
    context_data={
        "name": "John Doe",
        "age": 45,
        "conditions": ["hypertension", "diabetes"],
        "last_visit": "2025-01-15"
    },
    health_metrics={
        "bp": "140/90",
        "glucose": 120,
        "weight": 85
    },
    preferences={
        "language": "en",
        "notification_channels": ["email", "sms"]
    }
)

# Retrieve context
context = await db.get_patient_context("P12345")
```

### Vector Search

```python
# Store embedding
await db.store_embedding(
    source_type="medical_note",
    source_id="note_456",
    content="Patient presents with chest pain and shortness of breath",
    embedding=[0.1, 0.2, ...],  # 1536-dim vector
    metadata={"specialty": "cardiology", "date": "2025-01-15"}
)

# Search similar
results = await db.search_similar(
    query_embedding=[0.1, 0.2, ...],
    source_type="medical_note",
    limit=5
)
# Returns top 5 most similar medical notes
```

### Task Management

```python
# Create task
task_id = await db.create_task({
    "patient_id": "P12345",
    "title": "Follow-up lab work",
    "description": "Order CBC and metabolic panel",
    "task_type": "lab_order",
    "priority": "high",
    "due_date": "2025-02-01",
    "metadata": {"ordered_by": "Dr. Smith"}
})

# Update task
await db.update_task(task_id, {
    "status": "in_progress",
    "notes": "Lab scheduled for tomorrow"
})

# List tasks
tasks = await db.get_tasks(patient_id="P12345", status="pending")
```

### Analytics with DuckDB

```python
# Sync PostgreSQL table to DuckDB
await db.sync_to_duckdb("sib_chat_history")

# Run analytics query
results = db.execute_analytics_query("""
    SELECT 
        DATE_TRUNC('day', created_at) as date,
        COUNT(*) as message_count,
        COUNT(DISTINCT conversation_id) as unique_conversations
    FROM sib_chat_history
    WHERE created_at >= CURRENT_DATE - INTERVAL 7 DAY
    GROUP BY date
    ORDER BY date
""")
```

## Performance Optimizations

### Indexes Created
- Conversation lookup: `idx_conversation_id`
- Patient queries: `idx_patient_id`
- Task status: `idx_status`
- Time-based queries: `idx_created_at`, `idx_due_date`
- Vector similarity: `idx_sib_embeddings_vector` (IVFFlat)

### Connection Pooling
- **Min connections**: 5
- **Max connections**: 20
- **Connection timeout**: 30 seconds
- **Automatic reconnection** on failure

### In-Memory Caching
- Frequently accessed data cached in-memory
- TTL-based cache expiration
- Falls back to DB if cache miss

## Monitoring

Check database status via health endpoint:

```bash
curl http://localhost:8001/health
```

Response:
```json
{
  "status": "healthy",
  "uptime_seconds": 3600,
  "database": {
    "connected": true,
    "postgres": true,
    "pgvector": true,
    "citus": true,
    "duckdb": true,
    "jsonb": true,
    "vector_dimension": 1536
  },
  "intelligent_db": {
    "architecture": "PostgreSQL + pgvector + DuckDB + Citus",
    "features": ["JSONB", "Vector Search", "Analytics", "Distributed Queries"]
  }
}
```

## Migration Notes

### Backward Compatibility
- **Fallback mode**: If database unavailable, SIB uses in-memory storage
- **Graceful degradation**: Application continues without DB features
- **No breaking changes**: Existing code works without modification

### Data Migration
To migrate existing in-memory data to PostgreSQL:

```python
# Export current in-memory state
state = memory.export_state()

# Import into database (one-time)
for conv_id, messages in state["conversations"].items():
    for msg in messages:
        await db.save_chat_message(
            conv_id, 
            None, 
            msg["role"], 
            msg["content"], 
            msg.get("metadata")
        )
```

## Troubleshooting

### Database Connection Issues

1. **Check environment variables**:
   ```bash
   env | grep POSTGRES
   env | grep DUCKDB
   ```

2. **Test PostgreSQL connection**:
   ```bash
   psql -h 127.0.0.1 -p 5432 -U mediczy_helper -d mediczy_ai
   ```

3. **Check SIB logs**:
   ```bash
   pm2 logs mediczy-sib
   ```

4. **Verify tables created**:
   ```sql
   \dt sib_*
   ```

### pgvector Issues

If vector extension not available:
```sql
CREATE EXTENSION vector;
```

If permission denied:
```bash
sudo apt-get install postgresql-16-pgvector
```

### Performance Issues

1. **Check connection pool**:
   - Increase `max_size` if seeing connection timeouts
   - Monitor active connections: `SELECT * FROM pg_stat_activity;`

2. **Optimize queries**:
   - Use indexes for frequent queries
   - Limit result sets appropriately
   - Cache frequently accessed data

3. **DuckDB memory**:
   - Use file-based DuckDB for large datasets
   - Set `DUCKDB_PATH` to persistent location

## Next Steps

### Recommended Enhancements

1. **Enable TimescaleDB** for time-series health data
2. **Setup Citus sharding** for multi-tenant isolation
3. **Implement Redis caching** for hot data
4. **Add backup automation** for PostgreSQL
5. **Setup read replicas** for analytics queries
6. **Implement partitioning** for large tables

## Support

For issues or questions:
- Check logs: `pm2 logs mediczy-sib`
- Health endpoint: `http://localhost:8001/health`
- Database stats: `SELECT * FROM pg_stat_database WHERE datname = 'mediczy_ai';`

---

**Status**: ✅ SIB Database Integration Complete  
**Version**: 2.1.0  
**Last Updated**: 2025-12-19
