import { QueryTypes } from 'sequelize';
import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import { publishEvent } from './hypergrid-event-bus.service.js';

const ensureClinicalIntelligenceTables = async () => {
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS clinical_alerts (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL,
      patient_id INTEGER NOT NULL,
      source VARCHAR(80) NOT NULL,
      alert_type VARCHAR(80) NOT NULL,
      severity VARCHAR(24) NOT NULL,
      score INTEGER,
      title VARCHAR(240) NOT NULL,
      message TEXT NOT NULL,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      status VARCHAR(24) NOT NULL DEFAULT 'open',
      acknowledged_by INTEGER,
      acknowledged_at TIMESTAMP,
      resolved_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS clinical_coding_suggestions (
      id SERIAL PRIMARY KEY,
      note_id INTEGER NOT NULL,
      patient_id INTEGER NOT NULL,
      doctor_id INTEGER NOT NULL,
      suggestions JSONB NOT NULL DEFAULT '[]'::jsonb,
      status VARCHAR(24) NOT NULL DEFAULT 'pending_review',
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
};

const normalizeVitals = (vitals = {}) => ({
  systolic: Number(vitals.systolic ?? vitals.bpSystolic ?? vitals.bp?.split?.('/')?.[0] ?? 0) || null,
  diastolic: Number(vitals.diastolic ?? vitals.bpDiastolic ?? vitals.bp?.split?.('/')?.[1] ?? 0) || null,
  temperature: Number(vitals.temperature ?? 0) || null,
  heartRate: Number(vitals.heartRate ?? vitals.hr ?? 0) || null,
  respiratoryRate: Number(vitals.respiratoryRate ?? vitals.rr ?? 0) || null,
  oxygenSaturation: Number(vitals.oxygenSaturation ?? vitals.spo2 ?? 0) || null,
  consciousness: vitals.consciousness || 'alert',
});

const news2Band = (value, bands) => {
  for (const band of bands) {
    if (band.test(value)) return band.score;
  }
  return 0;
};

export const scoreDeterioration = (rawVitals = {}) => {
  const vitals = normalizeVitals(rawVitals);
  const components = {
    respiratoryRate: news2Band(vitals.respiratoryRate, [
      { test: (v) => v !== null && v <= 8, score: 3 },
      { test: (v) => v >= 9 && v <= 11, score: 1 },
      { test: (v) => v >= 21 && v <= 24, score: 2 },
      { test: (v) => v >= 25, score: 3 },
    ]),
    oxygenSaturation: news2Band(vitals.oxygenSaturation, [
      { test: (v) => v !== null && v <= 91, score: 3 },
      { test: (v) => v >= 92 && v <= 93, score: 2 },
      { test: (v) => v >= 94 && v <= 95, score: 1 },
    ]),
    temperature: news2Band(vitals.temperature, [
      { test: (v) => v !== null && v <= 35, score: 3 },
      { test: (v) => v >= 35.1 && v <= 36, score: 1 },
      { test: (v) => v >= 38.1 && v <= 39, score: 1 },
      { test: (v) => v >= 39.1, score: 2 },
    ]),
    systolic: news2Band(vitals.systolic, [
      { test: (v) => v !== null && v <= 90, score: 3 },
      { test: (v) => v >= 91 && v <= 100, score: 2 },
      { test: (v) => v >= 101 && v <= 110, score: 1 },
      { test: (v) => v >= 220, score: 3 },
    ]),
    heartRate: news2Band(vitals.heartRate, [
      { test: (v) => v !== null && v <= 40, score: 3 },
      { test: (v) => v >= 41 && v <= 50, score: 1 },
      { test: (v) => v >= 91 && v <= 110, score: 1 },
      { test: (v) => v >= 111 && v <= 130, score: 2 },
      { test: (v) => v >= 131, score: 3 },
    ]),
    consciousness: vitals.consciousness === 'alert' ? 0 : 3,
  };

  const news2 = Object.values(components).reduce((sum, score) => sum + score, 0);
  const qsofa = [
    vitals.respiratoryRate !== null && vitals.respiratoryRate >= 22,
    vitals.systolic !== null && vitals.systolic <= 100,
    vitals.consciousness !== 'alert',
  ].filter(Boolean).length;
  const singleExtreme = Object.values(components).some((score) => score === 3);

  return {
    vitals,
    news2,
    qsofa,
    singleExtreme,
    alertRequired: news2 >= 5 || qsofa >= 2 || singleExtreme,
    components,
  };
};

export const evaluateVitalsAndAlert = async ({ tenantId, patientId, source = 'vitals', vitals, recordedBy = null }) => {
  await ensureClinicalIntelligenceTables();
  const result = scoreDeterioration(vitals);

  await publishEvent({
    type: 'VitalsObserved',
    source,
    tenantId: String(tenantId),
    patientId: String(patientId),
    payload: { ...result, recordedBy },
  });

  if (!result.alertRequired) return { score: result, alert: null };

  const severity = result.news2 >= 7 || result.qsofa >= 2 ? 'critical' : 'high';
  const title = severity === 'critical' ? 'Critical deterioration risk' : 'Deterioration review required';
  const message = `NEWS2 ${result.news2}; qSOFA ${result.qsofa}. Review patient now and document escalation.`;

  const [alert] = await sequelize.query(
    `INSERT INTO clinical_alerts
      (tenant_id, patient_id, source, alert_type, severity, score, title, message, payload)
     VALUES
      (:tenantId, :patientId, :source, 'deterioration', :severity, :score, :title, :message, :payload::jsonb)
     RETURNING *`,
    {
      replacements: {
        tenantId,
        patientId,
        source,
        severity,
        score: result.news2,
        title,
        message,
        payload: JSON.stringify(result),
      },
      type: QueryTypes.INSERT,
    }
  );

  await publishEvent({
    type: 'ClinicalAlertRaised',
    source,
    tenantId: String(tenantId),
    patientId: String(patientId),
    payload: { alert, score: result },
  });

  return { score: result, alert };
};

const CODE_HINTS = [
  { regex: /\bdiabet(es|ic)\b/i, code: 'E11.9', description: 'Type 2 diabetes mellitus without complications' },
  { regex: /\bhypertension|high blood pressure\b/i, code: 'I10', description: 'Essential (primary) hypertension' },
  { regex: /\bpneumonia\b/i, code: 'J18.9', description: 'Pneumonia, unspecified organism' },
  { regex: /\bchest pain\b/i, code: 'R07.9', description: 'Chest pain, unspecified' },
  { regex: /\bfever\b/i, code: 'R50.9', description: 'Fever, unspecified' },
];

export const createCodingSuggestions = async (note) => {
  await ensureClinicalIntelligenceTables();
  const corpus = [
    note.chiefComplaint,
    note.subjective,
    note.objective,
    note.assessment,
    note.plan,
  ].filter(Boolean).join('\n');

  const suggestions = CODE_HINTS
    .filter((hint) => hint.regex.test(corpus))
    .map(({ code, description }) => ({ code, description, source: 'heuristic', confidence: 0.72 }));

  if (!suggestions.length) return [];

  await sequelize.query(
    `INSERT INTO clinical_coding_suggestions (note_id, patient_id, doctor_id, suggestions)
     VALUES (:noteId, :patientId, :doctorId, :suggestions::jsonb)`,
    {
      replacements: {
        noteId: note.id,
        patientId: note.patientId,
        doctorId: note.doctorId,
        suggestions: JSON.stringify(suggestions),
      },
    }
  );

  await publishEvent({
    type: 'ClinicalCodingSuggested',
    source: 'clinical-note',
    tenantId: 'doctor',
    patientId: String(note.patientId),
    payload: { noteId: note.id, suggestions },
  });

  return suggestions;
};

export { ensureClinicalIntelligenceTables };
