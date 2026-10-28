import { classifyVital, patientVitalHistory } from '../utils/patient-vitals.js';
import { sleepHours, sleepScore } from '../utils/health-display.js';

describe('patient vital screening flags', () => {
  test.each([[99, 'normal'], [100, 'prediabetes_range'], [110, 'prediabetes_range'], [125, 'prediabetes_range'], [126, 'diabetes_range']])('fasting glucose %s is %s', (value, status) => {
    expect(classifyVital('blood_sugar', value, true)).toBe(status);
  });
  it('does not call a non-fasting reading normal without context', () => {
    expect(classifyVital('blood_sugar', 110)).toBe('unclassified');
    expect(classifyVital('weight', 70.5)).toBe('unclassified');
  });
  it('flags dangerous blood pressure and rejects incomplete measurements', () => {
    expect(classifyVital('blood_pressure', '200/120')).toBe('critical');
    expect(() => classifyVital('blood_pressure', '120/')).toThrow();
    expect(() => classifyVital('blood_pressure', '80/120')).toThrow();
    expect(() => classifyVital('heart_rate', 'NaN')).toThrow();
    expect(() => classifyVital('oxygen_level', 105)).toThrow();
  });
  it('normalizes sleep units and uses one score calculation', () => {
    expect(sleepHours(27000, 'seconds')).toBe(7.5);
    expect(sleepHours(450, 'minutes')).toBe(7.5);
    expect(sleepHours(7.5)).toBe(7.5);
    expect(sleepScore(7.5)).toBe(94);
    expect(sleepScore(null)).toBeNull();
    expect(sleepHours(95, 'hours')).toBeNull();
  });
  it('combines only matching watch blood pressure readings and keeps manual compound readings', () => {
    const common = { source: 'ble', recordedAt: '2026-10-28T04:00:00Z', deviceId: 'watch-1', unit: 'mmHg' };
    const readings = patientVitalHistory([
      { ...common, id: 1, dataType: 'blood_pressure_systolic', value: 200 },
      { ...common, id: 2, dataType: 'blood_pressure_diastolic', value: 120 },
      { ...common, id: 3, dataType: 'blood_pressure_systolic', value: 125, deviceId: 'another-watch' },
      { ...common, id: 4, source: 'manual', dataType: 'blood_pressure', value: 120, metadata: { systolic: 120, diastolic: 75 } },
    ]);
    expect(readings).toHaveLength(2);
    expect(readings[0]).toMatchObject({ value: '200/120', status: 'critical' });
    expect(readings[1]).toMatchObject({ value: '120/75', status: 'normal', recordedBy: 'Self' });
  });
  it('classifies Celsius using the matching temperature scale without changing displayed units', () => {
    const readings = patientVitalHistory([{ id: 1, dataType: 'temperature', value: 38, unit: '°C' }, { id: 2, dataType: 'blood_glucose', value: 6, unit: 'mmol/L' }]);
    expect(readings[0]).toMatchObject({ value: '38', unit: '°C', status: 'high' });
    expect(readings[1].status).toBe('unclassified');
  });
});
