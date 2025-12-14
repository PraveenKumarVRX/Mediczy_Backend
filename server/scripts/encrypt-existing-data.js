import { encrypt, decrypt, maskData } from '../utils/encryption.js';
import User from '../models/user.model.mariadb.js';

/**
 * Data Migration Script - Encrypt Existing Sensitive Data
 * 
 * IMPORTANT: Run this ONCE after setting ENCRYPTION_KEY
 * This will encrypt all existing unencrypted sensitive data in the database.
 * 
 * Usage:
 *   node scripts/encrypt-existing-data.js
 */

async function encryptExistingUserData() {
  console.log('🔐 Starting encryption of existing user data...\n');
  
  if (!process.env.ENCRYPTION_KEY) {
    console.error('❌ ERROR: ENCRYPTION_KEY not set in environment variables!');
    console.error('Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
    process.exit(1);
  }
  
  try {
    // Find all users
    const users = await User.findAll();
    console.log(`Found ${users.length} users to process\n`);
    
    let encryptedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    
    for (const user of users) {
      try {
        let needsUpdate = false;
        const updates = {};
        
        // Check and encrypt sensitive fields
        const sensitiveFields = [
          'address_street',
          'bloodType',
          'allergies',
          'chronicConditions',
          'currentMedications',
          'insurance_policyNumber',
          'insurance_groupNumber'
        ];
        
        for (const field of sensitiveFields) {
          const value = user.getDataValue(field);
          
          // Skip if empty or already encrypted (contains ':' which is our format)
          if (!value || value.includes(':')) {
            continue;
          }
          
          // Encrypt the field
          updates[field] = encrypt(value);
          needsUpdate = true;
          
          console.log(`  User ${user.id}: Encrypting ${field} (${maskData(value, 'generic')})`);
        }
        
        if (needsUpdate) {
          // Use direct update to avoid triggering setters again
          await User.update(updates, {
            where: { id: user.id },
            hooks: false // Skip hooks to avoid double encryption
          });
          
          encryptedCount++;
          console.log(`✅ User ${user.id} (${user.email}): Encrypted ${Object.keys(updates).length} fields\n`);
        } else {
          skippedCount++;
          console.log(`⏭️  User ${user.id} (${user.email}): Already encrypted or no sensitive data\n`);
        }
        
      } catch (error) {
        errorCount++;
        console.error(`❌ Error processing user ${user.id}:`, error.message, '\n');
      }
    }
    
    console.log('\n📊 Migration Summary:');
    console.log(`  ✅ Encrypted: ${encryptedCount} users`);
    console.log(`  ⏭️  Skipped: ${skippedCount} users`);
    console.log(`  ❌ Errors: ${errorCount} users`);
    console.log('\n✨ Encryption migration complete!\n');
    
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Fatal error during migration:', error);
    process.exit(1);
  }
}

// Run the migration
encryptExistingUserData();
