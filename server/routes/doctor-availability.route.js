import express from 'express';
import { body, param, query } from 'express-validator';
import { authUser } from '../middleware/auth.middleware.js';
import doctorModel from '../models/doctor.model.intelligent.js';

const router = express.Router();

/**
 * @route   GET /api/doctors/availability/dashboard
 * @desc    Get doctor's availability dashboard
 * @access  Private (Doctor)
 */
router.get('/dashboard', authUser, async (req, res) => {
  try {
    if (req.user.role !== 'doctor') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Doctor role required.'
      });
    }

    const doctor = await doctorModel.findByPk(req.user.id);
    if (!doctor) {
      return res.status(404).json({
        success: false,
        message: 'Doctor not found'
      });
    }

    // Calculate availability statistics
    const weeklyAvailability = doctor.weeklyAvailability;
    const availableDays = Object.values(weeklyAvailability).filter(day => day.isAvailable).length;
    const totalSlots = Object.values(weeklyAvailability).reduce((total, day) => total + (day.slots?.length || 0), 0);
    
    // Get consultation type statistics
    const consultationStats = {
      online: doctor.consultationTypes.online.available,
      walkIn: doctor.consultationTypes.walkIn.available,
      homeVisit: doctor.consultationTypes.homeVisit.available
    };

    res.json({
      success: true,
      dashboard: {
        weeklyAvailability,
        statistics: {
          availableDays,
          totalSlots,
          consultationTypes: consultationStats
        },
        consultationFees: doctor.consultationTypes
      }
    });
  } catch (error) {
    console.error('Get availability dashboard error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch availability dashboard',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/doctors/availability/bulk-update
 * @desc    Bulk update weekly availability
 * @access  Private (Doctor)
 */
router.post('/bulk-update', authUser, [
  body('monday.isAvailable').optional().isBoolean(),
  body('monday.slots').optional().isArray(),
  body('tuesday.isAvailable').optional().isBoolean(),
  body('tuesday.slots').optional().isArray(),
  body('wednesday.isAvailable').optional().isBoolean(),
  body('wednesday.slots').optional().isArray(),
  body('thursday.isAvailable').optional().isBoolean(),
  body('thursday.slots').optional().isArray(),
  body('friday.isAvailable').optional().isBoolean(),
  body('friday.slots').optional().isArray(),
  body('saturday.isAvailable').optional().isBoolean(),
  body('saturday.slots').optional().isArray(),
  body('sunday.isAvailable').optional().isBoolean(),
  body('sunday.slots').optional().isArray()
], async (req, res) => {
  try {
    if (req.user.role !== 'doctor') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Doctor role required.'
      });
    }

    // Validate slot times
    const validateSlots = (slots) => {
      return slots.every(slot => {
        const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
        const validConsultationType = ['online', 'walkIn', 'both'].includes(slot.consultationType);
        const validTimes = timeRegex.test(slot.startTime) && timeRegex.test(slot.endTime);
        const validTimeOrder = slot.startTime < slot.endTime;
        
        return validConsultationType && validTimes && validTimeOrder;
      });
    };

    // Validate all slots in the request
    for (const [day, dayData] of Object.entries(req.body)) {
      if (dayData.slots && !validateSlots(dayData.slots)) {
        return res.status(400).json({
          success: false,
          message: `Invalid slots for ${day}. Please check time format and consultation types.`
        });
      }
    }

    const doctor = await doctorModel.findByPk(req.user.id);
    if (!doctor) {
      return res.status(404).json({ success: false, message: 'Doctor not found' });
    }

    // Merge incoming days with existing weeklyAvailability
    const existing = (doctor.dataValues || doctor).weeklyAvailability || {};
    const updated = { ...existing };
    const DAYS = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
    for (const day of DAYS) {
      if (req.body[day] !== undefined) {
        updated[day] = req.body[day];
      }
    }

    await doctorModel.update(req.user.id, { weeklyAvailability: updated });
    
    res.json({
      success: true,
      message: 'Weekly availability updated successfully'
    });
  } catch (error) {
    console.error('Bulk update availability error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update availability',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/doctors/availability/quick-setup
 * @desc    Quick setup availability with templates
 * @access  Private (Doctor)
 */
router.post('/quick-setup', authUser, [
  body('template').isIn(['weekdays-only', 'weekend-only', 'full-week', 'custom']),
  body('timeSlots').isArray(),
  body('consultationTypes').isArray(),
  body('excludeDays').optional().isArray()
], async (req, res) => {
  try {
    if (req.user.role !== 'doctor') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Doctor role required.'
      });
    }

    const { template, timeSlots, consultationTypes, excludeDays = [] } = req.body;
    
    // Create availability based on template
    const weeklyAvailability = {};
    const allDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    
    let workingDays = [];
    switch (template) {
      case 'weekdays-only':
        workingDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
        break;
      case 'weekend-only':
        workingDays = ['saturday', 'sunday'];
        break;
      case 'full-week':
        workingDays = allDays;
        break;
      case 'custom':
        workingDays = allDays.filter(day => !excludeDays.includes(day));
        break;
    }

    allDays.forEach(day => {
      const isWorkingDay = workingDays.includes(day);
      weeklyAvailability[day] = {
        isAvailable: isWorkingDay,
        slots: isWorkingDay ? timeSlots.map(slot => ({
          ...slot,
          consultationType: consultationTypes.length === 1 ? consultationTypes[0] : 'both'
        })) : []
      };
    });

    await doctorModel.update(req.user.id, { weeklyAvailability });
    
    res.json({
      success: true,
      message: 'Quick availability setup completed',
      weeklyAvailability
    });
  } catch (error) {
    console.error('Quick setup availability error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to setup availability',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/doctors/availability/templates
 * @desc    Get availability templates
 * @access  Private (Doctor)
 */
router.get('/templates', authUser, (req, res) => {
  try {
    const templates = {
      'weekdays-only': {
        name: 'Weekdays Only',
        description: 'Available Monday to Friday',
        days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
        suggestedSlots: [
          { startTime: '09:00', endTime: '12:00', consultationType: 'both' },
          { startTime: '14:00', endTime: '17:00', consultationType: 'both' }
        ]
      },
      'weekend-only': {
        name: 'Weekends Only',
        description: 'Available Saturday and Sunday',
        days: ['saturday', 'sunday'],
        suggestedSlots: [
          { startTime: '10:00', endTime: '13:00', consultationType: 'both' },
          { startTime: '15:00', endTime: '18:00', consultationType: 'both' }
        ]
      },
      'full-week': {
        name: 'Full Week',
        description: 'Available all 7 days',
        days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
        suggestedSlots: [
          { startTime: '09:00', endTime: '12:00', consultationType: 'both' },
          { startTime: '14:00', endTime: '17:00', consultationType: 'both' }
        ]
      },
      'morning-only': {
        name: 'Morning Only',
        description: 'Morning slots across all days',
        days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'],
        suggestedSlots: [
          { startTime: '08:00', endTime: '12:00', consultationType: 'both' }
        ]
      },
      'evening-only': {
        name: 'Evening Only',
        description: 'Evening slots across all days',
        days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'],
        suggestedSlots: [
          { startTime: '17:00', endTime: '21:00', consultationType: 'both' }
        ]
      }
    };

    res.json({
      success: true,
      templates
    });
  } catch (error) {
    console.error('Get templates error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch templates',
      error: error.message
    });
  }
});

/**
 * @route   DELETE /api/doctors/availability/slots
 * @desc    Clear all availability slots
 * @access  Private (Doctor)
 */
router.delete('/slots', authUser, async (req, res) => {
  try {
    if (req.user.role !== 'doctor') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Doctor role required.'
      });
    }

    const emptyAvailability = {
      monday: { slots: [], isAvailable: false },
      tuesday: { slots: [], isAvailable: false },
      wednesday: { slots: [], isAvailable: false },
      thursday: { slots: [], isAvailable: false },
      friday: { slots: [], isAvailable: false },
      saturday: { slots: [], isAvailable: false },
      sunday: { slots: [], isAvailable: false }
    };

    await doctorModel.update(req.user.id, { weeklyAvailability: emptyAvailability });
    
    res.json({
      success: true,
      message: 'All availability slots cleared'
    });
  } catch (error) {
    console.error('Clear slots error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to clear slots',
      error: error.message
    });
  }
});

export default router;