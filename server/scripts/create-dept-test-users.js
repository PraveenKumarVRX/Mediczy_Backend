// Create or update department test users for login endpoint testing
// Usage: node server/scripts/create-dept-test-users.js

const bcrypt = require('bcryptjs');
const { Sequelize, DataTypes } = require('sequelize');

const sequelize = new Sequelize(process.env.DB_NAME || 'mediczy_ai', process.env.DB_USER || 'mediczy_helper', process.env.DB_PASS || (process.env.POSTGRES_PRIMARY_PASSWORD || process.env.POSTGRES_PASSWORD || process.env.DB_PASSWORD || process.env.DB_PASS || undefined), {
  host: process.env.DB_HOST || '127.0.0.1',
  dialect: 'postgres',
  logging: false,
});

const departments = [
  { key: 'asset',           table: 'asset_staff',           email: 'dept.test.asset@mediqzy.com' },
  { key: 'biomedical',      table: 'biomedical_staff',      email: 'dept.test.biomedical@mediqzy.com' },
  { key: 'blood-bank',      table: 'blood_bank_staff',      email: 'dept.test.bloodbank@mediqzy.com' },
  { key: 'consent',         table: 'consent_staff',         email: 'dept.test.consent@mediqzy.com' },
  { key: 'cssd',            table: 'cssd_staff',            email: 'dept.test.cssd@mediqzy.com' },
  { key: 'dietary',         table: 'dietary_staff',         email: 'dept.test.dietary@mediqzy.com' },
  { key: 'finance',         table: 'finance_staff',         email: 'dept.test.finance@mediqzy.com' },
  { key: 'infection-control', table: 'infection_control_staff', email: 'dept.test.infectioncontrol@mediqzy.com' },
  { key: 'mortuary',        table: 'mortuary_staff',        email: 'dept.test.mortuary@mediqzy.com' },
  { key: 'procurement',     table: 'procurement_staff',     email: 'dept.test.procurement@mediqzy.com' },
  { key: 'queue',           table: 'queue_staff',           email: 'dept.test.queue@mediqzy.com' },
];

const TEST_PASSWORD = 'DeptTest@123';

async function upsertDeptUser(table, email, password) {
  const hashed = await bcrypt.hash(password, 10);
  // Try update first
  const [result] = await sequelize.query(
    `UPDATE "${table}" SET password = :hashed WHERE lower(email) = :email RETURNING id`,
    { replacements: { hashed, email: email.toLowerCase() } }
  );
  if (result.length > 0) {
    console.log(`🔄 Updated password for ${email} in ${table}`);
    return;
  }
  // Insert if not exists
  await sequelize.query(
    `INSERT INTO "${table}" (email, password, "createdAt", "updatedAt") VALUES (:email, :hashed, NOW(), NOW()) ON CONFLICT (email) DO UPDATE SET password = EXCLUDED.password`,
    { replacements: { email: email.toLowerCase(), hashed } }
  );
  console.log(`✅ Created test user ${email} in ${table}`);
}

(async () => {
  try {
    await sequelize.authenticate();
    for (const dept of departments) {
      await upsertDeptUser(dept.table, dept.email, TEST_PASSWORD);
    }
    await sequelize.close();
    console.log('\nAll department test users are ready.');
  } catch (err) {
    console.error('❌ Error:', err);
    process.exit(1);
  }
})();
