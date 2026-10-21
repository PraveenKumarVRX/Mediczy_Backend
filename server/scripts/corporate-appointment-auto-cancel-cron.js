/**
 * Corporate Appointment Auto-No-Show Cron Job
 * Mirrors appointment-auto-cancel-cron.js but for HR-booked appointments in
 * corporate_scheduled_appointments, which the generic appointments-table
 * cron does not touch.
 *
 * HR-booked appointments whose date+time has passed and are still
 * 'scheduled' are automatically marked 'no-show'. The comparison is
 * time-aware (date + time, not just date) so a same-day appointment whose
 * time already passed doesn't wait for the next midnight run, and the job
 * also runs every 15 minutes (in addition to the midnight run) for that
 * reason. This table has no 'in-progress'/'confirmed' states (the allowed
 * set per PUT /corporate/appointments/:id is just
 * scheduled|completed|cancelled|no-show), so unlike the generic cron there
 * is no completed-transition case here.
 */

import cron from 'node-cron';
import postgresSequelize from '../db/postgres-sequelize.js';
import { tick, tickError } from '../utils/cronRegistry.js';

const cancelExpiredCorporateAppointments = async () => {
  const [rows] = await postgresSequelize.query(
    `UPDATE corporate_scheduled_appointments
        SET status = 'no-show', "updatedAt" = NOW()
      WHERE (date + "time"::time) < (NOW() AT TIME ZONE 'Asia/Kolkata')
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

  cron.schedule('*/15 * * * *', async () => {
    try {
      const result = await cancelExpiredCorporateAppointments();
      if (result.cancelled > 0) {
        console.log(`📊 Corporate same-day sweep: ${result.cancelled} appointment(s) marked as no-show`);
      }
      tick('corp_appt_sameday_sweep', { cancelled: result.cancelled });
    } catch (error) {
      tickError('corp_appt_sameday_sweep', error.message);
      console.error('❌ Corporate appointment same-day sweep failed:', error);
    }
  }, {
    timezone: 'Asia/Kolkata',
  });

  console.log('✅ Corporate appointment auto-no-show cron scheduled: Daily at 00:00 IST + every 15 min');
};

export { cancelExpiredCorporateAppointments, scheduleCorporateAppointmentAutoCancel };
export default scheduleCorporateAppointmentAutoCancel;
