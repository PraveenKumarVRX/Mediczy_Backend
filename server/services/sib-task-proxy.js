/**
 * SIB Unified Task Proxy
 * =====================
 * 
 * All Node.js routes proxy through SIB Task Router for unified orchestration
 * 
 * This ensures:
 * - Consistent user identification and context
 * - PostgreSQL persistence
 * - Medical NLP processing for all operations
 * - Emergency detection and safety filtering
 * - Audit logging
 * - Conversation history tracking
 */

const axios = require('axios');
const logger = require('../utils/logger');

const SIB_BASE_URL = process.env.SIB_URL || 'http://localhost:8001';
const SIB_TIMEOUT = 30000; // 30 seconds

class SIBTaskProxy {
  constructor() {
    this.client = axios.create({
      baseURL: SIB_BASE_URL,
      timeout: SIB_TIMEOUT,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }

  /**
   * Execute any task through SIB unified router
   * @param {string} taskType - Task type (chat, medical_consult, schedule_appointment, etc)
   * @param {object} payload - Task-specific data
   * @param {string} userId - User ID for context
   * @param {string} patientId - Patient ID for medical records
   * @param {object} context - Additional context
   * @returns {Promise<object>} Task result with status, data, error
   */
  async executeTask(taskType, payload, userId, patientId, context = {}) {
    try {
      logger.info(`📤 SIB Task: ${taskType} for user ${userId}`, {
        taskType,
        userId,
        patientId,
        payloadKeys: Object.keys(payload)
      });

      const response = await this.client.post('/task', {
        task_type: taskType,
        payload,
        user_id: userId,
        patient_id: patientId,
        context
      });

      logger.info(`✅ SIB Task completed: ${taskType}`, {
        status: response.data.status,
        hasError: !!response.data.error
      });

      return response.data;
    } catch (error) {
      logger.error(`❌ SIB Task failed: ${taskType}`, {
        error: error.message,
        taskType,
        userId
      });
      throw error;
    }
  }

  // ==================== Chat & Consultation ====================

  async chat(message, userId, patientId, options = {}) {
    return this.executeTask('chat', {
      message,
      include_risk: options.includeRisk || false,
      include_retrieval: options.includeRetrieval || true,
      ...options
    }, userId, patientId);
  }

  async medicalConsult(symptoms, medicalHistory, userId, patientId, options = {}) {
    return this.executeTask('medical_consult', {
      symptoms,
      medical_history: medicalHistory,
      ...options
    }, userId, patientId, {
      medical_history: medicalHistory,
      symptoms
    });
  }

  // ==================== Medical Records ====================

  async processEHR(filePath, patientId, userId, options = {}) {
    return this.executeTask('process_ehr', {
      file_path: filePath,
      patient_id: patientId,
      ...options
    }, userId, patientId);
  }

  async reviewMedicalRecord(recordData, patientId, userId, options = {}) {
    return this.executeTask('medical_record_review', {
      record_data: recordData,
      patient_id: patientId,
      ...options
    }, userId, patientId);
  }

  // ==================== Appointments ====================

  async scheduleAppointment(doctorId, patientId, preferredTime, reason, userId, options = {}) {
    return this.executeTask('schedule_appointment', {
      doctor_id: doctorId,
      patient_id: patientId,
      preferred_time: preferredTime,
      reason,
      ...options
    }, userId, patientId);
  }

  async rescheduleAppointment(appointmentId, newTime, patientId, userId, options = {}) {
    return this.executeTask('reschedule_appointment', {
      appointment_id: appointmentId,
      new_time: newTime,
      patient_id: patientId,
      ...options
    }, userId, patientId);
  }

  async cancelAppointment(appointmentId, patientId, userId, options = {}) {
    return this.executeTask('cancel_appointment', {
      appointment_id: appointmentId,
      patient_id: patientId,
      ...options
    }, userId, patientId);
  }

  // ==================== Prescriptions ====================

  async generatePrescription(consultationNotes, patientId, userId, options = {}) {
    return this.executeTask('generate_prescription', {
      consultation_notes: consultationNotes,
      patient_id: patientId,
      ...options
    }, userId, patientId);
  }

  async reviewPrescription(prescription, patientId, userId, options = {}) {
    return this.executeTask('review_prescription', {
      prescription,
      patient_id: patientId,
      ...options
    }, userId, patientId);
  }

  // ==================== Notifications ====================

  async sendNotification(message, patientId, userId, notificationType = 'info', channels = ['in-app']) {
    return this.executeTask('send_notification', {
      message,
      patient_id: patientId,
      type: notificationType,
      channels
    }, userId, patientId);
  }

  async sendReminder(message, patientId, userId, reminderTime, reminderType = 'appointment') {
    return this.executeTask('send_reminder', {
      message,
      patient_id: patientId,
      reminder_time: reminderTime,
      reminder_type: reminderType
    }, userId, patientId);
  }

  // ==================== Health Diary ====================

  async addHealthDiaryEntry(entryType, content, patientId, userId, metadata = {}) {
    return this.executeTask('add_health_diary_entry', {
      entry_type: entryType,
      content,
      patient_id: patientId,
      metadata
    }, userId, patientId);
  }

  async updateHealthDiary(entryId, updatedContent, patientId, userId, options = {}) {
    return this.executeTask('update_health_diary', {
      entry_id: entryId,
      updated_content: updatedContent,
      patient_id: patientId,
      ...options
    }, userId, patientId);
  }

  // ==================== Risk Assessment ====================

  async assessRisk(patientData, patientId, userId) {
    return this.executeTask('assess_risk', {
      patient_data: patientData,
      patient_id: patientId
    }, userId, patientId, {
      patient_data: patientData
    });
  }

  async detectEmergency(message, patientId, userId) {
    return this.executeTask('detect_emergency', {
      message,
      patient_id: patientId
    }, userId, patientId, {
      message
    });
  }

  // ==================== Tasks ====================

  async createTask(title, description, patientId, userId, taskType = 'general', metadata = {}) {
    return this.executeTask('create_task', {
      title,
      description,
      patient_id: patientId,
      task_type: taskType,
      metadata
    }, userId, patientId);
  }

  async updateTask(taskId, updates, patientId, userId) {
    return this.executeTask('update_task', {
      task_id: taskId,
      updates,
      patient_id: patientId
    }, userId, patientId);
  }

  async completeTask(taskId, patientId, userId, result = null) {
    return this.executeTask('complete_task', {
      task_id: taskId,
      patient_id: patientId,
      result
    }, userId, patientId);
  }

  /**
   * Health check - verify SIB is available
   */
  async healthCheck() {
    try {
      const response = await this.client.get('/health');
      return response.data;
    } catch (error) {
      logger.error('SIB health check failed', { error: error.message });
      throw error;
    }
  }
}

// Singleton instance
let _instance = null;

function getSIBTaskProxy() {
  if (!_instance) {
    _instance = new SIBTaskProxy();
  }
  return _instance;
}

module.exports = {
  SIBTaskProxy,
  getSIBTaskProxy
};
