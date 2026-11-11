/**
 * Record an automated send in the Team inbox's Sent folder.
 *
 * Only the two hand-driven routes (POST /team/emails/send and the template
 * test send) used to write an EmailInbox row, so anything the platform sent by
 * itself — AHC invitations, reminders, extensions — left no trace a human
 * could see: EmailLog is an in-memory store and email_logs is never written by
 * this path. The Team user was told mail had gone out and found an empty Sent
 * folder.
 *
 * Recording is best-effort by design: a send that already succeeded must never
 * be reported as a failure because its bookkeeping row could not be written.
 */
// The models are imported lazily, inside the functions that use them. At
// module scope they would pull Sequelize model definitions into the import
// graph of every route that records a send, and any test mocking
// postgres-sequelize without a working define() then fails to link.
const models = async () => ({
  EmailInbox: (await import('../models/emailInbox.model.js')).default,
  TeamEmailTemplate: (await import('../models/teamEmailTemplate.model.js')).default,
  TeamMember: (await import('../models/postgres/team-member.model.postgres.js')).default,
});

/** The team member whose Sent folder an automated category belongs in. */
export async function teamMemberForCategory(category) {
  if (!category) return null;
  try {
    const { TeamEmailTemplate } = await models();
    const rows = await TeamEmailTemplate.findAll({ where: { category }, attributes: ['teamMemberId'], limit: 2 });
    // Ambiguous ownership is left alone rather than guessed, the same rule the
    // attachment lookup follows.
    return rows.length === 1 ? rows[0].teamMemberId : null;
  } catch { return null; }
}

/**
 * The team member an automated send belongs to when no template category
 * identifies one. With a single active team member there is no ambiguity; with
 * several there is, and nothing is filed rather than filed in the wrong
 * person's folder.
 */
let onlyTeamMemberPromise = null;
export async function soleTeamMemberId() {
  if (!onlyTeamMemberPromise) {
    onlyTeamMemberPromise = models()
      .then(({ TeamMember }) => TeamMember.findAll({ where: { isActive: true }, attributes: ['id'], limit: 2 }))
      .then(rows => (rows.length === 1 ? rows[0].id : null))
      .catch(() => null);
  }
  const id = await onlyTeamMemberPromise;
  if (id === null) onlyTeamMemberPromise = null;   // re-resolve; never cache "unknown"
  return id;
}

/** Test seam. */
export function __resetTeamMemberCache() { onlyTeamMemberPromise = null; }

/**
 * Record an automated send, resolving the owner itself: the template owner for
 * that category when there is one, otherwise the sole team member.
 *
 * Deliberately NOT used for one-time codes, password resets or signup
 * verification: those carry a secret, and a shared Sent folder is the wrong
 * place for it. Nor for CRM campaign blasts, which have their own tracking.
 */
export async function recordAutomatedSend({ category = null, ...rest }) {
  const teamMemberId = (category && await teamMemberForCategory(category)) || await soleTeamMemberId();
  if (!teamMemberId) return null;
  return recordSentEmail({ ...rest, teamMemberId });
}

export async function recordSentEmail({
  teamMemberId, to, subject, htmlBody, textBody = null, from = null, fromName = null,
  messageId = null, attachments = [], labels = ['sent'],
}) {
  if (!teamMemberId || !to) return null;
  try {
    const { EmailInbox } = await models();
    const row = await EmailInbox.create({
      teamMemberId,
      messageId: messageId || `auto-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      from: from || 'care@mysmarthealth.in',
      fromName: fromName || 'My SmartHealth',
      to: Array.isArray(to) ? to : [to],
      cc: [], bcc: [],
      subject: String(subject || '').slice(0, 500),
      body: textBody || htmlBody || '',
      htmlBody: htmlBody || null,
      attachments: (attachments || []).map(a => ({ filename: a.filename, contentType: a.contentType, size: a.content?.length ?? null })),
      isRead: true,
      labels,
      priority: 'normal',
      receivedAt: new Date(),
    });
    return row?.id ?? null;
  } catch (error) {
    console.warn('[sent-folder] could not record an automated send:', error.message);
    return null;
  }
}

export default { recordSentEmail, recordAutomatedSend, teamMemberForCategory, soleTeamMemberId };
