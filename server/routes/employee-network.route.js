import { Report, User } from '../models/index.js';
import FamilyMember from '../models/postgres/family-member.model.postgres.js';
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
import { setRlsContext } from '../middleware/rls-context.middleware.js';

// insurance_claims.claim_type is CHECK-constrained to cashless/reimbursement/
// emergency -- the human-readable claim type (opd/dental/etc, from
// ClaimsExpress's CLAIM_TYPES) goes in metadata.category instead, same
// pattern used for corporate-side wellness claims. Hospitalization and
// maternity are genuine insurance-rider categories; everything else here
// (opd/pharmacy/dental/vision) is an employer-funded wellness reimbursement,
// never billed through a TPA.
const INSURANCE_CLAIM_TYPES = new Set(['hospitalization', 'maternity']);

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

const parseJsonObject = (value) => {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value !== 'string') return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

const asStringList = (value) => Array.isArray(value)
  ? value.map((item) => String(item || '').trim()).filter(Boolean)
  : [];

const normalizePercent = (value, fallback = 20) => {
  const percent = Number(value);
  if (!Number.isFinite(percent)) return fallback;
  return Math.min(100, Math.max(0, percent));
};

/**
 * Helper: resolve the corporate that the logged-in user belongs to (as employee).
 * Returns { corporateId, companyName } or null if not a corporate employee.
 */
async function getUserCorporate(userId) {
  const [row] = await postgresSequelize.query(
    `SELECT ua."entityId" AS "corporateId", c."companyName"
       FROM user_associations ua
       JOIN corporates c ON c.id = ua."entityId" AND LOWER(c.status) = 'active'
      WHERE ua."userId"    = :userId
        AND ua."entityType" = 'corporate'
        AND ua.role         = 'employee'
        AND ua.status       = 'active'
      ORDER BY ua."createdAt" DESC
      LIMIT 1`,
    { replacements: { userId }, type: postgresSequelize.QueryTypes.SELECT }
  );
  if (row) return row;
  const [assigned] = await postgresSequelize.query(
    `SELECT c.id AS "corporateId", c."companyName" FROM user_plans up
      JOIN corporates c ON c.id::text = COALESCE(up.metadata->>'corporateId', up.metadata->>'corporate_id') AND LOWER(c.status) = 'active'
      WHERE up."userId" = :userId AND up.status = 'active' AND (up."endDate" IS NULL OR up."endDate" >= NOW())
      ORDER BY up."createdAt" DESC LIMIT 1`,
    { replacements: { userId }, type: postgresSequelize.QueryTypes.SELECT }
  );
  return assigned || null;
}

// A corporate association isn't the only path to real insurance - an
// individually-purchased plan (e.g. Silver+, Silver Pro, Silver Elite) can
// carry genuine claimable cover too. Plan tiers disagree on the flag's name
// (`features.insuranceAccess.enabled` vs `features.healthInsurance`), so
// check both rather than picking one and silently excluding the other's
// subscribers.
async function hasClaimableInsurance(userId) {
  const [row] = await postgresSequelize.query(
    `SELECT 1 FROM user_plans up
       JOIN membership_plans mp ON mp.id = up."membershipPlanId"
      WHERE up."userId" = :userId AND up.status = 'active'
        AND (up."endDate" IS NULL OR up."endDate" >= NOW())
        AND (
          COALESCE((mp.features->'insuranceAccess'->>'enabled')::boolean, false)
          OR COALESCE((mp.features->>'healthInsurance')::boolean, false)
        )
      LIMIT 1`,
    { replacements: { userId }, type: postgresSequelize.QueryTypes.SELECT }
  );
  return !!row;
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

    const [rows, healthPackageRows] = await Promise.all([
      postgresSequelize.query(
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
              mp.metadata AS plan_metadata,
              sp.name AS sub_plan_name,
              sp.metadata AS sub_plan_metadata,
              sp.features AS sub_plan_features
         FROM user_plans up
         LEFT JOIN membership_plans mp ON mp.id = up."membershipPlanId"
         LEFT JOIN subscription_plans sp ON sp.id = (up.metadata->>'subscriptionPlanId')::int
        WHERE up."userId" = :userId
          AND up.status = 'active'
        ORDER BY COALESCE(up."startDate", up."createdAt") DESC`,
        { replacements: { userId: req.user.id }, type: postgresSequelize.QueryTypes.SELECT }
      ),
      postgresSequelize.query(
        `SELECT "packageId",
                "packageName",
                "packageDetails",
                "validFrom",
                "validTo",
                status,
                "usedAt"
           FROM user_health_packages
          WHERE "userId" = :userId
            AND corporate_id = :corporateId
            AND LOWER(COALESCE(status, 'active')) = 'active'
            AND ("validTo" IS NULL OR "validTo" >= CURRENT_DATE)
          ORDER BY COALESCE("validTo", NOW()) DESC, "packageName" ASC`,
        { replacements: { userId: req.user.id, corporateId: corp.corporateId }, type: postgresSequelize.QueryTypes.SELECT }
      ),
    ]);

    const plans = rows.map((row, idx) => {
      const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
      const planMetadata = row.plan_metadata && typeof row.plan_metadata === 'object' ? row.plan_metadata : {};
      // subscription_plans (real corporate benefit plan config, same source
      // as /corporate/my-benefits) is the most authoritative when linked --
      // falls back to membership_plans/user_plans metadata only if absent.
      const subMeta = row.sub_plan_metadata && typeof row.sub_plan_metadata === 'object' ? row.sub_plan_metadata : {};
      const sourceName = row.sub_plan_name || row.plan_name || row.plan_code || `Corporate Plan ${idx + 1}`;
      const planType = inferPlanType(`${row.plan_type || ''} ${sourceName}`);
      const sumInsured = Number(subMeta.coverage?.sumInsured ?? metadata.sumInsured ?? planMetadata.sumInsured ?? 0);
      const utilized = Number(metadata.utilizedAmount || metadata.utilized || 0);
      const remaining = Math.max(0, sumInsured - utilized);
      const familyCovered = Number(metadata.familyCovered || metadata.maxFamilyMembers || 1);
      const featureList = Array.isArray(subMeta.benefits)
        ? subMeta.benefits.filter((b) => b.isIncluded).map((b) => b.description || b.name)
        : Array.isArray(row.plan_benefits)
          ? row.plan_benefits
          : Array.isArray(row.plan_features)
            ? row.plan_features
            : [];

      return {
        id: String(row.plan_id || row.id),
        name: sourceName,
        type: planType,
        // No real insurer backs an employer-funded corporate plan -- do not
        // fabricate one (was previously falling back to the employer's own
        // name, or a generic "Corporate Insurance" placeholder).
        insurer: subMeta.insurer || planMetadata.insurer || null,
        isEmployerFunded: !subMeta.insurer && !planMetadata.insurer,
        policyNumber: subMeta.policyNumber || planMetadata.policyNumber || null,
        sumInsured,
        utilized,
        remaining,
        familyCovered,
        validFrom: subMeta.validFrom || toISODate(row.start_date) || toISODate(new Date()),
        validTo: subMeta.validTo || toISODate(row.end_date) || toISODate(new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)),
        features: featureList.map((item) => String(item)).slice(0, 8),
        sublimits: []
      };
    });

    const healthCheckupPlans = healthPackageRows.map((row, idx) => {
      const details = parseJsonObject(row.packageDetails);
      const tests = asStringList(details.tests || details.features);
      const price = Number(details.price ?? details.cost ?? 0) || 0;
      const familyDiscountPercent = normalizePercent(details.familyDiscountPercent ?? details.familyDiscount);
      const familyPrice = price > 0
        ? Math.max(0, Math.round(price * (100 - familyDiscountPercent) / 100))
        : null;
      const used = Boolean(row.usedAt);
      return {
        id: `health-package-${row.packageId || idx}`,
        source: 'user_health_packages',
        packageId: row.packageId || null,
        name: row.packageName || details.name || `Health Checkup Package ${idx + 1}`,
        type: 'wellness',
        benefitCategory: 'health_checkup',
        insurer: null,
        isEmployerFunded: true,
        policyNumber: null,
        sumInsured: price,
        utilized: used ? price : 0,
        remaining: used ? 0 : price,
        familyCovered: 1,
        validFrom: toISODate(row.validFrom) || toISODate(new Date()),
        validTo: toISODate(row.validTo) || toISODate(new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)),
        features: tests.length ? tests.slice(0, 12) : [details.description || 'Assigned corporate health checkup'].filter(Boolean),
        sublimits: [],
        status: row.status || 'active',
        bookingEligible: !used,
        familyEligible: true,
        familyDiscountPercent,
        familyPrice,
        usedAt: toISODate(row.usedAt),
      };
    });

    return res.json({
      success: true,
      isCorporateEmployee: true,
      corporateId: corp.corporateId,
      corporateName: corp.companyName,
      plans: [...healthCheckupPlans, ...plans],
      healthCheckups: healthCheckupPlans
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

    const organizationId = Number(req.user.organization_id || req.user.organizationId || corp.corporateId);
    const tx = await postgresSequelize.transaction();
    let rows;
    try {
      await setRlsContext(tx, { orgId: organizationId, userId: req.user.id });
      [rows] = await postgresSequelize.query(
        `SELECT id,
                claim_number,
                claim_type,
                benefit_category,
                metadata,
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
        { replacements: { userId: req.user.id }, transaction: tx }
      );
      await tx.commit();
    } catch (err) {
      await tx.rollback().catch(() => {});
      throw err;
    }

    const claims = rows.map((row) => ({
      id: String(row.id),
      claimNumber: row.claim_number || `CLM-${row.id}`,
      type: row.metadata?.category || row.claim_type || 'Insurance',
      benefitCategory: row.benefit_category || 'insurance',
      amount: Number(row.claim_amount || 0),
      approvedAmount: row.approved_amount != null ? Number(row.approved_amount) : undefined,
      status: normalizeClaimStatus(row.status),
      hospital: row.insurance_provider || undefined,
      date: toISODate(row.submitted_date || row.created_at) || toISODate(new Date()),
      member: row.metadata?.memberName || 'Self',
      documents: Array.isArray(row.documents) ? row.documents : [],
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

/**
 * POST /api/employee/claims
 * Creates a new employee insurance claim from ClaimsExpress flow.
 */
router.get('/claims/eligibility', authUser, async (req, res) => {
  try {
    const corp = await getUserCorporate(req.user.id);
    const [plan] = await postgresSequelize.query(`SELECT id FROM user_plans WHERE "userId" = :userId AND status = 'active' AND ("endDate" IS NULL OR "endDate" >= NOW()) LIMIT 1`, { replacements: { userId: req.user.id }, type: postgresSequelize.QueryTypes.SELECT });
    const hasInsurance = await hasClaimableInsurance(req.user.id);
    const eligible = (!!corp && !!plan) || hasInsurance;
    res.json({ success: true, eligible, reason: eligible ? null : 'Your current plan does not include insurance claims. Upgrade to a plan with insurance cover, or contact support if this looks wrong.' });
  } catch (error) { res.status(503).json({ success: false, eligible: false, reason: 'Could not verify eligibility. Please try again.' }); }
});

router.post('/claims', authUser, async (req, res) => {
  try {
    const corp = await getUserCorporate(req.user.id);
    const hasInsurance = !corp && await hasClaimableInsurance(req.user.id);
    if (!corp && !hasInsurance) {
      return res.status(403).json({
        success: false,
        message: 'Your current plan does not include insurance claims'
      });
    }

    const {
      type,
      amount,
      hospital,
      date,
      claimType,
      diagnosis,
      notes,
      documents, memberId = 'self'
    } = req.body || {};

    if (!['Cashless', 'Reimbursement'].includes(claimType) || !String(hospital || '').trim() || !toISODate(date)) return res.status(400).json({ success: false, message: 'Provider, treatment date and claim type are required.' });
    const [activePlan] = await postgresSequelize.query(`SELECT id FROM user_plans WHERE "userId" = :userId AND status = 'active' AND ("endDate" IS NULL OR "endDate" >= NOW()) LIMIT 1`, { replacements: { userId: req.user.id }, type: postgresSequelize.QueryTypes.SELECT });
    if (!activePlan) return res.status(403).json({ success: false, message: 'An active benefit plan with insurance cover is required.' });
    const member = memberId === 'self' ? await User.findByPk(req.user.id) : await FamilyMember.findOne({ where: { id: Number(memberId) || 0, userId: req.user.id } });
    if (!member) return res.status(400).json({ success: false, message: 'Choose a member from your own family list.' });
    const memberName = [member.firstName, member.lastName].filter(Boolean).join(' ');
    const reportIds = Array.isArray(documents) ? documents.map(value => /^report:(\d+)$/.exec(String(value))?.[1]).filter(Boolean) : [];
    if (!reportIds.length || reportIds.length !== documents.length || reportIds.length > 20) return res.status(400).json({ success: false, message: 'Attach supporting bills or medical documents.' });
    const reports = await Report.findAll({ where: { userId: req.user.id, id: reportIds } });
    if (reports.length !== reportIds.length) return res.status(400).json({ success: false, message: 'One or more documents could not be verified for your account.' });
    const claimAmount = Number(amount);
    if (!Number.isFinite(claimAmount) || claimAmount <= 0) {
      return res.status(400).json({ success: false, message: 'Valid claim amount is required' });
    }

    const claimLabel = String(type || claimType || 'opd').slice(0, 100).toLowerCase();
    const benefitCategory = INSURANCE_CLAIM_TYPES.has(claimLabel) ? 'insurance' : 'wellness';
    const provider = String(hospital || '').trim().slice(0, 200) || 'Provider not specified';
    const submittedDate = toISODate(date) || toISODate(new Date());
    const claimNumber = `CLM-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const docs = reports.map(report => `/api/reports/download/${report.id}`);

    const organizationId = Number(
      req.user.organization_id || req.user.organizationId || corp.corporateId
    );

    const tx = await postgresSequelize.transaction();
    let insertResult;
    try {
      await setRlsContext(tx, { orgId: organizationId, userId: req.user.id });
      [insertResult] = await postgresSequelize.query(
        `INSERT INTO insurance_claims (
            claim_number,
            patient_id,
            organization_id,
            claim_type,
            benefit_category,
            status,
            claim_amount,
            insurance_provider,
            diagnosis,
            notes,
            documents,
            metadata,
            submitted_date,
            created_at,
            updated_at
         ) VALUES (
            :claimNumber,
            :patientId,
            :organizationId,
            :settlementType,
            :benefitCategory,
            'submitted',
            :claimAmount,
            :provider,
            :diagnosis,
            :notes,
            :documents,
            :metadata,
            :submittedDate,
            NOW(),
            NOW()
         )
         RETURNING id, claim_number, claim_type, benefit_category, status, claim_amount, insurance_provider, submitted_date, created_at, documents, metadata`,
        {
          replacements: {
            claimNumber,
            settlementType: claimType.toLowerCase(),
            patientId: req.user.id,
            organizationId,
            benefitCategory,
            claimAmount,
            provider,
            diagnosis: diagnosis ? String(diagnosis).slice(0, 500) : null,
            notes: notes ? String(notes).slice(0, 1000) : null,
            documents: JSON.stringify(docs),
            metadata: JSON.stringify({ category: claimLabel, memberId, memberName }),
            submittedDate,
          },
          transaction: tx,
        }
      );
      await tx.commit();
    } catch (err) {
      await tx.rollback().catch(() => {});
      throw err;
    }

    const row = Array.isArray(insertResult) ? insertResult[0] : insertResult;
    if (!row) {
      return res.status(500).json({ success: false, message: 'Claim persisted but response payload was empty' });
    }

    return res.status(201).json({
      success: true,
      message: 'Claim filed successfully',
      claim: {
        id: String(row.id),
        claimNumber: row.claim_number,
        type: row.metadata?.category || claimLabel,
        benefitCategory: row.benefit_category,
        amount: Number(row.claim_amount || 0),
        status: normalizeClaimStatus(row.status),
        hospital: row.insurance_provider || undefined,
        date: toISODate(row.submitted_date || row.created_at) || toISODate(new Date()),
        documents: Array.isArray(row.documents) ? row.documents : docs,
      }
    });
  } catch (err) {
    console.error('POST /claims error:', err);
    return res.status(500).json({ success: false, message: 'Failed to file claim', error: err.message });
  }
});

export default router;
