#!/usr/bin/env node
/**
 * Create care@mysmarthealth.in team user account
 * This script creates a user account for the care team
 */

import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import bcrypt from 'bcrypt';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverDir = '/home/ubuntu/Mediczy/server';

// Load environment
dotenv.config({ path: path.join(serverDir, '.env') });

// Now import models
import { sequelize, User } from (await import(path.join(serverDir, 'models/index.js'))).default || (await import(path.join(serverDir, 'models/index.js')));

async function createCareUser() {
  try {
    console.log('📧 Creating care team user account...\n');

    // Check if user already exists
    let user = await User.findOne({ where: { email: 'care@mysmarthealth.in' } });

    if (user) {
      console.log('✅ User already exists:');
      console.log(`   ID: ${user.id}`);
      console.log(`   Email: ${user.email}`);
      console.log(`   Role: ${user.userRole}`);
      return user;
    }

    // Hash password
    const hashedPassword = await bcrypt.hash('Mayden@2025', 10);

    // Create user
    user = await User.create({
      email: 'care@mysmarthealth.in',
      password: hashedPassword,
      firstName: 'Care',
      lastName: 'Team',
      userRole: 'team',
      status: 'active',
      emailVerified: true,
      phoneVerified: false,
      isTeamMember: true
    });

    console.log('✅ Care team user created successfully!\n');
    console.log('📋 User Details:');
    console.log(`   ID: ${user.id}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Name: ${user.firstName} ${user.lastName}`);
    console.log(`   Role: ${user.userRole}`);
    console.log(`   Status: ${user.status}`);
    console.log(`   Password: Mayden@2025\n`);

    return user;
  } catch (error) {
    console.error('❌ Error creating user:', error.message);
    throw error;
  }
}

try {
  await createCareUser();
  process.exit(0);
} catch (error) {
  console.error('Failed:', error);
  process.exit(1);
}
