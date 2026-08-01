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
  onScan: (payload: AadhaarScanPayload) => void;
  onClose: () => void;
}

const LIVE_INTERVAL_MS = 280;
const AUTO_STILL_MS = 2200;

/**
 * High-resolution Aadhaar Secure QR scanner.
 * - Opens rear camera at max video resolution
 * - Snap uses ImageCapture.takePhoto() at full still-camera resolution
 * - Auto still capture every ~2s while open
 * - Decode: native BarcodeDetector → ZXing-C++ WASM → jsQR → ZXing-JS
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
  const decodingRef = useRef(false);
  const onScanRef = useRef(onScan);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const nativeCamRef = useRef<HTMLInputElement | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("Starting high-res camera…");
  const [busy, setBusy] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [resLabel, setResLabel] = useState("");

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  const stopCamera = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (stillTimerRef.current != null) {
      window.clearInterval(stillTimerRef.current);
      stillTimerRef.current = null;
    }
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
  }, []);

  const emitPayload = useCallback(
    (payload: AadhaarScanPayload) => {
      if (handledRef.current) return;
      handledRef.current = true;
      setStatus(`QR captured (${payload.engine || "decoder"}) — parsing…`);
      setBusy(true);
      stopCamera();
      onScanRef.current(payload);
    },
    [stopCamera]
  );

  const decodeStill = useCallback(async () => {
    if (handledRef.current || decodingRef.current) return;
    decodingRef.current = true;
    try {
      const still = await captureMaxResStill(trackRef.current, videoRef.current);
      if (!still || handledRef.current) return;
      setStatus(`Decoding ${still.width}×${still.height} (${still.source})…`);
      const payload = await decodeAadhaarFromImageData(still.imageData, {
        alsoDetectFrom: still.bitmap || videoRef.current,
        mode: "thorough",
      });
      still.bitmap?.close?.();
      if (payload && !handledRef.current) emitPayload(payload);
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
          if (payload && !handledRef.current) emitPayload(payload);
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
    setError(null);
    setBusy(false);
    setResLabel("");
    setStatus("Opening max-resolution rear camera…");
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

      // Wait one frame so videoWidth is populated
      await new Promise<void>((r) => requestAnimationFrame(() => r()));
      const vw = video.videoWidth || opened.videoWidth;
      const vh = video.videoHeight || opened.videoHeight;
      const still =
        opened.stillMaxWidth && opened.stillMaxHeight
          ? ` · still up to ${opened.stillMaxWidth}×${opened.stillMaxHeight}`
          : "";
      setResLabel(`${vw}×${vh} video${still}`);
      setStatus(
        `Camera ready (${vw}×${vh}). Fill the square with the QR on the BACK, then tap Snap & decode.`
      );

      lastLiveAtRef.current = 0;
      rafRef.current = requestAnimationFrame(scanLiveFrame);

      // Periodic full still capture (hardware takePhoto) — denser than video frames
      stillTimerRef.current = window.setInterval(() => {
        if (!handledRef.current && !decodingRef.current && !document.hidden) {
          void decodeStill().then(() => {
            if (!handledRef.current) {
              setStatus((s) =>
                s.startsWith("Decoding")
                  ? `Scanning… ${vw}×${vh}. Keep QR in the square.`
                  : s
              );
            }
          });
        }
      }, AUTO_STILL_MS);
    } catch (err: unknown) {
      const name =
        err && typeof err === "object" && "name" in err ? String((err as { name: string }).name) : "";
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        setError("Camera permission denied. Allow camera, or use Phone camera / Upload.");
      } else if (name === "NotFoundError") {
        setError("No camera found. Use Phone camera or Upload QR image.");
      } else {
        setError(err instanceof Error ? err.message : "Camera unavailable");
      }
      setStatus("Camera failed — use Phone camera button");
    }
  }, [decodeStill, scanLiveFrame, stopCamera]);

  useEffect(() => {
    void startCamera();
    return () => stopCamera();
  }, [startCamera, stopCamera]);

  const toggleTorch = async () => {
    const ok = await setTorch(trackRef.current, !torchOn);
    if (!ok) {
      setError("Torch not available on this device");
      return;
    }
    setTorchOn((v) => !v);
  };

  const snapAndDecode = async () => {
    if (handledRef.current || busy) return;
    setBusy(true);
    setError(null);
    setStatus("Taking full-resolution photo…");
    try {
      await decodeStill();
      if (!handledRef.current) {
        setError(
          "Could not read Aadhaar QR. Move closer so the QR fills the square, turn on Torch, tap Snap again — or use Phone camera for a native high-res photo."
        );
        setStatus("Try Snap again, Torch, or Phone camera");
        setBusy(false);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Snap failed");
      setBusy(false);
    }
  };

  const onUpload = async (file: File) => {
    if (handledRef.current) return;
    setBusy(true);
    setError(null);
    setStatus(`Reading photo (${Math.round(file.size / 1024)} KB)…`);
    try {
      const payload = await decodeAadhaarFromFile(file);
      if (!payload) {
        setError(
          "No Aadhaar QR found. Crop tightly around the large QR on the back of the card and try again."
        );
        setStatus("Try again");
        setBusy(false);
        return;
      }
      emitPayload(payload);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not decode QR from image");
      setBusy(false);
      setStatus("Try again");
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/95 flex flex-col items-center justify-center p-4 sm:p-6">
      <h3 className="text-xl font-bold text-white mb-1">Scan Aadhaar QR Code</h3>
      <p className="text-gray-300 text-sm mb-1 text-center max-w-md">
        Point at the <strong className="text-white">large QR on the back</strong> of the Aadhaar card.
        Prefer <strong className="text-white">Snap &amp; decode</strong> (full camera still) or{" "}
        <strong className="text-white">Phone camera</strong>.
      </p>
      {resLabel && <p className="text-teal-500/90 text-[11px] mb-1 font-mono">{resLabel}</p>}
      <p className="text-teal-400 text-xs mb-3 text-center max-w-md">{status}</p>

      <div className="relative w-full max-w-md">
        <video
          ref={videoRef}
          className="w-full aspect-square object-cover rounded-xl border-2 border-teal-500 bg-black"
          muted
          playsInline
          autoPlay
        />
        <canvas ref={canvasRef} className="hidden" aria-hidden />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-[68%] w-[68%] rounded-xl border-2 border-teal-300/90" />
        </div>
        {busy && (
          <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/55 text-white text-sm">
            Working…
          </div>
        )}
      </div>

      {error && (
        <p className="text-red-400 mt-3 text-sm text-center max-w-md whitespace-pre-wrap">{error}</p>
      )}

      <div className="mt-5 flex flex-wrap gap-2 justify-center max-w-lg">
        <button
          type="button"
          disabled={busy}
          onClick={() => void snapAndDecode()}
          className="px-6 py-3.5 bg-teal-500 hover:bg-teal-400 disabled:opacity-50 rounded-xl text-white font-bold text-base"
        >
          Snap &amp; decode
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => nativeCamRef.current?.click()}
          className="px-5 py-3 bg-teal-800 hover:bg-teal-700 disabled:opacity-50 rounded-xl text-white font-semibold"
        >
          Phone camera
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
          className="px-5 py-3 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 rounded-xl text-white"
        >
          Upload image
        </button>
        {torchSupported && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void toggleTorch()}
            className="px-5 py-3 bg-amber-800 hover:bg-amber-700 disabled:opacity-50 rounded-xl text-white"
          >
            {torchOn ? "Torch off" : "Torch on"}
          </button>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() => void startCamera()}
          className="px-5 py-3 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 rounded-xl text-white"
        >
          Retry camera
        </button>
        <button type="button" onClick={onClose} className="px-5 py-3 bg-gray-700 rounded-xl text-white">
          Cancel
        </button>
      </div>

      {/* Native OS camera app — typically higher still resolution than getUserMedia preview */}
      <input
        ref={nativeCamRef}
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
