import sharedPool from '../db/pgPool.js';

const CHANNELS = new Set(['whatsapp', 'sms', 'email', 'call', 'push', 'in_app']);
const STAGE_FOR_VISIT_EVENT = {
  checked_in: 'visited',
  consulted: 'consulted',
  investigation_ordered: 'investigation_advised',
  procedure_advised: 'procedure_advised',
  admission_advised: 'admission_advised',
  admitted: 'admission_advised',
  discharged: 'won',
};

function intOrNull(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function json(value, fallback = {}) {
  if (value == null) return fallback;
  return typeof value === 'object' ? value : JSON.parse(value);
}

async function withTransaction(callback) {
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

async function writeAudit(client, { tenantId, entityType, entityId, eventType, actorUserId, actorRole, oldValue, newValue, reason, metadata }) {
  await client.query(
    `INSERT INTO crm_audit_log
      (tenant_id, entity_type, entity_id, event_type, actor_user_id, actor_role, old_value, new_value, reason, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, $10::jsonb)`,
    [tenantId, entityType, entityId || null, eventType, actorUserId || null, actorRole || null, JSON.stringify(oldValue || null), JSON.stringify(newValue || null), reason || null, JSON.stringify(metadata || {})]
  );
}

function requireTenant(tenantId) {
  const value = intOrNull(tenantId);
  if (!value) {
    const error = new Error('A valid tenantId is required');
    error.statusCode = 400;
    throw error;
  }
  return value;
}

export async function createCommunicationEvent(input, actorUserId) {
  const tenantId = requireTenant(input.tenantId);
  const channel = String(input.channel || '').toLowerCase();
  if (!CHANNELS.has(channel)) throw Object.assign(new Error('Unsupported communication channel'), { statusCode: 400 });

  return withTransaction(async (client) => {
    const identityId = intOrNull(input.identityId);
    if (input.direction === 'outbound' && identityId) {
      const consent = await client.query(
        `SELECT status FROM crm_consent_records
          WHERE tenant_id = $1 AND identity_id = $2 AND channel = $3 AND purpose = $4
            AND withdrawn_at IS NULL AND (expires_at IS NULL OR expires_at > NOW())
          ORDER BY captured_at DESC LIMIT 1`,
        [tenantId, identityId, channel, input.purpose || 'marketing']
      );
      if (consent.rows[0]?.status !== 'opted_in') {
        const error = new Error(`Consent is required before outbound ${channel} communication`);
        error.statusCode = 409;
        throw error;
      }
    }

    const result = await client.query(
      `INSERT INTO crm_communication_events
        (tenant_id, identity_id, lead_id, contact_id, campaign_id, conversation_id, channel, direction, message_type, template_id, subject, body_preview, provider, provider_message_id, status, sent_at, owner_user_id, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18::jsonb)
       ON CONFLICT (tenant_id, provider, provider_message_id) WHERE provider_message_id IS NOT NULL DO UPDATE SET status = EXCLUDED.status
       RETURNING *`,
      [tenantId, identityId, intOrNull(input.leadId), intOrNull(input.contactId), intOrNull(input.campaignId), intOrNull(input.conversationId), channel, input.direction || 'system', input.messageType || 'message', intOrNull(input.templateId), input.subject || null, input.bodyPreview || null, input.provider || null, input.providerMessageId || null, input.status || 'queued', input.sentAt || null, actorUserId || null, JSON.stringify(input.metadata || {})]
    );
    const event = result.rows[0];
    await writeAudit(client, { tenantId, entityType: 'communication_event', entityId: event.id, eventType: 'created', actorUserId, newValue: event });
    return event;
  });
}

export async function listCommunicationTimeline(tenantId, { leadId, identityId, limit = 100 } = {}) {
  const tenant = requireTenant(tenantId);
  const filters = ['tenant_id = $1'];
  const values = [tenant];
  if (leadId) { values.push(intOrNull(leadId)); filters.push(`lead_id = $${values.length}`); }
  if (identityId) { values.push(intOrNull(identityId)); filters.push(`identity_id = $${values.length}`); }
  if (!leadId && !identityId) throw Object.assign(new Error('leadId or identityId is required'), { statusCode: 400 });
  const result = await sharedPool.query(
    `SELECT id, 'communication' AS event_category, channel, direction, message_type AS event_type,
            body_preview AS summary, status, created_at AS event_at, metadata
       FROM crm_communication_events
      WHERE ${filters.join(' AND ')}
      ORDER BY event_at DESC LIMIT $${values.length + 1}`,
    [...values, Math.min(Math.max(Number(limit) || 100, 1), 500)]
  );
  return result.rows;
}

export async function recordConsent(input, actorUserId) {
  const tenantId = requireTenant(input.tenantId);
  const identityId = intOrNull(input.identityId);
  if (!identityId || !input.channel || !input.purpose) throw Object.assign(new Error('identityId, channel, and purpose are required'), { statusCode: 400 });
  return withTransaction(async (client) => {
    await client.query(
      `UPDATE crm_consent_records SET withdrawn_at = NOW(), updated_at = NOW()
        WHERE tenant_id = $1 AND identity_id = $2 AND channel = $3 AND purpose = $4 AND withdrawn_at IS NULL`,
      [tenantId, identityId, input.channel, input.purpose]
    );
    const result = await client.query(
      `INSERT INTO crm_consent_records
        (tenant_id, identity_id, contact_id, channel, purpose, status, source, expires_at, proof_ref, captured_by, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb) RETURNING *`,
      [tenantId, identityId, intOrNull(input.contactId), input.channel, input.purpose, input.status || 'unknown', input.source || 'crm', input.expiresAt || null, input.proofRef || null, actorUserId || null, JSON.stringify(input.metadata || {})]
    );
    await writeAudit(client, { tenantId, entityType: 'consent', entityId: result.rows[0].id, eventType: 'updated', actorUserId, newValue: result.rows[0] });
    return result.rows[0];
  });
}

export async function recordTouchpoint(input, actorUserId) {
  const tenantId = requireTenant(input.tenantId);
  return withTransaction(async (client) => {
    const result = await client.query(
      `INSERT INTO crm_touchpoints
        (tenant_id, identity_id, lead_id, contact_id, campaign_id, source_id, touchpoint_type, channel, source, medium, event_name, event_at, session_id, gclid, fbclid, utm_source, utm_medium, utm_campaign, utm_term, utm_content, landing_page_url, referrer_url, external_event_id, cost_amount, revenue_amount, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, COALESCE($12::timestamptz, NOW()), $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26::jsonb)
       ON CONFLICT (tenant_id, external_event_id) WHERE external_event_id IS NOT NULL DO UPDATE SET metadata = EXCLUDED.metadata
       RETURNING *`,
      [tenantId, intOrNull(input.identityId), intOrNull(input.leadId), intOrNull(input.contactId), intOrNull(input.campaignId), intOrNull(input.sourceId), input.touchpointType || 'form_submit', input.channel || null, input.source || null, input.medium || null, input.eventName || null, input.eventAt || null, input.sessionId || null, input.gclid || null, input.fbclid || null, input.utmSource || null, input.utmMedium || null, input.utmCampaign || null, input.utmTerm || null, input.utmContent || null, input.landingPageUrl || null, input.referrerUrl || null, input.externalEventId || null, input.costAmount ?? null, input.revenueAmount ?? null, JSON.stringify(input.metadata || {})]
    );
    const touchpoint = result.rows[0];
    if (touchpoint.lead_id) {
      await client.query(
        `UPDATE crm_leads_v2
            SET first_touch_id = COALESCE(first_touch_id, $1), last_touch_id = $1, updated_at = NOW()
          WHERE tenant_id = $2 AND id = $3`,
        [touchpoint.id, tenantId, touchpoint.lead_id]
      );
    }
    await writeAudit(client, { tenantId, entityType: 'touchpoint', entityId: touchpoint.id, eventType: 'created', actorUserId, newValue: touchpoint });
    return touchpoint;
  });
}

export async function linkAppointment(input, actorUserId) {
  const tenantId = requireTenant(input.tenantId);
  return withTransaction(async (client) => {
    const result = await client.query(
      `INSERT INTO crm_appointment_links
        (tenant_id, lead_id, identity_id, appointment_id, patient_id, doctor_id, hospital_id, branch_id, department_id, service_line_id, appointment_status, scheduled_at, confirmed_at, source_system, source_ref, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16::jsonb)
       ON CONFLICT (tenant_id, source_system, source_ref) WHERE source_ref IS NOT NULL DO UPDATE SET appointment_status = EXCLUDED.appointment_status, scheduled_at = EXCLUDED.scheduled_at, updated_at = NOW()
       RETURNING *`,
      [tenantId, intOrNull(input.leadId), intOrNull(input.identityId), intOrNull(input.appointmentId), intOrNull(input.patientId), intOrNull(input.doctorId), intOrNull(input.hospitalId), intOrNull(input.branchId), intOrNull(input.departmentId), intOrNull(input.serviceLineId), input.appointmentStatus || 'booked', input.scheduledAt || null, input.confirmedAt || null, input.sourceSystem || 'crm', input.sourceRef || null, JSON.stringify(input.metadata || {})]
    );
    const appointment = result.rows[0];
    if (appointment.lead_id) {
      await client.query(
        `UPDATE crm_leads_v2 SET appointment_booked_at = COALESCE(appointment_booked_at, NOW()), updated_at = NOW(), lifecycle_stage = CASE WHEN lifecycle_stage IN ('new', 'contacted', 'qualified') THEN 'appointment_booked' ELSE lifecycle_stage END WHERE tenant_id = $1 AND id = $2`,
        [tenantId, appointment.lead_id]
      );
    }
    await writeAudit(client, { tenantId, entityType: 'appointment_link', entityId: appointment.id, eventType: 'linked', actorUserId, newValue: appointment });
    return appointment;
  });
}

export async function recordVisit(input, actorUserId) {
  const tenantId = requireTenant(input.tenantId);
  return withTransaction(async (client) => {
    const result = await client.query(
      `INSERT INTO crm_visit_events
        (tenant_id, lead_id, identity_id, appointment_link_id, patient_id, visit_id, event_type, event_at, doctor_id, hospital_id, branch_id, department_id, service_line_id, clinical_unit, source_system, source_ref, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8::timestamptz, NOW()), $9, $10, $11, $12, $13, $14, $15, $16, $17::jsonb)
       ON CONFLICT DO NOTHING RETURNING *`,
      [tenantId, intOrNull(input.leadId), intOrNull(input.identityId), intOrNull(input.appointmentLinkId), intOrNull(input.patientId), intOrNull(input.visitId), input.eventType, input.eventAt || null, intOrNull(input.doctorId), intOrNull(input.hospitalId), intOrNull(input.branchId), intOrNull(input.departmentId), intOrNull(input.serviceLineId), input.clinicalUnit || null, input.sourceSystem || 'crm', input.sourceRef || null, JSON.stringify(input.metadata || {})]
    );
    const visit = result.rows[0];
    if (!visit) return null;
    const nextStage = STAGE_FOR_VISIT_EVENT[input.eventType];
    if (visit.lead_id && nextStage) {
      await client.query(
        `UPDATE crm_leads_v2 SET lifecycle_stage = $1, visited_at = CASE WHEN $1 IN ('visited', 'consulted') THEN COALESCE(visited_at, NOW()) ELSE visited_at END, updated_at = NOW() WHERE tenant_id = $2 AND id = $3`,
        [nextStage, tenantId, visit.lead_id]
      );
    }
    await writeAudit(client, { tenantId, entityType: 'visit_event', entityId: visit.id, eventType: 'created', actorUserId, newValue: visit });
    return visit;
  });
}

export async function recordRevenue(input, actorUserId) {
  const tenantId = requireTenant(input.tenantId);
  return withTransaction(async (client) => {
    const result = await client.query(
      `INSERT INTO crm_revenue_events
        (tenant_id, lead_id, identity_id, appointment_link_id, visit_event_id, patient_id, billing_id, invoice_number, revenue_event_type, revenue_date, gross_amount, discount_amount, net_amount, paid_amount, refund_amount, outstanding_amount, contribution_amount, currency, payer_type, insurance_tpa_id, doctor_id, hospital_id, branch_id, department_id, service_line_id, procedure_code, package_code, source_system, source_ref, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, COALESCE($10::date, CURRENT_DATE), $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30::jsonb)
       ON CONFLICT (tenant_id, source_system, source_ref) WHERE source_ref IS NOT NULL DO UPDATE SET net_amount = EXCLUDED.net_amount, paid_amount = EXCLUDED.paid_amount, updated_at = NOW()
       RETURNING *`,
      [tenantId, intOrNull(input.leadId), intOrNull(input.identityId), intOrNull(input.appointmentLinkId), intOrNull(input.visitEventId), intOrNull(input.patientId), intOrNull(input.billingId), input.invoiceNumber || null, input.revenueEventType || 'billing_completed', input.revenueDate || null, numberOrZero(input.grossAmount), numberOrZero(input.discountAmount), numberOrZero(input.netAmount), numberOrZero(input.paidAmount), numberOrZero(input.refundAmount), numberOrZero(input.outstandingAmount), input.contributionAmount == null ? null : numberOrZero(input.contributionAmount), input.currency || 'INR', input.payerType || null, intOrNull(input.insuranceTpaId), intOrNull(input.doctorId), intOrNull(input.hospitalId), intOrNull(input.branchId), intOrNull(input.departmentId), intOrNull(input.serviceLineId), input.procedureCode || null, input.packageCode || null, input.sourceSystem || 'crm', input.sourceRef || null, JSON.stringify(input.metadata || {})]
    );
    const revenue = result.rows[0];
    if (revenue.lead_id) {
      await client.query(
        `UPDATE crm_leads_v2
            SET actual_revenue = COALESCE((
              SELECT SUM(net_amount)
                FROM crm_revenue_events
               WHERE tenant_id = $1 AND lead_id = $2
            ), 0), updated_at = NOW()
          WHERE tenant_id = $1 AND id = $2`,
        [tenantId, revenue.lead_id]
      );
    }
    await writeAudit(client, { tenantId, entityType: 'revenue_event', entityId: revenue.id, eventType: 'created', actorUserId, newValue: revenue });
    return revenue;
  });
}

export async function getJourneyTimeline(tenantId, { leadId, identityId, limit = 150 } = {}) {
  const tenant = requireTenant(tenantId);
  const filter = leadId ? ['tenant_id = $1 AND lead_id = $2'] : ['tenant_id = $1 AND identity_id = $2'];
  const params = [tenant, intOrNull(leadId || identityId)];
  const [funnel, communication, appointments, visits, revenue] = await Promise.all([
    sharedPool.query(`SELECT id, 'funnel' AS event_category, event_type, COALESCE(event_at, occurred_at) AS event_at, metadata FROM crm_funnel_events WHERE ${filter[0]} ORDER BY event_at DESC LIMIT $3`, [...params, Number(limit) || 150]),
    sharedPool.query(`SELECT id, 'communication' AS event_category, channel || ':' || direction AS event_type, created_at AS event_at, metadata FROM crm_communication_events WHERE ${filter[0]} ORDER BY event_at DESC LIMIT $3`, [...params, Number(limit) || 150]),
    sharedPool.query(`SELECT id, 'appointment' AS event_category, appointment_status AS event_type, scheduled_at AS event_at, metadata FROM crm_appointment_links WHERE ${filter[0]} ORDER BY event_at DESC LIMIT $3`, [...params, Number(limit) || 150]),
    sharedPool.query(`SELECT id, 'visit' AS event_category, event_type, event_at, metadata FROM crm_visit_events WHERE ${filter[0]} ORDER BY event_at DESC LIMIT $3`, [...params, Number(limit) || 150]),
    sharedPool.query(`SELECT id, 'revenue' AS event_category, revenue_event_type AS event_type, revenue_date::timestamptz AS event_at, metadata FROM crm_revenue_events WHERE ${filter[0]} ORDER BY event_at DESC LIMIT $3`, [...params, Number(limit) || 150]),
  ]);
  return [...funnel.rows, ...communication.rows, ...appointments.rows, ...visits.rows, ...revenue.rows]
    .sort((a, b) => new Date(b.event_at || 0).getTime() - new Date(a.event_at || 0).getTime())
    .slice(0, Math.min(Math.max(Number(limit) || 150, 1), 500));
}

export async function getSlaQueue(tenantId, limit = 100) {
  const tenant = requireTenant(tenantId);
  const result = await sharedPool.query(
    `SELECT s.*, l.lifecycle_stage, l.priority, l.owner_user_id, p.display_name
       FROM crm_sla_events s
       LEFT JOIN crm_leads_v2 l ON l.id = s.lead_id AND l.tenant_id = s.tenant_id
       LEFT JOIN crm_person_identities p ON p.id = l.identity_id AND p.tenant_id = l.tenant_id
      WHERE s.tenant_id = $1 AND s.status = 'open'
      ORDER BY s.due_at ASC LIMIT $2`,
    [tenant, Math.min(Math.max(Number(limit) || 100, 1), 500)]
  );
  return result.rows;
}

export async function createFeedback(input, actorUserId) {
  const tenantId = requireTenant(input.tenantId);
  return withTransaction(async (client) => {
    const score = input.score == null ? null : Math.max(0, Math.min(10, Number(input.score)));
    const npsCategory = score == null ? null : score >= 9 ? 'promoter' : score >= 7 ? 'passive' : 'detractor';
    const result = await client.query(
      `INSERT INTO crm_feedback_responses
        (tenant_id, identity_id, lead_id, appointment_link_id, visit_event_id, survey_id, score, nps_category, comments, response_channel, doctor_id, hospital_id, branch_id, service_line_id, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::jsonb) RETURNING *`,
      [tenantId, intOrNull(input.identityId), intOrNull(input.leadId), intOrNull(input.appointmentLinkId), intOrNull(input.visitEventId), intOrNull(input.surveyId), score, npsCategory, input.comments || null, input.responseChannel || 'crm', intOrNull(input.doctorId), intOrNull(input.hospitalId), intOrNull(input.branchId), intOrNull(input.serviceLineId), JSON.stringify(input.metadata || {})]
    );
    const response = result.rows[0];
    if (npsCategory === 'detractor' || input.createTask) {
      await client.query(
        `INSERT INTO crm_reputation_tasks (tenant_id, feedback_response_id, task_type, priority, assigned_to_user_id, due_at)
         VALUES ($1, $2, 'feedback_recovery', $3, $4, NOW() + INTERVAL '1 day')`,
        [tenantId, response.id, npsCategory === 'detractor' ? 'high' : 'medium', actorUserId || null]
      );
    }
    await writeAudit(client, { tenantId, entityType: 'feedback_response', entityId: response.id, eventType: 'created', actorUserId, newValue: response });
    return response;
  });
}

export async function createReview(input, actorUserId) {
  const tenantId = requireTenant(input.tenantId);
  return withTransaction(async (client) => {
    const result = await client.query(
      `INSERT INTO crm_reviews
        (tenant_id, identity_id, platform, external_review_id, reviewer_name, rating, review_text, sentiment, severity, topics, doctor_id, hospital_id, branch_id, service_line_id, review_url, reviewed_at, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12, $13, $14, $15, COALESCE($16::timestamptz, NOW()), $17::jsonb)
       ON CONFLICT (tenant_id, platform, external_review_id) WHERE external_review_id IS NOT NULL DO UPDATE SET rating = EXCLUDED.rating, review_text = EXCLUDED.review_text, sentiment = EXCLUDED.sentiment, updated_at = NOW()
       RETURNING *`,
      [tenantId, intOrNull(input.identityId), input.platform || 'manual', input.externalReviewId || null, input.reviewerName || null, input.rating == null ? null : Number(input.rating), input.reviewText || null, input.sentiment || null, input.severity || 'normal', JSON.stringify(input.topics || []), intOrNull(input.doctorId), intOrNull(input.hospitalId), intOrNull(input.branchId), intOrNull(input.serviceLineId), input.reviewUrl || null, input.reviewedAt || null, JSON.stringify(input.metadata || {})]
    );
    const review = result.rows[0];
    if (review.severity === 'high' || review.severity === 'critical' || Number(review.rating) <= 2) {
      await client.query(
        `INSERT INTO crm_reputation_tasks (tenant_id, review_id, task_type, priority, assigned_to_user_id, due_at)
         VALUES ($1, $2, 'review_response', $3, $4, NOW() + INTERVAL '1 day')`,
        [tenantId, review.id, review.severity === 'critical' ? 'urgent' : 'high', actorUserId || null]
      );
    }
    await writeAudit(client, { tenantId, entityType: 'review', entityId: review.id, eventType: 'created', actorUserId, newValue: review });
    return review;
  });
}

export async function createBudgetOrCost(type, input, actorUserId) {
  const tenantId = requireTenant(input.tenantId);
  if (type === 'budget') {
    const result = await sharedPool.query(
      `INSERT INTO crm_marketing_budgets (tenant_id, period_type, period_start, period_end, hospital_id, branch_id, service_line_id, channel, campaign_id, budget_amount, approved_amount, owner_user_id, approval_status, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING *`,
      [tenantId, input.periodType || 'monthly', input.periodStart, input.periodEnd, intOrNull(input.hospitalId), intOrNull(input.branchId), intOrNull(input.serviceLineId), input.channel || null, intOrNull(input.campaignId), numberOrZero(input.budgetAmount), input.approvedAmount == null ? null : numberOrZero(input.approvedAmount), actorUserId || null, input.approvalStatus || 'draft', actorUserId || null]
    );
    return result.rows[0];
  }
  const result = await sharedPool.query(
    `INSERT INTO crm_campaign_costs (tenant_id, campaign_id, source_id, cost_type, vendor_id, cost_date, amount, currency, invoice_ref, external_spend_id, is_imported, metadata, created_by)
     VALUES ($1, $2, $3, $4, $5, COALESCE($6::date, CURRENT_DATE), $7, $8, $9, $10, $11, $12::jsonb, $13) RETURNING *`,
    [tenantId, intOrNull(input.campaignId), intOrNull(input.sourceId), input.costType || 'ad_spend', intOrNull(input.vendorId), input.costDate || null, numberOrZero(input.amount), input.currency || 'INR', input.invoiceRef || null, input.externalSpendId || null, Boolean(input.isImported), JSON.stringify(input.metadata || {}), actorUserId || null]
  );
  return result.rows[0];
}

export async function getExecutiveDashboards(tenantId, { from, to } = {}) {
  const tenant = requireTenant(tenantId);
  const period = [from || '1970-01-01', to || '2999-12-31'];
  const [leads, appointments, visits, revenue, costs, feedback, reviews] = await Promise.all([
    sharedPool.query(`SELECT lifecycle_stage, COUNT(*)::int AS count FROM crm_leads_v2 WHERE tenant_id = $1 AND created_at >= $2::timestamptz AND created_at < $3::timestamptz GROUP BY lifecycle_stage`, [tenant, period[0], period[1]]),
    sharedPool.query(`SELECT appointment_status, COUNT(*)::int AS count FROM crm_appointment_links WHERE tenant_id = $1 AND scheduled_at >= $2::timestamptz AND scheduled_at < $3::timestamptz GROUP BY appointment_status`, [tenant, period[0], period[1]]),
    sharedPool.query(`SELECT event_type, COUNT(*)::int AS count FROM crm_visit_events WHERE tenant_id = $1 AND event_at >= $2::timestamptz AND event_at < $3::timestamptz GROUP BY event_type`, [tenant, period[0], period[1]]),
    sharedPool.query(`SELECT COALESCE(SUM(net_amount), 0)::numeric AS net_revenue, COALESCE(SUM(contribution_amount), 0)::numeric AS contribution, COUNT(*)::int AS events FROM crm_revenue_events WHERE tenant_id = $1 AND revenue_date >= $2::date AND revenue_date < $3::date`, [tenant, period[0], period[1]]),
    sharedPool.query(`SELECT COALESCE(SUM(amount), 0)::numeric AS spend FROM crm_campaign_costs WHERE tenant_id = $1 AND cost_date >= $2::date AND cost_date < $3::date`, [tenant, period[0], period[1]]),
    sharedPool.query(`SELECT COUNT(*)::int AS responses, COALESCE(AVG(score), 0)::numeric(10,2) AS average_score, COUNT(*) FILTER (WHERE nps_category = 'promoter')::int AS promoters, COUNT(*) FILTER (WHERE nps_category = 'detractor')::int AS detractors FROM crm_feedback_responses WHERE tenant_id = $1 AND received_at >= $2::timestamptz AND received_at < $3::timestamptz`, [tenant, period[0], period[1]]),
    sharedPool.query(`SELECT COUNT(*)::int AS reviews, COALESCE(AVG(rating), 0)::numeric(10,2) AS average_rating, COUNT(*) FILTER (WHERE severity IN ('high','critical'))::int AS critical_reviews FROM crm_reviews WHERE tenant_id = $1 AND created_at >= $2::timestamptz AND created_at < $3::timestamptz`, [tenant, period[0], period[1]]),
  ]);
  const revenueValue = Number(revenue.rows[0]?.net_revenue || 0);
  const spendValue = Number(costs.rows[0]?.spend || 0);
  return {
    leads: leads.rows,
    appointments: appointments.rows,
    visits: visits.rows,
    revenue: { ...revenue.rows[0], roas: spendValue ? revenueValue / spendValue : null },
    spend: costs.rows[0],
    feedback: { ...feedback.rows[0], nps: Number(feedback.rows[0]?.responses || 0) ? ((Number(feedback.rows[0]?.promoters || 0) - Number(feedback.rows[0]?.detractors || 0)) / Number(feedback.rows[0]?.responses || 1)) * 100 : null },
    reviews: reviews.rows[0],
  };
}

export async function getDimensionDashboard(tenantId, dimension, { from, to } = {}) {
  const tenant = requireTenant(tenantId);
  const start = from || '1970-01-01';
  const end = to || '2999-12-31';
  const columns = dimension === 'doctors' ? 'doctor_id' : 'service_line_id';
  const result = await sharedPool.query(
    `WITH lead_dimensions AS (
           SELECT id, ${columns} AS dimension_id
             FROM crm_leads_v2
            WHERE tenant_id = $1 AND created_at >= $2::timestamptz AND created_at < $3::timestamptz
         ), lead_counts AS (
           SELECT dimension_id, COUNT(*)::int AS leads
             FROM lead_dimensions
            GROUP BY dimension_id
         ), appointment_counts AS (
           SELECT ld.dimension_id, COUNT(a.id)::int AS appointments
             FROM lead_dimensions ld
             JOIN crm_appointment_links a ON a.tenant_id = $1 AND a.lead_id = ld.id
            GROUP BY ld.dimension_id
         ), visit_counts AS (
           SELECT ld.dimension_id, COUNT(v.id)::int AS visits
             FROM lead_dimensions ld
             JOIN crm_visit_events v ON v.tenant_id = $1 AND v.lead_id = ld.id
            GROUP BY ld.dimension_id
         ), revenue_totals AS (
           SELECT ld.dimension_id, COALESCE(SUM(r.net_amount), 0)::numeric AS revenue
             FROM lead_dimensions ld
             JOIN crm_revenue_events r ON r.tenant_id = $1 AND r.lead_id = ld.id
            GROUP BY ld.dimension_id
         )
       SELECT lc.dimension_id, lc.leads,
              COALESCE(ac.appointments, 0)::int AS appointments,
              COALESCE(vc.visits, 0)::int AS visits,
              COALESCE(rt.revenue, 0)::numeric AS revenue
         FROM lead_counts lc
         LEFT JOIN appointment_counts ac USING (dimension_id)
         LEFT JOIN visit_counts vc USING (dimension_id)
         LEFT JOIN revenue_totals rt USING (dimension_id)
        ORDER BY lc.leads DESC`,
    [tenant, start, end]
  );
  return result.rows;
}

export async function refreshAnalyticsMarts(tenantId, { metricDate, actorUserId } = {}) {
  const tenant = requireTenant(tenantId);
  const date = metricDate || new Date().toISOString().slice(0, 10);
  return withTransaction(async (client) => {
    const funnel = await client.query(
      `SELECT lifecycle_stage, COUNT(*)::int AS lead_count, COUNT(*) FILTER (WHERE owner_user_id IS NOT NULL)::int AS assigned_count, AVG(score)::numeric(10,2) AS average_score
         FROM crm_leads_v2 WHERE tenant_id = $1 AND created_at::date = $2::date GROUP BY lifecycle_stage`,
      [tenant, date]
    );
    await client.query(`DELETE FROM crm_daily_funnel_mart WHERE tenant_id = $1 AND metric_date = $2::date AND grain_key = 'tenant'`, [tenant, date]);
    await client.query(
      `INSERT INTO crm_daily_funnel_mart (tenant_id, metric_date, grain_key, dimensions, metrics)
       VALUES ($1, $2::date, 'tenant', '{}'::jsonb, $3::jsonb)`,
      [tenant, date, JSON.stringify({ stages: funnel.rows })]
    );
    await writeAudit(client, { tenantId: tenant, entityType: 'analytics_mart', eventType: 'refreshed', actorUserId, newValue: { metricDate: date } });
    return { metricDate: date, funnel: funnel.rows };
  });
}

export async function runDataQualityScan(tenantId, actorUserId) {
  const tenant = requireTenant(tenantId);
  const result = await sharedPool.query(
    `WITH candidates AS (
      SELECT id, 'lead'::text AS entity_type, 'missing_owner'::text AS issue_type, 'high'::text AS severity, 'owner_user_id'::text AS field_name
        FROM crm_leads_v2 WHERE tenant_id = $1 AND status = 'open' AND owner_user_id IS NULL
      UNION ALL
      SELECT id, 'lead', 'missing_source', 'medium', 'source_taxonomy_id'
        FROM crm_leads_v2 WHERE tenant_id = $1 AND source_taxonomy_id IS NULL
      UNION ALL
      SELECT id, 'lead', 'missing_identity', 'high', 'identity_id'
        FROM crm_leads_v2 WHERE tenant_id = $1 AND identity_id IS NULL
    )
    INSERT INTO crm_data_quality_issues (tenant_id, entity_type, entity_id, issue_type, severity, field_name)
    SELECT $1, c.entity_type, c.id, c.issue_type, c.severity, c.field_name FROM candidates c
    WHERE NOT EXISTS (
      SELECT 1 FROM crm_data_quality_issues q WHERE q.tenant_id = $1 AND q.entity_type = c.entity_type AND q.entity_id = c.id AND q.issue_type = c.issue_type AND q.status = 'open'
    )
    RETURNING *`,
    [tenant]
  );
  if (result.rows.length) await writeAudit(sharedPool, { tenantId: tenant, entityType: 'data_quality', eventType: 'scan_completed', actorUserId, newValue: { created: result.rows.length } });
  return result.rows;
}

export async function startIntegrationRun(input) {
  const tenantId = requireTenant(input.tenantId);
  const result = await sharedPool.query(
    `INSERT INTO crm_integration_runs (tenant_id, integration_name, run_type, metadata) VALUES ($1, $2, $3, $4::jsonb) RETURNING *`,
    [tenantId, input.integrationName, input.runType || 'manual', JSON.stringify(input.metadata || {})]
  );
  return result.rows[0];
}


export async function completeIntegrationRun(input, actorUserId) {
  const tenantId = requireTenant(input.tenantId);
  const runId = intOrNull(input.runId);
  if (!runId) throw Object.assign(new Error("runId is required"), { statusCode: 400 });
  const result = await sharedPool.query(
    `UPDATE crm_integration_runs
        SET status = $3, completed_at = NOW(), records_seen = $4, records_created = $5,
            records_updated = $6, records_failed = $7, last_cursor = $8, error_summary = $9,
            metadata = COALESCE(metadata, jsonb_build_object()) || $10::jsonb
      WHERE tenant_id = $1 AND id = $2
      RETURNING *`,
    [tenantId, runId, input.status || "completed", Number(input.recordsSeen) || 0, Number(input.recordsCreated) || 0, Number(input.recordsUpdated) || 0, Number(input.recordsFailed) || 0, input.lastCursor || null, input.errorSummary || null, JSON.stringify(input.metadata || {})]
  );
  if (!result.rows[0]) throw Object.assign(new Error("Integration run not found"), { statusCode: 404 });
  await writeAudit(sharedPool, { tenantId, entityType: "integration_run", entityId: runId, eventType: "completed", actorUserId, newValue: result.rows[0] });
  return result.rows[0];
}

export async function recordIntegrationError(input, actorUserId) {
  const tenantId = requireTenant(input.tenantId);
  const result = await sharedPool.query(
    `INSERT INTO crm_integration_errors
      (tenant_id, integration_run_id, integration_name, entity_type, external_ref, payload, error_code, error_message, next_retry_at)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9) RETURNING *`,
    [tenantId, intOrNull(input.integrationRunId), input.integrationName, input.entityType || null, input.externalRef || null, JSON.stringify(input.payload || {}), input.errorCode || null, input.errorMessage || "Integration record failed", input.nextRetryAt || null]
  );
  await writeAudit(sharedPool, { tenantId, entityType: "integration_error", entityId: result.rows[0].id, eventType: "created", actorUserId, newValue: result.rows[0] });
  return result.rows[0];
}

export async function listIntegrationErrors(tenantId, { status = "open", limit = 100 } = {}) {
  const tenant = requireTenant(tenantId);
  const result = await sharedPool.query(
    `SELECT * FROM crm_integration_errors
      WHERE tenant_id = $1 AND ($2 = $3 OR status = $2)
      ORDER BY COALESCE(next_retry_at, created_at) ASC LIMIT $4`,
    [tenant, status, "all", Math.min(Math.max(Number(limit) || 100, 1), 500)]
  );
  return result.rows;
}

export async function calculateAttribution(input, actorUserId) {
  const tenantId = requireTenant(input.tenantId);
  const leadId = intOrNull(input.leadId);
  const model = input.model || "last_touch";
  const supported = new Set(["first_touch", "last_touch", "linear", "time_decay"]);
  if (!leadId || !supported.has(model)) throw Object.assign(new Error("leadId and a supported attribution model is required"), { statusCode: 400 });
  const windowDays = Math.min(Math.max(Number(input.attributionWindowDays) || 90, 1), 3650);
  const touchpoints = await sharedPool.query(
    `SELECT id, campaign_id, source_id, event_at
       FROM crm_touchpoints
      WHERE tenant_id = $1 AND lead_id = $2 AND event_at >= NOW() - (($3::text || chr(32) || chr(100) || chr(97) || chr(121) || chr(115))::interval)
      ORDER BY event_at ASC`,
    [tenantId, leadId, windowDays]
  );
  const revenue = await sharedPool.query(
    `SELECT id, net_amount FROM crm_revenue_events WHERE tenant_id = $1 AND lead_id = $2`,
    [tenantId, leadId]
  );
  if (!touchpoints.rows.length) return [];
  const rawWeights = touchpoints.rows.map((touchpoint, index, rows) => {
    if (model === "first_touch") return index === 0 ? 1 : 0;
    if (model === "last_touch") return index === rows.length - 1 ? 1 : 0;
    if (model === "linear") return 1 / rows.length;
    return Math.pow(0.5, (rows.length - 1 - index) / Math.max(rows.length - 1, 1));
  });
  const totalWeight = rawWeights.reduce((sum, weight) => sum + weight, 0) || 1;
  const revenueTotal = revenue.rows.reduce((sum, row) => sum + numberOrZero(row.net_amount), 0);
  return withTransaction(async (client) => {
    const run = await client.query(
      `INSERT INTO crm_calculation_runs (tenant_id, run_type, status, records_seen, records_written, completed_at, metadata)
       VALUES ($1, $4, $5, $2, $2, NOW(), $3::jsonb) RETURNING id`,
      [tenantId, touchpoints.rows.length, JSON.stringify({ leadId, model, attributionWindowDays: windowDays }), "attribution", "completed"]
    );
    await client.query(`DELETE FROM crm_attribution_results WHERE tenant_id = $1 AND lead_id = $2 AND model = $3`, [tenantId, leadId, model]);
    const results = [];
    for (let index = 0; index < touchpoints.rows.length; index += 1) {
      const weight = rawWeights[index] / totalWeight;
      const touchpoint = touchpoints.rows[index];
      const result = await client.query(
        `INSERT INTO crm_attribution_results
          (tenant_id, lead_id, campaign_id, source_id, model, attribution_window_days, attributed_weight, attributed_revenue, attributed_conversion_count, calculation_run_id, input_touchpoint_ids)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb) RETURNING *`,
        [tenantId, leadId, intOrNull(touchpoint.campaign_id), intOrNull(touchpoint.source_id), model, windowDays, weight, revenueTotal * weight, weight, run.rows[0].id, JSON.stringify([touchpoint.id])]
      );
      results.push(result.rows[0]);
    }
    await writeAudit(client, { tenantId, entityType: "attribution", entityId: leadId, eventType: "calculated", actorUserId, newValue: { model, records: results.length } });
    return results;
  });
}


export async function getDataQualityIssues(tenantId, { status = "open", limit = 100 } = {}) {
  const tenant = requireTenant(tenantId);
  const result = await sharedPool.query(
    `SELECT * FROM crm_data_quality_issues
      WHERE tenant_id = $1 AND status = $2
      ORDER BY detected_at ASC LIMIT $3`,
    [tenant, status, Math.min(Math.max(Number(limit) || 100, 1), 500)]
  );
  return result.rows;
}

export async function getPeoplePerformance(tenantId, { from, to } = {}) {
  const tenant = requireTenant(tenantId);
  const start = from || "1970-01-01";
  const end = to || "2999-12-31";
  const result = await sharedPool.query(
    `SELECT m.employee_profile_id AS employee_id, p.user_id, p.employee_code, p.designation,
            p.department_id, m.period_start, m.period_end, m.dimensions, m.metrics
       FROM crm_employee_performance_mart m
       LEFT JOIN crm_employee_profiles p ON p.id = m.employee_profile_id AND p.tenant_id = m.tenant_id
      WHERE m.tenant_id = $1 AND m.period_start >= $2::date AND m.period_end <= $3::date
      ORDER BY m.period_end DESC, m.employee_profile_id`,
    [tenant, start, end]
  );
  return result.rows.map((row) => ({ ...row, ...(row.metrics || {}), ...(row.dimensions || {}) }));
}

function dashboardDate(value, fallback) {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
}

/** Live operating view for the Business Head, independent of mart refreshes. */
export async function getBusinessHeadTeamDashboard(tenantId, { from, to, role, search } = {}) {
  const tenant = requireTenant(tenantId);
  const end = dashboardDate(to, new Date().toISOString());
  const start = dashboardDate(from, new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());
  const roleFilter = String(role || '').trim().toLowerCase();
  const searchFilter = String(search || '').trim();

  const membersQuery = `
    WITH team_members AS (
      SELECT u.id AS user_id,
             u."firstName" AS first_name,
             u."lastName" AS last_name,
             u.email,
             u.status,
             u.department_name,
             u.metadata,
             COALESCE(NULLIF(u.metadata->>'crmRole', ''), CASE
               WHEN u."isAdmin" OR u.role = 'admin' THEN 'admin'
               ELSE 'team_member'
             END) AS role_key
        FROM users u
       WHERE u.tenant_id = $1
         AND COALESCE(u.status, 'active') <> 'deleted'
         AND (u."isTeam" = TRUE OR u."isAdmin" = TRUE OR u.role IN ('team', 'admin') OR u.metadata->>'isCRM' = 'true' OR u.metadata->>'crmAccess' = 'true' OR u.metadata ? 'crmRole')
    )
    SELECT tm.user_id,
           tm.first_name,
           tm.last_name,
           tm.email,
           tm.status,
           tm.department_name,
           tm.role_key,
           COALESCE(ep.designation, NULLIF(tm.metadata->>'designation', '')) AS designation,
           COALESCE(ep.employee_code, NULLIF(tm.metadata->>'employeeCode', '')) AS employee_code,
           COALESCE((SELECT COUNT(*) FROM crm_leads_v2 l WHERE l.tenant_id = $1 AND l.owner_user_id = tm.user_id AND l.created_at >= $2::timestamptz AND l.created_at < $3::timestamptz), 0)::int AS leads,
           COALESCE((SELECT COUNT(*) FROM crm_leads_v2 l WHERE l.tenant_id = $1 AND l.owner_user_id = tm.user_id AND l.lifecycle_stage = 'qualified' AND l.created_at >= $2::timestamptz AND l.created_at < $3::timestamptz), 0)::int AS qualified_leads,
           COALESCE((SELECT COUNT(*) FROM crm_leads_v2 l WHERE l.tenant_id = $1 AND l.owner_user_id = tm.user_id AND (l.converted_at IS NOT NULL OR l.lifecycle_stage IN ('won', 'billing_completed')) AND l.created_at >= $2::timestamptz AND l.created_at < $3::timestamptz), 0)::int AS converted_leads,
           COALESCE((SELECT SUM(l.actual_revenue) FROM crm_leads_v2 l WHERE l.tenant_id = $1 AND l.owner_user_id = tm.user_id AND l.created_at >= $2::timestamptz AND l.created_at < $3::timestamptz), 0)::numeric AS revenue,
           COALESCE((SELECT COUNT(*) FROM crm_tasks t WHERE t.tenant_id = $1 AND t.assigned_to_user_id = tm.user_id AND t.created_at >= $2::timestamptz AND t.created_at < $3::timestamptz), 0)::int AS tasks,
           COALESCE((SELECT COUNT(*) FROM crm_tasks t WHERE t.tenant_id = $1 AND t.assigned_to_user_id = tm.user_id AND (t.status = 'completed' OR t.completed_at IS NOT NULL) AND t.created_at >= $2::timestamptz AND t.created_at < $3::timestamptz), 0)::int AS completed_tasks,
           COALESCE((SELECT COUNT(*) FROM crm_tasks t WHERE t.tenant_id = $1 AND t.assigned_to_user_id = tm.user_id AND t.status NOT IN ('completed', 'cancelled') AND t.due_at < NOW()), 0)::int AS overdue_tasks,
           COALESCE((SELECT COUNT(*) FROM crm_communication_events c WHERE c.tenant_id = $1 AND c.owner_user_id = tm.user_id AND c.created_at >= $2::timestamptz AND c.created_at < $3::timestamptz), 0)::int AS touchpoints
      FROM team_members tm
      LEFT JOIN crm_employee_profiles ep ON ep.tenant_id = $1 AND ep.user_id = tm.user_id
     WHERE ($4 = '' OR tm.role_key = $4)
       AND ($5 = '' OR CONCAT_WS(' ', tm.first_name, tm.last_name, tm.email, tm.department_name) ILIKE '%' || $5 || '%')
     ORDER BY converted_leads DESC, revenue DESC, leads DESC, tm.first_name ASC NULLS LAST`;

  const trendQuery = `
    WITH team_members AS (
      SELECT u.id AS user_id,
             COALESCE(NULLIF(u.metadata->>'crmRole', ''), CASE WHEN u."isAdmin" OR u.role = 'admin' THEN 'admin' ELSE 'team_member' END) AS role_key
        FROM users u
       WHERE u.tenant_id = $1
         AND COALESCE(u.status, 'active') <> 'deleted'
         AND (u."isTeam" = TRUE OR u."isAdmin" = TRUE OR u.role IN ('team', 'admin') OR u.metadata->>'isCRM' = 'true' OR u.metadata->>'crmAccess' = 'true' OR u.metadata ? 'crmRole')
    )
    SELECT date_trunc('week', l.created_at)::date AS week_start,
           COUNT(*)::int AS leads,
           COUNT(*) FILTER (WHERE l.converted_at IS NOT NULL OR l.lifecycle_stage IN ('won', 'billing_completed'))::int AS converted_leads,
           COALESCE(SUM(l.actual_revenue), 0)::numeric AS revenue
      FROM crm_leads_v2 l
      JOIN team_members tm ON tm.user_id = l.owner_user_id
     WHERE l.tenant_id = $1 AND l.created_at >= $2::timestamptz AND l.created_at < $3::timestamptz
       AND ($4 = '' OR tm.role_key = $4)
     GROUP BY week_start
     ORDER BY week_start ASC`;

  const [membersResult, trendResult] = await Promise.all([
    sharedPool.query(membersQuery, [tenant, start, end, roleFilter, searchFilter]),
    sharedPool.query(trendQuery, [tenant, start, end, roleFilter]),
  ]);

  const members = membersResult.rows.map((row) => {
    const leads = numberOrZero(row.leads);
    const converted = numberOrZero(row.converted_leads);
    const tasks = numberOrZero(row.tasks);
    return {
      ...row,
      employee_name: [row.first_name, row.last_name].filter(Boolean).join(' ') || row.email || `User ${row.user_id}`,
      role: row.role_key,
      conversion_rate: leads ? (converted / leads) * 100 : null,
      task_completion_rate: tasks ? (numberOrZero(row.completed_tasks) / tasks) * 100 : null,
      revenue: numberOrZero(row.revenue),
    };
  });
  const total = (key) => members.reduce((sum, row) => sum + numberOrZero(row[key]), 0);
  const totalLeads = total('leads');
  const totalConverted = total('converted_leads');
  const totalTasks = total('tasks');
  const roleBreakdown = Object.values(members.reduce((groups, row) => {
    const current = groups[row.role] || { role: row.role, members: 0, leads: 0, converted_leads: 0, revenue: 0, tasks: 0, overdue_tasks: 0 };
    current.members += 1;
    current.leads += numberOrZero(row.leads);
    current.converted_leads += numberOrZero(row.converted_leads);
    current.revenue += numberOrZero(row.revenue);
    current.tasks += numberOrZero(row.tasks);
    current.overdue_tasks += numberOrZero(row.overdue_tasks);
    groups[row.role] = current;
    return groups;
  }, {})).sort((a, b) => b.leads - a.leads);

  return {
    period: { from: start, to: end },
    filters: { role: roleFilter || null, search: searchFilter || null },
    summary: {
      total_members: members.length,
      active_members: members.filter((row) => row.status === 'active').length,
      roles: roleBreakdown.length,
      leads: totalLeads,
      qualified_leads: total('qualified_leads'),
      converted_leads: totalConverted,
      conversion_rate: totalLeads ? (totalConverted / totalLeads) * 100 : null,
      revenue: total('revenue'),
      tasks: totalTasks,
      completed_tasks: total('completed_tasks'),
      overdue_tasks: total('overdue_tasks'),
      touchpoints: total('touchpoints'),
      task_completion_rate: totalTasks ? (total('completed_tasks') / totalTasks) * 100 : null,
    },
    role_breakdown: roleBreakdown,
    members,
    trend: trendResult.rows.map((row) => ({ ...row, revenue: numberOrZero(row.revenue) })),
  };
}
