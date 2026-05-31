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

const toISODate = (value) => {
  if (!value) return null;
  try {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  } catch {
    return null;
  }
};

const normalizeClaimStatus = (status) => {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'approved') return 'approved';
  if (normalized === 'rejected') return 'rejected';
  if (normalized === 'paid' || normalized === 'settled') return 'settled';
  if (normalized === 'query' || normalized === 'info_needed') return 'info_needed';
  if (normalized === 'pending' || normalized === 'under_review') return 'under_review';
  return 'submitted';
};

const inferPlanType = (value) => {
  const haystack = String(value || '').toLowerCase();
  if (haystack.includes('gpa') || haystack.includes('accident')) return 'gpa';
  if (haystack.includes('gtl') || haystack.includes('life')) return 'gtl';
  if (haystack.includes('parent')) return 'parents';
  if (haystack.includes('personal')) return 'personal';
  if (haystack.includes('op') || haystack.includes('wellness')) return 'wellness';
  return 'gmc';
};

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

/**
 * GET /api/employee/benefits
 * Returns employee benefits plans for SmartBenefitsHub.
 */
router.get('/benefits', authUser, async (req, res) => {
  try {
    const corp = await getUserCorporate(req.user.id);
    if (!corp) {
      return res.json({
        success: true,
        isCorporateEmployee: false,
        plans: []
      });
    }

    const rows = await postgresSequelize.query(
      `SELECT up.id,
              up.status,
              up.metadata,
              up."startDate" AS start_date,
              up."endDate" AS end_date,
              mp.id AS plan_id,
              mp.name AS plan_name,
              mp.code AS plan_code,
              mp.type AS plan_type,
              mp.benefits AS plan_benefits,
              mp.features AS plan_features,
              mp.metadata AS plan_metadata
         FROM user_plans up
         LEFT JOIN membership_plans mp ON mp.id = up."membershipPlanId"
        WHERE up."userId" = :userId
          AND up.status = 'active'
        ORDER BY COALESCE(up."startDate", up."createdAt") DESC`,
      { replacements: { userId: req.user.id }, type: postgresSequelize.QueryTypes.SELECT }
    );

    const plans = rows.map((row, idx) => {
      const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
      const planMetadata = row.plan_metadata && typeof row.plan_metadata === 'object' ? row.plan_metadata : {};
      const sourceName = row.plan_name || row.plan_code || `Corporate Plan ${idx + 1}`;
      const planType = inferPlanType(`${row.plan_type || ''} ${sourceName}`);
      const sumInsured = Number(metadata.sumInsured || planMetadata.sumInsured || 500000);
      const utilized = Number(metadata.utilizedAmount || metadata.utilized || 0);
      const remaining = Math.max(0, sumInsured - utilized);
      const familyCovered = Number(metadata.familyCovered || metadata.maxFamilyMembers || 1);
      const policyNumber = metadata.policyNumber || planMetadata.policyNumber || `CORP-${row.plan_id || row.id}`;
      const featureList = Array.isArray(row.plan_benefits)
        ? row.plan_benefits
        : Array.isArray(row.plan_features)
          ? row.plan_features
          : [];

      return {
        id: String(row.plan_id || row.id),
        name: sourceName,
        type: planType,
        insurer: metadata.insurer || planMetadata.insurer || corp.companyName || 'Corporate Insurance',
        policyNumber,
        sumInsured,
        utilized,
        remaining,
        familyCovered,
        validFrom: toISODate(row.start_date) || toISODate(new Date()),
        validTo: toISODate(row.end_date) || toISODate(new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)),
        features: featureList.map((item) => String(item)).slice(0, 8),
        sublimits: []
      };
    });

    return res.json({
      success: true,
      isCorporateEmployee: true,
      corporateId: corp.corporateId,
      corporateName: corp.companyName,
      plans
    });
  } catch (err) {
    console.error('GET /benefits error:', err);
    return res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
});

/**
 * GET /api/employee/claims
 * Returns employee insurance claims for SmartBenefitsHub.
 */
router.get('/claims', authUser, async (req, res) => {
  try {
    const corp = await getUserCorporate(req.user.id);
    if (!corp) {
      return res.json({
        success: true,
        isCorporateEmployee: false,
        claims: []
      });
    }

    const rows = await postgresSequelize.query(
      `SELECT id,
              claim_number,
              claim_type,
              status,
              claim_amount,
              approved_amount,
              insurance_provider,
              submitted_date,
              created_at,
              documents
         FROM insurance_claims
        WHERE patient_id = :userId
        ORDER BY COALESCE(submitted_date, created_at) DESC
        LIMIT 50`,
      { replacements: { userId: req.user.id }, type: postgresSequelize.QueryTypes.SELECT }
    );

    const claims = rows.map((row) => ({
      id: String(row.id),
      claimNumber: row.claim_number || `CLM-${row.id}`,
      type: row.claim_type || 'Insurance',
      amount: Number(row.claim_amount || 0),
      approvedAmount: row.approved_amount != null ? Number(row.approved_amount) : undefined,
      status: normalizeClaimStatus(row.status),
      hospital: row.insurance_provider || undefined,
      date: toISODate(row.submitted_date || row.created_at) || toISODate(new Date()),
      member: 'Self',
      documents: Array.isArray(row.documents) ? row.documents.length : 0,
      timeline: []
    }));

    return res.json({
      success: true,
      isCorporateEmployee: true,
      corporateId: corp.corporateId,
      corporateName: corp.companyName,
      claims
    });
  } catch (err) {
    console.error('GET /claims error:', err);
    return res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
});

export default router;
