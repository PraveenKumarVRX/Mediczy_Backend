import { validationResult } from "express-validator";
import { JWT_CONFIG } from '../config/auth.config.js';
import userModel, { generateAuthTokenForUser, User } from "../models/user.model.intelligent.js";
import jwt from "jsonwebtoken";
import { auditLoginAttempt } from "../middleware/audit.middleware.js";
import Consent from "../models/consent.model.intelligent.js";
import intelligentDb from "../utils/intelligentDbClient.js";
import { col, fn, where as sequelizeWhere } from "sequelize";
import Doctor from "../models/doctor.model.intelligent.js";
import Nurse from "../models/nurse.model.intelligent.js";
import Assistant from "../models/assistant.model.intelligent.js";
import { UserPlan, MembershipPlan } from "../models/membershipPlan.model.intelligent.js";

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
      status: "active",
      emailVerified: false,
    });

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
    return res.status(400).json({ errors: errors.array() });
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

  console.log('[LOGIN DEBUG] Identifier:', email || phoneNumber, 'Password length:', password?.length);

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
      await auditLoginAttempt(req, null, email || phoneNumber, false, 'User not found');
      return res.status(401).json({ message: "Invalid email or password" }); // Unauthorized
    }

    // ROLE GUARD: Block staff from using user login endpoint
    if (user.isAdmin) {
      await auditLoginAttempt(req, user.id, email || phoneNumber, false, 'Admin attempted user login');
      return res.status(403).json({ 
        message: "Please use the admin login portal" 
      });
    }

    // Cross-role guard: prevent doctor/nurse/assistant accounts from authenticating via user login
    const doctorRecord = await Doctor.findOne({
      where: sequelizeWhere(fn("lower", col("email")), email),
      attributes: ["id"]
    });
    if (doctorRecord) {
      await auditLoginAttempt(req, user.id, email || phoneNumber, false, 'Doctor attempted user login');
      return res.status(403).json({ message: "Please use the doctor login portal" });
    }
    const nurseRecord = await Nurse.findOne({
      where: sequelizeWhere(fn("lower", col("email")), email),
      attributes: ["id"]
    });
    if (nurseRecord) {
      await auditLoginAttempt(req, user.id, email || phoneNumber, false, 'Nurse attempted user login');
      return res.status(403).json({ message: "Please use the nurse login portal" });
    }
    const assistantRecord = await Assistant.findOne({
      where: sequelizeWhere(fn("lower", col("email")), email),
      attributes: ["id"]
    });
    if (assistantRecord) {
      await auditLoginAttempt(req, user.id, email || phoneNumber, false, 'Assistant attempted user login');
      return res.status(403).json({ message: "Please use the assistant login portal" });
    }

    // Compare provided password with stored hashed password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      // Audit failed login attempt
      await auditLoginAttempt(req, user.id, email || phoneNumber, false, 'Invalid password');
      return res.status(401).json({ message: "Invalid email or password" }); // Unauthorized
    }

    // Update last login (PostgreSQL uses lastLoginAt)
    user.lastLoginAt = new Date();
    await user.save();

    // Generate authentication token including userId, userType, role for ring-fencing
    const token = generateAuthTokenForUser(user);

    // Audit successful login
    await auditLoginAttempt(req, user.id, email || phoneNumber, true);

    // Respond with user data & token
    return res.status(200).json({
      message: "Login successful",
      token,
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
        role: user.isAdmin ? "admin" : "user",
        employerName: user.employerName,
        employeeId: user.employeeId,
        corporateId: user.corporateId,
        membershipType: user.membershipType
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({ message: "Internal Server Error" });
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
