import userModel from "../models/user.model.intelligent.js";
import doctorModel from "../models/doctor.model.intelligent.js";
import nurseModel from "../models/nurse.model.intelligent.js";
import assistantModel from "../models/assistant.model.intelligent.js";
import InsuranceBroker from "../models/insurance-broker.model.intelligent.js";
import { InsuranceCompany } from "../models/insurance-company.model.intelligent.js";
import jwt from "jsonwebtoken";
import { JWT_CONFIG } from "../config/auth.config.js";
import UserPostgres from "../models/postgres/user.model.postgres.js";
import DoctorPostgres from "../models/postgres/doctor.model.postgres.js";
import NursePostgres from "../models/postgres/nurse.model.postgres.js";
import AssistantPostgres from "../models/postgres/doctor-assistant.model.postgres.js";
import { validateMembership, checkMembershipExpiry } from "./membership.middleware.js";

const DEV_TOKEN_ALLOWLIST = new Set(["dev-user-token", "dev-doctor-token", "dev-corporate-token"]);
const ALLOW_DEV_TOKENS = ["development", "test"].includes(process.env.NODE_ENV);

const TENANT_BYPASS_ROLES = new Set(["admin", "super_admin", "system_admin", "platform_admin", "doctor"]);

// Organization admin roles
const ORG_ADMIN_ROLES = new Set([
  "hospital_admin", "clinic_admin", "lab_admin", "pharmacy_admin",
  "tpa_admin", "psu_admin", "ngo_admin", "insurer_admin",
  "corporate_admin", "homecare_admin", "ambulance_admin"
]);

// Clinic staff roles that should map to specific authorization handling
const CLINIC_STAFF_ROLES = new Set([
  "doctor", "doctor_assistant", "receptionist", "nurse", "staff"
]);

// Hospital roles that should be recognized by the auth middleware
const HOSPITAL_ROLES = new Set([
  "hospital", "hospital_admin", "hospital_staff", "hospital_doctor"
]);

const ROLE_ALIASES = {
  system_admin: "admin",
  super_admin: "admin",
  platform_admin: "admin",
  corporate_admin: "corporate",
  hospital_admin: "hospital",
  hospital_staff: "hospital",
  hospital_doctor: "hospital",
  clinic_admin: "clinic",
  lab_admin: "lab",
  pharmacy_admin: "pharmacy",
  tpa_admin: "tpa",
  psu_admin: "psu",
  ngo_admin: "ngo",
  insurer_admin: "insurer",
  homecare_admin: "homecare",
  ambulance_admin: "ambulance",
  doctor_assistant: "assistant"
};

const normalizeRole = (role) => ROLE_ALIASES[role] || role;

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
  // Skip auth for Twilio webhooks and other public endpoints that set skipAuth
  console.log('🔐 [authUser] Called for path:', req.path, 'skipAuth:', req.skipAuth);
  if (req.skipAuth) {
    console.log('✅ [authUser] Skipping auth, skipAuth=true');
    return next();
  }

  const token = req.headers.authorization?.split(" ")[1];

  if (!token) {
    console.log('❌ [authUser] No token found');
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

    // Doctor role: fetch full profile from DB BEFORE tenant bypass
    // (ensures firstName/lastName are populated for video call display names)
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

    // Admins/team bypass tenant restrictions (but mismatch is logged)
    // Note: doctors are handled above to ensure full DB profile is loaded
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
    if ((decoded.role === "corporate" || decoded.userType === "corporate") && decoded.role !== "corporate_admin") {
      const corporateId = decoded.id || decoded.corporateId || decoded.userId;
      req.user = {
        id: corporateId,
        corporateId,
        email: decoded.email,
        companyName: decoded.companyName,
        role: "corporate",
        userType: "corporate",
        organization_id: decoded.organization_id || decoded.organizationId,
        organization_type: decoded.organization_type || 'corporate',
        tenant_id: decoded.tenant_id || decoded.tenantId,
      };
      req.userRole = "corporate";
      const tenantBinding = bindTenantContext(
        req,
        decoded.tenant_id || decoded.organization_id || decoded.tenantId || decoded.organizationId || null
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

    if (decoded.role === "insurance_company") {
      const insuranceCompany = await safeFindByPk(
        InsuranceCompany,
        null,
        decoded.id,
        { attributes: { exclude: ["password"] } }
      );

      if (!insuranceCompany) {
        return res.status(401).json({ message: "insurance company not found" });
      }

      req.user = { ...insuranceCompany, role: "insurance_company" };
      req.userRole = "insurance_company";
      return next();
    }

    if (decoded.role === "broker" || decoded.role === "insurance_broker") {
      const broker = await safeFindByPk(
        InsuranceBroker,
        null,
        decoded.id,
        { attributes: { exclude: ["password"] } }
      );

      if (!broker) {
        return res.status(401).json({ message: "broker not found" });
      }

      req.user = { ...broker, role: "broker" };
      req.userRole = "broker";
      return next();
    }

    // Handle clinic staff roles (doctor, doctor_assistant, receptionist, nurse, staff)
    // FIXED: Map clinic staff tokens with type='clinic_staff' to proper authorization
    if (decoded.type === "clinic_staff" || CLINIC_STAFF_ROLES.has(decoded.role)) {
      req.user = {
        id: decoded.id,
        email: decoded.email,
        role: decoded.role,
        first_name: decoded.first_name,
        last_name: decoded.last_name,
        organization_id: decoded.organization_id || decoded.clinic_id,
        tenant_id: decoded.tenant_id || decoded.clinic_id,
        clinic_id: decoded.clinic_id,
        clinic_name: decoded.clinic_name,
        type: "clinic_staff",
      };
      // Map doctor_assistant role to 'assistant' for requireRole() compatibility
      req.userRole = decoded.role === "doctor_assistant" ? "assistant" : decoded.role;
      const tenantBinding = bindTenantContext(
        req,
        decoded.tenant_id || decoded.organization_id || decoded.clinic_id || null
      );
      if (!tenantBinding.ok) {
        return res.status(tenantBinding.status).json(tenantBinding.body);
      }
      return next();
    }

    // Handle hospital roles (hospital, hospital_admin, hospital_staff, hospital_doctor)
    // FIXED: Map hospital tokens to proper authorization
    if (decoded.userType === "hospital" || HOSPITAL_ROLES.has(decoded.role)) {
      req.user = {
        id: decoded.id,
        email: decoded.email,
        role: decoded.role,
        userType: "hospital",
        hospital_id: decoded.hospital_id || decoded.hospitalId,
        hospitalId: decoded.hospital_id || decoded.hospitalId,
        hospitalName: decoded.hospitalName,
        tenant_id: decoded.tenant_id || decoded.hospital_id,
        organization_id: decoded.organization_id || decoded.hospital_id,
        subdomain: decoded.subdomain,
        custom_domain: decoded.custom_domain,
      };
      // Map hospital_admin to 'hospital' for requireRole('hospital') compatibility
      req.userRole = HOSPITAL_ROLES.has(decoded.role) ? "hospital" : decoded.role;
      const tenantBinding = bindTenantContext(
        req,
        decoded.tenant_id || decoded.organization_id || decoded.hospital_id || null
      );
      if (!tenantBinding.ok) {
        return res.status(tenantBinding.status).json(tenantBinding.body);
      }
      return next();
    }

    if (decoded.role === "corporate") {
      const corporateId = decoded.corporateId || decoded.userId || decoded.id;
      req.user = {
        id: corporateId,
        corporateId,
        email: decoded.email,
        role: decoded.role,
        userType: "corporate",
        organization_id: decoded.organization_id || decoded.organizationId,
        tenant_id: decoded.tenant_id || decoded.tenantId,
      };
      req.userRole = "corporate";
      const tenantBinding = bindTenantContext(
        req,
        decoded.tenant_id || decoded.organization_id || null
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
    req.userRole = decoded.role || user?.role || (user?.isAdmin ? "admin" : (user?.isTeam ? "team" : "user"));
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
    console.log('🔑 [requireRole] Called with role:', role, 'req.userRole:', req.userRole, 'path:', req.path);
    if (!req.userRole) {
      console.log('❌ [requireRole] No userRole, returning 401');
      return res.status(401).json({ message: 'Unauthorized' });
    }
    
    // Support array of roles
    const allowedRoles = Array.isArray(role) ? role : [role];
    
    const normalizedRole = normalizeRole(req.userRole);
    const normalizedUserRole = normalizeRole(req.user?.role);
    
    // Check if user has any allowed role
    // Also check isTeam flag if 'team' is in allowed roles
    // FIXED: Support hospital roles properly
    const hasRole = allowedRoles.includes(normalizedRole) ||
      allowedRoles.includes(normalizedUserRole) ||
      (allowedRoles.includes('team') && (req.user?.isTeam || req.userRole === 'team')) ||
      (allowedRoles.includes('admin') && (req.user?.isAdmin || req.userRole === 'admin' || req.userRole === 'system_admin')) ||
      (allowedRoles.includes('hospital') && (req.user?.userType === 'hospital' || HOSPITAL_ROLES.has(req.user?.role))) ||
      (allowedRoles.includes('assistant') && (normalizedRole === 'assistant' || normalizedUserRole === 'assistant'));
    
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
