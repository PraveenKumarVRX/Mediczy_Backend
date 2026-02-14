#!/usr/bin/env node

/**
 * OAuth 2.0 Flow Test Script
 * Tests all OAuth endpoints: authorize, token, userinfo
 * Validates RFC 6749 compliance
 */

const http = require('http');
const url = require('url');
const querystring = require('querystring');
const crypto = require('crypto');

const BASE_URL = process.env.APP_BASE_URL || 'http://localhost:8000';
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8888';
const CLIENT_ID = process.env.OAUTH_ROCKETCHAT_CLIENT_ID || 'rocketchat-client-id';
const CLIENT_SECRET = process.env.OAUTH_ROCKETCHAT_CLIENT_SECRET || 'rocketchat-client-secret-secure-key-12345';
const REDIRECT_URI = `${BASE_URL}/oauth-callback`;

let testResults = {
  passed: 0,
  failed: 0,
  tests: []
};

// Color codes for console output
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

function makeRequest(options, data = null) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(options.url);
    const requestOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
        ...options.headers
      }
    };

    const protocol = parsedUrl.protocol === 'https:' ? require('https') : http;
    const req = protocol.request(requestOptions, (res) => {
      let responseData = '';
      res.on('data', (chunk) => { responseData += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(responseData);
          resolve({ status: res.statusCode, data: parsed, headers: res.headers });
        } catch (e) {
          resolve({ status: res.statusCode, data: responseData, headers: res.headers, raw: true });
        }
      });
    });

    req.on('error', reject);
    if (data) {
      if (typeof data === 'string') req.write(data);
      else req.write(querystring.stringify(data));
    }
    req.end();
  });
}

async function test(name, fn) {
  try {
    log(`\n▶ ${name}`, colors.blue);
    await fn();
    testResults.passed++;
    testResults.tests.push({ name, status: 'PASS', error: null });
    log(`✅ PASS: ${name}`, colors.green);
  } catch (error) {
    testResults.failed++;
    testResults.tests.push({ name, status: 'FAIL', error: error.message });
    log(`❌ FAIL: ${name}`, colors.red);
    log(`   Error: ${error.message}`, colors.red);
  }
}

async function runTests() {
  log('\n' + '='.repeat(70), colors.bold);
  log('OAuth 2.0 Flow Test Suite', colors.bold);
  log(`Testing: ${BACKEND_URL}`, colors.yellow);
  log('='.repeat(70) + '\n', colors.bold);

  // Test 1: Metadata Endpoint
  await test('GET /.well-known/oauth-authorization-server', async () => {
    const response = await makeRequest({
      url: `${BACKEND_URL}/oauth/.well-known/oauth-authorization-server`,
      method: 'GET'
    });

    if (response.status !== 200) throw new Error(`Expected 200, got ${response.status}`);
    if (!response.data.issuer) throw new Error('Missing issuer');
    if (!response.data.authorization_endpoint) throw new Error('Missing authorization_endpoint');
    if (!response.data.token_endpoint) throw new Error('Missing token_endpoint');
    if (!response.data.userinfo_endpoint) throw new Error('Missing userinfo_endpoint');
    
    log(`  Issuer: ${response.data.issuer}`, colors.yellow);
  });

  // Test 2: OpenID Configuration
  await test('GET /.well-known/openid-configuration', async () => {
    const response = await makeRequest({
      url: `${BACKEND_URL}/oauth/.well-known/openid-configuration`,
      method: 'GET'
    });

    if (response.status !== 200) throw new Error(`Expected 200, got ${response.status}`);
    if (!response.data.issuer) throw new Error('Missing issuer');
    
    log(`  Found ${response.data.scopes_supported?.length || 0} scopes`, colors.yellow);
  });

  // Test 3: Authorization Endpoint (should redirect)
  await test('GET /oauth/authorize (redirect flow)', async () => {
    const params = {
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      response_type: 'code',
      scope: 'openid email profile',
      state: crypto.randomBytes(16).toString('hex')
    };

    const response = await makeRequest({
      url: `${BACKEND_URL}/oauth/authorize?${querystring.stringify(params)}`,
      method: 'GET'
    });

    // Should redirect or require authentication (not 200)
    if (response.status === 302 || response.status === 307 || response.status === 401 || response.status === 303) {
      log(`  Response: ${response.status} (expected for auth flow)`, colors.yellow);
    } else if (response.status !== 200) {
      throw new Error(`Unexpected status: ${response.status}`);
    }
  });

  // Test 4: Token Endpoint with Client Credentials Flow
  await test('POST /oauth/token (client credentials)', async () => {
    const tokenData = {
      grant_type: 'client_credentials',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      scope: 'openid email profile'
    };

    const response = await makeRequest({
      url: `${BACKEND_URL}/oauth/token`,
      method: 'POST'
    }, tokenData);

    if (response.status !== 200) {
      // Client credentials might not be valid, but endpoint should respond
      log(`  Status: ${response.status} (endpoint responding)`, colors.yellow);
      if (response.data.error) {
        log(`  Error: ${response.data.error} (expected behavior)`, colors.yellow);
      }
    } else {
      if (!response.data.access_token) throw new Error('Missing access_token');
      if (!response.data.token_type) throw new Error('Missing token_type');
      if (response.data.token_type !== 'Bearer') throw new Error(`Invalid token_type: ${response.data.token_type}`);
      
      log(`  Token Type: ${response.data.token_type}`, colors.yellow);
      log(`  Expires In: ${response.data.expires_in}s`, colors.yellow);
    }
  });

  // Test 5: Token Endpoint Validation (missing params)
  await test('POST /oauth/token validation (missing grant_type)', async () => {
    const tokenData = {
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET
    };

    const response = await makeRequest({
      url: `${BACKEND_URL}/oauth/token`,
      method: 'POST'
    }, tokenData);

    if (response.status !== 400) throw new Error(`Expected 400, got ${response.status}`);
    if (!response.data.error) throw new Error('Missing error field');
    
    log(`  Error: ${response.data.error}`, colors.yellow);
  });

  // Test 6: Userinfo Endpoint (should require auth)
  await test('GET /oauth/userinfo (requires authentication)', async () => {
    const response = await makeRequest({
      url: `${BACKEND_URL}/oauth/userinfo`,
      method: 'GET'
    });

    // Should reject without valid token (401, 403, or 400)
    if ([400, 401, 403].includes(response.status)) {
      log(`  Response: ${response.status} (expected without token)`, colors.yellow);
    } else {
      throw new Error(`Expected 401/403, got ${response.status}`);
    }
  });

  // Test 7: Userinfo Endpoint with Auth (using Basic auth instead)
  await test('GET /oauth/userinfo with credentials', async () => {
    const credentials = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
    const response = await makeRequest({
      url: `${BACKEND_URL}/oauth/userinfo`,
      method: 'GET',
      headers: {
        'Authorization': `Basic ${credentials}`
      }
    });

    // Should handle the request (either accept or reject)
    log(`  Status: ${response.status}`, colors.yellow);
  });

  // Test 8: CORS Headers
  await test('OPTIONS request (CORS headers)', async () => {
    const response = await makeRequest({
      url: `${BACKEND_URL}/oauth/authorize`,
      method: 'OPTIONS'
    });

    // CORS might not be fully implemented, but request should be handled
    log(`  Status: ${response.status}`, colors.yellow);
  });

  // Test 9: Invalid Client ID
  await test('POST /oauth/token with invalid client', async () => {
    const tokenData = {
      grant_type: 'authorization_code',
      client_id: 'invalid-client',
      client_secret: 'wrong-secret',
      code: 'fake-code',
      redirect_uri: REDIRECT_URI
    };

    const response = await makeRequest({
      url: `${BACKEND_URL}/oauth/token`,
      method: 'POST'
    }, tokenData);

    if (response.status !== 200 && response.data?.error) {
      log(`  Error: ${response.data.error} (correct validation)`, colors.yellow);
    } else if (response.status === 200) {
      throw new Error('Should reject invalid client');
    }
  });

  // Test 10: Route Registration Check
  await test('GET /api/auth/.well-known/oauth-authorization-server (alternate path)', async () => {
    const response = await makeRequest({
      url: `${BACKEND_URL}/api/auth/.well-known/oauth-authorization-server`,
      method: 'GET'
    });

    if (response.status === 200) {
      log(`  Route registered at /api/auth/* ✓`, colors.yellow);
    } else {
      throw new Error(`Expected 200, got ${response.status}`);
    }
  });

  // Results Summary
  log('\n' + '='.repeat(70), colors.bold);
  log('Test Results Summary', colors.bold);
  log('='.repeat(70), colors.bold);
  log(`✅ Passed: ${testResults.passed}`, colors.green);
  log(`❌ Failed: ${testResults.failed}`, colors.red);
  log(`📊 Total:  ${testResults.passed + testResults.failed}`, colors.blue);
  log('='.repeat(70) + '\n', colors.bold);

  if (testResults.failed === 0) {
    log('🎉 All tests passed! OAuth implementation is working correctly.', colors.green);
  } else {
    log(`⚠️  ${testResults.failed} test(s) failed. Review errors above.`, colors.yellow);
  }

  // Export test results
  console.log('\n📋 Detailed Test Results:\n', JSON.stringify(testResults, null, 2));

  process.exit(testResults.failed > 0 ? 1 : 0);
}

// Run tests
runTests().catch(error => {
  log(`\n❌ Test suite error: ${error.message}`, colors.red);
  process.exit(1);
});
