process.env.NODE_ENV = 'test';

import { describe, expect, it } from '@jest/globals';
import {
  detectCrisis,
  crisisSupportPayload,
  HELPLINES,
  CRISIS_PATTERNS,
  TRIAGE_PSYCHIATRIC_RED_FLAG,
} from '../utils/crisis-detection.js';

describe('crisis detection — imminent tier', () => {
  const imminent = [
    'I want to kill myself',
    'I am going to end my life tonight',
    'thinking about taking my own life',
    'I just want to die',
    'I wish I was dead',
    'I have a suicide plan',
    'I wrote a suicide note',
    'I decided to end it',
    'I am going to overdose on my tablets',
    'I will hang myself',
    'thinking of jumping off the terrace',
    'goodbye forever everyone',
    'this is my last message',
    'khudkhushi kar lunga',
    'aatmahatya ke bare me soch raha hu',
    'main jaan de dunga',
  ];

  it.each(imminent)('flags %p as imminent', (text) => {
    const r = detectCrisis(text);
    expect(r.detected).toBe(true);
    expect(r.level).toBe('imminent');
    expect(r.message).toMatch(/danger/i);
  });
});

describe('crisis detection — elevated tier', () => {
  const elevated = [
    'I have been having suicidal thoughts',
    'everyone would be better off without me',
    'I feel like a burden to my family',
    'I have been cutting myself again',
    'I keep hurting myself when it gets bad',
    'I cut myself on purpose last night',
    'self-harmed again this week',
    'there is no reason to live',
    'I feel completely hopeless',
    "I can't go on like this",
    'nothing matters any more',
    'I see no way out',
  ];

  it.each(elevated)('flags %p as elevated', (text) => {
    const r = detectCrisis(text);
    expect(r.detected).toBe(true);
    expect(r.level).toBe('elevated');
  });

  it('escalates to imminent when both tiers match', () => {
    const r = detectCrisis('I feel hopeless and I want to kill myself');
    expect(r.level).toBe('imminent');
    expect(r.categories.length).toBeGreaterThan(1);
  });
});

describe('crisis detection — what must NOT match', () => {
  // Ordinary clinical and diary text. A false positive here would put a crisis
  // panel in front of someone logging a headache, which erodes trust in the
  // panel for the people who need it.
  const benign = [
    'Headache since morning, took paracetamol',
    'BP 130/85, slightly high today',
    'Slept 7 hours, woke once',
    'Feeling low today but went for a walk',
    'My knee pain is killing me',
    'That workout killed me',
    'Dead tired after the night shift',
    'I am dying for a cup of coffee',
    'Mood was good, had lunch with friends',
    'Doctor cut my dosage in half',
    'Hopes are high for the new medication',
    // Minor-injury and medication entries, the diary's bread and butter.
    'I cut myself shaving this morning',
    'Hurt myself lifting at the gym',
    'Burned myself on the stove while cooking',
    'This is my last tablet of the course',
    'Took my last dose today',
    'Jumped off the treadmill when my knee twinged',
    '',
    '   ',
  ];

  it.each(benign)('does not flag %p', (text) => {
    expect(detectCrisis(text).detected).toBe(false);
  });

  it('accepts a deliberate miss on "killing me" to protect the pain diary', () => {
    // The intent pattern requires "myself". A bare "kill me" is left unmatched
    // on purpose: in a health diary "my back pain is killing me" is routine, and
    // a crisis panel on a pain entry would train people to dismiss the panel.
    // The cost is that "I want someone to kill me" is missed here — it is still
    // caught by the ideation and hopelessness patterns in most real phrasings.
    expect(detectCrisis('my knee pain is killing me').detected).toBe(false);
    expect(detectCrisis('that workout killed me').detected).toBe(false);
    expect(detectCrisis('I want to kill myself').detected).toBe(true);
  });
});

describe('crisis detection — input handling', () => {
  it('ignores non-string parts rather than coercing them', () => {
    // Number(null) === 0 and String(null) === 'null': coercion in this area is
    // how a scoring bug shipped once already. Non-strings are dropped.
    expect(detectCrisis(null, undefined, 42, {}, []).detected).toBe(false);
    expect(detectCrisis(null, 'I want to die', undefined).detected).toBe(true);
  });

  it('joins multiple fields so a phrase split across title and body still matches', () => {
    expect(detectCrisis('Feeling low', 'I keep thinking I want to die').detected).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(detectCrisis('I WANT TO KILL MYSELF').level).toBe('imminent');
  });

  it('is side-effect free and repeatable (no lastIndex leakage between calls)', () => {
    const text = 'I have suicidal thoughts';
    const a = detectCrisis(text);
    const b = detectCrisis(text);
    const c = detectCrisis(text);
    expect(a).toEqual(b);
    expect(b).toEqual(c);
    expect(a.detected).toBe(true);
  });

  it('never carries a global flag on any pattern', () => {
    // A /g regex shared across modules keeps lastIndex and would skip matches
    // on alternate calls — the classic silent failure for a shared matcher.
    for (const rule of CRISIS_PATTERNS) {
      expect(rule.pattern.global).toBe(false);
    }
    expect(TRIAGE_PSYCHIATRIC_RED_FLAG.global).toBe(false);
  });
});

describe('crisis detection — result contract', () => {
  it('declares itself not an assessment', () => {
    expect(detectCrisis('I want to die').isAssessment).toBe(false);
  });

  it('states its language limitation on every result', () => {
    expect(detectCrisis('nothing').languageCoverage).toMatch(/English/);
    expect(detectCrisis('I want to die').languageCoverage).toMatch(/other languages/i);
  });

  it('returns sorted, de-duplicated categories', () => {
    const r = detectCrisis('I want to die and I have a suicide plan and I will overdose');
    expect(r.categories).toEqual([...new Set(r.categories)].sort());
  });

  it('carries no matched phrases back to the caller', () => {
    // The payload must not echo the person's words; it is resources only.
    const payload = crisisSupportPayload(detectCrisis('I want to kill myself'));
    expect(JSON.stringify(payload)).not.toMatch(/kill myself/i);
  });

  it('crisisSupportPayload returns null when nothing was detected', () => {
    expect(crisisSupportPayload(detectCrisis('slept well'))).toBeNull();
    expect(crisisSupportPayload(null)).toBeNull();
    expect(crisisSupportPayload(undefined)).toBeNull();
  });
});

describe('helplines', () => {
  it('includes Tele-MANAS, KIRAN and emergency services', () => {
    const ids = HELPLINES.map((h) => h.id);
    expect(ids).toEqual(expect.arrayContaining(['telemanas', 'kiran', 'emergency']));
  });

  it('carries the verified numbers', () => {
    const byId = Object.fromEntries(HELPLINES.map((h) => [h.id, h]));
    // Verified 2026-11-08: MoHFW for Tele-MANAS, PIB PRID 1652240 for KIRAN.
    expect(byId.telemanas.numbers).toContain('14416');
    expect(byId.telemanas.numbers).toContain('1800-891-4416');
    expect(byId.kiran.numbers).toContain('1800-599-0019');
    expect(byId.emergency.numbers).toContain('112');
  });

  it('gives every helpline a name, at least one dialable number and a verification date', () => {
    for (const h of HELPLINES) {
      expect(typeof h.name).toBe('string');
      expect(h.name.length).toBeGreaterThan(0);
      expect(h.numbers.length).toBeGreaterThan(0);
      for (const n of h.numbers) {
        // Must survive the client's tel: normalisation with digits left over.
        expect(n.replace(/[^0-9]/g, '').length).toBeGreaterThanOrEqual(3);
      }
      expect(h.verifiedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('is deeply frozen so a caller cannot mutate the shared list', () => {
    expect(Object.isFrozen(HELPLINES)).toBe(true);
    for (const h of HELPLINES) {
      expect(Object.isFrozen(h)).toBe(true);
      expect(Object.isFrozen(h.numbers)).toBe(true);
    }
  });
});

describe('triage red flag is unchanged (governed SaMD threshold)', () => {
  it('matches exactly the four phrases the triage service always matched', () => {
    // This constant backs an ESI-2 red flag in `emergency-triage-esi-v1`,
    // a Class III SaMD component whose model card requires medical director
    // sign-off for "changes to red-flag patterns or vital thresholds".
    // If this test fails, that approval is what is missing — not the test.
    expect(TRIAGE_PSYCHIATRIC_RED_FLAG.source).toBe('suicid|self.?harm|want.?to.?die|kill.?myself');
    expect(TRIAGE_PSYCHIATRIC_RED_FLAG.flags).toBe('i');
  });

  it('still fires on the triage inputs it always fired on', () => {
    for (const t of ['suicidal', 'self harm', 'want to die', 'kill myself']) {
      expect(TRIAGE_PSYCHIATRIC_RED_FLAG.test(t)).toBe(true);
    }
  });

  it('is narrower than the diary detector, which is the point of keeping both', () => {
    const onlyDiary = 'I feel completely hopeless and like a burden to my family';
    expect(TRIAGE_PSYCHIATRIC_RED_FLAG.test(onlyDiary)).toBe(false);
    expect(detectCrisis(onlyDiary).detected).toBe(true);
  });
});
