# API contract (OpenAPI) and integration layer

Status: implementation expanded 2026-11-14 (OpenAPI 1.2.1). Owner: platform backend.

Two rules came out of the API-tooling review (Postman, OpenAPI, Apigee, Kong, MuleSoft):

1. **OpenAPI is the source of truth for the app-facing API.** The My SmartHealth app, partners
   (SmartCRM, TPAs) and our own tests build against one spec, kept honest by tests.
2. **Every third-party API call goes through the integration layer** (`server/integrations/`),
   which gives each vendor a kill switch, configuration check, host allow-list, timeout, circuit
   breaker, safe retries and metrics. This is what MuleSoft sells, done in our code, with the data
   staying on our servers.

Kong (self-hosted) is deferred until outside systems call Mediqzy at volume; nginx + Cloudflare +
the existing middleware cover today's traffic. Apigee and MuleSoft were rejected: cost, an extra
data processor for PHI under the DPDP Act, and traffic leaving AWS Mumbai.

---

## 1. The API contract

| What | Where |
|---|---|
| Spec source (OpenAPI 3.0.3, JS modules) | `server/openapi/index.js`, `components.js`, `paths.js` |
| Contract tooling (route comparison, response validator) | `server/openapi/contract.js` |
| Committed artifact for the app team and partners | `server/openapi/dist/app.openapi.json` |
| Served (admin only) | `GET /api/admin/openapi/app.json`, Swagger UI at `/api/admin/openapi/docs` |
| Tests | `server/__tests__/openapi-contract.test.js` |
| Live check against the running server | `server/scripts/qa/openapi-contract-smoke.mjs` |

The spec is written as JS modules rather than YAML so schemas can be shared without a YAML parser
in production and so a typo is a syntax error. The older comment-generated docs at `/api-docs`
still exist; they are not the contract.

### Contract coverage

| Area | Routers | Coverage |
|---|---|---|
| Corporate employee, network, claims, policy wallet | `employee-network.route.js` | every route |
| SmartCRM link and in-app enrolment (ADR-001) | `employee-insurance.route.js` | every route |
| Address lookup | `address.route.js` | autocomplete and place details only |
| Admin: integrations, the contract itself | `admin-integrations.route.js`, `openapi.route.js` | every route |
| Account, login/OTP and sessions | `user.route.js`, `auth.login.route.js`, `auth.token.route.js` | every declared operation |
| Appointments and labs | `appointment.route.js`, `lab.route.enhanced.js`, `lab-tests.route.js` | every declared operation |
| Pharmacy catalogue and patient orders | `pharmacy.route.js`, `patient-pharmacy-orders.route.js` | every declared operation |
| Billing, payments and membership | `billing.route.js`, `payment.route.js`, `membership.route.js`, `membership-plans.route.js` | every declared operation |

The expanded contract contains **191 paths / 210 operations**. The static reviewed inventory in
`server/openapi/mobile-route-manifest.js` is compared against the source route declarations by
`mobile-openapi-contract.test.js`. `mobile.js` holds the request/response schemas for the main
booking, history, checkout, payment and membership flows. Extensible resource metadata and
secondary provider/admin responses permit additional fields; those envelopes do not freeze every
nested provider-specific field. OAuth redirects are still supplied by their existing routes;
the code-exchange operation is documented separately.

Response schemas were taken from live responses of the running server and from the route code,
not written from memory.

### What the tests enforce

- The spec is valid OpenAPI 3.0 (`@apidevtools/swagger-parser`).
- The committed `dist/app.openapi.json` equals what `server/openapi/` builds.
- Every operation documents `401` and at least one `2xx`; every `{param}` is declared.
- For each **fully documented** router: every route it serves is in the spec, and nothing is in
  the spec that it does not serve. For a **partly documented** router: everything documented exists.
- The response validator catches a removed required field, a wrong enum value and a wrong type.

The live check calls the local server with a signed QA token and validates every response
against the spec. It refuses any base URL other than localhost, because scripts must never call
`app.mediqzy.com`:

```bash
cd server && node scripts/ssm-env-loader.mjs scripts/qa/openapi-contract-smoke.mjs [--user 7646]
```

### Changing the API

1. Change the route.
2. Change `server/openapi/paths.js` (and `components.js` for new shapes) in the same commit.
3. `cd server && npm run openapi:export` to refresh the artifact.
4. Bump `APP_SPEC_VERSION` in `server/openapi/index.js` if the app can notice the change:
   removing or retyping a response field, or adding a required request field, is **major**;
   a new endpoint or optional field is **minor**.
5. Run the contract test and, after deploying, the live check.

To bring another router under the contract, document its operations and add its static inventory
to `mobile-route-manifest.js` (or `FULLY_DOCUMENTED` in the original test). Do not generate the
inventory dynamically from the current source during a test: that would hide route drift.

### Error shapes

Every error has `success: false` and `message`. Two families add a stable `code` to branch on:
`IntegrationError` (`INTEGRATION_*`, below) and `SmartCrmError` (`NOT_LINKED`,
`ENROLMENT_CLOSED`, …). Clients should branch on `code`, never on `message`.

---

## 2. The integration layer

| What | Where |
|---|---|
| Core: `defineIntegration()`, `IntegrationError` | `server/integrations/core/integration.js` |
| Registry | `server/integrations/core/registry.js` |
| Catalogue of every vendor | `server/integrations/catalog.js` |
| Reference vendor client | `server/integrations/google-places.js` |
| Route helper | `server/integrations/http.js` (`sendIntegrationError`) |
| Admin status | `GET /api/admin/integrations`, `GET /api/admin/integrations/:id` |
| Tests | `server/__tests__/integration-layer.test.js` |

### What every call gets, before anything leaves the box

| Step | Behaviour |
|---|---|
| Kill switch | `INTEGRATION_<ID>_ENABLED=false` (e.g. `INTEGRATION_GOOGLE_PLACES_ENABLED`) stops every call |
| Configuration | the vendor's required env var names must be set; status reports missing names, never values |
| Host allow-list | https only, to the vendor's known hosts; redirects are never followed, so a key cannot be sent elsewhere |
| Circuit breaker | per vendor, optionally per key (e.g. tenant); 5xx, 429, timeouts and network errors count, 4xx do not |
| Timeout | always (default 8 s, per vendor) |
| Retries | only idempotent calls (GET/PUT/DELETE, or explicitly marked), only for vendor-down errors, with backoff |
| Metrics | calls, ok, failed, refused, retries, p50/p95 latency, last success/failure, last error **code**; never payloads, so no PHI |

### Error codes

| Code | HTTP | Meaning | Retryable |
|---|---|---|---|
| `INTEGRATION_DISABLED` | 503 | kill switch is off | no |
| `INTEGRATION_NOT_CONFIGURED` | 503 | a required setting is missing | no |
| `INTEGRATION_CIRCUIT_OPEN` | 503 | vendor failing; fast refusal (`Retry-After: 60`) | yes |
| `INTEGRATION_TIMEOUT` | 503 | vendor did not answer in time | yes |
| `INTEGRATION_UNAVAILABLE` | 503 | network error | yes |
| `INTEGRATION_UPSTREAM_ERROR` | 502/503 | vendor 5xx/429, or a vendor-level failure status | yes |
| `INTEGRATION_REJECTED` | 502/400/404 | vendor refused our request (4xx), or "not found" | no |
| `INTEGRATION_BAD_RESPONSE` | 502 | unreadable or oversized answer | no |
| `INTEGRATION_HOST_NOT_ALLOWED` | 500 | a bug: URL outside the vendor's hosts | no |

Routes pass these on with `sendIntegrationError(res, error, fallbackMessage)`. Vendor messages
and payloads are never echoed to the client.

### The catalogue (2026-11-14)

19 vendors are registered. `managed` says how their calls are made today:

| managed | Vendors |
|---|---|
| `core` (on the layer) | google-places plus all 17 previously unmanaged vendors below |
| `own-client` (hardened client of its own) | smartcrm (private mTLS link, per-tenant breakers) |
| `core` (migrated through HTTP/SDK adapters) | abdm, nhcx, whatsapp-cloud, twilio, gupshup, infobip, aws-ses, smtp, razorpay, livekit, firebase-fcm, apple-signin, llm-groq, llm-openai, llm-sarvam, isha, elevenlabs |

13 of the 19 receive health information (`dataClass: phi`). There are now **18 core-managed
entries, 1 own-client entry, and 0 unmanaged entries** in the surveyed catalogue. This is transport
coverage, not proof that production credentials, vendor approvals or delivery are configured.

Application imports use `integrations/axios.js`, `fetch.js`, `nodemailer.js`, `twilio.js`,
`razorpay.js`, `livekit.js` and `ses.js`; Firebase objects use `fcm.js`. The LLM cascade keeps its
routing/prompts and uses a managed custom fetch. Apple JWKS uses jose's custom-fetch hook.
ABDM/NHCX use vendor-bound transports so an invalid configured URL cannot bypass the allow-list.
`managed-vendor-imports.test.js` prevents runtime code from importing these raw transports again.
Internal SIB requests retain their signed transport; external SIB-client requests are managed.

SDK operations preserve existing result/error shapes. Mutating calls have no integration retries.
SDKs that support cancellation receive an abort signal or native timeout; the integration deadline
bounds waiting for opaque SDKs too. A timeout cannot prove non-delivery, so callers must reconcile
uncertain messaging/payment outcomes instead of blindly resubmitting them.

SMTP uses per-mailbox configuration, SES uses the SDK credential chain, Firebase uses an initialized
Admin app, and public Apple JWKS verification needs no client secret. Their per-operation setup is
validated by the existing clients rather than requiring unrelated global environment variables.

The legacy WhatsApp service now uses actual Twilio/Meta/Infobip acknowledgements rather than
invented IDs. Unsupported Karix/MessageBird delivery adapters return an explicit unavailable error.
Connection checks state `verified: false` until a real provider exchange proves connectivity.
ABDM fixture tokens/enrolments are unavailable in production, including when sandbox flags are set.

### Moving a vendor onto the layer

1. Make sure its catalogue entry has the right `requiredEnv`, `allowedHosts`, `timeoutMs`,
   `retry` and `dataClass`, and change `managed` to `'core'`.
2. Write `server/integrations/<vendor>.js` on `integration.fetchJson()` (or `call()` for SDKs),
   translating the vendor's failure statuses into `IntegrationError`. `google-places.js` is the
   reference.
3. Point the existing service at it. **No invented data in production**: a fallback fixture is
   allowed only when `NODE_ENV !== 'production'`.
4. Use `sendIntegrationError` in the routes, and document the 503/502 in the OpenAPI spec.
5. Test: the vendor client against a fake fetch, and the production failure path.

The surveyed vendors have been migrated. New vendors still need a catalogue entry and managed
transport. LLM providers remain behind `llm-provider.js`, which continues to own their cascade.

### Rules for new code

- No direct `fetch`/`axios` to a third-party host from services or routes; add a catalogue
  entry and a client on the core.
- Secrets come from SSM (`/mediczy/prod`) or the instance role, referenced by env var name.
- Never log or store vendor payloads in metrics; log the error code.
- A kill switch is an env change plus reload, recorded in SSM — not an in-memory toggle.

---

## 3. Production behaviour that changed

**Address lookup no longer invents addresses.** Before this change, a missing Google key or any
Google failure made `/api/addresses/autocomplete`, `/api/addresses/place/:placeId` and
`/api/doctors/places-autocomplete` return fixtures such as "123 MG Road, Bangalore 560001" with
coordinates, which a patient could save as their address for a home collection or an ambulance.
`GOOGLE_PLACES_API_KEY` is **not set in production**, so this was happening on every request.
Production now answers `503 INTEGRATION_NOT_CONFIGURED`, and the app should let the user type
the address. Set `GOOGLE_PLACES_API_KEY` in SSM `/mediczy/prod` and reload to switch real lookup on.

## Historical verification at adoption

- `openapi-contract.test.js` 17/17, `integration-layer.test.js` 22/22, full server suite green.
- Live check against the running server: 19/19 responses match the contract.


## Verification of the expanded implementation

Run the full backend suite (`cd server && npm test -- --runInBand`) and the contract export.
Focused coverage includes `managed-vendor-transports`, `managed-messaging`,
`managed-vendor-imports`, `mobile-openapi-contract`, `openapi-contract`, `integration-layer`,
and `abdm-production-no-fixtures` tests. Transport and SDK tests use fake network boundaries:
no real messages, payments or vendor submissions are made.

The local read-only smoke script now checks the added patient read APIs as well. Run it only
against the intended locally running staging backend. Actual vendor credentials and delivery,
database/RLS behavior, and deployment are environment acceptance work, not established by unit tests.

Release status and live validation: [14 November deployment record](../deployment/API_VENDOR_RELEASE_2026-11-14.md).
