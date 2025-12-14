import { addJob, addDelayedJob, addRecurringJob } from '../config/queues.js';
import { publishEvent, KAFKA_TOPICS } from '../config/kafka.js';

/**
 * Email Tasks
 */
export const sendWelcomeEmail = async (userEmail, userName) => {
  return addJob('email', 'send-welcome-email', {
    to: userEmail,
    subject: 'Welcome to Mediczy',
    body: `Hi ${userName}, welcome to Mediczy! We're excited to have you.`,
    template: 'welcome',
  });
};

export const sendAppointmentConfirmation = async (userEmail, appointmentDetails) => {
  return addJob('email', 'send-appointment-confirmation', {
    to: userEmail,
    subject: 'Appointment Confirmed',
    body: `Your appointment is confirmed for ${appointmentDetails.date}`,
    template: 'appointment-confirmation',
    data: appointmentDetails,
  });
};

export const sendPasswordResetEmail = async (userEmail, resetToken) => {
  return addJob('email', 'send-password-reset', {
    to: userEmail,
    subject: 'Password Reset Request',
    body: `Click the link to reset your password: ${process.env.CLIENT_URL}/reset-password?token=${resetToken}`,
    template: 'password-reset',
    data: { resetToken },
  }, {
    priority: 1, // High priority
  });
};

/**
 * Notification Tasks
 */
export const sendPushNotification = async (userId, title, message, data = {}) => {
  const job = await addJob('notifications', 'send-push-notification', {
    userId,
    type: 'push',
    title,
    message,
    data,
  });

  // Also publish to Kafka for analytics
  await publishEvent(KAFKA_TOPICS.NOTIFICATION_EVENTS, {
    action: 'notification_sent',
    userId,
    type: 'push',
    timestamp: new Date().toISOString(),
  });

  return job;
};

export const sendInAppNotification = async (userId, title, message, type = 'info') => {
  return addJob('notifications', 'send-in-app-notification', {
    userId,
    type: 'in-app',
    title,
    message,
    notificationType: type, // info, warning, success, error
  });
};

export const scheduleAppointmentReminder = async (userId, appointmentId, appointmentTime) => {
  // Send reminder 24 hours before appointment
  const reminderTime = new Date(appointmentTime).getTime() - (24 * 60 * 60 * 1000);
  const delay = reminderTime - Date.now();

  if (delay > 0) {
    return addDelayedJob('notifications', 'appointment-reminder', {
      userId,
      appointmentId,
      title: 'Appointment Reminder',
      message: 'You have an appointment tomorrow',
    }, delay);
  }
};

/**
 * Report Generation Tasks
 */
export const generateUserReport = async (userId, reportType, filters = {}) => {
  return addJob('reports', 'generate-user-report', {
    reportType,
    userId,
    filters,
    format: 'pdf',
  }, {
    attempts: 5,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
  });
};

export const generateAdminAnalyticsReport = async (adminId, dateRange, metrics) => {
  return addJob('reports', 'generate-admin-analytics', {
    reportType: 'admin-analytics',
    userId: adminId,
    filters: { dateRange, metrics },
    format: 'excel',
  });
};

export const generateMonthlyReport = async () => {
  // Scheduled monthly report (runs via cron)
  return addRecurringJob('reports', 'monthly-summary-report', {
    reportType: 'monthly-summary',
    format: 'pdf',
  }, '0 0 1 * *'); // First day of every month at midnight
};

/**
 * Data Export Tasks
 */
export const exportUserData = async (userId, entityType = 'all') => {
  return addJob('dataExport', 'export-user-data', {
    userId,
    entityType,
    format: 'json',
    includeArchived: false,
  });
};

export const exportCRMLeads = async (filters = {}) => {
  return addJob('dataExport', 'export-crm-leads', {
    entityType: 'crm-leads',
    filters,
    format: 'excel',
  });
};

export const exportAppointments = async (dateRange, format = 'csv') => {
  return addJob('dataExport', 'export-appointments', {
    entityType: 'appointments',
    filters: { dateRange },
    format,
  });
};

/**
 * Analytics Tasks
 */
export const trackUserAction = async (userId, action, metadata = {}) => {
  // Add to analytics queue
  const job = await addJob('analytics', 'track-user-action', {
    eventType: 'user_action',
    data: {
      userId,
      action,
      ...metadata,
    },
    timestamp: new Date().toISOString(),
  });

  // Also publish to Kafka
  await publishEvent(KAFKA_TOPICS.ANALYTICS_EVENTS, {
    type: 'user_action',
    userId,
    action,
    metadata,
    timestamp: new Date().toISOString(),
  });

  return job;
};

export const trackPageView = async (userId, page, duration) => {
  return addJob('analytics', 'track-page-view', {
    eventType: 'page_view',
    data: { userId, page, duration },
    timestamp: new Date().toISOString(),
  });
};

/**
 * Cleanup Tasks
 */
export const cleanupOldSessions = async () => {
  return addJob('cleanup', 'cleanup-old-sessions', {
    taskType: 'sessions',
    olderThan: '7 days',
  });
};

export const archiveOldAppointments = async () => {
  return addRecurringJob('cleanup', 'archive-old-appointments', {
    taskType: 'appointments',
    olderThan: '90 days',
  }, '0 2 * * 0'); // Every Sunday at 2 AM
};

export const cleanupTempFiles = async () => {
  return addRecurringJob('cleanup', 'cleanup-temp-files', {
    taskType: 'temp-files',
    olderThan: '1 day',
  }, '0 3 * * *'); // Every day at 3 AM
};

/**
 * Kafka Event Publishers
 */
export const publishUserRegistered = async (user) => {
  return publishEvent(KAFKA_TOPICS.USER_EVENTS, {
    action: 'user_registered',
    userId: user.id,
    email: user.email,
    userType: user.isAdmin ? 'admin' : 'user',
    timestamp: new Date().toISOString(),
  });
};

export const publishAppointmentBooked = async (appointment) => {
  return publishEvent(KAFKA_TOPICS.APPOINTMENT_EVENTS, {
    action: 'appointment_booked',
    appointmentId: appointment.id,
    userId: appointment.userId,
    doctorId: appointment.doctorId,
    timestamp: new Date().toISOString(),
  });
};

export const publishLeadCreated = async (lead) => {
  return publishEvent(KAFKA_TOPICS.SYSTEM_EVENTS, {
    action: 'crm_lead_created',
    leadId: lead.id,
    stage: lead.stage,
    value: lead.value,
    source: lead.source,
    timestamp: new Date().toISOString(),
  });
};

export const publishLeadStageChanged = async (lead, oldStage, newStage) => {
  return publishEvent(KAFKA_TOPICS.SYSTEM_EVENTS, {
    action: 'crm_lead_stage_changed',
    leadId: lead.id,
    oldStage,
    newStage,
    value: lead.value,
    timestamp: new Date().toISOString(),
  });
};

export default {
  // Email
  sendWelcomeEmail,
  sendAppointmentConfirmation,
  sendPasswordResetEmail,
  
  // Notifications
  sendPushNotification,
  sendInAppNotification,
  scheduleAppointmentReminder,
  
  // Reports
  generateUserReport,
  generateAdminAnalyticsReport,
  generateMonthlyReport,
  
  // Data Export
  exportUserData,
  exportCRMLeads,
  exportAppointments,
  
  // Analytics
  trackUserAction,
  trackPageView,
  
  // Cleanup
  cleanupOldSessions,
  archiveOldAppointments,
  cleanupTempFiles,
  
  // Kafka Events
  publishUserRegistered,
  publishAppointmentBooked,
  publishLeadCreated,
  publishLeadStageChanged,
};
