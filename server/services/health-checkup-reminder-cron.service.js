/**
 * Health Checkup Appointment Reminder Cron
 *
 * Once a day, sends a T-24h reminder for every active health-checkup booking whose
 * appointment is tomorrow (IST). Reuses the shared notifier (health-checkup-notify.service.js)
 * so reminders go out on the same channels as confirmations (email + WhatsApp, SMS fallback,
 * employee copy for beneficiary bookings). Best-effort: a provider outage never fails the run.
 */

import cron from 'node-cron';
import { postgresSequelize } from '../db/postgres-sequelize.js';
import { withCron } from '../utils/cronRegistry.js';
import { notifyBooking } from './health-checkup-notify.service.js';

const ACTIVE_STATUSES = ['payment_pending', 'confirmed', 'scheduled', 'rescheduled'];

// Tomorrow's date (YYYY-MM-DD) in IST, matching the booking flow's IST date convention.
function tomorrowIST() {
  const now = new Date();
  const istNow = new Date(now.getTime() + (now.getTimezoneOffset() + 330) * 60000);
  istNow.setDate(istNow.getDate() + 1);
  return istNow.toISOString().slice(0, 10);
}

export async function runHealthCheckupReminders() {
  const date = tomorrowIST();
  const rows = await postgresSequelize.query(
    `SELECT * FROM health_checkup_bookings
      WHERE appointment_date = :date
        AND status IN (:statuses)
        AND NOT is_demo_account(user_id)`, // a demo booking's beneficiary phone may be anyone's
    { replacements: { date, statuses: ACTIVE_STATUSES }, type: postgresSequelize.QueryTypes.SELECT }
  );
  let sent = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      const summary = await notifyBooking(row, 'reminder');
      sent += 1;
      failed += summary?.failed || 0;
    } catch (error) {
      failed += 1;
      console.error('[health-checkup-reminders] notify failed for booking', row.id, error.message);
    }
  }
  return { date, bookings: rows.length, remindersSent: sent, channelFailures: failed };
}

class HealthCheckupReminderCronService {
  constructor() {
    this.isRunning = false;
    this._job = null;
  }

  start() {
    if (this.isRunning) return;
    // Daily at 6 PM IST (12:30 UTC) — the evening before the appointment.
    this._job = cron.schedule('30 12 * * *', async () => {
      try {
        const result = await withCron('health_checkup_reminders', runHealthCheckupReminders);
        if (!result?.skipped) {
          console.log(`🩺 [health-checkup-reminders] ${result.remindersSent}/${result.bookings} reminders for ${result.date} (${result.channelFailures} channel failures)`);
        }
      } catch (err) {
        console.error('🩺 [health-checkup-reminders] Error:', err.message);
      }
    });
    this.isRunning = true;
    console.log('🩺 Health checkup reminder cron started (runs daily at 6:00 PM IST)');
  }

  stop() {
    if (this._job) {
      this._job.destroy();
      this._job = null;
    }
    this.isRunning = false;
  }
}

export default new HealthCheckupReminderCronService();
