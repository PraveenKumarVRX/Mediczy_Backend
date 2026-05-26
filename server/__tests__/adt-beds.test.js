/**
 * ADT + Bed allocation test suite — B5
 * Covers: admit, transfer, discharge, bed reservation race-condition guard,
 * discharge readiness gate, and cancel-admit.
 */

import express from 'express';
import request from 'supertest';
import { jest } from '@jest/globals';

// ── Auth mock ─────────────────────────────────────────────────────────────────

jest.unstable_mockModule('../middleware/auth.middleware.js', () => ({
  authUser: (req, _res, next) => {
    req.user = { id: 1, role: 'admin', organization_id: 10 };
    next();
  }
}));

// ── ADT service mock ──────────────────────────────────────────────────────────

const mockAdmitPatient           = jest.fn();
const mockTransferPatient        = jest.fn();
const mockDischargePatient       = jest.fn();
const mockCancelAdmit            = jest.fn();
const mockGetAdmission           = jest.fn();
const mockGetActiveAdmissions    = jest.fn();
const mockGetPatientAdtHistory   = jest.fn();
const mockConvertOpToIp          = jest.fn();
const mockConvertErToIp          = jest.fn();
const mockGetDischargeReadiness  = jest.fn();
const mockUpdateReadinessItem    = jest.fn();
const mockInitDischargeReadiness = jest.fn();

jest.unstable_mockModule('../services/adt.service.js', () => ({
  admitPatient:           mockAdmitPatient,
  transferPatient:        mockTransferPatient,
  dischargePatient:       mockDischargePatient,
  cancelAdmit:            mockCancelAdmit,
  getAdmission:           mockGetAdmission,
  getActiveAdmissions:    mockGetActiveAdmissions,
  getPatientAdtHistory:   mockGetPatientAdtHistory,
  convertOpToIp:          mockConvertOpToIp,
  convertErToIp:          mockConvertErToIp,
  getDischargeReadiness:  mockGetDischargeReadiness,
  updateReadinessItem:    mockUpdateReadinessItem,
  initDischargeReadiness: mockInitDischargeReadiness
}));

// ── Bed service mock ──────────────────────────────────────────────────────────

const mockReserveBed            = jest.fn();
const mockReleaseBedReservation = jest.fn();
const mockGetBedCensus          = jest.fn();
const mockGetAvailableBeds      = jest.fn();
const mockUpdateBedStatus       = jest.fn();
const mockAutoAllocateBed       = jest.fn();
const mockGetRealTimeBedMap     = jest.fn();
const mockGetPredictedDischarges = jest.fn();

jest.unstable_mockModule('../services/bed-allocation.service.js', () => ({
  reserveBed:              mockReserveBed,
  releaseBedReservation:   mockReleaseBedReservation,
  getBedCensus:            mockGetBedCensus,
  getAvailableBeds:        mockGetAvailableBeds,
  updateBedStatus:         mockUpdateBedStatus,
  autoAllocateBed:         mockAutoAllocateBed,
  getRealTimeBedMap:       mockGetRealTimeBedMap,
  getPredictedDischarges:  mockGetPredictedDischarges,
  consumeReservation:      jest.fn().mockResolvedValue({ id: 1 }),
  expireStaleReservations: jest.fn().mockResolvedValue(0)
}));

// ── App setup (lazy import after mocks) ──────────────────────────────────────

let app;
beforeAll(async () => {
  const [adtRoute, bedsRoute] = await Promise.all([
    import('../routes/adt.route.js'),
    import('../routes/beds-management.route.js')
  ]);
  app = express();
  app.use(express.json());
  app.use('/api/v1/adt', adtRoute.default);
  app.use('/api/v1/beds', bedsRoute.default);
});

beforeEach(() => jest.clearAllMocks());

// ── ADT: Admit ────────────────────────────────────────────────────────────────

describe('POST /api/v1/adt/admit', () => {
  test('admits patient and returns 201', async () => {
    const admission = { id: 42, admission_number: 'IP-2026-001', status: 'admitted' };
    mockAdmitPatient.mockResolvedValue(admission);

    const res = await request(app).post('/api/v1/adt/admit').send({
      patientId: 5, wardId: 2, bedId: 7, admissionType: 'elective',
      bedReservationToken: 'tok123'
    });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.admission_number).toBe('IP-2026-001');
    expect(mockAdmitPatient).toHaveBeenCalledWith(
      expect.objectContaining({ patientId: 5, organizationId: 10 })
    );
  });

  test('returns 400 when service throws', async () => {
    mockAdmitPatient.mockRejectedValue(new Error('Bed is not reserved'));
    const res = await request(app).post('/api/v1/adt/admit').send({ patientId: 5 });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe('Bed is not reserved');
  });
});

// ── ADT: Transfer ─────────────────────────────────────────────────────────────

describe('POST /api/v1/adt/transfer', () => {
  test('transfers patient successfully', async () => {
    mockTransferPatient.mockResolvedValue({ success: true });
    const res = await request(app).post('/api/v1/adt/transfer').send({ admissionId: 42, toBedId: 9 });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('returns 400 on transfer error', async () => {
    mockTransferPatient.mockRejectedValue(new Error('Bed unavailable'));
    const res = await request(app).post('/api/v1/adt/transfer').send({ admissionId: 42 });
    expect(res.status).toBe(400);
  });
});

// ── ADT: Discharge ────────────────────────────────────────────────────────────

describe('POST /api/v1/adt/discharge', () => {
  test('discharges patient when all criteria met', async () => {
    mockDischargePatient.mockResolvedValue({ success: true, admissionId: 42 });
    const res = await request(app).post('/api/v1/adt/discharge').send({ admissionId: 42 });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('blocks discharge when readiness criteria missing (no override)', async () => {
    mockDischargePatient.mockRejectedValue(new Error('Discharge blocked: billing not cleared'));
    const res = await request(app).post('/api/v1/adt/discharge').send({ admissionId: 42 });
    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/blocked/i);
  });

  test('allows discharge with authorized override', async () => {
    mockDischargePatient.mockResolvedValue({ success: true, overrideApplied: true });
    const res = await request(app).post('/api/v1/adt/discharge').send({
      admissionId: 42,
      override: { reasonCode: 'ADMIN_RELEASE', approverRole: 'medical_director' }
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ── ADT: Discharge readiness ──────────────────────────────────────────────────

describe('GET /api/v1/adt/discharge/readiness/:admissionId', () => {
  test('returns readiness checklist', async () => {
    mockGetDischargeReadiness.mockResolvedValue({
      ready: false,
      mandatoryPending: ['billing'],
      items: [{ dimension: 'billing', is_complete: false }]
    });
    const res = await request(app).get('/api/v1/adt/discharge/readiness/42');
    expect(res.status).toBe(200);
    expect(res.body.data.ready).toBe(false);
    expect(res.body.data.mandatoryPending).toContain('billing');
  });
});

describe('PUT /api/v1/adt/discharge/readiness/:admissionId/:dimension', () => {
  test('marks readiness item complete', async () => {
    mockUpdateReadinessItem.mockResolvedValue({ success: true });
    const res = await request(app)
      .put('/api/v1/adt/discharge/readiness/42/billing')
      .send({ notes: 'Bill settled' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ── ADT: Cancel admit ─────────────────────────────────────────────────────────

describe('POST /api/v1/adt/cancel-admit', () => {
  test('cancels an admission', async () => {
    mockCancelAdmit.mockResolvedValue({ success: true });
    const res = await request(app).post('/api/v1/adt/cancel-admit')
      .send({ admissionId: 42, reason: 'Patient refused' });
    expect(res.status).toBe(200);
  });
});

// ── Beds: Reserve ─────────────────────────────────────────────────────────────

describe('POST /api/v1/beds/reserve', () => {
  test('returns reservation token', async () => {
    mockReserveBed.mockResolvedValue({ token: 'abc123', bedId: 7, expiresAt: new Date() });
    const res = await request(app).post('/api/v1/beds/reserve')
      .send({ bedId: 7, ttlMinutes: 10 });
    expect(res.status).toBe(200);
    expect(res.body.data.token).toBe('abc123');
  });

  test('returns 409 when bed already reserved', async () => {
    mockReserveBed.mockRejectedValue(new Error('Bed 7 is already reserved'));
    const res = await request(app).post('/api/v1/beds/reserve').send({ bedId: 7 });
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/already reserved/i);
  });
});

describe('DELETE /api/v1/beds/reserve/:token', () => {
  test('releases a reservation', async () => {
    mockReleaseBedReservation.mockResolvedValue({ success: true });
    const res = await request(app).delete('/api/v1/beds/reserve/abc123');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ── Beds: Active admissions ───────────────────────────────────────────────────

describe('GET /api/v1/adt/admissions', () => {
  test('returns paginated active admissions', async () => {
    mockGetActiveAdmissions.mockResolvedValue([{ id: 1 }, { id: 2 }]);
    const res = await request(app).get('/api/v1/adt/admissions?wardId=2&limit=10');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
  });
});

describe('GET /api/v1/adt/admission/:id', () => {
  test('returns 404 for missing admission', async () => {
    mockGetAdmission.mockResolvedValue(null);
    const res = await request(app).get('/api/v1/adt/admission/9999');
    expect(res.status).toBe(404);
  });

  test('returns admission when found', async () => {
    mockGetAdmission.mockResolvedValue({ id: 42, status: 'admitted' });
    const res = await request(app).get('/api/v1/adt/admission/42');
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(42);
  });
});
