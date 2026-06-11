# IEC 62304:2006+AMD1:2015 Software Lifecycle

**Organisation:** MySmart Health Technologies Pvt Ltd  
**Product:** Mediczy AI Clinical Decision Support Platform  
**Version:** 1.0  
**Effective Date:** 2026-06-11  
**Approved By:** AI CTO

---

## 1. Software Safety Classification

| Software Item ID | Name                              | Safety Class | Rationale |
|-----------------|-----------------------------------|:------------:|-----------|
| SW-001          | Health Risk Scoring Engine        | B            | Inaccurate output could indirectly delay treatment |
| SW-002          | Emergency Triage (ESI) Engine     | C            | Incorrect triage classification could cause direct serious harm |
| SW-003          | Drug Interaction Checker          | C            | Missing interaction could cause serious adverse drug reaction |
| SW-004          | AI Quality Gates                  | B            | Gates protect against Class C outputs — failure enables Class C risk |
| SW-005          | LLM Provider (iSHA/Groq/OpenAI)   | B            | Carrier for Class B/C AI outputs |
| SW-006          | Dr. iSHA Voice + Text Assistant   | A            | Administrative/documentation only — no diagnostic decision |
| SW-007          | Model Governance & PCCP           | B            | Incorrect approval could enable unsafe model deployment |
| SW-008          | Groq Whisper STT (SOUP)           | A            | Voice transcription only — no clinical decision |
| SW-009          | ElevenLabs TTS (SOUP)             | A            | Audio output only — no clinical decision |
| SW-010          | PostgreSQL (SOUP)                 | B            | Stores PHI and AI decisions — integrity critical |

*Safety Class C requires the most rigorous development process. Class A requires only maintenance procedures.*

---

## 2. Software Development Process

### 2.1 Development Life Cycle Activities (IEC 62304 §5)

| Activity                   | Status        | Location / Artefact |
|---------------------------|:-------------:|---------------------|
| Software development planning | Done      | This document + CLAUDE.md |
| Software requirements analysis | Done     | `iec62304_requirements` table |
| Software architectural design | Done      | `server/services/ai-*/` structure |
| Software detailed design       | Done      | Service + route implementation |
| Software unit implementation   | Done      | All service files under `server/services/` |
| Software integration           | Done      | `app.js` route mounting |
| Software system testing        | In progress | `sanity-and-smoke-test.js` |
| Software release               | Ongoing    | PM2 on EC2 (mediqzy.com) |

### 2.2 Software Requirements

Tracked in: `iec62304_requirements` table  
Key requirement categories:
- **Functional**: AI output format, tool execution, multi-turn context
- **Safety**: Quality gate enforcement, confidence score mandatory
- **Security**: JWT auth, role-based PHI scoping, appointment relationship guard
- **Performance**: P95 < 3s for risk score, < 5s for LLM-based triage

### 2.3 Configuration Management

- **VCS**: Git (main branch → production; all merges via PR)
- **Deployment**: PM2 ecosystem config (`ecosystem.config.js`)
- **Environment variables**: AWS SSM Parameter Store via `server/scripts/ssm-env-loader.mjs`
- **DB migrations**: `server/migrations/` — run once per environment

---

## 3. Software Maintenance Process (IEC 62304 §6)

### Anomaly Management

Tracked in: `iec62304_anomalies` table  
Severity levels:
- **Critical**: Safety-impacting bug (e.g., quality gate bypass, PHI leak) — fix within 24h
- **Major**: Significant functional regression — fix within 7 days
- **Minor**: Non-functional issue — fix in next sprint
- **Enhancement**: No fix required for compliance

Critical and major anomalies with `safety_impact = true` require:
1. NCR raised in `qms_non_conformances`
2. Medical Director notification
3. PCCP review if AI model behaviour changes

### Change Management

All AI model changes (weights, thresholds, prompts) flow through:
```
governanceService.proposeChange() → pending_review
  → Medical Director: GET /api/ai-governance/changes/pending
  → POST /api/ai-governance/changes/:id/approve
  → governanceService.approveChange()
```

Software code changes follow standard Git PR process with code review.

---

## 4. SOUP (Software of Unknown Provenance) Management

| Item  | Name              | Version                  | Risk Controls |
|-------|-------------------|--------------------------|---------------|
| SW-008 | Groq Whisper STT | whisper-large-v3-turbo   | Output validated by text length check; medical terms not corrected autonomously |
| SW-009 | ElevenLabs TTS   | eleven_multilingual_v2   | No clinical content modification; text verbatim from LLM output |
| SW-010 | PostgreSQL       | 15.x                     | Parameterised queries only; pgPool connection pooling; backup policy in place |

---

## 5. API Endpoints

```
GET  /api/samd-regulatory/iec62304/dashboard       — Software lifecycle health
GET  /api/samd-regulatory/iec62304/items           — Software item registry
POST /api/samd-regulatory/iec62304/items           — Register new software item
POST /api/samd-regulatory/iec62304/anomalies       — Log anomaly
PATCH /api/samd-regulatory/iec62304/anomalies/:id/resolve
```
