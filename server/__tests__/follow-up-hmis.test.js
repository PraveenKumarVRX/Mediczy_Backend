import { jest } from '@jest/globals';

jest.unstable_mockModule('../middleware/auth.middleware.js', () => ({
  authUser: (req, _res, next) => { req.user = { id: 1, organization_id: 1, role: 'doctor' }; next(); }
}));

jest.unstable_mockModule('../services/follow-up-hmis.service.js', () => ({
  scheduleFollowUp:      jest.fn(),
  getFollowUpsByPatient: jest.fn(),
  updateFollowUpStatus:  jest.fn(),
  recordRecoveryCheckin: jest.fn(),
  getCheckinsByPatient:  jest.fn(),
  getActiveAlerts:       jest.fn(),
  acknowledgeAlert:      jest.fn(),
  resolveAlert:          jest.fn(),
  raiseMonitoringAlert:  jest.fn(),
  submitPatientFeedback: jest.fn(),
  recordOutcome:         jest.fn(),
  getOutcomesByPatient:  jest.fn(),
}));

const { default: request } = await import('supertest');
const { default: express }  = await import('express');

const svc = await import('../services/follow-up-hmis.service.js');
const { default: router } = await import('../routes/follow-up-hmis.route.js');

const app = express();
app.use(express.json());
// Dual-mount as in app.js
app.use('/api/v1/follow-up', router);
app.use('/api/v1/recovery', router);

// ── Follow-up scheduling ───────────────────────────────────────────────────────

describe('POST /api/v1/follow-up/schedule', () => {
  it('schedules a follow-up and returns 201', async () => {
    svc.scheduleFollowUp.mockResolvedValueOnce({ id: 1, patient_id: 10, status: 'scheduled' });
    const res = await request(app).post('/api/v1/follow-up/schedule')
      .send({ patientId: 10, followUpDate: '2026-07-01', followUpType: 'outpatient' });
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('scheduled');
  });

  it('returns 400 on validation error', async () => {
    svc.scheduleFollowUp.mockRejectedValueOnce(new Error('date required'));
    const res = await request(app).post('/api/v1/follow-up/schedule').send({});
    expect(res.status).toBe(400);
  });
});

describe('GET /api/v1/follow-up/patient/:patientId', () => {
  it('returns follow-up plans list', async () => {
    svc.getFollowUpsByPatient.mockResolvedValueOnce([
      { id: 1, follow_up_type: 'outpatient' },
      { id: 2, follow_up_type: 'teleconsult' }
    ]);
    const res = await request(app).get('/api/v1/follow-up/patient/10');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
  });
});

// ── Recovery check-in ──────────────────────────────────────────────────────────

describe('POST /api/v1/recovery/check-in', () => {
  it('records check-in with no alert when all normal', async () => {
    svc.recordRecoveryCheckin.mockResolvedValueOnce({
      checkin: { id: 1, pain_score: 2 }, alert: null
    });
    const res = await request(app).post('/api/v1/recovery/check-in')
      .send({ patientId: 10, painScore: 2, fever: false, woundStatus: 'healing', medicationAdherence: true });
    expect(res.status).toBe(201);
    expect(res.body.data.alert).toBeNull();
  });

  it('records check-in and raises auto-alert when pain ≥ 7', async () => {
    svc.recordRecoveryCheckin.mockResolvedValueOnce({
      checkin: { id: 2, pain_score: 8 },
      alert: { id: 1, severity: 'high', message: 'Pain score 8 — intervention recommended' }
    });
    const res = await request(app).post('/api/v1/recovery/check-in')
      .send({ patientId: 10, painScore: 8, fever: false, woundStatus: 'healing', medicationAdherence: true });
    expect(res.status).toBe(201);
    expect(res.body.data.alert).not.toBeNull();
    expect(res.body.data.alert.severity).toBe('high');
  });

  it('raises critical alert for fever + wound infection', async () => {
    svc.recordRecoveryCheckin.mockResolvedValueOnce({
      checkin: { id: 3, pain_score: 5 },
      alert: { id: 2, severity: 'critical', message: 'Fever + wound infection detected' }
    });
    const res = await request(app).post('/api/v1/recovery/check-in')
      .send({ patientId: 10, painScore: 5, fever: true, woundStatus: 'infection', medicationAdherence: true });
    expect(res.status).toBe(201);
    expect(res.body.data.alert.severity).toBe('critical');
  });
});

// ── Alerts ─────────────────────────────────────────────────────────────────────

describe('GET /api/v1/recovery/alerts', () => {
  it('returns active monitoring alerts', async () => {
    svc.getActiveAlerts.mockResolvedValueOnce([
      { id: 1, severity: 'high', acknowledged: false },
      { id: 2, severity: 'medium', acknowledged: false }
    ]);
    const res = await request(app).get('/api/v1/recovery/alerts?patientId=10');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
  });

  it('returns empty when no active alerts', async () => {
    svc.getActiveAlerts.mockResolvedValueOnce([]);
    const res = await request(app).get('/api/v1/recovery/alerts?patientId=10');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
  });
});

describe('PUT /api/v1/recovery/alerts/:alertId/acknowledge', () => {
  it('acknowledges an alert', async () => {
    svc.acknowledgeAlert.mockResolvedValueOnce({ id: 1, acknowledged: true });
    const res = await request(app).put('/api/v1/recovery/alerts/1/acknowledge').send({});
    expect(res.status).toBe(200);
    expect(res.body.data.acknowledged).toBe(true);
  });
});

describe('PUT /api/v1/recovery/alerts/:alertId/resolve', () => {
  it('resolves an alert with notes', async () => {
    svc.resolveAlert.mockResolvedValueOnce({ id: 1, status: 'resolved' });
    const res = await request(app).put('/api/v1/recovery/alerts/1/resolve')
      .send({ notes: 'Patient reviewed and improving' });
    expect(res.status).toBe(200);
  });
});
