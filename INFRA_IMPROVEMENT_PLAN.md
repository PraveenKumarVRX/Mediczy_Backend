# Mediczy Infrastructure Improvement Plan

**Date:** 2026-05-28  
**Prepared by:** Infrastructure audit — Claude Code  
**Scope:** ECS Fargate (mediczy.in) gaps vs EC2 (mediqzy.com) baseline  
**Status:** In progress

---

## Current Architecture (as of 2026-05-28)

| Environment | Domain | Stack | DB | Status |
|---|---|---|---|---|
| UAT | mediqzy.com | EC2 t3.xlarge + PM2 + nginx | Local PG (mediczy_ai / mediczy_helper) | Live |
| Prod | mediczy.in | ECS Fargate + ALB + ECR | RDS mediczy_prod (ap-south-1) | Live (HTTP only) |

### ECS Services (prod)
| Service | Task Def | CPU | Memory | Purpose |
|---|---|---|---|---|
| mediczy-app | mediczy-app:4 | 2 vCPU | 4 GB | API + React frontend |
| mediczy-worker | mediczy-worker:4 | 1 vCPU | 2 GB | Background jobs |

### EC2 Services (UAT + prod dependencies)
| PM2 Process | Port | Purpose | Prod dependency? |
|---|---|---|---|
| mediczy-server | 8888 | Node.js API | No (UAT only) |
| mediczy-worker | — | Background jobs | No (UAT only) |
| sib-brain | 8001 | Python AI / ClinicalBERT / LaBSE | **YES — ECS SIB_URL points here** |
| livekit-server | 7880 | Video calling | **YES — ECS uses same LiveKit** |
| mediczy-n8n | 5678 | Workflow automation | **YES — ECS N8N_WEBHOOK_URL** |
| minio-server | 9000 | Object storage | Partial — prod may use S3 |
| offline-scribe | 8006 | Whisper STT | No (not in prod task def) |
| Redis | 6379 | Cache + queues | **YES — ECS REDIS_HOST=172.31.47.217** |

---

## Gap Analysis — ECS vs EC2

### Critical EC2 Dependencies in Prod (must eliminate)

| Dependency | Current prod config | Risk |
|---|---|---|
| Redis | `REDIS_HOST=172.31.47.217` (EC2 private IP) | EC2 reboot → prod queues/sessions die |
| SIB FastAPI | `SIB_URL=http://172.31.47.217:8001` | EC2 reboot → AI features break in prod |
| n8n | `N8N_WEBHOOK_URL` points to EC2 | Workflow automations fail |
| LiveKit | ECS uses same LiveKit on EC2 | Video calls break if EC2 restarts |

---

## Improvement Plan

---

### P0 — HTTPS / SSL on mediczy.in ✅ TODO
**Why critical:** Healthcare data (patient records, OTP, clinical notes) transmitted over plain HTTP. Compliance and security blocker.

**Current state:**
- ALB has HTTP:80 listener only
- Cloudflare SSL mode: Flexible (browser→CF encrypted, CF→ALB plain HTTP)
- No ACM certificate issued

**Steps:**
1. **Request ACM certificate**
   ```
   AWS Console → Certificate Manager (ap-south-1)
   → Request public certificate
   → Domain: mediczy.in
   → Add: *.mediczy.in
   → Validation: DNS (CNAME record in Cloudflare)
   ```
2. **Add CNAME to Cloudflare** (shown after ACM request, takes 2-5 min to validate)

3. **Add HTTPS:443 listener to ALB**
   ```
   AWS Console → EC2 → Load Balancers → mediczy-alb
   → Listeners → Add listener
   → Protocol: HTTPS, Port: 443
   → Default action: Forward to mediczy-fargate-tg
   → Certificate: select ACM cert
   → Add same host-based rules as HTTP:80
   ```
4. **Add HTTP→HTTPS redirect on ALB port 80**
   ```
   Edit HTTP:80 listener default action → Redirect to HTTPS:443
   ```
5. **Switch Cloudflare SSL mode**
   ```
   Cloudflare → mediczy.in → SSL/TLS → Overview
   → Change from Flexible → Full (strict)
   ```

**Verification:**
```bash
curl -I https://mediczy.in/api/health
# Expect: HTTP/2 200
```

---

### P1a — ElastiCache Redis (remove EC2 Redis dependency) ✅ TODO
**Why:** ECS prod Redis is a single point of failure on EC2. Redis holds sessions, OTP cache, job queues, real-time state.

**Steps:**
1. **Provision ElastiCache Redis**
   ```
   AWS Console → ElastiCache → Create cluster
   → Engine: Redis OSS
   → Mode: Single node (no cluster, no multi-AZ for now)
   → Node type: cache.t3.micro (start small)
   → Subnet group: same VPC as ECS (ap-south-1)
   → Security group: new sg, allow TCP 6379 from ecs-control-plane-sg only
   → Auth token: enable (generate strong password)
   ```

2. **Update SSM parameters**
   ```
   /mediczy/prod/REDIS_HOST     → <elasticache-endpoint>
   /mediczy/prod/REDIS_PORT     → 6379
   /mediczy/prod/REDIS_PASSWORD → <auth-token>
   /mediczy/prod/REDIS_URL      → redis://:<auth-token>@<endpoint>:6379
   ```

3. **Redeploy ECS** (picks up new SSM params)
   ```bash
   ./scripts/deploy-prod.sh v1.1.1 "switch Redis to ElastiCache"
   ```

**Verification:**
```bash
curl -s https://mediczy.in/api/health | python3 -m json.tool
# Expect: "redis": "connected"
```

---

### P1b — Migrate mediczy-worker to SSM secrets ✅ TODO
**Why:** mediczy-worker task def has plaintext env vars (DB creds, Redis host, SIB URL). mediczy-app uses SSM — worker must match.

**Current worker task def env vars (plaintext — fix these):**
```
POSTGRES_USER     = postgres          ← plaintext
POSTGRES_HOST     = mediczy-prod...   ← plaintext RDS host
POSTGRES_DATABASE = mediczy_prod      ← plaintext
POSTGRES_SSL      = true              ← ok
REDIS_HOST        = 172.31.47.217     ← plaintext EC2 IP
SIB_URL           = http://172.31.47.217:8001  ← plaintext EC2 IP
```

**Steps:**
1. Ensure these SSM params exist (copy from mediczy-app params):
   ```
   /mediczy/prod/POSTGRES_USER
   /mediczy/prod/POSTGRES_HOST
   /mediczy/prod/POSTGRES_DATABASE
   /mediczy/prod/POSTGRES_PASSWORD
   /mediczy/prod/POSTGRES_SSL
   /mediczy/prod/REDIS_HOST
   /mediczy/prod/REDIS_PORT
   /mediczy/prod/REDIS_PASSWORD
   /mediczy/prod/REDIS_URL
   /mediczy/prod/SIB_URL
   /mediczy/prod/JWT_SECRET
   ```

2. Update mediczy-worker task definition via AWS Console:
   - Remove plaintext env vars
   - Add same SSM secret references as mediczy-app
   - Register new task def revision
   - Update mediczy-worker service to use new revision

---

### P2a — ECS Container Health Checks ✅ TODO
**Why:** Without a container-level health check, ECS can't detect a hung/deadlocked app (not crashed, just unresponsive). ALB health check alone is not sufficient.

**Add to mediczy-app task definition:**
```json
"healthCheck": {
  "command": ["CMD-SHELL", "curl -f http://localhost:8888/api/health || exit 1"],
  "interval": 30,
  "timeout": 10,
  "retries": 3,
  "startPeriod": 60
}
```

**Steps:**
1. AWS Console → ECS → Task Definitions → mediczy-app → Create new revision
2. Click container `mediczy-app` → scroll to Health check
3. Fill in command, interval, timeout, retries, start period as above
4. Register revision → Update service to use new revision
5. Repeat for mediczy-worker (use `/api/health` or a worker-specific ping)

---

### P2b — ECS Auto-Scaling ✅ TODO
**Why:** Both services run at desiredCount=1 — any spike or task failure causes downtime.

**Target policy:** CPU utilization 60% → scale out; scale in after 5 min cooldown.

**Steps (via AWS Console):**
```
ECS → Clusters → control-plane-cluster
→ Services → mediczy-app → Update
→ Service auto scaling → Enable
→ Min tasks: 1
→ Max tasks: 3
→ Add scaling policy:
    Type: Target tracking
    Metric: ECSServiceAverageCPUUtilization
    Target value: 60
    Scale-out cooldown: 60s
    Scale-in cooldown: 300s
```
Repeat for mediczy-worker (min 1, max 2).

---

### P2c — EFS for TRANSFORMERS_CACHE ✅ TODO
**Why:** Every ECS task restart re-downloads transformer models (~1-2 GB from HuggingFace). Cold starts take 3-5 min. EFS persists the cache across task replacements.

**Steps:**
1. **Create EFS file system**
   ```
   AWS Console → EFS → Create file system
   → Name: mediczy-transformers-cache
   → VPC: same as ECS
   → Mount targets: both subnets (subnet-0bd5e4eddec91fc71, subnet-03ca64b071a664466)
   → Security group: allow NFS (TCP 2049) from ecs-control-plane-sg
   ```

2. **Add EFS volume to mediczy-app task definition**
   ```json
   "volumes": [{
     "name": "transformers-cache",
     "efsVolumeConfiguration": {
       "fileSystemId": "<efs-id>",
       "rootDirectory": "/transformers",
       "transitEncryption": "ENABLED"
     }
   }]
   ```

3. **Mount in container**
   ```json
   "mountPoints": [{
     "sourceVolume": "transformers-cache",
     "containerPath": "/app/.cache/transformers",
     "readOnly": false
   }]
   ```

---

### P3a — Containerize SIB FastAPI as mediczy-sib ECS Service ✅ TODO
**Why:** The AI brain (ClinicalBERT, LaBSE, LangGraph) runs on EC2. Prod depends on it via private IP — not resilient, not scalable.

**Approach:**
1. Create `Dockerfile.sib` from `ai-engine/doctor_bot/`
2. Build and push to new ECR repo `mediczy-sib`
3. Create ECS service `mediczy-sib` (2 vCPU / 4 GB — models need memory)
4. Mount EFS for model cache (same as above)
5. Update `SIB_URL` SSM param to point to ECS service discovery endpoint or ALB path

**Estimated effort:** 1-2 days (Python deps, model loading, env config)

---

### P3b — Clarify MinIO vs S3 for Prod File Storage ✅ TODO
**Why:** EC2 has MinIO (PM2). ECS task def has `S3_UPLOADS_BUCKET` in SSM. Unclear if prod file uploads go to S3 or fail silently.

**Action:**
1. Check `S3_UPLOADS_BUCKET` SSM param value — confirm bucket exists and ECS IAM role has `s3:PutObject` / `s3:GetObject`
2. Check `storage.service.js` or equivalent — does it switch between MinIO and S3 based on env?
3. If S3 is wired: MinIO is UAT-only — document and close
4. If MinIO URL is hardcoded anywhere in prod path: replace with S3 SDK calls

---

### P4a — Separate RDS for UAT ✅ TODO
**Why:** UAT and prod share `mediczy_prod` on the same RDS instance. A bad schema migration on UAT can corrupt prod data.

**Steps:**
1. Snapshot current RDS instance
2. Restore snapshot as new RDS instance `mediczy-uat` (db.t3.micro sufficient)
3. Update EC2 `.env`: `POSTGRES_HOST=<uat-rds-endpoint>`, `POSTGRES_DATABASE=mediczy_uat`
4. Update `ecosystem.config.js` fallbacks to point to UAT RDS
5. Restart PM2: `pm2 restart mediczy-server sib-brain`
6. Update RDS security group for UAT instance: allow from EC2 SG only

---

### P4b — Containerize LiveKit, n8n, Offline Scribe ✅ TODO
**Why:** These services run on EC2 and are shared between UAT and prod. Not containerized.

| Service | Challenge | Approach |
|---|---|---|
| LiveKit | Needs UDP ports 50000-60000 | Run on dedicated EC2 or LiveKit Cloud |
| n8n | Stateful (workflow data) | Postgres-backed n8n on ECS + EFS for files |
| Offline Scribe | Whisper model (~3 GB), CPU-heavy | Large Fargate task (4 vCPU / 8 GB) + EFS |

**Estimated effort:** 1-2 days each. Do after P0-P2 are stable.

---

## Completion Tracker

| Priority | Item | Status | Completed |
|---|---|---|---|
| P0 | ACM cert + HTTPS:443 ALB + Cloudflare Full | TODO | — |
| P1a | ElastiCache Redis | TODO | — |
| P1b | mediczy-worker SSM secrets | TODO | — |
| P2a | ECS container health checks | TODO | — |
| P2b | ECS auto-scaling | TODO | — |
| P2c | EFS for TRANSFORMERS_CACHE | TODO | — |
| P3a | Containerize SIB FastAPI | TODO | — |
| P3b | MinIO vs S3 clarification | TODO | — |
| P4a | Separate RDS for UAT | TODO | — |
| P4b | Containerize LiveKit / n8n / Scribe | TODO | — |

---

## June 2026 Development Plan (Signup + OTP + Corporate Onboarding)

### Objective
Deliver a smooth, resilient, and enterprise-grade signup journey with strong security and minimal user friction, with special focus on corporate employee onboarding.

### Baseline (completed in May)
- Corporate employee validation endpoint is active and checks HR roster.
- Employee activation model is implemented:
   - HR-added employee records are inactive before claim.
   - Employee profile activates after successful signup and roster claim.
- OTP flow supports both channels:
   - Email OTP verification endpoint is active.
   - WhatsApp OTP verification endpoint is active.
- UAT data normalization completed for employee activation metadata.

### June Scope by Week

#### Week 1: Friction Reduction and Reliability
- Implement employee ID normalization in validation flow (uppercase, trim, separator cleanup, zero-padding rules).
- Improve validation responses with actionable guidance when lookup fails.
- Standardize OTP send response payload with per-channel delivery status and retry metadata.
- Add resend controls and fallback guidance in UI flow.

Deliverables:
- Updated API contract for OTP send and employee validation.
- UI update for resend timer, channel status, and fallback actions.

#### Week 2: Security + Adaptive Verification
- Add risk-based OTP policy:
   - Low risk: email OTP only.
   - Medium/high risk: email + WhatsApp OTP.
- Add anti-abuse controls (IP/device velocity checks, per-channel cooldown limits).
- Add audit events for OTP attempts, channel failures, and lockouts.

Deliverables:
- Policy configuration layer (tenant-safe defaults).
- Security event logs and dashboard counters.

#### Week 3: Corporate Onboarding Excellence
- Add employee validation fallback hints (possible normalized match, HR escalation CTA).
- Preserve activation metadata on HR re-upload for already claimed employees.
- Add onboarding state visibility in admin/corporate views:
   - pending-claim
   - activated
   - deactivated

Deliverables:
- Corporate employee lifecycle states surfaced in APIs and dashboard views.
- HR troubleshooting playbook for signup failures.

#### Week 4: Observability and Quality Gate
- Add full funnel analytics:
   - otp_send_requested
   - otp_send_success_by_channel
   - otp_verify_success_by_channel
   - employee_validation_failed
   - signup_completed
   - employee_activated
- Add alerts for OTP delivery degradation and corporate validation error spikes.
- Run E2E test matrix for:
   - Individual signup
   - Corporate signup (valid employee, invalid employee, already claimed employee)
   - Email-only vs dual-channel OTP policy

Deliverables:
- Signup reliability dashboard + alert thresholds.
- June signoff report with conversion and failure-rate deltas.

### Success Metrics (June Exit Criteria)
- Signup completion rate for valid users >= 85%.
- Email OTP verification success >= 95%.
- Corporate employee validation false-negative rate <= 2%.
- Median signup completion time <= 90 seconds.
- Support tickets related to OTP/employee validation reduced by >= 30% from May baseline.

### Ownership
- Backend/API: User/Auth + Corporate routes team.
- Frontend UX: Registration and onboarding screens team.
- Infra/DevOps: Logging, alerting, and runtime policy toggles.
- QA: E2E signup matrix, failure-injection, and regression coverage.

### Dependencies
- Stable Redis and cache availability (OTP state handling).
- Working email provider and WhatsApp provider credentials.
- PM2/ECS runtime env parity for OTP and verification config.
- Corporate HR roster hygiene (employee IDs and active flags).

---

## References

- ECS Cluster: `control-plane-cluster` (ap-south-1)
- ALB: `mediczy-alb-1379230293.ap-south-1.elb.amazonaws.com`
- ECR: `480664947830.dkr.ecr.ap-south-1.amazonaws.com/mediczy-app`
- RDS (prod): `mediczy-prod.cloqkwiey4k0.ap-south-1.rds.amazonaws.com`
- ECS SG: `sg-0a2a2a3e0300e84fe` (ecs-control-plane-sg)
- RDS SG: `sg-0536aee36f01ee0c3`
- EC2 private IP: `172.31.47.217`
- Deploy script: `scripts/deploy-prod.sh`
- Rollback script: `scripts/rollback-prod.sh`
