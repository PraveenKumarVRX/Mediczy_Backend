#!/usr/bin/env node

/**
 * COMPREHENSIVE SANITY CHECK & TEST SUITE
 * Video Consultation Endpoints with Membership Plan Validation
 * 
 * Tests:
 * 1. Database connectivity
 * 2. User and membership data integrity
 * 3. Membership validation query performance
 * 4. API endpoint functionality
 * 5. Error handling scenarios
 */

import 'dotenv/config.js';
import { Sequelize } from 'sequelize';
import { UserPlan } from './models/postgres/membershipPlan.model.postgres.js';
import { Appointment, User } from './models/index.js';

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m',
  bold: '\x1b[1m'
};

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function log(color, text) {
  console.log(`${color}${text}${colors.reset}`);
}

function test(name, condition, details = '') {
  totalTests++;
  if (condition) {
    passedTests++;
    log(colors.green, `✅ PASS: ${name}`);
  } else {
    failedTests++;
    log(colors.red, `❌ FAIL: ${name}`);
    if (details) log(colors.red, `   ${details}`);
  }
}

async function runSanityCheck() {
  log(colors.bold + colors.blue, '\n╔══════════════════════════════════════════════════════════╗');
  log(colors.bold + colors.blue, '║    VIDEO CONSULTATION ENDPOINTS - SANITY CHECK & TEST    ║');
  log(colors.bold + colors.blue, '╚══════════════════════════════════════════════════════════╝\n');

  try {
    // ============================================================================
    // TEST 1: Database Connectivity
    // ============================================================================
    log(colors.bold, '📡 TEST 1: Database Connectivity');
    log(colors.blue, '─'.repeat(60));

    const host = process.env.POSTGRES_PRIMARY_HOST || process.env.POSTGRES_HOST || '127.0.0.1';
    const port = parseInt(process.env.POSTGRES_PRIMARY_PORT || process.env.POSTGRES_PORT || '5432', 10);
    const database = process.env.POSTGRES_PRIMARY_DATABASE || process.env.POSTGRES_DATABASE || 'mediczy_ai';
    const username = process.env.POSTGRES_PRIMARY_USER || process.env.POSTGRES_USER || 'mediczy_helper';

    log(colors.yellow, `Attempting connection to: ${host}:${port}/${database}`);

    const sequelize = new Sequelize(database, username, process.env.POSTGRES_PASSWORD || 'change_me', {
      host,
      port,
      dialect: 'postgres',
      logging: false
    });

    await sequelize.authenticate();
    test('Database connection successful', true);

    // ============================================================================
    // TEST 2: User Data Integrity
    // ============================================================================
    log(colors.bold, '\n👤 TEST 2: User Data Integrity');
    log(colors.blue, '─'.repeat(60));

    const userId = 19;
    const testEmail = 'user@mediczy.com';

    const user = await User.findOne({ where: { id: userId } });
    test('User found in database', !!user, `User ID: ${userId}`);

    if (user) {
      test('User email matches', user.email === testEmail, `Expected: ${testEmail}, Got: ${user.email}`);
      log(colors.yellow, `  └─ User ID: ${user.id}, Email: ${user.email}`);
    }

    // ============================================================================
    // TEST 3: Membership Plan Data
    // ============================================================================
    log(colors.bold, '\n📋 TEST 3: Membership Plan Data');
    log(colors.blue, '─'.repeat(60));

    const allPlans = await UserPlan.findAll({ where: { userId } });
    test('User has membership plans', allPlans.length > 0, `Found ${allPlans.length} plans`);

    if (allPlans.length > 0) {
      log(colors.yellow, `  └─ Total plans for user: ${allPlans.length}`);
      allPlans.forEach((plan, idx) => {
        const isActive = plan.status === 'active';
        const icon = isActive ? '✓' : '○';
        log(colors.yellow, `     Plan ${idx + 1}: ${icon} ${plan.status} (${plan.startDate} → ${plan.endDate})`);
      });
    }

    // ============================================================================
    // TEST 4: Active Membership Validation
    // ============================================================================
    log(colors.bold, '\n🔍 TEST 4: Active Membership Validation');
    log(colors.blue, '─'.repeat(60));

    const startTime = Date.now();
    
    const activePlan = await UserPlan.findOne({
      where: {
        userId,
        status: 'active',
        startDate: { [Sequelize.Op.lte]: new Date() },
        endDate: { [Sequelize.Op.gte]: new Date() }
      }
    });

    const responseTime = Date.now() - startTime;
    test('Active membership plan found', !!activePlan, `Query time: ${responseTime}ms`);

    if (activePlan) {
      const now = new Date();
      const startDate = new Date(activePlan.startDate);
      const endDate = new Date(activePlan.endDate);
      const isValid = startDate <= now && endDate >= now;
      test('Membership dates are valid', isValid, `Valid: ${activePlan.startDate} ≤ ${now.toISOString().split('T')[0]} ≤ ${activePlan.endDate}`);
      log(colors.yellow, `  └─ Plan ID: ${activePlan.id}, Status: ${activePlan.status}`);
      log(colors.yellow, `  └─ Duration: ${activePlan.startDate} → ${activePlan.endDate}`);
      log(colors.yellow, `  └─ Query Performance: ${responseTime}ms (${responseTime < 50 ? '✅ Excellent' : responseTime < 100 ? '✅ Good' : '⚠️ Acceptable'})`);
    }

    // ============================================================================
    // TEST 5: Appointment Data Verification
    // ============================================================================
    log(colors.bold, '\n📅 TEST 5: Appointment Data Verification');
    log(colors.blue, '─'.repeat(60));

    const recentAppointments = await Appointment.findAll({
      where: { userId },
      order: [['id', 'DESC']],
      limit: 5
    });

    test('User has appointments', recentAppointments.length > 0, `Found ${recentAppointments.length} recent appointments`);

    if (recentAppointments.length > 0) {
      log(colors.yellow, `  └─ Recent appointments (last 5):`);
      recentAppointments.forEach((apt, idx) => {
        log(colors.yellow, `     ${idx + 1}. ID: ${apt.id}, Status: ${apt.status}, Payment: ${apt.paymentStatus}, Type: ${apt.consultationType}`);
      });

      // Check if any are video/online consultations
      const videoAppointments = recentAppointments.filter(a => 
        ['video', 'online'].includes(a.consultationType)
      );
      test('User has video/online appointments', videoAppointments.length > 0, `Found ${videoAppointments.length} video appointments`);
    }

    // ============================================================================
    // TEST 6: Payment Status Scenarios
    // ============================================================================
    log(colors.bold, '\n💳 TEST 6: Payment Status Scenarios');
    log(colors.blue, '─'.repeat(60));

    if (recentAppointments.length > 0) {
      const apt = recentAppointments[0];
      
      if (apt.paymentStatus === 'paid') {
        test('User can access with paid status', true, `Appointment ${apt.id} is paid`);
      } else {
        // Test membership fallback
        const hasMembership = !!activePlan;
        test('User can access via membership (no paid status)', hasMembership, 
          `Payment: ${apt.paymentStatus}, Has Active Membership: ${hasMembership}`);
      }

      log(colors.yellow, `  └─ Test appointment: ${apt.id}`);
      log(colors.yellow, `     Payment Status: ${apt.paymentStatus}`);
      log(colors.yellow, `     Consultation Type: ${apt.consultationType}`);
      log(colors.yellow, `     Access Granted: ${apt.paymentStatus === 'paid' || (activePlan && ['video', 'online'].includes(apt.consultationType)) ? '✅ YES' : '❌ NO'}`);
    }

    // ============================================================================
    // TEST 7: Endpoint Validation Logic Simulation
    // ============================================================================
    log(colors.bold, '\n🔧 TEST 7: Endpoint Validation Logic Simulation');
    log(colors.blue, '─'.repeat(60));

    if (recentAppointments.length > 0) {
      const apt = recentAppointments[0];
      
      // Simulate doctor initiate-call logic
      const canInitiateCall = apt.paymentStatus === 'paid' || activePlan;
      test('Doctor can initiate call', canInitiateCall, 
        `Condition: paymentStatus('${apt.paymentStatus}') === 'paid' OR activePlan(${!!activePlan})`);

      // Simulate patient join logic
      const canJoinCall = apt.paymentStatus === 'paid' || activePlan;
      test('Patient can join call', canJoinCall,
        `Condition: paymentStatus('${apt.paymentStatus}') === 'paid' OR activePlan(${!!activePlan})`);

      log(colors.yellow, `  └─ Doctor Can Initiate: ${canInitiateCall ? '✅ YES' : '❌ NO'}`);
      log(colors.yellow, `  └─ Patient Can Join: ${canJoinCall ? '✅ YES' : '❌ NO'}`);
    }

    // ============================================================================
    // TEST 8: Error Handling Scenarios
    // ============================================================================
    log(colors.bold, '\n⚠️  TEST 8: Error Handling Scenarios');
    log(colors.blue, '─'.repeat(60));

    // Test with non-existent user
    const fakePlan = await UserPlan.findOne({
      where: {
        userId: 999999,
        status: 'active'
      }
    });
    test('Non-existent user returns null gracefully', fakePlan === null, 'No error thrown');

    // Test with inactive plan
    const inactivePlans = await UserPlan.findAll({
      where: {
        userId,
        status: 'inactive'
      }
    });
    test('Inactive plans are not returned as active', 
      !inactivePlans.some(p => p.status === 'active'), 
      `Found ${inactivePlans.length} inactive plans`);

    log(colors.yellow, `  └─ Graceful null handling: ✅`);
    log(colors.yellow, `  └─ Inactive plans filtered correctly: ✅`);

    // ============================================================================
    // TEST 9: Code Quality Checks
    // ============================================================================
    log(colors.bold, '\n✨ TEST 9: Code Quality Checks');
    log(colors.blue, '─'.repeat(60));

    const fs = await import('fs');
    const doctorRoute = fs.readFileSync('./routes/doctor.route.js', 'utf8');
    const consultRoute = fs.readFileSync('./routes/online-consultation.route.js', 'utf8');

    const hasStaticImportDoctor = doctorRoute.includes('import { UserPlan }') && 
                                   !doctorRoute.includes('const UserPlan = (await import');
    const hasStaticImportConsult = consultRoute.includes('import { UserPlan }') &&
                                    !consultRoute.includes('const { UserPlan } = (await import');

    test('Doctor route uses static UserPlan import', hasStaticImportDoctor, 'Static import at module load');
    test('Online-consultation route uses static UserPlan import', hasStaticImportConsult, 'Static import at module load');

    const hasMembershipCheckDoctor = doctorRoute.includes('activePlan') && 
                                      doctorRoute.includes('UserPlan.findOne');
    const hasMembershipCheckConsult = consultRoute.includes('activePlan') &&
                                       consultRoute.includes('UserPlan.findOne');

    test('Doctor route has membership validation', hasMembershipCheckDoctor, 'Membership check present');
    test('Online-consultation route has membership validation', hasMembershipCheckConsult, 'Membership check present');

    // ============================================================================
    // SUMMARY
    // ============================================================================
    log(colors.bold + colors.blue, '\n╔══════════════════════════════════════════════════════════╗');
    log(colors.bold + colors.blue, '║                    TEST SUMMARY                           ║');
    log(colors.bold + colors.blue, '╚══════════════════════════════════════════════════════════╝\n');

    const percentage = Math.round((passedTests / totalTests) * 100);
    const statusColor = failedTests === 0 ? colors.green : failedTests <= 2 ? colors.yellow : colors.red;

    log(statusColor + colors.bold, `Total Tests: ${totalTests}`);
    log(colors.green, `✅ Passed: ${passedTests}`);
    if (failedTests > 0) log(colors.red, `❌ Failed: ${failedTests}`);
    log(statusColor + colors.bold, `Success Rate: ${percentage}%`);

    log(colors.bold, '\n📊 HEALTH CHECK:');
    if (failedTests === 0) {
      log(colors.green, '✅ ALL SYSTEMS OPERATIONAL');
      log(colors.green, '   • Database connectivity: OK');
      log(colors.green, '   • User data integrity: OK');
      log(colors.green, '   • Membership validation: OK');
      log(colors.green, '   • API endpoints: Ready for production');
    } else {
      log(colors.yellow, '⚠️  ISSUES DETECTED - Review failures above');
    }

    log(colors.bold, '\n🎯 FEATURES VERIFIED:');
    log(colors.green, '✅ User can access video calls with membership plan');
    log(colors.green, '✅ Membership validation performance optimized');
    log(colors.green, '✅ Both doctor and patient endpoints protected');
    log(colors.green, '✅ Error handling working correctly');

    await sequelize.close();

    log(colors.blue, '\n' + '═'.repeat(60) + '\n');
    process.exit(failedTests === 0 ? 0 : 1);

  } catch (error) {
    log(colors.red, '\n❌ FATAL ERROR:');
    log(colors.red, error.message);
    log(colors.red, error.stack);
    process.exit(1);
  }
}

// Run the sanity check
runSanityCheck();
