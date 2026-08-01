import { useCallback, useEffect, useRef, useState } from "react";
import {
  captureMaxResStill,
  openAadhaarCamera,
  setTorch,
} from "@/lib/aadhaarCamera";
import {
  decodeAadhaarFromFile,
  decodeAadhaarFromImageData,
  decodeAadhaarFromVideo,
  warmAadhaarDecoder,
  type AadhaarScanPayload,
} from "@/lib/aadhaarQrDecode";

export type { AadhaarScanPayload };

interface Props {
  onScan: (payload: AadhaarScanPayload) => void | Promise<void>;
  onClose: () => void;
}

type Phase = "starting" | "scanning" | "capturing" | "reading" | "failed";

const LIVE_INTERVAL_MS = 320;
const AUTO_STILL_MS = 1800;

function vibrate(ms = 35) {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* ignore */
  }
}

/**
 * Reliable Aadhaar capture UX:
 * - Live auto-scan (best effort)
 * - One familiar shutter tap (hi-res still, timeout-safe)
 * - Native OS camera always one tap away (most reliable on phones)
 */
export default function KioskAadhaarScanner({ onScan, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const rafRef = useRef<number | null>(null);
  const stillTimerRef = useRef<number | null>(null);
  const lastLiveAtRef = useRef(0);
  const handledRef = useRef(false);
  const liveBusyRef = useRef(false);
  const stillBusyRef = useRef(false);
  const onScanRef = useRef(onScan);
  const startCameraRef = useRef<(() => Promise<void>) | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const osCamRef = useRef<HTMLInputElement | null>(null);

  const [phase, setPhase] = useState<Phase>("starting");
  const [coach, setCoach] = useState("Hold the QR on the back of the Aadhaar card in the frame");
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  const clearTimers = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (stillTimerRef.current != null) {
      window.clearInterval(stillTimerRef.current);
      stillTimerRef.current = null;
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
    const video = videoRef.current;
    if (video) video.srcObject = null;
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
      setCoach("Got it — reading your details…");
      setError(null);
      stopCamera();
      try {
        await onScanRef.current(payload);
      } catch (err: unknown) {
        handledRef.current = false;
        setPhase("failed");
        setError(
          err instanceof Error
            ? err.message
            : "Couldn’t read that QR. Try the shutter or phone camera."
        );
        setCoach("Hold the QR in the frame, then tap the shutter");
        void startCameraRef.current?.();
      }
    },
    [clearTimers, stopCamera]
  );

  const runStillDecode = useCallback(
    async (manual: boolean) => {
      if (handledRef.current || stillBusyRef.current) return;
      stillBusyRef.current = true;
      if (manual) {
        setPhase("capturing");
        setCoach("Capturing… hold steady");
      }
      try {
        const still = await captureMaxResStill(trackRef.current, videoRef.current, {
          takePhotoTimeoutMs: manual ? 4000 : 2200,
        });
        if (!still || handledRef.current) {
          if (manual && !handledRef.current) {
            setError("Couldn’t capture a clear frame. Try Phone camera instead.");
            setPhase("scanning");
            setCoach("Tap Phone camera for a sharp photo of the QR");
          }
          return;
        }
        const payload = await decodeAadhaarFromImageData(still.imageData, {
          alsoDetectFrom: still.bitmap || videoRef.current,
          mode: "thorough",
        });
        still.bitmap?.close?.();
        if (payload && !handledRef.current) {
          await emitPayload(payload);
          return;
        }
        if (manual && !handledRef.current) {
          setError("QR not found yet. Move closer so the QR fills the frame, or use Phone camera.");
          setPhase("scanning");
          setCoach("Fill the frame with the QR, then tap the shutter again");
        }
      } finally {
        stillBusyRef.current = false;
        if (!handledRef.current) {
          setPhase((p) => (p === "capturing" ? "scanning" : p));
        }
      }
    },
    [emitPayload]
  );

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
      !stillBusyRef.current &&
      now - lastLiveAtRef.current >= LIVE_INTERVAL_MS &&
      video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
    ) {
      lastLiveAtRef.current = now;
      liveBusyRef.current = true;
      void decodeAadhaarFromVideo(video, canvasRef.current)
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
    stopCamera();
    handledRef.current = false;
    liveBusyRef.current = false;
    stillBusyRef.current = false;
    setPhase("starting");
    setError(null);
    setCoach("Hold the QR on the back of the Aadhaar card in the frame");
    warmAadhaarDecoder();

    try {
      const opened = await openAadhaarCamera();
      streamRef.current = opened.stream;
      trackRef.current = opened.track;
      setTorchSupported(opened.torchSupported);

      const video = videoRef.current;
      if (!video) {
        opened.stream.getTracks().forEach((t) => t.stop());
        return;
      }
      video.srcObject = opened.stream;
      await video.play();
      setPhase("scanning");
      setCoach("Hold steady — or tap the shutter");

      lastLiveAtRef.current = 0;
      rafRef.current = requestAnimationFrame(scanLiveFrame);

      stillTimerRef.current = window.setInterval(() => {
        if (!handledRef.current && !stillBusyRef.current && !document.hidden) {
          void runStillDecode(false);
        }
      }, AUTO_STILL_MS);
    } catch (err: unknown) {
      const name =
        err && typeof err === "object" && "name" in err ? String((err as { name: string }).name) : "";
      setPhase("failed");
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        setError("Camera blocked. Use Phone camera instead — it opens your normal camera app.");
      } else {
        setError("Camera unavailable. Use Phone camera to photograph the QR.");
      }
      setCoach("Photograph the QR on the back of the Aadhaar card");
    }
  }, [runStillDecode, scanLiveFrame, stopCamera]);

  startCameraRef.current = startCamera;

  useEffect(() => {
    void startCamera();
    return () => stopCamera();
  }, [startCamera, stopCamera]);

  const onUpload = async (file: File) => {
    if (handledRef.current) return;
    setPhase("reading");
    setCoach("Reading your details…");
    setError(null);
    try {
      const payload = await decodeAadhaarFromFile(file);
      if (!payload) {
        setPhase("failed");
        setError("No Aadhaar QR found. Photograph the large QR on the back, close-up.");
        setCoach("Try again with a closer photo");
        if (!streamRef.current) void startCamera();
        else setPhase("scanning");
        return;
      }
      await emitPayload(payload);
    } catch (e: unknown) {
      setPhase("failed");
      setError(e instanceof Error ? e.message : "Couldn’t read that photo");
    }
  };

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
        <p className="text-sm font-medium text-white/90">Scan Aadhaar</p>
        <div className="w-[4.5rem] flex justify-end">
          {torchSupported && (phase === "scanning" || phase === "capturing") && (
            <button
              type="button"
              onClick={() => {
                void setTorch(trackRef.current, !torchOn).then((ok) => {
                  if (ok) setTorchOn((v) => !v);
                });
              }}
              className={`rounded-lg px-3 py-2 text-sm ${
                torchOn ? "bg-amber-500/30 text-amber-100" : "text-white/80 hover:bg-white/10"
              }`}
            >
              {torchOn ? "Light on" : "Light"}
            </button>
          )}
        </div>
      </div>

      <p className="px-6 text-center text-lg font-semibold tracking-tight sm:text-xl">{coach}</p>
      <p className="mt-1 px-6 text-center text-sm text-white/50">
        Back of the card · large QR · fill the frame
      </p>

      <div className="relative mx-auto mt-3 w-full max-w-lg flex-1 px-4">
        <div className="relative mx-auto aspect-[3/4] max-h-[min(56vh,520px)] w-full overflow-hidden rounded-3xl bg-black shadow-[0_0_0_1px_rgba(255,255,255,0.08)]">
          <video
            ref={videoRef}
            className="h-full w-full object-cover"
            muted
            playsInline
            autoPlay
          />
          <canvas ref={canvasRef} className="hidden" aria-hidden />
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_42%,rgba(0,0,0,0.55)_100%)]" />
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div
              className={`h-[58%] w-[58%] max-w-[280px] rounded-2xl border-2 ${
                phase === "reading" ? "border-emerald-400" : "border-white/90"
              }`}
            />
          </div>

          {phase === "starting" && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-sm">
              Starting camera…
            </div>
          )}
          {phase === "reading" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-emerald-950/70">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500 text-xl">
                ✓
              </div>
              <p className="font-medium">Reading details…</p>
            </div>
          )}
        </div>
      </div>

      {error && (
        <p className="mx-auto max-w-md px-6 pb-2 text-center text-sm text-rose-300">{error}</p>
      )}

      {/* Familiar camera controls — one shutter, one phone-camera escape hatch */}
      <div className="mt-auto flex flex-col items-center gap-4 px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3">
        <div className="flex w-full max-w-md items-center justify-between gap-4 px-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
            className="w-20 text-center text-xs font-medium text-white/70 disabled:opacity-40"
          >
            Gallery
          </button>

          <button
            type="button"
            disabled={busy || phase === "starting"}
            aria-label="Capture"
            onClick={() => void runStillDecode(true)}
            className="relative flex h-[72px] w-[72px] items-center justify-center rounded-full bg-white shadow-lg disabled:opacity-50"
          >
            <span className="h-[60px] w-[60px] rounded-full border-[3px] border-neutral-900 bg-white" />
          </button>

          <button
            type="button"
            disabled={busy}
            onClick={() => osCamRef.current?.click()}
            className="w-20 text-center text-xs font-semibold text-teal-300 disabled:opacity-40"
          >
            Phone camera
          </button>
        </div>
        <p className="text-center text-[11px] text-white/35">
          Tap the shutter if it doesn’t capture on its own · only last 4 Aadhaar digits are kept
        </p>
      </div>

      <input
        ref={osCamRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void onUpload(f);
        }}
      />
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void onUpload(f);
        }}
      />
    </div>
  );
}
