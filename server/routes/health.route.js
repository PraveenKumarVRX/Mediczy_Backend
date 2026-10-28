import { sleepHours, sleepScore } from '../utils/health-display.js';
import express from 'express';
import auth from '../middleware/auth.js';
import { postgresSequelize } from '../db/postgres-sequelize.js';

const router = express.Router();

/**
 * GET /api/health/latest
 * Get latest health metrics for the authenticated user
 * Aggregates data from health-data, apple-health, and other sources
 */
router.get('/latest', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { includeAdvanced } = req.query;

    console.log(`📊 Fetching latest health metrics for user ${userId}`);

    // Query latest health data from the database
    const query = `
      SELECT 
        data_type,
        value,
        unit,
        source,
        recorded_at,
        metadata
      FROM health_data
      WHERE user_id = $1
      ORDER BY recorded_at DESC
      LIMIT 1000
    `;

    const [healthRecords] = await postgresSequelize.query(query, {
      bind: [userId],
    });

    // Group by data type and get latest of each
    const latestMetrics = {};
    const latestUnits = {};
    const metricMap = {
      'heart_rate': 'heartRate',
      'heart rate': 'heartRate',
      'hr': 'heartRate',
      'steps': 'steps',
      'sleep': 'sleepHours',
      'blood_sugar': 'bloodGlucose',
      'sleep_score': 'sleepScore',
      'sleep score': 'sleepScore',
      'blood_pressure': 'bloodPressure',
      'blood pressure': 'bloodPressure',
      'spo2': 'spo2',
      'oxygen': 'spo2',
      'temperature': 'temperature',
      'temp': 'temperature',
      'blood_glucose': 'bloodGlucose',
      'blood glucose': 'bloodGlucose',
      'glucose': 'bloodGlucose',
      'hrv': 'hrv',
      'heart_rate_variability': 'hrv',
      'uric_acid': 'uricAcid',
      'uric acid': 'uricAcid',
      'total_cholesterol': 'totalCholesterol',
      'total cholesterol': 'totalCholesterol',
      'cholesterol': 'totalCholesterol',
    };

    let latestTimestamp = null;

    for (const record of healthRecords) {
      const metricKey = metricMap[record.data_type?.toLowerCase()] || record.data_type;
      
      if (!latestMetrics[metricKey]) {
        latestMetrics[metricKey] = metricKey === 'bloodPressure' ? (record.metadata?.systolic != null ? { systolic: record.metadata.systolic, diastolic: record.metadata.diastolic } : record.value) : record.value;
        latestUnits[metricKey] = record.unit;
        if (!latestTimestamp || new Date(record.recorded_at) > new Date(latestTimestamp)) {
          latestTimestamp = record.recorded_at;
        }
      }
    }

    // Also try to fetch from Apple Health if available
    try {
      const appleHealthQuery = `
        SELECT 
          metric_type,
          value,
          recorded_at
        FROM apple_health_data
        WHERE user_id = $1
        ORDER BY recorded_at DESC
        LIMIT 100
      `;

      const [appleHealthRecords] = await postgresSequelize.query(appleHealthQuery, {
        bind: [userId],
      });

      for (const record of appleHealthRecords) {
        const metricKey = metricMap[record.metric_type?.toLowerCase()] || record.metric_type;
        
        if (!latestMetrics[metricKey]) {
          latestMetrics[metricKey] = metricKey === 'bloodPressure' ? (record.metadata?.systolic != null ? { systolic: record.metadata.systolic, diastolic: record.metadata.diastolic } : record.value) : record.value;
        latestUnits[metricKey] = record.unit;
          if (!latestTimestamp || new Date(record.recorded_at) > new Date(latestTimestamp)) {
            latestTimestamp = record.recorded_at;
          }
        }
      }
    } catch (e) {
      // Apple Health table might not exist, continue
      console.log('Apple Health data not available:', e.message);
    }

    // Format response
    const response = {
      heartRate: latestMetrics.heartRate || null,
      steps: latestMetrics.steps || null,
      sleepHours: sleepHours(latestMetrics.sleepHours, latestUnits.sleepHours),
      sleepScore: latestMetrics.sleepScore ?? sleepScore(sleepHours(latestMetrics.sleepHours, latestUnits.sleepHours)),
      bloodPressure: latestMetrics.bloodPressure || null,
      spo2: latestMetrics.spo2 || null,
      temperature: latestMetrics.temperature || null,
      bloodGlucose: latestMetrics.bloodGlucose || null,
      hrv: latestMetrics.hrv || null,
      uricAcid: latestMetrics.uricAcid || null,
      totalCholesterol: latestMetrics.totalCholesterol || null,
      timestamp: latestTimestamp,
      // Units were computed per metric (latestUnits) but never surfaced -
      // every value above was returned bare, with no way for a client to
      // know mg/dL from mmol/L. This caused a clinically risky unit mixup
      // on blood glucose/uric acid in particular (95 mg/dL displayed with
      // the wrong unit label reads as a dangerously different value).
      units: {
        heartRate: latestUnits.heartRate || 'bpm',
        sleepHours: latestUnits.sleepHours || 'hours',
        bloodPressure: latestUnits.bloodPressure || 'mmHg',
        spo2: latestUnits.spo2 || '%',
        temperature: latestUnits.temperature || null,
        bloodGlucose: latestUnits.bloodGlucose || null,
        hrv: latestUnits.hrv || 'ms',
        uricAcid: latestUnits.uricAcid || null,
        totalCholesterol: latestUnits.totalCholesterol || null,
      },
    };

    // Include advanced metrics if requested
    if (includeAdvanced === 'true' || includeAdvanced === true) {
      response.advanced = {
        lastUpdated: latestTimestamp,
        dataSourceCount: healthRecords.length,
        dataSources: [...new Set(healthRecords.map(r => r.source))],
      };
    }

    res.json(response);
  } catch (error) {
    console.error('Error fetching health metrics:', error);
    res.status(500).json({ 
      error: 'Failed to fetch health metrics',
      message: error.message 
    });
  }
});

/**
 * GET /api/health/summary
 * Get health summary with trends over specified period
 */
router.get('/summary', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { days = 7 } = req.query;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    const query = `
      SELECT 
        data_type,
        value,
        source,
        recorded_at
      FROM health_data
      WHERE user_id = $1 AND recorded_at >= $2
      ORDER BY recorded_at DESC
    `;

    const [healthRecords] = await postgresSequelize.query(query, {
      bind: [userId, startDate.toISOString()],
    });

    // Aggregate daily averages
    const dailyData = {};
    
    for (const record of healthRecords) {
      const date = new Date(record.recorded_at).toISOString().split('T')[0];
      
      if (!dailyData[date]) {
        dailyData[date] = {};
      }

      if (!dailyData[date][record.data_type]) {
        dailyData[date][record.data_type] = [];
      }

      dailyData[date][record.data_type].push(parseFloat(record.value));
    }

    // Calculate averages
    const daily = [];
    for (const [date, data] of Object.entries(dailyData)) {
      const dayData = { date };
      
      for (const [type, values] of Object.entries(data)) {
        const avg = values.reduce((a, b) => a + b, 0) / values.length;
        const key = type.toLowerCase().replace(/\s+/g, '_');
        dayData[key] = Math.round(avg * 100) / 100;
      }

      daily.push(dayData);
    }

    // Calculate averages across period
    const allValues = {};
    for (const dayData of daily) {
      for (const [key, value] of Object.entries(dayData)) {
        if (key !== 'date' && typeof value === 'number') {
          if (!allValues[key]) allValues[key] = [];
          allValues[key].push(value);
        }
      }
    }

    const averages = {};
    for (const [key, values] of Object.entries(allValues)) {
      averages[key] = Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100;
    }

    res.json({
      daily: daily.reverse(),
      averages,
      period: days,
    });
  } catch (error) {
    console.error('Error fetching health summary:', error);
    res.status(500).json({ 
      error: 'Failed to fetch health summary',
      message: error.message 
    });
  }
});

export default router;
