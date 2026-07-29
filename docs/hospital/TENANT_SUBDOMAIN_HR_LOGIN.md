# Tenant subdomain login (e.g. hycare.mediqzy.com/hr/login)

## Goal

Give each hospital a dedicated HR login host:

```
https://hycare.mediqzy.com/hr/login
```

Path aliases still work:

```
https://app.mediqzy.com/hr/hycare/login
https://app.mediqzy.com/hospital/hycare/hr/login
```

## App behavior

On `*.mediqzy.com` (except reserved `app` / `www` / `api` / …), the HR login page reads the leftmost host label and sends it as:

- `hospital_slug`
- `hospital_domain` (`{slug}.mediqzy.com`)

to `POST /api/hospital/staff/hr/login`.

Backend resolves the hospital via `tenants.slug` / `tenants.subdomain` / `tenants.custom_domain`.

## Ops checklist for Hycare

1. **Tenant row** (active hospital):
   - `slug = hycare` (or `hycare-hospitals` — must match DNS label you choose)
   - `subdomain = hycare`
   - `type = hospital`
   - `status = active`

2. **DNS (Cloudflare)**  
   Create either:
   - `hycare.mediqzy.com` → CNAME → same target as `app.mediqzy.com`  
   - or wildcard `*.mediqzy.com` → CNAME → app CloudFront

3. **TLS / CloudFront**  
   Add `hycare.mediqzy.com` (or `*.mediqzy.com`) as an alternate domain name on the app distribution and attach a matching ACM certificate.

4. **HR user**
   ```bash
   curl -X POST https://api.mediqzy.com/api/hospital/staff/hr/signup \
     -H 'Content-Type: application/json' \
     -d '{
       "hospital_slug": "hycare",
       "email": "hr@hycare.com",
       "password": "HycareHr@123",
       "first_name": "Hycare",
       "last_name": "HR",
       "phone": "9999999999"
     }'
   ```

5. **Open** `https://hycare.mediqzy.com/hr/login`

## Notes

- Production SPA already calls `VITE_API_URL=https://app.mediqzy.com/api`, so API traffic does not depend on the tenant subdomain routing `/api`.
- Until DNS + CloudFront alias exist, `hycare.mediqzy.com` will not resolve (current state).
- Prefer keeping `subdomain` equal to the DNS label (`hycare`) so Host → tenant lookup is 1:1.
