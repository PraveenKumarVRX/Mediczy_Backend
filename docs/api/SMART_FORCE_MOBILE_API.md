# Smart Force — Mobile API Reference

**Hosted base URL:** `https://app.mediqzy.com`
**Hosted compatibility URL:** `https://mediqzy.com`
**Format:** JSON  
**Updated:** 2026-10-25

---

## Organisation server connection (25 October 2026)

The URLs above are hosted examples. Universal Smart-Force and white-labelled product apps must discover the organisation server before collecting credentials. Use the [versioned tenant server connection contract](TENANT_MOBILE_SERVER_CONNECTION.md) for `GET /api/mobile/discovery`, enabled products, registration policy, identity binding and safe server switching.

The backend/admin release is deployed; native app binaries are unchanged. An unconfigured tenant server returns 503 until its administrator enables app access. Existing team/CRM authentication response shapes and password-recovery routes remain unchanged. See [release verification and limits](../testing/TENANT_APPS_RELEASE_2026-10-25.md).


## Authentication

All `/api/field/*` endpoints require a field executive JWT. Pass it as:

```
Authorization: Bearer <access_token>
```

The team user must have the **Field Force** permission. Errors return `{"error": "message"}`.

### POST /api/team/login

Sign in as a field executive.

**Request**
```json
{
  "email":    "exec@hospital.com",
  "password": "Secret123"
}
```

**Response 200**
```json
{
  "accessToken":  "eyJ...",
  "refreshToken": "eyJ...",
  "user": {
    "id": 42,
    "name": "Ravi Kumar",
    "email": "exec@hospital.com",
    "tenantId": 5,
    "permissions": ["Field Force"]
  }
}
```

### POST /api/team/forgot-password

Request a password reset link.

**Request:** `{ "email": "exec@hospital.com" }`  
**Response:** `{ "message": "Reset link sent" }`

### POST /api/team/refresh-token

Exchange a refresh token for a new access token.

**Request:** `{ "refreshToken": "eyJ..." }`  
**Response:** `{ "accessToken": "eyJ..." }`

---

## Attendance

### POST /api/field/attendance/clock-in

Clock in for the day with GPS coordinates. Idempotent — updates if already clocked in today.

**Request**
```json
{
  "lat":              12.9716,
  "lng":              77.5946,
  "accuracy_m":       12.5,
  "address":          "Koramangala, Bengaluru",
  "exception_type":   null,
  "exception_reason": null
}
```

**Response 200**
```json
{
  "id": 1201,
  "user_id": 42,
  "date": "2026-10-18",
  "clock_in_at": "2026-10-18T09:02:11Z",
  "clock_in_lat": 12.9716,
  "clock_in_lng": 77.5946,
  "status": "present"
}
```

### PATCH /api/field/attendance/clock-out

Clock out at end of day.

**Request:** `{ "lat": 12.9716, "lng": 77.5946, "accuracy_m": 8.0 }`  
**Response:** `{ "id": 1201, "clock_out_at": "2026-10-18T19:15:00Z", ... }`

### GET /api/field/attendance/today

Get today's attendance record.

**Response:** `{ "id": 1201, "status": "present", "clock_in_at": "...", "clock_out_at": null }`

### GET /api/field/attendance/history

Get attendance history for a given month.

| Query param | Required | Description |
|---|---|---|
| `month` | optional | `YYYY-MM` format. Defaults to current month. |

**Response:** `[ { "date": "2026-10-01", "status": "present", ... } ]`

---

## Visits & Day Plan

### GET /api/field/my/day-plan

Get the ordered multi-stop plan for a given day (sorted by `planned_sequence`, then `planned_at`).

| Query param | Required | Description |
|---|---|---|
| `date` | optional | `YYYY-MM-DD`. Defaults to today. |

**Response 200**
```json
[
  {
    "id": 301,
    "entity_name": "Manipal Hospital",
    "planned_sequence": 1,
    "estimated_arrival": "2026-10-18T10:00:00Z",
    "status": "planned"
  },
  {
    "id": 302,
    "entity_name": "Dr. Meera Nair",
    "planned_sequence": 2,
    "status": "planned"
  }
]
```

### GET /api/field/visits

List visits for the exec.

| Query param | Required | Description |
|---|---|---|
| `date` | optional | `YYYY-MM-DD` |
| `status` | optional | `planned \| checked_in \| completed \| cancelled \| exception` |

### POST /api/field/visits

Create a new planned or unplanned visit.

**Request**
```json
{
  "entity_type":      "hospital",
  "entity_id":        "H7K2PX",
  "entity_name":      "Manipal Hospital",
  "visit_type":       "regular",
  "planned_at":       "2026-10-18T10:00:00Z",
  "notes_planned":    "Discuss cardiology referrals",
  "is_unplanned":     false,
  "planned_sequence": 1
}
```

`visit_type` values: `regular | followup | sample_drop | cme_invite`

**Response:** `{ "id": 303, "status": "planned", ... }`

### PATCH /api/field/visits/:id/check-in

Check in at a visit location with GPS proof.

**Request:** `{ "lat": 12.9716, "lng": 77.5946, "accuracy_m": 9.0, "address": "Manipal Hospital, HAL" }`  
**Response:** `{ "id": 303, "status": "in_progress", "check_in_at": "...", ... }`

### PATCH /api/field/visits/:id/check-out

Complete visit with outcome.

**Request**
```json
{
  "lat": 12.9716,
  "lng": 77.5946,
  "notes_actual": "Met Dr. Ramesh. Agreed on 5 referrals/month.",
  "outcome": "positive"
}
```

### PATCH /api/field/visits/:id/sequence

Update planned stop sequence and estimated arrival.

**Request:** `{ "planned_sequence": 2, "estimated_arrival": "2026-10-18T11:30:00Z" }`

### PATCH /api/field/visits/:id/checklist

Update in-visit checklist items and duration.

**Request**
```json
{
  "visit_checklist": [
    { "item": "Introduced services", "done": true },
    { "item": "Left brochure",       "done": true },
    { "item": "Scheduled follow-up", "done": false }
  ],
  "duration_seconds": 1800
}
```

### POST /api/field/visits/:id/exception

Submit an out-of-beat exception request for manager approval.

**Request**
```json
{
  "beat_territory_id":  12,
  "distance_breach_km": 8.5,
  "reason": "Emergency corporate visit — patient hospitalised"
}
```

**Response:** `{ "id": 55, "status": "pending", "visit_id": 303, ... }`

### GET /api/field/visits/:id/exception

Get exception status for a specific visit.

### GET /api/field/my/exceptions

List all exceptions submitted by the exec.

| Query param | Required | Description |
|---|---|---|
| `status` | optional | `pending \| approved \| rejected` |

---

## Targets & Scorecard

### GET /api/field/my/targets

List active and past targets with actual vs target numbers.

**Response 200**
```json
[
  {
    "id": 10,
    "target_type": "visits",
    "target_value": 120,
    "period_start": "2026-10-01",
    "period_end": "2026-10-31",
    "visits_done": 72,
    "leads_closed": 3
  }
]
```

### GET /api/field/my/scorecard

MTD scorecard: visits, attendance, expenses, leads for the current month.

**Response 200**
```json
{
  "period": { "start": "2026-10-01", "end": "2026-10-31" },
  "visits":     { "total": 85, "completed": 72 },
  "attendance": { "present_days": 15 },
  "expenses":   { "claims": 3, "total_claimed": 4500, "approved_amount": 3800 },
  "leads":      { "total": 12, "won": 3, "lost": 1 },
  "target":     { "target_type": "visits", "target_value": 120 }
}
```

---

## Tour Plans

### GET /api/field/tour-plans

List monthly tour plans (last 12 months).

### POST /api/field/tour-plans

Create or update a draft tour plan.

**Request**
```json
{
  "month":      "2026-11-01",
  "beat_dates": {
    "2026-11-03": ["H7K2PX", "K9M2TA"],
    "2026-11-04": ["C4M9TA"]
  },
  "notes": "Focus on North Bengaluru corridor"
}
```

### PATCH /api/field/tour-plans/:id/submit

Submit a draft tour plan for manager approval.

**Response:** `{ "id": 8, "status": "submitted", "submitted_at": "2026-10-18T14:00:00Z" }`

---

## Daily Reports

### POST /api/field/daily-report

Submit end-of-day report.

**Request**
```json
{
  "report_date":      "2026-10-18",
  "summary":          "Visited 6 hospitals, 2 positive leads",
  "total_visits":     6,
  "leads_generated":  2,
  "issues_faced":     null,
  "next_day_plan":    "Follow-up with Manipal cardiology"
}
```

### GET /api/field/daily-report/today

Get today's report (if submitted).

---

## Expenses & Travel

### GET /api/field/expenses

List expense claims.

| Query param | Required | Description |
|---|---|---|
| `status` | optional | `draft \| submitted \| approved \| rejected` |

### POST /api/field/expenses

Create a new expense claim.

**Request**
```json
{
  "claim_date":   "2026-10-18",
  "claim_type":   "field_visit",
  "total_amount": 1200,
  "notes":        "Daily field visits — North Bengaluru"
}
```

`claim_type` values: `field_visit | cme | camp | other`

### POST /api/field/expenses/:id/items

Add line items to an expense claim.

**Request**
```json
{
  "expense_type": "fuel",
  "amount":       450,
  "description":  "Petrol to Manipal + Fortis",
  "receipt_url":  "https://s3.../receipt.jpg"
}
```

`expense_type` values: `fuel | auto | bus | food | accommodation | other`

### POST /api/field/travel

Create a travel request.

**Request**
```json
{
  "travel_date":    "2026-10-20",
  "from_location":  "Bengaluru",
  "to_location":    "Mysuru",
  "purpose":        "District hospital empanelment visit",
  "mode":           "train",
  "estimated_cost": 800
}
```

---

## Health Camps

### GET /api/field/camps

List health camps.

| Query param | Required | Description |
|---|---|---|
| `status` | optional | `planned \| ongoing \| completed \| cancelled` |
| `campaign_type` | optional | `health_camp \| cme \| rwa_camp \| corporate_camp \| roundtable` |

### POST /api/field/camps/:id/register

Register a patient at a live health camp (footfall counter).

**Request**
```json
{
  "patient_name":    "Suresh Iyer",
  "age":             58,
  "gender":          "male",
  "phone":           "9876543210",
  "address":         "Koramangala 4th Block",
  "screening_notes": "BP 140/90, referred to cardiologist",
  "high_risk_flag":  true,
  "referred_to":     "Cardiology"
}
```

### GET /api/field/camps/:id/registrations

Get all patient registrations for a camp.

---

## CME & KOL Events

### GET /api/field/cme-events

List CME / roundtable events.

| Query param | Required | Description |
|---|---|---|
| `status` | optional | `planned \| ongoing \| completed \| cancelled` |

### POST /api/field/cme-events

Create a new CME event.

**Request**
```json
{
  "name":             "North Bengaluru Cardiology Roundtable",
  "event_type":       "roundtable",
  "scheduled_at":     "2026-11-15T10:00:00Z",
  "venue":            "The Leela Palace, Bengaluru",
  "city":             "Bengaluru",
  "max_attendees":    40,
  "budget_allocated": 75000
}
```

`event_type` values: `cme | roundtable | webinar | symposium | other`

### POST /api/field/cme-events/:id/invite

Invite a doctor to a CME event. Returns a unique QR token for attendance.

**Request**
```json
{
  "doctor_crm_id": 88,
  "doctor_name":   "Dr. Priya Menon",
  "phone":         "9845012345"
}
```

**Response 200**
```json
{
  "id": 201,
  "cme_event_id": 6,
  "doctor_name": "Dr. Priya Menon",
  "qr_token": "A7F3D2B1C9E4",
  "invitation_sent_at": "2026-10-18T14:00:00Z"
}
```

### POST /api/field/cme-events/:id/checkin

Validate a QR token and mark a doctor as attended.

**Request:** `{ "qr_token": "A7F3D2B1C9E4" }`  
**Response:** `{ "id": 201, "attended": true, "checkin_at": "2026-11-15T10:12:00Z" }`

### GET /api/field/cme-events/:id/attendees

Get the invited / attended list for a CME event.

---

## Doctor CRM

### GET /api/field/doctor-crm

Search the doctor CRM (exec read-only).

| Query param | Required | Description |
|---|---|---|
| `search` | optional | Name / hospital / city search |
| `relationship_status` | optional | `prospect \| contacted \| visiting \| active_referrer \| champion \| inactive \| competitor_locked` |

---

## Leads

### GET /api/field/leads

List leads assigned to the exec.

| Query param | Required | Description |
|---|---|---|
| `status` | optional | `new \| contacted \| qualified \| proposal \| negotiation \| won \| lost \| parked` |

### POST /api/field/leads

Create a new lead from field.

**Request**
```json
{
  "lead_type":    "corporate",
  "entity_name":  "Ninjacart HQ",
  "contact_name": "Ramesh Patel",
  "phone":        "9900112233",
  "city":         "Bengaluru",
  "notes":        "Interested in annual health checks for 400 employees"
}
```

`lead_type` values: `corporate | doctor_referral | empanelment | camp | insurance | other`

---

## Institution Profile

### GET /api/field/institution/:entityType/:entityId

Get full profile of an institution: visit history, open leads, empanelment.

| Path param | Required | Description |
|---|---|---|
| `entityType` | required | `hospital \| clinic \| corporate \| lab \| pharmacy` |
| `entityId` | required | Entity `unique_id` (e.g. `H7K2PX`) or numeric id |

**Response 200**
```json
{
  "entity_type": "hospital",
  "entity_id":   "H7K2PX",
  "visits":      [ { "id": 301, "status": "completed", "exec_name": "Ravi Kumar" } ],
  "leads":       [ { "id": 33, "pipeline_stage": "qualified" } ],
  "empanelment": [ { "id": 12, "status": "active", "insurer_name": "Star Health" } ]
}
```

---

## Territory & Route

### GET /api/field/territory

Get the exec's territory polygons (GeoJSON) and today's planned stops.

| Query param | Required | Description |
|---|---|---|
| `date` | optional | `YYYY-MM-DD`. Defaults to today. |

**Response 200**
```json
{
  "territories": [
    {
      "id": 3,
      "name": "North Bengaluru",
      "polygon_geojson": { "type": "Polygon", "coordinates": [...] }
    }
  ],
  "stops": [
    {
      "id": 301,
      "entity_name": "Manipal Hospital",
      "planned_sequence": 1,
      "status": "planned"
    }
  ]
}
```

---

## Empanelment

### GET /api/field/empanelment

List empanelment applications.

| Query param | Required | Description |
|---|---|---|
| `status` | optional | `draft \| submitted \| under_review \| approved \| rejected` |

### POST /api/field/empanelment

Submit a new empanelment application.

**Request**
```json
{
  "entity_type":  "hospital",
  "entity_id":    "H7K2PX",
  "entity_name":  "Manipal Hospital",
  "insurer_name": "Star Health Insurance",
  "panel_type":   "cashless",
  "notes":        "Initial application — awaiting documents"
}
```

---

## Outreach & Permissions

### GET /api/field/outreach

List outreach accounts (RWA, NGO, corporate).

| Query param | Required | Description |
|---|---|---|
| `type` | optional | `rwa \| ngo \| school \| corporate \| govt \| other` |
| `relationship_status` | optional | `prospect \| contacted \| active_partner \| camp_done \| renewal \| inactive` |

### GET /api/field/outreach-permissions

List RWA / municipal / govt permissions.

| Query param | Required | Description |
|---|---|---|
| `type` | optional | `rwa \| municipal \| government \| other` |
| `status` | optional | `pending \| active \| expired \| revoked` |

### POST /api/field/outreach-permissions

Create a permission record.

**Request**
```json
{
  "permission_type": "rwa",
  "authority_name":  "BBMP Ward 174 Officer",
  "reference_no":    "BBMP/2026/1240",
  "valid_from":      "2026-10-18",
  "valid_until":     "2026-12-31",
  "document_url":    "https://s3.../permission.pdf",
  "outreach_id":     7
}
```

---

## Collateral & Samples

### POST /api/field/handovers

Record a collateral / sample handover with optional digital signature.

**Request**
```json
{
  "visit_id":      303,
  "doctor_crm_id": 88,
  "items": [
    { "type": "brochure", "name": "Cardiology Services Pack", "qty": 2 },
    { "type": "sample",   "name": "Ecosprin 75mg",            "qty": 10 }
  ],
  "digital_signature_url": "https://s3.../sig.png",
  "geofence_verified": true,
  "lat": 12.9716,
  "lng": 77.5946
}
```

### GET /api/field/handovers

List handover records.

| Query param | Required | Description |
|---|---|---|
| `visit_id` | optional | Filter by visit |
| `doctor_crm_id` | optional | Filter by doctor |

---

## Coupon Validator

### GET /api/field/coupon/validate/:code

Validate a coupon at OPD desk. Returns discount details and whether it can be redeemed.

| Path param | Required | Description |
|---|---|---|
| `code` | required | Coupon code (case-insensitive) |

**Response 200**
```json
{
  "id": 99,
  "code": "CARDIO20",
  "type": "PERCENTAGE",
  "value": 20,
  "description": "20% off cardiology consultation",
  "validUntil": "2026-12-31T23:59:59Z",
  "usageLimit": 500,
  "usageCount": 127,
  "can_redeem": true
}
```

---

## Notifications

### GET /api/field/notifications

Get the exec's notification inbox with unread count.

| Query param | Required | Description |
|---|---|---|
| `unread` | optional | `true` — return only unread |
| `limit` | optional | Max results (default 50, max 200) |

**Response 200**
```json
{
  "unread_count": 3,
  "notifications": [
    {
      "id": 200,
      "type": "exception_approved",
      "title": "Visit exception approved",
      "body": "Your Mysuru visit exception was approved by manager.",
      "read": false,
      "created_at": "2026-10-18T11:00:00Z"
    }
  ]
}
```

### PATCH /api/field/notifications/:id/read

Mark one notification as read.

**Response:** `{ "ok": true }`

### PATCH /api/field/notifications/read-all

Mark all unread notifications as read.

**Response:** `{ "marked_read": 3 }`

---

## Offline Sync

### POST /api/field/sync

Process a queue of offline operations idempotently. Each item must carry a unique `idempotency_key` — duplicates are skipped with status `"duplicate"`.

Supported operations: `clock_in · clock_out · create_visit · complete_visit · add_notification_read`

**Request**
```json
{
  "device_id":    "d7f3a901-...",
  "last_sync_at": "2026-10-18T08:00:00Z",
  "queue": [
    {
      "idempotency_key": "clock-in-20261018-d7f3",
      "operation": "clock_in",
      "payload": { "lat": 12.97, "lng": 77.59, "accuracy_m": 8.0 }
    },
    {
      "idempotency_key": "visit-303-complete-d7f3",
      "operation": "complete_visit",
      "payload": { "visit_id": 303, "notes_actual": "Done", "outcome": "positive" }
    }
  ]
}
```

**Response 200**
```json
{
  "processed": 2,
  "server_time": "2026-10-18T10:30:00Z",
  "results": [
    {
      "idempotency_key": "clock-in-20261018-d7f3",
      "status": "processed",
      "result": { "id": 1201 }
    },
    {
      "idempotency_key": "visit-303-complete-d7f3",
      "status": "processed",
      "result": { "id": 303 }
    }
  ]
}
```

---

## Diagnostics

### POST /api/field/telemetry

Log device GPS / network diagnostics.

**Request**
```json
{
  "device_id":    "d7f3a901-...",
  "app_version":  "1.4.2",
  "gps_accuracy": 15.2,
  "cell_signal":  -85,
  "battery_pct":  62,
  "network_type": "4G",
  "lat": 12.97,
  "lng": 77.59,
  "extras": { "screen": "day_plan", "crash_count": 0 }
}
```

**Response:** `{ "ok": true }`

---

## AI Features

### GET /api/field/ai/briefing

Get a personalised daily briefing generated by the AI from the exec's scorecard, active targets, and pending exceptions.

**Response 200**
```json
{
  "briefing": "Good morning Ravi! You've completed 72 of 120 visits this month — great pace. 3 leads in proposal stage need follow-up today. 1 out-of-beat exception is pending manager review.",
  "data": {
    "scorecard": { "visits_done": 72, "leads_closed": 3 },
    "targets": [ { "target_type": "visits", "target_value": 120, "period_end": "2026-10-31" } ],
    "pending_exceptions": 1
  }
}
```

### POST /api/field/ai/optimize-route

Submit a list of stops and get back an AI-optimised visit order.

**Request**
```json
{
  "current_location": { "lat": 12.97, "lng": 77.59 },
  "stops": [
    { "entity_name": "Manipal Hospital",    "visit_type": "followup" },
    { "entity_name": "Dr. Priya Menon",     "visit_type": "cme_invite" },
    { "entity_name": "Fortis Cunningham Rd","visit_type": "regular" }
  ]
}
```

**Response 200**
```json
{
  "order": [2, 1, 3],
  "optimized_stops": [
    { "entity_name": "Dr. Priya Menon",      "visit_type": "cme_invite" },
    { "entity_name": "Manipal Hospital",     "visit_type": "followup" },
    { "entity_name": "Fortis Cunningham Rd", "visit_type": "regular" }
  ],
  "efficiency_note": "Ordered by proximity estimate."
}
```

---

## CRM / Business Head Endpoints

> **Auth:** `POST /api/crm/login` → JWT → `Authorization: Bearer <token>`  
> The CRM user must have the `field_force:read` (read-only) or `field_force:manage` (full) capability.

Base path: `/api/crm/field-force`

### GET /summary

Overview KPIs for the BH dashboard.

### GET /attendance

Team attendance for a date range.

| Query param | Description |
|---|---|
| `date` | `YYYY-MM-DD`, defaults to today |
| `user_id` | Filter to one exec |

### GET /visits

All team visits.

| Query param | Description |
|---|---|
| `user_id` | Filter by exec |
| `status` | `planned \| checked_in \| completed \| cancelled \| exception` |
| `date_from / date_to` | Date range |

### GET /approvals

Unified approvals inbox.

| Query param | Description |
|---|---|
| `type` | `expenses \| exceptions \| tour_plans` |
| `status` | `pending \| approved \| rejected` |

### PATCH /approvals/exceptions/:id/approve

Approve an out-of-beat exception.

### PATCH /approvals/exceptions/:id/reject

Reject with reason. **Request:** `{ "rejection_reason": "..." }`

### PATCH /approvals/tour-plans/:id/approve

Approve a submitted tour plan.

### PATCH /approvals/tour-plans/:id/reject

**Request:** `{ "rejection_reason": "..." }`

### PATCH /leads/:id/stage

Progress a lead through the 7-stage pipeline.

**Request:** `{ "stage": "qualified", "notes": "Confirmed 400-employee headcount" }`

Pipeline stages: `new → contacted → qualified → proposal → empanelment → closed_won → closed_lost`

### PATCH /leads/:id/convert

Close a won deal with MOU details.

**Request**
```json
{
  "contract_value":   250000,
  "mou_document_url": "https://s3.../mou.pdf",
  "notes":            "3-year contract signed"
}
```

### GET /doctor-crm/:id

Enhanced doctor profile with MTD visit stats and gatekeeper intel.

### GET /doctor-crm/:id/intel

Get gatekeeper notes for a doctor.

### PUT /doctor-crm/:id/intel

Upsert gatekeeper notes.

**Request:** `{ "notes": "Prefers Friday visits. Gatekeeper: Mrs. Sheela (+919900112233)" }`

### GET /doctor-crm/:id/trail

Visit history + stats for a doctor.

### GET /camps

BH overview of all camps with footfall count.

### GET /camps/:id/registrations

Patient registrations for a specific camp.

### GET /exceptions

BH overview of all exceptions across the team.

### GET /tour-plans

BH oversight of all submitted tour plans.

### GET /cme-events

BH CME event management view.

### PATCH /cme-events/:id

Update CME event details or status.

### GET /cme-events/:id/speakers

KOL speaker ledger for a CME event.

### POST /cme-events/:id/speakers

Add a speaker.

**Request:** `{ "name": "Prof. K. Ramesh", "institution": "AIIMS Delhi", "topic": "Heart Failure Update 2026" }`

### PATCH /cme-events/speakers/:id

Update speaker details or compliance clearance.

**Request:** `{ "compliance_cleared": true, "fee_amount": 15000, "fee_paid": false }`

### GET /event-budgets

List event budget records.

### POST /event-budgets

Create a budget record for a CME event.

### PATCH /event-budgets/:id/approve

Approve an event budget.

### GET /coupons/analytics

Coupon usage analytics across the team.

### POST /targets/reallocate

Transfer quota from one exec to another.

**Request**
```json
{
  "from_user_id":  42,
  "to_user_id":    55,
  "target_type":   "visits",
  "transfer_qty":  20,
  "reason":        "Ravi on leave for 5 days"
}
```

### GET /team/:userId/pip

PIP (Performance Improvement Plan) scorecard for an exec — flags underperformance with reasons.

### POST /notifications/push

Push a notification to specific execs or the entire team.

**Request**
```json
{
  "user_ids": [42, 55],
  "type":    "reminder",
  "title":   "Submit tour plan",
  "body":    "November tour plan submission deadline is today."
}
```

Set `"user_ids": null` to broadcast to all field execs in the tenant.

---

## Error Reference

| HTTP status | Meaning |
|---|---|
| 400 | Validation error — check request body |
| 401 | Missing or expired JWT |
| 403 | Insufficient permissions / wrong role |
| 404 | Entity not found |
| 409 | Duplicate idempotency key (sync endpoint) |
| 429 | Rate limit exceeded |
| 500 | Server error |

---

*Generated 2026-10-18 · Mediczy Healthcare Platform*
