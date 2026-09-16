import React, { useEffect, useState } from 'react';
import { SimpleLiveKitRoom } from '@/components/video/LiveKitRoom';
import { displayDeviceHeaders, getDisplayDeviceToken } from '@/utils/displayDeviceAuth';

interface VideoSession {
  roomId: string;
  join: { serverUrl: string; token: string; meetUrl?: string };
  sessionType?: string;
}

interface Props {
  zone?: string;
}

export default function DisplayVideoOverlay({ zone }: Props) {
  const [session, setSession] = useState<VideoSession | null>(null);

  useEffect(() => {
    const params = new URLSearchParams();
    if (zone) params.set('zone', zone);
    const deviceToken = getDisplayDeviceToken();
    if (deviceToken) params.set('deviceToken', deviceToken);
    const es = new EventSource(`/api/display/events?${params}`);
    es.addEventListener('video_session_start', (e) => {
      try {
        const data = JSON.parse((e as MessageEvent).data);
        if (data.join?.token) {
          setSession({
            roomId: data.roomId,
            join: {
              serverUrl: data.join.serverUrl || import.meta.env.VITE_LIVEKIT_URL || '',
              token: data.join.token,
              meetUrl: data.join.meetUrl,
            },
            sessionType: data.sessionType,
          });
        }
      } catch (_) {}
    });
    es.addEventListener('video_session_end', () => setSession(null));
    return () => es.close();
  }, [zone]);

  if (!session?.join?.token) return null;

  return (
    <div className="fixed inset-0 z-40 bg-black">
      <SimpleLiveKitRoom
        serverUrl={session.join.serverUrl}
        token={session.join.token}
        onDisconnect={() => setSession(null)}
      />
      <button
        type="button"
        onClick={async () => {
          setSession(null);
          try {
            await fetch('/api/display/video/sessions/end', {
              method: 'POST',
              headers: displayDeviceHeaders(),
              body: JSON.stringify({ targetZone: zone, roomId: session.roomId }),
            });
          } catch (_) {}
        }}
        className="absolute top-4 right-4 z-50 px-4 py-2 bg-red-700 rounded-lg text-white font-bold"
      >
        End Call
      </button>
    </div>
  );
}
