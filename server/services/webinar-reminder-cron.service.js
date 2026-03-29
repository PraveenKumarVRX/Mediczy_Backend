/**
 * Webinar Reminder Automation Service
 * 
 * Automatically sends multi-stage reminders for upcoming webinars:
 * - 7 days before: Email reminder to all registered attendees
 * - 24 hours before: Email + WhatsApp + Push notifications
 * - 2 hours before: Push notification
 * - 15 minutes before: Urgent push notification
 */

import cron from 'node-cron';
import { Sequelize } from 'sequelize';
import webinarNotificationService from './webinar-notification.service.js';
import { tick, tickError } from '../utils/cronRegistry.js';
import n8nService from './n8n.service.js';

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

class WebinarReminderService {
  constructor() {
    this.isRunning = false;
  }

  /**
   * Start all webinar reminder cron jobs
   */
  start() {
    if (this.isRunning) {
      console.log('⚠️  Webinar reminder service already running');
      return;
    }

    this.isRunning = true;

    // Run every 30 minutes to check for webinar reminders
    cron.schedule('*/30 * * * *', async () => {
      await this.checkAndSendReminders();
    });

    console.log('✅ Webinar reminder automation started (checks every 30 minutes)');
  }

  /**
   * Check webinars and send reminders based on time windows
   */
  async checkAndSendReminders() {
    console.log('🔔 Checking for webinar reminders...');
    
    try {
      const now = new Date();
      
      // Define time windows
      const sevenDaysLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      const sixDaysLater = new Date(now.getTime() + 6 * 24 * 60 * 60 * 1000);
      
      const twentyFourHoursLater = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const twentyThreeHoursLater = new Date(now.getTime() + 23 * 60 * 60 * 1000);
      
      const twoHoursLater = new Date(now.getTime() + 2 * 60 * 60 * 1000);
      const oneHourLater = new Date(now.getTime() + 1 * 60 * 60 * 1000);
      
      const fifteenMinutesLater = new Date(now.getTime() + 15 * 60 * 1000);
      const tenMinutesLater = new Date(now.getTime() + 10 * 60 * 1000);

      // Get upcoming webinars (scheduled status)
      const upcomingWebinars = await sequelize.query(
        `SELECT w.*, 
          CONCAT(d."firstName", ' ', d."lastName") as doctor_name, 
          u.email as doctor_email,
          COUNT(wr.id) as registered_count
         FROM webinars w
         LEFT JOIN doctors d ON w.doctor_id = d.id
         LEFT JOIN users u ON d."userId" = u.id
         LEFT JOIN webinar_registrations wr ON w.id = wr.webinar_id 
           AND wr.registration_status IN ('registered', 'approved')
         WHERE w.status = 'scheduled'
           AND w.scheduled_at > ?
         GROUP BY w.id, d."firstName", d."lastName", u.email
         ORDER BY w.scheduled_at ASC`,
        { 
          replacements: [now.toISOString()], 
          type: Sequelize.QueryTypes.SELECT 
        }
      );

      let sent1week = 0;
      let sent24h = 0;
      let sent2h = 0;
      let sent15min = 0;

      for (const webinar of upcomingWebinars) {
        try {
          const scheduledStart = new Date(webinar.scheduled_at);

          // 1-week reminder window (6-7 days before)
          if (scheduledStart > sixDaysLater && 
              scheduledStart <= sevenDaysLater &&
              !webinar.reminder_1week_sent) {
            await webinarNotificationService.sendOneWeekReminder(webinar);
            n8nService.trigger('webinar-reminder', { webinarId: webinar.id, webinarTitle: webinar.title, scheduledAt: webinar.scheduled_at, reminderType: '1-week', hostName: webinar.host_name || '', joinUrl: webinar.join_url || '' }).catch(() => {});
            sent1week++;
          }

          // 24-hour reminder window (23-24 hours before)
          if (scheduledStart > twentyThreeHoursLater && 
              scheduledStart <= twentyFourHoursLater &&
              !webinar.reminder_24h_sent) {
            await webinarNotificationService.send24HourReminder(webinar);
            n8nService.trigger('webinar-reminder', { webinarId: webinar.id, webinarTitle: webinar.title, scheduledAt: webinar.scheduled_at, reminderType: '24h', hostName: webinar.host_name || '', joinUrl: webinar.join_url || '' }).catch(() => {});
            sent24h++;
          }

          // 2-hour reminder window (1-2 hours before)
          if (scheduledStart > oneHourLater && 
              scheduledStart <= twoHoursLater &&
              !webinar.reminder_2h_sent) {
            await webinarNotificationService.send2HourReminder(webinar);
            n8nService.trigger('webinar-reminder', { webinarId: webinar.id, webinarTitle: webinar.title, scheduledAt: webinar.scheduled_at, reminderType: '2h', hostName: webinar.host_name || '', joinUrl: webinar.join_url || '' }).catch(() => {});
            sent2h++;
          }

          // 15-minute reminder window (10-15 minutes before)
          if (scheduledStart > tenMinutesLater && 
              scheduledStart <= fifteenMinutesLater &&
              !webinar.reminder_15min_sent) {
            await webinarNotificationService.send15MinuteReminder(webinar);
            n8nService.trigger('webinar-reminder', { webinarId: webinar.id, webinarTitle: webinar.title, scheduledAt: webinar.scheduled_at, reminderType: '15min', hostName: webinar.host_name || '', joinUrl: webinar.join_url || '' }).catch(() => {});
            sent15min++;
          }

        } catch (error) {
          console.error(`Error processing webinar ${webinar.id}:`, error.message);
        }
      }

      if (sent1week + sent24h + sent2h + sent15min > 0) {
        console.log(`✅ Webinar reminders sent: 1-week(${sent1week}), 24h(${sent24h}), 2h(${sent2h}), 15min(${sent15min})`);
      } else {
        console.log('ℹ️  No webinar reminders to send at this time');
      }
      tick('webinar_reminder', { sent1week, sent24h, sent2h, sent15min });

    } catch (error) {
      console.error('❌ Webinar reminder check failed:', error);
      tickError('webinar_reminder', error.message);
    }
  }

  /**
   * Send immediate reminder for testing
   */
  async sendTestReminder(webinarId, reminderType = '24h') {
    try {
      const webinar = await sequelize.query(
        `SELECT w.*, CONCAT(d."firstName", ' ', d."lastName") as doctor_name, u.email as doctor_email
         FROM webinars w
         LEFT JOIN doctors d ON w.doctor_id = d.id
         LEFT JOIN users u ON d."userId" = u.id
         WHERE w.id = $1`,
        { replacements: [webinarId], type: Sequelize.QueryTypes.SELECT }
      );

      if (webinar.length === 0) {
        throw new Error('Webinar not found');
      }

      const webinarData = webinar[0];

      switch (reminderType) {
        case '1week':
          return await webinarNotificationService.sendOneWeekReminder(webinarData);
        case '24h':
          return await webinarNotificationService.send24HourReminder(webinarData);
        case '2h':
          return await webinarNotificationService.send2HourReminder(webinarData);
        case '15min':
          return await webinarNotificationService.send15MinuteReminder(webinarData);
        default:
          throw new Error('Invalid reminder type');
      }
    } catch (error) {
      console.error('Test reminder failed:', error);
      throw error;
    }
  }

  /**
   * Get reminder statistics
   */
  async getReminderStats() {
    try {
      const stats = await sequelize.query(
        `SELECT 
          COUNT(*) FILTER (WHERE reminder_1week_sent = TRUE) as week_reminders_sent,
          COUNT(*) FILTER (WHERE reminder_24h_sent = TRUE) as day_reminders_sent,
          COUNT(*) FILTER (WHERE reminder_2h_sent = TRUE) as hour_reminders_sent,
          COUNT(*) FILTER (WHERE reminder_15min_sent = TRUE) as urgent_reminders_sent,
          COUNT(*) FILTER (WHERE status = 'scheduled' AND scheduled_at > NOW()) as upcoming_webinars,
          COUNT(*) FILTER (WHERE status = 'scheduled' 
            AND scheduled_at > NOW() 
            AND reminder_24h_sent = FALSE
            AND scheduled_at < NOW() + INTERVAL '25 hours') as pending_24h_reminders
         FROM webinars`,
        { type: Sequelize.QueryTypes.SELECT }
      );

      return stats[0];
    } catch (error) {
      console.error('Failed to get reminder stats:', error);
      return null;
    }
  }
}

const service = new WebinarReminderService();

// Auto-start service
service.start();

export default service;
export { WebinarReminderService };
