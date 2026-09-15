/**
 * Fitness certificate / MER issuance for clinic-staff doctors logged in
 * directly to their own clinic tenant (clinic-staff-auth.controller.js —
 * type: 'clinic_staff'), as opposed to Mediqzy's own Team clinical staff
 * running an on-site camp (see team-occupational-health.route.js). Same
 * underlying fitness_certificates table and PDF renderer; scoped strictly
 * to the doctor's own clinic tenant (no organizationId in the request body
 * — it's taken from the token, so a clinic doctor can never issue a
 * certificate against another clinic's employees).
 */
import express from 'express';
import fs from 'fs';
import jwt from 'jsonwebtoken';
import { JWT_CONFIG } from '../config/auth.config.js';
import { issueFitnessCertificate, getFitnessCertificatesByPatient, getFitnessCertificateById } from '../services/corporate-hmis.service.js';
import { generateFitnessCertificatePdf, fitnessCertificatePdfPath } from '../services/fitness-certificate-pdf.service.js';

const router = express.Router();
const JWT_SECRET = JWT_CONFIG.SECRET;

function authClinicDoctor(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ success: false, message: 'Authentication required' });
  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
  if (decoded.type !== 'clinic_staff' || decoded.role !== 'doctor') {
    return res.status(403).json({ success: false, message: 'Only a clinic doctor can issue a fitness certificate' });
  }
  req.clinicDoctor = decoded;
  next();
}

router.post('/fitness-certificate', authClinicDoctor, async (req, res) => {
  try {
    const doctor = req.clinicDoctor;
    const {
      patientId, patientName, employeeId, employerName, jobDescription,
      examinationDate, fitnessStatus, restrictions, validFrom, validUntil, remarks, doctorRegNo,
    } = req.body;

    if (!patientId || !fitnessStatus) {
      return res.status(400).json({ success: false, message: 'patientId and fitnessStatus are required' });
    }

    const issuedBy = `${doctor.first_name || ''} ${doctor.last_name || ''}`.trim() || doctor.email;

    const cert = await issueFitnessCertificate({
      organizationId: doctor.tenant_id, patientId, certificateType: 'clinic_general_fitness',
      issuedBy, doctorRegNo, patientName, employeeId, employerName, jobDescription,
      examinationDate, fitnessStatus, restrictions, validFrom, validUntil, remarks,
      certificateData: { issuedByClinicStaffId: doctor.id, source: 'clinic' },
    });

    await generateFitnessCertificatePdf(cert);

    return res.status(201).json({
      success: true,
      certificate: cert,
      pdfUrl: `/api/clinic/occupational-health/fitness-certificate/${cert.id}/pdf`,
    });
  } catch (err) {
    console.error('[clinic-occupational-health] issue error:', err);
    return res.status(400).json({ success: false, message: err.message });
  }
});

router.get('/fitness-certificate/patient/:patientId', authClinicDoctor, async (req, res) => {
  try {
    const data = await getFitnessCertificatesByPatient(parseInt(req.params.patientId), req.clinicDoctor.tenant_id);
    return res.json({ success: true, data });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/fitness-certificate/:id/pdf', authClinicDoctor, async (req, res) => {
  try {
    const cert = await getFitnessCertificateById(req.params.id);
    if (!cert || Number(cert.organization_id) !== Number(req.clinicDoctor.tenant_id)) {
      return res.status(404).json({ success: false, message: 'Certificate not found' });
    }
    const filePath = fitnessCertificatePdfPath(req.params.id);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, message: 'Certificate PDF not found — it may not have been generated yet.' });
    }
    return res.download(filePath, `fitness-certificate-${req.params.id}.pdf`);
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
