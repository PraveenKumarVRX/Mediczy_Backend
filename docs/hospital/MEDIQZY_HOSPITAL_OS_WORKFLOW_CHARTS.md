# MediQzy Hospital OS — Patient & Operations Workflow Charts

**Version:** 1.0  
**Date:** 2026-06-17  
**Audience:** Hospital operations, clinical leads, nursing, front desk, IT, delivery  
**Scope:** End-to-end journeys from first touch (arrival / booking) through admission, inpatient care, and discharge — mapped to MediQzy routes, APIs, and display surfaces.

**Related docs:**
- [SMART_HOSPITAL_OS_VISION.md](./SMART_HOSPITAL_OS_VISION.md) — north-star architecture
- [GREENFIELD_HOSPITAL_GAPS_IMPLEMENTATION.md](./GREENFIELD_HOSPITAL_GAPS_IMPLEMENTATION.md) — gap IDs & maturity
- [MEDIQZY_DISPLAY_KIOSK_PLAN.md](./MEDIQZY_DISPLAY_KIOSK_PLAN.md) — zone hardware specs

---

## 1. How to read these charts

| Symbol | Meaning |
|--------|---------|
| 🟢 | **Live** — wired to production APIs / unified queue / HMIS |
| 🟡 | **Partial** — UI exists; demo fallback or missing migration |
| 🔴 | **Scaffold** — placeholder UI (e.g. hospital portal localStorage modules) |
| `[Screen]` | Frontend route |
| `(API)` | Backend endpoint |
| `{Display}` | Wall / kiosk surface |

**Stack rule (critical for IPD):**

| Use for real clinical work | Do **not** use for IPD |
|----------------------------|-------------------------|
| `/hmis/*`, `/ward/*`, `/icu/*`, `/ot/*` | `/hospital/beds`, `/hospital/opd-ipd`, `/hospital/billing` (placeholders) |
| `/api/v1/adt`, `/beds`, `/emar`, `/nursing`, `/ot`, `/discharge` | Hospital portal sidebar modules without API wiring |

---

## 2. Platform layers (operations view)

```mermaid
flowchart TB
  subgraph Touch["Touch layer — Hospital OS"]
    K["Kiosks<br/>/kiosk/*"]
    D["Displays<br/>/display/*"]
    M["Staff mobile / web"]
  end

  subgraph Control["Control plane"]
    Q["Unified queue<br/>/api/v1/queue"]
    SSE["SSE events<br/>/api/display/events"]
    ADM["Display admin<br/>/display/admin"]
  end

  subgraph Clinical["Clinical plane — HMIS"]
    ADT["ADT<br/>/api/v1/adt"]
    BED["Beds<br/>/api/v1/beds"]
    EMAR["eMAR<br/>/api/v1/emar"]
    NUR["Nursing<br/>/api/v1/nursing"]
    OT["OT<br/>/api/v1/ot"]
    DC["Discharge<br/>/api/v1/discharge"]
  end

  subgraph OPD["Outpatient plane"]
    APT["Appointments<br/>/api/enhanced-appointments"]
    HPR["Hospital practice<br/>/api/hospital/practice"]
    INS["Insurance<br/>/api/hospital/insurance"]
  end

  subgraph Intel["Intelligence & IoT"]
    AI["AI triage / scribe / copilot"]
    MQTT["MQTT vitals → SSE bridge"]
  end

  K --> Q
  D --> SSE
  Q --> SSE
  M --> ADT
  M --> EMAR
  ADT --> BED
  ADT --> DC
  EMAR --> NUR
  OT --> DC
  K --> AI
  MQTT --> D
  APT --> K
  HPR --> INS
```

---

## 3. Patient entry paths (four front doors)

Every patient enters through one of four paths. All OPD/ER waiting uses the **unified queue** (`hospital_queue_entries`).

```mermaid
flowchart LR
  subgraph Entry["Patient entry"]
    A["📅 Scheduled OPD"]
    B["🆕 Walk-in OPD"]
    C["🚨 Emergency"]
    D["🏥 Planned IPD"]
  end

  subgraph Queue["Unified queue OS 🟢"]
    QOPD["OPD zone<br/>OPD-MAIN"]
    QER["ER zone<br/>er-triage"]
  end

  subgraph HMIS["HMIS IPD 🟢"]
    ADM["ADT Admit"]
  end

  A -->|book online| APT["/appointments"]
  APT -->|arrive| K1["/kiosk/checkin"]
  K1 --> QOPD

  B -->|register| K1
  K1 --> QOPD

  C -->|self triage| K2["/kiosk/er-triage"]
  C -->|staff register| ER["/hospital/er/queue"]
  K2 --> QER
  ER --> QER

  D -->|pre-auth + bed| WARD["/hospital/adt/admit"]
  WARD --> ADM
```

| Path | Primary UI | Key APIs | Queue? | Converts to IPD? |
|------|------------|----------|--------|------------------|
| Scheduled OPD | `/kiosk/checkin`, `/appointments` | `POST /api/enhanced-appointments/book`, `POST /api/display/checkin/issue-token` | 🟢 Yes (`scheduled`) | `POST /api/v1/adt/convert-op-to-ip` |
| Walk-in OPD | `/kiosk/checkin` | `POST /api/display/kiosk/register` | 🟢 Yes (`walk_in`) | Same |
| Emergency | `/kiosk/er-triage`, `/hospital/er/queue` | `POST /api/display/kiosk/er-triage`, `POST /api/v1/er/register` | 🟢 ER queue | `POST /api/v1/adt/er-to-ip` |
| Elective IPD | `/hospital/adt/admit` | `POST /api/v1/beds/reserve`, `POST /api/v1/adt/admit` | No | — |

---

## 4. Master patient journey — admission to discharge

High-level swimlane for **all** paths converging on IPD discharge (OPD-only patients exit after consult).

```mermaid
flowchart TB
  START((Patient arrives))

  subgraph Phase0["Phase 0 — Access & identity"]
    ID["Identity<br/>phone · QR · ABHA · UHID"]
    REG["Registration / check-in"]
  end

  subgraph Phase1["Phase 1 — Triage & routing"]
    TRI["Triage / priority<br/>ESI · appointment · walk-in"]
    ROUTE{"Route?"}
  end

  subgraph Phase2["Phase 2 — Outpatient care"]
    WAIT["Queue wait<br/>{Display} /display/queue"]
    CONSULT["Consultation<br/>doctor EMR / scribe"]
    ORDERS["Orders<br/>lab · imaging · Rx"]
  end

  subgraph Phase3["Phase 3 — Inpatient admission"]
    BED["Bed reserve / allocate<br/>(API) /api/v1/beds"]
    ADMIT["ADT Admit A01<br/>(API) /api/v1/adt/admit"]
  end

  subgraph Phase4["Phase 4 — Inpatient stay"]
    NURS["Nursing assessment & tasks"]
    EMAR["eMAR administration"]
    VITALS["Vitals / EWS / ICU monitoring"]
    OT_FLOW["OT procedure if needed"]
    BILL["Billing estimate & insurance"]
  end

  subgraph Phase5["Phase 5 — Discharge"]
    READY["Discharge readiness<br/>6 dimensions"]
    PACKET["Discharge summary & packet"]
    ADT_OUT["ADT Discharge A03<br/>bed freed"]
    EXIT["Exit & follow-up<br/>{Display} discharge lounge"]
  end

  OPD_EXIT((OPD discharge home))

  START --> ID --> REG --> TRI --> ROUTE
  ROUTE -->|OPD| WAIT --> CONSULT --> ORDERS
  ORDERS -->|go home| OPD_EXIT
  ORDERS -->|admit| BED
  ROUTE -->|ER/IPD direct| BED
  BED --> ADMIT --> NURS --> EMAR
  NURS --> VITALS
  ADMIT --> OT_FLOW
  EMAR --> BILL
  OT_FLOW --> BILL
  BILL --> READY --> PACKET --> ADT_OUT --> EXIT
```

---

## 5. Detailed patient workflows

### 5.1 Scheduled OPD (appointment → consult → home or admit)

```mermaid
sequenceDiagram
  autonumber
  actor P as Patient
  participant App as Patient app
  participant K as Kiosk /kiosk/checkin
  participant Q as Queue /api/v1/queue
  participant Disp as OPD board /display/queue
  participant Doc as Doctor panel
  participant HMIS as HMIS ADT

  P->>App: Book appointment
  App->>App: POST /api/enhanced-appointments/book
  P->>K: Arrive · scan QR or enter phone
  K->>K: POST /api/display/checkin/appointments
  K->>K: POST /api/display/checkin/issue-token
  K->>Q: checkIn (queueType: scheduled)
  Q-->>Disp: SSE queue_token_issued
  Q-->>P: Token + est. wait (WhatsApp optional)
  Doc->>Q: GET /api/v1/queue/my
  Doc->>Q: PATCH call → start → complete
  Q-->>Disp: SSE queue_token_called
  alt Discharge home
    P->>P: Orders fulfilled · billing at counter
  else Convert to IPD
    Doc->>HMIS: POST /api/v1/adt/convert-op-to-ip
  end
```

| Step | Actor | Screen / API | Output |
|------|-------|--------------|--------|
| 1 | Patient | `/appointments` → book | Appointment record |
| 2 | Patient | `/kiosk/checkin` → phone / QR | Appointment matched |
| 3 | System | `(API) POST /api/display/checkin/issue-token` | Queue token `A-###` |
| 4 | Patient | `{Display}` `/display/queue` | Token called on wall + TTS |
| 5 | Doctor | `QueueManagementPanel` → `/api/v1/queue` | Consultation |
| 6 | Doctor | `/hospital/ehr`, prescriptions, lab orders | Clinical documentation |
| 7a | Patient | Pharmacy / billing counter | OPD exit |
| 7b | Doctor | `/hospital/adt/admit` → convert OP→IP | IPD path (§5.4) |

---

### 5.2 Walk-in OPD (kiosk registration → queue → consult)

```mermaid
flowchart TD
  A[Touch /kiosk/checkin] --> B{Path?}
  B -->|Walk-in| C[Demographics + consent DPDP kiosk-v1]
  C --> D[Optional: photo · ABHA · WhatsApp notify]
  D --> E["(API) POST /api/display/kiosk/register"]
  E --> F[Create/link user · allocate UHID]
  F --> G["checkIn → hospital_queue_entries"]
  G --> H["Token e.g. A-042"]
  H --> I["{Display} /display/queue + SSE"]
  I --> J[Doctor consult via /api/v1/queue]
  J --> K{Outcome?}
  K -->|Home| L[OPD billing · pharmacy]
  K -->|Admit| M["/hospital/adt/admit convert-op-to-ip"]
```

**Kiosk APIs (🟢):**

| Action | Endpoint |
|--------|----------|
| QR parse | `POST /api/display/kiosk/parse-qr` |
| Walk-in register | `POST /api/display/kiosk/register` |
| Photo | `POST /api/display/kiosk/photo` |
| ABHA OTP | `POST /api/abdm/kiosk/abha/init`, `/verify` |

---

### 5.3 Emergency (ER triage → treat → admit or discharge)

```mermaid
flowchart TD
  subgraph KioskPath["Self-service 🟢"]
    K1[/kiosk/er-triage/] --> K2[Symptoms + pain + consent]
    K2 --> K3["AI ESI triage + quality gates"]
    K3 --> K4["ER token ER-### + optional LiveKit"]
  end

  subgraph StaffPath["Staff-led 🟡"]
    S1[/hospital/er/queue/] --> S2["(API) POST /api/v1/er/register"]
    S2 --> S3["Retriage PUT /api/v1/er/triage/:id"]
  end

  subgraph Board["Clinical visibility 🟢"]
    D1["{Display} /display/er-triage"]
    D2["SSE zone er-triage"]
  end

  K4 --> D1
  S3 --> D1
  D1 --> D2

  subgraph Disposition["ER disposition"]
    X{Acuity / decision}
    X -->|Treat & release| R1[ER discharge instructions]
    X -->|Emergency OT| R2["POST /api/v1/er/emergency-ot"]
    X -->|Admit IPD| R3["POST /api/v1/adt/er-to-ip"]
  end

  K4 --> X
  S3 --> X
```

| ESI level | Queue priority | Typical routing |
|-----------|----------------|-----------------|
| ESI-1 | 100 (resuscitation) | Code teams · immediate bed/OT |
| ESI-2 | 85 (emergent) | Emergency OT or ICU eval |
| ESI-3 | 70 (urgent) | ER bay → ward when bed ready |
| ESI-4/5 | 55 / 40 | Fast track · observe · discharge |

---

### 5.4 Inpatient admission (elective / converted / ER)

```mermaid
flowchart LR
  subgraph PreAdmit["Pre-admission"]
    PA1[Insurance pre-auth<br/>/hmis or /insurance-desk]
    PA2["(API) POST /api/v1/insurance/preauth"]
    PA3["(API) POST /api/v1/beds/reserve"]
  end

  subgraph Admit["Admission event"]
    A1["/hospital/adt/admit"]
    A2["(API) POST /api/v1/adt/admit"]
    A3["ip_admissions + adt_events A01"]
    A4["Init discharge readiness checklist"]
  end

  subgraph Assign["Bed & ward"]
    B1["(API) POST /api/v1/beds/allocate"]
    B2["/hmis/beds/map"]
    B3["{Display} /display/ward"]
    B4["{Display} /display/bedside?bed="]
  end

  PA1 --> PA2 --> PA3 --> A1 --> A2 --> A3 --> A4
  A2 --> B1 --> B2
  B2 --> B3
  B2 --> B4
```

**Admission types (`adt.service.js`):**

| Type | Source | API |
|------|--------|-----|
| `elective` | Planned surgery / admission | `POST /api/v1/adt/admit` |
| `op_converted` | After OPD consult | `POST /api/v1/adt/convert-op-to-ip` |
| `er` | From ER | `POST /api/v1/adt/er-to-ip` |
| `emergency` | Bypass reservation token | `admit` with emergency flag |

---

### 5.5 Inpatient stay (nursing · eMAR · OT · monitoring)

```mermaid
flowchart TB
  subgraph Daily["Daily inpatient operations"]
    direction TB
  N1["Nursing assessment<br/>(API) /api/v1/nursing/assessment"]
  N2["Care tasks<br/>/hmis/admission/:id/nursing-tasks"]
  N3["Vitals + EWS<br/>(API) /api/v1/nursing/vitals"]
  E1["eMAR orders<br/>(API) /api/v1/emar/orders"]
  E2["Due meds<br/>/hmis/emar · /hospital/ward"]
  E3["Administer + barcode<br/>(API) /api/v1/emar/administer"]
  end

  subgraph Critical["Critical care overlays"]
  I1["ICU census<br/>/icu/*"]
  I2["{Display} /display/icu-board"]
  I3["MQTT vitals → SSE"]
  O1["OT book<br/>(API) /api/v1/ot/book"]
  O2["WHO checklist<br/>/hmis/ot/command-center"]
  O3["{Display} /display/ot-status"]
  end

  subgraph PatientExp["Patient experience"]
  P1["{Display} /display/bedside"]
  P2["Nurse call<br/>(API) /api/display/bedside/nurse-call"]
  P3["Video consult<br/>(API) /api/display/video/sessions"]
  P4["Family video<br/>/kiosk/family-video"]
  end

  N1 --> N2 --> N3
  E1 --> E2 --> E3
  I1 --> I2
  I3 --> I2
  O1 --> O2 --> O3
  P1 --> P2
  P1 --> P3
  P4 --> P3
```

---

### 5.6 Discharge (readiness → summary → bed release)

```mermaid
flowchart TD
  subgraph Readiness["Discharge readiness dimensions 🟢"]
    R1["clinical — doctor discharge order"]
    R2["nursing_education — patient teaching"]
    R3["medication_reconciliation"]
    R4["billing — charges cleared"]
    R5["tpa — insurance clearance optional"]
    R6["discharge_summary — signed summary"]
  end

  subgraph Workflow["Discharge workflow UI 🟢"]
    W1["/hmis/admission/:id/discharge"]
    W2["/hmis/discharge-board"]
    W3["DischargeWorkflow.tsx"]
  end

  subgraph APIs["APIs"]
    A1["GET/PUT /api/v1/adt/discharge/readiness/:id"]
    A2["POST /api/v1/discharge/draft"]
    A3["POST /api/v1/discharge/sign"]
    A4["POST /api/v1/adt/discharge → A03"]
  end

  subgraph Exit["Patient exit"]
    E1["{Display} /display/discharge-status"]
    E2["Insurance claims /discharge"]
    E3["/patient/care-journey follow-up"]
  end

  R1 & R2 & R3 & R4 & R5 & R6 --> W1
  W1 --> W3 --> A1 --> A2 --> A3 --> A4
  A4 --> E1 --> E2 --> E3
```

**Discharge gate:** `POST /api/v1/adt/discharge` blocks until mandatory readiness dimensions are complete (override roles: `medical_director`, `discharge_officer`).

---

## 6. Operations charts

### 6.1 Department operations map

Who does what, when, on which screen.

```mermaid
flowchart TB
  subgraph Front["Front office & access"]
    FO1["Reception / queue console<br/>/hospital/queue-console"]
    FO2["Insurance desk<br/>/insurance-desk/*"]
    FO3["Kiosk zone<br/>/kiosk/checkin"]
  end

  subgraph Clinical["Clinical departments"]
    C1["OPD doctors<br/>/doctor/* + queue panel"]
    C2["ER team<br/>/hospital/er/queue"]
    C3["Ward nurses<br/>/hmis/* · /ward/*"]
    C4["ICU team<br/>/icu/*"]
    C5["OT team<br/>/hmis/ot/* · /ot/*"]
  end

  subgraph Support["Support services"]
    S1["Lab / radiology<br/>orders from practice API"]
    S2["Pharmacy<br/>eMAR → dispense 🟡"]
    S3["Billing / finance<br/>HMIS estimates 🟢 · portal UI 🔴"]
  end

  subgraph Command["Command & visibility"]
    X1["Command centre<br/>/display/command"]
    X2["Floor map<br/>/display/floor-map"]
    X3["Display admin<br/>/display/admin"]
  end

  FO3 --> FO1
  FO1 --> C1
  FO3 --> C2
  C1 -->|admit| C3
  C2 -->|admit| C3
  C3 --> C4
  C3 --> C5
  C3 --> S1
  C3 --> S2
  C3 --> S3
  C1 & C2 & C3 & C4 & C5 --> X1
  X3 --> FO3
```

---

### 6.2 Queue operations (Smart Queue OS)

```mermaid
stateDiagram-v2
  [*] --> waiting: checkIn (kiosk / API)
  waiting --> called: doctor/staff callNext
  called --> serving: startServing
  serving --> completed: completeEntry
  called --> no_show: markNoShow
  waiting --> waiting: reorderEntry (priority)
  completed --> [*]
  no_show --> [*]

  note right of waiting
    SSE: queue_token_issued
    Notify: WhatsApp/SMS
    Display: /display/queue
  end note

  note right of called
    SSE: queue_token_called
    TTS on OPD board
  end note
```

| Operation | Role | API |
|-----------|------|-----|
| Issue token | Kiosk / reception | `POST /api/display/kiosk/register` or `check-in` |
| View board | Public display | `GET /api/v1/queue/board` |
| Call patient | Doctor | `PATCH /api/v1/queue/:id/call` |
| Start consult | Doctor | `PATCH /api/v1/queue/:id/start` |
| Complete | Doctor | `PATCH /api/v1/queue/:id/complete` |
| Console override | Reception | `GET /api/v1/queue/console`, `PATCH .../call-staff` |
| Analytics | Admin | `GET /api/v1/queue/analytics/hospital` |

---

### 6.3 ADT event timeline (inpatient operations)

```mermaid
gantt
  title Inpatient ADT event timeline (typical 3-day stay)
  dateFormat  YYYY-MM-DD
  axisFormat  %d %b

  section Access
  OPD consult or ER arrival     :a1, 2026-01-01, 1d
  Bed reserve + pre-auth         :a2, 2026-01-01, 1d

  section ADT
  A01 Admit                      :milestone, m1, 2026-01-01, 0d
  Nursing admission assessment   :b1, 2026-01-01, 1d
  eMAR active                    :b2, 2026-01-01, 3d

  section Procedures
  OT procedure optional          :c1, 2026-01-02, 1d

  section Discharge
  Readiness dimensions           :d1, 2026-01-03, 1d
  Discharge summary signed       :milestone, m2, 2026-01-03, 0d
  A03 Discharge + bed free       :milestone, m3, 2026-01-03, 0d
```

| HL7 ADT | MediQzy event | API | Bed state |
|---------|---------------|-----|-----------|
| A01 | Admit | `POST /api/v1/adt/admit` | Occupied |
| A02 | Transfer | `POST /api/v1/adt/transfer` | Reassigned |
| A03 | Discharge | `POST /api/v1/adt/discharge` | Available |
| A11 | Cancel admit | `POST /api/v1/adt/cancel` | Released |

---

### 6.4 Display & kiosk touchpoints by journey stage

| Journey stage | Patient sees | Staff sees | APIs / events |
|---------------|--------------|------------|---------------|
| Arrival | `{Display}` signage `/display/signage` | Floor map `/display/floor-map` | CMS schedules |
| Registration | `/kiosk/checkin` | Queue console `/hospital/queue-console` | kiosk register APIs |
| OPD wait | `/display/queue` | Doctor queue panel | SSE `queue_token_*` |
| ER wait | `/display/er-triage` | `/hospital/er/queue` | ER queue + vitals |
| Ward stay | `/display/bedside` | `/display/ward` | nurse call, vitals |
| ICU | — | `/display/icu-board` | MQTT → `vitals_update` |
| OT | Family waiting area | `/display/ot-status` | OT status API |
| Family visit | `/kiosk/family-video` | Bedside video overlay | LiveKit sessions |
| Discharge | `/display/discharge-status` | `/hmis/discharge-board` | readiness APIs |
| Command | — | `/display/command` | census + KPIs |

```mermaid
flowchart LR
  subgraph Building["Hospital floor — display zones"]
    direction TB
    L[Lobby<br/>signage · floor-map · kiosk]
    O[OPD<br/>queue board · check-in kiosk]
    E[ER<br/>triage kiosk · ER board]
    W[Wards<br/>bedside · nursing station]
    I[ICU<br/>vitals board]
    T[OT<br/>status door display]
    C[Command centre<br/>KPI wall]
  end

  L --> O
  L --> E
  O --> W
  E --> W
  E --> I
  W --> T
  W & I & T --> C
```

---

### 6.5 Role responsibility matrix (RACI summary)

| Activity | Reception | Nurse | Doctor | OT | Billing | Insurance | Patient |
|----------|:---------:|:-----:|:------:|:--:|:-------:|:---------:|:-------:|
| Kiosk check-in | I | — | — | — | — | — | **R** |
| Queue call | **R** | C | **A** | — | — | — | I |
| OPD consult | I | — | **R** | — | — | — | **R** |
| Bed reservation | C | I | C | — | — | C | I |
| ADT admit | C | **R** | **A** | — | I | C | I |
| eMAR administer | — | **R** | **A** | — | — | — | I |
| OT procedure | — | C | **A** | **R** | — | — | I |
| Discharge readiness | I | **R** | **A** | — | **R** | C | **R** |
| ADT discharge | C | C | **A** | — | **R** | C | I |

**R** = Responsible · **A** = Accountable · **C** = Consulted · **I** = Informed

---

### 6.6 Insurance & billing operations overlay

```mermaid
flowchart TD
  subgraph Cash["Cash / self-pay"]
    CS1[Consult charges] --> CS2[HMIS billing estimate]
    CS2 --> CS3[Payment at counter]
  end

  subgraph Insured["Insured patient"]
    IN1[Pre-auth at admission<br/>/api/v1/insurance/preauth]
    IN2[During stay — package tracking]
    IN3[Discharge clearance<br/>readiness dimension: tpa]
    IN4[Claim submission<br/>/api/hospital/insurance/*]
  end

  subgraph DischargeGate["Discharge gate"]
    DG1{billing dimension clear?}
    DG2{TPA clear if insured?}
    DG3["POST /api/v1/adt/discharge"]
  end

  IN1 --> IN2 --> IN3 --> IN4
  CS2 --> DG1
  IN3 --> DG2
  DG1 --> DG3
  DG2 --> DG3
```

---

## 7. End-to-end swimlane — elective surgery patient (7-day path)

Example: planned cholecystectomy with insurance.

| Day | Patient action | Operations / clinical | System touchpoints |
|-----|----------------|----------------------|-------------------|
| D-7 | Books pre-op OPD | Surgeon consult | `/appointments`, `/doctor/*` |
| D-3 | Insurance desk visit | Pre-auth submitted | `/insurance-desk`, `POST /api/v1/insurance/preauth` |
| D-1 | Arrives for pre-admission | Bed reserved, labs | `/hospital/adt/admit`, `POST /api/v1/beds/reserve` |
| D0 AM | Admission | Nursing intake, consent | `POST /api/v1/adt/admit`, `/hmis/admission/:id/nursing-tasks` |
| D0 PM | OT | WHO checklist, anesthesia | `/hmis/ot/command-center`, `{Display}` `/display/ot-status` |
| D0 post | Recovery ward | eMAR, vitals | `/hmis/emar`, `/display/ward` |
| D1 | Ward stay | Mobilisation, diet | Bedside `/display/bedside`, nurse call API |
| D2 | Discharge prep | Med rec, education | `/hmis/admission/:id/discharge`, readiness APIs |
| D2 PM | Exit | Summary + claim | `POST /api/v1/adt/discharge`, `{Display}` `/display/discharge-status` |

```mermaid
journey
  title Elective surgery patient journey
  section Pre-admission
    Book consult: 5: Patient
    Pre-auth approval: 4: Insurance desk
    Bed reservation: 5: Ward clerk
  section Admission day
    ADT admit: 5: Nurse, Doctor
    OT procedure: 3: Patient
    Recovery: 2: Patient
  section Discharge
    Readiness checklist: 4: Nurse, Billing
    Go home: 5: Patient
```

---

## 8. API quick reference (by workflow phase)

| Phase | Primary routes |
|-------|----------------|
| Identity / kiosk | `/api/display/kiosk/*`, `/api/abdm/kiosk/*`, `/api/display/checkin/*` |
| Queue | `/api/v1/queue/*`, `/api/display/queue`, `/api/display/events` |
| Appointments | `/api/enhanced-appointments/*` |
| ADT | `/api/v1/adt/*` |
| Beds | `/api/v1/beds/*` |
| Nursing | `/api/v1/nursing/*`, `/api/v1/echart/*` |
| eMAR | `/api/v1/emar/*` |
| ER | `/api/v1/er/*`, `/api/display/kiosk/er-triage` |
| OT | `/api/v1/ot/*`, `/api/v1/anesthesia/*` |
| ICU | `/api/v1/icu/*` |
| Discharge | `/api/v1/discharge/*`, `/api/v1/adt/discharge/readiness/*` |
| Billing | `/api/v1/billing/estimate/*` |
| Insurance | `/api/hospital/insurance/*`, `/api/v1/insurance/preauth` |
| Displays | `/api/display/*` (board, command, floor-map, video, nurse-call) |

---

## 9. Implementation maturity (June 2026)

| Workflow segment | Status | Notes |
|------------------|--------|-------|
| Scheduled OPD booking → kiosk → queue → consult | 🟢 Live | Unified queue + SSE |
| Walk-in kiosk registration + UHID | 🟢 Live | QR, photo, ABHA, notify |
| ER kiosk AI triage + video | 🟢 Live | SaMD quality gates on ESI |
| HMIS ADT / beds / eMAR / nursing | 🟢 Backend + key UIs | Jest tests exist |
| OT scheduling + command center | 🟢 Backend | Display board 🟡 |
| Discharge readiness + ADT A03 | 🟢 Live | 6-dimension checklist |
| Insurance / TPA | 🟢 ~85% | Claims + pre-auth |
| ER staff queue (`er_visits`) | 🟡 Partial | Migration GAP-IPD-005 |
| Ward / OT / discharge **displays** | 🟡 Partial | Demo fallback if DB empty |
| Hospital portal beds/billing sidebar | 🔴 Scaffold | Use HMIS routes |
| eMAR → pharmacy dispense loop | 🟡 Open | GAP-IPD-004 |
| Admit→discharge Playwright E2E | 🔴 Open | GAP-QA-001 |

---

## 10. Print-friendly checklist (operations lead)

Use this for go-live walkthroughs.

- [ ] Kiosk devices enrolled in `/display/admin` with `x-device-token`
- [ ] Migration applied: `node server/migrations/20260617-hospital-queue-os.migration.js`
- [ ] HMIS migrations: `node server/run-hmis-migrations.js`
- [ ] OPD board `/display/queue` shows live tokens on SSE
- [ ] Queue console `/hospital/queue-console` can call patients
- [ ] Doctor panel uses `/api/v1/queue` (not legacy `/api/doctor/queue`)
- [ ] Bed map `/hmis/beds/map` reflects real allocations
- [ ] eMAR due list populates on `/hmis/emar`
- [ ] Discharge board shows readiness dimensions
- [ ] Command centre `/display/command` shows census KPIs
- [ ] MQTT_BROKER_URL set if ICU live vitals required

---

## Document history

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-06-17 | Initial patient + operations workflow charts for Hospital OS |
