/**
 * Tenant Access Audit Service
 * Logs and monitors cross-tenant access attempts for security
 */

import { pool } from '../db/orchestrator.js';

/**
 * Log tenant access attempt
 * 
 * @param {object} accessData - Access attempt data
 * @param {number} accessData.user_id - User attempting access
 * @param {number} accessData.requested_tenant_id - Tenant being accessed
 * @param {number} accessData.actual_tenant_id - User's actual tenant
 * @param {string} accessData.access_method - How access was attempted (subdomain, header, jwt)
 * @param {boolean} accessData.success - Whether access was granted
 * @param {string} accessData.ip_address - Client IP address
 * @param {string} accessData.user_agent - Client user agent
 * @param {string} accessData.endpoint - API endpoint accessed
 */
export async function logTenantAccess(accessData) {
  const client = await pool.connect();
  
  try {
    await client.query(
      `INSERT INTO tenant_access_audit 
       (user_id, requested_tenant_id, actual_tenant_id, access_method, 
        success, ip_address, user_agent, endpoint, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
      [
        accessData.user_id,
        accessData.requested_tenant_id,
        accessData.actual_tenant_id,
        accessData.access_method,
        accessData.success,
        accessData.ip_address,
        accessData.user_agent,
        accessData.endpoint
      ]
    );
  } catch (error) {
    console.error('Failed to log tenant access:', error);
    // Don't throw - audit logging failure shouldn't break the request
  } finally {
    client.release();
  }
}

/**
 * Get suspicious access attempts (failed cross-tenant access)
 * 
 * @param {object} options - Query options
 * @param {number} options.hours - Look back hours (default: 24)
 * @param {number} options.limit - Max results (default: 100)
 * @returns {Promise<Array>} Suspicious access attempts
 */
export async function getSuspiciousAccess(options = {}) {
  const { hours = 24, limit = 100 } = options;
  const client = await pool.connect();
  
  try {
    const result = await client.query(
      `SELECT 
         user_id,
         requested_tenant_id,
         actual_tenant_id,
         access_method,
         ip_address,
         endpoint,
         created_at,
         COUNT(*) as attempt_count
       FROM tenant_access_audit
       WHERE success = false
         AND created_at > NOW() - INTERVAL '${hours} hours'
       GROUP BY user_id, requested_tenant_id, actual_tenant_id, 
                access_method, ip_address, endpoint, created_at
       ORDER BY created_at DESC
       LIMIT $1`,
      [limit]
    );
    
    return result.rows;
  } finally {
    client.release();
  }
}

/**
 * Check if user has unusual access patterns
 * 
 * @param {number} userId - User ID to check
 * @param {number} hours - Look back hours (default: 1)
 * @returns {Promise<boolean>} True if suspicious activity detected
 */
export async function hasUnusualActivity(userId, hours = 1) {
  const client = await pool.connect();
  
  try {
    const result = await client.query(
      `SELECT COUNT(*) as failed_attempts
       FROM tenant_access_audit
       WHERE user_id = $1
         AND success = false
         AND created_at > NOW() - INTERVAL '${hours} hours'`,
      [userId]
    );
    
    const failedAttempts = parseInt(result.rows[0]?.failed_attempts || 0);
    return failedAttempts >= 3; // 3+ failed attempts in timeframe
  } finally {
    client.release();
  }
}

/**
 * Middleware to audit tenant access
 * Use after verifyTenant middleware
 */
export function auditTenantAccess(req, res, next) {
  const originalSend = res.send;
  
  // Intercept response to log access
  res.send = function(data) {
    const success = res.statusCode < 400;
    
    logTenantAccess({
      user_id: req.userId || null,
      requested_tenant_id: req.params.tenantId || req.headers['x-tenant-id'] || req.tenantId,
      actual_tenant_id: req.tenantId,
      access_method: req.params.tenantId ? 'path' : (req.headers['x-tenant-id'] ? 'header' : 'domain'),
      success,
      ip_address: req.ip || req.connection.remoteAddress,
      user_agent: req.get('user-agent') || 'unknown',
      endpoint: req.originalUrl
    }).catch(err => console.error('Audit logging error:', err));
    
    return originalSend.call(this, data);
  };
  
  next();
}

export default {
  logTenantAccess,
  getSuspiciousAccess,
  hasUnusualActivity,
  auditTenantAccess
};
