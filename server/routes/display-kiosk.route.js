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
  resolveOrgDisplayName,
  lookupWalkInPatient,
  sendKioskPhoneOtp,
  verifyKioskPhoneOtp,
  listKioskDoctors,
  bookKioskAppointment,
  listKioskCamps,
  registerKioskCamp,
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
 * GET /api/display/kiosk/context
 * Device-auth: the real org name for this device, so the kiosk screen
 * never falls back to a generic hardcoded brand.
 */
router.get('/context', async (req, res) => {
  try {
    const organizationName = await resolveOrgDisplayName(req.organizationId, req.displayDevice?.name || 'Mediqzy');
    res.json({ success: true, organizationId: req.organizationId, organizationName });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

/**
 * POST /api/display/kiosk/lookup
 * Body: { phone, corporateName?, employeeId? } — checks whether this walk-in
 * already has a record (by phone, or by corporate name + employee ID), so the
 * kiosk can skip OTP for returning patients and only ask new ones to verify.
 */
router.post('/lookup', async (req, res) => {
  try {
    const { phone, corporateName, employeeId } = req.body || {};
    if (!phone) return res.status(400).json({ success: false, message: 'phone required' });
    const result = await lookupWalkInPatient({ phone, corporateName, employeeId });
    res.json({ success: true, ...result });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

/**
 * POST /api/display/kiosk/send-otp
 * Body: { phone, channel? } — 'whatsapp' (default) or 'sms', for a brand-new
 * walk-in, before we create their record.
 */
router.post('/send-otp', async (req, res) => {
  try {
    const { phone, channel } = req.body || {};
    if (!phone) return res.status(400).json({ success: false, message: 'phone required' });
    const normalizedChannel = channel === 'sms' ? 'sms' : 'whatsapp';
    const result = await sendKioskPhoneOtp(phone, normalizedChannel);
    if (!result.sent) {
      return res.status(502).json({ success: false, message: result.reason || 'Could not send OTP', devCode: result.devCode });
    }
    res.json({ success: true, message: `OTP sent via ${result.channel === 'sms' ? 'SMS' : 'WhatsApp'}`, channel: result.channel, devCode: result.devCode });
  } catch (e) {
    const status = e.status || 500;
    res.status(status).json({ success: false, message: e.message });
  }
});

/**
 * POST /api/display/kiosk/verify-otp
 * Body: { phone, code } — marks the phone verified server-side (Redis, short TTL)
 * so the subsequent /register call is trusted to create a new patient.
 */
router.post('/verify-otp', async (req, res) => {
  try {
    const { phone, code } = req.body || {};
    if (!phone || !code) return res.status(400).json({ success: false, message: 'phone and code required' });
    const result = await verifyKioskPhoneOtp(phone, code);
    if (!result.success) return res.status(400).json({ success: false, message: result.message });
    res.json({ success: true, message: 'Phone verified' });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

/**
 * GET /api/display/kiosk/doctors
 * Doctors at this clinic/hospital, with today's live queue load, for the
 * "see a doctor" purpose step.
 */
router.get('/doctors', async (req, res) => {
  try {
    const doctors = await listKioskDoctors(req.organizationId);
    res.json({ success: true, doctors });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

/**
 * POST /api/display/kiosk/book-appointment
 * Book a real appointment (not a walk-in token) for a chosen doctor + slot.
 * Body mirrors /register plus { doctorId, appointmentDate, appointmentTime, reason? }.
 */
router.post('/book-appointment', async (req, res) => {
  try {
    const {
      phone, firstName, lastName, age, gender: genderRaw, email,
      corporateName, employeeId, doctorId, appointmentDate, appointmentTime,
      reason, requireOtpForNewPatient,
    } = req.body || {};
    const result = await bookKioskAppointment({
      organizationId: req.organizationId,
      phone, firstName, lastName, age, gender: genderRaw, email,
      corporateName, employeeId, doctorId, appointmentDate, appointmentTime, reason,
      requireOtpForNewPatient: requireOtpForNewPatient === true || requireOtpForNewPatient === 'true',
    });
    res.status(201).json({ success: true, ...result });
  } catch (e) {
    const status = e.status || 500;
    res.status(status).json({ success: false, message: e.message, conflict: e.conflict || null });
  }
});

/**
 * GET /api/display/kiosk/camps
 * Health camps happening today or upcoming at this tenant, for the
 * "attending a camp" purpose step.
 */
router.get('/camps', async (req, res) => {
  try {
    const camps = await listKioskCamps(req.organizationId);
    res.json({ success: true, camps });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

/**
 * POST /api/display/kiosk/camps/:campId/register
 * Body mirrors /register: { phone, firstName, lastName, age, gender, email,
 * corporateName, employeeId, notifyOptIn, requireOtpForNewPatient }.
 */
router.post('/camps/:campId/register', async (req, res) => {
  try {
    const {
      phone, firstName, lastName, age, gender: genderRaw, email,
      corporateName, employeeId, notifyOptIn, requireOtpForNewPatient,
    } = req.body || {};
    const campId = parseInt(req.params.campId, 10);
    const result = await registerKioskCamp({
      organizationId: req.organizationId,
      campId, phone, firstName, lastName, age, gender: genderRaw, email,
      corporateName, employeeId, notifyOptIn,
      requireOtpForNewPatient: requireOtpForNewPatient === true || requireOtpForNewPatient === 'true',
    });
    res.status(201).json({
      success: true,
      patientId: result.patientId,
      uhid: result.uhid,
      entry: result.entry,
      token: result.entry,
      campName: result.campName,
    });
  } catch (e) {
    const status = e.status || 500;
    res.status(status).json({ success: false, message: e.message });
  }
});

/**
 * GET /api/display/kiosk/notify-health
 * Device-auth: is the kiosk WhatsApp template wired on this API process?
 */
router.get('/notify-health', async (req, res) => {
  try {
    const wa = (await import('../services/whatsapp-production.service.js')).default;
    const status = wa?.getTemplateStatus?.() || {};
    const { SMSService } = await import('../services/sms.service.js');
    const smsEnabled = String(process.env.QUEUE_NOTIFY_SMS ?? 'true').toLowerCase() !== 'false';
    let sms = { configured: false, message: 'SMS disabled' };
    if (smsEnabled) {
      const probe = new SMSService({
        provider: process.env.SMS_PROVIDER || 'twilio',
        apiKey: process.env.SMS_API_KEY || process.env.TWILIO_ACCOUNT_SID,
        apiSecret: process.env.SMS_API_SECRET || process.env.TWILIO_AUTH_TOKEN,
        smsFrom: process.env.TWILIO_SMS_NUMBER || null,
        messagingServiceSid:
          process.env.TWILIO_MESSAGING_SERVICE_SID ||
          process.env.TWILIO_SMS_MESSAGING_SERVICE_SID ||
          null,
        senderId: process.env.SMS_SENDER_ID || process.env.TWILIO_SMS_NUMBER || null,
        allowDiscover: String(process.env.TWILIO_SMS_AUTO_DISCOVER ?? 'true').toLowerCase() !== 'false',
      });
      sms = await probe.getTwilioSmsSenderStatus();
    }
    res.json({
      success: true,
      whatsappConfigured: !!wa?.configured,
      kioskRegisterTemplate: !!status.kioskRegister,
      kioskRegisterStyle: status.kioskRegisterStyle || null,
      kioskRegisterSid: status.kioskRegisterSid
        ? `${String(status.kioskRegisterSid).slice(0, 6)}…`
        : null,
      smsEnabled,
      smsConfigured: !!sms.configured,
      smsFromSource: sms.source || null,
      smsFromHint: sms.fromHint || null,
      smsMessagingService: !!sms.messagingService,
      smsMessage: sms.message || null,
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
      phone, firstName, lastName, dateOfBirth, age, gender: genderRaw,
      email, corporateName, employeeId,
      department, queueZone, doctorId, doctorName, chiefComplaint, consentVersion,
      photoKey, abhaId, notifyOptIn, notifyPhone, address, aadhaarLast4,
      requireOtpForNewPatient,
    } = req.body;

    const result = await registerWalkInPatient({
      organizationId: req.organizationId,
      phone,
      firstName,
      lastName,
      dateOfBirth,
      age,
      gender: genderRaw,
      email,
      corporateName,
      employeeId,
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
      requireOtpForNewPatient: requireOtpForNewPatient === true || requireOtpForNewPatient === 'true',
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

    // WP-1.8: an AI-assigned ESI level from a kiosk is a provisional triage, not a reviewed one — it goes into
    // er_visits (the same table the ER desk and queue screens read) marked triage_reviewed = false, so it is a
    // queue-ordering hint only until a nurse confirms it via PUT /api/v1/er/triage/:id (which sets
    // triage_reviewed = true, who, and when). Best-effort: losing this side record must not break the kiosk
    // check-in the patient is waiting on, so a failure here is logged, not thrown.
    let erVisitId = null;
    try {
      const erResult = await pool.query(
        `INSERT INTO er_visits (
           organization_id, patient_name, age, gender, phone, triage_level, esi_level,
           triage_source, triage_time, triage_reviewed, triage_inputs, chief_complaint,
           arrival_time, status, created_at, updated_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,'kiosk',NOW(),false,$8,$9,NOW(),'active',NOW(),NOW())
         RETURNING id`,
        [
          req.organizationId, patientName || 'ER Walk-in', age != null ? parseInt(age, 10) : null, gender || null,
          phone || null, triage.esiLevel <= 2 ? 'red' : triage.esiLevel === 3 ? 'yellow' : 'green', triage.esiLevel,
          JSON.stringify({ symptoms: String(symptoms).slice(0, 1000), painScale, vitals: vitals || {}, category: triage.category, ambulanceNeeded: triage.ambulanceNeeded }),
          String(symptoms).slice(0, 500),
        ]
      );
      erVisitId = erResult.rows?.[0]?.id ?? null;
    } catch (e) {
      console.error('[kiosk] er_visits provisional record failed (queue check-in still succeeded):', e.message);
    }

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
      }, req.organizationId);
      video = { roomId, join };
    }

    res.status(201).json({ success: true, triage, entry, video, erVisitId });
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
