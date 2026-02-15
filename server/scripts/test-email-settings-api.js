#!/usr/bin/env node

/**
 * Email Settings API Test Suite
 * Tests all email-settings endpoints
 */

import axios from 'axios';

const API_BASE = process.env.API_URL || 'http://localhost:3000';
const HEADERS = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${process.env.AUTH_TOKEN || 'test-token'}`
};

// Test results tracking
let passed = 0;
let failed = 0;
const tests = [];

async function test(name, fn) {
  try {
    console.log(`\n⏳ Testing: ${name}`);
    await fn();
    console.log(`✅ PASS: ${name}`);
    passed++;
    tests.push({ name, status: 'PASS' });
  } catch (error) {
    console.error(`❌ FAIL: ${name}`);
    console.error(`   Error: ${error.message}`);
    failed++;
    tests.push({ name, status: 'FAIL', error: error.message });
  }
}

async function runTests() {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║           EMAIL SETTINGS API TEST SUITE                      ║
║                  API: ${API_BASE}
╚══════════════════════════════════════════════════════════════╝
  `);

  let settingsId = null;

  // Test 1: GET /api/email-settings - List all settings
  await test('GET /api/email-settings - List all settings', async () => {
    const response = await axios.get(`${API_BASE}/api/email-settings`, { headers: HEADERS });
    
    if (response.status !== 200) throw new Error(`Expected 200, got ${response.status}`);
    if (!response.data.success) throw new Error('Response success is false');
    if (!Array.isArray(response.data.data)) throw new Error('Response data is not an array');
    
    if (response.data.count > 0) {
      settingsId = response.data.data[0].id;
      console.log(`   Found ${response.data.count} settings for user`);
    }
  });

  // Test 2: POST /api/email-settings - Create new settings
  let newSettingsId = null;
  await test('POST /api/email-settings - Create email settings', async () => {
    const payload = {
      email: 'test-email@mysmarthealth.in',
      displayName: 'Test - Smart Health',
      provider: 'zoho',
      smtpHost: 'smtp.zoho.in',
      smtpPort: 465,
      smtpSecure: true,
      smtpUsername: 'test-email@mysmarthealth.in',
      smtpPassword: 'test-password',
      imapHost: 'imap.zoho.in',
      imapPort: 993,
      imapSecure: true,
      imapUsername: 'test-email@mysmarthealth.in',
      imapPassword: 'test-password',
      isDefault: false,
      syncEnabled: true,
      syncFrequencyMinutes: 30
    };
    
    const response = await axios.post(`${API_BASE}/api/email-settings`, payload, { headers: HEADERS });
    
    if (response.status !== 201) throw new Error(`Expected 201, got ${response.status}`);
    if (!response.data.success) throw new Error('Response success is false');
    if (!response.data.data.id) throw new Error('No settings ID returned');
    
    newSettingsId = response.data.data.id;
    console.log(`   Created settings ID: ${newSettingsId}`);
  });

  // Test 3: GET /api/email-settings/:settingsId - Get specific settings
  if (settingsId) {
    await test(`GET /api/email-settings/:settingsId - Get specific settings`, async () => {
      const response = await axios.get(`${API_BASE}/api/email-settings/${settingsId}`, { headers: HEADERS });
      
      if (response.status !== 200) throw new Error(`Expected 200, got ${response.status}`);
      if (!response.data.success) throw new Error('Response success is false');
      if (!response.data.data.id) throw new Error('No settings data returned');
      if (response.data.data.smtpPassword) throw new Error('Password returned in response (security issue)');
      
      console.log(`   Retrieved settings for email: ${response.data.data.email}`);
    });
  }

  // Test 4: PUT /api/email-settings/:settingsId - Update settings
  if (newSettingsId) {
    await test(`PUT /api/email-settings/:settingsId - Update settings`, async () => {
      const payload = {
        displayName: 'Updated Test User',
        syncFrequencyMinutes: 20,
        autoReplyEnabled: true,
        autoReplyMessage: 'Out of office'
      };
      
      const response = await axios.put(`${API_BASE}/api/email-settings/${newSettingsId}`, payload, { headers: HEADERS });
      
      if (response.status !== 200) throw new Error(`Expected 200, got ${response.status}`);
      if (!response.data.success) throw new Error('Response success is false');
      if (response.data.data.displayName !== 'Updated Test User') throw new Error('Update not applied');
      
      console.log(`   Updated settings: ${response.data.data.displayName}`);
    });
  }

  // Test 5: POST /api/email-settings/:settingsId/test - Test connection
  if (newSettingsId) {
    await test(`POST /api/email-settings/:settingsId/test - Test connection`, async () => {
      const response = await axios.post(`${API_BASE}/api/email-settings/${newSettingsId}/test`, {}, { headers: HEADERS });
      
      if (response.status !== 200) throw new Error(`Expected 200, got ${response.status}`);
      if (!response.data.data) throw new Error('No test result data');
      
      console.log(`   SMTP: ${response.data.data.smtpConnected ? '✅' : '❌'}`);
      console.log(`   IMAP: ${response.data.data.imapConnected ? '✅' : '❌'}`);
    });
  }

  // Test 6: PUT /api/email-settings/:settingsId/set-default - Set as default
  if (settingsId) {
    await test(`PUT /api/email-settings/:settingsId/set-default - Set as default`, async () => {
      const response = await axios.put(`${API_BASE}/api/email-settings/${settingsId}/set-default`, {}, { headers: HEADERS });
      
      if (response.status !== 200) throw new Error(`Expected 200, got ${response.status}`);
      if (!response.data.data.isDefault) throw new Error('isDefault not set');
      
      console.log(`   Set as default: ${response.data.data.email}`);
    });
  }

  // Test 7: GET /api/email-settings/default - Get default settings
  await test(`GET /api/email-settings/default - Get default settings`, async () => {
    const response = await axios.get(`${API_BASE}/api/email-settings/default`, { headers: HEADERS });
    
    if (response.status !== 200) throw new Error(`Expected 200, got ${response.status}`);
    if (!response.data.data.isDefault) throw new Error('Default settings not returned');
    
    console.log(`   Default email: ${response.data.data.email}`);
  });

  // Test 8: DELETE /api/email-settings/:settingsId - Delete settings
  if (newSettingsId) {
    await test(`DELETE /api/email-settings/:settingsId - Delete settings`, async () => {
      const response = await axios.delete(`${API_BASE}/api/email-settings/${newSettingsId}`, { headers: HEADERS });
      
      if (response.status !== 200) throw new Error(`Expected 200, got ${response.status}`);
      if (!response.data.success) throw new Error('Response success is false');
      
      console.log(`   Deleted settings: ${newSettingsId}`);
    });
  }

  // Test 9: Email Inbox endpoints
  await test(`GET /api/team/emails/inbox - Get email inbox`, async () => {
    const response = await axios.get(`${API_BASE}/api/team/emails/inbox?limit=5`, { headers: HEADERS });
    
    if (response.status !== 200) throw new Error(`Expected 200, got ${response.status}`);
    if (!response.data.success) throw new Error('Response success is false');
    if (!Array.isArray(response.data.data)) throw new Error('Response data is not an array');
    
    console.log(`   Found ${response.data.data.length} emails in inbox`);
  });

  // Test 10: Email stats
  await test(`GET /api/team/emails/stats - Get email statistics`, async () => {
    const response = await axios.get(`${API_BASE}/api/team/emails/stats`, { headers: HEADERS });
    
    if (response.status !== 200) throw new Error(`Expected 200, got ${response.status}`);
    if (!response.data.data) throw new Error('No stats data returned');
    if (typeof response.data.data.total !== 'number') throw new Error('total count missing');
    
    console.log(`   Total emails: ${response.data.data.total}`);
    console.log(`   Unread: ${response.data.data.unread}`);
    console.log(`   Starred: ${response.data.data.starred}`);
  });

  // Print summary
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║                    TEST SUMMARY                              ║
╚══════════════════════════════════════════════════════════════╝

  Total Tests: ${passed + failed}
  ✅ Passed: ${passed}
  ❌ Failed: ${failed}
  Success Rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%

${failed > 0 ? '\nFailed Tests:' : 'All tests passed! 🎉'}
${tests.filter(t => t.status === 'FAIL').map(t => `  ❌ ${t.name}\n     ${t.error}`).join('\n')}
  `);

  process.exit(failed > 0 ? 1 : 0);
}

runTests();
