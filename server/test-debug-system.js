/**
 * Quick Debug Test
 * Run this to verify the debugging system works
 */

import { logger, dbLogger, apiLogger } from './utils/logger.js';
import { debug, createDebugger } from './utils/debugger.js';

console.log('\n🐛 Testing Mediczy Debugging System\n');
console.log('═'.repeat(60));

// Test 1: Basic Logging
console.log('\n1️⃣  Testing Basic Logging:');
logger.error('This is an ERROR message', { testId: 1 });
logger.warn('This is a WARN message', { testId: 2 });
logger.info('This is an INFO message', { testId: 3 });
logger.debug('This is a DEBUG message', { testId: 4 });

// Test 2: Specialized Loggers
console.log('\n2️⃣  Testing Specialized Loggers:');
dbLogger.debug('Database query executed', { query: 'SELECT * FROM users', duration: 45 });
apiLogger.info('API request handled', { endpoint: '/api/test', status: 200 });

// Test 3: Performance Timing
console.log('\n3️⃣  Testing Performance Timing:');
debug.time('test-operation');
setTimeout(() => {
    debug.timeEnd('test-operation');
}, 100);

// Test 4: Memory Monitoring
setTimeout(() => {
    console.log('\n4️⃣  Testing Memory Monitoring:');
    debug.memory('Current Memory Usage');
}, 150);

// Test 5: Counters
setTimeout(() => {
    console.log('\n5️⃣  Testing Counters:');
    debug.count('test-counter');
    debug.count('test-counter');
    debug.count('test-counter');
}, 200);

// Test 6: Object Inspection
setTimeout(() => {
    console.log('\n6️⃣  Testing Object Inspection:');
    const testObject = {
        user: { id: 123, name: 'John Doe', role: 'admin' },
        settings: { theme: 'dark', notifications: true }
    };
    debug.inspect(testObject, 'Test Object');
}, 250);

// Test 7: Child Debugger
setTimeout(() => {
    console.log('\n7️⃣  Testing Child Debuggers:');
    const paymentDebug = createDebugger('PAYMENT');
    const stripeDebug = paymentDebug.child('STRIPE');

    paymentDebug.log('Processing payment');
    stripeDebug.log('Calling Stripe API');
}, 300);

// Test 8: Function Tracing
setTimeout(async () => {
    console.log('\n8️⃣  Testing Function Tracing:');

    const testFunction = debug.traceFunction(async (userId) => {
        await new Promise(resolve => setTimeout(resolve, 50));
        return { success: true, userId };
    }, 'testFunction');

    await testFunction(123);
}, 350);

// Final message
setTimeout(() => {
    console.log('\n' + '═'.repeat(60));
    console.log('✅ Debugging System Test Complete!');
    console.log('\nCheck the logs directory for log files:');
    console.log('  - logs/server-*.log');
    console.log('  - logs/database-*.log');
    console.log('  - logs/api-*.log');
    console.log('\n' + '═'.repeat(60) + '\n');

    process.exit(0);
}, 500);
