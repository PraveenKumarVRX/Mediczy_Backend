import assert from 'node:assert/strict';
import {
  canonicalizeAppointmentTime,
  getSlotStartTime,
  isSlotBooked,
  slotsMatch,
} from '../../utils/appointmentSlotTime.js';

const tests = [
  () => assert.equal(getSlotStartTime('09:00 - 09:15'), '09:00'),
  () => assert.equal(getSlotStartTime('09:00-09:15'), '09:00'),
  () => assert.equal(getSlotStartTime('09:00:00'), '09:00'),
  () => assert.equal(slotsMatch('09:00', '09:00 - 09:15'), true),
  () => assert.equal(slotsMatch('09:00 - 09:15', '09:15 - 09:30'), false),
  () => assert.equal(isSlotBooked('09:00 - 09:15', ['09:00']), true),
  () => assert.equal(isSlotBooked('10:00 - 10:15', ['09:00', '14:30 - 15:00']), false),
  () => assert.equal(canonicalizeAppointmentTime('09:00 - 09:15'), '09:00'),
];

let passed = 0;
for (const test of tests) {
  test();
  passed += 1;
}

console.log(`✅ appointment-slot-time smoke: ${passed}/${tests.length} passed`);
