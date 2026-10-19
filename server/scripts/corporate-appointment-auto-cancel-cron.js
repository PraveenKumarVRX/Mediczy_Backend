/**
 * Corporate Appointment Auto-No-Show Cron Job
 * Runs at midnight (00:00 IST) daily — mirrors appointment-auto-cancel-cron.js
 * but for HR-booked appointments in corporate_scheduled_appointments, which
 * the generic appointments-table cron does not touch.
 *
 * HR-booked appointments from before today that are still 'scheduled' are
 * automatically marked 'no-show'.
 */

import cron from 'node-cron';
import postgresSequelize from '../db/postgres-sequelize.js';
import { tick, tickError } from '../utils/cronRegistry.js';

const cancelExpiredCorporateAppointments = async () => {
  const [rows] = await postgresSequelize.query(
    `UPDATE corporate_scheduled_appointments
        SET status = 'no-show', "updatedAt" = NOW()
      WHERE date < CURRENT_DATE
        AND status = 'scheduled'
      RETURNING id`
  );
  return { processed: rows.length, cancelled: rows.length };
};

const scheduleCorporateAppointmentAutoCancel = () => {
  console.log('📅 Corporate appointment auto-no-show cron job initialized');

  cron.schedule('0 0 * * *', async () => {
    console.log('🕛 Running midnight corporate appointment auto-no-show job...');
    try {
      const result = await cancelExpiredCorporateAppointments();
      console.log(`📊 Corporate auto-no-show summary: ${result.cancelled} appointment(s) marked as no-show`);
      tick('corp_appt_autocancel', { cancelled: result.cancelled, processed: result.processed });
    } catch (error) {
      tickError('corp_appt_autocancel', error.message);
      console.error('❌ Corporate appointment auto-no-show job failed:', error);
    }
  }, {
    timezone: 'Asia/Kolkata',
  });

  console.log('✅ Corporate appointment auto-no-show cron scheduled: Daily at 00:00 IST');
};

export { cancelExpiredCorporateAppointments, scheduleCorporateAppointmentAutoCancel };
export default scheduleCorporateAppointmentAutoCancel;
