/**
 * Server-side Aadhaar QR decode from a photo (fallback when browser live-scan fails).
 * Engines: ZBar (binary-safe, dense QR) → zxing-wasm.
 *
 * Critical: Secure QR is often byte-mode — always prefer raw bytes over text.
 */
import fs from 'fs';
import { prepareZXingModule, readBarcodes } from 'zxing-wasm/reader';
import { fileURLToPath } from 'url';
import path from 'path';
import { parseAadhaarQrInput } from './aadhaar-qr.service.js';
import { zbarDecodeJpegBytes } from './aadhaar-zbar-decode.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WASM_PATH = path.resolve(
  __dirname,
  '../node_modules/zxing-wasm/dist/reader/zxing_reader.wasm'
);

let ready = null;

async function ensureWasm() {
  if (!ready) {
    ready = (async () => {
      const wasmBinary = fs.readFileSync(WASM_PATH);
      await prepareZXingModule({
        overrides: { wasmBinary },
        fireImmediately: true,
      });
      return true;
    })().catch((e) => {
      console.warn('[aadhaar-image] wasm init failed:', e.message);
      return false;
    });
  }
  return ready;
}

function payloadLooksValid(text, bytes) {
  const t = String(text || '').trim();
  if (/^\d{80,}$/.test(t)) return true;
  if (t.includes('PrintLetterBarcodeData') || t.startsWith('<')) return true;
  if (bytes && bytes.length >= 50) return true;
  return false;
}

function bytesFromResult(r) {
  if (r?.bytes?.length) return r.bytes;
  if (r?.bytesECI?.length) return r.bytesECI;
  // Hex textMode fallback
  const hex = String(r?.text || '').replace(/\s+/g, '');
  if (/^[0-9a-fA-F]{100,}$/.test(hex) && hex.length % 2 === 0) {
    try {
      return Buffer.from(hex, 'hex');
    } catch {
      /* ignore */
    }
  }
  return null;
}

const OPTION_SETS = [
  {
    formats: ['QRCode'],
    tryHarder: true,
    tryInvert: true,
    tryRotate: true,
    tryDownscale: true,
    tryDenoise: true,
    maxNumberOfSymbols: 4,
    characterSet: 'Binary',
    binarizer: 'LocalAverage',
  },
  {
    formats: ['QRCode'],
    tryHarder: true,
    tryInvert: true,
    tryRotate: true,
    tryDownscale: true,
    maxNumberOfSymbols: 4,
    characterSet: 'Binary',
    binarizer: 'GlobalHistogram',
  },
  {
    formats: ['QRCode'],
    tryHarder: true,
    tryInvert: true,
    tryRotate: true,
    tryDownscale: true,
    maxNumberOfSymbols: 4,
    characterSet: 'Binary',
    textMode: 'Hex',
  },
  {
    formats: ['QRCode'],
    tryHarder: true,
    tryInvert: true,
    tryRotate: true,
    tryDownscale: true,
    maxNumberOfSymbols: 3,
  },
];

/**
 * @param {Buffer|Uint8Array} imageBytes
 * @returns {Promise<{ success: boolean, fields?: object, message?: string, engine?: string }>}
 */
export async function decodeAadhaarFromImageBytes(imageBytes) {
  if (!imageBytes?.length) {
    return { success: false, message: 'Empty image' };
  }

  const bytesIn =
    imageBytes instanceof Uint8Array ? imageBytes : new Uint8Array(imageBytes);

  // ZBar first — better on dense Secure QR / soft laptop frames
  try {
    const zbarHit = await zbarDecodeJpegBytes(bytesIn);
    if (zbarHit) {
      const qrText = /^\d+$/.test(String(zbarHit.text || '').trim())
        ? String(zbarHit.text).trim()
        : undefined;
      const qrBytesBase64 = zbarHit.bytes?.length
        ? Buffer.from(zbarHit.bytes).toString('base64')
        : undefined;
      const parsed = parseAadhaarQrInput({
        qrText: qrText || (String(zbarHit.text || '').includes('<') ? zbarHit.text : undefined),
        qrBytesBase64,
      });
      if (parsed.success) {
        return {
          ...parsed,
          qrText: qrText || parsed.qrText,
          qrBytesBase64: qrBytesBase64 || parsed.qrBytesBase64,
          engine: 'server-zbar',
        };
      }
    }
  } catch (e) {
    console.warn('[aadhaar-image] zbar failed:', e.message);
  }

  const ok = await ensureWasm();
  if (!ok) {
    return { success: false, message: 'QR decoder unavailable on server' };
  }

  for (const opts of OPTION_SETS) {
    try {
      const results = await readBarcodes(bytesIn, opts);
      for (const r of results || []) {
        if (!r?.isValid) continue;
        const text = r.text || '';
        const bytes = bytesFromResult(r);
        if (!payloadLooksValid(text, bytes)) continue;

        const qrText = /^\d+$/.test(String(text).trim()) ? String(text).trim() : undefined;
        let qrBytesBase64;
        if (bytes?.length) {
          qrBytesBase64 = Buffer.from(bytes).toString('base64');
        }

        const parsed = parseAadhaarQrInput({
          qrText: qrText || (text.includes('<') ? text : undefined),
          qrBytesBase64,
        });
        if (parsed.success) {
          return {
            ...parsed,
            qrText: qrText || parsed.qrText,
            qrBytesBase64: qrBytesBase64 || parsed.qrBytesBase64,
            engine: 'server-zxing-wasm',
          };
        }
      }
    } catch (e) {
      console.warn('[aadhaar-image] readBarcodes failed:', e.message);
    }
  }

  return {
    success: false,
    message:
      'No Aadhaar QR found in the photo. Use the large QR on the BACK of the card, fill the frame, avoid glare.',
  };
}

export default { decodeAadhaarFromImageBytes };
