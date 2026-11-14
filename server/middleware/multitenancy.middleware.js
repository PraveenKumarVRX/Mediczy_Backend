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
 * In order: the verified token's tenant; the X-Tenant-ID header only when
 * ALLOW_TENANT_HEADER=true and the caller is unauthenticated; the subdomain;
 * a query parameter outside production.
 */
const TENANT_ID_FORMAT = /^[A-Za-z0-9_-]{1,64}$/;

const extractTenantId = (req) => {
  // Strategy 1: the verified login token (audit M23). It used to rank below the
  // X-Tenant-ID header, so a signed-in caller could name another tenant.
  const tokenTenant = req.user?.tenantId || req.user?.tenant_id
    || req.doctor?.tenantId || req.assistant?.tenantId;
  if (tokenTenant) return String(tokenTenant);

  // Strategy 2: the header — only where explicitly allowed (same switch as
  // middleware/tenant.middleware.js), only for an unauthenticated caller, and
  // only in a bounded format so arbitrary values cannot grow the config cache.
  const headerTenant = String(req.headers['x-tenant-id'] || '').trim();
  if (headerTenant && process.env.ALLOW_TENANT_HEADER === 'true' && !req.user && TENANT_ID_FORMAT.test(headerTenant)) {
    return headerTenant;
  }

  // Strategy 2: Subdomain
  const host = req.hostname || req.headers.host;
  if (host) {
    const subdomain = host.split('.')[0];
    if (subdomain && subdomain !== 'www' && subdomain !== 'api' && subdomain !== 'app') {
      return subdomain;
    }
  }


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
