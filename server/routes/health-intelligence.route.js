import express from 'express';
import authUser from '../middleware/auth.js';
import healthReminderService from '../services/healthReminder.service.js';

const router = express.Router();

/**
 * GET /api/health-intelligence
 * Get personalized health intelligence dashboard for user
 * Includes: Reminders, Diet suggestions, Activity recommendations, Health insights
 */
router.get('/', authUser, async (req, res) => {
  try {
    const userId = req.user.id;

    // Generate personalized health reminders
    const reminders = await healthReminderService.generateReminders(userId);

    // Organize reminders by type
    const intelligence = {
      user_id: userId,
      generated_at: new Date().toISOString(),
      summary: {
        total_reminders: reminders.length,
        high_priority: reminders.filter(r => r.priority >= 8).length,
        actionable: reminders.filter(r => r.actionable).length
      },
      categories: {
        medication: reminders.filter(r => r.type === 'medication'),
        checkups: reminders.filter(r => r.type === 'checkup'),
        lifestyle: reminders.filter(r => r.type === 'lifestyle'),
        diet: reminders.filter(r => r.type === 'diet'),
        activity: reminders.filter(r => r.type === 'activity'),
        vitals: reminders.filter(r => r.type === 'vitals'),
        lab_tests: reminders.filter(r => r.type === 'lab_test')
      },
      all_reminders: reminders
    };

    res.json({
      success: true,
      data: intelligence,
      message: 'Dr. iSHA\'s Health Intelligence Dashboard generated successfully'
    });

  } catch (error) {
    console.error('Error generating health intelligence:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate health intelligence dashboard',
      details: error.message
    });
  }
});

/**
 * GET /api/health-intelligence/reminders/:type
 * Get reminders of a specific type
 */
router.get('/reminders/:type', authUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const { type } = req.params;

    const allReminders = await healthReminderService.generateReminders(userId);
    const filteredReminders = allReminders.filter(r => r.type === type);

    res.json({
      success: true,
      data: {
        type,
        count: filteredReminders.length,
        reminders: filteredReminders
      }
    });

  } catch (error) {
    console.error('Error fetching reminders:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch reminders',
      details: error.message
    });
  }
});

/**
 * POST /api/health-intelligence/action
 * Mark a reminder as completed or dismissed
 */
router.post('/action', authUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const { reminder_id, action_type, action_data } = req.body;

    // TODO: Implement action logging in database
    // For now, just acknowledge the action

    res.json({
      success: true,
      message: `Action ${action_type} completed for reminder ${reminder_id}`,
      data: {
        user_id: userId,
        reminder_id,
        action_type,
        action_data,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Error processing reminder action:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process reminder action',
      details: error.message
    });
  }
});

export default router;
