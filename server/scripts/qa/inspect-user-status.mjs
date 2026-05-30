#!/usr/bin/env node

import postgresSequelize from '../../db/postgres-sequelize.js';

const email = process.argv[2] || 'user@mediczy.com';

async function main() {
  const rows = await postgresSequelize.query(
    `SELECT *
     FROM users
     WHERE lower(email) = lower(:email)
     LIMIT 1`,
    {
      replacements: { email },
      type: postgresSequelize.QueryTypes.SELECT,
    }
  );

  console.log(JSON.stringify(rows[0] || null, null, 2));
  await postgresSequelize.close();
}

main().catch(async (error) => {
  console.error('inspect-user-status failed:', error.message);
  try { await postgresSequelize.close(); } catch {}
  process.exit(1);
});
