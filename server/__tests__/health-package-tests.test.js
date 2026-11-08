/**
 * Unit tests for the shared health-package test-list parser (extracted from
 * health-checkup.route.js). Pure functions — no DB required.
 */
import { describe, it, expect } from '@jest/globals';
import { parseTestList, testNames, splitKnownTestNames } from '../utils/health-package-tests.js';

describe('parseTestList', () => {
  it('keeps a clean array of names as individual items', () => {
    expect(parseTestList(['CBC', 'Lipid Profile', 'HbA1c'])).toEqual([{ name: 'CBC' }, { name: 'Lipid Profile' }, { name: 'HbA1c' }]);
  });

  it('passes object items through unchanged', () => {
    expect(parseTestList([{ name: 'TSH', code: 'T1' }])).toEqual([{ name: 'TSH', code: 'T1' }]);
  });

  it('splits a tab/number-delimited occupational list and drops the header + running index', () => {
    const raw = 'SL No\tTests 1\tPhysical Examination 2\tComplete Blood Count 3\tLipid Profile';
    expect(testNames(raw)).toEqual(['Physical Examination', 'Complete Blood Count', 'Lipid Profile']);
  });

  it('breaks a long comma/sample-type lab export into individual tests', () => {
    const raw = 'Fasting Blood Sugar, Sodium Fluoride Plasma Uric Acid, Serum Serum Electrolytes, Serum Thyroid Stimulating Hormone, Serum Lipid Profile, Serum';
    const names = testNames(raw);
    expect(names.length).toBeGreaterThanOrEqual(4);
    expect(names.some((n) => /uric acid/i.test(n))).toBe(true);
  });

  it('keeps a short single string whole', () => {
    expect(testNames('Complete Blood Count')).toEqual(['Complete Blood Count']);
  });

  it('is empty for empty/nullish input', () => {
    expect(parseTestList(null)).toEqual([]);
    expect(parseTestList('')).toEqual([]);
    expect(parseTestList([''])).toEqual([]);
  });

  it('testNames returns trimmed plain strings', () => {
    expect(testNames([' CBC ', { name: ' Lipid ' }])).toEqual(['CBC', 'Lipid']);
  });
});

describe('splitKnownTestNames (mobile report row 14)', () => {
  // The real DairyDay_AHC_Sales_2026-27 catalog value: one 606-char string
  // pasted from a document, where the sample-type splitter cannot end an entry
  // because the leading tests carry no sample.
  const RUN = '2D Echo/Doppler Study Physician Consultation Tread Mill Test (TMT) Uric Acid, Serum';
  const content = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

  test('breaks a run of procedures on names the text already contains', () => {
    const names = splitKnownTestNames(RUN).filter((p) => p.inferred).map((p) => p.text);
    expect(names).toEqual([
      '2D Echo/Doppler Study',
      'Physician Consultation',
      'Tread Mill Test (TMT)',
      'Uric Acid',
    ]);
  });

  test('loses no content — nothing can be dropped or conjured', () => {
    const parts = splitKnownTestNames(RUN);
    expect(content(parts.map((p) => p.text).join(''))).toBe(content(RUN));
  });

  test('text it does not recognise comes back whole and flagged, not discarded', () => {
    expect(splitKnownTestNames('Some Entirely Unknown Panel'))
      .toEqual([{ text: 'Some Entirely Unknown Panel', inferred: false }]);
  });

  test('prefers the longest name, so "2D Echo/Doppler Study" beats "2D Echo"', () => {
    const [first] = splitKnownTestNames('2D Echo/Doppler Study').filter((p) => p.inferred);
    expect(first.text).toBe('2D Echo/Doppler Study');
  });

  test('parseTestList turns the whole merged package into individual tests', () => {
    const tests = parseTestList([RUN]).map((t) => t.name);
    expect(tests).toEqual([
      '2D Echo/Doppler Study',
      'Physician Consultation',
      'Tread Mill Test (TMT)',
      'Uric Acid, Serum',
    ]);
  });

  test('a test whose name starts with a sample word is not torn in half', () => {
    // "Urine Routine and Microscopy" is a test, not a urine sample.
    const tests = parseTestList(['Complete Blood Count (CBC), EDTA Whole Blood Vitamin B12 Free T4 Urine Routine and Microscopy BP and weight with BMI'])
      .map((t) => t.name);
    expect(tests).toContain('Urine Routine and Microscopy');
    expect(tests.some((t) => /Free T4 Urine$/.test(t))).toBe(false);
  });
});
