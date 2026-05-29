// =====================================================
// Public Webinar Routes
// User endpoints for browsing and joining webinars
// =====================================================

import express from 'express';
import { AccessToken } from 'livekit-server-sdk';
import { Sequelize } from 'sequelize';
import webinarNotificationService from '../services/webinar-notification.service.js';

const router = express.Router();

// Database connection
const sequelize = new Sequelize(
  process.env.POSTGRES_DATABASE || 'mediczy_ai',
  process.env.POSTGRES_USER || 'mediczy_helper',
  process.env.POSTGRES_PASSWORD || (process.env.POSTGRES_PRIMARY_PASSWORD || process.env.POSTGRES_PASSWORD || process.env.DB_PASSWORD || process.env.DB_PASS || undefined),
  {
    host: process.env.POSTGRES_HOST || '127.0.0.1',
    dialect: 'postgres',
    logging: false
  }
);

// Middleware to verify authenticated user
const verifyAuth = (req, res, next) => {
  if (req.user) {
    next();
  } else {
    res.status(401).json({ 
      success: false, 
      message: 'Authentication required' 
    });
  }
};

// ============================================
// GET ALL PUBLIC WEBINARS (Browse)
// ============================================
router.get('/', async (req, res) => {
  try {
    const { 
      status = 'scheduled', 
      specialty,
      search,
      upcoming = 'true',
      page = 1, 
      limit = 20 
    } = req.query;

    let query = `
      SELECT 
        w.id,
        w.title,
        w.description,
        w.scheduled_at,
        w.duration,
        w.max_participants,
        w.status,
        w.thumbnail_url,
        w.tags,
        w.registration_required,
        d.id as doctor_id,
        CONCAT(d."firstName", ' ', d."lastName") as doctor_name,
        d.specialization as doctor_specialization,
        d."profileImage" as doctor_image,
        COUNT(DISTINCT wr.id) as total_registrations,
        COUNT(DISTINCT CASE WHEN wr.registration_status = 'approved' THEN wr.id END) as approved_count
      FROM webinars w
      LEFT JOIN doctors d ON w.doctor_id = d.id
      LEFT JOIN webinar_registrations wr ON w.id = wr.webinar_id
      WHERE 1=1
    `;
    
    const params = [];
    let paramCount = 1;

    if (status) {
      query += ` AND w.status = $${paramCount}`;
      params.push(status);
      paramCount++;
    }

    if (upcoming === 'true') {
      query += ` AND w.scheduled_at > CURRENT_TIMESTAMP`;
    }

    if (specialty) {
      query += ` AND d.specialization ILIKE $${paramCount}`;
      params.push(`%${specialty}%`);
      paramCount++;
    }

    if (search) {
      query += ` AND (w.title ILIKE $${paramCount} OR w.description ILIKE $${paramCount})`;
      params.push(`%${search}%`);
      paramCount++;
    }

    query += ` GROUP BY w.id, d.id, d."firstName", d."lastName", d.specialization, d."profileImage"`;
    query += ` ORDER BY w.scheduled_at ASC`;
    
    const offset = (page - 1) * limit;
    query += ` LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    params.push(limit, offset);

    const result = await sequelize.query(query, params);

    res.json({
      success: true,
      webinars: result.rows.map(w => ({
        id: w.id,
        title: w.title,
        description: w.description,
        scheduledAt: w.scheduled_at,
        duration: w.duration,
        status: w.status,
        thumbnailUrl: w.thumbnail_url,
        tags: w.tags,
        doctor: {
          id: w.doctor_id,
          name: w.doctor_name,
          specialization: w.doctor_specialization,
          image: w.doctor_image
        },
        participants: {
          max: w.max_participants,
          registered: parseInt(w.total_registrations),
          approved: parseInt(w.approved_count),
          spotsLeft: w.max_participants - parseInt(w.approved_count)
        },
        registrationRequired: w.registration_required
      })),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Error fetching webinars:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch webinars',
      error: error.message
    });
  }
});

// ============================================
// GET WEBINAR DETAILS
// ============================================
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    const result = await sequelize.query(
      `SELECT 
        w.*,
        d.id as doctor_id,
        CONCAT(d."firstName", ' ', d."lastName") as doctor_name,
        u.email as doctor_email,
        d.specialization as doctor_specialization,
        d."profileImage" as doctor_image,
        d.qualifications as doctor_qualifications,
        d.experience as doctor_experience,
        COUNT(DISTINCT wr.id) as total_registrations,
        COUNT(DISTINCT CASE WHEN wr.registration_status = 'approved' THEN wr.id END) as approved_count
      FROM webinars w
      LEFT JOIN doctors d ON w.doctor_id = d.id
      LEFT JOIN users u ON d."userId" = u.id
      LEFT JOIN webinar_registrations wr ON w.id = wr.webinar_id
      WHERE w.id = $1
      GROUP BY w.id, d.id, d."firstName", d."lastName", u.email`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Webinar not found'
      });
    }

    const webinar = result.rows[0];

    // Check if user is registered
    let userRegistration = null;
    if (userId) {
      const regResult = await sequelize.query(
        `SELECT * FROM webinar_registrations WHERE webinar_id = $1 AND user_id = $2`,
        [id, userId]
      );
      userRegistration = regResult.rows[0] || null;
    }

    res.json({
      success: true,
      webinar: {
        id: webinar.id,
        title: webinar.title,
        description: webinar.description,
        scheduledAt: webinar.scheduled_at,
        duration: webinar.duration,
        status: webinar.status,
        thumbnailUrl: webinar.thumbnail_url,
        tags: webinar.tags,
        doctor: {
          id: webinar.doctor_id,
          name: webinar.doctor_name,
          email: webinar.doctor_email,
          specialization: webinar.doctor_specialization,
          image: webinar.doctor_image,
          qualifications: webinar.doctor_qualifications,
          experience: webinar.doctor_experience
        },
        participants: {
          max: webinar.max_participants,
          registered: parseInt(webinar.total_registrations),
          approved: parseInt(webinar.approved_count),
          spotsLeft: webinar.max_participants - parseInt(webinar.approved_count)
        },
        settings: {
          registrationRequired: webinar.registration_required,
          autoApprove: webinar.auto_approve_registration,
          chatEnabled: webinar.chat_enabled,
          qaEnabled: webinar.qa_enabled,
          recordingEnabled: webinar.recording_enabled
        },
        userRegistration: userRegistration ? {
          status: userRegistration.registration_status,
          registeredAt: userRegistration.created_at,
          canJoin: userRegistration.registration_status === 'approved' && webinar.status === 'live'
        } : null,
        canRegister: !userRegistration && webinar.status === 'scheduled' && 
                     parseInt(webinar.approved_count) < webinar.max_participants
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
// REGISTER FOR WEBINAR
// ============================================
router.post('/:id/register', verifyAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Get webinar details
    const webinarResult = await sequelize.query(
      `SELECT 
        w.*,
        COUNT(DISTINCT CASE WHEN wr.registration_status = 'approved' THEN wr.id END) as approved_count
      FROM webinars w
      LEFT JOIN webinar_registrations wr ON w.id = wr.webinar_id
      WHERE w.id = $1
      GROUP BY w.id`,
      [id]
    );

    if (webinarResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Webinar not found'
      });
    }

    const webinar = webinarResult.rows[0];

    // Check if webinar is scheduled
    if (webinar.status !== 'scheduled') {
      return res.status(400).json({
        success: false,
        message: 'Registration is only allowed for scheduled webinars'
      });
    }

    // Check if spots available
    if (parseInt(webinar.approved_count) >= webinar.max_participants) {
      return res.status(400).json({
        success: false,
        message: 'Webinar is full. No spots available.'
      });
    }

    // Check if already registered
    const existingReg = await sequelize.query(
      `SELECT * FROM webinar_registrations WHERE webinar_id = $1 AND user_id = $2`,
      [id, userId]
    );

    if (existingReg.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'You are already registered for this webinar',
        registration: existingReg.rows[0]
      });
    }

    // Determine registration status
    const registrationStatus = webinar.auto_approve_registration ? 'approved' : 'pending';

    // Create registration
    const result = await sequelize.query(
      `INSERT INTO webinar_registrations (
        webinar_id, user_id, registration_status, attendance_status
      ) VALUES ($1, $2, $3, $4)
      RETURNING *`,
      [id, userId, registrationStatus, 'registered']
    );

    // Update analytics
    await sequelize.query(
      `UPDATE webinar_analytics 
       SET total_registrations = total_registrations + 1 
       WHERE webinar_id = $1`,
      [id]
    );

    // Send registration confirmation email with calendar invite
    try {
      const userResult = await sequelize.query(
        `SELECT id, CONCAT("firstName", ' ', "lastName") as name, email FROM users WHERE id = $1`,
        { replacements: [userId], type: Sequelize.QueryTypes.SELECT }
      );
      
      if (userResult.length > 0 && registrationStatus === 'approved') {
        // Get complete webinar data with doctor info
        const webinarWithDoctor = await sequelize.query(
          `SELECT w.*, CONCAT(d."firstName", ' ', d."lastName") as doctor_name, u.email as doctor_email
           FROM webinars w
           LEFT JOIN doctors d ON w.doctor_id = d.id
           LEFT JOIN users u ON d."userId" = u.id
           WHERE w.id = $1`,
          { replacements: [id], type: Sequelize.QueryTypes.SELECT }
        );
        
        if (webinarWithDoctor.length > 0) {
          await webinarNotificationService.sendRegistrationConfirmation(
            webinarWithDoctor[0],
            userResult[0],
            result.rows[0]
          );
        }
      }
    } catch (emailError) {
      console.error('Failed to send confirmation email:', emailError);
      // Don't fail the registration if email fails
    }

    res.status(201).json({
      success: true,
      message: registrationStatus === 'approved' 
        ? 'Successfully registered for webinar. Check your email for calendar invite!' 
        : 'Registration submitted. Awaiting approval.',
      registration: {
        id: result.rows[0].id,
        webinarId: id,
        status: result.rows[0].registration_status,
        registeredAt: result.rows[0].created_at,
        needsApproval: registrationStatus === 'pending'
      }
    });
  } catch (error) {
    console.error('Error registering for webinar:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to register for webinar',
      error: error.message
    });
  }
});

// ============================================
// CANCEL REGISTRATION
// ============================================
router.delete('/:id/register', verifyAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const result = await sequelize.query(
      `DELETE FROM webinar_registrations 
       WHERE webinar_id = $1 AND user_id = $2 
       RETURNING *`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Registration not found'
      });
    }

    res.json({
      success: true,
      message: 'Registration cancelled successfully'
    });
  } catch (error) {
    console.error('Error cancelling registration:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cancel registration',
      error: error.message
    });
  }
});

// ============================================
// GET LIVEKIT TOKEN TO JOIN WEBINAR
// ============================================
router.post('/:id/join', verifyAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Get webinar details
    const webinarResult = await sequelize.query(
      `SELECT * FROM webinars WHERE id = $1`,
      [id]
    );

    if (webinarResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Webinar not found'
      });
    }

    const webinar = webinarResult.rows[0];

    // Check if webinar is live
    if (webinar.status !== 'live') {
      return res.status(400).json({
        success: false,
        message: 'Webinar is not currently live',
        status: webinar.status,
        scheduledAt: webinar.scheduled_at
      });
    }

    // Check if user is registered and approved
    const regResult = await sequelize.query(
      `SELECT * FROM webinar_registrations WHERE webinar_id = $1 AND user_id = $2`,
      [id, userId]
    );

    if (webinar.registration_required) {
      if (regResult.rows.length === 0) {
        return res.status(403).json({
          success: false,
          message: 'You must register for this webinar first'
        });
      }

      const registration = regResult.rows[0];
      if (registration.registration_status !== 'approved') {
        return res.status(403).json({
          success: false,
          message: 'Your registration is pending approval',
          status: registration.registration_status
        });
      }
    }

    // Generate LiveKit token for attendee
    const at = new AccessToken(
      process.env.LIVEKIT_API_KEY,
      process.env.LIVEKIT_API_SECRET,
      {
        identity: `user-${userId}`,
        name: req.user.name || `User ${userId}`,
        metadata: JSON.stringify({
          role: 'attendee',
          webinarId: id,
          userId: userId
        })
      }
    );

    at.addGrant({
      roomJoin: true,
      room: webinar.livekit_room_name,
      canPublish: false, // Attendees can't publish by default
      canSubscribe: true,
      canPublishData: webinar.chat_enabled, // Can send chat if enabled
      canUpdateOwnMetadata: true
    });

    const token = at.toJwt();

    // Update registration - mark as joined
    if (regResult.rows.length > 0) {
      await sequelize.query(
        `UPDATE webinar_registrations 
         SET joined_at = CURRENT_TIMESTAMP, attendance_status = 'attended'
         WHERE id = $1`,
        [regResult.rows[0].id]
      );
    }

    // Update analytics
    await sequelize.query(
      `UPDATE webinar_analytics 
       SET total_attendees = total_attendees + 1 
       WHERE webinar_id = $1`,
      [id]
    );

    res.json({
      success: true,
      message: 'Joined webinar successfully',
      webinar: {
        id: webinar.id,
        title: webinar.title,
        roomName: webinar.livekit_room_name,
        chatEnabled: webinar.chat_enabled,
        qaEnabled: webinar.qa_enabled
      },
      livekit: {
        token: token,
        serverUrl: process.env.LIVEKIT_URL,
        roomName: webinar.livekit_room_name
      }
    });
  } catch (error) {
    console.error('Error joining webinar:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to join webinar',
      error: error.message
    });
  }
});

// ============================================
// LEAVE WEBINAR
// ============================================
router.post('/:id/leave', verifyAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Update registration - mark as left
    const result = await sequelize.query(
      `UPDATE webinar_registrations 
       SET left_at = CURRENT_TIMESTAMP,
           duration = EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - joined_at))::INTEGER
       WHERE webinar_id = $1 AND user_id = $2 AND joined_at IS NOT NULL AND left_at IS NULL
       RETURNING *`,
      [id, userId]
    );

    res.json({
      success: true,
      message: 'Left webinar successfully',
      duration: result.rows[0]?.duration || 0
    });
  } catch (error) {
    console.error('Error leaving webinar:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to leave webinar',
      error: error.message
    });
  }
});

// ============================================
// POST QUESTION (Q&A)
// ============================================
router.post('/:id/questions', verifyAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { question } = req.body;
    const userId = req.user.id;

    if (!question || question.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Question cannot be empty'
      });
    }

    // Check if webinar exists and Q&A is enabled
    const webinarResult = await sequelize.query(
      `SELECT qa_enabled, status FROM webinars WHERE id = $1`,
      [id]
    );

    if (webinarResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Webinar not found'
      });
    }

    if (!webinarResult.rows[0].qa_enabled) {
      return res.status(403).json({
        success: false,
        message: 'Q&A is not enabled for this webinar'
      });
    }

    // Insert question
    const result = await sequelize.query(
      `INSERT INTO webinar_chat_messages (
        webinar_id, user_id, message, message_type
      ) VALUES ($1, $2, $3, 'question')
      RETURNING *`,
      [id, userId, question.trim()]
    );

    // Update analytics
    await sequelize.query(
      `UPDATE webinar_analytics 
       SET total_questions = total_questions + 1 
       WHERE webinar_id = $1`,
      [id]
    );

    res.status(201).json({
      success: true,
      message: 'Question submitted successfully',
      question: {
        id: result.rows[0].id,
        question: result.rows[0].message,
        createdAt: result.rows[0].created_at
      }
    });
  } catch (error) {
    console.error('Error posting question:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to post question',
      error: error.message
    });
  }
});

// ============================================
// GET MY REGISTRATIONS
// ============================================
router.get('/user/my-registrations', verifyAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { status } = req.query;

    let query = `
      SELECT 
        wr.*,
        w.title,
        w.description,
        w.scheduled_at,
        w.duration,
        w.status as webinar_status,
        w.thumbnail_url,
        CONCAT(d."firstName", ' ', d."lastName") as doctor_name,
        d.specialization as doctor_specialization
      FROM webinar_registrations wr
      JOIN webinars w ON wr.webinar_id = w.id
      LEFT JOIN doctors d ON w.doctor_id = d.id
      WHERE wr.user_id = $1
    `;

    const params = [userId];

    if (status) {
      query += ` AND wr.registration_status = $2`;
      params.push(status);
    }

    query += ` ORDER BY w.scheduled_at DESC`;

    const result = await sequelize.query(query, params);

    res.json({
      success: true,
      registrations: result.rows.map(r => ({
        id: r.id,
        webinarId: r.webinar_id,
        webinar: {
          title: r.title,
          description: r.description,
          scheduledAt: r.scheduled_at,
          duration: r.duration,
          status: r.webinar_status,
          thumbnailUrl: r.thumbnail_url,
          doctor: {
            name: r.doctor_name,
            specialization: r.doctor_specialization
          }
        },
        registrationStatus: r.registration_status,
        attendanceStatus: r.attendance_status,
        registeredAt: r.created_at,
        joinedAt: r.joined_at,
        leftAt: r.left_at,
        duration: r.duration,
        canJoin: r.registration_status === 'approved' && r.webinar_status === 'live'
      }))
    });
  } catch (error) {
    console.error('Error fetching user registrations:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch registrations',
      error: error.message
    });
  }
});

export default router;
