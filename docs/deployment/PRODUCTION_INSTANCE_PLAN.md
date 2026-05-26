# Production Instance Plan

**Status:** Current production is a single t3.xlarge in ap-south-1a (Mumbai)  
**Last Audited:** 2026-05-23  
**Urgency:** Disk at 92% — immediate action required before anything else

---

## Table of Contents

1. [Current State — What's Running](#1-current-state--whats-running)
2. [Critical Issues (Fix This Week)](#2-critical-issues-fix-this-week)
3. [Phase 1 — Stabilise (Weeks 1–4)](#3-phase-1--stabilise-weeks-14)
4. [Phase 2 — Separate Concerns (Months 2–3)](#4-phase-2--separate-concerns-months-23)
5. [Phase 3 — High Availability (Months 4–6)](#5-phase-3--high-availability-months-46)
6. [Phase 4 — Cloud-Native (Month 6+, NestJS aligned)](#6-phase-4--cloud-native-month-6-nestjs-aligned)
7. [Cost Estimates](#7-cost-estimates)
8. [Secrets Management](#8-secrets-management)
9. [Backup Strategy](#9-backup-strategy)
10. [Monitoring & Alerting](#10-monitoring--alerting)
11. [CI/CD Pipeline](#11-cicd-pipeline)
12. [Staging Environment](#12-staging-environment)

---

## 1. Current State — What's Running

Everything runs on **one AWS t3.xlarge** in `ap-south-1a` (Mumbai).

### Server specs

| Resource | Total | Used | Status |
|---|---|---|---|
| vCPU | 4 | ~80% peak | Marginal |
| RAM | 16 GB | 9.2 GB + 4 GB swap | Under pressure |
| Disk | 96 GB | 88 GB (92%) | **CRITICAL** |
| Swap usage | 8 GB | 4 GB | Memory is tight |

### Process inventory

| PM2 Process | RAM | Restarts | Notes |
|---|---|---|---|
| `mediczy-server` (Express) | 992 MB | 669 | Reloads during development, heap capped at 1.5GB |
| `sib` (Python FastAPI) | 1.7 GB | 12 | LaBSE + ClinicalBERT models loaded into memory |
| `mediczy-worker` (BullMQ) | 282 MB | 526 | High restart count — needs investigation |
| `livekit-server` | 38 MB | 81 | Stable |

### Co-located services (not in PM2)

| Service | Port | Memory | Notes |
|---|---|---|---|
| PostgreSQL 16 | 5432 | ~300 MB | Self-hosted, 1.2 GB database, 339 tables |
| pgBouncer | 6432 | ~30 MB | Connection pooler |
| Redis | 6379 | ~50 MB | Cache + BullMQ backend |
| coturn (STUN/TURN) | 5349 | ~20 MB | WebRTC relay |
| Prometheus | 9090 | ~100 MB | Metrics collection |
| Grafana | 3100 | ~100 MB | Dashboards |
| AlertManager | 9093 | ~50 MB | Alerts → sk@mysmarthealth.in |
| Blackbox Exporter | 9115 | ~15 MB | HTTP probes |
| n8n | 5678 | ~200 MB | Workflow automation |
| Rocket.Chat | — | ~300 MB | Team chat |

### Disk breakdown

| Path | Size | Removable from prod? |
|---|---|---|
| `ai-engine/doctor_bot/venv` | 5.7 GB | No (SIB needs it) |
| `ai-engine/doctor_bot/models` | 2.7 GB | No (ML models) |
| `server/node_modules` | 1.8 GB | No |
| `client/node_modules` | 1.3 GB | No |
| `/home/ubuntu/android-sdk` | 3.4 GB | **Yes — dev artifact** |
| `/home/ubuntu/MSH_D_App` | 2.5 GB | **Yes — source code** |
| `/home/ubuntu/MSH_M_App` | 2.5 GB | **Yes — source code** |
| `Mediczy/uat.sql` | 652 MB | **Yes — move off server** |
| `Mediczy/iOS_Ble_SDK-master` | 111 MB | **Yes — dev artifact** |
| `Mediczy/Android_Ble_SDK-master` | 76 MB | **Yes — dev artifact** |
| `Mediczy/whisper.cpp` | 59 MB | **Yes — unused** |

### What's working well

- Prometheus + Grafana + AlertManager already wired up
- Daily encrypted PostgreSQL backup to MinIO
- CloudFront CDN for frontend assets (S3 bucket `app.mediqzy.com`)
- pgBouncer connection pooling in front of PostgreSQL
- HIPAA audit logging on every request
- GitHub Actions CI/CD deploy on push to main

---

## 2. Critical Issues (Fix This Week)

These do not require infrastructure changes. Run them on the current server.

### Issue 1 — Disk at 92% (immediate)

Free ~9.5 GB by removing development artifacts that have no place on a production server:

```bash
# Remove Android SDK (3.4 GB) — dev tool, not needed on prod
sudo rm -rf /home/ubuntu/android-sdk

# Remove mobile app source code (5 GB) — these live in Git
sudo rm -rf /home/ubuntu/MSH_D_App
sudo rm -rf /home/ubuntu/MSH_M_App

# Move the database dump off-server (652 MB)
# Upload to MinIO then delete
mc cp /home/ubuntu/Mediczy/uat.sql mediqzy/mediczy-backups/manual/uat-$(date +%Y%m%d).sql
rm /home/ubuntu/Mediczy/uat.sql

# Remove BLE SDKs (187 MB)
rm -rf /home/ubuntu/Mediczy/iOS_Ble_SDK-master
rm -rf /home/ubuntu/Mediczy/Android_Ble_SDK-master

# Remove unused whisper.cpp (59 MB) if not in use
rm -rf /home/ubuntu/Mediczy/whisper.cpp

# Verify disk after cleanup
df -h /
```

Expected result: disk drops from 92% to ~77%. Not great but no longer critical.

### Issue 2 — Backup retention is 1 day

The current cleanup script keeps only 1 backup. One corrupted backup = total data loss.

Edit `/home/ubuntu/backup-auto-cleanup.sh` and change retention to 30 days:

```bash
# Find the retention variable in the cleanup script and change it
grep -n "RETENTION\|retention\|keep\|days" /home/ubuntu/backup-auto-cleanup.sh
# Change to: RETENTION_DAYS=30
```

Also fix the backup crontab to run a verification step:

```bash
crontab -e
# Change the backup line to:
# 0 2 * * * /home/ubuntu/backup-to-minio.sh >> /home/ubuntu/logs/backup.log 2>&1 && echo "$(date): Backup OK" >> /home/ubuntu/logs/backup-status.log || echo "$(date): BACKUP FAILED" | mail -s "MEDICZY BACKUP FAILED" sk@mysmarthealth.in
```

### Issue 3 — SSL certificates are manual

Certbot is not installed. Certificates at `/etc/nginx/ssl/smart-chat.live.crt` expire silently.

```bash
# Install certbot
sudo apt install -y certbot python3-certbot-nginx

# Issue certificates for all domains
sudo certbot --nginx -d app.mediqzy.com -d mediqzy.com -d www.mediqzy.com \
  -d video.mediqzy.com -d n8n.mediqzy.com -d scribe.mediqzy.com

# Verify auto-renewal
sudo certbot renew --dry-run

# Add renewal to crontab (certbot installs this automatically, verify it exists)
sudo crontab -l | grep certbot
```

After this, nginx config needs updating to reference the Let's Encrypt certs instead of the manual ones at `/etc/nginx/ssl/`.

### Issue 4 — Worker process 526 restarts

```bash
# Check what's crashing the worker
pm2 logs mediczy-worker --lines 50 --nostream | grep -E "Error|crash|killed|heap|SIGTERM"

# Check worker memory limit in ecosystem.config.js
grep -A5 "mediczy-worker" /home/ubuntu/Mediczy/ecosystem.config.js | grep memory
```

If the worker is hitting the `500M` max memory limit, the emails/campaigns being processed are loading too much into memory at once. Add a concurrency limit:

```javascript
// ecosystem.config.js — mediczy-worker
env: {
  NODE_ENV: 'production',
  WORKER_CONCURRENCY: 3,   // reduce from 10 to 3
}
```

---

## 3. Phase 1 — Stabilise (Weeks 1–4)

The goal of Phase 1 is to make the current single server stable and observable before adding more infrastructure.

### 1.1 — Expand disk to 200 GB

The current 96 GB root volume is inadequate. ML models alone are 2.7 GB, Python venv is 5.7 GB, and logs grow daily.

In AWS console:
1. EC2 → Volumes → select the root volume → Modify Volume → set to 200 GB
2. Wait for modification to complete (~5 min)
3. On the server, grow the filesystem:

```bash
# Grow the partition (no reboot needed on AWS with Nitro instances)
sudo growpart /dev/nvme0n1 1
sudo resize2fs /dev/nvme0n1p1
df -h /   # confirm new size
```

**Cost delta:** ~$10/month additional (gp3 at $0.08/GB-month).

### 1.2 — Add a staging server

Right now every code change deploys directly to production. There is no testing environment between development and live. This is the second biggest operational risk after disk usage.

Provision a **t3.medium** (2 vCPU, 4 GB) in the same AZ:

```bash
# On AWS console: Launch Instance
# AMI: Ubuntu 24.04 LTS (same as production)
# Instance type: t3.medium ($0.0464/hr, ~$34/month)
# Storage: 80 GB gp3
# Security group: same as production
# Key pair: same as production

# After launch, set up staging
ssh ubuntu@<staging-ip>
git clone git@github.com:MySmartHealth/Mediczy.git
cd Mediczy
# Copy .env from production and change to staging values
# (different JWT_SECRET, test Razorpay keys, test Twilio)
cp /path/to/prod.env .env
# edit .env: NODE_ENV=staging, different secrets

# Install Node, PM2, Python, etc. (same as production)
# Use a staging PostgreSQL (can be same server initially, different DB)
```

Update GitHub Actions to deploy to staging first, then production:

```yaml
# .github/workflows/deploy.yml
jobs:
  deploy-staging:
    runs-on: ubuntu-latest
    steps:
      - uses: appleboy/ssh-action@master
        with:
          host: ${{ secrets.STAGING_HOST }}
          script: |
            cd /home/ubuntu/Mediczy && git pull origin main
            npm run test:smoke
            pm2 reload mediczy-server

  deploy-production:
    needs: deploy-staging
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: appleboy/ssh-action@master
        with:
          host: ${{ secrets.SERVER_HOST }}
          script: |
            cd /home/ubuntu/Mediczy && git pull origin main
            npm run test:smoke  # run against current prod before deploying
            pm2 reload mediczy-server
            sleep 10
            curl -f https://app.mediqzy.com/api/health
```

### 1.3 — Increase Node heap and add PM2 cluster mode

The current config runs a single Node instance with a 1.5 GB heap limit on a server with 16 GB RAM. This is unnecessarily tight.

In `ecosystem.config.js`:

```javascript
{
  name: 'mediczy-server',
  instances: 2,              // was 1 — run 2 workers, each gets its own heap
  exec_mode: 'cluster',
  node_args: '--max-old-space-size=2048',  // was 1536
  max_memory_restart: '2.5G',             // was 2G
}
```

With 2 instances: if one crashes during a reload, the other keeps serving traffic. Zero-downtime deploys actually work.

**Note:** Socket.IO requires the Redis adapter for multi-instance mode. This is already installed (`@socket.io/redis-adapter`). Verify it's initialised at startup in `server.controller.js`.

### 1.4 — Fix the Sequelize validation error causing prescription failures

From the error logs:
```
ValidationError: string violation: doctorQualifications cannot be an array or an object
```

This is a real bug in the prescription generation path. The `doctorQualifications` field is being passed as an array where the DB column expects a string.

```bash
# Find the source
grep -rn "doctorQualifications" /home/ubuntu/Mediczy/server/routes/ | grep -v ".bak"
```

The fix is to stringify the array before saving:
```javascript
doctorQualifications: Array.isArray(doctorQualifications)
  ? doctorQualifications.join(', ')
  : doctorQualifications
```

---

## 4. Phase 2 — Separate Concerns (Months 2–3)

The single biggest architectural risk is having PostgreSQL, the AI engine (SIB), and the application all competing for RAM on one box. Phase 2 separates them.

### The three things that must not share a server

| Service | Reason to separate |
|---|---|
| **PostgreSQL** | Patient health data. Needs dedicated IOPS, automated backups, failover. A Node.js OOM kill should never affect the DB. |
| **SIB FastAPI** | 1.7 GB RAM + 2.7 GB models. Memory-intensive, CPU-intensive during inference. Spikes affect API response times. |
| **Application (Express/NestJS)** | Needs burst CPU capacity. Should scale horizontally. |

### 2.1 — Move PostgreSQL to RDS

**Why RDS over self-hosted:**
- Automated daily backups with point-in-time recovery (35-day retention)
- Multi-AZ failover — if the AZ fails, automatic promotion to standby (< 60s)
- No manual patching
- Free storage autoscaling
- AWS handles `pg_upgrade`

**Recommended RDS config:**

```
Instance:     db.t3.large (2 vCPU, 8 GB RAM)
Engine:       PostgreSQL 16
Storage:      100 GB gp3 (autoscaling to 500 GB)
Multi-AZ:     Yes (adds ~$70/month but required for production)
Backups:      35 days retention
Encryption:   At rest (AWS KMS) — required for HIPAA
Parameter group:
  max_connections = 200 (pgBouncer handles pooling)
  shared_buffers = 2GB
  work_mem = 64MB
  wal_level = logical (for future replication)
```

**Extensions to enable on RDS:**
```sql
CREATE EXTENSION IF NOT EXISTS pgvector;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
```

**Migration steps:**

```bash
# 1. Create RDS instance (AWS console or CLI)
aws rds create-db-instance \
  --db-instance-identifier mediczy-prod \
  --db-instance-class db.t3.large \
  --engine postgres \
  --engine-version 16 \
  --master-username mediczy_helper \
  --master-user-password <new-password> \
  --allocated-storage 100 \
  --storage-type gp3 \
  --multi-az \
  --backup-retention-period 35 \
  --storage-encrypted \
  --region ap-south-1

# 2. Dump current database
PGPASSWORD=Mediczy2024Helper pg_dump \
  -h 127.0.0.1 -U mediczy_helper -d mediczy_ai \
  --no-owner --no-privileges -Fc -Z 9 \
  > /tmp/mediczy_migration.dump

# 3. Restore to RDS (during maintenance window)
pg_restore \
  -h <rds-endpoint>.rds.amazonaws.com \
  -U mediczy_helper -d mediczy_ai \
  --no-owner --no-privileges \
  /tmp/mediczy_migration.dump

# 4. Update .env on production server
POSTGRES_HOST=<rds-endpoint>.rds.amazonaws.com
POSTGRES_SSL=true

# 5. Update pgBouncer to point to RDS
# Edit /etc/pgbouncer/pgbouncer.ini: host = <rds-endpoint>

# 6. Test and cut over
pm2 reload mediczy-server
curl https://app.mediqzy.com/api/health
```

**After RDS migration:** Remove PostgreSQL, pgBouncer from the production app server. Free ~300 MB RAM and significant disk IOPS.

### 2.2 — Move SIB FastAPI to a separate instance

SIB uses 1.7 GB RAM with ML models loaded. This is appropriate for a dedicated GPU/CPU inference server, not shared with an API server.

**Recommended instance for SIB:** `c5.xlarge` (4 vCPU, 8 GB RAM) — compute-optimised for CPU inference

```bash
# Launch c5.xlarge in same AZ (ap-south-1a)
# Copy the SIB code and models
rsync -avz /home/ubuntu/Mediczy/ai-engine/ ubuntu@<sib-ip>:/home/ubuntu/sib/
rsync -avz /home/ubuntu/Mediczy/server/.env ubuntu@<sib-ip>:/home/ubuntu/sib/.env

# Start SIB on new instance
cd /home/ubuntu/sib/doctor_bot
source venv/bin/activate
uvicorn sib_app:app --host 0.0.0.0 --port 8001 --workers 2
```

Update `server/.env`:
```
SIB_URL=http://<sib-private-ip>:8001
```

**After SIB migration:** Remove the Python venv (5.7 GB) and models (2.7 GB) from the app server. Free ~8.4 GB disk and 1.7 GB RAM. The app server disk drops from ~77% to ~50%.

### 2.3 — Move Redis to ElastiCache

Self-hosted Redis on the app server ties the cache/queue backend to the same machine as the app. If the app server is restarted, BullMQ jobs in Redis restart too.

```
Instance:  cache.t3.micro (1 vCPU, 0.5 GB) for dev/staging
           cache.t3.small (1 vCPU, 1.37 GB) for production
Engine:    Redis 7.x
Mode:      Single node (add cluster mode later)
Auth:      Yes (same Redis password as current)
Encryption: In-transit + at-rest
```

Update `server/.env`:
```
REDIS_URL=rediss://:password@<elasticache-endpoint>:6379/0
```

---

## 5. Phase 3 — High Availability (Months 4–6)

After Phase 2, the architecture looks like:

```
nginx (app server) → Express/NestJS → RDS PostgreSQL (Multi-AZ)
                                    → ElastiCache Redis
                                    → SIB FastAPI (separate server)
                                    → LiveKit (existing)
```

Phase 3 adds redundancy at the application tier.

### 3.1 — Add Application Load Balancer

```
Route 53 (mediqzy.com) → ALB → Target Group: [app-server-1, app-server-2]
```

**ALB config:**
- HTTPS listener on 443 with ACM certificate (replaces manual nginx SSL)
- HTTP → HTTPS redirect
- Health check: `GET /api/health` — expects 200
- Stickiness: disabled (sessions are JWT, no server-side state)

**ACM certificate:**
```bash
aws acm request-certificate \
  --domain-name mediqzy.com \
  --subject-alternative-names "*.mediqzy.com" "app.mediqzy.com" \
  --validation-method DNS \
  --region ap-south-1
```

This replaces all manual SSL management. Certificates auto-renew.

### 3.2 — Add a second application server

Launch a second t3.xlarge (or t3.large once NestJS migration reduces memory pressure) in a different AZ (`ap-south-1b`).

Both servers run the same code from the same Git repo. Both point to the same RDS and ElastiCache. The ALB distributes traffic between them.

```
app-server-1 (ap-south-1a) ─┐
                              ├─► RDS Multi-AZ (primary: 1a, standby: 1b)
app-server-2 (ap-south-1b) ─┘ └─► ElastiCache Redis
```

**Deployment with two servers:**

GitHub Actions deploys with rolling update — one server at a time:
```bash
# Deploy to server 1, health check, then deploy to server 2
ssh server-1 "cd Mediczy && git pull && pm2 reload mediczy-server"
sleep 15 && curl -f https://app.mediqzy.com/api/health
ssh server-2 "cd Mediczy && git pull && pm2 reload mediczy-server"
```

Zero-downtime during every deploy.

### 3.3 — VPC and Security Groups

Currently the server uses default security groups. For a HIPAA-compliant healthcare platform, network isolation is required.

```
VPC: 10.0.0.0/16
  Public subnets (ALB, NAT Gateway):
    10.0.1.0/24 (ap-south-1a)
    10.0.2.0/24 (ap-south-1b)
  Private subnets (app servers, RDS, Redis):
    10.0.11.0/24 (ap-south-1a)
    10.0.12.0/24 (ap-south-1b)

Security Groups:
  sg-alb:       inbound 443 from 0.0.0.0/0
  sg-app:       inbound 8888/8889 from sg-alb only
                inbound 22 from VPN/bastion IP only
  sg-rds:       inbound 5432 from sg-app only
  sg-redis:     inbound 6379 from sg-app only
  sg-sib:       inbound 8001 from sg-app only
```

App servers move to private subnets. No direct public internet access. All traffic goes through the ALB.

---

## 6. Phase 4 — Cloud-Native (Month 6+, NestJS Aligned)

This phase aligns with the NestJS migration completing. Once Express is largely replaced by NestJS, containerisation becomes practical.

### Container strategy

```
ECR (Elastic Container Registry)
  mediczy-api     ← NestJS app
  mediczy-worker  ← BullMQ worker
  mediczy-sib     ← Python FastAPI (separate)

ECS Fargate (serverless containers, no EC2 to manage)
  mediczy-api:     2 tasks × 1 vCPU / 2 GB  (auto-scales 2→10)
  mediczy-worker:  1 task × 0.5 vCPU / 1 GB
  mediczy-sib:     1 task × 2 vCPU / 8 GB   (GPU Fargate when needed)
```

**Dockerfile for NestJS app:**
```dockerfile
FROM node:22-alpine AS builder
WORKDIR /app
COPY nest/package*.json ./
RUN npm ci --production=false
COPY nest/ .
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
EXPOSE 8889
CMD ["node", "dist/main.js"]
```

**Why this matters for the NestJS migration:** Once NestJS handles all routes, Express can be retired and the container is clean — just the NestJS app with no 226-file Express route tree attached.

### Auto-scaling

```
ECS Service Auto Scaling policy:
  Target CPU utilisation: 60%
  Min tasks: 2
  Max tasks: 10
  Scale-out cooldown: 60s
  Scale-in cooldown: 300s
```

During peak hours the app scales out automatically. At 2 AM it scales back to 2 tasks. No manual intervention.

---

## 7. Cost Estimates

All prices are AWS `ap-south-1` (Mumbai) on-demand. Reserved instances reduce these by 30–40%.

### Current (single t3.xlarge)

| Item | Monthly |
|---|---|
| t3.xlarge (on-demand) | ~$124 |
| 96 GB gp3 storage | ~$8 |
| S3 (app.mediqzy.com) | ~$3 |
| CloudFront | ~$5 |
| **Total** | **~$140/month** |

### Phase 1 target (stabilised single server)

| Item | Monthly |
|---|---|
| t3.xlarge | ~$124 |
| 200 GB gp3 (expanded) | ~$16 |
| t3.medium (staging) | ~$34 |
| S3 + CloudFront | ~$8 |
| **Total** | **~$182/month** |

### Phase 2 target (separated concerns)

| Item | Monthly |
|---|---|
| t3.xlarge (app server) | ~$124 |
| t3.medium (staging) | ~$34 |
| db.t3.large RDS Multi-AZ | ~$150 |
| cache.t3.small ElastiCache | ~$25 |
| c5.xlarge (SIB FastAPI) | ~$135 |
| 200 GB gp3 (app server) | ~$16 |
| S3 + CloudFront | ~$8 |
| **Total** | **~$492/month** |

### Phase 3 target (HA, two app servers + ALB)

| Item | Monthly |
|---|---|
| 2× t3.large app servers | ~$120 |
| t3.medium staging | ~$34 |
| db.t3.large RDS Multi-AZ | ~$150 |
| cache.t3.small ElastiCache | ~$25 |
| c5.xlarge SIB | ~$135 |
| ALB | ~$22 |
| NAT Gateway | ~$35 |
| S3 + CloudFront | ~$8 |
| **Total** | **~$529/month** |

### Phase 4 target (ECS Fargate, NestJS)

| Item | Monthly |
|---|---|
| ECS Fargate (2 tasks avg, 1 vCPU/2GB) | ~$60 |
| ECS Fargate (worker, 0.5 vCPU/1GB) | ~$15 |
| ECS Fargate SIB (2 vCPU/8GB) | ~$120 |
| db.t3.large RDS Multi-AZ | ~$150 |
| cache.t3.small ElastiCache | ~$25 |
| ALB | ~$22 |
| ECR storage | ~$5 |
| S3 + CloudFront | ~$8 |
| **Total** | **~$405/month** |

*Phase 4 is cheaper than Phase 3 because Fargate right-sizes to actual load.*

---

## 8. Secrets Management

### Current state (insecure)

All secrets are in plaintext in `/home/ubuntu/Mediczy/server/.env`. The `.env` file is on the same disk as the application code. If someone gets SSH access, they get all secrets.

### Target: AWS Secrets Manager

```bash
# Store each secret group
aws secretsmanager create-secret \
  --name mediczy/prod/database \
  --secret-string '{"host":"...rds...","password":"...","user":"mediczy_helper"}'

aws secretsmanager create-secret \
  --name mediczy/prod/jwt \
  --secret-string '{"JWT_SECRET":"...","ENCRYPTION_KEY":"..."}'

aws secretsmanager create-secret \
  --name mediczy/prod/razorpay \
  --secret-string '{"RAZORPAY_KEY_ID":"...","RAZORPAY_KEY_SECRET":"..."}'

# etc. for each integration group
```

**In the application** (NestJS), load secrets at startup:

```typescript
// nest/src/app.module.ts
ConfigModule.forRootAsync({
  useFactory: async () => {
    const client = new SecretsManagerClient({ region: 'ap-south-1' });
    const [db, jwt, payments] = await Promise.all([
      client.send(new GetSecretValueCommand({ SecretId: 'mediczy/prod/database' })),
      client.send(new GetSecretValueCommand({ SecretId: 'mediczy/prod/jwt' })),
      client.send(new GetSecretValueCommand({ SecretId: 'mediczy/prod/razorpay' })),
    ]);
    return { ...JSON.parse(db.SecretString), ...JSON.parse(jwt.SecretString), ...JSON.parse(payments.SecretString) };
  }
})
```

**Until NestJS is ready**, use the AWS SSM Parameter Store approach which works with the existing `.env` pattern:

```bash
# Add to startup script
aws ssm get-parameters-by-path \
  --path "/mediczy/prod/" \
  --with-decryption \
  --query 'Parameters[*].[Name,Value]' \
  --output text | \
  awk '{gsub("/mediczy/prod/","",$1); print $1"="$2}' > /tmp/mediczy-env

# Load before PM2 starts
pm2 start ecosystem.config.js --env-file /tmp/mediczy-env
shred -u /tmp/mediczy-env  # destroy after load
```

---

## 9. Backup Strategy

### Current gaps

- Retention: 1 backup only (catastrophic if the one backup is corrupt)
- No restore test (backups are useless if you've never proven they restore)
- .env not backed up separately from DB (losing the encryption key makes backup useless)
- No offsite redundancy (MinIO is on the same server)

### Target backup matrix

| What | How | Where | Retention | Tested |
|---|---|---|---|---|
| PostgreSQL | `pg_dump` nightly | MinIO + S3 `mediczy-backups` | 30 days | Monthly restore drill |
| `.env` (secrets) | Encrypted, separate job | S3 with versioning | 90 days | — |
| ML models (`ai-engine/`) | S3 sync weekly | `mediczy-models` bucket | 3 versions | — |
| Redis | `BGSAVE` nightly | S3 | 7 days | — |

### Fix backup retention immediately

```bash
# Edit the cleanup script
sudo nano /home/ubuntu/backup-auto-cleanup.sh

# Change retention to 30 days
# The script likely has something like:
# mc rm --recursive --older-than 1d mediqzy/mediczy-backups/
# Change to:
# mc rm --recursive --older-than 30d mediqzy/mediczy-backups/
```

### Monthly restore drill

Add to calendar. First Friday of every month:

```bash
#!/bin/bash
# Restore drill — runs against staging DB, not production
LATEST_BACKUP=$(mc ls mediqzy/mediczy-backups/ | sort | tail -1 | awk '{print $NF}')
mc cp mediqzy/mediczy-backups/$LATEST_BACKUP /tmp/restore-test.dump.enc
# Decrypt
openssl enc -aes-256-cbc -d -in /tmp/restore-test.dump.enc -out /tmp/restore-test.dump \
  -pass file:/home/ubuntu/.backup-passphrase
# Restore to staging DB
pg_restore -h <staging-db-host> -U mediczy_helper -d mediczy_staging_restore \
  /tmp/restore-test.dump
# Verify row counts
echo "Users: $(psql -h <staging> -c 'SELECT count(*) FROM users;' -t)"
echo "Doctors: $(psql -h <staging> -c 'SELECT count(*) FROM doctors;' -t)"
```

---

## 10. Monitoring & Alerting

### What's already running

Prometheus + Grafana + AlertManager are operational. Alerts go to `sk@mysmarthealth.in`. Metrics are scraped from:
- Node exporter (port 9100) — system metrics
- Mediczy server (port 8888, `/metrics/internal`) — application metrics
- PM2 exporter (port 9209) — process metrics
- Blackbox exporter — HTTP probes on `app.mediqzy.com`

### What's missing

**Add these alert rules** to `/etc/prometheus/alerts.yml`:

```yaml
# Disk space alerts (not currently alerting)
- alert: DiskSpaceCritical
  expr: (node_filesystem_avail_bytes{mountpoint="/"} / node_filesystem_size_bytes{mountpoint="/"}) < 0.15
  for: 5m
  annotations:
    summary: "Disk space below 15% — {{ $value | humanizePercentage }} free"

- alert: DiskSpaceWarning
  expr: (node_filesystem_avail_bytes{mountpoint="/"} / node_filesystem_size_bytes{mountpoint="/"}) < 0.25
  for: 30m
  annotations:
    summary: "Disk space below 25%"

# Memory pressure
- alert: SwapUsageHigh
  expr: (node_memory_SwapTotal_bytes - node_memory_SwapFree_bytes) / node_memory_SwapTotal_bytes > 0.5
  for: 10m
  annotations:
    summary: "Swap usage > 50% — memory pressure likely"

# Backup failure
- alert: BackupNotRunning
  expr: time() - backup_last_success_timestamp > 90000  # 25 hours
  annotations:
    summary: "Daily backup has not run in 25+ hours"

# SIB FastAPI
- alert: SIBDown
  expr: probe_success{job="blackbox", instance="http://localhost:8001/health"} == 0
  for: 2m
  annotations:
    summary: "SIB FastAPI is down — AI features unavailable"
```

### Add Slack/WhatsApp alerts

AlertManager currently only sends email. Add a WhatsApp webhook for critical alerts:

```yaml
# alertmanager.yml — add receiver
receivers:
  - name: 'critical'
    email_configs:
      - to: 'sk@mysmarthealth.in'
    webhook_configs:
      - url: 'https://app.mediqzy.com/api/whatsapp/alert-webhook'
        send_resolved: true
```

---

## 11. CI/CD Pipeline

### Current state

```yaml
# .github/workflows/deploy-with-checks.yml (current)
push to main → SSH to server → git pull → pm2 restart → curl health check
```

Problems:
- Deploys directly to production (no staging gate)
- `pm2 restart` causes ~2 seconds of downtime (use `pm2 reload` for zero-downtime)
- No test run before deploy
- No rollback on failure

### Target pipeline

```
push to main
    │
    ▼
[GitHub Actions]
    │
    ├─► Run smoke tests on PR environment (future)
    │
    ▼
Deploy to STAGING
    │
    ├─► git pull on staging
    ├─► pm2 reload mediczy-server
    ├─► npm run test:smoke (BASE_URL=https://staging.mediqzy.com)
    │
    ├── FAIL → stop pipeline, notify Slack, production unchanged
    │
    ▼
Deploy to PRODUCTION
    │
    ├─► git pull on production
    ├─► pm2 reload mediczy-server   ← reload, not restart
    ├─► sleep 15
    ├─► curl -f https://app.mediqzy.com/api/health
    │
    └── FAIL → auto-rollback (git reset --hard HEAD~1, pm2 reload)
```

```yaml
# .github/workflows/deploy.yml (target)
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy-staging:
    runs-on: ubuntu-latest
    steps:
      - uses: appleboy/ssh-action@master
        with:
          host: ${{ secrets.STAGING_HOST }}
          username: ubuntu
          key: ${{ secrets.SSH_PRIVATE_KEY }}
          script: |
            cd /home/ubuntu/Mediczy
            git pull origin main
            pm2 reload mediczy-server
            sleep 10
            BASE_URL=https://staging.mediqzy.com bash server/tests/integration/smoke.sh

  deploy-production:
    needs: deploy-staging
    runs-on: ubuntu-latest
    environment: production   # requires manual approval in GitHub (optional gate)
    steps:
      - uses: appleboy/ssh-action@master
        with:
          host: ${{ secrets.SERVER_HOST }}
          username: ubuntu
          key: ${{ secrets.SSH_PRIVATE_KEY }}
          script: |
            cd /home/ubuntu/Mediczy
            PREV_COMMIT=$(git rev-parse HEAD)
            git pull origin main
            pm2 reload mediczy-server
            sleep 15
            if ! curl -sf https://app.mediqzy.com/api/health; then
              echo "Health check failed — rolling back"
              git reset --hard $PREV_COMMIT
              pm2 reload mediczy-server
              exit 1
            fi
            echo "Deploy successful: $(git rev-parse --short HEAD)"
```

---

## 12. Staging Environment

### What staging needs to replicate

| Component | Staging setup |
|---|---|
| Application | Same code, separate t3.medium |
| Database | Separate PostgreSQL (can share RDS, different DB name: `mediczy_staging`) |
| Redis | Separate DB index (Redis DB 1 vs prod DB 0) |
| SIB FastAPI | Shared with prod initially (read-only AI, no patient data written) |
| Secrets | Different JWT_SECRET, test Razorpay keys, test Twilio credentials |
| Domain | staging.mediqzy.com or internal IP |
| CloudFront | Not needed — direct nginx |

### Data in staging

Staging never contains real patient data. Use the monthly restore drill to populate staging with an anonymised snapshot:

```sql
-- Anonymise sensitive columns before loading into staging
UPDATE users SET
  email = 'user_' || id || '@test.local',
  "phoneNumber" = '+91' || LPAD(CAST(id AS TEXT), 10, '0'),
  "firstName" = 'Test',
  "lastName" = 'User' || id;

UPDATE doctors SET
  email = 'doctor_' || id || '@test.local',
  "phoneNumber" = '+91' || LPAD(CAST(id + 1000000 AS TEXT), 10, '0');
```

---

## Progress Tracker

| Task | Priority | Status | Owner |
|---|---|---|---|
| Clean up dev artifacts from disk | P0 | ⬜ Not started | DevOps |
| Fix backup retention to 30 days | P0 | ⬜ Not started | DevOps |
| Install certbot + auto-renew SSL | P0 | ⬜ Not started | DevOps |
| Fix worker restart cause | P0 | ⬜ Not started | Backend |
| Fix `doctorQualifications` Sequelize error | P1 | ⬜ Not started | Backend |
| Expand disk to 200 GB | P1 | ⬜ Not started | DevOps |
| Set up staging server | P1 | ⬜ Not started | DevOps |
| Update CI/CD to deploy staging first | P1 | ⬜ Not started | DevOps |
| Add PM2 cluster mode (2 instances) | P1 | ⬜ Not started | DevOps |
| Add disk + swap alert rules to Prometheus | P1 | ⬜ Not started | DevOps |
| Migrate PostgreSQL to RDS | P2 | ⬜ Not started | DevOps |
| Move SIB to separate instance | P2 | ⬜ Not started | DevOps |
| Move Redis to ElastiCache | P2 | ⬜ Not started | DevOps |
| Add ALB + second app server | P3 | ⬜ Not started | DevOps |
| Set up VPC with private subnets | P3 | ⬜ Not started | DevOps |
| Migrate secrets to AWS Secrets Manager | P3 | ⬜ Not started | DevOps |
| Monthly restore drill (calendar) | P2 | ⬜ Not started | DevOps |
| ECS Fargate containerisation | P4 | ⬜ Not started | DevOps (after NestJS migration) |

**Status legend:** ⬜ Not started · 🔄 In progress · ✅ Complete

---

*This document covers infrastructure only. For the NestJS application migration, see [NESTJS_MIGRATION_PLAN.md](./NESTJS_MIGRATION_PLAN.md).*
