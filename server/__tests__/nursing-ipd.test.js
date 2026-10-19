import { jest } from '@jest/globals';

// Route delegation tests keep the transaction/context wrapper and isolate the DB adapter.
jest.unstable_mockModule('../db/postgres-sequelize.js', () => ({ postgresSequelize: { query: jest.fn(async () => []), transaction: jest.fn(async work => work({ id: 'route-test' })) } }));


jest.unstable_mockModule('../middleware/auth.middleware.js', () => ({
  authUser: (req, _res, next) => { req.user = { id: 1, organization_id: 1, role: 'nurse' }; next(); }
}));

jest.unstable_mockModule('../services/nursing-ipd.service.js', () => ({
  createNursingAssessment:      jest.fn(),
  getAdmissionAssessments:      jest.fn(),
  createNursingTask:            jest.fn(),
  getNursingTaskBoard:          jest.fn(),
  completeNursingTask:          jest.fn(),
  autoGenerateAdmissionTasks:   jest.fn(),
}));

const { default: request } = await import('supertest');
const { default: express }  = await import('express');

const svc = await import('../services/nursing-ipd.service.js');
const { default: router } = await import('../routes/nursing-ipd.route.js');

const app = express();
app.use(express.json());
app.use('/api/v1/nursing', router);

// ── Assessment ─────────────────────────────────────────────────────────────────

describe('POST /api/v1/nursing/assessment', () => {
  it('creates assessment and returns 201', async () => {
    svc.createNursingAssessment.mockResolvedValueOnce({ id: 10, admission_id: 5 });
    const res = await request(app)
      .post('/api/v1/nursing/assessment')
      .set('Idempotency-Key', 'nursing-route-test-001').send({ admissionId: 5, assessmentType: 'admission' });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe(10);
  });

  it('returns 400 on service error', async () => {
    svc.createNursingAssessment.mockRejectedValueOnce(new Error('missing field'));
    const res = await request(app)
      .post('/api/v1/nursing/assessment')
      .set('Idempotency-Key', 'nursing-route-test-001').send({});
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});

describe('GET /api/v1/nursing/assessment/:admissionId', () => {
  it('returns assessment by admission', async () => {
    svc.getAdmissionAssessments.mockResolvedValueOnce({ id: 10, admission_id: 5 });
    const res = await request(app).get('/api/v1/nursing/assessment/5');
    expect(res.status).toBe(200);
    expect(res.body.data.admission_id).toBe(5);
  });

  it('returns 404 if not found', async () => {
    svc.getAdmissionAssessments.mockResolvedValueOnce(null);
    const res = await request(app).get('/api/v1/nursing/assessment/999');
    expect(res.status).toBe(200);
    expect(res.body.data).toBeNull();
  });
});

// ── Tasks ──────────────────────────────────────────────────────────────────────

describe('POST /api/v1/nursing/tasks', () => {
  it('creates task and returns 201', async () => {
    svc.createNursingTask.mockResolvedValueOnce({ id: 20, title: 'Check BP', status: 'pending' });
    const res = await request(app)
      .post('/api/v1/nursing/tasks')
      .set('Idempotency-Key', 'nursing-route-test-001').send({ admissionId: 5, title: 'Check BP', taskType: 'vitals' });
    expect(res.status).toBe(201);
    expect(res.body.data.title).toBe('Check BP');
  });
});

describe('GET /api/v1/nursing/tasks', () => {
  it('returns task list for admission', async () => {
    svc.getNursingTaskBoard.mockResolvedValueOnce([
      { id: 20, status: 'pending' }, { id: 21, status: 'completed' }
    ]);
    const res = await request(app).get('/api/v1/nursing/tasks?admissionId=5');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
  });

  it('returns empty array when no tasks', async () => {
    svc.getNursingTaskBoard.mockResolvedValueOnce([]);
    const res = await request(app).get('/api/v1/nursing/tasks?admissionId=99');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
  });
});

describe('PUT /api/v1/nursing/tasks/:id/complete', () => {
  it('marks task complete', async () => {
    svc.completeNursingTask.mockResolvedValueOnce({ id: 20, status: 'completed' });
    const res = await request(app)
      .put('/api/v1/nursing/tasks/20/complete')
      .set('Idempotency-Key', 'nursing-route-test-001').send({ notes: 'done' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('completed');
  });

  it('returns 400 if task not found', async () => {
    svc.completeNursingTask.mockRejectedValueOnce(new Error('Task not found'));
    const res = await request(app).put('/api/v1/nursing/tasks/999/complete').set('Idempotency-Key', 'nursing-route-test-001').send({});
    expect(res.status).toBe(400);
  });
});

describe('POST /api/v1/nursing/tasks/auto-generate', () => {
  it('auto-generates tasks and returns count', async () => {
    svc.autoGenerateAdmissionTasks.mockResolvedValueOnce([{ id: 30 }, { id: 31 }, { id: 32 }]);
    const res = await request(app)
      .post('/api/v1/nursing/tasks/auto-generate')
      .set('Idempotency-Key', 'nursing-route-test-001').send({ admissionId: 5 });
    expect(res.status).toBe(201);
    expect(res.body.data).toHaveLength(3);
  });
});
