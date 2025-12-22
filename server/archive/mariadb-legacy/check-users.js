import { connectToDb } from './db/mariadb.js';
import User from './models/user.model.intelligent.js';
import Doctor from './models/doctor.model.intelligent.js';

async function getTestUsers() {
  try {
    await connectToDb();
    console.log('📋 EXISTING TEST USERS:');
    console.log('=======================');
    
    const users = await User.findAll({ 
      attributes: ['id', 'email', 'firstName', 'lastName', 'createdAt'],
      limit: 5 
    });
    
    console.log('👤 REGULAR USERS:');
    if (users.length === 0) {
      console.log('   No regular users found');
    } else {
      users.forEach(user => {
        console.log(`   Email: ${user.email}`);
        console.log(`   Name: ${user.firstName} ${user.lastName}`);
        console.log(`   ID: ${user.id}`);
        console.log('   Password: password123 (default for testing)');
        console.log('   ---');
      });
    }
    
    const doctors = await Doctor.findAll({ 
      attributes: ['id', 'email', 'firstName', 'lastName', 'specialization', 'createdAt'],
      limit: 5 
    });
    
    console.log('\n👨‍⚕️ DOCTOR USERS:');
    if (doctors.length === 0) {
      console.log('   No doctor users found');
    } else {
      doctors.forEach(doctor => {
        console.log(`   Email: ${doctor.email}`);
        console.log(`   Name: Dr. ${doctor.firstName} ${doctor.lastName}`);
        console.log(`   Specialization: ${doctor.specialization}`);
        console.log(`   ID: ${doctor.id}`);
        console.log('   Password: password123 (default for testing)');
        console.log('   ---');
      });
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

getTestUsers();