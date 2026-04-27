/**
 * myUpchar Live Consult API — Backend Proxy
 *
 * Keeps the API key server-side and exposes clean endpoints for the patient UI.
 *
 * Endpoints:
 *   GET  /api/myupchar/live-doctors          — List of live/available doctors
 *   POST /api/myupchar/call-doctor           — Initiate a call
 *   GET  /api/myupchar/prescription/:threadId — Poll for Rx after call
 *
 * myUpchar API docs: https://www.myupchar.com/en/home/live_consult_api
 */

import express from 'express';
import https from 'https';
import { authUser } from '../middleware/auth.middleware.js';

const router = express.Router();

const API_KEY  = process.env.MYUPCHAR_API_KEY  || '';
const API_BASE = process.env.MYUPCHAR_API_BASE || 'https://beta.myupchar.com/api';

// ─── Speciality ID map (from myUpchar docs) ──────────────────────────────────
export const MYUPCHAR_SPECIALITY_MAP = {
  'Cardiology':              1,
  'Oncology':                2,
  'Neurology':               3,
  'Orthopedics':             4,
  'ENT':                     7,
  'Urology':                 8,
  'Ophthalmology':           9,
  'Pediatrics':              10,
  'Dermatology':             11,
  'Dentistry':               13,
  'General Surgery':         18,
  'General Physician':       25,
  'Ayurveda':                26,
  'Homeopathy':              27,
  'Dietician':               30,
  'Gynaecology':             66,
};

// ─── Helper: make a JSON GET request to the myUpchar API ─────────────────────
function myupcharGet(path) {
  return new Promise((resolve, reject) => {
    const url = `${API_BASE}${path}`;
    https.get(url, { timeout: 10000 }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch {
          reject(new Error('Invalid JSON from myUpchar'));
        }
      });
    }).on('error', reject).on('timeout', () => reject(new Error('myUpchar timeout')));
  });
}

// ─── GET /api/myupchar/status ─────────────────────────────────────────────────
// Returns whether the integration is configured
router.get('/status', (req, res) => {
  res.json({
    configured: Boolean(API_KEY),
    message: API_KEY
      ? 'myUpchar API integration is active'
      : 'myUpchar API key not configured. Add MYUPCHAR_API_KEY to server/.env',
    specialityMap: MYUPCHAR_SPECIALITY_MAP,
  });
});

// ─── GET /api/myupchar/live-doctors ──────────────────────────────────────────
// Query params: speciality_id (optional), lang (default: en)
// Requires auth — patient must be logged in so we can pass their details
router.get('/live-doctors', authUser, async (req, res) => {
  if (!API_KEY) {
    return res.status(503).json({
      success: false,
      message: 'myUpchar integration not configured. Contact admin.',
    });
  }

  try {
    const { speciality_id, lang = 'en' } = req.query;

    // Sanitize user details from the auth token
    const userName      = encodeURIComponent(`${req.user.firstName || ''} ${req.user.lastName || ''}`.trim() || 'Patient');
    const userTelephone = encodeURIComponent(req.user.phoneNumber || req.user.phone || '9999999999');
    const userAge       = encodeURIComponent(req.user.age || req.user.dob
      ? Math.floor((Date.now() - new Date(req.user.dob).getTime()) / 3.156e10)
      : 30);
    const userSex       = encodeURIComponent(req.user.gender || 'male');
    const userEmail     = encodeURIComponent(req.user.email || '');

    let path = `/v1/get_live_doctors_for_third_party?key=${API_KEY}&lang=${lang}&name=${userName}&telephone=${userTelephone}&age=${userAge}&sex=${userSex}&email=${userEmail}`;
    if (speciality_id) path += `&speciality_id=${encodeURIComponent(speciality_id)}`;

    const data = await myupcharGet(path);

    if (data.status !== 200) {
      return res.status(502).json({ success: false, message: data.message || 'myUpchar error', raw: data });
    }

    const doctors    = data.data?.livedoctor?.live_doctor_list || [];
    const specialities = data.data?.live_doctor_specialities || [];

    // Normalize user_id (myUpchar returns it to track the user across calls)
    const myUpcharUserId = data.data?.user_id || null;

    res.json({
      success: true,
      myUpcharUserId,
      doctors: doctors.map(d => ({
        id:            d.id,
        name:          d.name,
        imageUrl:      d.image_url,
        isLive:        d.live_status,
        statusText:    d.live_status_text,
        experience:    d.experience,
        degree:        d.degree,
        speciality:    d.speciality,
        gender:        d.gender,
        isSpecialist:  d.specialist_doctor,
        profileUrl:    d.permalink,
      })),
      specialities,
    });
  } catch (err) {
    console.error('[myUpchar] live-doctors error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to fetch live doctors' });
  }
});

// ─── POST /api/myupchar/call-doctor ──────────────────────────────────────────
// Body: { myUpcharUserId, doctorId, labReportUrl? }
router.post('/call-doctor', authUser, async (req, res) => {
  if (!API_KEY) {
    return res.status(503).json({ success: false, message: 'myUpchar integration not configured.' });
  }

  const { myUpcharUserId, doctorId, labReportUrl } = req.body;
  if (!myUpcharUserId || !doctorId) {
    return res.status(400).json({ success: false, message: 'myUpcharUserId and doctorId are required' });
  }

  try {
    let path = `/v1/call_doctor_third_party?key=${API_KEY}&user_id=${encodeURIComponent(myUpcharUserId)}&doctor_id=${encodeURIComponent(doctorId)}`;
    if (labReportUrl) path += `&lab_report_url=${encodeURIComponent(labReportUrl)}`;

    const data = await myupcharGet(path);

    if (data.status !== 200) {
      return res.status(502).json({ success: false, message: data.message || 'Call initiation failed', raw: data });
    }

    res.json({
      success: true,
      threadId:    data.data?.thread_id,
      myUpcharUserId: data.data?.user_id,
      doctorId:    data.data?.doctor_id,
      callResponse: data.call_response,
    });
  } catch (err) {
    console.error('[myUpchar] call-doctor error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to initiate call' });
  }
});

// ─── GET /api/myupchar/prescription/:threadId ────────────────────────────────
// Poll after a call to check if the doctor has generated a prescription
router.get('/prescription/:threadId', authUser, async (req, res) => {
  if (!API_KEY) {
    return res.status(503).json({ success: false, message: 'myUpchar integration not configured.' });
  }

  const { threadId } = req.params;
  if (!threadId || !/^\d+$/.test(threadId)) {
    return res.status(400).json({ success: false, message: 'Invalid threadId' });
  }

  try {
    const data = await myupcharGet(`/get_rx_third_party?key=${API_KEY}&thread_id=${threadId}`);

    if (data.status === 201) {
      return res.json({ success: true, ready: false, message: 'Consultation pending' });
    }
    if (data.status !== 200) {
      return res.status(502).json({ success: false, message: data.message || 'Rx fetch failed' });
    }

    res.json({
      success: true,
      ready:          true,
      prescriptionId:  data.data?.prescription_id,
      prescriptionUrl: data.data?.prescription_url,
    });
  } catch (err) {
    console.error('[myUpchar] prescription error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to fetch prescription' });
  }
});

export default router;
