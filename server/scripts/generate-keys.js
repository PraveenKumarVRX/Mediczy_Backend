#!/usr/bin/env node

/**
 * Encryption Key Generator
 * 
 * Generates secure encryption keys for the application.
 * Run this script to create keys for your .env file.
 */

import crypto from 'crypto';

console.log('\n🔐 Encryption Key Generator\n');
console.log('━'.repeat(60));

// Generate JWT Secret Token (64 bytes)
const jwtSecret = crypto.randomBytes(64).toString('hex');
console.log('\n1. JWT SECRET_TOKEN (128 characters):');
console.log('   Add to .env as:');
console.log(`   SECRET_TOKEN=${jwtSecret}`);

// Generate Encryption Key (32 bytes for AES-256)
const encryptionKey = crypto.randomBytes(32).toString('hex');
console.log('\n2. ENCRYPTION_KEY (64 characters):');
console.log('   Add to .env as:');
console.log(`   ENCRYPTION_KEY=${encryptionKey}`);

// Generate Session Secret (32 bytes)
const sessionSecret = crypto.randomBytes(32).toString('hex');
console.log('\n3. SESSION_SECRET (64 characters):');
console.log('   Add to .env as:');
console.log(`   SESSION_SECRET=${sessionSecret}`);

console.log('\n' + '━'.repeat(60));
console.log('\n⚠️  IMPORTANT SECURITY NOTES:');
console.log('   • NEVER commit these keys to version control');
console.log('   • Use different keys for dev/staging/production');
console.log('   • Store production keys in secure key management (AWS KMS, Azure Key Vault)');
console.log('   • Rotate keys every 90 days');
console.log('   • Keep backup of keys in secure location');
console.log('\n✅ Copy the above keys to your server/.env file\n');
