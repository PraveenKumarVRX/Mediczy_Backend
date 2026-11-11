import express from 'express';
import { connectPostgres } from '../db/postgres.js';
import { Op } from 'sequelize';
import Appointment from '../models/postgres/appointment.model.postgres.js';
import { registerDisplaySSE, pushToZone, pushToAll, getSSEStats } from '../services/display-sse-broker.service.js';
import * as queueService from '../services/hospital-queue.service.js';
import { buildLiveKitJoinData } from '../utils/videoProvider.js';
import { listFloors, saveFloor, deleteFloor } from '../services/wayfinding.service.js';
import { getFloorMap } from '../services/floor-map.service.js';
import { bloodBankScope } from '../services/dept-tenant-scope.service.js';
import {
  OT_PROCTOR_ROOM_PREFIX, registerRoom, endRoom, listActiveRooms, checkObserverRoom,
} from '../services/ot-proctor-rooms.js';
import {
  requireDisplayDevice,
  optionalDisplayDeviceOrDefaultOrg,
  resolveOptionalDisplayOrg,
  ensureDisplayDeviceSchema,
} from '../middleware/authDisplayDevice.middleware.js';
import { verifyHospitalToken } from '../middleware/hospitalAuth.middleware.js';

import { schemaError, tableNameFromSchemaRow, SCHEMA_NOT_MIGRATED } from '../utils/schema-guard.js';
const router = express.Router();

registerDisplaySSE(router, async (req, res) => {
  const result = await resolveOptionalDisplayOrg(req);
  if (result.error) {
    res.status(result.error.status).json(result.error.body);
    return false;
  }
  return result.organizationId;
});
ensureDisplayDeviceSchema().catch(() => {});

// ─── DB helpers ──────────────────────────────────────────────────────────────
async function safeQuery(sql, params = []) {
  try {
    const db = await connectPostgres();
    const result = await db.query(sql, params);
    return result.rows || [];
  } catch (_) { return []; }
}

async function safeQueryOne(sql, params = []) {
  const rows = await safeQuery(sql, params);
  return rows[0] || null;
}

async function readBloodBankDisplay(organizationId) {
  let db = null;
  try {
    const raw = await connectPostgres();
    await bloodBankScope.ensure(raw);
    db = bloodBankScope.scopedDb(raw, organizationId);
    const [inventoryResult, requisitionResult] = await Promise.all([
      db.query(`
        SELECT
          blood_group,
          CASE LOWER(component)
            WHEN 'whole_blood' THEN 'Whole Blood'
            WHEN 'whole blood' THEN 'Whole Blood'
            WHEN 'rbc' THEN 'RBC'
            WHEN 'red_blood_cells' THEN 'RBC'
            WHEN 'platelets' THEN 'Platelets'
            WHEN 'ffp' THEN 'FFP'
            WHEN 'plasma' THEN 'FFP'
            WHEN 'cryoprecipitate' THEN 'Cryoprecipitate'
            ELSE INITCAP(REPLACE(component, '_', ' '))
          END AS component,
          COUNT(*)::int AS units_available,
          BOOL_OR(expires_at <= CURRENT_DATE + INTERVAL '7 days') AS expiry_alert
        FROM blood_bank_units
        WHERE LOWER(status) = 'available'
          AND expires_at >= CURRENT_DATE
        GROUP BY blood_group, component
        ORDER BY blood_group, component
      `),
      db.query(`
        SELECT
          requisition_number AS req_id,
          blood_group,
          CASE LOWER(component)
            WHEN 'whole_blood' THEN 'Whole Blood'
            WHEN 'whole blood' THEN 'Whole Blood'
            WHEN 'rbc' THEN 'RBC'
            WHEN 'red_blood_cells' THEN 'RBC'
            WHEN 'platelets' THEN 'Platelets'
            WHEN 'ffp' THEN 'FFP'
            WHEN 'plasma' THEN 'FFP'
            WHEN 'cryoprecipitate' THEN 'Cryoprecipitate'
            ELSE INITCAP(REPLACE(component, '_', ' '))
          END AS component,
          units_requested AS units,
          INITCAP(urgency) AS urgency,
          ward,
          INITCAP(status) AS status
        FROM blood_bank_requisitions
        WHERE LOWER(status) IN ('pending', 'processing', 'approved')
        ORDER BY created_at ASC
        LIMIT 20
      `),
    ]);

    const inventory = (inventoryResult.rows || []).map((row) => {
      const units = Number(row.units_available) || 0;
      return {
        ...row,
        units_available: units,
        level: units === 0 ? 'critical' : units < 5 ? 'low' : 'ok',
        expiry_alert: row.expiry_alert === true,
      };
    });

    return { inventory, requisitions: requisitionResult.rows || [] };
  } catch (error) {
    console.error('[display/blood-bank] canonical inventory unavailable:', error.message);
    return { error };
  } finally {
    await db?.release?.();
  }
}

const SCHEMA_TABLES = ['display_zones', 'display_devices', 'emergency_broadcasts', 'checkin_tokens'];

// Owned by the migration. The old bootstrap also swallowed its own failure
// ('table setup skipped'), so a broken schema surfaced later as confusing
// query errors on the kiosk rather than as the migration problem it was.
async function ensureTables() {
  const db = await connectPostgres();
  try {
    const { rows } = await db.query(
      `SELECT table_name AS "tableName" FROM information_schema.tables
        WHERE table_schema = current_schema() AND table_name = ANY($1::text[])`,
      [SCHEMA_TABLES]
    );
    const present = new Set(rows.map(tableNameFromSchemaRow).filter(Boolean));
    const missingTables = SCHEMA_TABLES.filter((t) => !present.has(t));
    if (missingTables.length) throw schemaError('Apply migration 20261015004200-display-kiosk-governance before using hospital displays', missingTables);
  } finally {
    await db?.release?.();
  }
}

// Reported at startup rather than silently skipped.
ensureTables().catch((err) => console.error('[display] schema check failed:', err.message, err.details || ''));

// ─── Device token auth (lightweight — long-lived tokens, no expiry) ──────────
// For kiosk/display screens. Token is just a stored secret in display_devices.
// Admin pages use standard JWT. Public display pages require NO auth.
function deviceAuth(req, res, next) {
  const token = req.headers['x-device-token'] || req.query.deviceToken;
  if (!token) return res.status(401).json({ success: false, message: 'Device token required' });
  safeQueryOne('SELECT * FROM display_devices WHERE device_token=$1 AND active=true', [token])
    .then(device => {
      if (!device) return res.status(401).json({ success: false, message: 'Unknown device token' });
      req.displayDevice = device;
      // Non-blocking heartbeat
      safeQuery('UPDATE display_devices SET last_seen=NOW() WHERE device_token=$1', [token]);
      next();
    })
    .catch(() => res.status(500).json({ success: false, message: 'Auth error' }));
}

// ─── SSE endpoint (registered via display-sse-broker.service.js) ─────────────

// ─── Emergency broadcasts ─────────────────────────────────────────────────────

// POST /api/display/emergency — push a broadcast (hospital staff only — this
// reaches every board/kiosk screen in the building, so an unauthenticated
// caller must never be able to trigger it). Scoped to the caller's own
// hospital — zone names like "icu" or "opd-waiting" are reused across every
// tenant, so an unscoped push would also reach other hospitals' screens.
router.post('/emergency', verifyHospitalToken, async (req, res) => {
  try {
    const { title, message, severity = 'critical', zone_id = null } = req.body;
    if (!title || !message) return res.status(400).json({ success: false, message: 'title and message required' });
    const pushed_by = req.hospitalName || req.hospitalUser?.name || 'Hospital staff';
    const orgId = req.hospitalOrgId;

    const db = await connectPostgres();
    const result = await db.query(
      `INSERT INTO emergency_broadcasts (title, message, severity, zone_id, organization_id, pushed_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [title, message, severity, zone_id, orgId, pushed_by]
    );
    const broadcast = result.rows[0];

    // Push to this hospital's SSE clients only (all zones, or one zone)
    if (zone_id) {
      pushToZone(zone_id, 'emergency', broadcast, orgId);
    } else {
      pushToAll('emergency', broadcast, orgId);
    }

    res.json({ success: true, broadcast });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// GET /api/display/emergency — this hospital's own active broadcasts
router.get('/emergency', verifyHospitalToken, async (req, res) => {
  const rows = await safeQuery(
    'SELECT * FROM emergency_broadcasts WHERE dismissed_at IS NULL AND organization_id = $1 ORDER BY created_at DESC',
    [req.hospitalOrgId]
  );
  res.json({ success: true, broadcasts: rows });
});

// DELETE /api/display/emergency/:id — dismiss. Left public on purpose: any
// screen currently showing the alert (DisplayShell, unauthenticated by
// design) has a local "dismiss" tap, same as the admin page. Creating an
// alert is the privileged action (gated above); silencing one a screen is
// already displaying is a lower-severity, intentionally-public affordance.
router.delete('/emergency/:id', async (req, res) => {
  await safeQuery(
    'UPDATE emergency_broadcasts SET dismissed_at=NOW() WHERE id=$1',
    [req.params.id]
  );
  pushToAll('emergency-dismissed', { id: parseInt(req.params.id) });
  res.json({ success: true });
});

// ─── Device registry ─────────────────────────────────────────────────────────
// device_token is the ONLY thing standing between an anonymous kiosk visitor
// and this tenant's queue/patient data (see authDisplayDevice.middleware.js).
// Listing, minting, or deactivating tokens must therefore never be reachable
// without proof of who you are, and never leak or touch another org's rows.

// GET /api/display/devices — this hospital's own devices only
router.get('/devices', verifyHospitalToken, async (req, res) => {
  const devices = await safeQuery(
    'SELECT * FROM display_devices WHERE organization_id = $1 ORDER BY registered_at DESC',
    [req.hospitalOrgId]
  );
  res.json({ success: true, devices });
});

// POST /api/display/devices — register a new device for THIS hospital
// (organization_id is always taken from the verified token, never the body)
router.post('/devices', verifyHospitalToken, async (req, res) => {
  try {
    const { name, zone_id, display_type, url_path, ip_address, config } = req.body;
    const crypto = await import('crypto');
    const device_token = crypto.randomBytes(24).toString('hex');
    const orgId = req.hospitalOrgId;
    const cfg = { ...(config && typeof config === 'object' ? config : {}), organization_id: orgId };

    const db = await connectPostgres();
    // organization_id is added by the display-kiosk migration; adding it here
    // meant every device registration took a schema lock on the table.
    const result = await db.query(
      `INSERT INTO display_devices (device_token, name, zone_id, display_type, url_path, ip_address, organization_id, config)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [device_token, name, zone_id, display_type, url_path, ip_address, orgId, JSON.stringify(cfg)]
    );
    res.json({
      success: true,
      device: result.rows[0],
      kioskUrlHint: `${url_path || '/kiosk/checkin'}?deviceToken=${device_token}`,
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// DELETE /api/display/devices/:token — deactivate, only if it belongs to this hospital
router.delete('/devices/:token', verifyHospitalToken, async (req, res) => {
  const rows = await safeQuery(
    'UPDATE display_devices SET active=false WHERE device_token=$1 AND organization_id=$2 RETURNING id',
    [req.params.token, req.hospitalOrgId]
  );
  if (!rows.length) return res.status(404).json({ success: false, message: 'Device not found for this hospital' });
  res.json({ success: true });
});

// POST /api/display/heartbeat — device keepalive
router.post('/heartbeat', deviceAuth, async (req, res) => {
  res.json({ success: true, ts: Date.now() });
});

// ─── Zone registry ────────────────────────────────────────────────────────────

router.get('/zones', async (_req, res) => {
  const zones = await safeQuery('SELECT * FROM display_zones ORDER BY name');
  if (zones.length === 0) {
    // Return built-in zone catalog if table is empty
    return res.json({ success: true, zones: ZONE_CATALOG });
  }
  res.json({ success: true, zones });
});

const ZONE_CATALOG = [
  { zone_id: 'main-entrance', name: 'Main Entrance / Lobby', floor: 'G' },
  { zone_id: 'opd-waiting', name: 'OPD Waiting Area', floor: 'G' },
  { zone_id: 'opd-counter', name: 'OPD Registration Counter', floor: 'G' },
  { zone_id: 'pharmacy-waiting', name: 'Pharmacy Waiting', floor: 'G' },
  { zone_id: 'lab-waiting', name: 'Lab / Diagnostics Waiting', floor: 'G' },
  { zone_id: 'radiology-waiting', name: 'Radiology Waiting', floor: '1' },
  { zone_id: 'er-triage', name: 'ER Triage', floor: 'G' },
  { zone_id: 'er-waiting', name: 'ER Family Waiting', floor: 'G' },
  { zone_id: 'icu', name: 'ICU Nursing Station', floor: '2' },
  { zone_id: 'ot-complex', name: 'OT Complex', floor: '3' },
  { zone_id: 'ward-general', name: 'General Ward', floor: '2' },
  { zone_id: 'ward-private', name: 'Private Ward', floor: '3' },
  { zone_id: 'blood-bank', name: 'Blood Bank', floor: '1' },
  { zone_id: 'cssd', name: 'CSSD', floor: 'B' },
  { zone_id: 'discharge-lounge', name: 'Discharge Lounge', floor: 'G' },
  { zone_id: 'insurance-desk', name: 'Insurance / TPA Desk', floor: 'G' },
  { zone_id: 'cafeteria', name: 'Cafeteria / Canteen', floor: 'G' },
  { zone_id: 'bedside', name: 'Bedside Terminal', floor: 'various' },
];

// ─── Display data endpoints ───────────────────────────────────────────────────
// Board reads: optional device token; organizationId query requires device token (P0).
// Mutations (check-in / issue-token): require x-device-token (P0).

// OPD Queue board — unified smart queue
router.get('/queue', optionalDisplayDeviceOrDefaultOrg, async (req, res) => {
  try {
    const isProd = process.env.NODE_ENV === 'production';
    const board = await queueService.getBoardSnapshot({
      organizationId: req.organizationId,
      queueZone: req.query.zone || 'opd-waiting',
      department: req.query.department || 'opd',
      doctorId: req.query.doctorId ? parseInt(req.query.doctorId, 10) : undefined,
      counterId: req.query.counter,
    });

    if (board.entries?.length > 0 || board.current?.token) {
      return res.json({
        success: true,
        current: board.current || { token: '—', counter: '—', doctor: '' },
        next: board.next,
        waiting: board.waiting,
        avgWaitMins: board.avgWaitMins,
        live: true,
      });
    }

    if (isProd) {
      return res.json({
        success: true,
        current: { token: '—', counter: '—', doctor: '' },
        next: [],
        waiting: 0,
        avgWaitMins: 0,
        live: true,
      });
    }

    res.json({
      success: true,
      current: { token: 'A-047', counter: 'Counter 2', doctor: 'Dr. Sharma (Gen. Medicine)' },
      next: [
        { token: 'A-048', counter: 'Counter 1' },
        { token: 'A-049', counter: 'Counter 3' },
      ],
      waiting: 0,
      avgWaitMins: 12,
      live: false,
    });
  } catch (e) {
    console.error('[display] queue error:', e.message);
    res.status(500).json({ success: false, message: e.message });
  }
});

// ICU Board
// GET /api/display/icu-board
router.get('/icu-board', async (_req, res) => {
  const beds = await safeQuery(
    `SELECT b.*, p.name as patient_name, p.age, p.gender
     FROM icu_beds b
     LEFT JOIN patients p ON p.id = b.patient_id
     WHERE b.active = true
     ORDER BY b.bed_number`
  );

  if (beds.length > 0) {
    return res.json({ success: true, beds, live: true });
  }

  // Fallback demo
  res.json({
    success: true,
    live: false,
    beds: [
      { bed_number: 'ICU-01', patient_name: 'Rajesh K.', age: 62, gender: 'M', diagnosis: 'ARDS', spo2: 94, hr: 88, bp: '128/82', temp: 37.8, rr: 20, news2: 5, alert_level: 'orange' },
      { bed_number: 'ICU-02', patient_name: 'Sunita R.', age: 54, gender: 'F', diagnosis: 'Sepsis', spo2: 97, hr: 102, bp: '105/68', temp: 38.6, rr: 22, news2: 6, alert_level: 'red' },
      { bed_number: 'ICU-03', patient_name: 'Mohammed A.', age: 71, gender: 'M', diagnosis: 'Acute MI', spo2: 98, hr: 76, bp: '138/90', temp: 37.1, rr: 16, news2: 3, alert_level: 'yellow' },
      { bed_number: 'ICU-04', patient_name: '—', age: null, gender: null, diagnosis: null, spo2: null, hr: null, bp: null, temp: null, rr: null, news2: null, alert_level: 'green', status: 'available' },
      { bed_number: 'ICU-05', patient_name: 'Priya M.', age: 38, gender: 'F', diagnosis: 'DKA', spo2: 99, hr: 95, bp: '118/76', temp: 37.4, rr: 18, news2: 2, alert_level: 'green' },
      { bed_number: 'ICU-06', patient_name: 'Arun S.', age: 48, gender: 'M', diagnosis: 'Pneumonia', spo2: 92, hr: 110, bp: '100/60', temp: 39.1, rr: 26, news2: 8, alert_level: 'red' },
    ],
  });
});

// Blood Bank display
// GET /api/display/blood-bank
router.get('/blood-bank', optionalDisplayDeviceOrDefaultOrg, async (req, res) => {
  const result = await readBloodBankDisplay(req.organizationId);
  if (result.error) {
    return res.status(503).json({
      success: false,
      code: 'blood_inventory_unavailable',
      message: 'Live blood-bank inventory is unavailable. Do not use this display to make stock decisions.',
      inventory: [],
      requisitions: [],
      live: false,
    });
  }

  return res.json({
    success: true,
    inventory: result.inventory,
    requisitions: result.requisitions,
    live: true,
    source: 'blood_bank_units',
    generated: false,
  });
});

// OT Status display
// GET /api/display/ot-status
router.get('/ot-status', async (_req, res) => {
  const ot = await safeQuery(
    `SELECT r.*, s.name as surgeon, p.name as patient_name
     FROM ot_rooms r
     LEFT JOIN doctors s ON s.id = r.surgeon_id
     LEFT JOIN patients p ON p.id = r.patient_id
     WHERE r.active = true
     ORDER BY r.room_number`
  );

  if (ot.length > 0) {
    return res.json({ success: true, rooms: ot, live: true });
  }

  res.json({
    success: true,
    live: false,
    rooms: [
      { room_number: 'OT-1', status: 'In Progress', case_type: 'Laparoscopic Cholecystectomy', surgeon: 'Dr. Mehta', started_at: new Date(Date.now() - 95 * 60000).toISOString(), next_case: 'Total Hip Replacement' },
      { room_number: 'OT-2', status: 'Prep / Anaesthesia', case_type: 'CABG', surgeon: 'Dr. Verma', started_at: new Date(Date.now() - 15 * 60000).toISOString(), next_case: null },
      { room_number: 'OT-3', status: 'Available', case_type: null, surgeon: null, started_at: null, next_case: 'Total Knee Replacement @ 14:00' },
      { room_number: 'OT-4', status: 'Cleaning / Turnover', case_type: null, surgeon: null, started_at: null, next_case: 'Appendectomy @ 13:30' },
      { room_number: 'OT-5 (Ortho)', status: 'In Progress', case_type: 'Spinal Fusion L4-L5', surgeon: 'Dr. Kapoor', started_at: new Date(Date.now() - 140 * 60000).toISOString(), next_case: null },
    ],
  });
});

// Ward nursing station display
// GET /api/display/ward?ward=3B
router.get('/ward', async (req, res) => {
  const { ward } = req.query;
  const whereClause = ward ? 'WHERE w.ward_id=$1 AND w.active=true' : 'WHERE w.active=true';
  const params = ward ? [ward] : [];

  const beds = await safeQuery(
    `SELECT w.bed_number, w.ward_id, p.name as patient_name, p.age, w.status,
            w.vitals, w.pending_orders, w.medication_alerts, w.assigned_nurse
     FROM ward_beds w
     LEFT JOIN patients p ON p.id = w.patient_id
     ${whereClause}
     ORDER BY w.ward_id, w.bed_number
     LIMIT 30`,
    params
  );

  if (beds.length > 0) {
    return res.json({ success: true, beds, live: true });
  }

  res.json({
    success: true,
    live: false,
    wardName: ward || '3B – General Medicine',
    beds: [
      { bed_number: '3B-01', patient_name: 'Kavitha P.', age: 45, status: 'stable', diagnosis: 'T2DM review', nurse: 'Sr. Anita', pending_orders: 1, medication_due: false, vitals: { spo2: 98, hr: 78, bp: '120/80' } },
      { bed_number: '3B-02', patient_name: 'Rajan V.', age: 58, status: 'monitoring', diagnosis: 'Hypertensive urgency', nurse: 'Sr. Anita', pending_orders: 3, medication_due: true, vitals: { spo2: 97, hr: 94, bp: '168/102' } },
      { bed_number: '3B-03', patient_name: '—', age: null, status: 'available', nurse: null },
      { bed_number: '3B-04', patient_name: 'Meena D.', age: 34, status: 'stable', diagnosis: 'Dengue fever', nurse: 'Sr. Priya', pending_orders: 0, medication_due: false, vitals: { spo2: 99, hr: 82, bp: '110/70' } },
      { bed_number: '3B-05', patient_name: 'Suresh M.', age: 67, status: 'alert', diagnosis: 'Post-op day 1 CABG', nurse: 'Sr. Priya', pending_orders: 5, medication_due: true, vitals: { spo2: 95, hr: 104, bp: '108/66' } },
      { bed_number: '3B-06', patient_name: 'Lakshmi B.', age: 29, status: 'stable', diagnosis: 'Normal delivery post-partum', nurse: 'Sr. Anita', pending_orders: 1, medication_due: false, vitals: { spo2: 99, hr: 70, bp: '112/72' } },
    ],
  });
});

// Bedside terminal
// GET /api/display/bedside?bed=3B-02
router.get('/bedside', async (req, res) => {
  const { bed } = req.query;
  if (!bed) return res.status(400).json({ success: false, message: 'bed parameter required' });

  const bedData = await safeQueryOne(
    `SELECT w.*, p.name as patient_name, p.age, p.gender, p.blood_group
     FROM ward_beds w
     LEFT JOIN patients p ON p.id = w.patient_id
     WHERE w.bed_number=$1`,
    [bed]
  );

  if (bedData) {
    return res.json({ success: true, bed: bedData, live: true });
  }

  res.json({
    success: true,
    live: false,
    bed: {
      bed_number: bed,
      patient_name: 'Rajan Venkataraman',
      age: 58,
      gender: 'Male',
      blood_group: 'B+',
      diagnosis: 'Hypertensive urgency',
      admitted_on: new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10),
      ward: '3B – General Medicine',
      care_team: [
        { role: 'Attending Physician', name: 'Dr. Anil Sharma', specialty: 'Internal Medicine' },
        { role: 'Primary Nurse', name: 'Sr. Anita Rao' },
        { role: 'Dietitian', name: 'Ms. Pooja Nair' },
      ],
      medications_today: [
        { name: 'Amlodipine 5 mg', time: '08:00', given: true },
        { name: 'Metoprolol 50 mg', time: '08:00', given: true },
        { name: 'Losartan 50 mg', time: '20:00', given: false },
      ],
      diet: { plan: 'Low sodium, low fat', next_meal: 'Lunch – 13:00', restriction: 'No added salt' },
      vitals: { spo2: 97, hr: 94, bp: '168/102', temp: 37.2, time: new Date().toISOString() },
      notes_for_patient: 'Please press the nurse call button for any discomfort. Visiting hours: 10am–12pm and 5pm–7pm.',
    },
  });
});

// Discharge status lounge
// GET /api/display/discharge-status
router.get('/discharge-status', async (_req, res) => {
  const discharges = await safeQuery(
    `SELECT d.*, p.name as patient_name, w.bed_number
     FROM discharge_summaries d
     LEFT JOIN patients p ON p.id = d.patient_id
     LEFT JOIN ward_beds w ON w.patient_id = d.patient_id
     WHERE d.status IN ('processing','ready','pending_billing')
     ORDER BY d.created_at DESC
     LIMIT 15`
  );

  if (discharges.length > 0) {
    return res.json({ success: true, discharges, live: true });
  }

  res.json({
    success: true,
    live: false,
    discharges: [
      { patient_name: 'Ramesh K. (Ward 2A-05)', status: 'pending_billing', step: 'Billing clearance', eta: 'Est. 45 min' },
      { patient_name: 'Sujata N. (Ward 3B-09)', status: 'ready', step: 'Ready — please collect documents at counter 4', eta: null },
      { patient_name: 'Pradeep V. (Ward 1C-02)', status: 'processing', step: 'Doctor signature pending', eta: 'Est. 20 min' },
      { patient_name: 'Nandita S. (Ward 2B-11)', status: 'processing', step: 'Pharmacy kit preparation', eta: 'Est. 30 min' },
    ],
  });
});

// CSSD status display
// GET /api/display/cssd
router.get('/cssd', async (_req, res) => {
  const sets = await safeQuery(
    `SELECT * FROM cssd_sets WHERE status NOT IN ('available') ORDER BY updated_at DESC LIMIT 20`
  );

  if (sets.length > 0) {
    return res.json({ success: true, sets, live: true });
  }

  res.json({
    success: true,
    live: false,
    sets: [
      { set_name: 'Laparoscopy Set A', status: 'sterilizing', cycle: 'Steam 134°C', eta: '15 min', requested_by: 'OT-2' },
      { set_name: 'Ortho Tray #3', status: 'cooling', cycle: 'ETO Cycle 4', eta: '45 min', requested_by: 'OT-5' },
      { set_name: 'Cardiac Instruments A', status: 'dispatch', cycle: 'Autoclave', eta: 'Ready', requested_by: 'OT-1' },
      { set_name: 'Minor OT Set B', status: 'cleaning', cycle: '—', eta: '60 min', requested_by: 'OT-3' },
    ],
  });
});

// ─── Kiosk check-in endpoints ─────────────────────────────────────────────────

// POST /api/display/checkin/appointments — Sequelize appointment lookup (no demo in prod)
router.post('/checkin/appointments', requireDisplayDevice, async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ success: false, message: 'phone required' });
  const normalized = String(phone).replace(/\D/g, '').slice(-10);

  try {
    const appointments = await Appointment.findAll({
      where: {
        patientPhone: { [Op.like]: `%${normalized}` },
        appointmentDate: new Date().toISOString().slice(0, 10),
        status: { [Op.in]: ['pending', 'accepted', 'scheduled', 'confirmed'] },
      },
      order: [['appointmentTime', 'ASC']],
      limit: 5,
    });

    if (appointments.length > 0) {
      return res.json({
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
    }

    if (process.env.NODE_ENV === 'production') {
      return res.json({ success: true, live: true, appointments: [] });
    }

    res.json({
      success: true,
      live: false,
      appointments: [{
        id: 'DEMO-001',
        appointment_date: new Date().toISOString().slice(0, 10),
        appointment_time: '10:30',
        doctor_name: 'Dr. Anil Sharma',
        specialty: 'Internal Medicine',
        patient_name: 'Demo Patient',
        status: 'confirmed',
      }],
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// POST /api/display/checkin/issue-token — unified queue check-in (per-doctor OPD + WhatsApp/SMS)
router.post('/checkin/issue-token', requireDisplayDevice, async (req, res) => {
  try {
    const {
      appointment_id, patient_name, doctor_name, doctor_id,
      patient_phone, notify_opt_in, notify_phone, specialization,
    } = req.body;
    if (!appointment_id) return res.status(400).json({ success: false, message: 'appointment_id required' });

    let appt = null;
    try {
      appt = await Appointment.findByPk(appointment_id);
    } catch (_) { /* optional enrichment */ }

    const { issueTokenForAppointment } = await import('../services/qms-opd.service.js');
    const entry = await issueTokenForAppointment(
      appt || {
        id: parseInt(appointment_id, 10) || appointment_id,
        patientName: patient_name,
        doctorName: doctor_name,
        doctorId: doctor_id,
        organization_id: req.organizationId,
        specialization,
        patientPhone: patient_phone || notify_phone,
      },
      {
        notifyOptIn: notify_opt_in === true || notify_opt_in === 'true',
        notifyPhone: notify_phone || patient_phone || appt?.patientPhone,
        organizationId: req.organizationId,
        source: 'kiosk-issue-token',
        mode: 'force',
      },
    );
    if (entry?.deferred) {
      return res.status(409).json({ success: false, message: entry.message, deferred: entry });
    }

    if (appt) {
      try { await appt.update({ status: 'confirmed' }); } catch (_) { /* non-fatal */ }
    }

    res.json({
      success: true,
      live: true,
      whatsapp: Boolean(entry?.metadata?.notifyPhone || notify_phone || patient_phone),
      token: {
        token_number: entry.tokenNumber,
        patient_name: entry.patientName,
        doctor_name: entry.doctorName,
        counter_id: entry.counterId,
        queue_zone: entry.queueZone,
        status: entry.status,
        issued_at: entry.checkInAt,
        estimated_wait_minutes: entry.estimatedWaitMinutes,
        specialization: entry.metadata?.specialization || specialization || null,
      },
    });
  } catch (e) {
    if (process.env.NODE_ENV === 'production') {
      return res.status(500).json({ success: false, message: e.message });
    }
    res.json({
      success: true,
      live: false,
      token: {
        token_number: 'A-001',
        patient_name: req.body.patient_name || 'Patient',
        doctor_name: req.body.doctor_name || 'Doctor',
        status: 'waiting',
        issued_at: new Date().toISOString(),
      },
    });
  }
});

// POST /api/display/bedside/nurse-call
router.post('/bedside/nurse-call', async (req, res) => {
  try {
    const { bed, ward, patient_id, patient_name, organization_id } = req.body;
    if (!bed) return res.status(400).json({ success: false, message: 'bed required' });
    const call = await queueService.createNurseCall({
      organizationId: organization_id,
      bedId: bed,
      wardZone: ward || 'ward',
      patientId: patient_id,
      patientName: patient_name,
    });
    res.json({ success: true, call });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// GET /api/display/signage?zone=lobby
router.get('/signage', optionalDisplayDeviceOrDefaultOrg, async (req, res) => {
  try {
    const zone = req.query.zone || 'lobby';
    const slides = await queueService.listCmsSlides(req.organizationId, zone);
    res.json({ success: true, zone, slides, live: slides.length > 0 });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// GET /api/display/er-triage — ER queue board for triage staff display (GAP-DISPLAY-003)
router.get('/er-triage', optionalDisplayDeviceOrDefaultOrg, async (req, res) => {
  try {
    const orgId = req.organizationId;
    const board = await queueService.getBoardSnapshot({
      organizationId: orgId,
      queueZone: 'er-triage',
      department: 'er',
    });
    res.json({ success: true, live: true, ...board });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// GET /api/display/command — executive command centre KPIs (GAP-DISPLAY-005)
router.get('/command', optionalDisplayDeviceOrDefaultOrg, async (req, res) => {
  try {
    const orgId = req.organizationId;
    const queueAnalytics = await queueService.getHospitalQueueAnalytics(orgId);

    const icuBeds = await safeQuery(
      `SELECT bed_number, status, alert_level FROM icu_beds WHERE active = true ORDER BY bed_number`
    );
    const otRooms = await safeQuery(
      `SELECT room_number, status FROM ot_rooms WHERE active = true ORDER BY room_number`
    );
    const erWaiting = await safeQueryOne(
      `SELECT COUNT(*)::int AS c FROM hospital_queue_entries
       WHERE organization_id = $1 AND department = 'er' AND status IN ('waiting','called')
         AND check_in_at::date = CURRENT_DATE`,
      [orgId]
    );
    const opdWaiting = await safeQueryOne(
      `SELECT COUNT(*)::int AS c FROM hospital_queue_entries
       WHERE organization_id = $1 AND department = 'opd' AND status IN ('waiting','called')
         AND check_in_at::date = CURRENT_DATE`,
      [orgId]
    );

    const icuOccupied = icuBeds.filter((b) => b.status !== 'available').length;
    const icuCritical = icuBeds.filter((b) => b.alert_level === 'red').length;
    const otInProgress = otRooms.filter((r) => /progress|prep/i.test(r.status || '')).length;

    const displayStats = getSSEStats();
    const revenueToday = await safeQueryOne(
      `SELECT COALESCE(SUM(amount), 0)::float AS total FROM payments
       WHERE status = 'completed' AND created_at::date = CURRENT_DATE`
    );
    const nurseCallsOpen = await safeQueryOne(
      `SELECT COUNT(*)::int AS c FROM bedside_nurse_calls
       WHERE resolved_at IS NULL AND created_at::date = CURRENT_DATE`
    );

    res.json({
      success: true,
      live: icuBeds.length > 0 || otRooms.length > 0 || (queueAnalytics.totals?.total_today || 0) > 0,
      generatedAt: new Date().toISOString(),
      census: {
        icuBeds: icuBeds.length || 6,
        icuOccupied: icuOccupied || 4,
        icuCritical: icuCritical || 2,
        otRooms: otRooms.length || 5,
        otInProgress: otInProgress || 2,
      },
      queues: {
        opdWaiting: opdWaiting?.c ?? queueAnalytics.totals?.active ?? 0,
        erWaiting: erWaiting?.c ?? 0,
        completedToday: queueAnalytics.totals?.completed_today ?? 0,
        byDepartment: queueAnalytics.byDepartment || [],
      },
      revenueToday: Math.round(revenueToday?.total || 0),
      displays: displayStats,
      incidents: { codeBlueActive: 0, nurseCallsOpen: nurseCallsOpen?.c || 0 },
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// GET /api/display/floor-map — floor map of the organization's own configured departments, with occupancy
// only where a real source exists (see services/floor-map.service.js). No configured floors => no nodes.
router.get('/floor-map', optionalDisplayDeviceOrDefaultOrg, async (req, res) => {
  try {
    const floor = String(req.query.floor || 'all');
    const map = await getFloorMap(req.organizationId, floor);
    res.json({
      success: true,
      floor,
      ...map,
      legend: { normal: '<40%', moderate: '40-70%', busy: '70-90%', critical: '>90%', unknown: 'no occupancy source' },
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// POST /api/display/video/sessions — LiveKit room for display surfaces.
// Same trust model as the other public display reads (optionalDisplayDeviceOrDefaultOrg):
// a valid deviceToken binds the real org so the video_session_start push only
// reaches that hospital's own zone, instead of every tenant's screens sharing
// a zone name like "ward".
router.post('/video/sessions', optionalDisplayDeviceOrDefaultOrg, async (req, res) => {
  try {
    const { sessionType, targetZone, bedId, patientId, role = 'patient' } = req.body;
    // OT proctoring rooms carry the organization so staff can only be issued a token for their own
    // hospital's room (see /video/sessions/observer). Other session types keep the old opaque id.
    const roomId = sessionType === 'ot-proctor'
      ? `${OT_PROCTOR_ROOM_PREFIX}${req.organizationId}-${Date.now()}`
      : `display-${sessionType || 'consult'}-${Date.now()}`;
    const join = await buildLiveKitJoinData({
      meetingId: roomId,
      identity: `${role}-${patientId || bedId || Date.now()}`,
      name: role,
    });
    if (sessionType === 'ot-proctor') registerRoom(req.organizationId, roomId);
    pushToZone(targetZone || 'ward', 'video_session_start', {
      roomId,
      sessionType,
      bedId,
      join,
    }, req.organizationId);
    res.json({ success: true, roomId, join });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// GET /api/display/video/sessions/ot-proctor/active — live OT proctoring rooms of the caller's organization
router.get('/video/sessions/ot-proctor/active', verifyHospitalToken, (req, res) => {
  res.json({ success: true, rooms: listActiveRooms(req.hospitalOrgId) });
});

// POST /api/display/video/sessions/observer — a hospital specialist joins a live OT proctoring room
// (subscribe-only). Staff of one hospital can only be issued tokens for rooms of their own organization,
// which is enforced by the organization id embedded in the room name by /video/sessions.
router.post('/video/sessions/observer', verifyHospitalToken, async (req, res) => {
  try {
    const { roomId } = req.body || {};
    const check = checkObserverRoom(req.hospitalOrgId, roomId);
    if (!check.ok) return res.status(check.status).json({ success: false, message: check.message });
    const join = await buildLiveKitJoinData({
      meetingId: roomId,
      identity: `ot-observer-${req.userId ?? Date.now()}`,
      name: 'Remote expert',
      ttl: 60 * 60,
      canPublish: false,
      canSubscribe: true,
    });
    res.json({ success: true, roomId, join });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// POST /api/display/video/sessions/end — dismiss video overlay on zone displays
router.post('/video/sessions/end', optionalDisplayDeviceOrDefaultOrg, async (req, res) => {
  try {
    const { targetZone, roomId } = req.body;
    if (roomId) endRoom(req.organizationId, roomId);
    pushToZone(targetZone || 'ward', 'video_session_end', { roomId, ts: Date.now() }, req.organizationId);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ─── Wayfinding floor maps (hospital staff) ──────────────────────────────

router.get('/wayfinding/floors', verifyHospitalToken, async (req, res) => {
  try {
    res.json({ success: true, floors: await listFloors(req.hospitalOrgId) });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

router.put('/wayfinding/floors/:floorNumber', verifyHospitalToken, async (req, res) => {
  try {
    const out = await saveFloor(req.hospitalOrgId, req.userId, { ...req.body, floorNumber: Number(req.params.floorNumber) });
    if (out.error) return res.status(400).json({ success: false, message: out.error });
    res.json({ success: true, floor: out.floor });
  } catch (e) {
    res.status(500).json({ success: false, message: e.code === '42P01' ? 'Wayfinding is not set up yet (migration pending)' : e.message });
  }
});

router.delete('/wayfinding/floors/:floorNumber', verifyHospitalToken, async (req, res) => {
  try {
    const removed = await deleteFloor(req.hospitalOrgId, Number(req.params.floorNumber));
    res.status(removed ? 200 : 404).json({ success: removed });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ─── Admin display control ────────────────────────────────────────────────────

// POST /api/display/announce — push text announcement to specific zone (hospital staff only)
router.post('/announce', verifyHospitalToken, async (req, res) => {
  const { message, zone_id } = req.body;
  if (!message) return res.status(400).json({ success: false, message: 'message required' });

  if (zone_id) {
    pushToZone(zone_id, 'announcement', { message, ts: Date.now() }, req.hospitalOrgId);
  } else {
    pushToAll('announcement', { message, ts: Date.now() }, req.hospitalOrgId);
  }
  res.json({ success: true });
});

// GET /api/display/stats — connected display count
router.get('/stats', (_req, res) => {
  const stats = getSSEStats();
  res.json({
    success: true,
    connected: stats.connected,
    byZone: stats.byZone,
  });
});

export default router;
