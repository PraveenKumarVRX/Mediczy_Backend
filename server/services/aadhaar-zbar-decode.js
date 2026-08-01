/**
 * Server-side ZBar WASM decode for dense Aadhaar Secure QR.
 * Binary-safe (ZBAR_CFG_BINARY) — complements zxing-wasm.
 */
import jpeg from 'jpeg-js';
import {
  scanRGBABuffer,
  ZBarConfigType,
  ZBarScanner,
  ZBarSymbolType,
} from '@undecaf/zbar-wasm';

let scannerPromise = null;

async function getScanner() {
  if (!scannerPromise) {
    scannerPromise = (async () => {
      const scanner = await ZBarScanner.create();
      scanner.setConfig(ZBarSymbolType.ZBAR_NONE, ZBarConfigType.ZBAR_CFG_ENABLE, 0);
      scanner.setConfig(ZBarSymbolType.ZBAR_QRCODE, ZBarConfigType.ZBAR_CFG_ENABLE, 1);
      scanner.setConfig(ZBarSymbolType.ZBAR_SQCODE, ZBarConfigType.ZBAR_CFG_ENABLE, 1);
      scanner.setConfig(ZBarSymbolType.ZBAR_QRCODE, ZBarConfigType.ZBAR_CFG_BINARY, 1);
      scanner.setConfig(ZBarSymbolType.ZBAR_NONE, ZBarConfigType.ZBAR_CFG_BINARY, 1);
      scanner.setConfig(ZBarSymbolType.ZBAR_NONE, ZBarConfigType.ZBAR_CFG_TEST_INVERTED, 1);
      scanner.setConfig(ZBarSymbolType.ZBAR_NONE, ZBarConfigType.ZBAR_CFG_X_DENSITY, 1);
      scanner.setConfig(ZBarSymbolType.ZBAR_NONE, ZBarConfigType.ZBAR_CFG_Y_DENSITY, 1);
      return scanner;
    })().catch((e) => {
      console.warn('[aadhaar-zbar] init failed:', e.message);
      return null;
    });
  }
  return scannerPromise;
}

function looksLikeAadhaar(text, bytes) {
  const t = String(text || '').trim();
  if (/^\d{80,}$/.test(t)) return true;
  if (t.includes('PrintLetterBarcodeData') || t.startsWith('<')) return true;
  if (bytes && bytes.length >= 50) return true;
  return false;
}

/**
 * @param {Buffer|Uint8Array} imageBytes JPEG (preferred) image bytes
 * @returns {Promise<{ text?: string, bytes?: Uint8Array } | null>}
 */
export async function zbarDecodeJpegBytes(imageBytes) {
  if (!imageBytes?.length) return null;
  try {
    const scanner = await getScanner();
    if (!scanner) return null;

    const input = Buffer.isBuffer(imageBytes) ? imageBytes : Buffer.from(imageBytes);
    // Only JPEG path here — PNG/WebP still handled by zxing-wasm
    const isJpeg = input[0] === 0xff && input[1] === 0xd8;
    if (!isJpeg) return null;

    const decoded = jpeg.decode(input, { useTArray: true, maxMemoryUsageInMB: 512 });
    if (!decoded?.data?.length || !decoded.width || !decoded.height) return null;

    // Cap huge photos to keep memory sane
    let { data, width, height } = decoded;
    const maxSide = 3200;
    if (Math.max(width, height) > maxSide) {
      // Downscale via nearest-neighbor (good enough for QR modules)
      const scale = maxSide / Math.max(width, height);
      const nw = Math.max(1, Math.round(width * scale));
      const nh = Math.max(1, Math.round(height * scale));
      const out = new Uint8Array(nw * nh * 4);
      for (let y = 0; y < nh; y++) {
        const sy = Math.min(height - 1, Math.floor(y / scale));
        for (let x = 0; x < nw; x++) {
          const sx = Math.min(width - 1, Math.floor(x / scale));
          const si = (sy * width + sx) * 4;
          const di = (y * nw + x) * 4;
          out[di] = data[si];
          out[di + 1] = data[si + 1];
          out[di + 2] = data[si + 2];
          out[di + 3] = 255;
        }
      }
      data = out;
      width = nw;
      height = nh;
    }

    const buf = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    const symbols = await scanRGBABuffer(buf, width, height, scanner);
    for (const sym of symbols || []) {
      if (sym.type !== ZBarSymbolType.ZBAR_QRCODE && sym.type !== ZBarSymbolType.ZBAR_SQCODE) {
        continue;
      }
      const raw = sym.data;
      const bytes = raw?.length
        ? Uint8Array.from(raw, (b) => b & 0xff)
        : null;
      let text = '';
      try {
        text = sym.decode('utf-8') || '';
      } catch {
        try {
          text = sym.decode('iso-8859-1') || '';
        } catch {
          text = '';
        }
      }
      if (looksLikeAadhaar(text, bytes)) {
        return { text, bytes };
      }
    }
  } catch (e) {
    console.warn('[aadhaar-zbar] decode failed:', e.message);
  }
  return null;
}

export default { zbarDecodeJpegBytes };
