import { validationResult } from 'express-validator';
import { JWT_CONFIG } from '../config/auth.config.js';
import userModel, { generateAuthTokenForUser } from '../models/user.model.intelligent.js';
import { Corporate } from '../models/index.js';
import { auditLoginAttempt } from '../middleware/audit.middleware.js';
import { postgresSequelize } from '../db/postgres-sequelize.js';
import { resolveCorporateScope } from '../services/corporate-scope.service.js';

// Fetch real employees from user_associations + users for a given corporate ID
const fetchCorporateEmployees = async (corporateId) => {
  
  const rows = await postgresSequelize.query(
    `SELECT u.id, u."firstName", u."lastName", u.email, u."phoneNumber", u.gender,
            u."department_name", u."chronicConditions", u."bloodType", u.height, u.weight,
            u.medications, u."employee_id", u."unique_id",
            ua."corporate_unique_id", ua.status AS assoc_status, ua."createdAt" AS enrolled_at
     FROM user_associations ua
     JOIN users u ON u.id = ua."userId"
     WHERE ua."entityId" = :corporateId
       AND ua."entityType" = 'corporate'
       AND ua.status = 'active'
     ORDER BY u."firstName", u."lastName"`,
    { replacements: { corporateId }, type: postgresSequelize.QueryTypes.SELECT }
  );

  return rows.map((r) => ({
    id: r.unique_id || String(r.id),
    employeeId: r.corporate_unique_id || r.employee_id || r.unique_id || `EMP-${r.id}`,
    name: [r.firstName, r.lastName].filter(Boolean).join(' ') || r.email,
    department: r.department_name || null,
    designation: null,
    age: null,
    gender: r.gender || null,
    phone: r.phoneNumber || null,
    email: r.email,
    riskLevel: null,
    riskScore: null,
    healthConditions: Array.isArray(r.chronicConditions) ? r.chronicConditions.filter(Boolean) : [],
    lastCheckup: null,
    nextCheckup: null,
    bmi: (r.height && r.weight) ? Number((r.weight / ((r.height / 100) ** 2)).toFixed(1)) : null,
    bloodType: r.bloodType || null,
    medications: Array.isArray(r.medications) ? r.medications.filter(Boolean) : [],
    planEnrolled: null,
    deviceConnected: false,
    enrolledAt: r.enrolled_at,
  }));
};

export const corporateLogin = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array(),
    });
  }

  try {
    const { email, username, password } = req.body;
    const normalizedEmail = String(email || '').toLowerCase().trim();
    // HR signs in with a username: users.email is UNIQUE, so while an HR person's work address is
    // held by their hr_staff row they cannot also have an employee row. A username lets the HR
    // account keep a system address and frees the work address for their employee account.
    const normalizedUsername = String(username || '').toLowerCase().trim();
    // What the audit trail records, and what the caller actually typed.
    const loginIdentifier = normalizedUsername || normalizedEmail;
    const bcrypt = (await import('bcrypt')).default;
    const jwt = (await import('jsonwebtoken')).default;

    // Require an active corporate record in the corporates table (allow pending for demo data)
    // The company-level account lives in `corporates`, which has no username column, so it is
    // reachable by email only. A username-only sign-in skips straight to the users table.
    const corporateRecord = normalizedEmail
      ? await Corporate.findOne({
          where: {
            email: normalizedEmail,
            status: ['active', 'Active', 'ACTIVE', 'pending', 'Pending']
          }
        })
      : null;

    // Real subdomain isolation: when arriving on a specific tenant's subdomain
    // (req.tenant set by the global extractTenant middleware), only that tenant's
    // own account may log in here — stops dairyday.mediqzy.com accepting some
    // other corporate's credentials. Generic hosts (app.mediqzy.com) skip this.
    if (corporateRecord && req.tenant && corporateRecord.tenantId !== req.tenant.id) {
      await auditLoginAttempt(req, corporateRecord.id, loginIdentifier, false, 'Wrong tenant subdomain');
      return res.status(401).json({ success: false, message: 'Invalid corporate credentials' });
    }

    if (!corporateRecord) {
      // HR sub-users (created via POST /api/hr/users, e.g. role:'hr_staff' with a
      // facility/branch/location scope) live in the users table, not corporates —
      // they have no Corporate row of their own. Fall back to that path before
      // rejecting, so a sub-user's own login actually works.
      const { default: User } = await import('../models/postgres/user.model.postgres.js');
      const { Op, fn, col, where: sqlWhere } = await import('sequelize');
      // Matched against lower(username) to line up with users_username_lower_unique, the partial
      // case-insensitive index that enforces username uniqueness.
      const identifierClause = normalizedUsername
        ? { [Op.and]: [sqlWhere(fn('lower', col('username')), normalizedUsername)] }
        : { email: normalizedEmail };
      const hrUser = await User.findOne({
        where: {
          ...identifierClause,
          organization_type: 'corporate',
          role: { [Op.in]: ['corporate_admin', 'hr_staff', 'corporate_cmo', 'corporate_ohc'] },
          status: 'active',
        },
      });
      // UID-based scope, preferred. The user's organisation is the registry entry named by
      // users.organization_uid, which must be of kind `corporate`; the subdomain check compares
      // tenant UIDs. hr_staff is also a role in the HOSPITAL HRMS module, so the role cannot say
      // which portal a user belongs to -- the organisation's kind does. Done BEFORE the password
      // check, as the integer gate was, so a wrong-host attempt reveals nothing about the account.
      // A user with no organization_uid yet (or a database without the column) gets mode 'legacy'
      // and falls through to the integer logic below unchanged.
      let uidScope = null;
      if (hrUser) {
        uidScope = await resolveCorporateScope(
          {
            query: (sql, replacements) =>
              postgresSequelize.query(sql, { replacements, type: postgresSequelize.QueryTypes.SELECT }),
            findCorporateById: (id) => Corporate.findByPk(id),
          },
          hrUser,
          req.tenant,
        );
        if (!uidScope.ok && uidScope.mode === 'uid') {
          await auditLoginAttempt(req, hrUser.id, loginIdentifier, false, uidScope.reason);
          return res.status(401).json({ success: false, message: 'Invalid corporate credentials' });
        }
      }

      // LEGACY integer gate: only for users who have no organization_uid yet. It is the very check
      // that admitted somya.pagare (organization_id 49, a CORPORATES id) on a hospital's subdomain
      // because tenants.id 49 is that hospital. Remove once organization_uid is backfilled.
      if (hrUser && !uidScope?.ok && req.tenant && hrUser.organization_id !== req.tenant.id) {
        await auditLoginAttempt(req, hrUser.id, loginIdentifier, false, 'Wrong tenant subdomain');
        return res.status(401).json({ success: false, message: 'Invalid corporate credentials' });
      }
      if (hrUser && await hrUser.comparePassword(password)) {
        let scopedCorporate = uidScope?.ok ? uidScope.corporate : null;

        if (!scopedCorporate) {
          const corporateScopeConditions = [
            { id: hrUser.organization_id },
            { tenantId: hrUser.organization_id },
            { tenantId: hrUser.tenant_id },
          ].filter((condition) => Object.values(condition)[0]);
          if (corporateScopeConditions.length === 0) {
            await auditLoginAttempt(req, hrUser.id, loginIdentifier, false, 'Corporate scope missing');
            return res.status(403).json({ success: false, message: 'Corporate scope missing for this HR user' });
          }

          scopedCorporate = await Corporate.findOne({
            where: {
              [Op.or]: corporateScopeConditions,
            },
          });
        }
        if (!scopedCorporate) {
          await auditLoginAttempt(req, hrUser.id, loginIdentifier, false, 'Corporate scope not found');
          return res.status(403).json({ success: false, message: 'Corporate scope not found for this HR user' });
        }

        // Built inline rather than via User.prototype.generateAuthToken() — that method
        // currently throws (JWT_CONFIG import-cycle issue), unrelated to this fallback.
        const jwtLib = (await import('jsonwebtoken')).default;
        const token = jwtLib.sign(
          {
            id: hrUser.id,
            userId: hrUser.id,
            corporateId: scopedCorporate.id,
            email: hrUser.email,
            role: hrUser.role,
            userType: 'corporate', // ring-fencing key — corporate_admin, hr_staff, and corporate_cmo sub-users are all corporate-portal users
            organization_id: hrUser.organization_id,
            organization_type: hrUser.organization_type,
            tenant_id: hrUser.tenant_id,
          },
          JWT_CONFIG.SECRET,
          { expiresIn: process.env.JWT_ACCESS_TTL || '15m' },
        );
        await hrUser.update({ lastLoginAt: new Date() }).catch(() => {});
        await auditLoginAttempt(req, hrUser.id, loginIdentifier, true);
        return res.status(200).json({
          success: true,
          token,
          user: {
            id: hrUser.id,
            email: hrUser.email,
            username: hrUser.username || null,
            firstName: hrUser.firstName,
            lastName: hrUser.lastName,
            role: hrUser.role,
            corporateId: scopedCorporate.id,
          },
          corporate: scopedCorporate,
        });
      }
      await auditLoginAttempt(req, null, loginIdentifier, false, 'Corporate not found');
      return res.status(401).json({ success: false, message: 'Invalid corporate credentials' });
    }

    let validPassword = false;
    try {
      if (corporateRecord.password) {
        validPassword = await bcrypt.compare(password, corporateRecord.password);
      }
    } catch (err) {
      console.warn('Corporate password verification failed:', err?.message);
    }

    if (!validPassword) {
      await auditLoginAttempt(req, corporateRecord.id, loginIdentifier, false, 'Invalid password');
      return res.status(401).json({ success: false, message: 'Invalid corporate credentials' });
    }

    // Issue JTI-tracked token (enables revocation + device fingerprint)
    const { issuePortalTokenPair } = await import('../services/token-revocation.service.js');
    const deviceFp = req.headers['x-device-fingerprint'] || null;
    const { accessToken: token, refreshToken } = await issuePortalTokenPair(
      {
        id: corporateRecord.id,
        userId: corporateRecord.id,
        corporateId: corporateRecord.id,
        email: corporateRecord.email,
        role: 'corporate',
        userType: 'corporate',
      },
      { portal: 'corporate', deviceFp }
    );

    await auditLoginAttempt(req, corporateRecord.id, loginIdentifier, true);

    return res.json({
      success: true,
      token,
      // The access token is 15 minutes -- without this, the frontend has no
      // way to silently renew it and every corporate HR session hard-401s
      // across the whole portal after 15 minutes with no recovery.
      refreshToken,
      user: {
        id: corporateRecord.id,
        email: corporateRecord.email,
        firstName: corporateRecord.contactPersonName || corporateRecord.name || corporateRecord.companyName,
        lastName: '',
        role: 'corporate',
        corporateId: corporateRecord.id,
      },
      corporate: corporateRecord,
    });
  } catch (error) {
    console.error('Corporate login error:', error);
    return res.status(500).json({ success: false, message: 'Failed to login corporate user' });
  }
};

export const getCorporateSummary = async (req, res) => {
  try {
    const corporateUser = req.user?.get ? req.user.get({ plain: true }) : req.user;
    const corporateId = corporateUser?.corporateId || corporateUser?.organization_id;
    const corporateRecord = corporateId ? await Corporate.findByPk(corporateId) : null;

    

    // Real employee count
    const [countRow] = await postgresSequelize.query(
      `SELECT COUNT(*) AS cnt FROM user_associations
       WHERE "entityId" = :corporateId AND "entityType" = 'corporate' AND status = 'active'`,
      { replacements: { corporateId }, type: postgresSequelize.QueryTypes.SELECT }
    );
    const activeEmployees = parseInt(countRow?.cnt || 0, 10);

    // Real completed appointments this month
    const [apptRow] = await postgresSequelize.query(
      `SELECT COUNT(*) AS cnt FROM appointments
       WHERE corporate_tenant_id = :corporateId
         AND status = 'completed'
         AND EXTRACT(MONTH FROM "appointmentDate") = EXTRACT(MONTH FROM NOW())
         AND EXTRACT(YEAR FROM "appointmentDate") = EXTRACT(YEAR FROM NOW())`,
      { replacements: { corporateId }, type: postgresSequelize.QueryTypes.SELECT }
    ).catch(() => [{ cnt: 0 }]);
    const consultationsThisMonth = parseInt(apptRow?.cnt || 0, 10);

    // Recent appointments as activity feed
    const recentAppointments = await postgresSequelize.query(
      `SELECT a.id, a.status, a."appointmentDate", a."appointmentTime",
              u."firstName" || ' ' || u."lastName" AS patient_name,
              u.department_name
       FROM appointments a
       JOIN users u ON u.id = a."userId"
       WHERE a.corporate_tenant_id = :corporateId
       ORDER BY a."appointmentDate" DESC, a."appointmentTime" DESC
       LIMIT 10`,
      { replacements: { corporateId }, type: postgresSequelize.QueryTypes.SELECT }
    ).catch(() => []);

    const recentActivities = recentAppointments.map((a, idx) => ({
      id: String(a.id),
      type: a.status === 'completed' ? 'Consultation Completed' : 'Appointment Scheduled',
      employeeName: a.patient_name,
      department: a.department_name || '',
      date: a.appointmentDate,
      notes: `${a.status === 'completed' ? 'Completed' : 'Scheduled'} at ${a.appointmentTime || ''}`,
    }));

    const [slaRow] = await postgresSequelize.query(
      `SELECT
         COUNT(*) FILTER (WHERE sla_status = 'on_time') AS on_time,
         COUNT(*) FILTER (WHERE sla_status = 'breached') AS breached,
         COUNT(*) FILTER (WHERE sla_status = 'pending_overdue') AS overdue
       FROM corporate_health_reports
       WHERE corporate_id = :corporateId
         AND report_date >= (CURRENT_DATE - INTERVAL '90 days')`,
      { replacements: { corporateId }, type: postgresSequelize.QueryTypes.SELECT }
    ).catch(() => [{ on_time: 0, breached: 0, overdue: 0 }]);
    const measuredReports = Number(slaRow?.on_time || 0) + Number(slaRow?.breached || 0);

    return res.json({
      success: true,
      data: {
        KPIs: {
          activeEmployees,
          totalConsultationsThisMonth: consultationsThisMonth,
          averageSatisfactionScore: null,
          emergencyCasesHandled: null,
          reportSlaCompliance: measuredReports ? Math.round((Number(slaRow.on_time || 0) / measuredReports) * 100) : null,
          overdueReports: Number(slaRow?.overdue || 0),
        },
        recentActivities,
        corporateProfile: {
          organization: corporateRecord?.companyName || 'Corporate Wellness Program',
          contactPerson: corporateRecord?.contactPerson || corporateUser?.firstName || '',
          contactEmail: corporateRecord?.email || corporateUser?.email,
          contractStatus: corporateRecord?.status || 'Active',
          packageType: corporateRecord?.packageType || null,
          employeeCount: corporateRecord?.employeeCount || activeEmployees,
          renewalDate: corporateRecord?.packageEndDate || null,
        },
        wellbeingHighlights: [],
      },
    });
  } catch (error) {
    console.error('Corporate summary error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch corporate summary' });
  }
};

export const getCorporateHealthAnalytics = async (req, res) => {
  try {
    const corporateUser = req.user?.get ? req.user.get({ plain: true }) : req.user;
    const corporateId = corporateUser?.corporateId || corporateUser?.organization_id;

    

    // Total enrolled employees
    const [countRow] = await postgresSequelize.query(
      `SELECT COUNT(*) AS cnt FROM user_associations
       WHERE "entityId" = :corporateId AND "entityType" = 'corporate' AND status = 'active'`,
      { replacements: { corporateId }, type: postgresSequelize.QueryTypes.SELECT }
    );
    const totalEmployees = parseInt(countRow?.cnt || 0, 10);

    // Employees with AI risk scores
    const riskRows = await postgresSequelize.query(
      `SELECT r.risk_level, COUNT(*) AS cnt
       FROM ai_health_risk_scores r
       JOIN user_associations ua ON ua."userId" = r.patient_id
       WHERE ua."entityId" = :corporateId AND ua."entityType" = 'corporate'
       GROUP BY r.risk_level`,
      { replacements: { corporateId }, type: postgresSequelize.QueryTypes.SELECT }
    ).catch(() => []);

    const riskDistribution = { low: 0, medium: 0, high: 0, critical: 0 };
    let monitoredEmployees = 0;
    for (const row of riskRows) {
      const level = (row.risk_level || '').toLowerCase();
      if (level in riskDistribution) {
        riskDistribution[level] = parseInt(row.cnt, 10);
        monitoredEmployees += parseInt(row.cnt, 10);
      }
    }

    // Common chronic conditions across enrolled employees
    const conditionRows = await postgresSequelize.query(
      `SELECT cond AS condition, COUNT(*) AS cnt
       FROM users u
       JOIN user_associations ua ON ua."userId" = u.id,
       LATERAL jsonb_array_elements_text(
         CASE WHEN jsonb_typeof(u."chronicConditions"::jsonb) = 'array'
              THEN u."chronicConditions"::jsonb
              ELSE '[]'::jsonb END
       ) AS cond
       WHERE ua."entityId" = :corporateId AND ua."entityType" = 'corporate'
         AND cond <> ''
       GROUP BY cond
       ORDER BY cnt DESC
       LIMIT 5`,
      { replacements: { corporateId }, type: postgresSequelize.QueryTypes.SELECT }
    ).catch(() => []);

    const commonConditions = conditionRows.map((r) => ({
      condition: r.condition,
      count: parseInt(r.cnt, 10),
      percentage: totalEmployees > 0 ? Math.round((parseInt(r.cnt, 10) / totalEmployees) * 100) : 0,
    }));

    // Department breakdown
    const deptRows = await postgresSequelize.query(
      `SELECT u.department_name AS department, COUNT(*) AS total_employees
       FROM users u
       JOIN user_associations ua ON ua."userId" = u.id
       WHERE ua."entityId" = :corporateId AND ua."entityType" = 'corporate'
         AND u.department_name IS NOT NULL AND u.department_name <> ''
       GROUP BY u.department_name
       ORDER BY total_employees DESC`,
      { replacements: { corporateId }, type: postgresSequelize.QueryTypes.SELECT }
    ).catch(() => []);

    const departmentRisks = deptRows.map((r) => ({
      department: r.department,
      totalEmployees: parseInt(r.total_employees, 10),
      highRisk: 0,
      avgRiskScore: null,
    }));

    return res.json({
      success: true,
      data: {
        totalEmployees,
        monitoredEmployees,
        healthyEmployees: riskDistribution.low,
        atRiskEmployees: riskDistribution.medium + riskDistribution.high,
        criticalCases: riskDistribution.critical,
        averageRiskScore: null,
        riskDistribution,
        departmentRisks,
        commonConditions,
        trendData: [],
      },
    });
  } catch (error) {
    console.error('Corporate analytics error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch health analytics' });
  }
};

export const getCorporateEmployeesHealth = async (req, res) => {
  try {
    const corporateUser = req.user?.get ? req.user.get({ plain: true }) : req.user;
    const corporateId = corporateUser?.corporateId || corporateUser?.organization_id;
    if (!corporateId) {
      return res.status(403).json({ success: false, message: 'Corporate context required' });
    }
    const employees = await fetchCorporateEmployees(corporateId);
    return res.json({ success: true, data: { employees } });
  } catch (error) {
    console.error('Corporate employees health error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch employee health data' });
  }
};

export const getCorporateAppointments = async (req, res) => {
  try {
    const { Appointment, Doctor, User } = await import('../models/index.js');
    const corporateTenantId = req.user?.organization_id || req.user?.tenant_id || req.user?.corporateId;

    if (!corporateTenantId) {
      return res.status(403).json({
        success: false,
        message: 'Corporate tenant context required'
      });
    }

    const appointments = await Appointment.findAll({
      where: { corporate_tenant_id: corporateTenantId },
      include: [
        { model: Doctor, as: 'doctor', attributes: ['id', 'firstName', 'lastName', 'specialization', 'email'] },
        { model: User, as: 'patient', attributes: ['id', 'firstName', 'lastName', 'email', 'phoneNumber'] }
      ],
      order: [['appointmentDate', 'DESC'], ['appointmentTime', 'DESC']]
    });

    return res.json({ success: true, data: { appointments } });
  } catch (error) {
    console.error('Corporate appointments error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch appointments' });
  }
};
