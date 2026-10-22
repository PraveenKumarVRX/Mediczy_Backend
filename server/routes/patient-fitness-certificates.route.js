/**
 * A patient/employee's own view of fitness certificates / MERs issued to
 * them — from a camp (Team), a clinic doctor, or their employer's own OHC.
 * Read-only; scoped strictly to the logged-in user's own patient_id.
 */
import express from 'express';
import { patientAccountOnly } from '../middleware/patient-account.middleware.js';
import fs from 'fs';
import { downloadDecryptedReport } from '../services/minio-upload.service.js';
import { authUser } from '../middleware/auth.middleware.js';
import { getFitnessCertificatesForPatientOnly, getFitnessCertificateById } from '../services/corporate-hmis.service.js';
import { fitnessCertificatePdfFileName, resolveFitnessCertificatePdfPath } from '../services/fitness-certificate-pdf.service.js';

const router = express.Router();

router.get('/', authUser, patientAccountOnly, async (req, res) => {
  try {
    const data = await getFitnessCertificatesForPatientOnly(req.user.id);
    return res.json({ success: true, data });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/:id/pdf', authUser, patientAccountOnly, async (req, res) => {
  try {
    const cert = await getFitnessCertificateById(req.params.id);
    if (!cert || Number(cert.patient_id) !== Number(req.user.id)) {
      return res.status(404).json({ success: false, message: 'Certificate not found' });
    }
    if(cert.certificate_data?.storage){
      const {buffer}=await downloadDecryptedReport(cert.certificate_data.storage);
      res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/pdf');
      res.setHeader('Content-Disposition',`attachment; filename="${fitnessCertificatePdfFileName(cert)}"`);
      return res.send(buffer);
    }
    const filePath = resolveFitnessCertificatePdfPath(cert);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, message: 'Certificate PDF not available' });
    }
    return res.download(filePath, fitnessCertificatePdfFileName(cert));
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
