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
