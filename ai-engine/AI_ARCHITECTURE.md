# Mediczy AI/ML & Automation Architecture

**Version:** 3.0 (Quantum + Synthetic Intelligence)  
**Last updated:** 2026-05-27  
**Stack entry point:** `ai-engine/doctor_bot/sib_app.py`  
**Runtime:** FastAPI on uvicorn, port 8001, managed by PM2 (`pm2 name: sib`)

---

## 1. System Overview

The Mediczy AI layer is called the **Synthetic Intelligence Brain (SIB)**. It is a multi-model, multi-botlet orchestration system that handles all clinical AI, medical reasoning, EHR processing, automation, and decision support for the Dr. iSHA and Mediqzy applications.

```
                    ┌─────────────────────────────────────────────────────┐
                    │           SIB FastAPI (sib_app.py :8001)            │
                    │  /chat  /query  /quantum/diagnose  /synthetic/*     │
                    │  /ehr   /risk   /triage  /automate  /planner/*      │
                    └─────────────────────┬───────────────────────────────┘
                                          │
                    ┌─────────────────────▼───────────────────────────────┐
                    │         SyntheticIntelligenceBrain (brain.py)        │
                    │                                                       │
                    │  ┌──────────────────────────────────────────────┐    │
                    │  │        QwenPlanner (qwen_planner.py)         │    │
                    │  │  Qwen 2.5-3B (local CPU, GGUF Q4_K_M)       │    │
                    │  │  .plan()  →  ExecutionPlan (JSON)            │    │
                    │  │  .synthesize() → unified final answer        │    │
                    │  └──────────────┬───────────────────────────────┘    │
                    │                 │ ExecutionPlan                       │
                    │                 ▼                                     │
                    │  ┌──────────────────────────────────────────────┐    │
                    │  │    execute_plan() — asyncio parallel groups  │    │
                    │  │                                               │    │
                    │  │  [ehr.retrieve] [triage.assess] ← group 1   │    │
                    │  │  [qbr.diagnose] [risk.evaluate] ← group 2   │    │
                    │  │  [isha_gpu.reason]              ← group 3   │    │
                    │  └──────────────────────────────────────────────┘    │
                    └─────────────────────────────────────────────────────┘
                                          │
              ┌───────────────────────────┼───────────────────────────┐
              │                           │                           │
    ┌─────────▼──────────┐   ┌───────────▼────────┐   ┌─────────────▼──────────┐
    │   Local GPU LLMs   │   │   Cloud LLM APIs   │   │   Botlets (workers)    │
    │                    │   │                    │   │                        │
    │ iSHA node1         │   │ Groq               │   │ ChatBotlet             │
    │  ai.isha.buzz      │   │  llama-3.3-70B     │   │ EHRBotlet              │
    │  BiMediX2-8B       │   │ OpenAI             │   │ RiskBotlet             │
    │  OpenInsuranceLLM  │   │  gpt-3.5-turbo     │   │ QBRBotlet (quantum)   │
    │                    │   │ Gemini             │   │ SummarizerBotlet       │
    │ iSHA node2         │   │  1.5-flash         │   │ TaskBotlet             │
    │  isha-inc.com      │   │                    │   │ NotificationBotlet     │
    │  MedGemma-4B       │   └────────────────────┘   │ InsuranceBotlet        │
    │  InsuranceLLM      │                             │ TriageBotlet           │
    └────────────────────┘                             │ WebSearchBotlet        │
                                                       └────────────────────────┘
```

---

## 2. Request Lifecycle

Every inbound request follows this path:

```
Request arrives at FastAPI endpoint
    │
    ▼
Endpoint preprocessing (KB RAG enrichment for /chat)
    │
    ▼
SyntheticIntelligenceBrain.handle_request(request_type, data)
    │
    ├── [Fast-path] HEALTH_CHECK → direct return, bypass planner
    │
    └── [Primary path]
            │
            ▼
        QwenPlanner.plan()  [asyncio.to_thread — CPU-bound Llama.cpp]
            │   ~150–300ms
            │   Input:  request_type, data dict
            │   Output: ExecutionPlan JSON
            │     { intent, urgency, steps[], parallel_groups[], reasoning }
            │
            ▼
        execute_plan()  [asyncio.gather per parallel_group]
            │
            │   Each step maps botlet → real method call
            │   Dependent steps receive _step_N_result injection
            │   LLM backend steps run in asyncio.to_thread
            │
            ▼
        QwenPlanner.synthesize()  [asyncio.to_thread]
            │   ~100–200ms
            │   Input:  original request + all step results
            │   Output: { answer, confidence, sources }
            │
            ▼
        OutcomeTracker.record()  [non-blocking, SI learning]
            │
            ▼
        Return response dict
            │
            ├── On Qwen failure → _hardcoded_route() fallback
            └── On total failure → error dict with traceback
```

---

## 3. QwenPlanner — The Central Brain

**File:** `sib/qwen_planner.py`  
**Model:** `qwen2.5-3b-instruct-q4_k_m.gguf` (local CPU, ~2GB RAM)  
**Shared with:** TinyLlamaRouter (zero extra RAM — same llama.cpp instance)

The planner is the meta-intelligence. Every request is converted into a typed execution plan before any botlet is called.

### ExecutionPlan schema

```python
@dataclass
class PlanStep:
    step: int           # step number (1-based)
    botlet: str         # which botlet/backend to call
    action: str         # action within that botlet
    params: dict        # parameters passed to the botlet
    depends_on: list    # list of step numbers this step depends on

@dataclass
class ExecutionPlan:
    intent: str                # "chest_pain_assessment", "appointment_booking", etc.
    urgency: str               # "low" | "medium" | "high" | "emergency"
    steps: List[PlanStep]
    parallel_groups: List[List[int]]   # [[1,2],[3],[4]] = groups run in parallel
    synthesis_step: int        # which step's output feeds synthesis
    reasoning: str             # brief explanation of plan logic
```

### Botlet command vocabulary (known to Qwen)

| Botlet name | Maps to | Purpose |
|---|---|---|
| `chat` | ChatBotlet | Multi-turn conversation, general Q&A |
| `ehr` | EHRBotlet | Patient EHR retrieval via UnifiedRAGRetriever |
| `risk` | RiskBotlet | Bayesian cardiovascular risk scoring |
| `qbr` | QBRBotlet | Quantum Bayesian differential diagnosis |
| `summarizer` | SummarizerBotlet | Medical document summarization |
| `task` | TaskBotlet | Task CRUD and scheduling |
| `notification` | NotificationBotlet | Alerts and reminders |
| `insurance` | InsuranceBotlet | Eligibility, claims, cost estimates |
| `triage` | EmergencyTriageBotlet | ESI urgency assessment |
| `drug_check` | brain.check_drug_interactions | Drug interaction checking |
| `knowledge` | brain.search_knowledge | Medical knowledge base queries |
| `web_search` | WebSearchBotlet | Clinical literature search |
| `local` | TinyLlamaRouter | Low-complexity CPU-only responses |
| `isha_gpu` | brain.llm_reasoning → iSHA | Direct GPU clinical reasoning |
| `groq` | brain.llm_reasoning → Groq | Direct cloud LLM reasoning |
| `gemini` | brain.llm_reasoning → Gemini | Direct cloud LLM reasoning |

### Parallel execution example

For a chest pain presentation, Qwen might generate:
```json
{
  "intent": "chest_pain_assessment",
  "urgency": "high",
  "parallel_groups": [[1, 2], [3], [4]],
  "plan": [
    {"step": 1, "botlet": "ehr",    "action": "retrieve", "params": {"query": "cardiac history"}, "depends_on": []},
    {"step": 2, "botlet": "triage", "action": "assess",   "params": {"chief_complaint": "chest pain"}, "depends_on": []},
    {"step": 3, "botlet": "qbr",    "action": "diagnose", "params": {"findings": ["chest_pain","diaphoresis"]}, "depends_on": [1,2]},
    {"step": 4, "botlet": "isha_gpu","action": "reason",  "params": {"prompt": "clinical assessment"}, "depends_on": [3]}
  ]
}
```
Steps 1 and 2 execute in parallel. Step 3 waits for both and receives their results via `_step_1_result` and `_step_2_result` param injection.

---

## 4. LLM Stack

Five-tier fallback chain in priority order:

```
1. iSHA GPU node1  ──  ai.isha.buzz (Cloudflare tunnel → 3090 GPU)
   ├── Port 8080: BiMediX2-8B         (best clinical reasoning)
   └── Port 8083: OpenInsuranceLLM-8B (billing, claims)

2. iSHA GPU node2  ──  isha-inc.com (private GPU infrastructure)
   ├── medgemma-4b     (clinical queries)
   └── insurance-llm   (insurance queries, routing based on keyword match)

3. Groq Cloud  ──  llama-3.3-70b-versatile
   (fastest cloud fallback, ~500ms, singleton client)

4. OpenAI  ──  gpt-3.5-turbo
   (rarely used, requires OPENAI_API_KEY)

5. Gemini  ──  gemini-1.5-flash
   (final fallback, requires GEMINI_API_KEY)
```

**Model selection heuristic:** Insurance/billing keywords → OpenInsuranceLLM; all other → BiMediX2-8B.

**LLM response cache:** MD5-keyed TTL dict (5 min) in `brain.py`. Identical (prompt, system_prompt) pairs skip the full fallback chain entirely.

**HTTP connection reuse:** Single `httpx.Client` singleton (`_get_isha_session()`) with keepalive pool (max 10 connections) shared across node1 and node2 — no TCP handshake overhead per request.

**Groq singleton:** `_get_groq_client()` — instantiated once at startup, reused for all fallback calls.

---

## 5. Botlets

All botlets live in `sib/botlets/`. They are lazily instantiated on first access as properties of `SyntheticIntelligenceBrain`. Shared `memory` (SharedMemory) is passed to each at construction.

| Botlet | File | Key responsibilities |
|---|---|---|
| **ChatBotlet** | `chat_botlet.py` | Multi-turn conversation with MedSpaCy NLP, MedicalPipeline integration |
| **EHRBotlet** | `ehr_botlet.py` | EHR file/text ingestion, async retrieval via UnifiedRAGRetriever |
| **RiskBotlet** | `risk_botlet.py` | Bayesian Network (CardioRisk, ASCVD, Framingham), treatment priority scoring |
| **QBRBotlet** | `quantum_brain/qbr_botlet.py` | Quantum Bayesian differential diagnosis (see §7) |
| **SummarizerBotlet** | `summarizer_botlet.py` | Medical document summarization via LLM |
| **TaskBotlet** | `task_botlet.py` | Task CRUD, overdue tracking, scheduling |
| **NotificationBotlet** | `notification_botlet.py` | Email, SMS, push, WhatsApp alerts via n8n |
| **InsuranceBotlet** | `insurance_botlet.py` | Eligibility checks, claims processing, TPA integration |
| **EmergencyTriageBotlet** | `emergency_triage_botlet.py` | ESI triage scoring, emergency detection |
| **WebSearchBotlet** | `web_search_botlet.py` | Clinical literature and guideline search |

### Shared Memory

**File:** `sib/memory.py`  
Cross-botlet context store. Holds patient context, conversation history, EHR entities, and session state. Key methods: `set_patient_context()`, `get_patient_context()`, `update_chat_history()`.

---

## 6. RAG Pipeline — Unified Retrieval

**File:** `sib/retrieval/unified_rag.py`

Single entry point for all vector retrieval in SIB. Replaces four fragmented retrieval paths that previously used incompatible models and connections.

```
query
  │
  ├─ asyncio.gather ──────────────────────────────────────────────────┐
  │                                                                     │
  ▼                                                                     ▼
_embed_pubmed(query)                                    _embed_clinical(query)
S-PubMedBert-MS-MARCO (768-dim)                         Bio_ClinicalBERT (768-dim)
Reuses sib_app._get_embed_model() singleton             Reuses pgvector_store._get_embed_model()
  │                                                                     │
  ▼                                                                     ▼
_fetch_knowledge(vec, k, category)                      _fetch_ehr(vec, k, patient_id)
asyncpg pool query                                      sync psycopg2 in asyncio.to_thread
Table: ai_document_chunks                               Table: sib_embeddings
JOIN ai_knowledge_documents                             ThreadedConnectionPool (2–10 conns)
IRDAI / WHO / clinical guidelines                       Patient EHR history
  │                                                                     │
  └─────────────────────────┬───────────────────────────────────────────┘
                             │
                             ▼
                    Merge by cosine score
                    Deduplicate by content prefix (120 chars)
                    Filter MIN_SCORE = 0.25
                    Return top-k RAGChunk list
```

### Vector stores

| Table | Embedding model | Dimension | Populated by | Queried by |
|---|---|---|---|---|
| `sib_embeddings` | Bio_ClinicalBERT | 768 | EHRBotlet, ingest pipeline | UnifiedRAGRetriever._fetch_ehr() |
| `ai_document_chunks` | S-PubMedBert-MS-MARCO | 768 | /ingest endpoint, /kb/refresh | UnifiedRAGRetriever._fetch_knowledge() |
| `medical_embeddings` | LaBSE (Xenova) | 768 | Node.js rag-pipeline.js | Node.js only — incompatible vector space |

### HybridRetriever

**File:** `sib/retrieval/hybrid_retriever.py`  
In-memory FAISS + BM25 hybrid for `/search/hybrid` endpoint. Not persistent — data lost on restart. Used for real-time dense+sparse search during a session only.

### /chat KB enrichment

Every `/chat` request (unless `skip_kb_rag=true`) automatically retrieves 3 contextually relevant chunks from UnifiedRAGRetriever and injects them as `[SOURCE: title | score=X.XX]` context blocks into the LLM prompt before inference.

---

## 7. Quantum Bayesian Reasoner (QBR)

**Files:** `sib/quantum_brain/`

Applies quantum probability theory to differential diagnosis. Mathematically distinct from classical Bayesian reasoning.

### Mathematical model

```
State:    |ψ⟩ = Σᵢ αᵢ |Dᵢ⟩
          αᵢ ∈ ℝ≥0,  Σ αᵢ² = 1  (Born rule normalization)

Init:     Uniform superposition over candidate diagnoses from chief complaint
          αᵢ = 1/√N for all candidates

Evidence  (Lüders projection rule):
update:   αᵢ ← αᵢ · √LR(E, Dᵢ)     [amplitude, not probability]
          Renormalize: Z = √(Σαᵢ²),  αᵢ ← αᵢ/Z
          Absent finding: LR_effective = 1/LR (inverse)

          vs. Classical Bayes: P(D|E) ∝ LR(E,D) · P(D)  ← multiply LR
          QBR:                 α(D|E) ∝ √LR(E,D) · α(D) ← multiply √LR
          Result: QBR is less aggressive per finding → avoids overconfidence

Interference:
          For pair (Dᵢ, Dⱼ) with coefficient κ ∈ [-1, +1]:
            αᵢ ← αᵢ + κ_scale · κ · αⱼ · αᵢ
          Constructive (κ > 0): comorbid diagnoses amplify each other
          Destructive  (κ < 0): mutually exclusive diagnoses cancel each other
          Effect is proportional to BOTH amplitudes — only matters when
          both diagnoses are meaningfully in superposition

Measurement (Born rule):
          P(Dᵢ) = αᵢ²   ← final probability from amplitude

Entropy:  S = -Σ P(Dᵢ)·log₂(P(Dᵢ))  (bits)
          High entropy → diagnostic uncertainty → more workup needed
          Low entropy  → diagnosis strongly favoured
```

### Interference pairs (selected)

| Pair | Coefficient | Meaning |
|---|---|---|
| DKA ↔ Hypoglycemia | −0.9 | Mutually exclusive by definition |
| MI ↔ GERD | −0.7 | Classic mimics — finding one actively argues against the other |
| Stroke ↔ Migraine | −0.5 | Acute neuro: one suppresses the other |
| Sepsis ↔ AKI | +0.6 | Very commonly comorbid — amplify each other |
| MI ↔ Arrhythmia | +0.5 | MI often causes arrhythmia — comorbid boost |
| Heart Failure ↔ AKI | +0.5 | Cardiorenal syndrome — frequent co-occurrence |

### Knowledge base

`medical_priors.py` encodes:
- 35+ diagnoses across 7 domains (cardiac, pulmonary, GI, neuro, infectious, endocrine, renal)
- 30+ clinical findings (symptoms, vitals, labs, ECG, imaging, risk factors)
- Likelihood ratios sourced from JAMA Rational Clinical Examination series and UpToDate
- 20 interference pairs with clinically validated coefficients
- Chief-complaint → candidate diagnosis seed sets (limits superposition to relevant diagnoses)

### API

```
POST /quantum/diagnose
{
  "chief_complaint": "chest pain",
  "findings":        ["chest_pain", "diaphoresis", "st_elevation", "elevated_troponin"],
  "absent_findings": ["fever"],
  "risk_factors":    ["diabetes", "known_hypertension"],
  "age":             62
}

Response:
{
  "top_diagnoses": [{"diagnosis": "myocardial_infarction", "probability": 0.9946, "percentage": "99.5%"}],
  "confidence":    0.9946,
  "certainty":     "high",
  "entropy_bits":  0.01,
  "uncertainty_pct": 0.3,
  "evidence_applied": [...],
  "interference_effects": ["destructive: myocardial_infarction↔gerd κ=-0.7"],
  "explanation":   "Quantum Diagnostic Reasoning — 7 evidence items applied..."
}

GET /quantum/findings      → list of all recognized clinical findings
```

---

## 8. Synthetic Intelligence Layer

**Files:** `sib/synthetic_intelligence/`

Makes SIB genuinely self-improving through operational feedback — it synthesizes knowledge from its own execution history.

### OutcomeTracker (`outcome_tracker.py`)

Records every `handle_request()` result to a 2000-record in-memory ring buffer. Persists last 500 records to `data/si_outcomes.json` every 5 minutes.

**Tracked per request:**
- `intent` — Qwen-classified request intent
- `urgency` — low / medium / high / emergency
- `provider` — which LLM served the request (isha_node1, groq, qwen_orchestrated, etc.)
- `latency_ms` — end-to-end request latency
- `confidence` — synthesis confidence score (0–1)
- `plan_steps` — number of botlet steps executed
- `had_error` — bool

### AdaptiveBrain (`adaptive_brain.py`)

Analyzes outcome history to provide actionable intelligence:

**Adaptive provider routing:** For each intent class, computes a score per provider:
```
score = (1 - error_rate) × 0.5 + avg_confidence × 0.3 + (1/avg_latency) × 0.001 × 0.2
```
If a provider consistently outperforms for a given intent, it is moved to front of the fallback chain for that intent class.

**Degradation detection:** Provider flagged as degraded if, in last 100 requests:
- error_rate > 30%, OR
- avg_latency > 8000ms

**Health score:** 0–100 composite metric:
```
100 - (error_rate × 200) - (degraded_providers × 15) - latency_trend_penalty
```

**API:**
```
GET /synthetic/analytics                  → full self-assessment report
GET /synthetic/urgency-latency            → avg latency per urgency level
GET /synthetic/provider/{intent}          → best provider recommendation for intent
```

---

## 9. Additional AI Components

### TinyLlamaRouter (`sib/tinyllama_router.py`)

Fast intent classifier and local responder. Uses the same Qwen 2.5-3B model loaded for QwenPlanner (zero extra RAM). Pattern matching covers ~70% of requests in <1ms; LLM classification used only for ambiguous cases.

**Functions:**
- `classify(message)` → `RouterDecision` with `intent`, `urgency`, `quick_response`, `needs_llm`
- Used by QwenPlanner `local` botlet for simple conversational responses

### MedicalPipeline (`sib/medical_pipeline.py`)

Heavyweight NLP pipeline used by ChatBotlet:
- MedSpaCy for clinical entity extraction (medications, diagnoses, procedures)
- Bio_ClinicalBERT sentence embeddings
- FAISS in-memory index for session-level semantic search
- Lazy-loaded on first chat request

### Bayesian Network (`utils/bayesian_network.py`)

Used by RiskBotlet for probabilistic health risk assessment:
- CardioRisk network: 10-year ASCVD and Framingham risk
- TreatmentPriority: urgency-weighted clinical decision support
- Factors: age, BP, cholesterol, diabetes, smoking, family history

### Knowledge Base (`sib/knowledge/`)

| Module | Contents |
|---|---|
| `medical_knowledge.py` | Diseases, symptoms, treatments — structured lookup |
| `drug_database.py` | Drug interactions, contraindications, dosing |
| `symptom_classifier.py` | Rule-based and ML symptom triage |
| `triage_model.py` | ESI (Emergency Severity Index) scoring logic |

### Indic Translation (`utils/indic_translation.py`)

Translates patient inputs from Hindi, Tamil, Bengali, Telugu, etc. to English before LLM processing. Enables multilingual medical consultations.

### LangGraph Agent (`sib/agent/langgraph_agent.py`)

Multi-step reasoning agent built on LangGraph, wrapping SIB botlets as LangGraph tools. Used for complex multi-hop reasoning via `/agent/query` and `/agent/run` endpoints. Falls back to direct botlet calls if LangGraph is unavailable.

### Learning Pipeline (`sib/learning_pipeline.py`)

Feedback-driven self-improvement:
- Collects user ratings and corrections from `/feedback` endpoint
- Analyzes patterns in low-rated responses
- Generates prompt improvement suggestions
- Feeds insights back into future LLM system prompts

---

## 10. Automation System

### Task Router (`sib/task_router.py`)

Routes automation requests to the appropriate handler based on `TaskType`. All automation flows also accessible via `POST /automate` or by QwenPlanner directing botlet steps to automation routes.

| TaskType | Handler | What it does |
|---|---|---|
| `schedule_appointment` | DB insert + notification | Book appointment, send confirmation |
| `reschedule_appointment` | DB update + notification | Move appointment, notify patient and doctor |
| `cancel_appointment` | DB update + notification | Cancel with reason, trigger workflow |
| `generate_prescription` | LLM + DB insert | Generate Rx from consultation data |
| `review_prescription` | LLM analysis | Drug safety check, interaction review |
| `send_notification` | NotificationBotlet | Email / SMS / push / WhatsApp |
| `send_reminder` | NotificationBotlet | Scheduled follow-up reminders |
| `add_health_diary_entry` | DB insert | Patient-reported health log |
| `update_health_diary` | DB update | Modify existing health log entry |
| `assess_risk` | RiskBotlet | Run Bayesian risk scoring |
| `detect_emergency` | TriageBotlet | Emergency flag + escalation |
| `process_ehr` | EHRBotlet | Ingest and index new EHR document |

### n8n Integration (`sib/utils/n8n_client.py`)

Workflow automation bridge. SIB triggers n8n workflows for:
- EHR processing pipelines
- Appointment confirmation emails
- High-risk patient escalations
- Scheduled medication reminders
- Knowledge base refresh (nightly at 02:00 IST)

### Knowledge Base Refresh (`POST /kb/refresh`)

Nightly automated workflow:
1. Searches for recent IRDAI circulars, WHO advisories, NABH standards
2. Fetches snippets via WebSearchBotlet
3. Embeds with S-PubMedBert and inserts into `ai_document_chunks`
4. Available next query via UnifiedRAGRetriever

---

## 11. Data Architecture

### Databases

| Database | Purpose | Access |
|---|---|---|
| PostgreSQL (primary) | Transactional data — patients, appointments, prescriptions | asyncpg pool (async), psycopg2 pool (sync EHR) |
| pgvector extension | Vector embeddings in PostgreSQL | Same connections, `<=>` cosine operator |
| Citus extension | Distributed PostgreSQL for high-scale tenants | Transparent via asyncpg |
| JSONB | Flexible schema for metadata, config, EHR sections | Native PostgreSQL |

Analytics queries (aggregations, reporting) run directly against PostgreSQL via `DatabaseManager.execute_analytics_query()` — there is no separate analytics engine.

### Key tables

| Table | Model | Populated by |
|---|---|---|
| `sib_embeddings` | ClinicalBERT 768-dim | EHRBotlet, real_time_ingest |
| `ai_document_chunks` | S-PubMedBert 768-dim | /ingest, /kb/refresh |
| `ai_knowledge_documents` | Metadata only | /ingest endpoint |
| `medical_embeddings` | LaBSE 768-dim | Node.js rag-pipeline.js |

### Connection pooling

```python
# sib_app.py — asyncpg pool (async DB, pgvector knowledge queries)
db.pg_pool = asyncpg.create_pool(min_size=2, max_size=10)

# utils/pgvector_store.py — psycopg2 ThreadedConnectionPool (EHR sync queries)
_pool = ThreadedConnectionPool(minconn=2, maxconn=10, **DB_CONFIG)
# Accessed via @contextmanager _db_conn() — auto-checkout/return
```

---

## 12. Performance Engineering

### Async architecture

All hot paths are non-blocking:
- `handle_request()` — async
- `execute_plan()` — asyncio.gather per parallel group
- `QwenPlanner.plan()` + `.synthesize()` — `asyncio.to_thread()` (CPU-bound Llama.cpp)
- `llm_reasoning()` — `asyncio.to_thread()` (sync HTTP, blocking SDK calls)
- `EHRBotlet.retrieve()` — async (uses UnifiedRAGRetriever)
- EHR pgvector query — `asyncio.to_thread()` wrapping sync psycopg2

### Startup prewarming (parallel)

All models warm simultaneously via `asyncio.gather()` in lifespan:
```python
await asyncio.gather(
    _prewarm_pubmed(),     # S-PubMedBert-MS-MARCO
    _prewarm_clinical(),   # Bio_ClinicalBERT + pgvector pool
    _prewarm_qwen(),       # Qwen 2.5-3B (TinyLlamaRouter)
    _prewarm_groq(),       # Groq singleton client
)
```

### Caching

| Cache | Key | TTL | Location |
|---|---|---|---|
| LLM response cache | MD5(prompt+system) | 5 min | `brain.py _llm_cache` dict |
| KB RAG for /chat | Per-request, not cached | — | Request-scoped |
| Embedding models | Singleton | forever | Module-level globals |
| HTTP sessions | Singleton | forever | `_isha_session` httpx.Client |
| Groq client | Singleton | forever | `_groq_client` |

### Known bottlenecks (as of v3.0)

1. **iSHA GPU latency** — 2–8s when GPU is under load; Groq fallback is ~500ms
2. **Qwen plan+synthesize** — ~350–500ms total CPU time; runs in thread pool
3. **First-request cold start** — eliminated by parallel prewarming
4. **HybridRetriever** — FAISS is in-memory only; loses data on restart (only used for `/search/hybrid`)

---

## 13. Environment Variables

| Variable | Default | Used by |
|---|---|---|
| `ISHA_AI_URL` | `https://ai.isha.buzz` | iSHA GPU node1 inference |
| `ISHA_INC_URL` | `https://isha-inc.com` | iSHA GPU node2 inference |
| `ISHA_INC_API_KEY` | — | node2 Bearer auth |
| `GROQ_API_KEY` | — | Groq cloud fallback |
| `OPENAI_API_KEY` | — | OpenAI fallback |
| `GEMINI_API_KEY` | — | Gemini fallback |
| `POSTGRES_HOST` | `127.0.0.1` | All DB connections |
| `POSTGRES_DATABASE` | `mediczy_ai` | All DB connections |
| `POSTGRES_USER` | `mediczy_helper` | All DB connections |
| `POSTGRES_PASSWORD` | — | All DB connections |
| `SIB_PORT` | `8001` | FastAPI server port |
| `LOG_LEVEL` | `INFO` | Python logging |

---

## 14. API Surface (sib_app.py — port 8001)

### AI / Clinical

| Method | Path | Description |
|---|---|---|
| POST | `/chat` | Multi-turn conversational AI with KB RAG enrichment |
| POST | `/query` | RAG-powered Q&A with risk assessment |
| POST | `/emergency-triage` | ESI urgency scoring |
| POST | `/symptoms/classify` | Symptom classification and triage |
| POST | `/triage` | Full triage assessment |
| POST | `/drugs/check` | Drug interaction checking |
| POST | `/risk` | Bayesian cardiovascular risk scoring |
| POST | `/quantum/diagnose` | Quantum Bayesian differential diagnosis |
| GET  | `/quantum/findings` | List recognized clinical findings |
| POST | `/agent/query` | LangGraph multi-step reasoning agent |
| POST | `/agent/run` | Execute LangGraph agent workflow |

### EHR

| Method | Path | Description |
|---|---|---|
| POST | `/ehr/upload` | Upload and ingest EHR file |
| POST | `/ehr/text` | Ingest raw EHR text |
| POST | `/ehr/ingest` | Batch ingest all pending EHR files |
| GET  | `/ehr/status` | EHR ingestion pipeline status |

### Knowledge / RAG

| Method | Path | Description |
|---|---|---|
| POST | `/knowledge/search` | Medical knowledge base search |
| POST | `/rag/retrieve` | Unified vector retrieval (EHR + knowledge, parallel) |
| POST | `/rag/search` | Knowledge-base-only vector search |
| POST | `/search/hybrid` | FAISS + BM25 hybrid search |
| POST | `/embed` | Embed text with S-PubMedBert → ai_document_chunks |
| POST | `/ingest` | Chunk, embed, and store document in knowledge base |
| POST | `/kb/refresh` | Nightly knowledge base refresh from web sources |

### Automation

| Method | Path | Description |
|---|---|---|
| POST | `/automate` | Unified automation endpoint (all 12 task types) |
| POST | `/task` | Create task |
| GET  | `/task/{id}` | Get task |
| GET  | `/tasks/overdue` | List overdue tasks |
| POST | `/notify` | Send notification |
| GET  | `/notifications/{patient_id}` | Patient notifications |
| POST | `/insurance` | Insurance processing |
| POST | `/summarize` | Medical document summarization |
| POST | `/scribe/generate` | AI clinical scribe |
| POST | `/web/search` | Web search |
| POST | `/web/medical-search` | PubMed/clinical literature search |

### Planner / Orchestration

| Method | Path | Description |
|---|---|---|
| POST | `/planner/plan` | Generate execution plan (without running it) |
| GET  | `/planner/status` | Qwen model load status and capabilities |

### Synthetic Intelligence

| Method | Path | Description |
|---|---|---|
| GET | `/synthetic/analytics` | SI self-assessment: health score, trends, degraded backends |
| GET | `/synthetic/urgency-latency` | Urgency vs latency correlation |
| GET | `/synthetic/provider/{intent}` | Best LLM provider for intent class |

### Infrastructure

| Method | Path | Description |
|---|---|---|
| GET  | `/` | System info and version |
| GET  | `/health` | Health check (bypasses planner) |
| GET  | `/stats` | Full system statistics |
| POST | `/webhook/n8n` | n8n workflow webhook receiver |

### Mediczy Data

| Method | Path | Description |
|---|---|---|
| GET | `/mediczy/doctors` | Doctor directory |
| GET | `/mediczy/hospitals` | Hospital directory |
| GET | `/mediczy/labs` | Lab directory |
| GET | `/mediczy/patient/{user_id}` | Patient record |
| GET | `/mediczy/patient/{user_id}/appointments` | Patient appointments |
| GET | `/mediczy/patient/{user_id}/prescriptions` | Patient prescriptions |

---

## 15. Source Map

```
ai-engine/doctor_bot/
├── sib_app.py                    # FastAPI app — all endpoints, lifespan, AppState
├── sib/
│   ├── brain.py                  # SyntheticIntelligenceBrain — core orchestrator
│   ├── qwen_planner.py           # QwenPlanner — plan + execute + synthesize
│   ├── tinyllama_router.py       # Fast intent classifier (shared Qwen model)
│   ├── task_router.py            # Automation task dispatcher
│   ├── database.py               # DB connection manager (asyncpg + Citus)
│   ├── memory.py                 # SharedMemory — cross-botlet context
│   ├── memory_persistent.py      # Persistent memory (DB-backed)
│   ├── learning_pipeline.py      # Feedback-driven self-improvement
│   ├── medical_pipeline.py       # MedSpaCy + ClinicalBERT + FAISS session pipeline
│   ├── route_safety_validator.py # Clinical safety guardrails
│   ├── botlets/
│   │   ├── chat_botlet.py
│   │   ├── ehr_botlet.py         # Uses UnifiedRAGRetriever
│   │   ├── emergency_triage_botlet.py
│   │   ├── insurance_botlet.py
│   │   ├── notification_botlet.py
│   │   ├── risk_botlet.py        # Bayesian Network risk scoring
│   │   ├── summarizer_botlet.py
│   │   ├── task_botlet.py
│   │   └── web_search_botlet.py
│   ├── retrieval/
│   │   ├── unified_rag.py        # UnifiedRAGRetriever (parallel asyncpg + psycopg2)
│   │   └── hybrid_retriever.py   # FAISS + BM25 in-memory hybrid
│   ├── quantum_brain/
│   │   ├── qbr.py                # QuantumBayesianReasoner — core engine
│   │   ├── medical_priors.py     # LR matrix + interference pairs
│   │   └── qbr_botlet.py         # SIB botlet wrapper
│   ├── synthetic_intelligence/
│   │   ├── outcome_tracker.py    # Ring buffer + JSON persistence
│   │   └── adaptive_brain.py     # Analytics, degradation detection, routing
│   ├── knowledge/
│   │   ├── medical_knowledge.py
│   │   ├── drug_database.py
│   │   ├── symptom_classifier.py
│   │   └── triage_model.py
│   ├── agent/
│   │   ├── langgraph_agent.py    # LangGraph multi-step agent
│   │   └── react_agent.py        # ReAct-style reasoning agent
│   ├── api/
│   │   ├── ab_test_api.py        # A/B testing for LLM responses
│   │   ├── analytics_api.py      # Usage analytics
│   │   └── feedback_api.py       # User feedback collection
│   └── utils/
│       └── n8n_client.py         # n8n workflow trigger client
└── utils/
    ├── pgvector_store.py         # ClinicalBERT embeddings, ThreadedConnectionPool
    ├── retrieval_llm.py          # iSHA GPU retrieval + RAG answer generation
    ├── bayesian_network.py       # CardioRisk / TreatmentPriority Bayesian nets
    ├── embed_store.py            # FAISS embedding store (legacy)
    ├── preprocess.py             # MedSpaCy EHR text preprocessing
    ├── real_time_ingest.py       # EHR file watcher and ingestion
    ├── risk_scoring.py           # Framingham, ASCVD, clinical risk calculators
    ├── safety_filter.py          # Clinical safety guardrails
    └── indic_translation.py      # Hindi/Tamil/Bengali/Telugu → English
```

---

## 16. Adding New Capabilities

### Add a new botlet

1. Create `sib/botlets/my_botlet.py` with a class `MyBotlet(memory)`.
2. Add lazy property to `SyntheticIntelligenceBrain` in `brain.py`.
3. Add the botlet name and description to `QwenPlanner._PLAN_SYSTEM` string in `qwen_planner.py`.
4. Add the dispatch case to `_execute_step()` in `qwen_planner.py`.
5. Add the API endpoint to `sib_app.py` if needed.

### Add a new LLM provider

1. Add a new method `_xyz_inference()` to `SyntheticIntelligenceBrain`.
2. Add it to the fallback chain in `llm_reasoning()`.
3. Add a singleton client getter if it has per-instantiation cost.

### Add new quantum interference knowledge

Edit `sib/quantum_brain/medical_priors.py`:
- Add symptom LRs to `SYMPTOM_LRS`
- Add diagnosis pair to `INTERFERENCE_PAIRS`
- Add diagnosis to `DIAGNOSES` list
- Update relevant `COMPLAINT_PRIORS` candidate sets

### Add new automation task type

1. Add to `TaskType` enum in `sib/task_router.py`.
2. Add handler method and dispatch case in `SIBTaskRouter.route_task()`.
3. Add mapping in `/automate` endpoint in `sib_app.py`.
4. Add as automation route in `QwenPlanner._PLAN_SYSTEM`.

---

*Generated from live codebase state — commit `bc481637`. Update this document when architectural changes are made.*
