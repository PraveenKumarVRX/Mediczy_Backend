/**
 * Labs Service - Mediqzy API v1
 */

import BaseService from '../BaseService.js';
import { ErrorTypes } from '../../middleware/errorHandler.js';

class LabsService extends BaseService {
  constructor() {
    super('api_lab_bookings');
  }

  async createBooking(tenantId, data) {
    const bookingId = this.generateId('lab');
    
    const result = await this.query(
      `INSERT INTO api_lab_bookings 
       (booking_id, tenant_id, user_id, tests, collection_type, collection_date, 
        collection_time_slot, collection_address, patient_name, patient_age, 
        patient_gender, total_amount, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'pending')
       RETURNING *`,
      [bookingId, tenantId, data.user_id, JSON.stringify(data.tests), 
       data.collection_type, data.collection_date, data.collection_time_slot,
       JSON.stringify(data.collection_address), data.patient_name, 
       data.patient_age, data.patient_gender, data.total_amount]
    );

    return result.rows[0];
  }

  async getBooking(tenantId, bookingId) {
    return await this.findById(bookingId, tenantId, 'booking_id');
  }

  async listBookings(tenantId, userId, options = {}) {
    return await this.findAll(tenantId, { ...options, where: { user_id: userId } });
  }

  async updateStatus(tenantId, bookingId, status, notes = null) {
    const updates = { status };
    if (notes) updates.lab_notes = notes;
    if (status === 'completed') updates.completed_at = new Date();
    if (status === 'cancelled') updates.cancelled_at = new Date();
    
    return await this.update(bookingId, updates, tenantId, 'booking_id');
  }

  async uploadReport(tenantId, bookingId, reportUrl) {
    return await this.update(bookingId, {
      report_url: reportUrl,
      report_uploaded_at: new Date(),
      status: 'completed'
    }, tenantId, 'booking_id');
  }

  async listTests(tenantId, options = {}) {
    const { page = 1, limit = 50, category, search } = options;
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE tenant_id = $1 AND status = $2';
    let params = [tenantId, 'active'];
    let paramIndex = 3;

    if (category) {
      whereClause += ` AND category = $${paramIndex}`;
      params.push(category);
      paramIndex++;
    }

    if (search) {
      whereClause += ` AND (name ILIKE $${paramIndex} OR description ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    const result = await this.query(
      `SELECT * FROM api_lab_tests
       ${whereClause}
       ORDER BY name ASC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, limit, offset]
    );

    return result.rows;
  }
}

export default new LabsService();
