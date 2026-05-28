#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-http://127.0.0.1:8888}"
LAB_EMAIL="${LAB_EMAIL:-qa.lab@mediczy.com}"
LAB_PASSWORD="${LAB_PASSWORD:-QaLab@123}"

echo "[lab-regression] Base URL: ${BASE_URL}"

login_resp=$(curl -s -X POST "${BASE_URL}/api/lab/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"${LAB_EMAIL}\",\"password\":\"${LAB_PASSWORD}\"}")

token=$(echo "$login_resp" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{const j=JSON.parse(s);console.log(j.token||'')}catch{console.log('')}})")
if [[ -z "${token}" ]]; then
  echo "[lab-regression] FAIL: lab login token missing"
  echo "$login_resp"
  exit 1
fi

echo "[lab-regression] PASS: lab login"

health_code=$(curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}/health")
if [[ "${health_code}" != "200" ]]; then
  echo "[lab-regression] FAIL: health endpoint ${health_code}"
  exit 1
fi

echo "[lab-regression] PASS: health endpoint"

state_payload='{"data":[{"id":"ORD-REG-001","patientName":"Regression User","tests":"CBC","status":"Pending","priority":"Normal","orderedAt":"2026-05-28"}]}'
state_put_code=$(curl -s -o /tmp/lab_state_put.json -w "%{http_code}" -X PUT "${BASE_URL}/api/lab/state/lab.orders" \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer ${token}" \
  -d "${state_payload}")
if [[ "${state_put_code}" != "200" ]]; then
  echo "[lab-regression] FAIL: state put ${state_put_code}"
  cat /tmp/lab_state_put.json
  exit 1
fi

echo "[lab-regression] PASS: state put"

state_get_code=$(curl -s -o /tmp/lab_state_get.json -w "%{http_code}" -H "Authorization: Bearer ${token}" "${BASE_URL}/api/lab/state/lab.orders")
if [[ "${state_get_code}" != "200" ]]; then
  echo "[lab-regression] FAIL: state get ${state_get_code}"
  cat /tmp/lab_state_get.json
  exit 1
fi

state_items=$(node -e "const fs=require('fs');const j=JSON.parse(fs.readFileSync('/tmp/lab_state_get.json','utf8'));console.log((j.data||[]).length)")
if [[ "${state_items}" -lt 1 ]]; then
  echo "[lab-regression] FAIL: state read returned no items"
  cat /tmp/lab_state_get.json
  exit 1
fi

echo "[lab-regression] PASS: state get"

ris_code=$(curl -s -o /tmp/lab_ris_studies.json -w "%{http_code}" -H "Authorization: Bearer ${token}" "${BASE_URL}/api/lab/ris/studies?page=1&limit=5")
if [[ "${ris_code}" != "200" ]]; then
  echo "[lab-regression] FAIL: RIS studies ${ris_code}"
  cat /tmp/lab_ris_studies.json
  exit 1
fi

echo "[lab-regression] PASS: RIS studies"

echo "[lab-regression] ALL CHECKS PASSED"
