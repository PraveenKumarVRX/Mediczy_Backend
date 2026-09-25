/**
 * ER guided triage (ESI v4-style decision points) — server-side, authoritative.
 *
 * Audit CLN-04/05. The guided tree used to be four questions with no vital-sign step and no age, and the server
 * marked triage "reviewed" whenever a level was supplied. This adds ESI's Decision Point D (danger-zone vitals for a
 * patient who would otherwise be ESI-3 → consider ESI-2) and makes the nurse's decision explicit and recorded.
 *
 * CLINICAL SIGN-OFF REQUIRED: the thresholds below are the ESI handbook's published danger-zone values as
 * understood by the engineering team. They are decision SUPPORT — a nurse can always decline an up-triage with a
 * recorded reason — and must be approved by the medical director before this is relied on. Roles that may assign or
 * confirm a triage level are configurable: ER_TRIAGE_ROLES (comma-separated).
 */
const parse = (env, fallback) => new Set((process.env[env] || fallback).split(',').map((s) => s.trim()).filter(Boolean));
export const ER_TRIAGE_ROLES = parse('ER_TRIAGE_ROLES', 'nurse,doctor,ms,medical_superintendent,cmo,chief_medical_officer,medical_director,hospital_admin,admin,system_admin,super_admin');

// [max age in years (exclusive), heart-rate ceiling, respiratory-rate ceiling]. SpO2 < 92% is danger-zone at every age.
const DANGER_ZONE = [
  [0.25, 180, 50],      // under 3 months
  [3, 160, 40],         // 3 months – under 3 years
  [8, 140, 30],         // 3 – under 8 years
  [Infinity, 100, 20],  // 8 years and over (adult thresholds)
];
const LIMITS = { heartRate: [20, 300], respiratoryRate: [4, 100], spo2: [30, 100], ageYears: [0, 130] };

const num = (v) => (v === '' || v == null ? null : Number(v));
const invalid = (message) => Object.assign(new Error(message), { status: 400, code: 'INVALID_TRIAGE_INPUT' });

function cleanVitals(raw = {}, ageYearsRaw) {
  const out = { ageYears: num(ageYearsRaw ?? raw.ageYears), heartRate: num(raw.heartRate), respiratoryRate: num(raw.respiratoryRate), spo2: num(raw.spo2) };
  for (const [k, [lo, hi]] of Object.entries(LIMITS)) {
    if (out[k] != null && (!Number.isFinite(out[k]) || out[k] < lo || out[k] > hi)) throw invalid(`${k} must be between ${lo} and ${hi}`);
  }
  return out;
}

/** Danger-zone vitals for the patient's age. Unknown age uses the adult (strictest) thresholds — the safe direction. */
export function dangerZoneVitals(raw, ageYearsRaw) {
  const v = cleanVitals(raw, ageYearsRaw);
  const ageKnown = v.ageYears != null;
  // Unknown age → the LAST band (adult, strictest). `find` on an unknown age would return the first (most permissive) one.
  const [, hrMax, rrMax] = ageKnown ? DANGER_ZONE.find(([maxAge]) => v.ageYears < maxAge) : DANGER_ZONE[DANGER_ZONE.length - 1];
  const reasons = [];
  if (v.heartRate != null && v.heartRate > hrMax) reasons.push(`Heart rate ${v.heartRate} > ${hrMax}`);
  if (v.respiratoryRate != null && v.respiratoryRate > rrMax) reasons.push(`Respiratory rate ${v.respiratoryRate} > ${rrMax}`);
  if (v.spo2 != null && v.spo2 < 92) reasons.push(`SpO2 ${v.spo2}% < 92%`);
  return { inDangerZone: reasons.length > 0, reasons, ageAssumedAdult: !ageKnown, recorded: v };
}

/** The four-question tree. Life threat → 1; high-risk/altered → 2; ≥2 resources → 3; 1 → 4; none → 5. */
export function baseEsi(answers = {}) {
  if (answers.immediateLifeThreat) return 1;
  if (answers.highRiskDistress) return 2;
  if (answers.multipleResources) return 3;
  if (answers.oneResource) return 4;
  return 5;
}

export function assessGuidedTriage(answers, vitals, ageYears) {
  const base = baseEsi(answers);
  const dz = dangerZoneVitals(vitals, ageYears);
  const vitalsRecorded = ['heartRate', 'respiratoryRate', 'spo2'].some((k) => dz.recorded[k] != null);
  const upTriageSuggested = base === 3 && dz.inDangerZone;
  return {
    base, suggestedLevel: upTriageSuggested ? 2 : base, upTriageSuggested,
    reasons: dz.reasons, ageAssumedAdult: dz.ageAssumedAdult,
    // An ESI-3 patient with no vitals at all has not had Decision Point D applied — say so instead of implying it passed.
    vitalsMissingForEsi3: base === 3 && !vitalsRecorded,
    vitals: dz.recorded,
  };
}

/**
 * Validates a guided submission against the server's own assessment. Returns the assessment to store with the visit.
 * Throws {status, code} when the level does not follow from the answers, or when an up-triage suggestion was ignored
 * without a recorded decision.
 */
export function verifyGuidedSubmission({ esiLevel, triageInputs, ageYears }) {
  const inputs = triageInputs || {};
  if (!inputs.answers) return null;                       // not a guided submission (direct ESI / colour)
  const a = assessGuidedTriage(inputs.answers, inputs.vitals, ageYears ?? inputs.ageYears);
  const level = Number(esiLevel);
  if (a.upTriageSuggested) {
    const d = inputs.upTriage || {};
    if (d.decision === 'accepted') {
      if (level !== 2) throw Object.assign(new Error('Up-triage was accepted, so the level must be ESI-2'), { status: 400, code: 'TRIAGE_INCONSISTENT' });
    } else if (d.decision === 'declined') {
      if (String(d.reason || '').trim().length < 3) throw Object.assign(new Error('Declining an up-triage suggestion needs a recorded reason'), { status: 400, code: 'UP_TRIAGE_REASON_REQUIRED' });
      if (level !== a.base) throw Object.assign(new Error(`Up-triage was declined, so the level must be ESI-${a.base}`), { status: 400, code: 'TRIAGE_INCONSISTENT' });
    } else {
      throw Object.assign(new Error('Danger-zone vitals: accept ESI-2 or decline it with a reason before registering'), { status: 409, code: 'UP_TRIAGE_DECISION_REQUIRED', assessment: a });
    }
  } else if (level !== a.base) {
    throw Object.assign(new Error(`ESI-${level} does not follow from the guided answers (ESI-${a.base})`), { status: 400, code: 'TRIAGE_INCONSISTENT' });
  }
  return a;
}

export default { ER_TRIAGE_ROLES, dangerZoneVitals, baseEsi, assessGuidedTriage, verifyGuidedSubmission };
