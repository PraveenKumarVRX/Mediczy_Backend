/**
 * Homecare Service - Mediqzy API v1
 */

import BaseService from '../BaseService.js';

class HomecareService extends BaseService {
  constructor() {
    super('api_homecare_bookings');
  }

  async createBooking(tenantId, data) {
    const bookingId = this.generateId('hc');
    
    const result = await this.query(
      `INSERT INTO api_homecare_bookings 
       (booking_id, tenant_id, user_id, service_id, service_date, service_time_slot,
        duration_days, sessions_count, service_address, patient_name, patient_age,
        patient_gender, patient_condition, total_amount, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'pending')
       RETURNING *`,
      [bookingId, tenantId, data.user_id, data.service_id, data.service_date,
       data.service_time_slot, data.duration_days || 1, data.sessions_count || 1,
       JSON.stringify(data.service_address), data.patient_name, data.patient_age,
       data.patient_gender, data.patient_condition, data.total_amount]
    );

    return result.rows[0];
  }

  async getBooking(tenantId, bookingId) {
    return await this.findById(bookingId, tenantId, 'booking_id');
  }

  async listBookings(tenantId, userId, options = {}) {
    return await this.findAll(tenantId, { ...options, where: { user_id: userId } });
  }

  async updateBooking(tenantId, bookingId, updates) {
    return await this.update(bookingId, updates, tenantId, 'booking_id');
  }

  async assignProfessional(tenantId, bookingId, professionalId, professionalName, professionalPhone) {
    return await this.update(bookingId, {
      professional_id: professionalId,
      professional_name: professionalName,
      professional_phone: professionalPhone
    }, tenantId, 'booking_id');
  }

  async listServices(tenantId, options = {}) {
    const { page = 1, limit = 50, category, available = true } = options;
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE tenant_id = $1';
    let params = [tenantId];
    let paramIndex = 2;

    if (category) {
      whereClause += ` AND category = $${paramIndex}`;
      params.push(category);
      paramIndex++;
    }

    if (available !== null) {
      whereClause += ` AND available = $${paramIndex}`;
      params.push(available);
      paramIndex++;
    }

    const result = await this.query(
      `SELECT * FROM api_homecare_services
       ${whereClause}
       ORDER BY name ASC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, limit, offset]
    );

    return result.rows;
  }
}

export default new HomecareService();
