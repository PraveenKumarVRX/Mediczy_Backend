import { Op } from 'sequelize';
import { Doctor } from './index.js'; // Now uses PostgreSQL via index.js
import DoctorAvailability from './doctorAvailability.model.intelligent.js';
import Appointment from './appointment.model.intelligent.js';

const deriveVerificationStatus = (doctor) => {
  if (!doctor) return doctor;
  const status = doctor.isVerified ? 'verified' : 'pending';
  if (typeof doctor.setDataValue === 'function') {
    doctor.setDataValue('verificationStatus', status);
  } else {
    doctor.verificationStatus = status;
  }
  return doctor;
};

const sanitizeDoctorPayload = (doctorData = {}) => {
  const payload = { ...doctorData };
  if ('verificationStatus' in payload) {
    payload.isVerified = payload.verificationStatus === 'verified';
    delete payload.verificationStatus;
  }
  if ('verificationNotes' in payload) {
    delete payload.verificationNotes;
  }
  return payload;
};

const parseJsonField = (value, fallback) => {
  if (Array.isArray(value) || (value && typeof value === 'object')) {
    return value;
  }
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch (error) {
      return fallback;
    }
  }
  return fallback;
};

const TIME_24H_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;
const TIME_12H_REGEX = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i;
const TIME_HHMM_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;
const WEEK_DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

const parseMinutes = (time) => {
  if (!TIME_HHMM_REGEX.test(time)) return null;
  const [hours, minutes] = time.split(':').map((value) => parseInt(value, 10));
  return hours * 60 + minutes;
};

const formatTimeFromMinutes = (totalMinutes) => {
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60) % 24;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

const generateSlotsFromWindow = (startTime, endTime, slotDurationMinutes = 30) => {
  const startMinutes = parseMinutes(startTime);
  const endMinutes = parseMinutes(endTime);
  const duration = Number.isFinite(slotDurationMinutes) ? slotDurationMinutes : 30;

  if (startMinutes === null || endMinutes === null || duration <= 0) return [];
  if (startMinutes >= endMinutes) return [];

  const slots = [];
  for (let t = startMinutes; t + duration <= endMinutes; t += duration) {
    const time = formatTimeFromMinutes(t);
    slots.push({
      time,
      displayTime: formatDisplayTime(time),
      available: true
    });
  }
  return slots;
};

const normalizeTimeValue = (value = '') => {
  if (!value) return '';
  const candidate = value.includes('-') ? value.split('-')[0].trim() : value.trim();
  if (TIME_24H_REGEX.test(candidate)) {
    return candidate;
  }
  // Handle single-digit hour without AM/PM: "9:00" → "09:00"
  const simpleMatch = candidate.match(/^(\d{1,2}):(\d{2})$/);
  if (simpleMatch) {
    const hour = parseInt(simpleMatch[1], 10);
    if (hour >= 0 && hour <= 23) {
      return `${hour.toString().padStart(2, '0')}:${simpleMatch[2]}`;
    }
  }
  const match = candidate.match(TIME_12H_REGEX);
  if (match) {
    let hour = parseInt(match[1], 10);
    const minute = match[2];
    const modifier = match[3].toUpperCase();
    if (modifier === 'PM' && hour !== 12) {
      hour += 12;
    }
    if (modifier === 'AM' && hour === 12) {
      hour = 0;
    }
    return `${hour.toString().padStart(2, '0')}:${minute}`;
  }
  return '';
};

const formatDisplayTime = (value = '') => {
  if (!TIME_24H_REGEX.test(value)) {
    return value;
  }
  const [hourStr, minute] = value.split(':');
  let hour = parseInt(hourStr, 10);
  const period = hour >= 12 ? 'PM' : 'AM';
  hour = hour % 12 || 12;
  return `${hour.toString().padStart(2, '0')}:${minute} ${period}`;
};

const normalizeSlotEntry = (slot, targetType) => {
  if (!slot) return null;

  if (typeof slot === 'string') {
    const normalized = normalizeTimeValue(slot);
    if (!normalized) return null;
    return {
      time: normalized,
      displayTime: formatDisplayTime(normalized),
      available: true
    };
  }

  const slotTypeRaw = (slot.consultationType || slot.type || '').toLowerCase();
  const normalizedTarget = targetType === 'walkin' ? 'in-person' : targetType;
  const normalizedSlotType = slotTypeRaw === 'walkin' ? 'in-person' : slotTypeRaw;

  if (
    normalizedSlotType &&
    normalizedSlotType !== 'both' &&
    normalizedSlotType !== normalizedTarget
  ) {
    return null;
  }

  const rawTime =
    slot.time ||
    slot.startTime ||
    (typeof slot.slot === 'string' ? slot.slot : '') ||
    slot.displayTime ||
    slot.label;

  const normalizedTime = normalizeTimeValue(rawTime);
  if (!normalizedTime) {
    return null;
  }

  return {
    time: normalizedTime,
    displayTime: slot.displayTime || slot.label || formatDisplayTime(normalizedTime),
    available: slot.available ?? slot.isAvailable ?? true
  };
};

const normalizeAvailabilitySlot = (slot) => {
  if (!slot || typeof slot !== 'object') return null;

  const startTime = normalizeTimeValue(slot.startTime || slot.start || slot.from || '');
  const endTime = normalizeTimeValue(slot.endTime || slot.end || slot.to || '');
  if (!TIME_HHMM_REGEX.test(startTime) || !TIME_HHMM_REGEX.test(endTime) || startTime >= endTime) {
    return null;
  }

  const rawType = String(slot.consultationType || slot.type || 'both').trim().toLowerCase();
  const consultationType = rawType === 'walkin' || rawType === 'walk-in' || rawType === 'in-person'
    ? 'walkIn'
    : (rawType === 'online' || rawType === 'walkin' || rawType === 'walkIn' || rawType === 'both' ? rawType : 'both');

  const normalized = {
    startTime,
    endTime,
    consultationType: consultationType === 'walkin' ? 'walkIn' : consultationType,
  };

  const slotDuration = parseInt(slot.slotDuration, 10);
  if ([15, 20, 30, 45, 60].includes(slotDuration)) {
    normalized.slotDuration = slotDuration;
  }

  const maxPatients = parseInt(slot.maxPatients, 10);
  if (Number.isFinite(maxPatients) && maxPatients > 0) {
    normalized.maxPatients = maxPatients;
  }

  return normalized;
};

const doctorModel = {
  findOne: async (options = {}) => {
    const doctor = await Doctor.findOne(options);
    return deriveVerificationStatus(doctor);
  },

  findByPk: async (id, options = {}) => {
    // Validate ID before querying to prevent "undefined" errors
    if (id === undefined || id === null || id === 'undefined' || id === '') {
      return null;
    }
    const doctor = await Doctor.findByPk(id, options);
    return deriveVerificationStatus(doctor);
  },

  create: async (doctorData) => {
    const payload = sanitizeDoctorPayload(doctorData);
    const doctor = await Doctor.create(payload);
    return deriveVerificationStatus(doctor);
  },

  update: async (id, doctorData) => {
    // Validate ID before querying
    if (id === undefined || id === null || id === 'undefined' || id === '') {
      throw new Error('Invalid doctor ID');
    }

    const doctor = await Doctor.findByPk(id);
    if (!doctor) {
      throw new Error('Doctor not found');
    }

    const payload = sanitizeDoctorPayload(doctorData);
    
    // 🐛 DEBUG: Log what we're updating
    console.log('🔧 Doctor Update - ID:', id, 'Payload:', payload);
    
    // Update doctor fields
    Object.keys(payload).forEach(key => {
      if (payload[key] !== undefined && key !== 'id') {
        doctor[key] = payload[key];
        console.log(`  ✏️ Setting doctor.${key} = ${payload[key]}`);
      }
    });

    await doctor.save();
    console.log('✅ Doctor saved, checking values:', {
      offersSecondOpinion: doctor.offersSecondOpinion,
      secondOpinionFee: doctor.secondOpinionFee,
      offersHomeVisits: doctor.offersHomeVisits,
      homeVisitFee: doctor.homeVisitFee,
      homeVisitRadiusKm: doctor.homeVisitRadiusKm
    });
    return deriveVerificationStatus(doctor);
  },

  updateAvailability: async (id, availabilityData = {}) => {
    if (id === undefined || id === null || id === 'undefined' || id === '') {
      throw new Error('Invalid doctor ID');
    }

    const doctor = await Doctor.findByPk(id);
    if (!doctor) {
      throw new Error('Doctor not found');
    }

    const existingWeekly = parseJsonField(doctor.weeklyAvailability, {});
    const payload = (
      availabilityData &&
      typeof availabilityData === 'object' &&
      availabilityData.weeklyAvailability &&
      typeof availabilityData.weeklyAvailability === 'object'
    ) ? availabilityData.weeklyAvailability : availabilityData;

    const hasDayPayload = WEEK_DAYS.some((day) => payload && Object.prototype.hasOwnProperty.call(payload, day));
    const updatedWeekly = { ...existingWeekly };

    if (hasDayPayload) {
      for (const day of WEEK_DAYS) {
        if (!Object.prototype.hasOwnProperty.call(payload, day)) continue;

        const incomingDay = payload[day] || {};
        const existingDay = existingWeekly?.[day] || {};
        const incomingSlots = Array.isArray(incomingDay.slots) ? incomingDay.slots : [];
        const normalizedSlots = incomingSlots
          .map(normalizeAvailabilitySlot)
          .filter(Boolean);

        updatedWeekly[day] = {
          isAvailable: incomingDay.isAvailable === undefined
            ? Boolean(existingDay.isAvailable)
            : Boolean(incomingDay.isAvailable),
          slots: normalizedSlots,
        };
      }
    } else if (typeof payload?.isAvailable === 'boolean') {
      for (const day of WEEK_DAYS) {
        const existingDay = existingWeekly?.[day] || {};
        updatedWeekly[day] = {
          isAvailable: payload.isAvailable,
          slots: Array.isArray(existingDay.slots) ? existingDay.slots : [],
        };
      }
    } else {
      throw new Error('Invalid availability payload');
    }

    doctor.weeklyAvailability = updatedWeekly;
    doctor.lastActivityAt = new Date();
    await doctor.save();
    return deriveVerificationStatus(doctor);
  },

  findAll: async (options = {}) => {
    const doctors = await Doctor.findAll(options);
    return doctors.map(deriveVerificationStatus);
  },

	  getAvailableSlots: async (doctorId, date, consultationType = 'online') => {
    if (!date) {
      throw new Error('Date is required');
    }

    const normalizedDate = new Date(date);
    if (Number.isNaN(normalizedDate.getTime())) {
      throw new Error('Invalid date');
    }

    const doctor = await Doctor.findByPk(doctorId);
    if (!doctor) {
      throw new Error('Doctor not found');
    }

    const dayOfWeek = normalizedDate.getDay();
    let availabilityRecord = null;

    try {
      availabilityRecord = await DoctorAvailability.findOne({
        where: { doctorId, dayOfWeek, isAvailable: true }
      });
    } catch (error) {
      console.warn('Doctor availability lookup failed:', error.message);
    }

	    let rawSlots = [];
	    let skipDefaultSlots = false;

	    if (availabilityRecord?.generateTimeSlots) {
	      rawSlots = availabilityRecord.generateTimeSlots(date) || [];
	    } else {
      const weeklyAvailability = parseJsonField(doctor.weeklyAvailability, {});
      const weeklySchedule = parseJsonField(doctor.weeklySchedule, {});
      const storedSlots = parseJsonField(doctor.availableSlots, []);
      const dayName = normalizedDate
        .toLocaleDateString('en-US', { weekday: 'long' })
        .toLowerCase();

      const normalizedType = String(consultationType || 'online').toLowerCase();
      const isInPerson =
        normalizedType === 'walkin' ||
        normalizedType === 'walk-in' ||
        normalizedType === 'in-person' ||
        normalizedType === 'homevisit' ||
        normalizedType === 'home-visit';

	      const scheduleForDay = weeklySchedule?.[dayName];
	      const offDays = parseJsonField(doctor.offDays, []);
	      const isOff =
	        Boolean(scheduleForDay?.isOff) ||
	        (Array.isArray(offDays) && offDays.includes(dayName)) ||
	        Boolean(weeklyAvailability?.[dayName]?.isAvailable === false);

	      if (isOff) {
	        rawSlots = [];
	        skipDefaultSlots = true;
	      } else {
	        // Prefer weeklySchedule time windows if present (this is what the doctor portal edits).
	        const slotDuration = doctor.slotDuration || 30;
	        const scheduleWindow = scheduleForDay
	          ? (isInPerson ? scheduleForDay.inPerson : scheduleForDay.online)
	          : null;

	        if (scheduleForDay) {
	          // If the doctor configured this day, don't invent defaults; respect toggles.
	          if (!scheduleWindow?.enabled) {
	            rawSlots = [];
	            skipDefaultSlots = true;
	          } else if (
	            TIME_HHMM_REGEX.test(scheduleWindow.startTime || '') &&
	            TIME_HHMM_REGEX.test(scheduleWindow.endTime || '')
	          ) {
	            rawSlots = generateSlotsFromWindow(
	              scheduleWindow.startTime,
	              scheduleWindow.endTime,
	              slotDuration
	            );
	          } else {
	            rawSlots = [];
	            skipDefaultSlots = true;
	          }
	        } else {
	          // Fall back to existing slot storage mechanisms for legacy records.
	          rawSlots =
	            weeklyAvailability?.[dayName]?.slots ||
	            weeklySchedule?.[dayName]?.slots ||
	            storedSlots;
	        }
	      }
	    }

	    // If no slots are configured, generate default slots
	    if (!skipDefaultSlots && (!rawSlots || rawSlots.length === 0)) {
	      rawSlots = [];
	      for (let hour = 9; hour < 17; hour++) {
	        for (let minute of [0, 30]) {
	          rawSlots.push({
	            time: `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`,
	            available: true
	          });
	        }
	      }
	    }

    const appointments = await Appointment.findAll({
      where: {
        doctorId,
        appointmentDate: date,
        status: {
          [Op.notIn]: ['cancelled', 'no-show']
        }
      },
      attributes: ['appointmentTime']
    });

    const bookedTimes = new Set(
      appointments
        .map(appt => appt.appointmentTime)
        .filter(Boolean)
        .map(time => time.slice(0, 5))
    );

    return rawSlots
      .map(slot => normalizeSlotEntry(slot, consultationType.toLowerCase()))
      .filter(Boolean)
      .map(slot => ({
        ...slot,
        available: slot.available && !bookedTimes.has(slot.time)
      }));
  },

  count: async (options = {}) => {
    return Doctor.count(options);
  },

  findAndCountAll: async (options = {}) => {
    const result = await Doctor.findAndCountAll(options);
    result.rows = result.rows.map(deriveVerificationStatus);
    return result;
  },

  updateVerificationStatus: async (doctorId, status, notes) => {
    const doctor = await Doctor.findByPk(doctorId);
    if (!doctor) {
      throw new Error('Doctor not found');
    }
    doctor.isVerified = status === 'verified';
    deriveVerificationStatus(doctor);
    if (notes) {
      doctor.setDataValue('verificationNotesTemp', notes);
    }
    await doctor.save();
    return doctor;
  },

  searchDoctors: async (filters = {}) => {
    const where = {};

    if (filters.specialization) {
      where.specialization = filters.specialization;
    }
    if (filters.city) {
      where.clinicAddress = { [Op.like]: `%${filters.city}%` };
    }
    if (filters.isVerified !== undefined) {
      where.isVerified = filters.isVerified;
    }
    if (filters.maxFee) {
      where.consultationFees = { [Op.lte]: filters.maxFee };
    }

    const doctors = await Doctor.findAll({
      where,
      order: [['createdAt', 'DESC']]
    });

    return doctors
      .map(doc => {
        const doctor = doc.get({ plain: true });
        doctor.consultationTypes = parseJsonField(doctor.consultationTypes, []);
        doctor.languages = parseJsonField(doctor.languages, []);
        doctor.serviceTiers = parseJsonField(doctor.serviceTiers, []);
        doctor.availableSlots = parseJsonField(doctor.availableSlots, []);
        return deriveVerificationStatus(doctor);
      })
      .filter(doctor => {
        if (filters.consultationType) {
          const types = doctor.consultationTypes || [];
          const hasConsultation = Array.isArray(types)
            ? types.some(t => t.type === filters.consultationType)
            : Boolean(types[filters.consultationType]?.available);
          if (!hasConsultation) return false;
        }

        if (filters.languages && filters.languages.length) {
          const doctorLanguages = doctor.languages || [];
          const supportsLanguage = doctorLanguages.some(lang => filters.languages.includes(lang));
          if (!supportsLanguage) return false;
        }

        return true;
      });
  }
};

export default doctorModel;
