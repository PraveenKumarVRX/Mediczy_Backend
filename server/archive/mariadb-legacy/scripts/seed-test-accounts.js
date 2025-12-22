import dotenv from 'dotenv';
import bcrypt from 'bcrypt';
import { connectToDb } from '../db/mariadb.js';

dotenv.config();

async function seedTestAccounts() {
  try {
    console.log('🌱 Seeding test accounts with known passwords...\n');
    
    await connectToDb();
    const { sequelize } = await import('../db/mariadb.js');
    
    // Hash passwords
    const userPass = await bcrypt.hash('user123', 10);
    const doctorPass = await bcrypt.hash('doctor123', 10);
    const assistantPass = await bcrypt.hash('assistant123', 10);
    const nursePass = await bcrypt.hash('nurse123', 10);
    
    // Update User
    await sequelize.query(`
      UPDATE users 
      SET password = :password 
      WHERE email = 'test@example.com'
    `, {
      replacements: { password: userPass }
    });
    console.log('✅ Updated user: test@example.com / user123');
    
    // Update Doctor
    await sequelize.query(`
      UPDATE doctors 
      SET password = :password 
      WHERE email = 'testdoctor@example.com'
    `, {
      replacements: { password: doctorPass }
    });
    console.log('✅ Updated doctor: testdoctor@example.com / doctor123');
    
    // Update Assistant
    await sequelize.query(`
      UPDATE assistants 
      SET password = :password 
      WHERE email = 'assistant@test.com'
    `, {
      replacements: { password: assistantPass }
    });
    console.log('✅ Updated assistant: assistant@test.com / assistant123');
    
    // Verify Nurse (should already be correct)
    await sequelize.query(`
      UPDATE nurses 
      SET password = :password 
      WHERE email = 'nurse@test.com'
    `, {
      replacements: { password: nursePass }
    });
    console.log('✅ Updated nurse: nurse@test.com / nurse123');
    
    console.log('\n✅ All test accounts updated successfully!\n');
    console.log('Test Credentials:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('👤 User:      test@example.com / user123');
    console.log('👨‍⚕️ Doctor:    testdoctor@example.com / doctor123');
    console.log('👔 Assistant: assistant@test.com / assistant123');
    console.log('🩺 Nurse:     nurse@test.com / nurse123');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    process.exit(0);
  } catch (err) {
    console.error('❌ Error seeding accounts:', err.message);
    process.exit(1);
  }
}

seedTestAccounts();
