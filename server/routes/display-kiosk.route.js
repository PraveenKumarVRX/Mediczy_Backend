import express from 'express';
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
import { parseAadhaarQrInput } from '../services/aadhaar-qr.service.js';
import { decodeAadhaarFromImageBytes } from '../services/aadhaar-image-decode.service.js';
import { requireDisplayDevice } from '../middleware/authDisplayDevice.middleware.js';
import {
  createRegistrationInvite,
  getInviteStatusForKiosk,
  registerWalkInPatient,
  ensureKioskRegistrationTables,
} from '../services/kiosk-registration.service.js';
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

// P0: all kiosk mutations require x-device-token; org bound from device registry
router.use(requireDisplayDevice);

ensureKioskRegistrationTables().catch((e) =>
  console.warn('[kiosk] invite tables:', e.message)
);

/**
 * GET /api/display/kiosk/notify-health
 * Device-auth: is the kiosk WhatsApp template wired on this API process?
 */
router.get('/notify-health', async (req, res) => {
  try {
    const wa = (await import('../services/whatsapp-production.service.js')).default;
    const status = wa?.getTemplateStatus?.() || {};
    res.json({
      success: true,
      whatsappConfigured: !!wa?.twilioConfigured,
      kioskRegisterTemplate: !!status.kioskRegister,
      kioskRegisterStyle: status.kioskRegisterStyle || null,
      kioskRegisterSid: status.kioskRegisterSid
        ? `${String(status.kioskRegisterSid).slice(0, 6)}…`
        : null,
      smsEnabled: String(process.env.QUEUE_NOTIFY_SMS ?? 'true').toLowerCase() !== 'false',
      publicAppUrl: (
        process.env.PUBLIC_APP_URL ||
        process.env.FRONTEND_URL ||
        process.env.CLIENT_URL ||
        ''
      ).replace(/\/$/, '') || null,
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

/**
 * POST /api/display/kiosk/registration-invite
 * Body: { phone, hospitalName? } — sends WhatsApp/SMS secure registration link
 */
router.post('/registration-invite', async (req, res) => {
  try {
    const { phone, hospitalName } = req.body || {};
    const result = await createRegistrationInvite({
      organizationId: req.organizationId,
      deviceId: req.displayDevice?.id || null,
      phone,
      hospitalName: hospitalName || req.displayDevice?.name || 'the hospital',
    });
    const channels = result.channels || [];
    const via = channels.length ? channels.join(' + ') : 'none';
    res.status(201).json({
      success: true,
      inviteId: result.inviteId,
      expiresAt: result.expiresAt,
      phone: result.phone,
      linkSent: result.linkSent,
      channels,
      notifyErrors: result.notifyErrors || [],
      whatsappSid: result.whatsappSid || null,
      whatsappStatus: result.whatsappStatus || null,
      whatsappErrorCode: result.whatsappErrorCode || null,
      // Shown as on-screen QR when WhatsApp/SMS delivery fails
      registerUrl: result.registerUrl,
      message: result.linkSent
        ? `Registration link sent via ${via}`
        : 'Invite created — WhatsApp/SMS may not have delivered. Scan the QR on this screen.',
    });
  } catch (e) {
    const status = e.status || 500;
    console.error('[kiosk] registration-invite:', e.message);
    res.status(status).json({ success: false, message: e.message });
  }
});

/** GET /api/display/kiosk/registration-invite/status?phone= */
router.get('/registration-invite/status', async (req, res) => {
  try {
    const phone = req.query.phone || req.body?.phone;
    const row = await getInviteStatusForKiosk({
      organizationId: req.organizationId,
      phone,
    });
    if (!row) return res.json({ success: true, status: 'none' });
    res.json({
      success: true,
      status: row.status,
      tokenNumber: row.token_number,
      expiresAt: row.expires_at,
      consumedAt: row.consumed_at,
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

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

// POST /api/display/kiosk/parse-aadhaar-qr
// Body: { qrText?: decimal Secure QR digits, qrBytesBase64?: raw bytes }
// Prefer qrText for modern Aadhaar Secure QR. Last-4 only — never full UID.
router.post('/parse-aadhaar-qr', async (req, res) => {
  try {
    const { qrBytesBase64, qrText } = req.body || {};
    if (!qrBytesBase64 && !qrText) {
      return res.status(400).json({ success: false, message: 'qrText or qrBytesBase64 required' });
    }
    const result = parseAadhaarQrInput({ qrBytesBase64, qrText });
    if (!result.success) return res.status(422).json(result);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: 'Could not process this QR code' });
  }
});

/**
 * POST /api/display/kiosk/decode-aadhaar-image
 * Multipart field `photo` — server-side zxing-wasm decode (mobile fallback when live scan fails).
 */
router.post('/decode-aadhaar-image', async (req, res) => {
  try {
    const file = req.files?.photo || req.files?.image || req.files?.file;
    if (!file) {
      return res.status(400).json({ success: false, message: 'photo file required' });
    }
    const buf = file.data || (file.tempFilePath ? fs.readFileSync(file.tempFilePath) : null);
    if (!buf?.length) {
      return res.status(400).json({ success: false, message: 'empty photo' });
    }
    const result = await decodeAadhaarFromImageBytes(buf);
    if (!result.success) return res.status(422).json(result);
    res.json(result);
  } catch (err) {
    console.error('[kiosk] decode-aadhaar-image:', err.message);
    res.status(500).json({ success: false, message: 'Could not read Aadhaar QR from photo' });
  }
});

// POST /api/display/kiosk/register — walk-in new patient + queue token
router.post('/register', async (req, res) => {
  try {
    const {
      phone, firstName, lastName, dateOfBirth, gender: genderRaw,
      department, queueZone, doctorId, doctorName, chiefComplaint, consentVersion,
      photoKey, abhaId, notifyOptIn, notifyPhone, address, aadhaarLast4,
    } = req.body;

    const result = await registerWalkInPatient({
      organizationId: req.organizationId,
      phone,
      firstName,
      lastName,
      dateOfBirth,
      gender: genderRaw,
      department,
      queueZone,
      doctorId,
      doctorName,
      chiefComplaint,
      consentVersion,
      photoKey,
      abhaId,
      notifyOptIn,
      notifyPhone,
      address,
      aadhaarLast4,
      source: 'kiosk',
    });

    res.status(201).json({
      success: true,
      patientId: result.patientId,
      uhid: result.uhid,
      entry: result.entry,
      token: result.entry,
      eReceiptQr: JSON.stringify({
        uhid: result.uhid,
        token: result.entry?.tokenNumber,
        date: new Date().toISOString().slice(0, 10),
      }),
    });
  } catch (e) {
    const status = e.status || 500;
    console.error('[kiosk] register error:', e.message);
    res.status(status).json({ success: false, message: e.message });
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
    const { appointmentId, phone, notifyOptIn } = req.body;
    if (!appointmentId) return res.status(400).json({ success: false, message: 'appointmentId required' });

    const appt = await Appointment.findByPk(appointmentId);
    if (!appt) return res.status(404).json({ success: false, message: 'Appointment not found' });

    const { issueTokenForAppointment } = await import('../services/qms-opd.service.js');
    const entry = await issueTokenForAppointment(appt, {
      notifyOptIn: notifyOptIn === true || notifyOptIn === 'true',
      notifyPhone: phone || appt.patientPhone,
      organizationId: req.organizationId || appt.organization_id,
      source: 'kiosk-appointment-checkin',
      mode: 'force', // day-of arrival — always activate
    });
    if (entry?.deferred) {
      return res.status(409).json({ success: false, message: entry.message, deferred: entry });
    }

    await appt.update({ status: 'confirmed' });

    res.json({
      success: true,
      entry,
      token: {
        ...entry,
        token_number: entry.tokenNumber,
        patient_name: entry.patientName,
        doctor_name: entry.doctorName,
        counter_id: entry.counterId,
        queue_zone: entry.queueZone,
        estimated_wait_minutes: entry.estimatedWaitMinutes,
        specialization: entry.metadata?.specialization || appt.specialization || null,
      },
      whatsapp: Boolean(phone || appt.patientPhone),
    });
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
