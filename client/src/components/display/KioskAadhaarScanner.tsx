import { useCallback, useEffect, useRef, useState } from "react";
import {
  decodeAadhaarFromFile,
  decodeAadhaarFromImageData,
  decodeAadhaarFromVideo,
  grabHighResFrame,
  type AadhaarScanPayload,
} from "@/lib/aadhaarQrDecode";

export type { AadhaarScanPayload };

interface Props {
  onScan: (payload: AadhaarScanPayload) => void;
  onClose: () => void;
}

const LIVE_INTERVAL_MS = 220;

/**
 * Multi-engine Aadhaar Secure QR scanner.
 * Live loop + Snap still (ImageCapture) + Upload — BarcodeDetector / jsQR / ZXing TRY_HARDER.
 */
export default function KioskAadhaarScanner({ onScan, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastScanAtRef = useRef(0);
  const handledRef = useRef(false);
  const decodingRef = useRef(false);
  const onScanRef = useRef(onScan);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("Starting camera…");
  const [busy, setBusy] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  const stopCamera = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    const stream = streamRef.current;
    streamRef.current = null;
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
      setStatus("QR captured — parsing…");
      setBusy(true);
      stopCamera();
      onScanRef.current(payload);
    },
    [stopCamera]
  );

  const scanFrame = useCallback(() => {
    if (handledRef.current) return;
    const video = videoRef.current;
    if (!video) {
      rafRef.current = requestAnimationFrame(scanFrame);
      return;
    }

    const now = Date.now();
    if (
      !decodingRef.current &&
      now - lastScanAtRef.current >= LIVE_INTERVAL_MS &&
      video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
    ) {
      lastScanAtRef.current = now;
      decodingRef.current = true;
      void decodeAadhaarFromVideo(video, canvasRef.current)
        .then((payload) => {
          if (payload && !handledRef.current) emitPayload(payload);
        })
        .finally(() => {
          decodingRef.current = false;
        });
    }
    rafRef.current = requestAnimationFrame(scanFrame);
  }, [emitPayload]);

  const startCamera = useCallback(async () => {
    stopCamera();
    handledRef.current = false;
    decodingRef.current = false;
    setError(null);
    setBusy(false);
    setStatus("Starting camera…");

    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Camera not supported. Use Upload QR image or Snap after granting camera.");
      setStatus("Camera unavailable");
      return;
    }

    const tries: MediaStreamConstraints[] = [
      {
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      },
      { audio: false, video: { facingMode: "environment" } },
      { audio: false, video: true },
    ];

    let lastErr: unknown = null;
    for (const constraints of tries) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        video.srcObject = stream;
        await video.play();

        const track = stream.getVideoTracks()[0];
        const caps = track?.getCapabilities?.() as { torch?: boolean } | undefined;
        setTorchSupported(Boolean(caps?.torch));

        try {
          await track?.applyConstraints({
            advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet],
          } as MediaTrackConstraints);
        } catch {
          /* ignore */
        }

        setStatus("Fill the square with the QR on the BACK of Aadhaar. Hold steady.");
        lastScanAtRef.current = 0;
        rafRef.current = requestAnimationFrame(scanFrame);
        return;
      } catch (e) {
        lastErr = e;
      }
    }

    const name =
      lastErr && typeof lastErr === "object" && "name" in lastErr
        ? String((lastErr as { name: string }).name)
        : "";
    if (name === "NotAllowedError" || name === "PermissionDeniedError") {
      setError("Camera permission denied. Allow camera, or use Upload QR image.");
    } else if (name === "NotFoundError") {
      setError("No camera found. Use Upload QR image instead.");
    } else {
      setError(lastErr instanceof Error ? lastErr.message : "Camera unavailable — try Upload QR image");
    }
    setStatus("Camera failed");
  }, [scanFrame, stopCamera]);

  useEffect(() => {
    void startCamera();
    return () => stopCamera();
  }, [startCamera, stopCamera]);

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()?.[0];
    if (!track) return;
    try {
      await track.applyConstraints({
        advanced: [{ torch: !torchOn } as MediaTrackConstraintSet],
      } as MediaTrackConstraints);
      setTorchOn((v) => !v);
    } catch {
      setError("Torch not available on this device");
    }
  };

  const snapAndDecode = async () => {
    if (handledRef.current || busy) return;
    setBusy(true);
    setError(null);
    setStatus("Capturing high-res still…");
    try {
      const track = streamRef.current?.getVideoTracks()?.[0] || null;
      let imageData = await grabHighResFrame(track);
      if (!imageData && videoRef.current) {
        const video = videoRef.current;
        const canvas = canvasRef.current || document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (ctx && video.videoWidth > 0) {
          ctx.drawImage(video, 0, 0);
          imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        }
      }
      if (!imageData) throw new Error("Could not capture frame");
      setStatus("Decoding QR (this can take a few seconds)…");
      const payload = await decodeAadhaarFromImageData(imageData, {
        alsoDetectFrom: videoRef.current,
        mode: "thorough",
      });
      if (!payload) {
        setError(
          "Could not read Aadhaar QR from that frame. Move closer so the QR fills the square, improve lighting, then Snap again — or Upload a clear photo of the QR only."
        );
        setStatus("Fill the square with the QR. Try Snap again.");
        setBusy(false);
        return;
      }
      emitPayload(payload);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Snap failed");
      setBusy(false);
      setStatus("Try Snap again or Upload QR image");
    }
  };

  const onUpload = async (file: File) => {
    if (handledRef.current) return;
    setBusy(true);
    setError(null);
    setStatus("Reading image…");
    try {
      const payload = await decodeAadhaarFromFile(file);
      if (!payload) {
        setError(
          "No Aadhaar QR found. Crop tightly around the QR on the back of the card and upload again."
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
        Use the <strong className="text-white">large QR on the back</strong> of the Aadhaar card.
        Fill the square, hold steady, then tap <strong className="text-white">Snap &amp; decode</strong> if live scan is slow.
      </p>
      <p className="text-teal-400 text-xs mb-3 text-center">{status}</p>

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
          <div className="h-[62%] w-[62%] rounded-xl border-2 border-teal-300/90" />
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
          className="px-5 py-3 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 rounded-xl text-white font-semibold"
        >
          Snap &amp; decode
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
          className="px-5 py-3 bg-teal-900 hover:bg-teal-800 disabled:opacity-50 rounded-xl text-white"
        >
          Upload QR image
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
