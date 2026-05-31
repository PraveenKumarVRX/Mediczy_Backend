#!/usr/bin/env bash
set -euo pipefail

# Health Assessment authenticated smoke suite
# Usage:
#   BASE_URL="https://app.mediqzy.com/api" \
#   QA_EMAIL="qa_user@example.com" \
#   QA_PASSWORD="secret" \
#   bash scripts/testing/health-assessment-smoke.sh

BASE_URL="${BASE_URL:-https://app.mediqzy.com/api}"
QA_EMAIL="${QA_EMAIL:-}"
QA_PASSWORD="${QA_PASSWORD:-}"

if [[ -z "$QA_EMAIL" || -z "$QA_PASSWORD" ]]; then
  echo "ERROR: Set QA_EMAIL and QA_PASSWORD environment variables."
  exit 1
fi

if ! command -v curl >/dev/null 2>&1; then
  echo "ERROR: curl is required"
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "ERROR: jq is required"
  exit 1
fi

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

PASS=0
FAIL=0

print_result() {
  local name="$1"
  local status="$2"
  local detail="$3"
  if [[ "$status" == "PASS" ]]; then
    PASS=$((PASS + 1))
    printf "[PASS] %-40s %s\n" "$name" "$detail"
  else
    FAIL=$((FAIL + 1))
    printf "[FAIL] %-40s %s\n" "$name" "$detail"
  fi
}

request() {
  local method="$1"
  local url="$2"
  local body_file="${3:-}"
  local auth_token="${4:-}"
  local out_body="$TMP_DIR/body.json"

  local headers=("-H" "Accept: application/json")
  if [[ -n "$auth_token" ]]; then
    headers+=("-H" "Authorization: Bearer ${auth_token}")
  fi

  local http_code
  if [[ -n "$body_file" ]]; then
    http_code=$(curl -sS -o "$out_body" -w "%{http_code}" -X "$method" "$url" "${headers[@]}" -H "Content-Type: application/json" --data-binary "@${body_file}")
  else
    http_code=$(curl -sS -o "$out_body" -w "%{http_code}" -X "$method" "$url" "${headers[@]}")
  fi

  cat "$out_body"
  printf "\n__HTTP_CODE__:%s\n" "$http_code"
}

extract_http_code() {
  sed -n 's/^__HTTP_CODE__://p' | tail -n 1
}

extract_json_body() {
  sed '/^__HTTP_CODE__:/d'
}

# Payloads
cat > "$TMP_DIR/payload_low.json" <<'JSON'
{
  "age": 28,
  "gender": "male",
  "height": 175,
  "weight": 68,
  "waist": 80,
  "hip": 95,
  "bmi": 22.2,
  "whr": 0.842,
  "smoking": "never",
  "alcohol": "none",
  "exercise_frequency": "active",
  "hypertension": "no",
  "diabetes": "no",
  "heart_disease": "no",
  "cholesterol": "no",
  "mental_health": "normal",
  "family_heart_disease": "no",
  "family_diabetes": "no",
  "family_cancer": "no",
  "stress_level": 3,
  "sleep_hours": 7.5,
  "diet_quality": "good",
  "responses": {
    "age": "18_29",
    "gender": "male",
    "bmi": "normal",
    "whr": "ideal",
    "smoking": "never",
    "alcohol": "none",
    "activity": "150_mod",
    "food": "balanced",
    "sleep": "7_8",
    "stress": "low",
    "hx_hypertension": "none",
    "hx_diabetes": "none",
    "hx_heart": "none",
    "hx_cholesterol": "none",
    "mental_depression": "no",
    "fh_heart": "no",
    "fh_diabetes": "no",
    "fh_cancer": "no"
  },
  "ethnicity": "south_asian",
  "sbp": "118",
  "family_heart_disease_premature": "no"
}
JSON

cat > "$TMP_DIR/payload_high.json" <<'JSON'
{
  "age": 62,
  "gender": "male",
  "height": 168,
  "weight": 98,
  "waist": 112,
  "hip": 103,
  "bmi": 34.7,
  "whr": 1.087,
  "smoking": "current",
  "alcohol": "daily",
  "exercise_frequency": "sedentary",
  "hypertension": "yes",
  "diabetes": "yes",
  "heart_disease": "yes",
  "cholesterol": "yes",
  "mental_health": "depressed",
  "family_heart_disease": "yes",
  "family_diabetes": "yes",
  "family_cancer": "yes",
  "stress_level": 9,
  "sleep_hours": 4.5,
  "diet_quality": "poor",
  "responses": {
    "age": "60_69",
    "gender": "male",
    "bmi": "obese",
    "whr": "high",
    "smoking": "heavy_gte10",
    "alcohol": "heavy_daily",
    "activity": "none",
    "food": "high_sugar_salt",
    "sleep": "lt5_gt9",
    "stress": "high",
    "hx_hypertension": "uncontrolled",
    "hx_diabetes": "uncontrolled",
    "hx_heart": "uncontrolled",
    "hx_cholesterol": "uncontrolled",
    "mental_depression": "unmanaged",
    "fh_heart": "yes",
    "fh_diabetes": "yes",
    "fh_cancer": "yes"
  },
  "ethnicity": "south_asian",
  "sbp": "156",
  "snores_loudly": "yes",
  "daytime_sleepiness": "yes",
  "observed_apneas": "yes",
  "hba1c": "8.2",
  "total_chol_mmol": "6.8",
  "hdl_mmol": "0.9",
  "creatinine_mgdl": "1.3",
  "urine_acr": "12",
  "af": "yes",
  "family_heart_disease_premature": "yes"
}
JSON

echo "Running smoke suite against: ${BASE_URL}"

# 1) Login
# Build login payload first
cat > "$TMP_DIR/login.json" <<JSON
{"email":"${QA_EMAIL}","password":"${QA_PASSWORD}"}
JSON
LOGIN_OUT=$(request "POST" "${BASE_URL}/auth/login" "$TMP_DIR/login.json")
LOGIN_CODE=$(echo "$LOGIN_OUT" | extract_http_code)
LOGIN_BODY=$(echo "$LOGIN_OUT" | extract_json_body)
TOKEN=$(echo "$LOGIN_BODY" | jq -r '.token // empty')

if [[ "$LOGIN_CODE" == "200" && -n "$TOKEN" ]]; then
  print_result "Login" "PASS" "HTTP ${LOGIN_CODE}, token received"
else
  print_result "Login" "FAIL" "HTTP ${LOGIN_CODE}, token missing"
  echo "Login response: $LOGIN_BODY"
  echo
  echo "Summary: PASS=${PASS} FAIL=${FAIL}"
  exit 1
fi

# 2) History happy path
HIST_OUT=$(request "GET" "${BASE_URL}/health-assessment/history?limit=10&offset=0" "" "$TOKEN")
HIST_CODE=$(echo "$HIST_OUT" | extract_http_code)
HIST_BODY=$(echo "$HIST_OUT" | extract_json_body)
if [[ "$HIST_CODE" == "200" ]] && echo "$HIST_BODY" | jq -e '.success == true and (.assessments|type=="array") and (.periodSummaries|type=="object")' >/dev/null; then
  print_result "History (auth)" "PASS" "HTTP ${HIST_CODE}, valid shape"
else
  print_result "History (auth)" "FAIL" "HTTP ${HIST_CODE}, shape mismatch"
fi

# 3) Save low risk
SAVE_LOW_OUT=$(request "POST" "${BASE_URL}/health-assessment/save" "$TMP_DIR/payload_low.json" "$TOKEN")
SAVE_LOW_CODE=$(echo "$SAVE_LOW_OUT" | extract_http_code)
SAVE_LOW_BODY=$(echo "$SAVE_LOW_OUT" | extract_json_body)
LOW_LEVEL=$(echo "$SAVE_LOW_BODY" | jq -r '.riskAssessment.riskLevel // empty')
LOW_SCORE=$(echo "$SAVE_LOW_BODY" | jq -r '.riskAssessment.score // empty')
if [[ "$SAVE_LOW_CODE" == "201" ]] && echo "$SAVE_LOW_BODY" | jq -e '.success == true and .assessment.id and .riskAssessment.score != null and .riskAssessment.riskLevel != null' >/dev/null; then
  print_result "Save (low risk)" "PASS" "HTTP ${SAVE_LOW_CODE}, level=${LOW_LEVEL}, score=${LOW_SCORE}"
else
  print_result "Save (low risk)" "FAIL" "HTTP ${SAVE_LOW_CODE}, invalid response"
fi

# 4) Latest after low save
LATEST1_OUT=$(request "GET" "${BASE_URL}/health-assessment" "" "$TOKEN")
LATEST1_CODE=$(echo "$LATEST1_OUT" | extract_http_code)
LATEST1_BODY=$(echo "$LATEST1_OUT" | extract_json_body)
LATEST1_LEVEL=$(echo "$LATEST1_BODY" | jq -r '.assessment.riskAssessment.riskLevel // empty')
if [[ "$LATEST1_CODE" == "200" && -n "$LOW_LEVEL" && "$LATEST1_LEVEL" == "$LOW_LEVEL" ]]; then
  print_result "Latest after low save" "PASS" "HTTP ${LATEST1_CODE}, riskLevel matched"
else
  print_result "Latest after low save" "FAIL" "HTTP ${LATEST1_CODE}, expected=${LOW_LEVEL}, got=${LATEST1_LEVEL}"
fi

# 5) Save high risk
SAVE_HIGH_OUT=$(request "POST" "${BASE_URL}/health-assessment/save" "$TMP_DIR/payload_high.json" "$TOKEN")
SAVE_HIGH_CODE=$(echo "$SAVE_HIGH_OUT" | extract_http_code)
SAVE_HIGH_BODY=$(echo "$SAVE_HIGH_OUT" | extract_json_body)
HIGH_LEVEL=$(echo "$SAVE_HIGH_BODY" | jq -r '.riskAssessment.riskLevel // empty')
HIGH_SCORE=$(echo "$SAVE_HIGH_BODY" | jq -r '.riskAssessment.score // empty')
if [[ "$SAVE_HIGH_CODE" == "201" ]] && echo "$SAVE_HIGH_BODY" | jq -e '.success == true and .assessment.id and .riskAssessment.score != null and .riskAssessment.riskLevel != null' >/dev/null; then
  print_result "Save (high risk)" "PASS" "HTTP ${SAVE_HIGH_CODE}, level=${HIGH_LEVEL}, score=${HIGH_SCORE}"
else
  print_result "Save (high risk)" "FAIL" "HTTP ${SAVE_HIGH_CODE}, invalid response"
fi

# 6) Latest after high save
LATEST2_OUT=$(request "GET" "${BASE_URL}/health-assessment" "" "$TOKEN")
LATEST2_CODE=$(echo "$LATEST2_OUT" | extract_http_code)
LATEST2_BODY=$(echo "$LATEST2_OUT" | extract_json_body)
LATEST2_LEVEL=$(echo "$LATEST2_BODY" | jq -r '.assessment.riskAssessment.riskLevel // empty')
if [[ "$LATEST2_CODE" == "200" && -n "$HIGH_LEVEL" && "$LATEST2_LEVEL" == "$HIGH_LEVEL" ]]; then
  print_result "Latest after high save" "PASS" "HTTP ${LATEST2_CODE}, riskLevel matched"
else
  print_result "Latest after high save" "FAIL" "HTTP ${LATEST2_CODE}, expected=${HIGH_LEVEL}, got=${LATEST2_LEVEL}"
fi

# 7) Score movement low -> high
if [[ -n "$LOW_SCORE" && -n "$HIGH_SCORE" ]] && [[ "$HIGH_SCORE" =~ ^[0-9]+(\.[0-9]+)?$ ]] && [[ "$LOW_SCORE" =~ ^[0-9]+(\.[0-9]+)?$ ]]; then
  awk_cmp=$(awk -v a="$HIGH_SCORE" -v b="$LOW_SCORE" 'BEGIN {if (a>b) print 1; else print 0;}')
  if [[ "$awk_cmp" == "1" ]]; then
    print_result "Risk score movement" "PASS" "low=${LOW_SCORE} -> high=${HIGH_SCORE}"
  else
    print_result "Risk score movement" "FAIL" "low=${LOW_SCORE} -> high=${HIGH_SCORE}"
  fi
else
  print_result "Risk score movement" "FAIL" "Unable to compare low/high scores"
fi

# 8) History newest record check
HIST2_OUT=$(request "GET" "${BASE_URL}/health-assessment/history?limit=5&offset=0" "" "$TOKEN")
HIST2_CODE=$(echo "$HIST2_OUT" | extract_http_code)
HIST2_BODY=$(echo "$HIST2_OUT" | extract_json_body)
HIST2_FIRST_LEVEL=$(echo "$HIST2_BODY" | jq -r '.assessments[0].riskLevel // empty')
if [[ "$HIST2_CODE" == "200" && -n "$HIGH_LEVEL" && "$HIST2_FIRST_LEVEL" == "$HIGH_LEVEL" ]]; then
  print_result "History newest = latest save" "PASS" "HTTP ${HIST2_CODE}, newest level matched"
else
  print_result "History newest = latest save" "FAIL" "HTTP ${HIST2_CODE}, expected=${HIGH_LEVEL}, got=${HIST2_FIRST_LEVEL}"
fi

# 9) Negative: no token
NOAUTH_OUT=$(request "GET" "${BASE_URL}/health-assessment/history?limit=1&offset=0")
NOAUTH_CODE=$(echo "$NOAUTH_OUT" | extract_http_code)
if [[ "$NOAUTH_CODE" == "401" ]]; then
  print_result "Negative: no token" "PASS" "HTTP ${NOAUTH_CODE}"
else
  print_result "Negative: no token" "FAIL" "HTTP ${NOAUTH_CODE}, expected 401"
fi

# 10) Negative: invalid token
BADTOKEN_OUT=$(request "GET" "${BASE_URL}/health-assessment" "" "invalid_token")
BADTOKEN_CODE=$(echo "$BADTOKEN_OUT" | extract_http_code)
if [[ "$BADTOKEN_CODE" == "401" ]]; then
  print_result "Negative: invalid token" "PASS" "HTTP ${BADTOKEN_CODE}"
else
  print_result "Negative: invalid token" "FAIL" "HTTP ${BADTOKEN_CODE}, expected 401"
fi

echo
printf "Summary: PASS=%d FAIL=%d\n" "$PASS" "$FAIL"
if [[ "$FAIL" -gt 0 ]]; then
  exit 1
fi
