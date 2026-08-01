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
  /** Default: photo — OS camera (most reliable). live = getUserMedia preview. */
  initialMode?: "photo" | "live";
}

type Phase = "photo" | "starting" | "scanning" | "capturing" | "reading" | "failed";

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
 * Photo-first Aadhaar capture.
 * Default path uses the phone’s native camera app (sharp focused stills).
 * Live camera is optional for dedicated kiosk hardware.
 */
export default function KioskAadhaarScanner({
  onScan,
  onClose,
  initialMode = "photo",
}: Props) {
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
  const photoRef = useRef<HTMLInputElement | null>(null);

  const [phase, setPhase] = useState<Phase>(initialMode === "live" ? "starting" : "photo");
  const [coach, setCoach] = useState(
    initialMode === "live"
      ? "Hold the QR on the back of the Aadhaar card in the frame"
      : "Photograph the large QR on the back of the Aadhaar card"
  );
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  // Warm decoder as soon as the sheet opens
  useEffect(() => {
    warmAadhaarDecoder();
  }, []);

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
        setError(err instanceof Error ? err.message : "Couldn’t read that QR.");
        setCoach("Try another clear photo of the QR on the back");
        setPhase("photo");
      }
    },
    [clearTimers, stopCamera]
  );

  const onUpload = async (file: File) => {
    if (handledRef.current) return;
    setPhase("reading");
    setCoach("Reading your photo…");
    setError(null);
    try {
      const payload = await decodeAadhaarFromFile(file);
      if (!payload) {
        setPhase("failed");
        setError(
          "No Aadhaar QR found in that photo. Use the large QR on the BACK, fill the frame, avoid glare."
        );
        setCoach("Take another photo — closer to the QR");
        setPhase("photo");
        return;
      }
      await emitPayload(payload);
    } catch (e: unknown) {
      setPhase("failed");
      setError(e instanceof Error ? e.message : "Couldn’t read that photo");
      setPhase("photo");
    }
  };

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
            setError("Couldn’t capture. Switch to Photograph QR instead.");
            setPhase("scanning");
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
          setError("QR not found. Move closer, or use Photograph QR.");
          setPhase("scanning");
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
    } catch {
      setPhase("photo");
      setError("Live camera unavailable. Photograph the QR instead — that usually works better.");
      setCoach("Photograph the large QR on the back of the Aadhaar card");
    }
  }, [runStillDecode, scanLiveFrame, stopCamera]);

  startCameraRef.current = startCamera;

  useEffect(() => {
    if (initialMode === "live") {
      void startCamera();
    }
    return () => stopCamera();
  }, [initialMode, startCamera, stopCamera]);

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
        <div className="w-[4.5rem]" />
      </div>

      <p className="px-6 text-center text-xl font-semibold tracking-tight sm:text-2xl">{coach}</p>
      <p className="mt-2 px-6 text-center text-sm text-white/55">
        Flip the card · use the large QR on the back · fill the frame · avoid glare
      </p>

      {error && (
        <p className="mx-auto mt-3 max-w-md px-6 text-center text-sm text-rose-300">{error}</p>
      )}

      {/* PHOTO-FIRST — native camera app */}
      {(phase === "photo" || phase === "failed" || phase === "reading") && (
        <div className="mx-auto mt-8 flex w-full max-w-md flex-1 flex-col items-center justify-center gap-6 px-6 pb-8">
          <div className="flex h-40 w-40 items-center justify-center rounded-[2rem] border border-white/15 bg-white/5 text-6xl">
            {phase === "reading" ? "…" : "🪪"}
          </div>

          {phase === "reading" ? (
            <p className="text-base text-white/80">Reading details…</p>
          ) : (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => photoRef.current?.click()}
                className="w-full rounded-2xl bg-teal-500 px-6 py-5 text-lg font-bold text-white shadow-lg hover:bg-teal-400 disabled:opacity-50"
              >
                Photograph QR
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => photoRef.current?.click()}
                className="w-full rounded-2xl bg-white/10 px-6 py-4 text-sm font-medium text-white hover:bg-white/15"
              >
                Choose from gallery
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void startCamera()}
                className="text-sm text-white/45 underline-offset-4 hover:text-white/70 hover:underline"
              >
                Use live camera instead
              </button>
            </>
          )}
        </div>
      )}

      {/* LIVE mode */}
      {(phase === "starting" || phase === "scanning" || phase === "capturing") && (
        <>
          <div className="relative mx-auto mt-3 w-full max-w-lg flex-1 px-4">
            <div className="relative mx-auto aspect-[3/4] max-h-[min(52vh,480px)] w-full overflow-hidden rounded-3xl bg-black">
              <video
                ref={videoRef}
                className="h-full w-full object-cover"
                muted
                playsInline
                autoPlay
              />
              <canvas ref={canvasRef} className="hidden" aria-hidden />
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="h-[58%] w-[58%] rounded-2xl border-2 border-white/90" />
              </div>
              {phase === "starting" && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-sm">
                  Starting camera…
                </div>
              )}
            </div>
          </div>

          <div className="mt-auto flex flex-col items-center gap-3 px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3">
            <div className="flex w-full max-w-md items-center justify-between gap-4 px-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  stopCamera();
                  setPhase("photo");
                  setCoach("Photograph the large QR on the back of the Aadhaar card");
                }}
                className="w-24 text-center text-xs font-semibold text-teal-300"
              >
                Photograph QR
              </button>
              <button
                type="button"
                disabled={busy || phase === "starting"}
                aria-label="Capture"
                onClick={() => void runStillDecode(true)}
                className="flex h-[72px] w-[72px] items-center justify-center rounded-full bg-white disabled:opacity-50"
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
                <span className="w-24" />
              )}
            </div>
          </div>
        </>
      )}

      {/* Always available for photo path — capture opens OS camera on phones */}
      <input
        ref={photoRef}
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
