// Create or update department test users for login endpoint testing
// Usage: node server/scripts/create-dept-test-users.cjs

const bcrypt = require('bcrypt');
const { Sequelize } = require('sequelize');

const sequelize = new Sequelize(process.env.DB_NAME || 'mediczy_ai', process.env.DB_USER || 'mediczy_helper', process.env.DB_PASS || (process.env.POSTGRES_PRIMARY_PASSWORD || process.env.POSTGRES_PASSWORD || process.env.DB_PASSWORD || process.env.DB_PASS || undefined), {
  host: process.env.DB_HOST || '127.0.0.1',
  dialect: 'postgres',
  logging: false,
});


// Map of department to table/email for test user creation
const deptRoles = [
  'asset',
  'biomedical',
  'blood_bank',
  'consent',
  'cssd',
  'dietary',
  'finance',
  'infection_control',
  'mortuary',
  'procurement',
  'queue',
];

const departments = [
  ...deptRoles.map(role => ({
    key: role,
    table: 'users',
    email: `dept.test.${role.replace('_', '')}@mediqzy.com`,
    role: `${role}_staff`,
  })),
  { key: 'doctors', table: 'doctors', email: 'dept.test.doctor@mediqzy.com' },
  { key: 'nurses', table: 'nurses', email: 'dept.test.nurse@mediqzy.com' },
  { key: 'labs', table: 'labs', email: 'dept.test.lab@mediqzy.com' },
  { key: 'pharmacies', table: 'pharmacies', email: 'dept.test.pharmacy@mediqzy.com' },
];

const TEST_PASSWORD = 'DeptTest@123';


async function upsertDeptUser(table, email, password, role) {
  const hashed = await bcrypt.hash(password, 10);
  let insertFields = ['email', 'password', '"createdAt"', '"updatedAt"'];
  let insertValues = [':email', ':hashed', 'NOW()', 'NOW()'];
  let updateSet = 'password = EXCLUDED.password';
  let replacements = { email: email.toLowerCase(), hashed };

  // Add required fields for each table
  if (table === 'users') {
    insertFields.unshift('"firstName"', '"lastName"', '"phoneNumber"');
    insertValues.unshift(`'Test'`, `'User'`, `'9999999999'`);
    if (role) {
      insertFields.push('role');
      insertValues.push(`'${role}'`);
    }
  } else if (table === 'doctors') {
    insertFields.unshift('"prefix"', '"firstName"', '"lastName"', '"phoneNumber"', '"specialization"');
    insertValues.unshift(`'Dr'`, `'Test'`, `'User'`, `'9999999999'`, `'General'`);
  } else if (table === 'nurses') {
    insertFields.unshift('"firstName"', '"lastName"', '"phoneNumber"');
    insertValues.unshift(`'Test'`, `'User'`, `'9999999999'`);
  } else if (table === 'labs') {
    insertFields.unshift('name', '"phoneNumber"');
    insertValues.unshift(`'Test Lab'`, `'9999999999'`);
  } else if (table === 'pharmacies') {
    insertFields.unshift('name', '"phoneNumber"', '"licenseNumber"');
    insertValues.unshift(`'Test Pharmacy'`, `'9999999999'`, `'LIC123456'`);
  }

  // Try update first
  let updateQuery = `UPDATE "${table}" SET password = :hashed WHERE lower(email) = :email`;
  // Only add RETURNING id for tables that have an id column
  const tablesWithId = ['users', 'doctors', 'nurses', 'labs', 'pharmacies'];
  if (tablesWithId.includes(table)) {
    updateQuery += ' RETURNING id';
  }
  const [result] = await sequelize.query(updateQuery, { replacements });
  if ((tablesWithId.includes(table) && result.length > 0) || (!tablesWithId.includes(table) && result.rowCount > 0)) {
    console.log(`🔄 Updated password for ${email} in ${table}`);
    return;
  }
  // Insert if not exists
  await sequelize.query(
    `INSERT INTO "${table}" (${insertFields.join(', ')}) VALUES (${insertValues.join(', ')}) ON CONFLICT (email) DO UPDATE SET ${updateSet}`,
    { replacements }
  );
  console.log(`✅ Created test user ${email} in ${table}`);
}

(async () => {
  try {
    await sequelize.authenticate();
    for (const dept of departments) {
      await upsertDeptUser(dept.table, dept.email, TEST_PASSWORD, dept.role);
    }
    await sequelize.close();
    console.log('\nAll department test users are ready.');
  } catch (err) {
    console.error('❌ Error:', err);
    process.exit(1);
  }
})();
