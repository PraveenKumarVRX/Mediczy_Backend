import pool from '../../db/pgPool.js';

// Restrict legacy AI queries to the same records as the CRM lists. CTEs preserve
// aggregates, joins and LIMIT semantics: filtering happens before aggregation.
const predicates = {
  crm_leads: (p) => `id IN (SELECT legacy_lead_id FROM public.crm_leads_v2 WHERE tenant_uid = ${p})`,
  crm_deals: (p) => `tenant_uid = ${p}`,
  crm_contacts: (p) => `tenant_uid = ${p}`,
  crm_activities: (p) => `tenant_uid = ${p}`,
};
const actorTables = ['crm_marketing_campaigns', 'crm_marketing_lists', 'crm_ai_email_communications'];

export async function crmQuery(user, sql, values = [], db = pool) {
  if (!user?.tenantUid || !user?.id) throw new Error('CRM tenant context is required');
  const params = [...values];
  params.push(user.tenantUid);
  const tenant = `$${params.length}`;
  params.push(user.id);
  const actor = `$${params.length}`;
  const scopes = { ...predicates, ...Object.fromEntries(actorTables.map(t => [t, () => `created_by = ${actor}`])) };
  const mutation = sql.match(/^\s*UPDATE\s+(crm_\w+)\b/i);
  if (mutation) {
    const predicate = scopes[mutation[1]];
    if (!predicate || !/\bWHERE\b/i.test(sql)) throw new Error('Unsupported CRM mutation');
    sql = sql.replace(/\bWHERE\b/i, `WHERE (${predicate(tenant)}) AND ${tenant}::text IS NOT NULL AND ${actor}::bigint IS NOT NULL AND `);
  } else if (/^\s*SELECT\b/i.test(sql)) {
    const ctes = Object.entries(scopes)
      .filter(([table]) => new RegExp(`\\b(?:FROM|JOIN)\\s+${table}\\b`, 'i').test(sql))
      .map(([table, predicate]) => `${table} AS (SELECT * FROM public.${table} WHERE ${predicate(tenant)})`);
    // Child marketing records have no ownership column; scope through parent.
    for (const [table, parent, key] of [
      ['crm_marketing_list_members', 'crm_marketing_lists', 'list_id'],
      ['crm_marketing_campaign_recipients', 'crm_marketing_campaigns', 'campaign_id'],
      ['crm_marketing_events', 'crm_marketing_campaigns', 'campaign_id'],
    ]) {
      if (new RegExp(`\\b(?:FROM|JOIN)\\s+${table}\\b`, 'i').test(sql)) {
        ctes.push(`${table} AS (SELECT * FROM public.${table} WHERE ${key} IN (SELECT id FROM public.${parent} WHERE created_by = ${actor}))`);
      }
    }
    if (!ctes.length) throw new Error('Unsupported CRM read');
    sql = `WITH crm_scope AS (SELECT ${tenant}::text AS tenant_uid, ${actor}::bigint AS actor_id), ${ctes.join(', ')} ${sql}`;
  } else {
    // Draft inserts have their actor supplied by the authenticated route.
    if (!/^\s*INSERT INTO crm_ai_email_communications\b/i.test(sql)) throw new Error('Unsupported CRM query');
    return db.query(sql, values);
  }
  return db.query(sql, params);
}
