import React, { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';

interface Props {
  onScan: (text: string) => void;
  onClose: () => void;
}

export default function KioskQrScanner({ onScan, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const reader = new BrowserMultiFormatReader();
    readerRef.current = reader;

    (async () => {
      if (!videoRef.current) return;
      try {
        await reader.decodeFromVideoDevice(undefined, videoRef.current, (result) => {
          if (!active || !result) return;
          active = false;
          reader.reset();
          onScan(result.getText());
        });
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Camera unavailable');
      }
    })();

    return () => {
      active = false;
      try { reader.reset(); } catch (_) {}
    };
  }, [onScan]);

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center p-6">
      <h3 className="text-xl font-bold text-white mb-4">Scan QR Code</h3>
      <video ref={videoRef} className="w-full max-w-md rounded-xl border-2 border-teal-600" muted playsInline />
      {error && <p className="text-red-400 mt-4 text-sm">{error}</p>}
      <button type="button" onClick={onClose} className="mt-6 px-6 py-3 bg-gray-700 rounded-xl text-white">Cancel</button>
    </div>
  );
}
