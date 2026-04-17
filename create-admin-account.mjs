#!/usr/bin/env node
/**
 * Create admin account: admin@mediczy.com
 */

import bcrypt from 'bcrypt';
import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'mediczy_ai',
  user: 'mediczy_helper',
  password: 'Mediczy2024Helper'
});

async function createAdminAccount() {
  const client = await pool.connect();
  
  try {
    console.log('🔐 Creating admin account...\n');
    
    const email = 'admin@mediczy.com';
    const password = 'SecureAdmin2024';
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Check if admin exists
    const checkResult = await client.query(
      'SELECT id, email FROM users WHERE email = $1',
      [email]
    );
    
    if (checkResult.rows.length > 0) {
      console.log('⚠️  Admin already exists. Updating password...\n');
      
      await client.query(
        `UPDATE users 
         SET password = $1, 
             role = 'admin',
             status = 'active',
             "isVerified" = true,
             metadata = jsonb_set(
               COALESCE(metadata, '{}'::jsonb),
               '{isAdmin}',
               'true'
             )
         WHERE email = $2`,
        [hashedPassword, email]
      );
      
      console.log('✅ Admin password updated successfully!\n');
    } else {
      console.log('📝 Creating new admin account...\n');
      
      await client.query(
        `INSERT INTO users (
          email, password, "firstName", "lastName", 
          "dateOfBirth", gender, "phoneNumber",
          role, status, "isVerified",
          metadata, "createdAt", "updatedAt"
        ) VALUES (
          $1, $2, 'Admin', 'User',
          '1990-01-01', 'Male', '+919999999999',
          'admin', 'active', true,
          '{"isAdmin": true, "permissions": ["all"]}'::jsonb,
          NOW(), NOW()
        )`,
        [email, hashedPassword]
      );
      
      console.log('✅ Admin account created successfully!\n');
    }
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📋 Admin Credentials:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`   Email:    ${email}`);
    console.log(`   Password: ${password}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('\n🌐 Login at: https://app.mediqzy.com/admin/login\n');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

createAdminAccount();
