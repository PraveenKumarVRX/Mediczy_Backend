import express from 'express';
import auth from '../middleware/auth.js';
import HealthData from '../models/HealthData.model.intelligent.js';
import { postgresSequelize } from '../db/postgres-sequelize.js';
import { classifyVital, patientVitalHistory, vitalUnits } from '../utils/patient-vitals.js';

const router = express.Router();

// Patient readings use the same health_data store as dashboards and wearables.
router.get('/vitals', auth, async (req, res) => {
  try {
    const records = await HealthData.findAll({ where: { userId: req.user.id }, order: [['recordedAt', 'DESC']], limit: 1000 });
    const vitals = patientVitalHistory(records);
    res.json({ success: true, vitals });
  } catch (error) {
    console.error('Load patient vitals:', error);
    res.status(500).json({ message: 'Could not load your readings. Please try again.' });
  }
});

router.post('/vitals', auth, async (req, res) => {
  const { type, value, notes = '', fasting = false } = req.body;
  let status;
  try { status = classifyVital(type, value, fasting); }
  catch (error) { return res.status(400).json({ message: error.message }); }
  try {
    const timestamp = new Date();
    const types = { blood_sugar: 'blood_glucose', oxygen_level: 'spo2' };
    const reading = await HealthData.create({ userId: req.user.id, dataType: types[type] || type,
      value: Number(String(value).split('/')[0]), unit: vitalUnits[type], source: 'manual', recordedAt: timestamp,
      metadata: { displayValue: String(value), notes: String(notes).slice(0, 2000), fasting: fasting === true,
        ...(type === 'blood_pressure' ? { systolic: Number(String(value).split('/')[0]), diastolic: Number(String(value).split('/')[1]) } : {}) },
    });
    res.status(201).json({ success: true, vital: { id: String(reading.id), type, value: String(value), unit: vitalUnits[type], status, timestamp, notes, recordedBy: 'Self' } });
  } catch (error) {
    console.error('Save patient vital:', error);
    res.status(500).json({ message: 'Could not save your reading. Please try again.' });
  }
});

/**
 * Validate device ownership - ensures device is registered to user
 */
async function validateDeviceOwnership(userId, deviceId) {
  if (!deviceId || deviceId === 'unknown') return false;
  
  try {
    const [results] = await postgresSequelize.query(
      `SELECT id FROM user_devices WHERE user_id = $1 AND device_id = $2 AND is_active = TRUE`,
      { bind: [userId, deviceId] }
    );
    return results.length > 0;
  } catch (e) {
    console.error('Device validation error:', e.message);
    return false;
  }
}

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
    const rejectedReadings = [];

    for (const reading of readings) {
      const { type, value, unit, timestamp, deviceId, metadata } = reading;

      // Validate required fields
      if (!type || value === undefined || !timestamp) {
        console.warn('Skipping invalid reading:', reading);
        continue;
      }

      // Validate device ownership
      const isValidDevice = await validateDeviceOwnership(userId, deviceId);
      if (!isValidDevice && deviceId && deviceId !== 'unknown') {
        console.warn(`🚫 Device ${deviceId} not registered to user ${userId}`);
        rejectedReadings.push({ deviceId, reason: 'Device not registered to user' });
        continue;
      }

      // Handle compound blood_pressure value {systolic, diastolic}
      if (type === 'blood_pressure' && value && typeof value === 'object') {
        const bpRecords = [
          { dataType: 'blood_pressure_systolic', numValue: parseFloat(value.systolic) },
          { dataType: 'blood_pressure_diastolic', numValue: parseFloat(value.diastolic) }
        ];
        for (const bp of bpRecords) {
          if (isNaN(bp.numValue)) continue;
          const bpRecord = {
            userId,
            dataType: bp.dataType,
            value: bp.numValue,
            unit: unit || 'mmHg',
            source: 'ble',
            deviceId: deviceId || 'unknown',
            recordedAt: new Date(timestamp),
            metadata: metadata || {},
            verified: isValidDevice,
            createdAt: new Date(),
            updatedAt: new Date()
          };
          if (HealthData) {
            try { await HealthData.create(bpRecord); processedReadings.push(bpRecord); }
            catch (dbError) { console.error('Error storing BP record:', dbError); }
          }
        }
        continue;
      }

      const parsedValue = parseFloat(value);
      if (isNaN(parsedValue)) {
        console.warn(`Skipping reading with NaN value: type=${type}, value=${JSON.stringify(value)}`);
        continue;
      }

      const healthRecord = {
        userId,
        dataType: type,
        value: parsedValue,
        unit: unit || getDefaultUnit(type),
        source: 'ble',
        deviceId: deviceId || 'unknown',
        recordedAt: new Date(timestamp),
        metadata: metadata || {},
        verified: isValidDevice,
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

      // Emit real-time update via Socket.IO — to patient AND to their doctor(s)
      try {
        const io = req.app.get('io');
        if (io) {
          io.to(`user-${userId}`).emit('health_data_update', {
            type: 'ble_reading', data: healthRecord
          });
          // If reading is abnormal, also push to all doctors who have this patient
          if (healthRecord.alertTriggered) {
            try {
              const [doctorRows] = await postgresSequelize.query(
                `SELECT DISTINCT "doctorId" FROM appointments WHERE ("patientId" = :uid OR "userId" = :uid) AND "doctorId" IS NOT NULL`,
                { replacements: { uid: userId }, type: 'SELECT' }
              );
              for (const row of doctorRows) {
                const did = row.doctorId;
                if (did) {
                  io.to(`doctor-${did}`).emit('patient_vitals_alert', {
                    patientId: userId,
                    reading: healthRecord,
                    severity: healthRecord.alertSeverity ?? 'warning',
                    ts: new Date().toISOString()
                  });
                }
              }
            } catch (e) {
              // Doctor broadcast non-fatal
            }
          }
        }
      } catch (e) {
        // Socket.IO or DB query not available — non-fatal
      }
    }

    // Update last sync time for device
    if (processedReadings.length > 0) {
      const deviceIds = [...new Set(processedReadings.map(r => r.deviceId).filter(d => d !== 'unknown'))];
      for (const deviceId of deviceIds) {
        try {
          await postgresSequelize.query(
            `UPDATE user_devices SET last_sync = NOW(), updated_at = NOW() WHERE user_id = $1 AND device_id = $2`,
            { bind: [userId, deviceId] }
          );
        } catch (e) {}
      }
    }

    console.log(`✅ BLE Sync: Processed ${processedReadings.length}/${readings.length} readings`);

    res.json({
      success: true,
      processedCount: processedReadings.length,
      totalReceived: readings.length,
      rejectedCount: rejectedReadings.length,
      rejected: rejectedReadings
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
    const days = Math.min(90, Math.max(1, Number.parseInt(req.query.days, 10) || 7));

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));
    const endDate = new Date();

    const [[latestRows], [averageRows]] = await Promise.all([
      postgresSequelize.query(`SELECT DISTINCT ON (data_type) data_type, value, unit, recorded_at, device_id FROM health_data WHERE user_id = $1 ORDER BY data_type, recorded_at DESC, id DESC`, { bind: [userId] }),
      postgresSequelize.query(`SELECT data_type, AVG(value)::float AS average FROM health_data WHERE user_id = $1 AND recorded_at BETWEEN $2 AND $3 GROUP BY data_type`, { bind: [userId, startDate, endDate] }),
    ]);
    const latestReadings = Object.fromEntries(latestRows.map(row => [row.data_type, { value: Number(row.value), unit: row.unit, timestamp: row.recorded_at, deviceId: row.device_id }]));
    const averages = Object.fromEntries(averageRows.map(row => [row.data_type, Math.round(row.average)]));
    const lastSync = latestRows.reduce((last, row) => !last || new Date(row.recorded_at) > new Date(last) ? row.recorded_at : last, null);

    res.json({
      period: { start: startDate, end: endDate, days: parseInt(days) },
      latest: latestReadings,
      averages,
      lastSync
    });

  } catch (error) {
    console.error('Error fetching health data summary:', error);
    res.status(500).json({ error: 'Failed to fetch health data summary' });
  }
});

/**
 * GET /api/health-data/trends/:dataType
 * Get historical trend data for a specific metric
 * Query params: period (hour, day, week, month, year)
 */
router.get('/trends/:dataType', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { dataType } = req.params;
    const { period = 'day' } = req.query;

    let startDate, groupBy, dateFormat;
    const now = new Date();

    switch (period) {
      case 'hour':
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000); // Last 24 hours
        groupBy = "date_trunc('hour', recorded_at)";
        dateFormat = 'HH24:MI';
        break;
      case 'day':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); // Last 7 days
        groupBy = "date_trunc('day', recorded_at)";
        dateFormat = 'Dy';
        break;
      case 'week':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); // Last 30 days
        groupBy = "date_trunc('week', recorded_at)";
        dateFormat = 'Mon DD';
        break;
      case 'month':
        startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000); // Last 12 months
        groupBy = "date_trunc('month', recorded_at)";
        dateFormat = 'Mon';
        break;
      case 'year':
        startDate = new Date(now.getTime() - 5 * 365 * 24 * 60 * 60 * 1000); // Last 5 years
        groupBy = "date_trunc('year', recorded_at)";
        dateFormat = 'YYYY';
        break;
      default:
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        groupBy = "date_trunc('day', recorded_at)";
        dateFormat = 'Dy';
    }

    // Get aggregated data
    const [trendData] = await postgresSequelize.query(`
      SELECT 
        ${groupBy} as time_bucket,
        TO_CHAR(${groupBy}, '${dateFormat}') as label,
        ROUND(AVG(value)::numeric, 1) as avg_value,
        ROUND(MIN(value)::numeric, 1) as min_value,
        ROUND(MAX(value)::numeric, 1) as max_value,
        COUNT(*) as reading_count
      FROM health_data 
      WHERE user_id = $1 
        AND data_type = $2 
        AND recorded_at >= $3
      GROUP BY ${groupBy}
      ORDER BY time_bucket ASC
    `, { bind: [userId, dataType, startDate] });

    // Get overall stats
    const [stats] = await postgresSequelize.query(`
      SELECT 
        ROUND(AVG(value)::numeric, 1) as average,
        ROUND(MIN(value)::numeric, 1) as minimum,
        ROUND(MAX(value)::numeric, 1) as maximum,
        COUNT(*) as total_readings,
        MAX(recorded_at) as last_reading
      FROM health_data 
      WHERE user_id = $1 
        AND data_type = $2 
        AND recorded_at >= $3
    `, { bind: [userId, dataType, startDate] });

    // Calculate trend (comparing first half to second half of period)
    const midPoint = Math.floor(trendData.length / 2);
    let trend = 'stable';
    let trendPercentage = 0;

    if (trendData.length >= 2) {
      const firstHalf = trendData.slice(0, midPoint);
      const secondHalf = trendData.slice(midPoint);
      
      const firstAvg = firstHalf.reduce((sum, d) => sum + parseFloat(d.avg_value), 0) / (firstHalf.length || 1);
      const secondAvg = secondHalf.reduce((sum, d) => sum + parseFloat(d.avg_value), 0) / (secondHalf.length || 1);
      
      if (firstAvg > 0) {
        trendPercentage = Math.round(((secondAvg - firstAvg) / firstAvg) * 100);
        if (trendPercentage > 5) trend = 'up';
        else if (trendPercentage < -5) trend = 'down';
      }
    }

    // Get unit for the data type
    const [unitResult] = await postgresSequelize.query(`
      SELECT unit FROM health_data WHERE user_id = $1 AND data_type = $2 ORDER BY recorded_at DESC LIMIT 1
    `, { bind: [userId, dataType] });

    res.json({
      dataType,
      period,
      unit: unitResult[0]?.unit || getDefaultUnit(dataType),
      data: trendData.map(d => ({
        label: d.label,
        timestamp: d.time_bucket,
        value: parseFloat(d.avg_value),
        min: parseFloat(d.min_value),
        max: parseFloat(d.max_value),
        count: parseInt(d.reading_count)
      })),
      stats: stats[0] ? {
        average: parseFloat(stats[0].average) || 0,
        minimum: parseFloat(stats[0].minimum) || 0,
        maximum: parseFloat(stats[0].maximum) || 0,
        totalReadings: parseInt(stats[0].total_readings) || 0,
        lastReading: stats[0].last_reading
      } : null,
      trend: {
        direction: trend,
        percentage: trendPercentage
      }
    });

  } catch (error) {
    console.error('Error fetching health trends:', error);
    res.status(500).json({ error: 'Failed to fetch health trends' });
  }
});

/**
 * GET /api/health-data/history/:dataType
 * Get raw historical readings for a data type
 */
router.get('/history/:dataType', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { dataType } = req.params;
    const { limit = 100, offset = 0, startDate, endDate } = req.query;

    let whereClause = 'user_id = $1 AND data_type = $2';
    const params = [userId, dataType];
    let paramIndex = 3;

    if (startDate) {
      whereClause += ` AND recorded_at >= $${paramIndex}`;
      params.push(startDate);
      paramIndex++;
    }
    if (endDate) {
      whereClause += ` AND recorded_at <= $${paramIndex}`;
      params.push(endDate);
      paramIndex++;
    }

    const [readings] = await postgresSequelize.query(`
      SELECT id, value, unit, source, device_id, recorded_at, verified
      FROM health_data 
      WHERE ${whereClause}
      ORDER BY recorded_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `, { bind: [...params, parseInt(limit), parseInt(offset)] });

    const [countResult] = await postgresSequelize.query(`
      SELECT COUNT(*) as total FROM health_data WHERE ${whereClause}
    `, { bind: params });

    res.json({
      dataType,
      readings: readings.map(r => ({
        id: r.id,
        value: parseFloat(r.value),
        unit: r.unit,
        source: r.source,
        deviceId: r.device_id,
        recordedAt: r.recorded_at,
        verified: r.verified
      })),
      pagination: {
        total: parseInt(countResult[0].total),
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });

  } catch (error) {
    console.error('Error fetching health history:', error);
    res.status(500).json({ error: 'Failed to fetch health history' });
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
        io.to(`user-${userId}`).emit('health_data_update', {
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
        io.to(`user-${userId}`).emit('health_data_update', {
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
        io.to(`user-${userId}`).emit('health_data_update', {
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

/**
 * GET /api/health-data/devices
 * Get user's registered devices
 */
router.get('/devices', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    
    const [devices] = await postgresSequelize.query(
      `SELECT id, device_id, device_name, device_type, mac_address, paired_at, is_active, last_sync 
       FROM user_devices WHERE user_id = $1 ORDER BY paired_at DESC`,
      { bind: [userId] }
    );
    
    res.json({ devices });
  } catch (error) {
    console.error('Error fetching devices:', error);
    res.status(500).json({ error: 'Failed to fetch devices' });
  }
});

/**
 * POST /api/health-data/devices/register
 * Register/pair a new device to user
 */
router.post('/devices/register', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { deviceId, deviceName, deviceType, macAddress } = req.body;

    if (!deviceId) {
      return res.status(400).json({ error: 'Device ID is required' });
    }

    // Check if device is already registered to another user
    const [existing] = await postgresSequelize.query(
      `SELECT user_id FROM user_devices WHERE device_id = $1`,
      { bind: [deviceId] }
    );

    if (existing.length > 0 && existing[0].user_id !== userId) {
      return res.status(403).json({ 
        error: 'Device is already registered to another user',
        message: 'This device is paired with a different account. Please unpair it first.'
      });
    }

    // Register or update device
    await postgresSequelize.query(
      `INSERT INTO user_devices (user_id, device_id, device_name, device_type, mac_address, paired_at, is_active)
       VALUES ($1, $2, $3, $4, $5, NOW(), TRUE)
       ON CONFLICT (device_id) DO UPDATE SET 
         user_id = $1, device_name = $3, device_type = $4, is_active = TRUE, updated_at = NOW()`,
      { bind: [userId, deviceId, deviceName || 'Unknown Device', deviceType || 'unknown', macAddress || null] }
    );

    console.log(`✅ Device ${deviceId} registered to user ${userId}`);

    res.json({ 
      success: true, 
      message: 'Device registered successfully',
      device: { deviceId, deviceName, deviceType, userId }
    });

  } catch (error) {
    console.error('Device registration error:', error);
    res.status(500).json({ error: 'Failed to register device' });
  }
});

/**
 * DELETE /api/health-data/devices/:deviceId
 * Unpair/remove a device from user
 */
router.delete('/devices/:deviceId', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { deviceId } = req.params;

    const [result] = await postgresSequelize.query(
      `DELETE FROM user_devices WHERE user_id = $1 AND device_id = $2 RETURNING id`,
      { bind: [userId, deviceId] }
    );

    if (result.length === 0) {
      return res.status(404).json({ error: 'Device not found or not owned by user' });
    }

    console.log(`🗑️ Device ${deviceId} unpaired from user ${userId}`);

    res.json({ success: true, message: 'Device unpaired successfully' });

  } catch (error) {
    console.error('Device removal error:', error);
    res.status(500).json({ error: 'Failed to remove device' });
  }
});

/**
 * GET /api/health-data/wearables
 * List all wearable devices registered to the authenticated user
 * Queries the wearables table (populated by BLE pairing flow).
 */
router.get('/wearables', auth, async (req, res) => {
  try {
    const userId = req.user.id;

    // Try the dedicated `wearables` table first
    try {
      const [rows] = await postgresSequelize.query(
        `SELECT id, device_id, device_name, type, brand, model,
                current_metrics, last_sync, created_at
         FROM wearables
         WHERE user_id = $1
         ORDER BY last_sync DESC NULLS LAST`,
        { bind: [userId] }
      );
      return res.json({ wearables: rows });
    } catch (tableErr) {
      // wearables table may not exist — fall back to user_devices
      console.warn('wearables table not found, falling back to user_devices:', tableErr.message);
    }

    // Fallback: user_devices table
    const [devices] = await postgresSequelize.query(
      `SELECT id, device_id, device_name, device_type AS type, mac_address,
              paired_at AS created_at, last_sync, is_active
       FROM user_devices
       WHERE user_id = $1 AND is_active = TRUE
       ORDER BY last_sync DESC NULLS LAST`,
      { bind: [userId] }
    );

    res.json({ wearables: devices });
  } catch (error) {
    console.error('Error fetching wearables:', error);
    res.status(500).json({ error: 'Failed to fetch wearables' });
  }
});

/**
 * POST /api/health-data/nightscout-proxy
 * Proxy Nightscout CGM readings to avoid browser CORS issues.
 * Body: { url: string, count?: number }
 */
router.post('/nightscout-proxy', auth, async (req, res) => {
  try {
    const { url, count = 1 } = req.body;

    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'url is required' });
    }

    // Validate: must be https
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      return res.status(400).json({ error: 'Invalid URL format' });
    }

    if (parsed.protocol !== 'https:') {
      return res.status(400).json({ error: 'URL must use HTTPS' });
    }

    const safeCount = Math.min(Math.max(1, parseInt(count) || 1), 100);
    const apiUrl = `${url.replace(/\/$/, '')}/api/v1/entries.json?count=${safeCount}`;

    const response = await fetch(apiUrl, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      return res.status(502).json({
        error: `Nightscout returned HTTP ${response.status}`,
      });
    }

    const entries = await response.json();
    res.json({ entries });
  } catch (error) {
    if (error.name === 'TimeoutError' || error.name === 'AbortError') {
      return res.status(504).json({ error: 'Nightscout request timed out' });
    }
    console.error('Nightscout proxy error:', error);
    res.status(500).json({ error: 'Failed to fetch Nightscout data' });
  }
});

export default router;
