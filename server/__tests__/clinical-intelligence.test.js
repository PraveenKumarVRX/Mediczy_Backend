process.env.NODE_ENV = 'test';

import { describe, expect, it, jest } from '@jest/globals';

jest.unstable_mockModule('../db/pgPool.js', () => ({
  default: { query: jest.fn().mockResolvedValue({ rows: [] }) },
}));

jest.unstable_mockModule('../services/vitals-ews.service.js', () => ({
  computeNEWS2: (v) => {
    let s = 0;
    if ((v.pulse || 0) > 110) s += 2;
    if ((v.spo2 || 100) < 94) s += 2;
    if ((v.bp_systolic || 120) >= 220 || (v.bp_systolic || 120) <= 90) s += 3;
    if ((v.temperature || 37) >= 39) s += 2;
    if ((v.respiratory_rate || 16) > 24) s += 3;
    return s;
  },
  getActiveAlerts: async () => [],
  getVitalsTrend: async () => [],
  getLatestVitals: async () => null,
  acknowledgeAlert: async () => ({ success: true }),
}));

jest.unstable_mockModule('../services/ai-drug-interaction.service.js', () => ({
  default: {
    checkInteractions: async ({ medications }) => ({
      safe: false,
      severity: 'high',
      summary: 'Interaction detected',
      interactions: [{ drugs: medications.slice(0, 2), severity: 'high', description: 'Test DDI' }],
      confidence: 0.9,
      qualityGate: { passed: true },
      latencyMs: 12,
    }),
  },
}));

jest.unstable_mockModule('../db/postgres-sequelize.js', () => ({
  postgresSequelize: {
    query: jest.fn().mockResolvedValue([]),
  },
}));

jest.unstable_mockModule('../services/hypergrid-event-bus.service.js', () => ({
  publishEvent: jest.fn().mockResolvedValue(undefined),
}));

const {
  analyzeVitalsFindings,
  meanArterialPressure,
  pulsePressure,
  generateEcgSamples,
  buildCareTeamPlan,
  getMonitoringOverview,
  runSmartPharmaCheck,
  scoreDeterioration,
} = await import('../services/clinical-intelligence.service.js');

describe('clinical intelligence CDSS helpers', () => {
  it('keeps Phase-2 NEWS2 / qSOFA deterioration scoring', () => {
    const r = scoreDeterioration({
      heartRate: 140, systolic: 85, diastolic: 50,
      respiratoryRate: 28, temperature: 39.2, oxygenSaturation: 88,
      consciousness: 'confused',
    });
    expect(r.news2).toBeGreaterThanOrEqual(5);
    expect(r.alertRequired).toBe(true);
  });

  it('computes MAP and pulse pressure', () => {
    expect(meanArterialPressure(120, 80)).toBe(93);
    expect(pulsePressure(120, 80)).toBe(40);
  });

  it('flags hypertension, tachypnea, hypoxia, fever', () => {
    const a = analyzeVitalsFindings({
      hr: 118, sbp: 168, dbp: 98, rr: 26, temp: 38.6, spo2: 91,
    });
    const codes = a.findings.map((f) => f.code);
    expect(codes).toEqual(expect.arrayContaining(['hypertension', 'tachypnea', 'hypoxia', 'fever', 'tachycardia']));
    expect(a.riskBand).toMatch(/critical|warning/);
    expect(a.vitals.pulsePressure).toBe(70);
    expect(a.qualityGate.passed).toBe(true);
    expect(a.disclaimer).toMatch(/clinician/i);
  });

  it('generates ECG samples from HR', () => {
    const ecg = generateEcgSamples(90, 60);
    expect(ecg.lead).toBe('II');
    expect(ecg.samples).toHaveLength(60);
    expect(ecg.source).toBe('derived_waveform');
  });

  it('builds nurse + doctor care plans from findings', () => {
    const a = analyzeVitalsFindings({ hr: 140, sbp: 88, dbp: 50, rr: 28, spo2: 88, temp: 39 });
    const plan = buildCareTeamPlan(a, { name: 'Test' });
    expect(plan.nurseTasks.length).toBeGreaterThan(0);
    expect(plan.doctorOrders.length).toBeGreaterThan(0);
  });

  it('overview falls back to demo cohort when census empty', async () => {
    const overview = await getMonitoringOverview(1);
    expect(overview.success).toBe(true);
    expect(overview.dataSource).toBe('demo');
    expect(overview.summary.monitored).toBeGreaterThan(0);
    expect(overview.patients[0].ecg.samples.length).toBeGreaterThan(0);
    expect(overview.integrations.ehr.status).toBe('available');
  });

  it('SmartPharma check returns interactions', async () => {
    const r = await runSmartPharmaCheck({ medications: ['Metoprolol', 'Ramipril'] });
    expect(r.success).toBe(true);
    expect(r.brand).toMatch(/SmartPharma/);
    expect(r.interactions.length).toBeGreaterThan(0);
  });
});
