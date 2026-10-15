# MedCore → Mediqzy parity audit

**Audit date:** 2026-10-15  
**MedCore source:** `Globussoft-Technologies/medcore`, `main` @ `2031184e6418a32eb518ad44eaf13cf91d0e937a`  
**Mediqzy source:** `MySmartHealth/Mediczy`, current `main` checkout  
**Method:** repository inventory, route/service search, schema/migration review and UI route inspection. No MedCore code, schema, fixtures, translations, prompts or clinical datasets were copied.

## Executive finding

Mediqzy is not missing the whole MedCore product. It already has broad parity across hospital operations, CRM, pharmacy, laboratory, billing, insurance, PACS/DICOM, ABDM/FHIR, workforce and patient engagement. The verified gap was presentation and workflow cohesion: the MedCore-adoption APIs existed, but there was no single operator surface for them. Mediqzy now exposes that surface at:

- `/team/medcore` for authenticated team users, linked from the team sidebar.
- `/medcore` and `/medcore/workbench` as authenticated compatibility routes.

The workbench is an integration UI over Mediqzy-native APIs. It does not enable clinical AI by itself; `MEDCORE_ADOPTION_ENABLED=true`, clinical review and counsel sign-off remain required.

## Inventory evidence

| Repository | API/backend | Web/UI | Tests | Notes |
|---|---:|---:|---:|---|
| MedCore | 78+ routers advertised; TypeScript/Prisma monorepo | Next.js dashboard plus Expo patient/doctor apps | 158 E2E files in the checkout | MedCore README is a product catalogue, not a license grant |
| Mediqzy | 409 route files, 554 service files, 246 migrations | 605 page files, 228 shared components | Existing route, API, a11y and module smoke suites | Existing modules are independently implemented and tenant-aware in different maturity levels |

## Capability comparison

| MedCore capability | Mediqzy evidence | Status | Action |
|---|---|---|---|
| 8-language AI triage and red-flag routing | `server/services/multilingual-triage.service.js`, `/api/medcore-adoption/triage`, existing patient/ER triage pages | Implemented behind gate | Workbench exposes language, symptoms and result; expand language coverage only with clinician-authored validation |
| Agent console / audited handoff | `AgentConsole.tsx`, `agent_handoffs` APIs | Implemented, now reachable from workbench | Use `/team/medcore` for queue operations |
| AI KPI and unavailable-metric semantics | `metric-integrity.service.js`, existing admin analytics | Partial | Adoption metric reader is in workbench; KPI catalogue and source ownership still need operational data mapping |
| HITL lab report explainer | `lab_explainer_drafts` APIs | Implemented behind gate | Workbench creates drafts; clinician queue and delivery remain approval-gated |
| Medication adherence scheduler | `medcore-adoption.service.js`, cron service and notifications | Implemented behind gate | Workbench creates plans; provider credentials determine delivery |
| Holt-Winters pharmacy forecast | `pharmacy-forecast.service.js` | Implemented behind gate | Workbench accepts history; production use needs real stock history and backtest evidence |
| Two-layer prescription safety | `prescription-safety-gate.service.js` and audited sign-off route | Implemented behind gate | Workbench runs a safety check; clinical rules remain Mediqzy-authored and governed |
| Ambient scribe / SOAP | Existing doctor/hospital scribe pages and routes | Existing parity | Keep separate from the workbench; do not duplicate prescription workflows |
| Radiology HITL / PACS | Existing hospital radiology, PACS and DICOM modules | Existing parity | Confirm each tenant's source mappings before enablement |
| AI letters / referral documents | Existing document and letter workflows | Partial | Verify role-specific entry points and PDF acceptance in a later UI audit |
| No-show prediction | Existing predictive analytics and appointment automation | Partial | Reconcile feature contract and nightly data source before claiming parity |
| Postgres FTS/RAG and chart search | Existing RAG/AI knowledge and chart-search services | Partial | Verify ingestion coverage and patient scoping with production fixtures |
| ABDM / ABHA | `server/routes/abdm*`, kiosk and consent flows | Existing parity, partner-gated | Gateway credentials and certification are external prerequisites |
| FHIR R4 export | `server/routes/fhir.route.js`, FHIR mapper and bulk export | Existing parity | Validate with receiving systems |
| HL7 v2 legacy export | HL7/FHIR monitor and gateway scaffolding exist; no certified MedCore-equivalent export contract | Gap / external | Requires a real analyzer/LIS gateway and message certification |
| GST billing / Razorpay / refunds | Billing, wallet and payment routes | Existing parity | Keep fail-closed payment verification and webhook idempotency |
| Pharmacy inventory, POs, suppliers, controlled register | Pharmacy and SCM route families | Existing/partial | Remaining gaps are dispense depth, regulatory rules and tenant UAT, not a blank module |
| HR roster, leave, payroll, certifications | Team/corporate/HR route families and certificate pages | Existing/partial | Complete route-by-route UAT; do not infer feature correctness from page presence |
| Visitor, queue, ambulance, blood bank, surgery, maternity, paediatrics | Corresponding Mediqzy department modules | Existing parity at module level | Run module smoke contracts and verify permissions |
| Internal chat / omnichannel notifications | Team chat, WhatsApp/SMS/email/call and CRM channel settings | Existing/partial | Provider credentials and delivery UAT remain deployment inputs |
| WCAG/axe gate and Hindi i18n | `client/scripts/check-accessibility.mjs`, a11y CI, i18n infrastructure | Existing gate / partial language coverage | Current checkout still reports four pre-existing CRM findings; do not mark zero until fixed |
| TOTP, refresh rotation, upload ACLs and audit logs | Existing auth/security middleware and routes | Existing parity at design level | Verify production configuration and key rotation separately |

## UI/design comparison

MedCore presents a smaller, cohesive dashboard with role-specific navigation, a consistent card/table language, and direct links from the AI catalogue to the corresponding page. Mediqzy presents a much larger multi-portal React application (patient, team, admin, clinical departments and CRM) with richer module depth but historically fragmented entry points. The new workbench closes the highest-impact MedCore UX gap by putting the adopted AI workflows in one operator page while retaining Mediqzy's existing layouts, RBAC and API client.

The workbench deliberately uses labels and states that make safety visible: `Feature flag disabled`, `pending draft`, explicit `unavailable` metrics, and a note that patient-facing explanations require clinician approval. It does not display fabricated zeros, mark an unconfigured provider as delivered, or bypass the API gate.

## Features that cannot be certified as “implemented” from source alone

The following require external inputs and must remain release dependencies:

1. MedCore's SNOMED subset and translation assets cannot be copied; a licensed terminology source or an independently authored clinical map is required.
2. ABDM/ABHA requires government partner credentials and conformance testing.
3. HL7 v2 requires an actual analyzer/LIS gateway and message validation.
4. Eight-language clinical UI and red-flag coverage require clinician translation/review.
5. Controlled-substance rules require a regulatory specification and clinical owner.
6. HIPAA/DPDP/NABH claims require an independent audit; code controls are not certification.

## Verification checklist

- `npm run build` (client) must pass after the workbench route is included.
- `npm run test:portal-routes-sanity` must include `/team/medcore` and `/medcore/workbench`.
- `npm run test:a11y` must be run; any new finding blocks release.
- Authenticated UAT must exercise triage, handoff claim/complete, safety block/acknowledgement, lab draft approval/delivery, adherence plan creation and forecast with a dedicated test tenant.
- Production enablement requires applying the Mediqzy migrations and setting `MEDCORE_ADOPTION_ENABLED=true` only after the model-card, clinical and counsel gates are signed.

