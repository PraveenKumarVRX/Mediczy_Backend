import { postgresSequelize } from '../db/postgres-sequelize.js';
// Check what the user record looks like for users linked to corporate 3
const [rows] = await postgresSequelize.query(
  `SELECT u.id, u.email, u.organization_id, u.organization_type, u.tenant_id
   FROM users u
   JOIN user_associations ua ON ua."userId" = u.id
   WHERE ua."entityId" = 3 AND ua."entityType" = 'corporate'
   LIMIT 5`
);
console.log(JSON.stringify(rows));
process.exit(0);
