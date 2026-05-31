#!/usr/bin/env node

import pg from 'pg';

const { Client } = pg;

const TABLES = [
  { table: 'users', entityType: 'user' },
  { table: 'doctors', entityType: 'doctor' },
  { table: 'appointments', entityType: 'appointment' }
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

async function runTableChecks(client, table, entityType) {
  const countRes = await client.query(`SELECT COUNT(*)::int AS total FROM ${table}`);
  const mapCountRes = await client.query(
    `SELECT COUNT(*)::int AS map_count FROM uuid_id_map WHERE entity_type = $1`,
    [entityType]
  );
  const missingUuidRes = await client.query(
    `SELECT COUNT(*)::int AS missing FROM ${table} WHERE uuid_id IS NULL`
  );
  const duplicateUuidRes = await client.query(
    `SELECT COUNT(*)::int AS duplicates
     FROM (
       SELECT uuid_id, COUNT(*)
       FROM ${table}
       GROUP BY uuid_id
       HAVING COUNT(*) > 1
     ) d`
  );

  return {
    table,
    entityType,
    total: countRes.rows[0].total,
    mapCount: mapCountRes.rows[0].map_count,
    missingUuid: missingUuidRes.rows[0].missing,
    duplicateUuid: duplicateUuidRes.rows[0].duplicates,
  };
}

async function main() {
  const client = new Client(dbConfig());
  await client.connect();

  try {
    const failures = [];

    const { rows: mapExistsRows } = await client.query(
      `SELECT to_regclass('public.uuid_id_map') AS regclass`
    );

    if (!mapExistsRows[0].regclass) {
      console.error('UUID_SHADOW_PARITY_FAIL');
      console.error('- uuid_id_map table does not exist');
      process.exit(1);
      return;
    }

    const reports = [];
    for (const item of TABLES) {
      const report = await runTableChecks(client, item.table, item.entityType);
      reports.push(report);

      if (report.missingUuid > 0) {
        failures.push(`${report.table}: missing uuid_id rows=${report.missingUuid}`);
      }
      if (report.duplicateUuid > 0) {
        failures.push(`${report.table}: duplicate uuid_id rows=${report.duplicateUuid}`);
      }
      if (report.total !== report.mapCount) {
        failures.push(`${report.table}: map_count mismatch total=${report.total} map_count=${report.mapCount}`);
      }
    }

    console.log('UUID_SHADOW_PARITY_REPORT');
    for (const row of reports) {
      console.log(
        `table=${row.table} entity=${row.entityType} total=${row.total} map_count=${row.mapCount} missing_uuid=${row.missingUuid} duplicate_uuid=${row.duplicateUuid}`
      );
    }

    if (failures.length > 0) {
      console.error('UUID_SHADOW_PARITY_FAIL');
      failures.forEach((f) => console.error(`- ${f}`));
      process.exitCode = 1;
      return;
    }

    console.log('UUID_SHADOW_PARITY_PASS');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('UUID shadow parity verification failed:', err.message);
  process.exit(1);
});
