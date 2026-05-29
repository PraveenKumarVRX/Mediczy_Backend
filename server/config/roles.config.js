/**
 * Centralized role & permission constants for MediQzy.
 *
 * ALL role strings used across middleware, routes, and JWT payloads must
 * reference these constants.  Never hardcode role strings in individual files.
 *
 * Consumers:
 *   import { ROLES, PORTAL_MAP, TENANT_BYPASS_ROLES, ORG_ADMIN_ROLES,
 *            HOSPITAL_ROLES, CLINIC_STAFF_ROLES } from '../config/roles.config.js';
 */

// ─── Canonical role identifiers ───────────────────────────────────────────────
export const ROLES = Object.freeze({
  // Platform
  SUPER_ADMIN:            'super_admin',
  ADMIN:                  'admin',
  SYSTEM_ADMIN:           'system_admin',
  PLATFORM_ADMIN:         'platform_admin',

  // Clinical
  DOCTOR:                 'doctor',
  NURSE:                  'nurse',
  ASSISTANT:              'assistant',
  DOCTOR_ASSISTANT:       'doctor_assistant',   // alias → ASSISTANT at runtime

  // Org-level staff
  HOSPITAL:               'hospital',
  HOSPITAL_ADMIN:         'hospital_admin',
  HOSPITAL_STAFF:         'hospital_staff',
  HOSPITAL_DOCTOR:        'hospital_doctor',

  CLINIC:                 'clinic',
  CLINIC_ADMIN:           'clinic_admin',
  CLINIC_STAFF:           'clinic_staff',

  LAB:                    'lab',
  LAB_ADMIN:              'lab_admin',

  PHARMACY:               'pharmacy',
  PHARMACY_ADMIN:         'pharmacy_admin',

  // Payer / Finance
  TPA:                    'tpa',
  TPA_ADMIN:              'tpa_admin',
  INSURANCE_BROKER:       'insurance_broker',
  INSURANCE_COMPANY:      'insurance_company',
  AGGREGATOR:             'aggregator',

  // Corporate / Govt
  CORPORATE:              'corporate',
  CORPORATE_ADMIN:        'corporate_admin',
  PSU:                    'psu',
  PSU_ADMIN:              'psu_admin',
  NGO:                    'ngo',
  NGO_ADMIN:              'ngo_admin',

  // Support
  HOMECARE:               'homecare',
  HOMECARE_ADMIN:         'homecare_admin',
  AMBULANCE:              'ambulance',
  AMBULANCE_ADMIN:        'ambulance_admin',

  // Internal
  TEAM:                   'team',
  USER:                   'user',
});

// ─── Role groups ──────────────────────────────────────────────────────────────

/** Roles that are exempt from tenant-context mismatch hard-stops. */
export const TENANT_BYPASS_ROLES = new Set([
  ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.SYSTEM_ADMIN, ROLES.PLATFORM_ADMIN,
]);

/** Roles that manage an org but are NOT platform-level admins. */
export const ORG_ADMIN_ROLES = new Set([
  ROLES.HOSPITAL_ADMIN, ROLES.CLINIC_ADMIN, ROLES.LAB_ADMIN, ROLES.PHARMACY_ADMIN,
  ROLES.TPA_ADMIN, ROLES.PSU_ADMIN, ROLES.NGO_ADMIN,
  ROLES.CORPORATE_ADMIN, ROLES.HOMECARE_ADMIN, ROLES.AMBULANCE_ADMIN,
]);

/** Hospital staff roles — all map to portal 'hospital' for requireRole(). */
export const HOSPITAL_ROLES = new Set([
  ROLES.HOSPITAL, ROLES.HOSPITAL_ADMIN, ROLES.HOSPITAL_STAFF, ROLES.HOSPITAL_DOCTOR,
]);

/** Clinic staff roles. */
export const CLINIC_STAFF_ROLES = new Set([
  ROLES.DOCTOR, ROLES.DOCTOR_ASSISTANT, ROLES.NURSE, ROLES.CLINIC_STAFF,
  'receptionist', 'staff',
]);

// ─── Role aliases (canonical normalisation) ───────────────────────────────────
export const ROLE_ALIASES = Object.freeze({
  [ROLES.SYSTEM_ADMIN]:      ROLES.ADMIN,
  [ROLES.SUPER_ADMIN]:       ROLES.ADMIN,
  [ROLES.PLATFORM_ADMIN]:    ROLES.ADMIN,
  [ROLES.CORPORATE_ADMIN]:   ROLES.CORPORATE,
  [ROLES.HOSPITAL_ADMIN]:    ROLES.HOSPITAL,
  [ROLES.HOSPITAL_STAFF]:    ROLES.HOSPITAL,
  [ROLES.HOSPITAL_DOCTOR]:   ROLES.HOSPITAL,
  [ROLES.CLINIC_ADMIN]:      ROLES.CLINIC,
  [ROLES.LAB_ADMIN]:         ROLES.LAB,
  [ROLES.PHARMACY_ADMIN]:    ROLES.PHARMACY,
  [ROLES.TPA_ADMIN]:         ROLES.TPA,
  [ROLES.PSU_ADMIN]:         ROLES.PSU,
  [ROLES.NGO_ADMIN]:         ROLES.NGO,
  [ROLES.HOMECARE_ADMIN]:    ROLES.HOMECARE,
  [ROLES.AMBULANCE_ADMIN]:   ROLES.AMBULANCE,
  [ROLES.DOCTOR_ASSISTANT]:  ROLES.ASSISTANT,
});

export const normalizeRole = (role) => ROLE_ALIASES[role] || role;

// ─── Portal → allowed login roles ────────────────────────────────────────────
/**
 * Maps each login portal to the set of roles that may authenticate there.
 * Used by login handlers and cross-portal guards.
 */
export const PORTAL_MAP = Object.freeze({
  admin:       new Set([ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.SYSTEM_ADMIN, ROLES.PLATFORM_ADMIN]),
  team:        new Set([ROLES.TEAM, ROLES.ADMIN, ROLES.SUPER_ADMIN]),
  doctor:      new Set([ROLES.DOCTOR]),
  nurse:       new Set([ROLES.NURSE]),
  hospital:    new Set([...Object.values(HOSPITAL_ROLES)]),
  clinic:      new Set([...Object.values(CLINIC_STAFF_ROLES)]),
  lab:         new Set([ROLES.LAB, ROLES.LAB_ADMIN]),
  pharmacy:    new Set([ROLES.PHARMACY, ROLES.PHARMACY_ADMIN]),
  tpa:         new Set([ROLES.TPA, ROLES.TPA_ADMIN]),
  aggregator:  new Set([ROLES.AGGREGATOR, ROLES.INSURANCE_BROKER]),
  corporate:   new Set([ROLES.CORPORATE, ROLES.CORPORATE_ADMIN]),
  user:        new Set([ROLES.USER]),
});

// ─── Team module permissions ──────────────────────────────────────────────────
export const TEAM_PERMISSIONS = Object.freeze([
  'User Management',
  'Doctor Management',
  'Appointment Management',
  'Patient Reports',
  'Analytics Access',
  'Chat Dashboard Access',
  'Hospital Management',
  'Clinic Management',
  'Lab Management',
  'Pharmacy Management',
  'Health Plans Access',
  'Corporate Management',
  'Broker Management',
  'Support Tickets',
  'Audit Access',
]);

export default { ROLES, TENANT_BYPASS_ROLES, ORG_ADMIN_ROLES, HOSPITAL_ROLES,
  CLINIC_STAFF_ROLES, ROLE_ALIASES, normalizeRole, PORTAL_MAP, TEAM_PERMISSIONS };
