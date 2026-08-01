/**
 * Client-side Aadhaar Secure QR parse (mirrors server/services/aadhaar-qr.service.js).
 * Lets check-in work even when the parse API is slow/unreachable after a successful decode.
 */
import { inflate, inflateRaw, ungzip } from "pako";

export type AadhaarFields = {
  firstName?: string | null;
  lastName?: string | null;
  fullName?: string | null;
  dateOfBirth?: string | null;
  gender?: string | null;
  careOf?: string | null;
  address?: string | null;
  pincode?: string | null;
  state?: string | null;
  aadhaarLast4?: string | null;
};

export type AadhaarParseResult =
  | { success: true; fields: AadhaarFields; source: string }
  | { success: false; message: string };

const DEMO_FIELDS = [
  "referenceId",
  "name",
  "dob",
  "gender",
  "careOf",
  "district",
  "landmark",
  "house",
  "location",
  "pincode",
  "postOffice",
  "state",
  "street",
  "subDistrict",
  "vtc",
] as const;

function genderCodeToLabel(code: string | undefined): string | null {
  const c = String(code || "").trim().toUpperCase();
  if (c === "M") return "male";
  if (c === "F") return "female";
  if (c === "T") return "other";
  return null;
}

function normalizeDob(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) {
    const [, d, mo, y] = m;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return null;
}

function splitBuffer(buf: Uint8Array, delimiter: number): Uint8Array[] {
  const parts: Uint8Array[] = [];
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

function inflateAny(buffer: Uint8Array): Uint8Array {
  try {
    return inflateRaw(buffer);
  } catch {
    try {
      return inflate(buffer);
    } catch {
      return ungzip(buffer);
    }
  }
}

function decimalStringToBytes(decimalString: string): Uint8Array {
  const s = String(decimalString || "").trim();
  if (!/^\d+$/.test(s)) throw new Error("Expected decimal digit string");
  if (s.length > 20000) throw new Error("QR decimal string too long");
  let hex = BigInt(s).toString(16);
  if (hex.length % 2 !== 0) hex = `0${hex}`;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function mapDemoFields(parts: Uint8Array[], offset: number) {
  if (parts.length < offset + DEMO_FIELDS.length) return null;
  const fields: Record<string, string> = {};
  DEMO_FIELDS.forEach((key, i) => {
    fields[key] = new TextDecoder("utf-8").decode(parts[offset + i]).trim();
  });
  if (!fields.name || fields.name.length < 2) return null;

  const last4Match = fields.referenceId?.match(/(\d{4})\D*$/);
  const aadhaarLast4 = last4Match ? last4Match[1] : null;
  const addressParts = [
    fields.house,
    fields.street,
    fields.landmark,
    fields.location,
    fields.vtc,
    fields.postOffice,
    fields.subDistrict,
    fields.district,
    fields.state,
    fields.pincode,
  ].filter(Boolean);

  return {
    format: "secure-qr",
    name: fields.name || null,
    dob: normalizeDob(fields.dob),
    gender: genderCodeToLabel(fields.gender),
    careOf: fields.careOf || null,
    address: addressParts.join(", ") || null,
    pincode: fields.pincode || null,
    state: fields.state || null,
    aadhaarLast4,
  };
}

function tryParseSecureQr(rawBytes: Uint8Array) {
  const inflated = inflateAny(rawBytes);
  const parts = splitBuffer(inflated, 0xff);
  return mapDemoFields(parts, 0) || mapDemoFields(parts, 2) || mapDemoFields(parts, 1);
}

function tryParseLegacyXml(rawBytes: Uint8Array) {
  let xml: string;
  try {
    xml = new TextDecoder("utf-8").decode(ungzip(rawBytes));
  } catch {
    xml = new TextDecoder("utf-8").decode(rawBytes);
  }
  const tagMatch = xml.match(/<PrintLetterBarcodeData\b([^>]*)\/?>/i);
  if (!tagMatch) return null;
  const attrs: Record<string, string> = {};
  const attrRe = /(\w+)\s*=\s*"([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = attrRe.exec(tagMatch[1])) !== null) {
    attrs[m[1].toLowerCase()] = m[2];
  }
  const uid = (attrs.uid || "").replace(/\D/g, "");
  const aadhaarLast4 = uid.slice(-4) || null;
  const addressParts = [
    attrs.house,
    attrs.street,
    attrs.lm,
    attrs.loc,
    attrs.vtc,
    attrs.po,
    attrs.subdist,
    attrs.dist,
    attrs.state,
    attrs.pc,
  ].filter(Boolean);
  return {
    format: "legacy-xml",
    name: attrs.name || null,
    dob: normalizeDob(attrs.dob || (attrs.yob ? `01/01/${attrs.yob}` : null)),
    gender: genderCodeToLabel(attrs.gender),
    careOf: attrs.co || null,
    address: addressParts.join(", ") || null,
    pincode: attrs.pc || null,
    state: attrs.state || null,
    aadhaarLast4,
  };
}

function toResult(result: ReturnType<typeof tryParseSecureQr>): AadhaarParseResult {
  if (!result?.name) {
    return {
      success: false,
      message:
        "This does not look like an Aadhaar QR code. Use the large QR on the back of the card.",
    };
  }
  const [firstName, ...rest] = result.name.trim().split(/\s+/);
  return {
    success: true,
    source: result.format,
    fields: {
      firstName: firstName || null,
      lastName: rest.join(" ") || null,
      fullName: result.name,
      dateOfBirth: result.dob,
      gender: result.gender,
      careOf: result.careOf,
      address: result.address,
      pincode: result.pincode,
      state: result.state,
      aadhaarLast4: result.aadhaarLast4,
    },
  };
}

function parseRawBytes(rawBytes: Uint8Array): AadhaarParseResult {
  if (!rawBytes.length) return { success: false, message: "No QR data received" };

  const asLatin1 = new TextDecoder("latin1").decode(rawBytes).trim();
  if (/^\d{80,}$/.test(asLatin1)) {
    try {
      return parseRawBytes(decimalStringToBytes(asLatin1));
    } catch {
      /* fall through */
    }
  }

  let result = null;
  try {
    result = tryParseSecureQr(rawBytes);
  } catch {
    /* fall through */
  }
  if (!result) {
    try {
      result = tryParseLegacyXml(rawBytes);
    } catch {
      /* fall through */
    }
  }
  return toResult(result);
}

/** Parse scanner payload entirely in the browser. */
export function parseAadhaarPayloadClient(input: {
  qrText?: string;
  qrBytesBase64?: string;
}): AadhaarParseResult {
  const qrText = typeof input.qrText === "string" ? input.qrText.trim() : "";
  const b64 = typeof input.qrBytesBase64 === "string" ? input.qrBytesBase64 : "";

  if (qrText && /^\d{80,}$/.test(qrText)) {
    try {
      const parsed = parseRawBytes(decimalStringToBytes(qrText));
      if (parsed.success) return parsed;
    } catch {
      /* fall through */
    }
  }

  if (qrText && (qrText.includes("PrintLetterBarcodeData") || qrText.startsWith("<"))) {
    const parsed = parseRawBytes(new TextEncoder().encode(qrText));
    if (parsed.success) return parsed;
  }

  if (b64) {
    try {
      const parsed = parseRawBytes(b64ToBytes(b64));
      if (parsed.success) return parsed;
    } catch {
      /* fall through */
    }
  }

  if (qrText && qrText.length > 40) {
    const bytes = new Uint8Array(qrText.length);
    for (let i = 0; i < qrText.length; i++) bytes[i] = qrText.charCodeAt(i) & 0xff;
    const parsed = parseRawBytes(bytes);
    if (parsed.success) return parsed;
  }

  return {
    success: false,
    message:
      "Could not read Aadhaar details from that QR. Photograph the large QR on the back of the card.",
  };
}
