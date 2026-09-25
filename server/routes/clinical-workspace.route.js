import express from 'express';
import { authUser } from '../middleware/auth.middleware.js';
import { getPatientWorkspace } from '../services/clinical-workspace.service.js';
import { resolveTenantId } from '../utils/tenant-identity.js';

const router = express.Router();

// GET /api/v1/clinical-workspace/patient/:patientId
router.get('/patient/:patientId', authUser, async (req, res) => {
  try {
    const organizationId = resolveTenantId(req.user);
    const workspace = await getPatientWorkspace(parseInt(req.params.patientId), organizationId);
    // Flatten summary for HMIS inpatient UI while preserving full workspace payload
    res.json({
      success: true,
      data: workspace.summary || workspace,
      workspace,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
