# Individual / corporate employee web flow — CTO micro audit

Date: 4 November 2026. Scope: current repository and running local API at `127.0.0.1:8888`.

## Verdict

The requested Individual / Corporate Employee login toggle and distinct employee journey are **not implemented end to end**. Corporate employee functionality already exists across several backend routes and patient pages, so this is primarily an identity, authorization, navigation, and integration project. A cosmetic toggle would leave significant gaps.

The supplied `user@mediczy.com` account successfully authenticates and returns `role=user`, `membershipType=individual`, `corporateId=null`. It is suitable for the individual baseline. Selecting Corporate Employee must not grant this account employee rights without a verified active employment link. No password or token is retained in this report.

This is a targeted code and API audit, not certification of every individual-user function or a complete browser/production audit. No corporate employee credentials were supplied; successful employee transactions, actual benefit consumption, refunds, and offboarding were not exercised. The existing individual journey must not be called complete based on this audit.

## Verified local behavior

| Check with supplied individual account | Result | Interpretation |
|---|---|---|
| `POST /api/users/login` | 200 | Credentials accepted locally; individual identity confirmed |
| `GET /api/employee/my-corporate` | 200, `isCorporateEmployee=false` | Account has no employer context according to this resolver |
| `GET /api/membership/my/current` | 200 | Membership lookup responds; financial and lifecycle correctness not established |
| `GET /api/employee/benefits` | 200, `isCorporateEmployee=false` | Employee identity correctly absent in response |
| `GET /api/corporate/my-benefit-wallet` | 200 | Endpoint responds; 200 alone does not establish benefit entitlement or data exposure |
| `GET /api/corporate/wellness-calendar/employee/events` | 200 | Individual sessions can call endpoint; code returns empty employee events without an association |
| `GET /api/corporate/gamification/employee/challenges` | 200 | Individual sessions can call endpoint; no context produces empty challenges |
| `GET /api/corporate/employees` | 403 | HR roster access correctly denied for this individual account |

Only authentication and GET requests were used. Login can write normal session/audit records. No profile changes, associations, OTP sends, bookings, payments, invitations, or benefit mutations were attempted.

## Prioritized gaps

Severity: P0 = authorization release blocker; P1 = required employee journey or eligibility blocker; P2 = reliability and usability work. Findings marked code-confirmed have not necessarily been exploited against the running database.

| ID | Priority / evidence | Gap and impact | Required change |
|---|---|---|---|
| G01 | P1, code-confirmed | `client/src/auth/Login.tsx` only distinguishes password vs OTP. Password submits `loginType: "user"`; OTP sends no audience. No Individual / Corporate Employee selector or employee-specific copy exists. | Add an accessible audience selector; keep authentication method separate from audience. Carry audience through password, OTP, recovery, and return routing. |
| G02 | P1, code-confirmed | Both password and OTP success check retail membership and navigate to `/choose-plan` or `/`. Existing-session validation also goes to `/`. Employees can be sent through retail onboarding. | Resolve active employer and sponsored entitlements before retail plan selection; route corporate mode to an employee dashboard. |
| G03 | P1, code-confirmed | `client/src/hooks/auth.ts` sets the session type from the caller's `loginType`. Its `corporate` option means `/corporate/login`, which is an HR/admin flow. Reusing it for the toggle would conflate employees and privileged corporate users. | Preserve employee patient identity; add a server-validated experience/employer context. Keep HR/Admin login clearly separate. |
| G04 | P0, code-confirmed authorization omission | `server/routes/userAssociation.route.js:105` exposes corporate association creation with `authUser` only, despite its Admin/Corporate Admin comment. Caller supplies user, corporate, role, and options. `userAssociation.service.js:createAssociation` creates an active association or reactivates an existing one without actor authorization. The router is mounted in `server/app.js:1624`. | Require authorized administrator/HR role and corporate scope; validate target roster, allowed role/options, and actor permissions in the service. Test self-enrollment, another-user targeting, and inactive-link reactivation. Database/RLS effects were not penetration-tested. |
| G05 | P0, code-confirmed unsafe trust boundary | `server/routes/user.route.js:1800–1845` allows self-service profile writes to `corporateId`, `employeeId`, and `membershipType`. These values cannot serve as authoritative eligibility. | Remove employment identity from self-service write fields; use a verified invitation/HR workflow. Trace every downstream reader. Actual privilege escalation through these fields remains unverified. |
| G06 | P1, code-confirmed | Employer resolution differs: employee network uses active association then active plan metadata; benefit wallet uses active roster then association; calendar uses association; gamification uses another resolver. Different features can disagree about who is an employee. | Centralize eligibility resolution with active user, employer, roster/link, dates, plan, tenant, and capability checks. Treat `member` differently from `employee`. |
| G07 | P1, code-confirmed | `resolveEmployeeCorporate` in `corporate-benefit-wallet.service.js` does not check corporate status. Its association fallback can still qualify a user after roster deactivation. Network association resolution does not require an active roster row. | Revoke employer entitlements consistently on offboarding/company suspension; invalidate context and reject subsequent reads/mutations. Verify HR status changes synchronize links and plans. |
| G08 | P1, code-confirmed | Employer resolvers choose the latest association/roster with `LIMIT 1`. There is no consistent explicit employer selection/context contract. | Define one-employer policy or implement verified employer selection; bind all employee requests and cache keys to that context. |
| G09 | P1, code-confirmed | `Sidebar.tsx:39` defines a shared patient menu. Employee-only features lack a distinct employer section, eligibility badge, and capability-driven navigation. | Add My Employer, sponsored benefits, wallet, checkup, events, challenges, and employee support based on server capabilities. Keep shared clinical functions available. |
| G10 | P1, code-confirmed | `CorporateBenefits.tsx:410` contains employee-wallet reads and tier selection but uses `CorporateLayout`. `CorporateLayout.tsx:52` redirects a user without corporate session type/token to `/corporate/login`. Employee controls are placed inside an HR-oriented shell. | Extract employee benefit-wallet controls into the employee layout and route. Separate HR program configuration/settlement from employee requests. |
| G11 | P1, code-confirmed | `EmployeeGamification` is lazily imported in `routes/index.tsx:107` but no route renders it. `/wellness-challenges` renders `WellnessRewards` instead. | Add and link a distinct employee challenges route, gated by eligibility and enabled program. |
| G12 | P2, code-confirmed | Employee challenge loading catches each request and substitutes null; corporate benefits also suppress many failures. Lack of access, server error, and no benefits can look alike. | Show separate unavailable, forbidden, no enrollment, expired, and empty states; log failures and allow retry. |
| G13 | P1, code-confirmed | Gamification employee query includes `draft` challenges and maps drafts to upcoming/active (`corporate.route.js:3339`). Employees can see unpublished programs. | Publish explicitly; exclude draft/cancelled challenges from employee reads and reject joins until published. |
| G14 | P1, validation gap | No demonstrated end-to-end test connects toggle → employee authentication → sponsored benefits → booking/claim → fulfillment → utilization. Existing unit tests do not prove this journey. | Add browser/API scenarios using active, inactive, expired, individual, HR, and cross-employer fixtures. |

## Function coverage and remaining verification

“Present” means code exists; it does not imply successful operation in production.

| Function area | Current implementation / evidence | Remaining employee-specific work or proof |
|---|---|---|
| Password login | User login accepts email/phone and six-character employee UID; `Login.tsx`, `user.controller.js:410` | Audience validation, employee fixture, inactive and wrong-mode handling |
| OTP / social authentication | User OTP and Google/Facebook in `Login.tsx` | Preserve intended audience; resolve verified employee identity after each method; prove no bypass |
| First login / password change | Password path handles `requirePasswordChange` | Verify employee activation, forced password change, recovery, and return to employee experience |
| Employer identity | `/employee/my-corporate` exists | One consistent authoritative identity/capability payload and employer selection policy |
| Dashboard and navigation | Shared patient shell and separate HR portal exist | Dedicated employee landing with employer name, eligibility, balance, next checkup, and invitations |
| Sponsored plans / retail plans | `useSmartBenefits.ts`, `/employee/benefits`, retail fallback | Keep payer/source explicit; verify sponsorship dates and simultaneous personal/employer coverage |
| Employer rupee wallet | Employee read, authorization, tier APIs exist in `corporate.route.js` | Reachable employee UI; balance/reservation/settlement/cancel and concurrency proof; distinguish Health Coins |
| Assigned health checkups | Package/booking APIs and booking service exist | Employee route integration, assigned package selection, family eligibility, venue/date availability, cancellation and consumption proof |
| Provider network | `/employee/my-labs`, `/my-hospitals`, `/my-clinics` | Verify assigned network visibility and enforce entitlement again on booking/order submission |
| Consultations / appointments | Shared appointments and `/corporate/my-appointments` exist | Verify employer attribution, permitted doctors, payer, reschedule/cancel and HR/employee synchronization |
| Claims | `/employee/claims`, eligibility and creation exist | Verify ownership, eligible payer, document access, claim status updates, rejection and settlement journey |
| Dependants / family benefits | Benefits hub and family APIs exist | Prove dependent entitlement per plan; being a family member must not automatically imply coverage |
| Wellness invitations / RSVP | Employee calendar APIs restrict reads to invited RSVP rows | Reachable corporate-mode menu, eligibility refresh, RSVP capacity/concurrency and notification proof |
| Challenges / rankings / rewards | Employee component and backend endpoints exist | Fix missing route and draft visibility; verify join/progress authenticity, privacy, scoring and reward delivery |
| Reports / certificates | Shared report pages; `MyFitnessCertificates.tsx` uses user-scoped certificate endpoints | Verify employee ownership/download permissions and employer access only within approved consent/scope |
| Care feedback | `/programs/employee/feedback` checks completed care against employee context | Verify discoverable employee entry and submission after care completion |
| Privacy / consent | Corporate report/consent infrastructure exists | Audit every HR health-data read/download against consent and scope; no broad privacy conclusion from this review |
| Notifications / support | Shared patient notifications and corporate HR support pages exist | Verify employee-specific announcements, invitation deep links, employer contact, ticket ownership and routing |
| Billing / payment | Shared wallet, plan, invoices and order navigation exist | Verify employer-funded vs personal balances, topups, approvals, refunds, invoices and no double spending |
| Logout / refresh / switch | Shared token helpers and query cache exist | Invalidate employer-bound caches and server context; prove multi-tab refresh and stale/offboarded session rejection |

## Target experience

1. `/login` offers **Individual** and **Corporate Employee** as the audience selector. Password/OTP remain separate controls. A clearly labeled HR/Admin entry continues to the existing corporate portal.
2. Authentication proves identity; the server resolves eligible employer contexts. A toggle never assigns a corporate role or creates an association.
3. Corporate mode requires a verified active employee context. An unlinked individual receives an actionable “No active employer access” state with individual-mode return and HR/support guidance.
4. An employee lands on an employer dashboard with sponsored plan, eligibility dates, assigned services, wallet/usage, upcoming appointments, checkup, wellness invitations, and support.
5. Shared care, records, prescriptions, family, and personal purchases remain available with clear payer/source labels. Corporate-exclusive actions require the corresponding server entitlement on every request.
6. Individuals who happen to have a platform `member` association are not treated as corporate employees. The existing individual registration path creates such a membership association (`user.route.js:837`).

Suggested context contract: authenticated user ID; requested experience; verified employer ID and employee ID; eligibility status/reason; effective dates; available employer contexts; capabilities and benefit-source IDs. The server must validate it on requests and refresh it after employment or plan changes. Client state is for display/navigation only.

## Delivery order and acceptance criteria

**First: authorization and eligibility.** Fix G04/G05; unify resolver and offboarding rules; test cross-employer access and association creation restrictions. Confirm whether any existing unverified links need remediation before enabling more employee features.

**Second: login and employee shell.** Implement selector, audience-aware success/recovery routes, dashboard, capabilities, and separate HR entry. Preserve the supplied account's individual behavior. It must not gain employer benefits by switching modes.

**Third: integrate employee functions.** Connect benefits, wallet, assigned checkup, network, claims, dependants, appointments, reports, consent, invitations, challenges, feedback and support. Repair unreachable pages and error states. Preserve backend authorization even when menus hide a function.

**Release proof:** individual login regression; active employee login by each supported method; inactive/expired/offboarded rejection; wrong employer and HR isolation; retail onboarding skipped when sponsored entitlement is valid; accurate family/payer selection; successful booking and cancellation; claim tracking; wallet reservation/settlement/refund; report ownership; consent boundaries; published-only challenges; invitation-only events; logout/refresh/multi-tab behavior; desktop/mobile keyboard-accessible selector.

## Validation performed

- Reviewed login, session hook/provider, patient navigation/routes, HR layout/login, employee network/claims, corporate employee endpoints, association creation, profile update, eligibility resolvers, benefits hooks, and related components.
- Exercised the local API checks above with the supplied account. No corporate employee live session or full browser walkthrough was performed; production parity is unverified.
- Existing Jest suites `corporate-workflow-functions.test.js` and `corporate-health-checkup-booking.test.js`: **42 tests passed**. They cover selected access, workflow and booking logic with test fixtures; they do not establish deployed database/RLS or browser correctness.
- An initial test invocation also referenced a nonexistent `corporate-employee-activation.test.js`; it failed discovery for that file. The command was corrected to the two existing suites. No employee activation test result is claimed.
- Application code was not changed. The pre-existing modification to `SANITY_CHECK_RESULTS.json` was left untouched.
