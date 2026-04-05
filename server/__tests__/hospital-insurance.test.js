import express from 'express';
import request from 'supertest';
import { jest } from '@jest/globals';

const mockPreAuthorizationCreate = jest.fn();
const mockPreAuthorizationFindAndCountAll = jest.fn();
const mockInsuranceClaimFindAll = jest.fn();
const mockUserFindAll = jest.fn();

jest.unstable_mockModule('../middleware/auth.middleware.js', () => ({
  authUser: (req, _res, next) => {
    req.user = {
      id: 99,
      role: 'hospital',
      type: 'hospital',
      hospitalId: 7,
      organizationId: 17,
    };
    next();
  },
  authUserOptional: (_req, _res, next) => next(),
  authDoctor: (req, _res, next) => {
    req.user = { id: 55, role: 'doctor', type: 'doctor', organizationId: 17 };
    next();
  },
  requireRole: () => (_req, _res, next) => next(),
}));

jest.unstable_mockModule('../models/postgres/preAuthorization.model.postgres.js', () => ({
  default: {
    create: mockPreAuthorizationCreate,
    findAndCountAll: mockPreAuthorizationFindAndCountAll,
    count: jest.fn(),
    findByPk: jest.fn(),
  },
}));

jest.unstable_mockModule('../models/postgres/insuranceClaim.model.postgres.js', () => ({
  default: {
    findAll: mockInsuranceClaimFindAll,
    findByPk: jest.fn(),
    count: jest.fn(),
  },
}));

jest.unstable_mockModule('../models/index.js', () => ({
  User: {
    findAll: mockUserFindAll,
  },
}));

jest.unstable_mockModule('../services/pdf-generator.service.js', () => ({
  default: {
    generateClaimPDF: jest.fn(),
  },
}));

jest.unstable_mockModule('../services/insurance-provider.service.js', () => ({
  default: {
    checkEligibility: jest.fn(),
  },
}));

jest.unstable_mockModule('../services/socket.service.js', () => ({
  default: {
    emitClaimUpdate: jest.fn(),
    emitPreAuthUpdate: jest.fn(),
  },
}));

jest.unstable_mockModule('../services/cache.service.js', () => ({
  default: {
    get: jest.fn(),
    set: jest.fn(),
  },
}));

let app;

const buildPreAuthRecord = (status) => ({
  id: status === 'approved' ? 2 : status === 'rejected' ? 3 : 1,
  preAuthNumber: `PA-${status.toUpperCase()}-001`,
  status,
  policyNumber: 'POL123456',
  estimatedAmount: 125000,
  approvedAmount: status === 'approved' ? 115000 : null,
  diagnosis: 'K35.8 - Acute appendicitis, other',
  admissionDetails: {
    policyNumber: 'POL123456',
    insurerCode: 'star_health',
    insurerName: 'Star Health & Allied Insurance',
    tpaCode: 'medi_assist',
    tpaName: 'Medi Assist India TPA',
    procedure: 'Appendectomy',
  },
  plannedProcedures: [{ code: 'APPY', description: 'Appendectomy' }],
  patient: {
    id: 1,
    firstName: 'Ramesh',
    lastName: 'Kumar',
    email: 'ramesh@example.com',
  },
  insuranceProvider: {
    id: 10,
    name: 'Star Health & Allied Insurance',
  },
});

describe('Hospital Insurance Route Contracts', () => {
  beforeAll(async () => {
    const { default: insuranceRouter } = await import('../routes/hospital-insurance.route.js');
    app = express();
    app.use(express.json());
    app.use('/api/hospital/insurance', insuranceRouter);
  });

  beforeEach(() => {
    jest.clearAllMocks();

    mockPreAuthorizationCreate.mockImplementation(async (payload) => ({
      id: 77,
      preAuthNumber: 'PA20260405ABCD',
      ...payload,
    }));

    mockPreAuthorizationFindAndCountAll.mockImplementation(async ({ where }) => ({
      count: 1,
      rows: [buildPreAuthRecord(where.status)],
    }));

    mockUserFindAll.mockResolvedValue([
      {
        id: 1,
        firstName: 'Ramesh',
        lastName: 'Kumar',
        phoneNumber: '9876543210',
        abhaId: 'ABHA1234',
      },
    ]);

    mockInsuranceClaimFindAll.mockResolvedValue([
      {
        policyNumber: 'POL123456',
        insuranceProvider: 'Star Health & Allied Insurance',
        insuranceProviderId: 10,
        patient: {
          id: 1,
          firstName: 'Ramesh',
          lastName: 'Kumar',
          phoneNumber: '9876543210',
          toJSON() {
            return {
              id: 1,
              firstName: 'Ramesh',
              lastName: 'Kumar',
              phoneNumber: '9876543210',
            };
          },
        },
      },
    ]);
  });

  describe('POST /api/hospital/insurance/pre-auth/new', () => {
    it('creates a pre-auth request from the minimum supported contract', async () => {
      const res = await request(app)
        .post('/api/hospital/insurance/pre-auth/new')
        .set('Authorization', 'Bearer test-token-123')
        .send({
          patientId: 1,
          policyNumber: 'POL123456',
          estimatedAmount: 100000,
          admissionDetails: {
            admissionDate: '2026-04-05',
            procedure: 'Appendectomy',
          },
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(mockPreAuthorizationCreate).toHaveBeenCalledWith(expect.objectContaining({
        patientId: 1,
        hospitalId: 7,
        organizationId: 17,
        policyNumber: 'POL123456',
        estimatedAmount: 100000,
        diagnosis: 'Diagnosis not specified',
        documents: [],
      }));
    });

    it('accepts the richer wizard payload and persists documents and normalized fields', async () => {
      const res = await request(app)
        .post('/api/hospital/insurance/pre-auth/new')
        .set('Authorization', 'Bearer test-token-123')
        .send({
          patientId: 1,
          policyNumber: 'POL987654',
          estimatedAmount: 125000,
          diagnosis: 'K35.8 - Acute appendicitis, other',
          admissionDetails: {
            admissionDate: '2026-04-05',
            admissionType: 'planned',
            procedure: 'Appendectomy',
            insurerCode: 'star_health',
            insurerName: 'Star Health & Allied Insurance',
            tpaCode: 'medi_assist',
            tpaName: 'Medi Assist India TPA',
          },
          plannedProcedures: [{ code: 'APPY', description: 'Appendectomy' }],
          estimatedDuration: 3,
          documents: [{ type: 'consent', label: 'Patient Consent Form', status: 'attached' }],
          remarks: 'Urgent cashless admission',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.preAuth.documents).toEqual([
        expect.objectContaining({ type: 'consent', label: 'Patient Consent Form' }),
      ]);
      expect(mockPreAuthorizationCreate).toHaveBeenCalledWith(expect.objectContaining({
        hospitalId: 7,
        organizationId: 17,
        policyNumber: 'POL987654',
        estimatedDuration: 3,
        remarks: 'Urgent cashless admission',
        admissionDetails: expect.objectContaining({
          policyNumber: 'POL987654',
          insurerCode: 'star_health',
          tpaName: 'Medi Assist India TPA',
        }),
      }));
    });
  });

  describe('GET /api/hospital/insurance/pre-auth/:status', () => {
    it('returns pending pre-auths with pagination', async () => {
      const res = await request(app)
        .get('/api/hospital/insurance/pre-auth/pending')
        .set('Authorization', 'Bearer test-token-123');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.preAuths).toHaveLength(1);
      expect(res.body.preAuths[0]).toMatchObject({
        preAuthNumber: 'PA-PENDING-001',
        status: 'pending',
      });
      expect(res.body.pagination).toMatchObject({ total: 1, page: 1, limit: 20, totalPages: 1 });
    });

    it('returns approved pre-auths', async () => {
      const res = await request(app)
        .get('/api/hospital/insurance/pre-auth/approved')
        .set('Authorization', 'Bearer test-token-123');

      expect(res.status).toBe(200);
      expect(res.body.preAuths[0]).toMatchObject({
        preAuthNumber: 'PA-APPROVED-001',
        status: 'approved',
        approvedAmount: 115000,
      });
    });

    it('returns rejected pre-auths', async () => {
      const res = await request(app)
        .get('/api/hospital/insurance/pre-auth/rejected')
        .set('Authorization', 'Bearer test-token-123');

      expect(res.status).toBe(200);
      expect(res.body.preAuths[0]).toMatchObject({
        preAuthNumber: 'PA-REJECTED-001',
        status: 'rejected',
      });
    });
  });

  describe('POST /api/hospital/insurance/patient/search', () => {
    it('searches patients by mobile and returns patients/results arrays', async () => {
      const res = await request(app)
        .post('/api/hospital/insurance/patient/search')
        .set('Authorization', 'Bearer test-token-123')
        .send({ searchTerm: '9876543210', searchType: 'mobile' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.patients).toHaveLength(1);
      expect(res.body.results).toHaveLength(1);
      expect(mockUserFindAll).toHaveBeenCalledWith({
        where: { phoneNumber: '9876543210' },
        limit: 20,
      });
    });

    it('supports policy search and returns standardized result objects', async () => {
      const res = await request(app)
        .post('/api/hospital/insurance/patient/search')
        .set('Authorization', 'Bearer test-token-123')
        .send({ searchTerm: 'POL123456', searchType: 'policy' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.results).toEqual([
        expect.objectContaining({
          id: 1,
          policyNumber: 'POL123456',
          insurerName: 'Star Health & Allied Insurance',
          insuranceProviderId: 10,
        }),
      ]);
      expect(mockInsuranceClaimFindAll).toHaveBeenCalledWith({
        where: { policyNumber: 'POL123456' },
        include: [expect.objectContaining({ as: 'patient' })],
      });
    });

    it('supports UHID search by mapping the UHID to a numeric patient id', async () => {
      const res = await request(app)
        .post('/api/hospital/insurance/patient/search')
        .set('Authorization', 'Bearer test-token-123')
        .send({ searchTerm: 'UH-00000001', searchType: 'uhid' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockUserFindAll).toHaveBeenCalledWith({
        where: { id: 1 },
        limit: 20,
      });
    });
  });
});
