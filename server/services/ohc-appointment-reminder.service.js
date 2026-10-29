/** Delivers one 24-hour reminder for scheduled OHC visits through Mediqzy's
 * existing notification service. The appointment row is the idempotency record. */
import cron from 'node-cron';
import pool from '../db/pgPool.js';
import notificationService from './notification.service.js';

let started = false;

export async function sendDueOhcAppointmentReminders() {
  const { rows } = await pool.query(
    `SELECT a.id, a.employee_user_id, a.appointment_type, a.scheduled_at, a.unit_uid
       FROM ohc_appointments a
      WHERE a.status = 'scheduled' AND a.reminder_sent_at IS NULL
        AND a.scheduled_at >= now() + INTERVAL '23 hours 45 minutes'
        AND a.scheduled_at < now() + INTERVAL '24 hours 15 minutes'
      ORDER BY a.scheduled_at LIMIT 100`);
  let sent = 0;
  for (const appointment of rows) {
    try {
      await notificationService.sendNotification({
        userId: appointment.employee_user_id, userType: 'patient', title: 'Occupational health appointment reminder',
        body: `Reminder: your ${appointment.appointment_type.replaceAll('_', ' ')} is scheduled for ${new Date(appointment.scheduled_at).toLocaleString()}.`,
        type: 'appointment_reminder', data: { ohcAppointmentId: appointment.id, unitUid: appointment.unit_uid },
      });
      const updated = await pool.query(`UPDATE ohc_appointments SET reminder_sent_at = now(), updated_at = now() WHERE id = $1 AND reminder_sent_at IS NULL`, [appointment.id]);
      if (updated.rowCount) sent += 1;
    } catch (error) { console.error('[ohc] automatic appointment reminder failed:', error.message); }
  }
  return { examined: rows.length, sent };
}

export function startOhcAppointmentReminder() {
  if (started) return;
  started = true;
  cron.schedule('* * * * *', () => void sendDueOhcAppointmentReminders());
  console.log('OHC appointment reminder automation started');
}
