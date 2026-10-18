import { postgresSequelize } from '../db/postgres-sequelize.js';
const [cols] = await postgresSequelize.query(
  `SELECT column_name, data_type FROM information_schema.columns
   WHERE table_name = 'appointments' AND table_schema = 'public'
   ORDER BY ordinal_position`
);
console.log(cols.map(c => c.column_name).join(', '));
process.exit(0);
