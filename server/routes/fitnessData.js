import express from 'express';
import FitnessData from '../models/FitnessData.model.intelligent.js';
import auth from '../middleware/auth.js';

const router = express.Router();

// Store fitness data
router.post('/store', auth, async (req, res) => {
  try {
    const { fitnessData } = req.body;
    
    // Prepare bulk operations
    const operations = fitnessData.map(data => ({
      updateOne: {
        filter: { 
          userId: req.user.id,
          date: new Date(data.date)
        },
        update: {
          $set: {
            steps: data.steps,
            calories: data.calories,
            activeMinutes: data.activeMinutes,
            distance: data.distance,
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
router.get('/', auth, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    const options = {
      where: { userId: req.user.id }
    };

    // Add date filtering if provided
    if (startDate && endDate) {
      // Simplified date filtering for intelligent database
      options.where.date = { startDate, endDate };
    }

    const fitnessData = await FitnessData.findAll(options);

    res.json(fitnessData);
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
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));
    const endDate = new Date();

    const summary = await FitnessData.getWeeklyStats(req.user.id, startDate, endDate);

    res.json(summary);
  } catch (error) {
    console.error('Error fetching fitness summary:', error);
    res.status(500).json({ error: 'Failed to fetch fitness summary' });
  }
});

export default router; 