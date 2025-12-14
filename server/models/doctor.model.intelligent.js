import { Op } from 'sequelize';
import Doctor from './doctor.model.mariadb.js';
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

const normalizeTimeValue = (value = '') => {
  if (!value) return '';
  const candidate = value.includes('-') ? value.split('-')[0].trim() : value.trim();
  if (TIME_24H_REGEX.test(candidate)) {
    return candidate;
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

const doctorModel = {
  findOne: async (options = {}) => {
    const doctor = await Doctor.findOne(options);
    return deriveVerificationStatus(doctor);
  },

  findByPk: async (id, options = {}) => {
    const doctor = await Doctor.findByPk(id, options);
    return deriveVerificationStatus(doctor);
  },

  create: async (doctorData) => {
    const payload = sanitizeDoctorPayload(doctorData);
    const doctor = await Doctor.create(payload);
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

    if (availabilityRecord?.generateTimeSlots) {
      rawSlots = availabilityRecord.generateTimeSlots(date) || [];
    } else {
      const weeklyAvailability = parseJsonField(doctor.weeklyAvailability, {});
      const weeklySchedule = parseJsonField(doctor.weeklySchedule, {});
      const storedSlots = parseJsonField(doctor.availableSlots, []);
      const dayName = normalizedDate
        .toLocaleDateString('en-US', { weekday: 'long' })
        .toLowerCase();

      rawSlots =
        weeklyAvailability?.[dayName]?.slots ||
        weeklySchedule?.[dayName]?.slots ||
        storedSlots;
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