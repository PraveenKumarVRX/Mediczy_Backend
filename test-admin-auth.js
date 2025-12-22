#!/usr/bin/env node

/**
 * Test Admin Authentication
 * Verifies that admin users can be identified and authenticated properly
 */

import User from './server/models/postgres/user.model.postgres.js';

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  bright: '\x1b[1m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function testAdminAuth() {
  log('\n═══════════════════════════════════════════════════════', 'bright');
  log('  👑 Testing Admin Authentication', 'bright');
  log('═══════════════════════════════════════════════════════\n', 'bright');
  
  try {
    // Test 1: Find all admin users
    log('📊 Test 1: Finding admin users...', 'cyan');
    const admins = await User.findAll({
      where: { isAdmin: true },
      attributes: ['id', 'email', 'firstName', 'lastName', 'isAdmin', 'role']
    });
    
    log(`  Found ${admins.length} admin users`, 'yellow');
    admins.forEach(admin => {
      log(`    ${admin.id}: ${admin.firstName} ${admin.lastName} (${admin.email})`, 'green');
      log(`       isAdmin: ${admin.isAdmin}, role: ${admin.role}`, 'green');
    });
    
    if (admins.length === 0) {
      log('  ❌ No admin users found!', 'red');
      return false;
    }
    
    // Test 2: Check JWT token generation
    log('\n🔐 Test 2: JWT Token Generation...', 'cyan');
    const testAdmin = admins[0];
    
    if (typeof testAdmin.generateAuthToken !== 'function') {
      log('  ❌ generateAuthToken method not found!', 'red');
      return false;
    }
    
    const token = testAdmin.generateAuthToken();
    log(`  ✅ Token generated successfully`, 'green');
    
    // Decode token to verify contents
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(Buffer.from(base64, 'base64').toString());
    
    log(`\n  Token payload:`, 'yellow');
    log(`    id: ${payload.id}`, 'green');
    log(`    email: ${payload.email}`, 'green');
    log(`    role: ${payload.role}`, 'green');
    log(`    isAdmin: ${payload.isAdmin}`, 'green');
    
    if (!payload.isAdmin) {
      log('  ❌ Token does not include isAdmin flag!', 'red');
      return false;
    }
    
    if (payload.role !== 'admin') {
      log('  ❌ Token role is not "admin"!', 'red');
      return false;
    }
    
    // Test 3: Find by email (admin login simulation)
    log('\n📧 Test 3: Find Admin by Email...', 'cyan');
    const foundAdmin = await User.findOne({
      where: { email: testAdmin.email }
    });
    
    if (!foundAdmin) {
      log('  ❌ Admin not found by email!', 'red');
      return false;
    }
    
    log(`  ✅ Found: ${foundAdmin.email}`, 'green');
    log(`     isAdmin: ${foundAdmin.isAdmin}`, 'green');
    log(`     role: ${foundAdmin.role}`, 'green');
    
    // Test 4: Count regular users vs admins
    log('\n📈 Test 4: User Statistics...', 'cyan');
    const totalUsers = await User.count();
    const adminCount = await User.count({ where: { isAdmin: true } });
    const regularUsers = totalUsers - adminCount;
    
    log(`  Total Users: ${totalUsers}`, 'yellow');
    log(`  Admin Users: ${adminCount}`, 'green');
    log(`  Regular Users: ${regularUsers}`, 'green');
    
    // Summary
    log('\n═══════════════════════════════════════════════════════', 'bright');
    log('  ✅ All Admin Authentication Tests Passed!', 'green');
    log('═══════════════════════════════════════════════════════\n', 'bright');
    
    log('Admin users can:', 'green');
    log('  ✅ Be identified with isAdmin flag', 'green');
    log('  ✅ Generate JWT tokens with admin role', 'green');
    log('  ✅ Be found by email for login', 'green');
    log('  ✅ Have proper role in token payload', 'green');
    
    return true;
    
  } catch (error) {
    log(`\n❌ Test failed: ${error.message}`, 'red');
    console.error(error);
    return false;
  }
}

testAdminAuth()
  .then(success => process.exit(success ? 0 : 1))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
