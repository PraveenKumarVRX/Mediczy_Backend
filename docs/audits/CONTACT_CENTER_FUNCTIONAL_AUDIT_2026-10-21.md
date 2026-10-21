# Contact-center functional audit — 21 October 2026

Page: https://app.mediqzy.com/crm/contact-center. **Eight confirmed workflow defects: four high priority and four medium priority.** The initial page renders without JavaScript errors, but that does not establish working call lifecycles.

The audit used the actual deployed browser bundle and authenticated read-only data from existing demo CRM staff. Destructive cases used browser-intercepted synthetic responses, local React/LiveKit mocks, and service factories with in-memory query fixtures. **No calls were placed, microphones captured, campaigns published, patient data changed or application fixes deployed.** The eight inspected implementation files match the isolated live release. Evidence and limits are in [the audit verification record](../testing/CONTACT_CENTER_FUNCTIONAL_AUDIT_2026-10-21.json).

## Confirmed defects

### CC-AUD-01 — High: failed microphone access strands an operator session

- Trigger: start a native browser session; room/call reservation and join-token issuance succeed, then microphone permission or media connection fails.
- Actual: the call ID is assigned to local UI state only **after** `voice.connect()` succeeds. The successful reservation's idempotency key has already been cleared. The error screen has no hangup or caller-invitation control; subsequent starts encounter the server's busy-agent protection. An unknown media session is likewise unjoinable while the controls require a successful join.
- Impact: the agent cannot end the reserved call from this page and may remain busy until an API/admin action or expiry. Retrying is not an adequate recovery flow.
- Evidence: isolated React reproduction with the real media hook, injected SDK microphone denial and intercepted APIs; inspected reservation/join guards in the matching backend.
- Source: [ContactVoiceTools.tsx](../../client/src/pages/crm/ContactVoiceTools.tsx#L12), especially the start handler at line 18; [media-service.js](../../server/services/contact-center/media-service.js#L44).
- Fix: preflight microphone permission, retain the reserved call ID before media connection, and expose end/reconcile controls independently of connection success. Preserve request identity for uncertain outcomes; do not automatically redial.
- Acceptance: microphone denial, connection timeout and unknown media outcomes all leave an explicit safe recovery/end action, with no second origination or permanently busy agent.

### CC-AUD-02 — High: normal tab navigation disconnects active audio

- Trigger: join a native call, then open Callbacks, Search, Knowledge or another console tab.
- Actual: `ContactLiveKit` is conditionally mounted only for the Livekit tab. Leaving that tab unmounts the hook, which disconnects both the primary and coaching rooms. It does not end the backend call or release the agent reservation.
- Impact: checking patient-communication context during a conversation drops that agent's audio. Returning to the tab loses the local session controls and requires a new join.
- Evidence: local full-page React reproduction using the real hook confirmed both room disconnects and no hangup request on tab change.
- Source: [CRMContactCenterPage.tsx:79](../../client/src/pages/crm/CRMContactCenterPage.tsx#L79), [useContactLiveKit.ts:9](../../client/src/hooks/useContactLiveKit.ts#L9).
- Fix: keep the call controller/media connections mounted above tab content, retaining an ongoing-call bar. Disconnect on explicit end/logout or a deliberate navigation policy.
- Acceptance: switching every console tab retains caller/agent/coaching audio and controls; ending a call closes media exactly once.

### CC-AUD-03 — High: native status refresh calls the Exotel endpoint

- Trigger: open a LiveKit call in Recent calls and select **Refresh provider status**.
- Actual: the page always posts to `/calls/:id/reconcile`. That handler passes the room name to the Exotel reconciliation service, which requires enabled Exotel configuration and fetches Exotel call details. The separate native `/calls/:id/media/reconcile` endpoint is not used.
- Impact: native-only hospitals receive an error instead of useful status/recovery; a configured Exotel account still cannot interpret a LiveKit room name as its Call SID.
- Evidence: the live bundle emitted the wrong request for an intercepted synthetic native call. An independent service-factory reproduction confirmed `VOICE_NOT_CONFIGURED` on the generic path with no Exotel configuration. No production call was created.
- Source: [CRMContactCenterPage.tsx:89](../../client/src/pages/crm/CRMContactCenterPage.tsx#L89), [contact-center-http.js](../../server/routes/contact-center-http.js), [service.js:190](../../server/services/contact-center/service.js#L190).
- Fix: dispatch status/recovery by the stored call provider and surface native reconciliation outcomes, including an explicit end action for unknown sessions.
- Acceptance: Exotel and LiveKit records use their own transport, and native status refresh works when Exotel is disabled.

### CC-AUD-04 — Medium: opened call details remain stale while the list updates

- Trigger: open a queued/ringing call, then let its backend state become completed or receive new transcript/artifact content.
- Actual: the ten-second poll replaces overview data only. `selected` detail state is fetched once on Open and is never refreshed by that poll. The list can say completed while the detail card still says queued and hides Complete wrap-up.
- Impact: operators see inconsistent call state and stale conversation content. They must close/reopen the record to obtain current details.
- Evidence: the live bundle was fed a synthetic queued call, then a completed overview response. After a poll, the list showed completed, details remained queued, wrap-up was absent and the detail endpoint had been requested only once.
- Source: [CRMContactCenterPage.tsx:52–55](../../client/src/pages/crm/CRMContactCenterPage.tsx#L52), [detail card:89](../../client/src/pages/crm/CRMContactCenterPage.tsx#L89).
- Fix: refresh the selected record while active, or subscribe to authoritative call/transcript updates; handle terminal state and closed selections safely.
- Acceptance: state transitions and final segments appear in an already-open detail card without reopening, and wrap-up becomes available on completion.

### CC-AUD-05 — Medium: publishing again creates a new flow rather than a new version

- Trigger: publish a routing graph, edit it and publish again.
- Actual: the editor never retains/submits a flow `id`, and existing published rows have no load/edit action. `saveFlow()` allocates a new UUID whenever the ID is absent. The prior flow remains published because unpublishing is scoped to the new ID.
- Impact: the console's versioned-routing action produces distinct version-1 flows, leaving the existing provider-connected graph unchanged and no usable editing/version history in this page.
- Evidence: two publications from the live bundle were intercepted; both omitted an ID. A service-factory reproduction produced two different IDs, both at version 1. No real graph was published.
- Source: [FlowEditor](../../client/src/pages/crm/CRMContactCenterPage.tsx#L16), [saveFlow](../../server/services/contact-center/service.js#L119).
- Fix: load an existing flow into the editor, retain its identity, publish the next version transactionally and identify the active version clearly.
- Acceptance: editing one flow produces versions 1 then 2 under the same ID and unpublishes its preceding version.

### CC-AUD-06 — Medium: callbacks cannot be returned through native calling

- Trigger: claim a callback belonging to a native LiveKit call at a hospital using native calling without Exotel.
- Actual: Take callback always opens the Exotel Calls tab. Start call is disabled by `!providerConfigured`; no callback ID or recipient is carried into the LiveKit tab. The native create contract also lacks callback linkage, and overview callback data does not include its source call provider.
- Impact: a hospital can have a valid native calling transport yet cannot complete the callback workflow using it.
- Evidence: a local full-page React reproduction claimed a synthetic native callback, populated its number, then confirmed Start call stayed disabled with native readiness true and Exotel disabled.
- Source: [CRMContactCenterPage.tsx:77/82](../../client/src/pages/crm/CRMContactCenterPage.tsx#L77), [callback overview](../../server/services/contact-center/service.js#L51), [native API schema](../../server/routes/contact-center-advanced-http.js).
- Fix: expose source/provider information and offer the enabled callback transport. Add server-validated native callback ownership/destination linkage and atomic attempt accounting.
- Acceptance: a claimed native callback can be returned once through LiveKit with Exotel disabled, preserving ownership and duplicate protection.

### CC-AUD-07 — High: guest connection failure burns the single-use invitation

- Trigger: a browser caller redeems an invitation, then denies microphone permission or experiences a media-connection failure.
- Actual: the backend consumes `guest_hash` before the caller connects. The page removes the URL fragment before awaiting `voice.connect()`, and stores no reusable connection grant for its retry button. Clicking Join again resends the already-consumed invitation and is denied; reloading has also lost the fragment.
- Impact: callers cannot recover from a common permission/network failure without obtaining a new invitation from the operator.
- Evidence: a local reproduction with the real hook confirmed the first request succeeded, microphone denial cleared the fragment, and a second attempt failed as already used even after microphone access was restored.
- Source: [ContactVoiceJoin.tsx:8](../../client/src/pages/ContactVoiceJoin.tsx#L8), [media-service.js:63–66](../../server/services/contact-center/media-service.js#L63).
- Fix: preflight microphone access before redemption and retain the short-lived connection grant in memory for connection retries. Clear invitation state only after successful connection; handle expired grants explicitly without making invitations broadly reusable.
- Acceptance: restoring permission or recovering a transient connection failure allows a bounded retry without another operator-issued link, while another browser still cannot redeem the invitation.

### CC-AUD-08 — Medium: expired CRM access tokens strand the console

- Trigger: the overview request returns HTTP 401 after the access token expires, including when a CRM refresh-token entry exists.
- Actual: this page's private `callApi()` uses raw `fetch`, bypassing the shared Axios refresh handling. It only sets an error. The layout sees the still-present access-token string and does not redirect; the page continues showing Loading contact center and retrying the expired token.
- Impact: an active operator gets a stuck console rather than refreshed access or an explicit sign-in transition.
- Evidence: intercepted expired-token responses against the live bundle kept the page at `/crm/contact-center`, showed its loading state and made no refresh attempt. The refresh-token value was a synthetic placeholder; server-side refresh validity was not tested.
- Source: [CRMContactCenterPage.tsx:10–14](../../client/src/pages/crm/CRMContactCenterPage.tsx#L10), [shared refresh handler](../../client/src/utils/api.ts#L166), [layout token-presence check](../../client/src/pages/crm/CRMModulePages.tsx#L96).
- Fix: use the shared authenticated client or implement single-flight CRM refresh and a clear terminal reauthentication path. Preserve idempotency keys for retried mutations.
- Acceptance: one refresh attempt recovers authorized reads; a rejected refresh clears the appropriate CRM session and routes to sign-in without an infinite loading loop.

## Configuration blockers observed separately

The audited demo tenant returned **zero assigned contact-center agents**, Exotel readiness false and LiveKit readiness true. The native start button was nevertheless enabled. Server assignment/availability checks still prevent unauthorized origination; this is not an authorization bypass. Staff must be assigned and available before this demo can place a native session, and the page should explain that prerequisite before offering Start.

Read-only secret-store checks found no Exotel provider-binding map, no native SIP trunk-binding map, and no biometric endpoint or biometric KMS key configuration. These are observed activation blockers rather than newly claimed code defects. Native browser audio does not require a SIP trunk; PSTN does. The biometric screen's presence does not establish an operational model service. No secret values are included in evidence.

## Scope and next implementation order

Fix CC-AUD-01/07 first, then preserve audio across navigation (02), correct native recovery dispatch (03), refresh selected details (04), support native callbacks (06), repair routing identity/version editing (05), and handle session expiry (08). Validate each failure path in addition to successful rendering before declaring call workflows accepted.

The audit did not perform real PSTN calls, actual medical-language STT/TTS evaluation, campaign delivery, speaker enrollment, credential rotation, provider-console webhook configuration or a complete security/tenant penetration test. Its eight findings are grounded in controlled reproductions and matching deployed code. Existing smoke tests that only checked rendering remain valid for that narrower purpose; they did not cover these failure paths.

## Remediation follow-up

All eight findings now have implementation fixes and automated regression coverage in `ContactCenterRecovery.test.tsx`, `contactCenterClient.test.ts`, the HTTP suite and disposable PostgreSQL checks. Readiness guards also prevent unassigned native origination, telephone calls without a bound trunk, and biometric capture without configured model/storage prerequisites. See [the remediation release record](../deployment/CONTACT_CENTER_AUDIT_FIXES_2026-10-21.md) for deployment status and verification. The initial findings and original evidence above remain historical audit observations.
