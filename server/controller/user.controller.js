import { validationResult } from "express-validator";
import userModel, { generateAuthTokenForUser } from "../models/user.model.intelligent.js";
import jwt from "jsonwebtoken";
import { auditLoginAttempt } from "../middleware/audit.middleware.js";
import Consent from "../models/consent.model.intelligent.js";
import intelligentDb from "../utils/intelligentDbClient.js";

export async function registerUser(req, res) {
  // Validate request
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { password, email } = req.body;
  console.log(email);

  try {
    // Check if user already exists
    const isUser = await userModel.findOne({ where: { email } });
    if (isUser) {
      console.log(isUser);
      return res.status(409).json({ message: "Email already exists" }); // 409 Conflict
    }

    // Create user (password will be hashed automatically by the beforeCreate hook)
    const newUser = await userModel.create({
      ...req.body,
      password // Password will be hashed by the model hook
    });

    console.log(newUser);

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
        role: newUser.role || 'user',
        corporateId: newUser.corporateId || null
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

  const { email, password } = req.body;

  try {
    // Check if user exists
    const user = await userModel.findOne({ where: { email } });
    if (!user) {
      // Audit failed login attempt
      await auditLoginAttempt(req, null, email, false, 'User not found');
      return res.status(401).json({ message: "Invalid email or password" }); // Unauthorized
    }

    // Compare provided password with stored hashed password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      // Audit failed login attempt
      await auditLoginAttempt(req, user.id, email, false, 'Invalid password');
      return res.status(401).json({ message: "Invalid email or password" }); // Unauthorized
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();
    await user.save();

    // Generate authentication token including role/corporateId
    const token = generateAuthTokenForUser(user);

    // Audit successful login
    await auditLoginAttempt(req, user.id, email, true);

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
        isActive: user.isActive,
        lastLogin: user.lastLogin,
        role: user.role || 'user',
        corporateId: user.corporateId || null
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
}

export const getUserProfile = async (req, res, next) => {
  console.log('profile called');
  
  return res.status(200).json(req.user);
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
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
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
