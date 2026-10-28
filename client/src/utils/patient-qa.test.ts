import { describe, expect, it } from 'vitest';
import { scoreLabel, wholeNumber, slotTime, indiaTime, reportTitle } from './patient-display';
import { wellnessLevel } from './wellness-level';
import { coveragePeriod, pharmacyBenefit } from './plan-entitlements';
import { rankPageSearch } from './page-search';
import { filterDietSuggestions, scaleMealBudgets, isDietAdvice } from '../../../shared/patient-diet.mjs';

describe('patient display regressions', () => {
  it('distinguishes unavailable scores from measured zero', () => {
    expect(scoreLabel(null)).toBe('Not enough data yet');
    expect(scoreLabel(undefined)).toBe('Not enough data yet');
    expect(scoreLabel(0)).toBe('Needs Attention');
    expect(scoreLabel('not a score')).toBe('Not enough data yet');
  });
  it('formats database decimal strings and IST appointment times', () => {
    expect(wholeNumber('3450.00')).toBe('3,450');
    expect(wholeNumber('78.00')).toBe('78');
    expect(slotTime('09:30:00')).toBe('9:30 AM');
    expect(slotTime('12:45:00')).toBe('12:45 PM');
    expect(indiaTime('2026-10-28T04:30:00Z').toLowerCase()).toContain('10:00');
    expect(reportTitle('rn_image_picker_lib_temp_deadbeef.jpg', 'Lab report')).toBe('Lab report');
  });
  it('advances levels from lifetime earned XP without negative remaining XP', () => {
    expect(wellnessLevel(499).level).toBe(1);
    expect(wellnessLevel(500)).toMatchObject({ level: 2, remaining: 1000 });
    expect(wellnessLevel(561)).toMatchObject({ level: 2, remaining: 939 });
    expect(wellnessLevel(1500)).toMatchObject({ level: 3, progress: 0 });
    expect(wellnessLevel(15000)).toMatchObject({ level: 6, remaining: 0, progress: 100 });
  });
  it('puts Book Appointment first for bo and excludes accidental dashboard substrings', () => {
    const items = [{ label: 'Home', keywords: ['dashboard'] }, { label: 'AI Report Scanner', keywords: ['upload', 'lab'] }, { label: 'My Appointments', keywords: ['bookings'] }, { label: 'Book Appointment', keywords: ['book'] }];
    expect(rankPageSearch(items, 'bo').map(item => item.label)).toEqual(['Book Appointment', 'My Appointments']);
    expect(rankPageSearch(items, 'scanner')[0].label).toBe('AI Report Scanner');
    expect(rankPageSearch(items, 'no-such-page')).toEqual([]);
  });
  it('keeps meal budgets equal to target and removes unsuitable risk-profile suggestions', () => {
    const meals = scaleMealBudgets([400, 200, 500, 200, 700].map(calories => ({ calories })), 2389);
    expect(meals.reduce((sum, meal) => sum + meal.calories, 0)).toBe(2389);
    expect(filterDietSuggestions(['Butter Chicken', 'Mutton Rogan Josh', 'Masala chai with bun maska', 'Dal with 2 rotis'], { familyHistory: ['Diabetes', 'Hypertension'] })).toEqual(['Dal with 2 rotis']);
    expect(isDietAdvice('Thank you for sharing your health concern. Consult a provider.')).toBe(false);
    expect(isDietAdvice('For your meal plan, include vegetables and protein.')).toBe(true);
  });
});

it('uses the same period and pharmacy entitlement on plan and card surfaces', () => {
  const coverage = { onlineConsult: { unit: 'GP/year', limit: 6 }, pharmacy: { limitINR: 0, discountPct: 15 } };
  expect(coveragePeriod(coverage)).toBe('year');
  expect(pharmacyBenefit(coverage)).toBe('15% discount');
  expect(pharmacyBenefit({ pharmacy: { limitINR: 0, discountPct: 0 } })).toBe('Not included');
});
