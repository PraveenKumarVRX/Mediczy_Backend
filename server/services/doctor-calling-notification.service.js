/**
 * Real-time "doctor is calling" notification for a video consultation —
 * socket push (foreground web/app) + FCM push (background mobile) +
 * a persistent Notification record, all three so the patient finds out
 * regardless of which surface they're on.
 *
 * Extracted from the triage call-notification flow (the one real, working
 * implementation of this in the codebase — server/routes/doctor/triage.routes.js)
 * so the same, already-proven pipeline also covers scheduled appointment
 * video consultations, which previously had no real-time notification at
 * all: the doctor could join and start talking with nothing telling the
 * patient a call was happening, beyond time-based cron reminders unrelated
 * to the doctor's actual action.
 */
import { Notification, FCMToken } from './notification.service.js';
import { sendDoctorCallingNotification } from '../utils/firebase-admin.js';
import { getIO, getOnlineUsers } from '../chat/chathandler.controller.js';

export async function notifyPatientDoctorIsCalling({
  appointment,
  doctorName,
  doctorSpecialization = '',
  meetingId,
  meetingLink,
  joinUrl,
  serverUrl = '',
}) {
  const patientId = appointment.userId;
  if (!patientId) return { socketDelivered: false, fcmSent: 0, fcmFailed: 0 };

  const callStartedAt = new Date();
  const callPayload = {
    type: 'video_call',
    notificationType: 'incoming_call',
    appointmentId: String(appointment.id),
    patientId: String(patientId),
    doctorId: String(appointment.doctorId),
    doctorName,
    doctorSpecialization,
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
    actionUrl: 'mediczy://consultation/video/' + appointment.id,
    deepLink: 'mediczy://consultation/video/' + appointment.id,
    joinUrl: joinUrl || meetingLink,
    webRoute: '/video-consultation?room=' + encodeURIComponent(meetingId) + '&appointmentId=' + encodeURIComponent(appointment.id),
    route: 'VideoCall',
    screen: 'VideoCall',
    callInitiatedAt: callStartedAt.toISOString(),
  };

  let socketDelivered = false;
  try {
    const io = getIO?.();
    if (io) {
      const targetRoom = 'user-' + String(patientId);
      const room = io.sockets.adapter.rooms.get(targetRoom);
      const roomSize = room ? room.size : 0;

      io.to(targetRoom).emit('doctor-initiated-call', callPayload);
      io.to(targetRoom).emit('incoming-call', callPayload);
      io.to(targetRoom).emit('video-call-incoming', callPayload);

      const patientSocket = getOnlineUsers?.().get(String(patientId));
      if (patientSocket?.socketId) {
        io.to(patientSocket.socketId).emit('doctor-initiated-call', callPayload);
        io.to(patientSocket.socketId).emit('incoming-call', callPayload);
        io.to(patientSocket.socketId).emit('video-call-incoming', callPayload);
      }

      socketDelivered = roomSize > 0 || Boolean(patientSocket?.socketId);
    }
  } catch (socketError) {
    console.error('[DoctorCallingNotification] socket emit failed:', socketError.message);
  }

  let fcmSent = 0;
  let fcmFailed = 0;
  try {
    if (FCMToken && typeof sendDoctorCallingNotification === 'function') {
      const patientTokens = await FCMToken.findAll({
        where: { userId: patientId, userType: 'patient', isActive: true },
      });
      const results = await Promise.allSettled(
        patientTokens.map((tokenRecord) => sendDoctorCallingNotification(tokenRecord.token, callPayload))
      );
      fcmSent = results.filter((r) => r.status === 'fulfilled').length;
      fcmFailed = results.length - fcmSent;
    }
  } catch (fcmError) {
    console.error('[DoctorCallingNotification] FCM send failed:', fcmError.message);
  }

  try {
    if (Notification) {
      await Notification.create({
        userId: patientId,
        userType: 'patient',
        type: 'call_incoming',
        title: doctorName + ' is calling',
        message: 'Tap to join your video consultation',
        data: callPayload,
        deepLink: 'mediczy://consultation/video/' + appointment.id,
        webRoute: callPayload.webRoute,
        priority: 'urgent',
        channels: ['app', 'push'],
        status: 'sent',
        sentAt: callStartedAt,
      });
    }
  } catch (notificationError) {
    console.error('[DoctorCallingNotification] Notification.create failed:', notificationError.message);
  }

  return { socketDelivered, fcmSent, fcmFailed };
}
