import client from 'prom-client';
import express from 'express';

// Create a Registry
export const register = new client.Registry();

// Add default metrics (CPU, memory, etc.)
client.collectDefaultMetrics({ register });

// Custom metrics

// HTTP request duration histogram
export const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.1, 0.3, 0.5, 0.7, 1, 3, 5, 7, 10],
});

// HTTP request counter
export const httpRequestTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
});

// Queue metrics
export const queueJobsTotal = new client.Counter({
  name: 'queue_jobs_total',
  help: 'Total number of queue jobs',
  labelNames: ['queue', 'status'],
});

export const queueJobDuration = new client.Histogram({
  name: 'queue_job_duration_seconds',
  help: 'Duration of queue jobs in seconds',
  labelNames: ['queue', 'job_name'],
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60, 120],
});

export const queueSize = new client.Gauge({
  name: 'queue_size',
  help: 'Number of jobs in queue',
  labelNames: ['queue', 'state'],
});

// Database metrics
export const dbQueryDuration = new client.Histogram({
  name: 'db_query_duration_seconds',
  help: 'Duration of database queries in seconds',
  labelNames: ['operation', 'model'],
  buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5],
});

export const dbConnectionsActive = new client.Gauge({
  name: 'db_connections_active',
  help: 'Number of active database connections',
});

// Business metrics
export const userRegistrations = new client.Counter({
  name: 'user_registrations_total',
  help: 'Total number of user registrations',
  labelNames: ['user_type'],
});

export const appointmentsCreated = new client.Counter({
  name: 'appointments_created_total',
  help: 'Total number of appointments created',
  labelNames: ['status'],
});

export const crmLeadsTotal = new client.Gauge({
  name: 'crm_leads_total',
  help: 'Total number of CRM leads',
  labelNames: ['stage'],
});

export const crmPipelineValue = new client.Gauge({
  name: 'crm_pipeline_value',
  help: 'Total value in CRM pipeline',
  labelNames: ['stage'],
});

// Kafka metrics
export const kafkaMessagesProduced = new client.Counter({
  name: 'kafka_messages_produced_total',
  help: 'Total number of Kafka messages produced',
  labelNames: ['topic'],
});

export const kafkaMessagesConsumed = new client.Counter({
  name: 'kafka_messages_consumed_total',
  help: 'Total number of Kafka messages consumed',
  labelNames: ['topic'],
});

// Database intelligence metrics
export const intelligenceQueriesTotal = new client.Counter({
  name: 'db_intelligence_queries_total',
  help: 'Total queries processed by the intelligence layer',
  labelNames: ['target_db', 'source'],
});

export const intelligenceProcessingDuration = new client.Histogram({
  name: 'db_intelligence_processing_seconds',
  help: 'Processing duration of intelligence queries in seconds',
  labelNames: ['target_db'],
  buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5, 10],
});

export const intelligenceCacheEvents = new client.Counter({
  name: 'db_intelligence_cache_events_total',
  help: 'Cache hits and misses recorded by intelligence layer',
  labelNames: ['event'],
});

export const intelligenceKafkaEvents = new client.Counter({
  name: 'db_intelligence_kafka_events_total',
  help: 'Kafka events emitted by the intelligence layer',
  labelNames: ['topic'],
});

export const intelligenceQueueJobs = new client.Counter({
  name: 'db_intelligence_queue_jobs_total',
  help: 'Background jobs scheduled by the intelligence layer',
  labelNames: ['queue', 'job_name'],
});

export const intelligenceBayesianInferences = new client.Counter({
  name: 'db_intelligence_bayesian_inferences_total',
  help: 'Bayesian inference executions triggered by intelligence layer',
  labelNames: ['risk_level'],
});

export const intelligenceDataCollections = new client.Counter({
  name: 'db_intelligence_data_collections_total',
  help: 'Data collection operations processed by intelligence layer',
  labelNames: ['primary_db'],
});

// Register all custom metrics
register.registerMetric(httpRequestDuration);
register.registerMetric(httpRequestTotal);
register.registerMetric(queueJobsTotal);
register.registerMetric(queueJobDuration);
register.registerMetric(queueSize);
register.registerMetric(dbQueryDuration);
register.registerMetric(dbConnectionsActive);
register.registerMetric(userRegistrations);
register.registerMetric(appointmentsCreated);
register.registerMetric(crmLeadsTotal);
register.registerMetric(crmPipelineValue);
register.registerMetric(kafkaMessagesProduced);
register.registerMetric(kafkaMessagesConsumed);
register.registerMetric(intelligenceQueriesTotal);
register.registerMetric(intelligenceProcessingDuration);
register.registerMetric(intelligenceCacheEvents);
register.registerMetric(intelligenceKafkaEvents);
register.registerMetric(intelligenceQueueJobs);
register.registerMetric(intelligenceBayesianInferences);
register.registerMetric(intelligenceDataCollections);

// Middleware to track HTTP requests
export const metricsMiddleware = (req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    const route = req.route ? req.route.path : req.path;
    const labels = {
      method: req.method,
      route,
      status_code: res.statusCode,
    };
    
    httpRequestDuration.observe(labels, duration);
    httpRequestTotal.inc(labels);
  });
  
  next();
};

// Endpoint to expose metrics
export const metricsEndpoint = async (req, res) => {
  try {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (error) {
    res.status(500).end(error);
  }
};

console.log('✅ Prometheus metrics initialized');

export default {
  register,
  metricsMiddleware,
  metricsEndpoint,
};
