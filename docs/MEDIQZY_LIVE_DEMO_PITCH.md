# Mediqzy — Live Demo Pitch & Talk Track
**For: Founder / CTO running a live product demo**
**Product:** Mediqzy (SmartHealth Hospital OS) · Live at **app.mediqzy.com**
**Tagline:** *Complete, Paperless, Interoperable, Orchestrated Healthcare*

> How to use this doc: the left column is **what you click**, the right/indented text is **what you say** (the talk track). Timings assume a 12–15 min demo. Skip sections freely to fit the room.

---

## 0. The 30-second hook (say this first)

> "Most hospitals run 15 disconnected software systems that don't talk to each other — the OPD system, the lab system, the pharmacy, the billing, the insurance desk, radiology. Doctors re-type the same data five times, patients wait, revenue leaks, and nobody has a single live view.
>
> **Mediqzy is one operating system for the entire hospital — and the entire care ecosystem around it.** From the moment a patient walks in, to admission, surgery, discharge, billing, insurance, and follow-up — one platform, one patient record, AI in every step. Let me show you, live, on our production system."

---

## 0b. The problem we solve — the Indian hospital IT reality

*(Set the stage before the demo — the pain the buyer already feels.)*

**Greenfield hospital projects: IT is the risk nobody plans for.**
- HIS is treated as an afterthought — chosen late, deployed slowly. Traditional implementations take **6–18 months**, with go-live slipping repeatedly.
- Hospitals buy **5–15 separate systems** (registration, lab/LIS, PACS, pharmacy, billing, insurance, HR) from different vendors — then pay integrators to stitch them together. The integrations are brittle and break on every upgrade.
- **Capital-heavy, on-prem servers**, thick-client software, and a large in-house IT team just to keep it running.
- Staff face months of training on clunky, non-intuitive screens → adoption stalls, paper creeps back in.

**Existing HIS products in the Indian market — the chronic pain:**
| Pain | Consequence |
|---|---|
| **Fragmented point solutions**, no shared record | Double/triple data entry, silos, errors |
| **Legacy on-prem, thick-client, not mobile-first** | Poor UX, low adoption, no on-the-go access |
| **No real AI** (a bolt-on chatbot at best) | No decision support, no automation, no prediction |
| **Weak interoperability** (no native HL7/FHIR/NHCX/ABDM) | Slow cashless claims, no data exchange, compliance gaps |
| **Revenue leakage** — manual, missed charge capture | 2–5% of IP revenue silently lost |
| **Slow insurance/TPA cycles** | High claim TAT, denials, cash-flow strain |
| **No real-time command/analytics** | Owners fly blind; decisions are reactive |
| **Per-module licensing + long lock-in** | High TCO, vendor dependency |
| **Manual NABH/quality compliance** | Costly, error-prone accreditation |

**Why international systems don't fit most Indian hospitals:**
- **Epic / Oracle Health (Cerner) / Meditech / InterSystems** are world-class but **prohibitively expensive**, over-engineered for Indian workflows, need **multi-year deployments** and large dedicated IT teams, and are weak on India-specific rails (ABDM, NHCX, Ayushman). Viable for a handful of large chains — **not** for the mid-market where most of India's beds are.

**Net effect:** hospitals **overpay, wait months, end up with silos, and still have no embedded AI and no real-time visibility.** That is exactly the gap Mediqzy closes.

---

## 1. Who it's for (pick the line that matches your audience)

- **Hospital owner / CEO:** "One platform replaces 10+ vendors, plugs revenue leaks, and gives you a live P&L of your hospital."
- **Medical Superintendent / CMO:** "Real-time clinical governance — NABH readiness, quality metrics, and AI decision support that keeps the physician in control."
- **CFO / Finance:** "Charge capture from the bedside to the bill, insurance claims automation, and cash-flow visibility in one cockpit."
- **Doctor:** "Talk to it. Dr. iSHA books, cancels, pulls patient vitals, checks drug interactions — hands-free while you examine the patient."
- **Investor:** "An AI-native, interoperable, multi-tenant healthcare OS with a regulatory-grade AI governance moat — one product serving hospitals, clinics, labs, pharmacies, ambulances, homecare and corporates."

---

## 2. The big idea (the "why we win" slide — 60 sec)

Three things make Mediqzy different from every legacy HMIS:

1. **One orchestrated ecosystem, not silos.** Hospital ⇄ Clinic ⇄ Lab ⇄ Pharmacy ⇄ Ambulance ⇄ Homecare ⇄ Corporate ⇄ Patient — all on the same rails, sharing one patient record. 20+ role-based portals, one backbone.
2. **AI-native, with our own clinical brain.** Not a ChatGPT wrapper. A cascading medical AI stack (our clinical model *iSHA / bi-medix2* → Groq → OpenAI) with a **voice assistant**, **ambient scribe**, **CDSS**, **AI vision**, and **risk scoring** — engineered to be reliable and fall back gracefully.
3. **Regulatory-grade AI governance.** Built to CDSCO / FDA / EU-MDR SaMD frameworks: every clinical AI output carries a **confidence score + explanation (SHAP/LIME)**, passes **pre-flight quality gates**, and model changes flow through **medical-director review** with drift monitoring. This is the trust moat hospitals can't build themselves.

---

## 3. The live demo flow

**Login once:** `app.mediqzy.com/hospital/login` → land on the **Hospital OS Hub** (`/hospital/os`).

> "This single hub is the command center — 40+ modules, all live data. Watch how one patient flows through the entire hospital."

### ACT 1 — The Patient Journey (paperless, ~4 min)

| Click | Say |
|---|---|
| **Walk-in Kiosk** → `/kiosk/checkin` | "Patient self-checks-in at a kiosk — no paperwork. UHID, token, digital consent. Scan a QR and you're registered." |
| **OPD Queue Display** → `/display/queue` | "This is the live waiting-room board — the same data, real time, on every screen in the hospital." |
| **Practice Management** → `/hospital/practice-management` | "Front office sees the live OPD/IPD roster. One click converts an outpatient into an inpatient admission." |
| **Admit Patient** → `/hospital/adt/admit` | "Admission with automatic bed allocation and a reservation token so two desks never double-book the same bed." |
| **QR Wristband** (from admit success) | "The moment they're admitted we print a **QR identification wristband** — scannable at pharmacy, lab, OT, and discharge. This is closed-loop patient safety." |
| **Ward / Bed Map** → `/hospital/ward` | "Live bed map — occupancy, housekeeping, nurse tasks, all in one view." |

### ACT 2 — Clinical + AI (the wow, ~4 min)

| Click | Say |
|---|---|
| **Doctor Voice Assistant** → `/doctor/assistant` | "This is **Dr. iSHA**. Watch — I'll just *talk*." Say: *"Hey iSHA, show today's appointments."* … *"Cancel that."* … *"What's the dose of metformin for a 20 kg child?"* "Hands-free, at the point of care. It books, cancels, pulls vitals, checks drug interactions — and it keeps working even if the cloud speech service is down, because we added on-device recognition." |
| **AI Scribe** → `/doctor/voice-scribe` | "Ambient scribe — it listens to the consultation and writes a structured clinical note. Works **offline** and in **multiple Indian languages**. The doctor reviews and signs — physician stays the decision-maker." |
| **Clinical CDSS** → `/doctor/triage` | "Decision support: differentials, ICD-10 codes, lab suggestions, drug-drug interaction checks, CIMS-backed alternatives — with references. It helps the doctor think faster, never replaces them." |
| **ER Triage** → `/hospital/er/queue` | "Emergency department with **ESI 5-level triage** — the AI helps prioritize life-threatening cases first." |
| **ICU / OT** → `/hospital/icu-board`, `/hmis/ot/command-center` | "ICU census and the OT command center — surgery schedule, anesthesia, utilization." |
| **RIS / PACS** → `/hospital/radiology` | "Tele-radiology with a full **DICOM viewer** — imaging worklist, reporting, no separate PACS vendor." |

### ACT 3 — Money & Operations (~3 min)

| Click | Say |
|---|---|
| **IP Billing** → `/hospital/billing` | "Charge master and bedside charge capture — every drug, every bed-day, automatically on the bill. This is where hospitals stop leaking revenue." |
| **Insurance Claims** → `/hospital/insurance-claims` | "Pre-authorization and claims — built for **NHCX** and TPA workflows, so cashless claims move faster." |
| **Asset Tracking** → `/hospital/asset-tracking` | "Every ventilator, crash cart, and infusion pump tracked live with **RFID / BLE / GPS** — utilization, movement, theft alarms. Hospitals lose lakhs a year to misplaced equipment; this stops it." |
| **Communication Hub** → `/hospital/communication` | "One place for SMS, email, WhatsApp and voice outreach to patients." |

### ACT 4 — The Boardroom (the closer, ~2 min)

| Click | Say |
|---|---|
| **CEO Dashboard** → `/hospital/ceo` | "This is the owner's cockpit — revenue vs target, EBITDA, bed occupancy, payer mix, department growth. A live P&L of the hospital." |
| **CFO Dashboard** → `/hospital/cfo` | "Cash position, receivables aging, collection efficiency, payer settlements." |
| **COO Dashboard** → `/hospital/coo` | "Throughput, staffing, supply chain, ALOS." |
| **MS Dashboard** → `/hospital/ms` | "Medical Superintendent's view — quality metrics, NABH chapter readiness, adverse events, physician performance." |

> "Everything you just saw — kiosk, clinical, AI, billing, boardroom — is **one platform, one patient record, one login**."

---

## 4. Signature "wow" moments (make sure at least 2 land)

1. **Talk to the hospital.** The Dr. iSHA voice demo is the showstopper — do it live.
2. **QR wristband → scan flow.** Tangible patient-safety story executives instantly get.
3. **CEO live P&L dashboard.** Owners lean forward when they see their hospital as a live financial cockpit.
4. **Offline AI Scribe in a regional language.** Kills the "our internet is unreliable" objection.
5. **Asset tracking theft alarm.** Concrete money saved.

---

## 5. The moat (say when asked "why not [competitor]?")

- **Breadth + depth:** Legacy HMIS do admin. Point AI tools do one trick. **We do the whole hospital *and* the whole ecosystem *and* the AI** — orchestrated on one record.
- **Owned clinical AI + graceful fallback:** Our own medical model with a multi-provider cascade — it stays up when any single provider is down. Voice even falls back to on-device recognition.
- **Regulatory-grade governance (SaMD):** Confidence scores, SHAP/LIME explanations, pre-flight quality gates, model-change control through medical-director review, drift + demographic-bias monitoring, model cards. Aligned to **CDSCO (India)**, and FDA/EU frameworks for global expansion.
- **Interoperable, no lock-in:** **HL7 / FHIR**, **NHCX** claims, ABDM-ready. Plugs into what the hospital already has.
- **Paperless end-to-end:** kiosk check-in, e-consent, QR wristbands, digital MRD, AI discharge summaries.

---

## 5b. Why Mediqzy is ahead — HIS comparison (India + international)

**The category shift:** legacy HIS were built to *record* what happened (admin-first). Mediqzy is built to *coordinate care in real time with AI* (an **AI-native Healthcare OS**). That's a generational difference, not a feature gap.

| Capability | Legacy Indian HIS (Insta/Practo, Napier, KareXpert, Attune, MocDoc, Medixcel, Suvarna, DocPulse, Palash…) | International HIS (Epic, Oracle Health/Cerner, Meditech, InterSystems) | Point AI tools | **Mediqzy** |
|---|---|---|---|---|
| **Architecture** | Admin-first, module-stitched | Admin-first, monolithic, mature | Single-purpose | **AI-native, event-driven OS (HyperGrid)** |
| **Embedded AI** | Rare / bolt-on chatbot | Add-on modules, extra cost | The one thing they do | **Augmented AI care team in every module** |
| **Ecosystem breadth** | Hospital-centric | Hospital/enterprise | One niche | **Hospital+Clinic+Lab+Pharmacy+Ambulance+Homecare+Corporate+Patient** |
| **India rails (ABDM / NHCX / Ayushman)** | Partial | Weak / retrofitted | N/A | **Native** |
| **Interoperability (HL7/FHIR/CDA/CDS-Hooks)** | Limited | Strong but costly | N/A | **Native + IoT device mesh** |
| **Deployment & go-live** | On-prem, months | On-prem/private, 1–3 yrs | Fast, but siloed | **Cloud SaaS, weeks; modular** |
| **Cost model** | Per-module license + capex | Very high, capex + services | Point subscription | **Modular SaaS, adopt-what-you-need, no capex** |
| **Mobile-first + Voice** | Partial | Limited | Varies | **6 mobile apps + hands-free Dr. iSHA voice** |
| **Real-time command centre** | Rare | Available (enterprise) | No | **Built-in, event-driven** |
| **AI governance (SaMD)** | No | Emerging | Rarely | **Confidence + SHAP/LIME + quality gates + change control** |
| **IoT / RPM / device mesh** | No | Limited | No | **HyperGrid: MQTT, twins, wearables, alarms** |

> **How it solves the stated problem:** one platform kills the silos and double-entry; **cloud SaaS go-live in weeks** removes the 6–18-month risk; **modular pricing, no capex** removes the TCO/lock-in burden; **native ABDM/NHCX** fixes claims + compliance; **embedded, governed augmented AI** delivers decision support, automation and prediction that legacy HIS simply don't have; **HyperGrid** makes everything real-time.

*Positioning note: competitor capabilities evolve — verify specific claims before quoting them to a customer. Compare on the capability dimensions above, not on disparaging any vendor.*

---

## 6. Proof points to name-drop

- **Live in production** on AWS (`app.mediqzy.com`) — this is a real, running system, not slideware.
- **7 solution verticals:** Hospitals, Clinics, Labs, Pharmacy, Ambulance, Homecare, Corporate.
- **6 mobile apps:** Doctor, Nurse, Patient (iOS/Android), Admin, Ambulance, Lab Agent.
- **20+ role portals** including specialty departments: OT, ICU, MRD, HR, IT/EDP, Accounts, Quality/NABH, Security, Insurance Desk, Biomedical, Blood Bank, CSSD, Dietary, Mortuary, Procurement, Queue.
- **AI suite:** Voice assistant, ambient scribe (online + offline, multilingual), CDSS, AI vision/image analysis, health-risk scoring, ICD-10 auto-coding, drug-interaction intelligence.

---

## 7. Objection handling (quick rebuttals)

| Objection | Response |
|---|---|
| "We already have an HMIS." | "Great — Mediqzy is interoperable via HL7/FHIR. Start with the AI layer and the modules your current vendor can't do — voice, CDSS, asset tracking, the executive cockpit — then consolidate over time." |
| "AI in healthcare is risky." | "That's exactly why we built SaMD-grade governance: every clinical AI output has a confidence score and explanation, passes safety gates, and the physician always signs off. The AI assists; the doctor decides." |
| "Our internet is unreliable." | "The AI Scribe runs **offline** on-device, and the voice assistant falls back to on-device speech. Core workflows keep running." |
| "Change management is hard." | "Role-based portals mean each staff member sees only their workflow. Kiosk + QR wristband make the patient-facing part self-service from day one." |
| "Data security / compliance?" | "Multi-tenant isolation, role-based access, audit trails, and alignment to CDSCO/ABDM. Governance and interpretability are first-class, not bolted on." |

---

## 7b. ROI & hospital benefits — the premium USP

**Frame ROI as value levers with a clear mechanism, then validate with the hospital's own numbers.** The figures below are **illustrative ranges** for a mid-size (~150–300 bed) private hospital — replace them with the buyer's actuals in the pilot.

| Value lever | Mechanism in Mediqzy | Illustrative impact |
|---|---|---|
| **Recover revenue leakage** | Bedside → bill charge capture (charge master), nothing missed | **+2–5% of IP revenue** recovered |
| **Faster, cleaner claims** | NHCX + AI pre-auth + TPA cockpit | **Claim TAT ↓ 30–50%**, denials ↓, **DSO ↓** |
| **Higher bed throughput** | Care pathway + discharge-readiness + command centre | **ALOS ↓ 0.3–1.0 day** → more admissions/bed |
| **Asset utilisation** | RFID/RTLS tracking, theft alarms, less search time | **Fewer lost devices; staff time saved** |
| **Clinician productivity** | AI scribe + Dr. iSHA voice + CDSS | **Documentation time ↓ 40–60%**, more patients/day |
| **IT & vendor consolidation** | One SaaS replaces 5–15 systems, no capex | **Lower TCO, no server capex, fewer integrations** |
| **Faster go-live** | Cloud, weeks not months | **Revenue starts sooner; deployment risk removed** |
| **Patient safety / fewer errors** | Drug-interaction AI, QR wristband, e-MAR, alerts | **Fewer adverse events; lower liability** |
| **Accreditation** | Automated NABH/JCI readiness + quality metrics | **Faster, cheaper accreditation** |

**Illustrative first-year ROI (validate in pilot):** a hospital doing ₹100 Cr IP revenue recovering even **3% leakage (₹3 Cr)** plus faster cash cycles and consolidated IT typically **pays back the platform many times over in year one**. *(Illustrative — confirm with the hospital's revenue, ALOS, claim TAT and current IT spend.)*

**Why this becomes the hospital's USP / premium differentiator:**
- **"The Smart, AI-powered hospital."** Patient-facing wow — self-check-in kiosks, QR wristbands, an **AI health assistant**, a **family portal**, faster OPD, paperless discharge → a brand and **patient-acquisition** advantage.
- **Clinician magnet:** voice-first, ambient documentation and CDSS make it a hospital doctors *want* to work at.
- **Owner's cockpit:** a live P&L + command centre — decisions in real time, not month-end.
- **Premium/flagship features** to position as paid tiers: **Living Patient Workspace + AI care team**, **real-time Command Centre**, **cross-border / tele-collaboration**, **RPM / home monitoring**, **family portal**.

*Governance note: describe SaMD compliance as "built to CDSCO/FDA/EU frameworks and governance-ready," not "certified," until certification is granted. All ROI figures are illustrative estimates for discussion — not guarantees.*

---

## 8. Close & call to action

> "You've just seen a patient go from the front door to a paid, insured, documented discharge — with AI helping at every step and the owner watching the P&L in real time. That's Mediqzy: **one operating system for your entire hospital and the ecosystem around it.**
>
> Let's set up a **30-day pilot** on one department — say OPD + Pharmacy + the CEO dashboard — and I'll show you the revenue and time saved in your own numbers."

**Ask for:** the pilot department, a follow-up with the medical + finance leads, and access to run against their data.

---

## 9. Demo operator checklist (do this 30 min before)

- [ ] Confirm `app.mediqzy.com` loads; log in to the hospital portal.
- [ ] Warm up **every** URL in Act 1–4 once (first load can be slow).
- [ ] Test the **Dr. iSHA voice** demo in the actual room (mic permission + ambient noise). Have the typed fallback ready.
- [ ] Ensure the demo hospital has seeded data (patients, appointments, beds) so lists aren't empty.
- [ ] Open tabs in demo order; zoom browser to ~110–125% for the room.
- [ ] Have a backup recording of the full flow in case of network issues.
- [ ] Silence notifications; use a clean browser profile.

### Quick link list (paste into tabs)
```
app.mediqzy.com/hospital/os
app.mediqzy.com/kiosk/checkin
app.mediqzy.com/display/queue?zone=opd-waiting
app.mediqzy.com/hospital/practice-management
app.mediqzy.com/hospital/adt/admit
app.mediqzy.com/hospital/ward
app.mediqzy.com/doctor/assistant
app.mediqzy.com/doctor/voice-scribe
app.mediqzy.com/doctor/triage
app.mediqzy.com/hospital/er/queue
app.mediqzy.com/hospital/radiology
app.mediqzy.com/hospital/billing
app.mediqzy.com/hospital/insurance-claims
app.mediqzy.com/hospital/asset-tracking
app.mediqzy.com/hospital/ceo
app.mediqzy.com/hospital/cfo
app.mediqzy.com/hospital/coo
app.mediqzy.com/hospital/ms
```

---
*Positioning note: describe SaMD compliance as "built to CDSCO/FDA/EU frameworks and governance-ready" — not "certified" — unless/until certification is formally granted.*
