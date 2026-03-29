#!/usr/bin/env python3
"""Update all n8n workflows from local JSON files."""
import json, os, urllib.request, urllib.error

API_KEY = os.environ.get("N8N_API_KEY", "")
BASE = "http://localhost:5678/api/v1"
WORKFLOW_DIR = "/home/ubuntu/Mediczy/n8n/workflows"
HEADERS = {"X-N8N-API-KEY": API_KEY, "Content-Type": "application/json"}

# Map local file names to n8n workflow names
NAME_MAP = {
    "appointment-booked.json": "Mediczy - Appointment Booked",
    "appointment-cancelled.json": "Mediczy - Appointment Cancelled",
    "appointment-no-show.json": "Mediczy - Appointment No-Show Follow-up",
    "appointment-reminder.json": "Mediczy - Appointment Reminder",
    "daily-report.json": "Mediczy - Daily KPI Summary",
    "doctor-availability-updated.json": "Mediczy - Doctor Availability Updated",
    "doctor-onboarding.json": "Mediczy - Doctor Onboarding",
    "doctor-performance.json": "Mediczy - Doctor Performance Report",
    "health-alert.json": "Mediczy - Health Alert Escalation",
    "health-report-ready.json": "Mediczy - Health Report Ready",
    "medication-reminder.json": "Mediczy - Medication Reminder",
    "membership-expiry.json": "Mediczy - Membership Expiry",
    "payment-failed.json": "Mediczy - Payment Failed",
    "payment-reminder.json": "Mediczy - Payment Reminder",
    "payment-success.json": "Mediczy - Payment Success",
    "prescription-expired.json": "Mediczy - Prescription Expired Reminder",
    "prescription-expiry.json": "Mediczy - Prescription Expiry",
    "prescription-issued.json": "Mediczy - Prescription Issued",
    "system-alert.json": "Mediczy - System Alert",
    "user-registered.json": "Mediczy - User Registered",
    "wearable-sync.json": "Mediczy - Wearable Data Sync",
    "webinar-reminder.json": "Mediczy - Webinar Reminder",
    "whatsapp-appointment-booking.json": "Mediczy - WhatsApp Appointment Booking",
}

def api(method, path, body=None):
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(f"{BASE}{path}", data=data, headers=HEADERS, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        return {"error": e.code, "body": e.read().decode()[:200]}

# Get existing workflows
existing = api("GET", "/workflows")
if "error" in existing:
    print(f"ERROR listing workflows: {existing}")
    exit(1)

wf_list = existing.get("data", existing) if isinstance(existing, dict) else existing
name_to_id = {w["name"]: w["id"] for w in wf_list}

updated = 0
failed = 0
skipped = 0

for filename, expected_name in sorted(NAME_MAP.items()):
    filepath = os.path.join(WORKFLOW_DIR, filename)
    if not os.path.exists(filepath):
        print(f"  SKIP {filename} - file not found")
        skipped += 1
        continue

    wf_id = name_to_id.get(expected_name)
    if not wf_id:
        print(f"  SKIP {filename} - no matching workflow '{expected_name}' in n8n")
        skipped += 1
        continue

    with open(filepath) as f:
        local_wf = json.load(f)

    # Build update payload with nodes and connections from local file
    payload = {
        "name": expected_name,
        "nodes": local_wf.get("nodes", []),
        "connections": local_wf.get("connections", {}),
        "settings": local_wf.get("settings", {}),
    }

    result = api("PUT", f"/workflows/{wf_id}", payload)
    if "error" in result:
        print(f"  FAIL {filename} -> {wf_id}: {result}")
        failed += 1
    else:
        print(f"  OK   {filename} -> {wf_id}")
        updated += 1

    # Re-activate after update
    activate_result = api("PUT", f"/workflows/{wf_id}", {"active": True})
    if "error" in activate_result:
        print(f"       WARN: could not re-activate {wf_id}")

print(f"\nDone: {updated} updated, {failed} failed, {skipped} skipped")
