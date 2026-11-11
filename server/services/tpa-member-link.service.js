/**
 * Links a TPA membership to the account that signs in as that member.
 *
 * The identity problem: tpa_members holds a free-text corporate name, the
 * employer's own staff code, the member's name and four digits of a phone
 * number. Resolving "which card is mine" from a name or four digits collides,
 * and a collision hands one person another person's policy number, coverage
 * and balance.
 *
 * The route taken here is the one the corporate roster already uses. An
 * employer's staff code is unique by that employer's own definition, and
 * corporate_employees."userId" is already linked to users (by email, with a
 * one-time backfill in corporate-employee-retroactive-linking.migration.js).
 * So a membership resolves in two hops:
 *
 *     tpa_members.employee_id + corporate_id
 *       -> corporate_employees."employeeId"
 *       -> corporate_employees."userId"
 *
 * That earlier backfill also recorded what goes wrong when a match is not
 * deterministic: a plain case-insensitive email join linked TEST-SK01 to a
 * years-old placeholder account because two users rows differed only in email
 * case. Every lookup here is therefore exact, and an ambiguous result is
 * REFUSED rather than resolved by picking a winner — an unlinked member sees
 * "no card linked yet", which is recoverable; a wrongly linked member sees
 * someone else's insurance, which is not.
 */
import { QueryTypes } from 'sequelize';
import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';

export const LINK_METHOD = {
  ROSTER: 'corporate_roster',
  MANUAL: 'manual',
  ENROLMENT: 'enrolment',
};

/** Decisions a proposal can carry. Only ROSTER_MATCH is safe to apply unattended. */
export const DECISION = {
  ROSTER_MATCH: 'roster_match',
  ALREADY_LINKED: 'already_linked',
  NO_CORPORATE: 'no_corporate',
  AMBIGUOUS_CORPORATE: 'ambiguous_corporate',
  NO_EMPLOYEE_ID: 'no_employee_id',
  NO_MATCH: 'no_match',
  AMBIGUOUS_MATCH: 'ambiguous_match',
  ACCOUNT_TAKEN: 'account_taken',
};

const UNIQUE_VIOLATION = '23505';
const MISSING_SCHEMA = ['42703', '42P01'];

const errorCode = (error) => error?.original?.code || error?.parent?.code || error?.code;

const badRequest = (message, code) => {
  const error = new Error(message);
  error.statusCode = 400;
  if (code) error.code = code;
  return error;
};

const positiveInt = (value) => {
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
};

/**
 * 'Equitas Small Finance Bank Ltd.' and 'EQUITAS SMALL FINANCE BANK LIMITED'
 * are one employer. Company-suffix noise is dropped so they compare equal;
 * nothing else is, because loosening this further starts matching distinct
 * companies that share a word.
 */
const SUFFIXES = /\b(pvt|private|ltd|limited|llp|inc|incorporated|corp|corporation|co|company|plc)\b/g;

export const normalizeCompanyName = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(SUFFIXES, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** The placeholder createMemberEnrollment writes when no corporate was supplied. */
const UNMAPPED = new Set(['', 'corporate not mapped', 'not mapped', 'na', 'n a', 'unknown']);

/**
 * Resolves a free-text corporate name to one corporates row.
 *
 * Returns { corporateId, companyName } on a single match, { candidates } when
 * more than one employer normalizes to the same name (refused, not guessed),
 * or null when nothing matches.
 */
export async function resolveCorporate(corporateName) {
  const normalized = normalizeCompanyName(corporateName);
  if (!normalized || UNMAPPED.has(normalized)) return null;

  const rows = await sequelize.query(
    `SELECT id, "companyName" AS "companyName", unique_id AS "uid"
       FROM corporates
      WHERE lower(btrim("companyName")) = lower(btrim(:raw))`,
    { replacements: { raw: String(corporateName || '').trim() }, type: QueryTypes.SELECT }
  );
  if (rows.length === 1) return { corporateId: Number(rows[0].id), companyName: rows[0].companyName, uid: rows[0].uid, exact: true };
  if (rows.length > 1) return { candidates: rows.map((r) => ({ corporateId: Number(r.id), companyName: r.companyName })) };

  // No exact match: compare on the normalized form, in SQL-independent code so
  // the same normalization applies to both sides.
  const all = await sequelize.query(
    'SELECT id, "companyName" AS "companyName", unique_id AS "uid" FROM corporates',
    { type: QueryTypes.SELECT }
  );
  const hits = all.filter((row) => normalizeCompanyName(row.companyName) === normalized);
  if (hits.length === 1) return { corporateId: Number(hits[0].id), companyName: hits[0].companyName, uid: hits[0].uid, exact: false };
  if (hits.length > 1) return { candidates: hits.map((r) => ({ corporateId: Number(r.id), companyName: r.companyName })) };
  return null;
}

/**
 * Every active roster entry of this corporate whose staff code matches, and
 * which already has an account. Compared case-insensitively and trimmed, which
 * is how the same code is spelled across an HR upload and a TPA feed, but
 * never partially.
 */
export async function findRosterCandidates({ corporateId, employeeId }) {
  const id = positiveInt(corporateId);
  const code = String(employeeId || '').trim();
  if (!id || !code) return [];

  return sequelize.query(
    `SELECT DISTINCT ON (ce."userId")
            ce.id          AS "employeeRowId",
            ce."userId"    AS "userId",
            ce."employeeId" AS "employeeCode",
            ce.email       AS "rosterEmail",
            u.email        AS "accountEmail",
            u."firstName"  AS "firstName",
            u."lastName"   AS "lastName",
            u.status       AS "accountStatus",
            u."lastLoginAt" AS "lastLoginAt"
       FROM corporate_employees ce
       JOIN users u ON u.id = ce."userId"
      WHERE ce.corporate_id = :corporateId
        AND ce."isActive" = true
        AND ce."userId" IS NOT NULL
        AND upper(btrim(ce."employeeId")) = upper(btrim(:code))
      ORDER BY ce."userId", ce.id ASC`,
    { replacements: { corporateId: id, code }, type: QueryTypes.SELECT }
  );
}

const memberRow = (row) => ({
  memberId: row.member_id,
  tpaId: row.tpa_id === null ? null : Number(row.tpa_id),
  employeeId: row.employee_id,
  employeeName: row.employee_name,
  corporateName: row.corporate_name,
  corporateId: row.corporate_id === null ? null : Number(row.corporate_id),
  policyNumber: row.policy_number,
  status: row.status,
  userId: row.user_id === null ? null : Number(row.user_id),
});

/**
 * What linking this one member would do, without doing it. Every caller — the
 * bulk backfill, the TPA desk screen, the HR screen — reads the same decision,
 * so none of them can apply a rule the others do not.
 */
export async function proposeLink(row) {
  const member = memberRow(row);
  const proposal = { member, decision: null, reason: '', userId: null, corporateId: member.corporateId, candidates: [] };

  if (member.userId) {
    proposal.decision = DECISION.ALREADY_LINKED;
    proposal.userId = member.userId;
    proposal.reason = `Already linked to account #${member.userId}.`;
    return proposal;
  }

  if (!proposal.corporateId) {
    const resolved = await resolveCorporate(member.corporateName);
    if (!resolved) {
      proposal.decision = DECISION.NO_CORPORATE;
      proposal.reason = `"${member.corporateName || '(blank)'}" does not match a corporate on record.`;
      return proposal;
    }
    if (resolved.candidates) {
      proposal.decision = DECISION.AMBIGUOUS_CORPORATE;
      proposal.candidates = resolved.candidates;
      proposal.reason = `"${member.corporateName}" matches ${resolved.candidates.length} corporates.`;
      return proposal;
    }
    proposal.corporateId = resolved.corporateId;
    proposal.corporateName = resolved.companyName;
    proposal.corporateMatchExact = resolved.exact;
  }

  if (!String(member.employeeId || '').trim()) {
    proposal.decision = DECISION.NO_EMPLOYEE_ID;
    proposal.reason = 'Member carries no employee code, so the roster cannot identify them.';
    return proposal;
  }

  const candidates = await findRosterCandidates({ corporateId: proposal.corporateId, employeeId: member.employeeId });
  proposal.candidates = candidates;

  if (!candidates.length) {
    proposal.decision = DECISION.NO_MATCH;
    proposal.reason = `No active employee of this corporate has code ${member.employeeId}.`;
    return proposal;
  }
  if (candidates.length > 1) {
    proposal.decision = DECISION.AMBIGUOUS_MATCH;
    proposal.reason = `Code ${member.employeeId} matches ${candidates.length} accounts in this corporate.`;
    return proposal;
  }

  const userId = Number(candidates[0].userId);
  const taken = await sequelize.query(
    `SELECT member_id FROM tpa_members
      WHERE user_id = :userId AND tpa_id = :tpaId AND member_id <> :memberId
      LIMIT 1`,
    { replacements: { userId, tpaId: member.tpaId, memberId: member.memberId }, type: QueryTypes.SELECT }
  );
  if (taken.length) {
    proposal.decision = DECISION.ACCOUNT_TAKEN;
    proposal.userId = userId;
    proposal.reason = `Account #${userId} is already member ${taken[0].member_id} of this TPA.`;
    return proposal;
  }

  proposal.decision = DECISION.ROSTER_MATCH;
  proposal.userId = userId;
  proposal.reason = `Employee code ${member.employeeId} on this corporate's roster.`;
  return proposal;
}

/**
 * Which link columns exist.
 *
 * Migrations 20261111000100/000200 add them. Before they are applied the
 * enrolment path must behave exactly as it did, rather than failing on an
 * unknown column, so callers that write a link ask first. Memoised per
 * process; a failure is not cached, so applying the migration takes effect
 * without a restart.
 *
 * The projection is a single expression so the row reads the same whether the
 * driver hands back an object or a positional array.
 */
let linkSchemaProbe = null;
export const linkColumns = () => {
  if (!linkSchemaProbe) {
    linkSchemaProbe = sequelize
      .query(
        `SELECT table_name || '.' || column_name AS "ref"
           FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name IN ('tpa_members', 'tpa_member_enrollments')
            AND column_name IN ('user_id', 'corporate_id')`,
        { type: QueryTypes.SELECT }
      )
      .then((rows) => {
        const present = new Set((rows || []).map((row) => row?.ref || row?.[0]).filter(Boolean));
        return {
          memberUser: present.has('tpa_members.user_id'),
          memberCorporate: present.has('tpa_members.corporate_id'),
          enrolmentUser: present.has('tpa_member_enrollments.user_id'),
          enrolmentCorporate: present.has('tpa_member_enrollments.corporate_id'),
        };
      })
      .catch((error) => {
        linkSchemaProbe = null;
        throw error;
      });
  }
  return linkSchemaProbe;
};

/** Resets the memo. Tests and the backfill script use it; nothing else should. */
export const resetLinkSchemaProbe = () => { linkSchemaProbe = null; };

const MEMBER_SELECT = `
  SELECT member_id, tpa_id, employee_id, employee_name, corporate_name,
         corporate_id, policy_number, status, user_id
    FROM tpa_members`;

/** Proposals for the memberships of one TPA that have no account linked yet. */
export async function proposeLinksForTpa({ tpaId, corporateId = null, limit = 200, includeLinked = false } = {}) {
  const id = positiveInt(tpaId);
  if (!id) throw badRequest('A TPA id is required');
  const filters = ['tpa_id = :tpaId'];
  const replacements = { tpaId: id, limit: Math.min(Math.max(parseInt(limit, 10) || 200, 1), 1000) };
  if (!includeLinked) filters.push('user_id IS NULL');
  if (positiveInt(corporateId)) {
    filters.push('corporate_id = :corporateId');
    replacements.corporateId = positiveInt(corporateId);
  }

  let rows;
  try {
    rows = await sequelize.query(
      `${MEMBER_SELECT} WHERE ${filters.join(' AND ')} ORDER BY id ASC LIMIT :limit`,
      { replacements, type: QueryTypes.SELECT }
    );
  } catch (error) {
    // The link columns arrive with 20261111000100/000200. Until they do there
    // is nothing to propose, which is not an error page.
    if (MISSING_SCHEMA.includes(errorCode(error))) return { migrated: false, proposals: [], summary: {} };
    throw error;
  }

  const proposals = [];
  for (const row of rows) proposals.push(await proposeLink(row));
  const summary = proposals.reduce((acc, p) => {
    acc[p.decision] = (acc[p.decision] || 0) + 1;
    return acc;
  }, {});
  return { migrated: true, proposals, summary, linkable: proposals.filter((p) => p.decision === DECISION.ROSTER_MATCH).length };
}

/**
 * Resolves the one membership a caller is allowed to act on.
 *
 * A caller is always scoped: a TPA desk by its own tpa_id, an employer by its
 * own corporate_id. An unscoped lookup is refused rather than defaulted,
 * because the only thing between one TPA's desk and another TPA's members is
 * this clause.
 */
async function loadScopedMember({ memberId, tpaId = null, requireCorporateId = null }) {
  const code = String(memberId || '').trim();
  if (!code) throw badRequest('A member id is required');
  const tpa = positiveInt(tpaId);
  const corporate = positiveInt(requireCorporateId);
  if (!tpa && !corporate) throw badRequest('A TPA id or a corporate id is required to scope the lookup');

  const filters = ['member_id = :code'];
  const replacements = { code };
  if (tpa) { filters.push('tpa_id = :tpa'); replacements.tpa = tpa; }
  if (corporate) { filters.push('corporate_id = :corporate'); replacements.corporate = corporate; }

  const rows = await sequelize.query(
    `${MEMBER_SELECT} WHERE ${filters.join(' AND ')} LIMIT 1`,
    { replacements, type: QueryTypes.SELECT }
  );
  return rows.length ? rows[0] : null;
}

/**
 * Writes one link, after checking that the account being linked is the one the
 * roster actually names. A caller may not nominate an arbitrary account: when
 * the membership carries an employee code, the account has to be a roster
 * match for it, so a mistyped id cannot hand out someone else's card.
 */
export async function applyLink({
  tpaId = null, memberId, userId, actorId = null,
  method = LINK_METHOD.MANUAL, corporateId = null, requireCorporateId = null,
  skipRosterCheck = false,
}) {
  const user = positiveInt(userId);
  if (!user) throw badRequest('A positive account id is required');

  const row = await loadScopedMember({ memberId, tpaId, requireCorporateId });
  if (!row) return null;
  const member = memberRow(row);

  const account = await sequelize.query('SELECT id FROM users WHERE id = :user LIMIT 1', {
    replacements: { user }, type: QueryTypes.SELECT,
  });
  if (!account.length) throw badRequest(`No account #${user} exists`, 'USER_NOT_FOUND');

  const resolvedCorporateId = positiveInt(corporateId) || member.corporateId;

  if (!skipRosterCheck && resolvedCorporateId && String(member.employeeId || '').trim()) {
    const candidates = await findRosterCandidates({ corporateId: resolvedCorporateId, employeeId: member.employeeId });
    if (candidates.length && !candidates.some((c) => Number(c.userId) === user)) {
      throw badRequest(
        `Account #${user} is not on this corporate's roster under employee code ${member.employeeId}.`,
        'ACCOUNT_NOT_ON_ROSTER'
      );
    }
  }

  const filters = ['member_id = :code'];
  const replacements = {
    code: member.memberId, user, actorId: positiveInt(actorId), method,
    corporateId: resolvedCorporateId,
  };
  if (positiveInt(tpaId)) { filters.push('tpa_id = :tpa'); replacements.tpa = positiveInt(tpaId); }
  if (positiveInt(requireCorporateId)) { filters.push('corporate_id = :require'); replacements.require = positiveInt(requireCorporateId); }

  try {
    const rows = await sequelize.query(
      `UPDATE tpa_members
          SET user_id = :user,
              corporate_id = COALESCE(:corporateId, corporate_id),
              linked_by_user_id = :actorId,
              linked_at = NOW(),
              link_method = :method,
              updated_at = NOW()
        WHERE ${filters.join(' AND ')}
        RETURNING member_id, tpa_id, corporate_id, user_id, link_method, linked_at`,
      { replacements, type: QueryTypes.SELECT }
    );
    if (!rows.length) return null;
    return { success: true, link: rows[0] };
  } catch (error) {
    if (errorCode(error) === UNIQUE_VIOLATION) {
      throw badRequest(`Account #${user} is already linked to another member of this TPA.`, 'ACCOUNT_ALREADY_LINKED');
    }
    throw error;
  }
}

export async function removeLink({ tpaId = null, memberId, requireCorporateId = null }) {
  const row = await loadScopedMember({ memberId, tpaId, requireCorporateId });
  if (!row) return null;
  const rows = await sequelize.query(
    `UPDATE tpa_members
        SET user_id = NULL, linked_by_user_id = NULL, linked_at = NULL, link_method = NULL, updated_at = NOW()
      WHERE member_id = :code
      RETURNING member_id`,
    { replacements: { code: row.member_id }, type: QueryTypes.SELECT }
  );
  return rows.length ? { success: true, memberId: rows[0].member_id } : null;
}

/**
 * Proposals for one employer's own memberships.
 *
 * A membership whose corporate_id is still NULL is included only when its
 * free-text corporate name resolves to this employer, so HR sees the rows it
 * is about to adopt but never another company's.
 */
export async function proposeLinksForCorporate({ corporateId, limit = 200 } = {}) {
  const id = positiveInt(corporateId);
  if (!id) throw badRequest('A corporate id is required');

  let rows;
  try {
    rows = await sequelize.query(
      `${MEMBER_SELECT}
        WHERE user_id IS NULL AND (corporate_id = :id OR corporate_id IS NULL)
        ORDER BY id ASC LIMIT :limit`,
      { replacements: { id, limit: Math.min(Math.max(parseInt(limit, 10) || 200, 1), 1000) }, type: QueryTypes.SELECT }
    );
  } catch (error) {
    if (MISSING_SCHEMA.includes(errorCode(error))) return { migrated: false, proposals: [], summary: {} };
    throw error;
  }

  const proposals = [];
  for (const row of rows) {
    const proposal = await proposeLink(row);
    if (Number(proposal.corporateId) !== id) continue; // another employer's member, or unresolvable
    proposals.push(proposal);
  }
  const summary = proposals.reduce((acc, p) => {
    acc[p.decision] = (acc[p.decision] || 0) + 1;
    return acc;
  }, {});
  return { migrated: true, proposals, summary, linkable: proposals.filter((p) => p.decision === DECISION.ROSTER_MATCH).length };
}

/**
 * Applies every unambiguous roster match for one TPA. Dry by default: nothing
 * is written unless the caller asks for it, so the proposal can be read first.
 */
export async function autoLink({ tpaId, corporateId = null, actorId = null, apply = false, limit = 500 } = {}) {
  const { migrated, proposals, summary } = await proposeLinksForTpa({ tpaId, corporateId, limit });
  if (!migrated) return { migrated: false, applied: 0, skipped: 0, summary: {}, results: [] };

  const results = [];
  let applied = 0;
  for (const proposal of proposals) {
    if (proposal.decision !== DECISION.ROSTER_MATCH) {
      results.push({ memberId: proposal.member.memberId, decision: proposal.decision, reason: proposal.reason, applied: false });
      continue;
    }
    if (!apply) {
      results.push({ memberId: proposal.member.memberId, decision: proposal.decision, reason: proposal.reason, userId: proposal.userId, applied: false, wouldApply: true });
      continue;
    }
    try {
      const link = await applyLink({
        tpaId,
        memberId: proposal.member.memberId,
        userId: proposal.userId,
        corporateId: proposal.corporateId,
        actorId,
        method: LINK_METHOD.ROSTER,
      });
      applied += link ? 1 : 0;
      results.push({ memberId: proposal.member.memberId, decision: proposal.decision, userId: proposal.userId, applied: Boolean(link) });
    } catch (error) {
      results.push({ memberId: proposal.member.memberId, decision: 'failed', reason: error.message, applied: false });
    }
  }
  return {
    migrated: true,
    apply,
    applied,
    skipped: results.length - applied,
    summary,
    results,
  };
}

/**
 * The employer submits its own insurance roster.
 *
 * The gap analysis gave HR this from the start — "HR view ... bulk member
 * upload, endorsement requests" — and it was never built, so the only way a
 * membership could be created was the TPA desk typing it in one at a time.
 * That is also why every membership found in production on 2026-11-11 was
 * fabricated: nothing real had any way in.
 *
 * An employer submits enrolments, not memberships: each row lands in
 * tpa_member_enrollments as `submitted`, and the TPA desk approves it. The
 * desk's approval is what creates the membership, and because the enrolment
 * already carries the account and the corporate, the membership it creates is
 * born linked.
 *
 * The account is resolved from this employer's own roster, by exact staff
 * code. A row whose code matches nothing, or matches two accounts, is still
 * submitted — with no account attached and the reason reported — because an
 * enrolment the desk can see and fix is more use than a silent rejection.
 */
export async function submitEnrolments({ corporateId, rows, actorId = null, dryRun = false } = {}) {
  const id = positiveInt(corporateId);
  if (!id) throw badRequest('A corporate id is required');
  if (!Array.isArray(rows) || !rows.length) throw badRequest('members array is required and must not be empty');
  if (rows.length > 2000) throw badRequest('Submit at most 2000 members per upload');

  const columns = await linkColumns();

  const corporate = await sequelize.query(
    `SELECT id, "companyName" AS "companyName", aggregator_id AS "tpaId", aggregator_type AS "aggregatorType"
       FROM corporates WHERE id = :id LIMIT 1`,
    { replacements: { id }, type: QueryTypes.SELECT }
  );
  if (!corporate.length) throw badRequest('Corporate not found', 'CORPORATE_NOT_FOUND');

  const { companyName, tpaId, aggregatorType } = corporate[0];
  // Without this the enrolment has no desk to go to. Guessing a TPA would put
  // one employer's roster in another administrator's queue.
  if (String(aggregatorType || '').toLowerCase() !== 'tpa' || !positiveInt(tpaId)) {
    throw badRequest(
      'Your company is not associated with a TPA yet, so there is no claims desk to send these enrolments to. Ask Mediqzy to link your company to its TPA first.',
      'CORPORATE_HAS_NO_TPA'
    );
  }

  const results = [];
  let accepted = 0;

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index] || {};
    const line = index + 1;
    const employeeCode = String(row.employeeId ?? row.employeeCode ?? '').trim();
    const memberName = String(row.memberName ?? row.employeeName ?? row.name ?? '').trim();
    const policyNumber = String(row.policyNumber ?? '').trim();

    const missing = [
      !employeeCode && 'employeeId',
      !memberName && 'memberName',
      !policyNumber && 'policyNumber',
    ].filter(Boolean);
    if (missing.length) {
      results.push({ line, employeeId: employeeCode || null, status: 'rejected', reason: `Missing ${missing.join(', ')}` });
      continue;
    }

    // Namespaced by TPA and employer, so two employers may use the same staff
    // code and a second upload of the same row is reported rather than
    // creating a duplicate membership.
    const slug = employeeCode.toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '');
    const memberId = `MEM-${tpaId}-C${id}-${slug}`;
    const enrollmentNumber = `ENR-C${id}-${slug}`;

    let userId = null;
    let linkNote = 'No account linked: the staff code is not on your employee roster.';
    const candidates = await findRosterCandidates({ corporateId: id, employeeId: employeeCode });
    if (candidates.length === 1) {
      userId = Number(candidates[0].userId);
      linkNote = `Linked to the account on your roster under ${employeeCode}.`;
    } else if (candidates.length > 1) {
      linkNote = `No account linked: ${candidates.length} accounts on your roster carry ${employeeCode}.`;
    }

    if (dryRun) {
      results.push({ line, employeeId: employeeCode, memberId, enrollmentNumber, status: 'would_submit', userId, reason: linkNote });
      accepted += 1;
      continue;
    }

    const extraCols = [];
    const extraVals = [];
    if (columns.enrolmentUser) { extraCols.push('user_id'); extraVals.push(':userId'); }
    if (columns.enrolmentCorporate) { extraCols.push('corporate_id'); extraVals.push(':corporateId'); }

    try {
      const inserted = await sequelize.query(
        `INSERT INTO tpa_member_enrollments
         (enrollment_number, tpa_id, corporate_name, policy_number, member_id, employee_id, employee_name,
          relation, endorsement_type, dependents, coverage_amount, status${extraCols.length ? ', ' + extraCols.join(', ') : ''})
         VALUES (:enrollmentNumber, :tpaId, :corporateName, :policyNumber, :memberId, :employeeCode, :memberName,
          :relation, :endorsementType, :dependents::jsonb, :coverageAmount, 'submitted'${extraVals.length ? ', ' + extraVals.join(', ') : ''})
         RETURNING enrollment_number, member_id`,
        {
          replacements: {
            enrollmentNumber, tpaId, corporateName: companyName, policyNumber, memberId,
            employeeCode, memberName,
            relation: String(row.relation || 'self').trim().toLowerCase(),
            endorsementType: String(row.endorsementType || 'new_enrollment').trim(),
            dependents: JSON.stringify(Array.isArray(row.dependents) ? row.dependents : []),
            coverageAmount: Number.isFinite(Number(row.coverageAmount)) ? Number(row.coverageAmount) : 0,
            ...(columns.enrolmentUser ? { userId } : {}),
            ...(columns.enrolmentCorporate ? { corporateId: id } : {}),
          },
          type: QueryTypes.SELECT,
        }
      );
      accepted += 1;
      results.push({
        line, employeeId: employeeCode, status: 'submitted',
        enrollmentNumber: inserted[0].enrollment_number, memberId: inserted[0].member_id,
        userId, reason: linkNote,
      });
    } catch (error) {
      if (errorCode(error) === UNIQUE_VIOLATION) {
        results.push({ line, employeeId: employeeCode, enrollmentNumber, status: 'duplicate', reason: 'Already submitted for this employee; the TPA desk has it.' });
        continue;
      }
      if (MISSING_SCHEMA.includes(errorCode(error))) {
        throw schemaNotMigrated();
      }
      results.push({ line, employeeId: employeeCode, status: 'failed', reason: error.message });
    }
  }

  const summary = results.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1;
    return acc;
  }, {});
  return {
    success: true, dryRun, corporateId: id, tpaId: Number(tpaId),
    submitted: dryRun ? 0 : accepted, total: rows.length, summary, results,
    linked: results.filter((r) => r.userId).length,
  };
}

const schemaNotMigrated = () => {
  const error = new Error('Insurance enrolment is not available in this environment yet: the TPA enrolment columns have not been migrated.');
  error.statusCode = 503;
  error.code = 'SCHEMA_NOT_MIGRATED';
  return error;
};

/** The employer's own enrolment queue, whatever stage each row has reached. */
export async function listEnrolmentsForCorporate({ corporateId, status = null, limit = 200 } = {}) {
  const id = positiveInt(corporateId);
  if (!id) throw badRequest('A corporate id is required');

  const filters = ['corporate_id = :id'];
  const replacements = { id, limit: Math.min(Math.max(parseInt(limit, 10) || 200, 1), 1000) };
  if (status && status !== 'all') {
    filters.push('status = :status');
    replacements.status = String(status).trim().toLowerCase();
  }

  try {
    const rows = await sequelize.query(
      `SELECT enrollment_number AS "enrollmentNumber", member_id AS "memberId",
              employee_id AS "employeeId", employee_name AS "memberName", relation,
              policy_number AS "policyNumber", coverage_amount AS "coverageAmount",
              status, user_id AS "userId", decision_reason AS "decisionReason",
              submitted_at AS "submittedAt", decided_at AS "decidedAt"
         FROM tpa_member_enrollments
        WHERE ${filters.join(' AND ')}
        ORDER BY submitted_at DESC NULLS LAST, id DESC
        LIMIT :limit`,
      { replacements, type: QueryTypes.SELECT }
    );
    return { migrated: true, enrolments: rows, total: rows.length };
  } catch (error) {
    if (MISSING_SCHEMA.includes(errorCode(error))) return { migrated: false, enrolments: [], total: 0 };
    throw error;
  }
}

export default {
  LINK_METHOD, DECISION, normalizeCompanyName, resolveCorporate,
  findRosterCandidates, proposeLink, proposeLinksForTpa, proposeLinksForCorporate, linkColumns,
  applyLink, removeLink, autoLink, submitEnrolments, listEnrolmentsForCorporate,
};
