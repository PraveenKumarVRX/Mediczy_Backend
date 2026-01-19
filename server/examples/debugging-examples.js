/**
 * Example: How to use the Logger and Debugger utilities
 * This file demonstrates common debugging patterns in Mediczy
 */

import { logger, dbLogger, apiLogger, authLogger } from '../utils/logger.js';
import { debug, createDebugger } from '../utils/debugger.js';

/**
 * Example 1: Basic Logging
 */
export function basicLoggingExample() {
  // Different log levels
  logger.error('Critical error occurred', { code: 'ERR_001' });
  logger.warn('Warning: Resource usage high', { cpu: 85 });
  logger.info('User logged in', { userId: 123 });
  logger.http('GET /api/users/123');
  logger.debug('Processing data', { items: 50 });
  logger.trace('Function entry', { params: ['a', 'b'] });

  // Using specialized loggers
  dbLogger.debug('Query executed', { query: 'SELECT * FROM users', duration: 45 });
  apiLogger.info('API request successful', { endpoint: '/users', status: 200 });
  authLogger.warn('Failed login attempt', { username: 'test', ip: '1.2.3.4' });
}

/**
 * Example 2: Performance Monitoring
 */
export async function performanceMonitoringExample() {
  // Time an operation
  debug.time('database-query');
  
  // Simulating database query
  await new Promise(resolve => setTimeout(resolve, 100));
  
  debug.timeEnd('database-query'); // Logs: ⏱️ database-query: 100.xxms

  // Check memory usage
  debug.memory('Before loading data');
  
  const largeArray = new Array(1000000).fill('data');
  
  debug.memory('After loading data');
}

/**
 * Example 3: Function Tracing
 */
const processPayment = debug.traceFunction(
  async function(userId, amount) {
    logger.info('Processing payment', { userId, amount });
    
    // Simulate payment processing
    await new Promise(resolve => setTimeout(resolve, 200));
    
    if (amount > 10000) {
      throw new Error('Amount exceeds limit');
    }
    
    return { success: true, transactionId: 'TXN123' };
  },
  'processPayment'
);

export async function functionTracingExample() {
  try {
    // This will automatically log:
    // → Entering processPayment [abc123] { args: [123, 500] }
    // ⏱️ processPayment-abc123: 200.xxms
    // ← Exiting processPayment [abc123] { result: {...} }
    const result = await processPayment(123, 500);
    return result;
  } catch (error) {
    // Errors are also automatically logged with stack traces
    logger.error('Payment failed', { error: error.message });
  }
}

/**
 * Example 4: Debugging API Endpoint
 */
export async function apiEndpointExample(req, res, next) {
  const apiDebug = createDebugger('API:getUserProfile');
  
  try {
    apiDebug.log('Request received', {
      userId: req.params.id,
      query: req.query
    });
    
    apiDebug.time('fetch-user');
    
    // Simulate database fetch
    const user = { id: req.params.id, name: 'John Doe', role: 'patient' };
    
    const duration = apiDebug.timeEnd('fetch-user');
    
    apiDebug.inspect(user, 'User Object');
    
    logger.info('User profile fetched', {
      userId: user.id,
      duration
    });
    
    res.json({ success: true, data: user });
  } catch (error) {
    apiDebug.error('Failed to fetch user profile', error);
    next(error);
  }
}

/**
 * Example 5: Debugging Database Operations
 */
export async function databaseOperationExample(sql, params) {
  const dbDebug = createDebugger('DATABASE');
  
  dbDebug.time('query');
  dbDebug.log('Executing query', { sql, params });
  
  try {
    // Simulate query execution
    await new Promise(resolve => setTimeout(resolve, 50));
    const result = { rows: [], rowCount: 10 };
    
    const duration = dbDebug.timeEnd('query');
    
    dbLogger.debug('Query executed successfully', {
      sql,
      rowCount: result.rowCount,
      duration
    });
    
    return result;
  } catch (error) {
    dbLogger.error('Query failed', {
      sql,
      params,
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

/**
 * Example 6: Using Counters
 */
export function counterExample() {
  const debug = createDebugger('METRICS');
  
  // Track API calls
  debug.count('api-calls'); // 🔢 api-calls: 1
  debug.count('api-calls'); // 🔢 api-calls: 2
  debug.count('api-calls'); // 🔢 api-calls: 3
  
  // Track errors
  debug.count('errors'); // 🔢 errors: 1
  
  // Reset counter
  debug.countReset('api-calls'); // 🔄 api-calls reset to 0
}

/**
 * Example 7: Debugging Authentication
 */
export async function authenticationExample(req, res, next) {
  const authDebug = createDebugger('AUTH');
  
  authDebug.log('Verifying token', {
    hasToken: !!req.headers.authorization,
    path: req.path,
    method: req.method
  });
  
  try {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      authLogger.warn('No token provided', {
        path: req.path,
        ip: req.ip,
        userAgent: req.get('user-agent')
      });
      return res.status(401).json({ error: 'No token provided' });
    }
    
    // Inspect decoded token (simulated)
    const decoded = { userId: 123, role: 'patient', exp: Date.now() + 3600000 };
    authDebug.inspect(decoded, 'Decoded Token');
    
    req.user = decoded;
    
    authLogger.info('Token verified successfully', {
      userId: decoded.userId,
      role: decoded.role
    });
    
    next();
  } catch (error) {
    authLogger.error('Token verification failed', {
      error: error.message,
      path: req.path
    });
    res.status(401).json({ error: 'Invalid token' });
  }
}

/**
 * Example 8: Stack Traces and Assertions
 */
export function stackTraceExample(user) {
  const debug = createDebugger('VALIDATION');
  
  // Log current stack trace
  debug.trace('Checkpoint: User validation');
  
  // Assert a condition (throws if false)
  debug.assert(user && user.role, 'User must have a role');
  debug.assert(user.role === 'admin', 'User must be admin');
  
  logger.info('User validated', { userId: user.id });
}

/**
 * Example 9: Child Debuggers for Namespacing
 */
export function childDebuggerExample() {
  const paymentDebug = createDebugger('PAYMENT');
  const stripeDebug = paymentDebug.child('STRIPE');
  const paypalDebug = paymentDebug.child('PAYPAL');
  
  paymentDebug.log('Processing payment'); // Logs as [PAYMENT]
  stripeDebug.log('Calling Stripe API');  // Logs as [PAYMENT:STRIPE]
  paypalDebug.log('Calling PayPal API');  // Logs as [PAYMENT:PAYPAL]
}

/**
 * Example 10: Comprehensive API Handler with All Features
 */
export async function comprehensiveExample(req, res, next) {
  const debug = createDebugger('API:createOrder');
  const requestId = Math.random().toString(36).substring(7);
  
  debug.log(`Request [${requestId}] started`, {
    method: req.method,
    path: req.path,
    body: req.body
  });
  
  debug.time(`request-${requestId}`);
  debug.memory(`start-${requestId}`);
  
  try {
    // Validate input
    debug.assert(req.body.userId, 'userId is required');
    debug.assert(req.body.items?.length > 0, 'items are required');
    
    debug.count('order-creation-attempts');
    
    // Step 1: Validate user
    debug.time('validate-user');
    const user = await validateUser(req.body.userId);
    debug.timeEnd('validate-user');
    
    // Step 2: Process items
    debug.time('process-items');
    const processedItems = await processItems(req.body.items);
    debug.timeEnd('process-items');
    debug.inspect(processedItems, 'Processed Items');
    
    // Step 3: Create order
    debug.time('create-order');
    const order = await createOrder(user, processedItems);
    debug.timeEnd('create-order');
    
    // Step 4: Send notification
    debug.time('send-notification');
    await sendOrderNotification(order);
    debug.timeEnd('send-notification');
    
    const totalDuration = debug.timeEnd(`request-${requestId}`);
    debug.memory(`end-${requestId}`);
    
    logger.info(`Order created successfully [${requestId}]`, {
      orderId: order.id,
      userId: user.id,
      duration: totalDuration,
      itemCount: processedItems.length
    });
    
    res.json({
      success: true,
      data: order,
      meta: { requestId, duration: totalDuration }
    });
    
  } catch (error) {
    debug.error(`Request [${requestId}] failed`, error);
    debug.timeEnd(`request-${requestId}`);
    
    logger.error(`Order creation failed [${requestId}]`, {
      error: error.message,
      stack: error.stack,
      userId: req.body.userId
    });
    
    next(error);
  }
}

// Simulated helper functions
async function validateUser(userId) {
  await new Promise(resolve => setTimeout(resolve, 50));
  return { id: userId, name: 'Test User' };
}

async function processItems(items) {
  await new Promise(resolve => setTimeout(resolve, 100));
  return items.map(item => ({ ...item, processed: true }));
}

async function createOrder(user, items) {
  await new Promise(resolve => setTimeout(resolve, 150));
  return { id: 'ORD123', userId: user.id, items, total: 1000 };
}

async function sendOrderNotification(order) {
  await new Promise(resolve => setTimeout(resolve, 75));
  return { sent: true, orderId: order.id };
}
