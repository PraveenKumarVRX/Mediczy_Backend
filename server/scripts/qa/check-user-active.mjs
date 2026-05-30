#!/usr/bin/env node

import postgresSequelize from '../../db/postgres-sequelize.js';

const emailArg = process.argv.find((arg) => typeof arg === 'string' && arg.includes('@'));
const email = (emailArg || 'user@mediczy.com').trim();

async function main() {
  const rows = await postgresSequelize.query(
    `SELECT to_jsonb(u) AS user_row
     FROM users u
     WHERE lower(email) = lower(:email)
     LIMIT 1`,
    {
      replacements: { email },
      type: postgresSequelize.QueryTypes.SELECT,
    }
  );

  const user = rows[0]?.user_row || null;
  if (!user) {
    console.log(JSON.stringify({ exists: false, email }, null, 2));
    await postgresSequelize.close();
    return;
  }

  const status = user.status ?? null;
  const isActiveField = user.isActive ?? user.isactive ?? user.is_active ?? null;
  const active = status === 'active' && isActiveField !== false;
  console.log(JSON.stringify({ exists: true, active, user }, null, 2));
  await postgresSequelize.close();
}

main().catch(async (error) => {
  console.error('check-user-active failed:', error.message);
  try { await postgresSequelize.close(); } catch {}
  process.exit(1);
});
