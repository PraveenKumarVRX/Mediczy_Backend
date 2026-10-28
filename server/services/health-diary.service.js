/**
 * Comprehensive Health Diary Service
 * Automatically logs ALL health events to user's health diary
 * with precise timestamps (year-month-day-hour-minute-second)
 */

import { HealthDiary } from '../models/postgres/ehr.model.postgres.js';
import { Op } from 'sequelize';

class HealthDiaryService {
  /**
   * Log a health event to user's diary
   * @param {Object} event - Health event details
   * @returns {Promise<Object>} Created diary entry
   */
  async logHealthEvent(event) {
    try {
      const {
        userId,
        entryType,
        title,
        description,
        data = {},
        linkedRecordId = null,
        linkedRecordType = null,
        timestamp = new Date()
      } = event;

      if (!userId || !entryType) {
        throw new Error('userId and entryType are required');
      }

      const diaryEntry = await HealthDiary.create({
        userId,
        entryDate: timestamp, // Precise timestamp
        entryType,
        title,
        description,
        data: {
          ...data,
          eventTimestamp: timestamp.toISOString(),
          loggedAt: new Date().toISOString()
        },
        linkedRecordId,
        linkedRecordType
      });

      console.log(`📝 Health diary: Logged ${entryType} for user ${userId} at ${timestamp.toISOString()}`);
      return diaryEntry;
    } catch (error) {
      console.error('❌ Failed to log health event:', error);
      // Don't throw - health diary logging should not break main functionality
      return null;
    }
  }

  /**
   * Log AI consultation
   */
  async logAIConsultation(userId, query, response, metadata = {}) {
    return this.logHealthEvent({
      userId,
      entryType: 'ai_consultation',
      title: 'AI Consultation with Dr. iSHA',
      description: query,
      data: {
        consultationType: 'ai_chat',
        userMessage: query,
        aiResponse: response,
        ...metadata
      }
    });
  }

  /**
   * Log consultation/appointment
   */
  async logConsultation(userId, appointment, metadata = {}) {
    return this.logHealthEvent({
      userId,
      entryType: 'consultation',
      title: `Consultation with Dr. ${String(appointment.doctorName || 'Doctor').replace(/^(?:Dr\.?\s*)+/i, '')}`,
      description: `${appointment.consultationType || 'Medical'} consultation`,
      data: {
        appointmentId: appointment.id,
        doctorId: appointment.doctorId,
        doctorName: appointment.doctorName,
        consultationType: appointment.consultationType,
        status: appointment.status,
        scheduledTime: appointment.scheduledTime,
        duration: appointment.duration,
        ...metadata
      },
      linkedRecordId: appointment.id,
      linkedRecordType: 'appointment',
      timestamp: appointment.scheduledTime || new Date()
    });
  }

  /**
   * Log vital signs/health metrics
   */
  async logVitalSign(userId, vitalData, source = 'manual') {
    const vitalType = Object.keys(vitalData).filter(k => k !== 'timestamp')[0];
    const vitalValue = vitalData[vitalType];

    return this.logHealthEvent({
      userId,
      entryType: source === 'device' ? 'device_reading' : 'vital',
      title: `${this.formatVitalName(vitalType)}: ${vitalValue}`,
      description: `Recorded via ${source}`,
      data: {
        vitalType,
        vitalValue,
        unit: this.getVitalUnit(vitalType),
        source,
        allVitals: vitalData,
        deviceInfo: vitalData.deviceInfo || null
      },
      timestamp: vitalData.timestamp || new Date()
    });
  }

  /**
   * Log medication
   */
  async logMedication(userId, medication, action = 'prescribed') {
    return this.logHealthEvent({
      userId,
      entryType: 'medication',
      title: `${medication.name} ${action}`,
      description: [medication.dosage, medication.frequency].filter(Boolean).join(' - ') || 'Dose timing not specified',
      data: {
        medicationId: medication.id,
        medicationName: medication.name,
        dosage: medication.dosage,
        frequency: medication.frequency,
        duration: medication.duration,
        action, // prescribed, taken, missed, stopped
        prescribedBy: medication.doctorName,
        ...medication
      },
      linkedRecordId: medication.prescriptionId,
      linkedRecordType: 'prescription'
    });
  }

  /**
   * Log lab test
   */
  async logLabTest(userId, labTest, metadata = {}) {
    return this.logHealthEvent({
      userId,
      entryType: labTest.results ? 'lab_result' : 'lab_test',
      title: labTest.testName || 'Lab Test',
      description: labTest.results ? 'Results received' : 'Test ordered',
      data: {
        labTestId: labTest.id,
        testName: labTest.testName,
        testType: labTest.testType,
        orderedBy: labTest.doctorName,
        results: labTest.results,
        normalRange: labTest.normalRange,
        status: labTest.status,
        labName: labTest.labName,
        ...metadata
      },
      linkedRecordId: labTest.id,
      linkedRecordType: 'lab_test',
      timestamp: labTest.resultDate || labTest.orderedDate || new Date()
    });
  }

  /**
   * Log prescription
   */
  async logPrescription(userId, prescription, metadata = {}) {
    if (prescription.status === 'draft' || !prescription.medications?.length) return null;
    return this.logHealthEvent({
      userId,
      entryType: 'prescription',
      title: `Prescription by Dr. ${prescription.doctorName || 'Doctor'}`,
      description: `${prescription.medications?.length || 0} medications prescribed`,
      data: {
        prescriptionId: prescription.id,
        doctorId: prescription.doctorId,
        doctorName: prescription.doctorName,
        medications: prescription.medications,
        diagnosis: prescription.diagnosis,
        notes: prescription.notes,
        ...metadata
      },
      linkedRecordId: prescription.id,
      linkedRecordType: 'prescription',
      timestamp: prescription.prescriptionDate || new Date()
    });
  }

  /**
   * Log diagnosis
   */
  async logDiagnosis(userId, diagnosis, metadata = {}) {
    return this.logHealthEvent({
      userId,
      entryType: 'diagnosis',
      title: diagnosis.condition || 'Medical Diagnosis',
      description: diagnosis.details || '',
      data: {
        diagnosisId: diagnosis.id,
        condition: diagnosis.condition,
        icdCode: diagnosis.icdCode,
        severity: diagnosis.severity,
        diagnosedBy: diagnosis.doctorName,
        confidence: diagnosis.confidence,
        ...metadata
      },
      linkedRecordId: diagnosis.id,
      linkedRecordType: 'diagnosis'
    });
  }

  /**
   * Log symptom
   */
  async logSymptom(userId, symptom, metadata = {}) {
    return this.logHealthEvent({
      userId,
      entryType: 'symptom',
      title: symptom.name || 'Symptom',
      description: `Severity: ${symptom.severity || 'unknown'}`,
      data: {
        symptomName: symptom.name,
        severity: symptom.severity,
        duration: symptom.duration,
        bodyPart: symptom.bodyPart,
        triggers: symptom.triggers,
        notes: symptom.notes,
        ...metadata
      }
    });
  }

  /**
   * Log remote health monitoring data (from devices like Apple Watch, Fitbit, etc.)
   */
  async logDeviceReading(userId, deviceData) {
    const readings = [];

    // Log each metric separately for better tracking
    for (const [metric, value] of Object.entries(deviceData.metrics || {})) {
      const entry = await this.logHealthEvent({
        userId,
        entryType: 'device_reading',
        title: `${this.formatVitalName(metric)}: ${value.value}`,
        description: `From ${deviceData.deviceName || 'Health Device'}`,
        data: {
          deviceId: deviceData.deviceId,
          deviceName: deviceData.deviceName,
          deviceType: deviceData.deviceType,
          metric: metric,
          value: value.value,
          unit: value.unit,
          rawData: deviceData.rawData,
          syncedAt: deviceData.syncedAt
        },
        timestamp: value.timestamp || new Date()
      });
      readings.push(entry);
    }

    return readings;
  }

  /**
   * Bulk log multiple health events
   */
  async bulkLogHealthEvents(events) {
    const results = [];
    for (const event of events) {
      const entry = await this.logHealthEvent(event);
      results.push(entry);
    }
    return results;
  }

  /**
   * Get user's health diary with filters
   */
  async getUserHealthDiary(userId, filters = {}) {
    try {
      const where = { userId };

      if (filters.entryType) {
        where.entryType = filters.entryType;
      }

      if (filters.startDate) {
        where.entryDate = {
          ...where.entryDate,
          [Op.gte]: new Date(filters.startDate)
        };
      }

      if (filters.endDate) {
        where.entryDate = {
          ...where.entryDate,
          [Op.lte]: new Date(filters.endDate)
        };
      }

      const entries = await HealthDiary.findAll({
        where,
        order: [['entryDate', 'DESC']],
        limit: filters.limit || 100,
        offset: filters.offset || 0
      });

      return entries;
    } catch (error) {
      console.error('❌ Failed to fetch health diary:', error);
      throw error;
    }
  }

  /**
   * Get health timeline (grouped by date)
   */
  async getHealthTimeline(userId, filters = {}) {
    const entries = await this.getUserHealthDiary(userId, filters);
    
    // Group by date
    const timeline = {};
    entries.forEach(entry => {
      const date = entry.entryDate.toISOString().split('T')[0];
      if (!timeline[date]) {
        timeline[date] = [];
      }
      timeline[date].push(entry);
    });

    return timeline;
  }

  // Helper methods
  formatVitalName(vitalType) {
    const names = {
      heartRate: 'Heart Rate',
      bloodPressure: 'Blood Pressure',
      temperature: 'Temperature',
      oxygenSaturation: 'Oxygen Saturation',
      bloodGlucose: 'Blood Glucose',
      weight: 'Weight',
      height: 'Height',
      bmi: 'BMI',
      steps: 'Steps',
      sleep: 'Sleep',
      calories: 'Calories'
    };
    return names[vitalType] || vitalType;
  }

  getVitalUnit(vitalType) {
    const units = {
      heartRate: 'bpm',
      bloodPressure: 'mmHg',
      temperature: '°F',
      oxygenSaturation: '%',
      bloodGlucose: 'mg/dL',
      weight: 'kg',
      height: 'cm',
      bmi: '',
      steps: 'steps',
      sleep: 'hours',
      calories: 'kcal'
    };
    return units[vitalType] || '';
  }
}

// Export singleton instance
const healthDiaryService = new HealthDiaryService();
export default healthDiaryService;
