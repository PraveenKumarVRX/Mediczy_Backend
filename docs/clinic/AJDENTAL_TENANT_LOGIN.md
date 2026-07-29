# AJ Dental Clinic tenant (AJDENTAL)

## Goal

Dedicated dental clinic portal:

```
https://ajdental.mediqzy.com/clinic/login
```

Aliases:

```
https://app.mediqzy.com/clinic/login
https://app.mediqzy.com/clinic/ajdental/login
```

## What was provisioned

| Field | Value |
|---|---|
| Tenant id | `56` (prod) |
| Name | AJ Dental Clinic |
| Code | `AJDENTAL` |
| Subdomain | `ajdental` |
| Type | `clinic` |
| Status | `active` |
| Access URL | `https://ajdental.mediqzy.com` |

DNS for `ajdental.mediqzy.com` is covered by the Cloudflare `*.mediqzy.com` record (same origin as `app`).

## Finish login account (EC2 — required once)

Clinic web login reads the `hospitals` table. Create/update that row + sync tenant slug:

```bash
cd /home/ubuntu/Mediczy/server
git pull
CLINIC_NAME='AJ Dental Clinic' \
CLINIC_CODE=AJDENTAL \
CLINIC_SUBDOMAIN=ajdental \
CLINIC_EMAIL=admin@ajdental.com \
CLINIC_PASSWORD='AjDental@123' \
npm run fix:clinic-login
# or: npm run fix:clinic-login:ssm
```

After deploy, admins can also call:

```bash
curl -X POST https://api.mediqzy.com/api/admin/clinics/ensure-login \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "AJ Dental Clinic",
    "code": "AJDENTAL",
    "subdomain": "ajdental",
    "email": "admin@ajdental.com",
    "password": "AjDental@123",
    "specialty": "dental"
  }'
```

## Login credentials (after ensure script)

| | |
|---|---|
| URL | https://ajdental.mediqzy.com/clinic/login |
| Email | `admin@ajdental.com` |
| Password | `AjDental@123` |

## Notes

- Change the password after first login.
- Frontend Host detection (after deploy) sends `clinic_slug=ajdental` from `ajdental.mediqzy.com`.
- SPA API calls still use `VITE_API_URL=https://app.mediqzy.com/api`.
