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
  /** May be async — scanner stays open with “Reading…” until it resolves. */
  onScan: (payload: AadhaarScanPayload) => void | Promise<void>;
  onClose: () => void;
}

type Phase = "starting" | "scanning" | "captured" | "reading" | "failed";

const LIVE_INTERVAL_MS = 240;
const AUTO_STILL_MS = 1400;

const COACHING = [
  { afterMs: 0, text: "Hold the QR on the back of the Aadhaar card inside the frame" },
  { afterMs: 5000, text: "Move a little closer — fill the frame with the QR" },
  { afterMs: 10000, text: "Hold steady… we’re capturing automatically" },
  { afterMs: 16000, text: "Try better light, or tap the light button" },
] as const;

function vibrate(ms = 35) {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* ignore */
  }
}

/**
 * Effortless Aadhaar QR capture — auto-detect, minimal chrome.
 * User job: hold card. System job: capture + decode.
 */
export default function KioskAadhaarScanner({ onScan, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const rafRef = useRef<number | null>(null);
  const stillTimerRef = useRef<number | null>(null);
  const coachTimerRef = useRef<number | null>(null);
  const lastLiveAtRef = useRef(0);
  const handledRef = useRef(false);
  const decodingRef = useRef(false);
  const onScanRef = useRef(onScan);
  const startedAtRef = useRef(Date.now());
  const autoTorchDoneRef = useRef(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const startCameraRef = useRef<(() => Promise<void>) | null>(null);

  const [phase, setPhase] = useState<Phase>("starting");
  const [coach, setCoach] = useState<string>(COACHING[0].text);
  const [helpOpen, setHelpOpen] = useState(false);
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
    if (coachTimerRef.current != null) {
      window.clearInterval(coachTimerRef.current);
      coachTimerRef.current = null;
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
      setPhase("captured");
      vibrate(40);
      setCoach("Got it — reading your details…");
      setPhase("reading");
      stopCamera();
      try {
        await onScanRef.current(payload);
      } catch (err: unknown) {
        handledRef.current = false;
        setPhase("failed");
        setError(
          err instanceof Error
            ? err.message
            : "Couldn’t read that QR. Hold the card steady and we’ll try again."
        );
        setCoach("We’ll keep scanning — hold the QR in the frame");
        void startCameraRef.current?.();
      }
    },
    [clearTimers, stopCamera]
  );

  const decodeStill = useCallback(async () => {
    if (handledRef.current || decodingRef.current) return;
    decodingRef.current = true;
    try {
      const still = await captureMaxResStill(trackRef.current, videoRef.current);
      if (!still || handledRef.current) return;
      const payload = await decodeAadhaarFromImageData(still.imageData, {
        alsoDetectFrom: still.bitmap || videoRef.current,
        mode: "thorough",
      });
      still.bitmap?.close?.();
      if (payload && !handledRef.current) await emitPayload(payload);
    } finally {
      decodingRef.current = false;
    }
  }, [emitPayload]);

  const scanLiveFrame = useCallback(() => {
    if (handledRef.current) return;
    const video = videoRef.current;
    if (!video) {
      rafRef.current = requestAnimationFrame(scanLiveFrame);
      return;
    }
    const now = Date.now();
    if (
      !decodingRef.current &&
      now - lastLiveAtRef.current >= LIVE_INTERVAL_MS &&
      video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
    ) {
      lastLiveAtRef.current = now;
      decodingRef.current = true;
      void decodeAadhaarFromVideo(video, canvasRef.current)
        .then((payload) => {
          if (payload && !handledRef.current) return emitPayload(payload);
        })
        .finally(() => {
          decodingRef.current = false;
        });
    }
    rafRef.current = requestAnimationFrame(scanLiveFrame);
  }, [emitPayload]);

  const startCamera = useCallback(async () => {
    stopCamera();
    handledRef.current = false;
    decodingRef.current = false;
    autoTorchDoneRef.current = false;
    startedAtRef.current = Date.now();
    setPhase("starting");
    setError(null);
    setHelpOpen(false);
    setCoach(COACHING[0].text);
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

      lastLiveAtRef.current = 0;
      rafRef.current = requestAnimationFrame(scanLiveFrame);

      stillTimerRef.current = window.setInterval(() => {
        if (!handledRef.current && !decodingRef.current && !document.hidden) {
          void decodeStill();
        }
      }, AUTO_STILL_MS);

      // Progressive coaching — never expose tech jargon
      coachTimerRef.current = window.setInterval(() => {
        if (handledRef.current) return;
        const elapsed = Date.now() - startedAtRef.current;
        let next = COACHING[0].text;
        for (const step of COACHING) {
          if (elapsed >= step.afterMs) next = step.text;
        }
        setCoach(next);

        // Soft assist: auto-enable torch once after 14s if still scanning
        if (
          elapsed >= 14000 &&
          !autoTorchDoneRef.current &&
          opened.torchSupported &&
          trackRef.current
        ) {
          autoTorchDoneRef.current = true;
          void setTorch(trackRef.current, true).then((ok) => {
            if (ok) setTorchOn(true);
          });
        }
      }, 1000);
    } catch (err: unknown) {
      const name =
        err && typeof err === "object" && "name" in err ? String((err as { name: string }).name) : "";
      setPhase("failed");
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        setError("Allow camera access to scan, or choose a photo of the Aadhaar QR.");
        setHelpOpen(true);
      } else if (name === "NotFoundError") {
        setError("No camera found. Choose a photo of the Aadhaar QR instead.");
        setHelpOpen(true);
      } else {
        setError("Camera couldn’t start. You can still choose a photo of the QR.");
        setHelpOpen(true);
      }
      setCoach("Choose a clear photo of the QR on the back of the card");
    }
  }, [decodeStill, scanLiveFrame, stopCamera]);

  startCameraRef.current = startCamera;

  useEffect(() => {
    void startCamera();
    return () => stopCamera();
  }, [startCamera, stopCamera]);

  const toggleTorch = async () => {
    const ok = await setTorch(trackRef.current, !torchOn);
    if (ok) setTorchOn((v) => !v);
  };

  const onUpload = async (file: File) => {
    if (handledRef.current) return;
    setPhase("reading");
    setCoach("Reading your details…");
    setError(null);
    try {
      const payload = await decodeAadhaarFromFile(file);
      if (!payload) {
        setPhase("failed");
        setError("We couldn’t find an Aadhaar QR in that photo. Use the large QR on the back.");
        setCoach("Try again with a closer photo of the QR");
        setHelpOpen(true);
        if (!streamRef.current) void startCamera();
        return;
      }
      await emitPayload(payload);
    } catch (e: unknown) {
      setPhase("failed");
      setError(e instanceof Error ? e.message : "Couldn’t read that photo");
      setHelpOpen(true);
    }
  };

  const overlayBusy = phase === "captured" || phase === "reading";
  const showPulse = phase === "scanning";

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-neutral-950 text-white">
      {/* Top bar — brand-light, one job */}
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
          {torchSupported && phase === "scanning" && (
            <button
              type="button"
              onClick={() => void toggleTorch()}
              className={`rounded-lg px-3 py-2 text-sm ${
                torchOn ? "bg-amber-500/30 text-amber-100" : "text-white/80 hover:bg-white/10"
              }`}
              aria-label={torchOn ? "Turn light off" : "Turn light on"}
            >
              {torchOn ? "Light on" : "Light"}
            </button>
          )}
        </div>
      </div>

      {/* Hero instruction — one sentence */}
      <p className="px-6 text-center text-lg font-semibold tracking-tight text-white sm:text-xl">
        {coach}
      </p>
      <p className="mt-1 px-6 text-center text-sm text-white/55">
        We’ll capture it automatically — no button needed
      </p>

      {/* Full-bleed-ish viewfinder */}
      <div className="relative mx-auto mt-4 w-full max-w-lg flex-1 px-4 pb-2">
        <div className="relative aspect-[3/4] max-h-[min(62vh,560px)] overflow-hidden rounded-3xl bg-black mx-auto w-full shadow-[0_0_0_1px_rgba(255,255,255,0.08)]">
          <video
            ref={videoRef}
            className="h-full w-full object-cover"
            muted
            playsInline
            autoPlay
          />
          <canvas ref={canvasRef} className="hidden" aria-hidden />

          {/* Soft vignette + frame — no tech chrome */}
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_45%,rgba(0,0,0,0.55)_100%)]" />
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div
              className={`relative h-[58%] w-[58%] max-w-[280px] rounded-2xl border-2 ${
                phase === "captured" || phase === "reading"
                  ? "border-emerald-400"
                  : "border-white/85"
              } ${showPulse ? "animate-pulse" : ""}`}
            >
              {/* Corner ticks */}
              <span className="absolute -left-0.5 -top-0.5 h-5 w-5 rounded-tl-xl border-l-[3px] border-t-[3px] border-teal-300" />
              <span className="absolute -right-0.5 -top-0.5 h-5 w-5 rounded-tr-xl border-r-[3px] border-t-[3px] border-teal-300" />
              <span className="absolute -bottom-0.5 -left-0.5 h-5 w-5 rounded-bl-xl border-b-[3px] border-l-[3px] border-teal-300" />
              <span className="absolute -bottom-0.5 -right-0.5 h-5 w-5 rounded-br-xl border-b-[3px] border-r-[3px] border-teal-300" />
            </div>
          </div>

          {phase === "starting" && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-sm text-white/90">
              Starting camera…
            </div>
          )}

          {overlayBusy && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-emerald-950/70 backdrop-blur-[2px]">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500 text-2xl text-white shadow-lg">
                {phase === "reading" ? "…" : "✓"}
              </div>
              <p className="text-base font-medium text-white">
                {phase === "reading" ? "Reading details…" : "Captured"}
              </p>
            </div>
          )}
        </div>
      </div>

      {error && (
        <p className="mx-auto max-w-md px-6 pb-2 text-center text-sm text-rose-300">{error}</p>
      )}

      {/* Footer — one secondary path, not a control panel */}
      <div className="mt-auto space-y-3 px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-2">
        {!helpOpen ? (
          <button
            type="button"
            onClick={() => setHelpOpen(true)}
            className="mx-auto block text-sm text-white/50 underline-offset-4 hover:text-white/80 hover:underline"
          >
            Having trouble?
          </button>
        ) : (
          <div className="mx-auto flex max-w-md flex-col gap-2 sm:flex-row sm:justify-center">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="rounded-2xl bg-white px-5 py-3.5 text-center text-sm font-semibold text-neutral-900"
            >
              Choose photo of QR
            </button>
            <button
              type="button"
              onClick={() => void startCamera()}
              className="rounded-2xl bg-white/10 px-5 py-3.5 text-center text-sm font-medium text-white"
            >
              Restart camera
            </button>
            {torchSupported && (
              <button
                type="button"
                onClick={() => void toggleTorch()}
                className="rounded-2xl bg-white/10 px-5 py-3.5 text-center text-sm font-medium text-white"
              >
                {torchOn ? "Turn light off" : "Turn light on"}
              </button>
            )}
          </div>
        )}
        <p className="text-center text-[11px] text-white/35">
          Only the last 4 digits of Aadhaar are kept · flip to the back of the card
        </p>
      </div>

      <input
        ref={fileRef}
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
    </div>
  );
}
