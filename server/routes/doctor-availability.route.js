import express from 'express';
import { body, param, query } from 'express-validator';
import { authUser } from '../middleware/auth.middleware.js';
import doctorModel from '../models/doctor.model.intelligent.js';
import {
  normalizeWeeklyAvailability,
  normalizeConsultationTypes,
  normalizeWeeklySchedule,
} from '../utils/doctorNormalizer.js';

const ALLOWED_SLOT_DURATIONS = [15, 20, 30, 45, 60];

const normalizeSlotDuration = (value, fallback = 30) => {
  const parsed = parseInt(value, 10);
  return ALLOWED_SLOT_DURATIONS.includes(parsed) ? parsed : fallback;
};

const router = express.Router();

// Thin wrappers kept for local call-site readability
const getWeeklyAvailability   = (doctor) => normalizeWeeklyAvailability(doctor?.weeklyAvailability);
const getConsultationTypes     = (doctor) => normalizeConsultationTypes(doctor?.consultationTypes);

/**
 * @route   GET /api/doctors/availability
 * @desc    Root — returns doctor's full availability profile (schedule + consultation types)
 * @access  Private (Doctor)
 */
router.get('/', authUser, async (req, res) => {
  try {
    if (req.user.role !== 'doctor') {
      return res.status(403).json({ success: false, message: 'Access denied. Doctor role required.' });
    }
    const doctor = await doctorModel.findByPk(req.user.id);
    if (!doctor) return res.status(404).json({ success: false, message: 'Doctor not found' });

    res.json({
      success: true,
      data: {
        slotDuration: doctor.slotDuration || 30,
        weeklyAvailability: getWeeklyAvailability(doctor),
        weeklySchedule:     normalizeWeeklySchedule(doctor.weeklySchedule) ?? undefined,
        consultationTypes:  getConsultationTypes(doctor),
        isAvailable:        doctor.isAvailable,
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch availability', error: error.message });
  }
});

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
    const weeklyAvailability = getWeeklyAvailability(doctor);
    const consultationTypes = getConsultationTypes(doctor);
    const availableDays = Object.values(weeklyAvailability).filter(day => day?.isAvailable).length;
    const totalSlots = Object.values(weeklyAvailability).reduce((total, day) => total + (day?.slots?.length || 0), 0);
    
    // Get consultation type statistics
    const consultationStats = {
      online: Boolean(consultationTypes.online?.available),
      walkIn: Boolean(consultationTypes.walkIn?.available),
      homeVisit: Boolean(consultationTypes.homeVisit?.available)
    };

    res.json({
      success: true,
      dashboard: {
        slotDuration: doctor.slotDuration || 30,
        weeklyAvailability,
        statistics: {
          availableDays,
          totalSlots,
          consultationTypes: consultationStats
        },
        consultationFees: consultationTypes
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

    const DAYS = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
    const payload = (
      req.body &&
      typeof req.body === 'object' &&
      req.body.weeklyAvailability &&
      typeof req.body.weeklyAvailability === 'object'
    )
      ? req.body.weeklyAvailability
      : req.body;

    const doctor = await doctorModel.findByPk(req.user.id);
    if (!doctor) {
      return res.status(404).json({ success: false, message: 'Doctor not found' });
    }

    const doctorSlotDuration = normalizeSlotDuration(
      payload?.slotDuration ?? req.body?.slotDuration,
      doctor.slotDuration || 30
    );

    // Pad single-digit hours so time strings are always HH:MM for correct comparison
    const padTime = (t = '') => {
      const s = String(t).trim();
      return /^\d:[0-5]\d$/.test(s) ? `0${s}` : s;
    };

    // Normalize app variants: walkin/walkIn/in-person, start/end aliases.
    const normalizeSlots = (slots = []) => {
      return slots.map((slot) => {
        const rawType = String(slot?.consultationType || slot?.type || 'both').trim().toLowerCase();
        const consultationType = rawType === 'walkin' || rawType === 'in-person' ? 'walkIn' :
          (rawType === 'online' || rawType === 'walkIn' || rawType === 'both' ? rawType : 'both');

        const normalized = {
          startTime: padTime(slot?.startTime || slot?.start || ''),
          endTime: padTime(slot?.endTime || slot?.end || ''),
          consultationType
        };

        const explicitDuration = parseInt(slot?.slotDuration, 10);
        if (ALLOWED_SLOT_DURATIONS.includes(explicitDuration)) {
          normalized.slotDuration = explicitDuration;
        }

        const maxPatients = parseInt(slot?.maxPatients, 10);
        if (Number.isFinite(maxPatients) && maxPatients > 0) {
          normalized.maxPatients = maxPatients;
        }

        return normalized;
      });
    };

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
    for (const day of DAYS) {
      const dayData = payload?.[day];
      if (!dayData) continue;
      const normalizedDaySlots = normalizeSlots(Array.isArray(dayData?.slots) ? dayData.slots : []);
      if (normalizedDaySlots.length > 0 && !validateSlots(normalizedDaySlots)) {
        return res.status(400).json({
          success: false,
          message: `Invalid slots for ${day}. Please check time format and consultation types.`
        });
      }
    }

    // Merge incoming days with existing weeklyAvailability
    const existingRaw = (doctor.dataValues || doctor).weeklyAvailability;
    const existing = typeof existingRaw === 'string'
      ? (() => {
          try {
            return JSON.parse(existingRaw);
          } catch {
            return {};
          }
        })()
      : (existingRaw || {});
    const updated = { ...existing };
    for (const day of DAYS) {
      if (payload?.[day] !== undefined) {
        const dayInput = payload[day] || {};
        const existingDay = existing?.[day] || {};
        updated[day] = {
          isAvailable: dayInput.isAvailable === undefined ? Boolean(existingDay.isAvailable) : Boolean(dayInput.isAvailable),
          slots: normalizeSlots(Array.isArray(dayInput.slots) ? dayInput.slots : [])
        };
      }
    }

    const updatePayload = { weeklyAvailability: updated };
    if (payload?.slotDuration !== undefined || req.body?.slotDuration !== undefined) {
      updatePayload.slotDuration = doctorSlotDuration;
    }

    await doctorModel.update(req.user.id, updatePayload);
    
    res.json({
      success: true,
      message: 'Weekly availability updated successfully',
      slotDuration: updatePayload.slotDuration ?? doctor.slotDuration ?? 30,
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