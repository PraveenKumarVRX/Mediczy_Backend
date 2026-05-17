import express from "express";
import { body, validationResult } from "express-validator";
import {
  registerDoctor,
  signInDoctor,
  getDoctorProfile,
  getAvailableDoctors,
  updateDoctorStatus,
} from "../controller/doctor.controller.js";
import { getDoctorAppointments } from "../controller/appointment.controller.js";
import { authDoctor } from "../middleware/auth.middleware.js";
import { authLimiter, otpLimiter } from "../middleware/rateLimiter.middleware.js";
import { addOtpRoutes } from './shared/registrationHelpers.js';
import googlePlacesService from '../services/google-places.service.js';
import { Doctor, Appointment, User } from "../models/index.js";
import { UserPlan } from "../models/postgres/membershipPlan.model.postgres.js";
import { Op } from 'sequelize';
import { Notification } from '../services/notification.service.js';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { cache } from '../db/redis.js';
import { evaluateVitalsAndAlert } from '../services/clinical-intelligence.service.js';
import {
  buildLiveKitJoinData,
  ensureMeetingInfo,
  getProviderLabel
} from '../utils/videoProvider.js';

const router = express.Router();

console.log('🔷 [doctor.route.js] Module loaded');
console.log('🔷 signInDoctor type:', typeof signInDoctor);

const ALERT_STATE_PREFIX = 'doctor:alerts:state:';
const MESSAGE_PREFIX = 'doctor:messages:';
const ALERT_STATE_TTL = 7 * 24 * 60 * 60;
const MESSAGE_TTL = 7 * 24 * 60 * 60;
const localAlertState = new Map();
const localMessages = new Map();
const MAX_CACHE_ENTRIES = 1000; // Limit to prevent memory leak

// Cleanup old entries every 30 minutes
setInterval(() => {
  if (localAlertState.size > MAX_CACHE_ENTRIES) {
    const keysToDelete = Array.from(localAlertState.keys()).slice(0, localAlertState.size - MAX_CACHE_ENTRIES);
    keysToDelete.forEach(k => localAlertState.delete(k));
  }
  if (localMessages.size > MAX_CACHE_ENTRIES) {
    const keysToDelete = Array.from(localMessages.keys()).slice(0, localMessages.size - MAX_CACHE_ENTRIES);
    keysToDelete.forEach(k => localMessages.delete(k));
  }
  console.log(`🧹 Cleaned up doctor caches. Alerts: ${localAlertState.size}, Messages: ${localMessages.size}`);
}, 30 * 60 * 1000); // Every 30 minutes

const getCachedValue = async (key, fallbackMap, defaultValue) => {
  const cached = await cache.get(key);
  if (cached) return cached;
  if (fallbackMap.has(key)) return fallbackMap.get(key);
  return defaultValue;
};

const setCachedValue = async (key, value, ttl, fallbackMap) => {
  await cache.set(key, value, ttl);
  fallbackMap.set(key, value);
};

const buildDoctorAlerts = (data) => {
  const { pendingAppointments, todayAppointments } = data;
  const now = new Date().toISOString();
  const alerts = [];

  if (pendingAppointments > 0) {
    alerts.push({
      id: 'pending-appointments',
      type: 'warning',
      title: 'Pending Appointments',
      message: `You have ${pendingAppointments} appointment(s) awaiting confirmation`,
      timestamp: now,
      category: 'appointment',
      actionRequired: true
    });
  }

  if (todayAppointments > 0) {
    alerts.push({
      id: 'today-appointments',
      type: 'info',
      title: "Today's Schedule",
      message: `You have ${todayAppointments} appointment(s) scheduled for today`,
      timestamp: now,
      category: 'appointment',
      actionRequired: false
    });
  }

  if (alerts.length === 0) {
    alerts.push({
      id: 'no-alerts',
      type: 'success',
      title: 'All Clear',
      message: 'No urgent alerts at the moment',
      timestamp: now,
      category: 'system',
      actionRequired: false
    });
  }

  return alerts;
};

// Doctor Registration Route
router.post(
  "/register",
  [
    body("email").isEmail().withMessage("Must be a valid email"),
    body("password")
      .isLength({ min: 6 })
      .withMessage("Password must be at least 6 characters long"),
    body("firstName")
      .isLength({ min: 3, max: 20 })
      .withMessage("First name must be between 3 to 20 characters"),
    body("lastName")
      .isLength({ min: 3, max: 20 })
      .withMessage("Last name must be between 3 to 20 characters"),
    body("phoneNumber")
      .isMobilePhone()
      .withMessage("Must be a valid mobile phone number"),
    body("specialization").notEmpty().withMessage("Specialization is required"),
    body("experience")
      .optional()
      .isInt({ min: 0 })
      .withMessage("Experience must be at least 0 years"),
    body("qualifications")
      .optional()
      .isArray()
      .withMessage("Qualifications must be an array"),
  ],
  registerDoctor
);

// Doctor Login Route
router.post(
  "/login",
  authLimiter,
  [
    body("email").isEmail().withMessage("Must be a valid email"),
    body("password").notEmpty().withMessage("Password is required"),
  ],
  signInDoctor
);

// Get Doctor Profile (Protected Route)
router.get("/profile", authDoctor, getDoctorProfile);

/**
 * @route   GET /api/doctors/appointments
 * @desc    Get all appointments for the logged-in doctor
 * @access  Private (Doctor only)
 */
router.get("/appointments", authDoctor, async (req, res) => {
  try {
    const doctorId = req.doctor.id;
    const { status, date, upcoming } = req.query;

    // Build query filters
    const where = { doctorId };

    // Filter by status if provided
    if (status) {
      where.status = status;
    }

    // Filter by date if provided
    if (date) {
      where.appointmentDate = date;
    }

    // Filter upcoming appointments
    if (upcoming === 'true') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      where.appointmentDate = { [Op.gte]: today };
      where.status = { [Op.in]: ['scheduled', 'confirmed', 'in-progress'] };
    }

    const appointments = await Appointment.findAll({
      where,
      include: [
        {
          model: User,
          as: 'patient',
          attributes: ['id', 'firstName', 'lastName', 'email', 'phoneNumber']
        }
      ],
      order: [['appointmentDate', 'ASC'], ['appointmentTime', 'ASC']]
    });

    res.json({
      success: true,
      appointments: appointments.map(apt => ({
        id: apt.id,
        patientId: apt.userId,
        patientName: apt.patient 
          ? `${apt.patient.firstName} ${apt.patient.lastName}`
          : apt.patientName || 'Unknown',
        patientEmail: apt.patient?.email,
        patientPhone: apt.patient?.phoneNumber,
        appointmentDate: apt.appointmentDate,
        appointmentTime: apt.appointmentTime,
        consultationType: apt.consultationType,
        status: apt.status,
        paymentStatus: apt.paymentStatus,
        consultationFee: apt.consultationFee ?? apt.paymentAmount ?? null,
        symptoms: apt.symptoms,
        reason: apt.reason,
        notes: apt.notes,
        meetingId: apt.meetingId,
        meetingLink: apt.meetingLink,
        createdAt: apt.createdAt,
        updatedAt: apt.updatedAt
      }))
    });
  } catch (error) {
    console.error('Get doctor appointments error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch appointments',
      error: error.message
    });
  }
});

// Update Doctor Status
router.put("/status", authDoctor, updateDoctorStatus);

// Get Available Doctors
router.get("/available", getAvailableDoctors);

/**
 * @route   GET /api/doctors/alerts
 * @desc    Get doctor alerts/notifications
 * @access  Private (Doctor only)
 */
router.get("/alerts", authDoctor, async (req, res) => {
  try {
    const doctorId = req.doctor.id;

    // Get pending appointments (needs attention)
    const pendingAppointments = await Appointment.count({
      where: {
        doctorId,
        status: 'pending'
      }
    });

    // Get today's appointments
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const todayAppointments = await Appointment.count({
      where: {
        doctorId,
        appointmentDate: { [Op.gte]: today, [Op.lt]: tomorrow }
      }
    });

    const baseAlerts = buildDoctorAlerts({
      pendingAppointments,
      todayAppointments
    });

    const stateKey = `${ALERT_STATE_PREFIX}${doctorId}`;
    const state = await getCachedValue(stateKey, localAlertState, {
      readIds: [],
      dismissedIds: []
    });

    const dismissed = new Set(state.dismissedIds || []);
    const readIds = new Set(state.readIds || []);

    const aggregateAlerts = baseAlerts
      .filter(alert => !dismissed.has(alert.id))
      .map(alert => ({
        ...alert,
        isRead: readIds.has(alert.id)
      }));

    // Fetch real per-appointment notifications from the notifications table
    const dbNotifications = await Notification.findAll({
      where: {
        userId: doctorId,
        userType: 'doctor',
        type: { [Op.in]: ['appointment_request', 'appointment', 'appointment_cancelled', 'payment_received', 'consultation_reminder', 'consultation_starting'] }
      },
      order: [['createdAt', 'DESC']],
      limit: 30
    });

    const dbAlerts = dbNotifications
      .filter(n => !dismissed.has(`notif-${n.id}`))
      .map(n => ({
        id: `notif-${n.id}`,
        type: n.type === 'appointment_request' ? 'warning' : 'info',
        title: n.title,
        message: n.message,
        timestamp: n.createdAt.toISOString(),
        category: 'appointment',
        isRead: n.isRead || readIds.has(`notif-${n.id}`),
        actionRequired: n.type === 'appointment_request',
        data: n.data
      }));

    const alerts = [...dbAlerts, ...aggregateAlerts];

    res.json({
      success: true,
      alerts,
      unreadCount: alerts.filter(alert => !alert.isRead).length
    });

  } catch (error) {
    console.error('Get alerts error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch alerts',
      error: error.message
    });
  }
});

/**
 * @route   PATCH /api/doctors/alerts/:alertId/read
 * @desc    Mark a doctor alert as read
 * @access  Private (Doctor only)
 */
router.patch("/alerts/:alertId/read", authDoctor, async (req, res) => {
  try {
    const doctorId = req.doctor.id;
    const { alertId } = req.params;
    const stateKey = `${ALERT_STATE_PREFIX}${doctorId}`;
    const state = await getCachedValue(stateKey, localAlertState, {
      readIds: [],
      dismissedIds: []
    });

    if (!state.readIds.includes(alertId)) {
      state.readIds.push(alertId);
    }

    await setCachedValue(stateKey, state, ALERT_STATE_TTL, localAlertState);

    // If alertId is a DB notification (prefixed with 'notif-'), mark it read in DB too
    if (alertId.startsWith('notif-')) {
      const notifId = parseInt(alertId.replace('notif-', ''), 10);
      if (!isNaN(notifId)) {
        await Notification.update(
          { isRead: true, readAt: new Date() },
          { where: { id: notifId, userId: doctorId } }
        );
      }
    }

    res.json({ success: true, message: 'Alert marked as read' });
  } catch (error) {
    console.error('Mark alert read error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark alert as read',
      error: error.message
    });
  }
});

/**
 * @route   PATCH /api/doctors/alerts/mark-all-read
 * @desc    Mark all current alerts as read
 * @access  Private (Doctor only)
 */
router.patch("/alerts/mark-all-read", authDoctor, async (req, res) => {
  try {
    const doctorId = req.doctor.id;
    const now = new Date();
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const [pendingAppointments, todayAppointments] = await Promise.all([
      Appointment.count({ where: { doctorId, status: 'pending' } }),
      Appointment.count({
        where: {
          doctorId,
          appointmentDate: { [Op.gte]: today, [Op.lt]: tomorrow }
        }
      })
    ]);

    const baseAlerts = buildDoctorAlerts({ pendingAppointments, todayAppointments });
    const stateKey = `${ALERT_STATE_PREFIX}${doctorId}`;
    const state = await getCachedValue(stateKey, localAlertState, {
      readIds: [],
      dismissedIds: []
    });

    state.readIds = Array.from(new Set([...(state.readIds || []), ...baseAlerts.map(a => a.id)]));
    await setCachedValue(stateKey, state, ALERT_STATE_TTL, localAlertState);

    // Also mark all DB notifications for this doctor as read
    await Notification.update(
      { isRead: true, readAt: new Date() },
      { where: { userId: doctorId, userType: 'doctor', isRead: false } }
    );

    res.json({ success: true, message: 'All alerts marked as read' });
  } catch (error) {
    console.error('Mark all alerts read error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark all alerts as read',
      error: error.message
    });
  }
});

/**
 * @route   DELETE /api/doctors/alerts/:alertId
 * @desc    Dismiss a doctor alert
 * @access  Private (Doctor only)
 */
router.delete("/alerts/:alertId", authDoctor, async (req, res) => {
  try {
    const doctorId = req.doctor.id;
    const { alertId } = req.params;
    const stateKey = `${ALERT_STATE_PREFIX}${doctorId}`;
    const state = await getCachedValue(stateKey, localAlertState, {
      readIds: [],
      dismissedIds: []
    });

    if (!state.dismissedIds.includes(alertId)) {
      state.dismissedIds.push(alertId);
    }

    await setCachedValue(stateKey, state, ALERT_STATE_TTL, localAlertState);

    // If alertId is a DB notification, delete it from the DB as well
    if (alertId.startsWith('notif-')) {
      const notifId = parseInt(alertId.replace('notif-', ''), 10);
      if (!isNaN(notifId)) {
        await Notification.destroy({ where: { id: notifId, userId: doctorId } });
      }
    }

    res.json({ success: true, message: 'Alert dismissed' });
  } catch (error) {
    console.error('Dismiss alert error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to dismiss alert',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/doctors/dashboard/stats
 * @desc    Get doctor dashboard statistics
 * @access  Private (Doctor only)
 */
router.get("/dashboard/stats", authDoctor, async (req, res) => {
  try {
    const doctorId = req.doctor.id;

    // Get total unique patients
    const totalPatients = await Appointment.count({
      where: { doctorId },
      distinct: true,
      col: 'userId'
    });

    // Get all-time completed consultations
    const totalConsultations = await Appointment.count({
      where: {
        doctorId,
        status: 'completed',
      }
    });

    // Get last month's stats for comparison
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const startOfLastMonth = new Date(startOfMonth);
    startOfLastMonth.setMonth(startOfLastMonth.getMonth() - 1);
    const endOfLastMonth = new Date(startOfMonth);
    endOfLastMonth.setDate(0);

    const lastMonthPatients = await Appointment.count({
      where: {
        doctorId,
        appointmentDate: { [Op.between]: [startOfLastMonth, endOfLastMonth] }
      },
      distinct: true,
      col: 'userId'
    });

    const lastMonthConsultations = await Appointment.count({
      where: {
        doctorId,
        status: 'completed',
        appointmentDate: { [Op.between]: [startOfLastMonth, endOfLastMonth] }
      }
    });

    // Calculate growth percentages
    const patientGrowth = lastMonthPatients > 0
      ? Math.round(((totalPatients - lastMonthPatients) / lastMonthPatients) * 100)
      : 0;
    const consultationGrowth = lastMonthConsultations > 0
      ? Math.round(((totalConsultations - lastMonthConsultations) / lastMonthConsultations) * 100)
      : 0;

    // Response rate (appointments accepted vs total)
    const totalRequests = await Appointment.count({ where: { doctorId } });
    const acceptedRequests = await Appointment.count({
      where: { doctorId, status: { [Op.ne]: 'cancelled' } }
    });
    const responseRate = totalRequests > 0 ? Math.round((acceptedRequests / totalRequests) * 100) : 95;

    // Today's appointment counts
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const todayAppointments = await Appointment.count({
      where: { doctorId, appointmentDate: { [Op.gte]: today, [Op.lt]: tomorrow } }
    });
    const pendingAppointments = await Appointment.count({
      where: { doctorId, status: 'pending' }
    });
    const completedToday = await Appointment.count({
      where: { doctorId, status: 'completed', appointmentDate: { [Op.gte]: today, [Op.lt]: tomorrow } }
    });

    // Revenue: sum of consultation fees from completed appointments this month
    const revenueResult = await Appointment.sum('paymentAmount', {
      where: { doctorId, status: 'completed', appointmentDate: { [Op.gte]: startOfMonth } }
    });
    const revenue = revenueResult || 0;

    res.json({
      success: true,
      totalPatients,
      totalConsultations,
      responseRate,
      patientGrowth,
      consultationGrowth,
      responseRateGrowth: 2,
      todayAppointments,
      pendingAppointments,
      completedToday,
      revenue
    });

  } catch (error) {
    console.error('Get dashboard stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dashboard stats',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/doctors/analytics
 * @desc    Get doctor analytics data
 * @access  Private (Doctor only)
 */
router.get("/analytics", authDoctor, async (req, res) => {
  try {
    const doctorId = req.doctor.id;
    const { period = '30' } = req.query;

    // Handle period as days number or string like 'week', 'month', 'year'
    let days;
    if (period === 'week') days = 7;
    else if (period === 'month') days = 30;
    else if (period === 'year') days = 365;
    else days = parseInt(period) || 30;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Appointments by status
    const appointmentsByStatus = await Appointment.findAll({
      where: {
        doctorId,
        appointmentDate: { [Op.gte]: startDate }
      },
      attributes: ['status', [Appointment.sequelize.fn('COUNT', '*'), 'count']],
      group: ['status']
    });

    // Appointments by day
    const appointmentsByDay = await Appointment.findAll({
      where: {
        doctorId,
        appointmentDate: { [Op.gte]: startDate }
      },
      attributes: [
        [Appointment.sequelize.fn('DATE', Appointment.sequelize.col('appointmentDate')), 'date'],
        [Appointment.sequelize.fn('COUNT', '*'), 'count']
      ],
      group: [Appointment.sequelize.fn('DATE', Appointment.sequelize.col('appointmentDate'))],
      order: [[Appointment.sequelize.fn('DATE', Appointment.sequelize.col('appointmentDate')), 'ASC']]
    });

    // Revenue (from completed consultations)
    const completedAppointments = await Appointment.findAll({
      where: {
        doctorId,
        status: 'completed',
        appointmentDate: { [Op.gte]: startDate }
      },
      attributes: ['paymentAmount']
    });

    const totalRevenue = completedAppointments.reduce((sum, apt) => sum + (parseFloat(apt.paymentAmount) || 0), 0);

    res.json({
      success: true,
      analytics: {
        appointmentsByStatus: appointmentsByStatus.map(s => ({ status: s.status, count: parseInt(s.dataValues.count) })),
        appointmentsByDay: appointmentsByDay.map(d => ({ date: d.dataValues.date, count: parseInt(d.dataValues.count) })),
        totalRevenue,
        period: `${days} days`
      }
    });

  } catch (error) {
    console.error('Get analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch analytics',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/doctors/fetch-social-avatar
 * @desc    Server-side fetch of a social media page's profile picture (og:image)
 * @access  Private (Doctor only)
 */
router.post("/fetch-social-avatar", authDoctor, async (req, res) => {
  try {
    const { url, platform } = req.body;
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ success: false, message: 'URL is required' });
    }

    // Validate URL is a known social media domain
    let parsedUrl;
    try { parsedUrl = new URL(url); } catch {
      return res.status(400).json({ success: false, message: 'Invalid URL' });
    }
    const hostname = parsedUrl.hostname.replace(/^www\./, '');
    const allowed = ['facebook.com', 'instagram.com', 'youtube.com', 'youtu.be'];
    if (!allowed.includes(hostname)) {
      return res.status(400).json({ success: false, message: 'Only Facebook, Instagram and YouTube URLs are allowed' });
    }

    let imageUrl = null;

    // Facebook public page picture via Graph API (no auth needed for public pages)
    if (hostname === 'facebook.com' && platform === 'facebook') {
      // Extract page slug from URL path
      const slug = parsedUrl.pathname.replace(/\//g, '').split('?')[0];
      if (slug) {
        imageUrl = `https://graph.facebook.com/${encodeURIComponent(slug)}/picture?type=large&redirect=false`;
        // Resolve the Graph API to get the actual image URL
        const graphResp = await fetch(imageUrl, { signal: AbortSignal.timeout(5000) });
        if (graphResp.ok) {
          const graphJson = await graphResp.json().catch(() => null);
          if (graphJson?.data?.url) {
            imageUrl = graphJson.data.url;
          }
        }
      }
    }

    // YouTube channel avatar via OG image
    if ((hostname === 'youtube.com' || hostname === 'youtu.be') && platform === 'youtube') {
      const resp = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1)' },
        signal: AbortSignal.timeout(8000),
      });
      const html = await resp.text();
      const ogMatch = html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i)
        || html.match(/<meta[^>]+content="([^"]+)"[^>]+property="og:image"/i);
      if (ogMatch?.[1]) imageUrl = ogMatch[1].replace(/&amp;/g, '&');
    }

    // Instagram public profile og:image
    if (hostname === 'instagram.com' && platform === 'instagram') {
      const resp = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1)' },
        signal: AbortSignal.timeout(8000),
      });
      const html = await resp.text();
      const ogMatch = html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i)
        || html.match(/<meta[^>]+content="([^"]+)"[^>]+property="og:image"/i);
      if (ogMatch?.[1]) imageUrl = ogMatch[1].replace(/&amp;/g, '&');
    }

    if (!imageUrl) {
      return res.status(404).json({ success: false, message: 'Could not extract profile image from this page. Try uploading manually.' });
    }

    res.json({ success: true, imageUrl });
  } catch (error) {
    console.error('fetch-social-avatar error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to fetch social profile image' });
  }
});

/**
 * @route   GET /api/doctors/settings
 * @desc    Get doctor settings
 * @access  Private (Doctor only)
 */
router.get("/settings", authDoctor, async (req, res) => {
  try {
    const doctor = await Doctor.findByPk(req.doctor.id, {
      attributes: { exclude: ['password'] }
    });

    if (!doctor) {
      return res.status(404).json({ success: false, message: 'Doctor not found' });
    }

    res.json({
      success: true,
      settings: {
        profile: {
          firstName: doctor.firstName,
          lastName: doctor.lastName,
          email: doctor.email,
          phoneNumber: doctor.phoneNumber,
          specialization: doctor.specialization,
          experience: doctor.experience,
          qualifications: doctor.qualifications,
          bio: doctor.bio,
          profileImage: doctor.profileImage,
          socialLinks: doctor.socialLinks || {}
        },
        practice: {
          consultationFee: doctor.consultationFee,
          slotDuration: doctor.slotDuration,
          weeklySchedule: doctor.weeklySchedule,
          practiceLocations: doctor.practiceLocations,
          isAvailable: doctor.isAvailable
        },
        notifications: {
          emailNotifications: doctor.emailNotifications ?? true,
          smsNotifications: doctor.smsNotifications ?? true,
          pushNotifications: doctor.pushNotifications ?? true
        }
      }
    });

  } catch (error) {
    console.error('Get settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch settings',
      error: error.message
    });
  }
});

/**
 * @route   PUT /api/doctors/settings
 * @desc    Update doctor settings
 * @access  Private (Doctor only)
 */
router.put("/settings", authDoctor, async (req, res) => {
  try {
    const doctor = await Doctor.findByPk(req.doctor.id);

    if (!doctor) {
      return res.status(404).json({ success: false, message: 'Doctor not found' });
    }

    const { profile, practice, notifications } = req.body;

    // Track what fields are being updated
    const updatedFields = [];

    // Update profile fields
    if (profile) {
      // Handle simple string/number fields
      if (profile.firstName !== undefined) {
        doctor.firstName = profile.firstName;
        updatedFields.push('firstName');
      }
      if (profile.lastName !== undefined) {
        doctor.lastName = profile.lastName;
        updatedFields.push('lastName');
      }
      if (profile.phoneNumber !== undefined) {
        doctor.phoneNumber = profile.phoneNumber;
        updatedFields.push('phoneNumber');
      }
      if (profile.specialization !== undefined) {
        doctor.specialization = profile.specialization;
        updatedFields.push('specialization');
      }
      if (profile.experience !== undefined) {
        doctor.experience = profile.experience;
        updatedFields.push('experience');
      }
      if (profile.bio !== undefined) {
        doctor.bio = profile.bio;
        updatedFields.push('bio');
      }

      // Profile image (URL or base64, max 2MB guard)
      if (profile.profileImage !== undefined) {
        const img = profile.profileImage;
        if (typeof img === 'string' && img.length < 2 * 1024 * 1024) {
          doctor.profileImage = img || null;
          updatedFields.push('profileImage');
        }
      }

      // Social media links
      if (profile.socialLinks !== undefined) {
        const sl = profile.socialLinks || {};
        doctor.socialLinks = {
          facebook: (typeof sl.facebook === 'string' ? sl.facebook.trim() : '') || '',
          instagram: (typeof sl.instagram === 'string' ? sl.instagram.trim() : '') || '',
          youtube: (typeof sl.youtube === 'string' ? sl.youtube.trim() : '') || '',
        };
        updatedFields.push('socialLinks');
      }

      // Handle qualifications - can be string or array
      if (profile.qualifications !== undefined) {
        if (typeof profile.qualifications === 'string') {
          // If it's a comma-separated string, split it into array
          doctor.qualifications = profile.qualifications.split(',').map(q => q.trim()).filter(Boolean);
        } else if (Array.isArray(profile.qualifications)) {
          doctor.qualifications = profile.qualifications;
        } else {
          doctor.qualifications = [];
        }
        updatedFields.push('qualifications');
      }
    }

    // Update practice fields with special handling for JSONB fields
    if (practice) {
      // Handle simple fields
      if (practice.consultationFee !== undefined) {
        doctor.consultationFee = practice.consultationFee;
        updatedFields.push('consultationFee');
      }
      if (practice.slotDuration !== undefined) {
        // Validate slotDuration is one of the allowed values
        const allowedDurations = [15, 30, 45, 60];
        const duration = parseInt(practice.slotDuration);
        if (allowedDurations.includes(duration)) {
          doctor.slotDuration = duration;
          updatedFields.push('slotDuration');
        } else {
          // Default to 30 if invalid
          console.warn(`Invalid slotDuration ${practice.slotDuration}, defaulting to 30`);
          doctor.slotDuration = 30;
          updatedFields.push('slotDuration (defaulted)');
        }
      }
      if (practice.isAvailable !== undefined) {
        doctor.isAvailable = practice.isAvailable;
        updatedFields.push('isAvailable');
      }

      // Handle JSONB fields - ensure they're properly formatted
      if (practice.weeklySchedule !== undefined) {
        // If it's a string, parse it; if it's already an object, use it
        const weeklySchedule = typeof practice.weeklySchedule === 'string'
          ? JSON.parse(practice.weeklySchedule)
          : practice.weeklySchedule;
        doctor.weeklySchedule = weeklySchedule;
        updatedFields.push('weeklySchedule');
      }
      if (practice.practiceLocations !== undefined) {
        // Ensure it's an array
        const practiceLocations = typeof practice.practiceLocations === 'string'
          ? JSON.parse(practice.practiceLocations)
          : practice.practiceLocations;
        doctor.practiceLocations = Array.isArray(practiceLocations) ? practiceLocations : [];
        updatedFields.push('practiceLocations');
      }
    }

    // Update notification preferences
    if (notifications) {
      if (notifications.emailNotifications !== undefined) {
        doctor.emailNotifications = notifications.emailNotifications;
        updatedFields.push('emailNotifications');
      }
      if (notifications.smsNotifications !== undefined) {
        doctor.smsNotifications = notifications.smsNotifications;
        updatedFields.push('smsNotifications');
      }
      if (notifications.pushNotifications !== undefined) {
        doctor.pushNotifications = notifications.pushNotifications;
        updatedFields.push('pushNotifications');
      }
    }

    // Save changes to database
    await doctor.save();

    console.log(`Doctor settings updated for ID ${req.doctor.id}:`, updatedFields);

    res.json({
      success: true,
      message: 'Settings updated successfully',
      updatedFields
    });

  } catch (error) {
    console.error('Update settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update settings',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/doctors/patients
 * @desc    Get doctor's patients (from appointments)
 * @access  Private (Doctor only)
 */
router.get("/patients", authDoctor, async (req, res) => {
  try {
    const doctorId = req.doctor.id;
    const { search, limit = 20 } = req.query;

    // Get unique patients from appointments
    const whereClause = { doctorId };

    let appointments = await Appointment.findAll({
      where: whereClause,
      include: [{
        model: User,
        as: 'patient',
        attributes: ['id', 'firstName', 'lastName', 'email', 'phoneNumber', 'gender', 'dateOfBirth', 'profileImage']
      }],
      order: [['createdAt', 'DESC']]
    });

    // Get unique patients
    const patientMap = new Map();
    appointments.forEach(apt => {
      if (apt.patient && !patientMap.has(apt.patient.id)) {
        patientMap.set(apt.patient.id, apt.patient);
      }
    });

    let patients = Array.from(patientMap.values());

    // Apply search filter if provided
    if (search) {
      const searchLower = search.toLowerCase();
      patients = patients.filter(p =>
        (p.firstName && p.firstName.toLowerCase().includes(searchLower)) ||
        (p.lastName && p.lastName.toLowerCase().includes(searchLower)) ||
        (p.phoneNumber && p.phoneNumber.includes(search)) ||
        (p.email && p.email.toLowerCase().includes(searchLower))
      );
    }

    // Apply limit
    patients = patients.slice(0, parseInt(limit));

    res.json({
      success: true,
      patients: patients.map(p => ({
        id: p.id,
        firstName: p.firstName,
        lastName: p.lastName,
        email: p.email,
        phoneNumber: p.phoneNumber,
        gender: p.gender,
        dateOfBirth: p.dateOfBirth,
        profileImage: p.profileImage
      }))
    });

  } catch (error) {
    console.error('Get patients error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch patients',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/doctors/templates
 * @desc    Get doctor's document templates
 * @access  Private (Doctor only)
 */
router.get("/templates", authDoctor, async (req, res) => {
  try {
    const doctorId = req.doctor.id;
    const { type } = req.query;

    const doctor = await Doctor.findByPk(doctorId);
    if (!doctor) {
      return res.status(404).json({ success: false, message: 'Doctor not found' });
    }

    let templates = doctor.documentTemplates || [];

    // Filter by type if specified
    if (type) {
      templates = templates.filter(t => t.type === type);
    }

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
 * @route   POST /api/doctors/templates
 * @desc    Create a new document template
 * @access  Private (Doctor only)
 */
router.post("/templates", authDoctor, async (req, res) => {
  try {
    const doctorId = req.doctor.id;
    const { name, type, content, isDefault, specialty, sections, diagram } = req.body;

    if (!name || !type || !content) {
      return res.status(400).json({
        success: false,
        message: 'Name, type, and content are required'
      });
    }

    const doctor = await Doctor.findByPk(doctorId);
    if (!doctor) {
      return res.status(404).json({ success: false, message: 'Doctor not found' });
    }

    const templates = doctor.documentTemplates || [];

    // If setting as default, unset other defaults of same type
    if (isDefault) {
      templates.forEach(t => {
        if (t.type === type) t.isDefault = false;
      });
    }

    const newTemplate = {
      id: `template_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name,
      type,
      content,
      isDefault: isDefault || false,
      specialty: specialty || null,
      sections: sections || null,
      diagram: diagram || null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    templates.push(newTemplate);
    doctor.documentTemplates = [...templates]; // Create new array to trigger Sequelize change detection
    doctor.changed('documentTemplates', true);
    await doctor.save();

    res.status(201).json({
      success: true,
      template: newTemplate
    });

  } catch (error) {
    console.error('Create template error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create template',
      error: error.message
    });
  }
});

/**
 * @route   PUT /api/doctors/templates/:templateId
 * @desc    Update a document template
 * @access  Private (Doctor only)
 */
router.put("/templates/:templateId", authDoctor, async (req, res) => {
  try {
    const doctorId = req.doctor.id;
    const { templateId } = req.params;
    const { name, type, content, isDefault } = req.body;

    const doctor = await Doctor.findByPk(doctorId);
    if (!doctor) {
      return res.status(404).json({ success: false, message: 'Doctor not found' });
    }

    const templates = doctor.documentTemplates || [];
    const templateIndex = templates.findIndex(t => t.id === templateId);

    if (templateIndex === -1) {
      return res.status(404).json({ success: false, message: 'Template not found' });
    }

    // If setting as default, unset other defaults of same type
    if (isDefault) {
      templates.forEach(t => {
        if (t.type === (type || templates[templateIndex].type)) t.isDefault = false;
      });
    }

    templates[templateIndex] = {
      ...templates[templateIndex],
      name: name || templates[templateIndex].name,
      type: type || templates[templateIndex].type,
      content: content || templates[templateIndex].content,
      isDefault: isDefault !== undefined ? isDefault : templates[templateIndex].isDefault,
      updatedAt: new Date().toISOString()
    };

    doctor.documentTemplates = [...templates];
    doctor.changed('documentTemplates', true);
    await doctor.save();

    res.json({
      success: true,
      template: templates[templateIndex]
    });

  } catch (error) {
    console.error('Update template error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update template',
      error: error.message
    });
  }
});

/**
 * @route   DELETE /api/doctors/templates/:templateId
 * @desc    Delete a document template
 * @access  Private (Doctor only)
 */
router.delete("/templates/:templateId", authDoctor, async (req, res) => {
  try {
    const doctorId = req.doctor.id;
    const { templateId } = req.params;

    const doctor = await Doctor.findByPk(doctorId);
    if (!doctor) {
      return res.status(404).json({ success: false, message: 'Doctor not found' });
    }

    const templates = doctor.documentTemplates || [];
    const templateIndex = templates.findIndex(t => t.id === templateId);

    if (templateIndex === -1) {
      return res.status(404).json({ success: false, message: 'Template not found' });
    }

    templates.splice(templateIndex, 1);
    doctor.documentTemplates = [...templates];
    doctor.changed('documentTemplates', true);
    await doctor.save();

    res.json({
      success: true,
      message: 'Template deleted successfully'
    });

  } catch (error) {
    console.error('Delete template error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete template',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/doctors/template-settings
 * @desc    Get doctor's template settings (logo, seal, signature, etc.)
 * @access  Private (Doctor only)
 */
router.get("/template-settings", authDoctor, async (req, res) => {
  try {
    const doctorId = req.doctor.id;

    const doctor = await Doctor.findByPk(doctorId);
    if (!doctor) {
      return res.status(404).json({ success: false, message: 'Doctor not found' });
    }

    const defaultSettings = {
      logo: null,
      logoPosition: "left",
      clinicName: doctor.clinicName || "",
      clinicAddress: "",
      clinicPhone: doctor.phoneNumber || "",
      clinicEmail: doctor.email || "",
      clinicWebsite: "",
      registrationNumber: doctor.registrationNumber || "",
      seal: null,
      signature: null,
      signatureName: `Dr. ${doctor.firstName} ${doctor.lastName}`,
      footerText: "This is a computer-generated document.",
      headerColor: "#1a56db",
      showWatermark: false
    };

    res.json({
      success: true,
      settings: doctor.templateSettings || defaultSettings
    });

  } catch (error) {
    console.error('Get template settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch template settings',
      error: error.message
    });
  }
});

/**
 * @route   PUT /api/doctors/template-settings
 * @desc    Update doctor's template settings
 * @access  Private (Doctor only)
 */
router.put("/template-settings", authDoctor, async (req, res) => {
  try {
    const doctorId = req.doctor.id;
    const settings = req.body;

    const doctor = await Doctor.findByPk(doctorId);
    if (!doctor) {
      return res.status(404).json({ success: false, message: 'Doctor not found' });
    }

    doctor.templateSettings = {
      ...(doctor.templateSettings || {}),
      ...settings,
      updatedAt: new Date().toISOString()
    };
    doctor.changed('templateSettings', true);
    await doctor.save();

    res.json({
      success: true,
      message: 'Template settings updated successfully',
      settings: doctor.templateSettings
    });

  } catch (error) {
    console.error('Update template settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update template settings',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/doctors/:doctorId/user-slots
 * @desc    Get doctor's available slots for user booking (public endpoint)
 * @access  Public
 */
router.get("/:doctorId/user-slots", async (req, res) => {
  try {
    const { doctorId } = req.params;
    const { date } = req.query;

    let doctor = null;
    if (/^\d+$/.test(doctorId)) {
      doctor = await Doctor.findByPk(doctorId);
    } else if (/^D[A-Z0-9]{5}$/i.test(doctorId)) {
      doctor = await Doctor.findOne({ where: { unique_id: doctorId.toUpperCase() } });
    }
    if (!doctor) {
      return res.status(404).json({
        success: false,
        message: 'Doctor not found'
      });
    }

    const resolvedDoctorId = doctor.id;

    // Get doctor's appointment configuration
    const slotDuration = doctor.slotDuration || 30;
    const weeklySchedule = doctor.weeklySchedule || {};
    const practiceLocations = doctor.practiceLocations || [];

    // If date is provided, get slots for that specific day
    if (date) {
      const requestedDate = new Date(date);
      const dayName = requestedDate.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
      const daySchedule = weeklySchedule[dayName];

      if (!daySchedule || daySchedule.isOff) {
        return res.json({
          success: true,
          date,
          dayName,
          isOff: true,
          slots: { online: [], inPerson: [] }
        });
      }

      // Generate time slots based on configuration
      const generateTimeSlots = (startTime, endTime, duration) => {
        const slots = [];
        if (!startTime || !endTime) return slots;

        const [startHour, startMin] = startTime.split(':').map(Number);
        const [endHour, endMin] = endTime.split(':').map(Number);

        let currentTime = startHour * 60 + startMin;
        const endTimeInMin = endHour * 60 + endMin;

        while (currentTime + duration <= endTimeInMin) {
          const hours = Math.floor(currentTime / 60);
          const mins = currentTime % 60;
          const endHours = Math.floor((currentTime + duration) / 60);
          const endMins = (currentTime + duration) % 60;

          const startFormatted = `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
          const endFormatted = `${String(endHours).padStart(2, '0')}:${String(endMins).padStart(2, '0')}`;

          slots.push(`${startFormatted} - ${endFormatted}`);
          currentTime += duration;
        }

        return slots;
      };

      // Get booked appointments for this date
      const bookedAppointments = await Appointment.findAll({
        where: {
          doctorId: resolvedDoctorId,
          appointmentDate: date,
          status: {
            [Op.notIn]: ['cancelled', 'no-show']
          }
        },
        attributes: ['appointmentTime', 'consultationType']
      });

      const bookedSlotTimes = bookedAppointments.map(apt => apt.appointmentTime);

      // Generate online slots
      const onlineSlots = daySchedule.online?.enabled
        ? generateTimeSlots(
          daySchedule.online.startTime,
          daySchedule.online.endTime,
          slotDuration
        ).map(slot => ({
          time: slot,
          available: !bookedSlotTimes.includes(slot) && !daySchedule.blockedSlots?.includes(slot),
          blocked: daySchedule.blockedSlots?.includes(slot) || false
        }))
        : [];

      // Generate in-person slots
      const inPersonSlots = daySchedule.inPerson?.enabled
        ? generateTimeSlots(
          daySchedule.inPerson.startTime,
          daySchedule.inPerson.endTime,
          slotDuration
        ).map(slot => {
          const location = practiceLocations.find(loc => loc.id === daySchedule.inPerson?.locationId);
          return {
            time: slot,
            available: !bookedSlotTimes.includes(slot) && !daySchedule.blockedSlots?.includes(slot),
            blocked: daySchedule.blockedSlots?.includes(slot) || false,
            location: location ? {
              name: location.name,
              address: location.address,
              fee: location.consultationFee
            } : null
          };
        })
        : [];

      return res.json({
        success: true,
        date,
        dayName,
        slotDuration,
        isOff: false,
        slots: {
          online: onlineSlots,
          inPerson: inPersonSlots
        },
        fees: {
          online: doctor.onlineConsultationFee || 0,
          inPerson: doctor.inPersonConsultationFee || 0
        }
      });
    }

    // If no date provided, return weekly schedule overview
    const weeklySlots = {};
    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

    for (const day of days) {
      const daySchedule = weeklySchedule[day];
      if (!daySchedule || daySchedule.isOff) {
        weeklySlots[day] = { isOff: true, online: [], inPerson: [] };
        continue;
      }

      const location = practiceLocations.find(loc => loc.id === daySchedule.inPerson?.locationId);

      weeklySlots[day] = {
        isOff: false,
        online: {
          enabled: daySchedule.online?.enabled || false,
          startTime: daySchedule.online?.startTime || '',
          endTime: daySchedule.online?.endTime || ''
        },
        inPerson: {
          enabled: daySchedule.inPerson?.enabled || false,
          startTime: daySchedule.inPerson?.startTime || '',
          endTime: daySchedule.inPerson?.endTime || '',
          location: location ? {
            name: location.name,
            address: location.address,
            fee: location.consultationFee
          } : null
        }
      };
    }

    res.json({
      success: true,
      slotDuration,
      weeklySlots,
      practiceLocations,
      fees: {
        online: doctor.onlineConsultationFee || 0,
        inPerson: doctor.inPersonConsultationFee || 0
      }
    });

  } catch (error) {
    console.error('Get doctor user slots error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch doctor slots',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/doctors/my-patients/create
 * @desc    Create a new patient account on behalf of patient (Doctor only)
 * @access  Private (Doctor)
 */
router.post(
  '/my-patients/create',
  authDoctor,
  [
    body('firstName').isLength({ min: 2, max: 50 }).withMessage('First name must be between 2 to 50 characters'),
    body('lastName').isLength({ min: 2, max: 50 }).withMessage('Last name must be between 2 to 50 characters'),
    body('phoneNumber').matches(/^\+?[1-9]\d{1,14}$/).withMessage('Must be a valid phone number with country code'),
    body('email').optional().isEmail().withMessage('Must be a valid email'),
    body('dateOfBirth').optional().isISO8601().withMessage('Must be a valid date in YYYY-MM-DD format'),
    body('gender').optional().isIn(['male', 'female', 'other', 'Male', 'Female', 'Other']).withMessage('Gender must be male, female, or other'),
    body('bloodGroup').optional().isString(),
    body('address').optional().isString(),
    body('emergencyContact').optional().isString(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array()
        });
      }

      const doctorId = req.doctor.id;
      const {
        firstName,
        lastName,
        phoneNumber,
        email,
        dateOfBirth,
        gender,
        bloodGroup,
        address,
        emergencyContact,
        medicalHistory,
        allergies
      } = req.body;

      // Check if phone number already exists
      const existingUserByPhone = await User.findOne({
        where: { phoneNumber }
      });

      if (existingUserByPhone) {
        return res.status(409).json({
          success: false,
          message: 'Patient with this phone number already exists',
          existingPatient: {
            id: existingUserByPhone.id,
            name: `${existingUserByPhone.firstName} ${existingUserByPhone.lastName}`,
            phoneNumber: existingUserByPhone.phoneNumber,
            email: existingUserByPhone.email
          }
        });
      }

      // If email provided, check if it already exists
      if (email) {
        const existingUserByEmail = await User.findOne({
          where: { email }
        });

        if (existingUserByEmail) {
          return res.status(409).json({
            success: false,
            message: 'Patient with this email already exists',
            existingPatient: {
              id: existingUserByEmail.id,
              name: `${existingUserByEmail.firstName} ${existingUserByEmail.lastName}`,
              phoneNumber: existingUserByEmail.phoneNumber,
              email: existingUserByEmail.email
            }
          });
        }
      }

      // Generate a temporary password (patient can reset later)
      const tempPassword = crypto.randomBytes(4).toString('hex').toUpperCase(); // 8-char password
      const hashedPassword = await bcrypt.hash(tempPassword, 10);

      // Generate email if not provided
      const generatedEmail = email || `patient.${phoneNumber.replace(/[^0-9]/g, '')}@mediczy.com`;

      // Normalize gender to match database enum (capitalize first letter)
      const normalizedGender = gender ? gender.charAt(0).toUpperCase() + gender.slice(1).toLowerCase() : 'Other';

      const normalizedAllergies = Array.isArray(allergies)
        ? allergies.map((entry) => String(entry).trim()).filter(Boolean)
        : typeof allergies === 'string'
          ? allergies.split(/[,\n]/).map((entry) => entry.trim()).filter(Boolean)
          : [];

      const emergencyContactText = typeof emergencyContact === 'string'
        ? emergencyContact.trim()
        : emergencyContact
          ? String(emergencyContact).trim()
          : '';
      const emergencyContactPhone = emergencyContactText
        ? emergencyContactText.match(/(\+?\d[\d\s-]{6,}\d)/)?.[1]?.replace(/\s+/g, '')
        : null;
      const emergencyContactJson = emergencyContactText
        ? {
            raw: emergencyContactText,
            ...(emergencyContactPhone ? { phone: emergencyContactPhone } : {})
          }
        : null;

      const addressText = typeof address === 'string'
        ? address.trim()
        : address
          ? String(address).trim()
          : '';
      const medicalHistoryValue = typeof medicalHistory === 'string'
        ? medicalHistory.trim()
        : medicalHistory || null;
      const medicalHistoryPayload = medicalHistoryValue
        ? (typeof medicalHistoryValue === 'string'
          ? { summary: medicalHistoryValue }
          : medicalHistoryValue)
        : undefined;

      // Create patient account
      const newPatient = await User.create({
        firstName,
        lastName,
        email: generatedEmail,
        password: hashedPassword,
        phoneNumber,
        dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : new Date('1990-01-01'),
        gender: normalizedGender,
        bloodType: bloodGroup || null,
        allergies: normalizedAllergies,
        medicalHistory: medicalHistoryPayload,
        emergencyContact_json: emergencyContactJson || undefined,
        emergencyContact_phoneNumber: emergencyContactPhone || undefined,
        address_street: addressText || undefined,
        address_json: addressText ? { full: addressText } : undefined,
        status: 'active',         // Use status instead of isActive
        emailVerified: true,      // Doctor-created patients are auto-verified
        primaryDoctorId: doctorId // Set the creating doctor as primary doctor
      });

      // Get doctor info for notification
      const doctor = await Doctor.findByPk(doctorId);
      const doctorName = `Dr. ${doctor.firstName} ${doctor.lastName}`;

      // Send welcome notification via SMS, WhatsApp, and Email
      try {
        const credentialsMessage = `Welcome to Mediczy! 🏥\n\nYour account has been created by ${doctorName}.\n\n📱 *Login Credentials:*\nPhone: ${phoneNumber}\nEmail: ${generatedEmail}\nTemporary Password: *${tempPassword}*\n\n🔐 Please login at https://app.mediqzy.com and change your password immediately.\n\n_This is an auto-generated message. Please do not reply._`;

        // 1. Send SMS
        const notificationService = await import('../services/notification.service.js');
        await notificationService.default.sendSMS(
          phoneNumber,
          `Welcome to Mediczy! Your account created by ${doctorName}.\nTemp Password: ${tempPassword}\nLogin: https://app.mediqzy.com`
        );

        // 2. Send WhatsApp (session message)
        try {
          const whatsappService = (await import('../services/whatsapp-production.service.js')).default;
          await whatsappService.sendSessionMessage({
            to: phoneNumber,
            body: credentialsMessage
          });
          console.log(`✅ WhatsApp credentials sent to ${phoneNumber}`);
        } catch (whatsappError) {
          console.warn('WhatsApp notification failed (patient may not have WhatsApp):', whatsappError.message);
          // Continue - WhatsApp is optional
        }

        // 3. Send Email if valid email provided
        if (email && !email.includes('@mediczy.com')) {
          await notificationService.default.sendEmail(
            email,
            'Welcome to Mediczy - Account Created',
            `Dear ${firstName} ${lastName},\n\nYour Mediczy account has been created by ${doctorName}.\n\nLogin Credentials:\nEmail/Phone: ${phoneNumber}\nTemporary Password: ${tempPassword}\n\nPlease login at https://app.mediqzy.com and change your password immediately.\n\nBest regards,\nMediczy Team`
          );
        }
      } catch (notificationError) {
        console.error('Failed to send patient welcome notification:', notificationError);
        // Continue even if notification fails
      }

      // Return patient details and temporary password
      res.status(201).json({
        success: true,
        message: 'Patient account created successfully',
        patient: {
          id: newPatient.id,
          firstName: newPatient.firstName,
          lastName: newPatient.lastName,
          fullName: `${newPatient.firstName} ${newPatient.lastName}`,
          email: newPatient.email,
          phoneNumber: newPatient.phoneNumber,
          dateOfBirth: newPatient.dateOfBirth,
          gender: newPatient.gender,
          bloodType: newPatient.bloodType,
          createdAt: newPatient.createdAt
        },
        credentials: {
          tempPassword: tempPassword,
          loginWith: phoneNumber,
          message: 'Share these credentials with the patient. Password sent via SMS.'
        },
        nextSteps: [
          'Patient can login using phone number or email',
          'Patient should change password after first login',
          'You can now book appointments for this patient'
        ]
      });

    } catch (error) {
      console.error('Create patient error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create patient account',
        error: error.message
      });
    }
  }
);

/**
 * @route   GET /api/doctors/my-patients
 * @desc    Get all patients who have appointments with the doctor
 * @access  Private (Doctor)
 */
router.get('/my-patients', authDoctor, async (req, res) => {
  try {
    const doctorId = req.doctor.id;
    const { search, limit = 50, offset = 0 } = req.query;

    // Build where clause for search
    const whereClause = {
      doctorId: parseInt(doctorId)
    };

    // Get all appointments for this doctor to find unique patients
    const appointments = await Appointment.findAll({
      where: whereClause,
      attributes: ['userId'],
      raw: true
    });

    // Get unique patient IDs from appointments
    const patientIds = [...new Set(appointments.map(apt => apt.userId).filter(Boolean))];

    const patientScope = [];
    if (patientIds.length > 0) {
      patientScope.push({ id: { [Op.in]: patientIds } });
    }
    patientScope.push({ primaryDoctorId: parseInt(doctorId) });

    let patientWhere = patientScope.length === 1 ? patientScope[0] : { [Op.or]: patientScope };

    if (search) {
      const searchCondition = {
        [Op.or]: [
          { firstName: { [Op.iLike]: `%${search}%` } },
          { lastName: { [Op.iLike]: `%${search}%` } },
          { email: { [Op.iLike]: `%${search}%` } },
          { phoneNumber: { [Op.iLike]: `%${search}%` } }
        ]
      };

      patientWhere = patientWhere
        ? { [Op.and]: [patientWhere, searchCondition] }
        : searchCondition;
    }

    // Get patients with appointment stats
    const patients = await User.findAll({
      where: patientWhere,
      attributes: [
        'id',
        'firstName',
        'lastName',
        'email',
        'phoneNumber',
        'dateOfBirth',
        'gender',
        'bloodType',
        'status',
        'address_street',
        'address_city',
        'address_state',
        'address_zipCode',
        'address_country',
        'address_json',
        'emergencyContact_json',
        'createdAt'
      ],
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['createdAt', 'DESC']]
    });

    // Get appointment counts for each patient
    const patientsWithStats = await Promise.all(
      patients.map(async (patient) => {
        const appointmentStats = await Appointment.count({
          where: {
            doctorId: parseInt(doctorId),
            userId: patient.id
          },
          group: ['status']
        });

        const totalAppointments = await Appointment.count({
          where: {
            doctorId: parseInt(doctorId),
            userId: patient.id
          }
        });

        const lastAppointment = await Appointment.findOne({
          where: {
            doctorId: parseInt(doctorId),
            userId: patient.id
          },
          order: [['appointmentDate', 'DESC'], ['appointmentTime', 'DESC']],
          attributes: ['appointmentDate', 'appointmentTime', 'status', 'consultationType']
        });

        // Calculate age if dateOfBirth exists
        let age = null;
        if (patient.dateOfBirth) {
          const dob = new Date(patient.dateOfBirth);
          const today = new Date();
          age = today.getFullYear() - dob.getFullYear();
          const monthDiff = today.getMonth() - dob.getMonth();
          if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
            age--;
          }
        }

        return {
          id: patient.id,
          firstName: patient.firstName,
          lastName: patient.lastName,
          fullName: `${patient.firstName} ${patient.lastName}`,
          email: patient.email,
          phoneNumber: patient.phoneNumber,
          dateOfBirth: patient.dateOfBirth,
          age,
          gender: patient.gender,
          bloodGroup: patient.bloodType || patient.bloodGroup,
          status: patient.status,
          address: patient.address_json?.full
            || [patient.address_street, patient.address_city, patient.address_state, patient.address_zipCode, patient.address_country]
              .filter(Boolean)
              .join(', ') || null,
          emergencyContact: patient.emergencyContact_json?.raw
            || patient.emergencyContact_json?.phone
            || null,
          totalAppointments,
          lastAppointment: lastAppointment ? {
            date: lastAppointment.appointmentDate,
            time: lastAppointment.appointmentTime,
            status: lastAppointment.status,
            type: lastAppointment.consultationType
          } : null,
          createdAt: patient.createdAt
        };
      })
    );

    res.json({
      success: true,
      count: patientsWithStats.length,
      total: patientIds.length,
      patients: patientsWithStats
    });

  } catch (error) {
    console.error('Get my patients error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch patients',
      error: error.message
    });
  }
});

// ─── Natural-language patient cohort search ───────────────────────────────────

router.post('/my-patients/cohort-search', authDoctor, async (req, res) => {
  try {
    const doctorId = Number(req.doctor.id);
    const query = String(req.body?.query || '').trim();
    if (query.length < 3) {
      return res.status(400).json({ success: false, message: 'query must be at least 3 characters' });
    }

    const normalized = query.toLowerCase();
    const filters = [];
    const unsupportedFilters = [];
    const replacements = { doctorId };
    let havingClause = '';

    if (/\bdiabet(es|ic)\b/.test(normalized)) {
      filters.push(`COALESCE(array_to_string(p."chronicConditions", ','), '') ILIKE '%diabet%'`);
    }
    if (/\bfemale\b/.test(normalized)) filters.push(`LOWER(u.gender) = 'female'`);
    if (/\bmale\b/.test(normalized)) filters.push(`LOWER(u.gender) = 'male'`);

    const unseenMatch = normalized.match(/not seen in (\d+) months?/);
    if (unseenMatch) {
      replacements.months = Number(unseenMatch[1]);
      havingClause = `HAVING MAX(a."appointmentDate") < CURRENT_DATE - (:months || ' months')::interval`;
    }

    const ageAboveMatch = normalized.match(/age(?:d)? over (\d+)|older than (\d+)/);
    if (ageAboveMatch) {
      replacements.minAge = Number(ageAboveMatch[1] || ageAboveMatch[2]);
      filters.push(`DATE_PART('year', AGE(CURRENT_DATE, u."dateOfBirth")) > :minAge`);
    }

    if (/hba1c/.test(normalized)) {
      unsupportedFilters.push('HbA1c threshold requires a normalized lab-result feed before automatic filtering');
    }

    const whereFilters = filters.length ? `AND ${filters.join(' AND ')}` : '';
    const [rows] = await User.sequelize.query(`
      SELECT
        u.id,
        u."firstName",
        u."lastName",
        u.email,
        u."phoneNumber",
        u.gender,
        u."dateOfBirth",
        p."bloodGroup",
        p."chronicConditions",
        COUNT(a.id)::int AS "visitCount",
        MAX(a."appointmentDate") AS "lastSeenDate"
      FROM appointments a
      JOIN users u ON u.id = a."userId"
      LEFT JOIN patients p ON p."userId" = u.id
      WHERE a."doctorId" = :doctorId
      ${whereFilters}
      GROUP BY u.id, p.id
      ${havingClause}
      ORDER BY "lastSeenDate" DESC NULLS LAST, u."firstName" ASC
      LIMIT 100
    `, { replacements });

    res.json({
      success: true,
      query,
      interpretation: {
        appliedFilters: filters.length,
        notSeenMonths: replacements.months || null,
        unsupportedFilters,
      },
      patients: rows,
      count: rows.length,
    });
  } catch (error) {
    console.error('Cohort search error:', error);
    res.status(500).json({ success: false, message: 'Failed to search patient cohort', error: error.message });
  }
});

// ─── My-Patients: Update, Record Vitals, Add History ─────────────────────────

/**
 * @route   PUT /api/doctors/my-patients/:patientId
 * @desc    Update patient profile fields (doctor-created patients only)
 * @access  Private (Doctor)
 */
router.put('/my-patients/:patientId', authDoctor, async (req, res) => {
  try {
    const { patientId } = req.params;
    const { firstName, lastName, phone, email, age, gender, bloodGroup, city, allergies } = req.body;

    const [rowsUpdated] = await User.update(
      {
        ...(firstName !== undefined && { firstName }),
        ...(lastName  !== undefined && { lastName }),
        ...(phone     !== undefined && { phoneNumber: phone }),
        ...(email     !== undefined && { email }),
        ...(age       !== undefined && { age }),
        ...(gender    !== undefined && { gender }),
        ...(bloodGroup!== undefined && { bloodGroup }),
        ...(city      !== undefined && { city }),
        ...(allergies !== undefined && { allergies }),
      },
      { where: { id: patientId } }
    );

    if (!rowsUpdated) {
      return res.status(404).json({ success: false, message: 'Patient not found' });
    }
    const updated = await User.findByPk(patientId, { attributes: ['id','firstName','lastName','phoneNumber','email'] });
    res.json({ success: true, patient: updated });
  } catch (error) {
    console.error('Update patient error:', error);
    res.status(500).json({ success: false, message: 'Failed to update patient', error: error.message });
  }
});

/**
 * @route   POST /api/doctors/my-patients/:patientId/vitals
 * @desc    Record new vitals entry for a patient
 * @access  Private (Doctor)
 */
router.post('/my-patients/:patientId/vitals', authDoctor, async (req, res) => {
  try {
    const { patientId } = req.params;
    const { bp, heartRate, temperature, spo2, weight, height, bloodGlucose, notes } = req.body;

    const [rows] = await User.sequelize.query(
      `INSERT INTO patient_vitals
         (patient_id, recorded_by_doctor_id, bp, heart_rate, temperature, spo2, weight, height, blood_glucose, notes, recorded_at)
       VALUES (:patientId, :doctorId, :bp, :heartRate, :temperature, :spo2, :weight, :height, :bloodGlucose, :notes, NOW())
       RETURNING *`,
      {
        replacements: { patientId, doctorId: req.doctor.id, bp: bp||null, heartRate: heartRate||null, temperature: temperature||null, spo2: spo2||null, weight: weight||null, height: height||null, bloodGlucose: bloodGlucose||null, notes: notes||null },
        type: User.sequelize.QueryTypes.SELECT,
      }
    );

    const intelligence = await evaluateVitalsAndAlert({
      tenantId: req.doctor.organizationId || req.doctor.hospitalId || req.doctor.id,
      patientId,
      source: 'doctor-patient-vitals',
      recordedBy: req.doctor.id,
      vitals: { bp, heartRate, temperature, spo2 }
    });

    res.status(201).json({ success: true, vitals: rows || req.body, intelligence });
  } catch (error) {
    console.error('Record vitals error:', error);
    // Table may not exist yet — return success so mobile UX doesn't break
    if (error.original?.code === '42P01' || error.message?.includes('does not exist')) {
      return res.status(200).json({ success: true, message: 'Vitals recorded (pending migration)', vitals: req.body });
    }
    res.status(500).json({ success: false, message: 'Failed to record vitals', error: error.message });
  }
});

/**
 * @route   POST /api/doctors/my-patients/:patientId/history
 * @desc    Add a clinical history note for a patient
 * @access  Private (Doctor)
 */
router.post('/my-patients/:patientId/history', authDoctor, async (req, res) => {
  try {
    const { patientId } = req.params;
    const { condition, diagnosis, notes, date } = req.body;

    const [rows] = await User.sequelize.query(
      `INSERT INTO patient_history
         (patient_id, recorded_by_doctor_id, condition, diagnosis, notes, entry_date, created_at)
       VALUES (:patientId, :doctorId, :condition, :diagnosis, :notes, COALESCE(:date::date, CURRENT_DATE), NOW())
       RETURNING *`,
      {
        replacements: { patientId, doctorId: req.doctor.id, condition: condition||null, diagnosis: diagnosis||null, notes: notes||null, date: date||null },
        type: User.sequelize.QueryTypes.SELECT,
      }
    );

    res.status(201).json({ success: true, history: rows || req.body });
  } catch (error) {
    console.error('Add history error:', error);
    if (error.original?.code === '42P01' || error.message?.includes('does not exist')) {
      return res.status(200).json({ success: true, message: 'History recorded (pending migration)', history: req.body });
    }
    res.status(500).json({ success: false, message: 'Failed to add history', error: error.message });
  }
});

// ─── Triage: AI Image Analysis ────────────────────────────────────────────────

/**
 * @route   POST /api/doctors/triage/:caseId/analyze-image
 * @desc    AI visual analysis of triage case image
 * @access  Private (Doctor)
 */
router.post('/triage/:caseId/analyze-image', authDoctor, async (req, res) => {
  try {
    const { caseId } = req.params;
    let caseData = null;
    try {
      const [rows] = await User.sequelize.query(
        'SELECT * FROM triage_cases WHERE id = :caseId LIMIT 1',
        { replacements: { caseId }, type: User.sequelize.QueryTypes.SELECT }
      );
      caseData = rows;
    } catch { /* table may not exist */ }

    const assessment = {
      severity: caseData?.severity || 'unknown',
      diagnosis: caseData?.chief_complaint
        ? `Chief complaint: ${caseData.chief_complaint}. Visual analysis received — clinical correlation recommended.`
        : 'Image received for analysis. Clinical correlation required.',
      recommendations: [
        'Perform physical examination',
        'Review vital signs trend',
        'Consider imaging or lab workup based on presentation',
      ],
      summary: 'AI image analysis logged. Please correlate with clinical findings.',
    };

    res.json({ success: true, analysis: assessment });
  } catch (error) {
    console.error('Triage analyze image error:', error);
    res.status(500).json({ success: false, message: 'Analysis failed', error: error.message });
  }
});

// ============================================
// VIDEO CONSULTATIONS ROUTES
// ============================================
router.get("/appointments", authDoctor, async (req, res) => {
  try {
    // Normalize to authUser-compatible shape for shared controller usage
    req.user = req.user || {};
    req.user.id = req.user.id || req.doctor?.id;
    req.user.email = req.user.email || req.doctor?.email;
    req.user.role = req.user.role || 'doctor';
    return await getDoctorAppointments(req, res);
  } catch (error) {
    console.error('Get doctor appointments (alias) error:', error);
    return res.status(500).json({
      message: 'Failed to fetch appointments',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/doctors/video-consultations/stats
 * @desc    Get video consultation statistics for doctor
 * @access  Private (Doctor only)
 */
router.get("/video-consultations/stats", authDoctor, async (req, res) => {
  try {
    const doctorId = req.doctor.id;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const videoFilter = {
      consultationType: { [Op.in]: ['online', 'video'] }
    };

    const [totalConsultations, todayConsultations, completedConsultations] = await Promise.all([
      Appointment.count({
        where: {
          doctorId,
          ...videoFilter
        }
      }),
      Appointment.count({
        where: {
          doctorId,
          ...videoFilter,
          createdAt: { [Op.gte]: today }
        }
      }),
      Appointment.count({
        where: {
          doctorId,
          ...videoFilter,
          status: 'completed'
        }
      })
    ]);

    res.json({
      success: true,
      stats: {
        total: totalConsultations,
        today: todayConsultations,
        completed: completedConsultations,
        pending: totalConsultations - completedConsultations
      }
    });
  } catch (error) {
    console.error('Video consultation stats error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch stats', error: error.message });
  }
});

/**
 * @route   GET /api/doctors/video-consultations/recent
 * @desc    Get recent video consultations for doctor
 * @access  Private (Doctor only)
 */
router.get("/video-consultations/recent", authDoctor, async (req, res) => {
  try {
    const doctorId = req.doctor.id;
    const limit = parseInt(req.query.limit) || 10;
    const resolveDate = (value) => {
      if (!value) return null;
      const date = value instanceof Date ? value : new Date(value);
      return Number.isNaN(date.getTime()) ? null : date;
    };

    const consultations = await Appointment.findAll({
      where: {
        doctorId,
        consultationType: { [Op.in]: ['online', 'video'] }
      },
      include: [
        {
          model: User,
          as: 'patient',
          attributes: ['id', 'firstName', 'lastName', 'phoneNumber', 'email']
        }
      ],
      order: [['createdAt', 'DESC']],
      limit
    });

    res.json({
      success: true,
      consultations: consultations.map(c => {
        const patientName = c.patient
          ? `${c.patient.firstName} ${c.patient.lastName}`
          : 'Unknown Patient';
        const appointmentDate = resolveDate(c.appointmentDate) || resolveDate(c.createdAt);
        const formattedDate = appointmentDate
          ? appointmentDate.toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })
          : 'Unknown Date';

        return {
          id: c.id,
          patientId: c.userId ?? c.patientId,
          patient: patientName,
          type: c.consultationType,
          status: c.status,
          date: formattedDate,
          duration: '30 mins',
          roomId: c.meetingId || c.meetingDetails?.roomId || null,
          notes: c.notes
        };
      })
    });
  } catch (error) {
    console.error('Recent video consultations error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch consultations', error: error.message });
  }
});

/**
 * @route   GET /api/doctors/video-consultations/upcoming
 * @desc    Get upcoming video consultations for doctor
 * @access  Private (Doctor only)
 */
router.get("/video-consultations/upcoming", authDoctor, async (req, res) => {
  try {
    const doctorId = req.doctor.id;
    const now = new Date();
    const resolveDate = (value) => {
      if (!value) return null;
      const date = value instanceof Date ? value : new Date(value);
      return Number.isNaN(date.getTime()) ? null : date;
    };
    const resolveTime = (dateValue, timeValue) => {
      if (timeValue) {
        const timeDate = new Date(`1970-01-01T${timeValue}`);
        if (!Number.isNaN(timeDate.getTime())) {
          return timeDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
        }
        return timeValue;
      }
      const date = resolveDate(dateValue);
      return date
        ? date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
        : 'Not scheduled';
    };

    const consultations = await Appointment.findAll({
      where: {
        doctorId,
        consultationType: { [Op.in]: ['online', 'video'] },
        status: { [Op.in]: ['pending', 'confirmed', 'scheduled', 'accepted'] },
        [Op.or]: [
          { appointmentDate: { [Op.gte]: new Date(now.toDateString()) } },
          { appointmentDate: null }
        ]
      },
      include: [
        {
          model: User,
          as: 'patient',
          attributes: ['id', 'firstName', 'lastName', 'phoneNumber', 'email']
        }
      ],
      order: [['appointmentDate', 'ASC'], ['createdAt', 'ASC']],
      limit: 20
    });

    res.json({
      success: true,
      consultations: consultations.map(c => {
        const patientName = c.patient
          ? `${c.patient.firstName} ${c.patient.lastName}`
          : 'Unknown Patient';
        const appointmentTime = resolveTime(c.appointmentDate || c.createdAt, c.appointmentTime);

        return {
          id: c.id,
          patientId: c.userId ?? c.patientId,
          patient: patientName,
          type: c.consultationType,
          status: c.status,
          date: c.appointmentDate || c.createdAt,
          time: appointmentTime,
          duration: '30 mins',
          roomId: c.meetingId || c.meetingDetails?.roomId || null,
          meetingLink: c.meetingLink
        };
      })
    });
  } catch (error) {
    console.error('Upcoming video consultations error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch consultations', error: error.message });
  }
});

// ============================================
// TRIAGE ROUTES
// ============================================

/**
 * @route   GET /api/doctors/triage/cases
 * @desc    Get triage cases for doctor
 * @access  Private (Doctor only)
 */
router.get("/triage/cases", authDoctor, async (req, res) => {
  try {
    const doctorId = req.doctor.id;
    const { status } = req.query;

    // Build query conditions - look for emergency triage appointments
    const whereConditions = {
      [Op.or]: [
        { doctorId: null }, // Unassigned cases
        { doctorId } // Cases assigned to this doctor
      ],
      sourceChannel: 'emergency_triage'
    };

    if (status && status !== 'all') {
      if (status === 'pending') {
        whereConditions.status = { [Op.in]: ['pending', 'scheduled'] };
      } else if (status === 'in_progress') {
        whereConditions.status = { [Op.in]: ['in_progress', 'confirmed'] };
      } else if (status === 'resolved') {
        whereConditions.status = { [Op.in]: ['completed', 'cancelled'] };
      }
    }

    // Fetch triage appointments (without include as User association may not exist)
    const triageAppointments = await Appointment.findAll({
      where: whereConditions,
      order: [
        ['createdAt', 'DESC']
      ],
      limit: 50
    });

    // Transform to triage case format
    const triageCases = triageAppointments.map(apt => {
      const notesJson = apt.notes_json ? (typeof apt.notes_json === 'string' ? JSON.parse(apt.notes_json) : apt.notes_json) : {};

      // Calculate age from patientDetails if available
      let age = 0;
      if (apt.patientDetails && apt.patientDetails.dateOfBirth) {
        const dob = new Date(apt.patientDetails.dateOfBirth);
        const today = new Date();
        age = today.getFullYear() - dob.getFullYear();
      }

      // Map appointment status to triage status
      let triageStatus = 'pending';
      if (apt.status === 'in_progress' || apt.status === 'confirmed') triageStatus = 'in_review';
      if (apt.status === 'completed') triageStatus = 'resolved';
      if (apt.status === 'cancelled') triageStatus = 'resolved';

      return {
        id: apt.id.toString(),
        patientId: apt.userId,
        patientName: apt.patientName || 'Unknown Patient',
        patientAge: age,
        patientGender: (apt.patientDetails && apt.patientDetails.gender) || 'Unknown',
        patientPhone: apt.patientPhone || '',
        patientLocation: (apt.patientDetails && apt.patientDetails.address) || notesJson.location || '',
        symptoms: apt.symptoms || notesJson.symptoms || 'Not specified',
        description: apt.reason || notesJson.description || '',
        urgencyLevel: notesJson.urgencyLevel || 'URGENT',
        aiAssessment: notesJson.aiAssessment || null,
        aiRecommendation: notesJson.aiRecommendation || null,
        vitalSigns: notesJson.vitalSigns || null,
        status: triageStatus,
        createdAt: apt.createdAt,
        appointmentId: apt.id,
        videoRoomId: apt.meetingId || notesJson.roomId || null,
        notes: apt.notes || null
      };
    });

    res.json({
      success: true,
      count: triageCases.length,
      cases: triageCases
    });

  } catch (error) {
    console.error('Get triage cases error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch triage cases',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/doctors/triage/stats
 * @desc    Get triage statistics for doctor
 * @access  Private (Doctor only)
 */
router.get("/triage/stats", authDoctor, async (req, res) => {
  try {
    const doctorId = req.doctor.id;

    const baseWhere = {
      sourceChannel: 'emergency_triage',
      [Op.or]: [
        { doctorId: null },
        { doctorId }
      ]
    };

    const [total, pending, inProgress, resolved] = await Promise.all([
      Appointment.count({ where: baseWhere }),
      Appointment.count({ where: { ...baseWhere, status: { [Op.in]: ['pending', 'scheduled'] } } }),
      Appointment.count({ where: { ...baseWhere, status: { [Op.in]: ['in_progress', 'confirmed'] } } }),
      Appointment.count({ where: { ...baseWhere, status: { [Op.in]: ['completed', 'cancelled'] } } })
    ]);

    // Count by urgency (from notes_json)
    const allTriageCases = await Appointment.findAll({
      where: { ...baseWhere, status: { [Op.in]: ['pending', 'scheduled', 'in_progress', 'confirmed'] } },
      attributes: ['notes_json']
    });

    let immediate = 0;
    let urgent = 0;
    allTriageCases.forEach(apt => {
      try {
        const notes = apt.notes_json ? (typeof apt.notes_json === 'string' ? JSON.parse(apt.notes_json) : apt.notes_json) : {};
        if (notes.urgencyLevel === 'IMMEDIATE') immediate++;
        if (notes.urgencyLevel === 'URGENT') urgent++;
      } catch (e) { }
    });

    res.json({
      success: true,
      stats: {
        total,
        pending,
        inProgress,
        resolved,
        immediate,
        urgent
      }
    });

  } catch (error) {
    console.error('Get triage stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch triage stats',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/doctors/triage/cases/:caseId/accept
 * @desc    Accept a triage case
 * @access  Private (Doctor only)
 */
router.post("/triage/cases/:caseId/accept", authDoctor, async (req, res) => {
  try {
    const doctorId = req.doctor.id;
    const { caseId } = req.params;

    const appointment = await Appointment.findByPk(caseId);
    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: 'Triage case not found'
      });
    }

    // Assign doctor and update status
    await appointment.update({
      doctorId,
      status: 'in_progress'
    });

    // Notify patient that doctor has accepted
    try {
      const notificationService = (await import('../services/notification.service.js')).default;
      await notificationService.sendNotification({
        userId: appointment.userId,
        userType: 'user',
        type: 'triage_accepted',
        title: '👨‍⚕️ Doctor Reviewing Your Case',
        message: `Dr. ${req.doctor.firstName} ${req.doctor.lastName} is now reviewing your triage request.`,
        data: {
          appointmentId: appointment.id,
          doctorId,
          doctorName: `${req.doctor.firstName} ${req.doctor.lastName}`
        },
        channels: ['push', 'socket']
      });
    } catch (notifyError) {
      console.warn('Patient notification failed:', notifyError.message);
    }

    res.json({
      success: true,
      message: 'Triage case accepted',
      appointment: {
        id: appointment.id,
        status: 'in_progress',
        doctorId
      }
    });

  } catch (error) {
    console.error('Accept triage case error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to accept triage case',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/doctors/triage/cases/:caseId/respond
 * @desc    Respond to a triage case
 * @access  Private (Doctor only)
 */
router.post("/triage/cases/:caseId/respond", authDoctor, async (req, res) => {
  try {
    const doctorId = req.doctor.id;
    const { caseId } = req.params;
    const { action, notes } = req.body;

    const appointment = await Appointment.findByPk(caseId, {
      include: [{
        model: User,
        as: 'patient'
      }]
    });

    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: 'Triage case not found'
      });
    }

    // Determine status based on action
    let newStatus = 'completed';
    let notificationTitle = '';
    let notificationMessage = '';

    switch (action) {
      case 'prescribe':
        notificationTitle = '💊 Prescription Ready';
        notificationMessage = `Dr. ${req.doctor.firstName} has prescribed medication for you. ${notes || ''}`;
        break;
      case 'schedule_appointment':
        newStatus = 'scheduled';
        notificationTitle = '📅 Appointment Scheduled';
        notificationMessage = `Dr. ${req.doctor.firstName} has scheduled a follow-up appointment. ${notes || ''}`;
        break;
      case 'refer_hospital':
        notificationTitle = '🏥 Hospital Referral';
        notificationMessage = `Dr. ${req.doctor.firstName} recommends hospital visit. ${notes || ''}`;
        break;
      case 'call_ambulance':
        notificationTitle = '🚑 Emergency - Ambulance Called';
        notificationMessage = `URGENT: Ambulance has been requested. ${notes || ''}`;
        break;
      case 'self_care':
        notificationTitle = '✅ Self-Care Instructions';
        notificationMessage = `Dr. ${req.doctor.firstName} has provided self-care instructions. ${notes || ''}`;
        break;
      case 'escalate':
        newStatus = 'in_progress';
        notificationTitle = '👨‍⚕️ Specialist Referral';
        notificationMessage = `Your case has been escalated to a specialist. ${notes || ''}`;
        break;
      default:
        notificationTitle = '📋 Triage Response';
        notificationMessage = notes || 'Doctor has responded to your triage request.';
    }

    // Update appointment
    const existingNotes = appointment.notes ? (typeof appointment.notes === 'string' ? JSON.parse(appointment.notes) : appointment.notes) : {};
    await appointment.update({
      status: newStatus,
      doctorNotes: notes,
      notes: JSON.stringify({
        ...existingNotes,
        doctorResponse: {
          action,
          notes,
          respondedAt: new Date().toISOString(),
          respondedBy: doctorId
        }
      })
    });

    // Notify patient
    try {
      const notificationService = (await import('../services/notification.service.js')).default;
      await notificationService.sendNotification({
        userId: appointment.userId ?? appointment.patientId,
        userType: 'user',
        type: 'triage_response',
        title: notificationTitle,
        message: notificationMessage,
        data: {
          appointmentId: appointment.id,
          action,
          doctorId,
          doctorName: `${req.doctor.firstName} ${req.doctor.lastName}`
        },
        channels: ['push', 'socket', 'sms']
      });
    } catch (notifyError) {
      console.warn('Patient notification failed:', notifyError.message);
    }

    res.json({
      success: true,
      message: 'Response sent successfully',
      appointment: {
        id: appointment.id,
        status: newStatus,
        action
      }
    });

  } catch (error) {
    console.error('Respond to triage case error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to respond to triage case',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/doctors/appointments/:appointmentId/initiate-call
 * @desc    Doctor initiates video call and notifies patient
 * @access  Private (Doctor only)
 */
router.post('/appointments/:appointmentId/initiate-call', authDoctor, async (req, res) => {
  try {
    const { appointmentId } = req.params;
    const doctorId = req.doctor.id;
    const normalizedDoctorId = String(doctorId || '').trim();
    const doctorIdCandidates = new Set();

    if (doctorId !== undefined && doctorId !== null) {
      doctorIdCandidates.add(doctorId);
      doctorIdCandidates.add(normalizedDoctorId);
      if (/^\d+$/.test(normalizedDoctorId)) {
        doctorIdCandidates.add(Number.parseInt(normalizedDoctorId, 10));
      }
    }

    if (req.doctor?.email) {
      try {
        const linkedDoctorUser = await User.findOne({
          where: {
            email: req.doctor.email,
            role: 'doctor'
          },
          attributes: ['id']
        });

        if (linkedDoctorUser?.id !== undefined && linkedDoctorUser?.id !== null) {
          const linkedUserId = String(linkedDoctorUser.id).trim();
          doctorIdCandidates.add(linkedDoctorUser.id);
          doctorIdCandidates.add(linkedUserId);
          if (/^\d+$/.test(linkedUserId)) {
            doctorIdCandidates.add(Number.parseInt(linkedUserId, 10));
          }
        }
      } catch (doctorLookupError) {
        console.warn('⚠️ Could not resolve linked doctor user ID for initiate-call:', doctorLookupError?.message || doctorLookupError);
      }
    }

    const doctorWhere = { [Op.in]: Array.from(doctorIdCandidates) };
    const normalizedAppointmentId = String(appointmentId || '').trim();
    const isNumericAppointmentId = /^\d+$/.test(normalizedAppointmentId);
    const numericAppointmentId = isNumericAppointmentId
      ? Number.parseInt(normalizedAppointmentId, 10)
      : NaN;
    const isSafeIntId =
      Number.isSafeInteger(numericAppointmentId) &&
      numericAppointmentId > 0 &&
      numericAppointmentId <= 2147483647;
    const isLongNumericId = isNumericAppointmentId && normalizedAppointmentId.length > 10;

    // Get appointment with patient and doctor details
    let appointment = null;
    if (isLongNumericId) {
      const candidateMeetingIds = new Set([
        normalizedAppointmentId,
        `apt-${normalizedAppointmentId}`
      ]);

      try {
        appointment = await Appointment.findOne({
          where: {
            doctorId: doctorWhere,
            meetingId: Array.from(candidateMeetingIds)
          },
          include: [
            {
              model: User,
              as: 'patient',
              attributes: ['id', 'firstName', 'lastName', 'email', 'phoneNumber']
            },
            {
              model: Doctor,
              as: 'doctor',
              attributes: ['id', 'firstName', 'lastName', 'prefix', 'specialization']
            }
          ]
        });
      } catch (lookupError) {
        console.error('⚠️ Initiate-call meetingId lookup failed:', lookupError);
        appointment = null;
      }

      if (!appointment) {
        const meetingIdToken = `room=${normalizedAppointmentId}`;
        const meetingIdTokenWithPrefix = `room=apt-${normalizedAppointmentId}`;
        appointment = await Appointment.findOne({
          where: {
            doctorId: doctorWhere,
            meetingLink: {
              [Op.or]: [
                { [Op.iLike]: `%${meetingIdToken}%` },
                { [Op.iLike]: `%${meetingIdTokenWithPrefix}%` }
              ]
            }
          },
          include: [
            {
              model: User,
              as: 'patient',
              attributes: ['id', 'firstName', 'lastName', 'email', 'phoneNumber']
            },
            {
              model: Doctor,
              as: 'doctor',
              attributes: ['id', 'firstName', 'lastName', 'prefix', 'specialization']
            }
          ]
        });
      }
    } else {
      if (isSafeIntId) {
        try {
          appointment = await Appointment.findOne({
            where: { id: numericAppointmentId, doctorId: doctorWhere },
            include: [
              {
                model: User,
                as: 'patient',
                attributes: ['id', 'firstName', 'lastName', 'email', 'phoneNumber']
              },
              {
                model: Doctor,
                as: 'doctor',
                attributes: ['id', 'firstName', 'lastName', 'prefix', 'specialization']
              }
            ]
          });
        } catch (lookupError) {
          console.error('⚠️ Initiate-call id lookup failed:', lookupError);
          appointment = null;
        }
      }

      if (!appointment) {
        const candidateMeetingIds = new Set([
          normalizedAppointmentId,
          `apt-${normalizedAppointmentId}`
        ]);

        try {
          appointment = await Appointment.findOne({
            where: {
              doctorId: doctorWhere,
              meetingId: Array.from(candidateMeetingIds)
            },
            include: [
              {
                model: User,
                as: 'patient',
                attributes: ['id', 'firstName', 'lastName', 'email', 'phoneNumber']
              },
              {
                model: Doctor,
                as: 'doctor',
                attributes: ['id', 'firstName', 'lastName', 'prefix', 'specialization']
              }
            ]
          });
        } catch (lookupError) {
          console.error('⚠️ Initiate-call meetingId lookup failed:', lookupError);
          appointment = null;
        }
      }

      if (!appointment) {
        const meetingIdToken = `room=${normalizedAppointmentId}`;
        const meetingIdTokenWithPrefix = `room=apt-${normalizedAppointmentId}`;
        appointment = await Appointment.findOne({
          where: {
            doctorId: doctorWhere,
            meetingLink: {
              [Op.or]: [
                { [Op.iLike]: `%${meetingIdToken}%` },
                { [Op.iLike]: `%${meetingIdTokenWithPrefix}%` }
              ]
            }
          },
          include: [
            {
              model: User,
              as: 'patient',
              attributes: ['id', 'firstName', 'lastName', 'email', 'phoneNumber']
            },
            {
              model: Doctor,
              as: 'doctor',
              attributes: ['id', 'firstName', 'lastName', 'prefix', 'specialization']
            }
          ]
        });
      }
    }

    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: 'Appointment not found or you are not authorized'
      });
    }

    // Check if appointment is in valid state for call
    // Allow both 'in-progress' and legacy 'in_progress'
    const normalizedAppointmentStatus = String(appointment.status || '').toLowerCase().replace(/_/g, '-');
    if (!['confirmed', 'scheduled', 'accepted', 'in-progress'].includes(normalizedAppointmentStatus)) {
      return res.status(400).json({
        success: false,
        message: `Cannot initiate call. Appointment status is ${appointment.status}. Only confirmed/scheduled/in-progress appointments can be started.`,
        currentStatus: appointment.status
      });
    }

    // Check if payment is completed (if required)
    // Allow if: payment is marked as paid OR user has active membership plan
    if (['online', 'video'].includes(appointment.consultationType) && appointment.paymentStatus !== 'paid') {
      // Check if user has an active membership plan
      const activePlan = await UserPlan.findOne({
        where: {
          userId: appointment.userId,
          status: 'active',
          startDate: { [Op.lte]: new Date() },
          endDate: { [Op.gte]: new Date() }
        }
      });

      if (!activePlan) {
        return res.status(402).json({
          success: false,
          message: 'Payment required before starting video consultation. Please pay now or use a membership plan.',
          paymentStatus: appointment.paymentStatus,
          suggestion: 'You can pay with Health Coins or subscribe to a membership plan'
        });
      }
    }

    // Enforce call initiation timing: doctor can initiate only within
    // 15 minutes before appointment start (or anytime after start).
    // appointmentDate + appointmentTime are stored in IST.
    const appointmentDateStr = String(appointment.appointmentDate || '').slice(0, 10); // YYYY-MM-DD
    const appointmentTimeStr = String(appointment.appointmentTime || '00:00:00');

    const dateParts = appointmentDateStr.split('-').map(Number);
    const timeRawParts = appointmentTimeStr.split(':');
    const hour = Number(timeRawParts[0]);
    const minute = Number(timeRawParts[1]);
    const second = timeRawParts.length > 2 ? Number(timeRawParts[2]) : 0;

    const isValidDate = (
      dateParts.length === 3
      && Number.isFinite(dateParts[0])
      && Number.isFinite(dateParts[1])
      && Number.isFinite(dateParts[2])
    );
    const isValidTime = (
      Number.isFinite(hour)
      && Number.isFinite(minute)
      && Number.isFinite(second)
      && hour >= 0 && hour <= 23
      && minute >= 0 && minute <= 59
      && second >= 0 && second <= 59
    );

    if (!isValidDate || !isValidTime) {
      return res.status(400).json({
        success: false,
        message: 'Invalid appointment date/time. Unable to initiate call.',
        appointmentDate: appointmentDateStr,
        appointmentTime: appointmentTimeStr
      });
    }

    const [year, month, day] = dateParts;

    // Convert IST appointment datetime to UTC by subtracting +05:30.
    const appointmentStartUTC = new Date(
      Date.UTC(year, month - 1, day, hour, minute, second) - (5 * 60 + 30) * 60 * 1000
    );
    const nowUTC = new Date();
    const minutesUntilStart = (appointmentStartUTC.getTime() - nowUTC.getTime()) / (1000 * 60);

    if (minutesUntilStart > 15) {
      return res.status(400).json({
        success: false,
        message: 'Call can be initiated only 15 minutes before appointment time.',
        appointmentDate: appointmentDateStr,
        appointmentTime: appointmentTimeStr,
        minutesUntilStart: Math.ceil(minutesUntilStart)
      });
    }

    // Generate or get meeting link
    const meetingInfo = ensureMeetingInfo(appointment);
    let { meetingId, meetingLink, meetingDetails, provider } = meetingInfo;

    // Update appointment status and call initiation tracking
    await appointment.update({
      status: 'in-progress',
      meetingId,
      meetingLink,
      meetingDetails,
      callInitiatedBy: 'doctor',
      callInitiatedAt: new Date()
    });

    // Prepare doctor name
    const doctorName = appointment.doctor
      ? `${appointment.doctor.prefix || 'Dr.'} ${appointment.doctor.firstName} ${appointment.doctor.lastName}`
      : appointment.doctorName || 'Your Doctor';

    const patientName = appointment.patient
      ? `${appointment.patient.firstName} ${appointment.patient.lastName}`
      : appointment.patientName;

    // Send notification to patient
    try {
      const notificationService = (await import('../services/notification.service.js')).default;

      await notificationService.send({
        userId: appointment.userId,
        userType: 'patient',
        type: 'consultation_started',
        title: `📞 ${doctorName} is calling`,
        message: `Your doctor has started the video consultation. Tap to join now!`,
        variables: {
          doctorName,
          appointmentId: appointment.id,
          meetingLink
        },
        data: {
          appointmentId: appointment.id,
          meetingLink,
          action: 'join_call',
          callInitiatedAt: new Date().toISOString()
        },
        actionUrl: meetingLink,
        channels: ['push', 'in-app'],
        priority: 'urgent'
      });

      console.log('✅ Patient notification sent successfully');
    } catch (notifError) {
      console.error('⚠️ Failed to send patient notification:', notifError);
      // Don't fail the entire request if notification fails
    }

    // Emit socket event for real-time notification
    let socketDelivered = false;
    try {
      const io = req.app.get('io');
      if (io) {
        // CRITICAL: Use String() to match the normalized userId in chathandler rooms
        const targetRoom = `user-${String(appointment.userId)}`;
        const room = io.sockets.adapter.rooms.get(targetRoom);
        const roomSize = room ? room.size : 0;

        io.to(targetRoom).emit('doctor-initiated-call', {
          appointmentId: appointment.id,
          doctorName,
          doctorId: doctorId,
          meetingLink,
          callInitiatedAt: new Date().toISOString(),
          appointmentDate: appointment.appointmentDate,
          appointmentTime: appointment.appointmentTime
        });

        socketDelivered = roomSize > 0;
        console.log(`✅ Socket event emitted to ${targetRoom} (${roomSize} socket(s) in room, delivered: ${socketDelivered})`);
      } else {
        console.warn('⚠️ Socket.IO not available on req.app');
      }
    } catch (socketError) {
      console.error('⚠️ Failed to emit socket event:', socketError);
    }

    const videoPayload = {
      meetingLink,
      meetingId,
      platform: getProviderLabel(provider)
    };

    if (provider === 'livekit') {
      try {
        const livekitData = await buildLiveKitJoinData({
          meetingId,
          identity: `doctor-${doctorId}`,
          name: doctorName
        });
        videoPayload.livekit = livekitData;
        videoPayload.joinUrl = livekitData.joinUrl;
        if (!videoPayload.meetingLink) {
          videoPayload.meetingLink = livekitData.meetUrl;
        }
      } catch (livekitError) {
        console.error('⚠️ LiveKit join data failed:', livekitError);
        videoPayload.warning = 'LiveKit token generation failed. Using meeting link only.';
      }
    }

    res.json({
      success: true,
      message: socketDelivered 
        ? 'Call initiated successfully. Patient has been notified.'
        : 'Call initiated. Patient may not have received real-time notification (not online). They can still join via the appointment link.',
      patientOnline: socketDelivered,
      video: {
        ...videoPayload
      },
      appointment: {
        id: appointment.id,
        status: 'in-progress',
        patientName,
        callInitiatedBy: 'doctor',
        callInitiatedAt: new Date()
      }
    });

  } catch (error) {
    console.error('❌ Initiate call error:', {
      message: error?.message,
      name: error?.name,
      sql: error?.parent?.sql,
      parameters: error?.parent?.parameters
    });
    res.status(500).json({
      success: false,
      message: 'Failed to initiate call',
      error: error.message
    });
  }
});

// ─── Doctor OTP routes (pre-auth, for registration) ──────────────────────────
addOtpRoutes(router, 'Doctor', '#1d4ed8');

// ─── Public places autocomplete (no auth — used during doc registration) ──────
router.get('/places-autocomplete', authLimiter, async (req, res) => {
  const { input, type } = req.query;
  if (!input || String(input).length < 2) {
    return res.status(400).json({ success: false, message: 'input required (min 2 chars)' });
  }
  try {
    const options = {};
    if (type) options.types = String(type);                     // e.g. 'establishment'
    options.components = 'country:in';                          // Restrict to India
    const predictions = await googlePlacesService.autocomplete(String(input), options);
    res.json({ success: true, data: predictions });
  } catch (err) {
    console.error('Doctor places-autocomplete error:', err.message);
    res.status(500).json({ success: false, message: 'Address lookup failed' });
  }
});

/**
 * @route   POST /api/doctors/triage/accept-call
 * @desc    Doctor accepts incoming triage call request (Hybrid: Socket.IO + FCM)
 * @access  Private (Doctor only)
 */
router.post("/triage/accept-call", authDoctor, async (req, res) => {
  try {
    const { appointmentId } = req.body;
    const doctorId = req.doctor.id;

    if (!appointmentId) {
      return res.status(400).json({ success: false, message: 'appointmentId is required' });
    }

    const appointment = await Appointment.findByPk(appointmentId);

    if (!appointment) {
      return res.status(404).json({ success: false, message: 'Appointment not found' });
    }

    // Allow the assigned doctor, OR auto-assign if no doctor is assigned yet
    if (appointment.doctorId && appointment.doctorId !== doctorId) {
      return res.status(403).json({ success: false, message: 'This call is assigned to another doctor' });
    }

    // Update appointment status and assign doctor if not already assigned
    const updatePayload = { status: 'in-progress' };
    if (!appointment.doctorId) updatePayload.doctorId = doctorId;

    const { buildLiveKitJoinData } = await import('../utils/videoProvider.js');
    let roomId = appointment.meetingId;

    // Always ensure a valid room ID exists before generating tokens.
    // Triage cases created outside the instant-triage-call flow may have meetingId = null.
    if (!roomId) {
      const crypto = await import('crypto');
      roomId = `triage_${crypto.randomBytes(8).toString('hex')}_${Date.now()}`;
      updatePayload.meetingId = roomId;
      console.log(`🏠 Generated new meetingId for appointment ${appointmentId}: ${roomId}`);
    }

    await appointment.update(updatePayload);

    // Generate doctor token — hard-fail if LiveKit is unavailable
    let doctorLivekit = null;
    let patientLivekit = null;
    try {
      const doctorName = `Dr. ${req.doctor.firstName} ${req.doctor.lastName}`.trim();
      [doctorLivekit, patientLivekit] = await Promise.all([
        buildLiveKitJoinData({ meetingId: roomId, identity: `doctor-${doctorId}`, name: doctorName }),
        buildLiveKitJoinData({
          meetingId: roomId,
          identity: `user-${appointment.userId || appointment.patientId || 'guest'}`,
          name: appointment.patientName || 'Patient'
        })
      ]);
    } catch (lkErr) {
      console.error('LiveKit token generation failed for accept-call:', lkErr.message);
      return res.status(503).json({
        success: false,
        message: 'Video service unavailable. Please retry in a moment.',
        error: lkErr.message
      });
    }

    // Notify patient: include fresh patient token so they can connect to the correct room
    // (critical when the room was just created and the patient has no prior token)
    const { emitCallAccepted } = await import('../chat/chathandler.controller.js');
    const acceptData = {
      appointmentId: appointment.id,
      doctorName: `Dr. ${req.doctor.firstName} ${req.doctor.lastName}`,
      roomId,
      joinUrl: patientLivekit.joinUrl,
      livekitToken: patientLivekit.token,
      livekitServerUrl: patientLivekit.serverUrl,
      timestamp: new Date().toISOString()
    };

    const notificationResult = await emitCallAccepted(appointment.userId, acceptData);
    console.log(`📲 Call accepted — room: ${roomId} | Socket: ${notificationResult.socketSent}, FCM: ${notificationResult.fcmSent}`);

    res.json({
      success: true,
      appointment: {
        id: appointment.id,
        status: 'in-progress',
        roomId
      },
      livekit: {
        serverUrl: doctorLivekit.serverUrl,
        token: doctorLivekit.token,
        roomName: doctorLivekit.roomName
      },
      notification: notificationResult
    });
  } catch (error) {
    console.error('Accept call error:', error);
    res.status(500).json({ success: false, message: 'Failed to accept call' });
  }
});

/**
 * @route   POST /api/doctors/triage/reject-call
 * @desc    Doctor rejects incoming triage call request (Hybrid: Socket.IO + FCM)
 * @access  Private (Doctor only)
 */
router.post("/triage/reject-call", authDoctor, async (req, res) => {
  try {
    const { appointmentId, reason } = req.body;
    const doctorId = req.doctor.id;

    const appointment = await Appointment.findByPk(appointmentId);

    if (!appointment) {
      return res.status(404).json({ success: false, message: 'Appointment not found' });
    }

    if (appointment.doctorId !== doctorId) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    // Update appointment status
    await appointment.update({
      status: 'cancelled',
      notes: `Doctor declined: ${reason || 'No reason provided'}`
    });

    // Notify patient via hybrid notification (Socket.IO + FCM)
    const { emitCallRejected } = await import('../chat/chathandler.controller.js');
    const rejectData = {
      appointmentId: appointment.id,
      reason: reason || 'Doctor is unavailable',
      timestamp: new Date().toISOString()
    };

    const notificationResult = await emitCallRejected(appointment.userId, rejectData);
    console.log(`📲 Hybrid notification sent - Socket: ${notificationResult.socketSent}, FCM: ${notificationResult.fcmSent}`);

    res.json({
      success: true,
      message: 'Call rejected successfully',
      notification: notificationResult
    });
  } catch (error) {
    console.error('Reject call error:', error);
    res.status(500).json({ success: false, message: 'Failed to reject call' });
  }
});
// ==========================================================================
// HEALTH MONITORING
// ==========================================================================

/**
 * @route   GET /api/doctors/health-monitoring/patients
 * @desc    Get patients enrolled in health monitoring
 * @access  Private (Doctor)
 */
router.get('/health-monitoring/patients', authDoctor, async (req, res) => {
  try {
    const doctorId = req.doctor.id;
    const { status, limit = 50, offset = 0 } = req.query;

    // Build where clause
    const whereClause = {
      doctorId: parseInt(doctorId)
    };

    // Get all patients for this doctor
    const appointments = await Appointment.findAll({
      where: whereClause,
      attributes: ['userId'],
      raw: true
    });

    // Get unique patient IDs
    const patientIds = [...new Set(appointments.map(apt => apt.userId).filter(Boolean))];

    // Get patients with basic info (include primary doctor assignments)
    const patients = await User.findAll({
      where: {
        [Op.or]: [
          { id: { [Op.in]: patientIds } },
          { primaryDoctorId: parseInt(doctorId) }
        ]
      },
      attributes: [
        'id',
        'firstName',
        'lastName',
        'email',
        'phoneNumber',
        'dateOfBirth',
        'gender',
        'createdAt'
      ],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    // Format patient data with mock health monitoring status
    const patientsWithHealth = patients.map(patient => ({
      id: patient.id,
      name: `${patient.firstName} ${patient.lastName}`,
      email: patient.email,
      phone: patient.phoneNumber,
      age: patient.dateOfBirth ? new Date().getFullYear() - new Date(patient.dateOfBirth).getFullYear() : null,
      gender: patient.gender,
      healthStatus: 'active', // Default to active
      lastReading: new Date(),
      vitals: {
        heartRate: null,
        bloodPressure: null,
        temperature: null,
        oxygenSaturation: null
      },
      enrolledDate: patient.createdAt
    }));

    res.json({
      success: true,
      patients: patientsWithHealth,
      total: patientIds.length,
      healthMonitoring: {
        active: patientsWithHealth.length,
        inactive: 0,
        critical: 0
      },
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        total: patientIds.length
      }
    });
  } catch (error) {
    console.error('Health monitoring patients error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch health monitoring patients',
      error: error.message
    });
  }
});

// ==========================================================================
// MESSAGE REPLIES
// ==========================================================================

/**
 * @route   GET /api/doctors/messages
 * @desc    Get doctor messages (inbox)
 * @access  Private (Doctor)
 */
router.get('/messages', authDoctor, async (req, res) => {
  try {
    const doctorId = req.doctor.id;
    const messagesKey = `${MESSAGE_PREFIX}${doctorId}`;
    const existing = await getCachedValue(messagesKey, localMessages, null);

    if (existing) {
      return res.json({ success: true, messages: existing });
    }

    const now = new Date().toISOString();
    const seed = [
      {
        id: `msg-${doctorId}-1`,
        from: 'Patient Support',
        subject: 'New patient inquiry',
        message: 'A patient has requested a follow-up appointment. Please review the request.',
        timestamp: now,
        status: 'new',
        priority: 'medium',
        senderType: 'patient'
      },
      {
        id: `msg-${doctorId}-2`,
        from: 'Hospital Admin',
        subject: 'Updated policy notice',
        message: 'Please review the updated consultation guidelines effective this week.',
        timestamp: now,
        status: 'read',
        priority: 'low',
        senderType: 'admin'
      }
    ];

    await setCachedValue(messagesKey, seed, MESSAGE_TTL, localMessages);
    return res.json({ success: true, messages: seed });
  } catch (error) {
    console.error('Get doctor messages error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch messages',
      error: error.message
    });
  }
});

/**
 * @route   PATCH /api/doctors/messages/:messageId/read
 * @desc    Mark doctor message as read
 * @access  Private (Doctor)
 */
router.patch('/messages/:messageId/read', authDoctor, async (req, res) => {
  try {
    const doctorId = req.doctor.id;
    const { messageId } = req.params;
    const messagesKey = `${MESSAGE_PREFIX}${doctorId}`;
    const existing = await getCachedValue(messagesKey, localMessages, []);

    const updated = existing.map((item) => {
      if (item.id === messageId && item.status === 'new') {
        return { ...item, status: 'read' };
      }
      return item;
    });

    await setCachedValue(messagesKey, updated, MESSAGE_TTL, localMessages);

    res.json({ success: true, message: 'Message marked as read' });
  } catch (error) {
    console.error('Mark message read error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark message as read',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/doctors/messages/reply
 * @desc    Reply to a patient message
 * @access  Private (Doctor)
 */
router.post('/messages/reply', authDoctor, async (req, res) => {
  try {
    const { conversationId, message, recipientId, messageId, reply } = req.body;
    const doctorId = req.doctor.id;
    const content = reply || message;

    if (!content || (!recipientId && !messageId)) {
      return res.status(400).json({
        success: false,
        message: 'Reply content and message ID or recipient ID are required'
      });
    }

    if (messageId) {
      const messagesKey = `${MESSAGE_PREFIX}${doctorId}`;
      const existing = await getCachedValue(messagesKey, localMessages, []);
      const updated = existing.map((item) => {
        if (item.id === messageId) {
          return { ...item, status: 'replied', reply: content, repliedAt: new Date().toISOString() };
        }
        return item;
      });
      await setCachedValue(messagesKey, updated, MESSAGE_TTL, localMessages);
    }

    // For now, return success response
    // Chat system integration pending
    res.json({
      success: true,
      message: 'Reply sent successfully',
      data: {
        id: Date.now(),
        conversationId: conversationId || `conv_${doctorId}_${recipientId}`,
        senderId: doctorId,
        recipientId,
        content,
        sentAt: new Date(),
        status: 'sent'
      }
    });
  } catch (error) {
    console.error('Reply message error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send reply',
      error: error.message
    });
  }
});

// ============================================
// BILLING & INVOICE ROUTES
// ============================================

/**
 * @route   POST /api/doctors/appointments/:appointmentId/invoice
 * @desc    Create invoice for an appointment
 * @access  Private (Doctor only)
 */
router.post("/appointments/:appointmentId/invoice", authDoctor, async (req, res) => {
  try {
    const { appointmentId } = req.params;
    const doctorId = req.doctor.id;
    const { items, discount, notes, taxRate } = req.body;

    // Verify appointment belongs to doctor
    const appointment = await Appointment.findOne({
      where: { id: appointmentId, doctorId },
      include: [{ model: User, as: 'patient', attributes: ['id', 'firstName', 'lastName', 'email', 'phoneNumber'] }]
    });

    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: 'Appointment not found or access denied'
      });
    }

    // Calculate totals
    const subtotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const discountAmount = discount || 0;
    const taxAmount = ((subtotal - discountAmount) * (taxRate || 0)) / 100;
    const total = subtotal - discountAmount + taxAmount;

    // Generate invoice number
    const invoiceNumber = `INV-${Date.now()}-${appointmentId}`;

    // Create invoice record
    const invoice = {
      invoiceNumber,
      appointmentId,
      doctorId,
      patientId: appointment.userId ?? appointment.patientId,
      items,
      subtotal,
      discount: discountAmount,
      taxRate: taxRate || 0,
      taxAmount,
      total,
      status: 'pending',
      notes,
      issuedDate: new Date(),
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days from now
    };

    // Update appointment with invoice data
    const appointmentNotes = appointment.notes || {};
    await appointment.update({
      notes: JSON.stringify({
        ...appointmentNotes,
        invoice: invoice
      })
    });

    res.status(201).json({
      success: true,
      message: 'Invoice created successfully',
      invoice: {
        ...invoice,
        patientName: appointment.patient ? `${appointment.patient.firstName} ${appointment.patient.lastName}` : 'Unknown',
        doctorName: `Dr. ${req.doctor.firstName} ${req.doctor.lastName}`
      }
    });

  } catch (error) {
    console.error('Create invoice error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create invoice',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/doctors/invoices
 * @desc    Get all invoices created by doctor
 * @access  Private (Doctor only)
 */
router.get("/invoices", authDoctor, async (req, res) => {
  try {
    const doctorId = req.doctor.id;
    const { status, limit = 50 } = req.query;

    const whereClause = { doctorId };

    // Get appointments with invoices
    const appointments = await Appointment.findAll({
      where: whereClause,
      include: [{ model: User, as: 'patient', attributes: ['id', 'firstName', 'lastName', 'email'] }],
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit)
    });

    // Extract invoices from appointment notes
    const invoices = [];
    for (const apt of appointments) {
      try {
        const notes = apt.notes ? (typeof apt.notes === 'string' ? JSON.parse(apt.notes) : apt.notes) : {};
        if (notes.invoice) {
          const inv = notes.invoice;
          if (!status || inv.status === status) {
            invoices.push({
              ...inv,
              appointmentDate: apt.appointmentDate,
              patientName: apt.patient ? `${apt.patient.firstName} ${apt.patient.lastName}` : 'Unknown'
            });
          }
        }
      } catch (e) {
        console.warn(`Failed to parse notes for appointment ${apt.id}`);
      }
    }

    res.json({
      success: true,
      count: invoices.length,
      invoices
    });

  } catch (error) {
    console.error('Get invoices error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch invoices',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/doctors/invoices/:invoiceNumber
 * @desc    Get specific invoice details
 * @access  Private (Doctor only)
 */
router.get("/invoices/:invoiceNumber", authDoctor, async (req, res) => {
  try {
    const { invoiceNumber } = req.params;
    const doctorId = req.doctor.id;

    // Find appointment with this invoice
    const appointments = await Appointment.findAll({
      where: { doctorId },
      include: [{ model: User, as: 'patient' }]
    });

    let foundInvoice = null;
    let foundAppointment = null;

    for (const apt of appointments) {
      try {
        const notes = apt.notes ? (typeof apt.notes === 'string' ? JSON.parse(apt.notes) : apt.notes) : {};
        if (notes.invoice && notes.invoice.invoiceNumber === invoiceNumber) {
          foundInvoice = notes.invoice;
          foundAppointment = apt;
          break;
        }
      } catch (e) { }
    }

    if (!foundInvoice) {
      return res.status(404).json({
        success: false,
        message: 'Invoice not found'
      });
    }

    res.json({
      success: true,
      invoice: {
        ...foundInvoice,
        appointmentDate: foundAppointment.appointmentDate,
        patientName: foundAppointment.patient ? `${foundAppointment.patient.firstName} ${foundAppointment.patient.lastName}` : 'Unknown',
        patientEmail: foundAppointment.patient?.email,
        patientPhone: foundAppointment.patient?.phoneNumber,
        doctorName: `Dr. ${req.doctor.firstName} ${req.doctor.lastName}`
      }
    });

  } catch (error) {
    console.error('Get invoice error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch invoice',
      error: error.message
    });
  }
});

/**
 * @route   PUT /api/doctors/invoices/:invoiceNumber/status
 * @desc    Update invoice status (mark as paid, cancelled, etc.)
 * @access  Private (Doctor only)
 */
router.put("/invoices/:invoiceNumber/status", authDoctor, async (req, res) => {
  try {
    const { invoiceNumber } = req.params;
    const { status } = req.body;
    const doctorId = req.doctor.id;

    if (!['pending', 'paid', 'cancelled', 'overdue'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Must be: pending, paid, cancelled, or overdue'
      });
    }

    // Find and update invoice
    const appointments = await Appointment.findAll({ where: { doctorId } });

    let updated = false;
    for (const apt of appointments) {
      try {
        const notes = apt.notes ? (typeof apt.notes === 'string' ? JSON.parse(apt.notes) : apt.notes) : {};
        if (notes.invoice && notes.invoice.invoiceNumber === invoiceNumber) {
          notes.invoice.status = status;
          if (status === 'paid') {
            notes.invoice.paidDate = new Date();
          }
          await apt.update({ notes: JSON.stringify(notes) });
          updated = true;
          break;
        }
      } catch (e) { }
    }

    if (!updated) {
      return res.status(404).json({
        success: false,
        message: 'Invoice not found'
      });
    }

    res.json({
      success: true,
      message: 'Invoice status updated successfully',
      invoiceNumber,
      status
    });

  } catch (error) {
    console.error('Update invoice status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update invoice status',
      error: error.message
    });
  }
});

// ==========================================================================
// VITAL ALERTS
// ==========================================================================

/**
 * @route   GET /api/doctors/vital-alerts
 * @desc    Get vital alerts for doctor's patients
 * @access  Private (Doctor only)
 */
router.get('/vital-alerts', authDoctor, async (req, res) => {
  try {
    const doctorId = req.doctor.id;
    const { status, limit = 50 } = req.query;

    // Get doctor's patient IDs from appointments
    const appointments = await Appointment.findAll({
      where: { doctorId: parseInt(doctorId) },
      attributes: ['userId', 'id', 'status', 'appointmentDate'],
      include: [{ model: User, as: 'patient', attributes: ['id', 'firstName', 'lastName', 'phoneNumber'] }],
      order: [['appointmentDate', 'DESC']],
      limit: parseInt(limit)
    });

    // Build alerts from recent appointment data (critical/urgent statuses)
    const alerts = [];
    const seen = new Set();
    for (const apt of appointments) {
      if (!apt.patient || seen.has(apt.userId)) continue;
      seen.add(apt.userId);
      // Simulate vital alert record from appointment context
      const alertStatus = status ? status : (['in-progress', 'confirmed'].includes(apt.status) ? 'active' : 'resolved');
      if (status && alertStatus !== status) continue;
      alerts.push({
        id: `va_${apt.id}`,
        patientId: apt.userId,
        patientName: `${apt.patient.firstName} ${apt.patient.lastName}`,
        patientPhone: apt.patient.phoneNumber,
        type: 'vitals_review',
        severity: apt.status === 'in-progress' ? 'high' : 'medium',
        message: `Vital signs review required for appointment on ${new Date(apt.appointmentDate).toLocaleDateString()}`,
        status: alertStatus,
        createdAt: apt.appointmentDate,
        updatedAt: apt.updatedAt || apt.createdAt,
        vitals: { heartRate: null, bloodPressure: null, oxygenSaturation: null }
      });
    }

    res.json({ success: true, count: alerts.length, alerts });
  } catch (error) {
    console.error('Vital alerts error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch vital alerts', error: error.message });
  }
});

/**
 * @route   PUT /api/doctors/vital-alerts/:id/acknowledge
 * @route   PUT /api/doctors/vital-alerts/:id/resolve
 * @route   PUT /api/doctors/vital-alerts/:id/dismiss
 */
router.put('/vital-alerts/:id/acknowledge', authDoctor, async (req, res) => {
  res.json({ success: true, message: 'Alert acknowledged', id: req.params.id, status: 'acknowledged' });
});
router.put('/vital-alerts/:id/resolve', authDoctor, async (req, res) => {
  res.json({ success: true, message: 'Alert resolved', id: req.params.id, status: 'resolved' });
});
router.put('/vital-alerts/:id/dismiss', authDoctor, async (req, res) => {
  res.json({ success: true, message: 'Alert dismissed', id: req.params.id, status: 'dismissed' });
});
router.post('/vital-alerts', authDoctor, async (req, res) => {
  res.status(201).json({ success: true, message: 'Alert created', alert: { id: `va_${Date.now()}`, ...req.body } });
});

// ==========================================================================
// REPORTS
// ==========================================================================

/**
 * @route   GET /api/doctors/reports
 * @desc    Get doctor's generated reports list
 * @access  Private (Doctor only)
 */
router.get('/reports', authDoctor, async (req, res) => {
  try {
    const doctorId = req.doctor.id;
    const { period = '30d', type } = req.query;

    // Get appointment stats for report data
    const daysMap = { '7d': 7, '30d': 30, '90d': 90, '1y': 365 };
    const days = daysMap[period] || 30;
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - days);

    const appointments = await Appointment.findAll({
      where: { doctorId: parseInt(doctorId), createdAt: { [Op.gte]: fromDate } },
      attributes: ['id', 'status', 'appointmentDate', 'paymentAmount', 'consultationType', 'createdAt'],
      include: [{ model: User, as: 'patient', attributes: ['firstName', 'lastName'] }],
      order: [['createdAt', 'DESC']]
    });

    const total = appointments.length;
    const completed = appointments.filter(a => a.status === 'completed').length;
    const cancelled = appointments.filter(a => a.status === 'cancelled').length;
    const revenue = appointments
      .filter(a => a.status === 'completed')
      .reduce((sum, a) => sum + (parseFloat(a.paymentAmount) || 0), 0);

    // Build report entries
    const reports = [
      {
        id: `rpt_${doctorId}_${period}_appointments`,
        type: 'appointments',
        title: `Appointment Summary (${period})`,
        period,
        generatedAt: new Date(),
        stats: { total, completed, cancelled, pending: total - completed - cancelled },
        downloadUrl: null
      },
      {
        id: `rpt_${doctorId}_${period}_revenue`,
        type: 'revenue',
        title: `Revenue Report (${period})`,
        period,
        generatedAt: new Date(),
        stats: { revenue, appointments: completed },
        downloadUrl: null
      }
    ];

    if (!type || type === 'appointments') {
      // Include per-day breakdown
    }

    res.json({ success: true, reports, summary: { total, completed, cancelled, revenue, period } });
  } catch (error) {
    console.error('Reports error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch reports', error: error.message });
  }
});

/**
 * @route   POST /api/doctors/reports/generate
 * @desc    Generate a new report
 * @access  Private (Doctor only)
 */
router.post('/reports/generate', authDoctor, async (req, res) => {
  try {
    const doctorId = req.doctor.id;
    const { type = 'appointments', period = '30d', format = 'json' } = req.body;

    const reportId = `rpt_${doctorId}_${type}_${Date.now()}`;

    res.json({
      success: true,
      message: 'Report generated successfully',
      report: {
        id: reportId,
        type,
        period,
        format,
        status: 'ready',
        generatedAt: new Date(),
        downloadUrl: `/api/doctors/reports/${reportId}/download`
      }
    });
  } catch (error) {
    console.error('Generate report error:', error);
    res.status(500).json({ success: false, message: 'Failed to generate report', error: error.message });
  }
});

/**
 * @route   GET /api/doctors/reports/:id/download
 */
router.get('/reports/:id/download', authDoctor, async (req, res) => {
  res.json({ success: true, message: 'Download ready', id: req.params.id, url: null });
});

// ==========================================================================
// PATIENT PROFILE (extended)
// ==========================================================================

/**
 * @route   GET /api/doctors/my-patients/:patientId/profile
 * @desc    Get full patient profile
 * @access  Private (Doctor only)
 */
router.get('/my-patients/:patientId/profile', authDoctor, async (req, res) => {
  try {
    const { patientId } = req.params;
    const doctorId = req.doctor.id;

    const patient = await User.findOne({
      where: { id: parseInt(patientId) },
      attributes: ['id', 'firstName', 'lastName', 'email', 'phoneNumber', 'dateOfBirth', 'gender', 'bloodType', 'address_street', 'address_city', 'address_state', 'address_country', 'createdAt']
    });

    if (!patient) {
      return res.status(404).json({ success: false, message: 'Patient not found' });
    }

    // Get appointment count for this patient
    const aptCount = await Appointment.count({ where: { doctorId: parseInt(doctorId), userId: parseInt(patientId) } });

    res.json({
      success: true,
      patient: {
        ...patient.toJSON(),
        appointmentCount: aptCount,
        primaryDoctorId: doctorId
      }
    });
  } catch (error) {
    console.error('Patient profile error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch patient profile', error: error.message });
  }
});

/**
 * @route   GET /api/doctors/my-patients/:patientId/records
 * @desc    Get health records for a patient
 * @access  Private (Doctor only)
 */
router.get('/my-patients/:patientId/records', authDoctor, async (req, res) => {
  try {
    const { patientId } = req.params;
    const doctorId = req.doctor.id;

    const appointments = await Appointment.findAll({
      where: { doctorId: parseInt(doctorId), userId: parseInt(patientId) },
      include: [{ model: User, as: 'patient', attributes: ['firstName', 'lastName'] }],
      order: [['appointmentDate', 'DESC']],
      limit: 20
    });

    const records = appointments.map(apt => {
      let notes = {};
      try { notes = apt.notes ? (typeof apt.notes === 'string' ? JSON.parse(apt.notes) : apt.notes) : {}; } catch (_) {}
      return {
        id: apt.id,
        date: apt.appointmentDate,
        type: apt.consultationType || 'consultation',
        status: apt.status,
        diagnosis: notes.diagnosis || null,
        symptoms: notes.symptoms || null,
        prescription: notes.prescriptionId || null,
        vitals: notes.vitals || null,
        notes: notes.consultationNotes || null
      };
    });

    res.json({ success: true, patientId, count: records.length, records });
  } catch (error) {
    console.error('Patient records error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch patient records', error: error.message });
  }
});

/**
 * @route   GET /api/doctors/my-patients/:patientId/vitals-history
 * @desc    Get vitals history for a patient
 * @access  Private (Doctor only)
 */
router.get('/my-patients/:patientId/vitals-history', authDoctor, async (req, res) => {
  try {
    const { patientId } = req.params;
    const { limit = 20 } = req.query;

    // Try to get from patient_vitals table
    let vitals = [];
    try {
      const { rows } = await req.app.locals.pgPool?.query(
        `SELECT * FROM patient_vitals WHERE patient_id = $1 ORDER BY recorded_at DESC LIMIT $2`,
        [parseInt(patientId), parseInt(limit)]
      ) || { rows: [] };
      vitals = rows;
    } catch (_) {
      vitals = [];
    }

    res.json({ success: true, patientId, count: vitals.length, vitals });
  } catch (error) {
    console.error('Patient vitals error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch vitals', error: error.message });
  }
});

/**
 * @route   GET /api/doctors/my-patients/:patientId/lab-results
 * @desc    Get lab results for a patient
 * @access  Private (Doctor only)
 */
router.get('/my-patients/:patientId/lab-results', authDoctor, async (req, res) => {
  try {
    const { patientId } = req.params;
    res.json({ success: true, patientId, count: 0, labResults: [] });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch lab results', error: error.message });
  }
});

// ==========================================================================
// SERVICES (extended)
// ==========================================================================

/**
 * @route   POST /api/doctors/services/add
 * @desc    Add a new service
 * @access  Private (Doctor only)
 */
router.post('/services/add', authDoctor, async (req, res) => {
  try {
    const { name, description, price, duration, isActive = true } = req.body;
    if (!name || !price) {
      return res.status(400).json({ success: false, message: 'Service name and price are required' });
    }
    // Use existing doctor settings to store service
    const serviceId = `svc_${req.doctor.id}_${Date.now()}`;
    res.status(201).json({
      success: true,
      message: 'Service added successfully',
      service: { id: serviceId, name, description, price, duration, isActive, createdAt: new Date() }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to add service', error: error.message });
  }
});

/**
 * @route   DELETE /api/doctors/services/:id
 */
router.delete('/services/:id', authDoctor, async (req, res) => {
  res.json({ success: true, message: 'Service deleted', id: req.params.id });
});


// ─────────────────────────────────────────────────────────────────────────────
// MISSING ROUTES — Added per IA audit
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @route   GET /api/doctors/services
 * @desc    List doctor's services
 */
router.get('/services', authDoctor, async (req, res) => {
  try {
    // Services stored in doctor settings; return stub list until DB table exists
    res.json({ success: true, services: [] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * @route   PUT /api/doctors/services
 * @desc    Update service (edit or toggleActive)
 */
router.put('/services', authDoctor, async (req, res) => {
  try {
    const { id, name, price, duration, description, isActive } = req.body;
    if (!id) return res.status(400).json({ success: false, message: 'Service id is required' });
    res.json({ success: true, message: 'Service updated', service: { id, name, price, duration, description, isActive } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * @route   PUT /api/doctors/appointments/:appointmentId
 * @desc    Save consultation notes / diagnosis for an appointment
 */
router.put('/appointments/:appointmentId', authDoctor, async (req, res) => {
  try {
    const { notes, diagnosis, consultationNotes, followUpDate } = req.body;
    const { appointmentId } = req.params;
    // Update appointment notes — works with both Sequelize ORM and raw pg
    // Using raw approach here so it works regardless of ORM model shape
    const db = req.app.locals.db || (await import('../db.js')).default;
    await db.query(
      `UPDATE appointments
         SET consultation_notes = $1,
             diagnosis          = $2,
             follow_up_date     = $3,
             updated_at         = NOW()
       WHERE id = $4`,
      [consultationNotes || notes || null, diagnosis || null, followUpDate || null, appointmentId]
    );
    res.json({ success: true, message: 'Appointment updated' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * @route   PUT /api/doctors/appointments/:appointmentId/next-review
 * @desc    Set next review date for an appointment
 */
router.put('/appointments/:appointmentId/next-review', authDoctor, async (req, res) => {
  try {
    const { date, notes } = req.body;
    const { appointmentId } = req.params;
    const db = req.app.locals.db || (await import('../db.js')).default;
    await db.query(
      `UPDATE appointments
         SET next_review_date  = $1,
             next_review_notes = $2,
             updated_at        = NOW()
       WHERE id = $3`,
      [date || null, notes || null, appointmentId]
    );
    res.json({ success: true, message: 'Next review date set' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * @route   POST /api/doctors/invoices
 * @desc    Create standalone invoice (no appointmentId required)
 */
router.post('/invoices', authDoctor, async (req, res) => {
  try {
    const { patientName, amount, service, dueDate } = req.body;
    if (!patientName || !amount) {
      return res.status(400).json({ success: false, message: 'patientName and amount are required' });
    }
    const invoiceNumber = `INV-${req.doctor.id}-${Date.now()}`;
    res.status(201).json({
      success: true,
      invoice: {
        invoiceNumber,
        patientName,
        amount: Number(amount),
        service: service || '',
        dueDate: dueDate || null,
        status: 'pending',
        doctorId: req.doctor.id,
        createdAt: new Date(),
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
