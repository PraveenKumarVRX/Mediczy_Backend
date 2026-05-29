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

// ─── Google Fit server-side proxy ────────────────────────────────────────────
//
// These routes receive the user's Google access token (obtained client-side via
// @react-oauth/google implicit flow) and proxy all Google Fitness REST API calls
// through the server — avoiding any browser CORS/CSP issues and storing data.

const GFIT_AGGREGATE = 'https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate';
const GFIT_SESSIONS  = 'https://www.googleapis.com/fitness/v1/users/me/sessions';

/**
 * POST /api/fitness/google/fetch
 * Body: { googleAccessToken, days? }
 * Auth: mediczy JWT (user must be logged in)
 *
 * Fetches activity + heart rate + sleep data from Google Fit using the
 * access token supplied by the client, stores it, and returns processed data.
 */
router.post('/google/fetch', auth, async (req, res) => {
  try {
    const { googleAccessToken, days = 7 } = req.body;
    if (!googleAccessToken) {
      return res.status(400).json({ error: 'googleAccessToken is required' });
    }

    const userId = req.user.id;
    const endTime   = new Date();
    const startTime = new Date();
    startTime.setDate(startTime.getDate() - parseInt(days));

    const gHeaders = {
      Authorization: `Bearer ${googleAccessToken}`,
      'Content-Type': 'application/json',
    };

    // ── 1. Activity + heart rate aggregate ──────────────────────────────────
    const activityPayload = {
      aggregateBy: [
        { dataTypeName: 'com.google.step_count.delta'   },
        { dataTypeName: 'com.google.calories.expended'  },
        { dataTypeName: 'com.google.distance.delta'      },
        { dataTypeName: 'com.google.active_minutes'      },
        { dataTypeName: 'com.google.heart_rate.bpm'      },
      ],
      startTimeMillis: startTime.getTime(),
      endTimeMillis:   endTime.getTime(),
      bucketByTime: { durationMillis: 86400000 }, // daily buckets
    };

    let activityData = { bucket: [] };
    try {
      const resp = await axios.post(GFIT_AGGREGATE, activityPayload, { headers: gHeaders, timeout: 12000 });
      activityData = resp.data;
    } catch (err) {
      console.error('[GoogleFit] activity fetch error:', err.response?.data?.error?.message || err.message);
      // If 401, return meaningful error
      if (err.response?.status === 401) {
        return res.status(401).json({ error: 'Google access token expired. Please reconnect Google Fit.' });
      }
      if (err.response?.status === 403) {
        return res.status(403).json({ error: 'Google Fit permission denied. Ensure fitness scopes were granted.' });
      }
    }

    // ── 2. Sleep sessions ────────────────────────────────────────────────────
    let sleepSessions = [];
    try {
      const sleepResp = await axios.get(GFIT_SESSIONS, {
        headers: gHeaders,
        timeout: 10000,
        params: {
          startTime:    startTime.toISOString(),
          endTime:      endTime.toISOString(),
          activityType: 72,  // Google Fit activity type for SLEEP
        },
      });
      sleepSessions = sleepResp.data?.session || [];
    } catch (err) {
      console.error('[GoogleFit] sleep fetch error:', err.response?.data?.error?.message || err.message);
    }

    // ── 3. Parse activity buckets (find dataset by dataTypeName, not index) ─
    const dailyData = [];

    for (const bucket of activityData.bucket || []) {
      const date = new Date(parseInt(bucket.startTimeMillis)).toLocaleDateString('en-CA');

      let steps = 0, calories = 0, distance = 0, activeMinutes = 0;
      let hrMin = 0, hrMax = 0, hrAvg = 0;

      for (const ds of (bucket.dataset || [])) {
        const src = ds.dataSourceId || '';
        const pt  = ds.point?.[0];
        if (!pt) continue;
        const vals = pt.value || [];

        if (src.includes('step_count') || src.includes('steps')) {
          steps = Math.round(vals[0]?.intVal ?? vals[0]?.fpVal ?? 0);
        } else if (src.includes('calories')) {
          calories = Math.round(vals[0]?.fpVal ?? vals[0]?.intVal ?? 0);
        } else if (src.includes('distance')) {
          distance = Math.round((vals[0]?.fpVal ?? vals[0]?.intVal ?? 0) * 100) / 100;
        } else if (src.includes('active_minutes') || src.includes('move_minutes')) {
          activeMinutes = Math.round(vals[0]?.intVal ?? vals[0]?.fpVal ?? 0);
        } else if (src.includes('heart_rate')) {
          // Google Fit heart_rate aggregate returns: [avg, min, max] in value array
          // Each entry is {fpVal: number} — guard each index defensively
          hrAvg = Math.round(vals[0]?.fpVal ?? vals[0]?.intVal ?? 0);
          hrMin = vals.length > 1 ? Math.round(vals[1]?.fpVal ?? vals[1]?.intVal ?? 0) : 0;
          hrMax = vals.length > 2 ? Math.round(vals[2]?.fpVal ?? vals[2]?.intVal ?? 0) : 0;
        }
      }

      dailyData.push({ date, steps, calories, distance, activeMinutes, heartRate: { avg: hrAvg, min: hrMin, max: hrMax } });
    }

    // ── 4. Parse sleep sessions ──────────────────────────────────────────────
    const sleepByDate = {};
    for (const session of sleepSessions) {
      const date = new Date(parseInt(session.startTimeMillis)).toLocaleDateString('en-CA');
      const durationMs = parseInt(session.endTimeMillis) - parseInt(session.startTimeMillis);
      const durationHours = Math.round((durationMs / 3_600_000) * 10) / 10;
      sleepByDate[date] = (sleepByDate[date] || 0) + durationHours;
    }

    // Merge sleep into daily data
    for (const day of dailyData) {
      day.sleepHours = sleepByDate[day.date] ?? null;
    }

    // ── 5. Persist to health_data ────────────────────────────────────────────
    let savedCount = 0;
    if (HealthData) {
      for (const day of dailyData) {
        const rAt = new Date(day.date);
        const rows = [];
        if (day.steps)         rows.push({ dataType: 'steps',        value: day.steps,         unit: 'steps',  recordedAt: rAt });
        if (day.calories)      rows.push({ dataType: 'calories',     value: day.calories,      unit: 'kcal',   recordedAt: rAt });
        if (day.distance)      rows.push({ dataType: 'distance',     value: day.distance,      unit: 'm',      recordedAt: rAt });
        if (day.activeMinutes) rows.push({ dataType: 'active_minutes', value: day.activeMinutes, unit: 'min',  recordedAt: rAt });
        if (day.heartRate?.avg) rows.push({ dataType: 'heart_rate', value: day.heartRate.avg, unit: 'bpm',   recordedAt: rAt });
        if (day.sleepHours)    rows.push({ dataType: 'sleep',        value: day.sleepHours,    unit: 'hours',  recordedAt: rAt });

        for (const row of rows) {
          try {
            await HealthData.upsert({
              userId,
              ...row,
              source:     'google_fit',
              deviceId:   'google-fit',
              deviceName: 'Google Fit',
              metadata:   { syncedAt: new Date().toISOString() },
              createdAt:  new Date(),
              updatedAt:  new Date(),
            });
            savedCount++;
          } catch (upsertErr) {
            console.error('[GoogleFit] upsert failed for', row.dataType, row.recordedAt, upsertErr.message);
          }
        }
      }
    }

    // ── 6. Update user connection status ────────────────────────────────────
    try {
      const { User } = await import('../models/user.model.intelligent.js');
      await User.update(
        { googleFitConnected: true, googleFitLastSync: new Date() },
        { where: { id: userId } }
      );
    } catch (e) {
      console.warn('[GoogleFit] Could not update user fit status:', e.message);
    }

    const summary = {
      totalSteps:        dailyData.reduce((s, d) => s + d.steps, 0),
      avgSteps:          Math.round(dailyData.reduce((s, d) => s + d.steps, 0) / (dailyData.length || 1)),
      totalCalories:     dailyData.reduce((s, d) => s + d.calories, 0),
      avgActiveMinutes:  Math.round(dailyData.reduce((s, d) => s + d.activeMinutes, 0) / (dailyData.length || 1)),
      avgHeartRate:      Math.round(dailyData.filter(d => d.heartRate.avg).reduce((s, d) => s + d.heartRate.avg, 0) / (dailyData.filter(d => d.heartRate.avg).length || 1)),
      avgSleepHours:     Math.round(dailyData.filter(d => d.sleepHours).reduce((s, d) => s + d.sleepHours, 0) / (dailyData.filter(d => d.sleepHours).length || 1) * 10) / 10,
      sleepDaysTracked:  dailyData.filter(d => d.sleepHours).length,
      daysTracked:       dailyData.length,
    };

    console.log(`[GoogleFit] Synced ${savedCount} records for user ${userId}. Sleep sessions: ${sleepSessions.length}`);

    res.json({ success: true, dailyData, summary, savedCount, sleepSessionCount: sleepSessions.length });
  } catch (err) {
    console.error('[GoogleFit] fetch error:', err.message);
    res.status(500).json({ error: 'Failed to fetch Google Fit data: ' + err.message });
  }
});

/**
 * GET /api/fitness/google/status
 * Returns whether the logged-in user has Google Fit connected.
 */
router.get('/google/status', auth, async (req, res) => {
  try {
    const { User } = await import('../models/user.model.intelligent.js');
    const user = await User.findByPk(req.user.id, {
      attributes: ['googleFitConnected', 'googleFitLastSync'],
    });
    res.json({
      connected:   user?.googleFitConnected || false,
      lastSync:    user?.googleFitLastSync   || null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/fitness/google/disconnect
 * Clears the Google Fit connection flag for the user.
 */
router.delete('/google/disconnect', auth, async (req, res) => {
  try {
    const { User } = await import('../models/user.model.intelligent.js');
    await User.update(
      { googleFitConnected: false, googleFitLastSync: null },
      { where: { id: req.user.id } }
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router; 