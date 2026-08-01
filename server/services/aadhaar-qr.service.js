/**
 * Aadhaar QR decoder — kiosk / portal demographic prefill.
 *
 * Modern Secure QR pipeline (UIDAI):
 *   QR image → decimal digit string → BigInt → bytes → zlib inflate → 0xFF fields
 *
 * Also supports:
 *   - raw binary QR bytes (byte mode) that inflate directly
 *   - legacy gzip XML <PrintLetterBarcodeData/>
 *
 * Never returns the full Aadhaar number — last 4 digits only.
 */
import zlib from 'zlib';
import { validateAadhaar } from '../utils/validators.js';

const SECURE_QR_DELIMITER = 0xff;

/** Demographics field order after optional version / email-mobile indicator. */
const SECURE_QR_DEMO_FIELDS = [
  'referenceId',
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
  'vtc',
];

function genderCodeToLabel(code) {
  const c = String(code || '').trim().toUpperCase();
  if (c === 'M') return 'male';
  if (c === 'F') return 'female';
  if (c === 'T') return 'other';
  return null;
}

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
  try {
    return zlib.inflateRawSync(buffer);
  } catch {
    try {
      return zlib.inflateSync(buffer);
    } catch {
      return zlib.gunzipSync(buffer);
    }
  }
}

/** Convert Secure QR decimal digit string → compressed bytes. */
export function decimalStringToBuffer(decimalString) {
  const s = String(decimalString || '').trim();
  if (!/^\d+$/.test(s)) {
    throw new Error('Expected decimal digit string');
  }
  if (s.length > 20000) {
    throw new Error('QR decimal string too long');
  }
  let hex = BigInt(s).toString(16);
  if (hex.length % 2 !== 0) hex = `0${hex}`;
  return Buffer.from(hex, 'hex');
}

function mapDemoFields(parts, offset) {
  if (parts.length < offset + SECURE_QR_DEMO_FIELDS.length) return null;
  const fields = {};
  SECURE_QR_DEMO_FIELDS.forEach((key, i) => {
    fields[key] = parts[offset + i].toString('utf8').trim();
  });
  if (!fields.name || fields.name.length < 2) return null;

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

function tryParseSecureQr(rawBytes) {
  const inflated = inflateAny(rawBytes);
  const parts = splitBuffer(inflated, SECURE_QR_DELIMITER);

  // Layout A: demographics start at index 0 (referenceId…)
  // Layout B: version + emailMobileIndicator prefix, demographics at index 2
  const candidates = [
    mapDemoFields(parts, 0),
    mapDemoFields(parts, 2),
    mapDemoFields(parts, 1),
  ].filter(Boolean);

  return candidates[0] || null;
}

function tryParseLegacyXml(rawBytes) {
  let xml;
  try {
    xml = zlib.gunzipSync(rawBytes).toString('utf8');
  } catch {
    xml = rawBytes.toString('utf8');
  }
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

function toResult(result) {
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

/**
 * @param {Buffer} rawBytes
 */
export function parseAadhaarQr(rawBytes) {
  if (!Buffer.isBuffer(rawBytes) || rawBytes.length === 0) {
    return { success: false, message: 'No QR data received' };
  }

  // Raw bytes that are actually ASCII digits of the Secure QR decimal string
  const asLatin1 = rawBytes.toString('latin1').trim();
  // Secure QR decimal strings are typically 1k–10k digits (photo included);
  // short demographic-only test payloads can be ~80+ digits.
  if (/^\d{80,}$/.test(asLatin1)) {
    try {
      return parseAadhaarQr(decimalStringToBuffer(asLatin1));
    } catch { /* fall through */ }
  }

  let result = null;
  try {
    result = tryParseSecureQr(rawBytes);
  } catch { /* fall through */ }

  if (!result) {
    try {
      result = tryParseLegacyXml(rawBytes);
    } catch { /* fall through */ }
  }

  return toResult(result);
}

/**
 * Prefer qrText (decimal Secure QR) when present; else qrBytesBase64.
 * @param {{ qrBytesBase64?: string, qrText?: string }} input
 */
export function parseAadhaarQrInput(input = {}) {
  const qrText = typeof input.qrText === 'string' ? input.qrText.trim() : '';
  if (qrText) {
    if (/^\d{80,}$/.test(qrText)) {
      try {
        return parseAadhaarQr(decimalStringToBuffer(qrText));
      } catch (e) {
        return { success: false, message: e.message || 'Invalid Secure QR decimal payload' };
      }
    }
    if (qrText.includes('PrintLetterBarcodeData') || qrText.startsWith('<')) {
      return parseAadhaarQr(Buffer.from(qrText, 'utf8'));
    }
  }

  const b64 = typeof input.qrBytesBase64 === 'string' ? input.qrBytesBase64 : '';
  if (b64) {
    let rawBytes;
    try {
      rawBytes = Buffer.from(b64, 'base64');
    } catch {
      return { success: false, message: 'Invalid base64 payload' };
    }
    const fromBytes = parseAadhaarQr(rawBytes);
    if (fromBytes.success) return fromBytes;
  }

  // jsQR / some browsers return byte-mode Secure QR as a latin1 string in `data`
  if (qrText && qrText.length > 40) {
    const fromLatin1 = parseAadhaarQr(Buffer.from(qrText, 'latin1'));
    if (fromLatin1.success) return fromLatin1;
  }

  if (!b64 && !qrText) {
    return {
      success: false,
      message: 'qrText (Secure QR digits) or qrBytesBase64 is required',
    };
  }

  return {
    success: false,
    message: 'This does not look like an Aadhaar QR code. Please scan the QR on the back of the Aadhaar card, or enter details manually.',
  };
}

export default { parseAadhaarQr, parseAadhaarQrInput, decimalStringToBuffer };
