import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { MicVAD } from "@ricky0123/vad-web";
import { Room } from "livekit-client";
import MainLayout from "@/components/layout/MainLayoutdoctor";
import SiriOrb, { OrbState } from "@/components/SiriOrb";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import api from "@/lib/api";
import doctorCopilotService from "@/services/doctorCopilot";
import { getToken } from "@/hooks/auth";
import {
  Send, Volume2, VolumeX, Loader2, Sparkles,
  Navigation, User, FileText, Calendar, Brain, Pill, AlertTriangle,
  Activity, ChevronRight, RotateCcw, X, Radio,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Message {
  id: string;
  role: "user" | "assistant";
  text: string;
  intent?: string;
  action?: string | null;
  parameters?: Record<string, unknown> | null;
  requiresConfirmation?: boolean;
  timestamp: Date;
}

// Screen path map for navigation actions
const SCREEN_PATHS: Record<string, string> = {
  appointments:   "/doctor/appointments",
  patients:       "/doctor/patients",
  prescriptions:  "/doctor/prescriptions",
  dashboard:      "/doctor/dashboard",
  analytics:      "/doctor/insights",
  billing:        "/doctor/billing",
  "health-records": "/doctor/patients",
  "er-dashboard": "/doctor/triage",
  "icu-dashboard": "/doctor/health-monitoring",
  "voice-scribe": "/doctor/voice-scribe",
  calculators:    "/doctor/calculators",
  "ai-assist":    "/doctor/ai-hub",
  templates:      "/doctor/templates",
  monitoring:     "/doctor/health-monitoring",
  queue:          "/doctor/clinical-workspace",
  staff:          "/doctor/settings",
};

// Intent icons
const intentIcon = (intent?: string, action?: string | null) => {
  if (action === "navigate_to")             return <Navigation className="h-4 w-4" />;
  if (action === "search_patient")          return <User className="h-4 w-4" />;
  if (action === "add_clinical_note")       return <FileText className="h-4 w-4" />;
  if (action === "schedule_followup")       return <Calendar className="h-4 w-4" />;
  if (action === "get_drug_info")           return <Pill className="h-4 w-4" />;
  if (action === "check_drug_interactions") return <AlertTriangle className="h-4 w-4" />;
  if (action === "get_today_summary")       return <Activity className="h-4 w-4" />;
  if (action === "list_appointments")       return <Calendar className="h-4 w-4" />;
  if (action === "get_patient_health")      return <Activity className="h-4 w-4" />;
  if (action === "book_appointment")        return <Calendar className="h-4 w-4" />;
  if (action === "cancel_appointment")      return <AlertTriangle className="h-4 w-4" />;
  if (action === "reschedule_appointment")  return <Calendar className="h-4 w-4" />;
  if (intent === "medical_query")           return <Brain className="h-4 w-4" />;
  return <Sparkles className="h-4 w-4" />;
};

// ─── Component ────────────────────────────────────────────────────────────────

/** Convert 16kHz Float32 PCM (from VAD) to a WAV Blob for Whisper STT */
function float32ToWav(samples: Float32Array, sampleRate = 16000): Blob {
  const buf  = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buf);
  const w4   = (off: number, s: string) => { for (let i = 0; i < 4; i++) view.setUint8(off + i, s.charCodeAt(i)); };
  w4(0, 'RIFF'); view.setUint32(4, 36 + samples.length * 2, true);
  w4(8, 'WAVE'); w4(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);  view.setUint16(34, 16, true);
  w4(36, 'data'); view.setUint32(40, samples.length * 2, true);
  let off = 44;
  for (let i = 0; i < samples.length; i++, off += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }
  return new Blob([buf], { type: 'audio/wav' });
}

/** Match "Hey iSHA" and common speech-recognition variants */
const isWakePhrase = (t: string) =>
  t.includes("hey isha") || t.includes("hey esha") || t.includes("hey yesha") ||
  t.includes("hi isha")  || t.includes("hi esha")  || t.includes("hay isha")  ||
  t.includes("hey eesha") || /\bisha\b/.test(t);

/** Strip the wake phrase from a transcript and return the command (if any) */
const extractCommand = (t: string): string =>
  t.replace(/\b(hey|hi|hay)\s+(isha|esha|yesha|eesha)\b[,\s]*/i, '').trim();

export default function DoctorVoiceAssistant() {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const { currentDoctor } = useAuth();
  const doctorFirstName = currentDoctor?.firstName || "Doctor";

  const copilotContext = useMemo(() => {
    const segment = location.pathname.replace(/^\/doctor\/?/, "").split("/")[0] || "dashboard";
    let currentPatient: { id?: number | string; name?: string } | null = null;
    try {
      const raw = sessionStorage.getItem("doctorCopilotPatient");
      if (raw) currentPatient = JSON.parse(raw);
    } catch {
      /* ignore */
    }
    return {
      currentScreen: segment === "assistant" ? "isha_assistant" : segment,
      currentPatient,
    };
  }, [location.pathname]);

  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      text: "iSHA ready. Ask me about appointments, patients, drugs, or navigate anywhere.",

      intent: "general",
      action: null,
      parameters: null,
      requiresConfirmation: false,
      timestamp: new Date(),
    },
  ]);
  const [inputText, setInputText]       = useState("");
  const [isListening, setIsListening]   = useState(false);   // VAD detects active speech
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSpeaking, setIsSpeaking]     = useState(false);
  const [ttsEnabled, setTtsEnabled]     = useState(true);
  const [pendingAction, setPendingAction] = useState<Message | null>(null);
  const [isAwoken, setIsAwoken]          = useState(false);   // assistant in active mode
  const [vadReady, setVadReady]          = useState(false);   // VAD model loaded
  const [vadError, setVadError]          = useState<string | null>(null); // mic/model init failure
  const [vadRetry, setVadRetry]          = useState(0);       // bump to re-init VAD
  const [micVolume, setMicVolume]        = useState(0);       // 0-1 orb animation input
  const [sttMode, setSttMode]            = useState<'server' | 'browser'>('server'); // active transcription engine
  const sttDownNotifiedRef               = useRef<number>(0); // throttle "STT down" feedback

  // Browser-native Web Speech API is a zero-dependency STT fallback (Chrome/Edge).
  // It runs entirely on-device, so voice commands keep working even when the
  // server transcription providers (Groq/OpenAI/offline-scribe) are unavailable.
  const browserSttSupported = typeof window !== 'undefined' &&
    !!((window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown }).SpeechRecognition ||
       (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition);

  const vadRef           = useRef<MicVAD | null>(null);
  const speakAbortRef    = useRef<AbortController | null>(null);
  const messagesEndRef   = useRef<HTMLDivElement>(null);
  const inputRef         = useRef<HTMLInputElement>(null);
  // LiveKit room (future WebRTC use) + simple Audio element for TTS
  const livekitRoomRef   = useRef<Room | null>(null);
  const audioElRef       = useRef<HTMLAudioElement | null>(null);
  // Stable refs so VAD async callbacks always see latest values
  const isAwokenRef      = useRef(false);
  const isSpeakingRef    = useRef(false);
  const isProcessingRef  = useRef(false);
  const messagesRef      = useRef<Message[]>([]);
  const speakRef         = useRef<((text: string) => void) | null>(null);
  const sendToAgentRef   = useRef<((text: string) => void) | null>(null);
  const awokenTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Browser SpeechRecognition fallback
  const recognitionRef       = useRef<any>(null);                          // active SpeechRecognition instance
  const recognitionActiveRef = useRef(false);                              // should recognition auto-restart
  const micPausedRef         = useRef(false);                              // mic paused during TTS playback
  const sttModeRef           = useRef<'server' | 'browser'>('server');     // current engine for callbacks
  const processTranscriptRef = useRef<((t: string) => void) | null>(null); // shared wake/command handler
  const startBrowserSttRef   = useRef<(() => boolean) | null>(null);       // late-bound starter

  // Keep refs in sync
  useEffect(() => { isAwokenRef.current     = isAwoken;     }, [isAwoken]);
  useEffect(() => { isSpeakingRef.current   = isSpeaking;   }, [isSpeaking]);
  useEffect(() => { isProcessingRef.current = isProcessing; }, [isProcessing]);
  useEffect(() => { messagesRef.current     = messages;     }, [messages]);

  // ── LiveKit room: connect on mount for future WebRTC audio routing ──────────
  useEffect(() => {
    let room: Room | null = null;
    const connect = async () => {
      try {
        const { data } = await api.get('/voice-assistant/livekit-token');
        room = new Room();
        await room.connect(data.url, data.token);
        livekitRoomRef.current = room;
        console.info('[iSHA] LiveKit room connected:', data.roomName);
      } catch (err) {
        console.warn('[iSHA] LiveKit connect skipped:', (err as Error).message);
      }
    };
    connect();
    return () => {
      room?.disconnect();
      livekitRoomRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── ElevenLabs TTS → HTMLAudioElement playback ──────────────────────────────
  const stopSpeaking = useCallback(() => {
    if (audioElRef.current) {
      audioElRef.current.pause();
      audioElRef.current.src = '';
      audioElRef.current = null;
    }
    window.speechSynthesis?.cancel();
    setIsSpeaking(false);
  }, []);

  const speak = useCallback(async (text: string, onEnd?: () => void) => {
    // Resume whichever capture engine is active (VAD or browser SpeechRecognition)
    const resumeVAD = () => {
      micPausedRef.current = false;
      if (sttModeRef.current === 'browser') {
        if (recognitionActiveRef.current) {
          try { recognitionRef.current?.start(); } catch { /* already running */ }
        }
      } else {
        vadRef.current?.start().catch(() => {});
      }
    };

    if (!ttsEnabled) { resumeVAD(); onEnd?.(); return; }
    stopSpeaking();
    speakAbortRef.current?.abort();
    const abortCtrl = new AbortController();
    speakAbortRef.current = abortCtrl;
    const clean = text.replace(/[*_#`•]/g, "").trim().slice(0, 1000);
    if (!clean) { onEnd?.(); return; }

    // Pause capture while speaking so we don't transcribe our own output
    micPausedRef.current = true;
    if (sttModeRef.current === 'browser') {
      try { recognitionRef.current?.stop(); } catch { /* noop */ }
    } else {
      vadRef.current?.pause();
    }

    // Safety: resume VAD after 20s if audio never plays (silent failure)
    let safetyTimer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
      safetyTimer = null;
      setIsSpeaking(false);
      resumeVAD();
      onEnd?.();
    }, 20_000);
    const clearSafety = () => {
      if (safetyTimer) { clearTimeout(safetyTimer); safetyTimer = null; }
    };

    const tryBrowserTTS = () => {
      const synth = window.speechSynthesis;
      if (!synth) { setIsSpeaking(false); resumeVAD(); onEnd?.(); return; }
      synth.cancel();
      const utter = new SpeechSynthesisUtterance(clean);
      utter.rate = 1.05;
      const voices = synth.getVoices();
      const preferred = voices.find(v => v.lang === "en-IN") || voices.find(v => v.lang.startsWith("en")) || voices[0];
      if (preferred) utter.voice = preferred;
      utter.onstart = () => setIsSpeaking(true);
      utter.onend   = () => { clearSafety(); setIsSpeaking(false); resumeVAD(); onEnd?.(); };
      utter.onerror = () => { clearSafety(); setIsSpeaking(false); resumeVAD(); onEnd?.(); };
      synth.speak(utter);
    };

    try {
      const authToken = getToken();
      const resp = await fetch("/api/tts/stream", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(authToken ? { Authorization: "Bearer " + authToken } : {}),
        },
        body: JSON.stringify({ text: clean, model: "eleven_turbo_v2_5" }),
        signal: abortCtrl.signal,
      });
      if (!resp.ok) throw new Error("TTS " + resp.status);
      if (abortCtrl.signal.aborted) { clearSafety(); resumeVAD(); return; }
      const contentType = resp.headers.get("Content-Type") || "";
      if (!contentType.includes("audio")) {
        await resp.text().catch(() => "");
        throw new Error("TTS fallback response");
      }
      const blob = await resp.blob();
      if (abortCtrl.signal.aborted) { clearSafety(); resumeVAD(); return; }

      const url = URL.createObjectURL(blob);
      const el = new Audio(url);
      audioElRef.current = el;

      el.onended = () => {
        URL.revokeObjectURL(url);
        audioElRef.current = null;
        clearSafety();
        setIsSpeaking(false);
        resumeVAD();
        onEnd?.();
      };
      el.onerror = () => {
        URL.revokeObjectURL(url);
        audioElRef.current = null;
        clearSafety();
        setIsSpeaking(false);
        // ElevenLabs audio failed to decode — try browser TTS
        tryBrowserTTS();
      };

      await el.play();
      setIsSpeaking(true);

    } catch (err: unknown) {
      clearSafety();
      if ((err as Error)?.name === "AbortError") { resumeVAD(); return; }
      // ElevenLabs fetch failed or play() was blocked — fallback to browser TTS
      tryBrowserTTS();
    }
  }, [ttsEnabled, stopSpeaking]);

  // ── Keep speakRef / sendToAgentRef in sync ────────────────────────────────
  useEffect(() => { speakRef.current = speak; }, [speak]);

  // ── Shared transcript handler (used by BOTH VAD+server STT and browser STT) ─
  const processTranscript = useCallback((raw: string) => {
    const transcript = (raw || '').trim();
    if (!transcript) return;
    if (isSpeakingRef.current || isProcessingRef.current) return;
    const t = transcript.toLowerCase().trim();

    const FILLER = /^(um+|uh+|hmm+|okay|ok|yeah|yep|nope|ah+|oh+|er+|hm+|\.\.\.)$/i;
    if (t.length < 2 || FILLER.test(t)) return;

    if (!isAwokenRef.current) {
      // Passive mode — only respond to wake phrase
      if (isWakePhrase(t)) {
        isAwokenRef.current = true;
        setIsAwoken(true);
        if (awokenTimerRef.current) clearTimeout(awokenTimerRef.current);
        awokenTimerRef.current = setTimeout(() => { isAwokenRef.current = false; setIsAwoken(false); }, 60_000);

        const inlineCommand = extractCommand(t);
        if (inlineCommand.length > 3) {
          sendToAgentRef.current?.(inlineCommand);
        } else {
          speakRef.current?.(`Yes, Dr. ${doctorFirstName}?`);
        }
      }
    } else {
      // Active mode — send to agent
      if (awokenTimerRef.current) clearTimeout(awokenTimerRef.current);
      awokenTimerRef.current = setTimeout(() => { isAwokenRef.current = false; setIsAwoken(false); }, 60_000);
      sendToAgentRef.current?.(transcript);
    }
  }, [doctorFirstName]);
  useEffect(() => { processTranscriptRef.current = processTranscript; }, [processTranscript]);

  const notifySttDown = useCallback(() => {
    // Throttle to once per 30s so we don't spam on every utterance
    if (Date.now() - sttDownNotifiedRef.current < 30_000) return;
    sttDownNotifiedRef.current = Date.now();
    toast({
      title: 'Voice transcription unavailable',
      description: 'I could not hear that. Please type your command below.',
      variant: 'destructive',
    });
    setMessages(prev => [...prev, {
      id: `stt-down-${Date.now()}`,
      role: 'assistant',
      text: "I couldn't transcribe your voice just now — the speech service is unavailable. You can type your command instead.",
      intent: 'error',
      action: null,
      parameters: null,
      requiresConfirmation: false,
      timestamp: new Date(),
    }]);
  }, [toast]);

  // ── Browser-native SpeechRecognition (zero-dependency on-device STT) ────────
  const startBrowserStt = useCallback((): boolean => {
    const SR = (window as unknown as { SpeechRecognition?: any; webkitSpeechRecognition?: any }).SpeechRecognition
      || (window as unknown as { webkitSpeechRecognition?: any }).webkitSpeechRecognition;
    if (!SR) return false;

    try { recognitionRef.current?.stop(); } catch { /* noop */ }
    try { vadRef.current?.pause(); } catch { /* noop */ }

    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = false;
    rec.lang = 'en-IN';

    rec.onstart = () => { setVadReady(true); setVadError(null); };
    rec.onspeechstart = () => { if (!isSpeakingRef.current) setIsListening(true); };
    rec.onspeechend = () => setIsListening(false);
    rec.onresult = (e: any) => {
      setIsListening(false);
      if (isSpeakingRef.current || isProcessingRef.current || micPausedRef.current) return;
      for (let i = e.resultIndex; i < e.results.length; i += 1) {
        if (e.results[i].isFinal) {
          const txt = (e.results[i][0]?.transcript || '').trim();
          if (txt) processTranscriptRef.current?.(txt);
        }
      }
    };
    rec.onerror = (ev: any) => {
      if (ev?.error === 'not-allowed' || ev?.error === 'service-not-allowed') {
        recognitionActiveRef.current = false;
        setVadReady(false);
        setVadError('Microphone access was blocked. Allow mic permission to use voice commands.');
      }
      // 'no-speech' / 'aborted' / 'network' are transient — onend auto-restarts
    };
    rec.onend = () => {
      if (recognitionActiveRef.current && !micPausedRef.current) {
        try { rec.start(); } catch { /* already running */ }
      }
    };

    recognitionRef.current = rec;
    recognitionActiveRef.current = true;
    try { rec.start(); return true; } catch { return false; }
  }, []);
  useEffect(() => { startBrowserSttRef.current = startBrowserStt; }, [startBrowserStt]);

  // Auto-switch from server STT (VAD pipeline) to on-device browser STT.
  const switchToBrowserStt = useCallback((): boolean => {
    if (sttModeRef.current === 'browser') return true;
    if (!browserSttSupported) return false;
    try { vadRef.current?.destroy(); } catch { /* noop */ }
    vadRef.current = null;
    sttModeRef.current = 'browser';
    setSttMode('browser');
    const ok = startBrowserSttRef.current?.() ?? false;
    if (ok) {
      toast({ title: 'Switched to on-device voice', description: "Using your browser's built-in speech recognition." });
    } else {
      notifySttDown();
    }
    return ok;
  }, [browserSttSupported, toast, notifySttDown]);

  // ── Stop browser recognition on unmount ────────────────────────────────────
  useEffect(() => () => {
    recognitionActiveRef.current = false;
    try { recognitionRef.current?.stop(); } catch { /* noop */ }
    recognitionRef.current = null;
  }, []);

  // ── VAD: always-on mic, auto-wake + auto-command ──────────────────────────
  useEffect(() => {
    // Skip the VAD/server-STT pipeline entirely when running in browser-STT mode
    if (sttModeRef.current === 'browser') {
      startBrowserSttRef.current?.();
      return;
    }

    let vad: MicVAD | null = null;

    const transcribeAudio = async (audio: Float32Array): Promise<{ text: string; serviceDown: boolean }> => {
      const wav = float32ToWav(audio);
      const form = new FormData();
      form.append('audio', wav, 'recording.wav');
      // The wake phrase and doctor web commands are English-first. Without this,
      // Whisper often auto-detects ambient noise as another language and the
      // assistant never reaches the agent step.
      form.append('language', 'en');
      form.append('prompt', 'Hey iSHA. Open appointments. Show today appointments. Open patients. Open prescriptions.');
      try {
        const r = await doctorCopilotService.speechToText(form);
        return { text: (r?.text || '').trim(), serviceDown: false };
      } catch (err: unknown) {
        const status = (err as { response?: { status?: number } })?.response?.status;
        return { text: '', serviceDown: status === 503 || status === 502 || status === 500 || status === undefined };
      }
    };

    MicVAD.new({
      baseAssetPath:   '/',
      onnxWASMBasePath: '/',
      model:           'legacy',
      ortConfig:  (ort) => { ort.env.wasm.wasmPaths = '/'; },
      // 0.65 starts detecting speech sooner (was 0.75 — too late, missing "Hey iSHA" start)
      positiveSpeechThreshold: 0.65,
      // 0.45 holds on longer before declaring silence (was 0.55 — cutting off too early)
      negativeSpeechThreshold: 0.45,
      // 8 frames = ~256ms minimum clip (was 4 — clips too short for Whisper)
      minSpeechFrames:   8,
      // 20 frames = ~640ms pre-roll (was 5/160ms — missed first syllable of wake phrase)
      preSpeechPadFrames: 20,
      onFrameProcessed: ({ isSpeech }) => { setMicVolume(isSpeech); },
      onSpeechStart: () => { setIsListening(true); },
      onSpeechEnd: async (audio) => {
        setIsListening(false);
        setMicVolume(0);
        // Don't process our own output or overlapping requests
        if (isSpeakingRef.current || isProcessingRef.current) return;

        const { text: transcript, serviceDown } = await transcribeAudio(audio);
        if (serviceDown) {
          if (browserSttSupported && sttModeRef.current === 'server') {
            switchToBrowserStt();
          } else {
            notifySttDown();
          }
          return;
        }
        if (!transcript) return;
        processTranscriptRef.current?.(transcript);
      },
    }).then(v => {
      vad = v;
      vadRef.current = v;
      v.start();
      setVadReady(true);
      setVadError(null);
    }).catch(err => {
      console.warn('VAD init failed, voice commands require mic permission:', err);
      setVadReady(false);
      // Distinguish permission denial from asset/model load failure for a clear CTA
      const name = (err as Error)?.name || '';
      const msg = /NotAllowed|Permission/i.test(name + String(err))
        ? 'Microphone access was blocked. Allow mic permission to use voice commands.'
        : 'Voice model failed to load. You can still type commands, or retry.';
      setVadError(msg);
    });

    return () => {
      vad?.destroy();
      vadRef.current = null;
      if (awokenTimerRef.current) clearTimeout(awokenTimerRef.current);
      stopSpeaking();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vadRetry]);

  // ── Proactive briefing: poll every 2 min for urgent/high alerts ───────────
  const lastSpokenAlertRef = useRef<number>(0);
  const lastBriefingTextRef = useRef<string>("");
  const briefingPollRef    = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const pollBriefing = async () => {
      if (isSpeaking || isListening || isProcessing) return;
      if (Date.now() - lastSpokenAlertRef.current < 5 * 60 * 1000) return;
      try {
        const data = await doctorCopilotService.getBriefing();
        if (data?.hasUpdates && data?.speakText) {
          if (data.speakText === lastBriefingTextRef.current) return;
          lastBriefingTextRef.current = data.speakText;
          lastSpokenAlertRef.current = Date.now();
          const alertMsg: Message = {
            id: `briefing-${Date.now()}`,
            role: "assistant",
            text: data.speakText,
            intent: data.hasUrgent ? "urgent" : "notification",
            action: "get_doctor_briefing",
            parameters: { proactive: true },
            requiresConfirmation: false,
            timestamp: new Date(),
          };
          setMessages(prev => [...prev, alertMsg]);
          if (ttsEnabled) speak(data.speakText);
        }
      } catch { /* silent */ }
    };
    const initialTimer = setTimeout(pollBriefing, 60_000);
    briefingPollRef.current = setInterval(pollBriefing, 3 * 60 * 1000);
    return () => {
      clearTimeout(initialTimer);
      if (briefingPollRef.current) clearInterval(briefingPollRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ttsEnabled]);

  // ── Execute client-side actions ────────────────────────────────────────────
  const executeAction = useCallback((action: string | null, parameters: Record<string, unknown> | null) => {
    if (!action || !parameters) return;
    if (action === "navigate_to") {
      const screen = parameters.screen as string;
      const path = SCREEN_PATHS[screen];
      if (path) {
        navigate(path);
      } else {
        toast({ title: "Navigation", description: `Unknown screen: ${screen}`, variant: "destructive" });
      }
    }
    if (action === "search_patient") {
      navigate(`/doctor/patients?q=${encodeURIComponent(String(parameters.query || ""))}`);
    }
  }, [navigate, toast]);

  // ── Send to agent ──────────────────────────────────────────────────────────
  const sendToAgent = useCallback(async (text: string) => {
    if (!text.trim()) return;

    setIsProcessing(true);

    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      text,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMsg]);
    setInputText("");

    const history = [...messagesRef.current, userMsg]
      .filter(m => m.id !== "welcome")
      .filter(m => !(m.id.startsWith("briefing-") && m.action === "get_doctor_briefing"))
      .slice(-8)
      .map(m => ({ role: m.role, text: m.text }));

    try {
      const data = await doctorCopilotService.chat({
        message: text,
        history,
        context: copilotContext,
        pendingAction: pendingAction
          ? { action: pendingAction.action, parameters: pendingAction.parameters }
          : null,
      });

      const responseText = data.response || data.speak || "I'm not sure how to help with that.";
      const displayText = (data.speak && data.response && data.response.length > data.speak.length + 40)
        ? data.speak
        : responseText;

      const assistantMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        text: displayText,
        intent: data.intent || (data.path === 'clinical' ? 'medical_query' : data.intent),
        action: data.action,
        parameters: data.parameters,
        requiresConfirmation: data.requiresConfirmation,
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, assistantMsg]);

      if (data.requiresConfirmation) {
        speak(data.speak || responseText);
        setPendingAction(assistantMsg);
      } else if (data.action === 'navigate_to' || data.action === 'search_patient') {
        // Speak first, navigate only after TTS finishes so audio isn't cut off by unmount
        speak(data.speak || responseText, () => executeAction(data.action, data.parameters));
      } else {
        speak(data.speak || responseText);
        executeAction(data.action, data.parameters);
      }
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } }; message?: string };
      const errMsg = error?.response?.data?.error || error?.message || "Something went wrong";
      const errMsgObj: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        text: `Sorry, I encountered an error: ${errMsg}`,
        intent: "error",
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errMsgObj]);
    } finally {
      setIsProcessing(false);
    }
  }, [speak, executeAction, copilotContext, pendingAction]);

  // Keep sendToAgentRef in sync
  useEffect(() => { sendToAgentRef.current = sendToAgent; }, [sendToAgent]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendToAgent(inputText);
    }
  };

  const confirmAction = () => {
    if (!pendingAction) return;
    executeAction(pendingAction.action ?? null, pendingAction.parameters ?? null);
    setPendingAction(null);
    const confirmMsg: Message = {
      id: Date.now().toString(),
      role: "assistant",
      text: "Done! Action confirmed.",
      intent: "general",
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, confirmMsg]);
    speak("Done!");
  };

  const clearConversation = () => {
    setMessages(prev => [prev[0]]);
    setPendingAction(null);
    stopSpeaking();
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ─── Render ─────────────────────────────────────────────────────────────────

  const orbState: OrbState = isProcessing ? "processing" : isSpeaking ? "speaking" : isListening ? "listening" : "idle";

  // Format message text: convert bullet lines to styled list
  const renderText = (text: string) => {
    const lines = text.split("\n");
    return lines.map((line, i) => {
      if (line.startsWith("• ") || line.startsWith("- ")) {
        return (
          <div key={i} className="flex gap-2 mt-0.5">
            <span className="text-blue-400 flex-shrink-0 mt-0.5">›</span>
            <span>{line.slice(2)}</span>
          </div>
        );
      }
      return <div key={i} className={i > 0 ? "mt-1" : ""}>{line || <span>&nbsp;</span>}</div>;
    });
  };

  return (
    <MainLayout>
      <div className="flex flex-col h-[calc(100vh-64px)] bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-6 py-3 bg-slate-900/90 border-b border-slate-700/80 shadow-sm backdrop-blur">
          <div className="flex items-center gap-3">
            {/* Siri orb */}
            <SiriOrb
              state={orbState}
              volume={micVolume}
              size={44}
              onClick={() => {
                if (isAwoken) { isAwokenRef.current = false; setIsAwoken(false); }
                else { isAwokenRef.current = true; setIsAwoken(true); speakRef.current?.(`Yes, Dr. ${doctorFirstName}?`); }
              }}
            />
            <div>
              <h1 className="text-base font-semibold text-white tracking-tight">
                iSHA Assistant
                {isAwoken && <span className="ml-2 text-xs text-green-400 font-normal">● Active</span>}
              </h1>
              <p className="text-[11px] text-slate-400 leading-tight">
                {isListening   ? "Listening…"
                : isSpeaking   ? "Speaking…"
                : isProcessing ? "Thinking…"
                : vadError     ? "Voice input off · type below"
                : vadReady     ? (sttMode === 'browser' ? `On-device voice · Say "Hey iSHA"` : `Say "Hey iSHA" · SmartHealth`)
                : "Loading voice model…"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {vadReady && !isListening && !isSpeaking && !isProcessing && (
              <Badge variant="secondary" className="gap-1 text-xs text-indigo-300 bg-indigo-950 border border-indigo-700 hidden sm:flex">
                <Radio className="h-3 w-3 animate-pulse" /> {isAwoken ? "Ready" : "Standby"}
              </Badge>
            )}
            <Button variant="ghost" size="sm" onClick={() => { setTtsEnabled(v => !v); stopSpeaking(); }}
              title={ttsEnabled ? "Mute voice" : "Unmute voice"}
              className={`h-8 w-8 p-0 ${!ttsEnabled ? "text-slate-500" : "text-slate-300 hover:text-white"}`}>
              {ttsEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </Button>
            <Button variant="ghost" size="sm" onClick={clearConversation} title="Clear conversation"
              className="h-8 w-8 p-0 text-slate-400 hover:text-white">
              <RotateCcw className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* ── Mic / voice-model error banner ────────────────────────────── */}
        {vadError && (
          <div className="flex items-center justify-between gap-3 px-5 py-2.5 bg-amber-950/70 border-b border-amber-700/60">
            <div className="flex items-center gap-2 text-amber-200 text-xs">
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
              <span>{vadError}</span>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs border-amber-600 text-amber-200 hover:bg-amber-900/60 flex-shrink-0"
              onClick={() => {
                setVadError(null);
                recognitionActiveRef.current = false;
                try { recognitionRef.current?.stop(); } catch { /* noop */ }
                recognitionRef.current = null;
                sttModeRef.current = 'server';
                setSttMode('server');
                setVadRetry(c => c + 1);
              }}
            >
              <RotateCcw className="h-3 w-3 mr-1" /> Retry mic
            </Button>
          </div>
        )}

        {/* ── Suggested prompts ─────────────────────────────────────────── */}
        <div className="flex gap-2 px-5 py-2.5 overflow-x-auto border-b border-slate-700/60 bg-slate-900/50">
          {[
            "Show today's appointments",
            "Show pending appointments",
            "Book appointment for Rahul on 2026-05-10 at 10:00",
            "Cancel appointment for Priya",
            "Health update for Rahul",
            "Amoxicillin dosage for 20kg child",
            "Check metformin and aspirin interaction",
          ].map(prompt => (
            <button
              key={prompt}
              onClick={() => sendToAgent(prompt)}
              className="flex-shrink-0 px-3 py-1.5 text-[11px] font-medium text-blue-300 bg-blue-950/60 rounded-full border border-blue-800/70 hover:bg-blue-900/60 hover:border-blue-600 transition-all"
            >
              {prompt}
            </button>
          ))}
        </div>

        {/* ── Messages ──────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {messages.map(msg => (
            <div
              key={msg.id}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              {msg.role === "assistant" && (
                <div className={`w-8 h-8 rounded-full flex items-center justify-center mr-2.5 mt-1 flex-shrink-0 ${
                  msg.intent === "urgent" ? "bg-red-700 animate-pulse"
                  : msg.intent === "notification" ? "bg-amber-700"
                  : msg.intent === "medical_query" ? "bg-emerald-700"
                  : "bg-gradient-to-br from-blue-600 to-indigo-700"
                }`}>
                  {msg.intent === "urgent"
                    ? <span className="text-white text-xs font-bold">!</span>
                    : msg.intent === "medical_query"
                    ? <Brain className="h-4 w-4 text-white" />
                    : intentIcon(msg.intent, msg.action)}
                </div>
              )}
              <div className="max-w-[78%]">
                <Card className={`shadow-md border-0 ${
                  msg.role === "user"
                    ? "bg-blue-600"
                    : msg.intent === "urgent"
                    ? "bg-red-950/70 border border-red-600/60"
                    : msg.intent === "notification"
                    ? "bg-amber-950/60 border border-amber-600/50"
                    : msg.intent === "medical_query"
                    ? "bg-emerald-950/60 border border-emerald-700/60"
                    : msg.requiresConfirmation
                    ? "bg-amber-950/60 border border-amber-700/60"
                    : msg.intent === "error"
                    ? "bg-red-950/60 border border-red-700/50"
                    : "bg-slate-800/90 border border-slate-700/50"
                }`}>
                  <CardContent className="p-3">
                    {msg.role === "assistant" && msg.action && (
                      <div className="flex items-center gap-1.5 mb-2 pb-1.5 border-b border-white/5">
                        <span className={`p-0.5 rounded text-[10px] ${
                          msg.intent === "medical_query" ? "text-emerald-400"
                          : msg.requiresConfirmation ? "text-amber-400"
                          : "text-blue-400"
                        }`}>
                          {intentIcon(msg.intent, msg.action)}
                        </span>
                        <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
                          {msg.action.replace(/_/g, " ")}
                        </span>
                      </div>
                    )}
                    <div className={`text-sm leading-relaxed ${msg.role === "user" ? "text-white" : "text-slate-200"}`}>
                      {renderText(msg.text)}
                    </div>

                    {/* Confirmation buttons */}
                    {msg.requiresConfirmation && pendingAction?.id === msg.id && (
                      <div className="flex gap-2 mt-3">
                        <Button size="sm" className="h-7 text-xs bg-amber-500 hover:bg-amber-600 text-white" onClick={confirmAction}>
                          Confirm <ChevronRight className="h-3 w-3 ml-1" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 text-xs text-slate-300" onClick={() => setPendingAction(null)}>
                          <X className="h-3 w-3 mr-1" /> Cancel
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
                <p className="text-[10px] text-slate-500 mt-1 px-1">
                  {msg.timestamp.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            </div>
          ))}

          {/* Typing indicator */}
          {isProcessing && (
            <div className="flex justify-start">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center mr-2.5 flex-shrink-0 animate-pulse">
                <Sparkles className="h-4 w-4 text-white" />
              </div>
              <Card className="bg-slate-800/90 border border-slate-700/50 shadow-md">
                <CardContent className="p-3">
                  <div className="flex items-end gap-1 h-5">
                    {[0, 1, 2].map(i => (
                      <div
                        key={i}
                        className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce"
                        style={{ animationDelay: `${i * 0.18}s`, animationDuration: "0.9s" }}
                      />
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* ── Active state: large centred Siri orb ──────────────────────── */}
        {(isListening || isSpeaking || isProcessing) && (
          <div className="flex items-center justify-center gap-6 py-5 bg-slate-900/95 border-t border-slate-700/60">
            <SiriOrb state={orbState} volume={micVolume} size={96} />
            <div>
              <p className="text-sm font-semibold text-white">
                {isListening ? "Listening…" : isSpeaking ? "Speaking…" : "Thinking…"}
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {isListening ? "Speak your command" : isSpeaking ? "Will listen when done" : "Processing your request"}
              </p>
            </div>
          </div>
        )}

        {/* ── Input bar ─────────────────────────────────────────────────── */}
        <div className="px-5 py-3.5 bg-slate-900/90 border-t border-slate-700/60 shadow-sm">
          <div className="flex items-center gap-3 max-w-3xl mx-auto">

            <div className="flex-1 relative">
              <Input
                ref={inputRef}
                value={inputText}
                onChange={e => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={isListening ? "Listening…" : "Ask iSHA anything…"}
                disabled={isProcessing}
                className="h-12 text-sm bg-slate-800/80 border-slate-600/60 text-white placeholder:text-slate-500 focus-visible:ring-blue-500/60 rounded-xl"
              />
            </div>

            <Button
              onClick={() => { isAwokenRef.current = true; setIsAwoken(true); sendToAgent(inputText); }}
              disabled={!inputText.trim() || isProcessing}
              className="h-12 w-12 p-0 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 flex-shrink-0 shadow-md"
            >
              {isProcessing ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
            </Button>
          </div>

          <p className="text-center text-[10px] text-slate-600 mt-2">
            {vadError
              ? "Voice input unavailable — type your command above, or retry the mic."
              : vadReady
              ? `Say "Hey iSHA" anytime · Tap the orb to activate${sttMode === 'browser' ? ' · on-device speech' : ''} · ${isAwoken ? "Active — listening for commands" : "Standby"}`
              : "Loading voice model…"}
          </p>
        </div>
      </div>
    </MainLayout>
  );
}
