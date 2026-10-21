/**
 * Shared appointment slot time helpers.
 * Slots may appear as "09:00", "09:00:00", or "09:00 - 09:15".
 */

const HHMM_RE = /^([01]\d|2[0-3]):([0-5]\d)/;

/** Extract canonical HH:MM start time from a slot or time value. */
export const getSlotStartTime = (value = '') => {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return '';

  if (trimmed.includes('-')) {
    const start = trimmed.split('-')[0].trim();
    const match = start.match(HHMM_RE);
    if (match) return `${match[1]}:${match[2]}`;
  }

  const match = trimmed.match(HHMM_RE);
  if (match) return `${match[1]}:${match[2]}`;
  return trimmed;
};

/** Alias used by booking controllers — same as getSlotStartTime. */
export const canonicalizeAppointmentTime = (value = '') => getSlotStartTime(value);

/** Backward-compatible alias. */
export const normalizeTimeHHMM = canonicalizeAppointmentTime;

/** Strip whitespace so "10:00 - 10:30" and "10:00-10:30" compare equal. */
export const normalizeSlotKey = (slot) => String(slot ?? '').replace(/\s+/g, '');

/** True when two slot strings refer to the same booking window. */
export const slotsMatch = (slotA, slotB) => {
  if (!slotA || !slotB) return false;
  if (normalizeSlotKey(slotA) === normalizeSlotKey(slotB)) return true;
  return getSlotStartTime(slotA) === getSlotStartTime(slotB);
};

/** True when `slot` overlaps any value in `bookedTimes`. */
export const isSlotBooked = (slot, bookedTimes) => {
  if (!Array.isArray(bookedTimes) || bookedTimes.length === 0) return false;
  return bookedTimes.some((booked) => slotsMatch(slot, booked));
};

/** Find the first conflicting appointment in a pre-fetched list. */
export const findSlotConflict = (appointments, slotTime, { excludeId } = {}) => {
  if (!Array.isArray(appointments)) return null;
  return (
    appointments.find((apt) => {
      if (excludeId != null && String(apt.id) === String(excludeId)) return false;
      return slotsMatch(apt.appointmentTime, slotTime);
    }) || null
  );
};

/** Booking schedules are published in India time, independent of the server timezone. */
export const appointmentSlotInstant = (date, time) => {
  const day = String(date || '');
  const start = getSlotStartTime(time);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(start)) return null;
  const parsedDay = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(parsedDay.getTime()) || parsedDay.toISOString().slice(0, 10) !== day) return null;
  const value = new Date(`${day}T${start}:00+05:30`);
  return Number.isNaN(value.getTime()) ? null : value;
};
export const isFutureAppointmentSlot = (date, time, now = Date.now()) => {
  const instant = appointmentSlotInstant(date, time);
  return instant !== null && instant.getTime() > Number(now);
};
