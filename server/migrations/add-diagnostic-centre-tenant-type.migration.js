/**
 * Add diagnostic_centre to tenants.type ENUM (PostgreSQL).
 * Safe to re-run.
 *
 * Usage (app DB user — works only if that user owns the type):
 *   node server/migrations/add-diagnostic-centre-tenant-type.migration.js
 *
 * If you see "must be owner of type enum_tenants_type", run as the type owner /
 * RDS master (psql), or set owner credentials:
 *   POSTGRES_OWNER_USER=... POSTGRES_OWNER_PASSWORD=... \
 *     node server/migrations/add-diagnostic-centre-tenant-type.migration.js
 *
 * SQL (as type owner / superuser):
 *   ALTER TYPE "enum_tenants_type" ADD VALUE IF NOT EXISTS 'diagnostic_centre';
 */
import dotenv from 'dotenv';
import pg from 'pg';
import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';

dotenv.config({ path: '/home/ubuntu/Mediczy/server/.env' });
dotenv.config();

const ENUM_NAME = 'enum_tenants_type';
const NEW_VALUE = 'diagnostic_centre';

function isOwnerError(err) {
  const msg = String(err?.parent?.message || err?.original?.message || err?.message || '');
  const code = err?.parent?.code || err?.original?.code || err?.code;
  return code === '42501' || /must be owner of type/i.test(msg);
}

async function listEnumLabels(clientOrSequelize) {
  const sql = `SELECT enumlabel FROM pg_enum e
     JOIN pg_type t ON t.oid = e.enumtypid
     WHERE t.typname = $1
     ORDER BY e.enumsortorder`;
  if (typeof clientOrSequelize.query === 'function' && clientOrSequelize.QueryTypes) {
    return clientOrSequelize.query(sql.replace('$1', `'${ENUM_NAME}'`), {
      type: clientOrSequelize.QueryTypes.SELECT,
    });
  }
  const res = await clientOrSequelize.query(sql, [ENUM_NAME]);
  return res.rows;
}

async function getTypeOwner(clientOrSequelize) {
  const sql = `SELECT t.typname, r.rolname AS owner
    FROM pg_type t
    JOIN pg_roles r ON r.oid = t.typowner
    WHERE t.typname = $1`;
  if (clientOrSequelize.QueryTypes) {
    const rows = await clientOrSequelize.query(sql.replace('$1', `'${ENUM_NAME}'`), {
      type: clientOrSequelize.QueryTypes.SELECT,
    });
    return rows[0]?.owner || null;
  }
  const res = await clientOrSequelize.query(sql, [ENUM_NAME]);
  return res.rows[0]?.owner || null;
}

function printOwnerHelp(owner, currentUser) {
  console.error(`
❌ Permission denied: current DB user cannot ALTER TYPE "${ENUM_NAME}".
   Current user : ${currentUser || '(unknown)'}
   Type owner   : ${owner || '(unknown)'}

Run ONE of the following as the type owner / RDS master:

  1) psql (recommended)
     psql "$DATABASE_URL" -c "ALTER TYPE \\"${ENUM_NAME}\\" ADD VALUE IF NOT EXISTS '${NEW_VALUE}';"

     Or connect as the owner role, then:
       ALTER TYPE "${ENUM_NAME}" ADD VALUE IF NOT EXISTS '${NEW_VALUE}';

  2) Re-run this script with owner credentials
     POSTGRES_OWNER_USER='${owner || 'postgres'}' \\
     POSTGRES_OWNER_PASSWORD='...' \\
     node server/migrations/add-diagnostic-centre-tenant-type.migration.js

Optional (if you have rights): grant ownership to the app role permanently:
  ALTER TYPE "${ENUM_NAME}" OWNER TO ${currentUser || 'mediczy_ai'};
`);
}

async function addValueWithClient(client) {
  const labels = (await listEnumLabels(client)).map((r) => r.enumlabel);
  if (labels.includes(NEW_VALUE)) {
    console.log(`✅ ${ENUM_NAME} already includes '${NEW_VALUE}'`);
    return true;
  }
  try {
    await client.query(`ALTER TYPE "${ENUM_NAME}" ADD VALUE IF NOT EXISTS '${NEW_VALUE}'`);
  } catch (err) {
    // Older PG without IF NOT EXISTS
    if (!/syntax error|IF NOT EXISTS/i.test(String(err.message))) throw err;
    await client.query(`ALTER TYPE "${ENUM_NAME}" ADD VALUE '${NEW_VALUE}'`);
  }
  console.log(`✅ added '${NEW_VALUE}' to ${ENUM_NAME}`);
  return true;
}

async function runAsOwnerViaPg() {
  const user = process.env.POSTGRES_OWNER_USER;
  const password = process.env.POSTGRES_OWNER_PASSWORD;
  if (!user || !password) return false;

  const host = process.env.POSTGRES_OWNER_HOST
    || process.env.POSTGRES_PRIMARY_HOST
    || process.env.POSTGRES_HOST
    || '127.0.0.1';
  const port = parseInt(
    process.env.POSTGRES_OWNER_PORT
      || process.env.POSTGRES_PRIMARY_PORT
      || process.env.POSTGRES_PORT
      || '5432',
    10,
  );
  const database = process.env.POSTGRES_OWNER_DATABASE
    || process.env.POSTGRES_PRIMARY_DATABASE
    || process.env.POSTGRES_DATABASE
    || 'mediczy_ai';

  const client = new pg.Client({
    host,
    port,
    database,
    user,
    password,
    ssl: process.env.POSTGRES_SSL === 'false' ? false : { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    console.log(`Using owner connection as ${user}@${host}/${database}`);
    await addValueWithClient(client);
    return true;
  } finally {
    await client.end();
  }
}

async function run() {
  // Prefer explicit owner credentials when provided
  if (await runAsOwnerViaPg()) return;

  await sequelize.authenticate();
  const meRows = await sequelize.query('SELECT current_user AS user', {
    type: sequelize.QueryTypes.SELECT,
  });
  const currentUser = meRows[0]?.user;
  const owner = await getTypeOwner(sequelize);

  const existing = await listEnumLabels(sequelize);
  if (existing.map((r) => r.enumlabel).includes(NEW_VALUE)) {
    console.log(`✅ ${ENUM_NAME} already includes '${NEW_VALUE}'`);
    await sequelize.close();
    return;
  }

  try {
    await sequelize.query(
      `ALTER TYPE "${ENUM_NAME}" ADD VALUE IF NOT EXISTS '${NEW_VALUE}'`,
    );
    console.log(`✅ ${ENUM_NAME} includes '${NEW_VALUE}'`);
  } catch (err) {
    if (isOwnerError(err)) {
      printOwnerHelp(owner, currentUser);
      await sequelize.close();
      process.exit(1);
    }
    // Older PG without IF NOT EXISTS — retry plain ADD VALUE
    try {
      await sequelize.query(`ALTER TYPE "${ENUM_NAME}" ADD VALUE '${NEW_VALUE}'`);
      console.log(`✅ added '${NEW_VALUE}' to ${ENUM_NAME}`);
    } catch (err2) {
      if (isOwnerError(err2)) {
        printOwnerHelp(owner, currentUser);
        await sequelize.close();
        process.exit(1);
      }
      throw err2;
    }
  }

  await sequelize.close();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
