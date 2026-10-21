# CRM dialer design and functional audit — 21 October 2026

Page: https://app.mediqzy.com/crm/dialer. **11 confirmed issues: four high priority and seven medium priority.** Eight concern workflows/session handling; three concern design/accessibility. This report audits the current release; it does not implement or deploy fixes.

The audit used the actual deployed JavaScript, read-only existing demo CRM access, intercepted synthetic API responses, controlled timer callbacks, screenshots at 390px/1440px widths and both site-theme preferences, and an isolated backend service factory. All seven inspected implementation files match frontend commit `ea4b04ef`; inspected server files also match the running `contact-center-20261021-02` API release. No real calls, staff/provider assignments, patient writes, actual token revocation or production disposition/callback updates occurred. [Sanitized evidence](../testing/CRM_DIALER_AUDIT_VERIFICATION_2026-10-21.json) records results and limitations.

## Findings at a glance

| ID | Priority | Issue |
|---|---|---|
| DIAL-01 | High | Reloading loses active-call tracking and provides no reconciliation/recovery action |
| DIAL-02 | High | Retrying an uncertain origination generates a different idempotency key |
| DIAL-03 | High | “Callback required” resolves the current callback without scheduling another; update failures are hidden |
| DIAL-04 | High | Heartbeat can re-enable availability after the hidden page requests offline status |
| DIAL-05 | Medium | Sign-out leaves refresh credentials and bypasses server revocation |
| DIAL-06 | Medium | Call/Take controls remain enabled when Exotel is unavailable |
| DIAL-07 | Medium | Failed data requests become false empty/setup states with inadequate retry controls |
| DIAL-08 | Medium | Only the first 50 new leads are reachable; pagination and total are discarded |
| DIAL-09 | Medium | Mixed theme surfaces and insufficient text contrast impair readability |
| DIAL-10 | Medium | Mediqzy branding and the contact-center visual identity are absent |
| DIAL-11 | Medium | Refresh has no accessible name; active queue selection is conveyed visually only |

## Functional findings

### DIAL-01 — High: existing calls cannot be recovered after reload

- **Trigger/evidence:** load the deployed page with an overview containing the authenticated agent's `active_call_id` and the matching call. The page showed the lead queue, fetched no call detail, and offered no resume/reconcile/end control.
- **Cause:** `activeCall` starts as local `null`; the server active-call ID is used only to stop the heartbeat. It never hydrates the active-call panel. Call polling begins only after a successful in-page `dial()` response. The API client exports `reconcileCall()`, but the page never uses it.
- **Impact:** browser refresh, return navigation, a lost origination response or a long polling failure can strand the operator without this screen's call tracking/wrap-up path. Server busy-agent checks still protect against concurrent origination; this is not an authorization bypass.
- **Source:** [CRMTelecallerDialer.tsx:38](../../client/src/pages/crm/CRMTelecallerDialer.tsx#L38), [server-active flag:71](../../client/src/pages/crm/CRMTelecallerDialer.tsx#L71), [poll:99](../../client/src/pages/crm/CRMTelecallerDialer.tsx#L99), [unused reconciliation client](../../client/src/pages/crm/dialerClient.ts#L43).
- **Fix/acceptance:** restore the authenticated agent's current call from authoritative data, retain its callback linkage, show reconciliation/recovery for unknown outcomes, and restore terminal calls awaiting disposition. Test reload during queued/answered/unknown states and after completion. Distinguish queued, connected, unknown and failed-refresh feedback rather than displaying ringing copy for every nonterminal state.

### DIAL-02 — High: uncertain retries lose request identity

- **Trigger/evidence:** return a synthetic HTTP 502 uncertain-provider outcome to the first call request, then retry the same recipient. Two POSTs used different idempotency keys; only the initial overview was read, and no reconciliation was attempted.
- **Cause:** `startCall()` assigns `crypto.randomUUID()` on every invocation, despite retaining a ref. It does not bind the key to a request body or distinguish a definitive rejection from an uncertain result.
- **Impact:** the API cannot recognize the second attempt as a replay of the first intent. Server reservation/busy guards can reject that second request; the audit did **not** demonstrate or place duplicate production calls. A fresh intent after an unresolved outcome is still unsafe recovery behavior.
- **Source:** [CRMTelecallerDialer.tsx:123](../../client/src/pages/crm/CRMTelecallerDialer.tsx#L123).
- **Fix/acceptance:** preserve key and body across network/ambiguous retries; refresh authoritative agent/call state and reconcile before another origination. Clear the key only after a known outcome or deliberate new call. Test response loss, identical retry and changed recipient.

### DIAL-03 — High: callback disposition can discard required follow-up

- **Trigger/evidence:** complete an intercepted callback call and choose **Callback required**. The deployed bundle posted that disposition, then patched the existing callback to `resolved` with `Disposition: callback_required`, made no follow-up creation request, and displayed “Call logged”. An independent service-factory check confirmed `disposition(callback_required)` updates the call/presence and creates or schedules no callback.
- **Additional failure:** when the callback PATCH was made to fail with HTTP 503, the page still cleared the active view and displayed the success toast. The callback error was swallowed.
- **Impact:** a request for another call can disappear from the pending callback queue, while partial failures give misleading success feedback.
- **Source:** [CRMTelecallerDialer.tsx:153](../../client/src/pages/crm/CRMTelecallerDialer.tsx#L153), [callback resolver](../../client/src/pages/crm/dialerClient.ts#L61), [backend disposition](../../server/services/contact-center/service.js#L257).
- **Fix/acceptance:** define disposition-specific callback transitions. Require a follow-up time for callback-required outcomes; keep/reschedule the task or atomically create its successor. Resolve only appropriate outcomes. Surface partial failures and support retry without losing call/task context.

### DIAL-04 — High: hidden-page heartbeat contradicts offline status

- **Trigger/evidence:** dispatch a hidden visibility event while available, then explicitly invoke the captured 25-second heartbeat callback. Requests were `offline` followed by `available` while visibility remained hidden. The UI still offered “Go offline”. This demonstrates the callback's behavior, not a guarantee that every mobile OS executes background timers at exactly 25 seconds.
- **Cause:** the visibility handler sends offline without updating local overview state or stopping the interval. The interval checks neither current visibility nor the latest authoritative presence. There is no visible-return refresh.
- **Impact:** routing eligibility can be restored after departure, and a returning operator sees stale availability. Phone calls commonly move the browser into the background, making this particularly relevant to this screen.
- **Source:** [CRMTelecallerDialer.tsx:78](../../client/src/pages/crm/CRMTelecallerDialer.tsx#L78).
- **Fix/acceptance:** coordinate visibility and presence as one lifecycle: stop heartbeats when hidden, reflect the offline result, refresh on foreground, and require explicit availability where appropriate. Test hide → heartbeat → foreground, presence failures and an active call started just before backgrounding.

### DIAL-05 — Medium: sign-out does not complete session teardown

- **Trigger/evidence:** seed a synthetic refresh-token placeholder and sign out. The page navigated to CRM login and removed access credentials, but retained `crmRefreshToken`; it sent neither `/api/crm/logout` nor an offline-presence request.
- **Cause:** sign-out removes only `crmToken` and `crmUserData`. The existing backend logout endpoint revokes stored user refresh tokens but is not invoked.
- **Impact:** refresh-capable session material persists on a shared device, and server-side refresh sessions remain unrevoked by this action. Existing in-flight renewal is also not coordinated with this local teardown. The audit did not exchange a real retained refresh token or test account takeover.
- **Source:** [CRMTelecallerDialer.tsx:187](../../client/src/pages/crm/CRMTelecallerDialer.tsx#L187), [server logout](../../server/routes/crm.route.js#L333).
- **Fix/acceptance:** invoke the authenticated revocation endpoint, stop presence/polling, clear all CRM session keys, and prevent outstanding requests from restoring a signed-out session. Provide explicit handling for revocation/network failure.

### DIAL-06 — Medium: readiness does not guard call actions

- **Trigger/evidence:** supply an available, phone-assigned agent with `providerConfigured:false`. **Call** remained enabled and emitted a call POST, which the controlled server response rejected with `VOICE_NOT_CONFIGURED`.
- **Cause:** the availability toggle checks provider readiness, but lead and callback Call/Take controls check only `busy` and `isAvailable`.
- **Impact:** existing available presence can expose unusable actions and let a callback be claimed before its delivery path is available. Server configuration checks correctly remain authoritative.
- **Source:** [lead Call:290](../../client/src/pages/crm/CRMTelecallerDialer.tsx#L290), [callback controls:325](../../client/src/pages/crm/CRMTelecallerDialer.tsx#L325).
- **Fix/acceptance:** use one readiness rule covering assigned phone, enabled provider, available agent, wrap-up and existing active call. Explain the unmet prerequisite. Offer an explicit contact-center handoff for native workflows rather than silently treating LiveKit readiness as Exotel readiness.

### DIAL-07 — Medium: request failures become misleading empty/setup states

- **Trigger/evidence:** a lead-list HTTP 503 produced **No new leads assigned to you** without an error. An overview HTTP 503 also showed **Your dialer number isn't set up yet** and offered no refresh control, although the request had not established any setup status.
- **Cause:** `getMyLeads(...).catch(() => [])` hides failures; `load()` then clears errors. A failed first overview leaves `ownAgent` undefined, selecting the missing-phone branch. Refresh is rendered only inside the lead queue.
- **Source:** [CRMTelecallerDialer.tsx:50](../../client/src/pages/crm/CRMTelecallerDialer.tsx#L50), [setup branch:219](../../client/src/pages/crm/CRMTelecallerDialer.tsx#L219).
- **Fix/acceptance:** represent loading, failed, empty and unconfigured states separately. Keep prior data on transient failures, show an accessible retry in every state, and refresh callbacks as well as leads. Verify recovery without a browser reload.

### DIAL-08 — Medium: lead queues silently stop at 50

- **Trigger/evidence:** the intercepted API returned 50 rows with pagination total 75. The UI rendered 50 rows with no next/load-more control. The request hard-coded `status=new&limit=50`; the client discarded pagination metadata.
- **Impact:** older assigned new leads are unreachable from this screen once the first page is full. Its “My leads” metric is the loaded-row count, not the server total. Disposition alone does not remove a lead from this query or advance the queue.
- **Source:** [dialerClient.ts:68](../../client/src/pages/crm/dialerClient.ts#L68), [paginated backend](../../server/routes/crm.route.js#L428), [displayed count](../../client/src/pages/crm/CRMTelecallerDialer.tsx#L196).
- **Fix/acceptance:** return pagination, expose total and next/load-more, and define which statuses belong in the calling queue. Test 0, 1, 50 and 75 assigned records with stable ordering.

## Design and accessibility findings

### DIAL-09 — Medium: mixed theme and low text contrast

The page forces a light slate canvas and lead rows while shared cards follow the saved site theme. In dark mode the setup message is dark slate `rgb(51,65,85)` on a dark card `rgb(2,8,23)`—approximately **1.93:1** contrast. Phone/company text is **2.45:1** on the light row in both preferences. Enabled Call buttons use white text on teal at **3.74:1**. These ordinary small-text pairs are below the [4.5:1 normal-text contrast criterion](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html).

- **Source:** [canvas/header:176](../../client/src/pages/crm/CRMTelecallerDialer.tsx#L176), [setup text:223](../../client/src/pages/crm/CRMTelecallerDialer.tsx#L223), [lead row:285](../../client/src/pages/crm/CRMTelecallerDialer.tsx#L285), [shared Card](../../client/src/components/ui/card.tsx).
- **Fix/acceptance:** use coordinated foreground/background tokens throughout, ideally sharing the corrected contact-center palette. Verify both saved preferences, setup/empty/error/active-call states and enabled/disabled controls on mobile and desktop. Retain numerical contrast checks alongside screenshots.

### DIAL-10 — Medium: missing Mediqzy identity and visual continuity

The rendered page contains **CRM Dialer** and a staff name, but no Mediqzy/HealthOS brand text or logo. Its navy/teal/cyan colors and wide desktop cards differ from the corrected contact-center workspace. The dialer does not consume the shared brand configuration. Screenshots confirm this at both widths; it is a product consistency finding, not an authorization/security defect.

- **Source:** [header:178](../../client/src/pages/crm/CRMTelecallerDialer.tsx#L178), [shared brand configuration](../../client/src/config/brand.ts).
- **Fix/acceptance:** reuse the existing Mediqzy logo/name and contact-center colors, add a clear workspace title and a route back to Contact Center, and constrain desktop content width while preserving mobile operation. Do not create a replacement logo.

### DIAL-11 — Medium: refresh is unnamed and selection state is visual only

The refresh button has only an SVG: no visible label, `aria-label`, associated label or title. Its measured height is 28 CSS px on desktop and approximately 24.5 CSS px in the tested mobile rendering. Queue buttons expose no selected/pressed/current state. Assistive technology therefore lacks the refresh action's name and the selected-queue state described by the [name/role/value criterion](https://www.w3.org/WAI/WCAG22/Understanding/name-role-value.html).

- **Source:** [refresh:277](../../client/src/pages/crm/CRMTelecallerDialer.tsx#L277), [queue switches:265](../../client/src/pages/crm/CRMTelecallerDialer.tsx#L265).
- **Fix/acceptance:** label Refresh, expose queue selection programmatically, announce loading/errors, and enlarge frequent mobile controls for easier touch use. The measured refresh height is **not itself a proven violation** of the [24px minimum target-size criterion](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html); larger targets are a usability improvement. Verify keyboard and screen-reader operation.

## Activation blockers and things that work

The existing demo overview returned HTTP 200, **zero assigned contact-center agents**, Exotel readiness false and LiveKit readiness true. The missing-phone blocking state is appropriate when those are real setup facts. This screen is implemented as an **Exotel two-leg phone bridge**; LiveKit browser readiness alone does not enable it. Assignments and approved Exotel references remain separate setup work. No credentials, staff permissions or telephone mappings were fabricated.

The page loaded without JavaScript page errors. Tested lead/setup layouts did not overflow horizontally at 390px or 1440px. The four existing dialer tests pass: missing-phone block, successful call request, terminal polling/disposition and the immediate offline visibility request. They do not cover the failure paths above; a passing rendering or happy-path test does not close these findings.

## Recommended implementation order

1. Restore durable call recovery and preserve idempotency across uncertainty (01/02).
2. Make callback outcomes/task transitions atomic and outcome-aware (03).
3. Correct presence/visibility lifecycle and session teardown (04/05).
4. Apply readiness guards, honest error states and queue pagination (06–08).
5. Share contact-center theme/branding and accessible controls (09–11).
6. Extend failure-path tests; repeat deployed desktop/mobile screenshots and contrast checks. Only then run an approved Exotel test-number pilot, including foreground/background transitions on a real phone.

No actual PSTN delivery, real device background suspension, screen-reader session, real refresh-token revocation, complete tenant penetration test, biometric acceptance or patient-data workflow was exercised. Screenshots beyond the live setup baseline use explicitly synthetic intercepted records. Private details remain under `/home/ubuntu/dialer-audit-evidence/20261021`, outside the served checkout.
