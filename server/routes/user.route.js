import express from "express";
import { body, validationResult } from "express-validator";
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
import Consent from "../models/consent.model.intelligent.js";
import { auditLoginAttempt } from "../middleware/audit.middleware.js";
import { authLimiter } from "../middleware/rateLimiter.middleware.js";
import intelligentDb from "../utils/intelligentDbClient.js";

const router = express.Router();

/**
 * @swagger
 * /api/users/register/send-otp:
 *   post:
 *     summary: Send OTP for user registration
 *     description: Send OTP to email and WhatsApp for verification before registration
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

      // Send OTP via Email and WhatsApp using verified working service
      const result = await signupVerificationService.sendSignupOTP({
        email,
        phoneNumber,
        firstName: firstName || 'User'
      });

      console.log('📧 Registration OTP sent via Email + WhatsApp:', { email, phoneNumber });

      return res.status(200).json({
        success: true,
        message: 'OTP sent successfully to your email and WhatsApp',
        data: result.data
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
 * /api/users/register/verify-otp:
 *   post:
 *     summary: Verify OTP and complete registration
 *     description: Complete user registration after OTP verification
 *     tags: [Users]
 */
router.post(
  "/register/verify-otp",
  [
    body("email").isEmail().withMessage("Must be a valid email"),
    body("phoneNumber").isMobilePhone().withMessage("Must be a valid mobile phone number"),
    body("code").isLength({ min: 6, max: 6 }).withMessage("OTP must be 6 digits"),
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

    const { email, phoneNumber, code, password, firstName, lastName, dateOfBirth, gender } = req.body;

    try {
      // Verify OTP using signup verification service
      const verifyResult = await signupVerificationService.verifySignupOTP({
        email,
        phoneNumber,
        code
      });

      if (!verifyResult.success) {
        return res.status(400).json({
          success: false,
          message: verifyResult.message || 'Invalid or expired OTP'
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
        },
      });
    } catch (error) {
      console.error('Registration verification error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to complete registration',
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
    body("identifier")
      .notEmpty()
      .withMessage("Email or phone number is required"),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { identifier } = req.body;
    const includeOtp = process.env.NODE_ENV === 'development' || process.env.OTP_DEBUG_RESPONSE === 'true';
    const genericResponse = {
      success: true,
      message: 'If an account exists, an OTP has been sent.'
    };

    try {
      // Determine if identifier is email or phone
      const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier);
      const isPhone = /^[0-9]{10}$/.test(identifier.replace(/[^0-9]/g, ''));

      if (!isEmail && !isPhone) {
        return res.status(400).json({
          success: false,
          message: 'Please provide a valid email address or 10-digit phone number'
        });
      }

      let user;
      let deliveryMethod;

      if (isEmail) {
        // Find user by email
        user = await userModel.findOne({ where: { email: identifier } });
        deliveryMethod = 'email';
      } else {
        // Find user by phone number
        const cleanPhone = identifier.replace(/[^0-9]/g, '');
        user = await userModel.findOne({ where: { phoneNumber: cleanPhone } });
        deliveryMethod = 'whatsapp';
      }

      if (!user || user.status === 'inactive' || user.status === 'blocked') {
        return res.status(200).json(genericResponse);
      }

      // Generate OTP for login
      const OTP = await import('../models/otp.model.intelligent.js');
      const otp = await OTP.default.generate({
        email: user.email,
        phone: user.phoneNumber,
        purpose: 'login_otp',
        expiryMinutes: 5
      });

      // Send OTP via n8n first, fallback to direct delivery
      const useN8n = process.env.USE_N8N_OTP !== 'false';
      let n8nSuccess = false;

      if (useN8n) {
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
            n8nSuccess = true;
            console.log(`✅ Login OTP sent via n8n (${deliveryMethod})`);
          } else {
            console.warn('⚠️  n8n delivery failed, using fallback');
          }
        } catch (n8nError) {
          console.warn('⚠️  n8n error, using fallback:', n8nError.message);
        }
      }

      // Fallback to direct delivery if n8n failed
      if (!n8nSuccess) {
        if (deliveryMethod === 'email') {
          await signupVerificationService.sendOTPViaEmail({
            email: user.email,
            firstName: user.firstName || 'User'
          }, otp.code);
          console.log(`📧 Login OTP sent via Email (direct) to ${user.email}`);
        } else {
          await signupVerificationService.sendOTPViaWhatsApp({
            phoneNumber: user.phoneNumber,
            firstName: user.firstName || 'User'
          }, otp.code);
          console.log(`📱 Login OTP sent via WhatsApp (direct) to ${user.phoneNumber}`);
        }
      }

      // Mask email/phone for response
      const maskedIdentifier = isEmail
        ? user.email.replace(/(.{2})(.*)(@.*)/, '$1****$3')
        : user.phoneNumber.replace(/(\d{2})(\d+)(\d{2})/, '$1******$3');

      const responseData = {
        otpId: otp.id,
        expiresAt: otp.expiresAt,
        expiresIn: '5 minutes',
        deliveryMethod,
        sentTo: maskedIdentifier
      };

      if (includeOtp) {
        responseData.otp = otp.code;
      }

      return res.status(200).json({
        ...genericResponse,
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
    body("identifier")
      .notEmpty()
      .withMessage("Email or phone number is required"),
    body("code")
      .isLength({ min: 6, max: 6 })
      .withMessage("OTP must be 6 digits"),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { identifier, code } = req.body;

    try {
      // Determine if identifier is email or phone
      const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier);
      
      let user;
      if (isEmail) {
        user = await userModel.findOne({ where: { email: identifier } });
      } else {
        const cleanPhone = identifier.replace(/[^0-9]/g, '');
        user = await userModel.findOne({ where: { phoneNumber: cleanPhone } });
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
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(profilePicture.mimetype)) {
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
    
    // Generate unique filename
    const fileExtension = profilePicture.name.split('.').pop();
    const fileName = `profile_${req.user.id}_${Date.now()}.${fileExtension}`;
    const uploadPath = `./uploads/profiles/${fileName}`;
    
    // Move file to uploads directory
    await profilePicture.mv(uploadPath);
    
    // Update user profile with image path
    const user = await userModel.findByPk(req.user.id);
    user.profileImage = `/uploads/profiles/${fileName}`;
    await user.save();
    
    res.json({
      success: true,
      message: "Profile picture uploaded successfully",
      profileImage: user.profileImage
    });
  } catch (error) {
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
    const allowedFields = ['bloodType', 'allergies', 'medications', 'chronicConditions', 'medicalHistory'];
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
        membershipType: user.membershipType
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
  body("code").notEmpty().isLength({ min: 6, max: 6 }).withMessage("OTP must be 6 digits"),
  body("userType").optional().isIn(['user', 'doctor']).withMessage("User type must be 'user' or 'doctor'")
], async (req, res) => {
  try {
    const { email, phone, code, userType = 'user' } = req.body;

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
    const { token, password, userType = 'user' } = req.body;

    // Hash the token to compare with stored hash
    const resetTokenHash = crypto.createHash('sha256').update(token).digest('hex');

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
    const hashedPassword = await bcrypt.hash(password, 10);

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

export default router;
