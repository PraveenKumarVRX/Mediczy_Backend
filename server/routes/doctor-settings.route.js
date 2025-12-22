import express from 'express';
import { body, validationResult } from 'express-validator';
import { authUser } from '../middleware/auth.middleware.js';
import { Doctor } from '../models/index.js';

const router = express.Router();

/**
 * @route   GET /api/doctor-settings/appointment-config
 * @desc    Get doctor's appointment configuration
 * @access  Private (Doctor)
 */
router.get('/appointment-config', authUser, async (req, res) => {
  try {
    if (req.user.role !== 'doctor') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Doctor role required.'
      });
    }

    const doctor = await Doctor.findByPk(req.user.id);
    if (!doctor) {
      return res.status(404).json({
        success: false,
        message: 'Doctor not found'
      });
    }

    // Ensure weeklySchedule has a default structure
    const defaultSchedule = {
      monday: { isOff: false, online: { enabled: true, startTime: '09:00', endTime: '13:00' }, inPerson: { enabled: true, startTime: '14:00', endTime: '18:00' } },
      tuesday: { isOff: false, online: { enabled: true, startTime: '09:00', endTime: '13:00' }, inPerson: { enabled: true, startTime: '14:00', endTime: '18:00' } },
      wednesday: { isOff: false, online: { enabled: true, startTime: '09:00', endTime: '13:00' }, inPerson: { enabled: true, startTime: '14:00', endTime: '18:00' } },
      thursday: { isOff: false, online: { enabled: true, startTime: '09:00', endTime: '13:00' }, inPerson: { enabled: true, startTime: '14:00', endTime: '18:00' } },
      friday: { isOff: false, online: { enabled: true, startTime: '09:00', endTime: '13:00' }, inPerson: { enabled: true, startTime: '14:00', endTime: '18:00' } },
      saturday: { isOff: false, online: { enabled: true, startTime: '10:00', endTime: '14:00' }, inPerson: { enabled: false, startTime: '14:00', endTime: '18:00' } },
      sunday: { isOff: true, online: { enabled: false, startTime: '09:00', endTime: '13:00' }, inPerson: { enabled: false, startTime: '14:00', endTime: '18:00' } }
    };

    // Parse weeklySchedule if it's a string, or use default if null
    let weeklySchedule = doctor.weeklySchedule;
    if (!weeklySchedule) {
      weeklySchedule = defaultSchedule;
    } else if (typeof weeklySchedule === 'string') {
      try {
        weeklySchedule = JSON.parse(weeklySchedule);
      } catch (e) {
        console.error('Failed to parse weeklySchedule:', e);
        weeklySchedule = defaultSchedule;
      }
    }
    
    // Ensure all days are present with proper structure
    Object.keys(defaultSchedule).forEach(day => {
      if (!weeklySchedule[day]) {
        weeklySchedule[day] = defaultSchedule[day];
      } else {
        // Ensure each day has complete structure
        weeklySchedule[day] = {
          isOff: weeklySchedule[day].isOff ?? defaultSchedule[day].isOff,
          online: {
            enabled: weeklySchedule[day].online?.enabled ?? defaultSchedule[day].online.enabled,
            startTime: weeklySchedule[day].online?.startTime || defaultSchedule[day].online.startTime,
            endTime: weeklySchedule[day].online?.endTime || defaultSchedule[day].online.endTime
          },
          inPerson: {
            enabled: weeklySchedule[day].inPerson?.enabled ?? defaultSchedule[day].inPerson.enabled,
            startTime: weeklySchedule[day].inPerson?.startTime || defaultSchedule[day].inPerson.startTime,
            endTime: weeklySchedule[day].inPerson?.endTime || defaultSchedule[day].inPerson.endTime
          }
        };
      }
    });

    res.json({
      success: true,
      config: {
        slotDuration: doctor.slotDuration || 15,
        weeklySchedule: weeklySchedule,
        offDays: doctor.offDays || ['sunday'],
        onlineConsultationEnabled: doctor.onlineConsultationEnabled ?? true,
        inPersonConsultationEnabled: doctor.inPersonConsultationEnabled ?? true,
        onlineConsultationFee: doctor.onlineConsultationFee || doctor.consultationFees || 500,
        inPersonConsultationFee: doctor.inPersonConsultationFee || doctor.consultationFees || 500
      }
    });
  } catch (error) {
    console.error('Get appointment config error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch appointment configuration',
      error: error.message
    });
  }
});

/**
 * @route   PUT /api/doctor-settings/appointment-config
 * @desc    Update doctor's appointment configuration
 * @access  Private (Doctor)
 */
router.put('/appointment-config', authUser, [
  body('slotDuration').optional().isIn([15, 30, 45, 60]).withMessage('Slot duration must be 15, 30, 45, or 60 minutes'),
  body('offDays').optional().isArray().withMessage('Off days must be an array'),
  body('onlineConsultationEnabled').optional().isBoolean(),
  body('inPersonConsultationEnabled').optional().isBoolean(),
  body('onlineConsultationFee').optional().isFloat({ min: 0 }),
  body('inPersonConsultationFee').optional().isFloat({ min: 0 }),
  body('weeklySchedule').optional().isObject()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    if (req.user.role !== 'doctor') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Doctor role required.'
      });
    }

    const doctor = await Doctor.findByPk(req.user.id);
    if (!doctor) {
      return res.status(404).json({
        success: false,
        message: 'Doctor not found'
      });
    }

    const {
      slotDuration,
      weeklySchedule,
      offDays,
      onlineConsultationEnabled,
      inPersonConsultationEnabled,
      onlineConsultationFee,
      inPersonConsultationFee
    } = req.body;

    // Validate weekly schedule structure
    if (weeklySchedule) {
      const validDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
      for (const day of validDays) {
        if (weeklySchedule[day]) {
          const dayConfig = weeklySchedule[day];
          
          // Validate time format if times are provided
          const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
          
          if (dayConfig.online?.enabled && dayConfig.online.startTime && dayConfig.online.endTime) {
            if (!timeRegex.test(dayConfig.online.startTime) || !timeRegex.test(dayConfig.online.endTime)) {
              return res.status(400).json({
                success: false,
                message: `Invalid time format for ${day} online hours`
              });
            }
            if (dayConfig.online.startTime >= dayConfig.online.endTime) {
              return res.status(400).json({
                success: false,
                message: `Online end time must be after start time for ${day}`
              });
            }
          }
          
          if (dayConfig.inPerson?.enabled && dayConfig.inPerson.startTime && dayConfig.inPerson.endTime) {
            if (!timeRegex.test(dayConfig.inPerson.startTime) || !timeRegex.test(dayConfig.inPerson.endTime)) {
              return res.status(400).json({
                success: false,
                message: `Invalid time format for ${day} in-person hours`
              });
            }
            if (dayConfig.inPerson.startTime >= dayConfig.inPerson.endTime) {
              return res.status(400).json({
                success: false,
                message: `In-person end time must be after start time for ${day}`
              });
            }
          }
        }
      }
    }

    // Update fields
    if (slotDuration !== undefined) doctor.slotDuration = slotDuration;
    if (weeklySchedule !== undefined) doctor.weeklySchedule = weeklySchedule;
    if (offDays !== undefined) doctor.offDays = offDays;
    if (onlineConsultationEnabled !== undefined) doctor.onlineConsultationEnabled = onlineConsultationEnabled;
    if (inPersonConsultationEnabled !== undefined) doctor.inPersonConsultationEnabled = inPersonConsultationEnabled;
    if (onlineConsultationFee !== undefined) doctor.onlineConsultationFee = onlineConsultationFee;
    if (inPersonConsultationFee !== undefined) doctor.inPersonConsultationFee = inPersonConsultationFee;

    await doctor.save();

    res.json({
      success: true,
      message: 'Appointment configuration updated successfully',
      config: {
        slotDuration: doctor.slotDuration,
        weeklySchedule: doctor.weeklySchedule,
        offDays: doctor.offDays,
        onlineConsultationEnabled: doctor.onlineConsultationEnabled,
        inPersonConsultationEnabled: doctor.inPersonConsultationEnabled,
        onlineConsultationFee: doctor.onlineConsultationFee,
        inPersonConsultationFee: doctor.inPersonConsultationFee
      }
    });
  } catch (error) {
    console.error('Update appointment config error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update appointment configuration',
      error: error.message
    });
  }
});

/**
 * @route   PUT /api/doctor-settings/slot-duration
 * @desc    Update only slot duration
 * @access  Private (Doctor)
 */
router.put('/slot-duration', authUser, [
  body('duration').isIn([15, 30, 45, 60]).withMessage('Duration must be 15, 30, 45, or 60 minutes')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    if (req.user.role !== 'doctor') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Doctor role required.'
      });
    }

    const doctor = await Doctor.findByPk(req.user.id);
    if (!doctor) {
      return res.status(404).json({
        success: false,
        message: 'Doctor not found'
      });
    }

    doctor.slotDuration = req.body.duration;
    await doctor.save();

    res.json({
      success: true,
      message: 'Slot duration updated successfully',
      slotDuration: doctor.slotDuration
    });
  } catch (error) {
    console.error('Update slot duration error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update slot duration',
      error: error.message
    });
  }
});

/**
 * @route   PUT /api/doctor-settings/weekly-schedule/:day
 * @desc    Update schedule for a specific day
 * @access  Private (Doctor)
 */
router.put('/weekly-schedule/:day', authUser, async (req, res) => {
  try {
    const { day } = req.params;
    const validDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    
    if (!validDays.includes(day.toLowerCase())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid day. Must be one of: ' + validDays.join(', ')
      });
    }

    if (req.user.role !== 'doctor') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Doctor role required.'
      });
    }

    const doctor = await Doctor.findByPk(req.user.id);
    if (!doctor) {
      return res.status(404).json({
        success: false,
        message: 'Doctor not found'
      });
    }

    const { isOff, online, inPerson } = req.body;
    const weeklySchedule = doctor.weeklySchedule || {};
    
    weeklySchedule[day.toLowerCase()] = {
      isOff: isOff ?? false,
      online: online || { enabled: false, startTime: '', endTime: '' },
      inPerson: inPerson || { enabled: false, startTime: '', endTime: '' }
    };

    doctor.weeklySchedule = weeklySchedule;
    await doctor.save();

    res.json({
      success: true,
      message: `${day} schedule updated successfully`,
      daySchedule: weeklySchedule[day.toLowerCase()]
    });
  } catch (error) {
    console.error('Update day schedule error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update day schedule',
      error: error.message
    });
  }
});

/**
 * @route   PUT /api/doctor-settings/off-days
 * @desc    Update weekly off days
 * @access  Private (Doctor)
 */
router.put('/off-days', authUser, [
  body('offDays').isArray().withMessage('Off days must be an array')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    if (req.user.role !== 'doctor') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Doctor role required.'
      });
    }

    const doctor = await Doctor.findByPk(req.user.id);
    if (!doctor) {
      return res.status(404).json({
        success: false,
        message: 'Doctor not found'
      });
    }

    const validDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    const { offDays } = req.body;
    
    // Validate all provided days
    const invalidDays = offDays.filter(d => !validDays.includes(d.toLowerCase()));
    if (invalidDays.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Invalid days: ${invalidDays.join(', ')}. Must be one of: ${validDays.join(', ')}`
      });
    }

    doctor.offDays = offDays.map(d => d.toLowerCase());
    
    // Also update weekly schedule to mark these days as off
    const weeklySchedule = doctor.weeklySchedule || {};
    validDays.forEach(day => {
      if (!weeklySchedule[day]) {
        weeklySchedule[day] = {
          isOff: false,
          online: { enabled: true, startTime: '09:00', endTime: '13:00' },
          inPerson: { enabled: true, startTime: '14:00', endTime: '18:00' }
        };
      }
      weeklySchedule[day].isOff = offDays.includes(day);
    });
    doctor.weeklySchedule = weeklySchedule;
    
    await doctor.save();

    res.json({
      success: true,
      message: 'Off days updated successfully',
      offDays: doctor.offDays
    });
  } catch (error) {
    console.error('Update off days error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update off days',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/doctor-settings/available-slots/:doctorId
 * @desc    Get available slots for a doctor on a specific date (public)
 * @access  Public
 */
router.get('/available-slots/:doctorId', async (req, res) => {
  try {
    const { doctorId } = req.params;
    const { date, type } = req.query; // type: 'online' or 'in-person'

    const doctor = await Doctor.findByPk(doctorId);
    if (!doctor) {
      return res.status(404).json({
        success: false,
        message: 'Doctor not found'
      });
    }

    const targetDate = date ? new Date(date) : new Date();
    const dayName = targetDate.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
    
    const weeklySchedule = doctor.weeklySchedule || {};
    const daySchedule = weeklySchedule[dayName];
    const slotDuration = doctor.slotDuration || 15;
    const offDays = doctor.offDays || ['sunday'];

    // Check if it's an off day
    if (offDays.includes(dayName) || daySchedule?.isOff) {
      return res.json({
        success: true,
        doctorId: parseInt(doctorId),
        doctorName: `${doctor.firstName || ''} ${doctor.lastName || ''}`.trim(),
        date: targetDate.toISOString().split('T')[0],
        dayOfWeek: dayName,
        isOffDay: true,
        availableSlots: [],
        slotDuration
      });
    }

    // Generate slots based on schedule
    const generateSlots = (startTime, endTime) => {
      const slots = [];
      if (!startTime || !endTime) return slots;
      
      const [startHour, startMin] = startTime.split(':').map(Number);
      const [endHour, endMin] = endTime.split(':').map(Number);
      
      let currentHour = startHour;
      let currentMin = startMin;
      
      while (currentHour < endHour || (currentHour === endHour && currentMin < endMin)) {
        const slotStart = `${currentHour.toString().padStart(2, '0')}:${currentMin.toString().padStart(2, '0')}`;
        
        // Calculate end time
        let slotEndMin = currentMin + slotDuration;
        let slotEndHour = currentHour;
        if (slotEndMin >= 60) {
          slotEndHour += Math.floor(slotEndMin / 60);
          slotEndMin = slotEndMin % 60;
        }
        
        // Don't add slot if it exceeds end time
        if (slotEndHour > endHour || (slotEndHour === endHour && slotEndMin > endMin)) {
          break;
        }
        
        const slotEnd = `${slotEndHour.toString().padStart(2, '0')}:${slotEndMin.toString().padStart(2, '0')}`;
        slots.push(`${slotStart}-${slotEnd}`);
        
        currentHour = slotEndHour;
        currentMin = slotEndMin;
      }
      
      return slots;
    };

    let availableSlots = [];
    
    if (type === 'online' && daySchedule?.online?.enabled) {
      availableSlots = generateSlots(daySchedule.online.startTime, daySchedule.online.endTime);
    } else if (type === 'in-person' && daySchedule?.inPerson?.enabled) {
      availableSlots = generateSlots(daySchedule.inPerson.startTime, daySchedule.inPerson.endTime);
    } else if (!type) {
      // Return both types if no specific type requested
      const onlineSlots = daySchedule?.online?.enabled 
        ? generateSlots(daySchedule.online.startTime, daySchedule.online.endTime).map(s => ({ slot: s, type: 'online' }))
        : [];
      const inPersonSlots = daySchedule?.inPerson?.enabled
        ? generateSlots(daySchedule.inPerson.startTime, daySchedule.inPerson.endTime).map(s => ({ slot: s, type: 'in-person' }))
        : [];
      
      return res.json({
        success: true,
        doctorId: parseInt(doctorId),
        doctorName: `${doctor.firstName || ''} ${doctor.lastName || ''}`.trim(),
        date: targetDate.toISOString().split('T')[0],
        dayOfWeek: dayName,
        isOffDay: false,
        slotDuration,
        slots: {
          online: onlineSlots.map(s => s.slot),
          inPerson: inPersonSlots.map(s => s.slot)
        },
        fees: {
          online: doctor.onlineConsultationFee || doctor.consultationFees || 500,
          inPerson: doctor.inPersonConsultationFee || doctor.consultationFees || 500
        }
      });
    }

    res.json({
      success: true,
      doctorId: parseInt(doctorId),
      doctorName: `${doctor.firstName || ''} ${doctor.lastName || ''}`.trim(),
      date: targetDate.toISOString().split('T')[0],
      dayOfWeek: dayName,
      isOffDay: false,
      type: type || 'all',
      availableSlots,
      slotDuration,
      fee: type === 'online' 
        ? (doctor.onlineConsultationFee || doctor.consultationFees || 500)
        : (doctor.inPersonConsultationFee || doctor.consultationFees || 500)
    });
  } catch (error) {
    console.error('Get available slots error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch available slots',
      error: error.message
    });
  }
});

export default router;
