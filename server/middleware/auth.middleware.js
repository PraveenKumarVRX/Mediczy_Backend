import userModel from "../models/user.model.intelligent.js";
import doctorModel from "../models/doctor.model.intelligent.js";
import adminModel from "../models/admin.model.intelligent.js";
import jwt from "jsonwebtoken";

export const authUser = async (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];

  if (!token) {
    return res.status(401).json({ message: "unauthorized token" });
  }

  // Development bypass for testing (REMOVE IN PRODUCTION)
  if (token === 'dev-admin-token') {
    req.user = {
      id: 'admin_dev',
      email: 'admin@mediczy.com',
      role: 'super_admin',
      isAdmin: true
    };
    req.userRole = 'admin'; // Set the userRole for requireRole middleware
    return next();
  }

  if (token === 'dev-user-token') {
    req.user = {
      id: 1,
      email: 'user@mediczy.com',
      firstName: 'Demo',
      lastName: 'User',
      role: 'user'
    };
    req.userRole = 'user';
    return next();
  }

  if (token === 'dev-doctor-token') {
    req.user = {
      id: 1,
      email: 'doctor@mediczy.com',
      firstName: 'Demo',
      lastName: 'Doctor',
      role: 'doctor'
    };
    req.userRole = 'doctor';
    return next();
  }

  // CRITICAL SECURITY: Fail immediately if JWT_SECRET not set
  if (!process.env.JWT_SECRET) {
    console.error('FATAL: JWT_SECRET environment variable not set!');
    return res.status(500).json({ message: "Server configuration error" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log("🔹 Token verification SUCCESS. JWT_SECRET:", process.env.JWT_SECRET?.slice(0, 10) + "...");
    console.log("🔹 Decoded payload:", decoded);

    // Check if this is an admin token
    if (decoded.isAdmin || decoded.role === 'admin' || decoded.role === 'super_admin') {
      console.log("🔹 Admin token detected, setting up admin user context");
      
      req.user = {
        id: decoded.id,
        email: decoded.email,
        role: decoded.role || 'admin',
        firstName: 'System',
        lastName: 'Administrator',
        isAdmin: true
      };
      req.userRole = 'admin';
      return next();
    }

    // Check if this is a doctor token
    if (decoded.role === 'doctor') {
      // Doctor token detected
      
      const doctor = await doctorModel.findByPk(decoded.id, {
        attributes: { exclude: ['password'] }
      });

      if (!doctor) {
        console.log("❌ Doctor not found for ID:", decoded.id);
        return res.status(401).json({ message: "doctor not found" });
      }
      
      // Extract plain data from Sequelize model
      const doctorData = doctor.get ? doctor.get({ plain: true }) : (doctor.dataValues || doctor);
      
      req.user = {
        ...doctorData,
        id: doctorData.id || decoded.id, // Ensure id is set
        role: 'doctor'
      };
      req.userRole = 'doctor';
      console.log("🔹 Doctor user set with id:", req.user.id);
      return next();
    }

    // Check if this is a nurse token
    if (decoded.role === 'nurse') {
      // Nurse token detected
      const { default: Nurse } = await import("../models/nurse.model.intelligent.js");
      
      const nurse = await Nurse.findByPk(decoded.id);
      
      if (!nurse) {
        console.log("❌ Nurse not found for ID:", decoded.id);
        return res.status(401).json({ message: "nurse not found" });
      }
      
      // Explicitly set role to ensure it's not undefined
      req.user = Object.assign({}, nurse, { role: 'nurse' });
      req.userRole = 'nurse';
      console.log("🔹 Nurse user set with role:", req.user.role);
      return next();
    }

    // Check if this is an assistant token
    if (decoded.role === 'assistant') {
      // Assistant token detected
      const { default: Assistant } = await import("../models/assistant.model.intelligent.js");
      
      const assistant = await Assistant.findByPk(decoded.id);
      
      if (!assistant) {
        console.log("❌ Assistant not found for ID:", decoded.id);
        return res.status(401).json({ message: "assistant not found" });
      }
      
      // Explicitly set role to ensure it's not undefined
      req.user = Object.assign({}, assistant, { role: 'assistant' });
      req.userRole = 'assistant';
      console.log("🔹 Assistant user set with role:", req.user.role);
      return next();
    }

    // Regular user authentication
    const user = await userModel.findByPk(decoded.id, {
      attributes: { exclude: ['password'] }
    });

    if (!user) {
      return res.status(401).json({ message: "user not found" });
    }
    req.user = user;
    req.userRole = decoded.role || (user?.isAdmin ? 'admin' : 'user');

    return next();
  } catch (error) {
    console.log("❌ Token verification FAILED. Error:", error.message);
    console.log("❌ JWT_SECRET being used:", process.env.JWT_SECRET?.slice(0, 10) + "...");
    console.log("❌ Token being verified:", token?.slice(0, 50) + "...");
    return res.status(401).json({ message: error.message });
  }
};

export const requireRole = (role) => {
  return (req, res, next) => {
    if (!req.userRole) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    if (req.userRole !== role) {
      return res.status(403).json({ message: 'Forbidden: insufficient role' });
    }
    next();
  };
};

export const authDoctor = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    console.log(token);

    if (!token) {
      return res.status(401).json({ message: "Unauthorized token" });
    }

    // CRITICAL SECURITY: Fail immediately if JWT_SECRET not set
    if (!process.env.JWT_SECRET) {
      console.error('FATAL: JWT_SECRET environment variable not set!');
      return res.status(500).json({ message: "Server configuration error" });
    }

    // Verify Token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log(decoded, "hello");

    // Fetch Doctor using Sequelize
    const doctor = await doctorModel.findByPk(decoded.id, {
      attributes: { exclude: ['password'] }
    });
    console.log(doctor, "hello");

    if (!doctor) {
      return res.status(401).json({ message: "Doctor not found" });
    }

    req.doctor = doctor;
    next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid token" });
  }
};
