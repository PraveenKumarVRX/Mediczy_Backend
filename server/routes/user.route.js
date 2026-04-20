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
import { authLimiter } from "../middleware/rateLimiter.middleware.js";
import intelligentDb from "../utils/intelligentDbClient.js";
import OTP from "../models/otp.model.intelligent.js";
import { cache } from "../db/redis.js";
import {
  buildProfileKeyPrefix,
  buildPublicFileUrl,
  createPresignedUpload,
  getUploadsBucket
} from "../services/s3-presign.service.js";
import { uploadToMinio } from "../services/minio-upload.service.js";

const router = express.Router();

const SIGNUP_OTP_TTL_MINUTES = 10;
const SIGNUP_VERIFY_TTL_SECONDS = 15 * 60;

const normalizeEmail = (value) => String(value || "").trim().toLowerCase();
const normalizePhone = (value) => String(value || "").replace(/[^0-9]/g, "");
const buildSignupVerificationKey = (email, phoneNumber) => {
  return `signup:verify:${normalizeEmail(email)}:${normalizePhone(phoneNumber)}`;
};

/**
 * @swagger
 * /api/users/register/send-otp:
 *   post:
 *     summary: Send OTP for user registration
 *     description: Send separate OTPs to email and WhatsApp for verification before registration
 *     tags: [Users]
 */
router.post(
  "/register/send-otp",
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

      // Check if phone already exists
      const existingPhone = await userModel.findOne({ where: { phoneNumber } });
      if (existingPhone) {
        return res.status(409).json({ 
          success: false,
          message: "Phone number already registered" 
        });
      }

      const includeOtp = process.env.NODE_ENV === 'development' || process.env.OTP_DEBUG_RESPONSE === 'true';
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

      if (!deliveryChannels.email.sent || !deliveryChannels.whatsapp.sent) {
        return res.status(502).json({
          success: false,
          message: 'Failed to deliver OTP to all channels',
          data: { deliveryChannels }
        });
      }

      const responseData = {
        emailOtpId: emailOtp.id,
        whatsappOtpId: whatsappOtp.id,
        expiresAt: emailOtp.expiresAt,
        expiresIn: `${SIGNUP_OTP_TTL_MINUTES} minutes`,
        deliveryChannels
      };

      if (includeOtp) {
        responseData.emailOtp = emailOtp.code;
        responseData.whatsappOtp = whatsappOtp.code;
      }

      console.log('📧 Registration OTP sent via Email + WhatsApp:', { email, phoneNumber });

      return res.status(200).json({
        success: true,
        message: 'OTP sent successfully to your email and WhatsApp',
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
    body("code").isLength({ min: 6, max: 6 }).withMessage("OTP must be 6 digits")
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, phoneNumber, code } = req.body;

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
    body("code").isLength({ min: 6, max: 6 }).withMessage("OTP must be 6 digits")
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, phoneNumber, code } = req.body;

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
    body("password").isLength({ min: 4 }).withMessage("Password must be at least 4 characters long"),
    body("firstName").isLength({ min: 3, max: 20 }).withMessage("First name must be between 3 to 20 characters"),
    body("lastName").isLength({ min: 3, max: 20 }).withMessage("Last name must be between 3 to 20 characters"),
    body("dateOfBirth").isISO8601().withMessage("Must be a valid date in YYYY-MM-DD format"),
    body("gender").isIn(["Male", "Female", "Other"]).withMessage("Gender must be either Male, Female, or Other"),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, phoneNumber, password, firstName, lastName, dateOfBirth, gender } = req.body;

    try {
      const verificationKey = buildSignupVerificationKey(email, phoneNumber);
      const verificationState = await cache.get(verificationKey);

      if (!verificationState?.emailVerified || !verificationState?.phoneVerified) {
        return res.status(400).json({
          success: false,
          message: 'Email and WhatsApp OTP verification required'
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

      // Create user with verified email and phone
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
        status: 'active'
      });

      console.log('✅ New user registered with OTP verification:', newUser.id);

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

      // Trigger n8n workflow for user registration (best-effort)
      try {
        await n8nService.userRegistered({
          id: newUser.id,
          name: `${newUser.firstName} ${newUser.lastName}`.trim(),
          email: newUser.email,
          phone: newUser.phoneNumber,
          userType: 'patient'
        });
      } catch (n8nError) {
        console.error('Failed to trigger n8n user registration workflow:', n8nError);
      }

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
        if (!isEmail && !isPhone) {
          throw new Error('Must be a valid email or phone number');
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
  authLimiter,
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
    const includeOtp = process.env.NODE_ENV === 'development' || process.env.OTP_DEBUG_RESPONSE === 'true';

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

      // SECURITY: Always return same response structure whether user exists or not
      // This prevents user enumeration attacks
      if (!user || user.status === 'inactive' || user.status === 'blocked') {
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
    body("code")
      .isLength({ min: 6, max: 6 })
      .withMessage("OTP must be 6 digits"),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const identifier = String(
      req.body?.identifier ?? req.body?.email ?? req.body?.phoneNumber ?? req.body?.phone
    ).trim();
    const { code } = req.body;

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

      if (!user) {
        return res.status(400).json({
          success: false,
          message: 'Invalid or expired OTP'
        });
      }

      // Verify OTP
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
      data: presign
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
router.post("/profile-picture/confirm", authUser, [
  body('fileKey').notEmpty().withMessage('fileKey is required'),
  body('fileName').notEmpty().withMessage('fileName is required'),
  body('fileSize').isInt({ min: 1 }).withMessage('fileSize must be a number'),
  body('mimeType').notEmpty().withMessage('mimeType is required')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  try {
    const { fileKey, mimeType } = req.body;
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
      profileImage: user.profileImage
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
    if (!req.files || !req.files.profilePicture) {
      return res.status(400).json({
        success: false,
        message: "No file uploaded"
      });
    }
    
    const profilePicture = req.files.profilePicture;
    
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
    const { firstName, lastName, phoneNumber, abhaHealthId, dateOfBirth, gender, employerName, employeeId, corporateId, membershipType, ...otherFields } = req.body;
    
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
    
    // Update corporate employment fields
    if (employerName !== undefined) user.employerName = employerName;
    if (employeeId !== undefined) user.employeeId = employeeId;
    if (corporateId !== undefined) user.corporateId = corporateId;
    if (membershipType !== undefined) user.membershipType = membershipType;
    
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
router.post("/forgot-password", [
  body("email").optional().isEmail().withMessage("Must be a valid email"),
  body("phone").optional().matches(/^\+?[1-9]\d{1,14}$/).withMessage("Invalid phone format"),
  body("userType").optional().isIn(['user', 'doctor']).withMessage("User type must be 'user' or 'doctor'")
], async (req, res) => {
  try {
    const { email, phone, userType = 'user' } = req.body;

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

    res.json(result);

  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process password reset request'
    });
  }
});

/**
 * @route   POST /api/users/verify-reset-otp
 * @desc    Verify OTP and get reset token
 * @access  Public
 */
router.post("/verify-reset-otp", [
  body("email").optional().isEmail().withMessage("Must be a valid email"),
  body("phone").optional().matches(/^\+?[1-9]\d{1,14}$/).withMessage("Invalid phone format"),
  body("code").optional().isLength({ min: 6, max: 6 }).withMessage("OTP must be 6 digits"),
  body("otp").optional().isLength({ min: 6, max: 6 }).withMessage("OTP must be 6 digits"),
  body("userType").optional().isIn(['user', 'doctor']).withMessage("User type must be 'user' or 'doctor'")
], async (req, res) => {
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

    const result = await passwordResetService.verifyOTPAndGenerateToken({
      email,
      phone,
      code,
      userType
    });

    res.json(result);

  } catch (error) {
    console.error('Verify OTP error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify OTP'
    });
  }
});

/**
 * @route   POST /api/users/reset-password
 * @desc    Reset password with verified token
 * @access  Public
 */
router.post("/reset-password", [
  body("resetToken").notEmpty().withMessage("Reset token is required"),
  body("newPassword").isLength({ min: 6 }).withMessage("Password must be at least 6 characters long"),
  body("userType").optional().isIn(['user', 'doctor']).withMessage("User type must be 'user' or 'doctor'")
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { resetToken, newPassword, userType = 'user' } = req.body;

    // Hash the token to compare with stored hash
    const resetTokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');

    // Find account with valid reset token
    let account;
    let accountType;

    if (userType === 'doctor') {
      account = await doctorModel.findOne({
        where: {
          passwordResetToken: resetTokenHash,
        }
      });
      accountType = 'doctor';
    } else {
      account = await userModel.findOne({
        where: {
          passwordResetToken: resetTokenHash,
        }
      });
      accountType = 'user';
    }

    if (!account) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired reset token'
      });
    }

    // Check if token has expired
    if (account.passwordResetExpires && new Date() > new Date(account.passwordResetExpires)) {
      return res.status(400).json({
        success: false,
        message: 'Reset token has expired. Please request a new one.'
      });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password and clear reset token
    if (accountType === 'doctor') {
      await doctorModel.update(
        {
          password: hashedPassword,
          passwordResetToken: null,
          passwordResetExpires: null
        },
        { where: { id: account.id } }
      );
    } else {
      await userModel.update(
        {
          password: hashedPassword,
          passwordResetToken: null,
          passwordResetExpires: null
        },
        { where: { id: account.id } }
      );
    }

    res.json({
      success: true,
      message: 'Password has been reset successfully. You can now login with your new password.'
    });

  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reset password'
    });
  }
});

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

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password and remove password change requirement
    if (metadata && metadata.requirePasswordChange) {
      metadata.requirePasswordChange = false;
      metadata.passwordChangedAt = new Date().toISOString();
    }

    await user.update({
      password: hashedPassword,
      metadata: JSON.stringify(metadata)
    });

    // Log the password change
    console.log(`✅ Password changed for user: ${user.email} (ID: ${userId})`);

    res.status(200).json({
      success: true,
      message: isFirstLogin 
        ? 'Password changed successfully. You can now access all features.'
        : 'Password changed successfully.',
      firstLoginComplete: isFirstLogin
    });

  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to change password',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
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
      id: Date.now().toString(),
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

