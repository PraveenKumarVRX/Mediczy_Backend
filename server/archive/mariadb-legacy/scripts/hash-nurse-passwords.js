import dotenv from 'dotenv';
import bcrypt from 'bcrypt';
import { sequelize } from '../db/mariadb.js';
import nurseModel from '../models/nurse.model.intelligent.js';

dotenv.config();

const SALT_ROUNDS = 10;

function isBcryptHash(value) {
  return typeof value === 'string' && value.startsWith('$2');
}

async function main() {
  console.log('🔐 Hashing nurse passwords if needed...');

  const nurses = await nurseModel.findAll();
  let scanned = 0;
  let updated = 0;

  for (const nurse of nurses) {
    scanned += 1;
    const currentPassword = nurse.password;

    if (!currentPassword) continue;
    if (isBcryptHash(currentPassword)) continue;

    const hashed = await bcrypt.hash(currentPassword, SALT_ROUNDS);
    await nurse.update({ password: hashed });
    updated += 1;
  }

  console.log(`✅ Done. Scanned: ${scanned}, updated: ${updated}`);
}

main()
  .catch((err) => {
    console.error('❌ Failed to hash nurse passwords:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await sequelize.close();
    } catch {
      // ignore
    }
  });
