import {
  buildMeetingLink,
  generateCanonicalMeetingId,
  resolveLiveKitWsUrl,
} from './videoProvider.js';

export const ACTIVE_CALL_RECOVERY_WINDOW_MS = 30 * 60 * 1000;

export function isRecoverableDoctorCall(appointment, now = new Date()) {
  if (!appointment) return false;

  const status = String(appointment.status || '').toLowerCase().replace(/_/g, '-');
  if (status !== 'in-progress') return false;
  if (String(appointment.callInitiatedBy || '').toLowerCase() !== 'doctor') return false;

  const callInitiatedAt = appointment.callInitiatedAt ? new Date(appointment.callInitiatedAt) : null;
  if (!callInitiatedAt || Number.isNaN(callInitiatedAt.getTime())) return false;

  const ageMs = now.getTime() - callInitiatedAt.getTime();
  return ageMs >= 0 && ageMs <= ACTIVE_CALL_RECOVERY_WINDOW_MS;
}

export function buildActiveDoctorCallPayload(appointment, options = {}) {
  if (!appointment) return null;

  const appointmentId = String(appointment.id || '');
  const patientId = String(appointment.userId || '');
  const doctorId = String(appointment.doctorId || options.doctorId || '');
  const meetingId = appointment.meetingId || generateCanonicalMeetingId(appointment.id);
  const meetingLink = appointment.meetingLink || buildMeetingLink('livekit', meetingId, appointment.id);
  const doctor = appointment.doctor || appointment.Doctor || {};
  const doctorName = options.doctorName ||
    appointment.doctorName ||
    `${doctor.prefix || 'Dr.'} ${doctor.firstName || ''} ${doctor.lastName || ''}`.replace(/\s+/g, ' ').trim() ||
    'Your Doctor';
  const callInitiatedAt = appointment.callInitiatedAt
    ? new Date(appointment.callInitiatedAt).toISOString()
    : new Date().toISOString();
  const serverUrl = options.serverUrl || resolveLiveKitWsUrl();

  return {
    type: 'video_call',
    notificationType: 'incoming_call',
    eventType: 'doctor_calling',
    appointmentId,
    patientId,
    doctorId,
    doctorName,
    doctorSpecialization: doctor.specialization || appointment.specialization || '',
    appointmentDate: appointment.appointmentDate ? String(appointment.appointmentDate).slice(0, 10) : '',
    appointmentTime: appointment.appointmentTime || '',
    roomId: meetingId,
    roomName: meetingId,
    meetingId,
    meetingLink,
    serverUrl,
    callType: 'video',
    action: 'join_call',
    clickAction: 'join_video_call',
    click_action: 'join_video_call',
    actionUrl: 'mediczy://consultation/video/' + appointmentId,
    deepLink: 'mediczy://consultation/video/' + appointmentId,
    joinUrl: meetingLink,
    webRoute: '/video-consultation?room=' + encodeURIComponent(meetingId) + '&appointmentId=' + encodeURIComponent(appointmentId),
    route: 'VideoCall',
    screen: 'VideoCall',
    callInitiatedAt,
    title: doctorName + ' is calling',
    body: 'Your doctor has started the video consultation. Tap to join now!',
    sound: 'call_ringtone',
    channelId: 'mediczy_incoming_call',
  };
}
