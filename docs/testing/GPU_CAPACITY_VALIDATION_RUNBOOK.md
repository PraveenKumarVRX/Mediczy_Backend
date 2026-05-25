# GPU Capacity Validation Runbook (3090 + 3060)

## 1) Objective

Validate max concurrent user capacity for Mediczy AI features using:

- iSHA node on RTX 3090 (`isha.buzz`)
- iSHA-inc node on RTX 3060 (`isha-inc.com`)
- SIB as central routing policy engine

This runbook gives exact phases, commands, metrics, and release gates.

## 2) Scope

Covered features:

- Voice assistant (`/api/voice-assistant/*`)
- AI vision/OCR (`/api/ai/vision/*`, OCR pipelines)
- AI scribe (`/api/offline-scribe/*`, `/api/ai/scribe/*`)
- Task management/assistant LLM flows
- Insurance RFQ and underwriting (`/api/crm/*`, `/api/insurance*`)

## 3) Pre-Checks

Run from repo root:

```bash
./scripts/testing/run-gpu-capacity-check.sh precheck
```

Expected:

- `mediczy-server`, `sib`, `offline-scribe`, `livekit-server` online in PM2
- `/api/health` healthy
- SIB `/health` healthy
- LiveKit reachable on `:7880`

## 4) Required Inputs

Create a run file with test targets:

```bash
cp scripts/testing/gpu-capacity.env.example scripts/testing/.gpu-capacity.env
```

Set at least:

- `BASE_URL`
- `SIB_URL`
- `VOICE_RPS_TARGET`
- `OCR_RPS_TARGET`
- `SCRIBE_RPS_TARGET`
- `RFQ_RPS_TARGET`
- `SOAK_MINUTES`

Optional (for one-command mixed run):

- `PROFILE` (`clinic-peak`, `backoffice-heavy`, `emergency-spike`)
- `MIXED_DURATION_SECONDS`
- `DOCTOR_TOKEN`
- `CRM_TOKEN`

If tokens are not provided, mixed-load can auto-bootstrap tokens using:

- `DOCTOR_EMAIL` + `DOCTOR_PASSWORD` (via `/api/doctors/login`)
- `CRM_EMAIL` + `CRM_PASSWORD` (via `/api/crm/login`)

Payload fixtures included:

- `scripts/testing/payloads/voice-agent.json`
- `scripts/testing/payloads/crm-rfq.json`

Run mixed profile load:

```bash
./scripts/testing/run-gpu-mixed-load.sh
```

## 5) Traffic Profiles

Use these baseline mixes, then tune from production telemetry.

### Profile A: Clinic Interactive Peak

- Voice assistant: 45%
- Scribe: 25%
- OCR/vision: 15%
- Insurance/RFQ: 10%
- Task/agent misc: 5%

### Profile B: Backoffice Heavy

- Insurance/RFQ: 35%
- OCR/vision: 30%
- Scribe: 20%
- Voice assistant: 10%
- Task/agent misc: 5%

### Profile C: Emergency Spike

- Voice assistant: 60%
- Scribe: 20%
- OCR/vision: 10%
- Insurance/RFQ: 5%
- Task/agent misc: 5%

## 6) Test Phases

### Phase 1: Single-Feature Saturation

Goal: find per-feature bottleneck and safe RPS envelope.

Command template (replace token and payload file):

```bash
npx autocannon -c 50 -d 120 -m POST \
  -H "Authorization: Bearer $USER_TOKEN" \
  -H "Content-Type: application/json" \
  -b @scripts/testing/payloads/voice-agent.json \
  "$BASE_URL/api/voice-assistant/agent"
```

Run equivalent for:

- `/api/ai/vision/analyze`
- `/api/offline-scribe/full-pipeline`
- `/api/crm/...` RFQ/underwriting endpoints in your flow

### Phase 2: Mixed Traffic Ramp

Goal: measure realistic p95/p99 at controlled load.

Ramp levels:

- 25% target load (10 min)
- 50% target load (10 min)
- 75% target load (15 min)
- 100% target load (20 min)
- 125% target load (10 min, optional stress)

Execute:

```bash
./scripts/testing/run-gpu-capacity-check.sh ramp
```

### Phase 3: Burst Test

Goal: validate tail latency and queue recovery.

- Baseline at 70% (5 min)
- Spike to 300% (3 min)
- Return to 70% (10 min)

Execute:

```bash
./scripts/testing/run-gpu-capacity-check.sh burst
```

### Phase 4: Soak Test

Goal: detect long-run degradation/memory drift.

- Duration: 4 to 8 hours
- Load: 70% to 80% of expected peak

Execute:

```bash
./scripts/testing/run-gpu-capacity-check.sh soak
```

### Phase 5: Resilience Drills

Goal: validate routing and failover.

Drills:

1. Simulate 3090 route down (keep 3060 up)
2. Simulate 3060 route down (keep 3090 up)
3. Simulate tunnel flap (intermittent 5xx/timeout)

Pass criteria:

- Recovery to stable state < 60s
- No unbounded queue growth
- Error rate spike remains within agreed error budget window

## 7) SLO and Capacity Gates

Baseline gates (adjust to product SLA):

- Voice assistant p95 <= 1.8s, p99 <= 3.0s, error < 0.8%
- AI scribe p95 <= 6.0s, error < 1.0%
- OCR/vision p95 <= 4.0s per page
- RFQ first draft <= 90s for medium payloads
- Failover recovery <= 60s

Release gate = all mandatory SLOs pass at 100% load + resilience drills pass.

## 8) Metrics to Capture

Collect per endpoint and per route policy (`tunnel`, `serial`, `fallback`):

- RPS, throughput
- p50, p95, p99 latency
- HTTP error rate and timeout rate
- queue depth and queue wait time
- fallback count and fallback reason
- hedge count and hedge win rate

Collect per GPU node:

- utilization
- VRAM used/free
- requests in flight
- tokens/sec (if exposed)
- model load/unload count

## 9) Prometheus Query Templates

Use these as templates in Grafana/Prometheus.

Requests/sec by route:

```promql
sum(rate(http_requests_total{job="mediczy-server",route=~"/api/(voice-assistant|ai|offline-scribe|crm).*"}[1m])) by (route,method,status)
```

p95 latency by route:

```promql
histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket{job="mediczy-server",route=~"/api/(voice-assistant|ai|offline-scribe|crm).*"}[5m])) by (le,route))
```

Error rate:

```promql
sum(rate(http_requests_total{job="mediczy-server",status=~"5.."}[5m]))
/
sum(rate(http_requests_total{job="mediczy-server"}[5m]))
```

SIB health signal:

```promql
avg_over_time(up{job="sib"}[5m])
```

## 10) Go/No-Go Checklist

Mark each item `YES` or `NO`.

1. 100% load test completed with full traffic mix
2. All mandatory p95/p99 SLOs passed
3. Error budget stayed within threshold
4. No runaway queue growth observed
5. Soak test completed with stable latency trend
6. 3090-down drill passed
7. 3060-down drill passed
8. Tunnel instability drill passed
9. Recovery time under 60s in all drills
10. Rollback trigger config validated

If any item is `NO`: do not increase rollout percentage.

## 11) Recommended Rollout Gates

1. 10% traffic for 24h
2. 30% traffic for 24h
3. 60% traffic for 24h
4. 100% traffic

Rollback immediately if:

- p99 breaches for 10+ minutes
- error rate > threshold for 5+ minutes
- fallback storm sustained (unexpected surge)

## 12) Output Artifacts

Store each run under:

- `logs/perf/<timestamp>/summary.md`
- `logs/perf/<timestamp>/raw/`
- `logs/perf/<timestamp>/grafana-export.json`

Minimum report fields:

- scenario name
- load level
- pass/fail by gate
- bottleneck analysis
- routing policy changes proposed
