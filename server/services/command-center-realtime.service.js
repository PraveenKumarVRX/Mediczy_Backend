/**
 * Hospital Command Center — real-time broadcast (Upgrade Plan Track B, Phase B2)
 *
 * Command-center data was pull-on-request only (GET /api/v1/analytics/
 * command-center). This adds the push side: every tick, recompute
 * getCommandCenter() for each organization that has at least one socket
 * subscribed (see chathandler.controller.js's "subscribe-command-center"
 * handler) and emit the update to that org's room.
 *
 * Cluster-safety: mediczy-server runs in PM2 cluster mode. io.to(room)
 * .emit() already propagates cluster-wide via the Socket.IO Redis adapter
 * regardless of which worker calls it, so the only failure mode to avoid
 * is every worker independently running this interval and each emitting
 * its own copy — clients would see duplicate updates per tick. Gated to
 * instance 0 only, the same pattern initialization.controller.js already
 * uses for cron jobs.
 */
import { getIO } from '../chat/chathandler.controller.js';
import { getCommandCenter } from './analytics.service.js';

const ROOM_PREFIX = 'command-center-';

function activeOrgIdsFromRooms(io) {
  const rooms = io.sockets.adapter.rooms;
  const orgIds = [];
  for (const roomName of rooms.keys()) {
    if (!roomName.startsWith(ROOM_PREFIX)) continue;
    const room = rooms.get(roomName);
    if (!room || room.size === 0) continue;
    const orgId = roomName.slice(ROOM_PREFIX.length);
    if (orgId) orgIds.push(orgId);
  }
  return orgIds;
}

export async function broadcastCommandCenterUpdates() {
  const io = getIO?.();
  if (!io) return { broadcast: 0, activeRooms: 0 };

  const orgIds = activeOrgIdsFromRooms(io);
  let broadcastCount = 0;

  for (const orgId of orgIds) {
    try {
      const data = await getCommandCenter(orgId);
      io.to(`${ROOM_PREFIX}${orgId}`).emit('command-center:update', data);
      broadcastCount += 1;
    } catch (err) {
      console.error(`[CommandCenterRealtime] broadcast failed for org ${orgId}:`, err.message);
    }
  }

  return { broadcast: broadcastCount, activeRooms: orgIds.length };
}

let intervalHandle = null;

export function startCommandCenterBroadcastLoop(intervalMs = 30000) {
  const instanceId = process.env.NODE_APP_INSTANCE;
  const isPrimary = instanceId === undefined || instanceId === '0';
  if (!isPrimary) {
    console.log(`⏭️  Skipping command-center broadcast loop on cluster instance ${instanceId} (handled by instance 0)`);
    return;
  }
  if (intervalHandle) return;

  intervalHandle = setInterval(() => {
    broadcastCommandCenterUpdates().catch((err) =>
      console.error('[CommandCenterRealtime] loop error:', err.message)
    );
  }, intervalMs);
  intervalHandle.unref?.();
  console.log(`📊 Command Center real-time broadcast loop started (every ${intervalMs / 1000}s, instance 0 only)`);
}

export function stopCommandCenterBroadcastLoop() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}

export default { broadcastCommandCenterUpdates, startCommandCenterBroadcastLoop, stopCommandCenterBroadcastLoop };
