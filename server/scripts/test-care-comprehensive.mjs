#!/usr/bin/env node

/**
 * Comprehensive care@mysmarthealth.in team login test
 * Tests all possible login endpoints
 */

import http from 'http';

const API_URL = 'http://localhost:3000';
const TIMEOUT = 5000;

function makeRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, API_URL);
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: TIMEOUT
    };

    const req = http.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: data
        });
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function testLogins() {
  console.log('🧪 Testing all care@mysmarthealth.in login endpoints\n');

  const tests = [
    {
      name: 'POST /api/auth/login',
      method: 'POST',
      path: '/api/auth/login',
      body: { email: 'care@mysmarthealth.in', password: 'Mayden@2025' }
    },
    {
      name: 'POST /api/users/login',
      method: 'POST',
      path: '/api/users/login',
      body: { email: 'care@mysmarthealth.in', password: 'Mayden@2025' }
    },
    {
      name: 'POST /api/users/login/user',
      method: 'POST',
      path: '/api/users/login/user',
      body: { email: 'care@mysmarthealth.in', password: 'Mayden@2025' }
    }
  ];

  for (const test of tests) {
    console.log(`📝 ${test.name}`);
    console.log(`   Method: ${test.method}, Path: ${test.path}`);
    try {
      const response = await makeRequest(test.method, test.path, test.body);
      console.log(`   Status: ${response.status}`);
      try {
        const json = JSON.parse(response.body);
        console.log(`   Response:`, json);
        if (json.token) {
          console.log(`   ✅ Token received! First 20 chars: ${json.token.substring(0, 20)}...`);
        } else if (response.status === 200) {
          console.log(`   ✅ Login successful!`);
        } else {
          console.log(`   ❌ Error: ${json.message || 'Unknown error'}`);
        }
      } catch (e) {
        console.log(`   Response: ${response.body.substring(0, 100)}`);
      }
    } catch (error) {
      console.log(`   ❌ Error: ${error.message}`);
    }
    console.log();
  }
}

testLogins().catch(console.error);
