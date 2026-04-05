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

    const countResult = await this.query(
      `SELECT COUNT(*) FROM api_lab_tests ${whereClause}`,
      params
    );

    const result = await this.query(
      `SELECT * FROM api_lab_tests
       ${whereClause}
       ORDER BY name ASC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, limit, offset]
    );

    const total = parseInt(countResult.rows[0].count);
    return {
      data: result.rows,
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

  async getTest(tenantId, testId) {
    const result = await this.query(
      `SELECT * FROM api_lab_tests WHERE test_id = $1 AND tenant_id = $2 AND status = 'active'`,
      [testId, tenantId]
    );
    if (result.rows.length === 0) {
      throw ErrorTypes.NotFound('Lab test');
    }
    return result.rows[0];
  }

  async listCategories(tenantId) {
    const result = await this.query(
      `SELECT DISTINCT category, COUNT(*) AS test_count
       FROM api_lab_tests
       WHERE tenant_id = $1 AND status = 'active' AND category IS NOT NULL
       GROUP BY category
       ORDER BY category ASC`,
      [tenantId]
    );
    return result.rows;
  }

  async listPartners(tenantId, options = {}) {
    const { page = 1, limit = 20, city, homeCollection } = options;
    const offset = (page - 1) * limit;

    let where = `WHERE tenant_id = $1 AND status = 'active'`;
    const params = [tenantId];
    let pi = 2;

    if (city) {
      where += ` AND address->>'city' ILIKE $${pi}`;
      params.push(`%${city}%`);
      pi++;
    }

    if (homeCollection !== undefined) {
      where += ` AND home_collection = $${pi}`;
      params.push(homeCollection === true || homeCollection === 'true');
      pi++;
    }

    const countResult = await this.query(
      `SELECT COUNT(*) FROM api_lab_partners ${where}`, params
    );

    const result = await this.query(
      `SELECT * FROM api_lab_partners ${where}
       ORDER BY name ASC
       LIMIT $${pi} OFFSET $${pi + 1}`,
      [...params, limit, offset]
    );

    const total = parseInt(countResult.rows[0].count);
    return {
      data: result.rows,
      pagination: {
        page, limit, total,
        totalPages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1
      }
    };
  }

  async getSlots(tenantId, { date, collectionType = 'home-collection', partnerId } = {}) {
    // Default time slots if no partner-specific configuration is found
    const defaultSlots = [
      { slot_id: 'slot-1', label: '07:00 AM – 09:00 AM', start_time: '07:00', end_time: '09:00' },
      { slot_id: 'slot-2', label: '09:00 AM – 11:00 AM', start_time: '09:00', end_time: '11:00' },
      { slot_id: 'slot-3', label: '11:00 AM – 01:00 PM', start_time: '11:00', end_time: '13:00' },
      { slot_id: 'slot-4', label: '01:00 PM – 03:00 PM', start_time: '13:00', end_time: '15:00' },
      { slot_id: 'slot-5', label: '04:00 PM – 06:00 PM', start_time: '16:00', end_time: '18:00' }
    ];

    if (partnerId) {
      const partnerResult = await this.query(
        `SELECT pickup_slots, home_collection, lab_visit
         FROM api_lab_partners
         WHERE partner_id = $1 AND tenant_id = $2 AND status = 'active'`,
        [partnerId, tenantId]
      );
      if (partnerResult.rows.length > 0) {
        const partner = partnerResult.rows[0];
        const slots = partner.pickup_slots || [];
        if (slots.length > 0) {
          return {
            date: date || new Date().toISOString().split('T')[0],
            collection_type: collectionType,
            partner_id: partnerId,
            slots
          };
        }
      }
    }

    return {
      date: date || new Date().toISOString().split('T')[0],
      collection_type: collectionType,
      partner_id: partnerId || null,
      slots: collectionType === 'home-collection'
        ? defaultSlots
        : defaultSlots.slice(0, 3) // fewer slots for lab-visit
    };
  }

  async cancelBooking(tenantId, bookingId, reason = null) {
    const booking = await this.findById(bookingId, tenantId, 'booking_id');

    if (['completed', 'cancelled'].includes(booking.status)) {
      throw ErrorTypes.BadRequest(`Cannot cancel a booking that is already ${booking.status}`);
    }

    return await this.update(bookingId, {
      status: 'cancelled',
      cancelled_at: new Date(),
      cancellation_reason: reason
    }, tenantId, 'booking_id');
  }

  async getReport(tenantId, bookingId) {
    const booking = await this.findById(bookingId, tenantId, 'booking_id');
    if (!booking.report_url) {
      throw ErrorTypes.NotFound('Report (not yet uploaded)');
    }
    return {
      booking_id: booking.booking_id,
      patient_name: booking.patient_name,
      report_url: booking.report_url,
      report_uploaded_at: booking.report_uploaded_at,
      tests: booking.tests,
      status: booking.status
    };
  }

  async initiatePayment(tenantId, bookingId, paymentData) {
    const booking = await this.findById(bookingId, tenantId, 'booking_id');

    if (booking.payment_status === 'paid') {
      throw ErrorTypes.BadRequest('Booking is already paid');
    }

    const paymentId = this.generateId('pay');
    return await this.update(bookingId, {
      payment_id: paymentId,
      payment_status: 'initiated',
      payment_initiated_at: new Date()
    }, tenantId, 'booking_id');
  }
}

export default new LabsService();
