#!/bin/bash
PASS=0; FAIL=0; TOTAL=0

t() {
  TOTAL=$((TOTAL+1))
  local name="$1"; local result="$2"; local expect="$3"
  if echo "$result" | grep -q "$expect"; then
    PASS=$((PASS+1)); echo "✅ $name"
  else
    FAIL=$((FAIL+1)); echo "❌ $name — got: $(echo "$result" | head -c 200)"
  fi
}

SECRET="d6100dfd4597503924f69844c93a4cdddfa47bdbaff450c45a2ad774c857fde074e9ba41e6f7171c21c83f25e224f969e7e05681cc020f30e964017395a4fd8d"
DOC_TOKEN=$(cd /home/ubuntu/Mediczy/server && node -e "const jwt=require('jsonwebtoken'); console.log(jwt.sign({id:95,role:'doctor'},'$SECRET',{expiresIn:'1h'}))")
ADMIN_TOKEN=$(cd /home/ubuntu/Mediczy/server && node -e "const jwt=require('jsonwebtoken'); console.log(jwt.sign({id:1,role:'admin'},'$SECRET',{expiresIn:'1h'}))")

echo "═══════════════════════════════════════════════"
echo "  MEDICZY PRODUCTION SMOKE TEST — $(date '+%Y-%m-%d %H:%M')"
echo "═══════════════════════════════════════════════"
echo ""
echo "── CORE INFRASTRUCTURE ──"
R=$(curl -s http://localhost:8888/api/health)
t "1. Health endpoint" "$R" '"status":"healthy"'
DB=$(echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['databases']['postgres'])" 2>/dev/null)
t "2. PostgreSQL connected" "$DB" "connected"
REDIS=$(echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['databases'].get('redis','unknown'))" 2>/dev/null)
t "3. Redis connected" "$REDIS" "connected"
SIB=$(curl -s http://localhost:8001/health 2>/dev/null)
t "4. SIB FastAPI (port 8001)" "$SIB" "status"

echo ""
echo "── PHASE 1: SIB AI GUARD ──"
R=$(curl -s http://localhost:8888/api/sib/ai-dashboard -H "Authorization: Bearer $ADMIN_TOKEN")
t "5. SIB AI Dashboard" "$R" '"success":true'
TYPES=$(echo "$R" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['data']['aiDecisionTypes']))" 2>/dev/null)
t "6. AI Decision Types (8)" "$TYPES" "8"

echo ""
echo "── PHASE 2: LEARNING LOOP ──"
R=$(curl -s -X POST http://localhost:8888/api/cdss/knowledge/feedback \
  -H "Authorization: Bearer $DOC_TOKEN" -H "Content-Type: application/json" \
  -d "{\"queryId\":\"smoke-test-$$\",\"action\":\"accepted\",\"queryText\":\"smoke test\",\"codesKept\":[\"Z00.0\"]}")
t "7. CDSS Feedback submit" "$R" '"success":true'
R=$(curl -s http://localhost:8888/api/cdss/knowledge/feedback/stats -H "Authorization: Bearer $DOC_TOKEN")
t "8. CDSS Feedback stats" "$R" '"success":true'

echo ""
echo "── MEDICAL DATA ──"
R=$(curl -s "http://localhost:8888/api/doctor/clinical-workflow/icd10/search?search=diabetes&limit=3" -H "Authorization: Bearer $DOC_TOKEN")
t "9. ICD-10 search (diabetes)" "$R" '"success":true'
R=$(curl -s "http://localhost:8888/api/doctor/clinical-workflow/snomed/search?search=hypertension&limit=3" -H "Authorization: Bearer $DOC_TOKEN")
t "10. SNOMED search (hypertension)" "$R" '"success":true'
R=$(curl -s "http://localhost:8888/api/doctor/clinical-workflow/cpt/search?q=blood&limit=3" -H "Authorization: Bearer $DOC_TOKEN")
t "11. CPT search (blood)" "$R" '"success":true'

echo ""
echo "── CDSS AI QUERY ──"
R=$(curl -s -m 30 -X POST http://localhost:8888/api/cdss/knowledge/query \
  -H "Authorization: Bearer $DOC_TOKEN" -H "Content-Type: application/json" \
  -d '{"query":"metformin dose for type 2 diabetes"}')
t "12. CDSS LLM query" "$R" '"success":true'
PROV=$(echo "$R" | python3 -c "import sys,json; print(json.load(sys.stdin).get('provider','none'))" 2>/dev/null)
echo "    LLM Provider: $PROV"

echo ""
echo "── PHASE 4: FHIR R4 ──"
R=$(curl -s http://localhost:8888/api/fhir/r4/metadata)
t "13. FHIR CapabilityStatement" "$R" "CapabilityStatement"
FVER=$(echo "$R" | python3 -c "import sys,json; print(json.load(sys.stdin).get('fhirVersion',''))" 2>/dev/null)
t "14. FHIR version 4.0.1" "$FVER" "4.0.1"
R=$(curl -s http://localhost:8888/api/fhir/r4/Patient -H "Authorization: Bearer $DOC_TOKEN")
t "15. FHIR Patient search" "$R" "Bundle"

echo ""
echo "── PHASE 5: TENANT MANAGEMENT ──"
R=$(curl -s http://localhost:8888/api/superadmin/tenants/tenants -H "Authorization: Bearer $ADMIN_TOKEN")
t "16. Superadmin tenant list" "$R" '"success":true'
R=$(curl -s http://localhost:8888/api/superadmin/tenants/tiers -H "Authorization: Bearer $ADMIN_TOKEN")
t "17. Tenant tiers config" "$R" '"success":true'

echo ""
echo "── EDGE CASES ──"
R=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8888/api/doctor/clinical-workflow/icd10/search?search=diabetes)
t "18. No auth → 401" "$R" "401"
R=$(curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:8888/api/cdss/knowledge/query \
  -H "Authorization: Bearer $DOC_TOKEN" -H "Content-Type: application/json" -d '{}')
t "19. Empty CDSS query → 400" "$R" "400"

echo ""
echo "── EXTERNAL HTTPS ──"
R=$(curl -sk -o /dev/null -w "%{http_code}" https://app.mediqzy.com/ 2>/dev/null)
t "20. Frontend (app.mediqzy.com)" "$R" "200"
R=$(curl -sk -o /dev/null -w "%{http_code}" https://app.mediqzy.com/api/health 2>/dev/null)
t "21. API HTTPS (mediqzy.com)" "$R" "200"

echo ""
echo "── DB RECORD COUNTS ──"
COUNTS=$(cd /home/ubuntu/Mediczy/server && node -e "
const {Pool}=require('pg');
const p=new Pool({host:'127.0.0.1',port:5432,user:'mediczy_helper',password:'Mediczy2024Helper',database:'mediczy_ai'});
(async()=>{
  const i=await p.query('SELECT count(*) FROM icd10_codes');
  const s=await p.query('SELECT count(*) FROM snomed_codes');
  const k=await p.query('SELECT count(*) FROM medical_embeddings');
  console.log('ICD:'+i.rows[0].count+' SNOMED:'+s.rows[0].count+' KB:'+k.rows[0].count);
  p.end();
})()" 2>/dev/null)
echo "    $COUNTS"
t "22. ICD-10 (72750)" "$COUNTS" "ICD:72750"
t "23. SNOMED (321864)" "$COUNTS" "SNOMED:321864"
t "24. KB embeddings (10002)" "$COUNTS" "KB:10002"

echo ""
echo "── PM2 ──"
pm2 ls 2>&1 | grep -E "name|mediczy|sib|n8n|worker"

echo ""
echo "═══════════════════════════════════════════════"
echo "  RESULTS: $PASS/$TOTAL passed, $FAIL failed"
if [ $FAIL -eq 0 ]; then
  echo "  🟢 ALL TESTS PASSED — PRODUCTION IS HEALTHY"
else
  echo "  🔴 SOME TESTS FAILED — REVIEW ABOVE"
fi
echo "═══════════════════════════════════════════════"
