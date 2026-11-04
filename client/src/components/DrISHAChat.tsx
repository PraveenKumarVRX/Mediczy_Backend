import { getToken } from '@/hooks/auth';
import { useAuth } from '@/auth/AuthProvider';
import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Bot, Send, User, Mic, Volume2, VolumeX, Clock, Trash2, Copy, Check, Video } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { drIshaAPI } from '@/services/drIsha';
import api from '@/utils/api';
import { useVideoCall } from '@/context/VideoCallContext';

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  isTyping?: boolean;
  action?: {actionId:string;confirmationToken:string;requiresConfirmation:boolean;action:{kind:'cancel'|'reschedule';appointmentId:number;appointmentDate?:string;appointmentTime?:string}};
  sources?: Array<{ documentId: string; chunkId: string; title: string; excerpt: string; version?: string; reviewDueAt?: string }>;
  confidence?: number;
  language?: string;
}

interface DrISHAChatProps {
  className?: string;
  placeholder?: string;
  welcomeMessage?: string;
  language?: string;
  onMessageSent?: (message: Message) => void;
  onResponseReceived?: (message: Message) => void;
  showVoiceInput?: boolean;
  showWelcomeCard?: boolean;
  maxHeight?: string;
}

export const DrISHAChat: React.FC<DrISHAChatProps> = (props) => {
  const { currentUser, currentDoctor, currentCorporate, userType } = useAuth();
  const actor = userType === 'doctor' ? currentDoctor : userType === 'corporate' ? currentCorporate : currentUser;
  let tokenActor = '';
  try {
    const token=getToken();
    const payload=token ? JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))) : null;
    tokenActor=String(payload?.sub || payload?.id || payload?.userId || payload?.doctorId || '');
  } catch { /* UI isolation only; server authentication remains authoritative. */ }
  return <DrISHAChatSession key={`${userType}:${actor?.id || tokenActor || 'anonymous'}`} {...props} />;
};

const DrISHAChatSession: React.FC<DrISHAChatProps> = ({
  className,
  placeholder = "Ask Dr. iSHA about your health...",
  welcomeMessage = "Hello! I'm Dr. iSHA, your AI medical assistant. How can I help you today?",
  language = "en",
  onMessageSent,
  onResponseReceived,
  showVoiceInput = true,
  showWelcomeCard = true,
  maxHeight = "600px"
}) => {
  const navigate = useNavigate();
  const videoCall = useVideoCall();
  // Transcripts stay in component memory; changing accounts remounts this component.
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [sessionId, setSessionId] = useState('');
  const [useHealthHistory, setUseHealthHistory] = useState(false);
  const [suggestedFollowUps, setSuggestedFollowUps] = useState<string[]>([
    "Tell me more", "What should I do?", "Is this serious?", "Home remedies?", "When to see a doctor?"
  ]);
  const [showVideoEscalation, setShowVideoEscalation] = useState(false);
  const [videoConnecting, setVideoConnecting] = useState(false);
  const [handoffId,setHandoffId] = useState<number | null>(null);
  const [handoffStatus,setHandoffStatus] = useState('');
  const [confirmingAction,setConfirmingAction] = useState<string | null>(null);
  useEffect(() => {
    if (!handoffId) return;
    let stopped = false;
    const poll = async () => { try { const {data} = await api.get(`/medical-ai/handoffs/${handoffId}`); if (!stopped) setHandoffStatus(data.status); } catch { if (!stopped) setHandoffStatus('unavailable'); } };
    poll(); const timer = setInterval(poll,4000);
    return () => { stopped=true; clearInterval(timer); };
  },[handoffId]);

  const startEmergencyVideo = async () => {
    setVideoConnecting(true);
    try {
      const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user')?.content || '';
      const { data } = await api.post('/medical-ai/instant-triage-call', {
        symptoms: lastUserMessage || 'Emergency consultation requested from Dr. iSHA chat',
        urgencyLevel: 'HIGH',
      });
      if (data?.videoCall?.appointmentId) { setHandoffId(data.videoCall.appointmentId); setHandoffStatus('offered'); }
      const livekit = data?.videoCall?.livekit?.patient || data?.videoCall?.livekit;
      if (livekit?.serverUrl && livekit?.token) {
        videoCall.startCall({
          serverUrl: livekit.serverUrl,
          token: livekit.token,
          roomName: livekit.roomName || data.videoCall.roomId,
          iceServers: livekit.iceServers,
        }, 'Patient');
        toast.info('Joining the consultation room. Waiting for the doctor.');
        setShowVideoEscalation(false);
        return;
      }
      if (data?.videoCall?.joinUrl) {
        window.open(data.videoCall.joinUrl, '_blank', 'width=1280,height=720');
        setShowVideoEscalation(false);
        return;
      }
      throw new Error('Video room unavailable');
    } catch (error) {
      console.error('Emergency video escalation failed');
      toast.error('Could not start video call. Opening emergency page...');
      navigate('/emergency');
    } finally {
      setVideoConnecting(false);
    }
  };

  useEffect(() => {
    // Remove histories written by older account-independent clients.
    try { localStorage.removeItem('dr_isha_session'); } catch { /* storage unavailable */ }
  }, []);

  useEffect(() => {
    // Only initialize a new session if we didn't restore one
    const restored = messages.length > 0;
    if (!restored) {
      const newSessionId = drIshaAPI.startNewSession();
      setSessionId(newSessionId);
    }

    // Show welcome only for fresh sessions (not restored ones)
    if (!restored && showWelcomeCard && welcomeMessage) {
      const disclaimer = "\n\n*Disclaimer: I am an AI assistant, not a licensed physician. This is for informational purposes only — always consult a qualified healthcare professional for diagnosis and treatment.*";
      setMessages([{
        id: `welcome-${Date.now()}`,
        role: "assistant",
        content: welcomeMessage + disclaimer,
        timestamp: new Date(),
        confidence: undefined
      }]);
    }
  }, [welcomeMessage, showWelcomeCard]);

  useEffect(() => {
    // Auto-scroll to bottom - target the Radix viewport, not the Root
    if (scrollAreaRef.current) {
      const viewport = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (viewport) {
        viewport.scrollTop = viewport.scrollHeight;
      }
    }
  }, [messages]);

  const generateMessageId = () => `msg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

  const sendMessage = async (text: string) => {
    if (!text.trim() || isLoading) return;

    const userMessage: Message = {
      id: generateMessageId(),
      role: "user",
      content: text.trim(),
      timestamp: new Date(),
      language
    };

    setMessages(prev => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    // Call onMessageSent callback
    if (onMessageSent) {
      onMessageSent(userMessage);
    }

    try {
      // Add typing indicator
      const typingMessage: Message = {
        id: `typing-${Date.now()}`,
        role: "assistant",
        content: "Dr. iSHA is analyzing your question...",
        timestamp: new Date(),
        isTyping: true
      };
      setMessages(prev => [...prev, typingMessage]);

      // Consult Dr. iSHA
      const response = await drIshaAPI.consult(
        userMessage.content,
        language,
        {
          useHealthHistory,
          sessionId,
          userAgent: 'Mediczy Web App'
        }
      );

      // Remove typing indicator
      setMessages(prev => prev.filter(msg => !msg.isTyping));

      if (response.success && response.data) {
        setSessionId(response.data.sessionId);
        const reply = String(response.data.response || '').trim();
        if (!reply || reply === 'Based on the information I gathered, here is my response.') {
          throw new Error('Dr. iSHA returned an incomplete response');
        }
        const assistantMessage: Message = {
          id: generateMessageId(),
          role: "assistant",
          content: reply,
          timestamp: new Date(),
          confidence: response.data.confidence,
          action: response.data.action,
          sources: response.data.retrieval?.supportingSources || [],
          language: response.data.language
        };

        setMessages(prev => [...prev, assistantMessage]);

        // ===== INTELLIGENT INTENT HANDLING =====
        const response_data = response.data;

        // Update adaptive follow-up chips based on response context
        if (response_data?.suggestedFollowUps && Array.isArray(response_data.suggestedFollowUps)) {
          setSuggestedFollowUps(response_data.suggestedFollowUps.slice(0, 5));
        }

        // Safe navigation — only follow redirectUrls that start with '/' (internal paths)
        // The backend already validates these; we double-check client-side
        const safeNavigate = (url: string | undefined, fallback: string) => {
          const target = url?.startsWith('/') && !url.startsWith('//') ? url : fallback;
          try { navigate(target); } catch { /* navigation error — stay on current page */ }
        };

        // Handle Emergency Intent
        if (response_data.intentType === 'emergency') {
          setShowVideoEscalation(true);
          toast.error('EMERGENCY DETECTED - Call emergency services immediately if needed.', { duration: 5000 });
          setTimeout(() => safeNavigate(response_data.redirectUrl, '/emergency'), 2000);
        }
        // Handle Appointment Intent
        else if (response_data.intentType === 'appointment') {
          toast.success('Let me help you book an appointment!', { duration: 3000 });
          setTimeout(() => safeNavigate(response_data.redirectUrl, '/patient/appointments'), 1500);
        }
        // Handle Doctor Search Intent
        else if (response_data.intentType === 'doctor_search') {
          toast.info('Browse our network of doctors', { duration: 3000 });
          setTimeout(() => safeNavigate(response_data.redirectUrl, '/patient/doctors'), 1500);
        }
        // Handle Specialist Referral (Pregnancy, Mental Health, Pediatric)
        else if (
          response_data.intentType === 'pregnancy' ||
          response_data.intentType === 'mental_health' ||
          response_data.intentType === 'pediatric'
        ) {
          const specialistName = response_data.suggestedSpecialist || 'Specialist';
          toast.info(`Connecting you with a ${specialistName}`, { duration: 3000 });
          const specialty = encodeURIComponent(response_data.specialization || '');
          setTimeout(() => safeNavigate(response_data.redirectUrl, `/patient/doctors?specialty=${specialty}`), 1500);
        }

        // Call onResponseReceived callback
        if (onResponseReceived) {
          onResponseReceived(assistantMessage);
        }

        // TTS — only when user has opted in and response is short enough for voice
        if (ttsEnabled && window.speechSynthesis && assistantMessage.content.length < 500) {
          const utterance = new SpeechSynthesisUtterance(assistantMessage.content);
          utterance.rate = 0.9;
          utterance.volume = 0.8;
          window.speechSynthesis.speak(utterance);
        }
      } else {
        throw new Error(response.error?.message || 'Failed to get response from Dr. iSHA');
      }
    } catch (error) {
      console.error("Dr. iSHA consultation error:", error);
      
      // Remove typing indicator
      setMessages(prev => prev.filter(msg => !msg.isTyping));
      
      const errorMessage: Message = {
        id: generateMessageId(),
        role: "assistant",
        content: `I apologize, but I'm having trouble responding right now. Please try again in a moment.\n\n*If you're experiencing urgent health concerns, please contact your healthcare provider directly.*`,
        timestamp: new Date(),
        confidence: 0
      };

      setMessages(prev => [...prev, errorMessage]);
      toast.error("Dr. iSHA is temporarily unavailable. Please try again.");
    } finally {
      setIsLoading(false);
      // Re-focus input so the user can immediately type the next message
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const startVoiceInput = () => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      toast.error("Voice input is not supported in your browser");
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    
    recognition.continuous = false;
    recognition.interimResults = false;
    
    // Map language codes to speech recognition locales
    const languageMap: { [key: string]: string } = {
      'en': 'en-US',
      'hi': 'hi-IN',
      'ta': 'ta-IN',
      'te': 'te-IN',
      'bn': 'bn-IN',
      'mr': 'mr-IN',
      'gu': 'gu-IN',
      'kn': 'kn-IN',
      'ml': 'ml-IN',
      'pa': 'pa-IN',
      'ur': 'ur-IN',
      'es': 'es-ES',
      'fr': 'fr-FR',
      'ar': 'ar-SA'
    };
    
    recognition.lang = languageMap[language] || 'en-US';

    recognition.onstart = () => {
      setIsListening(true);
      toast.success("Listening... Speak now");
    };

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setInput(transcript);
      setIsListening(false);
    };

    recognition.onerror = (event) => {
      console.error('Speech recognition error:', event);
      setIsListening(false);
      toast.error("Voice recognition failed. Please try again.");
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.start();
  };

  const speakMessage = (content: string) => {
    if (window.speechSynthesis) {
      // Cancel any ongoing speech
      window.speechSynthesis.cancel();
      
      const utterance = new SpeechSynthesisUtterance(content);
      utterance.rate = 0.9;
      utterance.volume = 0.8;
      utterance.pitch = 1.0;
      
      // Set language-specific voice if available
      const voices = window.speechSynthesis.getVoices();
      const voice = voices.find(v => v.lang.startsWith(language)) || voices[0];
      if (voice) utterance.voice = voice;
      
      window.speechSynthesis.speak(utterance);
    }
  };


  return (
    <Card className={cn("flex flex-col min-h-0 bg-background/50 backdrop-blur-sm border-primary/20", className)}>
      <ScrollArea 
        className="min-h-0 p-4 space-y-4"
        style={{ height: maxHeight, maxHeight }}
        ref={scrollAreaRef}
      >
        <AnimatePresence>
          {messages.map((message) => (
            <motion.div
              key={message.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
              className={`flex gap-3 mb-6 ${
                message.role === "assistant" ? "flex-row" : "flex-row-reverse"
              }`}
            >
              <motion.div 
                initial={{ scale: 0.8 }}
                animate={{ scale: 1 }}
                transition={{ duration: 0.2 }}
                className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-1",
                  message.role === "assistant" 
                    ? "bg-primary/20 text-primary" 
                    : "bg-blue-500/20 text-blue-600"
                )}
              >
                {message.role === "assistant" ? (
                  <Bot className="w-4 h-4" />
                ) : (
                  <User className="w-4 h-4" />
                )}
              </motion.div>
              
              <motion.div
                initial={{ x: message.role === "assistant" ? -20 : 20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ duration: 0.3, delay: 0.1 }}
                className={cn(
                  "rounded-lg px-4 py-3 max-w-[85%] relative group",
                  message.role === "assistant"
                    ? "bg-card/50 border border-primary/20 shadow-lg hover:shadow-xl transition-shadow"
                    : "bg-primary text-primary-foreground shadow-lg"
                )}
              >
                {message.isTyping ? (
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1">
                      {[0, 1, 2].map((i) => (
                        <motion.div
                          key={i}
                          className="w-2 h-2 bg-primary rounded-full"
                          animate={{
                            scale: [1, 1.5, 1],
                            opacity: [0.5, 1, 0.5],
                          }}
                          transition={{
                            duration: 1.5,
                            repeat: Infinity,
                            delay: i * 0.2,
                          }}
                        />
                      ))}
                    </div>
                    <span className="text-sm text-muted-foreground">
                      {message.content}
                    </span>
                  </div>
                ) : (
                  <>
                    {message.role === "assistant" ? (
                      <div className="prose prose-sm dark:prose-invert max-w-none">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {message.content}
                        </ReactMarkdown>
                      </div>
                    ) : (
                      <p className="whitespace-pre-wrap">{message.content}</p>
                    )}
                    
                    {/* Message metadata */}
                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/50">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Clock className="w-3 h-3" />
                        {message.timestamp.toLocaleTimeString([], { 
                          hour: '2-digit', 
                          minute: '2-digit' 
                        })}

                      </div>
                      
                      {message.action?.requiresConfirmation && (
                        <Button type="button" disabled={Boolean(confirmingAction)} onClick={async () => {
                          setConfirmingAction(message.action!.actionId);
                          try {
                            const {data} = await api.post('/medical-ai/actions/confirm',{actionId:message.action!.actionId,confirmationToken:message.action!.confirmationToken,confirmed:true});
                            if (!data.committed) throw new Error('Action not committed');
                            setMessages(previous => previous.map(item => item.id === message.id ? {...item,action:undefined,content:`Appointment #${data.appointmentId}: ${data.status}.`} : item));
                          } catch { toast.error('Appointment change could not be completed. Check its current status before trying again.'); }
                          finally { setConfirmingAction(null); }
                        }}>Confirm {message.action.action.kind === 'cancel' ? 'cancellation' : 'new appointment time'}</Button>
                      )}
                      {message.role === 'assistant' && !message.isTyping && sessionId && (
                        <div className="flex gap-2 text-xs">
                          {[{label:'Helpful',rating:5},{label:'Not helpful',rating:1}].map(option=>(
                            <button type="button" key={option.label} onClick={async()=>{
                              try { await api.post('/medical-ai/feedback',{sessionId,rating:option.rating,useHealthHistory});toast.success('Feedback recorded'); }
                              catch {toast.error('Feedback could not be recorded');}
                            }}>{option.label}</button>
                          ))}
                        </div>
                      )}
                      {!!message.sources?.length && (
                        <details className="text-xs mt-2">
                          <summary>Sources retrieved for this answer</summary>
                          <ul className="space-y-2 mt-2">
                            {message.sources.map(source => (
                              <li key={`${source.documentId}:${source.chunkId}`}>
                                <strong>{source.title}</strong>{source.version && <span> · version {source.version}</span>}
                                <p>{source.excerpt}</p>
                              </li>
                            ))}
                          </ul>
                        </details>
                      )}
                      {/* Action buttons for assistant messages */}
                      {message.role === "assistant" && !message.isTyping && (
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                          <Button
                            size="sm" variant="ghost" className="h-6 w-6 p-0"
                            title="Copy response"
                            onClick={() => {
                              navigator.clipboard.writeText(message.content).then(() => {
                                setCopiedId(message.id);
                                setTimeout(() => setCopiedId(null), 1500);
                              }).catch(() => {});
                            }}
                          >
                            {copiedId === message.id
                              ? <Check className="w-3 h-3 text-emerald-500" />
                              : <Copy className="w-3 h-3" />}
                          </Button>
                          <Button
                            size="sm" variant="ghost" className="h-6 w-6 p-0"
                            title="Read aloud"
                            onClick={() => speakMessage(message.content)}
                          >
                            <Volume2 className="w-3 h-3" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </motion.div>
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Suggested Follow-up Chips */}
        {messages.length > 1 && !isLoading && messages[messages.length - 1]?.role === "assistant" && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.3 }}
            className="flex flex-wrap gap-2 mt-2 mb-4 px-1"
          >
            {suggestedFollowUps.map((suggestion) => (
              <button
                key={suggestion}
                onClick={() => sendMessage(suggestion)}
                className="text-xs px-3 py-1.5 rounded-full border border-primary/30 bg-primary/5 hover:bg-primary/15 text-primary transition-colors duration-200 hover:border-primary/50"
              >
                {suggestion}
              </button>
            ))}
          </motion.div>
        )}
      </ScrollArea>

      {showVideoEscalation && (
        <div className="mx-4 mb-2 rounded-lg border border-rose-300 bg-rose-50 dark:bg-rose-950/30 p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="text-sm text-rose-800 dark:text-rose-200">
            <strong>Emergency detected.</strong> Start an instant video consult with a doctor, or use the emergency page.
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="destructive" onClick={startEmergencyVideo} disabled={videoConnecting}>
              <Video className="w-4 h-4 mr-1" />
              {videoConnecting ? 'Connecting...' : 'Start video now'}
            </Button>
            <Button size="sm" variant="outline" onClick={() => navigate('/emergency')}>
              Emergency page
            </Button>
          </div>
        </div>
      )}

      {/* Input Form */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="border-t border-primary/20 p-4 bg-background/80 backdrop-blur-sm"
      >
        <form onSubmit={handleSubmit} className="flex gap-3">
          {showVoiceInput && (
            <Button
              type="button"
              variant={isListening ? "default" : "outline"}
              size="icon"
              onClick={startVoiceInput}
              disabled={isLoading}
              className={cn(
                "flex-shrink-0 transition-all duration-300",
                isListening && "bg-red-500 hover:bg-red-600 animate-pulse"
              )}
            >
              <Mic className={cn(
                "h-4 w-4",
                isListening && "text-white"
              )} />
            </Button>
          )}
          
          <Input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={isListening ? "Listening..." : placeholder}
            disabled={isLoading || isListening}
            className="flex-1 bg-card/50 backdrop-blur-sm border-primary/20"
          />
          {/* TTS opt-in toggle */}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            title={ttsEnabled ? "Mute auto-read" : "Enable auto-read aloud"}
            onClick={() => {
              if (ttsEnabled) window.speechSynthesis?.cancel();
              setTtsEnabled(p => !p);
            }}
            className={cn("flex-shrink-0 transition-colors", ttsEnabled ? "text-teal-600" : "text-muted-foreground")}
          >
            {ttsEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </Button>

          <label className="flex items-center gap-1 text-xs">
            <input type="checkbox" checked={useHealthHistory} disabled={isLoading}
              onChange={event => { setUseHealthHistory(event.target.checked); setSessionId(''); setMessages([]); }} />
            Use my health history (requires consent)
          </label>
          {handoffStatus && <span role="status" className="text-xs">Consultation: {handoffStatus}</span>}
          <Button type="button" variant="ghost" onClick={() => navigate('/appointments')}>Manage reminders</Button>
          {/* Clear chat */}
          {messages.length > 1 && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              title="Clear conversation"
              onClick={async () => {
                const cleared = await drIshaAPI.clearSession(sessionId);
                if (!cleared.success) { toast.error("Could not clear server history. Please try again."); return; }
                const newSid = drIshaAPI.startNewSession();
                setSessionId(newSid);
                setMessages([]);
                try { localStorage.removeItem('dr_isha_session'); } catch { /* clearing browser storage is best-effort */ }
                setSuggestedFollowUps(["Tell me more","What should I do?","Is this serious?","Home remedies?","When to see a doctor?"]);
              }}
              className="flex-shrink-0 text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
          
          <Button 
            type="submit" 
            disabled={isLoading || !input.trim()}
            className="hover:scale-105 transition-transform"
          >
            <Send className="w-4 h-4 mr-2" />
            Send
          </Button>
        </form>
      </motion.div>
    </Card>
  );
};

export default DrISHAChat;
