/**
 * Sending the AHC welcome is a deliberate act, separate from granting the
 * entitlement.
 *
 * Tagging employees onto a package used to email every one of them as a side
 * effect, so a routine eligibility edit could post thousands of messages with
 * no review step and no way to see who was about to receive one. Assignment is
 * now silent by default and this service sends, on request, to a chosen set.
 *
 * Idempotency is the database's: corporate_ahc_entitlement_notifications is
 * unique on (package_id, user_id, event_type, valid_to), so an employee who has
 * already been invited for that window is skipped rather than emailed twice.
 */
import { postgresSequelize as db } from '../db/postgres-sequelize.js';
import { notifyAhcEntitlement } from './corporate-ahc-entitlement-notification.service.js';

/** One call never emails more than this, however many ids are passed. */
export const MAX_PER_DISPATCH = 500;

const q = (sql, replacements = {}) => db.query(sql, { replacements, type: db.QueryTypes.SELECT });
const problem = (message, status = 400) => Object.assign(new Error(message), { status });

/**
 * Who is entitled, who has already been invited, and who is waiting.
 * `armed` is false when the package has no corporate validity window, in which
 * case nothing can be sent — the silent failure that left this feature
 * un-exercised for months.
 */
export async function invitationStatus(packageId) {
  const [p] = await q(
    `SELECT id, name, corporate_id, is_active, metadata FROM corporate_health_package_catalog
      WHERE id=:packageId AND metadata->>'kind'='health_checkup'`, { packageId: String(packageId) });
  if (!p) throw problem('Package not found', 404);

  const metadata = typeof p.metadata === 'string' ? JSON.parse(p.metadata) : p.metadata || {};
  const armed = Boolean(metadata.corporateValidFrom && metadata.corporateValidTo);

  const rows = await q(
    `SELECT u.id AS "userId", concat_ws(' ', u."firstName", u."lastName") AS name, COALESCE(u.email,'') AS email,
            COALESCE(u."phoneNumber",'') AS phone, uhp."validFrom", uhp."validTo", uhp."usedAt",
            n.event_type AS "invitedEvent", n.email_status AS "emailStatus", n.whatsapp_status AS "whatsappStatus", n.sent_at AS "sentAt"
       FROM user_health_packages uhp
       JOIN users u ON u.id = uhp."userId"
       LEFT JOIN corporate_ahc_entitlement_notifications n
              ON n.package_id = uhp."packageId" AND n.user_id = uhp."userId"
             AND n.event_type = 'invitation' AND n.valid_to = uhp."validTo"
      WHERE uhp."packageId" = :packageId AND uhp.corporate_id = :corporateId AND LOWER(uhp.status) = 'active'
      ORDER BY u."firstName", u."lastName", u.id`,
    { packageId: String(packageId), corporateId: p.corporate_id });

  const entitled = rows.map((r) => ({ ...r, invited: Boolean(r.invitedEvent) }));
  return {
    package: { id: p.id, name: p.name, corporateId: p.corporate_id, isActive: p.is_active },
    armed,
    reason: armed ? null : 'The package has no corporate validity window (corporateValidFrom / corporateValidTo), so no invitation can be dated',
    counts: {
      entitled: entitled.length,
      invited: entitled.filter((r) => r.invited).length,
      pending: entitled.filter((r) => !r.invited && r.email).length,
      noEmail: entitled.filter((r) => !r.email).length,
    },
    entitled,
  };
}

/**
 * Send to `userIds`, or to everyone entitled and not yet invited.
 * Reports what it would do unless `send` is true.
 */
export async function dispatchInvitations({ packageId, userIds = null, send = false, limit = MAX_PER_DISPATCH }) {
  const status = await invitationStatus(packageId);
  if (!status.armed) throw problem(status.reason, 409);
  if (!status.package.isActive) throw problem('Activate this package before sending invitations', 409);

  const requested = Array.isArray(userIds) && userIds.length
    ? [...new Set(userIds.map(Number).filter(Number.isInteger))]
    : null;
  if (requested && requested.some((id) => id < 1)) throw problem('Provide valid employee ids');

  const byId = new Map(status.entitled.map((r) => [Number(r.userId), r]));
  const skipped = [];
  let targets = [];

  for (const id of requested ?? status.entitled.map((r) => Number(r.userId))) {
    const row = byId.get(id);
    if (!row) { skipped.push({ userId: id, reason: 'not_entitled' }); continue; }
    if (!row.email) { skipped.push({ userId: id, email: null, reason: 'no_email_on_record' }); continue; }
    if (row.invited) { skipped.push({ userId: id, email: row.email, reason: 'already_invited', sentAt: row.sentAt }); continue; }
    targets.push(row);
  }

  const cap = Math.max(1, Math.min(Number(limit) || MAX_PER_DISPATCH, MAX_PER_DISPATCH));
  const deferred = targets.slice(cap).map((r) => ({ userId: Number(r.userId), email: r.email, reason: 'over_dispatch_cap' }));
  targets = targets.slice(0, cap);

  if (!send) {
    return {
      sent: false, dryRun: true, package: status.package, counts: status.counts,
      wouldSend: targets.map((r) => ({ userId: Number(r.userId), name: r.name, email: r.email, validTo: r.validTo })),
      skipped: [...skipped, ...deferred],
    };
  }

  const results = [];
  for (const row of targets) {
    // Each employee is invited for their OWN stored window, not one recomputed
    // for the batch — that is the date they will actually see, and it is what
    // the idempotency key is built from.
    try {
      const out = await notifyAhcEntitlement({
        packageId: String(packageId), userId: Number(row.userId),
        eventType: 'invitation', validTo: String(row.validTo).slice(0, 10),
      });
      results.push({ userId: Number(row.userId), email: row.email, ...out });
    } catch (error) {
      results.push({ userId: Number(row.userId), email: row.email, sent: false, error: error.message });
    }
  }

  return {
    sent: true, dryRun: false, package: status.package,
    delivered: results.filter((r) => r.sent).length,
    failed: results.filter((r) => !r.sent && !r.duplicate).length,
    duplicates: results.filter((r) => r.duplicate).length,
    results, skipped: [...skipped, ...deferred],
  };
}

export default { invitationStatus, dispatchInvitations, MAX_PER_DISPATCH };
