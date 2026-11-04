import express from "express";
import { body, validationResult } from "express-validator";
import { col, fn, where as sequelizeWhere } from "sequelize";
import crypto from "crypto";
import bcrypt from "bcrypt";
import {
  getAvailableUsers,
  getUserProfile,
  registerUser,
  signInUser,
  updateUserStatus,
} from "../controller/user.controller.js";
import { authUser } from "../middleware/auth.middleware.js";
import userModel, { generateAuthTokenForUser } from "../models/user.model.intelligent.js";
import doctorModel from "../models/doctor.model.intelligent.js";
import passwordResetService from "../services/password-reset.service.js";
import signupVerificationService from "../services/signup-verification.service.js";
import n8nOTPService from "../services/n8n-otp.service.js";
import twilioOTPService from "../services/twilio-otp.service.js";
import n8nService from "../services/n8n.service.js";
import Consent from "../models/consent.model.intelligent.js";
import { auditLoginAttempt } from "../middleware/audit.middleware.js";
import { authLimiter, otpLimiter } from "../middleware/rateLimiter.middleware.js";
import intelligentDb from "../utils/intelligentDbClient.js";
import OTP from "../models/otp.model.intelligent.js";
import { tryAutoActivateCorporateEmployeeForLogin } from "../services/corporate-employee-activation.service.js";
import { cache } from "../db/redis.js";
import postgresSequelize from "../db/postgres-sequelize.js";
import { UserPlan, MembershipPlan } from "../models/membershipPlan.model.intelligent.js";
import {
  buildProfileKeyPrefix,
  buildPublicFileUrl,
  createPresignedUpload,
  getUploadsBucket
} from "../services/s3-presign.service.js";

// Safe error detail: never expose internals in production
const safeErr = (err) =>
  process.env.NODE_ENV !== 'production' ? err?.message : undefined;
import { uploadToMinio } from "../services/minio-upload.service.js";

let passwordAlertServicePromise = null;
const getPasswordAlertService = async () => {
  if (!passwordAlertServicePromise) {
    passwordAlertServicePromise = (async () => {
      try {
        const mod = await import('../services/email.service.js');
        const service = mod?.default || mod;
        if (service && typeof service.sendPasswordChangedEmail === 'function') {
          return service;
        }
      } catch (error) {
        console.warn('[change-password] Email alert service unavailable:', error?.message || error);
      }

      return {
        sendPasswordChangedEmail: async () => ({ success: false, skipped: true }),
      };
    })();
  }

  return passwordAlertServicePromise;
};

const router = express.Router();

const SIGNUP_OTP_TTL_MINUTES = 10;
const SIGNUP_VERIFY_TTL_SECONDS = 15 * 60;

const normalizeEmail = (value) => String(value || "").trim().toLowerCase();
const normalizePhone = (value) => String(value || "").replace(/[^0-9]/g, "");
const buildSignupVerificationKey = (email, phoneNumber) => {
  return `signup:verify:${normalizeEmail(email)}:${normalizePhone(phoneNumber)}`;
};

const MEMBERSHIP_RENEWAL_EXEMPT_EMAILS = new Set(
  String(process.env.MEMBERSHIP_RENEWAL_EXEMPT_EMAILS || 'user@mediczy.com')
    .split(',')
    .map((email) => String(email || '').trim().toLowerCase())
    .filter(Boolean)
);

const isMembershipRenewalExemptEmail = (email) => {
  return MEMBERSHIP_RENEWAL_EXEMPT_EMAILS.has(normalizeEmail(email));
};

const isLoopbackRequest = (req) => {
  const host = String(req.hostname || '').toLowerCase();
  const ip = String(req.ip || '').toLowerCase();
  const forwarded = String(req.headers['x-forwarded-for'] || '').toLowerCase();

  return host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '::1' ||
    ip === '127.0.0.1' ||
    ip === '::1' ||
    ip === '::ffff:127.0.0.1' ||
    forwarded.includes('127.0.0.1') ||
    forwarded.includes('::1');
};

// OTPs must never be returned in normal API responses. A local-only debug escape
// exists for intentional QA runs and is hard-disabled in production.
const shouldIncludeOtpInResponse = (req) =>
  process.env.OTP_DEBUG_RESPONSE === 'true' &&
  process.env.NODE_ENV !== 'production' &&
  isLoopbackRequest(req);

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

/**
 * @swagger
 * /api/users/register/send-otp:
 *   post:
 *     summary: Send OTP for user registration
 *     description: Send separate OTPs to email and WhatsApp for verification before registration
 *     tags: [Users]
 */
/**
 * @route   GET /api/users/register/corporates
 * @desc    Public list of active corporates for signup dropdown
 * @access  Public
 */
router.get("/register/corporates", async (req, res) => {
  try {
    const corporates = await postgresSequelize.query(
      `SELECT id, "companyName" AS name FROM corporates WHERE status = 'Active' ORDER BY "companyName"`,
      { type: postgresSequelize.QueryTypes.SELECT }
    );
    return res.json({ success: true, corporates });
  } catch (error) {
    console.error("Failed to fetch corporates for signup:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch corporates" });
  }
});

/**
 * @route   POST /api/users/register/validate-employee
 * @desc    Validate an employee ID against a corporate's pre-approved roster
 * @access  Public
 */
router.post(
  "/register/validate-employee",
  [
    body("corporateId").isInt({ min: 1 }).withMessage("Corporate ID required"),
    body("employeeId").notEmpty().trim().withMessage("Employee ID required"),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }
    const { corporateId, employeeId } = req.body;
    try {
      // Check corporate_employees roster (pre-loaded by admin)
      const [emp] = await postgresSequelize.query(
        `SELECT ce.id, ce."employeeId", ce.department, ce.designation, ce."userId", ce.metadata,
                c."companyName"
         FROM corporate_employees ce
         JOIN corporates c ON c.id = ce.corporate_id
         WHERE ce.corporate_id = :corporateId AND UPPER(ce."employeeId") = UPPER(:employeeId) AND ce."isActive" = true
         LIMIT 1`,
        {
          replacements: { corporateId: parseInt(corporateId), employeeId: String(employeeId).trim() },
          type: postgresSequelize.QueryTypes.SELECT,
        }
      );
      if (!emp) {
        // Fallback: check user_associations where employeeId is stored in metadata
        // (employees uploaded without a dedicated employeeId column land here only)
        const [uaEmp] = await postgresSequelize.query(
          `SELECT ua."userId", ua.metadata,
                  ua.metadata->>'employeeId'  AS "employeeId",
                  ua.metadata->>'department'  AS department,
                  ua.metadata->>'designation' AS designation,
                  ua.metadata->>'firstName'   AS "firstName",
                  ua.metadata->>'lastName'    AS "lastName",
                  c."companyName"
           FROM user_associations ua
           JOIN corporates c ON c.id = ua."entityId"
           WHERE ua."entityType" = 'corporate'
             AND ua."entityId"   = :corporateId
             AND ua.status       = 'active'
             AND UPPER(ua.metadata->>'employeeId') = UPPER(:employeeId)
           LIMIT 1`,
          {
            replacements: { corporateId: parseInt(corporateId), employeeId: String(employeeId).trim() },
            type: postgresSequelize.QueryTypes.SELECT,
          }
        );
        if (!uaEmp) {
          return res.status(404).json({ success: false, message: "Employee ID not found for this company. Please contact your HR." });
        }
        if (uaEmp.userId) {
          return res.status(409).json({ success: false, message: "This employee ID is already registered. Please log in instead." });
        }
        return res.json({
          success: true,
          message: "Employee verified",
          employee: {
            dbId: null,
            employeeId: uaEmp.employeeId || String(employeeId).trim(),
            department: uaEmp.department || null,
            designation: uaEmp.designation || null,
            corporateName: uaEmp.companyName,
            firstName: uaEmp.firstName || null,
            lastName: uaEmp.lastName || null,
          },
        });
      }
      if (emp.userId) {
        return res.status(409).json({ success: false, message: "This employee ID is already registered. Please log in instead." });
      }
      const meta = emp.metadata || {};
      return res.json({
        success: true,
        message: "Employee verified",
        employee: {
          dbId: emp.id,
          employeeId: emp.employeeId,
          department: emp.department || meta.department || null,
          designation: emp.designation || meta.designation || null,
          corporateName: emp.companyName,
          firstName: meta.firstName || null,
          lastName: meta.lastName || null,
        },
      });
    } catch (error) {
      console.error("Employee validation error:", error);
      return res.status(500).json({ success: false, message: "Validation failed" });
    }
  }
);

/**
 * @route   POST /api/users/register/check-availability
 * @desc    Check if email and phone are available before starting OTP flow
 * @access  Public
 */
router.post(
  "/register/check-availability",
  [
    body("email").isEmail().withMessage("Must be a valid email"),
    body("phoneNumber").isMobilePhone().withMessage("Must be a valid mobile phone number"),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const email = normalizeEmail(req.body.email);
    const phoneNumber = normalizePhone(req.body.phoneNumber);

    try {
      const existingEmail = await userModel.findOne({ where: { email } });
      if (existingEmail) {
        return res.status(409).json({
          success: false,
          field: "email",
          message: "Email already registered. Please sign in instead.",
        });
      }

      // Match on last 10 digits to handle +91, +91-, 10-digit, etc.
      const last10 = phoneNumber.replace(/[^0-9]/g, '').slice(-10);
      const [phoneRows] = await postgresSequelize.query(
        `SELECT id FROM users WHERE RIGHT(REGEXP_REPLACE("phoneNumber", '[^0-9]', '', 'g'), 10) = :last10 LIMIT 1`,
        { replacements: { last10 }, type: postgresSequelize.QueryTypes.SELECT }
      );
      if (phoneRows) {
        return res.status(409).json({
          success: false,
          field: "phoneNumber",
          message: "Mobile number already registered. Please sign in instead.",
        });
      }

      return res.json({ success: true, message: "Available" });
    } catch (error) {
      console.error("Availability check error:", error);
      return res.status(500).json({ success: false, message: "Check failed. Please try again." });
    }
  }
);

router.post(
  "/register/send-otp",
  otpLimiter,
  [
    body("email").isEmail().withMessage("Must be a valid email"),
    body("phoneNumber")
      .isMobilePhone()
      .withMessage("Must be a valid mobile phone number"),
    body("firstName").optional().isLength({ min: 2, max: 20 }).withMessage("First name must be between 2 to 20 characters"),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, phoneNumber, firstName } = req.body;

    try {
      // Check if email already exists
      const existingUser = await userModel.findOne({ where: { email } });
      if (existingUser) {
        return res.status(409).json({ 
          success: false,
          message: "Email already registered" 
        });
      }

      // Check if phone already exists (match on last 10 digits to handle +91, +91-, 10-digit formats)
      const last10 = String(phoneNumber).replace(/[^0-9]/g, '').slice(-10);
      const [existingPhoneRow] = await postgresSequelize.query(
        `SELECT id FROM users WHERE RIGHT(REGEXP_REPLACE("phoneNumber", '[^0-9]', '', 'g'), 10) = :last10 LIMIT 1`,
        { replacements: { last10 }, type: postgresSequelize.QueryTypes.SELECT }
      );
      if (existingPhoneRow) {
        return res.status(409).json({ 
          success: false,
          field: "phoneNumber",
          message: "Phone number already registered" 
        });
      }

      const includeOtp = shouldIncludeOtpInResponse(req);
      const verificationKey = buildSignupVerificationKey(email, phoneNumber);

      try {
        await cache.del(verificationKey);
      } catch (cacheError) {
        console.warn('⚠️  Signup verification cache reset skipped:', cacheError.message);
      }

      const emailOtp = await OTP.generate({
        email,
        purpose: 'signup_email_otp',
        expiryMinutes: SIGNUP_OTP_TTL_MINUTES
      });

      const whatsappOtp = await OTP.generate({
        phone: phoneNumber,
        purpose: 'signup_whatsapp_otp',
        expiryMinutes: SIGNUP_OTP_TTL_MINUTES
      });

      const deliveryChannels = {
        email: { sent: false, error: null },
        whatsapp: { sent: false, error: null }
      };

      try {
        await signupVerificationService.sendOTPViaEmail({
          email,
          firstName: firstName || 'User'
        }, emailOtp.code);
        deliveryChannels.email.sent = true;
      } catch (emailError) {
        deliveryChannels.email.error = emailError.message;
      }

      try {
        const whatsappResult = await twilioOTPService.sendWhatsAppOTP({
          phone: phoneNumber,
          otp: whatsappOtp.code,
          name: firstName || 'User',
          purpose: 'signup'
        });
        if (whatsappResult.success) {
          deliveryChannels.whatsapp.sent = true;
        } else {
          deliveryChannels.whatsapp.error = whatsappResult.error || whatsappResult.message;
        }
      } catch (whatsappError) {
        deliveryChannels.whatsapp.error = whatsappError.message;
      }

      // Email is required; WhatsApp is best-effort
      if (!deliveryChannels.email.sent) {
        return res.status(502).json({
          success: false,
          message: 'Failed to deliver OTP via email. Please try again.',
          data: { deliveryChannels }
        });
      }

      const responseData = {
        emailOtpId: emailOtp.id,
        whatsappOtpId: whatsappOtp.id,
        expiresAt: emailOtp.expiresAt,
        expiresIn: `${SIGNUP_OTP_TTL_MINUTES} minutes`,
        deliveryChannels,
        whatsappAvailable: deliveryChannels.whatsapp.sent
      };

      if (includeOtp) {
        responseData.emailOtp = emailOtp.code;
        if (deliveryChannels.whatsapp.sent) responseData.whatsappOtp = whatsappOtp.code;
      }

      const channelMsg = deliveryChannels.whatsapp.sent
        ? 'OTP sent to your email and WhatsApp'
        : 'OTP sent to your email (WhatsApp delivery unavailable)';
      console.log('📧 Registration OTP sent:', { email, phoneNumber, channels: deliveryChannels });

      return res.status(200).json({
        success: true,
        message: channelMsg,
        data: responseData
      });
    } catch (error) {
      console.error('Send registration OTP error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to send OTP',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

/**
 * @swagger
 * /api/users/register/verify-email-otp:
 *   post:
 *     summary: Verify email OTP for registration
 *     description: Verify email OTP before completing registration
 *     tags: [Users]
 */
router.post(
  "/register/verify-email-otp",
  [
    body("email").isEmail().withMessage("Must be a valid email"),
    body("phoneNumber").isMobilePhone().withMessage("Must be a valid mobile phone number"),
    body("code").optional().isLength({ min: 6, max: 6 }).withMessage("OTP must be 6 digits"),
    body("otp").optional().isLength({ min: 6, max: 6 }).withMessage("OTP must be 6 digits")
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, phoneNumber } = req.body;
    // Accept both 'code' (web) and 'otp' (mobile app) field names
    const code = req.body.code || req.body.otp;
    if (!code || code.length !== 6) {
      return res.status(400).json({ success: false, message: 'OTP must be 6 digits' });
    }

    try {
      const verifyResult = await OTP.verify({
        email,
        code,
        purpose: 'signup_email_otp'
      });

      if (!verifyResult.success) {
        return res.status(400).json({
          success: false,
          message: verifyResult.message || 'Invalid or expired OTP'
        });
      }

      const verificationKey = buildSignupVerificationKey(email, phoneNumber);
      const currentState = (await cache.get(verificationKey)) || { emailVerified: false, phoneVerified: false };

      await cache.set(verificationKey, {
        ...currentState,
        emailVerified: true,
        verifiedAt: new Date().toISOString()
      }, SIGNUP_VERIFY_TTL_SECONDS);

      return res.status(200).json({
        success: true,
        message: 'Email OTP verified',
        data: {
          emailVerified: true,
          phoneVerified: currentState.phoneVerified || false
        }
      });
    } catch (error) {
      console.error('Verify email OTP error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to verify OTP',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

/**
 * @swagger
 * /api/users/register/verify-whatsapp-otp:
 *   post:
 *     summary: Verify WhatsApp OTP for registration
 *     description: Verify WhatsApp OTP before completing registration
 *     tags: [Users]
 */
router.post(
  "/register/verify-whatsapp-otp",
  [
    body("email").isEmail().withMessage("Must be a valid email"),
    body("phoneNumber").isMobilePhone().withMessage("Must be a valid mobile phone number"),
    body("code").optional().isLength({ min: 6, max: 6 }).withMessage("OTP must be 6 digits"),
    body("otp").optional().isLength({ min: 6, max: 6 }).withMessage("OTP must be 6 digits")
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, phoneNumber } = req.body;
    // Accept both 'code' (web) and 'otp' (mobile app) field names
    const code = req.body.code || req.body.otp;
    if (!code || code.length !== 6) {
      return res.status(400).json({ success: false, message: 'OTP must be 6 digits' });
    }

    try {
      const verifyResult = await OTP.verify({
        phone: phoneNumber,
        code,
        purpose: 'signup_whatsapp_otp'
      });

      if (!verifyResult.success) {
        return res.status(400).json({
          success: false,
          message: verifyResult.message || 'Invalid or expired OTP'
        });
      }

      const verificationKey = buildSignupVerificationKey(email, phoneNumber);
      const currentState = (await cache.get(verificationKey)) || { emailVerified: false, phoneVerified: false };

      await cache.set(verificationKey, {
        ...currentState,
        phoneVerified: true,
        verifiedAt: new Date().toISOString()
      }, SIGNUP_VERIFY_TTL_SECONDS);

      return res.status(200).json({
        success: true,
        message: 'WhatsApp OTP verified',
        data: {
          emailVerified: currentState.emailVerified || false,
          phoneVerified: true
        }
      });
    } catch (error) {
      console.error('Verify WhatsApp OTP error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to verify OTP',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

/**
 * @swagger
 * /api/users/register/verify-otp:
 *   post:
 *     summary: Complete registration after OTP verification
 *     description: Finish registration after verifying both email and WhatsApp OTPs
 *     tags: [Users]
 */
router.post(
  "/register/verify-otp",
  [
    body("email").isEmail().withMessage("Must be a valid email"),
    body("phoneNumber").isMobilePhone().withMessage("Must be a valid mobile phone number"),
    body("password")
      .isLength({ min: 8 }).withMessage("Password must be at least 8 characters long")
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/).withMessage("Password must contain uppercase, lowercase and a number"),
    body("firstName").isLength({ min: 2, max: 20 }).withMessage("First name must be between 2 to 20 characters"),
    body("lastName").isLength({ min: 2, max: 20 }).withMessage("Last name must be between 2 to 20 characters"),
    body("dateOfBirth").optional({ nullable: true, checkFalsy: true }).isISO8601().withMessage("Must be a valid date in YYYY-MM-DD format"),
    body("gender").optional({ nullable: true, checkFalsy: true }).isIn(["Male", "Female", "Other"]).withMessage("Gender must be either Male, Female, or Other"),
    body("addressStreet").optional({ nullable: true, checkFalsy: true }).isString().trim().isLength({ max: 255 }),
    body("addressCity").optional({ nullable: true, checkFalsy: true }).isString().trim().isLength({ max: 120 }),
    body("addressState").optional({ nullable: true, checkFalsy: true }).isString().trim().isLength({ max: 120 }),
    body("addressZipCode").optional({ nullable: true, checkFalsy: true }).isString().trim().isLength({ max: 20 }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, phoneNumber, password, firstName, lastName, dateOfBirth, gender, memberType, corporateId, employeeDbId, employeeId, addressStreet, addressCity, addressState, addressZipCode } = req.body;
    const isCorporate = memberType === 'corporate';

    try {
      const verificationKey = buildSignupVerificationKey(email, phoneNumber);
      const verificationState = await cache.get(verificationKey);

      if (!verificationState?.emailVerified) {
        return res.status(400).json({
          success: false,
          message: 'Email OTP verification required'
        });
      }

      // Double-check user doesn't exist (race condition protection)
      const existingUser = await userModel.findOne({ where: { email } });
      if (existingUser) {
        return res.status(409).json({
          success: false,
          message: "Email already registered"
        });
      }

      // For corporate path: fetch corporate record to inherit aggregator/tenant
      let corporateRecord = null;
      if (isCorporate && corporateId) {
        const [corp] = await postgresSequelize.query(
          `SELECT id, "companyName", aggregator_id, aggregator_type, tenant_id FROM corporates WHERE id = :id AND status = 'Active' LIMIT 1`,
          { replacements: { id: parseInt(corporateId) }, type: postgresSequelize.QueryTypes.SELECT }
        );
        if (!corp) {
          return res.status(400).json({ success: false, message: 'Invalid corporate selected' });
        }
        corporateRecord = corp;

        // Re-validate the employee to prevent tampering with employeeDbId between steps
        if (employeeDbId) {
          const [recheck] = await postgresSequelize.query(
            `SELECT id, "userId" FROM corporate_employees
             WHERE id = :empDbId AND corporate_id = :corporateId AND "isActive" = true LIMIT 1`,
            { replacements: { empDbId: parseInt(employeeDbId), corporateId: parseInt(corporateId) }, type: postgresSequelize.QueryTypes.SELECT }
          );
          if (!recheck) {
            return res.status(400).json({ success: false, message: 'Employee record not found or no longer active.' });
          }
          if (recheck.userId) {
            return res.status(409).json({ success: false, message: 'This employee ID is already registered. Please log in instead.' });
          }
        } else if (employeeId) {
          // Fallback path: re-check the user_associations metadata row
          const [uaRecheck] = await postgresSequelize.query(
            `SELECT "userId" FROM user_associations
             WHERE "entityType" = 'corporate' AND "entityId" = :corporateId
               AND status = 'active'
               AND UPPER(metadata->>'employeeId') = UPPER(:employeeId)
             LIMIT 1`,
            { replacements: { corporateId: parseInt(corporateId), employeeId: String(employeeId).trim() }, type: postgresSequelize.QueryTypes.SELECT }
          );
          if (!uaRecheck) {
            return res.status(400).json({ success: false, message: 'Employee ID not found. Please re-validate your employee ID.' });
          }
          if (uaRecheck.userId) {
            return res.status(409).json({ success: false, message: 'This employee ID is already registered. Please log in instead.' });
          }
        } else {
          return res.status(400).json({ success: false, message: 'Employee validation required for corporate registration.' });
        }
      }

      // Create user
      const newUser = await userModel.create({
        email,
        phoneNumber,
        password,
        firstName,
        lastName,
        dateOfBirth,
        gender,
        emailVerified: true,
        phoneVerified: true,
        // Corporate users are activated only after the HR roster entry is claimed.
        status: isCorporate ? 'inactive' : 'active',
        organization_id: isCorporate ? (corporateRecord?.id ?? 7) : 7,
        organization_type: isCorporate ? 'corporate' : 'individual',
        tenant_id: isCorporate ? (corporateRecord?.tenant_id ?? 7) : 7
      });

      // Mark as verified and set aggregator/tenant/isCorporate
      try {
        const aggId   = isCorporate ? (corporateRecord?.aggregator_id   ?? 2) : 2;
        const aggType = isCorporate ? (corporateRecord?.aggregator_type  ?? 'broker') : 'broker';
        await postgresSequelize.query(
          `UPDATE users SET "isVerified" = true, "isCorporate" = :isCorporate,
            aggregator_id = :aggId, aggregator_type = :aggType,
            address_street = COALESCE(:addressStreet, address_street),
            address_city = COALESCE(:addressCity, address_city),
            address_state = COALESCE(:addressState, address_state),
            "address_zipCode" = COALESCE(:addressZipCode, "address_zipCode")
           WHERE id = :id`,
          {
            replacements: { id: newUser.id, isCorporate: isCorporate, aggId, aggType, addressStreet: addressStreet || null, addressCity: addressCity || null, addressState: addressState || null, addressZipCode: addressZipCode || null },
            type: postgresSequelize.QueryTypes.UPDATE
          }
        );
      } catch (activationErr) {
        console.error('⚠️  Post-registration activation update failed:', activationErr.message);
      }

      // Corporate-specific: link to corporate via user_associations + update employee record
      if (isCorporate && corporateRecord) {
        let corporateLinked = false;
        try {
          await postgresSequelize.query(
            `INSERT INTO user_associations ("userId", "entityType", "entityId", role, "isPrimary", status, "startDate", "createdAt", "updatedAt")
             VALUES (:userId, 'corporate', :corporateId, 'employee', false, 'active', NOW(), NOW(), NOW())
             ON CONFLICT ("userId", "entityType", "entityId", role) WHERE "entityType" = 'corporate' DO UPDATE SET status = 'active', "updatedAt" = NOW()`,
            { replacements: { userId: newUser.id, corporateId: corporateRecord.id } }
          );

          if (employeeDbId) {
            // Primary path: claim corporate_employees row and mark profile as activated.
            const [claimResult] = await postgresSequelize.query(
              `UPDATE corporate_employees
               SET "userId" = :userId,
                   "isActive" = true,
                   metadata = COALESCE(metadata, '{}'::jsonb)
                              || jsonb_build_object('profileActivation', 'active', 'activatedAt', NOW()::text),
                   "updatedAt" = NOW()
               WHERE id = :empDbId AND "userId" IS NULL
               RETURNING id`,
              { replacements: { userId: newUser.id, empDbId: parseInt(employeeDbId) }, type: postgresSequelize.QueryTypes.SELECT }
            );
            corporateLinked = !!claimResult;
          } else if (employeeId) {
            // Fallback path: mark user_associations roster entry as claimed.
            const [fallbackClaim] = await postgresSequelize.query(
              `UPDATE user_associations
               SET "userId" = :userId,
                   metadata = COALESCE(metadata, '{}'::jsonb)
                              || jsonb_build_object('profileActivation', 'active', 'activatedAt', NOW()::text),
                   "updatedAt" = NOW()
               WHERE "entityType" = 'corporate' AND "entityId" = :corporateId
                 AND status = 'active'
                 AND UPPER(metadata->>'employeeId') = UPPER(:employeeId)
                 AND "userId" IS NULL
               RETURNING id`,
              { replacements: { userId: newUser.id, corporateId: corporateRecord.id, employeeId: String(employeeId).trim() }, type: postgresSequelize.QueryTypes.SELECT }
            );
            corporateLinked = !!fallbackClaim;
          }
        } catch (linkErr) {
          console.error('Corporate linking failed:', linkErr.message);
        }

        if (!corporateLinked) {
          return res.status(500).json({
            success: false,
            message: 'Employee registration could not be activated. Please contact your HR admin.'
          });
        }

        // Activate corporate user only after successful employee linkage.
        await postgresSequelize.query(
          `UPDATE users SET status = 'active', "updatedAt" = NOW() WHERE id = :id`,
          { replacements: { id: newUser.id }, type: postgresSequelize.QueryTypes.UPDATE }
        );
      }

      // Individual path: assign Free Basic (trial) plan + link to My SmartHealth corporate
      if (!isCorporate) {
        try {
          await postgresSequelize.query(
            `INSERT INTO user_subscriptions (user_id, plan_id, status, start_date, auto_renew, billing_cycle, price, currency, created_at, updated_at)
             VALUES (:userId, 1, 'ACTIVE', NOW(), false, 'MONTHLY', 0, 'INR', NOW(), NOW())`,
            { replacements: { userId: newUser.id } }
          );
        } catch (planErr) {
          console.error('⚠️  Trial plan assignment failed (non-blocking):', planErr.message);
        }
        // Link individual user to My SmartHealth corporate (id=4) as 'member'
        try {
          await postgresSequelize.query(
            `INSERT INTO user_associations ("userId", "entityType", "entityId", role, "isPrimary", status, "startDate", "createdAt", "updatedAt")
             VALUES (:userId, 'corporate', 4, 'member', true, 'active', NOW(), NOW(), NOW())
             ON CONFLICT ("userId", "entityType", "entityId", role) WHERE "entityType" = 'corporate' DO UPDATE SET status = 'active', "updatedAt" = NOW()`,
            { replacements: { userId: newUser.id } }
          );
        } catch (assocErr) {
          console.error('⚠️  My SmartHealth association failed (non-blocking):', assocErr.message);
        }
      }

      console.log(`✅ New ${isCorporate ? 'corporate' : 'individual'} user registered:`, newUser.id);

      try {
        await cache.del(verificationKey);
      } catch (cacheError) {
        console.warn('⚠️  Signup verification cache cleanup skipped:', cacheError.message);
      }

      // Generate JWT Token
      const token = generateAuthTokenForUser(newUser);

      // Grant default consents
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

      // Audit the successful login after registration
      await auditLoginAttempt(req, newUser.id, newUser.email, true);

      // Trigger n8n workflow for user registration (fire-and-forget, never blocks registration response)
      n8nService.userRegistered({
        id: newUser.id,
        name: `${newUser.firstName} ${newUser.lastName}`.trim(),
        email: newUser.email,
        phone: newUser.phoneNumber,
        userType: 'patient'
      }).catch((n8nError) => {
        console.error('Failed to trigger n8n user registration workflow:', n8nError);
      });

      // Mirror patient profile into intelligent DB
      (async () => {
        try {
          await intelligentDb.ingest("patients_v1", {
            id: newUser.id,
            firstName: newUser.firstName,
            lastName: newUser.lastName,
            email: newUser.email,
            phoneNumber: newUser.phoneNumber,
            dateOfBirth: newUser.dateOfBirth,
            gender: newUser.gender,
            createdAt: newUser.createdAt,
            updatedAt: newUser.updatedAt
          });
        } catch (err) {
          console.error("Intelligent DB ingest (patient) failed:", err.message);
        }
      })();

      return res.status(201).json({
        success: true,
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
          emailVerified: true,
          phoneVerified: true,
          role: newUser.role || 'user',
          corporateId: newUser.corporateId || null
        }
      });
    } catch (error) {
      console.error('Verify registration OTP error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to verify OTP',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

/**
 * @swagger
 * /api/users/register:
 *   post:
 *     summary: Register a new user
 *     description: Create a new patient account in the system
 *     tags: [Users]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *               - firstName
 *               - lastName
 *               - phoneNumber
 *               - dateOfBirth
 *               - gender
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: user@mediczy.com
 *               password:
 *                 type: string
 *                 minLength: 4
 *                 example: password123
 *               firstName:
 *                 type: string
 *                 minLength: 3
 *                 maxLength: 20
 *                 example: John
 *               lastName:
 *                 type: string
 *                 minLength: 3
 *                 maxLength: 20
 *                 example: Doe
 *               phoneNumber:
 *                 type: string
 *                 example: "+919876543210"
 *               dateOfBirth:
 *                 type: string
 *                 format: date
 *                 example: "1990-01-15"
 *               gender:
 *                 type: string
 *                 enum: [Male, Female, Other]
 *                 example: Male
 *     responses:
 *       201:
 *         description: User registered successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: User registered successfully
 *                 token:
 *                   type: string
 *                   example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
router.post(
  "/register",
  [
    body("email").isEmail().withMessage("Must be a valid email"),
    body("password")
      .isLength({ min: 4 })
      .withMessage("Password must be at least 4 characters long"),
    body("firstName")
      .isLength({ min: 3, max: 20 })
      .withMessage("First name must be between 3 to 20 characters"),
    body("lastName")
      .isLength({ min: 3, max: 20 })
      .withMessage("Last name must be between 3 to 20 characters"),
    body("phoneNumber")
      .isMobilePhone()
      .withMessage("Must be a valid mobile phone number"),
    body("dateOfBirth")
      .isISO8601()
      .withMessage("Must be a valid date in YYYY-MM-DD format"),
    body("gender")
      .isIn(["Male", "Female", "Other"])
      .withMessage("Gender must be either Male, Female, or Other"),
  ],
  registerUser
);

/**
 * @swagger
 * /api/users/login:
 *   post:
 *     summary: User login
 *     description: Authenticate user and receive JWT token
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: user@mediczy.com
 *               password:
 *                 type: string
 *                 example: password123
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Login successful
 *                 token:
 *                   type: string
 *                   example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
router.post(
  "/login",
  authLimiter,
  [
    body().custom((_, { req }) => {
      const rawEmail = req.body?.email;
      const rawPhone = req.body?.phoneNumber || req.body?.phone;

      if (!rawEmail && !rawPhone) {
        throw new Error('Email or phone number is required');
      }

      if (rawEmail) {
        const emailValue = String(rawEmail).trim();
        const normalized = emailValue.replace(/[^0-9]/g, '');
        const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailValue);
        const isPhone = normalized.length >= 10;
        // Admin/HR-provisioned corporate employees log in with their 6-char
        // corporate_employees UID (e.g. E7K2PX) instead of an email.
        const isLoginUid = /^[A-Za-z][A-Za-z0-9]{5}$/.test(emailValue);
        if (!isEmail && !isPhone && !isLoginUid) {
          throw new Error('Must be a valid email, phone number, or login ID');
        }
      }

      if (rawPhone) {
        const normalizedPhone = String(rawPhone).replace(/[^0-9]/g, '');
        if (normalizedPhone.length < 10) {
          throw new Error('Must be a valid phone number');
        }
      }

      return true;
    }),
    body("password").notEmpty().withMessage("Password is required"),
  ],
  signInUser
);

/**
 * @swagger
 * /api/users/login/send-otp:
 *   post:
 *     summary: Send OTP for passwordless login
 *     description: Send OTP via Email (if email provided) or WhatsApp (if phone provided)
 *     tags: [Authentication]
 */
router.post(
  "/login/send-otp",
  otpLimiter,
  [
    body().custom((_, { req }) => {
      const rawIdentifier = req.body?.identifier ?? req.body?.email ?? req.body?.phoneNumber ?? req.body?.phone;
      if (!rawIdentifier || !String(rawIdentifier).trim()) {
        throw new Error("Email or phone number is required");
      }
      return true;
    }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const identifier = String(
      req.body?.identifier ?? req.body?.email ?? req.body?.phoneNumber ?? req.body?.phone
    ).trim();
    const includeOtp = shouldIncludeOtpInResponse(req);

    try {
      // Determine if identifier is email or phone
      const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier);
      const normalizedDigits = identifier.replace(/[^0-9]/g, '');
      const isPhone = normalizedDigits.length >= 10;

      if (!isEmail && !isPhone) {
        return res.status(400).json({
          success: false,
          message: 'Please provide a valid email address or 10-digit phone number'
        });
      }

      // Generate placeholder OTP ID for security (user enumeration prevention)
      const placeholderOtpId = crypto.randomBytes(8).toString('hex');
      const placeholderExpiresAt = new Date(Date.now() + 5 * 60 * 1000);

      let user;
      let deliveryMethod;

      if (isEmail) {
        // Find user by email
        user = await userModel.findOne({ where: { email: identifier } });
        deliveryMethod = 'email';
      } else {
        // Find user by phone number
        const cleanPhone = normalizedDigits.length > 10
          ? normalizedDigits.slice(-10)
          : normalizedDigits;
        user = await userModel.findOne({
          where: sequelizeWhere(
            fn("regexp_replace", col("phoneNumber"), "[^0-9]", "", "g"),
            cleanPhone
          ),
        });
        deliveryMethod = 'whatsapp';
      }

      // SIGNUP PATH: if user not found but both email + phone provided → new user signup
      const incomingPhone = req.body?.phoneNumber || req.body?.phone;
      if (!user && isEmail && incomingPhone) {
        const normalizedPhone = String(incomingPhone).replace(/[^0-9]/g, '').slice(-10);
        // Check phone not already taken by another account
        const phoneExists = await userModel.findOne({
          where: sequelizeWhere(
            fn("regexp_replace", col("phoneNumber"), "[^0-9]", "", "g"),
            normalizedPhone
          ),
        });
        if (phoneExists) {
          return res.status(409).json({ success: false, message: 'Phone number already registered' });
        }

        // Generate and send a real signup OTP via email
        const OTP_signup = await import('../models/otp.model.intelligent.js');
        const signupOtp = await OTP_signup.default.generate({
          email: identifier,
          purpose: 'signup_email_otp',
          expiryMinutes: 10
        });

        try {
          await signupVerificationService.sendOTPViaEmail({
            email: identifier,
            firstName: req.body?.firstName || 'User'
          }, signupOtp.code);
          console.log(`📧 Signup OTP sent via email to new user: ${identifier}`);
        } catch (emailErr) {
          console.warn('⚠️  Direct email failed for signup OTP, trying n8n:', emailErr.message);
          try {
            const n8nResult = await n8nOTPService.sendEmailOTP({
              email: identifier,
              otp: signupOtp.code,
              name: req.body?.firstName || 'User',
              purpose: 'signup_email_otp',
              expiryMinutes: 10
            });
            if (!n8nResult.success) throw new Error(n8nResult.error || 'n8n delivery failed');
            console.log(`📧 Signup OTP sent via n8n to new user: ${identifier}`);
          } catch (n8nErr) {
            console.error('⚠️  Signup OTP all delivery methods failed:', n8nErr.message);
            return res.status(502).json({ success: false, message: 'Failed to send OTP email. Please try again.' });
          }
        }

        const responseData = {
          otpId: signupOtp.id,
          expiresAt: signupOtp.expiresAt,
          expiresIn: '10 minutes',
          deliveryMethod: 'email',
          sentTo: identifier.replace(/(.{2})(.*)(@.*)/, '$1****$3'),
          isNewUser: true
        };
        if (includeOtp) responseData.otp = signupOtp.code;

        return res.status(200).json({
          success: true,
          message: 'OTP sent to your email. Please verify to complete registration.',
          data: responseData
        });
      }

      // SECURITY: Always return same response structure whether user exists or not
      // This prevents user enumeration attacks
      if (!user || user.status === 'blocked') {
        // Return consistent response structure even if user doesn't exist
        const responseData = {
          otpId: placeholderOtpId,
          expiresAt: placeholderExpiresAt,
          expiresIn: '5 minutes',
          deliveryMethod: isEmail ? 'email' : 'whatsapp',
          sentTo: isEmail ? identifier.replace(/(.{2})(.*)(@.*)/, '$1****$3') : 'hidden for security'
        };
        
        return res.status(200).json({
          success: true,
          message: 'If an account exists, an OTP has been sent.',
          data: responseData
        });
      }

      // Generate OTP for login
      const OTP = await import('../models/otp.model.intelligent.js');
      const otp = await OTP.default.generate({
        email: user.email,
        phone: user.phoneNumber,
        purpose: 'login_otp',
        expiryMinutes: 5
      });

      // Track actual delivery method used (not just intended)
      let actualDeliveryMethod = deliveryMethod;
      let deliverySuccess = false;

      // Prefer direct delivery first, then fallback to n8n
      const useN8n = process.env.USE_N8N_OTP !== 'false';
      let directError = null;

      if (deliveryMethod === 'email') {
        try {
          await signupVerificationService.sendOTPViaEmail({
            email: user.email,
            firstName: user.firstName || 'User'
          }, otp.code);
          console.log(`📧 Login OTP sent via Email (direct) to ${user.email}`);
          actualDeliveryMethod = 'email';
          deliverySuccess = true;
        } catch (emailError) {
          directError = emailError;
          console.warn('⚠️  Direct email delivery failed, trying n8n:', emailError.message);
        }
      } else {
        try {
          await signupVerificationService.sendOTPViaWhatsApp({
            phoneNumber: user.phoneNumber,
            firstName: user.firstName || 'User',
            email: user.email
          }, otp.code);
          console.log(`📱 ✅ Login OTP sent via WhatsApp to ${user.phoneNumber}`);
          actualDeliveryMethod = 'whatsapp';
          deliverySuccess = true;
        } catch (whatsappError) {
          directError = whatsappError;
          console.warn(`⚠️  WhatsApp delivery error (${whatsappError.code}): ${whatsappError.message}`);
        }
      }

      if (!deliverySuccess && useN8n) {
        try {
          console.log('📤 Attempting login OTP delivery via n8n...');
          const n8nResult = deliveryMethod === 'email'
            ? await n8nOTPService.sendEmailOTP({
                email: user.email,
                otp: otp.code,
                name: user.firstName || 'User',
                purpose: 'login_otp',
                expiryMinutes: 5
              })
            : await n8nOTPService.sendWhatsAppOTP({
                phone: user.phoneNumber,
                otp: otp.code,
                name: user.firstName || 'User',
                purpose: 'login_otp',
                expiryMinutes: 5
              });

          if (n8nResult.success) {
            deliverySuccess = true;
            actualDeliveryMethod = `${deliveryMethod}_via_n8n`;
            console.log(`✅ Login OTP sent via n8n (${deliveryMethod})`);
          } else {
            console.warn('⚠️  n8n delivery failed');
          }
        } catch (n8nError) {
          console.warn('⚠️  n8n error:', n8nError.message);
        }
      }

      if (!deliverySuccess) {
        throw directError || new Error('OTP delivery failed');
      }

      // Mask email/phone for response
      const maskedIdentifier = isEmail
        ? user.email.replace(/(.{2})(.*)(@.*)/, '$1****$3')
        : user.phoneNumber.replace(/(\d{2})(\d+)(\d{2})/, '$1******$3');

      const responseData = {
        otpId: otp.id,
        expiresAt: otp.expiresAt,
        expiresIn: '5 minutes',
        deliveryMethod: actualDeliveryMethod,
        sentTo: maskedIdentifier
      };

      if (includeOtp) {
        responseData.otp = otp.code;
      }

      return res.status(200).json({
        success: true,
        message: 'If an account exists, an OTP has been sent.',
        data: responseData
      });
    } catch (error) {
      console.error('Send login OTP error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to send OTP',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

/**
 * @swagger
 * /api/users/login/verify-otp:
 *   post:
 *     summary: Verify OTP and login
 *     description: Verify OTP and receive JWT token for passwordless login
 *     tags: [Authentication]
 */
router.post(
  "/login/verify-otp",
  authLimiter,
  [
    body().custom((_, { req }) => {
      const rawIdentifier = req.body?.identifier ?? req.body?.email ?? req.body?.phoneNumber ?? req.body?.phone;
      if (!rawIdentifier || !String(rawIdentifier).trim()) {
        throw new Error("Email or phone number is required");
      }
      return true;
    }),
    body("code").optional().isLength({ min: 6, max: 6 }).withMessage("OTP must be 6 digits"),
    body("otp").optional().isLength({ min: 6, max: 6 }).withMessage("OTP must be 6 digits"),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const identifier = String(
      req.body?.identifier ?? req.body?.email ?? req.body?.phoneNumber ?? req.body?.phone
    ).trim();
    // Accept both 'code' (web) and 'otp' (mobile app) field names
    const code = req.body.code || req.body.otp;

    if (!code || code.length !== 6) {
      return res.status(400).json({ success: false, message: 'OTP must be 6 digits' });
    }

    try {
      // Determine if identifier is email or phone
      const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier);
      
      let user;
      if (isEmail) {
        user = await userModel.findOne({ where: { email: identifier } });
      } else {
        const normalizedDigits = identifier.replace(/[^0-9]/g, '');
        const cleanPhone = normalizedDigits.length > 10
          ? normalizedDigits.slice(-10)
          : normalizedDigits;
        user = await userModel.findOne({
          where: sequelizeWhere(
            fn("regexp_replace", col("phoneNumber"), "[^0-9]", "", "g"),
            cleanPhone
          ),
        });
      }

      // --- NEW USER (signup) path ---
      // If user doesn't exist, this may be a signup OTP verification from mobile app.
      // Try to verify against signup OTP purposes and return a 'requiresRegistration' response.
      if (!user) {
        const OTP = await import('../models/otp.model.intelligent.js');
        const signupPurpose = isEmail ? 'signup_email_otp' : 'signup_whatsapp_otp';
        const signupVerify = await OTP.default.verify({
          email: isEmail ? identifier : undefined,
          phone: isEmail ? undefined : identifier,
          code,
          purpose: signupPurpose
        });

        if (signupVerify.success) {
          // Mark the appropriate channel as verified in the signup cache
          const verificationKey = isEmail
            ? `signup_verify:${identifier}:`  // partial key; full key needs phone too
            : null;
          // Best-effort cache update; registration/verify-otp will do the authoritative check
          console.log(`✅ Signup OTP verified for new user (${signupPurpose}): ${identifier}`);
          return res.status(200).json({
            success: true,
            requiresRegistration: true,
            message: 'OTP verified. Please complete your registration.',
            data: {
              otpVerified: true,
              channel: isEmail ? 'email' : 'phone',
              identifier
            }
          });
        }

        return res.status(400).json({
          success: false,
          message: 'Invalid or expired OTP'
        });
      }

      // --- EXISTING USER (login) path ---
      const OTP = await import('../models/otp.model.intelligent.js');
      const verifyResult = await OTP.default.verify({
        email: user.email,
        phone: user.phoneNumber,
        code,
        purpose: 'login_otp'
      });

      if (!verifyResult.success) {
        // Audit failed login attempt
        await auditLoginAttempt(req, user.id, user.email, false, 'Invalid OTP');
        
        return res.status(400).json({
          success: false,
          message: 'Invalid or expired OTP'
        });
      }

      const isRenewalExemptUser = isMembershipRenewalExemptEmail(user.email);

      await tryAutoActivateCorporateEmployeeForLogin(user);

      if ((user.status !== 'active' || user.isActive === false) && !isRenewalExemptUser) {
        await auditLoginAttempt(req, user.id, user.email, false, 'Inactive user attempted OTP login');
        const details = await buildInactiveAccountContext(user.id);
        return res.status(403).json({
          success: false,
          code: 'ACCOUNT_INACTIVE',
          message: details.reasonCode === 'MEMBERSHIP_EXPIRED'
            ? 'Your membership has expired. Please renew to continue.'
            : details.reasonCode === 'NO_ACTIVE_MEMBERSHIP'
            ? 'No active membership plan found. Please choose a plan to continue.'
            : 'Account is inactive. Please contact support.',
          details
        });
      }

      if (isRenewalExemptUser && user.status !== 'active') {
        await userModel.update({ status: 'active' }, { where: { id: user.id } });
        user.status = 'active';
      }

      // Generate JWT Token
      const token = generateAuthTokenForUser(user);

      // Audit successful login
      await auditLoginAttempt(req, user.id, user.email, true, 'OTP Login');

      console.log(`✅ User ${user.email} logged in via OTP`);

      return res.status(200).json({
        success: true,
        message: 'Login successful',
        token,
        user: {
          id: user.id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          phoneNumber: user.phoneNumber,
          dateOfBirth: user.dateOfBirth,
          gender: user.gender,
          role: user.role || 'user',
          corporateId: user.corporateId || null
        }
      });
    } catch (error) {
      console.error('Login OTP verification error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to verify OTP',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

/**
 * @swagger
 * /api/users/profile:
 *   get:
 *     summary: Get user profile
 *     description: Retrieve authenticated user's profile information
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User profile retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
router.get("/profile", authUser, getUserProfile);

// Update user online status
router.put("/status", updateUserStatus);

router.get("/available", getAvailableUsers);

const profileImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];

const validateProfileImageType = (contentType) => profileImageTypes.includes(contentType);

/**
 * @route   POST /api/users/profile-picture/presign
 * @desc    Create presigned URL for profile picture upload
 * @access  Private
 */
router.post("/profile-picture/presign", authUser, [
  body('fileName').notEmpty().withMessage('fileName is required'),
  body('contentType').notEmpty().withMessage('contentType is required')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  try {
    const { fileName, contentType } = req.body;
    if (!validateProfileImageType(contentType)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid file type. Only JPEG, PNG, GIF, and WebP images are allowed'
      });
    }

    const tenantId = req.tenantId || req.user.organization_id || null;
    const keyPrefix = buildProfileKeyPrefix(tenantId, req.user.id).replace(/\/$/, '');

    const presign = await createPresignedUpload({
      keyPrefix,
      fileName,
      contentType,
      tenantId,
      userId: req.user.id,
      metadata: { kind: 'profile_picture' }
    });

    return res.status(200).json({
      success: true,
      message: 'Presigned upload URL generated',
      data: presign,
      uploadUrl: presign.uploadUrl,
      fileKey: presign.fileKey,
    });
  } catch (error) {
    console.error('Profile picture presign error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to generate presigned URL',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/users/profile-picture/confirm
 * @desc    Save profile picture after S3 upload
 * @access  Private
 */
router.post("/profile-picture/confirm", authUser, async (req, res) => {
  const fileKey = req.body.fileKey || req.body.key;
  const fileName = req.body.fileName || req.body.name;
  const fileSize = req.body.fileSize ?? req.body.size;
  const mimeType = req.body.mimeType || req.body.contentType;

  if (!fileKey || !mimeType) {
    return res.status(400).json({
      success: false,
      message: 'fileKey and mimeType are required'
    });
  }

  try {
    if (!validateProfileImageType(mimeType)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid file type. Only JPEG, PNG, GIF, and WebP images are allowed'
      });
    }

    const tenantId = req.tenantId || req.user.organization_id || null;
    const expectedPrefix = buildProfileKeyPrefix(tenantId, req.user.id);
    if (!fileKey.startsWith(expectedPrefix)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid file key for user'
      });
    }

    const bucket = getUploadsBucket();
    const fileUrl = buildPublicFileUrl(fileKey, bucket);

    const user = await userModel.findByPk(req.user.id);
    user.profileImage = fileUrl;
    await user.save();

    return res.status(200).json({
      success: true,
      message: 'Profile picture saved successfully',
      profileImage: user.profileImage,
      data: {
        profileImage: user.profileImage,
        fileKey,
        fileName,
        fileSize,
      }
    });
  } catch (error) {
    console.error('Profile picture confirm error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to save profile picture',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/users/profile-picture
 * @desc    Upload profile picture
 * @access  Private
 */
router.post("/profile-picture", authUser, async (req, res) => {
  try {
    const profilePicture = req.files?.profilePicture || req.files?.file;
    if (!profilePicture) {
      return res.status(400).json({
        success: false,
        message: "No file uploaded"
      });
    }
    
    // Validate file type
    if (!profileImageTypes.includes(profilePicture.mimetype)) {
      return res.status(400).json({
        success: false,
        message: "Invalid file type. Only JPEG, PNG, GIF, and WebP images are allowed"
      });
    }
    
    // Validate file size (5MB max)
    const maxSize = 5 * 1024 * 1024;
    if (profilePicture.size > maxSize) {
      return res.status(400).json({
        success: false,
        message: "File too large. Maximum size is 5MB"
      });
    }
    
    // Upload to MinIO with AV scan
    const { url: minioUrl } = await uploadToMinio({
      buffer: profilePicture.data,
      originalName: profilePicture.name,
      mimeType: profilePicture.mimetype,
      keyPrefix: `uploads/profiles/${req.user.id}`,
    });
    
    // Update user profile with MinIO URL
    const user = await userModel.findByPk(req.user.id);
    user.profileImage = minioUrl;
    await user.save();
    
    res.json({
      success: true,
      message: "Profile picture uploaded successfully",
      profileImage: user.profileImage
    });
  } catch (error) {
    if (error.code === 'AV_SCAN_UNAVAILABLE') {
      return res.status(503).json({
        success: false,
        code: 'AV_SCAN_UNAVAILABLE',
        message: 'Profile picture scanning is temporarily unavailable. Please retry shortly.'
      });
    }
    if (error.code === 'MALWARE_DETECTED') {
      const detail = error.avResult?.detail || '';
      const threat = detail.replace(/^.*:\s*/, '').replace(/\s*FOUND\s*$/, '').trim() || 'Unknown threat';
      return res.status(400).json({
        success: false,
        code: 'MALWARE_DETECTED',
        message: 'File rejected: malware detected in uploaded file',
        threat
      });
    }
    console.error('Profile picture upload error:', error);
    res.status(500).json({
      success: false,
      message: "Failed to upload profile picture",
      error: error.message
    });
  }
});

/**
 * @route   PUT /api/users/profile
 * @desc    Update user profile (including ABHA ID)
 * @access  Private
 */
router.put("/profile", authUser, async (req, res) => {
  try {
    const { firstName, lastName, phoneNumber, abhaHealthId, dateOfBirth, gender, ...otherFields } = req.body;

    // Employment and sponsored-benefit identity is roster-managed. A patient must
    // never be able to create or alter an employer relationship from profile edit.
    const protectedEmploymentFields = ['employerName', 'employeeId', 'corporateId', 'membershipType', 'isCorporate'];
    const attemptedEmploymentWrite = protectedEmploymentFields.find((field) =>
      Object.prototype.hasOwnProperty.call(req.body || {}, field)
    );
    if (attemptedEmploymentWrite) {
      return res.status(403).json({
        success: false,
        code: 'employment_identity_managed',
        message: 'Employment and corporate-benefit details are managed by your employer. Contact your HR administrator for changes.'
      });
    }
    
    const user = await userModel.findByPk(req.user.id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }
    
    // Check if ABHA ID already exists
    if (abhaHealthId && abhaHealthId !== user.abhaHealthId) {
      const existingUser = await userModel.findOne({
        where: { abhaHealthId }
      });
      
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: "This ABHA Health ID is already registered"
        });
      }
    }
    
    // Validate gender if provided
    if (gender && !['Male', 'Female', 'Other'].includes(gender)) {
      return res.status(400).json({
        success: false,
        message: "Gender must be Male, Female, or Other"
      });
    }
    
    // Update fields
    if (firstName) user.firstName = firstName;
    if (lastName) user.lastName = lastName;
    if (phoneNumber) user.phoneNumber = phoneNumber;
    if (abhaHealthId !== undefined) user.abhaHealthId = abhaHealthId;
    if (dateOfBirth) user.dateOfBirth = dateOfBirth;
    if (gender) user.gender = gender;
    
    // Update other allowed fields
    const allowedFields = ['bloodType', 'allergies', 'medications', 'chronicConditions', 'medicalHistory', 'height', 'weight', 'familyHistory', 'personalHistory'];
    allowedFields.forEach(field => {
      if (otherFields[field] !== undefined) {
        user[field] = otherFields[field];
      }
    });
    
    await user.save();
    
    // Reload user to get fresh data
    await user.reload();
    
    // Calculate age
    let age = null;
    if (user.dateOfBirth) {
      const birthDate = new Date(user.dateOfBirth);
      const today = new Date();
      age = today.getFullYear() - birthDate.getFullYear();
      const monthDiff = today.getMonth() - birthDate.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age--;
      }
    }
    
    res.json({
      success: true,
      message: "Profile updated successfully",
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phoneNumber: user.phoneNumber,
        dateOfBirth: user.dateOfBirth,
        age: age,
        gender: user.gender,
        abhaHealthId: user.abhaHealthId,
        profileImage: user.profileImage,
        employerName: user.employerName,
        employeeId: user.employeeId,
        corporateId: user.corporateId,
        membershipType: user.membershipType,
        bloodType: user.bloodType,
        height: user.height,
        weight: user.weight,
        allergies: user.allergies,
        medications: user.medications,
        chronicConditions: user.chronicConditions,
        medicalHistory: user.medicalHistory,
        familyHistory: user.familyHistory,
        personalHistory: user.personalHistory
      }
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      message: "Failed to update profile",
      error: error.message
    });
  }
});

/**
 * @route   POST /api/users/forgot-password
 * @desc    Request password reset OTP via Email, SMS, and WhatsApp
 * @access  Public
 */
const forgotPasswordValidators = [
  body("email").optional().isEmail().normalizeEmail().withMessage("Must be a valid email"),
  body("phone").optional().matches(/^\+?[1-9]\d{1,14}$/).withMessage("Invalid phone format"),
  body("userType").optional().isIn(['user', 'doctor', 'team']).withMessage("User type must be 'user', 'doctor', or 'team'")
];

const forgotPasswordHandler = async (req, res) => {
  try {
    const { email, phone, userType = 'user' } = req.body;

    // QA-BUG-006: validators were optional so invalid email slipped through
    const valErrors = validationResult(req);
    if (!valErrors.isEmpty()) {
      return res.status(400).json({ success: false, errors: valErrors.array() });
    }

    // Require at least email or phone
    if (!email && !phone) {
      return res.status(400).json({
        success: false,
        message: 'Email or phone number is required'
      });
    }

    // Request password reset with OTP
    const result = await passwordResetService.requestPasswordReset({
      email,
      phone,
      userType
    });

    if (!result?.success) {
      const statusByCode = {
        EMAIL_NOT_FOUND: 404,
        RATE_LIMIT_EXCEEDED: 429,
        ACCOUNT_INACTIVE: 403,
      };
      const status = statusByCode[result?.code] || 400;
      return res.status(status).json(result);
    }

    return res.status(200).json(result);

  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process password reset request'
    });
  }
};

router.post("/forgot-password", forgotPasswordValidators, forgotPasswordHandler);

// Backward-compatible alias used by older/mobile clients.
router.post("/forgot-password/request", forgotPasswordValidators, forgotPasswordHandler);

/**
 * @route   POST /api/users/verify-reset-otp
 * @desc    Verify OTP and get reset token
 * @access  Public
 */
const verifyResetOtpValidators = [
  body("email").optional().isEmail().withMessage("Must be a valid email"),
  body("phone").optional().matches(/^\+?[1-9]\d{1,14}$/).withMessage("Invalid phone format"),
  body("code").optional().isLength({ min: 6, max: 6 }).withMessage("OTP must be 6 digits"),
  body("otp").optional().isLength({ min: 6, max: 6 }).withMessage("OTP must be 6 digits"),
  body("userType").optional().isIn(['user', 'doctor']).withMessage("User type must be 'user' or 'doctor'")
];

const verifyResetOtpHandler = async (req, res) => {
  try {
    const { email, phone, userType = 'user' } = req.body;
    // Accept both 'code' (web) and 'otp' (mobile app) field names
    const code = req.body.code || req.body.otp;

    if (!code || code.length !== 6) {
      return res.status(400).json({
        success: false,
        message: 'OTP must be 6 digits'
      });
    }

    if (!email && !phone) {
      return res.status(400).json({
        success: false,
        message: 'Email or phone number is required'
      });
    }

    const verifyFn =
      typeof passwordResetService.verifyResetOtp === 'function'
        ? passwordResetService.verifyResetOtp.bind(passwordResetService)
        : passwordResetService.verifyOTPAndGenerateToken.bind(passwordResetService);

    const result = await verifyFn({
      email,
      phone,
      code,
      userType
    });

    if (!result?.success) {
      const statusByCode = {
        INVALID_OTP: 400,
        OTP_ATTEMPTS_EXCEEDED: 429,
        ACCOUNT_INACTIVE: 403,
      };
      const status = statusByCode[result?.code] || 400;
      return res.status(status).json(result);
    }

    const resetToken = result?.resetToken || result?.data?.resetToken;
    return res.status(200).json({
      ...result,
      resetToken,
    });

  } catch (error) {
    console.error('Verify OTP error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify OTP'
    });
  }
};

router.post("/verify-reset-otp", verifyResetOtpValidators, verifyResetOtpHandler);

// Backward-compatible alias used by older/mobile clients.
router.post("/forgot-password/verify", verifyResetOtpValidators, verifyResetOtpHandler);

/**
 * @route   POST /api/users/reset-password
 * @desc    Reset password with verified token
 * @access  Public
 */
const resetPasswordValidators = [
  body("resetToken").notEmpty().withMessage("Reset token is required"),
  body("newPassword").isLength({ min: 6 }).withMessage("Password must be at least 6 characters long"),
  body("userType").optional().isIn(['user', 'doctor']).withMessage("User type must be 'user' or 'doctor'")
];

const resetPasswordHandler = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { email, resetToken, newPassword, userType = 'user' } = req.body;

    const result = await passwordResetService.resetPassword({
      email,
      resetToken,
      newPassword,
      userType,
    });

    if (!result?.success) {
      const statusByCode = {
        ACCOUNT_INACTIVE: 403,
        INVALID_TOKEN: 400,
        TOKEN_EXPIRED: 400,
      };
      const status = statusByCode[result?.code] || 400;
      return res.status(status).json(result);
    }

    return res.status(200).json(result);

  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reset password'
    });
  }
};

router.post("/reset-password", resetPasswordValidators, resetPasswordHandler);

// Backward-compatible alias used by older/mobile clients.
router.post("/forgot-password/reset", resetPasswordValidators, resetPasswordHandler);

/**
 * @route   POST /api/users/change-password
 * @desc    Change password (for first-time login or regular password change)
 * @access  Private (requires authentication)
 */
router.post('/change-password', authUser, [
  body('currentPassword')
    .optional()
    .isLength({ min: 6 })
    .withMessage('Current password must be at least 6 characters'),
  body('newPassword')
    .isLength({ min: 8 })
    .withMessage('New password must be at least 8 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('Password must contain uppercase, lowercase, number, and special character'),
  body('confirmPassword')
    .custom((value, { req }) => value === req.body.newPassword)
    .withMessage('Passwords do not match')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const { currentPassword, newPassword } = req.body;
    const userId = req.user.id;

    // Fetch user from database
    const user = await userModel.findByPk(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Parse metadata
    let metadata = user.metadata;
    if (typeof metadata === 'string') {
      try {
        metadata = JSON.parse(metadata);
      } catch (e) {
        metadata = {};
      }
    }

    // Check if this is a forced password change (first login)
    const isFirstLogin = metadata && metadata.requirePasswordChange === true;

    // If not first login, verify current password
    if (!isFirstLogin && currentPassword) {
      const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
      if (!isPasswordValid) {
        return res.status(401).json({
          success: false,
          message: 'Current password is incorrect'
        });
      }
    }

    // Ensure new password is different from current password
    const isSamePassword = await bcrypt.compare(newPassword, user.password);
    if (isSamePassword) {
      return res.status(400).json({
        success: false,
        message: 'New password must be different from current password'
      });
    }

    // Update password and metadata.
    // NOTE: Do NOT pre-hash here — the User model's beforeUpdate hook (user.model.intelligent.js)
    // hashes the password automatically. Pre-hashing causes double-hashing and breaks login.
    const safeMetadata = metadata || {};
    safeMetadata.passwordChangedAt = new Date().toISOString();
    if (safeMetadata.requirePasswordChange) {
      safeMetadata.requirePasswordChange = false;
    }

    await user.update({
      password: newPassword,
      metadata: safeMetadata
    });

    // Log the password change
    console.log(`✅ Password changed for user: ${user.email} (ID: ${userId})`);

    // Fire-and-forget security alert — does not block the response
    const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || 'Unknown';
    getPasswordAlertService()
      .then((svc) => svc.sendPasswordChangedEmail({
        email: user.email,
        firstName: user.firstName || 'User',
        changeDateTime: new Date().toLocaleString('en-IN'),
        changeIp: clientIp,
      }))
      .catch((err) => console.error('[change-password] Alert email failed:', err.message));

    res.status(200).json({
      success: true,
      message: isFirstLogin
        ? 'Password changed successfully. You can now access all features.'
        : 'Password changed successfully.',
      firstLoginComplete: isFirstLogin
    });

  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ success: false, message: 'Failed to change password', error: safeErr(error) });
  }
});

/**
 * @route   POST /api/users/profile-picture/from-url
 * @desc    Import profile picture from external URL (Google, Facebook, etc.)
 * @access  Private
 */
router.post('/profile-picture/from-url', authUser, [
  body('imageUrl').isURL({ protocols: ['https'] }).withMessage('Must be a valid HTTPS URL')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { imageUrl } = req.body;

    // Only allow known trusted domains for social photo import
    const allowedHosts = [
      'lh3.googleusercontent.com',
      'lh4.googleusercontent.com',
      'lh5.googleusercontent.com',
      'lh6.googleusercontent.com',
      'graph.facebook.com',
      'scontent.fbom',
      'avatars.githubusercontent.com',
      'pbs.twimg.com',
      'media.licdn.com',
      'platform-lookaside.fbsbx.com',
    ];
    let urlHost;
    try {
      urlHost = new URL(imageUrl).hostname;
    } catch {
      return res.status(400).json({ success: false, message: 'Invalid URL' });
    }
    const isTrusted = allowedHosts.some(h => urlHost === h || urlHost.endsWith('.' + h));
    if (!isTrusted) {
      return res.status(400).json({
        success: false,
        message: 'URL must be from a trusted social provider (Google, Facebook, GitHub, LinkedIn)'
      });
    }

    // Fetch the image
    const imgResponse = await fetch(imageUrl, {
      headers: { 'User-Agent': 'Mediczy-App/1.0' },
      signal: AbortSignal.timeout(8000)
    });
    if (!imgResponse.ok) {
      return res.status(400).json({ success: false, message: 'Could not fetch image from URL' });
    }
    const contentType = imgResponse.headers.get('content-type') || '';
    if (!contentType.startsWith('image/')) {
      return res.status(400).json({ success: false, message: 'URL does not point to an image' });
    }
    const buffer = Buffer.from(await imgResponse.arrayBuffer());
    if (buffer.length > 5 * 1024 * 1024) {
      return res.status(400).json({ success: false, message: 'Image too large (max 5MB)' });
    }

    const ext = contentType.split('/')[1]?.split(';')[0] || 'jpg';
    const { url: minioUrl } = await uploadToMinio({
      buffer,
      originalName: `social-photo-${req.user.id}.${ext}`,
      mimeType: contentType.split(';')[0],
      keyPrefix: `uploads/profiles/${req.user.id}`,
    });

    const user = await userModel.findByPk(req.user.id);
    user.profileImage = minioUrl;
    await user.save();

    return res.json({ success: true, profileImage: minioUrl, message: 'Profile photo imported successfully' });
  } catch (error) {
    console.error('Profile picture from-url error:', error);
    return res.status(500).json({ success: false, message: 'Failed to import profile picture' });
  }
});

/**
 * @route   GET /api/users/settings
 * @desc    Get user app settings (notifications, language, timezone, privacy)
 * @access  Private
 */
router.get('/settings', authUser, async (req, res) => {
  try {
    const user = await userModel.findByPk(req.user.id, {
      attributes: ['id', 'metadata']
    });
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    let meta = user.metadata || {};
    if (typeof meta === 'string') { try { meta = JSON.parse(meta); } catch { meta = {}; } }

    const settings = {
      notifications: {
        email:    meta.settings?.notifications?.email    ?? true,
        sms:      meta.settings?.notifications?.sms      ?? true,
        push:     meta.settings?.notifications?.push     ?? true,
        whatsapp: meta.settings?.notifications?.whatsapp ?? false,
        appointment_reminders: meta.settings?.notifications?.appointment_reminders ?? true,
        lab_results:           meta.settings?.notifications?.lab_results           ?? true,
        prescription_ready:    meta.settings?.notifications?.prescription_ready    ?? true,
        health_tips:           meta.settings?.notifications?.health_tips           ?? true,
        billing_alerts:        meta.settings?.notifications?.billing_alerts        ?? true,
        ai_insights:           meta.settings?.notifications?.ai_insights           ?? false,
      },
      language:       meta.settings?.language       || 'en',
      timezone:       meta.settings?.timezone       || 'Asia/Kolkata',
      theme:          meta.settings?.theme          || 'system',
      privacy: {
        share_data_for_research: meta.settings?.privacy?.share_data_for_research ?? false,
        show_online_status:      meta.settings?.privacy?.show_online_status      ?? true,
        allow_doctor_notes:      meta.settings?.privacy?.allow_doctor_notes      ?? true,
      },
      accessibility: {
        font_size:    meta.settings?.accessibility?.font_size    || 'medium',
        high_contrast: meta.settings?.accessibility?.high_contrast ?? false,
      }
    };

    return res.json({ success: true, settings });
  } catch (error) {
    console.error('Get settings error:', error);
    return res.status(500).json({ success: false, message: 'Failed to get settings' });
  }
});

/**
 * @route   PUT /api/users/settings
 * @desc    Update user app settings
 * @access  Private
 */
router.put('/settings', authUser, async (req, res) => {
  try {
    const user = await userModel.findByPk(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    let meta = user.metadata || {};
    if (typeof meta === 'string') { try { meta = JSON.parse(meta); } catch { meta = {}; } }

    const allowed = ['notifications', 'language', 'timezone', 'theme', 'privacy', 'accessibility'];
    const incoming = req.body;
    if (!meta.settings) meta.settings = {};
    allowed.forEach(key => {
      if (incoming[key] !== undefined) {
        if (typeof incoming[key] === 'object' && !Array.isArray(incoming[key])) {
          meta.settings[key] = { ...(meta.settings[key] || {}), ...incoming[key] };
        } else {
          meta.settings[key] = incoming[key];
        }
      }
    });

    await user.update({ metadata: JSON.stringify(meta) });
    return res.json({ success: true, message: 'Settings updated', settings: meta.settings });
  } catch (error) {
    console.error('Update settings error:', error);
    return res.status(500).json({ success: false, message: 'Failed to update settings' });
  }
});

/**
 * @route   GET /api/users/security
 * @desc    Get security status: last login, MFA, session info, password age
 * @access  Private
 */
router.get('/security', authUser, async (req, res) => {
  try {
    const user = await userModel.findByPk(req.user.id, {
      attributes: ['id', 'email', 'metadata', 'createdAt']
    });
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    let meta = user.metadata || {};
    if (typeof meta === 'string') { try { meta = JSON.parse(meta); } catch { meta = {}; } }

    return res.json({
      success: true,
      security: {
        last_login_at:       meta.lastLoginAt       || null,
        last_login_ip:       meta.lastLoginIp       || null,
        mfa_enabled:         meta.mfaEnabled        || false,
        password_changed_at: meta.passwordChangedAt || null,
        account_created_at:  user.createdAt,
        token_version:       meta.tokenVersion      || 0,
        login_history:       (meta.loginHistory     || []).slice(0, 10),
        connected_accounts: {
          google:    !!meta.googleId,
          facebook:  !!meta.facebookId,
          apple:     !!meta.appleId,
        }
      }
    });
  } catch (error) {
    console.error('Get security error:', error);
    return res.status(500).json({ success: false, message: 'Failed to get security info' });
  }
});

/**
 * @route   POST /api/users/security/revoke-sessions
 * @desc    Revoke all active sessions by bumping token version (forces re-login everywhere)
 * @access  Private
 */
router.post('/security/revoke-sessions', authUser, async (req, res) => {
  try {
    const user = await userModel.findByPk(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    let meta = user.metadata || {};
    if (typeof meta === 'string') { try { meta = JSON.parse(meta); } catch { meta = {}; } }

    meta.tokenVersion = (meta.tokenVersion || 0) + 1;
    meta.sessionsRevokedAt = new Date().toISOString();
    await user.update({ metadata: JSON.stringify(meta) });

    console.log(`🔒 All sessions revoked for user ${user.email} (token version: ${meta.tokenVersion})`);
    return res.json({ success: true, message: 'All sessions have been signed out. Please log in again.' });
  } catch (error) {
    console.error('Revoke sessions error:', error);
    return res.status(500).json({ success: false, message: 'Failed to revoke sessions' });
  }
});

/**
 * @route   GET /api/users/security/sessions
 * @desc    List active sessions for the current user (current device shown, history from metadata)
 * @access  Private
 */
router.get('/security/sessions', authUser, async (req, res) => {
  try {
    const user = await userModel.findByPk(req.user.id, { attributes: ['id', 'metadata'] });
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    let meta = user.metadata || {};
    if (typeof meta === 'string') { try { meta = JSON.parse(meta); } catch { meta = {}; } }

    // Build session list from login history stored in metadata
    const loginHistory = Array.isArray(meta.loginHistory) ? meta.loginHistory : [];
    const sessions = loginHistory.slice(0, 5).map((entry, i) => ({
      id: `session-${i}`,
      deviceName: entry.deviceName || entry.userAgent || 'Unknown device',
      ip: entry.ip || entry.loginIp || 'Unknown',
      lastActiveAt: entry.at || entry.timestamp || null,
      isCurrent: i === 0, // most recent login is assumed current
    }));

    // Always include a "current session" entry even if history is empty
    if (sessions.length === 0) {
      sessions.push({
        id: 'session-current',
        deviceName: req.headers['user-agent']?.slice(0, 80) || 'This device',
        ip: req.ip || 'Unknown',
        lastActiveAt: new Date().toISOString(),
        isCurrent: true,
      });
    }

    return res.json({ success: true, sessions });
  } catch (error) {
    console.error('Get sessions error:', error);
    return res.status(500).json({ success: false, message: 'Failed to get sessions', error: safeErr(error) });
  }
});

/**
 * @route   DELETE /api/users/account
 * @desc    Request account deletion (soft delete with 30-day grace period)
 * @access  Private
 */
router.delete('/account', authUser, [
  body('confirmText').equals('DELETE').withMessage('Please type DELETE to confirm'),
  body('reason').optional().isString()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const user = await userModel.findByPk(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    let meta = user.metadata || {};
    if (typeof meta === 'string') { try { meta = JSON.parse(meta); } catch { meta = {}; } }

    const deletionScheduledAt = new Date();
    const deletionDate = new Date(deletionScheduledAt.getTime() + 30 * 24 * 60 * 60 * 1000);
    meta.accountDeletionRequested = true;
    meta.accountDeletionScheduledAt = deletionScheduledAt.toISOString();
    meta.accountDeletionDate = deletionDate.toISOString();
    meta.accountDeletionReason = req.body.reason || 'User requested';
    meta.tokenVersion = (meta.tokenVersion || 0) + 1;

    await user.update({ status: 'pending_deletion', metadata: JSON.stringify(meta) });

    console.log(`⚠️ Account deletion requested for ${user.email}, scheduled: ${deletionDate.toISOString()}`);
    return res.json({
      success: true,
      message: 'Account deletion scheduled. Your data will be permanently deleted on ' + deletionDate.toDateString() + '. You can cancel this by logging in before then.',
      deletionDate: deletionDate.toISOString()
    });
  } catch (error) {
    console.error('Account deletion error:', error);
    return res.status(500).json({ success: false, message: 'Failed to process account deletion' });
  }
});


// ─────────────────────────────────────────────────────────────────────────────
// MY PERSONAL INSURANCE POLICIES  (stored in user.metadata.personalPolicies[])
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @route  GET /api/users/my-insurances
 * @desc   List user's personally saved insurance policies
 * @access Private
 */
router.get('/my-insurances', authUser, async (req, res) => {
  try {
    const user = await userModel.findByPk(req.user.id, { attributes: ['id', 'metadata'] });
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    let meta = user.metadata || {};
    if (typeof meta === 'string') { try { meta = JSON.parse(meta); } catch { meta = {}; } }
    const policies = meta.personalPolicies || [];
    return res.json({ success: true, policies });
  } catch (err) {
    console.error('Get my-insurances error:', err);
    return res.status(500).json({ success: false, message: 'Failed to retrieve policies' });
  }
});

/**
 * @route  POST /api/users/my-insurances
 * @desc   Add a personal insurance policy (with optional document upload)
 * @access Private
 */
router.post('/my-insurances', authUser, async (req, res) => {
  try {
    const { insurerName, policyNumber, policyType, coverageAmount, premiumAmount, premiumFrequency, startDate, endDate, membersName, notes } = req.body;
    if (!insurerName || !policyNumber) {
      return res.status(400).json({ success: false, message: 'Insurer name and policy number are required' });
    }

    const user = await userModel.findByPk(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    let meta = user.metadata || {};
    if (typeof meta === 'string') { try { meta = JSON.parse(meta); } catch { meta = {}; } }
    if (!Array.isArray(meta.personalPolicies)) meta.personalPolicies = [];

    let documentUrl = null;
    const uploadedFile = req.files?.policyDocument;
    if (uploadedFile) {
      const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
      if (!allowedTypes.includes(uploadedFile.mimetype)) {
        return res.status(400).json({ success: false, message: 'Only PDF and image files are allowed' });
      }
      if (uploadedFile.size > 10 * 1024 * 1024) {
        return res.status(400).json({ success: false, message: 'File must be under 10MB' });
      }
      try {
        const { url } = await uploadToMinio({
          buffer: uploadedFile.data,
          originalName: uploadedFile.name,
          mimeType: uploadedFile.mimetype,
          keyPrefix: `users/${req.user.id}/insurances`,
        });
        documentUrl = url;
      } catch (uploadErr) {
        console.error('Insurance doc upload error:', uploadErr);
      }
    }

    const newPolicy = {
      id: crypto.randomUUID(),
      insurerName,
      policyNumber,
      policyType: policyType || 'Health',
      coverageAmount: coverageAmount ? parseFloat(coverageAmount) : null,
      premiumAmount: premiumAmount ? parseFloat(premiumAmount) : null,
      premiumFrequency: premiumFrequency || 'annual',
      startDate: startDate || null,
      endDate: endDate || null,
      membersName: membersName || null,
      notes: notes || null,
      documentUrl,
      createdAt: new Date().toISOString(),
    };

    meta.personalPolicies.push(newPolicy);
    user.metadata = meta;
    user.changed('metadata', true);
    await user.save();

    return res.status(201).json({ success: true, policy: newPolicy, message: 'Policy saved successfully' });
  } catch (err) {
    console.error('Add my-insurance error:', err);
    return res.status(500).json({ success: false, message: 'Failed to save policy' });
  }
});

/**
 * @route  DELETE /api/users/my-insurances/:policyId
 * @desc   Remove a personal insurance policy
 * @access Private
 */
router.delete('/my-insurances/:policyId', authUser, async (req, res) => {
  try {
    const { policyId } = req.params;
    const user = await userModel.findByPk(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    let meta = user.metadata || {};
    if (typeof meta === 'string') { try { meta = JSON.parse(meta); } catch { meta = {}; } }
    const before = (meta.personalPolicies || []).length;
    meta.personalPolicies = (meta.personalPolicies || []).filter(p => p.id !== policyId);
    if (meta.personalPolicies.length === before) {
      return res.status(404).json({ success: false, message: 'Policy not found' });
    }
    user.metadata = meta;
    user.changed('metadata', true);
    await user.save();
    return res.json({ success: true, message: 'Policy removed' });
  } catch (err) {
    console.error('Delete my-insurance error:', err);
    return res.status(500).json({ success: false, message: 'Failed to delete policy' });
  }
});

export default router;
