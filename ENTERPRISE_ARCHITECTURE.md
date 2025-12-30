# Mediczy Enterprise Architecture Guide

## Overview

This document outlines the enterprise-grade architecture patterns implemented in Mediczy for building scalable, maintainable ERP/CRM systems with multi-tenancy support.

## Architecture Layers

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐        │
│  │  Web App │  │ iOS App  │  │Android   │  │ Desktop  │        │
│  │ (React)  │  │ (Swift)  │  │(Kotlin)  │  │(Electron)│        │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘        │
└───────┼─────────────┼───────────────┼───────────────┼───────────┘
        │             │               │               │
        v             v               v               v
┌─────────────────────────────────────────────────────────────────┐
│                      API GATEWAY LAYER                          │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              /api/v2 (Enterprise API)                     │  │
│  │         /api/mobile (Mobile-optimized API)                │  │
│  │         /api (Legacy v1 - Deprecated)                     │  │
│  └──────────────────────────────────────────────────────────┘  │
│  Features: Rate Limiting, CORS, Auth, Versioning, Logging      │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             v
┌─────────────────────────────────────────────────────────────────┐
│                     MIDDLEWARE LAYER                            │
│  ┌────────────┐ ┌──────────────┐ ┌────────────┐ ┌────────────┐ │
│  │   Auth     │ │ Multi-tenant │ │ Validation │ │  Logging   │ │
│  │Middleware  │ │  Middleware  │ │ (Zod)      │ │& Audit     │ │
│  └────────────┘ └──────────────┘ └────────────┘ └────────────┘ │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             v
┌─────────────────────────────────────────────────────────────────┐
│                   CONTROLLER LAYER (Thin)                       │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐            │
│  │  Assistant   │ │   Doctor     │ │   Patient    │ ...        │
│  │ Controller   │ │ Controller   │ │ Controller   │            │
│  └──────┬───────┘ └──────┬───────┘ └──────┬───────┘            │
│         │                │                │                     │
│   Handles HTTP concerns only (req/res transformation)           │
└─────────┼────────────────┼────────────────┼─────────────────────┘
          │                │                │
          v                v                v
┌─────────────────────────────────────────────────────────────────┐
│                     SERVICE LAYER                               │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐            │
│  │  Assistant   │ │   Doctor     │ │   Patient    │ ...        │
│  │   Service    │ │   Service    │ │   Service    │            │
│  └──────┬───────┘ └──────┬───────┘ └──────┬───────┘            │
│         │                │                │                     │
│   Contains ALL business logic, validations, orchestration       │
└─────────┼────────────────┼────────────────┼─────────────────────┘
          │                │                │
          v                v                v
┌─────────────────────────────────────────────────────────────────┐
│                   REPOSITORY LAYER                              │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐            │
│  │  Assistant   │ │   Doctor     │ │   Patient    │ ...        │
│  │ Repository   │ │ Repository   │ │ Repository   │            │
│  └──────┬───────┘ └──────┬───────┘ └──────┬───────┘            │
│         │                │                │                     │
│   Data access abstraction - query building, ORM operations      │
└─────────┼────────────────┼────────────────┼─────────────────────┘
          │                │                │
          v                v                v
┌─────────────────────────────────────────────────────────────────┐
│                     DATABASE LAYER                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │PostgreSQL│  │  Redis   │  │ DuckDB   │  │pgVector  │       │
│  │(Primary) │  │ (Cache)  │  │(Analytics│  │(Vectors) │       │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘       │
└─────────────────────────────────────────────────────────────────┘
```

## Directory Structure

```
server/
├── api/
│   ├── v2/                          # Enterprise API v2
│   │   ├── controllers/             # HTTP handlers (thin)
│   │   │   ├── assistant.controller.js
│   │   │   ├── doctor.controller.js
│   │   │   └── patient.controller.js
│   │   ├── routes/                  # Route definitions
│   │   │   ├── assistant.routes.js
│   │   │   ├── doctor.routes.js
│   │   │   └── patient.routes.js
│   │   ├── validators/              # Zod schemas
│   │   │   ├── assistant.validator.js
│   │   │   ├── doctor.validator.js
│   │   │   └── index.js
│   │   └── index.js                 # V2 router
│   │
│   ├── mobile/                      # Mobile API Gateway
│   │   └── index.js
│   │
│   └── gateway.js                   # Main API Gateway config
│
├── services/                        # Business Logic Layer
│   ├── assistant.service.js
│   ├── doctor.service.js
│   ├── patient.service.js
│   └── tenant.service.js
│
├── repositories/                    # Data Access Layer
│   ├── base.repository.js
│   ├── assistant.repository.js
│   └── ...
│
├── middleware/                      # Cross-cutting Concerns
│   ├── auth.middleware.js
│   ├── multitenancy.middleware.js
│   ├── rateLimiter.middleware.js
│   ├── logging.middleware.js
│   └── errorHandler.middleware.js
│
├── shared/                          # Shared Utilities
│   ├── errors/
│   │   └── AppError.js
│   └── utils/
│       └── apiResponse.js
│
└── config/                          # Configuration
    ├── database.js
    └── ...
```

## Multi-Tenancy Strategies

### 1. Row-Level Security (Default)
```javascript
// Every query includes tenant_id filter
SELECT * FROM patients WHERE tenant_id = 'tenant_abc' AND id = $1
```

### 2. Schema-Based Isolation
```javascript
// Each tenant has its own schema
SET search_path TO tenant_abc, public;
SELECT * FROM patients WHERE id = $1;
```

### 3. Database-Per-Tenant
```javascript
// Separate database for each tenant
// Connection pool per tenant
const connection = getTenantConnection('tenant_abc');
```

## API Versioning

```
/api/v1/...    # Legacy routes (deprecated)
/api/v2/...    # Enterprise routes (current)
/api/mobile/...# Mobile-optimized routes
```

## Request Flow Example

```
1. Client Request
   POST /api/v2/assistants/appointments

2. API Gateway
   - Rate limiting check
   - CORS validation
   - Request logging

3. Router
   - Route matching
   - Authentication middleware
   - Authorization middleware (permissions)

4. Validation Middleware (Zod)
   - Schema validation
   - Input sanitization

5. Controller
   - Extract request data
   - Call service
   - Format response

6. Service
   - Business logic
   - Validation rules
   - Call repository

7. Repository
   - Build query
   - Execute against database
   - Return raw data

8. Response
   - Standardized format
   - Proper HTTP status
   - Error handling
```

## Standardized API Response Format

### Success Response
```json
{
  "success": true,
  "message": "Operation successful",
  "data": { ... },
  "meta": {
    "timestamp": "2025-01-27T10:00:00Z",
    "requestId": "req_abc123"
  }
}
```

### Paginated Response
```json
{
  "success": true,
  "data": [ ... ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "totalPages": 8,
    "hasNextPage": true,
    "hasPrevPage": false
  }
}
```

### Error Response
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "errors": [
      {
        "field": "email",
        "message": "Invalid email format"
      }
    ]
  }
}
```

## Error Handling

### Error Classes
```javascript
// Base error
class AppError extends Error

// Specific errors
class ValidationError extends AppError      // 422
class NotFoundError extends AppError        // 404
class UnauthorizedError extends AppError    // 401
class ForbiddenError extends AppError       // 403
class ConflictError extends AppError        // 409
class TenantNotFoundError extends AppError  // 404
class TokenExpiredError extends AppError    // 401
class RateLimitError extends AppError       // 429
```

## Authentication & Authorization

### JWT Token Structure
```json
{
  "id": "user_123",
  "email": "user@example.com",
  "role": "assistant",
  "permissions": ["canViewAppointments", "canManagePatients"],
  "tenantId": "tenant_abc",
  "iat": 1706356800,
  "exp": 1706385600
}
```

### Permission-Based Access
```javascript
// In routes
router.get('/appointments',
  authenticate({ allowedRoles: ['assistant'] }),
  authorize('canViewAppointments'),
  controller.getAppointments
);
```

## Mobile API Considerations

1. **Offline Support**: Include sync timestamps
2. **Push Notifications**: Device token management
3. **Version Checking**: Force update for old apps
4. **Response Optimization**: Compress, paginate
5. **OTP Authentication**: Phone-based login

## Best Practices Implemented

1. **Thin Controllers**: Only HTTP concerns
2. **Fat Services**: All business logic
3. **Repository Pattern**: Data access abstraction
4. **Dependency Injection**: Testable components
5. **Standardized Responses**: Consistent API format
6. **Comprehensive Validation**: Zod schemas
7. **Centralized Error Handling**: AppError classes
8. **Audit Logging**: All sensitive operations
9. **Rate Limiting**: Per-endpoint configuration
10. **Multi-tenancy**: Built-in tenant isolation

## Migration Path

To migrate existing routes to v2:

1. Create validator schema in `validators/`
2. Create service in `services/`
3. Create controller in `controllers/`
4. Create route in `routes/`
5. Add route to `api/v2/index.js`
6. Deprecate old route with redirect warning

## Configuration

### Environment Variables
```env
# API
API_VERSION=2.0.0
API_RATE_LIMIT=100

# Multi-tenancy
TENANT_ISOLATION=row  # row|schema|database

# Authentication
JWT_SECRET=your-secret
JWT_EXPIRES_IN=8h
REFRESH_TOKEN_EXPIRES_IN=30d

# Rate Limiting
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100
```

## Testing

```bash
# Test v2 API health
curl http://localhost:8000/api/v2/health

# Test mobile API
curl http://localhost:8000/api/mobile/status
```

## Endpoints Summary

### Enterprise API v2 (`/api/v2`)
- `GET /api/v2/health` - Health check
- `POST /api/v2/auth/login` - Unified login
- `POST /api/v2/auth/refresh` - Token refresh
- `GET /api/v2/assistants/profile` - Get profile
- `GET /api/v2/assistants/dashboard` - Dashboard stats
- `GET /api/v2/assistants/appointments` - List appointments
- `POST /api/v2/assistants/appointments` - Create appointment
- `GET /api/v2/assistants/patients` - List patients
- `POST /api/v2/assistants/patients` - Register patient

### Mobile API (`/api/mobile`)
- `GET /api/mobile/health` - Health check
- `GET /api/mobile/status` - API status & features
- `POST /api/mobile/auth/login` - Email login
- `POST /api/mobile/auth/otp/request` - Request OTP
- `POST /api/mobile/auth/otp/verify` - Verify OTP
- `GET /api/mobile/user/profile` - User profile
- `GET /api/mobile/doctors` - Search doctors
- `GET /api/mobile/appointments` - User appointments
- `POST /api/mobile/appointments` - Book appointment
