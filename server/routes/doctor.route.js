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
import { withPatientRelationship } from "../middleware/ringFencing.js";
import { authLimiter, otpLimiter } from "../middleware/rateLimiter.middleware.js";
import { addOtpRoutes } from './shared/registrationHelpers.js';
import googlePlacesService from '../services/google-places.service.js';
import { Doctor, Appointment, User } from "../models/index.js";
import { UserPlan } from "../models/postgres/membershipPlan.model.postgres.js";
import { Op } from 'sequelize';
import { Notification, FCMToken } from '../services/notification.service.js';
import { sendDoctorCallingNotification } from '../utils/firebase-admin.js';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { cache } from '../db/redis.js';
import pool from '../db/pgPool.js';
import { evaluateVitalsAndAlert } from '../services/clinical-intelligence.service.js';
import { buildLiveKitJoinData, ensureMeetingInfo, getProviderLabel } from '../utils/videoProvider.js';
import { getIO, getOnlineUsers } from '../chat/chathandler.controller.js';
import { createDoctorDashboardAlertsRouter } from './doctor/dashboard-alerts.routes.js';
import { createDoctorTriageRouter } from './doctor/triage.routes.js';
import { createDoctorTemplatesRouter } from './doctor/templates.routes.js';
import { createDoctorMessagesRouter } from './doctor/messages.routes.js';
import { createDoctorBillingRouter } from './doctor/billing.routes.js';
import { toArray, normalizeDoctorProfile } from '../utils/doctorNormalizer.js';
import { isSlotBooked, normalizeSlotKey } from '../utils/appointmentSlotTime.js';

const router = express.Router();
// Ensure request bodies are parsed even if app-level parser order changes.
router.use(express.json());
router.use(express.urlencoded({ extended: true }));

const MEMBERSHIP_RENEWAL_EXEMPT_EMAILS = new Set(
  String(process.env.MEMBERSHIP_RENEWAL_EXEMPT_EMAILS || 'user@mediczy.com')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean)
);

const isMembershipRenewalExemptEmail = (email) =>
  MEMBERSHIP_RENEWAL_EXEMPT_EMAILS.has(String(email || '').trim().toLowerCase());

console.log('🔷 [doctor.route.js] Module loaded');
console.log('🔷 signInDoctor type:', typeof signInDoctor);

const ALERT_STATE_PREFIX = 'doctor:alerts:state:';
const MESSAGE_PREFIX = 'doctor:messages:';
const ALERT_STATE_TTL = 7 * 24 * 60 * 60;
const MESSAGE_TTL = 7 * 24 * 60 * 60;
const localAlertState = new Map();
const localMessages = new Map();
const MAX_CACHE_ENTRIES = 1000; // Limit to prevent memory leak

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
    return fallback;
  }
};

const normalizeWeeklySchedule = (rawSchedule) => {
  const source = normalizeJsonValue(rawSchedule, {});
  const weeklySchedule = {};

  Object.keys(DEFAULT_WEEKLY_SCHEDULE).forEach((day) => {
    const savedDay = source[day] || {};
    const defaultDay = DEFAULT_WEEKLY_SCHEDULE[day];
    const hasLegacyWindow = savedDay.startTime && savedDay.endTime;
    const legacyEnabled = savedDay.isAvailable !== false && hasLegacyWindow;
    const isOff = savedDay.isOff ?? (savedDay.isAvailable === false ? true : defaultDay.isOff);

    weeklySchedule[day] = {
      isOff,
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

const normalizeClinicLocationPayload = (practice = {}, existingClinicAddress = '', existingClinicAddressJson = {}) => {
  const nextJson = (existingClinicAddressJson && typeof existingClinicAddressJson === 'object')
    ? { ...existingClinicAddressJson }
    : {};

  const incomingJson = (practice.clinicAddress_json && typeof practice.clinicAddress_json === 'object')
    ? practice.clinicAddress_json
    : {};

  Object.assign(nextJson, incomingJson);

  const clinicAddress =
    (typeof practice.clinicAddress === 'string' && practice.clinicAddress.trim()) ||
    (typeof practice.practiceAddress === 'string' && practice.practiceAddress.trim()) ||
    (typeof existingClinicAddress === 'string' ? existingClinicAddress : '');

  const placeId =
    practice.placeId ||
    practice.place_id ||
    practice.googlePlaceId ||
    practice.google_place_id ||
    incomingJson.placeId ||
    incomingJson.place_id ||
    incomingJson.googlePlaceId ||
    incomingJson.google_place_id;

  if (placeId) {
    const normalizedPlaceId = String(placeId).trim();
    nextJson.placeId = normalizedPlaceId;
    nextJson.place_id = normalizedPlaceId;
    nextJson.googlePlaceId = normalizedPlaceId;
    nextJson.google_place_id = normalizedPlaceId;
    nextJson.source = nextJson.source || 'google_places';
    nextJson.provider = nextJson.provider || 'google_places';
    nextJson.verificationStatus = 'verified';
    nextJson.verifiedAt = new Date().toISOString();
  }

  const lat =
    toFiniteNumber(practice.latitude) ??
    toFiniteNumber(practice.lat) ??
    toFiniteNumber(practice.practiceLatitude) ??
    toFiniteNumber(incomingJson.latitude) ??
    toFiniteNumber(incomingJson.lat);

  const lng =
    toFiniteNumber(practice.longitude) ??
    toFiniteNumber(practice.lng) ??
    toFiniteNumber(practice.lon) ??
    toFiniteNumber(practice.practiceLongitude) ??
    toFiniteNumber(incomingJson.longitude) ??
    toFiniteNumber(incomingJson.lng) ??
    toFiniteNumber(incomingJson.lon);

  if (lat !== null) {
    nextJson.latitude = lat;
    nextJson.lat = lat;
  }
  if (lng !== null) {
    nextJson.longitude = lng;
    nextJson.lng = lng;
  }

  if (practice.practiceCity && !nextJson.city) nextJson.city = practice.practiceCity;
  if (practice.practiceState && !nextJson.state) nextJson.state = practice.practiceState;
  if (practice.practiceZipCode && !nextJson.pincode) nextJson.pincode = practice.practiceZipCode;

  return {
    clinicAddress,
    clinicAddress_json: nextJson
  };
};

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

router.use(createDoctorDashboardAlertsRouter({
  authDoctor,
  Appointment,
  Notification,
  Op,
  getCachedValue,
  setCachedValue,
  ALERT_STATE_PREFIX,
  ALERT_STATE_TTL,
  localAlertState,
}));

router.use(createDoctorTriageRouter({
  authDoctor,
  Appointment,
  User,
  Doctor,
  UserPlan,
  Op,
  isMembershipRenewalExemptEmail,
  ensureMeetingInfo,
  getProviderLabel,
  buildLiveKitJoinData,
  Notification,
  FCMToken,
  sendDoctorCallingNotification,
  getIO,
  getOnlineUsers,
}));

router.use(createDoctorTemplatesRouter({
  authDoctor,
  Doctor,
}));

router.use(createDoctorMessagesRouter({
  authDoctor,
  MESSAGE_PREFIX,
  MESSAGE_TTL,
  localMessages,
  getCachedValue,
  setCachedValue,
}));

router.use(createDoctorBillingRouter({
  authDoctor,
  Appointment,
  User,
}));

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
    body("email")
      .notEmpty()
      .withMessage("Email or phone number is required")
      .custom((value) => {
        const raw = String(value || '').trim();
        const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw);
        const digits = raw.replace(/\D/g, '');
        const isPhone = digits.length >= 7 && digits.length <= 15 && !raw.includes('@');
        if (!isEmail && !isPhone) {
          throw new Error("Must be a valid email address or phone number");
        }
        return true;
      }),
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
      where.status = { [Op.in]: ['pending', 'scheduled', 'confirmed', 'in-progress'] };
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

    const nd = normalizeDoctorProfile(doctor);
    res.json({
      success: true,
      settings: {
        profile: {
          firstName: nd.firstName,
          lastName: nd.lastName,
          email: nd.email,
          phoneNumber: nd.phoneNumber,
          specialization: nd.specialization,
          specializations: nd.specializations,
          experience: nd.experience,
          qualifications: nd.qualifications,
          languages: nd.languages,
          bio: nd.bio,
          profileImage: nd.profileImage,
          socialLinks: nd.socialLinks || {}
        },
        practice: {
          consultationFee: nd.consultationFee,
          feeStructure: nd.feeStructure,
          slotDuration: nd.slotDuration,
          weeklySchedule: nd.weeklySchedule,
          weeklyAvailability: nd.weeklyAvailability,
          practiceLocations: nd.practiceLocations,
          isAvailable: nd.isAvailable
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

      // Always store as arrays — toArray handles string/array/null
      if (profile.qualifications !== undefined) {
        doctor.qualifications = toArray(profile.qualifications);
        updatedFields.push('qualifications');
      }

      if (profile.languages !== undefined) {
        doctor.languages = toArray(profile.languages);
        updatedFields.push('languages');
      }

      if (profile.servicesOffered !== undefined) {
        doctor.servicesOffered = toArray(profile.servicesOffered);
        updatedFields.push('servicesOffered');
      }
    }

    // Update practice fields with special handling for JSONB fields
    if (practice) {
      const normalizedLocation = normalizeClinicLocationPayload(
        practice,
        doctor.clinicAddress,
        doctor.clinicAddress_json
      );

      if (normalizedLocation.clinicAddress !== undefined) {
        doctor.clinicAddress = normalizedLocation.clinicAddress;
        updatedFields.push('clinicAddress');
      }

      if (normalizedLocation.clinicAddress_json !== undefined) {
        doctor.clinicAddress_json = normalizedLocation.clinicAddress_json;
        updatedFields.push('clinicAddress_json');
      }

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

// ── Patient-access sub-group ──────────────────────────────────────────────────
// Every route below that accesses a specific patient resource is automatically
// protected by verifyPatientRelationship via the withPatientRelationship middleware.
// Routes that list *all* of a doctor's own patients (no :patientId param) are exempt
// because ring-fencing already enforces the doctor owns the appointment.
router.use('/patients/:patientId', withPatientRelationship(Appointment));
router.use('/my-patients/:patientId', withPatientRelationship(Appointment));
// ─────────────────────────────────────────────────────────────────────────────

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
    const weeklySchedule = normalizeWeeklySchedule(doctor.weeklySchedule);
    const practiceLocations = doctor.practiceLocations || [];
    const offDays = (doctor.offDays || ['sunday']).map((d) => String(d).toLowerCase());

    // If date is provided, get slots for that specific day
    if (date) {
      const requestedDate = new Date(date);
      const dayName = requestedDate.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
      const daySchedule = weeklySchedule?.[dayName];
      const isOffDay = offDays.includes(dayName) || daySchedule?.isOff === true || daySchedule?.isAvailable === false;

      if (!daySchedule || isOffDay) {
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
      const blockedSlots = daySchedule.blockedSlots || [];
      const isSlotBlocked = (slot) => blockedSlots.some((blocked) => normalizeSlotKey(blocked) === normalizeSlotKey(slot));
      const isBooked = (slot) => isSlotBooked(slot, bookedSlotTimes);

      // Generate online slots
      const onlineSlots = daySchedule.online?.enabled
        ? generateTimeSlots(
          daySchedule.online.startTime,
          daySchedule.online.endTime,
          slotDuration
        ).map(slot => ({
          time: slot,
          available: !isBooked(slot) && !isSlotBlocked(slot),
          blocked: isSlotBlocked(slot)
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
            available: !isBooked(slot) && !isSlotBlocked(slot),
            blocked: isSlotBlocked(slot),
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

const hasDoctorPatientRelationship = async (doctorId, patientId) => {
  const normalizedDoctorId = Number(doctorId);
  const normalizedPatientId = Number(patientId);

  if (!Number.isInteger(normalizedDoctorId) || !Number.isInteger(normalizedPatientId)) {
    return false;
  }

  const appointmentCount = await Appointment.count({
    where: {
      doctorId: normalizedDoctorId,
      userId: normalizedPatientId,
      status: { [Op.notIn]: ['cancelled'] }
    }
  });

  if (appointmentCount > 0) {
    return true;
  }

  const patient = await User.findByPk(normalizedPatientId, {
    attributes: ['id', 'primaryDoctorId']
  });

  return Number(patient?.primaryDoctorId) === normalizedDoctorId;
};

/**
 * @route   PUT /api/doctors/my-patients/:patientId
 * @desc    Update patient profile fields (doctor-created patients only)
 * @access  Private (Doctor)
 */
router.put('/my-patients/:patientId', authDoctor, async (req, res) => {
  try {
    const { patientId } = req.params;

    // IDOR guard — verify this doctor has an appointment relationship with the patient
    const hasRelationship = await hasDoctorPatientRelationship(req.doctor.id, patientId);
    if (!hasRelationship) {
      return res.status(403).json({ success: false, message: 'No appointment relationship with this patient' });
    }

    const { firstName, lastName, phone, phoneNumber, email, age, gender, bloodGroup, city, allergies } = req.body;
    const resolvedPhone = phone || phoneNumber;

    const [rowsUpdated] = await User.update(
      {
        ...(firstName    !== undefined && { firstName }),
        ...(lastName     !== undefined && { lastName }),
        ...(resolvedPhone!== undefined && { phoneNumber: resolvedPhone }),
        ...(email        !== undefined && { email }),
        ...(age          !== undefined && { age }),
        ...(gender       !== undefined && { gender }),
        ...(bloodGroup   !== undefined && { bloodGroup }),
        ...(city         !== undefined && { city }),
        ...(allergies    !== undefined && { allergies }),
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

    // IDOR guard
    const hasRelationship = await hasDoctorPatientRelationship(req.doctor.id, patientId);
    if (!hasRelationship) {
      return res.status(403).json({ success: false, message: 'No appointment relationship with this patient' });
    }

    const { bp, heartRate, temperature, spo2, weight, height, bloodGlucose, notes, temperatureUnit = 'F' } = req.body;

    // Range validation
    const validationErrors = [];
    if (bp !== undefined && bp !== null && !/^\d{2,3}\/\d{2,3}$/.test(String(bp))) {
      validationErrors.push('bp must be in format "120/80"');
    }
    if (heartRate !== undefined && heartRate !== null) {
      const hr = Number(heartRate);
      if (!Number.isInteger(hr) || hr < 20 || hr > 300) validationErrors.push('heartRate must be an integer between 20 and 300');
    }
    if (temperature !== undefined && temperature !== null) {
      const t = Number(temperature);
      const tF = temperatureUnit === 'C' ? t * 9/5 + 32 : t;
      if (isNaN(tF) || tF < 95 || tF > 108) validationErrors.push('temperature is out of valid range (95–108°F / 35–42.2°C)');
    }
    if (spo2 !== undefined && spo2 !== null) {
      const s = Number(spo2);
      if (!Number.isInteger(s) || s < 0 || s > 100) validationErrors.push('spo2 must be an integer between 0 and 100');
    }
    if (validationErrors.length) {
      return res.status(422).json({ success: false, message: 'Invalid vitals values', errors: validationErrors });
    }

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
      return res.status(503).json({ success: false, code: 'VITALS_TABLE_NOT_READY', message: 'Vitals service is being set up. Please try again shortly.' });
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

    // IDOR guard
    const hasRelationship = await hasDoctorPatientRelationship(req.doctor.id, patientId);
    if (!hasRelationship) {
      return res.status(403).json({ success: false, message: 'No appointment relationship with this patient' });
    }

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
      return res.status(503).json({ success: false, code: 'HISTORY_TABLE_NOT_READY', message: 'History service is being set up. Please try again shortly.' });
    }
    res.status(500).json({ success: false, message: 'Failed to add history', error: error.message });
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
    const { limit = 50, offset = 0 } = req.query;

    // Unified query using the real Sequelize-managed tables (users, doctors, appointments)
    const { rows: patients } = await pool.query(`
      WITH doctor_patients AS (
        SELECT DISTINCT u.id, u."firstName", u."lastName", u.email, u."phoneNumber",
               u."dateOfBirth", u.gender, u."createdAt"
        FROM   users u
        WHERE  u.id IN (
          SELECT DISTINCT "patientId" FROM appointments
          WHERE  "doctorId" = $1 AND "patientId" IS NOT NULL
          UNION
          SELECT DISTINCT "userId" FROM appointments
          WHERE  "doctorId" = $1 AND "userId" IS NOT NULL
        )
        LIMIT $2 OFFSET $3
      ),
      latest_doctor_vitals AS (
        SELECT DISTINCT ON (patient_id)
               patient_id, bp, heart_rate, temperature, spo2, blood_glucose, recorded_at AS vitals_at
        FROM   patient_vitals
        WHERE  patient_id IN (SELECT id FROM doctor_patients)
        ORDER  BY patient_id, recorded_at DESC
      ),
      latest_wearable AS (
        SELECT DISTINCT ON (user_id)
               user_id,
               (current_metrics->>'heartRate')::numeric         AS hr_wearable,
               (current_metrics->>'bloodPressure')             AS bp_wearable,
               (current_metrics->>'oxygenSaturation')::numeric AS spo2_wearable,
               (current_metrics->>'temperature')::numeric      AS temp_wearable,
               last_sync                                       AS wearable_at
        FROM   wearables
        WHERE  user_id IN (SELECT id FROM doctor_patients)
          AND  last_sync IS NOT NULL
        ORDER  BY user_id, last_sync DESC
      ),
      latest_activity AS (
        SELECT DISTINCT ON (user_id)
               user_id,
               heart_rate               AS hr_activity,
               blood_sugar              AS glucose_activity,
               steps, sleep_hours, date AS activity_date
        FROM   daily_activity
        WHERE  user_id IN (SELECT id FROM doctor_patients)
        ORDER  BY user_id, date DESC
      ),
      active_alerts AS (
        SELECT patient_id, COUNT(*) AS alert_count,
               MAX(CASE severity WHEN 'critical' THEN 4 WHEN 'high' THEN 3 WHEN 'medium' THEN 2 ELSE 1 END) AS max_sev
        FROM   early_warning_alerts
        WHERE  patient_id IN (SELECT id FROM doctor_patients)
          AND  resolved = FALSE
        GROUP  BY patient_id
      ),
      wearable_alerts AS (
        SELECT user_id, COUNT(*) AS wearable_alert_count
        FROM   health_readings
        WHERE  user_id IN (SELECT id FROM doctor_patients)
          AND  alert_triggered = TRUE
          AND  recorded_at >= NOW() - INTERVAL '24 hours'
        GROUP  BY user_id
      ),
      ai_scores AS (
        SELECT DISTINCT ON (patient_id)
               patient_id,
               ROUND((overall_score * 10)::numeric, 1) AS composite_score,
               risk_level      AS risk_category,
               confidence_score
        FROM   ai_health_risk_scores
        WHERE  patient_id IN (SELECT id FROM doctor_patients)
        ORDER  BY patient_id, created_at DESC
      )
      SELECT
        dp.id,
        dp."firstName" || ' ' || dp."lastName"           AS name,
        dp.email,
        dp."phoneNumber"                                  AS phone,
        EXTRACT(YEAR FROM AGE(dp."dateOfBirth"))::int     AS age,
        dp.gender,
        dp."createdAt"                                    AS enrolled_date,
        -- Vitals: prefer wearable (freshest) then doctor-entered
        COALESCE(lw.hr_wearable, ldv.heart_rate)         AS heart_rate,
        COALESCE(lw.bp_wearable, ldv.bp)                 AS blood_pressure,
        COALESCE(lw.spo2_wearable, ldv.spo2)             AS oxygen_saturation,
        COALESCE(lw.temp_wearable, ldv.temperature)      AS temperature,
        COALESCE(ldv.blood_glucose, la.glucose_activity)  AS blood_glucose,
        la.steps, la.sleep_hours,
        GREATEST(lw.wearable_at, ldv.vitals_at)          AS last_reading,
        -- Risk classification
        CASE
          WHEN aa.max_sev >= 4 OR lw.spo2_wearable < 92 OR lw.hr_wearable > 130 OR lw.hr_wearable < 45 THEN 'critical'
          WHEN aa.max_sev = 3 OR wa.wearable_alert_count > 0                                              THEN 'high'
          WHEN aa.max_sev = 2                                                                               THEN 'medium'
          ELSE 'low'
        END AS risk_level,
        COALESCE(aa.alert_count, 0) + COALESCE(wa.wearable_alert_count, 0) AS total_alerts,
        -- AI health score (0-100, from 6-hourly cron)
        ais.composite_score   AS ai_health_score,
        ais.risk_category     AS ai_risk_category,
        ais.confidence_score  AS ai_confidence,
        -- Data source flags
        (lw.user_id IS NOT NULL)     AS has_wearable,
        (ldv.patient_id IS NOT NULL) AS has_doctor_vitals
      FROM   doctor_patients dp
      LEFT JOIN latest_doctor_vitals  ldv ON ldv.patient_id = dp.id
      LEFT JOIN latest_wearable       lw  ON lw.user_id     = dp.id
      LEFT JOIN latest_activity       la  ON la.user_id     = dp.id
      LEFT JOIN active_alerts         aa  ON aa.patient_id  = dp.id
      LEFT JOIN wearable_alerts       wa  ON wa.user_id     = dp.id
      LEFT JOIN ai_scores             ais ON ais.patient_id = dp.id
      ORDER BY
        CASE WHEN aa.max_sev >= 4 OR lw.spo2_wearable < 92 THEN 0
             WHEN aa.max_sev = 3 OR wa.wearable_alert_count > 0 THEN 1
             WHEN aa.max_sev = 2 THEN 2 ELSE 3 END,
        GREATEST(lw.wearable_at, ldv.vitals_at) DESC NULLS LAST
    `, [doctorId, parseInt(limit), parseInt(offset)]);

    const critical = patients.filter(p => p.risk_level === 'critical').length;
    const high     = patients.filter(p => p.risk_level === 'high').length;
    const withData = patients.filter(p => p.last_reading).length;

    res.json({
      success: true,
      patients,
      total: patients.length,
      healthMonitoring: { active: withData, critical, high, low: patients.length - critical - high },
      pagination: { limit: parseInt(limit), offset: parseInt(offset), total: patients.length }
    });
  } catch (error) {
    console.error('[health-monitoring] patients error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch health monitoring patients', error: error.message });
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
    const { status, limit = 100 } = req.query;
    const statusFilter = status ? `AND ewa.resolved = ${status === 'resolved' ? 'TRUE' : 'FALSE'}` : '';

    // Real alerts: early_warning_alerts for doctor's patients + wearable alerts from last 24h
    const { rows: alerts } = await pool.query(`
      WITH doc_patients AS (
        SELECT DISTINCT "patientId" AS pid FROM appointments WHERE "doctorId" = $1 AND "patientId" IS NOT NULL
        UNION
        SELECT DISTINCT "userId" AS pid FROM appointments WHERE "doctorId" = $1 AND "userId" IS NOT NULL
      )
      SELECT
        'ewa_' || ewa.id                                 AS id,
        ewa.patient_id,
        u."firstName" || ' ' || u."lastName"             AS patient_name,
        u."phoneNumber"                                  AS patient_phone,
        ewa.alert_type                                   AS type,
        ewa.severity,
        COALESCE(ewa.alert_type, 'vitals') || ' alert — NEWS2 score: ' || COALESCE(ewa.news2_score::text,'?') AS message,
        CASE WHEN ewa.resolved THEN 'resolved' ELSE 'active' END AS status,
        ewa.triggered_at                                 AS created_at,
        ewa.acknowledged_at                              AS updated_at,
        ewa.news2_score,
        ewa.resolved
      FROM early_warning_alerts ewa
      JOIN users u ON u.id = ewa.patient_id
      WHERE ewa.patient_id IN (SELECT pid FROM doc_patients)
        ${statusFilter}

      UNION ALL

      SELECT
        'hr_' || hr.id                                   AS id,
        hr.user_id                                       AS patient_id,
        u."firstName" || ' ' || u."lastName"             AS patient_name,
        u."phoneNumber"                                  AS patient_phone,
        hr.reading_type                                  AS type,
        hr.alert_severity                                AS severity,
        hr.reading_type || ' reading out of range'       AS message,
        'active'                                         AS status,
        hr.recorded_at                                   AS created_at,
        hr.recorded_at                                   AS updated_at,
        NULL                                             AS news2_score,
        FALSE                                            AS resolved
      FROM health_readings hr
      JOIN users u ON u.id = hr.user_id
      WHERE hr.user_id IN (SELECT pid FROM doc_patients)
        AND hr.alert_triggered = TRUE
        AND hr.recorded_at >= NOW() - INTERVAL '24 hours'
        ${status === 'resolved' ? 'AND FALSE' : ''}

      ORDER BY
        CASE severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'warning' THEN 3 ELSE 4 END,
        created_at DESC
      LIMIT $2
    `, [doctorId, parseInt(limit)]);

    res.json({ success: true, count: alerts.length, alerts });
  } catch (error) {
    console.error('[vital-alerts] error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch vital alerts', error: error.message });
  }
});

router.put('/vital-alerts/:id/acknowledge', authDoctor, async (req, res) => {
  try {
    if (req.params.id.startsWith('ewa_')) {
      const alertId = parseInt(req.params.id.replace('ewa_', ''));
      await pool.query(
        `UPDATE early_warning_alerts SET acknowledged_by=$1, acknowledged_at=NOW() WHERE id=$2`,
        [req.doctor.id, alertId]
      );
    }
    res.json({ success: true, message: 'Alert acknowledged', id: req.params.id, status: 'acknowledged' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.put('/vital-alerts/:id/resolve', authDoctor, async (req, res) => {
  try {
    if (req.params.id.startsWith('ewa_')) {
      const alertId = parseInt(req.params.id.replace('ewa_', ''));
      await pool.query(
        `UPDATE early_warning_alerts SET resolved=TRUE, acknowledged_by=$1, acknowledged_at=NOW() WHERE id=$2`,
        [req.doctor.id, alertId]
      );
    }
    res.json({ success: true, message: 'Alert resolved', id: req.params.id, status: 'resolved' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.put('/vital-alerts/:id/dismiss', authDoctor, async (req, res) => {
  res.json({ success: true, message: 'Alert dismissed', id: req.params.id, status: 'dismissed' });
});

// GET /api/doctors/my-patients/:patientId/latest-vitals  — unified vitals for one patient
router.get('/my-patients/:patientId/latest-vitals', authDoctor, async (req, res) => {
  try {
    const doctorId = req.doctor.id;
    const patientId = parseInt(req.params.patientId);

    const { rows: [vitals] } = await pool.query(`
      WITH wearable_latest AS (
        SELECT
          (current_metrics->>'heartRate')::numeric         AS hr,
          current_metrics->>'bloodPressure'                AS bp,
          (current_metrics->>'oxygenSaturation')::numeric  AS spo2,
          (current_metrics->>'temperature')::numeric       AS temp,
          last_sync                                        AS ts
        FROM wearables
        WHERE user_id = $1 AND last_sync IS NOT NULL
        ORDER BY last_sync DESC LIMIT 1
      ),
      reading_glucose AS (
        SELECT (value->>'value')::numeric AS glucose, recorded_at AS ts
        FROM health_readings
        WHERE user_id = $1 AND reading_type = 'blood_glucose'
        ORDER BY recorded_at DESC LIMIT 1
      ),
      reading_hr AS (
        SELECT (value->>'value')::numeric AS hr, recorded_at AS ts
        FROM health_readings
        WHERE user_id = $1 AND reading_type IN ('heart_rate','heartRate')
        ORDER BY recorded_at DESC LIMIT 1
      ),
      reading_bp AS (
        SELECT value->>'systolic' || '/' || value->>'diastolic' AS bp, recorded_at AS ts
        FROM health_readings
        WHERE user_id = $1 AND reading_type IN ('blood_pressure','bloodPressure')
        ORDER BY recorded_at DESC LIMIT 1
      ),
      reading_spo2 AS (
        SELECT (value->>'value')::numeric AS spo2, recorded_at AS ts
        FROM health_readings
        WHERE user_id = $1 AND reading_type IN ('spo2','oxygen_saturation')
        ORDER BY recorded_at DESC LIMIT 1
      ),
      doctor_vitals AS (
        SELECT heart_rate, bp, spo2, temperature, blood_glucose, recorded_at AS ts
        FROM patient_vitals WHERE patient_id = $1
        ORDER BY recorded_at DESC LIMIT 1
      ),
      activity AS (
        SELECT heart_rate, blood_sugar, steps, sleep_hours, date
        FROM daily_activity WHERE user_id = $1
        ORDER BY date DESC LIMIT 1
      ),
      alerts_24h AS (
        SELECT COUNT(*) AS cnt, MAX(alert_severity) AS max_sev
        FROM health_readings
        WHERE user_id = $1 AND alert_triggered = TRUE AND recorded_at >= NOW() - INTERVAL '24h'
      )
      SELECT
        COALESCE(wl.hr, rhr.hr, dv.heart_rate, a.heart_rate)        AS heart_rate,
        COALESCE(wl.bp, rbp.bp, dv.bp)                              AS blood_pressure,
        COALESCE(wl.spo2, rs.spo2, dv.spo2)                        AS oxygen_saturation,
        COALESCE(wl.temp, dv.temperature)                           AS temperature,
        COALESCE(rg.glucose, dv.blood_glucose, a.blood_sugar)       AS blood_glucose,
        a.steps, a.sleep_hours,
        GREATEST(wl.ts, dv.ts)                                      AS last_reading,
        (wl.ts IS NOT NULL)                                          AS from_wearable,
        al.cnt::int                                                  AS alerts_24h,
        al.max_sev
      FROM (SELECT 1) x
      LEFT JOIN wearable_latest wl ON TRUE
      LEFT JOIN reading_glucose rg  ON TRUE
      LEFT JOIN reading_hr      rhr ON TRUE
      LEFT JOIN reading_bp      rbp ON TRUE
      LEFT JOIN reading_spo2    rs  ON TRUE
      LEFT JOIN doctor_vitals   dv  ON TRUE
      LEFT JOIN activity        a   ON TRUE
      LEFT JOIN alerts_24h      al  ON TRUE
    `, [patientId]);

    // Also get trend (last 7 readings) from health_readings
    const { rows: trend } = await pool.query(`
      SELECT reading_type, (value->>'value')::numeric AS val, recorded_at
      FROM health_readings
      WHERE user_id = $1
        AND reading_type IN ('heart_rate','heartRate','blood_pressure','spo2','oxygen_saturation','blood_glucose','temperature')
        AND recorded_at >= NOW() - INTERVAL '7 days'
      ORDER BY recorded_at DESC LIMIT 50
    `, [patientId]);

    res.json({ success: true, data: { vitals, trend } });
  } catch (err) {
    console.error('[latest-vitals] error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
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

    // IDOR guard
    const hasRelationship = await hasDoctorPatientRelationship(doctorId, patientId);
    if (!hasRelationship) {
      return res.status(403).json({ success: false, message: 'No appointment relationship with this patient' });
    }

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

// Alias: GET /api/doctors/patients/:patientId → same handler as /my-patients/:patientId/profile
// Documented in DOCTOR_APP_API_REFERENCE.md §8.4 but the canonical URL uses /my-patients/
router.get('/patients/:patientId', authDoctor, (req, res, next) => {
  req.params.patientId = req.params.patientId;
  // Re-dispatch to the my-patients profile handler by forwarding the request
  req.url = `/my-patients/${req.params.patientId}/profile`;
  router.handle(req, res, next);
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

    // IDOR guard
    const hasRelationship = await hasDoctorPatientRelationship(req.doctor.id, patientId);
    if (!hasRelationship) {
      return res.status(403).json({ success: false, message: 'No appointment relationship with this patient' });
    }

    const { rows } = await pool.query(
      `SELECT * FROM patient_vitals WHERE patient_id = $1 ORDER BY recorded_at DESC LIMIT $2`,
      [parseInt(patientId), parseInt(limit)]
    );
    const vitals = rows;

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

export default router;
