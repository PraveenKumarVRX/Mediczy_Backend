import express from "express";
import axios from "axios";

const router = express.Router();

// Helper function to process request parameters
const processRequestParams = (req) => {
  // Get the access token from the request headers
  const accessToken = req.headers.authorization?.split(" ")[1];
  
  if (!accessToken) {
    return { error: "Access token is required", status: 401 };
  }

  // Get parameters from either query (GET) or body (POST)
  const params = req.method === 'GET' ? req.query : req.body;
  
  // Extract parameters
  const { startTimeMillis, endTimeMillis } = params;
  
  // Handle the aggregateBy parameter which could be an array or a string
  let aggregateBy = params.aggregateBy;
  if (typeof aggregateBy === 'string') {
    try {
      // Try to parse it as JSON
      aggregateBy = JSON.parse(aggregateBy);
    } catch (e) {
      // If it's not valid JSON, keep it as is
      console.warn("Could not parse aggregateBy as JSON:", e);
    }
  }
  
  // Handle bucketByTime parameter
  let bucketByTime = params.bucketByTime;
  if (typeof bucketByTime === 'string') {
    try {
      bucketByTime = JSON.parse(bucketByTime);
    } catch (e) {
      console.warn("Could not parse bucketByTime as JSON:", e);
    }
  }

  return {
    accessToken,
    data: {
      aggregateBy,
      startTimeMillis,
      endTimeMillis,
      bucketByTime
    }
  };
};

// Proxy endpoint for Google Fitness API - supports both GET and POST
router.route("/google-fitness")
  .get(async (req, res) => {
    console.log('Received GET request to /api/google-fitness');
    try {
      const { accessToken, data, error, status } = processRequestParams(req);
      
      if (error) {
        console.log('Error in GET request:', error);
        return res.status(status).json({ message: error });
      }

      console.log('Making request to Google Fitness API with data:', JSON.stringify(data).substring(0, 100) + '...');
      
      // Make the request to Google Fitness API
      const response = await axios({
        method: 'POST', // Google Fitness API uses POST for dataset:aggregate
        url: 'https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        data
      });

      console.log('Received response from Google Fitness API:', response.status);
      
      // Log the complete response data for debugging
      console.log('Google Fitness API Response Data:');
      console.log(JSON.stringify(response.data, null, 2));
      
      // If there are buckets, log the first bucket's data in detail
      if (response.data.bucket && response.data.bucket.length > 0) {
        console.log('First bucket details:');
        console.log(JSON.stringify(response.data.bucket[0], null, 2));
        
        // Log step count data if available
        if (response.data.bucket[0].dataset && response.data.bucket[0].dataset.length > 0) {
          console.log('Step count data:');
          console.log(JSON.stringify(response.data.bucket[0].dataset[0], null, 2));
          
          // Log calories data if available
          if (response.data.bucket[0].dataset.length > 1) {
            console.log('Calories data:');
            console.log(JSON.stringify(response.data.bucket[0].dataset[1], null, 2));
          }
        }
      }
      
      // Return the response from Google Fitness API
      return res.json(response.data);
    } catch (error) {
      console.error("Error proxying Google Fitness API:", error.response?.data || error.message);
      return res.status(error.response?.status || 500).json({
        message: "Error fetching fitness data",
        error: error.response?.data || error.message,
      });
    }
  })
  .post(async (req, res) => {
    console.log('Received POST request to /api/google-fitness');
    try {
      const { accessToken, data, error, status } = processRequestParams(req);
      
      if (error) {
        console.log('Error in POST request:', error);
        return res.status(status).json({ message: error });
      }

      console.log('Making request to Google Fitness API with data:', JSON.stringify(data, null, 2));
      
      // Make the request to Google Fitness API
      const response = await axios({
        method: 'POST',
        url: 'https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        data
      });

      console.log('Received response from Google Fitness API:', response.status);
      
      // Log the complete response data for debugging
      console.log('Google Fitness API Response Data:');
      console.log(JSON.stringify(response.data, null, 2));
      
      // If there are buckets, log the first bucket's data in detail
      if (response.data.bucket && response.data.bucket.length > 0) {
        console.log('First bucket details:');
        console.log(JSON.stringify(response.data.bucket[0], null, 2));
        
        // Log step count data if available
        if (response.data.bucket[0].dataset && response.data.bucket[0].dataset.length > 0) {
          console.log('Step count data:');
          console.log(JSON.stringify(response.data.bucket[0].dataset[0], null, 2));
          
          // Log calories data if available
          if (response.data.bucket[0].dataset.length > 1) {
            console.log('Calories data:');
            console.log(JSON.stringify(response.data.bucket[0].dataset[1], null, 2));
          }
        }
      }
      
      // Return the response from Google Fitness API
      return res.json(response.data);
    } catch (error) {
      console.error("Error proxying Google Fitness API:", error.response?.data || error.message);
      return res.status(error.response?.status || 500).json({
        message: "Error fetching fitness data",
        error: error.response?.data || error.message,
      });
    }
  });

// Import auth middleware and FitnessData model for local endpoints
import auth from '../middleware/auth.js';
import FitnessData from '../models/FitnessData.model.intelligent.js';
import HealthData from '../models/HealthData.model.intelligent.js';

// Store fitness data locally
router.post('/store', auth, async (req, res) => {
  try {
    const { fitnessData } = req.body;
    
    if (!fitnessData || !Array.isArray(fitnessData)) {
      return res.status(400).json({ error: 'Invalid fitness data format' });
    }

    // Prepare bulk operations
    const operations = fitnessData.map(data => ({
      updateOne: {
        filter: { 
          userId: req.user.id,
          date: new Date(data.date)
        },
        update: {
          $set: {
            steps: data.steps || 0,
            calories: data.calories || 0,
            activeMinutes: data.activeMinutes || 0,
            distance: data.distance || 0,
            heartRate: data.heartRate || null,
            sleepHours: data.sleepHours || null,
            updatedAt: new Date()
          }
        },
        upsert: true
      }
    }));

    // Perform bulk write operation
    await FitnessData.bulkWrite(operations);

    res.status(200).json({ message: 'Fitness data stored successfully' });
  } catch (error) {
    console.error('Error storing fitness data:', error);
    res.status(500).json({ error: 'Failed to store fitness data' });
  }
});

// Get user's fitness data
router.get('/data', auth, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    const options = {
      where: { userId: req.user.id }
    };

    // Add date filtering if provided
    if (startDate && endDate) {
      options.where.date = { startDate, endDate };
    }

    const fitnessData = await FitnessData.findAll(options);

    res.json(fitnessData || []);
  } catch (error) {
    console.error('Error fetching fitness data:', error);
    res.status(500).json({ error: 'Failed to fetch fitness data' });
  }
});

// Get user's latest fitness data
router.get('/latest', auth, async (req, res) => {
  try {
    const latestData = await FitnessData.getUserLatestData(req.user.id);

    res.json(latestData || null);
  } catch (error) {
    console.error('Error fetching latest fitness data:', error);
    res.status(500).json({ error: 'Failed to fetch latest fitness data' });
  }
});

// Get user's fitness summary
router.get('/summary', auth, async (req, res) => {
  try {
    const { days = 7 } = req.query;
    const daysNum = parseInt(days);
    
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysNum);

    // Try to get stats from the database
    let summary;
    try {
      summary = await FitnessData.getWeeklyStats(req.user.id, startDate, endDate);
    } catch (dbError) {
      console.warn('Could not fetch from database, returning default summary:', dbError.message);
      // Return a default summary if database is unavailable
      summary = {
        totalSteps: 0,
        totalCalories: 0,
        totalActiveMinutes: 0,
        totalDistance: 0,
        avgSteps: 0,
        avgCalories: 0,
        avgActiveMinutes: 0,
        avgDistance: 0,
        daysTracked: 0,
        dailyData: []
      };
    }

    res.json(summary);
  } catch (error) {
    console.error('Error fetching fitness summary:', error);
    res.status(500).json({ error: 'Failed to fetch fitness summary' });
  }
});

// ─── Google Health Connect receiver ──────────────────────────────────────────
//
// Google Health Connect is an Android-only native SDK — there is NO REST API
// accessible from a web browser. The Mediczy Android app reads data from the
// Health Connect SDK locally and pushes it to these endpoints.
//
// Flow:
//   Android app → Health Connect SDK (local read)
//                → POST /api/fitness/health-connect/sync (pushes to server)
//   Web dashboard → GET  /api/fitness/health-connect/status / summary (reads stored data)


/**
 * POST /api/fitness/health-connect/sync
 * Receives one day of Health Connect data pushed by the Mediczy Android app.
 *
 * Body (single day):
 *   { date, steps, calories, distance, activeMinutes,
 *     heartRate:{avg,min,max}, sleepHours, bloodOxygen,
 *     weight, source:"health_connect", appVersion? }
 *
 * Body (batch — up to 90 days):
 *   { days: [ <same shape as above> ... ] }
 */
router.post('/health-connect/sync', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { days: batchDays, ...singleDay } = req.body;

    // Normalise to array
    const records = Array.isArray(batchDays)
      ? batchDays
      : (singleDay.date ? [singleDay] : []);

    if (records.length === 0) {
      return res.status(400).json({ success: false, error: 'Provide date or days array' });
    }
    if (records.length > 90) {
      return res.status(400).json({ success: false, error: 'Maximum 90 days per batch' });
    }

    let savedCount = 0;
    let failedCount = 0;
    const failedDetails = [];

    for (const r of records) {
      if (!r.date) { failedCount++; failedDetails.push('missing date'); continue; }
      const recordedAt = new Date(r.date);
      const rows = [];
      if (r.steps)                rows.push({ dataType: 'steps',          value: Math.round(r.steps),            unit: 'steps',   recordedAt });
      if (r.calories)             rows.push({ dataType: 'calories',        value: Math.round(r.calories),         unit: 'kcal',    recordedAt });
      if (r.distance)             rows.push({ dataType: 'distance',        value: r.distance,                     unit: 'm',       recordedAt });
      if (r.activeMinutes)        rows.push({ dataType: 'active_minutes',  value: Math.round(r.activeMinutes),    unit: 'min',     recordedAt });
      if (r.heartRate?.avg)       rows.push({ dataType: 'heart_rate',      value: r.heartRate.avg,                unit: 'bpm',     recordedAt, metadata: { min: r.heartRate.min, max: r.heartRate.max, source: 'health_connect' } });
      if (r.sleepHours)           rows.push({ dataType: 'sleep',           value: r.sleepHours,                   unit: 'hours',   recordedAt });
      if (r.bloodOxygen)          rows.push({ dataType: 'spo2',            value: r.bloodOxygen,                  unit: '%',       recordedAt });
      if (r.weight)               rows.push({ dataType: 'weight',          value: r.weight,                       unit: 'kg',      recordedAt });

      for (const row of rows) {
        try {
          if (HealthData) {
            await HealthData.upsert({
              userId,
              ...row,
              source:     'health_connect',
              deviceId:   'android-health-connect',
              deviceName: 'Google Health Connect',
              metadata:   { ...(row.metadata || {}), syncedAt: new Date().toISOString(), appVersion: r.appVersion },
              createdAt:  new Date(),
              updatedAt:  new Date(),
            });
          }
          // Also upsert into FitnessData for backward-compat with /fitness/summary
          if (FitnessData && row.dataType === 'steps') {
            await FitnessData.upsert({
              user_id: userId,
              date: recordedAt,
              steps: row.value,
              calories: r.calories || 0,
              distance: r.distance || 0,
              active_minutes: r.activeMinutes || 0,
              heart_rate_avg: r.heartRate?.avg || null,
              heart_rate_min: r.heartRate?.min || null,
              heart_rate_max: r.heartRate?.max || null,
              sleep_duration: r.sleepHours || null,
              oxygen_saturation: r.bloodOxygen || null,
              weight: r.weight || null,
              source: 'health_connect',
            });
          }
          savedCount++;
        } catch (e) {
          failedCount++;
          failedDetails.push(`${row.dataType}@${r.date}: ${e.message}`);
          console.error('[HealthConnect] upsert failed:', row.dataType, r.date, e.message);
        }
      }
    }

    // Mark user as Health Connect connected
    try {
      const { User } = await import('../models/user.model.intelligent.js');
      await User.update(
        { healthConnectConnected: true, healthConnectLastSync: new Date() },
        { where: { id: userId } }
      );
    } catch (e) {
      console.warn('[HealthConnect] Could not update user status:', e.message);
    }

    const partialFailure = failedCount > 0;
    console.log(`[HealthConnect] user=${userId} saved=${savedCount} failed=${failedCount}`);

    res.json({
      success: true,
      savedCount,
      failedCount,
      partialFailure,
      ...(process.env.NODE_ENV !== 'production' && failedDetails.length ? { failedDetails } : {}),
    });
  } catch (err) {
    console.error('[HealthConnect] sync error:', err.message);
    res.status(500).json({ success: false, error: 'Health Connect sync failed: ' + err.message });
  }
});

/**
 * GET /api/fitness/health-connect/status
 * Returns connection status and last sync timestamp.
 */
router.get('/health-connect/status', auth, async (req, res) => {
  try {
    const { User } = await import('../models/user.model.intelligent.js');
    const user = await User.findByPk(req.user.id, {
      attributes: ['healthConnectConnected', 'healthConnectLastSync'],
    });

    // Fallback: if columns don't exist yet, check HealthData for any records
    let connected = user?.healthConnectConnected || false;
    let lastSync  = user?.healthConnectLastSync  || null;

    if (!connected && HealthData) {
      try {
        const latest = await HealthData.findOne({
          where: { userId: req.user.id, source: 'health_connect' },
          order: [['createdAt', 'DESC']],
          attributes: ['createdAt'],
        });
        if (latest) { connected = true; lastSync = latest.createdAt; }
      } catch { /* HealthData may not have health_connect records */ }
    }

    res.json({ success: true, connected, lastSync });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * DELETE /api/fitness/health-connect/disconnect
 * Clears the Health Connect connection flag and optionally deletes stored data.
 */
router.delete('/health-connect/disconnect', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { deleteData = false } = req.query;

    const { User } = await import('../models/user.model.intelligent.js');
    await User.update(
      { healthConnectConnected: false, healthConnectLastSync: null },
      { where: { id: userId } }
    ).catch(() => {});

    let deletedRows = 0;
    if (deleteData === 'true' && HealthData) {
      const result = await HealthData.destroy({
        where: { userId, source: 'health_connect' },
      }).catch(() => 0);
      deletedRows = result || 0;
    }

    res.json({ success: true, deletedRows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Legacy /google/* aliases (kept for backward compat, delegate to HC) ─────
// Remove after Android app is fully migrated.
router.post('/google/fetch', auth, (req, res) =>
  res.status(410).json({ error: 'Google Fit is deprecated. Use POST /api/fitness/health-connect/sync from the Android app.' })
);
router.get('/google/status', auth, async (req, res) => {
  // Forward to health-connect/status transparently
  try {
    const { User } = await import('../models/user.model.intelligent.js');
    const user = await User.findByPk(req.user.id, { attributes: ['healthConnectConnected', 'healthConnectLastSync'] });
    res.json({ connected: user?.healthConnectConnected || false, lastSync: user?.healthConnectLastSync || null });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
router.delete('/google/disconnect', auth, async (req, res) => {
  try {
    const { User } = await import('../models/user.model.intelligent.js');
    await User.update({ healthConnectConnected: false, healthConnectLastSync: null }, { where: { id: req.user.id } });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;