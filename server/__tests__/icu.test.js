import { jest } from '@jest/globals';

jest.unstable_mockModule('../middleware/auth.middleware.js', () => ({
  authUser: (req, _res, next) => {
    req.user = { id: 1, organization_id: 1, role: 'icu_nurse' }; next();
  }
}));

jest.unstable_mockModule('../services/icu.service.js', () => ({
  admitToICU:           jest.fn(),
  dischargeFromICU:     jest.fn(),
  getActiveICUAdmission: jest.fn(),
  getICUCensus:         jest.fn(),
  getICUSummary:        jest.fn(),
  chartVentilator:      jest.fn(),
  getVentilatorCharts:  jest.fn(),
  recordDrip:           jest.fn(),
  getActiveDrips:       jest.fn(),
  setDailyGoals:        jest.fn(),
  getLatestGoals:       jest.fn(),
  recordSeverityScore:  jest.fn(),
  getScoreHistory:      jest.fn(),
  logICUEvent:          jest.fn(),
  getICUEvents:         jest.fn(),
}));

const { default: request } = await import('supertest');
const { default: express }  = await import('express');

const svc = await import('../services/icu.service.js');
const { default: router } = await import('../routes/icu.route.js');

const app = express();
app.use(express.json());
app.use('/api/v1/icu', router);

// ── Admission ──────────────────────────────────────────────────────────────────

describe('POST /api/v1/icu/admit', () => {
  it('creates ICU admission and returns 201', async () => {
    svc.admitToICU.mockResolvedValueOnce({ id: 5, admission_id: 10, status: 'active' });
    const res = await request(app).post('/api/v1/icu/admit')
      .send({ admissionId: 10, bedId: 2, icuUnit: 'MICU', admittingReason: 'Sepsis' });
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('active');
  });

  it('returns 409 if patient already has active ICU admission', async () => {
    const err = new Error('already admitted'); err.code = '23505';
    svc.admitToICU.mockRejectedValueOnce(err);
    const res = await request(app).post('/api/v1/icu/admit').send({ admissionId: 10 });
    expect(res.status).toBe(409);
  });
});

describe('POST /api/v1/icu/:icuAdmissionId/discharge', () => {
  it('discharges from ICU', async () => {
    svc.dischargeFromICU.mockResolvedValueOnce({ id: 5, status: 'discharged' });
    const res = await request(app).post('/api/v1/icu/5/discharge')
      .send({ dischargeReason: 'Improved' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('discharged');
  });
});

// ── Census ─────────────────────────────────────────────────────────────────────

describe('GET /api/v1/icu/census', () => {
  it('returns all active ICU patients', async () => {
    svc.getICUCensus.mockResolvedValueOnce([
      { id: 5, patient_name: 'Patient A' },
      { id: 6, patient_name: 'Patient B' },
    ]);
    const res = await request(app).get('/api/v1/icu/census');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
  });

  it('returns empty array when ICU is empty', async () => {
    svc.getICUCensus.mockResolvedValueOnce([]);
    const res = await request(app).get('/api/v1/icu/census');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
  });
});

// ── Ventilator ─────────────────────────────────────────────────────────────────

describe('POST /api/v1/icu/:icuAdmissionId/ventilator', () => {
  it('charts ventilator settings', async () => {
    svc.chartVentilator.mockResolvedValueOnce({ id: 1, mode: 'AC/VC', fio2: 40 });
    const res = await request(app).post('/api/v1/icu/5/ventilator')
      .send({ mode: 'AC/VC', fio2: 40, peep: 5, tidalVolume: 500 });
    expect(res.status).toBe(201);
    expect(res.body.data.mode).toBe('AC/VC');
  });
});

describe('GET /api/v1/icu/:icuAdmissionId/ventilator', () => {
  it('returns ventilator chart history', async () => {
    svc.getVentilatorCharts.mockResolvedValueOnce([{ id: 1, mode: 'AC/VC' }]);
    const res = await request(app).get('/api/v1/icu/5/ventilator');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });
});

// ── Drips ──────────────────────────────────────────────────────────────────────

describe('POST /api/v1/icu/:icuAdmissionId/drips', () => {
  it('records a vasoactive drip', async () => {
    svc.recordDrip.mockResolvedValueOnce({ id: 1, drug_name: 'Noradrenaline', rate_ml_hr: 5 });
    const res = await request(app).post('/api/v1/icu/5/drips')
      .send({ drugName: 'Noradrenaline', concentration: '4mg/50ml', rateMlHr: 5 });
    expect(res.status).toBe(201);
    expect(res.body.data.drug_name).toBe('Noradrenaline');
  });
});

// ── Severity scores ────────────────────────────────────────────────────────────

describe('POST /api/v1/icu/:icuAdmissionId/score', () => {
  it('records SOFA score', async () => {
    svc.recordSeverityScore.mockResolvedValueOnce({ id: 1, score_type: 'SOFA', total_score: 8 });
    const res = await request(app).post('/api/v1/icu/5/score')
      .send({ scoreType: 'SOFA', components: { respiratory: 2, coagulation: 1 }, totalScore: 8 });
    expect(res.status).toBe(201);
    expect(res.body.data.total_score).toBe(8);
  });
});

describe('GET /api/v1/icu/:icuAdmissionId/score', () => {
  it('returns score history', async () => {
    svc.getScoreHistory.mockResolvedValueOnce([{ id: 1, score_type: 'SOFA', total_score: 8 }]);
    const res = await request(app).get('/api/v1/icu/5/score');
    expect(res.status).toBe(200);
    expect(res.body.data[0].score_type).toBe('SOFA');
  });
});

// ── Daily goals ────────────────────────────────────────────────────────────────

describe('POST /api/v1/icu/:icuAdmissionId/goals', () => {
  it('sets daily goals', async () => {
    svc.setDailyGoals.mockResolvedValueOnce({ id: 1, sedation_goal: 'RASS -2' });
    const res = await request(app).post('/api/v1/icu/5/goals')
      .send({ sedationGoal: 'RASS -2', fluidGoal: 'Neutral', ventGoal: 'Wean FiO2' });
    expect(res.status).toBe(201);
  });
});

// ── Events ─────────────────────────────────────────────────────────────────────

describe('POST /api/v1/icu/:icuAdmissionId/events', () => {
  it('logs an ICU event', async () => {
    svc.logICUEvent.mockResolvedValueOnce({ id: 1, event_type: 'procedure' });
    const res = await request(app).post('/api/v1/icu/5/events')
      .send({ eventType: 'procedure', description: 'CVC insertion', severity: 'medium' });
    expect(res.status).toBe(201);
    expect(res.body.data.event_type).toBe('procedure');
  });
});
