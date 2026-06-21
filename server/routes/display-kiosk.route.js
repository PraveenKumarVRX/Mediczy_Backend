import express from 'express';
import bcrypt from 'bcryptjs';
import { connectPostgres } from '../db/postgres.js';
import pool from '../db/pgPool.js';
import * as queue from '../services/hospital-queue.service.js';
import Appointment from '../models/postgres/appointment.model.postgres.js';
import { Op } from 'sequelize';

const router = express.Router();

async function safeQueryOne(sql, params = []) {
  try {
    const db = await connectPostgres();
    const result = await db.query(sql, params);
    return result.rows?.[0] || null;
  } catch (_) {
    return null;
  }
}

async function deviceAuth(req, res, next) {
  const token = req.headers['x-device-token'] || req.query.deviceToken;
  if (!token) {
    req.displayDevice = { organization_id: parseInt(process.env.HOSPITAL_DEFAULT_ORG_ID || '1', 10) };
    return next();
  }
  const device = await safeQueryOne(
    'SELECT * FROM display_devices WHERE device_token=$1 AND active=true',
    [token]
  );
  if (!device) return res.status(401).json({ success: false, message: 'Unknown device token' });
  req.displayDevice = device;
  const config = typeof device.config === 'object' ? device.config : {};
  req.organizationId = config.organization_id || parseInt(process.env.HOSPITAL_DEFAULT_ORG_ID || '1', 10);
  next();
}

router.use(deviceAuth);

// POST /api/display/kiosk/parse-qr
router.post('/parse-qr', async (req, res) => {
  const { payload } = req.body;
  if (!payload) return res.status(400).json({ success: false, message: 'payload required' });

  let parsed;
  try {
    parsed = payload.startsWith('{') ? JSON.parse(payload) : null;
  } catch (_) {
    parsed = null;
  }

  if (parsed?.type === 'appointment' && parsed.id) {
    return res.json({ success: true, nextStep: 'confirm-appointment', appointmentId: parsed.id });
  }
  if (parsed?.type === 'walk-in' || parsed?.type === 'register') {
    return res.json({ success: true, nextStep: 'walk-in-register', department: parsed.dept || 'opd' });
  }
  if (payload.includes('abha') || /^[\d-]{10,}$/.test(payload)) {
    return res.json({ success: true, nextStep: 'abha-lookup', abhaHint: payload.slice(0, 32) });
  }
  if (/^A-\d+/i.test(payload)) {
    return res.json({ success: true, nextStep: 'token-lookup', token: payload });
  }

  res.json({ success: true, nextStep: 'manual', raw: payload.slice(0, 200) });
});

// POST /api/display/kiosk/register — walk-in new patient + queue token
router.post('/register', async (req, res) => {
  try {
    const {
      phone, firstName, lastName, dateOfBirth, gender,
      department, queueZone, doctorId, doctorName, chiefComplaint, consentVersion,
      photoKey, abhaId,
    } = req.body;

    if (!phone || !firstName) {
      return res.status(400).json({ success: false, message: 'phone and firstName required' });
    }

    const orgId = req.organizationId;
    const normalizedPhone = String(phone).replace(/\D/g, '').slice(-10);

    let patientId;
    const existing = await pool.query(
      `SELECT id, "firstName", "lastName" FROM users WHERE "phoneNumber" LIKE $1 LIMIT 1`,
      [`%${normalizedPhone}`]
    );

    if (existing.rows[0]) {
      patientId = existing.rows[0].id;
    } else {
      const email = `kiosk+${normalizedPhone}@patient.mediqzy.local`;
      const hash = await bcrypt.hash(`kiosk-${normalizedPhone}-${Date.now()}`, 10);
      const ins = await pool.query(
        `INSERT INTO users ("firstName", "lastName", email, password, "phoneNumber", "dateOfBirth", gender, status, "emailVerified", role, metadata)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'active',true,'user',$8)
         RETURNING id`,
        [
          firstName, lastName || '', email, hash, normalizedPhone,
          dateOfBirth || '1990-01-01', gender || 'other',
          JSON.stringify({ uhidPending: true, abhaId: abhaId || null, photoKey: photoKey || null, source: 'kiosk' }),
        ]
      );
      patientId = ins.rows[0].id;
    }

    const uhid = await queue.allocateUhid(orgId);
    await pool.query(
      `UPDATE users SET metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb WHERE id = $1`,
      [patientId, JSON.stringify({ uhid, registeredVia: 'kiosk', consentVersion })]
    );

    const entry = await queue.checkIn({
      organizationId: orgId,
      department: department || 'opd',
      queueZone: queueZone || 'OPD-MAIN',
      patientId,
      patientName: `${firstName} ${lastName || ''}`.trim(),
      doctorId: doctorId || null,
      doctorName: doctorName || null,
      queueType: 'walk_in',
      chiefComplaint,
      consentVersion,
      metadata: { uhid, photoKey, abhaId },
    });

    res.status(201).json({
      success: true,
      patientId,
      uhid,
      entry,
      token: entry,
      eReceiptQr: JSON.stringify({ uhid, token: entry.tokenNumber, date: new Date().toISOString().slice(0, 10) }),
    });
  } catch (e) {
    console.error('[kiosk] register error:', e.message);
    res.status(500).json({ success: false, message: e.message });
  }
});

// POST /api/display/kiosk/check-in-from-appointment
router.post('/check-in-from-appointment', async (req, res) => {
  try {
    const { appointmentId, phone } = req.body;
    if (!appointmentId) return res.status(400).json({ success: false, message: 'appointmentId required' });

    const appt = await Appointment.findByPk(appointmentId);
    if (!appt) return res.status(404).json({ success: false, message: 'Appointment not found' });

    const entry = await queue.checkIn({
      organizationId: appt.organization_id || req.organizationId,
      department: 'opd',
      queueZone: 'OPD-MAIN',
      patientId: appt.userId,
      patientName: appt.patientName,
      appointmentId: appt.id,
      doctorId: appt.doctorId,
      doctorName: appt.doctorName,
      queueType: 'scheduled',
      priorityScore: 60,
    });

    await appt.update({ status: 'confirmed' });

    res.json({ success: true, entry, token: entry });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// GET /api/display/kiosk/appointments-by-phone
router.post('/appointments-by-phone', async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ success: false, message: 'phone required' });
    const normalized = String(phone).replace(/\D/g, '').slice(-10);
    const today = new Date().toISOString().slice(0, 10);

    const appointments = await Appointment.findAll({
      where: {
        patientPhone: { [Op.like]: `%${normalized}` },
        appointmentDate: today,
        status: { [Op.in]: ['pending', 'accepted', 'scheduled', 'confirmed'] },
      },
      order: [['appointmentTime', 'ASC']],
      limit: 5,
    });

    res.json({
      success: true,
      live: true,
      appointments: appointments.map((a) => ({
        id: a.id,
        appointment_date: a.appointmentDate,
        appointment_time: a.appointmentTime,
        doctor_name: a.doctorName,
        specialty: a.specialization,
        patient_name: a.patientName,
        status: a.status,
      })),
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

export default router;
