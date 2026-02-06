import BaseService from '../BaseService.js';
import { ErrorTypes } from '../../middleware/errorHandler.js';

class DoctorsService extends BaseService {
  constructor() {
    super('api_doctors');
  }

  /**
   * Create a new doctor profile
   */
  async createDoctor(tenantId, data) {
    const doctorId = this.generateId('doc');
    
    const doctorData = {
      id: doctorId,
      ...data,
      specializations: JSON.stringify(data.specializations || []),
      qualifications: JSON.stringify(data.qualifications || []),
      languages: JSON.stringify(data.languages || []),
      is_available: data.is_available !== undefined ? data.is_available : true,
      consultation_fee: data.consultation_fee || 0,
      rating: 0,
      total_reviews: 0,
      total_consultations: 0
    };

    return await this.create(doctorData, tenantId);
  }

  /**
   * Get a specific doctor profile
   */
  async getDoctor(tenantId, doctorId) {
    const doctor = await this.findById(doctorId, tenantId);
    
    // Parse JSON fields
    return {
      ...doctor,
      specializations: typeof doctor.specializations === 'string' 
        ? JSON.parse(doctor.specializations) 
        : doctor.specializations,
      qualifications: typeof doctor.qualifications === 'string'
        ? JSON.parse(doctor.qualifications)
        : doctor.qualifications,
      languages: typeof doctor.languages === 'string'
        ? JSON.parse(doctor.languages)
        : doctor.languages
    };
  }

  /**
   * List doctors with filters
   */
  async listDoctors(tenantId, options = {}) {
    const { 
      specialization, 
      isAvailable, 
      minRating,
      search,
      sortBy = 'rating',
      sortOrder = 'DESC',
      ...paginationOptions 
    } = options;

    let whereConditions = ['tenant_id = $1', 'deleted_at IS NULL'];
    let params = [tenantId];
    let paramIndex = 2;

    // Filter by specialization
    if (specialization) {
      whereConditions.push(`specializations::text ILIKE $${paramIndex}`);
      params.push(`%${specialization}%`);
      paramIndex++;
    }

    // Filter by availability
    if (isAvailable !== undefined) {
      whereConditions.push(`is_available = $${paramIndex}`);
      params.push(isAvailable);
      paramIndex++;
    }

    // Filter by minimum rating
    if (minRating !== undefined) {
      whereConditions.push(`rating >= $${paramIndex}`);
      params.push(minRating);
      paramIndex++;
    }

    // Search by name or email
    if (search) {
      whereConditions.push(`(name ILIKE $${paramIndex} OR email ILIKE $${paramIndex})`);
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
        specializations: typeof row.specializations === 'string' 
          ? JSON.parse(row.specializations) 
          : row.specializations,
        qualifications: typeof row.qualifications === 'string'
          ? JSON.parse(row.qualifications)
          : row.qualifications,
        languages: typeof row.languages === 'string'
          ? JSON.parse(row.languages)
          : row.languages
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
   * Update doctor profile
   */
  async updateDoctor(tenantId, doctorId, updates) {
    const updateData = { ...updates };

    // Stringify JSON fields if provided
    if (updates.specializations) {
      updateData.specializations = JSON.stringify(updates.specializations);
    }
    if (updates.qualifications) {
      updateData.qualifications = JSON.stringify(updates.qualifications);
    }
    if (updates.languages) {
      updateData.languages = JSON.stringify(updates.languages);
    }

    return await this.update(doctorId, updateData, tenantId);
  }

  /**
   * Set doctor availability schedule
   */
  async setAvailability(tenantId, doctorId, schedule) {
    const updates = {
      availability_schedule: JSON.stringify(schedule),
      is_available: true
    };

    return await this.update(doctorId, updates, tenantId);
  }

  /**
   * Get doctor availability for a specific date
   */
  async getAvailability(tenantId, doctorId, date) {
    const doctor = await this.getDoctor(tenantId, doctorId);

    if (!doctor.is_available) {
      return {
        available: false,
        slots: []
      };
    }

    // Get booked appointments for the date
    const bookedSql = `
      SELECT appointment_time, duration_minutes
      FROM api_appointments
      WHERE tenant_id = $1
        AND doctor_id = $2
        AND appointment_date = $3
        AND status IN ('scheduled', 'confirmed', 'in_progress')
        AND deleted_at IS NULL
    `;

    const bookedResult = await this.query(bookedSql, [tenantId, doctorId, date]);
    const bookedSlots = bookedResult.rows.map(row => row.appointment_time);

    // Parse availability schedule (simplified - would need complex logic)
    const availabilitySchedule = doctor.availability_schedule 
      ? (typeof doctor.availability_schedule === 'string' 
          ? JSON.parse(doctor.availability_schedule) 
          : doctor.availability_schedule)
      : null;

    return {
      available: doctor.is_available,
      schedule: availabilitySchedule,
      bookedSlots,
      date
    };
  }

  /**
   * Increment consultation count
   */
  async incrementConsultations(tenantId, doctorId) {
    const sql = `
      UPDATE ${this.tableName}
      SET total_consultations = total_consultations + 1,
          updated_at = NOW()
      WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
      RETURNING *
    `;

    const result = await this.query(sql, [doctorId, tenantId]);
    if (result.rows.length === 0) {
      throw ErrorTypes.NotFound('Doctor', doctorId);
    }

    return this.sanitize(result.rows[0]);
  }

  /**
   * Update doctor rating
   */
  async updateRating(tenantId, doctorId, newRating) {
    const doctor = await this.getDoctor(tenantId, doctorId);
    
    const totalReviews = doctor.total_reviews + 1;
    const currentTotal = doctor.rating * doctor.total_reviews;
    const newAverage = (currentTotal + newRating) / totalReviews;

    const updates = {
      rating: newAverage,
      total_reviews: totalReviews
    };

    return await this.update(doctorId, updates, tenantId);
  }
}

export default DoctorsService;
