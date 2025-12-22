#!/usr/bin/env node

/**
 * Test Authentication for All User Types
 * Verifies that all entity types can authenticate with PostgreSQL
 */

import User from './server/models/postgres/user.model.postgres.js';
import Doctor from './server/models/postgres/doctor.model.postgres.js';
import Corporate from './server/models/postgres/corporate.model.postgres.js';
import Nurse from './server/models/postgres/nurse.model.postgres.js';
import DoctorAssistant from './server/models/postgres/doctor-assistant.model.postgres.js';

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

async function testAuthentication() {
  log('\n═══════════════════════════════════════════════════════', 'bright');
  log('  🔐 Testing Authentication for All User Types', 'bright');
  log('═══════════════════════════════════════════════════════\n', 'bright');
  
  const tests = [];
  
  // Test Users
  log('👤 Testing Users...', 'cyan');
  try {
    const userCount = await User.count();
    const sampleUser = await User.findOne();
    const hasAuthMethod = typeof sampleUser.generateAuthToken === 'function';
    const hasPasswordMethod = typeof sampleUser.comparePassword === 'function';
    
    tests.push({
      entity: 'Users',
      count: userCount,
      authMethod: hasAuthMethod,
      passwordMethod: hasPasswordMethod,
      status: userCount > 0 && hasAuthMethod && hasPasswordMethod
    });
    
    log(`  Records: ${userCount}`, 'yellow');
    log(`  generateAuthToken: ${hasAuthMethod ? '✅' : '❌'}`, hasAuthMethod ? 'green' : 'red');
    log(`  comparePassword: ${hasPasswordMethod ? '✅' : '❌'}`, hasPasswordMethod ? 'green' : 'red');
  } catch (err) {
    log(`  ❌ Error: ${err.message}`, 'red');
    tests.push({ entity: 'Users', status: false, error: err.message });
  }
  
  // Test Doctors
  log('\n👨‍⚕️ Testing Doctors...', 'cyan');
  try {
    const doctorCount = await Doctor.count();
    const sampleDoctor = await Doctor.findOne();
    const hasAuthMethod = typeof sampleDoctor.generateAuthToken === 'function';
    const hasPasswordMethod = typeof sampleDoctor.comparePassword === 'function';
    
    tests.push({
      entity: 'Doctors',
      count: doctorCount,
      authMethod: hasAuthMethod,
      passwordMethod: hasPasswordMethod,
      status: doctorCount > 0 && hasAuthMethod && hasPasswordMethod
    });
    
    log(`  Records: ${doctorCount}`, 'yellow');
    log(`  generateAuthToken: ${hasAuthMethod ? '✅' : '❌'}`, hasAuthMethod ? 'green' : 'red');
    log(`  comparePassword: ${hasPasswordMethod ? '✅' : '❌'}`, hasPasswordMethod ? 'green' : 'red');
  } catch (err) {
    log(`  ❌ Error: ${err.message}`, 'red');
    tests.push({ entity: 'Doctors', status: false, error: err.message });
  }
  
  // Test Corporates
  log('\n🏢 Testing Corporates...', 'cyan');
  try {
    const corpCount = await Corporate.count();
    const sampleCorp = await Corporate.findOne();
    const hasEmailMethod = typeof Corporate.findByEmail === 'function';
    const hasActiveMethod = sampleCorp && typeof sampleCorp.isActive === 'function';
    
    tests.push({
      entity: 'Corporates',
      count: corpCount,
      findByEmail: hasEmailMethod,
      isActive: hasActiveMethod,
      status: corpCount > 0 && hasEmailMethod
    });
    
    log(`  Records: ${corpCount}`, 'yellow');
    log(`  findByEmail: ${hasEmailMethod ? '✅' : '❌'}`, hasEmailMethod ? 'green' : 'red');
    log(`  isActive: ${hasActiveMethod ? '✅' : '❌'}`, hasActiveMethod ? 'green' : 'red');
  } catch (err) {
    log(`  ❌ Error: ${err.message}`, 'red');
    tests.push({ entity: 'Corporates', status: false, error: err.message });
  }
  
  // Test Nurses
  log('\n👨‍⚕️ Testing Nurses...', 'cyan');
  try {
    const nurseCount = await Nurse.count();
    const sampleNurse = await Nurse.findOne();
    const hasAuthMethod = typeof sampleNurse.generateAuthToken === 'function';
    const hasPasswordMethod = typeof sampleNurse.comparePassword === 'function';
    const hasAvailableMethod = typeof sampleNurse.isAvailable === 'function';
    
    tests.push({
      entity: 'Nurses',
      count: nurseCount,
      authMethod: hasAuthMethod,
      passwordMethod: hasPasswordMethod,
      isAvailable: hasAvailableMethod,
      status: nurseCount > 0 && hasAuthMethod && hasPasswordMethod
    });
    
    log(`  Records: ${nurseCount}`, 'yellow');
    log(`  generateAuthToken: ${hasAuthMethod ? '✅' : '❌'}`, hasAuthMethod ? 'green' : 'red');
    log(`  comparePassword: ${hasPasswordMethod ? '✅' : '❌'}`, hasPasswordMethod ? 'green' : 'red');
    log(`  isAvailable: ${hasAvailableMethod ? '✅' : '❌'}`, hasAvailableMethod ? 'green' : 'red');
  } catch (err) {
    log(`  ❌ Error: ${err.message}`, 'red');
    tests.push({ entity: 'Nurses', status: false, error: err.message });
  }
  
  // Test Doctor Assistants
  log('\n👔 Testing Doctor Assistants...', 'cyan');
  try {
    const asstCount = await DoctorAssistant.count();
    const sampleAsst = await DoctorAssistant.findOne();
    const hasAuthMethod = typeof sampleAsst.generateAuthToken === 'function';
    const hasPasswordMethod = typeof sampleAsst.comparePassword === 'function';
    const hasPermissionMethod = typeof sampleAsst.hasPermission === 'function';
    
    tests.push({
      entity: 'Doctor Assistants',
      count: asstCount,
      authMethod: hasAuthMethod,
      passwordMethod: hasPasswordMethod,
      hasPermission: hasPermissionMethod,
      status: asstCount > 0 && hasAuthMethod && hasPasswordMethod
    });
    
    log(`  Records: ${asstCount}`, 'yellow');
    log(`  generateAuthToken: ${hasAuthMethod ? '✅' : '❌'}`, hasAuthMethod ? 'green' : 'red');
    log(`  comparePassword: ${hasPasswordMethod ? '✅' : '❌'}`, hasPasswordMethod ? 'green' : 'red');
    log(`  hasPermission: ${hasPermissionMethod ? '✅' : '❌'}`, hasPermissionMethod ? 'green' : 'red');
  } catch (err) {
    log(`  ❌ Error: ${err.message}`, 'red');
    tests.push({ entity: 'Doctor Assistants', status: false, error: err.message });
  }
  
  // Summary
  log('\n═══════════════════════════════════════════════════════', 'bright');
  log('  📊 Authentication Test Summary', 'bright');
  log('═══════════════════════════════════════════════════════\n', 'bright');
  
  const passed = tests.filter(t => t.status).length;
  const total = tests.length;
  
  tests.forEach(test => {
    const status = test.status ? '✅ PASS' : '❌ FAIL';
    const color = test.status ? 'green' : 'red';
    log(`  ${test.entity.padEnd(20)} ${status}`, color);
  });
  
  log('\n' + '─'.repeat(55), 'cyan');
  log(`  Total: ${passed}/${total} passed`, passed === total ? 'green' : 'yellow');
  
  if (passed === total) {
    log('\n✅ All authentication tests passed!', 'green');
    log('   All user types can authenticate with PostgreSQL.\n', 'green');
  } else {
    log('\n⚠️  Some authentication tests failed', 'yellow');
    log('   Review errors above for details.\n', 'yellow');
  }
  
  process.exit(passed === total ? 0 : 1);
}

testAuthentication().catch(err => {
  log(`\n❌ Test failed: ${err.message}`, 'red');
  console.error(err);
  process.exit(1);
});
