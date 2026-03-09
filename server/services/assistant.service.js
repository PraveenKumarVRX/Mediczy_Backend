/**
 * Assistant Service Layer
 * Contains all business logic for assistant operations
 * Separates business logic from controllers (thin controller pattern)
 */

import { getPostgresPool } from '../db/postgres.js';
import bcrypt from 'bcrypt';
import { 
  NotFoundError, 
  UnauthorizedError, 
  ValidationError,
  ConflictError 
} from '../shared/errors/AppError.js';

// Helper to get db pool
const db = {
  query: async (text, params) => {
    const pool = getPostgresPool();
    return pool.query(text, params);
  }
};

class AssistantService {
  
  /**
   * Authenticate assistant
   * @param {string} email 
   * @param {string} password 
   * @param {string} tenantId 
   * @returns {Object} Assistant with token
   */
  async authenticate(email, password, tenantId = 'default') {
    // Find assistant by email
    const result = await db.query(
      `SELECT a.*, CONCAT(d."firstName", ' ', d."lastName") as doctor_name, d.id as doctor_id
       FROM assistants a
       LEFT JOIN doctors d ON a.linked_doctor_id = d.id
       WHERE a.email = $1 AND (a.tenant_id = $2 OR a.tenant_id IS NULL)`,
      [email, tenantId]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Assistant not found');
    }

    const assistant = result.rows[0];

    // FIXED: Use proper bcrypt verification
    const isValidPassword = await this.verifyPassword(password, assistant.password);

    if (!isValidPassword) {
      throw new UnauthorizedError('Invalid credentials');
    }

    // Check if account is active
    if (assistant.status !== 'active') {
      throw new UnauthorizedError('Account is not active');
    }

    // Update last login
    await db.query(
      'UPDATE assistants SET last_login = NOW() WHERE id = $1',
      [assistant.id]
    );

    // Remove sensitive data
    delete assistant.password;

    return {
      assistant,
      permissions: this.parsePermissions(assistant.permissions)
    };
  }

  /**
   * Get assistant profile by ID
   */
  async getProfile(assistantId, tenantId) {
    const result = await db.query(
      `SELECT a.id, a.name, a.email, a.phone, a.role, a.permissions, 
              a.linked_doctor_id, a.status, a.avatar_url, a.created_at,
              CONCAT(d."firstName", ' ', d."lastName") as doctor_name, d.specialization as doctor_specialty
       FROM assistants a
       LEFT JOIN doctors d ON a.linked_doctor_id = d.id
       WHERE a.id = $1 AND (a.tenant_id = $2 OR a.tenant_id IS NULL)`,
      [assistantId, tenantId]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Assistant');
    }

    return result.rows[0];
  }

  /**
   * Update assistant profile
   */
  async updateProfile(assistantId, updates, tenantId) {
    const allowedFields = ['name', 'phone', 'avatar_url'];
    const updateFields = [];
    const values = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key) && value !== undefined) {
        updateFields.push(`${key} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
      }
    }

    if (updateFields.length === 0) {
      throw new ValidationError('No valid fields to update');
    }

    values.push(assistantId, tenantId);

    const result = await db.query(
      `UPDATE assistants 
       SET ${updateFields.join(', ')}, updated_at = NOW()
       WHERE id = $${paramIndex} AND (tenant_id = $${paramIndex + 1} OR tenant_id IS NULL)
       RETURNING id, name, email, phone, avatar_url`,
      values
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Assistant');
    }

    return result.rows[0];
  }

  /**
   * Get dashboard stats for assistant
   */
  async getDashboardStats(assistantId, doctorId, tenantId) {
    const today = new Date().toISOString().split('T')[0];

    // Get appointment counts
    const appointmentStats = await db.query(
      `SELECT 
         COUNT(*) FILTER (WHERE DATE(appointment_date) = $1) as today_appointments,
         COUNT(*) FILTER (WHERE status = 'pending') as pending_appointments,
         COUNT(*) FILTER (WHERE status = 'completed' AND DATE(appointment_date) = $1) as completed_today
       FROM appointments 
       WHERE doctor_id = $2`,
      [today, doctorId]
    );

    // Get patient count
    const patientStats = await db.query(
      `SELECT COUNT(DISTINCT patient_id) as total_patients
       FROM appointments WHERE doctor_id = $1`,
      [doctorId]
    );

    // Get unread messages
    const messageStats = await db.query(
      `SELECT COUNT(*) as unread_messages
       FROM messages 
       WHERE recipient_id = $1 AND is_read = false`,
      [assistantId]
    );

    // Get pending prescriptions
    const prescriptionStats = await db.query(
      `SELECT COUNT(*) as pending_prescriptions
       FROM prescriptions 
       WHERE doctor_id = $1 AND status = 'pending'`,
      [doctorId]
    );

    return {
      todayAppointments: parseInt(appointmentStats.rows[0]?.today_appointments || 0),
      pendingAppointments: parseInt(appointmentStats.rows[0]?.pending_appointments || 0),
      completedToday: parseInt(appointmentStats.rows[0]?.completed_today || 0),
      totalPatients: parseInt(patientStats.rows[0]?.total_patients || 0),
      unreadMessages: parseInt(messageStats.rows[0]?.unread_messages || 0),
      pendingPrescriptions: parseInt(prescriptionStats.rows[0]?.pending_prescriptions || 0)
    };
  }

  /**
   * Get appointments for linked doctor
   */
  async getAppointments(doctorId, { page = 1, limit = 20, status, date, search } = {}) {
    const offset = (page - 1) * limit;
    const conditions = ['a.doctor_id = $1'];
    const values = [doctorId];
    let paramIndex = 2;

    if (status) {
      conditions.push(`a.status = $${paramIndex}`);
      values.push(status);
      paramIndex++;
    }

    if (date) {
      conditions.push(`DATE(a.appointment_date) = $${paramIndex}`);
      values.push(date);
      paramIndex++;
    }

    if (search) {
      conditions.push(`(p.name ILIKE $${paramIndex} OR p.phone ILIKE $${paramIndex})`);
      values.push(`%${search}%`);
      paramIndex++;
    }

    const whereClause = conditions.join(' AND ');

    // Get total count
    const countResult = await db.query(
      `SELECT COUNT(*) FROM appointments a
       LEFT JOIN patients p ON a.patient_id = p.id
       WHERE ${whereClause}`,
      values
    );
    const total = parseInt(countResult.rows[0].count);

    // Get paginated results
    values.push(limit, offset);
    const result = await db.query(
      `SELECT a.*, p.name as patient_name, p.phone as patient_phone, 
              p.email as patient_email, p.avatar_url as patient_avatar
       FROM appointments a
       LEFT JOIN patients p ON a.patient_id = p.id
       WHERE ${whereClause}
       ORDER BY a.appointment_date DESC, a.appointment_time DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      values
    );

    return {
      appointments: result.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Create appointment
   */
  async createAppointment(doctorId, appointmentData, createdBy) {
    const { 
      patientId, 
      appointmentDate, 
      appointmentTime, 
      type = 'consultation',
      notes 
    } = appointmentData;

    // Check for conflicts
    const conflictCheck = await db.query(
      `SELECT id FROM appointments 
       WHERE doctor_id = $1 
       AND DATE(appointment_date) = $2 
       AND appointment_time = $3
       AND status NOT IN ('cancelled', 'completed')`,
      [doctorId, appointmentDate, appointmentTime]
    );

    if (conflictCheck.rows.length > 0) {
      throw new ConflictError('Time slot already booked');
    }

    const result = await db.query(
      `INSERT INTO appointments 
       (doctor_id, patient_id, appointment_date, appointment_time, type, notes, status, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, 'scheduled', $7)
       RETURNING *`,
      [doctorId, patientId, appointmentDate, appointmentTime, type, notes, createdBy]
    );

    return result.rows[0];
  }

  /**
   * Update appointment status
   */
  async updateAppointmentStatus(appointmentId, status, doctorId) {
    const validStatuses = ['scheduled', 'confirmed', 'in-progress', 'completed', 'cancelled', 'no-show'];
    
    if (!validStatuses.includes(status)) {
      throw new ValidationError(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
    }

    const result = await db.query(
      `UPDATE appointments 
       SET status = $1, updated_at = NOW()
       WHERE id = $2 AND doctor_id = $3
       RETURNING *`,
      [status, appointmentId, doctorId]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Appointment');
    }

    return result.rows[0];
  }

  /**
   * Get patients for linked doctor
   */
  async getPatients(doctorId, { page = 1, limit = 20, search } = {}) {
    const offset = (page - 1) * limit;
    let whereClause = 'dp.doctor_id = $1';
    const values = [doctorId];
    let paramIndex = 2;

    if (search) {
      whereClause += ` AND (p.name ILIKE $${paramIndex} OR p.phone ILIKE $${paramIndex} OR p.email ILIKE $${paramIndex})`;
      values.push(`%${search}%`);
      paramIndex++;
    }

    // Get total count
    const countResult = await db.query(
      `SELECT COUNT(DISTINCT p.id) 
       FROM patients p
       INNER JOIN doctor_patients dp ON p.id = dp.patient_id
       WHERE ${whereClause}`,
      values
    );
    const total = parseInt(countResult.rows[0].count);

    // Get paginated results
    values.push(limit, offset);
    const result = await db.query(
      `SELECT DISTINCT p.*, 
              (SELECT MAX(appointment_date) FROM appointments WHERE patient_id = p.id AND doctor_id = $1) as last_visit
       FROM patients p
       INNER JOIN doctor_patients dp ON p.id = dp.patient_id
       WHERE ${whereClause}
       ORDER BY p.name ASC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      values
    );

    return {
      patients: result.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Register new patient
   */
  async registerPatient(patientData, doctorId, createdBy) {
    const { name, email, phone, dateOfBirth, gender, address, bloodGroup, allergies } = patientData;

    // Check if patient exists by email or phone
    const existingPatient = await db.query(
      'SELECT id FROM patients WHERE email = $1 OR phone = $2',
      [email, phone]
    );

    let patientId;

    if (existingPatient.rows.length > 0) {
      // Link existing patient to doctor
      patientId = existingPatient.rows[0].id;
    } else {
      // Create new patient
      const patientResult = await db.query(
        `INSERT INTO patients (name, email, phone, date_of_birth, gender, address, blood_group, allergies, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id`,
        [name, email, phone, dateOfBirth, gender, address, bloodGroup, allergies, createdBy]
      );
      patientId = patientResult.rows[0].id;
    }

    // Link patient to doctor (if not already linked)
    await db.query(
      `INSERT INTO doctor_patients (doctor_id, patient_id, created_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (doctor_id, patient_id) DO NOTHING`,
      [doctorId, patientId]
    );

    // Return full patient data
    const result = await db.query('SELECT * FROM patients WHERE id = $1', [patientId]);
    return result.rows[0];
  }

  /**
   * Get prescriptions for linked doctor
   */
  async getPrescriptions(doctorId, { page = 1, limit = 20, status, patientId } = {}) {
    const offset = (page - 1) * limit;
    const conditions = ['pr.doctor_id = $1'];
    const values = [doctorId];
    let paramIndex = 2;

    if (status) {
      conditions.push(`pr.status = $${paramIndex}`);
      values.push(status);
      paramIndex++;
    }

    if (patientId) {
      conditions.push(`pr.patient_id = $${paramIndex}`);
      values.push(patientId);
      paramIndex++;
    }

    const whereClause = conditions.join(' AND ');

    // Get total
    const countResult = await db.query(
      `SELECT COUNT(*) FROM prescriptions pr WHERE ${whereClause}`,
      values
    );
    const total = parseInt(countResult.rows[0].count);

    // Get paginated results
    values.push(limit, offset);
    const result = await db.query(
      `SELECT pr.*, p.name as patient_name, p.phone as patient_phone
       FROM prescriptions pr
       LEFT JOIN patients p ON pr.patient_id = p.id
       WHERE ${whereClause}
       ORDER BY pr.created_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      values
    );

    return {
      prescriptions: result.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Get billing records
   */
  async getBilling(doctorId, { page = 1, limit = 20, status, startDate, endDate } = {}) {
    const offset = (page - 1) * limit;
    const conditions = ['b.doctor_id = $1'];
    const values = [doctorId];
    let paramIndex = 2;

    if (status) {
      conditions.push(`b.status = $${paramIndex}`);
      values.push(status);
      paramIndex++;
    }

    if (startDate) {
      conditions.push(`DATE(b.created_at) >= $${paramIndex}`);
      values.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      conditions.push(`DATE(b.created_at) <= $${paramIndex}`);
      values.push(endDate);
      paramIndex++;
    }

    const whereClause = conditions.join(' AND ');

    // Get total
    const countResult = await db.query(
      `SELECT COUNT(*) FROM billing b WHERE ${whereClause}`,
      values
    );
    const total = parseInt(countResult.rows[0].count);

    // Get paginated results
    values.push(limit, offset);
    const result = await db.query(
      `SELECT b.*, p.name as patient_name, p.phone as patient_phone
       FROM billing b
       LEFT JOIN patients p ON b.patient_id = p.id
       WHERE ${whereClause}
       ORDER BY b.created_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      values
    );

    // Get summary
    const summaryResult = await db.query(
      `SELECT 
         SUM(amount) FILTER (WHERE status = 'paid') as total_paid,
         SUM(amount) FILTER (WHERE status = 'pending') as total_pending,
         COUNT(*) FILTER (WHERE status = 'paid') as paid_count,
         COUNT(*) FILTER (WHERE status = 'pending') as pending_count
       FROM billing WHERE doctor_id = $1`,
      [doctorId]
    );

    return {
      billing: result.rows,
      summary: {
        totalPaid: parseFloat(summaryResult.rows[0]?.total_paid || 0),
        totalPending: parseFloat(summaryResult.rows[0]?.total_pending || 0),
        paidCount: parseInt(summaryResult.rows[0]?.paid_count || 0),
        pendingCount: parseInt(summaryResult.rows[0]?.pending_count || 0)
      },
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Get messages for assistant
   */
  async getMessages(assistantId, { page = 1, limit = 20, folder = 'inbox' } = {}) {
    const offset = (page - 1) * limit;
    let condition;
    
    switch (folder) {
      case 'sent':
        condition = 'sender_id = $1';
        break;
      case 'inbox':
      default:
        condition = 'recipient_id = $1';
    }

    // Get total
    const countResult = await db.query(
      `SELECT COUNT(*) FROM messages WHERE ${condition}`,
      [assistantId]
    );
    const total = parseInt(countResult.rows[0].count);

    // Get paginated messages
    const result = await db.query(
      `SELECT m.*, 
              s.name as sender_name,
              r.name as recipient_name
       FROM messages m
       LEFT JOIN users s ON m.sender_id = s.id
       LEFT JOIN users r ON m.recipient_id = r.id
       WHERE ${condition}
       ORDER BY m.created_at DESC
       LIMIT $2 OFFSET $3`,
      [assistantId, limit, offset]
    );

    return {
      messages: result.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Get linked doctors
   */
  async getLinkedDoctors(assistantId, tenantId) {
    const result = await db.query(
      `SELECT d.id, CONCAT(d."firstName", ' ', d."lastName") as name, d.email, d.specialization as specialty, d."phoneNumber" as phone, d."profileImage" as avatar_url
       FROM doctors d
       INNER JOIN assistant_doctor_links adl ON d.id = adl.doctor_id
       WHERE adl.assistant_id = $1 AND adl.status = 'active'`,
      [assistantId]
    );

    return result.rows;
  }

  // Helper methods
  
  parsePermissions(permissions) {
    if (Array.isArray(permissions)) return permissions;
    
    if (typeof permissions === 'object' && permissions !== null) {
      return Object.entries(permissions)
        .filter(([_, value]) => value === true)
        .map(([key]) => key);
    }
    
    if (typeof permissions === 'string') {
      try {
        return JSON.parse(permissions);
      } catch {
        return [];
      }
    }
    
    return [];
  }

  async verifyPassword(plainPassword, hashedPassword) {
    // FIXED: Use bcrypt for password verification
    // Handle both bcrypt hashes and plain text (migration period)
    if (!plainPassword || !hashedPassword) {
      return false;
    }
    
    // Check if password is bcrypt hashed
    if (hashedPassword.startsWith('$2a$') || hashedPassword.startsWith('$2b$')) {
      return bcrypt.compare(plainPassword, hashedPassword);
    }
    
    // Fallback for unhashed passwords during migration
    console.warn('⚠️ Unhashed password detected for assistant - migration needed');
    return plainPassword === hashedPassword;
  }
}

// Export singleton instance
export default new AssistantService();
