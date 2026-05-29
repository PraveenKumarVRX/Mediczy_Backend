/**
 * Employee ID Normalizer Service — Week 1
 * Handles whitespace, case, separator, and zero-padding normalization
 * for consistent employee ID matching across data sources.
 */

const SEPARATOR_REGEX = /[.\-_/]/g;
const PURELY_NUMERIC_REGEX = /^\d+$/;
const STANDARD_NUMERIC_LENGTH = 6;

/**
 * Normalize a raw employee ID for consistent comparison.
 *
 * Transformations applied (in order):
 *   1. Trim leading/trailing whitespace
 *   2. Uppercase
 *   3. Strip common separators (. - _ /)
 *   4. Zero-pad if the result is purely numeric to STANDARD_NUMERIC_LENGTH digits
 *
 * @param {string} rawId
 * @returns {{ normalized: string, original: string, transformations: string[] }}
 */
export function normalizeEmployeeId(rawId) {
  if (rawId === null || rawId === undefined) {
    return { normalized: '', original: String(rawId ?? ''), transformations: ['input_was_null_or_undefined'] };
  }

  const original = String(rawId);
  const transformations = [];
  let value = original;

  // 1. Trim whitespace
  const trimmed = value.trim();
  if (trimmed !== value) {
    transformations.push('trimmed_whitespace');
    value = trimmed;
  }

  // 2. Uppercase
  const uppered = value.toUpperCase();
  if (uppered !== value) {
    transformations.push('converted_to_uppercase');
    value = uppered;
  }

  // 3. Strip separators
  const stripped = value.replace(SEPARATOR_REGEX, '');
  if (stripped !== value) {
    transformations.push('removed_separators');
    value = stripped;
  }

  // 4. Zero-pad purely numeric IDs
  if (PURELY_NUMERIC_REGEX.test(value) && value.length < STANDARD_NUMERIC_LENGTH) {
    const padded = value.padStart(STANDARD_NUMERIC_LENGTH, '0');
    transformations.push(`zero_padded_to_${STANDARD_NUMERIC_LENGTH}_digits`);
    value = padded;
  }

  if (transformations.length === 0) {
    transformations.push('no_change');
  }

  return { normalized: value, original, transformations };
}

/**
 * Validate a raw employee ID and return normalized form.
 *
 * Rules:
 *  - Must not be empty after normalization
 *  - Must be at least 3 characters after normalization
 *  - Must not exceed 20 characters after normalization
 *  - Must only contain alphanumeric characters after normalization
 *
 * @param {string} rawId
 * @returns {{ valid: boolean, normalized: string, reason?: string }}
 */
export function validateEmployeeId(rawId) {
  const { normalized } = normalizeEmployeeId(rawId);

  if (!normalized || normalized.length === 0) {
    return { valid: false, normalized, reason: 'Employee ID cannot be empty' };
  }

  if (normalized.length < 3) {
    return { valid: false, normalized, reason: 'Employee ID must be at least 3 characters after normalization' };
  }

  if (normalized.length > 20) {
    return { valid: false, normalized, reason: 'Employee ID must not exceed 20 characters after normalization' };
  }

  if (!/^[A-Z0-9]+$/.test(normalized)) {
    return { valid: false, normalized, reason: 'Employee ID may only contain alphanumeric characters' };
  }

  return { valid: true, normalized };
}

export default { normalizeEmployeeId, validateEmployeeId };
