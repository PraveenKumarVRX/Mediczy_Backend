/**
 * useAmbientScribe — WebSocket ambient consultation scribe (Wave 1)
 */
import { useCallback, useRef, useState } from 'react';

export interface AmbientScribeState {
  active: boolean;
  partialText: string;
  fullTranscript: string;
  structured: unknown;
  error: string | null;
}

export function useAmbientScribe(token: string) {
  const wsRef = useRef<WebSocket | null>(null);
  const [state, setState] = useState<AmbientScribeState>({
    active: false,
    partialText: '',
    fullTranscript: '',
    structured: null,
    error: null,
  });

  const start = useCallback(() => {
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const host = window.location.host;
    const ws = new WebSocket(`${proto}://${host}/api/scribe/stream?token=${encodeURIComponent(token)}`);
    wsRef.current = ws;

    ws.onopen = () => setState((s) => ({ ...s, active: true, error: null }));
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.type === 'partial') {
        setState((s) => ({ ...s, partialText: msg.text }));
      } else if (msg.type === 'complete') {
        setState((s) => ({
          ...s,
          active: false,
          fullTranscript: msg.transcript,
          structured: msg.structured,
          partialText: '',
        }));
      } else if (msg.type === 'error') {
        setState((s) => ({ ...s, error: msg.message, active: false }));
      }
    };
    ws.onerror = () => setState((s) => ({ ...s, error: 'WebSocket error', active: false }));
  }, [token]);

  const sendText = useCallback((text: string) => {
    wsRef.current?.send(JSON.stringify({ type: 'text_chunk', text }));
  }, []);

  const end = useCallback((noteType = 'opd') => {
    wsRef.current?.send(JSON.stringify({ type: 'end', noteType }));
    wsRef.current?.close();
    setState((s) => ({ ...s, active: false }));
  }, []);

  return { state, start, sendText, end };
}

export default useAmbientScribe;
