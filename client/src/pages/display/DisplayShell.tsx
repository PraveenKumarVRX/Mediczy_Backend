import React, { useEffect, useRef, useState, useCallback } from 'react';

interface EmergencyBroadcast {
  id: number;
  title: string;
  message: string;
  severity: string;
}

interface DisplayShellProps {
  zone?: string;
  deviceId?: string;
  hospitalName?: string;
  zoneName?: string;
  children: React.ReactNode;
  /** If true, the shell renders fullscreen with clock and header bar */
  fullscreen?: boolean;
  className?: string;
}

export function useDisplaySSE(zone?: string, deviceId?: string) {
  const [emergency, setEmergency] = useState<EmergencyBroadcast | null>(null);
  const [announcement, setAnnouncement] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [queueEvent, setQueueEvent] = useState<{ type: string; payload: Record<string, unknown> } | null>(null);
  const esRef = useRef<EventSource | null>(null);

  const connect = useCallback(() => {
    if (esRef.current) esRef.current.close();

    const params = new URLSearchParams();
    if (zone) params.set('zone', zone);
    if (deviceId) params.set('deviceId', deviceId);
    const url = `/api/display/events?${params.toString()}`;

    const es = new EventSource(url);
    esRef.current = es;

    es.addEventListener('connected', () => setConnected(true));
    es.addEventListener('emergency', (e) => {
      try { setEmergency(JSON.parse((e as MessageEvent).data)); } catch (_) {}
    });
    es.addEventListener('emergency-dismissed', (e) => {
      try {
        const { id } = JSON.parse((e as MessageEvent).data);
        setEmergency(prev => prev?.id === id ? null : prev);
      } catch (_) {}
    });
    es.addEventListener('announcement', (e) => {
      try {
        const { message } = JSON.parse((e as MessageEvent).data);
        setAnnouncement(message);
        setTimeout(() => setAnnouncement(null), 10000);
      } catch (_) {}
    });
    const onQueue = (type: string) => (e: Event) => {
      try {
        const payload = JSON.parse((e as MessageEvent).data);
        setQueueEvent({ type, payload });
      } catch (_) {}
    };
    es.addEventListener('queue_token_called', onQueue('queue_token_called'));
    es.addEventListener('queue_token_issued', onQueue('queue_token_issued'));
    es.addEventListener('queue_updated', onQueue('queue_updated'));
    es.addEventListener('new-token', onQueue('new-token'));
    es.addEventListener('nurse_call', onQueue('nurse_call'));
    es.addEventListener('video_session_start', onQueue('video_session_start'));
    es.onerror = () => {
      setConnected(false);
      es.close();
      setTimeout(connect, 5000);
    };
  }, [zone, deviceId]);

  useEffect(() => {
    connect();
    return () => { esRef.current?.close(); };
  }, [connect]);

  const dismissEmergency = useCallback(async (id: number) => {
    try {
      await fetch(`/api/display/emergency/${id}`, { method: 'DELETE' });
      setEmergency(null);
    } catch (_) {}
  }, []);

  return { emergency, dismissEmergency, announcement, connected, queueEvent, clearQueueEvent: () => setQueueEvent(null) };
}

function Clock() {
  const [time, setTime] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <span className="tabular-nums font-mono">
      {time.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}
    </span>
  );
}

export default function DisplayShell({
  zone,
  deviceId,
  hospitalName = 'MediQzy Hospital',
  zoneName,
  children,
  fullscreen = true,
  className = '',
}: DisplayShellProps) {
  const { emergency, dismissEmergency, announcement, connected } = useDisplaySSE(zone, deviceId);

  const wrapper = fullscreen
    ? 'fixed inset-0 overflow-hidden bg-gray-950 text-white flex flex-col'
    : 'relative overflow-hidden bg-gray-950 text-white flex flex-col';

  return (
    <div className={`${wrapper} ${className}`}>
      {/* Header bar */}
      <header className="flex items-center justify-between px-6 py-2 bg-gray-900 border-b border-gray-800 shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-teal-400 font-bold text-lg tracking-tight">{hospitalName}</span>
          {zoneName && (
            <span className="text-gray-400 text-sm border-l border-gray-700 pl-3">{zoneName}</span>
          )}
        </div>
        <div className="flex items-center gap-4 text-sm text-gray-300">
          <span className={`inline-block w-2 h-2 rounded-full ${connected ? 'bg-teal-400' : 'bg-red-400'}`} />
          <Clock />
        </div>
      </header>

      {/* Announcement ticker */}
      {announcement && (
        <div className="bg-blue-700 text-white text-center py-1.5 text-sm font-medium px-4 shrink-0 animate-pulse">
          📢 {announcement}
        </div>
      )}

      {/* Offline indicator */}
      {!connected && (
        <div className="bg-amber-700/80 text-white text-center py-1 text-xs px-4 shrink-0">
          Display offline — reconnecting…
        </div>
      )}

      {/* Main content */}
      <main className="flex-1 overflow-hidden">
        {children}
      </main>

      {/* Emergency overlay */}
      {emergency && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-red-700/95 text-white animate-pulse">
          <div className="text-7xl mb-4">🚨</div>
          <h1 className="text-4xl font-bold mb-3 text-center px-8">{emergency.title}</h1>
          <p className="text-2xl text-center px-12 mb-8 font-medium">{emergency.message}</p>
          <button
            onClick={() => dismissEmergency(emergency.id)}
            className="px-8 py-3 bg-white text-red-700 rounded-full text-xl font-bold hover:bg-gray-100 transition-colors"
          >
            Acknowledge & Dismiss
          </button>
        </div>
      )}
    </div>
  );
}
