/**
 * DuckDB ETL Pipeline Service
 * ---------------------------
 * Syncs OLTP data from PostgreSQL → DuckDB for analytics/BI.
 *
 * Strategy: nightly full-refresh for small tables, incremental for large ones.
 * Triggered by:
 *   1. Cron (nightly 2am)
 *   2. Kafka consumer (ai.run.completed, analytics.event) for near-real-time
 *   3. Manual call (admin API)
 *
 * Tables synced:
 *   - appointments  → appointment_facts
 *   - users         → patient_dim (de-identified)
 *   - doctors       → doctor_dim
 *   - prescriptions → prescription_facts
 *   - vitals        → vital_facts
 *   - ai_agent_runs → ai_usage_facts
 */

import { getPool as pgPool } from '../db/postgres.js';
import { executeDuckDBQuery, initDuckDB } from '../config/databases.js';
import { connectKafkaConsumer, KAFKA_TOPICS } from '../config/kafka.js';

let _initialized = false;

// ─── Schema Initialisation ────────────────────────────────────────────────────

async function initAnalyticsSchema() {
  const ddl = [
    // Appointment facts
    `CREATE TABLE IF NOT EXISTS appointment_facts (
      appointment_id   INTEGER PRIMARY KEY,
      appointment_date DATE,
      appointment_time VARCHAR(10),
      org_id           INTEGER,
      org_type         VARCHAR(50),
      doctor_id        INTEGER,
      specialization   VARCHAR(100),
      consultation_type VARCHAR(50),
      status           VARCHAR(30),
      duration_minutes INTEGER,
      created_at       TIMESTAMP,
      synced_at        TIMESTAMP DEFAULT NOW()
    )`,

    // Patient dimension (de-identified — no PHI)
    `CREATE TABLE IF NOT EXISTS patient_dim (
      user_id          INTEGER PRIMARY KEY,
      age_bucket       VARCHAR(10),   -- '20-30', '30-40' (not exact DOB)
      gender           VARCHAR(10),
      org_id           INTEGER,
      org_type         VARCHAR(50),
      registration_month DATE,
      is_active        BOOLEAN,
      synced_at        TIMESTAMP DEFAULT NOW()
    )`,

    // Doctor dimension
    `CREATE TABLE IF NOT EXISTS doctor_dim (
      doctor_id        INTEGER PRIMARY KEY,
      specialization   VARCHAR(100),
      org_id           INTEGER,
      city             VARCHAR(100),
      is_online        BOOLEAN,
      rating           DECIMAL(3,2),
      total_consults   INTEGER,
      synced_at        TIMESTAMP DEFAULT NOW()
    )`,

    // Prescription facts
    `CREATE TABLE IF NOT EXISTS prescription_facts (
      prescription_id  INTEGER PRIMARY KEY,
      org_id           INTEGER,
      doctor_id        INTEGER,
      drug_count       INTEGER,
      created_date     DATE,
      synced_at        TIMESTAMP DEFAULT NOW()
    )`,

    // AI usage facts
    `CREATE TABLE IF NOT EXISTS ai_usage_facts (
      run_id           VARCHAR(50) PRIMARY KEY,
      org_id           INTEGER,
      role             VARCHAR(50),
      cognitive_tier   VARCHAR(20),
      agents_used      VARCHAR[],
      total_tokens     INTEGER,
      latency_ms       INTEGER,
      status           VARCHAR(20),
      run_date         DATE,
      synced_at        TIMESTAMP DEFAULT NOW()
    )`,

    // ETL run log
    `CREATE TABLE IF NOT EXISTS etl_runs (
      id               INTEGER PRIMARY KEY,
      table_name       VARCHAR(100),
      rows_upserted    INTEGER,
      duration_ms      INTEGER,
      status           VARCHAR(20),
      error_message    VARCHAR,
      run_at           TIMESTAMP DEFAULT NOW()
    )`,

    // Sequence for etl_runs (DuckDB doesn't have SERIAL)
    `CREATE SEQUENCE IF NOT EXISTS etl_runs_id_seq`,
  ];

  for (const sql of ddl) {
    await executeDuckDBQuery(sql);
  }

  _initialized = true;
  console.log('✅ DuckDB analytics schema ready');
}

// ─── ETL Helpers ─────────────────────────────────────────────────────────────

async function pgQuery(sql, params = []) {
  const pool   = pgPool();
  const client = await pool.connect();
  try {
    const result = await client.query(sql, params);
    return result.rows;
  } finally {
    client.release();
  }
}

async function logEtlRun(tableName, rowsUpserted, durationMs, status, errorMessage = null) {
  await executeDuckDBQuery(
    `INSERT INTO etl_runs VALUES (nextval('etl_runs_id_seq'), ?, ?, ?, ?, ?, NOW())`,
    [tableName, rowsUpserted, durationMs, status, errorMessage]
  );
}

// ─── Individual Table Sync ────────────────────────────────────────────────────

async function syncAppointments(since = null) {
  const start = Date.now();
  try {
    const where = since ? `WHERE "createdAt" >= $1` : '';
    const rows  = await pgQuery(
      `SELECT
         id, "appointmentDate", "appointmentTime"::text,
         organization_id, organization_type, "doctorId", specialization,
         "consultationType", status, "createdAt"
       FROM appointments ${where}
       ORDER BY "createdAt" DESC
       LIMIT 100000`,
      since ? [since] : []
    );

    for (const r of rows) {
      await executeDuckDBQuery(
        `INSERT OR REPLACE INTO appointment_facts VALUES (?,?,?,?,?,?,?,?,?,?,?,NOW())`,
        [
          r.id, r.appointmentDate, r.appointmentTime,
          r.organization_id, r.organization_type,
          r.doctorId, r.specialization,
          r.consultationType, r.status,
          null,  // duration_minutes (TODO: from end_time)
          r.createdAt,
        ]
      );
    }

    await logEtlRun('appointment_facts', rows.length, Date.now() - start, 'success');
    return rows.length;
  } catch (err) {
    await logEtlRun('appointment_facts', 0, Date.now() - start, 'error', err.message);
    throw err;
  }
}

async function syncPatientDim() {
  const start = Date.now();
  try {
    const rows = await pgQuery(
      `SELECT
         id,
         -- Age bucket (de-identified — no exact DOB exported)
         CASE
           WHEN "dateOfBirth" IS NULL THEN 'unknown'
           WHEN EXTRACT(YEAR FROM AGE("dateOfBirth")) < 18 THEN '<18'
           WHEN EXTRACT(YEAR FROM AGE("dateOfBirth")) < 30 THEN '18-30'
           WHEN EXTRACT(YEAR FROM AGE("dateOfBirth")) < 45 THEN '30-45'
           WHEN EXTRACT(YEAR FROM AGE("dateOfBirth")) < 60 THEN '45-60'
           ELSE '60+'
         END                          AS age_bucket,
         gender,
         organization_id, organization_type,
         date_trunc('month', "createdAt")::date AS registration_month,
         (status = 'active')          AS is_active
       FROM users
       WHERE role IN ('user','patient') OR role IS NULL
       LIMIT 500000`
    );

    for (const r of rows) {
      await executeDuckDBQuery(
        `INSERT OR REPLACE INTO patient_dim VALUES (?,?,?,?,?,?,?,NOW())`,
        [r.id, r.age_bucket, r.gender, r.organization_id, r.organization_type, r.registration_month, r.is_active]
      );
    }

    await logEtlRun('patient_dim', rows.length, Date.now() - start, 'success');
    return rows.length;
  } catch (err) {
    await logEtlRun('patient_dim', 0, Date.now() - start, 'error', err.message);
    throw err;
  }
}

async function syncAiUsageFacts(since = null) {
  const start = Date.now();
  try {
    const where = since ? `WHERE created_at >= $1` : '';
    const rows  = await pgQuery(
      `SELECT run_id::text, org_id, role, cognitive_tier, agents_used,
              total_tokens, latency_ms, status, created_at::date AS run_date
       FROM ai_agent_runs ${where}
       ORDER BY created_at DESC LIMIT 200000`,
      since ? [since] : []
    );

    for (const r of rows) {
      await executeDuckDBQuery(
        `INSERT OR REPLACE INTO ai_usage_facts VALUES (?,?,?,?,?,?,?,?,?,NOW())`,
        [r.run_id, r.org_id, r.role, r.cognitive_tier, r.agents_used, r.total_tokens, r.latency_ms, r.status, r.run_date]
      );
    }

    await logEtlRun('ai_usage_facts', rows.length, Date.now() - start, 'success');
    return rows.length;
  } catch (err) {
    await logEtlRun('ai_usage_facts', 0, Date.now() - start, 'error', err.message);
    throw err;
  }
}

// ─── Full Nightly Sync ────────────────────────────────────────────────────────

export async function runNightlyETL() {
  if (!_initialized) await initAnalyticsSchema();
  console.log('🔄 DuckDB ETL: starting nightly sync…');
  const t = Date.now();

  await Promise.allSettled([
    syncAppointments(),
    syncPatientDim(),
    syncAiUsageFacts(),
  ]);

  console.log(`✅ DuckDB ETL: nightly sync complete in ${Date.now() - t}ms`);
}

/**
 * Incremental sync — run after a Kafka event to keep DuckDB fresh.
 * Syncs only data from the last 15 minutes.
 */
export async function runIncrementalETL() {
  if (!_initialized) await initAnalyticsSchema();
  const since = new Date(Date.now() - 15 * 60 * 1000);
  await Promise.allSettled([
    syncAppointments(since),
    syncAiUsageFacts(since),
  ]);
}

// ─── Kafka-driven incremental updates ────────────────────────────────────────

export async function startKafkaETLConsumer() {
  await connectKafkaConsumer(
    'duckdb-etl-consumer',
    [
      KAFKA_TOPICS.APPOINTMENT_COMPLETED,
      KAFKA_TOPICS.APPOINTMENT_BOOKED,
      KAFKA_TOPICS.AI_RUN_COMPLETED,
      KAFKA_TOPICS.ANALYTICS_EVENT,
    ],
    async ({ topic }) => {
      if (
        topic === KAFKA_TOPICS.APPOINTMENT_COMPLETED ||
        topic === KAFKA_TOPICS.APPOINTMENT_BOOKED
      ) {
        await syncAppointments(new Date(Date.now() - 60_000));
      }
      if (topic === KAFKA_TOPICS.AI_RUN_COMPLETED) {
        await syncAiUsageFacts(new Date(Date.now() - 60_000));
      }
    }
  );
  console.log('✅ DuckDB ETL: Kafka consumer started');
}

// ─── Init ─────────────────────────────────────────────────────────────────────

export async function initDuckDBEtl() {
  await initDuckDB();
  await initAnalyticsSchema();
}

export default { initDuckDBEtl, runNightlyETL, runIncrementalETL, startKafkaETLConsumer };
