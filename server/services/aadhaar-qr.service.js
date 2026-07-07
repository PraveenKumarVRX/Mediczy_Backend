/**
 * Aadhaar QR decoder — kiosk self-registration demographic prefill.
 *
 * Aadhaar cards printed since ~2018 carry a "Secure QR Code": the QR's raw
 * byte payload (NOT text — must come from the scanner's raw-bytes API, not
 * a UTF-8-decoded string, or multi-byte fields corrupt) is zlib-deflated;
 * once inflated, fields are separated by byte 0xFF in a fixed order. Cards
 * printed before that carry the older format: a UTF-8 XML document,
 * gzip-compressed, in a single self-closing <PrintLetterBarcodeData/> tag.
 *
 * UIDAI's Secure QR Code never encodes the full Aadhaar number — only the
 * cardholder's demographics plus (in some versions) the last 4 digits. The
 * older XML format DOES carry the full 12-digit "uid" attribute, which is
 * truncated to the last 4 digits immediately below and never returned.
 */
import zlib from 'zlib';
import { validateAadhaar } from '../utils/validators.js';

const SECURE_QR_DELIMITER = 0xff;

// Field order per UIDAI Secure QR Code spec (versions 1-4 share this prefix;
// later versions append extra fields after email/mobile bits, which we ignore).
const SECURE_QR_FIELDS = [
  'referenceId',   // email/mobile presence bits + last 4 digits of Aadhaar, packed
  'name',
  'dob',
  'gender',
  'careOf',
  'district',
  'landmark',
  'house',
  'location',
  'pincode',
  'postOffice',
  'state',
  'street',
  'subDistrict',
  'vtc', // village/town/city
];

function genderCodeToLabel(code) {
  const c = String(code || '').trim().toUpperCase();
  if (c === 'M') return 'male';
  if (c === 'F') return 'female';
  if (c === 'T') return 'other';
  return null;
}

/** Split a Buffer on single-byte delimiter without touching UTF-8 boundaries mid-field. */
function splitBuffer(buf, delimiter) {
  const parts = [];
  let start = 0;
  for (let i = 0; i < buf.length; i++) {
    if (buf[i] === delimiter) {
      parts.push(buf.subarray(start, i));
      start = i + 1;
    }
  }
  parts.push(buf.subarray(start));
  return parts;
}

function inflateAny(buffer) {
  // UIDAI's reference implementation uses java.util.zip.Inflater with no
  // header (raw deflate); some third-party generators wrap it as zlib.
  try {
    return zlib.inflateRawSync(buffer);
  } catch {
    return zlib.inflateSync(buffer);
  }
}

/** Try the current (2018+) Secure QR Code binary format. */
function tryParseSecureQr(rawBytes) {
  const inflated = inflateAny(rawBytes);
  const parts = splitBuffer(inflated, SECURE_QR_DELIMITER);
  if (parts.length < SECURE_QR_FIELDS.length) return null;

  const fields = {};
  SECURE_QR_FIELDS.forEach((key, i) => {
    fields[key] = parts[i].toString('utf8').trim();
  });

  // referenceId's last 4 chars are the last 4 Aadhaar digits by spec.
  const last4Match = fields.referenceId?.match(/(\d{4})\D*$/);
  const aadhaarLast4 = last4Match ? last4Match[1] : null;

  const addressParts = [
    fields.house, fields.street, fields.landmark, fields.location,
    fields.vtc, fields.postOffice, fields.subDistrict, fields.district,
    fields.state, fields.pincode,
  ].filter(Boolean);

  return {
    format: 'secure-qr',
    name: fields.name || null,
    dob: normalizeDob(fields.dob),
    gender: genderCodeToLabel(fields.gender),
    careOf: fields.careOf || null,
    address: addressParts.join(', ') || null,
    pincode: fields.pincode || null,
    state: fields.state || null,
    aadhaarLast4,
  };
}

/** Fallback: pre-2018 XML format — gzip-compressed <PrintLetterBarcodeData/>. */
function tryParseLegacyXml(rawBytes) {
  const xml = zlib.gunzipSync(rawBytes).toString('utf8');
  const tagMatch = xml.match(/<PrintLetterBarcodeData\b([^>]*)\/?>/i);
  if (!tagMatch) return null;

  const attrs = {};
  const attrRe = /(\w+)\s*=\s*"([^"]*)"/g;
  let m;
  while ((m = attrRe.exec(tagMatch[1])) !== null) {
    attrs[m[1].toLowerCase()] = m[2];
  }

  const uid = (attrs.uid || '').replace(/\D/g, '');
  const aadhaarLast4 = uid.length === 12 && validateAadhaar(uid) ? uid.slice(-4) : (uid.slice(-4) || null);

  const addressParts = [
    attrs.house, attrs.street, attrs.lm, attrs.loc, attrs.vtc,
    attrs.po, attrs.subdist, attrs.dist, attrs.state, attrs.pc,
  ].filter(Boolean);

  return {
    format: 'legacy-xml',
    name: attrs.name || null,
    dob: normalizeDob(attrs.dob || (attrs.yob ? `01/01/${attrs.yob}` : null)),
    gender: genderCodeToLabel(attrs.gender),
    careOf: attrs.co || null,
    address: addressParts.join(', ') || null,
    pincode: attrs.pc || null,
    state: attrs.state || null,
    aadhaarLast4,
  };
}

/** "DD-MM-YYYY" / "DD/MM/YYYY" -> "YYYY-MM-DD"; passes through if already ISO. */
function normalizeDob(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) {
    const [, d, mo, y] = m;
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return null;
}

/**
 * @param {Buffer} rawBytes - raw QR payload bytes (NOT a decoded/UTF-8 string —
 *   the caller must use the scanner's raw-bytes API, e.g. zxing's getRawBytes()).
 * @returns {{ success: true, fields: object } | { success: false, message: string }}
 */
export function parseAadhaarQr(rawBytes) {
  if (!Buffer.isBuffer(rawBytes) || rawBytes.length === 0) {
    return { success: false, message: 'No QR data received' };
  }

  let result = null;
  try {
    result = tryParseSecureQr(rawBytes);
  } catch { /* not a Secure QR — fall through */ }

  if (!result) {
    try {
      result = tryParseLegacyXml(rawBytes);
    } catch { /* not the legacy format either */ }
  }

  if (!result || !result.name) {
    return {
      success: false,
      message: 'This does not look like an Aadhaar QR code. Please scan the QR on the back of the Aadhaar card, or enter details manually.',
    };
  }

  const [firstName, ...rest] = (result.name || '').trim().split(/\s+/);
  return {
    success: true,
    fields: {
      firstName: firstName || null,
      lastName: rest.join(' ') || null,
      fullName: result.name,
      dateOfBirth: result.dob,
      gender: result.gender,
      careOf: result.careOf,
      address: result.address,
      pincode: result.pincode,
      state: result.state,
      aadhaarLast4: result.aadhaarLast4,
    },
    source: result.format,
  };
}

export default { parseAadhaarQr };
