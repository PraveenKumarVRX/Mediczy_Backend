/**
 * QA-02: the corporate family-member save answered HTTP 500.
 *
 * family_members has FORCED row-level security (family_members_isolation:
 * "userId" = current_app_user_id()). The route wrote and read without setting
 * app.current_user_id, so every INSERT was refused ("new row violates
 * row-level security policy") and every count read 0. These tests pin that each
 * family_members statement runs inside a transaction carrying the member's RLS
 * context, that plan limits are still enforced, that corporate roster members
 * are corporate-scoped, and that bad input is a 4xx, never a 500.
 */
import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

let currentUser;
let userRecord;
let rosterRows;
let assignedPlan;
let corporateSubRows;
let enumRows;
let members;

const tx = { commit: jest.fn(async () => {}), rollback: jest.fn(async () => {}) };
const query = jest.fn(async (sql) => {
  const text = String(sql);
  if (text.includes('corporate_employees')) return rosterRows;
  if (text.includes('subscription_plans')) return corporateSubRows;
  if (text.includes('pg_enum')) return enumRows;
  return [];
});
const transaction = jest.fn(async () => tx);
const setRlsContext = jest.fn(async () => {});

const FamilyMember = {
  findAll: jest.fn(async () => []),
  findOne: jest.fn(async () => null),
  count: jest.fn(async () => 0),
  create: jest.fn(async (values) => ({ id: 11, ...values })),
};

jest.unstable_mockModule('../middleware/auth.middleware.js', () => ({
  authUser: (req, res, next) => { req.user = currentUser; next(); },
}));
jest.unstable_mockModule('../db/postgres-sequelize.js', () => ({
  postgresSequelize: { query, transaction },
  default: { query, transaction },
}));
jest.unstable_mockModule('../middleware/rls-context.middleware.js', () => ({ setRlsContext }));
jest.unstable_mockModule('../models/postgres/family-member.model.postgres.js', () => ({ default: FamilyMember }));
jest.unstable_mockModule('../models/user.model.intelligent.js', () => ({
  User: { findByPk: jest.fn(async () => userRecord) },
}));
jest.unstable_mockModule('../models/postgres/user-subscription.model.postgres.js', () => ({
  default: { findOne: jest.fn(async () => null) },
}));
jest.unstable_mockModule('../models/postgres/membership-plan.model.postgres.js', () => ({
  default: { findByPk: jest.fn(async () => null) },
}));
jest.unstable_mockModule('../models/postgres/membershipPlan.model.postgres.js', () => ({
  // findAll: the member's own 2026-11 lineup plans/add-ons (none here, so limits are unchanged).
  UserPlan: { findOne: jest.fn(async () => assignedPlan), findAll: jest.fn(async () => []) },
  MembershipPlan: {},
}));

const { default: router } = await import('../routes/family-member.route.js');
const { resetInLawRelationshipCache } = await import('../services/family-member-validation.service.js');
const app = express();
app.use(express.json());
app.use('/api/family-members', router);

// Exactly what My SmartHealth 1.5.2 sends (app/Utils/familyMember.js toServerMember).
const appPayload = { firstName: 'Riya', lastName: 'Sharma', relationship: 'son', dateOfBirth: '2015-04-02', bloodType: null };
const add = (patch = {}) => request(app).post('/api/family-members').send({ ...appPayload, ...patch });
const limits = async () => (await request(app).get('/api/family-members/limits')).body.limits;
const corporatePlan = (familyCoverage, extra = {}) => ({
  id: 37, name: 'My SmartHealth Corporate Basic Plus', slug: 'corp-4-952280110', type: 'CORPORATE',
  features: ['OPD'], metadata: familyCoverage ? { familyCoverage } : {}, ...extra,
});
const has = (...relationships) => { members = relationships.map((relationship, i) => ({ id: 100 + i, relationship })); };

beforeEach(() => {
  jest.clearAllMocks();
  resetInLawRelationshipCache();
  // Corporate QA login: on corporate 4's roster, but users.corporate_id is null
  // and organization_type is 'individual'. Its benefit plan is a CORPORATE
  // subscription plan carrying the coverage tier.
  currentUser = { id: 7646, organization_id: null };
  userRecord = { id: 7646, membershipType: 'individual', organization_type: 'individual', corporate_id: null, metadata: {} };
  rosterRows = [{ '?column?': 1 }];
  assignedPlan = null;
  corporateSubRows = [corporatePlan('employee_spouse_children')];
  enumRows = [];
  members = [];
  FamilyMember.findAll.mockImplementation(async () => members);
  FamilyMember.findOne.mockResolvedValue(null);
  FamilyMember.create.mockImplementation(async (values) => ({ id: 11, ...values }));
});

describe('POST /api/family-members (corporate member)', () => {
  test('saves under the member RLS context inside one transaction', async () => {
    const res = await add();

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ userId: 7646, relationship: 'son', gender: 'Male', dateOfBirth: '2015-04-02' });
    expect(setRlsContext).toHaveBeenCalledWith(tx, { orgId: 0, userId: 7646 });
    expect(FamilyMember.findAll).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 7646, isActive: true }, transaction: tx }));
    expect(FamilyMember.create).toHaveBeenCalledWith(expect.any(Object), { transaction: tx });
    expect(query.mock.calls.some(([sql, opts]) => sql.includes('pg_advisory_xact_lock') && opts.transaction === tx)).toBe(true);
    expect(tx.commit).toHaveBeenCalledTimes(1);
    expect(res.body.remaining).toBe(2);
  });

  test('a roster employee is covered by the corporate plan tier, looked up by corporate_uid', async () => {
    const l = await limits();
    expect(l).toMatchObject({
      membershipType: 'corporate', source: 'corporate-plan-tier', coverageMode: 'tier',
      familyCoverage: 'employee_spouse_children', familyCoverageLabel: 'Employee + spouse + 2 children',
      planName: 'My SmartHealth Corporate Basic Plus', maxMembers: 3, remaining: 3, canAddMore: true,
      allowedRelations: ['spouse', 'son', 'daughter'], addableRelations: ['spouse', 'son', 'daughter'],
    });
    expect(l.relationLimits).toMatchObject({
      spouse: { max: 1, current: 0, remaining: 1 }, children: { max: 2, current: 0, remaining: 2 }, parents: { max: 0, remaining: 0, relations: [] },
    });
    const rosterSql = query.mock.calls.find(([sql]) => sql.includes('corporate_employees'))[0];
    expect(rosterSql).toContain('corporate_uid IS NOT NULL');
    const planSql = query.mock.calls.find(([sql]) => sql.includes('subscription_plans'));
    expect(planSql[0]).toContain("sp.type = 'CORPORATE'");
    expect(planSql[1]).toMatchObject({ replacements: { userId: 7646 }, transaction: tx });
  });

  test('a corporate plan without a tier covers the employee only (the flat default of 6 is gone)', async () => {
    corporateSubRows = [corporatePlan(null)];
    const l = await limits();
    expect(l).toMatchObject({ source: 'corporate-plan-without-tier', familyCoverage: 'employee', maxMembers: 0, remaining: 0, canAddMore: false, addableRelations: [] });
    const res = await add();
    expect(res.status).toBe(403);
    expect(res.body.message).toBe('My SmartHealth Corporate Basic Plus plan covers the employee only and does not allow family members');
    expect(FamilyMember.create).not.toHaveBeenCalled();
  });

  test('a corporate member with no plan at all is employee only', async () => {
    corporateSubRows = [];
    expect(await limits()).toMatchObject({ source: 'corporate-without-plan', familyCoverage: 'employee', maxMembers: 0 });
    const res = await add();
    expect(res.status).toBe(403);
    expect(res.body.message).toBe('Your corporate plan covers the employee only and does not allow family members');
  });

  test("an assigned corporate plan's member count no longer grants dependants", async () => {
    corporateSubRows = [];
    assignedPlan = { plan: { name: 'Corporate Signature', type: 'corporate', features: { familyMembers: 8 }, metadata: {} } };
    const res = await add();
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/Corporate Signature plan covers the employee only/);
  });

  test('a tier on the assigned corporate membership plan applies', async () => {
    corporateSubRows = [];
    assignedPlan = { plan: { name: 'Corporate Basic Plus', code: 'CORP_NINJACART_2026', type: 'corporate', features: ['opd'], metadata: { familyCoverage: 'employee_spouse_children_parents' } } };
    expect(await limits()).toMatchObject({ source: 'corporate-plan-tier', familyCoverage: 'employee_spouse_children_parents', planName: 'Corporate Basic Plus', maxMembers: 5 });
  });

  test('a membership plan without a tier falls through to the subscription plan it links to', async () => {
    assignedPlan = { plan: { name: 'Corporate Basic Plus', type: 'corporate', features: ['opd'], metadata: { subscriptionPlanId: 36 } } };
    corporateSubRows = [corporatePlan('employee_spouse_children', { id: 36, name: 'Corporate Basic Plus (benefit plan)' })];
    expect(await limits()).toMatchObject({ familyCoverage: 'employee_spouse_children', planName: 'Corporate Basic Plus (benefit plan)' });
    const planCall = query.mock.calls.find(([sql]) => sql.includes('subscription_plans'));
    expect(planCall[1].replacements).toEqual({ userId: 7646, linkedPlanId: 36 });
  });

  test('a corporate organisation account without a roster row is corporate-scoped too', async () => {
    rosterRows = [];
    userRecord = { ...userRecord, organization_type: 'corporate' };
    const res = await add();
    expect(res.status).toBe(201);
  });
});

describe('coverage tier rules', () => {
  test('at most two children', async () => {
    has('son', 'daughter');
    const res = await add({ relationship: 'daughter' });
    expect(res.status).toBe(403);
    expect(res.body.message).toBe('Maximum children (2) reached for My SmartHealth Corporate Basic Plus plan');
  });

  test('at most one spouse (a partner is a spouse)', async () => {
    has('spouse');
    const res = await add({ relationship: 'partner' });
    expect(res.status).toBe(403);
    expect(res.body.message).toBe('You already have a spouse/partner added');
  });

  test('parents are not covered by employee + spouse + 2 children', async () => {
    const res = await add({ relationship: 'mother' });
    expect(res.status).toBe(403);
    expect(res.body.message).toBe("Relationship 'mother' not allowed for My SmartHealth Corporate Basic Plus plan. Allowed: spouse, son, daughter");
  });

  test('a brother is never covered by a tier', async () => {
    corporateSubRows = [corporatePlan('employee_spouse_children_parents')];
    const res = await add({ relationship: 'brother' });
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/Relationship 'brother' not allowed/);
  });

  describe('employee + spouse + 2 children + 2 parents or parents-in-law', () => {
    beforeEach(() => { corporateSubRows = [corporatePlan('employee_spouse_children_parents')]; });

    test('two parents, then no third', async () => {
      has('father');
      expect((await add({ relationship: 'mother' })).status).toBe(201);
      has('father', 'mother');
      const res = await add({ relationship: 'father' });
      expect(res.status).toBe(403);
      expect(res.body.message).toBe('Maximum parents (2) reached for My SmartHealth Corporate Basic Plus plan');
    });

    test('before the enum migration, a parent-in-law is refused with a clear 400, not a 500', async () => {
      const res = await add({ relationship: 'father-in-law' });
      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Parents-in-law cannot be added yet. Please try again later or contact support.');
      expect(FamilyMember.create).not.toHaveBeenCalled();
      const l = await limits();
      expect(l.inLawsAvailable).toBe(false);
      expect(l.allowedRelations).not.toContain('father_in_law');
      expect(l.relationLimits.parents).toMatchObject({ max: 2, remaining: 2, relations: ['father', 'mother'], side: null, sides: ['parents'] });
    });

    describe('once the enum can store in-laws', () => {
      beforeEach(() => { enumRows = [{ enumlabel: 'father_in_law' }, { enumlabel: 'mother_in_law' }]; });

      test('a mother-in-law is stored as mother_in_law with gender Female', async () => {
        const res = await add({ relationship: 'Mother in law' });
        expect(res.status).toBe(201);
        expect(res.body.data).toMatchObject({ relationship: 'mother_in_law', gender: 'Female' });
      });

      test("'parent in law' resolves by gender", async () => {
        const res = await add({ relationship: 'parent_in_law', gender: 'male' });
        expect(res.status).toBe(201);
        expect(res.body.data.relationship).toBe('father_in_law');
      });

      test('parents come from one side only', async () => {
        has('mother');
        const inLaw = await add({ relationship: 'father_in_law' });
        expect(inLaw.status).toBe(403);
        expect(inLaw.body.message).toBe('My SmartHealth Corporate Basic Plus plan covers either your parents or your parents-in-law, not both. You have already added a parent');

        has('mother_in_law');
        const own = await add({ relationship: 'father' });
        expect(own.status).toBe(403);
        expect(own.body.message).toMatch(/not both\. You have already added a parent-in-law$/);
      });

      test('limits report the chosen side and per-relation remaining counts', async () => {
        has('spouse', 'son', 'father_in_law');
        const l = await limits();
        expect(l).toMatchObject({ currentCount: 3, maxMembers: 5, remaining: 2, inLawsAvailable: true, canAddMore: true });
        expect(l.relationLimits).toEqual({
          spouse: { max: 1, current: 1, remaining: 0, relations: ['spouse'] },
          children: { max: 2, current: 1, remaining: 1, relations: ['son', 'daughter'] },
          parents: { max: 2, current: 1, remaining: 1, relations: ['father_in_law', 'mother_in_law'], side: 'parents_in_law', sides: ['parents', 'parents_in_law'] },
        });
        expect(l.addableRelations).toEqual(['son', 'daughter', 'father_in_law', 'mother_in_law']);
      });
    });
  });

  test("'sister in law' is not fuzzy-matched to sister", async () => {
    const res = await add({ relationship: 'sister in law' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/'sister_in_law' is not supported/);
  });
});

describe('individual (non-corporate) plans', () => {
  beforeEach(() => { rosterRows = []; corporateSubRows = []; });

  test('a plan without family members is refused with 403, not 500', async () => {
    assignedPlan = { plan: { name: 'Silver', features: { familyMembers: 0 } } };
    const res = await add();
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/does not allow family members/);
    expect(FamilyMember.create).not.toHaveBeenCalled();
  });

  test('the count limit is still enforced', async () => {
    assignedPlan = { plan: { name: 'Family', features: { familyMembers: 2 } } };
    has('spouse', 'son');
    const res = await add({ relationship: 'daughter' });
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/Maximum family members \(2\)/);
  });

  test("an 'unlimited' plan allows adds and reports maxMembers null", async () => {
    assignedPlan = { plan: { name: 'Exclusive', features: { familyMembers: 'unlimited' } } };
    has(...Array(40).fill('other'));
    expect(await limits()).toMatchObject({ coverageMode: 'count', familyCoverage: null, relationLimits: null, maxMembers: null, unlimited: true, remaining: null, canAddMore: true });
    const res = await add();
    expect(res.status).toBe(201);
  });

  test('an individual plan that sets a tier is enforced by tier', async () => {
    assignedPlan = { plan: { name: 'Gold', slug: 'gold', features: { familyMembers: 6 }, metadata: { familyCoverage: 'employee_spouse_children' } } };
    has('son', 'daughter');
    expect(await limits()).toMatchObject({ coverageMode: 'tier', source: 'active-user-plan-tier', maxMembers: 3 });
    const res = await add({ relationship: 'son' });
    expect(res.status).toBe(403);
    expect(res.body.message).toBe('Maximum children (2) reached for Gold plan');
  });
});

describe('relationships the enum cannot store', () => {
  test("'partner' is stored as spouse", async () => {
    const res = await add({ relationship: 'partner' });
    expect(res.status).toBe(201);
    expect(res.body.data.relationship).toBe('spouse');
  });

  test("'child' needs a gender: 400 without one, daughter with Female", async () => {
    const bare = await add({ relationship: 'child' });
    expect(bare.status).toBe(400);
    expect(transaction).not.toHaveBeenCalled();

    const withGender = await add({ relationship: 'child', gender: 'female' });
    expect(withGender.status).toBe(201);
    expect(withGender.body.data).toMatchObject({ relationship: 'daughter', gender: 'Female' });
  });

  test("'grandson' is not fuzzy-matched to son", async () => {
    rosterRows = [];
    assignedPlan = { plan: { name: 'Family', features: { familyMembers: 6, allowedRelations: ['grandson'] } } };
    const res = await add({ relationship: 'grandson' });
    expect(res.status).toBe(201);
    expect(res.body.data.relationship).toBe('grandson');
  });
});

describe('bad input is a 400, never a 500', () => {
  test.each([
    [{ dateOfBirth: '31/02/2015' }, /dateOfBirth/],
    [{ dateOfBirth: '2999-01-01' }, /future/],
    [{ gender: 'boy' }, /gender/],
    [{ email: 'not-an-email' }, /email/],
    [{ firstName: 'x'.repeat(101) }, /firstName/],
    [{ phoneNumber: '1'.repeat(21) }, /phoneNumber/],
    [{ allergies: { peanut: true } }, /allergies/],
    [{ emergencyContact: 'call mum' }, /emergencyContact/],
    [{ relationship: 'colleague' }, /not supported/],
    [{ lastName: '' }, /Missing required fields/],
  ])('%j', async (patch, message) => {
    const res = await request(app).post('/api/family-members').send({ ...appPayload, ...patch });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(message);
    expect(FamilyMember.create).not.toHaveBeenCalled();
  });

  test('an ABHA ID registered on another account is a 409 and the transaction rolls back', async () => {
    const unique = Object.assign(new Error('Validation error'), {
      name: 'SequelizeUniqueConstraintError',
      fields: { abhaHealthId: '12-3456-7890-1234' },
    });
    FamilyMember.create.mockRejectedValueOnce(unique);
    const res = await request(app).post('/api/family-members').send({ ...appPayload, abhaHealthId: '12-3456-7890-1234' });
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('This ABHA Health ID is already registered');
    expect(tx.rollback).toHaveBeenCalled();
    expect(tx.commit).not.toHaveBeenCalled();
  });

  test('a genuine server fault stays a 500 without leaking database text', async () => {
    const rls = Object.assign(new Error('new row violates row-level security policy'), {
      name: 'SequelizeDatabaseError',
      parent: { code: '42501' },
    });
    FamilyMember.create.mockRejectedValueOnce(rls);
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const res = await request(app).post('/api/family-members').send(appPayload);
    spy.mockRestore();
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ success: false, message: 'Failed to add family member' });
  });
});

describe('reads and updates run under the RLS context too', () => {
  test('GET / lists inside the member RLS transaction', async () => {
    FamilyMember.findAll.mockResolvedValueOnce([{ id: 4, userId: 7646 }]);
    const res = await request(app).get('/api/family-members');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(setRlsContext).toHaveBeenCalledWith(tx, { orgId: 0, userId: 7646 });
    expect(FamilyMember.findAll).toHaveBeenCalledWith(expect.objectContaining({ transaction: tx }));
  });

  test('PUT updates inside the transaction', async () => {
    const update = jest.fn(async () => {});
    FamilyMember.findOne.mockResolvedValueOnce({ id: 4, userId: 7646, firstName: 'Riya', lastName: 'Sharma', relationship: 'son', gender: 'Male', isActive: true, metadata: {}, update });
    const res = await request(app).put('/api/family-members/4').send({ bloodType: 'O+' });
    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ bloodType: 'O+', relationship: 'son' }), { transaction: tx });
    // Relationship unchanged: no plan re-check.
    expect(FamilyMember.findAll).not.toHaveBeenCalled();
  });

  test('PUT changing the relationship is checked against the plan like an add', async () => {
    const update = jest.fn(async () => {});
    has('spouse', 'son');
    FamilyMember.findOne.mockResolvedValueOnce({ id: 101, userId: 7646, firstName: 'Riya', lastName: 'Sharma', relationship: 'son', gender: 'Male', isActive: true, metadata: {}, update });
    const res = await request(app).put('/api/family-members/101').send({ relationship: 'spouse' });
    expect(res.status).toBe(403);
    expect(res.body.message).toBe('You already have a spouse/partner added');
    expect(update).not.toHaveBeenCalled();
    expect(query.mock.calls.some(([sql, opts]) => sql.includes('pg_advisory_xact_lock') && opts.transaction === tx)).toBe(true);
  });

  test('PUT leaves the edited member out of the counts', async () => {
    const update = jest.fn(async () => {});
    has('son', 'daughter');
    FamilyMember.findOne.mockResolvedValueOnce({ id: 100, userId: 7646, firstName: 'Riya', lastName: 'Sharma', relationship: 'son', gender: 'Male', isActive: true, metadata: {}, update });
    const res = await request(app).put('/api/family-members/100').send({ relationship: 'daughter', gender: 'Female' });
    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ relationship: 'daughter', gender: 'Female' }), { transaction: tx });
  });

  test('PUT cannot turn a child into a parent on a plan without parents', async () => {
    const update = jest.fn(async () => {});
    has('son');
    FamilyMember.findOne.mockResolvedValueOnce({ id: 100, userId: 7646, firstName: 'Riya', lastName: 'Sharma', relationship: 'son', gender: 'Male', isActive: true, metadata: {}, update });
    const res = await request(app).put('/api/family-members/100').send({ relationship: 'father' });
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/Relationship 'father' not allowed/);
    expect(update).not.toHaveBeenCalled();
  });

  test('DELETE soft-deletes inside the transaction', async () => {
    const update = jest.fn(async () => {});
    FamilyMember.findOne.mockResolvedValueOnce({ id: 4, update });
    const res = await request(app).delete('/api/family-members/4');
    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledWith({ isActive: false }, { transaction: tx });
  });

  test('a non-numeric id is a 404 without touching the database', async () => {
    const res = await request(app).get('/api/family-members/abc');
    expect(res.status).toBe(404);
    expect(transaction).not.toHaveBeenCalled();
  });
});
