import { useCallback, useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader, BarcodeFormat, DecodeHintType, NotFoundException } from "@zxing/library";
import jsQR from "jsqr";

export type AadhaarScanPayload = {
  /** base64 of raw QR bytes (byte-mode / legacy) */
  qrBytesBase64?: string;
  /** Secure QR decimal digit string — preferred for modern Aadhaar */
  qrText?: string;
};

interface Props {
  onScan: (payload: AadhaarScanPayload) => void;
  onClose: () => void;
}

const SCAN_INTERVAL_MS = 160;

function bytesToBase64(raw: Uint8Array | number[]): string {
  let binary = "";
  for (let i = 0; i < raw.length; i++) binary += String.fromCharCode(raw[i]);
  return btoa(binary);
}

function payloadFromText(text: string): AadhaarScanPayload | null {
  const t = String(text || "").trim();
  if (!t) return null;
  // Modern Secure QR: decimal digit string (often 1k+ digits)
  if (/^\d{80,}$/.test(t)) return { qrText: t };
  if (t.includes("PrintLetterBarcodeData") || t.startsWith("<")) {
    return { qrText: t, qrBytesBase64: btoa(unescape(encodeURIComponent(t))) };
  }
  if (t.length > 50) return { qrText: t };
  // Short binary-looking payload → send as bytes + text
  if (t.length > 20) {
    const bytes = new Uint8Array(t.length);
    for (let i = 0; i < t.length; i++) bytes[i] = t.charCodeAt(i) & 0xff;
    return { qrText: t, qrBytesBase64: bytesToBase64(bytes) };
  }
  return null;
}

function payloadFromZxing(result: { getText: () => string; getRawBytes: () => Uint8Array }): AadhaarScanPayload | null {
  const text = (result.getText?.() || "").trim();
  if (/^\d{80,}$/.test(text)) return { qrText: text };
  const raw = result.getRawBytes?.();
  if (raw && raw.length > 0) {
    try {
      const asText = new TextDecoder("latin1").decode(raw).trim();
      if (/^\d{80,}$/.test(asText)) return { qrText: asText };
    } catch {
      /* ignore */
    }
    return { qrBytesBase64: bytesToBase64(raw) };
  }
  return payloadFromText(text);
}

function buildZxingReader() {
  const hints = new Map();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.QR_CODE]);
  hints.set(DecodeHintType.TRY_HARDER, true);
  hints.set(DecodeHintType.CHARACTER_SET, "ISO-8859-1");
  return new BrowserMultiFormatReader(hints);
}

/**
 * Aadhaar Secure QR is dense; zxing live decode often never fires.
 * Primary: getUserMedia → canvas → jsQR (proven for UIDAI QRs).
 * Upload fallback: jsQR then zxing (for raw byte-mode cards).
 */
export default function KioskAadhaarScanner({ onScan, onClose }: Props) {
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

  const emitPayload = useCallback(
    (payload: AadhaarScanPayload) => {
      if (handledRef.current) return;
      handledRef.current = true;
      setStatus("QR detected — parsing…");
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
            const payload = payloadFromText(code.data);
            if (payload) {
              emitPayload(payload);
              return;
            }
          }
        }
      }
    }
    rafRef.current = requestAnimationFrame(scanFrame);
  }, [emitPayload]);

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

      const constraintTries: MediaStreamConstraints[] = [
        {
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
        },
        {
          audio: false,
          video: { facingMode: "environment" },
        },
        { audio: false, video: true },
      ];

      let lastErr: unknown = null;
      for (const constraints of constraintTries) {
        if (cancelled) return;
        try {
          const stream = await navigator.mediaDevices.getUserMedia(constraints);
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
          setStatus("Point camera at Aadhaar QR…");
          lastScanAtRef.current = 0;
          rafRef.current = requestAnimationFrame(scanFrame);
          lastErr = null;
          return;
        } catch (e) {
          lastErr = e;
        }
      }

      if (!cancelled && lastErr) {
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
          const payload = payloadFromText(code.data);
          if (payload) {
            emitPayload(payload);
            return;
          }
        }

        // zxing fallback (raw bytes for legacy byte-mode cards)
        const reader = buildZxingReader();
        try {
          const result = await reader.decodeFromImageUrl(url);
          const payload = payloadFromZxing(result);
          if (payload) {
            emitPayload(payload);
            return;
          }
        } catch (zerr: unknown) {
          if (!(zerr instanceof NotFoundException)) {
            // ignore
          }
        }

        setError("No Aadhaar QR found in that image. Use a clear photo of the QR on the back.");
        setStatus("Try again");
      } finally {
        URL.revokeObjectURL(url);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not decode QR from image");
      setStatus("Try again");
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center p-6">
      <h3 className="text-xl font-bold text-white mb-2">Scan Aadhaar QR Code</h3>
      <p className="text-gray-400 text-sm mb-2 text-center max-w-sm">
        Hold the <strong className="text-gray-200">back</strong> of the Aadhaar card to the camera.
        Fill the frame with the QR; keep steady in good light.
      </p>
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
