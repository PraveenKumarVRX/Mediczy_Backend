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
    uric_acid: 'mg/dL'
  };
  return units[dataType] || '';
}

export default router;
