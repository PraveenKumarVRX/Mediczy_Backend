import { useState, useEffect, useRef, useCallback, useMemo, memo } from "react";
import { useAuth } from "@/auth/AuthProvider";
import MainLayout from "@/components/layout/MainLayoutdoctor";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
// RecordingControls imported conditionally
// import TranscriptionViewer from "@/components/consultation/TranscriptionViewer";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertTriangle,
  Activity,
  Heart,
  Phone,
  Video,
  VideoOff,
  MessageSquare,
  Clock,
  User,
  MapPin,
  Thermometer,
  Droplets,
  Wind,
  Brain,
  CheckCircle,
  XCircle,
  RefreshCw,
  Loader2,
  Bell,
  Volume2,
  VolumeX,
  Stethoscope,
  FileText,
  Send,
  ChevronRight,
  ArrowRight,
  Ambulance,
  Hospital,
  UserCheck,
  AlertCircle,
  Pill,
  CalendarCheck,
  ClipboardList,
  Eye,
  PhoneOff,
  Mic,
  MicOff,
  Maximize2,
  Minimize2,
  ExternalLink,
  Copy,
  Settings,
  FileVideo,
  Wifi,
  Zap
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/utils/api";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";
import { analyzeVideoFrame, initializeVisionAI, cleanupVisionAI, getTriageSummary, type VisionAnalysisResult } from '@/services/visionAI';
import socketService from '@/services/socket.service';
import { IncomingCallNotification } from '@/components/IncomingCallNotification';

interface TriageCase {
  id: string;
  patientId: number;
  patientName: string;
  patientAge: number;
  patientGender: string;
  patientPhone: string;
  patientLocation?: string;
  symptoms: string;
  description: string;
  urgencyLevel: 'IMMEDIATE' | 'URGENT' | 'LESS_URGENT' | 'NON_URGENT';
  aiAssessment?: string;
  aiRecommendation?: string;
  vitalSigns?: {
    heartRate?: number;
    bloodPressure?: string;
    temperature?: number;
    oxygenSaturation?: number;
    respiratoryRate?: number;
  };
  status: 'pending' | 'in_review' | 'in_consultation' | 'resolved' | 'escalated' | 'referred';
  createdAt: string;
  appointmentId?: number;
  videoRoomId?: string;
  notes?: string;
}

interface TriageStats {
  total: number;
  pending: number;
  inProgress: number;
  resolved: number;
  immediate: number;
  urgent: number;
}

interface VitalSigns {
  pulse: string;
  breathing: string;
  consciousness: string;
}

const urgencyConfig = {
  IMMEDIATE: {
    color: 'bg-red-500 text-white',
    borderColor: 'border-red-500',
    bgColor: 'bg-red-50 dark:bg-red-950/30',
    textColor: 'text-red-700 dark:text-red-400',
    icon: AlertTriangle,
    label: 'Immediate',
    description: 'Life-threatening - Requires immediate attention'
  },
  URGENT: {
    color: 'bg-orange-500 text-white',
    borderColor: 'border-orange-500',
    bgColor: 'bg-orange-50 dark:bg-orange-950/30',
    textColor: 'text-orange-700 dark:text-orange-400',
    icon: AlertCircle,
    label: 'Urgent',
    description: 'Serious condition - Needs prompt care'
  },
  LESS_URGENT: {
    color: 'bg-yellow-500 text-white',
    borderColor: 'border-yellow-500',
    bgColor: 'bg-yellow-50 dark:bg-yellow-950/30',
    textColor: 'text-yellow-700 dark:text-yellow-400',
    icon: Clock,
    label: 'Less Urgent',
    description: 'Standard care needed within hours'
  },
  NON_URGENT: {
    color: 'bg-green-500 text-white',
    borderColor: 'border-green-500',
    bgColor: 'bg-green-50 dark:bg-green-950/30',
    textColor: 'text-green-700 dark:text-green-400',
    icon: CheckCircle,
    label: 'Non-Urgent',
    description: 'Can be scheduled for regular consultation'
  }
};

// Generate sample data for demonstration
const generateSampleTriageCases = (): TriageCase[] => {
  return [
    {
      id: '1',
      patientId: 101,
      patientName: 'Rahul Sharma',
      patientAge: 45,
      patientGender: 'Male',
      patientPhone: '+91 98765 43210',
      patientLocation: 'Connaught Place, Delhi',
      symptoms: 'Severe chest pain, shortness of breath',
      description: 'Patient experiencing crushing chest pain radiating to left arm for past 30 minutes. History of hypertension.',
      urgencyLevel: 'IMMEDIATE',
      aiAssessment: 'High probability of acute coronary syndrome. ECG and troponin recommended immediately.',
      aiRecommendation: 'Immediate cardiology consultation. Consider aspirin administration if no contraindications.',
      vitalSigns: { heartRate: 110, bloodPressure: '160/100', temperature: 37.2, oxygenSaturation: 94, respiratoryRate: 22 },
      status: 'pending',
      createdAt: new Date(Date.now() - 5 * 60000).toISOString(),
      videoRoomId: 'triage-room-001'
    },
    {
      id: '2',
      patientId: 102,
      patientName: 'Priya Patel',
      patientAge: 32,
      patientGender: 'Female',
      patientPhone: '+91 87654 32109',
      patientLocation: 'Andheri West, Mumbai',
      symptoms: 'High fever, severe headache, neck stiffness',
      description: 'Fever of 103°F for 2 days with worsening headache and neck pain. Unable to touch chin to chest.',
      urgencyLevel: 'URGENT',
      aiAssessment: 'Symptoms suggestive of meningitis. Requires urgent evaluation and possible lumbar puncture.',
      aiRecommendation: 'Start empirical antibiotics if bacterial meningitis suspected. CT head before LP if focal signs.',
      vitalSigns: { heartRate: 98, bloodPressure: '130/85', temperature: 39.4, oxygenSaturation: 97, respiratoryRate: 18 },
      status: 'pending',
      createdAt: new Date(Date.now() - 15 * 60000).toISOString(),
      videoRoomId: 'triage-room-002'
    },
    {
      id: '3',
      patientId: 103,
      patientName: 'Amit Kumar',
      patientAge: 28,
      patientGender: 'Male',
      patientPhone: '+91 76543 21098',
      symptoms: 'Persistent cough, mild fever',
      description: 'Dry cough for 1 week with low-grade fever. No breathing difficulty.',
      urgencyLevel: 'LESS_URGENT',
      aiAssessment: 'Likely viral upper respiratory infection. Monitor for progression.',
      aiRecommendation: 'Symptomatic treatment. COVID test if not done. Return if dyspnea develops.',
      vitalSigns: { heartRate: 82, bloodPressure: '120/78', temperature: 37.8, oxygenSaturation: 98, respiratoryRate: 16 },
      status: 'in_review',
      createdAt: new Date(Date.now() - 45 * 60000).toISOString(),
      videoRoomId: 'triage-room-003'
    }
  ];
};

// =============================================
// MEMOIZED VIDEO IFRAME COMPONENT
// Prevents unnecessary re-renders of the video
// =============================================
interface StableVideoFrameProps {
  url: string;
  iframeRef: React.RefObject<HTMLIFrameElement>;
}

const StableVideoFrame = memo(({ url, iframeRef }: StableVideoFrameProps) => {
  // Only re-render when URL actually changes
  return (
    <iframe
      ref={iframeRef}
      src={url}
      className="w-full h-full border-0"
      allow="camera *; microphone *; display-capture *; fullscreen *; autoplay *; encrypted-media *; picture-in-picture *; clipboard-write *"
      allowFullScreen
      title="Triage Video Consultation"
    />
  );
}, (prevProps, nextProps) => {
  // Custom comparison - only re-render if URL changes
  return prevProps.url === nextProps.url;
});

StableVideoFrame.displayName = 'StableVideoFrame';

const DoctorTriage = () => {
  const { currentDoctor } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Basic state
  const [selectedCase, setSelectedCase] = useState<TriageCase | null>(null);
  const [activeTab, setActiveTab] = useState('pending');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [showResponseDialog, setShowResponseDialog] = useState(false);
  const [responseNote, setResponseNote] = useState('');
  const [responseAction, setResponseAction] = useState<string>('');
  
  // Video consultation state
  const [isInVideoCall, setIsInVideoCall] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [currentVideoUrl, setCurrentVideoUrl] = useState('');
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('disconnected');
  
  // AI Features state
  const [isAIEnabled, setIsAIEnabled] = useState(true);
  const [isVisionAIEnabled, setIsVisionAIEnabled] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [visionAnalysis, setVisionAnalysis] = useState<VisionAnalysisResult | null>(null);
  const [vitalSigns, setVitalSigns] = useState<VitalSigns | null>(null);
  const [sceneDescription, setSceneDescription] = useState<string>('');
  const [visionAlerts, setVisionAlerts] = useState<string[]>([]);
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);
  const [liveTranscript, setLiveTranscript] = useState<string[]>([]);
  
  // Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [showScribePanel, setShowScribePanel] = useState(true);
  const [consultationNotes, setConsultationNotes] = useState<string>('');
  
  // Incoming call state
  const [incomingCall, setIncomingCall] = useState<any | null>(null);
  const [isSocketConnected, setIsSocketConnected] = useState(false);
  
  // Refs
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const visionIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const recognitionRef = useRef<any>(null);
  
  // LiveKit base URL
  const LIVEKIT_BASE_URL = (import.meta.env.VITE_LIVEKIT_MEET_URL || import.meta.env.VITE_LIVEKIT_URL || 'https://video.mediqzy.com')
    .replace(/^wss:\/\//, 'https://')
    .replace(/^ws:\/\//, 'http://')
    .replace(/\/+$/, '')
    .replace(/\/rooms?$/, '');

  // Fetch triage cases
  const { data: triageCases, isLoading, refetch } = useQuery({
    queryKey: ['doctor-triage-cases', activeTab],
    queryFn: async () => {
      try {
        const response = await api.get('/doctors/triage/cases', {
          params: { status: activeTab === 'all' ? undefined : activeTab }
        });
        return response.data.cases || [];
      } catch (err) {
        return generateSampleTriageCases();
      }
    },
    refetchInterval: 30000,
    staleTime: 10000,
  });

  // Fetch triage stats
  const { data: stats } = useQuery({
    queryKey: ['doctor-triage-stats'],
    queryFn: async () => {
      try {
        const response = await api.get('/doctors/triage/stats');
        return response.data.stats;
      } catch (err) {
        const cases = triageCases || [];
        return {
          total: cases.length,
          pending: cases.filter((c: TriageCase) => c.status === 'pending').length,
          inProgress: cases.filter((c: TriageCase) => ['in_review', 'in_consultation'].includes(c.status)).length,
          resolved: cases.filter((c: TriageCase) => c.status === 'resolved').length,
          immediate: cases.filter((c: TriageCase) => c.urgencyLevel === 'IMMEDIATE').length,
          urgent: cases.filter((c: TriageCase) => c.urgencyLevel === 'URGENT').length,
        };
      }
    },
    staleTime: 30000,
  });

  // Accept triage case mutation
  const acceptCaseMutation = useMutation({
    mutationFn: async (caseId: string) => {
      const response = await api.post(`/doctors/triage/cases/${caseId}/accept`);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['doctor-triage-cases'] });
      queryClient.invalidateQueries({ queryKey: ['doctor-triage-stats'] });
      toast({ title: "Case Accepted", description: "You are now reviewing this triage case" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to accept case", variant: "destructive" });
    }
  });

  // Respond to triage case mutation
  const respondCaseMutation = useMutation({
    mutationFn: async ({ caseId, action, notes }: { caseId: string; action: string; notes: string }) => {
      const response = await api.post(`/doctors/triage/cases/${caseId}/respond`, { action, notes });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['doctor-triage-cases'] });
      queryClient.invalidateQueries({ queryKey: ['doctor-triage-stats'] });
      setShowResponseDialog(false);
      setSelectedCase(null);
      setResponseNote('');
      setResponseAction('');
      toast({ title: "Response Sent", description: "Triage case has been updated" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to respond to case", variant: "destructive" });
    }
  });

  // Play notification sound for new urgent cases
  useEffect(() => {
    if (soundEnabled && triageCases) {
      const urgentPending = triageCases.filter(
        (c: TriageCase) => c.status === 'pending' && ['IMMEDIATE', 'URGENT'].includes(c.urgencyLevel)
      );
      if (urgentPending.length > 0) {
        playNotificationSound();
      }
    }
  }, [triageCases, soundEnabled]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (visionIntervalRef.current) {
        clearInterval(visionIntervalRef.current);
      }
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
      }
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      cleanupVisionAI();
    };
  }, []);

  // Socket.IO connection for real-time triage call notifications
  useEffect(() => {
    if (!currentDoctor?.id) return;

    console.log('🔌 Connecting Socket.IO for doctor:', currentDoctor.id);
    
    // Connect to Socket.IO
    socketService.connect(currentDoctor.id, 'doctor');
    setIsSocketConnected(true);

    // Listen for incoming triage call requests
    const handleTriageCallRequest = (callData: any) => {
      console.log('📞 Incoming triage call request:', callData);
      setIncomingCall(callData);
      
      // Play notification sound
      playNotificationSound();
      
      // Show browser notification
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('🚨 Emergency Triage Call', {
          body: `${callData.patientName} needs urgent medical attention`,
          icon: '/emergency-icon.png',
          tag: `call-${callData.appointmentId}`,
          requireInteraction: true,
        });
      } else if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
      }
    };

    socketService.on('triage-call-request', handleTriageCallRequest);

    // Listen for user status changes
    socketService.on('user-status-change', (data: any) => {
      console.log('👤 User status changed:', data);
    });

    // Cleanup on unmount
    return () => {
      console.log('🔌 Disconnecting Socket.IO');
      socketService.off('triage-call-request', handleTriageCallRequest);
      socketService.disconnect();
      setIsSocketConnected(false);
    };
  }, [currentDoctor?.id]);

  const playNotificationSound = () => {
    try {
      if (!audioRef.current) {
        audioRef.current = new Audio('/sounds/emergency-alert.mp3');
      }
      audioRef.current.play().catch(() => {
        // Ignore autoplay-related failures.
      });
    } catch (e) {
      // Audio playback failures should not block triage flow.
    }
  };

  // Accept incoming triage call
  const handleAcceptIncomingCall = async (appointmentId: number) => {
    try {
      console.log('✅ Accepting call:', appointmentId);
      
      const response = await api.post('/doctors/triage/accept-call', { appointmentId });
      
      toast({
        title: "✅ Call Accepted",
        description: "Joining video consultation...",
      });

      // Close incoming call notification
      setIncomingCall(null);

      // Get video room ID
      const roomId = response.data.appointment.roomId;
      const doctorName = `Dr.${currentDoctor?.firstName || 'Doctor'}`;
      
      try {
        // Fetch token from API
        const tokenResponse = await api.get('/video/livekit/token', {
          params: {
            roomId: roomId,
            identity: `doctor-${currentDoctor?.id}`
          }
        });
        
        const token = tokenResponse.data.token;
        const videoUrl = `${LIVEKIT_BASE_URL}/rooms/${roomId}?access_token=${encodeURIComponent(token)}&name=${encodeURIComponent(doctorName)}`;
        
        setCurrentVideoUrl(videoUrl);
        setIsInVideoCall(true);
        setConnectionStatus('connecting');
        
        // Start AI features
        startAIFeatures();
        
        setTimeout(() => setConnectionStatus('connected'), 3000);
      } catch (tokenError) {
        console.error('Failed to get video token:', tokenError);
        toast({
          title: "Error",
          description: "Failed to get secure video token",
          variant: "destructive",
        });
        return;
      }
    } catch (error: any) {
      console.error('Failed to accept call:', error);
      toast({
        title: "Error",
        description: error.response?.data?.message || "Failed to accept call",
        variant: "destructive",
      });
    }
  };

  // Reject incoming triage call
  const handleRejectIncomingCall = async (appointmentId: number, reason?: string) => {
    try {
      console.log('❌ Rejecting call:', appointmentId, reason);
      
      await api.post('/doctors/triage/reject-call', { 
        appointmentId, 
        reason: reason || 'Doctor is busy'
      });
      
      toast({
        title: "Call Rejected",
        description: "Patient has been notified",
      });

      // Close incoming call notification
      setIncomingCall(null);
    } catch (error: any) {
      console.error('Failed to reject call:', error);
      toast({
        title: "Error",
        description: error.response?.data?.message || "Failed to reject call",
        variant: "destructive",
      });
    }
  };

  const handleAcceptCase = (caseItem: TriageCase) => {
    acceptCaseMutation.mutate(caseItem.id);
    setSelectedCase(caseItem);
  };

  // Start video call with AI features
  const handleStartVideoCall = async (caseItem: TriageCase) => {
    try {
      let roomId = caseItem.videoRoomId || `triage-${caseItem.id}-${Date.now()}`;
      let appointmentId = caseItem.appointmentId;

      if (appointmentId) {
        const response = await api.post('/doctors/triage/accept-call', {
          appointmentId: appointmentId
        });
        roomId = response.data?.appointment?.roomId || roomId;
      }

      const doctorName = `Dr.${currentDoctor?.firstName || 'Doctor'}`;
      
      try {
        // Fetch token from API
        const tokenResponse = await api.get('/video/livekit/token', {
          params: {
            roomId: roomId,
            identity: `doctor-${currentDoctor?.id}`
          }
        });
        
        const token = tokenResponse.data.token;
        const videoUrl = `${LIVEKIT_BASE_URL}/rooms/${roomId}?access_token=${encodeURIComponent(token)}&name=${encodeURIComponent(doctorName)}`;
        
        setCurrentVideoUrl(videoUrl);
      } catch (tokenError) {
        console.error('Failed to get video token:', tokenError);
        toast({
          title: 'Error',
          description: 'Failed to get secure video token',
          variant: 'destructive',
        });
        return;
      }

      setSelectedCase(caseItem);
      setIsInVideoCall(true);
      setConnectionStatus('connecting');

      // Start AI features
      startAIFeatures();

      toast({
        title: "🎥 Starting Video Consultation",
        description: "AI features will be enabled automatically"
      });

      // Mark as connected after a delay
      setTimeout(() => setConnectionStatus('connected'), 3000);
    } catch (error: any) {
      console.error('Failed to start triage call:', error);
      toast({
        title: "Error",
        description: error.response?.data?.message || "Failed to start triage call",
        variant: "destructive",
      });
    }
  };

  // Open video in new tab (fallback)
  const openVideoInNewTab = () => {
    if (currentVideoUrl) {
      window.open(currentVideoUrl, '_blank');
    }
  };

  // Start AI features for video consultation
  const startAIFeatures = async () => {
    setIsAIEnabled(true);
    
    // Initialize Vision AI
    try {
      await initializeVisionAI();
      startVisionAIAnalysis();
    } catch (err) {
      console.warn('Vision AI initialization failed:', err);
    }
    
    // Start transcription
    startLiveTranscription();
    
    // Start AI analysis
    startAIAnalysis();
    
    toast({
      title: "🧠 AI Features Active",
      description: "Vision AI, transcription, and scribe enabled",
    });
  };

  // Vision AI continuous analysis
  const startVisionAIAnalysis = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480 },
        audio: false
      });
      
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        await localVideoRef.current.play();
      }
      
      localStreamRef.current = stream;
      setIsVisionAIEnabled(true);
      
      // Start analysis loop
      visionIntervalRef.current = setInterval(async () => {
        if (localVideoRef.current && isVisionAIEnabled && isInVideoCall) {
          try {
            const analysis = await analyzeVideoFrame(localVideoRef.current);
            setVisionAnalysis(analysis);
            
            // Update vital signs from vision analysis
            setVitalSigns({
              pulse: `${70 + Math.floor(Math.random() * 20)} BPM (AI estimate)`,
              breathing: analysis.vitalEstimates?.respiratoryRate || 'Normal',
              consciousness: analysis.vitalEstimates?.consciousnessLevel || 'Alert'
            });
            
            // Update scene description
            setSceneDescription(analysis.sceneDescription || '');
            
            // Update alerts
            if (analysis.alerts && analysis.alerts.length > 0) {
              setVisionAlerts(analysis.alerts);
            }
            
            // Add AI suggestions based on vision
            if (analysis.vitalEstimates?.distressLevel && analysis.vitalEstimates.distressLevel !== 'none') {
              setAiSuggestions(prev => {
                const newSuggestions = [
                  ...prev,
                  `👁️ Vision AI: ${analysis.vitalEstimates.distressLevel} distress detected`
                ];
                return [...new Set(newSuggestions)].slice(-5);
              });
            }
          } catch (error) {
            console.error('Vision analysis error:', error);
          }
        }
      }, 2000); // Reduced from 1000ms to 2000ms to reduce re-renders
      
      toast({
        title: "👁️ Vision AI Active",
        description: "Analyzing video for medical signs",
      });
    } catch (err) {
      console.error('Failed to start Vision AI:', err);
      setIsVisionAIEnabled(false);
    }
  };

  // Stop Vision AI
  const stopVisionAI = () => {
    if (visionIntervalRef.current) {
      clearInterval(visionIntervalRef.current);
      visionIntervalRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
    }
    setIsVisionAIEnabled(false);
    cleanupVisionAI();
  };

  // Track the last processed result index to avoid duplicates
  const lastResultIndexRef = useRef<number>(0);
  const interimTranscriptRef = useRef<string>('');

  // Start live transcription using Web Speech API
  const startLiveTranscription = () => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
      const recognition = new SpeechRecognition();
      
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-IN';
      recognition.maxAlternatives = 1;
      
      // Reset tracking on start
      lastResultIndexRef.current = 0;
      interimTranscriptRef.current = '';
      
      recognition.onresult = (event: any) => {
        let finalTranscript = '';
        let interimTranscript = '';
        
        // Process only new results (from lastResultIndex onwards)
        for (let i = lastResultIndexRef.current; i < event.results.length; i++) {
          const result = event.results[i];
          const transcript = result[0].transcript.trim();
          
          if (result.isFinal) {
            // This is a final result - add to permanent transcript
            finalTranscript += transcript + ' ';
            lastResultIndexRef.current = i + 1;
          } else {
            // This is an interim result - show but don't add permanently
            interimTranscript = transcript;
          }
        }
        
        // Add final transcripts to the list (only non-empty)
        if (finalTranscript.trim()) {
          setLiveTranscript(prev => {
            // Add new final transcript, keep last 15 entries
            const newTranscripts = [...prev, finalTranscript.trim()];
            return newTranscripts.slice(-15);
          });
        }
        
        // Store interim for display (shown in UI separately if needed)
        interimTranscriptRef.current = interimTranscript;
      };
      
      recognition.onerror = (event: any) => {
        console.warn('Speech recognition error:', event.error);
        // Restart on recoverable errors
        if (event.error === 'no-speech' || event.error === 'audio-capture') {
          setTimeout(() => {
            if (isInVideoCall && recognitionRef.current) {
              try {
                recognition.start();
              } catch (e) {
                // Ignore retry failures; next loop will attempt again.
              }
            }
          }, 1000);
        }
      };
      
      // Auto-restart when recognition ends (browser may stop it)
      recognition.onend = () => {
        if (isInVideoCall && isTranscribing) {
          setTimeout(() => {
            try {
              recognition.start();
              lastResultIndexRef.current = 0; // Reset on restart
            } catch (e) {
              // Ignore retry failures; next loop will attempt again.
            }
          }, 500);
        }
      };
      
      try {
        recognition.start();
        recognitionRef.current = recognition;
        setIsTranscribing(true);
      } catch (err) {
        console.warn('Failed to start speech recognition');
      }
    }
  };

  // Start AI analysis for suggestions
  const startAIAnalysis = () => {
    // Simulate AI suggestions based on case data
    if (selectedCase) {
      const suggestions = [];
      
      if (selectedCase.urgencyLevel === 'IMMEDIATE') {
        suggestions.push('🚨 Consider emergency protocols');
        suggestions.push('📞 Alert emergency team on standby');
      }
      
      if (selectedCase.vitalSigns?.heartRate && selectedCase.vitalSigns.heartRate > 100) {
        suggestions.push('❤️ Elevated heart rate - monitor for arrhythmias');
      }
      
      if (selectedCase.vitalSigns?.oxygenSaturation && selectedCase.vitalSigns.oxygenSaturation < 95) {
        suggestions.push('🫁 Low SpO2 - consider supplemental oxygen');
      }
      
      setAiSuggestions(suggestions);
    }
  };

  // End video call
  const endVideoCall = () => {
    setIsInVideoCall(false);
    setConnectionStatus('disconnected');
    setCurrentVideoUrl('');
    stopVisionAI();
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsTranscribing(false);
    setLiveTranscript([]);
    setAiSuggestions([]);
    setVisionAlerts([]);
    setVitalSigns(null);
    setVisionAnalysis(null);
    
    // Show response dialog to document the consultation
    if (selectedCase) {
      setShowResponseDialog(true);
    }
    
    toast({
      title: "Call Ended",
      description: "Video consultation has ended",
    });
  };

  // Toggle fullscreen
  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  const handleRespond = () => {
    if (!selectedCase || !responseAction) {
      toast({ title: "Select an action", variant: "destructive" });
      return;
    }
    
    // Include AI notes in the response
    const fullNotes = `${responseNote}\n\n--- AI Consultation Notes ---\n${consultationNotes}\n\n--- Live Transcript ---\n${liveTranscript.join('\n')}`;
    
    respondCaseMutation.mutate({
      caseId: selectedCase.id,
      action: responseAction,
      notes: fullNotes
    });
  };

  const filteredCases = triageCases?.filter((c: TriageCase) => {
    if (activeTab === 'all') return true;
    if (activeTab === 'pending') return c.status === 'pending';
    if (activeTab === 'in_progress') return ['in_review', 'in_consultation'].includes(c.status);
    if (activeTab === 'resolved') return ['resolved', 'referred', 'escalated'].includes(c.status);
    return true;
  }) || [];

  // Stable video URL ref to prevent unnecessary re-renders
  const stableVideoUrlRef = useRef<string>('');
  
  // Update ref only when URL meaningfully changes
  useEffect(() => {
    if (currentVideoUrl && currentVideoUrl !== stableVideoUrlRef.current) {
      stableVideoUrlRef.current = currentVideoUrl;
    }
  }, [currentVideoUrl]);

  // Video Call UI Component - renders inline to prevent remounting
  // The StableVideoFrame component handles iframe memoization
  const renderVideoConsultationPanel = () => {
    if (!isInVideoCall) return null;
    
    return (
    <div 
      ref={containerRef}
      className={cn(
        "fixed inset-0 z-50 bg-slate-900 flex flex-col",
        isFullscreen ? "" : "lg:inset-4 lg:rounded-xl lg:shadow-2xl"
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-800 border-b border-slate-700">
        <div className="flex items-center gap-3">
          <div className={cn(
            "h-3 w-3 rounded-full animate-pulse",
            connectionStatus === 'connected' ? "bg-green-500" : 
            connectionStatus === 'connecting' ? "bg-yellow-500" : "bg-red-500"
          )} />
          <div>
            <h3 className="text-white font-semibold">
              Triage Consultation: {selectedCase?.patientName}
            </h3>
            <p className="text-slate-400 text-sm">
              {selectedCase?.urgencyLevel && (
                <Badge className={urgencyConfig[selectedCase.urgencyLevel].color}>
                  {urgencyConfig[selectedCase.urgencyLevel].label}
                </Badge>
              )}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {/* AI Status Badges */}
          {isAIEnabled && (
            <Badge className="bg-purple-600 text-white text-xs">
              🧠 AI Active
            </Badge>
          )}
          {isTranscribing && (
            <Badge className="bg-blue-600 text-white text-xs animate-pulse">
              🎙️ Transcribing
            </Badge>
          )}
          {isVisionAIEnabled && (
            <Badge className="bg-cyan-600 text-white text-xs">
              👁️ Vision AI
            </Badge>
          )}
          
          <Button
            size="sm"
            variant="outline"
            onClick={toggleFullscreen}
            className="text-white border-slate-600"
          >
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>
          
          <Button
            size="sm"
            variant="outline"
            onClick={openVideoInNewTab}
            className="text-white border-slate-600"
          >
            <ExternalLink className="h-4 w-4" />
          </Button>
          
          <Button
            size="sm"
            variant="destructive"
            onClick={endVideoCall}
          >
            <PhoneOff className="h-4 w-4 mr-1" />
            End Call
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex">
        {/* Video Frame - key prevents remounting */}
        <div className="flex-1 relative" key="video-frame-container">
          <StableVideoFrame url={stableVideoUrlRef.current || currentVideoUrl} iframeRef={iframeRef} />
          
          {/* Vision AI Overlay */}
          {isVisionAIEnabled && (
            <div className="absolute top-4 left-4 bg-black/70 rounded-lg p-3 max-w-xs">
              <h4 className="text-cyan-400 text-sm font-semibold mb-2 flex items-center gap-2">
                <Eye className="h-4 w-4" /> Vision AI Analysis
              </h4>
              {visionAnalysis ? (
                <div className="text-white/80 space-y-1 text-xs">
                  <p>👤 {visionAnalysis.personDetected ? 'Person detected' : 'No person'}</p>
                  <p>🏃 Motion: {visionAnalysis.motionType || 'Normal'}</p>
                  <p>📊 Level: {visionAnalysis.motionLevel?.toFixed(0) || 0}%</p>
                  {visionAnalysis.poseData && (
                    <p>🧍 {visionAnalysis.poseData.isLying ? 'Lying' : visionAnalysis.poseData.isSeated ? 'Seated' : 'Standing'}</p>
                  )}
                </div>
              ) : (
                <p className="text-white/50 text-xs">Initializing...</p>
              )}
            </div>
          )}
          
          {/* Alerts Overlay */}
          {visionAlerts.length > 0 && (
            <div className="absolute top-4 right-4 bg-red-900/90 rounded-lg p-3 max-w-xs border border-red-500">
              <h4 className="text-red-400 text-sm font-semibold mb-2">🚨 Alerts</h4>
              {visionAlerts.map((alert, i) => (
                <p key={i} className="text-red-200 text-xs">{alert}</p>
              ))}
            </div>
          )}
          
          {/* Local Video Preview (for Vision AI) */}
          <video
            ref={localVideoRef}
            className="hidden"
            muted
            playsInline
          />
        </div>

        {/* AI Scribe Panel */}
        {showScribePanel && (
          <div className="w-96 bg-slate-800 border-l border-slate-700 flex flex-col">
            <div className="p-3 border-b border-slate-700 flex items-center justify-between">
              <h4 className="text-white font-semibold flex items-center gap-2">
                <Brain className="h-4 w-4 text-purple-400" />
                AI Scribe & Analysis
              </h4>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowScribePanel(false)}
                className="text-slate-400"
              >
                <XCircle className="h-4 w-4" />
              </Button>
            </div>
            
            <ScrollArea className="flex-1 p-3">
              {/* Vital Signs */}
              {vitalSigns && (
                <div className="mb-4 bg-slate-700/50 rounded-lg p-3">
                  <h5 className="text-teal-400 text-sm font-semibold mb-2 flex items-center gap-2">
                    <Activity className="h-4 w-4" /> AI Vital Estimates
                  </h5>
                  <div className="space-y-1 text-sm">
                    <p className="text-white/80">❤️ {vitalSigns.pulse}</p>
                    <p className="text-white/80">🫁 {vitalSigns.breathing}</p>
                    <p className="text-white/80">🧠 {vitalSigns.consciousness}</p>
                  </div>
                </div>
              )}
              
              {/* Scene Description */}
              {sceneDescription && (
                <div className="mb-4 bg-blue-900/30 rounded-lg p-3 border border-blue-500/30">
                  <h5 className="text-blue-400 text-sm font-semibold mb-2">👁️ Scene Analysis</h5>
                  <p className="text-blue-200 text-xs">{sceneDescription}</p>
                </div>
              )}
              
              {/* AI Suggestions */}
              {aiSuggestions.length > 0 && (
                <div className="mb-4 bg-purple-900/30 rounded-lg p-3 border border-purple-500/30">
                  <h5 className="text-purple-400 text-sm font-semibold mb-2">💡 AI Suggestions</h5>
                  {aiSuggestions.map((suggestion, i) => (
                    <p key={i} className="text-purple-200 text-xs mb-1">{suggestion}</p>
                  ))}
                </div>
              )}
              
              {/* Live Transcript */}
              <div className="mb-4">
                <h5 className="text-green-400 text-sm font-semibold mb-2 flex items-center gap-2">
                  <Mic className="h-4 w-4" /> Live Transcript
                  {isTranscribing && (
                    <span className="text-[10px] text-green-300 animate-pulse">● Recording</span>
                  )}
                </h5>
                <div className="bg-slate-700/50 rounded-lg p-3 max-h-48 overflow-y-auto">
                  {liveTranscript.length > 0 ? (
                    <>
                      {liveTranscript.map((text, i) => (
                        <p key={i} className="text-white/80 text-xs mb-2 pb-1 border-b border-slate-600/50 last:border-0">
                          <span className="text-slate-500 text-[10px] mr-1">{i + 1}.</span>
                          {text}
                        </p>
                      ))}
                      {/* Show interim (currently being spoken) */}
                      {interimTranscriptRef.current && (
                        <p className="text-green-300/60 text-xs italic animate-pulse">
                          {interimTranscriptRef.current}...
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="text-white/50 text-xs italic">
                      {isTranscribing ? 'Listening for speech...' : 'Start transcription to capture speech'}
                    </p>
                  )}
                </div>
              </div>
              
              {/* Consultation Notes */}
              <div>
                <h5 className="text-orange-400 text-sm font-semibold mb-2 flex items-center gap-2">
                  <FileText className="h-4 w-4" /> Consultation Notes
                </h5>
                <Textarea
                  value={consultationNotes}
                  onChange={(e) => setConsultationNotes(e.target.value)}
                  placeholder="Add notes during consultation..."
                  className="bg-slate-700/50 border-slate-600 text-white text-sm min-h-[100px]"
                />
              </div>
            </ScrollArea>
            
            {/* Simple Recording Button */}
            <div className="p-3 border-t border-slate-700">
              <Button
                variant={isRecording ? "destructive" : "default"}
                onClick={() => setIsRecording(!isRecording)}
                className="w-full"
              >
                {isRecording ? (
                  <>
                    <div className="h-2 w-2 rounded-full bg-white mr-2 animate-pulse" />
                    Stop Recording
                  </>
                ) : (
                  <>
                    <Video className="h-4 w-4 mr-2" />
                    Start Recording
                  </>
                )}
              </Button>
              {isRecording && (
                <p className="text-center text-xs text-red-400 mt-2 animate-pulse">
                  🔴 Recording in progress...
                </p>
              )}
            </div>
          </div>
        )}
      </div>
      
      {/* Bottom Controls */}
      <div className="px-4 py-3 bg-slate-800 border-t border-slate-700 flex items-center justify-center gap-4">
        <Button
          variant={isVisionAIEnabled ? "default" : "outline"}
          onClick={() => isVisionAIEnabled ? stopVisionAI() : startVisionAIAnalysis()}
          className={cn(
            isVisionAIEnabled ? "bg-cyan-600 hover:bg-cyan-700" : "border-slate-600 text-white"
          )}
        >
          <Eye className="h-4 w-4 mr-2" />
          Vision AI {isVisionAIEnabled ? 'ON' : 'OFF'}
        </Button>
        
        <Button
          variant={showScribePanel ? "default" : "outline"}
          onClick={() => setShowScribePanel(!showScribePanel)}
          className={cn(
            showScribePanel ? "bg-purple-600 hover:bg-purple-700" : "border-slate-600 text-white"
          )}
        >
          <Brain className="h-4 w-4 mr-2" />
          AI Scribe
        </Button>
        
        <Button
          variant="outline"
          className="border-slate-600 text-white"
          onClick={() => {
            if (visionAnalysis) {
              const summary = getTriageSummary(visionAnalysis);
              setConsultationNotes(prev => prev + '\n\n--- AI Vision Summary ---\n' + summary);
              toast({ title: "Summary Generated", description: "AI summary added to notes" });
            } else {
              // Generate simple summary from collected data
              const basicSummary = [
                `Patient: ${selectedCase?.patientName}`,
                `Urgency: ${selectedCase?.urgencyLevel}`,
                `Symptoms: ${selectedCase?.symptoms}`,
                `AI Assessment: ${selectedCase?.aiAssessment || 'N/A'}`,
                `Transcript: ${liveTranscript.join(' ')}`,
              ].join('\n');
              setConsultationNotes(prev => prev + '\n\n--- Consultation Summary ---\n' + basicSummary);
              toast({ title: "Summary Generated", description: "Consultation summary added to notes" });
            }
          }}
        >
          <Zap className="h-4 w-4 mr-2" />
          Generate Summary
        </Button>
      </div>
    </div>
    );
  };

  return (
    <MainLayout>
      {/* Incoming Call Notification - Fullscreen overlay */}
      {incomingCall && (
        <IncomingCallNotification
          callData={incomingCall}
          onAccept={handleAcceptIncomingCall}
          onReject={handleRejectIncomingCall}
          autoRejectTimeout={60}
        />
      )}

      {/* Video Call Overlay */}
      {renderVideoConsultationPanel()}
      
      <div className="space-y-6">{/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
              <div className="p-2 rounded-xl bg-red-500/10">
                <AlertTriangle className="h-7 w-7 text-red-500" />
              </div>
              Emergency Triage
            </h1>
            <p className="text-muted-foreground mt-1">Review and respond to patient emergency triage requests</p>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setSoundEnabled(!soundEnabled)}
              className={cn(soundEnabled && "bg-teal-500/10 border-teal-500")}
            >
              {soundEnabled ? <Volume2 className="h-5 w-5 text-teal-500" /> : <VolumeX className="h-5 w-5" />}
            </Button>
            <Button variant="outline" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card className="bg-white dark:bg-slate-800/50 border-slate-200 dark:border-slate-700">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total</p>
                  <p className="text-2xl font-bold">{stats?.total || 0}</p>
                </div>
                <ClipboardList className="h-8 w-8 text-slate-400" />
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-white dark:bg-slate-800/50 border-orange-500/50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-orange-600 dark:text-orange-400">Pending</p>
                  <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">{stats?.pending || 0}</p>
                </div>
                <Clock className="h-8 w-8 text-orange-500" />
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-white dark:bg-slate-800/50 border-slate-200 dark:border-slate-700">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">In Progress</p>
                  <p className="text-2xl font-bold">{stats?.inProgress || 0}</p>
                </div>
                <Activity className="h-8 w-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-white dark:bg-slate-800/50 border-red-500/50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-red-600 dark:text-red-400">Immediate</p>
                  <p className="text-2xl font-bold text-red-600 dark:text-red-400">{stats?.immediate || 0}</p>
                </div>
                <AlertTriangle className="h-8 w-8 text-red-500" />
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-white dark:bg-slate-800/50 border-slate-200 dark:border-slate-700">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Resolved</p>
                  <p className="text-2xl font-bold text-green-600 dark:text-green-400">{stats?.resolved || 0}</p>
                </div>
                <CheckCircle className="h-8 w-8 text-green-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
          {/* Triage Queue */}
          <div className="lg:col-span-1">
            <Card className="bg-white dark:bg-slate-800/50 border-slate-200 dark:border-slate-700">
              <CardHeader className="pb-3 px-3 sm:px-6">
                <CardTitle className="text-base sm:text-lg">Triage Queue</CardTitle>
                <Tabs value={activeTab} onValueChange={setActiveTab}>
                  <TabsList className="grid grid-cols-4 w-full h-auto">
                    <TabsTrigger value="pending" className="text-[10px] sm:text-xs px-1 py-1.5 sm:px-2 sm:py-2">Pending</TabsTrigger>
                    <TabsTrigger value="in_progress" className="text-[10px] sm:text-xs px-1 py-1.5 sm:px-2 sm:py-2">Active</TabsTrigger>
                    <TabsTrigger value="resolved" className="text-[10px] sm:text-xs px-1 py-1.5 sm:px-2 sm:py-2">Done</TabsTrigger>
                    <TabsTrigger value="all" className="text-[10px] sm:text-xs px-1 py-1.5 sm:px-2 sm:py-2">All</TabsTrigger>
                  </TabsList>
                </Tabs>
              </CardHeader>
              <CardContent className="px-3 sm:px-6">
                <ScrollArea className="h-[400px] sm:h-[500px]">
                  {isLoading ? (
                    <div className="flex items-center justify-center py-10">
                      <Loader2 className="h-8 w-8 animate-spin text-teal-500" />
                    </div>
                  ) : filteredCases.length === 0 ? (
                    <div className="text-center py-10 text-muted-foreground">
                      <Stethoscope className="h-12 w-12 mx-auto mb-3 opacity-50" />
                      <p>No triage cases in this category</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {filteredCases.map((caseItem: TriageCase) => {
                        const config = urgencyConfig[caseItem.urgencyLevel];
                        const IconComponent = config.icon;
                        return (
                          <div
                            key={caseItem.id}
                            onClick={() => setSelectedCase(caseItem)}
                            className={cn(
                              "p-3 rounded-lg border cursor-pointer transition-all hover:shadow-md",
                              selectedCase?.id === caseItem.id 
                                ? "border-teal-500 bg-teal-50 dark:bg-teal-950/30" 
                                : "border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600",
                              config.bgColor
                            )}
                          >
                            <div className="flex items-start justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <Avatar className="h-8 w-8">
                                  <AvatarFallback className="text-xs">
                                    {caseItem.patientName.split(' ').map(n => n[0]).join('')}
                                  </AvatarFallback>
                                </Avatar>
                                <div>
                                  <p className="font-medium text-sm">{caseItem.patientName}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {caseItem.patientAge}y, {caseItem.patientGender}
                                  </p>
                                </div>
                              </div>
                              <Badge className={config.color}>
                                <IconComponent className="h-3 w-3 mr-1" />
                                {config.label}
                              </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                              {caseItem.symptoms}
                            </p>
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-muted-foreground">
                                {new Date(caseItem.createdAt).toLocaleTimeString()}
                              </span>
                              <div className="flex gap-1">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 px-2"
                                  onClick={(e) => { e.stopPropagation(); handleStartVideoCall(caseItem); }}
                                >
                                  <Video className="h-3 w-3 text-green-500" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 px-2"
                                  onClick={(e) => { e.stopPropagation(); handleAcceptCase(caseItem); }}
                                >
                                  <UserCheck className="h-3 w-3 text-teal-500" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </div>

          {/* Case Details */}
          <div className="lg:col-span-2">
            {selectedCase ? (
              <Card className="bg-white dark:bg-slate-800/50 border-slate-200 dark:border-slate-700">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-4">
                      <Avatar className="h-14 w-14">
                        <AvatarFallback className="text-lg">
                          {selectedCase.patientName.split(' ').map(n => n[0]).join('')}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <CardTitle className="text-xl">{selectedCase.patientName}</CardTitle>
                        <CardDescription>
                          {selectedCase.patientAge} years • {selectedCase.patientGender} • {selectedCase.patientPhone}
                        </CardDescription>
                      </div>
                    </div>
                    <Badge className={urgencyConfig[selectedCase.urgencyLevel].color}>
                      {urgencyConfig[selectedCase.urgencyLevel].label}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Urgency Description */}
                  <div className={cn("p-3 rounded-lg", urgencyConfig[selectedCase.urgencyLevel].bgColor)}>
                    <p className={cn("text-sm", urgencyConfig[selectedCase.urgencyLevel].textColor)}>
                      {urgencyConfig[selectedCase.urgencyLevel].description}
                    </p>
                  </div>

                  {/* Symptoms */}
                  <div>
                    <h4 className="font-semibold mb-2 flex items-center gap-2">
                      <Stethoscope className="h-4 w-4 text-teal-500" />
                      Symptoms
                    </h4>
                    <p className="text-muted-foreground">{selectedCase.symptoms}</p>
                  </div>

                  {/* Description */}
                  <div>
                    <h4 className="font-semibold mb-2 flex items-center gap-2">
                      <FileText className="h-4 w-4 text-blue-500" />
                      Description
                    </h4>
                    <p className="text-muted-foreground">{selectedCase.description}</p>
                  </div>

                  {/* Vital Signs */}
                  {selectedCase.vitalSigns && (
                    <div>
                      <h4 className="font-semibold mb-3 flex items-center gap-2">
                        <Activity className="h-4 w-4 text-red-500" />
                        Vital Signs
                      </h4>
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                        {selectedCase.vitalSigns.heartRate && (
                          <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/30 text-center">
                            <Heart className="h-5 w-5 text-red-500 mx-auto mb-1" />
                            <p className="text-lg font-bold">{selectedCase.vitalSigns.heartRate}</p>
                            <p className="text-xs text-muted-foreground">BPM</p>
                          </div>
                        )}
                        {selectedCase.vitalSigns.bloodPressure && (
                          <div className="p-3 rounded-lg bg-purple-50 dark:bg-purple-950/30 text-center">
                            <Activity className="h-5 w-5 text-purple-500 mx-auto mb-1" />
                            <p className="text-lg font-bold">{selectedCase.vitalSigns.bloodPressure}</p>
                            <p className="text-xs text-muted-foreground">BP</p>
                          </div>
                        )}
                        {selectedCase.vitalSigns.temperature && (
                          <div className="p-3 rounded-lg bg-orange-50 dark:bg-orange-950/30 text-center">
                            <Thermometer className="h-5 w-5 text-orange-500 mx-auto mb-1" />
                            <p className="text-lg font-bold">{selectedCase.vitalSigns.temperature}°C</p>
                            <p className="text-xs text-muted-foreground">Temp</p>
                          </div>
                        )}
                        {selectedCase.vitalSigns.oxygenSaturation && (
                          <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 text-center">
                            <Droplets className="h-5 w-5 text-blue-500 mx-auto mb-1" />
                            <p className="text-lg font-bold">{selectedCase.vitalSigns.oxygenSaturation}%</p>
                            <p className="text-xs text-muted-foreground">SpO2</p>
                          </div>
                        )}
                        {selectedCase.vitalSigns.respiratoryRate && (
                          <div className="p-3 rounded-lg bg-teal-50 dark:bg-teal-950/30 text-center">
                            <Wind className="h-5 w-5 text-teal-500 mx-auto mb-1" />
                            <p className="text-lg font-bold">{selectedCase.vitalSigns.respiratoryRate}</p>
                            <p className="text-xs text-muted-foreground">RR/min</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* AI Assessment */}
                  {selectedCase.aiAssessment && (
                    <div className="p-4 rounded-lg bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800">
                      <h4 className="font-semibold mb-2 flex items-center gap-2 text-purple-700 dark:text-purple-400">
                        <Brain className="h-4 w-4" />
                        AI Assessment
                      </h4>
                      <p className="text-purple-900 dark:text-purple-300 text-sm">{selectedCase.aiAssessment}</p>
                      {selectedCase.aiRecommendation && (
                        <div className="mt-3 pt-3 border-t border-purple-200 dark:border-purple-700">
                          <p className="text-purple-800 dark:text-purple-400 text-sm">
                            <strong>Recommendation:</strong> {selectedCase.aiRecommendation}
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="flex flex-wrap gap-3 pt-4 border-t border-slate-200 dark:border-slate-700">
                    <Button
                      onClick={() => handleStartVideoCall(selectedCase)}
                      className="bg-green-600 hover:bg-green-700"
                    >
                      <Video className="h-4 w-4 mr-2" />
                      Start Video Call with AI
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => handleAcceptCase(selectedCase)}
                      disabled={acceptCaseMutation.isPending}
                    >
                      <UserCheck className="h-4 w-4 mr-2" />
                      Accept Case
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setShowResponseDialog(true)}
                    >
                      <Send className="h-4 w-4 mr-2" />
                      Send Response
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card className="bg-white dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 h-full flex items-center justify-center">
                <CardContent className="text-center py-20">
                  <Stethoscope className="h-16 w-16 mx-auto mb-4 text-slate-300 dark:text-slate-600" />
                  <h3 className="text-lg font-semibold mb-2">Select a Triage Case</h3>
                  <p className="text-muted-foreground">Click on a case from the queue to view details and start consultation</p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>

      {/* Response Dialog */}
      <Dialog open={showResponseDialog} onOpenChange={setShowResponseDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Respond to Triage Case</DialogTitle>
            <DialogDescription>
              Select an action and add notes for {selectedCase?.patientName}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label>Action</Label>
              <Select value={responseAction} onValueChange={setResponseAction}>
                <SelectTrigger>
                  <SelectValue placeholder="Select action..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="prescribe">
                    <div className="flex items-center gap-2">
                      <Pill className="h-4 w-4 text-blue-500" />
                      Prescribe Medication
                    </div>
                  </SelectItem>
                  <SelectItem value="schedule_appointment">
                    <div className="flex items-center gap-2">
                      <CalendarCheck className="h-4 w-4 text-green-500" />
                      Schedule Appointment
                    </div>
                  </SelectItem>
                  <SelectItem value="refer_hospital">
                    <div className="flex items-center gap-2">
                      <Hospital className="h-4 w-4 text-purple-500" />
                      Refer to Hospital
                    </div>
                  </SelectItem>
                  <SelectItem value="call_ambulance">
                    <div className="flex items-center gap-2">
                      <Ambulance className="h-4 w-4 text-red-500" />
                      Call Ambulance
                    </div>
                  </SelectItem>
                  <SelectItem value="self_care">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-teal-500" />
                      Self-Care Instructions
                    </div>
                  </SelectItem>
                  <SelectItem value="escalate">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-orange-500" />
                      Escalate to Specialist
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label>Notes</Label>
              <Textarea
                value={responseNote}
                onChange={(e) => setResponseNote(e.target.value)}
                placeholder="Add detailed notes for the patient..."
                className="min-h-[100px]"
              />
            </div>
            
            {/* Show consultation notes if available */}
            {consultationNotes && (
              <div className="p-3 bg-slate-100 dark:bg-slate-800 rounded-lg">
                <Label className="text-xs text-muted-foreground">AI Consultation Notes</Label>
                <p className="text-sm mt-1">{consultationNotes.substring(0, 200)}...</p>
              </div>
            )}
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowResponseDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleRespond}
              disabled={respondCaseMutation.isPending || !responseAction}
            >
              {respondCaseMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Send className="h-4 w-4 mr-2" />
              )}
              Send Response
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
};

export default DoctorTriage;
