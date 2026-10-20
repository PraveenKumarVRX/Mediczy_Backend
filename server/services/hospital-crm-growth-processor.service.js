import sharedPool from '../db/pgPool.js';
import {enqueueJourneyVoice} from './contact-center/campaigns.js';

function tenantId(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) throw Object.assign(new Error('A valid tenantId is required'), { statusCode: 400 });
  return id;
}

function json(value) {
  if (!value) return {};
  return typeof value === 'object' ? value : JSON.parse(value);
}

async function transaction(callback) {
  const client = await sharedPool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// The worker is intentionally provider-neutral: it creates consent-checked CRM work,
// then the existing WhatsApp, SMS, email, and task workers deliver it.
export async function processJourneyQueue(tenant, actorUserId, limit = 100) {
  const id = tenantId(tenant);
  const due = await sharedPool.query(
    `SELECT e.id AS event_id, e.enrollment_id, en.lead_id, en.identity_id,
            s.id AS step_id, s.step_order, s.step_type, s.channel, s.title, s.content, s.config
       FROM crm_journey_events e
       JOIN crm_journey_enrollments en ON en.id = e.enrollment_id AND en.tenant_id = e.tenant_id
       JOIN crm_journey_steps s ON s.id = e.step_id AND s.tenant_id = e.tenant_id
       JOIN crm_journeys j ON j.id = en.journey_id AND j.tenant_id = en.tenant_id
      WHERE e.tenant_id = $1 AND e.status = 'queued' AND e.scheduled_at <= NOW()
        AND en.status = 'active' AND j.status = 'active'
      ORDER BY e.scheduled_at, e.id LIMIT $2`,
    [id, Math.min(Math.max(Number(limit) || 100, 1), 500)]
  );
  const processed = [];
  for (const item of due.rows) {
    processed.push(await transaction(async (client) => {
      const locked=await client.query('SELECT status FROM crm_journey_events WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[id,item.event_id]);
      if(locked.rows[0]?.status!=='queued')return {eventId:item.event_id,status:'skipped'};
      let eventStatus = 'executed';
      let errorMessage = null;
      if (item.step_type === 'message') {
        const channel = item.channel || 'whatsapp';
        if(channel==='voice'){
          await enqueueJourneyVoice(client,{tenantId:id,eventId:item.event_id,identityId:item.identity_id,config:json(item.config)});
        }else{
        const consent = await client.query(
          `SELECT status FROM crm_consent_records WHERE tenant_id = $1 AND identity_id = $2 AND channel = $3 AND purpose = 'marketing' AND withdrawn_at IS NULL AND (expires_at IS NULL OR expires_at > NOW()) ORDER BY captured_at DESC LIMIT 1`,
          [id, item.identity_id, channel]
        );
        if (consent.rows[0]?.status !== 'opted_in') {
          eventStatus = 'failed';
          errorMessage = `Consent is required before journey ${channel} delivery`;
        } else {
          await client.query(
            `INSERT INTO crm_communication_events (tenant_id, identity_id, lead_id, channel, direction, message_type, body_preview, provider, status, owner_user_id, metadata)
             VALUES ($1, $2, $3, $4, 'outbound', 'journey', $5, 'journey-queue', 'queued', $6, $7::jsonb)`,
            [id, item.identity_id, item.lead_id, channel, item.content || item.title || 'Hospital CRM journey message', actorUserId || null, JSON.stringify({ journey_step_id: item.step_id })]
          );
        }
        }
      } else if (item.step_type === 'task') {
        await client.query(
          `INSERT INTO crm_tasks (tenant_id, lead_id, identity_id, task_type, title, description, priority, due_at, metadata, created_by)
           VALUES ($1, $2, $3, 'journey_follow_up', $4, $5, 'high', NOW(), $6::jsonb, $7)`,
          [id, item.lead_id, item.identity_id, item.title || 'Journey follow-up', item.content || null, JSON.stringify({ journey_step_id: item.step_id }), actorUserId || null]
        );
      } else if (item.step_type === 'stage_change') {
        const nextStage = json(item.config).toStage;
        if (nextStage) await client.query(`UPDATE crm_leads_v2 SET lifecycle_stage = $1, updated_at = NOW() WHERE tenant_id = $2 AND id = $3`, [nextStage, id, item.lead_id]);
      } else if (item.step_type === 'score') {
        const points = Number(json(item.config).points || 0);
        await client.query(`UPDATE crm_leads_v2 SET score = LEAST(100, GREATEST(0, score + $1)), updated_at = NOW() WHERE tenant_id = $2 AND id = $3`, [points, id, item.lead_id]);
      }
      await client.query(`UPDATE crm_journey_events SET status = $1, executed_at = NOW(), error_message = $2 WHERE tenant_id = $3 AND id = $4`, [eventStatus, errorMessage, id, item.event_id]);
      const next = await client.query(`SELECT * FROM crm_journey_steps WHERE tenant_id = $1 AND journey_id = (SELECT journey_id FROM crm_journey_enrollments WHERE tenant_id = $1 AND id = $2) AND step_order > $3 ORDER BY step_order LIMIT 1`, [id, item.enrollment_id, item.step_order]);
      if (next.rows[0]) {
        const nextRunAt = new Date(Date.now() + Number(next.rows[0].delay_minutes || 0) * 60000);
        await client.query(`UPDATE crm_journey_enrollments SET current_step_order = $1, next_run_at = $2, updated_at = NOW() WHERE tenant_id = $3 AND id = $4`, [next.rows[0].step_order, nextRunAt, id, item.enrollment_id]);
        await client.query(`INSERT INTO crm_journey_events (tenant_id, enrollment_id, step_id, event_type, scheduled_at, metadata) VALUES ($1, $2, $3, $4, $5, $6::jsonb)`, [id, item.enrollment_id, next.rows[0].id, next.rows[0].step_type, nextRunAt, JSON.stringify({ previous_event_id: item.event_id })]);
      } else {
        await client.query(`UPDATE crm_journey_enrollments SET status = 'completed', completed_at = NOW(), next_run_at = NULL, updated_at = NOW() WHERE tenant_id = $1 AND id = $2`, [id, item.enrollment_id]);
      }
      return { eventId: item.event_id, leadId: item.lead_id, status: eventStatus, errorMessage };
    }));
  }
  return { processed: processed.length, events: processed };
}
