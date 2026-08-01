import React, { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';

interface Props {
  onScan: (text: string) => void;
  onClose: () => void;
}

function buildReader() {
  const hints = new Map();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.QR_CODE]);
  hints.set(DecodeHintType.TRY_HARDER, true);
  return new BrowserMultiFormatReader(hints, {
    delayBetweenScanAttempts: 200,
    delayBetweenScanSuccess: 800,
  });
}

export default function KioskQrScanner({ onScan, onClose }: Props) {
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
        { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        { facingMode: 'environment' },
        true as unknown as MediaTrackConstraints,
      ];

      let lastErr: unknown = null;
      for (const videoConstraints of constraintsList) {
        if (cancelled) return;
        try {
          setStatus('Align QR code in the frame…');
          const controls = await reader.decodeFromConstraints(
            { video: videoConstraints === true ? true : videoConstraints },
            video,
            (result) => {
              if (cancelled || handledRef.current || !result) return;
              const text = result.getText()?.trim();
              if (!text) return;
              handledRef.current = true;
              setStatus('QR detected…');
              try { controlsRef.current?.stop(); } catch { /* noop */ }
              try { reader.reset(); } catch { /* noop */ }
              onScanRef.current(text);
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
      const text = result.getText()?.trim();
      if (!text) {
        setError('No QR code found in that image.');
        return;
      }
      handledRef.current = true;
      try { controlsRef.current?.stop(); } catch { /* noop */ }
      onScanRef.current(text);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not decode QR from image');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center p-6">
      <h3 className="text-xl font-bold text-white mb-2">Scan QR Code</h3>
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
