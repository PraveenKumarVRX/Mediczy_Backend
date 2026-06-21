import React, { useEffect, useState } from 'react';
import DisplayShell from './DisplayShell';

export default function LobbySignageDisplay() {
  const zone = new URLSearchParams(window.location.search).get('zone') || 'lobby';
  const [slides, setSlides] = useState<Array<{ title: string; payload: { message?: string } }>>([]);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    fetch(`/api/display/signage?zone=${encodeURIComponent(zone)}`)
      .then(r => r.json())
      .then(j => { if (j.slides?.length) setSlides(j.slides); })
      .catch(() => {});
  }, [zone]);

  useEffect(() => {
    if (slides.length < 2) return;
    const t = setInterval(() => setIdx(i => (i + 1) % slides.length), 12000);
    return () => clearInterval(t);
  }, [slides]);

  const slide = slides[idx];
  const message = slide?.payload?.message || slide?.title || 'Welcome to MediQzy Smart Hospital';

  return (
    <DisplayShell zone={zone} zoneName="Hospital Information" fullscreen>
      <div className="h-full flex flex-col items-center justify-center p-12 bg-gradient-to-br from-gray-950 via-teal-950 to-gray-950">
        <h1 className="text-5xl font-black text-teal-300 mb-8 text-center">{message}</h1>
        <p className="text-gray-400 text-xl">Paperless check-in · Smart queue · Video-ready care</p>
        <p className="text-gray-600 text-sm mt-12">Scan QR at kiosk for self-registration</p>
      </div>
    </DisplayShell>
  );
}
