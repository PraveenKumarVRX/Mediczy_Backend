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
  warmAadhaarDecoder,
  type AadhaarScanPayload,
} from "@/lib/aadhaarQrDecode";
import { warmAadhaarWorker } from "@/lib/aadhaarQrWorkerBridge";
import { getDisplayDeviceToken } from "@/utils/displayDeviceAuth";

export type { AadhaarScanPayload };

interface Props {
  onScan: (payload: AadhaarScanPayload) => void | Promise<void>;
  onClose: () => void;
}

type Phase = "starting" | "scanning" | "capturing" | "reading" | "permission" | "snap";

const LIVE_NATIVE_MS = 90;
const LIVE_WASM_MS = 200;
/** Android ImageCapture stills are the sharp path (iOS has no ImageCapture — video frames work there) */
const AUTO_STILL_MS_ANDROID = 650;
const AUTO_STILL_MS_DEFAULT = 900;

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
 * Live Aadhaar Secure QR scanner.
 *
 * Reality check from prod:
 *  - iOS live camera DID lock (video frames + wasm) — do not force photo-only
 *  - Android/laptop failed largely because ROI used raw video-center while the
 *    preview uses object-fit:cover (wrong crop on landscape→portrait)
 *  - Android also has ImageCapture — use frequent max-res stills
 *  - Laptop webcams are often too soft; photo upload stays prominent there
 */
export default function KioskAadhaarScanner({ onScan, onClose }: Props) {
  const mobile = isMobilePhone();
  const ios = isIOS();
  const android = mobile && !ios;
  const hasImageCapture = supportsImageCapture();
  const desktop = !mobile && !ios;

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const rafRef = useRef<number | null>(null);
  const stillTimerRef = useRef<number | null>(null);
  const lastNativeAtRef = useRef(0);
  const lastWasmAtRef = useRef(0);
  const handledRef = useRef(false);
  const liveBusyRef = useRef(false);
  const stillBusyRef = useRef(false);
  const startingRef = useRef(false);
  const failStillsRef = useRef(0);
  const onScanRef = useRef(onScan);
  const startCameraRef = useRef<() => Promise<void>>(async () => undefined);
  const photoRef = useRef<HTMLInputElement | null>(null);

  // Live-first on phones (iOS proved live works). Desktop starts on upload.
  const [phase, setPhase] = useState<Phase>(desktop ? "snap" : "starting");
  const [coach, setCoach] = useState(
    desktop
      ? "Upload a sharp phone photo of the back QR — laptop cams often can’t resolve it"
      : "Hold the large QR on the back in the frame"
  );
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanPulse, setScanPulse] = useState(0);

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
        setCoach("Hold steady in the frame, or use Sharp photo");
        if (desktop) {
          setPhase("snap");
        } else {
          setPhase("starting");
          void startCameraRef.current();
        }
      }
    },
    [clearTimers, desktop, stopCamera]
  );

  const onUpload = async (file: File) => {
    if (handledRef.current) return;
    setPhase("reading");
    setCoach("Decoding Secure QR…");
    setError(null);
    stopCamera();
    try {
      const token = getDisplayDeviceToken();
      const headers: Record<string, string> = {};
      if (token) headers["x-device-token"] = token;
      const payload = await decodeAadhaarFromFileWithServerFallback(file, headers);
      if (!payload) {
        setError(
          "No Aadhaar QR found. Use the large QR on the BACK, fill the frame, avoid glare."
        );
        setCoach("Take another clear photo — move closer to the QR");
        setPhase("snap");
        return;
      }
      await emitPayload(payload);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Couldn’t read that photo");
      setPhase("snap");
    }
  };

  const openOsCamera = () => {
    const el = photoRef.current;
    if (!el) return;
    try {
      el.value = "";
    } catch {
      /* ignore */
    }
    el.click();
  };

  const goSnap = useCallback(
    (msg?: string) => {
      stopCamera();
      if (msg) setError(msg);
      setCoach(
        desktop
          ? "Upload a sharp phone photo of the back QR"
          : "Photograph the large QR on the back — fill the frame"
      );
      setPhase("snap");
    },
    [desktop, stopCamera]
  );

  const runStillDecode = useCallback(
    async (manual: boolean) => {
      if (handledRef.current || stillBusyRef.current) return;

      // iOS has no ImageCapture — shutter opens OS camera for a real still
      if (manual && (ios || !hasImageCapture)) {
        openOsCamera();
        return;
      }

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
          if (manual && !handledRef.current) openOsCamera();
          return;
        }
        const payload = await decodeAadhaarFromImageData(still.imageData, {
          alsoDetectFrom: still.bitmap || videoRef.current,
          mode: "thorough",
          blob: still.blob,
        });
        still.bitmap?.close?.();
        if (payload && !handledRef.current) {
          failStillsRef.current = 0;
          await emitPayload(payload);
          return;
        }
        failStillsRef.current += 1;
        if (manual && !handledRef.current) {
          if (failStillsRef.current >= 2) {
            setError("Opening sharp photo capture");
            openOsCamera();
          } else {
            setError("Not locked yet — move closer, fill the frame");
            setPhase("scanning");
          }
        } else if (!manual && failStillsRef.current >= (android ? 4 : 6)) {
          setCoach("Tap Sharp photo if live doesn’t lock");
        }
      } finally {
        stillBusyRef.current = false;
        if (!handledRef.current) {
          setPhase((p) => (p === "capturing" ? "scanning" : p));
        }
      }
    },
    [android, emitPayload, hasImageCapture, ios]
  );

  const scanLiveFrame = useCallback(() => {
    if (handledRef.current) return;
    const video = videoRef.current;
    if (!video) {
      rafRef.current = requestAnimationFrame(scanLiveFrame);
      return;
    }
    const now = Date.now();
    const dueNative = now - lastNativeAtRef.current >= LIVE_NATIVE_MS;
    const dueWasm = now - lastWasmAtRef.current >= LIVE_WASM_MS;

    if (
      !liveBusyRef.current &&
      !stillBusyRef.current &&
      (dueNative || dueWasm) &&
      video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
    ) {
      if (dueNative) lastNativeAtRef.current = now;
      if (dueWasm) lastWasmAtRef.current = now;
      liveBusyRef.current = true;
      setScanPulse((n) => (n + 1) % 1000);
      // 0.58 matches the on-screen guide; decode maps via object-fit:cover
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
    stillBusyRef.current = false;
    failStillsRef.current = 0;
    setPhase("starting");
    setError(null);
    setCoach("Hold the large QR on the back in the frame");
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
      setCoach(
        android
          ? "Scanning… hold steady — Android also snaps sharp stills automatically"
          : ios
            ? "Scanning… hold the back QR in the frame"
            : "Scanning… or use Sharp photo / upload"
      );

      lastNativeAtRef.current = 0;
      lastWasmAtRef.current = 0;
      rafRef.current = requestAnimationFrame(scanLiveFrame);
      const stillMs = android && hasImageCapture ? AUTO_STILL_MS_ANDROID : AUTO_STILL_MS_DEFAULT;
      stillTimerRef.current = window.setInterval(() => {
        if (!handledRef.current && !stillBusyRef.current && !document.hidden) {
          void runStillDecode(false);
        }
      }, stillMs);
    } catch (e: unknown) {
      stopCamera();
      const msg =
        e instanceof Error && /Permission|NotAllowed|denied/i.test(e.message)
          ? "Camera permission blocked. Allow camera, or use photo capture below."
          : e instanceof Error
            ? e.message
            : "Could not open live camera";
      setError(msg);
      goSnap();
    } finally {
      startingRef.current = false;
    }
  }, [
    android,
    goSnap,
    hasImageCapture,
    ios,
    runStillDecode,
    scanLiveFrame,
    stopCamera,
  ]);

  startCameraRef.current = startCamera;

  useEffect(() => {
    if (!desktop) {
      void startCameraRef.current();
    }
    return () => {
      startingRef.current = false;
      stopCamera();
    };
  }, [desktop, stopCamera]);

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
        <p className="text-sm font-medium text-white/90">Aadhaar scanner</p>
        <div className="w-[4.5rem]" />
      </div>

      <p className="px-6 text-center text-xl font-semibold tracking-tight sm:text-2xl">{coach}</p>
      <p className="mt-2 px-6 text-center text-sm text-white/55">
        Flip the card · large QR on the back · fill the frame · avoid glare
      </p>

      {error && (
        <p className="mx-auto mt-3 max-w-md px-6 text-center text-sm text-rose-300">{error}</p>
      )}

      {phase === "snap" && (
        <div className="mx-auto mt-8 flex w-full max-w-md flex-1 flex-col items-center gap-5 px-6 pb-8">
          <div className="flex h-36 w-36 items-center justify-center rounded-[2rem] border border-teal-400/30 bg-teal-500/10 text-5xl text-teal-300">
            ⌗
          </div>
          <label
            className={`flex w-full cursor-pointer items-center justify-center rounded-2xl bg-teal-500 px-6 py-5 text-lg font-bold text-white shadow-lg hover:bg-teal-400 ${
              busy ? "pointer-events-none opacity-50" : ""
            }`}
          >
            {desktop ? "Upload sharp photo of Aadhaar QR" : "Open camera & photograph QR"}
            <input
              ref={photoRef}
              type="file"
              accept="image/jpeg,image/png,image/*"
              {...(!desktop ? { capture: "environment" as const } : {})}
              className="sr-only"
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void onUpload(f);
              }}
            />
          </label>
          <p className="text-center text-sm text-white/50">
            {desktop
              ? "Laptop webcams are often too soft for dense Secure QR — use a phone photo"
              : "Sharp still backup if live scan doesn’t lock"}
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => void startCamera()}
            className="text-sm text-white/45 underline-offset-4 hover:text-white/70 hover:underline"
          >
            {desktop ? "Try laptop camera anyway" : "Retry live camera"}
          </button>
        </div>
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
                <div
                  className={`h-[58%] w-[58%] rounded-2xl border-2 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)] transition-colors duration-150 ${
                    phase === "scanning" && scanPulse % 2 === 0
                      ? "border-teal-300/90"
                      : "border-white/90"
                  }`}
                />
              </div>
              {phase === "scanning" && (
                <div className="pointer-events-none absolute inset-x-0 top-[21%] h-0.5 bg-gradient-to-r from-transparent via-teal-300/80 to-transparent animate-[aadhaarScan_1.6s_ease-in-out_infinite]" />
              )}
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
              <label className="w-24 cursor-pointer text-center text-xs font-semibold text-teal-300">
                Sharp photo
                <input
                  ref={photoRef}
                  type="file"
                  accept="image/jpeg,image/png,image/*"
                  {...(!desktop ? { capture: "environment" as const } : {})}
                  className="sr-only"
                  disabled={busy}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (f) void onUpload(f);
                  }}
                />
              </label>
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
            <p className="text-xs text-white/40">
              Live scan · cover-correct ROI · {android ? "Android still burst" : "sharp photo backup"}
            </p>
          </div>
        </>
      )}

      <style>{`
        @keyframes aadhaarScan {
          0% { transform: translateY(0); opacity: 0.2; }
          50% { opacity: 1; }
          100% { transform: translateY(calc(58vh * 0.58)); opacity: 0.2; }
        }
      `}</style>
    </div>
  );
}
