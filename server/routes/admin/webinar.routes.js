// =====================================================
// Admin Webinar Routes
// Super Admin endpoints for webinar management
// =====================================================

import express from 'express';
import { AccessToken } from 'livekit-server-sdk';
import { Sequelize } from 'sequelize';
import webinarNotificationService from '../../services/webinar-notification.service.js';

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

const db = sequelize;

// Middleware to verify super admin
const verifySuperAdmin = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    res.status(403).json({ 
      success: false, 
      message: 'Access denied. Super admin only.' 
    });
  }
};

// ============================================
// CREATE WEBINAR
// ============================================
router.post('/webinars', verifySuperAdmin, async (req, res) => {
  try {
    const {
      title,
      description,
      doctorId,
      scheduledAt,
      duration = 60,
      maxParticipants = 100,
      recordingEnabled = true,
      chatEnabled = true,
      qaEnabled = true,
      registrationRequired = true,
      autoApproveRegistration = false,
      thumbnailUrl,
      tags
    } = req.body;

    // Validate required fields
    if (!title || !scheduledAt) {
      return res.status(400).json({
        success: false,
        message: 'Title and scheduled time are required'
      });
    }

    // Generate unique room name
    const roomName = `webinar-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Insert webinar
    const result = await sequelize.query(
      `INSERT INTO webinars (
        title, description, doctor_id, scheduled_at, duration, max_participants,
        status, livekit_room_name, created_by, recording_enabled, chat_enabled,
        qa_enabled, registration_required, auto_approve_registration, thumbnail_url, tags
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING *`,
      [
        title, description, doctorId, scheduledAt, duration, maxParticipants,
        'scheduled', roomName, req.user.id, recordingEnabled, chatEnabled,
        qaEnabled, registrationRequired, autoApproveRegistration, thumbnailUrl, tags
      ]
    );

    const webinar = result.rows[0];

    // Initialize analytics
    await sequelize.query(
      `INSERT INTO webinar_analytics (webinar_id) VALUES ($1)`,
      [webinar.id]
    );

    // Send calendar invite to host doctor (async, don't wait)
    if (doctorId) {
      sequelize.query(
        `SELECT id, name, email FROM doctors WHERE id = $1`,
        { replacements: [doctorId], type: Sequelize.QueryTypes.SELECT }
      ).then(doctorResult => {
        if (doctorResult.length > 0) {
          const webinarWithDoctor = {
            ...webinar,
            doctor_name: doctorResult[0].name,
            doctor_email: doctorResult[0].email
          };
          webinarNotificationService.sendHostCalendarInvite(webinarWithDoctor, doctorResult[0])
            .catch(err => console.error('Failed to send host calendar invite:', err));
        }
      }).catch(err => console.error('Failed to fetch doctor for calendar invite:', err));
    }

    res.status(201).json({
      success: true,
      message: 'Webinar created successfully. Calendar invite sent to host.',
      webinar: {
        id: webinar.id,
        title: webinar.title,
        description: webinar.description,
        doctorId: webinar.doctor_id,
        scheduledAt: webinar.scheduled_at,
        duration: webinar.duration,
        maxParticipants: webinar.max_participants,
        status: webinar.status,
        roomName: webinar.livekit_room_name,
        meetingUrl: `${process.env.FRONTEND_URL}/webinar/${webinar.id}`,
        settings: {
          recordingEnabled: webinar.recording_enabled,
          chatEnabled: webinar.chat_enabled,
          qaEnabled: webinar.qa_enabled,
          registrationRequired: webinar.registration_required,
          autoApproveRegistration: webinar.auto_approve_registration
        },
        createdAt: webinar.created_at
      }
    });
  } catch (error) {
    console.error('Error creating webinar:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create webinar',
      error: error.message
    });
  }
});

// ============================================
// GET ALL WEBINARS (Admin view)
// ============================================
router.get('/webinars', verifySuperAdmin, async (req, res) => {
  try {
    const { 
      status, 
      doctorId, 
      page = 1, 
      limit = 20,
      sortBy = 'scheduled_at',
      sortOrder = 'DESC'
    } = req.query;

    let query = `
      SELECT 
        w.*,
        d.name as doctor_name,
        d.specialization as doctor_specialization,
        u.name as created_by_name,
        COUNT(DISTINCT wr.id) as total_registrations,
        COUNT(DISTINCT CASE WHEN wr.attendance_status = 'attended' THEN wr.id END) as total_attendees
      FROM webinars w
      LEFT JOIN doctors d ON w.doctor_id = d.id
      LEFT JOIN users u ON w.created_by = u.id
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

    if (doctorId) {
      query += ` AND w.doctor_id = $${paramCount}`;
      params.push(doctorId);
      paramCount++;
    }

    query += ` GROUP BY w.id, d.name, d.specialization, u.name`;
    query += ` ORDER BY w.${sortBy} ${sortOrder}`;
    
    const offset = (page - 1) * limit;
    query += ` LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    params.push(limit, offset);

    const result = await sequelize.query(query, params);

    // Get total count
    let countQuery = `SELECT COUNT(DISTINCT w.id) as total FROM webinars w WHERE 1=1`;
    const countParams = [];
    let countParamNum = 1;

    if (status) {
      countQuery += ` AND w.status = $${countParamNum}`;
      countParams.push(status);
      countParamNum++;
    }

    if (doctorId) {
      countQuery += ` AND w.doctor_id = $${countParamNum}`;
      countParams.push(doctorId);
    }

    const countResult = await sequelize.query(countQuery, countParams);
    const totalCount = parseInt(countResult.rows[0].total);

    res.json({
      success: true,
      webinars: result.rows.map(w => ({
        id: w.id,
        title: w.title,
        description: w.description,
        doctor: {
          id: w.doctor_id,
          name: w.doctor_name,
          specialization: w.doctor_specialization
        },
        scheduledAt: w.scheduled_at,
        duration: w.duration,
        maxParticipants: w.max_participants,
        status: w.status,
        roomName: w.livekit_room_name,
        totalRegistrations: parseInt(w.total_registrations),
        totalAttendees: parseInt(w.total_attendees),
        createdBy: w.created_by_name,
        createdAt: w.created_at,
        startedAt: w.started_at,
        endedAt: w.ended_at
      })),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalCount,
        totalPages: Math.ceil(totalCount / limit)
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
// GET WEBINAR BY ID
// ============================================
router.get('/webinars/:id', verifySuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await sequelize.query(
      `SELECT 
        w.*,
        d.name as doctor_name,
        du.email as doctor_email,
        d.specialization as doctor_specialization,
        u.name as created_by_name,
        a.total_registrations,
        a.total_attendees,
        a.peak_concurrent_users,
        a.average_watch_duration,
        a.total_questions,
        a.total_chat_messages,
        a.engagement_score
      FROM webinars w
      LEFT JOIN doctors d ON w.doctor_id = d.id
      LEFT JOIN users du ON d.user_id = du.id
      LEFT JOIN users u ON w.created_by = u.id
      LEFT JOIN webinar_analytics a ON w.id = a.webinar_id
      WHERE w.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Webinar not found'
      });
    }

    const webinar = result.rows[0];

    // Get registrations
    const registrations = await sequelize.query(
      `SELECT 
        wr.*,
        u.name as user_name,
        u.email as user_email
      FROM webinar_registrations wr
      JOIN users u ON wr.user_id = u.id
      WHERE wr.webinar_id = $1
      ORDER BY wr.created_at DESC`,
      [id]
    );

    // Get recordings
    const recordings = await sequelize.query(
      `SELECT * FROM webinar_recordings WHERE webinar_id = $1 ORDER BY created_at DESC`,
      [id]
    );

    res.json({
      success: true,
      webinar: {
        id: webinar.id,
        title: webinar.title,
        description: webinar.description,
        doctor: {
          id: webinar.doctor_id,
          name: webinar.doctor_name,
          email: webinar.doctor_email,
          specialization: webinar.doctor_specialization
        },
        scheduledAt: webinar.scheduled_at,
        duration: webinar.duration,
        maxParticipants: webinar.max_participants,
        status: webinar.status,
        roomName: webinar.livekit_room_name,
        meetingUrl: `${process.env.FRONTEND_URL}/webinar/${webinar.id}`,
        settings: {
          recordingEnabled: webinar.recording_enabled,
          chatEnabled: webinar.chat_enabled,
          qaEnabled: webinar.qa_enabled,
          registrationRequired: webinar.registration_required,
          autoApproveRegistration: webinar.auto_approve_registration
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
        registrations: registrations.rows,
        recordings: recordings.rows,
        createdBy: webinar.created_by_name,
        createdAt: webinar.created_at,
        startedAt: webinar.started_at,
        endedAt: webinar.ended_at
      }
    });
  } catch (error) {
    console.error('Error fetching webinar:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch webinar',
      error: error.message
    });
  }
});

// ============================================
// UPDATE WEBINAR
// ============================================
router.put('/webinars/:id', verifySuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      title,
      description,
      doctorId,
      scheduledAt,
      duration,
      maxParticipants,
      recordingEnabled,
      chatEnabled,
      qaEnabled,
      registrationRequired,
      autoApproveRegistration,
      thumbnailUrl,
      tags,
      status
    } = req.body;

    // Build update query dynamically
    const updates = [];
    const values = [];
    let paramCount = 1;

    if (title !== undefined) {
      updates.push(`title = $${paramCount}`);
      values.push(title);
      paramCount++;
    }
    if (description !== undefined) {
      updates.push(`description = $${paramCount}`);
      values.push(description);
      paramCount++;
    }
    if (doctorId !== undefined) {
      updates.push(`doctor_id = $${paramCount}`);
      values.push(doctorId);
      paramCount++;
    }
    if (scheduledAt !== undefined) {
      updates.push(`scheduled_at = $${paramCount}`);
      values.push(scheduledAt);
      paramCount++;
    }
    if (duration !== undefined) {
      updates.push(`duration = $${paramCount}`);
      values.push(duration);
      paramCount++;
    }
    if (maxParticipants !== undefined) {
      updates.push(`max_participants = $${paramCount}`);
      values.push(maxParticipants);
      paramCount++;
    }
    if (recordingEnabled !== undefined) {
      updates.push(`recording_enabled = $${paramCount}`);
      values.push(recordingEnabled);
      paramCount++;
    }
    if (chatEnabled !== undefined) {
      updates.push(`chat_enabled = $${paramCount}`);
      values.push(chatEnabled);
      paramCount++;
    }
    if (qaEnabled !== undefined) {
      updates.push(`qa_enabled = $${paramCount}`);
      values.push(qaEnabled);
      paramCount++;
    }
    if (registrationRequired !== undefined) {
      updates.push(`registration_required = $${paramCount}`);
      values.push(registrationRequired);
      paramCount++;
    }
    if (autoApproveRegistration !== undefined) {
      updates.push(`auto_approve_registration = $${paramCount}`);
      values.push(autoApproveRegistration);
      paramCount++;
    }
    if (thumbnailUrl !== undefined) {
      updates.push(`thumbnail_url = $${paramCount}`);
      values.push(thumbnailUrl);
      paramCount++;
    }
    if (tags !== undefined) {
      updates.push(`tags = $${paramCount}`);
      values.push(tags);
      paramCount++;
    }
    if (status !== undefined) {
      updates.push(`status = $${paramCount}`);
      values.push(status);
      paramCount++;
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No fields to update'
      });
    }

    values.push(id);
    const query = `UPDATE webinars SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`;

    const result = await sequelize.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Webinar not found'
      });
    }

    res.json({
      success: true,
      message: 'Webinar updated successfully',
      webinar: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating webinar:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update webinar',
      error: error.message
    });
  }
});

// ============================================
// DELETE WEBINAR
// ============================================
router.delete('/webinars/:id', verifySuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // Check if webinar is live
    const checkResult = await sequelize.query(
      `SELECT status FROM webinars WHERE id = $1`,
      [id]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Webinar not found'
      });
    }

    if (checkResult.rows[0].status === 'live') {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete a live webinar. End it first.'
      });
    }

    // Delete webinar (cascade will handle related records)
    await sequelize.query(`DELETE FROM webinars WHERE id = $1`, [id]);

    res.json({
      success: true,
      message: 'Webinar deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting webinar:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete webinar',
      error: error.message
    });
  }
});

// ============================================
// MANAGE REGISTRATIONS
// ============================================
router.put('/webinars/:id/registrations/:registrationId', verifySuperAdmin, async (req, res) => {
  try {
    const { id, registrationId } = req.params;
    const { status, rejectionReason } = req.body;

    const result = await sequelize.query(
      `UPDATE webinar_registrations 
       SET registration_status = $1, 
           approved_by = $2, 
           approved_at = CURRENT_TIMESTAMP,
           rejection_reason = $3
       WHERE id = $4 AND webinar_id = $5
       RETURNING *`,
      [status, req.user.id, rejectionReason, registrationId, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Registration not found'
      });
    }

    res.json({
      success: true,
      message: `Registration ${status} successfully`,
      registration: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating registration:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update registration',
      error: error.message
    });
  }
});

// ============================================
// GET WEBINAR ANALYTICS
// ============================================
router.get('/webinars/:id/analytics', verifySuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await sequelize.query(
      `SELECT * FROM webinar_analytics WHERE webinar_id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Analytics not found'
      });
    }

    res.json({
      success: true,
      analytics: result.rows[0]
    });
  } catch (error) {
    console.error('Error fetching analytics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch analytics',
      error: error.message
    });
  }
});

export default router;
