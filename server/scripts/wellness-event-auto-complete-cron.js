/**
 * Wellness Event Auto-Complete Cron Job
 *
 * No code anywhere transitioned corporate_wellness_events out of 'upcoming'
 * once an event's end time passed - QA found events still shown "upcoming"
 * (and the Completed count stuck at 0) hours or days after they ended.
 * Mirrors appointment-auto-cancel-cron.js's pattern: a time-aware sweep,
 * both at a fixed cadence and every 15 minutes for same-day events.
 */

import cron from 'node-cron';
import { postgresSequelize } from '../db/postgres-sequelize.js';
import { tick, tickError } from '../utils/cronRegistry.js';

const completePastWellnessEvents = async () => {
  const [rows] = await postgresSequelize.query(
    `UPDATE corporate_wellness_events
        SET status = 'completed', updated_at = NOW()
      WHERE status = 'upcoming'
        AND (event_date + COALESCE(end_time, event_time, '23:59:59'::time)) < NOW()
      RETURNING id`
  );
  return { completed: rows.length };
};

const scheduleWellnessEventAutoComplete = () => {
  console.log('📅 Wellness event auto-complete cron job initialized');

  cron.schedule('*/15 * * * *', async () => {
    try {
      const result = await completePastWellnessEvents();
      if (result.completed > 0) {
        console.log(`📊 Wellness event sweep: ${result.completed} event(s) marked completed`);
      }
      tick('wellness_event_autocomplete', { completed: result.completed });
    } catch (error) {
      tickError('wellness_event_autocomplete', error.message);
      console.error('❌ Wellness event auto-complete job failed:', error);
    }
  }, {
    timezone: 'Asia/Kolkata',
  });

  console.log('✅ Wellness event auto-complete cron scheduled: Every 15 min');
};

export { completePastWellnessEvents, scheduleWellnessEventAutoComplete };
export default scheduleWellnessEventAutoComplete;
