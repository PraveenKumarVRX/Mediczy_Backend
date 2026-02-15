#!/usr/bin/env node

/**
 * Email Settings Endpoints Sanity Check
 * Verifies that all email settings routes are properly registered
 */

import axios from 'axios';

const API_BASE = process.env.API_URL || 'http://localhost:3000';

async function checkEndpoints() {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║         EMAIL SETTINGS ENDPOINTS SANITY CHECK             ║
║                API: ${API_BASE}
╚═══════════════════════════════════════════════════════════╝
  `);

  const endpoints = [
    { method: 'GET', path: '/api/email-settings', description: 'List settings' },
    { method: 'POST', path: '/api/email-settings', description: 'Create settings' },
    { method: 'GET', path: '/api/email-settings/default', description: 'Get default' },
    { method: 'GET', path: '/api/email-settings/test-id', description: 'Get specific' },
    { method: 'PUT', path: '/api/email-settings/test-id', description: 'Update settings' },
    { method: 'POST', path: '/api/email-settings/test-id/test', description: 'Test connection' },
    { method: 'DELETE', path: '/api/email-settings/test-id', description: 'Delete settings' },
    { method: 'PUT', path: '/api/email-settings/test-id/set-default', description: 'Set default' },
    { method: 'GET', path: '/api/team/emails/inbox', description: 'Get inbox' },
    { method: 'GET', path: '/api/team/emails/stats', description: 'Get stats' }
  ];

  console.log('\n📡 Testing endpoint accessibility...\n');

  let registered = 0;
  let notFound = 0;

  for (const endpoint of endpoints) {
    try {
      const requestConfig = {
        method: endpoint.method.toLowerCase(),
        url: `${API_BASE}${endpoint.path}`,
        headers: {
          'Authorization': 'Bearer test-token'
        },
        validateStatus: () => true // Don't throw on any status code
      };

      const response = await axios(requestConfig);

      // Endpoint is registered if we get 401 (auth error) instead of 404 (not found)
      // Or 200 for public endpoints
      if (response.status === 404) {
        console.log(`❌ NOT FOUND: ${endpoint.method.padEnd(6)} ${endpoint.path} - ${endpoint.description}`);
        notFound++;
      } else if (response.status === 401) {
        console.log(`✅ REGISTERED: ${endpoint.method.padEnd(6)} ${endpoint.path} - ${endpoint.description}`);
        registered++;
      } else if (response.status === 200 || response.status === 201) {
        console.log(`✅ ACCESSIBLE: ${endpoint.method.padEnd(6)} ${endpoint.path} - ${endpoint.description}`);
        registered++;
      } else {
        console.log(`✅ REGISTERED: ${endpoint.method.padEnd(6)} ${endpoint.path} (Status: ${response.status}) - ${endpoint.description}`);
        registered++;
      }
    } catch (error) {
      console.log(`⚠️  ERROR: ${endpoint.method.padEnd(6)} ${endpoint.path} - ${error.message}`);
      notFound++;
    }
  }

  console.log(`
╔═══════════════════════════════════════════════════════════╗
║                    RESULTS                                ║
╚═══════════════════════════════════════════════════════════╝

  Total Endpoints Checked: ${endpoints.length}
  ✅ Registered: ${registered}
  ❌ Not Found: ${notFound}
  Success Rate: ${((registered / endpoints.length) * 100).toFixed(1)}%

${notFound > 0 ? `\n⚠️  Some endpoints were not found! Check app.js route registration.` : '\n✨ All endpoints registered and accessible!'}`);

  process.exit(notFound > 0 ? 1 : 0);
}

checkEndpoints();
