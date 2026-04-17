# 🚀 Quick Start Guide - Hospital Insurance Management

## Overview

This guide shows you how to use the newly implemented insurance management features including PDF generation, eligibility checks, WebSocket notifications, and caching.

---

## 1. 📄 Generating Claim PDFs

### Endpoint

```
GET /api/hospital/insurance/claims/:claimId/pdf
```

### Example Request

```javascript
const response = await fetch("/api/hospital/insurance/claims/123/pdf", {
  headers: {
    Authorization: `Bearer ${token}`,
  },
});

const data = await response.json();
// {
//   "success": true,
//   "message": "PDF generated successfully",
//   "pdfUrl": "/pdfs/claims/claim-CLM123-1738412345678.pdf",
//   "claim": { ... }
// }

// Open PDF in new tab
window.open(data.pdfUrl, "_blank");
```

### What Gets Generated

- Professional A4 format PDF
- Claim summary with all details
- Patient information
- Clinical information
- List of submitted documents
- Timestamp and metadata

---

## 2. 🔍 Checking Patient Eligibility

### Endpoint

```
GET /api/hospital/insurance/patient/:patientId/eligibility?policyNumber=POL123
```

### Example Request

```javascript
const checkEligibility = async (
  patientId,
  policyNumber,
  provider = "Star Health",
) => {
  const response = await fetch(
    `/api/hospital/insurance/patient/${patientId}/eligibility?policyNumber=${policyNumber}&insuranceProvider=${provider}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  );

  const data = await response.json();
  return data.eligibility;
};

// Usage
const eligibility = await checkEligibility(123, "POL123456");

if (eligibility.eligible) {
  console.log("Patient is eligible!");
  console.log("Sum Insured:", eligibility.sumInsured);
  console.log("Available Balance:", eligibility.availableBalance);
  console.log("Coverage Details:", eligibility.coverageDetails);
} else {
  console.log("Patient not eligible:", eligibility.message);
}
```

### Response Format

```json
{
  "success": true,
  "eligibility": {
    "eligible": true,
    "policyNumber": "POL123456",
    "provider": "Star Health",
    "policyStatus": "Active",
    "sumInsured": 500000,
    "availableBalance": 450000,
    "coverageDetails": {
      "roomRent": "Single AC Room",
      "icuCoverage": true,
      "ambulanceCoverage": true,
      "preHospitalization": 30,
      "postHospitalization": 60,
      "copayment": 10
    },
    "policyExpiry": "2025-12-31",
    "dataSource": "api",
    "timestamp": "2026-02-01T12:00:00Z"
  },
  "cached": false
}
```

### Caching

- **First request:** Calls insurance provider API (~2s)
- **Subsequent requests:** Served from cache (~100ms)
- **Cache duration:** 1 hour
- **Check cache status:** Look for `"cached": true` in response

---

## 3. 🔌 WebSocket Real-Time Notifications

### Frontend Setup

```javascript
import { io } from "socket.io-client";
import { useEffect, useState } from "react";

function InsuranceDashboard() {
  const [socket, setSocket] = useState(null);
  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    // Connect to WebSocket server
    const newSocket = io("https://app.mediqzy.com", {
      transports: ["websocket", "polling"],
    });

    // Authenticate
    newSocket.emit("authenticate", {
      userId: currentUser.id,
      userType: "hospital",
      organizationId: currentUser.organizationId,
    });

    // Listen for authentication success
    newSocket.on("authenticated", (data) => {
      console.log("✅ Connected to real-time notifications");
    });

    // Listen for claim updates
    newSocket.on("claim:update", (notification) => {
      console.log("📋 Claim update:", notification);
      setNotifications((prev) => [notification, ...prev]);

      // Show toast notification
      toast.success(`Claim ${notification.claimNumber} ${notification.status}`);

      // Update claim in UI
      updateClaimInList(notification.claimId, {
        status: notification.status,
      });
    });

    // Listen for pre-auth updates
    newSocket.on("preauth:update", (notification) => {
      console.log("🔐 Pre-auth update:", notification);
      toast.info(
        `Pre-auth ${notification.preAuthNumber} ${notification.status}`,
      );
    });

    // Listen for document updates
    newSocket.on("document:update", (notification) => {
      console.log("📄 Document update:", notification);
    });

    // Listen for query requests
    newSocket.on("query:new", (notification) => {
      console.log("❓ New query:", notification);
      toast.warning("Insurance provider has requested additional information");
    });

    setSocket(newSocket);

    // Cleanup on unmount
    return () => {
      newSocket.disconnect();
    };
  }, []);

  return (
    <div>
      <h1>Insurance Dashboard</h1>
      {/* Your dashboard UI */}
    </div>
  );
}
```

### Events You Can Listen For

| Event               | Trigger                         | Data                                        |
| ------------------- | ------------------------------- | ------------------------------------------- |
| `claim:update`      | Claim status changes            | `{ claimId, claimNumber, status, message }` |
| `preauth:update`    | Pre-auth status changes         | `{ preAuthId, preAuthNumber, status }`      |
| `document:update`   | Documents uploaded/verified     | `{ claimId, documentType, status }`         |
| `query:new`         | Provider requests clarification | `{ claimId, queryText }`                    |
| `settlement:update` | Payment settlements             | `{ amount, claimIds, provider }`            |

---

## 4. 💾 Using Dashboard Cache

### Endpoint

```
GET /api/hospital/insurance/dashboard?hospitalId=1
```

### Example Request

```javascript
const loadDashboard = async () => {
  const startTime = Date.now();

  const response = await fetch(
    "/api/hospital/insurance/dashboard?hospitalId=1",
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  );

  const data = await response.json();
  const loadTime = Date.now() - startTime;

  console.log(`Dashboard loaded in ${loadTime}ms`);
  console.log(`Data source: ${data.cached ? "Cache" : "Database"}`);

  return data.dashboard;
};
```

### Performance

- **First load (no cache):** ~500ms
- **Cached load:** ~50ms (10x faster!)
- **Cache duration:** 5 minutes
- **Auto-invalidation:** When claims are updated

### Manual Cache Invalidation

Cache is automatically invalidated when:

- New claim is created
- Claim is submitted
- Claim status changes
- Documents are uploaded

---

## 5. 🧪 Testing the Features

### Test PDF Generation

```bash
# Get a claim PDF (replace :claimId and token)
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:8000/api/hospital/insurance/claims/1/pdf
```

### Test Eligibility Check

```bash
# Check eligibility (replace :patientId, policyNumber, and token)
curl -H "Authorization: Bearer YOUR_TOKEN" \
  "http://localhost:8000/api/hospital/insurance/patient/1/eligibility?policyNumber=POL123456"
```

### Test Dashboard Cache

```bash
# First request (cold cache)
time curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:8000/api/hospital/insurance/dashboard

# Second request (warm cache - should be much faster!)
time curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:8000/api/hospital/insurance/dashboard
```

### Test WebSocket Connection

```javascript
// In browser console
const socket = io("http://localhost:8000");
socket.emit("authenticate", {
  userId: 1,
  userType: "hospital",
  organizationId: 1,
});
socket.on("authenticated", console.log);
socket.on("claim:update", console.log);
```

---

## 6. 🔧 Configuration

### Required Environment Variables

Add to `server/.env`:

```bash
# Redis Cache
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0

# Socket.IO
CLIENT_URL=https://app.mediqzy.com

# Insurance Provider APIs (Optional)
STAR_HEALTH_API_KEY=your-api-key
HDFC_ERGO_API_KEY=your-api-key
ICICI_LOMBARD_API_KEY=your-api-key
BAJAJ_ALLIANZ_API_KEY=your-api-key
```

### Frontend Dependencies

Install Socket.IO client:

```bash
cd client
npm install socket.io-client
```

---

## 7. 📊 Monitoring

### Check Service Status

```bash
# Check if services are running
pm2 status

# Check logs for WebSocket
pm2 logs mediczy-server | grep "Insurance WebSocket"

# Check logs for Redis
pm2 logs mediczy-server | grep "Redis cache"

# Check Redis connection
redis-cli ping
```

### View Real-Time Logs

```bash
# All logs
pm2 logs mediczy-server --lines 100

# WebSocket events only
pm2 logs mediczy-server | grep "Socket"

# Cache hits/misses
pm2 logs mediczy-server | grep "Cache"
```

---

## 8. 🎨 Example: Complete Claim Submission Flow

```javascript
async function submitClaimWithNotifications(claimId) {
  try {
    // 1. Submit the claim
    const response = await fetch(
      `/api/hospital/insurance/claims/${claimId}/submit`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      },
    );

    const result = await response.json();

    if (result.success) {
      console.log("✅ Claim submitted successfully");

      // 2. WebSocket notification will be automatically sent to:
      //    - The patient (user room)
      //    - All hospital staff (organization room)

      // 3. Cache is automatically invalidated
      //    Next dashboard load will fetch fresh data

      // 4. Generate PDF for records
      const pdfResponse = await fetch(
        `/api/hospital/insurance/claims/${claimId}/pdf`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      const pdfData = await pdfResponse.json();
      console.log("📄 PDF generated:", pdfData.pdfUrl);

      return {
        success: true,
        claim: result.claim,
        pdfUrl: pdfData.pdfUrl,
      };
    }
  } catch (error) {
    console.error("❌ Error submitting claim:", error);
    throw error;
  }
}

// Usage
submitClaimWithNotifications(123).then((result) => {
  toast.success("Claim submitted!");
  // Optionally download PDF
  window.open(result.pdfUrl, "_blank");
});
```

---

## 9. 🐛 Troubleshooting

### WebSocket Not Connecting

**Issue:** Socket.IO connection fails

**Solution:**

```javascript
// Check if server is running
const socket = io("https://app.mediqzy.com", {
  transports: ["websocket", "polling"],
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionAttempts: 5,
});

socket.on("connect_error", (error) => {
  console.error("Connection error:", error);
});
```

### Cache Not Working

**Issue:** Data always comes from database

**Check:**

```bash
# Is Redis running?
redis-cli ping

# Check Redis connection in logs
pm2 logs mediczy-server | grep "Redis"

# Test cache manually
redis-cli
> keys *
> get "dashboard:stats:1"
```

### PDF Generation Fails

**Issue:** PDF endpoint returns error

**Check:**

```bash
# Do PDF directories exist?
ls -la /home/ubuntu/Mediczy/server/public/pdfs/

# Check permissions
chmod 755 /home/ubuntu/Mediczy/server/public/pdfs/claims
```

---

## 10. 🎯 Best Practices

### 1. Always Handle Socket Disconnections

```javascript
socket.on('disconnect', () => {
  console.log('Disconnected from server');
  // Show reconnection message to user
});

socket.on('reconnect', () => {
  console.log('Reconnected to server');
  // Re-authenticate
  socket.emit('authenticate', { ... });
});
```

### 2. Use Cache Wisely

- Dashboard data: Cache for 5 minutes ✅
- Eligibility checks: Cache for 1 hour ✅
- Live claim status: Don't cache ❌

### 3. Invalidate Cache on Updates

```javascript
// After updating a claim
await updateClaim(claimId, newData);

// Dashboard cache is automatically invalidated
// Next fetch will get fresh data
```

### 4. Show Loading States

```javascript
const [loading, setLoading] = useState(false);

const checkEligibility = async () => {
  setLoading(true);
  try {
    const data = await fetchEligibility(...);
    setEligibilityData(data);
  } finally {
    setLoading(false);
  }
};
```

---

## 📚 Additional Resources

- **Full API Documentation:** `server/docs/HOSPITAL_INSURANCE_API.md`
- **Implementation Details:** `INSURANCE_IMPLEMENTATION_COMPLETE.md`
- **Test Suite:** `server/__tests__/hospital-insurance.test.js`
- **Deployment Info:** `INSURANCE_DEPLOYMENT_SUCCESS.md`

---

**Need Help?** Check the logs:

```bash
pm2 logs mediczy-server --lines 100
```

**Want to Test?** Run the test suite:

```bash
cd server && npm test __tests__/hospital-insurance.test.js
```
