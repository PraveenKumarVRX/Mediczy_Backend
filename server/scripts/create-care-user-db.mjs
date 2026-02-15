#!/usr/bin/env node

// Direct database approach - create care user
import pg from 'pg';
import bcrypt from 'bcryptjs';

const { Client } = pg;

async function createCareUser() {
  const client = new Client({
    user: process.env.POSTGRES_USER || 'mediczy_helper',
    password: process.env.POSTGRES_PASSWORD || 'Mediczy2024Helper',
    host: process.env.POSTGRES_HOST || '127.0.0.1',
    port: process.env.POSTGRES_PORT || 5432,
    database: process.env.POSTGRES_DATABASE || 'mediczy_ai'
  });

  try {
    await client.connect();
    console.log('✅ Connected to database\n');

    // Check if user exists
    const existing = await client.query(
      'SELECT id, email FROM users WHERE email = $1 LIMIT 1',
      ['care@mysmarthealth.in']
    );

    if (existing.rows.length > 0) {
      console.log('👤 Care user already exists:');
      console.log(`   ID: ${existing.rows[0].id}`);
      console.log(`   Email: ${existing.rows[0].email}`);
      await client.end();
      return;
    }

    // Hash password
    const hashedPassword = await bcrypt.hash('Mayden@2025', 10);

    // Create user
    const result = await client.query(
      `INSERT INTO users (
        email, password, "firstName", "lastName", "dateOfBirth", gender, "phoneNumber", role, status, 
        "emailVerified", "phoneVerified", "isTeam", "createdAt", "updatedAt"
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW())
      RETURNING id, email, role, status, "isTeam"`,
      ['care@mysmarthealth.in', hashedPassword, 'Care', 'Team', '1990-01-01', 'Other', '+919999999999', 'team', 'active', true, false, true]
    );

    console.log('✅ Care team user created successfully!\n');
    console.log('📋 User Details:');
    console.log(`   ID: ${result.rows[0].id}`);
    console.log(`   Email: ${result.rows[0].email}`);
    console.log(`   Role: ${result.rows[0].role}`);
    console.log(`   Status: ${result.rows[0].status}`);
    console.log(`   Is Team: ${result.rows[0].isTeam}`);
    console.log(`\n🔐 Credentials:`);
    console.log(`   Email: care@mysmarthealth.in`);
    console.log(`   Password: Mayden@2025\n`);

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await client.end();
  }
}

// Load env from server directory
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join('/home/ubuntu/Mediczy/server', '.env') });

createCareUser().catch(console.error);
