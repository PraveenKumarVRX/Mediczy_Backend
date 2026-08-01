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
// Bundled URL — survives deploy / CDN path issues better than only /public copy
// Must use package export path (not /dist/...) — Vite resolves via package.json "exports"
import zxingWasmAssetUrl from "zxing-wasm/reader/zxing_reader.wasm?url";
import {
  decodeBitmapInWorker,
  decodeBytesInWorker,
  decodeImageDataInWorker,
  warmAadhaarWorker,
} from "@/lib/aadhaarQrWorkerBridge";

export type AadhaarScanPayload = {
  qrBytesBase64?: string;
  qrText?: string;
  engine?: string;
  /** Present when server already parsed demographics */
  fields?: Record<string, unknown>;
};

const ZXING_WASM_PUBLIC_URL = `${import.meta.env.BASE_URL || "/"}zxing_reader.wasm`;

let zxingReady: Promise<boolean> | null = null;
let zxingOk = false;

function ensureZxingWasm(): Promise<boolean> {
  if (!zxingReady) {
    const wasmCandidates = [zxingWasmAssetUrl, ZXING_WASM_PUBLIC_URL].filter(Boolean);
    zxingReady = (async () => {
      let lastErr: unknown = null;
      for (const wasmUrl of wasmCandidates) {
        try {
          await prepareZXingModule({
            overrides: {
              locateFile: (path: string, prefix: string) => {
                if (path.endsWith(".wasm")) return wasmUrl;
                return `${prefix}${path}`;
              },
            },
            fireImmediately: true,
          });
          zxingOk = true;
          return true;
        } catch (e) {
          lastErr = e;
        }
      }
      console.warn("[aadhaar-qr] zxing-wasm init failed", lastErr);
      zxingOk = false;
      return false;
    })();
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

const WASM_OPTION_SETS = [
  {
    formats: ["QRCode"] as const,
    tryHarder: true,
    tryInvert: true,
    tryRotate: true,
    tryDownscale: true,
    tryDenoise: true,
    maxNumberOfSymbols: 3,
    textMode: "Plain" as const,
    // Binary preserves Secure QR byte payloads (critical — never trust text alone)
    characterSet: "Binary" as const,
    binarizer: "LocalAverage" as const,
  },
  {
    formats: ["QRCode"] as const,
    tryHarder: true,
    tryInvert: true,
    tryRotate: true,
    tryDownscale: true,
    maxNumberOfSymbols: 3,
    textMode: "Plain" as const,
    characterSet: "Binary" as const,
    binarizer: "GlobalHistogram" as const,
  },
  {
    formats: ["QRCode"] as const,
    tryHarder: true,
    tryInvert: true,
    tryRotate: true,
    tryDownscale: true,
    maxNumberOfSymbols: 3,
    textMode: "Hex" as const,
    characterSet: "Binary" as const,
  },
  {
    formats: ["QRCode"] as const,
    tryHarder: true,
    tryInvert: true,
    tryRotate: true,
    tryDownscale: true,
    maxNumberOfSymbols: 2,
    textMode: "Plain" as const,
  },
];

/**
 * iOS often returns HEIC; Android WebViews may return weird MIME types.
 * zxing-wasm only reliably reads JPEG/PNG/WebP — always re-encode via canvas.
 */
export async function normalizePhotoForQrDecode(file: Blob): Promise<Blob> {
  const type = (file.type || "").toLowerCase();
  if (type === "image/jpeg" || type === "image/jpg" || type === "image/png") {
    // Still re-encode very large originals to keep mobile memory stable
    if (file.size < 3_500_000) return file;
  }

  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    bitmap = null;
  }

  const draw = async (source: CanvasImageSource, w: number, h: number): Promise<Blob> => {
    const maxSide = 3200;
    let dw = w;
    let dh = h;
    if (Math.max(dw, dh) > maxSide) {
      const scale = maxSide / Math.max(dw, dh);
      dw = Math.round(dw * scale);
      dh = Math.round(dh * scale);
    }
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, dw);
    canvas.height = Math.max(1, dh);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas unavailable");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", 0.92)
    );
    if (!blob) throw new Error("JPEG encode failed");
    return blob;
  };

  if (bitmap) {
    try {
      return await draw(bitmap, bitmap.width, bitmap.height);
    } finally {
      bitmap.close?.();
    }
  }

  // Safari HEIC fallback via <img>
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Could not load photo"));
      el.src = url;
    });
    return await draw(img, img.naturalWidth || img.width, img.naturalHeight || img.height);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function adaptiveThreshold(imageData: ImageData): ImageData {
  const { width: w, height: h, data } = imageData;
  const gray = new Uint8Array(w * h);
  for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
    gray[i] = (data[p] * 0.299 + data[p + 1] * 0.587 + data[p + 2] * 0.114) | 0;
  }
  const out = new ImageData(w, h);
  const d = out.data;
  const half = 12;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      let n = 0;
      const y0 = Math.max(0, y - half);
      const y1 = Math.min(h - 1, y + half);
      const x0 = Math.max(0, x - half);
      const x1 = Math.min(w - 1, x + half);
      for (let yy = y0; yy <= y1; yy += 2) {
        const row = yy * w;
        for (let xx = x0; xx <= x1; xx += 2) {
          sum += gray[row + xx];
          n++;
        }
      }
      const mean = sum / (n || 1);
      const v = gray[y * w + x] < mean - 6 ? 0 : 255;
      const o = (y * w + x) * 4;
      d[o] = d[o + 1] = d[o + 2] = v;
      d[o + 3] = 255;
    }
  }
  return out;
}

function enhanceContrast(imageData: ImageData): ImageData {
  const out = new ImageData(imageData.width, imageData.height);
  const s = imageData.data;
  const d = out.data;
  // Simple contrast stretch around mid-gray — helps glare / soft phone cameras
  const factor = 1.35;
  for (let i = 0; i < s.length; i += 4) {
    const y = (s[i] * 0.299 + s[i + 1] * 0.587 + s[i + 2] * 0.114) | 0;
    let v = ((y - 128) * factor + 128) | 0;
    if (v < 0) v = 0;
    if (v > 255) v = 255;
    d[i] = d[i + 1] = d[i + 2] = v;
    d[i + 3] = 255;
  }
  return out;
}

async function tryZxingWasmImageData(
  imageData: ImageData,
  engine: string
): Promise<AadhaarScanPayload | null> {
  try {
    const ok = await ensureZxingWasm();
    if (!ok) return null;
    for (const opts of WASM_OPTION_SETS) {
      const results = await readBarcodes(imageData, { ...opts });
      for (const r of results || []) {
        if (!r?.isValid) continue;
        const payload = payloadFromDecoded(r.text, r.bytes?.length ? r.bytes : r.bytesECI, engine);
        if (payload) return payload;
      }
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
    for (const opts of WASM_OPTION_SETS) {
      const results = await readBarcodes(blob, { ...opts });
      for (const r of results || []) {
        if (!r?.isValid) continue;
        const payload = payloadFromDecoded(r.text, r.bytes?.length ? r.bytes : r.bytesECI, engine);
        if (payload) return payload;
      }
    }
  } catch {
    /* decode fail */
  }
  return null;
}

async function imageDataToJpegBlob(imageData: ImageData, quality = 0.92): Promise<Blob | null> {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = imageData.width;
    canvas.height = imageData.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.putImageData(imageData, 0, 0);
    return await new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/jpeg", quality));
  } catch {
    return null;
  }
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
 * Order: worker WASM → main WASM → jsQR → ZXing-JS → strict native detector.
 */
export async function decodeAadhaarFromImageData(
  imageData: ImageData,
  opts?: DecodeOpts & { blob?: Blob | null }
): Promise<AadhaarScanPayload | null> {
  const mode = opts?.mode || "thorough";

  // Prefer original JPEG/PNG bytes when present (better than re-encoded ImageData)
  if (opts?.blob) {
    const fromWorkerBlob = await decodeBytesInWorker(opts.blob, mode);
    if (fromWorkerBlob) return fromWorkerBlob;
    const fromBlob = await tryZxingWasmBlob(opts.blob, "zxing-wasm:blob");
    if (fromBlob) return fromBlob;
  }

  // Off-main-thread first (keeps camera UI smooth)
  {
    const fromWorker = await decodeImageDataInWorker(imageData, mode === "quick" ? "quick" : "thorough");
    if (fromWorker) return fromWorker;
  }

  {
    const wasm = await tryZxingWasmImageData(imageData, "zxing-wasm");
    if (wasm) return wasm;
  }

  if (mode === "thorough") {
    const enhanced = enhanceContrast(imageData);
    const wasmE = await tryZxingWasmImageData(enhanced, "zxing-wasm:contrast");
    if (wasmE) return wasmE;
    const jpeg = await imageDataToJpegBlob(enhanced);
    if (jpeg) {
      const fromJpeg = await tryZxingWasmBlob(jpeg, "zxing-wasm:contrast-jpeg");
      if (fromJpeg) return fromJpeg;
    }
    // Adaptive threshold is expensive — only on a downscaled crop, not full sensor res
    const cropForThresh = cropCenter(imageData, 0.62);
    const threshSrc =
      cropForThresh.width > 1200 ? scaleImageData(cropForThresh, 1200 / cropForThresh.width) : cropForThresh;
    const thresh = adaptiveThreshold(threshSrc);
    const wasmT = await tryZxingWasmImageData(thresh, "zxing-wasm:adaptive");
    if (wasmT) return wasmT;
  }

  const variants: Array<{ label: string; data: ImageData }> =
    mode === "quick"
      ? [
          { label: "full", data: imageData },
          { label: "crop", data: cropCenter(imageData, 0.65) },
        ]
      : [
          { label: "full", data: imageData },
          { label: "contrast", data: enhanceContrast(imageData) },
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

/**
 * High-performance live frame decode:
 * 1) Native BarcodeDetector (GPU path on Chromium) — digit Secure QR
 * 2) Center ROI ImageBitmap → Web Worker zxing-wasm (binary Secure QR)
 * 3) Main-thread quick fallback
 */
export async function decodeAadhaarFromVideo(
  video: HTMLVideoElement,
  canvas?: HTMLCanvasElement | null,
  opts?: { roiRatio?: number }
): Promise<AadhaarScanPayload | null> {
  if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || video.videoWidth < 20) {
    return null;
  }

  // Strict native first on live video (fast path for digit Secure QR only)
  const native = await tryNativeBarcodeDetectorStrict(video, "native-barcode-detector:video");
  if (native) return native;

  const w = video.videoWidth;
  const h = video.videoHeight;
  const roiRatio = opts?.roiRatio ?? 0.62;
  const side = Math.max(64, Math.floor(Math.min(w, h) * roiRatio));
  const sx = Math.floor((w - side) / 2);
  const sy = Math.floor((h - side) / 2);

  // Worker path via ImageBitmap ROI — no main-thread getImageData cost
  try {
    if (typeof createImageBitmap === "function") {
      const bitmap = await createImageBitmap(video, sx, sy, side, side);
      const fromWorker = await decodeBitmapInWorker(bitmap, "quick");
      if (fromWorker) return fromWorker;
    }
  } catch {
    /* fall through */
  }

  const target = canvas || document.createElement("canvas");
  // Decode ROI only — ~3× fewer pixels than full frame
  if (target.width !== side || target.height !== side) {
    target.width = side;
    target.height = side;
  }
  const ctx = target.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(video, sx, sy, side, side, 0, 0, side, side);
  const imageData = ctx.getImageData(0, 0, side, side);
  return decodeAadhaarFromImageData(imageData, { alsoDetectFrom: video, mode: "quick" });
}

export async function decodeAadhaarFromFile(file: File | Blob): Promise<AadhaarScanPayload | null> {
  // Always normalize first — HEIC/unknown types break wasm blob readers on iOS/Android
  let jpeg: Blob;
  try {
    jpeg = await normalizePhotoForQrDecode(file);
  } catch {
    jpeg = file;
  }

  // Best path: worker then main-thread WASM on JPEG bytes
  const fromWorker = await decodeBytesInWorker(jpeg, "thorough");
  if (fromWorker) return fromWorker;
  const fromBlob = await tryZxingWasmBlob(jpeg, "zxing-wasm:blob");
  if (fromBlob) return fromBlob;

  const url = URL.createObjectURL(jpeg);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Could not load image"));
      el.src = url;
    });
    let w = img.naturalWidth || img.width;
    let h = img.naturalHeight || img.height;
    // Dense Secure QR needs detail — keep up to 3200px on the long side
    const maxSide = 3200;
    if (Math.max(w, h) > maxSide) {
      const scale = maxSide / Math.max(w, h);
      w = Math.round(w * scale);
      h = Math.round(h * scale);
    }
    const imageData = getImageData(img, w, h);
    if (!imageData) return null;
    // JPEG blob already tried via worker + main WASM above
    return decodeAadhaarFromImageData(imageData, {
      alsoDetectFrom: img,
      mode: "thorough",
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

function authHeadersForDecode(extra: Record<string, string> = {}): Record<string, string> {
  const hdrs = { ...extra };
  if (typeof localStorage === "undefined") return hdrs;
  try {
    if (!hdrs["x-device-token"]) {
      const device =
        localStorage.getItem("displayDeviceToken") ||
        new URLSearchParams(window.location.search).get("deviceToken") ||
        "";
      if (device) hdrs["x-device-token"] = device;
    }
    if (!hdrs.Authorization) {
      const bearer =
        localStorage.getItem("hospitalToken") ||
        localStorage.getItem("clinicToken") ||
        localStorage.getItem("labToken") ||
        localStorage.getItem("authToken") ||
        localStorage.getItem("token");
      if (bearer) hdrs.Authorization = `Bearer ${bearer}`;
    }
  } catch {
    /* ignore */
  }
  return hdrs;
}

/** Client decode first, then server zxing-wasm fallback. */
export async function decodeAadhaarFromFileWithServerFallback(
  file: File | Blob,
  headers: Record<string, string> = {},
  endpoint = "/api/display/kiosk/decode-aadhaar-image"
): Promise<AadhaarScanPayload | null> {
  let jpeg: Blob;
  try {
    jpeg = await normalizePhotoForQrDecode(file);
  } catch {
    jpeg = file;
  }

  const local = await decodeAadhaarFromFile(jpeg);
  if (local) return local;

  const endpoints = [endpoint];
  // Staff JWT portals (clinic/lab QMS) use /api/qms; kiosk uses device token
  if (endpoint.includes("/display/kiosk/")) {
    endpoints.push("/api/qms/aadhaar/decode-image");
  }

  const hdrs = authHeadersForDecode(headers);
  for (const url of endpoints) {
    try {
      const form = new FormData();
      form.append("photo", jpeg, "aadhaar.jpg");
      const res = await fetch(url, { method: "POST", headers: hdrs, body: form });
      const json = await res.json().catch(() => ({}));
      if (!json?.success) continue;
      if (json.qrText || json.qrBytesBase64 || json.fields) {
        return {
          qrText: json.qrText,
          qrBytesBase64: json.qrBytesBase64,
          engine: json.engine || "server-zxing-wasm",
          fields: json.fields,
        };
      }
    } catch {
      /* try next */
    }
  }
  return null;
}

export function warmAadhaarDecoder(): void {
  warmAadhaarWorker();
  void ensureZxingWasm();
}

export function isAadhaarDecoderReady(): boolean {
  return zxingOk;
}
