import BaseService from '../BaseService.js';
import { ErrorTypes } from '../../middleware/errorHandler.js';

class UsersService extends BaseService {
  constructor() {
    super('api_users');
  }

  /**
   * Create a new user (patient)
   */
  async createUser(tenantId, data) {
    const userId = this.generateId('user');
    
    const userData = {
      id: userId,
      ...data,
      medical_history: JSON.stringify(data.medical_history || {}),
      emergency_contacts: JSON.stringify(data.emergency_contacts || []),
      insurance_details: data.insurance_details ? JSON.stringify(data.insurance_details) : null,
      is_active: data.is_active !== undefined ? data.is_active : true,
      email_verified: data.email_verified || false,
      phone_verified: data.phone_verified || false
    };

    return await this.create(userData, tenantId);
  }

  /**
   * Get a specific user profile
   */
  async getUser(tenantId, userId) {
    const user = await this.findById(userId, tenantId);
    
    // Parse JSON fields
    return {
      ...user,
      medical_history: typeof user.medical_history === 'string'
        ? JSON.parse(user.medical_history)
        : user.medical_history,
      emergency_contacts: typeof user.emergency_contacts === 'string'
        ? JSON.parse(user.emergency_contacts)
        : user.emergency_contacts,
      insurance_details: user.insurance_details 
        ? (typeof user.insurance_details === 'string'
            ? JSON.parse(user.insurance_details)
            : user.insurance_details)
        : null
    };
  }

  /**
   * List users with filters
   */
  async listUsers(tenantId, options = {}) {
    const { 
      isActive, 
      search,
      abhaId,
      sortBy = 'created_at',
      sortOrder = 'DESC',
      ...paginationOptions 
    } = options;

    let whereConditions = ['tenant_id = $1', 'deleted_at IS NULL'];
    let params = [tenantId];
    let paramIndex = 2;

    // Filter by active status
    if (isActive !== undefined) {
      whereConditions.push(`is_active = $${paramIndex}`);
      params.push(isActive);
      paramIndex++;
    }

    // Filter by ABHA ID
    if (abhaId) {
      whereConditions.push(`abha_id = $${paramIndex}`);
      params.push(abhaId);
      paramIndex++;
    }

    // Search by name, email, or phone
    if (search) {
      whereConditions.push(`(name ILIKE $${paramIndex} OR email ILIKE $${paramIndex} OR phone ILIKE $${paramIndex})`);
      params.push(`%${search}%`);
      paramIndex++;
    }

    const whereClause = whereConditions.join(' AND ');
    
    const page = paginationOptions.page || 1;
    const limit = paginationOptions.limit || 20;
    const offset = (page - 1) * limit;

    const sql = `
      SELECT * FROM ${this.tableName}
      WHERE ${whereClause}
      ORDER BY ${sortBy} ${sortOrder}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    params.push(limit, offset);

    const countSql = `SELECT COUNT(*) as total FROM ${this.tableName} WHERE ${whereClause}`;
    const countParams = params.slice(0, paramIndex - 1);

    const [dataResult, countResult] = await Promise.all([
      this.query(sql, params),
      this.query(countSql, countParams)
    ]);

    const total = parseInt(countResult.rows[0].total);
    const totalPages = Math.ceil(total / limit);

    return {
      data: dataResult.rows.map(row => ({
        ...this.sanitize(row),
        medical_history: typeof row.medical_history === 'string'
          ? JSON.parse(row.medical_history)
          : row.medical_history,
        emergency_contacts: typeof row.emergency_contacts === 'string'
          ? JSON.parse(row.emergency_contacts)
          : row.emergency_contacts,
        insurance_details: row.insurance_details
          ? (typeof row.insurance_details === 'string'
              ? JSON.parse(row.insurance_details)
              : row.insurance_details)
          : null
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    };
  }

  /**
   * Update user profile
   */
  async updateUser(tenantId, userId, updates) {
    const updateData = { ...updates };

    // Stringify JSON fields if provided
    if (updates.medical_history) {
      updateData.medical_history = JSON.stringify(updates.medical_history);
    }
    if (updates.emergency_contacts) {
      updateData.emergency_contacts = JSON.stringify(updates.emergency_contacts);
    }
    if (updates.insurance_details) {
      updateData.insurance_details = JSON.stringify(updates.insurance_details);
    }

    return await this.update(userId, updateData, tenantId);
  }

  /**
   * Update user's medical history
   */
  async updateMedicalHistory(tenantId, userId, history) {
    // Get current medical history
    const user = await this.getUser(tenantId, userId);
    
    // Merge with existing history
    const updatedHistory = {
      ...user.medical_history,
      ...history,
      last_updated: new Date().toISOString()
    };

    return await this.updateUser(tenantId, userId, {
      medical_history: updatedHistory
    });
  }

  /**
   * Get user's medical history
   */
  async getMedicalHistory(tenantId, userId) {
    const user = await this.getUser(tenantId, userId);
    return user.medical_history || {};
  }

  /**
   * Link ABHA ID to user
   */
  async linkAbhaId(tenantId, userId, abhaId, phrAddress) {
    // Check if ABHA ID is already linked to another user
    const existingSql = `
      SELECT id FROM ${this.tableName}
      WHERE tenant_id = $1 AND abha_id = $2 AND id != $3 AND deleted_at IS NULL
    `;
    const existingResult = await this.query(existingSql, [tenantId, abhaId, userId]);

    if (existingResult.rows.length > 0) {
      throw ErrorTypes.Conflict('ABHA ID is already linked to another user', {
        abha_id: abhaId
      });
    }

    const updates = {
      abha_id: abhaId,
      phr_address: phrAddress
    };

    return await this.update(userId, updates, tenantId);
  }

  /**
   * Verify user email
   */
  async verifyEmail(tenantId, userId) {
    const updates = {
      email_verified: true,
      email_verified_at: new Date()
    };

    return await this.update(userId, updates, tenantId);
  }

  /**
   * Verify user phone
   */
  async verifyPhone(tenantId, userId) {
    const updates = {
      phone_verified: true,
      phone_verified_at: new Date()
    };

    return await this.update(userId, updates, tenantId);
  }

  /**
   * Deactivate user account
   */
  async deactivateUser(tenantId, userId) {
    const updates = {
      is_active: false,
      deactivated_at: new Date()
    };

    return await this.update(userId, updates, tenantId);
  }

  /**
   * Reactivate user account
   */
  async reactivateUser(tenantId, userId) {
    const updates = {
      is_active: true,
      deactivated_at: null
    };

    return await this.update(userId, updates, tenantId);
  }
}

export default UsersService;
