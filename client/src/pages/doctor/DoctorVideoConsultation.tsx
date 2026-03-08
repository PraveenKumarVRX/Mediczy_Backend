import { useAuth } from "@/auth/AuthProvider";
import MainLayout from "@/components/layout/MainLayoutdoctor";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import RecordingControls from "@/components/consultation/RecordingControls";
import TranscriptionViewer from "@/components/consultation/TranscriptionViewer";
import OfflineScribePanel from "@/components/OfflineScribePanel";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Video,
  VideoOff,
  Mic,
  MicOff,
  PhoneOff,
  Users,
  Calendar,
  Clock,
  User,
  Phone,
  MessageSquare,
  Settings,
  Monitor,
  Camera,
  Loader2,
  FileVideo,
  Brain,
  ExternalLink,
  Copy,
  CheckCircle,
  Maximize2,
  Minimize2,
  Shield,
  RefreshCw,
  Play,
  Link2,
  Share2,
  AlertCircle,
  Wifi
} from "lucide-react";
import { useState, useEffect, useRef, useCallback, lazy, Suspense } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from '@tanstack/react-query';
import api from '@/utils/api';

// Lazy load LiveKit components
const LiveKitRoom = lazy(() => import('@/components/video/LiveKitRoom'));

interface Consultation {
  id: string;
  patient: string;
  patientId?: string;
  time: string;
  duration: string;
  type: string;
  status: string;
  date?: string;
  meetingLink?: string;
  roomId?: string;
}

interface VideoStats {
  todaysConsultations: number;
  totalHours: number;
  activePatients: number;
  avgDuration: number;
}

// LiveKit connection state
interface LiveKitConnection {
  serverUrl: string;
  token: string;
  roomName: string;
}

const DoctorVideoConsultation = () => {
  const { currentDoctor } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  
  // Room and meeting state
  const roomFromUrl = searchParams.get('room') || "";
  const appointmentIdFromUrl = searchParams.get('appointmentId') || "";
  const [roomId, setRoomId] = useState(roomFromUrl);
  const [activeTab, setActiveTab] = useState("upcoming");
  const [copiedLink, setCopiedLink] = useState(false);
  
  // Video consultation state
  const [isInCall, setIsInCall] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [currentMeetingUrl, setCurrentMeetingUrl] = useState("");
  const [currentConsultation, setCurrentConsultation] = useState<Consultation | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('disconnected');
  const [showPreCallCheck, setShowPreCallCheck] = useState(false);
  const [deviceCheckPassed, setDeviceCheckPassed] = useState(false);
  const [preferEmbeddedJoin, setPreferEmbeddedJoin] = useState(true);
  
  // LiveKit native connection state
  const [liveKitConnection, setLiveKitConnection] = useState<LiveKitConnection | null>(null);
  
  // Device check state
  const [cameraPermission, setCameraPermission] = useState<'granted' | 'denied' | 'prompt'>('prompt');
  const [micPermission, setMicPermission] = useState<'granted' | 'denied' | 'prompt'>('prompt');
  const [cameraWorking, setCameraWorking] = useState(false);
  const [micWorking, setMicWorking] = useState(false);
  const [isCheckingDevices, setIsCheckingDevices] = useState(false);
  
  // Recording state
  const [selectedConsultationForRecording, setSelectedConsultationForRecording] = useState<any>(null);
  const [showTranscriptionDialog, setShowTranscriptionDialog] = useState(false);
  const [selectedRecording, setSelectedRecording] = useState<any>(null);
  const [showOfflineScribe, setShowOfflineScribe] = useState(false);
  
  // UI state
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  
  // Refs
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

  const normalizeMeetUrl = (url?: string) => {
    if (!url) return 'https://video.mediqzy.com';
    return url
      .replace(/^wss:\/\//, 'https://')
      .replace(/^ws:\/\//, 'http://')
      .replace(/\/+$/, '')
      .replace(/\/rooms?$/, '');
  };

  // LiveKit Meet base URL (HTTPS)
  const LIVEKIT_BASE_URL = normalizeMeetUrl(
    import.meta.env.VITE_LIVEKIT_MEET_URL || import.meta.env.VITE_LIVEKIT_URL
  );

  // Fetch video consultation stats
  const { data: stats = { todaysConsultations: 0, totalHours: 0, activePatients: 0, avgDuration: 0 }, isLoading: statsLoading, refetch: refetchStats } = useQuery({
    queryKey: ['doctor-video-stats'],
    queryFn: async () => {
      try {
        const response = await api.get('/doctors/video-consultations/stats');
        return response.data.stats || { todaysConsultations: 0, totalHours: 0, activePatients: 0, avgDuration: 0 };
      } catch (err: any) {
        console.warn('Failed to fetch video stats:', err.message);
        return { todaysConsultations: 0, totalHours: 0, activePatients: 0, avgDuration: 0 };
      }
    },
    staleTime: 5 * 60 * 1000,
  });

  // Fetch upcoming consultations
  const { data: upcomingConsultations = [], isLoading: upcomingLoading, refetch: refetchUpcoming } = useQuery({
    queryKey: ['doctor-upcoming-consultations'],
    queryFn: async () => {
      try {
        const response = await api.get('/doctors/video-consultations/upcoming');
        return response.data.consultations || [];
      } catch (err: any) {
        console.warn('Failed to fetch upcoming consultations:', err.message);
        return [];
      }
    },
    staleTime: 2 * 60 * 1000,
  });

  // Fetch recent consultations
  const { data: recentConsultations = [], isLoading: recentLoading, refetch: refetchRecent } = useQuery({
    queryKey: ['doctor-recent-consultations'],
    queryFn: async () => {
      try {
        const response = await api.get('/doctors/video-consultations/recent');
        return response.data.consultations || [];
      } catch (err: any) {
        console.warn('Failed to fetch recent consultations:', err.message);
        return [];
      }
    },
    staleTime: 5 * 60 * 1000,
  });

  // Check device permissions
  const checkDevicePermissions = useCallback(async () => {
    setIsCheckingDevices(true);
    
    try {
      const cameraResult = await navigator.permissions.query({ name: 'camera' as PermissionName });
      setCameraPermission(cameraResult.state as 'granted' | 'denied' | 'prompt');
      
      const micResult = await navigator.permissions.query({ name: 'microphone' as PermissionName });
      setMicPermission(micResult.state as 'granted' | 'denied' | 'prompt');
      
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      
      setCameraWorking(stream.getVideoTracks().length > 0);
      setMicWorking(stream.getAudioTracks().length > 0);
      
      if (previewVideoRef.current) {
        previewVideoRef.current.srcObject = stream;
      }
      localStreamRef.current = stream;
      
      setDeviceCheckPassed(true);
      setCameraPermission('granted');
      setMicPermission('granted');
      
    } catch (err: any) {
      console.error('Device check failed:', err);
      
      if (err.name === 'NotAllowedError') {
        setCameraPermission('denied');
        setMicPermission('denied');
      }
      
      setDeviceCheckPassed(false);
      
      toast({
        variant: "destructive",
        title: "Device Access Required",
        description: "Please allow camera and microphone access for video consultation.",
      });
    } finally {
      setIsCheckingDevices(false);
    }
  }, [toast]);

  // Stop preview stream
  const stopPreviewStream = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }
  }, []);

  // Generate meeting URL
  const generateMeetingUrl = useCallback((room: string) => {
    const name = currentDoctor?.name || currentDoctor?.firstName || 'Doctor';
    if (room.startsWith('http')) {
      try {
        const parsed = new URL(room);
        const isAppRoute = parsed.pathname.includes('/video-consultation') || parsed.pathname.includes('/doctor/video');
        if (isAppRoute) {
          const roomFromQuery =
            parsed.searchParams.get('room') ||
            parsed.searchParams.get('roomId') ||
            parsed.searchParams.get('meetingId');
          if (roomFromQuery) {
            room = roomFromQuery;
          }
        } else {
        if (
          parsed.pathname.includes('/rooms/') ||
          parsed.pathname.includes('/room/') ||
          parsed.searchParams.has('access_token')
        ) {
          return parsed.toString();
        }
        }
      } catch (error) {
        // Fall back to LiveKit URL if parsing fails.
      }
    }
    return `${LIVEKIT_BASE_URL}/rooms/${room}?name=${encodeURIComponent(name)}`;
  }, [currentDoctor, LIVEKIT_BASE_URL]);

  // Start video call with pre-call check
  const initiateVideoCall = useCallback(async (consultation?: Consultation, customRoomId?: string) => {
    if (consultation) {
      setCurrentConsultation(consultation);
    }
    
    // Extract appointment ID from custom room ID if provided
    let appointmentId = consultation?.id;
    const isLongNumericId = (value?: string | number | null) => {
      if (value === null || value === undefined) return false;
      const str = String(value);
      return /^\d+$/.test(str) && str.length > 10;
    };
    if (consultation?.id && isLongNumericId(consultation.id)) {
      const roomFromConsultation = consultation.roomId || consultation.id;
      setRoomId(String(roomFromConsultation));
      setShowPreCallCheck(true);
      return;
    }
    if (customRoomId && customRoomId.match(/^apt-(\d+)$/)) {
      appointmentId = customRoomId.replace('apt-', '');
    } else if (customRoomId && /^\d+$/.test(customRoomId)) {
      if (customRoomId.length > 10) {
        setRoomId(customRoomId);
        setShowPreCallCheck(true);
        return;
      }
      appointmentId = customRoomId;
    }
    
    // If we have an appointment ID, call backend API to initiate call
    if (appointmentId) {
      try {
        toast({
          title: "📞 Initiating Call...",
          description: "Notifying patient and preparing video room...",
        });

        const response = await api.post(`/doctors/appointments/${appointmentId}/initiate-call`);
        
        if (response.data.success) {
          toast({
            title: "✅ Patient Notified",
            description: `${response.data.appointment.patientName} has been notified. Opening video room...`,
          });

          const videoData = response.data.video;
          const livekitData = videoData?.livekit || videoData;
          
          // Use native LiveKit SDK connection
          if (livekitData?.serverUrl && livekitData?.token) {
            setLiveKitConnection({
              serverUrl: livekitData.serverUrl,
              token: livekitData.token,
              roomName: livekitData.roomName || videoData.meetingId
            });
            setIsInCall(true);
            setConnectionStatus('connecting');
            
            toast({
              title: "🎥 Joining Video Call",
              description: "Connecting to consultation room...",
            });
            return;
          }
          
          // Fallback to room ID
          setRoomId(videoData?.roomId || videoData?.meetingId || '');
          setShowPreCallCheck(true);
          return;
        }
      } catch (error: any) {
        toast({
          variant: "destructive",
          title: "Failed to Initiate Call",
          description: error.response?.data?.message || "Please try again",
        });
        return;
      }
    }
    
    // No appointment ID available
    if (customRoomId) {
      setRoomId(customRoomId);
      setShowPreCallCheck(true);
      return;
    }
    toast({
      variant: "destructive",
      title: "Invalid Room",
      description: "Please enter a valid appointment ID or room code (e.g., apt-123 or 123).",
    });
  }, [toast]);

  // Actually start the call after device check
  const startVideoCall = useCallback(() => {
    stopPreviewStream();
    setShowPreCallCheck(false);
    
    const meetingUrl = generateMeetingUrl(roomId);
    const isLiveKitMeeting = meetingUrl.includes('/rooms/') || meetingUrl.includes('/room/');
    if (isLiveKitMeeting && !preferEmbeddedJoin) {
      toast({
        title: "Embedded Mode Enabled",
        description: "Video will open inside the app. Use the external link button to open a new window.",
      });
    }

    setCurrentMeetingUrl(meetingUrl);
    setIsInCall(true);
    setConnectionStatus('connecting');
    const providerLabel = 'LiveKit';
    
    toast({
      title: "Starting Video Consultation",
      description: `Connecting to ${providerLabel}...`,
    });
    
    setTimeout(() => {
      setConnectionStatus('connected');
    }, 3000);
  }, [roomId, generateMeetingUrl, preferEmbeddedJoin, stopPreviewStream, toast]);

  // End video call
  const endVideoCall = useCallback(() => {
    setIsInCall(false);
    setIsFullscreen(false);
    setCurrentMeetingUrl("");
    setCurrentConsultation(null);
    setConnectionStatus('disconnected');
    setRoomId("");
    setLiveKitConnection(null);
    
    toast({
      title: "Call Ended",
      description: "Your video consultation has ended.",
    });
  }, [toast]);

  // Toggle fullscreen
  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return;
    
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen?.();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.();
      setIsFullscreen(false);
    }
  }, []);

  // Handle fullscreen change
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Open in new window
  const openInNewWindow = useCallback(() => {
    const url = currentMeetingUrl || generateMeetingUrl(roomId);
    window.open(url, '_blank', 'width=1200,height=800');
  }, [currentMeetingUrl, roomId, generateMeetingUrl]);

  const moveLiveKitToWindow = useCallback(() => {
    const url = currentMeetingUrl || generateMeetingUrl(roomId);
    if (!url) return;
    window.open(url, '_blank', 'width=1200,height=800');
    setIsInCall(false);
    setIsFullscreen(false);
    setCurrentMeetingUrl("");
    setCurrentConsultation(null);
    setConnectionStatus('disconnected');
  }, [currentMeetingUrl, roomId, generateMeetingUrl]);

  // Copy meeting link
  const handleCopyLink = useCallback((room?: string) => {
    const targetRoom = room || roomId;
    const url = generateMeetingUrl(targetRoom);
    if ((url.includes('/rooms/') || url.includes('/room/')) && url.includes('access_token=')) {
      toast({
        title: "LiveKit Link Protected",
        description: "LiveKit uses per-user tokens. Ask the patient to join from the app.",
      });
      return;
    }
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    toast({
      title: "Link Copied",
      description: "Share this link with your patient",
    });
    setTimeout(() => setCopiedLink(false), 2000);
  }, [roomId, generateMeetingUrl, toast]);

  // Quick start with new room
  const handleQuickStart = useCallback(() => {
    const quickRoomId = `dr-${currentDoctor?.id || 'doc'}-${Date.now()}`;
    initiateVideoCall(undefined, quickRoomId);
  }, [currentDoctor, initiateVideoCall]);

  // Recording handlers
  const handleRecordingComplete = (recording: any) => {
    setSelectedRecording(recording);
    setShowTranscriptionDialog(true);
    toast({
      title: "🎉 AI Analysis Complete!",
      description: "View transcription and AI-generated prescription",
    });
  };

  const handleImportPrescription = (prescriptionData: any) => {
    localStorage.setItem('importedPrescription', JSON.stringify(prescriptionData));
    navigate('/doctor/prescriptions');
  };

  // Refresh all data
  const handleRefresh = () => {
    refetchStats();
    refetchUpcoming();
    refetchRecent();
  };

  // Auto-join video call when appointmentId is passed in URL (from DoctorAppointments)
  useEffect(() => {
    if (appointmentIdFromUrl && currentDoctor && !isInCall && !liveKitConnection) {
      const timer = setTimeout(() => {
        initiateVideoCall({ id: appointmentIdFromUrl, patient: '', time: '', duration: '', type: 'video', status: 'in-progress' } as Consultation);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [appointmentIdFromUrl, currentDoctor]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopPreviewStream();
    };
  }, [stopPreviewStream]);

  // Stable callbacks for LiveKit room to prevent re-render thrashing
  const handleLiveKitDisconnect = useCallback(() => {
    setIsInCall(false);
    setLiveKitConnection(null);
    setConnectionStatus('disconnected');
    toast({
      title: "Call Ended",
      description: "Your video consultation has ended.",
    });
  }, [toast]);

  const handleLiveKitError = useCallback((error: Error) => {
    console.error('LiveKit error:', error);
    // Auto-retry on signal connection errors (abort/timeout)
    const isSignalError = error.message?.includes('Abort handler') ||
      error.message?.includes('signal connection') ||
      error.message?.includes('timed out');
    if (isSignalError && liveKitConnection) {
      console.log('🔄 Signal connection error detected, retrying...');
      toast({
        title: "Reconnecting...",
        description: "Video connection interrupted. Retrying automatically...",
      });
      // Re-fetch a fresh token and reconnect
      const aptId = appointmentIdFromUrl || currentConsultation?.id;
      if (aptId) {
        setIsInCall(false);
        setLiveKitConnection(null);
        setTimeout(() => {
          initiateVideoCall({ id: aptId, patient: '', time: '', duration: '', type: 'video', status: 'in-progress' } as Consultation);
        }, 1000);
        return;
      }
    }
    toast({
      variant: "destructive",
      title: "Video Call Error",
      description: error.message,
    });
  }, [toast, liveKitConnection, appointmentIdFromUrl, currentConsultation, initiateVideoCall]);

  // Active video call UI - Native LiveKit
  if (isInCall && liveKitConnection) {
    return (
      <div ref={containerRef} className="h-screen w-full">
        <Suspense fallback={
          <div className="flex items-center justify-center h-screen bg-slate-900">
            <div className="text-center">
              <Loader2 className="w-12 h-12 animate-spin text-teal-500 mx-auto mb-4" />
              <p className="text-white text-lg">Loading video components...</p>
            </div>
          </div>
        }>
          <LiveKitRoom
            serverUrl={liveKitConnection.serverUrl}
            token={liveKitConnection.token}
            roomName={liveKitConnection.roomName}
            participantName={currentDoctor?.name || currentDoctor?.firstName || 'Doctor'}
            onDisconnect={handleLiveKitDisconnect}
            onError={handleLiveKitError}
          />
        </Suspense>
      </div>
    );
  }

  // Fallback UI when LiveKit SDK connection failed
  if (isInCall && currentMeetingUrl) {
    return (
      <div 
        ref={containerRef}
        className="min-h-screen bg-slate-900 flex flex-col items-center justify-center"
      >
        <div className="text-center max-w-md mx-auto p-8">
          <AlertCircle className="w-16 h-16 text-yellow-500 mx-auto mb-4" />
          <h2 className="text-white text-xl font-semibold mb-2">Video Connection Issue</h2>
          <p className="text-slate-400 mb-6">
            Unable to establish a direct video connection. This may be due to a temporary network issue.
          </p>
          <div className="flex gap-3 justify-center">
            <Button
              onClick={() => {
                setIsInCall(false);
                setCurrentMeetingUrl("");
                setConnectionStatus('disconnected');
                // Re-initiate with SDK
                if (appointmentIdFromUrl || currentConsultation?.id) {
                  const aptId = appointmentIdFromUrl || currentConsultation?.id || '';
                  initiateVideoCall({ id: aptId, patient: '', time: '', duration: '', type: 'video', status: 'in-progress' } as Consultation);
                }
              }}
              className="bg-teal-600 hover:bg-teal-700 text-white px-6"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Retry Connection
            </Button>
            <Button
              onClick={endVideoCall}
              variant="destructive"
              className="px-6"
            >
              <PhoneOff className="w-4 h-4 mr-2" />
              End Call
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <MainLayout>
      <div className="min-h-screen">
        <div className="max-w-7xl mx-auto space-y-8">
          {/* Header */}
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-teal-600 to-blue-600 bg-clip-text text-transparent">
                Video Consultations
              </h1>
              <p className="text-slate-600 dark:text-slate-400 mt-1">Connect with your patients virtually via secure HD video</p>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleRefresh} variant="outline" size="sm" className="gap-2">
                <RefreshCw className="h-4 w-4" />
                Refresh
              </Button>
              <Button onClick={handleQuickStart} size="lg" className="gap-2 bg-teal-600 hover:bg-teal-700">
                <Video className="h-5 w-5" />
                Quick Start
              </Button>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {statsLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <Card key={i}>
                  <CardHeader className="pb-3">
                    <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
                  </CardHeader>
                  <CardContent>
                    <div className="h-8 bg-slate-200 dark:bg-slate-700 rounded animate-pulse mb-2" />
                    <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded animate-pulse w-2/3" />
                  </CardContent>
                </Card>
              ))
            ) : (
              <>
                <Card className="bg-gradient-to-br from-teal-50 to-teal-100/50 dark:from-teal-950/30 dark:to-teal-900/20 border-teal-200 dark:border-teal-800">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium text-teal-700 dark:text-teal-400">
                      Today's Consultations
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold text-teal-700 dark:text-teal-300">{stats.todaysConsultations}</div>
                    <p className="text-xs text-teal-600 dark:text-teal-400">+2 from yesterday</p>
                  </CardContent>
                </Card>
                <Card className="bg-gradient-to-br from-blue-50 to-blue-100/50 dark:from-blue-950/30 dark:to-blue-900/20 border-blue-200 dark:border-blue-800">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium text-blue-700 dark:text-blue-400">
                      Total Hours
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold text-blue-700 dark:text-blue-300">{stats.totalHours}h</div>
                    <p className="text-xs text-blue-600 dark:text-blue-400">This month</p>
                  </CardContent>
                </Card>
                <Card className="bg-gradient-to-br from-purple-50 to-purple-100/50 dark:from-purple-950/30 dark:to-purple-900/20 border-purple-200 dark:border-purple-800">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium text-purple-700 dark:text-purple-400">
                      Active Patients
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold text-purple-700 dark:text-purple-300">{stats.activePatients}</div>
                    <p className="text-xs text-purple-600 dark:text-purple-400">This week</p>
                  </CardContent>
                </Card>
                <Card className="bg-gradient-to-br from-amber-50 to-amber-100/50 dark:from-amber-950/30 dark:to-amber-900/20 border-amber-200 dark:border-amber-800">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium text-amber-700 dark:text-amber-400">
                      Avg Duration
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold text-amber-700 dark:text-amber-300">{stats.avgDuration}min</div>
                    <p className="text-xs text-amber-600 dark:text-amber-400">Per session</p>
                  </CardContent>
                </Card>
              </>
            )}
          </div>

          {/* Quick Join Card */}
          <Card className="border-teal-200 dark:border-teal-800 bg-gradient-to-r from-teal-50 to-blue-50 dark:from-teal-950/30 dark:to-blue-950/30">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-teal-700 dark:text-teal-400">
                <Video className="h-5 w-5" />
                Join or Create Consultation Room
              </CardTitle>
              <CardDescription className="dark:text-slate-400">
                Enter a room ID to join an existing consultation or create a new one
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col md:flex-row gap-4">
                <div className="flex-1">
                  <Label htmlFor="roomId" className="text-slate-700 dark:text-slate-300">Room ID / Meeting Code</Label>
                  <Input
                    id="roomId"
                    placeholder="Enter room ID or generate a new one"
                    value={roomId}
                    onChange={(e) => setRoomId(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && roomId && initiateVideoCall(undefined, roomId)}
                    className="mt-1 bg-white dark:bg-slate-800"
                  />
                </div>
                <div className="flex items-end gap-2">
                  <Button 
                    onClick={() => initiateVideoCall(undefined, roomId)} 
                    disabled={!roomId.trim()}
                    className="gap-2 bg-teal-600 hover:bg-teal-700"
                  >
                    <Play className="h-4 w-4" />
                    Join Room
                  </Button>
                  <Button 
                    onClick={() => handleCopyLink(roomId)}
                    variant="outline"
                    disabled={!roomId.trim()}
                    title="Copy & Share link"
                  >
                    <Share2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              
              <div className="flex flex-wrap gap-2 mt-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleQuickStart}
                  className="gap-2"
                >
                  <Video className="h-4 w-4" />
                  Generate New Room
                </Button>
                <Button
                  variant={isVideoEnabled ? "default" : "outline"}
                  size="sm"
                  onClick={() => setIsVideoEnabled(!isVideoEnabled)}
                >
                  {isVideoEnabled ? <Video className="h-4 w-4" /> : <VideoOff className="h-4 w-4" />}
                </Button>
                <Button
                  variant={isAudioEnabled ? "default" : "outline"}
                  size="sm"
                  onClick={() => setIsAudioEnabled(!isAudioEnabled)}
                >
                  {isAudioEnabled ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* AI Recording Feature Card */}
          <Card className="border-purple-200 dark:border-purple-800 bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-950/30 dark:to-blue-950/30">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-purple-700 dark:text-purple-400">
                <Brain className="h-5 w-5" />
                AI-Powered Consultation Recording
              </CardTitle>
              <CardDescription className="dark:text-slate-400">
                Record consultations with automatic AI transcription and prescription generation
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="p-4 bg-white dark:bg-slate-800/50">
                  <div className="flex items-center gap-3">
                    <FileVideo className="h-8 w-8 text-purple-600" />
                    <div>
                      <p className="font-semibold text-slate-800 dark:text-white">Auto Recording</p>
                      <p className="text-xs text-slate-600 dark:text-slate-400">Start/stop with one click</p>
                    </div>
                  </div>
                </Card>
                <Card className="p-4 bg-white dark:bg-slate-800/50">
                  <div className="flex items-center gap-3">
                    <Brain className="h-8 w-8 text-blue-600" />
                    <div>
                      <p className="font-semibold text-slate-800 dark:text-white">AI Transcription</p>
                      <p className="text-xs text-slate-600 dark:text-slate-400">Whisper AI powered</p>
                    </div>
                  </div>
                </Card>
                <Card className="p-4 bg-white dark:bg-slate-800/50">
                  <div className="flex items-center gap-3">
                    <MessageSquare className="h-8 w-8 text-green-600" />
                    <div>
                      <p className="font-semibold text-slate-800 dark:text-white">Smart Prescription</p>
                      <p className="text-xs text-slate-600 dark:text-slate-400">Auto-extract medications</p>
                    </div>
                  </div>
                </Card>
              </div>
              
              <div className="flex gap-2">
                <Button 
                  onClick={() => navigate('/doctor/prescriptions')}
                  variant="outline" 
                  className="flex-1 border-purple-300 text-purple-700 hover:bg-purple-50 dark:border-purple-700 dark:text-purple-400 dark:hover:bg-purple-950/30"
                >
                  Go to Prescriptions
                </Button>
                <Button 
                  onClick={() => setShowOfflineScribe(true)}
                  className="flex-1 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700"
                >
                  <Mic className="h-4 w-4 mr-2" />
                  Offline AI Scribe
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Offline AI Scribe Panel - Collapsible */}
          {showOfflineScribe && (
            <Card className="border-indigo-200 dark:border-indigo-800">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-indigo-700 dark:text-indigo-400">
                    <Wifi className="h-5 w-5" />
                    Offline AI Scribe
                  </CardTitle>
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => setShowOfflineScribe(false)}
                  >
                    ✕
                  </Button>
                </div>
                <CardDescription className="dark:text-slate-400">
                  CPU-only, fully offline • Hindi, Tamil, Telugu, English
                </CardDescription>
              </CardHeader>
              <CardContent>
                <OfflineScribePanel
                  compact
                  defaultLanguage="hi"
                  defaultDocumentType="prescription"
                  patientContext={currentConsultation ? {
                    name: currentConsultation.patient,
                    patient_id: currentConsultation.patientId,
                  } : undefined}
                  onPrescriptionGenerated={(prescription) => {
                    // Navigate to prescriptions with the data
                    toast({
                      title: "✅ Prescription Generated",
                      description: "Navigate to Prescriptions to review and save.",
                    });
                    // Store in session for prescriptions page to pick up
                    sessionStorage.setItem('offlineScribePrescription', JSON.stringify(prescription));
                    navigate('/doctor/prescriptions');
                  }}
                />
              </CardContent>
            </Card>
          )}

          {/* Upcoming Consultations */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-teal-600" />
                Upcoming Consultations
              </CardTitle>
            </CardHeader>
            <CardContent>
              {upcomingLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin mr-2 text-teal-600" />
                  <span className="text-slate-600 dark:text-slate-400">Loading upcoming consultations...</span>
                </div>
              ) : upcomingConsultations.length === 0 ? (
                <div className="text-center py-8">
                  <Calendar className="h-12 w-12 mx-auto text-slate-300 dark:text-slate-600 mb-4" />
                  <p className="text-slate-600 dark:text-slate-400">No upcoming consultations</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {upcomingConsultations.map((consultation: Consultation) => (
                    <div
                      key={consultation.id}
                      className="flex items-center justify-between p-4 border border-slate-200 dark:border-slate-700 rounded-lg hover:border-teal-300 dark:hover:border-teal-700 transition-colors"
                    >
                      <div className="flex items-center gap-4">
                        <div className="h-12 w-12 rounded-full bg-teal-100 dark:bg-teal-900/50 flex items-center justify-center">
                          <User className="h-6 w-6 text-teal-600 dark:text-teal-400" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-slate-800 dark:text-white">{consultation.patient}</h3>
                          <div className="flex items-center gap-4 text-sm text-slate-600 dark:text-slate-400">
                            <span className="flex items-center gap-1">
                              <Clock className="h-4 w-4" />
                              {consultation.time}
                            </span>
                            <span>{consultation.duration}</span>
                            <Badge variant="secondary">{consultation.type}</Badge>
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            toast({
                              title: "Chat",
                              description: `Opening chat with ${consultation.patient}`,
                            });
                          }}
                        >
                          <MessageSquare className="h-4 w-4" />
                        </Button>
                        <Button
                          onClick={() => initiateVideoCall(consultation)}
                          size="sm"
                          className="gap-2 bg-teal-600 hover:bg-teal-700"
                        >
                          <Video className="h-4 w-4" />
                          Start Call
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent Consultations */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-slate-600" />
                Recent Consultations
              </CardTitle>
            </CardHeader>
            <CardContent>
              {recentLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin mr-2 text-teal-600" />
                  <span className="text-slate-600 dark:text-slate-400">Loading recent consultations...</span>
                </div>
              ) : recentConsultations.length === 0 ? (
                <div className="text-center py-8">
                  <Clock className="h-12 w-12 mx-auto text-slate-300 dark:text-slate-600 mb-4" />
                  <p className="text-slate-600 dark:text-slate-400">No recent consultations</p>
                </div>
              ) : (
                <ScrollArea className="h-[300px]">
                  <div className="space-y-3">
                    {recentConsultations.map((consultation: Consultation) => (
                      <div
                        key={consultation.id}
                        className="flex items-center justify-between p-3 border border-slate-200 dark:border-slate-700 rounded-lg"
                      >
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                            <User className="h-5 w-5 text-slate-500" />
                          </div>
                          <div>
                            <h4 className="font-medium text-slate-800 dark:text-white">{consultation.patient}</h4>
                            <div className="flex items-center gap-3 text-sm text-slate-600 dark:text-slate-400">
                              <span>{consultation.date}</span>
                              <span>{consultation.duration}</span>
                              <Badge variant="outline">{consultation.type}</Badge>
                            </div>
                          </div>
                        </div>
                        <Button variant="ghost" size="sm">
                          View Details
                        </Button>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>

          {/* Equipment Check */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Camera className="h-5 w-5 text-blue-600" />
                Equipment Status
              </CardTitle>
              <CardDescription>
                Make sure your equipment is working properly before starting a call
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 border border-slate-200 dark:border-slate-700 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-slate-800 dark:text-white">Camera</span>
                    <Badge variant="default" className="bg-green-500">Active</Badge>
                  </div>
                  <p className="text-sm text-slate-600 dark:text-slate-400">HD Webcam detected</p>
                </div>
                <div className="p-4 border border-slate-200 dark:border-slate-700 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-slate-800 dark:text-white">Microphone</span>
                    <Badge variant="default" className="bg-green-500">Active</Badge>
                  </div>
                  <p className="text-sm text-slate-600 dark:text-slate-400">Default microphone</p>
                </div>
                <div className="p-4 border border-slate-200 dark:border-slate-700 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-slate-800 dark:text-white">Connection</span>
                    <Badge variant="default" className="bg-green-500">Good</Badge>
                  </div>
                  <p className="text-sm text-slate-600 dark:text-slate-400">50 Mbps</p>
                </div>
              </div>
              <div className="mt-4">
                <Button variant="outline" className="w-full" onClick={checkDevicePermissions}>
                  <Settings className="h-4 w-4 mr-2" />
                  Test Equipment
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Pre-Call Device Check Dialog */}
      <Dialog open={showPreCallCheck} onOpenChange={(open) => {
        if (!open) {
          stopPreviewStream();
        }
        setShowPreCallCheck(open);
      }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5 text-teal-600" />
              Pre-Call Equipment Check
            </DialogTitle>
            <DialogDescription>
              Let's make sure your camera and microphone are working before starting
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Video Preview */}
            <div className="relative bg-slate-900 rounded-lg overflow-hidden aspect-video">
              <video
                ref={previewVideoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
              {!cameraWorking && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center text-white">
                    <VideoOff className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>Camera preview will appear here</p>
                  </div>
                </div>
              )}
            </div>
            
            {/* Device Status */}
            <div className="grid grid-cols-2 gap-4">
              <div className={`p-3 rounded-lg border ${
                cameraPermission === 'granted' && cameraWorking
                  ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/30'
                  : 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/30'
              }`}>
                <div className="flex items-center gap-2">
                  {cameraPermission === 'granted' && cameraWorking ? (
                    <CheckCircle className="h-5 w-5 text-green-600" />
                  ) : (
                    <AlertCircle className="h-5 w-5 text-red-600" />
                  )}
                  <span className="font-medium">Camera</span>
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                  {cameraPermission === 'granted' && cameraWorking ? 'Working' : 'Not detected'}
                </p>
              </div>
              
              <div className={`p-3 rounded-lg border ${
                micPermission === 'granted' && micWorking
                  ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/30'
                  : 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/30'
              }`}>
                <div className="flex items-center gap-2">
                  {micPermission === 'granted' && micWorking ? (
                    <CheckCircle className="h-5 w-5 text-green-600" />
                  ) : (
                    <AlertCircle className="h-5 w-5 text-red-600" />
                  )}
                  <span className="font-medium">Microphone</span>
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                  {micPermission === 'granted' && micWorking ? 'Working' : 'Not detected'}
                </p>
              </div>
            </div>

            {roomId && (String(roomId).includes('/rooms/') || String(roomId).includes('/room/') || String(roomId).includes('access_token=')) && (
              <div className="flex items-center justify-between rounded-lg border border-slate-200 dark:border-slate-800 p-3">
                <div>
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-200">LiveKit join mode</p>
                  <p className="text-xs text-slate-500">Embed in app or open in a new window</p>
                </div>
                <Switch
                  checked={preferEmbeddedJoin}
                  onCheckedChange={setPreferEmbeddedJoin}
                />
              </div>
            )}
            
            {/* Actions */}
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={checkDevicePermissions}
                disabled={isCheckingDevices}
                className="flex-1"
              >
                {isCheckingDevices ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Test Devices
              </Button>
              
              <Button
                onClick={startVideoCall}
                disabled={!deviceCheckPassed && !isCheckingDevices}
                className="flex-1 bg-teal-600 hover:bg-teal-700"
              >
                <Video className="h-4 w-4 mr-2" />
                Start Call
              </Button>
            </div>
            
            {/* Skip option */}
            <div className="text-center">
              <Button 
                variant="link" 
                onClick={startVideoCall}
                className="text-sm text-slate-500"
              >
                Skip check and start anyway
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Transcription Viewer Dialog */}
      <Dialog open={showTranscriptionDialog} onOpenChange={setShowTranscriptionDialog}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Brain className="h-5 w-5 text-purple-600" />
              AI Consultation Analysis
            </DialogTitle>
          </DialogHeader>
          {selectedRecording && (
            <TranscriptionViewer
              recordingId={selectedRecording.id}
              onImportPrescription={handleImportPrescription}
            />
          )}
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
};

export default DoctorVideoConsultation;
