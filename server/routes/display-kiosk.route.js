import express from 'express';
import bcrypt from 'bcrypt';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { connectPostgres } from '../db/postgres.js';
import pool from '../db/pgPool.js';
import * as queue from '../services/hospital-queue.service.js';
import Appointment from '../models/postgres/appointment.model.postgres.js';
import emergencyTriageService from '../services/ai-emergency-triage.service.js';
import { buildLiveKitJoinData } from '../utils/videoProvider.js';
import { pushToZone } from '../services/display-sse-broker.service.js';
import { assessKioskLiveness } from '../services/kiosk-liveness.service.js';
import { parseAadhaarQr } from '../services/aadhaar-qr.service.js';
import { Op } from 'sequelize';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const KIOSK_UPLOAD_DIR = path.join(__dirname, '../../uploads/kiosk');

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

  const parsed = queue.parseKioskQrPayload(payload);

  if (parsed.type === 'appointment' && parsed.appointmentId) {
    try {
      const appt = await Appointment.findByPk(parsed.appointmentId);
      if (appt) {
        return res.json({
          success: true,
          parsed,
          nextStep: 'confirm-appointment',
          appointment: {
            id: appt.id,
            appointment_date: appt.appointmentDate,
            appointment_time: appt.appointmentTime,
            doctor_name: appt.doctorName,
            specialty: appt.specialization,
            patient_name: appt.patientName,
            status: appt.status,
          },
        });
      }
    } catch (_) {}
    return res.json({ success: true, parsed, nextStep: 'confirm-appointment', appointmentId: parsed.appointmentId });
  }
  if (parsed.type === 'walk-in') {
    return res.json({ success: true, parsed, nextStep: 'walk-in-register', department: parsed.department || 'opd' });
  }
  if (parsed.type === 'abha') {
    return res.json({ success: true, parsed, nextStep: 'abha-lookup', abhaHint: parsed.healthId?.slice(0, 32) });
  }
  if (parsed.type === 'token') {
    return res.json({ success: true, parsed, nextStep: 'token-lookup', token: parsed.token });
  }
  res.json({ success: true, parsed, nextStep: 'manual', raw: parsed.raw || payload.slice(0, 200) });
});

// POST /api/display/kiosk/parse-aadhaar-qr — decode the QR printed on an
// Aadhaar card into demographic fields to prefill walk-in registration.
// Body: { qrBytesBase64 } — the scanner's RAW bytes (not decoded text —
// Aadhaar's Secure QR is a binary/deflate payload and reinterpreting it as
// UTF-8 text corrupts it), base64-encoded for JSON transport.
// Never returns/logs the full Aadhaar number — only the last 4 digits.
router.post('/parse-aadhaar-qr', async (req, res) => {
  try {
    const { qrBytesBase64 } = req.body;
    if (!qrBytesBase64) {
      return res.status(400).json({ success: false, message: 'qrBytesBase64 required' });
    }
    let rawBytes;
    try {
      rawBytes = Buffer.from(qrBytesBase64, 'base64');
    } catch {
      return res.status(400).json({ success: false, message: 'Invalid base64 payload' });
    }
    const result = parseAadhaarQr(rawBytes);
    if (!result.success) return res.json(result);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: 'Could not process this QR code' });
  }
});

// POST /api/display/kiosk/register — walk-in new patient + queue token
router.post('/register', async (req, res) => {
  try {
    const {
      phone, firstName, lastName, dateOfBirth, gender,
      department, queueZone, doctorId, doctorName, chiefComplaint, consentVersion,
      photoKey, abhaId, notifyOptIn, notifyPhone,
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
      queueZone: queueZone || 'opd-waiting',
      patientId,
      patientName: `${firstName} ${lastName || ''}`.trim(),
      doctorId: doctorId || null,
      doctorName: doctorName || null,
      queueType: 'walk_in',
      chiefComplaint,
      consentVersion,
      metadata: {
        uhid,
        photoKey,
        abhaId,
        notifyOptIn: notifyOptIn === true || notifyOptIn === 'true',
        notifyPhone: notifyPhone || normalizedPhone,
      },
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

// POST /api/display/kiosk/er-triage — AI ESI triage + ER queue token + optional video (GAP-VIDEO-002)
router.post('/er-triage', async (req, res) => {
  try {
    const {
      symptoms,
      patientName,
      phone,
      painScale,
      age,
      gender,
      vitals,
      consentVersion,
      startVideo = true,
    } = req.body || {};

    if (!symptoms || String(symptoms).trim().length < 10) {
      return res.status(400).json({ success: false, message: 'symptoms required (min 10 chars)' });
    }
    if (!consentVersion) {
      return res.status(400).json({ success: false, message: 'consentVersion required' });
    }

    const triage = await emergencyTriageService.triage({
      symptoms: String(symptoms),
      vitals: vitals || {},
      painScale: painScale != null ? parseInt(painScale, 10) : null,
      age: age != null ? parseInt(age, 10) : null,
      gender,
    });

    if (triage.qualityGate?.blockers?.length) {
      return res.status(422).json({
        success: false,
        message: 'Triage requires immediate staff review — please alert the triage nurse.',
        triage,
      });
    }

    const esiLabel = `ESI-${triage.esiLevel}`;
    const entry = await queue.checkIn({
      organizationId: req.organizationId,
      department: 'er',
      queueZone: 'er-triage',
      patientName: patientName || 'ER Walk-in',
      queueType: triage.esiLevel <= 2 ? 'emergency' : 'urgent',
      triageLevel: esiLabel,
      chiefComplaint: String(symptoms).slice(0, 500),
      consentVersion,
      metadata: {
        phone: phone || null,
        esiLevel: triage.esiLevel,
        category: triage.category,
        ambulanceNeeded: triage.ambulanceNeeded,
        notifyOptIn: !!phone,
        notifyPhone: phone || null,
        source: 'er-triage-kiosk',
      },
    });

    let video = null;
    if (startVideo !== false) {
      const roomId = `er-triage-${entry.id}`;
      const join = await buildLiveKitJoinData({
        meetingId: roomId,
        identity: `er-patient-${entry.id}`,
        name: patientName || 'ER Patient',
      });
      pushToZone('er-triage', 'video_session_start', {
        roomId,
        sessionType: 'er-triage',
        bedId: entry.tokenNumber,
        join,
      });
      video = { roomId, join };
    }

    res.status(201).json({ success: true, triage, entry, video });
  } catch (e) {
    console.error('[kiosk] er-triage error:', e.message);
    res.status(500).json({ success: false, message: e.message });
  }
});

// POST /api/display/kiosk/liveness — GAP-KIOSK-007
router.post('/liveness', async (req, res) => {
  try {
    const { frames, idImageBase64 } = req.body;
    const result = assessKioskLiveness({ frames, idImageBase64 });
    if (!result.passed) {
      return res.status(422).json({ success: false, ...result });
    }
    res.json({ success: true, ...result });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// GET /api/display/kiosk/wayfinding — GAP-HOS-003 (text directions)
router.post('/wayfinding', async (req, res) => {
  try {
    const { query, language = 'en' } = req.body;
    if (!query || String(query).trim().length < 3) {
      return res.status(400).json({ success: false, message: 'query required' });
    }
    const q = String(query).toLowerCase();
    const destinations = [
      { keys: ['opd', 'doctor', 'consult'], direction: 'Level 1 → OPD corridor → follow queue board tokens', zone: 'opd' },
      { keys: ['lab', 'blood test'], direction: 'Level 1 → Diagnostics wing → Lab collection counter', zone: 'lab' },
      { keys: ['pharmacy', 'medicine'], direction: 'Ground floor → Pharmacy counter near exit', zone: 'pharmacy' },
      { keys: ['er', 'emergency'], direction: 'Ground floor → Red ER entrance (24×7)', zone: 'er' },
      { keys: ['radiology', 'x-ray', 'scan'], direction: 'Level 1 → Imaging suite → RIS desk', zone: 'ris' },
      { keys: ['billing', 'insurance'], direction: 'Level 1 → Front desk → Insurance & billing counter', zone: 'billing' },
    ];
    const match = destinations.find((d) => d.keys.some((k) => q.includes(k)));
    res.json({
      success: true,
      query,
      language,
      direction: match?.direction || 'Please proceed to the main reception desk for assistance.',
      zone: match?.zone || 'lobby',
      aiAssisted: true,
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// POST /api/display/kiosk/photo — patient photo capture (kiosk camera)
router.post('/photo', async (req, res) => {
  try {
    const file = req.files?.photo;
    if (!file) return res.status(400).json({ success: false, message: 'photo file required' });
    fs.mkdirSync(KIOSK_UPLOAD_DIR, { recursive: true });
    const ext = path.extname(file.name || '') || '.jpg';
    const filename = `kiosk-${Date.now()}${ext}`;
    await file.mv(path.join(KIOSK_UPLOAD_DIR, filename));
    res.json({ success: true, photoKey: filename, url: `/uploads/kiosk/${filename}` });
  } catch (e) {
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
