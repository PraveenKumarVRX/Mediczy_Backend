/**
 * Fitness certificate / MER issuance for a clinic's own doctor, as opposed
 * to Mediqzy's own Team clinical staff running an on-site camp (see
 * team-occupational-health.route.js). Same underlying fitness_certificates
 * table and PDF renderer; scoped strictly to the doctor's own clinic tenant
 * (never taken from the request body — always from the authenticated
 * doctor's own record, so a clinic doctor can never issue a certificate
 * against another clinic's employees).
 *
 * Two doctor login shapes both reach here, since real doctors turned out to
 * be onboarded through the standalone doctor platform (doctors table,
 * /api/doctors/login) rather than the separate clinic_staff (users table)
 * system that was the original assumption:
 *  1. clinic_staff token (clinic-staff-auth.controller.js, type:
 *     'clinic_staff') — tenant_id is right there in the token.
 *  2. standalone doctor token (doctor.enhanced.route.js /login, role:
 *     'doctor', no `type` field) whose doctors-table row has been linked to
 *     a clinic tenant (organization_type = 'clinic', tenant_id set) — this
 *     is how Dr. Nandita Agarwal (SmartHealth Clinic) is set up.
 */
import express from 'express';
import fs from 'fs';
import jwt from 'jsonwebtoken';
import { JWT_CONFIG } from '../config/auth.config.js';
import sharedPool from '../db/pgPool.js';
import { issueFitnessCertificate, getFitnessCertificatesByPatient, getFitnessCertificateById } from '../services/corporate-hmis.service.js';
import { generateFitnessCertificatePdf, fitnessCertificatePdfPath } from '../services/fitness-certificate-pdf.service.js';

const router = express.Router();
const JWT_SECRET = JWT_CONFIG.SECRET;

async function authClinicDoctor(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ success: false, message: 'Authentication required' });
  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }

  if (decoded.type === 'clinic_staff') {
    if (decoded.role !== 'doctor') {
      return res.status(403).json({ success: false, message: 'Only a clinic doctor can issue a fitness certificate' });
    }
    req.clinicDoctor = {
      id: decoded.id, tenant_id: decoded.tenant_id,
      first_name: decoded.first_name, last_name: decoded.last_name, email: decoded.email,
    };
    return next();
  }

  if (decoded.role === 'doctor') {
    try {
      const { rows } = await sharedPool.query(
        `SELECT id, "firstName", "lastName", email, tenant_id, "organization_type", "registrationNumber"
           FROM doctors WHERE id = $1`,
        [decoded.id]
      );
      const doctor = rows[0];
      if (!doctor || doctor.organization_type !== 'clinic' || !doctor.tenant_id) {
        return res.status(403).json({ success: false, message: 'Your account is not linked to a clinic' });
      }
      req.clinicDoctor = {
        id: doctor.id, tenant_id: doctor.tenant_id,
        first_name: doctor.firstName, last_name: doctor.lastName, email: doctor.email,
        registrationNumber: doctor.registrationNumber,
      };
      return next();
    } catch (err) {
      console.error('[clinic-occupational-health] auth lookup failed:', err.message);
      return res.status(500).json({ success: false, message: 'Authentication check failed' });
    }
  }

  return res.status(403).json({ success: false, message: 'Only a clinic doctor can issue a fitness certificate' });
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
      issuedBy, doctorRegNo: doctorRegNo || doctor.registrationNumber, patientName, employeeId, employerName, jobDescription,
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
