/**
 * A patient/employee's own view of fitness certificates / MERs issued to
 * them — from a camp (Team), a clinic doctor, or their employer's own OHC.
 * Read-only; scoped strictly to the logged-in user's own patient_id.
 */
import express from 'express';
import fs from 'fs';
import { authUser } from '../middleware/auth.middleware.js';
import { getFitnessCertificatesForPatientOnly, getFitnessCertificateById } from '../services/corporate-hmis.service.js';
import { fitnessCertificatePdfPath } from '../services/fitness-certificate-pdf.service.js';

const router = express.Router();

router.get('/', authUser, async (req, res) => {
  try {
    const data = await getFitnessCertificatesForPatientOnly(req.user.id);
    return res.json({ success: true, data });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/:id/pdf', authUser, async (req, res) => {
  try {
    const cert = await getFitnessCertificateById(req.params.id);
    if (!cert || Number(cert.patient_id) !== Number(req.user.id)) {
      return res.status(404).json({ success: false, message: 'Certificate not found' });
    }
    const filePath = fitnessCertificatePdfPath(req.params.id);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, message: 'Certificate PDF not available' });
    }
    return res.download(filePath, `fitness-certificate-${req.params.id}.pdf`);
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
