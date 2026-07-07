import React, { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';

interface Props {
  onScan: (rawBytesBase64: string) => void;
  onClose: () => void;
}

/**
 * Scans the QR code printed on the back of an Aadhaar card.
 *
 * Deliberately separate from KioskQrScanner: Aadhaar's "Secure QR Code" is a
 * binary/deflate payload, not text. zxing's getText() decodes bytes as a
 * string (UTF-8/Latin1 depending on the QR's declared charset), which can
 * corrupt multi-byte data — getRawBytes() returns the true payload bytes
 * from before any text decoding, which is what the backend parser needs.
 */
export default function KioskAadhaarScanner({ onScan, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const reader = new BrowserMultiFormatReader();

    (async () => {
      if (!videoRef.current) return;
      try {
        // Rear camera — this is scanning a physical card, not a selfie.
        await reader.decodeFromConstraints(
          { video: { facingMode: 'environment' } },
          videoRef.current,
          (result) => {
            if (!active || !result) return;
            const rawBytes = result.getRawBytes();
            if (!rawBytes || rawBytes.length === 0) return;
            active = false;
            reader.reset();
            let binary = '';
            for (let i = 0; i < rawBytes.length; i++) binary += String.fromCharCode(rawBytes[i]);
            onScan(btoa(binary));
          }
        );
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Camera unavailable');
      }
    })();

    return () => {
      active = false;
      try { reader.reset(); } catch { /* noop */ }
    };
  }, [onScan]);

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center p-6">
      <h3 className="text-xl font-bold text-white mb-2">Scan Aadhaar QR Code</h3>
      <p className="text-gray-400 text-sm mb-4 text-center max-w-xs">Hold the back of your Aadhaar card up to the camera, QR code facing the lens.</p>
      <video ref={videoRef} className="w-full max-w-md rounded-xl border-2 border-teal-600" muted playsInline />
      {error && <p className="text-red-400 mt-4 text-sm">{error}</p>}
      <button type="button" onClick={onClose} className="mt-6 px-6 py-3 bg-gray-700 rounded-xl text-white">Cancel</button>
    </div>
  );
}
