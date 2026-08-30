# Mediczy Clinical-Data MCP Server

The clinical counterpart to `mcp-servers/internal-ops` — this one touches
patient-linked imaging report data, so it's authenticated and authorized
through the exact same mechanisms the live app uses, and every tool wraps an
already-governed, already-tested function rather than raw table access.

## Tools

| Tool | What it does |
|---|---|
| `get_report_draft` | The latest AI report draft for a study, split into `clinical_report` (TECHNIQUE/FINDINGS/IMPRESSION) and `ai_explanation` (QA gate result, confidence, model version) — the same two-layer split the live AI Evidence panel uses |
| `get_analysis_status` | Whether real AI analysis ran (`ANALYZED`) or the pipeline abstained, and the specific real reason (`GOVERNANCE_LOCK`, `NO_APPLICABLE_MODEL`, `MODEL_UNAVAILABLE`, `NO_PIXEL_ANALYSIS`) |
| `check_report_against_evidence` | Fact-checks a candidate report text (e.g. a radiologist's edit, before signing) against the study's real persisted evidence — laterality + paired-measurement checking, no LLM call |

Every tool requires `token` (a real session JWT) and `studyId`. None accept raw SQL,
a table name, or an unscoped query.

## What this deliberately does NOT do

- **No LLM call anywhere in this server.** These are read/inspect tools over
  already-generated, already-gated reports. Generating a *new* report (which does
  call an LLM, behind the assertion/RAG-gating layer built earlier this session)
  stays the live app's job.
- **No parallel authorization system.** `lib/auth.js` verifies the token with the
  exact JWT secret (`server/config/auth.config.js`) the live app uses, then calls
  the exact same `assertStudyAccess()` function `doctor-ris-referred.route.js` and
  `lab/ris-imaging.route.js` call for every real request. A caller with an expired,
  forged, or wrong-tenant token is rejected exactly as the real API would reject it
  — verified directly: a wrong-tenant lab token gets a real 403, a malformed token
  a real 401, a nonexistent study a real 404.
- **No raw patient rows.** Every response is shaped by the same compiler/
  claims/fact-checker pipeline built and tested this session
  (`compileClinicalFactModel`, `buildClinicalClaims`, `checkClaimsAgainstReport`),
  never a direct `SELECT *` handed back verbatim.
- **Lightweight imports on purpose.** This imports the pure compiler/claims/
  fact-checker modules directly, never `imaging-report-drafter.service.js` (the
  orchestrator) — that file pulls in the LLM provider, Kafka, email, and WhatsApp
  config just to read one row. None of that is needed here, and importing it would
  make this server's behavior depend on services it has no reason to need.

## A real bug found and fixed while building this

The repo has **two `.env` files with two different `JWT_SECRET` values** — the
repo root's `.env` and `server/.env`. The live `mediczy-server` process (checked
directly via its real `pm2` environment) uses `server/.env`'s value. An earlier
version of this server's `index.js` loaded the root `.env` first; since `dotenv`
never overrides an already-set variable, that silently won and caused every real,
currently-valid session token to fail verification with "invalid signature" —
caught by testing against a real token, not by a syntax check. Fixed by loading
only `server/.env`. If you ever see the same "invalid signature" failure while
testing, check this first.

## Setup

```bash
cd mcp-servers/clinical-data
npm install
```

### Claude Desktop

```json
{
  "mcpServers": {
    "mediczy-clinical-data": {
      "command": "node",
      "args": ["/home/ubuntu/Mediczy/mcp-servers/clinical-data/index.js"]
    }
  }
}
```

### Claude Code

```bash
claude mcp add mediczy-clinical-data -- node /home/ubuntu/Mediczy/mcp-servers/clinical-data/index.js
```

The caller supplies their own real session token per tool call — this server has
no login flow and mints no identity.

## Testing without a full MCP client

`test-client.mjs` mints test tokens with the real `JWT_CONFIG.SECRET` (never
prints the secret itself) for a real study (11 — YOGAVARSHAN, the golden
regression case from earlier this session) and exercises every tool plus every
denial path against the real, running server:

```bash
node test-client.mjs
```

Covers: an authorized lab token, an authorized referring-doctor token, a
compliant report text (expect PASS), a deliberately swapped measurement (expect
BLOCK, verified this session's real fact-checker catches it), a wrong-tenant lab
token (expect 403), a malformed token (expect 401), and a nonexistent study
(expect 404).
