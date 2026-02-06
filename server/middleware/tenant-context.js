/**
 * Tenant Context Manager
 * Provides utilities for setting PostgreSQL session context for Row-Level Security (RLS)
 */

import { pool } from '../db/orchestrator.js';

/**
 * Set tenant context for current database session
 * This sets the PostgreSQL session variable used by RLS policies
 * 
 * @param {number} tenantId - Tenant ID to set in context
 * @param {object} client - Optional PostgreSQL client (uses pool if not provided)
 */
export async function setTenantContext(tenantId, client = null) {
  const dbClient = client || await pool.connect();
  
  try {
    await dbClient.query(
      'SET LOCAL app.current_tenant = $1',
      [tenantId]
    );
  } finally {
    if (!client) {
      dbClient.release();
    }
  }
}

/**
 * Execute a function within a tenant context
 * Automatically manages transaction and context setting
 * 
 * @param {number} tenantId - Tenant ID for context
 * @param {function} callback - Async function to execute with tenant context
 * @returns {Promise<any>} Result from callback
 */
export async function runInTenantContext(tenantId, callback) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL app.current_tenant = $1', [tenantId]);
    
    const result = await callback(client);
    
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Clear tenant context
 * Resets the session variable
 * 
 * @param {object} client - Optional PostgreSQL client
 */
export async function clearTenantContext(client = null) {
  const dbClient = client || await pool.connect();
  
  try {
    await dbClient.query('RESET app.current_tenant');
  } finally {
    if (!client) {
      dbClient.release();
    }
  }
}

/**
 * Get current tenant ID from PostgreSQL session
 * 
 * @param {object} client - Optional PostgreSQL client
 * @returns {Promise<number|null>} Current tenant ID or null
 */
export async function getCurrentTenantId(client = null) {
  const dbClient = client || await pool.connect();
  
  try {
    const result = await dbClient.query(
      'SELECT current_setting(\'app.current_tenant\', true) as tenant_id'
    );
    
    const tenantId = result.rows[0]?.tenant_id;
    return tenantId ? parseInt(tenantId, 10) : null;
  } catch (error) {
    return null;
  } finally {
    if (!client) {
      dbClient.release();
    }
  }
}

/**
 * Middleware to automatically set tenant context from request
 * Use this after extractTenant middleware
 */
export function autoSetTenantContext(req, res, next) {
  if (req.tenantId) {
    setTenantContext(req.tenantId)
      .then(() => next())
      .catch(error => {
        console.error('Failed to set tenant context:', error);
        next(error);
      });
  } else {
    next();
  }
}

export default {
  setTenantContext,
  runInTenantContext,
  clearTenantContext,
  getCurrentTenantId,
  autoSetTenantContext
};
