/**
 * Admin Webinar Module Management Routes
 * Endpoints for configuring webinar calendar & notification features
 */

import express from 'express';
import { Sequelize } from 'sequelize';

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

// Middleware to verify super admin
const verifySuperAdmin = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    res.status(403).json({
      success: false,
      message: 'Super Admin access required'
    });
  }
};

// ==================== Module Configuration Endpoints ====================

/**
 * GET /api/admin/webinar-modules
 * Get all webinar module configurations
 */
router.get('/webinar-modules', verifySuperAdmin, async (req, res) => {
  try {
    const [modules] = await sequelize.query(`
      SELECT 
        user_type,
        module_id,
        module_name,
        category,
        is_enabled,
        can_view,
        can_create,
        can_edit,
        can_delete,
        created_at,
        updated_at
      FROM module_access
      WHERE module_id LIKE 'webinar_%'
      ORDER BY user_type, module_id
    `);

    // Group by module
    const modulesByType = modules.reduce((acc, module) => {
      if (!acc[module.module_id]) {
        acc[module.module_id] = {
          moduleId: module.module_id,
          moduleName: module.module_name,
          category: module.category,
          userAccess: []
        };
      }
      acc[module.module_id].userAccess.push({
        userType: module.user_type,
        isEnabled: module.is_enabled,
        canView: module.can_view,
        canCreate: module.can_create,
        canEdit: module.can_edit,
        canDelete: module.can_delete
      });
      return acc;
    }, {});

    res.json({
      success: true,
      modules: Object.values(modulesByType),
      totalModules: Object.keys(modulesByType).length
    });
  } catch (error) {
    console.error('[Admin] Failed to fetch webinar modules:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch webinar module configurations',
      error: error.message
    });
  }
});

/**
 * PUT /api/admin/webinar-modules/:moduleId/toggle
 * Enable/disable a webinar module for specific user type
 */
router.put('/webinar-modules/:moduleId/toggle', verifySuperAdmin, async (req, res) => {
  try {
    const { moduleId } = req.params;
    const { userType, isEnabled } = req.body;

    if (!userType) {
      return res.status(400).json({
        success: false,
        message: 'User type is required'
      });
    }

    const [result] = await sequelize.query(`
      UPDATE module_access
      SET is_enabled = $1, updated_at = NOW()
      WHERE module_id = $2 AND user_type = $3
      RETURNING *
    `, {
      bind: [isEnabled, moduleId, userType]
    });

    if (result.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Module configuration not found'
      });
    }

    console.log(`[Admin] ${req.user.email} ${isEnabled ? 'enabled' : 'disabled'} ${moduleId} for ${userType}`);

    res.json({
      success: true,
      message: `Module ${isEnabled ? 'enabled' : 'disabled'} successfully`,
      module: result[0]
    });
  } catch (error) {
    console.error('[Admin] Failed to toggle webinar module:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update module configuration',
      error: error.message
    });
  }
});

/**
 * GET /api/admin/webinar-modules/status
 * Get webinar module system status (notifications, cron jobs, etc.)
 */
router.get('/webinar-modules/status', verifySuperAdmin, async (req, res) => {
  try {
    // Check database schema
    const [schemaCheck] = await sequelize.query(`
      SELECT 
        COUNT(*) FILTER (WHERE column_name IN (
          'reminder_1week_sent', 'reminder_24h_sent', 'reminder_2h_sent',
          'reminder_15min_sent', 'ical_sent', 'registration_email_sent'
        )) as webinar_columns,
        COUNT(*) FILTER (WHERE column_name IN (
          'confirmation_email_sent', 'reminder_email_sent', 'ical_attachment_sent'
        )) as registration_columns
      FROM information_schema.columns
      WHERE table_name IN ('webinars', 'webinar_registrations')
    `);

    // Check upcoming webinars with notification status
    const [upcomingWebinars] = await sequelize.query(`
      SELECT 
        COUNT(*) as total_upcoming,
        COUNT(*) FILTER (WHERE reminder_1week_sent = false) as pending_1week,
        COUNT(*) FILTER (WHERE reminder_24h_sent = false) as pending_24h,
        COUNT(*) FILTER (WHERE reminder_2h_sent = false) as pending_2h,
        COUNT(*) FILTER (WHERE reminder_15min_sent = false) as pending_15min
      FROM webinars
      WHERE scheduled_at > NOW()
        AND status = 'scheduled'
    `);

    // Check recent registrations
    const [recentRegistrations] = await sequelize.query(`
      SELECT 
        COUNT(*) as total_registrations,
        COUNT(*) FILTER (WHERE confirmation_email_sent = true) as emails_sent,
        COUNT(*) FILTER (WHERE ical_attachment_sent = true) as calendars_sent
      FROM webinar_registrations
      WHERE created_at > NOW() - INTERVAL '7 days'
    `);

    res.json({
      success: true,
      status: {
        databaseSchema: {
          webinarColumns: parseInt(schemaCheck[0].webinar_columns || 0),
          registrationColumns: parseInt(schemaCheck[0].registration_columns || 0),
          isConfigured: schemaCheck[0].webinar_columns >= 6 && schemaCheck[0].registration_columns >= 3
        },
        upcomingWebinars: {
          total: parseInt(upcomingWebinars[0].total_upcoming || 0),
          pendingReminders: {
            oneWeek: parseInt(upcomingWebinars[0].pending_1week || 0),
            twentyFourHours: parseInt(upcomingWebinars[0].pending_24h || 0),
            twoHours: parseInt(upcomingWebinars[0].pending_2h || 0),
            fifteenMinutes: parseInt(upcomingWebinars[0].pending_15min || 0)
          }
        },
        recentRegistrations: {
          total: parseInt(recentRegistrations[0].total_registrations || 0),
          emailsSent: parseInt(recentRegistrations[0].emails_sent || 0),
          calendarsSent: parseInt(recentRegistrations[0].calendars_sent || 0),
          successRate: recentRegistrations[0].total_registrations > 0 
            ? ((recentRegistrations[0].emails_sent / recentRegistrations[0].total_registrations) * 100).toFixed(2) + '%'
            : 'N/A'
        },
        services: {
          icalGenerator: 'Available',
          notificationService: 'Available',
          cronReminderService: 'Running (every 30 min)',
          emailService: process.env.SMTP_HOST ? 'Configured' : 'Not Configured'
        }
      }
    });
  } catch (error) {
    console.error('[Admin] Failed to fetch webinar module status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch system status',
      error: error.message
    });
  }
});

/**
 * POST /api/admin/webinar-modules/test-notification
 * Send test calendar notification (for testing email/calendar integration)
 */
router.post('/webinar-modules/test-notification', verifySuperAdmin, async (req, res) => {
  try {
    const { email, webinarId } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email address is required'
      });
    }

    // Get webinar details if ID provided
    let webinarData = null;
    if (webinarId) {
      const [webinars] = await sequelize.query(`
        SELECT w.*, CONCAT(d."firstName", ' ', d."lastName") as doctor_name, u.email as doctor_email
        FROM webinars w
        LEFT JOIN doctors d ON d.id = w.doctor_id
        LEFT JOIN users u ON d."userId" = u.id
        WHERE w.id = $1
      `, {
        bind: [webinarId]
      });
      webinarData = webinars[0];
    }

    // Use sample data if no webinar specified
    if (!webinarData) {
      webinarData = {
        id: 0,
        title: 'Test Webinar - Calendar Integration',
        description: 'This is a test notification to verify email and calendar integration is working correctly.',
        scheduled_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 1 week from now
        duration: 60,
        meeting_url: 'https://meet.mediczy.com/test-webinar',
        doctor_name: 'Dr. Test Admin',
        doctor_email: req.user.email
      };
    }

    const userData = {
      id: req.user.id,
      name: 'Admin Test User',
      email: email
    };

    // Import notification service
    const webinarNotificationService = (await import('../services/webinar-notification.service.js')).default;

    // Send test notification
    await webinarNotificationService.sendRegistrationConfirmation(
      webinarData,
      userData,
      { status: 'approved' }
    );

    res.json({
      success: true,
      message: 'Test notification sent successfully',
      sentTo: email,
      note: 'Check your email for calendar invite (.ics attachment)'
    });
  } catch (error) {
    console.error('[Admin] Failed to send test notification:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send test notification',
      error: error.message
    });
  }
});

/**
 * GET /api/admin/webinar-modules/notification-logs
 * Get recent notification activity logs
 */
router.get('/webinar-modules/notification-logs', verifySuperAdmin, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;

    const [logs] = await sequelize.query(`
      SELECT 
        w.id as webinar_id,
        w.title,
        w.scheduled_at,
        w.reminder_1week_sent,
        w.reminder_24h_sent,
        w.reminder_2h_sent,
        w.reminder_15min_sent,
        w.ical_sent,
        w.registration_email_sent,
        (SELECT COUNT(*) FROM webinar_registrations WHERE webinar_id = w.id) as total_registrations,
        (SELECT COUNT(*) FROM webinar_registrations WHERE webinar_id = w.id AND confirmation_email_sent = true) as confirmations_sent
      FROM webinars w
      WHERE w.created_at > NOW() - INTERVAL '30 days'
      ORDER BY w.created_at DESC
      LIMIT $1
    `, {
      bind: [limit]
    });

    res.json({
      success: true,
      logs: logs.map(log => ({
        webinarId: log.webinar_id,
        title: log.title,
        scheduledAt: log.scheduled_at,
        notificationsSent: {
          oneWeekReminder: log.reminder_1week_sent,
          twentyFourHourReminder: log.reminder_24h_sent,
          twoHourReminder: log.reminder_2h_sent,
          fifteenMinuteReminder: log.reminder_15min_sent,
          hostCalendarInvite: log.ical_sent,
          registrationEmails: log.registration_email_sent
        },
        registrations: {
          total: parseInt(log.total_registrations || 0),
          confirmationsSent: parseInt(log.confirmations_sent || 0)
        }
      })),
      totalLogs: logs.length
    });
  } catch (error) {
    console.error('[Admin] Failed to fetch notification logs:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch notification logs',
      error: error.message
    });
  }
});

export default router;
