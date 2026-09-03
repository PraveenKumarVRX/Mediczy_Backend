/**
 * Tele-ICU Tier-2 routes: bedside device bridge + cross-hospital command network.
 * Mounted at /api/v1/tele-icu
 *
 * Devices:
 *   POST /devices                register camera/audio for a bed
 *   GET  /devices?bedId=&icuUnit=
 *   POST /devices/:id/heartbeat
 *   POST /devices/:id/commands   issue PTZ/audio command (queued)
 *   POST /devices/:id/poll       on-site agent poll+ack (outbound-only model)
 *   POST /sessions               start AV session   POST /sessions/:id/end
 * Command network:
 *   POST /networks | GET /networks | POST /networks/:id/members
 *   POST /networks/:id/roster | GET /networks/:id/roster | GET /networks/:id/on-call
 *   GET  /networks/:id/census    cross-org roll-up
 */
import express from 'express';
import { authUser } from '../middleware/auth.middleware.js';
import {
  registerBedDevice, listBedDevices, deviceHeartbeat, startAvSession, endAvSession,
  issueCommand, pollPendingCommands,
} from '../services/tele-icu/tele-icu-device-bridge.service.js';
import {
  createNetwork, addMember, listNetworks, addRosterShift, listRoster,
  getOnCall, getNetworkCensus,
} from '../services/tele-icu/icu-command-network.service.js';

const router = express.Router();
const orgId = req => req.user.organization_id || req.user.tenant_id || req.user.hospitalId || req.user.id;
const wrap = handler => async (req, res) => {
  try {
    const data = await handler(req, res);
    if (!res.headersSent) res.json({ success: true, data });
  } catch (err) {
    const status = /required|invalid|not found|not open|not adequate|not PTZ|no members|cannot/i.test(err.message) ? 400 : 500;
    res.status(status).json({ success: false, message: err.message });
  }
};

// ── Bed devices ──────────────────────────────────────────────────────────────

router.post('/devices', authUser, wrap(req => {
  const { bedId, deviceType, icuUnit, vendor, model, streamUrl, ptzCapable, presets, metadata } = req.body || {};
  if (!bedId || !deviceType) throw new Error('bedId and deviceType are required');
  return registerBedDevice({ organizationId: orgId(req), bedId, deviceType, icuUnit, vendor, model, streamUrl, ptzCapable, presets, metadata });
}));

router.get('/devices', authUser, wrap(req => listBedDevices(orgId(req), {
  bedId: req.query.bedId || null, icuUnit: req.query.icuUnit || null,
})));

router.post('/devices/:id/heartbeat', authUser, wrap(req =>
  deviceHeartbeat(Number(req.params.id), orgId(req), { status: req.body?.status || 'online' })
));

router.post('/devices/:id/commands', authUser, wrap(req => {
  const { commandType, payload, sessionId } = req.body || {};
  if (!commandType) throw new Error('commandType is required');
  return issueCommand({
    organizationId: orgId(req), deviceId: Number(req.params.id),
    sessionId: sessionId ? Number(sessionId) : null, commandType, payload, issuedBy: req.user.id,
  });
}));

router.post('/devices/:id/poll', authUser, wrap(req =>
  pollPendingCommands(Number(req.params.id), orgId(req), { ackIds: (req.body?.ackIds || []).map(Number) })
));

// ── AV sessions ──────────────────────────────────────────────────────────────

router.post('/sessions', authUser, wrap(req => {
  const { bedId, sessionType, metadata } = req.body || {};
  if (!bedId) throw new Error('bedId is required');
  return startAvSession({ organizationId: orgId(req), bedId, sessionType, startedBy: req.user.id, metadata });
}));

router.post('/sessions/:id/end', authUser, wrap(req =>
  endAvSession(Number(req.params.id), orgId(req), { endReason: req.body?.endReason || null })
));

// ── Command network ──────────────────────────────────────────────────────────

router.post('/networks', authUser, wrap(req => {
  const { name, metadata } = req.body || {};
  if (!name) throw new Error('name is required');
  return createNetwork({ hubOrganizationId: orgId(req), name, metadata });
}));

router.get('/networks', authUser, wrap(req => listNetworks(orgId(req))));

router.post('/networks/:id/members', authUser, wrap(req => {
  const { organizationId, role, icuUnits } = req.body || {};
  if (!organizationId) throw new Error('organizationId is required');
  return addMember(Number(req.params.id), { organizationId: Number(organizationId), role, icuUnits });
}));

router.post('/networks/:id/roster', authUser, wrap(req => {
  const { intensivistId, intensivistName, spokeOrgId, shiftDate, shiftStart, shiftEnd } = req.body || {};
  if (!intensivistId) throw new Error('intensivistId is required');
  return addRosterShift({
    networkId: Number(req.params.id), intensivistId: Number(intensivistId),
    intensivistName, spokeOrgId: spokeOrgId ? Number(spokeOrgId) : null,
    shiftDate, shiftStart, shiftEnd,
  });
}));

router.get('/networks/:id/roster', authUser, wrap(req =>
  listRoster(Number(req.params.id), { shiftDate: req.query.shiftDate || null })
));

router.get('/networks/:id/on-call', authUser, wrap(req =>
  getOnCall(Number(req.params.id), req.query.spokeOrgId ? Number(req.query.spokeOrgId) : null)
));

router.get('/networks/:id/census', authUser, wrap(req => getNetworkCensus(Number(req.params.id))));

export default router;
