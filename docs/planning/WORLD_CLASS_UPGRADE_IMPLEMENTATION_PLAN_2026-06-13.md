# World-Class Upgrade — Implementation Plan
**Date:** 2026-06-13  
**Author:** AI CTO + Engineering Team  
**Status:** READY TO IMPLEMENT (deferred — resume after break)  
**Scope:** 27 gaps identified across 6 tiers from live platform audit  

---

## Context

This plan was produced from a live audit of the Mediczy/Mediqzy platform on 2026-06-13 covering:
- AI/LLM cascade (SIB, iSHA.buzz, isha-inc.com, local SLM, Groq, OpenAI)
- FHIR R4 interoperability layer
- Security and cryptographic controls
- SaMD clinical safety and governance
- Infrastructure reliability and observability
- Database performance and scalability

**Bug fixed during audit:** `callSib()` was sending `user_id` instead of required `patient_id`, causing instant HTTP 422 on every SIB call — SIB had never successfully served a single chat request in production. Fixed in `server/services/ai-brain/llm-provider.js`.

---

## Tier 1 — Active Failures (Implement First, ~1 day total)

### ITEM-01 · n8n crashing — 43,225 restarts
**File:** PM2 ecosystem config / n8n env  
**Impact:** Workflow automation entirely non-functional  
**Root cause:** n8n trying `127.0.0.1:5432` (default Postgres) but app DB is on a different host/port  

**Implementation:**
1. Find actual Postgres host/port: `grep -E 'DATABASE_URL|DB_HOST|POSTGRES_HOST' /home/ubuntu/Mediczy/server/.env`
2. Set correct DB vars in n8n's PM2 config:
   ```
   DB_TYPE=postgresdb
   DB_POSTGRESDB_HOST=<actual_host>
   DB_POSTGRESDB_PORT=<actual_port>
   DB_POSTGRESDB_DATABASE=n8n
   DB_POSTGRESDB_USER=<user>
   DB_POSTGRESDB_PASSWORD=<pass>
   ```
   Or use SQLite if Postgres integration not needed: `DB_TYPE=sqlite`
3. Fix settings file permissions: `chmod 600 /home/ubuntu/.n8n/config`
4. Upgrade n8n (current release is >6 weeks old, error tracking disabled)
5. `pm2 restart mediczy-n8n`

**Acceptance:** PM2 restart count stops climbing; `pm2 describe mediczy-n8n` shows `uptime > 1min`

---

### ITEM-02 · SIB 30-second dead wait on every AI request
**File:** `server/services/ai-brain/llm-provider.js:295`  
**Impact:** Every clinical AI call has 30s added latency before iSHA.buzz responds  
**Root cause:** Qwen 2.5-3B runs on CPU; inference takes 60–120s, always exceeds timeout  

**Implementation:**
1. Reduce SIB timeout from 30s to 8s:
   ```js
   // line 295 — change 30_000 to 8_000
   const timeoutId = setTimeout(() => controller.abort(), 8_000);
   ```
2. Add in-memory circuit breaker above `callSib()`:
   ```js
   let _sibFailures = 0;
   let _sibOpenUntil = 0;
   // Inside callSib(), before the fetch:
   if (Date.now() < _sibOpenUntil) throw new Error('sib circuit open');
   // In catch block:
   _sibFailures++;
   if (_sibFailures >= 3) { _sibOpenUntil = Date.now() + 5 * 60_000; _sibFailures = 0; }
   // On success: _sibFailures = 0;
   ```
3. In `sib_app.py`: replace Qwen 2.5-3B planner with direct call to iSHA.buzz using the existing `retrieval_llm.generate_answer()` — this removes the CPU bottleneck entirely
4. Or: switch PM2 `sib-brain` to run `app:app` instead of `sib_app:app` (old Dr. iSHA with 150–200ms target latency calling iSHA.buzz directly)

**Acceptance:** `curl -X POST http://localhost:8001/chat -d '{...}' --max-time 5` returns 200 or fast 4xx; Node LLM calls complete in <3s end-to-end

---

### ITEM-03 · Local SLM (cascade position 7) — permanent 404
**File:** `server/services/ai-brain/llm-provider.js` (callLocalSlm), PM2 ecosystem  
**Impact:** Final offline fallback never works; `indic-gemma-2b-navarasa` not deployed  

**Implementation — Option A (Ollama, recommended):**
```bash
curl -fsSL https://ollama.com/install.sh | sh
ollama pull qwen2:1.5b          # 1GB, good Hindi + English
ollama serve &                   # runs on localhost:11434
```
Update env: `LOCAL_LLM_URL=http://localhost:11434`  
Update `callLocalSlm()` to use Ollama's OpenAI-compatible `/api/chat` endpoint.

**Implementation — Option B (keep offline_scribe on 8006, add new SLM on 8007):**
Add `LOCAL_LLM_PORT=8007` and start a llama.cpp server with `indic-gemma-2b-navarasa.gguf`.

**Acceptance:** `curl -X POST http://localhost:11434/api/chat -d '{"model":"qwen2:1.5b","messages":[...]}' ` returns 200 with content

---

## Tier 2 — Reliability & Resilience (~3 days total)

### ITEM-04 · Circuit breaker pattern for all external services
**Files:** `server/services/ai-brain/llm-provider.js`, `server/services/abdm-client.service.js`, `server/services/sftp-credential.service.js`  

**Implementation:**
Create `server/utils/circuit-breaker.js`:
```js
export class CircuitBreaker {
  constructor({ threshold = 3, cooldownMs = 60_000, name = 'unknown' } = {}) {
    this.failures = 0; this.openUntil = 0; this.name = name;
    this.threshold = threshold; this.cooldownMs = cooldownMs;
  }
  isOpen() { return Date.now() < this.openUntil; }
  onSuccess() { this.failures = 0; }
  onFailure() {
    this.failures++;
    if (this.failures >= this.threshold) {
      this.openUntil = Date.now() + this.cooldownMs;
      this.failures = 0;
      console.warn(`[CircuitBreaker] ${this.name} OPEN for ${this.cooldownMs/1000}s`);
    }
  }
}
```
Wire to: `callSib`, `callIsha`, `callIshaInc`, `callLocalSlm`, ABDM gateway, SFTP operations.

**Acceptance:** When iSHA.buzz is down, after 3 failures the cascade skips it and goes directly to Groq without waiting for timeout.

---

### ITEM-05 · DB connection pool monitoring
**Files:** `server/db/pgPool.js`, new `server/routes/health.route.js` (or add to existing health endpoint)  

**Implementation:**
Add `/api/health/db-pool` endpoint:
```js
router.get('/db-pool', authUser, requireRole('super_admin'), (req, res) => {
  const pool = getPool();
  res.json({
    total: pool.totalCount,
    idle: pool.idleCount,
    waiting: pool.waitingCount,
    maxConfigured: 20,
    utilizationPct: Math.round((pool.totalCount - pool.idleCount) / 20 * 100),
  });
});
```
Set `max: 50` in production env (`PG_POOL_MAX=50`).  
Add CloudWatch or PM2 custom metric alert when `waiting > 5`.

---

### ITEM-06 · `api_audit_logs` table partitioning by month
**File:** New `server/migrations/audit-log-partitioning.migration.js`  

**Implementation:**
```sql
-- Convert existing table to partitioned (requires pg 11+)
ALTER TABLE api_audit_logs RENAME TO api_audit_logs_legacy;
CREATE TABLE api_audit_logs (LIKE api_audit_logs_legacy INCLUDING ALL)
  PARTITION BY RANGE (created_at);
-- Create partitions for current and next 3 months
CREATE TABLE api_audit_logs_2026_06 PARTITION OF api_audit_logs
  FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
CREATE TABLE api_audit_logs_2026_07 PARTITION OF api_audit_logs
  FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');
-- Insert legacy data
INSERT INTO api_audit_logs SELECT * FROM api_audit_logs_legacy;
```
Add monthly cron in `cronRegistry.js` to auto-create next month's partition on the 25th of each month.

---

### ITEM-07 · pgvector HNSW indexes for semantic search
**File:** New `server/migrations/pgvector-hnsw-indexes.migration.js`  

**Implementation:**
```sql
-- Drop existing sequential scan indexes if any
-- Add HNSW on each embedding column
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sib_embeddings_hnsw
  ON sib_embeddings USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_semantic_cache_hnsw
  ON ai_semantic_cache USING hnsw (query_embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

ANALYZE sib_embeddings;
ANALYZE ai_semantic_cache;
```
Set `SET hnsw.ef_search = 40;` in pgPool connection initialization for query-time tuning.

**Expected improvement:** Semantic search latency drops from ~50ms (sequential) to ~2ms at 100k vectors.

---

### ITEM-08 · OpenTelemetry distributed tracing
**Files:** `server/app.js`, `server/services/ai-brain/llm-provider.js`, `server/db/pgPool.js`  

**Implementation:**
```bash
npm install @opentelemetry/sdk-node @opentelemetry/auto-instrumentations-node \
  @opentelemetry/exporter-trace-otlp-http
```
Create `server/telemetry.js` — initialize before all imports in `server/app.js`.  
Add correlation ID middleware:
```js
app.use((req, res, next) => {
  req.correlationId = req.headers['x-correlation-id'] || crypto.randomUUID();
  res.setHeader('x-correlation-id', req.correlationId);
  next();
});
```
Pass `correlationId` as a header on all external calls (SIB, iSHA.buzz, ABDM) so end-to-end traces are linkable.  
Ship to CloudWatch OTLP endpoint or self-hosted Jaeger at `http://localhost:4318`.

---

## Tier 3 — Clinical Safety & SaMD Compliance (~1 week total)

### ITEM-09 · SaMD readiness 10/16 → 16/16
**Files:** `docs/ai/SAMD_READINESS_SCORECARD.md`, `server/services/ai-model-governance.service.js`  

**Six remaining gaps to close (verify current state first via `GET /api/ai-governance/samd-readiness`):**

| Gap | Action |
|---|---|
| Clinical validation study | Document retrospective accuracy metrics per model component |
| Adverse event pathway | Add `POST /api/ai-governance/adverse-events` endpoint + email to medical director |
| Post-Market Surveillance plan | Write PMS SOP doc; add weekly automated summary email |
| Intended Use Statement | Write per-component IUS; add to each MODEL_CARD |
| Algorithm version pinning | Store model version hash in every `ai_health_risk_scores` row |
| Predicate device comparison | Document vs. comparable CE-marked or CDSCO-approved tools |

---

### ITEM-10 · Physician acknowledgment gate for AI outputs
**Files:** `server/services/ai-health-risk-cron.service.js`, `server/services/ai-emergency-triage.service.js`, DB migration  

**Implementation:**
```sql
ALTER TABLE ai_health_risk_scores
  ADD COLUMN IF NOT EXISTS physician_acknowledged_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS acknowledged_by INTEGER REFERENCES users(id);

ALTER TABLE ai_triage_interpretations
  ADD COLUMN IF NOT EXISTS physician_acknowledged_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS acknowledged_by INTEGER REFERENCES users(id);
```
Add route: `POST /api/ai-governance/risk-scores/:id/acknowledge`  
Add validation in prescription/referral routes: if patient has unacknowledged risk score above threshold, return 409 with advisory message.

---

### ITEM-11 · Consent gate before AI cron analysis
**File:** `server/services/ai-health-risk-cron.service.js`, `server/services/ai-emergency-triage.service.js`  

**Implementation:**
Add a shared helper `server/utils/ai-consent-check.js`:
```js
export async function hasAiConsent(pool, patientId) {
  const { rows } = await pool.query(
    `SELECT 1 FROM consent_records
     WHERE patient_id = $1 AND purpose = 'ai_analysis'
     AND status = 'active' AND (expires_at IS NULL OR expires_at > NOW())
     LIMIT 1`,
    [patientId]
  );
  return rows.length > 0;
}
```
Call it at the top of each patient loop in every AI cron. Log skipped patients to `ai_quality_gate_log` with gate_type `CONSENT_MISSING`.

---

### ITEM-12 · Model cards for iSHA.buzz and isha-inc.com
**File:** `server/services/ai-model-governance.service.js` (MODEL_CARDS constant)  

**Implementation:** Add two entries to `MODEL_CARDS`:
```js
{
  id: 'isha-buzz-bimedix2',
  name: 'BiMediX2-8B (iSHA.buzz)',
  version: 'BiMediX2-8B-hf.i1-Q6_K.gguf',
  provider: 'iSHA AI Platform (ai.isha.buzz)',
  intendedUse: 'Clinical reasoning, triage support, medication Q&A — REFLEX + STANDARD tiers',
  samdClass: 'IIb',
  trainingData: 'BiMediX2 — bilingual (English + Arabic) medical dataset, PubMed, clinical guidelines',
  knownLimitations: 'Max ~6k usable tokens; no real-time drug database; hallucination risk for rare conditions',
  demographicBias: 'Evaluated on Middle Eastern + Western populations; Indian-specific validation pending',
  lastAudited: '2026-06-13',
},
{
  id: 'isha-inc-gpt-oss-20b',
  name: 'GPT-OSS-20B (isha-inc.com)',
  version: 'gpt-oss-20b-q4-k-m',
  provider: 'isha-inc.com (Cloudflare-protected)',
  intendedUse: 'General clinical Q&A fallback — STANDARD tier, after iSHA.buzz',
  samdClass: 'IIb',
  trainingData: 'OSS LLM base; fine-tuning details not disclosed by provider',
  knownLimitations: 'Provider model details opaque; ~4s latency; Cloudflare may block during maintenance',
  demographicBias: 'Unknown — treat outputs with higher physician scrutiny',
  lastAudited: '2026-06-13',
},
```
After adding: `POST /api/ai-governance/model-cards/sync`

---

### ITEM-13 · Drift detection on automatic weekly schedule
**File:** `server/utils/cronRegistry.js`  

**Implementation:**
```js
// Add to cronRegistry.js after existing cron registrations
import { runDriftMonitor } from '../services/ai-model-governance.service.js';

tick(
  'ai-drift-monitor',
  '0 2 * * 1',  // Monday 2 AM
  async () => {
    const result = await runDriftMonitor();
    if (result?.drifted?.length > 0) {
      // Email medical director
      await emailService.send({
        to: process.env.MEDICAL_DIRECTOR_EMAIL,
        subject: '[ALERT] AI Model Drift Detected',
        body: `Features with drift: ${result.drifted.join(', ')}. Review at /api/ai-governance/dashboard`,
      });
    }
  }
);
```

---

## Tier 4 — Security Hardening (~3 days total)

### ITEM-14 · SFTP encryption key — independent from JWT_SECRET
**File:** `server/services/sftp-credential.service.js`  

**Implementation:**
1. Add `SFTP_CREDENTIAL_KEY` as required env var (32 hex bytes = 256 bits):
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   # Add output to server/.env as SFTP_CREDENTIAL_KEY=<value>
   ```
2. Remove `|| process.env.JWT_SECRET` fallback from the key derivation
3. Throw on startup if `SFTP_CREDENTIAL_KEY` is missing or < 32 chars
4. Write a one-off migration script `server/migrations/sftp-rekey.migration.js` that decrypts all credentials with the old key and re-encrypts with the new key

---

### ITEM-15 · ABDM OTP brute-force protection
**File:** `server/routes/abdm.route.js`  

**Implementation:**
Add a Redis-backed rate limiter to the OTP verify endpoint:
```js
import { createClient } from 'redis';
// In /abha/register/verify handler, before processing:
const lockKey = `abha_otp:${req.user.id}`;
const attempts = await redis.incr(lockKey);
if (attempts === 1) await redis.expire(lockKey, 1800); // 30-min window
if (attempts > 5) {
  await pool.query(
    `INSERT INTO api_audit_logs (user_id, action, status, details) VALUES ($1, 'ABHA_OTP_LOCKOUT', 'BLOCKED', $2)`,
    [req.user.id, JSON.stringify({ attempts })]
  );
  return res.status(429).json({ success: false, message: 'Too many OTP attempts. Try again in 30 minutes.' });
}
// On successful verification: await redis.del(lockKey);
```

---

### ITEM-16 · Audit log cryptographic chain (tamper detection)
**File:** New `server/services/audit-chain.service.js`, `server/db/pgPool.js`  

**Implementation:**
```sql
ALTER TABLE api_audit_logs ADD COLUMN IF NOT EXISTS row_hash TEXT;
ALTER TABLE api_audit_logs ADD COLUMN IF NOT EXISTS prev_hash TEXT;
```
On every INSERT into `api_audit_logs`, compute:
```js
const prevRow = await pool.query(`SELECT row_hash FROM api_audit_logs ORDER BY id DESC LIMIT 1`);
const prevHash = prevRow.rows[0]?.row_hash || '0'.repeat(64);
const payload = `${prevHash}|${action}|${userId}|${new Date().toISOString()}`;
const rowHash = crypto.createHash('sha256').update(payload).digest('hex');
// Include rowHash and prevHash in INSERT
```
Add cron `verify-audit-chain` daily at 3 AM that walks the chain and alerts on breaks.  
Alternative (simpler): Stream audit events to S3 with Object Lock (WORM). No deletion or modification possible.

---

### ITEM-17 · EDI raw string encryption at rest
**File:** `server/services/x12n-edi.service.js`  

**Implementation:**
Add `encryptEdi(raw)` and `decryptEdi(encrypted)` using the same AES-256-GCM pattern as SFTP credentials. Use env var `EDI_ENCRYPTION_KEY` (separate from SFTP key).  
In `saveEdiTransaction()`: encrypt `raw` before INSERT.  
In `getEdiTransaction()`: decrypt `raw` after SELECT.  
In `listEdiTransactions()`: do NOT return `raw` field — return only `parsed` JSON.

---

### ITEM-18 · Session invalidation on password change
**Files:** `server/middleware/auth.middleware.js`, password change route, DB migration  

**Implementation:**
```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 1;
```
In `authUser` middleware — after verifying JWT signature:
```js
const { rows } = await pool.query('SELECT token_version FROM users WHERE id = $1', [decoded.id]);
if (rows[0]?.token_version !== decoded.tokenVersion) {
  return res.status(401).json({ error: 'Session invalidated. Please log in again.' });
}
```
In password change handler: `UPDATE users SET token_version = token_version + 1 WHERE id = $1`  
Include `tokenVersion` in JWT payload at login time.

---

## Tier 5 — Performance & Scalability (~2 days total)

### ITEM-19 · Redis caching for FHIR read operations
**File:** `server/routes/fhir.route.js`  

**Implementation:**
Add cache wrapper function:
```js
async function fhirCached(key, ttlSeconds, fn) {
  const cached = await redis.get(`fhir:${key}`);
  if (cached) return JSON.parse(cached);
  const result = await fn();
  await redis.setEx(`fhir:${key}`, ttlSeconds, JSON.stringify(result));
  return result;
}
// Usage in GET /fhir/Patient/:id:
const resource = await fhirCached(`Patient:${req.params.id}`, 30, () => fetchPatient(id));
```
Invalidate on any FHIR write: `await redis.del(`fhir:${resourceType}:${id}`)`  
Cache TTLs: Patient/Practitioner 30s, Observation 15s, AuditEvent/Consent no-cache (always fresh).

---

### ITEM-20 · FHIR bulk export `$export` operation
**File:** `server/routes/fhir.route.js`, new `server/services/fhir-bulk-export.service.js`  

**Implementation:**
```
GET  /fhir/Patient/$export?_type=Patient,Observation,Condition&_since=2026-01-01
     → 202 Accepted, Content-Location: /fhir/bulkstatus/{jobId}

GET  /fhir/bulkstatus/{jobId}
     → 200 { status: 'in-progress' } or { status: 'complete', output: [{ type, url }] }

GET  /fhir/bulkdata/{jobId}/{filename}.ndjson
     → NDJSON stream of FHIR resources
```
Store export jobs in Redis. Write NDJSON files to MinIO (already running on PM2). Follow HL7 Bulk Data Access IG specification.  
Scope: one resource type per NDJSON file, one resource per line.

---

### ITEM-21 · Dedicated cron DB pool (prevent starvation)
**File:** `server/db/pgPool.js`, all cron services  

**Implementation:**
Add a second exported pool:
```js
export function getCronPool() {
  if (!_cronPool) {
    _cronPool = new Pool({ ...buildPoolConfig(), max: 5, idleTimeoutMillis: 60000 });
  }
  return _cronPool;
}
```
In all cron files (`ai-health-risk-cron`, `ai-clinical-insights-cron`, `ai-self-learning-pipeline`): import `getCronPool()` instead of `getPool()`.  
Add BullMQ job queue for patient batch processing:
```bash
npm install bullmq
```
Process patients in batches of 10 with concurrency 2 — no cron storm.

---

## Tier 6 — World-Class Enhancements (~2 weeks total)

### ITEM-22 · CDS Hooks — real-time point-of-care AI
**Files:** New `server/routes/cds-hooks.route.js`, new `server/services/cds-hooks.service.js`  

**Hooks to implement:**
| Hook ID | Trigger | AI Action |
|---|---|---|
| `patient-view` | Doctor opens patient chart | Load risk score, show alerts |
| `medication-prescribe` | Doctor prescribes a drug | Drug interaction check |
| `order-sign` | Doctor signs any order | Duplicate order detection, allergy check |
| `encounter-start` | New encounter created | Retrieve ABHA history, load chronic conditions |

**Implementation:**
```
GET  /cds-hooks/                         → Discovery endpoint (lists all hooks)
POST /cds-hooks/patient-view             → Returns cards with risk score + SHAP explanation
POST /cds-hooks/medication-prescribe     → Returns drug interaction warning cards
POST /cds-hooks/order-sign              → Returns duplicate/allergy warning cards
POST /cds-hooks/encounter-start         → Returns ABHA care context summary
```
Each response is a `{ cards: [{ summary, detail, indicator, source, suggestions }] }` object per CDS Hooks spec.  
Wire `patient-view` hook to `interpretabilityService.computeConfidenceScore()` and `qualityGates.checkAll()`.

---

### ITEM-23 · FHIR Subscriptions (push notifications to partners)
**Files:** New `server/routes/fhir-subscriptions.route.js`, new `server/services/fhir-subscription.service.js`  

**Implementation:**
```
POST /fhir/Subscription     → Register a webhook or WebSocket subscription
GET  /fhir/Subscription     → List active subscriptions
DELETE /fhir/Subscription/:id → Cancel subscription
```
Storage: `fhir_subscriptions` table with columns `(id, criteria, channel_type, channel_endpoint, status)`.  
Delivery: On every FHIR resource write, check matching subscriptions and deliver via:
- `rest-hook`: HTTP POST to partner endpoint
- `websocket`: emit via existing Socket.io
- `email`: fallback notification

Follow FHIR R4 Subscription resource spec.

---

### ITEM-24 · SIB — remove CPU Qwen planner, direct botlet routing
**File:** `ai-engine/doctor_bot/sib_app.py`  

**Implementation:**
Replace Qwen planner with a lightweight intent classifier:
```python
INTENT_RULES = [
    (re.compile(r'\b(drug|medication|interaction|prescri)', re.I), 'InsuranceBotlet'),
    (re.compile(r'\b(emergency|chest pain|stroke|triage)', re.I), 'EmergencyTriageBotlet'),
    (re.compile(r'\b(lab|result|report|test)\b', re.I), 'EHRBotlet'),
    (re.compile(r'\b(risk|score|predict)', re.I), 'RiskBotlet'),
]
def classify_intent(message: str) -> str:
    for pattern, botlet in INTENT_RULES:
        if pattern.search(message):
            return botlet
    return 'ChatBotlet'  # default
```
This reduces chat latency from 60s+ → <3s (just an iSHA.buzz call with no Qwen overhead).  
`pm2 restart sib-brain` after updating.

---

### ITEM-25 · LLM A/B testing and provider performance dashboard
**Files:** `server/services/ai-brain/llm-provider.js`, new `server/services/llm-metrics.service.js`  

**Implementation:**
After each successful LLM call, log to new table:
```sql
CREATE TABLE llm_provider_metrics (
  id SERIAL PRIMARY KEY,
  provider TEXT NOT NULL,
  cognitive_tier TEXT,
  latency_ms INTEGER,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  model TEXT,
  success BOOLEAN,
  error_type TEXT,
  use_case TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```
Add dashboard endpoint `GET /api/ai-governance/provider-performance`:
- P50/P95/P99 latency per provider
- Success rate per provider (last 24h / 7d / 30d)
- Token cost trend
- Provider failover frequency

---

### ITEM-26 · Whisper — automatic language detection for Indian multilingual consultations
**File:** `offline_scribe/main.py` (or Whisper service config)  

**Implementation:**
```python
# Change transcription call from:
result = model.transcribe(audio, language='en')
# To:
result = model.transcribe(audio, language=None)  # auto-detect
detected_lang = result.get('language', 'en')

# If non-English detected, call IndicTrans for translation:
if detected_lang != 'en':
    translated = await call_indictrans(result['text'], src=detected_lang, tgt='en')
    result['text_en'] = translated
    result['text_original'] = result['text']
    result['detected_language'] = detected_lang
```
Supported auto-detect languages: Hindi (hi), Tamil (ta), Telugu (te), Marathi (mr), Bengali (bn), Kannada (kn), Malayalam (ml), Gujarati (gu).

---

### ITEM-27 · Patient-facing data access audit (DPDP Act 2023 compliance)
**File:** New endpoint in `server/routes/patient-profile.route.js` (or similar)  

**Implementation:**
```
GET /api/patient/my-data-access-log
```
Returns simplified view of `api_audit_logs` for the requesting patient:
```json
{
  "accessLog": [
    {
      "date": "2026-06-13T10:30:00Z",
      "accessedBy": "Dr. Sharma (Cardiologist)",
      "action": "Viewed medical records",
      "dataCategory": "Vitals + Medications"
    },
    {
      "date": "2026-06-13T09:00:00Z",
      "accessedBy": "AI Risk Scoring System",
      "action": "Automated health risk analysis",
      "dataCategory": "All health data",
      "aiConsented": true
    }
  ]
}
```
Scrub all internal IDs, IP addresses, and technical details before returning.  
Add DPDP notice: `"You can withdraw AI analysis consent at any time via Settings > Privacy."`

---

## Implementation Order (Recommended)

```
Day 1 (4h)     ITEM-01 n8n fix + ITEM-02 SIB timeout/circuit breaker + ITEM-11 consent gate
Day 1 (4h)     ITEM-13 drift cron + ITEM-12 model cards + ITEM-14 SFTP key independence
Day 2 (full)   ITEM-03 Local SLM (Ollama) + ITEM-04 circuit breakers + ITEM-18 session invalidation
Day 3 (full)   ITEM-06 audit_logs partitioning + ITEM-07 pgvector HNSW + ITEM-17 EDI encryption
Day 4 (full)   ITEM-08 OpenTelemetry + ITEM-05 pool monitoring + ITEM-21 cron pool isolation
Day 5 (full)   ITEM-10 physician acknowledgment gate + ITEM-15 OTP brute-force + ITEM-16 audit chain
Week 2         ITEM-09 SaMD 10→16/16 + ITEM-19 Redis FHIR cache + ITEM-20 bulk $export
Week 3         ITEM-22 CDS Hooks + ITEM-23 FHIR Subscriptions + ITEM-24 SIB planner rewrite
Week 4         ITEM-25 A/B dashboard + ITEM-26 Whisper multilingual + ITEM-27 patient audit log
```

---

## Files to Create / Modify

| File | Action | Items |
|---|---|---|
| `server/services/ai-brain/llm-provider.js` | Modify | 02, 04, 25 |
| `server/utils/circuit-breaker.js` | Create | 04 |
| `server/utils/ai-consent-check.js` | Create | 11 |
| `server/utils/cronRegistry.js` | Modify | 06 (partition cron), 13 (drift cron) |
| `server/db/pgPool.js` | Modify | 05, 21 |
| `server/routes/fhir.route.js` | Modify | 19, 20 |
| `server/routes/cds-hooks.route.js` | Create | 22 |
| `server/routes/fhir-subscriptions.route.js` | Create | 23 |
| `server/services/cds-hooks.service.js` | Create | 22 |
| `server/services/fhir-bulk-export.service.js` | Create | 20 |
| `server/services/fhir-subscription.service.js` | Create | 23 |
| `server/services/llm-metrics.service.js` | Create | 25 |
| `server/services/audit-chain.service.js` | Create | 16 |
| `server/services/sftp-credential.service.js` | Modify | 14 |
| `server/services/x12n-edi.service.js` | Modify | 17 |
| `server/services/ai-model-governance.service.js` | Modify | 12 |
| `server/services/ai-health-risk-cron.service.js` | Modify | 11, 21 |
| `server/middleware/auth.middleware.js` | Modify | 18 |
| `server/routes/abdm.route.js` | Modify | 15 |
| `server/migrations/audit-log-partitioning.migration.js` | Create | 06 |
| `server/migrations/pgvector-hnsw-indexes.migration.js` | Create | 07 |
| `server/migrations/sftp-rekey.migration.js` | Create | 14 |
| `server/telemetry.js` | Create | 08 |
| `ai-engine/doctor_bot/sib_app.py` | Modify | 24 |
| `offline_scribe/main.py` | Modify | 26 |
| `docs/ai/SAMD_READINESS_SCORECARD.md` | Modify | 09 |

---

## Environment Variables to Add

```env
# Tier 1
LOCAL_LLM_URL=http://localhost:11434          # Ollama
N8N_DB_TYPE=postgresdb                         # or sqlite
N8N_DB_HOST=<actual_postgres_host>

# Tier 4 Security
SFTP_CREDENTIAL_KEY=<32-byte hex>              # Required, replaces JWT_SECRET fallback
EDI_ENCRYPTION_KEY=<32-byte hex>               # New — for EDI raw string encryption
MEDICAL_DIRECTOR_EMAIL=<email>                 # For drift alerts and adverse events

# Tier 6
OLLAMA_MODEL=qwen2:1.5b                        # or phi3:mini
```

---

## Success Metrics (post-implementation)

| Metric | Current | Target |
|---|---|---|
| n8n uptime | 0% (43k crashes) | >99.9% |
| AI response latency P95 | ~31s (SIB timeout + iSHA) | <3s |
| SaMD readiness score | 10/16 | 16/16 |
| Audit log query time (30d range) | ~8s | <200ms (partitioned) |
| Semantic search latency | ~50ms | <3ms (HNSW) |
| FHIR read latency | ~50ms | <5ms (Redis) |
| Provider failover visibility | None | Full dashboard |
| Session security on password change | None | Immediate invalidation |
| Consent gate coverage | 0% | 100% of AI cron patients |
| Local offline fallback | Dead (404) | Functional (Ollama) |
