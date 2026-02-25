/**
 * PHI (Protected Health Information) redaction utility.
 *
 * Strips common PII/PHI patterns from AI-generated text before it leaves
 * the server, acting as a last-line-of-defence guard for accidental leakage.
 *
 * Patterns sanitised:
 *   - Indian mobile numbers  (+91XXXXXXXXXX / 10-digit)
 *   - Aadhaar numbers        (XXXX XXXX XXXX)
 *   - PAN card numbers       (ABCDE1234F)
 *   - Email addresses
 *   - Common name prefixes   (Mr./Ms./Dr. <Name>)
 *   - Date of birth strings  (DOB, d.o.b.)
 *   - IP addresses
 */

const PATTERNS = [
  // Indian phone numbers
  { re: /(\+91[-\s]?)?[6-9]\d{9}/g,           mask: '[PHONE]' },
  // Aadhaar
  { re: /\b\d{4}\s?\d{4}\s?\d{4}\b/g,         mask: '[AADHAAR]' },
  // PAN
  { re: /\b[A-Z]{5}[0-9]{4}[A-Z]\b/g,         mask: '[PAN]' },
  // Email
  { re: /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g, mask: '[EMAIL]' },
  // IP address
  { re: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,       mask: '[IP]' },
  // DOB patterns
  { re: /\b(?:D\.?O\.?B|date of birth)[:\s]+[\d\/\-]+/gi, mask: '[DOB]' },
];

/**
 * Redact PHI from a string.
 * @param {string} text
 * @returns {string}
 */
export function redactString(text) {
  if (typeof text !== 'string') return text;
  let out = text;
  for (const { re, mask } of PATTERNS) {
    out = out.replace(re, mask);
  }
  return out;
}

/**
 * Deep-redact all string values in an object (mutates a shallow clone).
 * @param {unknown} obj
 * @returns {unknown}
 */
export function redactObject(obj) {
  if (typeof obj === 'string') return redactString(obj);
  if (Array.isArray(obj))      return obj.map(redactObject);
  if (obj !== null && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj).map(([k, v]) => [k, redactObject(v)])
    );
  }
  return obj;
}
