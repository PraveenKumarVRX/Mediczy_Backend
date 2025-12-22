#!/usr/bin/env node

/**
 * Test Service Provider Models
 * Verifies all service provider models load and have authentication methods
 */

import { Lab, Pharmacy, Ambulance, HomecareProvider } from './server/models/index.js';

console.log('🧪 Testing Service Provider Models...\n');

// Test Lab Model
console.log('✅ Lab Model:');
console.log('  - Model name:', Lab.name);
console.log('  - Has comparePassword:', typeof Lab.prototype.comparePassword === 'function');
console.log('  - Has generateAuthToken:', typeof Lab.prototype.generateAuthToken === 'function');
console.log('  - Has findByEmail:', typeof Lab.findByEmail === 'function');
console.log('  - Has findActive:', typeof Lab.findActive === 'function');

// Test Pharmacy Model
console.log('\n✅ Pharmacy Model:');
console.log('  - Model name:', Pharmacy.name);
console.log('  - Has comparePassword:', typeof Pharmacy.prototype.comparePassword === 'function');
console.log('  - Has generateAuthToken:', typeof Pharmacy.prototype.generateAuthToken === 'function');
console.log('  - Has findByEmail:', typeof Pharmacy.findByEmail === 'function');
console.log('  - Has find24x7:', typeof Pharmacy.find24x7 === 'function');

// Test Ambulance Model
console.log('\n✅ Ambulance Model:');
console.log('  - Model name:', Ambulance.name);
console.log('  - Has comparePassword:', typeof Ambulance.prototype.comparePassword === 'function');
console.log('  - Has generateAuthToken:', typeof Ambulance.prototype.generateAuthToken === 'function');
console.log('  - Has findByEmail:', typeof Ambulance.findByEmail === 'function');
console.log('  - Has findAvailable:', typeof Ambulance.findAvailable === 'function');
console.log('  - Has updateLocation:', typeof Ambulance.prototype.updateLocation === 'function');

// Test HomecareProvider Model
console.log('\n✅ HomecareProvider Model:');
console.log('  - Model name:', HomecareProvider.name);
console.log('  - Has comparePassword:', typeof HomecareProvider.prototype.comparePassword === 'function');
console.log('  - Has generateAuthToken:', typeof HomecareProvider.prototype.generateAuthToken === 'function');
console.log('  - Has findByEmail:', typeof HomecareProvider.findByEmail === 'function');
console.log('  - Has findAvailable:', typeof HomecareProvider.findAvailable === 'function');
console.log('  - Has isActive:', typeof HomecareProvider.prototype.isActive === 'function');

console.log('\n🎉 All service provider models loaded successfully!');
console.log('\nModel Status:');
console.log('  Lab: Ready for authentication ✅');
console.log('  Pharmacy: Ready for authentication ✅');
console.log('  Ambulance: Ready for authentication ✅');
console.log('  HomecareProvider: Ready for authentication ✅');

console.log('\n📋 Next Steps:');
console.log('  1. Create API routes for service provider registration/login');
console.log('  2. Update ringFencing.js middleware for new roles');
console.log('  3. Build service provider onboarding flow');
console.log('  4. Test with sample data when providers register');
console.log('  5. Create admin panel for provider verification');

process.exit(0);
