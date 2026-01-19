# Admin Tenant Management - Quick Start Guide

## ✅ What's Now Available

### **Frontend**
- **Admin Page**: `/admin/tenants`
- **Create Dialog**: Click "Create Tenant" button
- **Management**: Suspend/Activate tenants, search, filter

### **Backend APIs**
Already implemented (you just needed the UI):

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/platform/tenants` | GET | List all tenants |
| `/api/platform/tenants` | POST | Create new tenant |
| `/api/platform/tenants/:id` | GET | Get tenant details |
| `/api/platform/tenants/:id` | PATCH | Update tenant |
| `/api/platform/tenants/:id/provision` | POST | Provision resources |
| `/api/platform/tenants/:id/suspend` | POST | Suspend tenant |
| `/api/platform/tenants/:id/activate` | POST | Activate tenant |

---

## 📝 How to Create Dhyan Hospital in Admin Panel

### **Step 1: Login to Admin**
- Go to `https://yourapp.com/admin/login`
- Login with admin credentials

### **Step 2: Navigate to Tenant Management**
- Click "Admin" menu → "Tenant Management"
- Or direct: `https://yourapp.com/admin/tenants`

### **Step 3: Create Hospital**
Click **"Create Tenant"** button and fill:

```
Organization Name:      Dhyan Hospital
Organization Type:      HOSPITAL
Email:                  admin@dhyanhospital.com
Phone:                  +91-1234567890
Subscription Plan:      ENTERPRISE
Custom Subdomain:       dhyan
Address:                123 Hospital Street, City
```

Click **"Create Tenant"** → Done! ✅

### **Result**
- Hospital created instantly
- URL: `https://dhyan.mediqzy.com`
- Data isolated in database
- Ready for doctors/staff to login

---

## 🔧 What Happens Behind the Scenes

```
Admin clicks Create Tenant
    ↓
POST /api/platform/tenants (with auth token)
    ↓
Backend creates:
  - Entry in "Tenants" table
  - Unique slug & subdomain
  - Isolation via tenant_id
    ↓
Frontend shows success
    ↓
Dhyan Hospital is live!
```

---

## 🎯 Management Features

### **View All Hospitals**
- See all created organizations
- Filter by type (Hospital, Clinic, Lab, etc.)
- Filter by status (Active, Suspended, Pending)
- Search by name, email, or domain

### **Suspend/Activate**
- Click on hospital row
- "Suspend" button → temporarily disable
- "Activate" button → re-enable

---

## 📋 Tenant Types Supported

- HOSPITAL
- CLINIC
- LAB
- PHARMACY
- CORPORATE
- TPA (Third Party Administrator)
- PSU (Public Sector Unit)
- NGO

---

## 🔐 Admin Permissions

Only users with valid admin token can:
- Create tenants
- View all tenants
- Suspend/Activate
- Manage domains

Staff users can only see their own hospital's data (multi-tenancy isolation).

---

## 🚀 Next Steps

After creating a hospital:

1. **Hospital login**: `https://dhyan.mediqzy.com/api/hospital/auth/login`
2. **Create hospital admin account**
3. **Setup staff, departments, etc.**
4. **Configure settings**
5. **Start receiving appointments**

---

## 💡 Tips

- Use unique subdomains (dhyan, apollo, max, etc.)
- ENTERPRISE plan for hospitals with multiple branches
- Support email: support@mediqzy.com
- For bulk import of multiple hospitals, contact admin

---

## 🔗 Related

- [Multitenancy Architecture](../MEDIQZY_PAAS_ARCHITECTURE.md)
- [Hospital Practice Routes](server/routes/hospital/practice.route.js)
- [Tenant Middleware](server/middleware/tenant.middleware.js)
