import { validationResult } from 'express-validator';
import Appointment from '../models/appointment.model.intelligent.js';
import DoctorAvailability from '../models/doctorAvailability.model.intelligent.js';
import Doctor from '../models/doctor.model.intelligent.js';
import User from '../models/user.model.intelligent.js';
import { Op } from 'sequelize';
import { 
  sendAppointmentConfirmation, 
  scheduleAppointmentReminder,
  publishAppointmentBooked 
} from '../tasks/index.js';
import intelligentDb from '../utils/intelligentDbClient.js';
import n8nService from '../services/n8n.service.js';

/**
 * Create a new appointment
 * POST /api/appointments
 */
export const createAppointment = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      doctorId,
      appointmentDate,
      appointmentTime,
      consultationType,
      symptoms,
      reason
    } = req.body;

    const userId = req.user.id;

    // Fetch user details
    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Fetch doctor details
    const doctor = await Doctor.findByPk(doctorId);
    if (!doctor) {
      return res.status(404).json({ message: 'Doctor not found' });
    }

    // Check if slot is available
    const existingAppointment = await Appointment.findOne({
      where: {
        doctorId,
        appointmentDate,
        appointmentTime,
        status: {
          [Op.notIn]: ['cancelled', 'no-show']
        }
      }
    });

    if (existingAppointment) {
      return res.status(409).json({ 
        message: 'This time slot is already booked. Please select another slot.' 
      });
    }

    // Get consultation fee based on type
    const availability = await DoctorAvailability.findOne({
      where: { doctorId }
    });

    let consultationFee = 500; // Default
    if (availability) {
      switch (consultationType) {
        case 'video':
          consultationFee = availability.videoConsultationFee;
          break;
        case 'audio':
          consultationFee = availability.audioConsultationFee;
          break;
        case 'chat':
          consultationFee = availability.chatConsultationFee;
          break;
        case 'in-person':
          consultationFee = availability.inPersonConsultationFee;
          break;
      }
    }

    // Create appointment
    const appointment = await Appointment.create({
      userId,
      patientName: `${user.firstName} ${user.lastName}`,
      patientEmail: user.email,
      patientPhone: user.phoneNumber || 'N/A',
      doctorId,
      doctorName: `Dr. ${doctor.firstName} ${doctor.lastName}`,
      specialization: doctor.specialization,
      appointmentDate,
      appointmentTime,
      consultationType,
      consultationFee,
      symptoms,
      reason,
      status: 'scheduled',
      paymentStatus: 'pending'
    });

    // Send confirmation email (async task)
    try {
      await sendAppointmentConfirmation(user.email, {
        doctorName: appointment.doctorName,
        date: appointmentDate,
        time: appointmentTime,
        type: consultationType
      });
    } catch (emailError) {
      console.error('Failed to send confirmation email:', emailError);
    }

    // Schedule reminder (async task)
    try {
      const appointmentDateTime = new Date(`${appointmentDate} ${appointmentTime}`);
      await scheduleAppointmentReminder(userId, appointment.id, appointmentDateTime);
    } catch (reminderError) {
      console.error('Failed to schedule reminder:', reminderError);
    }

    // Publish to Kafka (async task)
    try {
      await publishAppointmentBooked({
        appointmentId: appointment.id,
        userId,
        doctorId,
        appointmentDate,
        appointmentTime
      });
    } catch (kafkaError) {
      console.error('Failed to publish to Kafka:', kafkaError);
    }

    // Trigger n8n workflow for multi-channel notifications (async)
    try {
      await n8nService.appointmentBooked({
        id: appointment.id,
        userId: appointment.userId,
        patientName: appointment.patientName,
        patientEmail: appointment.patientEmail,
        patientPhone: appointment.patientPhone,
        doctorId: appointment.doctorId,
        doctorName: appointment.doctorName,
        appointmentDate: appointment.appointmentDate,
        appointmentTime: appointment.appointmentTime,
        consultationType: appointment.consultationType,
        consultationFee: appointment.consultationFee,
        status: appointment.status
      });
    } catch (n8nError) {
      console.error('Failed to trigger n8n workflow:', n8nError);
    }

    // Mirror to intelligent DB (fire-and-forget style)
    (async () => {
      try {
        const payload = {
          id: appointment.id,
          patientId: appointment.userId,
          doctorId: appointment.doctorId,
          appointmentDate: appointment.appointmentDate,
          appointmentTime: appointment.appointmentTime,
          consultationType: appointment.consultationType,
          status: appointment.status,
          createdAt: appointment.createdAt,
          updatedAt: appointment.updatedAt
        };
        await intelligentDb.ingest('appointments_v1', payload);
      } catch (err) {
        console.error('Intelligent DB ingest (appointment) failed:', err.message || err);
      }
    })();

    return res.status(201).json({
      message: 'Appointment booked successfully',
      appointment: {
        id: appointment.id,
        doctorName: appointment.doctorName,
        specialization: appointment.specialization,
        appointmentDate: appointment.appointmentDate,
        appointmentTime: appointment.appointmentTime,
        consultationType: appointment.consultationType,
        consultationFee: appointment.consultationFee,
        status: appointment.status,
        paymentStatus: appointment.paymentStatus
      }
    });
  } catch (error) {
    console.error('Create appointment error:', error);
    return res.status(500).json({ 
      message: 'Failed to create appointment',
      error: error.message 
    });
  }
};

/**
 * Get user's appointments
 * GET /api/appointments
 */
export const getUserAppointments = async (req, res) => {
  try {
    const userId = req.user.id;
    const { status, upcoming, past } = req.query;

    const whereClause = { userId };

    // Filter by status if provided
    if (status) {
      whereClause.status = status;
    }

    // Filter upcoming or past
    const now = new Date();
    if (upcoming === 'true') {
      whereClause.appointmentDate = {
        [Op.gte]: now.toISOString().split('T')[0]
      };
      whereClause.status = {
        [Op.in]: ['scheduled', 'confirmed']
      };
    } else if (past === 'true') {
      whereClause.appointmentDate = {
        [Op.lt]: now.toISOString().split('T')[0]
      };
    }

    const appointments = await Appointment.findAll({
      where: whereClause,
      order: [
        ['appointmentDate', 'DESC'],
        ['appointmentTime', 'DESC']
      ]
    });

    return res.status(200).json({
      count: appointments.length,
      appointments
    });
  } catch (error) {
    console.error('Get appointments error:', error);
    return res.status(500).json({ 
      message: 'Failed to fetch appointments',
      error: error.message 
    });
  }
};

/**
 * Get doctor's appointments
 * GET /api/appointments/doctor
 */
export const getDoctorAppointments = async (req, res) => {
  try {
    const doctorId = req.user.id; // Assuming req.user contains doctor info
    const { status, date, upcoming } = req.query;

    const whereClause = { doctorId };

    if (status) {
      whereClause.status = status;
    }

    if (date) {
      whereClause.appointmentDate = date;
    }

    if (upcoming === 'true') {
      const now = new Date();
      whereClause.appointmentDate = {
        [Op.gte]: now.toISOString().split('T')[0]
      };
    }

    const appointments = await Appointment.findAll({
      where: whereClause,
      order: [
        ['appointmentDate', 'ASC'],
        ['appointmentTime', 'ASC']
      ]
    });

    return res.status(200).json({
      count: appointments.length,
      appointments
    });
  } catch (error) {
    console.error('Get doctor appointments error:', error);
    return res.status(500).json({ 
      message: 'Failed to fetch appointments',
      error: error.message 
    });
  }
};

/**
 * Get single appointment details
 * GET /api/appointments/:id
 */
export const getAppointmentById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const appointment = await Appointment.findByPk(id);

    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found' });
    }

    // Check authorization (user must be the patient or doctor)
    if (appointment.userId !== userId && appointment.doctorId !== userId) {
      return res.status(403).json({ message: 'Unauthorized access' });
    }

    return res.status(200).json({ appointment });
  } catch (error) {
    console.error('Get appointment error:', error);
    return res.status(500).json({ 
      message: 'Failed to fetch appointment',
      error: error.message 
    });
  }
};

/**
 * Cancel appointment
 * DELETE /api/appointments/:id
 */
export const cancelAppointment = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { reason } = req.body;

    const appointment = await Appointment.findByPk(id);

    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found' });
    }

    // Check authorization
    if (appointment.userId !== userId && appointment.doctorId !== userId) {
      return res.status(403).json({ message: 'Unauthorized access' });
    }

    // Check if appointment can be cancelled
    if (!appointment.canBeCancelled()) {
      return res.status(400).json({ 
        message: 'Appointment cannot be cancelled. Must be cancelled at least 2 hours before the scheduled time.' 
      });
    }

    // Update appointment
    await appointment.update({
      status: 'cancelled',
      cancelledBy: appointment.userId === userId ? 'patient' : 'doctor',
      cancellationReason: reason || 'No reason provided',
      cancelledAt: new Date()
    });

    return res.status(200).json({
      message: 'Appointment cancelled successfully',
      appointment
    });
  } catch (error) {
    console.error('Cancel appointment error:', error);
    return res.status(500).json({ 
      message: 'Failed to cancel appointment',
      error: error.message 
    });
  }
};

/**
 * Reschedule appointment
 * PATCH /api/appointments/:id/reschedule
 */
export const rescheduleAppointment = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const userId = req.user.id;
    const { appointmentDate, appointmentTime } = req.body;

    const appointment = await Appointment.findByPk(id);

    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found' });
    }

    // Check authorization
    if (appointment.userId !== userId) {
      return res.status(403).json({ message: 'Unauthorized access' });
    }

    // Check if appointment can be rescheduled
    if (!appointment.canBeRescheduled()) {
      return res.status(400).json({ 
        message: 'Appointment cannot be rescheduled at this time.' 
      });
    }

    // Check if new slot is available
    const existingAppointment = await Appointment.findOne({
      where: {
        doctorId: appointment.doctorId,
        appointmentDate,
        appointmentTime,
        status: {
          [Op.notIn]: ['cancelled', 'no-show']
        }
      }
    });

    if (existingAppointment) {
      return res.status(409).json({ 
        message: 'This time slot is already booked. Please select another slot.' 
      });
    }

    // Update appointment
    await appointment.update({
      appointmentDate,
      appointmentTime,
      status: 'rescheduled'
    });

    return res.status(200).json({
      message: 'Appointment rescheduled successfully',
      appointment
    });
  } catch (error) {
    console.error('Reschedule appointment error:', error);
    return res.status(500).json({ 
      message: 'Failed to reschedule appointment',
      error: error.message 
    });
  }
};

/**
 * Complete appointment (Doctor only)
 * POST /api/appointments/:id/complete
 */
export const completeAppointment = async (req, res) => {
  try {
    const { id } = req.params;
    const doctorId = req.user.id;
    const { notes, prescription } = req.body;

    const appointment = await Appointment.findByPk(id);

    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found' });
    }

    // Check authorization
    if (appointment.doctorId !== doctorId) {
      return res.status(403).json({ message: 'Unauthorized access' });
    }

    // Update appointment
    await appointment.update({
      status: 'completed',
      notes,
      prescription
    });

    return res.status(200).json({
      message: 'Appointment marked as completed',
      appointment
    });
  } catch (error) {
    console.error('Complete appointment error:', error);
    return res.status(500).json({ 
      message: 'Failed to complete appointment',
      error: error.message 
    });
  }
};

/**
 * Submit appointment rating
 * POST /api/appointments/:id/rating
 */
export const rateAppointment = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const userId = req.user.id;
    const { rating, feedback } = req.body;

    const appointment = await Appointment.findByPk(id);

    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found' });
    }

    // Check authorization
    if (appointment.userId !== userId) {
      return res.status(403).json({ message: 'Unauthorized access' });
    }

    // Check if appointment is completed
    if (appointment.status !== 'completed') {
      return res.status(400).json({ 
        message: 'Can only rate completed appointments' 
      });
    }

    // Update appointment
    await appointment.update({
      rating,
      feedback
    });

    return res.status(200).json({
      message: 'Rating submitted successfully',
      appointment
    });
  } catch (error) {
    console.error('Rate appointment error:', error);
    return res.status(500).json({ 
      message: 'Failed to submit rating',
      error: error.message 
    });
  }
};

/**
 * Update payment status
 * PATCH /api/appointments/:id/payment
 */
export const updatePaymentStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { paymentStatus, paymentMethod, transactionId } = req.body;

    const appointment = await Appointment.findByPk(id);

    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found' });
    }

    await appointment.update({
      paymentStatus,
      paymentMethod,
      transactionId
    });

    // If payment is successful, confirm the appointment
    if (paymentStatus === 'paid' && appointment.status === 'scheduled') {
      await appointment.update({ status: 'confirmed' });
    }

    return res.status(200).json({
      message: 'Payment status updated',
      appointment
    });
  } catch (error) {
    console.error('Update payment error:', error);
    return res.status(500).json({ 
      message: 'Failed to update payment status',
      error: error.message 
    });
  }
};
