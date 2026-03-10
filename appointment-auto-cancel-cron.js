/**
 * Appointment Auto-Cancel Cron Job
 * Runs at midnight (00:00) daily to cancel expired/no-show appointments
 * 
 * Logic:
 * - Appointments from previous day that are still 'scheduled' or 'confirmed'
 *   are automatically marked as 'no-show' (patient didn't attend)
 * - This helps keep the appointment system clean and accurate
 */

import cron from 'node-cron';
import { Op } from 'sequelize';
import Appointment from '../models/appointment.model.intelligent.js';

/**
 * Cancel expired appointments from previous day
 * Called at midnight to process previous day's unattended appointments
 */
const cancelExpiredAppointments = async () => {
  try {
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    console.log(`🔍 Checking for expired appointments from ${yesterdayStr}...`);

    // Find all appointments from yesterday (or earlier) that are still scheduled/confirmed
    const expiredAppointments = await Appointment.findAll({
      where: {
        appointmentDate: {
          [Op.lt]: now.toISOString().split('T')[0] // Before today
        },
        status: {
          [Op.in]: ['scheduled', 'confirmed', 'pending', 'accepted']
        }
      }
    });

    if (expiredAppointments.length === 0) {
      console.log('✅ No expired appointments found');
      return { processed: 0, cancelled: 0 };
    }

    console.log(`📋 Found ${expiredAppointments.length} expired appointment(s)`);

    let cancelledCount = 0;
    const cancelledIds = [];

    for (const appointment of expiredAppointments) {
      try {
        await appointment.update({
          status: 'no-show',
          cancellationReason: 'Patient did not attend - appointment expired (auto-cancelled by system)',
          cancelledBy: null,
          cancelledAt: new Date(),
          metadata: {
            ...appointment.metadata,
            autoCancelledAt: new Date().toISOString(),
            cancelledByRole: 'system',
            previousStatus: appointment.status
          }
        });

        cancelledIds.push(appointment.id);
        cancelledCount++;

        console.log(`   ❌ Appointment #${appointment.id} (${appointment.appointmentDate} ${appointment.appointmentTime}) -> no-show`);
      } catch (updateError) {
        console.error(`   ⚠️ Failed to update appointment #${appointment.id}:`, updateError.message);
      }
    }

    console.log(`✅ Auto-cancelled ${cancelledCount}/${expiredAppointments.length} expired appointments`);

    return {
      processed: expiredAppointments.length,
      cancelled: cancelledCount,
      appointmentIds: cancelledIds
    };
  } catch (error) {
    console.error('❌ Error in cancelExpiredAppointments:', error);
    throw error;
  }
};

/**
 * Auto-complete stale in-progress appointments
 * Appointments stuck in 'in-progress' from past dates are auto-completed
 * (Doctor never ended the consultation — system cleans up)
 */
const completeStaleInProgressAppointments = async () => {
  try {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    console.log(`🔍 Checking for stale in-progress appointments before ${todayStr}...`);

    const staleAppointments = await Appointment.findAll({
      where: {
        appointmentDate: {
          [Op.lt]: todayStr // Before today
        },
        status: 'in-progress'
      }
    });

    if (staleAppointments.length === 0) {
      console.log('✅ No stale in-progress appointments found');
      return { processed: 0, completed: 0 };
    }

    console.log(`📋 Found ${staleAppointments.length} stale in-progress appointment(s)`);

    let completedCount = 0;
    const completedIds = [];

    for (const appointment of staleAppointments) {
      try {
        await appointment.update({
          status: 'completed',
          metadata: {
            ...appointment.metadata,
            autoCompletedAt: new Date().toISOString(),
            completedByRole: 'system',
            previousStatus: 'in-progress',
            autoCompleteReason: 'Consultation session expired — doctor did not end call'
          }
        });

        completedIds.push(appointment.id);
        completedCount++;

        console.log(`   ✅ Appointment #${appointment.id} (${appointment.appointmentDate} ${appointment.appointmentTime}) -> completed (auto)`);
      } catch (updateError) {
        console.error(`   ⚠️ Failed to auto-complete appointment #${appointment.id}:`, updateError.message);
      }
    }

    console.log(`✅ Auto-completed ${completedCount}/${staleAppointments.length} stale in-progress appointments`);

    return {
      processed: staleAppointments.length,
      completed: completedCount,
      appointmentIds: completedIds
    };
  } catch (error) {
    console.error('❌ Error in completeStaleInProgressAppointments:', error);
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
    console.log('🕛 Running midnight appointment auto-cancel job...');
    try {
      const result = await cancelExpiredAppointments();
      console.log(`📊 Auto-cancel summary: ${result.cancelled} appointments marked as no-show`);

      const staleResult = await completeStaleInProgressAppointments();
      console.log(`📊 Auto-complete summary: ${staleResult.completed} stale in-progress appointments completed`);
    } catch (error) {
      console.error('❌ Appointment auto-cancel job failed:', error);
    }
  }, {
    timezone: 'Asia/Kolkata' // Indian Standard Time
  });

  // Also run a check at 6 AM as backup (in case midnight job missed any)
  cron.schedule('0 6 * * *', async () => {
    console.log('🌅 Running morning appointment cleanup check...');
    try {
      const result = await cancelExpiredAppointments();
      if (result.cancelled > 0) {
        console.log(`📊 Morning cleanup: ${result.cancelled} additional appointments marked as no-show`);
      }

      const staleResult = await completeStaleInProgressAppointments();
      if (staleResult.completed > 0) {
        console.log(`📊 Morning cleanup: ${staleResult.completed} additional stale in-progress appointments completed`);
      }
    } catch (error) {
      console.error('❌ Morning cleanup job failed:', error);
    }
  }, {
    timezone: 'Asia/Kolkata'
  });

  console.log('✅ Appointment auto-cancel cron jobs scheduled:');
  console.log('   - Midnight auto-cancel + stale auto-complete: Daily at 00:00 IST');
  console.log('   - Morning cleanup: Daily at 06:00 IST');
};

export { cancelExpiredAppointments, completeStaleInProgressAppointments, scheduleAppointmentAutoCancel };
export default scheduleAppointmentAutoCancel;
