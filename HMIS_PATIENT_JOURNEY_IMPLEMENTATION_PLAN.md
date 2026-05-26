# Mediczy HMIS Patient Navigation and Implementation Document

**Date:** 2026-05-25  
**Scope:** End-to-end patient navigation across OPD, ER, IPD, OT, ICU, discharge, follow-up, insurance, and corporate referral workflows  
**Design goal:** Absolute patient delight, high medical team adoption, paperless workflow, AI-assisted care, and measurable operational control

---

## 1. Executive Intent

Mediczy should operate as a patient navigation and care orchestration platform, not only as a set of department modules.

The target model is:

```text
One patient
One UHID
One longitudinal timeline
One care plan
Multiple role-based workspaces
Continuous data reuse
Closed-loop follow-up
```

The core design rule is:

```text
Capture data once.
Validate it at source.
Feed it forward automatically.
Reuse it for care, safety, billing, communication, analytics, and quality.
```

Every screen, data field, notification, and automation must satisfy at least one of these outcomes:

| Outcome | Meaning |
|---|---|
| Improve care | Better diagnosis, safer treatment, faster escalation |
| Reduce anxiety | Patient and family know what is happening and what comes next |
| Reduce clinician burden | Less typing, fewer duplicate entries, fewer calls |
| Prevent errors | Identity, allergy, medication, consent, implant, and handoff safety |
| Accelerate flow | Less waiting, faster admission, faster OT readiness, faster discharge |
| Support revenue | Correct estimate, pre-auth, package mapping, charge capture, claim readiness |
| Improve governance | Audit trail, infection control, outcomes, quality indicators |

---

## 2. Guiding Principles

### 2.1 Patient Delight Principles

Patients should always be able to answer:

```text
Where am I in the journey?
What happens next?
How long will it take?
Who is responsible?
What will it cost?
What should I do now?
Who can help me?
```

### 2.2 Medical Team Adoption Principles

Doctors and nurses will adopt the system only if it reduces work. The product must follow these rules:

| User | Adoption rule |
|---|---|
| Doctor | AI drafts, doctor validates |
| Nurse | Mobile-first task list, not paper chart replacement only |
| Surgeon | Voice-first operative notes and one-screen OT context |
| Anesthetist | Structured anesthesia record with device/vitals support |
| Front office | Guided checklist instead of free-text coordination |
| Billing/TPA | Auto-fed clinical and package data, not document chasing |
| Patient | Transparent status, less queueing, fewer repeated questions |

### 2.3 Paperless Workflow Principles

No physical paper should be required for registration forms, consent forms, OPD notes, prescriptions, lab/radiology orders, nursing charts, anesthesia records, OT notes, medication administration records, insurance documents, discharge summaries, follow-up plans, corporate referrals, or return-to-work documents.

Paper may be printed only as a legal or patient preference fallback.

---

## 3. Master Navigation Flow

```text
Digital Front Door
  -> Smart Registration / UHID
  -> AI Clinical Intake
  -> OPD Consultation or ER Triage
  -> Diagnostics / Orders
  -> Care Decision
  -> Admission / Procedure / Surgery
  -> Ward / ICU / Recovery
  -> Smart Discharge
  -> Follow-up / Remote Monitoring
  -> Outcome Analytics
```

### 3.1 Four Primary Journey Variants

| Scenario | Entry point | Primary route |
|---|---|---|
| Planned surgery | Appointment / referral | OPD -> pre-op -> admission -> OT -> ward/ICU -> discharge -> follow-up |
| Emergency surgery | ER arrival | ER -> triage -> diagnostics -> emergency OT -> ICU/ward -> discharge -> rehab |
| OPD to IPD conversion | OPD visit | OPD -> diagnostics -> convert to IP -> admission -> treatment/surgery -> discharge |
| Corporate / factory referral | FMO / employer referral | Corporate validation -> OPD -> pre-auth -> admission/surgery -> fitness/RTW |

---

## 4. Data Architecture Concept

### 4.1 Data Flow Pattern

```text
Patient touchpoint
  -> Data capture
  -> Validation / enrichment
  -> Unified patient record
  -> Workflow engine
  -> Role-based workspace
  -> Patient communication
  -> Analytics / quality / revenue cycle
```

### 4.2 Critical Data Objects

| Data object | Purpose |
|---|---|
| Patient master | Identity, UHID, demographics, contacts, language, preferences |
| Encounter | OPD, ER, IPD, teleconsult, follow-up visit instance |
| Appointment | Slot, doctor, department, reason, status |
| Clinical intake | Symptoms, history, medications, allergies, uploaded reports |
| Clinical note | Doctor documentation, diagnosis, plan |
| Order | Lab, radiology, medication, procedure, referral |
| Result | Lab values, imaging report, critical alerts |
| Medication | Prescription, dispensing, administration |
| Allergy | Drug, food, environmental allergy and reaction |
| Consent | Procedure consent, anesthesia consent, emergency consent, e-sign audit |
| Admission | IPD episode, admission type, doctor, bed, payer, expected LOS |
| ADT event | Admit, transfer, discharge, cancel, bed movement |
| Bed movement | Ward, bed, timestamps, occupancy trail |
| OT booking | Room, surgeon, procedure, readiness, timings |
| OT checklist | WHO/surgical safety, implant, blood, anesthesia, NPO |
| Anesthesia record | Drugs, vitals, airway, events, recovery status |
| Implant/consumable | Barcode, batch, charge, traceability |
| Nursing chart | Vitals, pain, drain, mobility, risk assessment, notes |
| eMAR | Medication administration with barcode and nurse signature |
| Billing item | Tariff, package, non-payable, payer responsibility |
| Insurance authorization | Estimate, documents, pre-auth, approval, denial, query |
| Discharge summary | Diagnosis, procedure, course, medicines, instructions, follow-up |
| Follow-up plan | Appointment, teleconsult, dressing, rehab, wound monitoring |
| Feedback/outcome | Satisfaction, infection, readmission, complications |

### 4.3 Data Rules

| Rule | Requirement |
|---|---|
| Single source of truth | Patient identity and UHID are never duplicated intentionally |
| Event timestamping | Every transition is timestamped and user-tagged |
| Structured first | Structured fields should exist for safety-critical data |
| Narrative supported | Clinical free-text and voice notes remain available |
| Audit trail | Clinical, ADT, consent, billing, eMAR, and OT changes are immutable/auditable |
| Role-based access | Users see only what they need for their function |
| AI advisory | AI suggests, summarizes, prioritizes, and drafts; clinicians approve decisions |

---

## 5. Patient Navigation and Data Touchpoints

### 5.1 Digital Front Door

**Navigation**

Patient enters through app, web, WhatsApp, call center, kiosk, corporate referral, or ER desk.

**Micro-process**

1. Patient selects service need or enters symptoms.
2. AI concierge identifies urgency, language, specialty, payer type, and preferred location.
3. System recommends specialty, doctor, slot, and expected wait.
4. Patient books slot or is routed to ER.
5. Patient receives QR code, instructions, estimated arrival time, and document checklist.

**Data captured**

- symptoms / reason for visit
- preferred language
- contact details
- payer type
- corporate/employer referral if applicable
- uploaded documents
- appointment preference

**Data feeds forward to**

- registration
- appointment queue
- OPD/ER workspace
- billing estimate
- insurance eligibility
- patient communication engine

**Data utilization**

| User/system | Use |
|---|---|
| Patient | Appointment status, directions, preparation instructions |
| Front office | Expected arrivals, incomplete registration, special assistance needs |
| Doctor | Visit reason before patient enters room |
| AI | Specialty routing, duplicate detection, risk prompt |

---

### 5.2 Smart Registration and UHID

**Navigation**

Patient completes pre-registration digitally or at assisted front desk/kiosk.

**Micro-process**

1. Patient uploads ID, insurance card, referral letter, old reports.
2. OCR extracts demographic and payer data.
3. System checks duplicate UHID by phone, name, DOB, ID, and facial/photo match where legally allowed.
4. Patient confirms details.
5. UHID is created or existing UHID is linked.
6. Communication, privacy, and treatment consent are captured digitally.

**Data captured**

- patient demographics
- ID document
- UHID/MRN
- emergency contact
- payer/insurance/corporate account
- consent preferences
- language and accessibility needs

**Data feeds forward to**

- OPD/ER registration
- billing
- TPA/corporate eligibility
- patient portal
- wristband generation
- discharge packet

**Data utilization**

| User/system | Use |
|---|---|
| MRD | Identity quality and duplicate control |
| Billing | Correct payer and tariff mapping |
| Clinical team | Allergy/identity safety and language needs |
| Patient app | Personalized journey and notifications |

---

### 5.3 AI Clinical Intake

**Navigation**

Before doctor/triage assessment, patient provides structured symptoms and history.

**Micro-process**

1. Patient answers guided questions by voice, text, or assisted entry.
2. Patient uploads previous prescriptions, reports, discharge summaries, and imaging.
3. AI extracts medications, diagnoses, abnormal values, allergies, and past procedures.
4. AI creates a concise clinical summary.
5. Doctor/nurse validates critical items.

**Data captured**

- chief complaint
- symptom duration and severity
- history of present illness
- past medical/surgical history
- current medications
- allergies
- pregnancy status where relevant
- old reports
- risk factors

**Data feeds forward to**

- OPD consultation
- ER triage
- clinical decision support
- suggested order sets
- medication safety
- pre-op risk assessment
- discharge summary draft

**Data utilization**

| User/system | Use |
|---|---|
| Doctor | One-page pre-consult summary |
| Nurse | Risk flags and vitals priority |
| AI | Suggested questions, red flags, order bundle |
| Patient | Less repeated history-taking |

---

### 5.4 OPD Consultation

**Navigation**

Patient is called by token and seen by doctor in a unified clinical workspace.

**Micro-process**

1. Doctor opens patient timeline.
2. AI displays intake summary, old reports, allergies, medications, and risk flags.
3. Ambient scribe drafts SOAP note while doctor speaks naturally.
4. Doctor confirms diagnosis and plan.
5. Doctor places lab/radiology/pharmacy/procedure orders.
6. If admission or surgery is needed, doctor selects `Start Admission` or `Start Surgical Pathway`.

**Data captured**

- clinical notes
- diagnosis
- orders
- prescriptions
- procedure recommendation
- admission advice
- follow-up plan

**Data feeds forward to**

- lab/radiology
- pharmacy
- billing
- admission request
- OT planning
- insurance pre-auth
- discharge summary
- analytics

**Data utilization**

| User/system | Use |
|---|---|
| Doctor | Longitudinal clinical decision-making |
| Lab/Radiology | Electronic order and priority |
| Billing | Consultation, orders, procedure estimate |
| Insurance | Diagnosis and procedure evidence |
| Patient | Digital prescription and next steps |

---

### 5.5 ER Arrival and Triage

**Navigation**

Emergency patients bypass normal appointment flow.

**Micro-process**

1. ER desk creates temporary emergency ID if identity is unknown.
2. Nurse captures vitals, chief complaint, injury mechanism, arrival mode, and MLC flag.
3. AI triage suggests acuity level.
4. ER doctor confirms triage level.
5. STAT diagnostics and treatment orders are placed.
6. If surgery is required, emergency OT activation is triggered.
7. ER episode converts to IPD after stabilization or surgery decision.

**Data captured**

- temporary ID or UHID
- arrival time
- triage category
- vitals
- GCS/pain score/trauma score where applicable
- MLC status
- emergency contact
- STAT orders
- resuscitation notes

**Data feeds forward to**

- ER queue
- doctor workspace
- STAT lab/radiology
- blood bank
- OT activation
- ICU bed reservation
- insurance regularization
- MLC documentation

**Data utilization**

| User/system | Use |
|---|---|
| ER nurse | Acuity-based queue and task list |
| ER doctor | Critical patient prioritization |
| OT/ICU | Emergency readiness |
| Billing/TPA | Retrospective payer workflow |
| Family | Status communication after stabilization |

---

### 5.6 Diagnostics

**Navigation**

Patient moves to phlebotomy, lab, radiology, or bedside diagnostics based on order type and priority.

**Micro-process**

1. Electronic order is generated from OPD/ER/IPD.
2. Order carries priority: routine, urgent, STAT, pre-op.
3. Barcode labels are generated.
4. Sample is collected or scan is performed.
5. Results return electronically.
6. Critical values generate alerts.
7. Results update the patient timeline and care pathway.

**Data captured**

- order details
- sample timestamp
- collector/technician
- lab values
- imaging report
- DICOM/PACS link
- critical flags

**Data feeds forward to**

- diagnosis support
- pre-op clearance
- early warning score
- medication dosing
- discharge readiness
- insurance documentation

**Data utilization**

| User/system | Use |
|---|---|
| Doctor | Diagnosis, treatment plan, surgery decision |
| Nurse | Monitoring priority and clinical escalation |
| AI | Abnormal trend detection |
| Insurance | Evidence for authorization |
| Patient | Report visibility in portal |

---

### 5.7 Care Decision and Pathway Launch

**Navigation**

After consultation or ER assessment, the patient is routed to OP care, admission, surgery, ICU, referral, or follow-up.

**Micro-process**

1. Doctor selects care decision.
2. System launches pathway template.
3. Relevant tasks are generated for front office, nursing, diagnostics, anesthesia, OT, billing, insurance, and pharmacy.
4. Patient app shows next steps.

**Pathway examples**

| Pathway | Auto-generated tasks |
|---|---|
| Planned surgery | Pre-op labs, anesthesia review, consent, estimate, pre-auth, OT slot |
| Emergency surgery | STAT diagnostics, blood reservation, emergency consent, OT activation, ICU bed |
| OPD to IPD | Admission request, bed allocation, deposit/pre-auth, nursing assessment |
| Corporate referral | Eligibility validation, tariff estimate, employer approval, sponsor billing |

**Data feeds forward to**

- ADT
- bed management
- OT
- consent
- billing/insurance
- patient communication
- care team dashboards

---

### 5.8 Admission and Bed Management

**Navigation**

Patient is admitted from planned admission, ER, OPD conversion, or corporate referral.

**Micro-process**

1. Admission request is created.
2. ADT event `A01 Admit` is generated.
3. Bed allocation engine recommends bed based on class, gender, infection risk, acuity, payer, and expected LOS.
4. Patient wristband/RFID is generated.
5. Nurse receives admission assessment task.
6. Initial care plan, diet, medication reconciliation, risk assessment, and vitals schedule are created.

**Data captured**

- admission type
- admitting doctor
- admission diagnosis
- bed/ward
- payer/package
- expected LOS
- initial nursing assessment
- fall risk, pressure sore risk, infection risk

**Data feeds forward to**

- ward dashboard
- pharmacy
- dietetics
- nursing care plan
- billing package
- insurance authorization
- discharge prediction

**Data utilization**

| User/system | Use |
|---|---|
| Bed manager | Occupancy and capacity planning |
| Nurse | Admission checklist and risk-based task list |
| Doctor | Inpatient care context |
| Billing | Room charges and package start |
| Patient | Room and care team information |

---

### 5.9 Pre-Operative Readiness

**Navigation**

Patient is prepared for surgery through a paperless readiness checklist.

**Micro-process**

1. Surgical order creates pre-op checklist.
2. System verifies diagnostics, fitness, consent, blood, implant, NPO, and payment/pre-auth.
3. Anesthesia team completes digital pre-anesthesia assessment.
4. OT slot is confirmed.
5. Ward nurse receives transport readiness task.
6. OT dashboard displays case readiness percentage.

**Data captured**

- pre-op lab/radiology status
- anesthesia clearance
- consent status
- NPO status
- blood reservation
- implant/consumable requirement
- OT room and team
- readiness exceptions

**Data feeds forward to**

- OT command center
- surgeon/anesthetist workspace
- billing estimate
- inventory
- family status updates
- infection control

---

### 5.10 OT and Procedure Workflow

**Navigation**

Patient moves from ward/ER to OT and then recovery/ICU/ward.

**Micro-process**

1. Patient transport is initiated.
2. OT receives patient and confirms identity, procedure, site, consent, and allergies.
3. Surgical safety checklist is completed digitally.
4. Anesthesia record begins.
5. Surgery timestamps are captured: in-room, anesthesia start, incision, closure, out-room.
6. Surgeon dictates operative note using voice/ambient workflow.
7. Implants and consumables are scanned.
8. Charges are captured automatically.
9. Patient is shifted to PACU/ICU/ward.
10. Family receives approved status updates.

**Data captured**

- OT timings
- surgical checklist
- anesthesia record
- operative note
- implants and batch numbers
- consumables
- complications
- blood loss
- post-op destination

**Data feeds forward to**

- EMR
- billing
- inventory
- implant traceability
- infection surveillance
- discharge summary
- outcome analytics

---

### 5.11 Ward, ICU, and Recovery Care

**Navigation**

Patient is monitored and managed by care team until clinically ready for discharge.

**Micro-process**

1. Nurse receives prioritized task list.
2. Vitals, pain, drain, wound, mobility, intake/output, and notes are charted digitally.
3. Medication administration is barcode-verified in eMAR.
4. Device vitals flow into EMR where available.
5. AI calculates early warning and deterioration risk.
6. Doctor rounds use a patient timeline and pending issue list.
7. Allied teams receive tasks: physiotherapy, diet, wound care, counseling.

**Data captured**

- vitals
- pain score
- nursing notes
- eMAR
- intake/output
- wound status
- drains
- mobility
- diet
- physiotherapy status
- escalation events

**Data feeds forward to**

- doctor rounds
- early warning alerts
- discharge readiness
- pharmacy reconciliation
- infection control
- quality indicators

**Data utilization**

| User/system | Use |
|---|---|
| Nurse | Prioritized work and missed-task prevention |
| Doctor | Clinical progress and discharge decision |
| AI | Sepsis/deterioration/fall risk alerting |
| Pharmacy | Medication safety and reconciliation |
| Quality | Infection, readmission, incident tracking |

---

### 5.12 Smart Discharge

**Navigation**

Discharge planning begins at admission and completes as a coordinated workflow.

**Micro-process**

1. Expected discharge date is calculated and updated.
2. Discharge readiness checklist tracks clinical, nursing, pharmacy, billing, insurance, and patient education items.
3. AI drafts discharge summary from diagnosis, progress notes, OT note, results, medications, and follow-up plan.
4. Doctor reviews and signs.
5. Pharmacy prepares discharge medicines.
6. Billing and insurance finalize in parallel.
7. Patient pays digitally if required.
8. Discharge packet is sent to patient app/email/WhatsApp.
9. ADT event `A03 Discharge` closes admission.

**Data captured**

- discharge diagnosis
- hospital course
- procedures
- medications
- warning signs
- follow-up date
- billing clearance
- insurance clearance
- discharge time

**Data feeds forward to**

- patient app
- follow-up scheduler
- CRM
- readmission risk model
- quality/outcomes
- insurance claim

**Data utilization**

| User/system | Use |
|---|---|
| Doctor | Fast review-and-sign discharge |
| Nurse | Patient education checklist |
| Pharmacy | Take-home medicine readiness |
| Billing/TPA | Final bill and claim file |
| Patient | Clear recovery instructions |

---

### 5.13 Follow-Up and Remote Recovery

**Navigation**

Patient continues care through OPD, teleconsult, remote monitoring, dressing, rehab, or return-to-work pathway.

**Micro-process**

1. Follow-up plan is generated at discharge.
2. Patient receives reminders and recovery tasks.
3. App collects pain, fever, wound photo, mobility, medication compliance, and symptoms.
4. AI flags complications or readmission risk.
5. Nurse navigator reviews alerts.
6. Doctor receives escalations only when required.
7. Outcomes and satisfaction are captured.

**Data captured**

- follow-up attendance
- wound photo
- pain/fever/mobility score
- medication adherence
- complications
- readmission
- patient satisfaction

**Data feeds forward to**

- OPD follow-up
- quality dashboard
- readmission analytics
- surgeon outcome tracking
- corporate return-to-work reporting

---

## 6. Role-Based Workspaces

### 6.1 Patient Navigation View

Patient should see:

```text
Current step
Next step
Estimated wait time
Responsible department
Documents pending
Payment/pre-auth status
Room/bed status
Surgery status for family
Discharge readiness
Follow-up tasks
Help/contact button
```

### 6.2 Doctor Workspace

Doctor should see:

```text
Patient timeline
AI clinical summary
Allergies and medication safety alerts
Vitals and lab trends
Imaging links
Diagnosis and active problems
Suggested order sets
Pending results
Admission/OT/discharge actions
AI draft notes
```

### 6.3 Nursing Workspace

Nurse should see:

```text
Assigned patients
Priority tasks
Medication due
Vitals due
Pain score due
Pre-op checklist
Post-op monitoring
Fall/infection/pressure risk
Escalation alerts
Discharge education pending
```

### 6.4 Front Office Workspace

Front office should see:

```text
Expected arrivals
Incomplete registration
Queue status
Insurance eligibility
Patient location
Admission readiness
Payment status
Discharge clearance
Patient assistance requests
```

### 6.5 Bed Manager Workspace

Bed manager should see:

```text
Live occupancy
Available beds
Blocked/housekeeping beds
Expected discharges
Pending admissions
ICU demand
Isolation needs
Transfer requests
LOS prediction
```

### 6.6 OT Command Center

OT team should see:

```text
Today's cases
Emergency cases
Case readiness score
Consent status
Anesthesia clearance
Blood availability
Implant availability
Patient transport status
OT delay reasons
Turnaround time
```

### 6.7 Billing and Insurance Workspace

Billing/TPA users should see:

```text
Payer eligibility
Package mapping
Estimate
Pre-auth documents
Approval status
Non-payables
Implant/consumable charges
Final bill
Claim file readiness
```

### 6.8 Leadership Command Center

Leadership should see:

```text
OP wait time
ER door-to-doctor time
Admission conversion rate
Bed occupancy
OT utilization
OT delay reasons
Average length of stay
Discharge TAT
Readmission rate
Infection rate
Patient satisfaction
Doctor/nurse adoption score
Revenue leakage indicators
```

---

## 7. System Modules Required

| Module | Required capability | Priority |
|---|---|---|
| Digital front door | App/web/WhatsApp/kiosk intake, appointment, status | P1 |
| Registration/UHID | Duplicate detection, OCR, identity validation | P1 |
| OPD EMR | Unified clinical workspace, AI notes, orders | P1 |
| ER | Rapid registration, triage, STAT orders, MLC | P1 |
| ADT/IPD | Admit, transfer, discharge, OP-to-IP, ER-to-IP | P1 |
| Bed management | Live bed map, allocation, housekeeping, occupancy | P1 |
| Nursing | Assessment, task board, vitals, risk scores | P1 |
| eMAR | Barcode administration, medication safety | P1 |
| Lab/LIS | Order, sample, result, critical alert | P1 |
| Radiology/PACS | Imaging orders, reports, DICOM links | P1 |
| OT | Booking, checklist, timings, operative note, consumables | P1 |
| Anesthesia | Pre-anesthesia and intra-op record | P1 |
| Consent | Digital/e-sign/multimedia consent | P2 |
| Pharmacy | Dispensing, ward stock, discharge meds | P1 |
| Billing | Estimate, package, charges, final bill | P1 |
| Insurance/TPA | Eligibility, pre-auth, claim file | P1 |
| Corporate | Referral, eligibility, tariffs, sponsor billing, RTW | P2 |
| Discharge | AI summary, checklist, packet delivery | P1 |
| Follow-up/CRM | Reminders, teleconsult, wound/photo monitoring | P2 |
| Analytics | Operational, clinical, financial, quality dashboards | P2 |
| AI orchestration | Summaries, alerts, pathway suggestions, discharge drafts | P2 |

---

## 8. Implementation Blueprint

### Phase 1: Patient Identity, Navigation, and ADT Backbone

**Goal:** Make every patient journey traceable with one UHID, one encounter, and one admission/discharge timeline.

**Build**

- patient navigation timeline
- encounter model normalization
- ADT engine
- bed management engine
- OP-to-IP conversion
- ER-to-IP conversion
- patient status communication layer

**Key APIs**

```text
POST /api/v1/navigation/start
GET  /api/v1/navigation/patient/:patientId/timeline
POST /api/v1/adt/admit
POST /api/v1/adt/transfer
POST /api/v1/adt/discharge
POST /api/v1/adt/convert-op-to-ip
POST /api/v1/adt/er-to-ip
GET  /api/v1/beds/map
POST /api/v1/beds/allocate
```

**Primary tables**

```text
patient_navigation_events
encounters
ip_admissions
adt_events
wards
beds
bed_status_events
```

---

### Phase 2: Clinical Workflow and Care Team Adoption

**Goal:** Give doctors and nurses high-value workspaces that reduce typing and prevent missed tasks.

**Build**

- doctor unified patient workspace
- AI intake summary inside consultation
- nurse task board
- vitals charting
- eMAR
- risk scoring
- critical alerts

**Key APIs**

```text
GET  /api/v1/clinical-workspace/patient/:patientId
POST /api/v1/nursing/assessment
POST /api/v1/nursing/vitals
GET  /api/v1/nursing/tasks
POST /api/v1/emar/administer
GET  /api/v1/alerts/clinical
```

**Primary tables**

```text
clinical_intakes
clinical_notes
nursing_assessments
vital_records
medication_orders
medication_administrations
clinical_alerts
```

---

### Phase 3: OT, Anesthesia, and Surgical Orchestration

**Goal:** Make surgical care paperless, safe, traceable, and predictable.

**Build**

- OT booking
- pre-op readiness dashboard
- surgical safety checklist
- anesthesia assessment and record
- voice operative note
- implant/consumable scan
- family status updates

**Key APIs**

```text
POST /api/v1/ot/book
GET  /api/v1/ot/cases/today
GET  /api/v1/ot/case/:id/readiness
POST /api/v1/ot/checklist
POST /api/v1/anesthesia/assessment
POST /api/v1/anesthesia/record
POST /api/v1/ot/operative-note
POST /api/v1/ot/consumables/scan
```

**Primary tables**

```text
ot_rooms
ot_bookings
ot_checklists
anesthesia_assessments
anesthesia_records
operative_notes
procedure_consumables
implant_records
family_notifications
```

---

### Phase 4: Revenue Cycle, Insurance, and Corporate Flow

**Goal:** Make billing and payer activity run in parallel with clinical care, not after clinical clearance.

**Build**

- estimate generation linked to diagnosis/procedure
- package mapping
- pre-auth document bundle
- non-payable tracking
- corporate referral intake
- employer eligibility
- fitness and return-to-work documents

**Key APIs**

```text
POST /api/v1/billing/estimate
POST /api/v1/insurance/preauth
GET  /api/v1/insurance/case/:id/status
POST /api/v1/corporate/referral
GET  /api/v1/corporate/eligibility
POST /api/v1/occupational-health/fitness-certificate
```

**Primary tables**

```text
billing_estimates
insurance_authorizations
claim_documents
corporate_referrals
corporate_eligibility_checks
non_payable_items
fitness_certificates
return_to_work_clearances
```

---

### Phase 5: Smart Discharge and Follow-Up

**Goal:** Reduce discharge delay and maintain care continuity after the patient leaves the hospital.

**Build**

- discharge readiness board
- AI discharge summary draft
- medication reconciliation
- discharge packet delivery
- digital payment link
- follow-up scheduling
- remote post-op monitoring
- readmission risk alerts

**Key APIs**

```text
GET  /api/v1/discharge/readiness/:admissionId
POST /api/v1/discharge/draft
POST /api/v1/discharge/sign
POST /api/v1/discharge/packet/send
POST /api/v1/follow-up/schedule
POST /api/v1/recovery/check-in
GET  /api/v1/recovery/alerts
```

**Primary tables**

```text
discharge_readiness_items
discharge_summaries
discharge_packets
follow_up_plans
recovery_checkins
remote_monitoring_alerts
patient_feedback
outcome_records
```

---

## 9. Journey-Specific Implementation

### 9.1 Planned Surgery

```text
Digital booking
  -> OPD consultation
  -> diagnostics
  -> start surgical pathway
  -> estimate/pre-auth
  -> e-consent
  -> pre-admission
  -> bed allocation
  -> OT
  -> recovery
  -> discharge
  -> post-op monitoring
```

**Critical success requirements**

- pre-op checklist must be visible to patient, nurse, anesthetist, surgeon, billing, and OT
- OT booking cannot be marked ready until mandatory safety items are complete or overridden with reason
- discharge follow-up must be created before discharge event closes

### 9.2 Emergency Surgery

```text
ER rapid registration
  -> triage
  -> STAT diagnostics
  -> emergency OT activation
  -> ER-to-IP conversion
  -> ICU/ward
  -> retrospective payer regularization
  -> discharge
  -> rehab/follow-up
```

**Critical success requirements**

- temporary patient ID must merge cleanly into UHID later
- emergency consent and MLC must have immutable audit trail
- ER, OT, ICU, blood bank, and family communication must be triggered from one activation action

### 9.3 OPD to IPD Conversion

```text
OPD registration
  -> doctor consult
  -> diagnostics
  -> admit decision
  -> convert OP to IP
  -> bed allocation
  -> care pathway
  -> discharge
```

**Critical success requirements**

- no duplicate registration
- OPD notes, orders, results, and diagnosis must flow into admission
- patient app must immediately show admission steps and bed/payment status

### 9.4 Corporate / Factory Referral

```text
FMO referral
  -> corporate eligibility
  -> OPD consult
  -> estimate by corporate tariff
  -> pre-auth/employer approval
  -> admission/surgery
  -> sponsor billing
  -> fitness certificate
  -> return-to-work clearance
```

**Critical success requirements**

- corporate referral letter and employee ID must be captured at entry
- sponsor and patient payable portions must be clearly separated
- fitness and return-to-work documents must be generated from clinical discharge/follow-up data

---

## 10. Data Utilization Matrix

| Data source | Used for care | Used for operations | Used for billing | Used for patient delight | Used for analytics |
|---|---|---|---|---|---|
| Registration | Identity, allergy matching | Queue planning | Payer mapping | No repeated forms | Demographics |
| AI intake | Clinical summary | Specialty routing | Procedure evidence | Faster consult | Disease patterns |
| OPD note | Diagnosis, treatment | Admission trigger | Estimate/pre-auth | Clear plan | Doctor productivity |
| Lab/radiology | Diagnosis, risk | Critical alerts | Claim support | Report access | Turnaround time |
| ADT events | Current status | Bed occupancy | Room billing | Location/status | LOS, census |
| OT data | Operative care | OT utilization | Charge capture | Family updates | Outcomes, delays |
| eMAR | Medication safety | Nurse workload | Drug charges | Safer care | Compliance |
| Nursing chart | Recovery tracking | Task management | Consumables | Better response | Quality indicators |
| Discharge data | Continuity | Discharge TAT | Final bill | Clear instructions | Readmission risk |
| Follow-up data | Complication detection | CRM | Repeat visits | Connected care | Outcomes |

---

## 11. AI Utilization Through the Journey

| Journey stage | AI role | Human control |
|---|---|---|
| Digital entry | Specialty routing, symptom intake | Patient/front office confirms |
| Registration | OCR, duplicate detection | MRD/front office verifies |
| Clinical intake | Summary and red flags | Doctor validates |
| Consultation | Ambient note, suggested orders | Doctor approves |
| Diagnostics | Critical value/trend detection | Clinician responds |
| Admission | LOS and bed recommendation | Bed manager approves |
| Pre-op | Missing readiness item detection | Surgeon/anesthetist overrides if needed |
| OT | Delay prediction, voice note draft | OT team/surgeon confirms |
| Ward/ICU | Deterioration risk, sepsis/fall alerts | Nurse/doctor acts |
| Discharge | Summary draft, med reconciliation, coding suggestions | Doctor/pharmacist/billing approve |
| Follow-up | Complication/readmission risk | Nurse/doctor escalates |

AI must never block emergency care. It should support workflow, not replace clinical judgment.

---

## 12. Key KPIs

### Patient Experience

| KPI | Target |
|---|---:|
| Digital registration completion | under 2 minutes |
| Patient status update latency | under 60 seconds |
| OPD waiting transparency | 100% visible |
| Family OT status coverage | over 90% surgical cases |
| Discharge instruction delivery | 100% digital |
| Post-discharge follow-up adherence | over 80% |

### Clinical Adoption

| KPI | Target |
|---|---:|
| Doctor note AI draft usage | over 70% eligible visits |
| Doctor discharge summary review time | under 10 minutes |
| Nurse mobile task completion | over 85% |
| eMAR barcode compliance | over 95% |
| Duplicate clinical entry reduction | over 60% |

### Operations

| KPI | Target |
|---|---:|
| ER door-to-triage time | under 5 minutes |
| OP-to-IP conversion completion | under 10 minutes |
| Bed allocation after admission request | under 15 minutes |
| OT readiness check completion | before patient transport |
| OT delay due to missing documentation | under 5% |
| Discharge after clinical clearance | under 30 minutes |

### Quality and Revenue

| KPI | Target |
|---|---:|
| Critical alert acknowledgement | under 10 minutes |
| Medication administration documentation | over 95% |
| Pre-auth document completeness | over 95% |
| Claim rejection due to documentation | below 3% |
| Readmission risk follow-up coverage | over 90% high-risk cases |

---

## 13. Current State and Gap Summary

| Module | Current state | Gap to target |
|---|---|---|
| Patient registration/UHID | Functional | Needs OCR, duplicate intelligence, journey linkage |
| Appointment | Functional | Needs AI routing and patient navigation status |
| OPD EMR | Functional/partial templates | Needs unified workspace and embedded AI intake/scribe |
| ER | Backend strong, UI thin | Needs rapid temp ID, queue, STAT, MLC, ER-to-IP |
| IPD/ADT | Missing | Build core ADT and admission workflows |
| Bed management | Missing | Build live bed map, allocation, housekeeping |
| Ward nursing | Partial/display only | Build task board, vitals, risk, handoff |
| eMAR | Missing | Build medication administration recording |
| Lab/LIS | Partial | Add priority, sample flow, critical alert integration |
| Radiology/PACS | Functional | Integrate with pathway and AI alerts |
| OT | UI only/backend missing | Build booking, checklist, timings, operative notes |
| ICU | Partial display | Build vital persistence and alerting |
| Billing/TPA | Functional | Tie to admission, OT, package, discharge readiness |
| Corporate | Partial | Add FMO referral, eligibility, RTW documents |
| Consent | Basic | Add e-sign, multimedia, emergency consent |
| Discharge summary | Functional AI | Tie to ADT and discharge readiness |
| Follow-up/CRM | Functional | Link to surgical episode and risk alerts |

---

## 14. Recommended Sprint 1

**Goal:** Create the backbone that makes the whole patient navigation system possible.

### Deliverables

1. `patient_navigation_events` model and timeline API
2. ADT service: admit, transfer, discharge
3. OPD-to-IPD conversion API
4. ER-to-IPD conversion API
5. ward and bed models
6. bed map and allocation API
7. basic inpatient dashboard
8. patient app status updates for admission and bed allocation

### Suggested files

```text
server/services/patient-navigation.service.js
server/routes/patient-navigation.route.js
server/services/adt.service.js
server/routes/adt.route.js
server/services/bed-allocation.service.js
server/routes/beds.route.js
server/migrations/001_create_patient_navigation_events.js
server/migrations/002_create_wards.js
server/migrations/003_update_beds.js
server/migrations/004_create_ip_admissions.js
server/migrations/005_create_adt_events.js
```

### Minimum API set

```text
POST /api/v1/navigation/event
GET  /api/v1/navigation/patient/:patientId/timeline
POST /api/v1/adt/admit
POST /api/v1/adt/transfer
POST /api/v1/adt/discharge
POST /api/v1/adt/convert-op-to-ip
POST /api/v1/adt/er-to-ip
GET  /api/v1/beds/map
POST /api/v1/beds/allocate
```

### Sprint 1 success criteria

| Criteria | Acceptance |
|---|---|
| Patient timeline | Shows registration, OPD/ER, admission, transfer, discharge events |
| OPD-to-IPD | Converts without duplicate patient registration |
| ER-to-IPD | Converts emergency episode into admission |
| Bed map | Shows available, occupied, blocked, housekeeping beds |
| ADT audit | Every admit/transfer/discharge has timestamp and user |
| Patient status | Patient app can show admitted/bed allocated/discharged status |

---

## 15. Database Migration Strategy

Recommended order:

```text
001_create_patient_navigation_events.js
002_create_encounters.js
003_create_wards.js
004_update_beds_for_ward_status.js
005_create_ip_admissions.js
006_create_adt_events.js
007_create_nursing_assessments.js
008_create_vital_records.js
009_create_medication_orders.js
010_create_medication_administrations.js
011_create_ot_rooms.js
012_create_ot_bookings.js
013_create_ot_checklists.js
014_create_anesthesia_records.js
015_create_discharge_readiness_items.js
016_create_follow_up_plans.js
017_create_recovery_checkins.js
018_create_corporate_referrals.js
019_create_fitness_certificates.js
020_create_patient_feedback_outcomes.js
```

---

## 16. Screen Implementation Order

| Order | Screen | Users | Reason |
|---:|---|---|---|
| 1 | Patient timeline | All | Makes journey visible |
| 2 | ADT admission form | Front office, ER, OPD | Enables IPD |
| 3 | Bed map | Bed manager, front office | Enables admission operations |
| 4 | Ward dashboard | Nurses, doctors | Enables inpatient care |
| 5 | Doctor inpatient workspace | Doctors | Enables rounds and discharge |
| 6 | Nursing task board | Nurses | Adoption-critical |
| 7 | eMAR | Nurses, pharmacy | Safety-critical |
| 8 | OT command center | OT team | Surgical readiness |
| 9 | Discharge readiness board | Doctor, nurse, billing | Reduces discharge delay |
| 10 | Patient app journey tracker | Patient/family | Patient delight |

---

## 17. Governance and Safety

### Mandatory controls

- RBAC for all clinical and billing data
- audit trail for ADT, eMAR, consent, OT, discharge
- break-glass access for emergencies
- immutable medication administration log
- identity merge workflow for emergency temporary IDs
- AI output labelled as draft/suggestion
- clinician final approval for notes, orders, discharge, and procedure decisions
- consent versioning and e-sign evidence
- data retention policy by document type

### Clinical governance

| Area | Required review |
|---|---|
| AI summaries | Periodic clinical accuracy audit |
| Early warning alerts | False positive/false negative review |
| Order sets | Specialty committee approval |
| Consent content | Legal and clinical approval |
| Discharge templates | Department approval |
| Corporate reports | Privacy and authorization review |

---

## 18. Final Target Operating Model

The target system should work like this:

```text
Patient enters once
  -> system identifies the patient
  -> captures symptoms and context
  -> routes to the correct care team
  -> creates a live patient timeline
  -> feeds data to clinical, operational, billing, and patient-facing workflows
  -> tracks every transition
  -> warns teams before risk becomes harm
  -> prepares discharge before the last hour
  -> continues care after the patient leaves
```

The product standard:

```text
No duplicate data entry.
No paper dependency.
No hidden patient status.
No unsupported clinical handoff.
No discharge surprise.
No lost follow-up.
```

This is the foundation for a world-class, AI-enabled, patient-delight-driven HMIS.

---

## 19. Go-Live Gates and Release Control

Implementation must be controlled through hard pass/fail gates.

### 19.1 Gate Structure

| Gate | Scope | Decision owner | Outcome |
|---|---|---|---|
| Gate A | Clinical safety baseline | CMO + Nursing head | pass/fail |
| Gate B | Inpatient and OT process integrity | COO + OT head | pass/fail |
| Gate C | Revenue and payer closure | CFO + TPA lead | pass/fail |
| Gate D | Operability, observability, and audit | CTO + Quality head | pass/fail |

### 19.2 Minimum Enterprise Go-Live Criteria

| Condition | Requirement |
|---|---|
| Gate A | 100% mandatory items pass |
| Gate B | At least 80% mandatory items pass; no critical safety blocker |
| Gate C | At least 80% mandatory items pass; no claim integrity blocker |
| Gate D | At least 80% mandatory items pass; no audit/availability blocker |
| Rollback readiness | Proven in rehearsal and signed off |

### 19.3 Mandatory Gate Checklist

| Area | Mandatory control | Pass evidence |
|---|---|---|
| eMAR | Medication administration only against active physician order | UAT and production simulation logs |
| eMAR | 5-right checks (right patient, drug, dose, route, time) | validation report |
| eMAR | high-alert medication dual signoff | audit sample review |
| OT | no transport to OT without identity, consent, site, blood/implant readiness or emergency override | OT checklist audit |
| ADT | every admit/transfer/discharge is timestamped and user-tagged | ADT audit table sample |
| Discharge | discharge cannot close if mandatory checklist pending | discharge readiness report |
| Insurance | pre-auth and claim packet completeness check | rejection-risk dry run |
| Operations | degraded mode banners visible when dependencies fail | failover drill screenshots |

---

## 20. API Transition and Compatibility Strategy

The platform must avoid dual-stack API confusion during migration to `/api/v1`.

### 20.1 Transition Policy

| Principle | Rule |
|---|---|
| Contract-first | New capabilities are published under `/api/v1` OpenAPI spec first |
| Backward compatibility | Existing endpoints remain available until migration exit criteria are met |
| Controlled deprecation | Each old endpoint has deprecation version, owner, and sunset date |
| Traffic observability | Per-endpoint adoption metrics tracked during migration |
| Idempotency | ADT, eMAR, OT, billing, and discharge write APIs require idempotency keys |

### 20.2 Adapter Pattern

| Layer | Responsibility |
|---|---|
| API gateway adapter | maps old request/response to `/api/v1` contract |
| domain service | core business logic, no legacy branching |
| compatibility transform | field mapping and defaulting for old clients |
| telemetry hooks | version usage, error rate, latency, semantic mismatches |

### 20.3 API Migration Checklist

| Item | Acceptance |
|---|---|
| OpenAPI spec published | 100% for all P1 modules |
| consumer inventory | all client apps and integrations listed |
| compatibility tests | old and new endpoints return equivalent outcomes |
| deprecation notices | communicated to all internal and external consumers |
| sunset readiness | zero critical consumers on deprecated endpoints |

---

## 21. Clinical Safety Hard Stops and Override Governance

Critical workflows require enforced hard stops with emergency override.

### 21.1 eMAR Hard Stops

| Control | Behavior |
|---|---|
| no active order | administration blocked |
| allergy contraindication | administration blocked unless emergency override |
| dose out of safe range | administration blocked unless doctor co-sign |
| wrong time window | requires reason code and approval policy |
| patient identity mismatch | administration blocked |
| barcode mismatch | administration blocked with incident log |

### 21.2 OT Hard Stops

| Control | Behavior |
|---|---|
| consent missing | OT start blocked unless emergency override |
| site/procedure mismatch | OT start blocked |
| implant/blood mismatch | OT start blocked |
| missing anesthesia clearance for elective case | OT start blocked |
| incomplete surgical safety checklist | OT incision blocked |

### 21.3 Override Governance

| Requirement | Policy |
|---|---|
| override reason | mandatory structured reason code |
| override authority | role-based, restricted to designated users |
| override audit | immutable log with timestamp, user, context |
| post-event review | mandatory quality review in 24 hours |
| escalation | automatic notification to duty consultant and quality lead |

---

## 22. Testing, Cutover, Rollback, and Hypercare Entry

### 22.1 Test Matrix

| Test type | Scope | Exit criteria |
|---|---|---|
| unit tests | services, validators, safety checks | coverage thresholds met |
| integration tests | API + DB + event flows | all critical journeys pass |
| workflow UAT | OPD, ER, IPD, OT, ICU, discharge, insurance | signed by clinical and ops owners |
| performance tests | peak OPD, ER surge, discharge rush | SLA targets met |
| failover tests | dependency outages and degraded mode | no silent failure paths |
| security and audit tests | RBAC, break-glass, immutable logs | no critical findings |

### 22.2 Cutover Plan

| Step | Requirement |
|---|---|
| data freeze window | defined and approved |
| migration execution | timed checklist with command log |
| reconciliation | patient counts, admissions, active meds, open orders, open claims |
| smoke tests | department-wise functional checks within go-live window |
| go/no-go checkpoint | command center approval by named owners |

### 22.3 Rollback Criteria

Rollback must trigger automatically when one or more of the following is true:

1. Critical patient safety control fails in production.
2. ADT consistency check fails for active admissions.
3. eMAR or OT hard-stop logic is bypassed unexpectedly.
4. Payer/billing integrity risk exceeds defined threshold.
5. Core system availability or response time breaches sustained SLA.

### 22.4 Hypercare Entry and Exit

| Phase | Duration | Control |
|---|---|---|
| hypercare week 1 | 24x7 | war room, rapid fix protocol, twice-daily review |
| hypercare week 2-4 | business hours + on-call | daily KPI review and incident trend closure |
| hypercare exit | after stability criteria | approval by CMO, COO, CTO |

---

## 23. Change Management, Training, and Adoption Operations

Adoption must be engineered as rigorously as software delivery.

### 23.1 Training Model

| Group | Mode | Completion target |
|---|---|---:|
| doctors | specialty workflows + AI validation | over 95% |
| nurses | task board + eMAR + escalation flow | over 98% |
| OT and anesthesia | checklist + intra-op record + override policy | over 98% |
| front office | registration + ADT + payer checks | over 95% |
| billing/TPA | pre-auth + non-payable + claim closure | over 95% |

### 23.2 Super-User and Floor Support

| Control | Requirement |
|---|---|
| super-users | one per shift per critical unit |
| floor walkers | at-the-elbow support during first 2 weeks |
| escalation SLA | user-blocking issue acknowledged in under 10 minutes |
| rapid playbooks | top 20 operational issues with step-by-step fixes |

### 23.3 Adoption KPIs and Cadence

| KPI | Target | Owner | Review cadence |
|---|---:|---|---|
| doctor AI draft acceptance | over 70% eligible notes | clinical informatics lead | weekly |
| nursing digital task completion | over 90% | nursing operations lead | daily |
| eMAR compliance | over 95% | nursing quality lead | daily |
| OT checklist completion before incision | 100% | OT quality lead | per case + daily summary |
| discharge digital completion | over 95% | discharge command lead | daily |
| ticket resolution for blocking issues | under 30 minutes median | support lead | daily |

### 23.4 Change Control

| Area | Policy |
|---|---|
| scope change | formal CR with clinical and technical impact |
| template/order set changes | specialty committee approval |
| AI prompt/model changes | controlled release with validation sample |
| go-live window changes | executive signoff required |

---

## 24. RACI Governance Matrix (Execution Ownership)

This section defines operational ownership for delivery, go-live, and stabilization.

### 24.1 RACI Legend

| Code | Meaning |
|---|---|
| R | Responsible: executes the work |
| A | Accountable: final decision owner |
| C | Consulted: gives required input |
| I | Informed: notified of progress/outcome |

### 24.2 Program-Level RACI

| Workstream | CMO | COO | CTO | CFO | Nursing Head | OT Head | TPA Lead | Quality Head | PMO Lead |
|---|---|---|---|---|---|---|---|---|---|
| Clinical safety policy (eMAR, OT hard stops) | A | C | C | I | R | R | I | C | I |
| ADT and bed management rollout | C | A | R | I | C | I | I | C | R |
| OT orchestration rollout | C | A | C | I | C | R | I | C | R |
| Billing and insurance integration | I | C | C | A | I | I | R | C | R |
| API migration to `/api/v1` | I | I | A | I | I | I | I | C | R |
| Data migration and reconciliation | C | C | A | C | C | C | C | R | R |
| UAT and go-live signoff | C | A | C | C | R | R | R | C | R |
| Hypercare operations | C | A | C | I | R | R | C | C | R |

### 24.3 Gate-Level Decision RACI

| Gate | Clinical Lead | Operations Lead | Technology Lead | Finance/Payer Lead | Quality Lead | PMO |
|---|---|---|---|---|---|---|
| Gate A: Clinical safety baseline | A (CMO) | C | C | I | R | I |
| Gate B: Inpatient and OT integrity | C | A (COO) | C | I | R | R |
| Gate C: Revenue and payer closure | I | C | C | A (CFO) | C | R |
| Gate D: Operability and audit | I | C | A (CTO) | I | R | R |

### 24.4 Phase-Wise Delivery RACI

| Phase | Primary accountable | Primary responsible | Consulted |
|---|---|---|---|
| Phase 1: Identity, navigation, ADT backbone | COO | CTO + PMO Lead | CMO, Nursing Head, Quality Head |
| Phase 2: Clinical workflow and care-team adoption | CMO | Nursing Head + Clinical Informatics Lead + CTO | COO, Quality Head |
| Phase 3: OT and anesthesia orchestration | COO | OT Head + Anesthesia Lead + CTO | CMO, Quality Head, Nursing Head |
| Phase 4: Revenue, insurance, corporate flow | CFO | TPA Lead + Billing Lead + CTO | COO, CMO, Quality Head |
| Phase 5: Discharge and follow-up continuity | COO | Discharge Command Lead + CTO + Nursing Operations Lead | CMO, CFO, Quality Head |

### 24.5 Run Governance Cadence

| Cadence | Meeting | Owner | Required attendees | Outputs |
|---|---|---|---|---|
| Daily | Command stand-up (30 min) | PMO Lead | Ops, nursing, OT, billing, tech | blockers, SLA breaches, day plan |
| Daily | Hypercare incident review | COO | PMO, CTO, Nursing Head, Quality | incident disposition, workaround, owner |
| Weekly | Clinical safety review | CMO | Nursing, OT, quality, informatics | safety KPIs, override audits, CAPA |
| Weekly | Revenue and payer review | CFO | Billing, TPA, operations, tech | rejection trends, closure actions |
| Weekly | Release and change board | CTO | PMO, product, QA, clinical reps | release decision, rollback readiness |
| Monthly | Executive steering committee | COO | CMO, CTO, CFO, PMO, Quality | phase status, risk decisions, scope approvals |

### 24.6 Escalation Matrix

| Severity | Examples | Initial response owner | Escalation to | Response SLA |
|---|---|---|---|---|
| Sev 1 | patient safety blocker, ADT failure, eMAR hard-stop bypass | on-duty operations lead | COO + CMO + CTO | immediate, under 10 minutes |
| Sev 2 | major workflow outage, OT delay cluster, discharge halt | domain lead | PMO + functional accountable | under 30 minutes |
| Sev 3 | non-blocking defects, report mismatch | module owner | PMO | same business day |

---

## 25. Re-Audit Delta and Strict Go/No-Go Blocker Checklist

This section captures the latest implementation re-audit and defines strict blocker closure conditions for engineering and clinical operations.

### 25.1 Re-Audit Delta (Code-Backed Status Update)

| Capability | Previous status | Re-audit status | Evidence expectation |
|---|---|---|---|
| ADT (A01/A02/A03) | missing/partial | implemented | admit, transfer, discharge with event logs |
| OP-to-IP and ER-to-IP conversion | missing/partial | implemented | conversion API and admission creation |
| Bed map/census services | missing | implemented | map, census, availability APIs |
| eMAR workflow | missing | partial-implemented | orders/administer/due/hold with safety hard-stops pending |
| OT orchestration backend | UI-heavy/partial | partial-implemented | booking, status updates, checklist persistence |
| Discharge planning | partial | partial-implemented | discharge plan APIs exist; hard discharge gating pending |
| Enterprise clinical safety enforcement | missing | partial | mandatory policy enforcement and override governance pending |

### 25.2 Strict Go/No-Go Blockers (Engineering + Clinical Ops)

The release is **No-Go** until all Sev 1 blockers are closed and signed off.

| Blocker ID | Severity | Domain | Blocker statement | Accountable owner | Responsible owner | Mandatory closure evidence |
|---|---|---|---|---|---|---|
| B1 | Sev 1 | Bed flow | Bed allocation is advisory-only and not atomically reserved/locked | COO | Backend lead | transaction-safe reserve API + race-condition test + production dry-run log |
| B2 | Sev 1 | OT safety | OT status progression does not enforce checklist hard-stops before incision | CMO | OT engineering lead + OT head | enforced pre-incision validator + blocked workflow test + override audit sample |
| B3 | Sev 1 | Medication safety | eMAR lacks mandatory 5-right checks, allergy hard-stop, and high-alert dual signoff enforcement | CMO | Clinical engineering lead + nursing informatics lead | enforcement tests + exception logs + 50-case pilot audit |
| B4 | Sev 1 | Discharge safety | ADT discharge can complete without mandatory readiness criteria | COO | ADT/discharge engineering lead | discharge gate validator + blocked discharge test + readiness compliance report |
| B5 | Sev 2 | Test governance | No dedicated ADT/beds/eMAR/OT automated test suites at required depth | CTO | QA automation lead | CI pipeline report with required test matrix pass |
| B6 | Sev 2 | Navigation continuity | patient navigation event timeline APIs are not implemented end-to-end | COO | Integration lead | timeline event model + API contract + UAT evidence |
| B7 | Sev 2 | Consent enforcement | consent controls are present but not consistently linked to pathway-critical actions | CMO | Consent platform lead | endpoint-level consent policy map + enforcement integration tests |
| B8 | Sev 2 | Release assurance | migration runner and migration file naming mismatch risk | CTO | DevOps lead | migration script correction + rehearsal output + rollback rehearsal |

### 25.3 Gate Pass Rules for This Re-Audit Cycle

| Gate | Pass rule for this cycle |
|---|---|
| Gate A: clinical safety | B2 and B3 must be fully closed with evidence |
| Gate B: inpatient and OT integrity | B1 and B4 must be fully closed with evidence |
| Gate C: revenue and payer integrity | no new Sev 1 finance/payer blocker introduced during closure |
| Gate D: operability and audit | B5 and B8 must be closed before production cutover |

### 25.4 Blocker Closure Sprint Plan

| Sprint window | Target closures | Exit criteria |
|---|---|---|
| Sprint A (Week 1) | B1, B2 | bed locking and OT hard-stop enforcement validated in UAT |
| Sprint B (Week 2) | B3, B4 | eMAR and discharge gates validated on pilot workflows |
| Sprint C (Week 3) | B5, B6, B7, B8 | full test governance, navigation continuity, consent linkage, migration rehearsal signed off |

### 25.5 Mandatory Signoff Artifacts

| Artifact | Owner |
|---|---|
| Clinical safety signoff (eMAR + OT + discharge) | CMO + Nursing Head + OT Head |
| Inpatient flow signoff (ADT + bed operations) | COO |
| Technical release readiness (tests + migrations + rollback) | CTO |
| Revenue/payer continuity signoff | CFO + TPA Lead |
| PMO go/no-go summary note | PMO Lead |

### 25.6 Current Decision Snapshot

As of this re-audit snapshot:

1. Current readiness is **Controlled-Go Candidate** for selected workflows.
2. Enterprise-wide go-live remains **No-Go** until Sev 1 blockers B1-B4 are closed.
3. Hypercare can only start after Gate A and Gate B pass with documented evidence.

---

## 26. Execution Backlog for Sev 1 Blockers (B1-B4)

This backlog translates B1-B4 into implementation-ready work items for engineering and clinical operations.

### 26.1 B1: Bed Reservation Locking (Atomic Allocation)

| Item | Task | Owner |
|---|---|---|
| API | Add `POST /api/v1/beds/reserve` with transaction-safe row lock and reservation TTL | Backend lead |
| API | Update `POST /api/v1/adt/admit` to require reserved bed token or explicit override | Backend lead |
| DB | Add `bed_reservations` table: bed_id, admission_context, reserved_by, reserved_until, status | DB lead |
| DB | Add unique partial index to prevent active double reservation per bed | DB lead |
| Service | Refactor allocation flow: recommend -> reserve -> admit/occupy -> auto-release | Backend lead |
| Ops | Define reservation timeout policy (for example 10 minutes) and release behavior | COO office |
| QA | Concurrency tests with simultaneous reserve attempts | QA lead |
| UAT | Bed manager scenario validation across emergency and routine admissions | Bed manager lead |

Acceptance criteria:

1. No double occupancy from concurrent requests.
2. Reservation expires automatically if admission is not completed in time.
3. Audit logs show reserve, release, and consume events.

### 26.2 B2: OT Hard-Stop Enforcement Before Incision

| Item | Task | Owner |
|---|---|---|
| API | Add pre-status validation in `PUT /api/v1/ot/:id/status` for transitions to `incision` and `completed` | OT engineering lead |
| Service | Enforce required checklist completion for `sign_in` and `time_out` before `incision` | OT engineering lead |
| Service | Enforce `sign_out` completion before `completed` state | OT engineering lead |
| Override | Add emergency override payload: reason_code, approver_id, timestamp, case_context | OT engineering lead |
| Audit | Persist override events in immutable audit table with reviewer identity | Quality tech lead |
| Policy | Define allowed override roles and reason codes | CMO + OT head |
| QA | Transition-negative tests for blocked progression | QA lead |
| UAT | Live OT simulation with blocked and override paths | OT head |

Acceptance criteria:

1. Status cannot move to `incision` without mandatory checks.
2. Emergency override is possible only for approved roles and fully audited.
3. Daily OT hard-stop compliance report is available.

### 26.3 B3: eMAR Safety Enforcement (5 Rights + Allergy + High-Alert)

| Item | Task | Owner |
|---|---|---|
| API | Add `POST /api/v1/emar/validate-administration` precheck endpoint | Clinical engineering lead |
| Service | Enforce 5-right checks at `POST /api/v1/emar/administer` | Clinical engineering lead |
| Service | Add allergy/contraindication hard-stop using patient allergy source | Clinical engineering lead |
| Service | Add high-alert drug policy requiring dual signoff (`nurse_1`, `nurse_2` or doctor cosign) | Nursing informatics lead |
| DB | Add fields to administrations: validation_result, blocked_reason, cosign_by, cosign_at | DB lead |
| Policy | Publish high-alert medication master list and override rules | CMO + Nursing head |
| QA | Positive/negative test pack for dose/route/time mismatch and allergy conflict | QA lead |
| UAT | 50-case pilot audit in one ward and one ICU | Nursing quality lead |

Acceptance criteria:

1. Unsafe administration attempts are blocked and logged.
2. High-alert administrations require valid second authorization.
3. eMAR safety dashboard shows blocked attempts and compliance rates.

### 26.4 B4: Discharge Gate Enforcement in ADT

| Item | Task | Owner |
|---|---|---|
| API | Add `GET /api/v1/discharge/readiness/:admissionId` and `POST /api/v1/discharge/readiness/check` | ADT/discharge engineering lead |
| Service | Integrate readiness gate into `POST /api/v1/adt/discharge` with mandatory checks | ADT/discharge engineering lead |
| Rule engine | Mandatory dimensions: clinical signoff, nursing education, meds reconciliation, billing/TPA clearance | Discharge command lead |
| DB | Add `discharge_readiness_items` table and status snapshots at discharge attempt | DB lead |
| Override | Add controlled discharge override with authority matrix and audit | COO office + CMO |
| QA | Blocked discharge tests for each missing criterion | QA lead |
| UAT | End-to-end discharge dry run for insured and self-pay patients | Billing + nursing ops |

Acceptance criteria:

1. ADT discharge is blocked when any mandatory readiness item is incomplete.
2. Override is restricted, reasoned, and audited.
3. Discharge readiness and delay reason report is available daily.

### 26.5 Common Delivery Controls for B1-B4

| Control | Requirement | Owner |
|---|---|---|
| Definition of done | code + migration + API contract + tests + UAT evidence + runbook update | PMO + CTO |
| Feature flags | enable per module and unit to support controlled rollout | CTO |
| Monitoring | add metrics, alerts, and daily exception reports for each blocker domain | Quality tech lead |
| Rollback | documented rollback script and rehearsal evidence per blocker | DevOps lead |
| Signoff | CMO, COO, CTO signoff required before blocker marked closed | PMO lead |

### 26.6 Sequenced Implementation Order

1. B1 and B2 first (patient flow and peri-op safety).
2. B3 next (medication safety).
3. B4 next (safe discharge closure).
4. Re-run Gate A and Gate B validation before release decision.

---

## 27. Sprint Board (Ticketized Plan for B1-B4)

This section converts Section 26 into an execution board with traceable ticket IDs.

### 27.1 Ticket Conventions and Status Model

| Field | Standard |
|---|---|
| Ticket prefixes | ENG (engineering), QA (test), OPS (operations), CLN (clinical signoff) |
| Status values | TODO, IN_PROGRESS, IN_REVIEW, BLOCKED, DONE |
| Priority values | P0 (critical), P1 (high), P2 (medium) |
| Evidence rule | A ticket is not DONE until linked evidence is attached |

### 27.2 Week 1 Board (B1 + B2)

| Ticket ID | Blocker | Day | Task | Owner | Dependency | Priority | Status | Evidence required |
|---|---|---|---|---|---|---|---|---|
| ENG-B1-001 | B1 | D1 | Create `bed_reservations` schema and index | DB lead | none | P0 | TODO | migration output + schema screenshot |
| ENG-B1-002 | B1 | D1-D2 | Implement reserve API with transaction lock | Backend lead | ENG-B1-001 | P0 | TODO | API test log + lock contention test |
| ENG-B1-003 | B1 | D2 | Integrate admit flow with reservation token | Backend lead | ENG-B1-002 | P0 | TODO | admit flow test output |
| QA-B1-001 | B1 | D3 | Run concurrent reservation race tests | QA lead | ENG-B1-003 | P0 | TODO | test report with pass/fail matrix |
| OPS-B1-001 | B1 | D3 | Define reservation timeout and release SOP | COO office | ENG-B1-003 | P1 | TODO | approved SOP doc |
| CLN-B1-001 | B1 | D4 | Bed operations validation in UAT | Bed manager lead | QA-B1-001 | P0 | TODO | signed UAT checklist |
| ENG-B2-001 | B2 | D1 | Add pre-incision hard-stop validator | OT engineering lead | none | P0 | TODO | unit test output |
| ENG-B2-002 | B2 | D2 | Enforce sign_out before completed status | OT engineering lead | ENG-B2-001 | P0 | TODO | transition test log |
| ENG-B2-003 | B2 | D2-D3 | Add override payload + immutable audit trail | Quality tech lead | ENG-B2-001 | P0 | TODO | audit record sample |
| QA-B2-001 | B2 | D3 | Execute OT transition-negative test pack | QA lead | ENG-B2-003 | P0 | TODO | negative test matrix |
| CLN-B2-001 | B2 | D4 | OT simulation signoff for block/override paths | OT head | QA-B2-001 | P0 | TODO | OT signoff note |

### 27.3 Week 2 Board (B3 + B4)

| Ticket ID | Blocker | Day | Task | Owner | Dependency | Priority | Status | Evidence required |
|---|---|---|---|---|---|---|---|---|
| ENG-B3-001 | B3 | D1 | Build administration validation endpoint | Clinical engineering lead | none | P0 | TODO | endpoint test output |
| ENG-B3-002 | B3 | D1-D2 | Enforce 5-rights checks in administer flow | Clinical engineering lead | ENG-B3-001 | P0 | TODO | validation trace logs |
| ENG-B3-003 | B3 | D2 | Enforce allergy hard-stop and blocked reason capture | Clinical engineering lead | ENG-B3-002 | P0 | TODO | blocked attempt audit sample |
| ENG-B3-004 | B3 | D2-D3 | Implement high-alert dual signoff fields and checks | Nursing informatics lead | ENG-B3-002 | P0 | TODO | dual signoff test logs |
| QA-B3-001 | B3 | D3 | Run medication safety positive/negative suite | QA lead | ENG-B3-004 | P0 | TODO | test suite report |
| CLN-B3-001 | B3 | D4 | Complete 50-case ward/ICU pilot audit | Nursing quality lead | QA-B3-001 | P0 | TODO | pilot audit summary |
| ENG-B4-001 | B4 | D1 | Add discharge readiness APIs and readiness table | ADT/discharge engineering lead | none | P0 | TODO | migration + API report |
| ENG-B4-002 | B4 | D2 | Integrate readiness hard gate into ADT discharge | ADT/discharge engineering lead | ENG-B4-001 | P0 | TODO | blocked discharge test logs |
| ENG-B4-003 | B4 | D2-D3 | Add controlled override with authority matrix | ADT/discharge engineering lead | ENG-B4-002 | P0 | TODO | override audit sample |
| QA-B4-001 | B4 | D3 | Execute criterion-wise blocked discharge tests | QA lead | ENG-B4-003 | P0 | TODO | criterion test matrix |
| CLN-B4-001 | B4 | D4 | Discharge dry run signoff (insured + self-pay) | Billing + nursing ops | QA-B4-001 | P0 | TODO | signoff checklist |

### 27.4 Cross-Week Gate and Release Tickets

| Ticket ID | Gate | Day | Task | Owner | Priority | Status | Evidence required |
|---|---|---|---|---|---|---|---|
| QA-GATE-001 | Gate A | Week 2 D5 | Re-validate B2 and B3 closure evidence | QA lead | P0 | TODO | gate evidence bundle |
| QA-GATE-002 | Gate B | Week 2 D5 | Re-validate B1 and B4 closure evidence | QA lead | P0 | TODO | gate evidence bundle |
| OPS-REL-001 | Gate D | Week 3 D1 | Migration rehearsal and rollback rehearsal | DevOps lead | P0 | TODO | rehearsal logs |
| OPS-REL-002 | Go/No-Go | Week 3 D2 | Compile PMO go/no-go pack for signoff meeting | PMO lead | P0 | TODO | final go/no-go memo |

### 27.5 Daily Standup Tracking Template

Use this template each day for B1-B4 execution control.

| Date | Ticket ID | Yesterday update | Today plan | Blocker | ETA | Escalated to |
|---|---|---|---|---|---|---|
| YYYY-MM-DD | ENG-B1-001 | completed schema draft | run migration in UAT | none | EOD | n/a |

### 27.6 Closure Definition for Section 27

Section 27 is considered complete only when:

1. All P0 tickets for B1-B4 are in DONE state.
2. Gate A and Gate B re-validation tickets are DONE.
3. Release rehearsal tickets are DONE.
4. CMO, COO, and CTO signatures are recorded in the go/no-go pack.




---

## 28. Patient Journey in the Hospital With Mediqzy in Place

This section describes how the hospital operates when Mediqzy is deployed as the patient navigation, clinical workflow, and hospital coordination layer.

### 28.1 Target Experience

With Mediqzy in place, the hospital should feel coordinated to the patient and lighter for the care team.

```text
Patient is guided.
Front office is prepared.
Doctor has context before consultation.
Nurse sees tasks, not scattered instructions.
OT sees readiness, not phone calls.
Billing works in parallel, not at the last hour.
Discharge starts early.
Follow-up continues after the patient leaves.
```

The patient should experience less waiting, fewer repeated questions, clear next steps, visible status, safer medication/procedure checks, faster discharge, and continued care after discharge.

### 28.2 End-to-End Hospital Journey

```text
Digital entry / walk-in / ER arrival
  -> registration and UHID confirmation
  -> AI-assisted intake
  -> OPD consultation or ER triage
  -> digital orders and diagnostics
  -> care decision
  -> admission / procedure / surgery / OP care
  -> bed, ward, ICU, OT, pharmacy, billing coordination
  -> discharge readiness
  -> digital discharge packet
  -> follow-up, rehab, remote recovery, feedback
```

### 28.3 Before Arrival

| Step | Patient experience | Hospital action | Mediqzy action | Data created/reused |
|---|---|---|---|---|
| Appointment/referral | Books online, calls, uses WhatsApp, or arrives with referral | Confirms service need | Creates appointment/pre-registration shell | mobile, name, specialty, referral source |
| Pre-registration | Uploads ID, insurance, old reports | Validates incomplete items | Creates/links UHID and document checklist | demographics, payer, employer, documents |
| Smart intake | Answers symptoms in preferred language | Nurse/doctor reviews before visit | AI structures complaint, history, medicines, allergies | intake summary, red flags, medication list |
| Arrival preparation | Gets time, location, QR/token, instructions | Front desk sees expected arrivals | Sends reminders and pending-document alerts | queue status, consent readiness, payer status |

**Outcome:** the hospital is ready before the patient reaches the counter.

### 28.4 Arrival and Registration

| Step | Patient experience | Hospital action | Mediqzy action | Data created/reused |
|---|---|---|---|---|
| QR/check-in | Scans QR or gives mobile/UHID | Confirms identity | Opens live patient journey | check-in timestamp |
| UHID validation | Does not repeat full demographics | Resolves duplicate risk | Matches existing patient or creates UHID | patient master, duplicate score |
| Financial class | Selects self-pay, insurance, corporate, TPA | Validates tariff/payer | Maps payer rules and estimate flow | payer, policy, tariff, sponsor |
| Queue/token | Sees waiting status | OPD/ER sees queue | Routes to doctor/triage | queue event, department, priority |

**Patient delight rule:** the patient always sees what happens next and who owns it.

### 28.5 OPD Consultation

| Step | Patient experience | Doctor action | Mediqzy action | Data created/reused |
|---|---|---|---|---|
| Case opening | Doctor already knows why patient came | Reviews timeline and intake | Displays one-page summary | history, allergies, old reports, vitals |
| Consultation | Speaks naturally, doctor maintains eye contact | Examines, diagnoses, explains plan | Drafts note with AI/ambient support | SOAP note, diagnosis, plan |
| Digital orders | Receives clear next steps | Orders labs, imaging, medicines, procedure | Sends orders to LIS/RIS/pharmacy/billing | order records, priority, diagnosis link |
| Care decision | Understands OP care, admission, surgery, or follow-up | Selects pathway | Launches pathway tasks automatically | care pathway, admission/OT/pre-auth triggers |

**Doctor adoption rule:** the doctor validates clinical decisions; Mediqzy handles task propagation.

### 28.6 Diagnostics

| Step | Patient experience | Hospital action | Mediqzy action | Data created/reused |
|---|---|---|---|---|
| Lab/radiology routing | Follows app/kiosk guidance | Receives digital order | Generates barcode/order queue | order, sample, accession |
| Sample/scan | No paper slip required | Records sample/scan completion | Updates patient timeline | collection timestamp, technician |
| Results | Sees report availability | Doctor receives critical alerts | Posts results to EMR and portal | result values, image link, critical flag |
| Care update | Avoids unnecessary return trips | Doctor updates plan | Feeds results into pathway/pre-auth/discharge | diagnosis confidence, readiness status |

**Safety rule:** critical results must create actionable alerts, not passive reports.

### 28.7 Admission Decision

| Step | Patient experience | Hospital action | Mediqzy action | Data created/reused |
|---|---|---|---|---|
| Admission advised | Receives reason and next steps | Doctor selects admit/convert to IP | Creates admission request | diagnosis, doctor, expected LOS |
| Bed planning | Sees room/bed class options | Bed manager reviews allocation | Recommends bed by class, gender, acuity, infection risk | bed map, ward, isolation, payer |
| Financial clearance | Sees estimate and deposit/pre-auth status | Billing/TPA starts in parallel | Creates estimate/pre-auth bundle | tariff, package, documents |
| ADT admission | Receives wristband/room info | Front office admits patient | Creates ADT A01 event | admission ID, bed, timestamp |

**Operational rule:** OPD-to-IPD and ER-to-IPD conversion must never create duplicate patient identity.

### 28.8 Ward and Nursing Care

| Step | Patient experience | Nurse/doctor action | Mediqzy action | Data created/reused |
|---|---|---|---|---|
| Nursing assessment | Assessed at bedside | Records vitals, risks, care needs | Creates digital baseline | vitals, fall risk, pressure risk, allergy |
| Task-driven care | Receives timely care | Nurse follows prioritized board | Generates due/overdue tasks | nursing task list, eMAR, vitals schedule |
| Medication safety | Gets verified medicines | Nurse scans patient and medicine | Enforces 5-rights and allergy checks | medication order, administration, audit |
| Doctor rounds | Gets updated plan | Doctor reviews trends and notes | Shows timeline and pending issues | vitals trend, labs, notes |
| Escalation | Deterioration is caught early | Nurse/doctor respond | AI/EWS alerts trigger escalation | early warning score, alert acknowledgement |

**Nurse adoption rule:** Mediqzy reduces memory burden by showing the next safest task.

### 28.9 Surgery and OT Journey

| Step | Patient experience | Team action | Mediqzy action | Data created/reused |
|---|---|---|---|---|
| Pre-op preparation | Receives fasting and timing guidance | Ward nurse completes checklist | Tracks NPO, vitals, consent, reports | pre-op checklist |
| Anesthesia clearance | Meets anesthesia team | Anesthetist records assessment | Links clearance to OT readiness | ASA/risk, anesthesia plan |
| OT readiness | Family sees status | OT verifies team, room, implants, blood | Shows readiness score and missing items | OT booking, inventory, blood, consent |
| Time-out/safety | Identity/procedure/site verified | OT team completes checklist | Enforces safety gates and audit | sign-in, time-out, sign-out |
| Intra-op documentation | Surgeon avoids post-op typing burden | Surgeon/anesthesia records procedure | Captures timings, note, implants, consumables | operative note, charges, traceability |
| Family updates | Family receives controlled updates | Coordinator approves updates | Sends OT started/completed/recovery messages | family notification log |

**OT safety rule:** a case cannot move to completed status without required sign-out or approved override.

### 28.10 ICU or Post-Op Recovery

| Step | Patient experience | Team action | Mediqzy action | Data created/reused |
|---|---|---|---|---|
| Recovery handoff | Moves to PACU/ICU/ward | OT/anesthesia hands over digitally | Creates destination and handoff record | OT note, anesthesia note, drains, orders |
| Monitoring | Monitored based on risk | Nurse records vitals, pain, drain, mobility | Charts recovery and flags deterioration | vitals, pain, I/O, EWS |
| Medication and care | Receives safe post-op meds | Nurse administers via eMAR | Checks allergies, dose, timing, signoff | eMAR, pharmacy, audit |
| Allied care | Receives physio/diet/wound care | Allied teams complete tasks | Tracks multidisciplinary tasks | physio, diet, wound status |

**Clinical rule:** recovery data must feed discharge readiness and readmission risk.

### 28.11 Billing, Insurance, and Corporate Workstream

This workstream runs in parallel from the moment the care decision is made.

| Step | Patient experience | Team action | Mediqzy action | Data created/reused |
|---|---|---|---|---|
| Estimate | Sees expected cost range | Billing validates package/tariff | Generates estimate from diagnosis/procedure/orders | estimate, payer, package |
| Pre-auth | Sees approval status | Insurance desk submits documents | Builds document bundle automatically | diagnosis, reports, consent, estimate |
| Charge capture | Avoids surprise billing | Pharmacy/OT/ward charges flow automatically | Captures room, meds, consumables, implants | billing items, non-payables |
| Corporate/sponsor billing | Sees sponsor vs self-pay split | Corporate desk validates eligibility | Applies corporate tariff and sponsor rules | employee ID, referral, entitlement |
| Final bill | Pays balance digitally | Billing closes bill after readiness | Links billing clearance to discharge readiness | final bill, claim file |

**Revenue rule:** billing must not wait until doctor discharge clearance.

### 28.12 Smart Discharge

| Step | Patient experience | Team action | Mediqzy action | Data created/reused |
|---|---|---|---|---|
| Discharge planning | Knows likely discharge date | Team prepares early | Calculates expected discharge and blockers | EDD, readiness board |
| Clinical clearance | Gets final doctor review | Doctor marks fit for discharge | Starts discharge readiness gate | diagnosis, status, instructions |
| Summary draft | Receives complete instructions | Doctor reviews and signs | AI drafts discharge summary from journey data | notes, labs, OT, meds |
| Pharmacy clearance | Receives take-home medicines | Pharmacy reconciles medications | Creates discharge prescription and med list | medicines, allergies, eMAR |
| Billing/TPA clearance | Avoids counter-to-counter movement | Billing/TPA closes final amount | Tracks clearance in discharge board | final bill, claim, payment |
| Digital exit | Leaves with packet | Nurse educates patient/family | Sends discharge packet and follow-up plan | summary, reports, prescription, warnings |

**Discharge rule:** ADT discharge cannot close until clinical, nursing, pharmacy, billing, and follow-up readiness are complete or formally overridden.

### 28.13 Follow-Up and Recovery at Home

| Step | Patient experience | Hospital action | Mediqzy action | Data created/reused |
|---|---|---|---|---|
| Follow-up schedule | Gets appointment before leaving | Confirms slot | Creates follow-up task | follow-up plan |
| Recovery check-ins | Reports pain, fever, wound, mobility | Nurse navigator reviews exceptions | Collects structured recovery data | wound photo, symptoms, compliance |
| Escalation | Gets early intervention | Doctor sees flagged cases | Triggers alert for wound issue, fever, pain, risk | recovery alerts |
| Rehab/RTW | Receives rehab/fitness plan | Physio/occupational health clears | Generates fitness/return-to-work documents | rehab status, certificate |
| Feedback/outcomes | Gives feedback | Quality team reviews trends | Tracks satisfaction, complications, readmission | outcome and quality data |

**Continuity rule:** the hospital journey does not end at discharge; it ends when recovery goals are met.

### 28.14 Role View During the Journey

| Role | What Mediqzy shows | Decision supported |
|---|---|---|
| Patient/family | current step, next step, wait time, payment/pre-auth, OT/discharge/follow-up status | what to do now |
| Front office | arrivals, incomplete registrations, queue, admission/discharge readiness | where to guide the patient |
| Doctor | timeline, AI summary, allergies, results, active problems, orders, discharge draft | diagnosis and care plan |
| Nurse | assigned patients, due meds, vitals, risks, escalation alerts, discharge education | safest next task |
| Bed manager | live occupancy, expected discharges, pending admissions, isolation/ICU needs | best bed allocation |
| OT team | case list, readiness, consent, anesthesia, blood, implants, delays | whether case can proceed |
| Billing/TPA | payer, package, estimate, pre-auth, non-payables, claim readiness | financial clearance |
| Leadership | waits, LOS, OT utilization, discharge TAT, readmissions, satisfaction | system improvement |

### 28.15 Data Feeding Through the Journey

```text
Registration data
  -> appointment, queue, billing, insurance, wristband, discharge packet

Clinical intake data
  -> doctor summary, triage, order sets, risk alerts, discharge draft

Diagnostic data
  -> diagnosis, pre-op clearance, medication dosing, discharge readiness

ADT and bed data
  -> ward dashboard, room billing, occupancy, LOS analytics

OT and implant data
  -> operative record, billing, inventory, infection control, traceability

Nursing and eMAR data
  -> rounds, safety alerts, pharmacy, quality, discharge readiness

Billing and payer data
  -> estimate, pre-auth, claim, discharge clearance

Follow-up data
  -> complication detection, readmission prevention, outcome analytics
```

### 28.16 What Changes for Each Stakeholder

| Stakeholder | Before Mediqzy | With Mediqzy in place |
|---|---|---|
| Patient | asks multiple counters for status | sees guided journey and next action |
| Family | waits anxiously outside OT/ICU | receives controlled status updates |
| Doctor | documents after consultation/rounds | validates AI-assisted notes and summaries |
| Nurse | tracks work manually or on paper | follows prioritized bedside task board |
| OT | coordinates through calls and paper checklist | works from readiness dashboard and safety gates |
| Billing | waits for documents and late charges | receives structured charges and pre-auth bundle |
| Management | reviews delays after complaints | sees live bottlenecks and KPI trends |

### 28.17 Mediqzy Hospital Journey Success Measures

| Measure | Target behavior |
|---|---|
| Registration | patient identity created or verified once |
| OPD | doctor sees summary before consultation |
| Diagnostics | reports flow back automatically |
| Admission | OP/ER converts to IP without duplicate registration |
| Bed management | bed allocation is visible and timestamped |
| Nursing | vitals, eMAR, risks, and notes are digital |
| OT | no case proceeds without readiness visibility |
| Billing | estimate/pre-auth/charges run in parallel |
| Discharge | readiness blockers are visible before final hour |
| Follow-up | high-risk patients are monitored after discharge |

### 28.18 Final Hospital Operating Statement

With Mediqzy in place, the hospital operates as one connected care journey:

```text
The patient is not passed from department to department.
The patient is carried by a digital journey.
Each department adds data once.
That data becomes the next department's context.
Care becomes safer, faster, more transparent, and easier to govern.
```

## 29. AI Navigation in the Patient Journey

This section defines how Mediqzy uses AI as a navigation layer across the hospital journey. The goal is not to replace staff judgment. The goal is to make every patient know what to do next, make every staff member see the safest next action, and make every department receive usable context before the patient arrives.

### 29.1 AI Navigation Operating Model

```text
Patient signal
  -> AI interpretation
  -> Journey state update
  -> Next-best action
  -> Human validation where needed
  -> Department task creation
  -> Patient/family communication
  -> Outcome feedback
```

| Layer | Purpose | Examples |
|---|---|---|
| Patient-facing AI | Guides the patient and family | intake, reminders, directions, discharge instructions, recovery check-ins |
| Staff-facing AI | Reduces documentation and coordination work | summaries, task prioritization, risk alerts, draft notes |
| Operational AI | Optimizes hospital movement | queues, beds, OT slots, discharge blockers, staffing load |
| Clinical safety AI | Detects risk and missing actions | allergies, abnormal reports, sepsis risk, deterioration, duplicate medicines |
| Revenue AI | Prevents billing and authorization delays | estimate accuracy, pre-auth gaps, non-payables, claim readiness |

**Core rule:** AI must be visible as an assistant, not as an authority. Clinical decisions, consent, admission, surgery, discharge, and overrides remain human-controlled.

### 29.2 AI Navigation Goals

| Goal | Patient outcome | Staff outcome | Hospital outcome |
|---|---|---|---|
| Reduce anxiety | patient always sees current step and next step | fewer status calls | better satisfaction |
| Reduce repetition | patient gives information once | less duplicate entry | cleaner master data |
| Reduce waiting confusion | expected wait and reason are visible | front office handles exceptions | better queue control |
| Improve care safety | risk signals are not missed | nurses/doctors see priority alerts | lower adverse events |
| Improve discharge speed | readiness is prepared early | fewer last-hour tasks | shorter discharge TAT |
| Improve follow-up | complications are caught early | team sees only exceptions | fewer avoidable readmissions |

### 29.3 AI Navigator Personas

| AI persona | Primary users | What it does | Human owner |
|---|---|---|---|
| Patient Concierge | patient/family | guides booking, intake, documents, wayfinding, payments, follow-up | patient experience team |
| Clinical Copilot | doctors | summarizes history, drafts notes, suggests pathways, prepares discharge draft | treating doctor |
| Nursing Copilot | nurses | prioritizes tasks, alerts missed vitals/meds, supports bedside documentation | nurse in charge |
| Care Coordinator | front office, ward, OT, discharge desk | tracks patient location, blockers, handoffs, pending tasks | operations manager |
| Revenue Copilot | billing, TPA, corporate desk | detects pre-auth gaps, package mismatch, missing documents | billing/TPA lead |
| Quality Copilot | quality, infection control, leadership | tracks checklist compliance, infection signals, outcomes, RCA data | quality head |

### 29.4 Patient-Facing AI Navigation by Stage

| Journey stage | AI navigation action | Data consumed | Data created | Patient delight impact |
|---|---|---|---|---|
| Discovery/booking | routes to right specialty and slot | symptoms, location, language, payer | appointment intent, urgency, specialty | fewer wrong appointments |
| Pre-registration | extracts ID, insurance, referral, prior reports | uploaded documents, mobile number | UHID match, KYC, payer profile | faster arrival |
| Pre-visit intake | collects complaint, history, medicines, allergies | patient answers, old reports | structured intake summary | no repeated storytelling |
| Arrival | guides QR check-in and counter/room direction | appointment, UHID, payment status | arrival timestamp, queue event | no confusion at entrance |
| OP consultation | explains expected next steps after doctor plan | diagnosis, orders, care plan | patient instruction card | better understanding |
| Diagnostics | tells where to go, preparation, report status | orders, location, fasting rules | sample/status events | less wandering |
| Admission | explains bed, deposit, consent, attendant rules | admission order, payer, bed status | admission checklist | predictable admission |
| Surgery | explains fasting, OT readiness, family updates | OT schedule, consent, checklist | readiness messages | lower anxiety |
| Recovery | prompts pain, breathing, walking, diet goals | clinical pathway, vitals, meds | patient-reported recovery | active participation |
| Discharge | explains medicines, warning signs, follow-up | discharge summary, prescription | digital discharge packet | safer exit |
| Home care | checks symptoms, wound photo, adherence | recovery plan, risk score | recovery trend, escalation alert | early complication detection |

### 29.5 Staff-Facing AI Navigation by Stage

| Staff group | AI shows | AI creates | Staff action |
|---|---|---|---|
| Front office | identity match, incomplete registration, payer status, queue priority | registration task, exception flag | verify and route patient |
| Doctor | concise timeline, intake summary, red flags, latest reports | draft note, order suggestion, diagnosis/procedure draft | validate and decide |
| Nurse | due tasks, overdue tasks, risk score, medication safety prompts | bedside task list, escalation alert | perform, document, escalate |
| Lab/radiology | priority orders, STAT flags, sample/report delays | turnaround alerts, result notification | process and release results |
| Bed manager | predicted admissions, discharges, isolation/ICU needs | bed recommendation | allocate bed |
| OT team | case readiness, missing consent, blood/implant/anesthesia status | readiness score, delay alert | clear case for OT |
| Billing/TPA | estimate gap, pre-auth status, non-payables, claim readiness | document checklist, payer alert | submit/close financial workflow |
| Discharge desk | clinical, nursing, pharmacy, billing blockers | discharge readiness board | coordinate closure |

### 29.6 AI Data Feeding and Reuse Model

```text
Patient-provided data
  -> structured intake
  -> doctor summary
  -> diagnosis and orders
  -> care pathway
  -> nursing tasks
  -> billing estimate and pre-auth
  -> discharge summary
  -> follow-up monitoring
  -> outcomes and quality analytics
```

| Data source | AI extraction | Used immediately for | Reused later for |
|---|---|---|---|
| ID/insurance/referral | identity, payer, eligibility | registration and billing | claim, corporate reporting |
| Symptoms/history | chief complaint, duration, risk | triage and consultation | discharge summary, follow-up risk |
| Old reports | diagnoses, abnormal values, procedures | doctor context | trend analysis |
| Doctor note | diagnosis, plan, procedure | orders and admission decision | coding, discharge, audit |
| Lab/radiology result | abnormality, criticality, trend | alerts and treatment plan | discharge readiness, quality |
| Vitals/eMAR | deterioration, missed dose, pain trend | nurse task priority | safety audit, readmission risk |
| OT/anesthesia note | procedure, implant, complications | post-op plan and billing | infection tracking, medico-legal record |
| Billing/TPA events | pending approval, non-payable, deposit gap | financial navigation | claim closure and revenue analytics |
| Follow-up responses | fever, wound issue, pain, mobility | escalation | outcome registry |

### 29.7 AI Navigation Decision Rules

| Signal | AI response | Human escalation |
|---|---|---|
| duplicate patient likely | suggest existing UHID match | registration supervisor confirms |
| high-risk symptoms during intake | mark urgent and route to triage/doctor | nurse/doctor confirms acuity |
| abnormal critical lab | notify doctor/nurse immediately | clinical team acknowledges |
| missing pre-op clearance | block OT readiness status | OT coordinator resolves or surgeon overrides |
| allergy-medication conflict | alert before order/admin | doctor/pharmacist validates |
| deteriorating vitals | trigger early warning escalation | nurse/doctor responds |
| discharge blocker detected | show on readiness board | discharge coordinator closes blocker |
| post-discharge wound/fever risk | create follow-up alert | nurse navigator/doctor calls patient |

### 29.8 Patient App AI Navigation Experience

The patient app should present a simple journey card, not a complex hospital menu.

```text
Current step: Diagnostics
Status: Blood sample collected, ultrasound pending
Next action: Go to Radiology, 2nd Floor, Room 204
Expected wait: 18 minutes
Need help: Call navigator / chat / request wheelchair
```

| App component | Purpose |
|---|---|
| Journey status card | current stage, next step, expected wait |
| Smart checklist | documents, fasting, medicines, payment, consent |
| Indoor guidance | counter, lab, radiology, ward, pharmacy, billing location |
| Family updates | controlled OT/ICU/discharge status messages |
| Payment/pre-auth tracker | estimate, deposit, approval, final bill status |
| Recovery assistant | symptoms, wound photo, medicine adherence, follow-up |
| Escalation button | call nurse navigator, front office, emergency support |

### 29.9 AI Escalation and Safety Governance

| Control | Requirement |
|---|---|
| AI label | every AI-generated note, summary, or suggestion must be clearly marked as draft/suggested |
| Audit trail | AI suggestion, human acceptance, edit, override, and rejection must be stored |
| Override reason | critical pathway overrides require reason and user identity |
| Emergency bypass | AI must never delay emergency care, OT activation, blood request, or ICU transfer |
| Bias and language review | patient-facing AI must support local languages and be reviewed for unsafe wording |
| Clinical validation | clinical prompts and pathways must be approved by hospital clinical governance |
| Data privacy | AI context must use role-based access and minimum necessary data |
| Monitoring | false alerts, missed alerts, adoption, and outcome impact must be reviewed monthly |

### 29.10 Implementation Requirements for AI Navigation

| Requirement | Implementation detail | Priority |
|---|---|---|
| Journey event timeline | one event stream for booking, arrival, OP, diagnostics, admission, OT, discharge, follow-up | P1 |
| AI intake service | multilingual symptom/history/document extraction | P1 |
| Patient journey card | current step, next step, wait, blocker, owner | P1 |
| Staff task engine | converts AI/pathway signals into assigned tasks | P1 |
| Alert acknowledgment | every safety alert needs owner, status, timestamp | P1 |
| Discharge readiness engine | clinical, nursing, pharmacy, billing, follow-up blockers | P1 |
| AI draft documentation | doctor note, operative note, discharge summary drafts | P2 |
| Predictive risk scoring | deterioration, readmission, LOS, no-show, discharge delay | P2 |
| Command center analytics | live bottlenecks, queue, beds, OT, discharge, satisfaction | P2 |

### 29.11 AI Navigation KPIs

| KPI | Target |
|---|---|
| patients with visible next step | over 95% active journeys |
| intake completed before consultation | over 80% eligible OP visits |
| doctor AI summary usage | over 70% eligible visits |
| duplicate registration avoided | over 95% suspected matches reviewed |
| critical alert acknowledgment | under 5 minutes for high-severity alerts |
| OT readiness defects caught before transfer | over 90% |
| discharge blockers visible before planned discharge day | over 85% |
| post-discharge high-risk check-in completion | over 80% |
| AI suggestion override audit completeness | 100% for safety-critical suggestions |

### 29.12 Final AI Navigation Statement

```text
Mediqzy AI navigation should make the hospital feel guided, not automated.
The patient receives clarity.
The family receives reassurance.
The doctor receives context.
The nurse receives priority.
The hospital receives operational visibility.
Every AI action must feed the next care step and remain under accountable human control.
```
