# Tenant Module Packs

When creating an organization, choose a **tenant type**. The platform attaches a **module pack** and binds it to the tenant’s **personalised domain**.

## Personalised domain first

Primary access is always the tenant subdomain (Cloudflare `*.mediqzy.com`):

| Example | Type | Login |
|---|---|---|
| `https://hycare.mediqzy.com/hospital/login` | hospital | hospital pack (+ `/hr/login`) |
| `https://ajdental.mediqzy.com/login` | clinic | clinic pack |
| `https://{lab}.mediqzy.com/lab/login` | lab / diagnostic_centre | lab pack |

`app.mediqzy.com{appLoginPath}` remains a platform fallback (e.g. `/clinic/login`).

Type prefixes (`/clinic`, `/hospital`, `/lab`, …) organise modules **under** that personalised host — they do not replace the subdomain.

## Core types

| Type | Tenant host login | Module prefix |
|---|---|---|
| `hospital` | `/hospital/login` | `/hospital` |
| `clinic` | `/login` | `/clinic` |
| `lab` | `/lab/login` | `/lab` |
| `diagnostic_centre` | `/lab/login` | `/lab` |
| `corporate` | `/corporate/login` | `/corporate` |
| `homecare` | `/homecare/login` | `/homecare` |
| `ambulance` | `/ambulance/login` | `/ambulance` |
| `pharmacy` | `/pharmacy/login` | `/pharmacy` |

Also supported: `tpa`, `insurer`, `broker`, `psu`, `ngo`.

## Where packs live

- Registry: `server/config/tenant-module-packs.js`
- Attached on create into:
  - `features.modules` + `features.module_*` flags
  - `settings.module_prefix` / `login_path` / `tenant_domain` / `portal_login_url`
  - `metadata.module_pack` (full module defs + portal URLs)

Helpers: `buildTenantPortalUrls()`, `buildTenantModuleAttachment(type, features, { subdomain })`.

## APIs

```
GET  /api/superadmin/tenants/entity-types
GET  /api/superadmin/tenants/module-packs
GET  /api/superadmin/tenants/module-packs/:type
POST /api/superadmin/tenants/tenants                    # attaches pack + portal URLs
POST /api/superadmin/tenants/tenants/:id/modules/attach # re-attach / migrate
```

Optional body on create/attach: `{ "enabled_modules": ["dashboard", "patients", ...] }`.

Create response `access.login_url` is the personalised domain, e.g. `https://ajdental.mediqzy.com/login`.

## Migration

Add `diagnostic_centre` to PG ENUM:

```bash
node server/migrations/add-diagnostic-centre-tenant-type.migration.js
```
