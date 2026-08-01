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

export type AadhaarScanPayload = {
  qrBytesBase64?: string;
  qrText?: string;
  engine?: string;
};

function bytesToBase64(raw: Uint8Array | number[]): string {
  let binary = "";
  for (let i = 0; i < raw.length; i++) binary += String.fromCharCode(raw[i] & 0xff);
  return btoa(binary);
}

function isDigitString(s: string, min = 80): boolean {
  return /^\d+$/.test(s) && s.length >= min;
}

/** Build API payload from decoded text and/or raw bytes. */
export function payloadFromDecoded(
  text: string | null | undefined,
  rawBytes?: Uint8Array | number[] | null,
  engine?: string
): AadhaarScanPayload | null {
  const t = String(text || "").trim();

  if (isDigitString(t)) {
    return { qrText: t, engine };
  }

  if (rawBytes && rawBytes.length > 0) {
    const bytes = rawBytes instanceof Uint8Array ? rawBytes : new Uint8Array(rawBytes);
    let allDigits = bytes.length >= 80;
    if (allDigits) {
      for (let i = 0; i < bytes.length; i++) {
        if (bytes[i] < 48 || bytes[i] > 57) {
          allDigits = false;
          break;
        }
      }
    }
    if (allDigits) {
      return { qrText: new TextDecoder("ascii").decode(bytes), engine };
    }
    return {
      qrBytesBase64: bytesToBase64(bytes),
      qrText: t || undefined,
      engine,
    };
  }

  if (t.includes("PrintLetterBarcodeData") || t.startsWith("<")) {
    return {
      qrText: t,
      qrBytesBase64: btoa(unescape(encodeURIComponent(t))),
      engine,
    };
  }

  // Binary-looking string from byte-mode QR (jsQR data field)
  if (t.length > 40) {
    const bytes = new Uint8Array(t.length);
    for (let i = 0; i < t.length; i++) bytes[i] = t.charCodeAt(i) & 0xff;
    return { qrText: t, qrBytesBase64: bytesToBase64(bytes), engine };
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

function tryZxing(imageData: ImageData, engine: string): AadhaarScanPayload | null {
  try {
    const { data, width, height } = imageData;
    const luminances = new Uint8ClampedArray(width * height);
    for (let i = 0; i < width * height; i++) {
      const o = i * 4;
      // Rec. 601 luma
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
    const text = result?.getText?.() || "";
    const raw = result?.getRawBytes?.();
    return payloadFromDecoded(text, raw, engine);
  } catch (err) {
    if (err instanceof NotFoundException) return null;
    return null;
  }
}

async function tryBarcodeDetector(
  source: CanvasImageSource | ImageBitmap | HTMLVideoElement,
  engine: string
): Promise<AadhaarScanPayload | null> {
  const BD = (window as unknown as { BarcodeDetector?: new (opts: { formats: string[] }) => {
    detect: (src: CanvasImageSource) => Promise<Array<{ rawValue?: string }>>;
  } }).BarcodeDetector;
  if (!BD) return null;
  try {
    const detector = new BD({ formats: ["qr_code"] });
    const codes = await detector.detect(source as CanvasImageSource);
    for (const code of codes || []) {
      const payload = payloadFromDecoded(code.rawValue, null, engine);
      if (payload) return payload;
    }
  } catch {
    /* unsupported / failed */
  }
  return null;
}

type DecodeOpts = {
  alsoDetectFrom?: CanvasImageSource | HTMLVideoElement | ImageBitmap | null;
  /** Live preview: fewer variants so the camera loop stays responsive */
  mode?: "quick" | "thorough";
};

/**
 * Run multiple decode strategies against an ImageData / video frame.
 * Dense UIDAI Secure QRs often need crop + scale + TRY_HARDER.
 */
export async function decodeAadhaarFromImageData(
  imageData: ImageData,
  opts?: DecodeOpts
): Promise<AadhaarScanPayload | null> {
  const mode = opts?.mode || "thorough";

  if (opts?.alsoDetectFrom) {
    const native = await tryBarcodeDetector(opts.alsoDetectFrom, "barcode-detector");
    if (native) return native;
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
          { label: "crop-tight", data: cropCenter(imageData, 0.55) },
        ];

  const scaled: Array<{ label: string; data: ImageData }> = [];
  for (const v of variants) {
    scaled.push(v);
    if (mode === "quick") {
      if (v.data.width > 1000) {
        scaled.push({ label: `${v.label}@0.6`, data: scaleImageData(v.data, 0.6) });
      }
      continue;
    }
    if (v.data.width > 900) {
      scaled.push({ label: `${v.label}@0.75`, data: scaleImageData(v.data, 0.75) });
      scaled.push({ label: `${v.label}@0.5`, data: scaleImageData(v.data, 0.5) });
    } else if (v.data.width < 500) {
      scaled.push({ label: `${v.label}@1.5`, data: scaleImageData(v.data, 1.5) });
      scaled.push({ label: `${v.label}@2`, data: scaleImageData(v.data, 2) });
    } else {
      scaled.push({ label: `${v.label}@1.25`, data: scaleImageData(v.data, 1.25) });
    }
  }

  for (const v of scaled) {
    const j = tryJsQR(v.data, `jsqr:${v.label}`);
    if (j) return j;
  }
  // ZXing TRY_HARDER is slower — skip in quick live loop
  if (mode === "thorough") {
    for (const v of scaled) {
      const z = tryZxing(v.data, `zxing:${v.label}`);
      if (z) return z;
    }
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
    return decodeAadhaarFromImageData(imageData, { alsoDetectFrom: img });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function grabHighResFrame(track: MediaStreamTrack | null): Promise<ImageData | null> {
  if (!track) return null;
  try {
    const ImageCaptureCtor = (window as unknown as {
      ImageCapture?: new (t: MediaStreamTrack) => { grabFrame: () => Promise<ImageBitmap> };
    }).ImageCapture;
    if (!ImageCaptureCtor) return null;
    const capture = new ImageCaptureCtor(track);
    const bitmap = await capture.grabFrame();
    const imageData = getImageData(bitmap, bitmap.width, bitmap.height);
    bitmap.close?.();
    return imageData;
  } catch {
    return null;
  }
}
