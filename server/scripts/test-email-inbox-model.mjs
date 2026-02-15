#!/usr/bin/env node

import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverDir = '/home/ubuntu/Mediczy/server';

dotenv.config({ path: path.join(serverDir, '.env') });

// Import EmailInbox model
const { default: models } = await import(path.join(serverDir, 'models/index.js'));
const EmailInbox = models.EmailInbox || (await import(path.join(serverDir, 'models/emailInbox.model.js')));

console.log('🧪 Testing EmailInbox model\n');

// Test 1: Check model
console.log('📋 EmailInbox model info:');
console.log('   Model name:', EmailInbox.name);
console.log('   Table name:', EmailInbox.tableName);

// Test 2: Try to query
console.log('\n🔍 Querying email inboxes...\n');
try {
  const count = await EmailInbox.count({ where: { teamMemberId: 110 } });
  console.log('✅ Count query successful');
  console.log('   Team member 110 inbox count:', count);
} catch (error) {
  console.error('❌ Count query failed:', error.message);
  console.error('   Stack:', error.stack.substring(0, 200));
}

// Test 3: Try findAll
console.log('\n🔍 Fetching email inboxes...\n');
try {
  const emails = await EmailInbox.findAll({ where: { teamMemberId: 110 }, limit: 5 });
  console.log('✅ FindAll query successful');
  console.log('   Found emails:', emails.length);
} catch (error) {
  console.error('❌ FindAll query failed:', error.message);
}

process.exit(0);
