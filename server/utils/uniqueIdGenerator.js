/**
 * Unique ID Generator
 * Generates 6-character alphanumeric IDs with role-specific prefixes
 * Format: [Prefix][5 alphanumeric characters]
 * 
 * Prefixes:
 * - U: User/Patient
 * - D: Doctor
 * - N: Nurse
 * - A: Assistant (Doctor Assistant)
 * - C: Corporate
 * - T: Team
 * - H: Hospital
 * - L: Lab
 * - P: Pharmacy
 * - I: Insurance company / insurer
 * - V: Insurance broker
 * - X: TPA
 * - G: NGO
 * - S: PSU
 * - M: Homecare
 * - B: Ambulance
 * - O: OHC (Occupational Health Center)
 * - K: Clinic
 * - Y: Diagnostic centre
 * - W: Wellness company
 * - Z: Aggregator
 * - E: Corporate employee
 * - R: Admin/System
 *
 * THE DATABASE IS THE AUTHORITY. entity_kinds / entity_registry (migration
 * 20261005000000-entity-uid-rule.sql) issue and register these ids on every insert, enforce that an
 * organisation's id carries its kind's prefix, and guarantee no two entities in ANY table share
 * one. This file mirrors the prefixes for code that must name a kind before the row exists;
 * scripts/ci/verify-entity-uid-rule.mjs fails if the two ever disagree. See
 * docs/architecture/ENTITY_UID_RULE.md.
 */

// Characters used for ID generation (excluding confusing chars like 0/O, 1/I/l)
const CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * Generate a random 5-character alphanumeric string
 */
const generateRandomPart = () => {
  let result = '';
  for (let i = 0; i < 5; i++) {
    result += CHARSET.charAt(Math.floor(Math.random() * CHARSET.length));
  }
  return result;
};

/**
 * Role to prefix mapping
 */
const ROLE_PREFIX_MAP = {
  // Primary roles
  'user': 'U',
  'patient': 'U',
  'doctor': 'D',
  'nurse': 'N',
  'assistant': 'A',
  'doctor_assistant': 'A',
  'team': 'T',
  'team_member': 'T',
  
  // Organization types
  'corporate': 'C',
  'corporate_admin': 'C',
  'corporate_employee': 'E',
  'hospital': 'H',
  'hospital_admin': 'H',
  // Was 'C', the same letter as corporate, while getRoleFromUniqueId() below already said K. The
  // two maps disagreed, and every one of the 547 existing clinic ids carries the wrong C prefix.
  'clinic': 'K',
  'clinic_admin': 'K',
  'diagnostic_centre': 'Y',
  'diagnostic_center': 'Y',
  'diagnostic_centre_admin': 'Y',
  'wellness_company': 'W',
  'wellness_company_admin': 'W',
  'aggregator': 'Z',
  'aggregator_admin': 'Z',
  'lab': 'L',
  'lab_admin': 'L',
  'pharmacy': 'P',
  'pharmacy_admin': 'P',
  'insurer': 'I',
  'insurer_admin': 'I',
  'insurance_company': 'I',
  'insurance_company_admin': 'I',
  'insurance_broker': 'V',
  'broker': 'V',
  'tpa': 'X',
  'tpa_admin': 'X',
  'ngo': 'G',
  'ngo_admin': 'G',
  'psu': 'S',
  'psu_admin': 'S',
  'homecare': 'M',
  'homecare_admin': 'M',
  'ambulance': 'B',
  'ambulance_admin': 'B',
  'ohc': 'O',
  'ohc_admin': 'O',
  'employee': 'E',

  // Department and hospital staff roles stored in the users table.
  // HR staff are part of the hospital (its HRMS), so they carry the staff prefix like every other
  // hospital department role. hr_staff was unmapped and fell back to U.
  'hr_staff': 'T',
  'lab_staff': 'T',
  'pharmacy_staff': 'T',
  'blood_bank_staff': 'T',
  'finance_staff': 'T',
  'accounts_staff': 'T',
  'asset_staff': 'T',
  'biomedical_staff': 'T',
  'procurement_staff': 'T',
  'dietary_staff': 'T',
  'cssd_staff': 'T',
  'infection_control_staff': 'T',
  'consent_staff': 'T',
  'queue_staff': 'T',
  'mortuary_staff': 'T',
  'mrd_staff': 'T',
  'it_edp_staff': 'T',
  'quality_staff': 'T',
  'insurance_desk_staff': 'T',
  'ambulance_driver': 'T',
  
  // Admin roles
  'admin': 'R',
  'system_admin': 'R',
  'super_admin': 'R',
  'platform_admin': 'R',
  
  // Default
  'default': 'U'
};

/**
 * Get prefix for a given role
 * @param {string} role - The user role
 * @returns {string} Single character prefix
 */
const warnedRoles = new Set();
export const getPrefixForRole = (role) => {
  if (!role) return ROLE_PREFIX_MAP.default;
  const normalizedRole = role.toLowerCase().replace(/[-\s]/g, '_');
  const prefix = ROLE_PREFIX_MAP[normalizedRole];
  if (prefix) return prefix;
  // Falling back to U is kept so user creation never fails on a role nobody mapped, but it must
  // not be silent: generateUniqueId('P') and ('T') passed a LETTER where a role belongs, fell
  // through to U here, and gave every patient and team member a U-prefixed id for years.
  if (!warnedRoles.has(normalizedRole)) {
    warnedRoles.add(normalizedRole);
    console.warn(`[uniqueId] no prefix mapped for role "${role}"; using "${ROLE_PREFIX_MAP.default}". Add it to ROLE_PREFIX_MAP.`);
  }
  return ROLE_PREFIX_MAP.default;
};

/**
 * Generate a unique ID for a given role
 * @param {string} role - The user role
 * @returns {string} 6-character unique ID (e.g., "D4K7NP")
 */
export const generateUniqueId = (role = 'user') => {
  const prefix = getPrefixForRole(role);
  const randomPart = generateRandomPart();
  return `${prefix}${randomPart}`;
};

/**
 * Validate a unique ID format
 * @param {string} uniqueId - The ID to validate
 * @returns {boolean} True if valid format
 */
export const isValidUniqueId = (uniqueId) => {
  if (!uniqueId || typeof uniqueId !== 'string') return false;
  if (uniqueId.length !== 6) return false;
  
  const prefix = uniqueId.charAt(0);
  const validPrefixes = Object.values(ROLE_PREFIX_MAP);
  if (!validPrefixes.includes(prefix)) return false;
  
  const randomPart = uniqueId.substring(1);
  return /^[A-Z0-9]{5}$/.test(randomPart);
};

/**
 * Extract role type from unique ID
 * @param {string} uniqueId - The unique ID
 * @returns {string|null} Role type or null if invalid
 */
export const getRoleFromUniqueId = (uniqueId) => {
  if (!isValidUniqueId(uniqueId)) return null;
  
  const prefix = uniqueId.charAt(0);
  const prefixToRole = {
    'U': 'user',
    'D': 'doctor',
    'N': 'nurse',
    'A': 'assistant',
    'T': 'team',
    'C': 'corporate',
    'E': 'corporate_employee',
    'H': 'hospital',
    'K': 'clinic',
    'Y': 'diagnostic_centre',
    'W': 'wellness_company',
    'Z': 'aggregator',
    'L': 'lab',
    'P': 'pharmacy',
    'I': 'insurer',
    'V': 'insurance_broker',
    'X': 'tpa',
    'G': 'ngo',
    'S': 'psu',
    'M': 'homecare',
    'B': 'ambulance',
    'O': 'ohc',
    'R': 'admin'
  };
  
  return prefixToRole[prefix] || null;
};

/**
 * Generate unique ID ensuring no collision with existing IDs
 * @param {string} role - The user role
 * @param {Set<string>} existingIds - Set of existing IDs to avoid
 * @param {number} maxAttempts - Maximum generation attempts
 * @returns {string} Unique ID guaranteed not to collide
 */
export const generateUniqueIdSafe = (role, existingIds = new Set(), maxAttempts = 100) => {
  for (let i = 0; i < maxAttempts; i++) {
    const newId = generateUniqueId(role);
    if (!existingIds.has(newId)) {
      return newId;
    }
  }
  // The old fallback appended a timestamp, which is not collision-safe: two calls in the same
  // millisecond return the same id. Failing loudly is better than handing out a duplicate.
  throw new Error(`Unable to allocate a unique id for role "${role}" after ${maxAttempts} attempts`);
};

/**
 * Generate an ID that does not already exist in a Sequelize model/table.
 * This prevents rare public-ID collisions before the database unique index fires.
 */
export const generateUniqueIdForModel = async (model, role = 'user', field = 'unique_id', maxAttempts = 50) => {
  if (!model || typeof model.findOne !== 'function') {
    return generateUniqueId(role);
  }

  for (let i = 0; i < maxAttempts; i++) {
    const candidate = generateUniqueId(role);
    const existing = await model.findOne({ where: { [field]: candidate }, attributes: ['id'] });
    if (!existing) {
      return candidate;
    }
  }

  throw new Error(`Unable to allocate unique public ID for role "${role}" after ${maxAttempts} attempts`);
};

export const isUniqueIdCompatibleWithRole = (uniqueId, role) => {
  if (!isValidUniqueId(uniqueId) || !role) return false;
  return uniqueId.charAt(0) === getPrefixForRole(role);
};

/**
 * kind -> prefix, exactly as seeded into the entity_kinds table. The verifier compares this with the
 * database so the two cannot drift. Aliases (insurer, employee, ...) live in ROLE_PREFIX_MAP only.
 */
export const ENTITY_KIND_PREFIXES = Object.freeze({
  corporate: 'C', hospital: 'H', clinic: 'K', lab: 'L', pharmacy: 'P', ambulance: 'B',
  homecare: 'M', diagnostic_centre: 'Y', ngo: 'G', tpa: 'X', insurance_company: 'I', broker: 'V',
  wellness_company: 'W', psu: 'S', aggregator: 'Z',
  user: 'U', patient: 'U', doctor: 'D', nurse: 'N', assistant: 'A', team: 'T',
  corporate_employee: 'E', ohc: 'O', admin: 'R',
});

export default {
  ENTITY_KIND_PREFIXES,
  generateUniqueId,
  generateUniqueIdSafe,
  generateUniqueIdForModel,
  getPrefixForRole,
  isValidUniqueId,
  isUniqueIdCompatibleWithRole,
  getRoleFromUniqueId,
  ROLE_PREFIX_MAP
};
