import pool from '../db/pgPool.js';
import { fileURLToPath } from 'node:url';

// Add links between records inside the CRM domain. Organization ownership
// remains tenant_uid and all reference selections are checked by the API.
export async function up(db = pool) {
  await db.query(`ALTER TABLE crm_activities ADD COLUMN IF NOT EXISTS contact_id BIGINT REFERENCES crm_contacts(id) ON DELETE SET NULL;
    ALTER TABLE crm_deals ADD COLUMN IF NOT EXISTS contact_id BIGINT REFERENCES crm_contacts(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_crm_activities_contact ON crm_activities (tenant_uid, contact_id);
    CREATE INDEX IF NOT EXISTS idx_crm_deals_contact ON crm_deals (tenant_uid, contact_id);`);
  await db.query(`
    INSERT INTO crm_contacts (name,email,phone,company,lead_id,created_by,tenant_uid)
      SELECT DISTINCT ON (d.tenant_uid, LOWER(d.contact_email), d.contact_name)
        d.contact_name,d.contact_email,d.contact_phone,d.company,d.lead_id,d.created_by,d.tenant_uid
      FROM crm_deals d WHERE d.tenant_uid IS NOT NULL AND NULLIF(TRIM(d.contact_name),'') IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM crm_contacts c WHERE c.tenant_uid=d.tenant_uid AND
          ((NULLIF(d.contact_email,'') IS NOT NULL AND LOWER(c.email)=LOWER(d.contact_email)) OR
           (NULLIF(d.contact_email,'') IS NULL AND c.name=d.contact_name)));
    UPDATE crm_deals d SET contact_id=c.id FROM crm_contacts c WHERE d.contact_id IS NULL
      AND d.tenant_uid=c.tenant_uid AND
        ((NULLIF(d.contact_email,'') IS NOT NULL AND LOWER(c.email)=LOWER(d.contact_email)) OR
         (NULLIF(d.contact_email,'') IS NULL AND c.name=d.contact_name));
    WITH matches AS (
      SELECT d.id AS deal_id, MIN(l.id) AS lead_id FROM crm_deals d
      JOIN crm_leads_v2 v ON v.tenant_uid=d.tenant_uid
      JOIN crm_leads l ON l.id=v.legacy_lead_id AND LOWER(TRIM(l.email))=LOWER(TRIM(d.contact_email))
      WHERE d.lead_id IS NULL AND NULLIF(TRIM(d.contact_email),'') IS NOT NULL
      GROUP BY d.id HAVING COUNT(DISTINCT l.id)=1
    ) UPDATE crm_deals d SET lead_id=m.lead_id FROM matches m WHERE d.id=m.deal_id;
    UPDATE crm_leads l SET deal_id=d.id, status='converted', converted_at=COALESCE(l.converted_at,NOW())
      FROM crm_deals d JOIN crm_leads_v2 v ON v.legacy_lead_id=d.lead_id AND v.tenant_uid=d.tenant_uid
      WHERE l.id=d.lead_id AND l.deal_id IS NULL;
    UPDATE crm_leads_v2 v SET owner_user_id=COALESCE(v.owner_user_id,l.assigned_to,l.created_by),
      identity_id=COALESCE(v.identity_id,v.person_id)
      FROM crm_leads l WHERE l.id=v.legacy_lead_id;
  `);
  await db.query(`DO $backfill$
    BEGIN
      IF to_regclass('public.crm_marketing_list_members') IS NOT NULL AND to_regclass('public.users') IS NOT NULL AND to_regclass('public.tenants') IS NOT NULL THEN
        INSERT INTO crm_contacts (name,email,company,created_by,tenant_uid)
          SELECT DISTINCT ON (t.unique_id, LOWER(m.email))
            COALESCE(NULLIF(TRIM(CONCAT_WS(' ',m.first_name,m.last_name)),''),m.email),
            LOWER(m.email),m.company,l.created_by,t.unique_id
          FROM crm_marketing_list_members m JOIN crm_marketing_lists l ON l.id=m.list_id
          JOIN users u ON u.id=l.created_by JOIN tenants t ON t.id=u.tenant_id
          WHERE m.contact_id IS NULL AND m.email NOT LIKE '%,%' AND
            NOT EXISTS (SELECT 1 FROM crm_contacts c WHERE c.tenant_uid=t.unique_id AND LOWER(c.email)=LOWER(m.email));
        UPDATE crm_marketing_list_members m SET contact_id=c.id
          FROM crm_marketing_lists l JOIN users u ON u.id=l.created_by
          JOIN tenants t ON t.id=u.tenant_id JOIN crm_contacts c ON c.tenant_uid=t.unique_id
          WHERE m.list_id=l.id AND m.contact_id IS NULL AND LOWER(m.email)=LOWER(c.email);
      END IF;
    END $backfill$;`);
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const client = await pool.connect();
  try { await client.query('BEGIN'); await up(client); await client.query('COMMIT'); }
  catch (error) { await client.query('ROLLBACK'); console.error(error.message); process.exitCode = 1; }
  finally { client.release(); await pool.end(); }
}
