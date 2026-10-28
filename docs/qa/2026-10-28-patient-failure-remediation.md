# Patient QA failure remediation — 28 October 2026

Source: the patient portal failure table attached to the request. This report records source changes and their verification; it is not a production acceptance sign-off.

## Implemented changes

| Failure area | Resulting behavior |
| --- | --- |
| Home, health dashboards, health intelligence | Missing measurements stay unavailable rather than becoming zero or high risk. Scores use the same observed-domain calculation. Medication adherence requires actual logged events. Decimal strings are formatted consistently; empty charts no longer crash or produce NaN coordinates. Summary queries are batched. |
| Search and layout | Short queries such as `bo` rank Book Appointment first and Enter navigates. Duplicate layout wrappers were removed. Sidebar, tab wrapping, modal text, image fallbacks and floating controls were corrected. |
| Wearables and watch analytics | Saved pairing does not imply a live connection. Disconnected devices hide cached battery values. Missing data types are handled safely. Sleep uses a common unit conversion and score. Glucose, uric acid and temperature retain stored units. |
| Vital reports and diary | Demo readings were removed. Manual readings persist through the health data API and refresh. Adult screening flags distinguish fasting and non-fasting glucose. Complete blood pressure is required; matching split watch readings appear together. Diary dates must be complete; draft prescriptions and undefined medication text are excluded. |
| Risk assessment | Final risk results and saving require all questions to be complete. Sleep choices cover continuous ranges. Partial answers no longer produce a final low-risk claim. |
| Rewards and family | Real wallet transactions and lifetime XP determine levels. Fabricated challenges, vouchers, leaderboard entries and family health scores were removed. Empty catalogues hide Programs navigation. |
| Appointments | Web/mobile booking uses the canonical availability, conflict and fee rules. Explicit zero fees remain free. Past IST slots move to history, rescheduling uses published slots, disabled Join controls are distinguishable, and times/names display consistently. |
| Notifications | Reminder delivery follows the selected lead time. Doctor calls produce one durable inbox entry and one push path; call events expire. Delayed confirmations create durable, deduplicated patient follow-ups and operations logs. |
| Lab checkout | Only active catalogue tests and verified labs can be selected. Date, time, collection method and home address are validated before payment. Server prices determine the amount. Unpaid checkout does not book tests. Verified payment creates patient bookings and staff work items atomically and retrying does not duplicate them. Home collection charges remain in booking totals. |
| Lab workflow | Assigned lab confirmation updates the patient booking in the same transaction. Another lab cannot update it. Paid patient orders are not billed again through hospital billing. Draft results are not labelled ready. |
| Pharmacy and invoices | Addresses require a city and valid pincode. Paid totals derive from successful payments. Product units and pack prices are distinct. Successful verification creates a durable paid invoice before optional PDF/email delivery. |
| Benefits, policies and membership card | Self/member lists and entitlements derive from profile and active plan data. Annual/monthly allowances, pharmacy discounts and funded/personal coverage display consistently. Unspecified insurance cover is not fabricated. Card export captures both sides. |
| Claims | Server checks employer eligibility, current plan, member ownership and uploaded document ownership. Claim documents are uploaded rather than saving filenames. Cashless and reimbursement selections persist. |
| Prescriptions and reports | Profile IDs correctly enable prescription loading. Uploaded prescription documents appear separately from issued prescriptions. Temporary upload names have readable fallbacks. Medical-document confirmation is required for uploads. Scanner image payload and storage notice were corrected. |
| Diet and calorie calculator | Meal portion targets sum exactly to the daily target. Family diabetes/hypertension flags filter unsuitable suggestions. Generic AI fallbacks are hidden. Saved plans/PDFs use the same filtered data, patient identity and target labels. Calculator layout and save feedback were corrected. |
| AI guidance | Patient identity and conversation history are scoped to the authenticated patient. Source rules prohibit treating examples as history or inventing vitals. Health-intelligence observations use recorded domains and explain their source. Emergency guidance no longer suggests waiting or staff-only actions to patients. |
| Support, legal and health feed | Public privacy/terms/data-rights routes work for signed-in users. Support uses configured brand contacts and removes fabricated hours/locations. Third-party videos are labelled, deduplicated and decoded with thumbnail fallbacks. |

## Verification

- Server regression: **39 tests passed across 8 suites** covering score observations, reminder timing, vital flags and history, appointment slots and fees, payment-before-booking, idempotent lab completion, lab/patient status transactions, ownership and delayed-care follow-ups.
- Client regression: **6 tests passed** covering missing scores, number/IST formatting, search ranking, lifetime XP, diet budgets/risk filtering and plan entitlements.
- Browser regression: **28 routes plus 2 interactive flows passed**, including short search plus Enter and vital save/critical flag/refresh. It also verifies that a cached watch pairing stays offline. All API calls are intercepted with synthetic data; it does not create real bookings, charge payments or access patient records. It checks page exceptions, NaN chart errors and duplicate app headers. This is not a zero-console-error certification for the live site.
- Production build: **passed**, Vite completed in 2 minutes 9 seconds. Existing bundle-size, browser externalization and Browserslist-age warnings remain; this does not establish the live load-time target.
- All **106 changed/new JavaScript/TypeScript source files** passed parsing; `git diff --check` passed.
- Full TypeScript check remains failing on existing repository issues: **902 diagnostics**, compared with **952 at HEAD** using the same compiler/configuration. After normalizing shifted line numbers, the comparison found **no new diagnostics**. This is not a clean type-check result.
- Read-only database schema/catalogue inspection checked relevant columns, actual stored wearable units, plan coverage metadata and lab staff queue linkage. It did not change records. Existing glucose/uric-acid readings inspected used mg/dL.

Reproduce the focused checks:

```bash
cd server
node --experimental-vm-modules node_modules/jest/bin/jest.js --runInBand \
  __tests__/daily-health-score.service.test.js \
  __tests__/appointment-preference-reminders.test.js \
  __tests__/patient-vitals.test.js \
  __tests__/patient-lab-checkout.test.js \
  __tests__/patient-lab-workflow.test.js \
  __tests__/patient-care-followup.test.js \
  __tests__/appointment-slot-time.test.js \
  __tests__/appointment-fee.test.js
cd ../client
npm test -- src/utils/patient-qa.test.ts
npm run build
# With a local Vite server running on 4174:
TEST_BASE_URL=http://127.0.0.1:4174 CHROME_BIN=/snap/bin/chromium \
  node tests/patientQaFailures.e2e.js
```

## Remaining acceptance work

These items are open; they must not be marked fixed solely from the source changes:

| Open item | Required evidence or action |
| --- | --- |
| Live page load and console failures | Deploy through the normal release workflow and retest authenticated pages with production assets/services. A sub-three-second live load and elimination of the reported live console errors have not been established. |
| VL45PRO pairing/sync | Test the physical watch with a supported Bluetooth browser, reconnect, measurement and disconnect. A mock browser test cannot establish hardware compatibility. |
| AI report analysis availability | Verify a real, consented image through the configured vision provider and inspect the resulting response. Payload fixes do not establish provider credentials, capacity or clinical correctness. |
| Appointment availability and confirmations | Doctors must publish real slots and respond. The code does not invent afternoon slots or guarantee provider attendance. Operations must monitor the new delayed-care logs and confirmation workflow. |
| Lab/pharmacy fulfilment and report release | Validate a real sandbox/staging payment-to-partner workflow, partner acceptance, authorized result release and document delivery. The new queue linkage does not fulfil existing production orders or backfill old work items. |
| Diet completeness | Ingredient/portion-based per-dish calorie estimation and expanded monthly menu variety remain unimplemented. Current numbers are explicitly portion targets, not measured recipe calories. |
| Insurance and employer data | Verify real funding, policy numbers, covered family members and insurer documents against configured plans/contracts. Unconfigured amounts remain unspecified. |
| Clinical AI acceptance | Run the clinical gold set and clinician review for the reported hallucination scenarios. Source safeguards and deterministic observations are not a complete clinical validation. |
| Legal/support approval | The owner must review privacy/terms/data-rights wording, retention practices and actual support staffing. No certification or staffed hours are asserted. |
| Repository type health | Resolve the remaining 902 TypeScript diagnostics separately. The production build transpiles successfully independently of a clean full type check. |

No production deployment, process restart, database migration or backfill was performed. The pre-existing `SANITY_CHECK_RESULTS.json` edit was left untouched.

Adult screening references used for glucose and blood-pressure flags: [NIDDK diabetes tests](https://www.niddk.nih.gov/health-information/diabetes/overview/tests-diagnosis), [American Heart Association blood-pressure readings](https://www.heart.org/en/health-topics/high-blood-pressure/understanding-blood-pressure-readings). Flags are screening labels, not diagnoses.
