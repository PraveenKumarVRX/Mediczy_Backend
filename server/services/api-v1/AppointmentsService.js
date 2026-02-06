import BaseService from '../BaseService.js';
import { ErrorTypes } from '../../middleware/errorHandler.js';

class AppointmentsService extends BaseService {
  constructor() {
    super('api_appointments');
  }

  /**
   * Create a new appointment
   */
  async createAppointment(tenantId, data) {
    // Check doctor availability first
    const isAvailable = await this.checkAvailability(
      tenantId,
      data.doctor_id,
      data.appointment_date,
      data.appointment_time
    );

    if (!isAvailable) {
      throw ErrorTypes.Conflict('Doctor is not available at the selected time', {
        doctor_id: data.doctor_id,
        appointment_date: data.appointment_date,
        appointment_time: data.appointment_time
      });
    }

    const appointmentId = this.generateId('appt');
    const appointmentData = {
      id: appointmentId,
      ...data,
      status: data.status || 'scheduled',
      duration_minutes: data.duration_minutes || 30
    };

    return await this.create(appointmentData, tenantId);
  }

  /**
   * Get a specific appointment
   */
  async getAppointment(tenantId, appointmentId) {
    return await this.findById(appointmentId, tenantId);
  }

  /**
   * List appointments with filters
   */
  async listAppointments(tenantId, userId, options = {}) {
    const { userType, status, fromDate, toDate, ...paginationOptions } = options;

    let whereConditions = [];
    let params = [tenantId];
    let paramIndex = 2;

    // Filter by user (patient or doctor)
    if (userId && userType === 'patient') {
      whereConditions.push(`user_id = $${paramIndex}`);
      params.push(userId);
      paramIndex++;
    } else if (userId && userType === 'doctor') {
      whereConditions.push(`doctor_id = $${paramIndex}`);
      params.push(userId);
      paramIndex++;
    }

    // Filter by status
    if (status) {
      whereConditions.push(`status = $${paramIndex}`);
      params.push(status);
      paramIndex++;
    }

    // Filter by date range
    if (fromDate) {
      whereConditions.push(`appointment_date >= $${paramIndex}`);
      params.push(fromDate);
      paramIndex++;
    }
    if (toDate) {
      whereConditions.push(`appointment_date <= $${paramIndex}`);
      params.push(toDate);
      paramIndex++;
    }

    whereConditions.push('deleted_at IS NULL');

    const whereClause = whereConditions.join(' AND ');
    const sql = `
      SELECT * FROM ${this.tableName}
      WHERE ${whereClause}
      ORDER BY appointment_date DESC, appointment_time DESC
    `;

    const result = await this.query(sql, params);
    return result.rows.map(row => this.sanitize(row));
  }

  /**
   * Update an appointment
   */
  async updateAppointment(tenantId, appointmentId, updates) {
    // If rescheduling, check availability
    if (updates.appointment_date || updates.appointment_time) {
      const appointment = await this.getAppointment(tenantId, appointmentId);
      
      const newDate = updates.appointment_date || appointment.appointment_date;
      const newTime = updates.appointment_time || appointment.appointment_time;

      const isAvailable = await this.checkAvailability(
        tenantId,
        appointment.doctor_id,
        newDate,
        newTime,
        appointmentId // Exclude current appointment from check
      );

      if (!isAvailable) {
        throw ErrorTypes.Conflict('Doctor is not available at the selected time');
      }
    }

    return await this.update(appointmentId, updates, tenantId);
  }

  /**
   * Cancel an appointment
   */
  async cancelAppointment(tenantId, appointmentId, reason) {
    const updates = {
      status: 'cancelled',
      cancelled_at: new Date(),
      cancellation_reason: reason
    };

    return await this.update(appointmentId, updates, tenantId);
  }

  /**
   * Reschedule an appointment
   */
  async rescheduleAppointment(tenantId, appointmentId, newDateTime) {
    const { appointment_date, appointment_time } = newDateTime;

    return await this.updateAppointment(tenantId, appointmentId, {
      appointment_date,
      appointment_time,
      status: 'rescheduled'
    });
  }

  /**
   * Check if doctor is available at a specific time
   */
  async checkAvailability(tenantId, doctorId, appointmentDate, appointmentTime, excludeAppointmentId = null) {
    let sql = `
      SELECT COUNT(*) as count
      FROM ${this.tableName}
      WHERE tenant_id = $1
        AND doctor_id = $2
        AND appointment_date = $3
        AND appointment_time = $4
        AND status IN ('scheduled', 'confirmed', 'in_progress')
        AND deleted_at IS NULL
    `;

    const params = [tenantId, doctorId, appointmentDate, appointmentTime];

    // Exclude current appointment if rescheduling
    if (excludeAppointmentId) {
      sql += ` AND id != $5`;
      params.push(excludeAppointmentId);
    }

    const result = await this.query(sql, params);
    const count = parseInt(result.rows[0].count);

    return count === 0; // Available if no conflicting appointments
  }

  /**
   * Complete an appointment
   */
  async completeAppointment(tenantId, appointmentId) {
    const updates = {
      status: 'completed',
      completed_at: new Date()
    };

    return await this.update(appointmentId, updates, tenantId);
  }

  /**
   * Mark appointment as in-progress
   */
  async startAppointment(tenantId, appointmentId) {
    const updates = {
      status: 'in_progress',
      started_at: new Date()
    };

    return await this.update(appointmentId, updates, tenantId);
  }
}

export default AppointmentsService;
