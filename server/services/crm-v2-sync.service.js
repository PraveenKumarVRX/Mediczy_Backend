/**
 * Keeps crm_leads_v2 (tenant-scoped) as a live mirror of the legacy crm_leads
 * table. Legacy stays the write target for intake/automation — nothing about
 * that pipeline changes — this just carries every insert/update forward so v2
 * (identity resolution, tenant scoping, crm_communication_events) never goes
 * stale. Fire-and-forget safe: never throws to callers.
 */

import sharedPool from '../db/pgPool.js';

export const CRM_V2_DEFAULT_TENANT_ID = Number(process.env.CRM_V2_DEFAULT_TENANT_ID || 7);

const LIFECYCLE_STAGE_MAP = {
  new: 'new',
  contacted: 'contacted',
  qualified: 'qualified',
  converted: 'won',
  lost: 'lost',
  dead: 'lost',
};

const STATUS_MAP = {
  converted: 'converted',
  lost: 'closed',
  dead: 'closed',
};

function normalizeEmail(email) {
  return email ? String(email).trim().toLowerCase() : null;
}

function normalizePhone(phone) {
  return phone ? String(phone).replace(/[^\d+]/g, '') : null;
}

export async function syncLegacyLeadToV2(legacyLeadId, tenantId = CRM_V2_DEFAULT_TENANT_ID) {
  if (!legacyLeadId) return null;
  try {
    const { rows } = await sharedPool.query(`SELECT * FROM crm_leads WHERE id = $1`, [legacyLeadId]);
    const lead = rows[0];
    if (!lead) return null;

    const normalizedEmail = normalizeEmail(lead.email);
    const normalizedPhone = normalizePhone(lead.phone);

    const existingV2 = await sharedPool.query(
      `SELECT id, person_id, contact_id FROM crm_leads_v2 WHERE tenant_id = $1 AND legacy_lead_id = $2`,
      [tenantId, legacyLeadId]
    );

    let identityId;
    let contactId;

    if (existingV2.rows[0]) {
      ({ person_id: identityId, contact_id: contactId } = existingV2.rows[0]);
      await sharedPool.query(
        `UPDATE crm_person_identities SET first_name = $1, display_name = $1 WHERE id = $2`,
        [lead.name, identityId]
      );
      await sharedPool.query(
        `UPDATE crm_contacts_v2 SET name = $1, full_name = $1, phone_e164 = $2, email = $3 WHERE id = $4`,
        [lead.name, normalizedPhone, normalizedEmail, contactId]
      );
    } else {
      const identity = await sharedPool.query(
        `INSERT INTO crm_person_identities (tenant_id, person_type, first_name, display_name, status, metadata)
         VALUES ($1, 'corporate_contact', $2, $2, 'active', $3) RETURNING id`,
        [tenantId, lead.name, JSON.stringify({ origin: 'crm_v2_sync', legacy_lead_id: legacyLeadId })]
      );
      identityId = identity.rows[0].id;

      const contact = await sharedPool.query(
        `INSERT INTO crm_contacts_v2 (tenant_id, person_id, contact_type, name, full_name, phone_e164, email, consent_status, metadata)
         VALUES ($1, $2, 'lead', $3, $3, $4, $5, 'unknown', $6) RETURNING id`,
        [tenantId, identityId, lead.name, normalizedPhone, normalizedEmail, JSON.stringify({ legacy_contact: true, legacy_lead_id: legacyLeadId })]
      );
      contactId = contact.rows[0].id;
    }

    if (normalizedEmail) {
      await sharedPool.query(
        `INSERT INTO crm_identity_keys (tenant_id, person_id, key_type, normalized_value, raw_value, source)
         VALUES ($1, $2, 'email', $3, $4, $5)
         ON CONFLICT (tenant_id, key_type, normalized_value) DO NOTHING`,
        [tenantId, identityId, normalizedEmail, lead.email, lead.source || 'legacy_crm']
      );
    }
    if (normalizedPhone) {
      await sharedPool.query(
        `INSERT INTO crm_identity_keys (tenant_id, person_id, key_type, normalized_value, raw_value, source)
         VALUES ($1, $2, 'phone', $3, $4, $5)
         ON CONFLICT (tenant_id, key_type, normalized_value) DO NOTHING`,
        [tenantId, identityId, normalizedPhone, lead.phone, lead.source || 'legacy_crm']
      );
    }

    const sourceLabel = lead.source || 'unknown';
    const taxo = await sharedPool.query(
      `INSERT INTO crm_source_taxonomy (tenant_id, channel, source, display_name)
       VALUES ($1, $2, $2, $2)
       ON CONFLICT (tenant_id, channel, source, COALESCE(medium, ''), COALESCE(campaign, ''))
       DO UPDATE SET display_name = EXCLUDED.display_name
       RETURNING id`,
      [tenantId, sourceLabel]
    );
    const sourceTaxonomyId = taxo.rows[0].id;

    const lifecycleStage = LIFECYCLE_STAGE_MAP[lead.status] || 'new';
    const status = STATUS_MAP[lead.status] || 'open';
    const priority = ['low', 'medium', 'high', 'urgent'].includes(lead.priority) ? lead.priority : 'medium';
    const score = Math.max(0, Math.min(100, Number(lead.score) || 0));

    if (existingV2.rows[0]) {
      await sharedPool.query(
        `UPDATE crm_leads_v2 SET lifecycle_stage = $1, status = $2, priority = $3, score = $4,
           source_taxonomy_id = $5, updated_at = NOW()
         WHERE id = $6`,
        [lifecycleStage, status, priority, score, sourceTaxonomyId, existingV2.rows[0].id]
      );
      return existingV2.rows[0].id;
    }

    const inserted = await sharedPool.query(
      `INSERT INTO crm_leads_v2
         (tenant_id, person_id, contact_id, legacy_lead_id, lifecycle_stage, status, priority, score,
          source_taxonomy_id, source_detail, metadata, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW())
       RETURNING id`,
      [
        tenantId, identityId, contactId, legacyLeadId, lifecycleStage, status, priority, score,
        sourceTaxonomyId, sourceLabel,
        JSON.stringify({ migrated_from: 'crm_leads', company: lead.company || null }),
        lead.created_at,
      ]
    );
    return inserted.rows[0].id;
  } catch (err) {
    console.warn('[CRM v2 sync] failed for legacy lead', legacyLeadId, ':', err.message);
    return null;
  }
}

export async function removeLegacyLeadFromV2(legacyLeadId, tenantId = CRM_V2_DEFAULT_TENANT_ID) {
  if (!legacyLeadId) return;
  try {
    await sharedPool.query(`DELETE FROM crm_leads_v2 WHERE tenant_id = $1 AND legacy_lead_id = $2`, [tenantId, legacyLeadId]);
  } catch (err) {
    console.warn('[CRM v2 sync] delete failed for legacy lead', legacyLeadId, ':', err.message);
  }
}

/** Resolve a legacy crm_leads.id to its mirrored crm_leads_v2 row (+ v2 contact). */
export async function resolveV2LeadByLegacyId(legacyLeadId, tenantId = CRM_V2_DEFAULT_TENANT_ID) {
  if (!legacyLeadId) return null;
  const { rows } = await sharedPool.query(
    `SELECT lv.id, lv.contact_id, lv.tenant_id, ct.name, ct.email, ct.phone_e164 AS phone
     FROM crm_leads_v2 lv
     JOIN crm_contacts_v2 ct ON ct.id = lv.contact_id
     WHERE lv.tenant_id = $1 AND lv.legacy_lead_id = $2`,
    [tenantId, legacyLeadId]
  );
  return rows[0] || null;
}

export default { syncLegacyLeadToV2, removeLegacyLeadFromV2, resolveV2LeadByLegacyId, CRM_V2_DEFAULT_TENANT_ID };
