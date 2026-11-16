/** Automatic contact capture and update.
 *
 * Every lead, whatever brought it in (WhatsApp, web form, manual entry, v2 API, Smart-Force), passes
 * through syncLegacyLeadToV2(). That calls captureContactForLead(), which makes sure the person also
 * exists on the Contacts page (crm_contacts) and keeps the record current:
 *   - finds an existing contact by mobile number (last 10 digits) or email, or creates one
 *   - fills fields the contact is missing (email, phone) and replaces a placeholder name
 *     ("WhatsApp +91…") once a real name is known; never overwrites details a person typed
 *   - links the contact to the lead and to the lead's v2 contact (crm_contacts_v2.legacy_contact_id)
 *   - writes an activity so the capture or change is visible on the lead's timeline
 * It never throws into lead intake: on a transaction client it runs inside a savepoint. */
import sharedPool from '../db/pgPool.js';

const PLACEHOLDER_NAME = /^(whatsapp|caller|unknown|unnamed|lead)\b|^\+?\d[\d\s-]{6,}$/i;
export const isPlaceholderName = (name) => !String(name || '').trim() || PLACEHOLDER_NAME.test(String(name).trim());

export function normalizePhone(raw) {
  const d = String(raw || '').replace(/\D/g, '');
  if (d.length === 10) return `+91${d}`;
  if (d.length === 12 && d.startsWith('91')) return `+${d}`;
  if (d.length >= 11 && d.length <= 15) return `+${d}`;
  return null;
}
export function normalizeEmail(raw) {
  const e = String(raw || '').trim().toLowerCase();
  return /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(e) ? e : null;
}
const last10 = (p) => String(p || '').replace(/\D/g, '').slice(-10);

async function withSavepoint(db, work) {
  const isClient = typeof db.release === 'function';
  if (!isClient) return work(db);
  await db.query('SAVEPOINT contact_capture');
  try { const r = await work(db); await db.query('RELEASE SAVEPOINT contact_capture'); return r; }
  catch (error) { await db.query('ROLLBACK TO SAVEPOINT contact_capture'); throw error; }
}

export async function captureContactForLead(db, legacyLeadId, tenantId) {
  try {
    return await withSavepoint(db, async (q) => {
      const { rows: [lead] } = await q.query(
        `SELECT l.id, l.name, l.email, l.phone, l.company, l.source, l.created_by, l.assigned_to, lv.tenant_uid, lv.contact_id AS v2_contact_id
           FROM crm_leads l JOIN crm_leads_v2 lv ON lv.legacy_lead_id = l.id AND lv.tenant_id = $2
          WHERE l.id = $1`, [legacyLeadId, tenantId]);
      if (!lead || !lead.tenant_uid) return null;
      const phone = normalizePhone(lead.phone);
      const email = normalizeEmail(lead.email);
      if (!phone && !email) return null; // nothing to identify a person by

      const { rows: [existing] } = await q.query(
        `SELECT id, name, email, phone, company, lead_id FROM crm_contacts
          WHERE tenant_uid = $1 AND (($2::text <> '' AND right(regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g'), 10) = $2::text)
                                  OR ($3::text IS NOT NULL AND lower(email) = $3::text))
          ORDER BY (lead_id = $4) DESC NULLS LAST, updated_at DESC NULLS LAST LIMIT 1`,
        [lead.tenant_uid, phone ? last10(phone) : '', email, lead.id]);

      let contactId, created = false;
      const changed = [];
      if (!existing) {
        const { rows: [c] } = await q.query(
          `INSERT INTO crm_contacts (name, email, phone, company, lead_id, tags, notes, created_by, tenant_uid, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, now(), now()) RETURNING id`,
          [String(lead.name || phone || email).slice(0, 255), email, phone, lead.company || null, lead.id,
            JSON.stringify(['auto-captured', String(lead.source || 'crm')]), `Captured automatically from ${lead.source || 'a new lead'}.`,
            lead.assigned_to || lead.created_by, lead.tenant_uid]);
        contactId = c.id; created = true;
      } else {
        contactId = existing.id;
        const set = [], vals = [];
        const add = (col, val, label) => { vals.push(val); set.push(`${col} = $${vals.length}`); changed.push(label); };
        if (!existing.email && email) add('email', email, 'email');
        if (!existing.phone && phone) add('phone', phone, 'phone');
        if (isPlaceholderName(existing.name) && !isPlaceholderName(lead.name) && existing.name !== lead.name) add('name', String(lead.name).slice(0, 255), 'name');
        if (!existing.company && lead.company) add('company', lead.company, 'company');
        if (!existing.lead_id) { vals.push(lead.id); set.push(`lead_id = $${vals.length}`); }
        if (set.length) {
          vals.push(contactId);
          await q.query(`UPDATE crm_contacts SET ${set.join(', ')}, updated_at = now() WHERE id = $${vals.length}`, vals);
        }
      }
      if (lead.v2_contact_id) {
        await q.query(`UPDATE crm_contacts_v2 SET legacy_contact_id = $1, preferred_channel = COALESCE(preferred_channel, $2), updated_at = now()
                        WHERE id = $3 AND tenant_id = $4`, [contactId, ['whatsapp', 'sms', 'email'].includes(lead.source) ? lead.source : null, lead.v2_contact_id, tenantId]);
      }
      if (created || changed.length) {
        await q.query(
          `INSERT INTO crm_activities (type, title, description, lead_id, contact_id, created_by, tenant_uid, completed_at, created_at)
           VALUES ('note', $1, $2, $3, $4, $5, $6, now(), now())`,
          [created ? `Contact captured: ${String(lead.name || phone || email).slice(0, 200)}` : `Contact updated: ${changed.join(', ')}`,
            created ? `Created automatically from ${lead.source || 'a new lead'}.` : `Filled in from the lead: ${changed.join(', ')}.`,
            lead.id, contactId, lead.assigned_to || lead.created_by, lead.tenant_uid]);
      }
      return { contactId, created, changed };
    });
  } catch (error) {
    console.warn('[contact-capture] skipped for lead', legacyLeadId, ':', error.message);
    return null;
  }
}

/** Staff edits from the inbox: one save updates the lead, its contact and the v2 contact together. */
export async function updateContactDetails(tenantId, tenantUid, v2LeadId, input = {}, userId) {
  const fail = (statusCode, message) => Object.assign(new Error(message), { statusCode });
  const name = input.name === undefined ? undefined : String(input.name || '').trim();
  const email = input.email === undefined ? undefined : (String(input.email || '').trim() ? normalizeEmail(input.email) : null);
  const phone = input.phone === undefined ? undefined : (String(input.phone || '').trim() ? normalizePhone(input.phone) : null);
  const city = input.city === undefined ? undefined : String(input.city || '').trim().slice(0, 100) || null;
  if (name !== undefined && (!name || name.length > 255)) throw fail(400, 'Name is required (up to 255 characters).');
  if (input.email !== undefined && String(input.email || '').trim() && !email) throw fail(400, 'Enter a valid email address.');
  if (input.phone !== undefined && String(input.phone || '').trim() && !phone) throw fail(400, 'Enter a valid mobile number (10 digits, or with country code).');

  const client = await sharedPool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [lv] } = await client.query(
      `SELECT lv.id, lv.legacy_lead_id, lv.contact_id, lv.person_id, l.name, l.email, l.phone
         FROM crm_leads_v2 lv JOIN crm_leads l ON l.id = lv.legacy_lead_id
        WHERE lv.tenant_id = $1 AND lv.id = $2 AND lv.tenant_uid = $3 FOR UPDATE OF lv`, [tenantId, v2LeadId, tenantUid]);
    if (!lv) throw fail(404, 'Lead not found');
    const next = { name: name ?? lv.name, email: email === undefined ? lv.email : email, phone: phone === undefined ? lv.phone : phone };
    const changed = ['name', 'email', 'phone'].filter((k) => (next[k] || null) !== (lv[k] || null));
    if (phone && phone !== normalizePhone(lv.phone)) {
      // Another lead already using this number would split one patient's conversations.
      const { rows: clash } = await client.query(
        `SELECT l.id, l.name FROM crm_leads l JOIN crm_leads_v2 x ON x.legacy_lead_id = l.id AND x.tenant_uid = $1
          WHERE l.id <> $2 AND right(regexp_replace(COALESCE(l.phone, ''), '[^0-9]', '', 'g'), 10) = $3 LIMIT 1`, [tenantUid, lv.legacy_lead_id, last10(phone)]);
      if (clash.length) throw fail(409, `That number already belongs to lead #${clash[0].id} (${clash[0].name}).`);
    }
    await client.query(`UPDATE crm_leads SET name = $1, email = $2, phone = $3, updated_at = now() WHERE id = $4`, [next.name, next.email, next.phone, lv.legacy_lead_id]);
    await client.query(
      `UPDATE crm_contacts_v2 SET name = $1, full_name = $1, email = $2, phone_e164 = $3, city = COALESCE($4, city), updated_by = $5, updated_at = now()
        WHERE id = $6 AND tenant_id = $7`, [next.name, next.email, normalizePhone(next.phone), city ?? null, userId, lv.contact_id, tenantId]);
    await client.query(`UPDATE crm_person_identities SET first_name = $1, display_name = $1 WHERE id = $2`, [next.name, lv.person_id]);
    await client.query(
      `UPDATE crm_contacts SET name = $1, email = $2, phone = $3, city = COALESCE($4, city), updated_at = now()
        WHERE tenant_uid = $5 AND (lead_id = $6 OR id = (SELECT legacy_contact_id FROM crm_contacts_v2 WHERE id = $7))`,
      [next.name, next.email, normalizePhone(next.phone) || next.phone, city ?? null, tenantUid, lv.legacy_lead_id, lv.contact_id]);
    if (changed.length || city) {
      await client.query(
        `INSERT INTO crm_activities (type, title, description, lead_id, created_by, tenant_uid, completed_at, created_at)
         VALUES ('note', $1, $2, $3, $4, $5, now(), now())`,
        [`Contact details updated: ${[...changed, ...(city ? ['city'] : [])].join(', ')}`, 'Updated from the inbox.', lv.legacy_lead_id, userId, tenantUid]);
    }
    await client.query('COMMIT');
    // Capture links/creates the Contacts-page record if the edit added the first phone or email.
    await captureContactForLead(sharedPool, lv.legacy_lead_id, tenantId);
    return { lead_id: lv.id, changed: [...changed, ...(city ? ['city'] : [])], ...next };
  } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
  finally { client.release(); }
}

/** Removes a contact that capture created for a lead, when that lead is deleted and nothing else uses it. */
export async function retireCapturedContact(legacyLeadId) {
  await sharedPool.query(
    `DELETE FROM crm_contacts c WHERE c.lead_id = $1 AND c.tags ? 'auto-captured'
        AND NOT EXISTS (SELECT 1 FROM crm_deals d WHERE d.contact_id = c.id)`,
    [legacyLeadId]).catch((error) => console.warn('[contact-capture] retire failed:', error.message));
}
