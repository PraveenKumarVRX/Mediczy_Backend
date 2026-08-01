import { useCallback, useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType, type Result } from "@zxing/library";
import jsQR from "jsqr";
import {
  decodeAadhaarFromFileWithServerFallback,
  decodeAadhaarFromVideoFrameWithServerFallback,
  type AadhaarScanPayload,
  type ServerDecodeFailure,
  warmAadhaarDecoder,
} from "@/lib/aadhaarQrDecode";
import { payloadFromDecoded } from "@/lib/aadhaarQrPayload";
import { tryZbarImageData, warmAadhaarZbar } from "@/lib/aadhaarZbar";
import { getDisplayDeviceToken } from "@/utils/displayDeviceAuth";

export type { AadhaarScanPayload };

interface Props {
  onScan: (payload: AadhaarScanPayload) => void | Promise<void>;
  onClose: () => void;
}

type Phase = "starting" | "scanning" | "reading" | "blocked";

/** Same cadence as KioskQrScanner (the live path that already works). */
const SCAN_INTERVAL_MS = 180;
/** Soft-frame rescue only — not the primary path. */
const ASSIST_MS = 2500;

function vibrate(ms = 35) {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* ignore */
  }
}

function authHeaders(): Record<string, string> {
  const token = getDisplayDeviceToken();
  return token ? { "x-device-token": token } : {};
}

function payloadFromZxingResult(result: Result, engine: string): AadhaarScanPayload | null {
  const text = result.getText?.() || "";
  let raw: Uint8Array | null = null;
  try {
    const bytes = result.getRawBytes?.();
    if (bytes?.length) raw = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  } catch {
    raw = null;
  }
  return payloadFromDecoded(text, raw, engine);
}

/**
 * Aadhaar scanner using the SAME live tech as working QR scanners in this app:
 * 1) KioskQrScanner — canvas + jsQR on every video frame
 * 2) HospitalMRD — @zxing/browser BrowserMultiFormatReader.decodeFromVideoDevice
 * Plus ZBar on the same frame for binary Secure QR bytes.
 * Secure QR parse stays separate; detection reuses proven live readers.
 */
export default function KioskAadhaarScanner({ onScan, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const assistTimerRef = useRef<number | null>(null);
  const lastScanAtRef = useRef(0);
  const handledRef = useRef(false);
  const frameBusyRef = useRef(false);
  const assistBusyRef = useRef(false);
  const onScanRef = useRef(onScan);
  const startCameraRef = useRef<() => Promise<void>>(async () => undefined);
  const photoRef = useRef<HTMLInputElement | null>(null);
  const zxingReaderRef = useRef<BrowserMultiFormatReader | null>(null);
  const zxingControlsRef = useRef<{ stop: () => void } | null>(null);

  const [phase, setPhase] = useState<Phase>("starting");
  const [status, setStatus] = useState("Starting camera…");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    // Warm the same engines the decode libs use — don't block camera start
    warmAadhaarZbar();
    warmAadhaarDecoder();
    getDisplayDeviceToken();
  }, []);

  const clearTimers = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (assistTimerRef.current != null) {
      window.clearInterval(assistTimerRef.current);
      assistTimerRef.current = null;
    }
  }, []);

  const stopCamera = useCallback(() => {
    clearTimers();
    try {
      zxingControlsRef.current?.stop();
    } catch {
      /* ignore */
    }
    zxingControlsRef.current = null;
    try {
      zxingReaderRef.current?.reset();
    } catch {
      /* ignore */
    }
    zxingReaderRef.current = null;

    const stream = streamRef.current;
    streamRef.current = null;
    if (stream) {
      for (const track of stream.getTracks()) track.stop();
    }
    if (videoRef.current) videoRef.current.srcObject = null;
  }, [clearTimers]);

  const emitPayload = useCallback(
    async (payload: AadhaarScanPayload) => {
      if (handledRef.current) return;
      handledRef.current = true;
      clearTimers();
      vibrate(40);
      setPhase("reading");
      setStatus("Reading Aadhaar details…");
      setError(null);
      stopCamera();
      try {
        await onScanRef.current(payload);
      } catch (err: unknown) {
        handledRef.current = false;
        setError(err instanceof Error ? err.message : "Couldn’t read that QR");
        setStatus("Hold the large QR on the back in the frame");
        setPhase("starting");
        void startCameraRef.current();
      }
    },
    [clearTimers, stopCamera]
  );

  const tryEmitFromTextOrBytes = useCallback(
    async (text: string | null | undefined, bytes: Uint8Array | number[] | null | undefined, engine: string) => {
      const payload = payloadFromDecoded(text, bytes, engine);
      if (!payload || handledRef.current) return false;
      await emitPayload(payload);
      return true;
    },
    [emitPayload]
  );

  /**
   * Exact KioskQrScanner loop: draw full video frame → jsQR.
   * Also run ZBar on the same ImageData (binary Secure QR).
   */
  const scanFrame = useCallback(() => {
    if (handledRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) {
      rafRef.current = requestAnimationFrame(scanFrame);
      return;
    }

    if (
      !frameBusyRef.current &&
      !assistBusyRef.current &&
      video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
      video.videoWidth > 0
    ) {
      const now = Date.now();
      if (now - lastScanAtRef.current >= SCAN_INTERVAL_MS) {
        lastScanAtRef.current = now;
        const w = video.videoWidth;
        const h = video.videoHeight;
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w;
          canvas.height = h;
        }
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (ctx) {
          frameBusyRef.current = true;
          ctx.drawImage(video, 0, 0, w, h);
          const imageData = ctx.getImageData(0, 0, w, h);

          // 1) jsQR — same as KioskQrScanner
          try {
            const code = jsQR(imageData.data, imageData.width, imageData.height, {
              inversionAttempts: "attemptBoth",
            });
            if (code) {
              void tryEmitFromTextOrBytes(code.data, code.binaryData, "jsqr:live").finally(() => {
                frameBusyRef.current = false;
              });
              if (!handledRef.current) {
                rafRef.current = requestAnimationFrame(scanFrame);
              }
              return;
            }
          } catch {
            /* continue */
          }

          // 2) ZBar — binary-safe for dense Secure QR
          void tryZbarImageData(imageData, "zbar:live")
            .then((payload) => {
              if (payload && !handledRef.current) return emitPayload(payload);
            })
            .finally(() => {
              frameBusyRef.current = false;
            });
        }
      }
    }

    rafRef.current = requestAnimationFrame(scanFrame);
  }, [emitPayload, tryEmitFromTextOrBytes]);

  /**
   * Same continuous reader as HospitalMRD (@zxing/browser), but on the stream
   * we already opened (decodeFromStream) — no second getUserMedia fight.
   */
  const startZxingBrowser = useCallback(
    async (stream: MediaStream, video: HTMLVideoElement) => {
      try {
        zxingReaderRef.current?.reset();
      } catch {
        /* ignore */
      }
      const hints = new Map();
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.QR_CODE]);
      hints.set(DecodeHintType.TRY_HARDER, true);
      hints.set(DecodeHintType.CHARACTER_SET, "ISO-8859-1");
      const reader = new BrowserMultiFormatReader(hints);
      zxingReaderRef.current = reader;

      try {
        const controls = await reader.decodeFromStream(stream, video, (result, _err, ctrl) => {
          zxingControlsRef.current = ctrl;
          if (handledRef.current) {
            try {
              ctrl.stop();
            } catch {
              /* ignore */
            }
            return;
          }
          if (!result) return;
          const payload = payloadFromZxingResult(result, "zxing-browser:live");
          if (payload) {
            try {
              ctrl.stop();
            } catch {
              /* ignore */
            }
            void emitPayload(payload);
          }
        });
        zxingControlsRef.current = controls;
      } catch (e) {
        console.warn("[aadhaar-qr] @zxing/browser live start failed", e);
      }
    },
    [emitPayload]
  );

  const runAssistDecode = useCallback(async () => {
    if (handledRef.current || assistBusyRef.current || frameBusyRef.current) return;
    const video = videoRef.current;
    if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
    assistBusyRef.current = true;
    try {
      const failure: ServerDecodeFailure = {};
      const payload = await decodeAadhaarFromVideoFrameWithServerFallback(
        video,
        authHeaders(),
        failure
      );
      if (payload && !handledRef.current) {
        await emitPayload(payload);
        return;
      }
      if (failure.authMissing) {
        setError((prev) => prev || "Tip: open kiosk with device token for better scan backup");
      }
    } finally {
      assistBusyRef.current = false;
    }
  }, [emitPayload]);

  const onPhotoFile = async (file: File) => {
    if (handledRef.current) return;
    setPhase("reading");
    setStatus("Reading photo…");
    setError(null);
    stopCamera();
    try {
      const failure: ServerDecodeFailure = {};
      const payload = await decodeAadhaarFromFileWithServerFallback(
        file,
        authHeaders(),
        undefined,
        failure
      );
      if (!payload) {
        setError(
          failure.authMissing
            ? "QR not found locally, and server backup needs login/device token"
            : "QR not found — fill the frame with the large QR on the back"
        );
        setStatus("Try again");
        setPhase("starting");
        void startCameraRef.current();
        return;
      }
      await emitPayload(payload);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Couldn’t read that photo");
      setPhase("starting");
      void startCameraRef.current();
    }
  };

  const pickPhoto = () => {
    const el = photoRef.current;
    if (!el) return;
    try {
      el.value = "";
    } catch {
      /* ignore */
    }
    el.click();
  };

  const startCamera = useCallback(async () => {
    stopCamera();
    handledRef.current = false;
    frameBusyRef.current = false;
    assistBusyRef.current = false;
    setPhase("starting");
    setStatus("Starting camera…");
    setError(null);

    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Camera not supported — use Photo");
      setStatus("Camera unavailable");
      setPhase("blocked");
      return;
    }

    try {
      // Same constraints as KioskQrScanner (the working live QR scanner)
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
      streamRef.current = stream;

      const video = videoRef.current;
      if (!video) {
        stream.getTracks().forEach((t) => t.stop());
        throw new Error("Camera preview failed to start");
      }
      video.srcObject = stream;
      video.muted = true;
      video.setAttribute("playsinline", "true");
      video.setAttribute("webkit-playsinline", "true");
      await video.play().catch(async () => {
        await new Promise((r) => setTimeout(r, 120));
        await video.play();
      });

      if (handledRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      setPhase("scanning");
      setStatus("Hold the large QR on the back in the frame");

      // Path A — KioskQrScanner: jsQR (+ ZBar) RAF loop
      lastScanAtRef.current = 0;
      rafRef.current = requestAnimationFrame(scanFrame);

      // Path B — HospitalMRD continuous reader on the same stream
      void startZxingBrowser(stream, video);

      // Soft assist only (JPEG → local/server) if live engines miss
      assistTimerRef.current = window.setInterval(() => {
        if (!handledRef.current && !document.hidden) void runAssistDecode();
      }, ASSIST_MS);
    } catch (e: unknown) {
      stopCamera();
      const denied =
        e instanceof Error && /Permission|NotAllowed|denied/i.test(e.message);
      setError(
        denied
          ? "Camera blocked — allow camera access, or use Photo"
          : e instanceof Error
            ? e.message
            : "Could not open camera"
      );
      setStatus("Camera unavailable");
      setPhase("blocked");
    }
  }, [runAssistDecode, scanFrame, startZxingBrowser, stopCamera]);

  startCameraRef.current = startCamera;

  useEffect(() => {
    void startCameraRef.current();
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  const busy = phase === "reading";

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-neutral-950 text-white">
      <div className="flex items-center justify-between px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg px-3 py-2 text-sm text-white/80 hover:bg-white/10"
        >
          Close
        </button>
        <p className="text-sm font-medium text-white/90">Scan Aadhaar QR</p>
        <div className="w-14" />
      </div>

      <p className="px-6 text-center text-lg font-semibold tracking-tight">{status}</p>
      <p className="mt-1 px-6 text-center text-sm text-white/50">
        Back of card · large QR · fill the square
      </p>
      {error && (
        <p className="mx-auto mt-2 max-w-md px-6 text-center text-sm text-rose-300">{error}</p>
      )}

      <div className="relative mx-auto mt-3 w-full max-w-lg flex-1 px-4">
        <div className="relative mx-auto aspect-square max-h-[min(62vh,560px)] w-full overflow-hidden rounded-3xl bg-black">
          <video
            ref={videoRef}
            className="h-full w-full object-cover"
            muted
            playsInline
            autoPlay
          />
          <canvas ref={canvasRef} className="hidden" aria-hidden />
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="h-[70%] w-[70%] rounded-2xl border-2 border-teal-400/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
          </div>
          {(phase === "starting" || phase === "reading") && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/45 text-sm">
              {phase === "reading" ? "Reading…" : "Starting camera…"}
            </div>
          )}
          {phase === "blocked" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/70 px-6 text-center">
              <p className="text-sm text-white/80">Allow camera permission to scan</p>
              <button
                type="button"
                onClick={() => void startCamera()}
                className="rounded-xl bg-teal-500 px-5 py-3 text-sm font-semibold text-white"
              >
                Retry camera
              </button>
              <button
                type="button"
                onClick={pickPhoto}
                className="text-sm text-teal-300 underline-offset-4 hover:underline"
              >
                Use photo instead
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="mt-auto flex flex-col items-center gap-3 px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3">
        <div className="flex w-full max-w-md items-center justify-center gap-8 px-2">
          <button
            type="button"
            disabled={busy}
            onClick={pickPhoto}
            className="text-center text-sm font-semibold text-teal-300 disabled:opacity-40"
          >
            Photo
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void startCamera()}
            className="text-center text-sm text-white/50 disabled:opacity-40"
          >
            Retry
          </button>
        </div>
        <p className="text-xs text-white/35">Live scan — same engines as kiosk / MRD QR</p>
      </div>

      <input
        ref={photoRef}
        type="file"
        accept="image/*"
        capture="environment"
        tabIndex={-1}
        aria-hidden
        className="pointer-events-none absolute h-0 w-0 opacity-0"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void onPhotoFile(f);
        }}
      />
    </div>
  );
}
