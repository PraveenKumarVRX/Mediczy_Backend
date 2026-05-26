/**
 * OT scheduling + safety checklist test suite — B5 / B2
 * Covers: booking, status transitions with checklist hard-stops,
 * override governance, WHO checklist submission, and conflict checks.
 */

import express from 'express';
import request from 'supertest';
import { jest } from '@jest/globals';

// ── Auth mock ─────────────────────────────────────────────────────────────────

jest.unstable_mockModule('../middleware/auth.middleware.js', () => ({
  authUser: (req, _res, next) => {
    req.user = { id: 1, role: 'surgeon', organization_id: 10 };
    next();
  }
}));

// ── OT service mock ───────────────────────────────────────────────────────────

const mockBookOT               = jest.fn();
const mockEmergencyActivateOT  = jest.fn();
const mockUpdateOTStatus       = jest.fn();
const mockSubmitChecklist      = jest.fn();
const mockGetChecklistStatus   = jest.fn();
const mockGetOTSchedule        = jest.fn();
const mockCheckConflicts       = jest.fn();

jest.unstable_mockModule('../services/ot-scheduling.service.js', () => ({
  bookOT:              mockBookOT,
  emergencyActivateOT: mockEmergencyActivateOT,
  updateOTStatus:      mockUpdateOTStatus,
  submitChecklist:     mockSubmitChecklist,
  getChecklistStatus:  mockGetChecklistStatus,
  getOTSchedule:       mockGetOTSchedule,
  checkConflicts:      mockCheckConflicts
}));

// ── Consent enforcement mock ──────────────────────────────────────────────────

jest.unstable_mockModule('../services/consent-enforcement.service.js', () => ({
  enforceOTBookingConsent:  jest.fn().mockResolvedValue({ allowed: true }),
  enforceOTIncisionConsent: jest.fn().mockResolvedValue({ allowed: true })
}));

// ── OT consumables mock ───────────────────────────────────────────────────────

jest.unstable_mockModule('../services/ot-consumables.service.js', () => ({
  scanConsumable:          jest.fn().mockResolvedValue({ id: 1 }),
  getConsumablesByBooking: jest.fn().mockResolvedValue([]),
  recordImplant:           jest.fn().mockResolvedValue({ id: 1 }),
  getImplantsByBooking:    jest.fn().mockResolvedValue([]),
  sendFamilyNotification:  jest.fn().mockResolvedValue({ id: 1 }),
  getFamilyNotifications:  jest.fn().mockResolvedValue([]),
  getOperativeSummary:     jest.fn().mockResolvedValue({})
}));

let app;
beforeAll(async () => {
  const otRoute = await import('../routes/ot-scheduling.route.js');
  app = express();
  app.use(express.json());
  app.use('/api/v1/ot', otRoute.default);
});

beforeEach(() => jest.clearAllMocks());

// ── Booking ───────────────────────────────────────────────────────────────────

describe('POST /api/v1/ot/book', () => {
  test('creates an OT booking', async () => {
    mockBookOT.mockResolvedValue({ id: 11, ot_status: 'scheduled' });
    const res = await request(app).post('/api/v1/ot/book').send({
      patientId: 5, admissionId: 42, procedureName: 'Appendectomy',
      scheduledStart: '2026-06-01T08:00:00Z', roomId: 1
    });
    expect(res.status).toBe(201);
    expect(res.body.data.ot_status).toBe('scheduled');
  });

  test('returns 400 on double-booking conflict', async () => {
    mockBookOT.mockRejectedValue(new Error('OT room conflict'));
    const res = await request(app).post('/api/v1/ot/book').send({ roomId: 1 });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/conflict/i);
  });
});

// ── Status transitions with checklist gates ───────────────────────────────────

describe('PUT /api/v1/ot/:id/status', () => {
  test('advances status to patient_in (no gate)', async () => {
    mockUpdateOTStatus.mockResolvedValue({ success: true });
    const res = await request(app).put('/api/v1/ot/11/status').send({ status: 'patient_in' });
    expect(res.status).toBe(200);
  });

  test('blocks incision when sign_in not completed', async () => {
    const err = new Error('Cannot advance to incision: missing checklist items: sign_in, time_out');
    mockUpdateOTStatus.mockRejectedValue(err);

    const res = await request(app).put('/api/v1/ot/11/status').send({ status: 'incision' });
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/sign_in|time_out/);
  });

  test('blocks completed when sign_out not done', async () => {
    const err = new Error('Cannot advance to completed: missing: sign_out');
    mockUpdateOTStatus.mockRejectedValue(err);

    const res = await request(app).put('/api/v1/ot/11/status').send({ status: 'completed' });
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/sign_out/);
  });

  test('allows incision with valid override from authorized role', async () => {
    mockUpdateOTStatus.mockResolvedValue({ success: true, overrideApplied: true });
    const res = await request(app).put('/api/v1/ot/11/status').send({
      status: 'incision',
      override: { reasonCode: 'EMERGENCY_OVERRIDE', approverRole: 'surgeon' }
    });
    expect(res.status).toBe(200);
    expect(res.body.overrideApplied).toBe(true);
  });

  test('passes override with approverId from req.user', async () => {
    mockUpdateOTStatus.mockResolvedValue({ success: true });
    await request(app).put('/api/v1/ot/11/status').send({
      status: 'incision',
      override: { reasonCode: 'EMERGENCY' }
    });
    expect(mockUpdateOTStatus).toHaveBeenCalledWith(
      10, 11, 'incision',
      expect.objectContaining({
        override: expect.objectContaining({ approverId: 1, approverRole: 'surgeon' })
      })
    );
  });
});

// ── WHO Surgical Safety Checklist ─────────────────────────────────────────────

describe('POST /api/v1/ot/:id/checklist', () => {
  test('submits sign_in checklist', async () => {
    mockSubmitChecklist.mockResolvedValue({ id: 1, checklist_type: 'sign_in', completed: true });
    const res = await request(app).post('/api/v1/ot/11/checklist').send({
      checklistType: 'sign_in',
      items: { patient_identity: true, consent_confirmed: true, site_marked: true, allergies_reviewed: true }
    });
    expect(res.status).toBe(200);
    expect(res.body.data.checklist_type).toBe('sign_in');
  });

  test('submits time_out checklist', async () => {
    mockSubmitChecklist.mockResolvedValue({ id: 2, checklist_type: 'time_out', completed: true });
    const res = await request(app).post('/api/v1/ot/11/checklist').send({
      checklistType: 'time_out',
      items: { team_intro: true, procedure_confirmed: true, antibiotics_given: true }
    });
    expect(res.status).toBe(200);
  });

  test('submits sign_out checklist', async () => {
    mockSubmitChecklist.mockResolvedValue({ id: 3, checklist_type: 'sign_out', completed: true });
    const res = await request(app).post('/api/v1/ot/11/checklist').send({
      checklistType: 'sign_out',
      items: { instruments_counted: true, specimen_labeled: true, recovery_plan: true }
    });
    expect(res.status).toBe(200);
  });

  test('returns 400 when checklist submission fails', async () => {
    mockSubmitChecklist.mockRejectedValue(new Error('Invalid checklist type'));
    const res = await request(app).post('/api/v1/ot/11/checklist').send({ checklistType: 'invalid' });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/v1/ot/:id/checklist-status', () => {
  test('returns completion status of all checklists', async () => {
    mockGetChecklistStatus.mockResolvedValue({
      sign_in: { completed: true }, time_out: { completed: false }, sign_out: { completed: false }
    });
    const res = await request(app).get('/api/v1/ot/11/checklist-status');
    expect(res.status).toBe(200);
    expect(res.body.data.sign_in.completed).toBe(true);
    expect(res.body.data.time_out.completed).toBe(false);
  });
});

// ── Schedule and conflicts ────────────────────────────────────────────────────

describe('GET /api/v1/ot/schedule', () => {
  test('returns OT schedule for a date', async () => {
    mockGetOTSchedule.mockResolvedValue([{ id: 11, procedure_name: 'Appendectomy' }]);
    const res = await request(app).get('/api/v1/ot/schedule?date=2026-06-01&roomId=1');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });
});

describe('GET /api/v1/ot/conflicts', () => {
  test('detects a scheduling conflict', async () => {
    mockCheckConflicts.mockResolvedValue([{ id: 5 }]);
    const res = await request(app)
      .get('/api/v1/ot/conflicts?roomId=1&start=2026-06-01T08:00:00Z&end=2026-06-01T10:00:00Z');
    expect(res.status).toBe(200);
    expect(res.body.hasConflict).toBe(true);
    expect(res.body.count).toBe(1);
  });

  test('reports no conflict for free slot', async () => {
    mockCheckConflicts.mockResolvedValue([]);
    const res = await request(app)
      .get('/api/v1/ot/conflicts?roomId=1&start=2026-06-02T08:00:00Z&end=2026-06-02T10:00:00Z');
    expect(res.body.hasConflict).toBe(false);
  });
});

// ── Emergency activation ──────────────────────────────────────────────────────

describe('POST /api/v1/ot/emergency-activate', () => {
  test('bypasses checklist gates for emergency', async () => {
    mockEmergencyActivateOT.mockResolvedValue({ id: 99, ot_status: 'patient_in', emergency: true });
    const res = await request(app).post('/api/v1/ot/emergency-activate').send({
      patientId: 5, procedureName: 'Emergency Laparotomy', roomId: 1
    });
    expect(res.status).toBe(201);
    expect(res.body.data.emergency).toBe(true);
  });
});
