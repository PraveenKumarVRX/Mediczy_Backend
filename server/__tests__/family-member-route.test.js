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

const tx = { commit: jest.fn(async () => {}), rollback: jest.fn(async () => {}) };
const query = jest.fn(async (sql) => {
  if (String(sql).includes('corporate_employees')) return rosterRows;
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
  UserPlan: { findOne: jest.fn(async () => assignedPlan) },
  MembershipPlan: {},
}));

const { default: router } = await import('../routes/family-member.route.js');
const app = express();
app.use(express.json());
app.use('/api/family-members', router);

// Exactly what My SmartHealth 1.5.2 sends (app/Utils/familyMember.js toServerMember).
const appPayload = { firstName: 'Riya', lastName: 'Sharma', relationship: 'son', dateOfBirth: '2015-04-02', bloodType: null };

beforeEach(() => {
  jest.clearAllMocks();
  // Corporate QA login: on corporate 4's roster, but users.corporate_id is null
  // and organization_type is 'individual'.
  currentUser = { id: 7646, organization_id: null };
  userRecord = { id: 7646, membershipType: 'individual', organization_type: 'individual', corporate_id: null, metadata: {} };
  rosterRows = [{ '?column?': 1 }];
  assignedPlan = null;
  FamilyMember.count.mockResolvedValue(0);
  FamilyMember.findOne.mockResolvedValue(null);
  FamilyMember.create.mockImplementation(async (values) => ({ id: 11, ...values }));
});

describe('POST /api/family-members (corporate member)', () => {
  test('saves under the member RLS context inside one transaction', async () => {
    const res = await request(app).post('/api/family-members').send(appPayload);

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ userId: 7646, relationship: 'son', gender: 'Male', dateOfBirth: '2015-04-02' });
    expect(setRlsContext).toHaveBeenCalledWith(tx, { orgId: 0, userId: 7646 });
    expect(FamilyMember.count).toHaveBeenCalledWith(expect.objectContaining({ transaction: tx }));
    expect(FamilyMember.create).toHaveBeenCalledWith(expect.any(Object), { transaction: tx });
    expect(query.mock.calls.some(([sql, opts]) => sql.includes('pg_advisory_xact_lock') && opts.transaction === tx)).toBe(true);
    expect(tx.commit).toHaveBeenCalledTimes(1);
    expect(res.body.remaining).toBe(5);
  });

  test('a roster employee is corporate-scoped (corporate default policy), looked up by corporate_uid', async () => {
    const res = await request(app).get('/api/family-members/limits');
    expect(res.status).toBe(200);
    expect(res.body.limits).toMatchObject({ membershipType: 'corporate', source: 'corporate-default-policy', maxMembers: 6, canAddMore: true });
    const rosterSql = query.mock.calls.find(([sql]) => sql.includes('corporate_employees'))[0];
    expect(rosterSql).toContain('corporate_uid IS NOT NULL');
  });

  test('a corporate organisation account without a roster row also saves', async () => {
    rosterRows = [];
    userRecord = { ...userRecord, organization_type: 'corporate' };
    const res = await request(app).post('/api/family-members').send(appPayload);
    expect(res.status).toBe(201);
  });

  test('the corporate plan family limit is still enforced', async () => {
    FamilyMember.count.mockResolvedValue(6);
    const res = await request(app).post('/api/family-members').send(appPayload);
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/Maximum family members \(6\)/);
    expect(FamilyMember.create).not.toHaveBeenCalled();
  });

  test('an assigned corporate plan limit wins over the default policy', async () => {
    assignedPlan = { plan: { name: 'Corporate Basic', features: { familyMembers: 2 } } };
    FamilyMember.count.mockResolvedValue(2);
    const res = await request(app).post('/api/family-members').send(appPayload);
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/Maximum family members \(2\)/);
  });

  test("an 'unlimited' corporate plan allows adds and reports maxMembers null", async () => {
    assignedPlan = { plan: { name: 'Corporate Exclusive', features: { familyMembers: 'unlimited' } } };
    FamilyMember.count.mockResolvedValue(40);
    const limits = await request(app).get('/api/family-members/limits');
    expect(limits.body.limits).toMatchObject({ maxMembers: null, unlimited: true, remaining: null, canAddMore: true });
    const res = await request(app).post('/api/family-members').send(appPayload);
    expect(res.status).toBe(201);
  });
});

describe('POST /api/family-members (individual member)', () => {
  test('a plan without family members is refused with 403, not 500', async () => {
    rosterRows = [];
    assignedPlan = { plan: { name: 'Silver', features: { familyMembers: 0 } } };
    const res = await request(app).post('/api/family-members').send(appPayload);
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/does not allow family members/);
    expect(FamilyMember.create).not.toHaveBeenCalled();
  });
});

describe('relationships the enum cannot store', () => {
  test("'partner' is stored as spouse and the duplicate check asks only for 'spouse'", async () => {
    const res = await request(app).post('/api/family-members').send({ ...appPayload, relationship: 'partner' });
    expect(res.status).toBe(201);
    expect(res.body.data.relationship).toBe('spouse');
    const spouseLookup = FamilyMember.findOne.mock.calls.find(([opts]) => opts.where.relationship);
    expect(spouseLookup[0].where.relationship).toBe('spouse');
    expect(spouseLookup[0].transaction).toBe(tx);
  });

  test('a second spouse is refused', async () => {
    FamilyMember.findOne.mockResolvedValueOnce({ id: 3, relationship: 'spouse' });
    const res = await request(app).post('/api/family-members').send({ ...appPayload, relationship: 'spouse' });
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/already have a spouse/);
  });

  test("'child' needs a gender: 400 without one, daughter with Female", async () => {
    const bare = await request(app).post('/api/family-members').send({ ...appPayload, relationship: 'child' });
    expect(bare.status).toBe(400);
    expect(transaction).not.toHaveBeenCalled();

    const withGender = await request(app).post('/api/family-members').send({ ...appPayload, relationship: 'child', gender: 'female' });
    expect(withGender.status).toBe(201);
    expect(withGender.body.data).toMatchObject({ relationship: 'daughter', gender: 'Female' });
  });

  test("'grandson' is not fuzzy-matched to son", async () => {
    rosterRows = [];
    assignedPlan = { plan: { name: 'Family', features: { familyMembers: 6, allowedRelations: ['grandson'] } } };
    const res = await request(app).post('/api/family-members').send({ ...appPayload, relationship: 'grandson' });
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
    FamilyMember.findOne.mockResolvedValueOnce({ id: 4, userId: 7646, firstName: 'Riya', lastName: 'Sharma', relationship: 'son', gender: 'Male', metadata: {}, update });
    const res = await request(app).put('/api/family-members/4').send({ bloodType: 'O+' });
    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ bloodType: 'O+', relationship: 'son' }), { transaction: tx });
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
