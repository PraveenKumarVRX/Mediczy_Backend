/**
 * Crisis detection — shared, deterministic, non-diagnostic
 * ========================================================
 * MED-MIND-001 Phase 3.
 *
 * One place for the phrases that mean "this person may be in danger" and for the
 * helpline numbers we show them. Before this module the only such list lived
 * inline in `ai-emergency-triage.service.js` as a single regex, and the client's
 * Mind & Mood page carried its own hardcoded copy of the helplines.
 *
 * WHAT THIS IS NOT
 * ----------------
 * This is a keyword matcher, not a model and not an assessment. It produces no
 * score, no inference and no clinical conclusion — only "these words appeared,
 * here are the numbers to call". That keeps every caller of `detectCrisis()`
 * outside SaMD (CLAUDE.md: deterministic, published, non-diagnostic = Tier A).
 * The moment anything here starts *predicting* risk it becomes Class IIb and
 * needs quality gates, a confidence score, an explanation and a model card.
 *
 * TWO DELIBERATE DESIGN DECISIONS
 * -------------------------------
 * 1. **No figurative-use suppression.** "I'll kill myself if I have to sit
 *    through another review" matches. We do not try to filter it out. The cost
 *    of a false positive is an unwanted panel offering a free helpline; the cost
 *    of a false negative is a life. The asymmetry is not close, so this errs
 *    toward showing help.
 *
 * 2. **Detection never notifies anyone.** A match surfaces resources to the
 *    person who wrote the words, and nothing else: no alert, no email, no row
 *    written, no employer or HR visibility. Someone who learns that typing how
 *    they feel triggers a report will stop typing how they feel — and a mental
 *    health feature that cannot be trusted is worse than none. The one exception
 *    is `TRIAGE_PSYCHIATRIC_RED_FLAG` below, which is consumed by the emergency
 *    triage pathway, where a clinician is already the recipient by design.
 *
 * LIMITATION, STATED PLAINLY
 * --------------------------
 * The patterns are English-primary. A handful of unambiguous Hindi/Marathi
 * transliterations are included, but this detector will miss distress expressed
 * in most of the languages this platform serves. It is a safety net with holes,
 * not a screen. `languageCoverage` on the result says so to every caller.
 */

/**
 * Helplines shown on a match.
 *
 * `verifiedOn` is the date the number was last checked against the operating
 * ministry's own publication — these are re-verified on each release, because a
 * dead number on a crisis panel is worse than no panel.
 *   - Tele-MANAS: MoHFW (NIMHANS Bengaluru apex centre), 14416 / 1800-891-4416.
 *   - KIRAN: Dept. of Empowerment of Persons with Disabilities, MoSJE, launched
 *     08-09-2020 in 13 languages (PIB PRID 1652240).
 */
export const HELPLINES = Object.freeze([
  Object.freeze({
    id: 'telemanas',
    name: 'Tele-MANAS',
    numbers: Object.freeze(['14416', '1800-891-4416']),
    hours: '24x7',
    languages: '20+ Indian languages',
    operator: 'Ministry of Health and Family Welfare (NIMHANS)',
    cost: 'Toll-free',
    verifiedOn: '2026-11-08',
  }),
  Object.freeze({
    id: 'kiran',
    name: 'KIRAN',
    numbers: Object.freeze(['1800-599-0019']),
    hours: '24x7',
    languages: '13 Indian languages',
    operator: 'Ministry of Social Justice and Empowerment',
    cost: 'Toll-free',
    verifiedOn: '2026-11-08',
  }),
  Object.freeze({
    id: 'emergency',
    name: 'Emergency services',
    numbers: Object.freeze(['112']),
    hours: '24x7',
    languages: 'All',
    operator: 'Government of India',
    cost: 'Free',
    verifiedOn: '2026-11-08',
  }),
]);

/**
 * The EXACT regex that `ai-emergency-triage.service.js` has always used for its
 * ESI-2 psychiatric red flag. It is re-exported here unchanged so that service
 * and this module share one definition.
 *
 * ⚠️ DO NOT BROADEN THIS CONSTANT. The triage red-flag set belongs to model card
 * `emergency-triage-esi-v1` — **Class III SaMD (high risk)** — whose
 * changeControlPlan reads: "Changes to red-flag patterns or vital thresholds
 * require medical director sign-off." Widening it would change which patients
 * are triaged ESI-2, which is a clinical threshold change.
 * The broader `CRISIS_PATTERNS` below are used only by non-clinical surfaces
 * (diary, self-report instruments) that offer resources rather than triage.
 * A proposal to align the two is filed via
 * `scripts/propose-triage-crisis-pattern-alignment.mjs`.
 */
export const TRIAGE_PSYCHIATRIC_RED_FLAG = /suicid|self.?harm|want.?to.?die|kill.?myself/i;

/**
 * Patterns for the non-clinical surfaces, in two tiers.
 *
 * `imminent` — words describing intent, a plan, a means or a goodbye.
 * `elevated` — ideation, self-harm, and the hopelessness that precedes both.
 *
 * Both tiers show the same helplines. The tier changes only the wording of the
 * panel (an imminent match leads with "call now"), never who is told.
 */
export const CRISIS_PATTERNS = Object.freeze([
  // ── imminent: intent, plan, means, farewell ──────────────────────────────
  Object.freeze({
    level: 'imminent',
    category: 'intent',
    // "myself" only, never a bare "kill me": in a *health* diary "my back pain
    // is killing me" and "that workout killed me" are everyday phrasings, and a
    // crisis panel on top of a pain entry would teach people to ignore it.
    pattern: /\bkill(ing|ed)?\s+myself\b|\bend(ing)?\s+(my|this)\s+life\b|\btak(e|ing)\s+my\s+(own\s+)?life\b/i,
  }),
  Object.freeze({
    level: 'imminent',
    category: 'intent',
    pattern: /\bwant\s+to\s+die\b|\bwish\s+(i\s+was|i\s+were|to\s+be)\s+dead\b|\bready\s+to\s+die\b/i,
  }),
  Object.freeze({
    level: 'imminent',
    category: 'plan',
    pattern: /\bsuicide\s+(note|plan|attempt)\b|\bplan(ning|ned)?\s+to\s+(die|kill\s+myself|end\s+it)\b|\bdecided\s+to\s+end\s+it\b/i,
  }),
  Object.freeze({
    level: 'imminent',
    category: 'means',
    // "jump off/from" is qualified by a place, so "jumped off the treadmill"
    // and "jump from one topic to another" do not land a crisis panel on a
    // workout entry. The cost is missing an unqualified "I want to jump".
    pattern: /\boverdose\b|\bhang(ing)?\s+myself\b|\bjump(ing|ed)?\s+(off|from)\s+(a|the)?\s*(building|terrace|roof|rooftop|bridge|balcony|window|cliff|flyover|train|platform)\b|\bswallow(ed|ing)?\s+(all|the)\s+(pills|tablets)\b|\bslit\s+my\s+wrist/i,
  }),
  Object.freeze({
    level: 'imminent',
    category: 'farewell',
    // "this is my last" is qualified: in a health diary "this is my last tablet"
    // and "my last dose of the course" are everyday entries.
    pattern: /\bgoodbye\s+(forever|everyone)\b|\bthis\s+is\s+my\s+last\s+(message|note|entry|post|day|night|goodbye)\b|\bwon'?t\s+be\s+here\s+(tomorrow|much\s+longer)\b/i,
  }),
  // Unambiguous Hindi/Marathi transliterations (each literally means suicide /
  // "I will give up my life"). Not exhaustive — see the limitation note above.
  Object.freeze({
    level: 'imminent',
    category: 'intent',
    pattern: /\b(khudkhushi|khudkushi|aatmahatya|atmahatya|atmhatya)\b|\bjaan\s+(de|do)\s*(dunga|doonga|dungi|doongi|dena)\b/i,
  }),

  // ── elevated: ideation, self-harm, hopelessness ──────────────────────────
  Object.freeze({
    level: 'elevated',
    category: 'ideation',
    pattern: /\bsuicid(e|al)\b|\bbetter\s+off\s+dead\b|\bno\s+(reason|point)\s+(to|in)\s+(live|living|going\s+on)\b/i,
  }),
  Object.freeze({
    level: 'elevated',
    category: 'self_harm',
    // Progressive forms and explicit-intent markers only. A bare "I cut myself"
    // or "I hurt myself" is, in a *health* diary, overwhelmingly an accident —
    // shaving, the gym, the stove — and a wellbeing banner on a grazed knee is
    // the kind of mismatch that teaches people to ignore the banner. The cost is
    // missing a terse "cut myself" that was not an accident; "self-harm", the
    // progressive forms and "again / on purpose" still carry it.
    pattern: /\bself.?harm(ing|ed)?\b|\bcutting\s+myself\b|\bhurting\s+myself\b|\bburning\s+myself\b|\b(cut|hurt|burn|burned|burnt)\s+myself\s+(again|on\s+purpose|deliberately|intentionally)\b/i,
  }),
  Object.freeze({
    level: 'elevated',
    category: 'hopelessness',
    pattern: /\bhopeless\b|\bcan'?t\s+(go\s+on|take\s+(it|this)\s+any\s*more|do\s+this\s+any\s*more)\b|\bnothing\s+(matters|left)\b|\bno\s+way\s+out\b/i,
  }),
  Object.freeze({
    level: 'elevated',
    category: 'burden',
    pattern: /\bburden\s+to\s+(everyone|my\s+family|them)\b|\beveryone\s+would\s+be\s+better\s+(off\s+)?without\s+me\b/i,
  }),
]);

/** Shown with every detection. Never phrased as a finding about the person. */
export const SUPPORT_MESSAGE = Object.freeze({
  imminent:
    'It sounds like you may be in danger right now. Please call one of these numbers — they are free, confidential and open 24x7.',
  elevated:
    'Some of what you wrote suggests you may be going through a very hard time. Talking to someone helps, and these lines are free, confidential and open 24x7.',
});

const LANGUAGE_COVERAGE =
  'English-primary, with a small set of Hindi/Marathi transliterations. Distress expressed in other languages will not be detected.';

/**
 * Scan free text for crisis language.
 *
 * Deterministic and side-effect free: no database write, no notification, no
 * logging of the text. Returns resources, never a judgement.
 *
 * @param {...(string|null|undefined)} parts  One or more text fields (title,
 *   description, a note). Non-strings are ignored rather than coerced — see
 *   `mentalHealthSubscore.js` for why coercion in this area is dangerous.
 * @returns {{detected: boolean, level: ('imminent'|'elevated'|null),
 *   categories: string[], helplines: typeof HELPLINES, message: string|null,
 *   languageCoverage: string, isAssessment: false}}
 */
export function detectCrisis(...parts) {
  const text = parts
    .filter((p) => typeof p === 'string')
    .join('\n')
    .trim();

  const result = {
    detected: false,
    level: null,
    categories: [],
    helplines: HELPLINES,
    message: null,
    languageCoverage: LANGUAGE_COVERAGE,
    // Stated on the object so no downstream consumer mistakes this for a score.
    isAssessment: false,
  };

  if (!text) return result;

  const categories = new Set();
  let level = null;

  for (const rule of CRISIS_PATTERNS) {
    if (!rule.pattern.test(text)) continue;
    categories.add(rule.category);
    if (rule.level === 'imminent') level = 'imminent';
    else if (!level) level = 'elevated';
  }

  if (!level) return result;

  result.detected = true;
  result.level = level;
  result.categories = [...categories].sort();
  result.message = SUPPORT_MESSAGE[level];
  return result;
}

/**
 * The shape attached to an API response when a write contained crisis language.
 * Kept separate from `detectCrisis` so routes return a narrow, stable payload
 * and never leak the matched phrases back over the wire.
 */
export function crisisSupportPayload(detection) {
  if (!detection?.detected) return null;
  return {
    level: detection.level,
    message: detection.message,
    helplines: detection.helplines,
    languageCoverage: detection.languageCoverage,
  };
}

export default {
  HELPLINES,
  CRISIS_PATTERNS,
  TRIAGE_PSYCHIATRIC_RED_FLAG,
  SUPPORT_MESSAGE,
  detectCrisis,
  crisisSupportPayload,
};
