import crypto from 'node:crypto';

const minutes = value => {
  const match = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(String(value));
  if (!match || +match[1] > 23 || +match[2] > 59) throw new Error('Invalid appointment time');
  return +match[1] * 60 + +match[2];
};

/** Reuses appointment models and conflict rules; receipt is committed with booking. */
export async function createTransactionalChatBooking(deps, data, { requestId, organizationId }) {
  const { database, Appointment, Availability, setContext, checkDoctor, checkPatient } = deps;
  if (!data.userId || !data.doctorId) throw new Error('An existing patient and a selected doctor are required');
  const date = data.appointmentDate instanceof Date ? data.appointmentDate.toISOString().slice(0, 10) : String(data.appointmentDate).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !requestId) throw new Error('Invalid booking request');
  const key = crypto.createHash('sha256').update(JSON.stringify([data.userId, organizationId ?? null, requestId])).digest('hex');
  return database.transaction(async transaction => {
    await setContext(transaction, { orgId: organizationId || 0, userId: data.userId });
    // Lock the date, not only the start time: existing duration-based rules cover overlaps.
    const locks = [`doctor:${data.doctorId}:${date}`, `patient:${data.userId}:${date}`, `receipt:${key}`].sort();
    for (const lock of locks) await database.query('SELECT pg_advisory_xact_lock(hashtextextended(:key, 0))', { replacements: { key: lock }, transaction });
    const existing = await Appointment.findOne({ where: { chat_request_key: key }, transaction });
    if (existing) return { appointment: existing, replayed: true };
    const at = minutes(data.appointmentTime);
    if (new Date(`${date}T${data.appointmentTime.slice(0, 5)}:00+05:30`).getTime() <= Date.now()) throw new Error('Appointment slot is in the past');
    const slots = await Availability.findAll({ where: { doctorId: data.doctorId, dayOfWeek: new Date(`${date}T12:00:00Z`).getUTCDay(), isAvailable: true }, transaction, lock: transaction.LOCK.UPDATE });
    const available = hasAvailableChatSlot(slots,data.appointmentTime);
    if (!available) throw new Error('Selected appointment slot is no longer available');
    if ((await checkDoctor(data.doctorId, date, data.appointmentTime, { transaction })).conflict ||
        (await checkPatient(data.userId, date, data.appointmentTime, { transaction })).conflict) {
      throw Object.assign(new Error('Selected appointment slot is already booked'), { statusCode: 409 });
    }
    const appointment = await Appointment.create({ ...data, appointmentDate: date, organization_id: organizationId || null, chat_request_key: key }, { transaction });
    return { appointment, replayed: false };
  });
}

export function hasAvailableChatSlot(slots, time) {
  const at=minutes(time);
  return slots.some(slot=>{const duration=Number(slot.slotDuration)||30;return at>=minutes(slot.startTime)&&at+duration<=minutes(slot.endTime)&&(at-minutes(slot.startTime))%duration===0;});
}
