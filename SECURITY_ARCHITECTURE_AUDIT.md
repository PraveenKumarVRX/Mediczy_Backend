# Mediczy - Security & Architecture Audit Report

**Date:** November 9, 2025  
**Application:** Mediczy Healthcare Platform  
**Auditor:** AI Security Assessment

---

## Executive Summary

### Architecture Type: **3-Tier Architecture**

The application follows a **classic 3-tier architecture** with clear separation of concerns:

1. **Presentation Layer (Tier 1):** React 18.3.1 + Vite frontend (Port 4000)
2. **Application Layer (Tier 2):** Node.js/Express.js REST API backend (Port 8000)
3. **Data Layer (Tier 3):** MariaDB relational database + Redis cache + Kafka message broker

### Security Risk Level: **MEDIUM-HIGH** ⚠️

The application has **basic security implementations** but contains **significant vulnerabilities** that require immediate attention before production deployment.

---

## 1. Architecture Analysis

### 1.1 Tier Breakdown

```
┌─────────────────────────────────────────────────────────────┐
│                   PRESENTATION TIER (CLIENT)                 │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ React 18.3.1 SPA (TypeScript)                        │  │
│  │ - Vite 5.4.21 dev server                            │  │
│  │ - shadcn/ui + Tailwind CSS                          │  │
│  │ - React Router for navigation                       │  │
│  │ - Axios for API calls                                │  │
│  │ - IndexedDB for offline storage                     │  │
│  │ - Service Worker for PWA                            │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                            ↓ HTTP/REST API
┌─────────────────────────────────────────────────────────────┐
│              APPLICATION TIER (API SERVER)                   │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Node.js 18+ / Express 4.21.2                         │  │
│  │ - JWT Authentication (jsonwebtoken 9.0.2)            │  │
│  │ - bcrypt 5.1.1 password hashing                      │  │
│  │ - express-validator 7.2.1 input validation           │  │
│  │ - express-rate-limit 8.2.1 (partial)                 │  │
│  │ - Socket.io 4.8.1 for real-time chat                │  │
│  │ - BullMQ 5.63.0 job queues                           │  │
│  │ - Prometheus metrics                                 │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                            ↓ TCP/SQL
┌─────────────────────────────────────────────────────────────┐
│                   DATA TIER (PERSISTENCE)                    │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ MariaDB (Sequelize ORM 6.37.6)                       │  │
│  │ - Primary data store                                 │  │
│  │ - User/Doctor/Appointment/Health data                │  │
│  │ - 20+ tables with relationships                      │  │
│  └──────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Redis 6.0.16 (ioredis 5.8.2)                         │  │
│  │ - Session caching                                    │  │
│  │ - BullMQ job persistence                             │  │
│  │ - Rate limiting counters                             │  │
│  └──────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Kafka 2.2.4                                           │  │
│  │ - Event streaming                                    │  │
│  │ - Async task distribution                            │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 Architecture Benefits
✅ **Clear separation of concerns**  
✅ **Independent scaling of tiers**  
✅ **Technology flexibility per tier**  
✅ **Easier maintenance and testing**  
✅ **Well-organized codebase with MVC pattern in Application Tier**

---

## 2. Security Audit

### 2.1 Authentication & Authorization

#### ✅ Strengths:
- **JWT-based authentication** with proper token generation
- **bcrypt password hashing** (10 rounds) with salt
- **Role-based access control (RBAC)** with `authUser` + `requireRole` middleware
- **Token validation** on protected routes
- **Password comparison** using bcrypt.compare (constant-time)
- **Admin-specific authentication** with `isAdmin` flag

#### ❌ Critical Vulnerabilities:

**CRITICAL-1: Hardcoded Default JWT Secret**
```javascript
// server/middleware/auth.middleware.js:13
const decoded = jwt.verify(token, process.env.SECRET_TOKEN || 'default-secret-key');
```
- **Risk:** Default fallback secret key allows token forgery if env var not set
- **Impact:** Complete authentication bypass, privilege escalation
- **CVSS Score:** 9.8 (Critical)
- **Fix:** Remove fallback, fail immediately if SECRET_TOKEN missing

**HIGH-1: No Token Expiration Validation**
```javascript
// server/models/user.model.mariadb.js:133
const token = jwt.sign(
  { id: this.id, email: this.email },
  process.env.SECRET_TOKEN || 'default-secret-key',
  { expiresIn: '30d' } // Only sets expiry, no refresh mechanism
);
```
- **Risk:** 30-day token lifetime with no refresh means stolen tokens valid for extended period
- **Impact:** Session hijacking, prolonged unauthorized access
- **CVSS Score:** 7.5 (High)
- **Fix:** Implement token refresh mechanism + shorter access token lifetime (15-30 minutes)

**HIGH-2: No Account Lockout After Failed Attempts**
- **Risk:** No protection against brute force attacks
- **Impact:** Attackers can attempt unlimited password combinations
- **CVSS Score:** 7.3 (High)
- **Fix:** Implement account lockout after 5-10 failed attempts

**MEDIUM-1: Password in JWT Claims**
```javascript
// Multiple locations reference req.user which contains full user object
// Password excluded in Sequelize query but risk of accidental exposure
```
- **Fix:** Only store user ID in JWT, fetch user data per request

---

### 2.2 Input Validation & SQL Injection

#### ✅ Strengths:
- **Sequelize ORM** with parameterized queries (prevents basic SQL injection)
- **express-validator** used on most routes
- **Aadhaar validation** with Verhoeff algorithm (proper)

#### ❌ Vulnerabilities:

**HIGH-3: Inconsistent Input Validation**
```javascript
// Some routes lack validation:
// - server/routes/ayushman.route.js (no validation middleware)
// - server/routes/ai.js (limited validation)
// - server/routes/places.js (query params not validated)
```
- **Risk:** Malicious input processing, data corruption
- **CVSS Score:** 6.5 (Medium)
- **Fix:** Apply express-validator to ALL routes

**MEDIUM-2: No Sanitization for User Input**
- HTML/script injection possible in text fields (notes, messages, etc.)
- **Risk:** Stored XSS attacks
- **Fix:** Implement `express-mongo-sanitize` or equivalent + HTML escaping

**LOW-1: No File Upload Validation**
```javascript
// server/app.js uses express-fileupload but no size/type restrictions visible
```
- **Risk:** Malicious file upload, DoS via large files
- **Fix:** Validate file types, limit sizes, scan for malware

---

### 2.3 HTTPS & Transport Security

#### ❌ Critical Gaps:

**CRITICAL-2: No HTTPS Enforcement**
```javascript
// server/index.js - Only HTTP server
const server = app.listen(PORT, () => {
  console.log(`server running on PORT ${PORT}`);
});
```
- **Risk:** Man-in-the-middle attacks, credential theft, data interception
- **Impact:** All traffic (including JWT tokens, passwords) sent in cleartext
- **CVSS Score:** 9.1 (Critical)
- **Fix:** 
  - Enable HTTPS with Let's Encrypt certificates
  - Force HTTPS redirect
  - Set secure cookie flags
  - Implement HSTS headers

**HIGH-4: Missing Security Headers**
```javascript
// No helmet middleware found
// Missing headers:
// - X-Frame-Options
// - X-Content-Type-Options
// - Content-Security-Policy
// - Strict-Transport-Security
```
- **Risk:** Clickjacking, MIME sniffing attacks, XSS
- **Fix:** Add `helmet` npm package:
```javascript
import helmet from 'helmet';
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
    }
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true
  }
}));
```

---

### 2.4 CORS Configuration

#### ⚠️ Issues:

**MEDIUM-3: Overly Permissive CORS**
```javascript
// server/app.js:57-66
app.use(cors({
  origin: true, // ❌ Allows ALL origins
  credentials: true, // ❌ With wildcard origin = security risk
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
}));
```
- **Risk:** CSRF attacks, unauthorized API access from malicious sites
- **Fix:** Whitelist specific origins:
```javascript
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://mediczy.com', 'https://app.mediczy.com']
    : ['http://localhost:4000', 'http://192.168.1.72:4000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
}));
```

---

### 2.5 Rate Limiting & DoS Protection

#### ✅ Partial Implementation:
```javascript
// server/routes/dr-isha.route.js:7-15
const consultationLimit = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 5, // 5 requests per minute
});
```

#### ❌ Gaps:

**HIGH-5: Rate Limiting Only on One Route**
- Only `/api/dr-isha/consult` and `/api/dr-isha/analyze-symptoms` protected
- **Risk:** API abuse, brute force attacks on login, DoS
- **Fix:** Apply global rate limiting:
```javascript
import rateLimit from 'express-rate-limit';

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per 15 min per IP
  message: 'Too many requests from this IP'
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5, // Only 5 login attempts per 15 min
  skipSuccessfulRequests: true
});

app.use('/api', globalLimiter);
app.use('/api/users/login', authLimiter);
app.use('/api/admin/login', authLimiter);
app.use('/api/doctors/login', authLimiter);
```

---

### 2.6 Data Exposure & Privacy

#### ❌ Issues:

**MEDIUM-4: Sensitive Data in Error Messages**
```javascript
// server/app.js:76-82
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
    // ❌ Stack traces exposed in development
  });
});
```
- **Risk:** Information leakage helps attackers understand system
- **Fix:** Never expose stack traces, even in development. Use proper logging.

**MEDIUM-5: No Data Encryption at Rest**
- MariaDB stores sensitive health data unencrypted
- **Risk:** Data breach if database compromised
- **Fix:** 
  - Enable MariaDB encryption-at-rest
  - Encrypt sensitive fields (SSN, health records) at application level

**LOW-2: Verbose Logging**
```javascript
// Multiple console.log statements with sensitive data
console.log(decoded, "decoded"); // May log user IDs, emails
```
- **Fix:** Remove debug logs, use proper logging framework (Winston/Pino) with log levels

---

### 2.7 Third-Party Dependencies

#### ⚠️ Security Concerns:

**Dependencies Audit:**
```json
{
  "bcrypt": "^5.1.1", // ✅ Latest, secure
  "jsonwebtoken": "^9.0.2", // ✅ Latest
  "express": "^4.21.2", // ✅ Latest
  "sequelize": "^6.37.6", // ✅ Active, patched
  "socket.io": "^4.8.1", // ✅ Latest
  "axios": "^1.8.1", // ✅ Latest
  // Missing security packages:
  // ❌ No helmet
  // ❌ No express-mongo-sanitize
  // ❌ No hpp (HTTP Parameter Pollution)
  // ❌ No cors whitelist
}
```

**Action:** Run `npm audit` regularly and update vulnerable packages

---

### 2.8 Session Management

#### ❌ Issues:

**HIGH-6: No Session Invalidation Mechanism**
- No logout functionality that blacklists tokens
- Compromised tokens valid until expiry (30 days)
- **Fix:** Implement token blacklist in Redis:
```javascript
// On logout
await redisClient.set(`blacklist:${token}`, '1', 'EX', 2592000); // 30 days

// In auth middleware
const isBlacklisted = await redisClient.get(`blacklist:${token}`);
if (isBlacklisted) {
  return res.status(401).json({ message: 'Token revoked' });
}
```

**MEDIUM-6: Concurrent Session Not Limited**
- Users can have unlimited active sessions
- **Fix:** Track active sessions per user, limit to 3-5

---

### 2.9 Real-time Communication (Socket.io)

#### ⚠️ Concerns:

```javascript
// server/chat/chathandler.controller.js:12-17
cors: {
  origin: "*", // ❌ Wildcard
  methods: ["GET", "POST"]
}
```
- **Risk:** Unauthorized WebSocket connections
- **Fix:** Authenticate WebSocket connections with JWT token

---

### 2.10 Database Security

#### ✅ Strengths:
- Sequelize ORM prevents basic SQL injection
- Password fields excluded from queries
- Prepared statements used

#### ❌ Gaps:

**MEDIUM-7: No Database Connection Encryption**
```javascript
// server/db/mariadb.js - No SSL/TLS configuration visible
```
- **Risk:** Database credentials/data intercepted
- **Fix:** Enable SSL for database connections

**MEDIUM-8: Over-Privileged Database User**
- Likely using root/admin database user
- **Fix:** Create application-specific DB user with minimal permissions (SELECT, INSERT, UPDATE, DELETE on specific tables only)

---

## 3. Security Scorecard

| Category | Score | Status |
|----------|-------|--------|
| Authentication | 6/10 | ⚠️ Needs Improvement |
| Authorization | 7/10 | 🟡 Acceptable |
| Input Validation | 6/10 | ⚠️ Needs Improvement |
| Output Encoding | 4/10 | ❌ Poor |
| Cryptography | 7/10 | 🟡 Acceptable |
| Error Handling | 5/10 | ⚠️ Needs Improvement |
| Logging & Monitoring | 4/10 | ❌ Poor |
| Network Security | 3/10 | ❌ Critical |
| Session Management | 5/10 | ⚠️ Needs Improvement |
| Access Control | 7/10 | 🟡 Acceptable |
| **Overall Security** | **5.4/10** | ⚠️ **MEDIUM-HIGH RISK** |

---

## 4. OWASP Top 10 Compliance

| Risk | Status | Findings |
|------|--------|----------|
| A01:2021 – Broken Access Control | ⚠️ Partial | RBAC implemented but no session management |
| A02:2021 – Cryptographic Failures | ❌ Fail | No HTTPS, plaintext transmission |
| A03:2021 – Injection | 🟢 Pass | Sequelize ORM prevents SQL injection |
| A04:2021 – Insecure Design | ⚠️ Partial | No security requirements in design |
| A05:2021 – Security Misconfiguration | ❌ Fail | Missing security headers, permissive CORS |
| A06:2021 – Vulnerable Components | 🟢 Pass | Dependencies mostly up-to-date |
| A07:2021 – Identity/Auth Failures | ⚠️ Partial | No MFA, weak session management |
| A08:2021 – Software/Data Integrity | ⚠️ Partial | No integrity checks on updates |
| A09:2021 – Logging/Monitoring | ❌ Fail | Insufficient logging, no monitoring |
| A10:2021 – Server-Side Request Forgery | 🟢 Pass | External API calls validated |

**OWASP Compliance: 30%** (3/10 passed, 4/10 partial, 3/10 failed)

---

## 5. Immediate Action Items (Priority Order)

### 🔴 Critical (Fix Immediately):
1. **Enable HTTPS** with Let's Encrypt
2. **Remove default JWT secret fallback** - fail if env var missing
3. **Fix CORS configuration** - whitelist specific origins
4. **Add helmet middleware** for security headers

### 🟠 High Priority (Fix Within 1 Week):
5. **Implement token refresh mechanism** (short-lived access tokens)
6. **Add global rate limiting** on all API endpoints
7. **Implement account lockout** after failed login attempts
8. **Add token blacklist** for logout functionality
9. **Enable database connection encryption** (SSL/TLS)

### 🟡 Medium Priority (Fix Within 1 Month):
10. **Add input sanitization** for XSS prevention
11. **Implement comprehensive input validation** on all routes
12. **Set up proper logging** (Winston/Pino) with log rotation
13. **Enable MariaDB encryption-at-rest**
14. **Add file upload validation** with size/type restrictions
15. **Implement concurrent session limits**

### 🟢 Low Priority (Backlog):
16. Remove debug console.log statements
17. Implement audit logging for sensitive operations
18. Add 2FA/MFA for admin accounts
19. Set up automated security scanning (Snyk, OWASP ZAP)
20. Create security incident response plan

---

## 6. Recommended Security Enhancements

### 6.1 Quick Wins (< 1 day implementation):

```bash
npm install helmet hpp express-mongo-sanitize
```

```javascript
// server/app.js - Add after imports
import helmet from 'helmet';
import hpp from 'hpp';
import mongoSanitize from 'express-mongo-sanitize';
import rateLimit from 'express-rate-limit';

// Security middleware
app.use(helmet());
app.use(hpp()); // Prevent HTTP Parameter Pollution
app.use(mongoSanitize()); // Sanitize NoSQL queries
app.use(express.json({ limit: '10mb' })); // Limit body size

// Global rate limiter
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
});
app.use('/api', limiter);

// Auth-specific limiter
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  skipSuccessfulRequests: true
});
app.use('/api/*/login', authLimiter);

// CORS whitelist
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:4000'];
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));
```

### 6.2 Environment Variables Checklist:

Create `.env` with proper values (NEVER commit to git):
```bash
# Security
SECRET_TOKEN=<generate-64-char-random-string>
JWT_EXPIRE=15m
JWT_REFRESH_EXPIRE=30d
ALLOWED_ORIGINS=https://mediczy.com,https://app.mediczy.com

# Database
DB_HOST=localhost
DB_USER=mediczy_app  # NOT root
DB_PASSWORD=<strong-password>
DB_NAME=mediczy
DB_SSL=true

# Redis
REDIS_PASSWORD=<strong-password>
REDIS_TLS=true

# API Keys (if needed)
GOOGLE_API_KEY=<key>
FIREBASE_CREDENTIALS=<path-to-credentials>
```

---

## 7. Security Testing Recommendations

### 7.1 Automated Testing:
- **SAST (Static Analysis):** ESLint with security plugins
- **DAST (Dynamic Analysis):** OWASP ZAP automated scans
- **Dependency Scanning:** Snyk or npm audit in CI/CD
- **Secret Scanning:** Gitleaks in pre-commit hooks

### 7.2 Manual Testing:
- Penetration testing (hire security firm)
- Code review by security experts
- Threat modeling sessions

### 7.3 Monitoring:
- Set up Prometheus alerts for suspicious activity
- Implement ELK stack for log analysis
- Configure rate limit alerts
- Monitor failed authentication attempts

---

## 8. Compliance Considerations

If handling healthcare data (HIPAA/GDPR applicable):
- ❌ **Not HIPAA compliant** - requires PHI encryption, audit logs, BAAs
- ❌ **Not GDPR compliant** - needs data processing agreements, right to deletion
- **Action:** Consult legal/compliance team before production deployment

---

## 9. Conclusion

### Current State:
- **Architecture:** Well-designed 3-tier system ✅
- **Security:** Basic protections in place, but **significant gaps** ⚠️
- **Deployment Readiness:** **NOT production-ready** ❌

### Path Forward:
1. **Immediate:** Fix critical vulnerabilities (HTTPS, JWT secret, CORS)
2. **Short-term:** Implement high-priority security controls
3. **Long-term:** Establish security-first development culture

### Estimated Effort:
- **Critical fixes:** 2-3 days
- **High priority:** 1-2 weeks
- **Medium priority:** 3-4 weeks
- **Full hardening:** 2-3 months

**Recommendation:** **DO NOT deploy to production** until at minimum the critical and high-priority items are addressed.

---

## Appendix: Security Resources

- [OWASP Top 10](https://owasp.org/Top10/)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)
- [Express Security Best Practices](https://expressjs.com/en/advanced/best-practice-security.html)
- [JWT Security Best Practices](https://tools.ietf.org/html/rfc8725)
- [HIPAA Security Rule](https://www.hhs.gov/hipaa/for-professionals/security/index.html)

---

**Report Generated:** November 9, 2025  
**Next Review Recommended:** After implementing critical fixes
