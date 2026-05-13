#!/usr/bin/env python3
"""
Smoke test for Doctor App API Integration Guide v2.4
Tests all major endpoint categories against the production API.
"""

import sys
import json
import time
import requests
from datetime import date, timedelta

BASE = "https://api.mediqzy.com"
DOCTOR_EMAIL = "doctor@mediczy.com"
DOCTOR_PASS  = "Doctor123"
PATIENT_EMAIL = "user@mediczy.com"
PATIENT_PASS  = "User123"
DOCTOR_ID = 70
PATIENT_ID = 19

PASS = "\033[92m✓ PASS\033[0m"
FAIL = "\033[91m✗ FAIL\033[0m"
WARN = "\033[93m⚠ WARN\033[0m"
INFO = "\033[94mℹ INFO\033[0m"

results = []

def check(label, r, expected_status=200, success_key=None, required_fields=None, allow_empty=False):
    if isinstance(expected_status, list):
        ok = r.status_code in expected_status
    else:
        ok = r.status_code == expected_status
    body = {}
    try:
        body = r.json()
    except Exception:
        pass

    if ok and success_key:
        ok = bool(body.get(success_key) if success_key != "any" else body)

    if ok and required_fields:
        for f in required_fields:
            if "." in f:
                parts = f.split(".")
                node = body
                found = True
                for p in parts:
                    if isinstance(node, dict) and p in node:
                        node = node[p]
                    else:
                        found = False
                        break
                if not found:
                    ok = False
                    break
            else:
                if f not in body:
                    ok = False
                    break

    tag = PASS if ok else FAIL
    snippet = str(body)[:120].replace("\n", " ")
    print(f"  {tag}  [{r.status_code}] {label}")
    if not ok:
        print(f"          → {snippet}")
    results.append((label, ok, r.status_code, snippet))
    return body

def section(title):
    print(f"\n{'='*60}")
    print(f"  {title}")
    print(f"{'='*60}")

# ─────────────────────────────────────────────────────────
# 1. AUTH
# ─────────────────────────────────────────────────────────
section("1. AUTHENTICATION")

r = requests.post(f"{BASE}/api/doctors/login", json={"email": DOCTOR_EMAIL, "password": DOCTOR_PASS})
body = check("POST /api/doctors/login", r, 200, "token")
doctor_token = body.get("token", "")
DH = {"Authorization": f"Bearer {doctor_token}"}

# Patient login uses OTP (not password) — guide section 2 confirms this
# Just verify the send-OTP endpoint works (no OTP delivery possible in smoke test)
r = requests.post(f"{BASE}/api/auth/send-otp", json={"phoneNumber": "+919884089921"})
check("POST /api/auth/send-otp (patient OTP flow)", r, 200, required_fields=["success"])

if not doctor_token:
    print("\n[FATAL] Doctor login failed — cannot continue.\n")
    sys.exit(1)

# ─────────────────────────────────────────────────────────
# 2. DOCTOR PROFILE
# ─────────────────────────────────────────────────────────
section("3. DOCTOR PROFILE")

r = requests.get(f"{BASE}/api/doctors/profile", headers=DH)
body = check("GET /api/doctors/profile", r, 200, required_fields=["doctor"])
doc = body.get("doctor", {})
print(f"   {INFO} Doctor: {doc.get('firstName','')} {doc.get('lastName','')} | Specialization: {doc.get('specialization','')}")

# ─────────────────────────────────────────────────────────
# 3. DASHBOARD & ANALYTICS
# ─────────────────────────────────────────────────────────
section("4. DASHBOARD & ANALYTICS")

r = requests.get(f"{BASE}/api/doctors/dashboard/stats", headers=DH)
check("GET /api/doctors/dashboard/stats", r, 200)

r = requests.get(f"{BASE}/api/doctors/analytics?period=month", headers=DH)
check("GET /api/doctors/analytics?period=month", r, 200)

# ─────────────────────────────────────────────────────────
# 4. APPOINTMENTS
# ─────────────────────────────────────────────────────────
section("5. APPOINTMENT MANAGEMENT")

r = requests.get(f"{BASE}/api/appointments/doctor?limit=5", headers=DH)
body = check("GET /api/appointments/doctor", r, 200, required_fields=["appointments"])
appt_list = body.get("appointments", [])
print(f"   {INFO} Total appointments returned: {len(appt_list)}")
first_appt_id = appt_list[0]["id"] if appt_list else None

r = requests.get(f"{BASE}/api/appointments/doctor/today", headers=DH)
check("GET /api/appointments/doctor/today", r, 200)

if first_appt_id:
    r = requests.get(f"{BASE}/api/appointments/{first_appt_id}", headers=DH)
    check(f"GET /api/appointments/:id ({first_appt_id})", r, 200)

# ─────────────────────────────────────────────────────────
# 5. AVAILABILITY & SCHEDULE
# ─────────────────────────────────────────────────────────
section("6. AVAILABILITY & SCHEDULE")

r = requests.get(f"{BASE}/api/doctors/{DOCTOR_ID}/availability")
check(f"GET /api/doctors/:id/availability (public)", r, 200)

tomorrow = (date.today() + timedelta(days=1)).strftime("%Y-%m-%d")
r = requests.get(f"{BASE}/api/doctors/{DOCTOR_ID}/available-slots?date={tomorrow}")
check(f"GET /api/doctors/:id/available-slots?date={tomorrow} (public)", r, 200)

r = requests.get(f"{BASE}/api/doctors/availability/dashboard", headers=DH)
body = check("GET /api/doctors/availability/dashboard", r, 200, required_fields=["dashboard"])
weekly = body.get("dashboard", {}).get("weeklyAvailability", {})
print(f"   {INFO} Days in weekly schedule: {list(weekly.keys())[:5]}")

# ─────────────────────────────────────────────────────────
# 6. DOCTOR SETTINGS
# ─────────────────────────────────────────────────────────
section("7. DOCTOR SETTINGS")

r = requests.get(f"{BASE}/api/doctor-settings/appointment-config", headers=DH)
check("GET /api/doctor-settings/appointment-config", r, 200)

r = requests.get(f"{BASE}/api/doctor-settings/available-slots/{DOCTOR_ID}?date={tomorrow}", headers=DH)
check(f"GET /api/doctor-settings/available-slots/:id (public)", r, 200)

r = requests.get(f"{BASE}/api/doctor-settings/attached-pharmacies", headers=DH)
check("GET /api/doctor-settings/attached-pharmacies", r, 200)

r = requests.get(f"{BASE}/api/doctor-settings/attached-labs", headers=DH)
check("GET /api/doctor-settings/attached-labs", r, 200)

# ─────────────────────────────────────────────────────────
# 7. PRESCRIPTIONS
# ─────────────────────────────────────────────────────────
section("8. PRESCRIPTIONS")

r = requests.get(f"{BASE}/api/prescriptions/doctor", headers=DH)
body = check("GET /api/prescriptions/doctor", r, 200, required_fields=["prescriptions"])
rx_list = body.get("prescriptions", [])
print(f"   {INFO} Total prescriptions: {body.get('count', len(rx_list))}")
first_rx_id = rx_list[0]["id"] if rx_list else None

r = requests.get(f"{BASE}/api/prescriptions/doctor/issued", headers=DH)
check("GET /api/prescriptions/doctor/issued", r, 200)

if first_rx_id:
    r = requests.get(f"{BASE}/api/prescriptions/{first_rx_id}", headers=DH)
    check(f"GET /api/prescriptions/:id ({first_rx_id})", r, 200)

# Create a draft prescription
rx_payload = {
    "patientId": PATIENT_ID,
    "diagnosis": "Smoke test diagnosis — ATBT",
    "chiefComplaints": "Automated smoke test",
    "medications": [
        {"name": "Paracetamol", "composition": "500mg", "dosage": "1 tab",
         "frequency": "TDS", "duration": "3 days", "quantity": "9"}
    ],
    "notes": "Auto-generated by smoke test — safe to delete"
}
r = requests.post(f"{BASE}/api/prescriptions", headers=DH, json=rx_payload)
body = check("POST /api/prescriptions (create draft)", r, 201, required_fields=["prescription"])
new_rx_id = body.get("prescription", {}).get("id")
new_rx_pid = body.get("prescription", {}).get("prescriptionId")
if new_rx_id:
    print(f"   {INFO} Created prescription ID: {new_rx_id}, prescriptionId: {new_rx_pid}")

if first_appt_id:
    r = requests.get(f"{BASE}/api/prescriptions/appointment/{first_appt_id}", headers=DH)
    # 404 is also valid (no prescription for that appt)
    check(f"GET /api/prescriptions/appointment/:id", r, 200 if r.status_code == 200 else 404)

# ─────────────────────────────────────────────────────────
# 8. PATIENT MANAGEMENT
# ─────────────────────────────────────────────────────────
section("9. PATIENT MANAGEMENT")

r = requests.get(f"{BASE}/api/doctors/patients", headers=DH)
check("GET /api/doctors/patients", r, 200)

r = requests.get(f"{BASE}/api/doctors/my-patients", headers=DH)
body = check("GET /api/doctors/my-patients", r, 200)
my_patients = (body.get("patients") or body.get("data") or [])
print(f"   {INFO} My-patients count: {len(my_patients)}")

# 9.5/9.6 correct paths are /my-patients/:id/profile and /records
# Get a real patient ID from my-patients list
first_patient_id = my_patients[0].get('id') or my_patients[0].get('patientId') if my_patients else None

if first_patient_id:
    r = requests.get(f"{BASE}/api/doctors/my-patients/{first_patient_id}/profile", headers=DH)
    body = check(f"GET /api/doctors/my-patients/:id/profile ({first_patient_id})", r, 200, required_fields=["patient"])
    p = body.get("patient", {})
    print(f"   {INFO} Patient: {p.get('firstName','')} {p.get('lastName','')}")

    r = requests.get(f"{BASE}/api/doctors/my-patients/{first_patient_id}/records", headers=DH)
    check(f"GET /api/doctors/my-patients/:id/records", r, 200)
else:
    print(f"  {WARN} No patients available to test patient detail endpoints")

r = requests.get(f"{BASE}/api/prescriptions/patient/{PATIENT_ID}", headers=DH)
check(f"GET /api/prescriptions/patient/:id", r, 200)

# ─────────────────────────────────────────────────────────
# 9. CHAT
# ─────────────────────────────────────────────────────────
section("11. CHAT")

r = requests.get(f"{BASE}/api/doctor/chat/messages", headers=DH)
body = check("GET /api/doctor/chat/messages", r, 200)

r = requests.get(f"{BASE}/api/doctor/chat/contacts/patients", headers=DH)
check("GET /api/doctor/chat/contacts/patients", r, 200)

r = requests.get(f"{BASE}/api/doctor/chat/contacts/nurses", headers=DH)
check("GET /api/doctor/chat/contacts/nurses", r, 200)

r = requests.get(f"{BASE}/api/doctor/chat/contacts/team", headers=DH)
check("GET /api/doctor/chat/contacts/team", r, 200)

# ─────────────────────────────────────────────────────────
# 10. NOTIFICATIONS
# ─────────────────────────────────────────────────────────
section("12. NOTIFICATIONS")

r = requests.get(f"{BASE}/api/notifications?limit=5", headers=DH)
check("GET /api/notifications", r, 200)

r = requests.get(f"{BASE}/api/notifications/unread-count", headers=DH)
body = check("GET /api/notifications/unread-count", r, 200, required_fields=["unreadCount"])
print(f"   {INFO} Unread notifications: {body.get('unreadCount')}")

# ─────────────────────────────────────────────────────────
# 11. AI SCRIBE & AUTOCOMPLETE
# ─────────────────────────────────────────────────────────
section("13. AI SCRIBE & AUTOCOMPLETE")

r = requests.get(f"{BASE}/api/ai/scribe/autocomplete?q=para&limit=5&type=drug", headers=DH)
body = check("GET /api/ai/scribe/autocomplete?q=para&type=drug", r, 200, required_fields=["suggestions"])
print(f"   {INFO} Autocomplete hits: {body.get('count', len(body.get('suggestions', [])))}")

r = requests.get(f"{BASE}/api/ai/scribe/reference/abbreviations", headers=DH)
body = check("GET /api/ai/scribe/reference/abbreviations", r, 200, required_fields=["data"])
print(f"   {INFO} Abbreviations count: {body.get('count')}")

r = requests.post(f"{BASE}/api/ai/scribe/scribe", headers=DH, json={
    "text": "pt has h/o dm type 2 since 5 yrs",
    "field": "diagnosis",
    "context": {}
})
check("POST /api/ai/scribe/scribe", r, 200, required_fields=["processedText"])

r = requests.post(f"{BASE}/api/ai/scribe/generate-prescription", headers=DH, json={
    "consultationNotes": "Patient presents with cough for 3 days. Prescribe Amoxicillin 500mg TDS for 5 days. Follow up in 1 week.",
    "patientName": "Test User",
    "patientAge": 36,
    "patientGender": "Male",
    "saveToDatabase": False
})
body = check("POST /api/ai/scribe/generate-prescription", r, 200, required_fields=["prescription"])
meds = body.get("prescription", {}).get("medications", [])
print(f"   {INFO} AI generated {len(meds)} medication(s); fallback={body.get('usingFallback')}")

# ─────────────────────────────────────────────────────────
# 12. OFFLINE SCRIBE HEALTH
# ─────────────────────────────────────────────────────────
section("14. OFFLINE SCRIBE")

r = requests.get(f"{BASE}/api/offline-scribe/health", timeout=10)
check("GET /api/offline-scribe/health (public)", r, 200)

r = requests.get(f"{BASE}/api/offline-scribe/languages", timeout=10)
check("GET /api/offline-scribe/languages (public)", r, 200)

# ─────────────────────────────────────────────────────────
# 13. CLINICAL WORKFLOW
# ─────────────────────────────────────────────────────────
section("15. CLINICAL WORKFLOW")

r = requests.get(f"{BASE}/api/doctor/clinical-workflow/icd10/search?q=diabetes&limit=5", headers=DH)
check("GET /api/doctor/clinical-workflow/icd10/search?q=diabetes", r, 200)

r = requests.get(f"{BASE}/api/doctor/clinical-workflow/cpt/search?q=consultation&limit=5", headers=DH)
check("GET /api/doctor/clinical-workflow/cpt/search?q=consultation", r, 200)

r = requests.get(f"{BASE}/api/doctor/clinical-workflow/notes/patient/{PATIENT_ID}", headers=DH)
check(f"GET /api/doctor/clinical-workflow/notes/patient/:id", r, 200)

r = requests.post(f"{BASE}/api/doctor/clinical-workflow/notes", headers=DH, json={
    "patientId": PATIENT_ID,
    "subjective": "Smoke test — cough 3 days",
    "objective": "BP 120/80 HR 72",
    "assessment": "URTI",
    "plan": "Conservative management"
})
body = check("POST /api/doctor/clinical-workflow/notes", r, [200, 201])
new_note_id = (body.get("note") or body.get("data") or {}).get("id")
print(f"   {INFO} Created clinical note ID: {new_note_id}")

# ─────────────────────────────────────────────────────────
# 14. REVENUE
# ─────────────────────────────────────────────────────────
section("16. REVENUE & EARNINGS")

r = requests.get(f"{BASE}/api/doctor/revenue/summary", headers=DH)
check("GET /api/doctor/revenue/summary", r, 200)

r = requests.get(f"{BASE}/api/doctor/revenue?startDate=2026-01-01&endDate=2026-05-10", headers=DH)
check("GET /api/doctor/revenue?startDate...&endDate...", r, 200)

# ─────────────────────────────────────────────────────────
# 15. TEMPLATES
# ─────────────────────────────────────────────────────────
section("17. TEMPLATES & INVOICES")

r = requests.get(f"{BASE}/api/doctors/templates", headers=DH)
check("GET /api/doctors/templates", r, 200)

r = requests.get(f"{BASE}/api/doctors/template-settings", headers=DH)
check("GET /api/doctors/template-settings", r, 200)

r = requests.get(f"{BASE}/api/doctors/invoices", headers=DH)
check("GET /api/doctors/invoices", r, 200)

# ─────────────────────────────────────────────────────────
# 16. TRIAGE
# ─────────────────────────────────────────────────────────
section("18. TRIAGE & QUEUE MANAGEMENT")

r = requests.get(f"{BASE}/api/doctors/triage/cases", headers=DH)
body = check("GET /api/doctors/triage/cases", r, 200)
cases = body.get("cases") or body.get("data") or []
print(f"   {INFO} Active triage cases: {len(cases)}")

r = requests.get(f"{BASE}/api/doctors/triage/stats", headers=DH)
check("GET /api/doctors/triage/stats", r, 200)

r = requests.get(f"{BASE}/api/doctor/queue/my-queue", headers=DH)
check("GET /api/doctor/queue/my-queue", r, 200)

# ─────────────────────────────────────────────────────────
# 17. ALERTS
# ─────────────────────────────────────────────────────────
section("21. ALERTS & MESSAGES")

r = requests.get(f"{BASE}/api/doctors/alerts", headers=DH)
body = check("GET /api/doctors/alerts", r, 200, required_fields=["alerts"])
alerts = body.get("alerts", [])
print(f"   {INFO} Unread alerts: {body.get('unreadCount')} | Total: {len(alerts)}")

r = requests.patch(f"{BASE}/api/doctors/alerts/mark-all-read", headers=DH)
check("PATCH /api/doctors/alerts/mark-all-read", r, 200, required_fields=["success"])

r = requests.get(f"{BASE}/api/doctors/messages", headers=DH)
check("GET /api/doctors/messages", r, 200)

# ─────────────────────────────────────────────────────────
# 18. REMOTE HEALTH MONITORING
# ─────────────────────────────────────────────────────────
section("27. REMOTE HEALTH MONITORING")

r = requests.get(f"{BASE}/api/doctors/health-monitoring/patients", headers=DH)
check("GET /api/doctors/health-monitoring/patients", r, 200)

# ─────────────────────────────────────────────────────────
# 19. LAB IMAGING (RIS)
# ─────────────────────────────────────────────────────────
section("28. LAB IMAGING (RIS-REFERRED)")

r = requests.get(f"{BASE}/api/doctors/ris-referred", headers=DH)
check("GET /api/doctors/ris-referred", r, 200)

r = requests.get(f"{BASE}/api/doctors/ris-referred?modality=CT", headers=DH)
check("GET /api/doctors/ris-referred?modality=CT", r, 200)

# ─────────────────────────────────────────────────────────
# 10. VIDEO CONSULTATIONS (LiveKit)
# ─────────────────────────────────────────────────────────
section("10. VIDEO CONSULTATIONS (LiveKit)")

# 10.0 Video health check
r = requests.get(f"{BASE}/api/video/health")
check("GET /api/video/health (public)", r, 200, required_fields=["status"])

# Pick an in-progress appointment (best case for video testing)
# Fetch larger page to find a valid status
_apt_resp = requests.get(f"{BASE}/api/appointments/doctor?limit=100", headers=DH)
_all_apts = (_apt_resp.json().get("appointments") or []) if _apt_resp.ok else []
video_apt_id = None
for apt in _all_apts:
    if apt.get("status") in ["in-progress", "confirmed", "scheduled", "accepted"]:
        video_apt_id = apt.get("id")
        break

print(f"   {INFO} Using appointment ID {video_apt_id} for video tests")

# 10.1 Initiate call (POST) — generates token + notifies patient
if video_apt_id:
    r = requests.post(f"{BASE}/api/doctors/appointments/{video_apt_id}/initiate-call",
                      headers=DH, json={})
    body = check("POST /api/doctors/appointments/:id/initiate-call", r, 200,
                 required_fields=["video"])
    video_room_id = (body.get("video") or {}).get("meetingId", "")
    livekit_token = (((body.get("video") or {}).get("livekit") or {})).get("token", "")
    livekit_url   = (((body.get("video") or {}).get("livekit") or {})).get("serverUrl", "")
    print(f"   {INFO} Room: {video_room_id} | Token: {'YES' if livekit_token else 'NO'} | URL: {livekit_url}")
else:
    video_room_id = ""
    livekit_token = ""
    print(f"   {WARN} No valid appointment found for initiate-call test")

# 10.2 GET LiveKit token (alternative path, must work for in-progress)
if video_apt_id:
    r = requests.get(f"{BASE}/api/video/livekit/token?appointmentId={video_apt_id}", headers=DH)
    body = check("GET /api/video/livekit/token?appointmentId=:id", r, 200,
                 required_fields=["token", "serverUrl", "roomName"])
    tk_room = body.get("roomName", "")
    print(f"   {INFO} Token roomName: {tk_room}")
    # Room must match what initiate-call stored
    if video_room_id and tk_room != video_room_id:
        print(f"   {FAIL} ROOM MISMATCH! initiate-call={video_room_id}  token={tk_room}")
    elif video_room_id:
        print(f"   {INFO} Room IDs match ✓")

# 10.3 POST video/room/token (legacy path) — pass the actual stored room ID
if video_room_id and video_apt_id:
    r = requests.post(f"{BASE}/api/video/room/token", headers=DH,
                      json={"roomId": video_room_id, "appointmentId": video_apt_id})
    check("POST /api/video/room/token", r, 200, required_fields=["roomToken", "roomId"])

# 10.4 Join room
if video_room_id:
    r = requests.post(f"{BASE}/api/video/room/{video_room_id}/join", headers=DH, json={})
    body = check("POST /api/video/room/:roomId/join", r, 200, required_fields=["roomData"])
    join_lk = (body.get("roomData") or {}).get("livekit") or {}
    print(f"   {INFO} Join livekit token present: {'YES' if join_lk.get('token') else 'NO'}")

# 10.5 Room status
if video_room_id:
    r = requests.get(f"{BASE}/api/video/room/{video_room_id}/status", headers=DH)
    body = check("GET /api/video/room/:roomId/status", r, 200)
    rs = body.get("roomStatus") or {}
    print(f"   {INFO} Room status: {rs.get('status','?')} | participants: {rs.get('participantCount','?')}")

# 10.6 Create invite link
if video_room_id:
    r = requests.post(f"{BASE}/api/video/room/{video_room_id}/invite", headers=DH,
                      json={"label": "Smoke test guest", "maxUses": 1})
    body = check("POST /api/video/room/:roomId/invite", r, 200, required_fields=["invite"])
    invite_url = (body.get("invite") or {}).get("shareableUrl", "")
    print(f"   {INFO} Invite URL: {invite_url[:60]}...")


print(f"\n{'='*60}")
print("  SMOKE TEST RESULTS SUMMARY")
print(f"{'='*60}")
passed = [r for r in results if r[1]]
failed = [r for r in results if not r[1]]
print(f"\n  Total : {len(results)}")
print(f"  {PASS} : {len(passed)}")
print(f"  {FAIL} : {len(failed)}")

if failed:
    print(f"\n  Failed endpoints:")
    for label, ok, status, snippet in failed:
        print(f"    [{status}] {label}")
        print(f"         {snippet[:100]}")

print()
sys.exit(0 if not failed else 1)
