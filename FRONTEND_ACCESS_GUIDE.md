# 🎯 How to View Hospital Insurance Dashboard

## ✅ Integration Complete!

The hospital insurance dashboard has been **fully integrated** into your application routing.

---

## 🌐 Access the Dashboard

### Option 1: Direct URL (Recommended)

Once your frontend dev server is running, navigate to:

```
http://localhost:5173/hospital/insurance-claims
```

Or your production URL:

```
https://yourdomain.com/hospital/insurance-claims
```

### Option 2: Add Navigation Link

Add a link to your hospital navigation menu:

```tsx
<Link to="/hospital/insurance-claims">Insurance Claims Dashboard</Link>
```

---

## 🚀 Start the Frontend

If not already running, start your frontend development server:

```bash
cd /home/ubuntu/Mediczy/client
npm run dev
```

Then visit: **http://localhost:5173/hospital/insurance-claims**

---

## 📁 Files Added/Modified

### New Files Created:

1. ✅ **`client/src/components/HospitalInsuranceDashboard.tsx`** - Main React component
2. ✅ **`client/src/styles/HospitalInsuranceDashboard.css`** - Professional styling
3. ✅ **`client/src/pages/hospital/HospitalInsuranceClaimsDashboard.tsx`** - Page wrapper

### Modified Files:

1. ✅ **`client/src/routes/index.tsx`** - Added route and import

---

## 🔑 Authentication Required

The dashboard requires a valid JWT token. Make sure you're logged in as:

- **Hospital user**, or
- **Admin user**

The component automatically reads the token from `localStorage.getItem('token')`

---

## 🎨 What You'll See

The dashboard includes:

### 1. **Stats Overview** (Top Cards)

- Pending Claims
- Approved Claims
- Rejected Claims
- Under Query

### 2. **Action Alerts**

- Pre-auths expiring soon
- Missing documents
- Settlement pending

### 3. **Recent Claims Table**

- Claim number
- Patient name
- Amount
- Status
- Actions

### 4. **Quick Actions**

- New Claim Form
- Pre-Authorization Form
- Quick Search

---

## 🔗 Full Route List

All insurance routes available:

```
/hospital/insurance-payer-management  ← Existing payer management
/hospital/insurance-billing           ← Existing billing
/hospital/insurance-claims            ← NEW! IHX-style dashboard ✨
```

---

## 🛠️ Customization

### Update API Base URL

If your API is on a different port/domain, update in the component:

```tsx
// In HospitalInsuranceDashboard.tsx
const response = await axios.get(
  "http://localhost:8000/api/hospital/insurance/dashboard",
  {
    headers: {
      Authorization: `Bearer ${localStorage.getItem("token")}`,
    },
  },
);
```

### Modify Styling

Edit: `client/src/styles/HospitalInsuranceDashboard.css`

### Add to Hospital Menu

Edit your hospital sidebar/menu component to add:

```tsx
<MenuItem icon={<FileTextIcon />} to="/hospital/insurance-claims">
  Insurance Claims
</MenuItem>
```

---

## 📊 Backend API Status

All 25 backend endpoints are **operational** at:

- **Base URL:** `http://localhost:8000/api/hospital/insurance`
- **Authentication:** Required (JWT token)
- **Status:** ✅ Production Ready

See [TEST_RESULTS_SUMMARY.md](../TEST_RESULTS_SUMMARY.md) for full API documentation.

---

## 🐛 Troubleshooting

### "Cannot GET /hospital/insurance-claims"

**Solution:** Make sure frontend dev server is running:

```bash
cd client && npm run dev
```

### "Network Error" or "401 Unauthorized"

**Solution:**

1. Login as hospital/admin user first
2. Check that backend server is running on port 8000
3. Verify JWT token is in localStorage

### "Component not found" error

**Solution:** The component is now `.tsx`, make sure TypeScript is configured correctly

### Dashboard shows "Loading..." forever

**Solution:**

1. Open browser console (F12)
2. Check for CORS or network errors
3. Verify API endpoint: `http://localhost:8000/api/hospital/insurance/dashboard`
4. Ensure backend server is running: `pm2 status mediczy-server`

---

## 🎯 Next Steps

1. **Start frontend:** `cd client && npm run dev`
2. **Login** as hospital user
3. **Navigate** to `/hospital/insurance-claims`
4. **Test** creating claims, pre-auths, searching patients
5. **Customize** styling and layout to match your theme

---

## 📚 Documentation

- **API Reference:** [HOSPITAL_INSURANCE_DASHBOARD.md](../HOSPITAL_INSURANCE_DASHBOARD.md)
- **Implementation Details:** [HOSPITAL_INSURANCE_IMPLEMENTATION_SUMMARY.md](../HOSPITAL_INSURANCE_IMPLEMENTATION_SUMMARY.md)
- **Test Results:** [TEST_RESULTS_SUMMARY.md](../TEST_RESULTS_SUMMARY.md)
- **Deployment Guide:** [DEPLOYMENT_COMPLETE_INSURANCE_DASHBOARD.md](../DEPLOYMENT_COMPLETE_INSURANCE_DASHBOARD.md)

---

**Ready to go!** 🚀  
Visit: **http://localhost:5173/hospital/insurance-claims**
