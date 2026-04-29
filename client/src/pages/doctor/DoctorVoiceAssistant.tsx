import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import MainLayout from "@/components/layout/MainLayoutdoctor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import api from "@/lib/api";
import {
  Mic, MicOff, Send, Volume2, VolumeX, Loader2, Sparkles,
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
  if (action === "navigate_to")          return <Navigation className="h-4 w-4" />;
  if (action === "search_patient")       return <User className="h-4 w-4" />;
  if (action === "add_clinical_note")    return <FileText className="h-4 w-4" />;
  if (action === "schedule_followup")    return <Calendar className="h-4 w-4" />;
  if (action === "get_drug_info")        return <Pill className="h-4 w-4" />;
  if (action === "check_drug_interactions") return <AlertTriangle className="h-4 w-4" />;
  if (action === "get_today_summary")    return <Activity className="h-4 w-4" />;
  if (intent === "medical_query")        return <Brain className="h-4 w-4" />;
  return <Sparkles className="h-4 w-4" />;
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function DoctorVoiceAssistant() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      text: "Hello! I'm iSHA, your SmartHealth assistant.\n\nSay \"Hey iSHA\" to wake me, or type a command:\n• \"Show today's appointments\"\n• \"What's the dosage for amoxicillin?\"\n• \"Check interactions between metformin and aspirin\"",
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

  const recognitionRef   = useRef<SpeechRecognition | null>(null);
  const wakeRecRef       = useRef<SpeechRecognition | null>(null);
  const wakeStoppedRef   = useRef(false);  // prevent auto-restart on unmount
  const currentAudioRef  = useRef<HTMLAudioElement | null>(null);
  const messagesEndRef   = useRef<HTMLDivElement>(null);
  const inputRef         = useRef<HTMLInputElement>(null);

  // ── Speech Recognition setup ────────────────────────────────────────────
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
    setIsSpeaking(false);
  }, []);

  const speak = useCallback(async (text: string) => {
    if (!ttsEnabled) return;
    stopSpeaking();
    const clean = text.replace(/[*_#`•]/g, "").trim().slice(0, 1000);
    if (!clean) return;
    try {
      const resp = await fetch("/api/tts/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: clean, model: "eleven_turbo_v2_5" }),
      });
      if (!resp.ok) throw new Error("TTS API error");
      const blob = await resp.blob();
      const url  = URL.createObjectURL(blob);
      const audio = new Audio(url);
      currentAudioRef.current = audio;
      audio.onplay   = () => setIsSpeaking(true);
      audio.onended  = () => { setIsSpeaking(false); URL.revokeObjectURL(url); };
      audio.onerror  = () => { setIsSpeaking(false); URL.revokeObjectURL(url); };
      await audio.play();
    } catch {
      // Fallback to browser TTS if ElevenLabs unavailable
      const synth = window.speechSynthesis;
      if (!synth) return;
      synth.cancel();
      const utter = new SpeechSynthesisUtterance(clean);
      utter.rate = 1.05;
      const voices = synth.getVoices();
      const preferred = voices.find(v => v.lang === "en-IN") || voices.find(v => v.lang.startsWith("en")) || voices[0];
      if (preferred) utter.voice = preferred;
      utter.onstart = () => setIsSpeaking(true);
      utter.onend   = () => setIsSpeaking(false);
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
          if (t.includes("hey isha") || t.includes("hey isha") || t.includes("hey iша") || t.includes("hey esha")) {
            rec.stop();
            wakeRecRef.current = null;
            setIsAwoken(true);
            setWakeListening(false);
            // Greet and auto-start command listening
            speak("Yes doctor, I'm listening.");
            setTimeout(() => {
              if (recognitionRef.current) return;
              const cmd = new SpeechRecognitionAPI!();
              cmd.continuous     = false;
              cmd.interimResults = false;
              cmd.lang           = "en-IN";
              cmd.onresult = (ev: SpeechRecognitionEvent) => {
                const transcript = ev.results[0]?.[0]?.transcript;
                if (transcript) sendToAgent(transcript);
              };
              cmd.onerror = () => setIsListening(false);
              cmd.onend   = () => { setIsListening(false); setIsAwoken(false); };
              recognitionRef.current = cmd;
              cmd.start();
              setIsListening(true);
            }, 1800);
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
    setIsProcessing(true);

    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      text,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMsg]);
    setInputText("");

    try {
      const { data } = await api.post<AgentResponse>("/voice-assistant/agent", {
        text,
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

    const rec = new SpeechRecognitionAPI!();
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = "en-IN";
    rec.maxAlternatives = 1;

    rec.onresult = (e: SpeechRecognitionEvent) => {
      const transcript = e.results[0]?.[0]?.transcript;
      if (transcript) sendToAgent(transcript);
    };
    rec.onerror = (e: SpeechRecognitionErrorEvent) => {
      if (e.error !== "no-speech") toast({ title: "Mic error", description: e.error, variant: "destructive" });
      setIsListening(false);
    };
    rec.onend = () => { setIsListening(false); setIsAwoken(false); startWakeListener(); };

    recognitionRef.current = rec;
    rec.start();
    setIsListening(true);
    stopSpeaking();
  }, [speechSupported, isListening, sendToAgent, toast, SpeechRecognitionAPI, startWakeListener, stopSpeaking]);

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

  return (
    <MainLayout>
      <div className="flex flex-col h-[calc(100vh-64px)] bg-gradient-to-br from-slate-50 to-blue-50">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-white border-b shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center shadow">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-slate-800">iSHA Assistant</h1>
              <p className="text-xs text-slate-500">
                {wakeListening ? "Listening for \"Hey iSHA\"…" : isAwoken ? "I'm listening…" : "ElevenLabs voice · Clinical AI"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Wake word indicator */}
            {wakeListening && !isListening && (
              <Badge variant="secondary" className="gap-1 text-indigo-700 bg-indigo-50 border border-indigo-200">
                <Radio className="h-3 w-3 animate-pulse" /> Listening
              </Badge>
            )}
            {isAwoken && (
              <Badge className="gap-1 bg-blue-600 text-white animate-pulse">
                <Mic className="h-3 w-3" /> Hey iSHA!
              </Badge>
            )}
            {isSpeaking && (
              <Badge variant="secondary" className="gap-1 text-blue-700 bg-blue-50">
                <Volume2 className="h-3 w-3 animate-pulse" /> Speaking
              </Badge>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setTtsEnabled(v => !v); stopSpeaking(); }}
              title={ttsEnabled ? "Mute assistant" : "Unmute assistant"}
            >
              {ttsEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4 text-slate-400" />}
            </Button>
            <Button variant="ghost" size="sm" onClick={clearConversation} title="Clear conversation">
              <RotateCcw className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Suggested prompts */}
        <div className="flex gap-2 px-6 py-3 overflow-x-auto border-b bg-white">
          {[
            "Show today's appointments",
            "Amoxicillin dosage for children",
            "Check metformin and aspirin interaction",
            "Open ER Dashboard",
            "What are signs of sepsis?",
          ].map(prompt => (
            <button
              key={prompt}
              onClick={() => sendToAgent(prompt)}
              className="flex-shrink-0 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 rounded-full border border-blue-200 hover:bg-blue-100 transition-colors"
            >
              {prompt}
            </button>
          ))}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {messages.map(msg => (
            <div
              key={msg.id}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              {msg.role === "assistant" && (
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center mr-3 mt-1 flex-shrink-0">
                  <Sparkles className="h-4 w-4 text-white" />
                </div>
              )}
              <div className={`max-w-[75%] ${msg.role === "user" ? "" : ""}`}>
                <Card className={`shadow-sm border-0 ${
                  msg.role === "user"
                    ? "bg-blue-600 text-white"
                    : msg.intent === "medical_query"
                    ? "bg-emerald-50 border border-emerald-200"
                    : msg.requiresConfirmation
                    ? "bg-amber-50 border border-amber-200"
                    : "bg-white border border-slate-100"
                }`}>
                  <CardContent className="p-3">
                    {msg.role === "assistant" && (msg.intent || msg.action) && (
                      <div className="flex items-center gap-1.5 mb-2">
                        <span className={`p-1 rounded ${
                          msg.intent === "medical_query" ? "text-emerald-600 bg-emerald-100"
                          : msg.requiresConfirmation ? "text-amber-600 bg-amber-100"
                          : "text-blue-600 bg-blue-50"
                        }`}>
                          {intentIcon(msg.intent, msg.action)}
                        </span>
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                          {msg.action ? msg.action.replace(/_/g, " ") : msg.intent}
                        </span>
                      </div>
                    )}
                    <p className={`text-sm whitespace-pre-wrap leading-relaxed ${
                      msg.role === "user" ? "text-white" : "text-slate-700"
                    }`}>
                      {msg.text}
                    </p>

                    {/* Confirmation buttons */}
                    {msg.requiresConfirmation && pendingAction?.id === msg.id && (
                      <div className="flex gap-2 mt-3">
                        <Button size="sm" className="h-7 text-xs bg-amber-500 hover:bg-amber-600 text-white" onClick={confirmAction}>
                          Confirm <ChevronRight className="h-3 w-3 ml-1" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setPendingAction(null)}>
                          <X className="h-3 w-3 mr-1" /> Cancel
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
                <p className="text-[10px] text-slate-400 mt-1 px-1">
                  {msg.timestamp.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            </div>
          ))}

          {isProcessing && (
            <div className="flex justify-start">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center mr-3 flex-shrink-0">
                <Sparkles className="h-4 w-4 text-white" />
              </div>
              <Card className="bg-white border border-slate-100 shadow-sm">
                <CardContent className="p-3">
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                    <span className="text-sm text-slate-500">Thinking…</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input bar */}
        <div className="px-6 py-4 bg-white border-t shadow-sm">
          <div className="flex items-center gap-3 max-w-3xl mx-auto">
            {/* Mic button */}
            <button
              onClick={startListening}
              disabled={isProcessing}
              className={`flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center transition-all shadow-md ${
                isListening
                  ? "bg-red-500 hover:bg-red-600 animate-pulse ring-4 ring-red-200"
                  : "bg-gradient-to-br from-blue-600 to-indigo-700 hover:from-blue-700 hover:to-indigo-800 disabled:opacity-50"
              }`}
              title={isListening ? "Stop listening" : speechSupported ? "Tap to speak" : "Speech not supported in this browser"}
            >
              {isListening ? <MicOff className="h-5 w-5 text-white" /> : <Mic className="h-5 w-5 text-white" />}
            </button>

            <div className="flex-1 relative">
              <Input
                ref={inputRef}
                value={inputText}
                onChange={e => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={isListening ? "Listening…" : "Type a command or question…"}
                disabled={isProcessing || isListening}
                className="pr-10 h-12 text-sm border-slate-200 focus-visible:ring-blue-400"
              />
            </div>

            <Button
              onClick={() => sendToAgent(inputText)}
              disabled={!inputText.trim() || isProcessing}
              className="h-12 w-12 p-0 bg-blue-600 hover:bg-blue-700 flex-shrink-0"
            >
              {isProcessing ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
            </Button>
          </div>

          <p className="text-center text-[10px] text-slate-400 mt-2">
            {speechSupported
              ? "Tap the mic to speak, or type your command · iSHA Assistant · SmartHealth"
              : "Chrome/Edge for voice · Type your command · iSHA Assistant · SmartHealth"}
          </p>
        </div>
      </div>
    </MainLayout>
  );
}
