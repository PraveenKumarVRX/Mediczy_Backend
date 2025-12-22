import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import { TPA } from '../models/tpa.model.intelligent.js';

async function main() {
  const email = process.argv[2] || 'tpa@mediczy.com';
  const newPassword = process.argv[3] || 'SecurePass123';
  try {
    await sequelize.authenticate();
    console.log('✅ DB connected');
    const tpa = await TPA.findOne({ where: { email } });
    if (!tpa) {
      console.error('❌ No TPA found with email:', email);
      process.exit(1);
    }
    tpa.password = newPassword;
    await tpa.save(); // hooks will hash
    console.log('✅ Password reset for', email);
    const isValid = await tpa.comparePassword(newPassword);
    console.log('🔒 Verification compare valid:', isValid);
    process.exit(0);
  } catch (e) {
    console.error('❌ Error:', e.message);
    process.exit(1);
  }
}

main();
