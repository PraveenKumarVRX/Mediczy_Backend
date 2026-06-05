import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import pg from 'pg';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
import ExcelJS from 'exceljs';
import { parse as parseCsv } from 'csv-parse/sync';

const { Pool } = pg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(serverRoot, '..');

for (const envPath of [path.join(repoRoot, '.env'), path.join(serverRoot, '.env')]) {
  if (fs.existsSync(envPath)) dotenv.config({ path: envPath, override: false });
}

const DEFAULT_CORPORATE = 'Ninjacart';
const DRY_RUN_NOTE = 'Dry-run only. Re-run with --apply to commit changes.';

const FIELD_ALIASES = {
  employeeId: ['employeeid', 'employee_id', 'empid', 'emp_id', 'employee code', 'employeecode', 'employee no', 'employeeno', 'staffid'],
  firstName: ['firstname', 'first_name', 'first name', 'givenname', 'given name'],
  lastName: ['lastname', 'last_name', 'last name', 'surname'],
  name: ['name', 'fullname', 'full_name', 'full name', 'employeename', 'employee name'],
  email: ['email', 'officialemail', 'official_email', 'official email', 'workemail', 'work_email', 'work email', 'mail'],
  phoneNumber: ['phone', 'phonenumber', 'phone_number', 'mobile', 'mobilenumber', 'mobile_number', 'contact', 'contactnumber'],
  department: ['department', 'dept', 'team'],
  designation: ['designation', 'title', 'jobtitle', 'job_title', 'role'],
  city: ['city', 'workcity', 'work_city', 'work city'],
  state: ['state', 'workstate', 'work_state', 'work state'],
  pinCode: ['pincode', 'pin_code', 'pin code', 'zipcode', 'zip_code', 'zip'],
  location: ['location', 'office', 'worklocation', 'work_location', 'work location'],
  facility: ['facility', 'site', 'branch'],
  gender: ['gender', 'sex'],
  dateOfBirth: ['dateofbirth', 'date_of_birth', 'date of birth', 'dob'],
  joiningDate: ['joiningdate', 'joining_date', 'joining date', 'doj'],
};

function usage() {
  console.log(`
Usage:
  node server/scripts/sync-corporate-employees.mjs --file <csv-or-xlsx> [--corporate Ninjacart] [--apply]

Options:
  --file <path>          Authoritative employee list CSV/XLSX.
  --corporate <name|id>  Corporate to sync. Defaults to ${DEFAULT_CORPORATE}.
  --apply                Commit changes. Without this, the transaction is rolled back.
  --limit-removals <n>   Refuse apply if more than n active employees would be deactivated.

Required source fields:
  employeeId or email. New user accounts require email; rows without email are added as roster-only records.

Supported common fields:
  employeeId, name, firstName, lastName, email, phoneNumber, department, designation, city, state, pinCode, location, facility, gender, dateOfBirth, joiningDate.
`);
}

function parseArgs(argv) {
  const args = {
    corporate: DEFAULT_CORPORATE,
    apply: false,
    limitRemovals: null,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else if (arg === '--apply') {
      args.apply = true;
    } else if (arg === '--file') {
      args.file = argv[++i];
    } else if (arg === '--corporate') {
      args.corporate = argv[++i];
    } else if (arg === '--limit-removals') {
      args.limitRemovals = Number(argv[++i]);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function normalizeHeader(value) {
  return String(value || '').trim().toLowerCase().replace(/[\s._-]+/g, '');
}

function buildAliasLookup() {
  const lookup = new Map();
  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    for (const alias of aliases) {
      lookup.set(normalizeHeader(alias), field);
    }
  }
  return lookup;
}

function clean(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function normalizeEmail(value) {
  return clean(value).toLowerCase();
}

function normalizeEmployeeId(value) {
  const raw = clean(value).toUpperCase().replace(/[.\-_/]/g, '');
  if (/^\d+$/.test(raw) && raw.length > 0 && raw.length < 6) return raw.padStart(6, '0');
  return raw;
}

function splitName(row) {
  const fullName = clean(row.name);
  if (!fullName) return;
  const parts = fullName.split(/\s+/);
  if (!row.firstName) row.firstName = parts.shift() || '';
  if (!row.lastName) row.lastName = parts.join(' ');
}

function canonicalInputKey(row) {
  const employeeId = normalizeEmployeeId(row.employeeId);
  if (employeeId) return `emp:${employeeId}`;
  const email = normalizeEmail(row.email);
  if (email) return `email:${email}`;
  return '';
}

function sourceKeySet(row) {
  const keys = [];
  const employeeId = normalizeEmployeeId(row.employeeId);
  const email = normalizeEmail(row.email);
  if (employeeId) keys.push(`emp:${employeeId}`);
  if (email) keys.push(`email:${email}`);
  return keys;
}

function mapRawRow(raw, aliasLookup) {
  const row = {};
  for (const [key, value] of Object.entries(raw)) {
    const mapped = aliasLookup.get(normalizeHeader(key));
    if (mapped) row[mapped] = clean(value);
  }

  splitName(row);

  row.employeeId = clean(row.employeeId);
  row.email = normalizeEmail(row.email);
  row.phoneNumber = clean(row.phoneNumber);
  row.department = clean(row.department);
  row.designation = clean(row.designation);
  row.city = clean(row.city);
  row.state = clean(row.state);
  row.pinCode = clean(row.pinCode);
  row.location = clean(row.location);
  row.facility = clean(row.facility);
  row.gender = clean(row.gender);
  row.dateOfBirth = clean(row.dateOfBirth);
  row.joiningDate = clean(row.joiningDate);
  row.firstName = clean(row.firstName);
  row.lastName = clean(row.lastName);

  return row;
}

async function readCsv(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  return parseCsv(text, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    trim: true,
  });
}

async function readXlsx(filePath) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];

  const headers = [];
  sheet.getRow(1).eachCell((cell, colNumber) => {
    headers[colNumber] = clean(cell.value?.text ?? cell.value);
  });

  const rows = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const record = {};
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const header = headers[colNumber];
      if (!header) return;
      const value = cell.value?.text ?? cell.value?.result ?? cell.value;
      record[header] = value instanceof Date ? value.toISOString().slice(0, 10) : value;
    });
    if (Object.values(record).some((value) => clean(value))) rows.push(record);
  });
  return rows;
}

async function loadEmployees(filePath) {
  const absolutePath = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(absolutePath)) throw new Error(`File not found: ${absolutePath}`);

  const ext = path.extname(absolutePath).toLowerCase();
  const rawRows = ext === '.xlsx' || ext === '.xls'
    ? await readXlsx(absolutePath)
    : await readCsv(absolutePath);

  const aliasLookup = buildAliasLookup();
  const employees = [];
  const errors = [];
  const seen = new Map();

  rawRows.forEach((raw, index) => {
    const rowNumber = index + 2;
    const row = mapRawRow(raw, aliasLookup);
    const key = canonicalInputKey(row);
    const allKeys = sourceKeySet(row);

    if (!key) {
      errors.push({ row: rowNumber, reason: 'Missing employeeId and email' });
      return;
    }
    if (!row.firstName && !row.email) {
      errors.push({ row: rowNumber, reason: 'Missing firstName/name for roster-only employee' });
      return;
    }
    const duplicateKey = allKeys.find((item) => seen.has(item));
    if (duplicateKey) {
      errors.push({ row: rowNumber, reason: "Duplicate source employee key also seen on row " + seen.get(duplicateKey) });
      return;
    }

    allKeys.forEach((item) => seen.set(item, rowNumber));
    employees.push({ ...row, rowNumber, key, keys: allKeys });
  });

  return { employees, errors, absolutePath };
}

function dbConfig() {
  const host = process.env.POSTGRES_HOST || process.env.DB_HOST || process.env.PGHOST || '127.0.0.1';
  const sslMode = String(process.env.PGSSLMODE || process.env.POSTGRES_SSL || process.env.DB_SSL || '').toLowerCase();
  const isLocalHost = ['127.0.0.1', 'localhost', '::1'].includes(host);
  const useSsl = sslMode
    ? !['0', 'false', 'disable', 'disabled', 'off'].includes(sslMode)
    : !isLocalHost;

  return {
    host,
    port: Number(process.env.POSTGRES_PORT || process.env.DB_PORT || process.env.PGPORT || 5432),
    database: process.env.POSTGRES_DB || process.env.DB_NAME || process.env.PGDATABASE || 'mediczy_ai',
    user: process.env.POSTGRES_USER || process.env.DB_USER || process.env.PGUSER,
    password: process.env.POSTGRES_PASSWORD || process.env.DB_PASSWORD || process.env.PGPASSWORD,
    ssl: useSsl ? { rejectUnauthorized: false } : undefined,
  };
}

async function resolveCorporate(client, corporateArg) {
  const numericId = Number(corporateArg);
  const query = Number.isInteger(numericId) && numericId > 0
    ? ['SELECT id, "companyName", unique_id FROM corporates WHERE id = $1', [numericId]]
    : ['SELECT id, "companyName", unique_id FROM corporates WHERE lower("companyName") = lower($1) OR lower("companyName") LIKE lower($2) ORDER BY id DESC LIMIT 1', [corporateArg, `%${corporateArg}%`]];

  const result = await client.query(query[0], query[1]);
  if (!result.rows[0]) throw new Error(`Corporate not found: ${corporateArg}`);
  return result.rows[0];
}

async function loadExisting(client, corporateId) {
  const [assocRows, rosterRows] = await Promise.all([
    client.query(
      `SELECT
         u.id AS user_id,
         u.email,
         u."firstName",
         u."lastName",
         u."phoneNumber",
         u.employee_id,
         u.department_name,
         ua.status AS association_status,
         ua.metadata AS association_metadata,
         ce.id AS corporate_employee_row_id,
         ce."employeeId" AS corporate_employee_id,
         ce."isActive" AS corporate_employee_active
       FROM user_associations ua
       JOIN users u ON u.id = ua."userId"
       LEFT JOIN corporate_employees ce
         ON ce."userId" = u.id AND ce.corporate_id = ua."entityId"
       WHERE ua."entityType" = 'corporate'
         AND ua."entityId" = $1
         AND ua.role = 'employee'`,
      [corporateId]
    ),
    client.query(
      `SELECT
         ce.id AS corporate_employee_row_id,
         ce."userId" AS user_id,
         ce."employeeId" AS corporate_employee_id,
         ce.department,
         ce.designation,
         ce."isActive" AS corporate_employee_active,
         u.email,
         u.employee_id
       FROM corporate_employees ce
       LEFT JOIN users u ON u.id = ce."userId"
       WHERE ce.corporate_id = $1`,
      [corporateId]
    ),
  ]);

  const byKey = new Map();
  const all = new Map();

  function add(row) {
    const userId = row.user_id ? Number(row.user_id) : null;
    const ceId = row.corporate_employee_row_id ? Number(row.corporate_employee_row_id) : null;
    const employeeId = row.corporate_employee_id || row.employee_id || row.association_metadata?.employeeId || '';
    const email = normalizeEmail(row.email);
    const key = userId ? `user:${userId}` : `ce:${ceId}`;

    const existing = all.get(key) || {};
    const merged = {
      ...existing,
      ...row,
      user_id: userId || existing.user_id || null,
      corporate_employee_row_id: ceId || existing.corporate_employee_row_id || null,
      resolved_employee_id: employeeId || existing.resolved_employee_id || '',
      resolved_email: email || existing.resolved_email || '',
    };

    all.set(key, merged);

    const normalizedEmployeeId = normalizeEmployeeId(merged.resolved_employee_id);
    if (normalizedEmployeeId && !byKey.has(`emp:${normalizedEmployeeId}`)) byKey.set(`emp:${normalizedEmployeeId}`, merged);
    if (merged.resolved_email && !byKey.has(`email:${merged.resolved_email}`)) byKey.set(`email:${merged.resolved_email}`, merged);
  }

  assocRows.rows.forEach(add);
  rosterRows.rows.forEach(add);
  return { byKey, all: [...all.values()] };
}

function matchExisting(existing, row) {
  const employeeKey = normalizeEmployeeId(row.employeeId);
  if (employeeKey && existing.byKey.has(`emp:${employeeKey}`)) return existing.byKey.get(`emp:${employeeKey}`);
  const emailKey = normalizeEmail(row.email);
  if (emailKey && existing.byKey.has(`email:${emailKey}`)) return existing.byKey.get(`email:${emailKey}`);
  return null;
}

function randomPassword() {
  return `Msh-${crypto.randomBytes(9).toString('base64url')}1!`;
}

function properGender(value) {
  const gender = clean(value).toLowerCase();
  if (gender === 'female') return 'Female';
  if (gender === 'other') return 'Other';
  return 'Male';
}

async function ensureUser(client, corporate, row, matched) {
  if (matched?.user_id) return { userId: matched.user_id, created: false };
  if (!row.email) return { userId: null, created: false };

  const existingUser = await client.query('SELECT id FROM users WHERE lower(email) = lower($1) LIMIT 1', [row.email]);
  if (existingUser.rows[0]) {
    const userId = existingUser.rows[0].id;
    await client.query(
      `UPDATE users SET
         "isVerified" = true,
         "isCorporate" = true,
         status = COALESCE(status, 'active'),
         "updatedAt" = NOW()
       WHERE id = $1`,
      [userId]
    );
    return { userId, created: false };
  }

  const password = randomPassword();
  const hashedPassword = await bcrypt.hash(password, 10);
  const inserted = await client.query(
    `INSERT INTO users (
       email, password, "firstName", "lastName", role, status,
       "isCorporate", "isAdmin", "isTeam", "isVerified",
       "dateOfBirth", "phoneNumber", gender,
       address_city, address_state, "address_zipCode",
       department_name, employee_id,
       metadata,
       "createdAt", "updatedAt"
     )
     VALUES (
       $1, $2, $3, $4, 'patient', 'active',
       true, false, false, true,
       $5, $6, $7,
       $8, $9, $10,
       $11, $12,
       '{"requirePasswordChange": true}'::jsonb,
       NOW(), NOW()
     )
     RETURNING id`,
    [
      row.email,
      hashedPassword,
      row.firstName || row.email.split('@')[0],
      row.lastName || '',
      row.dateOfBirth || '1990-01-01',
      row.phoneNumber || '',
      properGender(row.gender),
      row.city || null,
      row.state || null,
      row.pinCode || null,
      row.department || null,
      row.employeeId || null,
    ]
  );

  return { userId: inserted.rows[0].id, created: true };
}

async function upsertEmployee(client, corporate, row, matched) {
  const { userId, created } = await ensureUser(client, corporate, row, matched);
  const employeeId = row.employeeId || matched?.resolved_employee_id || row.email || `EMP-${crypto.randomUUID().slice(0, 8)}`;
  const metadata = {
    employeeId,
    department: row.department || null,
    designation: row.designation || null,
    location: row.location || null,
    facility: row.facility || null,
    source: 'sync-corporate-employees',
    sourceRow: row.rowNumber,
  };

  if (userId) {
    await client.query(
      `UPDATE users SET
         email = COALESCE(NULLIF($2, ''), email),
         "firstName" = COALESCE(NULLIF($3, ''), "firstName"),
         "lastName" = COALESCE(NULLIF($4, ''), "lastName"),
         "phoneNumber" = COALESCE(NULLIF($5, ''), "phoneNumber"),
         address_city = COALESCE(NULLIF($6, ''), address_city),
         address_state = COALESCE(NULLIF($7, ''), address_state),
         "address_zipCode" = COALESCE(NULLIF($8, ''), "address_zipCode"),
         department_name = COALESCE(NULLIF($9, ''), department_name),
         employee_id = COALESCE(NULLIF($10, ''), employee_id),
         "isCorporate" = true,
         "updatedAt" = NOW()
       WHERE id = $1`,
      [userId, row.email, row.firstName, row.lastName || '', row.phoneNumber, row.city, row.state, row.pinCode, row.department, employeeId]
    );

    await client.query(
      `INSERT INTO user_associations
         ("userId", "entityType", "entityId", corporate_unique_id, role, "isPrimary", status, metadata, "startDate", "createdAt", "updatedAt")
       VALUES
         ($1, 'corporate', $2, $3, 'employee', false, 'active', $4::jsonb, NOW(), NOW(), NOW())
       ON CONFLICT ("userId", "entityType", "entityId", role) WHERE "entityType" = 'corporate'
       DO UPDATE SET
         status = 'active',
         metadata = COALESCE(user_associations.metadata, '{}'::jsonb) || EXCLUDED.metadata,
         corporate_unique_id = EXCLUDED.corporate_unique_id,
         "updatedAt" = NOW()`,
      [userId, corporate.id, corporate.unique_id || null, JSON.stringify(metadata)]
    );
  }

  if (matched?.corporate_employee_row_id) {
    await client.query(
      `UPDATE corporate_employees SET
         "userId" = COALESCE($2, "userId"),
         "employeeId" = $3,
         department = COALESCE(NULLIF($4, ''), department),
         designation = COALESCE(NULLIF($5, ''), designation),
         "joiningDate" = COALESCE(NULLIF($6, '')::date, "joiningDate"),
         metadata = COALESCE(metadata, '{}'::jsonb) || $7::jsonb,
         "isActive" = true,
         "updatedAt" = NOW()
       WHERE id = $1`,
      [matched.corporate_employee_row_id, userId, employeeId, row.department, row.designation || '', row.joiningDate, JSON.stringify(metadata)]
    );
  } else {
    await client.query(
      `INSERT INTO corporate_employees
         (corporate_id, "userId", "employeeId", department, designation, "joiningDate", metadata, "isActive", "createdAt", "updatedAt")
       VALUES
         ($1, $2, $3, $4, $5, NULLIF($6, '')::date, $7::jsonb, true, NOW(), NOW())
       ON CONFLICT (corporate_id, "employeeId") DO UPDATE SET
         "userId" = COALESCE(EXCLUDED."userId", corporate_employees."userId"),
         department = COALESCE(EXCLUDED.department, corporate_employees.department),
         designation = COALESCE(NULLIF(EXCLUDED.designation, ''), corporate_employees.designation),
         "joiningDate" = COALESCE(EXCLUDED."joiningDate", corporate_employees."joiningDate"),
         metadata = COALESCE(corporate_employees.metadata, '{}'::jsonb) || EXCLUDED.metadata,
         "isActive" = true,
         "updatedAt" = NOW()`,
      [corporate.id, userId, employeeId, row.department || null, row.designation || '', row.joiningDate, JSON.stringify(metadata)]
    );
  }

  return { userId, employeeId, created };
}

function existingKeySet(row) {
  const keys = [];
  const employeeId = normalizeEmployeeId(row.resolved_employee_id);
  const email = normalizeEmail(row.resolved_email);
  if (employeeId) keys.push(`emp:${employeeId}`);
  if (email) keys.push(`email:${email}`);
  return keys;
}

async function deactivateMissing(client, corporateId, missing) {
  for (const row of missing) {
    if (row.user_id) {
      await client.query(
        `UPDATE user_associations
         SET status = 'inactive', "updatedAt" = NOW()
         WHERE "userId" = $1 AND "entityType" = 'corporate' AND "entityId" = $2 AND role = 'employee'`,
        [row.user_id, corporateId]
      );
    }
    if (row.corporate_employee_row_id) {
      await client.query(
        `UPDATE corporate_employees
         SET "isActive" = false, "updatedAt" = NOW()
         WHERE id = $1`,
        [row.corporate_employee_row_id]
      );
    }
  }
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    usage();
    return;
  }
  if (!args.file) {
    usage();
    throw new Error('--file is required');
  }

  const { employees, errors, absolutePath } = await loadEmployees(args.file);
  if (errors.length > 0) {
    console.error('Source validation failed:');
    for (const error of errors.slice(0, 30)) console.error(`  row ${error.row}: ${error.reason}`);
    if (errors.length > 30) console.error(`  ... ${errors.length - 30} more`);
    throw new Error('Fix source validation errors before syncing.');
  }

  const pool = new Pool(dbConfig());
  const client = await pool.connect();

  const stats = {
    source: employees.length,
    retainedOrUpdated: 0,
    added: 0,
    rosterOnlyAdded: 0,
    deactivated: 0,
  };

  try {
    await client.query('BEGIN');

    const corporate = await resolveCorporate(client, args.corporate);
    const before = await loadExisting(client, corporate.id);
    const inputKeys = new Set(employees.flatMap((employee) => employee.keys));

    const missing = before.all.filter((row) => {
      const currentlyActive = row.association_status === 'active' || row.corporate_employee_active === true;
      if (!currentlyActive) return false;
      const keys = existingKeySet(row);
      return keys.length > 0 && !keys.some((key) => inputKeys.has(key));
    });

    if (args.apply && Number.isFinite(args.limitRemovals) && missing.length > args.limitRemovals) {
      throw new Error(`Refusing apply: ${missing.length} employees would be deactivated, above --limit-removals ${args.limitRemovals}.`);
    }

    for (const employee of employees) {
      const matched = matchExisting(before, employee);
      const result = await upsertEmployee(client, corporate, employee, matched);
      if (matched) stats.retainedOrUpdated += 1;
      else if (result.userId) stats.added += 1;
      else stats.rosterOnlyAdded += 1;
    }

    await deactivateMissing(client, corporate.id, missing);
    stats.deactivated = missing.length;

    if (args.apply) {
      await client.query('COMMIT');
    } else {
      await client.query('ROLLBACK');
    }

    console.log(JSON.stringify({
      mode: args.apply ? 'applied' : 'dry-run',
      corporate: { id: corporate.id, companyName: corporate.companyName, uniqueId: corporate.unique_id },
      file: absolutePath,
      stats,
      note: args.apply ? 'Changes committed.' : DRY_RUN_NOTE,
    }, null, 2));
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(`sync-corporate-employees failed: ${error.message}`);
  process.exitCode = 1;
});
