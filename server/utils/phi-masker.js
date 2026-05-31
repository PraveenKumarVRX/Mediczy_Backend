/**
 * PHI Field Masker
 * ----------------
 * Masks Protected Health Information before writing to audit logs,
 * error logs, or any system that persists data outside the encrypted PHI store.
 *
 * Standards: HIPAA Safe Harbor (§164.514(b)) — 18 identified fields.
 * Usage: maskPhi(object) → object with PHI fields replaced by [REDACTED-<type>]
 */

// ─── PHI Field Registry ───────────────────────────────────────────────────────

export const PHI_FIELDS = new Set([
  // Direct identifiers (HIPAA Safe Harbor category)
  'password', 'passwordHash', 'password_hash',
  'medicalHistory', 'medical_history',
  'familyHistory', 'family_history',
  'personalHistory', 'personal_history',
  'allergies',
  'medications',
  'chronicConditions', 'chronic_conditions',
  'bloodType', 'blood_type',
  'abhaHealthId', 'abha_id', 'abha_health_id',
  'aadhaarLast4', 'aadhaar_last_4',
  'panNumber', 'pan_number',
  'emergencyContact_json', 'emergencyContact',
  'mfaSecret', 'mfa_secret',
  'insurancePolicyNumber', 'policy_number',
  // Quasi-identifiers — mask in logs but keep for display
  'dateOfBirth', 'date_of_birth',
  'phoneNumber', 'phone_number', 'phone',
  'address_street', 'address_json',
]);

// Fields that hold structured objects potentially containing PHI
const PHI_OBJECT_FIELDS = new Set([
  'patientDetails', 'patient_details',
  'doctorDetails', 'doctor_details',
  'old_values', 'new_values',   // audit log change diffs
  'metadata',
  'preferences',
]);

// ─── Masking Logic ────────────────────────────────────────────────────────────

/**
 * Deep-mask PHI fields from an object.
 * Safe to call with null/undefined/non-object values.
 *
 * @param {any}     input
 * @param {Object}  [opts]
 * @param {number}  [opts.depth=3]   Max recursion depth (prevents circular refs)
 * @returns {any}   Masked copy — does NOT mutate the original
 */
export function maskPhi(input, opts = {}) {
  const maxDepth = opts.depth ?? 3;
  return _mask(input, maxDepth);
}

function _mask(value, depth) {
  if (depth <= 0 || value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(v => _mask(v, depth - 1));
  if (typeof value !== 'object') return value;

  const masked = {};
  for (const [key, val] of Object.entries(value)) {
    if (PHI_FIELDS.has(key)) {
      masked[key] = _redactValue(val);
    } else if (PHI_OBJECT_FIELDS.has(key) && val && typeof val === 'object') {
      masked[key] = _maskNestedObject(val, depth - 1);
    } else {
      masked[key] = _mask(val, depth - 1);
    }
  }
  return masked;
}

function _maskNestedObject(obj, depth) {
  if (depth <= 0) return '[OBJECT REDACTED]';
  if (Array.isArray(obj)) return obj.map(v => _maskNestedObject(v, depth - 1));
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = PHI_FIELDS.has(k) ? _redactValue(v) : v;
  }
  return out;
}

function _redactValue(val) {
  if (val === null || val === undefined) return val;
  if (typeof val === 'string')  return `[REDACTED-${val.length}chars]`;
  if (typeof val === 'number')  return '[REDACTED-NUM]';
  if (Array.isArray(val))       return `[REDACTED-ARRAY(${val.length})]`;
  if (typeof val === 'object')  return '[REDACTED-OBJ]';
  return '[REDACTED]';
}

/**
 * Mask a single value by field name.
 * Useful when you know the field is PHI but have the value directly.
 */
export function maskField(fieldName, value) {
  if (PHI_FIELDS.has(fieldName)) return _redactValue(value);
  return value;
}

/**
 * Check if a field name is a known PHI field.
 */
export function isPhiField(fieldName) {
  return PHI_FIELDS.has(fieldName);
}

export default maskPhi;
