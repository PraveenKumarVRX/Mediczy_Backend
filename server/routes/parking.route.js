/**
 * Parking — API routes
 * Hospital parking operations (lots, gate movements, passes, watchlist,
 * incidents, overstay alerts, device registry, analytics). Administrative,
 * not SaMD. Service: server/services/parking.service.js.
 *
 * Lives inside the Security portal (/security/parking). Access is the portal's own
 * gate: security staff and the hospital admin/owner account, within their organization.
 */

import express from 'express';
import { authUser, requireRole } from '../middleware/auth.middleware.js';
import { requireModule } from '../middleware/moduleEntitlement.middleware.js';
import parkingService, { ParkingError } from '../services/parking.service.js';
import llmProvider from '../services/ai-brain/llm-provider.js';

const router = express.Router();

// Same rule as the rest of the Security portal (requireSecurityStaff in
// unified-hospital-staff.routes.js): security staff and the hospital's own admin/owner
// account. Security-portal logins carry userType 'hospital', so requireRole alone would
// also admit nurses, doctors and every other hospital role — check the role explicitly.
const SECURITY_ROLES = ['security_staff', 'hospital', 'hospital_admin'];
const requireSecurityStaff = (req, res, next) => {
  const u = req.user || {};
  if (u.userType === 'hospital' && SECURITY_ROLES.includes(u.role)) return next();
  return requireRole(['admin'])(req, res, next); // platform admins
};
const staffAccess = [authUser, requireSecurityStaff, requireModule('parking')];
const adminAccess = staffAccess; // guards and the security head share one role today; the whole module follows the portal's single gate

const orgOf = (req) => req.user?.organization_id || req.user?.tenant_id || req.hospitalId || null;
const toId = (v) => (/^\d+$/.test(String(v ?? '')) && Number(v) <= 2147483647 ? Number(v) : null);

// Wraps a handler: resolves org + optional numeric :id params, maps ParkingError
// to its status, keeps everything else as a generic 500 (details go to the log).
const handle = (fn, { ids = [] } = {}) => async (req, res) => {
  try {
    const org = orgOf(req);
    if (!org) return res.status(400).json({ success: false, message: 'Organization context missing' });
    const params = {};
    for (const name of ids) {
      params[name] = toId(req.params[name]);
      if (!params[name]) return res.status(400).json({ success: false, message: `Invalid ${name}` });
    }
    const out = await fn({ req, org, params, userId: req.user?.id ?? null });
    if (out === undefined || out === null) return res.status(404).json({ success: false, message: 'Not found' });
    if (out.__status) return res.status(out.__status).json({ success: true, data: out.data });
    res.json({ success: true, data: out });
  } catch (e) {
    if (e instanceof ParkingError) {
      return res.status(e.status).json({ success: false, message: e.message, code: e.code, details: e.details || undefined });
    }
    console.error('[Parking]', req.method, req.originalUrl, e);
    res.status(500).json({ success: false, message: 'Parking request failed' });
  }
};
const created = (data) => (data ? { __status: 201, data } : data);

// ── Overview ────────────────────────────────────────────────────────────────
router.get('/overview', ...staffAccess, handle(async ({ org }) => parkingService.getOverview(org)));

// ── Lots ────────────────────────────────────────────────────────────────────
router.get('/lots', ...staffAccess, handle(({ org }) => parkingService.listLots(org)));
router.post('/lots', ...adminAccess, handle(async ({ req, org }) => created(await parkingService.createLot(org, req.body || {}))));
router.get('/lots/:lotId', ...staffAccess, handle(({ org, params }) => parkingService.getLot(org, params.lotId), { ids: ['lotId'] }));
router.put('/lots/:lotId', ...adminAccess, handle(({ req, org, params }) => parkingService.updateLot(org, params.lotId, req.body || {}), { ids: ['lotId'] }));
router.delete('/lots/:lotId', ...adminAccess, handle(async ({ org, params }) => {
  const r = await parkingService.archiveLot(org, params.lotId);
  return r ? { archived: true } : r;
}, { ids: ['lotId'] }));
router.post('/lots/:lotId/reset-occupancy', ...adminAccess, handle(({ org, params }) => parkingService.resetOccupancy(org, params.lotId), { ids: ['lotId'] }));
router.put('/lots/:lotId/security-settings', ...adminAccess, handle(({ req, org, params }) => parkingService.updateSecuritySettings(org, params.lotId, req.body || {}), { ids: ['lotId'] }));

// ── Movements ───────────────────────────────────────────────────────────────
router.get('/lots/:lotId/active-vehicles', ...staffAccess, handle(({ org, params }) => parkingService.listActiveVehicles(org, params.lotId), { ids: ['lotId'] }));
router.get('/lots/:lotId/logs', ...staffAccess, handle(({ req, org, params }) => parkingService.listRecentLogs(org, params.lotId, req.query.limit), { ids: ['lotId'] }));
router.post('/lots/:lotId/movements', ...staffAccess, handle(async ({ req, org, params, userId }) => {
  const b = req.body || {};
  const out = await parkingService.recordMovement(org, params.lotId, { ...b, userId });
  return created(out);
}, { ids: ['lotId'] }));
router.get('/lots/:lotId/security-summary', ...staffAccess, handle(({ org, params }) => parkingService.getSecuritySummary(org, params.lotId), { ids: ['lotId'] }));

// Gate pre-check: pass, watchlist and "already inside" for a plate (read-only).
router.get('/check-vehicle', ...staffAccess, handle(({ req, org }) => parkingService.checkVehicle(org, req.query.vehicleNumber, toId(req.query.lotId))));

// ── AI camera: count vehicles in a frame. Advisory only — staff confirm the
// counts before they are logged (method 'ai'). A failed read is an error, never
// a fabricated "0 vehicles".
router.post('/detect', ...staffAccess, handle(async ({ req }) => {
  const image = String(req.body?.imageBase64 ?? '');
  const m = image.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!m) throw new ParkingError('imageBase64 must be a JPEG, PNG or WebP data URL');
  if (m[2].length > 8 * 1024 * 1024) throw new ParkingError('Image is too large (max ~6 MB)', { status: 413 });
  let content;
  try {
    ({ content } = await llmProvider.vision({
      base64Image: m[2],
      mimeType: m[1],
      maxTokens: 300,
      prompt: `You count vehicles in a parking lot camera frame. Count every distinct vehicle, including partly visible ones.
- two_wheeler: motorcycles, scooters, mopeds, bicycles
- car: cars, SUVs, vans, trucks, buses (4+ wheels)
If the image is unclear, set confidence "low". Respond ONLY with JSON:
{"twoWheelers": <number>, "cars": <number>, "confidence": "high"|"medium"|"low", "description": "<one sentence>"}`,
    }));
  } catch (e) {
    console.error('[Parking] vision failed:', e.message);
    throw new ParkingError('The camera analysis service is unavailable. Count manually.', { status: 502, code: 'VISION_UNAVAILABLE' });
  }
  let parsed;
  try {
    parsed = JSON.parse(String(content || '').replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim());
  } catch {
    throw new ParkingError('Could not read the analysis result. Try another frame or count manually.', { status: 502, code: 'VISION_UNREADABLE' });
  }
  const count = (n) => Math.min(Math.max(Math.round(Number(n) || 0), 0), 500);
  return {
    twoWheelers: count(parsed.twoWheelers),
    cars: count(parsed.cars),
    confidence: ['high', 'medium', 'low'].includes(parsed.confidence) ? parsed.confidence : 'low',
    description: String(parsed.description || '').slice(0, 300),
  };
}));

// ── Passes ──────────────────────────────────────────────────────────────────
router.get('/passes', ...staffAccess, handle(({ req, org }) => parkingService.listPasses(org, {
  activeOnly: req.query.activeOnly === 'true', lotId: toId(req.query.lotId), search: req.query.search || null,
})));
router.get('/passes/stats', ...staffAccess, handle(({ req, org }) => parkingService.getPassStats(org, toId(req.query.lotId))));
router.post('/passes', ...staffAccess, handle(async ({ req, org, userId }) => created(await parkingService.issuePass(org, { ...(req.body || {}), issuedBy: userId }))));
router.post('/passes/:passId/revoke', ...staffAccess, handle(({ org, params }) => parkingService.revokePass(org, params.passId), { ids: ['passId'] }));
router.post('/passes/:passId/reactivate', ...staffAccess, handle(({ org, params }) => parkingService.reactivatePass(org, params.passId), { ids: ['passId'] }));
router.post('/passes/:passId/top-up', ...staffAccess, handle(({ req, org, params }) => parkingService.topUpTokens(org, params.passId, req.body?.amount), { ids: ['passId'] }));

// ── Watchlist ───────────────────────────────────────────────────────────────
router.get('/watchlist', ...staffAccess, handle(({ req, org }) => parkingService.listWatchlist(org, { activeOnly: req.query.activeOnly !== 'false' })));
router.post('/watchlist', ...staffAccess, handle(async ({ req, org, userId }) => created(await parkingService.addToWatchlist(org, { ...(req.body || {}), addedBy: userId }))));
router.delete('/watchlist/:id', ...staffAccess, handle(({ org, params }) => parkingService.removeFromWatchlist(org, params.id), { ids: ['id'] }));

// ── Incidents ───────────────────────────────────────────────────────────────
router.get('/incidents', ...staffAccess, handle(({ req, org }) => parkingService.listIncidents(org, { lotId: toId(req.query.lotId), status: req.query.status || null })));
router.post('/incidents', ...staffAccess, handle(async ({ req, org, userId }) => {
  const lotId = toId(req.body?.lotId);
  if (!lotId) throw new ParkingError('lotId is required');
  const row = await parkingService.reportIncident(org, { ...req.body, lotId, reportedBy: userId });
  if (!row) throw new ParkingError('Parking lot not found', { status: 404, code: 'LOT_NOT_FOUND' });
  return created(row);
}));
router.patch('/incidents/:id', ...staffAccess, handle(({ req, org, params }) => parkingService.updateIncidentStatus(org, params.id, req.body || {}), { ids: ['id'] }));

// ── Overstay ────────────────────────────────────────────────────────────────
router.get('/overstay-alerts', ...staffAccess, handle(({ req, org }) => parkingService.listOverstayAlerts(org, {
  lotId: toId(req.query.lotId), unacknowledgedOnly: req.query.unacknowledgedOnly === 'true',
})));
router.post('/overstay-alerts/scan', ...staffAccess, handle(({ org }) => parkingService.scanOverstay(org)));
router.post('/overstay-alerts/:id/acknowledge', ...staffAccess, handle(({ org, params, userId }) => parkingService.acknowledgeOverstay(org, params.id, userId), { ids: ['id'] }));

// ── Analytics ───────────────────────────────────────────────────────────────
router.get('/analytics/daily', ...staffAccess, handle(({ req, org }) => parkingService.getDailyActivity(org, { days: req.query.days, lotId: toId(req.query.lotId) })));
router.get('/analytics/hourly', ...staffAccess, handle(({ req, org }) => parkingService.getHourlyBreakdown(org, { days: req.query.days, lotId: toId(req.query.lotId) })));

// ── Valet ───────────────────────────────────────────────────────────────────
router.get('/valet/stats', ...staffAccess, handle(({ org }) => parkingService.getValetStats(org)));
router.get('/valet/tickets', ...staffAccess, handle(({ req, org }) => parkingService.listValetTickets(org, {
  status: req.query.status || null, openOnly: req.query.openOnly === 'true', search: req.query.search || null, limit: req.query.limit,
})));
router.post('/valet/tickets', ...staffAccess, handle(async ({ req, org, userId }) => created(await parkingService.createValetTicket(org, { ...(req.body || {}), receivedBy: userId }))));
router.get('/valet/tickets/:id', ...staffAccess, handle(({ org, params }) => parkingService.getValetTicket(org, params.id), { ids: ['id'] }));
router.post('/valet/tickets/:id/park', ...staffAccess, handle(({ req, org, params, userId }) => parkingService.parkValetVehicle(org, params.id, { ...(req.body || {}), userId }), { ids: ['id'] }));
router.post('/valet/tickets/:id/request-retrieval', ...staffAccess, handle(({ org, params }) => parkingService.requestValetRetrieval(org, params.id), { ids: ['id'] }));
router.post('/valet/tickets/:id/ready', ...staffAccess, handle(({ org, params, userId }) => parkingService.markValetReady(org, params.id, { userId }), { ids: ['id'] }));
router.post('/valet/tickets/:id/deliver', ...staffAccess, handle(({ req, org, params, userId }) => parkingService.deliverValetVehicle(org, params.id, { ...(req.body || {}), userId }), { ids: ['id'] }));
router.post('/valet/tickets/:id/cancel', ...staffAccess, handle(({ req, org, params }) => parkingService.cancelValetTicket(org, params.id, req.body || {}), { ids: ['id'] }));

// ── Devices (registry: configuration and status only) ───────────────────────
router.get('/devices', ...staffAccess, handle(({ req, org }) => parkingService.listDevices(org, { lotId: toId(req.query.lotId) })));
router.get('/devices/stats', ...staffAccess, handle(({ org }) => parkingService.getDeviceStats(org)));
router.post('/devices', ...adminAccess, handle(async ({ req, org }) => {
  const lotId = toId(req.body?.lotId);
  if (!lotId) throw new ParkingError('lotId is required');
  const row = await parkingService.registerDevice(org, { ...req.body, lotId });
  if (!row) throw new ParkingError('Parking lot not found', { status: 404, code: 'LOT_NOT_FOUND' });
  return created(row);
}));
router.patch('/devices/:id', ...adminAccess, handle(({ req, org, params }) => parkingService.updateDevice(org, params.id, req.body || {}), { ids: ['id'] }));
router.patch('/devices/:id/status', ...staffAccess, handle(({ req, org, params }) => parkingService.setDeviceStatus(org, params.id, req.body?.status), { ids: ['id'] }));
router.delete('/devices/:id', ...adminAccess, handle(async ({ org, params }) => {
  const r = await parkingService.deleteDevice(org, params.id);
  return r ? { deleted: true } : r;
}, { ids: ['id'] }));

export default router;
