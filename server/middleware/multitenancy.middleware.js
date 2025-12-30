/**
 * Multitenancy Middleware - Enterprise Grade
 * Supports multiple isolation strategies:
 * 1. Schema-based isolation (PostgreSQL schemas per tenant)
 * 2. Row-level security (tenant_id column)
 * 3. Database-per-tenant (separate connections)
 */

import { TenantNotFoundError, TenantSuspendedError } from '../shared/errors/AppError.js';
// import TenantService from '../services/tenant.service.js';
// import { getTenantConnection } from '../db/tenant-connections.js';

// Tenant cache for performance (TTL: 5 minutes)
const tenantCache = new Map();
const CACHE_TTL = 5 * 60 * 1000;

/**
 * Extract tenant identifier from request
 * Supports multiple strategies:
 * 1. X-Tenant-ID header (API clients)
 * 2. Subdomain (web apps)
 * 3. JWT claim (authenticated requests)
 */
const extractTenantId = (req) => {
  // Strategy 1: Header (highest priority for API clients)
  const headerTenant = req.headers['x-tenant-id'];
  if (headerTenant) return headerTenant;

  // Strategy 2: Subdomain
  const host = req.hostname || req.headers.host;
  if (host) {
    const subdomain = host.split('.')[0];
    if (subdomain && subdomain !== 'www' && subdomain !== 'api' && subdomain !== 'app') {
      return subdomain;
    }
  }

  // Strategy 3: JWT claim (if authenticated)
  if (req.user?.tenantId) return req.user.tenantId;
  if (req.doctor?.tenantId) return req.doctor.tenantId;
  if (req.assistant?.tenantId) return req.assistant.tenantId;

  // Strategy 4: Query param (for testing/development)
  if (process.env.NODE_ENV !== 'production' && req.query.tenantId) {
    return req.query.tenantId;
  }

  // Default tenant for non-multi-tenant deployments
  return process.env.DEFAULT_TENANT_ID || 'default';
};

/**
 * Get tenant from cache or database
 * Simplified version - uses default tenant for now
 */
const getTenantConfig = async (tenantId) => {
  // Check cache first
  const cached = tenantCache.get(tenantId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  // For now, return a default tenant config
  // In production, this would fetch from database via TenantService
  const tenant = {
    id: tenantId || 'default',
    name: 'Mediczy',
    status: 'active',
    dbSchema: 'public',
    config: {},
    features: ['all'],
    plan: 'enterprise',
    limits: {
      requestsPerMinute: 1000
    }
  };

  // Cache the result
  tenantCache.set(tenantId || 'default', {
    data: tenant,
    timestamp: Date.now()
  });

  return tenant;
};

/**
 * Main Multitenancy Middleware
 */
export const multitenancyMiddleware = async (req, res, next) => {
  try {
    const tenantId = extractTenantId(req);
    
    // Get tenant configuration
    const tenant = await getTenantConfig(tenantId);
    
    // Attach tenant info to request
    req.tenant = {
      id: tenant.id,
      name: tenant.name,
      schema: tenant.dbSchema || `tenant_${tenant.id}`,
      config: tenant.config || {},
      features: tenant.features || [],
      plan: tenant.plan || 'basic',
      limits: tenant.limits || {}
    };

    // Set database connection/schema based on isolation strategy
    const isolationStrategy = process.env.TENANT_ISOLATION || 'row_level';
    
    switch (isolationStrategy) {
      case 'schema':
        // Schema-based isolation - switch PostgreSQL schema
        req.dbSchema = tenant.dbSchema;
        break;
        
      case 'database':
        // Database-per-tenant - get dedicated connection
        // req.dbConnection = await getTenantConnection(tenant.id);
        req.dbConnection = null; // Placeholder - implement when needed
        break;
        
      case 'row_level':
      default:
        // Row-level security - add tenant filter to all queries
        req.tenantFilter = { tenantId: tenant.id };
        break;
    }

    // Log tenant access for audit
    if (process.env.AUDIT_TENANT_ACCESS === 'true') {
      console.log(`[TENANT] ${tenant.id} | ${req.method} ${req.path} | IP: ${req.ip}`);
    }

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Tenant-aware model scope
 * Add to Sequelize models for automatic tenant filtering
 */
export const tenantScope = (tenantId) => ({
  where: { tenantId }
});

/**
 * Clear tenant cache (call on tenant config update)
 */
export const clearTenantCache = (tenantId) => {
  if (tenantId) {
    tenantCache.delete(tenantId);
  } else {
    tenantCache.clear();
  }
};

/**
 * Middleware to verify tenant feature access
 */
export const requireFeature = (featureName) => {
  return (req, res, next) => {
    if (!req.tenant?.features?.includes(featureName)) {
      return res.status(403).json({
        success: false,
        error: 'FEATURE_NOT_AVAILABLE',
        message: `Feature '${featureName}' is not available for your plan`
      });
    }
    next();
  };
};

/**
 * Rate limiting per tenant
 */
export const tenantRateLimiter = (req) => {
  const limits = req.tenant?.limits || {};
  return {
    windowMs: 60 * 1000, // 1 minute
    max: limits.requestsPerMinute || 100
  };
};

export default multitenancyMiddleware;
