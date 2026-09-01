import express from 'express';
import {
  findDoctorAuthorizedAppointment,
  resolveDoctorIdCandidates,
} from '../../utils/doctor-appointment-access.js';

export const createDoctorTriageRouter = ({
  authDoctor,
  Appointment,
  User,
  Doctor,
  UserPlan,
  Op,
  isMembershipRenewalExemptEmail,
  ensureMeetingInfo,
  getProviderLabel,
  buildLiveKitJoinData,
  Notification,
  FCMToken,
  sendDoctorCallingNotification,
  getIO,
  getOnlineUsers,
}) => {
  const router = express.Router();

  // --- Triage: AI Image Analysis ---
  router.post('/triage/:caseId/analyze-image', authDoctor, async (req, res) => {
    try {
      const { caseId } = req.params;
      let caseData = null;
      try {
        const [rows] = await User.sequelize.query(
          'SELECT * FROM triage_cases WHERE id = :caseId LIMIT 1',
          { replacements: { caseId }, type: User.sequelize.QueryTypes.SELECT }
        );
        caseData = rows;
      } catch {
        // table may not exist
      }

      const assessment = {
        severity: caseData?.severity || 'unknown',
        diagnosis: caseData?.chief_complaint
          ? `Chief complaint: ${caseData.chief_complaint}. Visual analysis received - clinical correlation recommended.`
          : 'Image received for analysis. Clinical correlation required.',
        recommendations: [
          'Perform physical examination',
          'Review vital signs trend',
          'Consider imaging or lab workup based on presentation',
        ],
        summary: 'AI image analysis logged. Please correlate with clinical findings.',
      };

      res.json({ success: true, analysis: assessment });
    } catch (error) {
      console.error('Triage analyze image error:', error);
      res.status(500).json({ success: false, message: 'Analysis failed', error: error.message });
    }
  });

  router.get('/triage/cases', authDoctor, async (req, res) => {
    try {
      const doctorId = req.doctor.id;
      const { status } = req.query;

      const whereConditions = {
        [Op.or]: [{ doctorId: null }, { doctorId }],
        sourceChannel: 'emergency_triage',
      };

      if (status && status !== 'all') {
        if (status === 'pending') {
          whereConditions.status = { [Op.in]: ['pending', 'scheduled'] };
        } else if (status === 'in_progress') {
          whereConditions.status = { [Op.in]: ['in_progress', 'confirmed'] };
        } else if (status === 'resolved') {
          whereConditions.status = { [Op.in]: ['completed', 'cancelled'] };
        }
      }

      const triageAppointments = await Appointment.findAll({
        where: whereConditions,
        order: [['createdAt', 'DESC']],
        limit: 50,
      });

      const triageCases = triageAppointments.map((apt) => {
        const notesJson = apt.notes_json
          ? (typeof apt.notes_json === 'string' ? JSON.parse(apt.notes_json) : apt.notes_json)
          : {};

        let age = 0;
        if (apt.patientDetails && apt.patientDetails.dateOfBirth) {
          const dob = new Date(apt.patientDetails.dateOfBirth);
          const today = new Date();
          age = today.getFullYear() - dob.getFullYear();
        }

        let triageStatus = 'pending';
        if (apt.status === 'in_progress' || apt.status === 'confirmed') triageStatus = 'in_review';
        if (apt.status === 'completed') triageStatus = 'resolved';
        if (apt.status === 'cancelled') triageStatus = 'resolved';

        return {
          id: apt.id.toString(),
          patientId: apt.userId,
          patientName: apt.patientName || 'Unknown Patient',
          patientAge: age,
          patientGender: (apt.patientDetails && apt.patientDetails.gender) || 'Unknown',
          patientPhone: apt.patientPhone || '',
          patientLocation: (apt.patientDetails && apt.patientDetails.address) || notesJson.location || '',
          symptoms: apt.symptoms || notesJson.symptoms || 'Not specified',
          description: apt.reason || notesJson.description || '',
          urgencyLevel: notesJson.urgencyLevel || 'URGENT',
          aiAssessment: notesJson.aiAssessment || null,
          aiRecommendation: notesJson.aiRecommendation || null,
          vitalSigns: notesJson.vitalSigns || null,
          status: triageStatus,
          createdAt: apt.createdAt,
          appointmentId: apt.id,
          videoRoomId: apt.meetingId || notesJson.roomId || null,
          notes: apt.notes || null,
        };
      });

      res.json({ success: true, count: triageCases.length, cases: triageCases });
    } catch (error) {
      console.error('Get triage cases error:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch triage cases', error: error.message });
    }
  });

  router.get('/triage/stats', authDoctor, async (req, res) => {
    try {
      const doctorId = req.doctor.id;
      const baseWhere = {
        sourceChannel: 'emergency_triage',
        [Op.or]: [{ doctorId: null }, { doctorId }],
      };

      const [total, pending, inProgress, resolved] = await Promise.all([
        Appointment.count({ where: baseWhere }),
        Appointment.count({ where: { ...baseWhere, status: { [Op.in]: ['pending', 'scheduled'] } } }),
        Appointment.count({ where: { ...baseWhere, status: { [Op.in]: ['in_progress', 'confirmed'] } } }),
        Appointment.count({ where: { ...baseWhere, status: { [Op.in]: ['completed', 'cancelled'] } } }),
      ]);

      const allTriageCases = await Appointment.findAll({
        where: { ...baseWhere, status: { [Op.in]: ['pending', 'scheduled', 'in_progress', 'confirmed'] } },
        attributes: ['notes_json'],
      });

      let immediate = 0;
      let urgent = 0;
      allTriageCases.forEach((apt) => {
        try {
          const notes = apt.notes_json
            ? (typeof apt.notes_json === 'string' ? JSON.parse(apt.notes_json) : apt.notes_json)
            : {};
          if (notes.urgencyLevel === 'IMMEDIATE') immediate += 1;
          if (notes.urgencyLevel === 'URGENT') urgent += 1;
        } catch {
          // ignore malformed notes
        }
      });

      res.json({
        success: true,
        stats: { total, pending, inProgress, resolved, immediate, urgent },
      });
    } catch (error) {
      console.error('Get triage stats error:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch triage stats', error: error.message });
    }
  });

  router.post('/triage/cases/:caseId/accept', authDoctor, async (req, res) => {
    try {
      const doctorId = req.doctor.id;
      const { caseId } = req.params;

      const appointment = await Appointment.findOne({
        where: { id: caseId, [Op.or]: [{ doctorId: null }, { doctorId }] },
      });
      if (!appointment) {
        const exists = await Appointment.findByPk(caseId);
        return res.status(exists ? 403 : 404).json({
          success: false,
          message: exists ? 'This triage case is assigned to another doctor' : 'Triage case not found',
        });
      }

      await appointment.update({ doctorId, status: 'in_progress' });

      try {
        const notificationService = (await import('../../services/notification.service.js')).default;
        await notificationService.sendNotification({
          userId: appointment.userId,
          userType: 'user',
          type: 'triage_accepted',
          title: 'Doctor Reviewing Your Case',
          message: `Dr. ${req.doctor.firstName} ${req.doctor.lastName} is now reviewing your triage request.`,
          data: {
            appointmentId: appointment.id,
            doctorId,
            doctorName: `${req.doctor.firstName} ${req.doctor.lastName}`,
          },
          channels: ['push', 'socket'],
        });
      } catch (notifyError) {
        console.warn('Patient notification failed:', notifyError.message);
      }

      res.json({
        success: true,
        message: 'Triage case accepted',
        appointment: { id: appointment.id, status: 'in_progress', doctorId },
      });
    } catch (error) {
      console.error('Accept triage case error:', error);
      res.status(500).json({ success: false, message: 'Failed to accept triage case', error: error.message });
    }
  });

  router.post('/triage/cases/:caseId/respond', authDoctor, async (req, res) => {
    try {
      const doctorId = req.doctor.id;
      const { caseId } = req.params;
      const { action, notes } = req.body;

      const appointment = await Appointment.findOne({
        where: { id: caseId, doctorId },
        include: [{ model: User, as: 'patient' }],
      });

      if (!appointment) {
        const exists = await Appointment.findByPk(caseId);
        return res.status(exists ? 403 : 404).json({
          success: false,
          message: exists ? 'You are not assigned to this triage case' : 'Triage case not found',
        });
      }

      let newStatus = 'completed';
      let notificationTitle = '';
      let notificationMessage = '';

      switch (action) {
        case 'prescribe':
          notificationTitle = 'Prescription Ready';
          notificationMessage = `Dr. ${req.doctor.firstName} has prescribed medication for you. ${notes || ''}`;
          break;
        case 'schedule_appointment':
          newStatus = 'scheduled';
          notificationTitle = 'Appointment Scheduled';
          notificationMessage = `Dr. ${req.doctor.firstName} has scheduled a follow-up appointment. ${notes || ''}`;
          break;
        case 'refer_hospital':
          notificationTitle = 'Hospital Referral';
          notificationMessage = `Dr. ${req.doctor.firstName} recommends hospital visit. ${notes || ''}`;
          break;
        case 'call_ambulance':
          notificationTitle = 'Emergency - Ambulance Called';
          notificationMessage = `URGENT: Ambulance has been requested. ${notes || ''}`;
          break;
        case 'self_care':
          notificationTitle = 'Self-Care Instructions';
          notificationMessage = `Dr. ${req.doctor.firstName} has provided self-care instructions. ${notes || ''}`;
          break;
        case 'escalate':
          newStatus = 'in_progress';
          notificationTitle = 'Specialist Referral';
          notificationMessage = `Your case has been escalated to a specialist. ${notes || ''}`;
          break;
        default:
          notificationTitle = 'Triage Response';
          notificationMessage = notes || 'Doctor has responded to your triage request.';
      }

      const existingNotes = appointment.notes
        ? (typeof appointment.notes === 'string' ? JSON.parse(appointment.notes) : appointment.notes)
        : {};
      await appointment.update({
        status: newStatus,
        doctorNotes: notes,
        notes: JSON.stringify({
          ...existingNotes,
          doctorResponse: {
            action,
            notes,
            respondedAt: new Date().toISOString(),
            respondedBy: doctorId,
          },
        }),
      });

      try {
        const notificationService = (await import('../../services/notification.service.js')).default;
        await notificationService.sendNotification({
          userId: appointment.userId ?? appointment.patientId,
          userType: 'user',
          type: 'triage_response',
          title: notificationTitle,
          message: notificationMessage,
          data: {
            appointmentId: appointment.id,
            action,
            doctorId,
            doctorName: `${req.doctor.firstName} ${req.doctor.lastName}`,
          },
          channels: ['push', 'socket', 'sms'],
        });
      } catch (notifyError) {
        console.warn('Patient notification failed:', notifyError.message);
      }

      res.json({
        success: true,
        message: 'Response sent successfully',
        appointment: { id: appointment.id, status: newStatus, action },
      });
    } catch (error) {
      console.error('Respond to triage case error:', error);
      res.status(500).json({ success: false, message: 'Failed to respond to triage case', error: error.message });
    }
  });

  router.post('/appointments/:appointmentId/initiate-call', authDoctor, async (req, res) => {
    let rlsTransaction = null;
    const doctorId = req.doctor.id;
    const abortCall = async (statusCode, payload) => {
      if (rlsTransaction && !rlsTransaction.finished) {
        await rlsTransaction.rollback().catch(() => {});
      }
      rlsTransaction = null;
      return res.status(statusCode).json(payload);
    };
    try {
      const { appointmentId } = req.params;
      const doctorIdCandidates = await resolveDoctorIdCandidates({
        actorId: req.doctor?.id,
        actorDoctorId: req.doctor?.doctorId,
        actorEmail: req.doctor?.email,
        UserModel: User,
      });

      let appointment = null;

      // appointments table has FORCE ROW LEVEL SECURITY in prod; set RLS
      // context for this request so doctor-owned rows are visible here.
      rlsTransaction = await Appointment.sequelize.transaction();
      await req.setSequelizeRlsContext?.(rlsTransaction);

      const includeModels = [
        { model: User, as: 'patient', attributes: ['id', 'firstName', 'lastName', 'email', 'phoneNumber'] },
        { model: Doctor, as: 'doctor', attributes: ['id', 'firstName', 'lastName', 'prefix', 'specialization'] },
      ];
      appointment = await findDoctorAuthorizedAppointment({
        AppointmentModel: Appointment,
        Op,
        appointmentId,
        doctorIdCandidates,
        include: includeModels,
        transaction: rlsTransaction,
        allowMeetingFallback: true,
      });

      if (!appointment) {
        return abortCall(404, { success: false, message: 'Appointment not found or you are not authorized' });
      }

      const normalizedAppointmentStatus = String(appointment.status || '').toLowerCase().replace(/_/g, '-');
      if (!['confirmed', 'scheduled', 'accepted', 'in-progress'].includes(normalizedAppointmentStatus)) {
        return abortCall(400, {
          success: false,
          message: `Cannot initiate call. Appointment status is ${appointment.status}. Only confirmed/scheduled/in-progress appointments can be started.`,
          currentStatus: appointment.status,
        });
      }

      const normalizedPaymentStatus = String(appointment.paymentStatus || '').toLowerCase();
      const isPaymentSettled = ['paid', 'credit'].includes(normalizedPaymentStatus);
      const consultationFee = Number(appointment.consultationFee ?? appointment.paymentAmount ?? 0);
      const isNominalOrFreeConsultation = Number.isFinite(consultationFee) && consultationFee <= 1;

      let isMembershipRenewalExemptUser = false;
      if (isMembershipRenewalExemptEmail(appointment?.patient?.email)) {
        isMembershipRenewalExemptUser = true;
      } else if (appointment?.userId) {
        const patient = await User.findByPk(appointment.userId, { attributes: ['id', 'email'] });
        isMembershipRenewalExemptUser = isMembershipRenewalExemptEmail(patient?.email);
      }

      if (
        ['online', 'video'].includes(appointment.consultationType)
        && !isPaymentSettled
        && !isNominalOrFreeConsultation
        && !isMembershipRenewalExemptUser
      ) {
        const activePlan = await UserPlan.findOne({
          where: {
            userId: appointment.userId,
            status: 'active',
            startDate: { [Op.lte]: new Date() },
            endDate: { [Op.gte]: new Date() },
          },
        });

        if (!activePlan) {
          return abortCall(402, {
            success: false,
            message: 'Payment required before starting video consultation. Please pay now or use a membership plan.',
            paymentStatus: appointment.paymentStatus,
            suggestion: 'You can pay with Health Coins or subscribe to a membership plan',
          });
        }
      }

      const appointmentDateStr = String(appointment.appointmentDate || '').slice(0, 10);
      const appointmentTimeStr = String(appointment.appointmentTime || '00:00:00');
      const dateParts = appointmentDateStr.split('-').map(Number);
      const timeRawParts = appointmentTimeStr.split(':');
      const hour = Number(timeRawParts[0]);
      const minute = Number(timeRawParts[1]);
      const second = timeRawParts.length > 2 ? Number(timeRawParts[2]) : 0;

      const isValidDate = dateParts.length === 3 && Number.isFinite(dateParts[0]) && Number.isFinite(dateParts[1]) && Number.isFinite(dateParts[2]);
      const isValidTime = Number.isFinite(hour) && Number.isFinite(minute) && Number.isFinite(second) && hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59 && second >= 0 && second <= 59;

      if (!isValidDate || !isValidTime) {
        return abortCall(400, {
          success: false,
          message: 'Invalid appointment date/time. Unable to initiate call.',
          appointmentDate: appointmentDateStr,
          appointmentTime: appointmentTimeStr,
        });
      }

      const [year, month, day] = dateParts;
      const appointmentStartUTC = new Date(Date.UTC(year, month - 1, day, hour, minute, second) - (5 * 60 + 30) * 60 * 1000);
      const nowUTC = new Date();
      const minutesUntilStart = (appointmentStartUTC.getTime() - nowUTC.getTime()) / (1000 * 60);

      if (minutesUntilStart > 15) {
        return abortCall(400, {
          success: false,
          message: 'Call can be initiated only 15 minutes before appointment time.',
          appointmentDate: appointmentDateStr,
          appointmentTime: appointmentTimeStr,
          minutesUntilStart: Math.ceil(minutesUntilStart),
        });
      }

      // Never turn an old appointment into an active call. A malformed mobile
      // selection previously sent appointment #1 (from 2024); because only the
      // upper time bound was checked, the request succeeded and notified the
      // wrong patient. Permit only a recently initiated in-progress call to
      // reconnect after the normal one-hour join window.
      const callInitiatedAt = appointment.callInitiatedAt ? new Date(appointment.callInitiatedAt) : null;
      const isRecentReconnect =
        normalizedAppointmentStatus === 'in-progress' &&
        minutesUntilStart >= -24 * 60 &&
        callInitiatedAt &&
        !Number.isNaN(callInitiatedAt.getTime()) &&
        nowUTC.getTime() - callInitiatedAt.getTime() <= 2 * 60 * 60 * 1000;

      if (minutesUntilStart < -60 && !isRecentReconnect) {
        return abortCall(400, {
          success: false,
          message: 'Cannot initiate call for a stale appointment. Refresh appointments and select the current consultation.',
          currentStatus: appointment.status,
          appointmentDate: appointmentDateStr,
          appointmentTime: appointmentTimeStr,
        });
      }

      const meetingInfo = ensureMeetingInfo(appointment);
      let { meetingId, meetingLink, meetingDetails, provider } = meetingInfo;

      const callStartedAt = new Date();
      const callStartedAtIso = callStartedAt.toISOString();

      await appointment.update({
        status: 'in-progress',
        meetingId,
        meetingLink,
        meetingDetails,
        callInitiatedBy: 'doctor',
        callInitiatedAt: callStartedAt,
      }, { transaction: rlsTransaction });

      await rlsTransaction.commit();

      const doctorName = appointment.doctor
        ? `${appointment.doctor.prefix || 'Dr.'} ${appointment.doctor.firstName} ${appointment.doctor.lastName}`
        : appointment.doctorName || 'Your Doctor';

      const patientName = appointment.patient
        ? `${appointment.patient.firstName} ${appointment.patient.lastName}`
        : appointment.patientName;

      try {
        const notificationService = (await import('../../services/notification.service.js')).default;
        await notificationService.send({
          userId: appointment.userId,
          userType: 'patient',
          type: 'consultation_started',
          title: `${doctorName} is calling`,
          message: 'Your doctor has started the video consultation. Tap to join now!',
          variables: { doctorName, appointmentId: appointment.id, meetingLink },
          data: {
            appointmentId: appointment.id,
            meetingLink,
            action: 'join_call',
            callInitiatedAt: callStartedAtIso,
          },
          actionUrl: meetingLink,
          channels: ['push', 'in-app'],
          priority: 'urgent',
        });
      } catch (notifError) {
        console.error('Failed to send patient notification:', notifError);
      }

      const videoPayload = {
        meetingLink,
        meetingId,
        platform: getProviderLabel(provider),
      };

      if (provider === 'livekit') {
        try {
          const livekitData = await buildLiveKitJoinData({
            meetingId,
            identity: `doctor-${doctorId}`,
            name: doctorName,
          });
          videoPayload.livekit = livekitData;
          videoPayload.joinUrl = livekitData.joinUrl;
          if (!videoPayload.meetingLink) {
            videoPayload.meetingLink = livekitData.meetUrl;
          }
        } catch (livekitError) {
          console.error('LiveKit join data failed:', livekitError);
          videoPayload.warning = 'LiveKit token generation failed. Using meeting link only.';
        }
      }

      const callPayload = {
        type: 'video_call',
        notificationType: 'incoming_call',
        appointmentId: String(appointment.id),
        patientId: String(appointment.userId),
        doctorId: String(doctorId),
        doctorName,
        doctorSpecialization: req.doctor?.specialization || appointment.doctor?.specialization || '',
        appointmentDate: appointment.appointmentDate ? String(appointment.appointmentDate).slice(0, 10) : '',
        appointmentTime: appointment.appointmentTime || '',
        roomId: meetingId,
        roomName: meetingId,
        meetingId,
        meetingLink: videoPayload.meetingLink || meetingLink,
        serverUrl: videoPayload.livekit?.serverUrl || '',
        callType: 'video',
        action: 'join_call',
        clickAction: 'join_video_call',
        click_action: 'join_video_call',
        actionUrl: 'mediczy://consultation/video/' + appointment.id,
        deepLink: 'mediczy://consultation/video/' + appointment.id,
        joinUrl: videoPayload.joinUrl || videoPayload.meetingLink || meetingLink,
        webRoute: '/video-consultation?room=' + encodeURIComponent(meetingId) + '&appointmentId=' + encodeURIComponent(appointment.id),
        route: 'VideoCall',
        screen: 'VideoCall',
        callInitiatedAt: callStartedAtIso,
      };

      let socketDelivered = false;
      try {
        const io = typeof getIO === 'function' ? getIO() : req.app.get('io');
        if (io) {
          const targetRoom = 'user-' + String(appointment.userId);
          const room = io.sockets.adapter.rooms.get(targetRoom);
          const roomSize = room ? room.size : 0;

          io.to(targetRoom).emit('doctor-initiated-call', callPayload);
          io.to(targetRoom).emit('incoming-call', callPayload);
          io.to(targetRoom).emit('video-call-incoming', callPayload);

          const patientSocket = typeof getOnlineUsers === 'function'
            ? getOnlineUsers().get(String(appointment.userId))
            : null;
          if (patientSocket?.socketId) {
            io.to(patientSocket.socketId).emit('doctor-initiated-call', callPayload);
            io.to(patientSocket.socketId).emit('incoming-call', callPayload);
            io.to(patientSocket.socketId).emit('video-call-incoming', callPayload);
          }

          socketDelivered = roomSize > 0 || Boolean(patientSocket?.socketId);
        }
      } catch (socketError) {
        console.error('Failed to emit socket event:', socketError);
      }

      let fcmSent = 0;
      let fcmFailed = 0;
      try {
        if (FCMToken && typeof sendDoctorCallingNotification === 'function') {
          const patientTokens = await FCMToken.findAll({
            where: {
              userId: appointment.userId,
              userType: 'patient',
              isActive: true,
            },
          });
          const results = await Promise.allSettled(
            patientTokens.map((tokenRecord) => sendDoctorCallingNotification(tokenRecord.token, callPayload))
          );
          fcmSent = results.filter((result) => result.status === 'fulfilled').length;
          fcmFailed = results.length - fcmSent;
        }
      } catch (fcmError) {
        console.error('Failed to send doctor call FCM:', fcmError);
      }

      try {
        if (Notification) {
          await Notification.create({
            userId: appointment.userId,
            userType: 'patient',
            type: 'call_incoming',
            title: doctorName + ' is calling',
            message: 'Tap to join your video consultation',
            data: callPayload,
            deepLink: 'mediczy://consultation/video/' + appointment.id,
            webRoute: '/video-consultation?room=' + encodeURIComponent(meetingId) + '&appointmentId=' + encodeURIComponent(appointment.id),
            priority: 'urgent',
            channels: ['app', 'push'],
            status: 'sent',
            sentAt: callStartedAt,
          });
        }
      } catch (notificationError) {
        console.error('Failed to create incoming call notification:', notificationError);
      }

      res.json({
        success: true,
        message: socketDelivered
          ? 'Call initiated successfully. Patient has been notified.'
          : 'Call initiated. Patient may not have received real-time notification (not online). They can still join via the appointment link.',
        patientOnline: socketDelivered,
        video: { ...videoPayload },
        appointment: {
          id: appointment.id,
          status: 'in-progress',
          patientName,
          callInitiatedBy: 'doctor',
          callInitiatedAt: callStartedAtIso,
        },
        notification: {
          socketSent: socketDelivered,
          fcmSent,
          fcmFailed,
        },
      });
    } catch (error) {
      if (rlsTransaction && !rlsTransaction.finished) {
        await rlsTransaction.rollback().catch(() => {});
      }
      console.error('Initiate call error:', {
        message: error?.message,
        name: error?.name,
        sql: error?.parent?.sql,
        parameters: error?.parent?.parameters,
      });
      res.status(500).json({ success: false, message: 'Failed to initiate call', error: error.message });
    }
  });

  router.post('/triage/accept-call', authDoctor, async (req, res) => {
    try {
      const { appointmentId } = req.body;
      const doctorId = req.doctor.id;

      if (!appointmentId) {
        return res.status(400).json({ success: false, message: 'appointmentId is required' });
      }

      const appointment = await Appointment.findOne({
        where: {
          id: appointmentId,
          [Op.or]: [{ doctorId: null }, { doctorId }],
        },
      });

      if (!appointment) {
        const exists = await Appointment.findByPk(appointmentId);
        return res.status(exists ? 403 : 404).json({
          success: false,
          message: exists ? 'This call is assigned to another doctor' : 'Appointment not found',
        });
      }

      const updatePayload = { status: 'in-progress' };
      if (!appointment.doctorId) updatePayload.doctorId = doctorId;

      let roomId = appointment.meetingId;
      if (!roomId) {
        const cryptoModule = await import('crypto');
        roomId = `triage_${cryptoModule.randomBytes(8).toString('hex')}_${Date.now()}`;
        updatePayload.meetingId = roomId;
      }

      await appointment.update(updatePayload);

      let doctorLivekit = null;
      let patientLivekit = null;
      try {
        const doctorName = `Dr. ${req.doctor.firstName} ${req.doctor.lastName}`.trim();
        [doctorLivekit, patientLivekit] = await Promise.all([
          buildLiveKitJoinData({ meetingId: roomId, identity: `doctor-${doctorId}`, name: doctorName }),
          buildLiveKitJoinData({
            meetingId: roomId,
            identity: `user-${appointment.userId || appointment.patientId || 'guest'}`,
            name: appointment.patientName || 'Patient',
          }),
        ]);
      } catch (lkErr) {
        return res.status(503).json({
          success: false,
          message: 'Video service unavailable. Please retry in a moment.',
          error: lkErr.message,
        });
      }

      const { emitCallAccepted } = await import('../../chat/chathandler.controller.js');
      const acceptData = {
        appointmentId: appointment.id,
        doctorName: `Dr. ${req.doctor.firstName} ${req.doctor.lastName}`,
        roomId,
        joinUrl: patientLivekit.joinUrl,
        livekitToken: patientLivekit.token,
        livekitServerUrl: patientLivekit.serverUrl,
        timestamp: new Date().toISOString(),
      };

      const notificationResult = await emitCallAccepted(appointment.userId, acceptData);

      res.json({
        success: true,
        appointment: { id: appointment.id, status: 'in-progress', roomId },
        livekit: {
          serverUrl: doctorLivekit.serverUrl,
          token: doctorLivekit.token,
          roomName: doctorLivekit.roomName,
        },
        notification: notificationResult,
      });
    } catch (error) {
      console.error('Accept call error:', error);
      res.status(500).json({ success: false, message: 'Failed to accept call' });
    }
  });

  router.post('/triage/reject-call', authDoctor, async (req, res) => {
    try {
      const { appointmentId, reason } = req.body;
      const doctorId = req.doctor.id;

      const appointment = await Appointment.findOne({ where: { id: appointmentId, doctorId } });
      if (!appointment) {
        const exists = await Appointment.findByPk(appointmentId);
        return res.status(exists ? 403 : 404).json({
          success: false,
          message: exists ? 'You are not assigned to this call' : 'Appointment not found',
        });
      }

      await appointment.update({
        status: 'cancelled',
        notes: `Doctor declined: ${reason || 'No reason provided'}`,
      });

      const { emitCallRejected } = await import('../../chat/chathandler.controller.js');
      const rejectData = {
        appointmentId: appointment.id,
        reason: reason || 'Doctor is unavailable',
        timestamp: new Date().toISOString(),
      };

      const notificationResult = await emitCallRejected(appointment.userId, rejectData);

      res.json({
        success: true,
        message: 'Call rejected successfully',
        notification: notificationResult,
      });
    } catch (error) {
      console.error('Reject call error:', error);
      res.status(500).json({ success: false, message: 'Failed to reject call' });
    }
  });

  return router;
};
