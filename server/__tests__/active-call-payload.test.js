import {
  buildActiveDoctorCallPayload,
  isRecoverableDoctorCall,
} from '../utils/activeCallPayload.js';

describe('active call recovery payload', () => {
  const now = new Date('2026-09-01T15:20:00.000Z');

  it('detects recently doctor-initiated in-progress calls', () => {
    expect(isRecoverableDoctorCall({
      status: 'in-progress',
      callInitiatedBy: 'doctor',
      callInitiatedAt: '2026-09-01T15:19:43.000Z',
    }, now)).toBe(true);
  });

  it('rejects stale or non-doctor call states', () => {
    expect(isRecoverableDoctorCall({
      status: 'in-progress',
      callInitiatedBy: 'doctor',
      callInitiatedAt: '2026-09-01T14:00:00.000Z',
    }, now)).toBe(false);

    expect(isRecoverableDoctorCall({
      status: 'confirmed',
      callInitiatedBy: 'doctor',
      callInitiatedAt: '2026-09-01T15:19:43.000Z',
    }, now)).toBe(false);
  });

  it('builds the same mobile call contract used by doctor initiate-call', () => {
    const payload = buildActiveDoctorCallPayload({
      id: 1095,
      userId: 19,
      doctorId: 70,
      status: 'in-progress',
      appointmentDate: '2026-09-01',
      appointmentTime: '21:00:00',
      meetingId: 'apt-1095-22c9045c',
      meetingLink: 'https://app.mediqzy.com/video-consultation?room=apt-1095-22c9045c&appointmentId=1095',
      callInitiatedAt: '2026-09-01T15:19:43.211Z',
      doctor: {
        prefix: 'Dr',
        firstName: 'Shiva',
        lastName: 'K',
        specialization: 'General Medicine',
      },
    }, {
      serverUrl: 'wss://msh-kw9tvxa9.livekit.cloud',
    });

    expect(payload).toMatchObject({
      notificationType: 'incoming_call',
      eventType: 'doctor_calling',
      appointmentId: '1095',
      patientId: '19',
      doctorId: '70',
      doctorName: 'Dr Shiva K',
      roomName: 'apt-1095-22c9045c',
      clickAction: 'join_video_call',
      screen: 'VideoCall',
      channelId: 'mediczy_incoming_call',
    });
  });
});
