# Mediczy — Healthcare Interoperability Implementation Plan

> **Version:** 1.0 · **Created:** 2026-06-13 · **AI CTO Review:** Approved  
> **Branch:** `prod` · **Tracker:** This document is the authoritative source of truth for all interoperability gap closures.

---

## Table of Contents

1. [Context & Scope](#1-context--scope)
2. [Gap Summary](#2-gap-summary)
3. [GAP-1 — X12N EDI Transactions](#3-gap-1--x12n-edi-transactions)
4. [GAP-2 — Live ABDM/ABHA Integration](#4-gap-2--live-abdmabha-integration)
5. [GAP-3 — NABH/JCI Compliance Framework](#5-gap-3--nabhjci-compliance-framework)
6. [GAP-4 — ISO 27001 Control Registry](#6-gap-4--iso-27001-control-registry)
7. [GAP-5 — SFTP/FTPS File Exchange Adapter](#7-gap-5--sftpftps-file-exchange-adapter)
8. [GAP-6 — MFN Support in HL7 MLLP Gateway](#8-gap-6--mfn-support-in-hl7-mllp-gateway)
9. [GAP-7 — CDA R2 Document Generator](#9-gap-7--cda-r2-document-generator)
10. [GAP-8 — Hospital Login Interop Context](#10-gap-8--hospital-login-interop-context)
11. [Delivery Schedule](#11-delivery-schedule)
12. [Testing Strategy](#12-testing-strategy)
13. [Route Registration Manifest](#13-route-registration-manifest)

---

## 1. Context & Scope

The Mediczy platform scored **81% (29/36)** on the Healthcare Interoperability Workflow diagram audit conducted on 2026-06-13. The platform already has:

- ✅ HL7 v2.5.1 / MLLP gateway (ADT, ORU, ORM, DFT, MDM, SIU, ACK)
- ✅ FHIR R4 full server with SMART on FHIR OAuth2
- ✅ DICOMweb (STOW-RS / WADO-RS / QIDO-RS)
- ✅ Terminology service (SNOMED CT, LOINC, ICD-10/11, CPT, RxNorm)
- ✅ Kafka event bus + MQTT for IoT
- ✅ HIPAA / GDPR / DPDP / SaMD compliance middleware

Eight gaps remain. This document specifies the implementation plan for each, including file structure, API contracts, database schema, and the regulatory standard being satisfied.

---

## 2. Gap Summary

| ID | Description | Priority | Effort | Standard |
|---|---|---|---|---|
| GAP-1 | X12N EDI Transactions (837/835/270/271/278) | 🔴 P1 | 3 weeks | X12N, HIPAA 5010 |
| GAP-2 | Live ABDM/ABHA Integration | 🔴 P1 | 4 weeks | ABDM/NHA India |
| GAP-3 | NABH/JCI Compliance Framework | 🟠 P2 | 2 weeks | NABH 5th Ed., JCI 8th Ed. |
| GAP-4 | ISO 27001 Control Registry | 🟠 P2 | 1 week doc + 3 weeks controls | ISO/IEC 27001:2022 |
| GAP-5 | SFTP/FTPS File Exchange Adapter | 🟡 P3 | 1 week | IHE XDR, batch HL7 |
| GAP-6 | MFN in HL7 MLLP Gateway | 🟡 P3 | 3 days | HL7 v2.5.1 §8 |
| GAP-7 | CDA R2 Document Generator | 🟡 P3 | 1.5 weeks | HL7 CDA R2, ABDM PHR |
| GAP-8 | Hospital Login Interop Context | 🟡 P3 | 2 days | FHIR AuditEvent |

---

## 3. GAP-1 — X12N EDI Transactions

### Business Requirement
Electronic insurance claims, eligibility checks, and remittance advice are mandatory for TPAs and insurers in India (under NHA/IRDAI) and globally (HIPAA 5010 for US-linked entities). Without EDI, claim submission is manual/proprietary and cannot be automated.

### Transactions to Implement

| Transaction | Direction | Use Case |
|---|---|---|
| **270** | Outbound | Eligibility inquiry (does patient have active policy?) |
| **271** | Inbound | Eligibility response (payer confirms coverage, co-pay, benefits) |
| **837P** | Outbound | Professional claim submission (outpatient) |
| **837I** | Outbound | Institutional claim submission (inpatient) |
| **835** | Inbound | Electronic Remittance Advice (payment confirmation, denial reason) |
| **278** | Outbound | Prior authorization request |
| **999/TA1** | Inbound | Functional acknowledgement / interchange ACK |

### Files to Create/Modify

```
server/
  services/
    x12n-edi.service.js          ← Core EDI builder / parser
  routes/
    x12n-edi.route.js            ← REST API wrapper for EDI operations
  migrations/
    x12n-edi.migration.js        ← DB tables: edi_transactions, edi_segments
```

### API Contract

```
POST /api/edi/270              Eligibility inquiry
POST /api/edi/271/receive      Receive payer 271 response
POST /api/edi/837p             Submit professional claim
POST /api/edi/837i             Submit institutional claim
POST /api/edi/835/receive      Receive ERA from payer
POST /api/edi/278              Prior authorization request
GET  /api/edi/transactions     List EDI transaction history
GET  /api/edi/transactions/:id Get single transaction + status
POST /api/edi/validate         Validate raw EDI string
POST /api/edi/parse            Parse raw EDI → JSON
```

### Database Schema

```sql
CREATE TABLE edi_transactions (
  id              BIGSERIAL PRIMARY KEY,
  tenant_id       INTEGER NOT NULL,
  transaction_set VARCHAR(10) NOT NULL,    -- '270','271','837P','837I','835','278'
  direction       VARCHAR(10) NOT NULL,    -- 'outbound','inbound'
  isa_control_num VARCHAR(9) NOT NULL,
  gs_control_num  VARCHAR(9),
  st_control_num  VARCHAR(9),
  sender_id       VARCHAR(15),
  receiver_id     VARCHAR(15),
  raw_edi         TEXT,
  parsed_json     JSONB,
  status          VARCHAR(20) DEFAULT 'pending', -- pending/sent/accepted/rejected/paid
  ack_code        VARCHAR(5),
  ack_message     TEXT,
  patient_id      INTEGER,
  appointment_id  INTEGER,
  claim_amount    NUMERIC(12,2),
  paid_amount     NUMERIC(12,2),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE edi_segments (
  id              BIGSERIAL PRIMARY KEY,
  transaction_id  BIGINT REFERENCES edi_transactions(id),
  segment_id      VARCHAR(10),
  loop_id         VARCHAR(10),
  fields          JSONB,
  seq             INTEGER
);
```

### EDI 270 Eligibility Inquiry — Request Payload (REST wrapper)

```json
{
  "patientId": 42,
  "insurerId": 5,
  "memberId": "POL-2024-123456",
  "serviceDate": "2026-06-15",
  "serviceType": "30"
}
```

### EDI 837P Professional Claim — Request Payload

```json
{
  "appointmentId": 101,
  "patientId": 42,
  "doctorId": 7,
  "diagnosis": ["J06.9"],
  "procedures": [{ "cptCode": "99213", "fee": 500.00 }],
  "insurerId": 5,
  "memberId": "POL-2024-123456",
  "claimType": "837P"
}
```

### Standards Compliance
- ASC X12 005010X279A1 (270/271)
- ASC X12 005010X222A2 (837P)
- ASC X12 005010X223A3 (837I)
- ASC X12 005010X221A2 (835)
- ASC X12 005010X217 (278)
- HIPAA 5010 envelope rules

---

## 4. GAP-2 — Live ABDM/ABHA Integration

### Business Requirement
The Ayushman Bharat Digital Mission (ABDM) mandates that empanelled hospitals and health-tech platforms use live NHA APIs for ABHA ID creation, PHR (Personal Health Records) consent and exchange. Current implementation returns hardcoded mock data.

### Modules to Implement

| Module | NHA API | Description |
|---|---|---|
| ABHA Registration | `POST /v2/registration/aadhaar/generateOtp` | Create ABHA from Aadhaar |
| ABHA Login | `POST /v2/auth/init` | Authenticate with ABHA ID |
| PHR Consent Request | `POST /v0.5/consent-requests/init` | Request patient consent for data access |
| PHR Consent Fetch | `GET /v0.5/consent-requests/{id}` | Poll consent status |
| Health Record Fetch | `POST /v0.5/health-information/fetch` | Pull records via consent artefact |
| Health Record Publish | `POST /v0.5/health-information/notify` | Push health records to HIE-CM |
| Facility Registry | `GET /v1.0/facilities/{id}` | Fetch facility details from HFR |
| Provider Registry | `GET /v1.0/doctors/{id}` | Fetch provider from HPR |

### Files to Create/Modify

```
server/
  services/
    abdm-client.service.js       ← NHA API client (sandbox + production)
    abdm-consent.service.js      ← Consent request lifecycle management
    abdm-phi.service.js          ← PHR FHIR bundle builder/parser
  routes/
    abdm.route.js                ← All ABDM endpoints
  migrations/
    abdm.migration.js            ← abha_registrations, abdm_consents, abdm_phi_requests
```

### Environment Variables Required

```env
ABDM_BASE_URL=https://dev.abdm.gov.in          # sandbox; prod: https://abdm.gov.in
ABDM_CLIENT_ID=<from NHA sandbox credentials>
ABDM_CLIENT_SECRET=<from NHA sandbox credentials>
ABDM_GATEWAY_URL=https://dev.abdm.gov.in/gateway
ABDM_CALLBACK_URL=https://app.mediqzy.com/api/abdm/callback
ABDM_HIP_ID=<Hospital Integration Point ID from NHA>
```

### API Contract (Mediczy-facing)

```
POST /api/abdm/abha/register          Create ABHA via Aadhaar OTP
POST /api/abdm/abha/verify-otp        Verify OTP, receive ABHA card
GET  /api/abdm/abha/:abhaId/profile   Fetch ABHA profile
POST /api/abdm/consent/request        Request PHR consent from patient
GET  /api/abdm/consent/:requestId     Get consent status
POST /api/abdm/callback               NHA gateway callback webhook
POST /api/abdm/phi/fetch              Fetch health records (post-consent)
POST /api/abdm/phi/publish            Publish health record to ABDM
GET  /api/abdm/facility/:hipId        Fetch facility from HFR
POST /api/abdm/verify-mobile          Verify mobile for ABHA creation
```

### Database Schema

```sql
CREATE TABLE abha_registrations (
  id           BIGSERIAL PRIMARY KEY,
  patient_id   INTEGER,
  abha_id      VARCHAR(17) UNIQUE,           -- 14-digit ABHA number
  abha_address VARCHAR(100),                 -- user@abdm
  linked_at    TIMESTAMPTZ DEFAULT NOW(),
  status       VARCHAR(20) DEFAULT 'active'
);

CREATE TABLE abdm_consents (
  id               BIGSERIAL PRIMARY KEY,
  patient_id       INTEGER NOT NULL,
  requester_id     INTEGER,
  consent_request_id VARCHAR(64) UNIQUE,
  artefact_id      VARCHAR(64),
  status           VARCHAR(20) DEFAULT 'REQUESTED',
  purpose          VARCHAR(50),
  hi_types         TEXT[],
  date_range_from  DATE,
  date_range_to    DATE,
  expiry           TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE abdm_phi_requests (
  id               BIGSERIAL PRIMARY KEY,
  consent_id       BIGINT REFERENCES abdm_consents(id),
  transaction_id   VARCHAR(64) UNIQUE,
  direction        VARCHAR(10),     -- 'fetch' | 'publish'
  hi_types         TEXT[],
  status           VARCHAR(20) DEFAULT 'pending',
  fhir_bundle      JSONB,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);
```

### ABHA-in-FHIR Mapping (already in fhir-mapper.service.js, verify)
The existing `mapPatient()` already includes:
```javascript
...(patient.abha_id ? [{ system: 'https://healthid.abdm.gov.in', value: patient.abha_id }] : [])
```
Update: store `abha_id` in `users` table via migration and populate from `abha_registrations`.

---

## 5. GAP-3 — NABH/JCI Compliance Framework

### Business Requirement
Hospitals seeking NABH (5th Edition) or JCI (8th Edition) accreditation need digital evidence of compliance against their quality standards. Currently the compliance dashboard covers HIPAA/GDPR/SaMD only.

### NABH Chapters to Track (5th Edition)

| Chapter | Code | Focus |
|---|---|---|
| Access, Assessment & Continuity of Care | AAC | Triage, assessment, care plan |
| Care of Patients | COP | Medication, high-risk patients |
| Management of Medication | MOM | Drug ordering, dispensing |
| Patient Rights & Education | PRE | Consent, privacy, education |
| Hospital Infection Control | HIC | Infection prevention protocols |
| Continuous Quality Improvement | CQI | Audits, incident reporting |
| Responsibilities of Management | ROM | Policies, governance |
| Facility Management & Safety | FMS | Equipment, fire safety |
| Human Resource Management | HRM | Staff credentials, training |
| Information Management System | IMS | EHR, data protection |

### JCI Chapters to Track (8th Edition)

| Chapter | Code | Focus |
|---|---|---|
| International Patient Safety Goals | IPSG | Patient ID, communication, medication safety |
| Access to Care and Continuity of Care | ACC | Admission, discharge, transfer |
| Patient and Family Rights | PFR | Consent, complaints, ethics |
| Assessment of Patients | AOP | Initial & ongoing assessment |
| Care of Patients | COP | High-risk patients, surgical care |
| Anesthesia and Surgical Care | ASC | Pre-op, intraop, post-op |
| Medication Management and Use | MMU | Formulary, ordering, dispensing |
| Patient and Family Education | PFE | Education effectiveness |
| Quality Improvement and Patient Safety | QPS | QI program, adverse events |
| Prevention and Control of Infections | PCI | Infection rates, surveillance |
| Governance, Leadership, and Direction | GLD | Governance, leadership |
| Facility Management and Safety | FMS | Physical environment |
| Staff Qualifications and Education | SQE | Credentials, training |
| Management of Information | MOI | EHR, medical records |

### Files to Create

```
server/
  services/
    nabh-jci-compliance.service.js   ← Checklist engine + evidence collection
  routes/
    nabh-jci.route.js                ← All NABH/JCI endpoints
  migrations/
    nabh-jci.migration.js            ← compliance_standards, compliance_checkpoints, compliance_evidence
```

### API Contract

```
GET  /api/compliance/nabh/dashboard         Overall NABH readiness score
GET  /api/compliance/nabh/chapters          All chapter scores
GET  /api/compliance/nabh/:chapter          Single chapter checkpoint list
POST /api/compliance/nabh/:chapter/:id/evidence  Upload evidence for a checkpoint
PATCH /api/compliance/nabh/:chapter/:id     Update checkpoint status
GET  /api/compliance/jci/dashboard          Overall JCI readiness score
GET  /api/compliance/jci/chapters           All JCI chapter scores
GET  /api/compliance/jci/:chapter           Single JCI chapter checkpoints
POST /api/compliance/jci/:chapter/:id/evidence  Upload evidence
GET  /api/compliance/audit-schedule         Upcoming internal audit schedule
POST /api/compliance/audit-schedule         Schedule internal audit
GET  /api/compliance/incidents              Incident report log (CQI/QPS)
POST /api/compliance/incidents              Log new incident
```

### Database Schema

```sql
CREATE TABLE compliance_standards (
  id          SERIAL PRIMARY KEY,
  framework   VARCHAR(20) NOT NULL,   -- 'NABH' | 'JCI' | 'ISO27001'
  version     VARCHAR(20),
  chapter_code VARCHAR(10),
  chapter_name TEXT,
  description TEXT
);

CREATE TABLE compliance_checkpoints (
  id             SERIAL PRIMARY KEY,
  standard_id    INTEGER REFERENCES compliance_standards(id),
  checkpoint_code VARCHAR(20) UNIQUE,
  description    TEXT,
  measurable_element TEXT,
  criticality    VARCHAR(10) DEFAULT 'standard',  -- critical | major | standard
  auto_collectable BOOLEAN DEFAULT FALSE,
  auto_query     TEXT
);

CREATE TABLE compliance_evidence (
  id             BIGSERIAL PRIMARY KEY,
  tenant_id      INTEGER NOT NULL,
  checkpoint_id  INTEGER REFERENCES compliance_checkpoints(id),
  status         VARCHAR(20) DEFAULT 'not_assessed',
  evidence_text  TEXT,
  evidence_url   TEXT,
  assessed_by    INTEGER,
  assessed_at    TIMESTAMPTZ,
  score          INTEGER DEFAULT 0,  -- 0=not met, 5=partial, 10=fully met
  notes          TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE compliance_incidents (
  id             BIGSERIAL PRIMARY KEY,
  tenant_id      INTEGER NOT NULL,
  incident_type  VARCHAR(50),
  severity       VARCHAR(20),
  description    TEXT,
  occurred_at    TIMESTAMPTZ,
  reported_by    INTEGER,
  root_cause     TEXT,
  corrective_action TEXT,
  status         VARCHAR(20) DEFAULT 'open',
  closed_at      TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 6. GAP-4 — ISO 27001 Control Registry

### Business Requirement
Enterprise hospital procurement committees require ISO/IEC 27001:2022 certification evidence. The current security stack (RBAC, audit logging, encryption) implements many controls but there is no formal mapping or evidence artifact repository.

### ISO 27001:2022 Control Domains

| Domain | Controls | Count |
|---|---|---|
| Organizational Controls (A.5) | Policies, roles, threat intelligence, incident management | 37 |
| People Controls (A.6) | Screening, training, remote work | 8 |
| Physical Controls (A.7) | Physical security, clean desk | 14 |
| Technological Controls (A.8) | Access mgmt, cryptography, dev security, logging | 34 |

Total: **93 controls**

### Files to Create

```
server/
  services/
    iso27001.service.js              ← Control registry + evidence management
  routes/
    iso27001.route.js                ← ISO 27001 API
  data/
    iso27001-controls.json           ← Full 93-control catalogue
  migrations/
    iso27001.migration.js            ← iso27001_controls, iso27001_evidence, iso27001_risk_register
```

### API Contract

```
GET  /api/iso27001/dashboard            Overall ISMS score + risk posture
GET  /api/iso27001/controls             List all 93 controls with status
GET  /api/iso27001/controls/:id         Single control + evidence
PATCH /api/iso27001/controls/:id        Update control implementation status
POST /api/iso27001/controls/:id/evidence Upload evidence artifact
GET  /api/iso27001/risk-register        Risk register (likelihood × impact)
POST /api/iso27001/risk-register        Add risk item
PATCH /api/iso27001/risk-register/:id   Update risk (treatment, residual)
GET  /api/iso27001/soa                  Statement of Applicability export
GET  /api/iso27001/gaps                 Controls not yet implemented
GET  /api/iso27001/audit-log            ISMS audit trail
```

### Database Schema

```sql
CREATE TABLE iso27001_controls (
  id              SERIAL PRIMARY KEY,
  control_ref     VARCHAR(20) UNIQUE,   -- e.g. 'A.8.1', 'A.5.1'
  domain          VARCHAR(30),
  title           TEXT,
  description     TEXT,
  applicable      BOOLEAN DEFAULT TRUE,
  implementation_status VARCHAR(20) DEFAULT 'not_implemented',
  implementation_notes  TEXT,
  responsible_role      VARCHAR(50),
  last_reviewed   TIMESTAMPTZ,
  next_review     TIMESTAMPTZ,
  auto_assessed   BOOLEAN DEFAULT FALSE
);

CREATE TABLE iso27001_evidence (
  id              BIGSERIAL PRIMARY KEY,
  tenant_id       INTEGER,
  control_id      INTEGER REFERENCES iso27001_controls(id),
  evidence_type   VARCHAR(30),  -- policy|procedure|screenshot|log|certificate
  title           TEXT,
  file_url        TEXT,
  uploaded_by     INTEGER,
  uploaded_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE iso27001_risk_register (
  id              BIGSERIAL PRIMARY KEY,
  tenant_id       INTEGER,
  asset           TEXT,
  threat          TEXT,
  vulnerability   TEXT,
  likelihood      INTEGER CHECK (likelihood BETWEEN 1 AND 5),
  impact          INTEGER CHECK (impact BETWEEN 1 AND 5),
  risk_score      INTEGER GENERATED ALWAYS AS (likelihood * impact) STORED,
  treatment       VARCHAR(20),  -- accept|mitigate|transfer|avoid
  controls_linked INTEGER[],
  residual_risk   INTEGER,
  owner           INTEGER,
  status          VARCHAR(20) DEFAULT 'open',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 7. GAP-5 — SFTP/FTPS File Exchange Adapter

### Business Requirement
Many government hospitals, legacy HIS systems, and batch-oriented insurance payers exchange files via SFTP. Without SFTP support the platform cannot integrate with these partners for bulk lab results, batch claim files, radiology reports, or scheduled ADT feeds.

### Use Cases

| Use Case | Direction | File Format |
|---|---|---|
| Batch lab results delivery | Outbound | HL7 ORU^R01 batch |
| Insurance claim batch | Outbound | X12N 837P/I |
| Remittance advice | Inbound | X12N 835 |
| ADT event feed | Outbound | HL7 ADT batch |
| Radiology report delivery | Outbound | CDA R2 XML / PDF |
| Master file sync | Bidirectional | HL7 MFN batch |

### Files to Create

```
server/
  services/
    sftp-adapter.service.js          ← ssh2-sftp-client wrapper with retry/audit
  routes/
    sftp.route.js                    ← SFTP connection + transfer management API
  migrations/
    sftp.migration.js                ← sftp_connections, sftp_transfers
```

### API Contract

```
POST /api/sftp/connections              Register SFTP partner
GET  /api/sftp/connections              List SFTP connections
GET  /api/sftp/connections/:id          Connection detail + health
PATCH /api/sftp/connections/:id         Update connection config
DELETE /api/sftp/connections/:id        Remove connection
POST /api/sftp/connections/:id/test     Test connectivity (SFTP ping)
POST /api/sftp/transfer/upload          Upload file to partner SFTP
POST /api/sftp/transfer/download        Download file from partner SFTP
GET  /api/sftp/transfer/queue           Transfer queue status
GET  /api/sftp/transfers                Transfer history + audit log
```

### Database Schema

```sql
CREATE TABLE sftp_connections (
  id            SERIAL PRIMARY KEY,
  tenant_id     INTEGER NOT NULL,
  name          VARCHAR(120) NOT NULL,
  partner_type  VARCHAR(50),    -- 'lab','insurer','hospital','payer','radiology'
  host          VARCHAR(255) NOT NULL,
  port          INTEGER DEFAULT 22,
  username      VARCHAR(120),
  auth_type     VARCHAR(20) DEFAULT 'password',   -- 'password' | 'key'
  password_enc  TEXT,    -- AES-256 encrypted
  private_key_enc TEXT,  -- AES-256 encrypted
  remote_base_dir TEXT DEFAULT '/',
  passive_mode  BOOLEAN DEFAULT FALSE,
  protocol      VARCHAR(10) DEFAULT 'sftp',  -- 'sftp' | 'ftps'
  is_active     BOOLEAN DEFAULT TRUE,
  last_tested   TIMESTAMPTZ,
  last_status   VARCHAR(20),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE sftp_transfers (
  id              BIGSERIAL PRIMARY KEY,
  connection_id   INTEGER REFERENCES sftp_connections(id),
  direction       VARCHAR(10),   -- 'upload' | 'download'
  local_path      TEXT,
  remote_path     TEXT,
  file_name       TEXT,
  file_size_bytes BIGINT,
  status          VARCHAR(20) DEFAULT 'queued',   -- queued|in_progress|completed|failed
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  error_message   TEXT,
  retry_count     INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 8. GAP-6 — MFN Support in HL7 MLLP Gateway

### Business Requirement
Master File Notifications (MFN) synchronize reference data (drug formularies, provider directories, diagnosis code sets, location master) between the HMIS and partner systems. Without MFN support the platform cannot participate in automated master data management (MDM) across hospital networks.

### MFN Message Types to Add

| Message | Use Case |
|---|---|
| MFN^M01 — Master File Not Otherwise Specified | Generic master file update |
| MFN^M02 — Master File — Staff Practitioner | Provider directory sync |
| MFN^M04 — Master File — Charge Description Master | CDM / procedure fee schedule |
| MFN^M05 — Master File — Location | Hospital location/ward master |
| MFN^M06 — Master File — Clinical Study |Lab/study protocol |
| MFN^M08 — Master File — Test/Observation (LOINC mapped) | Lab test catalogue |
| MFN^M12 — Master File — Additional Basic Observation/Services | Vital sign observation catalogue |

### Files to Modify

```
server/services/hl7-mllp-gateway.service.js    ← Add MFN handlers + dispatch
server/routes/hl7-gateway.route.js             ← Add MFN to SUPPORTED_TYPES registry
```

### Changes Required in hl7-mllp-gateway.service.js

Add handlers: `handleMfnM02()`, `handleMfnM04()`, `handleMfnM05()`, `handleMfnM08()`.  
Update `dispatchMessage()` switch to route `MFN^M*` patterns.

---

## 9. GAP-7 — CDA R2 Document Generator

### Business Requirement
Clinical Document Architecture (CDA) Release 2 is the standard format required by:
- ABDM (PHR App) for sharing health records in interoperable format
- IHE XDS.b document registry for cross-facility referral
- Many national HIE systems globally

Current gap: discharge summaries and referral letters are generated as PDF/HTML only.

### CDA Templates to Implement

| Template | OID | Use Case |
|---|---|---|
| Discharge Summary | 2.16.840.1.113883.10.20.22.1.8 | Inpatient discharge |
| Referral Note | 2.16.840.1.113883.10.20.22.1.14 | Specialist referral |
| Continuity of Care Document (CCD) | 2.16.840.1.113883.10.20.22.1.2 | Patient health summary |
| Operative Note | 2.16.840.1.113883.10.20.22.1.7 | Surgical procedure |
| Diagnostic Imaging Report | 2.16.840.1.113883.10.20.22.1.5 | Radiology report |

### Files to Create

```
server/
  services/
    cda-r2.service.js                ← CDA XML builder using xmlbuilder2
  routes/
    cda.route.js                     ← CDA generation endpoints
```

### API Contract

```
POST /api/cda/discharge-summary/:admissionId     Generate discharge summary CDA
POST /api/cda/referral/:appointmentId            Generate referral note CDA
POST /api/cda/ccd/:patientId                     Generate CCD / health summary
POST /api/cda/operative-note/:surgeryId          Generate operative note CDA
POST /api/cda/imaging-report/:studyId            Generate diagnostic imaging CDA
GET  /api/cda/documents/:patientId               List all CDA documents for patient
GET  /api/cda/documents/:id/download             Download CDA XML
GET  /api/cda/documents/:id/validate             Validate CDA against schema
```

### CDA XML Structure (Discharge Summary example)

```xml
<?xml version="1.0" encoding="UTF-8"?>
<ClinicalDocument xmlns="urn:hl7-org:v3"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  templateId="2.16.840.1.113883.10.20.22.1.8">
  <typeId root="2.16.840.1.113883.1.3" extension="POCD_HD000040"/>
  <id root="{uuid}"/>
  <code code="18842-5" codeSystem="2.16.840.1.113883.6.1"
        codeSystemName="LOINC" displayName="Discharge Summary"/>
  <title>Discharge Summary — {patientName}</title>
  <effectiveTime value="{datetime}"/>
  <recordTarget>
    <patientRole>
      <!-- Patient ABHA ID, demographics -->
    </patientRole>
  </recordTarget>
  <author><!-- Doctor with NMC/HPR ID --></author>
  <custodian><!-- Hospital --></custodian>
  <component>
    <structuredBody>
      <!-- Diagnosis (ICD-10), Medications (RxNorm), Vitals (LOINC), Labs -->
    </structuredBody>
  </component>
</ClinicalDocument>
```

---

## 10. GAP-8 — Hospital Login Interop Context

### Business Requirement
When a hospital admin logs in, the session should be enriched with interoperability context:
- Which FHIR base URL this tenant uses
- The HL7 facility ID (MSH-4) for outgoing messages
- The DICOM AE title for PACS integration
- A FHIR AuditEvent should be emitted to the audit log

This context is needed so that any subsequent API call that generates HL7/FHIR messages can include correct sender identification without an extra DB lookup.

### Files to Modify

```
server/routes/hospital-auth.route.js    ← Enrich login response with interop config
```

### Changes Required

1. After successful login, query `tenant_interop_config` (or create on-the-fly from tenant record).
2. Return `interopConfig` block in login response.
3. Write FHIR `AuditEvent` resource to `audit_events` table.
4. Store interop config in refresh token's associated session record.

### Login Response Enrichment

```json
{
  "success": true,
  "token": "<jwt>",
  "refreshToken": "<refresh>",
  "hospital": { "...existing fields..." },
  "interopConfig": {
    "fhirBaseUrl": "https://app.mediqzy.com/api/fhir/r4",
    "hl7FacilityId": "MQZ-HOSP-001",
    "hl7SendingApp": "MEDICZY_HMIS",
    "dicomAeTitle": "MEDICZY_PACS",
    "abdmHipId": null,
    "terminologyServerUrl": "https://app.mediqzy.com/api/hypergrid/terminology",
    "smartAuthUrl": "https://app.mediqzy.com/api/hypergrid/smart"
  }
}
```

### Database Table

```sql
CREATE TABLE IF NOT EXISTS tenant_interop_config (
  tenant_id          INTEGER PRIMARY KEY,
  fhir_base_url      TEXT,
  hl7_facility_id    VARCHAR(50),
  hl7_sending_app    VARCHAR(50) DEFAULT 'MEDICZY_HMIS',
  dicom_ae_title     VARCHAR(16),
  abdm_hip_id        VARCHAR(50),
  smart_auth_url     TEXT,
  terminology_url    TEXT,
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  updated_at         TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 11. Delivery Schedule

| Week | Items |
|---|---|
| Week 1 (2026-06-13) | GAP-8 (Hospital Login), GAP-6 (MFN), GAP-5 (SFTP), GAP-7 (CDA R2) |
| Week 2 (2026-06-20) | GAP-3 (NABH/JCI), GAP-4 (ISO 27001) |
| Week 3–4 (2026-06-27) | GAP-1 (X12N EDI) |
| Week 5–8 (2026-07-11) | GAP-2 (ABDM — NHA sandbox credentials required) |

---

## 12. Testing Strategy

### QA / Test Engineer Checklist

| Gap | Unit Test | Integration Test | Smoke Test |
|---|---|---|---|
| GAP-8 | Login response shape | Full login flow | `POST /api/hospital/auth/login` |
| GAP-6 | MFN parse + dispatch | MLLP TCP inject | `POST /api/v1/hl7/simulate` with MFN^M02 |
| GAP-5 | SFTP connect mock | Live SFTP to test server | `POST /api/sftp/connections/:id/test` |
| GAP-7 | XML schema validation | Full CDA for test patient | `GET /api/cda/documents/:id/validate` |
| GAP-3 | Checkpoint load | Full NABH dashboard | `GET /api/compliance/nabh/dashboard` |
| GAP-4 | Control catalogue load | SOA export | `GET /api/iso27001/soa` |
| GAP-1 | EDI string generation | 270/271 round-trip | `POST /api/edi/validate` |
| GAP-2 | Token refresh mock | NHA sandbox OTP flow | `POST /api/abdm/abha/register` |

### Security Review Gates (per Security & Compliance Engineer)
- [ ] All new routes protected by `authUser` + appropriate `requireRole`
- [ ] SFTP credentials encrypted at rest (AES-256) before DB write
- [ ] ABDM tokens never logged in plaintext
- [ ] EDI raw strings stored encrypted or masked
- [ ] All new tables emit to `api_audit_logs` on write
- [ ] FHIR AuditEvent created for every login + PHI access

---

## 13. Route Registration Manifest

All new routes to be mounted in `server/app.js`:

```javascript
// GAP-1
import x12nEdiRouter    from './routes/x12n-edi.route.js';
app.use('/api/edi',     x12nEdiRouter);

// GAP-2
import abdmRouter       from './routes/abdm.route.js';
app.use('/api/abdm',    abdmRouter);

// GAP-3
import nabhjciRouter    from './routes/nabh-jci.route.js';
app.use('/api/compliance', nabhjciRouter);

// GAP-4
import iso27001Router   from './routes/iso27001.route.js';
app.use('/api/iso27001', iso27001Router);

// GAP-5
import sftpRouter       from './routes/sftp.route.js';
app.use('/api/sftp',    sftpRouter);

// GAP-7
import cdaRouter        from './routes/cda.route.js';
app.use('/api/cda',     cdaRouter);

// GAP-6 & GAP-8 are modifications to existing files
```

---

*Document maintained by: AI CTO + Principal Engineer + Backend Engineer*  
*Next review: 2026-07-13*
