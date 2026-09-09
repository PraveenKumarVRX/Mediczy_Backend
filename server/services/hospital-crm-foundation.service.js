import sharedPool from '../db/pgPool.js';

export const CRM_LIFECYCLE_STAGES = [
  'new',
  'attempting_contact',
  'contacted',
  'qualified',
  'appointment_requested',
  'appointment_booked',
  'appointment_confirmed',
  'visited',
  'consulted',
  'investigation_advised',
  'procedure_advised',
  'admission_advised',
  'billing_completed',
  'won',
  'lost',
  'dormant',
  'nurture',
  'duplicate',
];

export function normalizeEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  return email || null;
}

export function normalizePhone(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (!digits) return null;
  return raw.startsWith('+') ? `+${digits}` : digits;
}

export function resolveTenantId(user) {
  const value = user?.tenantId || user?.tenant_id || user?.organization_id;
  const tenantId = Number(value);
  return Number.isInteger(tenantId) && tenantId > 0 ? tenantId : null;
}

function asPositiveInt(value, fallback = null) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

async function ensurePerson(client, { tenantId, firstName, lastName, name, email, phone, source }) {
  const normalizedEmail = normalizeEmail(email);
  const normalizedPhone = normalizePhone(phone);
  const keys = [
    normalizedEmail ? ['email', normalizedEmail] : null,
    normalizedPhone ? ['phone', normalizedPhone] : null,
  ].filter(Boolean);

  let personId = null;
  if (keys.length) {
    const matches = await client.query(
      `SELECT person_id
         FROM crm_identity_keys
        WHERE tenant_id = $1
          AND ((key_type = $2 AND normalized_value = $3)
            OR (key_type = $4 AND normalized_value = $5))
        ORDER BY person_id
        LIMIT 1`,
      [tenantId, keys[0]?.[0] || null, keys[0]?.[1] || null, keys[1]?.[0] || null, keys[1]?.[1] || null]
    );
    personId = matches.rows[0]?.person_id || null;
  }

  const displayName = String(name || [firstName, lastName].filter(Boolean).join(' ') || 'Unknown patient').trim();
  if (personId) {
    await client.query(
      `UPDATE crm_person_identities
          SET first_name = COALESCE($1, first_name),
              last_name = COALESCE($2, last_name),
              display_name = COALESCE(NULLIF($3, ''), display_name),
              updated_at = NOW()
        WHERE tenant_id = $4 AND id = $5`,
      [firstName || null, lastName || null, displayName, tenantId, personId]
    );
  } else {
    const inserted = await client.query(
      `INSERT INTO crm_person_identities
        (tenant_id, first_name, last_name, display_name, metadata)
       VALUES ($1, $2, $3, $4, $5::jsonb)
       RETURNING id`,
      [tenantId, firstName || null, lastName || null, displayName, JSON.stringify({ created_from: source || 'crm' })]
    );
    personId = inserted.rows[0].id;
  }

  for (const [keyType, normalizedValue, rawValue] of [
    normalizedEmail ? ['email', normalizedEmail, email] : null,
    normalizedPhone ? ['phone', normalizedPhone, phone] : null,
  ].filter(Boolean)) {
    await client.query(
      `INSERT INTO crm_identity_keys
        (tenant_id, person_id, key_type, normalized_value, raw_value, source)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (tenant_id, key_type, normalized_value) DO NOTHING`,
      [tenantId, personId, keyType, normalizedValue, rawValue || null, source || 'crm']
    );
  }

  return personId;
}

async function recordEvent(client, { tenantId, leadId, personId, campaignId, eventType, fromStage, toStage, channel, actorUserId, idempotencyKey, metadata = {} }) {
  const result = await client.query(
    `INSERT INTO crm_funnel_events
      (tenant_id, lead_id, person_id, identity_id, campaign_id, from_stage, to_stage, channel, actor_user_id, idempotency_key, metadata)
     VALUES ($1, $2, $3, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)
     ON CONFLICT (tenant_id, idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
     RETURNING *`,
    [tenantId, leadId || null, personId || null, campaignId || null, eventType, fromStage || null, toStage || null, channel || null, actorUserId || null, idempotencyKey || null, JSON.stringify(metadata)]
  );
  return result.rows[0] || null;
}

export async function createLead(input, actorUserId) {
  const tenantId = asPositiveInt(input.tenantId);
  if (!tenantId) throw new Error('A valid tenantId is required');

  const client = await sharedPool.connect();
  try {
    await client.query('BEGIN');

    if (input.idempotencyKey) {
      const existing = await client.query(
        `SELECT lead_id FROM crm_funnel_events WHERE tenant_id = $1 AND idempotency_key = $2 LIMIT 1`,
        [tenantId, input.idempotencyKey]
      );
      if (existing.rows[0]?.lead_id) {
        const lead = await getLead(existing.rows[0].lead_id, tenantId, client);
        await client.query('COMMIT');
        return lead;
      }
    }

    if (input.legacyLeadId) {
      const existing = await client.query(
        `SELECT id FROM crm_leads_v2 WHERE tenant_id = $1 AND legacy_lead_id = $2 LIMIT 1`,
        [tenantId, input.legacyLeadId]
      );
      if (existing.rows[0]?.id) {
        const lead = await getLead(existing.rows[0].id, tenantId, client);
        await client.query("COMMIT");
        return lead;
      }
    }

    const personId = await ensurePerson(client, {
      tenantId,
      firstName: input.firstName,
      lastName: input.lastName,
      name: input.name,
      email: input.email,
      phone: input.phone,
      source: input.source || 'crm_api',
    });
    const stage = CRM_LIFECYCLE_STAGES.includes(input.lifecycleStage) ? input.lifecycleStage : 'new';
    const priority = ['low', 'medium', 'high', 'urgent'].includes(input.priority) ? input.priority : 'medium';
    const inserted = await client.query(
      `INSERT INTO crm_leads_v2
        (tenant_id, person_id, identity_id, org_unit_id, legacy_lead_id, lifecycle_stage, priority, source_taxonomy_id, campaign_id, source_detail, service_line, inquiry_type, owner_user_id, consent_status, metadata, created_by)
       VALUES ($1, $2, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb, $15)
       RETURNING id`,
      [tenantId, personId, asPositiveInt(input.orgUnitId), asPositiveInt(input.legacyLeadId), stage, priority, asPositiveInt(input.sourceTaxonomyId), asPositiveInt(input.campaignId), input.sourceDetail || null, input.serviceLine || null, input.inquiryType || null, asPositiveInt(input.ownerUserId) || actorUserId || null, (['unknown', 'granted', 'denied', 'withdrawn'].includes(input.consentStatus) ? input.consentStatus : 'unknown'), JSON.stringify(input.metadata || {}), actorUserId || null]
    );
    const leadId = inserted.rows[0].id;

    await recordEvent(client, {
      tenantId,
      leadId,
      personId,
      campaignId: asPositiveInt(input.campaignId),
      eventType: 'lead_created',
      toStage: stage,
      channel: input.channel,
      actorUserId,
      idempotencyKey: input.idempotencyKey,
      metadata: { source_detail: input.sourceDetail || null },
    });

    await client.query('COMMIT');
    return getLead(leadId, tenantId);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function getLead(leadId, tenantId, client = sharedPool) {
  const result = await client.query(
    `SELECT l.*, p.display_name, p.first_name, p.last_name,
            COALESCE(jsonb_agg(DISTINCT jsonb_build_object('type', k.key_type, 'value', k.raw_value, 'normalized', k.normalized_value)) FILTER (WHERE k.id IS NOT NULL), '[]'::jsonb) AS identity_keys,
            st.display_name AS source_name, c.name AS campaign_name
       FROM crm_leads_v2 l
       LEFT JOIN crm_person_identities p ON p.id = l.person_id AND p.tenant_id = l.tenant_id
       LEFT JOIN crm_identity_keys k ON k.person_id = p.id AND k.tenant_id = l.tenant_id
       LEFT JOIN crm_source_taxonomy st ON st.id = l.source_taxonomy_id AND st.tenant_id = l.tenant_id
       LEFT JOIN crm_campaigns_unified c ON c.id = l.campaign_id AND c.tenant_id = l.tenant_id
      WHERE l.id = $1 AND l.tenant_id = $2
      GROUP BY l.id, p.id, st.display_name, c.name`,
    [leadId, tenantId]
  );
  return result.rows[0] || null;
}

export async function transitionLead({ tenantId, leadId, toStage, actorUserId, note, channel }) {
  if (!CRM_LIFECYCLE_STAGES.includes(toStage)) throw new Error(`Unsupported lifecycle stage: ${toStage}`);
  const client = await sharedPool.connect();
  try {
    await client.query('BEGIN');
    const current = await client.query(
      `SELECT id, person_id, campaign_id, lifecycle_stage FROM crm_leads_v2 WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
      [leadId, tenantId]
    );
    if (!current.rows[0]) {
      const error = new Error('Lead not found');
      error.statusCode = 404;
      throw error;
    }
    const lead = current.rows[0];
    if (lead.lifecycle_stage !== toStage) {
      await client.query(
        `UPDATE crm_leads_v2
            SET lifecycle_stage = $1,
                status = CASE WHEN $1 = 'won' THEN 'converted' WHEN $1 = 'lost' THEN 'closed' ELSE status END,
                converted_at = CASE WHEN $1 = 'won' THEN COALESCE(converted_at, NOW()) ELSE converted_at END,
                updated_at = NOW()
          WHERE id = $2 AND tenant_id = $3`,
        [toStage, leadId, tenantId]
      );
      await recordEvent(client, {
        tenantId,
        leadId,
        personId: lead.person_id,
        campaignId: lead.campaign_id,
        eventType: 'stage_changed',
        fromStage: lead.lifecycle_stage,
        toStage,
        channel,
        actorUserId,
        metadata: { note: note || null },
      });
    }
    await client.query('COMMIT');
    return getLead(leadId, tenantId);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function getLeadTimeline(leadId, tenantId, limit = 100) {
  const result = await sharedPool.query(
    `SELECT e.*
       FROM crm_funnel_events e
      WHERE e.tenant_id = $1 AND e.lead_id = $2
      ORDER BY e.occurred_at DESC
      LIMIT $3`,
    [tenantId, leadId, Math.min(Math.max(Number(limit) || 100, 1), 250)]
  );
  return result.rows;
}

export async function getFunnelSummary(tenantId, { from, to, orgUnitId } = {}) {
  const values = [tenantId];
  const filters = ['tenant_id = $1', "status <> 'merged'"];
  if (from) { values.push(from); filters.push(`created_at >= $${values.length}`); }
  if (to) { values.push(to); filters.push(`created_at < $${values.length}`); }
  if (orgUnitId) { values.push(asPositiveInt(orgUnitId)); filters.push(`org_unit_id = $${values.length}`); }
  const result = await sharedPool.query(
    `SELECT lifecycle_stage, COUNT(*)::int AS lead_count,
            COUNT(*) FILTER (WHERE owner_user_id IS NOT NULL)::int AS assigned_count,
            COUNT(*) FILTER (WHERE first_response_at IS NOT NULL)::int AS responded_count,
            AVG(score)::numeric(10,2) AS average_score
       FROM crm_leads_v2
      WHERE ${filters.join(' AND ')}
      GROUP BY lifecycle_stage
      ORDER BY array_position(ARRAY['new','contacted','qualified','appointment_booked','visited','proposal','won','lost','nurture'], lifecycle_stage)`,
    values
  );
  return result.rows;
}

export async function findDuplicateIdentities(tenantId, limit = 100) {
  const result = await sharedPool.query(
    `SELECT k.key_type, k.normalized_value,
            COUNT(DISTINCT k.person_id)::int AS person_count,
            jsonb_agg(DISTINCT jsonb_build_object('person_id', k.person_id, 'name', p.display_name)) AS people
       FROM crm_identity_keys k
       JOIN crm_person_identities p ON p.id = k.person_id AND p.tenant_id = k.tenant_id
      WHERE k.tenant_id = $1
      GROUP BY k.key_type, k.normalized_value
     HAVING COUNT(DISTINCT k.person_id) > 1
      ORDER BY person_count DESC, k.key_type, k.normalized_value
      LIMIT $2`,
    [tenantId, Math.min(Math.max(Number(limit) || 100, 1), 500)]
  );
  return result.rows;
}

export async function mergeLeads({ tenantId, sourceLeadId, targetLeadId, actorUserId, reason }) {
  const client = await sharedPool.connect();
  try {
    await client.query('BEGIN');
    const rows = await client.query(
      `SELECT id, person_id, campaign_id, lifecycle_stage, status
         FROM crm_leads_v2
        WHERE tenant_id = $1 AND id IN ($2, $3)
        FOR UPDATE`,
      [tenantId, sourceLeadId, targetLeadId]
    );
    const source = rows.rows.find((row) => String(row.id) === String(sourceLeadId));
    const target = rows.rows.find((row) => String(row.id) === String(targetLeadId));
    if (!source || !target) {
      const error = new Error('Both source and target leads must exist in the same tenant');
      error.statusCode = 404;
      throw error;
    }
    await client.query(
      `UPDATE crm_leads_v2
          SET status = 'merged', merged_into_lead_id = $1, updated_at = NOW()
        WHERE id = $2 AND tenant_id = $3`,
      [targetLeadId, sourceLeadId, tenantId]
    );
    await client.query(
      `INSERT INTO crm_lead_merge_audit (tenant_id, source_lead_id, target_lead_id, reason, merged_by)
       VALUES ($1, $2, $3, $4, $5)`,
      [tenantId, sourceLeadId, targetLeadId, reason || null, actorUserId || null]
    );
    await recordEvent(client, {
      tenantId,
      leadId: sourceLeadId,
      personId: source.person_id,
      campaignId: source.campaign_id,
      eventType: 'lead_merged',
      actorUserId,
      metadata: { target_lead_id: targetLeadId, reason: reason || null },
    });
    await client.query('COMMIT');
    return getLead(targetLeadId, tenantId);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
