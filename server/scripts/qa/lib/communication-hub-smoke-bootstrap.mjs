/**
 * Bootstraps local Postgres (if needed) + API server for Communication Hub live smoke tests.
 */

import { spawn } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import pg from 'pg';
import dotenv from 'dotenv';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(__dirname, '../../..');
const repoRoot = path.resolve(serverRoot, '..');

export function loadSmokeEnv() {
  const files = [
    path.join(serverRoot, '.env.production.local'),
    path.join(serverRoot, '.env'),
    path.join(repoRoot, '.env'),
    path.join(serverRoot, 'scripts/qa/communication-hub-smoke.env'),
  ];
  for (const file of files) {
    if (existsSync(file)) dotenv.config({ path: file, override: true });
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pgConfig() {
  return {
    host: process.env.POSTGRES_PRIMARY_HOST || process.env.POSTGRES_HOST || '127.0.0.1',
    port: parseInt(process.env.POSTGRES_PRIMARY_PORT || process.env.POSTGRES_PORT || '5432', 10),
    database: process.env.POSTGRES_PRIMARY_DATABASE || process.env.POSTGRES_DATABASE || 'mediczy_smoke',
    user: process.env.POSTGRES_PRIMARY_USER || process.env.POSTGRES_USER || 'mediczy_smoke',
    password: process.env.POSTGRES_PRIMARY_PASSWORD || process.env.POSTGRES_PASSWORD || 'mediczy_smoke_pw',
    connectionTimeoutMillis: 5000,
  };
}

async function canConnect(cfg) {
  const pool = new pg.Pool(cfg);
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  } finally {
    await pool.end().catch(() => {});
  }
}

async function runShell(command, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', ...opts });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(' ')} exited ${code}`));
    });
  });
}

async function ensurePostgresInstalled() {
  if (await canConnect(pgConfig())) return;

  console.log('[smoke-bootstrap] Postgres not reachable — installing local PostgreSQL...');
  await runShell('sudo', ['apt-get', 'update', '-qq'], { env: { ...process.env, DEBIAN_FRONTEND: 'noninteractive' } });
  await runShell('sudo', ['apt-get', 'install', '-y', '-qq', 'postgresql', 'postgresql-contrib'], { env: { ...process.env, DEBIAN_FRONTEND: 'noninteractive' } });
  await runShell('sudo', ['service', 'postgresql', 'start']);

  const cfg = pgConfig();
  const createRoleSql = `DO $$ BEGIN
    CREATE ROLE ${cfg.user} LOGIN PASSWORD '${cfg.password}';
  EXCEPTION WHEN duplicate_object THEN
    ALTER ROLE ${cfg.user} WITH LOGIN PASSWORD '${cfg.password}';
  END $$;`;

  await runShell('sudo', ['-u', 'postgres', 'psql', '-v', 'ON_ERROR_STOP=1', '-c', createRoleSql]);

  const dbExists = await runShellCapture('sudo', ['-u', 'postgres', 'psql', '-tAc', `SELECT 1 FROM pg_database WHERE datname='${cfg.database}'`]);
  if (!String(dbExists.stdout || '').trim()) {
    await runShell('sudo', ['-u', 'postgres', 'psql', '-v', 'ON_ERROR_STOP=1', '-c', `CREATE DATABASE ${cfg.database} OWNER ${cfg.user}`]);
  }
  await runShell('sudo', ['-u', 'postgres', 'psql', '-v', 'ON_ERROR_STOP=1', '-c', `GRANT ALL PRIVILEGES ON DATABASE ${cfg.database} TO ${cfg.user}`]);
  await runShell('sudo', ['-u', 'postgres', 'psql', '-v', 'ON_ERROR_STOP=1', '-d', cfg.database, '-c', `GRANT ALL ON SCHEMA public TO ${cfg.user}`]);
  await runShell('sudo', ['-u', 'postgres', 'psql', '-v', 'ON_ERROR_STOP=1', '-d', cfg.database, '-c', `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO ${cfg.user}`]);

  if (!(await canConnect(cfg))) {
    throw new Error('Postgres installed but smoke database is still unreachable');
  }
  console.log('[smoke-bootstrap] Postgres ready');
}

function runShellCapture(command, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { ...opts });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr?.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${command} ${args.join(' ')} exited ${code}: ${stderr}`));
    });
  });
}

async function seedSmokeData() {
  const cfg = pgConfig();
  const pool = new pg.Pool(cfg);
  const schemaPath = path.join(serverRoot, 'scripts/qa/sql/communication-hub-smoke-schema.sql');
  const schemaSql = readFileSync(schemaPath, 'utf8');

  const smokeEmail = process.env.TEAM_SMOKE_EMAIL || 'smoke-team@mediczy.local';
  const smokePassword = process.env.TEAM_SMOKE_PASSWORD || 'SmokeTest123!';
  const smokeUserId = parseInt(process.env.SMOKE_USER_ID || '9001', 10);
  const passwordHash = await bcrypt.hash(smokePassword, 10);

  try {
    await pool.query(schemaSql);
    await pool.query(
      `INSERT INTO users (id, email, password, "firstName", "lastName", role, status, "isAdmin", "isTeam", membership_type, metadata)
       VALUES ($1, $2, $3, 'Smoke', 'Team', 'system_admin', 'active', TRUE, TRUE, 'team', '{"permissions":["Corporate Management"]}'::jsonb)
       ON CONFLICT (email) DO UPDATE SET
         password = EXCLUDED.password,
         status = 'active',
         "isAdmin" = TRUE,
         "isTeam" = TRUE,
         role = 'system_admin',
         metadata = EXCLUDED.metadata`,
      [smokeUserId, smokeEmail.toLowerCase(), passwordHash]
    );
    await pool.query(`SELECT setval(pg_get_serial_sequence('users', 'id'), GREATEST((SELECT MAX(id) FROM users), $1))`, [smokeUserId]);
  } finally {
    await pool.end().catch(() => {});
  }
}

async function waitForHealth(baseUrl, timeoutMs = 120000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(3000) });
      if (res.ok) return;
    } catch {
      // retry
    }
    await sleep(2000);
  }
  throw new Error(`Server did not become healthy at ${baseUrl}/health within ${timeoutMs}ms`);
}

let serverChild = null;

export async function startSmokeServer() {
  const baseUrl = process.env.SMOKE_API_BASE || `http://127.0.0.1:${process.env.PORT || 18998}`;

  try {
    const health = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(2000) });
    if (health.ok) {
      console.log(`[smoke-bootstrap] Reusing running server at ${baseUrl}`);
      return { baseUrl, child: null, reused: true };
    }
  } catch {
    // start new server
  }

  const env = {
    ...process.env,
    NODE_ENV: 'development',
    DOTENV_IN_PROD: 'true',
    DISABLE_KAFKA: 'true',
    PGVECTOR_ENABLED: 'false',
    PORT: String(new URL(baseUrl).port || process.env.PORT || 18998),
  };

  serverChild = spawn('node', ['scripts/qa/communication-hub-smoke-api.mjs'], {
    cwd: serverRoot,
    env: {
      ...env,
      NODE_ENV: 'test',
      SMOKE_NODE_ENV: 'test',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  serverChild.stdout?.on('data', (chunk) => process.stdout.write(`[smoke-server] ${chunk}`));
  serverChild.stderr?.on('data', (chunk) => process.stderr.write(`[smoke-server] ${chunk}`));

  serverChild.on('exit', (code, signal) => {
    if (code !== null && code !== 0) {
      console.error(`[smoke-bootstrap] Server exited with code ${code}`);
    }
    if (signal) console.error(`[smoke-bootstrap] Server killed: ${signal}`);
  });

  await waitForHealth(baseUrl);
  console.log(`[smoke-bootstrap] Server healthy at ${baseUrl}`);
  return { baseUrl, child: serverChild, reused: false };
}

export function mintSmokeTeamToken() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET missing for smoke token mint');
  const userId = parseInt(process.env.SMOKE_USER_ID || '9001', 10);
  const email = process.env.TEAM_SMOKE_EMAIL || 'smoke-team@mediczy.local';
  return jwt.sign(
    {
      id: userId,
      email,
      role: 'team',
      isTeam: true,
      isAdmin: true,
      tokenType: 'access',
    },
    secret,
    { expiresIn: '1h' },
  );
}

export async function ensureSmokeStack() {
  loadSmokeEnv();
  await ensurePostgresInstalled();
  await seedSmokeData();
  const { baseUrl, child, reused } = await startSmokeServer();
  const token = mintSmokeTeamToken();
  return { baseUrl, token, child, reused };
}

export async function stopSmokeStack(child) {
  if (!child || child.killed) return;
  child.kill('SIGTERM');
  await sleep(1500);
  if (!child.killed) child.kill('SIGKILL');
}
