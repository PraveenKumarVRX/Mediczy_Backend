import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ host:'127.0.0.1', user:'mediczy_helper', password:'Mediczy2024Helper', database:'mediczy_ai' });

const [corp, assoc49, serverLogs] = await Promise.all([
  pool.query(`SELECT id, "companyName", unique_id, status FROM corporates WHERE lower("companyName") LIKE '%ninjacart%'`),
  pool.query(`SELECT ua."userId", ua."entityId", ua.role, ua.status, u.email 
              FROM user_associations ua JOIN users u ON u.id = ua."userId" 
              WHERE ua."entityType" = 'corporate' AND ua."entityId" = 49`),
  pool.query(`SELECT ua."userId", ua."entityId", ua.role, ua.status, u.email, u.role as user_role
              FROM user_associations ua JOIN users u ON u.id = ua."userId" 
              WHERE ua."entityType" = 'corporate' AND ua."entityId" IN (48,49)
              ORDER BY ua."entityId"`)
]);

console.log('Corporate (new):', JSON.stringify(corp.rows, null, 2));
console.log('Associations (id=49):', JSON.stringify(assoc49.rows, null, 2));
console.log('All assocs for 48/49:', JSON.stringify(serverLogs.rows, null, 2));

// Also check if there's a PM2 server error log we can look at
await pool.end();
