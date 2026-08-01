/**
 * Shared Aadhaar QR payload helpers (no decoder deps — safe for ZBar/ZXing modules).
 */

export type AadhaarScanPayload = {
  qrBytesBase64?: string;
  qrText?: string;
  engine?: string;
  /** Present when server already parsed demographics */
  fields?: Record<string, unknown>;
};

function bytesToBase64(raw: Uint8Array | number[]): string {
  let binary = "";
  for (let i = 0; i < raw.length; i++) binary += String.fromCharCode(raw[i] & 0xff);
  return btoa(binary);
}

function isDigitString(s: string, min = 80): boolean {
  return /^\d+$/.test(s) && s.length >= min;
}

function bytesAreAsciiDigits(bytes: Uint8Array, min = 80): boolean {
  if (bytes.length < min) return false;
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] < 48 || bytes[i] > 57) return false;
  }
  return true;
}

/**
 * Only accept payloads that look like real Aadhaar Secure/legacy QR.
 * Never treat arbitrary binary mojibake as success (causes false capture loops).
 */
export function payloadFromDecoded(
  text: string | null | undefined,
  rawBytes?: Uint8Array | number[] | null,
  engine?: string
): AadhaarScanPayload | null {
  const t = String(text || "").trim();
  const bytes =
    rawBytes && rawBytes.length > 0
      ? rawBytes instanceof Uint8Array
        ? rawBytes
        : new Uint8Array(rawBytes)
      : null;

  // Prefer raw bytes — Secure QR is often byte-mode (compressed) or ASCII digits
  if (bytes && bytes.length >= 50) {
    if (bytesAreAsciiDigits(bytes, 80)) {
      return {
        qrText: new TextDecoder("ascii").decode(bytes),
        qrBytesBase64: bytesToBase64(bytes),
        engine,
      };
    }
    if (isDigitString(t)) {
      return { qrText: t, qrBytesBase64: bytesToBase64(bytes), engine };
    }
    // Compressed Secure QR binary — server inflates
    return { qrBytesBase64: bytesToBase64(bytes), engine };
  }

  if (isDigitString(t)) {
    return { qrText: t, engine };
  }

  if (t.includes("PrintLetterBarcodeData") || t.startsWith("<")) {
    return {
      qrText: t,
      qrBytesBase64: btoa(unescape(encodeURIComponent(t))),
      engine,
    };
  }

  return null;
}
