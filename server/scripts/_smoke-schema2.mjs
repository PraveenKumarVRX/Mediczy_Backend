import { postgresSequelize } from '../db/postgres-sequelize.js';
// Bypass RLS with platform admin flag
const [rows] = await postgresSequelize.transaction(async (tx) => {
  await postgresSequelize.query("SELECT set_config('app.is_platform_admin', 'true', true)", { transaction: tx });
  return postgresSequelize.query(
    `SELECT a.id, a."patientId", a."doctorName", a.status, a."appointmentDate"::text AS date
     FROM appointments a
     WHERE a.corporate_tenant_id = 3
     LIMIT 5`,
    { transaction: tx }
  );
});
console.log('appointments with_corp_3:', JSON.stringify(rows));
process.exit(0);
