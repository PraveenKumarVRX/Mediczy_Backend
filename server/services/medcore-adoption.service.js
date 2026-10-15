import pool from '../db/pgPool.js';
import notificationService from './notification.service.js';

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

export async function createAdherencePlan({ patientId, medication = {}, language = 'en', channel = 'whatsapp', schedule = {}, quietHours = {}, actorId = null, tenantUid = 'legacy' }) {
  const { rows } = await pool.query(`
    INSERT INTO adherence_plans (tenant_uid, patient_id, medication, language, channel, schedule, quiet_hours, created_by)
    VALUES ($1, $2, $3::jsonb, $4, $5, $6::jsonb, $7::jsonb, $8)
    RETURNING *
  `, [tenantUid, patientId, JSON.stringify(medication || {}), language, channel, JSON.stringify(schedule || {}), JSON.stringify(quietHours || {}), actorId]);
  return rows[0];
}

export async function materializeAdherenceEvent(plan) {
  const schedule = plan.schedule || {};
  const dueAt = schedule.nextDueAt || schedule.dueAt || schedule.time;
  if (!dueAt || Number.isNaN(new Date(dueAt).getTime())) return null;
  const { rows } = await pool.query(`
    INSERT INTO adherence_events (tenant_uid, plan_id, due_at) VALUES ($1, $2, $3) RETURNING *
  `, [plan.tenant_uid || 'legacy', plan.id, new Date(dueAt)]);
  return rows[0];
}

export async function runDueAdherenceEvents({ now = new Date(), limit = 100, tenantUid = null } = {}) {
  const params = tenantUid ? [now, limit, tenantUid] : [now, limit];
  const tenantWhere = tenantUid ? ' AND p.tenant_uid = $3' : '';
  const { rows } = await pool.query(`
    SELECT e.*, p.patient_id, p.channel, p.language, p.quiet_hours, p.medication
    FROM adherence_events e JOIN adherence_plans p ON p.id = e.plan_id AND e.tenant_uid = p.tenant_uid
    WHERE e.status = 'scheduled' AND p.active = TRUE AND e.due_at <= $1${tenantWhere}
    ORDER BY e.due_at ASC LIMIT $2
  `, params);
  const results = [];
  for (const event of rows) {
    const quiet = event.quiet_hours || {};
    const hour = new Date(now).getUTCHours();
    const quietStart = Number(quiet.startHour);
    const quietEnd = Number(quiet.endHour);
    const inQuietHours = Number.isFinite(quietStart) && Number.isFinite(quietEnd)
      && (quietStart <= quietEnd ? hour >= quietStart && hour < quietEnd : hour >= quietStart || hour < quietEnd);
    let status = inQuietHours ? 'skipped' : 'sent';
    let delivery = null;
    if (!inQuietHours) {
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
          variables: {
            medicationName,
            doseText,
            language: event.language,
          },
          titleOverride: localized.title,
          messageOverride: localized.message,
          channels: [event.channel || 'whatsapp'],
          data: { adherenceEventId: event.id, language: event.language },
          actionUrl: '/health-diary',
        });
        const channelResults = Object.values(delivery?.channels || {});
        if (delivery?.success === false || channelResults.some((channelResult) => channelResult?.success === false)) status = 'failed';
      } catch (error) {
        status = 'failed';
        delivery = { success: false, error: error.message };
      }
    }
    await pool.query(`UPDATE adherence_events SET status = $1, sent_at = CASE WHEN $1 = 'sent' THEN NOW() ELSE sent_at END, provider_message_id = $2 WHERE id = $3`, [status, delivery?.notificationId ? String(delivery.notificationId) : null, event.id]);
    results.push({ ...event, status, deliveryDeferred: inQuietHours, provider: inQuietHours ? null : event.channel, delivery });
  }
  return results;
}

export async function deliverApprovedLabExplanation({ draftId, tenantUid = 'legacy', channel = 'whatsapp', actorId = null, privileged = false } = {}) {
  const { rows } = await pool.query(`SELECT * FROM lab_explainer_drafts WHERE id=$1 AND tenant_uid=$2 AND status='approved' AND delivered_at IS NULL AND ($3::boolean OR patient_id=$4)`, [draftId, tenantUid, privileged === true, actorId]);
  const draft = rows[0];
  if (!draft) throw Object.assign(new Error('Only an approved, undelivered draft can be sent'), { statusCode: 409 });
  if (!draft.patient_id) throw Object.assign(new Error('Draft has no patient recipient'), { statusCode: 422 });
  const delivery = await notificationService.send({
    userId: draft.patient_id,
    userType: 'patient',
    type: 'lab_explainer_approved',
    variables: { draftId: draft.id },
    titleOverride: 'Your lab report explanation',
    messageOverride: draft.draft,
    channels: [channel],
    data: { labExplainerDraftId: draft.id },
    actionUrl: '/lab-reports',
  });
  const channelResults = Object.values(delivery?.channels || {});
  if (delivery?.success === false || channelResults.some((result) => result?.success === false)) {
    throw Object.assign(new Error('Approved explanation delivery failed'), { statusCode: 502, delivery });
  }
  const providerId = delivery?.notificationId ? String(delivery.notificationId) : null;
  const updated = await pool.query(`UPDATE lab_explainer_drafts SET delivered_at=NOW(),delivery_provider_id=$1 WHERE id=$2 AND tenant_uid=$3 AND status='approved' AND delivered_at IS NULL RETURNING *`, [providerId, draft.id, tenantUid]);
  return { draft: updated.rows[0], delivery };
}

export default { buildLabExplainerDraft, createAgentHandoff, createAdherencePlan, materializeAdherenceEvent, runDueAdherenceEvents, deliverApprovedLabExplanation };
