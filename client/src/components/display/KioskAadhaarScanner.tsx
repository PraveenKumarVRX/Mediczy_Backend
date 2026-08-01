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

type Phase = "starting" | "scanning" | "capturing" | "reading" | "permission";

const LIVE_INTERVAL_MS = 280;
const AUTO_STILL_MS = 1600;

function vibrate(ms = 35) {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* ignore */
  }
}

function waitForVideoEl(
  getEl: () => HTMLVideoElement | null,
  tries = 40
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

/**
 * Kiosk Aadhaar scanner — live camera first.
 * Opens rear camera immediately, auto-decodes QR, shutter as backup.
 * Native photo is only a last-resort fallback when getUserMedia is blocked.
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
  const startingRef = useRef(false);
  const onScanRef = useRef(onScan);
  const startCameraRef = useRef<() => Promise<void>>(async () => undefined);
  const photoRef = useRef<HTMLInputElement | null>(null);

  const [phase, setPhase] = useState<Phase>("starting");
  const [coach, setCoach] = useState("Hold the large QR on the back in the frame");
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

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
        setError(err instanceof Error ? err.message : "Couldn’t read that QR.");
        setCoach("Hold the QR steady in the frame and try again");
        void startCameraRef.current();
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
        setError(
          "No Aadhaar QR found. Use the large QR on the BACK, fill the frame, avoid glare."
        );
        setCoach("Take another clear photo of the QR");
        setPhase("permission");
        return;
      }
      await emitPayload(payload);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Couldn’t read that photo");
      setPhase("permission");
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
            setError("Couldn’t capture — hold steady and tap again");
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
          setError("QR not found — move closer and fill the frame");
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
    if (startingRef.current) return;
    startingRef.current = true;
    stopCamera();
    handledRef.current = false;
    liveBusyRef.current = false;
    stillBusyRef.current = false;
    setPhase("starting");
    setError(null);
    setCoach("Hold the large QR on the back in the frame");
    warmAadhaarDecoder();

    try {
      // Ensure <video> is mounted before attaching the stream (fixes black camera)
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
        // Autoplay can fail until a gesture; stream is still attached — try again shortly
        await new Promise((r) => setTimeout(r, 120));
        await video.play().catch(() => undefined);
      }

      if (handledRef.current) {
        opened.stream.getTracks().forEach((t) => t.stop());
        return;
      }

      setPhase("scanning");
      setCoach("Hold steady — scanning automatically");

      lastLiveAtRef.current = 0;
      rafRef.current = requestAnimationFrame(scanLiveFrame);
      stillTimerRef.current = window.setInterval(() => {
        if (!handledRef.current && !stillBusyRef.current && !document.hidden) {
          void runStillDecode(false);
        }
      }, AUTO_STILL_MS);
    } catch (e: unknown) {
      stopCamera();
      const msg =
        e instanceof Error && /Permission|NotAllowed|denied/i.test(e.message)
          ? "Camera permission blocked. Allow camera for this site, then retry."
          : e instanceof Error
            ? e.message
            : "Could not open camera";
      setError(msg);
      setCoach("Allow camera access to scan Aadhaar");
      setPhase("permission");
    } finally {
      startingRef.current = false;
    }
  }, [runStillDecode, scanLiveFrame, stopCamera]);

  startCameraRef.current = startCamera;

  // Open camera as soon as the scanner mounts
  useEffect(() => {
    void startCameraRef.current();
    return () => {
      startingRef.current = false;
      stopCamera();
    };
  }, [stopCamera]);

  const busy = phase === "capturing" || phase === "reading";
  const showPreview =
    phase === "starting" || phase === "scanning" || phase === "capturing" || phase === "reading";

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
        Flip the card · large QR on the back · fill the frame · avoid glare
      </p>

      {error && (
        <p className="mx-auto mt-3 max-w-md px-6 text-center text-sm text-rose-300">{error}</p>
      )}

      {showPreview && (
        <>
          <div className="relative mx-auto mt-3 w-full max-w-lg flex-1 px-4">
            <div className="relative mx-auto aspect-[3/4] max-h-[min(58vh,520px)] w-full overflow-hidden rounded-3xl bg-black">
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
                <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-sm">
                  {phase === "reading" ? "Reading details…" : "Starting camera…"}
                </div>
              )}
              {phase === "capturing" && (
                <div className="absolute inset-0 bg-white/20 animate-pulse" />
              )}
            </div>
          </div>

          <div className="mt-auto flex flex-col items-center gap-3 px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3">
            <div className="flex w-full max-w-md items-center justify-between gap-4 px-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void startCamera()}
                className="w-24 text-center text-xs font-semibold text-white/60"
              >
                Retry
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
            <p className="text-xs text-white/40">Auto-scans · tap shutter if needed</p>
          </div>
        </>
      )}

      {phase === "permission" && (
        <div className="mx-auto mt-10 flex w-full max-w-md flex-1 flex-col items-center gap-5 px-6 pb-8">
          <p className="text-center text-sm text-white/70">
            This kiosk needs camera access to scan your Aadhaar QR.
          </p>
          <button
            type="button"
            onClick={() => void startCamera()}
            className="w-full rounded-2xl bg-teal-500 px-6 py-5 text-lg font-bold text-white hover:bg-teal-400"
          >
            Open camera
          </button>
          <button
            type="button"
            onClick={() => photoRef.current?.click()}
            className="text-sm text-white/45 underline-offset-4 hover:text-white/70 hover:underline"
          >
            Or take a photo instead
          </button>
        </div>
      )}

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
