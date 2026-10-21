import { appointmentSlotInstant, isFutureAppointmentSlot } from '../utils/appointmentSlotTime.js';
test('rejects earlier slots today using India time even on a UTC server', () => {
  const now = Date.parse('2026-10-21T12:54:00Z'); // 18:24 IST
  expect(isFutureAppointmentSlot('2026-10-21','18:00 - 18:30',now)).toBe(false);
  expect(isFutureAppointmentSlot('2026-10-21','18:30 - 19:00',now)).toBe(true);
  expect(appointmentSlotInstant('2026-10-21','18:30').toISOString()).toBe('2026-10-21T13:00:00.000Z');
});
test.each([['2026-02-30','10:00'],['bad','10:00'],['2026-10-21junk','10:00'],['2026-10-21','25:00']])('invalid schedule is unavailable: %s %s', (date,time) => expect(isFutureAppointmentSlot(date,time)).toBe(false));
