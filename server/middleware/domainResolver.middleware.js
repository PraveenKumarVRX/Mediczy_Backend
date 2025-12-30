/**
 * Mediqzy PaaS - Domain Resolver Middleware
 * 
 * Resolves tenant from incoming request domain and loads tenant context
 * 
 * Domain Resolution Order:
 * 1. Check X-Tenant-ID header (for API clients)
 * 2. Check subdomain (tenant.mediqzy.com)
 * 3. Check custom domain (from platform_domains table)
 * 4. Fall back to default tenant for platform routes
 */

import { platformTenantService } from '../services/platform-tenant.service.js';
import { getPostgresPool } from '../db/postgres.js';

// =============================================================================
// CONFIGURATION
// =============================================================================

const PLATFORM_DOMAIN = process.env.PLATFORM_DOMAIN || 'mediqzy.com';
const PLATFORM_ROUTES = ['/api/platform', '/api/admin', '/api/auth'];
const PUBLIC_ROUTES = ['/api/health', '/api/v2/health', '/api/mobile/health'];

// =============================================================================
// DOMAIN RESOLVER MIDDLEWARE
// =============================================================================

export async function domainResolver(req, res, next) {
  try {
    // Skip for platform routes (handled by platform admin auth)
    if (PLATFORM_ROUTES.some(route => req.path.startsWith(route))) {
      req.tenantContext = { isPlatformRoute: true };
      return next();
    }

    // Skip for public routes
    if (PUBLIC_ROUTES.some(route => req.path.startsWith(route))) {
      return next();
    }

    // Method 1: Check X-Tenant-ID header (highest priority for API clients)
    const headerTenantId = req.headers['x-tenant-id'];
    if (headerTenantId) {
      const tenant = await platformTenantService.getTenant(headerTenantId);
      if (tenant && tenant.status === 'ACTIVE') {
        req.tenantContext = await buildTenantContext(tenant, req);
        return next();
      }
      // If header provided but tenant not found/inactive, return error
      return res.status(400).json({
        success: false,
        error: 'Invalid or inactive tenant',
        code: 'INVALID_TENANT',
      });
    }

    // Method 2: Check X-Tenant-Code header
    const headerTenantCode = req.headers['x-tenant-code'];
    if (headerTenantCode) {
      const tenant = await platformTenantService.getTenantByCode(headerTenantCode);
      if (tenant && tenant.status === 'ACTIVE') {
        req.tenantContext = await buildTenantContext(tenant, req);
        return next();
      }
      return res.status(400).json({
        success: false,
        error: 'Invalid or inactive tenant code',
        code: 'INVALID_TENANT',
      });
    }

    // Method 3: Parse domain from Host header
    const host = req.headers.host || '';
    const hostname = host.split(':')[0]; // Remove port if present

    // Check if it's a subdomain of platform domain
    if (hostname.endsWith(`.${PLATFORM_DOMAIN}`)) {
      const subdomain = hostname.replace(`.${PLATFORM_DOMAIN}`, '');
      
      // Skip for main platform domain
      if (subdomain === 'www' || subdomain === 'api' || subdomain === '') {
        req.tenantContext = { isPlatformRoute: true };
        return next();
      }

      // Look up tenant by subdomain
      const tenant = await platformTenantService.getTenantByDomain(`${subdomain}.${PLATFORM_DOMAIN}`);
      if (tenant && tenant.status === 'ACTIVE') {
        req.tenantContext = await buildTenantContext(tenant, req);
        return next();
      }
    }

    // Method 4: Check custom domain
    const tenant = await platformTenantService.getTenantByDomain(hostname);
    if (tenant && tenant.status === 'ACTIVE') {
      req.tenantContext = await buildTenantContext(tenant, req);
      return next();
    }

    // Method 5: Check for default tenant in development
    if (process.env.NODE_ENV === 'development') {
      const defaultTenantId = process.env.DEFAULT_TENANT_ID;
      if (defaultTenantId) {
        const tenant = await platformTenantService.getTenant(defaultTenantId);
        if (tenant) {
          req.tenantContext = await buildTenantContext(tenant, req);
          return next();
        }
      }
    }

    // No tenant resolved - allow request but flag as no tenant
    req.tenantContext = {
      resolved: false,
      domain: hostname,
    };

    return next();
  } catch (error) {
    console.error('[DomainResolver] Error:', error);
    // Don't block request on resolver errors, but log them
    req.tenantContext = { error: error.message };
    return next();
  }
}

// =============================================================================
// BUILD TENANT CONTEXT
// =============================================================================

async function buildTenantContext(tenant, req) {
  // Get entity if specified in header
  let entity = null;
  const entityId = req.headers['x-entity-id'];
  if (entityId) {
    entity = await platformTenantService.getEntity(entityId);
    // Verify entity belongs to tenant
    if (entity && entity.tenant_id !== tenant.tenant_id) {
      entity = null;
    }
  }

  return {
    resolved: true,
    tenantId: tenant.tenant_id,
    tenantCode: tenant.tenant_code,
    tenantName: tenant.tenant_name,
    tenantType: tenant.tenant_type,
    dbStrategy: tenant.db_strategy,
    dbName: tenant.db_name,
    domain: tenant.primary_domain,
    customDomain: tenant.custom_domain,
    timezone: tenant.timezone,
    entityId: entity?.entity_id,
    entityCode: entity?.entity_code,
    entityName: entity?.entity_name,
    limits: tenant.limits,
    features: tenant.limits?.features || [],
    subscription: {
      plan: tenant.subscription_plan,
      status: tenant.subscription_status,
    },
  };
}

// =============================================================================
// REQUIRE TENANT MIDDLEWARE
// =============================================================================

/**
 * Middleware that requires a valid tenant context
 * Use after domainResolver for routes that need tenant context
 */
export function requireTenant(req, res, next) {
  if (!req.tenantContext?.resolved) {
    return res.status(400).json({
      success: false,
      error: 'Tenant context required',
      code: 'TENANT_REQUIRED',
      hint: 'Include X-Tenant-ID or X-Tenant-Code header, or access via tenant subdomain',
    });
  }

  if (req.tenantContext.subscription?.status === 'SUSPENDED') {
    return res.status(403).json({
      success: false,
      error: 'Tenant account is suspended',
      code: 'TENANT_SUSPENDED',
    });
  }

  if (req.tenantContext.subscription?.status === 'EXPIRED') {
    return res.status(403).json({
      success: false,
      error: 'Tenant subscription has expired',
      code: 'SUBSCRIPTION_EXPIRED',
    });
  }

  next();
}

// =============================================================================
// REQUIRE ENTITY MIDDLEWARE
// =============================================================================

/**
 * Middleware that requires an entity to be specified
 * Use after requireTenant for routes that need entity context
 */
export function requireEntity(req, res, next) {
  if (!req.tenantContext?.entityId) {
    return res.status(400).json({
      success: false,
      error: 'Entity context required',
      code: 'ENTITY_REQUIRED',
      hint: 'Include X-Entity-ID header',
    });
  }
  next();
}

// =============================================================================
// CHECK FEATURE MIDDLEWARE
// =============================================================================

/**
 * Middleware that checks if a feature is enabled for the tenant
 * @param {string|string[]} requiredFeatures - Feature(s) that must be enabled
 * @param {boolean} requireAll - If true, all features must be present
 */
export function requireFeature(requiredFeatures, requireAll = false) {
  const features = Array.isArray(requiredFeatures) ? requiredFeatures : [requiredFeatures];

  return (req, res, next) => {
    if (!req.tenantContext?.resolved) {
      return res.status(400).json({
        success: false,
        error: 'Tenant context required',
      });
    }

    const tenantFeatures = req.tenantContext.features || [];
    
    // Enterprise tenants with 'all' feature get everything
    if (tenantFeatures.includes('all')) {
      return next();
    }

    const hasFeatures = requireAll
      ? features.every(f => tenantFeatures.includes(f))
      : features.some(f => tenantFeatures.includes(f));

    if (!hasFeatures) {
      return res.status(403).json({
        success: false,
        error: 'Feature not available in your subscription plan',
        code: 'FEATURE_NOT_AVAILABLE',
        requiredFeatures: features,
        currentPlan: req.tenantContext.subscription?.plan,
      });
    }

    next();
  };
}

// =============================================================================
// DATABASE CONNECTION RESOLVER
// =============================================================================

/**
 * Get database connection for the current tenant context
 * Handles SHARED, SCHEMA, and DEDICATED strategies
 */
export async function getTenantDatabase(req) {
  const context = req.tenantContext;
  
  if (!context?.resolved) {
    // Return default pool for non-tenant routes
    return getPostgresPool();
  }

  switch (context.dbStrategy) {
    case 'DEDICATED':
      // For dedicated databases, we'd need a connection pool manager
      // For now, return default pool with search_path set
      const pool = await getPostgresPool();
      // In production: create/reuse dedicated connection pool
      return pool;

    case 'SCHEMA':
      // Set search_path to tenant schema
      const schemaPool = await getPostgresPool();
      await schemaPool.query(`SET search_path TO ${context.dbName}, public`);
      return schemaPool;

    case 'SHARED':
    default:
      // Use default pool with tenant_id filtering in queries
      return getPostgresPool();
  }
}

// =============================================================================
// TENANT ID INJECTION FOR QUERIES
// =============================================================================

/**
 * Helper to add tenant_id to INSERT queries
 */
export function withTenantId(data, req) {
  if (req.tenantContext?.resolved) {
    return {
      ...data,
      tenant_id: req.tenantContext.tenantId,
    };
  }
  return data;
}

/**
 * Helper to add tenant filter to WHERE clauses
 */
export function tenantFilter(req) {
  if (req.tenantContext?.resolved) {
    return {
      tenant_id: req.tenantContext.tenantId,
    };
  }
  return {};
}

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  domainResolver,
  requireTenant,
  requireEntity,
  requireFeature,
  getTenantDatabase,
  withTenantId,
  tenantFilter,
};
