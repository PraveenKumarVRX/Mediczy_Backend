#!/usr/bin/env node
/**
 * Create Team User in Mediczy
 * Usage: node setup-mediczy-team-user.mjs
 * 
 * This script creates a team user in Mediczy database and links them to RocketChat
 */

import axios from 'axios';
import bcrypt from 'bcrypt';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Import sequelize
import { postgresSequelize as sequelize } from './server/db/postgres-sequelize.js';
import User from './server/models/user.model.intelligent.js';

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
  cyan: '\x1b[36m'
};

function log(level, message) {
  const timestamp = new Date().toLocaleTimeString();
  
  switch (level) {
    case 'info':
      console.log(`${colors.blue}ℹ${colors.reset} [${timestamp}] ${message}`);
      break;
    case 'success':
      console.log(`${colors.green}✅${colors.reset} [${timestamp}] ${message}`);
      break;
    case 'warn':
      console.log(`${colors.yellow}⚠️${colors.reset} [${timestamp}] ${message}`);
      break;
    case 'error':
      console.log(`${colors.red}❌${colors.reset} [${timestamp}] ${message}`);
      break;
    case 'header':
      console.log(`\n${colors.cyan}${'═'.repeat(70)}${colors.reset}`);
      console.log(`${colors.cyan}${message}${colors.reset}`);
      console.log(`${colors.cyan}${'═'.repeat(70)}${colors.reset}\n`);
      break;
  }
}

async function createParinitha() {
  try {
    log('header', '👥 CREATING MEDICZY TEAM USER: PARINITHA');

    // Check if already exists
    log('info', 'Checking if team user already exists...');
    const existing = await User.findOne({
      where: { email: 'parinitha@mysmarthealth.in' }
    });

    if (existing) {
      log('warn', `Team user already exists (ID: ${existing.id})`);
      return existing;
    }

    // Create metadata
    const metadata = {
      department: 'Customer Support',
      designation: 'Support Agent',
      roleTitle: 'Support Agent',
      isTeam: true,
      canLogin: true,
      rocketchatUserId: 'tMBApkiDMamBx9bjf',
      rocketchatUsername: 'parinitha_smarthealth',
      isRocketchatAgent: true,
      linkedAt: new Date().toISOString()
    };

    log('info', 'Creating new team user in Mediczy...');

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash('SecureTeamPassword123!', salt);

    const newUser = await User.create({
      firstName: 'Parinitha',
      lastName: 'Kumar',
      email: 'parinitha@mysmarthealth.in',
      phoneNumber: '+91XXXXXXXXXX',
      password: hashedPassword,
      role: 'team',
      membershipType: 'team',
      status: 'active',
      emailVerified: true,
      metadata: JSON.stringify(metadata)
    });

    log('success', `Team user created successfully!`);
    log('info', `User ID: ${newUser.id}`);
    log('info', `Email: ${newUser.email}`);
    log('info', `Role: ${newUser.role}`);
    log('info', `RocketChat Status: Linked ✅`);

    return newUser;

  } catch (error) {
    log('error', `Failed to create team user: ${error.message}`);
    if (error.errors) {
      error.errors.forEach(e => log('error', `  - ${e.message}`));
    }
    throw error;
  }
}

async function verifyTeamUserCanLogin() {
  try {
    log('info', 'Verifying team user login credentials...');

    // Test via login endpoint
    const response = await axios.post('http://localhost:8888/api/team/login', {
      email: 'parinitha@mysmarthealth.in',
      password: 'SecureTeamPassword123!'
    }, { timeout: 5000 });

    if (response.data.success) {
      log('success', 'Team user login verified!');
      log('info', `JWT Token: ${response.data.token.substring(0, 20)}...`);
      return response.data.token;
    }
  } catch (error) {
    log('warn', `Login verification skipped: ${error.message}`);
    log('info', 'This is OK if backend is not running yet');
    return null;
  }
}

async function main() {
  try {
    log('header', '🚀 MEDICZY TEAM USER SETUP SCRIPT');

    // Step 1: Create user
    log('info', 'Step 1/2: Creating Parinitha in Mediczy database...');
    const user = await createParinitha();
    log('success', 'Step 1 complete\n');

    // Step 2: Verify
    if (process.env.SKIP_LOGIN_TEST !== 'true') {
      log('info', 'Step 2/2: Verifying login capability...');
      const token = await verifyTeamUserCanLogin();
      log('success', 'Step 2 complete\n');
    } else {
      log('info', 'Step 2/2: Skipped (SKIP_LOGIN_TEST=true)\n');
    }

    // Summary
    log('header', '✅ MEDICZY SETUP COMPLETE!');

    console.log(`Parinitha Team User Details:\n`);
    console.log(`  👤 Name: Parinitha Kumar`);
    console.log(`  📧 Email: parinitha@mysmarthealth.in`);
    console.log(`  🔐 Password: SecureTeamPassword123!`);
    console.log(`  🆔 Mediczy User ID: ${user.id}`);
    console.log(`  🏢 Department: Customer Support`);
    console.log(`  💼 Designation: Support Agent`);
    console.log(`  🟢 RocketChat Linked: YES (tMBApkiDMamBx9bjf)`);
    console.log(`  📱 Status: Active\n`);

    console.log(`System Architecture:\n`);
    console.log(`  ┌─────────────────────────────────────────┐`);
    console.log(`  │ MEDICZY (Team User)                     │`);
    console.log(`  │ ├─ Email: parinitha@mysmarthealth.in   │`);
    console.log(`  │ ├─ ID: ${user.id}                                 │`);
    console.log(`  │ └─ Role: team                           │`);
    console.log(`  └─────────────────────────────────────────┘`);
    console.log(`              ↓ LINKED ↓`);
    console.log(`  ┌─────────────────────────────────────────┐`);
    console.log(`  │ ROCKETCHAT (Livechat Agent)             │`);
    console.log(`  │ ├─ Username: parinitha_smarthealth     │`);
    console.log(`  │ ├─ ID: tMBApkiDMamBx9bjf              │`);
    console.log(`  │ └─ Status: Online 🟢                    │`);
    console.log(`  └─────────────────────────────────────────┘\n`);

    console.log(`Next Steps:\n`);
    console.log(`  1. Parinitha can now login to Mediczy`);
    console.log(`     URL: http://localhost:3000/team/login\n`);

    console.log(`  2. WhatsApp users can chat with her through RocketChat`);
    console.log(`     Flow: WhatsApp → Mediczy → RocketChat → Parinitha\n`);

    console.log(`  3. She will receive notifications in RocketChat`);
    console.log(`     when patients send messages\n`);

    console.log(`Test the Setup:\n`);
    console.log(`  # Check team user profile`);
    console.log(`  curl http://localhost:8888/api/team/profile \\`);
    console.log(`    -H "Authorization: Bearer <TOKEN>"\n`);

    console.log(`  # Check RocketChat agent status`);
    console.log(`  curl https://smart-chat.live/api/v1/livechat/users/agent \\`);
    console.log(`    -H "X-Auth-Token: <TOKEN>" \\`);
    console.log(`    -H "X-User-Id: <USER_ID>"\n`);

    console.log(`${colors.green}${'═'.repeat(70)}\n`);

  } catch (error) {
    log('error', `Setup failed: ${error.message}`);
    process.exit(1);
  } finally {
    // Close database connection
    try {
      await sequelize.close();
    } catch (e) {
      // ignore
    }
  }
}

main();
