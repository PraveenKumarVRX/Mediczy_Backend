import React, { useEffect, useRef, useState } from 'react';

interface Props {
  onCapture: (blob: Blob) => void;
  onSkip: () => void;
}

export default function KioskPhotoCapture({ onCapture, onSkip }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Camera not available');
      }
    })();
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const capture = () => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      if (blob) {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        onCapture(blob);
      }
    }, 'image/jpeg', 0.85);
  };

  return (
    <div className="w-full max-w-md space-y-4">
      <h3 className="text-xl font-bold text-center">Patient Photo</h3>
      <video ref={videoRef} autoPlay playsInline muted className="w-full rounded-xl border border-gray-600 bg-black" />
      {error && <p className="text-red-400 text-sm text-center">{error}</p>}
      <div className="flex gap-3">
        <button type="button" onClick={capture} className="flex-1 py-4 bg-teal-600 rounded-xl font-bold">Capture</button>
        <button type="button" onClick={onSkip} className="flex-1 py-4 bg-gray-700 rounded-xl">Skip</button>
      </div>
    </div>
  );
}
