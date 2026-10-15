# Showing smart-crm insurance in the Mediqzy patient app

**Status:** Design / feasibility validated — not yet built.
**Date:** 2026-10-14
**Scope:** Let a corporate employee (e.g. Vivriti, HTC) see their health-insurance e-card,
policy, claims and network hospitals inside the Mediqzy patient mobile app, where the insurance
data is owned by the separate **smart-crm** system (`github.com/MySmartHealth/smart-crm`,
`https://smart-crm.in`).

This document is the build reference for the Mediqzy mobile + backend devs, and names the
coordination needed from the smart-crm team.

---

## 1. Context and constraints

- The Mediqzy **patient app is sign-in only** — there is **no sign-up in the app**.
- **Identity and sign-up live in smart-crm.** Individual (retail) members self-sign-up on
  smart-crm; corporate employees are **rostered** (loaded by the employer/insurer), not
  self-signed-up.
- **Vivriti and HTC are not Mediqzy corporates** — they do not exist in the Mediqzy database.
  Their employees have **no Mediqzy account**. They exist only in smart-crm (and Vivriti is
  already served by smart-crm's `Visit Health → smart-crm` SSO).
- Therefore the patient-app sign-in for such an employee must **authenticate against an identity
  that already exists in smart-crm**; Mediqzy never creates it.

smart-crm is a **Django (DRF) + multi-tenant PostgreSQL** backend with a React/Vite SPA. Each
corporate/broker is an **isolated tenant database**, resolved from the request host (or an
`entity_name` param). It already exposes a production member-facing API.

---

## 2. Decision

**Option A — Backend-for-Frontend (BFF) proxy, with federated email-OTP login.**

- The mobile app talks only to the **Mediqzy backend** (`app.mediqzy.com/api`) — one base URL,
  one app session. New native insurance screens.
- The Mediqzy backend **delegates authentication to smart-crm's own employee email-OTP login**,
  then holds the returned smart-crm member token and uses it to read insurance data server-to-server.
- No second login for the employee; no roster duplication into Mediqzy; individual members keep
  self-signing-up on smart-crm untouched.

Rejected alternatives:
- **WebView-embed smart-crm's SPA** — CRM/portal SPAs aren't mobile-shaped; two-token auth bridging;
  bolted-on feel.
- **Bulk-upload Vivriti/HTC rosters into Mediqzy as full corporates** — duplicates roster
  management; only justified if they also buy Mediqzy's *wellness* platform, not just the
  insurance view.

Precedent that de-risks this: smart-crm **already built the cross-app pattern for "Visit Health"**
(`api_v2/auth/visit-sso/`), where an external health app logs its employees into smart-crm. Mediqzy
becomes the same kind of integration partner.

---

## 3. End-to-end flow

```
Mobile app (Mediqzy session)
  │  1. Sign in: employee enters work email (+ company/tenant)
  ▼
Mediqzy backend (BFF)
  │  2. POST smart-crm /api/v2/auth/employee/otp/request/  {username: email, entity_name}
  │       → smart-crm emails a 6-digit OTP (tenant's own SMTP), returns {challenge_id}
  │  3. employee types OTP → POST smart-crm /api/v2/auth/employee/otp/verify/ {challenge_id, otp}
  │       → smart-crm returns {token, refresh_token, user, registered_email/phone}
  │  4. map identity (entity_name, email) → local Mediqzy patient (mirror on first sign-in)
  │     stash the smart-crm member token server-side; issue the Mediqzy app session
  ▼
Insurance screen opened
  │  5. Mediqzy backend calls smart-crm data endpoints with the member token
  │       → policy / claims (Tier 1) · e-card / network hospitals (Tier 2)
  ▼
Rendered natively in the app
```

The smart-crm handshake is entirely server-to-server; the employee only ever sees one sign-in.

---

## 4. Authentication (federated email-OTP)

smart-crm module: `api_v2/employee_login_otp.py`. **Passwordless, email-OTP, tenant-strict.**
Employee resolved by **work email (or Portal Login ID)**, strictly inside their own tenant DB. The
tenant is resolved from the request host or an `entity_name` param.

**Request OTP** — `POST /api/v2/auth/employee/otp/request/`
```jsonc
// body
{ "username": "employee@vivriti.com", "entity_name": "<corporate/tenant>" }
// 200
{ "message": "...", "challenge_id": "<opaque>", "masked_email": "e****@vivriti.com", "sent": true }
```
Errors are honest: no email on the member's profile → 400 "contact HR/admin"; tenant SMTP not
configured → 503; rate-limited → 429.

**Verify OTP** — `POST /api/v2/auth/employee/otp/verify/`
```jsonc
// body
{ "challenge_id": "<opaque>", "otp": "123456" }
// 200 — EXACT shape (also sets HTTP-only JWT cookies; BFF reads the JSON body instead)
{
  "token": "<JWT access>",            // RoleAwareRefreshToken, tenant-scoped
  "refresh_token": "<JWT refresh>",
  "user": {
    "id": 123,                        // APIUser id — unique WITHIN the tenant DB, not global
    "username": "...",
    "email": "employee@vivriti.com",
    "first_name": "...",
    "last_name": "...",
    "name": "Full Name",              // UserMaster.Name
    "role": "member",
    "is_api_user": false,
    "user_role_access": "...",        // UserMaster.UserRoleAccess
    "master_user_role": "member"      // UserMaster.UserRole
  },
  "must_change_password": false,       // always false for OTP login
  "must_verify_contact": false,
  "registered_email": "employee@vivriti.com",   // UserMaster.EmailId
  "registered_phone": "98XXXXXX00",             // UserMaster.MobileNumber
  "login_method": "email_otp"
}
```

**Token refresh** — `POST /api/v2/auth/token/refresh/` (member token is short-lived; BFF refreshes).

Security properties already enforced by smart-crm: single-use challenge, tenant-bound challenge
(no cross-tenant redemption), attempt cap, member re-validated at verify time.

> **Alternative (not recommended for sign-in): AES SSO payload.** `api_v2/auth/visit-sso/` accepts
> an AES-256-CBC-encrypted identity payload + `clientId` and returns a member token with *no user
> action*. Crypto: key = `SHA-256(sharedSecret)`, fixed 16-byte IV, PKCS7 pad, base64url (trivial in
> Node `crypto`). Use this only if you want *silent* login handed off from another app, not an
> in-app sign-in.

---

## 5. Identity mapping

- **Join key: `(entity_name, email)`.** `user.id` is only unique within the tenant DB, so it must
  be qualified by the tenant Mediqzy authenticated against. Email is the stable human half.
- **Mirror the identity into a local Mediqzy patient** on first successful sign-in (not a user-facing
  signup): `name` / `first_name` / `last_name`, `registered_email`, `registered_phone`, `role`.
  This local record anchors any non-insurance app features (consults, records, etc.).
- `EntityName` / `Corporate` appear on the policy and claim rows (§6), confirming the tenant
  (Vivriti / HTC) end to end.
- **Store the smart-crm member `token` + `refresh_token`** in the server-side session (encrypted at
  rest), scoped to that Mediqzy session. Never ship them to the mobile client.

---

## 6. Data contracts — what the insurance screens render

Two tiers. **Tier 1 is DB-backed and stable; Tier 2 is live insurer/TPA pass-through and
insurer-specific.** All endpoints are member-scoped and IDOR-guarded (the authenticated member can
only read their own data); smart-crm resolves the member's `insco / policy_no / emp_no` internally
(`get_basic_details_member`), so the BFF only passes the member token.

> **Open item (resolve in the build spike):** there are two candidate upstreams — the legacy `API`
> app (rich India/TPA fields from `Policy_List`/`ClaimList`, below) and the newer `api_v2` encrypted
> viewsets (`EncryptedPolicy/Claim/Member`, generic US-style fields like `premium_amount`,
> `out_of_pocket_max`, `provider_npi`). Confirm **which set returns populated data under the member
> JWT** for a real corporate member, and standardize on it. Field lists below are the legacy
> `API`-app (India/TPA) shapes, which match the real corporate data model.

### Tier 1 — stable, DB-backed (map straight to fixed UI)

**Policy** — `Policy_List` (`Broker/models.py`)
- `GET …/api/policyall/` → `{ "policy_data": [ <Policy_List row> ] }`
- `GET …/api/policycover/` → `{ "coverage": [ {policyCoverage…} ], "policy_type": [ {PolicyType} ] }`
- Employee-relevant fields: `PolicyNo, PolicyType, ProductName, Corporate, InsCo / InsuranceCompany,
  Payer / PayerBranch (TPA), PolicyEffectiveFrom, PolicyEffectiveTo, SumInsuredPerFamily(+Amount),
  BufferSumInsured, Status`. (Premium / lives-count fields exist but are B2B — hide from employees.)

**Claims** — `ClaimList` (`Broker/models.py`)
- `GET …/api/claimdetails/?emp_id=…` → `{ "Result": [ <ClaimList rows> ] }` (filtered by the
  member's `POLICY_NUMBER` + `Employee_ID`)
- Fields: `Claim_Number, Claim_Type, Primary_Claim_Status, Secondary_Claim_Status,
  Name_of_the_Patient, Relation, Age_of_the_Patient, Ailment, Final_Diagnosis, Name_of_Hospital,
  Hospital_City, Date_of_Admission/Discharge (AdmissionDate/DischargeDate), Total_Bill_Amount,
  Paid_Amount (PaidAmountValue), Outstanding_Amount (OutstandingAmountValue), Sum_Insured,
  Closed_Rejection_Reason, Reason_for_Deduction, Deficiency_Remarks, Cheque_Or_UTR_No/Date,
  POLICY_NUMBER, Employee_ID, EntityName`.
- Rich enough for a "my claims + status timeline + settlement" screen.
- Claim intimation: `…/api/claimintimations/` (member's own intimations).

### Tier 2 — live insurer/TPA pass-through (insurer-specific; render defensively)

**E-card** — `GET …/api/member_ecard/` → smart-crm calls `get_ecard(insco, policy_no, member_id,
emp_no, flags)` against the actual insurer. **Shape varies by `InsCo`** — normalize per insurer or
render generically. Not a fixed schema.

**Network hospitals** — `GET …/api/network_hospital/` → `get_network_hospital(...)` →
`{ "flag": …, "data": [ hospitals ] }`, optionally zone/search-filtered. Also insurer-specific.

> The exact project-level URL prefix for the legacy `API` app (shown here as `…/api/…`) must be
> confirmed from smart-crm's root `urls.py`.

---

## 7. Work breakdown

### Mediqzy backend (BFF) — new
- `insurance-auth.service.js`: proxy `request-otp` / `verify`; map `(entity_name, email)` → local
  patient (mirror on first sign-in); store + refresh the smart-crm member token per session.
- `insurance.service.js` + route group `/api/insurance/my-*`: `my-policy`, `my-coverage`,
  `my-claims`, `my-ecard`, `my-network-hospitals` — each calls the chosen smart-crm upstream with the
  member token and maps the response to a stable Mediqzy shape (Tier 2 passed through more loosely).
- Tenant resolution: email-domain → `entity_name` map, or per-corporate deep-link/build config.

### Mobile app (Expo / React Native) — new
- Corporate-employee **sign-in** screen (email → OTP), hitting the BFF (not smart-crm directly).
- Insurance section: Policy card + coverage · Claims list with status · E-card view · Network-hospital
  finder. (`react-native-webview` is already a dependency if any Tier-2 view is easier embedded.)

### smart-crm side (their team) — coordination, small
- Confirm Mediqzy can call the employee-OTP + data endpoints **server-to-server** from the Mediqzy
  EC2 box (allowed-origins / network / rate limits).
- Confirm how **`entity_name`** is supplied for Vivriti vs HTC (param vs host/subdomain).
- Confirm the member JWT is accepted by whichever data-endpoint set we standardize on (§6 open item).

---

## 8. Preconditions and risks (verify before building)

1. **Roster + email present (make-or-break).** Each target employee must exist in smart-crm's tenant
   DB **with an email on their profile** — the login is email-OTP; no email = no login.
2. **Policy + claims data exists** for them in `Policy_List` / `ClaimList`.
3. **Tenant resolution** for Vivriti vs HTC (isolated DBs) — email isn't globally unique across tenants.
4. **Per-insurer e-card/network shape** (Tier 2) — variable; needs defensive/normalized rendering.
5. **Shared-secret / credential management** across the two orgs' deployments (SSM, rotatable) —
   applies to the AES-SSO alternative, and to any service credential for S2S.
6. **Distribution** (non-technical): something must tell these employees to use the Mediqzy app
   (HR comms / insurer link / app-store push).

Items 1–3 are the go/no-go. **Validate them with real data before any build** (Appendix A).

---

## Appendix A — Precondition checks

> Requires smart-crm **tenant DB** read access, or the smart-crm team runs them. Mediqzy has no
> access to smart-crm's databases. Replace `<EMAIL>` / `<EMPID>` with a real target employee and run
> against the **correct tenant DB** (Vivriti or HTC).

**A1. Is the employee rostered with an email? (the login precondition)**
```sql
-- UserMaster = the login/identity row; EmailId is what the OTP is sent to.
SELECT id, "UserId", "EmpId", "PortalLoginId", "Name", "EmailId", "MobileNumber",
       "UserRole", "EntityName", "PolicyNumber", is_active
FROM   usermaster
WHERE  lower("EmailId") = lower('<EMAIL>')
   OR  "EmpId"   = '<EMPID>'
   OR  "UserId"  = '<EMPID>';
-- PASS: exactly one active UserRole='member' row WITH a non-empty EmailId.
-- FAIL modes: no row (not rostered) · EmailId empty (login impossible) · >1 row (tenant ambiguity).
```

**A2. Does their policy exist? (Tier-1 policy screen)**
```sql
SELECT "PolicyNo", "PolicyType", "ProductName", "Corporate",
       "InsCo", "InsuranceCompany", "Payer",
       "PolicyEffectiveFrom", "PolicyEffectiveTo",
       "SumInsuredPerFamily", "Status"
FROM   policy_list
WHERE  "PolicyNo" = (SELECT "PolicyNumber" FROM usermaster WHERE lower("EmailId") = lower('<EMAIL>') LIMIT 1);
-- PASS: one active policy row with sensible effective dates + sum insured.
```

**A3. Do their claims exist? (Tier-1 claims screen — OK to be empty)**
```sql
SELECT "Claim_Number", "Primary_Claim_Status", "Name_of_the_Patient",
       "Name_of_Hospital", "Date_of_Admission", "Total_Bill_Amount",
       "Paid_Amount", "Outstanding_Amount", "EntityName"
FROM   claimlist
WHERE  "POLICY_NUMBER" = (SELECT "PolicyNumber" FROM usermaster WHERE lower("EmailId") = lower('<EMAIL>') LIMIT 1)
  AND  "Employee_ID"   = '<EMPID>';
-- PASS: zero or more rows (a healthy employee with no claims is fine).
```

**A4. Live API smoke — the single test call (side-effecting: sends a real OTP email).**
> Do **not** run without explicit sign-off — it emails a real person and hits production smart-crm.
```bash
# Step 1 — request OTP (sends an email to the registered address)
curl -sS -X POST 'https://smart-crm.in/api/v2/auth/employee/otp/request/' \
  -H 'Content-Type: application/json' \
  -d '{"username":"<EMAIL>","entity_name":"<CORPORATE>"}'
# Expect: { "challenge_id": "...", "masked_email": "...", "sent": true }

# Step 2 — verify with the code from the inbox → proves the whole identity+token path
curl -sS -X POST 'https://smart-crm.in/api/v2/auth/employee/otp/verify/' \
  -H 'Content-Type: application/json' \
  -d '{"challenge_id":"<FROM_STEP_1>","otp":"<FROM_EMAIL>"}'
# Expect: { "token": "...", "refresh_token": "...", "user": {...}, "login_method": "email_otp" }

# Step 3 — with that token, read one Tier-1 endpoint (confirms data path + which upstream is populated)
curl -sS 'https://smart-crm.in/<API_PREFIX>/api/policyall/' \
  -H 'Authorization: Bearer <TOKEN_FROM_STEP_2>'
```
> Host/subdomain may itself select the tenant; if so, call the tenant's host instead of passing
> `entity_name`. Confirm with the smart-crm team which mechanism applies, and the real `<API_PREFIX>`.

---

## Appendix B — Source references (smart-crm repo)

- Employee email-OTP login: `backend/api_v2/employee_login_otp.py`
  (`request_employee_login_otp`, `employee_login_otp_verify`)
- Login response serializer: `backend/api_v2/serializers.py` (`APIUserSerializer`)
- AES-SSO precedent: `backend/api_v2/views.py` (`visit_sso_login`) +
  `backend/insurance_api/adapters/visit.py` (crypto contract)
- Member-facing data views: `backend/API/views.py`
  (`PolicyCover`, `PolicyDetails`, `ClaimStatus`, `ClaimIntimations`, `MemberEcardClass`,
  `MemberNetworkHospital`) and `backend/API/urls.py`
- Data models: `backend/Broker/models.py` (`Policy_List`, `ClaimList`)
- Encrypted (api_v2) alternative: `backend/api_v2/serializers.py`
  (`EncryptedPolicySerializer`, `EncryptedClaimSerializer`, `EncryptedMemberSerializer`)
