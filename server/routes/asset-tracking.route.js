/**
 * Asset Tracking — API routes
 * =======================================================================
 * Two kinds of callers:
 *   1. Staff (JWT): tag registry, manual scan events, reader-device
 *      management. Events created through /tags/:id/events are ALWAYS stored
 *      with source='manual' — any client-supplied `source` is ignored.
 *   2. Reader devices (device key): POST /reader/events authenticates with an
 *      X-Reader-Key header (sha256-hashed at rest, see asset_reader_device) —
 *      no JWT. This is the only path that can write source='reader'. It is
 *      registered before any auth middleware and must not read req.user.
 *      NOTE: server/middleware/ringFencing.js runs globally before this mount
 *      and rejects requests without a Bearer token unless the path is listed in
 *      its PUBLIC_ENDPOINTS — '/api/asset-tracking/reader/events' must be added
 *      there for a real device to get through.
 * No physical reader hardware is deployed yet; see scripts/simulate-rfid-reader.js.
 */

import express from 'express';
import { authUser, requireRole } from '../middleware/auth.middleware.js';
import { requireModule } from '../middleware/moduleEntitlement.middleware.js';
import assetTrackingService from '../services/asset-tracking.service.js';

const router = express.Router();

const READER_MAX_SCANS = 500;
const READER_RATE_LIMIT = 60; // requests per device per window
const READER_RATE_WINDOW_MS = 60 * 1000;

const deviceManagementAccess = [authUser, requireRole(['admin', 'hospital', 'hospital_admin', 'biomedical']), requireModule('asset_tracking')];

// Simple fixed-window in-memory limiter keyed by device id (per-process).
const readerHits = new Map();
function readerRateLimited(deviceId) {
  const now = Date.now();
  const entry = readerHits.get(deviceId);
  if (!entry || now - entry.start >= READER_RATE_WINDOW_MS) {
    readerHits.set(deviceId, { start: now, count: 1 });
    return false;
  }
  entry.count += 1;
  return entry.count > READER_RATE_LIMIT;
}
setInterval(() => {
  const cutoff = Date.now() - READER_RATE_WINDOW_MS;
  for (const [id, entry] of readerHits) if (entry.start < cutoff) readerHits.delete(id);
}, READER_RATE_WINDOW_MS).unref();

const staffAccess = [authUser, requireRole(['admin', 'hospital', 'hospital_admin', 'nurse', 'quality', 'biomedical']), requireModule('asset_tracking')];

function orgId(req) {
  return req.user?.organization_id || req.user?.tenant_id || req.hospitalId || null;
}

// ── Reader ingest (device-key auth, NO JWT) ─────────────────────────────────
// Deliberately registered first and independent of req.user / authUser.
router.post('/reader/events', async (req, res) => {
  try {
    const apiKey = req.get('X-Reader-Key');
    if (!apiKey) return res.status(401).json({ success: false, message: 'X-Reader-Key header required' });
    const device = await assetTrackingService.authenticateReader(apiKey);
    if (!device) return res.status(401).json({ success: false, message: 'Invalid or inactive reader key' });

    if (readerRateLimited(device.id)) {
      res.set('Retry-After', String(Math.ceil(READER_RATE_WINDOW_MS / 1000)));
      return res.status(429).json({ success: false, message: 'Reader rate limit exceeded' });
    }

    const scans = req.body?.scans;
    if (!Array.isArray(scans)) {
      return res.status(400).json({ success: false, message: 'scans must be an array' });
    }
    if (scans.length > READER_MAX_SCANS) {
      return res.status(400).json({ success: false, message: `A maximum of ${READER_MAX_SCANS} scans per request is allowed` });
    }

    const result = await assetTrackingService.ingestReaderScans({ device, scans });
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    console.error('[asset-tracking] reader ingest failed:', error.message);
    res.status(500).json({ success: false, message: 'Failed to ingest reader scans' });
  }
});

// ── Reader device management (staff) ─────────────────────────────────────────
router.post('/readers', ...deviceManagementAccess, async (req, res) => {
  try {
    const org = orgId(req);
    if (!org) return res.status(400).json({ success: false, message: 'Organization context missing' });
    const { deviceName, location } = req.body;
    if (!deviceName) return res.status(400).json({ success: false, message: 'deviceName is required' });
    const { device, apiKey } = await assetTrackingService.registerReaderDevice({
      organizationId: org,
      deviceName,
      location,
      createdBy: req.user?.id || null,
    });
    res.status(201).json({
      success: true,
      message: 'Reader registered. Store this API key now — it is shown only once and cannot be retrieved later.',
      data: { device, apiKey },
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get('/readers', ...deviceManagementAccess, async (req, res) => {
  try {
    const org = orgId(req);
    if (!org) return res.status(400).json({ success: false, message: 'Organization context missing' });
    const devices = await assetTrackingService.listReaderDevices(org);
    res.json({ success: true, data: devices });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to list readers', error: error.message });
  }
});

router.patch('/readers/:id/deactivate', ...deviceManagementAccess, async (req, res) => {
  try {
    const org = orgId(req);
    if (!org) return res.status(400).json({ success: false, message: 'Organization context missing' });
    const device = await assetTrackingService.deactivateReaderDevice(Number(req.params.id), org);
    if (!device) return res.status(404).json({ success: false, message: 'Reader not found' });
    res.json({ success: true, data: device });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post('/tags', ...staffAccess, async (req, res) => {
  try {
    const org = orgId(req);
    if (!org) return res.status(400).json({ success: false, message: 'Organization context missing' });
    const { tagUid, assetType, label, linkedEntityType, linkedEntityId } = req.body;
    if (!tagUid || !assetType) {
      return res.status(400).json({ success: false, message: 'tagUid and assetType are required' });
    }
    const tag = await assetTrackingService.registerTag({
      organizationId: org,
      tagUid,
      assetType,
      label,
      linkedEntityType,
      linkedEntityId,
      registeredBy: req.user?.id || null,
    });
    res.status(201).json({ success: true, data: tag });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get('/tags', ...staffAccess, async (req, res) => {
  try {
    const org = orgId(req);
    if (!org) return res.status(400).json({ success: false, message: 'Organization context missing' });
    const { assetType, status } = req.query;
    const tags = await assetTrackingService.listTags(org, { assetType: assetType || null, status: status || null });
    res.json({ success: true, data: tags });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to list tags', error: error.message });
  }
});

// Lookup by UID with recent events — the endpoint a manual scan workflow
// (or a future reader) calls first to identify a tag.
router.get('/tags/uid/:tagUid', ...staffAccess, async (req, res) => {
  try {
    const org = orgId(req);
    if (!org) return res.status(400).json({ success: false, message: 'Organization context missing' });
    const tag = await assetTrackingService.getTagByUid(org, req.params.tagUid);
    if (!tag) return res.status(404).json({ success: false, message: 'Tag not found' });
    res.json({ success: true, data: tag });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to look up tag', error: error.message });
  }
});

router.post('/tags/:id/events', ...staffAccess, async (req, res) => {
  try {
    const { eventType, location, notes } = req.body;
    if (!eventType) return res.status(400).json({ success: false, message: 'eventType is required' });
    const event = await assetTrackingService.recordEvent({
      tagId: Number(req.params.id),
      eventType,
      location,
      notes,
      recordedBy: req.user?.id || null,
    });
    res.status(201).json({ success: true, data: event });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.patch('/tags/:id/status', ...staffAccess, async (req, res) => {
  try {
    const { status } = req.body;
    if (!status) return res.status(400).json({ success: false, message: 'status is required' });
    const tag = await assetTrackingService.updateTagStatus(Number(req.params.id), status);
    if (!tag) return res.status(404).json({ success: false, message: 'Tag not found' });
    res.json({ success: true, data: tag });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get('/tags/:id/location', ...staffAccess, async (req, res) => {
  try {
    const location = await assetTrackingService.getLastKnownLocation(Number(req.params.id));
    res.json({ success: true, data: location });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to get last known location', error: error.message });
  }
});

router.get('/stats', ...staffAccess, async (req, res) => {
  try {
    const org = orgId(req);
    if (!org) return res.status(400).json({ success: false, message: 'Organization context missing' });
    const stats = await assetTrackingService.getStats(org);
    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to get stats', error: error.message });
  }
});

export default router;
