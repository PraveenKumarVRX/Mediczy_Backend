/** Review eMAR consumption reconciliation. This endpoint does not issue stock or post a charge. */
import express from 'express';
import { authUser, requireRole } from '../middleware/auth.middleware.js';
import { listPendingDispense, markDispensed } from '../services/emar-pharmacy-bridge.service.js';
import { resolveTenantId } from '../utils/tenant-identity.js';
import { sendRouteError } from '../utils/route-errors.js';
const router = express.Router();
const org = req => resolveTenantId({ ...req.user, tenant_id: req.user?.tenant_id || req.user?.tenantId });
router.get('/pending', authUser, requireRole(['pharmacy', 'pharmacist', 'hospital', 'hospital_admin']), async (req, res) => {
    try {
        if (!org(req))
            return res.status(403).json({ success: false, code: 'TENANT_CONTEXT_REQUIRED', message: 'A hospital-linked pharmacy account is required' });
        const data = await listPendingDispense(org(req), { wardId: req.query.wardId ? Number(req.query.wardId) : undefined });
        return res.json({ success: true, data });
    }
    catch (error) {
        return sendRouteError(res, error);
    }
});
router.post('/:id/dispense', authUser, requireRole(['pharmacy', 'pharmacist']), async (req, res) => {
    try {
        if (!org(req))
            return res.status(403).json({ success: false, code: 'TENANT_CONTEXT_REQUIRED', message: 'A hospital-linked pharmacy account is required' });
        const data = await markDispensed(Number(req.params.id), org(req), req.user.id);
        return res.json({ success: true, data });
    }
    catch (error) {
        return sendRouteError(res, error);
    }
});
export default router;
