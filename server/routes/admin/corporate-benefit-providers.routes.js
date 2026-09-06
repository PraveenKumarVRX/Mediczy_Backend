/**
 * Admin/team management of the corporate benefit wallet cashless network
 * provider directory (dental, vision, OPD, vaccination, etc). Corporate
 * HR/employee read access lives in corporate.route.js
 * (GET /corporate/benefit-wallet/network-providers and
 * GET /corporate/my-benefit-wallet/network-providers) — this file is only
 * the write side.
 *
 *   GET    /api/admin/corporate-benefit-providers        — list every provider (global + corporate-specific)
 *   POST   /api/admin/corporate-benefit-providers         — add a provider
 *   PUT    /api/admin/corporate-benefit-providers/:id     — edit a provider
 *   DELETE /api/admin/corporate-benefit-providers/:id     — deactivate a provider (soft delete)
 */
import express from 'express';
import { authUser, requireRole } from '../../middleware/auth.middleware.js';
import {
  listAllNetworkProvidersForAdmin, createNetworkProvider, updateNetworkProvider, deleteNetworkProvider,
} from '../../services/corporate-benefit-wallet.service.js';

const router = express.Router();
const canManage = requireRole(['admin', 'team']);

router.get('/', authUser, canManage, async (req, res) => {
  try {
    const providers = await listAllNetworkProvidersForAdmin();
    return res.json({ success: true, data: { providers } });
  } catch (error) {
    console.error('[admin] GET /corporate-benefit-providers error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to load providers' });
  }
});

router.post('/', authUser, canManage, async (req, res) => {
  try {
    const provider = await createNetworkProvider(req.body || {}, req.user?.id || null);
    return res.status(201).json({ success: true, data: { provider } });
  } catch (error) {
    console.error('[admin] POST /corporate-benefit-providers error:', error.message);
    const status = /required|invalid/i.test(error.message) ? 400 : 500;
    return res.status(status).json({ success: false, message: error.message || 'Failed to create provider' });
  }
});

router.put('/:id', authUser, canManage, async (req, res) => {
  try {
    const provider = await updateNetworkProvider(parseInt(req.params.id, 10), req.body || {});
    return res.json({ success: true, data: { provider } });
  } catch (error) {
    console.error('[admin] PUT /corporate-benefit-providers/:id error:', error.message);
    const status = /not found/i.test(error.message) ? 404 : /required|invalid/i.test(error.message) ? 400 : 500;
    return res.status(status).json({ success: false, message: error.message || 'Failed to update provider' });
  }
});

router.delete('/:id', authUser, canManage, async (req, res) => {
  try {
    const result = await deleteNetworkProvider(parseInt(req.params.id, 10));
    return res.json({ success: true, data: result });
  } catch (error) {
    console.error('[admin] DELETE /corporate-benefit-providers/:id error:', error.message);
    const status = /not found/i.test(error.message) ? 404 : 500;
    return res.status(status).json({ success: false, message: error.message || 'Failed to remove provider' });
  }
});

export default router;
