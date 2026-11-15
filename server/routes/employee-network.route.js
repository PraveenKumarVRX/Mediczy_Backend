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
import { packageDisplayName } from '../utils/health-package-tests.js';
import { getEmployeeBenefitWallet, listBenefitNetworkProviders } from '../services/corporate-benefit-wallet.service.js';
import * as policyWallet from '../services/corporate-policy-wallet.service.js';

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
  // A subscription metadata field is not proof of employment. All employee
  // capabilities below are gated by the active roster association above.
  return row || null;
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
 * GET /api/employee/context
 * Canonical, server-derived context for the corporate-employee user journey.
 * Clients must not infer employment or benefit eligibility from profile fields.
 */
router.get('/context', authUser, async (req, res) => {
  try {
    const corp = await getUserCorporate(req.user.id);
    if (!corp) {
      return res.json({ success: true, audience: 'individual', isCorporateEmployee: false, corporate: null, employee: null });
    }
    const [employee] = await postgresSequelize.query(
      `SELECT ce."employeeId",ce.department,ce.designation
         FROM corporate_employees ce
        WHERE ce."userId"=:userId AND ce.corporate_id=:corporateId AND ce."isActive"=true
        ORDER BY ce."updatedAt" DESC NULLS LAST LIMIT 1`,
      { replacements: { userId: req.user.id, corporateId: corp.corporateId }, type: postgresSequelize.QueryTypes.SELECT }
    );
    return res.json({
      success: true,
      audience: 'corporate_employee',
      isCorporateEmployee: true,
      corporate: { id: Number(corp.corporateId), name: corp.companyName },
      employee: employee ? { employeeId: employee.employeeId, department: employee.department || null, designation: employee.designation || null } : null,
    });
  } catch (err) {
    console.error('GET /employee/context error:', err);
    return res.status(500).json({ success: false, message: 'Unable to resolve employee context' });
  }
});

/**
 * GET /api/employee/home
 *
 * A deliberately small employee-dashboard contract.  It is not an HR
 * dashboard: every item is resolved for the authenticated employee and no
 * workforce, utilisation, or clinical data belonging to another person is
 * included.  The client may use the regular patient APIs for personal health
 * data, while employer-funded data starts here.
 */
router.get('/home', authUser, async (req, res) => {
  try {
    const corp = await getUserCorporate(req.user.id);
    if (!corp) {
      return res.status(403).json({
        success: false,
        code: 'corporate_employee_required',
        message: 'An active corporate employee association is required.',
      });
    }

    const safe = async (work, fallback) => {
      try { return await work(); } catch (error) {
        console.error('[employee/home] optional dashboard section unavailable:', error.message);
        return fallback;
      }
    };

    const [employeeRows, wallet, checkups, upcomingBooking, events, challenges, networkProviders] = await Promise.all([
      safe(() => postgresSequelize.query(
        `SELECT "employeeId", department, designation
           FROM corporate_employees
          WHERE "userId" = :userId AND corporate_id = :corporateId AND "isActive" = true
          ORDER BY "updatedAt" DESC NULLS LAST LIMIT 1`,
        { replacements: { userId: req.user.id, corporateId: corp.corporateId }, type: postgresSequelize.QueryTypes.SELECT }
      ), []),
      safe(() => getEmployeeBenefitWallet(req.user.id), { isCorporateEmployee: true, corporate: null, wallets: [] }),
      safe(() => postgresSequelize.query(
        `SELECT DISTINCT ON (u."packageId")
                u."packageId" AS id, u."packageName" AS name, u."validFrom" AS "validFrom",
                u."validTo" AS "validTo", u."usedAt" AS "usedAt", p.features, p.metadata
           FROM user_health_packages u
           JOIN corporate_health_package_catalog p
             ON p.id = u."packageId" AND p.corporate_id = :corporateId AND p.is_active = true
          WHERE u."userId" = :userId
            AND u.corporate_id = :corporateId
            AND LOWER(COALESCE(u.status, 'active')) = 'active'
            AND COALESCE(p.metadata->>'kind', '') = 'health_checkup'
            -- Employee home surfaces annual sponsored benefits only.  PEME
            -- candidates use their separate invitation/case journey and may
            -- never inherit an employee's annual-plan entitlement.
            AND LOWER(COALESCE(
              p.metadata->>'workflowClass', p.metadata->>'workflow_class',
              p.features->>'workflowClass', p.features->>'workflow_class',
              p.features->>'type', ''
            )) IN ('annual', 'annual_benefit')
            AND (u."validFrom" IS NULL OR u."validFrom"::date <= CURRENT_DATE)
            AND (u."validTo" IS NULL OR u."validTo"::date >= CURRENT_DATE)
          ORDER BY u."packageId", u."createdAt" DESC`,
        { replacements: { userId: req.user.id, corporateId: corp.corporateId }, type: postgresSequelize.QueryTypes.SELECT }
      ), []),
      safe(() => postgresSequelize.query(
        // Match on the member only — not corporate_id too. A booking's corporate_id can differ from
        // the association corporate_id resolved here (multiple associations / tenant-vs-corporate id),
        // which made a freshly-created booking "disappear after refresh" on the dashboard. It is the
        // member's own booking, so user_id + active status is the correct, stable key.
        `SELECT id, booking_reference AS "bookingReference", package_name AS "packageName",
                appointment_date AS date, time_slot AS "timeSlot", status, lab_snapshot AS "lab"
           FROM health_checkup_bookings
          WHERE user_id = :userId
            AND status IN ('confirmed', 'scheduled', 'rescheduled', 'payment_pending')
          ORDER BY appointment_date ASC, time_slot ASC LIMIT 1`,
        { replacements: { userId: req.user.id, corporateId: corp.corporateId }, type: postgresSequelize.QueryTypes.SELECT }
      ), []),
      safe(() => postgresSequelize.query(
        `SELECT e.id, e.title, e.description, e.event_date AS date, e.location,
                e.event_type AS type, r.status AS "myRsvp"
           FROM corporate_wellness_events e
           JOIN corporate_wellness_event_rsvps r ON r.event_id = e.id AND r."userId" = :userId
          WHERE e.corporate_id = :corporateId AND e.status IN ('upcoming', 'ongoing')
          ORDER BY e.event_date ASC LIMIT 3`,
        { replacements: { userId: req.user.id, corporateId: corp.corporateId }, type: postgresSequelize.QueryTypes.SELECT }
      ), []),
      safe(() => postgresSequelize.query(
        `SELECT c.id, c.title, c.description, c.type, c.target, c.unit, c."endDate", c.status,
                EXISTS(SELECT 1 FROM corporate_challenge_participants p WHERE p.challenge_id = c.id AND p."userId" = :userId) AS joined
           FROM corporate_challenges c
          WHERE c.corporate_id = :corporateId AND c.status IN ('active', 'upcoming')
          ORDER BY c."endDate" ASC LIMIT 3`,
        { replacements: { userId: req.user.id, corporateId: corp.corporateId }, type: postgresSequelize.QueryTypes.SELECT }
      ), []),
      safe(() => listBenefitNetworkProviders(corp.corporateId), []),
    ]);

    const employee = employeeRows[0] || null;
    const annualHealthCheckups = checkups.map((item) => ({
      id: String(item.id),
      name: item.name || 'Annual Health Checkup',
      displayName: item.features?.displayName || item.metadata?.displayName
        || String(item.name || 'Annual Health Checkup').replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim(),
      validFrom: item.validFrom || null,
      validTo: item.validTo || null,
      usedAt: item.usedAt || null,
      eligibleRelations: item.metadata?.eligibleRelations || ['self'],
      description: item.features?.description || item.metadata?.description || 'Sponsored by your employer.',
    }));
    // An assigned annual package is itself the employee's corporate-sponsored
    // plan.  Expose it explicitly so a zero-value OPD wallet never makes an
    // employee believe that they have no employer coverage.
    const sponsoredPlans = annualHealthCheckups.map((item) => ({
      id: item.id,
      name: item.name,
      kind: 'annual_health_checkup',
      validFrom: item.validFrom,
      validTo: item.validTo,
      usedAt: item.usedAt,
      description: item.description,
      coverage: 'One employer-sponsored annual health checkup',
    }));

    return res.json({
      success: true,
      audience: 'corporate_employee',
      context: {
        corporate: { id: Number(corp.corporateId), name: corp.companyName },
        employee: employee ? {
          employeeId: employee.employeeId,
          department: employee.department || null,
          designation: employee.designation || null,
        } : null,
      },
      benefits: {
        wallets: wallet.wallets || [],
        annualHealthCheckups,
        sponsoredPlans,
        networkProviders: networkProviders.slice(0, 12),
      },
      upcomingAppointment: upcomingBooking[0] || null,
      wellness: { events, challenges },
      privacyNotice: 'Your employer can administer benefits and view authorised aggregate programme insights. Your clinical records remain private.',
    });
  } catch (err) {
    console.error('GET /employee/home error:', err);
    return res.status(500).json({ success: false, message: 'Unable to load employee dashboard' });
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

    // An optional caller position turns this into "nearest first". Anything
    // that is not a usable coordinate is treated as no position at all, rather
    // than silently ordering by a NaN.
    const coord = (value, limit) => {
      const n = Number.parseFloat(value);
      return Number.isFinite(n) && Math.abs(n) <= limit ? n : null;
    };
    const lat = coord(req.query.lat, 90);
    const lng = coord(req.query.lng ?? req.query.lon, 180);

    const hospitals = await postgresSequelize.query(
      // hospitals stores the number as phone_number and has no rating column at
      // all, so this selected two columns that do not exist and the endpoint
      // answered 500 every time — the corporate hospital network never loaded.
      //
      // Distance is computed only when the caller sends a position. The great
      // circle distance is good enough to order a city's hospitals and needs no
      // PostGIS; rows without coordinates sort last rather than being dropped,
      // because a hospital in the network is still in the network.
      `SELECT h.id,
              h.hospital_name   AS name,
              h.city,
              h.state,
              h.address,
              h.phone_number    AS phone,
              h.specializations,
              h.metadata,
              h.latitude,
              h.longitude,
              CASE
                WHEN :lat::float8 IS NULL OR :lng::float8 IS NULL
                  OR h.latitude IS NULL OR h.longitude IS NULL THEN NULL
                ELSE 6371 * 2 * asin(sqrt(
                       power(sin(radians(h.latitude::float8 - :lat::float8) / 2), 2)
                     + cos(radians(:lat::float8)) * cos(radians(h.latitude::float8))
                     * power(sin(radians(h.longitude::float8 - :lng::float8) / 2), 2)))
              END AS distance_km
         FROM hospitals h
         JOIN corporate_network_assignments cna
           ON cna.partner_id   = h.id
          AND cna.partner_type = 'hospital'
          AND cna.corporate_id = :corporateId
        ORDER BY distance_km ASC NULLS LAST, h.hospital_name ASC`,
      { replacements: { corporateId, lat, lng }, type: postgresSequelize.QueryTypes.SELECT }
    );

    const formatted = hospitals.map(h => ({
      id:            String(h.id),
      name:          h.name,
      city:          h.city    || '',
      state:         h.state   || '',
      address:       h.address || '',
      phone:         h.phone   || '',
      specializations: h.specializations || [],
      // hospitals carries no rating; reported as 0 rather than invented.
      rating:        0,
      latitude:      h.latitude  === null ? null : Number(h.latitude),
      longitude:     h.longitude === null ? null : Number(h.longitude),
      distanceKm:    h.distance_km === null || h.distance_km === undefined
                       ? null
                       : Math.round(Number(h.distance_km) * 10) / 10,
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
      // outreach_clinics has no metadata column, which made this 500 every time.
      `SELECT oc.id,
              oc.name,
              oc.type,
              oc.location
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
      // Neither outreach_clinics nor the assignment row records a corporate
      // discount, so none is claimed for a clinic.
      corpDiscount:   0,
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
      // Same keys as the corporate response below. An individual member used
      // to get `healthCheckups: undefined` here, so a client that maps over it
      // breaks on exactly the screen (Benefits & Plans) where QA reported
      // empty values.
      return res.json({
        success: true,
        isCorporateEmployee: false,
        corporateId: null,
        corporateName: null,
        plans: [],
        healthCheckups: [],
        policies: [],
        policyGroups: [],
        policySummary: null,
        policyLadders: [],
        insuranceLink: { linked: false },
        policiesUnavailable: null
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
        // Was printing the raw catalog id ("DairyDay_AHC_Sales_2026-27 ").
        name: packageDisplayName(row.packageName, details, row.metadata) || `Health Checkup Package ${idx + 1}`,
        rawName: row.packageName || null,
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

    // The typed group policies, alongside the employer's benefit plans. Kept
    // as its own key rather than folded into plans[]: plans[] is the employer's
    // own benefit configuration, while these are insurance policies with
    // different fields, claim routes and cards, and a client reading plans[]
    // today must keep working unchanged.
    //
    // A wallet that cannot be read does not fail the whole screen: the
    // benefit plans and check-ups above are what this endpoint has always
    // returned, and losing them to an insurance-side error would blank the
    // Benefits hub.
    let policies = [];
    let policyGroups = [];
    let policySummary = null;
    let policyLadders = [];
    let insuranceLink = { linked: false };
    let policiesUnavailable = null;
    try {
      const wallet = await policyWallet.getPolicyWallet(req.user.id);
      policies = wallet.policies;
      policyGroups = wallet.groups;
      policySummary = wallet.summary;
      policyLadders = wallet.ladders;
      insuranceLink = wallet.insurance || insuranceLink;
    } catch (policyError) {
      policiesUnavailable = policyError.code || 'POLICY_WALLET_UNAVAILABLE';
      console.error('[employee] benefits: policy wallet unavailable:', policyError.message);
    }

    return res.json({
      success: true,
      isCorporateEmployee: true,
      corporateId: corp.corporateId,
      corporateName: corp.companyName,
      plans: [...healthCheckupPlans, ...plans],
      healthCheckups: healthCheckupPlans,
      policies,
      policyGroups,
      policySummary,
      policyLadders,
      // SmartCRM link state (ADR-001): whether this member's insurance is
      // linked, when it last synced, and whether that is stale.
      insuranceLink,
      policiesUnavailable
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
/**
 * The policy wallet.
 *
 * An employee can hold up to seven group policies at once — GHI, its top-up,
 * Parents GHI, its top-up, GPA, GTLI and OPD — each with a different claim
 * route. /benefits returns the employer's benefit plans and health check-ups;
 * these endpoints return the insurance policies themselves, typed, so the app
 * can show the right card, the right terms and the right way to claim instead
 * of one generic "Insurance" tile.
 *
 * Every response is scoped to req.user.id, and the service filters each member
 * list to the caller's own family. A group policy covers every employee of the
 * corporate, so an unscoped member list would disclose other families'
 * dependants.
 *
 * The fixed paths are registered before /policies/:policyId so that "types"
 * and "coverage-matrix" are not read as policy ids.
 *
 * GET /api/employee/policies/types
 */
router.get('/policies/types', authUser, (req, res) => {
  res.json({
    success: true,
    types: policyWallet.POLICY_TYPES,
    groups: policyWallet.POLICY_GROUPS,
  });
});

/**
 * GET /api/employee/policies
 */
router.get('/policies', authUser, async (req, res) => {
  try {
    const wallet = await policyWallet.getPolicyWallet(req.user.id);
    res.json({ success: true, ...wallet });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ success: false, message: error.message, code: error.code });
    console.error('[employee] policy wallet error:', error.message);
    res.status(500).json({ success: false, message: 'Could not load your policies' });
  }
});

/**
 * GET /api/employee/policies/coverage-matrix
 */
router.get('/policies/coverage-matrix', authUser, async (req, res) => {
  try {
    const matrix = await policyWallet.getCoverageMatrix(req.user.id);
    res.json({ success: true, ...matrix });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ success: false, message: error.message, code: error.code });
    console.error('[employee] coverage matrix error:', error.message);
    res.status(500).json({ success: false, message: 'Could not load your coverage' });
  }
});

/**
 * GET /api/employee/policies/:policyId
 */
router.get('/policies/:policyId', authUser, async (req, res) => {
  try {
    const detail = await policyWallet.getPolicyDetail(req.user.id, req.params.policyId);
    if (!detail) {
      return res.status(404).json({ success: false, code: 'POLICY_NOT_FOUND', message: 'No policy of yours has that id' });
    }
    res.json({ success: true, ...detail });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ success: false, message: error.message, code: error.code });
    console.error('[employee] policy detail error:', error.message);
    res.status(500).json({ success: false, message: 'Could not load that policy' });
  }
});

/**
 * GET /api/employee/policies/:policyId/claims
 */
router.get('/policies/:policyId/claims', authUser, async (req, res) => {
  try {
    const result = await policyWallet.listPolicyClaims(req.user.id, req.params.policyId);
    if (!result) {
      return res.status(404).json({ success: false, code: 'POLICY_NOT_FOUND', message: 'No policy of yours has that id' });
    }
    res.json({ success: true, ...result });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ success: false, message: error.message, code: error.code });
    console.error('[employee] policy claims error:', error.message);
    res.status(500).json({ success: false, message: 'Could not load claims for that policy' });
  }
});

/**
 * GET /api/employee/policies/:policyId/members/:memberId/e-card
 *
 * The card for one covered person — a parent on the parents' policy, the
 * employee on the base policy. An accident or life policy has no card at all
 * and says so, rather than handing someone an unusable one at an admission
 * desk.
 */
router.get('/policies/:policyId/members/:memberId/e-card', authUser, async (req, res) => {
  try {
    const result = await policyWallet.getMemberECard(req.user.id, req.params.policyId, req.params.memberId);
    if (result?.error === 'POLICY_NOT_FOUND') {
      return res.status(404).json({ success: false, code: result.error, message: 'No policy of yours has that id' });
    }
    if (result?.error === 'MEMBER_NOT_FOUND') {
      return res.status(404).json({ success: false, code: result.error, message: 'Nobody in your family is covered under that member id' });
    }
    if (result?.error === 'POLICY_HAS_NO_CARD') {
      return res.status(409).json({
        success: false,
        code: result.error,
        policyType: result.policyType,
        actions: result.actions,
        message: 'This policy is not claimed with a card. A claim is made through your HR team with documents.',
      });
    }
    res.json(result);
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ success: false, message: error.message, code: error.code });
    console.error('[employee] member e-card error:', error.message);
    res.status(500).json({ success: false, message: 'Could not load that card' });
  }
});

router.get('/claims', authUser, async (req, res) => {
  try {
    const corp = await getUserCorporate(req.user.id);
    if (!corp) {
      // Same keys as the corporate response below, for the same reason.
      return res.json({
        success: true,
        isCorporateEmployee: false,
        corporateId: null,
        corporateName: null,
        claims: []
      });
    }

    // Guard against a non-numeric org ref (some accounts carry an entity-UID string in
    // organization_id). Number('CC9FL6') is NaN, which would make setRlsContext write
    // set_config('app.current_org_id','NaN') and the RLS int-cast then throws -> 500
    // "Couldn't load claims". Fall back to the numeric corporate id from the roster.
    const orgCandidate = Number(req.user.organization_id ?? req.user.organizationId);
    const organizationId = Number.isFinite(orgCandidate) && orgCandidate > 0 ? orgCandidate : Number(corp.corporateId);
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
    // family_members has FORCED row-level security: look the member up as this user, or it is never found.
    const member = memberId === 'self' ? await User.findByPk(req.user.id) : await postgresSequelize.transaction(async (transaction) => {
      await setRlsContext(transaction, { orgId: 0, userId: req.user.id });
      return FamilyMember.findOne({ where: { id: Number(memberId) || 0, userId: req.user.id }, transaction });
    });
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
