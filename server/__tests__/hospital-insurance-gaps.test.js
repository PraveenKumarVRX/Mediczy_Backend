/**
 * Contract tests for the endpoints added while closing the Insurance Desk
 * RAG-analysis gaps (2026-08-15): denial-management unification, the NHCX
 * scaffold, and the TPA/insurer credential-readiness dashboard. Kept in a
 * separate file from hospital-insurance.test.js so each suite's mock set
 * stays scoped to what it actually needs.
 */
import express from 'express';
import request from 'supertest';
import { jest } from '@jest/globals';

const mockInsuranceClaimFindByPk = jest.fn();
const mockClaimDenialFindOne = jest.fn();
const mockDenialServiceListDenials = jest.fn();
const mockDenialServiceCreateDenial = jest.fn();
const mockDenialServiceDraftAppeal = jest.fn();
const mockDenialServiceResolveDenial = jest.fn();
const mockNhcxSubmitEligibility = jest.fn();
const mockNhcxSubmitPreAuth = jest.fn();
const mockNhcxSubmitClaim = jest.fn();
const mockIsNhcxConfigured = jest.fn();
const mockPgPoolQuery = jest.fn();
const mockGetAvailableProviders = jest.fn();

jest.unstable_mockModule('../middleware/auth.middleware.js', () => ({
  authUser: (req, _res, next) => {
    req.user = { id: 99, role: 'hospital', type: 'hospital', hospitalId: 7, organizationId: 17 };
    next();
  },
  authUserOptional: (_req, _res, next) => next(),
  authDoctor: (req, _res, next) => next(),
  requireRole: () => (_req, _res, next) => next(),
}));

jest.unstable_mockModule('../db/pgPool.js', () => ({
  default: { query: mockPgPoolQuery },
}));

jest.unstable_mockModule('../models/index.js', () => ({
  User: { findAll: jest.fn() },
}));

jest.unstable_mockModule('../models/postgres/preAuthorization.model.postgres.js', () => ({
  default: { create: jest.fn(), findAndCountAll: jest.fn(), count: jest.fn(), findByPk: jest.fn() },
}));

jest.unstable_mockModule('../models/postgres/insuranceClaim.model.postgres.js', () => ({
  default: { findByPk: mockInsuranceClaimFindByPk, findAll: jest.fn(), count: jest.fn() },
}));

jest.unstable_mockModule('../models/postgres/claimDenial.model.postgres.js', () => ({
  default: { findOne: mockClaimDenialFindOne },
}));

jest.unstable_mockModule('../services/denial-management.service.js', () => ({
  default: {
    listDenials: mockDenialServiceListDenials,
    createDenial: mockDenialServiceCreateDenial,
    draftAppeal: mockDenialServiceDraftAppeal,
    resolveDenial: mockDenialServiceResolveDenial,
  },
}));

jest.unstable_mockModule('../services/nhcx-client.service.js', () => ({
  isNhcxConfigured: mockIsNhcxConfigured,
  default: {
    submitEligibilityCheck: mockNhcxSubmitEligibility,
    submitPreAuth: mockNhcxSubmitPreAuth,
    submitClaim: mockNhcxSubmitClaim,
  },
}));

jest.unstable_mockModule('../services/tpa-aggregator.service.js', () => ({
  default: { getAvailableProviders: mockGetAvailableProviders },
}));

jest.unstable_mockModule('../services/insurance-ai-copilot.service.js', () => ({
  draftAppealLetter: jest.fn(),
  checkDocumentationGaps: jest.fn(),
}));

jest.unstable_mockModule('../services/pdf-generator.service.js', () => ({ default: { generateClaimPDF: jest.fn() } }));
jest.unstable_mockModule('../services/insurance-provider.service.js', () => ({ default: { checkEligibility: jest.fn() } }));
jest.unstable_mockModule('../services/socket.service.js', () => ({ default: { emitClaimUpdate: jest.fn(), emitPreAuthUpdate: jest.fn() } }));
jest.unstable_mockModule('../services/cache.service.js', () => ({ default: { get: jest.fn(), set: jest.fn() } }));

let app;

const fakeClaim = (overrides = {}) => ({
  id: 501,
  claimNumber: 'CLM20260815ABCD',
  hospitalId: 7,
  organizationId: 17,
  patientId: 1,
  status: 'rejected',
  queryHistory: [],
  notes: '',
  rejectionReason: 'Documentation incomplete',
  update: jest.fn().mockResolvedValue(true),
  ...overrides,
});

describe('Insurance Desk gap-closure route contracts', () => {
  beforeAll(async () => {
    // withClaimsRls() opens a real Sequelize transaction — model .define() calls
    // elsewhere in this route file are safe unmocked (no DB round-trip), but an
    // actual transaction() call needs a live connection, so that one method is
    // spied out rather than mocking the whole module (which would break every
    // co-imported model's .define()).
    const { postgresSequelize } = await import('../db/postgres-sequelize.js');
    jest.spyOn(postgresSequelize, 'transaction').mockImplementation(async () => ({
      commit: jest.fn(),
      rollback: jest.fn(),
    }));

    const { default: insuranceRouter } = await import('../routes/hospital-insurance.route.js');
    app = express();
    app.use(express.json());
    app.use('/api/hospital/insurance', insuranceRouter);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockPgPoolQuery.mockResolvedValue({ rows: [] });
  });

  describe('Denial management', () => {
    it('GET /claims/:claimId/denials lists only denials linked to that claim', async () => {
      mockInsuranceClaimFindByPk.mockResolvedValue(fakeClaim());
      mockDenialServiceListDenials.mockResolvedValue([
        { id: 1, claimId: 501, claimNumber: 'CLM20260815ABCD', status: 'open' },
        { id: 2, claimId: 999, claimNumber: 'CLM-OTHER', status: 'open' },
      ]);

      const res = await request(app)
        .get('/api/hospital/insurance/claims/501/denials')
        .set('Authorization', 'Bearer test-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.denials).toHaveLength(1);
      expect(res.body.denials[0].id).toBe(1);
    });

    it('GET /claims/:claimId/denials returns 404 for a claim outside RLS scope', async () => {
      mockInsuranceClaimFindByPk.mockResolvedValue(null);

      const res = await request(app)
        .get('/api/hospital/insurance/claims/999/denials')
        .set('Authorization', 'Bearer test-token');

      expect(res.status).toBe(404);
      expect(mockDenialServiceListDenials).not.toHaveBeenCalled();
    });

    it('POST /claims/:claimId/denials creates a denial scoped to the claim hospital/org', async () => {
      mockInsuranceClaimFindByPk.mockResolvedValue(fakeClaim());
      mockDenialServiceCreateDenial.mockResolvedValue({ id: 5, claimId: 501, status: 'open' });

      const res = await request(app)
        .post('/api/hospital/insurance/claims/501/denials')
        .set('Authorization', 'Bearer test-token')
        .send({ denialCode: 'DOC_INCOMPLETE', denialReason: 'Missing discharge summary', deniedAmount: 50000 });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(mockDenialServiceCreateDenial).toHaveBeenCalledWith(
        7,
        expect.objectContaining({ claimId: 501, claimNumber: 'CLM20260815ABCD', denialCode: 'DOC_INCOMPLETE' }),
        99
      );
    });

    it('POST /claims/:claimId/denials/:denialId/appeal drafts and returns a letter', async () => {
      mockInsuranceClaimFindByPk.mockResolvedValue(fakeClaim());
      mockDenialServiceDraftAppeal.mockResolvedValue({ denialId: 5, appealLetter: 'Dear Sir/Madam...' });

      const res = await request(app)
        .post('/api/hospital/insurance/claims/501/denials/5/appeal')
        .set('Authorization', 'Bearer test-token');

      expect(res.status).toBe(200);
      expect(res.body.appealLetter).toContain('Dear Sir');
      expect(mockDenialServiceDraftAppeal).toHaveBeenCalledWith(7, 5, 99);
    });

    it('POST /claims/:claimId/denials/:denialId/appeal returns 404 when the denial does not exist', async () => {
      mockInsuranceClaimFindByPk.mockResolvedValue(fakeClaim());
      mockDenialServiceDraftAppeal.mockRejectedValue(new Error('Denial not found'));

      const res = await request(app)
        .post('/api/hospital/insurance/claims/501/denials/999/appeal')
        .set('Authorization', 'Bearer test-token');

      expect(res.status).toBe(404);
    });

    it('POST /claims/:claimId/denials/:denialId/resolve wraps resolveDenial', async () => {
      mockInsuranceClaimFindByPk.mockResolvedValue(fakeClaim());
      mockDenialServiceResolveDenial.mockResolvedValue({ success: true, denialId: 5 });

      const res = await request(app)
        .post('/api/hospital/insurance/claims/501/denials/5/resolve')
        .set('Authorization', 'Bearer test-token')
        .send({ resolution: 'overturned', notes: 'Insurer reversed on appeal' });

      expect(res.status).toBe(200);
      expect(mockDenialServiceResolveDenial).toHaveBeenCalledWith(
        7, 5, { resolution: 'overturned', notes: 'Insurer reversed on appeal' }, 99
      );
    });

    it('POST /claims/:claimId/appeal syncs a linked, unresolved claim_denials row', async () => {
      const claim = fakeClaim();
      mockInsuranceClaimFindByPk.mockResolvedValue(claim);
      const linkedDenial = { id: 5, claimId: 501, status: 'open', appealLetter: null, update: jest.fn().mockResolvedValue(true) };
      mockClaimDenialFindOne.mockResolvedValue(linkedDenial);

      const res = await request(app)
        .post('/api/hospital/insurance/claims/501/appeal')
        .set('Authorization', 'Bearer test-token')
        .send({ appealReason: 'Medical necessity established', supportingNotes: 'See attached records' });

      expect(res.status).toBe(200);
      expect(claim.update).toHaveBeenCalled();
      expect(linkedDenial.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'appealed' }));
    });

    it('POST /claims/:claimId/appeal does not touch an already-resolved denial', async () => {
      const claim = fakeClaim();
      mockInsuranceClaimFindByPk.mockResolvedValue(claim);
      const resolvedDenial = { id: 5, claimId: 501, status: 'resolved', update: jest.fn() };
      mockClaimDenialFindOne.mockResolvedValue(resolvedDenial);

      const res = await request(app)
        .post('/api/hospital/insurance/claims/501/appeal')
        .set('Authorization', 'Bearer test-token')
        .send({ appealReason: 'Reconsideration requested' });

      expect(res.status).toBe(200);
      expect(resolvedDenial.update).not.toHaveBeenCalled();
    });
  });

  describe('NHCX scaffold', () => {
    it('POST /nhcx/eligibility-check delegates to the NHCX client and logs activity', async () => {
      mockNhcxSubmitEligibility.mockResolvedValue({ configured: false, sent: false, message: 'NHCX not configured' });

      const res = await request(app)
        .post('/api/hospital/insurance/nhcx/eligibility-check')
        .set('Authorization', 'Bearer test-token')
        .send({ patientName: 'Ramesh Kumar', policyNumber: 'POL123456', insurerCode: 'star_health' });

      expect(res.status).toBe(200);
      expect(res.body.configured).toBe(false);
      // resolvePortalScope() stringifies ids via String(req.user.hospitalId || ...)
      expect(mockNhcxSubmitEligibility).toHaveBeenCalledWith(expect.objectContaining({ policyNumber: 'POL123456', hospitalId: '7' }));
      expect(mockPgPoolQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO nhcx_activity_log'),
        expect.arrayContaining(['17', 'eligibility-check'])
      );
    });

    it('POST /nhcx/eligibility-check rejects a missing required field', async () => {
      const res = await request(app)
        .post('/api/hospital/insurance/nhcx/eligibility-check')
        .set('Authorization', 'Bearer test-token')
        .send({ patientName: 'Ramesh Kumar' });

      expect(res.status).toBe(400);
      expect(mockNhcxSubmitEligibility).not.toHaveBeenCalled();
    });

    it('POST /nhcx/preauth-submit delegates to the NHCX client', async () => {
      mockNhcxSubmitPreAuth.mockResolvedValue({ configured: true, sent: true, correlationId: 'abc-123' });

      const res = await request(app)
        .post('/api/hospital/insurance/nhcx/preauth-submit')
        .set('Authorization', 'Bearer test-token')
        .send({ preAuthNumber: 'PA-001', patientName: 'Ramesh Kumar', policyNumber: 'POL123456', insurerCode: 'star_health' });

      expect(res.status).toBe(200);
      expect(res.body.sent).toBe(true);
    });

    it('POST /nhcx/claim-submit delegates to the NHCX client', async () => {
      mockNhcxSubmitClaim.mockResolvedValue({ configured: false, sent: false });

      const res = await request(app)
        .post('/api/hospital/insurance/nhcx/claim-submit')
        .set('Authorization', 'Bearer test-token')
        .send({ claimNumber: 'CLM-001', patientName: 'Ramesh Kumar', policyNumber: 'POL123456', insurerCode: 'star_health' });

      expect(res.status).toBe(200);
      expect(mockNhcxSubmitClaim).toHaveBeenCalled();
    });

    it('GET /nhcx/activity returns the organization-scoped log and configured flag', async () => {
      mockIsNhcxConfigured.mockReturnValue(false);
      mockPgPoolQuery.mockResolvedValue({
        rows: [{ id: 1, workflow: 'eligibility-check', correlation_id: null, configured: false, sent: false, error: null, created_at: '2026-08-15T10:00:00Z' }],
      });

      const res = await request(app)
        .get('/api/hospital/insurance/nhcx/activity')
        .set('Authorization', 'Bearer test-token');

      expect(res.status).toBe(200);
      expect(res.body.configured).toBe(false);
      expect(res.body.activity).toHaveLength(1);
      expect(mockPgPoolQuery).toHaveBeenCalledWith(expect.stringContaining('FROM nhcx_activity_log'), ['17']);
    });
  });

  describe('TPA/insurer credential readiness', () => {
    it('GET /tpa/readiness reports configured=false when no env vars are set', async () => {
      mockGetAvailableProviders.mockReturnValue([
        { id: 'heritage', name: 'Heritage Health TPA', implemented: true, capabilities: {} },
      ]);
      mockPgPoolQuery.mockResolvedValue({ rows: [] });
      delete process.env.HERITAGE_TPA_AUTH_ID;
      delete process.env.STAR_HEALTH_API_KEY;

      const res = await request(app)
        .get('/api/hospital/insurance/tpa/readiness')
        .set('Authorization', 'Bearer test-token');

      expect(res.status).toBe(200);
      expect(res.body.summary.tpasConfigured).toBe(0);
      expect(res.body.summary.tpasTotal).toBe(1);
      expect(res.body.summary.insurersTotal).toBe(4);
      expect(res.body.providers[0]).toMatchObject({ id: 'heritage', configured: false, envVarsNeeded: ['HERITAGE_TPA_AUTH_ID'] });
      expect(res.body.insurerVolume).toEqual([]);
    });

    it('GET /tpa/readiness reports configured=true once the env var is set', async () => {
      mockGetAvailableProviders.mockReturnValue([
        { id: 'heritage', name: 'Heritage Health TPA', implemented: true, capabilities: {} },
      ]);
      mockPgPoolQuery.mockResolvedValue({ rows: [] });
      process.env.HERITAGE_TPA_AUTH_ID = 'test-value';

      const res = await request(app)
        .get('/api/hospital/insurance/tpa/readiness')
        .set('Authorization', 'Bearer test-token');

      expect(res.body.providers[0].configured).toBe(true);
      expect(res.body.summary.tpasConfigured).toBe(1);
      delete process.env.HERITAGE_TPA_AUTH_ID;
    });

    it('GET /tpa/readiness surfaces real claim-volume ranking from the DB', async () => {
      mockGetAvailableProviders.mockReturnValue([]);
      mockPgPoolQuery.mockResolvedValue({
        rows: [{ id: 10, name: 'Star Health', claim_count: '3', preauth_count: '1', total_count: '4' }],
      });

      const res = await request(app)
        .get('/api/hospital/insurance/tpa/readiness')
        .set('Authorization', 'Bearer test-token');

      expect(res.status).toBe(200);
      expect(res.body.insurerVolume).toEqual([
        { id: 10, name: 'Star Health', claimCount: 3, preAuthCount: 1, totalCount: 4 },
      ]);
    });
  });
});
