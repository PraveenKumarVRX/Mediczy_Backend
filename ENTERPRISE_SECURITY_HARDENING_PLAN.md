# 🔒 Enterprise Security Hardening Plan - Mediczy

## Comprehensive Security, Process & Stability Improvements

**Date:** February 1, 2026  
**Status:** Implementation Roadmap  
**Priority:** CRITICAL - Immediate Action Required

---

## 🚨 CRITICAL VULNERABILITIES (Immediate - 24-48 Hours)

### 1. **Secrets Exposed in Repository**

**Risk:** Complete service/account compromise  
**Impact:** Unauthorized access to Firebase, databases, APIs, user data  
**Evidence:**

- `firebase-service-account.json` (Firebase Admin SDK private key)
- `firebase-service-account-ios.json` (iOS Firebase credentials)
- `setup-clinic-system.cjs` (lines 14-23) - Database credentials
- `verify_healthcare_data.py` (lines 15-20) - API keys
- `google_places_verify.py` (lines 13-21) - Google API keys
- `import_polyclinics.py` (lines 11-13) - Database credentials
- `admin-auth-test.html` (lines 134-156) - Test credentials
- `quick-admin-login.html` (lines 95-121) - Admin credentials
- JWT token in filename: `InR5cCI6IkpXVCJ9...`

#### **Immediate Actions:**

**Step 1: Rotate ALL Exposed Credentials (0-24 hours)**

```bash
# 1. Firebase
- Revoke service account keys in Firebase Console
- Generate new service accounts with least-privilege IAM roles
- Store in environment variables only

# 2. Database
- Rotate PostgreSQL master password
- Create new read-only and application-specific users
- Update connection strings in environment

# 3. API Keys
- Regenerate Google Places API key with IP restrictions
- Rotate Razorpay/payment gateway keys
- Update Twilio/SMS provider credentials
- Regenerate JWT secret keys

# 4. Admin Credentials
- Force password reset for all admin accounts
- Enable MFA for all admin users
- Audit recent admin access logs
```

**Step 2: Remove Secrets from Git History (24-48 hours)**

```bash
# Use BFG Repo-Cleaner or git-filter-repo
git filter-repo --path firebase-service-account.json --invert-paths
git filter-repo --path firebase-service-account-ios.json --invert-paths

# Force push to clean history (COORDINATE WITH TEAM)
git push origin --force --all
git push origin --force --tags

# Notify all team members to re-clone the repository
```

**Step 3: Implement Secrets Management (48 hours)**

```javascript
// server/config/secrets.js
import { SecretManagerServiceClient } from "@google-cloud/secret-manager";

class SecretsManager {
  constructor() {
    this.client = new SecretManagerServiceClient();
    this.cache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
  }

  async getSecret(secretName) {
    // Check cache first
    const cached = this.cache.get(secretName);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.value;
    }

    // Fetch from Secret Manager
    const name = `projects/${process.env.GCP_PROJECT_ID}/secrets/${secretName}/versions/latest`;
    const [version] = await this.client.accessSecretVersion({ name });
    const secretValue = version.payload.data.toString("utf8");

    // Cache the secret
    this.cache.set(secretName, {
      value: secretValue,
      timestamp: Date.now(),
    });

    return secretValue;
  }

  async getFirebaseCredentials() {
    const credentials = await this.getSecret("firebase-service-account");
    return JSON.parse(credentials);
  }

  async getDatabasePassword() {
    return await this.getSecret("postgres-master-password");
  }
}

export default new SecretsManager();
```

**Step 4: Environment Variables Template**

```bash
# .env.template (commit this to repo)
# NEVER commit actual .env file

# Database
DATABASE_URL=postgresql://user:password@host:port/database
DB_HOST=
DB_PORT=5432
DB_NAME=
DB_USER=
DB_PASSWORD=

# Firebase (use secret manager)
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY_SECRET_NAME=firebase-private-key

# JWT
JWT_SECRET_KEY_SECRET_NAME=jwt-secret-key
JWT_REFRESH_SECRET_SECRET_NAME=jwt-refresh-secret

# API Keys (use secret manager)
GOOGLE_PLACES_API_KEY_SECRET_NAME=google-places-api-key
RAZORPAY_KEY_ID_SECRET_NAME=razorpay-key-id
RAZORPAY_KEY_SECRET_SECRET_NAME=razorpay-key-secret
TWILIO_ACCOUNT_SID_SECRET_NAME=twilio-account-sid
TWILIO_AUTH_TOKEN_SECRET_NAME=twilio-auth-token

# Redis
REDIS_URL=redis://localhost:6379
REDIS_PASSWORD_SECRET_NAME=redis-password

# Kafka
KAFKA_BROKERS=localhost:9092
KAFKA_SASL_USERNAME_SECRET_NAME=kafka-username
KAFKA_SASL_PASSWORD_SECRET_NAME=kafka-password
```

**Step 5: CI/CD Secret Scanning**

```yaml
# .github/workflows/security-scan.yml
name: Security Scan

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  secret-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
        with:
          fetch-depth: 0 # Full history for secret scanning

      - name: TruffleHog Secret Scan
        uses: trufflesecurity/trufflehog@main
        with:
          path: ./
          base: ${{ github.event.repository.default_branch }}
          head: HEAD
          extra_args: --debug --only-verified

      - name: GitLeaks Secret Scan
        uses: gitleaks/gitleaks-action@v2
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - name: Fail on secrets found
        run: exit 1
        if: steps.trufflehog.outputs.found == 'true' || steps.gitleaks.outputs.found == 'true'
```

---

### 2. **Public Stats Endpoint Exposing PII**

**Risk:** User data scraping, GDPR/HIPAA violation, DB load attack  
**Impact:** Privacy breach, regulatory fines, service degradation  
**Evidence:** `admin-stats.route.js` (lines 6-50), `app.js` (line 761)

#### **Immediate Fix:**

```javascript
// server/routes/admin-stats.route.js
import express from "express";
import { authenticateToken } from "../middlewares/auth.middleware.js";
import { checkRole } from "../middlewares/role.middleware.js";
import { rateLimiterMiddleware } from "../middlewares/rateLimiter.middleware.js";
import { redactPII } from "../utils/pii-redaction.util.js";

const router = express.Router();

// BEFORE: Public endpoint without auth
// router.get('/stats', async (req, res) => { ... });

// AFTER: Protected endpoint with auth, role check, and rate limiting
router.get(
  "/stats",
  rateLimiterMiddleware({
    points: 10, // 10 requests
    duration: 60, // per 60 seconds
    keyPrefix: "stats",
  }),
  authenticateToken, // JWT verification
  checkRole(["admin", "superadmin"]), // Only admins
  async (req, res) => {
    try {
      const stats = await getSystemStats();

      // Remove PII from response
      const sanitizedStats = {
        totalUsers: stats.totalUsers,
        totalDoctors: stats.totalDoctors,
        totalAppointments: stats.totalAppointments,
        revenue: stats.revenue,
        appointmentsByStatus: stats.appointmentsByStatus,
        // REMOVED: recentUsers (contains names, emails)
        // REMOVED: recentAppointments (contains patient names)
        systemHealth: stats.systemHealth,
        cacheHitRate: stats.cacheHitRate,
      };

      // Audit log
      logger.info("Admin stats accessed", {
        adminId: req.user.id,
        adminEmail: req.user.email,
        timestamp: new Date(),
        ip: req.ip,
      });

      res.json(sanitizedStats);
    } catch (error) {
      logger.error("Stats endpoint error:", error);
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  },
);

export default router;
```

```javascript
// server/app.js
// Move stats route INSIDE protected routes section (after authentication middleware)

// BEFORE (line 761):
// app.use('/api/admin', adminStatsRouter); // Outside rate limiter

// AFTER:
// Place after line 458 (inside authenticated routes)
app.use(
  "/api/admin",
  authenticateToken,
  rateLimiterMiddleware({ points: 100, duration: 60 }),
  adminStatsRouter,
);
```

---

### 3. **Socket.IO Authentication Bypass**

**Risk:** User impersonation, unauthorized data access, event manipulation  
**Impact:** Complete user account takeover, privacy breach  
**Evidence:** `socket.service.js` (lines 40-66)

#### **Immediate Fix:**

```javascript
// server/services/socket.service.js
import jwt from "jsonwebtoken";
import { logger } from "../config/logger.js";
import secrets from "../config/secrets.js";

class SocketService {
  constructor() {
    this.io = null;
    this.userSockets = new Map();
  }

  initialize(server) {
    this.io = require("socket.io")(server, {
      cors: {
        origin: process.env.FRONTEND_URL,
        credentials: true,
      },
    });

    // BEFORE: No JWT verification
    // this.io.on('connection', (socket) => {
    //   socket.on('authenticate', ({ userId, organizationId }) => {
    //     this.userSockets.set(userId, socket.id);
    //   });
    // });

    // AFTER: Enforce JWT verification
    this.io.use(async (socket, next) => {
      try {
        const token =
          socket.handshake.auth.token ||
          socket.handshake.headers.authorization?.replace("Bearer ", "");

        if (!token) {
          return next(new Error("Authentication token required"));
        }

        // Verify JWT
        const jwtSecret = await secrets.getSecret("jwt-secret-key");
        const decoded = jwt.verify(token, jwtSecret);

        // Attach verified user to socket
        socket.userId = decoded.id;
        socket.userType = decoded.userType;
        socket.organizationId = decoded.organization_id;
        socket.email = decoded.email;

        logger.info("Socket authenticated", {
          userId: socket.userId,
          userType: socket.userType,
          socketId: socket.id,
        });

        next();
      } catch (error) {
        logger.error("Socket authentication failed:", error);
        next(new Error("Invalid authentication token"));
      }
    });

    this.io.on("connection", (socket) => {
      // User is already authenticated via middleware
      const { userId, userType, organizationId } = socket;

      // Store socket mapping
      this.userSockets.set(userId, socket.id);

      // Join user to their personal room
      socket.join(`user:${userId}`);
      socket.join(`org:${organizationId}`);

      logger.info("Socket connected", {
        userId,
        userType,
        organizationId,
        socketId: socket.id,
      });

      // Handle disconnection
      socket.on("disconnect", () => {
        this.userSockets.delete(userId);
        logger.info("Socket disconnected", { userId, socketId: socket.id });
      });

      // All event handlers now have verified userId/organizationId
      this.setupEventHandlers(socket);
    });
  }

  setupEventHandlers(socket) {
    // Example: Only allow users to subscribe to their own notifications
    socket.on("subscribe:notifications", () => {
      // socket.userId is already verified by JWT
      socket.join(`notifications:${socket.userId}`);
      logger.info("User subscribed to notifications", {
        userId: socket.userId,
      });
    });

    // Example: Verify organization access
    socket.on("subscribe:org-updates", ({ orgId }) => {
      // Verify user belongs to this organization
      if (socket.organizationId !== orgId) {
        socket.emit("error", { message: "Unauthorized organization access" });
        logger.warn("Unauthorized org subscription attempt", {
          userId: socket.userId,
          requestedOrgId: orgId,
          actualOrgId: socket.organizationId,
        });
        return;
      }
      socket.join(`org:${orgId}:updates`);
    });
  }

  // Emit to specific user (now with verification)
  emitToUser(userId, event, data) {
    const socketId = this.userSockets.get(userId);
    if (socketId) {
      this.io.to(`user:${userId}`).emit(event, data);
    }
  }

  // Emit to organization (with audit trail)
  emitToOrganization(organizationId, event, data) {
    logger.info("Emitting to organization", {
      organizationId,
      event,
      recipientCount:
        this.io.sockets.adapter.rooms.get(`org:${organizationId}`)?.size || 0,
    });
    this.io.to(`org:${organizationId}`).emit(event, data);
  }
}

export default new SocketService();
```

**Client-side Update:**

```javascript
// client/src/services/socket.service.ts
import io from 'socket.io-client';
import { getAuthToken } from './auth.service';

class SocketService {
  private socket: Socket | null = null;

  connect() {
    const token = getAuthToken();

    if (!token) {
      console.error('No auth token available for socket connection');
      return;
    }

    this.socket = io(process.env.REACT_APP_BACKEND_URL, {
      auth: {
        token: token  // Send JWT with connection
      },
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5
    });

    this.socket.on('connect', () => {
      console.log('Socket connected');
    });

    this.socket.on('connect_error', (error) => {
      console.error('Socket connection error:', error.message);
      // Re-authenticate if token expired
      if (error.message.includes('authentication')) {
        this.reconnectWithNewToken();
      }
    });
  }

  private async reconnectWithNewToken() {
    // Refresh token logic
    const newToken = await refreshAuthToken();
    this.socket?.auth = { token: newToken };
    this.socket?.connect();
  }
}
```

---

### 4. **SQL Injection in Domain Resolver**

**Risk:** Database compromise, tenant data breach, privilege escalation  
**Impact:** Complete database takeover, cross-tenant data access  
**Evidence:** `domainResolver.middleware.js` (lines 293-297)

#### **Immediate Fix:**

```javascript
// server/middlewares/domainResolver.middleware.js

// BEFORE: Vulnerable to SQL injection
// await sequelize.query(`SET search_path TO ${context.dbName}, public`);

// AFTER: Parameterized query with validation
class DomainResolver {
  async setSearchPath(dbName, sequelize) {
    // 1. Validate dbName format (alphanumeric + underscore only)
    if (!/^[a-zA-Z0-9_]+$/.test(dbName)) {
      logger.error("Invalid database name format", { dbName });
      throw new Error("Invalid tenant database name");
    }

    // 2. Verify dbName exists in allowed tenants list
    const allowedTenants = await this.getAllowedTenants();
    if (!allowedTenants.includes(dbName)) {
      logger.error("Database name not in allowed tenants", { dbName });
      throw new Error("Unauthorized tenant database");
    }

    // 3. Use parameterized query with identifier quoting
    const quotedDbName = sequelize.getQueryInterface().quoteIdentifier(dbName);
    await sequelize.query(`SET search_path TO ${quotedDbName}, public`, {
      type: sequelize.QueryTypes.RAW,
      logging: (sql) => logger.debug("Search path set", { sql, dbName }),
    });

    logger.info("Search path set successfully", { dbName });
  }

  async getAllowedTenants() {
    // Cache allowed tenants for performance
    if (this.tenantCache && Date.now() - this.tenantCacheTime < 60000) {
      return this.tenantCache;
    }

    // Fetch from tenants table
    const tenants = await Tenant.findAll({
      attributes: ["db_name"],
      where: { status: "active" },
    });

    this.tenantCache = tenants.map((t) => t.db_name);
    this.tenantCacheTime = Date.now();

    return this.tenantCache;
  }

  async resolveDomain(req, res, next) {
    try {
      const domain = req.get("host");

      // Look up tenant by domain
      const tenant = await Tenant.findOne({
        where: { domain: domain },
        attributes: ["id", "db_name", "status", "settings"],
      });

      if (!tenant) {
        logger.warn("Unknown domain access attempt", { domain, ip: req.ip });
        return res.status(404).json({ error: "Tenant not found" });
      }

      if (tenant.status !== "active") {
        logger.warn("Inactive tenant access attempt", {
          domain,
          tenantId: tenant.id,
        });
        return res.status(403).json({ error: "Tenant account suspended" });
      }

      // Set search path with validation
      await this.setSearchPath(tenant.db_name, req.sequelize);

      // Attach tenant context to request
      req.tenant = {
        id: tenant.id,
        dbName: tenant.db_name,
        settings: tenant.settings,
      };

      next();
    } catch (error) {
      logger.error("Domain resolution error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
}

export default new DomainResolver();
```

**Additional Protection:**

```javascript
// server/config/database.js
// Use least-privilege database users

const tenantUser = {
  username: process.env.DB_TENANT_USER, // Limited to tenant schemas only
  password: await secrets.getDatabasePassword("tenant-user"),
  privileges: [
    "SELECT",
    "INSERT",
    "UPDATE",
    "DELETE", // No CREATE, DROP, ALTER
  ],
};

const adminUser = {
  username: process.env.DB_ADMIN_USER, // Full privileges, used only for migrations
  password: await secrets.getDatabasePassword("admin-user"),
  privileges: ["ALL"],
};
```

---

## 🔴 HIGH PRIORITY (Week 1)

### 5. **Excessive Sensitive Data Logging**

**Risk:** PII leakage, log injection, performance degradation  
**Impact:** GDPR/HIPAA violation, disk space exhaustion

#### **Solution: PII Redaction Utility**

```javascript
// server/utils/pii-redaction.util.js
const PII_PATTERNS = {
  email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
  phone: /\b\d{10}\b|\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g,
  ssn: /\b\d{3}-\d{2}-\d{4}\b/g,
  creditCard: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
  jwt: /eyJ[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+/=]*/g,
};

const SENSITIVE_FIELDS = [
  "password",
  "token",
  "secret",
  "apiKey",
  "privateKey",
  "ssn",
  "creditCard",
  "cvv",
  "pin",
  "otp",
];

export function redactPII(data) {
  if (typeof data === "string") {
    let redacted = data;
    Object.entries(PII_PATTERNS).forEach(([type, pattern]) => {
      redacted = redacted.replace(pattern, `[REDACTED_${type.toUpperCase()}]`);
    });
    return redacted;
  }

  if (typeof data === "object" && data !== null) {
    const redacted = Array.isArray(data) ? [] : {};

    for (const [key, value] of Object.entries(data)) {
      // Redact sensitive field names
      if (SENSITIVE_FIELDS.some((field) => key.toLowerCase().includes(field))) {
        redacted[key] = "[REDACTED]";
      } else if (typeof value === "string") {
        redacted[key] = redactPII(value);
      } else if (typeof value === "object") {
        redacted[key] = redactPII(value);
      } else {
        redacted[key] = value;
      }
    }

    return redacted;
  }

  return data;
}

export function createSafeLogger(logger) {
  return {
    info: (message, data) => logger.info(message, redactPII(data)),
    warn: (message, data) => logger.warn(message, redactPII(data)),
    error: (message, data) => logger.error(message, redactPII(data)),
    debug: (message, data) => {
      if (process.env.NODE_ENV === "development") {
        logger.debug(message, redactPII(data));
      }
    },
  };
}
```

**Update Excessive Logging:**

```javascript
// server/app.js
import { createSafeLogger, redactPII } from "./utils/pii-redaction.util.js";
const safeLogger = createSafeLogger(logger);

// BEFORE (lines 187-191): Logs full session data
// console.log('Session initialized:', req.session);

// AFTER: Structured logging with PII redaction
if (process.env.NODE_ENV === "development") {
  safeLogger.debug("Session initialized", {
    sessionId: req.sessionID,
    userId: req.session?.userId,
    authenticated: !!req.session?.userId,
    // Removed: Full session data dump
  });
}

// BEFORE (lines 458-468): Logs every authenticated request
// console.log('Authenticated user:', req.user.id, req.user.email);

// AFTER: Conditional logging with sampling
const shouldLog = Math.random() < 0.01; // 1% sampling rate
if (shouldLog || req.path.includes("/admin/")) {
  safeLogger.info("Authenticated request", {
    userId: req.user.id,
    userType: req.user.userType,
    path: req.path,
    method: req.method,
    // Email redacted in production
  });
}
```

**Log Rotation Configuration:**

```javascript
// server/config/logger.js
import winston from "winston";
import DailyRotateFile from "winston-daily-rotate-file";

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json(),
  ),
  transports: [
    new DailyRotateFile({
      filename: "logs/application-%DATE%.log",
      datePattern: "YYYY-MM-DD",
      maxSize: "100m", // Max 100MB per file
      maxFiles: "30d", // Keep 30 days
      zippedArchive: true, // Compress old logs
    }),
    new DailyRotateFile({
      filename: "logs/error-%DATE%.log",
      datePattern: "YYYY-MM-DD",
      level: "error",
      maxSize: "100m",
      maxFiles: "90d", // Keep errors longer
      zippedArchive: true,
    }),
  ],
});

// Don't log to console in production
if (process.env.NODE_ENV !== "production") {
  logger.add(
    new winston.transports.Console({
      format: winston.format.simple(),
    }),
  );
}

export { logger };
```

---

### 6. **Unhandled Promise Rejection Handling**

**Risk:** Process crash, inconsistent state, data corruption  
**Impact:** Service downtime, memory leaks

#### **Solution: Proper Error Handling**

```javascript
// server/app.js

// BEFORE (lines 182-185): Only logs and continues
// process.on('unhandledRejection', (reason, promise) => {
//   console.error('Unhandled Rejection at:', promise, 'reason:', reason);
// });

// AFTER: Graceful shutdown on critical errors
process.on("unhandledRejection", async (reason, promise) => {
  logger.error("Unhandled Promise Rejection", {
    reason: redactPII(reason),
    promise: promise,
    stack: reason?.stack,
  });

  // Alert monitoring system
  await sendCriticalAlert("Unhandled Promise Rejection", {
    reason: reason?.message,
    service: "mediczy-server",
    environment: process.env.NODE_ENV,
  });

  // Graceful shutdown for critical errors
  if (isCriticalError(reason)) {
    logger.error("Critical error detected, initiating graceful shutdown");
    await gracefulShutdown();
  }
});

process.on("uncaughtException", async (error) => {
  logger.error("Uncaught Exception", {
    error: redactPII(error),
    stack: error.stack,
  });

  await sendCriticalAlert("Uncaught Exception", {
    error: error.message,
    service: "mediczy-server",
  });

  // Always exit on uncaught exceptions
  await gracefulShutdown();
});

function isCriticalError(error) {
  const criticalPatterns = [
    "ECONNREFUSED", // DB connection lost
    "ENOTFOUND", // DNS failure
    "Out of memory",
    "ERR_IPC_CHANNEL_CLOSED",
    "FATAL ERROR",
  ];

  return criticalPatterns.some(
    (pattern) =>
      error?.message?.includes(pattern) || error?.code?.includes(pattern),
  );
}

async function gracefulShutdown() {
  logger.info("Starting graceful shutdown...");

  const shutdownTimeout = setTimeout(() => {
    logger.error("Graceful shutdown timeout, forcing exit");
    process.exit(1);
  }, 30000); // 30 second timeout

  try {
    // Stop accepting new requests
    if (server) {
      await new Promise((resolve) => {
        server.close(() => {
          logger.info("HTTP server closed");
          resolve();
        });
      });
    }

    // Close database connections
    if (sequelize) {
      await sequelize.close();
      logger.info("Database connections closed");
    }

    // Close Redis
    if (redisClient) {
      await redisClient.quit();
      logger.info("Redis connection closed");
    }

    // Close Kafka
    if (kafkaProducer) {
      await kafkaProducer.disconnect();
      logger.info("Kafka producer disconnected");
    }

    clearTimeout(shutdownTimeout);
    logger.info("Graceful shutdown complete");
    process.exit(0);
  } catch (error) {
    logger.error("Error during graceful shutdown:", error);
    process.exit(1);
  }
}

// Handle SIGTERM from container orchestration
process.on("SIGTERM", async () => {
  logger.info("SIGTERM received");
  await gracefulShutdown();
});

process.on("SIGINT", async () => {
  logger.info("SIGINT received");
  await gracefulShutdown();
});
```

---

## 🟡 MEDIUM PRIORITY (Week 2-3)

### 7. **Authentication & Authorization Hardening**

#### **Implement MFA for Admin Users**

```javascript
// server/middlewares/mfa.middleware.js
import speakeasy from "speakeasy";
import QRCode from "qrcode";

export async function requireMFA(req, res, next) {
  const user = req.user;

  // Skip MFA for non-admin users (optional)
  if (!["admin", "superadmin"].includes(user.role)) {
    return next();
  }

  // Check if MFA is verified for this session
  if (req.session.mfaVerified) {
    return next();
  }

  // Require MFA token
  const mfaToken = req.headers["x-mfa-token"];
  if (!mfaToken) {
    return res.status(403).json({
      error: "MFA token required",
      requireMFA: true,
    });
  }

  // Verify MFA token
  const verified = speakeasy.totp.verify({
    secret: user.mfaSecret,
    encoding: "base32",
    token: mfaToken,
    window: 2, // Allow 2 time steps (60 seconds)
  });

  if (!verified) {
    logger.warn("MFA verification failed", {
      userId: user.id,
      ip: req.ip,
    });
    return res.status(403).json({ error: "Invalid MFA token" });
  }

  // Mark session as MFA verified
  req.session.mfaVerified = true;
  logger.info("MFA verified", { userId: user.id });

  next();
}

// Setup MFA for user
export async function setupMFA(req, res) {
  const user = req.user;

  const secret = speakeasy.generateSecret({
    name: `Mediczy (${user.email})`,
    issuer: "Mediczy",
  });

  // Store secret in database (encrypted)
  await User.update(
    { mfaSecret: secret.base32, mfaEnabled: true },
    { where: { id: user.id } },
  );

  // Generate QR code
  const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url);

  res.json({
    secret: secret.base32,
    qrCode: qrCodeUrl,
  });
}
```

#### **Implement Session Security**

```javascript
// server/config/session.js
import session from "express-session";
import RedisStore from "connect-redis";
import crypto from "crypto";

export const sessionConfig = {
  store: new RedisStore({ client: redisClient }),
  secret: process.env.SESSION_SECRET,
  name: "mediczy.sid", // Custom name (hide framework)
  resave: false,
  saveUninitialized: false,
  rolling: true, // Refresh session on each request
  cookie: {
    secure: process.env.NODE_ENV === "production", // HTTPS only
    httpOnly: true, // Prevent XSS
    sameSite: "strict", // CSRF protection
    maxAge: 30 * 60 * 1000, // 30 minutes
    domain: process.env.COOKIE_DOMAIN,
    path: "/",
  },
  genid: (req) => {
    // Generate cryptographically secure session IDs
    return crypto.randomBytes(32).toString("hex");
  },
};

// Session fingerprinting to detect hijacking
export function sessionFingerprint(req, res, next) {
  const fingerprint = crypto
    .createHash("sha256")
    .update(req.headers["user-agent"] || "")
    .update(req.ip || "")
    .digest("hex");

  if (req.session.fingerprint && req.session.fingerprint !== fingerprint) {
    logger.warn("Session fingerprint mismatch - possible hijacking", {
      userId: req.session.userId,
      sessionId: req.sessionID,
      ip: req.ip,
    });

    // Destroy session
    req.session.destroy();
    return res.status(401).json({ error: "Session invalid" });
  }

  req.session.fingerprint = fingerprint;
  next();
}
```

---

### 8. **File Upload Security**

```javascript
// server/middlewares/file-security.middleware.js
import multer from "multer";
import crypto from "crypto";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

const ALLOWED_MIME_TYPES = {
  image: ["image/jpeg", "image/png", "image/webp"],
  document: [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ],
  medical: ["application/dicom", "image/jpeg", "image/png"],
};

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

// Multer configuration with security
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Isolate uploads by user and date
    const uploadPath = path.join(
      process.env.UPLOAD_DIR,
      req.user.organization_id.toString(),
      new Date().toISOString().split("T")[0],
    );
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    // Generate secure random filename
    const uniqueName = crypto.randomBytes(16).toString("hex");
    const ext = path.extname(file.originalname);
    cb(null, `${uniqueName}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = ALLOWED_MIME_TYPES[req.fileCategory] || [];

  if (!allowedTypes.includes(file.mimetype)) {
    return cb(new Error(`Invalid file type: ${file.mimetype}`));
  }

  cb(null, true);
};

export const upload = multer({
  storage: storage,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 5, // Max 5 files per upload
  },
  fileFilter: fileFilter,
});

// Virus scanning with ClamAV
export async function scanFile(filePath) {
  try {
    const { stdout } = await execAsync(`clamscan --no-summary ${filePath}`);

    if (stdout.includes("FOUND")) {
      logger.error("Virus detected in uploaded file", { filePath });
      await fs.unlink(filePath); // Delete infected file
      throw new Error("File contains malware");
    }

    logger.info("File scan clean", { filePath });
    return true;
  } catch (error) {
    logger.error("File scan error:", error);
    throw error;
  }
}

// Content-type verification (magic bytes)
export async function verifyFileType(filePath, expectedMimeType) {
  const fileType = await import("file-type");
  const type = await fileType.fromFile(filePath);

  if (!type || type.mime !== expectedMimeType) {
    logger.warn("File MIME type mismatch", {
      expected: expectedMimeType,
      actual: type?.mime,
      filePath,
    });
    throw new Error("File type mismatch");
  }

  return true;
}

// Secure file upload handler
export async function secureUpload(req, res, next) {
  try {
    upload.array("files")(req, res, async (err) => {
      if (err) {
        logger.error("File upload error:", err);
        return res.status(400).json({ error: err.message });
      }

      // Scan and verify each file
      for (const file of req.files) {
        await scanFile(file.path);
        await verifyFileType(file.path, file.mimetype);
      }

      next();
    });
  } catch (error) {
    logger.error("Secure upload error:", error);
    res.status(500).json({ error: "File upload failed" });
  }
}
```

---

### 9. **Rate Limiting Enhancements**

```javascript
// server/middlewares/advanced-rate-limiter.middleware.js
import { RateLimiterRedis, RateLimiterMemory } from "rate-limiter-flexible";
import { redisClient } from "../config/redis.js";

class AdvancedRateLimiter {
  constructor() {
    this.limiters = {};
    this.initializeLimiters();
  }

  initializeLimiters() {
    // Different limits for different endpoint types
    this.limiters.auth = new RateLimiterRedis({
      storeClient: redisClient,
      keyPrefix: "rl:auth",
      points: 5, // 5 attempts
      duration: 15 * 60, // per 15 minutes
      blockDuration: 60 * 60, // Block for 1 hour after
    });

    this.limiters.api = new RateLimiterRedis({
      storeClient: redisClient,
      keyPrefix: "rl:api",
      points: 100, // 100 requests
      duration: 60, // per minute
    });

    this.limiters.fileUpload = new RateLimiterRedis({
      storeClient: redisClient,
      keyPrefix: "rl:upload",
      points: 10, // 10 uploads
      duration: 60 * 60, // per hour
    });

    this.limiters.payment = new RateLimiterRedis({
      storeClient: redisClient,
      keyPrefix: "rl:payment",
      points: 3, // 3 payment attempts
      duration: 60, // per minute
    });

    // Fallback in-memory limiter if Redis fails
    this.fallbackLimiter = new RateLimiterMemory({
      points: 50,
      duration: 60,
    });
  }

  async limit(type, req, res, next) {
    const limiter = this.limiters[type] || this.limiters.api;

    // Use IP + userId for authenticated requests
    const key = req.user ? `${req.ip}:${req.user.id}` : req.ip;

    try {
      await limiter.consume(key);
      next();
    } catch (rateLimitError) {
      if (rateLimitError instanceof Error) {
        // Redis error - use fallback
        logger.warn("Rate limiter Redis error, using fallback", {
          error: rateLimitError,
        });
        try {
          await this.fallbackLimiter.consume(req.ip);
          next();
        } catch {
          this.sendRateLimitResponse(res);
        }
      } else {
        // Rate limit exceeded
        logger.warn("Rate limit exceeded", {
          type,
          key,
          ip: req.ip,
          userId: req.user?.id,
          path: req.path,
        });

        this.sendRateLimitResponse(res, rateLimitError);
      }
    }
  }

  sendRateLimitResponse(res, rateLimitError) {
    const retryAfter = rateLimitError?.msBeforeNext
      ? Math.ceil(rateLimitError.msBeforeNext / 1000)
      : 60;

    res.set("Retry-After", retryAfter);
    res.status(429).json({
      error: "Too many requests",
      retryAfter: retryAfter,
    });
  }

  // Middleware factories
  auth() {
    return (req, res, next) => this.limit("auth", req, res, next);
  }

  api() {
    return (req, res, next) => this.limit("api", req, res, next);
  }

  fileUpload() {
    return (req, res, next) => this.limit("fileUpload", req, res, next);
  }

  payment() {
    return (req, res, next) => this.limit("payment", req, res, next);
  }
}

export default new AdvancedRateLimiter();
```

---

## 🟢 STRATEGIC IMPROVEMENTS (Week 4+)

### 10. **Zero-Downtime Deployment Pipeline**

```yaml
# .github/workflows/production-deploy.yml
name: Production Deployment

on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  security-checks:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Secret Scanning
        uses: trufflesecurity/trufflehog@main

      - name: SAST (Static Analysis)
        uses: github/codeql-action/analyze@v2

      - name: Dependency Scanning
        run: npm audit --audit-level=high

      - name: License Compliance
        run: npx license-checker --failOn 'GPL;AGPL'

  tests:
    needs: security-checks
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Unit Tests
        run: npm test

      - name: Integration Tests
        run: npm run test:integration

      - name: API Contract Tests
        run: npm run test:contract

      - name: E2E Tests
        run: npm run test:e2e

  database-migration:
    needs: tests
    runs-on: ubuntu-latest
    steps:
      - name: Run Migrations (Dry Run)
        run: npm run migrate:dry-run

      - name: Validate Schema
        run: npm run db:validate

      - name: Backup Database
        run: |
          pg_dump $DATABASE_URL > backup-$(date +%Y%m%d-%H%M%S).sql
          aws s3 cp backup-*.sql s3://mediczy-db-backups/

  deploy-canary:
    needs: database-migration
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to 10% traffic
        run: |
          pm2 deploy ecosystem.config.js production --canary 10

      - name: Health Check
        run: |
          sleep 60
          curl -f https://app.mediqzy.com/health || exit 1

      - name: Monitor Error Rate
        run: npm run monitor:errors -- --threshold 0.5 --duration 300

  deploy-production:
    needs: deploy-canary
    runs-on: ubuntu-latest
    steps:
      - name: Run Database Migrations
        run: npm run migrate:up

      - name: Deploy to 50% traffic
        run: pm2 deploy ecosystem.config.js production --canary 50

      - name: Monitor
        run: sleep 120 && npm run monitor:errors -- --threshold 0.5

      - name: Deploy to 100% traffic
        run: pm2 deploy ecosystem.config.js production

      - name: Smoke Tests
        run: npm run test:smoke

      - name: Notify Success
        run: |
          curl -X POST $SLACK_WEBHOOK_URL \
            -d '{"text": "✅ Production deployment successful"}'

  rollback:
    if: failure()
    needs: [deploy-canary, deploy-production]
    runs-on: ubuntu-latest
    steps:
      - name: Automatic Rollback
        run: |
          pm2 deploy ecosystem.config.js production revert 1
          npm run migrate:down

      - name: Notify Failure
        run: |
          curl -X POST $SLACK_WEBHOOK_URL \
            -d '{"text": "❌ Deployment failed - rolled back"}'
```

---

### 11. **Observability & Monitoring**

```javascript
// server/monitoring/metrics.js
import prometheus from "prom-client";

// Create metrics registry
const register = new prometheus.Registry();

// Default metrics (CPU, memory, etc.)
prometheus.collectDefaultMetrics({ register });

// Custom business metrics
export const metrics = {
  httpRequestDuration: new prometheus.Histogram({
    name: "http_request_duration_seconds",
    help: "Duration of HTTP requests in seconds",
    labelNames: ["method", "route", "status_code"],
    buckets: [0.1, 0.3, 0.5, 0.7, 1, 3, 5, 7, 10],
  }),

  httpRequestTotal: new prometheus.Counter({
    name: "http_requests_total",
    help: "Total number of HTTP requests",
    labelNames: ["method", "route", "status_code"],
  }),

  activeUsers: new prometheus.Gauge({
    name: "active_users_total",
    help: "Number of currently active users",
  }),

  appointmentCreated: new prometheus.Counter({
    name: "appointments_created_total",
    help: "Total appointments created",
    labelNames: ["consultation_type", "status"],
  }),

  paymentSuccess: new prometheus.Counter({
    name: "payments_success_total",
    help: "Total successful payments",
    labelNames: ["method", "amount_range"],
  }),

  kafkaEventPublished: new prometheus.Counter({
    name: "kafka_events_published_total",
    help: "Total Kafka events published",
    labelNames: ["topic", "event_type"],
  }),

  dbQueryDuration: new prometheus.Histogram({
    name: "db_query_duration_seconds",
    help: "Database query duration",
    labelNames: ["operation", "table"],
    buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 3],
  }),

  cacheHitRate: new prometheus.Gauge({
    name: "cache_hit_rate",
    help: "Redis cache hit rate percentage",
  }),

  errorRate: new prometheus.Counter({
    name: "errors_total",
    help: "Total number of errors",
    labelNames: ["type", "severity"],
  }),
};

// Register all metrics
Object.values(metrics).forEach((metric) => register.registerMetric(metric));

// Metrics endpoint
export function setupMetricsEndpoint(app) {
  app.get("/metrics", async (req, res) => {
    res.set("Content-Type", register.contentType);
    res.end(await register.metrics());
  });
}

// Request tracking middleware
export function metricsMiddleware(req, res, next) {
  const start = Date.now();

  res.on("finish", () => {
    const duration = (Date.now() - start) / 1000;

    metrics.httpRequestDuration.observe(
      {
        method: req.method,
        route: req.route?.path || req.path,
        status_code: res.statusCode,
      },
      duration,
    );

    metrics.httpRequestTotal.inc({
      method: req.method,
      route: req.route?.path || req.path,
      status_code: res.statusCode,
    });
  });

  next();
}
```

**Prometheus Configuration:**

```yaml
# prometheus.yml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

alerting:
  alertmanagers:
    - static_configs:
        - targets: ["localhost:9093"]

rule_files:
  - "alerts.yml"

scrape_configs:
  - job_name: "mediczy-server"
    static_configs:
      - targets: ["localhost:3000"]
    metrics_path: "/metrics"
```

**Alerts Configuration:**

```yaml
# alerts.yml
groups:
  - name: mediczy_alerts
    interval: 30s
    rules:
      - alert: HighErrorRate
        expr: rate(errors_total[5m]) > 0.05
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "High error rate detected"
          description: "Error rate is {{ $value }} errors/sec"

      - alert: HighResponseTime
        expr: histogram_quantile(0.95, http_request_duration_seconds) > 3
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High response time"
          description: "95th percentile response time is {{ $value }}s"

      - alert: DatabaseConnectionFailure
        expr: up{job="postgres"} == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Database connection lost"

      - alert: LowCacheHitRate
        expr: cache_hit_rate < 70
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "Cache hit rate below 70%"
```

---

### 12. **Database Migration Strategy**

```javascript
// server/migrations/migration-framework.js
import { Umzug, SequelizeStorage } from "umzug";
import { sequelize } from "../config/database.js";
import { logger } from "../config/logger.js";

class MigrationManager {
  constructor() {
    this.umzug = new Umzug({
      migrations: {
        glob: "migrations/*.js",
        resolve: ({ name, path, context }) => {
          const migration = require(path);
          return {
            name,
            up: async () => migration.up(context, Sequelize),
            down: async () => migration.down(context, Sequelize),
          };
        },
      },
      context: sequelize.getQueryInterface(),
      storage: new SequelizeStorage({ sequelize }),
      logger: logger,
    });
  }

  async validateMigration(migration) {
    // 1. Dry run validation
    logger.info("Validating migration:", migration.name);

    // 2. Check for destructive operations
    const migrationContent = fs.readFileSync(migration.path, "utf8");
    const destructivePatterns = ["DROP TABLE", "DROP COLUMN", "TRUNCATE"];

    const hasDestructive = destructivePatterns.some((pattern) =>
      migrationContent.includes(pattern),
    );

    if (hasDestructive) {
      logger.warn("Migration contains destructive operations", {
        migration: migration.name,
        requiresBackup: true,
      });

      // Require explicit approval for destructive migrations
      if (!process.env.ALLOW_DESTRUCTIVE_MIGRATIONS) {
        throw new Error("Destructive migration requires explicit approval");
      }
    }

    // 3. Estimate migration time (for large tables)
    const affectedTables = this.parseAffectedTables(migrationContent);
    for (const table of affectedTables) {
      const rowCount = await this.getTableRowCount(table);
      if (rowCount > 1000000) {
        logger.warn("Migration affects large table", {
          table,
          rowCount,
          estimatedTime: `${Math.ceil(rowCount / 10000)}s`,
        });
      }
    }

    return true;
  }

  async runMigrations() {
    try {
      // 1. Get pending migrations
      const pending = await this.umzug.pending();

      if (pending.length === 0) {
        logger.info("No pending migrations");
        return;
      }

      logger.info(`Found ${pending.length} pending migrations`);

      // 2. Validate each migration
      for (const migration of pending) {
        await this.validateMigration(migration);
      }

      // 3. Create database backup
      logger.info("Creating database backup before migrations");
      await this.createBackup();

      // 4. Run migrations in transaction
      await sequelize.transaction(async (transaction) => {
        for (const migration of pending) {
          logger.info("Running migration:", migration.name);
          const startTime = Date.now();

          await this.umzug.up({ migrations: [migration.name], transaction });

          const duration = Date.now() - startTime;
          logger.info("Migration completed", {
            name: migration.name,
            duration: `${duration}ms`,
          });
        }
      });

      logger.info("All migrations completed successfully");
    } catch (error) {
      logger.error("Migration failed:", error);

      // Alert ops team
      await this.sendMigrationAlert("Migration Failed", {
        error: error.message,
        stack: error.stack,
      });

      throw error;
    }
  }

  async createBackup() {
    const timestamp = new Date().toISOString().replace(/:/g, "-");
    const backupFile = `backup-${timestamp}.sql`;

    await exec(`pg_dump ${process.env.DATABASE_URL} > ${backupFile}`);

    // Upload to S3
    await this.uploadBackupToS3(backupFile);

    logger.info("Database backup created", { file: backupFile });
  }

  async rollback(steps = 1) {
    logger.warn(`Rolling back ${steps} migration(s)`);

    await this.umzug.down({ step: steps });

    logger.info("Rollback completed");
  }
}

export default new MigrationManager();
```

**Migration Template:**

```javascript
// migrations/20260201000000-add-mfa-to-users.js
"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Forward-only: Add new columns
    await queryInterface.addColumn("users", "mfa_secret", {
      type: Sequelize.STRING,
      allowNull: true,
      comment: "Encrypted MFA secret for TOTP",
    });

    await queryInterface.addColumn("users", "mfa_enabled", {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });

    await queryInterface.addColumn("users", "mfa_backup_codes", {
      type: Sequelize.JSONB,
      allowNull: true,
      comment: "Encrypted MFA backup codes",
    });

    // Add index for performance
    await queryInterface.addIndex("users", ["mfa_enabled"], {
      name: "idx_users_mfa_enabled",
    });
  },

  down: async (queryInterface, Sequelize) => {
    // Rollback: Remove columns
    await queryInterface.removeIndex("users", "idx_users_mfa_enabled");
    await queryInterface.removeColumn("users", "mfa_backup_codes");
    await queryInterface.removeColumn("users", "mfa_enabled");
    await queryInterface.removeColumn("users", "mfa_secret");
  },
};
```

---

## 📊 IMPLEMENTATION ROADMAP

### **Phase 1: Critical Security (Week 1)**

- [ ] Day 1-2: Rotate all exposed credentials
- [ ] Day 2-3: Remove secrets from git history
- [ ] Day 3-4: Implement secrets management (Google Secret Manager/Vault)
- [ ] Day 4-5: Fix Socket.IO authentication
- [ ] Day 5-6: Secure admin stats endpoint
- [ ] Day 6-7: Fix SQL injection in domain resolver

### **Phase 2: High Priority (Week 2)**

- [ ] Implement PII redaction in logging
- [ ] Add unhandled rejection handling
- [ ] Deploy MFA for admin users
- [ ] Implement advanced rate limiting
- [ ] Add file upload security

### **Phase 3: Process Hardening (Week 3)**

- [ ] Set up CI/CD security scanning
- [ ] Implement zero-downtime deployment
- [ ] Add database migration framework
- [ ] Set up monitoring & alerting

### **Phase 4: Observability (Week 4)**

- [ ] Deploy Prometheus + Grafana
- [ ] Implement distributed tracing
- [ ] Set up log aggregation
- [ ] Create operational dashboards

### **Phase 5: Compliance (Ongoing)**

- [ ] HIPAA compliance audit
- [ ] GDPR data mapping
- [ ] Security training for team
- [ ] Penetration testing
- [ ] Bug bounty program

---

## 🔐 SECURITY CHECKLIST

### **Immediate (Critical)**

- [ ] Rotate Firebase service account keys
- [ ] Rotate database passwords
- [ ] Rotate API keys (Google Places, Razorpay, Twilio)
- [ ] Regenerate JWT secrets
- [ ] Remove secrets from git history
- [ ] Delete admin test HTML files from production
- [ ] Add authentication to /stats endpoint
- [ ] Fix Socket.IO authentication
- [ ] Fix SQL injection in domainResolver

### **Short-term (High Priority)**

- [ ] Implement secrets management (KMS/Vault)
- [ ] Add CI secret scanning
- [ ] Deploy PII redaction in logs
- [ ] Implement MFA for admins
- [ ] Add file upload security (AV scanning)
- [ ] Implement advanced rate limiting
- [ ] Add session fingerprinting
- [ ] Set up WAF rules

### **Medium-term (Process)**

- [ ] Zero-downtime deployment pipeline
- [ ] Database migration framework
- [ ] Contract testing between services
- [ ] Feature flags for rollout control
- [ ] Dependency update automation
- [ ] Security review process

### **Long-term (Strategic)**

- [ ] Full observability stack (Prometheus, Grafana, Jaeger)
- [ ] Chaos engineering tests
- [ ] Multi-region failover
- [ ] HIPAA/GDPR compliance certification
- [ ] Third-party security audit
- [ ] Bug bounty program

---

## 📈 SUCCESS METRICS

### **Security**

- Zero secrets in git repository
- 100% of endpoints rate-limited
- All admin actions require MFA
- Sub-5-second secret rotation time
- 100% CI security scan pass rate

### **Reliability**

- 99.95% uptime SLA
- < 1% error rate
- < 500ms p95 response time
- Zero data loss during deployments
- < 30 second rollback time

### **Compliance**

- 100% HIPAA controls implemented
- Complete audit trail for PHI access
- GDPR data deletion within 30 days
- Annual penetration test completion
- Zero compliance violations

---

## 🚀 NEXT STEPS

1. **Review this plan** with your security and DevOps teams
2. **Prioritize** based on your specific risk tolerance
3. **Start with Phase 1** (Critical Security) immediately
4. **Set up monitoring** to track progress
5. **Schedule weekly reviews** to adjust the plan

**Estimated Timeline:** 4-6 weeks for full implementation  
**Team Required:** 2-3 engineers + 1 security specialist  
**Budget:** ~$50K-$100K (tooling, audits, team time)

---

**Document Owner:** Security Team  
**Last Updated:** February 1, 2026  
**Next Review:** Weekly during implementation
