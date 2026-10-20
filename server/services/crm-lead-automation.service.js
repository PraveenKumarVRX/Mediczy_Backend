/**
 * CRM Lead Automation — post-capture scoring, routing, nurture, and Meta CAPI.
 * Fire-and-forget safe: never throws to callers.
 */

import axios from 'axios';
import sharedPool from '../db/pgPool.js';
import { quickScoreLead } from './ai-crm.service.js';
import metaCapi from './meta-capi.service.js';
import whatsappProduction from './whatsapp-production.service.js';
import { syncLegacyLeadToV2 } from './crm-v2-sync.service.js';

const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL || 'http://localhost:5678/webhook/fb-lead-intake';
const SALES_WHATSAPP = process.env.CRM_SALES_WHATSAPP || '+917826911911';
const HOT_LEAD_THRESHOLD = parseInt(process.env.CRM_HOT_LEAD_THRESHOLD || '70', 10);
const CRM_BASE_URL = process.env.CRM_BASE_URL || 'https://app.mediqzy.com';

const LIST_NAMES = {
  'facebook-lead-ads': 'Facebook Lead Ads',
  'marketing-website': 'Website Demo Leads',
};

// ─── Schema guard ─────────────────────────────────────────────────────────────

export async function ensureLeadAutomationSchema() {
  await sharedPool.query(`
    ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS score INTEGER DEFAULT 0;
    CREATE INDEX IF NOT EXISTS idx_leads_score ON crm_leads(score);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_leadgen_id
      ON crm_leads ((custom_fields->>'leadgen_id'))
      WHERE custom_fields->>'leadgen_id' IS NOT NULL AND custom_fields->>'leadgen_id' != '';
  `).catch((err) => console.warn('[CRM Automation] schema guard:', err.message));
}

// ─── Deduplication ────────────────────────────────────────────────────────────

export async function findExistingLead({ leadgenId, email, phone }) {
  if (leadgenId) {
    const byLeadgen = await sharedPool.query(
      `SELECT * FROM crm_leads WHERE custom_fields->>'leadgen_id' = $1 LIMIT 1`,
      [leadgenId]
    );
    if (byLeadgen.rows[0]) return byLeadgen.rows[0];
  }

  const normalizedPhone = phone ? String(phone).replace(/\D/g, '').slice(-10) : null;
  const normalizedEmail = email ? String(email).trim().toLowerCase() : null;
  if (!normalizedPhone && !normalizedEmail) return null;

  const { rows } = await sharedPool.query(
    `SELECT * FROM crm_leads
      WHERE (
        ($1::text IS NOT NULL AND LOWER(email) = $1)
        OR ($2::text IS NOT NULL AND RIGHT(REGEXP_REPLACE(COALESCE(phone,''), '[^0-9]', '', 'g'), 10) = $2)
      )
      AND created_at > NOW() - INTERVAL '30 days'
      ORDER BY created_at DESC
      LIMIT 1`,
    [normalizedEmail, normalizedPhone]
  );
  return rows[0] || null;
}

// ─── Marketing list sync ──────────────────────────────────────────────────────

async function ensureMarketingList(source) {
  const listName = LIST_NAMES[source] || 'All Marketing Leads';
  const existing = await sharedPool.query(
    `SELECT id FROM crm_marketing_lists WHERE name = $1 LIMIT 1`,
    [listName]
  );
  if (existing.rows[0]) return existing.rows[0].id;

  const envKey = source === 'facebook-lead-ads' ? 'CRM_FB_MARKETING_LIST_ID' : 'CRM_WEB_MARKETING_LIST_ID';
  const envId = parseInt(process.env[envKey] || process.env.CRM_MARKETING_LIST_ID || '0', 10);
  if (envId > 0) return envId;

  const created = await sharedPool.query(
    `INSERT INTO crm_marketing_lists (name, description, source, created_by)
     VALUES ($1, $2, 'automation', 0)
     ON CONFLICT DO NOTHING
     RETURNING id`,
    [listName, `Auto-synced leads from ${source}`]
  );
  if (created.rows[0]) return created.rows[0].id;

  const retry = await sharedPool.query(`SELECT id FROM crm_marketing_lists WHERE name = $1 LIMIT 1`, [listName]);
  return retry.rows[0]?.id || null;
}

async function addLeadToMarketingList(lead) {
  if (!lead?.email) return;
  try {
    const listId = await ensureMarketingList(lead.source || 'marketing-website');
    if (!listId) return;

    const nameParts = String(lead.name || '').trim().split(/\s+/);
    await sharedPool.query(
      `INSERT INTO crm_marketing_list_members
         (list_id, lead_id, email, first_name, last_name, company, source, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,'automation',$7)
       ON CONFLICT (list_id, email) DO UPDATE SET
         lead_id = COALESCE(EXCLUDED.lead_id, crm_marketing_list_members.lead_id),
         first_name = COALESCE(EXCLUDED.first_name, crm_marketing_list_members.first_name),
         company = COALESCE(EXCLUDED.company, crm_marketing_list_members.company),
         updated_at = NOW()`,
      [
        listId,
        lead.id,
        lead.email,
        nameParts[0] || null,
        nameParts.slice(1).join(' ') || null,
        lead.company || null,
        JSON.stringify({ leadId: lead.id, source: lead.source, score: lead.score }),
      ]
    );
  } catch (err) {
    console.warn('[CRM Automation] marketing list sync failed:', err.message);
  }
}

// ─── Notifications ────────────────────────────────────────────────────────────

function triggerN8n(payload) {
  axios.post(N8N_WEBHOOK_URL, payload, { timeout: 5000 })
    .then(() => console.info('[CRM Automation] n8n triggered', { leadId: payload.leadId }))
    .catch((err) => console.warn('[CRM Automation] n8n failed (non-fatal):', err.message));
}

async function notifySalesHotLead(lead, scoreResult) {
  const crmUrl = `${CRM_BASE_URL}/crm/leads`;
  const message =
    `🔥 *Hot Lead Alert* (score ${scoreResult.score})\n\n` +
    `*${lead.name}*\n` +
    `${lead.company ? `🏢 ${lead.company}\n` : ''}` +
    `📞 ${lead.phone || '—'}\n` +
    `✉️ ${lead.email || '—'}\n` +
    `📊 Source: ${lead.source}\n` +
    `🔗 View in CRM: ${crmUrl}`;

  try {
    await whatsappProduction.sendSessionMessage({ to: SALES_WHATSAPP, body: message });
  } catch (err) {
    console.warn('[CRM Automation] hot-lead WA alert failed:', err.message);
  }
}

async function assignHotLead(leadId, score) {
  const envAssignee = parseInt(process.env.CRM_HOT_LEAD_ASSIGN_USER_ID || '0', 10);
  let assignee = envAssignee > 0 ? envAssignee : null;

  if (!assignee) {
    const { rows } = await sharedPool.query(
      `SELECT id FROM users
        WHERE status = 'active'
          AND ("isAdmin" = true OR "isTeam" = true OR role IN ('team', 'admin'))
        ORDER BY "lastLoginAt" DESC NULLS LAST
        LIMIT 1`
    );
    assignee = rows[0]?.id || null;
  }

  if (!assignee) return;

  await sharedPool.query(
    `UPDATE crm_leads SET assigned_to = $1, priority = 'urgent', updated_at = NOW() WHERE id = $2 AND assigned_to IS NULL`,
    [assignee, leadId]
  );
}

// ─── Post-capture pipeline ─────────────────────────────────────────────────────

export async function runPostCaptureAutomation(leadId, options = {}) {
  try {
    await ensureLeadAutomationSchema();

    const { rows } = await sharedPool.query(`SELECT * FROM crm_leads WHERE id = $1`, [leadId]);
    const lead = rows[0];
    if (!lead) return;

    const scoreResult = quickScoreLead({
      name: lead.name,
      company: lead.company,
      source: lead.source,
      status: lead.status,
      email: lead.email,
      phone: lead.phone,
      createdAt: lead.created_at,
      lastContactAt: lead.last_contacted,
    });

    const tierTag = `tier:${scoreResult.tier.toLowerCase()}`;
    const existingTags = Array.isArray(lead.tags) ? lead.tags : (typeof lead.tags === 'string' ? JSON.parse(lead.tags || '[]') : []);
    const tags = [...new Set([...existingTags, tierTag, `score:${scoreResult.score}`])];

    const priority = scoreResult.score >= HOT_LEAD_THRESHOLD ? 'urgent' : (lead.priority || 'high');

    await sharedPool.query(
      `UPDATE crm_leads SET score = $1, priority = $2, tags = $3, updated_at = NOW() WHERE id = $4`,
      [scoreResult.score, priority, JSON.stringify(tags), leadId]
    );

    const enrichedLead = { ...lead, score: scoreResult.score, priority, tags };

    await addLeadToMarketingList(enrichedLead);

    if (options.triggerN8n !== false && options.phoneE164) {
      triggerN8n({
        name: lead.name,
        email: lead.email,
        phone: options.phoneE164,
        company: lead.company,
        leadId,
        leadgen_id: options.leadgenId || null,
        score: scoreResult.score,
        tier: scoreResult.tier,
      });
    }

    metaCapi.sendLeadEvent(enrichedLead, { tier: scoreResult.tier }).catch(() => {});

    if (scoreResult.score >= HOT_LEAD_THRESHOLD) {
      await assignHotLead(leadId, scoreResult.score);
      notifySalesHotLead(enrichedLead, scoreResult).catch(() => {});
    }

    // Advance funnel: mark as contacted once automation has run
    await sharedPool.query(
      `UPDATE crm_leads SET status = 'contacted', last_contacted = NOW(), updated_at = NOW()
       WHERE id = $1 AND status = 'new'`,
      [leadId]
    );

    console.info('[CRM Automation] post-capture done', { leadId, score: scoreResult.score, tier: scoreResult.tier });

    syncLegacyLeadToV2(leadId).catch(() => {});
  } catch (err) {
    console.error('[CRM Automation] post-capture error:', err.message);
  }
}

// ─── Status-change automation ───────────────────────────────────────────────────

export async function autoCreateDealFromLead(lead) {
  if (!lead || lead.deal_id) return lead?.deal_id || null;

  const title = `${lead.company || lead.name} — Opportunity`;
  const assignee = lead.assigned_to || 0;

  const { rows } = await sharedPool.query(
    `INSERT INTO crm_deals
       (title, lead_id, contact_name, contact_email, contact_phone, company, stage, probability, assigned_to, created_by, notes)
     VALUES ($1,$2,$3,$4,$5,$6,'qualification',25,$7,$7,$8)
     RETURNING id`,
    [
      title,
      lead.id,
      lead.name,
      lead.email,
      lead.phone,
      lead.company,
      assignee,
      `Auto-created when lead marked qualified (score: ${lead.score || 0})`,
    ]
  );

  const dealId = rows[0]?.id;
  if (dealId) {
    await sharedPool.query(
      `UPDATE crm_leads SET deal_id = $1, updated_at = NOW() WHERE id = $2`,
      [dealId, lead.id]
    );
    await sharedPool.query(
      `INSERT INTO crm_activities (type, title, description, lead_id, deal_id, created_by)
       VALUES ('system', 'Deal auto-created', 'Deal created automatically when lead was qualified', $1, $2, 0)`,
      [lead.id, dealId]
    );
  }
  return dealId;
}

export async function handleLeadStatusChange(leadId, previousStatus, newStatus) {
  try {
    const { rows } = await sharedPool.query(`SELECT * FROM crm_leads WHERE id = $1`, [leadId]);
    const lead = rows[0];
    if (!lead || previousStatus === newStatus) return;

    if (newStatus === 'qualified') {
      await autoCreateDealFromLead(lead);
      metaCapi.sendQualifiedEvent(lead).catch(() => {});
    }

    if (newStatus === 'converted') {
      let dealValue = 0;
      if (lead.deal_id) {
        const dealRes = await sharedPool.query(`SELECT value FROM crm_deals WHERE id = $1`, [lead.deal_id]);
        dealValue = parseFloat(dealRes.rows[0]?.value || 0);
      }
      metaCapi.sendConversionEvent(lead, dealValue).catch(() => {});
    }

    if (newStatus === 'contacted' && !lead.last_contacted) {
      await sharedPool.query(`UPDATE crm_leads SET last_contacted = NOW() WHERE id = $1`, [leadId]);
    }
  } catch (err) {
    console.error('[CRM Automation] status change error:', err.message);
  }
}

export default {
  ensureLeadAutomationSchema,
  findExistingLead,
  runPostCaptureAutomation,
  autoCreateDealFromLead,
  handleLeadStatusChange,
};
