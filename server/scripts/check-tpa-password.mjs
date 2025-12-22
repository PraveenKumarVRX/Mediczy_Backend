import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import { TPA } from '../models/tpa.model.intelligent.js';

async function main() {
  const email = process.argv[2] || 'tpa@mediczy.com';
  const testPassword = process.argv[3] || 'Heritage@TPA123';
  try {
    await sequelize.authenticate();
    const tpa = await TPA.findOne({ where: { email } });
    console.log('Found TPA:', !!tpa, tpa?.email);
    if (!tpa) process.exit(2);
    const valid = await tpa.comparePassword(testPassword);
    console.log('Password valid:', valid);
    process.exit(valid ? 0 : 1);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}

main();
