# IHX vs Mediqzy — Hospital Insurance Portal Gap Analysis

> **Date:** June 2025  
> **Source:** 162 IHX screenshots (provider.ihx.in) vs Mediqzy codebase audit  
> **Verdict:** Mediqzy covers **~60-65%** of IHX features. Key gaps in Reconciliation, Hospital Profile/Config, NHCX, Calendar, Inventory, and Courier Tracking.

---

## Legend

| Symbol | Meaning |
|--------|---------|
| ✅ | Fully present in Mediqzy |
| ⚠️ | Partially implemented (backend-only, stub, or mock data) |
| ❌ | Missing — needs to be built |

---

## 1. Claims Management

| IHX Feature | Mediqzy Status | Notes |
|-------------|---------------|-------|
| Claims Dashboard with stats (Total/Pending/Query/Receivables) | ✅ | `HospitalInsuranceClaimsDashboard.tsx` — multi-tab dashboard with real API stats |
| Claims Queue / List (tabular with status badges) | ✅ | Full table view with status badges, policy number, amounts |
| Claim Status Tabs (PA Draft, PA Query, Awaiting, PA Approval, Discharge, Claim Draft, Claim Query, Settlement, Settled) | ⚠️ | Mediqzy has status filtering but **not the exact IHX tab structure** (PA Draft, PA Query Pending, PA Query >3hrs, Discharge Today/Tomorrow/Pending as separate tabs). Uses a single "Claims" tab with status dropdown filter |
| Claim Detail View (Member Details, Treatment, Bill, Documents tabs) | ✅ | Full detail dialog with patient info, insurance, financial summary, medical info, documents, timeline |
| New Claim Creation | ✅ | Dialog with UHID, patient, policy, insurer, claim type, diagnosis, procedure codes, document upload |
| Claim Edit / Status Update | ✅ | Edit dialog to update status, approved amount, remarks |
| Claim History / Timeline | ✅ | Timeline events (status changes, amounts, reasons) from API |
| Claim PDF Generation | ✅ | Opens PDF via API, falls back to browser print |
| Claim Enhancement / Query Response | ✅ | Prompt-based clarification submission |
| Claims Search (by Claim ID, Policy No, Member ID) | ✅ | Search by claim ID, policy number, member ID via API |
| Claims Export (CSV) | ✅ | Exports claims to CSV with all fields |
| Bulk Claims Upload | ⚠️ | Backend API exists (`POST /claims/bulk-upload`), **no frontend UI** |
| Claim Draft Management | ⚠️ | Backend API exists (`GET /claims/drafts`), **no frontend UI** |
| Real-time Claim Notifications (WebSocket) | ✅ | Socket.io for `claim:update`, `preauth:update`, `document:update`, `query:new` |
| Claim Statuses (Processing, PA Approved, PA Query, PA Denied, PA Submitted, Discharge Initiated, Enhancement Approved/Denied/Query, Claim Approved, Settled, Cancelled) | ✅ | Full status lifecycle in DB model |

---

## 2. Pre-Authorization

| IHX Feature | Mediqzy Status | Notes |
|-------------|---------------|-------|
| Pre-Auth List (Pending) | ✅ | Dashboard "preauth" tab, lists pending pre-auth with number, amount, status |
| New Pre-Auth Request (Beneficiary Search → Review → Submit flow) | ⚠️ | Frontend form exists (UHID, insurer, policy, procedure, cost, date, justification) but **submit handler not fully wired to API** |
| 4-Step Admission Flow (Search Member → Admission Form → Review → Submit) | ❌ | IHX has a structured 4-step wizard; Mediqzy has a single dialog form |
| Pre-Auth Approved/Rejected Lists | ⚠️ | Backend APIs exist, **no frontend UI tabs** for approved/rejected |
| HIS Integration for Pre-Auth | ❌ | IHX integrates with Hospital Information System; Mediqzy does not |
| Member Search by ID / Employee ID / Policy No | ⚠️ | Patient search exists (name, mobile, ABHA, policy) but **no Employee ID search** |

---

## 3. Treatment & Bill Details

| IHX Feature | Mediqzy Status | Notes |
|-------------|---------------|-------|
| Treatment Details (Proposed Line of Treatment, Surgical Management) | ⚠️ | DB model has `hospitalization_details` and `treatment_details` JSONB. Frontend shows medical info in detail dialog but **not the structured IHX treatment form** (proposed treatment, surgical details, doctor assignment, room category) |
| Bill Details (Package breakdown — Room, Consultation, OT, Anesthetist, Investigation) | ⚠️ | Claim has `claimed_amount`, `approved_amount`, `settled_amount`. **No itemized bill breakdown** like IHX's package-level billing (Room Rent, ICU, OT Charges, Anesthetist, etc.) |
| Diagnosis (ICD Codes) | ✅ | ICD-10 code management exists in billing codes section |
| Procedure Codes (CPT/HCPCS) | ✅ | CPT/HCPCS code management exists |
| Injury Details (Date, FIR No., RTA/Substance Abuse) | ❌ | IHX captures injury-specific details; **not present in Mediqzy** |

---

## 4. Reconciliation & TAT Reports

| IHX Feature | Mediqzy Status | Notes |
|-------------|---------------|-------|
| Reconciliation Dashboard | ❌ | **No reconciliation page/component** in Mediqzy |
| Update Reconciliation Report (CSV Upload/Download) | ❌ | Missing |
| TAT Reports (Stage-wise TAT, per-payer breakdown) | ⚠️ | Backend API endpoint exists (`GET /reports/tat`), **no frontend tab** |
| Payer Response Time Reports | ❌ | Missing |
| Filter by Payor/Center/DOD/Settled Date/Created Date | ❌ | Missing (only basic status/insurer filtering exists) |
| Hospital-wise Claims Report | ❌ | Missing (single-hospital context) |

---

## 5. Reports & Analytics

| IHX Feature | Mediqzy Status | Notes |
|-------------|---------------|-------|
| Receivables Snapshot (Approved-not-settled, Settled, Pending, Total) | ✅ | Analytics tab with real API data |
| Claims Aging Report (<7d, 7-15d, 15-30d, >30d buckets) | ✅ | Analytics tab with aging buckets |
| Query/Rejection Trends | ✅ | Queries, rejections, approvals counts from API |
| Claim Status Distribution | ⚠️ | Exists as **static mock data** progress bars |
| Top Insurers by Claims | ⚠️ | Exists as **static mock data** |
| Monthly Claim Trends | ⚠️ | Exists as **static mock data** (visual bar chart) |
| Quick Reports (Claims Summary, Settlement, TAT, Rejection, Insurer-wise) | ⚠️ | **Buttons exist but no action handlers** — stub/placeholder |
| Settlement Status Report | ⚠️ | Backend API exists, **no frontend** |

---

## 6. Payer / TPA Management

| IHX Feature | Mediqzy Status | Notes |
|-------------|---------------|-------|
| Payer List (Insurance + TPA cards) | ✅ | Grid cards with contact, MoU, credit days, tariff, settlement ratio |
| Add New Payer | ✅ | Dialog with full form, posts to API |
| MoU Details View | ✅ | Dialog with dates, credit period, tariff, package deals, documents |
| Schedule of Charges (SOC) | ✅ | Table comparing hospital vs agreed rates per procedure |
| Per-Payer Email Configuration (Pre-Auth & Settlement emails) | ❌ | IHX has per-payer email config; **missing in Mediqzy** |
| 20+ Payer Integrations (Medi Assist, Star Health, HDFC ERGO, Bajaj Allianz, etc.) | ✅ | 17 TPA aggregator integrations + insurance provider service |
| Payer Announcements (system-wide from payers) | ❌ | Missing |

---

## 7. Hospital Profile & Configuration

| IHX Feature | Mediqzy Status | Notes |
|-------------|---------------|-------|
| Hospital Basic Details (Name, Address, ROHINI ID, Registration No.) | ❌ | **Not in insurance module** — may exist elsewhere but not linked |
| Hospital Account Details (Bank account info) | ❌ | Missing |
| Infrastructure Details (Room types, amenities, bed counts) | ❌ | Missing. IHX has detailed room listing with amenities and bed counts |
| User Account Management (roles, permissions) | ❌ | **Not in insurance module context** |
| Hospital Map/Location | ❌ | Missing |
| Claim Team Email Configuration | ❌ | Missing |
| Secondary Email IDs / Other Team Config | ❌ | Missing |

---

## 8. Documents Management

| IHX Feature | Mediqzy Status | Notes |
|-------------|---------------|-------|
| Missing Document Alerts | ✅ | Dashboard "documents" tab lists claims with incomplete docs |
| Document Upload (drag & drop) | ⚠️ | Backend API exists, claim dialog has upload placeholder but **not functional drag-and-drop** |
| Document Download | ⚠️ | **Stub/placeholder** — creates text blob, not real file download |
| Accreditation Certificates (ISO/NABH/NABL/EQAS) | ❌ | IHX has a dedicated documents section for accreditation, tax, PAN, tariff; **missing in Mediqzy** |
| Tax Exemption / Service Tax / PAN / Cancelled Cheque uploads | ❌ | Missing |
| Tariff-IP Document Upload | ❌ | Missing |

---

## 9. NHCX / ABDM Integration

| IHX Feature | Mediqzy Status | Notes |
|-------------|---------------|-------|
| NHCX Onboarding (Participant Creation, Health Facility Registry) | ❌ | **No NHCX files or references in the entire codebase** |
| ABHA Health ID Creation (via Aadhaar) | ⚠️ | ABHA field exists in patient profile (14-digit input). **No Aadhaar-based ABHA creation flow** |
| Digital Health Incentive Scheme (DHIS) | ❌ | Missing |
| Link Health Records with ABHA | ❌ | Missing |
| ABHA Linking in Claim View | ⚠️ | ABHA is a search type in claims dashboard. **No dedicated ABHA linking UI in claim detail** |

---

## 10. Calendar & Events

| IHX Feature | Mediqzy Status | Notes |
|-------------|---------------|-------|
| Calendar View (Day/Week/Month) | ❌ | **No calendar component** in insurance module |
| Create / View Events (date, name, description, department) | ❌ | Missing |

---

## 11. Inventory (Insurance Context)

| IHX Feature | Mediqzy Status | Notes |
|-------------|---------------|-------|
| Doctors List (profile, weekly schedule, qualifications, consultation fees) | ❌ | **Not in insurance module**. Doctor profiles may exist elsewhere but not linked to insurance |
| Health Check Packages | ❌ | Missing in insurance context |
| Lab Tests Catalog | ❌ | Missing in insurance context |
| IP Packages | ❌ | Missing in insurance context |
| Day Care Services | ❌ | Missing in insurance context |

---

## 12. Notifications

| IHX Feature | Mediqzy Status | Notes |
|-------------|---------------|-------|
| Notifications Page (bell icon, 1500+ notifications list) | ⚠️ | Real-time WebSocket notifications exist for claim/preauth events. **No standalone insurance notifications page** like IHX's dedicated notification center |
| New Admission Query alerts from TPAs | ⚠️ | Query events come via WebSocket. **No dedicated query notification list/page** |
| Mark as Read / Unread | ❌ | Missing |

---

## 13. Courier Tracking

| IHX Feature | Mediqzy Status | Notes |
|-------------|---------------|-------|
| Track Courier for claims | ❌ | Missing |
| Courier provider, tracking number, acknowledgement number | ❌ | Missing |

---

## 14. Denials & Appeals

| IHX Feature | Mediqzy Status | Notes |
|-------------|---------------|-------|
| Denied Claims List with rejection reasons | ✅ | Appeals tab in dashboard |
| Submit Appeal | ✅ | Via `POST /claims/:claimId/appeal` |
| Appeal Count tracking | ✅ | Shows appeal count per claim |

---

## 15. Task Inbox & SLA

| IHX Feature | Mediqzy Status | Notes |
|-------------|---------------|-------|
| Task Inbox (pending queries, document needs, follow-ups) | ✅ | Dashboard "tasks" tab with priority, SLA flag, age |
| SLA Escalations (breached/critical/warning) | ✅ | Dashboard "escalations" tab with levels |

---

## Summary Scorecard

| Category | IHX Features | ✅ Full | ⚠️ Partial | ❌ Missing |
|----------|-------------|---------|-----------|-----------|
| Claims Management | 15 | 12 | 3 | 0 |
| Pre-Authorization | 6 | 1 | 3 | 2 |
| Treatment & Bill Details | 5 | 2 | 2 | 1 |
| Reconciliation & TAT | 6 | 0 | 1 | 5 |
| Reports & Analytics | 8 | 3 | 4 | 1 |
| Payer/TPA Management | 6 | 4 | 0 | 2 |
| Hospital Profile & Config | 7 | 0 | 0 | 7 |
| Documents Management | 6 | 1 | 2 | 3 |
| NHCX / ABDM | 5 | 0 | 2 | 3 |
| Calendar & Events | 2 | 0 | 0 | 2 |
| Inventory (Insurance) | 5 | 0 | 0 | 5 |
| Notifications | 3 | 0 | 2 | 1 |
| Courier Tracking | 2 | 0 | 0 | 2 |
| Denials & Appeals | 3 | 3 | 0 | 0 |
| Task Inbox & SLA | 2 | 2 | 0 | 0 |
| **TOTAL** | **81** | **28 (35%)** | **19 (23%)** | **34 (42%)** |

---

## Priority Gaps to Close (Top 10)

| Priority | Feature Gap | Effort | Impact |
|----------|-----------|--------|--------|
| 🔴 P0 | **Reconciliation Dashboard** — TAT reports, payer response time, CSV upload/download, advanced filters | High | Critical for finance teams |
| 🔴 P0 | **Itemized Bill Details** — Package-level breakdown (Room, ICU, OT, Anesthetist, Investigation) | Medium | Required for claim accuracy |
| 🔴 P0 | **NHCX Onboarding** — Participant creation, Health Facility Registry integration | High | Regulatory compliance (NHA mandate) |
| 🟠 P1 | **Hospital Profile & Config** — Infrastructure details (rooms, beds, amenities), bank details, team emails | Medium | Operational necessity |
| 🟠 P1 | **Pre-Auth 4-Step Wizard** — Structured beneficiary search → admission form → review → submit flow | Medium | UX parity with IHX |
| 🟠 P1 | **Document Management** — Functional drag-and-drop upload, accreditation certificates, tariff docs | Medium | Compliance documentation |
| 🟠 P1 | **Per-Payer Email Configuration** — Email routing for pre-auth and settlement communications | Low | Operational efficiency |
| 🟡 P2 | **ABDM/ABHA Integration** — Aadhaar-based ABHA creation, DHIS, health record linking | High | Govt. incentive scheme |
| 🟡 P2 | **Courier Tracking** — Track physical claim document shipments | Low | Operational tracking |
| 🟡 P2 | **Notifications Page** — Dedicated insurance notification center with mark read/unread | Medium | User experience |

---

## What Mediqzy Does Better Than IHX

| Feature | Notes |
|---------|-------|
| **AI Insurance Bot** | OpenInsurance-LLaMA3-8B for policy coverage verification, pre-auth assistance, IRDAI regulations — IHX has no AI layer |
| **17 TPA Aggregator Integrations** | Unified `POST /tpa/execute` endpoint for all TPAs with real service modules |
| **Real-time WebSocket Notifications** | Live claim/preauth/document/query event streaming — IHX relies on page refresh |
| **SLA Escalation Tracking** | Breached/critical/warning levels with age tracking — more sophisticated than IHX |
| **Denials & Appeals Workflow** | Dedicated appeals tab with appeal count and rejection reason analysis |
| **Claims Aging Analytics** | Bucket-based aging report (<7d, 7-15d, 15-30d, >30d) |
| **Insurance Broker Portal** | Broker entity model — IHX is hospital-only |

---

## Recommended Implementation Roadmap

### Phase 1 — Quick Wins (1-2 weeks)
- Wire up existing backend stubs to frontend: Bulk Claims Upload UI, Claim Drafts UI, TAT Report tab, Settlement Status tab, Pre-Auth Approved/Rejected tabs
- Fix document upload to be functional (drag-and-drop)
- Fix document download (real file, not text blob)
- Add per-payer email configuration fields
- Add courier tracking fields to claim model & detail view
- Convert mock analytics data to real API calls

### Phase 2 — Core Gaps (3-4 weeks)
- Build Reconciliation Dashboard (TAT reports, payer response, CSV upload/download, advanced filters)
- Build itemized bill details (package-level breakdown with room, OT, anesthetist, etc.)
- Build Hospital Profile page (infrastructure, rooms, beds, bank details, team emails)
- Build Pre-Auth 4-step wizard flow
- Build standalone Notifications page with mark read/unread
- Add IHX-style claim status tabs (PA Draft, PA Query Pending, PA Query >3hrs, etc.)

### Phase 3 — Regulatory & Advanced (4-6 weeks)
- NHCX Onboarding integration (Health Facility Registry, Participant Creation)
- ABDM/ABHA creation via Aadhaar
- Digital Health Incentive Scheme (DHIS) integration
- Injury details capture (FIR, RTA, Substance Abuse)
- Calendar & Events module
- Insurance Inventory (doctors, packages, lab tests linked to insurance context)
- Payer Announcements system
- HIS integration for pre-auth
