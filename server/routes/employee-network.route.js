/**
 * Employee Corporate Network Routes
 * Surfaces the labs/hospitals/clinics that an employee's corporate
 * has been assigned via the admin panel.
 *
 * All routes require a valid patient/user JWT.
 */

import express from 'express';
import { authUser } from '../middleware/auth.middleware.js';
import { postgresSequelize } from '../db/postgres-sequelize.js';

const router = express.Router();

/**
 * Helper: resolve the corporate that the logged-in user belongs to (as employee).
 * Returns { corporateId, companyName } or null if not a corporate employee.
 */
async function getUserCorporate(userId) {
  const [row] = await postgresSequelize.query(
    `SELECT ua."entityId" AS "corporateId", c."companyName"
       FROM user_associations ua
       JOIN corporates c ON c.id = ua."entityId"
      WHERE ua."userId"    = :userId
        AND ua."entityType" = 'corporate'
        AND ua.role         = 'employee'
        AND ua.status       = 'active'
      LIMIT 1`,
    { replacements: { userId }, type: postgresSequelize.QueryTypes.SELECT }
  );
  return row || null;
}

/**
 * GET /api/employee/my-corporate
 * Returns info about the corporate this employee belongs to.
 */
router.get('/my-corporate', authUser, async (req, res) => {
  try {
    const corp = await getUserCorporate(req.user.id);
    if (!corp) {
      return res.json({ success: true, isCorporateEmployee: false, corporate: null });
    }
    return res.json({
      success: true,
      isCorporateEmployee: true,
      corporate: { id: corp.corporateId, name: corp.companyName }
    });
  } catch (err) {
    console.error('GET /my-corporate error:', err);
    return res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
});

/**
 * GET /api/employee/my-labs
 * Returns the diagnostic labs assigned to this employee's corporate.
 */
router.get('/my-labs', authUser, async (req, res) => {
  try {
    const corp = await getUserCorporate(req.user.id);
    if (!corp) {
      return res.json({ success: true, isCorporateEmployee: false, labs: [] });
    }

    const { corporateId, companyName } = corp;

    const labs = await postgresSequelize.query(
      `SELECT l.id,
              l.name,
              l.address,
              l.services,
              l.rating,
              l.accreditation,
              l.facilities,
              l.metadata
         FROM labs l
         JOIN corporate_network_assignments cna
           ON cna.partner_id   = l.id
          AND cna.partner_type = 'lab'
          AND cna.corporate_id = :corporateId
        WHERE l.status = 'active'
        ORDER BY l.rating DESC NULLS LAST, l.name ASC`,
      { replacements: { corporateId }, type: postgresSequelize.QueryTypes.SELECT }
    );

    const formatted = labs.map(lab => ({
      id:            String(lab.id),
      name:          lab.name,
      address:       typeof lab.address === 'object' ? lab.address : (lab.address ? JSON.parse(lab.address) : {}),
      services:      lab.services   || [],
      rating:        parseFloat(lab.rating) || 0,
      accreditation: lab.accreditation || null,
      facilities:    lab.facilities  || [],
      isCorpAssigned: true,
      corporateId,
      corporateName:  companyName,
      corpDiscount:   lab.metadata?.corpDiscount || lab.metadata?.discount || 0,
    }));

    return res.json({
      success: true,
      isCorporateEmployee: true,
      corporateId,
      corporateName: companyName,
      count: formatted.length,
      labs: formatted
    });
  } catch (err) {
    console.error('GET /my-labs error:', err);
    return res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
});

/**
 * GET /api/employee/my-hospitals
 * Returns the hospitals assigned to this employee's corporate.
 */
router.get('/my-hospitals', authUser, async (req, res) => {
  try {
    const corp = await getUserCorporate(req.user.id);
    if (!corp) {
      return res.json({ success: true, isCorporateEmployee: false, hospitals: [] });
    }

    const { corporateId, companyName } = corp;

    const hospitals = await postgresSequelize.query(
      `SELECT h.id,
              h.hospital_name   AS name,
              h.city,
              h.state,
              h.address,
              h.phone,
              h.specializations,
              h.metadata,
              h.rating
         FROM hospitals h
         JOIN corporate_network_assignments cna
           ON cna.partner_id   = h.id
          AND cna.partner_type = 'hospital'
          AND cna.corporate_id = :corporateId
        ORDER BY h.hospital_name ASC`,
      { replacements: { corporateId }, type: postgresSequelize.QueryTypes.SELECT }
    );

    const formatted = hospitals.map(h => ({
      id:            String(h.id),
      name:          h.name,
      city:          h.city    || '',
      state:         h.state   || '',
      address:       h.address || '',
      phone:         h.phone   || '',
      specializations: h.specializations || [],
      rating:        parseFloat(h.rating) || 0,
      isCorpAssigned: true,
      corporateId,
      corporateName:  companyName,
      corpDiscount:   h.metadata?.corpDiscount || h.metadata?.discount || 0,
    }));

    return res.json({
      success: true,
      isCorporateEmployee: true,
      corporateId,
      corporateName: companyName,
      count: formatted.length,
      hospitals: formatted
    });
  } catch (err) {
    console.error('GET /my-hospitals error:', err);
    return res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
});

/**
 * GET /api/employee/my-clinics
 * Returns the outreach clinics assigned to this employee's corporate.
 */
router.get('/my-clinics', authUser, async (req, res) => {
  try {
    const corp = await getUserCorporate(req.user.id);
    if (!corp) {
      return res.json({ success: true, isCorporateEmployee: false, clinics: [] });
    }

    const { corporateId, companyName } = corp;

    const clinics = await postgresSequelize.query(
      `SELECT oc.id,
              oc.name,
              oc.type,
              oc.location,
              oc.metadata
         FROM outreach_clinics oc
         JOIN corporate_network_assignments cna
           ON cna.partner_id   = oc.id
          AND cna.partner_type = 'clinic'
          AND cna.corporate_id = :corporateId
        ORDER BY oc.name ASC`,
      { replacements: { corporateId }, type: postgresSequelize.QueryTypes.SELECT }
    );

    const formatted = clinics.map(c => ({
      id:   String(c.id),
      name: c.name,
      type: c.type  || '',
      location: typeof c.location === 'object' ? c.location : (c.location ? JSON.parse(c.location) : {}),
      isCorpAssigned: true,
      corporateId,
      corporateName:  companyName,
      corpDiscount:   c.metadata?.corpDiscount || c.metadata?.discount || 0,
    }));

    return res.json({
      success: true,
      isCorporateEmployee: true,
      corporateId,
      corporateName: companyName,
      count: formatted.length,
      clinics: formatted
    });
  } catch (err) {
    console.error('GET /my-clinics error:', err);
    return res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
});

export default router;
