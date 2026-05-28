// =====================================================
// Doctor Webinar Routes
// Doctor endpoints for hosting and managing webinars
// =====================================================

import express from 'express';
import { AccessToken } from 'livekit-server-sdk';
import { Sequelize, QueryTypes } from 'sequelize';

const router = express.Router();

// Database connection
const sequelize = new Sequelize(
  process.env.POSTGRES_DATABASE || 'mediczy_ai',
  process.env.POSTGRES_USER || 'mediczy_helper',
  process.env.POSTGRES_PASSWORD || 'Mediczy2024Helper',
  {
    host: process.env.POSTGRES_HOST || '127.0.0.1',
    dialect: 'postgres',
    logging: false
  }
);

// Middleware to verify doctor
const verifyDoctor = (req, res, next) => {
  if (req.user && (req.user.role === 'doctor' || req.user.userType === 'doctor')) {
    next();
  } else {
    res.status(403).json({ 
      success: false, 
      message: 'Access denied. Doctor only.' 
    });
  }
};

// ============================================
// GET MY WEBINARS (Doctor's webinars)
// ============================================
router.get('/my-webinars', verifyDoctor, async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const doctorId = req.user.doctorId || req.user.id;
    const pageNumber = Math.max(parseInt(page, 10) || 1, 1);
    const limitNumber = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);

    let query = `
      SELECT 
        w.*,
        COUNT(DISTINCT wr.id) as total_registrations,
        COUNT(DISTINCT CASE WHEN wr.registration_status = 'approved' THEN wr.id END) as approved_registrations,
        COUNT(DISTINCT CASE WHEN wr.attendance_status = 'attended' THEN wr.id END) as total_attendees,
        a.peak_concurrent_users,
        a.engagement_score
      FROM webinars w
      LEFT JOIN webinar_registrations wr ON w.id = wr.webinar_id
      LEFT JOIN webinar_analytics a ON w.id = a.webinar_id
      WHERE w.doctor_id = $1
    `;
    
    const params = [doctorId];
    let paramCount = 2;

    if (status) {
      query += ` AND w.status = $${paramCount}`;
      params.push(status);
      paramCount++;
    }

    query += ` GROUP BY w.id, a.peak_concurrent_users, a.engagement_score`;
    query += ` ORDER BY w.scheduled_at DESC`;
    
    const offset = (pageNumber - 1) * limitNumber;
    query += ` LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    params.push(limitNumber, offset);

    const webinars = await sequelize.query(query, {
      bind: params,
      type: QueryTypes.SELECT
    });

    res.json({
      success: true,
      webinars: webinars.map(w => ({
        id: w.id,
        title: w.title,
        description: w.description,
        scheduledAt: w.scheduled_at,
        duration: w.duration,
        status: w.status,
        totalRegistrations: parseInt(w.total_registrations),
        approvedRegistrations: parseInt(w.approved_registrations),
        totalAttendees: parseInt(w.total_attendees),
        peakConcurrentUsers: w.peak_concurrent_users,
        engagementScore: w.engagement_score,
        roomName: w.livekit_room_name,
        startedAt: w.started_at,
        endedAt: w.ended_at,
        canStart: w.status === 'scheduled' && new Date(w.scheduled_at) <= new Date(),
        canEnd: w.status === 'live'
      }))
    });
  } catch (error) {
    console.error('Error fetching doctor webinars:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch webinars',
      error: error.message
    });
  }
});

// ============================================
// GET WEBINAR DETAILS (Doctor view)
// ============================================
router.get('/:id', verifyDoctor, async (req, res) => {
  try {
    const { id } = req.params;
    const doctorId = req.user.doctorId || req.user.id;

    const webinars = await sequelize.query(
      `SELECT 
        w.*,
        a.total_registrations,
        a.total_attendees,
        a.peak_concurrent_users,
        a.average_watch_duration,
        a.total_questions,
        a.total_chat_messages,
        a.engagement_score
      FROM webinars w
      LEFT JOIN webinar_analytics a ON w.id = a.webinar_id
      WHERE w.id = $1 AND w.doctor_id = $2`,
      { bind: [id, doctorId], type: QueryTypes.SELECT }
    );

    if (webinars.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Webinar not found or access denied'
      });
    }

    const webinar = webinars[0];

    // Get approved registrations
    const registrations = await sequelize.query(
      `SELECT 
        wr.*,
        CONCAT(u."firstName", ' ', u."lastName") as user_name,
        u.email as user_email,
        u."phoneNumber" as user_phone
      FROM webinar_registrations wr
      JOIN users u ON wr.user_id = u.id
      WHERE wr.webinar_id = $1 AND wr.registration_status = 'approved'
      ORDER BY wr.created_at DESC`,
      { bind: [id], type: QueryTypes.SELECT }
    );

    res.json({
      success: true,
      webinar: {
        id: webinar.id,
        title: webinar.title,
        description: webinar.description,
        scheduledAt: webinar.scheduled_at,
        duration: webinar.duration,
        maxParticipants: webinar.max_participants,
        status: webinar.status,
        roomName: webinar.livekit_room_name,
        settings: {
          recordingEnabled: webinar.recording_enabled,
          chatEnabled: webinar.chat_enabled,
          qaEnabled: webinar.qa_enabled
        },
        analytics: {
          totalRegistrations: webinar.total_registrations,
          totalAttendees: webinar.total_attendees,
          peakConcurrentUsers: webinar.peak_concurrent_users,
          averageWatchDuration: webinar.average_watch_duration,
          totalQuestions: webinar.total_questions,
          totalChatMessages: webinar.total_chat_messages,
          engagementScore: webinar.engagement_score
        },
        attendees: registrations,
        startedAt: webinar.started_at,
        endedAt: webinar.ended_at
      }
    });
  } catch (error) {
    console.error('Error fetching webinar details:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch webinar details',
      error: error.message
    });
  }
});

// ============================================
// START WEBINAR
// ============================================
router.post('/:id/start', verifyDoctor, async (req, res) => {
  try {
    const { id } = req.params;
    const doctorId = req.user.doctorId || req.user.id;

    // Verify webinar belongs to doctor
    const checkResult = await sequelize.query(
      `SELECT * FROM webinars WHERE id = $1 AND doctor_id = $2`,
      { bind: [id, doctorId], type: QueryTypes.SELECT }
    );

    if (checkResult.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Webinar not found or access denied'
      });
    }

    const webinar = checkResult[0];

    if (webinar.status === 'live') {
      return res.status(400).json({
        success: false,
        message: 'Webinar is already live'
      });
    }

    if (webinar.status === 'completed') {
      return res.status(400).json({
        success: false,
        message: 'Webinar has already been completed'
      });
    }

    // Update webinar status to live
    await sequelize.query(
      `UPDATE webinars 
       SET status = 'live', started_at = CURRENT_TIMESTAMP 
       WHERE id = $1`,
      { bind: [id] }
    );

    // Generate LiveKit token for host
    const at = new AccessToken(
      process.env.LIVEKIT_API_KEY,
      process.env.LIVEKIT_API_SECRET,
      {
        identity: `doctor-${doctorId}`,
        name: req.user.name,
        metadata: JSON.stringify({
          role: 'host',
          webinarId: id,
          userId: doctorId
        })
      }
    );

    at.addGrant({
      roomJoin: true,
      room: webinar.livekit_room_name,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
      canUpdateOwnMetadata: true,
      roomAdmin: true,
      roomRecord: webinar.recording_enabled
    });

    const token = at.toJwt();

    res.json({
      success: true,
      message: 'Webinar started successfully',
      webinar: {
        id: webinar.id,
        title: webinar.title,
        status: 'live',
        roomName: webinar.livekit_room_name,
        startedAt: new Date()
      },
      livekit: {
        token: token,
        serverUrl: process.env.LIVEKIT_URL,
        roomName: webinar.livekit_room_name
      }
    });
  } catch (error) {
    console.error('Error starting webinar:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to start webinar',
      error: error.message
    });
  }
});

// ============================================
// END WEBINAR
// ============================================
router.post('/:id/end', verifyDoctor, async (req, res) => {
  try {
    const { id } = req.params;
    const doctorId = req.user.doctorId || req.user.id;

    // Verify webinar belongs to doctor
    const checkResult = await sequelize.query(
      `SELECT * FROM webinars WHERE id = $1 AND doctor_id = $2`,
      { bind: [id, doctorId], type: QueryTypes.SELECT }
    );

    if (checkResult.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Webinar not found or access denied'
      });
    }

    const webinar = checkResult[0];

    if (webinar.status !== 'live') {
      return res.status(400).json({
        success: false,
        message: 'Webinar is not currently live'
      });
    }

    // Update webinar status to completed
    const [updatedRows] = await sequelize.query(
      `UPDATE webinars 
       SET status = 'completed', ended_at = CURRENT_TIMESTAMP 
       WHERE id = $1
       RETURNING *`,
      { bind: [id] }
    );
    const updatedWebinar = updatedRows[0];

    // Update all attendees who haven't left
    await sequelize.query(
      `UPDATE webinar_registrations 
       SET left_at = CURRENT_TIMESTAMP,
           duration = EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - joined_at))::INTEGER
       WHERE webinar_id = $1 AND joined_at IS NOT NULL AND left_at IS NULL`,
      { bind: [id] }
    );

    res.json({
      success: true,
      message: 'Webinar ended successfully',
      webinar: {
        id: updatedWebinar.id,
        status: 'completed',
        startedAt: updatedWebinar.started_at,
        endedAt: updatedWebinar.ended_at,
        duration: Math.round((new Date(updatedWebinar.ended_at) - new Date(updatedWebinar.started_at)) / 1000 / 60)
      }
    });
  } catch (error) {
    console.error('Error ending webinar:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to end webinar',
      error: error.message
    });
  }
});

// ============================================
// START RECORDING
// ============================================
router.post('/:id/start-recording', verifyDoctor, async (req, res) => {
  try {
    const { id } = req.params;
    const doctorId = req.user.doctorId || req.user.id;

    // Verify webinar belongs to doctor
    const checkResult = await sequelize.query(
      `SELECT * FROM webinars WHERE id = $1 AND doctor_id = $2`,
      { bind: [id, doctorId], type: QueryTypes.SELECT }
    );

    if (checkResult.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Webinar not found or access denied'
      });
    }

    const webinar = checkResult[0];

    if (webinar.status !== 'live') {
      return res.status(400).json({
        success: false,
        message: 'Webinar must be live to start recording'
      });
    }

    if (!webinar.recording_enabled && !webinar.allow_recording) {
      return res.status(403).json({
        success: false,
        message: 'Recording is not enabled for this webinar'
      });
    }

    // Create recording record
    const [recordingRows] = await sequelize.query(
      `INSERT INTO webinar_recordings 
       (webinar_id, status, started_at, created_at, updated_at)
       VALUES ($1, 'recording', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       RETURNING *`,
      { bind: [id] }
    );
    const recording = recordingRows[0];

    res.json({
      success: true,
      message: 'Recording started',
      recording: {
        id: recording.id,
        status: 'recording',
        startedAt: recording.started_at
      }
    });
  } catch (error) {
    console.error('Error starting recording:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to start recording',
      error: error.message
    });
  }
});

// ============================================
// STOP RECORDING
// ============================================
router.post('/:id/stop-recording', verifyDoctor, async (req, res) => {
  try {
    const { id } = req.params;
    const doctorId = req.user.doctorId || req.user.id;

    // Verify webinar belongs to doctor
    const checkResult = await sequelize.query(
      `SELECT * FROM webinars WHERE id = $1 AND doctor_id = $2`,
      { bind: [id, doctorId], type: QueryTypes.SELECT }
    );

    if (checkResult.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Webinar not found or access denied'
      });
    }

    // Find active recording
    const recordingCheck = await sequelize.query(
      `SELECT * FROM webinar_recordings 
       WHERE webinar_id = $1 AND status = 'recording'
       ORDER BY started_at DESC LIMIT 1`,
      { bind: [id], type: QueryTypes.SELECT }
    );

    if (recordingCheck.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No active recording found'
      });
    }

    const recording = recordingCheck[0];

    // Update recording status
    const [updatedRows] = await sequelize.query(
      `UPDATE webinar_recordings 
       SET status = 'processing', 
           ended_at = CURRENT_TIMESTAMP,
           duration_seconds = EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - started_at))::INTEGER,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      { bind: [recording.id] }
    );
    const updatedRecording = updatedRows[0];

    res.json({
      success: true,
      message: 'Recording stopped and processing',
      recording: {
        id: updatedRecording.id,
        status: 'processing',
        durationSeconds: updatedRecording.duration_seconds
      }
    });
  } catch (error) {
    console.error('Error stopping recording:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to stop recording',
      error: error.message
    });
  }
});

// ============================================
// GET ATTENDEES (Real-time)
// ============================================
router.get('/:id/attendees', verifyDoctor, async (req, res) => {
  try {
    const { id } = req.params;
    const doctorId = req.user.doctorId || req.user.id;

    // Verify webinar belongs to doctor
    const checkResult = await sequelize.query(
      `SELECT * FROM webinars WHERE id = $1 AND doctor_id = $2`,
      { bind: [id, doctorId], type: QueryTypes.SELECT }
    );

    if (checkResult.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Webinar not found or access denied'
      });
    }

    const attendeesData = await sequelize.query(
      `SELECT 
        wr.*,
        CONCAT(u."firstName", ' ', u."lastName") as user_name,
        u.email as user_email,
        u."phoneNumber" as user_phone
      FROM webinar_registrations wr
      JOIN users u ON wr.user_id = u.id
      WHERE wr.webinar_id = $1
      ORDER BY wr.joined_at DESC NULLS LAST, wr.created_at DESC`,
      { bind: [id], type: QueryTypes.SELECT }
    );

    const attendees = attendeesData.map(a => ({
      id: a.id,
      userId: a.user_id,
      name: a.user_name,
      email: a.user_email,
      phone: a.user_phone,
      registrationStatus: a.registration_status,
      attendanceStatus: a.attendance_status,
      joinedAt: a.joined_at,
      leftAt: a.left_at,
      duration: a.duration,
      isOnline: a.joined_at && !a.left_at
    }));

    res.json({
      success: true,
      attendees: attendees,
      summary: {
        total: attendees.length,
        online: attendees.filter(a => a.isOnline).length,
        attended: attendees.filter(a => a.attendance_status === 'attended').length
      }
    });
  } catch (error) {
    console.error('Error fetching attendees:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch attendees',
      error: error.message
    });
  }
});

// ============================================
// GET Q&A QUESTIONS
// ============================================
router.get('/:id/questions', verifyDoctor, async (req, res) => {
  try {
    const { id } = req.params;
    const { answered } = req.query;
    const doctorId = req.user.doctorId || req.user.id;

    // Verify webinar belongs to doctor
    const checkResult = await sequelize.query(
      `SELECT * FROM webinars WHERE id = $1 AND doctor_id = $2`,
      { bind: [id, doctorId], type: QueryTypes.SELECT }
    );

    if (checkResult.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Webinar not found or access denied'
      });
    }

    let query = `
      SELECT 
        wcm.*,
        CONCAT(u."firstName", ' ', u."lastName") as user_name
      FROM webinar_chat_messages wcm
      JOIN users u ON wcm.user_id = u.id
      WHERE wcm.webinar_id = $1 AND wcm.message_type = 'question'
    `;

    const params = [id];

    if (answered !== undefined) {
      query += ` AND wcm.is_answered = $2`;
      params.push(answered === 'true');
    }

    query += ` ORDER BY wcm.is_pinned DESC, wcm.created_at DESC`;

    const questions = await sequelize.query(query, {
      bind: params,
      type: QueryTypes.SELECT
    });

    res.json({
      success: true,
      questions: questions.map(q => ({
        id: q.id,
        userId: q.user_id,
        userName: q.user_name,
        question: q.message,
        answer: q.answer,
        isAnswered: q.is_answered,
        isPinned: q.is_pinned,
        answeredBy: q.answered_by,
        createdAt: q.created_at
      }))
    });
  } catch (error) {
    console.error('Error fetching questions:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch questions',
      error: error.message
    });
  }
});

// ============================================
// ANSWER QUESTION
// ============================================
router.post('/:id/questions/:questionId/answer', verifyDoctor, async (req, res) => {
  try {
    const { id, questionId } = req.params;
    const { answer } = req.body;
    const doctorId = req.user.doctorId || req.user.id;

    // Verify webinar belongs to doctor
    const checkResult = await sequelize.query(
      `SELECT * FROM webinars WHERE id = $1 AND doctor_id = $2`,
      { bind: [id, doctorId], type: QueryTypes.SELECT }
    );

    if (checkResult.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Webinar not found or access denied'
      });
    }

    const [updatedRows] = await sequelize.query(
      `UPDATE webinar_chat_messages 
       SET answer = $1, is_answered = true, answered_by = $2
       WHERE id = $3 AND webinar_id = $4
       RETURNING *`,
      { bind: [answer, req.user.id, questionId, id] }
    );

    if (!updatedRows.length) {
      return res.status(404).json({
        success: false,
        message: 'Question not found'
      });
    }

    res.json({
      success: true,
      message: 'Question answered successfully',
      question: updatedRows[0]
    });
  } catch (error) {
    console.error('Error answering question:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to answer question',
      error: error.message
    });
  }
});

// ============================================
// GET WEBINAR RECORDINGS
// ============================================
router.get('/:id/recordings', verifyDoctor, async (req, res) => {
  try {
    const { id } = req.params;
    const doctorId = req.user.doctorId || req.user.id;

    // Verify webinar belongs to doctor
    const checkResult = await sequelize.query(
      `SELECT * FROM webinars WHERE id = $1 AND doctor_id = $2`,
      { bind: [id, doctorId], type: QueryTypes.SELECT }
    );

    if (checkResult.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Webinar not found or access denied'
      });
    }

    const recordings = await sequelize.query(
      `SELECT * FROM webinar_recordings WHERE webinar_id = $1 ORDER BY created_at DESC`,
      { bind: [id], type: QueryTypes.SELECT }
    );

    res.json({
      success: true,
      recordings
    });
  } catch (error) {
    console.error('Error fetching recordings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch recordings',
      error: error.message
    });
  }
});

export default router;
