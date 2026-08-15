/**
 * buildDefaultPayerManagement() in hospital-insurance.route.js used to return
 * fabricated placeholder data (fake payer contacts/emails, and an announcement
 * falsely attributed to IRDAI) as its default. ensurePortalWorkspace() persists
 * whatever the default builder returns into insurance_portal_workspaces on
 * first load — so this fake content got written into every hospital's real
 * workspace row and displayed on the TPA Management page as if genuine.
 *
 * This strips only the known-fake seed entries by their hardcoded IDs
 * (payer-1..5, announcement-1..3, contact-1..6) plus one confirmed manually-
 * added test row (contact-test-sanity), leaving any entries a hospital
 * actually added themselves untouched.
 */
const FAKE_PAYER_EMAIL_IDS = ['payer-1', 'payer-2', 'payer-3', 'payer-4', 'payer-5'];
const FAKE_ANNOUNCEMENT_IDS = ['announcement-1', 'announcement-2', 'announcement-3'];
const FAKE_CONTACT_IDS = ['contact-1', 'contact-2', 'contact-3', 'contact-4', 'contact-5', 'contact-6', 'contact-test-sanity'];

export async function up(client) {
  const q = client.query.bind(client);

  const { rows } = await q(`SELECT id, payer_management FROM insurance_portal_workspaces`);
  let touched = 0;

  for (const row of rows) {
    const pm = row.payer_management;
    if (!pm || typeof pm !== 'object') continue;

    const payerEmails = Array.isArray(pm.payerEmails) ? pm.payerEmails.filter((e) => !FAKE_PAYER_EMAIL_IDS.includes(e?.id)) : [];
    const announcements = Array.isArray(pm.announcements) ? pm.announcements.filter((a) => !FAKE_ANNOUNCEMENT_IDS.includes(a?.id)) : [];
    const contacts = Array.isArray(pm.contacts) ? pm.contacts.filter((c) => !FAKE_CONTACT_IDS.includes(c?.id)) : [];

    const changed = payerEmails.length !== (pm.payerEmails?.length || 0)
      || announcements.length !== (pm.announcements?.length || 0)
      || contacts.length !== (pm.contacts?.length || 0);

    if (changed) {
      const next = { ...pm, payerEmails, announcements, contacts };
      await q(`UPDATE insurance_portal_workspaces SET payer_management = $1, updated_at = NOW() WHERE id = $2`, [JSON.stringify(next), row.id]);
      touched++;
    }
  }

  console.log(`✅ Stripped fabricated payer seed data from ${touched} workspace row(s) (of ${rows.length} checked)`);
}

export async function down() {
  // Deliberately no-op — the removed content was fabricated placeholder data
  // misrepresented as real, not a legitimate state to restore.
  console.log('down() is a no-op: fabricated seed data is not restored.');
}
