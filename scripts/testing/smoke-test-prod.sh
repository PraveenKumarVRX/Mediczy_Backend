#!/bin/bash
set -u

PASS=0
FAIL=0
TOTAL=0
SKIPPED=0

API_BASE="${API_BASE:-http://localhost:8888}"
APP_BASE="${APP_BASE:-https://app.mediqzy.com}"
SIB_BASE="${SIB_BASE:-http://localhost:8001}"
SERVER_DIR="${SERVER_DIR:-/home/ubuntu/Mediczy/server}"
# PM2 loads root .env then server/.env (see ecosystem.config.js); smoke tests must match.
MEDICZY_HOME="${MEDICZY_HOME:-$(dirname "$SERVER_DIR")}"

ADMIN_TOKEN=""
DOC_TOKEN=""
ADMIN_ROLE=""
ADMIN_EMAIL=""
CORPORATE_ID=""

record_pass() {
  PASS=$((PASS+1))
  echo "✅ $1"
}

record_fail() {
  FAIL=$((FAIL+1))
  echo "❌ $1 — $2"
}

t() {
  TOTAL=$((TOTAL+1))
  local name="$1"
  local result="$2"
  local expect="$3"
  if echo "$result" | grep -q "$expect"; then
    record_pass "$name"
  else
    record_fail "$name" "got: $(echo "$result" | head -c 200)"
  fi
}

tn() {
  TOTAL=$((TOTAL+1))
  local name="$1"
  local value="$2"
  local minimum="$3"
  if [[ "$value" =~ ^[0-9]+$ ]] && [ "$value" -ge "$minimum" ]; then
    record_pass "$name"
  else
    record_fail "$name" "expected >= $minimum, got: ${value:-<empty>}"
  fi
}

skip_test() {
  local label="$1"
  echo "⚠ $label"
  SKIPPED=$((SKIPPED+1))
}

json_eval() {
  local payload="$1"
  local expr="$2"
  printf '%s' "$payload" | python3 -c 'import json, sys
expr = sys.argv[1]
try:
    data = json.load(sys.stdin)
    value = eval(expr, {"__builtins__": {}}, {"data": data, "len": len, "int": int, "str": str})
    if value is None:
        print("")
    elif isinstance(value, (dict, list)):
        print(json.dumps(value))
    else:
        print(value)
except Exception:
    print("")' "$expr"
}

IDENTITY_JSON=$(cd "$SERVER_DIR" && MEDICZY_HOME="$MEDICZY_HOME" node <<'NODE'
const fs = require('fs');
const path = require('path');
const rootDir = process.env.MEDICZY_HOME || path.resolve(process.cwd(), '..');
const serverDir = process.cwd();

// Mirror ecosystem.config.js loadEnvFile — PM2 source of truth for runtime secrets.
function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return false;
  fs.readFileSync(filePath, 'utf8')
    .split('\n')
    .forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const idx = trimmed.indexOf('=');
      if (idx === -1) return;
      const key = trimmed.slice(0, idx).trim();
      const raw = trimmed.slice(idx + 1).trim();
      const val = raw.replace(/^(['"])(.*)\1$/, '$2');
      if (key) process.env[key] = val;
    });
  return true;
}

const rootEnvPath = path.join(rootDir, '.env');
const serverEnvPath = path.join(serverDir, '.env');
const loadedRoot = loadEnvFile(rootEnvPath);
const loadedServer = loadEnvFile(serverEnvPath);

function readPm2JwtSecret() {
  try {
    const { execSync } = require('child_process');
    const raw = execSync('pm2 jlist', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
    const apps = JSON.parse(raw);
    const server = apps.find((app) => app.name === 'mediczy-server');
    const env = server?.pm2_env?.env || {};
    return env.JWT_SECRET || env.JWT_ACCESS_SECRET || null;
  } catch {
    return null;
  }
}

const pm2JwtSecret = readPm2JwtSecret();
if (pm2JwtSecret) {
  process.env.JWT_SECRET = pm2JwtSecret;
}

const { Client } = require('pg');
const jwt = require('jsonwebtoken');

function envFlag(name, fallback = false) {
  const raw = process.env[name];
  if (raw == null) return fallback;
  return String(raw).toLowerCase() === 'true';
}

const useSSL = envFlag('POSTGRES_SSL') || String(process.env.PGSSLMODE || '').toLowerCase() === 'require';
const dbConfig = process.env.DATABASE_URL
  ? {
      connectionString: process.env.DATABASE_URL,
      ssl: useSSL ? { rejectUnauthorized: false } : false,
    }
  : {
      host: process.env.POSTGRES_HOST || '127.0.0.1',
      port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
      database: process.env.POSTGRES_DATABASE || 'mediczy_ai',
      user: process.env.POSTGRES_USER || 'mediczy_helper',
      password:
        process.env.POSTGRES_PASSWORD ||
        process.env.POSTGRES_PRIMARY_PASSWORD ||
        process.env.DB_PASSWORD ||
        process.env.DB_PASS ||
        undefined,
      ssl: useSSL ? { rejectUnauthorized: false } : false,
    };
const jwtSecret = process.env.JWT_SECRET || process.env.JWT_ACCESS_SECRET;
if (!jwtSecret) {
  throw new Error(
    `JWT_SECRET not found. Checked root=${rootEnvPath} (exists=${loadedRoot}) server=${serverEnvPath} (exists=${loadedServer})`
  );
}

function quoteIdent(name) {
  return /[A-Z]/.test(name) ? `"${name}"` : name;
}

async function tableColumns(client, tableName) {
  const result = await client.query(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`,
    [tableName]
  );
  return new Set(result.rows.map((row) => row.column_name));
}

function pickColumn(columns, candidates, fallback) {
  for (const candidate of candidates) {
    if (columns.has(candidate)) return quoteIdent(candidate);
  }
  return fallback;
}

async function buildAdminIdentity(client) {
  const columns = await tableColumns(client, 'users');
  const idCol = pickColumn(columns, ['id'], 'id');
  const emailCol = pickColumn(columns, ['email'], `'admin@mediczy.com'`);
  const roleCol = pickColumn(columns, ['role'], `'admin'`);
  const firstNameCol = pickColumn(columns, ['firstName', 'first_name'], `''`);
  const lastNameCol = pickColumn(columns, ['lastName', 'last_name'], `''`);
  const isAdminCol = pickColumn(columns, ['isAdmin', 'is_admin'], 'false');
  const isTeamCol = pickColumn(columns, ['isTeam', 'is_team'], 'false');
  const tenantCol = pickColumn(columns, ['tenant_id', 'organization_id'], 'NULL');

  const activePredicates = [];
  if (columns.has('status')) activePredicates.push(`(${quoteIdent('status')} IS NULL OR ${quoteIdent('status')} = 'active')`);
  if (columns.has('isActive')) activePredicates.push(`(${quoteIdent('isActive')} IS NULL OR ${quoteIdent('isActive')} = true)`);
  if (columns.has('is_active')) activePredicates.push(`(${quoteIdent('is_active')} IS NULL OR ${quoteIdent('is_active')} = true)`);
  const activeWhere = activePredicates.length ? activePredicates.join(' AND ') : 'true';

  const result = await client.query(`
    SELECT
      ${idCol} AS id,
      COALESCE(${emailCol}::text, 'admin@mediczy.com') AS email,
      COALESCE(${roleCol}::text, 'admin') AS role,
      COALESCE(${firstNameCol}::text, '') AS first_name,
      COALESCE(${lastNameCol}::text, '') AS last_name,
      COALESCE(${isAdminCol}, false) AS is_admin,
      COALESCE(${isTeamCol}, false) AS is_team,
      ${tenantCol} AS tenant_id
    FROM users
    WHERE ${activeWhere}
      AND (
        COALESCE(${isAdminCol}, false) = true OR
        COALESCE(${roleCol}::text, '') IN ('admin', 'system_admin', 'super_admin', 'platform_admin')
      )
    ORDER BY
      CASE
        WHEN LOWER(COALESCE(${emailCol}::text, '')) IN ('admin@mediczy.com', 'superadmin@mediczy.com') THEN 0
        WHEN COALESCE(${isAdminCol}, false) = true THEN 1
        ELSE 2
      END,
      ${idCol} ASC
    LIMIT 1
  `);

  return result.rows[0] || null;
}

async function buildDoctorIdentity(client) {
  const columns = await tableColumns(client, 'doctors');
  if (!columns.size) return null;

  const idCol = pickColumn(columns, ['id'], 'id');
  const statusPredicates = [];
  if (columns.has('status')) statusPredicates.push(`(${quoteIdent('status')} IS NULL OR ${quoteIdent('status')} = 'active')`);
  if (columns.has('isActive')) statusPredicates.push(`(${quoteIdent('isActive')} IS NULL OR ${quoteIdent('isActive')} = true)`);
  if (columns.has('is_active')) statusPredicates.push(`(${quoteIdent('is_active')} IS NULL OR ${quoteIdent('is_active')} = true)`);
  const activeWhere = statusPredicates.length ? statusPredicates.join(' AND ') : 'true';

  const result = await client.query(`
    SELECT ${idCol} AS id
    FROM doctors
    WHERE ${activeWhere}
    ORDER BY ${idCol} ASC
    LIMIT 1
  `);

  return result.rows[0] || null;
}

(async () => {
  const client = new Client(dbConfig);
  try {
    await client.connect();

    const admin = await buildAdminIdentity(client);
    if (!admin) {
      throw new Error('No active admin identity found for smoke test');
    }

    const adminPayload = {
      id: admin.id,
      adminId: admin.id,
      email: admin.email,
      role: admin.role || 'admin',
      userType: 'admin',
      isAdmin: true,
      isTeam: Boolean(admin.is_team),
      firstName: admin.first_name || 'Smoke',
      lastName: admin.last_name || 'Admin',
      tenantId: admin.tenant_id || null,
      tenant_id: admin.tenant_id || null,
    };

    const doctor = await buildDoctorIdentity(client);
    const doctorPayload = doctor
      ? {
          id: doctor.id,
          doctorId: doctor.id,
          role: 'doctor',
          userType: 'doctor',
        }
      : null;

    const adminToken = jwt.sign(adminPayload, jwtSecret, { expiresIn: '15m', algorithm: 'HS256' });
    const doctorToken = doctorPayload
      ? jwt.sign(doctorPayload, jwtSecret, { expiresIn: '15m', algorithm: 'HS256' })
      : '';

    // Fail fast if local signing does not verify (secret mismatch vs running server).
    jwt.verify(adminToken, jwtSecret, { algorithms: ['HS256'] });

    console.log(JSON.stringify({
      adminToken,
      adminEmail: adminPayload.email,
      adminRole: adminPayload.role,
      doctorToken,
      doctorId: doctorPayload ? doctorPayload.id : null,
      jwtEnv: pm2JwtSecret
        ? 'pm2:mediczy-server'
        : (process.env.JWT_SECRET ? 'JWT_SECRET' : 'JWT_ACCESS_SECRET'),
      envFiles: { root: loadedRoot, server: loadedServer },
    }));
  } catch (error) {
    console.error(JSON.stringify({ error: error.message }));
    process.exit(1);
  } finally {
    await client.end().catch(() => {});
  }
})();
NODE
)

if [ -n "${ADMIN_TOKEN_OVERRIDE:-}" ]; then
  ADMIN_TOKEN="$ADMIN_TOKEN_OVERRIDE"
else
  ADMIN_TOKEN=$(json_eval "$IDENTITY_JSON" "data.get('adminToken')")
fi

if [ -n "${DOC_TOKEN_OVERRIDE:-}" ]; then
  DOC_TOKEN="$DOC_TOKEN_OVERRIDE"
else
  DOC_TOKEN=$(json_eval "$IDENTITY_JSON" "data.get('doctorToken')")
fi

ADMIN_ROLE=$(json_eval "$IDENTITY_JSON" "data.get('adminRole')")
ADMIN_EMAIL=$(json_eval "$IDENTITY_JSON" "data.get('adminEmail')")

if [ -z "$ADMIN_TOKEN" ]; then
  echo "❌ Unable to build admin smoke token"
  echo "   Identity output: $(echo "$IDENTITY_JSON" | head -c 300)"
  exit 1
fi

echo "═══════════════════════════════════════════════"
echo "  MEDICZY PRODUCTION SMOKE TEST — $(date '+%Y-%m-%d %H:%M')"
echo "═══════════════════════════════════════════════"
echo ""
echo "Smoke identity: admin=$ADMIN_EMAIL role=$ADMIN_ROLE doctor_token=$([ -n "$DOC_TOKEN" ] && echo yes || echo no)"
JWT_ENV=$(json_eval "$IDENTITY_JSON" "data.get('jwtEnv')")
ENV_ROOT=$(json_eval "$IDENTITY_JSON" "data.get('envFiles', {}).get('root')")
ENV_SERVER=$(json_eval "$IDENTITY_JSON" "data.get('envFiles', {}).get('server')")
echo "JWT env: ${JWT_ENV:-unknown} (root .env=${ENV_ROOT:-?} server/.env=${ENV_SERVER:-?})"
echo ""
echo "── CORE INFRASTRUCTURE ──"
R=$(curl -s "$API_BASE/api/health")
t "1. Health endpoint" "$R" '"status":"healthy"'
DB=$(json_eval "$R" "((data.get('databases') or {}).get('postgres'))")
t "2. PostgreSQL connected" "$DB" "connected"
REDIS=$(json_eval "$R" "((data.get('databases') or {}).get('redis', 'unknown'))")
t "3. Redis connected" "$REDIS" "connected"
SIB=$(curl -s "$SIB_BASE/health" 2>/dev/null)
t "4. SIB FastAPI (port 8001)" "$SIB" "status"

echo ""
echo "── SIB AI ──"
R=$(curl -s "$API_BASE/api/sib/ai-dashboard" -H "Authorization: Bearer $ADMIN_TOKEN")
t "5. SIB AI Dashboard" "$R" '"success":true'
TYPES=$(json_eval "$R" "len((((data.get('data') or {}).get('aiDecisionTypes')) or []))")
tn "6. AI Decision Types (>=1)" "${TYPES:-0}" 1

echo ""
echo "── LEARNING LOOP ──"
if [ -n "$DOC_TOKEN" ]; then
  R=$(curl -s -X POST "$API_BASE/api/cdss/knowledge/feedback" \
    -H "Authorization: Bearer $DOC_TOKEN" -H "Content-Type: application/json" \
    -d "{\"queryId\":\"smoke-test-$$\",\"action\":\"accepted\",\"queryText\":\"smoke test\",\"codesKept\":[\"Z00.0\"]}")
  t "7. CDSS Feedback submit" "$R" '"success":true'
  R=$(curl -s "$API_BASE/api/cdss/knowledge/feedback/stats" -H "Authorization: Bearer $ADMIN_TOKEN")
  t "8. CDSS Feedback stats" "$R" '"success":true'
else
  skip_test "7-8 doctor-token learning-loop tests skipped (no active doctor found)"
fi

echo ""
echo "── MEDICAL DATA ──"
if [ -n "$DOC_TOKEN" ]; then
  R=$(curl -s "$API_BASE/api/doctor/clinical-workflow/icd10/search?search=diabetes&limit=3" -H "Authorization: Bearer $DOC_TOKEN")
  t "9. ICD-10 search (diabetes)" "$R" '"success":true'
  R=$(curl -s "$API_BASE/api/doctor/clinical-workflow/snomed/search?search=hypertension&limit=3" -H "Authorization: Bearer $DOC_TOKEN")
  t "10. SNOMED search (hypertension)" "$R" '"success":true'
  R=$(curl -s "$API_BASE/api/doctor/clinical-workflow/cpt/search?q=blood&limit=3" -H "Authorization: Bearer $DOC_TOKEN")
  t "11. CPT search (blood)" "$R" '"success":true'

  echo ""
  echo "── CDSS AI QUERY ──"
  R=$(curl -s -m 30 -X POST "$API_BASE/api/cdss/knowledge/query" \
    -H "Authorization: Bearer $DOC_TOKEN" -H "Content-Type: application/json" \
    -d '{"query":"metformin dose for type 2 diabetes"}')
  t "12. CDSS LLM query" "$R" '"success":true'
  PROV=$(json_eval "$R" "data.get('provider') or 'none'")
  echo "    LLM Provider: $PROV"
else
  skip_test "9-12 doctor-token medical-data tests skipped (no active doctor found)"
fi

echo ""
echo "── FHIR R4 ──"
R=$(curl -s "$API_BASE/api/fhir/r4/metadata")
t "13. FHIR CapabilityStatement" "$R" "CapabilityStatement"
FVER=$(json_eval "$R" "data.get('fhirVersion', '')")
t "14. FHIR version 4.0.1" "$FVER" "4.0.1"
if [ -n "$DOC_TOKEN" ]; then
  R=$(curl -s "$API_BASE/api/fhir/r4/Patient" -H "Authorization: Bearer $DOC_TOKEN")
  t "15. FHIR Patient search" "$R" "Bundle"
else
  skip_test "15 doctor-token FHIR patient search skipped (no active doctor found)"
fi

echo ""
echo "── ADMIN AND TENANT SURFACES ──"
R=$(curl -s "$API_BASE/api/superadmin/tenants/tenants" -H "Authorization: Bearer $ADMIN_TOKEN")
t "16. Superadmin tenant list" "$R" '"success":true'
R=$(curl -s "$API_BASE/api/superadmin/tenants/tiers" -H "Authorization: Bearer $ADMIN_TOKEN")
t "17. Tenant tiers config" "$R" '"success":true'
R=$(curl -s "$API_BASE/api/admin/corporates" -H "Authorization: Bearer $ADMIN_TOKEN")
t "18. Admin corporate list" "$R" '"success":true'
CORPORATE_COUNT=$(json_eval "$R" "len((data.get('data') or []))")
tn "19. Admin corporates available (>=1)" "${CORPORATE_COUNT:-0}" 1
CORPORATE_ID=$(json_eval "$R" "((data.get('data') or [{}])[0] or {}).get('id')")
if [[ "$CORPORATE_ID" =~ ^[0-9]+$ ]]; then
  R=$(curl -s "$API_BASE/api/admin/corporate-employees/$CORPORATE_ID/activation-stats" -H "Authorization: Bearer $ADMIN_TOKEN")
  t "20. Corporate activation stats" "$R" '"success":true'
  ACT_TOTAL=$(json_eval "$R" "((data.get('stats') or {}).get('total'))")
  ACT_LOGGED=$(json_eval "$R" "((data.get('stats') or {}).get('loggedIn'))")
  tn "21. Activation stats total parsed (>=0)" "${ACT_TOTAL:-0}" 0
  tn "22. Activation stats logged-in parsed (>=0)" "${ACT_LOGGED:-0}" 0
  echo "    Activation stats: corporate_id=$CORPORATE_ID total=${ACT_TOTAL:-0} logged_in=${ACT_LOGGED:-0}"
else
  skip_test "20-22 corporate activation stats skipped (no corporate id returned)"
fi

echo ""
echo "── EDGE CASES ──"
R=$(curl -s -o /dev/null -w "%{http_code}" "$API_BASE/api/doctor/clinical-workflow/icd10/search?search=diabetes")
t "23. No auth -> 401" "$R" "401"
if [ -n "$DOC_TOKEN" ]; then
  R=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API_BASE/api/cdss/knowledge/query" \
    -H "Authorization: Bearer $DOC_TOKEN" -H "Content-Type: application/json" -d '{}')
  t "24. Empty CDSS query -> 400" "$R" "400"
else
  skip_test "24 empty CDSS query check skipped (no active doctor found)"
fi

echo ""
echo "── EXTERNAL HTTPS ──"
R=$(curl -sk -o /dev/null -w "%{http_code}" "$APP_BASE/" 2>/dev/null)
t "25. Frontend (app.mediqzy.com)" "$R" "200"
R=$(curl -sk -o /dev/null -w "%{http_code}" "$APP_BASE/api/health" 2>/dev/null)
t "26. API HTTPS (mediqzy.com)" "$R" "200"

echo ""
echo "── DB RECORD COUNTS ──"
COUNTS_JSON=$(cd "$SERVER_DIR" && MEDICZY_HOME="$MEDICZY_HOME" node <<'NODE'
const fs = require('fs');
const path = require('path');
const rootDir = process.env.MEDICZY_HOME || path.resolve(process.cwd(), '..');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return false;
  fs.readFileSync(filePath, 'utf8')
    .split('\n')
    .forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const idx = trimmed.indexOf('=');
      if (idx === -1) return;
      const key = trimmed.slice(0, idx).trim();
      const raw = trimmed.slice(idx + 1).trim();
      const val = raw.replace(/^(['"])(.*)\1$/, '$2');
      if (key) process.env[key] = val;
    });
  return true;
}

loadEnvFile(path.join(rootDir, '.env'));
loadEnvFile(path.join(process.cwd(), '.env'));
const { Client } = require('pg');

function envFlag(name, fallback = false) {
  const raw = process.env[name];
  if (raw == null) return fallback;
  return String(raw).toLowerCase() === 'true';
}

const useSSL = envFlag('POSTGRES_SSL') || String(process.env.PGSSLMODE || '').toLowerCase() === 'require';
const dbConfig = process.env.DATABASE_URL
  ? {
      connectionString: process.env.DATABASE_URL,
      ssl: useSSL ? { rejectUnauthorized: false } : false,
    }
  : {
      host: process.env.POSTGRES_HOST || '127.0.0.1',
      port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
      database: process.env.POSTGRES_DATABASE || 'mediczy_ai',
      user: process.env.POSTGRES_USER || 'mediczy_helper',
      password:
        process.env.POSTGRES_PASSWORD ||
        process.env.POSTGRES_PRIMARY_PASSWORD ||
        process.env.DB_PASSWORD ||
        process.env.DB_PASS ||
        undefined,
      ssl: useSSL ? { rejectUnauthorized: false } : false,
    };

(async () => {
  const client = new Client(dbConfig);
  try {
    await client.connect();
    const icd = await client.query('SELECT count(*)::int AS count FROM icd10_codes');
    const snomed = await client.query('SELECT count(*)::int AS count FROM snomed_codes');
    const kb = await client.query('SELECT count(*)::int AS count FROM medical_embeddings');
    console.log(JSON.stringify({
      icd10: icd.rows[0]?.count || 0,
      snomed: snomed.rows[0]?.count || 0,
      kbEmbeddings: kb.rows[0]?.count || 0,
    }));
  } catch (error) {
    console.error(JSON.stringify({ error: error.message }));
    process.exit(1);
  } finally {
    await client.end().catch(() => {});
  }
})();
NODE
)
ICD_COUNT=$(json_eval "$COUNTS_JSON" "data.get('icd10')")
SNOMED_COUNT=$(json_eval "$COUNTS_JSON" "data.get('snomed')")
KB_COUNT=$(json_eval "$COUNTS_JSON" "data.get('kbEmbeddings')")
echo "    ICD=$ICD_COUNT SNOMED=$SNOMED_COUNT KB=$KB_COUNT"
tn "27. ICD-10 rows (>=70000)" "${ICD_COUNT:-0}" 70000
tn "28. SNOMED rows (>=300000)" "${SNOMED_COUNT:-0}" 300000
tn "29. KB embeddings (>=10000)" "${KB_COUNT:-0}" 10000

echo ""
echo "── PM2 ──"
pm2 ls 2>&1 | grep -E "name|mediczy|sib|n8n|worker" || true

echo ""
echo "═══════════════════════════════════════════════"
echo "  RESULTS: $PASS/$TOTAL passed, $FAIL failed"
if [ $SKIPPED -gt 0 ]; then
  echo "  SKIPPED: $SKIPPED checks"
fi
if [ $FAIL -eq 0 ]; then
  echo "  ALL TESTS PASSED"
else
  echo "  SOME TESTS FAILED"
fi
echo "═══════════════════════════════════════════════"

if [ $FAIL -ne 0 ]; then
  exit 1
fi
