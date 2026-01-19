# 🐛 Quick Debug Reference

## Start Debugging (VS Code)
Press `F5` → Select configuration:
- **Full Stack Debug** - Frontend + Backend together
- **Debug Backend (Nodemon)** - Backend with auto-reload
- **Debug Frontend (Chrome)** - Frontend in browser

## Environment Setup
```bash
cp .env.development .env
# Edit .env with your local settings
```

## Quick Commands
```bash
# Enable all debugging
DEBUG=* LOG_LEVEL=debug npm run dev

# View logs
tail -f logs/*.log

# Clean logs
rm -rf logs/*.log
```

## Log Levels (Set LOG_LEVEL in .env)
- `error` - Only errors
- `warn` - Warnings and errors
- `info` - General info (default)
- `debug` - Detailed debugging
- `trace` - Very detailed

## In Your Code

### Basic Logging
```javascript
import { logger } from './utils/logger.js';

logger.error('Error message', { context });
logger.warn('Warning message');
logger.info('Info message');
logger.debug('Debug details', { data });
```

### Performance Tracking
```javascript
import { debug } from './utils/debugger.js';

debug.time('operation-name');
// ... your code
debug.timeEnd('operation-name'); // Logs duration

debug.memory('checkpoint'); // Log memory usage
debug.count('event-name'); // Count occurrences
```

### Function Tracing
```javascript
const myFunc = debug.traceFunction(async (params) => {
  // ... function body
}, 'myFunc');
// Automatically logs entry, exit, duration, errors
```

### Object Inspection
```javascript
debug.inspect(complexObject, 'Object Name');
```

## Breakpoints
1. Click left margin in VS Code to set breakpoint
2. Right-click → "Add Conditional Breakpoint" for conditions
3. Add `debugger;` in code for programmatic breakpoint

## HTTP Request Tracking
Every request gets:
- Unique ID in logs
- Response time in headers (`X-Response-Time`)
- Full request/response logging (when LOG_LEVEL=debug)

## Common Debug Scenarios

### API Endpoint
```javascript
export const myEndpoint = async (req, res, next) => {
  debug.log('Request received', { params: req.params });
  debug.time('endpoint');
  
  try {
    const result = await doSomething();
    debug.timeEnd('endpoint');
    res.json({ success: true, data: result });
  } catch (error) {
    debug.error('Operation failed', error);
    next(error);
  }
};
```

### Database Query
```javascript
import { dbLogger, dbDebug } from './utils/logger.js';

dbDebug.time('query');
const result = await db.query(sql, params);
dbDebug.timeEnd('query');
dbLogger.debug('Query executed', { sql, rowCount: result.rowCount });
```

## Troubleshooting

### Debugger won't connect?
```bash
pkill -f "node --inspect"
# Then restart debugger
```

### Logs not showing?
Check `.env`:
```bash
LOG_LEVEL=debug
ENABLE_CONSOLE_LOGGING=true
ENABLE_FILE_LOGGING=true
```

### Breakpoints not working?
1. Save file
2. Restart debugger
3. Or use `debugger;` statement

## Environment Variables

```bash
# .env.development
NODE_ENV=development
DEBUG=*
LOG_LEVEL=debug
ENABLE_FILE_LOGGING=true
ENABLE_CONSOLE_LOGGING=true
LOG_RESPONSE_TIME=true
SHOW_ERROR_DETAILS=true
```

## Log Files Location
```
logs/
  ├── server-2026-01-19.log
  ├── database-2026-01-19.log
  ├── api-2026-01-19.log
  └── auth-2026-01-19.log
```

## VS Code Tasks
Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`):
- **Tasks: Run Task** → **Start Full Stack Dev**
- **Tasks: Run Task** → **Clean Logs**
- **Tasks: Run Task** → **Run Tests**

## Full Documentation
See [DEBUGGING_GUIDE.md](./DEBUGGING_GUIDE.md)
