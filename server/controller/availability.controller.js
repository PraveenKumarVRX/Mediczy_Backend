import { validationResult } from 'express-validator';
import { JWT_CONFIG } from '../config/auth.config.js';
import DoctorAvailability from '../models/doctorAvailability.model.intelligent.js';
import Appointment from '../models/appointment.model.intelligent.js';
import Doctor from '../models/doctor.model.intelligent.js';
import { Op } from 'sequelize';

const resolveAuthenticatedDoctorId = (req) => {
  const role = String(req.userRole || req.user?.role || '').toLowerCase();
  if (role !== 'doctor') return null;

  const candidateIds = [
    req.user?.doctorId,
    req.user?.id,
    req.user?.dataValues?.doctorId,
    req.user?.dataValues?.id,
  ];

  for (const value of candidateIds) {
    const parsed = Number.parseInt(String(value ?? ''), 10);
    if (Number.isInteger(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return null;
};

/**
 * Get doctor's availability schedule
 * GET /api/doctors/:doctorId/availability
 */
export const getDoctorAvailability = async (req, res) => {
  try {
    const { doctorId } = req.params;

    const availability = await DoctorAvailability.findAll({
      where: { doctorId },
      order: [['dayOfWeek', 'ASC']]
    });

    return res.status(200).json({
      count: availability.length,
      availability
    });
  } catch (error) {
    console.error('Get availability error:', error);
    return res.status(500).json({ 
      message: 'Failed to fetch availability',
      error: error.message 
    });
  }
};

/**
 * Get available time slots for a specific date
 * GET /api/doctors/:doctorId/available-slots
 */
export const getAvailableSlots = async (req, res) => {
  try {
    const { doctorId } = req.params;
    const { date } = req.query;

    if (!date) {
      return res.status(400).json({ message: 'Date is required' });
    }

    const requestedDate = new Date(date);
    const dayOfWeek = requestedDate.getDay();

    // Get doctor's availability for this day
    const availability = await DoctorAvailability.findOne({
      where: {
        doctorId,
        dayOfWeek,
        isAvailable: true
      }
    });

    if (!availability) {
      return res.status(200).json({
        date,
        slots: [],
        message: 'Doctor is not available on this day'
      });
    }

    // Generate all possible time slots
    const allSlots = availability.generateTimeSlots(date);

    // Get booked appointments for this date
    const bookedAppointments = await Appointment.findAll({
      where: {
        doctorId,
        appointmentDate: date,
        status: {
          [Op.notIn]: ['cancelled', 'no-show']
        }
      },
      attributes: ['appointmentTime']
    });

    const bookedTimes = bookedAppointments.map(apt => apt.appointmentTime);

    // Mark slots as unavailable if booked
    const availableSlots = allSlots.map(slot => ({
      ...slot,
      available: !bookedTimes.includes(slot.time)
    }));

    return res.status(200).json({
      date,
      dayOfWeek,
      slots: availableSlots,
      consultationTypes: {
        video: availability.allowVideoConsultation,
        audio: availability.allowAudioConsultation,
        chat: availability.allowChatConsultation,
        inPerson: availability.allowInPersonConsultation
      },
      fees: {
        video: availability.videoConsultationFee,
        audio: availability.audioConsultationFee,
        chat: availability.chatConsultationFee,
        inPerson: availability.inPersonConsultationFee
      }
    });
  } catch (error) {
    console.error('Get available slots error:', error);
    return res.status(500).json({ 
      message: 'Failed to fetch available slots',
      error: error.message 
    });
  }
};

/**
 * Set doctor's availability (Doctor only)
 * POST /api/doctors/:doctorId/availability
 */
export const setDoctorAvailability = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { doctorId } = req.params;
    const authenticatedDoctorId = resolveAuthenticatedDoctorId(req);

    if (!authenticatedDoctorId) {
      return res.status(403).json({ message: 'Only doctors can set availability' });
    }

    // Check if authenticated user is the doctor
    if (parseInt(doctorId) !== authenticatedDoctorId) {
      return res.status(403).json({ 
        message: 'You can only set your own availability' 
      });
    }

    // Verify doctor exists
    const doctor = await Doctor.findByPk(doctorId);
    if (!doctor) {
      return res.status(404).json({ message: 'Doctor not found' });
    }

    const {
      dayOfWeek,
      startTime,
      endTime,
      slotDuration,
      breakTimes,
      isAvailable,
      allowVideoConsultation,
      allowAudioConsultation,
      allowChatConsultation,
      allowInPersonConsultation,
      videoConsultationFee,
      audioConsultationFee,
      chatConsultationFee,
      inPersonConsultationFee,
      maxAppointmentsPerSlot
    } = req.body;

    // Create availability
    const availability = await DoctorAvailability.create({
      doctorId,
      dayOfWeek,
      startTime,
      endTime,
      slotDuration: slotDuration || 30,
      breakTimes: breakTimes || [],
      isAvailable: isAvailable !== undefined ? isAvailable : true,
      allowVideoConsultation: allowVideoConsultation !== undefined ? allowVideoConsultation : true,
      allowAudioConsultation: allowAudioConsultation !== undefined ? allowAudioConsultation : true,
      allowChatConsultation: allowChatConsultation !== undefined ? allowChatConsultation : false,
      allowInPersonConsultation: allowInPersonConsultation !== undefined ? allowInPersonConsultation : false,
      videoConsultationFee: videoConsultationFee || 500.00,
      audioConsultationFee: audioConsultationFee || 300.00,
      chatConsultationFee: chatConsultationFee || 200.00,
      inPersonConsultationFee: inPersonConsultationFee || 800.00,
      maxAppointmentsPerSlot: maxAppointmentsPerSlot || 1
    });

    return res.status(201).json({
      message: 'Availability created successfully',
      availability
    });
  } catch (error) {
    console.error('Set availability error:', error);
    return res.status(500).json({ 
      message: 'Failed to set availability',
      error: error.message 
    });
  }
};

/**
 * Update doctor's availability (Doctor only)
 * PATCH /api/doctors/:doctorId/availability/:scheduleId
 */
export const updateDoctorAvailability = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { doctorId, scheduleId } = req.params;
    const authenticatedDoctorId = resolveAuthenticatedDoctorId(req);

    if (!authenticatedDoctorId) {
      return res.status(403).json({ message: 'Only doctors can update availability' });
    }

    // Check if authenticated user is the doctor
    if (parseInt(doctorId) !== authenticatedDoctorId) {
      return res.status(403).json({ 
        message: 'You can only update your own availability' 
      });
    }

    const availability = await DoctorAvailability.findOne({
      where: {
        id: scheduleId,
        doctorId
      }
    });

    if (!availability) {
      return res.status(404).json({ message: 'Availability schedule not found' });
    }

    // Update availability
    await availability.update(req.body);

    return res.status(200).json({
      message: 'Availability updated successfully',
      availability
    });
  } catch (error) {
    console.error('Update availability error:', error);
    return res.status(500).json({ 
      message: 'Failed to update availability',
      error: error.message 
    });
  }
};

/**
 * Delete doctor's availability (Doctor only)
 * DELETE /api/doctors/:doctorId/availability/:scheduleId
 */
export const deleteDoctorAvailability = async (req, res) => {
  try {
    const { doctorId, scheduleId } = req.params;
    const authenticatedDoctorId = resolveAuthenticatedDoctorId(req);

    if (!authenticatedDoctorId) {
      return res.status(403).json({ message: 'Only doctors can delete availability' });
    }

    // Check if authenticated user is the doctor
    if (parseInt(doctorId) !== authenticatedDoctorId) {
      return res.status(403).json({ 
        message: 'You can only delete your own availability' 
      });
    }

    const availability = await DoctorAvailability.findOne({
      where: {
        id: scheduleId,
        doctorId
      }
    });

    if (!availability) {
      return res.status(404).json({ message: 'Availability schedule not found' });
    }

    await availability.destroy();

    return res.status(200).json({
      message: 'Availability deleted successfully'
    });
  } catch (error) {
    console.error('Delete availability error:', error);
    return res.status(500).json({ 
      message: 'Failed to delete availability',
      error: error.message 
    });
  }
};

/**
 * Bulk set doctor's weekly availability (Doctor only)
 * POST /api/doctors/:doctorId/availability/bulk
 */
export const bulkSetAvailability = async (req, res) => {
  try {
    const { doctorId } = req.params;
    const authenticatedDoctorId = resolveAuthenticatedDoctorId(req);
    const { schedules } = req.body;

    if (!authenticatedDoctorId) {
      return res.status(403).json({ message: 'Only doctors can set availability' });
    }

    // Check if authenticated user is the doctor
    if (parseInt(doctorId) !== authenticatedDoctorId) {
      return res.status(403).json({ 
        message: 'You can only set your own availability' 
      });
    }

    if (!Array.isArray(schedules) || schedules.length === 0) {
      return res.status(400).json({ 
        message: 'Schedules array is required' 
      });
    }

    // Verify doctor exists
    const doctor = await Doctor.findByPk(doctorId);
    if (!doctor) {
      return res.status(404).json({ message: 'Doctor not found' });
    }

    // Create all schedules
    const createdSchedules = await Promise.all(
      schedules.map(schedule =>
        DoctorAvailability.create({
          ...schedule,
          doctorId
        })
      )
    );

    return res.status(201).json({
      message: 'Availability schedules created successfully',
      count: createdSchedules.length,
      schedules: createdSchedules
    });
  } catch (error) {
    console.error('Bulk set availability error:', error);
    return res.status(500).json({ 
      message: 'Failed to set availability',
      error: error.message 
    });
  }
};
