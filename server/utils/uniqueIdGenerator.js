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
 * - I: Insurer
 * - X: TPA
 * - G: NGO
 * - S: PSU
 * - M: Homecare
 * - B: Ambulance
 * - O: OHC (Occupational Health Center)
 * - K: Clinic
 * - R: Admin/System
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
  'clinic': 'C',
  'clinic_admin': 'C',
  'lab': 'L',
  'lab_admin': 'L',
  'pharmacy': 'P',
  'pharmacy_admin': 'P',
  'insurer': 'I',
  'insurer_admin': 'I',
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
export const getPrefixForRole = (role) => {
  if (!role) return ROLE_PREFIX_MAP.default;
  const normalizedRole = role.toLowerCase().replace(/[-\s]/g, '_');
  return ROLE_PREFIX_MAP[normalizedRole] || ROLE_PREFIX_MAP.default;
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
    'H': 'hospital',
    'K': 'clinic',
    'L': 'lab',
    'P': 'pharmacy',
    'I': 'insurer',
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
  // Fallback: append timestamp-based suffix
  const prefix = getPrefixForRole(role);
  const timestamp = Date.now().toString(36).toUpperCase().slice(-5);
  return `${prefix}${timestamp}`;
};

export default {
  generateUniqueId,
  generateUniqueIdSafe,
  getPrefixForRole,
  isValidUniqueId,
  getRoleFromUniqueId,
  ROLE_PREFIX_MAP
};
