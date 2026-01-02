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

export default router; 