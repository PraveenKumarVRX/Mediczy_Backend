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
import { analyzeVideoFrame, analyzeSceneWithGemini, initializeVisionAI, cleanupVisionAI, getTriageSummary, type VisionAnalysisResult, type CloudSceneAnalysis } from '@/services/visionAI';
import { initializeAudioAI, connectAudioStream, analyzeAudioFrame, analyzeAudioWithGemini, cleanupAudioAI, startFullCallRecording, stopFullCallRecording, getRecordingDuration, type AudioAnalysisResult, type CloudAudioAnalysis } from '@/services/audioAI';
import socketService from '@/services/socket.service';
import { IncomingCallNotification } from '@/components/IncomingCallNotification';
import { SimpleLiveKitRoom } from '@/components/video/LiveKitRoom';

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
  const [currentVideoToken, setCurrentVideoToken] = useState('');
  const [currentVideoServerUrl, setCurrentVideoServerUrl] = useState('');
  const [currentVideoJoinUrl, setCurrentVideoJoinUrl] = useState('');
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('disconnected');
  
  // AI Features state
  const [isAIEnabled, setIsAIEnabled] = useState(true);
  const [isVisionAIEnabled, setIsVisionAIEnabled] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [visionAnalysis, setVisionAnalysis] = useState<VisionAnalysisResult | null>(null);
  const [cloudSceneAnalysis, setCloudSceneAnalysis] = useState<CloudSceneAnalysis | null>(null);
  const [audioAnalysis, setAudioAnalysis] = useState<AudioAnalysisResult | null>(null);
  const [cloudAudioAnalysis, setCloudAudioAnalysis] = useState<CloudAudioAnalysis | null>(null);
  const [isAudioAIEnabled, setIsAudioAIEnabled] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
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

  // Patient-side AI analysis received via socket
  const [patientAIData, setPatientAIData] = useState<{
    vitalSigns?: any;
    sceneDescription?: string;
    visionAlerts?: string[];
    liveTranscript?: string[];
    aiSuggestions?: string[];
    timestamp?: number;
  } | null>(null);
  
  // Refs
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteAudioStreamRef = useRef<MediaStream | null>(null);
  const visionIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const cloudIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const audioIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const cloudAudioIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const recognitionRef = useRef<any>(null);
  
  // LiveKit base URL
  const LIVEKIT_BASE_URL = (import.meta.env.VITE_LIVEKIT_MEET_URL || import.meta.env.VITE_LIVEKIT_URL || 'https://video.mediqzy.com')
    .replace(/^wss:\/\//, 'https://')
    .replace(/^ws:\/\//, 'http://')
    .replace(/\/+$/, '')
    .replace(/\/rooms?$/, '');

  // Fetch triage cases
  const { data: triageCases, isLoading, isError, error: triageError, refetch } = useQuery({
    queryKey: ['doctor-triage-cases', activeTab],
    queryFn: async () => {
      const response = await api.get('/doctors/triage/cases', {
        params: { status: activeTab === 'all' ? undefined : activeTab }
      });
      return response.data.cases || [];
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
        return null;
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
      if (cloudIntervalRef.current) {
        clearInterval(cloudIntervalRef.current);
      }
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
      }
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      cleanupVisionAI();
      cleanupAudioAI();
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

    // Receive patient-side AI analysis during emergency call
    const handlePatientAIUpdate = (data: any) => {
      setPatientAIData(data);
    };
    socketService.on('patient-ai-update', handlePatientAIUpdate);

    // Listen for user status changes
    socketService.on('user-status-change', (data: any) => {
      console.log('👤 User status changed:', data);
    });

    // Cleanup on unmount
    return () => {
      console.log('🔌 Disconnecting Socket.IO');
      socketService.off('triage-call-request', handleTriageCallRequest);
      socketService.off('patient-ai-update', handlePatientAIUpdate);
      socketService.disconnect();
      setIsSocketConnected(false);
    };
  }, [currentDoctor?.id]);

  const playNotificationSound = () => {
    try {
      const ctx = new AudioContext();
      const playNote = (freq: number, start: number, dur: number, vol: number) => {
        const osc = ctx.createOscillator(); const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = 'square'; osc.frequency.setValueAtTime(freq, start);
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(vol, start + 0.01);
        gain.gain.linearRampToValueAtTime(0, start + dur);
        osc.start(start); osc.stop(start + dur);
      };
      // Urgent 3-beep alert
      const t = ctx.currentTime;
      playNote(880, t + 0.0, 0.12, 0.6);
      playNote(880, t + 0.2, 0.12, 0.6);
      playNote(1175, t + 0.4, 0.20, 0.55);
      setTimeout(() => ctx.close(), 1200);
    } catch (e) {
      // Audio playback failures should not block triage flow.
    }
  };

  // Shared helper: call accept-call, validate response, enter video — retries on 503
  const enterVideoCallAfterAccept = async (appointmentId: number, maxRetries = 2) => {
    let lastError: any = null;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await api.post('/doctors/triage/accept-call', { appointmentId });
        const lk = response.data.livekit;

        if (!lk?.token || !lk?.serverUrl) {
          throw new Error('Video service did not return credentials. Please retry.');
        }
        if (!response.data.appointment?.roomId) {
          throw new Error('No room ID returned from server.');
        }

        console.log(`✅ Joining room: ${response.data.appointment.roomId} (attempt ${attempt})`);
        setCurrentVideoToken(lk.token);
        setCurrentVideoServerUrl(lk.serverUrl);
        setIsInVideoCall(true);
        setConnectionStatus('connecting');
        startAIFeatures();
        setTimeout(() => setConnectionStatus('connected'), 3000);
        return; // success
      } catch (err: any) {
        lastError = err;
        const is503 = err.response?.status === 503;
        if (is503 && attempt < maxRetries) {
          console.warn(`⚠️ Video service unavailable, retrying (${attempt}/${maxRetries})...`);
          await new Promise(r => setTimeout(r, 1500 * attempt));
        } else {
          break;
        }
      }
    }
    throw lastError;
  };

  // Accept incoming triage call
  const handleAcceptIncomingCall = async (appointmentId: number) => {
    try {
      console.log('✅ Accepting call:', appointmentId);
      setIncomingCall(null);
      toast({ title: "✅ Call Accepted", description: "Setting up secure video room…" });

      await enterVideoCallAfterAccept(appointmentId);
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

  // Start video call with AI features (from triage case card)
  const handleStartVideoCall = async (caseItem: TriageCase) => {
    const appointmentId = caseItem.appointmentId;
    if (!appointmentId) {
      toast({ title: "Error", description: "No appointment linked to this case.", variant: "destructive" });
      return;
    }
    try {
      setSelectedCase(caseItem);
      toast({ title: "🎥 Connecting…", description: "Setting up secure video room…" });
      await enterVideoCallAfterAccept(appointmentId);
      toast({ title: "🎥 Video Consultation Started", description: "AI features enabled" });
    } catch (error: any) {
      console.error('Failed to start triage call:', error);
      const msg = error.response?.data?.message || error.message || 'Failed to start video call';
      toast({ title: "Video Setup Failed", description: msg, variant: "destructive" });
    }
  };

  // Open video in new tab (fallback)
  const openVideoInNewTab = () => {
    if (!currentVideoJoinUrl) return;
    try {
      const parsed = new URL(currentVideoJoinUrl);
      const isLegacyRoomUrl = parsed.hostname.includes('video.mediqzy.com') && parsed.pathname.startsWith('/rooms/');
      if (isLegacyRoomUrl) {
        toast({
          title: 'Open in new tab unavailable',
          description: 'Use in-app secure video. External /rooms links are not supported.',
          variant: 'destructive',
        });
        return;
      }
      window.open(currentVideoJoinUrl, '_blank');
    } catch {
      toast({
        title: 'Invalid meeting link',
        description: 'Could not open external meeting URL.',
        variant: 'destructive',
      });
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
    
    // Initialize Audio AI
    try {
      await initializeAudioAI();
      setIsAudioAIEnabled(true);
      // Audio analysis starts when remote audio stream connects (handleRemoteAudio)
    } catch (err) {
      console.warn('Audio AI initialization failed:', err);
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

  // Vision AI continuous analysis — analyzes REMOTE participant's video feed
  const startVisionAIAnalysis = async () => {
    try {
      // Check if remote video is available from LiveKit
      const videoSource = remoteVideoRef.current || localVideoRef.current;
      
      if (!videoSource) {
        // Fallback: start local camera if no remote video yet
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480 },
          audio: false
        });
        
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
          await localVideoRef.current.play();
        }
        localStreamRef.current = stream;
      }
      
      setIsVisionAIEnabled(true);
      
      // Edge analysis loop — every 2s
      visionIntervalRef.current = setInterval(async () => {
        // Prefer remote video (accident scene), fallback to local
        const source = remoteVideoRef.current || localVideoRef.current;
        if (source && isVisionAIEnabled && isInVideoCall) {
          try {
            const analysis = await analyzeVideoFrame(source);
            
            // Attach cloud analysis if available
            if (cloudSceneAnalysis) {
              analysis.cloudAnalysis = cloudSceneAnalysis;
            }
            
            setVisionAnalysis(analysis);
            
            // Update vital signs from vision analysis
            setVitalSigns({
              pulse: 'Not available from vision analysis',
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
      }, 2000);
      
      // Cloud analysis loop — Gemini Vision every 8s for intelligent scene understanding
      cloudIntervalRef.current = setInterval(async () => {
        const source = remoteVideoRef.current || localVideoRef.current;
        if (source && isVisionAIEnabled && isInVideoCall) {
          try {
            const cloudResult = await analyzeSceneWithGemini(source);
            if (cloudResult) {
              setCloudSceneAnalysis(cloudResult);
              
              // Push cloud hazards/insights as AI suggestions
              const cloudSuggestions: string[] = [];
              if (cloudResult.urgencyAssessment) {
                cloudSuggestions.push(`🤖 ${cloudResult.urgencyAssessment}`);
              }
              if (cloudResult.injuries.length > 0) {
                cloudSuggestions.push(`🩸 Injuries: ${cloudResult.injuries.join(', ')}`);
              }
              if (cloudResult.environmentHazards.length > 0) {
                cloudSuggestions.push(`⚠️ Hazards: ${cloudResult.environmentHazards.join(', ')}`);
              }
              if (cloudSuggestions.length > 0) {
                setAiSuggestions(prev => {
                  const merged = [...prev, ...cloudSuggestions];
                  return [...new Set(merged)].slice(-8);
                });
              }
            }
          } catch (err) {
            console.warn('Cloud analysis error:', err);
          }
        }
      }, 8000);
      
      toast({
        title: "👁️ Vision AI Active",
        description: remoteVideoRef.current 
          ? "Analyzing remote scene (accident/ambulance) with Edge + Cloud AI"
          : "Analyzing video for medical signs (will switch to remote when available)",
      });
    } catch (err) {
      console.error('Failed to start Vision AI:', err);
      setIsVisionAIEnabled(false);
    }
  };

  // Callback when remote video element changes from LiveKit
  const handleRemoteVideo = useCallback((video: HTMLVideoElement | null) => {
    remoteVideoRef.current = video;
    if (video && isVisionAIEnabled) {
      console.log('🎥 Remote video track captured — switching Vision AI to remote scene');
      toast({
        title: "📡 Remote Scene Connected",
        description: "Vision AI now analyzing the accident/ambulance scene",
      });
    }
  }, [isVisionAIEnabled]);

  // Callback when remote audio stream is available from LiveKit
  const handleRemoteAudio = useCallback(async (stream: MediaStream | null) => {
    remoteAudioStreamRef.current = stream;
    if (stream && isAudioAIEnabled) {
      console.log('🔊 Remote audio stream captured — starting Audio AI analysis');
      const connected = await connectAudioStream(stream);
      if (connected) {
        startAudioAIAnalysis();
        toast({
          title: "🔊 Audio AI Connected",
          description: "Listening to accident scene audio — edge + Gemini cloud analysis",
        });
      }
    }

    // Auto-start full session recording as soon as remote audio is available
    if (stream && !isRecording) {
      const started = startFullCallRecording(stream);
      if (started) {
        setIsRecording(true);
        recordingTimerRef.current = setInterval(() => {
          setRecordingDuration(getRecordingDuration());
        }, 1000);
        console.log('🔴 Session recording started automatically');
      }
    }
  }, [isAudioAIEnabled, isRecording]);

  // Audio AI continuous analysis — edge every 1s, cloud every 10s
  const startAudioAIAnalysis = () => {
    // Edge audio analysis — every 1s
    audioIntervalRef.current = setInterval(() => {
      if (isAudioAIEnabled && isInVideoCall) {
        const result = analyzeAudioFrame();
        if (result) {
          setAudioAnalysis(result);
          
          // Push audio alerts as AI suggestions
          if (result.alerts.length > 0) {
            setAiSuggestions(prev => {
              const merged = [...prev, ...result.alerts];
              return [...new Set(merged)].slice(-8);
            });
          }
        }
      }
    }, 1000);

    // Cloud audio analysis — Gemini every 10s
    cloudAudioIntervalRef.current = setInterval(async () => {
      if (isAudioAIEnabled && isInVideoCall) {
        try {
          const cloudResult = await analyzeAudioWithGemini();
          if (cloudResult) {
            setCloudAudioAnalysis(cloudResult);
            
            // Push audio cloud insights
            const audioSuggestions: string[] = [];
            if (cloudResult.distressLevel !== 'none') {
              audioSuggestions.push(`🔊 Audio: ${cloudResult.distressLevel} distress detected`);
            }
            if (cloudResult.patientSounds.length > 0) {
              audioSuggestions.push(`🩺 Patient sounds: ${cloudResult.patientSounds.join(', ')}`);
            }
            if (audioSuggestions.length > 0) {
              setAiSuggestions(prev => {
                const merged = [...prev, ...audioSuggestions];
                return [...new Set(merged)].slice(-8);
              });
            }
          }
        } catch (err) {
          console.warn('Cloud audio analysis error:', err);
        }
      }
    }, 10000);
  };

  // Stop Audio AI
  const stopAudioAI = () => {
    if (audioIntervalRef.current) {
      clearInterval(audioIntervalRef.current);
      audioIntervalRef.current = null;
    }
    if (cloudAudioIntervalRef.current) {
      clearInterval(cloudAudioIntervalRef.current);
      cloudAudioIntervalRef.current = null;
    }
    remoteAudioStreamRef.current = null;
    setIsAudioAIEnabled(false);
    setAudioAnalysis(null);
    setCloudAudioAnalysis(null);
    cleanupAudioAI();
  };

  // Start/Stop full call recording (wired to the Recording button)
  const toggleRecording = async () => {
    if (isRecording) {
      // Stop recording
      const blob = await stopFullCallRecording();
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
      setIsRecording(false);
      setRecordingDuration(0);
      
      if (blob) {
        // Save recording as downloadable file
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `triage-recording-${selectedCase?.patientName || 'unknown'}-${new Date().toISOString().slice(0, 19)}.webm`;
        a.click();
        URL.revokeObjectURL(url);
        toast({
          title: "Recording Saved",
          description: `Audio recording downloaded (${Math.round(blob.size / 1024)} KB)`,
        });
      }
    } else {
      // Start recording — use remote audio stream if available
      const stream = remoteAudioStreamRef.current;
      if (stream) {
        const started = startFullCallRecording(stream);
        if (started) {
          setIsRecording(true);
          // Update duration counter
          recordingTimerRef.current = setInterval(() => {
            setRecordingDuration(getRecordingDuration());
          }, 1000);
          toast({ title: "🎙️ Recording Started", description: "Capturing scene audio" });
        }
      } else {
        toast({
          title: "No Audio Stream",
          description: "Remote audio not yet connected — start a video call first",
          variant: "destructive",
        });
      }
    }
  };

  // Stop Vision AI
  const stopVisionAI = () => {
    if (visionIntervalRef.current) {
      clearInterval(visionIntervalRef.current);
      visionIntervalRef.current = null;
    }
    if (cloudIntervalRef.current) {
      clearInterval(cloudIntervalRef.current);
      cloudIntervalRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
    }
    remoteVideoRef.current = null;
    setIsVisionAIEnabled(false);
    setCloudSceneAnalysis(null);
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
  const endVideoCall = async () => {
    setIsInVideoCall(false);
    setConnectionStatus('disconnected');
    setCurrentVideoToken('');
    setCurrentVideoServerUrl('');
    setCurrentVideoJoinUrl('');
    stopVisionAI();
    stopAudioAI();
    // Auto-save recording if active
    if (isRecording) {
      const blob = await stopFullCallRecording();
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
      setIsRecording(false);
      setRecordingDuration(0);
      if (blob && blob.size > 0) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `session-${selectedCase?.patientName || 'triage'}-${new Date().toISOString().slice(0, 19)}.webm`;
        a.click();
        URL.revokeObjectURL(url);
        toast({ title: "🔴 Session Recording Saved", description: `Audio downloaded (${Math.round(blob.size / 1024)} KB)` });
      }
    }
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
    setAudioAnalysis(null);
    setCloudAudioAnalysis(null);
    
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
    const patientAISection = patientAIData ? `\n\n--- Patient-side AI Analysis (Dr. iSHA) ---\nVitals: ${JSON.stringify(patientAIData.vitalSigns || {})}\nScene: ${patientAIData.sceneDescription || ''}\nAlerts: ${(patientAIData.visionAlerts || []).join(', ')}\nTranscript: ${(patientAIData.liveTranscript || []).join(' ')}` : '';
    const fullNotes = `${responseNote}\n\n--- AI Consultation Notes ---\n${consultationNotes}\n\n--- Live Transcript ---\n${liveTranscript.join('\n')}${patientAISection}`;
    
    respondCaseMutation.mutate({
      caseId: selectedCase.id,
      action: responseAction,
      notes: fullNotes
    });
  };

  const urgencyOrder = { IMMEDIATE: 0, URGENT: 1, LESS_URGENT: 2, NON_URGENT: 3 };
  const filteredCases = (triageCases?.filter((c: TriageCase) => {
    if (activeTab === 'all') return true;
    if (activeTab === 'pending') return c.status === 'pending';
    if (activeTab === 'in_progress') return ['in_review', 'in_consultation'].includes(c.status);
    if (activeTab === 'resolved') return ['resolved', 'referred', 'escalated'].includes(c.status);
    return true;
  }) || []).sort((a, b) => {
    const ua = urgencyOrder[a.urgencyLevel] ?? 9;
    const ub = urgencyOrder[b.urgencyLevel] ?? 9;
    if (ua !== ub) return ua - ub;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  const formatTimeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  // Video Call UI Component - renders inline to prevent remounting
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
          {isAudioAIEnabled && (
            <Badge className="bg-purple-600/80 text-white text-xs">
              🔊 Audio AI
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
          {currentVideoToken && currentVideoServerUrl ? (
            <SimpleLiveKitRoom
              serverUrl={currentVideoServerUrl}
              token={currentVideoToken}
              onRemoteVideo={handleRemoteVideo}
              onRemoteAudio={handleRemoteAudio}
            />
          ) : isInVideoCall ? (
            <div className="h-full w-full flex flex-col items-center justify-center gap-4 text-slate-300">
              <div className="animate-spin h-8 w-8 border-2 border-cyan-400 border-t-transparent rounded-full" />
              <p>Connecting to secure video session…</p>
              <button
                className="text-sm text-cyan-400 underline hover:text-cyan-300"
                onClick={() => {
                  if (selectedCase?.appointmentId) {
                    enterVideoCallAfterAccept(selectedCase.appointmentId).catch(err => {
                      toast({ title: "Retry Failed", description: err.message, variant: "destructive" });
                    });
                  }
                }}
              >
                Retry connection
              </button>
            </div>
          ) : (
            <div className="h-full w-full flex items-center justify-center text-slate-300">
              Select a case and start a video call.
            </div>
          )}
          
          {/* Vision AI Overlay */}
          {isVisionAIEnabled && (
            <div className="absolute top-4 left-4 bg-black/80 backdrop-blur-sm rounded-xl p-3 max-w-sm shadow-2xl border border-cyan-500/30">
              <h4 className="text-cyan-400 text-sm font-semibold mb-2 flex items-center gap-2">
                <Eye className="h-4 w-4" />
                <span>Vision AI</span>
                <span className="ml-auto text-[10px] text-cyan-300/60 animate-pulse">● LIVE</span>
              </h4>
              {visionAnalysis ? (
                <div className="text-white/80 space-y-1.5 text-xs">
                  {/* Edge analysis */}
                  <div className="flex items-center gap-3 flex-wrap">
                    <span>👤 {visionAnalysis.personDetected ? 'Person' : 'No person'}</span>
                    <span>🏃 {visionAnalysis.motionType}</span>
                    <span>📊 {visionAnalysis.motionLevel?.toFixed(0) || 0}%</span>
                    {visionAnalysis.poseData && (
                      <span>🧍 {visionAnalysis.poseData.isLying ? 'Lying' : visionAnalysis.poseData.isSeated ? 'Seated' : 'Standing'}</span>
                    )}
                  </div>
                  {/* Cloud AI scene analysis */}
                  {cloudSceneAnalysis && (
                    <div className="mt-2 pt-2 border-t border-cyan-500/20 space-y-1">
                      <div className="flex items-center gap-1.5 text-[11px] text-cyan-300 font-medium">
                        <Zap className="h-3 w-3" /> Gemini Scene AI
                        <span className="ml-auto text-[9px] text-cyan-400/50">{Math.round(cloudSceneAnalysis.confidence * 100)}%</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <Badge variant="outline" className="text-[9px] border-cyan-500/40 text-cyan-200 px-1.5 py-0">
                          {cloudSceneAnalysis.sceneType?.replace('_', ' ')}
                        </Badge>
                        {cloudSceneAnalysis.victimCount > 0 && (
                          <Badge variant="outline" className="text-[9px] border-red-500/40 text-red-200 px-1.5 py-0">
                            {cloudSceneAnalysis.victimCount} victim{cloudSceneAnalysis.victimCount > 1 ? 's' : ''}
                          </Badge>
                        )}
                        <Badge variant="outline" className="text-[9px] border-amber-500/40 text-amber-200 px-1.5 py-0">
                          {cloudSceneAnalysis.crowdLevel}
                        </Badge>
                        <Badge variant="outline" className="text-[9px] border-slate-400/40 text-slate-200 px-1.5 py-0">
                          {cloudSceneAnalysis.lightingCondition}
                        </Badge>
                      </div>
                      {cloudSceneAnalysis.injuries.length > 0 && (
                        <p className="text-red-300 text-[10px]">🩸 {cloudSceneAnalysis.injuries.slice(0, 2).join('; ')}</p>
                      )}
                      {cloudSceneAnalysis.environmentHazards.length > 0 && (
                        <p className="text-amber-300 text-[10px]">⚠️ {cloudSceneAnalysis.environmentHazards.slice(0, 2).join('; ')}</p>
                      )}
                      <p className="text-cyan-100/90 text-[10px] italic">{cloudSceneAnalysis.urgencyAssessment}</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2 text-white/50 text-xs">
                  <Loader2 className="h-3 w-3 animate-spin" /> Initializing edge + cloud AI...
                </div>
              )}
            </div>
          )}
          
          {/* Audio AI Overlay */}
          {isAudioAIEnabled && (
            <div className="absolute bottom-4 left-4 bg-black/80 backdrop-blur-sm rounded-xl p-3 max-w-xs shadow-2xl border border-purple-500/30">
              <h4 className="text-purple-400 text-sm font-semibold mb-2 flex items-center gap-2">
                <Volume2 className="h-4 w-4" />
                <span>Audio AI</span>
                <span className="ml-auto text-[10px] text-purple-300/60 animate-pulse">● LIVE</span>
              </h4>
              {audioAnalysis ? (
                <div className="text-white/80 space-y-1.5 text-xs">
                  {/* Edge audio analysis */}
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="flex items-center gap-1">
                      🔊 {audioAnalysis.volumeLevel}%
                      <div className="w-16 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                        <div
                          className={cn("h-full rounded-full transition-all", audioAnalysis.volumeLevel > 60 ? "bg-red-500" : audioAnalysis.volumeLevel > 30 ? "bg-amber-500" : "bg-green-500")}
                          style={{ width: `${audioAnalysis.volumeLevel}%` }}
                        />
                      </div>
                    </span>
                    <span>{audioAnalysis.isSpeechDetected ? '🗣️ Speech' : '🔇 No speech'}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant="outline" className={cn("text-[9px] px-1.5 py-0", {
                      'border-green-500/40 text-green-200': audioAnalysis.audioPattern === 'silence' || audioAnalysis.audioPattern === 'ambient_noise',
                      'border-blue-500/40 text-blue-200': audioAnalysis.audioPattern === 'speech',
                      'border-amber-500/40 text-amber-200': audioAnalysis.audioPattern === 'shouting' || audioAnalysis.audioPattern === 'crowd_noise',
                      'border-red-500/40 text-red-200': audioAnalysis.audioPattern === 'distress_vocalization' || audioAnalysis.audioPattern === 'impact_sound',
                      'border-purple-500/40 text-purple-200': audioAnalysis.audioPattern === 'siren_detected',
                    })}>
                      {audioAnalysis.audioPattern.replace(/_/g, ' ')}
                    </Badge>
                    <Badge variant="outline" className="text-[9px] border-slate-400/40 text-slate-200 px-1.5 py-0">
                      {audioAnalysis.dominantFrequency} Hz
                    </Badge>
                  </div>
                  {/* Cloud audio analysis */}
                  {cloudAudioAnalysis && (
                    <div className="mt-2 pt-2 border-t border-purple-500/20 space-y-1">
                      <div className="flex items-center gap-1.5 text-[11px] text-purple-300 font-medium">
                        <Zap className="h-3 w-3" /> Gemini Audio AI
                        <span className="ml-auto text-[9px] text-purple-400/50">{Math.round(cloudAudioAnalysis.confidence * 100)}%</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <Badge variant="outline" className="text-[9px] border-purple-500/40 text-purple-200 px-1.5 py-0">
                          {cloudAudioAnalysis.sceneAudioType?.replace(/_/g, ' ')}
                        </Badge>
                        <Badge variant="outline" className={cn("text-[9px] px-1.5 py-0", {
                          'border-green-500/40 text-green-200': cloudAudioAnalysis.distressLevel === 'none' || cloudAudioAnalysis.distressLevel === 'mild',
                          'border-amber-500/40 text-amber-200': cloudAudioAnalysis.distressLevel === 'moderate',
                          'border-red-500/40 text-red-200': cloudAudioAnalysis.distressLevel === 'severe' || cloudAudioAnalysis.distressLevel === 'critical',
                        })}>
                          Distress: {cloudAudioAnalysis.distressLevel}
                        </Badge>
                        {cloudAudioAnalysis.speakerCount > 0 && (
                          <Badge variant="outline" className="text-[9px] border-blue-500/40 text-blue-200 px-1.5 py-0">
                            {cloudAudioAnalysis.speakerCount} speaker{cloudAudioAnalysis.speakerCount > 1 ? 's' : ''}
                          </Badge>
                        )}
                      </div>
                      {cloudAudioAnalysis.patientSounds.length > 0 && (
                        <p className="text-red-300 text-[10px]">🩺 {cloudAudioAnalysis.patientSounds.join(', ')}</p>
                      )}
                      <p className="text-purple-200/80 text-[10px]">🫁 Breathing: {cloudAudioAnalysis.breathingPattern?.replace(/_/g, ' ')}</p>
                      {cloudAudioAnalysis.dominantSounds.length > 0 && (
                        <p className="text-slate-300 text-[10px]">🎵 {cloudAudioAnalysis.dominantSounds.slice(0, 3).join(', ')}</p>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2 text-white/50 text-xs">
                  <Loader2 className="h-3 w-3 animate-spin" /> Waiting for remote audio...
                </div>
              )}
            </div>
          )}
          
          {/* Alerts Overlay */}
          {(visionAlerts.length > 0 || (audioAnalysis?.alerts?.length ?? 0) > 0) && (
            <div className="absolute top-4 right-4 bg-red-900/90 backdrop-blur-sm rounded-xl p-3 max-w-xs border border-red-500 shadow-2xl">
              <h4 className="text-red-400 text-sm font-semibold mb-2 flex items-center gap-2">🚨 Alerts</h4>
              {visionAlerts.map((alert, i) => (
                <p key={`v-${i}`} className="text-red-200 text-xs mb-1">{alert}</p>
              ))}
              {audioAnalysis?.alerts?.map((alert, i) => (
                <p key={`a-${i}`} className="text-red-200 text-xs mb-1">{alert}</p>
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
                {isRecording && (
                  <span className="ml-1 text-[10px] text-red-400 animate-pulse font-medium">● REC</span>
                )}
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
              {/* Patient-side AI data received via socket */}
              {patientAIData && (
                <div className="mb-4 bg-green-900/30 rounded-lg p-3 border border-green-500/30">
                  <h5 className="text-green-400 text-sm font-semibold mb-2 flex items-center gap-2">
                    <img src="/isha.png" alt="Dr. iSHA" className="h-4 w-4 rounded-full object-cover" />
                    Patient AI (Dr. iSHA)
                    <span className="ml-auto text-[9px] text-green-300/50 animate-pulse">● Live</span>
                  </h5>
                  {patientAIData.vitalSigns && (
                    <div className="mb-2 text-xs space-y-0.5">
                      <p className="text-green-200/80">❤️ {patientAIData.vitalSigns.pulse}</p>
                      <p className="text-green-200/80">🫁 {patientAIData.vitalSigns.breathing}</p>
                      <p className="text-green-200/80">🧠 {patientAIData.vitalSigns.consciousness}</p>
                    </div>
                  )}
                  {patientAIData.sceneDescription && (
                    <p className="text-green-100/70 text-[11px] mb-2 italic">{patientAIData.sceneDescription}</p>
                  )}
                  {patientAIData.visionAlerts && patientAIData.visionAlerts.length > 0 && (
                    <div className="mb-2 space-y-0.5">
                      {patientAIData.visionAlerts.map((a, i) => (
                        <p key={i} className="text-amber-300 text-[11px]">⚠️ {a}</p>
                      ))}
                    </div>
                  )}
                  {patientAIData.liveTranscript && patientAIData.liveTranscript.length > 0 && (
                    <div className="mb-2 bg-slate-800/60 rounded p-2">
                      <p className="text-green-300 text-[10px] font-medium mb-1">🎙 Patient says:</p>
                      {patientAIData.liveTranscript.map((t, i) => (
                        <p key={i} className="text-white/70 text-[10px]">{t}</p>
                      ))}
                    </div>
                  )}
                  {patientAIData.aiSuggestions && patientAIData.aiSuggestions.length > 0 && (
                    <div className="space-y-0.5">
                      {patientAIData.aiSuggestions.map((s, i) => (
                        <p key={i} className="text-teal-300 text-[10px]">{s}</p>
                      ))}
                    </div>
                  )}
                </div>
              )}

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
                  <h5 className="text-blue-400 text-sm font-semibold mb-2">👁️ Edge Scene Analysis</h5>
                  <p className="text-blue-200 text-xs">{sceneDescription}</p>
                </div>
              )}

              {/* Cloud AI Scene Intelligence */}
              {cloudSceneAnalysis && (
                <div className="mb-4 bg-gradient-to-br from-cyan-900/40 to-blue-900/30 rounded-lg p-3 border border-cyan-500/30">
                  <h5 className="text-cyan-400 text-sm font-semibold mb-2 flex items-center gap-2">
                    <Zap className="h-3.5 w-3.5" /> Gemini Scene Intelligence
                    <span className="ml-auto text-[9px] text-cyan-300/50">{Math.round(cloudSceneAnalysis.confidence * 100)}% conf</span>
                  </h5>
                  <div className="space-y-2 text-xs">
                    <div className="flex flex-wrap gap-1">
                      <Badge className="bg-slate-700/80 text-cyan-200 text-[10px]">{cloudSceneAnalysis.sceneType?.replace('_', ' ')}</Badge>
                      {cloudSceneAnalysis.victimCount > 0 && (
                        <Badge className="bg-red-800/60 text-red-200 text-[10px]">{cloudSceneAnalysis.victimCount} victim{cloudSceneAnalysis.victimCount > 1 ? 's' : ''}</Badge>
                      )}
                      <Badge className="bg-amber-800/50 text-amber-200 text-[10px]">Crowd: {cloudSceneAnalysis.crowdLevel}</Badge>
                    </div>
                    
                    {cloudSceneAnalysis.injuries.length > 0 && (
                      <div className="bg-red-900/30 rounded p-2 border border-red-500/20">
                        <p className="text-red-300 font-medium text-[10px] mb-1">🩸 Visible Injuries</p>
                        {cloudSceneAnalysis.injuries.map((inj, i) => (
                          <p key={i} className="text-red-200/80 text-[10px] ml-2">• {inj}</p>
                        ))}
                      </div>
                    )}
                    
                    {cloudSceneAnalysis.environmentHazards.length > 0 && (
                      <div className="bg-amber-900/30 rounded p-2 border border-amber-500/20">
                        <p className="text-amber-300 font-medium text-[10px] mb-1">⚠️ Hazards</p>
                        {cloudSceneAnalysis.environmentHazards.map((h, i) => (
                          <p key={i} className="text-amber-200/80 text-[10px] ml-2">• {h}</p>
                        ))}
                      </div>
                    )}
                    
                    <div className="bg-cyan-900/30 rounded p-2 border border-cyan-500/20">
                      <p className="text-cyan-300 font-medium text-[10px] mb-1">🎯 Triage Recommendation</p>
                      <p className="text-cyan-100/80 text-[10px]">{cloudSceneAnalysis.triageRecommendation}</p>
                    </div>
                    
                    {cloudSceneAnalysis.actionableInsights.length > 0 && (
                      <div className="bg-green-900/30 rounded p-2 border border-green-500/20">
                        <p className="text-green-300 font-medium text-[10px] mb-1">📋 Immediate Actions</p>
                        {cloudSceneAnalysis.actionableInsights.map((action, i) => (
                          <p key={i} className="text-green-200/80 text-[10px] ml-2">{i + 1}. {action}</p>
                        ))}
                      </div>
                    )}

                    {cloudSceneAnalysis.visibleEquipment.length > 0 && (
                      <p className="text-slate-300 text-[10px]">🧰 Equipment: {cloudSceneAnalysis.visibleEquipment.join(', ')}</p>
                    )}
                    <p className="text-slate-400 text-[10px]">💡 Lighting: {cloudSceneAnalysis.lightingCondition}</p>
                  </div>
                </div>
              )}
              
              {/* Gemini Audio Intelligence */}
              {cloudAudioAnalysis && (
                <div className="mb-4 bg-gradient-to-br from-purple-900/40 to-indigo-900/30 rounded-lg p-3 border border-purple-500/30">
                  <h5 className="text-purple-400 text-sm font-semibold mb-2 flex items-center gap-2">
                    <Volume2 className="h-3.5 w-3.5" /> Gemini Audio Intelligence
                    <span className="ml-auto text-[9px] text-purple-300/50">{Math.round(cloudAudioAnalysis.confidence * 100)}% conf</span>
                  </h5>
                  <div className="space-y-2 text-xs">
                    <div className="flex flex-wrap gap-1">
                      <Badge className="bg-slate-700/80 text-purple-200 text-[10px]">{cloudAudioAnalysis.sceneAudioType?.replace(/_/g, ' ')}</Badge>
                      <Badge className={cn("text-[10px]", {
                        'bg-green-800/50 text-green-200': cloudAudioAnalysis.distressLevel === 'none' || cloudAudioAnalysis.distressLevel === 'mild',
                        'bg-amber-800/50 text-amber-200': cloudAudioAnalysis.distressLevel === 'moderate',
                        'bg-red-800/50 text-red-200': cloudAudioAnalysis.distressLevel === 'severe' || cloudAudioAnalysis.distressLevel === 'critical',
                      })}>Distress: {cloudAudioAnalysis.distressLevel}</Badge>
                      {cloudAudioAnalysis.speakerCount > 0 && (
                        <Badge className="bg-blue-800/50 text-blue-200 text-[10px]">{cloudAudioAnalysis.speakerCount} speaker{cloudAudioAnalysis.speakerCount > 1 ? 's' : ''}</Badge>
                      )}
                    </div>
                    
                    {cloudAudioAnalysis.dominantSounds.length > 0 && (
                      <div className="bg-indigo-900/30 rounded p-2 border border-indigo-500/20">
                        <p className="text-indigo-300 font-medium text-[10px] mb-1">🎵 Dominant Sounds</p>
                        {cloudAudioAnalysis.dominantSounds.map((s, i) => (
                          <p key={i} className="text-indigo-200/80 text-[10px] ml-2">• {s}</p>
                        ))}
                      </div>
                    )}

                    {cloudAudioAnalysis.patientSounds.length > 0 && (
                      <div className="bg-red-900/30 rounded p-2 border border-red-500/20">
                        <p className="text-red-300 font-medium text-[10px] mb-1">🩺 Patient Sounds</p>
                        {cloudAudioAnalysis.patientSounds.map((s, i) => (
                          <p key={i} className="text-red-200/80 text-[10px] ml-2">• {s}</p>
                        ))}
                      </div>
                    )}

                    <div className="bg-purple-900/30 rounded p-2 border border-purple-500/20">
                      <p className="text-purple-300 font-medium text-[10px] mb-1">🫁 Breathing Pattern</p>
                      <p className="text-purple-100/80 text-[10px]">{cloudAudioAnalysis.breathingPattern?.replace(/_/g, ' ')}</p>
                    </div>

                    {cloudAudioAnalysis.urgencyIndicators.length > 0 && (
                      <div className="bg-red-900/30 rounded p-2 border border-red-500/20">
                        <p className="text-red-300 font-medium text-[10px] mb-1">🚨 Urgency Indicators</p>
                        {cloudAudioAnalysis.urgencyIndicators.map((u, i) => (
                          <p key={i} className="text-red-200/80 text-[10px] ml-2">• {u}</p>
                        ))}
                      </div>
                    )}

                    {cloudAudioAnalysis.environmentSounds.length > 0 && (
                      <p className="text-slate-300 text-[10px]">🌍 Environment: {cloudAudioAnalysis.environmentSounds.join(', ')}</p>
                    )}

                    {cloudAudioAnalysis.audioInsights.length > 0 && (
                      <div className="bg-green-900/30 rounded p-2 border border-green-500/20">
                        <p className="text-green-300 font-medium text-[10px] mb-1">💡 Audio Insights</p>
                        {cloudAudioAnalysis.audioInsights.map((a, i) => (
                          <p key={i} className="text-green-200/80 text-[10px] ml-2">{i + 1}. {a}</p>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Edge Audio Analysis */}
              {audioAnalysis && (
                <div className="mb-4 bg-indigo-900/30 rounded-lg p-3 border border-indigo-500/30">
                  <h5 className="text-indigo-400 text-sm font-semibold mb-2 flex items-center gap-2">
                    <Volume2 className="h-4 w-4" /> Edge Audio Analysis
                    {isAudioAIEnabled && <span className="text-[10px] text-indigo-300 animate-pulse">● Live</span>}
                  </h5>
                  <div className="space-y-1 text-xs text-indigo-200/80">
                    <div className="flex items-center gap-2">
                      <span>Volume:</span>
                      <div className="flex-1 h-2 bg-slate-700 rounded-full overflow-hidden">
                        <div
                          className={cn("h-full rounded-full transition-all", audioAnalysis.volumeLevel > 60 ? "bg-red-500" : audioAnalysis.volumeLevel > 30 ? "bg-amber-500" : "bg-green-500")}
                          style={{ width: `${audioAnalysis.volumeLevel}%` }}
                        />
                      </div>
                      <span className="text-[10px] w-8 text-right">{audioAnalysis.volumeLevel}%</span>
                    </div>
                    <p>Pattern: <span className="text-white">{audioAnalysis.audioPattern.replace(/_/g, ' ')}</span></p>
                    <p>Speech: <span className="text-white">{audioAnalysis.isSpeechDetected ? 'Yes' : 'No'}</span> | Freq: <span className="text-white">{audioAnalysis.dominantFrequency} Hz</span></p>
                    <div className="flex gap-2 text-[10px]">
                      <span>Bass: {audioAnalysis.frequencyBands.bass}</span>
                      <span>Mid: {audioAnalysis.frequencyBands.midLow}/{audioAnalysis.frequencyBands.midHigh}</span>
                      <span>Treble: {audioAnalysis.frequencyBands.treble}</span>
                    </div>
                  </div>
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
            
            {/* Recording Button — now wired to actual MediaRecorder */}
            <div className="p-3 border-t border-slate-700">
              <Button
                variant={isRecording ? "destructive" : "default"}
                onClick={toggleRecording}
                className="w-full"
              >
                {isRecording ? (
                  <>
                    <div className="h-2 w-2 rounded-full bg-white mr-2 animate-pulse" />
                    Stop Recording
                  </>
                ) : (
                  <>
                    <Mic className="h-4 w-4 mr-2" />
                    Record Scene Audio
                  </>
                )}
              </Button>
              {isRecording && (
                <p className="text-center text-xs text-red-400 mt-2 animate-pulse">
                  🔴 Recording — {Math.floor(recordingDuration / 60)}:{String(recordingDuration % 60).padStart(2, '0')}
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
          variant={isAudioAIEnabled ? "default" : "outline"}
          onClick={async () => {
            if (isAudioAIEnabled) {
              stopAudioAI();
            } else {
              await initializeAudioAI();
              setIsAudioAIEnabled(true);
              if (remoteAudioStreamRef.current) {
                await connectAudioStream(remoteAudioStreamRef.current);
                startAudioAIAnalysis();
              }
            }
          }}
          className={cn(
            isAudioAIEnabled ? "bg-purple-600 hover:bg-purple-700" : "border-slate-600 text-white"
          )}
        >
          <Volume2 className="h-4 w-4 mr-2" />
          Audio AI {isAudioAIEnabled ? 'ON' : 'OFF'}
        </Button>
        
        <Button
          variant={showScribePanel ? "default" : "outline"}
          onClick={() => setShowScribePanel(!showScribePanel)}
          className={cn(
            showScribePanel ? "bg-indigo-600 hover:bg-indigo-700" : "border-slate-600 text-white"
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
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <Card className="bg-white dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Total</p>
                  <p className="text-2xl font-bold mt-1">{stats?.total || 0}</p>
                </div>
                <div className="p-2 rounded-lg bg-slate-100 dark:bg-slate-700/50">
                  <ClipboardList className="h-5 w-5 text-slate-500" />
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-white dark:bg-slate-800/50 border-l-4 border-l-orange-500 shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-orange-600 dark:text-orange-400">Pending</p>
                  <p className="text-2xl font-bold text-orange-600 dark:text-orange-400 mt-1">{stats?.pending || 0}</p>
                </div>
                <div className="p-2 rounded-lg bg-orange-100 dark:bg-orange-900/30">
                  <Clock className="h-5 w-5 text-orange-500" />
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-white dark:bg-slate-800/50 border-l-4 border-l-blue-500 shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-blue-600 dark:text-blue-400">In Progress</p>
                  <p className="text-2xl font-bold text-blue-600 dark:text-blue-400 mt-1">{stats?.inProgress || 0}</p>
                </div>
                <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                  <Activity className="h-5 w-5 text-blue-500" />
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-white dark:bg-slate-800/50 border-l-4 border-l-red-500 shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-red-600 dark:text-red-400">Immediate</p>
                  <p className="text-2xl font-bold text-red-600 dark:text-red-400 mt-1">{stats?.immediate || 0}</p>
                </div>
                <div className="p-2 rounded-lg bg-red-100 dark:bg-red-900/30">
                  <AlertTriangle className="h-5 w-5 text-red-500 animate-pulse" />
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-white dark:bg-slate-800/50 border-l-4 border-l-amber-500 shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-amber-600 dark:text-amber-400">Urgent</p>
                  <p className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-1">{stats?.urgent || 0}</p>
                </div>
                <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/30">
                  <AlertCircle className="h-5 w-5 text-amber-500" />
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-white dark:bg-slate-800/50 border-l-4 border-l-green-500 shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-green-600 dark:text-green-400">Resolved</p>
                  <p className="text-2xl font-bold text-green-600 dark:text-green-400 mt-1">{stats?.resolved || 0}</p>
                </div>
                <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30">
                  <CheckCircle className="h-5 w-5 text-green-500" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
          {/* Triage Queue */}
          <div className="lg:col-span-1">
            <Card className="bg-white dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 shadow-sm">
              <CardHeader className="pb-3 px-3 sm:px-6">
                <div className="flex items-center justify-between mb-2">
                  <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                    Triage Queue
                    {filteredCases.length > 0 && (
                      <Badge variant="secondary" className="text-xs">{filteredCases.length}</Badge>
                    )}
                  </CardTitle>
                  {isSocketConnected && (
                    <div className="flex items-center gap-1.5 text-xs text-green-500">
                      <Wifi className="h-3 w-3" />
                      <span className="hidden sm:inline">Live</span>
                    </div>
                  )}
                </div>
                <Tabs value={activeTab} onValueChange={setActiveTab}>
                  <TabsList className="grid grid-cols-4 w-full">
                    <TabsTrigger value="pending" className="text-xs">Pending</TabsTrigger>
                    <TabsTrigger value="in_progress" className="text-xs">Active</TabsTrigger>
                    <TabsTrigger value="resolved" className="text-xs">Done</TabsTrigger>
                    <TabsTrigger value="all" className="text-xs">All</TabsTrigger>
                  </TabsList>
                </Tabs>
              </CardHeader>
              <CardContent className="px-3 sm:px-6">
                <ScrollArea className="h-[400px] sm:h-[500px] lg:h-[calc(100vh-380px)]">
                  {isLoading ? (
                    <div className="flex items-center justify-center py-10">
                      <Loader2 className="h-8 w-8 animate-spin text-teal-500" />
                    </div>
                  ) : isError ? (
                    <div className="text-center py-10 text-muted-foreground">
                      <AlertTriangle className="h-12 w-12 mx-auto mb-3 text-red-500" />
                      <p className="font-medium">Unable to load triage cases</p>
                      <p className="text-xs mt-1">{triageError instanceof Error ? triageError.message : 'Check the connection and try again.'}</p>
                      <Button variant="outline" size="sm" className="mt-3" onClick={() => refetch()}>
                        <RefreshCw className="h-4 w-4 mr-2" />Retry
                      </Button>
                    </div>
                  ) : filteredCases.length === 0 ? (
                    <div className="text-center py-10 text-muted-foreground">
                      <Stethoscope className="h-12 w-12 mx-auto mb-3 opacity-50" />
                      <p className="font-medium">No triage cases</p>
                      <p className="text-xs mt-1">Cases will appear here in real-time</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {filteredCases.map((caseItem: TriageCase) => {
                        const config = urgencyConfig[caseItem.urgencyLevel];
                        const IconComponent = config.icon;
                        const isSelected = selectedCase?.id === caseItem.id;
                        return (
                          <div
                            key={caseItem.id}
                            onClick={() => setSelectedCase(caseItem)}
                            className={cn(
                              "p-3 rounded-lg border-l-4 border cursor-pointer transition-all hover:shadow-md group",
                              config.borderColor,
                              isSelected 
                                ? "bg-teal-50 dark:bg-teal-950/30 border-r-teal-500 border-t-teal-500 border-b-teal-500 shadow-md ring-1 ring-teal-500/20" 
                                : "bg-white dark:bg-slate-800/30 border-r-slate-200 border-t-slate-200 border-b-slate-200 dark:border-r-slate-700 dark:border-t-slate-700 dark:border-b-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                            )}
                          >
                            <div className="flex items-start justify-between mb-1.5">
                              <div className="flex items-center gap-2.5 min-w-0">
                                <Avatar className={cn("h-9 w-9 ring-2 ring-offset-1 shrink-0", {
                                  'ring-red-500': caseItem.urgencyLevel === 'IMMEDIATE',
                                  'ring-orange-500': caseItem.urgencyLevel === 'URGENT',
                                  'ring-yellow-500': caseItem.urgencyLevel === 'LESS_URGENT',
                                  'ring-green-500': caseItem.urgencyLevel === 'NON_URGENT',
                                })}>
                                  <AvatarFallback className={cn("text-xs font-bold text-white", {
                                    'bg-red-500': caseItem.urgencyLevel === 'IMMEDIATE',
                                    'bg-orange-500': caseItem.urgencyLevel === 'URGENT',
                                    'bg-yellow-600': caseItem.urgencyLevel === 'LESS_URGENT',
                                    'bg-green-600': caseItem.urgencyLevel === 'NON_URGENT',
                                  })}>
                                    {caseItem.patientName.split(' ').map(n => n[0]).join('').slice(0, 2)}
                                  </AvatarFallback>
                                </Avatar>
                                <div className="min-w-0">
                                  <p className="font-semibold text-sm truncate">{caseItem.patientName}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {caseItem.patientAge}y • {caseItem.patientGender}
                                  </p>
                                </div>
                              </div>
                              <Badge className={cn(config.color, "text-[10px] shrink-0")}>
                                <IconComponent className="h-3 w-3 mr-1" />
                                {config.label}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground line-clamp-2 mb-2 pl-[46px]">
                              {caseItem.symptoms}
                            </p>
                            {caseItem.patientLocation && (
                              <p className="text-[11px] text-muted-foreground mb-1.5 pl-[46px] flex items-center gap-1">
                                <MapPin className="h-3 w-3 shrink-0" /> {caseItem.patientLocation}
                              </p>
                            )}
                            <div className="flex items-center justify-between pl-[46px]">
                              <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {formatTimeAgo(caseItem.createdAt)}
                              </span>
                              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 px-2.5 text-[10px] gap-1 bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700 text-green-700 dark:text-green-400 hover:bg-green-100"
                                  onClick={(e) => { e.stopPropagation(); handleStartVideoCall(caseItem); }}
                                >
                                  <Video className="h-3 w-3" /> Call
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 px-2.5 text-[10px] gap-1 bg-teal-50 dark:bg-teal-900/20 border-teal-300 dark:border-teal-700 text-teal-700 dark:text-teal-400 hover:bg-teal-100"
                                  onClick={(e) => { e.stopPropagation(); handleAcceptCase(caseItem); }}
                                >
                                  <UserCheck className="h-3 w-3" /> Accept
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
                      <Avatar className={cn("h-14 w-14 ring-2 ring-offset-2", {
                        'ring-red-500': selectedCase.urgencyLevel === 'IMMEDIATE',
                        'ring-orange-500': selectedCase.urgencyLevel === 'URGENT',
                        'ring-yellow-500': selectedCase.urgencyLevel === 'LESS_URGENT',
                        'ring-green-500': selectedCase.urgencyLevel === 'NON_URGENT',
                      })}>
                        <AvatarFallback className={cn("text-lg font-bold text-white", {
                          'bg-red-500': selectedCase.urgencyLevel === 'IMMEDIATE',
                          'bg-orange-500': selectedCase.urgencyLevel === 'URGENT',
                          'bg-yellow-600': selectedCase.urgencyLevel === 'LESS_URGENT',
                          'bg-green-600': selectedCase.urgencyLevel === 'NON_URGENT',
                        })}>
                          {selectedCase.patientName.split(' ').map(n => n[0]).join('').slice(0, 2)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <CardTitle className="text-xl">{selectedCase.patientName}</CardTitle>
                        <CardDescription className="flex flex-col gap-1">
                          <span>{selectedCase.patientAge} years • {selectedCase.patientGender} • {selectedCase.patientPhone}</span>
                          <span className="flex items-center gap-2">
                            <Clock className="h-3 w-3" /> {formatTimeAgo(selectedCase.createdAt)}
                            {selectedCase.patientLocation && (
                              <><MapPin className="h-3 w-3 ml-1" /> {selectedCase.patientLocation}</>
                            )}
                          </span>
                        </CardDescription>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1.5">
                      <Badge className={urgencyConfig[selectedCase.urgencyLevel].color}>
                        {urgencyConfig[selectedCase.urgencyLevel].label}
                      </Badge>
                      <Badge variant="outline" className="text-[10px] capitalize">
                        {selectedCase.status?.replace('_', ' ') || 'pending'}
                      </Badge>
                    </div>
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
                        {selectedCase.vitalSigns.heartRate && (() => {
                          const hr = Number(selectedCase.vitalSigns!.heartRate);
                          const isAbnormal = hr > 100 || hr < 60;
                          return (
                            <div className={cn("p-3 rounded-lg text-center border-2 transition-colors", isAbnormal ? "bg-red-100 dark:bg-red-950/50 border-red-400 dark:border-red-600" : "bg-red-50 dark:bg-red-950/30 border-transparent")}>
                              <Heart className={cn("h-5 w-5 mx-auto mb-1", isAbnormal ? "text-red-600 animate-pulse" : "text-red-500")} />
                              <p className={cn("text-lg font-bold", isAbnormal && "text-red-700 dark:text-red-400")}>{selectedCase.vitalSigns!.heartRate}</p>
                              <p className="text-xs text-muted-foreground">BPM</p>
                              {isAbnormal && <p className="text-[10px] font-medium text-red-600 dark:text-red-400 mt-0.5">Abnormal</p>}
                            </div>
                          );
                        })()}
                        {selectedCase.vitalSigns.bloodPressure && (() => {
                          const systolic = parseInt(selectedCase.vitalSigns!.bloodPressure!.split('/')[0]);
                          const isAbnormal = systolic > 140 || systolic < 90;
                          return (
                            <div className={cn("p-3 rounded-lg text-center border-2 transition-colors", isAbnormal ? "bg-purple-100 dark:bg-purple-950/50 border-purple-400 dark:border-purple-600" : "bg-purple-50 dark:bg-purple-950/30 border-transparent")}>
                              <Activity className={cn("h-5 w-5 mx-auto mb-1", isAbnormal ? "text-purple-600 animate-pulse" : "text-purple-500")} />
                              <p className={cn("text-lg font-bold", isAbnormal && "text-purple-700 dark:text-purple-400")}>{selectedCase.vitalSigns!.bloodPressure}</p>
                              <p className="text-xs text-muted-foreground">BP</p>
                              {isAbnormal && <p className="text-[10px] font-medium text-purple-600 dark:text-purple-400 mt-0.5">Abnormal</p>}
                            </div>
                          );
                        })()}
                        {selectedCase.vitalSigns.temperature && (() => {
                          const temp = Number(selectedCase.vitalSigns!.temperature);
                          const isAbnormal = temp > 38.5 || temp < 36;
                          return (
                            <div className={cn("p-3 rounded-lg text-center border-2 transition-colors", isAbnormal ? "bg-orange-100 dark:bg-orange-950/50 border-orange-400 dark:border-orange-600" : "bg-orange-50 dark:bg-orange-950/30 border-transparent")}>
                              <Thermometer className={cn("h-5 w-5 mx-auto mb-1", isAbnormal ? "text-orange-600 animate-pulse" : "text-orange-500")} />
                              <p className={cn("text-lg font-bold", isAbnormal && "text-orange-700 dark:text-orange-400")}>{selectedCase.vitalSigns!.temperature}°C</p>
                              <p className="text-xs text-muted-foreground">Temp</p>
                              {isAbnormal && <p className="text-[10px] font-medium text-orange-600 dark:text-orange-400 mt-0.5">Abnormal</p>}
                            </div>
                          );
                        })()}
                        {selectedCase.vitalSigns.oxygenSaturation && (() => {
                          const spo2 = Number(selectedCase.vitalSigns!.oxygenSaturation);
                          const isAbnormal = spo2 < 95;
                          return (
                            <div className={cn("p-3 rounded-lg text-center border-2 transition-colors", isAbnormal ? "bg-blue-100 dark:bg-blue-950/50 border-blue-400 dark:border-blue-600" : "bg-blue-50 dark:bg-blue-950/30 border-transparent")}>
                              <Droplets className={cn("h-5 w-5 mx-auto mb-1", isAbnormal ? "text-blue-600 animate-pulse" : "text-blue-500")} />
                              <p className={cn("text-lg font-bold", isAbnormal && "text-blue-700 dark:text-blue-400")}>{selectedCase.vitalSigns!.oxygenSaturation}%</p>
                              <p className="text-xs text-muted-foreground">SpO2</p>
                              {isAbnormal && <p className="text-[10px] font-medium text-blue-600 dark:text-blue-400 mt-0.5">Critical</p>}
                            </div>
                          );
                        })()}
                        {selectedCase.vitalSigns.respiratoryRate && (() => {
                          const rr = Number(selectedCase.vitalSigns!.respiratoryRate);
                          const isAbnormal = rr > 20 || rr < 12;
                          return (
                            <div className={cn("p-3 rounded-lg text-center border-2 transition-colors", isAbnormal ? "bg-teal-100 dark:bg-teal-950/50 border-teal-400 dark:border-teal-600" : "bg-teal-50 dark:bg-teal-950/30 border-transparent")}>
                              <Wind className={cn("h-5 w-5 mx-auto mb-1", isAbnormal ? "text-teal-600 animate-pulse" : "text-teal-500")} />
                              <p className={cn("text-lg font-bold", isAbnormal && "text-teal-700 dark:text-teal-400")}>{selectedCase.vitalSigns!.respiratoryRate}</p>
                              <p className="text-xs text-muted-foreground">RR/min</p>
                              {isAbnormal && <p className="text-[10px] font-medium text-teal-600 dark:text-teal-400 mt-0.5">Abnormal</p>}
                            </div>
                          );
                        })()}
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
                      size="lg"
                      className="bg-green-600 hover:bg-green-700 shadow-md shadow-green-600/20 hover:shadow-lg hover:shadow-green-600/30 transition-all"
                    >
                      <Video className="h-5 w-5 mr-2" />
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
              <Card className="bg-gradient-to-br from-slate-50 to-teal-50/30 dark:from-slate-800/50 dark:to-teal-900/10 border-slate-200 dark:border-slate-700 h-full flex items-center justify-center">
                <CardContent className="text-center py-20 max-w-sm mx-auto">
                  <div className="relative mx-auto mb-6 w-20 h-20">
                    <div className="absolute inset-0 bg-teal-100 dark:bg-teal-900/30 rounded-full animate-ping opacity-20" />
                    <div className="relative flex items-center justify-center w-20 h-20 bg-teal-100 dark:bg-teal-900/30 rounded-full">
                      <Stethoscope className="h-10 w-10 text-teal-500" />
                    </div>
                  </div>
                  <h3 className="text-lg font-semibold mb-2">Select a Triage Case</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">Choose a patient from the queue to review their symptoms, vital signs, and AI assessment — then start a video consultation.</p>
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
