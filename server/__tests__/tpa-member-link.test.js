import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFileSync(join(ROOT, file), 'utf8');

/**
 * A TPA membership held a free-text corporate name, the employer's staff code,
 * a member name and four digits of a phone number — and nothing naming the
 * account that signs in as that member. Resolving a card from a name or four
 * digits collides, and a collision hands one person another person's policy
 * number, coverage and balance.
 *
 * The link is made the way the corporate roster already is: an exact staff
 * code, scoped to one employer, through corporate_employees."userId". The
 * retroactive-linking migration recorded what happens when such a match is
 * not deterministic (TEST-SK01 linked to a years-old placeholder account
 * because two users rows differed only in email case), so every lookup here is
 * exact and an ambiguous result is refused rather than resolved.
 */

// Which query the service issued, keyed by what the SQL is recognisably doing.
const shapeOf = (sql) => {
  const flat = sql.replace(/\s+/g, ' ').trim();
  if (/information_schema\.columns/.test(flat)) return 'schemaProbe';
  if (/UPDATE tpa_members/.test(flat)) return 'update';
  if (/INSERT INTO tpa_member_enrollments/.test(flat)) return 'enrolmentInsert';
  if (/FROM tpa_member_enrollments/.test(flat)) return 'enrolmentSelect';
  if (/FROM corporates WHERE id = :id/.test(flat)) return 'corporateById';
  if (/FROM corporates WHERE lower/.test(flat)) return 'corporateExact';
  if (/FROM corporates$/.test(flat)) return 'corporateAll';
  if (/FROM corporate_employees/.test(flat)) return 'roster';
  if (/SELECT member_id FROM tpa_members WHERE user_id/.test(flat)) return 'accountTaken';
  if (/FROM users WHERE id/.test(flat)) return 'accountExists';
  if (/FROM tpa_members WHERE/.test(flat)) return 'memberSelect';
  return 'unknown';
};

const load = async (handlers = {}) => {
  jest.resetModules();
  const calls = [];
  const query = jest.fn(async (sql, options) => {
    const shape = shapeOf(sql);
    calls.push({ shape, sql: sql.replace(/\s+/g, ' ').trim(), replacements: options?.replacements });
    const handler = handlers[shape];
    if (typeof handler === 'function') return handler(options?.replacements || {}, sql);
    if (handler !== undefined) return handler;
    return [];
  });
  jest.unstable_mockModule('../db/postgres-sequelize.js', () => ({
    postgresSequelize: { query, transaction: jest.fn() },
  }));
  const mod = await import('../services/tpa-member-link.service.js');
  return { ...mod, query, calls };
};

const member = (overrides = {}) => ({
  member_id: 'MEM-001',
  tpa_id: 12,
  employee_id: 'EQ-4821',
  employee_name: 'A Member',
  corporate_name: 'Equitas Small Finance Bank Ltd',
  corporate_id: null,
  policy_number: 'POL-1',
  status: 'active',
  user_id: null,
  ...overrides,
});

describe('company-name folding', () => {
  let normalizeCompanyName;
  beforeEach(async () => { ({ normalizeCompanyName } = await load()); });

  it('treats the same employer written differently as one employer', () => {
    const forms = [
      'Equitas Small Finance Bank Ltd.',
      'EQUITAS SMALL FINANCE BANK LIMITED',
      'Equitas Small Finance Bank Pvt Ltd',
      '  equitas small finance bank  ',
    ];
    const folded = new Set(forms.map(normalizeCompanyName));
    expect(folded.size).toBe(1);
  });

  it('does not collapse two different employers that share words', () => {
    expect(normalizeCompanyName('Dairy Day Ltd')).not.toBe(normalizeCompanyName('Dairy Day Foods Ltd'));
    expect(normalizeCompanyName('Ninjacart')).not.toBe(normalizeCompanyName('Ninjacart Logistics'));
  });

  it('folds an ampersand to a word rather than dropping it', () => {
    expect(normalizeCompanyName('Smith & Jones')).toBe(normalizeCompanyName('Smith and Jones'));
  });
});

describe('resolving a free-text corporate name', () => {
  it('takes an exact single match', async () => {
    const { resolveCorporate } = await load({
      corporateExact: [{ id: 49, companyName: 'Ninjacart', uid: 'C4M9TA' }],
    });
    await expect(resolveCorporate('Ninjacart')).resolves.toMatchObject({ corporateId: 49, exact: true });
  });

  it('refuses two employers with the same name instead of picking one', async () => {
    const { resolveCorporate } = await load({
      corporateExact: [{ id: 49, companyName: 'Acme' }, { id: 77, companyName: 'acme' }],
    });
    const result = await resolveCorporate('Acme');
    expect(result.corporateId).toBeUndefined();
    expect(result.candidates).toHaveLength(2);
  });

  it('falls back to the folded name only when it identifies exactly one employer', async () => {
    const { resolveCorporate } = await load({
      corporateExact: [],
      corporateAll: [
        { id: 7, companyName: 'Equitas Small Finance Bank Limited' },
        { id: 8, companyName: 'Dairy Day' },
      ],
    });
    await expect(resolveCorporate('Equitas Small Finance Bank Ltd.')).resolves.toMatchObject({ corporateId: 7, exact: false });
  });

  it('never resolves the placeholder the enrolment path writes', async () => {
    const { resolveCorporate, query } = await load();
    for (const blank of ['Corporate not mapped', '', null, undefined, '  ', 'N/A']) {
      await expect(resolveCorporate(blank)).resolves.toBeNull();
    }
    expect(query).not.toHaveBeenCalled();
  });
});

describe('roster lookup', () => {
  it('matches a staff code exactly, never partially', async () => {
    const { findRosterCandidates, calls } = await load({ roster: [] });
    await findRosterCandidates({ corporateId: 49, employeeId: 'EQ-4821' });
    const sql = calls.find((c) => c.shape === 'roster').sql;
    expect(sql).toContain('upper(btrim(ce."employeeId")) = upper(btrim(:code))');
    expect(sql).not.toMatch(/\bI?LIKE\b/);
    expect(sql).not.toMatch(/\bsimilar to\b/i);
  });

  it('only considers active roster rows that already have an account', async () => {
    const { findRosterCandidates, calls } = await load({ roster: [] });
    await findRosterCandidates({ corporateId: 49, employeeId: 'EQ-4821' });
    const sql = calls.find((c) => c.shape === 'roster').sql;
    expect(sql).toContain('ce."isActive" = true');
    expect(sql).toContain('ce."userId" IS NOT NULL');
    expect(sql).toContain('ce.corporate_id = :corporateId');
  });

  it('does not query at all without both a corporate and a code', async () => {
    const { findRosterCandidates, query } = await load();
    await expect(findRosterCandidates({ corporateId: null, employeeId: 'EQ-1' })).resolves.toEqual([]);
    await expect(findRosterCandidates({ corporateId: 49, employeeId: '  ' })).resolves.toEqual([]);
    await expect(findRosterCandidates({ corporateId: 0, employeeId: 'EQ-1' })).resolves.toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });
});

describe('what linking one member would do', () => {
  const corporateResolves = { corporateExact: [{ id: 49, companyName: 'Equitas Small Finance Bank Ltd' }] };

  it('reports an existing link rather than re-deciding it', async () => {
    const { proposeLink, DECISION, query } = await load();
    const proposal = await proposeLink(member({ user_id: 7641 }));
    expect(proposal.decision).toBe(DECISION.ALREADY_LINKED);
    expect(proposal.userId).toBe(7641);
    expect(query).not.toHaveBeenCalled();
  });

  it('stops when the corporate name matches nothing', async () => {
    const { proposeLink, DECISION } = await load({ corporateExact: [], corporateAll: [] });
    const proposal = await proposeLink(member());
    expect(proposal.decision).toBe(DECISION.NO_CORPORATE);
  });

  it('stops when the corporate name matches more than one employer', async () => {
    const { proposeLink, DECISION } = await load({
      corporateExact: [{ id: 49, companyName: 'Acme' }, { id: 77, companyName: 'Acme' }],
    });
    const proposal = await proposeLink(member());
    expect(proposal.decision).toBe(DECISION.AMBIGUOUS_CORPORATE);
    expect(proposal.userId).toBeNull();
  });

  it('stops when the membership carries no staff code', async () => {
    const { proposeLink, DECISION } = await load(corporateResolves);
    const proposal = await proposeLink(member({ employee_id: '   ' }));
    expect(proposal.decision).toBe(DECISION.NO_EMPLOYEE_ID);
  });

  it('stops when no employee of that corporate carries the code', async () => {
    const { proposeLink, DECISION } = await load({ ...corporateResolves, roster: [] });
    const proposal = await proposeLink(member());
    expect(proposal.decision).toBe(DECISION.NO_MATCH);
    expect(proposal.userId).toBeNull();
  });

  it('refuses two accounts under one staff code instead of taking the first', async () => {
    const { proposeLink, DECISION } = await load({
      ...corporateResolves,
      roster: [{ userId: 100, employeeCode: 'EQ-4821' }, { userId: 200, employeeCode: 'EQ-4821' }],
    });
    const proposal = await proposeLink(member());
    expect(proposal.decision).toBe(DECISION.AMBIGUOUS_MATCH);
    expect(proposal.userId).toBeNull();
    expect(proposal.candidates).toHaveLength(2);
  });

  it('refuses an account that is already another member of the same TPA', async () => {
    const { proposeLink, DECISION } = await load({
      ...corporateResolves,
      roster: [{ userId: 100, employeeCode: 'EQ-4821' }],
      accountTaken: [{ member_id: 'MEM-999' }],
    });
    const proposal = await proposeLink(member());
    expect(proposal.decision).toBe(DECISION.ACCOUNT_TAKEN);
    expect(proposal.reason).toContain('MEM-999');
  });

  it('proposes the single roster match, and says why', async () => {
    const { proposeLink, DECISION } = await load({
      ...corporateResolves,
      roster: [{ userId: 7641, employeeCode: 'EQ-4821' }],
      accountTaken: [],
    });
    const proposal = await proposeLink(member());
    expect(proposal.decision).toBe(DECISION.ROSTER_MATCH);
    expect(proposal.userId).toBe(7641);
    expect(proposal.corporateId).toBe(49);
    expect(proposal.reason).toContain('EQ-4821');
  });
});

describe('writing a link', () => {
  const linkable = {
    memberSelect: [member()],
    accountExists: [{ id: 7641 }],
    roster: [{ userId: 7641 }],
    update: [{ member_id: 'MEM-001', tpa_id: 12, user_id: 7641 }],
  };

  it('refuses an account id that is not a positive integer', async () => {
    const { applyLink, query } = await load();
    for (const bad of [null, undefined, 0, -3, 'abc', 1.5]) {
      await expect(applyLink({ tpaId: 12, memberId: 'MEM-001', userId: bad })).rejects.toThrow(/positive account id/);
    }
    expect(query).not.toHaveBeenCalled();
  });

  it('refuses an unscoped lookup, which is all that separates one TPA from another', async () => {
    const { applyLink, query } = await load();
    await expect(applyLink({ memberId: 'MEM-001', userId: 7641 })).rejects.toThrow(/TPA id or a corporate id/);
    expect(query).not.toHaveBeenCalled();
  });

  it('scopes the member lookup by the caller, not by the member id alone', async () => {
    const { applyLink, calls } = await load(linkable);
    await applyLink({ tpaId: 12, memberId: 'MEM-001', userId: 7641 });
    const lookup = calls.find((c) => c.shape === 'memberSelect');
    expect(lookup.sql).toContain('tpa_id = :tpa');
    expect(lookup.replacements.tpa).toBe(12);
  });

  it('answers nothing for a member outside the caller\'s scope', async () => {
    const { applyLink } = await load({ ...linkable, memberSelect: [] });
    await expect(applyLink({ tpaId: 12, memberId: 'MEM-001', userId: 7641 })).resolves.toBeNull();
  });

  it('refuses an account that is not the one the roster names', async () => {
    const { applyLink } = await load({
      ...linkable,
      memberSelect: [member({ corporate_id: 49 })],
      roster: [{ userId: 999 }],
    });
    await expect(applyLink({ tpaId: 12, memberId: 'MEM-001', userId: 7641 }))
      .rejects.toThrow(/not on this corporate's roster/);
  });

  it('refuses an account that does not exist', async () => {
    const { applyLink } = await load({ ...linkable, accountExists: [] });
    await expect(applyLink({ tpaId: 12, memberId: 'MEM-001', userId: 7641 })).rejects.toThrow(/No account #7641/);
  });

  it('reports a second membership for one account as that, not as a database error', async () => {
    const { applyLink } = await load({
      ...linkable,
      update: () => {
        const error = new Error('duplicate key value violates unique constraint "uq_tpa_members_tpa_user"');
        error.original = { code: '23505' };
        throw error;
      },
    });
    await expect(applyLink({ tpaId: 12, memberId: 'MEM-001', userId: 7641 }))
      .rejects.toMatchObject({ code: 'ACCOUNT_ALREADY_LINKED', statusCode: 400 });
  });

  it('records who linked it, when, and how', async () => {
    const { applyLink, calls } = await load(linkable);
    await applyLink({ tpaId: 12, memberId: 'MEM-001', userId: 7641, actorId: 55, method: 'corporate_roster' });
    const update = calls.find((c) => c.shape === 'update');
    expect(update.sql).toContain('linked_by_user_id = :actorId');
    expect(update.sql).toContain('linked_at = NOW()');
    expect(update.replacements.actorId).toBe(55);
    expect(update.replacements.method).toBe('corporate_roster');
  });

  it('never clears a corporate already on the row', async () => {
    const { applyLink, calls } = await load(linkable);
    await applyLink({ tpaId: 12, memberId: 'MEM-001', userId: 7641 });
    const update = calls.find((c) => c.shape === 'update');
    expect(update.sql).toContain('corporate_id = COALESCE(:corporateId, corporate_id)');
  });
});

describe('an employer acting on its own memberships', () => {
  it('cannot reach a membership belonging to another company', async () => {
    const { applyLink, calls } = await load({
      memberSelect: [],
      accountExists: [{ id: 7641 }],
    });
    await expect(applyLink({ memberId: 'MEM-001', userId: 7641, requireCorporateId: 49 })).resolves.toBeNull();
    const lookup = calls.find((c) => c.shape === 'memberSelect');
    expect(lookup.sql).toContain('corporate_id = :corporate');
    expect(lookup.replacements.corporate).toBe(49);
  });

  it('is shown an unadopted membership only when its own name resolves to it', async () => {
    const { proposeLinksForCorporate } = await load({
      memberSelect: (r) => (r.id === 49 ? [member(), member({ member_id: 'MEM-OTHER', corporate_name: 'Dairy Day' })] : []),
      corporateExact: (r) => (String(r.raw).startsWith('Equitas') ? [{ id: 49, companyName: 'Equitas Small Finance Bank Ltd' }] : []),
      corporateAll: [],
      roster: [{ userId: 7641 }],
    });
    const result = await proposeLinksForCorporate({ corporateId: 49 });
    expect(result.proposals.map((p) => p.member.memberId)).toEqual(['MEM-001']);
  });
});

describe('the bulk pass', () => {
  it('writes nothing unless asked', async () => {
    const { autoLink, calls } = await load({
      memberSelect: [member()],
      accountTaken: [],
      corporateExact: [{ id: 49, companyName: 'Equitas Small Finance Bank Ltd' }],
      roster: [{ userId: 7641 }],
    });
    const result = await autoLink({ tpaId: 12 });
    expect(result.applied).toBe(0);
    expect(result.results[0].wouldApply).toBe(true);
    expect(calls.some((c) => c.shape === 'update')).toBe(false);
  });

  it('applies only the unambiguous matches', async () => {
    const { autoLink, DECISION } = await load({
      // the list query carries tpaId; the per-member lookup inside applyLink carries code
      memberSelect: (r) => (r.code
        ? [member({ member_id: r.code, corporate_id: 49 })]
        : [member(), member({ member_id: 'MEM-002', employee_id: '' })]),
      accountTaken: [],
      corporateExact: [{ id: 49, companyName: 'Equitas Small Finance Bank Ltd' }],
      accountExists: [{ id: 7641 }],
      roster: [{ userId: 7641 }],
      update: [{ member_id: 'MEM-001', user_id: 7641 }],
    });
    const result = await autoLink({ tpaId: 12, apply: true });
    expect(result.applied).toBe(1);
    expect(result.results.find((r) => r.memberId === 'MEM-002').decision).toBe(DECISION.NO_EMPLOYEE_ID);
  });

  it('treats the link columns not being migrated as nothing to do', async () => {
    const { autoLink } = await load({
      memberSelect: () => {
        const error = new Error('column "user_id" does not exist');
        error.original = { code: '42703' };
        throw error;
      },
    });
    await expect(autoLink({ tpaId: 12 })).resolves.toMatchObject({ migrated: false, applied: 0 });
  });
});

describe('an employer submits its own insurance roster', () => {
  const asTpaClient = { id: 49, companyName: 'Equitas Small Finance Bank Ltd', tpaId: 3, aggregatorType: 'tpa' };
  const ready = {
    corporateById: [asTpaClient],
    schemaProbe: [{ ref: 'tpa_members.user_id' }, { ref: 'tpa_members.corporate_id' },
      { ref: 'tpa_member_enrollments.user_id' }, { ref: 'tpa_member_enrollments.corporate_id' }],
    roster: [{ userId: 7641 }],
    enrolmentInsert: (r) => [{ enrollment_number: r.enrollmentNumber, member_id: r.memberId }],
  };
  const row = (over = {}) => ({ employeeId: 'EQ-4821', memberName: 'Asha Menon', policyNumber: 'GRP-2026-0001', ...over });

  it('refuses an empty upload', async () => {
    const { submitEnrolments } = await load();
    await expect(submitEnrolments({ corporateId: 49, rows: [] })).rejects.toThrow(/must not be empty/);
    await expect(submitEnrolments({ corporateId: 49, rows: null })).rejects.toThrow(/required/);
  });

  it('refuses a company with no TPA instead of guessing one', async () => {
    // Guessing would put one employer's roster in another administrator's queue.
    const { submitEnrolments } = await load({
      corporateById: [{ ...asTpaClient, aggregatorType: 'broker', tpaId: 3 }],
      schemaProbe: ready.schemaProbe,
    });
    await expect(submitEnrolments({ corporateId: 49, rows: [row()] }))
      .rejects.toMatchObject({ code: 'CORPORATE_HAS_NO_TPA' });
  });

  it('rejects an incomplete row by line number and keeps going', async () => {
    const { submitEnrolments } = await load(ready);
    const result = await submitEnrolments({
      corporateId: 49,
      rows: [row(), { memberName: 'No Code' }, row({ employeeId: 'EQ-9' })],
    });
    expect(result.results[1]).toMatchObject({ line: 2, status: 'rejected' });
    expect(result.results[1].reason).toContain('employeeId');
    expect(result.results[1].reason).toContain('policyNumber');
    expect(result.summary.submitted).toBe(2);
  });

  it('links the account its own roster names', async () => {
    const { submitEnrolments } = await load(ready);
    const result = await submitEnrolments({ corporateId: 49, rows: [row()] });
    expect(result.results[0]).toMatchObject({ status: 'submitted', userId: 7641 });
    expect(result.linked).toBe(1);
  });

  it('still submits a row it cannot link, and says why', async () => {
    const { submitEnrolments } = await load({ ...ready, roster: [] });
    const result = await submitEnrolments({ corporateId: 49, rows: [row()] });
    expect(result.results[0]).toMatchObject({ status: 'submitted', userId: null });
    expect(result.results[0].reason).toMatch(/not on your employee roster/);
  });

  it('attaches no account when the staff code matches two of them', async () => {
    const { submitEnrolments } = await load({ ...ready, roster: [{ userId: 1 }, { userId: 2 }] });
    const result = await submitEnrolments({ corporateId: 49, rows: [row()] });
    expect(result.results[0].userId).toBeNull();
    expect(result.results[0].reason).toMatch(/2 accounts on your roster/);
  });

  it('namespaces the member id by TPA and employer, so two employers may share a staff code', async () => {
    const { submitEnrolments } = await load(ready);
    const result = await submitEnrolments({ corporateId: 49, rows: [row()] });
    expect(result.results[0].memberId).toBe('MEM-3-C49-EQ-4821');
    expect(result.results[0].enrollmentNumber).toBe('ENR-C49-EQ-4821');
  });

  it('reports a re-upload as already submitted rather than enrolling twice', async () => {
    const { submitEnrolments } = await load({
      ...ready,
      enrolmentInsert: () => {
        const error = new Error('duplicate key value violates unique constraint');
        error.original = { code: '23505' };
        throw error;
      },
    });
    const result = await submitEnrolments({ corporateId: 49, rows: [row()] });
    expect(result.results[0]).toMatchObject({ status: 'duplicate' });
    expect(result.submitted).toBe(0);
  });

  it('writes nothing on a dry run', async () => {
    const { submitEnrolments, calls } = await load(ready);
    const result = await submitEnrolments({ corporateId: 49, rows: [row()], dryRun: true });
    expect(result.results[0].status).toBe('would_submit');
    expect(result.submitted).toBe(0);
    expect(calls.some((c) => c.shape === 'enrolmentInsert')).toBe(false);
  });

  it('submits for approval, never pre-approved', async () => {
    // The desk's approval is what creates the membership. An employer enrolling
    // straight to active would mint insurance cover nobody underwrote.
    const { submitEnrolments, calls } = await load(ready);
    await submitEnrolments({ corporateId: 49, rows: [row()] });
    const insert = calls.find((c) => c.shape === 'enrolmentInsert');
    expect(insert.sql).toContain("'submitted'");
    expect(insert.sql).not.toContain("'approved'");
    expect(insert.replacements.corporateId).toBe(49);
    expect(insert.replacements.tpaId).toBe(3);
  });

  it('caps one upload, so a bad export cannot enrol a city', async () => {
    const { submitEnrolments } = await load(ready);
    const rows = Array.from({ length: 2001 }, (_, i) => row({ employeeId: `EQ-${i}` }));
    await expect(submitEnrolments({ corporateId: 49, rows })).rejects.toThrow(/at most 2000/);
  });

  it('answers that the feature is unmigrated rather than 500ing', async () => {
    const { submitEnrolments } = await load({
      ...ready,
      enrolmentInsert: () => {
        const error = new Error('relation "tpa_member_enrollments" does not exist');
        error.original = { code: '42P01' };
        throw error;
      },
    });
    await expect(submitEnrolments({ corporateId: 49, rows: [row()] }))
      .rejects.toMatchObject({ statusCode: 503, code: 'SCHEMA_NOT_MIGRATED' });
  });
});

describe('the employer-side enrolment queue', () => {
  it('shows only this employer\'s rows', async () => {
    const { listEnrolmentsForCorporate, calls } = await load({ enrolmentSelect: [] });
    await listEnrolmentsForCorporate({ corporateId: 49 });
    const sql = calls.find((c) => c.shape === 'enrolmentSelect').sql;
    expect(sql).toContain('corporate_id = :id');
  });

  it('reports an unmigrated database as nothing to show', async () => {
    const { listEnrolmentsForCorporate } = await load({
      enrolmentSelect: () => {
        const error = new Error('column "corporate_id" does not exist');
        error.original = { code: '42703' };
        throw error;
      },
    });
    await expect(listEnrolmentsForCorporate({ corporateId: 49 }))
      .resolves.toMatchObject({ migrated: false, total: 0 });
  });
});

describe('the migration', () => {
  const migration = read('migrations/20261111000200-tpa-member-corporate-link.migration.js');

  it('is additive and leaves every new column nullable', () => {
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS corporate_id INTEGER');
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS user_id BIGINT');
    expect(migration).not.toMatch(/SET NOT NULL/);
  });

  it('gives the new cross-entity references their uid twins', () => {
    expect(migration).toContain("attach_uid_reference('tpa_members', 'corporate_id', 'corporate_uid', 'corporates')");
    expect(migration).toContain("attach_uid_reference('tpa_member_enrollments', 'corporate_id', 'corporate_uid', 'corporates')");
  });

  it('still applies where the entity-uid rule was never installed', () => {
    expect(migration).toMatch(/pg_proc WHERE proname = 'attach_uid_reference'/);
  });

  it('is registered so a new environment gets it', () => {
    expect(read('scripts/migrate-all.mjs')).toContain('20261111000200-tpa-member-corporate-link');
  });
});

describe('the endpoints', () => {
  const tpaRoute = read('routes/tpa.route.js');
  const corporateRoute = read('routes/corporate.route.js');

  it('are gated to the TPA desk on the desk side', () => {
    for (const path of ['/member-links/proposals', '/member-links/auto', '/member-links/:memberId']) {
      expect(tpaRoute).toContain(`'${path}', authUser, requireRole('tpa')`);
    }
  });

  it('register the fixed paths before the one that takes a member id', () => {
    // Otherwise POST /member-links/auto is read as member id "auto".
    expect(tpaRoute.indexOf("'/member-links/auto'")).toBeLessThan(tpaRoute.indexOf("'/member-links/:memberId'"));
    expect(tpaRoute.indexOf("'/member-links/proposals'")).toBeLessThan(tpaRoute.indexOf("'/member-links/:memberId'"));
  });

  it('do not apply anything on a bare auto call', () => {
    const handler = tpaRoute.slice(tpaRoute.indexOf("'/member-links/auto'"), tpaRoute.indexOf("'/member-links/:memberId'"));
    expect(handler).toContain('apply: req.body?.apply === true');
  });

  it('scope every employer-side call to the caller\'s own corporate', () => {
    const block = corporateRoute.slice(corporateRoute.indexOf("'/insurance-members'"));
    expect(block).toContain('corporateId: req.corporateUser.corporateId');
    expect(block).toContain('requireCorporateId: corporateId');
    expect(block).not.toMatch(/requireCorporateId:\s*req\.(body|query|params)/);
  });

  it('scope the bulk upload and the queue to the caller too', () => {
    const bulk = corporateRoute.slice(
      corporateRoute.indexOf("'/insurance-members/bulk'"),
      corporateRoute.indexOf("'/insurance-members/enrolments'")
    );
    expect(bulk).toContain('corporateId: req.corporateUser.corporateId');
    expect(bulk).toContain('rows: req.body?.members');
    expect(bulk).toContain('dryRun: req.body?.dryRun === true');
    expect(bulk).not.toMatch(/corporateId:\s*req\.(body|query|params)/);
  });

  it('take the member id from the path and the account from the body, never a corporate from either', () => {
    const block = corporateRoute.slice(
      corporateRoute.indexOf("'/insurance-members/:memberId/link'"),
      corporateRoute.indexOf("router.delete('/insurance-members")
    );
    expect(block).toContain('memberId: req.params.memberId');
    expect(block).toContain('userId: req.body?.userId');
    expect(block).not.toMatch(/corporateId:\s*req\.body/);
  });
});

describe('an enrolment is born linked', () => {
  const lifecycle = read('services/tpa-claims-lifecycle.service.js');

  it('carries the account and corporate from the approved enrolment onto the member', () => {
    expect(lifecycle).toContain("linkUpdates.push('user_id = COALESCE(tpa_members.user_id, EXCLUDED.user_id)')");
    expect(lifecycle).toContain("linkUpdates.push('corporate_id = COALESCE(tpa_members.corporate_id, EXCLUDED.corporate_id)')");
  });

  it('asks whether the columns exist rather than failing on an unmigrated database', () => {
    expect(lifecycle).toContain('await linkColumns()');
  });

  it('does not guess a corporate whose name matches two employers', () => {
    expect(lifecycle).toMatch(/if \(resolved && !resolved\.candidates\) corporateId = resolved\.corporateId/);
  });

  it('still resolves a member e-card through the link, not through a name', () => {
    const resolver = lifecycle.slice(lifecycle.indexOf('async getECardForUser('));
    expect(resolver).toContain('WHERE user_id = :userId');
    for (const column of ['employee_name', 'phone_last4']) expect(resolver).not.toContain(column);
  });
});

describe('the backfill', () => {
  const script = read('scripts/backfill-tpa-member-links.mjs');

  it('reports by default and writes only when told to', () => {
    expect(script).toContain("const APPLY = process.argv.includes('--apply')");
    expect(script).toMatch(/apply: true/);
    expect(script).toMatch(/if \(APPLY && linkable\.length\)/);
  });

  it('refuses to run before the columns exist, instead of linking nothing silently', () => {
    expect(script).toContain('if (!columns.memberUser)');
    expect(script).toContain('if (!columns.memberCorporate)');
  });

  it('only considers memberships with no account linked, so it is safe to re-run', () => {
    expect(script).toMatch(/user_id IS NULL/);
  });
});
