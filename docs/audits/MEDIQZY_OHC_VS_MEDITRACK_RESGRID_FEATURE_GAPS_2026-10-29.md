# Mediqzy OHC vs MediTrack and Resgrid: feature comparison and gap register

Reviewed: **29 October 2026**. Intended setting: factory/workplace OHC, approximately 500–2,000 employees, web plus mobile response.

## Decision

Keep Mediqzy's clinical and employer-linked OHC foundation. Prioritize connecting emergency intake to qualified responders, on-duty coverage, communication, ambulance trips and a measured response timeline. Use Resgrid as the principal emergency-operations reference. MediTrack's inspected main branch is a scaffold, so its proposal is a requirements reference, not an implemented competitor to migrate to.

## Implementation update — Mediqzy OHC emergency response foundation

The following P0 slice is now implemented in this workspace (not merely documented): OHC-scoped responder availability, named responder assignment, acknowledgement/decline, responder progress (`responding`, `on scene`, `cleared`), automatic return to available after the last active assignment, and an append-only operational event timeline visible in the OHC workspace. All operations remain constrained to the caller's active OHC unit and record the emergency ID.

This closes the first implementation portion of RG-01, RG-05, RG-06, RG-08, RG-11, RG-12, RG-48 and RG-49. The OHC console refreshes live operational information on a bounded polling interval and reports acknowledgement timing from server timestamps. Field notes are attributable; incident reports are draft/finalized, and corrections are append-only amendments. Shift-based roster resolution, automated dispatch rules, push/SMS/email delivery, provider ambulance-trip linking and GPS remain separate work because they require explicit provider/notification/roster integrations; they have not been represented as simulated functionality.

The register contains **71 comparison entries**: **61 Resgrid entries** and **10 MediTrack entries**, including an explicit existing-feature check. Entries are capabilities or feature families, not estimates of tickets or engineering effort. Some overlap across vendors; do not sum them as independent development tasks.

## Scope, evidence and limits

- Mediqzy baseline: repository HEAD `477acc4b54ae7c1318085d9632fe55ca64754699`, plus existing working-tree changes. The earlier sample-monitoring edits are not evidence of live emergency operations. No application code was modified for this audit.
- Primary user journey: `/ohc/login` → `/ohc`; also searched shared ambulance, HR, inventory, biomedical, messaging, notification, corporate-calendar, field-force and hospital-command modules to avoid claiming they do not exist anywhere.
- The production login could not be inspected through the browsing tool in the preceding review. No authenticated production sessions, database mutations, deployment tests, notifications or emergency dispatches were performed. Local routes and service code establish implementation evidence, not production readiness.
- MediTrack source snapshot: `EG-WebDev/MediTrack@3d9884d65348550243b4d92ae49dec43a0bed159`; the old repository name redirects here. Inspected frontend and server source plus README/proposal. Frontend renders `PlaceHolder`; backend router exposes `/test-log`. Claimed calendar, occupational records and automation were not implemented in those files or the inspected source tree. [Source tree](https://github.com/EG-WebDev/MediTrack/tree/3d9884d65348550243b4d92ae49dec43a0bed159).
- Resgrid source snapshot: `Resgrid/Core@d3a4505dfc26ac68087c979f3ee01b8706f67118`. Inspected source tree and selected service contracts for dispatch recommendations, shifts, certifications, checklists, records, workflows and tracking, alongside official feature pages. A service contract corroborates design/API surface; it does not prove successful end-to-end execution. [Source snapshot](https://github.com/Resgrid/Core/tree/d3a4505dfc26ac68087c979f3ee01b8706f67118).
- Resgrid's official site describes the product ecosystem, including separate apps and optional paid add-ons. Those are labelled separately below. Do not interpret every advertised capability as included in a particular self-hosted release. Some search/page titles still say “Coming Soon” while the retrieved page body describes delivery; treat newer RMS/back-office capabilities as release-verification items before adoption.
- “All” means the feature families identified in the reviewed current catalogues, proposals and sampled source, relevant to this comparison, including specialist/add-on families. This is not a claim to enumerate every private feature or every method across either codebase. Negative findings mean not found in reviewed Mediqzy paths; they are not proofs of absence throughout every deployment.
- Completion criteria and priorities are this audit's recommendations, not competitor guarantees. No legal/regulatory certification, uptime or performance claims are inferred.

## Status and priority legend

| Code | Interpretation |
|---|---|
| G | OHC capability not found in reviewed paths; build or integrate after confirming platform reuse. |
| I | Related platform implementation exists, but no equivalent integrated OHC journey was found. |
| P | OHC or shared feature partially exists; identified behavior is incomplete. |
| V | Parity/availability unverified; requires deeper release, security or workflow inspection. |
| E | Existing capability; excluded from missing-feature backlog. |

P0: emergency-response foundation. P1: operational completeness. P2: coverage, usability and governance depth. P3: optional, commercial, geographic or major-incident scope.

## Three-product comparison

| Area | Mediqzy | MediTrack inspected source | Resgrid |
|---|---|---|---|
| Employee/company-linked clinic | Implemented employee lookup and unit scoping | No implemented clinical workflow found | Personnel model; occupational chart requires specialist clinical system |
| Prescriptions, referral creation and fitness PDFs | Implemented through existing clinical services; referral directory/tracking incomplete | No implemented workflow found | Operational response product; do not assume occupational prescribing/fitness support |
| Emergency intake | Persistent workplace event register and status updates | No implemented workflow found | Documented incident intake, dispatch and response operations |
| Responder availability/dispatch | Not integrated into OHC; related ambulance and HR services exist | No implemented workflow found | Documented core strength |
| Occupational scheduling/surveillance | OHC workflow gaps; general scheduling exists elsewhere | Advertised/proposed, not delivered in inspected branch | Shift/event scheduling, not an occupational medical surveillance system |
| Mobile emergency field use | OHC web UI; dedicated response client not verified | Responsive design claim; placeholder UI | Separate purpose-built apps documented |

Resgrid availability statements are based on its [core catalogue](https://github.com/Resgrid/Core) and the specific source groups below. MediTrack distinction is supported by [actual UI](https://github.com/EG-WebDev/MediTrack/blob/3d9884d65348550243b4d92ae49dec43a0bed159/client/src/App.jsx) and [actual router](https://github.com/EG-WebDev/MediTrack/blob/3d9884d65348550243b4d92ae49dec43a0bed159/server/src/routes/index.js).

## What Mediqzy already has and should reuse

- OHC unit/company assignment, worker sign-in, mandatory temporary-password replacement, employee search and clinician signing checks: M1/M3/M9.
- Fitness certificate details/restrictions and PDF retrieval, prescription creation/history, referral creation: M1/M2. Referral currently requires a receiving organisation ID and has no OHC “my referrals” list; see `ohcClient.ts`.
- Emergency severity, location, employee link, persisted status and create/update action audit: M2/M3. The backend accepts triage notes/resolution/transferred status, but the OHC screen exposes a status-advance button instead of a full clinical or dispatch timeline.
- Real ambulance trips, fleet vehicles, crew duty, maintenance, shifts, fares and response-time proxy statistics: M4/M10. The actual ambulance dashboard explicitly displays that no live GPS feed is connected. Older `AmbulanceModulePages.tsx` also contains seeded local-storage screens, so a page title alone is insufficient proof of operational parity.
- HR LMS/shifts, SCM batch/location stock, biomedical maintenance/calibration, communications/notifications, corporate calendars and hospital command displays: M5–M8/M11/M12. Runtime connectivity and OHC authorization still need validation; these are reuse candidates, not ready-made OHC functionality.

## Feature-by-feature register

For every row, “gap/completion” concerns the OHC workflow. Local evidence IDs resolve to concrete paths after the tables. Resgrid rows are officially documented unless marked as add-on/specialist; MediTrack rows are expressly proposal-only.

### Dispatch and emergency operations

Competitor evidence: [Dispatching](https://resgrid.com/features/dispatching), [Dispatch recommendation contract](https://github.com/Resgrid/Core/blob/d3a4505dfc26ac68087c979f3ee01b8706f67118/Core/Resgrid.Model/Services/IDispatchRecommendationService.cs).

| ID | Capability | Mediqzy evidence/finding | Proposed completion | Status / priority | Evidence |
|---|---|---|---|---|---|
| RG-01 | Dispatch named first aiders, roles and teams | Emergency register has no responder assignments | Attach responders and teams to an OHC emergency and record assignment ownership | G / P0 | M1,M2,M3 |
| RG-02 | Rule-based automatic dispatch and run cards | No OHC priority/location/skill dispatch rule engine found | Select eligible responders from incident type, zone, availability and qualification | G / P0 | M3,M4 |
| RG-03 | Dispatch to the people currently on shift | Shift services exist outside OHC; no emergency-to-roster connection | Resolve the active roster before sending assignments | I / P0 | M1,M4,M5 |
| RG-04 | Multi-channel emergency broadcast and rebroadcast | Notification infrastructure exists; emergency creation only inserts event and audit rows | Queue push/SMS/email to assigned responders when an event or priority changes | I / P0 | M3,M7 |
| RG-05 | Responder progress and response timeline | OHC tracks case status; ambulance trips track a separate limited lifecycle | Record assigned/responding/on-scene/cleared events per responder and vehicle | P / P0 | M2,M3,M4 |
| RG-06 | Dispatcher console with synchronized field updates | OHC list reloads on tab changes and own actions; no live dispatch console | Show active incidents, responders and units in one synchronized console | G / P0 | M1,M2 |
| RG-07 | Configurable intake forms, protocols and templates | Fixed incident type, severity, description and location inputs | Add versioned intake fields and incident-type response protocols | P / P1 | M2,M3 |
| RG-08 | Timestamped field notes, attachments and related incidents | Backend has single triage/resolution text; UI only advances status | Add attributed notes, evidence uploads and linked incident records | P / P1 | M2,M3 |
| RG-09 | Reopen/archive/history and incident export | Status update API exists; no controlled reopen/archive or emergency export UI | Preserve state history and support authorized reopen, archive and export | P / P1 | M2,M3 |
| RG-10 | Automatic intake from email/text and external call sources | OHC offers manual reporting and a protected create API; no inbound email/text incident adapter found | Normalize external incident intake into the same authorized and deduplicated emergency workflow | P / P2 | M3 |
| RG-11 | Call analytics and response reports | Ambulance provider statistics exist; OHC has no incident analytics | Report emergency volumes and measured response intervals by site/type | I / P1 | M1,M4 |

### Personnel, qualification and duty coverage

Competitor evidence: [Personnel](https://resgrid.com/features/personnel), [Qualifications](https://resgrid.com/features/contacts-billing-certifications-workforce).

| ID | Capability | Mediqzy evidence/finding | Proposed completion | Status / priority | Evidence |
|---|---|---|---|---|---|
| RG-12 | Live responder action and staffing status | Clinic staff directory only; ambulance crew have separate on/off-duty state | Expose OHC available/busy/responding/on-scene staffing separately from case status | I / P0 | M1,M2,M4 |
| RG-13 | Groups/stations, multiple response roles and visibility controls | OHC unit assignments exist but no dispatchable factory responder hierarchy | Map departments/zones/teams and restrict location/PII visibility | P / P1 | M1,M3 |
| RG-14 | Credential catalogue, expiry and renewal alerts | Doctor registration check and HR certification fields exist; no OHC first-aider renewal workflow | Track CPR/first-aid/EMT credential validity with expiry reminders | I / P1 | M3,M5 |
| RG-15 | Qualification rules and assignment-time evidence | No OHC responder qualification checks or snapshots found | Evaluate required credentials and retain the qualification used for assignment | G / P1 | M3,M5 |
| RG-16 | Training delivery, quizzes, due dates and completion | HR LMS supports programs/enrollment/score; not exposed to OHC responders | Connect role-specific learning, quizzes and renewal evidence to OHC coverage | I / P2 | M1,M5 |
| RG-17 | Low-staffing and resource-availability alerts | No OHC threshold monitoring tied to required responder roles found | Alert accountable supervisors when response coverage drops below configured requirements | I / P1 | M3,M5,M7 |
| RG-18 | Recurring responder events with RSVP | Corporate wellness calendars exist; no OHC response-team event participation | Add drill/training calendar participation and reminders for response teams | I / P2 | M1,M11 |

### Shift scheduling

Competitor evidence: [Shifts](https://resgrid.com/features/shifts), [Shift service contract](https://github.com/Resgrid/Core/blob/d3a4505dfc26ac68087c979f3ee01b8706f67118/Core/Resgrid.Model/Services/IShiftsService.cs).

| ID | Capability | Mediqzy evidence/finding | Proposed completion | Status / priority | Evidence |
|---|---|---|---|---|---|
| RG-19 | Role-based assigned shifts and staffing calendar | HR and ambulance shift persistence exist; no OHC operational staffing board | Show coverage requirements and assigned people per site/date/role | I / P1 | M1,M4,M5 |
| RG-20 | Self-service signup and cross-station coverage | No OHC signup workflow found | Let qualified responders fill eligible open shifts within assigned sites | G / P2 | M1,M4,M5 |
| RG-21 | Shift trade/request/accept/reject completion workflow | No OHC shift-trade process found | Record exchange requests, approvals, notifications and resulting coverage | G / P2 | M1,M4,M5 |
| RG-22 | Coverage fulfillment and readiness reports | Staff lists do not calculate required-versus-filled OHC response roles | Expose shortages before shifts start and report coverage history | G / P1 | M1,M3,M5 |

### Vehicles, location and operational mapping

Competitor evidence: [Units](https://resgrid.com/features/avl-units), [Mapping](https://resgrid.com/features/mapping), [Hardware tracking](https://resgrid.com/features/hardware-tracking), [Site preplans](https://resgrid.com/features/contacts-billing-certifications-workforce).

| ID | Capability | Mediqzy evidence/finding | Proposed completion | Status / priority | Evidence |
|---|---|---|---|---|---|
| RG-23 | OHC-linked vehicle dispatch and role-based crew assignment | Ambulance trips, vehicles and crew exist in provider portal | Authorize OHC to request/track a provider trip using the same incident ID | I / P0 | M1,M4 |
| RG-24 | Live vehicle/personnel GPS and ETA | Ambulance dashboard explicitly states no GPS feed is connected | Ingest authorized positions with freshness and calculate route-based ETA | G / P1 | M4 |
| RG-25 | Custom unit states tied to destination/call | Ambulance vehicle and trip state lists are separate and fixed | Link operational state, destination, vehicle, crew and emergency | P / P1 | M4 |
| RG-26 | Factory response map with calls, personnel and units | Hospital command/display modules exist; no OHC operational map | Combine active OHC incidents and response resources on one scoped map | I / P1 | M1,M4,M12 |
| RG-27 | Site contacts, access instructions and response preplans | Company/unit metadata exists; no dispatch-linked hazard and access preplan found | Maintain site response contacts, access hazards and approved plans visible during dispatch | P / P1 | M1,M3 |
| RG-28 | POIs and imported KML/KMZ locations | No OHC emergency POI catalogue/import found | Map gates, AEDs, muster points, oxygen and access routes | G / P2 | M1,M3 |
| RG-29 | GeoJSON hazard districts and station geofences | Field-force geofence fields exist; no OHC response-zone routing | Define plant hazards/coverage polygons and use them in dispatch | I / P2 | M1,M13 |
| RG-30 | Hardware tracker ingestion and device health | No ambulance/OHC hardware GPS ingestion workflow found | Bind authenticated vehicle trackers and retain position/device health | G / P2 | M4 |

### Messaging, automation and applications

Competitor evidence: [Messaging](https://resgrid.com/features/messaging), [Workflow engine](https://resgrid.com/features/workflows), [Apps](https://resgrid.com/apps), [Conversational commands](https://resgrid.com/features/ai), [Core feature catalogue](https://github.com/Resgrid/Core).

| ID | Capability | Mediqzy evidence/finding | Proposed completion | Status / priority | Evidence |
|---|---|---|---|---|---|
| RG-31 | Response-team document and procedure library | Clinical uploads and shared platform documents exist; no OHC team SOP library exposed | Publish scoped response plans and procedures to staff and field clients | I / P2 | M1,M7 |
| RG-32 | Incident-linked direct/group chat | Doctor chat and broader communication modules exist; no OHC incident thread | Reuse messaging with incident membership and scoped clinical visibility | I / P1 | M1,M7 |
| RG-33 | Response RSVP, read status and targeted announcements | OHC emergencies lack recipient acknowledgement records | Track who received/read/replied to operational messages | I / P0 | M3,M7 |
| RG-34 | Dispatch-triggered configurable workflow actions | Platform notification/n8n code exists; no OHC automation editor/event mapping | Publish OHC events and configure site-specific notification/API actions | I / P1 | M3,M7 |
| RG-35 | Workflow transforms, retries and per-step execution history | No OHC user-facing execution/retry inspection found | Record transformed payload, delivery results and retry state without leaking clinical data | I / P1 | M1,M7 |
| RG-36 | Dedicated first-aider mobile responder experience | OHC workspace is web UI; no purpose-built responder client verified | Provide assignment, status, acknowledgement and navigation on responder devices | G / P1 | M1,M2 |
| RG-37 | Vehicle tablet, dispatcher and incident-command clients | Separate ambulance/hospital views exist; no common OHC response model | Expose role-specific views over one emergency/resource/event model | I / P2 | M4,M12 |
| RG-38 | Factory emergency wallboard | Hospital ED/ICU displays exist; no OHC calls/staffing/ETA board | Create a non-clinical response wallboard from OHC operational events | I / P2 | M12 |
| RG-39 | Bounded offline operational capture and synchronization | No OHC emergency offline queue/reconciliation found | Queue supported notes/checks locally with explicit sync and duplicate handling | G / P1 | M1,M2 |
| RG-40 | Conversational dispatch and responder status commands | AI/voice assistants exist elsewhere; OHC has no authorized dispatch command tools | Add auditable role-scoped commands for assignments, incident lookup and status | I / P2 | M1,M14 |
| RG-41 | Mutual-aid department/resource coordination | Clinical referral exists; no OHC external responder resource-request workflow | Link partner teams and track requests/acceptance against the incident | G / P2 | M1,M2,M3 |

### Readiness and inventory

Competitor evidence: [Readiness](https://resgrid.com/features/checklists-maintenance-work-orders), [Inventory](https://resgrid.com/features/inventory).

| ID | Capability | Mediqzy evidence/finding | Proposed completion | Status / priority | Evidence |
|---|---|---|---|---|---|
| RG-42 | Versioned equipment/crew/site checklists | Biomedical tickets/calibration exist; no OHC operational checklist definitions | Create reusable pre-shift checks for AED, oxygen, emergency kits and crews | I / P1 | M1,M6 |
| RG-43 | Scheduled check occurrences, evidence and missed-check history | No OHC due-check or evidence-completion workflow found | Schedule checks, retain the definition version and report omissions | G / P1 | M1,M6 |
| RG-44 | Check failure linked to maintenance and out-of-service status | Fleet/biomedical maintenance exist separately | Create linked defects and block unsuitable response equipment until cleared | I / P1 | M4,M6 |
| RG-45 | Location-aware OHC stock and movement ledger | SCM/pharmacy batch/location stock exists; OHC exposes none | Use existing stock ledger with OHC locations and role-scoped movement screens | I / P1 | M1,M8 |
| RG-46 | Serialized equipment/PPE custody and return condition | Broader equipment/stock modules exist; no OHC responder custody flow verified | Issue serialized assets to crews with return, damage and loss evidence | I / P2 | M6,M8 |
| RG-47 | Incident-linked consumption, transfer and replenishment | No emergency-to-stock movement reference found in OHC | Link kit/medicine consumption and replenishment to emergency and vehicle | I / P1 | M3,M8 |

### Operational records, reports and governance

Competitor evidence: [Records lifecycle](https://resgrid.com/features/records-management-system), [Records service contract](https://github.com/Resgrid/Core/blob/d3a4505dfc26ac68087c979f3ee01b8706f67118/Core/Resgrid.Model/Services/IRecordsService.cs).

| ID | Capability | Mediqzy evidence/finding | Proposed completion | Status / priority | Evidence |
|---|---|---|---|---|---|
| RG-48 | Response-derived records with controlled review/finalization | OHC has mutable case row plus action log; no incident report lifecycle | Generate operational reports from source events and require review before finalization | P / P1 | M2,M3 |
| RG-49 | Immutable finalized revisions and reasoned amendments | Emergency update overwrites values; no final revision/amendment model found | Freeze approved reports and record later corrections as attributed amendments | G / P1 | M3 |
| RG-50 | Evidence packets, authorized search and printable incident reports | Certificate PDF exists; no comparable OHC incident export/search package | Search operational incidents and export authorized report/evidence packets | P / P2 | M1,M2,M3 |
| RG-51 | Incident retention, legal hold and disclosure workflow | No OHC incident retention/hold/disclosure process found | Introduce policy-driven retention and auditable release/hold controls | G / P2 | M3 |
| RG-52 | Missing-report ownership, supervisory queues and reminders | No OHC incident reporting accountability queue found | Assign report owners and expose overdue/review obligations | G / P1 | M1,M3 |

### Resgrid optional add-ons and specialist capabilities

Competitor evidence: [Add-on boundaries](https://resgrid.com/features), [Protected data](https://resgrid.com/features/advanced-data-protection), [Incident back office](https://resgrid.com/features/incident-back-office), [Enhanced AI](https://resgrid.com/features/enhanced-ai), [Command and apps](https://resgrid.com/apps).

PTT, Advanced Data Protection, Readiness Pro, Business Ops, Enhanced AI and Incident Back Office are advertised optional add-ons. Incident Command is a separate app; NERIS belongs to operational RMS and is specialist US fire reporting. Verify release and entitlement independently.

| ID | Capability | Mediqzy evidence/finding | Proposed completion | Status / priority | Evidence |
|---|---|---|---|---|---|
| RG-53 | Push-to-talk response channels | Video/voice communications exist; no OHC radio-style channels found | Evaluate optional PTT with response-team membership and operational history | I / P2 | M1,M7 |
| RG-54 | Field encryption with separate keys and MFA-gated reveal | OHC role/unit checks exist; protected-field reveal model not established | Evaluate encrypted sensitive incident fields with step-up access and redacted notifications | V / P2 | M3,M9 |
| RG-55 | Preventive work orders with parts, labor, downtime and cost | Fleet maintenance and biomed tickets exist; full connected readiness costing not established | Extend asset services to controlled repair workflow and originating-check evidence | P / P2 | M4,M6 |
| RG-56 | Deployment work/time capture and source-linked commercial billing | Mediqzy billing exists; no OHC emergency deployment accounting chain verified | Link response work, contractual rates and reviewed invoice lines if commercially needed | I / P3 | M4,M10 |
| RG-57 | Protected workforce cost and deployment margin | HR/payroll exists; incident-level protected cost snapshots not established | Evaluate response cost by approved labor and resource facts | V / P3 | M5,M10 |
| RG-58 | Enhanced incident AI briefs and grounded report drafts | AI services exist; incident-specific grounded operational assistant not established | Evaluate permission-scoped draft reports and evidence-linked incident summaries | I / P3 | M14 |
| RG-59 | ICS incident command, accountability and multi-incident board | Hospital command center is a clinical operations board | Add factory incident command roles, resource accountability and command timeline if required | I / P2 | M12 |
| RG-60 | Large-incident back-office logistics and closeout | No OHC EOC logistics workflow found | Evaluate lodging/feeding, vendors, resource orders, time/cost/claims and closeout for major incidents | V / P3 | M1,M10 |
| RG-61 | NERIS fire reporting and schema/submission lifecycle | No OHC NERIS workflow found; not an Indian OHC requirement | Exclude unless the deployment explicitly needs supported US fire reporting | G / P3 | M1,M3 |

### MediTrack advertised or proposed capabilities; NOT implemented parity

Competitor evidence: [README feature claims](https://github.com/EG-WebDev/MediTrack/blob/3d9884d65348550243b4d92ae49dec43a0bed159/README.md), [Project proposal](https://github.com/EG-WebDev/MediTrack/blob/3d9884d65348550243b4d92ae49dec43a0bed159/PROJECT_PROPOSAL.md), [Actual placeholder UI](https://github.com/EG-WebDev/MediTrack/blob/3d9884d65348550243b4d92ae49dec43a0bed159/client/src/App.jsx), [Actual test router](https://github.com/EG-WebDev/MediTrack/blob/3d9884d65348550243b4d92ae49dec43a0bed159/server/src/routes/index.js).

These entries do **not** mean MediTrack has working functionality missing from Mediqzy. They preserve the advertised/proposed requirements separately; responsive design is recorded as an existing-feature check.

| ID | Capability | Mediqzy evidence/finding | Proposed completion | Status / priority | Evidence |
|---|---|---|---|---|---|
| MT-01 | Occupational appointment calendar with drag/drop rescheduling | Doctor appointments/calendars exist; no dedicated OHC booking workflow | Adapt scheduling to occupational appointments, employees and sites | I / P1 | M1,M11 |
| MT-02 | Multi-campus testing coordination including DOT testing | No OHC DOT test coordination workflow found | Evaluate only if customer needs this testing protocol and relevant geography | G / P3 | M1,M2 |
| MT-03 | Comprehensive occupational patient-record workspace | Employee lookup, prescription and certificate features exist; no complete OHC encounter screen | Unify occupational visits, observations, testing, treatment and follow-up | P / P1 | M1,M2 |
| MT-04 | Medical staff communication dashboard | Messaging exists elsewhere; no OHC communications dashboard | Reuse shared messaging with site/unit/incident scope | I / P2 | M1,M7 |
| MT-05 | Smartsheet and Power Automate workflow connections | No OHC-specific connectors found; generic automation infrastructure exists | Add connectors only where employer workflows require them | I / P3 | M7 |
| MT-06 | SharePoint/CSV-compatible occupational exports | No occupational visit/testing export available in OHC workspace | Export authorized occupational operational datasets with documented columns | P / P2 | M1,M2 |
| MT-07 | PDF operational summaries and basic analytics | Fitness certificate PDF exists; no OHC activity-summary dashboard | Add site/date summaries without exposing unnecessary employee findings | P / P2 | M1,M2 |
| MT-08 | Automated occupational-appointment email/SMS reminders | General appointment notification services exist; no OHC appointment integration | Use shared notification service for booked occupational visits | I / P2 | M7,M11 |
| MT-09 | Admin, technician and view-only workflow permissions | OHC doctor/staff/CMO roles exist; no separate OHC view-only/technician capability matrix | Define task permissions for testing and viewing while preserving clinician signing controls | P / P2 | M1,M3,M9 |
| MT-10 | Responsive clinic web interface | Mediqzy OHC already uses responsive layouts | No missing-feature claim; test small-screen navigation and tables separately | E / P3 | M1,M2 |

## Additional OHC needs not established as delivered by either comparator

Do not count these as “available in MediTrack/Resgrid but missing in Mediqzy.” They are factory-clinic requirements to validate separately:

- Pre-employment, periodic and return-to-work examination protocols and recall schedules.
- Audiometry/spirometry/vision result capture and longitudinal exposure-linked surveillance.
- Occupational exposure/job hazard profiles connected to examination requirements.
- A unified clinical encounter with vitals, observations, treatment, prescriptions, referral outcome and follow-up.
- Region-specific statutory occupational forms and employer reports.
- Closed-loop hospital transfer and medical follow-up with employer-visible fitness restrictions separated from confidential findings.

MediTrack's surveillance motivation does not establish implemented test forms. Resgrid's responder certifications are not employee fitness certificates; operational RMS is expressly not ePCR. OHC “triaged” status is not a completed clinical triage assessment.

## Recommended implementation order and acceptance scenarios

1. **Response foundation (P0):** connect emergency ID, on-duty roster, authorized assignments, acknowledgement, multichannel delivery and provider ambulance trip. Test a critical incident with a responder declining, no one available, duplicate submission and failed notification. Expose unacknowledged assignments rather than treating delivery as acceptance.
2. **Field operations (P1):** live updates, measured response events, clinic encounter linkage, operational notes/evidence, referral lookup/status, equipment readiness, stock consumption, reporting and supported offline capture. Test two simultaneous incidents, stale GPS, network loss/reconnect and shift handover.
3. **Coverage/governance (P2):** qualification renewals, trades, geospatial planning, incident record review/amendments, mobile role views and wallboard. Test cross-company isolation, staff suspension, expired credentials and a post-finalization correction.
4. **Optional expansion (P3):** major-incident command/back office, operational costing, specialist reporting and advanced AI only where a customer needs them. Verify Resgrid release/add-on boundaries first.

Prefer reusing shared services where they have adequate scoping and persistence. Do not broaden the OHC token to all ambulance, HR or clinical APIs: add explicit unit/company/provider-authorized operations. If Resgrid is integrated, exchange incident IDs, locations, assignments, operational states and timestamps; keep clinical findings in the clinical record with deliberate access controls.

## Evidence index

### Mediqzy paths

- **M1:** [OHC workspace and available tabs](../../client/src/pages/ohc/OhcWorkspace.tsx).
- **M2:** [Certificate, emergency, prescription and referral forms](../../client/src/pages/care-units/ohcPanels.tsx).
- **M3:** [OHC service, scoped employees, emergency persistence and audit](../../server/services/care-units/ohc.service.js).
- **M4:** [Ambulance provider APIs, real trips/fleet/crew/maintenance/shifts](../../server/routes/ambulance.route.js).
- **M5:** [HR shifts, LMS enrollment, scores and certification dates](../../server/routes/hrms.route.js).
- **M6:** [Equipment maintenance tickets and calibration schedules](../../server/services/biomedical-equipment.service.js).
- **M7:** [Notification automation infrastructure; availability not runtime-verified](../../server/services/notification-orchestrator.service.js).
- **M8:** [SCM stock balances, locations, batches and expiry](../../server/services/scm-inventory.service.js).
- **M9:** [OHC clinician identity bridge and authorization](../../server/middleware/ohcClinicianAuth.middleware.js).
- **M10:** [Existing ambulance fares and financial summaries](../../server/services/ambulance-dispatch.service.js).
- **M11:** [Existing corporate wellness calendar](../../client/src/pages/corporate/CorporateWellnessCalendar.tsx).
- **M12:** [Existing hospital command overview](../../client/src/features/command/pages/CommandCenterOverview.tsx).
- **M13:** [Field-force geofence fields; not emergency routing](../../server/routes/field-force.route.js).
- **M14:** [Existing doctor voice assistant; not OHC dispatch](../../client/src/pages/doctor/DoctorVoiceAssistant.tsx).

Additional inspected paths:

- [OHC API client and referral-list limitation](../../client/src/pages/ohc/ohcClient.ts).
- [OHC route surface](../../server/routes/care-units/ohc-workspace.router.js).
- [Emergency schema](../../server/migrations/ohc-workplace-emergencies.migration.js).
- [Ambulance dashboard and explicit GPS placeholder](../../client/src/pages/ambulance/AmbulanceDashboard.tsx).
- [Ambulance fleet service](../../server/services/ambulance-fleet.service.js).
- [Doctor messaging routes](../../server/routes/doctor-chat.route.js).
- [OHC architecture proposal; not proof of delivered features](../architecture/OHC_UNDER_HOSPITAL_UNITS_DESIGN.md).

### Source checks performed

- Read OHC page, forms, API client, router, service and emergency migration; traced real prescription/referral calls and scoped identity bridge.
- Read relevant ambulance service/routes/dashboard, HR route sections, biomedical maintenance/calibration and SCM stock code; searched for OHC dispatch, geofences, shift trade, credential expiry, PTT and vendor connectors.
- Inspected MediTrack source snapshot and documentation; verified the scaffold/feature-claim discrepancy.
- Inspected Resgrid source tree and selected service contracts; cross-referenced current official feature/app pages and separated paid/specialist features.
- Validated document links, register IDs, evidence references and CSV row parity. No runtime product parity tests were run for this documentation audit.

A missing feature can be closed only after a working authorized OHC journey is demonstrated; a backend method, menu label, sample dashboard or vendor claim alone is insufficient.
