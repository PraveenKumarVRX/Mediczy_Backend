import { jest } from '@jest/globals';

jest.unstable_mockModule('../middleware/auth.middleware.js', () => ({
  authUser: (req, _res, next) => { req.user = { id: 1, organization_id: 1, role: 'doctor' }; next(); }
}));

const { default: request } = await import('supertest');
const { default: express }  = await import('express');
const { default: router }   = await import('../routes/clinical-scores.route.js');

const app = express();
app.use(express.json());
app.use('/api/v1/scores', router);

// ── List calculators ──────────────────────────────────────────────────────────

describe('GET /api/v1/scores', () => {
  it('returns list of calculator names', async () => {
    const res = await request(app).get('/api/v1/scores');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data).toContain('chadsVasc');
    expect(res.body.data).toContain('sofaScore');
    expect(res.body.data.length).toBeGreaterThanOrEqual(18);
  });
});

// ── CHA₂DS₂-VASc ─────────────────────────────────────────────────────────────

describe('POST /api/v1/scores/chadsVasc', () => {
  it('scores 0 for young healthy male', async () => {
    const res = await request(app).post('/api/v1/scores/chadsVasc').send({ age: 40, female: false });
    expect(res.status).toBe(200);
    expect(res.body.data.score).toBe(0);
    expect(res.body.data.recommendation).toMatch(/no antithrombotic/i);
  });

  it('scores 5 for elderly female with HTN, DM, CHF', async () => {
    const res = await request(app).post('/api/v1/scores/chadsVasc')
      .send({ age: 76, female: true, hypertension: true, diabetes: true, chf: true });
    expect(res.status).toBe(200);
    expect(res.body.data.score).toBe(6); // age≥75=2, female=1, HTN=1, DM=1, CHF=1
    expect(res.body.data.recommendation).toMatch(/oral anticoagulation/i);
  });

  it('prior stroke doubles weight to 2', async () => {
    const res = await request(app).post('/api/v1/scores/chadsVasc').send({ age: 68, female: false, stroke: true });
    expect(res.status).toBe(200);
    expect(res.body.data.score).toBe(3); // age65-74=1 + stroke=2
  });
});

// ── SOFA ─────────────────────────────────────────────────────────────────────

describe('POST /api/v1/scores/sofaScore', () => {
  it('scores 0 with all normal values', async () => {
    const res = await request(app).post('/api/v1/scores/sofaScore')
      .send({ pao2FiO2Ratio: 450, platelets: 200, bilirubinUmolL: 15, map: 75, gcs: 15, creatinineUmolL: 80 });
    expect(res.status).toBe(200);
    expect(res.body.data.score).toBe(0);
    expect(res.body.data.sepsisCriteriaMet).toBe(false);
  });

  it('scores ≥2 with critical values → sepsis criteria met', async () => {
    const res = await request(app).post('/api/v1/scores/sofaScore')
      .send({ pao2FiO2Ratio: 180, onMechanicalVentilation: true, platelets: 80, bilirubinUmolL: 110, map: 60, gcs: 12, creatinineUmolL: 200 });
    expect(res.status).toBe(200);
    expect(res.body.data.score).toBeGreaterThanOrEqual(8);
    expect(res.body.data.sepsisCriteriaMet).toBe(true);
  });
});

// ── qSOFA ─────────────────────────────────────────────────────────────────────

describe('POST /api/v1/scores/qsofa', () => {
  it('score 0 with normal params', async () => {
    const res = await request(app).post('/api/v1/scores/qsofa').send({ respiratoryRate: 16, sbp: 120, alteredMentalStatus: false });
    expect(res.status).toBe(200);
    expect(res.body.data.score).toBe(0);
    expect(res.body.data.highRisk).toBe(false);
  });

  it('high risk when RR≥22 + SBP≤100', async () => {
    const res = await request(app).post('/api/v1/scores/qsofa').send({ respiratoryRate: 24, sbp: 90, alteredMentalStatus: false });
    expect(res.status).toBe(200);
    expect(res.body.data.score).toBe(2);
    expect(res.body.data.highRisk).toBe(true);
  });
});

// ── KDIGO AKI ────────────────────────────────────────────────────────────────

describe('POST /api/v1/scores/kdigoAki', () => {
  it('stage 0 — no AKI', async () => {
    const res = await request(app).post('/api/v1/scores/kdigoAki').send({ baselineCr: 80, currentCr: 90 });
    expect(res.status).toBe(200);
    expect(res.body.data.stage).toBe(0);
  });

  it('stage 1 — creatinine rise ≥26.5 µmol/L', async () => {
    const res = await request(app).post('/api/v1/scores/kdigoAki').send({ baselineCr: 80, currentCr: 110 });
    expect(res.status).toBe(200);
    expect(res.body.data.stage).toBe(1);
  });

  it('stage 3 — creatinine ×3', async () => {
    const res = await request(app).post('/api/v1/scores/kdigoAki').send({ baselineCr: 80, currentCr: 270 });
    expect(res.status).toBe(200);
    expect(res.body.data.stage).toBe(3);
  });
});

// ── CURB-65 ────────────────────────────────────────────────────────────────────

describe('POST /api/v1/scores/curb65', () => {
  it('low risk — score 0', async () => {
    const res = await request(app).post('/api/v1/scores/curb65')
      .send({ confusion: false, urea: 4, respiratoryRate: 18, sbp: 130, dbp: 80, age: 50 });
    expect(res.status).toBe(200);
    expect(res.body.data.score).toBe(0);
    expect(res.body.data.risk).toBe('low');
  });

  it('high risk — score 4', async () => {
    const res = await request(app).post('/api/v1/scores/curb65')
      .send({ confusion: true, urea: 10, respiratoryRate: 32, sbp: 85, age: 70 });
    expect(res.status).toBe(200);
    expect(res.body.data.score).toBe(5); // confusion + urea + RR + SBP + age
    expect(res.body.data.risk).toBe('high');
  });
});

// ── HEART Score ───────────────────────────────────────────────────────────────

describe('POST /api/v1/scores/heartScore', () => {
  it('low risk (0-3)', async () => {
    const res = await request(app).post('/api/v1/scores/heartScore')
      .send({ age: 40, history: 0, ecg: 0, riskFactors: 0, troponin: 0 });
    expect(res.status).toBe(200);
    expect(res.body.data.score).toBe(0);
    expect(res.body.data.risk).toBe('low');
  });

  it('high risk (≥7)', async () => {
    const res = await request(app).post('/api/v1/scores/heartScore')
      .send({ age: 70, history: 2, ecg: 2, riskFactors: 2, troponin: 2 });
    expect(res.status).toBe(200);
    expect(res.body.data.score).toBe(10);
    expect(res.body.data.risk).toBe('high');
  });
});

// ── Wells DVT ─────────────────────────────────────────────────────────────────

describe('POST /api/v1/scores/wellsDvt', () => {
  it('low probability when alternative diagnosis equally likely', async () => {
    const res = await request(app).post('/api/v1/scores/wellsDvt')
      .send({ activeCancer: true, entireLegSwollen: true, alternativeDiagnosisAsLikely: true });
    expect(res.status).toBe(200);
    expect(res.body.data.score).toBe(0);
    expect(res.body.data.probability).toBe('low');
  });

  it('high probability with multiple criteria', async () => {
    const res = await request(app).post('/api/v1/scores/wellsDvt')
      .send({ activeCancer: true, entireLegSwollen: true, calfSwelling3cmMore: true, localizedTendernessDeepVein: true });
    expect(res.status).toBe(200);
    expect(res.body.data.score).toBe(4);
    expect(res.body.data.probability).toBe('high');
  });
});

// ── Child-Pugh ─────────────────────────────────────────────────────────────────

describe('POST /api/v1/scores/childPugh', () => {
  it('Class A — well-compensated cirrhosis', async () => {
    const res = await request(app).post('/api/v1/scores/childPugh')
      .send({ bilirubinUmolL: 20, albuminGl: 38, inr: 1.2, ascites: 'none', encephalopathy: 'none' });
    expect(res.status).toBe(200);
    expect(res.body.data.class).toBe('A');
    expect(res.body.data.score).toBeLessThanOrEqual(6);
  });

  it('Class C — decompensated cirrhosis', async () => {
    const res = await request(app).post('/api/v1/scores/childPugh')
      .send({ bilirubinUmolL: 80, albuminGl: 24, inr: 2.5, ascites: 'moderate', encephalopathy: 'grade3-4' });
    expect(res.status).toBe(200);
    expect(res.body.data.class).toBe('C');
    expect(res.body.data.score).toBeGreaterThanOrEqual(10);
  });
});

// ── PERC Rule ─────────────────────────────────────────────────────────────────

describe('POST /api/v1/scores/percRule', () => {
  it('all 8 criteria met — PE excluded', async () => {
    const res = await request(app).post('/api/v1/scores/percRule')
      .send({ age: 35, heartRate: 88, spo2: 97, unilateralLegSwelling: false, haemoptysis: false, recentTraumaOrSurgery4Weeks: false, previousDvtPe: false, exogenousEstrogen: false });
    expect(res.status).toBe(200);
    expect(res.body.data.peExcluded).toBe(true);
  });

  it('PERC not met when age ≥50', async () => {
    const res = await request(app).post('/api/v1/scores/percRule')
      .send({ age: 55, heartRate: 88, spo2: 97, unilateralLegSwelling: false, haemoptysis: false, recentTraumaOrSurgery4Weeks: false, previousDvtPe: false, exogenousEstrogen: false });
    expect(res.status).toBe(200);
    expect(res.body.data.peExcluded).toBe(false);
  });
});

// ── Unknown calculator ─────────────────────────────────────────────────────────

describe('POST /api/v1/scores/unknownCalc', () => {
  it('returns 400', async () => {
    const res = await request(app).post('/api/v1/scores/unknownCalc').send({});
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/unknown calculator/i);
  });
});
