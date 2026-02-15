#!/usr/bin/env node
/**
 * Setup Team User as RocketChat Agent
 * Usage: node setup-team-agent.mjs
 * 
 * This script:
 * 1. Creates/gets RocketChat user (parinitha_smarthealth)
 * 2. Registers as livechat agent
 * 3. Sets online status
 * 4. Outputs verification info
 */

import axios from 'axios';

const RC_URL = process.env.ROCKETCHAT_URL || 'https://smart-chat.live';
const RC_ADMIN_USER = process.env.ROCKETCHAT_ADMIN_USER || 'support_admin';
const RC_ADMIN_PASS = process.env.ROCKETCHAT_ADMIN_PASSWORD || 'Password@1234567';

const TEAM_USER = {
  firstName: 'Parinitha',
  lastName: 'Kumar',
  email: 'parinitha@mysmarthealth.in',
  username: 'parinitha_smarthealth',
  password: 'SecureTeamPassword123!'
};

// Color codes for output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(level, message) {
  const timestamp = new Date().toLocaleTimeString();
  const timestamp_str = `[${timestamp}]`;
  
  switch (level) {
    case 'info':
      console.log(`${colors.blue}ℹ${colors.reset} ${timestamp_str} ${message}`);
      break;
    case 'success':
      console.log(`${colors.green}✅${colors.reset} ${timestamp_str} ${message}`);
      break;
    case 'warn':
      console.log(`${colors.yellow}⚠️${colors.reset} ${timestamp_str} ${message}`);
      break;
    case 'error':
      console.log(`${colors.red}❌${colors.reset} ${timestamp_str} ${message}`);
      break;
    case 'header':
      console.log(`\n${colors.cyan}${'═'.repeat(70)}${colors.reset}`);
      console.log(`${colors.cyan}${message}${colors.reset}`);
      console.log(`${colors.cyan}${'═'.repeat(70)}${colors.reset}\n`);
      break;
  }
}

async function getAdminAuth() {
  try {
    log('info', 'Authenticating with RocketChat admin...');
    const response = await axios.post(
      `${RC_URL}/api/v1/login`,
      {
        user: RC_ADMIN_USER,
        password: RC_ADMIN_PASS
      },
      { timeout: 5000 }
    );

    log('success', `Admin authenticated as: ${response.data.data.me.username}`);
    return {
      authToken: response.data.data.authToken,
      userId: response.data.data.userId,
      serverVersion: response.data.data.me.version
    };
  } catch (error) {
    log('error', `Admin authentication failed: ${error.response?.data?.error || error.message}`);
    throw error;
  }
}

async function createRCUser(auth, userData) {
  try {
    log('info', `Creating RocketChat user: ${userData.username}...`);
    
    const response = await axios.post(
      `${RC_URL}/api/v1/users.create`,
      {
        username: userData.username,
        email: userData.email,
        password: userData.password,
        name: `${userData.firstName} ${userData.lastName}`,
        active: true
      },
      {
        headers: {
          'X-Auth-Token': auth.authToken,
          'X-User-Id': auth.userId,
          'Content-Type': 'application/json'
        },
        timeout: 5000
      }
    );

    log('success', `RocketChat user created: ${response.data.user._id}`);
    return { ...response.data.user, isNew: true };
  } catch (error) {
    if (error.response?.status === 400 && 
        error.response?.data?.error?.includes('already exists')) {
      log('warn', `User already exists, fetching existing user...`);
      return await getRCUser(auth, userData.username);
    }
    throw error;
  }
}

async function getRCUser(auth, username) {
  try {
    log('info', `Fetching existing RocketChat user: ${username}...`);
    
    const response = await axios.get(
      `${RC_URL}/api/v1/users.info?username=${username}`,
      {
        headers: {
          'X-Auth-Token': auth.authToken,
          'X-User-Id': auth.userId
        },
        timeout: 5000
      }
    );

    log('success', `User found: ${response.data.user._id}`);
    return { ...response.data.user, isNew: false };
  } catch (error) {
    log('error', `User lookup failed: ${error.response?.data?.error || error.message}`);
    throw error;
  }
}

async function registerAsAgent(auth, rcUser) {
  try {
    log('info', `Registering ${rcUser.username} as livechat agent...`);
    
    // Try with userId first, then username
    let payload = { userId: rcUser._id };
    
    const response = await axios.post(
      `${RC_URL}/api/v1/livechat/users/agent`,
      payload,
      {
        headers: {
          'X-Auth-Token': auth.authToken,
          'X-User-Id': auth.userId,
          'Content-Type': 'application/json'
        },
        timeout: 5000
      }
    );

    log('success', `Registered as livechat agent`);
    return response.data;
  } catch (error) {
    // Retry with username
    try {
      log('warn', `Retrying with username instead of userId...`);
      const response = await axios.post(
        `${RC_URL}/api/v1/livechat/users/agent`,
        { username: rcUser.username },
        {
          headers: {
            'X-Auth-Token': auth.authToken,
            'X-User-Id': auth.userId,
            'Content-Type': 'application/json'
          },
          timeout: 5000
        }
      );
      log('success', `Registered as livechat agent (via username)`);
      return response.data;
    } catch (retryError) {
      log('error', `Agent registration failed: ${retryError.response?.data?.error || retryError.message}`);
      throw retryError;
    }
  }
}

async function setAgentOnline(auth, username) {
  try {
    log('info', `Setting agent online...`);
    
    const response = await axios.post(
      `${RC_URL}/api/v1/users.setStatus`,
      { 
        username: username, 
        status: 'online' 
      },
      {
        headers: {
          'X-Auth-Token': auth.authToken,
          'X-User-Id': auth.userId,
          'Content-Type': 'application/json'
        },
        timeout: 5000
      }
    );

    log('success', `Agent is now online`);
    return true;
  } catch (error) {
    log('warn', `Status change had issues: ${error.response?.data?.error || error.message}`);
    // Don't fail on this - agent might already be online
    return false;
  }
}

async function verifyAgentCreated(auth, username) {
  try {
    log('info', `Verifying agent was created...`);
    
    const response = await axios.get(
      `${RC_URL}/api/v1/livechat/users/agent`,
      {
        headers: {
          'X-Auth-Token': auth.authToken,
          'X-User-Id': auth.userId
        },
        timeout: 5000
      }
    );

    const agent = (response.data.users || []).find(u => u.username === username);
    
    if (agent) {
      log('success', `Agent verified in livechat system`);
      return agent;
    } else {
      log('warn', `Agent not found in livechat list (may need refresh)`);
      return null;
    }
  } catch (error) {
    log('error', `Verification failed: ${error.message}`);
    return null;
  }
}

async function main() {
  try {
    log('header', '🚀 TEAM USER RocketChat AGENT SETUP');
    
    console.log(`Configuration:`);
    console.log(`  RocketChat URL: ${RC_URL}`);
    console.log(`  Team User Email: ${TEAM_USER.email}`);
    console.log(`  Team User Username: ${TEAM_USER.username}\n`);

    // Step 1: Get admin auth
    log('info', 'Step 1/5: Authenticating with RocketChat...');
    const auth = await getAdminAuth();
    log('success', `Authentication successful\n`);

    // Step 2: Create/Get RC user
    log('info', 'Step 2/5: Creating/fetching RocketChat user...');
    const rcUser = await createRCUser(auth, TEAM_USER);
    const userStatus = rcUser.isNew ? 'CREATED' : 'EXISTS';
    log('success', `User ${userStatus}\n`);

    // Step 3: Register as agent
    log('info', 'Step 3/5: Registering as livechat agent...');
    await registerAsAgent(auth, rcUser);
    log('success', `Registration successful\n`);

    // Step 4: Set online
    log('info', 'Step 4/5: Setting online status...');
    await setAgentOnline(auth, TEAM_USER.username);
    log('success', `Status updated\n`);

    // Step 5: Verify
    log('info', 'Step 5/5: Verifying setup...');
    const verified = await verifyAgentCreated(auth, TEAM_USER.username);
    log('success', `Verification complete\n`);

    // Summary
    log('header', '✅ SETUP COMPLETE!');
    
    console.log(`Team User Agent Details:\n`);
    console.log(`  📧 Email: ${TEAM_USER.email}`);
    console.log(`  👤 Username: ${TEAM_USER.username}`);
    console.log(`  🔐 Password: ${TEAM_USER.password}`);
    console.log(`  🆔 RocketChat ID: ${rcUser._id}`);
    console.log(`  🟢 Status: Online`);
    console.log(`  💼 Role: Livechat Agent\n`);
    
    console.log(`Next Steps:\n`);
    console.log(`  1. Create Mediczy team user (if not exists)`);
    console.log(`     Email: ${TEAM_USER.email}`);
    console.log(`     Department: Customer Support\n`);
    
    console.log(`  2. Link team user to RocketChat agent`);
    console.log(`     POST /api/team/link-to-rocketchat`);
    console.log(`     Body: {`);
    console.log(`       "teamUserId": 42,`);
    console.log(`       "rocketchatUserId": "${rcUser._id}",`);
    console.log(`       "rocketchatUsername": "${TEAM_USER.username}"`);
    console.log(`     }\n`);
    
    console.log(`  3. Parinitha can now login`);
    console.log(`     URL: https://localhost:3000/team/login\n`);
    
    console.log(`  4. WhatsApp users will be routed to her in RocketChat\n`);

    console.log(`Verification Result:`);
    if (verified) {
      console.log(`  ✅ Agent is listed in RocketChat livechat agents`);
      console.log(`  ✅ Agent status: ${verified.status || 'online'}`);
    } else {
      console.log(`  ⚠️  Agent verification couldn't be confirmed`);
      console.log(`     (Agent may still be set up correctly)\n`);
    }

    console.log(`\n${colors.green}${'═'.repeat(70)}\n`);

  } catch (error) {
    log('error', `Setup failed: ${error.message}`);
    console.log('\nDebugging info:');
    if (error.response?.data) {
      console.log(`  Response: ${JSON.stringify(error.response.data, null, 2)}`);
    }
    console.log(`\n${colors.red}${'═'.repeat(70)}\n`);
    process.exit(1);
  }
}

main();
