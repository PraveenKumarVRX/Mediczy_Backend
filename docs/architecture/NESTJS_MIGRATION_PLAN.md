# NestJS Migration Plan

**Status:** Not started — planning complete  
**Approach:** Strangler Fig (incremental, zero big-bang risk)  
**Last Updated:** 2026-05-23  
**Author:** Engineering Team

---

## Table of Contents

1. [Why This Migration](#1-why-this-migration)
2. [Current State Snapshot](#2-current-state-snapshot)
3. [Architecture: Before and After](#3-architecture-before-and-after)
4. [The Strangler Fig Approach](#4-the-strangler-fig-approach)
5. [Infrastructure Constants](#5-infrastructure-constants)
6. [Phase 0 — Pre-work](#phase-0--pre-work-week-0)
7. [Phase 1 — Scaffold NestJS](#phase-1--scaffold-nestjs-week-1)
8. [Phase 2 — AI Brain + AI Intelligence](#phase-2--ai-brain--ai-intelligence-weeks-23)
9. [Phase 3 — Clinical Workflow + AI Scribe](#phase-3--clinical-workflow--ai-scribe-weeks-45)
10. [Phase 4 — Payments + Notifications](#phase-4--payments--notifications-week-6)
11. [Phase 5 — Online Consultation](#phase-5--online-consultation-weeks-79)
12. [Phase 6 — Doctor Module](#phase-6--doctor-module-weeks-1013)
13. [Phase 7 — Auth Layer Cut-Over](#phase-7--auth-layer-cut-over-week-14)
14. [Phase 8 — Remaining Modules](#phase-8--remaining-modules-ongoing)
15. [Core Patterns](#9-core-patterns)
16. [Rollback Protocol](#10-rollback-protocol)
17. [What Never Moves](#11-what-never-moves)
18. [Progress Tracker](#12-progress-tracker)

---

## 1. Why This Migration

The backend grew organically from a startup to a healthcare enterprise platform without a structural framework. The result is technically correct but increasingly difficult to maintain at scale.

### Problems the current Express codebase has

| Problem | Evidence |
|---|---|
| No structural enforcement | `app.js` is 1,512 lines with 315 `app.use()` calls. New routes are appended with no module boundary. |
| Untestable services | 151 services are direct singletons. Unit testing any controller requires a live DB and live SIB sidecar. |
| Access control drift | Ring-fencing (`ringFencing.js`, 1,115 lines) maintains hardcoded path→role string arrays. A path added without updating the array causes silent ACCESS_DENIED. This happened during the May 2026 audit — `/api/online-consultation` was missing from doctor's allowed paths. |
| Route monolith | `doctor.route.js` is 4,214 lines mixing HTTP routing, business logic, DB queries, and notification dispatch. |
| Runtime-only errors | `require()` in an ES module context crashed `GET /api/doctors/services` silently for weeks. TypeScript catches this at compile time. |
| No request validation contract | Request body validation is a mix of `express-validator`, `zod`, manual `if (!field)` checks, and nothing. Breaking API changes are invisible until a mobile app crashes. |
| No generated documentation | 200+ routes with no auto-generated OpenAPI docs. |

### What NestJS fixes

- **Module system** enforces feature boundaries at compile time
- **Dependency Injection** makes every service mockable — unit tests become possible
- **Guards co-located with routes** — access control rule is next to the route it protects, cannot drift
- **DTOs with class-validator** enforce request shape at the API boundary, breaking changes caught immediately
- **TypeScript** catches `require()` in ES module, undefined property access, wrong argument types at build time
- **Swagger auto-generation** from DTOs — zero maintenance documentation

---

## 2. Current State Snapshot

```
server/                    Express 4.21.2, Node 22, ES Modules ("type": "module")
  app.js                   1,512 lines — 315 route registrations, 286 imports
  routes/                  200 files + 17 subdirectories
  services/                151 files — singletons, no DI
  controller/              25 files  — HTTP layer (controller/)
  controllers/             6 files   — startup orchestration (controllers/)
  middleware/              38 files  — auth, ring-fencing, audit, tenancy, AI guard
  models/postgres/         73 Sequelize models
  db/
    intelligent-db-adapter.js  2,613 lines — proxy to Python ML DB service at :5005
    orchestrator.js            331 lines  — PostgreSQL + DuckDB + Redis routing
  tests/integration/       smoke.sh — 44-endpoint regression suite
```

**Running processes (PM2):**

| Process | Port | Technology |
|---|---|---|
| `mediczy-server` | 8888 | Express (this repo) |
| `sib` | 8001 | Python FastAPI — all LLM inference |
| `mediczy-worker` | — | BullMQ workers |
| `livekit-server` | — | LiveKit video |

**Nginx routes everything at `/api/` → port 8888.**

---

## 3. Architecture: Before and After

### Before (current)

```
Client → nginx :80 → Express :8888 → 200 route files
                                    → 151 service singletons
                                    → PostgreSQL (Sequelize + raw pg)
                                    → SIB FastAPI :8001 (Python LLM)
                                    → Redis (cache, BullMQ)
```

### After (target, end of migration)

```
Client → nginx :80 → /api/v3/*          → NestJS :8889
                   → /api/ai/scribe/*   → NestJS :8889
                   → /api/doctor/*      → NestJS :8889
                   → /api/consultation/ → NestJS :8889
                   → /api/payments/     → NestJS :8889
                   → /api/* (legacy)    → Express :8888 (shrinking)

Both apps → same PostgreSQL (shared)
NestJS    → SIB FastAPI :8001 (same Python sidecar, unchanged)
NestJS    → Redis (same instance)
```

Express is decommissioned path by path. It is never switched off in a single step. The migration can pause at any phase and the product continues working normally.

---

## 4. The Strangler Fig Approach

The strangler fig is a tree that grows around an existing tree. The host tree keeps living while the strangler gradually replaces it. When the host is fully replaced, it is removed.

Applied here:

1. NestJS starts on port 8889, shares the same database
2. Nginx routes specific URL prefixes to NestJS while Express handles everything else
3. After each phase: run regression tests, update nginx, remove the routes from Express
4. Express is retired when all routes are migrated

**There is never a big-bang cutover.** Every phase is independently releasable. Every phase is independently rollback-able.

---

## 5. Infrastructure Constants

These values are fixed for the entire migration. Do not change them between phases.

```
Express port:      8888  (unchanged throughout)
NestJS port:       8889  (new)
NestJS location:   /home/ubuntu/Mediczy/nest/
JWT_SECRET:        same env var, same value (tokens work on both apps)
Token payload:     { id, doctorId|userId, email, role, userType }
Database:          same PostgreSQL instance, same credentials
SIB sidecar:       http://localhost:8001 (Python, untouched)
Smoke test:        server/tests/integration/smoke.sh
PM2 name:          mediczy-nest
```

---

## Phase 0 — Pre-work (Week 0)

**Goal:** Regression baseline in place. No code written yet.

### Tasks

**0.1 — Commit the smoke test**

File: `server/tests/integration/smoke.sh`

The 44-endpoint integration test suite from the May 2026 audit. Add to `package.json`:
```json
"test:smoke": "BASE_URL=http://localhost:8888 bash tests/integration/smoke.sh"
```

Run on every PR. Run against port 8889 before every nginx switch.

**0.2 — Freeze `app.js`**

Add to line 1 of `server/app.js`:
```javascript
// FREEZE: No new app.use() calls. All new routes go to nest/ instead.
```

From this point, every new feature is built in NestJS, not Express.

**0.3 — Fix the two-controller-directory confusion**

`server/controller/` — HTTP layer (request/response shaping, calls services)  
`server/controllers/` — startup orchestration only (InitializationController, ServerController, ShutdownController)

Document this in `server/controller/README.md`. No new files go into `controllers/`.

### Exit criteria

- `npm run test:smoke` passes at 100%
- CI runs smoke test on every push

---

## Phase 1 — Scaffold NestJS (Week 1)

**Goal:** NestJS running at port 8889 with auth infrastructure. Nothing routed to it yet.

### Directory structure to create

```
nest/
  src/
    main.ts
    app.module.ts
    common/
      guards/
        jwt-auth.guard.ts
        roles.guard.ts
      strategies/
        jwt.strategy.ts
      interceptors/
        audit.interceptor.ts
      decorators/
        public.decorator.ts        @Public() — skips JwtAuthGuard
        roles.decorator.ts         @Roles('doctor', 'user')
        current-user.decorator.ts  @CurrentUser() — injects req.user
  tsconfig.json
  package.json
```

### Install commands

```bash
cd /home/ubuntu/Mediczy && mkdir nest && cd nest
npm install @nestjs/core @nestjs/common @nestjs/platform-express \
  @nestjs/jwt @nestjs/passport @nestjs/config @nestjs/typeorm \
  @nestjs/swagger @nestjs/throttler
npm install passport passport-jwt typeorm pg \
  class-validator class-transformer reflect-metadata rxjs
npm install -D typescript @types/node @types/passport-jwt \
  ts-node ts-node-dev
```

### Key design decisions baked into the scaffold

**`JwtAuthGuard` is global** — registered as `APP_GUARD` in `AppModule`. Every route is protected by default. Opt-out with `@Public()`. This is the inverse of Express where every route is public by default and you manually add `authUser`.

**`RolesGuard` is global** — registered as `APP_GUARD` after `JwtAuthGuard`. Checks `req.user.role` against `@Roles()` decorator. If a route has no `@Roles()` decorator, any authenticated user can access it.

**`AuditInterceptor` is global** — registered as `APP_INTERCEPTOR`. Writes HIPAA audit log on every request, fire-and-forget (non-blocking), same audit_logs table as Express.

**`TypeOrmModule` — `synchronize: false`** — Never true. Express/Sequelize owns all migrations. NestJS/TypeORM reads the schema it finds; it never alters it.

**`tsconfig.json` — `strict: false`, `noImplicitAny: false`** — Intentional. Services wrapped from Express JS have no types. Tighten per module after migration, not upfront.

### Add to PM2 ecosystem

In `ecosystem.config.js`, add after the `mediczy-server` block:

```javascript
{
  name: 'mediczy-nest',
  script: 'nest/dist/main.js',
  cwd: '/home/ubuntu/Mediczy',
  instances: 1,
  exec_mode: 'fork',
  node_args: '--max-old-space-size=512',
  env: { ...process.env, NODE_ENV: 'production', PORT: 8889 },
  error_file: path.join(LOGS_DIR, 'nest-error.log'),
  out_file: path.join(LOGS_DIR, 'nest-out.log'),
  max_memory_restart: '800M',
  watch: false,
  max_restarts: 10,
  min_uptime: '10s',
}
```

### Nginx — no change yet

NestJS is on 8889. Nothing is routed to it. Test directly with `curl http://localhost:8889/api/health`.

### Exit criteria

- `pm2 status` shows `mediczy-nest` online
- `curl http://localhost:8889/api/health` returns a response (even 404 — server is up)
- `npm run test:smoke` still passes against port 8888

---

## Phase 2 — AI Brain + AI Intelligence (Weeks 2–3)

**Goal:** `/api/v3/` routes migrate to NestJS. First nginx switch.

**Why first:** These are the cleanest bounded contexts. Already versioned under `/api/v3/`. No dependencies on billing, appointment, or doctor state. Route files are small (601 and 485 lines). Low risk.

### Modules to create

```
nest/src/
  ai-brain/
    ai-brain.module.ts
    ai-brain.controller.ts      @Controller('v3/ai-brain') @Roles('user','doctor','admin','team')
    ai-brain.service.ts         wraps server/services/ai-brain/orchestrator.js
    dto/
      think.dto.ts              { message: string (max 5000), conversationId?: string }
  ai-intelligence/
    ai-intelligence.module.ts
    ai-intelligence.controller.ts   @Controller('v3/ai-intelligence')
    drug-interactions/
      drug-interactions.service.ts  wraps server/services/ai-drug-interaction.service.js
      dto/check.dto.ts              { medications: string[] }  ← array, not object
    triage/
      triage.service.ts             wraps server/services/ai-emergency-triage.service.js
      dto/triage.dto.ts             { symptoms: string, age?: number, gender?: string }
    risk-score/
      risk-score.service.ts
```

### The service wrapping pattern (use everywhere)

```typescript
// nest/src/ai-intelligence/drug-interactions/drug-interactions.service.ts
import { Injectable } from '@nestjs/common';

// Import the existing JS service. Do not rewrite it.
// NestJS DI makes it injectable and mockable in tests.
const drugInteractionChecker = require('../../../../server/services/ai-drug-interaction.service.js');

@Injectable()
export class DrugInteractionsService {
  async check(medications: string[], patientId?: string) {
    return drugInteractionChecker.default.checkInteractions({
      medications, patientId: patientId || null, useLLM: true
    });
  }

  quickCheck(medications: string[]) {
    return drugInteractionChecker.default.quickCheck(medications);
  }
}
```

This is the pattern for every service in Phases 2–6. Wrap, don't rewrite.

### Nginx switch (after all v3 tests pass on port 8889)

Add **above** the existing `/api/` block in `/etc/nginx/sites-enabled/mediczy`:

```nginx
location /api/v3/ {
    proxy_pass http://localhost:8889;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_connect_timeout 60s;
    proxy_send_timeout 120s;
    proxy_read_timeout 120s;
}
```

```bash
nginx -t && systemctl reload nginx
npm run test:smoke   # must still pass
```

### Remove from Express after switch confirmed

In `server/app.js`, remove:
```javascript
app.use('/api/v3/ai-brain', sibAIGuard, attachAIReporter);
app.use('/api/v3/ai-intelligence', sibAIGuard, attachAIReporter);
app.use('/api/v3/ai-brain', authUser, aiBrainRouter);
app.use('/api/v3/ai-intelligence', authUser, aiIntelligenceRouter);
```

### Exit criteria

- All v3 endpoints pass smoke test on port 8889
- nginx routing confirmed with production smoke test
- Routes removed from `app.js`
- `pm2 reload mediczy-server` completes cleanly

---

## Phase 3 — Clinical Workflow + AI Scribe (Weeks 4–5)

**Goal:** Doctor-facing AI writing tools in NestJS.

### Modules to create

```
nest/src/
  clinical/
    clinical.module.ts
    notes/
      notes.controller.ts   @Controller('doctor/clinical-workflow') @Roles('doctor')
      notes.service.ts      wraps ClinicalNote Sequelize model
      dto/
        create-note.dto.ts  { patientId: number (integer FK, not string), subjective, objective, assessment, plan }
    terminology/
      terminology.controller.ts
      terminology.service.ts  wraps server/services/medical-terminology.service.js + cims.service.js
  ai-scribe/
    ai-scribe.module.ts
    scribe.controller.ts    @Controller('ai/scribe') @Roles('doctor')
    scribe.service.ts       wraps server/services/medicalAI.service.js
    dto/
      generate-prescription.dto.ts  { consultationNotes: string, patientId, patientName, patientAge }
```

### SSE endpoint handling

`POST /api/ai/scribe/generate-prescription` has an SSE streaming mode (`stream: true`). NestJS handles it with `@Res()` passthrough — the existing SSE logic in the service runs unchanged:

```typescript
@Post('generate-prescription')
async generatePrescription(@Body() dto: GeneratePrescriptionDto, @CurrentUser() user: any,
                           @Req() req: any, @Res() res: any) {
  if (dto.stream) {
    return this.scribeService.generateWithStream(dto, user, req, res); // existing SSE logic
  }
  return res.json(await this.scribeService.generate(dto, user));
}
```

### Nginx additions

```nginx
location /api/ai/scribe/ {
    proxy_pass http://localhost:8889;
    proxy_read_timeout 300s;
    proxy_buffering off;       # required for SSE
}

location /api/doctor/clinical-workflow/ {
    proxy_pass http://localhost:8889;
}
```

---

## Phase 4 — Payments + Notifications (Week 6)

**Goal:** Type-safe payment boundary. Smallest route file (72 lines) — low risk, high safety impact.

### `PaymentsModule` DTO design

The DTO permanently closes the amount-unit ambiguity (paise vs INR) that existed in the Express version:

```typescript
// nest/src/payments/dto/create-order.dto.ts
export class CreateOrderDto {
  @IsNumber() @Min(1)
  amount: number;       // always INR at API boundary — controller multiplies by 100 before Razorpay

  @IsString()
  currency: string;
}
```

The controller is the single place that converts `amount → amount * 100` before calling the Razorpay SDK. No other layer touches the conversion.

### Webhook stays unauthenticated

```typescript
@Post('webhook')
@Public()              // explicitly documented — not an oversight
async handleWebhook(@Req() req: Request, @Res() res: Response) {
  return this.paymentsService.handleWebhook(req, res); // HMAC validated inside service
}
```

### Nginx additions

```nginx
location /api/payments/ {
    proxy_pass http://localhost:8889;
}
```

---

## Phase 5 — Online Consultation (Weeks 7–9)

**Goal:** Largest single Express file (2,125 lines, mounted at `/api/consultation`) migrated as a multi-controller NestJS module.

### Sub-controllers

The 2,125-line file decomposes into six controllers, all in one NestJS module:

| Controller | Routes | Auth |
|---|---|---|
| `ConsultationDiscoveryController` | `GET /doctors`, `GET /doctors/:id`, `GET /doctors/:id/slots` | `@Public()` |
| `ConsultationBookingController` | `POST /book`, `GET /my-appointments` | `@Roles('user')` |
| `ConsultationDoctorController` | `GET /doctor/requests`, `POST /doctor/accept/:id`, `POST /doctor/reject/:id`, `GET /doctor/appointments` | `@Roles('doctor')` |
| `ConsultationPaymentController` | `POST /payment/initiate/:id`, `POST /payment/verify/:id`, `POST /payment/manual/:id` | `@Roles('user', 'doctor')` |
| `ConsultationVideoController` | `GET /video/join/:id`, `POST /video/end/:id` | `@Roles('user', 'doctor')` |
| `ConsultationChatController` | `GET /chat/conversations`, `GET /chat/:id/messages`, `POST /chat/:id/messages` | `@Roles('user', 'doctor')` |

This phase also permanently fixes the `authUser`/`authDoctor` dual-middleware pattern. The same consultation route no longer needs to check `req.userRole === 'doctor'` at runtime — the NestJS `@Roles()` decorator on `ConsultationDoctorController` handles it at the framework level.

### Nginx

```nginx
location /api/consultation/ {
    proxy_pass http://localhost:8889;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";   # required for video/chat WebSocket
}
```

---

## Phase 6 — Doctor Module (Weeks 10–13)

**Goal:** Decompose `doctor.route.js` (4,214 lines) into focused sub-modules.

### Step 1 — Decompose in Express first (Week 10)

Split `doctor.route.js` into 8 files **while still in Express**. Do not change any logic. Run `npm run test:smoke` after each file is moved. Commit each one independently.

| New file | Approximate lines | Routes covered |
|---|---|---|
| `doctor-profile.route.js` | ~400 | Profile, update, avatar, ID card |
| `doctor-analytics.route.js` | ~500 | Dashboard stats, analytics, earnings |
| `doctor-patients.route.js` | ~400 | My patients, create patient, patient history |
| `doctor-alerts.route.js` | ~300 | Alerts, notifications, push tokens |
| `doctor-templates.route.js` | ~300 | Prescription templates, CRUD |
| `doctor-settings.route.js` | ~300 | Settings, availability preferences |
| `doctor-services.route.js` | ~200 | Services list, add service, update service |
| `doctor-appointments.route.js` | ~600 | Appointment list, notes, consultation |

After Week 10: `doctor.route.js` is deleted. 8 focused files in its place. Express still runs everything. Tests green.

### Step 2 — Migrate one sub-module per 2–3 days (Weeks 11–13)

Order (lowest risk first):

1. `DoctorAnalyticsModule` — read-only, no side effects
2. `DoctorSettingsModule` — GET/PUT only
3. `DoctorAlertsModule` — read-heavy
4. `DoctorServicesModule` — small, the endpoint that had the `require()` crash
5. `DoctorTemplatesModule`
6. `DoctorPatientsModule`
7. `DoctorProfileModule`
8. `DoctorAppointmentsModule` — merge into `ConsultationModule`

Same flow for each: build NestJS module → test on 8889 → nginx switch → remove from Express → full smoke test.

---

## Phase 7 — Auth Layer Cut-Over (Week 14)

**Goal:** All remaining role types in NestJS JwtStrategy. Ring-fencing in Express now only protects Express routes.

### Port remaining role types to `JwtStrategy.validate()`

The current `validate()` returns `{ id, email, role, doctorId }`. Extend it to cover all 10 role types by reading the token payload fields each login route signs:

| Role | Token `role` field | Additional payload fields |
|---|---|---|
| user | `'user'` | `userId` |
| doctor | `'doctor'` | `doctorId` |
| hospital | `'hospital'` | `hospitalId` |
| clinic | `'clinic'` | `clinicId` |
| lab | `'lab'` | `labId` |
| pharmacy | `'pharmacy'` | `pharmacyId` |
| admin | `'admin'` | `isAdmin: true` |
| team | `'team'` | `isTeam: true` |
| nurse | `'nurse'` | `nurseId` |
| broker/TPA | `'broker'` or `'tpa'` | `brokerId` |

### Add rate limiting

Replace Express `express-rate-limit` for NestJS routes with `@nestjs/throttler`:

```typescript
ThrottlerModule.forRoot([
  { name: 'global', ttl: 900000, limit: 300 },
  { name: 'ai',     ttl: 60000,  limit: 20  },
  { name: 'auth',   ttl: 900000, limit: 10  },
]),
```

### Enable Swagger

```typescript
// nest/src/main.ts
const config = new DocumentBuilder()
  .setTitle('Mediczy API v2')
  .setDescription('NestJS API — auto-generated from route DTOs')
  .setVersion('2.0')
  .addBearerAuth()
  .build();
SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config));
```

Documentation at `https://app.mediqzy.com/api/docs` — auto-updates as DTOs change.

---

## Phase 8 — Remaining Modules (Ongoing)

After Phase 7, the high-traffic paths are in NestJS. What remains in Express:

| Module | Route files | Priority |
|---|---|---|
| Billing | `billing.route.js` (1,669 lines) | High — migrate after consultation payments proven |
| CRM | `crm.route.js`, `crmCampaigns`, `crmEmail`, `crm-ai` | Medium |
| Hospital/Clinic/Lab/Pharmacy | Entity management routes | Medium |
| Communications | WhatsApp (4 files), SMS, email | Low — stable, rarely changes |
| FHIR / HyperGrid IoT | `fhir.route.js`, `hypergrid-*.route.js` | Low — specialized |
| Admin | `admin.route.js`, `admin.route.production.js` | Low — low traffic |
| API v1 (mobile legacy) | `api-v1-*.js` | Keep in Express indefinitely until mobile v2 ships |

---

## 9. Core Patterns

Every developer on this migration follows these patterns. Deviating from them creates inconsistency.

### Pattern 1 — Wrap, don't rewrite

Existing JS services are battle-tested. Wrap them as NestJS `@Injectable()` providers. Do not rewrite the service logic during migration. Rewrite later, independently, with tests.

```typescript
@Injectable()
export class MyService {
  // Import existing JS service
  private readonly legacyService = require('../../../server/services/my.service.js').default;

  async doThing(params: any) {
    return this.legacyService.doThing(params);
  }
}
```

### Pattern 2 — Access control on the route, not in a file

Express ring-fencing uses a central file with path arrays. NestJS access control is on the decorator:

```typescript
// This replaces adding a path to ringFencing.js
@Get('appointments')
@Roles('doctor', 'hospital_staff')
getDoctorAppointments(@CurrentUser() user: any) { ... }
```

If a developer adds a route and forgets `@Roles()`, any authenticated user can call it. This is a deliberate secure-default choice — it is better than silently allowing unauthenticated access, and it is visible in code review.

### Pattern 3 — Public routes are explicitly declared

```typescript
@Get('health')
@Public()   // explicitly marks no-auth required — visible, not implicit
getHealth() { return { status: 'ok' }; }
```

This replaces the bypass logic in Express ring-fencing that handles public paths.

### Pattern 4 — DTOs enforce the API contract

Every POST/PUT body has a DTO. Every DTO uses `class-validator` decorators. If the field is wrong type, missing, or out of range, the `ValidationPipe` rejects it with a 400 before it reaches the controller. No manual `if (!field)` checks.

```typescript
export class CreateOrderDto {
  @IsNumber()
  @Min(1)
  amount: number;    // INR, always

  @IsString()
  @IsIn(['INR'])
  currency: string;
}
```

### Pattern 5 — One nginx block per phase, added above the catch-all

```nginx
# Phase 2 — added above /api/
location /api/v3/ { proxy_pass http://localhost:8889; }

# Phase 3 — added above /api/
location /api/ai/scribe/ { proxy_pass http://localhost:8889; }
location /api/doctor/clinical-workflow/ { proxy_pass http://localhost:8889; }

# catch-all — stays until Express is fully decommissioned
location /api/ { proxy_pass http://localhost:8888; }
```

Nginx matches the most specific location first. Express is the catch-all. Routes are migrated one prefix at a time.

### Pattern 6 — The gate before every nginx switch

```bash
# 1. Build NestJS
cd /home/ubuntu/Mediczy/nest && npm run build

# 2. Test the new routes on port 8889 BEFORE nginx change
BASE_URL=http://localhost:8889 bash server/tests/integration/smoke.sh

# 3. Only if step 2 passes — switch nginx
cp /etc/nginx/sites-enabled/mediczy /etc/nginx/sites-enabled/mediczy.bak.$(date +%Y%m%d-%H%M)
# edit nginx config
nginx -t && systemctl reload nginx

# 4. Run full smoke test against production
npm run test:smoke

# 5. Only if step 4 passes — remove routes from app.js and reload Express
pm2 reload mediczy-server
npm run test:smoke  # once more
```

If step 2 fails, do not proceed to step 3. Debug in NestJS. Express still handles all production traffic.

---

## 10. Rollback Protocol

Before every nginx change:

```bash
cp /etc/nginx/sites-enabled/mediczy /etc/nginx/sites-enabled/mediczy.bak.$(date +%Y%m%d-%H%M)
```

If anything breaks after the switch:

```bash
# Identify the last backup
ls -lt /etc/nginx/sites-enabled/mediczy.bak.* | head -3

# Restore it
cp /etc/nginx/sites-enabled/mediczy.bak.YYYYMMDD-HHMM /etc/nginx/sites-enabled/mediczy
systemctl reload nginx
```

Express is always running. Rollback is always instant and does not require a code deploy.

The routes removed from `app.js` should not be committed until the nginx switch has been live for 48 hours without issues. Keep them commented out, not deleted, during that window.

---

## 11. What Never Moves

These components stay where they are for the entire migration and beyond.

**SIB FastAPI sidecar** (`sib` process, port 8001)  
All LLM inference runs in Python. NestJS calls it via HTTP the same way Express does. The Python service, `ai-engine/`, and `intelligent-db-adapter.js` are not touched.

**BullMQ workers** (`mediczy-worker` process)  
The worker process runs independently. NestJS can enqueue jobs using `@nestjs/bullmq` but the worker handlers do not need to move to NestJS.

**LiveKit video server** (`livekit-server` process)  
External binary. Unchanged.

**PostgreSQL schema ownership**  
Express/Sequelize owns all migrations. TypeORM in NestJS has `synchronize: false` permanently. NestJS reads the schema; it never alters it.

**API v1 mobile routes** (`api-v1-*.js`)  
Stay in Express until the mobile app ships a v2 that no longer depends on them.

---

## 12. Progress Tracker

Update this table as phases complete.

| Phase | Scope | Status | Nginx blocks added | Express routes removed |
|---|---|---|---|---|
| Pre-work | Smoke test, app.js freeze | ⬜ Not started | — | — |
| Phase 1 | NestJS scaffold (port 8889) | ⬜ Not started | None yet | None |
| Phase 2 | `/api/v3/ai-brain`, `/api/v3/ai-intelligence` | ⬜ Not started | `/api/v3/` | `aiBrainRouter`, `aiIntelligenceRouter` |
| Phase 3 | `/api/ai/scribe/`, `/api/doctor/clinical-workflow/` | ⬜ Not started | 2 blocks | `aiScribeRouter`, `clinicalWorkflowRouter` |
| Phase 4 | `/api/payments/`, `/api/notifications/` | ⬜ Not started | 2 blocks | `paymentRouter`, `notificationRouter` |
| Phase 5 | `/api/consultation/` | ⬜ Not started | 1 block | `onlineConsultationRouter` |
| Phase 6 | `/api/doctors/`, `/api/doctor/` | ⬜ Not started | 2 blocks | `doctorRouter` (all 8 sub-files) |
| Phase 7 | Auth cut-over, Swagger, rate limiting | ⬜ Not started | — | — |
| Phase 8 | Billing, CRM, hospital/clinic/lab | ⬜ Not started | Multiple | Multiple |

**Status legend:** ⬜ Not started · 🔄 In progress · ✅ Complete · ⏸ Paused

---

## Appendix A — Key File Reference

| File | Lines | Role | Migration phase |
|---|---|---|---|
| `server/app.js` | 1,512 | Express entry — 315 route registrations | Shrinks each phase |
| `server/middleware/ringFencing.js` | 1,115 | Path→role access control | Replaced by `RolesGuard` per phase |
| `server/middleware/auth.middleware.js` | 599 | JWT validation, 10 role types | Replaced by `JwtStrategy` in Phase 7 |
| `server/routes/doctor.route.js` | 4,214 | Doctor routes — monolith | Phase 6 (decompose first) |
| `server/routes/online-consultation.route.js` | 2,125 | Consultation flow | Phase 5 |
| `server/db/intelligent-db-adapter.js` | 2,613 | Python DB proxy | Never moves |
| `server/routes/ai-brain.route.js` | 601 | AI Brain v3 | Phase 2 |
| `server/routes/ai-intelligence.route.js` | 485 | AI Intelligence v3 | Phase 2 |
| `server/routes/ai-scribe.route.js` | 794 | AI Scribe | Phase 3 |
| `server/routes/clinical-workflow.route.js` | 335 | SOAP notes, ICD-10/SNOMED/CPT | Phase 3 |
| `server/routes/payment.route.js` | 72 | Razorpay payments | Phase 4 |

## Appendix B — Bugs Fixed During Audit (May 2026)

These bugs were discovered during the functional audit that preceded this plan. They are documented here as examples of the class of problems NestJS structurally prevents.

| Bug | Root cause | NestJS prevention |
|---|---|---|
| `GET /api/doctors/services` → 500 | `require()` called in ES module context inside a debug middleware left in `app.js` | TypeScript catches `require()` in ESM at compile time |
| `POST /api/ai/process-command` → TypeError | `userContext.availableRoutes` accessed without null-checking `userContext` | DTO with `@IsOptional()` + default value prevents undefined access |
| Doctor → ACCESS_DENIED on `/api/online-consultation/*` | `/api/online-consultation` missing from doctor's `allowedPaths` array in `ringFencing.js` | `@Roles('doctor')` on `ConsultationDoctorController` — access rule co-located with route |
| `POST /api/doctor/clinical-workflow/notes` → "Failed to create clinical note" | `patientId` passed as string `"test"` — FK constraint violation | DTO `@IsInt()` rejects non-integer before reaching DB |

---

*This document is the authoritative reference for the NestJS migration. Update the Progress Tracker as phases complete. Update Appendix B if additional bugs are discovered that relate to structural issues the migration will fix.*
