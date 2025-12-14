import dotenv from 'dotenv';
import { connectToDb } from '../db/mariadb.js';
import Nurse from '../models/nurse.model.mariadb.js';

dotenv.config();

async function run() {
  try {
    await connectToDb();
    const [nurse, created] = await Nurse.findOrCreate({
      where: { email: 'nurse@test.com' },
      defaults: {
        firstName: 'Nora',
        lastName: 'Care',
        email: 'nurse@test.com',
        password: 'nurse123',
        phoneNumber: '555-0101',
        licenseNumber: 'RN-12345',
        department: 'Emergency'
      }
    });
    console.log(created ? '✅ Seeded nurse@test.com' : 'ℹ️ Nurse already exists');
    console.log('Login email: nurse@test.com');
    console.log('Login password: nurse123');
    process.exit(0);
  } catch (err) {
    console.error('Seed failed:', err.message);
    process.exit(1);
  }
}

run();
