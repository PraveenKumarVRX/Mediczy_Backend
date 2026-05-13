import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Bot, Send, User, Mic, Volume2, AlertCircle, Clock, CheckCircle, XCircle } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { drIshaAPI } from '@/services/drIsha';

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  isTyping?: boolean;
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

export const DrISHAChat: React.FC<DrISHAChatProps> = ({
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
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const [sessionId, setSessionId] = useState<string>("");

  useEffect(() => {
    // Initialize session
    const newSessionId = drIshaAPI.startNewSession();
    setSessionId(newSessionId);

    // Add welcome message if enabled
    if (showWelcomeCard && welcomeMessage) {
      const welcomeMsg: Message = {
        id: `welcome-${Date.now()}`,
        role: "assistant",
        content: welcomeMessage,
        timestamp: new Date(),
        confidence: 1.0
      };
      setMessages([welcomeMsg]);
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

      // Get conversation history for context
      const conversationHistory = messages.slice(-5).map(msg => ({
        role: msg.role,
        content: msg.content
      }));

      // Consult Dr. iSHA
      const response = await drIshaAPI.consult(
        userMessage.content,
        language,
        {
          conversationHistory,
          sessionId,
          userAgent: 'Mediczy Web App'
        }
      );

      // Remove typing indicator
      setMessages(prev => prev.filter(msg => !msg.isTyping));

      if (response.success && response.data) {
        const assistantMessage: Message = {
          id: generateMessageId(),
          role: "assistant",
          content: response.data.response,
          timestamp: new Date(),
          confidence: response.data.confidence || 0.9,
          language: response.data.language
        };

        setMessages(prev => [...prev, assistantMessage]);

        // ===== INTELLIGENT INTENT HANDLING =====
        const response_data = response.data;

        // Handle Emergency Intent
        if (response_data.intentType === 'emergency') {
          toast.error('EMERGENCY DETECTED - Call emergency services immediately!', {
            duration: 5000
          });
          setTimeout(() => {
            navigate(response_data.redirectUrl || '/emergency');
          }, 2000);
        }
        // Handle Appointment Intent
        else if (response_data.intentType === 'appointment') {
          toast.success('Let me help you book an appointment!', {
            duration: 3000
          });
          setTimeout(() => {
            navigate(response_data.redirectUrl || '/patient/appointments');
          }, 1500);
        }
        // Handle Doctor Search Intent
        else if (response_data.intentType === 'doctor_search') {
          toast.info('Browse our network of doctors', {
            duration: 3000
          });
          setTimeout(() => {
            navigate(response_data.redirectUrl || '/patient/doctors');
          }, 1500);
        }
        // Handle Specialist Referral (Pregnancy, Mental Health, Pediatric)
        else if (response_data.intentType === 'pregnancy' ||
                 response_data.intentType === 'mental_health' ||
                 response_data.intentType === 'pediatric') {
          const specialistName = response_data.suggestedSpecialist || 'Specialist';
          toast.info(`Connecting you with a ${specialistName}`, {
            duration: 3000
          });
          setTimeout(() => {
            navigate(`/patient/doctors?specialty=${response_data.specialization || ''}`);
          }, 1500);
        }

        // Call onResponseReceived callback
        if (onResponseReceived) {
          onResponseReceived(assistantMessage);
        }

        // Optional: Text-to-speech for responses
        if (window.speechSynthesis && assistantMessage.content.length < 500) {
          // Speak short responses automatically
          const utterance = new SpeechSynthesisUtterance(assistantMessage.content);
          utterance.rate = 0.9;
          utterance.volume = 0.7;
          // window.speechSynthesis.speak(utterance);
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

  const getConfidenceColor = (confidence?: number) => {
    if (!confidence || confidence < 0.5) return "text-red-500";
    if (confidence < 0.8) return "text-yellow-500";
    return "text-green-500";
  };

  const getConfidenceIcon = (confidence?: number) => {
    if (!confidence || confidence < 0.5) return <XCircle className="w-3 h-3" />;
    if (confidence < 0.8) return <AlertCircle className="w-3 h-3" />;
    return <CheckCircle className="w-3 h-3" />;
  };

  return (
    <Card className={cn("flex flex-col bg-background/50 backdrop-blur-sm border-primary/20", className)}>
      <ScrollArea 
        className="flex-1 h-0 p-4 space-y-4" 
        style={{ maxHeight }}
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
                        {message.confidence !== undefined && (
                          <div className={cn(
                            "flex items-center gap-1",
                            getConfidenceColor(message.confidence)
                          )}>
                            {getConfidenceIcon(message.confidence)}
                            <span>{Math.round((message.confidence || 0) * 100)}%</span>
                          </div>
                        )}
                      </div>
                      
                      {/* Action buttons for assistant messages */}
                      {message.role === "assistant" && !message.isTyping && (
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 p-0"
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
            {[
              "Tell me more",
              "What should I do?",
              "Is this serious?",
              "Home remedies?",
              "When to see a doctor?",
            ].map((suggestion) => (
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
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={isListening ? "Listening..." : placeholder}
            disabled={isLoading || isListening}
            className="flex-1 bg-card/50 backdrop-blur-sm border-primary/20"
          />
          
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