import express from 'express';
import { body } from 'express-validator';
import Nurse from '../models/nurse.model.intelligent.js';
import { buildLiveKitJoinData } from '../utils/videoProvider.js';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import Medication from '../models/medication.model.intelligent.js';
import PatientNote from '../models/patientNote.model.intelligent.js';
import VitalsRecord from '../models/vitalsRecord.model.intelligent.js';
import { JWT_CONFIG } from '../config/auth.config.js';
import { authLimiter } from '../middleware/rateLimiter.middleware.js';
import { auditLoginAttempt } from '../middleware/audit.middleware.js';
import userModel from '../models/user.model.intelligent.js';
import { Op } from 'sequelize';
import pool from '../db/pgPool.js';
import { Appointment, Doctor } from '../models/index.js';

const router = express.Router();

// Nurse authentication middleware
export const authNurse = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'No authorization token provided'
      });
    }

    const decoded = jwt.verify(token, JWT_CONFIG.SECRET);

    if (decoded.role !== 'nurse') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Nurse privileges required.'
      });
    }

    req.nurse = {
      id: decoded.id,
      email: decoded.email,
      role: decoded.role
    };

    next();
  } catch (error) {
    console.error('Nurse authentication error:', error);

    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expired. Please login again.'
      });
    }

    return res.status(401).json({
      success: false,
      message: 'Invalid or expired token'
    });
  }
};

// Nurse login endpoint
router.post('/login', authLimiter, [
  body('email').isEmail().withMessage('Must be a valid email'),
  body('password').notEmpty().withMessage('Password is required'),
], async (req, res) => {
  console.log('🟢 [Nurse Login] Request received');
  try {
    const { email, password } = req.body;
    console.log('🟢 [Nurse Login] Email:', email);

    // Hardcoded credentials removed for security - all nurses must be in database

    // Check database for nurse
    console.log('🟢 [Nurse Login] Querying database...');
    const normalizedEmail = String(email).toLowerCase();
    let nurse;
    try {
      nurse = await Nurse.findOne({
        where: {
          email: normalizedEmail
        }
      });
      console.log('🟢 [Nurse Login] Query completed');
    } catch (queryError) {
      console.error('❌ Nurse DB query error:', queryError.message);
      throw queryError;
    }
    console.log('🟢 [Nurse Login] Nurse found:', !!nurse);

    if (!nurse) {
      await auditLoginAttempt(req, null, normalizedEmail, false, 'Nurse not found');
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    // Account status guards (status + isActive) — checked before password
    if (nurse.status && nurse.status !== 'active') {
      await auditLoginAttempt(req, nurse.id, normalizedEmail, false, `Nurse inactive: ${nurse.status}`);
      return res.status(403).json({ success: false, message: 'Nurse account is inactive or suspended' });
    }
    if (nurse.isActive === false) {
      await auditLoginAttempt(req, nurse.id, normalizedEmail, false, 'Nurse disabled (isActive=false)');
      return res.status(403).json({ success: false, message: 'Nurse account has been disabled' });
    }

    // Verify password
    if (!nurse.comparePassword) {
      return res.status(401).json({ success: false, message: 'Password verification not configured' });
    }
    const isPasswordValid = await nurse.comparePassword(password);
    if (!isPasswordValid) {
      await auditLoginAttempt(req, nurse.id, normalizedEmail, false, 'Invalid password');
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    if (nurse.update) await nurse.update({ lastLoginAt: new Date() });

    // Issue token pair with JTI (enables revocation + device fingerprint limit)
    const { issuePortalTokenPair } = await import('../services/token-revocation.service.js');
    const deviceFp = req.headers['x-device-fingerprint'] || null;
    const { accessToken: token } = await issuePortalTokenPair(
      { id: nurse.id, nurseId: nurse.id, email: nurse.email, role: 'nurse', userType: 'nurse' },
      { portal: 'nurse', deviceFp }
    );

    await auditLoginAttempt(req, nurse.id, normalizedEmail, true);

    res.status(200).json({
      success: true,
      message: 'Nurse login successful',
      token,
      nurse: {
        id: nurse.id,
        email: nurse.email,
        firstName: nurse.firstName,
        lastName: nurse.lastName,
        department: nurse.department,
        specialty: nurse.specialty,
        shift: nurse.shift,
        licenseNumber: nurse.licenseNumber,
        assignedWard: nurse.assignedWard,
        permissions: nurse.permissions || [],
        phoneNumber: nurse.phoneNumber
      }
    });
  } catch (error) {
    console.error('❌ NURSE LOGIN ERROR:', error);
    console.error('❌ Error message:', error.message);
    console.error('❌ Error stack:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Server error during login',
      error: error.message
    });
  }
});

// Get nurse profile
router.get('/profile', authNurse, async (req, res) => {
  try {
    const nurse = await Nurse.findByPk(req.nurse.id, {
      attributes: { exclude: ['password'] }
    });

    if (!nurse) {
      return res.status(404).json({ success: false, message: 'Nurse not found' });
    }

    res.status(200).json({ success: true, nurse });
  } catch (error) {
    console.error('Get nurse profile error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

// Update nurse profile
router.put('/profile', authNurse, async (req, res) => {
  try {
    const { firstName, lastName, phoneNumber, emergencyContact } = req.body;

    const nurse = await Nurse.findByPk(req.nurse.id);

    if (!nurse) {
      return res.status(404).json({
        success: false,
        message: 'Nurse not found'
      });
    }

    await nurse.update({
      firstName,
      lastName,
      phoneNumber,
      emergencyContact
    });

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      nurse: {
        id: nurse.id,
        firstName: nurse.firstName,
        lastName: nurse.lastName,
        email: nurse.email,
        phoneNumber: nurse.phoneNumber,
        emergencyContact: nurse.emergencyContact
      }
    });
  } catch (error) {
    console.error('Update nurse profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// Get nurse patient list
router.get('/patients', authNurse, async (req, res) => {
  try {
    const patients = await userModel.findAll({
      where: {
        role: { [Op.in]: ['patient', 'user'] },
        status: 'active'
      },
      attributes: { exclude: ['password'] },
      order: [['createdAt', 'DESC']],
      limit: 100
    });

    res.status(200).json({
      success: true,
      patients,
      count: patients.length
    });
  } catch (error) {
    console.error('Get patients error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// Record patient vitals
router.post('/vitals', authNurse, async (req, res) => {
  try {
    const { patientId, vitals } = req.body;

    // Validate and convert patientId to integer
    if (!patientId) {
      return res.status(400).json({
        success: false,
        message: 'Patient ID is required'
      });
    }

    const parsedPatientId = parseInt(patientId, 10);
    if (isNaN(parsedPatientId)) {
      return res.status(400).json({
        success: false,
        message: 'Patient ID must be a valid number'
      });
    }

    const patient = await userModel.findByPk(parsedPatientId, { attributes: ['id'] });
    if (!patient) {
      return res.status(404).json({
        success: false,
        message: 'Patient not found'
      });
    }

    // Validate vitals object exists
    if (!vitals || typeof vitals !== 'object') {
      return res.status(400).json({
        success: false,
        message: 'Vitals data is required'
      });
    }

    // Parse blood pressure if provided as "120/80" format
    let systolic = null;
    let diastolic = null;
    if (vitals?.bp || vitals?.bloodPressure) {
      const bp = vitals?.bp ?? vitals?.bloodPressure;
      if (typeof bp === 'string' && bp.includes('/')) {
        const [sys, dia] = bp.split('/');
        systolic = parseInt(sys, 10);
        diastolic = parseInt(dia, 10);
      } else if (vitals?.bloodPressureSystolic && vitals?.bloodPressureDiastolic) {
        systolic = vitals.bloodPressureSystolic;
        diastolic = vitals.bloodPressureDiastolic;
      }
    }

    const recordedById = Number.isFinite(Number(req.nurse.id)) ? Number(req.nurse.id) : null;
    const record = await VitalsRecord.create({
      userId: parsedPatientId,
      recordedBy: recordedById,
      temperature: vitals?.temperature ?? null,
      heartRate: vitals?.pulse ?? vitals?.heartRate ?? null,
      bloodPressureSystolic: systolic,
      bloodPressureDiastolic: diastolic,
      oxygenSaturation: vitals?.oxygenSaturation ?? vitals?.spO2 ?? null,
      weight: vitals?.weight ?? null,
      bloodSugar: vitals?.bloodSugar ?? null,
      respiratoryRate: vitals?.respiratoryRate ?? null,
      notes: vitals?.notes ?? null,
      source: 'nurse',
      recordedAt: new Date(),
      metadata: {
        nurseId: req.nurse.id,
        recordedByRole: 'nurse'
      }
    });

    res.status(200).json({
      success: true,
      message: 'Vitals recorded successfully',
      data: record
    });
  } catch (error) {
    console.error('Record vitals error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// Get today's vitals recorded by nurse
router.get('/vitals/today', authNurse, async (req, res) => {
  try {
    const { Op } = await import('sequelize');
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const records = await VitalsRecord.findAll({
      where: {
        recordedBy: req.nurse.id,
        recordedAt: { [Op.gte]: startOfDay.toISOString() }
      },
      order: [['recordedAt', 'DESC']],
      limit: 50
    });

    res.status(200).json({ success: true, records });
  } catch (error) {
    console.error('Get today vitals error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

// Record medication administration
router.post('/medications', authNurse, async (req, res) => {
  try {
    const { patientId, medication, dosage, route, frequency, notes } = req.body;
    const record = await Medication.create({
      name: medication,
      dosage,
      route: route || 'oral',
      frequency,
      instructions: notes,
      isActive: true,
      startDate: new Date(),
      metadata: {
        administeredBy: req.nurse.id,
        administeredByRole: 'nurse',
        patientId,
        administeredAt: new Date().toISOString()
      }
    });
    res.status(200).json({ success: true, message: 'Medication saved', data: record });
  } catch (error) {
    console.error('Save medication error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

// Get medications for a patient
router.get('/medications/:patientId', authNurse, async (req, res) => {
  try {
    const { patientId } = req.params;
    const { Op } = await import('sequelize');
    const records = await Medication.findAll({
      where: {
        'metadata.patientId': { [Op.eq]: patientId }
      },
      order: [['createdAt', 'DESC']],
      limit: 100
    });
    res.status(200).json({ success: true, records });
  } catch (error) {
    console.error('Get medications error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

// Record patient note
router.post('/notes', authNurse, async (req, res) => {
  try {
    const { patientId, note, category, title } = req.body;
    const parsedPatientId = Number(patientId);
    if (!Number.isFinite(parsedPatientId)) {
      return res.status(400).json({ success: false, message: 'Patient ID must be a valid number' });
    }

    const patient = await userModel.findByPk(parsedPatientId, { attributes: ['id'] });
    if (!patient) {
      return res.status(404).json({ success: false, message: 'Patient not found' });
    }

    const record = await PatientNote.create({
      patientId: parsedPatientId,
      type: category || 'general',
      title: title || 'Nurse Note',
      content: note,
      metadata: {
        nurseId: req.nurse.id,
        recordedByRole: 'nurse'
      }
    });
    res.status(200).json({ success: true, message: 'Note saved', data: record });
  } catch (error) {
    console.error('Save note error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

// Get notes for a patient
router.get('/notes/:patientId', authNurse, async (req, res) => {
  try {
    const { patientId } = req.params;
    const records = await PatientNote.findAll({
      where: { patientId },
      order: [['createdAt', 'DESC']],
      limit: 100
    });
    res.status(200).json({ success: true, records });
  } catch (error) {
    console.error('Get notes error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

// Recent activity across vitals, medications, and notes for this nurse
router.get('/activity/recent', authNurse, async (req, res) => {
  try {
    const nurseId = req.nurse.id;
    const { Op } = await import('sequelize');
    // PatientNote has no nurseId column — the /notes POST handler above
    // already stores nurse attribution under metadata.nurseId (JSONB), same
    // pattern as Medication's metadata.administeredBy. Match that here
    // instead of a top-level column that doesn't exist.
    // Each query is independently fault-tolerant: some legacy rows have
    // non-numeric values (e.g. "nurse_001") in these JSONB fields from
    // older seed/demo data, which makes Postgres's implicit cast for the
    // comparison throw — one bad legacy row shouldn't 500 the whole feed.
    const [vitals, meds, notes] = await Promise.all([
      VitalsRecord.findAll({ where: { recordedBy: nurseId }, order: [['recordedAt', 'DESC']], limit: 20 }).catch((err) => {
        console.warn('[nurse/activity/recent] vitals query failed:', err.message);
        return [];
      }),
      Medication.findAll({
        where: {
          'metadata.administeredBy': { [Op.eq]: nurseId }
        },
        order: [['createdAt', 'DESC']],
        limit: 20
      }).catch((err) => {
        console.warn('[nurse/activity/recent] medication query failed:', err.message);
        return [];
      }),
      PatientNote.findAll({
        where: {
          'metadata.nurseId': { [Op.eq]: nurseId }
        },
        order: [['createdAt', 'DESC']],
        limit: 20
      }).catch((err) => {
        console.warn('[nurse/activity/recent] notes query failed:', err.message);
        return [];
      }),
    ]);

    const items = [
      ...vitals.map(v => ({
        type: 'Vitals',
        patientId: v.userId,
        timestamp: v.recordedAt,
        summary: `BP: ${v.bloodPressureSystolic || '?'}/${v.bloodPressureDiastolic || '?'}, HR: ${v.heartRate || 'N/A'}, Temp: ${v.temperature || 'N/A'}`,
      })),
      ...meds.map(m => ({
        type: 'Medication',
        patientId: m.metadata?.patientId,
        timestamp: m.metadata?.administeredAt || m.createdAt,
        summary: `${m.name} ${m.dosage || ''} ${m.route ? '(' + m.route + ')' : ''}`.trim(),
      })),
      ...notes.map(n => ({
        type: 'Note',
        patientId: n.patientId,
        timestamp: n.createdAt,
        summary: (n.content || '').slice(0, 80)
      })),
    ].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 20);

    res.status(200).json({ success: true, items });
  } catch (error) {
    console.error('Get recent activity error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

// Get shift schedule
router.get('/schedule', authNurse, async (req, res) => {
  try {
    // Mock schedule data
    const schedule = {
      currentShift: 'Morning',
      shiftStart: '07:00',
      shiftEnd: '15:00',
      assignedWard: 'Emergency Ward',
      upcomingShifts: [
        { date: '2025-11-25', shift: 'Morning', hours: '07:00-15:00' },
        { date: '2025-11-26', shift: 'Morning', hours: '07:00-15:00' },
        { date: '2025-11-27', shift: 'Off', hours: '-' }
      ]
    };

    res.status(200).json({
      success: true,
      schedule
    });
  } catch (error) {
    console.error('Get schedule error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

/**
 * POST /api/nurse/book
 * Nurse books a doctor appointment on behalf of a patient.
 */
router.post('/book', authNurse, async (req, res) => {
  try {
    const {
      doctorId,
      patientName,
      patientPhone,
      appointmentDate,
      appointmentTime,
      consultationType = 'in-person',
      symptoms = [],
    } = req.body;

    if (!doctorId || !patientName || !patientPhone || !appointmentDate || !appointmentTime) {
      return res.status(400).json({
        success: false,
        message: 'doctorId, patientName, patientPhone, appointmentDate, and appointmentTime are required',
      });
    }

    // Resolve doctor name
    const doctor = await Doctor.findByPk(parseInt(doctorId));
    if (!doctor) {
      return res.status(404).json({ success: false, message: 'Doctor not found' });
    }
    const doctorName = `${doctor.firstName || ''} ${doctor.lastName || ''}`.trim() || doctor.email;

    const appointment = await Appointment.create({
      doctorId: doctor.id,
      doctorName,
      specialization: doctor.specialization || null,
      patientName: String(patientName).trim(),
      patientPhone: String(patientPhone).trim(),
      appointmentDate,
      appointmentTime,
      consultationType,
      symptoms: Array.isArray(symptoms) ? symptoms : (symptoms ? [symptoms] : []),
      status: 'scheduled',
      notes_json: { admin: `Booked by nurse ID ${req.nurse.id}` },
    });

    return res.status(201).json({
      success: true,
      message: 'Appointment booked successfully',
      appointment: {
        id: appointment.id,
        appointmentDate: appointment.appointmentDate,
        appointmentTime: appointment.appointmentTime,
        doctorName,
        patientName: appointment.patientName,
        consultationType: appointment.consultationType,
        status: appointment.status,
      },
    });
  } catch (error) {
    console.error('Nurse booking error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to book appointment',
      error: error.message,
    });
  }
});

// ── GET /api/nurse/chat/call-token?roomName=xxx ─────────────────────────────
// Generates a LiveKit token for a nurse to join an internal team call room.
router.get('/chat/call-token', authNurse, async (req, res) => {
  try {
    const { roomName } = req.query;
    if (!roomName || typeof roomName !== 'string') {
      return res.status(400).json({ success: false, message: 'roomName is required' });
    }
    const nurseId = parseInt(req.nurse.id, 10);
    const { rows } = await pool.query(
      'SELECT "firstName", "lastName", email FROM nurses WHERE id = $1',
      [nurseId]
    );
    const nurse = rows[0];
    const displayName = nurse
      ? `${nurse.firstName || ''} ${nurse.lastName || ''}`.trim() || nurse.email
      : 'Nurse';
    const livekitData = await buildLiveKitJoinData({
      meetingId: roomName,
      identity: `nurse-${nurseId}`,
      name: displayName,
    });
    return res.json({
      success: true,
      serverUrl: livekitData.serverUrl,
      token: livekitData.token,
      roomName,
    });
  } catch (err) {
    console.error('nurse call-token error', err);
    return res.status(500).json({ success: false, message: 'Failed to generate token' });
  }
});

export default router;

// ─── Nurse Chat (Nurse ↔ Doctor) ───────────────────────────────────────────

// GET /api/nurse/chat/contacts/doctors — list all doctors nurse can message
router.get('/chat/contacts/doctors', authNurse, async (req, res) => {
  const nurseId = parseInt(req.nurse.id, 10);
  try {
    const { rows } = await pool.query(`
      SELECT
        d.id,
        d."firstName" || ' ' || d."lastName" AS name,
        d."profileImage" AS avatar,
        d.email,
        d.specialization,
        (
          SELECT content FROM chat_messages
          WHERE "conversationId" = 'nurse_' || $1::text || '_doctor_' || d.id
          ORDER BY "createdAt" DESC LIMIT 1
        ) AS "lastMessage",
        (
          SELECT "createdAt" FROM chat_messages
          WHERE "conversationId" = 'nurse_' || $1::text || '_doctor_' || d.id
          ORDER BY "createdAt" DESC LIMIT 1
        ) AS "lastMessageAt",
        (
          SELECT COUNT(*) FROM chat_messages
          WHERE "conversationId" = 'nurse_' || $1::text || '_doctor_' || d.id
            AND "recipientId" = $1::integer AND "recipientType" = 'nurse'
            AND status != 'read'
        )::int AS "unreadCount"
      FROM doctors d
      ORDER BY "lastMessageAt" DESC NULLS LAST, name
      LIMIT 100
    `, [nurseId]);
    res.json({ success: true, contacts: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/nurse/chat/messages/:conversationId
router.get('/chat/messages/:conversationId', authNurse, async (req, res) => {
  const nurseId = parseInt(req.nurse.id, 10);
  const { conversationId } = req.params;
  const limit = Math.min(parseInt(req.query.limit || '50', 10), 200);
  const before = req.query.before;

  if (!conversationId.startsWith(`nurse_${nurseId}_doctor_`)) {
    return res.status(403).json({ error: 'Access denied to this conversation' });
  }

  try {
    const params = [conversationId, nurseId, limit];
    const beforeClause = before ? `AND m."createdAt" < $4` : '';
    if (before) params.push(before);

    const { rows } = await pool.query(`
      SELECT
        m.id, m."conversationId", m."senderId", m."senderType",
        m."recipientId", m."recipientType", m.content, m."messageType",
        m.attachments, m.status, m."createdAt"
      FROM chat_messages m
      WHERE m."conversationId" = $1
        AND (m."senderId" = $2 OR m."recipientId" = $2)
        ${beforeClause}
      ORDER BY m."createdAt" DESC
      LIMIT $3
    `, params);

    // Mark as read
    await pool.query(`
      UPDATE chat_messages
      SET status = 'read', "readAt" = NOW()
      WHERE "conversationId" = $1
        AND "recipientId" = $2 AND "recipientType" = 'nurse'
        AND status != 'read'
    `, [conversationId, nurseId]);

    res.json({ success: true, messages: rows.reverse() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/nurse/chat/messages
router.post('/chat/messages', authNurse, async (req, res) => {
  const nurseId = parseInt(req.nurse.id, 10);
  const { conversationId, recipientId, content, messageType = 'text' } = req.body;

  if (!conversationId || !recipientId || !content?.trim()) {
    return res.status(400).json({ error: 'conversationId, recipientId, content are required' });
  }

  const expectedConvId = `nurse_${nurseId}_doctor_${recipientId}`;
  if (conversationId !== expectedConvId) {
    return res.status(403).json({ error: 'Invalid conversationId' });
  }

  try {
    const { rows } = await pool.query(`
      INSERT INTO chat_messages
        ("conversationId", "senderId", "senderType", "recipientId", "recipientType",
         content, "messageType", status, "createdAt", "updatedAt")
      VALUES ($1, $2, 'nurse', $3, 'doctor', $4, $5, 'sent', NOW(), NOW())
      RETURNING *
    `, [conversationId, nurseId, recipientId, content.trim(), messageType]);

    res.json({ success: true, message: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
