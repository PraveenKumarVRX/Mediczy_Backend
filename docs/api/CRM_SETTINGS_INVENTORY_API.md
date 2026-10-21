# CRM connection inventory

Base: `/api/crm/communication-hub`. Requires the existing CRM bearer access token and its authenticated tenant context. This inventory does **not** activate delivery adapters. Messaging uses the platform's provisioned providers. Exotel/LiveKit provisioning remains in `/crm/contact-center`.

Read permission: `communication:read`. Change, storage verification, disable and disconnect permission: `communication:configure` — Business Head, Marketing Head or administrator. Ordinary messaging permission grants no credential-administration access.

## Read

`GET /integrations` returns `{success:true,data:[...]}` with nine channel records. An absent record has `revision:null`. Saved records carry an opaque `revision` string and `credentialFields`, an array of stored field names. Legacy bundles use `credentialFields:null` until their next save; the UI does not infer which individual fields were stored. Secret values, encrypted bundles and credential fingerprints are excluded.

Every record includes `deliveryMode:"inventory_only"` and `deliveryActive:false`. `configured` means an inventory record was saved. It does not mean that the provider is connected. Provider-specific fields and validation are defined in [the shared schema](../../shared/crm-channel-schema.mjs).

## Save or rotate

`PUT /integrations/:channel`

```json
{
  "provider": "google_ads",
  "config": { "customerId": "1234567890", "clientId": "your-oauth-client-id" },
  "accountRef": "marketing-account",
  "credentials": { "clientSecret": "new-secret-value" },
  "removeCredentials": [],
  "expectedRevision": "revision-from-the-most-recent-read"
}
```

Send `expectedRevision:null` only when the latest read established that the record does not exist. Omitted credential fields are retained for the same provider. The UI omits blank secret inputs. Explicit removal uses `removeCredentials:["refreshToken"]`; a field cannot be submitted and removed simultaneously. Provider replacement requires `replaceProvider:true`, starts a new credential bundle and discards old-provider credentials. The browser requires an explicit confirmation.

Unknown providers, unknown public/secret fields, secret fields in `config`, invalid email/port/phone/URL values and unsupported public values are rejected with 400. Field errors appear in `fields`. Calling configuration is rejected here with guidance to use the contact center. Client-controlled status or credential references are rejected.

The server serializes tenant/channel writes, checks the revision, merges changed credentials, encrypts them with AES-256-GCM and commits the inventory update and audit entry together. A concurrent change returns 409. Audit failure rolls back the write. Missing encryption configuration or an unreadable bundle fails closed with 503.

## Verify stored encryption

`POST /integrations/:channel/test` with `{ "expectedRevision": "..." }` verifies only that the saved credential bundle decrypts. The response states that provider connectivity and delivery were not tested. Verification requires a saved, enabled record with credentials. It never sends a message or contacts the provider. The UI disables verification while there are unsaved changes.

## Disable or disconnect

- `POST /integrations/:channel/disable` with `{ "expectedRevision": "...", "confirm": "disable" }` marks inventory disabled and prevents storage verification.
- `DELETE /integrations/:channel` with `{ "expectedRevision": "...", "confirm": "disconnect" }` deletes the inventory record and encrypted credentials. The response is `{success:true,data:{channel:"...",disconnected:true}}`.

Both operations are authorized, revision-checked, audited and confirmed in the UI. They affect inventory records. Live provider configuration is managed separately and is not disconnected by these actions.

Generic digital-integration creation cannot write `integrationType:"communication"`. Manual health updates cannot rewrite communication inventory or return its encrypted credentials.

## Client behavior

Profile authorization is refreshed before editing. Cached profile failures remain visible with retry. Failed initial inventory loads expose retry without invented empty records; refresh errors retain the prior snapshot and disable writes. Refresh pauses while any card is dirty or an operation is pending. Save errors and conflicts preserve drafts. Explicit discard, provider replacement and disconnect explain their effects. Secrets remain in component memory and are never persisted into local/session storage. Navigation prompts protect unsaved edits where supported by the browser.
