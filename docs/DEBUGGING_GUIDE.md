# Mediczy Debugging Guide

## Table of Contents
1. [Overview](#overview)
2. [Quick Start](#quick-start)
3. [VS Code Debugging](#vs-code-debugging)
4. [Logging System](#logging-system)
5. [Debug Utilities](#debug-utilities)
6. [Common Debugging Scenarios](#common-debugging-scenarios)
7. [Performance Debugging](#performance-debugging)
8. [Troubleshooting](#troubleshooting)

---

## Overview

Mediczy now includes comprehensive debugging capabilities to help developers identify and fix issues quickly. The debugging infrastructure includes:

- **VS Code Debug Configurations** - Pre-configured launch configurations
- **Advanced Logging System** - Structured logging with multiple levels
- **Debug Utilities** - Performance monitoring, tracing, and inspection tools
- **Environment-based Configuration** - Separate dev/prod settings
- **Request Tracking** - HTTP request/response logging with timing

---

## Quick Start

### 1. Setup Development Environment

Copy the development environment file:
```bash
cp .env.development .env
```

Edit `.env` and configure your local settings (database, API keys, etc.)

### 2. Enable Debug Mode

Set these environment variables in your `.env`:
```bash
NODE_ENV=development
DEBUG=*
LOG_LEVEL=debug
```

### 3. Start Debugging

#### Option A: Use VS Code Debugger (Recommended)
1. Open VS Code
2. Press `F5` or go to Run → Start Debugging
3. Select configuration:
   - **Debug Backend (Nodemon)** - Backend with auto-reload
   - **Debug Frontend (Chrome)** - Frontend in Chrome
   - **Full Stack Debug** - Both frontend and backend
   - **Complete Application Debug** - Frontend + Backend + AI Engine

#### Option B: Use Terminal
```bash
# Backend with debug mode
cd server
DEBUG=* LOG_LEVEL=debug npm run dev:watch

# Frontend
cd client
npm run dev
```

---

## VS Code Debugging

### Available Debug Configurations

#### 1. Debug Backend (Server)
- **Use Case**: Debug Node.js backend without auto-reload
- **Breakpoints**: ✅ Supported
- **Auto-reload**: ❌ No
- **Port**: Default debugging port (9229)

#### 2. Debug Backend (Nodemon)
- **Use Case**: Debug Node.js backend with auto-reload on file changes
- **Breakpoints**: ✅ Supported
- **Auto-reload**: ✅ Yes
- **Best For**: Active development

#### 3. Debug Frontend (Chrome/Edge)
- **Use Case**: Debug React/Vite frontend
- **Breakpoints**: ✅ Supported in browser and VS Code
- **DevTools**: Available
- **Source Maps**: Enabled

#### 4. Full Stack Debug
- **Use Case**: Debug both frontend and backend simultaneously
- **Configurations**: Backend (Nodemon) + Frontend (Chrome)
- **Best For**: Full-stack feature development

#### 5. Debug AI Engine (Python)
- **Use Case**: Debug Python AI/ML components
- **Breakpoints**: ✅ Supported
- **Requires**: Python extension for VS Code

#### 6. Debug Tests
- **Use Case**: Debug Jest test cases
- **Breakpoints**: ✅ Supported in test files
- **Run Mode**: Single test execution

### Using Breakpoints

1. **Set Breakpoint**: Click left of line number in VS Code
2. **Conditional Breakpoint**: Right-click breakpoint → Edit Breakpoint
3. **Logpoint**: Right-click → Add Logpoint (non-breaking log)

Example conditional breakpoint:
```javascript
// Break only when userId is 123
userId === 123
```

### Debug Console Commands

While debugging, use the Debug Console to:
```javascript
// Inspect variables
console.log(user)

// Evaluate expressions
user.role === 'admin'

// Call functions
getUserById(123)
```

---

## Logging System

### Log Levels

The application supports 6 log levels (in order of verbosity):

1. **ERROR** - Critical errors that need immediate attention
2. **WARN** - Warning messages for potential issues
3. **INFO** - General informational messages (default)
4. **HTTP** - HTTP request/response logs
5. **DEBUG** - Detailed debugging information
6. **TRACE** - Very detailed trace information

### Using the Logger

```javascript
import { logger } from './utils/logger.js';

// Basic logging
logger.error('Database connection failed');
logger.warn('API rate limit approaching');
logger.info('User logged in successfully');
logger.http('GET /api/users');
logger.debug('Processing user data', { userId: 123 });
logger.trace('Function entry', { params });

// With metadata
logger.error('Payment failed', {
  userId: user.id,
  amount: payment.amount,
  error: error.message
});

// Specialized loggers
import { dbLogger, aiLogger, authLogger } from './utils/logger.js';

dbLogger.debug('Query executed', { query, duration: 45 });
aiLogger.info('Model prediction complete', { accuracy: 0.95 });
authLogger.warn('Failed login attempt', { username, ip });
```

### Log Files

Logs are automatically written to:
- **Location**: `./logs/`
- **Format**: `{context}-{date}.log`
- **Rotation**: Automatic when file exceeds 10MB
- **Retention**: Last 5 log files kept

Examples:
- `logs/server-2026-01-19.log`
- `logs/database-2026-01-19.log`
- `logs/auth-2026-01-19.log`

### View Logs

```bash
# Tail all logs
tail -f logs/*.log

# View specific log
tail -f logs/server-2026-01-19.log

# Search logs
grep "ERROR" logs/server-*.log

# Clean old logs (use VS Code task)
# Command Palette → Tasks: Run Task → Clean Logs
```

---

## Debug Utilities

### Performance Monitoring

```javascript
import { debug } from './utils/debugger.js';

// Time an operation
debug.time('database-query');
const users = await db.query('SELECT * FROM users');
debug.timeEnd('database-query'); // Logs: ⏱️ database-query: 45.23ms

// Memory usage
debug.memory('After loading users');
// Logs: 📊 After loading users: { rss: 125MB, heapUsed: 89MB, ... }
```

### Counters

```javascript
import { debug } from './utils/debugger.js';

// Track how many times something happens
debug.count('api-calls'); // 🔢 api-calls: 1
debug.count('api-calls'); // 🔢 api-calls: 2
debug.count('api-calls'); // 🔢 api-calls: 3

// Reset counter
debug.countReset('api-calls'); // 🔄 api-calls reset to 0
```

### Function Tracing

```javascript
import { debug } from './utils/debugger.js';

// Automatically log function entry/exit
const processPayment = debug.traceFunction(
  async (userId, amount) => {
    // ... payment logic
    return result;
  },
  'processPayment'
);

// When called, logs:
// → Entering processPayment [abc123] { args: [123, 500] }
// ⏱️ processPayment-abc123: 234.56ms
// ← Exiting processPayment [abc123] { result: {...} }
```

### Object Inspection

```javascript
import { debug } from './utils/debugger.js';

// Deep inspect objects
debug.inspect(complexObject, 'User Data');
// Logs formatted, colorized output with nested properties
```

### Stack Traces

```javascript
import { debug } from './utils/debugger.js';

// Log current stack trace
debug.trace('Checkpoint reached');

// Assert conditions
debug.assert(user.role === 'admin', 'User must be admin');
// Throws error with stack trace if condition fails
```

### Creating Custom Debuggers

```javascript
import { createDebugger } from './utils/debugger.js';

// Create namespace-specific debugger
const paymentDebug = createDebugger('PAYMENT');
const emailDebug = createDebugger('EMAIL');

paymentDebug.log('Processing payment', { amount: 500 });
emailDebug.log('Sending confirmation email');

// Child debuggers
const stripeDebug = paymentDebug.child('STRIPE');
stripeDebug.log('Calling Stripe API'); // Logs as [PAYMENT:STRIPE]
```

---

## Common Debugging Scenarios

### 1. Debugging API Endpoints

```javascript
import { debug } from './utils/debugger.js';
import { logger } from './utils/logger.js';

export const getUserProfile = async (req, res, next) => {
  const apiDebug = debug.child('getUserProfile');
  
  try {
    apiDebug.log('Request received', { userId: req.params.id });
    apiDebug.time('fetch-user');
    
    const user = await User.findById(req.params.id);
    
    apiDebug.timeEnd('fetch-user');
    apiDebug.inspect(user, 'User Object');
    
    logger.info('User profile fetched', { userId: user.id });
    
    res.json({ success: true, data: user });
  } catch (error) {
    apiDebug.error('Failed to fetch user', error);
    next(error);
  }
};
```

### 2. Debugging Database Queries

```javascript
import { dbLogger } from './utils/logger.js';
import { dbDebug } from './utils/debugger.js';

export async function executeQuery(sql, params) {
  dbDebug.time('query');
  dbDebug.log('Executing query', { sql, params });
  
  try {
    const result = await pool.query(sql, params);
    
    dbDebug.timeEnd('query');
    dbLogger.debug('Query executed', {
      sql,
      rowCount: result.rowCount,
      duration: dbDebug.timeEnd('query')
    });
    
    return result;
  } catch (error) {
    dbLogger.error('Query failed', { sql, params, error: error.message });
    throw error;
  }
}
```

### 3. Debugging Authentication Issues

```javascript
import { authLogger } from './utils/logger.js';
import { authDebug } from './utils/debugger.js';

export const verifyToken = async (req, res, next) => {
  authDebug.log('Verifying token', {
    hasToken: !!req.headers.authorization,
    path: req.path
  });
  
  try {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      authLogger.warn('No token provided', { path: req.path, ip: req.ip });
      return res.status(401).json({ error: 'No token provided' });
    }
    
    authDebug.inspect(jwt.decode(token), 'Decoded Token');
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    
    authLogger.info('Token verified', { userId: decoded.id });
    next();
  } catch (error) {
    authLogger.error('Token verification failed', {
      error: error.message,
      path: req.path
    });
    res.status(401).json({ error: 'Invalid token' });
  }
};
```

### 4. Debugging Async Operations

```javascript
import { debug } from './utils/debugger.js';

const processOrder = debug.traceFunction(async (orderId) => {
  debug.log('Processing order', { orderId });
  
  // Each step is automatically timed and logged
  const order = await fetchOrder(orderId);
  const payment = await processPayment(order);
  const email = await sendConfirmation(order);
  
  return { order, payment, email };
}, 'processOrder');
```

### 5. Debugging Frontend (React)

Add to your React components:
```javascript
// In vite.config.ts, source maps are enabled by default

// Use browser DevTools
useEffect(() => {
  console.log('Component mounted', { props, state });
  debugger; // Pauses execution in browser
}, []);

// Or use VS Code breakpoints in .tsx files
```

---

## Performance Debugging

### 1. Identify Slow Endpoints

Enable request logging:
```bash
LOG_RESPONSE_TIME=true
```

Check response headers:
```
X-Response-Time: 234ms
X-Request-Id: abc123
```

View slow requests in logs:
```bash
grep -E "\\([0-9]{3,}ms\\)" logs/server-*.log
```

### 2. Profile Memory Usage

```javascript
import { debug } from './utils/debugger.js';

// Before operation
debug.memory('Before loading data');

// Perform memory-intensive operation
const largeDataset = await loadLargeDataset();

// After operation
debug.memory('After loading data');

// Compare the difference
```

### 3. Database Query Performance

```javascript
import { dbDebug } from './utils/debugger.js';

dbDebug.time('complex-query');
const result = await db.query(`
  SELECT u.*, COUNT(o.id) as order_count
  FROM users u
  LEFT JOIN orders o ON u.id = o.user_id
  GROUP BY u.id
`);
const duration = dbDebug.timeEnd('complex-query');

if (duration > 1000) {
  dbLogger.warn('Slow query detected', { duration, query });
}
```

### 4. Monitor Event Loop Lag

```javascript
import { debug } from './utils/debugger.js';

setInterval(() => {
  const start = process.hrtime.bigint();
  setImmediate(() => {
    const lag = Number(process.hrtime.bigint() - start) / 1_000_000;
    if (lag > 100) {
      debug.log(`⚠️ Event loop lag: ${lag.toFixed(2)}ms`);
    }
  });
}, 5000);
```

---

## Troubleshooting

### Debugger Not Connecting

**Problem**: VS Code debugger won't connect to Node.js process

**Solutions**:
1. Check if port 9229 is available:
   ```bash
   lsof -i :9229
   ```

2. Kill existing debug processes:
   ```bash
   pkill -f "node --inspect"
   ```

3. Try using "Attach to Process" configuration

### Breakpoints Not Hitting

**Problem**: Breakpoints are grey/not being hit

**Solutions**:
1. Ensure source maps are enabled (they are by default)
2. Check that file path matches exactly
3. Try adding `debugger;` statement instead
4. Restart debugger after saving file

### Logs Not Appearing

**Problem**: Logger not writing to console or files

**Solutions**:
1. Check log level:
   ```bash
   # In .env
   LOG_LEVEL=debug
   ENABLE_CONSOLE_LOGGING=true
   ENABLE_FILE_LOGGING=true
   ```

2. Verify logs directory exists:
   ```bash
   mkdir -p logs
   chmod 755 logs
   ```

3. Check file permissions:
   ```bash
   ls -la logs/
   ```

### Debug Mode Not Activating

**Problem**: Debug utilities not producing output

**Solutions**:
1. Enable debug mode:
   ```bash
   # In .env
   DEBUG=*
   NODE_ENV=development
   ```

2. Or enable specific namespaces:
   ```bash
   DEBUG=DATABASE,API,AUTH
   ```

### Frontend Source Maps Not Working

**Problem**: Can't debug TypeScript/React in browser

**Solutions**:
1. Check `vite.config.ts` has source maps enabled:
   ```typescript
   build: {
     sourcemap: true
   }
   ```

2. Clear Vite cache:
   ```bash
   cd client
   rm -rf node_modules/.vite
   npm run dev
   ```

3. Check browser DevTools settings:
   - Enable "JavaScript source maps"
   - Enable "CSS source maps"

---

## Environment Variables Reference

### Debug Settings
```bash
DEBUG=*                          # Enable all debug namespaces
DEBUG=DATABASE,API               # Enable specific namespaces
LOG_LEVEL=debug                  # Set log verbosity
ENABLE_FILE_LOGGING=true         # Write logs to files
ENABLE_CONSOLE_LOGGING=true      # Write logs to console
VERBOSE_ERRORS=true              # Show full error details
STACK_TRACE_LIMIT=20            # Stack trace depth
```

### Performance Monitoring
```bash
ENABLE_PERFORMANCE_MONITORING=true
ENABLE_REQUEST_LOGGING=true
LOG_SQL_QUERIES=true
LOG_RESPONSE_TIME=true
```

### Development Tools
```bash
ENABLE_SWAGGER=true              # Enable Swagger UI
ENABLE_PLAYGROUND=true           # Enable API playground
SHOW_ERROR_DETAILS=true          # Show detailed errors
```

---

## Best Practices

1. **Use Appropriate Log Levels**
   - ERROR: Only for actual errors requiring attention
   - WARN: For potential issues
   - INFO: For important events
   - DEBUG: For development debugging
   - TRACE: For very detailed debugging

2. **Add Context to Logs**
   ```javascript
   // Good
   logger.error('Payment failed', { userId, amount, error: err.message });
   
   // Bad
   logger.error('Payment failed');
   ```

3. **Use Namespaced Debuggers**
   ```javascript
   const debug = createDebugger('PAYMENT:STRIPE');
   ```

4. **Clean Up Debug Code**
   - Remove `debugger;` statements before committing
   - Use environment-based debugging instead of console.log

5. **Monitor Performance in Development**
   - Use `debug.time()` for critical paths
   - Check memory usage for large operations
   - Profile database queries

6. **Use VS Code Debugger Over console.log**
   - Set breakpoints instead of logging
   - Inspect variables in real-time
   - Step through code execution

---

## Additional Resources

- [VS Code Debugging Documentation](https://code.visualstudio.com/docs/editor/debugging)
- [Node.js Debugging Guide](https://nodejs.org/en/docs/guides/debugging-getting-started/)
- [Chrome DevTools](https://developer.chrome.com/docs/devtools/)
- [Vite Documentation](https://vitejs.dev/)

---

## Support

If you encounter issues not covered in this guide:

1. Check existing logs in `./logs/`
2. Enable maximum debugging: `DEBUG=* LOG_LEVEL=trace`
3. Check VS Code Output panel (View → Output)
4. Review Debug Console while debugging
5. Contact the development team with logs and error details
