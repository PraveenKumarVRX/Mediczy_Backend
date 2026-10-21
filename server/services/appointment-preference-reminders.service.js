import { postgresSequelize as db } from '../db/postgres-sequelize.js';
import { setRlsContext } from '../middleware/rls-context.middleware.js';
import { getNotificationPreferences } from './notification-preferences.service.js';
import { appointmentSlotInstant } from '../utils/appointmentSlotTime.js';

export function preferenceReminderDecision(appointment, preferences, now = Date.now()) {
  const minutes = Number(preferences.reminderMinutesBefore ?? 30);
  if (preferences.appointmentReminders === false || ![5, 10, 15, 30, 60, 120, 1440].includes(minutes)) return null;
  const date = String(appointment.appointmentDate).slice(0, 10);
  const time = String(appointment.appointmentTime);
  const instant = appointmentSlotInstant(date, time);
  if (!instant || instant.getTime() <= now || instant.getTime() - minutes * 60000 > now) return null;
  const key = `${date}/${time}/${minutes}`;
  if (appointment.metadata?.preferenceReminderKey === key) return null;
  return { key, date, time, minutes, message: `Your health appointment is on ${date} at ${time.slice(0, 5)} IST.` };
}

// The notification and deduplication marker commit together under the appointment row lock.
export async function sendPreferenceReminders({ database = db, preferencesFor = getNotificationPreferences, setContext = setRlsContext, delivery, now = Date.now() } = {}) {
  const deliveries = await database.transaction(async transaction => {
    await setContext(transaction, { orgId: 0, userId: 0, isPlatformAdmin: true });
    const query = (sql, replacements) => database.query(sql, { transaction, replacements, type: database.QueryTypes.SELECT });
    const appointments = await query(`SELECT id,"userId","appointmentDate","appointmentTime",metadata FROM appointments
      WHERE status IN ('scheduled','confirmed','pending','accepted','rescheduled')
        AND "appointmentDate" BETWEEN (NOW() AT TIME ZONE 'Asia/Kolkata')::date AND (NOW() AT TIME ZONE 'Asia/Kolkata')::date+1
        AND ("appointmentDate"::text || 'T' || LEFT("appointmentTime"::text,5) || ':00+05:30')::timestamptz > NOW()
      ORDER BY "appointmentDate","appointmentTime",id FOR UPDATE SKIP LOCKED LIMIT 500`, {});
    const sent = [];
    for (const appointment of appointments) {
      const preferences = await preferencesFor(appointment.userId);
      const decision = preferenceReminderDecision(appointment, preferences, now);
      if (!decision) continue;
      // The personal in-app inbox is the durable delivery record; push/email are best-effort transports.
      await query(`INSERT INTO notifications ("userId","userType",type,title,message,"isRead",status,channels,"webRoute","createdAt","updatedAt")
        VALUES (:userId,'patient','reminder','Appointment Reminder',:message,false,'sent',ARRAY['app'],'/appointments',NOW(),NOW()) RETURNING id`,
      { userId: appointment.userId, message: decision.message });
      await query(`UPDATE appointments SET metadata=COALESCE(metadata,'{}'::jsonb)||jsonb_build_object('preferenceReminderKey',CAST(:key AS text)) WHERE id=:id RETURNING id`, { key: decision.key, id: appointment.id });
      sent.push({ appointment, preferences, decision });
    }
    return sent;
  });
  if (delivery) {
    for (const item of deliveries) await delivery(item).catch(error => console.error('[appointment-reminder] secondary delivery failed:', error.message));
  }
  return { sent: deliveries.length };
}
