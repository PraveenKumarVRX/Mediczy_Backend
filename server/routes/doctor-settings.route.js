import express from 'express';
import { body, validationResult } from 'express-validator';
import { authUser, authDoctor } from '../middleware/auth.middleware.js';
import { Doctor } from '../models/index.js';

const router = express.Router();

const toFiniteNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const DEFAULT_WEEKLY_SCHEDULE = {
  monday: { isOff: false, online: { enabled: true, startTime: '09:00', endTime: '13:00' }, inPerson: { enabled: true, startTime: '14:00', endTime: '18:00' } },
  tuesday: { isOff: false, online: { enabled: true, startTime: '09:00', endTime: '13:00' }, inPerson: { enabled: true, startTime: '14:00', endTime: '18:00' } },
  wednesday: { isOff: false, online: { enabled: true, startTime: '09:00', endTime: '13:00' }, inPerson: { enabled: true, startTime: '14:00', endTime: '18:00' } },
  thursday: { isOff: false, online: { enabled: true, startTime: '09:00', endTime: '13:00' }, inPerson: { enabled: true, startTime: '14:00', endTime: '18:00' } },
  friday: { isOff: false, online: { enabled: true, startTime: '09:00', endTime: '13:00' }, inPerson: { enabled: true, startTime: '14:00', endTime: '18:00' } },
  saturday: { isOff: false, online: { enabled: true, startTime: '10:00', endTime: '14:00' }, inPerson: { enabled: false, startTime: '14:00', endTime: '18:00' } },
  sunday: { isOff: true, online: { enabled: false, startTime: '09:00', endTime: '13:00' }, inPerson: { enabled: false, startTime: '14:00', endTime: '18:00' } }
};

const normalizeJsonValue = (value, fallback) => {
  if (!value) return fallback;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch (error) {
    console.error('Failed to parse JSON config:', error);
    return fallback;
  }
};

const normalizeWeeklySchedule = (rawSchedule) => {
  const weeklySchedule = normalizeJsonValue(rawSchedule, { ...DEFAULT_WEEKLY_SCHEDULE });

  Object.keys(DEFAULT_WEEKLY_SCHEDULE).forEach(day => {
    const savedDay = weeklySchedule[day] || {};
    const defaultDay = DEFAULT_WEEKLY_SCHEDULE[day];
    const hasLegacyWindow = savedDay.startTime && savedDay.endTime;
    const legacyEnabled = savedDay.isAvailable !== false && hasLegacyWindow;
    weeklySchedule[day] = {
      isOff: savedDay.isOff ?? (savedDay.isAvailable === false ? true : defaultDay.isOff),
      online: {
        enabled: savedDay.online?.enabled ?? (legacyEnabled ? true : defaultDay.online.enabled),
        startTime: savedDay.online?.startTime || savedDay.startTime || defaultDay.online.startTime,
        endTime: savedDay.online?.endTime || savedDay.endTime || defaultDay.online.endTime
      },
      inPerson: {
        enabled: savedDay.inPerson?.enabled ?? false,
        startTime: savedDay.inPerson?.startTime || defaultDay.inPerson.startTime,
        endTime: savedDay.inPerson?.endTime || defaultDay.inPerson.endTime,
        ...(savedDay.inPerson?.locationId ? { locationId: savedDay.inPerson.locationId } : {})
      },
      blockedSlots: Array.isArray(savedDay.blockedSlots) ? savedDay.blockedSlots : []
    };
  });

  return weeklySchedule;
};

const deriveOffDaysFromSchedule = (weeklySchedule = {}) => {
  return Object.keys(DEFAULT_WEEKLY_SCHEDULE).filter((day) => weeklySchedule[day]?.isOff === true);
};

const mergeOffDays = (storedOffDays, weeklySchedule) => {
  const fromSchedule = deriveOffDaysFromSchedule(weeklySchedule);
  const stored = Array.isArray(storedOffDays) ? storedOffDays.map((d) => String(d).toLowerCase()) : [];
  return [...new Set([...stored, ...fromSchedule])];
};

const hasGoogleVerifiedClinicLocation = (doctor) => {
  const clinicAddress = typeof doctor?.clinicAddress === 'string' ? doctor.clinicAddress.trim() : '';
  const clinicAddressJson = doctor?.clinicAddress_json && typeof doctor.clinicAddress_json === 'object'
    ? doctor.clinicAddress_json
    : {};

  const hasAddress = clinicAddress.length > 0 || Object.keys(clinicAddressJson).length > 0;
  if (!hasAddress) return false;

  const placeId =
    clinicAddressJson.placeId ||
    clinicAddressJson.place_id ||
    clinicAddressJson.googlePlaceId ||
    clinicAddressJson.google_place_id ||
    '';

  const provider = String(clinicAddressJson.provider || clinicAddressJson.source || '').toLowerCase();
  const verificationStatus = String(clinicAddressJson.verificationStatus || '').toLowerCase();

  const hasCoordinates =
    toFiniteNumber(clinicAddressJson.lat ?? clinicAddressJson.latitude) !== null &&
    toFiniteNumber(clinicAddressJson.lng ?? clinicAddressJson.longitude ?? clinicAddressJson.lon) !== null;

  return (
    Boolean(String(placeId).trim()) ||
    (provider.startsWith('google') && verificationStatus === 'verified') ||
    (provider.startsWith('google') && hasCoordinates)
  );
};

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

    const weeklySchedule = normalizeWeeklySchedule(doctor.weeklySchedule);
    const practiceLocations = normalizeJsonValue(doctor.practiceLocations, []);
    const offDays = mergeOffDays(doctor.offDays, weeklySchedule);

    res.json({
      success: true,
      config: {
        slotDuration: doctor.slotDuration || 15,
        weeklySchedule: weeklySchedule,
        offDays,
        onlineConsultationEnabled: doctor.onlineConsultationEnabled ?? true,
        inPersonConsultationEnabled: doctor.inPersonConsultationEnabled ?? true,
        onlineConsultationFee: doctor.onlineConsultationFee || doctor.consultationFees || 500,
        inPersonConsultationFee: doctor.inPersonConsultationFee || doctor.consultationFees || 500,
        practiceLocations: Array.isArray(practiceLocations) ? practiceLocations : []
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
  body('weeklySchedule').optional().isObject(),
  body('practiceLocations').optional().isArray().withMessage('Practice locations must be an array')
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
      inPersonConsultationFee,
      practiceLocations
    } = req.body;

    if (inPersonConsultationEnabled === true && !hasGoogleVerifiedClinicLocation(doctor)) {
      return res.status(400).json({
        success: false,
        message: 'In-person consultation requires a clinic address verified by Google Places. Please select your clinic from Google autocomplete and save profile first.'
      });
    }

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
          if (dayConfig.blockedSlots !== undefined && !Array.isArray(dayConfig.blockedSlots)) {
            return res.status(400).json({
              success: false,
              message: `Blocked slots must be an array for ${day}`
            });
          }
        }
      }
    }

    // Update fields
    if (slotDuration !== undefined) doctor.slotDuration = slotDuration;
    if (weeklySchedule !== undefined) {
      doctor.weeklySchedule = weeklySchedule;
      if (offDays === undefined) {
        doctor.offDays = deriveOffDaysFromSchedule(weeklySchedule);
      }
    }
    if (offDays !== undefined) doctor.offDays = offDays;
    if (onlineConsultationEnabled !== undefined) doctor.onlineConsultationEnabled = onlineConsultationEnabled;
    if (inPersonConsultationEnabled !== undefined) doctor.inPersonConsultationEnabled = inPersonConsultationEnabled;
    if (onlineConsultationFee !== undefined) doctor.onlineConsultationFee = onlineConsultationFee;
    if (inPersonConsultationFee !== undefined) doctor.inPersonConsultationFee = inPersonConsultationFee;
    if (practiceLocations !== undefined) doctor.practiceLocations = practiceLocations;

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
        inPersonConsultationFee: doctor.inPersonConsultationFee,
        practiceLocations: doctor.practiceLocations
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

    const { isOff, online, inPerson, blockedSlots } = req.body;
    const weeklySchedule = doctor.weeklySchedule || {};
    
    weeklySchedule[day.toLowerCase()] = {
      isOff: isOff ?? false,
      online: online || { enabled: false, startTime: '', endTime: '' },
      inPerson: inPerson || { enabled: false, startTime: '', endTime: '' },
      blockedSlots: Array.isArray(blockedSlots) ? blockedSlots : (weeklySchedule[day.toLowerCase()]?.blockedSlots || [])
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
      weeklySchedule[day].isOff = offDays.map((d) => String(d).toLowerCase()).includes(day);
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
    
    const weeklySchedule = normalizeWeeklySchedule(doctor.weeklySchedule);
    const daySchedule = weeklySchedule[dayName];
    const slotDuration = doctor.slotDuration || 15;
    const offDays = doctor.offDays || ['sunday'];
    // Strip all whitespace before comparing so "10:00-10:30", "10:00 - 10:30",
    // and "10:00- 10:30" are all treated as the same slot.
    const normalizeSlotKey = (slot) => String(slot || '').replace(/\s+/g, '');
    const blockedSlots = daySchedule?.blockedSlots || [];
    const isBlockedSlot = (slot) => blockedSlots.some((blocked) => normalizeSlotKey(blocked) === normalizeSlotKey(slot));

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
        slots.push(`${slotStart} - ${slotEnd}`);
        
        currentHour = slotEndHour;
        currentMin = slotEndMin;
      }
      
      return slots;
    };

    let availableSlots = [];
    
    if (type === 'online' && daySchedule?.online?.enabled) {
      availableSlots = generateSlots(daySchedule.online.startTime, daySchedule.online.endTime).filter(slot => !isBlockedSlot(slot));
    } else if (type === 'in-person' && daySchedule?.inPerson?.enabled) {
      availableSlots = generateSlots(daySchedule.inPerson.startTime, daySchedule.inPerson.endTime).filter(slot => !isBlockedSlot(slot));
    } else if (!type) {
      // Return both types if no specific type requested
      const onlineSlots = daySchedule?.online?.enabled 
        ? generateSlots(daySchedule.online.startTime, daySchedule.online.endTime)
            .filter(slot => !isBlockedSlot(slot))
            .map(s => ({ slot: s, type: 'online' }))
        : [];
      const inPersonSlots = daySchedule?.inPerson?.enabled
        ? generateSlots(daySchedule.inPerson.startTime, daySchedule.inPerson.endTime)
            .filter(slot => !isBlockedSlot(slot))
            .map(s => ({ slot: s, type: 'in-person' }))
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
        blockedSlots: Array.from(blockedSlots),
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
      blockedSlots: Array.from(blockedSlots),
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

// ============== ATTACHED ENTITIES (PHARMACIES & LABS) ==============

/**
 * @route   GET /api/doctors/attached-pharmacies
 * @desc    Get doctor's attached pharmacies
 * @access  Private (Doctor)
 */
router.get('/attached-pharmacies', authDoctor, async (req, res) => {
  try {
    const doctor = await Doctor.findByPk(req.doctor.id);
    if (!doctor) {
      return res.status(404).json({ success: false, message: 'Doctor not found' });
    }

    // Get attached pharmacies from doctor's settings
    const attachedPharmacies = doctor.attachedPharmacies || [];

    res.json({
      success: true,
      pharmacies: attachedPharmacies
    });
  } catch (error) {
    console.error('Get attached pharmacies error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch attached pharmacies',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/doctors/attached-pharmacies
 * @desc    Add an attached pharmacy
 * @access  Private (Doctor)
 */
router.post('/attached-pharmacies', authDoctor, [
  body('name').notEmpty().withMessage('Pharmacy name is required'),
  body('phone').optional().isString(),
  body('email').optional().isEmail(),
  body('address').optional().isString()
], async (req, res) => {
  try {
    const { name, phone, email, address, gstNumber, licenseNumber } = req.body;

    const doctor = await Doctor.findByPk(req.doctor.id);
    if (!doctor) {
      return res.status(404).json({ success: false, message: 'Doctor not found' });
    }

    const attachedPharmacies = doctor.attachedPharmacies || [];
    const newPharmacy = {
      id: Date.now(),
      name,
      phone: phone || '',
      email: email || '',
      address: address || '',
      gstNumber: gstNumber || '',
      licenseNumber: licenseNumber || '',
      addedAt: new Date().toISOString()
    };

    attachedPharmacies.push(newPharmacy);
    await doctor.update({ attachedPharmacies });

    res.json({
      success: true,
      message: 'Pharmacy added successfully',
      pharmacy: newPharmacy
    });
  } catch (error) {
    console.error('Add pharmacy error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add pharmacy',
      error: error.message
    });
  }
});

/**
 * @route   DELETE /api/doctors/attached-pharmacies/:pharmacyId
 * @desc    Remove an attached pharmacy
 * @access  Private (Doctor)
 */
router.delete('/attached-pharmacies/:pharmacyId', authDoctor, async (req, res) => {
  try {
    const { pharmacyId } = req.params;

    const doctor = await Doctor.findByPk(req.doctor.id);
    if (!doctor) {
      return res.status(404).json({ success: false, message: 'Doctor not found' });
    }

    const attachedPharmacies = doctor.attachedPharmacies || [];
    const updatedPharmacies = attachedPharmacies.filter(p => p.id !== parseInt(pharmacyId));

    if (attachedPharmacies.length === updatedPharmacies.length) {
      return res.status(404).json({ success: false, message: 'Pharmacy not found' });
    }

    await doctor.update({ attachedPharmacies: updatedPharmacies });

    res.json({
      success: true,
      message: 'Pharmacy removed successfully'
    });
  } catch (error) {
    console.error('Remove pharmacy error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove pharmacy',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/doctors/attached-labs
 * @desc    Get doctor's attached labs
 * @access  Private (Doctor)
 */
router.get('/attached-labs', authDoctor, async (req, res) => {
  try {
    const doctor = await Doctor.findByPk(req.doctor.id);
    if (!doctor) {
      return res.status(404).json({ success: false, message: 'Doctor not found' });
    }

    // Get attached labs from doctor's settings
    const attachedLabs = doctor.attachedLabs || [];

    res.json({
      success: true,
      labs: attachedLabs
    });
  } catch (error) {
    console.error('Get attached labs error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch attached labs',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/doctors/attached-labs
 * @desc    Add an attached lab
 * @access  Private (Doctor)
 */
router.post('/attached-labs', authDoctor, [
  body('name').notEmpty().withMessage('Lab name is required'),
  body('phone').optional().isString(),
  body('email').optional().isEmail(),
  body('address').optional().isString()
], async (req, res) => {
  try {
    const { name, phone, email, address, accreditation } = req.body;

    const doctor = await Doctor.findByPk(req.doctor.id);
    if (!doctor) {
      return res.status(404).json({ success: false, message: 'Doctor not found' });
    }

    const attachedLabs = doctor.attachedLabs || [];
    const newLab = {
      id: Date.now(),
      name,
      phone: phone || '',
      email: email || '',
      address: address || '',
      accreditation: accreditation || '',
      addedAt: new Date().toISOString()
    };

    attachedLabs.push(newLab);
    await doctor.update({ attachedLabs });

    res.json({
      success: true,
      message: 'Lab added successfully',
      lab: newLab
    });
  } catch (error) {
    console.error('Add lab error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add lab',
      error: error.message
    });
  }
});

/**
 * @route   DELETE /api/doctors/attached-labs/:labId
 * @desc    Remove an attached lab
 * @access  Private (Doctor)
 */
router.delete('/attached-labs/:labId', authDoctor, async (req, res) => {
  try {
    const { labId } = req.params;

    const doctor = await Doctor.findByPk(req.doctor.id);
    if (!doctor) {
      return res.status(404).json({ success: false, message: 'Doctor not found' });
    }

    const attachedLabs = doctor.attachedLabs || [];
    const updatedLabs = attachedLabs.filter(l => l.id !== parseInt(labId));

    if (attachedLabs.length === updatedLabs.length) {
      return res.status(404).json({ success: false, message: 'Lab not found' });
    }

    await doctor.update({ attachedLabs: updatedLabs });

    res.json({
      success: true,
      message: 'Lab removed successfully'
    });
  } catch (error) {
    console.error('Remove lab error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove lab',
      error: error.message
    });
  }
});

export default router;
