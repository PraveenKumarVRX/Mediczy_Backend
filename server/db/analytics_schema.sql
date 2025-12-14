-- Database Intelligence Analytics Tables
-- Run this to initialize DuckDB analytics storage

-- Query analytics table
CREATE TABLE IF NOT EXISTS query_analytics (
    id INTEGER PRIMARY KEY,
    query_text TEXT,
    query_type VARCHAR,
    target_db VARCHAR,
    processing_time INTEGER,
    cache_hit BOOLEAN,
    timestamp TIMESTAMP,
    user_id VARCHAR,
    context JSON
);

-- Data collection metrics table
CREATE TABLE IF NOT EXISTS collection_metrics (
    id INTEGER PRIMARY KEY,
    data_type VARCHAR,
    primary_storage VARCHAR,
    replica_storage VARCHAR[],
    data_size INTEGER,
    processing_time INTEGER,
    timestamp TIMESTAMP,
    success BOOLEAN
);

-- Database usage statistics table
CREATE TABLE IF NOT EXISTS db_usage_stats (
    id INTEGER PRIMARY KEY,
    database_name VARCHAR,
    operation_type VARCHAR,
    query_count INTEGER,
    avg_response_time FLOAT,
    error_count INTEGER,
    date DATE,
    hour INTEGER
);

-- Intelligent routing decisions table
CREATE TABLE IF NOT EXISTS routing_decisions (
    id INTEGER PRIMARY KEY,
    query_pattern VARCHAR,
    recommended_db VARCHAR,
    confidence_score FLOAT,
    actual_db VARCHAR,
    success BOOLEAN,
    timestamp TIMESTAMP
);

-- Cache performance metrics table
CREATE TABLE IF NOT EXISTS cache_metrics (
    id INTEGER PRIMARY KEY,
    cache_key_pattern VARCHAR,
    hit_count INTEGER,
    miss_count INTEGER,
    avg_ttl INTEGER,
    date DATE
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_query_timestamp ON query_analytics(timestamp);
CREATE INDEX IF NOT EXISTS idx_query_type ON query_analytics(query_type);
CREATE INDEX IF NOT EXISTS idx_target_db ON query_analytics(target_db);
CREATE INDEX IF NOT EXISTS idx_collection_timestamp ON collection_metrics(timestamp);
CREATE INDEX IF NOT EXISTS idx_usage_date ON db_usage_stats(date);
CREATE INDEX IF NOT EXISTS idx_routing_timestamp ON routing_decisions(timestamp);

-- Views for analytics

-- Daily query statistics
CREATE OR REPLACE VIEW daily_query_stats AS
SELECT 
    DATE(timestamp) as date,
    target_db,
    query_type,
    COUNT(*) as total_queries,
    AVG(processing_time) as avg_processing_time,
    SUM(CASE WHEN cache_hit THEN 1 ELSE 0 END) as cache_hits,
    COUNT(*) - SUM(CASE WHEN cache_hit THEN 1 ELSE 0 END) as cache_misses
FROM query_analytics
GROUP BY DATE(timestamp), target_db, query_type;

-- Database efficiency view
CREATE OR REPLACE VIEW db_efficiency AS
SELECT 
    target_db,
    COUNT(*) as query_count,
    AVG(processing_time) as avg_time,
    MIN(processing_time) as min_time,
    MAX(processing_time) as max_time,
    CAST(SUM(CASE WHEN cache_hit THEN 1 ELSE 0 END) AS FLOAT) / COUNT(*) * 100 as cache_hit_rate
FROM query_analytics
GROUP BY target_db;

-- Routing accuracy view
CREATE OR REPLACE VIEW routing_accuracy AS
SELECT 
    recommended_db,
    COUNT(*) as total_decisions,
    SUM(CASE WHEN success THEN 1 ELSE 0 END) as successful_decisions,
    AVG(confidence_score) as avg_confidence,
    CAST(SUM(CASE WHEN success THEN 1 ELSE 0 END) AS FLOAT) / COUNT(*) * 100 as success_rate
FROM routing_decisions
GROUP BY recommended_db;
