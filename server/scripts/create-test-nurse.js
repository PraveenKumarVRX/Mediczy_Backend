import dotenv from 'dotenv';
import { connectToDb } from '../db/mariadb.js';
import Nurse from '../models/nurse.model.mariadb.js';

dotenv.config();

async function run() {
  try {
    await connectToDb();
    
    // Delete existing test nurses
    await Nurse.destroy({ where: {} });
    
    // Create the nurse with the exact email from the test credentials
    const nurse = await Nurse.create({
      firstName: 'Sarah',
      lastName: 'Johnson',
      email: 'nurse@mediczy.com',
      password: 'nurse123',
      phoneNumber: '+1-555-0101',
      licenseNumber: 'RN-123456',
      department: 'Emergency Department'
    });
    
    console.log('✅ Test nurse created successfully:');
    console.log('   Email: nurse@mediczy.com');
    console.log('   Password: nurse123');
    console.log('   ID:', nurse.id);
    console.log('   Department:', nurse.department);
    
    // Test password verification
    const isPasswordValid = await nurse.comparePassword('nurse123');
    console.log('   Password verification:', isPasswordValid ? '✅ Valid' : '❌ Invalid');
    
    process.exit(0);
  } catch (err) {
    console.error('❌ Failed to create test nurse:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

run();