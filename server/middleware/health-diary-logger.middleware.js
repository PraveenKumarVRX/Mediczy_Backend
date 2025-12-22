/**
 * Health Diary Auto-Logging Middleware
 * Automatically logs health events from various sources
 */

import healthDiaryService from '../services/health-diary.service.js';

/**
 * Middleware to auto-log appointments after creation/completion
 */
export const logAppointmentMiddleware = async (req, res, next) => {
  const originalJson = res.json.bind(res);
  
  res.json = function(data) {
    // If appointment was created or completed, log to health diary
    if (data.appointment && req.user?.id) {
      const appointment = data.appointment;
      
      // Log asynchronously to not block response
      setImmediate(async () => {
        try {
          if (appointment.status === 'completed' || appointment.status === 'scheduled') {
            await healthDiaryService.logConsultation(req.user.id, {
              id: appointment.id,
              doctorId: appointment.doctorId,
              doctorName: appointment.doctorName || 'Doctor',
              consultationType: appointment.consultationType || 'General',
              status: appointment.status,
              scheduledTime: appointment.scheduledTime,
              duration: appointment.duration
            });
          }
        } catch (error) {
          console.error('Failed to auto-log appointment to health diary:', error);
        }
      });
    }
    
    return originalJson(data);
  };
  
  next();
};

/**
 * Middleware to auto-log prescriptions
 */
export const logPrescriptionMiddleware = async (req, res, next) => {
  const originalJson = res.json.bind(res);
  
  res.json = function(data) {
    if (data.prescription && req.user?.id) {
      const prescription = data.prescription;
      
      setImmediate(async () => {
        try {
          await healthDiaryService.logPrescription(req.user.id, {
            id: prescription.id,
            doctorId: prescription.doctorId,
            doctorName: prescription.doctorName,
            medications: prescription.medications || [],
            diagnosis: prescription.diagnosis,
            notes: prescription.notes,
            prescriptionDate: prescription.prescriptionDate || new Date()
          });

          // Also log each medication separately
          if (prescription.medications) {
            for (const med of prescription.medications) {
              await healthDiaryService.logMedication(req.user.id, {
                ...med,
                prescriptionId: prescription.id,
                doctorName: prescription.doctorName
              }, 'prescribed');
            }
          }
        } catch (error) {
          console.error('Failed to auto-log prescription to health diary:', error);
        }
      });
    }
    
    return originalJson(data);
  };
  
  next();
};

/**
 * Middleware to auto-log lab tests and results
 */
export const logLabTestMiddleware = async (req, res, next) => {
  const originalJson = res.json.bind(res);
  
  res.json = function(data) {
    if ((data.labTest || data.test) && req.user?.id) {
      const labTest = data.labTest || data.test;
      
      setImmediate(async () => {
        try {
          await healthDiaryService.logLabTest(req.user.id, {
            id: labTest.id,
            testName: labTest.testName || labTest.name,
            testType: labTest.testType,
            orderedBy: labTest.orderedBy,
            doctorName: labTest.doctorName,
            results: labTest.results,
            normalRange: labTest.normalRange,
            status: labTest.status,
            labName: labTest.labName,
            orderedDate: labTest.orderedDate,
            resultDate: labTest.resultDate
          });
        } catch (error) {
          console.error('Failed to auto-log lab test to health diary:', error);
        }
      });
    }
    
    return originalJson(data);
  };
  
  next();
};

/**
 * Middleware to auto-log vitals/health metrics
 */
export const logVitalsMiddleware = async (req, res, next) => {
  const originalJson = res.json.bind(res);
  
  res.json = function(data) {
    if ((data.vital || data.vitals) && req.user?.id) {
      const vitals = data.vital || data.vitals;
      const source = data.source || req.body?.source || 'manual';
      
      setImmediate(async () => {
        try {
          // If multiple vitals, log each one
          if (Array.isArray(vitals)) {
            for (const vital of vitals) {
              await healthDiaryService.logVitalSign(req.user.id, vital, source);
            }
          } else {
            await healthDiaryService.logVitalSign(req.user.id, vitals, source);
          }
        } catch (error) {
          console.error('Failed to auto-log vitals to health diary:', error);
        }
      });
    }
    
    return originalJson(data);
  };
  
  next();
};

/**
 * Middleware to auto-log device health readings (Apple Health, Fitbit, etc.)
 */
export const logDeviceReadingMiddleware = async (req, res, next) => {
  const originalJson = res.json.bind(res);
  
  res.json = function(data) {
    if (data.deviceData && req.user?.id) {
      const deviceData = data.deviceData;
      
      setImmediate(async () => {
        try {
          await healthDiaryService.logDeviceReading(req.user.id, {
            deviceId: deviceData.deviceId,
            deviceName: deviceData.deviceName || 'Health Device',
            deviceType: deviceData.deviceType,
            metrics: deviceData.metrics || deviceData.data,
            rawData: deviceData.rawData,
            syncedAt: deviceData.syncedAt || new Date()
          });
        } catch (error) {
          console.error('Failed to auto-log device reading to health diary:', error);
        }
      });
    }
    
    return originalJson(data);
  };
  
  next();
};

/**
 * Middleware to auto-log symptoms
 */
export const logSymptomMiddleware = async (req, res, next) => {
  const originalJson = res.json.bind(res);
  
  res.json = function(data) {
    if (data.symptom && req.user?.id) {
      const symptom = data.symptom;
      
      setImmediate(async () => {
        try {
          await healthDiaryService.logSymptom(req.user.id, {
            name: symptom.name,
            severity: symptom.severity,
            duration: symptom.duration,
            bodyPart: symptom.bodyPart,
            triggers: symptom.triggers,
            notes: symptom.notes
          });
        } catch (error) {
          console.error('Failed to auto-log symptom to health diary:', error);
        }
      });
    }
    
    return originalJson(data);
  };
  
  next();
};

/**
 * Generic health event logger (can be called manually)
 */
export const logHealthEvent = async (userId, eventType, eventData) => {
  try {
    return await healthDiaryService.logHealthEvent({
      userId,
      entryType: eventType,
      ...eventData
    });
  } catch (error) {
    console.error('Failed to log health event:', error);
    return null;
  }
};

export default {
  logAppointmentMiddleware,
  logPrescriptionMiddleware,
  logLabTestMiddleware,
  logVitalsMiddleware,
  logDeviceReadingMiddleware,
  logSymptomMiddleware,
  logHealthEvent
};
