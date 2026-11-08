process.env.NODE_ENV = 'test';

import { describe, expect, it } from '@jest/globals';
import instruments, {
  score,
  listInstruments,
  getInstrument,
  normalizeInstrumentCode,
  InstrumentAnswerError,
  PENDING_LICENCE_REVIEW,
  DISCLAIMER,
} from '../services/mental-wellness-instruments.service.js';

const zeros = (n) => Array.from({ length: n }, () => 0);

describe('MED-MIND-001 instrument scoring', () => {
  it('scores PHQ-9 at every published band boundary', () => {
    // 9 items x 0-3. Build an exact total by filling 3s then a remainder.
    const phq = (total) => {
      const a = zeros(9);
      let left = total;
      for (let i = 0; i < 9 && left > 0; i += 1) {
        a[i] = Math.min(3, left);
        left -= a[i];
      }
      return a;
    };
    const band = (total) => score('PHQ9', phq(total)).band;

    expect(band(0)).toBe('minimal');
    expect(band(4)).toBe('minimal');
    expect(band(5)).toBe('mild');
    expect(band(9)).toBe('mild');
    expect(band(10)).toBe('moderate');
    expect(band(14)).toBe('moderate');
    expect(band(15)).toBe('moderately_severe');
    expect(band(19)).toBe('moderately_severe');
    expect(band(20)).toBe('severe');
    expect(band(27)).toBe('severe');
  });

  it('scores GAD-7 at every published band boundary', () => {
    const gad = (total) => {
      const a = zeros(7);
      let left = total;
      for (let i = 0; i < 7 && left > 0; i += 1) {
        a[i] = Math.min(3, left);
        left -= a[i];
      }
      return a;
    };
    const band = (total) => score('GAD7', gad(total)).band;

    expect(band(0)).toBe('minimal');
    expect(band(4)).toBe('minimal');
    expect(band(5)).toBe('mild');
    expect(band(9)).toBe('mild');
    expect(band(10)).toBe('moderate');
    expect(band(14)).toBe('moderate');
    expect(band(15)).toBe('severe');
    expect(band(21)).toBe('severe');
  });

  it('sums the raw score and reports the instrument maximum', () => {
    const r = score('PHQ9', [1, 2, 3, 0, 1, 2, 0, 0, 0]);
    expect(r.rawScore).toBe(9);
    expect(r.maxScore).toBe(27);
    expect(score('GAD7', [3, 3, 3, 3, 3, 3, 3]).rawScore).toBe(21);
  });

  // The single most safety-critical behaviour in the module.
  it('raises a crisis flag when PHQ-9 item 9 is answered above zero, at ANY total', () => {
    for (const v of [1, 2, 3]) {
      const a = zeros(9);
      a[8] = v;
      const r = score('PHQ9', a);
      expect(r.crisis).toBe(true);
      expect(r.flaggedItems).toEqual(['PHQ9_Q9']);
      // Crucially this holds even where the overall score is 'minimal'.
      expect(r.band).toBe('minimal');
    }
  });

  it('does not raise a crisis flag when item 9 is zero, even at a severe total', () => {
    const a = [3, 3, 3, 3, 3, 3, 3, 3, 0];
    const r = score('PHQ9', a);
    expect(r.rawScore).toBe(24);
    expect(r.band).toBe('severe');
    expect(r.crisis).toBe(false);
    expect(r.flaggedItems).toEqual([]);
  });

  it('never raises a crisis flag for GAD-7, which has no such item', () => {
    expect(score('GAD7', [3, 3, 3, 3, 3, 3, 3]).crisis).toBe(false);
  });

  // Phase 3: a flagged crisis item carries the helplines with it, so no caller
  // can forget to look them up.
  it('attaches helplines to a crisis result', () => {
    const a = zeros(9);
    a[8] = 2;
    const r = score('PHQ9', a);
    expect(r.support).toBeTruthy();
    expect(r.support.message).toMatch(/free, confidential/i);
    const numbers = r.support.helplines.flatMap((h) => h.numbers);
    expect(numbers).toContain('14416');
    expect(numbers).toContain('1800-599-0019');
  });

  it('attaches no support when no crisis item is flagged, even at a severe total', () => {
    expect(score('PHQ9', [3, 3, 3, 3, 3, 3, 3, 3, 0]).support).toBeNull();
    expect(score('GAD7', [3, 3, 3, 3, 3, 3, 3]).support).toBeNull();
  });

  it('is pure — identical answers always produce an identical result', () => {
    const a = [0, 1, 2, 3, 0, 1, 2, 3, 0];
    expect(score('PHQ9', a)).toEqual(score('PHQ9', a));
  });

  it('accepts a 1-indexed object as well as an array', () => {
    const arr = score('GAD7', [1, 0, 2, 0, 0, 1, 0]);
    const obj = score('GAD7', { 1: 1, 2: 0, 3: 2, 4: 0, 5: 0, 6: 1, 7: 0 });
    expect(obj.rawScore).toBe(arr.rawScore);
    expect(obj.band).toBe(arr.band);
  });
});

describe('MED-MIND-001 answer validation', () => {
  it('refuses a partially completed instrument rather than scoring it', () => {
    expect(() => score('PHQ9', [0, 1, 2])).toThrow(InstrumentAnswerError);
    expect(() => score('PHQ9', { 1: 0, 2: 1 })).toThrow(/missing/i);
  });

  // A silent coercion to 0 here would understate a depression score.
  it('refuses values that Number() would quietly coerce to zero', () => {
    for (const bad of [null, undefined, '', '  ', true, false, [], {}]) {
      const a = zeros(9);
      a[3] = bad;
      expect(() => score('PHQ9', a)).toThrow(InstrumentAnswerError);
    }
  });

  it('refuses out-of-range and non-integer answers', () => {
    for (const bad of [-1, 4, 99, 1.5, 'two', NaN]) {
      const a = zeros(7);
      a[2] = bad;
      expect(() => score('GAD7', a)).toThrow(InstrumentAnswerError);
    }
  });

  it('accepts numeric strings, which is what an HTML form posts', () => {
    expect(score('GAD7', ['1', '0', '2', '0', '0', '1', '0']).rawScore).toBe(4);
  });

  it('rejects an unknown instrument instead of defaulting to one', () => {
    expect(() => score('PHQ99', zeros(9))).toThrow(/unknown instrument/i);
    expect(() => score(undefined, zeros(9))).toThrow(/unknown instrument/i);
  });
});

describe('MED-MIND-001 Tier A (non-SaMD) guarantees', () => {
  it('attaches the non-diagnostic disclaimer to every score and to the catalogue', () => {
    expect(DISCLAIMER).toMatch(/not a diagnosis/i);
    expect(score('PHQ9', zeros(9)).disclaimer).toBe(DISCLAIMER);
    for (const i of listInstruments()) expect(i.disclaimer).toBe(DISCLAIMER);
  });

  it('pins the instrument version on every result, so a scoring change is traceable', () => {
    expect(score('PHQ9', zeros(9)).instrumentVersion).toBe('1.0');
    expect(score('GAD7', zeros(7)).instrumentVersion).toBe('1.0');
  });

  it('ships only instruments that are free to use, and names the ones withheld', () => {
    expect(listInstruments().map((i) => i.code).sort()).toEqual(['GAD7', 'PHQ9']);
    for (const code of ['PSS10', 'ISI', 'WHO5', 'AUDITC']) {
      expect(PENDING_LICENCE_REVIEW[code]).toBeTruthy();
      expect(getInstrument(code)).toBeNull();
    }
  });

  it('exposes item text and options so the client never invents a question', () => {
    const phq = listInstruments().find((i) => i.code === 'PHQ9');
    expect(phq.items).toHaveLength(9);
    expect(phq.items[8].text).toMatch(/better off dead|hurting yourself/i);
    expect(phq.items[0].number).toBe(1);
    expect(phq.options.map((o) => o.value)).toEqual([0, 1, 2, 3]);
  });

  it('canonicalises the codes clients actually send', () => {
    for (const v of ['phq9', 'PHQ-9', 'phq_9', ' Phq 9 ']) {
      expect(normalizeInstrumentCode(v)).toBe('PHQ9');
    }
    for (const v of ['gad7', 'GAD-7', 'gad_7']) {
      expect(normalizeInstrumentCode(v)).toBe('GAD7');
    }
    expect(normalizeInstrumentCode('nonsense')).toBeNull();
    expect(normalizeInstrumentCode(null)).toBeNull();
  });

  it('has no default export surprises', () => {
    expect(typeof instruments.score).toBe('function');
    expect(typeof instruments.listInstruments).toBe('function');
  });
});
