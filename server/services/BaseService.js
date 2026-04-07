/**
 * Base Service Class - Mediqzy API v1
 * Provides common database operations and utilities
 */

import sharedPool from '../db/pgPool.js';
import { ErrorTypes } from '../middleware/errorHandler.js';

export class BaseService {
  constructor(tableName) {
    this.tableName = tableName;
    // Use the process-level singleton pool — NOT a per-instance pool.
    this.pool = sharedPool;
  }

  /**
   * Execute a query with error handling
   */
  async query(sql, params = []) {
    try {
      const result = await this.pool.query(sql, params);
      return result;
    } catch (error) {
      console.error(`Database query error in ${this.tableName}:`, error);
      throw error;
    }
  }

  /**
   * Find one record by ID
   */
  async findById(id, tenantId, idColumn = 'id') {
    const result = await this.query(
      `SELECT * FROM ${this.tableName} WHERE ${idColumn} = $1 AND tenant_id = $2`,
      [id, tenantId]
    );
    
    if (result.rows.length === 0) {
      throw ErrorTypes.NotFound(this.tableName);
    }
    
    return result.rows[0];
  }

  /**
   * Find all records with pagination
   */
  async findAll(tenantId, options = {}) {
    const {
      page = 1,
      limit = 20,
      sortBy = 'created_at',
      sortOrder = 'DESC',
      where = {},
      select = '*'
    } = options;

    // Allowlist to prevent ORDER BY injection
    const ALLOWED_SORT_COLUMNS = ['created_at', 'updated_at', 'id', 'name', 'date', 'status', 'amount', 'booking_date', 'order_date'];
    const ALLOWED_SORT_ORDERS = ['ASC', 'DESC'];
    const safeSortBy = ALLOWED_SORT_COLUMNS.includes(sortBy) ? sortBy : 'created_at';
    const safeSortOrder = ALLOWED_SORT_ORDERS.includes(sortOrder?.toUpperCase()) ? sortOrder.toUpperCase() : 'DESC';

    const offset = (page - 1) * limit;
    const whereClauses = ['tenant_id = $1'];
    const params = [tenantId];
    let paramIndex = 2;

    // Build WHERE clause from options
    Object.entries(where).forEach(([key, value]) => {
      whereClauses.push(`${key} = $${paramIndex}`);
      params.push(value);
      paramIndex++;
    });

    const whereClause = whereClauses.join(' AND ');

    // Get total count
    const countResult = await this.query(
      `SELECT COUNT(*) FROM ${this.tableName} WHERE ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count);

    // Get paginated data
    const dataResult = await this.query(
      `SELECT ${select} FROM ${this.tableName} 
       WHERE ${whereClause}
       ORDER BY ${safeSortBy} ${safeSortOrder}
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, limit, offset]
    );

    return {
      data: dataResult.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1
      }
    };
  }

  /**
   * Create a new record
   */
  async create(data, tenantId) {
    const columns = Object.keys(data);
    const values = Object.values(data);
    const placeholders = values.map((_, i) => `$${i + 2}`);

    const sql = `
      INSERT INTO ${this.tableName} (tenant_id, ${columns.join(', ')})
      VALUES ($1, ${placeholders.join(', ')})
      RETURNING *
    `;

    const result = await this.query(sql, [tenantId, ...values]);
    return result.rows[0];
  }

  /**
   * Update a record
   */
  async update(id, data, tenantId, idColumn = 'id') {
    const columns = Object.keys(data);
    const values = Object.values(data);
    const setClause = columns.map((col, i) => `${col} = $${i + 3}`).join(', ');

    const sql = `
      UPDATE ${this.tableName}
      SET ${setClause}, updated_at = CURRENT_TIMESTAMP
      WHERE ${idColumn} = $1 AND tenant_id = $2
      RETURNING *
    `;

    const result = await this.query(sql, [id, tenantId, ...values]);
    
    if (result.rows.length === 0) {
      throw ErrorTypes.NotFound(this.tableName);
    }
    
    return result.rows[0];
  }

  /**
   * Delete a record (soft delete by setting deleted_at)
   */
  async delete(id, tenantId, idColumn = 'id') {
    const result = await this.query(
      `UPDATE ${this.tableName}
       SET deleted_at = CURRENT_TIMESTAMP
       WHERE ${idColumn} = $1 AND tenant_id = $2 AND deleted_at IS NULL
       RETURNING *`,
      [id, tenantId]
    );
    
    if (result.rows.length === 0) {
      throw ErrorTypes.NotFound(this.tableName);
    }
    
    return result.rows[0];
  }

  /**
   * Hard delete a record
   */
  async hardDelete(id, tenantId, idColumn = 'id') {
    const result = await this.query(
      `DELETE FROM ${this.tableName}
       WHERE ${idColumn} = $1 AND tenant_id = $2
       RETURNING *`,
      [id, tenantId]
    );
    
    if (result.rows.length === 0) {
      throw ErrorTypes.NotFound(this.tableName);
    }
    
    return result.rows[0];
  }

  /**
   * Check if record exists
   */
  async exists(id, tenantId, idColumn = 'id') {
    const result = await this.query(
      `SELECT EXISTS(SELECT 1 FROM ${this.tableName} WHERE ${idColumn} = $1 AND tenant_id = $2)`,
      [id, tenantId]
    );
    return result.rows[0].exists;
  }

  /**
   * Generate unique ID
   */
  generateId(prefix = '') {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 9);
    return prefix ? `${prefix}-${timestamp}-${random}` : `${timestamp}-${random}`;
  }

  /**
   * Sanitize data for JSON response
   */
  sanitize(data, excludeFields = ['deleted_at']) {
    if (!data) return null;
    
    if (Array.isArray(data)) {
      return data.map(item => this.sanitize(item, excludeFields));
    }
    
    const sanitized = { ...data };
    excludeFields.forEach(field => delete sanitized[field]);
    return sanitized;
  }
}

export default BaseService;
