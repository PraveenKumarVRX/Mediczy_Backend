/**
 * import-fb-existing-leads.mjs
 *
 * Fetches all existing leads from Facebook Lead Ads (Graph API) and inserts
 * them into crm_leads. Safe to re-run — deduplicates by leadgen_id.
 *
 * Usage:
 *   node n8n-setup/import-fb-existing-leads.mjs <PAGE_ID> <PAGE_ACCESS_TOKEN>
 *
 *   Or set env vars:
 *   FB_PAGE_ID=xxx FB_PAGE_ACCESS_TOKEN=yyy node n8n-setup/import-fb-existing-leads.mjs
 */

import pg from 'pg';

const { Pool } = pg;

const PAGE_ID           = process.argv[2] || process.env.FB_PAGE_ID;
const PAGE_ACCESS_TOKEN = process.argv[3] || process.env.FB_PAGE_ACCESS_TOKEN;
const GRAPH_VERSION     = 'v19.0';
const GRAPH_BASE        = `https://graph.facebook.com/${GRAPH_VERSION}`;

if (!PAGE_ID || !PAGE_ACCESS_TOKEN) {
  console.error('Usage: node import-fb-existing-leads.mjs <PAGE_ID> <PAGE_ACCESS_TOKEN>');
  process.exit(1);
}

const pool = new Pool({
  host: 'localhost', port: 5432,
  database: 'mediczy_ai',
  user: 'mediczy_helper',
  password: 'Mediczy2024Helper',
});

// ─── Graph API helpers ────────────────────────────────────────────────────────

async function gget(path, params = {}) {
  const url = new URL(`${GRAPH_BASE}${path}`);
  url.searchParams.set('access_token', PAGE_ACCESS_TOKEN);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString());
  const json = await res.json();
  if (json.error) throw new Error(`Graph API error: ${json.error.message}`);
  return json;
}

async function paginate(path, params = {}) {
  const results = [];
  let cursor = null;
  do {
    const p = { ...params, limit: 100 };
    if (cursor) p.after = cursor;
    const json = await gget(path, p);
    results.push(...(json.data || []));
    cursor = json.paging?.cursors?.after;
    if (!json.paging?.next) cursor = null;
  } while (cursor);
  return results;
}

// ─── Field normalisation ──────────────────────────────────────────────────────

function parseFields(fieldData = []) {
  return fieldData.reduce((acc, { name, values }) => {
    acc[name] = Array.isArray(values) ? values[0] : values;
    return acc;
  }, {});
}

function toE164(raw = '') {
  const s = String(raw).trim();
  const digits = s.startsWith('+') ? '+' + s.slice(1).replace(/\D/g, '') : s.replace(/\D/g, '');
  if (!digits) return null;
  return digits.startsWith('+') ? digits : `+91${digits.replace(/^0/, '')}`;
}

// ─── Already-imported check (by leadgen_id in custom_fields) ─────────────────

async function getImportedIds() {
  const { rows } = await pool.query(
    `SELECT custom_fields->>'leadgen_id' AS leadgen_id FROM crm_leads
     WHERE source = 'facebook-lead-ads' AND custom_fields->>'leadgen_id' IS NOT NULL`
  );
  return new Set(rows.map(r => r.leadgen_id));
}

// ─── Insert one lead ──────────────────────────────────────────────────────────

async function insertLead(lead, formId, pageid) {
  const fields  = parseFields(lead.field_data);
  const name    = fields.full_name || [fields.first_name, fields.last_name].filter(Boolean).join(' ') || 'Unknown';
  const email   = fields.email || null;
  const phone   = toE164(fields.phone_number || fields.phone || '');
  const company = fields.company_name || fields.organization || fields.company || null;
  const desig   = fields.job_title || fields.designation || null;
  const city    = fields.city || null;
  const notes   = fields.message || fields.comments || null;

  const tags = JSON.stringify(['facebook-lead-ads', 'fb-leads', 'marketing']);
  const custom = JSON.stringify({
    leadgen_id:    lead.id,
    page_id:       pageid,
    form_id:       formId,
    ad_id:         lead.ad_id         || null,
    adset_id:      lead.adset_id      || null,
    campaign_id:   lead.campaign_id   || null,
    fb_created_at: lead.created_time  || null,
    city,
    rawFields:     fields,
    source:        'facebook-lead-ads',
    capturedAt:    new Date().toISOString(),
  });

  await pool.query(
    `INSERT INTO crm_leads
       (name, email, phone, company, designation, source, status, priority, notes, tags, custom_fields, created_by)
     VALUES ($1,$2,$3,$4,$5,'facebook-lead-ads','new','high',$6,$7,$8,0)`,
    [name, email, phone, company, desig, notes, tags, custom],
  );

  return { name, phone, email };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function run() {
  console.log(`\n🔍  Fetching lead forms for page ${PAGE_ID}...`);

  let forms;
  try {
    forms = await paginate(`/${PAGE_ID}/leadgen_forms`, { fields: 'id,name,status,leads_count' });
  } catch (err) {
    console.error(`❌  Could not fetch forms: ${err.message}`);
    console.error('    Make sure the token has leads_retrieval permission and is for the correct page.');
    process.exit(1);
  }

  if (!forms.length) {
    console.log('⚠️   No lead forms found for this page.');
    process.exit(0);
  }

  console.log(`📋  Found ${forms.length} form(s):`);
  forms.forEach(f => console.log(`     • [${f.id}] ${f.name}  (${f.leads_count ?? '?'} leads, status: ${f.status})`));

  const imported = await getImportedIds();
  console.log(`\n✅  Already in CRM: ${imported.size} leads (will skip duplicates)\n`);

  let totalInserted = 0;
  let totalSkipped  = 0;

  for (const form of forms) {
    console.log(`\n📥  Importing from form: ${form.name} [${form.id}]`);

    let leads;
    try {
      leads = await paginate(`/${form.id}/leads`, {
        fields: 'id,created_time,field_data,ad_id,adset_id,campaign_id',
      });
    } catch (err) {
      console.warn(`   ⚠️  Skipping form — ${err.message}`);
      continue;
    }

    console.log(`   Found ${leads.length} lead(s) in this form.`);

    for (const lead of leads) {
      if (imported.has(lead.id)) {
        totalSkipped++;
        continue;
      }
      try {
        const { name, phone } = await insertLead(lead, form.id, PAGE_ID);
        imported.add(lead.id);
        totalInserted++;
        console.log(`   ✓  ${name} | ${phone || 'no phone'}`);
      } catch (err) {
        console.warn(`   ✗  Failed to insert lead ${lead.id}: ${err.message}`);
      }
    }
  }

  console.log('\n' + '─'.repeat(50));
  console.log(`✅  Import complete.`);
  console.log(`   Inserted : ${totalInserted}`);
  console.log(`   Skipped  : ${totalSkipped} (already in CRM)`);
  console.log(`   Total    : ${totalInserted + totalSkipped}`);
  console.log('\n   Refresh the CRM Leads page → filter by "Facebook Ads" source.\n');

  await pool.end();
}

run().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
