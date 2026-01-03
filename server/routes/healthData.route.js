import express from 'express';
import auth from '../middleware/auth.js';
import HealthData from '../models/HealthData.model.intelligent.js';

const router = express.Router();

/**
 * POST /api/health-data/ble-sync
 * Sync health data received from BLE devices
 */
router.post('/ble-sync', auth, async (req, res) => {
  try {
    const { readings } = req.body;
    const userId = req.user.id;

    if (!readings || !Array.isArray(readings)) {
      return res.status(400).json({ error: 'Invalid readings data' });
    }

    console.log(`📱 BLE Sync: Received ${readings.length} readings from user ${userId}`);

    const processedReadings = [];

    for (const reading of readings) {
      const { type, value, unit, timestamp, deviceId, metadata } = reading;

      // Validate required fields
      if (!type || value === undefined || !timestamp) {
        console.warn('Skipping invalid reading:', reading);
        continue;
      }

      const healthRecord = {
        userId,
        dataType: type,
        value: parseFloat(value),
        unit: unit || getDefaultUnit(type),
        source: 'ble',
        deviceId: deviceId || 'unknown',
        recordedAt: new Date(timestamp),
        metadata: metadata || {},
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Store in database if model available
      if (HealthData) {
        try {
          await HealthData.create(healthRecord);
          processedReadings.push(healthRecord);
        } catch (dbError) {
          console.error('Error storing health record:', dbError);
        }
      } else {
        processedReadings.push(healthRecord);
      }

      // Emit real-time update via Socket.IO if available
      try {
        const io = req.app.get('io');
        if (io) {
          io.to(`user_${userId}`).emit('health_data_update', {
            type: 'ble_reading',
            data: healthRecord
          });
        }
      } catch (e) {
        // Socket.IO not available
      }
    }

    console.log(`✅ BLE Sync: Processed ${processedReadings.length}/${readings.length} readings`);

    res.json({
      success: true,
      processedCount: processedReadings.length,
      totalReceived: readings.length
    });

  } catch (error) {
    console.error('BLE sync error:', error);
    res.status(500).json({ error: 'Failed to sync health data' });
  }
});

/**
 * GET /api/health-data/recent
 * Get recent health readings for the user
 */
router.get('/recent', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { type, hours = 24, limit = 100 } = req.query;

    const since = new Date();
    since.setHours(since.getHours() - parseInt(hours));

    const whereClause = {
      userId,
      recordedAt: { $gte: since }
    };

    if (type) {
      whereClause.dataType = type;
    }

    if (HealthData) {
      const readings = await HealthData.findAll({
        where: whereClause,
        order: [['recordedAt', 'DESC']],
        limit: parseInt(limit)
      });
      return res.json(readings);
    }

    res.json([]);
  } catch (error) {
    console.error('Error fetching recent health data:', error);
    res.status(500).json({ error: 'Failed to fetch health data' });
  }
});

/**
 * GET /api/health-data/summary
 * Get health data summary for the user
 */
router.get('/summary', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { days = 7 } = req.query;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));
    const endDate = new Date();

    // Get latest readings for each type
    const latestReadings = {};
    const dataTypes = [
      'heart_rate', 'hrv', 'ecg', 'steps', 'calories', 'distance', 'sleep',
      'blood_pressure', 'blood_glucose', 'weight', 'body_fat',
      'temperature', 'spo2', 'activity', 'total_cholesterol', 'uric_acid'
    ];

    if (HealthData) {
      for (const dataType of dataTypes) {
        try {
          const latest = await HealthData.findOne({
            where: { userId, dataType },
            order: [['recordedAt', 'DESC']]
          });
          if (latest) {
            latestReadings[dataType] = {
              value: latest.value,
              unit: latest.unit,
              timestamp: latest.recordedAt,
              deviceId: latest.deviceId
            };
          }
        } catch (e) {
          // Skip if error
        }
      }
    }

    // Calculate averages for the period
    const averages = {};
    const aggregateTypes = ['heart_rate', 'steps', 'calories', 'spo2'];

    if (HealthData) {
      for (const dataType of aggregateTypes) {
        try {
          const readings = await HealthData.findAll({
            where: {
              userId,
              dataType,
              recordedAt: { $gte: startDate, $lte: endDate }
            }
          });
          
          if (readings.length > 0) {
            const sum = readings.reduce((acc, r) => acc + parseFloat(r.value), 0);
            averages[dataType] = Math.round(sum / readings.length);
          }
        } catch (e) {
          // Skip if error
        }
      }
    }

    res.json({
      period: { start: startDate, end: endDate, days: parseInt(days) },
      latest: latestReadings,
      averages,
      lastSync: new Date()
    });

  } catch (error) {
    console.error('Error fetching health data summary:', error);
    res.status(500).json({ error: 'Failed to fetch health data summary' });
  }
});

/**
 * GET /api/health-data/devices
 * Get list of devices that have synced data
 */
router.get('/devices', auth, async (req, res) => {
  try {
    const userId = req.user.id;

    if (HealthData) {
      // Get unique devices with their last sync time
      const devices = await HealthData.findAll({
        where: { userId },
        attributes: ['deviceId', 'source'],
        group: ['deviceId', 'source'],
        raw: true
      });

      const deviceInfo = await Promise.all(devices.map(async (d) => {
        const lastReading = await HealthData.findOne({
          where: { userId, deviceId: d.deviceId },
          order: [['recordedAt', 'DESC']]
        });

        return {
          deviceId: d.deviceId,
          source: d.source,
          lastSyncTime: lastReading?.recordedAt || null,
          dataTypes: [] // Would need aggregation for this
        };
      }));

      return res.json(deviceInfo);
    }

    res.json([]);
  } catch (error) {
    console.error('Error fetching device list:', error);
    res.status(500).json({ error: 'Failed to fetch device list' });
  }
});

/**
 * DELETE /api/health-data/device/:deviceId
 * Delete all data from a specific device
 */
router.delete('/device/:deviceId', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { deviceId } = req.params;

    if (HealthData) {
      const deletedCount = await HealthData.destroy({
        where: { userId, deviceId }
      });

      return res.json({
        success: true,
        deletedCount
      });
    }

    res.json({ success: true, deletedCount: 0 });
  } catch (error) {
    console.error('Error deleting device data:', error);
    res.status(500).json({ error: 'Failed to delete device data' });
  }
});

// Helper function to get default unit for data type
function getDefaultUnit(dataType) {
  const units = {
    heart_rate: 'bpm',
    hrv: 'ms',
    ecg: 'mV',
    steps: 'steps',
    calories: 'kcal',
    distance: 'km',
    sleep: 'hours',
    blood_pressure: 'mmHg',
    blood_glucose: 'mg/dL',
    weight: 'kg',
    body_fat: '%',
    temperature: '°C',
    spo2: '%',
    activity: 'minutes',
    total_cholesterol: 'mg/dL',
    uric_acid: 'mg/dL',
    blood_oxygen: '%'
  };
  return units[dataType] || '';
}

/**
 * POST /api/health-data/veepoo-sync
 * Sync health data from Veepoo/HBand devices (VE30, etc.)
 */
router.post('/veepoo-sync', auth, async (req, res) => {
  try {
    const { deviceId, deviceName, readings, deviceInfo } = req.body;
    const userId = req.user.id;

    if (!readings || !Array.isArray(readings)) {
      return res.status(400).json({ error: 'Invalid readings data' });
    }

    console.log(`⌚ Veepoo Sync: Received ${readings.length} readings from ${deviceName || 'unknown'}`);

    const processedReadings = [];
    const errors = [];

    for (const reading of readings) {
      try {
        const { type, value, timestamp, metadata } = reading;

        // Map Veepoo data types to our standard types
        let dataType = type;
        let processedValue = value;
        let unit = getDefaultUnit(type);

        // Handle compound values (like blood pressure with sys/dia)
        if (type === 'blood_pressure' && typeof value === 'object') {
          // Store systolic and diastolic separately
          const sysRecord = {
            userId,
            dataType: 'blood_pressure_systolic',
            value: value.systolic,
            unit: 'mmHg',
            source: 'veepoo',
            deviceId: deviceId || 'veepoo-device',
            deviceName: deviceName || 'Veepoo Device',
            recordedAt: new Date(timestamp),
            metadata: { ...metadata, diastolic: value.diastolic, heartRate: value.heartRate },
            createdAt: new Date(),
            updatedAt: new Date()
          };
          
          const diaRecord = {
            userId,
            dataType: 'blood_pressure_diastolic',
            value: value.diastolic,
            unit: 'mmHg',
            source: 'veepoo',
            deviceId: deviceId || 'veepoo-device',
            deviceName: deviceName || 'Veepoo Device',
            recordedAt: new Date(timestamp),
            metadata: { ...metadata, systolic: value.systolic, heartRate: value.heartRate },
            createdAt: new Date(),
            updatedAt: new Date()
          };

          if (HealthData) {
            await HealthData.create(sysRecord);
            await HealthData.create(diaRecord);
          }
          processedReadings.push(sysRecord, diaRecord);
          continue;
        }

        // Handle SpO2
        if (type === 'spo2' && typeof value === 'object') {
          processedValue = value.spO2;
        }

        // Handle temperature
        if (type === 'temperature' && typeof value === 'object') {
          processedValue = value.temperature;
        }

        // Handle heart rate
        if (type === 'heart_rate' && typeof value === 'object') {
          processedValue = value.heartRate;
        }

        const healthRecord = {
          userId,
          dataType,
          value: parseFloat(processedValue),
          unit,
          source: 'veepoo',
          deviceId: deviceId || 'veepoo-device',
          deviceName: deviceName || 'Veepoo Device',
          recordedAt: new Date(timestamp),
          metadata: metadata || {},
          createdAt: new Date(),
          updatedAt: new Date()
        };

        if (HealthData) {
          await HealthData.create(healthRecord);
        }
        processedReadings.push(healthRecord);

      } catch (readingError) {
        console.error('Error processing Veepoo reading:', readingError);
        errors.push({ reading, error: readingError.message });
      }
    }

    // Emit real-time update
    try {
      const io = req.app.get('io');
      if (io) {
        io.to(`user_${userId}`).emit('health_data_update', {
          type: 'veepoo_sync',
          device: deviceName,
          count: processedReadings.length
        });
      }
    } catch (e) {
      // Socket.IO not available
    }

    console.log(`✅ Veepoo Sync: Processed ${processedReadings.length}/${readings.length} readings`);

    res.json({
      success: true,
      processedCount: processedReadings.length,
      totalReceived: readings.length,
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (error) {
    console.error('Veepoo sync error:', error);
    res.status(500).json({ error: 'Failed to sync Veepoo health data' });
  }
});

/**
 * POST /api/health-data/apple-health-sync
 * Sync health data from Apple HealthKit
 */
router.post('/apple-health-sync', auth, async (req, res) => {
  try {
    const { readings, syncId } = req.body;
    const userId = req.user.id;

    if (!readings || !Array.isArray(readings)) {
      return res.status(400).json({ error: 'Invalid readings data' });
    }

    console.log(`🍎 Apple Health Sync: Received ${readings.length} readings`);

    const processedReadings = [];

    for (const reading of readings) {
      try {
        const { type, value, unit, startDate, endDate, sourceName, sourceId, metadata } = reading;

        // Map HealthKit types to our standard types
        const typeMapping = {
          'HKQuantityTypeIdentifierHeartRate': 'heart_rate',
          'HKQuantityTypeIdentifierStepCount': 'steps',
          'HKQuantityTypeIdentifierActiveEnergyBurned': 'calories',
          'HKQuantityTypeIdentifierDistanceWalkingRunning': 'distance',
          'HKQuantityTypeIdentifierBloodPressureSystolic': 'blood_pressure_systolic',
          'HKQuantityTypeIdentifierBloodPressureDiastolic': 'blood_pressure_diastolic',
          'HKQuantityTypeIdentifierBodyMass': 'weight',
          'HKQuantityTypeIdentifierBodyFatPercentage': 'body_fat',
          'HKQuantityTypeIdentifierBodyTemperature': 'temperature',
          'HKQuantityTypeIdentifierOxygenSaturation': 'spo2',
          'HKQuantityTypeIdentifierBloodGlucose': 'blood_glucose',
          'HKQuantityTypeIdentifierHeartRateVariabilitySDNN': 'hrv',
          'HKCategoryTypeIdentifierSleepAnalysis': 'sleep'
        };

        const dataType = typeMapping[type] || type;

        const healthRecord = {
          userId,
          dataType,
          value: parseFloat(value),
          unit: unit || getDefaultUnit(dataType),
          source: 'apple_health',
          deviceId: sourceId || 'apple-health',
          deviceName: sourceName || 'Apple Health',
          recordedAt: new Date(startDate || endDate),
          metadata: { ...metadata, endDate, syncId },
          createdAt: new Date(),
          updatedAt: new Date()
        };

        if (HealthData) {
          await HealthData.create(healthRecord);
        }
        processedReadings.push(healthRecord);

      } catch (readingError) {
        console.error('Error processing Apple Health reading:', readingError);
      }
    }

    // Emit real-time update
    try {
      const io = req.app.get('io');
      if (io) {
        io.to(`user_${userId}`).emit('health_data_update', {
          type: 'apple_health_sync',
          count: processedReadings.length
        });
      }
    } catch (e) {
      // Socket.IO not available
    }

    console.log(`✅ Apple Health Sync: Processed ${processedReadings.length}/${readings.length} readings`);

    res.json({
      success: true,
      processedCount: processedReadings.length,
      totalReceived: readings.length
    });

  } catch (error) {
    console.error('Apple Health sync error:', error);
    res.status(500).json({ error: 'Failed to sync Apple Health data' });
  }
});

/**
 * POST /api/health-data/google-fit-sync
 * Sync health data from Google Fit
 */
router.post('/google-fit-sync', auth, async (req, res) => {
  try {
    const { readings, syncId } = req.body;
    const userId = req.user.id;

    if (!readings || !Array.isArray(readings)) {
      return res.status(400).json({ error: 'Invalid readings data' });
    }

    console.log(`🟢 Google Fit Sync: Received ${readings.length} readings`);

    const processedReadings = [];

    for (const reading of readings) {
      try {
        const { type, value, unit, startTime, endTime, dataSourceId, dataSourceName, metadata } = reading;

        // Map Google Fit types to our standard types
        const typeMapping = {
          'com.google.heart_rate.bpm': 'heart_rate',
          'com.google.step_count.delta': 'steps',
          'com.google.calories.expended': 'calories',
          'com.google.distance.delta': 'distance',
          'com.google.blood_pressure': 'blood_pressure',
          'com.google.weight': 'weight',
          'com.google.body.fat.percentage': 'body_fat',
          'com.google.body.temperature': 'temperature',
          'com.google.oxygen_saturation': 'spo2',
          'com.google.blood_glucose': 'blood_glucose',
          'com.google.heart_rate.summary': 'hrv',
          'com.google.sleep.segment': 'sleep'
        };

        const dataType = typeMapping[type] || type;

        const healthRecord = {
          userId,
          dataType,
          value: parseFloat(value),
          unit: unit || getDefaultUnit(dataType),
          source: 'google_fit',
          deviceId: dataSourceId || 'google-fit',
          deviceName: dataSourceName || 'Google Fit',
          recordedAt: new Date(startTime || endTime),
          metadata: { ...metadata, endTime, syncId },
          createdAt: new Date(),
          updatedAt: new Date()
        };

        if (HealthData) {
          await HealthData.create(healthRecord);
        }
        processedReadings.push(healthRecord);

      } catch (readingError) {
        console.error('Error processing Google Fit reading:', readingError);
      }
    }

    // Emit real-time update
    try {
      const io = req.app.get('io');
      if (io) {
        io.to(`user_${userId}`).emit('health_data_update', {
          type: 'google_fit_sync',
          count: processedReadings.length
        });
      }
    } catch (e) {
      // Socket.IO not available
    }

    console.log(`✅ Google Fit Sync: Processed ${processedReadings.length}/${readings.length} readings`);

    res.json({
      success: true,
      processedCount: processedReadings.length,
      totalReceived: readings.length
    });

  } catch (error) {
    console.error('Google Fit sync error:', error);
    res.status(500).json({ error: 'Failed to sync Google Fit data' });
  }
});

export default router;
