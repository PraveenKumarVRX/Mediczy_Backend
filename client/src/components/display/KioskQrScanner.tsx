import { useCallback, useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader, DecodeHintType, NotFoundException } from "@zxing/library";
import jsQR from "jsqr";

interface Props {
  onScan: (text: string) => void;
  onClose: () => void;
}

const SCAN_INTERVAL_MS = 180;

/**
 * Canvas + jsQR live scan (more reliable than zxing for dense QRs).
 * Upload path tries jsQR first, then zxing.
 */
export default function KioskQrScanner({ onScan, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastScanAtRef = useRef(0);
  const handledRef = useRef(false);
  const onScanRef = useRef(onScan);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("Starting camera…");

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
  }, []);

  const emitScan = useCallback(
    (text: string) => {
      const payload = String(text || "").trim();
      if (!payload || handledRef.current) return;
      handledRef.current = true;
      setStatus("QR detected…");
      stopCamera();
      onScanRef.current(payload);
    },
    [stopCamera]
  );

  const scanFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || handledRef.current) {
      rafRef.current = requestAnimationFrame(scanFrame);
      return;
    }

    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0) {
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
          ctx.drawImage(video, 0, 0, w, h);
          const imageData = ctx.getImageData(0, 0, w, h);
          const code = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: "attemptBoth",
          });
          if (code?.data) {
            emitScan(code.data);
            return;
          }
        }
      }
    }
    rafRef.current = requestAnimationFrame(scanFrame);
  }, [emitScan]);

  useEffect(() => {
    handledRef.current = false;
    setError(null);
    setStatus("Starting camera…");

    let cancelled = false;

    const start = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("Camera not supported. Use Upload QR image.");
        setStatus("Camera unavailable");
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        video.srcObject = stream;
        await video.play();
        setStatus("Align QR code in the frame…");
        lastScanAtRef.current = 0;
        rafRef.current = requestAnimationFrame(scanFrame);
      } catch (err: unknown) {
        if (cancelled) return;
        const name = err && typeof err === "object" && "name" in err ? String((err as { name: string }).name) : "";
        if (name === "NotAllowedError" || name === "PermissionDeniedError") {
          setError("Camera permission denied. Allow camera, or use Upload QR image.");
        } else if (name === "NotFoundError") {
          setError("No camera found. Use Upload QR image instead.");
        } else {
          setError(err instanceof Error ? err.message : "Camera unavailable — try Upload QR image");
        }
        setStatus("Camera failed");
      }
    };

    void start();
    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [scanFrame, stopCamera]);

  const decodeImageFile = async (file: File) => {
    setError(null);
    setStatus("Reading image…");
    try {
      const url = URL.createObjectURL(file);
      try {
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
          const el = new Image();
          el.onload = () => resolve(el);
          el.onerror = () => reject(new Error("Could not load image"));
          el.src = url;
        });
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Canvas unavailable");
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: "attemptBoth",
        });
        if (code?.data) {
          emitScan(code.data);
          return;
        }

        const hints = new Map();
        hints.set(DecodeHintType.TRY_HARDER, true);
        const reader = new BrowserMultiFormatReader(hints);
        try {
          const result = await reader.decodeFromImageUrl(url);
          const text = result?.getText?.()?.trim();
          if (text) {
            emitScan(text);
            return;
          }
        } catch (zerr: unknown) {
          if (!(zerr instanceof NotFoundException)) {
            // fall through
          }
        }
        setError("No QR code found in that image.");
        setStatus("Align QR code in the frame…");
      } finally {
        URL.revokeObjectURL(url);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not decode QR from image");
      setStatus("Align QR code in the frame…");
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center p-6">
      <h3 className="text-xl font-bold text-white mb-2">Scan QR Code</h3>
      <p className="text-teal-400 text-xs mb-3">{status}</p>
      <div className="relative w-full max-w-md">
        <video
          ref={videoRef}
          className="w-full aspect-square object-cover rounded-xl border-2 border-teal-600 bg-black"
          muted
          playsInline
          autoPlay
        />
        <canvas ref={canvasRef} className="hidden" aria-hidden />
      </div>
      {error && <p className="text-red-400 mt-4 text-sm text-center max-w-md">{error}</p>}
      <div className="mt-6 flex flex-wrap gap-3 justify-center">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="px-6 py-3 bg-teal-800 hover:bg-teal-700 rounded-xl text-white"
        >
          Upload QR image
        </button>
        <button type="button" onClick={onClose} className="px-6 py-3 bg-gray-700 rounded-xl text-white">
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
          if (f) void decodeImageFile(f);
        }}
      />
    </div>
  );
}
