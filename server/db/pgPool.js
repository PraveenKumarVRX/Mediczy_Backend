/**
 * Singleton PostgreSQL connection pool
 * Shared across ALL service instances to prevent connection exhaustion.
 * One pool per process — configured from environment variables.
 */

import pg from 'pg';
import { postgresTls } from './postgres-tls.js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load root env first, then allow server/.env overrides for local development.
dotenv.config({ path: join(__dirname, '..', '..', '.env') });
dotenv.config({ path: join(__dirname, '..', '.env') });

const { Pool } = pg;

let _pool = null;

function firstNonEmpty(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}

// Hosts that count as "this machine". A unix-socket directory (a path) is local too.
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0']);
const isLoopbackHost = (value) => {
  if (typeof value !== 'string') return false;
  const host = value.trim().toLowerCase();
  if (!host) return false;
  return LOOPBACK_HOSTS.has(host) || host.startsWith('/');
};

// One database target, described by one family of env vars. An isolated local run picks a family
// by its HOST being loopback and then takes every other field from that SAME family, so a local
// host can never be paired with another target's database, user or password.
const ENV_FAMILIES = [
  { host: 'POSTGRES_PRIMARY_HOST', port: 'POSTGRES_PRIMARY_PORT', database: 'POSTGRES_PRIMARY_DATABASE', user: 'POSTGRES_PRIMARY_USER', password: 'POSTGRES_PRIMARY_PASSWORD' },
  { host: 'POSTGRES_HOST',         port: 'POSTGRES_PORT',         database: 'POSTGRES_DATABASE',         user: 'POSTGRES_USER',         password: 'POSTGRES_PASSWORD' },
  { host: 'PG_HOST',               port: 'PG_PORT',               database: 'PG_DATABASE',               user: 'PG_USER',               password: 'PG_PASSWORD' },
  { host: 'DB_HOST',               port: 'DB_PORT',               database: 'DB_NAME',                   user: 'DB_USER',               password: 'DB_PASSWORD' },
];

function buildPoolConfig() {
  const targetDatabase = firstNonEmpty(
    process.env.POSTGRES_PRIMARY_DATABASE,
    process.env.POSTGRES_DATABASE,
    process.env.PG_DATABASE,
    process.env.DB_NAME
  ) || '';
  const isolatedLocalRun =
    process.env.POSTGRES_FORCE_LOCAL === 'true' ||
    process.env.DISALLOW_REMOTE_DB === 'true' ||
    /migration_staging/i.test(targetDatabase);

  // An isolated local run is resolved here and returns early — it deliberately shares no
  // precedence logic with the remote path below.
  //
  // This used to INVERT the normal precedence instead (preferring POSTGRES_HOST over
  // POSTGRES_PRIMARY_HOST, and likewise for port/database/user/password). That inversion made the
  // flag actively dangerous in this repo: server/.env sets POSTGRES_HOST, POSTGRES_DATABASE,
  // POSTGRES_USER and POSTGRES_PASSWORD to the production RDS endpoint, and scripts/ssm-env-loader
  // copies POSTGRES_HOST -> POSTGRES_PRIMARY_HOST, so BOTH families name production. Asking for an
  // isolated local run therefore silently connected to production — on 2026-10-01 a migration meant
  // for a scratch database altered the live `users` table that way.
  //
  // It is now fail-closed: a local run connects to a loopback host or it throws. It never falls
  // back to a remote target, and no connection string is honoured (a URI cannot be checked
  // cheaply and is always the remote path's business).
  if (isolatedLocalRun) {
    const family = ENV_FAMILIES.find((f) => isLoopbackHost(process.env[f.host]));
    if (!family) {
      const seen = ENV_FAMILIES
        .map((f) => `${f.host}=${process.env[f.host] || '(unset)'}`)
        .join(', ');
      throw new Error(
        '[pgPool] An isolated local run was requested (POSTGRES_FORCE_LOCAL / DISALLOW_REMOTE_DB, '
        + 'or a *migration_staging* database name) but no environment variable names a local host. '
        + 'Refusing to connect, because the alternative is connecting to production. '
        + `Set one of the *_HOST variables to localhost or 127.0.0.1. Saw: ${seen}`,
      );
    }

    const localDatabase = firstNonEmpty(process.env[family.database]);
    const localUser = firstNonEmpty(process.env[family.user]);
    if (!localDatabase || !localUser) {
      throw new Error(
        `[pgPool] Isolated local run selected ${family.host}=${process.env[family.host]}, but `
        + `${family.database} and/or ${family.user} is unset. Set the whole family together so a `
        + 'local host cannot be paired with another target\'s credentials.',
      );
    }

    return {
      host: process.env[family.host].trim(),
      port: parseInt(firstNonEmpty(process.env[family.port]) || '5432', 10),
      database: localDatabase,
      user: localUser,
      // A local scratch database commonly trusts the socket, so a password may legitimately be absent.
      password: firstNonEmpty(process.env[family.password]) || undefined,
      max: parseInt(process.env.POSTGRES_POOL_MAX || process.env.PG_POOL_MAX || process.env.DB_POOL_MAX || '20', 10),
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
      ssl: false,
    };
  }

  // From here down is the remote path only: an isolated local run returned above.
  const hasPrimaryDiscreteConfig = Boolean(
    process.env.POSTGRES_PRIMARY_HOST ||
    process.env.POSTGRES_PRIMARY_PORT ||
    process.env.POSTGRES_PRIMARY_DATABASE ||
    process.env.POSTGRES_PRIMARY_USER ||
    process.env.POSTGRES_PRIMARY_PASSWORD
  );
  const connectionString = firstNonEmpty(
    process.env.POSTGRES_PRIMARY_URI,
    !hasPrimaryDiscreteConfig ? process.env.POSTGRES_URI : undefined,
    !hasPrimaryDiscreteConfig ? process.env.PG_URI : undefined
  );
  const ssl = postgresTls(process.env, connectionString);

  if (connectionString) {
    return {
      connectionString,
      max: parseInt(process.env.POSTGRES_POOL_MAX || process.env.PG_POOL_MAX || '20', 10),
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
      ssl,
    };
  }

  const host = firstNonEmpty(
    process.env.POSTGRES_PRIMARY_HOST,
    process.env.POSTGRES_HOST,
    process.env.PG_HOST,
    process.env.DB_HOST
  );
  const portRaw = firstNonEmpty(
    process.env.POSTGRES_PRIMARY_PORT,
    process.env.POSTGRES_PORT,
    process.env.PG_PORT,
    process.env.DB_PORT
  );
  const database = firstNonEmpty(
    process.env.POSTGRES_PRIMARY_DATABASE,
    process.env.POSTGRES_DATABASE,
    process.env.PG_DATABASE,
    process.env.DB_NAME
  );
  const user = firstNonEmpty(
    process.env.POSTGRES_PRIMARY_USER,
    process.env.POSTGRES_USER,
    process.env.PG_USER,
    process.env.DB_USER
  );
  const password = firstNonEmpty(
    process.env.POSTGRES_PRIMARY_PASSWORD,
    process.env.POSTGRES_PASSWORD,
    process.env.PG_PASSWORD,
    process.env.DB_PASSWORD,
    process.env.DB_PASS
  );

  if (!host || !database || !user || !password) {
    throw new Error('[pgPool] Missing required PostgreSQL env values. Set POSTGRES_PRIMARY_HOST/POSTGRES_PRIMARY_DATABASE/POSTGRES_PRIMARY_USER/POSTGRES_PRIMARY_PASSWORD (or equivalent POSTGRES_* variables).');
  }

  return {
    host,
    port: parseInt(portRaw || '5432', 10),
    database,
    user,
    password,
    max: parseInt(process.env.POSTGRES_POOL_MAX || process.env.PG_POOL_MAX || process.env.DB_POOL_MAX || '20', 10),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    ssl,
  };
}

function getPool() {
  if (!_pool) {
    const config = buildPoolConfig();

    // Say out loud which database this process is about to talk to. Without this, a script that
    // believes it is on a scratch database and is in fact on production looks identical in the
    // logs — which is exactly how a migration reached live `users` on 2026-10-01. Host, database
    // and user only; never the password or a full connection string.
    const target = config.connectionString
      ? (() => { try { const u = new URL(config.connectionString); return `${u.hostname}:${u.port || 5432}/${u.pathname.replace(/^\//, '')} as ${u.username}`; } catch { return 'connection-string'; } })()
      : `${config.host}:${config.port}/${config.database} as ${config.user}`;
    console.log(`[pgPool] target -> ${target}`);

    _pool = new Pool(config);

    _pool.on('error', (err) => {
      console.error('[pgPool] Unexpected idle-client error:', err.message);
    });

    _pool.on('connect', (client) => {
      if (process.env.NODE_ENV !== 'production') {
        console.debug(`[pgPool] New client connected — total: ${_pool.totalCount}`);
      }
    });
  }
  return _pool;
}

// ── Dedicated cron pool (ITEM-21) ─────────────────────────────────────────────
// Low-max-connection pool for cron jobs. Prevents long-running batch jobs from
// starving API request handlers under load. Import this — not the default pool —
// in all *-cron.service.js and *-self-learning-pipeline.service.js files.
let _cronPool = null;

export function getCronPool() {
  if (!_cronPool) {
    const cfg = { ...buildPoolConfig(), max: 5 };
    _cronPool = new Pool(cfg);
    _cronPool.on('error', (err) => {
      console.error('[pgPool:cron] Unexpected idle-client error:', err.message);
    });
  }
  return _cronPool;
}

// ── Pool stats (ITEM-05) ───────────────────────────────────────────────────────
export function getPoolStats() {
  const main = _pool;
  const cron = _cronPool;
  return {
    main: main ? {
      total: main.totalCount,
      idle:  main.idleCount,
      waiting: main.waitingCount,
    } : null,
    cron: cron ? {
      total: cron.totalCount,
      idle:  cron.idleCount,
      waiting: cron.waitingCount,
    } : null,
  };
}

export default getPool();
