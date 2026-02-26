// import { validationResult } from "express-validator";
import { JWT_CONFIG } from '../config/auth.config.js';
// import doctorModel from "../models/doctor.model.js";
// import jwt from "jsonwebtoken";

// export async function registerDoctor(req, res) {
//   try {
//     const errors = validationResult(req);
//     if (!errors.isEmpty()) {
//       return res.status(400).json({ errors: errors.array() });
//     }

//     const { email } = req.body;

//     const existingDoctor = await doctorModel.findOne({ email });
//     if (existingDoctor) {
//       return res.status(409).json({ message: "Email already exists" });
//     }

//     // Create doctor with plain password, hashing will happen via schema pre-save hook
//     const newDoctor = new doctorModel(req.body);
//     await newDoctor.save(); // Triggers password hash & validation

//     const token = newDoctor.generateAuthToken();
//     const doctorResponse = newDoctor.toObject();
//     delete doctorResponse.password;

//     return res.status(201).json({
//       message: "Doctor registered successfully",
//       token,
//       doctor: doctorResponse,
//     });
//   } catch (error) {
//     console.error("Registration error:", error);
//     return res.status(500).json({ message: "Internal Server Error" });
//   }
// }

// export async function signInDoctor(req, res) {
//   try {
//     // Validate request input
//     const errors = validationResult(req);
//     if (!errors.isEmpty()) {
//       return res.status(400).json({ errors: errors.array() });
//     }

//     const { email, password } = req.body;

//     // Check if doctor exists
//     const doctor = await doctorModel.findOne({ email }).select("+password");

//     if (!doctor) {
//       return res.status(401).json({ message: "Invalid email or password" });
//     }

//     // Validate password
//     try {
//       const isPasswordValid = await doctor.comparePassword(password);

//       if (!isPasswordValid) {
//         return res.status(401).json({ message: "Invalid email or password" });
//       }

//       // Generate authentication token
//       const token = doctor.generateAuthToken();

//       // Remove password from response
//       const doctorResponse = doctor.toObject();
//       delete doctorResponse.password;

//       // Update online status without validation
//       await doctorModel.findByIdAndUpdate(
//         doctor._id,
//         {
//           $set: {
//             isOnline: true,
//             lastActive: new Date()
//           }
//         },
//         { 
//           new: true,
//           validateBeforeSave: false
//         }
//       );

//       // Respond with doctor data & token
//       return res.status(200).json({
//         message: "Login successful",
//         token,
//         doctor: doctorResponse,
//       });
//     } catch (passwordError) {
//       console.error("Password comparison error:", passwordError);
//       return res.status(401).json({ message: "Invalid email or password" });
//     }
//   } catch (error) {
//     console.error("Login error:", error);
//     return res.status(500).json({ message: "Internal Server Error" });
//   }
// }

// export const getDoctorProfile = async (req, res) => {
//   try {
//     if (!req.doctor) {
//       return res.status(404).json({ message: "Doctor not found" });
//     }

//     // Remove password from doctor data before sending response
//     const doctorResponse = req.doctor.toObject();
//     delete doctorResponse.password;

//     return res.status(200).json(doctorResponse);
//   } catch (error) {
//     console.error("Profile retrieval error:", error);
//     return res.status(500).json({ message: "Internal Server Error" });
//   }
// };

// export const updateDoctorStatus = async (req, res) => {
//   try {
//     console.log('hello from asy');

//     // Extract token from headers
//     const token = req.headers.authorization?.split(" ")[1];

//     if (!token) {
//       return res.status(401).json({
//         success: false,
//         message: "Unauthorized. No token provided.",
//       });
//     }

//     // Verify and decode token
//     const decoded = jwt.verify(token, process.env.SECRET_TOKEN);
//     const userId = decoded._id; // Ensure your JWT contains `id`

//     // Extract status from request
//     const { isOnline } = req.body;

//     if (typeof isOnline !== "boolean") {
//       return res.status(400).json({
//         success: false,
//         message: "Invalid status. Must be a boolean value.",
//       });
//     }

//     // Update user status
//     const updatedUser = await doctorModel
//       .findByIdAndUpdate(
//         userId,
//         {
//           isOnline,
//           lastActive: new Date(),
//           updatedAt: new Date(),
//         },
//         { new: true, runValidators: true }
//       )
//       .select("-password");

//     if (!updatedUser) {
//       return res.status(404).json({
//         success: false,
//         message: "User not found.",
//       });
//     }

//     res.status(200).json({
//       success: true,
//       message: `Status updated to ${isOnline ? "online" : "offline"}.`,
//       data: {
//         isOnline: updatedUser.isOnline,
//         lastActive: updatedUser.lastActive,
//       },
//     });
//   } catch (error) {
//     console.error("Error updating status:", error);
//     res.status(500).json({
//       success: false,
//       message: "Server error while updating status.",
//       error: error.message,
//     });
//   }
// };

// export const getAvailableDoctors = async (req, res) => {
//   try {
//     const { specialization, isOnline } = req.query;

//     // Build the query object
//     const query = {};

//     // Add online status to query if provided
//     if (isOnline !== undefined) {
//       // Convert string to boolean
//       query.isOnline = isOnline === "true";
//     }

//     // Add specialization to query if provided
//     if (specialization) {
//       query.specialization = specialization;
//     }

//     // Find doctors matching the criteria
//     const doctors = await doctorModel.find(query)
//       .select({
//         firstName: 1,
//         lastName: 1,
//         specialization: 1,
//         experience: 1,
//         phoneNumber: 1,
//         isOnline: 1,
//         qualifications: 1,
//         reviews: 1,
//         availability: 1,
//       })
//       .sort({ experience: -1 }); // Sort by experience (most experienced first)

//     res.status(200).json({
//       success: true,
//       count: doctors.length,
//       data: doctors,
//     });
//   } catch (error) {
//     console.error("Error finding doctors:", error);
//     res.status(500).json({
//       success: false,
//       message: "Error fetching doctors",
//       error: error.message,
//     });
//   }
// };

import { validationResult } from "express-validator";
import doctorModel from "../models/doctor.model.intelligent.js";
import { User } from "../models/user.model.intelligent.js";
import jwt from "jsonwebtoken";
import intelligentDb from "../utils/intelligentDbClient.js";
import { auditLoginAttempt } from "../middleware/audit.middleware.js";
import { fn, col, where as sequelizeWhere } from "sequelize";

const toPlainDoctor = (doctorInstance) => {
  if (!doctorInstance) return null;
  if (typeof doctorInstance.toJSON === 'function') {
    return doctorInstance.toJSON();
  }
  if (typeof doctorInstance.get === 'function') {
    return doctorInstance.get({ plain: true });
  }
  return doctorInstance;
};

export async function registerDoctor(req, res) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email } = req.body;

    // Check if doctor already exists using Sequelize
    const existingDoctor = await doctorModel.findOne({ where: { email } });
    if (existingDoctor) {
      return res.status(409).json({ message: "Email already exists" });
    }

    // Create doctor (password will be hashed automatically by beforeCreate hook)
    const newDoctor = await doctorModel.create(req.body);

    const token = newDoctor.generateAuthToken();

    // Mirror doctor profile into intelligent DB (fire-and-forget)
    (async () => {
      try {
        const payload = {
          id: newDoctor.id,
          prefix: newDoctor.prefix,
          firstName: newDoctor.firstName,
          lastName: newDoctor.lastName,
          email: newDoctor.email,
          phoneNumber: newDoctor.phoneNumber,
          specialization: newDoctor.specialization,
          experience: newDoctor.experience,
          isVerified: newDoctor.isVerified,
          createdAt: newDoctor.createdAt,
          updatedAt: newDoctor.updatedAt
        };
        await intelligentDb.ingest("doctors_v1", payload);
      } catch (err) {
        console.error("Intelligent DB ingest (doctor) failed:", err.message || err);
      }
    })();

    return res.status(201).json({
      message: "Doctor registered successfully",
      token,
      doctor: {
        id: newDoctor.id,
        prefix: newDoctor.prefix,
        firstName: newDoctor.firstName,
        lastName: newDoctor.lastName,
        email: newDoctor.email,
        specialization: newDoctor.specialization,
        experience: newDoctor.experience,
        phoneNumber: newDoctor.phoneNumber
      },
    });
  } catch (error) {
    console.error("Registration error:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
}

export async function signInDoctor(req, res) {
  console.log('💚 [signInDoctor] Function called');
  try {
    // Validate request input
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('💚 [signInDoctor] Validation errors:', errors.array());
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;
    const normalizedEmail = String(email || '').toLowerCase();
    console.log('💚 [signInDoctor] Email:', normalizedEmail);
    console.log('💚 [signInDoctor] doctorModel type:', typeof doctorModel);

    // Check if doctor exists using Sequelize
    console.log('💚 [signInDoctor] About to query database...');
    let doctor;
    try {
      doctor = await doctorModel.findOne({ where: { email: normalizedEmail } });
      console.log('💚 [signInDoctor] Query completed');
    } catch (queryError) {
      console.error('❌ [signInDoctor] Database query error:', queryError);
      console.error('❌ [signInDoctor] Query error message:', queryError.message);
      console.error('❌ [signInDoctor] Query error stack:', queryError.stack);
      throw queryError; // Re-throw to outer catch
    }

    console.log('💚 [signInDoctor] Doctor found:', !!doctor);
    console.log('💚 [signInDoctor] Doctor object keys:', doctor ? Object.keys(doctor.dataValues || doctor) : 'null');

    if (!doctor) {
      console.log('💚 [signInDoctor] No doctor found, returning 401');
      await auditLoginAttempt(req, null, normalizedEmail, false, 'Doctor not found');
      return res.status(401).json({ message: "Invalid email or password" });
    }

    // CROSS-ROLE GUARD: Prevent patient/user accounts from using doctor login endpoint
    // This provides server-side validation in addition to client-side routing
    // Allow users with role='doctor' to proceed (they may have accounts in both tables)
    const userRecord = await User.findOne({
      where: sequelizeWhere(fn("lower", col("email")), normalizedEmail),
      attributes: ["id", "isAdmin", "role"]
    });
    
    if (userRecord && userRecord.role !== 'doctor' && !userRecord.isAdmin) {
      console.log('💚 [signInDoctor] User/patient account found, blocking doctor login');
      await auditLoginAttempt(req, userRecord.id, normalizedEmail, false, 'Patient/user attempted doctor login');
      return res.status(403).json({ 
        message: "Please use the patient login portal" 
      });
    }

    console.log('💚 [signInDoctor] About to compare password...');
    // Validate password
    try {
      const isPasswordValid = await doctor.comparePassword(password);
      console.log('💚 [signInDoctor] Password valid:', isPasswordValid);

      if (!isPasswordValid) {
        await auditLoginAttempt(req, doctor.id, normalizedEmail, false, 'Invalid password');
        return res.status(401).json({ message: "Invalid email or password" });
      }

      console.log('💚 [signInDoctor] About to generate token...');
      // Generate authentication token
      const token = doctor.generateAuthToken();
      console.log('💚 [signInDoctor] Token generated successfully');

      // Update online status
      await doctor.update({
        isOnline: true,
        lastLoginAt: new Date(),
        lastActivityAt: new Date()
      });

      // Respond with doctor data & token
      await auditLoginAttempt(req, doctor.id, normalizedEmail, true);
      return res.status(200).json({
        message: "Login successful",
        token,
        doctor: {
          id: doctor.id,
          firstName: doctor.firstName,
          lastName: doctor.lastName,
          email: doctor.email,
          specialization: doctor.specialization,
          experience: doctor.experience,
          isOnline: doctor.isOnline,
          lastActive: doctor.lastActivityAt || doctor.lastLoginAt || null
        },
      });
    } catch (passwordError) {
      console.error("❌ Password comparison error:", passwordError);
      console.error("❌ Error stack:", passwordError.stack);
      return res.status(401).json({ message: "Invalid email or password" });
    }
  } catch (error) {
    console.error("❌ LOGIN ERROR:", error);
    console.error("❌ Error message:", error.message);
    console.error("❌ Error stack:", error.stack);
    console.error("❌ Error name:", error.name);
    return res.status(500).json({ message: "Internal Server Error" });
  }
}

export const getDoctorProfile = async (req, res) => {
  try {
    console.log('=== getDoctorProfile CALLED ===');
    console.log('req.doctor exists:', !!req.doctor);
    
    if (!req.doctor) {
      console.log('=== No doctor found, returning 404 ===');
      return res.status(404).json({ 
        success: false,
        message: "Doctor not found" 
      });
    }

    const doctorResponse = toPlainDoctor(req.doctor);
    if (doctorResponse && doctorResponse.password) {
      delete doctorResponse.password;
    }

    console.log('=== Sending response with structure: {success: true, doctor: {...}} ===');
    console.log('Doctor has service fields:', {
      offersSecondOpinion: doctorResponse.offersSecondOpinion,
      secondOpinionFee: doctorResponse.secondOpinionFee
    });

    return res.status(200).json({
      success: true,
      doctor: doctorResponse
    });
  } catch (error) {
    console.error("Profile retrieval error:", error);
    return res.status(500).json({ 
      success: false,
      message: "Internal Server Error" 
    });
  }
};

export const updateDoctorStatus = async (req, res) => {
  try {
    let doctorId = req.doctor?.id || req.doctor?._id || null;

    // Backward-compatible fallback for any legacy callers not using authDoctor
    if (!doctorId) {
      const token = req.headers.authorization?.split(" ")[1];
      if (!token) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized. No token provided.",
        });
      }
      const decoded = jwt.verify(token, JWT_CONFIG.SECRET);
      if (decoded?.role !== "doctor") {
        return res.status(403).json({
          success: false,
          message: "Access denied. Doctor role required.",
        });
      }
      doctorId = decoded.id || decoded._id;
    }

    // Extract status from request
    const { isOnline } = req.body;

    if (typeof isOnline !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "Invalid status. Must be a boolean value.",
      });
    }

    const doctor = await doctorModel.findByPk(doctorId);

    if (!doctor) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    await doctor.update({
      isOnline,
      lastActive: new Date(),
      updatedAt: new Date(),
    });

    const updatedUser = toPlainDoctor(doctor);
    if (updatedUser && updatedUser.password) {
      delete updatedUser.password;
    }

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

export const getAvailableDoctors = async (req, res) => {
  try {
    const { specialization, isOnline } = req.query;

    // Build the query object
    const query = {};

    // Add online status to query if provided
    if (isOnline !== undefined) {
      // Convert string to boolean
      query.isOnline = isOnline === "true";
    }

    // Add specialization to query if provided
    if (specialization) {
      query.specialization = specialization;
    }

    // Find doctors matching the criteria using Sequelize
    const doctors = await doctorModel.findAll({
      where: query,
      attributes: [
        'id',
        'firstName',
        'lastName',
        'specialization',
        'experience',
        'phoneNumber',
        'isOnline',
        'qualification',
        'reviews',
        'rating',
        'totalReviews',
        'consultationFees',
        'availableSlots'
      ],
      order: [['experience', 'DESC']] // Sort by experience (most experienced first)
    });

    res.status(200).json({
      success: true,
      count: doctors.length,
      data: doctors,
    });
  } catch (error) {
    console.error("Error finding doctors:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching doctors",
      error: error.message,
    });
  }
};
