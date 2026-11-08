/**
 * MED-MIND-001 — validated mental-wellness screening instruments.
 * Plan: docs/planning/MENTAL_WELLNESS_MODULE_IMPLEMENTATION_PLAN_2026-11-08.md
 *
 * REGULATORY POSITION (Tier A — NOT SaMD). Everything in this file is a pure,
 * deterministic function of the patient's own answers, using each instrument's
 * published scoring table. There is no model, no inference, no personalisation
 * and no I/O. Results are reported as a raw score plus the instrument's own
 * published severity band, always with an explicit non-diagnostic disclaimer,
 * and a clinician remains the clinical actor. Keep it that way: the moment a
 * score is derived from anything other than these answers, the output becomes
 * Class IIb SaMD and must go through ai-quality-gates + interpretability +
 * a model card (see §6 of the plan).
 *
 * LICENSING (plan RK-8). Only instruments that are free to use commercially are
 * implemented. PHQ-9 and GAD-7 were developed by Drs Spitzer, Williams, Kroenke
 * and colleagues with a Pfizer grant and released for use without permission
 * ("no permission required to reproduce, translate, display or distribute").
 * PENDING_LICENCE_REVIEW below lists instruments deliberately NOT implemented
 * until their terms are confirmed in writing — do not add one without that.
 */

// Phase 3: the helplines shown on a crisis-item flag come from the one shared
// list, so the diary, this scorer and the Mind & Mood page can never drift to
// different numbers. HELPLINES is a frozen constant — importing it keeps score()
// pure and I/O-free, which is the basis of the Tier A position above.
import { HELPLINES, SUPPORT_MESSAGE } from '../utils/crisis-detection.js';

/** Instruments intentionally not implemented yet — licence terms unconfirmed. */
export const PENDING_LICENCE_REVIEW = Object.freeze({
  PSS10: 'Perceived Stress Scale (Cohen) — free for academic use; commercial terms unconfirmed',
  ISI: 'Insomnia Severity Index (Morin) — copyrighted, commercially licensed',
  WHO5: 'WHO-5 Well-Being Index — free for non-commercial use; commercial permission required',
  AUDITC: 'AUDIT-C — WHO instrument; confirm the derivative-use terms',
});

const DISCLAIMER =
  'This is a self-report screening score, not a diagnosis. Please discuss the result with a qualified clinician.';

/** Shared 0–3 frequency options used by both PHQ-9 and GAD-7. */
const FREQUENCY_OPTIONS = Object.freeze([
  { value: 0, label: 'Not at all' },
  { value: 1, label: 'Several days' },
  { value: 2, label: 'More than half the days' },
  { value: 3, label: 'Nearly every day' },
]);

const PHQ9 = Object.freeze({
  code: 'PHQ9',
  version: '1.0',
  name: 'PHQ-9',
  fullName: 'Patient Health Questionnaire-9',
  measures: 'depressive symptoms',
  licence: 'Public domain — no permission required to reproduce, translate, display or distribute.',
  recallPeriod: 'Over the last 2 weeks, how often have you been bothered by any of the following problems?',
  options: FREQUENCY_OPTIONS,
  minScore: 0,
  maxScore: 27,
  items: Object.freeze([
    'Little interest or pleasure in doing things',
    'Feeling down, depressed, or hopeless',
    'Trouble falling or staying asleep, or sleeping too much',
    'Feeling tired or having little energy',
    'Poor appetite or overeating',
    'Feeling bad about yourself — or that you are a failure or have let yourself or your family down',
    'Trouble concentrating on things, such as reading the newspaper or watching television',
    'Moving or speaking so slowly that other people could have noticed — or the opposite, being fidgety or restless',
    'Thoughts that you would be better off dead, or of hurting yourself in some way',
  ]),
  // 1-indexed item numbers that trigger the crisis pathway when answered > 0.
  crisisItems: Object.freeze([9]),
  bands: Object.freeze([
    { max: 4, band: 'minimal', interpretation: 'Minimal or no depressive symptoms reported.' },
    { max: 9, band: 'mild', interpretation: 'Mild depressive symptoms reported.' },
    { max: 14, band: 'moderate', interpretation: 'Moderate depressive symptoms reported.' },
    { max: 19, band: 'moderately_severe', interpretation: 'Moderately severe depressive symptoms reported.' },
    { max: 27, band: 'severe', interpretation: 'Severe depressive symptoms reported.' },
  ]),
});

const GAD7 = Object.freeze({
  code: 'GAD7',
  version: '1.0',
  name: 'GAD-7',
  fullName: 'Generalised Anxiety Disorder-7',
  measures: 'anxiety symptoms',
  licence: 'Public domain — no permission required to reproduce, translate, display or distribute.',
  recallPeriod: 'Over the last 2 weeks, how often have you been bothered by the following problems?',
  options: FREQUENCY_OPTIONS,
  minScore: 0,
  maxScore: 21,
  items: Object.freeze([
    'Feeling nervous, anxious, or on edge',
    'Not being able to stop or control worrying',
    'Worrying too much about different things',
    'Trouble relaxing',
    'Being so restless that it is hard to sit still',
    'Becoming easily annoyed or irritable',
    'Feeling afraid as if something awful might happen',
  ]),
  crisisItems: Object.freeze([]),
  bands: Object.freeze([
    { max: 4, band: 'minimal', interpretation: 'Minimal or no anxiety symptoms reported.' },
    { max: 9, band: 'mild', interpretation: 'Mild anxiety symptoms reported.' },
    { max: 14, band: 'moderate', interpretation: 'Moderate anxiety symptoms reported.' },
    { max: 21, band: 'severe', interpretation: 'Severe anxiety symptoms reported.' },
  ]),
});

const INSTRUMENTS = Object.freeze({ PHQ9, GAD7 });

/** Canonicalise user-supplied codes: 'phq-9', 'PHQ_9', 'phq9' -> 'PHQ9'. */
export function normalizeInstrumentCode(raw) {
  if (raw === null || raw === undefined) return null;
  const key = String(raw).toUpperCase().replace(/[^A-Z0-9]/g, '');
  return Object.prototype.hasOwnProperty.call(INSTRUMENTS, key) ? key : null;
}

export function getInstrument(code) {
  const key = normalizeInstrumentCode(code);
  return key ? INSTRUMENTS[key] : null;
}

/** Catalogue for the client: definitions only, no scoring tables. */
export function listInstruments() {
  return Object.values(INSTRUMENTS).map((i) => ({
    code: i.code,
    version: i.version,
    name: i.name,
    fullName: i.fullName,
    measures: i.measures,
    recallPeriod: i.recallPeriod,
    options: i.options,
    items: i.items.map((text, idx) => ({ number: idx + 1, text })),
    minScore: i.minScore,
    maxScore: i.maxScore,
    disclaimer: DISCLAIMER,
  }));
}

class InstrumentAnswerError extends Error {
  constructor(message) {
    super(message);
    this.name = 'InstrumentAnswerError';
    this.statusCode = 400;
  }
}
export { InstrumentAnswerError };

/**
 * Accepts answers as an array ([0,1,3,...]) or as a 1-indexed object
 * ({ "1": 0, "2": 1 }). Every item is required: a partially completed
 * instrument has no valid published score, so we refuse rather than guess.
 */
function coerceAnswers(instrument, answers) {
  const n = instrument.items.length;
  let values;

  if (Array.isArray(answers)) {
    values = answers;
  } else if (answers && typeof answers === 'object') {
    values = Array.from({ length: n }, (_, i) => {
      const v = answers[i + 1] ?? answers[String(i + 1)];
      return v === undefined ? null : v;
    });
  } else {
    throw new InstrumentAnswerError('answers must be an array or a 1-indexed object');
  }

  if (values.length !== n) {
    throw new InstrumentAnswerError(`${instrument.name} needs exactly ${n} answers, received ${values.length}`);
  }

  const allowed = new Set(instrument.options.map((o) => o.value));
  return values.map((v, i) => {
    // Reject '', null, undefined, true, [] and other things Number() would
    // silently coerce to 0 — a fabricated 0 understates a depression score.
    if (typeof v !== 'number' && typeof v !== 'string') {
      throw new InstrumentAnswerError(`answer ${i + 1} is missing`);
    }
    if (typeof v === 'string' && v.trim() === '') {
      throw new InstrumentAnswerError(`answer ${i + 1} is missing`);
    }
    const num = Number(v);
    if (!Number.isInteger(num) || !allowed.has(num)) {
      throw new InstrumentAnswerError(
        `answer ${i + 1} must be one of ${[...allowed].join(', ')} (received ${JSON.stringify(v)})`,
      );
    }
    return num;
  });
}

function resolveBand(instrument, rawScore) {
  for (const b of instrument.bands) {
    if (rawScore <= b.max) return b;
  }
  return instrument.bands[instrument.bands.length - 1];
}

/**
 * Score an instrument. Pure: same answers always yield the same result, with no
 * I/O and no dependence on the patient, the clock or any model.
 *
 * @returns {{instrumentCode, instrumentVersion, rawScore, maxScore, band,
 *   interpretation, flaggedItems, crisis, answers, disclaimer}}
 */
export function score(instrumentCode, answers) {
  const instrument = getInstrument(instrumentCode);
  if (!instrument) {
    const known = Object.keys(INSTRUMENTS).join(', ');
    throw new InstrumentAnswerError(`unknown instrument "${instrumentCode}" (available: ${known})`);
  }

  const values = coerceAnswers(instrument, answers);
  const rawScore = values.reduce((a, b) => a + b, 0);
  const { band, interpretation } = resolveBand(instrument, rawScore);

  const flaggedItems = instrument.crisisItems
    .filter((itemNo) => values[itemNo - 1] > 0)
    .map((itemNo) => `${instrument.code}_Q${itemNo}`);

  const crisis = flaggedItems.length > 0;

  return {
    instrumentCode: instrument.code,
    instrumentVersion: instrument.version,
    rawScore,
    maxScore: instrument.maxScore,
    band,
    interpretation,
    flaggedItems,
    crisis,
    // Phase 3: a flagged crisis item (PHQ-9 Q9 answered above 0) now carries the
    // helplines with it, so no caller has to remember to look them up. Treated
    // as resources, not a finding — it says nothing about the person beyond
    // which item they answered.
    support: crisis
      ? {
          level: 'elevated',
          message: SUPPORT_MESSAGE.elevated,
          helplines: HELPLINES,
        }
      : null,
    answers: values,
    disclaimer: DISCLAIMER,
  };
}

export { DISCLAIMER };

export default {
  listInstruments,
  getInstrument,
  normalizeInstrumentCode,
  score,
  DISCLAIMER,
  PENDING_LICENCE_REVIEW,
  InstrumentAnswerError,
};
