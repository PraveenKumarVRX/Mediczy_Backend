import { useCallback, useEffect, useRef, useState } from "react";
import {
  captureMaxResStill,
  isIOS,
  isMobilePhone,
  openAadhaarCamera,
  setTorch,
  supportsImageCapture,
} from "@/lib/aadhaarCamera";
import {
  decodeAadhaarFromFileWithServerFallback,
  decodeAadhaarFromImageData,
  decodeAadhaarFromVideo,
  decodeAadhaarFromVideoFrameWithServerFallback,
  videoFrameToJpegBlob,
  warmAadhaarDecoder,
  type AadhaarScanPayload,
  type ServerDecodeFailure,
} from "@/lib/aadhaarQrDecode";
import { warmAadhaarWorker } from "@/lib/aadhaarQrWorkerBridge";
import { getDisplayDeviceToken } from "@/utils/displayDeviceAuth";

export type { AadhaarScanPayload };

interface Props {
  onScan: (payload: AadhaarScanPayload) => void | Promise<void>;
  onClose: () => void;
}

type Phase = "starting" | "scanning" | "capturing" | "reading" | "blocked";

/** Fast live attempt only — do NOT call ImageCapture in a tight loop (breaks Android). */
const LIVE_MS = 180;
/** Soft-frame rescue: JPEG snapshot → local + server (the path that actually works). */
const ASSIST_MS = 2200;

function vibrate(ms = 35) {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* ignore */
  }
}

function waitForVideoEl(
  getEl: () => HTMLVideoElement | null,
  tries = 50
): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    let n = 0;
    const tick = () => {
      const el = getEl();
      if (el) {
        resolve(el);
        return;
      }
      if (++n >= tries) {
        reject(new Error("Camera preview failed to start"));
        return;
      }
      requestAnimationFrame(tick);
    };
    tick();
  });
}

function authHeaders(): Record<string, string> {
  const token = getDisplayDeviceToken();
  return token ? { "x-device-token": token } : {};
}

/**
 * Working Aadhaar scanner (learned the hard way):
 * - Show live camera (good UX)
 * - Do NOT auto-fire ImageCapture.takePhoto (starves Android)
 * - Periodically snapshot video→JPEG and run local + server decode
 * - Manual shutter / Photo as backup
 */
export default function KioskAadhaarScanner({ onScan, onClose }: Props) {
  const ios = isIOS();
  const mobile = isMobilePhone();
  const hasImageCapture = supportsImageCapture();

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const rafRef = useRef<number | null>(null);
  const assistTimerRef = useRef<number | null>(null);
  const lastLiveAtRef = useRef(0);
  const handledRef = useRef(false);
  const liveBusyRef = useRef(false);
  const assistBusyRef = useRef(false);
  const startingRef = useRef(false);
  const onScanRef = useRef(onScan);
  const startCameraRef = useRef<() => Promise<void>>(async () => undefined);
  const photoRef = useRef<HTMLInputElement | null>(null);

  const [phase, setPhase] = useState<Phase>("starting");
  const [status, setStatus] = useState("Starting camera…");
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    warmAadhaarDecoder();
    warmAadhaarWorker();
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
    const stream = streamRef.current;
    streamRef.current = null;
    trackRef.current = null;
    if (stream) {
      for (const track of stream.getTracks()) track.stop();
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setTorchOn(false);
    setTorchSupported(false);
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

  /** Soft-frame rescue — JPEG from video + server. No ImageCapture. */
  const runAssistDecode = useCallback(async () => {
    if (handledRef.current || assistBusyRef.current || liveBusyRef.current) return;
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

  const runManualCapture = useCallback(async () => {
    if (handledRef.current || assistBusyRef.current) return;

    // iOS: OS camera still is sharpest
    if (ios || !hasImageCapture) {
      pickPhoto();
      return;
    }

    assistBusyRef.current = true;
    setPhase("capturing");
    setStatus("Capturing…");
    try {
      const still = await captureMaxResStill(trackRef.current, videoRef.current, {
        takePhotoTimeoutMs: 3500,
      });
      let payload: AadhaarScanPayload | null = null;
      const failure: ServerDecodeFailure = {};

      if (still) {
        payload = await decodeAadhaarFromImageData(still.imageData, {
          alsoDetectFrom: still.bitmap || videoRef.current,
          mode: "thorough",
          blob: still.blob,
        });
        if (!payload) {
          const blob = still.blob || (await videoFrameToJpegBlob(videoRef.current!));
          if (blob) {
            payload = await decodeAadhaarFromFileWithServerFallback(
              blob,
              authHeaders(),
              undefined,
              failure
            );
          }
        }
        still.bitmap?.close?.();
      } else {
        const blob = await videoFrameToJpegBlob(videoRef.current!);
        if (blob) {
          payload = await decodeAadhaarFromFileWithServerFallback(
            blob,
            authHeaders(),
            undefined,
            failure
          );
        }
      }

      if (payload && !handledRef.current) {
        await emitPayload(payload);
        return;
      }
      setError(
        failure.authMissing
          ? "Not found — server backup needs device/login token. Try Photo."
          : "Not found — move closer, fill the frame, or use Photo"
      );
      setPhase("scanning");
      setStatus("Hold the large QR on the back in the frame");
    } finally {
      assistBusyRef.current = false;
      if (!handledRef.current) {
        setPhase((p) => (p === "capturing" ? "scanning" : p));
      }
    }
  }, [emitPayload, hasImageCapture, ios]);

  const scanLiveFrame = useCallback(() => {
    if (handledRef.current) return;
    const video = videoRef.current;
    if (!video) {
      rafRef.current = requestAnimationFrame(scanLiveFrame);
      return;
    }
    const now = Date.now();
    if (
      !liveBusyRef.current &&
      !assistBusyRef.current &&
      now - lastLiveAtRef.current >= LIVE_MS &&
      video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
    ) {
      lastLiveAtRef.current = now;
      liveBusyRef.current = true;
      void decodeAadhaarFromVideo(video, canvasRef.current, { roiRatio: 0.58 })
        .then((payload) => {
          if (payload && !handledRef.current) return emitPayload(payload);
        })
        .finally(() => {
          liveBusyRef.current = false;
        });
    }
    rafRef.current = requestAnimationFrame(scanLiveFrame);
  }, [emitPayload]);

  const startCamera = useCallback(async () => {
    if (startingRef.current) return;
    startingRef.current = true;
    stopCamera();
    handledRef.current = false;
    liveBusyRef.current = false;
    assistBusyRef.current = false;
    setPhase("starting");
    setStatus("Starting camera…");
    setError(null);
    warmAadhaarDecoder();
    warmAadhaarWorker();

    try {
      const video = await waitForVideoEl(() => videoRef.current);
      const opened = await openAadhaarCamera();
      streamRef.current = opened.stream;
      trackRef.current = opened.track;
      setTorchSupported(opened.torchSupported);

      video.srcObject = opened.stream;
      video.muted = true;
      video.setAttribute("playsinline", "true");
      video.setAttribute("webkit-playsinline", "true");
      try {
        await video.play();
      } catch {
        await new Promise((r) => setTimeout(r, 120));
        await video.play().catch(() => undefined);
      }

      if (handledRef.current) {
        opened.stream.getTracks().forEach((t) => t.stop());
        return;
      }

      setPhase("scanning");
      setStatus("Hold the large QR on the back in the frame");

      lastLiveAtRef.current = 0;
      rafRef.current = requestAnimationFrame(scanLiveFrame);
      // Soft-frame rescue — NOT ImageCapture.auto (that broke Android)
      assistTimerRef.current = window.setInterval(() => {
        if (!handledRef.current && !document.hidden) {
          void runAssistDecode();
        }
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
    } finally {
      startingRef.current = false;
    }
  }, [runAssistDecode, scanLiveFrame, stopCamera]);

  startCameraRef.current = startCamera;

  useEffect(() => {
    void startCameraRef.current();
    return () => {
      startingRef.current = false;
      stopCamera();
    };
  }, [stopCamera]);

  const busy = phase === "capturing" || phase === "reading";

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
        <div className="relative mx-auto aspect-[3/4] max-h-[min(62vh,560px)] w-full overflow-hidden rounded-3xl bg-black">
          <video
            ref={videoRef}
            className="h-full w-full object-cover"
            muted
            playsInline
            autoPlay
          />
          <canvas ref={canvasRef} className="hidden" aria-hidden />
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="h-[58%] w-[58%] rounded-2xl border-2 border-white/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
          </div>
          {(phase === "starting" || phase === "reading") && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/45 text-sm">
              {phase === "reading" ? "Reading…" : "Starting camera…"}
            </div>
          )}
          {phase === "capturing" && <div className="absolute inset-0 bg-white/15 animate-pulse" />}
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
        <div className="flex w-full max-w-md items-center justify-between gap-4 px-2">
          <button
            type="button"
            disabled={busy}
            onClick={pickPhoto}
            className="w-24 text-center text-xs font-semibold text-teal-300 disabled:opacity-40"
          >
            Photo
          </button>
          <button
            type="button"
            disabled={busy || phase === "starting" || phase === "blocked"}
            aria-label="Capture"
            onClick={() => void runManualCapture()}
            className="flex h-[72px] w-[72px] items-center justify-center rounded-full bg-white disabled:opacity-40"
          >
            <span className="h-[60px] w-[60px] rounded-full border-[3px] border-neutral-900" />
          </button>
          {torchSupported ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                void setTorch(trackRef.current, !torchOn).then((ok) => {
                  if (ok) setTorchOn((v) => !v);
                });
              }}
              className="w-24 text-center text-xs text-white/70"
            >
              {torchOn ? "Light on" : "Light"}
            </button>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => void startCamera()}
              className="w-24 text-center text-xs text-white/50"
            >
              Retry
            </button>
          )}
        </div>
        <p className="text-xs text-white/35">
          {mobile || ios
            ? "Hold steady — scanning automatically"
            : "Hold the card close and steady"}
        </p>
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
