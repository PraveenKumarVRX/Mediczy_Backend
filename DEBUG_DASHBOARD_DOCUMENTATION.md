# Debug Dashboard - Admin Only Feature

## Overview
The Debug Dashboard is a comprehensive development and diagnostics tool for Mediczy, accessible **exclusively to administrators**. It provides real-time monitoring, API testing, state inspection, and debugging capabilities.

## Access Control
- **URL**: `/debug`
- **Authorization**: Admin users only
- **Requirements**:
  - Valid `adminToken` in localStorage
  - `userType` must be set to `'admin'`
- **Redirect**: Non-admin users are automatically redirected to `/admin/login`

## Features

### 1. **Console Logs Tab** 🖥️
Real-time console log viewer with color-coded messages:
- **Log Types**: log, error, warn, info, debug
- **Auto-capture**: Intercepts all console methods when debug mode is enabled
- **Features**:
  - Timestamps for each log
  - Color-coded by severity (green=log, red=error, orange=warn, blue=info)
  - Emoji indicators (✅, ❌, 🔵, 🚫, etc.)
  - Scrollable history (last 100 logs)
  - Download logs to file
  - Clear all logs

### 2. **Network Monitor Tab** 🌐
Tracks all HTTP requests made by the application:
- **Captured Data**:
  - Request method (GET, POST, PUT, PATCH, DELETE)
  - URL
  - Status code (color-coded: green=2xx, orange=4xx, red=5xx)
  - Response time in milliseconds
  - Error messages if request fails
- **Features**:
  - Real-time request tracking
  - Performance monitoring
  - Last 50 requests stored
  - Clear network history

### 3. **API Tester Tab** 🧪
Interactive API endpoint testing tool:
- **HTTP Methods**: GET, POST, PUT, PATCH, DELETE
- **Features**:
  - Custom URL input
  - Request body editor (JSON)
  - Auto-attaches auth token from localStorage
  - Response viewer with syntax highlighting
  - Copy response to clipboard
  - Full request/response headers

**Example Usage**:
```javascript
Method: GET
URL: http://localhost:8000/api/users/me
Response: {status: 200, data: {...}}
```

### 4. **State Inspector Tab** 💾
View and manage application state:

#### LocalStorage Viewer
- Shows all localStorage key-value pairs
- Displays: tokens, user data, settings, cached data
- Truncates long values (100 chars) with ellipsis

#### Environment Info
- `NODE_ENV`: development/production
- `API_BASE_URL`: Backend API endpoint
- Other environment variables

#### Cache Management
- **Clear All Cache**: Clears localStorage and sessionStorage (preserves debug mode setting)
- **Purge Cloudflare**: Manual cache purge reminder

### 5. **Auth Inspector Tab** 🔐
Authentication state debugging:

#### User Type Display
Shows current logged-in user type (user, doctor, admin, etc.)

#### Token Management
- Displays available tokens:
  - User Token (`token`)
  - Doctor Token (`doctorToken`)
  - Admin Token (`adminToken`)
- **Show/Hide Tokens**: Toggle token visibility
- **Copy Tokens**: Copy to clipboard with one click

## How to Use

### Enable Debug Mode (Admin Only)
1. Login as admin at `/admin/login`
2. Navigate to `/debug`
3. Click **"Debug ON"** button to enable interceptors
4. Debug mode persists across sessions

### View Console Logs
1. Enable debug mode
2. Navigate through the app
3. Go to Debug Dashboard → Console tab
4. See all console.log, error, warn statements

### Test API Endpoints
1. Go to API Tester tab
2. Select HTTP method
3. Enter API URL (e.g., `http://localhost:8000/api/users/me`)
4. Add request body for POST/PUT/PATCH
5. Click "Send Request"
6. View response with status code

### Monitor Network Requests
1. Enable debug mode
2. Use the app normally
3. Go to Network tab
4. See all fetch requests with timing

### Inspect Auth State
1. Go to Auth tab
2. View current user type
3. See available tokens
4. Click eye icon to show/hide token values
5. Copy tokens for API testing

### Clear Cache
1. Go to State tab
2. Click "Clear Cache" to remove localStorage/sessionStorage
3. App will reload with fresh state

## Debug Mode Features

When debug mode is **ON**:
- ✅ Console logs are intercepted and stored
- ✅ Network requests are monitored
- ✅ Performance metrics collected
- ✅ Green indicator dot on debug button

When debug mode is **OFF**:
- ❌ No interception (better performance)
- ❌ No log storage
- ❌ Minimal overhead

## Security Features

### Admin-Only Access
- Enforced at component level (DebugDashboard.tsx)
- Enforced at context level (DebugContext.tsx)
- Non-admin users cannot enable debug mode
- Automatic redirect if unauthorized

### Token Protection
- Tokens hidden by default (show as `••••••••`)
- Click eye icon to reveal
- Copy button for secure sharing
- No tokens logged to console

### Data Limits
- Logs: Maximum 100 entries
- Network: Maximum 50 requests
- Prevents memory leaks
- Auto-cleanup of old entries

## Technical Implementation

### Files Created
1. `client/src/contexts/DebugContext.tsx` - Debug state management
2. `client/src/pages/DebugDashboard.tsx` - Debug UI components
3. Route: `/debug` in `client/src/routes/index.tsx`

### Integration
- Wrapped in `App.tsx` as `<DebugProvider>`
- Available globally via `useDebug()` hook
- Persists state in localStorage

### Performance Impact
- **Debug OFF**: Zero overhead
- **Debug ON**: Minimal overhead (~1-2ms per log)
- No impact on production if not enabled

## Usage Examples

### Example 1: Debug OAuth Flow
```typescript
// Enable debug mode
// Navigate to /register
// Click "Sign in with Google"
// Go to /debug → Console tab
// See: "🔵 Redirecting to google OAuth"
// See: "✅ OAuth successful via google"
```

### Example 2: Test User Profile API
```typescript
// Go to /debug → API Tester
// Method: GET
// URL: http://localhost:8000/api/users/me
// Send Request
// See: {status: 200, data: {id, email, firstName, ...}}
```

### Example 3: Monitor Appointment Booking
```typescript
// Enable debug mode
// Book an appointment
// Go to /debug → Network tab
// See: POST /api/appointments/book - 201 Created - 234ms
```

### Example 4: Check Auth Token
```typescript
// Go to /debug → Auth tab
// See: User Type: user
// See: Tokens: User ✓
// Click eye icon
// Copy token
// Use in Postman/curl
```

## Troubleshooting

### "Access Denied" Error
**Cause**: Not logged in as admin
**Solution**: Login at `/admin/login` with admin credentials

### Debug Mode Won't Enable
**Cause**: Not an admin user
**Solution**: Only admins can enable debug mode

### Logs Not Appearing
**Cause**: Debug mode is OFF
**Solution**: Click "Debug ON" button

### Network Requests Not Showing
**Cause**: Debug mode wasn't enabled before making requests
**Solution**: Enable debug mode, then make requests

### Console Full of Old Logs
**Solution**: Click "Clear" button in Console tab

## Best Practices

1. **Enable only when needed**: Debug mode adds overhead
2. **Clear logs regularly**: Prevents memory buildup
3. **Disable in production**: Unless actively debugging
4. **Download logs**: Before clearing for future reference
5. **Test APIs safely**: Use development endpoints first
6. **Hide tokens**: When screensharing or recording
7. **Check network timing**: Identify slow API calls

## Future Enhancements (Planned)
- [ ] WebSocket message monitoring
- [ ] Redux/State management inspector
- [ ] React component tree viewer
- [ ] Performance profiler
- [ ] Memory usage tracker
- [ ] Custom log filtering
- [ ] Export debug reports
- [ ] Remote debugging support

## Support
For issues or questions about the Debug Dashboard:
- Check admin console for errors
- Review PM2 logs: `pm2 logs mediczy-frontend`
- Contact development team

---

**Note**: Debug Dashboard is a powerful tool. Use responsibly and only enable when actively debugging. Never leave debug mode ON in production for extended periods.
