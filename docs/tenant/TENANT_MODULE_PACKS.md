# Tenant Module Packs

When creating an organization, choose a **tenant type**. The platform attaches a **module pack** and binds it to the tenant’s **personalised domain**.

## Personalised domain first

| Example | Type | Access |
|---|---|---|
| `https://hycare.mediqzy.com/doctor/login` | hospital | **Role logins** (not `/hospital/login`) |
| `https://ajdental.mediqzy.com/login` | clinic | Clinic admin login |
| `https://{lab}.mediqzy.com/lab/login` | lab / diagnostic_centre | Lab portal |

### Hospital role logins (Hycare pattern)

On `{hospital}.mediqzy.com`, staff open **their role path**:

| Role | URL |
|---|---|
| Doctor | `https://hycare.mediqzy.com/doctor/login` |
| Nurse | `https://hycare.mediqzy.com/nurse/login` |
| Front desk | `https://hycare.mediqzy.com/frontdesk/login` |
| Lab | `https://hycare.mediqzy.com/lab/login` |
| Pharmacy | `https://hycare.mediqzy.com/pharmacy/login` |
| MRD | `https://hycare.mediqzy.com/mrd/login` |
| HR | `https://hycare.mediqzy.com/hr/login` |
| Accounts | `https://hycare.mediqzy.com/accounts/login` |
| OT / ICU / Security / … | `/{role}/login` on the same host |

`/hospital/login` is **not** the staff entry point. The subdomain identifies the hospital; the path identifies the role.

## Core types

| Type | Tenant host login | Module organisation |
|---|---|---|
| `hospital` | `/{role}/login` (see above) | role portals + `/hospital/*` ops |
| `clinic` | `/login` | `/clinic/*` |
| `lab` | `/lab/login` | `/lab/*` |
| `diagnostic_centre` | `/lab/login` | `/lab/*` |
| `corporate` | `/corporate/login` | `/corporate/*` |
| `homecare` | `/homecare/login` | `/homecare/*` |
| `ambulance` | `/ambulance/login` | `/ambulance/*` |
| `pharmacy` | `/pharmacy/login` | `/pharmacy/*` |

Also supported: `tpa`, `insurer`, `broker`, `psu`, `ngo`.

## Where packs live

- Registry: `server/config/tenant-module-packs.js`
- Attached on create into:
  - `features.modules` / `features.role_logins`
  - `settings.tenant_domain` / `portal_role_logins` / `module_prefix`
  - `metadata.module_pack` (includes `role_logins[]` with full URLs)

Helpers: `buildTenantPortalUrls()`, `buildTenantModuleAttachment(type, features, { subdomain })`.

## APIs

```
GET  /api/superadmin/tenants/entity-types   # includes portal_role_login_examples
GET  /api/superadmin/tenants/module-packs
POST /api/superadmin/tenants/tenants
POST /api/superadmin/tenants/tenants/:id/modules/attach
```

## Migration

```bash
node server/migrations/add-diagnostic-centre-tenant-type.migration.js
```
