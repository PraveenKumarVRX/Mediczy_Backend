import dotenv from 'dotenv';
import bcrypt from 'bcrypt';
import { connectToDb } from '../db/mariadb.js';

dotenv.config();

async function seedCorporateUsers() {
  try {
    console.log('🌱 Seeding corporate test users...\n');
    
    await connectToDb();
    const { sequelize } = await import('../db/mariadb.js');
    
    // Hash password
    const corporatePass = await bcrypt.hash('Corporate123!', 10);
    
    // Get the TCS corporate ID
    const [[corporate]] = await sequelize.query(`
      SELECT id FROM corporates WHERE email = 'hr@tcs.com' LIMIT 1
    `);
    
    const corporateId = corporate ? corporate.id : 1;
    
    // Create/Update Corporate User 1: Vijay Malhotra
    const [vijayExists] = await sequelize.query(`
      SELECT id FROM users WHERE email = 'vijay.hr@techcorp.com'
    `);
    
    if (vijayExists.length === 0) {
      await sequelize.query(`
        INSERT INTO users (
          firstName, lastName, email, password, 
          dateOfBirth, gender, phoneNumber,
          address_city, address_state, address_country,
          isActive, isOnline, createdAt, updatedAt
        ) VALUES (
          'Vijay', 'Malhotra', 'vijay.hr@techcorp.com', :password,
          '1985-05-15', 'Male', '+91-9876543210',
          'Mumbai', 'Maharashtra', 'India',
          1, 0, NOW(), NOW()
        )
      `, {
        replacements: { password: corporatePass }
      });
      console.log('✅ Created corporate user: vijay.hr@techcorp.com / Corporate123!');
    } else {
      await sequelize.query(`
        UPDATE users 
        SET password = :password, isActive = 1
        WHERE email = 'vijay.hr@techcorp.com'
      `, {
        replacements: { password: corporatePass }
      });
      console.log('✅ Updated corporate user: vijay.hr@techcorp.com / Corporate123!');
    }
    
    // Create/Update Corporate User 2: Sunita Iyer
    const [sunitaExists] = await sequelize.query(`
      SELECT id FROM users WHERE email = 'sunita.hr@healthplus.com'
    `);
    
    if (sunitaExists.length === 0) {
      await sequelize.query(`
        INSERT INTO users (
          firstName, lastName, email, password,
          dateOfBirth, gender, phoneNumber,
          address_city, address_state, address_country,
          isActive, isOnline, createdAt, updatedAt
        ) VALUES (
          'Sunita', 'Iyer', 'sunita.hr@healthplus.com', :password,
          '1988-08-22', 'Female', '+91-9823456789',
          'Bangalore', 'Karnataka', 'India',
          1, 0, NOW(), NOW()
        )
      `, {
        replacements: { password: corporatePass }
      });
      console.log('✅ Created corporate user: sunita.hr@healthplus.com / Corporate123!');
    } else {
      await sequelize.query(`
        UPDATE users 
        SET password = :password, isActive = 1
        WHERE email = 'sunita.hr@healthplus.com'
      `, {
        replacements: { password: corporatePass }
      });
      console.log('✅ Updated corporate user: sunita.hr@healthplus.com / Corporate123!');
    }
    
    console.log('\n✅ Corporate test users seeded successfully!\n');
    console.log('Corporate Test Credentials:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🏢 Corporate HR 1: vijay.hr@techcorp.com / Corporate123!');
    console.log('🏢 Corporate HR 2: sunita.hr@healthplus.com / Corporate123!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('⚠️  NOTE: Corporate login expects users with role="corporate"');
    console.log('   The current users table does NOT have a role column.');
    console.log('   You need to either:');
    console.log('   1. Add a role column to users table');
    console.log('   2. Update corporate login logic to not check role');
    console.log('   3. Use intelligent-db users table instead\n');
    
    process.exit(0);
  } catch (err) {
    console.error('❌ Error seeding corporate users:', err.message);
    console.error(err);
    process.exit(1);
  }
}

seedCorporateUsers();
