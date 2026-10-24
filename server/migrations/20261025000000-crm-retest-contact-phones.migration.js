import pool from '../db/pgPool.js';
import { fileURLToPath } from 'node:url';

// Repair only blank phone fields with an unambiguous, explicitly linked lead.
// Existing phones and contacts with different names/emails are never overwritten.
export async function up(db = pool) {
  const deals = await db.query(`
    UPDATE crm_deals d SET contact_phone=l.phone, updated_at=NOW()
    FROM crm_leads l JOIN crm_leads_v2 v ON v.legacy_lead_id=l.id
    WHERE d.lead_id=l.id AND d.tenant_uid=v.tenant_uid
      AND NULLIF(TRIM(d.contact_phone),'') IS NULL AND NULLIF(TRIM(l.phone),'') IS NOT NULL
      AND LOWER(TRIM(d.contact_name))=LOWER(TRIM(l.name))
      AND LOWER(TRIM(d.contact_email))=LOWER(TRIM(l.email)) RETURNING d.id`);
  const contacts = await db.query(`
    WITH candidates AS (
      SELECT c.id, MIN(l.phone) AS phone
      FROM crm_contacts c JOIN crm_deals d ON d.contact_id=c.id AND d.tenant_uid=c.tenant_uid
      JOIN crm_leads l ON l.id=d.lead_id
      JOIN crm_leads_v2 v ON v.legacy_lead_id=l.id AND v.tenant_uid=c.tenant_uid
      WHERE NULLIF(TRIM(c.phone),'') IS NULL AND NULLIF(TRIM(l.phone),'') IS NOT NULL
        AND LOWER(TRIM(c.name))=LOWER(TRIM(l.name)) AND LOWER(TRIM(c.email))=LOWER(TRIM(l.email))
      GROUP BY c.id HAVING COUNT(DISTINCT regexp_replace(l.phone,'[^0-9]','','g'))=1
    ) UPDATE crm_contacts c SET phone=x.phone, updated_at=NOW() FROM candidates x
      WHERE c.id=x.id AND NULLIF(TRIM(c.phone),'') IS NULL RETURNING c.id`);
  return { dealsUpdated: deals.rowCount, contactsUpdated: contacts.rowCount };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const client = await pool.connect();
  try { await client.query('BEGIN'); console.log(JSON.stringify(await up(client))); await client.query('COMMIT'); }
  catch (error) { await client.query('ROLLBACK'); console.error(error.message); process.exitCode=1; }
  finally { client.release(); await pool.end(); }
}
