import userModel from "../models/user.model.intelligent.js";
import doctorModel from "../models/doctor.model.intelligent.js";
import nurseModel from "../models/nurse.model.intelligent.js";
import assistantModel from "../models/assistant.model.intelligent.js";
import jwt from "jsonwebtoken";
import { JWT_CONFIG } from "../config/auth.config.js";
import UserPostgres from "../models/postgres/user.model.postgres.js";
import DoctorPostgres from "../models/postgres/doctor.model.postgres.js";
import NursePostgres from "../models/postgres/nurse.model.postgres.js";
import AssistantPostgres from "../models/postgres/doctor-assistant.model.postgres.js";
import { validateMembership, checkMembershipExpiry } from "./membership.middleware.js";

const DEV_TOKEN_ALLOWLIST = new Set(["dev-user-token", "dev-doctor-token", "dev-corporate-token"]);
const ALLOW_DEV_TOKENS = ["development", "test"].includes(process.env.NODE_ENV);

const TENANT_BYPASS_ROLES = new Set(["admin", "super_admin", "system_admin", "platform_admin"]);

// Organization admin roles
const ORG_ADMIN_ROLES = new Set([
  "hospital_admin", "clinic_admin", "lab_admin", "pharmacy_admin",
  "tpa_admin", "psu_admin", "ngo_admin", "insurer_admin",
  "corporate_admin", "homecare_admin", "ambulance_admin"
]);

const toPlainObject = (record) => {
  if (!record) return null;
  if (typeof record.get === "function") {
    return record.get({ plain: true });
  }
  if (record.dataValues) {
    return { ...record.dataValues };
  }
  return { ...record };
};

const safeFindByPk = async (primaryModel, fallbackModel, id, options = {}) => {
  if (!id) return null;

  if (primaryModel) {
    try {
      const result = await primaryModel.findByPk(id, options);
      if (result) {
        return toPlainObject(result);
      }
    } catch (error) {
      console.warn(
        `[auth] Primary model lookup failed for ${id}: ${error.message}`
      );
    }
  }

  if (!fallbackModel) return null;
  const fallback = await fallbackModel.findByPk(id, options);
  return toPlainObject(fallback);
};

const resolveTenantFromEntity = (entity = {}) =>
  entity.organization_id || entity.tenant_id || entity.tenantId || null;

const bindTenantContext = (req, tenantId) => {
  if (!tenantId) return { ok: true };

  req.userTenantId = tenantId;

  if (!req.tenantId) {
    req.tenantId = tenantId;
    req.tenantSource = "auth-binding";
    return { ok: true };
  }

  if (req.tenantId === tenantId) {
    return { ok: true };
  }

  if (TENANT_BYPASS_ROLES.has(req.userRole)) {
    console.warn(
      `[auth] Tenant mismatch bypassed for role=${req.userRole}. header=${req.tenantId} entity=${tenantId}`
    );
    return { ok: true };
  }

  return {
    ok: false,
    status: 403,
    body: {
      message:
        "Tenant context mismatch. Access is restricted to your organization subdomain.",
      expectedTenantId: tenantId,
      receivedTenantId: req.tenantId,
    },
  };
};

export const authUser = async (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];

  if (!token) {
    return res.status(401).json({ message: "unauthorized token" });
  }

  if (DEV_TOKEN_ALLOWLIST.has(token)) {
    if (!ALLOW_DEV_TOKENS) {
      console.warn(
        `[auth] Dev token attempt blocked in env=${process.env.NODE_ENV}`
      );
      return res.status(401).json({ message: "Dev tokens disabled" });
    }

    let demoRole = "user";
    let demoData = {
      id: 1,
      email: "user@mediczy.com",
      firstName: "Demo",
      lastName: "User",
      role: "user"
    };

    if (token === "dev-doctor-token") {
      demoRole = "doctor";
      demoData = {
        id: 1,
        email: "doctor@mediczy.com",
        firstName: "Demo",
        lastName: "Doctor",
        role: "doctor"
      };
    } else if (token === "dev-corporate-token") {
      demoRole = "corporate";
      demoData = {
        id: "corp_dev",
        corporateId: "corp_dev",
        email: "corporate@mediczy.com",
        firstName: "Demo",
        lastName: "Corporate",
        role: "corporate",
        companyName: "Demo Corporate"
      };
    }

    req.user = demoData;
    req.userRole = demoRole;
    req.userTenantId = null;
    req.guardrail = "DEV_TOKEN";
    return next();
  }

  if (!JWT_CONFIG.SECRET) {
    console.error("FATAL: JWT_SECRET environment variable not set!");
    return res.status(500).json({ message: "Server configuration error" });
  }

  try {
    const decoded = jwt.verify(token, JWT_CONFIG.SECRET);
    console.log("🔹 Token verification SUCCESS");

    // Admins bypass tenant restrictions (but mismatch is logged)
    if (decoded.isAdmin || decoded.isTeam || TENANT_BYPASS_ROLES.has(decoded.role)) {
      req.user = {
        id: decoded.id,
        email: decoded.email,
        role: decoded.role || (decoded.isAdmin ? "admin" : (decoded.isTeam ? "team" : "user")),
        firstName: decoded.firstName || "System",
        lastName: decoded.lastName || "User",
        isAdmin: decoded.isAdmin || false,
        isTeam: decoded.isTeam || false,
      };
      req.userRole = decoded.isTeam ? "team" : (decoded.isAdmin ? "admin" : decoded.role);
      return next();
    }

    if (decoded.role === "doctor") {
      const doctor = await safeFindByPk(
        DoctorPostgres,
        doctorModel,
        decoded.id,
        {
          attributes: { exclude: ["password"] },
        }
      );

      if (!doctor) {
        console.log("❌ Doctor not found for ID:", decoded.id);
        return res.status(401).json({ message: "doctor not found" });
      }

      req.user = { ...doctor, id: doctor.id || decoded.id, role: "doctor" };
      req.userRole = "doctor";
      const tenantBinding = bindTenantContext(req, resolveTenantFromEntity(doctor));
      if (!tenantBinding.ok) {
        return res.status(tenantBinding.status).json(tenantBinding.body);
      }
      return next();
    }

    if (decoded.role === "nurse") {
      const nurse = await safeFindByPk(NursePostgres, nurseModel, decoded.id);

      if (!nurse) {
        console.log("❌ Nurse not found for ID:", decoded.id);
        return res.status(401).json({ message: "nurse not found" });
      }

      req.user = { ...nurse, role: "nurse" };
      req.userRole = "nurse";
      const tenantBinding = bindTenantContext(req, resolveTenantFromEntity(nurse));
      if (!tenantBinding.ok) {
        return res.status(tenantBinding.status).json(tenantBinding.body);
      }
      return next();
    }

    if (decoded.role === "assistant") {
      const assistant = await safeFindByPk(
        AssistantPostgres,
        assistantModel,
        decoded.id
      );

      if (!assistant) {
        console.log("❌ Assistant not found for ID:", decoded.id);
        return res.status(401).json({ message: "assistant not found" });
      }

      req.user = { ...assistant, role: "assistant" };
      req.userRole = "assistant";
      const tenantBinding = bindTenantContext(
        req,
        resolveTenantFromEntity(assistant)
      );
      if (!tenantBinding.ok) {
        return res.status(tenantBinding.status).json(tenantBinding.body);
      }
      return next();
    }

    // Check for corporate using either role or userType field
    if (decoded.role === "corporate" || decoded.userType === "corporate") {
      const corporateId = decoded.id || decoded.corporateId || decoded.userId;
      req.user = {
        id: corporateId,
        corporateId,
        email: decoded.email,
        companyName: decoded.companyName,
        role: "corporate",
      };
      req.userRole = "corporate";
      const tenantBinding = bindTenantContext(
        req,
        decoded.tenantId || decoded.organizationId || null
      );
      if (!tenantBinding.ok) {
        return res.status(tenantBinding.status).json(tenantBinding.body);
      }
      return next();
    }

    if (decoded.role === "lab") {
      const labId = decoded.id || decoded.labId;
      req.user = {
        id: labId,
        labId,
        email: decoded.email,
        name: decoded.name,
        role: "lab",
      };
      req.userRole = "lab";
      const tenantBinding = bindTenantContext(
        req,
        decoded.tenantId || decoded.organizationId || null
      );
      if (!tenantBinding.ok) {
        return res.status(tenantBinding.status).json(tenantBinding.body);
      }
      return next();
    }

    const user = await safeFindByPk(
      UserPostgres,
      userModel,
      decoded.id,
      {
        attributes: { exclude: ["password"] },
      }
    );

    if (!user) {
      return res.status(401).json({ message: "user not found" });
    }

    // Preserve isTeam and isAdmin flags from both token and database
    // ✅ FIX: Ensure ID is always set (Sequelize may return dataValues structure)
    req.user = {
      ...user,
      id:
        user.id ||
        user._id ||
        user.dataValues?.id ||
        user.dataValues?._id ||
        decoded.id,
      isTeam: user.isTeam || decoded.isTeam,
      isAdmin: user.isAdmin || decoded.isAdmin
    };
    req.userRole = decoded.role || (user?.isAdmin ? "admin" : (user?.isTeam ? "team" : "user"));
    const tenantBinding = bindTenantContext(req, resolveTenantFromEntity(user));
    if (!tenantBinding.ok) {
      return res.status(tenantBinding.status).json(tenantBinding.body);
    }

    // Validate membership for regular users (not admins)
    if (req.userRole === 'user' && !user.isAdmin) {
      return validateMembership(req, res, next);
    }

    return next();
  } catch (error) {
    console.log("❌ Token verification FAILED. Error:", error.message);
    console.log(
      "❌ JWT_SECRET being used:",
      (JWT_CONFIG.SECRET || "").slice(0, 10) + "..."
    );
    console.log("❌ Token being verified:", token?.slice(0, 50) + "...");
    return res.status(401).json({ message: error.message });
  }
};

export const requireRole = (role) => {
  return (req, res, next) => {
    if (!req.userRole) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    
    // Support array of roles
    const allowedRoles = Array.isArray(role) ? role : [role];
    
    // Normalize role for checking:
    // - system_admin has admin privileges
    // - isTeam flag grants team privileges
    let effectiveRole = req.userRole;
    if (req.userRole === 'system_admin') {
      effectiveRole = 'admin';
    }
    
    // Check if user has any allowed role
    // Also check isTeam flag if 'team' is in allowed roles
    const hasRole = allowedRoles.includes(effectiveRole) ||
      (allowedRoles.includes('team') && (req.user?.isTeam || req.userRole === 'team')) ||
      (allowedRoles.includes('admin') && (req.user?.isAdmin || req.userRole === 'admin' || req.userRole === 'system_admin'));
    
    if (!hasRole) {
      return res.status(403).json({ message: 'Forbidden: insufficient role' });
    }
    next();
  };
};

export const authDoctor = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];

    if (!token) {
      return res.status(401).json({ message: "Unauthorized token" });
    }

    // CRITICAL SECURITY: Fail immediately if JWT_SECRET not set
    if (!JWT_CONFIG.SECRET) {
      console.error('FATAL: JWT_SECRET environment variable not set!');
      return res.status(500).json({ message: "Server configuration error" });
    }

    // Verify Token
    const decoded = jwt.verify(token, JWT_CONFIG.SECRET);

    const doctor = await safeFindByPk(
      DoctorPostgres,
      doctorModel,
      decoded.id,
      {
        attributes: { exclude: ["password"] },
      }
    );

    if (!doctor) {
      return res.status(401).json({ message: "Doctor not found" });
    }

    req.doctor = {
      ...doctor,
      id:
        doctor.id ||
        doctor._id ||
        doctor.dataValues?.id ||
        doctor.dataValues?._id ||
        decoded.id
    };
    const tenantBinding = bindTenantContext(req, resolveTenantFromEntity(doctor));
    if (!tenantBinding.ok) {
      return res.status(tenantBinding.status).json(tenantBinding.body);
    }
    next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid token" });
  }
};
