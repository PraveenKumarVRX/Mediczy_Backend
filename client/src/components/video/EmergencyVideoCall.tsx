/**
 * EmergencyVideoCall
 * Fullscreen overlay used by patients during an emergency triage video call.
 * Shows the LiveKit video room + a collapsible Dr. iSHA AI panel so the AI
 * "doctor" is accessible throughout the consultation.
 */
import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  PhoneOff, Bot, Send, Mic, MicOff, ChevronRight, ChevronLeft,
  Loader2, Stethoscope, AlertTriangle, X, MessageSquare
} from "lucide-react";
import { SimpleLiveKitRoom } from "@/components/video/LiveKitRoom";
import { drIshaAPI } from "@/services/drIsha";

interface AiMessage {
  role: "user" | "assistant";
  content: string;
}

interface EmergencyVideoCallProps {
  serverUrl: string;
  token: string;
  doctorName: string;
  patientName?: string;
  waitingForDoctor?: boolean;
  symptoms?: string;
  onEndCall: () => void;
}

export function EmergencyVideoCall({
  serverUrl,
  token,
  doctorName,
  patientName = "Patient",
  waitingForDoctor = false,
  symptoms = "",
  onEndCall,
}: EmergencyVideoCallProps) {
  const [aiOpen, setAiOpen] = useState(true);
  const [aiMessages, setAiMessages] = useState<AiMessage[]>([
    {
      role: "assistant",
      content: `Hello ${patientName}! I'm Dr. iSHA, your AI health assistant. I'm here with you throughout this consultation.\n\n${waitingForDoctor ? "Your doctor has been notified and will join shortly. " : ""}Please describe your symptoms and I'll help guide both you and the doctor.${symptoms ? `\n\nI can see you mentioned: *${symptoms}*` : ""}`,
    },
  ]);
  const [aiInput, setAiInput] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const recognitionRef = useRef<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);

  // Auto-record the patient's microphone for the entire session
  useEffect(() => {
    let stream: MediaStream | null = null;
    navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      .then((s) => {
        stream = s;
        const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : 'audio/webm';
        const recorder = new MediaRecorder(s, { mimeType });
        mediaRecorderRef.current = recorder;
        recordingChunksRef.current = [];
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) recordingChunksRef.current.push(e.data);
        };
        recorder.start(2000);
      })
      .catch((err) => console.warn('Patient mic recording unavailable:', err));

    return () => {
      // Save recording when component unmounts (call ended)
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== 'inactive') {
        recorder.onstop = () => {
          const chunks = recordingChunksRef.current;
          if (chunks.length > 0) {
            const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `patient-session-${patientName.replace(/\s+/g, '-')}-${new Date().toISOString().slice(0, 19)}.webm`;
            a.click();
            URL.revokeObjectURL(url);
          }
        };
        recorder.stop();
      }
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const scrollToBottom = () =>
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });

  const sendAiMessage = useCallback(async (text: string) => {
    if (!text.trim()) return;
    const userMsg: AiMessage = { role: "user", content: text };
    setAiMessages((prev) => [...prev, userMsg]);
    setAiInput("");
    setAiLoading(true);
    setTimeout(scrollToBottom, 50);

    try {
      const history = aiMessages.map((m) => ({ role: m.role, content: m.content }));
      const resp = await drIshaAPI.consult(text, "en", {
        emergencyMode: true,
        conversationHistory: history,
      });
      const reply = resp.data?.response ?? "I'm unable to respond right now. Please speak directly with the doctor.";
      setAiMessages((prev) => [...prev, { role: "assistant", content: reply }]);
    } catch {
      setAiMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "I'm having trouble responding. Please focus on your doctor.",
        },
      ]);
    } finally {
      setAiLoading(false);
      setTimeout(scrollToBottom, 50);
    }
  }, [aiMessages]);

  const toggleVoice = () => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    if (isRecording) {
      recognitionRef.current?.stop();
      setIsRecording(false);
      return;
    }

    const rec = new SpeechRecognition();
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = "en-US";
    rec.onstart = () => setIsRecording(true);
    rec.onend = () => setIsRecording(false);
    rec.onresult = (e: any) => {
      const transcript = e.results[0][0].transcript;
      sendAiMessage(transcript);
    };
    recognitionRef.current = rec;
    rec.start();
  };

  return (
    <div className="fixed inset-0 z-[9000] flex bg-slate-950">
      {/* ── Video area ── */}
      <div className="relative flex-1 flex flex-col">
        {/* Top bar */}
        <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/70 to-transparent">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-teal-600 flex items-center justify-center">
              <Stethoscope className="h-4 w-4 text-white" />
            </div>
            <div>
              <p className="text-white text-sm font-semibold leading-none">{doctorName}</p>
              {waitingForDoctor ? (
                <p className="text-yellow-300 text-xs flex items-center gap-1 mt-0.5">
                  <Loader2 className="h-2.5 w-2.5 animate-spin" /> Waiting for doctor to join…
                </p>
              ) : (
                <p className="text-green-300 text-xs mt-0.5">● Connected</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge className="bg-red-600 text-white text-[10px] animate-pulse">
              <AlertTriangle className="h-2.5 w-2.5 mr-1" /> EMERGENCY
            </Badge>
            <Badge className="bg-red-800/80 text-red-200 text-[10px]">
              ● REC
            </Badge>
            <Button
              size="sm"
              variant="ghost"
              className="text-white/70 hover:text-white h-7 px-2 text-xs"
              onClick={() => setAiOpen((v) => !v)}
              title={aiOpen ? "Hide AI panel" : "Show AI panel"}
            >
              <MessageSquare className="h-3.5 w-3.5 mr-1" />
              Dr. iSHA
              {aiOpen ? <ChevronRight className="h-3 w-3 ml-1" /> : <ChevronLeft className="h-3 w-3 ml-1" />}
            </Button>
          </div>
        </div>

        {/* LiveKit room */}
        <div className="flex-1 overflow-hidden">
          {serverUrl && token ? (
            <SimpleLiveKitRoom
              serverUrl={serverUrl}
              token={token}
              onDisconnect={onEndCall}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
              <Loader2 className="h-6 w-6 animate-spin mr-2" /> Connecting to video…
            </div>
          )}
        </div>

        {/* End call */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10">
          <Button
            onClick={onEndCall}
            size="lg"
            className="h-14 w-14 rounded-full bg-red-600 hover:bg-red-700 text-white shadow-2xl"
            title="End call"
          >
            <PhoneOff className="h-6 w-6" />
          </Button>
        </div>
      </div>

      {/* ── AI panel ── */}
      {aiOpen && (
        <div className="w-80 flex flex-col bg-slate-900 border-l border-slate-700 shrink-0">
          {/* Panel header */}
          <div className="flex items-center justify-between px-4 py-3 bg-teal-700 shrink-0">
              <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-full overflow-hidden bg-teal-700 shrink-0">
                <img src="/isha.png" alt="Dr. iSHA" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).replaceWith(Object.assign(document.createElement('span'), {className:'flex h-full items-center justify-center text-white text-xs font-bold', textContent:'AI'})); }} />
              </div>
              <div>
                <p className="text-white text-sm font-semibold leading-none">Dr. iSHA</p>
                <p className="text-teal-200 text-[10px]">AI Health Assistant</p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-white/60 hover:text-white hover:bg-teal-600"
              onClick={() => setAiOpen(false)}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>

          {/* Messages */}
          <ScrollArea className="flex-1 px-3 py-2">
            <div className="space-y-3">
              {aiMessages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex gap-2 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}
                >
                  {msg.role === "assistant" && (
                    <Avatar className="h-6 w-6 shrink-0 mt-0.5">
                      <AvatarFallback className="bg-teal-600 text-white text-[10px] overflow-hidden p-0">
                        <img src="/isha.png" alt="Dr. iSHA" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display='none'; }} />
                      </AvatarFallback>
                    </Avatar>
                  )}
                  <div
                    className={`max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap ${
                      msg.role === "user"
                        ? "bg-teal-600 text-white rounded-tr-none"
                        : "bg-slate-700 text-slate-100 rounded-tl-none"
                    }`}
                  >
                    {msg.content}
                  </div>
                </div>
              ))}
              {aiLoading && (
                <div className="flex gap-2">
                  <Avatar className="h-6 w-6 shrink-0">
                    <AvatarFallback className="bg-teal-600 text-white text-[10px] overflow-hidden p-0">
                      <img src="/isha.png" alt="Dr. iSHA" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display='none'; }} />
                    </AvatarFallback>
                  </Avatar>
                  <div className="bg-slate-700 rounded-xl rounded-tl-none px-3 py-2">
                    <Loader2 className="h-3 w-3 animate-spin text-teal-400" />
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>

          {/* Input */}
          <div className="px-3 py-3 border-t border-slate-700 shrink-0">
            <div className="flex gap-2">
              <Input
                value={aiInput}
                onChange={(e) => setAiInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendAiMessage(aiInput)}
                placeholder="Ask Dr. iSHA…"
                className="flex-1 bg-slate-800 border-slate-600 text-white placeholder:text-slate-400 text-xs h-8"
                disabled={aiLoading}
              />
              <Button
                variant="ghost"
                size="icon"
                className={`h-8 w-8 shrink-0 ${isRecording ? "text-red-400" : "text-slate-400 hover:text-white"}`}
                onClick={toggleVoice}
                title="Voice input"
              >
                {isRecording ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
              </Button>
              <Button
                size="icon"
                className="h-8 w-8 shrink-0 bg-teal-600 hover:bg-teal-700 text-white"
                onClick={() => sendAiMessage(aiInput)}
                disabled={!aiInput.trim() || aiLoading}
              >
                <Send className="h-3.5 w-3.5" />
              </Button>
            </div>
            <p className="text-[10px] text-slate-500 mt-1.5 text-center">
              AI assistance only — your doctor has the final decision
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
