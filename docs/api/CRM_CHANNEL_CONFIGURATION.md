# CRM channel configuration

CRM Settings now exposes tenant-scoped configuration for email, WhatsApp, SMS,
voice/calls, Facebook, Instagram, LinkedIn, Google Ads, and YouTube.

## API

All calls require a CRM bearer token. Read access requires `communication:read`;
writes and tests require `communication:write`.

```http
GET /api/crm/communication-hub/integrations
PUT /api/crm/communication-hub/integrations/:channel
POST /api/crm/communication-hub/integrations/:channel/test
```

`channel` is one of `email`, `whatsapp`, `sms`, `calls`, `facebook`,
`instagram`, `linkedin`, `google_ads`, or `youtube`.

Example write:

```json
{
  "provider": "meta",
  "accountRef": "clinic-whatsapp-prod",
  "config": { "phoneNumberId": "123456789", "senderNumber": "+919000000000" },
  "credentials": { "accessToken": "provided-secret" }
}
```

The response contains `credentialsConfigured` and masked configuration only;
the credential value is never returned. Repeating a write without a
`credentials` object keeps the existing secret. `test` verifies that the
encrypted secret can be decrypted and records the check; live delivery tests
remain provider-adapter specific.

## Key management

Set `CRM_CREDENTIAL_ENCRYPTION_KEY` to a dedicated 32-byte AES key encoded as
64 hexadecimal characters. Do not reuse `JWT_SECRET` or a tenant-provided
value. The migration `20261015000000-crm-channel-credentials` adds the
encrypted credential columns to `crm_marketing_integrations`.

The Calls card configures click-to-call/telephony account details and preserves
CRM call activity logging. It does not place a call by itself.

