import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFileSync(join(ROOT, file), 'utf8');

/**
 * A corporate employee can hold up to seven group policies at once, each with
 * a different claim route: a hospital bill is settled cashless on an e-card,
 * an accident or life claim goes through HR with documents and has no card at
 * all, outpatient cover is a balance to spend. The app showed them as one
 * generic "Insurance" card and used the first, so six were invisible and the
 * one shown was arbitrary.
 *
 * Two rules decide whether this is safe to ship. A group policy covers every
 * employee of the corporate, so a member list that is not filtered to the
 * caller's own family discloses other families' dependants, their relations
 * and their dates of birth. And a term the employer never supplied must come
 * back as missing, not as a default: a co-pay or a deductible invented here is
 * a number a member plans around at an admission desk.
 */

const shapeOf = (sql) => {
  const flat = sql.replace(/\s+/g, ' ').trim();
  if (/FROM policy_members m JOIN insurance_policies/.test(flat)) return 'policies';
  if (/FROM policy_members m LEFT JOIN users/.test(flat)) return 'members';
  if (/FROM tpas/.test(flat)) return 'tpas';
  if (/FROM insurance_claims/.test(flat)) return 'claims';
  return 'other';
};

const load = async (handlers = {}) => {
  jest.resetModules();
  const calls = [];
  const query = jest.fn(async (sql, options) => {
    const shape = shapeOf(sql);
    calls.push({ shape, sql: sql.replace(/\s+/g, ' ').trim(), replacements: options?.replacements });
    const handler = handlers[shape];
    if (typeof handler === 'function') return handler(options?.replacements || {});
    return handler ?? [];
  });
  jest.unstable_mockModule('../db/postgres-sequelize.js', () => ({
    postgresSequelize: { query, transaction: jest.fn() },
  }));
  const mod = await import('../services/corporate-policy-wallet.service.js');
  return { ...mod, query, calls };
};

const policyRow = (over = {}) => ({
  id: 1, policyNumber: 'GRP-1', policyName: 'Group Health', policyType: 'GHI', status: 'active',
  sumInsured: '500000', coverAmount: null, baseSumInsured: null, deductible: null,
  linkedBasePolicyId: null, floater: true, copayPercent: '0', roomRentLimit: '5000',
  maternityCovered: true, benefitSchedule: [], opLimits: [], waitingPeriods: {},
  exclusions: [], policyStartDate: '2026-04-01', policyEndDate: '2027-03-31',
  voluntary: false, premiumPerYear: null, enrolmentFrom: null, enrolmentTo: null,
  policyDocumentUrl: null, claimFormUrl: null, corporateId: 4, tpaId: null,
  insurer: 'Star Health', myMemberRowId: 10, myIndividualSumInsured: null,
  myUsed: '42000', myRemaining: '458000',
  nomineeName: null, nomineeRelation: null, nomineeUpdatedAt: null, memberCardNumber: 'CARD-1',
  ...over,
});

const memberRow = (over = {}) => ({
  memberId: 10, policyId: 1, userId: 19, relationship: 'self', name: 'Asha Menon',
  dob: '1988-04-12', sumInsured: null, used: '42000', remaining: '458000',
  memberCardNumber: 'CARD-1', ...over,
});

describe('a member sees their own family and nobody else\'s', () => {
  it('filters both reads on the family the row belongs to', async () => {
    const { getPolicyWallet, calls } = await load({ policies: [policyRow()], members: [memberRow()] });
    await getPolicyWallet(19);
    for (const shape of ['policies', 'members']) {
      const sql = calls.find((c) => c.shape === shape).sql;
      expect(sql).toContain('m."primaryMemberUserId" = :userId');
    }
    expect(calls.find((c) => c.shape === 'members').replacements.userId).toBe(19);
  });

  it('reaches policies only through a membership row, so none can leak past a later filter', async () => {
    const { getPolicyWallet, calls } = await load({ policies: [], members: [] });
    await getPolicyWallet(19);
    const sql = calls.find((c) => c.shape === 'policies').sql;
    expect(sql).toMatch(/FROM policy_members m JOIN insurance_policies p ON p\.id = m\."policyId"/);
  });

  it('never reads a member list keyed only on the policy', () => {
    const service = read('services/corporate-policy-wallet.service.js');
    // Any policy_members read that is not scoped to one family would return
    // every employee's dependants on a group policy.
    const reads = service.match(/FROM policy_members[\s\S]{0,600}?`/g) || [];
    expect(reads.length).toBeGreaterThan(0);
    for (const block of reads) expect(block).toContain('primaryMemberUserId');
  });

  it('answers an empty wallet for a bad account id without querying', async () => {
    const { getPolicyWallet, query } = await load();
    for (const bad of [null, 0, -2, 'abc']) {
      const wallet = await getPolicyWallet(bad);
      expect(wallet.policies).toEqual([]);
    }
    expect(query).not.toHaveBeenCalled();
  });
});

describe('typing and grouping', () => {
  it('groups each type by the job it does', async () => {
    const { POLICY_TYPES } = await load();
    const groups = Object.fromEntries(Object.entries(POLICY_TYPES).map(([k, v]) => [k, v.group]));
    expect(groups).toEqual({
      GHI: 'hospital', GHI_TOPUP: 'hospital',
      PARENTS_GHI: 'parents', PARENTS_TOPUP: 'parents',
      GPA: 'accident_life', GTLI: 'accident_life',
      OPD: 'outpatient',
    });
  });

  it('gives an e-card only to the types a hospital can use it for', async () => {
    const { POLICY_TYPES } = await load();
    expect(POLICY_TYPES.GHI.hasECard).toBe(true);
    expect(POLICY_TYPES.PARENTS_GHI.hasECard).toBe(true);
    // Accident and life are claimed through HR with documents. An e-card here
    // would send someone to an admission desk with a card nobody can use.
    expect(POLICY_TYPES.GPA.hasECard).toBe(false);
    expect(POLICY_TYPES.GTLI.hasECard).toBe(false);
    expect(POLICY_TYPES.OPD.hasECard).toBe(false);
  });

  it('asks for a nominee only where one is claimed against', async () => {
    const { POLICY_TYPES } = await load();
    expect(POLICY_TYPES.GPA.hasNominee).toBe(true);
    expect(POLICY_TYPES.GTLI.hasNominee).toBe(true);
    expect(POLICY_TYPES.GHI.hasNominee).toBe(false);
  });

  it('reports an unrecognised type instead of guessing its claim route', async () => {
    const { getPolicyWallet } = await load({
      policies: [policyRow({ policyType: 'SOMETHING_NEW' })],
      members: [memberRow()],
    });
    const [policy] = (await getPolicyWallet(19)).policies;
    expect(policy.policyTypeRecognised).toBe(false);
    expect(policy.policyType).toBeNull();
    expect(policy.group).toBe('other');
    expect(policy.hasECard).toBe(false);
  });

  it('keeps an empty group with a line saying what is missing', async () => {
    const { getPolicyWallet } = await load({ policies: [policyRow()], members: [memberRow()] });
    const { groups } = await getPolicyWallet(19);
    const accident = groups.find((g) => g.key === 'accident_life');
    expect(accident.policies).toEqual([]);
    expect(accident.emptyLine).toMatch(/hasn't added accident cover/);
  });
});

describe('the summary tiles', () => {
  it('adds base and top-up into one hospital figure', async () => {
    const { getPolicyWallet } = await load({
      policies: [policyRow(), policyRow({ id: 2, policyType: 'GHI_TOPUP', sumInsured: '1000000' })],
      members: [memberRow(), memberRow({ memberId: 11, policyId: 2 })],
    });
    const { summary } = await getPolicyWallet(19);
    expect(summary.hospital.total).toBe(1500000);
  });

  it('says nothing rather than zero where there is no such cover', async () => {
    // A tile reading "₹0" claims the employer gave cover worth nothing; the
    // design asks for "Not included".
    const { getPolicyWallet } = await load({ policies: [policyRow()], members: [memberRow()] });
    const { summary } = await getPolicyWallet(19);
    expect(summary.accidentLife.total).toBeNull();
    expect(summary.parents.total).toBeNull();
    expect(summary.opBalance.total).toBeNull();
  });

  it('shows outpatient as what is left, not as the limit', async () => {
    const { getPolicyWallet } = await load({
      policies: [policyRow({ id: 3, policyType: 'OPD', sumInsured: '25000', myUsed: '1650', myRemaining: '23350' })],
      members: [memberRow({ policyId: 3 })],
    });
    expect((await getPolicyWallet(19)).summary.opBalance.total).toBe(23350);
  });
});

describe('the top-up ladder', () => {
  const base = policyRow({ id: 1, sumInsured: '500000' });
  const topUp = (over = {}) => policyRow({
    id: 2, policyType: 'GHI_TOPUP', sumInsured: '1000000',
    deductible: '500000', baseSumInsured: '500000', linkedBasePolicyId: 1, ...over,
  });

  it('states when the top-up starts paying, from the policy', async () => {
    const { getPolicyWallet } = await load({
      policies: [base, topUp()], members: [memberRow(), memberRow({ memberId: 11, policyId: 2 })],
    });
    const { ladders } = await getPolicyWallet(19);
    expect(ladders).toHaveLength(1);
    expect(ladders[0]).toMatchObject({
      unit: 'self_and_family', basePolicyId: '1', topUpPolicyId: '2',
      startsPayingAfter: 500000, baseSumInsured: 500000, topUpSumInsured: 1000000,
    });
  });

  it('draws no ladder when the employer did not give a deductible', async () => {
    // The design is explicit: without it the top-up stands as its own card. A
    // ladder from an assumed deductible tells a member their top-up starts at
    // a figure nobody wrote down.
    const { getPolicyWallet } = await load({
      policies: [base, topUp({ deductible: null })],
      members: [memberRow(), memberRow({ memberId: 11, policyId: 2 })],
    });
    const wallet = await getPolicyWallet(19);
    expect(wallet.ladders).toEqual([]);
    expect(wallet.policies.find((p) => p.id === '2').missing).toContain('deductible');
  });

  it('keeps the parents\' ladder separate from the employee\'s', async () => {
    const { getPolicyWallet } = await load({
      policies: [
        policyRow({ id: 5, policyType: 'PARENTS_GHI', sumInsured: '300000', copayPercent: '20' }),
        policyRow({ id: 6, policyType: 'PARENTS_TOPUP', sumInsured: '500000', deductible: '300000', linkedBasePolicyId: 5, copayPercent: '20' }),
      ],
      members: [memberRow({ policyId: 5, relationship: 'father' }), memberRow({ memberId: 12, policyId: 6, relationship: 'mother' })],
    });
    const { ladders } = await getPolicyWallet(19);
    expect(ladders).toHaveLength(1);
    expect(ladders[0].unit).toBe('parents');
    expect(ladders[0].copayPercent).toBe(20);
  });
});

describe('nothing is assumed', () => {
  it('names what the employer has not supplied', async () => {
    const { getPolicyWallet } = await load({
      policies: [policyRow({ policyType: 'PARENTS_GHI', copayPercent: null, policyDocumentUrl: null })],
      members: [memberRow()],
    });
    const [policy] = (await getPolicyWallet(19)).policies;
    expect(policy.copayPercent).toBeNull();
    expect(policy.missing).toContain('copayPercent');
    expect(policy.missing).toContain('policyDocumentUrl');
    expect(policy.missing).toContain('tpa');
  });

  it('reports an absent sum insured as unknown, not as zero cover', async () => {
    const { getPolicyWallet } = await load({
      policies: [policyRow({ sumInsured: null, myRemaining: null, myUsed: null })],
      members: [memberRow()],
    });
    const [policy] = (await getPolicyWallet(19)).policies;
    expect(policy.sumInsured).toBeNull();
    expect(policy.remaining).toBeNull();
    expect(policy.missing).toContain('sumInsured');
  });

  it('does not report the schema\'s forced zero as cover', async () => {
    // insurance_policies."sumInsured" is NOT NULL DEFAULT 0, so an accident or
    // life policy has to store 0 there. Reporting it would read as "₹0 of
    // hospital cover" on a policy that has no sum insured at all.
    const { getPolicyWallet } = await load({
      policies: [policyRow({ id: 7, policyType: 'GPA', sumInsured: '0', coverAmount: '2000000', myUsed: '0', myRemaining: '0' })],
      members: [memberRow({ policyId: 7 })],
    });
    const [policy] = (await getPolicyWallet(19)).policies;
    expect(policy.coverAmount).toBe(2000000);
    expect(policy.sumInsured).toBeNull();
    expect(policy.utilized).toBeNull();
    expect(policy.remaining).toBeNull();
    expect(policy.missing).not.toContain('coverAmount');
  });

  it('still reports a missing key number for the field the type is measured in', async () => {
    const { getPolicyWallet } = await load({
      policies: [policyRow({ id: 7, policyType: 'GPA', sumInsured: '0', coverAmount: null })],
      members: [memberRow({ policyId: 7 })],
    });
    const [policy] = (await getPolicyWallet(19)).policies;
    // The 0 the default left behind must not pass for a supplied cover amount.
    expect(policy.missing).toContain('coverAmount');
  });

  it('treats an absent enrolment window as closed', async () => {
    const { getPolicyWallet } = await load({ policies: [policyRow({ voluntary: true })], members: [memberRow()] });
    const [policy] = (await getPolicyWallet(19)).policies;
    expect(policy.enrolment).toEqual({ from: null, to: null, open: false });
  });

  it('opens enrolment only inside a window the employer set', async () => {
    const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
    const { getPolicyWallet } = await load({
      policies: [
        policyRow({ id: 1, voluntary: true, enrolmentFrom: day(-5), enrolmentTo: day(5) }),
        policyRow({ id: 2, voluntary: true, enrolmentFrom: day(-30), enrolmentTo: day(-10) }),
      ],
      members: [memberRow(), memberRow({ memberId: 11, policyId: 2 })],
    });
    const { policies } = await getPolicyWallet(19);
    expect(policies.find((p) => p.id === '1').enrolment.open).toBe(true);
    expect(policies.find((p) => p.id === '2').enrolment.open).toBe(false);
  });

  it('refuses to work at all on an unmigrated database', async () => {
    const { getPolicyWallet } = await load({
      policies: () => {
        const error = new Error('column "deductible" does not exist');
        error.original = { code: '42703' };
        throw error;
      },
    });
    await expect(getPolicyWallet(19)).rejects.toMatchObject({ statusCode: 503, code: 'SCHEMA_NOT_MIGRATED' });
  });
});

describe('the coverage matrix', () => {
  it('puts one row per person and one column per policy', async () => {
    const { getCoverageMatrix } = await load({
      policies: [policyRow(), policyRow({ id: 5, policyType: 'PARENTS_GHI', sumInsured: '300000' })],
      members: (r) => ([
        memberRow({ policyId: 1, relationship: 'self', name: 'Asha Menon' }),
        memberRow({ memberId: 11, policyId: 1, userId: null, relationship: 'spouse', name: 'Ravi Menon' }),
        memberRow({ memberId: 12, policyId: 5, userId: null, relationship: 'mother', name: 'Leela Menon' }),
      ]),
    });
    const matrix = await getCoverageMatrix(19);
    expect(matrix.columns.map((c) => c.policyId)).toEqual(['1', '5']);
    expect(matrix.rows).toHaveLength(3);
    expect(matrix.rows[0].isSelf).toBe(true);
  });

  it('says "shared" for a floater instead of inventing a per-person limit', async () => {
    const { getCoverageMatrix } = await load({
      policies: [policyRow({ floater: true })],
      members: [memberRow()],
    });
    const cell = (await getCoverageMatrix(19)).rows[0].cover['1'];
    expect(cell.shared).toBe(true);
    expect(cell.sumInsured).toBeNull();
  });

  it('gives a per-person figure when the policy is not a floater', async () => {
    const { getCoverageMatrix } = await load({
      policies: [policyRow({ floater: false })],
      members: [memberRow({ sumInsured: '200000' })],
    });
    expect((await getCoverageMatrix(19)).rows[0].cover['1'].sumInsured).toBe(200000);
  });
});

describe('the relationship vocabulary', () => {
  it('maps the column\'s own values onto the groups the app asks in', async () => {
    const { RELATION_GROUPS } = await load();
    // policy_members.relationship accepts self, spouse, son, daughter,
    // father, mother, other. 'child' and 'parent' are groupings, not values —
    // writing them rolled the first seed back.
    expect(RELATION_GROUPS).toEqual({
      self: 'self', spouse: 'spouse',
      son: 'child', daughter: 'child',
      father: 'parent', mother: 'parent',
      other: 'other',
    });
  });

  it('tells the app a son is a child, so it can pick the right policy', async () => {
    // The hospital-emergency journey picks the person, then the policy: a
    // parent's bill goes to Parents GHI, everyone else's to GHI. It cannot do
    // that from a literal "son".
    const { getPolicyWallet } = await load({
      policies: [policyRow()],
      members: [
        memberRow({ relationship: 'self' }),
        memberRow({ memberId: 11, userId: null, relationship: 'daughter', name: 'Meera' }),
        memberRow({ memberId: 12, userId: null, relationship: 'mother', name: 'Leela' }),
      ],
    });
    const [policy] = (await getPolicyWallet(19)).policies;
    expect(policy.members.map((m) => [m.relation, m.relationGroup])).toEqual([
      ['self', 'self'], ['daughter', 'child'], ['mother', 'parent'],
    ]);
  });

  it('orders the family by the values the column really holds', async () => {
    const { getPolicyWallet, calls } = await load({ policies: [policyRow()], members: [memberRow()] });
    await getPolicyWallet(19);
    const sql = calls.find((c) => c.shape === 'members').sql;
    for (const value of ['self', 'spouse', 'son', 'daughter', 'father', 'mother']) {
      expect(sql).toContain(`WHEN '${value}'`);
    }
    expect(sql).not.toContain("WHEN 'child'");
  });

  it('groups anything unexpected rather than dropping it', async () => {
    const { getPolicyWallet } = await load({
      policies: [policyRow()],
      members: [memberRow({ relationship: 'brother-in-law' })],
    });
    const [policy] = (await getPolicyWallet(19)).policies;
    expect(policy.members[0].relationGroup).toBe('other');
  });
});

describe('the per-member e-card', () => {
  const ghi = { policies: [policyRow()], members: [memberRow(), memberRow({ memberId: 11, userId: null, relationship: 'spouse', name: 'Ravi' })] };

  it('issues the card for the person asked for', async () => {
    const { getMemberECard } = await load(ghi);
    const result = await getMemberECard(19, '1', '11');
    expect(result.success).toBe(true);
    expect(result.ecard).toMatchObject({ memberName: 'Ravi', relation: 'spouse', policyNumber: 'GRP-1' });
  });

  it('carries the number the insurer issued, and mints none', async () => {
    const { getMemberECard } = await load({
      policies: [policyRow()],
      members: [memberRow({ memberCardNumber: null })],
    });
    const result = await getMemberECard(19, '1', '10');
    // A number invented here would not match the insurer's records at an
    // admission desk.
    expect(result.ecard.cardNumber).toBeNull();
    const service = read('services/corporate-policy-wallet.service.js');
    expect(service).not.toMatch(/cardNumber:\s*`/);
  });

  it('refuses a member id that is not in the caller\'s family', async () => {
    const { getMemberECard } = await load(ghi);
    await expect(getMemberECard(19, '1', '99999')).resolves.toMatchObject({ error: 'MEMBER_NOT_FOUND' });
  });

  it('refuses a policy the caller is not on', async () => {
    const { getMemberECard } = await load({ policies: [], members: [] });
    await expect(getMemberECard(19, '42', '10')).resolves.toMatchObject({ error: 'POLICY_NOT_FOUND' });
  });

  it('says an accident policy has no card, rather than handing over an unusable one', async () => {
    const { getMemberECard } = await load({
      policies: [policyRow({ id: 7, policyType: 'GPA', sumInsured: null, coverAmount: '2000000' })],
      members: [memberRow({ policyId: 7 })],
    });
    const result = await getMemberECard(19, '7', '10');
    expect(result.error).toBe('POLICY_HAS_NO_CARD');
    expect(result.actions).toContain('how_to_claim_documents');
  });

  it('notes the top-up on the base policy\'s card', async () => {
    const { getMemberECard } = await load({
      policies: [policyRow(), policyRow({ id: 2, policyType: 'GHI_TOPUP', sumInsured: '1000000', deductible: '500000', linkedBasePolicyId: 1 })],
      members: [memberRow(), memberRow({ memberId: 11, policyId: 2 })],
    });
    const result = await getMemberECard(19, '1', '10');
    expect(result.topUp).toMatchObject({ policyId: '2', startsPayingAfter: 500000 });
  });
});

describe('claims per policy', () => {
  it('uses the column names the live table actually has', async () => {
    // insurance_claims is snake_case. The Sequelize model declares camelCase
    // "policyId"/"patientId" that the table does not have, so those names
    // returned 42703 — and a tolerated 42703 reports "no claims" to a member
    // who has some.
    const { listPolicyClaims, calls } = await load({
      policies: [policyRow()], members: [memberRow()], claims: [],
    });
    await listPolicyClaims(19, '1');
    const sql = calls.find((c) => c.shape === 'claims').sql;
    expect(sql).toContain('policy_id = :policyId');
    expect(sql).toContain('patient_id = :userId');
    expect(sql).not.toContain('"policyId"');
    expect(sql).not.toContain('"patientId"');
  });

  it('says the column is unmigrated rather than passing it off as no claims', async () => {
    const { listPolicyClaims } = await load({
      policies: [policyRow()], members: [memberRow()],
      claims: () => {
        const error = new Error('column "policy_id" does not exist');
        error.original = { code: '42703' };
        throw error;
      },
    });
    const result = await listPolicyClaims(19, '1');
    expect(result.claims).toEqual([]);
    expect(result.unavailable).toBe('SCHEMA_NOT_MIGRATED');
  });

  it('answers nothing for a policy the caller is not on', async () => {
    const { listPolicyClaims } = await load({ policies: [], members: [] });
    await expect(listPolicyClaims(19, '1')).resolves.toBeNull();
  });
});

describe('the foreign keys the seed exposed', () => {
  const migration = read('migrations/20261111000400-policy-member-foreign-keys.migration.js');

  it('repoints both tables at the policies table, not the product catalogue', () => {
    // routes/insurance-policy.route.js — their only writer — inserts an
    // insurance_policies id into both, so neither insert could ever succeed.
    expect(migration).toContain("{ table: 'policy_members', constraint: 'policy_members_policyId_fkey'");
    expect(migration).toContain("{ table: 'policy_rules', constraint: 'policy_rules_policyId_fkey'");
    expect(migration).toContain('REFERENCES insurance_policies (id) ON DELETE ${onDelete}');
  });

  it('leaves user_insurances pointing at the catalogue, where it belongs', () => {
    // A patient holds a product, and insurance_claims.user_insurance_id
    // completes that chain.
    expect(migration).not.toContain('user_insurances_policyId_fkey');
    expect(migration).toMatch(/user_insurances also references the catalogue and is left alone/);
  });

  it('aborts rather than deleting a row the new key would reject', () => {
    expect(migration).toMatch(/if \(orphans > 0\)/);
    expect(migration).toMatch(/will not delete data/);
  });

  it('gives a claim a policy id, nullable, and keeps the claim if the policy goes', () => {
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS policy_id INTEGER');
    expect(migration).toContain('REFERENCES insurance_policies (id) ON DELETE SET NULL');
  });

  it('backfills only where the policy number identifies one policy', () => {
    // Attaching a claim to the wrong policy moves money against the wrong
    // sum insured.
    expect(migration).toMatch(/\(SELECT count\(\*\) FROM insurance_policies x[\s\S]{0,160}= 1/);
  });

  it('is registered so a new environment gets it', () => {
    expect(read('scripts/migrate-all.mjs')).toContain('20261111000400-policy-member-foreign-keys');
  });
});

describe('the endpoints', () => {
  const route = read('routes/employee-network.route.js');

  it('register the fixed paths before the one that takes a policy id', () => {
    // Otherwise /policies/types and /policies/coverage-matrix are read as ids.
    for (const fixed of ["'/policies/types'", "'/policies/coverage-matrix'"]) {
      expect(route.indexOf(fixed)).toBeLessThan(route.indexOf("'/policies/:policyId'"));
    }
  });

  it('scope every one to the caller', () => {
    const block = route.slice(route.indexOf("router.get('/policies/types'"), route.indexOf("router.get('/claims'"));
    const scoped = block.match(/req\.user\.id/g) || [];
    expect(scoped.length).toBeGreaterThanOrEqual(5);
    expect(block).not.toMatch(/userId:\s*req\.(query|body|params)/);
  });

  it('are authenticated', () => {
    for (const path of ["'/policies'", "'/policies/types'", "'/policies/coverage-matrix'", "'/policies/:policyId'"]) {
      expect(route).toMatch(new RegExp(`router\\.get\\(${path}, authUser`));
    }
  });

  it('answer 409 for a policy that is not claimed with a card', () => {
    const handler = route.slice(route.indexOf("'/policies/:policyId/members/:memberId/e-card'"));
    expect(handler).toContain("result?.error === 'POLICY_HAS_NO_CARD'");
    expect(handler).toContain('status(409)');
  });
});

describe('the benefits endpoint keeps working', () => {
  const route = read('routes/employee-network.route.js');
  const handler = route.slice(route.indexOf("router.get('/benefits'"), route.indexOf("router.get('/policies/types'"));

  it('adds the policies as their own key, not folded into plans[]', () => {
    // plans[] is the employer's benefit configuration; these are insurance
    // policies with different fields and claim routes, and a client reading
    // plans[] today must keep working.
    expect(handler).toContain('policies,');
    expect(handler).toContain('plans: [...healthCheckupPlans, ...plans]');
  });

  it('does not blank the whole screen when the wallet cannot be read', () => {
    expect(handler).toContain('policiesUnavailable');
    expect(handler).toMatch(/catch \(policyError\)/);
  });

  it('returns the same keys for a member with no corporate', () => {
    const empty = handler.slice(0, handler.indexOf('const [rows, healthPackageRows]'));
    for (const key of ['policies: []', 'policyGroups: []', 'policySummary: null', 'policyLadders: []']) {
      expect(empty).toContain(key);
    }
  });
});

describe('the migration', () => {
  const migration = read('migrations/20261111000300-typed-group-policies.migration.js');

  it('adds the column that keeps one family out of another\'s wallet', () => {
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS "primaryMemberUserId" INTEGER');
  });

  it('backfills that column before anything filters on it', () => {
    // A row left NULL would be invisible to its own owner.
    expect(migration.indexOf('SET "primaryMemberUserId" = "userId"'))
      .toBeLessThan(migration.indexOf('idx_policy_members_primary'));
  });

  it('lets a dependant exist without an account', () => {
    expect(migration).toContain('ALTER COLUMN "userId" DROP NOT NULL');
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS "memberName" VARCHAR(255)');
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS "dateOfBirth" DATE');
  });

  it('still requires every row to identify somebody', () => {
    expect(migration).toContain('policy_members_identifies_someone');
    expect(migration).toMatch(/"userId" IS NOT NULL OR NULLIF\(btrim\("memberName"\), ''\) IS NOT NULL/);
  });

  it('stops a policy being its own base', () => {
    expect(migration).toMatch(/"linkedBasePolicyId" IS NULL OR "linkedBasePolicyId" <> id/);
  });

  it('adds every field the design asked for', () => {
    for (const column of ['deductible', 'baseSumInsured', 'linkedBasePolicyId', 'floater',
      'copayPercent', 'roomRentLimit', 'maternityCovered', 'coverAmount', 'benefitSchedule',
      'opLimits', 'voluntary', 'premiumPerYear', 'enrolmentFrom', 'enrolmentTo',
      'policyDocumentUrl', 'claimFormUrl']) {
      expect(migration).toContain(`ADD COLUMN IF NOT EXISTS "${column}"`);
    }
    for (const column of ['nomineeName', 'nomineeRelation', 'nomineeUpdatedAt']) {
      expect(migration).toContain(`ADD COLUMN IF NOT EXISTS "${column}"`);
    }
  });

  it('is registered so a new environment gets it', () => {
    expect(read('scripts/migrate-all.mjs')).toContain('20261111000300-typed-group-policies');
  });
});

describe('the test policies', () => {
  const script = read('scripts/seed-test-group-policies.mjs');

  it('covers all seven types', () => {
    for (const type of ['GHI', 'GHI_TOPUP', 'PARENTS_GHI', 'PARENTS_TOPUP', 'GPA', 'GTLI', 'OPD']) {
      expect(script).toContain(`policyType: '${type}'`);
    }
  });

  it('marks every row as test data, so none can pass for real cover', () => {
    expect(script).toContain('testData: true');
    expect(script).toContain("seededBy: MARKER");
    expect(script).toMatch(/\[TEST\]/);
    expect(script).toContain("'TEST-MSH-GHI-001'");
  });

  it('invents no insurer that exists', () => {
    // Three network hospitals seeded as Apollo, Max and Fortis with invented
    // cashless terms had to be deleted from production on 2026-11-11. The
    // script's own comments explain that, so only the code is checked.
    expect(script).toContain("INSURER_NAME = '[TEST] Demo Insurer'");
    const code = script
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    for (const real of ['Apollo', 'Fortis', 'Max Healthcare', 'Star Health', 'Niva', 'HDFC']) {
      expect(code).not.toContain(real);
    }
  });

  it('uses a purpose-made account, not a colleague\'s', () => {
    expect(script).toContain("TEST_EMAIL = 'test.policy.employee@example.invalid'");
  });

  it('writes no usable credential into the repository', () => {
    expect(script).toContain('crypto.randomBytes(24)');
    expect(script).toMatch(/arg\('password'\)/);
    expect(script).not.toMatch(/password:\s*'[A-Za-z0-9@#$%^&*!]{6,}'/);
  });

  it('creates the association the employee endpoints actually read', () => {
    // getUserCorporate() reads user_associations, not corporate_employees;
    // without it every /api/employee endpoint says "not a corporate employee".
    expect(script).toContain('INSERT INTO user_associations');
    expect(script).toContain("'employee'");
  });

  it('reports by default and writes only when told', () => {
    expect(script).toContain("const APPLY = process.argv.includes('--apply')");
    expect(script).toMatch(/if \(!APPLY\) \{ console\.log\('\\nNothing written/);
  });

  it('can take it all out again', () => {
    expect(script).toContain("const REMOVE = process.argv.includes('--remove')");
    expect(script).toContain("metadata->>'seededBy' = :marker");
  });

  it('supplies no uid, leaving it to the database trigger', () => {
    // CLAUDE.md rule 1: never supply unique_id on INSERT.
    expect(script).not.toMatch(/INSERT INTO (users|corporate_employees|insurance_companies)[^;]*unique_id/);
  });

  it('uses only relationships the column accepts', () => {
    const allowed = ['self', 'spouse', 'son', 'daughter', 'father', 'mother', 'other'];
    const family = script.slice(script.indexOf('const FAMILY = {'), script.indexOf('const findSeeded'));
    for (const match of family.matchAll(/relation: '([a-z-]+)'/g)) {
      expect(allowed).toContain(match[1]);
    }
  });

  it('writes a floater with no per-person sum insured', () => {
    expect(script).toMatch(/individualSumInsured: spec\.floater \? null/);
  });

  it('leaves the fields the employer has not given as NULL', () => {
    expect(script).toMatch(/tpaId, policyDocumentUrl and claimFormUrl stay NULL/);
  });

  it('omits a null column instead of passing NULL over a default', () => {
    // sumInsured and premium are NOT NULL DEFAULT 0, status defaults to
    // 'draft', the JSONB bags to '[]'. An explicit NULL overrides the default
    // and fails the constraint.
    expect(script).toMatch(/filter\(\(\[, value\]\) => value !== null\)/);
    expect(script).toContain('present.map(([name]) => `"${name}"`)');
  });

  it('runs in one transaction, so a failure leaves nothing behind', () => {
    expect(script).toContain('await sequelize.transaction()');
    expect(script).toContain('transaction.rollback()');
  });
});
