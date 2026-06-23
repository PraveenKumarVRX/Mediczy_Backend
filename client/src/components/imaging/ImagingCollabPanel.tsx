/**
 * Real-time imaging collaboration panel — shared session + SSE annotations.
 */
import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { Users, Circle, Square, MousePointer } from 'lucide-react';

const PLATFORM_API = '/api/imaging/platform';

interface Annotation {
  id: number;
  user_name: string;
  tool: string;
  data: Record<string, unknown>;
  created_at: string;
}

interface ImagingCollabPanelProps {
  studyInstanceUID: string;
  token: string;
}

export default function ImagingCollabPanel({ studyInstanceUID, token }: ImagingCollabPanelProps) {
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [activeTool, setActiveTool] = useState('pointer');
  const [connected, setConnected] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await axios.post(
          `${PLATFORM_API}/collab/sessions`,
          { studyInstanceUID },
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (!cancelled) setSessionId(res.data.session?.id);
      } catch {
        /* optional feature */
      }
    })();
    return () => { cancelled = true; };
  }, [studyInstanceUID, token]);

  useEffect(() => {
    if (!sessionId) return;
    const es = new EventSource(
      `${PLATFORM_API}/collab/sessions/${sessionId}/events?access_token=${encodeURIComponent(token)}`,
      { withCredentials: true },
    );
    esRef.current = es;
    es.addEventListener('connected', () => setConnected(true));
    es.addEventListener('annotation', (ev) => {
      try {
        const ann = JSON.parse((ev as MessageEvent).data);
        setAnnotations((prev) => [...prev, ann]);
      } catch { /* */ }
    });
    es.onerror = () => setConnected(false);
    return () => { es.close(); esRef.current = null; };
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return;
    axios
      .get(`${PLATFORM_API}/collab/sessions/${sessionId}/annotations`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((res) => setAnnotations(res.data.annotations || []))
      .catch(() => {});
  }, [sessionId, token]);

  const addMark = async () => {
    if (!sessionId) return;
    const res = await axios.post(
      `${PLATFORM_API}/collab/sessions/${sessionId}/annotations`,
      {
        tool: activeTool,
        data: { x: Math.random(), y: Math.random(), label: `${activeTool} mark` },
      },
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (res.data.annotation) {
      setAnnotations((prev) => [...prev, res.data.annotation]);
    }
  };

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-white flex items-center gap-1">
          <Users size={12} className="text-indigo-400" />
          Collaboration
        </span>
        <span className={`text-[10px] px-1.5 py-0.5 rounded ${connected ? 'bg-emerald-900 text-emerald-300' : 'bg-gray-800 text-gray-500'}`}>
          {connected ? 'Live' : 'Offline'}
        </span>
      </div>
      <div className="flex gap-1">
        {[
          { id: 'pointer', icon: MousePointer },
          { id: 'circle', icon: Circle },
          { id: 'rect', icon: Square },
        ].map(({ id, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTool(id)}
            className={`p-1.5 rounded ${activeTool === id ? 'bg-indigo-800 text-white' : 'bg-gray-800 text-gray-400'}`}
          >
            <Icon size={12} />
          </button>
        ))}
        <button
          type="button"
          onClick={addMark}
          disabled={!sessionId}
          className="ml-auto text-[10px] px-2 py-1 rounded bg-gray-800 text-gray-300 disabled:opacity-40"
        >
          Add mark
        </button>
      </div>
      <div className="max-h-24 overflow-y-auto space-y-1">
        {annotations.length === 0 ? (
          <p className="text-[10px] text-gray-600">No shared annotations yet.</p>
        ) : (
          annotations.slice(-6).map((a) => (
            <div key={a.id} className="text-[10px] text-gray-400">
              <span className="text-gray-300">{a.user_name || 'User'}</span> · {a.tool}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
