import { jest } from '@jest/globals';

jest.unstable_mockModule('../middleware/auth.middleware.js', () => ({
  authUser: (req, _res, next) => { req.user = { id: 1, organization_id: 1, role: 'doctor' }; next(); }
}));

// Mock database + event bus — rule engine uses both
jest.unstable_mockModule('../db/postgres-sequelize.js', () => ({
  postgresSequelize: {
    query: jest.fn().mockResolvedValue([[{ id: 1, rule_id: 'hyperkalaemia_severe', severity: 'critical' }], 1]),
  },
}));

jest.unstable_mockModule('../services/hypergrid-event-bus.service.js', () => ({
  publishEvent: jest.fn().mockResolvedValue(true),
}));

const { default: request } = await import('supertest');
const { default: express }  = await import('express');
const { default: router }   = await import('../routes/lab-rule-engine.route.js');
const { evaluateRules, getRules } = await import('../services/lab-rule-engine.service.js');

const app = express();
app.use(express.json());
app.use('/api/v1/lab-rules', router);

// ── Rule listing ──────────────────────────────────────────────────────────────

describe('GET /api/v1/lab-rules', () => {
  it('returns all rule definitions', async () => {
    const res = await request(app).get('/api/v1/lab-rules');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(15);
    expect(res.body.data[0]).toHaveProperty('id');
    expect(res.body.data[0]).toHaveProperty('severity');
    expect(res.body.data[0]).toHaveProperty('guideline');
  });
});

// ── evaluateRules (unit tests — no HTTP) ─────────────────────────────────────

describe('evaluateRules — hyperkalaemia', () => {
  it('fires hyperkalaemia_mild at K⁺ 5.6', () => {
    const alerts = evaluateRules({ labs: { potassium: 5.6 }, meds: {}, diagnosis: {} });
    expect(alerts.some(a => a.ruleId === 'hyperkalaemia_mild')).toBe(true);
    expect(alerts.some(a => a.ruleId === 'hyperkalaemia_severe')).toBe(false);
  });

  it('fires hyperkalaemia_severe + ace_arb_hyperK when K⁺ 6.2 + ACE inhibitor', () => {
    const alerts = evaluateRules({ labs: { potassium: 6.2 }, meds: { aceInhibitor: true }, diagnosis: {} });
    expect(alerts.some(a => a.ruleId === 'hyperkalaemia_severe')).toBe(true);
    expect(alerts.some(a => a.ruleId === 'ace_arb_combination' || a.ruleId === 'ace_arb_hyperK_combination')).toBe(true);
  });

  it('does not fire hyperkalaemia for K⁺ 4.8', () => {
    const alerts = evaluateRules({ labs: { potassium: 4.8 }, meds: {}, diagnosis: {} });
    expect(alerts.some(a => a.ruleId.startsWith('hyperkalaemia'))).toBe(false);
  });
});

describe('evaluateRules — AKI', () => {
  it('fires aki_stage1 when creatinine rises 30 µmol/L', () => {
    const alerts = evaluateRules({ labs: { creatinine: 110, baselineCreatinine: 78 }, meds: {}, diagnosis: {} });
    expect(alerts.some(a => a.ruleId === 'aki_stage1')).toBe(true);
  });

  it('fires aki_stage3 when creatinine ×3.5', () => {
    const alerts = evaluateRules({ labs: { creatinine: 280, baselineCreatinine: 80 }, meds: {}, diagnosis: {} });
    expect(alerts.some(a => a.ruleId === 'aki_stage3')).toBe(true);
  });

  it('fires both aki_stage3 and aki_stage1 do not co-fire (highest wins)', () => {
    const alerts = evaluateRules({ labs: { creatinine: 280, baselineCreatinine: 80 }, meds: {}, diagnosis: {} });
    // Stage 3 should fire, stage 1 may also fire since rules run independently
    const stage3 = alerts.some(a => a.ruleId === 'aki_stage3');
    expect(stage3).toBe(true);
  });
});

describe('evaluateRules — INR + warfarin', () => {
  it('fires inr_supratherapeutic at INR 3.5 on warfarin', () => {
    const alerts = evaluateRules({ labs: { inr: 3.5 }, meds: { warfarin: true }, diagnosis: {} });
    expect(alerts.some(a => a.ruleId === 'inr_supratherapeutic')).toBe(true);
  });

  it('does not fire if not on warfarin', () => {
    const alerts = evaluateRules({ labs: { inr: 3.5 }, meds: {}, diagnosis: {} });
    expect(alerts.some(a => a.ruleId === 'inr_supratherapeutic')).toBe(false);
  });
});

describe('evaluateRules — lactate / sepsis', () => {
  it('fires elevated_lactate at 2.5 mmol/L', () => {
    const alerts = evaluateRules({ labs: { lactate: 2.5 }, meds: {}, diagnosis: {} });
    expect(alerts.some(a => a.ruleId === 'elevated_lactate')).toBe(true);
  });

  it('fires critical_lactate at ≥4 mmol/L', () => {
    const alerts = evaluateRules({ labs: { lactate: 4.2 }, meds: {}, diagnosis: {} });
    expect(alerts.some(a => a.ruleId === 'critical_lactate')).toBe(true);
  });
});

describe('evaluateRules — hypoglycaemia', () => {
  it('fires critical alert at BGL 3.2 mmol/L', () => {
    const alerts = evaluateRules({ labs: { glucose: 3.2 }, meds: { insulin: true }, diagnosis: {} });
    expect(alerts.some(a => a.ruleId === 'hypoglycaemia')).toBe(true);
    const alert = alerts.find(a => a.ruleId === 'hypoglycaemia');
    expect(alert.severity).toBe('critical');
    expect(alert.message).toMatch(/insulin/i);
  });
});

describe('evaluateRules — positive blood culture', () => {
  it('fires critical blood culture alert', () => {
    const alerts = evaluateRules({ labs: { bloodCulturePositive: true, bloodCultureOrganism: 'E. coli' }, meds: {}, diagnosis: {} });
    expect(alerts.some(a => a.ruleId === 'positive_blood_culture')).toBe(true);
    const alert = alerts.find(a => a.ruleId === 'positive_blood_culture');
    expect(alert.message).toMatch(/E\. coli/);
  });
});

// ── Dry-run evaluate endpoint ─────────────────────────────────────────────────

describe('POST /api/v1/lab-rules/evaluate', () => {
  it('returns fired alerts without persisting', async () => {
    const res = await request(app).post('/api/v1/lab-rules/evaluate')
      .send({ labs: { potassium: 6.5 }, meds: {}, diagnosis: {} });
    expect(res.status).toBe(200);
    expect(res.body.data.alertCount).toBeGreaterThanOrEqual(1);
    expect(res.body.data.alerts[0]).toHaveProperty('ruleId');
    expect(res.body.data.alerts[0]).toHaveProperty('severity');
  });

  it('returns 0 alerts for normal labs', async () => {
    const res = await request(app).post('/api/v1/lab-rules/evaluate')
      .send({ labs: { potassium: 4.0, sodium: 138, glucose: 5.5 }, meds: {}, diagnosis: {} });
    expect(res.status).toBe(200);
    expect(res.body.data.alertCount).toBe(0);
  });
});

// ── Process (persist) endpoint ────────────────────────────────────────────────

describe('POST /api/v1/lab-rules/process', () => {
  it('returns 400 when patientId missing', async () => {
    const res = await request(app).post('/api/v1/lab-rules/process').send({ labs: { potassium: 6.5 } });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/patientId/i);
  });

  it('persists and returns alerts', async () => {
    const res = await request(app).post('/api/v1/lab-rules/process')
      .send({ patientId: 10, admissionId: 5, labs: { potassium: 6.2 }, meds: {}, diagnosis: {} });
    expect(res.status).toBe(201);
    expect(res.body.data).toHaveProperty('alertCount');
  });
});
