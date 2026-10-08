import express from 'express';
import { verifyHospitalToken } from '../middleware/hospitalAuth.middleware.js';
import { chatwootBridge } from '../services/chatwoot-bridge.service.js';

const router = express.Router();
router.use(verifyHospitalToken);

for (const [path, checkHealth] of [['/', false], ['/health', true]]) {
  router.get(path, async (req, res) => {
    try {
      const data = await chatwootBridge[checkHealth ? 'checkHealth' : 'status'](req.tenantId);
      res.json({ success: true, data });
    } catch {
      res.status(503).json({ success: false, message: 'Agent workspace is unavailable' });
    }
  });
}

export default router;
