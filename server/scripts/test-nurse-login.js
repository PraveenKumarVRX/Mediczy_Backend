import dotenv from 'dotenv';
import { connectToDb } from '../db/mariadb.js';
import Nurse from '../models/nurse.model.mariadb.js';

dotenv.config();

async function testLogin() {
  try {
    console.log('🔍 Testing nurse login...\n');
    
    await connectToDb();
    
    const email = 'nurse@test.com';
    const password = 'nurse123';
    
    console.log('1. Looking up nurse:', email);
    const nurse = await Nurse.findOne({ where: { email } });
    
    if (!nurse) {
      console.log('❌ Nurse not found in database');
      process.exit(1);
    }
    
    console.log('✅ Nurse found:', {
      id: nurse.id,
      firstName: nurse.firstName,
      lastName: nurse.lastName,
      email: nurse.email
    });
    
    console.log('\n2. Testing password comparison...');
    const isValid = await nurse.comparePassword(password);
    
    if (!isValid) {
      console.log('❌ Password comparison failed');
      console.log('   Expected: nurse123');
      console.log('   Hash in DB:', nurse.password.substring(0, 20) + '...');
      process.exit(1);
    }
    
    console.log('✅ Password is valid');
    
    console.log('\n3. Generating auth token...');
    const token = nurse.generateAuthToken();
    console.log('✅ Token generated:', token.substring(0, 30) + '...');
    
    console.log('\n✅ All tests passed! Login should work.\n');
    process.exit(0);
  } catch (err) {
    console.error('❌ Test failed:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

testLogin();
