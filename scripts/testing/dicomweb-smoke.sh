#!/usr/bin/env bash
set -euo pipefail

BASE="${BASE:-http://127.0.0.1:8888}"
EMAIL="${EMAIL:-doctor@mediczy.com}"
PASSWORD="${PASSWORD:-Doctor123}"
STUDY_UID="${1:-}"

echo "[dicom-smoke] base=$BASE"

LOGIN_JSON=$(curl -s -X POST "$BASE/api/doctors/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")

TOKEN=$(echo "$LOGIN_JSON" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{const j=JSON.parse(s);console.log(j.token||j.data?.token||'')}catch{console.log('')}})")

if [[ -z "$TOKEN" ]]; then
  echo "[dicom-smoke] ERROR: login token missing"
  echo "$LOGIN_JSON"
  exit 1
fi

echo "[dicom-smoke] auth=ok"

STUDIES_JSON=$(curl -s -X GET "$BASE/api/hypergrid/dicom/studies?limit=5&page=1" \
  -H "Authorization: Bearer $TOKEN")

echo "$STUDIES_JSON" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{const j=JSON.parse(s);const n=Array.isArray(j.studies)?j.studies.length:0;console.log('[dicom-smoke] studies_count='+n);if(n>0){console.log('[dicom-smoke] first_study_uid='+j.studies[0].study_instance_uid)}}catch(e){console.log('[dicom-smoke] studies_non_json')}})"

if [[ -z "$STUDY_UID" ]]; then
  STUDY_UID=$(echo "$STUDIES_JSON" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{const j=JSON.parse(s);console.log(j.studies?.[0]?.study_instance_uid||'')}catch{console.log('')}})")
fi

if [[ -z "$STUDY_UID" ]]; then
  echo "[dicom-smoke] No study UID available to validate WADO path."
  exit 0
fi

ENC_UID=$(node -e "console.log(encodeURIComponent(process.argv[1]))" "$STUDY_UID")

WADO_JSON=$(curl -s -X GET "$BASE/api/hypergrid/dicom/studies/$ENC_UID" \
  -H "Authorization: Bearer $TOKEN")

echo "$WADO_JSON" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{const j=JSON.parse(s);const n=Array.isArray(j.instances)?j.instances.length:0;console.log('[dicom-smoke] wado_success='+Boolean(j.success));console.log('[dicom-smoke] instance_count='+n);if(n>0){console.log('[dicom-smoke] first_sop_uid='+j.instances[0].sop_instance_uid)}}catch(e){console.log('[dicom-smoke] wado_non_json')}})"

SOP_UID=$(echo "$WADO_JSON" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{const j=JSON.parse(s);console.log(j.instances?.[0]?.sop_instance_uid||'')}catch{console.log('')}})")

if [[ -n "$SOP_UID" ]]; then
  ENC_SOP=$(node -e "console.log(encodeURIComponent(process.argv[1]))" "$SOP_UID")
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X GET "$BASE/api/hypergrid/dicom/studies/$ENC_UID/instances/$ENC_SOP/file" \
    -H "Authorization: Bearer $TOKEN")
  echo "[dicom-smoke] instance_file_status=$STATUS"
else
  echo "[dicom-smoke] No SOP UID found for instance file retrieval check."
fi

echo "[dicom-smoke] done"
