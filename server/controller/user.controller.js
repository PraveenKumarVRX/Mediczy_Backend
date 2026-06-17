import { validationResult } from "express-validator";
import { JWT_CONFIG } from '../config/auth.config.js';
import userModel, { generateAuthTokenForUser, User } from "../models/user.model.intelligent.js";
import jwt from "jsonwebtoken";
import { auditLoginAttempt } from "../middleware/audit.middleware.js";
import { issueRefreshToken } from "../services/auth-token.service.js";
import { setAuthCookies } from "../config/cookies.config.js";
import Consent from "../models/consent.model.intelligent.js";
import intelligentDb from "../utils/intelligentDbClient.js";
import { col, fn, where as sequelizeWhere } from "sequelize";
import Doctor from "../models/doctor.model.intelligent.js";
import Nurse from "../models/nurse.model.intelligent.js";
import Assistant from "../models/assistant.model.intelligent.js";
import { UserPlan, MembershipPlan } from "../models/membershipPlan.model.intelligent.js";
import postgresSequelize from "../db/postgres-sequelize.js";
import { tryAutoActivateCorporateEmployeeForLogin } from "../services/corporate-employee-activation.service.js";

const MEMBERSHIP_RENEWAL_EXEMPT_EMAILS = new Set(
  String(process.env.MEMBERSHIP_RENEWAL_EXEMPT_EMAILS || 'user@mediczy.com')
    .split(',')
    .map((email) => String(email || '').trim().toLowerCase())
    .filter(Boolean)
);

const isMembershipRenewalExemptEmail = (email) => {
  return MEMBERSHIP_RENEWAL_EXEMPT_EMAILS.has(String(email || '').trim().toLowerCase());
};

const buildInactiveAccountContext = async (userId) => {
  try {
    const latestPlan = await UserPlan.findOne({
      where: { userId },
      include: [{ model: MembershipPlan, as: "plan", required: false }],
      order: [["endDate", "DESC"], ["createdAt", "DESC"]],
    });

    if (!latestPlan) {
      return {
        reasonCode: "NO_ACTIVE_MEMBERSHIP",
        reason: "No active membership plan found",
        action: "RENEW_MEMBERSHIP",
        nextStep: "/choose-plan",
      };
    }

    const endDate = latestPlan.endDate ? String(latestPlan.endDate) : null;
    const expired = endDate ? new Date(`${endDate}T23:59:59.999Z`) < new Date() : false;
    const latestPlanName = latestPlan?.plan?.name || null;

    if (latestPlan.status === "expired" || expired) {
      return {
        reasonCode: "MEMBERSHIP_EXPIRED",
        reason: endDate
          ? `Membership plan expired on ${endDate}`
          : "Membership plan has expired",
        action: "RENEW_MEMBERSHIP",
        nextStep: "/my-plans",
        expiredOn: endDate,
        planName: latestPlanName,
      };
    }

    if (latestPlan.status !== "active") {
      return {
        reasonCode: "MEMBERSHIP_INACTIVE",
        reason: `Membership is ${latestPlan.status}`,
        action: "CONTACT_SUPPORT",
        nextStep: "/support",
        planName: latestPlanName,
      };
    }

    return {
      reasonCode: "ACCOUNT_INACTIVE",
      reason: "Account is inactive",
      action: "CONTACT_SUPPORT",
      nextStep: "/support",
      planName: latestPlanName,
    };
  } catch (error) {
    console.error("Failed to build inactive account context:", error);
    return {
      reasonCode: "ACCOUNT_INACTIVE",
      reason: "Account is inactive",
      action: "CONTACT_SUPPORT",
      nextStep: "/support",
    };
  }
};

export async function registerUser(req, res) {
  // Validate request
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const email = String(req.body.email || "").trim().toLowerCase();
  const password = req.body.password;
  const firstName = req.body.firstName;
  const lastName = req.body.lastName;
  const phoneNumber = req.body.phoneNumber ? String(req.body.phoneNumber).trim() : null;
  const dateOfBirth = req.body.dateOfBirth;
  const gender = req.body.gender;
  
  // Corporate employment fields (optional)
  const employerName = req.body.employerName || null;
  const employeeId = req.body.employeeId || null;
  const corporateId = req.body.corporateId || null;
  const membershipType = req.body.membershipType || 'individual';
  const isCorporateSignup = membershipType === 'corporate' && corporateId && employeeId;

  try {
    // Check if user already exists
    const existingByEmail = await User.findOne({
      where: sequelizeWhere(fn("lower", col("email")), email),
    });
    if (existingByEmail) {
      return res.status(409).json({ message: "Email already exists" }); // 409 Conflict
    }

    if (phoneNumber) {
      const existingByPhone = await userModel.findOne({ where: { phoneNumber } });
      if (existingByPhone) {
        return res.status(409).json({ message: "Phone number already exists" });
      }
    }

    let corporateRosterRow = null;
    if (isCorporateSignup) {
      const [corp] = await postgresSequelize.query(
        `SELECT id FROM corporates WHERE id = :corporateId AND status = 'Active' LIMIT 1`,
        { replacements: { corporateId: Number(corporateId) }, type: postgresSequelize.QueryTypes.SELECT }
      );
      if (!corp) {
        return res.status(400).json({ message: "Invalid corporate selected" });
      }

      const [roster] = await postgresSequelize.query(
        `SELECT id, "userId" FROM corporate_employees
         WHERE corporate_id = :corporateId
           AND UPPER("employeeId") = UPPER(:employeeId)
           AND "isActive" = true
         LIMIT 1`,
        {
          replacements: { corporateId: Number(corporateId), employeeId: String(employeeId).trim() },
          type: postgresSequelize.QueryTypes.SELECT,
        }
      );

      if (!roster) {
        return res.status(404).json({ message: "Employee ID not found for this company. Please contact your HR." });
      }
      if (roster.userId) {
        return res.status(409).json({ message: "This employee ID is already registered. Please log in instead." });
      }
      corporateRosterRow = roster;
    }

    // Family Doctor concept: Default primary doctor is CMO Dr. Nandita Agarwal (ID: 5)
    const DEFAULT_PRIMARY_DOCTOR_ID = 5; // CMO Dr. Nandita Agarwal, MBBS MD General Physician

    // Create user (password will be hashed automatically by the beforeCreate hook)
    const newUser = await userModel.create({
      email,
      password,
      firstName,
      lastName,
      phoneNumber,
      dateOfBirth,
      gender,
      // Corporate employment fields
      employerName,
      employeeId,
      corporateId,
      membershipType,
      // Primary doctor (Family Doctor concept)
      primaryDoctorId: DEFAULT_PRIMARY_DOCTOR_ID,
      // Prevent privilege escalation / self-verification via extra body fields
      isAdmin: false,
      status: isCorporateSignup ? "inactive" : "active",
      emailVerified: false,
    });

    if (isCorporateSignup) {
      await postgresSequelize.query(
        `INSERT INTO user_associations ("userId", "entityType", "entityId", role, "isPrimary", status, "startDate", "createdAt", "updatedAt")
         VALUES (:userId, 'corporate', :corporateId, 'employee', false, 'active', NOW(), NOW(), NOW())
         ON CONFLICT ("userId", "entityType", "entityId", role)
         WHERE "entityType" = 'corporate'
         DO UPDATE SET status = 'active', "updatedAt" = NOW()`,
        { replacements: { userId: newUser.id, corporateId: Number(corporateId) }, type: postgresSequelize.QueryTypes.INSERT }
      );

      const [claimResult] = await postgresSequelize.query(
        `UPDATE corporate_employees
         SET "userId" = :userId,
             metadata = COALESCE(metadata, '{}'::jsonb)
                        || jsonb_build_object('profileActivation', 'active', 'activatedAt', NOW()::text),
             "updatedAt" = NOW()
         WHERE id = :employeeRowId
           AND "userId" IS NULL
         RETURNING id`,
        {
          replacements: { userId: newUser.id, employeeRowId: corporateRosterRow.id },
          type: postgresSequelize.QueryTypes.SELECT,
        }
      );

      if (!claimResult) {
        return res.status(500).json({ message: "Employee registration could not be activated. Please contact your HR admin." });
      }

      await postgresSequelize.query(
        `UPDATE users SET status = 'active', "updatedAt" = NOW() WHERE id = :id`,
        { replacements: { id: newUser.id }, type: postgresSequelize.QueryTypes.UPDATE }
      );
    }

    // Generate JWT Token including role/corporateId
    const token = generateAuthTokenForUser(newUser);

    // GDPR/DPDP Compliance: Grant default necessary consents upon registration
    await Consent.grantConsent({
      userId: newUser.id,
      userType: 'user',
      consentType: 'DATA_PROCESSING',
      purpose: 'Essential data processing for account management and medical services',
      dataCategories: ['profile', 'contact', 'authentication'],
      grantedVia: 'WEB',
      req,
      consentVersion: '1.0'
    });

    // Auto-create trial membership for new users (30-day free trial)
    try {
      // Try to find existing free/trial plan, or create one
      let trialPlan = await MembershipPlan.findOne({ where: { code: 'FREE_TRIAL' } });
      
      if (!trialPlan) {
        // Create a free trial plan if it doesn't exist
        trialPlan = await MembershipPlan.create({
          name: 'Free Trial',
          code: 'FREE_TRIAL',
          description: '30-day free trial: 3 GP consultations OR 1 specialist consultation',
          type: 'individual',
          price: 0,
          durationMonths: 1,
          features: [
            '3 General Physician consultations',
            '1 Specialist consultation',
            'Health records access',
            'Appointment booking'
          ],
          benefits: [
            'Choose between 3 GP visits or 1 specialist visit',
            'Access to health records',
            'Book appointments online'
          ],
          limitations: {
            gpConsultations: 3,
            specialistConsultations: 1,
            consultationMode: 'either', // 'either' means 3 GP OR 1 specialist, not both
            maxAppointments: 10
          },
          maxUsers: 1,
          isActive: true,
          isFeatured: false,
          sortOrder: 0
        });
        console.log('✅ Created FREE_TRIAL membership plan');
      }

      // Calculate trial period dates (30 days)
      const startDate = new Date();
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + 30);

      // Create user plan
      await UserPlan.create({
        userId: newUser.id,
        membershipPlanId: trialPlan.id,
        status: 'active',
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0],
        autoRenew: false,
        paymentMethod: 'free_trial',
        paidAmount: 0,
        metadata: {
          trialStarted: true,
          source: 'registration',
          gpConsultationsUsed: 0,
          specialistConsultationsUsed: 0,
          gpConsultationsRemaining: 3,
          specialistConsultationsRemaining: 1
        }
      });
      console.log(`✅ Created trial membership for user ${newUser.id}`);
    } catch (membershipError) {
      // Log error but don't fail registration
      console.error('⚠️ Failed to create trial membership:', membershipError.message);
    }

    // Audit the successful login after registration
    await auditLoginAttempt(req, newUser.id, newUser.email, true);

    // Mirror patient profile into intelligent DB (fire-and-forget)
    (async () => {
      try {
        const payload = {
          id: newUser.id,
          firstName: newUser.firstName,
          lastName: newUser.lastName,
          email: newUser.email,
          phoneNumber: newUser.phoneNumber,
          dateOfBirth: newUser.dateOfBirth,
          gender: newUser.gender,
          createdAt: newUser.createdAt,
          updatedAt: newUser.updatedAt
        };
        await intelligentDb.ingest("patients_v1", payload);
      } catch (err) {
        console.error("Intelligent DB ingest (patient) failed:", err.message || err);
      }
    })();

    // Generate semantic embedding for patient (fire-and-forget)
    (async () => {
      try {
        const sibUrl = process.env.SIB_URL || 'http://localhost:8001';
        const textToEmbed = [
          newUser.gender || '',
          newUser.dateOfBirth ? `born ${newUser.dateOfBirth}` : '',
          newUser.membershipType || '',
        ].filter(Boolean).join('. ');
        if (textToEmbed.trim()) {
          const embedRes = await fetch(`${sibUrl}/embed`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ texts: [textToEmbed] }),
            signal: AbortSignal.timeout(10000),
          });
          if (embedRes.ok) {
            const { embeddings } = await embedRes.json();
            const vector = embeddings?.[0];
            if (vector?.length) {
              const pool = (await import('../db/pgPool.js')).default;
              await pool.query(
                `INSERT INTO sib_embeddings (source_type, source_id, content, embedding, metadata, created_at)
                 VALUES ($1, $2, $3, $4::vector, $5, NOW())
                 ON CONFLICT DO NOTHING`,
                ['patient', String(newUser.id), textToEmbed, `[${vector.join(',')}]`,
                 JSON.stringify({ userId: newUser.id, gender: newUser.gender })]
              );
            }
          }
        }
      } catch (err) {
        console.error('[PatientEmbed] Failed to generate embedding:', err.message);
      }
    })();

    // Send response with proper JSON format
    return res.status(201).json({
      message: "User registered successfully",
      token,
      user: {
        id: newUser.id,
        firstName: newUser.firstName,
        lastName: newUser.lastName,
        email: newUser.email,
        phoneNumber: newUser.phoneNumber,
        dateOfBirth: newUser.dateOfBirth,
        gender: newUser.gender,
        status: newUser.status,
        emailVerified: newUser.emailVerified,
        role: newUser.isAdmin ? "admin" : "user",
        employerName: newUser.employerName,
        employeeId: newUser.employeeId,
        corporateId: newUser.corporateId,
        membershipType: newUser.membershipType
      },
    });
  } catch (error) {
    console.error("Registration error:", error);
    return res.status(500).json({ 
      message: "Internal Server Error",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

export async function signInUser(req, res) {
  // Validate request input
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  const rawEmail = req.body.email;
  const rawPhone = req.body.phoneNumber || req.body.phone || req.body.identifier;
  const password = req.body.password;

  let email = null;
  let phoneNumber = null;
  if (rawEmail) {
    const emailValue = String(rawEmail).trim();
    const normalized = emailValue.replace(/[^0-9]/g, '');
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailValue);
    if (isEmail) {
      email = emailValue.toLowerCase();
    } else if (normalized.length >= 10) {
      phoneNumber = normalized.length > 10 ? normalized.slice(-10) : normalized;
    }
  }

  if (!phoneNumber && rawPhone) {
    const normalized = String(rawPhone).replace(/[^0-9]/g, '');
    phoneNumber = normalized.length > 10 ? normalized.slice(-10) : normalized;
  }

  const loginIdentifier = email || phoneNumber;
  const maskedIdentifier = loginIdentifier
    ? (String(loginIdentifier).includes('@')
      ? String(loginIdentifier).replace(/(^.).*(@.*$)/, '$1***$2')
      : String(loginIdentifier).replace(/^(\d{2})\d+(\d{2})$/, '$1******$2'))
    : 'unknown';
  console.log('[LOGIN DEBUG] Login attempt received for identifier:', maskedIdentifier);

  try {
    // Check if user exists
    let user = null;
    if (email) {
      user = await User.findOne({
        where: sequelizeWhere(fn("lower", col("email")), email),
      });
    } else if (phoneNumber) {
      user = await User.findOne({
        where: sequelizeWhere(
          fn("regexp_replace", col("phoneNumber"), "[^0-9]", "", "g"),
          phoneNumber
        ),
      });
      if (!user) {
        user = await User.findOne({
          where: { phoneNumber },
        });
      }
    }
    console.log('[LOGIN DEBUG] User found:', !!user, 'User ID:', user?.id);
    
    if (!user) {
      // Audit failed login attempt
      await auditLoginAttempt(req, null, loginIdentifier, false, 'User not found');
      return res.status(401).json({ success: false, message: "Invalid email or password" }); // Unauthorized
    }

    const isRenewalExemptUser = isMembershipRenewalExemptEmail(user.email);

    await tryAutoActivateCorporateEmployeeForLogin(user);

    // Account guard for suspended/inactive users
    if ((user.status !== 'active' || user.isActive === false) && !isRenewalExemptUser) {
      await auditLoginAttempt(req, user.id, loginIdentifier, false, 'Inactive user attempted login');
      const details = await buildInactiveAccountContext(user.id);
      return res.status(403).json({
        success: false,
        code: 'ACCOUNT_INACTIVE',
        message: details.reasonCode === 'MEMBERSHIP_EXPIRED'
          ? 'Your membership has expired. Please renew to continue.'
          : details.reasonCode === 'NO_ACTIVE_MEMBERSHIP'
          ? 'No active membership plan found. Please choose a plan to continue.'
          : "Account is inactive. Please contact support.",
        details
      });
    }

    if (isRenewalExemptUser && user.status !== 'active') {
      await userModel.update({ status: 'active' }, { where: { id: user.id } });
      user.status = 'active';
    }

    // Role guard from unified user table - prevents cross-portal login by role
    const roleLower = String(user.role || '').toLowerCase();
    const blockedPortalRoles = new Set([
      'admin',
      'doctor',
      'nurse',
      'assistant',
      'team',
      'team_member',
      'team_lead',
      'hospital',
      'hospital_admin',
      'clinic_staff',
      'pharmacy',
      'lab',
      'corporate',
      'tpa',
      'insurer',
      'insurance_company',
      'insurance_broker',
      'ngo',
      'psu',
      'ambulance'
    ]);
    if (blockedPortalRoles.has(roleLower)) {
      const portalHints = {
        admin: 'admin',
        doctor: 'doctor',
        nurse: 'nurse',
        assistant: 'assistant',
        team: 'team',
        team_member: 'team',
        team_lead: 'team',
        hospital: 'hospital',
        hospital_admin: 'hospital',
        clinic_staff: 'clinic',
        pharmacy: 'pharmacy',
        lab: 'lab',
        corporate: 'corporate'
      };
      const portal = portalHints[roleLower] || 'the appropriate';
      await auditLoginAttempt(req, user.id, loginIdentifier, false, `${roleLower} attempted user login`);
      return res.status(403).json({
        success: false,
        message: `Please use the ${portal} login portal`
      });
    }

    // ROLE GUARD: Block staff from using user login endpoint
    if (user.isAdmin) {
      await auditLoginAttempt(req, user.id, loginIdentifier, false, 'Admin attempted user login');
      return res.status(403).json({ 
        success: false,
        message: "Please use the admin login portal" 
      });
    }

    // Cross-role guard: prevent doctor/nurse/assistant accounts from authenticating via user login
    if (email) {
      const doctorRecord = await Doctor.findOne({
        where: sequelizeWhere(fn("lower", col("email")), email),
        attributes: ["id"]
      });
      if (doctorRecord) {
        await auditLoginAttempt(req, user.id, loginIdentifier, false, 'Doctor attempted user login');
        return res.status(403).json({ success: false, message: "Please use the doctor login portal" });
      }
      const nurseRecord = await Nurse.findOne({
        where: sequelizeWhere(fn("lower", col("email")), email),
        attributes: ["id"]
      });
      if (nurseRecord) {
        await auditLoginAttempt(req, user.id, loginIdentifier, false, 'Nurse attempted user login');
        return res.status(403).json({ success: false, message: "Please use the nurse login portal" });
      }
      const assistantRecord = await Assistant.findOne({
        where: sequelizeWhere(fn("lower", col("email")), email),
        attributes: ["id"]
      });
      if (assistantRecord) {
        await auditLoginAttempt(req, user.id, loginIdentifier, false, 'Assistant attempted user login');
        return res.status(403).json({ success: false, message: "Please use the assistant login portal" });
      }
    }

    // Compare provided password with stored hashed password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      // Audit failed login attempt
      await auditLoginAttempt(req, user.id, loginIdentifier, false, 'Invalid password');
      return res.status(401).json({ success: false, message: "Invalid email or password" }); // Unauthorized
    }

    // Update last login (PostgreSQL uses lastLoginAt)
    user.lastLoginAt = new Date();
    await user.save();

    // Generate authentication token including userId, userType, role for ring-fencing
    const token = generateAuthTokenForUser(user);

    // Issue a refresh token (stored in Redis, 7-day TTL) for silent session renewal.
    // Fire-and-forget: refresh token failure must not block the login response.
    let refreshToken = null;
    try {
      refreshToken = await issueRefreshToken(user);
    } catch (rtErr) {
      console.warn('[login] Refresh token issuance failed (non-fatal):', rtErr.message);
    }

    // Set httpOnly cookies for web clients. Mobile apps continue to use the
    // token/refreshToken fields in the response body (Authorization header flow).
    if (refreshToken) {
      setAuthCookies(res, token, refreshToken);
    } else {
      // Access-only cookie when refresh token unavailable
      const { ACCESS_COOKIE_OPTIONS, COOKIE_NAMES } = await import('../config/cookies.config.js');
      res.cookie(COOKIE_NAMES.ACCESS, token, ACCESS_COOKIE_OPTIONS);
    }

    // Audit successful login
    await auditLoginAttempt(req, user.id, loginIdentifier, true);

    // Read metadata for requirePasswordChange flag
    let userMeta = user.metadata;
    if (typeof userMeta === 'string') {
      try { userMeta = JSON.parse(userMeta); } catch (e) { userMeta = {}; }
    }
    const requirePasswordChange = !!(userMeta && userMeta.requirePasswordChange === true);

    // Respond with user data & tokens.
    // `token` and `refreshToken` are included for backward-compatible mobile clients
    // that store tokens in Keychain/Keystore rather than relying on cookies.
    return res.status(200).json({
      success: true,
      message: "Login successful",
      token,
      refreshToken,
      requirePasswordChange,
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phoneNumber: user.phoneNumber,
        dateOfBirth: user.dateOfBirth,
        gender: user.gender,
        status: user.status,
        emailVerified: user.emailVerified,
        isActive: user.isActive,
        lastLoginAt: user.lastLoginAt,
        lastLogin: user.lastLogin,
        role: user.isAdmin ? "admin" : (user.role && user.role !== 'user' ? user.role : 'user'),
        organization_type: user.organization_type || null,
        organization_id: user.organization_id || null,
        tenant_id: user.tenant_id || null,
        employerName: user.employerName,
        employeeId: user.employeeId,
        corporateId: user.corporateId,
        membershipType: user.membershipType
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
}

export const getUserProfile = async (req, res, next) => {
  console.log('profile called');
  
  try {
    // Calculate age from dateOfBirth
    let age = null;
    if (req.user.dateOfBirth) {
      const birthDate = new Date(req.user.dateOfBirth);
      const today = new Date();
      age = today.getFullYear() - birthDate.getFullYear();
      const monthDiff = today.getMonth() - birthDate.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age--;
      }
    }

    // Prepare base profile
    const profile = {
      ...req.user,
      age,
      role: req.user.isAdmin ? 'admin' : 'user' // Add role field for frontend
    };

    // If user belongs to a corporate, fetch corporate details
    if (req.user.corporateId) {
      const { Corporate } = await import('../models/insurance-company.model.intelligent.js');
      const corporate = await Corporate.findByPk(req.user.corporateId, {
        attributes: ['id', 'companyName', 'cin', 'industry', 'employeeCount']
      });
      
      if (corporate) {
        profile.corporate = corporate;
      }
    }
    
    // Return user profile with age, role, and corporate info
    // Support both formats: direct profile and wrapped format
    return res.status(200).json({
      success: true,
      user: profile,
      // Also include fields at root level for backwards compatibility
      ...profile
    });
  } catch (error) {
    console.error('Get user profile error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching user profile'
    });
  }
};


export const updateUserStatus = async (req, res) => {
  try {
    console.log('hello from asy');
    
    // Extract token from headers
    const token = req.headers.authorization?.split(" ")[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized. No token provided.",
      });
    }

    // Verify and decode token
    const decoded = jwt.verify(token, JWT_CONFIG.SECRET);
    const userId = decoded.id; // Use 'id' instead of '_id' for Sequelize

    // Extract status from request
    const { isOnline } = req.body;

    if (typeof isOnline !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "Invalid status. Must be a boolean value.",
      });
    }

    // Update user status
    const [updatedRows] = await userModel.update(
      {
        isOnline,
        lastActive: new Date(),
      },
      {
        where: { id: userId },
        returning: true
      }
    );

    if (updatedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    // Get updated user
    const updatedUser = await userModel.findByPk(userId, {
      attributes: { exclude: ['password'] }
    });

    res.status(200).json({
      success: true,
      message: `Status updated to ${isOnline ? "online" : "offline"}.`,
      data: {
        isOnline: updatedUser.isOnline,
        lastActive: updatedUser.lastActive,
      },
    });
  } catch (error) {
    console.error("Error updating status:", error);
    res.status(500).json({
      success: false,
      message: "Server error while updating status.",
      error: error.message,
    });
  }
};

export const getAvailableUsers = async (req, res) => {
  try {
    const { isOnline } = req.query;

    // Build the query object
    const query = {};

    // Add online status to query if provided
    if (isOnline !== undefined) {
      query.isOnline = isOnline === "true";
    }

    // Find users matching the criteria
    const users = await userModel.findAll({
      where: query,
      attributes: [
        'id',
        'firstName',
        'lastName',
        'phoneNumber',
        'isOnline',
        'lastActive'
      ],
      order: [['lastActive', 'DESC']] // Sort by last active (most recent first)
    });

    res.status(200).json({
      success: true,
      count: users.length,
      data: users,
    });
  } catch (error) {
    console.error("Error finding users:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching users",
      error: error.message,
    });
  }
};
