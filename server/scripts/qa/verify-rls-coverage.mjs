#!/usr/bin/env node

import pg from 'pg';

const { Client } = pg;

const REQUIRED_TABLES = [
  'users',
  'appointments',
  'prescriptions',
  'lab_orders',
  'insurance_claims',
  'vital_signs',
  'health_readings',
  'family_members',
  'patient_allergies',
  'patient_medications',
  'patient_conditions',
  'patient_consents',
  'patient_consent_history',
  'anonymous_patients',
  'audit_logs',
  'nursing_flowsheet_entries', 'nursing_assessments', 'nursing_tasks',
  'nursing_assignments', 'nursing_facility_settings', 'nursing_audit_events',
  'nursing_replays', 'nursing_outbox', 'nursing_handovers', 'nursing_images',
  'nursing_interventions', 'nursing_care_goals', 'nursing_goal_evaluations', 'nursing_notifications','nursing_staff_links','nursing_infusion_events','nursing_device_observations','nursing_device_bindings'
];

function dbConfig() {
  return {
    user: process.env.POSTGRES_USER || process.env.PG_USER || 'mediczy_helper',
    password: process.env.POSTGRES_PASSWORD || process.env.PG_PASSWORD,
    host: process.env.POSTGRES_HOST || process.env.PG_HOST || '127.0.0.1',
    port: parseInt(process.env.POSTGRES_PORT || process.env.PG_PORT || '5432', 10),
    database: process.env.POSTGRES_DATABASE || process.env.PG_DATABASE || 'mediczy_ai_migration_staging',
    ssl: process.env.POSTGRES_SSL === 'true' || process.env.PG_SSL === 'true'
      ? { rejectUnauthorized: false }
      : undefined,
  };
}

async function main() {
  const client = new Client(dbConfig());
  await client.connect();

  try {
    const { rows: existingRows } = await client.query(
      `SELECT c.relname AS table_name,
              c.relrowsecurity AS rls_enabled,
              c.relforcerowsecurity AS rls_forced
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public'
         AND c.relkind = 'r'
         AND c.relname = ANY($1::text[])
       ORDER BY c.relname`,
      [REQUIRED_TABLES]
    );

    const existing = new Map(existingRows.map(r => [r.table_name, r]));
    const missingTables = REQUIRED_TABLES.filter(t => !existing.has(t));

    const policyReport = [];
    for (const table of REQUIRED_TABLES.filter(t => existing.has(t))) {
      const { rows } = await client.query(
        `SELECT COUNT(*)::int AS policy_count
         FROM pg_policies
         WHERE schemaname = 'public' AND tablename = $1`,
        [table]
      );
      policyReport.push({ table, policyCount: rows[0].policy_count });
    }

    const failures = missingTables.map(table => `${table}: required table missing`);

    for (const [table, meta] of existing.entries()) {
      if (!meta.rls_enabled) failures.push(`${table}: RLS disabled`);
      if (!meta.rls_forced) failures.push(`${table}: RLS not forced`);
      const p = policyReport.find(x => x.table === table);
      if (!p || p.policyCount < 1) failures.push(`${table}: no policies`);
    }

    console.log('RLS_COVERAGE_REPORT');
    console.log(`checked_tables=${REQUIRED_TABLES.length}`);
    console.log(`existing_tables=${existing.size}`);
    console.log(`missing_tables=${missingTables.length}`);
    if (missingTables.length) {
      console.log(`missing_list=${missingTables.join(',')}`);
    }

    for (const row of policyReport) {
      const meta = existing.get(row.table);
      console.log(
        `table=${row.table} rls_enabled=${meta.rls_enabled} rls_forced=${meta.rls_forced} policies=${row.policyCount}`
      );
    }

    if (failures.length) {
      console.error('RLS_COVERAGE_FAIL');
      failures.forEach(f => console.error(`- ${f}`));
      process.exitCode = 1;
      return;
    }

    console.log('RLS_COVERAGE_PASS');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('RLS coverage check failed:', err.message);
  process.exit(1);
});
