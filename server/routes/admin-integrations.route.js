/**
 * Integration status for admins (docs/architecture/API_CONTRACT_AND_INTEGRATIONS.md).
 *
 *   GET /api/admin/integrations       every third-party API: managed?, enabled,
 *                                     configured (missing env NAMES), circuit,
 *                                     call/latency metrics, data class
 *   GET /api/admin/integrations/:id   one of them
 *
 * Read-only by design. Switching a vendor off is the env kill switch
 * (INTEGRATION_<ID>_ENABLED=false + reload): durable, the same on every
 * process, and recorded in SSM — an in-memory toggle here would be none of
 * those. Values of secrets are never read out, only whether a name is set.
 */
import express from 'express';
import { authUser, requireRole } from '../middleware/auth.middleware.js';
import '../integrations/catalog.js';
import { get, statusAll } from '../integrations/core/registry.js';

const router = express.Router();

router.get('/', authUser, requireRole('admin'), (req, res) => {
  res.json({ success: true, generatedAt: new Date().toISOString(), ...statusAll() });
});

router.get('/:id', authUser, requireRole('admin'), (req, res) => {
  try {
    return res.json({ success: true, integration: get(String(req.params.id)).status() });
  } catch {
    return res.status(404).json({ success: false, message: 'Unknown integration.' });
  }
});

export default router;
