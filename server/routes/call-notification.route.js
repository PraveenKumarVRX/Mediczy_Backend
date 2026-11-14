/**
 * Call Notification Routes
 * Handles FCM notifications for voice/video calls from doctor to patient
 */

import express from 'express';
import { authUser, requireRole } from '../middleware/auth.middleware.js';
import { sendDoctorCallingNotification } from '../utils/firebase-admin.js';
import { FCMToken } from '../services/notification.service.js';
import { postgresSequelize } from '../db/postgres-sequelize.js';

const router = express.Router();

/**
 * @route   POST /api/call-notification/doctor-to-patient
 * @desc    Send call notification from doctor to patient
 * @access  Doctor only
 * @body    {
 *            patientId: number,
 *            appointmentId: number,
 *            callType: 'video' | 'voice',
 *            meetingLink?: string,
 *            roomId?: string
 *          }
 */
router.post('/doctor-to-patient', authUser, requireRole('doctor'), async (req, res) => {
  try {
    const doctorId = req.user.id || req.user.doctorId || req.user.dataValues?.id;
    const { patientId, appointmentId, callType = 'video', meetingLink, roomId } = req.body;

    // Validate required fields
    if (!patientId || !appointmentId) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: patientId and appointmentId are required'
      });
    }

    // Get doctor details
    const [doctorDetails] = await postgresSequelize.query(`
      SELECT 
        id,
        "firstName" AS first_name,
        "lastName" AS last_name,
        specialization,
        "profileImage" AS profile_pic_url
      FROM doctors
      WHERE id = :doctorId
    `, {
      replacements: { doctorId },
      type: postgresSequelize.QueryTypes.SELECT
    });

    if (!doctorDetails) {
      return res.status(404).json({
        success: false,
        message: 'Doctor not found'
      });
    }

    const doctorName = `Dr. ${doctorDetails.first_name} ${doctorDetails.last_name}`;

    // Get patient's FCM token(s)
    // Include both 'patient' and 'user' userType since some tokens may be
    // registered under the generic 'user' role rather than 'patient'
    const patientTokens = await FCMToken.findAll({
      where: { 
        userId: patientId, 
        userType: ['patient', 'user'],
        isActive: true 
      }
    });

    if (!patientTokens || patientTokens.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Patient FCM token not found. Patient may not have push notifications enabled.'
      });
    }

    // Prepare call data
    const callData = {
      appointmentId: String(appointmentId),
      doctorId: String(doctorId),
      doctorName,
      doctorSpecialization: doctorDetails.specialization,
      doctorProfilePic: doctorDetails.profile_pic_url || '',
      callType,
      meetingLink: meetingLink || '',
      roomId: roomId || '',
      callInitiatedAt: new Date().toISOString()
    };

    // Send FCM notification to all patient's devices
    const notificationResults = [];
    const errors = [];

    for (const tokenRecord of patientTokens) {
      try {
        const messageId = await sendDoctorCallingNotification(tokenRecord.token, callData);
        notificationResults.push({
          deviceType: tokenRecord.deviceType,
          success: true,
          messageId
        });
      } catch (error) {
        // Auto-deactivate stale/unregistered tokens so future calls go to valid devices
        const code = error.errorInfo?.code || error.code || '';
        if (code.includes('registration-token-not-registered') || code.includes('invalid-registration-token')) {
          console.warn(`[FCM] Stale token detected, deactivating for userId=${tokenRecord.userId}:`, tokenRecord.token.slice(0, 20) + '...');
          await postgresSequelize.query(
            'UPDATE fcm_tokens SET "isActive"=false WHERE id=:id',
            { replacements: { id: tokenRecord.id } }
          ).catch(() => {});
        }
        errors.push({
          deviceType: tokenRecord.deviceType,
          error: error.message
        });
      }
    }

    // Log the call notification event
    await postgresSequelize.query(`
      INSERT INTO notifications (
        "userId", 
        "userType", 
        type, 
        title, 
        message, 
        data, 
        "isRead", 
        "createdAt",
        "updatedAt"
      ) VALUES (
        :patientId,
        'patient',
        'call_incoming',
        :title,
        :message,
        :data,
        false,
        NOW(),
        NOW()
      )
    `, {
      replacements: {
        patientId,
        title: `${doctorName} is calling`,
        message: `${callType === 'video' ? 'Video' : 'Voice'} call from ${doctorName}`,
        data: JSON.stringify(callData)
      }
    });

    res.json({
      success: true,
      message: `Call notification sent to patient`,
      results: {
        sentCount: notificationResults.length,
        failedCount: errors.length,
        notifications: notificationResults,
        errors: errors.length > 0 ? errors : undefined
      },
      callData: {
        doctorName,
        patientId,
        appointmentId,
        callType,
        timestamp: callData.callInitiatedAt
      }
    });

  } catch (error) {
    console.error('Error sending doctor call notification:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send call notification',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/call-notification/end-call
 * @desc    Notify patient that call has ended
 * @access  Doctor only
 */
router.post('/end-call', authUser, requireRole('doctor'), async (req, res) => {
  try {
    const { patientId, appointmentId, duration } = req.body;

    if (!patientId || !appointmentId) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields'
      });
    }

    // Update notification status
    await postgresSequelize.query(`
      UPDATE notifications 
      SET "isRead" = true,
          data = jsonb_set(data::jsonb, '{callEnded}', 'true'::jsonb)
      WHERE "userId" = :patientId 
        AND type = 'call_incoming'
        AND data->>'appointmentId' = :appointmentId
        AND COALESCE("isRead", false) = false
    `, {
      // The columns are camelCase ("userId", "isRead"); the old snake_case
      // update matched no row, so ended calls kept ringing as unread.
      replacements: { patientId, appointmentId: String(appointmentId) }
    });

    res.json({
      success: true,
      message: 'Call ended notification processed'
    });

  } catch (error) {
    console.error('Error ending call notification:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process call end',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/call-notification/patient/:patientId/status
 * @desc    Check if patient has FCM token registered (can receive call notifications)
 * @access  Doctor only
 */
router.get('/patient/:patientId/status', authUser, requireRole('doctor'), async (req, res) => {
  try {
    const { patientId } = req.params;

    const tokens = await FCMToken.findAll({
      where: { 
        userId: patientId, 
        userType: ['patient', 'user'],
        isActive: true 
      },
      attributes: ['deviceType', 'updatedAt']
    });

    res.json({
      success: true,
      canReceiveCallNotifications: tokens.length > 0,
      devices: tokens.map(t => ({
        type: t.deviceType,
        lastUpdated: t.updatedAt
      }))
    });

  } catch (error) {
    console.error('Error checking patient notification status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check patient notification status',
      error: error.message
    });
  }
});

/**
 * POST /api/call-notification/decline   { appointmentId, reason? }
 * The patient declined an incoming call. Closes the incoming-call notification
 * and tells the doctor live (socket room doctor-<doctorId>, event
 * 'call-declined'), so the doctor stops waiting (audit M6).
 * Only for the caller's own appointment, matched on appointments."userId".
 */
router.post('/decline', authUser, async (req, res) => {
  try {
    const appointmentId = Number(req.body?.appointmentId);
    if (!Number.isSafeInteger(appointmentId) || appointmentId <= 0) {
      return res.status(400).json({ success: false, message: 'appointmentId is required' });
    }
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.slice(0, 120) : null;
    const [appointment] = await postgresSequelize.query(
      `SELECT id, "doctorId" FROM appointments WHERE id = :appointmentId AND "userId" = :userId LIMIT 1`,
      { replacements: { appointmentId, userId: req.user.id }, type: postgresSequelize.QueryTypes.SELECT }
    );
    if (!appointment) return res.status(404).json({ success: false, message: 'Appointment not found' });

    const declinedAt = new Date().toISOString();
    await postgresSequelize.query(
      `UPDATE notifications
          SET "isRead" = true,
              data = (COALESCE(data::jsonb, '{}'::jsonb) || jsonb_build_object('declined', true, 'declinedAt', CAST(:declinedAt AS text)))
        WHERE "userId" = :userId
          AND type = 'call_incoming'
          AND data->>'appointmentId' = :appointmentId
          AND COALESCE("isRead", false) = false`,
      { replacements: { userId: req.user.id, appointmentId: String(appointmentId), declinedAt } }
    );

    let notified = false;
    const io = req.app.get('io') || global.io;
    if (io && appointment.doctorId) {
      io.to(`doctor-${appointment.doctorId}`).emit('call-declined', { appointmentId, declinedAt, reason });
      notified = true;
    }
    return res.json({ success: true, notified });
  } catch (error) {
    console.error('Call decline error:', error.message);
    return res.status(500).json({ success: false, message: 'Could not record the declined call' });
  }
});

export default router;
