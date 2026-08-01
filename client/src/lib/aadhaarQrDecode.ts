import jsQR, { type QRCode } from "jsqr";
import {
  BarcodeFormat,
  BinaryBitmap,
  DecodeHintType,
  HybridBinarizer,
  MultiFormatReader,
  NotFoundException,
  RGBLuminanceSource,
} from "@zxing/library";
import { prepareZXingModule, readBarcodes } from "zxing-wasm/reader";

export type AadhaarScanPayload = {
  qrBytesBase64?: string;
  qrText?: string;
  engine?: string;
};

const ZXING_WASM_PUBLIC_URL = `${import.meta.env.BASE_URL || "/"}zxing_reader.wasm`;

let zxingReady: Promise<boolean> | null = null;
let zxingOk = false;

function ensureZxingWasm(): Promise<boolean> {
  if (!zxingReady) {
    zxingReady = Promise.resolve(
      prepareZXingModule({
        overrides: {
          locateFile: (path: string, prefix: string) => {
            if (path.endsWith(".wasm")) return ZXING_WASM_PUBLIC_URL;
            return `${prefix}${path}`;
          },
        },
        fireImmediately: true,
      }) as Promise<unknown>
    ).then(
      () => {
        zxingOk = true;
        return true;
      },
      () => {
        zxingOk = false;
        return false;
      }
    );
  }
  return zxingReady;
}

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

function payloadFromJsQR(code: QRCode, engine: string): AadhaarScanPayload | null {
  return payloadFromDecoded(code.data, code.binaryData, engine);
}

function getImageData(source: CanvasImageSource, width: number, height: number): ImageData | null {
  if (width < 20 || height < 20) return null;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(source, 0, 0, width, height);
  return ctx.getImageData(0, 0, width, height);
}

function cropCenter(imageData: ImageData, ratio = 0.72): ImageData {
  const w = imageData.width;
  const h = imageData.height;
  const side = Math.floor(Math.min(w, h) * ratio);
  const sx = Math.floor((w - side) / 2);
  const sy = Math.floor((h - side) / 2);
  const canvas = document.createElement("canvas");
  canvas.width = side;
  canvas.height = side;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return imageData;
  const tmp = document.createElement("canvas");
  tmp.width = w;
  tmp.height = h;
  const tctx = tmp.getContext("2d");
  if (!tctx) return imageData;
  tctx.putImageData(imageData, 0, 0);
  ctx.drawImage(tmp, sx, sy, side, side, 0, 0, side, side);
  return ctx.getImageData(0, 0, side, side);
}

function scaleImageData(imageData: ImageData, scale: number): ImageData {
  if (Math.abs(scale - 1) < 0.01) return imageData;
  const w = Math.max(1, Math.round(imageData.width * scale));
  const h = Math.max(1, Math.round(imageData.height * scale));
  const src = document.createElement("canvas");
  src.width = imageData.width;
  src.height = imageData.height;
  const sctx = src.getContext("2d");
  if (!sctx) return imageData;
  sctx.putImageData(imageData, 0, 0);
  const dst = document.createElement("canvas");
  dst.width = w;
  dst.height = h;
  const dctx = dst.getContext("2d");
  if (!dctx) return imageData;
  dctx.imageSmoothingEnabled = true;
  dctx.drawImage(src, 0, 0, w, h);
  return dctx.getImageData(0, 0, w, h);
}

const WASM_READER_OPTS = {
  formats: ["QRCode"] as const,
  tryHarder: true,
  tryInvert: true,
  tryRotate: true,
  tryDownscale: true,
  maxNumberOfSymbols: 1,
  textMode: "Plain" as const,
  // Binary preserves Secure QR byte payloads; digit strings still decode as ASCII bytes
  characterSet: "Binary" as const,
};

async function tryZxingWasmImageData(
  imageData: ImageData,
  engine: string
): Promise<AadhaarScanPayload | null> {
  try {
    const ok = await ensureZxingWasm();
    if (!ok) return null;
    const results = await readBarcodes(imageData, { ...WASM_READER_OPTS });
    for (const r of results || []) {
      if (!r?.isValid) continue;
      const payload = payloadFromDecoded(r.text, r.bytes?.length ? r.bytes : r.bytesECI, engine);
      if (payload) return payload;
    }
  } catch {
    /* decode fail */
  }
  return null;
}

async function tryZxingWasmBlob(blob: Blob, engine: string): Promise<AadhaarScanPayload | null> {
  try {
    const ok = await ensureZxingWasm();
    if (!ok) return null;
    const results = await readBarcodes(blob, { ...WASM_READER_OPTS });
    for (const r of results || []) {
      if (!r?.isValid) continue;
      const payload = payloadFromDecoded(r.text, r.bytes?.length ? r.bytes : r.bytesECI, engine);
      if (payload) return payload;
    }
  } catch {
    /* decode fail */
  }
  return null;
}

function tryJsQR(imageData: ImageData, engine: string): AadhaarScanPayload | null {
  try {
    const code = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: "attemptBoth",
    });
    if (!code) return null;
    return payloadFromJsQR(code, engine);
  } catch {
    return null;
  }
}

function tryZxingJs(imageData: ImageData, engine: string): AadhaarScanPayload | null {
  try {
    const { data, width, height } = imageData;
    const luminances = new Uint8ClampedArray(width * height);
    for (let i = 0; i < width * height; i++) {
      const o = i * 4;
      luminances[i] = ((data[o] * 77 + data[o + 1] * 150 + data[o + 2] * 29) >> 8) & 0xff;
    }
    const source = new RGBLuminanceSource(luminances, width, height);
    const bitmap = new BinaryBitmap(new HybridBinarizer(source));
    const hints = new Map();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.QR_CODE]);
    hints.set(DecodeHintType.TRY_HARDER, true);
    hints.set(DecodeHintType.CHARACTER_SET, "ISO-8859-1");
    const reader = new MultiFormatReader();
    reader.setHints(hints);
    const result = reader.decode(bitmap);
    return payloadFromDecoded(result?.getText?.() || "", result?.getRawBytes?.(), engine);
  } catch (err) {
    if (err instanceof NotFoundException) return null;
    return null;
  }
}

/** Native detector: only accept digit Secure QR / legacy XML — never binary mojibake. */
async function tryNativeBarcodeDetectorStrict(
  source: CanvasImageSource | ImageBitmap | HTMLVideoElement,
  engine: string
): Promise<AadhaarScanPayload | null> {
  const BD = (window as unknown as { BarcodeDetector?: new (opts: { formats: string[] }) => {
    detect: (src: ImageBitmapSource) => Promise<Array<{ rawValue?: string }>>;
  } }).BarcodeDetector;
  if (!BD) return null;
  try {
    const detector = new BD({ formats: ["qr_code"] });
    const codes = await detector.detect(source as ImageBitmapSource);
    for (const code of codes || []) {
      const t = String(code.rawValue || "").trim();
      if (isDigitString(t) || t.includes("PrintLetterBarcodeData") || t.startsWith("<")) {
        const payload = payloadFromDecoded(t, null, engine);
        if (payload) return payload;
      }
    }
  } catch {
    /* unsupported */
  }
  return null;
}

type DecodeOpts = {
  alsoDetectFrom?: CanvasImageSource | HTMLVideoElement | ImageBitmap | null;
  mode?: "quick" | "thorough";
};

/**
 * Dense UIDAI Secure QR decoder.
 * Order: ZXing-C++ WASM (bytes) → jsQR → ZXing-JS → strict native detector.
 */
export async function decodeAadhaarFromImageData(
  imageData: ImageData,
  opts?: DecodeOpts
): Promise<AadhaarScanPayload | null> {
  const mode = opts?.mode || "thorough";

  {
    const wasm = await tryZxingWasmImageData(imageData, "zxing-wasm");
    if (wasm) return wasm;
  }

  const variants: Array<{ label: string; data: ImageData }> =
    mode === "quick"
      ? [
          { label: "full", data: imageData },
          { label: "crop", data: cropCenter(imageData, 0.65) },
        ]
      : [
          { label: "full", data: imageData },
          { label: "crop", data: cropCenter(imageData, 0.7) },
          { label: "crop-tight", data: cropCenter(imageData, 0.5) },
        ];

  const scaled: Array<{ label: string; data: ImageData }> = [];
  for (const v of variants) {
    scaled.push(v);
    if (mode === "quick") {
      if (v.data.width > 1200) {
        scaled.push({ label: `${v.label}@0.55`, data: scaleImageData(v.data, 0.55) });
      }
      continue;
    }
    if (v.data.width > 1600) {
      scaled.push({ label: `${v.label}@0.67`, data: scaleImageData(v.data, 0.67) });
      scaled.push({ label: `${v.label}@0.45`, data: scaleImageData(v.data, 0.45) });
    } else if (v.data.width < 700) {
      scaled.push({ label: `${v.label}@1.6`, data: scaleImageData(v.data, 1.6) });
      scaled.push({ label: `${v.label}@2.2`, data: scaleImageData(v.data, 2.2) });
    } else {
      scaled.push({ label: `${v.label}@1.3`, data: scaleImageData(v.data, 1.3) });
    }
  }

  if (mode === "thorough") {
    for (const v of scaled.slice(1, 5)) {
      const wasm = await tryZxingWasmImageData(v.data, `zxing-wasm:${v.label}`);
      if (wasm) return wasm;
    }
  }

  for (const v of scaled) {
    const j = tryJsQR(v.data, `jsqr:${v.label}`);
    if (j) return j;
  }
  if (mode === "thorough") {
    for (const v of scaled) {
      const z = tryZxingJs(v.data, `zxing-js:${v.label}`);
      if (z) return z;
    }
  }

  if (opts?.alsoDetectFrom) {
    const native = await tryNativeBarcodeDetectorStrict(
      opts.alsoDetectFrom,
      "native-barcode-detector"
    );
    if (native) return native;
  }

  return null;
}

export async function decodeAadhaarFromVideo(
  video: HTMLVideoElement,
  canvas?: HTMLCanvasElement | null
): Promise<AadhaarScanPayload | null> {
  if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || video.videoWidth < 20) {
    return null;
  }

  // Strict native first on live video (fast path for digit Secure QR only)
  const native = await tryNativeBarcodeDetectorStrict(video, "native-barcode-detector:video");
  if (native) return native;

  const w = video.videoWidth;
  const h = video.videoHeight;
  const target = canvas || document.createElement("canvas");
  if (target.width !== w || target.height !== h) {
    target.width = w;
    target.height = h;
  }
  const ctx = target.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, w, h);
  const imageData = ctx.getImageData(0, 0, w, h);
  return decodeAadhaarFromImageData(imageData, { alsoDetectFrom: video, mode: "quick" });
}

export async function decodeAadhaarFromFile(file: File): Promise<AadhaarScanPayload | null> {
  // Best path: feed the photo blob straight into ZXing-WASM
  const fromBlob = await tryZxingWasmBlob(file, "zxing-wasm:blob");
  if (fromBlob) return fromBlob;

  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Could not load image"));
      el.src = url;
    });
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    const imageData = getImageData(img, w, h);
    if (!imageData) return null;
    return decodeAadhaarFromImageData(imageData, { alsoDetectFrom: img, mode: "thorough" });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function warmAadhaarDecoder(): void {
  void ensureZxingWasm();
}

export function isAadhaarDecoderReady(): boolean {
  return zxingOk;
}
