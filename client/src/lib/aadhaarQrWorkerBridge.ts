/**
 * Main-thread bridge to the Aadhaar QR Web Worker.
 * Falls back to main-thread decode if workers are unavailable.
 */
import type { AadhaarScanPayload } from "@/lib/aadhaarQrDecode";
import type { WorkerDecodeRequest, WorkerDecodeResponse } from "@/lib/aadhaarQr.worker";

type Pending = {
  resolve: (v: AadhaarScanPayload | null) => void;
  reject: (e: Error) => void;
  timer: number;
};

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, Pending>();
let initPromise: Promise<boolean> | null = null;
let workerOk = false;
let workerFailed = false;

function clearPending(id: number) {
  const p = pending.get(id);
  if (!p) return;
  window.clearTimeout(p.timer);
  pending.delete(id);
}

function ensureWorker(): Promise<boolean> {
  if (typeof Worker === "undefined" || workerFailed) return Promise.resolve(false);
  if (workerOk && worker) return Promise.resolve(true);
  if (initPromise) return initPromise;

  initPromise = new Promise<boolean>((resolve) => {
    try {
      const w = new Worker(new URL("./aadhaarQr.worker.ts", import.meta.url), {
        type: "module",
      });
      worker = w;
      w.onmessage = (ev: MessageEvent<WorkerDecodeResponse>) => {
        const { id, ok, payload } = ev.data || ({} as WorkerDecodeResponse);
        const p = pending.get(id);
        if (!p) return;
        clearPending(id);
        if (!ok) {
          p.resolve(null);
          return;
        }
        p.resolve(payload || null);
      };
      w.onerror = () => {
        workerOk = false;
        workerFailed = true;
        worker = null;
        initPromise = null;
        const waiting = [...pending.values()];
        pending.clear();
        for (const p of waiting) {
          window.clearTimeout(p.timer);
          p.resolve(null);
        }
        resolve(false);
      };

      const id = nextId++;
      const timer = window.setTimeout(() => {
        clearPending(id);
        workerOk = false;
        // Do NOT permanently blacklist — allow retry next warm/start
        workerFailed = false;
        try {
          w.terminate();
        } catch {
          /* ignore */
        }
        worker = null;
        initPromise = null;
        resolve(false);
      }, 12000);
      pending.set(id, {
        resolve: () => {
          workerOk = true;
          workerFailed = false;
          resolve(true);
        },
        reject: () => {
          workerOk = false;
          workerFailed = false;
          initPromise = null;
          resolve(false);
        },
        timer,
      });
      const msg: WorkerDecodeRequest = { id, type: "init" };
      w.postMessage(msg);
    } catch {
      workerOk = false;
      workerFailed = true;
      worker = null;
      initPromise = null;
      resolve(false);
    }
  });

  return initPromise;
}

function callWorker(
  build: (id: number) => { msg: WorkerDecodeRequest; transfer?: Transferable[] },
  timeoutMs = 4500
): Promise<AadhaarScanPayload | null> {
  return ensureWorker().then((ok) => {
    if (!ok || !worker) return null;
    const id = nextId++;
    return new Promise<AadhaarScanPayload | null>((resolve) => {
      const timer = window.setTimeout(() => {
        clearPending(id);
        resolve(null);
      }, timeoutMs);
      pending.set(id, {
        resolve,
        reject: () => resolve(null),
        timer,
      });
      const { msg, transfer } = build(id);
      try {
        if (transfer?.length) worker!.postMessage(msg, transfer);
        else worker!.postMessage(msg);
      } catch {
        clearPending(id);
        resolve(null);
      }
    });
  });
}

/** Warm the worker + WASM as early as possible (kiosk idle). */
export function warmAadhaarWorker(): void {
  void ensureWorker();
}

export function isAadhaarWorkerReady(): boolean {
  return workerOk;
}

/** Decode an ImageBitmap in the worker (bitmap is closed by the worker on success path). */
export async function decodeBitmapInWorker(
  bitmap: ImageBitmap,
  mode: "quick" | "thorough" = "quick"
): Promise<AadhaarScanPayload | null> {
  const ok = await ensureWorker();
  if (!ok || !worker) {
    try {
      bitmap.close?.();
    } catch {
      /* ignore */
    }
    return null;
  }
  return callWorker((id) => ({
    msg: { id, type: "decode-bitmap", bitmap, mode },
    transfer: [bitmap],
  }));
}

/** Copy ImageData and decode in worker (source ImageData stays intact). */
export function decodeImageDataInWorker(
  imageData: ImageData,
  mode: "quick" | "thorough" = "quick"
): Promise<AadhaarScanPayload | null> {
  const copy = imageData.data.buffer.slice(0);
  return callWorker((id) => ({
    msg: {
      id,
      type: "decode-imagedata",
      width: imageData.width,
      height: imageData.height,
      buffer: copy,
      mode,
    },
    transfer: [copy],
  }));
}

/** Decode JPEG/PNG bytes in the worker. */
export async function decodeBytesInWorker(
  blob: Blob,
  mode: "quick" | "thorough" = "thorough"
): Promise<AadhaarScanPayload | null> {
  const buffer = await blob.arrayBuffer();
  return callWorker((id) => ({
    msg: {
      id,
      type: "decode-bytes",
      buffer,
      mime: blob.type || "image/jpeg",
      mode,
    },
    transfer: [buffer],
  }));
}

export function terminateAadhaarWorker(): void {
  try {
    worker?.terminate();
  } catch {
    /* ignore */
  }
  worker = null;
  workerOk = false;
  workerFailed = false;
  initPromise = null;
  for (const [id] of pending) clearPending(id);
}
