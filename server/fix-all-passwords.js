import { connectToDb } from './db/mariadb.js';
import User from './models/user.model.intelligent.js';
import Doctor from './models/doctor.model.intelligent.js';

async function fixAllPasswords() {
  try {
    await connectToDb();
    console.log('🔧 FIXING ALL TEST USER PASSWORDS');
    console.log('==================================');
    
    const testPassword = 'password123';
    
    // Fix regular users
    const users = await User.findAll();
    console.log(`\n👤 Updating ${users.length} regular users...`);
    
    for (const user of users) {
      await user.update({ password: testPassword });
      console.log(`✅ Updated password for: ${user.email}`);
    }
    
    // Fix doctor users  
    const doctors = await Doctor.findAll();
    console.log(`\n👨‍⚕️ Updating ${doctors.length} doctor users...`);
    
    for (const doctor of doctors) {
      await doctor.update({ password: testPassword });
      console.log(`✅ Updated password for: ${doctor.email}`);
    }
    
    console.log('\n🎉 All passwords updated successfully!');
    console.log('📝 All users now use password: password123');
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

fixAllPasswords();