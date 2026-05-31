import express from 'express';
import request from 'supertest';
import { jest } from '@jest/globals';

const mockMembershipPlanFindAll = jest.fn();
const mockMembershipPlanFindOne = jest.fn();
const mockMembershipPlanCreate = jest.fn();
const mockMembershipPlanCount = jest.fn();

const mockUserPlanFindOne = jest.fn();
const mockUserPlanFindAll = jest.fn();
const mockUserPlanCreate = jest.fn();

const mockUserFindByPk = jest.fn();
const mockCorporateFindByPk = jest.fn();
const mockBrokerFindByPk = jest.fn();
const mockPoolQuery = jest.fn();
const mockAuditLogEvent = jest.fn();

jest.unstable_mockModule('../middleware/auth.middleware.js', () => ({
  authUser: (req, _res, next) => {
    req.user = { id: 99, role: 'corporate_admin', organization_id: 1, organization_type: 'corporate' };
    next();
  },
}));

jest.unstable_mockModule('../middleware/org-admin.middleware.js', () => ({
  requireOrgAdmin: (_req, _res, next) => next(),
}));

jest.unstable_mockModule('../middleware/team.middleware.js', () => ({
  authTeam: (req, _res, next) => {
    req.teamUser = { id: 77, role: 'team', isAdmin: false };
    next();
  },
  requirePermission: () => (_req, _res, next) => next(),
}));

jest.unstable_mockModule('../models/postgres/membershipPlan.model.postgres.js', () => ({
  MembershipPlan: {
    findAll: mockMembershipPlanFindAll,
    findOne: mockMembershipPlanFindOne,
    create: mockMembershipPlanCreate,
    count: mockMembershipPlanCount,
  },
  UserPlan: {
    findOne: mockUserPlanFindOne,
    findAll: mockUserPlanFindAll,
    create: mockUserPlanCreate,
  },
}));

jest.unstable_mockModule('../models/postgres/user.model.postgres.js', () => ({
  default: { findByPk: mockUserFindByPk },
}));

jest.unstable_mockModule('../models/postgres/corporate.model.postgres.js', () => ({
  default: { findByPk: mockCorporateFindByPk },
}));

jest.unstable_mockModule('../models/insurance-broker.model.intelligent.js', () => ({
  InsuranceBroker: { findByPk: mockBrokerFindByPk },
}));

jest.unstable_mockModule('../db/pgPool.js', () => ({
  default: { query: mockPoolQuery },
}));

jest.unstable_mockModule('../models/auditLog.model.intelligent.js', () => ({
  default: { logEvent: mockAuditLogEvent },
}));

let app;

describe('Team-managed user plan customization flow', () => {
  const originalApprovalThreshold = process.env.TEAM_PLAN_APPROVAL_THRESHOLD_INR;

  beforeAll(async () => {
    const { default: router } = await import('../routes/org-membership-plans.route.js');
    app = express();
    app.use(express.json());
    app.use('/api/org-membership-plans', router);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockMembershipPlanCount.mockResolvedValue(0);
    mockMembershipPlanFindAll.mockResolvedValue([]);
    mockBrokerFindByPk.mockResolvedValue(null);
    mockPoolQuery.mockResolvedValue({ rows: [] });
    mockAuditLogEvent.mockResolvedValue({ id: 'audit-1' });
  });

  afterAll(() => {
    if (originalApprovalThreshold === undefined) {
      delete process.env.TEAM_PLAN_APPROVAL_THRESHOLD_INR;
    } else {
      process.env.TEAM_PLAN_APPROVAL_THRESHOLD_INR = originalApprovalThreshold;
    }
  });

  it('returns 403 when team user is not assigned to target user corporate chain', async () => {
    mockUserFindByPk.mockResolvedValue({
      id: 501,
      firstName: 'Target',
      lastName: 'User',
      email: 'target@example.com',
      phoneNumber: '9999999999',
      corporateId: 700,
      organization_type: 'corporate',
      metadata: {},
    });

    mockCorporateFindByPk.mockResolvedValue({
      id: 700,
      companyName: 'Acme Corp',
      assignedTo: 88,
      onboardedById: 66,
      aggregatorId: null,
      aggregatorType: null,
      status: 'Active',
    });

    const res = await request(app)
      .post('/api/org-membership-plans/team/users/501/customize-plan')
      .set('Authorization', 'Bearer team-token')
      .send({ masterPlanId: 1 });

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({
      success: false,
      message: 'Access denied. Team user is not assigned to this user/corporate management chain.',
    });
  });

  it('creates customization and applies a corporate-managed user plan when assigned', async () => {
    mockUserFindByPk.mockResolvedValue({
      id: 502,
      firstName: 'Managed',
      lastName: 'Member',
      email: 'managed@example.com',
      phoneNumber: '8888888888',
      corporateId: 701,
      organization_type: 'corporate',
      metadata: {},
    });

    mockCorporateFindByPk.mockResolvedValue({
      id: 701,
      companyName: 'Managed Corp',
      assignedTo: 77,
      onboardedById: null,
      aggregatorId: null,
      aggregatorType: null,
      status: 'Active',
    });

    mockUserPlanFindOne.mockResolvedValue(null);

    const masterPlan = {
      id: 1,
      name: 'Master Gold',
      code: 'MGOLD',
      description: 'Master description',
      type: 'wellness',
      price: 1200,
      discountedPrice: 999,
      durationMonths: 12,
      features: { tele: true },
      benefits: ['consult'],
      limitations: {},
      maxUsers: 1,
      metadata: {},
      sortOrder: 1,
      planType: 'primary',
      tier: 2,
      tierName: 'gold',
      isMaster: true,
      isActive: true,
    };

    mockMembershipPlanFindOne
      .mockResolvedValueOnce(masterPlan)
      .mockResolvedValueOnce(null);

    const createdCustomizedPlan = {
      ...masterPlan,
      id: 910,
      isMaster: false,
      organizationId: 701,
      organizationType: 'corporate',
      metadata: {},
      price: 1300,
      discountedPrice: 1100,
    };

    mockMembershipPlanCreate.mockResolvedValue(createdCustomizedPlan);
    mockUserPlanFindAll.mockResolvedValue([]);
    mockUserPlanCreate.mockResolvedValue({ id: 1201, userId: 502, membershipPlanId: 910, status: 'active' });

    const res = await request(app)
      .post('/api/org-membership-plans/team/users/502/customize-plan')
      .set('Authorization', 'Bearer team-token')
      .send({
        masterPlanId: 1,
        name: 'Managed Corp Gold',
        price: 1300,
        discountedPrice: 1100,
        customizationNotes: 'Team customized plan for managed corporate'
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(mockMembershipPlanCreate).toHaveBeenCalled();
    expect(mockUserPlanCreate).toHaveBeenCalledWith(expect.objectContaining({
      userId: 502,
      membershipPlanId: 910,
      paymentMethod: 'corporate'
    }));
    expect(mockAuditLogEvent).toHaveBeenCalledWith(expect.objectContaining({
      action: 'TEAM_USER_PLAN_CUSTOMIZED_AND_ASSIGNED',
      userType: 'team',
      status: 'SUCCESS'
    }));
  });

  it('returns pending approval for high-value override before apply-to-user', async () => {
    process.env.TEAM_PLAN_APPROVAL_THRESHOLD_INR = '1000';

    mockUserFindByPk.mockResolvedValue({
      id: 503,
      firstName: 'High',
      lastName: 'Value',
      email: 'highvalue@example.com',
      phoneNumber: '7777777777',
      corporateId: 702,
      organization_type: 'corporate',
      metadata: {},
    });

    mockCorporateFindByPk.mockResolvedValue({
      id: 702,
      companyName: 'Premium Corp',
      assignedTo: 77,
      onboardedById: null,
      aggregatorId: null,
      aggregatorType: null,
      status: 'Active',
    });

    mockUserPlanFindOne.mockResolvedValue(null);

    const masterPlan = {
      id: 2,
      name: 'Master Platinum',
      code: 'MPLAT',
      description: 'Premium master plan',
      type: 'wellness',
      price: 2500,
      discountedPrice: 2200,
      durationMonths: 12,
      features: { tele: true },
      benefits: ['consult'],
      limitations: {},
      maxUsers: 1,
      metadata: {},
      sortOrder: 1,
      planType: 'primary',
      tier: 4,
      tierName: 'platinum',
      isMaster: true,
      isActive: true,
    };

    mockMembershipPlanFindOne
      .mockResolvedValueOnce(masterPlan)
      .mockResolvedValueOnce(null);

    const createdCustomizedPlan = {
      ...masterPlan,
      id: 920,
      isMaster: false,
      organizationId: 702,
      organizationType: 'corporate',
      metadata: {},
      price: 3000,
      discountedPrice: 2800,
    };

    mockMembershipPlanCreate.mockResolvedValue(createdCustomizedPlan);
    mockPoolQuery.mockImplementation(async (sql) => {
      const queryText = String(sql || '');
      if (queryText.includes('INSERT INTO team_plan_customization_approvals')) {
        return { rows: [{ id: 11, status: 'pending', target_user_id: 503, corporate_id: 702 }] };
      }
      return { rows: [] };
    });

    const res = await request(app)
      .post('/api/org-membership-plans/team/users/503/customize-plan')
      .set('Authorization', 'Bearer team-token')
      .send({
        masterPlanId: 2,
        name: 'Premium Corp Platinum',
        price: 3000,
        discountedPrice: 2800,
        applyToUser: true,
      });

    expect(res.status).toBe(202);
    expect(res.body).toMatchObject({
      success: true,
      pendingApproval: true,
    });
    expect(mockUserPlanCreate).not.toHaveBeenCalled();
    expect(mockAuditLogEvent).toHaveBeenCalledWith(expect.objectContaining({
      action: 'TEAM_USER_PLAN_ASSIGNMENT_APPROVAL_REQUIRED',
      status: 'SUCCESS',
      statusCode: 202,
    }));
  });
});
