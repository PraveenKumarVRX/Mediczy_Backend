import React, { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';

export type AadhaarScanPayload = {
  /** base64 of raw QR bytes (byte-mode / legacy) */
  qrBytesBase64?: string;
  /** Secure QR decimal digit string from getText() — preferred for modern Aadhaar */
  qrText?: string;
};

interface Props {
  onScan: (payload: AadhaarScanPayload) => void;
  onClose: () => void;
}

function bytesToBase64(raw: Uint8Array | number[]): string {
  let binary = '';
  for (let i = 0; i < raw.length; i++) binary += String.fromCharCode(raw[i]);
  return btoa(binary);
}

function buildReader() {
  const hints = new Map();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.QR_CODE]);
  hints.set(DecodeHintType.TRY_HARDER, true);
  hints.set(DecodeHintType.CHARACTER_SET, 'ISO-8859-1');
  return new BrowserMultiFormatReader(hints, {
    delayBetweenScanAttempts: 200,
    delayBetweenScanSuccess: 800,
  });
}

function payloadFromResult(result: { getText: () => string; getRawBytes: () => Uint8Array }): AadhaarScanPayload | null {
  const text = (result.getText?.() || '').trim();
  // Modern Secure QR: decimal digit string in QR payload (often 1k+ digits)
  if (/^\d{80,}$/.test(text)) {
    return { qrText: text };
  }
  const raw = result.getRawBytes?.();
  if (raw && raw.length > 0) {
    // Sometimes raw bytes are ASCII digits of the decimal string
    try {
      const asText = new TextDecoder('latin1').decode(raw).trim();
      if (/^\d{80,}$/.test(asText)) return { qrText: asText };
    } catch { /* ignore */ }
    return { qrBytesBase64: bytesToBase64(raw) };
  }
  if (text.includes('PrintLetterBarcodeData') || text.startsWith('<')) {
    return { qrText: text, qrBytesBase64: btoa(unescape(encodeURIComponent(text))) };
  }
  if (text.length > 50) {
    // Last resort — send text for server-side handling
    return { qrText: text };
  }
  return null;
}

/**
 * Scans the QR on the back of an Aadhaar card.
 * Modern Secure QR is a decimal digit string → BigInt → zlib bytes (parsed server-side).
 */
export default function KioskAadhaarScanner({ onScan, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onScanRef = useRef(onScan);
  const controlsRef = useRef<IScannerControls | null>(null);
  const handledRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('Starting camera…');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { onScanRef.current = onScan; }, [onScan]);

  useEffect(() => {
    handledRef.current = false;
    let cancelled = false;
    const reader = buildReader();

    const start = async () => {
      const video = videoRef.current;
      if (!video) return;

      const constraintsList: MediaTrackConstraints[] = [
        { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        { facingMode: 'environment' },
        { facingMode: 'user' },
        true as unknown as MediaTrackConstraints,
      ];

      let lastErr: unknown = null;
      for (const videoConstraints of constraintsList) {
        if (cancelled) return;
        try {
          setStatus('Point camera at Aadhaar QR…');
          const controls = await reader.decodeFromConstraints(
            { video: videoConstraints === true ? true : videoConstraints },
            video,
            (result, err) => {
              if (cancelled || handledRef.current || !result) {
                // Ignore NotFoundException noise
                if (err && !/NotFoundException/i.test(String(err))) {
                  // keep scanning
                }
                return;
              }
              const payload = payloadFromResult(result);
              if (!payload) return;
              handledRef.current = true;
              setStatus('QR detected — parsing…');
              try { controlsRef.current?.stop(); } catch { /* noop */ }
              try { reader.reset(); } catch { /* noop */ }
              onScanRef.current(payload);
            },
          );
          controlsRef.current = controls;
          lastErr = null;
          break;
        } catch (e) {
          lastErr = e;
        }
      }
      if (lastErr && !cancelled && !controlsRef.current) {
        setError(lastErr instanceof Error ? lastErr.message : 'Camera unavailable — try Upload QR image');
        setStatus('Camera failed');
      }
    };

    // Defer one frame so <video> is mounted
    const t = requestAnimationFrame(() => { start(); });

    return () => {
      cancelled = true;
      cancelAnimationFrame(t);
      try { controlsRef.current?.stop(); } catch { /* noop */ }
      controlsRef.current = null;
      try { reader.reset(); } catch { /* noop */ }
    };
  }, []);

  const decodeImageFile = async (file: File) => {
    setError(null);
    setStatus('Reading image…');
    try {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.src = url;
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Could not load image'));
      });
      const reader = buildReader();
      const result = await reader.decodeFromImageElement(img);
      URL.revokeObjectURL(url);
      const payload = payloadFromResult(result);
      if (!payload) {
        setError('No Aadhaar QR found in that image.');
        setStatus('Try again');
        return;
      }
      handledRef.current = true;
      try { controlsRef.current?.stop(); } catch { /* noop */ }
      onScanRef.current(payload);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not decode QR from image');
      setStatus('Try again');
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
      <video
        ref={videoRef}
        className="w-full max-w-md aspect-square object-cover rounded-xl border-2 border-teal-600 bg-black"
        muted
        playsInline
        autoPlay
      />
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
          if (f) void decodeImageFile(f);
        }}
      />
    </div>
  );
}
