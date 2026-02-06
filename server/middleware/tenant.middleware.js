/**
 * Multi-Tenant Middleware
 * Extracts tenant context from request and enforces isolation
 */

import Tenant from '../models/postgres/tenant.model.postgres.js';

// RULE: Tenant context must come from domain/JWT; header override is opt-in only.
// SECURITY: NEVER set ALLOW_TENANT_HEADER=true in production!
const allowHeaderTenant = process.env.ALLOW_TENANT_HEADER === 'true';

if (allowHeaderTenant && process.env.NODE_ENV === 'production') {
  console.error('⚠️  SECURITY WARNING: ALLOW_TENANT_HEADER is enabled in production!');
  console.error('⚠️  This allows tenant override via X-Tenant-ID header - MAJOR SECURITY RISK');
  console.error('⚠️  Set ALLOW_TENANT_HEADER=false immediately!');
}

/**
 * Extract tenant from subdomain or custom domain
 * Examples:
 *   - apollo.mayden.in -> slug: apollo
 *   - health.apollohospitals.com -> custom_domain: health.apollohospitals.com
 *   - mayden.in -> no tenant (public routes)
 */
export async function extractTenant(req, res, next) {
  try {
    const host = req.get('host') || '';
    const subdomain = extractSubdomain(host);
    
    let tenant = null;
    
    // Skip tenant resolution for development/localhost
    const isDev = host.includes('localhost') || host.includes('127.0.0.1');
    
    // Skip for mobile API health routes
    const isMobilePublic = req.path.startsWith('/api/mobile');
    if (isMobilePublic || isDev) {
      req.tenant = null;
      req.tenantId = null;
      return next();
    }
    
    // Only query database for production domains
    if (!isDev) {
      // Specify which columns to select to avoid column-not-exists errors
      const attributes = ['id', 'name', 'slug', 'subdomain', 'custom_domain', 'status'];
      
      // Try custom domain first
      if (!subdomain || subdomain === 'www') {
        tenant = await Tenant.findOne({
          where: { custom_domain: host, status: 'active' },
          attributes
        });
      }
      
      // Try subdomain
      if (!tenant && subdomain && subdomain !== 'www') {
        tenant = await Tenant.findOne({
          where: { subdomain, status: 'active' },
          attributes
        });
      }
    }
    
    // Try X-Tenant-ID header (for API clients) - guarded by env flag
    const headerTenantId = req.get('X-Tenant-ID');
    if (!tenant && headerTenantId) {
      if (!allowHeaderTenant) {
        console.warn(
          `[tenant] Ignored X-Tenant-ID override for host=${host || 'unknown'}`
        );
      } else {
        const tenantId = parseInt(headerTenantId, 10);
        if (!Number.isNaN(tenantId)) {
          // Verify user belongs to this tenant (if authenticated)
          if (req.user && req.user.tenant_id && req.user.tenant_id !== tenantId) {
            console.error(
              `[tenant] SECURITY: User ${req.user.id} attempted to access tenant ${tenantId} but belongs to tenant ${req.user.tenant_id}`
            );
            throw new Error('Unauthorized tenant access attempt');
          }
          
          tenant = await Tenant.findOne({
            where: { id: tenantId, status: 'active' },
            attributes: ['id', 'name', 'slug', 'subdomain', 'custom_domain', 'status']
          });
        }
      }
    }
    
    // Attach tenant to request
    req.tenant = tenant;
    req.tenantId = tenant?.id || null;
    
    next();
  } catch (error) {
    console.error('Tenant extraction error:', error);
    // For localhost/dev, don't fail on tenant errors - allow request to proceed
    const host = req.get('host') || '';
    const isDev = host.includes('localhost') || host.includes('127.0.0.1');
    if (isDev) {
      req.tenant = null;
      req.tenantId = null;
      next();
    } else {
      next(error);
    }
  }
}

/**
 * Require tenant for protected routes
 */
export function requireTenant(req, res, next) {
  if (!req.tenant || !req.tenantId) {
    return res.status(400).json({
      success: false,
      message: 'Tenant context required. Please access via organization subdomain.'
    });
  }
  next();
}

/**
 * Check if tenant has feature enabled
 */
export function requireFeature(featureName) {
  return (req, res, next) => {
    if (!req.tenant) {
      return res.status(400).json({
        success: false,
        message: 'Tenant context required'
      });
    }
    
    if (!req.tenant.isFeatureEnabled(featureName)) {
      return res.status(403).json({
        success: false,
        message: `Feature '${featureName}' is not available in your plan. Please upgrade.`
      });
    }
    
    next();
  };
}

/**
 * Check usage limits
 */
export function checkLimit(limitType) {
  return async (req, res, next) => {
    if (!req.tenant) {
      return res.status(400).json({
        success: false,
        message: 'Tenant context required'
      });
    }
    
    if (req.tenant.hasReachedLimit(limitType)) {
      return res.status(429).json({
        success: false,
        message: `You have reached your ${limitType} limit. Please upgrade your plan.`,
        limit: req.tenant.limits[limitType],
        usage: req.tenant.usage[limitType]
      });
    }
    
    next();
  };
}

/**
 * Tenant-aware query scope
 * Automatically adds tenant_id filter to Sequelize queries
 */
export function tenantScope(model) {
  return {
    where: {
      tenant_id: model.sequelize.literal('tenant_id = :tenantId')
    },
    bind: {
      tenantId: null // Will be set dynamically
    }
  };
}

/**
 * Extract subdomain from host
 * Examples:
 *   apollo.mayden.in -> apollo
 *   www.mayden.in -> www
 *   mayden.in -> null
 */
function extractSubdomain(host) {
  const parts = host.split('.');
  
  // Remove port if present
  if (parts[0].includes(':')) {
    parts[0] = parts[0].split(':')[0];
  }
  
  // Single domain (no subdomain)
  if (parts.length <= 2) {
    return null;
  }
  
  // Return first part as subdomain
  return parts[0];
}

/**
 * Inject tenant ID into Sequelize queries
 */
export function injectTenantId(req, res, next) {
  if (!req.tenantId) {
    return next();
  }
  
  // Store original Sequelize methods
  const originalFindAll = req.Model?.findAll;
  const originalFindOne = req.Model?.findOne;
  const originalCreate = req.Model?.create;
  
  // Override to add tenant_id automatically
  if (req.Model && req.Model.sequelize) {
    req.Model.findAll = function(options = {}) {
      options.where = options.where || {};
      options.where.tenant_id = req.tenantId;
      return originalFindAll.call(this, options);
    };
    
    req.Model.findOne = function(options = {}) {
      options.where = options.where || {};
      options.where.tenant_id = req.tenantId;
      return originalFindOne.call(this, options);
    };
    
    req.Model.create = function(values, options = {}) {
      values.tenant_id = req.tenantId;
      return originalCreate.call(this, values, options);
    };
  }
  
  next();
}

export default {
  extractTenant,
  requireTenant,
  requireFeature,
  checkLimit,
  tenantScope,
  injectTenantId
};
