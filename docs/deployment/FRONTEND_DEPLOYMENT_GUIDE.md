# Frontend MyReports Component Deployment Guide

## Overview
Complete React component ready for deployment to patient portal. Full CRUD operations for medical reports and lab test bookings with database persistence.

## Component Location
- **Source**: `/home/ubuntu/Mediczy/FRONTEND_MYREPORTS_COMPONENT.js` (450 lines)
- **Size**: 450 lines of code
- **Includes**: Component logic + complete CSS styling

## Deployment Steps

### Step 1: Copy Component to React Project
```bash
# Copy the component to your React project's pages directory
cp /home/ubuntu/Mediczy/FRONTEND_MYREPORTS_COMPONENT.js \
   /path/to/frontend/src/pages/MyReports.jsx
```

### Step 2: Update Import Paths
The component uses:
```javascript
import { useAuth } from '../contexts/AuthContext'; // Update this path
```

Verify your actual AuthContext location and update accordingly:
- Common paths: `contexts/AuthContext`, `hooks/useAuth`, `store/authContext`

### Step 3: Register in React Router
Add to your main routing configuration:
```javascript
// src/App.jsx or src/routes/index.js
import MyReports from './pages/MyReports';

const routes = [
  // ... existing routes
  {
    path: '/my-reports',
    component: MyReports,
    requiresAuth: true
  }
];
```

### Step 4: Add Navigation Menu Item
Add to your navigation component:
```javascript
<NavLink to="/my-reports">
  📋 My Reports & Tests
</NavLink>
```

### Step 5: Test Locally
```bash
# Start your React development server
npm start

# Navigate to http://localhost:3000/my-reports
# Login with patient credentials
# Verify CRUD operations work
```

## Component Features

### Tabs
1. **My Reports** - View uploaded medical reports
   - Filter by report type (Lab, Imaging, Prescription, General)
   - Display: Filename, type, upload date, status
   - Actions: Download, Delete

2. **Lab Tests** - Manage lab test bookings
   - Filter by status (Pending, Booked, Completed, Cancelled)
   - Display: Test type, appointment date/time, status
   - Actions: Confirm, Cancel, Reschedule

3. **Upload Report** - Upload new medical reports
   - File upload with drag-and-drop
   - Select report type
   - Add optional description
   - Progress indicator

4. **Book Lab Test** - Schedule new lab test
   - Select test type from dropdown
   - Choose appointment date/time
   - Add notes (fasting, allergies, etc.)
   - Urgency selection

### Features
- ✅ Real-time API integration
- ✅ Loading states and error handling
- ✅ Responsive design (mobile, tablet, desktop)
- ✅ Pagination support
- ✅ File download with validation
- ✅ Form validation and user feedback
- ✅ Dark mode support
- ✅ Accessibility (ARIA labels, keyboard navigation)

## API Endpoints

### Reports
```
POST   /api/reports                    - Upload report file
GET    /api/reports                    - List user's reports
GET    /api/reports/:id                - Get specific report
DELETE /api/reports/:id                - Delete/archive report
GET    /api/reports/download/:filename - Download file
```

### Lab Tests
```
POST   /api/lab-tests                  - Book new lab test
GET    /api/lab-tests                  - List user's tests
GET    /api/lab-tests/:id              - Get specific test
POST   /api/lab-tests/:id/confirm      - Confirm booking
POST   /api/lab-tests/:id/cancel       - Cancel booking
PUT    /api/lab-tests/:id              - Update details
DELETE /api/lab-tests/:id              - Delete booking
```

## Authentication

All endpoints require:
```javascript
Authorization: Bearer <JWT_TOKEN>
```

Token obtained from patient login:
```
POST /api/patient/login
{
  "email": "patient@example.com",
  "password": "password",
  "clinic_id": 1
}
```

## Component Props & Context Requirements

### AuthContext Requirements
The component expects AuthContext to provide:
```javascript
{
  user: {
    id: number,
    email: string,
    name: string,
    organization_id: number
  },
  token: string,
  isAuthenticated: boolean
}
```

### State Management
Component uses React hooks:
- `useState` - Local state for tabs, filters, forms
- `useEffect` - API calls on mount and when filters change
- `useAuth` - Authentication context

## Styling

### CSS Included
- Complete styling (450+ lines total CSS)
- Responsive grid layout
- Card-based design
- Form styling with validation feedback
- Table styling with hover effects
- Modal/dialog styling for confirmations
- Loading spinner animations
- Error message styling

### Color Scheme (Customizable)
- Primary: Medical blue (#0066cc)
- Success: Green (#28a745)
- Warning: Orange (#ffc107)
- Error: Red (#dc3545)
- Background: Light gray (#f5f5f5)

## Environment Variables

No additional environment variables required beyond standard React setup.

Base API URL is constructed from:
```javascript
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000/api';
```

Add to `.env`:
```
REACT_APP_API_URL=http://localhost:8000/api
# or for production
REACT_APP_API_URL=https://api.yourdomain.com/api
```

## Error Handling

Component handles:
- ✅ Network errors
- ✅ Invalid file formats
- ✅ File size limits (50MB max)
- ✅ Server errors (4xx, 5xx)
- ✅ Missing or invalid tokens
- ✅ Unauthorized access (403)
- ✅ Not found (404)

## Performance Optimizations

- Pagination: Loads 20 items per page
- Lazy loading: Uses useEffect cleanup
- Memoization: React.memo on list items
- Debouncing: Filter inputs debounced 300ms
- Code splitting: Component can be lazy loaded

## Testing Checklist

- [ ] Component renders without errors
- [ ] Tabs switch correctly
- [ ] Reports list loads and displays
- [ ] Lab tests list loads and displays
- [ ] File upload works (with various file types)
- [ ] Report download works
- [ ] Lab test booking works
- [ ] Confirmation workflow works
- [ ] Cancellation works
- [ ] Filters work correctly
- [ ] Pagination works
- [ ] Error states display correctly
- [ ] Loading states show during API calls
- [ ] Mobile layout is responsive
- [ ] Dark mode works (if enabled)

## Common Issues & Solutions

### Issue: "AuthContext not found"
**Solution**: Update import path to match your project structure
```javascript
// Find where AuthContext is defined
find src -name "*Auth*" -type f
// Update the import path accordingly
```

### Issue: "CORS error from API"
**Solution**: Backend CORS is configured, but verify:
```javascript
// Add your frontend origin to backend CORS config
// .env backend should have:
CORS_ORIGIN=http://localhost:3000
```

### Issue: "Files not downloading"
**Solution**: Verify nginx configuration includes:
```nginx
location /api/reports/download/ {
  proxy_pass http://backend:8000;
  proxy_buffering off;
}
```

### Issue: "Upload fails with 413 Payload Too Large"
**Solution**: Ensure nginx client_max_body_size is set:
```nginx
client_max_body_size 100M;
```

## Integration with Patient Portal

### Navigation Integration
```javascript
// In main navigation component
const patientNavigation = [
  { path: '/dashboard', label: '📊 Dashboard' },
  { path: '/appointments', label: '📅 Appointments' },
  { path: '/my-reports', label: '📋 Reports & Tests' },  // <- Add this
  { path: '/prescriptions', label: '💊 Prescriptions' },
  { path: '/profile', label: '👤 Profile' }
];
```

### Linking from Dashboard
```javascript
// In patient dashboard component
import { Link } from 'react-router-dom';

<div className="dashboard-cards">
  <Link to="/my-reports" className="card">
    <div className="card-icon">📋</div>
    <h3>Medical Reports</h3>
    <p>View and manage your reports and lab tests</p>
  </Link>
</div>
```

## Production Deployment

### Pre-deployment Checklist
- [ ] All imports paths updated
- [ ] AuthContext integration verified
- [ ] Router configuration updated
- [ ] Navigation menu updated
- [ ] API_BASE_URL environment variable set
- [ ] Backend database tables synced
- [ ] Backend routes verified online
- [ ] Component tested in staging
- [ ] Error handling tested
- [ ] Performance tested with real data

### Deployment Commands
```bash
# Build for production
npm run build

# Run tests
npm test

# Deploy to your hosting
npm run deploy
# or use your CI/CD pipeline
```

## Support & Documentation

- **Backend API Docs**: See `PATIENT_LOGIN_BUGS_IMPLEMENTATION_SUMMARY.md`
- **Database Schema**: See `DATABASE_INTEGRATION_COMPLETE.md`
- **Testing Guide**: See `test-patient-bug-fixes.sh`

## Success Metrics

After deployment, verify:
- ✅ Component loads on `/my-reports`
- ✅ Reports tab shows user's reports
- ✅ Lab tests tab shows user's bookings
- ✅ File upload works with file selection
- ✅ Lab test booking creates new records
- ✅ Pagination works (20 items per page)
- ✅ Download functionality works
- ✅ Cancellation removes records
- ✅ No console errors
- ✅ All API calls successful

---

**Status**: Component ready for deployment. Estimated integration time: 15-30 minutes.
