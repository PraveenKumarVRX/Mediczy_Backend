import { jest } from '@jest/globals';

jest.unstable_mockModule('../middleware/auth.middleware.js', () => ({
  authUser: (req, _res, next) => { req.user = { id: 1, organization_id: 1, role: 'staff' }; next(); }
}));

jest.unstable_mockModule('../services/patient-navigation.service.js', () => ({
  recordNavigationEvent: jest.fn(),
  getPatientTimeline:    jest.fn(),
}));

const { default: request } = await import('supertest');
const { default: express }  = await import('express');

const svc = await import('../services/patient-navigation.service.js');
const { default: router } = await import('../routes/patient-navigation.route.js');

const app = express();
app.use(express.json());
app.use('/api/v1/navigation', router);

describe('POST /api/v1/navigation/event', () => {
  it('records event and returns 201', async () => {
    svc.recordNavigationEvent.mockResolvedValueOnce({ id: 1, category: 'admission', patient_id: 42 });
    const res = await request(app)
      .post('/api/v1/navigation/event')
      .send({ patientId: 42, category: 'admission', title: 'Admitted' });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.category).toBe('admission');
  });

  it('returns 400 on service error', async () => {
    svc.recordNavigationEvent.mockRejectedValueOnce(new Error('validation failed'));
    const res = await request(app).post('/api/v1/navigation/event').send({});
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});

describe('GET /api/v1/navigation/patient/:patientId/timeline', () => {
  it('returns merged timeline events', async () => {
    svc.getPatientTimeline.mockResolvedValueOnce({
      events: [
        { id: 1, category: 'admission',     event_at: new Date().toISOString(), source: 'adt' },
        { id: 2, category: 'consultation',  event_at: new Date().toISOString(), source: 'navigation' },
        { id: 3, category: 'lab_result',    event_at: new Date().toISOString(), source: 'navigation' },
      ]
    });
    const res = await request(app).get('/api/v1/navigation/patient/42/timeline');
    expect(res.status).toBe(200);
    expect(res.body.data.events).toHaveLength(3);
    expect(res.body.data.events[0].source).toBe('adt');
  });

  it('returns empty events for unknown patient', async () => {
    svc.getPatientTimeline.mockResolvedValueOnce({ events: [] });
    const res = await request(app).get('/api/v1/navigation/patient/99999/timeline');
    expect(res.status).toBe(200);
    expect(res.body.data.events).toHaveLength(0);
  });

  it('respects limit query param', async () => {
    svc.getPatientTimeline.mockResolvedValueOnce({ events: [] });
    await request(app).get('/api/v1/navigation/patient/42/timeline?limit=10');
    const calls = svc.getPatientTimeline.mock.calls;
    const call = calls[calls.length - 1];
    // Signature: getPatientTimeline(patientId, organizationId, { limit, offset, since })
    expect(call[2]).toMatchObject({ limit: 10 });
  });

  it('returns 500 on service failure', async () => {
    svc.getPatientTimeline.mockRejectedValueOnce(new Error('DB error'));
    const res = await request(app).get('/api/v1/navigation/patient/42/timeline');
    expect(res.status).toBe(500);
  });
});
