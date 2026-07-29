# Tenant Module Packs

When creating an organization, choose a **tenant type**. The platform attaches a **module pack** with a route/API prefix so modules stay organized for that tenant.

## Core types

| Type | Prefix | Login |
|---|---|---|
| `hospital` | `/hospital` | `/hospital/login` |
| `clinic` | `/clinic` | `/login` (tenant host) |
| `lab` | `/lab` | `/lab/login` |
| `diagnostic_centre` | `/lab` | `/lab/login` |
| `corporate` | `/corporate` | `/corporate/login` |
| `homecare` | `/homecare` | `/homecare/login` |
| `ambulance` | `/ambulance` | `/ambulance/login` |
| `pharmacy` | `/pharmacy` | `/pharmacy/login` |

Also supported: `tpa`, `insurer`, `broker`, `psu`, `ngo`.

## Where packs live

- Registry: `server/config/tenant-module-packs.js`
- Attached on create into:
  - `features.modules` + `features.module_*` flags
  - `settings.module_prefix` / `api_prefix` / `login_path` / `access_path`
  - `metadata.module_pack` (full module defs)

## APIs

```
GET  /api/superadmin/tenants/entity-types
GET  /api/superadmin/tenants/module-packs
GET  /api/superadmin/tenants/module-packs/:type
POST /api/superadmin/tenants/tenants                    # attaches pack
POST /api/superadmin/tenants/tenants/:id/modules/attach # re-attach / migrate
```

Optional body on create/attach: `{ "enabled_modules": ["dashboard", "patients", ...] }`.

## Migration

Add `diagnostic_centre` to PG ENUM:

```bash
node server/migrations/add-diagnostic-centre-tenant-type.migration.js
```
