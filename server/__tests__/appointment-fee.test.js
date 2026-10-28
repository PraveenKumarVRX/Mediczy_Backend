import { appointmentFee } from '../utils/appointment-fee.js';

it('preserves a zero fee shown in the doctor catalogue', () => {
  expect(appointmentFee({ onlineConsultationFee: '0.00' }, { videoConsultationFee: 500 }, 'video')).toBe(0);
});
it('uses the correct mode and availability fallback', () => {
  expect(appointmentFee({ onlineConsultationFee: 100, inPersonConsultationFee: 300 }, null, 'in-person')).toBe(300);
  expect(appointmentFee({}, { videoConsultationFee: 200, audioConsultationFee: 150 }, 'audio')).toBe(150);
});
it('withholds an unavailable or invalid price instead of inventing a fee', () => {
  expect(appointmentFee({}, null, 'video')).toBeNull();
  expect(appointmentFee({ onlineConsultationFee: 'NaN' }, null, 'video')).toBeNull();
  expect(appointmentFee({ onlineConsultationFee: -1 }, null, 'video')).toBeNull();
});
