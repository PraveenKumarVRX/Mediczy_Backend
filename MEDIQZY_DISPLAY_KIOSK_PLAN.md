# MediQzy Hospital Display & Kiosk System
## Implementation Plan — v1.0

**Date:** May 16, 2026
**Status:** Phase 1 active implementation
**Scope:** All patient-facing, staff-facing, and clinical displays across a multi-specialty hospital campus

---

## 1. Purpose

Every square metre of a hospital communicates. A queue number called over a crackling PA system, a whiteboard scrawled with patient names in a corridor, a nurse refreshing a browser to check bed status — these are all solved problems. This plan replaces them with a unified, live, browser-based display platform integrated directly into MediQzy's existing clinical data.

The system provides:
- **Zero proprietary hardware dependency** — any screen with a browser runs any display
- **One control plane** — admin pushes content, data, and emergency alerts from a single interface
- **Live clinical data** — displays pull from the same APIs that power the clinical workflows
- **Emergency override** — a single action broadcasts a full-screen alert to every active display in the building

---

## 2. Core Design Principles

1. **Browser-native** — every display is a URL. Chrome in kiosk mode. No proprietary CMS players.
2. **Device token auth** — each physical screen has a long-lived device token. No staff login. No session expiry mid-display.
3. **SSE for live updates** — Server-Sent Events push queue changes, vitals alerts, and emergency broadcasts to all connected screens without polling overhead.
4. **Privacy by zone** — public displays show tokens/initials only. Clinical staff displays are in restricted areas and show full patient data. Room displays are visible only to the patient in that room.
5. **Offline graceful degradation** — on network loss, display shows last-known-good data with a "Reconnecting..." indicator rather than a blank screen.
6. **Emergency always wins** — any MQTT/SSE emergency broadcast immediately overrides every display with a full-screen alert, regardless of what was being shown.

---

## 3. Display Taxonomy

| Type | Interaction | Auth requirement | Data sensitivity | Examples |
|---|---|---|---|---|
| **A — Self-service kiosk** | Full touch | None / patient ABHA/phone | Low (own data only) | Check-in, wayfinding, discharge feedback |
| **B — Public passive display** | None | Device token (read-only) | Low (aggregate, token-based) | Queue board, lobby signage, pharmacy queue |
| **C — Staff clinical display** | Minimal read-only | Device token + restricted location | High (full patient data) | ICU board, OT status, nursing station, ward board |
| **D — Bedside/room terminal** | Patient interactive | Device token + room assignment | Medium (own patient data) | Bedside terminal, care team, meal order |

---

## 4. Zone-by-Zone Specifications

### Zone 1 — Main Entrance / Lobby

| ID | Display | Type | Hardware | Content | Data source | Refresh |
|---|---|---|---|---|---|---|
| 1a | Self-check-in kiosk | A | 21" standing touchscreen | Appointment lookup by phone/ABHA → confirm → issue token → wayfinding | Appointment API + Queue API | On interaction |
| 1b | Wayfinding & directory kiosk | A | 21" touchscreen | Floor map, find doctor, department hours, visitor pass | CMS + Doctor schedule | On interaction |
| 1c | Lobby announcement screen | B | 55" wall landscape | Today's doctor roster, health tips carousel, hospital news, visiting hours | CMS + Doctor module | 60s + SSE push |

### Zone 2 — OPD Waiting Lounge

| ID | Display | Type | Hardware | Content | Data source | Refresh |
|---|---|---|---|---|---|---|
| 2a | Queue token board | B | 55" wall | Now serving (large token), next 3 tokens, counter, doctor, avg wait, audio TTS | Queue module WebSocket | SSE push on change |
| 2b | Doctor-specific sub-display | B | 32" per cluster | Tokens for this doctor only, status (available/in consult/break), wait time | Queue module filtered | SSE push |
| 2c | Health education loop | B | 42" wall | Health education videos, seasonal advisories, QR for patient app | CMS playlist | 30-min loop |

### Zone 3 — OPD Registration / Front Desk

| ID | Display | Type | Hardware | Content | Data source | Refresh |
|---|---|---|---|---|---|---|
| 3a | Staff counter display (patient-facing) | C | 24" countertop | Registration confirmation: MRN, token, counter, wait time | Registration workflow mirror | On event |
| 3b | Token confirmation | B | 10" counter-facing | "Your token: A-014 · Counter 3 · Est. 18 min" | Queue module on token issuance | On issuance |

### Zone 4 — Doctor Consultation Room

| ID | Display | Type | Hardware | Content | Data source | Refresh |
|---|---|---|---|---|---|---|
| 4a | Outside-door status panel | B | 7" door-mounted | Doctor name, status (Available/In Consult/Break), current token | Doctor module + Queue | SSE push |
| 4b | Doctor desk display (staff-facing, not patient-visible) | C | 10" desk | Patient name, age, chief complaint, allergies, last 3 labs, medications, scribe status | Doctor EMR on "Call Next" | On patient load |

### Zone 5 — IPD Patient Room

| ID | Display | Type | Hardware | Content | Data source | Refresh |
|---|---|---|---|---|---|---|
| 5a | Bedside patient terminal | D | 15" wall-mounted touch | Care team, medications today, diet plan, care tasks, nurse call, meal rating, TV menu, patient app QR | IPD + Nursing + Dietary | 5 min + SSE |
| 5b | Room door panel | B | 7" e-ink/LCD outside door | Bed, patient initials, isolation class, NPO flag, fall risk, care team | IPD + Nursing orders | SSE on order change |
| 5c | Ward nursing station | C | 55" wall | All ward beds: vitals, med due, pending orders, fall risk, discharge status | Nursing + Vitals engine | 60s + SSE alerts |

### Zone 6 — ICU

| ID | Display | Type | Hardware | Content | Data source | Refresh |
|---|---|---|---|---|---|---|
| 6a | ICU central dashboard | C | Dual 55" or 86" | All beds: HR, BP, SpO2, RR, Temp, NEWS2, vent flag, med alerts | MQTT IoT + ICU module | 15s + SSE critical |
| 6b | Per-bed vitals display | C | 15" per bed | This bed vitals trend (2h), medications, alerts, vent settings | MQTT per-bed stream | 15s |
| 6c | ICU bay door panel | B | 7" door panel | Bed ID, isolation, infection precautions, care team | ICU on admission | SSE on change |

### Zone 7 — Emergency / Casualty

| ID | Display | Type | Hardware | Content | Data source | Refresh |
|---|---|---|---|---|---|---|
| 7a | ER triage status board (staff) | C | 65" restricted area | All ER patients: ESI level (color 1–5), location, doctor, time in ER | ER + Triage AI | 30s + SSE |
| 7b | ER waiting area (public) | B | 55" public | Wait times by acuity level (ESI 3 ≈ 45 min), ER advisories | ER aggregate (no names) | 5 min |
| 7c | Ambulance bay status | C | 32" ambulance bay | Incoming ETAs, receiving team, trauma bay availability | Ambulance + ER module | SSE push |
| 7d | Resuscitation room display | C | 55" resus room | Patient vitals, allergies/drug flags, team roles, resus checklist | ER + MQTT on Code Blue | SSE push |

### Zone 8 — Operation Theatre

| ID | Display | Type | Hardware | Content | Data source | Refresh |
|---|---|---|---|---|---|---|
| 8a | OT schedule board (corridor) | B | 55" corridor | Today's OT list: patient initials only, procedure, surgeon, status | OT module | SSE on status change |
| 8b | OT complex status (staff) | C | 65" OT nurses' station | All OT rooms: surgeon, procedure, elapsed time, CSSD set status, blood availability | OT + CSSD + Blood Bank | 60s + SSE |
| 8c | Individual OT room display | C | 21" per OT | WHO checklist status, patient ID, allergy, blood group, implant tracking | OT module per-room | On checklist event |

### Zone 9 — ICU/OT Family Waiting

| ID | Display | Type | Hardware | Content | Data source | Refresh |
|---|---|---|---|---|---|---|
| 9a | Family status display | B | 42" wall | Token-based only: "Patient [T3]: ICU — Stable" / "Patient [T5]: OT — In progress" | ICU + OT (privacy-safe) | SSE push |

### Zone 10 — Pharmacy

| ID | Display | Type | Hardware | Content | Data source | Refresh |
|---|---|---|---|---|---|---|
| 10a | Pharmacy queue display | B | 42" + audio | Now dispensing token, next tokens, window number, estimated wait | Pharmacy POS | SSE push |
| 10b | Prescription ready board | B | 32" secondary | "Ready: A-032, A-028" (token-based) | Pharmacy dispensing | SSE on ready |

### Zone 11 — Laboratory

| ID | Display | Type | Hardware | Content | Data source | Refresh |
|---|---|---|---|---|---|---|
| 11a | Lab sample collection queue | B | 42" wall | Token queue for sample collection | LIS queue | SSE push |
| 11b | Report ready | B | 32" | "Report ready: MRN-XXXX" or push via WhatsApp preferred | LIS + notification | SSE push |

### Zone 12 — Blood Bank

| ID | Display | Type | Hardware | Content | Data source | Refresh |
|---|---|---|---|---|---|---|
| 12a | Blood bank inventory board | C | 32" counter | 8 blood groups × component: units available, expiring <72h, active requisitions | Blood Bank module | 5 min + SSE on issuance |

### Zone 13 — CSSD

| ID | Display | Type | Hardware | Content | Data source | Refresh |
|---|---|---|---|---|---|---|
| 13a | CSSD workflow board | C | 21" touchscreen | Jobs by stage, autoclave cycle countdown, OT requests pending, sets ready | CSSD module | SSE on job change |

### Zone 14 — Insurance / TPA Desk

| ID | Display | Type | Hardware | Content | Data source | Refresh |
|---|---|---|---|---|---|---|
| 14a | Insurance staff display | C | Dual 24" | Pending pre-auth by urgency, claim queue, eligibility lookup, denial risk score | Insurance + AI pre-auth | 5 min + SSE |

### Zone 15 — Dietary / Kitchen

| ID | Display | Type | Hardware | Content | Data source | Refresh |
|---|---|---|---|---|---|---|
| 15a | Kitchen dispatch display | C | Industrial 21" waterproof | Diet orders by ward/bed, allergen flags, NPO patients (red), delivery confirmation | Dietary module | SSE on order change |

### Zone 16 — Discharge Lounge

| ID | Display | Type | Hardware | Content | Data source | Refresh |
|---|---|---|---|---|---|---|
| 16a | Discharge status board | B | 42" wall | Patients by token: checklist status (Summary ✓ / Pharmacy ✓ / Billing ● / Transport ●) | Discharge planning + Billing | SSE on step complete |
| 16b | Discharge self-service kiosk | A | 21" touchscreen | PREMS feedback, discharge instructions QR, transport request, final bill QR | PREMS + Billing + CMS | On interaction |

### Zone 17 — Corridors / Common Areas

| ID | Display | Type | Hardware | Content | Data source | Refresh |
|---|---|---|---|---|---|---|
| 17a | Corridor digital signage | B | 32"–42" portrait at junctions | Wayfinding arrows, department hours, hospital advisories, health tips | CMS | 60s |
| 17b | Cafeteria menu board | B | 42" landscape | Today's menu, prices, dietary labels, specials | Dietary CMS | Daily update |
| 17c | Staff notice board | B | 32" staff corridors | Shift schedule, upcoming training, HR announcements | HR module CMS | Daily update |

### Zone 18 — Admin / Executive

| ID | Display | Type | Hardware | Content | Data source | Refresh |
|---|---|---|---|---|---|---|
| 18a | Command centre dashboard | C | 86" or dual 55" | Live KPIs: census, OPD, OT utilisation, bed occupancy, revenue today, incidents, NPS | Admin analytics | 5 min |

---

## 5. Control Architecture

```
                    ┌──────────────────────────────────────────┐
                    │        DISPLAY CONTROL PLATFORM           │
                    │                                          │
                    │  ┌───────────────────────────────────┐   │
                    │  │          Admin Panel               │   │
                    │  │  • Device registry                 │   │
                    │  │  • Zone assignment                 │   │
                    │  │  • CMS content scheduling          │   │
                    │  │  • Emergency broadcast             │   │
                    │  │  • Live device health              │   │
                    │  └───────────────────────────────────┘   │
                    │                  │                        │
                    │    ┌─────────────┼──────────────┐         │
                    │    ▼             ▼              ▼         │
                    │  SSE broker   REST APIs    MQTT bridge    │
                    │  (real-time)  (poll data)  (IoT/vitals)  │
                    └──────────────────────────────────────────┘
                              │            │
              ┌───────────────┼────────────┼────────────┐
              ▼               ▼            ▼            ▼
        /display/       /display/     /kiosk/      /display/
        queue           icu-board     checkin      signage
        (OPD token      (vitals       (patient     (CMS loop)
         board)          grid)         self-svc)
```

### URL scheme

| Path | Zone | Type |
|---|---|---|
| `/display/queue?zone=OPD-MAIN` | OPD waiting lounge | B |
| `/display/queue?zone=OPD-DR1` | Doctor 1 sub-display | B |
| `/display/icu-board?ward=ICU-A` | ICU central dashboard | C |
| `/display/bedside?bed=4B-12` | IPD bedside terminal | D |
| `/display/ward?ward=4B` | Ward nursing station | C |
| `/display/blood-bank` | Blood bank counter | C |
| `/display/ot-status` | OT complex board | C |
| `/display/signage?zone=lobby` | Lobby loop | B |
| `/kiosk/checkin` | OPD self check-in | A |
| `/kiosk/discharge` | Discharge kiosk | A |
| `/display/admin` | Device management UI | Admin |

### Device authentication

Every physical screen is registered in the `display_devices` table and issued a **device token** (random 32-byte hex, stored as a bearer token or URL query param). This token:
- Does not expire (screens run 24/7, login flows are impractical)
- Can be revoked from the admin panel
- Is used to identify the device in SSE connections and heartbeat pings
- Carries its zone assignment, so the display knows what to render

### Live data transport

| Data type | Transport | Why |
|---|---|---|
| Queue token changes | SSE push | Instant, no polling |
| Emergency broadcast | SSE push to all | Must reach every screen immediately |
| ICU vitals | SSE push (from MQTT bridge) | 15s cadence, critical path |
| Blood bank inventory | REST poll (5 min) | Low-frequency |
| CMS content | REST poll (60s) | Low-frequency |
| Device heartbeat | REST POST (60s) | Keep device registry current |

### Emergency broadcast flow

```
Admin presses "Emergency Alert" button
        ↓
POST /api/display/emergency/broadcast
{type: "CODE_BLUE", message: "Code Blue — ICU Bed 4", location: "ICU Wing B"}
        ↓
Stored in emergency_broadcasts table (active=true)
        ↓
SSE broker pushes event to ALL connected display clients
        ↓
Every DisplayShell receives event: type "emergency"
        ↓
Red full-screen overlay renders immediately, audio alert plays
        ↓
Admin calls DELETE /api/display/emergency/:id to dismiss
        ↓
SSE push: emergency_clear → overlays dismiss
```

Alert types: `CODE_BLUE` · `FIRE` · `EVACUATION` · `LOCKDOWN` · `MASS_CASUALTY` · `CUSTOM`

---

## 6. Security & Privacy Model

| Zone | Patient name shown | PHI level | Access control |
|---|---|---|---|
| Public (lobby, OPD waiting) | Never — token/initials only | None | Public URL |
| Pharmacy/Lab queue | Token number only | None | Public URL |
| OT corridor board | Patient initials + procedure type | Low | Public URL |
| Family waiting (ICU/OT) | "Patient [Token N]" — status only | None | Public URL |
| Ward nursing station | Full name + all clinical data | High | Device token + physical access control |
| ICU central board | Full name + live vitals | Critical | Device token + physical access control |
| Bedside terminal | Own data only | Medium | Room assignment (device token = bed) |
| Doctor desk display | Full EMR summary | High | Device token + office lock |

---

## 7. Hardware Recommendations

| Display type | Recommended device | Notes |
|---|---|---|
| Large wall display (55"+) | Commercial-grade Android TV + Chrome browser | Samsung QM or LG NANO commercial series |
| Medium display (32"–42") | Raspberry Pi 4 + 4K display | Cost-effective, browser-based |
| Small door panel (7"–10") | Raspberry Pi Zero 2W + small touchscreen | Low power, PoE powered |
| Counter kiosk (21") | Intel NUC + touch monitor + optionally thermal printer | For token printing |
| Bedside terminal (15") | Tablet (Samsung Galaxy Tab A9+) in wall mount | Touch-capable, hygienic case |
| ICU bedside display (15") | Medical-grade ARM device | IP54-rated, wipe-clean |

All run Chrome in `--kiosk --noerrdialogs --disable-infobars --app=<display_url>` mode.

---

## 8. Existing MediQzy Integrations

| Display | Source module | API endpoint used |
|---|---|---|
| OPD queue board | Queue management | `/api/display/queue` (aggregates from queue state) |
| ICU board | ICU module + MQTT | `/api/display/icu-board` (reads ICU vitals) |
| Blood bank display | Blood Bank module | `/api/display/blood-bank` (reads blood_bank_units) |
| OT status board | OT module | `/api/display/ot-status` (reads OT schedules) |
| CSSD display | CSSD module | `/api/display/cssd` (reads cssd_jobs, cssd_cycles) |
| Bedside terminal | IPD + Nursing + Dietary | `/api/display/bedside` (reads admission + dietary orders) |
| Ward nursing board | Nursing + Vitals | `/api/display/ward` (reads ward census + vitals) |
| Self check-in | Appointments + Queue | `/api/display/checkin/*` |
| Discharge board | Discharge planning | `/api/display/discharge-status` |
| Blood bank inventory | Blood Bank module | reads `blood_bank_units` table |

---

## 9. Implementation Phases

### Phase 1 — Foundation + Highest-traffic displays (this sprint)

Deliverables:
- [x] Plan document (this file)
- [x] `hospital-display.route.js` — device registry, SSE broker, emergency broadcast, all data endpoints
- [x] `DisplayShell.tsx` — fullscreen wrapper, SSE client, emergency overlay, clock, offline indicator
- [x] `OPDQueueDisplay.tsx` — OPD token board with audio TTS
- [x] `SelfCheckinKiosk.tsx` — appointment lookup → token issuance
- [x] `ICUBoardDisplay.tsx` — ICU vitals grid (MQTT-fed)
- [x] `BedsideDisplay.tsx` — patient room terminal
- [x] `BloodBankDisplay.tsx` — blood inventory board
- [x] `OTStatusDisplay.tsx` — OT status board
- [x] `WardNursingDisplay.tsx` — ward nursing station
- [x] `DisplayAdminPage.tsx` — device registry + emergency broadcast admin
- [x] `DischargeStatusDisplay.tsx` — discharge lounge status board (bonus)

Acceptance criteria:
- Any screen can be registered via admin panel and assigned a zone
- OPD queue board updates within 2 seconds of a token being called
- Emergency broadcast reaches all connected screens within 1 second
- Self check-in kiosk issues a valid queue token end-to-end
- All pages build without TypeScript errors

### Phase 2 — Clinical depth + more zones (next sprint)

- Doctor room door panels (4a, 4b) with EMR auto-load
- ER displays (7a, 7b, 7c, 7d) integrated with triage AI
- OT individual room display (8c) with WHO checklist
- Pharmacy queue board (10a, 10b)
- Lab queue board (11a)
- CSSD workflow board (13a)
- Dietary kitchen display (15a)
- Discharge kiosk with PREMS (16b)

### Phase 3 — CMS, signage, executive

- CMS playlist engine (lobby, corridor, cafeteria, staff boards)
- Family waiting display with privacy-safe patient status (9a)
- Insurance desk display (14a)
- Executive command centre (18a)
- Full CMS admin: content scheduling, playlist builder, zone targeting

---

## 10. New Routes Summary

### Backend
```
/api/display/devices              — register, list, manage devices
/api/display/devices/:token/hb    — heartbeat ping from device
/api/display/events               — SSE stream (device subscribes here)
/api/display/emergency/broadcast  — push emergency alert (admin)
/api/display/emergency/active     — get current active alert
/api/display/emergency/:id        — dismiss alert (admin)
/api/display/queue                — OPD queue state for display board
/api/display/icu-board            — ICU vitals summary
/api/display/blood-bank           — blood bank inventory
/api/display/ot-status            — OT schedule and room status
/api/display/ward                 — ward nursing overview
/api/display/bedside              — bedside patient terminal data
/api/display/discharge-status     — discharge lounge status
/api/display/cssd                 — CSSD job/cycle status
/api/display/checkin/appointments — appointment lookup for kiosk
/api/display/checkin/issue-token  — issue queue token from kiosk
```

### Frontend
```
/display/queue          — OPD token board
/display/icu-board      — ICU vitals dashboard
/display/blood-bank     — blood bank inventory
/display/ot-status      — OT status board
/display/ward           — ward nursing station
/display/bedside        — patient room terminal
/display/signage        — CMS signage loop
/kiosk/checkin          — self check-in kiosk
/kiosk/discharge        — discharge kiosk
/display/admin          — device management + emergency broadcast
```
