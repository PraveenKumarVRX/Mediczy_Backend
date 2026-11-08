/**
 * Mental-health subscore for the patient risk model (MED-MIND-001, gap G-10).
 *
 * `subscores.mental_health` was the literal `7.0` for every patient — identical
 * across all 22 rows of ai_health_risk_scores and all 44,179 rows of his_scores,
 * while being displayed to patients as a "Mental Health" score. The comment at
 * the time said "enhanced when mood tracking available". It now is.
 *
 * Scale: 0–10 where **10 = good mental health** (the same direction as the
 * lifestyle and adherence subscores, and the opposite of the cardiovascular /
 * diabetes / hypertension risk subscores).
 *
 * REGULATORY POSITION. These are pure, deterministic lookups from a published
 * severity band, or a linear transform of the patient's own mood entries. No
 * model, no inference. The containing risk model is already governed
 * (ai-quality-gates + interpretability in ai-health-risk-cron.service.js), and
 * nothing here adds an inference step to it.
 *
 * Returning null is meaningful and expected: it means "no mental-health data for
 * this patient". The caller must then OMIT the subscore rather than substitute a
 * number — inventing one is exactly the defect this file exists to remove.
 */

/**
 * Published severity band -> subscore, one step per band on the inverted scale.
 * Keep these tables aligned with the bands in
 * services/mental-wellness-instruments.service.js.
 */
const BAND_TO_SUBSCORE = Object.freeze({
  PHQ9: Object.freeze({
    minimal: 9,
    mild: 7,
    moderate: 5,
    moderately_severe: 3,
    severe: 1,
  }),
  GAD7: Object.freeze({
    minimal: 9,
    mild: 7,
    moderate: 5,
    severe: 2,
  }),
});

/** Subscore for one instrument result, or null if the pair is not recognised. */
export function subscoreFromBand(instrumentCode, band) {
  const table = BAND_TO_SUBSCORE[String(instrumentCode || '').toUpperCase()];
  if (!table) return null;
  const v = table[String(band || '').toLowerCase()];
  return v === undefined ? null : v;
}

/**
 * Mood diary average (1–5, where 5 is best) -> subscore 0–10.
 * Linear: 1 -> 0, 3 -> 5, 5 -> 10. Used only when no instrument result exists,
 * because a single-item mood rating is a far weaker signal than PHQ-9/GAD-7.
 */
export function subscoreFromMoodAverage(average) {
  // Guard the coercions before Number(): Number(null), Number(''), Number('  ')
  // and Number([]) are all 0, which here would mean the WORST possible mental
  // health. Absent data must return null, never a score.
  if (typeof average !== 'number' && typeof average !== 'string') return null;
  if (typeof average === 'string' && average.trim() === '') return null;
  const avg = Number(average);
  if (!Number.isFinite(avg)) return null;
  const clamped = Math.min(5, Math.max(1, avg));
  return Math.round(((clamped - 1) / 4) * 10 * 10) / 10;
}

/**
 * Combine the available signals into one subscore.
 *
 * Instrument results win over the mood diary, and where both PHQ-9 and GAD-7
 * exist the WORSE (lower) of the two is used: under-stating a depression or
 * anxiety signal is the more harmful error.
 *
 * @param {object} signals
 * @param {Array<{instrumentCode: string, band: string}>} [signals.instrumentResults]
 * @param {number} [signals.moodAverage] mean diary mood 1–5
 * @returns {{value: number, source: string, basis: object}|null} null when there is no data
 */
export function resolveMentalHealthSubscore(signals = {}) {
  const { instrumentResults = [], moodAverage } = signals;

  const scored = instrumentResults
    .map((r) => ({ ...r, value: subscoreFromBand(r.instrumentCode, r.band) }))
    .filter((r) => r.value !== null);

  if (scored.length) {
    const worst = scored.reduce((a, b) => (b.value < a.value ? b : a));
    return {
      value: worst.value,
      source: 'instrument',
      basis: {
        instrumentCode: worst.instrumentCode,
        band: worst.band,
        consideredCount: scored.length,
      },
    };
  }

  const fromMood = subscoreFromMoodAverage(moodAverage);
  if (fromMood !== null) {
    return { value: fromMood, source: 'mood_diary', basis: { moodAverage: Number(moodAverage) } };
  }

  return null;
}

export default { subscoreFromBand, subscoreFromMoodAverage, resolveMentalHealthSubscore };
