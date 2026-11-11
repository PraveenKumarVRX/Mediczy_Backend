#!/usr/bin/env node
/**
 * Test group policies for one corporate, so the mobile app's policy wallet has
 * all seven policy types to render.
 *
 *   node scripts/ssm-env-loader.mjs scripts/seed-test-group-policies.mjs --corporate=4            # report
 *   node scripts/ssm-env-loader.mjs scripts/seed-test-group-policies.mjs --corporate=4 --apply
 *   ... --password='<for the test employee>'   # optional; otherwise a random hash is set
 *   ... --remove --apply                       # delete everything this script created
 *
 * Reports by default. Nothing is written without --apply.
 *
 * Every row this creates is marked so it can never be mistaken for real
 * cover, and so it can be found and removed again:
 *
 *   - names and policy numbers carry a literal "[TEST]" / "TEST-" marker that
 *     the app will display verbatim on the card;
 *   - metadata.testData is true and metadata.seededBy names this script;
 *   - the insurer is "[TEST] Demo Insurer", not the name of a company that
 *     exists. On 2026-11-11 three network hospitals seeded as "Apollo", "Max"
 *     and "Fortis" with invented cashless terms had to be deleted from
 *     production; a member who believed one of those would have been turned
 *     away at an admission desk.
 *
 * The family is a purpose-made account, not a colleague's. Attaching invented
 * insurance — a sum insured, a co-pay, a nominee — to a real person's login is
 * how a test fixture becomes something somebody plans their mother's surgery
 * around.
 */
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { QueryTypes } from 'sequelize';
import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';

const MARKER = 'seed-test-group-policies';
const TEST_EMAIL = 'test.policy.employee@example.invalid';
const TEST_EMPLOYEE_CODE = 'TEST-POL-01';
const INSURER_NAME = '[TEST] Demo Insurer';

const APPLY = process.argv.includes('--apply');
const REMOVE = process.argv.includes('--remove');
const arg = (name) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};

const q = (sql, replacements, transaction) =>
  sequelize.query(sql, { replacements, type: QueryTypes.SELECT, transaction });
const exec = async (sql, replacements, transaction) => {
  const [, meta] = await sequelize.query(sql, { replacements, transaction });
  return meta?.rowCount ?? 0;
};

const today = () => new Date().toISOString().slice(0, 10);
const plusDays = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const inr = (v) => (v === null ? '—' : `₹${Number(v).toLocaleString('en-IN')}`);
const meta = (extra = {}) => JSON.stringify({ testData: true, seededBy: MARKER, ...extra });

/**
 * The seven types, with the structure Indian group policies usually take. The
 * numbers are illustrative and the names say so; nothing here claims to be a
 * real product.
 */
const policySpecs = (corporateName) => [
  {
    key: 'GHI',
    policyType: 'GHI',
    policyName: `[TEST] Group Health Insurance — ${corporateName}`,
    policyNumber: 'TEST-MSH-GHI-001',
    sumInsured: 500000, floater: true, copayPercent: 0, roomRentLimit: 5000,
    maternityCovered: true, voluntary: false,
    waitingPeriods: { preExisting: '24 months', specificAilments: '12 months', maternity: '9 months' },
    exclusions: ['Cosmetic treatment', 'Non-prescribed consumables'],
    family: ['self', 'spouse', 'child'],
    used: 42000,
  },
  {
    key: 'GHI_TOPUP',
    policyType: 'GHI_TOPUP',
    policyName: '[TEST] Health top-up',
    policyNumber: 'TEST-MSH-TOPUP-001',
    sumInsured: 1000000, floater: true, voluntary: true, premiumPerYear: 4800,
    deductibleFrom: 'GHI',
    family: ['self', 'spouse', 'child'],
    used: 0,
  },
  {
    key: 'PARENTS_GHI',
    policyType: 'PARENTS_GHI',
    policyName: '[TEST] Parents health insurance',
    policyNumber: 'TEST-MSH-PAR-001',
    sumInsured: 300000, floater: true, copayPercent: 20, voluntary: true, premiumPerYear: 18500,
    waitingPeriods: { preExisting: '24 months' },
    family: ['father', 'mother'],
    used: 15000,
  },
  {
    key: 'PARENTS_TOPUP',
    policyType: 'PARENTS_TOPUP',
    policyName: '[TEST] Parents top-up',
    policyNumber: 'TEST-MSH-PARTOP-001',
    sumInsured: 500000, floater: true, copayPercent: 20, voluntary: true, premiumPerYear: 7200,
    deductibleFrom: 'PARENTS_GHI',
    // An open enrolment window, so the app's "Add during enrolment" card has
    // something real to read. The service treats an absent window as closed.
    enrolmentFrom: plusDays(-10), enrolmentTo: plusDays(20),
    family: ['father', 'mother'],
    used: 0,
  },
  {
    key: 'GPA',
    policyType: 'GPA',
    policyName: '[TEST] Group Personal Accident',
    policyNumber: 'TEST-MSH-GPA-001',
    coverAmount: 2000000, voluntary: false,
    benefitSchedule: [
      { event: 'Accidental death', percent: 100 },
      { event: 'Permanent total disability', percent: 100 },
      { event: 'Permanent partial disability', percent: 50 },
      { event: 'Weekly benefit while temporarily disabled', amount: 5000 },
    ],
    family: ['self'],
    nominee: { name: '[TEST] Spouse Of Test', relation: 'spouse' },
  },
  {
    key: 'GTLI',
    policyType: 'GTLI',
    policyName: '[TEST] Group Term Life Insurance',
    policyNumber: 'TEST-MSH-GTLI-001',
    coverAmount: 3000000, voluntary: false,
    family: ['self'],
    nominee: { name: '[TEST] Spouse Of Test', relation: 'spouse' },
  },
  {
    key: 'OPD',
    policyType: 'OPD',
    policyName: '[TEST] Outpatient cover',
    policyNumber: 'TEST-MSH-OPD-001',
    sumInsured: 25000, floater: true, voluntary: false,
    opLimits: [
      { category: 'Consultation', limit: 8000, used: 1200 },
      { category: 'Diagnostics', limit: 10000, used: 0 },
      { category: 'Pharmacy', limit: 5000, used: 450 },
      { category: 'Dental', limit: 2000, used: 0 },
    ],
    family: ['self', 'spouse', 'child'],
    used: 1650,
  },
];

/** The family. Only the employee gets an account; dependants are name rows. */
const FAMILY = {
  self: { relation: 'self', name: null, dob: '1988-04-12' },
  spouse: { relation: 'spouse', name: '[TEST] Spouse Of Test', dob: '1990-09-03' },
  child: { relation: 'child', name: '[TEST] Child Of Test', dob: '2017-01-22' },
  father: { relation: 'parent', name: '[TEST] Father Of Test', dob: '1958-06-30' },
  mother: { relation: 'parent', name: '[TEST] Mother Of Test', dob: '1961-11-15' },
};

const findSeeded = async () => {
  const policies = await q(
    `SELECT id, "policyNumber", "policyName", "policyType" FROM insurance_policies
      WHERE metadata->>'seededBy' = :marker ORDER BY id`,
    { marker: MARKER }
  );
  const members = policies.length
    ? await q(
        `SELECT id, "policyId", relationship, "memberName" FROM policy_members
          WHERE "policyId" = ANY(ARRAY[:ids]::int[]) ORDER BY id`,
        { ids: policies.map((p) => p.id) }
      )
    : [];
  const [user] = await q('SELECT id, "firstName", "lastName" FROM users WHERE email = :email LIMIT 1', { email: TEST_EMAIL });
  const [insurer] = await q('SELECT id FROM insurance_companies WHERE "companyName" = :name LIMIT 1', { name: INSURER_NAME });
  return { policies, members, user: user || null, insurer: insurer || null };
};

const remove = async () => {
  const found = await findSeeded();
  console.log(`to remove: ${found.policies.length} policies, ${found.members.length} member rows`
    + `${found.user ? `, test account #${found.user.id}` : ''}${found.insurer ? ', the test insurer' : ''}`);
  for (const p of found.policies) console.log(`  ${p.policyNumber}  ${p.policyName}`);
  if (!APPLY) { console.log('\nNothing deleted. Add --apply.'); return 0; }

  const transaction = await sequelize.transaction();
  try {
    if (found.policies.length) {
      const ids = found.policies.map((p) => p.id);
      await exec('DELETE FROM policy_members WHERE "policyId" = ANY(ARRAY[:ids]::int[])', { ids }, transaction);
      await exec('DELETE FROM insurance_policies WHERE id = ANY(ARRAY[:ids]::int[])', { ids }, transaction);
    }
    if (found.user) {
      await exec('DELETE FROM user_associations WHERE "userId" = :id', { id: found.user.id }, transaction);
      await exec('DELETE FROM corporate_employees WHERE "userId" = :id', { id: found.user.id }, transaction);
      await exec('DELETE FROM users WHERE id = :id', { id: found.user.id }, transaction);
    }
    if (found.insurer) {
      await exec('DELETE FROM insurance_companies WHERE id = :id', { id: found.insurer.id }, transaction);
    }
    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    console.error('\nRolled back, nothing deleted:', error.message);
    return 1;
  }
  console.log('\nRemoved.');
  return 0;
};

const seed = async (corporateId) => {
  const [corporate] = await q(
    'SELECT id, "companyName", unique_id FROM corporates WHERE id = :id LIMIT 1',
    { id: corporateId }
  );
  if (!corporate) { console.error(`No corporate #${corporateId}`); return 1; }

  const specs = policySpecs(corporate.companyName);
  console.log(`corporate: #${corporate.id} ${corporate.companyName} (${corporate.unique_id})`);
  console.log(`test employee: ${TEST_EMAIL} (code ${TEST_EMPLOYEE_CODE})`);
  console.log(`insurer: ${INSURER_NAME}\n`);
  console.log('policies:');
  for (const spec of specs) {
    const key = spec.coverAmount ? `cover ${inr(spec.coverAmount)}` : `SI ${inr(spec.sumInsured)}`;
    const extras = [
      spec.deductibleFrom ? `deductible = ${spec.deductibleFrom} sum insured` : null,
      spec.copayPercent ? `co-pay ${spec.copayPercent}%` : null,
      spec.voluntary ? 'voluntary' : null,
      spec.enrolmentFrom ? `enrolment ${spec.enrolmentFrom} → ${spec.enrolmentTo}` : null,
    ].filter(Boolean);
    console.log(`  ${spec.policyType.padEnd(14)} ${spec.policyNumber.padEnd(22)} ${key.padEnd(18)} `
      + `${spec.family.join('+')}${extras.length ? '  [' + extras.join(', ') + ']' : ''}`);
  }
  console.log('\nNot set, on purpose: tpaId, policyDocumentUrl and claimFormUrl stay NULL, so the app');
  console.log('exercises its "not provided by your employer" path instead of showing an invented link.');

  const existing = await findSeeded();
  if (existing.policies.length) {
    console.log(`\nAlready seeded: ${existing.policies.length} policies exist. Re-run with --remove --apply first to replace them.`);
    if (!APPLY) return 0;
    return 0;
  }
  if (!APPLY) { console.log('\nNothing written. Add --apply.'); return 0; }

  const transaction = await sequelize.transaction();
  try {
    // 1. the test insurer
    let [insurer] = await q('SELECT id FROM insurance_companies WHERE "companyName" = :name LIMIT 1', { name: INSURER_NAME }, transaction);
    if (!insurer) {
      // unique_id is issued by the entity-UID trigger: never supplied here.
      [insurer] = await q(
        `INSERT INTO insurance_companies
           ("companyName", "companyCode", email, password, phone, "isActive", "isVerified", metadata, "createdAt", "updatedAt")
         VALUES (:name, 'TEST-DEMO', 'test.insurer@example.invalid', :password, '+91-00000-00000', true, false, :metadata::jsonb, NOW(), NOW())
         RETURNING id`,
        { name: INSURER_NAME, password: await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 10), metadata: meta() },
        transaction
      );
    }

    // 2. the test employee account
    let [user] = await q('SELECT id FROM users WHERE email = :email LIMIT 1', { email: TEST_EMAIL }, transaction);
    const supplied = arg('password');
    if (!user) {
      [user] = await q(
        `INSERT INTO users ("firstName", "lastName", email, password, "phoneNumber", role, status,
                            "dateOfBirth", gender, metadata, "createdAt", "updatedAt")
         VALUES ('[TEST] Policy', 'Employee', :email, :password, :phone, 'user', 'active',
                 :dob, 'other', :metadata::jsonb, NOW(), NOW())
         RETURNING id`,
        {
          email: TEST_EMAIL,
          // Random unless one was passed on the command line, so no usable
          // credential is ever written into this file.
          password: await bcrypt.hash(supplied || crypto.randomBytes(24).toString('hex'), 10),
          phone: '+91-99999-00001',
          dob: FAMILY.self.dob,
          metadata: meta(),
        },
        transaction
      );
    } else if (supplied) {
      await exec('UPDATE users SET password = :password, "updatedAt" = NOW() WHERE id = :id',
        { password: await bcrypt.hash(supplied, 10), id: user.id }, transaction);
    }

    // 3. the roster row and the association the employee endpoints read
    const [employeeRow] = await q(
      `INSERT INTO corporate_employees (corporate_id, "userId", "employeeId", email, department, designation,
                                        "isActive", metadata, "createdAt", "updatedAt")
       VALUES (:corporateId, :userId, :code, :email, 'Test', 'Test Employee', true, :metadata::jsonb, NOW(), NOW())
       ON CONFLICT DO NOTHING
       RETURNING id`,
      { corporateId: corporate.id, userId: user.id, code: TEST_EMPLOYEE_CODE, email: TEST_EMAIL, metadata: meta() },
      transaction
    );
    // getUserCorporate() reads user_associations, not corporate_employees, so
    // without this row every /api/employee endpoint answers "not a corporate
    // employee" and the wallet comes back empty.
    await exec(
      `INSERT INTO user_associations ("userId", "entityType", "entityId", role, status, metadata,
                                      corporate_unique_id, "createdAt", "updatedAt")
       SELECT :userId, 'corporate', :corporateId, 'employee', 'active', :metadata::jsonb, :corpUid, NOW(), NOW()
        WHERE NOT EXISTS (
          SELECT 1 FROM user_associations
           WHERE "userId" = :userId AND "entityType" = 'corporate'
             AND "entityId" = :corporateId AND role = 'employee')`,
      { userId: user.id, corporateId: corporate.id, metadata: meta(), corpUid: corporate.unique_id },
      transaction
    );

    // 4. the policies, base before top-up so a top-up can point at its base
    const idByKey = new Map();
    for (const spec of specs) {
      const base = spec.deductibleFrom ? idByKey.get(spec.deductibleFrom) : null;
      const baseSpec = spec.deductibleFrom ? specs.find((s) => s.key === spec.deductibleFrom) : null;
      const [policy] = await q(
        `INSERT INTO insurance_policies
           ("policyNumber", "policyName", "insuranceCompanyId", "corporateId", "policyType",
            "sumInsured", "coverAmount", "baseSumInsured", deductible, "linkedBasePolicyId",
            floater, "copayPercent", "roomRentLimit", "maternityCovered",
            "benefitSchedule", "opLimits", "waitingPeriods", exclusions,
            "policyStartDate", "policyEndDate", status, voluntary, "premiumPerYear",
            "enrolmentFrom", "enrolmentTo", premium, metadata, "createdAt", "updatedAt")
         VALUES (:policyNumber, :policyName, :insurerId, :corporateId, :policyType,
            :sumInsured, :coverAmount, :baseSumInsured, :deductible, :linkedBasePolicyId,
            :floater, :copayPercent, :roomRentLimit, :maternityCovered,
            :benefitSchedule::jsonb, :opLimits::jsonb, :waitingPeriods::jsonb, :exclusions::jsonb,
            :startDate, :endDate, 'active', :voluntary, :premiumPerYear,
            :enrolmentFrom, :enrolmentTo, 0, :metadata::jsonb, NOW(), NOW())
         RETURNING id`,
        {
          policyNumber: spec.policyNumber,
          policyName: spec.policyName,
          insurerId: insurer.id,
          corporateId: corporate.id,
          policyType: spec.policyType,
          sumInsured: spec.sumInsured ?? null,
          coverAmount: spec.coverAmount ?? null,
          baseSumInsured: baseSpec?.sumInsured ?? null,
          deductible: baseSpec?.sumInsured ?? null,
          linkedBasePolicyId: base ?? null,
          floater: spec.floater ?? null,
          copayPercent: spec.copayPercent ?? null,
          roomRentLimit: spec.roomRentLimit ?? null,
          maternityCovered: spec.maternityCovered ?? null,
          benefitSchedule: JSON.stringify(spec.benefitSchedule || []),
          opLimits: JSON.stringify(spec.opLimits || []),
          waitingPeriods: JSON.stringify(spec.waitingPeriods || {}),
          exclusions: JSON.stringify(spec.exclusions || []),
          startDate: `${new Date().getFullYear()}-04-01`,
          endDate: `${new Date().getFullYear() + 1}-03-31`,
          voluntary: Boolean(spec.voluntary),
          premiumPerYear: spec.premiumPerYear ?? null,
          enrolmentFrom: spec.enrolmentFrom ?? null,
          enrolmentTo: spec.enrolmentTo ?? null,
          metadata: meta({ corporate: corporate.companyName }),
        },
        transaction
      );
      idByKey.set(spec.key, policy.id);

      // 5. the family on that policy. primaryMemberUserId is the employee for
      // every row including the dependants': it is what keeps one family's
      // members from appearing in another employee's wallet.
      for (const who of spec.family) {
        const person = FAMILY[who];
        const isSelf = who === 'self';
        const shareOfUse = isSelf ? (spec.used ?? 0) : 0;
        await exec(
          `INSERT INTO policy_members
             ("policyId", "userId", "primaryMemberUserId", relationship, "memberName", "dateOfBirth",
              "isActive", "coverageStartDate", "coverageEndDate", "individualSumInsured",
              "sumInsuredUsed", "sumInsuredRemaining", "nomineeName", "nomineeRelation",
              "nomineeUpdatedAt", "memberCardNumber", metadata, "createdAt", "updatedAt")
           VALUES (:policyId, :userId, :primary, :relation, :name, :dob,
              true, :startDate, :endDate, :individualSumInsured,
              :used, :remaining, :nomineeName, :nomineeRelation,
              :nomineeUpdatedAt, :cardNumber, :metadata::jsonb, NOW(), NOW())`,
          {
            policyId: policy.id,
            userId: isSelf ? user.id : null,
            primary: user.id,
            relation: person.relation,
            name: isSelf ? null : person.name,
            dob: person.dob,
            startDate: `${new Date().getFullYear()}-04-01`,
            endDate: `${new Date().getFullYear() + 1}-03-31`,
            // A floater is one shared sum insured, so no per-person figure is
            // written: the wallet reports "Shared" rather than a number that
            // would read as a private limit.
            individualSumInsured: spec.floater ? null : (spec.sumInsured ?? spec.coverAmount ?? null),
            used: shareOfUse,
            remaining: spec.sumInsured !== undefined && spec.sumInsured !== null
              ? Math.max(spec.sumInsured - shareOfUse, 0) : null,
            nomineeName: isSelf ? (spec.nominee?.name ?? null) : null,
            nomineeRelation: isSelf ? (spec.nominee?.relation ?? null) : null,
            nomineeUpdatedAt: isSelf && spec.nominee ? new Date() : null,
            cardNumber: spec.policyType.includes('GHI') || spec.policyType.includes('PARENTS')
              ? `TEST-CARD-${spec.policyType}-${who.toUpperCase()}`
              : null,
            metadata: meta({ person: who }),
          },
          transaction
        );
      }
    }

    await transaction.commit();
    console.log(`\nSeeded ${specs.length} policies for corporate #${corporate.id}, employee account #${user.id}.`);
    if (!supplied) {
      console.log('The test account has a random password. Set one with --password=... or the usual reset flow before signing in.');
    }
    return 0;
  } catch (error) {
    await transaction.rollback();
    console.error('\nRolled back, nothing written:', error.message);
    if (error.original?.message) console.error('  ', error.original.message);
    return 1;
  }
};

const main = async () => {
  if (REMOVE) return remove();
  const corporateId = Number(arg('corporate'));
  if (!Number.isSafeInteger(corporateId) || corporateId < 1) {
    console.error('Usage: seed-test-group-policies.mjs --corporate=<id> [--apply] [--password=...] | --remove --apply');
    return 1;
  }
  return seed(corporateId);
};

main()
  .then(async (code) => { await sequelize.close().catch(() => {}); process.exit(code); })
  .catch(async (error) => { console.error(error); await sequelize.close().catch(() => {}); process.exit(1); });
