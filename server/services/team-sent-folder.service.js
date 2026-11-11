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
import EmailInbox from '../models/emailInbox.model.js';
import TeamEmailTemplate from '../models/teamEmailTemplate.model.js';

/** The team member whose Sent folder an automated category belongs in. */
export async function teamMemberForCategory(category) {
  if (!category) return null;
  try {
    const rows = await TeamEmailTemplate.findAll({ where: { category }, attributes: ['teamMemberId'], limit: 2 });
    // Ambiguous ownership is left alone rather than guessed, the same rule the
    // attachment lookup follows.
    return rows.length === 1 ? rows[0].teamMemberId : null;
  } catch { return null; }
}

export async function recordSentEmail({
  teamMemberId, to, subject, htmlBody, textBody = null, from = null, fromName = null,
  messageId = null, attachments = [], labels = ['sent'],
}) {
  if (!teamMemberId || !to) return null;
  try {
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

export default { recordSentEmail, teamMemberForCategory };
