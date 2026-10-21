# Contact-center provider configuration

The contact-center settings support Exotel, TeleCMI, Zoom Phone, Airtel IQ Voice click-to-call, Twilio and Plivo. Existing LiveKit calling remains available. Adding an option does not configure or enable an account. No live provider credentials or configuration are changed during this release.

Exotel uses its existing native adapter. Zoom Phone opens the signed-in licensed desktop client; the application does not claim that a call connected or import Zoom recordings. The other four providers require an enterprise connector implementing the contract below. Direct vendor adapters are not included in this release.

## Connector contract

The selected credential reference identifies server-only environment settings `<PREFIX>_CONNECTOR_URL`, `<PREFIX>_CONNECTOR_SECRET` (at least 32 characters), and `<PREFIX>_CONNECTOR_ACCOUNT`. URLs must be HTTPS with no embedded credentials, query or fragment. Tenant/provider/number/reference must also match `VOICE_PROVIDER_BINDINGS`. Provider-specific entries use `VOICE_PROVIDER_BINDINGS[tenantUid].providers[provider]`; legacy flat bindings remain Exotel bindings. Credentials are never entered in the browser.

Requests are POST JSON containing `version:1`, `provider`, `account`, `tenantUid`, `number` and `operation` (`dial` or `details`). Dial adds `agentNumber`, `to`, `correlation`, `record`, `callbackUrl`; details adds `callId`.

Headers are `X-Voice-Timestamp`, `X-Voice-Nonce`, and `X-Voice-Signature`. The signature is hexadecimal HMAC-SHA256 of `timestamp + '.' + nonce + '.' + rawRequestBody`. The connector must authenticate the signature, enforce a short timestamp window, reject replayed nonces, authorize the tenant/account/number, and normalize vendor responses. It must not create another vendor call while replaying a request or checking details.

The response contains matching `provider`, `account`, `tenantUid`, and `call`. Its `X-Voice-Signature` signs the original request timestamp and nonce plus the raw response body using the same format. `call.Sid` must be 8–128 alphanumeric/underscore/hyphen characters. Supported normalized fields are `Sid`, `Status`, `Duration`, `DateUpdated`, `CustomField`, `Direction`, `From`, `To`, `PhoneNumberSid`. `CustomField` preserves the dial correlation; `PhoneNumberSid` identifies the configured business number. Recordings stay with these providers. An HTTP error may include `rejected:true` only when the connector can prove no call originated. Ambiguous failures are not retried automatically.

Callbacks to `/api/contact-center/hooks/providers/{provider}/{tenantUid}` provide a call identifier only. Callback body status is untrusted; the application fetches a signed authoritative details response before reconciliation.

Switching provider/number/reference is blocked while the previous provider has active or unreconciled calls. Prior configuration is retained on call records for reconciliation. The additive migration retains forced tenant RLS and existing table ownership. Roll back the application without dropping provider history.
