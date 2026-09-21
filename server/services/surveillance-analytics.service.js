/**
 * Surveillance Analytics Service
 * =================================================================
 * Per-camera vision analytics for the Security module, fed by an on-premises
 * edge gateway that pulls frames from the hospital's DVR / NVR / IP cameras
 * (edge/surveillance-agent). Security/safety monitoring only — not a clinical
 * or SaMD component. Schema: server/migrations/surveillance-analytics.migration.js.
 *
 * Privacy stance (built in, not optional):
 *   - Frames are analysed in memory and discarded; only counts, events and a
 *     frame log are stored. No face recognition, no identification.
 *   - Cameras default to privacy class 'clinical' (wards, ICU, theatres) and are
 *     BLOCKED from analytics until an administrator approves them.
 *   - Frames go only to the on-premises / SIB vision provider unless
 *     SURVEILLANCE_ALLOW_EXTERNAL_VISION=true is set deliberately.
 *
 * Every method is scoped to organizationId. A row of another organization behaves
 * like a missing row (undefined -> 404).
 */

import crypto from 'crypto';
import pool from '../db/pgPool.js';
import llmProvider from './ai-brain/llm-provider.js';

export class SurveillanceError extends Error {
  constructor(message, { status = 400, code = 'SURVEILLANCE_ERROR', details = null } = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const TZ = 'Asia/Kolkata';
const ZONE_TYPES = ['entrance', 'perimeter', 'parking', 'corridor', 'lobby', 'emergency', 'pharmacy', 'server_room', 'store', 'ward', 'icu', 'ot', 'other'];
const PRIVACY_CLASSES = ['public', 'restricted', 'clinical'];
const VENDORS = ['hikvision', 'dahua', 'cpplus', 'uniview', 'axis', 'onvif_generic', 'other'];
const RECORDER_KINDS = ['dvr', 'nvr', 'ip_camera'];
const SEVERITIES = ['low', 'medium', 'high'];
const EVENT_STATUSES = ['new', 'acknowledged', 'dismissed', 'escalated'];
const FRAME_LOG_RETENTION_DAYS = 30;
const MAX_IMAGE_BASE64 = 4 * 1024 * 1024; // ~3 MB of JPEG
const GATEWAY_ONLINE_SECONDS = 5 * 60;

// What each analytic means and how a rule is evaluated against a frame's result.
//   cmp 'gte' / 'lte' compare the metric to the rule threshold; 'flag' fires when the flag is true;
//   'present' fires when at least one person is seen (threshold fixed at 1).
export const ANALYTICS = {
  crowd_density: { label: 'Crowd or queue', help: 'Alert when the number of people is at or above the limit.', metric: 'people', cmp: 'gte', threshold: 'required', defaultSeverity: 'medium' },
  person_count: { label: 'Area unattended', help: 'Alert when the number of people is at or below the limit (e.g. a desk with nobody at it).', metric: 'people', cmp: 'lte', threshold: 'required', defaultSeverity: 'low' },
  vehicle_count: { label: 'Vehicle congestion', help: 'Alert when the number of vehicles is at or above the limit.', metric: 'vehicles', cmp: 'gte', threshold: 'required', defaultSeverity: 'low' },
  restricted_area: { label: 'Intrusion in restricted area', help: 'Alert when anyone is seen in an area that should be empty or staff-only.', metric: 'people', cmp: 'present', threshold: 'none', defaultSeverity: 'high' },
  after_hours_presence: { label: 'After-hours presence', help: 'Alert when anyone is seen inside the scheduled window (needs a schedule).', metric: 'people', cmp: 'present', threshold: 'none', defaultSeverity: 'high', needsSchedule: true },
  fall_or_collapse: { label: 'Person down', help: 'Alert when a person appears to be lying on the floor.', metric: 'fall_or_collapse', cmp: 'flag', threshold: 'none', defaultSeverity: 'high' },
  fire_smoke: { label: 'Fire or smoke', help: 'Alert when flames or smoke are visible. Supplements, never replaces, the fire alarm system.', metric: 'fire_smoke', cmp: 'flag', threshold: 'none', defaultSeverity: 'high' },
  blocked_exit: { label: 'Blocked exit or route', help: 'Alert when an exit or escape route appears obstructed.', metric: 'blocked_exit', cmp: 'flag', threshold: 'none', defaultSeverity: 'medium' },
  abandoned_object: { label: 'Unattended object', help: 'Alert when a bag or package appears to be left unattended.', metric: 'abandoned_object', cmp: 'flag', threshold: 'none', defaultSeverity: 'medium' },
};

const NATIVE_EVENTS = {
  intrusion: { severity: 'high', label: 'Intrusion (camera alarm)' },
  line_crossing: { severity: 'medium', label: 'Line crossing (camera alarm)' },
  tamper: { severity: 'high', label: 'Camera tampering' },
  video_loss: { severity: 'high', label: 'Video loss' },
};
const NATIVE_IGNORED = new Set(['motion', 'video_restored']); // status updates only, no event
const NATIVE_DEDUPE_SECONDS = 60;

const DEFAULT_PRIVACY_BY_ZONE = {
  entrance: 'public', perimeter: 'public', parking: 'public', corridor: 'public', lobby: 'public',
  emergency: 'restricted', pharmacy: 'restricted', server_room: 'restricted', store: 'restricted',
  ward: 'clinical', icu: 'clinical', ot: 'clinical', other: 'restricted',
};

const oneOf = (value, allowed, field) => {
  if (!allowed.includes(value)) throw new SurveillanceError(`${field} must be one of: ${allowed.join(', ')}`);
  return value;
};
const str = (v, max) => (v === undefined || v === null || String(v).trim() === '' ? null : String(v).trim().slice(0, max));
const hashKey = (key) => crypto.createHash('sha256').update(String(key)).digest('hex');

// ── vision (injectable for tests) ───────────────────────────────────────────
const VISION_PROMPT = `You count and flag things in a hospital security camera frame. Do NOT identify or describe any person (no faces, names, clothing, age, gender). Report only:
- people: number of people visible (integer)
- vehicles: number of vehicles visible (integer)
- fall_or_collapse: true if a person appears to be lying on the floor, otherwise false
- fire_smoke: true only if flames or smoke are clearly visible, otherwise false
- blocked_exit: true if an exit door or escape route appears blocked by objects, otherwise false
- abandoned_object: true if a bag or package appears left unattended, otherwise false
- confidence: "high", "medium" or "low" for the image as a whole
- description: one neutral sentence about the scene with no personal details
Respond ONLY with JSON:
{"people":0,"vehicles":0,"fall_or_collapse":false,"fire_smoke":false,"blocked_exit":false,"abandoned_object":false,"confidence":"high","description":""}`;

const externalVisionAllowed = () => String(process.env.SURVEILLANCE_ALLOW_EXTERNAL_VISION || '').toLowerCase() === 'true';

async function defaultVision({ base64Image, mimeType }) {
  // Camera frames show people: stay on the on-premises / SIB provider unless the
  // operator has explicitly opted in to the external cascade.
  const res = await llmProvider.vision({
    base64Image, mimeType, prompt: VISION_PROMPT, maxTokens: 300,
    forceProvider: externalVisionAllowed() ? null : 'isha-inc',
  });
  return { content: res.content, provider: res.provider };
}

let visionFn = defaultVision;
/** Test seam only: replace the vision call. Pass null to restore the real one. */
export function __setVisionForTests(fn) { visionFn = fn || defaultVision; }

function parseVision(content) {
  let j;
  try { j = JSON.parse(String(content || '').replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()); } catch { return null; }
  if (!j || typeof j !== 'object') return null;
  const n = (v) => Math.min(Math.max(Math.round(Number(v) || 0), 0), 1000);
  return {
    people: n(j.people), vehicles: n(j.vehicles),
    fall_or_collapse: j.fall_or_collapse === true, fire_smoke: j.fire_smoke === true,
    blocked_exit: j.blocked_exit === true, abandoned_object: j.abandoned_object === true,
    confidence: ['high', 'medium', 'low'].includes(j.confidence) ? j.confidence : 'low',
    description: String(j.description || '').slice(0, 300),
  };
}

// ── schedule helpers (hospital-local time) ──────────────────────────────────
function localMinutes(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(date);
  const h = Number(parts.find((p) => p.type === 'hour').value) % 24;
  return h * 60 + Number(parts.find((p) => p.type === 'minute').value);
}
const hhmm = (s) => { const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(s || '')); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
export function scheduleActive(schedule, date = new Date()) {
  if (!schedule) return true;
  const a = hhmm(schedule.start); const b = hhmm(schedule.end);
  if (a === null || b === null) return true;
  const now = localMinutes(date);
  return a <= b ? now >= a && now < b : now >= a || now < b; // window may wrap midnight
}
function cleanSchedule(s) {
  if (s === undefined || s === null || s === '') return null;
  if (typeof s !== 'object' || hhmm(s.start) === null || hhmm(s.end) === null || s.start === s.end) {
    throw new SurveillanceError('schedule must be {"start":"HH:MM","end":"HH:MM"} with different times');
  }
  return { start: s.start, end: s.end };
}

// Rule evaluation against one frame's result.
function ruleFires(def, rule, r) {
  const value = r[def.metric];
  if (def.cmp === 'flag') return value === true;
  if (def.cmp === 'present') return value >= 1;
  if (def.cmp === 'gte') return value >= rule.threshold;
  if (def.cmp === 'lte') return value <= rule.threshold;
  return false;
}
function describeFire(rule, def, r) {
  if (def.cmp === 'flag') return `${def.label}: ${r.description || 'detected'}`;
  if (def.cmp === 'present') return `${def.label}: ${r[def.metric]} ${r[def.metric] === 1 ? 'person' : 'people'} seen`;
  const noun = def.metric === 'vehicles' ? 'vehicles' : 'people';
  return `${def.label}: ${r[def.metric]} ${noun} (limit ${def.cmp === 'gte' ? 'at least' : 'at most'} ${rule.threshold})`;
}

// ── in-memory edge rate limit ───────────────────────────────────────────────
const EDGE_LIMIT = 240; const EDGE_WINDOW_MS = 60 * 1000;
const edgeHits = new Map();
export function edgeRateLimited(gatewayId) {
  const now = Date.now(); const e = edgeHits.get(gatewayId);
  if (!e || now - e.start >= EDGE_WINDOW_MS) { edgeHits.set(gatewayId, { start: now, count: 1 }); return false; }
  e.count += 1;
  return e.count > EDGE_LIMIT;
}
setInterval(() => { const cutoff = Date.now() - EDGE_WINDOW_MS; for (const [id, e] of edgeHits) if (e.start < cutoff) edgeHits.delete(id); }, EDGE_WINDOW_MS).unref();

class SurveillanceService {
  // ── Gateways (edge agents) ────────────────────────────────────────────
  async registerGateway(org, { name, siteLabel, createdBy }) {
    const clean = str(name, 120);
    if (!clean) throw new SurveillanceError('name is required');
    const apiKey = `sgw_${crypto.randomBytes(32).toString('hex')}`; // shown once, never stored
    const { rows } = await pool.query(
      `INSERT INTO surveillance_gateway (organization_id, name, site_label, api_key_hash, created_by)
       VALUES ($1,$2,$3,$4,$5) RETURNING id, organization_id, name, site_label, is_active, last_seen_at, created_at`,
      [org, clean, str(siteLabel, 120), hashKey(apiKey), createdBy || null]
    );
    return { gateway: rows[0], apiKey };
  }

  async listGateways(org) {
    const { rows } = await pool.query(
      `SELECT g.id, g.name, g.site_label, g.is_active, g.last_seen_at, g.agent_version, g.created_at,
              COALESCE(g.last_seen_at > NOW() - ($2 || ' seconds')::interval, false) AS online,
              (SELECT COUNT(*) FROM surveillance_recorder r WHERE r.gateway_id = g.id AND r.is_active)::int AS recorders
       FROM surveillance_gateway g WHERE g.organization_id = $1 ORDER BY g.id`,
      [org, String(GATEWAY_ONLINE_SECONDS)]
    );
    return rows;
  }

  async deactivateGateway(org, id) {
    const { rows } = await pool.query(
      `UPDATE surveillance_gateway SET is_active = false WHERE id = $1 AND organization_id = $2 AND is_active RETURNING id, name, is_active`,
      [id, org]
    );
    return rows[0];
  }

  /** Edge auth: hashed key lookup; also stamps last_seen and the agent version. */
  async authenticateGateway(apiKey, agentVersion = null) {
    if (typeof apiKey !== 'string' || !apiKey || apiKey.length > 256) return null;
    const { rows } = await pool.query(
      `UPDATE surveillance_gateway SET last_seen_at = NOW(), agent_version = COALESCE($2, agent_version)
       WHERE api_key_hash = $1 AND is_active RETURNING id, organization_id, name`,
      [hashKey(apiKey), str(agentVersion, 40)]
    );
    return rows[0] || null;
  }

  // ── Recorders ─────────────────────────────────────────────────────────
  async listRecorders(org) {
    const { rows } = await pool.query(
      `SELECT r.*, g.name AS gateway_name,
              (SELECT COUNT(*) FROM surveillance_camera c WHERE c.recorder_id = r.id AND c.is_active)::int AS cameras
       FROM surveillance_recorder r LEFT JOIN surveillance_gateway g ON g.id = r.gateway_id
       WHERE r.organization_id = $1 AND r.is_active ORDER BY r.id`,
      [org]
    );
    return rows;
  }

  _recorderFields(input, { partial = false } = {}) {
    const out = {};
    if (!partial || input.name !== undefined) { const n = str(input.name, 120); if (!n) throw new SurveillanceError('name is required'); out.name = n; }
    if (input.kind !== undefined) out.kind = oneOf(input.kind, RECORDER_KINDS, 'kind');
    if (input.vendor !== undefined) out.vendor = oneOf(input.vendor, VENDORS, 'vendor');
    if (input.model !== undefined) out.model = str(input.model, 80);
    if (input.host !== undefined) {
      const h = str(input.host, 255);
      if (h && !/^[A-Za-z0-9.\-:]+$/.test(h)) throw new SurveillanceError('host is not valid');
      out.host = h;
    }
    if (input.port !== undefined && input.port !== null && input.port !== '') {
      const p = Number(input.port);
      if (!Number.isInteger(p) || p < 1 || p > 65535) throw new SurveillanceError('port must be between 1 and 65535');
      out.port = p;
    }
    if (input.channelCount !== undefined && input.channelCount !== null && input.channelCount !== '') {
      const c = Number(input.channelCount);
      if (!Number.isInteger(c) || c < 1 || c > 256) throw new SurveillanceError('channelCount must be between 1 and 256');
      out.channel_count = c;
    }
    if (input.note !== undefined) out.note = str(input.note, 500);
    return out;
  }

  async _assertGateway(org, gatewayId) {
    if (gatewayId === undefined || gatewayId === null || gatewayId === '') return null;
    const { rows } = await pool.query(`SELECT id FROM surveillance_gateway WHERE id = $1 AND organization_id = $2 AND is_active`, [Number(gatewayId), org]);
    if (!rows[0]) throw new SurveillanceError('Gateway not found', { status: 404, code: 'GATEWAY_NOT_FOUND' });
    return rows[0].id;
  }

  async createRecorder(org, input) {
    const fields = this._recorderFields(input);
    fields.gateway_id = await this._assertGateway(org, input.gatewayId);
    const cols = ['organization_id', ...Object.keys(fields)];
    try {
      const { rows } = await pool.query(
        `INSERT INTO surveillance_recorder (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING *`,
        [org, ...Object.values(fields)]
      );
      return rows[0];
    } catch (e) {
      if (e.code === '23505') throw new SurveillanceError('A recorder with this name already exists', { status: 409, code: 'DUPLICATE_RECORDER' });
      throw e;
    }
  }

  async updateRecorder(org, id, input) {
    const fields = this._recorderFields(input, { partial: true });
    if (input.gatewayId !== undefined) fields.gateway_id = await this._assertGateway(org, input.gatewayId);
    const keys = Object.keys(fields);
    if (!keys.length) throw new SurveillanceError('Nothing to update');
    try {
      const { rows } = await pool.query(
        `UPDATE surveillance_recorder SET ${keys.map((k, i) => `${k} = $${i + 3}`).join(', ')} WHERE id = $1 AND organization_id = $2 AND is_active RETURNING *`,
        [id, org, ...Object.values(fields)]
      );
      return rows[0];
    } catch (e) {
      if (e.code === '23505') throw new SurveillanceError('A recorder with this name already exists', { status: 409, code: 'DUPLICATE_RECORDER' });
      throw e;
    }
  }

  async archiveRecorder(org, id) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(`UPDATE surveillance_recorder SET is_active = false WHERE id = $1 AND organization_id = $2 AND is_active RETURNING id`, [id, org]);
      if (!rows[0]) { await client.query('ROLLBACK'); return undefined; }
      await client.query(`UPDATE surveillance_camera SET is_active = false WHERE recorder_id = $1 AND organization_id = $2`, [id, org]);
      await client.query('COMMIT');
      return rows[0];
    } catch (e) { await client.query('ROLLBACK').catch(() => {}); throw e; } finally { client.release(); }
  }

  // ── Cameras ───────────────────────────────────────────────────────────
  async listCameras(org) {
    const { rows } = await pool.query(
      `SELECT c.*, r.name AS recorder_name, r.gateway_id,
              (SELECT COUNT(*) FROM surveillance_rule x WHERE x.camera_id = c.id AND x.is_enabled)::int AS rule_count,
              (SELECT COUNT(*) FROM surveillance_event e WHERE e.camera_id = c.id AND e.status = 'new')::int AS new_events,
              (c.privacy_class <> 'clinical' OR c.privacy_approved_at IS NOT NULL) AS analytics_allowed
       FROM surveillance_camera c LEFT JOIN surveillance_recorder r ON r.id = c.recorder_id
       WHERE c.organization_id = $1 AND c.is_active ORDER BY c.id`,
      [org]
    );
    return rows;
  }

  async getCamera(org, id) {
    const { rows } = await pool.query(
      `SELECT c.*, r.name AS recorder_name, r.gateway_id,
              (c.privacy_class <> 'clinical' OR c.privacy_approved_at IS NOT NULL) AS analytics_allowed
       FROM surveillance_camera c LEFT JOIN surveillance_recorder r ON r.id = c.recorder_id
       WHERE c.id = $1 AND c.organization_id = $2 AND c.is_active`,
      [id, org]
    );
    return rows[0];
  }

  async _assertRecorder(org, recorderId) {
    if (recorderId === undefined || recorderId === null || recorderId === '') return null;
    const { rows } = await pool.query(`SELECT id FROM surveillance_recorder WHERE id = $1 AND organization_id = $2 AND is_active`, [Number(recorderId), org]);
    if (!rows[0]) throw new SurveillanceError('Recorder not found', { status: 404, code: 'RECORDER_NOT_FOUND' });
    return rows[0].id;
  }

  _cameraFields(input, { partial = false } = {}) {
    const out = {};
    if (!partial || input.name !== undefined) { const n = str(input.name, 120); if (!n) throw new SurveillanceError('name is required'); out.name = n; }
    if (input.zone !== undefined) out.zone = str(input.zone, 120);
    if (input.zoneType !== undefined) out.zone_type = oneOf(input.zoneType, ZONE_TYPES, 'zoneType');
    if (input.channelNo !== undefined && input.channelNo !== null && input.channelNo !== '') {
      const c = Number(input.channelNo);
      if (!Number.isInteger(c) || c < 1 || c > 256) throw new SurveillanceError('channelNo must be between 1 and 256');
      out.channel_no = c;
    }
    if (input.analysisIntervalSeconds !== undefined) {
      const s = Number(input.analysisIntervalSeconds);
      if (!Number.isInteger(s) || s < 10 || s > 3600) throw new SurveillanceError('analysisIntervalSeconds must be between 10 and 3600');
      out.analysis_interval_seconds = s;
    }
    if (input.dailyFrameBudget !== undefined) {
      const b = Number(input.dailyFrameBudget);
      if (!Number.isInteger(b) || b < 0 || b > 20000) throw new SurveillanceError('dailyFrameBudget must be between 0 and 20000');
      out.daily_frame_budget = b;
    }
    if (typeof input.isEnabled === 'boolean') out.is_enabled = input.isEnabled;
    return out;
  }

  async createCamera(org, input) {
    const fields = this._cameraFields(input);
    fields.recorder_id = await this._assertRecorder(org, input.recorderId);
    const zoneType = fields.zone_type || 'other';
    fields.zone_type = zoneType;
    fields.privacy_class = input.privacyClass !== undefined ? oneOf(input.privacyClass, PRIVACY_CLASSES, 'privacyClass') : DEFAULT_PRIVACY_BY_ZONE[zoneType];
    const cols = ['organization_id', ...Object.keys(fields)];
    try {
      const { rows } = await pool.query(
        `INSERT INTO surveillance_camera (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id`,
        [org, ...Object.values(fields)]
      );
      return this.getCamera(org, rows[0].id);
    } catch (e) {
      if (e.code === '23505') throw new SurveillanceError('That recorder channel already has a camera', { status: 409, code: 'DUPLICATE_CHANNEL' });
      throw e;
    }
  }

  async updateCamera(org, id, input) {
    const fields = this._cameraFields(input, { partial: true });
    if (input.recorderId !== undefined) fields.recorder_id = await this._assertRecorder(org, input.recorderId);
    if (input.privacyClass !== undefined) {
      fields.privacy_class = oneOf(input.privacyClass, PRIVACY_CLASSES, 'privacyClass');
      // Reclassifying resets any earlier approval: an admin must re-approve a clinical camera.
      fields.privacy_approved_by = null; fields.privacy_approved_at = null; fields.privacy_note = null;
    }
    const keys = Object.keys(fields);
    if (!keys.length) throw new SurveillanceError('Nothing to update');
    try {
      const { rows } = await pool.query(
        `UPDATE surveillance_camera SET ${keys.map((k, i) => `${k} = $${i + 3}`).join(', ')} WHERE id = $1 AND organization_id = $2 AND is_active RETURNING id`,
        [id, org, ...Object.values(fields)]
      );
      return rows[0] ? this.getCamera(org, id) : undefined;
    } catch (e) {
      if (e.code === '23505') throw new SurveillanceError('That recorder channel already has a camera', { status: 409, code: 'DUPLICATE_CHANNEL' });
      throw e;
    }
  }

  async archiveCamera(org, id) {
    const { rows } = await pool.query(`UPDATE surveillance_camera SET is_active = false WHERE id = $1 AND organization_id = $2 AND is_active RETURNING id`, [id, org]);
    return rows[0];
  }

  // A clinical-area camera may only run analytics once an administrator has reviewed it.
  async approvePrivacy(org, id, { userId, note }) {
    const n = str(note, 500);
    if (!n) throw new SurveillanceError('A privacy review note is required (who agreed, why analytics is justified here)');
    const { rows } = await pool.query(
      `UPDATE surveillance_camera SET privacy_approved_by = $3, privacy_approved_at = NOW(), privacy_note = $4
       WHERE id = $1 AND organization_id = $2 AND is_active AND privacy_class = 'clinical' RETURNING id`,
      [id, org, userId || null, n]
    );
    if (rows[0]) return this.getCamera(org, id);
    const cam = await this.getCamera(org, id);
    if (cam) throw new SurveillanceError('Only clinical-area cameras need a privacy approval', { status: 409, code: 'NOT_CLINICAL' });
    return undefined;
  }

  async revokePrivacy(org, id) {
    const { rows } = await pool.query(
      `UPDATE surveillance_camera SET privacy_approved_by = NULL, privacy_approved_at = NULL, privacy_note = NULL
       WHERE id = $1 AND organization_id = $2 AND is_active RETURNING id`,
      [id, org]
    );
    return rows[0] ? this.getCamera(org, id) : undefined;
  }

  // ── Rules ─────────────────────────────────────────────────────────────
  async listRules(org, cameraId) {
    const { rows } = await pool.query(
      `SELECT * FROM surveillance_rule WHERE organization_id = $1 AND camera_id = $2 ORDER BY id`,
      [org, cameraId]
    );
    return rows;
  }

  _ruleFields(input, existing = null) {
    const analytic = input.analytic !== undefined ? oneOf(input.analytic, Object.keys(ANALYTICS), 'analytic') : existing?.analytic;
    if (!analytic) throw new SurveillanceError('analytic is required');
    const def = ANALYTICS[analytic];
    const out = { analytic };
    if (def.threshold === 'required') {
      const raw = input.threshold !== undefined ? input.threshold : existing?.threshold;
      const t = Number(raw);
      const min = def.cmp === 'lte' ? 0 : 1;
      if (raw === undefined || raw === null || raw === '' || !Number.isInteger(t) || t < min || t > 1000) throw new SurveillanceError(`threshold must be a whole number between ${min} and 1000 for ${def.label}`);
      out.threshold = t;
    } else {
      out.threshold = null;
    }
    if (input.severity !== undefined) out.severity = oneOf(input.severity, SEVERITIES, 'severity');
    else if (!existing) out.severity = def.defaultSeverity;
    if (input.cooldownMinutes !== undefined) {
      const c = Number(input.cooldownMinutes);
      if (!Number.isInteger(c) || c < 0 || c > 1440) throw new SurveillanceError('cooldownMinutes must be between 0 and 1440');
      out.cooldown_minutes = c;
    }
    if (input.schedule !== undefined || !existing) out.schedule = input.schedule === undefined ? null : cleanSchedule(input.schedule);
    const schedule = 'schedule' in out ? out.schedule : existing?.schedule;
    if (def.needsSchedule && !schedule) throw new SurveillanceError('After-hours presence needs a schedule window');
    if (input.config !== undefined) {
      if (input.config === null || typeof input.config !== 'object' || Array.isArray(input.config)) throw new SurveillanceError('config must be an object');
      out.config = JSON.stringify({ note: str(input.config.note, 200) });
    }
    if (typeof input.isEnabled === 'boolean') out.is_enabled = input.isEnabled;
    if (out.schedule !== undefined && out.schedule !== null) out.schedule = JSON.stringify(out.schedule);
    return out;
  }

  async createRule(org, cameraId, input, userId = null) {
    const cam = await this.getCamera(org, cameraId);
    if (!cam) return undefined;
    if (!cam.analytics_allowed) {
      throw new SurveillanceError('This camera covers a clinical area. An administrator must complete a privacy review before analytics can be enabled.', { status: 409, code: 'PRIVACY_REVIEW_REQUIRED' });
    }
    const fields = this._ruleFields(input);
    const cols = ['organization_id', 'camera_id', 'created_by', ...Object.keys(fields)];
    const { rows } = await pool.query(
      `INSERT INTO surveillance_rule (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING *`,
      [org, cameraId, userId, ...Object.values(fields)]
    );
    return rows[0];
  }

  async updateRule(org, ruleId, input) {
    const { rows: existing } = await pool.query(`SELECT * FROM surveillance_rule WHERE id = $1 AND organization_id = $2`, [ruleId, org]);
    if (!existing[0]) return undefined;
    const fields = this._ruleFields({ ...input, analytic: existing[0].analytic }, existing[0]);
    delete fields.analytic;
    const keys = Object.keys(fields);
    if (!keys.length) throw new SurveillanceError('Nothing to update');
    const { rows } = await pool.query(
      `UPDATE surveillance_rule SET ${keys.map((k, i) => `${k} = $${i + 3}`).join(', ')} WHERE id = $1 AND organization_id = $2 RETURNING *`,
      [ruleId, org, ...Object.values(fields)]
    );
    return rows[0];
  }

  async deleteRule(org, ruleId) {
    // Events keep their rule reference for history, so a rule is switched off, not deleted.
    const { rows } = await pool.query(`UPDATE surveillance_rule SET is_enabled = false WHERE id = $1 AND organization_id = $2 RETURNING id`, [ruleId, org]);
    return rows[0];
  }

  // ── Edge: configuration, heartbeat, frames, native events ─────────────
  async getEdgeConfig(gateway) {
    const { rows } = await pool.query(
      `SELECT c.id AS camera_id, c.name, c.channel_no, c.analysis_interval_seconds, r.name AS recorder_name, r.vendor, r.port AS recorder_port,
              (c.privacy_class <> 'clinical' OR c.privacy_approved_at IS NOT NULL)
                AND EXISTS (SELECT 1 FROM surveillance_rule x WHERE x.camera_id = c.id AND x.is_enabled) AS wants_frames
       FROM surveillance_camera c JOIN surveillance_recorder r ON r.id = c.recorder_id
       WHERE r.gateway_id = $1 AND c.organization_id = $2 AND c.is_active AND c.is_enabled AND r.is_active AND c.channel_no IS NOT NULL
       ORDER BY c.id`,
      [gateway.id, gateway.organization_id]
    );
    return {
      gateway: { id: gateway.id, name: gateway.name },
      cameras: rows.map((r) => ({ cameraId: r.camera_id, name: r.name, recorder: r.recorder_name, vendor: r.vendor, channelNo: r.channel_no, intervalSeconds: r.analysis_interval_seconds, wantsFrames: r.wants_frames })),
    };
  }

  async heartbeat(gateway, { cameras = [], recorders = [] } = {}) {
    let updated = 0;
    for (const c of Array.isArray(cameras) ? cameras.slice(0, 512) : []) {
      const id = Number(c?.cameraId);
      if (!Number.isInteger(id) || typeof c.online !== 'boolean') continue;
      const { rowCount } = await pool.query(
        `UPDATE surveillance_camera c SET status = $3
         FROM surveillance_recorder r
         WHERE c.id = $1 AND c.organization_id = $2 AND r.id = c.recorder_id AND r.gateway_id = $4`,
        [id, gateway.organization_id, c.online ? 'online' : 'offline', gateway.id]
      );
      updated += rowCount;
    }
    for (const r of Array.isArray(recorders) ? recorders.slice(0, 64) : []) {
      if (typeof r?.name !== 'string' || typeof r.online !== 'boolean') continue;
      await pool.query(
        `UPDATE surveillance_recorder SET status = $3, last_seen_at = CASE WHEN $3 = 'online' THEN NOW() ELSE last_seen_at END
         WHERE organization_id = $1 AND gateway_id = $4 AND lower(name) = lower($2) AND is_active`,
        [gateway.organization_id, r.name, r.online ? 'online' : 'offline', gateway.id]
      );
    }
    return { camerasUpdated: updated };
  }

  async _cameraForGateway(gateway, cameraId) {
    const { rows } = await pool.query(
      `SELECT c.*, (c.privacy_class <> 'clinical' OR c.privacy_approved_at IS NOT NULL) AS analytics_allowed
       FROM surveillance_camera c JOIN surveillance_recorder r ON r.id = c.recorder_id
       WHERE c.id = $1 AND c.organization_id = $2 AND r.gateway_id = $3 AND c.is_active AND c.is_enabled AND r.is_active`,
      [cameraId, gateway.organization_id, gateway.id]
    );
    return rows[0];
  }

  async ingestFrame(gateway, { cameraId, imageBase64, mimeType = 'image/jpeg' }) {
    const id = Number(cameraId);
    if (!Number.isInteger(id)) throw new SurveillanceError('cameraId is required');
    if (!['image/jpeg', 'image/png'].includes(mimeType)) throw new SurveillanceError('mimeType must be image/jpeg or image/png');
    if (typeof imageBase64 !== 'string' || !/^[A-Za-z0-9+/=]+$/.test(imageBase64) || imageBase64.length < 8) throw new SurveillanceError('imageBase64 must be base64 image data');
    if (imageBase64.length > MAX_IMAGE_BASE64) throw new SurveillanceError('Frame is too large (max ~3 MB)', { status: 413 });

    const cam = await this._cameraForGateway(gateway, id);
    if (!cam) throw new SurveillanceError('Camera not found for this gateway', { status: 404, code: 'CAMERA_NOT_FOUND' });
    await pool.query(`UPDATE surveillance_camera SET last_frame_at = NOW(), status = 'online' WHERE id = $1`, [id]);

    if (!cam.analytics_allowed) return { outcome: 'skipped_privacy', events: [] };

    const { rows: rules } = await pool.query(`SELECT * FROM surveillance_rule WHERE camera_id = $1 AND organization_id = $2 AND is_enabled`, [id, gateway.organization_id]);
    const active = rules.filter((r) => scheduleActive(r.schedule));
    if (!active.length) return { outcome: 'skipped_no_rules', events: [] };

    const { rows: spent } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM surveillance_frame_log
       WHERE camera_id = $1 AND outcome = 'analysed' AND (received_at AT TIME ZONE '${TZ}')::date = (NOW() AT TIME ZONE '${TZ}')::date`,
      [id]
    );
    if (spent[0].n >= cam.daily_frame_budget) return { outcome: 'skipped_budget', events: [] };

    // Claim the analysis slot atomically so parallel frames cannot both run the model.
    const { rows: claim } = await pool.query(
      `UPDATE surveillance_camera SET last_analysed_at = NOW()
       WHERE id = $1 AND (last_analysed_at IS NULL OR last_analysed_at <= NOW() - (analysis_interval_seconds || ' seconds')::interval) RETURNING id`,
      [id]
    );
    if (!claim[0]) return { outcome: 'skipped_interval', events: [] };

    const started = Date.now();
    let raw;
    try {
      raw = await visionFn({ base64Image: imageBase64, mimeType });
    } catch (e) {
      await this._logFrame(gateway, id, 'vision_unavailable', null, Date.now() - started, { error: String(e.message || e).slice(0, 200) });
      return { outcome: 'vision_unavailable', events: [] };
    }
    const result = parseVision(raw?.content);
    const latency = Date.now() - started;
    if (!result) {
      await this._logFrame(gateway, id, 'vision_unreadable', raw?.provider, latency, null);
      return { outcome: 'vision_unreadable', events: [] };
    }
    await this._logFrame(gateway, id, 'analysed', raw?.provider, latency, result);

    const events = [];
    for (const rule of active) {
      const def = ANALYTICS[rule.analytic];
      if (!def || !ruleFires(def, rule, result)) continue;
      const { rows } = await pool.query(
        `INSERT INTO surveillance_event (organization_id, camera_id, rule_id, source, analytic, severity, observed_count, confidence, description)
         SELECT $1, $2, $3, 'vision', $4, $5, $6, $7, $8
         WHERE NOT EXISTS (SELECT 1 FROM surveillance_event WHERE rule_id = $3 AND detected_at > NOW() - ($9 || ' minutes')::interval)
         RETURNING id, analytic, severity`,
        [gateway.organization_id, id, rule.id, rule.analytic, rule.severity, def.cmp === 'flag' ? null : result[def.metric], result.confidence, describeFire(rule, def, result), String(rule.cooldown_minutes)]
      );
      if (rows[0]) events.push(rows[0]);
    }
    return { outcome: 'analysed', events, counts: { people: result.people, vehicles: result.vehicles } };
  }

  async _logFrame(gateway, cameraId, outcome, provider, latencyMs, result) {
    await pool.query(
      `INSERT INTO surveillance_frame_log (organization_id, camera_id, gateway_id, outcome, provider, latency_ms, result) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [gateway.organization_id, cameraId, gateway.id, outcome, provider || null, latencyMs, result ? JSON.stringify(result) : null]
    );
  }

  /** Alarms raised by the DVR/camera itself (intrusion, line crossing, tamper, video loss). */
  async ingestNativeEvents(gateway, events) {
    if (!Array.isArray(events)) throw new SurveillanceError('events must be an array');
    if (events.length > 200) throw new SurveillanceError('A maximum of 200 events per request is allowed');
    let stored = 0; let ignored = 0; let rejected = 0;
    for (const ev of events) {
      const type = String(ev?.type || '');
      const camId = Number(ev?.cameraId);
      if (!Number.isInteger(camId) || (!NATIVE_EVENTS[type] && !NATIVE_IGNORED.has(type))) { rejected += 1; continue; }
      const cam = await this._cameraForGateway(gateway, camId);
      if (!cam) { rejected += 1; continue; }
      if (type === 'video_loss') await pool.query(`UPDATE surveillance_camera SET status = 'offline' WHERE id = $1`, [camId]);
      if (type === 'video_restored') await pool.query(`UPDATE surveillance_camera SET status = 'online' WHERE id = $1`, [camId]);
      if (NATIVE_IGNORED.has(type)) { ignored += 1; continue; }
      const def = NATIVE_EVENTS[type];
      const { rows } = await pool.query(
        `INSERT INTO surveillance_event (organization_id, camera_id, source, analytic, severity, description)
         SELECT $1, $2, 'camera_native', $3, $4, $5
         WHERE NOT EXISTS (SELECT 1 FROM surveillance_event WHERE camera_id = $2 AND analytic = $3 AND source = 'camera_native' AND detected_at > NOW() - ($6 || ' seconds')::interval)
         RETURNING id`,
        [gateway.organization_id, camId, type, def.severity, def.label, String(NATIVE_DEDUPE_SECONDS)]
      );
      if (rows[0]) stored += 1; else ignored += 1;
    }
    return { stored, ignored, rejected };
  }

  // ── Events ────────────────────────────────────────────────────────────
  async listEvents(org, { status = null, cameraId = null, analytic = null, limit = 100 } = {}) {
    const params = [org];
    const where = ['e.organization_id = $1'];
    if (status) { params.push(oneOf(status, EVENT_STATUSES, 'status')); where.push(`e.status = $${params.length}`); }
    if (cameraId) { params.push(cameraId); where.push(`e.camera_id = $${params.length}`); }
    if (analytic) { params.push(String(analytic)); where.push(`e.analytic = $${params.length}`); }
    params.push(Math.min(Math.max(Number(limit) || 100, 1), 500));
    const { rows } = await pool.query(
      `SELECT e.*, c.name AS camera_name, c.zone AS camera_zone
       FROM surveillance_event e JOIN surveillance_camera c ON c.id = e.camera_id
       WHERE ${where.join(' AND ')} ORDER BY e.detected_at DESC, e.id DESC LIMIT $${params.length}`,
      params
    );
    return rows;
  }

  async handleEvent(org, id, { status, note, userId }) {
    oneOf(status, ['acknowledged', 'dismissed', 'escalated'], 'status');
    const n = str(note, 500);
    if ((status === 'dismissed' || status === 'escalated') && !n) throw new SurveillanceError(`A note is required to ${status === 'dismissed' ? 'dismiss' : 'escalate'} an event`);
    const { rows } = await pool.query(
      `UPDATE surveillance_event SET status = $3, handled_by = $4, handled_at = NOW(), handler_note = $5
       WHERE id = $1 AND organization_id = $2 AND status IN ('new', 'acknowledged') RETURNING *`,
      [id, org, status, userId || null, n]
    );
    if (rows[0]) return rows[0];
    const { rows: ex } = await pool.query(`SELECT status FROM surveillance_event WHERE id = $1 AND organization_id = $2`, [id, org]);
    if (ex[0]) throw new SurveillanceError(`Event is already ${ex[0].status}`, { status: 409, code: 'INVALID_STATE' });
    return undefined;
  }

  // ── Overview ──────────────────────────────────────────────────────────
  async getOverview(org) {
    const { rows } = await pool.query(
      `SELECT
         (SELECT COUNT(*) FROM surveillance_camera WHERE organization_id = $1 AND is_active)::int AS cameras,
         (SELECT COUNT(*) FROM surveillance_camera WHERE organization_id = $1 AND is_active AND status = 'online')::int AS cameras_online,
         (SELECT COUNT(*) FROM surveillance_camera WHERE organization_id = $1 AND is_active AND status = 'offline')::int AS cameras_offline,
         (SELECT COUNT(*) FROM surveillance_camera c WHERE c.organization_id = $1 AND c.is_active AND c.is_enabled
            AND (c.privacy_class <> 'clinical' OR c.privacy_approved_at IS NOT NULL)
            AND EXISTS (SELECT 1 FROM surveillance_rule x WHERE x.camera_id = c.id AND x.is_enabled))::int AS analytics_active,
         (SELECT COUNT(*) FROM surveillance_camera WHERE organization_id = $1 AND is_active AND privacy_class = 'clinical' AND privacy_approved_at IS NULL)::int AS blocked_by_privacy,
         (SELECT COUNT(*) FROM surveillance_gateway WHERE organization_id = $1 AND is_active)::int AS gateways,
         (SELECT COUNT(*) FROM surveillance_gateway WHERE organization_id = $1 AND is_active AND last_seen_at > NOW() - ($2 || ' seconds')::interval)::int AS gateways_online,
         (SELECT COUNT(*) FROM surveillance_event WHERE organization_id = $1 AND status = 'new')::int AS events_new,
         (SELECT COUNT(*) FROM surveillance_event WHERE organization_id = $1 AND status = 'new' AND severity = 'high')::int AS events_new_high,
         (SELECT COUNT(*) FROM surveillance_event WHERE organization_id = $1 AND (detected_at AT TIME ZONE '${TZ}')::date = (NOW() AT TIME ZONE '${TZ}')::date)::int AS events_today,
         (SELECT COUNT(*) FROM surveillance_frame_log WHERE organization_id = $1 AND outcome = 'analysed' AND (received_at AT TIME ZONE '${TZ}')::date = (NOW() AT TIME ZONE '${TZ}')::date)::int AS frames_today,
         (SELECT COUNT(*) FROM surveillance_frame_log WHERE organization_id = $1 AND outcome IN ('vision_unavailable', 'vision_unreadable') AND received_at > NOW() - INTERVAL '30 minutes')::int AS vision_failures_30m,
         (SELECT COUNT(*) FROM surveillance_frame_log WHERE organization_id = $1 AND outcome = 'analysed' AND received_at > NOW() - INTERVAL '30 minutes')::int AS vision_ok_30m`,
      [org, String(GATEWAY_ONLINE_SECONDS)]
    );
    const o = rows[0];
    const visionStatus = o.vision_failures_30m > 0 && o.vision_ok_30m === 0 ? 'unavailable' : o.vision_failures_30m > 0 ? 'degraded' : o.vision_ok_30m > 0 ? 'ok' : 'idle';
    return { ...o, vision_status: visionStatus, external_vision_allowed: externalVisionAllowed() };
  }

  /** Housekeeping: frame logs are operational data, not evidence. */
  async purge() {
    const { rowCount } = await pool.query(`DELETE FROM surveillance_frame_log WHERE received_at < NOW() - ($1 || ' days')::interval`, [String(FRAME_LOG_RETENTION_DAYS)]);
    return { frameLogsDeleted: rowCount };
  }
}

export default new SurveillanceService();
