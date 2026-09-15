/**
 * Team-side fitness certificate / MER issuance — for camp/on-site health
 * checkups run by Mediqzy's own clinical staff on behalf of a corporate
 * client (e.g. an outdoor health camp), as opposed to the corporate's own
 * OHC/CMO staff issuing one from their own login (see corporate-hmis.route.js).
 * Shares the same fitness_certificates table and PDF renderer.
 */
import express from 'express';
import fs from 'fs';
import { authTeam, requirePermission } from '../middleware/team.middleware.js';
import { issueFitnessCertificate, getFitnessCertificatesByPatient } from '../services/corporate-hmis.service.js';
import { generateFitnessCertificatePdf, fitnessCertificatePdfPath } from '../services/fitness-certificate-pdf.service.js';

const router = express.Router();

router.post('/fitness-certificate', authTeam, requirePermission('Doctor Management'), async (req, res) => {
  try {
    const teamUser = req.teamUser;
    const {
      organizationId, patientId, patientName, employeeId, employerName, jobDescription,
      examinationDate, fitnessStatus, restrictions, validFrom, validUntil, remarks, doctorRegNo,
    } = req.body;

    if (!organizationId || !patientId || !fitnessStatus) {
      return res.status(400).json({ success: false, message: 'organizationId, patientId and fitnessStatus are required' });
    }

    const issuedBy = `${teamUser.firstName || ''} ${teamUser.lastName || ''}`.trim() || teamUser.email;

    const cert = await issueFitnessCertificate({
      organizationId, patientId, certificateType: 'camp_general_fitness',
      issuedBy, doctorRegNo, patientName, employeeId, employerName, jobDescription,
      examinationDate, fitnessStatus, restrictions, validFrom, validUntil, remarks,
      certificateData: { issuedByTeamUserId: teamUser.id, source: 'health_camp' },
    });

    await generateFitnessCertificatePdf(cert);

    return res.status(201).json({
      success: true,
      certificate: cert,
      pdfUrl: `/api/team/occupational-health/fitness-certificate/${cert.id}/pdf`,
    });
  } catch (err) {
    console.error('[team-occupational-health] issue error:', err);
    return res.status(400).json({ success: false, message: err.message });
  }
});

router.get('/fitness-certificate/patient/:patientId', authTeam, requirePermission('Doctor Management'), async (req, res) => {
  try {
    const { organizationId } = req.query;
    if (!organizationId) {
      return res.status(400).json({ success: false, message: 'organizationId is required' });
    }
    const data = await getFitnessCertificatesByPatient(parseInt(req.params.patientId), parseInt(organizationId));
    return res.json({ success: true, data });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/fitness-certificate/:id/pdf', authTeam, requirePermission('Doctor Management'), async (req, res) => {
  try {
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
