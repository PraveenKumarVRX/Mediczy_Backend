#!/usr/bin/env python3
import json
import re
import os
import socket
import urllib.request
import urllib.error
from datetime import datetime, timedelta, timezone

socket.setdefaulttimeout(15)
BASE_AUTH = os.getenv("MEDICZY_AUTH_BASE", "https://app.mediqzy.com")
BASE_API = os.getenv("MEDICZY_API_BASE", "https://app.mediqzy.com")


def request(method, path, token=None, data=None, base=BASE_API):
    url = f"{base}{path}"
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    payload = None
    if data is not None:
        payload = json.dumps(data).encode("utf-8")
    req = urllib.request.Request(url, data=payload, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status, resp.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read().decode("utf-8")
    except Exception as exc:
        return 0, str(exc)


def extract_token(raw):
    match = re.search(r'"token"\s*:\s*"([^"]+)"', raw, re.S)
    return match.group(1) if match else ""


def parse_json(raw):
    try:
        return json.loads(raw)
    except Exception:
        try:
            return json.loads(raw.replace("\n", "").replace("\r", ""))
        except Exception:
            return None


        def extract_doctor_id(raw):
            data = parse_json(raw)
            if not isinstance(data, dict):
                return None
            for key in ("data", "doctor", "user"):
                if key in data and isinstance(data[key], dict):
                    return data[key].get("id") or data[key].get("doctorId")
            return data.get("doctorId")


def summarize_error(raw):
    parsed = parse_json(raw)
    if isinstance(parsed, dict):
        message = parsed.get("message") or parsed.get("error")
        if message:
            return str(message)[:200]
        if "errors" in parsed:
            return str(parsed["errors"])[:200]
    if isinstance(raw, str) and raw:
        return raw.strip()[:200]
    return ""


def show(label, status, raw=None, ok=(200, 201, 204)):
    outcome = "PASS" if status in ok else "FAIL"
    print(f"{outcome}: {label} -> HTTP {status}", flush=True)
    if outcome == "FAIL" and raw is not None:
        detail = summarize_error(raw)
        if detail:
            print(f"DETAIL: {detail}", flush=True)


print("== Auth ==", flush=True)
status, raw = request("POST", "/api/users/login", data={"email": "user@mediczy.com", "password": "User123"}, base=BASE_AUTH)
user_token = extract_token(raw)
show("user login", status, raw=raw)
status, raw = request("POST", "/api/doctors/login", data={"email": "doctor@mediczy.com", "password": "Doctor123"}, base=BASE_AUTH)
doctor_token = extract_token(raw)
doctor_id_from_login = extract_doctor_id(raw)
show("doctor login", status, raw=raw)
status, raw = request("POST", "/api/admin/login", data={"email": "admin@mediczy.com", "password": "SecureAdmin123"}, base=BASE_AUTH)
admin_token = extract_token(raw)
show("admin login", status, raw=raw)

print("== Appointments ==", flush=True)
status, raw = request("GET", "/api/doctors/available")
show("doctors available", status, raw=raw)
doctor_id = doctor_id_from_login
resp = parse_json(raw)
if isinstance(resp, dict):
    for key in ("doctors", "data", "results"):
        if key in resp and isinstance(resp[key], list) and resp[key]:
            doctor_id = resp[key][0].get("id") or resp[key][0].get("doctorId")
            break

appointment_id = None
if user_token and doctor_id:
    tomorrow = (datetime.now(timezone.utc) + timedelta(days=1)).strftime("%Y-%m-%d")
    time_slots = ["10:30", "11:00", "11:30", "12:00", "12:30", "13:00", "15:00", "16:00", "17:00", "18:00", "19:00"]
    for slot in time_slots:
        status, raw = request("POST", "/api/appointments", token=user_token, data={
            "doctorId": doctor_id,
            "appointmentDate": tomorrow,
            "appointmentTime": slot,
            "consultationType": "video",
            "symptoms": "smoke test"
        })
        show("create appointment", status, raw=raw, ok=(200, 201))
        if status in (200, 201):
            resp = parse_json(raw)
            if isinstance(resp, dict):
                appointment_id = resp.get("data", {}).get("appointment", {}).get("id") or resp.get("appointment", {}).get("id") or resp.get("id")
            break
        if status not in (409,):
            break

    if appointment_id:
        status, raw = request("PATCH", f"/api/appointments/{appointment_id}/cancel", token=user_token)
        show("cancel appointment", status, raw=raw)
    else:
        print("FAIL: cancel appointment -> no appointment id", flush=True)
else:
    print("FAIL: create appointment -> missing token or doctorId", flush=True)

status, raw = request("GET", "/api/appointments", token=user_token)
show("appointments list", status, raw=raw)

print("== Prescriptions ==", flush=True)
status, raw = request("GET", "/api/prescriptions/patient", token=user_token)
show("patient prescriptions", status, raw=raw)
status, raw = request("GET", "/api/prescriptions/doctor/issued", token=doctor_token)
show("doctor issued prescriptions", status, raw=raw)

print("== Wallet ==", flush=True)
status, raw = request("GET", "/api/wallet", token=user_token)
show("wallet summary", status, raw=raw)
status, raw = request("GET", "/api/wallet/balance", token=user_token)
show("wallet balance", status, raw=raw)
status, raw = request("GET", "/api/wallet/transactions", token=user_token)
show("wallet transactions", status, raw=raw)
status, raw = request("POST", "/api/wallet/earn/daily-login", token=user_token)
show("wallet daily login", status, raw=raw, ok=(200, 201, 400))
status, raw = request("GET", "/api/wallet/appointment/calculate/500", token=user_token)
show("wallet consult calc", status, raw=raw)

print("== Labs ==", flush=True)
status, raw = request("GET", "/api/labs?limit=5")
show("labs list", status, raw=raw)

print("== Notifications ==", flush=True)
status, raw = request("GET", "/api/notifications?limit=5", token=user_token)
show("notifications list", status, raw=raw)
status, raw = request("POST", "/api/notifications/read-all", token=user_token)
show("notifications read-all", status, raw=raw)

print("== Video (Doctor) ==", flush=True)
status, raw = request("GET", "/api/doctors/video-consultations/stats", token=doctor_token)
show("video stats", status, raw=raw)
status, raw = request("GET", "/api/doctors/video-consultations/recent", token=doctor_token)
show("video recent", status, raw=raw)
status, raw = request("GET", "/api/doctors/video-consultations/upcoming", token=doctor_token)
show("video upcoming", status, raw=raw)
if appointment_id:
    status, raw = request("POST", f"/api/doctors/appointments/{appointment_id}/initiate-call", token=doctor_token)
    show("video initiate-call", status, raw=raw, ok=(200, 201, 400))
else:
    print("SKIP: video initiate-call -> no appointment id", flush=True)

print("== OTP ==", flush=True)
status, raw = request("POST", "/api/auth/send-otp", data={"identifier": "7373007737"}, base=BASE_AUTH)
show("otp send", status, raw=raw)
