/**
 * Clinical medical-device gateway API.
 *
 * Administrative routes require tenant-bound hospital/admin credentials. The
 * ingestion route is intentionally not JWT-authenticated: an on-premise edge
 * appliance signs the canonical payload with its enrolled Ed25519 private key.
 */
import express from 'express';
import { authUser, requireRole } from '../middleware/auth.middleware.js';
import { requireHgTenant } from '../utils/hypergrid-tenant.js';
import {
  createAdapterRelease, createBinding, createEdgeGateway, DeviceGatewayError,
  ingestSignedEvent, listQuarantine, registerMedicalDevice, reviewEvent,
  setAdapterReleaseStatus, setEdgeGatewayStatus,
} from '../services/medical-device-gateway.service.js';

const router = express.Router();
const admin = [authUser, requireRole(['admin', 'hospital']), requireHgTenant];

function error(res, error) {
  const status = error instanceof DeviceGatewayError ? error.status : 500;
  const code = error instanceof DeviceGatewayError ? error.code : 'MEDICAL_DEVICE_GATEWAY_ERROR';
  if (status >= 500) console.error('[medical-device-gateway]', error);
  return res.status(status).json({ success: false, code, message: status >= 500 ? 'Medical device gateway request failed' : error.message });
}

router.post('/adapter-releases', ...admin, async (req, res) => {
  try {
    const adapter = await createAdapterRelease({ ...req.body, actorId: req.user.id });
    res.status(201).json({ success: true, data: adapter });
  } catch (err) { error(res, err); }
});

router.patch('/adapter-releases/:id/status', ...admin, async (req, res) => {
  try {
    const adapter = await setAdapterReleaseStatus(req.params.id, req.body?.status);
    res.json({ success: true, data: adapter });
  } catch (err) { error(res, err); }
});

router.post('/edge-gateways', ...admin, async (req, res) => {
  try {
    const gateway = await createEdgeGateway({ ...req.body, tenantId: req.hgTenantId, actorId: req.user.id });
    res.status(201).json({ success: true, data: gateway });
  } catch (err) { error(res, err); }
});

router.patch('/edge-gateways/:id/status', ...admin, async (req, res) => {
  try {
    const gateway = await setEdgeGatewayStatus({ tenantId: req.hgTenantId, gatewayId: req.params.id, status: req.body?.status });
    res.json({ success: true, data: gateway });
  } catch (err) { error(res, err); }
});

router.post('/devices', ...admin, async (req, res) => {
  try {
    const device = await registerMedicalDevice({ ...req.body, tenantId: req.hgTenantId });
    res.status(201).json({ success: true, data: device });
  } catch (err) { error(res, err); }
});

router.post('/bindings', ...admin, async (req, res) => {
  try {
    const binding = await createBinding({ ...req.body, tenantId: req.hgTenantId, actorId: req.user.id });
    res.status(201).json({ success: true, data: binding });
  } catch (err) { error(res, err); }
});

router.get('/quarantine', ...admin, async (req, res) => {
  try {
    res.json({ success: true, data: await listQuarantine(req.hgTenantId, req.query.limit) });
  } catch (err) { error(res, err); }
});

router.post('/events/:eventId/review', ...admin, async (req, res) => {
  try {
    const event = await reviewEvent({ tenantId: req.hgTenantId, eventId: req.params.eventId, decision: req.body?.decision, note: req.body?.note, actorId: req.user.id });
    res.json({ success: true, data: event });
  } catch (err) { error(res, err); }
});

router.post('/events', async (req, res) => {
  try {
    const result = await ingestSignedEvent(req.body, req.get('X-Gateway-Signature'));
    res.status(result.disposition === 'duplicate' ? 200 : 202).json({ success: true, data: result });
  } catch (err) { error(res, err); }
});

export default router;
