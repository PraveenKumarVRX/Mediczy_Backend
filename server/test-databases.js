#!/usr/bin/env node

import { initAllDatabases, closeAllDatabases } from './config/databases.js';

console.log('🧪 Testing Multi-Database Architecture\n');
console.log('='.repeat(60));

(async () => {
  try {
    const results = await initAllDatabases();
    
    console.log('='.repeat(60));
    console.log('\n✅ Database testing complete!\n');
    
    await closeAllDatabases();
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Testing failed:', error.message);
    process.exit(1);
  }
})();
