import "regenerator-runtime/runtime";
import { useRef, useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Bot, Send, User, Mic, MicOff, Paperclip, Stethoscope, Heart, ThermometerSun, Pill, Activity, Globe2, AlertTriangle, X, FileText, Image as ImageIcon, Volume2, VolumeX, Loader2, RotateCcw } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useAuth } from '@/auth/AuthProvider';
import { orchestratorAPI } from '@/services/orchestrator';
import api from "@/utils/api";

// Auth helper
const getAuthToken = () => localStorage.getItem('token');
const PROMPT_USAGE_STORAGE_KEY = 'ai_doctor_prompt_usage_v1';
const LATENCY_METRICS_STORAGE_KEY = 'ai_doctor_latency_metrics_v1';

// Types
interface Language {
  code: string;
  name: string;
  flag: string;
  rtl?: boolean;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  language?: string;
  id?: string;
}

interface Symptom {
  id: string;
  label: string;
  icon: string;
  description: string;
}

// Languages
const languages: Language[] = [
  { code: 'en', name: 'English', flag: '🇺🇸' },
  { code: 'es', name: 'Español', flag: '🇪🇸' },
  { code: 'hi', name: 'हिंदी', flag: '🇮🇳' },
  { code: 'ar', name: 'العربية', flag: '🇸🇦', rtl: true },
  { code: 'zh', name: '中文', flag: '🇨🇳' },
];

// Translations
const translations: Record<string, Record<string, string>> = {
  en: {
    title: "Dr. iSHA",
    subtitle: "Your AI Health Assistant",
    placeholder: "Describe your symptoms or ask a health question...",
    send: "Send",
    greeting: "Hello! I'm Dr. iSHA, your personal AI health assistant. How can I help you today?",
    quickActions: "Quick Actions",
    symptoms: "Check Symptoms",
    wellness: "General Wellness",
    medications: "Medication Info",
    emergency: "Emergency Signs",
    clearChat: "New Chat",
    whatICanHelpWith: "What I can help with",
    capability1: "Symptom triage and risk signals",
    capability2: "Medication and interaction guidance",
    capability3: "Wellness coaching and prevention",
    suggestedPrompts: "Try one of these",
    prompt1: "I have fever and cough for 2 days. What should I do?",
    prompt2: "Can you help me understand my blood test report?",
    prompt3: "Is it safe to take paracetamol with my current meds?",
    prompt4: "What are red-flag symptoms for chest pain?",
  },
  es: {
    title: "Dr. iSHA",
    subtitle: "Tu Asistente de Salud IA",
    placeholder: "Describe tus síntomas o haz una pregunta de salud...",
    send: "Enviar",
    greeting: "¡Hola! Soy Dr. iSHA, tu asistente de salud personal. ¿En qué puedo ayudarte hoy?",
    quickActions: "Acciones Rápidas",
    symptoms: "Verificar Síntomas",
    wellness: "Bienestar General",
    medications: "Info Medicamentos",
    emergency: "Signos de Emergencia",
    clearChat: "Nuevo Chat",
    whatICanHelpWith: "En qué puedo ayudarte",
    capability1: "Triaje de síntomas y señales de riesgo",
    capability2: "Guía de medicamentos e interacciones",
    capability3: "Bienestar y prevención",
    suggestedPrompts: "Prueba una de estas",
    prompt1: "Tengo fiebre y tos desde hace 2 días. ¿Qué debo hacer?",
    prompt2: "¿Puedes ayudarme a entender mi análisis de sangre?",
    prompt3: "¿Es seguro tomar paracetamol con mis medicamentos actuales?",
    prompt4: "¿Cuáles son síntomas de alarma en dolor de pecho?",
  },
  hi: {
    title: "डॉ. iSHA",
    subtitle: "आपका AI स्वास्थ्य सहायक",
    placeholder: "अपने लक्षण बताएं या स्वास्थ्य प्रश्न पूछें...",
    send: "भेजें",
    greeting: "नमस्ते! मैं डॉ. iSHA हूं, आपका व्यक्तिगत AI स्वास्थ्य सहायक। आज मैं आपकी कैसे मदद कर सकती हूं?",
    quickActions: "त्वरित कार्य",
    symptoms: "लक्षण जांचें",
    wellness: "सामान्य कल्याण",
    medications: "दवा जानकारी",
    emergency: "आपातकालीन संकेत",
    clearChat: "नई चैट",
    whatICanHelpWith: "मैं किसमें मदद कर सकती हूं",
    capability1: "लक्षण ट्रायज और जोखिम संकेत",
    capability2: "दवा और इंटरैक्शन मार्गदर्शन",
    capability3: "वेलनेस और रोकथाम सलाह",
    suggestedPrompts: "इनमें से एक चुनें",
    prompt1: "मुझे 2 दिनों से बुखार और खांसी है। क्या करूं?",
    prompt2: "क्या आप मेरी ब्लड टेस्ट रिपोर्ट समझा सकती हैं?",
    prompt3: "क्या मेरी मौजूदा दवाओं के साथ पैरासिटामोल सुरक्षित है?",
    prompt4: "सीने में दर्द के खतरनाक संकेत क्या हैं?",
  },
  ar: {
    title: "د. iSHA",
    subtitle: "مساعدك الصحي الذكي",
    placeholder: "صف أعراضك أو اطرح سؤالاً صحياً...",
    send: "إرسال",
    greeting: "مرحبا! أنا د. iSHA، مساعدك الصحي الشخصي. كيف يمكنني مساعدتك اليوم؟",
    quickActions: "إجراءات سريعة",
    symptoms: "فحص الأعراض",
    wellness: "العافية العامة",
    medications: "معلومات الأدوية",
    emergency: "علامات الطوارئ",
    clearChat: "محادثة جديدة",
    whatICanHelpWith: "كيف يمكنني المساعدة",
    capability1: "فرز الأعراض وإشارات الخطر",
    capability2: "إرشادات الأدوية والتداخلات",
    capability3: "العافية والوقاية",
    suggestedPrompts: "جرّب أحد هذه",
    prompt1: "لدي حمى وسعال منذ يومين. ماذا أفعل؟",
    prompt2: "هل يمكنك مساعدتي في فهم تحليل الدم؟",
    prompt3: "هل من الآمن تناول الباراسيتامول مع أدويتي الحالية؟",
    prompt4: "ما علامات الخطر لألم الصدر؟",
  },
  zh: {
    title: "iSHA医生",
    subtitle: "您的AI健康助手",
    placeholder: "描述您的症状或提出健康问题...",
    send: "发送",
    greeting: "您好！我是iSHA医生，您的个人AI健康助手。今天我能帮您什么？",
    quickActions: "快速操作",
    symptoms: "检查症状",
    wellness: "一般健康",
    medications: "药物信息",
    emergency: "紧急情况",
    clearChat: "新对话",
    whatICanHelpWith: "我可以帮你什么",
    capability1: "症状分诊与风险信号",
    capability2: "用药与相互作用建议",
    capability3: "健康管理与预防建议",
    suggestedPrompts: "试试这些问题",
    prompt1: "我发烧咳嗽两天了，我该怎么办？",
    prompt2: "你可以帮我看懂血液检查报告吗？",
    prompt3: "我现在的药物下服用对乙酰氨基酚安全吗？",
    prompt4: "胸痛的危险信号有哪些？",
  },
};

// Common symptoms for quick selection
const commonSymptoms: Record<string, Symptom[]> = {
  en: [
    { id: 'headache', label: 'Headache', icon: '🤕', description: 'Pain in head region' },
    { id: 'fever', label: 'Fever', icon: '🤒', description: 'Elevated body temperature' },
    { id: 'cough', label: 'Cough', icon: '😷', description: 'Persistent coughing' },
    { id: 'fatigue', label: 'Fatigue', icon: '😴', description: 'Feeling tired or weak' },
    { id: 'nausea', label: 'Nausea', icon: '🤢', description: 'Feeling sick or queasy' },
    { id: 'pain', label: 'Body Pain', icon: '💪', description: 'Muscle or joint pain' },
    { id: 'breathing', label: 'Breathing Issues', icon: '🫁', description: 'Difficulty breathing' },
    { id: 'stomach', label: 'Stomach Issues', icon: '🤰', description: 'Digestive problems' },
  ],
  es: [
    { id: 'headache', label: 'Dolor de cabeza', icon: '🤕', description: 'Dolor en la región de la cabeza' },
    { id: 'fever', label: 'Fiebre', icon: '🤒', description: 'Temperatura corporal elevada' },
    { id: 'cough', label: 'Tos', icon: '😷', description: 'Tos persistente' },
    { id: 'fatigue', label: 'Fatiga', icon: '😴', description: 'Sensación de cansancio' },
    { id: 'nausea', label: 'Náuseas', icon: '🤢', description: 'Sensación de malestar' },
    { id: 'pain', label: 'Dolor corporal', icon: '💪', description: 'Dolor muscular o articular' },
    { id: 'breathing', label: 'Problemas respiratorios', icon: '🫁', description: 'Dificultad para respirar' },
    { id: 'stomach', label: 'Problemas estomacales', icon: '🤰', description: 'Problemas digestivos' },
  ],
  hi: [
    { id: 'headache', label: 'सिरदर्द', icon: '🤕', description: 'सिर में दर्द' },
    { id: 'fever', label: 'बुखार', icon: '🤒', description: 'शरीर का तापमान बढ़ना' },
    { id: 'cough', label: 'खांसी', icon: '😷', description: 'लगातार खांसी' },
    { id: 'fatigue', label: 'थकान', icon: '😴', description: 'थकान या कमजोरी' },
    { id: 'nausea', label: 'मतली', icon: '🤢', description: 'उबकाई आना' },
    { id: 'pain', label: 'शरीर में दर्द', icon: '💪', description: 'मांसपेशियों या जोड़ों में दर्द' },
    { id: 'breathing', label: 'सांस की समस्या', icon: '🫁', description: 'सांस लेने में कठिनाई' },
    { id: 'stomach', label: 'पेट की समस्या', icon: '🤰', description: 'पाचन संबंधी समस्या' },
  ],
};

const AiDoctor = () => {
  // State
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [currentLanguage, setCurrentLanguage] = useState<Language>(languages[0]);
  const [showSymptomDialog, setShowSymptomDialog] = useState(false);
  const [selectedSymptoms, setSelectedSymptoms] = useState<string[]>([]);
  const [isListening, setIsListening] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const [isTTSLoading, setIsTTSLoading] = useState(false);
  const [loadingElapsedSeconds, setLoadingElapsedSeconds] = useState(0);
  const [sessionPromptClicks, setSessionPromptClicks] = useState(0);
  const [sessionMessagesSent, setSessionMessagesSent] = useState(0);
  
  // Refs
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recognitionRef = useRef<any>(null);
  const metricsSessionIdRef = useRef(`ai_doc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);

  // Auth
  const { currentUser } = useAuth();

  // Check authentication on mount
  useEffect(() => {
    const token = getAuthToken();
    if (!token && !currentUser) {
      toast.error('Please log in to use Dr. iSHA', {
        description: 'You need to be logged in to access the AI Health Assistant',
        duration: 5000
      });
      // Redirect to login after a short delay
      setTimeout(() => {
        window.location.href = '/login?redirect=/ai-doctor';
      }, 2000);
    }
  }, [currentUser]);

  // Translation helper
  const t = (key: string) => {
    return translations[currentLanguage.code]?.[key] || translations.en[key] || key;
  };

  // Get symptoms for current language
  const getSymptoms = () => commonSymptoms[currentLanguage.code] || commonSymptoms.en;

  const getPromptUsageMap = () => {
    try {
      const raw = localStorage.getItem(PROMPT_USAGE_STORAGE_KEY);
      if (!raw) return {} as Record<string, number>;
      const parsed = JSON.parse(raw);
      return typeof parsed === 'object' && parsed !== null ? parsed as Record<string, number> : {};
    } catch {
      return {} as Record<string, number>;
    }
  };

  const trackPromptClick = (prompt: string) => {
    try {
      const usage = getPromptUsageMap();
      usage[prompt] = (usage[prompt] || 0) + 1;
      localStorage.setItem(PROMPT_USAGE_STORAGE_KEY, JSON.stringify(usage));
    } catch {
      // Ignore localStorage failures and keep UX responsive.
    }
    setSessionPromptClicks((prev) => prev + 1);
  };

  const emitMetric = useCallback(async (eventType: string, payload: Record<string, any> = {}, latencyMs?: number) => {
    try {
      const auth = getAuthToken();
      if (!auth) return;

      await api.post(
        '/ai/ai-doctor/metrics',
        {
          eventType,
          sessionId: metricsSessionIdRef.current,
          language: currentLanguage.code,
          pagePath: '/ai-doctor',
          latencyMs: typeof latencyMs === 'number' ? latencyMs : null,
          payload,
        },
        {
          headers: { Authorization: `Bearer ${auth}` },
        }
      );
    } catch {
      // Telemetry should never block UX.
    }
  }, [currentLanguage.code]);

  const trackLatencyMetric = (latencyMs: number) => {
    try {
      const raw = localStorage.getItem(LATENCY_METRICS_STORAGE_KEY);
      const current = raw ? JSON.parse(raw) : {};
      const count = Number(current.count || 0) + 1;
      const totalMs = Number(current.totalMs || 0) + latencyMs;
      const minMs = current.minMs ? Math.min(Number(current.minMs), latencyMs) : latencyMs;
      const maxMs = current.maxMs ? Math.max(Number(current.maxMs), latencyMs) : latencyMs;

      localStorage.setItem(
        LATENCY_METRICS_STORAGE_KEY,
        JSON.stringify({
          count,
          totalMs,
          minMs,
          maxMs,
          avgMs: Math.round(totalMs / count),
          lastMs: latencyMs,
          updatedAt: Date.now(),
        })
      );
    } catch {
      // Ignore localStorage failures and keep UX responsive.
    }
  };

  const getSuggestedPrompts = () => {
    const basePrompts = [
      t('prompt1'),
      t('prompt2'),
      t('prompt3'),
      t('prompt4'),
    ];

    const usage = getPromptUsageMap();
    return [...basePrompts].sort((a, b) => (usage[b] || 0) - (usage[a] || 0));
  };

  const getLoadingStatus = () => {
    if (loadingElapsedSeconds < 4) return 'Looking into your question...';
    if (loadingElapsedSeconds < 8) return 'Analyzing your symptoms...';
    return 'Almost ready...';
  };

  const promptAssistRate = sessionMessagesSent > 0
    ? Math.round((sessionPromptClicks / sessionMessagesSent) * 100)
    : 0;

  useEffect(() => {
    if (!isLoading) {
      setLoadingElapsedSeconds(0);
      return;
    }

    const timer = window.setInterval(() => {
      setLoadingElapsedSeconds((prev) => prev + 1);
    }, 1000);

    return () => window.clearInterval(timer);
  }, [isLoading]);

  // Scroll to bottom when messages change
  useEffect(() => {
    if (scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  }, [messages]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      window.speechSynthesis?.cancel();
    };
  }, []);

  // Voice recognition setup - Toggle on/off
  const toggleListening = useCallback(() => {
    // If already listening, stop
    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
      return;
    }

    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      toast.error('Voice recognition not supported in this browser');
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;
    
    recognition.lang = currentLanguage.code === 'en' ? 'en-US' : 
                       currentLanguage.code === 'es' ? 'es-ES' :
                       currentLanguage.code === 'hi' ? 'hi-IN' :
                       currentLanguage.code === 'ar' ? 'ar-SA' :
                       currentLanguage.code === 'zh' ? 'zh-CN' : 'en-US';
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onstart = () => {
      setIsListening(true);
      toast.success('🎤 Listening... Speak now');
    };
    
    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
    };
    
    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      setIsListening(false);
      recognitionRef.current = null;
      if (event.error !== 'aborted' && event.error !== 'no-speech') {
        toast.error('Voice recognition error: ' + event.error);
      }
    };
    
    recognition.onresult = (event: any) => {
      let finalTranscript = '';
      let interimTranscript = '';
      
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }
      
      if (finalTranscript) {
        setInput(prev => (prev + ' ' + finalTranscript).trim());
      }
    };

    try {
      recognition.start();
    } catch (error) {
      console.error('Failed to start recognition:', error);
      toast.error('Failed to start voice recognition');
    }
  }, [currentLanguage, isListening]);

  // Text-to-Speech function with ElevenLabs
  const speakMessage = async (messageId: string, text: string) => {
    // If already speaking this message, stop it
    if (speakingMessageId === messageId) {
      stopSpeaking();
      return;
    }

    // Stop any current speech
    stopSpeaking();
    
    setSpeakingMessageId(messageId);
    setIsTTSLoading(true);

    try {
      const auth = getAuthToken();

      // Create AbortController with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 25000); // 25s timeout

      let response;
      try {
        response = await api.post(
          '/ai/text-to-speech',
          { text },
          {
            headers: auth ? { Authorization: `Bearer ${auth}` } : undefined,
            signal: controller.signal
          }
        );
      } finally {
        clearTimeout(timeoutId);
      }

      const data = response.data;

      if (data.status === 'success' && data.audio) {
        // Play ElevenLabs audio
        const audioBlob = new Blob(
          [Uint8Array.from(atob(data.audio), c => c.charCodeAt(0))],
          { type: 'audio/mpeg' }
        );
        const audioUrl = URL.createObjectURL(audioBlob);
        
        audioRef.current = new Audio(audioUrl);
        audioRef.current.onended = () => {
          setSpeakingMessageId(null);
          URL.revokeObjectURL(audioUrl);
        };
        audioRef.current.onerror = () => {
          console.error('Audio playback error');
          setSpeakingMessageId(null);
          fallbackBrowserTTS(text);
        };
        
        setIsTTSLoading(false);
        await audioRef.current.play();
      } else {
        // Fallback to browser TTS
        setIsTTSLoading(false);
        fallbackBrowserTTS(text);
      }
    } catch (error) {
      console.error('TTS error:', error);
      setIsTTSLoading(false);
      fallbackBrowserTTS(text);
    }
  };

  // Fallback browser TTS
  const fallbackBrowserTTS = (text: string) => {
    if (!window.speechSynthesis) {
      toast.error('Text-to-speech not supported');
      setSpeakingMessageId(null);
      return;
    }

    // Clean text for TTS
    const cleanText = text
      .replace(/[#*_~`]/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/\n{2,}/g, '. ')
      .replace(/\n/g, ' ')
      .trim();

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.rate = 0.9;
    utterance.pitch = 1.0;
    utterance.volume = 0.8;

    // Try to set a good voice
    const voices = window.speechSynthesis.getVoices();
    const preferredVoice = voices.find(v => 
      v.lang.startsWith(currentLanguage.code) && v.name.includes('Female')
    ) || voices.find(v => v.lang.startsWith(currentLanguage.code)) || voices[0];
    
    if (preferredVoice) {
      utterance.voice = preferredVoice;
    }

    utterance.onend = () => setSpeakingMessageId(null);
    utterance.onerror = () => {
      console.error('Browser TTS error');
      setSpeakingMessageId(null);
    };

    window.speechSynthesis.speak(utterance);
  };

  // Stop speaking
  const stopSpeaking = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    window.speechSynthesis?.cancel();
    setSpeakingMessageId(null);
    setIsTTSLoading(false);
  };

  // Handle file upload
  const handleFileUpload = (file: File) => {
    const validTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      toast.error('Please upload a PDF or image file');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('File size should be less than 10MB');
      return;
    }
    setUploadedFile(file);
    toast.success('File "' + file.name + '" attached');
  };

  // Handle symptom selection
  const handleSymptomSelect = (symptomId: string) => {
    setSelectedSymptoms(prev => 
      prev.includes(symptomId) 
        ? prev.filter(id => id !== symptomId)
        : [...prev, symptomId]
    );
  };

  // Submit symptoms
  const submitSymptoms = () => {
    const symptoms = getSymptoms();
    const selectedLabels = selectedSymptoms
      .map(id => symptoms.find(s => s.id === id)?.label)
      .filter(Boolean)
      .join(', ');
    
    if (selectedLabels) {
      setInput("I'm experiencing: " + selectedLabels);
      setShowSymptomDialog(false);
      setSelectedSymptoms([]);
    }
  };

  // Quick action handler
  const handleQuickAction = (action: string) => {
    const prompts: Record<string, string> = {
      symptoms: "I'd like to check my symptoms. Can you help me understand what might be wrong?",
      wellness: "Can you give me some general wellness and health tips?",
      medications: "I need information about my medications and possible interactions.",
      emergency: "What are the warning signs that I should seek emergency medical care?",
    };
    setInput(prompts[action] || '');
    inputRef.current?.focus();
  };

  const startNewChat = () => {
    stopSpeaking();
    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
    }
    setMessages([]);
    setInput("");
    setUploadedFile(null);
    setSelectedSymptoms([]);
    setShowSymptomDialog(false);
    void emitMetric('new_chat', { hadMessages: messages.length > 0 });
    toast.success('Started a new chat');
  };

  // Submit message
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const messageText = input.trim();
    if (!messageText && !uploadedFile) return;

    const auth = getAuthToken();
    if (!auth) {
      toast.error('Authentication required', {
        description: 'Please log in to continue using Dr. iSHA',
        action: {
          label: 'Login',
          onClick: () => window.location.href = '/login?redirect=/ai-doctor'
        }
      });
      return;
    }

    // Stop listening when sending
    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
    }

    // Create user message with unique ID
    const userMessage: Message = {
      role: "user",
      content: uploadedFile 
        ? messageText + "\n\n📎 Attached: " + uploadedFile.name
        : messageText,
      language: currentLanguage.code,
      id: 'user_' + Date.now()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput("");
    setUploadedFile(null);
    setSessionMessagesSent((prev) => prev + 1);
    const requestStart = Date.now();
    void emitMetric('message_submit', {
      messageLength: messageText.length,
      hasAttachment: !!uploadedFile,
      promptAssistClicks: sessionPromptClicks,
    });
    setLoadingElapsedSeconds(0);
    setIsLoading(true);

    try {
      // Use orchestrator for medical consultation
      const response = await orchestratorAPI.consult(
        messageText,
        currentLanguage.code,
        {
          hasAttachment: !!uploadedFile,
          attachmentName: uploadedFile?.name
        }
      );

      if (response.success && response.data?.primary_response) {
        const latencyMs = Date.now() - requestStart;
        trackLatencyMetric(latencyMs);
        void emitMetric('response_success', {
          responseLength: response.data.primary_response.length,
        }, latencyMs);

        const messageId = 'assistant_' + Date.now();
        const assistantMessage: Message = {
          role: "assistant",
          content: response.data.primary_response,
          language: currentLanguage.code,
          id: messageId
        };
        setMessages(prev => [...prev, assistantMessage]);
      } else {
        // Check if authentication error
        if (response.status === 401 || response.error?.requiresLogin) {
          toast.error('Session expired', {
            description: 'Please log in again to continue',
            action: {
              label: 'Login',
              onClick: () => window.location.href = '/login?redirect=/ai-doctor'
            },
            duration: 10000
          });
          return;
        }
        
        // Handle error response - don't render undefined
        const errorMsg = response.error?.message || response.error || 'Unknown error';
        console.error('❌ Dr. iSHA error:', errorMsg);
        
        throw new Error(typeof errorMsg === 'string' ? errorMsg : JSON.stringify(errorMsg));
      }
    } catch (error) {
      console.error('AI request error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const latencyMs = Date.now() - requestStart;
      void emitMetric('response_error', {
        message: errorMessage.slice(0, 240),
      }, latencyMs);
      
      // Check if it's an authentication error
      if (error.response?.status === 401 || errorMessage.includes('token')) {
        toast.error('Session expired', {
          description: 'Please log in again to continue',
          action: {
            label: 'Login',
            onClick: () => window.location.href = '/login?redirect=/ai-doctor'
          }
        });
        return;
      }
      
      toast.error(`Failed to get response: ${errorMessage}`, {
        description: 'The AI assistant is temporarily unavailable. Please try again.',
        duration: 5000
      });
      
      // Add error message to chat with helpful text
      const errorText = errorMessage.includes('Network') 
        ? `I apologize, but I'm having trouble connecting right now. Please check your internet connection and try again. If you're experiencing a medical emergency, please call emergency services immediately.`
        : `I apologize, but I'm having trouble processing your request right now. Please try again in a moment. If you're experiencing a medical emergency, please call emergency services immediately.`;

      setMessages(prev => [...prev, {
        role: "assistant",
        content: errorText,
        language: currentLanguage.code,
        id: 'error_' + Date.now()
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
      <div className="h-[calc(100vh-4rem)] min-h-[620px] w-full bg-[radial-gradient(circle_at_top,_rgba(20,184,166,0.12),_transparent_45%),linear-gradient(180deg,_#f8fafc_0%,_#eef6f7_100%)] dark:bg-[radial-gradient(circle_at_top,_rgba(45,212,191,0.12),_transparent_45%),linear-gradient(180deg,_#0f172a_0%,_#111827_100%)]">
        <div className="mx-auto h-full w-full max-w-5xl px-2 py-2 md:px-4 md:py-4">
          <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-teal-100/70 bg-white/90 shadow-[0_24px_80px_-40px_rgba(15,23,42,0.45)] backdrop-blur dark:border-slate-700 dark:bg-slate-900/80">
        {/* Header - Fixed at top */}
        <div className="flex-shrink-0 border-b border-slate-200/80 bg-white/80 px-3 py-3 backdrop-blur-sm dark:border-slate-700 dark:bg-slate-800/80 md:px-5 md:py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-teal-500 to-emerald-500 flex items-center justify-center shadow-lg md:h-12 md:w-12">
                <Stethoscope className="h-5 w-5 text-white md:h-6 md:w-6" />
              </div>
              <div>
                <h1 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-white md:text-xl">{t('title')}</h1>
                <p className="text-xs text-slate-600 dark:text-slate-300 md:text-sm">{t('subtitle')}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {messages.length > 0 && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    className="hidden gap-1.5 border-slate-200 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600 md:inline-flex"
                    onClick={startNewChat}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    <span>{t('clearChat')}</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label={t('clearChat')}
                    className="h-8 w-8 border-slate-200 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600 md:hidden"
                    onClick={startNewChat}
                  >
                    <RotateCcw className="h-4 w-4" />
                  </Button>
                </>
              )}

              <span className="hidden rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700 dark:border-emerald-700/60 dark:bg-emerald-900/20 dark:text-emerald-300 md:inline-flex">
                AI Assistant Active
              </span>

              {/* Language Selector */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2 border-slate-200 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600">
                    <Globe2 className="h-4 w-4" />
                    <span>{currentLanguage.flag}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="bg-white border-slate-200 dark:bg-slate-800 dark:border-slate-700">
                  {languages.map((lang) => (
                    <DropdownMenuItem
                      key={lang.code}
                      onClick={() => setCurrentLanguage(lang)}
                      className="gap-2"
                    >
                      <span>{lang.flag}</span>
                      <span>{lang.name}</span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-900 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-200 md:text-xs">
            <span>For urgent concerns, call emergency services. This assistant is for guidance only.</span>
            <a href="/doctors" className="shrink-0 font-semibold underline underline-offset-2 hover:no-underline">
              See a real doctor →
            </a>
          </div>

          <div className="mt-2 hidden md:flex flex-wrap items-center gap-1.5 text-[11px] md:text-xs">
            <span className="font-medium text-slate-700 dark:text-slate-300">{t('whatICanHelpWith')}:</span>
            <span className="rounded-full bg-teal-50 px-2 py-1 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300">{t('capability1')}</span>
            <span className="rounded-full bg-teal-50 px-2 py-1 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300">{t('capability2')}</span>
            <span className="rounded-full bg-teal-50 px-2 py-1 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300">{t('capability3')}</span>
          </div>
        </div>

        {/* Chat Area - Fills remaining space */}
        <div className="flex-1 overflow-hidden flex flex-col">
          <ScrollArea className="flex-1 h-0 px-3 py-3 md:px-5" ref={scrollAreaRef}>
            {/* Welcome Message */}
            {messages.length === 0 && (
              <div className="min-h-full flex flex-col items-center justify-center py-6 px-1 md:px-2">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-center w-full max-w-xl"
                >
                  <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-100 to-emerald-100 dark:from-teal-500/20 dark:to-emerald-500/20 md:mb-6 md:h-20 md:w-20">
                    <Heart className="h-8 w-8 text-teal-600 animate-pulse dark:text-teal-400 md:h-10 md:w-10" />
                  </div>
                  
                  <h2 className="mb-2 text-xl font-semibold tracking-tight text-slate-900 dark:text-white md:text-3xl">{t('title')}</h2>
                  <p className="mx-auto mb-6 max-w-2xl text-sm leading-relaxed text-slate-600 dark:text-slate-300 md:text-base">{t('greeting')}</p>
                  
                  {/* Quick Actions */}
                  <p className="mb-2 text-xs font-medium uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">{t('quickActions')}</p>
                  <div className="grid grid-cols-2 gap-2 md:grid-cols-4 md:gap-3">
                    <Button
                      variant="outline"
                      className="h-auto rounded-xl py-3 md:py-4 flex flex-col items-center gap-1 md:gap-2 bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:bg-teal-50 dark:hover:bg-teal-900/20 hover:border-teal-300 dark:hover:border-teal-600 text-slate-700 dark:text-slate-200"
                      onClick={() => handleQuickAction('symptoms')}
                    >
                      <ThermometerSun className="h-4 w-4 md:h-5 md:w-5 text-orange-500" />
                      <span className="text-xs md:text-sm">{t('symptoms')}</span>
                    </Button>
                    <Button
                      variant="outline"
                      className="h-auto rounded-xl py-3 md:py-4 flex flex-col items-center gap-1 md:gap-2 bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:bg-teal-50 dark:hover:bg-teal-900/20 hover:border-teal-300 dark:hover:border-teal-600 text-slate-700 dark:text-slate-200"
                      onClick={() => handleQuickAction('wellness')}
                    >
                      <Activity className="h-4 w-4 md:h-5 md:w-5 text-teal-500" />
                      <span className="text-xs md:text-sm">{t('wellness')}</span>
                    </Button>
                    <Button
                      variant="outline"
                      className="h-auto rounded-xl py-3 md:py-4 flex flex-col items-center gap-1 md:gap-2 bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:bg-teal-50 dark:hover:bg-teal-900/20 hover:border-teal-300 dark:hover:border-teal-600 text-slate-700 dark:text-slate-200"
                      onClick={() => handleQuickAction('medications')}
                    >
                      <Pill className="h-4 w-4 md:h-5 md:w-5 text-teal-600" />
                      <span className="text-xs md:text-sm">{t('medications')}</span>
                    </Button>
                    <Button
                      variant="outline"
                      className="h-auto rounded-xl py-3 md:py-4 flex flex-col items-center gap-1 md:gap-2 bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:bg-teal-50 dark:hover:bg-teal-900/20 hover:border-teal-300 dark:hover:border-teal-600 text-slate-700 dark:text-slate-200"
                      onClick={() => handleQuickAction('emergency')}
                    >
                      <AlertTriangle className="h-4 w-4 md:h-5 md:w-5 text-red-500" />
                      <span className="text-xs md:text-sm">{t('emergency')}</span>
                    </Button>
                  </div>
                </motion.div>
              </div>
            )}

            {/* Messages */}
            <div className="mx-auto max-w-3xl space-y-3 md:space-y-4">
              <AnimatePresence>
                {messages.map((message, index) => (
                  <motion.div
                    key={message.id || index}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2 }}
                    className={cn(
                      "flex gap-2 md:gap-3",
                      message.role === "user" ? "flex-row-reverse" : "flex-row"
                    )}
                  >
                    {/* Avatar */}
                    <div className={cn(
                      "w-7 h-7 md:w-8 md:h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-1",
                      message.role === "user" 
                        ? "bg-teal-500 text-white" 
                        : "bg-gradient-to-br from-teal-500 to-teal-600 text-white"
                    )}>
                      {message.role === "user" ? (
                        <User className="w-3.5 h-3.5 md:w-4 md:h-4" />
                      ) : (
                        <Bot className="w-3.5 h-3.5 md:w-4 md:h-4" />
                      )}
                    </div>

                    {/* Message Bubble */}
                    <div className="flex flex-col gap-1 max-w-[85%] md:max-w-[80%]">
                      <div className={cn(
                        "rounded-2xl px-3 py-2.5 md:px-4 md:py-3",
                        message.role === "user"
                          ? "bg-teal-500 text-white rounded-tr-sm"
                          : "bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 rounded-tl-sm"
                      )}>
                        {message.role === "assistant" ? (
                          <div className="prose prose-sm dark:prose-invert max-w-none text-sm md:text-base">
                            {(() => {
                              const safeContent =
                                typeof message.content === 'string' && message.content.trim().length > 0
                                  ? message.content
                                  : "I'm here to help with your symptoms. Please try asking again or describe how you're feeling.";
                              return (
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                  {safeContent}
                                </ReactMarkdown>
                              );
                            })()}
                          </div>
                        ) : (
                          (() => {
                            const safeContent =
                              typeof message.content === 'string' && message.content.trim().length > 0
                                ? message.content
                                : '...';
                            return (
                              <p className="text-sm md:text-base whitespace-pre-wrap">{safeContent}</p>
                            );
                          })()
                        )}
                      </div>
                      
                      {/* Speaker button for assistant messages */}
                      {message.role === "assistant" && message.id && (
                        <div className="flex items-center gap-1 pl-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className={cn(
                              "h-6 w-6 p-0 rounded-full text-slate-500 dark:text-slate-400 hover:text-teal-600 dark:hover:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-900/20",
                              speakingMessageId === message.id && "text-teal-500 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/20"
                            )}
                            onClick={() => speakMessage(message.id!, message.content)}
                            disabled={isTTSLoading && speakingMessageId !== message.id}
                          >
                            {isTTSLoading && speakingMessageId === message.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : speakingMessageId === message.id ? (
                              <VolumeX className="h-3.5 w-3.5" />
                            ) : (
                              <Volume2 className="h-3.5 w-3.5" />
                            )}
                          </Button>
                          <span className="text-xs text-slate-500 dark:text-slate-400">
                            {speakingMessageId === message.id ? 'Stop' : 'Listen'}
                          </span>
                        </div>
                      )}
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>

              {/* Loading Indicator */}
              {isLoading && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex gap-2 md:gap-3"
                >
                  <div className="w-7 h-7 md:w-8 md:h-8 rounded-full bg-gradient-to-br from-teal-500 to-teal-600 flex items-center justify-center">
                    <Bot className="w-3.5 h-3.5 md:w-4 md:h-4 text-white" />
                  </div>
                  <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl rounded-tl-sm px-3 py-2 md:px-4 md:py-3">
                    <div className="flex gap-1">
                      <span className="w-2 h-2 bg-teal-500 dark:bg-teal-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-2 h-2 bg-teal-500 dark:bg-teal-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-2 h-2 bg-teal-500 dark:bg-teal-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                    <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">
                      {getLoadingStatus()} {loadingElapsedSeconds > 0 ? `(${loadingElapsedSeconds}s)` : ''}
                    </p>
                  </div>
                </motion.div>
              )}
            </div>
          </ScrollArea>

          {/* Input Area - Fixed at bottom */}
          <div className="flex-shrink-0 border-t border-slate-200/80 bg-white/90 px-3 py-3 backdrop-blur-sm dark:border-slate-700 dark:bg-slate-800/90 md:px-5 md:py-4">
            {/* Attached File Preview */}
            {uploadedFile && (
              <div className="mb-2 flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 dark:bg-slate-700/50">
                {uploadedFile.type.startsWith('image/') ? (
                  <ImageIcon className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                ) : (
                  <FileText className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                )}
                <span className="text-sm flex-1 truncate text-slate-700 dark:text-slate-300">{uploadedFile.name}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                  onClick={() => setUploadedFile(null)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}

            <form onSubmit={handleSubmit} className="flex items-center gap-2 md:gap-3">
              {/* Action Buttons */}
              <div className="flex flex-shrink-0 gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Open symptom selector"
                  className="h-9 w-9 rounded-full text-slate-500 hover:bg-teal-50 hover:text-teal-600 dark:text-slate-400 dark:hover:bg-teal-900/20 dark:hover:text-teal-400 md:h-10 md:w-10"
                  onClick={() => setShowSymptomDialog(true)}
                >
                  <Activity className="h-4 w-4 md:h-5 md:w-5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Attach file"
                  className="h-9 w-9 rounded-full text-slate-500 hover:bg-teal-50 hover:text-teal-600 dark:text-slate-400 dark:hover:bg-teal-900/20 dark:hover:text-teal-400 md:h-10 md:w-10"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Paperclip className="h-4 w-4 md:h-5 md:w-5" />
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept=".pdf,image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileUpload(file);
                  }}
                />
              </div>

              {/* Text Input */}
              <div className="flex-1 relative min-w-0">
                <Input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={isListening ? "🎤 Listening..." : t('placeholder')}
                  disabled={isLoading}
                  className={cn(
                    "h-10 rounded-full border border-slate-200 bg-slate-100 pr-10 text-sm text-slate-800 placeholder:text-slate-400 focus-visible:border-teal-500 focus-visible:ring-1 focus-visible:ring-teal-500 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:placeholder:text-slate-500 md:pr-12",
                    currentLanguage.rtl && "text-right",
                    isListening && "border-red-500 ring-1 ring-red-500"
                  )}
                  dir={currentLanguage.rtl ? "rtl" : "ltr"}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={isListening ? "Stop voice input" : "Start voice input"}
                  className={cn(
                    "absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 rounded-full text-slate-500 transition-all hover:text-teal-600 dark:text-slate-400 dark:hover:text-teal-400 md:h-8 md:w-8",
                    isListening && "text-red-500 bg-red-500/10 animate-pulse"
                  )}
                  onClick={toggleListening}
                >
                  {isListening ? (
                    <MicOff className="h-3.5 w-3.5 md:h-4 md:w-4" />
                  ) : (
                    <Mic className="h-3.5 w-3.5 md:h-4 md:w-4" />
                  )}
                </Button>
              </div>

              {/* Send Button */}
              <Button
                type="submit"
                size="icon"
                aria-label="Send message"
                className="h-9 w-9 flex-shrink-0 rounded-full bg-teal-500 text-white hover:bg-teal-600 disabled:bg-slate-300 dark:disabled:bg-slate-600 md:h-10 md:w-10"
                disabled={isLoading || (!input.trim() && !uploadedFile)}
              >
                <Send className="h-4 w-4 md:h-5 md:w-5" />
              </Button>
            </form>

            {messages.length === 0 && !isLoading && (
              <div className="mt-2">
                <div className="mb-1">
                  <p className="text-[11px] font-medium text-slate-600 dark:text-slate-300 md:text-xs">{t('suggestedPrompts')}</p>
                </div>
                <div className="flex gap-1.5 overflow-x-auto pb-1">
                  {getSuggestedPrompts().map((prompt, idx) => (
                    <Button
                      key={idx}
                      type="button"
                      variant="outline"
                      className="h-auto whitespace-nowrap rounded-full border-slate-200 bg-white px-3 py-1.5 text-[11px] text-slate-700 hover:border-teal-300 hover:bg-teal-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:border-teal-600 dark:hover:bg-teal-900/20 md:text-xs"
                      onClick={() => {
                        trackPromptClick(prompt);
                        void emitMetric('prompt_click', {
                          prompt,
                          rank: idx + 1,
                        });
                        setInput(prompt);
                        inputRef.current?.focus();
                      }}
                    >
                      {prompt}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            <p className="mt-2 text-center text-[11px] text-slate-500 dark:text-slate-400 md:text-xs">
              Avoid sharing passwords or payment data. Press Enter to send.
            </p>
          </div>
        </div>

        {/* Symptom Selection Dialog */}
        <Dialog open={showSymptomDialog} onOpenChange={setShowSymptomDialog}>
          <DialogContent className="sm:max-w-md bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-slate-800 dark:text-white">
                <ThermometerSun className="h-5 w-5 text-orange-500" />
                {t('symptoms')}
              </DialogTitle>
              <DialogDescription className="text-slate-600 dark:text-slate-400">
                Select the symptoms you are experiencing
              </DialogDescription>
            </DialogHeader>
            
            <div className="grid grid-cols-2 gap-2 py-4">
              {getSymptoms().map((symptom) => (
                <Button
                  key={symptom.id}
                  variant={selectedSymptoms.includes(symptom.id) ? "default" : "outline"}
                  className={cn(
                    "h-auto py-3 flex flex-col items-center gap-1",
                    selectedSymptoms.includes(symptom.id)
                      ? "bg-teal-500 hover:bg-teal-600 text-white border-teal-500"
                      : "bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-teal-50 dark:hover:bg-teal-900/20 hover:border-teal-300 dark:hover:border-teal-600"
                  )}
                  onClick={() => handleSymptomSelect(symptom.id)}
                >
                  <span className="text-xl">{symptom.icon}</span>
                  <span className="text-xs">{symptom.label}</span>
                </Button>
              ))}
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowSymptomDialog(false)} className="border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700">
                Cancel
              </Button>
              <Button 
                onClick={submitSymptoms}
                disabled={selectedSymptoms.length === 0}
                className="bg-teal-500 hover:bg-teal-600 text-white disabled:bg-slate-300 dark:disabled:bg-slate-600"
              >
                Add Symptoms
              </Button>
            </div>
          </DialogContent>
        </Dialog>
          </div>
        </div>
      </div>
  );
};

export default AiDoctor;
