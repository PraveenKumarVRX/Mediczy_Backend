#!/usr/bin/env python3
"""Activate all n8n workflows."""
import json, os, urllib.request, urllib.error

API_KEY = os.environ["N8N_API_KEY"]
BASE = "http://localhost:5678/api/v1"
HEADERS = {"X-N8N-API-KEY": API_KEY, "Content-Type": "application/json"}

def api(method, path, body=None):
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(f"{BASE}{path}", data=data, headers=HEADERS, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        return {"error": e.code, "body": e.read().decode()[:200]}

# Get all workflows
existing = api("GET", "/workflows")
wf_list = existing.get("data", existing) if isinstance(existing, dict) else existing

ok = 0
fail = 0
for w in wf_list:
    wid = w["id"]
    name = w["name"]
    if w.get("active"):
        print(f"  ALREADY ACTIVE: {name}")
        ok += 1
        continue
    result = api("POST", f"/workflows/{wid}/activate")
    if result.get("active"):
        print(f"  ACTIVATED: {name}")
        ok += 1
    else:
        print(f"  FAILED: {name} -> {result}")
        fail += 1

print(f"\nDone: {ok} active, {fail} failed")
