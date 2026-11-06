/**
 * Unit tests for the shared health-package test-list parser (extracted from
 * health-checkup.route.js). Pure functions — no DB required.
 */
import { describe, it, expect } from '@jest/globals';
import { parseTestList, testNames } from '../utils/health-package-tests.js';

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
