import userModel from "../models/user.model.intelligent.js";
import doctorModel from "../models/doctor.model.intelligent.js";
import nurseModel from "../models/nurse.model.intelligent.js";
import assistantModel from "../models/assistant.model.intelligent.js";
import jwt from "jsonwebtoken";
import UserPostgres from "../models/postgres/user.model.postgres.js";
import DoctorPostgres from "../models/postgres/doctor.model.postgres.js";
import NursePostgres from "../models/postgres/nurse.model.postgres.js";
import AssistantPostgres from "../models/postgres/doctor-assistant.model.postgres.js";
import { validateMembership, checkMembershipExpiry } from "./membership.middleware.js";

const DEV_TOKEN_ALLOWLIST = new Set(["dev-user-token", "dev-doctor-token"]);
const ALLOW_DEV_TOKENS =
  process.env.ALLOW_DEV_TOKENS === "true" ||
  ["development", "test"].includes(process.env.NODE_ENV);
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

    const demoRole = token === "dev-doctor-token" ? "doctor" : "user";
    req.user = {
      id: 1,
      email: `${demoRole}@mediczy.com`,
      firstName: "Demo",
      lastName: demoRole === "doctor" ? "Doctor" : "User",
      role: demoRole,
    };
    req.userRole = demoRole;
    req.userTenantId = null;
    req.guardrail = "DEV_TOKEN";
    return next();
  }

  if (!process.env.JWT_SECRET) {
    console.error("FATAL: JWT_SECRET environment variable not set!");
    return res.status(500).json({ message: "Server configuration error" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log(
      "🔹 Token verification SUCCESS. JWT_SECRET:",
      (process.env.JWT_SECRET || "").slice(0, 10) + "..."
    );
    console.log("🔹 Decoded payload:", decoded);

    // Admins bypass tenant restrictions (but mismatch is logged)
    if (decoded.isAdmin || TENANT_BYPASS_ROLES.has(decoded.role)) {
      req.user = {
        id: decoded.id,
        email: decoded.email,
        role: decoded.role || "admin",
        firstName: "System",
        lastName: "Administrator",
        isAdmin: true,
      };
      req.userRole = req.user.role;
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

    if (decoded.role === "corporate") {
      const corporateId = decoded.id || decoded.corporateId;
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

    req.user = user;
    req.userRole = decoded.role || (user?.isAdmin ? "admin" : "user");
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
      (process.env.JWT_SECRET || "").slice(0, 10) + "..."
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
    if (req.userRole !== role) {
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
    if (!process.env.JWT_SECRET) {
      console.error('FATAL: JWT_SECRET environment variable not set!');
      return res.status(500).json({ message: "Server configuration error" });
    }

    // Verify Token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

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

    req.doctor = doctor;
    const tenantBinding = bindTenantContext(req, resolveTenantFromEntity(doctor));
    if (!tenantBinding.ok) {
      return res.status(tenantBinding.status).json(tenantBinding.body);
    }
    next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid token" });
  }
};
