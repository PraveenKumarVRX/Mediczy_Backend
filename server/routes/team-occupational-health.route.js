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
import sharedPool from '../db/pgPool.js';
import { issueFitnessCertificate, getFitnessCertificatesByPatient } from '../services/corporate-hmis.service.js';
import { generateFitnessCertificatePdf, fitnessCertificatePdfPath } from '../services/fitness-certificate-pdf.service.js';
import { ohcService } from '../services/care-units/index.js';

const router = express.Router();

// Team camps operate under the parent "My SmartHealth" account (tenant 7) — used as the
// letterhead branding for camp-issued certificates, since Team staff aren't tied to one clinic.
const MYSMARTHEALTH_TENANT_ID = 7;
let letterheadCache = null;
async function getMySmartHealthLetterhead() {
  if (letterheadCache) return letterheadCache;
  try {
    const { rows } = await sharedPool.query(`SELECT name, address, phone FROM tenants WHERE id = $1`, [MYSMARTHEALTH_TENANT_ID]);
    const t = rows[0];
    const addr = t?.address || {};
    letterheadCache = {
      clinicName: t?.name || 'Mediqzy',
      clinicAddress: [addr.street, addr.city, addr.state, addr.pincode].filter(Boolean).join(', '),
      clinicPhone: t?.phone || '',
    };
  } catch {
    letterheadCache = { clinicName: 'Mediqzy', clinicAddress: '', clinicPhone: '' };
  }
  return letterheadCache;
}

router.post('/fitness-certificate', authTeam, requirePermission('Doctor Management'), async (req, res) => {
  try {
    const teamUser = req.teamUser;
    const {
      organizationId, patientId, patientName, employeeId, employerName, jobDescription,
      examinationDate, examinationPlace, issuedDate, fitnessStatus, restrictions, remarks, doctorName, doctorRegNo,
      doctorQualifications, doctorSpecialty,
    } = req.body;

    if (!organizationId || !patientId || !fitnessStatus) {
      return res.status(400).json({ success: false, message: 'organizationId, patientId and fitnessStatus are required' });
    }

    // The corporate's real, mapped CMO/ohc_doctor (if their OHC contract is active) is who gets
    // credited — never the team member operating this tool, who may not be a clinician at all.
    // Without that mapping, the caller must name the doctor explicitly; silently falling back to
    // teamUser's own identity is exactly the bug this replaced (a non-clinical staff name ending up
    // as the signing doctor on a medical certificate).
    const cmo = await ohcService.resolveCmoForCorporate(Number(organizationId));
    if (!cmo && !doctorName) {
      return res.status(422).json({ success: false, code: 'doctor_required', message: "This corporate has no mapped CMO on file. Enter the examining doctor's name to continue." });
    }
    const issuedBy = cmo?.doctorName || doctorName;

    const cert = await issueFitnessCertificate({
      organizationId, patientId, certificateType: 'camp_general_fitness',
      issuedBy, doctorRegNo: cmo?.doctorRegNo || doctorRegNo, patientName, employeeId, employerName, jobDescription,
      examinationDate, issuedDate, fitnessStatus, restrictions, remarks,
      certificateData: { issuedByTeamUserId: teamUser.id, source: 'health_camp', examinationPlace: examinationPlace || undefined },
    });

    const letterhead = cmo || { ...(await getMySmartHealthLetterhead()), tenantId: MYSMARTHEALTH_TENANT_ID };
    await generateFitnessCertificatePdf(cert, {
      ...letterhead,
      doctorQualifications: letterhead.doctorQualifications || doctorQualifications || '',
      doctorSpecialty: letterhead.doctorSpecialty || doctorSpecialty || 'Occupational Health',
    });

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

// GET /api/team/occupational-health/cmo/:organizationId — the corporate's mapped CMO/ohc_doctor, if
// their OHC contract is active, so the issuing screen can show who will actually be credited before
// the team member commits to issuing (and ask for a name explicitly when nothing is mapped).
router.get('/cmo/:organizationId', authTeam, requirePermission('Doctor Management'), async (req, res) => {
  try {
    const cmo = await ohcService.resolveCmoForCorporate(parseInt(req.params.organizationId));
    return res.json({ success: true, cmo });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
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
