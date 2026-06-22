# MediQzy — Complete Hospital Module Workflows (Admission → Discharge)

**Version:** 1.0  
**Date:** 2026-06-17  
**Audience:** Hospital operations, clinical directors, IT, implementation teams  
**Scope:** End-to-end flows across **all** MediQzy hospital modules — OPD, ER, admission, ward, ICU, OT, lab, radiology, pharmacy, insurance, billing, MRD, blood bank, dietary, CSSD, procurement, finance, displays, and command centre.

**Companion docs:** [MEDIQZY_HOSPITAL_OS_WORKFLOW_CHARTS.md](./MEDIQZY_HOSPITAL_OS_WORKFLOW_CHARTS.md) (kiosk/display focus) · [GREENFIELD_HOSPITAL_GAPS_IMPLEMENTATION.md](./GREENFIELD_HOSPITAL_GAPS_IMPLEMENTATION.md) (gap IDs) · [MEDIQZY_GREENFIELD_PAPERLESS_AI_FLOWS.md](./MEDIQZY_GREENFIELD_PAPERLESS_AI_FLOWS.md) (paperless + AI copilots)

**Legend:** 🟢 Live API + wired UI · 🟡 Partial · 🔴 Scaffold / demo data

**Critical rule:** For **inpatient clinical truth**, use `/hmis/*`, `/ward/*`, `/api/v1/*`. Do **not** use `/hospital/beds`, `/hospital/billing`, `/hospital/opd-ipd` for production IPD — those pages use localStorage placeholders.

---

## 1. Hospital module map (all departments)

```mermaid
flowchart TB
  subgraph Access["Access & routing"]
    Q[Queue / Kiosk / Displays 🟢]
    APT[Appointments 🟢]
  end

  subgraph Acute["Acute & emergency"]
    ER[ER 🟡]
    ADT[Admission ADT 🟢]
  end

  subgraph Clinical["Clinical care"]
    DOC[Doctor / OPD 🟢]
    WARD[Ward / IPD 🟢]
    ICU[ICU 🟡]
    OT[OT 🟡]
    NUR[Nursing + eMAR 🟢]
  end

  subgraph Diagnostic["Diagnostics"]
    LAB[Lab pathology 🟡]
    RIS[Radiology RIS 🟢]
  end

  subgraph Therapeutic["Therapeutics & support"]
    PHARM[Pharmacy 🟡]
    BB[Blood bank 🟡]
    DIET[Dietary 🟡]
    CSSD[CSSD 🟡]
  end

  subgraph Records["Records & compliance"]
    MRD[MRD / EHR 🟡]
    CONSENT[Consent 🟡]
    QC[Quality NABH 🟡]
  end

  subgraph Financial["Financial"]
    INS[Insurance / TPA 🟢]
    BILL[Billing / estimates 🟡]
    FIN[Finance / accounts 🔴]
    PROC[Procurement 🟡]
  end

  subgraph Exit["Exit & continuity"]
    DC[Discharge 🟢]
    FU[Follow-up / recovery 🟢]
  end

  subgraph Command["Command"]
    HMIS[HMIS command centre 🟢]
    DISP[Display command 🟢]
  end

  Q --> DOC & ER
  APT --> Q --> DOC
  ER --> ADT
  DOC -->|orders| LAB & RIS & PHARM & OT
  DOC -->|convert OP→IP| ADT
  ADT --> INS --> WARD
  WARD --> ICU & OT & NUR
  NUR --> PHARM & DIET
  OT --> CSSD & ICU
  WARD --> LAB & RIS & BB
  WARD & OT & LAB & PHARM --> BILL
  INS --> BILL --> DC
  WARD & DOC --> MRD --> DC
  DC --> FU
  WARD & ICU & OT & ER --> HMIS & DISP
```

---

## 2. Master timeline — one patient, all modules

| Phase | Modules involved | Primary routes | Key APIs |
|-------|------------------|----------------|----------|
| **0. Arrival** | Queue, Kiosk, Displays | `/kiosk/checkin`, `/display/queue` | `/api/v1/queue`, `/api/display/kiosk/*` |
| **1. Registration** | Hospital practice, ABDM, MRD | `/hospital/practice-management` | `/api/hospital/practice/patients`, `/api/abdm/kiosk` |
| **2. OPD consult** | Doctor, Scribe, Orders | `/doctor/*`, `/hospital/prescription-creator` | `/api/doctor/clinical-workflow`, `/api/hospital/practice/*` |
| **3. ER (if acute)** | ER, AI triage, Displays | `/hospital/er/queue`, `/kiosk/er-triage` | `/api/v1/er/*`, `/api/display/kiosk/er-triage` |
| **4. Insurance pre-auth** | Insurance portal, HMIS preauth | `/hospital/:slug/insurance/pre-auth` | `/api/hospital/insurance/*`, `/api/v1/insurance/preauth` |
| **5. Admission** | ADT, Beds | `/hospital/adt/admit`, `/hmis/beds/map` | `/api/v1/adt/admit`, `/api/v1/beds/allocate` |
| **6. Inpatient care** | Ward, Nursing, eMAR, Vitals | `/hospital/ward`, `/hmis/emar` | `/api/v1/nursing/*`, `/api/v1/emar/*`, `/api/v1/vitals/*` |
| **7. ICU (if critical)** | ICU portal, vitals bridge | `/icu/*`, `/display/icu-board` | `/api/v1/icu/*`, MQTT→SSE |
| **8. OT (if surgical)** | OT command, CSSD | `/hmis/ot/command-center`, `/ot/*` | `/api/v1/ot/*`, `/api/cssd/*` |
| **9. Diagnostics** | Lab, RIS | `/lab/*`, `/hospital/lab-order` | `/api/lab/ris/*`, `/api/hospital/practice/lab-orders` |
| **10. Pharmacy** | Pharmacy, eMAR dispense | `/pharmacy/*`, `/hmis/emar` | `/api/pharmacy/*`, `/api/v1/emar/administer` |
| **11. Blood / diet** | Blood bank, Dietary | `/blood-bank/*`, `/dietary/*` | `/api/blood-bank/*`, `/api/dietary/*` |
| **12. Billing** | HMIS estimates, insurance | `/billing/*` | `/api/v1/billing/estimate`, `/api/billing/*` |
| **13. MRD** | Records, discharge summary | `/hospital/mrd`, `/hospital/discharge-summary` | `/api/hospital/practice/mrd/*`, `/api/v1/discharge/*` |
| **14. Discharge** | Readiness, ADT A03 | `/hmis/discharge-board` | `/api/v1/adt/discharge`, readiness APIs |
| **15. Claims & follow-up** | Insurance, recovery | `/hospital/insurance-claims` | `/api/hospital/insurance/claims`, `/api/v1/follow-up/*` |

```mermaid
flowchart LR
  A[Arrival] --> B[OPD or ER]
  B --> C{Admit?}
  C -->|No| Z[OPD billing + home]
  C -->|Yes| D[Pre-auth + bed]
  D --> E[Ward care loop]
  E --> F[Lab / Rx / OT / ICU]
  F --> E
  E --> G[MRD + billing clearance]
  G --> H[Discharge A03]
  H --> I[Claims + follow-up]
```

---

## 3. Module workflows (detailed)

### 3.1 Queue · Kiosk · Displays 🟢

| UI | API |
|----|-----|
| `/kiosk/checkin`, `/kiosk/er-triage`, `/hospital/queue-console` | `/api/v1/queue/*`, `/api/display/*` |
| `/display/queue`, `/display/er-triage`, `/display/ward`, `/display/icu-board`, `/display/ot-status`, `/display/bedside`, `/display/command` | SSE `/api/display/events` |

```mermaid
flowchart TD
  A[Patient arrives] --> B{Entry type}
  B -->|Appointment| C[/kiosk/checkin QR or phone/]
  B -->|Walk-in| D[/kiosk/register/]
  B -->|ER| E[/kiosk/er-triage/]
  C --> F[Token A-###]
  D --> F
  E --> G[Token ER-### + ESI]
  F --> H[/display/queue SSE/]
  G --> I[/display/er-triage/]
  H --> J[Doctor /api/v1/queue/my]
  I --> K[/hospital/er/queue/]
```

**Hands off to:** Doctor OPD, ER staff, billing (OPD counter).

---

### 3.2 Doctor · OPD · Clinical orders 🟢

| UI | API |
|----|-----|
| `/doctor/*`, `/smart-opd`, `/hospital/practice-management` | `/api/doctors/*`, `/api/doctor/clinical-workflow/*` |
| `/hospital/prescription-creator`, `/hospital/lab-order`, `/hospital/imaging-order`, `/hospital/procedure-adder` | `/api/hospital/practice/prescriptions`, `lab-orders`, `imaging-orders`, `procedures/schedule` |

```mermaid
sequenceDiagram
  participant P as Patient
  participant Q as Queue
  participant D as Doctor
  participant O as Orders hub

  P->>Q: Check-in token
  Q->>D: Call patient
  D->>D: SOAP note + AI scribe
  D->>O: Lab order
  D->>O: Imaging order
  D->>O: Prescription
  D->>O: OT procedure schedule
  alt Admit required
    D->>ADT: POST /api/v1/adt/convert-op-to-ip
  else OPD complete
    D->>Billing: Practice tariffs / checkout
  end
```

**Hands off to:** Lab, RIS, Pharmacy, OT, ADT, Insurance.

---

### 3.3 ER — Emergency 🟡

| UI | API |
|----|-----|
| `/hospital/er/queue`, `/kiosk/er-triage`, `/display/er-triage` | `/api/v1/er/register`, `/queue`, `/triage/:id`, `/emergency-ot`, `/convert-to-ip` |

```mermaid
flowchart TD
  A[ER arrival] --> B{Registration path}
  B -->|Kiosk| C[AI ESI triage + queue token]
  B -->|Staff| D[POST /api/v1/er/register]
  C --> E[/display/er-triage/]
  D --> E
  E --> F{Disposition}
  F -->|Treat & release| G[ER discharge instructions]
  F -->|Emergency OT| H[POST /api/v1/er/emergency-ot]
  F -->|Admit| I[POST /api/v1/adt/er-to-ip]
  H --> OT[OT module]
  I --> ADT[Admission module]
```

**Hands off to:** ADT, OT, ICU, Billing, MRD (MLC docs).

---

### 3.4 Admission · ADT · Beds 🟢

| UI | API |
|----|-----|
| `/hospital/adt/admit`, `/hospital/adt/er-to-ip`, `/hmis/beds/map`, `/hospital/ward` | `/api/v1/adt/admit`, `/transfer`, `/discharge`, `/convert-op-to-ip`, `/er-to-ip` |
| | `/api/v1/beds/allocate`, `/reserve`, `/map`, `/census` |

```mermaid
flowchart TD
  A[Admission request] --> B{Type}
  B -->|Elective| C[Bed reserve POST /beds/reserve]
  B -->|ER| D[Emergency bypass token]
  B -->|OP converted| E[From consult convert-op-to-ip]
  C --> F[POST /api/v1/adt/admit A01]
  D --> F
  E --> F
  F --> G[ip_admissions + bed occupied]
  G --> H[Init discharge readiness checklist]
  H --> I[Ward / ICU / OT routing]
```

**Hands off to:** Insurance pre-auth, Ward, ICU, OT, Dietary auto-order, MRD file opening.

---

### 3.5 Insurance · TPA · Pre-auth 🟢

| UI | API |
|----|-----|
| `/hospital/:slug/insurance/*` (25+ screens) | `/api/hospital/insurance/*` |
| `/hospital/insurance-claims`, `/insurance-desk/*`, `/tpa/*` | `/api/v1/insurance/preauth`, `/api/tpa/*`, `/api/edi/*` |

```mermaid
flowchart LR
  A[Patient identified] --> B[Eligibility 270/271]
  B --> C[Pre-auth at admission]
  C --> D[Clinical documents upload]
  D --> E[Interim enhancement if needed]
  E --> F[Final bill + discharge summary]
  F --> G[Claim 837 submit]
  G --> H[ERA 835 reconciliation]
  H --> I[Denial / appeal loop]
```

**Discharge gate:** Readiness dimension `tpa` + `billing` must clear before `POST /api/v1/adt/discharge` (unless override role).

**Hands off to:** Billing, MRD, Finance.

---

### 3.6 Ward · Nursing · eMAR · Vitals 🟢

| UI | API |
|----|-----|
| `/hospital/ward`, `/hmis/emar`, `/hmis/admission/:id/nursing-tasks`, `/hmis/admission/:id/echart` | `/api/v1/nursing/*`, `/api/v1/emar/*`, `/api/v1/vitals/*`, `/api/v1/echart/*` |
| `/nurse/*`, `/display/ward`, `/display/bedside` | `/api/display/bedside/nurse-call`, `/api/display/ward` |

```mermaid
flowchart TD
  A[Post-admit] --> B[Nursing admission assessment]
  B --> C[Auto-generated task board]
  C --> D[Vitals + EWS charting]
  D --> E[eMAR: due meds → administer + barcode]
  E --> F{Alert?}
  F -->|Yes| G[Clinical alerts / ICU consult]
  F -->|No| H[Continue care plan]
  G --> ICU
  H --> I[Handoff notes → discharge prep]
```

**Hands off to:** Pharmacy (eMAR), Lab (nursing collects), ICU transfer, Discharge readiness.

---

### 3.7 ICU 🟡

| UI | API |
|----|-----|
| `/icu/*`, `/hmis/patient/:id/workspace`, `/display/icu-board` | `/api/v1/icu/admit`, `/census`, `/:id/ventilator`, `/drips`, `/scores` |
| | `/api/display/icu-board` + MQTT `vitals_update` SSE |

```mermaid
flowchart TD
  A[Ward/ER deteriorates] --> B[ICU admit POST /api/v1/icu/admit]
  B --> C[Ventilator + drip charting]
  C --> D[Daily goals + severity scores]
  D --> E[Event log + alerts]
  E --> F{Outcome}
  F -->|Step-down| G[Ward transfer ADT]
  F -->|OT emergency| H[ER emergency-ot path]
  F -->|Death| I[Mortuary + MRD medico-legal]
```

---

### 3.8 OT — Operation Theatre 🟡

| UI | API |
|----|-----|
| `/hmis/ot/command-center`, `/hmis/ot/:id/anesthesia`, `/ot/*`, `/display/ot-status` | `/api/v1/ot/book`, `/cases/today`, `/:id/checklist`, `/consumables`, `/implants`, `/operative-note` |
| | `/api/v1/anesthesia/assessment`, `/api/v1/er/emergency-ot` |

```mermaid
flowchart TD
  A[Case scheduled] --> B[POST /api/v1/ot/book]
  B --> C[Pre-op consent + WHO checklist]
  C --> D[Anesthesia assessment]
  D --> E[CSSD instrument release]
  E --> F[Intra-op: consumables + implants scan]
  F --> G[Operative note + sign]
  G --> H[Post-op → ward or ICU]
  H --> I[Billing sync POST /billing/estimate/:id/sync-ot]
  I --> J[Family notification]
```

**Hands off to:** CSSD, ICU, Ward, Billing, MRD operative record.

---

### 3.9 Lab — Pathology 🟡

| UI | API |
|----|-----|
| `/lab/*`, `/hospital/lab-order`, `/hospital/lab-reports` | `/api/labs/*`, `/api/lab-tests/*`, `/api/hospital/practice/lab-orders` |
| | `/api/v1/lab-rules/*` (critical value rules) |

```mermaid
flowchart LR
  A[Doctor/hospital order] --> B[Order received]
  B --> C[Sample collection]
  C --> D[Processing + QC]
  D --> E[Results + abnormal flags]
  E --> F[Report PDF + FHIR DiagnosticReport]
  F --> G[Doctor alert + MRD attach]
  G --> H[Lab billing line item]
```

**OPD path:** `/hospital/lab-order` → practice API 🟢  
**Lab portal sub-pages:** many 🟡 scaffold

---

### 3.10 Radiology · RIS · PACS 🟢

| UI | API |
|----|-----|
| `/lab/ris`, `/lab/imaging`, `/hospital/imaging-order`, `/doctor/imaging` | `/api/lab/ris/*`, `/api/hypergrid/dicom/*`, `/api/hospital/practice/imaging-orders` |

```mermaid
flowchart TD
  A[Imaging order] --> B[Study scheduled]
  B --> C[DICOM upload / PACS]
  C --> D[Radiologist QC + report]
  D --> E{Critical finding?}
  E -->|Yes| F[Critical alert → doctor + ER]
  E -->|No| G[Report to MRD + insurance]
```

---

### 3.11 Pharmacy 🟡

| UI | API |
|----|-----|
| `/pharmacy/*`, `/hospital/pharmacy` | `/api/pharmacy/*` (inventory, POS, prescriptions, batches) |
| `/hmis/emar` (IPD admin) | `/api/v1/emar/administer`, `/api/hospital/practice/pharmacy/*` |

```mermaid
flowchart TD
  A[Rx source] --> B{Channel}
  B -->|OPD| C[Practice prescription → pharmacy POS]
  B -->|IPD| D[eMAR order → ward administer]
  C --> E[Stock deduct + invoice]
  D --> E
  E --> F[Insurance non-payable check]
  F --> G[Billing charge posted]
```

**Gap:** eMAR → pharmacy dispense auto-loop (GAP-IPD-004) 🟡

---

### 3.12 Billing · Finance · Accounts 🟡/🔴

| UI | API | Status |
|----|-----|--------|
| `/api/v1/billing/estimate/*` | HMIS IP estimates | 🟢 |
| `/api/billing/*`, `/billing/checkout` | Patient commerce billing | 🟢 |
| `/hospital/billing` | — | 🔴 localStorage scaffold |
| `/finance/*`, `/accounts/*` | `/api/finance/login` only | 🔴 scaffold UI |

```mermaid
flowchart TD
  A[Admission] --> B[Cost estimate created]
  B --> C[Running charges: bed-day, OT sync, lab, pharmacy]
  C --> D[Non-payable item flagging]
  D --> E[Insurance package vs actual]
  E --> F[Final bill generation]
  F --> G{Payment}
  G -->|Cash| H[Razorpay / counter]
  G -->|Insured| I[Claim amount + patient share]
  H & I --> J[Discharge billing dimension clear]
```

---

### 3.13 MRD — Medical Records 🟡

| UI | API |
|----|-----|
| `/hospital/mrd`, `/hospital/ehr`, `/hospital/discharge-summary`, `/hospital/ip-sheets` | `/api/hospital/practice/medical-records`, `/mrd/digitization-queue`, `/discharge-summaries`, `/ehr/:patientId` |
| `/mrd/*` standalone portal | Demo data 🔴 |

```mermaid
flowchart TD
  A[Admission] --> B[MRD file opened / UHID linked]
  B --> C[Inpatient chart accumulation]
  C --> D[Lab + radiology reports filed]
  D --> E[Discharge summary draft]
  E --> F[ICD coding]
  F --> G[Digitization queue]
  G --> H[Record release / medico-legal hold]
  H --> I[Insurance claim attachment]
```

---

### 3.14 Discharge 🟢

| UI | API |
|----|-----|
| `/hmis/admission/:id/discharge`, `/hmis/discharge-board`, `/hospital/discharge-summary` | `/api/v1/adt/discharge/readiness/*`, `/api/v1/discharge/draft|sign|packet` |
| `/display/discharge-status` | `/api/display/discharge-status` |

**Readiness dimensions:** clinical · nursing_education · medication_reconciliation · billing · tpa (optional) · discharge_summary

```mermaid
flowchart TD
  A[Discharge planned] --> B[Clinical sign-off]
  B --> C[Nursing education complete]
  C --> D[Med reconciliation]
  D --> E[Billing cleared]
  E --> F[TPA cleared if insured]
  F --> G[Discharge summary signed]
  G --> H[POST /api/v1/adt/discharge A03]
  H --> I[Bed freed + display update]
  I --> J[Follow-up scheduled]
```

---

### 3.15 Blood Bank 🟡

| UI | API |
|----|-----|
| `/blood-bank/*`, `/display/blood-bank` | `/api/blood-bank/*` (donors, inventory, requisitions, cross-match) |

```mermaid
flowchart LR
  A[Donor registration] --> B[Collection + testing]
  B --> C[Inventory unit]
  C --> D[Ward/OT requisition]
  D --> E[Cross-match]
  E --> F[Issue to patient]
  F --> G[Transfusion documented in eChart]
```

---

### 3.16 Dietary 🟡

| UI | API |
|----|-----|
| `/dietary/*` | `/api/dietary/*` (orders from admission, allergy check, kitchen release) |

```mermaid
flowchart LR
  A[ADT admit] --> B[Auto diet order from admission]
  B --> C[Allergy / NPO rules]
  C --> D[Kitchen production list]
  D --> E[Tray delivery tracking]
  E --> F[Patient feedback → billing optional]
```

---

### 3.17 CSSD 🟡

| UI | API |
|----|-----|
| `/cssd/*` | `/api/cssd/*` (sets, sterilization cycles, release) |

```mermaid
flowchart LR
  A[OT/ward returns instruments] --> B[CSSD receive job]
  B --> C[Sterilization cycle]
  C --> D[Biological indicator QC]
  D --> E[Release to OT for next case]
```

---

### 3.18 Procurement · Stores 🟡

| UI | API |
|----|-----|
| `/procurement/*` | `/api/procurement/*` (vendors, PO, approvals, GRN, ledger) |

Feeds pharmacy, lab, CSSD, biomedical stock replenishment.

---

### 3.19 Support departments 🔴 scaffold UI

| Module | UI | Backend |
|--------|-----|---------|
| Mortuary | `/mortuary/*` | Login only |
| Infection control | `/infection-control/*` | Login only |
| Finance dept | `/finance/*` | Login only |
| Asset | `/asset/*` | Login only |
| HR | `/hr/*` | Payroll separate |

---

### 3.20 HMIS Command · Analytics 🟢

| UI | API |
|----|-----|
| `/hmis/command-center`, `/hmis/discharge-board`, `/display/command` | `/api/v1/analytics/*`, `/api/v1/ai-ops/*`, `/api/v1/ai-revenue/*` |

Cross-module dashboards: census, bed pressure, OT utilisation, revenue leakage, HL7 monitor, follow-up compliance.

---

## 4. Cross-module integration matrix

| From → To | Trigger | API / mechanism |
|-----------|---------|----------------|
| Queue → Doctor | Token called | `/api/v1/queue/:id/call` + SSE |
| Doctor → Lab | Lab order | `POST /api/hospital/practice/lab-orders` |
| Doctor → RIS | Imaging order | `POST /api/hospital/practice/imaging-orders` |
| Doctor → Pharmacy | Rx | `POST /api/hospital/practice/prescriptions` |
| Doctor → OT | Schedule procedure | `POST /api/hospital/practice/procedures/schedule` |
| Doctor → ADT | Admit decision | `POST /api/v1/adt/convert-op-to-ip` |
| ER → ADT | Admit from ER | `POST /api/v1/adt/er-to-ip` |
| ADT → Insurance | Admission | `POST /api/v1/insurance/preauth` |
| ADT → Dietary | Admit event | `POST /api/dietary/orders/from-admission` |
| Ward → ICU | Clinical deterioration | `POST /api/v1/icu/admit` |
| OT → Billing | Case complete | `POST /api/v1/billing/estimate/:id/sync-ot` |
| eMAR → Pharmacy | Dispense | GAP — manual today |
| All clinical → MRD | Documents | Practice EHR + discharge APIs |
| Billing + MRD → Discharge | Clearance | Readiness dimensions |
| Discharge → Insurance | Claim | `/api/hospital/insurance/claims` |
| HMIS → Displays | Real-time | `/api/display/*` + SSE |

---

## 5. Role-based swimlane (operations view)

```mermaid
flowchart TB
  subgraph Reception["Reception / front desk"]
    R1[Kiosk / queue console]
    R2[Appointment lookup]
    R3[Insurance desk routing]
  end

  subgraph Clinical["Clinical"]
    C1[Doctor consult + orders]
    C2[ER triage + disposition]
    C3[Surgeon OT]
  end

  subgraph Nursing["Nursing"]
    N1[Assessment + tasks]
    N2[eMAR + vitals]
    N3[Discharge education]
  end

  subgraph Diagnostic["Diagnostics"]
    D1[Lab sample → report]
    D2[Radiology report]
  end

  subgraph Ancillary["Ancillary"]
    A1[Pharmacy dispense]
    A2[Blood issue]
    A3[Diet trays]
    A4[CSSD release]
  end

  subgraph Admin["Admin / finance"]
    F1[Pre-auth / claims]
    F2[Billing clearance]
    F3[MRD coding]
  end

  R1 --> C1 & C2
  C1 --> D1 & D2 & A1 & C3
  C2 --> Nursing
  C3 --> A4 --> Nursing
  Nursing --> D1
  Nursing --> N3
  D1 & D2 & A1 --> F2
  F1 --> Nursing
  F2 & F3 --> Discharge[ADT discharge A03]
```

---

## 6. Route quick reference (all modules)

### Frontend prefixes

| Prefix | Module |
|--------|--------|
| `/hospital/*` | Hospital portal (practice, insurance, ADT entry, ward) |
| `/hmis/*` | Inpatient clinical hub |
| `/doctor/*` | Doctor OPD |
| `/icu/*` | ICU department |
| `/ot/*` | OT department |
| `/lab/*` | Lab + RIS |
| `/pharmacy/*` | Pharmacy |
| `/mrd/*` | MRD portal |
| `/blood-bank/*` | Blood bank |
| `/dietary/*` | Dietary |
| `/cssd/*` | CSSD |
| `/procurement/*` | Procurement |
| `/insurance-desk/*`, `/hospital/:slug/insurance/*` | Insurance |
| `/tpa/*` | TPA |
| `/display/*`, `/kiosk/*` | Displays |
| `/nurse/*` | Nurse mobile |

### Backend HMIS core (`/api/v1/`)

`adt` · `beds` · `nursing` · `emar` · `vitals` · `echart` · `er` · `icu` · `ot` · `anesthesia` · `discharge` · `billing` · `insurance` · `follow-up` · `recovery` · `analytics` · `ai-ops` · `ai-revenue` · `navigation` · `clinical-workspace` · `queue`

---

## 7. Implementation priority for go-live

| Priority | Modules | Why |
|----------|---------|-----|
| P0 | Queue, ADT, Beds, Ward, eMAR, Nursing, Discharge, Doctor orders | Admit→discharge spine |
| P0 | Insurance pre-auth + claims | Revenue cycle |
| P1 | ER, Lab RIS, Pharmacy POS, OT scheduling | Acute + diagnostic loop |
| P1 | MRD discharge summary, Billing estimates | Discharge gate |
| P2 | ICU live portal, Blood bank UI, Dietary UI, CSSD UI | Ancillary completeness |
| P2 | Displays all zones, Command centre | Hospital OS visibility |
| P3 | Finance, Mortuary, Infection control UIs | Scaffold → live APIs |

---

## 8. Document history

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-06-17 | Complete multi-module workflows: doctor, lab, pharmacy, admission, insurance, billing, ER, MRD, OT, ICU, ward, ancillary, command |
