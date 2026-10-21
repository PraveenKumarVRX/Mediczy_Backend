/**
 * Appointment Auto-Cancel Cron Job
 * Runs at midnight (00:00) daily, plus a 6am backup, to close out past appointments
 *
 * Logic:
 * - Appointments whose time has passed and that never started (still
 *   'scheduled' | 'confirmed' | 'pending' | 'accepted') are marked 'no-show'.
 * - Appointments whose time has passed but that DID start ('in-progress') are
 *   marked 'completed' - the consultation began, it just never got closed out
 *   by the doctor/HR, and it must not be left stuck in 'in-progress' forever.
 * - The comparison uses appointmentDateTime (date+time), not just the date,
 *   so a same-day appointment whose time already passed is caught in the
 *   same run rather than waiting for the next midnight sweep.
 */

import cron from 'node-cron';
import { Op } from 'sequelize';
import Appointment from '../models/appointment.model.intelligent.js';
import { tick, tickError } from '../utils/cronRegistry.js';

const NEVER_STARTED_STATUSES = ['scheduled', 'confirmed', 'pending', 'accepted'];

/**
 * Close out past appointments: never-started -> no-show, in-progress -> completed.
 */
const cancelExpiredAppointments = async () => {
  try {
    const now = new Date();

    console.log(`🔍 Checking for past-due appointments as of ${now.toISOString()}...`);

    const expiredAppointments = await Appointment.findAll({
      where: {
        appointmentDateTime: {
          [Op.lt]: now
        },
        status: {
          [Op.in]: [...NEVER_STARTED_STATUSES, 'in-progress']
        }
      }
    });

    if (expiredAppointments.length === 0) {
      console.log('✅ No past-due appointments found');
      return { processed: 0, cancelled: 0, completed: 0 };
    }

    console.log(`📋 Found ${expiredAppointments.length} past-due appointment(s)`);

    let cancelledCount = 0;
    let completedCount = 0;
    const cancelledIds = [];
    const completedIds = [];

    for (const appointment of expiredAppointments) {
      try {
        const wasInProgress = appointment.status === 'in-progress';
        const nextStatus = wasInProgress ? 'completed' : 'no-show';

        await appointment.update({
          status: nextStatus,
          cancellationReason: wasInProgress
            ? undefined
            : 'Patient did not attend - appointment expired (auto-cancelled by system)',
          cancelledBy: wasInProgress ? undefined : null,
          cancelledAt: wasInProgress ? undefined : new Date(),
          metadata: {
            ...appointment.metadata,
            autoClosedAt: new Date().toISOString(),
            closedByRole: 'system',
            previousStatus: appointment.status
          }
        });

        if (wasInProgress) {
          completedIds.push(appointment.id);
          completedCount++;
        } else {
          cancelledIds.push(appointment.id);
          cancelledCount++;
        }

        console.log(`   ${wasInProgress ? '✔️' : '❌'} Appointment #${appointment.id} (${appointment.appointmentDate} ${appointment.appointmentTime}) -> ${nextStatus}`);
      } catch (updateError) {
        console.error(`   ⚠️ Failed to update appointment #${appointment.id}:`, updateError.message);
      }
    }

    console.log(`✅ Auto-closed ${cancelledCount + completedCount}/${expiredAppointments.length} past-due appointments (${cancelledCount} no-show, ${completedCount} completed)`);

    return {
      processed: expiredAppointments.length,
      cancelled: cancelledCount,
      completed: completedCount,
      appointmentIds: [...cancelledIds, ...completedIds]
    };
  } catch (error) {
    console.error('❌ Error in cancelExpiredAppointments:', error);
    throw error;
  }
};

/**
 * Schedule the appointment auto-cancel cron job
 * Runs at 00:00 (midnight) every day
 */
const scheduleAppointmentAutoCancel = () => {
  console.log('📅 Appointment auto-cancel cron job initialized');

  // Run at midnight (00:00) every day
  cron.schedule('0 0 * * *', async () => {
    console.log('🕛 Running midnight appointment auto-close job...');
    try {
      const result = await cancelExpiredAppointments();
      console.log(`📊 Auto-close summary: ${result.cancelled} marked no-show, ${result.completed} marked completed`);
      tick('appt_autocancel', { cancelled: result.cancelled, completed: result.completed, processed: result.processed });
    } catch (error) {
      tickError('appt_autocancel', error.message);
      console.error('❌ Appointment auto-close job failed:', error);
    }
  }, {
    timezone: 'Asia/Kolkata' // Indian Standard Time
  });

  // Also run a check at 6 AM as backup (in case midnight job missed any)
  cron.schedule('0 6 * * *', async () => {
    console.log('🌅 Running morning appointment cleanup check...');
    try {
      const result = await cancelExpiredAppointments();
      if (result.cancelled > 0 || result.completed > 0) {
        console.log(`📊 Morning cleanup: ${result.cancelled} additional no-show, ${result.completed} additional completed`);
      }
      tick('appt_morning_cleanup', { cancelled: result.cancelled, completed: result.completed });
    } catch (error) {
      tickError('appt_morning_cleanup', error.message);
      console.error('❌ Morning cleanup job failed:', error);
    }
  }, {
    timezone: 'Asia/Kolkata'
  });

  // Frequent same-day sweep: now that the comparison is time-aware
  // (appointmentDateTime, not just the date), a same-day appointment whose
  // time has already passed no longer needs to wait for the next midnight
  // run to be closed out.
  cron.schedule('*/15 * * * *', async () => {
    try {
      const result = await cancelExpiredAppointments();
      if (result.cancelled > 0 || result.completed > 0) {
        console.log(`📊 Same-day sweep: ${result.cancelled} no-show, ${result.completed} completed`);
      }
      tick('appt_sameday_sweep', { cancelled: result.cancelled, completed: result.completed });
    } catch (error) {
      tickError('appt_sameday_sweep', error.message);
      console.error('❌ Same-day appointment sweep failed:', error);
    }
  }, {
    timezone: 'Asia/Kolkata'
  });

  console.log('✅ Appointment auto-close cron jobs scheduled:');
  console.log('   - Midnight auto-close: Daily at 00:00 IST');
  console.log('   - Morning cleanup: Daily at 06:00 IST');
  console.log('   - Same-day sweep: Every 15 minutes');
};

export { cancelExpiredAppointments, scheduleAppointmentAutoCancel };
export default scheduleAppointmentAutoCancel;
