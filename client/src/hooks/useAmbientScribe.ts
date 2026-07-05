/**
 * useAmbientScribe — WebSocket ambient consultation scribe (Wave 1)
 */
import { useCallback, useRef, useState } from 'react';

export type SpeakerRole = 'doctor' | 'patient' | 'nurse' | 'family' | 'unknown';

export interface AmbientScribeState {
  active: boolean;
  sessionId: string | null;
  partialText: string;
  fullTranscript: string;
  speakerSegments: { speaker: SpeakerRole; text: string }[];
  structured: unknown;
  error: string | null;
  speakerRole: SpeakerRole;
}

export function useAmbientScribe(token: string) {
  const wsRef = useRef<WebSocket | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  // Ref mirrors state.speakerRole so the long-lived SpeechRecognition
  // callback (created once in start()) always reads the current speaker
  // instead of the value captured at closure-creation time.
  const speakerRoleRef = useRef<SpeakerRole>('doctor');
  const [state, setState] = useState<AmbientScribeState>({
    active: false,
    sessionId: null,
    partialText: '',
    fullTranscript: '',
    speakerSegments: [],
    structured: null,
    error: null,
    speakerRole: 'doctor',
  });

  const setSpeakerRole = useCallback((role: SpeakerRole) => {
    speakerRoleRef.current = role;
    setState((s) => ({ ...s, speakerRole: role }));
  }, []);

  const stopRecognition = useCallback(() => {
    try {
      recognitionRef.current?.stop();
    } catch {
      // ignore
    }
    recognitionRef.current = null;
  }, []);

  const start = useCallback(() => {
    if (!token) {
      setState((s) => ({ ...s, error: 'Authentication required', active: false }));
      return;
    }

    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const host = window.location.host;
    const ws = new WebSocket(`${proto}://${host}/api/scribe/stream?token=${encodeURIComponent(token)}`);
    wsRef.current = ws;

    ws.onopen = () => setState((s) => ({ ...s, active: true, error: null, fullTranscript: '', structured: null }));
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.type === 'ready') {
        setState((s) => ({ ...s, sessionId: msg.sessionId || null }));
      } else if (msg.type === 'partial') {
        setState((s) => ({ ...s, partialText: msg.text, fullTranscript: s.fullTranscript ? `${s.fullTranscript} ${msg.text}` : msg.text }));
      } else if (msg.type === 'complete') {
        setState((s) => ({
          ...s,
          active: false,
          fullTranscript: msg.transcript || s.fullTranscript,
          speakerSegments: msg.speakerSegments || [],
          structured: msg.structured,
          partialText: '',
        }));
        stopRecognition();
      } else if (msg.type === 'error') {
        setState((s) => ({ ...s, error: msg.message, active: false }));
        stopRecognition();
      }
    };
    ws.onerror = () => setState((s) => ({ ...s, error: 'WebSocket error', active: false }));
    ws.onclose = () => stopRecognition();

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-IN';
      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let interim = '';
        let finalChunk = '';
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          const text = event.results[i][0].transcript;
          if (event.results[i].isFinal) finalChunk += `${text} `;
          else interim = text;
        }
        if (interim) {
          setState((s) => ({ ...s, partialText: interim }));
        }
        if (finalChunk.trim()) {
          wsRef.current?.send(JSON.stringify({ type: 'text_chunk', text: finalChunk.trim(), speakerRole: speakerRoleRef.current }));
        }
      };
      recognition.onerror = () => {};
      recognition.start();
      recognitionRef.current = recognition;
    }
  }, [token, stopRecognition]);

  const sendText = useCallback((text: string, speakerRole?: SpeakerRole) => {
    if (!text.trim()) return;
    wsRef.current?.send(JSON.stringify({ type: 'text_chunk', text: text.trim(), speakerRole: speakerRole || speakerRoleRef.current }));
    setState((s) => ({ ...s, partialText: text }));
  }, []);

  const end = useCallback((noteType = 'opd') => {
    stopRecognition();
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'end', noteType }));
    } else {
      wsRef.current?.close();
      setState((s) => ({ ...s, active: false }));
    }
  }, [stopRecognition]);

  const stop = useCallback(() => {
    end('ipd');
  }, [end]);

  return { state, start, sendText, end, stop, setSpeakerRole };
}

export default useAmbientScribe;
