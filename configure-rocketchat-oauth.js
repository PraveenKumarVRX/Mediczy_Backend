#!/usr/bin/env node

/**
 * Rocket.Chat OAuth Configuration Script
 * Automatically configures OAuth settings in Rocket.Chat via API
 * Usage: node configure-rocketchat-oauth.js
 */

const http = require('http');
const querystring = require('querystring');

// Configuration
const ROCKETCHAT_URL = process.env.ROCKETCHAT_URL || 'http://localhost:3000';
const RC_ADMIN_USERNAME = process.env.RC_ADMIN_USERNAME || 'admin';
const RC_ADMIN_PASSWORD = process.env.RC_ADMIN_PASSWORD || 'password';
const OAUTH_BASE_URL = process.env.OAUTH_BASE_URL || 'http://localhost:8000';
const OAUTH_CLIENT_ID = process.env.OAUTH_ROCKETCHAT_CLIENT_ID || 'rocketchat-client-id';
const OAUTH_CLIENT_SECRET = process.env.OAUTH_ROCKETCHAT_CLIENT_SECRET || 'rocketchat-client-secret-secure-key-12345';

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m',
  bold: '\x1b[1m'
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function makeRequest(path, method = 'GET', data = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, ROCKETCHAT_URL);
    const requestOptions = {
      hostname: url.hostname,
      port: url.port || 80,
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...headers
      }
    };

    const req = http.request(requestOptions, (res) => {
      let response = '';
      res.on('data', (chunk) => { response += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(response);
          resolve({ status: res.statusCode, data: parsed, headers: res.headers });
        } catch (e) {
          resolve({ status: res.statusCode, data: response, headers: res.headers });
        }
      });
    });

    req.on('error', reject);
    if (data) {
      req.write(typeof data === 'string' ? data : JSON.stringify(data));
    }
    req.end();
  });
}

let authToken = null;
let userId = null;

async function authenticate() {
  log('\n▶ Authenticating with Rocket.Chat...', colors.blue);
  
  try {
    const response = await makeRequest('/api/v1/login', 'POST', {
      user: RC_ADMIN_USERNAME,
      password: RC_ADMIN_PASSWORD
    });

    if (response.status !== 200) {
      throw new Error(`Authentication failed: ${response.status}`);
    }

    authToken = response.data.data.authToken;
    userId = response.data.data.userId;
    
    log(`✅ Authenticated as ${RC_ADMIN_USERNAME}`, colors.green);
    log(`   Token: ${authToken.substring(0, 20)}...`, colors.yellow);
    return true;
  } catch (error) {
    log(`❌ Authentication failed: ${error.message}`, colors.red);
    return false;
  }
}

async function getOAuthSettings() {
  log('\n▶ Fetching current OAuth settings...', colors.blue);
  
  try {
    const response = await makeRequest('/api/v1/settings.get?query={"_id":/oauth/i}', 'GET', null, {
      'X-Auth-Token': authToken,
      'X-User-Id': userId
    });

    if (response.status === 200) {
      log(`✅ Found ${response.data.update?.length || 0} existing OAuth settings`, colors.green);
      return response.data.update || [];
    } else {
      log(`⚠️  Could not fetch settings: ${response.status}`, colors.yellow);
      return [];
    }
  } catch (error) {
    log(`⚠️  Error fetching settings: ${error.message}`, colors.yellow);
    return [];
  }
}

async function updateOAuthSettings() {
  log('\n▶ Updating OAuth settings...', colors.blue);

  const settings = [
    { _id: 'OAuth_Enabled', value: true },
    { _id: 'OAuth_Application_Name', value: 'Mediqzy' },
    { _id: 'Accounts_OAuth_Mediqzy', value: true },
    { _id: 'Accounts_OAuth_Mediqzy_id', value: OAUTH_CLIENT_ID },
    { _id: 'Accounts_OAuth_Mediqzy_secret', value: OAUTH_CLIENT_SECRET },
    { _id: 'Accounts_OAuth_Mediqzy_authorize_url', value: `${OAUTH_BASE_URL}/oauth/authorize` },
    { _id: 'Accounts_OAuth_Mediqzy_token_url', value: `${OAUTH_BASE_URL}/oauth/token` },
    { _id: 'Accounts_OAuth_Mediqzy_identity_url', value: `${OAUTH_BASE_URL}/oauth/userinfo` },
    { _id: 'Accounts_OAuth_Mediqzy_scope', value: 'openid email profile' },
    { _id: 'Accounts_OAuth_Mediqzy_button_label_text', value: 'Login with Mediqzy' },
    { _id: 'Accounts_OAuth_Mediqzy_username_field', value: 'username' },
    { _id: 'Accounts_OAuth_Mediqzy_email_field', value: 'email' },
    { _id: 'Accounts_OAuth_Mediqzy_name_field', value: 'name' },
    { _id: 'Accounts_OAuth_Mediqzy_id_field', value: 'sub' }
  ];

  let updated = 0;
  let failed = 0;

  for (const setting of settings) {
    try {
      const response = await makeRequest('/api/v1/settings', 'POST', setting, {
        'X-Auth-Token': authToken,
        'X-User-Id': userId
      });

      if (response.status === 200) {
        log(`✅ Updated: ${setting._id}`, colors.green);
        updated++;
      } else {
        log(`⚠️  Failed to update ${setting._id}: ${response.status}`, colors.yellow);
        failed++;
      }
    } catch (error) {
      log(`⚠️  Error updating ${setting._id}: ${error.message}`, colors.yellow);
      failed++;
    }
  }

  log(`\n   Updated: ${updated}/${settings.length} settings`, updated === settings.length ? colors.green : colors.yellow);
  if (failed > 0) {
    log(`   Failed: ${failed} settings`, colors.red);
  }

  return failed === 0;
}

async function testOAuthConnection() {
  log('\n▶ Testing OAuth connection...', colors.blue);

  try {
    // Test authorization endpoint
    const authResponse = await makeRequest(`/oauth/authorize?client_id=${OAUTH_CLIENT_ID}&response_type=code&scope=openid`, 'GET');
    
    if (authResponse.status === 301 || authResponse.status === 302 || authResponse.status === 401) {
      log(`✅ Authorization endpoint responsive (${authResponse.status})`, colors.green);
    } else {
      log(`⚠️  Unexpected authorization response: ${authResponse.status}`, colors.yellow);
    }

    // Test token endpoint
    const tokenResponse = await makeRequest('POST /oauth/token', 'POST', {
      grant_type: 'authorization_code',
      client_id: OAUTH_CLIENT_ID,
      client_secret: OAUTH_CLIENT_SECRET,
      code: 'test'
    });

    if (tokenResponse.status >= 400) {
      log(`✅ Token endpoint responsive (${tokenResponse.status})`, colors.green);
      if (tokenResponse.data.error) {
        log(`   Error (expected): ${tokenResponse.data.error}`, colors.yellow);
      }
    } else {
      log(`⚠️  Unexpected token response: ${tokenResponse.status}`, colors.yellow);
    }

  } catch (error) {
    log(`❌ Connection test failed: ${error.message}`, colors.red);
    return false;
  }

  return true;
}

async function main() {
  log('\n' + '='.repeat(70), colors.bold);
  log('Rocket.Chat OAuth Configuration', colors.bold);
  log('='.repeat(70), colors.bold);

  log(`\nConfiguration Details:`, colors.blue);
  log(`  Rocket.Chat URL: ${ROCKETCHAT_URL}`);
  log(`  OAuth Base URL: ${OAUTH_BASE_URL}`);
  log(`  OAuth Client ID: ${OAUTH_CLIENT_ID}`);
  log(`  Client Secret: ${OAUTH_CLIENT_SECRET.substring(0, 20)}...`);

  // Step 1: Authentication
  if (!await authenticate()) {
    log('\n⚠️  Could not authenticate with Rocket.Chat.', colors.yellow);
    log('   Manual Configuration Required:', colors.yellow);
    log('   1. Log in to Rocket.Chat as administrator', colors.yellow);
    log('   2. Navigate to: Administration → Settings → OAuth', colors.yellow);
    log('   3. Enter the settings from ROCKETCHAT_OAUTH_CONFIGURATION.md', colors.yellow);
    process.exit(1);
  }

  // Step 2: Get current settings
  await getOAuthSettings();

  // Step 3: Update OAuth settings
  if (!await updateOAuthSettings()) {
    log('\n⚠️  Some settings failed to update', colors.yellow);
  }

  // Step 4: Test connection
  await testOAuthConnection();

  log('\n' + '='.repeat(70), colors.bold);
  log('Configuration Complete!', colors.bold);
  log('='.repeat(70), colors.bold);

  log(`\nNext Steps:`, colors.blue);
  log(`  1. Log out of Rocket.Chat`, colors.yellow);
  log(`  2. Verify "Login with Mediqzy" button appears on login page`, colors.yellow);
  log(`  3. Test OAuth login by clicking the button`, colors.yellow);
  log(`  4. Monitor logs: tail -f /home/ubuntu/Mediczy/logs/server-out.log`, colors.yellow);

  log(`\nDebugging:`, colors.blue);
  log(`  - Check Rocket.Chat logs: tail -f /var/log/rocketchat/*.log`, colors.yellow);
  log(`  - Verify OAuth endpoints: curl ${OAUTH_BASE_URL}/oauth/.well-known/oauth-authorization-server`, colors.yellow);

  process.exit(0);
}

main().catch(error => {
  log(`\n❌ Error: ${error.message}`, colors.red);
  process.exit(1);
});
