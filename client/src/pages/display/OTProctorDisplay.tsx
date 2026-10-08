import React, { useState } from 'react';
import DisplayShell from './DisplayShell';
import { displayDeviceHeaders } from '@/utils/displayDeviceAuth';

/**
 * Starts a LiveKit room for this hospital's OT. The server pushes `video_session_start` to the
 * `ot` zone of the device's organization, and the DisplayVideoOverlay inside DisplayShell opens it.
 * A hospital specialist joins from their own console with POST /api/display/video/sessions/observer.
 */
export default function OTProctorDisplay() {
  const [roomId, setRoomId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startProctor = async () => {
    setStarting(true);
    setError(null);
    try {
      const res = await fetch('/api/display/video/sessions', {
        method: 'POST',
        headers: displayDeviceHeaders(),
        body: JSON.stringify({ sessionType: 'ot-proctor', targetZone: 'ot', role: 'ot-display' }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.success) setRoomId(json.roomId);
      else setError(json.message || 'Could not start the video session.');
    } catch {
      setError('Could not start the video session.');
    } finally {
      setStarting(false);
    }
  };

  return (
    <DisplayShell zone="ot" zoneName="OT Remote Expert" fullscreen>
      <div className="p-8 flex flex-col h-full">
        <h1 className="text-2xl font-bold text-white mb-4">Operation Theatre — Remote Expert</h1>
        <p className="text-gray-400 mb-6">Start a live video session for a remote specialist to observe.</p>
        <button
          type="button"
          onClick={startProctor}
          disabled={starting}
          className="bg-teal-600 text-white px-6 py-3 rounded-lg w-fit disabled:opacity-50"
        >
          {starting ? 'Starting…' : 'Start expert video'}
        </button>
        {roomId && <p className="mt-4 text-gray-300 text-sm">Session room: <span className="font-mono">{roomId}</span></p>}
        {error && <p className="mt-4 text-amber-400">{error}</p>}
      </div>
    </DisplayShell>
  );
}
