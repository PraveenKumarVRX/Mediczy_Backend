import React, { useState } from 'react';
import DisplayShell from './DisplayShell';
import DisplayVideoOverlay from '@/components/display/DisplayVideoOverlay';

export default function OTProctorDisplay() {
  const [videoOpen, setVideoOpen] = useState(false);
  const [session, setSession] = useState<{ serverUrl: string; token: string } | null>(null);

  const startProctor = async () => {
    const res = await fetch('/api/display/kiosk/video-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ purpose: 'ot-proctor', roomName: `ot-proctor-${Date.now()}` }),
    });
    const json = await res.json();
    if (json.serverUrl && json.token) {
      setSession({ serverUrl: json.serverUrl, token: json.token });
      setVideoOpen(true);
    }
  };

  return (
    <DisplayShell zone="ot" zoneName="OT Remote Expert" fullscreen>
      <div className="p-8 flex flex-col h-full">
        <h1 className="text-2xl font-bold text-white mb-4">Operation Theatre — Remote Expert</h1>
        <p className="text-gray-400 mb-6">GAP-VIDEO-005: Join proctoring video from specialist console</p>
        <button type="button" onClick={startProctor} className="bg-teal-600 text-white px-6 py-3 rounded-lg w-fit">
          Start expert video
        </button>
        {videoOpen && session && (
          <DisplayVideoOverlay
            open={videoOpen}
            onClose={() => setVideoOpen(false)}
            serverUrl={session.serverUrl}
            token={session.token}
          />
        )}
      </div>
    </DisplayShell>
  );
}
