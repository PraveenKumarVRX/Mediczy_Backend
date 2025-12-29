#!/bin/bash

# Production Password Reset Script
# Safely updates user passwords in production database

echo "🔐 Production Password Reset Utility"
echo "======================================"
echo ""

# Check if NODE_ENV is set to production
if [ "$NODE_ENV" != "production" ]; then
  echo "⚠️  WARNING: NODE_ENV is not set to 'production'"
  echo "Current NODE_ENV: $NODE_ENV"
  echo "Script will continue, but verify you're targeting the correct database!"
  read -p "Continue? (yes/no) " -r
  if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
    echo "Aborted."
    exit 1
  fi
fi

EMAIL="${1:-user@mediczy.com}"
PASSWORD="${2:-User123}"

echo "Target Email: $EMAIL"
echo "New Password: (hidden)"
echo ""

node << EOF
import postgresSequelize from './server/db/postgres-sequelize.js';
import bcrypt from 'bcrypt';

(async () => {
  try {
    console.log('⏳ Processing...');
    
    // Verify user exists first
    const [existing] = await postgresSequelize.query(
      'SELECT id, email FROM users WHERE LOWER(email) = LOWER(?)',
      {
        replacements: ['$EMAIL'],
        type: 'SELECT'
      }
    );
    
    if (!existing || existing.length === 0) {
      console.error('❌ User not found:', '$EMAIL');
      process.exit(1);
    }
    
    const userId = existing[0].id;
    console.log('✓ User found (ID:', userId + ')');
    
    // Hash the password
    const hashedPassword = await bcrypt.hash('$PASSWORD', 10);
    console.log('✓ Password hashed');
    
    // Update password
    await postgresSequelize.query(
      'UPDATE users SET password = ? WHERE id = ?',
      {
        replacements: [hashedPassword, userId],
        type: 'UPDATE'
      }
    );
    
    console.log('✅ Password updated successfully for:', '$EMAIL');
    
    // Verify update
    const [updated] = await postgresSequelize.query(
      'SELECT id, email, SUBSTRING(password, 1, 30) as pwd_preview FROM users WHERE id = ?',
      {
        replacements: [userId],
        type: 'SELECT'
      }
    );
    
    if (updated && updated.length > 0) {
      console.log('   Email:', updated[0].email);
      console.log('   Hash:', updated[0].pwd_preview + '...');
    }
    
    await postgresSequelize.close();
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
})();
EOF
