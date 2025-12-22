# Mediczy Automated Testing Suite

Comprehensive end-to-end testing for Mediczy admin functionality using Playwright.

## Setup

### Install Dependencies
```bash
cd tests
npm install
npx playwright install
```

### Configure Environment
```bash
cp .env.example .env
# Edit .env with your test credentials
```

## Running Tests

### Run All Tests
```bash
npm test
```

### Run Admin Login Tests Only
```bash
npm run test:admin
```

### Run Admin Functionality Tests
```bash
npm run test:admin-features
```

### Run with Browser UI (Headed Mode)
```bash
npm run test:headed
```

### Debug Mode (Step Through Tests)
```bash
npm run test:debug
```

### Interactive UI Mode
```bash
npm run test:ui
```

### Run on Specific Browser
```bash
npm run test:chrome
npm run test:firefox
npm run test:webkit
```

### Run Mobile Tests
```bash
npm run test:mobile
```

### View Test Report
```bash
npm run test:report
```

## Test Structure

### Admin Login Tests (`admin-login.spec.ts`)
- **Login Flow Tests**
  - Page load validation
  - Empty form validation
  - Invalid credentials handling
  - Successful login
  - Authentication persistence
  - Password visibility toggle
  - Console error detection
  - JavaScript error detection
  - Unauthorized access redirect

- **Dashboard Navigation Tests**
  - Dashboard access
  - Users management navigation
  - Doctors management navigation
  - Debug dashboard access (admin only)
  - Logout functionality

- **Token Management Tests**
  - AdminToken storage
  - UserType validation
  - Token ring-fencing (clearing other role tokens)

- **Performance Tests**
  - Page load time (< 3 seconds)
  - Login completion time (< 5 seconds)

- **Accessibility Tests**
  - ARIA labels
  - Keyboard navigation
  - Enter key form submission

### Admin Functionality Tests (`admin-functionality.spec.ts`)
- **Management Features**
  - Dashboard loading without errors
  - Statistics display
  - Users management access
  - Doctors management access
  - Appointments access
  - Navigation menu functionality

- **Debug Dashboard Tests**
  - Admin access to debug dashboard
  - Debug tabs visibility
  - Debug mode toggle
  - Console logs viewing
  - Auth state inspection

- **Error Handling Tests**
  - API error handling
  - 404 page handling
  - JavaScript error prevention

- **Session Management Tests**
  - Session persistence across reloads
  - Concurrent session handling

- **Responsiveness Tests**
  - Mobile viewport (375x667)
  - Tablet viewport (768x1024)

## Test Coverage

### What's Tested
✅ Admin login functionality  
✅ Form validation  
✅ Authentication flow  
✅ Token management  
✅ Dashboard navigation  
✅ Admin-only features (debug dashboard)  
✅ Error handling  
✅ Performance metrics  
✅ Accessibility  
✅ Responsiveness  
✅ Console/JS errors  
✅ Session persistence  

### What's NOT Tested
❌ Payment processing  
❌ Third-party integrations (external APIs)  
❌ Database operations (tested indirectly)  
❌ Backend unit tests (separate test suite)  

## Test Results

After running tests, view results:
```bash
npm run test:report
```

Results are saved to:
- `playwright-report/` - HTML report
- `test-results.json` - JSON results for CI/CD
- `test-results/` - Screenshots and videos on failure

## Continuous Integration

For CI/CD pipelines:
```bash
npm run test:ci
```

This runs tests:
- In headless mode
- With retries (2 attempts)
- Without parallel execution
- With JSON reporting

## Troubleshooting

### Tests Failing
1. Check `.env` has correct credentials
2. Ensure backend is running
3. Check BASE_URL is correct
4. Run with `--headed` to see what's happening
5. Use `--debug` to step through tests

### Timeout Errors
- Increase timeout in `playwright.config.ts`
- Check network connection
- Verify backend is responsive

### Authentication Errors
- Verify admin credentials in `.env`
- Check adminToken is being set in localStorage
- Ensure ring-fencing is working correctly

## Best Practices

1. **Use Test Data**: Don't use production credentials
2. **Clean State**: Tests should clean up after themselves
3. **Isolation**: Each test should be independent
4. **Assertions**: Always assert expected outcomes
5. **Waits**: Use proper waits (networkidle, explicit waits)
6. **Screenshots**: Automatically captured on failure

## Adding New Tests

1. Create new spec file in `e2e/` folder
2. Follow existing test structure
3. Use descriptive test names
4. Add proper beforeEach setup
5. Assert expected behavior
6. Handle async operations properly

Example:
```typescript
import { test, expect } from '@playwright/test';

test.describe('New Feature', () => {
  test.beforeEach(async ({ page }) => {
    // Setup code
  });

  test('should do something', async ({ page }) => {
    // Test code
    await expect(page.locator('selector')).toBeVisible();
  });
});
```

## Support

For issues or questions:
- Check Playwright docs: https://playwright.dev
- Review test logs: `npm run test:report`
- Run in debug mode: `npm run test:debug`
- Contact dev team

## License

MIT
