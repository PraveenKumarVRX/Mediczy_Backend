import {
  canonicalizeAppointmentTime,
  getSlotStartTime,
  isSlotBooked,
  normalizeSlotKey,
  slotsMatch,
} from '../utils/appointmentSlotTime.js';

describe('appointmentSlotTime', () => {
  test('getSlotStartTime extracts start from range formats', () => {
    expect(getSlotStartTime('09:00 - 09:15')).toBe('09:00');
    expect(getSlotStartTime('09:00-09:15')).toBe('09:00');
    expect(getSlotStartTime('09:00')).toBe('09:00');
    expect(getSlotStartTime('09:00:00')).toBe('09:00');
  });

  test('normalizeSlotKey strips whitespace', () => {
    expect(normalizeSlotKey('09:00 - 09:15')).toBe('09:00-09:15');
    expect(normalizeSlotKey('09:00-09:15')).toBe('09:00-09:15');
  });

  test('slotsMatch treats start-only and range as equal', () => {
    expect(slotsMatch('09:00', '09:00 - 09:15')).toBe(true);
    expect(slotsMatch('09:00 - 09:15', '09:00')).toBe(true);
    expect(slotsMatch('09:00 - 09:15', '09:00-09:15')).toBe(true);
    expect(slotsMatch('09:00', '10:00')).toBe(false);
    expect(slotsMatch('09:00 - 09:15', '09:15 - 09:30')).toBe(false);
  });

  test('isSlotBooked detects booked slots with mixed formats', () => {
    const booked = ['09:00', '14:30 - 15:00'];
    expect(isSlotBooked('09:00 - 09:15', booked)).toBe(true);
    expect(isSlotBooked('14:30', booked)).toBe(true);
    expect(isSlotBooked('10:00 - 10:15', booked)).toBe(false);
  });

  test('canonicalizeAppointmentTime normalizes booking input', () => {
    expect(canonicalizeAppointmentTime('09:00 - 09:15')).toBe('09:00');
    expect(canonicalizeAppointmentTime('  10:30  ')).toBe('10:30');
  });
});
