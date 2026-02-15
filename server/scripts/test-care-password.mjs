#!/usr/bin/env node

import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverDir = '/home/ubuntu/Mediczy/server';

dotenv.config({ path: path.join(serverDir, '.env') });

// Now import models using default export
const { default: models } = await import(path.join(serverDir, 'models/index.js'));
const { User } = models;

async function testLogin() {
  try {
    const user = await User.findOne({ where: { email: 'care@mysmarthealth.in' } });
    
    if (!user) {
      console.log('❌ User not found');
      return;
    }

    console.log('✅ User found:', user.email);
    console.log('   Password hash length:', user.password.length);
    
    // Test password comparison
    const password = 'Mayden@2025';
    const isValid = await user.comparePassword(password);
    
    console.log('   Password valid:', isValid);
    console.log(`   Attempting to match: "${password}"`);
    
    if (!isValid) {
      console.log('❌ Password mismatch!');
      console.log('\nTrying to update the password...');
      
      // Try re-hashing and updating
      user.password = password; // This will trigger the beforeSave hook if it exists
      await user.save();
      
      console.log('✅ Password updated');
      
      // Test again
      const user2 = await User.findOne({ where: { email: 'care@mysmarthealth.in' } });
      const isValid2 = await user2.comparePassword(password);
      console.log('   New password valid:', isValid2);
    } else {
      console.log('✅ Login test successful!');
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testLogin().then(() => process.exit(0));
