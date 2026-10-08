/**
 * Live OT proctoring rooms per organization, so a specialist console can list what to join.
 *
 * In memory on purpose: rooms are minutes-to-hours long and the LiveKit room itself is the source of
 * truth. A restart forgets the list (the display just starts a new session); this is only valid while the
 * API runs as a single process.
 */

export const OT_PROCTOR_ROOM_PREFIX = 'display-ot-proctor-';
export const OT_PROCTOR_MAX_AGE_MS = 12 * 60 * 60 * 1000;

const byOrg = new Map(); // organizationId -> Map(roomId -> { roomId, startedAt })

const key = (organizationId) => String(organizationId);

export function registerRoom(organizationId, roomId, now = Date.now()) {
  const rooms = byOrg.get(key(organizationId)) ?? new Map();
  rooms.set(roomId, { roomId, startedAt: now });
  byOrg.set(key(organizationId), rooms);
}

export function endRoom(organizationId, roomId) {
  byOrg.get(key(organizationId))?.delete(roomId);
}

export function listActiveRooms(organizationId, now = Date.now()) {
  const rooms = byOrg.get(key(organizationId));
  if (!rooms) return [];
  for (const [id, r] of rooms) if (now - r.startedAt > OT_PROCTOR_MAX_AGE_MS) rooms.delete(id);
  return [...rooms.values()].sort((a, b) => b.startedAt - a.startedAt);
}

/** Organization-bound room name check shared by the observer endpoint. Returns { ok, status, message }. */
export function checkObserverRoom(organizationId, roomId, now = Date.now()) {
  const prefix = `${OT_PROCTOR_ROOM_PREFIX}${organizationId}-`;
  const startedAt = Number(String(roomId || '').slice(prefix.length));
  if (!roomId || !String(roomId).startsWith(prefix) || !Number.isFinite(startedAt)) {
    return { ok: false, status: 403, message: 'Not a proctoring room of your organization' };
  }
  if (now - startedAt > OT_PROCTOR_MAX_AGE_MS) return { ok: false, status: 410, message: 'This proctoring session has expired' };
  return { ok: true };
}
