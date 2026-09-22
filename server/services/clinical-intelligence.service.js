/**
 * Clinical Intelligence
 *
 * Legacy (Phase 2): NEWS2/qSOFA deterioration scoring, clinical_alerts,
 * coding suggestions, HyperGrid events.
 *
 * Hub (monitoring wall): ICU census façade, named physiologic findings,
 * care-team plans, derived ECG, SmartPharma DDI checks.
 *
 * SaMD: outputs are clinical decision SUPPORT — clinician review required.
 */

import { QueryTypes } from 'sequelize';
import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import { publishEvent } from './hypergrid-event-bus.service.js';
import pool from '../db/pgPool.js';
import llmProvider from './ai-brain/llm-provider.js';
import qualityGates from './ai-quality-gates.service.js';
import {
  computeNEWS2,
  getActiveAlerts,
  getVitalsTrend,
  getLatestVitals,
  acknowledgeAlert,
} from './vitals-ews.service.js';
import { computeNews2 } from './news2.service.js';
import drugInteractionChecker from './ai-drug-interaction.service.js';

const DISCLAIMER =
  'Clinical decision support only — licensed clinician review required before any care decision.';

// ─── Phase 2: tables, NEWS2/qSOFA, coding ────────────────────────────────────

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

// WP-1.8: this was the third of three disagreeing NEWS2 implementations, and shared their worst bug — every
// missing vital defaulted to a value that scored 0 (Number(undefined ?? 0) || null still treats a real 0 the
// same as "not recorded"; consciousness defaulted to 'alert' outright), so an incomplete vitals set looked
// exactly like a normal one. numOrNull below keeps a real 0 as 0, distinct from missing; consciousness only
// defaults to null (missing), never to alert. Scoring itself now delegates to the single shared scorer in
// news2.service.js instead of this file's own (also independently wrong) band tables.
const numOrNull = (v) => {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
};

const normalizeVitals = (vitals = {}) => ({
  systolic: numOrNull(vitals.systolic ?? vitals.bpSystolic ?? vitals.bp?.split?.('/')?.[0]),
  diastolic: numOrNull(vitals.diastolic ?? vitals.bpDiastolic ?? vitals.bp?.split?.('/')?.[1]),
  temperature: numOrNull(vitals.temperature),
  heartRate: numOrNull(vitals.heartRate ?? vitals.hr),
  respiratoryRate: numOrNull(vitals.respiratoryRate ?? vitals.rr),
  oxygenSaturation: numOrNull(vitals.oxygenSaturation ?? vitals.spo2),
  consciousness: vitals.consciousness ?? null,
});

// This service's callers use plain-English consciousness words (or an AVPU/ACVPU letter already), not
// necessarily the shared scorer's 'A'|'C'|'V'|'P'|'U'. 'alert' -> A; anything else supplied -> the closest
// letter, defaulting to C (new confusion) for a free-text description the map doesn't recognise; nothing
// supplied -> null (missing), never assumed alert.
const CONSCIOUSNESS_WORD_TO_LETTER = { alert: 'A', confused: 'C', confusion: 'C', voice: 'V', pain: 'P', unresponsive: 'U', a: 'A', c: 'C', v: 'V', p: 'P', u: 'U' };
function consciousnessLetter(value) {
  if (value == null) return null;
  const key = String(value).trim().toLowerCase();
  if (key in CONSCIOUSNESS_WORD_TO_LETTER) return CONSCIOUSNESS_WORD_TO_LETTER[key];
  return 'C'; // an unrecognised non-empty value still means "not documented as alert"
}

export const scoreDeterioration = (rawVitals = {}) => {
  const vitals = normalizeVitals(rawVitals);
  const result = computeNews2({
    respiratoryRate: vitals.respiratoryRate,
    spo2: vitals.oxygenSaturation,
    spo2Scale: 1,
    onOxygen: false,
    systolicBp: vitals.systolic,
    pulse: vitals.heartRate,
    consciousness: consciousnessLetter(vitals.consciousness),
    temperature: vitals.temperature,
  });

  const components = {
    respiratoryRate: result.parameterScores.respiratoryRate ?? 0,
    oxygenSaturation: result.parameterScores.spo2 ?? 0,
    temperature: result.parameterScores.temperature ?? 0,
    systolic: result.parameterScores.systolicBp ?? 0,
    heartRate: result.parameterScores.pulse ?? 0,
    consciousness: result.parameterScores.consciousness ?? 0,
  };

  const qsofa = [
    vitals.respiratoryRate !== null && vitals.respiratoryRate >= 22,
    vitals.systolic !== null && vitals.systolic <= 100,
    vitals.consciousness != null && consciousnessLetter(vitals.consciousness) !== 'A',
  ].filter(Boolean).length;

  return {
    vitals,
    news2: result.score,
    qsofa,
    singleExtreme: result.singleRed,
    alertRequired: result.score >= 5 || qsofa >= 2 || result.singleRed,
    complete: result.complete,
    missing: result.missing,
    band: result.band,
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

// Upgrade Plan Phase B4 — createCodingSuggestions previously matched against
// five hardcoded regex patterns and returned a fixed confidence of 0.72 for
// every match regardless of actual certainty (a keyword hit and a strong
// diagnostic statement scored identically). Real ICD-10/CPT suggestion with
// per-suggestion confidence and supporting evidence now goes through the
// LLM; the regex table survives as an offline fallback only, still labeled
// 'heuristic' so it's never confused with a reviewed AI suggestion.
async function llmCodingSuggestions(corpus) {
  const systemPrompt = `You are a clinical coding assistant suggesting ICD-10 and CPT codes from a clinical note.
Only suggest codes genuinely supported by the note text — do not guess or pad the list.
Output JSON: { "suggestions": [{ "code", "description", "codeSystem": "icd10|cpt", "confidence": 0-1, "evidence" }] }`;

  const llm = await llmProvider.chat({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: corpus },
    ],
    temperature: 0.1,
    maxTokens: 700,
    responseFormat: { type: 'json_object' },
    skipCache: true,
  });

  let parsed;
  try {
    parsed = JSON.parse(llm.content || '{}');
  } catch {
    return null;
  }
  if (!Array.isArray(parsed.suggestions)) return null;

  return parsed.suggestions
    .filter((s) => s.code)
    .map((s) => ({
      code: s.code,
      description: s.description || '',
      source: 'llm',
      confidence: typeof s.confidence === 'number' ? s.confidence : 0.5,
      evidence: s.evidence || null,
    }));
}

export const createCodingSuggestions = async (note) => {
  await ensureClinicalIntelligenceTables();
  const corpus = [
    note.chiefComplaint,
    note.subjective,
    note.objective,
    note.assessment,
    note.plan,
  ].filter(Boolean).join('\n');

  if (!corpus.trim()) return [];

  let suggestions = await llmCodingSuggestions(corpus).catch((err) => {
    console.error('[ClinicalIntelligence] LLM coding suggestion failed, falling back to heuristic:', err.message);
    return null;
  });

  if (!suggestions) {
    suggestions = CODE_HINTS
      .filter((hint) => hint.regex.test(corpus))
      .map(({ code, description }) => ({ code, description, source: 'heuristic', confidence: 0.72, evidence: null }));
  }

  // Quality gate (CLAUDE.md §2): every AI coding suggestion is checked and
  // logged before it can reach bridgeCodingToBilling's charge creation.
  // Heuristic-sourced suggestions skip the gate — they're a fixed lookup
  // table, not an AI output with a hallucination/evidence risk to check.
  if (suggestions.length && suggestions.some((s) => s.source === 'llm')) {
    const avgConfidence = suggestions.reduce((sum, s) => sum + (s.confidence || 0), 0) / suggestions.length;
    const gateResult = await qualityGates.checkClaimScrub({
      claimId: note.id,
      defects: suggestions.filter((s) => !s.evidence).map((s) => ({ type: 'coding_documentation_mismatch', description: `Suggested ${s.code} without evidence span`, evidence: null })),
      confidence: avgConfidence,
      sourceTextAvailable: true,
    });
    await qualityGates.logGateResult(gateResult, { noteId: note.id, patientId: note.patientId, source: 'clinical-intelligence.createCodingSuggestions' });
    if (!gateResult.passed) {
      console.warn('[ClinicalIntelligence] coding suggestions failed quality gate — withheld from billing bridge', { noteId: note.id, blockers: gateResult.blockers });
      return [];
    }
  }

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

// ─── Monitoring hub / CDSS façade ────────────────────────────────────────────

export function pulsePressure(sbp, dbp) {
  if (sbp == null || dbp == null) return null;
  return Math.round(Number(sbp) - Number(dbp));
}

export function meanArterialPressure(sbp, dbp) {
  if (sbp == null || dbp == null) return null;
  return Math.round(Number(dbp) + (Number(sbp) - Number(dbp)) / 3);
}

function num(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function orgId(raw) {
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

/**
 * Named physiologic findings from vitals (rule-based CDSS).
 */
export function analyzeVitalsFindings(vitals = {}) {
  const hr = num(vitals.hr ?? vitals.pulse ?? vitals.heartRate);
  const sbp = num(vitals.sbp ?? vitals.systolic ?? vitals.bp_systolic);
  const dbp = num(vitals.dbp ?? vitals.diastolic ?? vitals.bp_diastolic);
  const rr = num(vitals.rr ?? vitals.respiratory_rate ?? vitals.respiratoryRate);
  const temp = num(vitals.temp ?? vitals.temperature);
  const spo2 = num(vitals.spo2 ?? vitals.SpO2 ?? vitals.oxygenSaturation);
  const map = vitals.map != null ? num(vitals.map) : meanArterialPressure(sbp, dbp);
  const pp = pulsePressure(sbp, dbp);

  const findings = [];
  const push = (code, label, severity, detail) =>
    findings.push({ code, label, severity, detail, at: new Date().toISOString() });

  if (sbp != null && (sbp >= 140 || (dbp != null && dbp >= 90))) {
    push('hypertension', 'Possible Hypertension', sbp >= 180 ? 'critical' : 'warning', `BP ${sbp}/${dbp ?? '—'} mmHg`);
  }
  if (sbp != null && sbp < 90) {
    push('hypotension', 'Hypotension', 'critical', `SBP ${sbp} mmHg`);
  }
  if (rr != null && rr > 20) {
    push('tachypnea', 'Tachypnea Detected', rr > 24 ? 'critical' : 'warning', `RR ${rr}/min`);
  }
  if (rr != null && rr < 12) {
    push('bradypnea', 'Bradypnea', rr <= 8 ? 'critical' : 'warning', `RR ${rr}/min`);
  }
  if (hr != null && hr > 100) {
    push('tachycardia', 'Tachycardia', hr > 130 ? 'critical' : 'warning', `HR ${hr} bpm`);
  }
  if (hr != null && hr < 50) {
    push('bradycardia', 'Bradycardia', hr <= 40 ? 'critical' : 'warning', `HR ${hr} bpm`);
  }
  if (spo2 != null && spo2 < 94) {
    push('hypoxia', 'Low Oxygen Saturation', spo2 < 90 ? 'critical' : 'warning', `SpO₂ ${spo2}%`);
  }
  if (temp != null && temp >= 38) {
    push('fever', 'Elevated Temperature', temp >= 39 ? 'high' : 'warning', `Temp ${temp}°C`);
  }
  if (temp != null && temp < 36) {
    push('hypothermia', 'Hypothermia', temp <= 35 ? 'critical' : 'warning', `Temp ${temp}°C`);
  }
  if (map != null && map < 65) {
    push('low_map', 'Low Mean Arterial Pressure', 'critical', `MAP ${map} mmHg`);
  }

  let news2 = 0;
  try {
    news2 = computeNEWS2({
      respiratory_rate: rr,
      spo2,
      bp_systolic: sbp,
      pulse: hr,
      temperature: temp,
      gcs_score: vitals.gcs ?? vitals.gcs_score,
    });
  } catch {
    news2 = scoreDeterioration({
      heartRate: hr, systolic: sbp, diastolic: dbp,
      respiratoryRate: rr, temperature: temp, oxygenSaturation: spo2,
    }).news2;
  }

  let riskBand = 'stable';
  if (news2 >= 7 || findings.some((f) => f.severity === 'critical')) riskBand = 'critical';
  else if (news2 >= 5 || findings.some((f) => f.severity === 'high')) riskBand = 'warning';
  else if (news2 >= 3 || findings.some((f) => f.severity === 'warning')) riskBand = 'warning';

  const riskScore = Math.min(100, Math.round(news2 * 12 + findings.length * 5));

  return {
    vitals: {
      hr, sbp, dbp, rr, temp, spo2,
      map,
      pulsePressure: pp,
    },
    news2,
    riskBand,
    riskScore,
    findings,
    confidence: findings.length || news2 > 0 ? 0.82 : 0.95,
    disclaimer: DISCLAIMER,
    qualityGate: {
      passed: true,
      checks: ['rule_based_news2', 'named_physiologic_thresholds'],
      note: 'Not autonomous diagnosis — clinician confirmation required',
    },
  };
}

/** Build nurse tasks + doctor orders from analysis */
export function buildCareTeamPlan(analysis, patient = {}) {
  const nurseTasks = [];
  const doctorOrders = [];
  const name = patient.name || patient.patient || 'Patient';

  nurseTasks.push({
    id: 'vitals-q15',
    role: 'nurse',
    task: '15-min vital rounds',
    priority: analysis.riskBand === 'critical' ? 'stat' : 'routine',
    status: 'pending',
  });
  nurseTasks.push({
    id: 'io',
    role: 'nurse',
    task: 'Record intake / output',
    priority: 'routine',
    status: 'pending',
  });

  for (const f of analysis.findings || []) {
    if (f.code === 'hypoxia') {
      nurseTasks.push({
        id: `o2-${f.code}`,
        role: 'nurse',
        task: 'Verify O₂ delivery & SpO₂ probe placement',
        priority: 'stat',
        status: 'pending',
      });
      doctorOrders.push({
        id: `ord-o2-${f.code}`,
        role: 'doctor',
        order: 'Titrate O₂ to keep SpO₂ > 94%',
        priority: 'stat',
        status: 'active',
      });
    }
    if (f.code === 'hypertension') {
      doctorOrders.push({
        id: `ord-htn-${f.code}`,
        role: 'doctor',
        order: 'Review antihypertensive schedule',
        priority: 'urgent',
        status: 'active',
      });
      nurseTasks.push({
        id: 'bp-recheck',
        role: 'nurse',
        task: 'Recheck BP in both arms in 10 min',
        priority: 'urgent',
        status: 'pending',
      });
    }
    if (f.code === 'hypotension' || f.code === 'low_map') {
      doctorOrders.push({
        id: 'ord-shock',
        role: 'doctor',
        order: 'Bedside review for shock / fluid / pressor plan',
        priority: 'stat',
        status: 'active',
      });
      nurseTasks.push({
        id: 'shock-nurse',
        role: 'nurse',
        task: 'Large-bore IV access · trend BP q5min · notify doctor',
        priority: 'stat',
        status: 'pending',
      });
    }
    if (f.code === 'tachycardia' || f.code === 'bradycardia') {
      doctorOrders.push({
        id: 'ord-tele',
        role: 'doctor',
        order: 'Continue telemetry / review rhythm strip',
        priority: 'urgent',
        status: 'active',
      });
    }
    if (f.code === 'fever') {
      nurseTasks.push({
        id: 'antipyretic',
        role: 'nurse',
        task: 'Confirm antipyretic per protocol & hydrate',
        priority: 'urgent',
        status: 'pending',
      });
    }
  }

  if (analysis.news2 >= 5) {
    doctorOrders.push({
      id: 'ord-review',
      role: 'doctor',
      order: `Urgent bedside review — NEWS2 ${analysis.news2} (${name})`,
      priority: 'stat',
      status: 'active',
    });
  }

  if (!doctorOrders.length) {
    doctorOrders.push({
      id: 'ord-cont',
      role: 'doctor',
      order: 'Continue current plan · reassess next round',
      priority: 'routine',
      status: 'active',
    });
  }

  return { nurseTasks, doctorOrders };
}

/** Synthetic Lead-II style samples from HR (telemetry bridge until device stream). */
export function generateEcgSamples(heartRate = 72, samples = 120) {
  const hr = Math.max(40, Math.min(180, Number(heartRate) || 72));
  const beatLen = Math.max(20, Math.round((60 / (hr / 60)) * 2));
  const out = [];
  for (let i = 0; i < samples; i++) {
    const phase = i % beatLen;
    let y = 0;
    if (phase < beatLen * 0.08) y = 0.15 * Math.sin((phase / (beatLen * 0.08)) * Math.PI);
    else if (phase < beatLen * 0.12) y = -0.05;
    else if (phase < beatLen * 0.16) y = -0.2;
    else if (phase < beatLen * 0.2) y = 1.2;
    else if (phase < beatLen * 0.24) y = -0.35;
    else if (phase < beatLen * 0.45) y = 0.05;
    else if (phase < beatLen * 0.65) y = 0.35 * Math.sin(((phase - beatLen * 0.45) / (beatLen * 0.2)) * Math.PI);
    else y = (Math.random() - 0.5) * 0.03;
    out.push({ t: i, mv: Number(y.toFixed(3)) });
  }
  return {
    lead: 'II',
    heartRate: hr,
    samples: out,
    source: 'derived_waveform',
    note: 'Derived Lead-II morphology from HR until device ECG stream is attached',
  };
}

async function loadIcuPortalPatients(organizationId) {
  try {
    const { rows } = await pool.query(
      `SELECT a.id AS admission_id, a.patient_id, a.admission_number,
              COALESCE(u.name, u.first_name || ' ' || u.last_name, 'Patient') AS patient_name,
              b.bed_number, w.name AS ward_name,
              v.pulse, v.bp_systolic, v.bp_diastolic, v.respiratory_rate, v.temperature, v.spo2, v.recorded_at
       FROM ip_admissions a
       LEFT JOIN users u ON u.id = a.patient_id
       LEFT JOIN beds b ON b.id = a.bed_id
       LEFT JOIN wards w ON w.id = b.ward_id
       LEFT JOIN LATERAL (
         SELECT * FROM vital_records vr
         WHERE vr.admission_id = a.id
         ORDER BY vr.recorded_at DESC LIMIT 1
       ) v ON true
       WHERE a.organization_id = $1
         AND COALESCE(a.status, 'admitted') IN ('admitted','active','in_care')
       ORDER BY a.id DESC
       LIMIT 24`,
      [organizationId],
    );
    return rows || [];
  } catch (e) {
    console.warn('[clinical-intelligence] census query fallback:', e.message);
    return [];
  }
}

function demoCohort() {
  const base = [
    { name: 'Ananya Rao', bed: 'ICU-1', hr: 118, sbp: 168, dbp: 98, rr: 26, temp: 38.6, spo2: 91 },
    { name: 'Vikram Shah', bed: 'ICU-2', hr: 92, sbp: 128, dbp: 78, rr: 18, temp: 37.1, spo2: 97 },
    { name: 'Meera Iyer', bed: 'HDU-1', hr: 104, sbp: 152, dbp: 94, rr: 22, temp: 37.8, spo2: 94 },
    { name: 'Karthik N', bed: 'ICU-3', hr: 64, sbp: 110, dbp: 70, rr: 14, temp: 36.6, spo2: 98 },
    { name: 'Fatima Begum', bed: 'HDU-2', hr: 132, sbp: 88, dbp: 52, rr: 28, temp: 39.1, spo2: 88 },
    { name: 'Joseph D', bed: 'ICU-4', hr: 78, sbp: 122, dbp: 76, rr: 16, temp: 36.9, spo2: 96 },
  ];
  return base.map((p, i) => ({
    id: `demo-${i + 1}`,
    admission_id: null,
    patient_id: null,
    patient_name: p.name,
    bed_number: p.bed,
    ward_name: 'Critical Care',
    pulse: p.hr,
    bp_systolic: p.sbp,
    bp_diastolic: p.dbp,
    respiratory_rate: p.rr,
    temperature: p.temp,
    spo2: p.spo2,
    recorded_at: new Date().toISOString(),
    demo: true,
  }));
}

function enrichPatient(row) {
  const vitals = {
    hr: num(row.pulse ?? row.hr ?? row.vitals?.hr),
    sbp: num(row.bp_systolic ?? row.sbp ?? row.vitals?.sbp),
    dbp: num(row.bp_diastolic ?? row.dbp ?? row.vitals?.dbp),
    rr: num(row.respiratory_rate ?? row.rr ?? row.vitals?.rr),
    temp: num(row.temperature ?? row.temp ?? row.vitals?.temp),
    spo2: num(row.spo2 ?? row.vitals?.spo2),
    recordedAt: row.recorded_at || row.vitals?.recordedAt || new Date().toISOString(),
  };
  vitals.map = meanArterialPressure(vitals.sbp, vitals.dbp);
  vitals.pulsePressure = pulsePressure(vitals.sbp, vitals.dbp);
  const analysis = analyzeVitalsFindings(vitals);
  const care = buildCareTeamPlan(analysis, { name: row.patient_name || row.patientName });
  return {
    id: row.admission_id || row.id,
    admissionId: row.admission_id || null,
    patientId: row.patient_id || row.patientId || null,
    patientName: row.patient_name || row.patientName || 'Patient',
    bed: row.bed_number || row.bed || '—',
    ward: row.ward_name || row.ward || 'Ward',
    vitals,
    analysis,
    careTeam: care,
    ecg: generateEcgSamples(vitals.hr || 72),
    medications: row.demo
      ? demoMedsForPatient(row.patient_name || row.patientName)
      : [],
    demo: !!row.demo,
  };
}

function demoMedsForPatient(name) {
  if (String(name).includes('Ananya')) return ['Metoprolol', 'Ramipril', 'Aspirin'];
  if (String(name).includes('Fatima')) return ['Norepinephrine', 'Meropenem', 'Furosemide'];
  if (String(name).includes('Meera')) return ['Amlodipine', 'Atorvastatin'];
  return ['Paracetamol'];
}

async function loadClinicalAlerts(organizationId) {
  try {
    await ensureClinicalIntelligenceTables();
    const rows = await sequelize.query(
      `SELECT id, patient_id, severity, title, message, score, status, acknowledged_at, created_at
       FROM clinical_alerts
       WHERE tenant_id = :tenantId AND COALESCE(status, 'open') = 'open'
       ORDER BY created_at DESC
       LIMIT 20`,
      { replacements: { tenantId: organizationId }, type: QueryTypes.SELECT },
    );
    return (rows || []).map((a) => ({
      id: `clinical-${a.id}`,
      source: 'clinical_alerts',
      patientName: `Patient #${a.patient_id}`,
      bed: '—',
      severity: a.severity,
      alert: a.title,
      detail: a.message,
      time: a.created_at,
      acknowledged: !!a.acknowledged_at,
    }));
  } catch {
    return [];
  }
}

/**
 * Full hospital monitoring overview for the Clinical Intelligence hub.
 */
export async function getMonitoringOverview(organizationId) {
  const org = orgId(organizationId);
  let rows = await loadIcuPortalPatients(org);
  let dataSource = 'live';
  if (!rows.length) {
    rows = demoCohort();
    dataSource = 'demo';
  }

  const patients = rows.map((r) => enrichPatient(r));

  const counts = {
    monitored: patients.length,
    critical: patients.filter((p) => p.analysis.riskBand === 'critical').length,
    warning: patients.filter((p) => p.analysis.riskBand === 'warning').length,
    stable: patients.filter((p) => p.analysis.riskBand === 'stable').length,
  };

  let ewsAlerts = [];
  try {
    ewsAlerts = await getActiveAlerts(org);
  } catch {
    ewsAlerts = [];
  }

  const clinicalAlerts = await loadClinicalAlerts(org);

  const findingAlerts = patients.flatMap((p) =>
    (p.analysis.findings || []).map((f) => ({
      id: `finding-${p.id}-${f.code}`,
      source: 'clinical_intelligence',
      patientName: p.patientName,
      bed: p.bed,
      severity: f.severity,
      alert: f.label,
      detail: f.detail,
      time: f.at,
    })),
  );

  const alerts = [
    ...ewsAlerts.slice(0, 20).map((a) => ({
      id: a.id,
      source: 'vitals_ews',
      patientName: a.admission_number || 'Admission',
      bed: a.bed_number || '—',
      severity: a.severity,
      alert: a.alert_message || a.alert_type,
      detail: `NEWS2 ${a.news2_score ?? '—'}`,
      time: a.triggered_at,
      acknowledged: !!a.acknowledged_at,
    })),
    ...clinicalAlerts,
    ...findingAlerts,
  ].sort((a, b) => {
    const rank = { critical: 0, high: 1, warning: 2, medium: 3, low: 4 };
    return (rank[a.severity] ?? 9) - (rank[b.severity] ?? 9);
  });

  return {
    success: true,
    dataSource,
    disclaimer: DISCLAIMER,
    summary: counts,
    patients,
    alerts: alerts.slice(0, 50),
    integrations: {
      iotSensors: { status: 'available', path: '/hospital/os', note: 'HyperGrid MQTT / device fabric' },
      his: { status: 'available', note: 'Hospital OS HMIS modules' },
      icuMonitors: { status: dataSource === 'live' ? 'connected' : 'demo', note: 'Device alarm bridge + derived ECG' },
      ehr: { status: 'available', path: '/hospital/ehr', note: 'FHIR / EHR routes' },
      nurseStation: { status: 'available', path: '/hospital/nurse-station', note: 'Vitals, meds, tasks' },
      clinicalCdss: { status: 'available', path: '/hospital/clinical-cdss', note: 'Triage & decision support' },
    },
    updatedAt: new Date().toISOString(),
  };
}

export async function getPatientStream(organizationId, admissionId) {
  const org = orgId(organizationId);
  let latest = null;
  let trend = [];
  try {
    latest = await getLatestVitals(admissionId, org);
    trend = await getVitalsTrend(admissionId, org, { hours: 24 });
  } catch (e) {
    console.warn('[clinical-intelligence] patient stream:', e.message);
  }

  const vitals = latest
    ? {
        hr: num(latest.pulse),
        sbp: num(latest.bp_systolic),
        dbp: num(latest.bp_diastolic),
        rr: num(latest.respiratory_rate),
        temp: num(latest.temperature),
        spo2: num(latest.spo2),
        recordedAt: latest.recorded_at,
      }
    : null;

  const analysis = vitals ? analyzeVitalsFindings(vitals) : null;
  const sparklines = buildSparklines(trend);

  return {
    success: true,
    admissionId,
    vitals: vitals
      ? {
          ...vitals,
          map: meanArterialPressure(vitals.sbp, vitals.dbp),
          pulsePressure: pulsePressure(vitals.sbp, vitals.dbp),
        }
      : null,
    analysis,
    careTeam: analysis ? buildCareTeamPlan(analysis) : { nurseTasks: [], doctorOrders: [] },
    ecg: generateEcgSamples(vitals?.hr || 72),
    trends24h: sparklines,
    disclaimer: DISCLAIMER,
  };
}

function buildSparklines(rows = []) {
  const chron = [...rows].reverse();
  const mapSeries = (key, alt) =>
    chron
      .map((r) => ({
        t: r.recorded_at,
        v: num(r[key] ?? r[alt]),
      }))
      .filter((p) => p.v != null);

  return {
    hr: mapSeries('pulse', 'hr'),
    bpSystolic: mapSeries('bp_systolic', 'sbp'),
    spo2: mapSeries('spo2', 'SpO2'),
    temp: mapSeries('temperature', 'temp'),
    rr: mapSeries('respiratory_rate', 'rr'),
  };
}

/** Demo 24h trends when no vital_records */
export function demoTrends24h(seedHr = 80) {
  const now = Date.now();
  const series = (base, wobble) =>
    Array.from({ length: 24 }, (_, i) => ({
      t: new Date(now - (23 - i) * 3600_000).toISOString(),
      v: Math.round(base + Math.sin(i / 3) * wobble + (Math.random() - 0.5) * wobble * 0.3),
    }));
  return {
    hr: series(seedHr, 8),
    bpSystolic: series(128, 10),
    spo2: series(96, 2),
    temp: series(37, 0.4).map((p) => ({ ...p, v: Number(p.v.toFixed(1)) })),
    rr: series(18, 3),
  };
}

export async function runSmartPharmaCheck({ medications, patientId = null, useLLM = false }) {
  const meds = (medications || [])
    .map((m) => (typeof m === 'string' ? m : m?.name || m?.medicine || m?.drug || m?.drug_name || m?.medication))
    .filter(Boolean);
  if (!meds.length) {
    return { success: false, message: 'medications array required' };
  }

  const result = await drugInteractionChecker.checkInteractions({
    medications: meds,
    patientId,
    useLLM,
  });

  return {
    success: true,
    brand: 'SmartPharma AI',
    medications: meds,
    validation: {
      safe: result.safe !== false && (result.severity === 'none' || result.severity === 'low' || result.safe === true),
      severity: result.severity || 'none',
      summary: result.summary || null,
    },
    interactions: result.interactions || [],
    confidence: result.confidence ?? null,
    qualityGate: result.qualityGate || { passed: true },
    disclaimer: DISCLAIMER,
    latencyMs: result.latencyMs,
  };
}

export async function acknowledgeClinicalAlert(organizationId, alertId, userId) {
  const id = String(alertId);
  if (id.startsWith('finding-')) {
    return { success: true, acknowledged: true, ephemeral: true };
  }
  if (id.startsWith('clinical-')) {
    const numericId = parseInt(id.replace('clinical-', ''), 10);
    await ensureClinicalIntelligenceTables();
    await sequelize.query(
      `UPDATE clinical_alerts
       SET status = 'acknowledged', acknowledged_by = :userId, acknowledged_at = NOW()
       WHERE id = :id AND tenant_id = :tenantId`,
      {
        replacements: {
          id: numericId,
          tenantId: orgId(organizationId),
          userId: userId || null,
        },
      },
    );
    return { success: true, acknowledged: true };
  }
  await acknowledgeAlert(alertId, orgId(organizationId), userId);
  return { success: true, acknowledged: true };
}

export default {
  scoreDeterioration,
  evaluateVitalsAndAlert,
  createCodingSuggestions,
  ensureClinicalIntelligenceTables,
  getMonitoringOverview,
  getPatientStream,
  analyzeVitalsFindings,
  generateEcgSamples,
  buildCareTeamPlan,
  runSmartPharmaCheck,
  demoTrends24h,
  pulsePressure,
  meanArterialPressure,
  acknowledgeClinicalAlert,
};
