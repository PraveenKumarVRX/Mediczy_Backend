/**
 * ZBar WASM decoder for dense UIDAI Secure QR.
 *
 * Why ZBar (not only zxing-wasm):
 * - Enables ZBAR_CFG_BINARY (preserves byte-mode Secure QR)
 * - Native C decoder often wins on dense / soft phone-camera frames
 * - Proven Aadhaar web readers prioritize simple pixel scanners over heavy ZX pipelines
 */
import {
  scanImageData,
  setModuleArgs,
  ZBarConfigType,
  ZBarScanner,
  ZBarSymbolType,
  type ZBarSymbol,
} from "@undecaf/zbar-wasm";
// Vite-bundled WASM URL — survives CDN / hashed asset deploys
import zbarWasmUrl from "@undecaf/zbar-wasm/dist/zbar.wasm?url";
import { payloadFromDecoded, type AadhaarScanPayload } from "@/lib/aadhaarQrPayload";

let configured = false;
let scannerPromise: Promise<ZBarScanner | null> | null = null;

function ensureZbarModuleArgs() {
  if (configured) return;
  configured = true;
  setModuleArgs({
    locateFile: (filename: string) =>
      filename.endsWith(".wasm") ? zbarWasmUrl : filename,
  });
}

async function getAadhaarZbarScanner(): Promise<ZBarScanner | null> {
  if (!scannerPromise) {
    scannerPromise = (async () => {
      try {
        ensureZbarModuleArgs();
        const scanner = await ZBarScanner.create();
        // Disable everything, then enable QR (+ SQ) with binary + inverted retry
        scanner.setConfig(ZBarSymbolType.ZBAR_NONE, ZBarConfigType.ZBAR_CFG_ENABLE, 0);
        scanner.setConfig(ZBarSymbolType.ZBAR_QRCODE, ZBarConfigType.ZBAR_CFG_ENABLE, 1);
        scanner.setConfig(ZBarSymbolType.ZBAR_SQCODE, ZBarConfigType.ZBAR_CFG_ENABLE, 1);
        scanner.setConfig(ZBarSymbolType.ZBAR_QRCODE, ZBarConfigType.ZBAR_CFG_BINARY, 1);
        scanner.setConfig(ZBarSymbolType.ZBAR_NONE, ZBarConfigType.ZBAR_CFG_BINARY, 1);
        scanner.setConfig(ZBarSymbolType.ZBAR_NONE, ZBarConfigType.ZBAR_CFG_TEST_INVERTED, 1);
        // Denser scan grid helps Secure QR on soft laptop webcams
        scanner.setConfig(ZBarSymbolType.ZBAR_NONE, ZBarConfigType.ZBAR_CFG_X_DENSITY, 1);
        scanner.setConfig(ZBarSymbolType.ZBAR_NONE, ZBarConfigType.ZBAR_CFG_Y_DENSITY, 1);
        return scanner;
      } catch (e) {
        console.warn("[aadhaar-qr] zbar init failed", e);
        return null;
      }
    })();
  }
  return scannerPromise;
}

function symbolToPayload(sym: ZBarSymbol, engine: string): AadhaarScanPayload | null {
  const raw = sym?.data;
  let bytes: Uint8Array | null = null;
  if (raw && raw.length) {
    // ZBar returns Int8Array — copy to unsigned bytes for Secure QR binary
    bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw[i] & 0xff;
  }
  // Prefer binary bytes; fall back to UTF-8/latin1 text decode
  let text = "";
  try {
    text = sym.decode?.("utf-8") || "";
  } catch {
    try {
      text = sym.decode?.("iso-8859-1") || "";
    } catch {
      text = "";
    }
  }
  return payloadFromDecoded(text, bytes, engine);
}

/** Warm ZBar so the first live frame isn't cold-start. */
export function warmAadhaarZbar(): void {
  void getAadhaarZbarScanner();
}

/**
 * Decode ImageData with ZBar. Fast enough for ~180ms live loops on full frames.
 */
export async function tryZbarImageData(
  imageData: ImageData,
  engine = "zbar"
): Promise<AadhaarScanPayload | null> {
  if (!imageData || imageData.width < 20 || imageData.height < 20) return null;
  try {
    const scanner = await getAadhaarZbarScanner();
    if (!scanner) return null;
    const symbols = await scanImageData(imageData, scanner);
    for (const sym of symbols || []) {
      if (sym.type !== ZBarSymbolType.ZBAR_QRCODE && sym.type !== ZBarSymbolType.ZBAR_SQCODE) {
        continue;
      }
      const payload = symbolToPayload(sym, engine);
      if (payload) return payload;
    }
  } catch {
    /* no symbol */
  }
  return null;
}
