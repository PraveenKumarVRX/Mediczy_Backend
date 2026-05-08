import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import MainLayout from "@/components/layout/MainLayoutdoctor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import api from "@/lib/api";
import {
  Mic, MicOff, Send, Volume2, VolumeX, Loader2, Sparkles,
  Navigation, User, FileText, Calendar, Brain, Pill, AlertTriangle,
  Activity, ChevronRight, RotateCcw, X, Radio, Headphones,
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

interface AgentResponse {
  intent: string;
  action: string | null;
  parameters: Record<string, unknown> | null;
  response: string;
  speak: string;
  data?: Record<string, unknown> | null;
  requiresConfirmation: boolean;
}

// Screen path map for navigation actions
const SCREEN_PATHS: Record<string, string> = {
  appointments:   "/doctor/appointments",
  patients:       "/doctor/patients",
  prescriptions:  "/doctor/prescriptions",
  dashboard:      "/doctor/dashboard",
  analytics:      "/doctor/analytics",
  billing:        "/doctor/billing",
  "health-records": "/doctor/health-records",
  "er-dashboard": "/doctor/er-dashboard",
  "icu-dashboard": "/doctor/icu-dashboard",
  "voice-scribe": "/doctor/voice-scribe",
  calculators:    "/doctor/calculators",
  "ai-assist":    "/doctor/ai-assist",
  templates:      "/doctor/document-templates",
  monitoring:     "/doctor/monitoring",
  queue:          "/doctor/queue",
  staff:          "/doctor/staff",
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

export default function DoctorVoiceAssistant() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { currentDoctor } = useAuth();
  const doctorFirstName = currentDoctor?.firstName || "Doctor";

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
  const [inputText, setInputText]     = useState("");
  const [isListening, setIsListening]   = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSpeaking, setIsSpeaking]    = useState(false);
  const [ttsEnabled, setTtsEnabled]    = useState(true);
  const [pendingAction, setPendingAction] = useState<Message | null>(null);
  const [isAwoken, setIsAwoken]        = useState(false);  // woken by "Hey iSHA"
  const [wakeListening, setWakeListening] = useState(false); // bg wake listener active
  const [handsFreeMode, setHandsFreeMode] = useState(false); // auto-listen after each response
  const [interimText, setInterimText]    = useState(""); // live speech-recognition preview

  const recognitionRef    = useRef<SpeechRecognition | null>(null);
  const wakeRecRef        = useRef<SpeechRecognition | null>(null);
  const wakeStoppedRef    = useRef(false);  // prevent auto-restart on unmount
  const currentAudioRef   = useRef<HTMLAudioElement | null>(null);
  const audioUnlockedRef  = useRef(false);  // tracks if browser audio context is unlocked
  const speakAbortRef     = useRef<AbortController | null>(null); // cancels in-flight TTS fetch
  const messagesEndRef    = useRef<HTMLDivElement>(null);
  const inputRef          = useRef<HTMLInputElement>(null);
  // Refs that mirror state for use inside async callbacks (avoids stale closure)
  const handsFreeRef        = useRef(false);
  const isListeningRef      = useRef(false);
  const startListeningRef   = useRef<(() => void) | null>(null);
  const messagesRef         = useRef<Message[]>([]);
  const postWakePendingRef  = useRef(false); // trigger startListening after next TTS ends

  // ── Keep callback refs in sync with state ──────────────────────────────
  useEffect(() => { handsFreeRef.current = handsFreeMode; }, [handsFreeMode]);
  useEffect(() => { isListeningRef.current = isListening; }, [isListening]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  // ── Speech Recognition setup ─────────────────────────────────────────────
  const SpeechRecognitionAPI = (window as Window & { SpeechRecognition?: typeof SpeechRecognition; webkitSpeechRecognition?: typeof SpeechRecognition }).SpeechRecognition
    || (window as Window & { webkitSpeechRecognition?: typeof SpeechRecognition }).webkitSpeechRecognition;

  const speechSupported = !!SpeechRecognitionAPI;

  // ── ElevenLabs TTS ────────────────────────────────────────────────────────
  const stopSpeaking = useCallback(() => {
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current.src = "";
      currentAudioRef.current = null;
    }
    window.speechSynthesis?.cancel();
    setIsSpeaking(false);
  }, []);

  const speak = useCallback(async (text: string) => {
    // Helper: after speaking ends, auto-listen in hands-free mode
    const autoListenAfter = (delay = 700) => {
      if (postWakePendingRef.current) {
        // Wake word fired — always start listening after TTS ends, regardless of hands-free mode
        postWakePendingRef.current = false;
        setTimeout(() => startListeningRef.current?.(), delay);
        return;
      }
      if (handsFreeRef.current && !isListeningRef.current) {
        setTimeout(() => startListeningRef.current?.(), delay);
      }
    };

    if (!ttsEnabled) {
      autoListenAfter(300);
      return;
    }
    stopSpeaking();
    speakAbortRef.current?.abort();
    const abortCtrl = new AbortController();
    speakAbortRef.current = abortCtrl;
    const clean = text.replace(/[*_#`•]/g, "").trim().slice(0, 1000);
    if (!clean) return;
    try {
      const resp = await fetch("/api/tts/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: clean, model: "eleven_turbo_v2_5" }),
        signal: abortCtrl.signal,
      });
      if (!resp.ok) throw new Error("TTS API error");
      if (abortCtrl.signal.aborted) return;
      const blob = await resp.blob();
      if (abortCtrl.signal.aborted) return;
      const url  = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.volume = 1.0;
      currentAudioRef.current = audio;
      audio.onplay   = () => setIsSpeaking(true);
      audio.onended  = () => { setIsSpeaking(false); URL.revokeObjectURL(url); autoListenAfter(); };
      audio.onerror  = () => { setIsSpeaking(false); URL.revokeObjectURL(url); autoListenAfter(); };
      try {
        await audio.play();
      } catch (playErr: unknown) {
        console.warn("Audio autoplay blocked, using browser TTS:", playErr);
        URL.revokeObjectURL(url);
        currentAudioRef.current = null;
        throw playErr;
      }
    } catch (err: unknown) {
      if ((err as Error)?.name === "AbortError") return;
      const synth = window.speechSynthesis;
      if (!synth) { autoListenAfter(300); return; }
      synth.cancel();
      const utter = new SpeechSynthesisUtterance(clean);
      utter.rate = 1.05;
      const getVoices = (): Promise<SpeechSynthesisVoice[]> =>
        new Promise(resolve => {
          const v = synth.getVoices();
          if (v.length) return resolve(v);
          synth.onvoiceschanged = () => resolve(synth.getVoices());
        });
      const voices = await getVoices();
      if (abortCtrl.signal.aborted) return;
      const preferred = voices.find(v => v.lang === "en-IN") || voices.find(v => v.lang.startsWith("en")) || voices[0];
      if (preferred) utter.voice = preferred;
      utter.onstart = () => setIsSpeaking(true);
      utter.onend   = () => { setIsSpeaking(false); autoListenAfter(); };
      utter.onerror = (e) => { console.warn("SpeechSynthesis error:", e); setIsSpeaking(false); autoListenAfter(); };
      synth.speak(utter);
    }
  }, [ttsEnabled, stopSpeaking]);

  // ── Wake word: continuous SpeechRecognition for "Hey iSHA" ────────────────
  const startWakeListener = useCallback(() => {
    if (!SpeechRecognitionAPI || wakeRecRef.current) return;
    wakeStoppedRef.current = false;

    const startRec = () => {
      if (wakeStoppedRef.current) return;
      const rec = new SpeechRecognitionAPI();
      rec.continuous      = true;
      rec.interimResults  = true;
      rec.lang            = "en-IN";
      rec.maxAlternatives = 1;

      rec.onresult = (e: SpeechRecognitionEvent) => {
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const t = e.results[i][0].transcript.toLowerCase().trim();
          // Match "Hey iSHA" and common speech-recognition variants
          const isWakeWord =
            t.includes("hey isha") || t.includes("hey esha") || t.includes("hey yesha") ||
            t.includes("hi isha")  || t.includes("hi esha")  || t.includes("hay isha") ||
            t.includes("hey eesha") || t.includes("hey ishaa") || t.includes("hey isha") ||
            /\bisha\b/.test(t);   // "isha" alone (partial pickup)
          if (isWakeWord) {
            rec.stop();
            wakeRecRef.current = null;
            setIsAwoken(true);
            setWakeListening(false);
            // Check for urgent briefing to include in wake response
            const doWake = async () => {
              let wakeResponse = `Anhaan, Dr. ${doctorFirstName}?`;
              try {
                const briefResp = await api.get("/voice-assistant/briefing");
                if (briefResp.data?.hasUrgent && briefResp.data?.speakText) {
                  wakeResponse = `Anhaan, Dr. ${doctorFirstName}. ${briefResp.data.speakText}`;
                }
              } catch { /* silent */ }
              // Flag so speak()'s onended handler calls startListening() when TTS finishes
              postWakePendingRef.current = true;
              speak(wakeResponse);
            };
            void doWake();
            break;
          }
        }
      };

      rec.onend = () => {
        wakeRecRef.current = null;
        if (!wakeStoppedRef.current) {
          setTimeout(startRec, 300); // auto-restart
        }
      };

      try { rec.start(); wakeRecRef.current = rec; setWakeListening(true); } catch { /* ignore */ }
    };

    startRec();
  }, [SpeechRecognitionAPI, speak]);

  // Start wake listener on mount
  useEffect(() => {
    if (!SpeechRecognitionAPI) return;
    // Small delay so the page settles first
    const t = setTimeout(startWakeListener, 800);
    return () => {
      clearTimeout(t);
      wakeStoppedRef.current = true;
      wakeRecRef.current?.stop();
      wakeRecRef.current = null;
      stopSpeaking();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Proactive briefing: poll every 2 min for urgent/high alerts ───────────
  const lastSpokenAlertRef = useRef<number>(0); // epoch ms of last spoken alert
  const briefingPollRef    = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const pollBriefing = async () => {
      // Don't interrupt if already speaking/listening
      if (isSpeaking || isListening) return;
      // Throttle: speak at most once every 5 minutes
      if (Date.now() - lastSpokenAlertRef.current < 5 * 60 * 1000) return;
      try {
        const { data } = await api.get("/voice-assistant/briefing");
        if (data?.hasUpdates && data?.speakText) {
          lastSpokenAlertRef.current = Date.now();
          // Add as an assistant message in chat
          const alertMsg: Message = {
            id: `briefing-${Date.now()}`,
            role: "assistant",
            text: data.speakText,
            intent: data.hasUrgent ? "urgent" : "notification",
            action: "get_doctor_briefing",
            parameters: null,
            requiresConfirmation: false,
            timestamp: new Date(),
          };
          setMessages(prev => [...prev, alertMsg]);
          if (ttsEnabled) speak(data.speakText);
        }
      } catch { /* silent fail */ }
    };

    // Initial poll after 30s (let page settle), then every 2 minutes
    const initialTimer = setTimeout(pollBriefing, 30_000);
    briefingPollRef.current = setInterval(pollBriefing, 2 * 60 * 1000);
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
        setTimeout(() => navigate(path), 600);
      } else {
        toast({ title: "Navigation", description: `Unknown screen: ${screen}`, variant: "destructive" });
      }
    }
    if (action === "search_patient") {
      setTimeout(() => navigate(`/doctor/patients?q=${encodeURIComponent(String(parameters.query || ""))}`), 600);
    }
  }, [navigate, toast]);

  // ── Send to agent ──────────────────────────────────────────────────────────
  const sendToAgent = useCallback(async (text: string) => {
    if (!text.trim()) return;
    // Filter out noise: too short, filler words, or garbled (no spaces in >6 char string)
    const t = text.trim();
    const FILLER = /^(um+|uh+|hmm+|okay|ok|yeah|yep|nope|ah+|oh+|er+|hm+|\.\.\.)$/i;
    const isGarbled = t.length > 6 && !t.includes(' ') && !/^[a-z]+$/i.test(t);
    if (t.length < 3 || FILLER.test(t) || isGarbled) return;

    // Unlock browser audio context on first user-initiated call
    if (!audioUnlockedRef.current) {
      try {
        const ctx = new AudioContext();
        await ctx.resume();
        ctx.close();
        audioUnlockedRef.current = true;
      } catch { /* ignore — some browsers don't need this */ }
    }

    setIsProcessing(true);

    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      text,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMsg]);
    setInputText("");

    // Build history using ref (avoids stale closure)
    const history = messagesRef.current
      .filter(m => m.id !== "welcome")
      .slice(-10)
      .map(m => ({ role: m.role, text: m.text }));

    try {
      const { data } = await api.post<AgentResponse>("/voice-assistant/agent", {
        text,
        history,
        context: {
          currentScreen: window.location.pathname.split("/").pop() || "dashboard",
        },
      });

      const assistantMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        text: data.response,
        intent: data.intent,
        action: data.action,
        parameters: data.parameters,
        requiresConfirmation: data.requiresConfirmation,
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, assistantMsg]);
      speak(data.speak || data.response);

      if (data.requiresConfirmation) {
        setPendingAction(assistantMsg);
      } else {
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
  }, [speak, executeAction]);

  // ── Voice input ────────────────────────────────────────────────────────────
  const startListening = useCallback(() => {
    if (!speechSupported) {
      toast({ title: "Not supported", description: "Speech recognition is not available in this browser. Use Chrome or Edge.", variant: "destructive" });
      return;
    }
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }
    // Pause wake listener while commanding
    wakeStoppedRef.current = true;
    wakeRecRef.current?.stop();
    wakeRecRef.current = null;
    setWakeListening(false);

    // Request mic with noise suppression constraints for clinic environments
    void navigator.mediaDevices.getUserMedia({
      audio: { noiseSuppression: true, echoCancellation: true, autoGainControl: true, channelCount: 1 },
    }).catch(() => { /* proceed without constraints if denied */ });

    const rec = new SpeechRecognitionAPI!();
    rec.continuous = false;
    rec.interimResults = true; // show live transcription
    rec.lang = "en-IN";
    rec.maxAlternatives = 1;

    rec.onresult = (e: SpeechRecognitionEvent) => {
      let interim = "";
      let final = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) final += t;
        else interim += t;
      }
      if (interim) setInterimText(interim);
      if (final) { setInterimText(""); sendToAgent(final); }
    };
    rec.onerror = (e: SpeechRecognitionErrorEvent) => {
      if (e.error !== "no-speech") toast({ title: "Mic error", description: e.error, variant: "destructive" });
      setIsListening(false);
      setInterimText("");
    };
    rec.onend = () => { setIsListening(false); setInterimText(""); setIsAwoken(false); startWakeListener(); };

    recognitionRef.current = rec;
    rec.start();
    setIsListening(true);
    stopSpeaking();
  }, [speechSupported, isListening, sendToAgent, toast, SpeechRecognitionAPI, startWakeListener, stopSpeaking]);

  // Keep startListeningRef in sync so speak() can call it
  useEffect(() => { startListeningRef.current = startListening; }, [startListening]);

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

  const isActive = isListening || isSpeaking || isProcessing;

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
        <div className="flex items-center justify-between px-6 py-3.5 bg-slate-900/90 border-b border-slate-700/80 shadow-sm backdrop-blur">
          <div className="flex items-center gap-3">
            {/* Orb — animates with state */}
            <div className={`relative w-10 h-10 rounded-full flex items-center justify-center shadow-lg transition-all ${
              isListening ? "bg-red-500 ring-4 ring-red-500/30"
              : isSpeaking ? "bg-emerald-600 ring-4 ring-emerald-500/30"
              : isProcessing ? "bg-amber-500 ring-4 ring-amber-400/30"
              : "bg-gradient-to-br from-blue-600 to-indigo-700"
            }`}>
              {isListening  && <div className="absolute inset-0 rounded-full bg-red-400 animate-ping opacity-40" />}
              {isSpeaking   && <div className="absolute inset-0 rounded-full bg-emerald-400 animate-pulse opacity-40" />}
              {isProcessing && <div className="absolute inset-0 rounded-full bg-amber-300 animate-pulse opacity-40" />}
              {isListening  ? <Mic className="h-5 w-5 text-white relative z-10" />
              : isSpeaking  ? <Volume2 className="h-5 w-5 text-white relative z-10 animate-pulse" />
              : isProcessing ? <Loader2 className="h-5 w-5 text-white relative z-10 animate-spin" />
              : <Sparkles className="h-5 w-5 text-white relative z-10" />}
            </div>
            <div>
              <h1 className="text-base font-semibold text-white tracking-tight">iSHA Assistant</h1>
              <p className="text-[11px] text-slate-400 leading-tight">
                {isListening  ? "Listening…"
                : isSpeaking  ? "Speaking…"
                : isProcessing ? "Thinking…"
                : wakeListening ? "Say \"Hey iSHA\" to wake"
                : "SmartHealth · Clinical AI"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {/* Status badges */}
            {wakeListening && !isActive && (
              <Badge variant="secondary" className="gap-1 text-xs text-indigo-300 bg-indigo-950 border border-indigo-700 hidden sm:flex">
                <Radio className="h-3 w-3 animate-pulse" /> Standby
              </Badge>
            )}
            {/* Hands-free toggle */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setHandsFreeMode(v => !v)}
              title={handsFreeMode ? "Hands-free ON — tap to disable auto-listen" : "Enable hands-free mode (auto-listen after responses)"}
              className={`h-8 w-8 p-0 ${handsFreeMode ? "text-blue-400 bg-blue-900/40 ring-1 ring-blue-500" : "text-slate-400 hover:text-white"}`}
            >
              <Headphones className="h-4 w-4" />
            </Button>
            {/* Mute toggle */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setTtsEnabled(v => !v); stopSpeaking(); }}
              title={ttsEnabled ? "Mute voice" : "Unmute voice"}
              className={`h-8 w-8 p-0 ${!ttsEnabled ? "text-slate-500" : "text-slate-300 hover:text-white"}`}
            >
              {ttsEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </Button>
            {/* Clear */}
            <Button variant="ghost" size="sm" onClick={clearConversation} title="Clear conversation" className="h-8 w-8 p-0 text-slate-400 hover:text-white">
              <RotateCcw className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* ── Hands-free indicator bar ──────────────────────────────────── */}
        {handsFreeMode && (
          <div className="flex items-center justify-center gap-2 py-1.5 bg-blue-900/30 border-b border-blue-800/50 text-[11px] text-blue-300">
            <Headphones className="h-3 w-3" />
            Hands-free mode active — iSHA will auto-listen after each response
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

        {/* ── Voice active orb (Siri-style center display) ──────────────── */}
        {isActive && (
          <div className="flex items-center justify-center gap-4 py-4 bg-slate-900/95 border-t border-slate-700/60">
            <div className="relative flex items-center justify-center">
              {/* Outer pulse rings */}
              {isListening && <>
                <div className="absolute w-20 h-20 rounded-full bg-red-500/10 animate-ping" style={{ animationDuration: "1.2s" }} />
                <div className="absolute w-16 h-16 rounded-full bg-red-500/15 animate-ping" style={{ animationDuration: "0.9s" }} />
              </>}
              {isSpeaking && <>
                <div className="absolute w-20 h-20 rounded-full bg-emerald-500/10 animate-ping" style={{ animationDuration: "1.4s" }} />
                <div className="absolute w-16 h-16 rounded-full bg-emerald-500/15 animate-pulse" />
              </>}
              {/* Core orb */}
              <div className={`relative w-14 h-14 rounded-full shadow-2xl flex items-center justify-center ${
                isListening  ? "bg-gradient-to-br from-red-500 to-rose-600"
                : isSpeaking ? "bg-gradient-to-br from-emerald-500 to-teal-600"
                : "bg-gradient-to-br from-amber-500 to-orange-600"
              }`}>
                {isListening  && <Mic className="h-7 w-7 text-white" />}
                {isSpeaking   && (
                  <div className="flex items-end gap-0.5">
                    {[10, 16, 20, 16, 10].map((h, i) => (
                      <div key={i} className="w-1 bg-white/90 rounded-full animate-bounce"
                        style={{ height: `${h}px`, animationDelay: `${i * 0.12}s`, animationDuration: "0.7s" }} />
                    ))}
                  </div>
                )}
                {isProcessing && !isSpeaking && <Loader2 className="h-7 w-7 text-white animate-spin" />}
              </div>
            </div>
            {/* Status + interim text */}
            <div className="text-center flex-1 max-w-xs">
              <p className="text-sm font-medium text-white">
                {isListening ? "Listening…"
                : isSpeaking ? "Speaking…"
                : "Processing…"}
              </p>
              {interimText && (
                <p className="text-xs text-blue-300 mt-0.5 italic truncate max-w-[200px] mx-auto">
                  "{interimText}"
                </p>
              )}
              {isListening && (
                <p className="text-[10px] text-slate-500 mt-1">Tap mic or speak to stop</p>
              )}
              {handsFreeMode && isSpeaking && (
                <p className="text-[10px] text-emerald-500 mt-1">Auto-listening when done…</p>
              )}
            </div>
          </div>
        )}

        {/* ── Input bar ─────────────────────────────────────────────────── */}
        <div className="px-5 py-3.5 bg-slate-900/90 border-t border-slate-700/60 shadow-sm">
          <div className="flex items-center gap-3 max-w-3xl mx-auto">
            {/* Mic button with visual state */}
            <button
              onClick={startListening}
              disabled={isProcessing}
              className={`relative flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center transition-all duration-200 shadow-lg ${
                isListening
                  ? "bg-gradient-to-br from-red-500 to-rose-600 shadow-red-500/30"
                  : "bg-gradient-to-br from-blue-600 to-indigo-700 hover:from-blue-500 hover:to-indigo-600 disabled:opacity-40 shadow-blue-600/20"
              }`}
              title={isListening ? "Tap to stop" : speechSupported ? "Tap to speak" : "Chrome/Edge required for voice"}
            >
              {isListening && <div className="absolute inset-0 rounded-full bg-red-400/40 animate-ping" />}
              {isListening
                ? <MicOff className="h-5 w-5 text-white relative z-10" />
                : <Mic className="h-5 w-5 text-white" />}
            </button>

            <div className="flex-1 relative">
              <Input
                ref={inputRef}
                value={inputText}
                onChange={e => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={interimText ? `"${interimText}…"` : isListening ? "Listening…" : "Ask iSHA anything…"}
                disabled={isProcessing}
                className="h-12 text-sm bg-slate-800/80 border-slate-600/60 text-white placeholder:text-slate-500 focus-visible:ring-blue-500/60 rounded-xl"
              />
            </div>

            <Button
              onClick={() => sendToAgent(inputText)}
              disabled={!inputText.trim() || isProcessing}
              className="h-12 w-12 p-0 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 flex-shrink-0 shadow-md"
            >
              <Send className="h-5 w-5" />
            </Button>
          </div>

          <p className="text-center text-[10px] text-slate-600 mt-2">
            {speechSupported
              ? `Say "Hey iSHA" anytime · Tap 🎤 to speak${handsFreeMode ? " · Hands-free ON" : ""}`
              : "Chrome/Edge for voice · Type your command"}
          </p>
        </div>
      </div>
    </MainLayout>
  );
}
