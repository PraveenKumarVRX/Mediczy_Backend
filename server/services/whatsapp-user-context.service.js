/**
 * WhatsApp User Context Service
 * 
 * Identifies WhatsApp users from phone number, retrieves their complete history,
 * and provides context for intelligent AI conversations.
 */

import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import { Op } from 'sequelize';
import Redis from 'ioredis';

// Initialize Redis for caching user context
const redis = new Redis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: process.env.REDIS_PORT || 6379,
  maxRetriesPerRequest: 3,
  retryDelayOnFailover: 100,
  lazyConnect: true
});

redis.on('error', (err) => {
  console.error('WhatsApp Context Redis Error:', err.message);
});

class WhatsAppUserContextService {
  constructor() {
    this.contextCacheTTL = 300; // 5 minutes cache
    this.conversationCacheTTL = 3600; // 1 hour for conversation history
  }

  /**
   * Normalize phone number for database lookup
   * Handles various formats: +91XXXXXXXXXX, 91XXXXXXXXXX, XXXXXXXXXX
   */
  normalizePhoneNumber(phone) {
    if (!phone) return null;
    
    // Remove whatsapp: prefix if present
    let normalized = phone.replace('whatsapp:', '').trim();
    
    // Remove all non-digit characters except leading +
    normalized = normalized.replace(/[^\d+]/g, '');
    
    // Store variations for lookup
    const variations = new Set();
    
    // Original
    variations.add(normalized);
    
    // Without + prefix
    if (normalized.startsWith('+')) {
      variations.add(normalized.substring(1));
    }
    
    // With + prefix
    if (!normalized.startsWith('+')) {
      variations.add('+' + normalized);
    }
    
    // For Indian numbers, handle 91 prefix variations
    if (normalized.startsWith('+91')) {
      variations.add(normalized.substring(3)); // Remove +91
      variations.add('0' + normalized.substring(3)); // Add 0 prefix
    } else if (normalized.startsWith('91') && normalized.length === 12) {
      variations.add('+' + normalized);
      variations.add(normalized.substring(2));
      variations.add('0' + normalized.substring(2));
    } else if (normalized.length === 10 && !normalized.startsWith('0')) {
      variations.add('+91' + normalized);
      variations.add('91' + normalized);
      variations.add('0' + normalized);
    }
    
    return Array.from(variations);
  }

  /**
   * Find user by phone number in database
   */
  async findUserByPhone(phoneNumber) {
    const cacheKey = `whatsapp:user:${phoneNumber}`;
    
    try {
      // Check cache first
      const cached = await redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (e) {
      // Redis error, continue without cache
    }
    
    const phoneVariations = this.normalizePhoneNumber(phoneNumber);
    if (!phoneVariations || phoneVariations.length === 0) return null;
    
    try {
      // Import models dynamically to avoid circular dependencies
      const User = (await import('../models/postgres/user.model.postgres.js')).default;
      
      // Search for user with any phone variation
      const user = await User.findOne({
        where: {
          phoneNumber: {
            [Op.in]: phoneVariations
          }
        },
        attributes: [
          'id', 'unique_id', 'firstName', 'lastName', 'email', 'phoneNumber',
          'dateOfBirth', 'gender', 'address_city', 'address_state',
          'bloodType', 'isVerified', 'createdAt'
        ]
      });
      
      if (user) {
        const userData = user.toJSON();
        // Cache for quick lookup
        try {
          await redis.setex(cacheKey, this.contextCacheTTL, JSON.stringify(userData));
        } catch (e) { /* ignore cache errors */ }
        return userData;
      }
      
      return null;
    } catch (error) {
      console.error('Error finding user by phone:', error.message);
      return null;
    }
  }

  /**
   * Find user by ID in database
   */
  async findUserById(userId) {
    if (!userId) return null;
    const cacheKey = `whatsapp:userId:${userId}`;

    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (e) {
      // ignore cache errors
    }

    try {
      const User = (await import('../models/postgres/user.model.postgres.js')).default;

      const user = await User.findOne({
        where: { id: userId },
        attributes: [
          'id', 'unique_id', 'firstName', 'lastName', 'email', 'phoneNumber',
          'dateOfBirth', 'gender', 'address_city', 'address_state',
          'bloodType', 'isVerified', 'createdAt'
        ]
      });

      if (user) {
        const userData = user.toJSON();
        try {
          await redis.setex(cacheKey, this.contextCacheTTL, JSON.stringify(userData));
        } catch (e) { /* ignore */ }
        return userData;
      }

      return null;
    } catch (error) {
      console.error('Error finding user by ID:', error.message);
      return null;
    }
  }

  /**
   * Get user's appointment history
   */
  async getUserAppointments(userId, limit = 5) {
    try {
      const Appointment = (await import('../models/postgres/appointment.model.postgres.js')).default;
      
      const appointments = await Appointment.findAll({
        where: { userId },
        order: [['appointmentDate', 'DESC'], ['appointmentTime', 'DESC']],
        limit,
        attributes: [
          'id', 'doctorName', 'specialization', 'appointmentDate', 'appointmentTime',
          'status', 'consultationType', 'reason', 'diagnosis', 'createdAt'
        ]
      });
      
      return appointments.map(a => a.toJSON());
    } catch (error) {
      console.error('Error fetching appointments:', error.message);
      return [];
    }
  }

  /**
   * Get user's prescription history
   */
  async getUserPrescriptions(userId, limit = 5) {
    try {
      const Prescription = (await import('../models/postgres/prescription.model.postgres.js')).default;
      
      const prescriptions = await Prescription.findAll({
        where: { patientId: userId },
        order: [['createdAt', 'DESC']],
        limit,
        attributes: [
          'id', 'prescriptionNumber', 'doctorName', 'diagnosis', 'medications',
          'instructions', 'followUpDate', 'status', 'createdAt'
        ]
      });
      
      return prescriptions.map(p => p.toJSON());
    } catch (error) {
      console.error('Error fetching prescriptions:', error.message);
      return [];
    }
  }

  /**
   * Get user's health reports/lab results
   */
  async getUserHealthReports(userId, limit = 5) {
    try {
      const HealthReport = (await import('../models/postgres/health-report.model.postgres.js')).default;
      
      const reports = await HealthReport.findAll({
        where: { userId },
        order: [['reportDate', 'DESC']],
        limit,
        attributes: [
          'id', 'reportType', 'reportName', 'labName', 'reportDate',
          'findings', 'status', 'isAbnormal'
        ]
      });
      
      return reports.map(r => r.toJSON());
    } catch (error) {
      // Model might not exist, return empty
      return [];
    }
  }

  /**
   * Get user's active medications from recent prescriptions
   */
  async getActiveMedications(userId) {
    try {
      const Prescription = (await import('../models/postgres/prescription.model.postgres.js')).default;
      
      // Get prescriptions from last 30 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const recentPrescriptions = await Prescription.findAll({
        where: {
          patientId: userId,
          createdAt: { [Op.gte]: thirtyDaysAgo },
          status: { [Op.ne]: 'cancelled' }
        },
        attributes: ['medications', 'createdAt']
      });
      
      // Extract all medications
      const medications = [];
      recentPrescriptions.forEach(p => {
        if (p.medications) {
          if (Array.isArray(p.medications)) {
            medications.push(...p.medications);
          } else if (typeof p.medications === 'object') {
            medications.push(p.medications);
          }
        }
      });
      
      return medications;
    } catch (error) {
      console.error('Error fetching medications:', error.message);
      return [];
    }
  }

  /**
   * Get upcoming appointments for user
   */
  async getUpcomingAppointments(userId) {
    try {
      const Appointment = (await import('../models/postgres/appointment.model.postgres.js')).default;
      
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const upcoming = await Appointment.findAll({
        where: {
          userId,
          appointmentDate: { [Op.gte]: today },
          status: { [Op.in]: ['scheduled', 'confirmed', 'pending'] }
        },
        order: [['appointmentDate', 'ASC'], ['appointmentTime', 'ASC']],
        limit: 3,
        attributes: [
          'id', 'doctorName', 'specialization', 'appointmentDate', 'appointmentTime',
          'consultationType', 'status'
        ]
      });
      
      return upcoming.map(a => a.toJSON());
    } catch (error) {
      console.error('Error fetching upcoming appointments:', error.message);
      return [];
    }
  }

  /**
   * Get conversation history for this WhatsApp number
   */
  async getConversationHistory(phoneNumber, limit = 10) {
    const cacheKey = `whatsapp:conversation:${phoneNumber}`;
    
    try {
      const cached = await redis.lrange(cacheKey, 0, limit - 1);
      if (cached && cached.length > 0) {
        return cached.map(c => JSON.parse(c));
      }
    } catch (e) {
      // Redis error, return empty
    }
    
    return [];
  }

  /**
   * Add message to conversation history
   */
  async addToConversationHistory(phoneNumber, message) {
    const cacheKey = `whatsapp:conversation:${phoneNumber}`;
    
    try {
      const messageData = {
        ...message,
        timestamp: new Date().toISOString()
      };
      
      await redis.lpush(cacheKey, JSON.stringify(messageData));
      await redis.ltrim(cacheKey, 0, 49); // Keep last 50 messages
      await redis.expire(cacheKey, this.conversationCacheTTL);
    } catch (e) {
      console.error('Error saving conversation history:', e.message);
    }
  }

  /**
   * Get complete user context for AI conversation
   */
  async getFullUserContext(phoneNumber) {
    const cacheKey = `whatsapp:fullcontext:${phoneNumber}`;
    
    try {
      // Check cache first
      const cached = await redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (e) { /* ignore */ }
    
    // Find user
    const user = await this.findUserByPhone(phoneNumber);
    
    if (!user) {
      return {
        isKnownUser: false,
        phoneNumber,
        user: null,
        summary: `New user. Phone: ${phoneNumber}. No history available.`
      };
    }
    
    // Fetch all related data in parallel
    const [
      appointments,
      prescriptions,
      upcomingAppointments,
      activeMedications,
      conversationHistory
    ] = await Promise.all([
      this.getUserAppointments(user.id),
      this.getUserPrescriptions(user.id),
      this.getUpcomingAppointments(user.id),
      this.getActiveMedications(user.id),
      this.getConversationHistory(phoneNumber)
    ]);
    
    // Build context summary for AI
    const context = {
      isKnownUser: true,
      phoneNumber,
      user: {
        id: user.id,
        uniqueId: user.unique_id,
        name: `${user.firstName} ${user.lastName}`.trim(),
        firstName: user.firstName,
        email: user.email,
        gender: user.gender,
        age: user.dateOfBirth ? this.calculateAge(user.dateOfBirth) : null,
        bloodGroup: user.bloodGroup,
        city: user.address_city,
        memberSince: user.createdAt
      },
      appointments: {
        recent: appointments,
        upcoming: upcomingAppointments,
        totalCount: appointments.length
      },
      prescriptions: {
        recent: prescriptions,
        totalCount: prescriptions.length
      },
      activeMedications,
      conversationHistory,
      summary: this.buildContextSummary(user, appointments, prescriptions, upcomingAppointments, activeMedications)
    };
    
    // Cache the context
    try {
      await redis.setex(cacheKey, this.contextCacheTTL, JSON.stringify(context));
    } catch (e) { /* ignore */ }
    
    return context;
  }

  /**
   * Get complete user context by user ID (for in-app chat)
   */
  async getFullUserContextByUserId(userId) {
    if (!userId) {
      return {
        isKnownUser: false,
        user: null,
        summary: 'No user ID provided.'
      };
    }

    const cacheKey = `whatsapp:fullcontext:user:${userId}`;

    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (e) { /* ignore */ }

    const user = await this.findUserById(userId);

    if (!user) {
      return {
        isKnownUser: false,
        user: null,
        summary: `User ${userId} not found.`
      };
    }

    const [
      appointments,
      prescriptions,
      upcomingAppointments,
      activeMedications
    ] = await Promise.all([
      this.getUserAppointments(user.id),
      this.getUserPrescriptions(user.id),
      this.getUpcomingAppointments(user.id),
      this.getActiveMedications(user.id)
    ]);

    const context = {
      isKnownUser: true,
      userId: user.id,
      phoneNumber: user.phoneNumber || null,
      user: {
        id: user.id,
        uniqueId: user.unique_id,
        name: `${user.firstName} ${user.lastName}`.trim(),
        firstName: user.firstName,
        email: user.email,
        gender: user.gender,
        age: user.dateOfBirth ? this.calculateAge(user.dateOfBirth) : null,
        bloodGroup: user.bloodGroup,
        city: user.address_city,
        memberSince: user.createdAt
      },
      appointments: {
        recent: appointments,
        upcoming: upcomingAppointments,
        totalCount: appointments.length
      },
      prescriptions: {
        recent: prescriptions,
        totalCount: prescriptions.length
      },
      activeMedications,
      conversationHistory: [],
      summary: this.buildContextSummary(user, appointments, prescriptions, upcomingAppointments, activeMedications)
    };

    try {
      await redis.setex(cacheKey, this.contextCacheTTL, JSON.stringify(context));
    } catch (e) { /* ignore */ }

    return context;
  }

  /**
   * Calculate age from date of birth
   */
  calculateAge(dateOfBirth) {
    const today = new Date();
    const birthDate = new Date(dateOfBirth);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  }

  /**
   * Build a natural language summary for AI context
   */
  buildContextSummary(user, appointments, prescriptions, upcomingAppointments, activeMedications) {
    const parts = [];
    
    // User identity
    parts.push(`Patient: ${user.firstName} ${user.lastName}`);
    if (user.dateOfBirth) {
      parts.push(`Age: ${this.calculateAge(user.dateOfBirth)} years`);
    }
    if (user.gender) {
      parts.push(`Gender: ${user.gender}`);
    }
    if (user.bloodGroup) {
      parts.push(`Blood Group: ${user.bloodGroup}`);
    }
    
    // Upcoming appointments
    if (upcomingAppointments.length > 0) {
      const next = upcomingAppointments[0];
      parts.push(`\nUpcoming appointment: ${next.doctorName} (${next.specialization || 'General'}) on ${next.appointmentDate} at ${next.appointmentTime}`);
    }
    
    // Recent consultations
    if (appointments.length > 0) {
      const last = appointments[0];
      parts.push(`\nLast consultation: ${last.doctorName} on ${last.appointmentDate}`);
      if (last.diagnosis) {
        parts.push(`Diagnosis: ${last.diagnosis}`);
      }
    }
    
    // Active medications
    if (activeMedications.length > 0) {
      const medNames = activeMedications
        .slice(0, 3)
        .map(m => m.name || m.medicineName || (typeof m === 'string' ? m : 'Unknown'))
        .join(', ');
      parts.push(`\nActive medications: ${medNames}${activeMedications.length > 3 ? ` (+${activeMedications.length - 3} more)` : ''}`);
    }
    
    // History stats
    parts.push(`\nHistory: ${appointments.length} past appointments, ${prescriptions.length} prescriptions`);
    
    return parts.join('\n');
  }

  /**
   * Clear user context cache (call after updates)
   */
  async clearUserCache(phoneNumber) {
    const phoneVariations = this.normalizePhoneNumber(phoneNumber);
    
    try {
      for (const phone of phoneVariations) {
        await redis.del(`whatsapp:user:${phone}`);
        await redis.del(`whatsapp:fullcontext:${phone}`);
      }
    } catch (e) {
      console.error('Error clearing cache:', e.message);
    }
  }
}

// Export singleton instance
const whatsAppUserContextService = new WhatsAppUserContextService();
export default whatsAppUserContextService;
export { WhatsAppUserContextService };
