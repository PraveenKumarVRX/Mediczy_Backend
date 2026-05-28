#!/usr/bin/env node

import { connectToPostgresDB } from '../../db/postgres-sequelize.js';

async function main() {
  const sequelize = await connectToPostgresDB();
  const cfg = sequelize?.config || {};
  console.log(JSON.stringify({
    host: cfg.host || null,
    port: cfg.port || null,
    database: cfg.database || null,
    dialect: cfg.dialect || 'postgres',
    isRdsHost: typeof cfg.host === 'string' && cfg.host.includes('rds.amazonaws.com')
  }, null, 2));
  await sequelize.close();
}

main().catch((error) => {
  console.error('print-db-target failed:', error.message);
  process.exit(1);
});
