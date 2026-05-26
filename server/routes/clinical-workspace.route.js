import express from 'express';
import { authUser } from '../middleware/auth.middleware.js';
import { getPatientWorkspace } from '../services/clinical-workspace.service.js';

const router = express.Router();

// GET /api/v1/clinical-workspace/patient/:patientId
router.get('/patient/:patientId', authUser, async (req, res) => {
  try {
    const organizationId = req.user.organization_id || req.user.tenant_id || req.user.id;
    const workspace = await getPatientWorkspace(parseInt(req.params.patientId), organizationId);
    res.json({ success: true, data: workspace });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
