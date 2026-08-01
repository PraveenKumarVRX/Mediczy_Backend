/**
 * Off-main-thread Aadhaar Secure QR decoder (ZXing-C++ WASM).
 * Keeps the camera UI at high FPS while dense QR decode runs in parallel.
 */
import { prepareZXingModule, readBarcodes } from "zxing-wasm/reader";
// Must use package export path (not /dist/...) — Vite resolves via package.json "exports"
import zxingWasmUrl from "zxing-wasm/reader/zxing_reader.wasm?url";

export type WorkerDecodeRequest =
  | { id: number; type: "init" }
  | { id: number; type: "decode-bitmap"; bitmap: ImageBitmap; mode: "quick" | "thorough" }
  | {
      id: number;
      type: "decode-imagedata";
      width: number;
      height: number;
      buffer: ArrayBuffer;
      mode: "quick" | "thorough";
    }
  | { id: number; type: "decode-bytes"; buffer: ArrayBuffer; mime?: string; mode: "quick" | "thorough" };

export type WorkerDecodeResponse = {
  id: number;
  ok: boolean;
  payload?: {
    qrText?: string;
    qrBytesBase64?: string;
    engine: string;
  } | null;
  error?: string;
};

let ready = false;

const QUICK_OPTS = [
  {
    formats: ["QRCode"] as const,
    tryHarder: true,
    tryInvert: true,
    tryRotate: true,
    tryDownscale: true,
    maxNumberOfSymbols: 2,
    characterSet: "Binary" as const,
    binarizer: "LocalAverage" as const,
  },
];

const THOROUGH_OPTS = [
  ...QUICK_OPTS,
  {
    formats: ["QRCode"] as const,
    tryHarder: true,
    tryInvert: true,
    tryRotate: true,
    tryDownscale: true,
    tryDenoise: true,
    maxNumberOfSymbols: 3,
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
    characterSet: "Binary" as const,
    textMode: "Hex" as const,
  },
];

function bytesToBase64(raw: Uint8Array): string {
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

function payloadFromDecoded(
  text: string | null | undefined,
  rawBytes?: Uint8Array | null,
  engine?: string
): WorkerDecodeResponse["payload"] {
  const t = String(text || "").trim();
  const bytes = rawBytes && rawBytes.length > 0 ? rawBytes : null;

  if (bytes && bytes.length >= 50) {
    if (bytesAreAsciiDigits(bytes, 80)) {
      return {
        qrText: new TextDecoder("ascii").decode(bytes),
        qrBytesBase64: bytesToBase64(bytes),
        engine: engine || "worker-zxing-wasm",
      };
    }
    if (isDigitString(t)) {
      return { qrText: t, qrBytesBase64: bytesToBase64(bytes), engine: engine || "worker-zxing-wasm" };
    }
    return { qrBytesBase64: bytesToBase64(bytes), engine: engine || "worker-zxing-wasm" };
  }
  if (isDigitString(t)) return { qrText: t, engine: engine || "worker-zxing-wasm" };
  if (t.includes("PrintLetterBarcodeData") || t.startsWith("<")) {
    return {
      qrText: t,
      qrBytesBase64: btoa(unescape(encodeURIComponent(t))),
      engine: engine || "worker-zxing-wasm",
    };
  }
  return null;
}

function bytesFromResult(r: {
  text?: string;
  bytes?: Uint8Array;
  bytesECI?: Uint8Array;
}): Uint8Array | null {
  if (r.bytes?.length) return r.bytes;
  if (r.bytesECI?.length) return r.bytesECI;
  const hex = String(r.text || "").replace(/\s+/g, "");
  if (/^[0-9a-fA-F]{100,}$/.test(hex) && hex.length % 2 === 0) {
    const out = new Uint8Array(hex.length / 2);
    for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    return out;
  }
  return null;
}

async function ensureReady() {
  if (ready) return;
  await prepareZXingModule({
    overrides: {
      locateFile: (path: string, prefix: string) => {
        if (path.endsWith(".wasm")) return zxingWasmUrl;
        return `${prefix}${path}`;
      },
    },
    fireImmediately: true,
  });
  ready = true;
}

async function decodeSource(
  source: ImageBitmap | ImageData | Blob | Uint8Array,
  mode: "quick" | "thorough"
): Promise<WorkerDecodeResponse["payload"]> {
  await ensureReady();
  const opts = mode === "thorough" ? THOROUGH_OPTS : QUICK_OPTS;
  for (const o of opts) {
    const results = await readBarcodes(source as never, { ...o });
    for (const r of results || []) {
      if (!r?.isValid) continue;
      const bytes = bytesFromResult(r);
      const payload = payloadFromDecoded(r.text, bytes, `worker-zxing-wasm:${mode}`);
      if (payload) return payload;
    }
  }
  return null;
}

self.onmessage = async (ev: MessageEvent<WorkerDecodeRequest>) => {
  const msg = ev.data;
  const reply = (body: Omit<WorkerDecodeResponse, "id">) => {
    (self as unknown as Worker).postMessage({ id: msg.id, ...body } satisfies WorkerDecodeResponse);
  };
  try {
    if (msg.type === "init") {
      await ensureReady();
      reply({ ok: true, payload: null });
      return;
    }
    if (msg.type === "decode-bitmap") {
      const payload = await decodeSource(msg.bitmap, msg.mode);
      try {
        msg.bitmap.close?.();
      } catch {
        /* ignore */
      }
      reply({ ok: true, payload });
      return;
    }
    if (msg.type === "decode-imagedata") {
      const data = new Uint8ClampedArray(msg.buffer);
      const imageData = new ImageData(data, msg.width, msg.height);
      const payload = await decodeSource(imageData, msg.mode);
      reply({ ok: true, payload });
      return;
    }
    if (msg.type === "decode-bytes") {
      const bytes = new Uint8Array(msg.buffer);
      const blob = new Blob([bytes], { type: msg.mime || "image/jpeg" });
      const payload = await decodeSource(blob, msg.mode);
      reply({ ok: true, payload });
      return;
    }
    reply({ ok: false, error: "unknown message" });
  } catch (e) {
    reply({ ok: false, error: e instanceof Error ? e.message : "decode failed" });
  }
};
