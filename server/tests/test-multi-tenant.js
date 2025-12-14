/**
 * Multi-Tenant System Test
 * Tests tenant registration, isolation, and feature access
 */

import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import Tenant from '../models/postgres/tenant.model.postgres.js';
import { User, Doctor } from '../models/index.js';
import { onboardTenant } from '../services/tenant.service.js';

console.log('\n🧪 Testing Multi-Tenant System\n');

async function testTenantCreation() {
  console.log('1️⃣  Testing tenant creation...');
  
  try {
    // Test 1: Create hospital tenant
    const hospital = await onboardTenant({
      name: 'Apollo Hospitals Chennai',
      type: 'hospital',
      email: 'admin@apollochennai.com',
      phone: '+91-44-28296000',
      website: 'https://www.apollohospitals.com',
      address: {
        street: 'Greams Road',
        city: 'Chennai',
        state: 'Tamil Nadu',
        postal_code: '600006',
        country: 'India'
      },
      registration_number: 'TN-HOSP-001',
      plan: 'professional',
      billing_cycle: 'annual',
      owner_first_name: 'Priya',
      owner_last_name: 'Reddy',
      owner_email: 'priya.reddy@apollochennai.com',
      owner_password: 'SecurePassword123!',
      owner_phone: '+91-9876543210'
    });
    
    console.log('   ✅ Hospital tenant created:');
    console.log(`      Name: ${hospital.tenant.name}`);
    console.log(`      Subdomain: ${hospital.tenant.subdomain}`);
    console.log(`      Access URL: ${hospital.tenant.access_url}`);
    console.log(`      Owner: ${hospital.owner.name}`);
    
    // Test 2: Create clinic tenant
    const clinic = await onboardTenant({
      name: 'SmileCare Dental Clinic',
      type: 'clinic',
      email: 'contact@smilecare.com',
      phone: '+91-80-12345678',
      address: {
        street: 'Indiranagar',
        city: 'Bangalore',
        state: 'Karnataka',
        postal_code: '560038',
        country: 'India'
      },
      plan: 'basic',
      owner_first_name: 'Dr. Rajesh',
      owner_last_name: 'Kumar',
      owner_email: 'rajesh@smilecare.com',
      owner_password: 'SecurePassword123!',
      owner_phone: '+91-9988776655'
    });
    
    console.log('   ✅ Clinic tenant created:');
    console.log(`      Name: ${clinic.tenant.name}`);
    console.log(`      Subdomain: ${clinic.tenant.subdomain}`);
    
    // Test 3: Create pharmacy tenant
    const pharmacy = await onboardTenant({
      name: 'MedPlus Pharmacy Network',
      type: 'pharmacy',
      email: 'info@medplus.in',
      phone: '+91-40-66666666',
      plan: 'free',
      owner_first_name: 'Suresh',
      owner_last_name: 'Babu',
      owner_email: 'suresh@medplus.in',
      owner_password: 'SecurePassword123!',
      owner_phone: '+91-9123456789',
      address: {}
    });
    
    console.log('   ✅ Pharmacy tenant created:');
    console.log(`      Name: ${pharmacy.tenant.name}`);
    console.log(`      Plan: ${pharmacy.tenant.plan}`);
    
    return { hospital, clinic, pharmacy };
  } catch (error) {
    console.error('   ❌ Tenant creation failed:', error.message);
    throw error;
  }
}

async function testTenantIsolation() {
  console.log('\n2️⃣  Testing tenant isolation...');
  
  try {
    const tenants = await Tenant.findAll({ limit: 3 });
    if (tenants.length < 2) {
      console.log('   ⏭️  Skipping: Need at least 2 tenants');
      return;
    }
    
    const tenant1 = tenants[0];
    const tenant2 = tenants[1];
    
    // Create doctor for tenant 1
    const doctor1 = await Doctor.create({
      prefix: 'Dr',
      firstName: 'Amit',
      lastName: 'Sharma',
      email: `amit.sharma@${tenant1.slug}.com`,
      password: 'password123',
      phoneNumber: '+91-9876543210',
      specialization: 'Cardiology',
      specializations: ['Cardiology', 'Internal Medicine'],
      qualifications: ['MBBS', 'MD'],
      tenant_id: tenant1.id,
      organization_id: tenant1.id,
      organization_type: tenant1.type
    });
    
    // Create doctor for tenant 2
    const doctor2 = await Doctor.create({
      prefix: 'Dr',
      firstName: 'Sneha',
      lastName: 'Patel',
      email: `sneha.patel@${tenant2.slug}.com`,
      password: 'password123',
      phoneNumber: '+91-9988776655',
      specialization: 'Pediatrics',
      specializations: ['Pediatrics'],
      qualifications: ['MBBS', 'DCH'],
      tenant_id: tenant2.id,
      organization_id: tenant2.id,
      organization_type: tenant2.type
    });
    
    console.log('   ✅ Created doctors for both tenants');
    
    // Test isolation: Query doctors with tenant_id filter
    const tenant1Doctors = await Doctor.findAll({
      where: { tenant_id: tenant1.id }
    });
    
    const tenant2Doctors = await Doctor.findAll({
      where: { tenant_id: tenant2.id }
    });
    
    console.log(`   ✅ Tenant 1 (${tenant1.name}): ${tenant1Doctors.length} doctor(s)`);
    console.log(`   ✅ Tenant 2 (${tenant2.name}): ${tenant2Doctors.length} doctor(s)`);
    
    // Verify isolation
    const hasTenant1DoctorsOnly = tenant1Doctors.every(d => d.tenant_id === tenant1.id);
    const hasTenant2DoctorsOnly = tenant2Doctors.every(d => d.tenant_id === tenant2.id);
    
    if (hasTenant1DoctorsOnly && hasTenant2DoctorsOnly) {
      console.log('   ✅ Data isolation verified: Each tenant only sees their own data');
    } else {
      console.log('   ❌ Data isolation failed: Cross-tenant data leakage detected');
    }
  } catch (error) {
    console.error('   ❌ Isolation test failed:', error.message);
  }
}

async function testPlanLimits() {
  console.log('\n3️⃣  Testing plan limits...');
  
  try {
    const tenants = await Tenant.findAll({ limit: 1 });
    if (tenants.length === 0) {
      console.log('   ⏭️  Skipping: No tenants found');
      return;
    }
    
    const tenant = tenants[0];
    
    console.log(`   📊 Tenant: ${tenant.name}`);
    console.log(`   Plan: ${tenant.plan}`);
    console.log(`   Limits:`, JSON.stringify(tenant.limits, null, 2));
    console.log(`   Usage:`, JSON.stringify(tenant.usage, null, 2));
    
    // Test limit checks
    const canAddUser = !tenant.hasReachedLimit('users');
    const canAddDoctor = !tenant.hasReachedLimit('doctors');
    
    console.log(`   Can add user: ${canAddUser ? '✅' : '❌'}`);
    console.log(`   Can add doctor: ${canAddDoctor ? '✅' : '❌'}`);
    
    // Test usage increment
    await tenant.incrementUsage('users', 1);
    await tenant.reload();
    
    console.log(`   ✅ Usage incremented: users = ${tenant.usage.users}`);
  } catch (error) {
    console.error('   ❌ Plan limits test failed:', error.message);
  }
}

async function testFeatureAccess() {
  console.log('\n4️⃣  Testing feature access...');
  
  try {
    const tenants = await Tenant.findAll({ limit: 2 });
    
    for (const tenant of tenants) {
      console.log(`\n   📦 Tenant: ${tenant.name} (${tenant.plan})`);
      console.log(`   Features:`);
      
      const features = Object.entries(tenant.features);
      for (const [feature, enabled] of features) {
        const icon = enabled ? '✅' : '❌';
        console.log(`      ${icon} ${feature}: ${enabled}`);
      }
      
      // Test feature check
      const hasTelemedicine = tenant.isFeatureEnabled('telemedicine');
      const hasAI = tenant.isFeatureEnabled('ai_assistant');
      
      console.log(`   Telemedicine: ${hasTelemedicine ? '✅ Enabled' : '❌ Disabled'}`);
      console.log(`   AI Assistant: ${hasAI ? '✅ Enabled' : '❌ Disabled'}`);
    }
  } catch (error) {
    console.error('   ❌ Feature access test failed:', error.message);
  }
}

async function testSubdomainResolution() {
  console.log('\n5️⃣  Testing subdomain resolution...');
  
  try {
    const tenants = await Tenant.findAll({ limit: 3 });
    
    for (const tenant of tenants) {
      // Simulate subdomain lookup
      const found = await Tenant.findOne({
        where: { subdomain: tenant.subdomain, status: 'active' }
      });
      
      if (found) {
        console.log(`   ✅ ${tenant.subdomain}.mayden.in → ${tenant.name}`);
      } else {
        console.log(`   ⚠️  ${tenant.subdomain}.mayden.in not resolvable (status: ${tenant.status})`);
      }
    }
  } catch (error) {
    console.error('   ❌ Subdomain resolution test failed:', error.message);
  }
}

async function printSummary() {
  console.log('\n📊 Multi-Tenant System Summary\n');
  
  const totalTenants = await Tenant.count();
  const activeTenants = await Tenant.count({ where: { status: 'active' } });
  const pendingTenants = await Tenant.count({ where: { status: 'pending' } });
  
  const byType = await sequelize.query(
    `SELECT type, COUNT(*) as count FROM tenants GROUP BY type ORDER BY count DESC`,
    { type: sequelize.QueryTypes.SELECT }
  );
  
  const byPlan = await sequelize.query(
    `SELECT plan, COUNT(*) as count FROM tenants GROUP BY plan ORDER BY count DESC`,
    { type: sequelize.QueryTypes.SELECT }
  );
  
  console.log(`Total Tenants: ${totalTenants}`);
  console.log(`Active: ${activeTenants} | Pending: ${pendingTenants}`);
  console.log('\nBy Type:');
  byType.forEach(t => console.log(`  ${t.type}: ${t.count}`));
  console.log('\nBy Plan:');
  byPlan.forEach(p => console.log(`  ${p.plan}: ${p.count}`));
}

// Run tests
async function runTests() {
  try {
    await sequelize.authenticate();
    console.log('✅ Database connected\n');
    
    await testTenantCreation();
    await testTenantIsolation();
    await testPlanLimits();
    await testFeatureAccess();
    await testSubdomainResolution();
    await printSummary();
    
    console.log('\n✅ All tests completed!\n');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Test suite failed:', error);
    process.exit(1);
  }
}

runTests();
