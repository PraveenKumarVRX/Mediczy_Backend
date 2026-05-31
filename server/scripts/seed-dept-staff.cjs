/**
 * Seed script: create one test staff account per hospital department.
 * Creates a "Mediczy Test Hospital" tenant entry (if not present) then
 * creates one user per department role in the `users` table.
 *
 * Run from /home/ubuntu/Mediczy/server:
 *   node scripts/seed-dept-staff.cjs
 */

const bcrypt = require('bcrypt');
const { Sequelize } = require('sequelize');

const DB_NAME = process.env.DB_NAME || 'mediczy_ai';
const DB_USER = process.env.DB_USER || 'mediczy_helper';
const DB_PASS = process.env.DB_PASS || (process.env.POSTGRES_PRIMARY_PASSWORD || process.env.POSTGRES_PASSWORD || process.env.DB_PASSWORD || process.env.DB_PASS || undefined);
const DB_HOST = process.env.DB_HOST || '127.0.0.1';
const DB_PORT = parseInt(process.env.DB_PORT || '5432', 10);

const sequelize = new Sequelize(DB_NAME, DB_USER, DB_PASS, {
  host: DB_HOST,
  port: DB_PORT,
  dialect: 'postgres',
  logging: false,
});

const HOSPITAL_SLUG = 'mediczy-test-hospital';
const HOSPITAL_NAME = 'Mediczy Test Hospital';

const DEPT_ACCOUNTS = [
  { email: 'accounts@mediczy.com',       password: 'Accounts@123',  role: 'accounts_staff',       firstName: 'Accounts',  lastName: 'Staff',  dept: 'Finance & Accounts' },
  { email: 'mrd@mediczy.com',            password: 'MRD@123456',    role: 'mrd_staff',            firstName: 'MRD',       lastName: 'Staff',  dept: 'Medical Records' },
  { email: 'insurance.desk@mediczy.com', password: 'Insurance@123', role: 'insurance_desk_staff', firstName: 'Insurance', lastName: 'Desk',   dept: 'Insurance Desk' },
  { email: 'hr@mediczy.com',             password: 'HR@123456',     role: 'hr_staff',             firstName: 'HR',        lastName: 'Staff',  dept: 'Human Resources' },
  { email: 'it.edp@mediczy.com',         password: 'ITEDP@123',     role: 'it_edp_staff',         firstName: 'IT',        lastName: 'EDP',    dept: 'IT & EDP' },
  { email: 'ot@mediczy.com',             password: 'OT@123456',     role: 'ot_staff',             firstName: 'OT',        lastName: 'Staff',  dept: 'Operation Theatre' },
  { email: 'icu@mediczy.com',            password: 'ICU@123456',    role: 'icu_staff',            firstName: 'ICU',       lastName: 'Staff',  dept: 'Intensive Care Unit' },
  { email: 'quality@mediczy.com',        password: 'Quality@123',   role: 'quality_staff',        firstName: 'Quality',   lastName: 'NABH',   dept: 'Quality & NABH' },
  { email: 'security@mediczy.com',       password: 'Security@123',  role: 'security_staff',       firstName: 'Security',  lastName: 'Staff',  dept: 'Security' },
];

async function ensureHospitalTenant(seq) {
  const [existing] = await seq.query(
    `SELECT id FROM tenants WHERE slug = :slug LIMIT 1`,
    { replacements: { slug: HOSPITAL_SLUG }, type: Sequelize.QueryTypes.SELECT }
  );
  if (existing) {
    console.log(`ℹ  Hospital tenant already exists, id=${existing.id}`);
    return existing.id;
  }

  const [[inserted]] = await seq.query(
    `INSERT INTO tenants (name, slug, subdomain, type, email, phone, status, "createdAt", "updatedAt")
     VALUES (:name, :slug, :subdomain, 'hospital', :email, :phone, 'active', NOW(), NOW())
     RETURNING id`,
    {
      replacements: { name: HOSPITAL_NAME, slug: HOSPITAL_SLUG, subdomain: HOSPITAL_SLUG, email: 'hospital@mediczy.com', phone: '+91-0000000000' },
      type: Sequelize.QueryTypes.INSERT,
    }
  );
  console.log(`✅ Created hospital tenant, id=${inserted.id}`);
  return inserted.id;
}

async function run() {
  try {
    await sequelize.authenticate();
    console.log('✅ DB connected');

    const hospitalId = await ensureHospitalTenant(sequelize);
    const SALT_ROUNDS = 12;

    for (const acc of DEPT_ACCOUNTS) {
      const [existing] = await sequelize.query(
        `SELECT id FROM users WHERE email = :email AND role = :role LIMIT 1`,
        { replacements: { email: acc.email, role: acc.role }, type: Sequelize.QueryTypes.SELECT }
      );

      if (existing) {
        console.log(`⏭  Skipping (already exists): ${acc.email} [${acc.role}]`);
        continue;
      }

      const passwordHash = await bcrypt.hash(acc.password, SALT_ROUNDS);

      await sequelize.query(
        `INSERT INTO users
           (email, password, "firstName", "lastName", role, organization_id,
            "dateOfBirth", gender, "phoneNumber",
            status, scope, permissions, metadata, "createdAt", "updatedAt")
         VALUES
           (:email, :password, :firstName, :lastName, :role, :orgId,
            '1990-01-01', 'Other', '0000000000',
            'active', :scope::jsonb, :permissions::jsonb, :metadata::jsonb, NOW(), NOW())`,
        {
          replacements: {
            email:       acc.email,
            password:    passwordHash,
            firstName:   acc.firstName,
            lastName:    acc.lastName,
            role:        acc.role,
            orgId:       hospitalId,
            scope:       JSON.stringify({ organization: true }),
            permissions: JSON.stringify({ read: true, write: true }),
            metadata:    JSON.stringify({ department: acc.dept, created_via: 'seed_script' }),
          },
          type: Sequelize.QueryTypes.INSERT,
        }
      );

      console.log(`✅ Created: ${acc.email}  password: ${acc.password}  role: ${acc.role}`);
    }

    console.log('\n🎉 Seeding complete.\n');
    console.log('Credentials summary:');
    console.log('─────────────────────────────────────────────────────────────────────────────────────');
    for (const acc of DEPT_ACCOUNTS) {
      console.log(`  ${acc.role.padEnd(24)}  ${acc.email.padEnd(35)}  ${acc.password}`);
    }
    console.log('─────────────────────────────────────────────────────────────────────────────────────');
  } catch (err) {
    console.error('❌ Seeding failed:', err.message);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

run();
