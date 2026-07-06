import {
  normalizeCareTeamBookingDetails
} from '../services/care-team-notification.service.js';

describe('care-team-notification.service', () => {
  test('normalizeCareTeamBookingDetails maps appointment fields', () => {
    const details = normalizeCareTeamBookingDetails({
      appointment: {
        id: 99,
        patient_name: 'Jane Doe',
        patient_email: 'jane@example.com',
        patient_phone: '+911111111111',
        doctor_name: 'Dr. Smith',
        appointment_date: '2026-07-01',
        appointment_time: '09:00',
        consultation_type: 'in-person',
        status: 'pending',
        symptoms: 'cough'
      },
      bookingSource: 'mobile'
    });

    expect(details.appointmentId).toBe(99);
    expect(details.patientName).toBe('Jane Doe');
    expect(details.patientEmail).toBe('jane@example.com');
    expect(details.doctorName).toBe('Dr. Smith');
    expect(details.consultationType).toBe('in-person');
    expect(details.bookingSource).toBe('mobile');
  });

  test('normalizeCareTeamBookingDetails joins symptom arrays', () => {
    const details = normalizeCareTeamBookingDetails({
      appointment: { symptoms: ['a', 'b'] }
    });
    expect(details.symptoms).toBe('a, b');
  });
});
