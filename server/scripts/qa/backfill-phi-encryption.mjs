#!/usr/bin/env node

import pg from 'pg';

const { Client } = pg;

const ENCRYPTION_TARGETS = [
  { table: 'users', source: '"medicalHistory"', encrypted: 'medical_history_enc' },
  { table: 'users', source: '"familyHistory"', encrypted: 'family_history_enc' },
  { table: 'users', source: '"personalHistory"', encrypted: 'personal_history_enc' },
  { table: 'users', source: '"bloodType"', encrypted: 'blood_type_enc' },
  { table: 'users', source: '"abhaHealthId"', encrypted: 'abha_id_enc' },
  { table: 'prescriptions', source: 'medications', encrypted: 'medications_enc' },
  { table: 'vital_signs', source: 'notes', encrypted: 'readings_enc' }
];

function getDbConfig() {
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

async function columnExists(client, table, column) {
  const { rows } = await client.query(
    `SELECT 1
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`,
    [table, column.replaceAll('"', '')]
  );
  return rows.length > 0;
}

async function backfillTarget(client, target, key, dryRun) {
  const srcColumn = target.source.replaceAll('"', '');
  const hasSource = await columnExists(client, target.table, srcColumn);
  const hasEncrypted = await columnExists(client, target.table, target.encrypted);

  if (!hasSource || !hasEncrypted) {
    return {
      ...target,
      skipped: true,
      reason: `missing columns (source=${hasSource}, encrypted=${hasEncrypted})`,
      affected: 0,
    };
  }

  const countSql = `
    SELECT COUNT(*)::int AS pending
    FROM ${target.table}
    WHERE ${target.source} IS NOT NULL
      AND ${target.encrypted} IS NULL
  `;

  const { rows: countRows } = await client.query(countSql);
  const pending = countRows[0].pending;

  if (dryRun || pending === 0) {
    return {
      ...target,
      skipped: dryRun,
      reason: dryRun ? 'dry-run' : 'already encrypted',
      affected: pending,
    };
  }

  const updateSql = `
    UPDATE ${target.table}
    SET ${target.encrypted} = pgp_sym_encrypt(${target.source}::text, $1)
    WHERE ${target.source} IS NOT NULL
      AND ${target.encrypted} IS NULL
  `;

  const result = await client.query(updateSql, [key]);

  return {
    ...target,
    skipped: false,
    reason: 'updated',
    affected: result.rowCount || 0,
  };
}

async function main() {
  const key = process.env.ENCRYPTION_KEY;
  const dryRun = process.argv.includes('--dry-run');

  if (!key) {
    console.error('Missing ENCRYPTION_KEY; refusing to run PHI encryption backfill.');
    process.exit(1);
  }

  const client = new Client(getDbConfig());
  await client.connect();

  try {
    const summary = [];

    for (const target of ENCRYPTION_TARGETS) {
      const row = await backfillTarget(client, target, key, dryRun);
      summary.push(row);
    }

    console.log('PHI_ENCRYPTION_BACKFILL_REPORT');
    console.log(`mode=${dryRun ? 'dry-run' : 'execute'}`);

    let totalAffected = 0;
    for (const row of summary) {
      totalAffected += row.affected;
      console.log(
        `table=${row.table} source=${row.source} encrypted=${row.encrypted} affected=${row.affected} status=${row.reason}`
      );
    }

    console.log(`total_affected=${totalAffected}`);
    console.log('PHI_ENCRYPTION_BACKFILL_PASS');
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('PHI encryption backfill failed:', error.message);
  process.exit(1);
});
