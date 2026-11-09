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
  if (!instant || instant.getTime() <= now || instant.getTime() - minutes * 60000 > now || now - (instant.getTime() - minutes * 60000) >= 60000) return null;
  const key = `${date}/${time}/${minutes}`;
  if (appointment.metadata?.preferenceReminderKey === key) return null;
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(now));
  const dateLabel = date === today ? 'Today' : instant.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short' });
  const timeLabel = instant.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit', hour12: true });
  const doctor = appointment.doctorName ? ` with Dr. ${String(appointment.doctorName).replace(/^(?:Dr\.?\s*)+/i, '').trim()}` : '';
  return { key, date, time, minutes, message: `${dateLabel}, ${timeLabel}${doctor} (IST).` };
}

// The notification and deduplication marker commit together under the appointment row lock.
export async function sendPreferenceReminders({ database = db, preferencesFor = getNotificationPreferences, setContext = setRlsContext, delivery, now = Date.now() } = {}) {
  const deliveries = await database.transaction(async transaction => {
    await setContext(transaction, { orgId: 0, userId: 0, isPlatformAdmin: true });
    const query = (sql, replacements) => database.query(sql, { transaction, replacements, type: database.QueryTypes.SELECT });
    const appointments = await query(`SELECT id,"userId","doctorName","appointmentDate","appointmentTime",metadata FROM appointments
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
      // `data` carries the appointmentId so this reminder stays tied to the
      // appointment it announces. Written without one, the row said "Today,
      // 12:00 pm with Dr. …" and named nothing the app could open or verify;
      // once the appointment was gone, the reminder outlived it as a phantom
      // the notification list could not detect (mobile 1.3.0 QA row 154).
      await query(`INSERT INTO notifications ("userId","userType",type,title,message,"isRead",status,channels,data,"webRoute","createdAt","updatedAt")
        VALUES (:userId,'patient','reminder','Appointment Reminder',:message,false,'sent',ARRAY['app'],CAST(:data AS jsonb),'/appointments',NOW(),NOW()) RETURNING id`,
      {
        userId: appointment.userId,
        message: decision.message,
        data: JSON.stringify({ appointmentId: appointment.id, reminderMinutesBefore: decision.minutes }),
      });
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
