import pool from '../db/pgPool.js';
import notificationService from './notification.service.js';
import { randomUUID } from 'node:crypto';

export function buildLabExplainerDraft(report = {}) {
  const values = Array.isArray(report.values) ? report.values : [];
  const abnormal = values.filter((value) => String(value.status || '').toLowerCase() === 'high' || String(value.status || '').toLowerCase() === 'low' || value.abnormal === true);
  const lines = abnormal.length
    ? abnormal.map((value) => `• ${value.name || value.test || 'Test'}: ${value.value ?? 'reported'}${value.unit ? ` ${value.unit}` : ''} (${value.status || 'outside the reference range'})`)
    : ['• No out-of-range values were supplied in this report.'];
  return [
    'Draft for clinician review — this explanation is educational and is not a diagnosis.',
    report.summary ? `Report summary: ${String(report.summary).slice(0, 500)}` : 'The report contains the following points for review:',
    ...lines,
    'Please discuss the report and any symptoms with your clinician before changing treatment.',
  ].join('\n');
}

export async function createAgentHandoff({ patientId = null, transcript = '', soap = {}, doctorMatches = [], redFlags = [], reason = 'clinical review required', actorId = null, tenantUid = 'legacy' }) {
  const { rows } = await pool.query(`
    INSERT INTO agent_handoffs (tenant_uid, patient_id, transcript, soap, doctor_matches, red_flags, created_by, handoff_reason)
    VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb, $7, $8)
    RETURNING *
  `, [tenantUid, patientId, String(transcript || '').slice(0, 20000), JSON.stringify(soap || {}), JSON.stringify(doctorMatches || []), JSON.stringify(redFlags || []), actorId, reason]);
  return rows[0];
}

const VALID_CHANNELS = new Set(['whatsapp', 'sms', 'push', 'in-app', 'email']);

function formatInZone(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date).reduce((output, part) => ({ ...output, [part.type]: part.value }), {});
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  };
}

function localDateTimeToUtc(date, time, timeZone) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date) && /^(\d{2}):(\d{2})$/.exec(time);
  if (!match) throw Object.assign(new Error('Schedule date/time is invalid'), { statusCode: 422 });
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const target = Date.UTC(year, month - 1, day, hour, minute);
  let candidate = new Date(target);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const observed = formatInZone(candidate, timeZone);
    const observedUtc = Date.UTC(...observed.date.split('-').map((value, index) => index === 1 ? Number(value) - 1 : Number(value)), observed.hour, observed.minute);
    candidate = new Date(candidate.getTime() + target - observedUtc);
  }
  const verified = formatInZone(candidate, timeZone);
  if (verified.date !== date || verified.hour !== hour || verified.minute !== minute) {
    throw Object.assign(new Error('Schedule falls in a timezone transition and must use a valid local time'), { statusCode: 422 });
  }
  return candidate;
}

function addDays(date, count) {
  const next = new Date(`${date}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + count);
  return next.toISOString().slice(0, 10);
}

function normalizeSchedule(input = {}) {
  const schedule = input && typeof input === 'object' ? input : {};
  const timeZone = String(schedule.timeZone || schedule.timezone || '').trim();
  const startDate = String(schedule.startDate || '').trim();
  const endDate = String(schedule.endDate || '').trim();
  const times = Array.isArray(schedule.times) ? schedule.times.map((value) => String(value).trim()) : [];
  if (!timeZone || !startDate || !endDate || !times.length) {
    throw Object.assign(new Error('schedule.timeZone, schedule.startDate, schedule.endDate and schedule.times are required'), { statusCode: 422 });
  }
  try { Intl.DateTimeFormat(undefined, { timeZone }); } catch { throw Object.assign(new Error('schedule.timeZone must be an IANA timezone'), { statusCode: 422 }); }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate) || startDate > endDate) {
    throw Object.assign(new Error('schedule startDate/endDate must be ordered YYYY-MM-DD values'), { statusCode: 422 });
  }
  if (Math.round((Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86400000) > 366) {
    throw Object.assign(new Error('A reminder plan may cover at most 366 days'), { statusCode: 422 });
  }
  const uniqueTimes = [...new Set(times)].sort();
  if (uniqueTimes.some((time) => !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))) {
    throw Object.assign(new Error('schedule.times must contain 24-hour HH:MM values'), { statusCode: 422 });
  }
  if (schedule.recurrence && schedule.recurrence !== 'daily') {
    throw Object.assign(new Error('Only daily recurrence is currently supported'), { statusCode: 422 });
  }
  return { recurrence: 'daily', timeZone, startDate, endDate, times: uniqueTimes };
}

function normalizeQuietHours(input = {}, timeZone) {
  const quiet = input && typeof input === 'object' ? input : {};
  if (quiet.startHour == null && quiet.endHour == null) return {};
  const startHour = Number(quiet.startHour);
  const endHour = Number(quiet.endHour);
  if (!Number.isInteger(startHour) || !Number.isInteger(endHour) || startHour < 0 || startHour > 23 || endHour < 0 || endHour > 23 || startHour === endHour) {
    throw Object.assign(new Error('quietHours requires different integer startHour and endHour values from 0 to 23'), { statusCode: 422 });
  }
  return { startHour, endHour, timeZone };
}

function occurrenceSpecs(schedule) {
  const items = [];
  for (let date = schedule.startDate; date <= schedule.endDate; date = addDays(date, 1)) {
    for (const time of schedule.times) items.push({ key: `${date}T${time}`, dueAt: localDateTimeToUtc(date, time, schedule.timeZone) });
  }
  return items;
}

export async function createAdherencePlan({ patientId, medication = {}, language = 'en', channel = 'whatsapp', schedule = {}, quietHours = {}, actorId = null, tenantUid = 'legacy' }) {
  const normalizedSchedule = normalizeSchedule(schedule);
  const normalizedQuietHours = normalizeQuietHours(quietHours, normalizedSchedule.timeZone);
  if (!VALID_CHANNELS.has(channel)) throw Object.assign(new Error('Unsupported notification channel'), { statusCode: 422 });
  const { rows } = await pool.query(`
    INSERT INTO adherence_plans (tenant_uid, patient_id, medication, language, channel, schedule, quiet_hours, created_by)
    VALUES ($1, $2, $3::jsonb, $4, $5, $6::jsonb, $7::jsonb, $8)
    RETURNING *
  `, [tenantUid, patientId, JSON.stringify(medication || {}), language, channel, JSON.stringify(normalizedSchedule), JSON.stringify(normalizedQuietHours), actorId]);
  return rows[0];
}

export async function materializeAdherenceEvents(plan) {
  const schedule = normalizeSchedule(plan.schedule || {});
  const created = [];
  for (const occurrence of occurrenceSpecs(schedule)) {
    const { rows } = await pool.query(`
      INSERT INTO adherence_events (tenant_uid, plan_id, due_at, next_attempt_at, occurrence_key)
      VALUES ($1, $2, $3, $3, $4)
      ON CONFLICT (tenant_uid, plan_id, occurrence_key) WHERE occurrence_key IS NOT NULL DO NOTHING
      RETURNING *
    `, [plan.tenant_uid || 'legacy', plan.id, occurrence.dueAt, occurrence.key]);
    if (rows[0]) created.push(rows[0]);
  }
  return created;
}

export async function materializeAdherenceEvent(plan) {
  const events = await materializeAdherenceEvents(plan);
  return events[0] || null;
}

function quietWindowEnd(now, quietHours = {}) {
  const startHour = Number(quietHours.startHour);
  const endHour = Number(quietHours.endHour);
  if (!Number.isInteger(startHour) || !Number.isInteger(endHour)) return null;
  const timeZone = quietHours.timeZone || 'UTC';
  const local = formatInZone(now, timeZone);
  const inQuietHours = startHour < endHour
    ? local.hour >= startHour && local.hour < endHour
    : local.hour >= startHour || local.hour < endHour;
  if (!inQuietHours) return null;
  const endDate = startHour < endHour || local.hour < endHour ? local.date : addDays(local.date, 1);
  return localDateTimeToUtc(endDate, String(endHour).padStart(2, '0') + ':00', timeZone);
}

async function claimDueAdherenceEvents({ now, limit, tenantUid }) {
  const tenantClause = tenantUid ? ' AND e.tenant_uid = $3' : '';
  const params = tenantUid ? [now, limit, tenantUid, randomUUID()] : [now, limit, randomUUID()];
  const claimIndex = tenantUid ? 4 : 3;
  const { rows } = await pool.query(`
    WITH due AS (
      SELECT e.id
      FROM adherence_events e
      JOIN adherence_plans p ON p.id = e.plan_id AND p.tenant_uid = e.tenant_uid
      WHERE e.status IN ('scheduled', 'deferred')
        AND p.active = TRUE
        AND COALESCE(e.next_attempt_at, e.due_at) <= $1${tenantClause}
      ORDER BY COALESCE(e.next_attempt_at, e.due_at), e.id
      LIMIT $2
      FOR UPDATE OF e SKIP LOCKED
    )
    UPDATE adherence_events e
    SET status = 'processing', claimed_at = NOW(), claim_token = $${claimIndex}, attempt_count = e.attempt_count + 1, last_error = NULL
    FROM due, adherence_plans p
    WHERE e.id = due.id AND p.id = e.plan_id AND p.tenant_uid = e.tenant_uid
    RETURNING e.*, p.patient_id, p.channel, p.language, p.quiet_hours, p.medication
  `, params);
  return rows;
}

export async function runDueAdherenceEvents({ now = new Date(), limit = 100, tenantUid = null } = {}) {
  const rows = await claimDueAdherenceEvents({ now, limit, tenantUid });
  const results = [];
  for (const event of rows) {
    const quietUntil = quietWindowEnd(now, event.quiet_hours || {});
    if (quietUntil) {
      await pool.query(`
        UPDATE adherence_events
        SET status = 'deferred', next_attempt_at = $1, claim_token = NULL, claimed_at = NULL
        WHERE id = $2 AND status = 'processing' AND claim_token = $3
      `, [quietUntil, event.id, event.claim_token]);
      results.push({ ...event, status: 'deferred', nextAttemptAt: quietUntil, deliveryDeferred: true, provider: null, delivery: null });
      continue;
    }

    let status = 'sent';
    let delivery = null;
    try {
      const medication = event.medication || {};
      const medicationName = medication.name || medication.medicationName || 'your medication';
      const doseText = medication.dose ? ` (${medication.dose})` : '';
      const localized = event.language === 'hi'
        ? { title: 'दवा लेने की याद', message: `याद रखें: ${medicationName}${doseText} डॉक्टर के अनुसार लें।` }
        : { title: 'Medication reminder', message: `Reminder: please take ${medicationName}${doseText} as prescribed.` };
      delivery = await notificationService.send({
        userId: event.patient_id,
        userType: 'patient',
        type: 'medication_adherence_reminder',
        variables: { medicationName, doseText, language: event.language },
        titleOverride: localized.title,
        messageOverride: localized.message,
        channels: [event.channel || 'whatsapp'],
        data: {
          eventId: `adherence:${event.tenant_uid}:${event.id}`,
          adherenceEventId: event.id,
          adherenceOccurrenceKey: event.occurrence_key,
          language: event.language,
        },
        actionUrl: '/health-diary',
      });
      const channelResults = Object.values(delivery?.channels || {});
      if (delivery?.success === false || channelResults.some((channelResult) => channelResult?.success === false)) status = 'failed';
    } catch (error) {
      status = 'failed';
      delivery = { success: false, error: error.message };
    }
    await pool.query(`
      UPDATE adherence_events
      SET status = $1,
          sent_at = CASE WHEN $1 = 'sent' THEN NOW() ELSE sent_at END,
          provider_message_id = $2,
          next_attempt_at = CASE WHEN $1 = 'failed' THEN NOW() + INTERVAL '5 minutes' ELSE next_attempt_at END,
          claim_token = NULL,
          claimed_at = NULL,
          last_error = $4
      WHERE id = $3 AND status = 'processing' AND claim_token = $5
    `, [status, delivery?.notificationId ? String(delivery.notificationId) : null, event.id, delivery?.error || null, event.claim_token]);
    results.push({ ...event, status, deliveryDeferred: false, provider: event.channel, delivery });
  }
  return results;
}

export async function deliverApprovedLabExplanation({ draftId, tenantUid = 'legacy', channel = 'whatsapp', actorId = null, privileged = false } = {}) {
  if (!VALID_CHANNELS.has(channel)) throw Object.assign(new Error('Unsupported notification channel'), { statusCode: 422 });
  const claimToken = randomUUID();
  const { rows } = await pool.query(`
    UPDATE lab_explainer_drafts
    SET delivery_claim_token = $1,
        delivery_claimed_at = NOW(),
        delivery_channel = $2,
        delivery_attempts = delivery_attempts + 1,
        delivery_error = NULL
    WHERE id = $3 AND tenant_uid = $4 AND status = 'approved' AND delivered_at IS NULL
      AND delivery_claim_token IS NULL AND ($5::boolean OR patient_id = $6)
    RETURNING *
  `, [claimToken, channel, draftId, tenantUid, privileged === true, actorId]);
  const draft = rows[0];
  if (!draft) throw Object.assign(new Error('Only an approved, unclaimed and undelivered draft can be sent'), { statusCode: 409 });
  if (!draft.patient_id) {
    await pool.query(`UPDATE lab_explainer_drafts SET delivery_claim_token = NULL, delivery_claimed_at = NULL, delivery_error = 'Draft has no patient recipient' WHERE id = $1 AND tenant_uid = $2 AND delivery_claim_token = $3`, [draft.id, tenantUid, claimToken]);
    throw Object.assign(new Error('Draft has no patient recipient'), { statusCode: 422 });
  }
  let delivery;
  try {
    delivery = await notificationService.send({
      userId: draft.patient_id,
      userType: 'patient',
      type: 'lab_explainer_approved',
      variables: { draftId: draft.id },
      titleOverride: 'Your lab report explanation',
      messageOverride: draft.draft,
      channels: [channel],
      data: { eventId: `lab-explainer:${tenantUid}:${draft.id}`, labExplainerDraftId: draft.id },
      actionUrl: '/lab-reports',
    });
    const channelResults = Object.values(delivery?.channels || {});
    if (delivery?.success === false || channelResults.some((result) => result?.success === false)) {
      throw Object.assign(new Error('Approved explanation delivery failed'), { statusCode: 502, delivery });
    }
  } catch (error) {
    await pool.query(`UPDATE lab_explainer_drafts SET delivery_claim_token = NULL, delivery_claimed_at = NULL, delivery_error = $1 WHERE id = $2 AND tenant_uid = $3 AND delivery_claim_token = $4`, [error.message, draft.id, tenantUid, claimToken]);
    throw error;
  }
  const providerId = delivery?.notificationId ? String(delivery.notificationId) : null;
  const updated = await pool.query(`UPDATE lab_explainer_drafts SET delivered_at=NOW(),delivery_provider_id=$1,delivery_claim_token=NULL WHERE id=$2 AND tenant_uid=$3 AND status='approved' AND delivered_at IS NULL AND delivery_claim_token=$4 RETURNING *`, [providerId, draft.id, tenantUid, claimToken]);
  if (!updated.rows[0]) throw Object.assign(new Error('Delivery acknowledgement could not be recorded'), { statusCode: 409, delivery });
  return { draft: updated.rows[0], delivery };
}

export default { buildLabExplainerDraft, createAgentHandoff, createAdherencePlan, materializeAdherenceEvent, runDueAdherenceEvents, deliverApprovedLabExplanation };
