import pg from 'pg';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { Pool } = pg;

// Test the POST /admin/corporate-employees logic directly against the DB
const pool = new Pool({ host:'127.0.0.1', user:'mediczy_helper', password:'Mediczy2024Helper', database:'mediczy_ai' });

const CORP_ID = 49;

// Get the corporates record to simulate req.resolvedCorporate
const [corp] = await pool.query(
  `SELECT id, unique_id AS "uniqueId", "companyName", status FROM corporates WHERE id = $1`,
  [CORP_ID]
).then(r => r.rows);

if (!corp) { console.error('Corporate 49 not found!'); process.exit(1); }
console.log('Corporate:', JSON.stringify(corp));

// Simulate inserting one test employee
const testEmail = 'test.employee.probe@ninjacart.com';

try {
  await pool.query('BEGIN');

  // Step 1: check if user exists
  const { rows: existing } = await pool.query(
    `SELECT id FROM users WHERE email = $1`, [testEmail]
  );

  let userId;
  if (existing.length > 0) {
    userId = existing[0].id;
    console.log(`User exists: id=${userId}`);
  } else {
    const { rows: inserted } = await pool.query(`
      INSERT INTO users (
        email, password, "firstName", "lastName", role,
        "isCorporate", "isAdmin", "isTeam",
        "dateOfBirth", "phoneNumber", gender,
        "createdAt", "updatedAt"
      ) VALUES (
        $1, '$2b$10$testhashedpassword12345', 'Test', 'Employee', 'patient',
        true, false, false,
        '1990-01-01', '', 'Male',
        NOW(), NOW()
      ) RETURNING id
    `, [testEmail]);
    userId = inserted[0].id;
    console.log(`New user created: id=${userId}`);
  }

  // Step 2: Insert user_association
  await pool.query(`
    INSERT INTO user_associations 
      ("userId", "entityType", "entityId", corporate_unique_id, role, "isPrimary", status, metadata, "startDate", "createdAt", "updatedAt")
    VALUES 
      ($1, 'corporate', $2, $3, 'employee', false, 'active', $4, NOW(), NOW(), NOW())
    ON CONFLICT ("userId", "entityType", "entityId", role) WHERE "entityType" = 'corporate' DO UPDATE SET
      metadata = EXCLUDED.metadata,
      corporate_unique_id = EXCLUDED.corporate_unique_id,
      "updatedAt" = NOW()
  `, [userId, CORP_ID, corp.uniqueId, JSON.stringify({ employeeId: 'TEST001', department: 'Engineering' })]);

  console.log('✅ Association inserted successfully');

  // Rollback - this was just a test
  await pool.query('ROLLBACK');
  console.log('Test rolled back (no actual data inserted)');
} catch (err) {
  await pool.query('ROLLBACK');
  console.error('❌ Error:', err.message);
  console.error('Detail:', err.detail);
  console.error('Code:', err.code);
}

await pool.end();
