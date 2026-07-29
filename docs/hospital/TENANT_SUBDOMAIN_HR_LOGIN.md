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

2. **DNS (Cloudflare)** — this is the real blocker  
   Zone NS are already Cloudflare (`karl` / `diana`). There is **no** `*.mediqzy.com` wildcard DNS today (`hycare` = NXDOMAIN).

   Create either:
   - `hycare` → same origin/proxy target as `app` (CNAME or A/AAAA), **proxied (orange cloud)**  
   - or zone-wide `*` → same as `app` (then keep explicit overrides for `app` / `api` / `video`)

3. **TLS** — already covered; no ACM / CloudFront alt-domain work required  
   Live edge cert (Cloudflare Universal SSL, Google Trust Services) SANs:

   ```
   DNS:mediqzy.com, DNS:*.mediqzy.com
   ```

   Verified: SNI `hycare.mediqzy.com` already returns that wildcard cert.  
   Browser HTTPS works as soon as the DNS record exists and is proxied.

   CloudFront `E1UX9F7HUS472M` + S3 `app.mediqzy.com` sit **behind** Cloudflare for the SPA. Adding a CloudFront alternate domain / ACM cert is only needed if you grey-cloud or point DNS straight at CloudFront — not for the current orange-cloud path.

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
- Until the Cloudflare DNS record exists, `hycare.mediqzy.com` is NXDOMAIN; sending `Host: hycare.mediqzy.com` to Cloudflare anycast returns **530 / error 1016** (Origin DNS error).
- Prefer keeping `subdomain` equal to the DNS label (`hycare`) so Host → tenant lookup is 1:1.
