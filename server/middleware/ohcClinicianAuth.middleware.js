/**
 * Lets an `ohc_doctor` (OHC-audience JWT) or `corporate_cmo` (corporate-portal JWT) use the hospital's
 * real prescription and clinical-referral routes with a genuine, auto-provisioned `doctors` identity
 * (see ohc-clinician.service.js), WITHOUT touching `authDoctor`/`authUser`+`requireRole` themselves —
 * every other request (every normal doctor/admin, every other authDoctor-gated hospital feature)
 * delegates straight through to the existing, unmodified middleware.
 *
 * Only wired onto the specific prescription (prescription.route.js) and referral (careos.route.js)
 * routes named in the plan — not a blanket grant of doctor access.
 */
import jwt from 'jsonwebtoken';
import { JWT_CONFIG } from '../config/auth.config.js';
import { authDoctor, authUser, requireRole } from './auth.middleware.js';
import { ohcService } from '../services/care-units/index.js';
import { createOhcClinicianService } from '../services/care-units/ohc-clinician.service.js';
import sharedPool from '../db/pgPool.js';

const ohcClinicianService = createOhcClinicianService({ pool: sharedPool });
const OHC_AUDIENCE = 'mediczy-ohc';

/** Decode without side effects, just to tell "is this one of ours" from "let the normal chain handle it". */
function peek(req) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return null;
  try { return jwt.verify(token, JWT_CONFIG.SECRET); } catch { return null; }
}

function isOhcDoctorToken(decoded) {
  return decoded?.aud === OHC_AUDIENCE && decoded?.userType === 'ohc' && decoded?.role === 'ohc_doctor' && decoded?.tokenType === 'access';
}
function isCorporateCmoToken(decoded) {
  return decoded?.userType === 'corporate' && decoded?.role === 'corporate_cmo' && decoded?.tokenType !== 'refresh';
}

/** Re-resolve the OHC-shaped principal from either token family — same resolution corporate-ohc.route.js already uses for the corporate_cmo bridge. */
async function resolveOhcPrincipal(decoded) {
  if (decoded.aud === OHC_AUDIENCE) return (await ohcService.loadPrincipal(decoded.id)).principal || null;
  const { rows } = await sharedPool.query('SELECT unique_id FROM users WHERE id = $1 AND status = $2', [decoded.id, 'active']);
  const uid = rows[0]?.unique_id;
  if (!uid) return null;
  return (await ohcService.loadPrincipal(uid)).principal || null;
}

function bindMinimalTenant(req, tenantId) {
  if (!tenantId) return;
  req.userTenantId = tenantId;
  if (!req.tenantId) { req.tenantId = tenantId; req.tenantSource = 'auth-binding'; }
}

/** Swap in for `authDoctor` on the prescription routes only. */
export const authDoctorOrOhcClinician = async (req, res, next) => {
  const decoded = peek(req);
  if (!isOhcDoctorToken(decoded) && !isCorporateCmoToken(decoded)) return authDoctor(req, res, next);

  try {
    const principal = await resolveOhcPrincipal(decoded);
    if (!principal) return res.status(403).json({ message: 'This account is not currently active' });
    const doctor = await ohcClinicianService.findOrCreateLinkedDoctor(principal);
    req.doctor = doctor.get ? doctor.get({ plain: true }) : doctor;
    bindMinimalTenant(req, req.doctor.organization_id || req.doctor.tenant_id);
    return next();
  } catch (err) {
    if (err.code === 'registration_missing') return res.status(422).json({ success: false, code: err.code, message: err.message });
    console.error('[authDoctorOrOhcClinician]', err.message);
    return res.status(401).json({ message: 'Invalid token' });
  }
};

/** Swap in for `[authUser, requireRole(['doctor','admin'])]` on the referral routes only. */
export const authDoctorOrOhcReferrer = [
  async (req, res, next) => {
    const decoded = peek(req);
    if (!isOhcDoctorToken(decoded) && !isCorporateCmoToken(decoded)) return authUser(req, res, next);

    try {
      const principal = await resolveOhcPrincipal(decoded);
      if (!principal) return res.status(403).json({ message: 'This account is not currently active' });
      const doctor = await ohcClinicianService.findOrCreateLinkedDoctor(principal);
      const plain = doctor.get ? doctor.get({ plain: true }) : doctor;
      req.doctor = plain;
      req.user = { id: plain.id, role: 'doctor' };
      req.userRole = 'doctor';
      bindMinimalTenant(req, plain.organization_id || plain.tenant_id);
      req.__ohcClinicianResolved = true;
      return next();
    } catch (err) {
      if (err.code === 'registration_missing') return res.status(422).json({ success: false, code: err.code, message: err.message });
      console.error('[authDoctorOrOhcReferrer]', err.message);
      return res.status(401).json({ message: 'Invalid token' });
    }
  },
  (req, res, next) => (req.__ohcClinicianResolved ? next() : requireRole(['doctor', 'admin'])(req, res, next)),
];
