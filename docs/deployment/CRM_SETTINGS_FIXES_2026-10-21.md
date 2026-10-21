# CRM settings fixes — 21 October 2026

All 14 findings in the [settings audit](../audits/CRM_SETTINGS_AUDIT_2026-10-21.md) are addressed and deployed at https://app.mediqzy.com/crm/settings. Product source: `2c6e9291`. Acceptance scripts: `1094c168`. The release uses the existing API deployment path and requires no database migration or secret-store changes.

## Behavior

Credential inventory administration now requires `communication:configure`, consistently enforced by the browser and API for Business Head, Marketing Head and administrator roles. Ordinary messaging roles retain inventory reads and message-sending permissions. Generic digital-integration creation and manual health updates cannot bypass inventory authorization or expose its encrypted bundle.

Provider-specific fields and typed validation are shared across client and server. Secret rotation merges omitted fields into the saved bundle under a tenant/channel transaction lock. An opaque revision rejects stale changes with 409, including concurrent first creation. Explicit provider replacement starts a new secret bundle after confirmation. Per-field removal, disable and disconnect are explicit operations. Inventory changes and audit history commit together; audit failure rolls back the change. Audit entries contain actor IDs and changed field names, with no submitted secrets.

Drafts remain in component memory. Save failures preserve them; refresh and storage verification pause while edits are unsaved, and refresh also pauses during pending operations. Explicit discard restores the saved snapshot. Navigation prompts protect unsaved work where supported by the browser. Initial load failures show retry without fabricated empty records. Later refresh failures preserve data and disable writes. A failed profile refresh visibly labels cached details and pauses editing until retry succeeds.

**Delivery scope:** saved records are explicitly labelled **inactive connection inventory**. They do not configure messaging adapters. Calls links to the existing contact-center workspace for approved Exotel/LiveKit provisioning. “Verify encrypted storage” checks decryption only and explicitly states that provider connectivity and delivery were not tested. Disable/disconnect confirmations explain that live provider configuration is managed separately. This resolves SET-14 using the audit's inactive-inventory option; no new live delivery adapter was activated.

## Finding closure

| Finding | Implementation and acceptance |
|---|---|
| SET-01 | Dedicated client/server configuration permission; Business Head and Marketing Head controls appear; five role browser cases pass. |
| SET-02 | Credential routes and health changes enforce configuration permission; 42 HTTP permission/read tests pass across seven roles. Generic integration creation rejects communication inventory. |
| SET-03 | Shared provider field schema; SendGrid exposes API key, Twilio exposes its account/auth fields; Calls exposes the operational contact-center link. Provider replacement browser test passes. |
| SET-04 | Serialized credential merge, revision check and explicit per-field removal; real local PostgreSQL tests verify retained siblings, concurrent rejection and rollback. |
| SET-05 | Storage-only naming/results, revision submission, dirty verification guard, visible health message and operation-specific busy text; browser and database tests pass. |
| SET-06 | Dirty refresh guard, pending-operation guard, per-card drafts, discard and navigation prompts; cross-card save and cancelled navigation pass. |
| SET-07 | Failed initial read has retry and no editable cards; refresh failure retains the snapshot and disables writes; UI/browser recovery cases pass. |
| SET-08 | Cached-profile failure appears even with cached details; no editing before authoritative profile verification; retry browser case passes. |
| SET-09 | Server/client validation rejects mismatched providers, unknown keys, invalid email/port/URL/phone values and unsupported public values. Field errors preserve drafts. |
| SET-10 | Status/alert semantics, field-specific names/descriptions, focusable errors, explicit confirmations and 44px secret controls; programmatic/UI/browser checks pass. |
| SET-11 | Scoped dark settings palette with measured normal-text minimum 7.15:1; all eight visual cases pass. |
| SET-12 | Canonical Mediqzy logo/title visible at phone widths, channel navigation and provider-filtered fields; 320/390/1440px views pass without horizontal overflow. |
| SET-13 | Confirmed, authorized, revision-checked and audited disable/disconnect; explicit field removal. Disabled inventory cannot be verified; disconnect deletes the record/bundle. |
| SET-14 | Inventory-only treatment, `deliveryActive:false` responses, honest verification scope and contact-center provisioning link; real demo baseline confirms the contract. |

## Validation

| Check | Result |
|---|---|
| API role/route tests | 42 passed |
| Client workflow tests | 18 passed |
| Disposable PostgreSQL integration scenarios | 20 passed |
| Targeted settings TypeScript check | Passed |
| Clean production frontend build | Passed |
| Local built-page checks | 22 passed |
| Production settings browser checks | 23 passed; zero page errors |
| Settings API production smoke | 9 passed; four malformed mutation probes rejected before writes |
| Existing platform smoke | 14 passed, including database isolation, access denials and LiveKit readiness |
| Corporate regression | 4 passed; consent endpoints and direct HR identity remain correct |

The eight visual cases cover light/dark preferences at desktop, mobile and 320px widths, plus profile and inventory failures. Computed contrast uses solid backgrounds and excludes disabled controls/gradients. Screenshots are retained privately. Production verification used existing demo identities, synthetic intercepted browser submissions and malformed rejected API probes. It made no credential changes, provider calls, message sends or patient-data writes.

Reproduce the checks:

```sh
npm test --prefix server -- --runTestsByPath __tests__/crm-channel-permissions.test.js
sudo -n -u postgres node server/scripts/qa/crm-settings-db-integration.mjs
npm test --prefix client -- src/pages/crm/CRMChannelSettings.test.tsx
./client/node_modules/.bin/tsc --noEmit -p client/tsconfig.settings.json
node client/scripts/crm-settings-release-browser.mjs /private/settings-browser.json
node client/scripts/crm-settings-production-smoke.mjs /private/settings-api.json
```

The database harness only connects to a disposable local PostgreSQL database over the local socket. Its production pool import is replaced before evaluation. Browser authentication reads existing approved demo identities and SSM references without printing tokens.

Sanitized results: [verification JSON](../testing/CRM_SETTINGS_FIXES_VERIFICATION_2026-10-21.json). Private evidence: `/home/ubuntu/crm-settings-fix-evidence/20261021/`.

## Deployment and rollback

The API runs under PM2 `mediczy-server` at `/home/ubuntu/Mediczy/server`; its restart count increased once from 11 to 12 for the reload and stabilized. The clean frontend build is `/home/ubuntu/mediqzy-releases/crm-settings-build-20261021-01/client/dist`. It was published to nginx `client/dist` and S3 with older hashed assets retained. CloudFront invalidation `IEMX2M4Y93FEP5D9ABTS8OHC4X` completed.

Public index SHA-256: `2ff532708470b97a0422fc7879d724b25b4d7ac452875c98a2bc554fa6361b1a`.

The previous index is retained privately as `previous-index.html`. The reviewed prior API files are retained in `api-rollback.tar`; its base is `8a74e94c`. Rollback restores those specific API files on the established workspace deployment path and the previous index, reloads PM2 and repeats the smoke checks. The earlier incomplete corporate package remains inactive and must not be activated. No rollback should point production at that package.

Unrelated local DB/nursing/scribe changes were preserved. Full provider delivery acceptance remains a separate operational workflow using approved provider credentials and recipients.

## Contract references

The [inventory API contract](../api/CRM_SETTINGS_INVENTORY_API.md) describes revision checks, per-field secret updates and destructive-action confirmation. Provider field choices follow the official [SendGrid getting-started guide](https://www.twilio.com/docs/sendgrid/for-developers/sending-email/api-getting-started), [Twilio message resource](https://www.twilio.com/docs/messaging/api/message-resource) and [Google Ads authentication guidance](https://developers.google.com/google-ads/api/docs/api-policy/developer-token). These references define credential inventory fields; they are not evidence of a successful live connection.
