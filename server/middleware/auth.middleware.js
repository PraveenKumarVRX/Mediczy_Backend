import userModel from "../models/user.model.intelligent.js";
import { COOKIE_NAMES } from "../config/cookies.config.js";
import doctorModel from "../models/doctor.model.intelligent.js";
import nurseModel from "../models/nurse.model.intelligent.js";
import assistantModel from "../models/assistant.model.intelligent.js";
import InsuranceBroker from "../models/insurance-broker.model.intelligent.js";
import { InsuranceCompany } from "../models/insurance-company.model.intelligent.js";
import { TPA } from "../models/tpa.model.intelligent.js";
import jwt from "jsonwebtoken";
import { JWT_CONFIG } from "../config/auth.config.js";
import UserPostgres from "../models/postgres/user.model.postgres.js";
import DoctorPostgres from "../models/postgres/doctor.model.postgres.js";
import NursePostgres from "../models/postgres/nurse.model.postgres.js";
import AssistantPostgres from "../models/postgres/doctor-assistant.model.postgres.js";
import { validateMembership, checkMembershipExpiry } from "./membership.middleware.js";
import { checkPasswordChangeRequired } from "./password-change.middleware.js";
// Centralized role constants — single source of truth (no local duplicates)
import {
  TENANT_BYPASS_ROLES,
  ORG_ADMIN_ROLES,
  CLINIC_STAFF_ROLES,
  HOSPITAL_ROLES,
  ROLE_ALIASES,
  normalizeRole,
} from "../config/roles.config.js";
import { isTokenRevoked } from "../services/token-revocation.service.js";

const DEV_TOKEN_ALLOWLIST = new Set(["dev-user-token", "dev-doctor-token", "dev-corporate-token"]);
// Dev tokens: only accepted in explicit non-production environments with explicit opt-in env var.
const ALLOW_DEV_TOKENS =
  process.env.NODE_ENV !== "production" &&
  ["development", "test"].includes(process.env.NODE_ENV) &&
  process.env.ALLOW_DEV_TOKENS === "true";

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

const getAuthorizationBearerToken = (req) => {
  const header = req.headers.authorization || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
};

const isTeamOrAdminBearerToken = (token) => {
  if (!token || !JWT_CONFIG.SECRET) return false;
  try {
    const decoded = jwt.verify(token, JWT_CONFIG.SECRET);
    const role = String(decoded.role || "").toLowerCase();
    const userType = String(decoded.userType || "").toLowerCase();
    return Boolean(
      decoded.isTeam ||
      decoded.isAdmin ||
      userType === "team" ||
      role === "team" ||
      role === "admin" ||
      role === "super_admin" ||
      role === "super admin"
    );
  } catch {
    return false;
  }
};

const resolveAuthToken = (req) => {
  // Always prefer an explicit bearer token — cookie is only a fallback for
  // browser sessions that don't inject a token via the Authorization header.
  // Preferring cookie over bearer caused stale patient cookies (msz_access)
  // to shadow valid doctor/team bearer tokens sent on the same domain.
  const bearerToken = getAuthorizationBearerToken(req);
  if (bearerToken) return bearerToken;
  return req.cookies?.[COOKIE_NAMES.ACCESS] || null;
};

export const authUser = async (req, res, next) => {
  // Skip auth for Twilio webhooks and other public endpoints that set skipAuth
  if (req.skipAuth) {
    return next();
  }

  // Accept token from httpOnly cookie (web) or Authorization header (mobile/API clients).
  // Team/admin portals are bearer-token based; prefer a valid team/admin bearer
  // over a stale patient cookie when both are present.
  const token = resolveAuthToken(req);

  if (!token) {
    return res.status(401).json({ success:false, code:"authentication_required", message:"Authentication required" });
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

    // JTI revocation check — covers all portals whose login handlers store the JTI
    if (decoded.jti && await isTokenRevoked(decoded.jti)) {
      return res.status(401).json({ message: "Token has been revoked" });
    }

    // Doctor role: fetch full profile from DB BEFORE tenant bypass
    // (ensures firstName/lastName are populated for video call display names)
    if (decoded.role === "doctor") {
      const doctor = await safeFindByPk(
        DoctorPostgres,
        doctorModel,
        decoded.id,
        { attributes: { exclude: ["password"] } }
      );

      if (!doctor) {
        return res.status(401).json({ message: "doctor not found" });
      }

      // Status re-check — prevents suspended doctors continuing mid-session
      if (doctor.status && doctor.status !== "active") {
        return res.status(403).json({ message: "Doctor account is inactive or suspended" });
      }

      req.user = { ...doctor, id: doctor.id || decoded.id, role: "doctor" };
      req.userRole = "doctor";
      const tenantBinding = bindTenantContext(req, resolveTenantFromEntity(doctor));
      if (!tenantBinding.ok) {
        return res.status(tenantBinding.status).json(tenantBinding.body);
      }
      return next();
    }

    // Admins/team: DB re-check to prevent revoked admins continuing on valid JWT
    if (decoded.isAdmin || decoded.isTeam || TENANT_BYPASS_ROLES.has(decoded.role)) {
      const adminUser = await safeFindByPk(
        UserPostgres,
        userModel,
        decoded.id,
        { attributes: ["id", "email", "role", "isAdmin", "isTeam", "status", "firstName", "lastName", "tenant_id", "metadata", "organization_id"] }
      );

      if (!adminUser) {
        return res.status(401).json({ message: "Admin/team account not found" });
      }

      if (adminUser.status !== "active") {
        return res.status(403).json({ message: "Account is inactive or suspended" });
      }

      req.user = {
        ...adminUser,
        id: adminUser.id || decoded.id,
        email: adminUser.email || decoded.email,
        role: adminUser.role || decoded.role || (decoded.isAdmin ? "admin" : "team"),
        firstName: adminUser.firstName || decoded.firstName || "System",
        lastName: adminUser.lastName || decoded.lastName || "User",
        isAdmin: adminUser.isAdmin || decoded.isAdmin || false,
        isTeam: adminUser.isTeam || decoded.isTeam || false,
        tenantId: decoded.tenantId || adminUser.tenantId || adminUser.tenant_id || adminUser.organization_id || null,
        tenant_id: decoded.tenantId || adminUser.tenant_id || adminUser.organization_id || null,
      };
      req.userRole = decoded.isTeam ? "team" : (decoded.isAdmin ? "admin" : decoded.role);
      return next();
    }

    if (decoded.role === "nurse") {
      const nurse = await safeFindByPk(NursePostgres, nurseModel, decoded.id);

      if (!nurse) {
        return res.status(401).json({ message: "nurse not found" });
      }

      // isActive + status re-check
      if (nurse.status && nurse.status !== "active") {
        return res.status(403).json({ message: "Nurse account is inactive" });
      }
      if (nurse.isActive === false) {
        return res.status(403).json({ message: "Nurse account is disabled" });
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
        return res.status(401).json({ message: "assistant not found" });
      }

      // Status re-check
      if (assistant.status && assistant.status !== "active") {
        return res.status(403).json({ message: "Assistant account is inactive" });
      }
      if (assistant.isActive === false) {
        return res.status(403).json({ message: "Assistant account is disabled" });
      }

      req.user = { ...assistant, role: "assistant" };
      req.userRole = "assistant";
      const tenantBinding = bindTenantContext(req, resolveTenantFromEntity(assistant));
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

    if (decoded.role === "tpa" || decoded.role === "tpa_admin") {
      const tpa = await safeFindByPk(
        TPA,
        null,
        decoded.id,
        { attributes: ["id", "email", "tpaName", "contactPersonName", "status", "isActive", "phoneNumber"] }
      );

      if (!tpa) {
        return res.status(401).json({ message: "TPA account not found" });
      }
      if (tpa.status && tpa.status !== "active") {
        return res.status(403).json({ message: "TPA account is inactive" });
      }
      if (tpa.isActive === false) {
        return res.status(403).json({ message: "TPA account has been disabled" });
      }

      req.user = {
        id: tpa.id || decoded.id,
        email: tpa.email || decoded.email,
        role: "tpa",
        userType: "tpa",
        tpaName: tpa.tpaName,
        contactPersonName: tpa.contactPersonName,
        phoneNumber: tpa.phoneNumber,
      };
      req.userRole = "tpa";
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

    // token_version check — invalidates sessions issued before the last password change
    if (decoded.tokenVersion !== undefined) {
      try {
        const meta = typeof user.metadata === 'string' ? JSON.parse(user.metadata) : (user.metadata || {});
        const dbVersion = meta.tokenVersion || 0;
        if (decoded.tokenVersion < dbVersion) {
          return res.status(401).json({ message: "Session invalidated. Please log in again." });
        }
      } catch { /* metadata parse error — allow through */ }
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
      isAdmin: user.isAdmin || decoded.isAdmin,
      tenantId: decoded.tenantId || user.tenantId || user.tenant_id || user.dataValues?.tenant_id || null,
      tenant_id: decoded.tenantId || user.tenant_id || user.dataValues?.tenant_id || null
    };
    req.userRole = decoded.role || user?.role || (user?.isAdmin ? "admin" : (user?.isTeam ? "team" : "user"));
    const tenantBinding = bindTenantContext(req, resolveTenantFromEntity(user));
    if (!tenantBinding.ok) {
      return res.status(tenantBinding.status).json(tenantBinding.body);
    }

    // Admin/HR-provisioned accounts (metadata.requirePasswordChange) must set a
    // real password before anything else — ahead of the membership check below,
    // since a brand-new temp-password account has no business being membership-
    // gated yet. No-ops for every other session (the flag is absent/false).
    return checkPasswordChangeRequired(req, res, () => {
      // Validate membership for regular users (not admins)
      if (req.userRole === 'user' && !user.isAdmin) {
        return validateMembership(req, res, next);
      }

      return next();
    });
  } catch (error) {
    console.log("❌ Token verification FAILED. Error:", error.message);
    return res.status(401).json({ message: error.message });
  }
};

/**
 * Optional auth middleware — parses token if present, but does NOT reject
 * unauthenticated requests. Sets req.user if valid token found, otherwise
 * continues with req.user = undefined.  Used for endpoints that support
 * both authenticated and guest access (e.g. emergency triage).
 */
export const authUserOptional = async (req, _res, next) => {
  const token =
    req.cookies?.[COOKIE_NAMES.ACCESS] ||
    req.headers.authorization?.split(' ')[1];
  if (!token) return next();                       // no token → continue as guest

  try {
    const decoded = jwt.verify(token, JWT_CONFIG.SECRET);

    // Minimal user resolution — just enough to populate req.user.id
    if (decoded.role === 'doctor') {
      const doctor = await safeFindByPk(DoctorPostgres, doctorModel, decoded.id, {
        attributes: { exclude: ['password'] }
      });
      if (doctor) {
        req.user = { ...doctor, id: doctor.id || decoded.id, role: 'doctor' };
        req.userRole = 'doctor';
      }
    } else {
      // Regular user / admin / team
      const user = await safeFindByPk(UserPostgres, userModel, decoded.id, {
        attributes: { exclude: ['password'] }
      });
      if (user) {
        req.user = {
          ...user,
          id: user.id || user._id || user.dataValues?.id || decoded.id,
          role: decoded.role || 'user'
        };
        req.userRole = decoded.role || 'user';
      }
    }
  } catch (_err) {
    // Invalid / expired token → treat as guest (no rejection)
    console.log('[authUserOptional] Token invalid, proceeding as guest:', _err.message);
  }
  return next();
};

export const requireRole = (role) => {
  return (req, res, next) => {
    if (!req.userRole) {
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

/**
 * requireRole() normalises a `hospital_admin` token to plain `hospital` (ROLE_ALIASES), so a role
 * list that names only 'hospital_admin' can never match a real hospital admin. Use this for
 * admin-only routes: a genuine hospital_admin token passes, every other role goes through the
 * normal requireRole(roles) check — it does NOT open the route to other hospital staff.
 */
export const requireRoleOrHospitalAdmin = (roles) => {
  const base = requireRole(roles);
  return (req, res, next) => {
    if (req.user?.role === 'hospital_admin' && req.user?.userType === 'hospital') return next();
    return base(req, res, next);
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
