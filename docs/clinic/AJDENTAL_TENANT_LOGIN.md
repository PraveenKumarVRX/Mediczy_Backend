# AJ Dental Clinic — complete portal flow

## Canonical URL

```
https://ajdental.mediqzy.com/login
```

(` /clinic/login` on the tenant host redirects here.)

## Credentials

| | |
|---|---|
| Email | `admin@ajdental.com` |
| Password | `Mayden@321` |

## What is wired

1. **Tenant** (`tenants`) — type `clinic`, subdomain `ajdental`
2. **Hospital login row** (`hospitals`) — powers `POST /api/clinic/login`
3. **Clinic admin user** (`users.role=clinic_admin`) — staff/patient management identity
4. **Portal JWT** — includes `tenantId`, `hospitalId`, `clinicSlug`
5. **Dashboard APIs** (real DB, tenant-scoped):
   - `GET /api/clinic/dashboard/stats`
   - `GET|POST /api/clinic/dashboard/patients`
   - `GET|POST /api/clinic/dashboard/appointments`
   - `GET|POST /api/clinic/dashboard/staff`
   - `GET|PUT /api/clinic/dashboard/profile`
6. **UI modules** — Dashboard, Patients, Appointments, Doctors, Staff, Settings
7. **Admin create** — creating a clinic tenant also provisions hospital login + clinic_admin

## One-time EC2 provision (if not already done)

```bash
cd /home/ubuntu/Mediczy/server
git pull   # or checkout this branch
CLINIC_NAME='AJ Dental Clinic' \
CLINIC_CODE=AJDENTAL \
CLINIC_SUBDOMAIN=ajdental \
CLINIC_EMAIL=admin@ajdental.com \
CLINIC_PASSWORD='Mayden@321' \
npm run fix:clinic-login
```

Or after deploy:

```bash
curl -X POST https://api.mediqzy.com/api/admin/clinics/ensure-login \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "AJ Dental Clinic",
    "code": "AJDENTAL",
    "subdomain": "ajdental",
    "email": "admin@ajdental.com",
    "password": "Mayden@321",
    "specialty": "dental",
    "tenant_id": 56
  }'
```

## Flow

```
Admin creates clinic tenant (optional)
        ↓
ensure-login / auto-provision
  → tenants + hospitals + clinic_admin
        ↓
https://ajdental.mediqzy.com/login
        ↓
clinicToken (tenant-linked)
        ↓
Dashboard → Patients / Appointments / Staff / Settings
```

## DNS

Covered by Cloudflare `*.mediqzy.com` → same origin as `app`.
