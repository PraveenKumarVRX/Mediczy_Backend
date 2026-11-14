# API contract and vendor migration completion — 14 November 2026

The remaining implementation from `API_CONTRACT_AND_INTEGRATIONS.md` is present locally.
At implementation handoff, no deployment, real message send, vendor payment or production data repair had been performed. The backend and frontend were subsequently deployed; see [the release record](../deployment/API_VENDOR_RELEASE_2026-11-14.md) for live validation and the Nginx frontend publishing path.

## Delivered

- OpenAPI **1.2.0**, **191 paths / 210 operations**, exported to
  `server/openapi/dist/app.openapi.json`.
- Added complete operation inventories for account/login/OTP, sessions, appointments, lab
  directory/booking/history/checkout, pharmacy catalogue/orders, billing/payments, and both
  membership routers. The employee/insurance/address/admin contracts remain included.
- Main flows have request/response schemas, including the separate appointment and LabTest
  references, legacy OTP aliases, captured-payment verification fields, multipart prescriptions,
  JSON lab invoices, binary billing invoices and nullable membership state.
- Reviewed static inventories fail on added/removed routes. The validator now checks schema
  unions used for resource identifiers and alternative sign-in identifiers.
- All **17 previously unmanaged catalogue entries** use shared HTTP or SDK adapters:
  ABDM, NHCX, WhatsApp Cloud, Twilio, Gupshup, Infobip, SES, SMTP, Razorpay, LiveKit,
  Firebase FCM, Apple sign-in, Groq, OpenAI, Sarvam, iSHA and ElevenLabs.
  The catalogue now reports **18 core-managed / 1 own-client / 0 unmanaged**.
- Explicit adapters preserve Axios/fetch results, vendor-specific errors and callback APIs.
  Mutating calls receive no integration retries. HTTP adapters enforce HTTPS/host checks and
  reject redirects. Twilio/Razorpay/LiveKit use controlled transport boundaries; SES receives
  cancellation signals. Opaque SDK calls have a deadline even without cancellation support.
- The existing LLM cascade retains its routing, prompts, consent and quality/governance logic.
  Only its provider transports changed.
- Runtime import checks prevent reintroduction of direct HTTP/vendor SDK imports.
- Legacy Twilio/Meta/Infobip WhatsApp sends now require real provider acknowledgements rather
  than generating a success ID. Unsupported Karix/MessageBird senders fail explicitly.
  Configuration tests report `verified: false` instead of claiming delivery.
- Production ABDM cannot generate mock enrolments or verify sandbox sessions, even when mock
  flags are present. Development/test fixtures remain available.
- The localhost contract smoke script includes the added patient read APIs.

## Validation

Full backend run: **343 suites passed; 3,081 tests passed; 44 tests skipped**.
After the final LiveKit transport refinement, the eight relevant contract/transport/contact-center
suites passed again (**96 tests**). OpenAPI validates with Swagger Parser and its export matches
its source. Changed JavaScript passed syntax checks and `git diff --check` passed.

All new network tests use mocks. SDK-boundary tests exercise the actual Twilio, Razorpay,
LiveKit and SES adapters without contacting vendors. SMTP, Firebase, binary response handling,
kill switches, configuration, blocked hosts, errors and deadlines also have regression coverage.

## Environment acceptance

Deploy through the existing release process, then run the localhost-only smoke check against
that deployment's local listener. Exercise lab/family booking and cancellation with a staging
patient and verify database/RLS behavior. Validate real vendor credentials and sender/template
approvals in staging. Payment creation/capture/refund, messages, push, SMTP/SES and video calls
require deliberate staging transactions; unit tests do not prove those external outcomes.

A deadline on an SDK without cancellation means delivery may still be uncertain. Reconcile using
the vendor/order reference before resubmitting a mutation. Extensible metadata and secondary
provider/admin envelopes intentionally allow additional fields; route coverage does not freeze
all provider-specific nested fields.

Kong remains intentionally deferred and Apigee/MuleSoft remain rejected as recorded in the
original architecture decision. No external gateway subscription is needed for these changes.

## Vendor protocol references

- [Infobip WhatsApp documentation](https://www.infobip.com/docs/whatsapp/whatsapp-over-api)
- [Infobip-owned text-message API collection](https://www.postman.com/infobip/infobip-api/request/wmh2dq3/send-whatsapp-text-message)
- [Meta-owned template-message API collection](https://www.postman.com/meta/whatsapp-business-platform/request/o65u5m5/send-message-template-text)
