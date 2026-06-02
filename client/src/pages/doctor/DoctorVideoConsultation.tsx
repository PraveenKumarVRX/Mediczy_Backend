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
import { AIScribeConsultation } from "@/components/AIScribeConsultation";
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
  Wifi,
  ClipboardList,
  BookOpen,
  Eye,
  FileText,
  Square
} from "lucide-react";
import { useState, useEffect, useRef, useCallback, lazy, Suspense } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from '@tanstack/react-query';
import api from '@/utils/api';
import { Skeleton } from "@/components/ui/skeleton";

// Lazy load LiveKit components
const LiveKitRoom = lazy(() => import('@/components/video/LiveKitRoom'));
import PatientInfoPane from '@/components/video/PatientInfoPane';

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
  iceServers?: RTCIceServer[];
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
  const [isCallMinimized, setIsCallMinimized] = useState(false);
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
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  // UI state
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [showPatientPane, setShowPatientPane] = useState(false);
  const [inCallPanelTab, setInCallPanelTab] = useState<'emr' | 'history' | 'scribe' | 'vision'>('emr');
  
  // Refs
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const autoJoinAttemptRef = useRef<string | null>(null);

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
            setCurrentMeetingUrl("");
            setLiveKitConnection({
              serverUrl: livekitData.serverUrl,
              token: livekitData.token,
              roomName: livekitData.roomName || videoData.meetingId,
              iceServers: livekitData.iceServers || videoData.iceServers
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
  const startVideoCall = useCallback(async () => {
    stopPreviewStream();
    setShowPreCallCheck(false);

    let normalizedRoom = roomId.trim();
    if (normalizedRoom.startsWith("http")) {
      try {
        const parsed = new URL(normalizedRoom);
        const parts = parsed.pathname.split("/").filter(Boolean);
        const roomIndex = parts.findIndex((segment) => ["rooms", "room", "join"].includes(segment));
        if (roomIndex >= 0 && parts[roomIndex + 1]) {
          normalizedRoom = parts[roomIndex + 1];
        }
      } catch {
        // Keep the entered room value.
      }
    }
    if (normalizedRoom.includes("/rooms/")) {
      normalizedRoom = normalizedRoom.split("/rooms/")[1]?.split("?")[0] || normalizedRoom;
    } else if (normalizedRoom.includes("/room/")) {
      normalizedRoom = normalizedRoom.split("/room/")[1]?.split("?")[0] || normalizedRoom;
    } else if (normalizedRoom.includes("/join/")) {
      normalizedRoom = normalizedRoom.split("/join/")[1]?.split("?")[0] || normalizedRoom;
    }

    if (!normalizedRoom) {
      toast({ variant: "destructive", title: "Invalid Room", description: "Please enter a valid meeting code." });
      return;
    }

    try {
      toast({ title: "Starting Video Consultation", description: "Getting secure LiveKit credentials..." });
      const tokenResponse = await api.post("/video/livekit/token", {
        roomName: normalizedRoom,
        participantName: currentDoctor?.firstName || "Doctor",
      });
      const payload = tokenResponse.data || {};
      const data = payload.video?.livekit || payload.livekit || payload;
      if (!payload?.success || !data?.token || !data?.serverUrl) {
        throw new Error("Video credentials missing from server response");
      }
      const conn = { serverUrl: data.serverUrl, token: data.token, roomName: data.roomName || normalizedRoom, iceServers: data.iceServers || payload.video?.iceServers || payload.iceServers };
      setRoomId(normalizedRoom);
      setCurrentMeetingUrl("");
      setLiveKitConnection(conn);
      setIsInCall(true);
      setConnectionStatus("connecting");
    } catch (error: any) {
      console.error("Failed to start doctor LiveKit call:", error);
      setIsInCall(false);
      setConnectionStatus("disconnected");
      setCurrentMeetingUrl("");
      toast({
        variant: "destructive",
        title: "Cannot Start Video Call",
        description: error.response?.data?.message || error.message || "Unable to get secure video credentials.",
      });
    }
  }, [roomId, stopPreviewStream, toast, currentDoctor]);
  // End video call
  const endVideoCall = useCallback(() => {
    setIsInCall(false);
    setIsFullscreen(false);
    setIsCallMinimized(false);
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
    setIsCallMinimized(false);
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
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([refetchStats(), refetchUpcoming(), refetchRecent()]);
      toast({
        title: 'Refreshed',
        description: 'Video consultation data updated',
      });
    } catch {
      toast({
        title: 'Refresh failed',
        description: 'Unable to refresh consultation data',
        variant: 'destructive',
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  // Auto-join video call when appointmentId is passed in URL (from DoctorAppointments or emergency accept)
  useEffect(() => {
    if (appointmentIdFromUrl && currentDoctor && !isInCall && !liveKitConnection) {
      if (autoJoinAttemptRef.current === appointmentIdFromUrl) {
        return;
      }
      autoJoinAttemptRef.current = appointmentIdFromUrl;

      // Use short-lived handoff token from sessionStorage (never URL query params).
      try {
        const rawHandoff = sessionStorage.getItem('doctorLivekitHandoff');
        if (rawHandoff) {
          const handoff = JSON.parse(rawHandoff);
          const isMatchingAppointment = String(handoff?.appointmentId || '') === String(appointmentIdFromUrl);
          const isFresh = Number(handoff?.expiresAt || 0) > Date.now();
          if (isMatchingAppointment && isFresh && handoff?.token && handoff?.serverUrl) {
            setLiveKitConnection({
              serverUrl: handoff.serverUrl,
              token: handoff.token,
              roomName: handoff.roomId || roomFromUrl || `apt-${appointmentIdFromUrl}`,
            });
            sessionStorage.removeItem('doctorLivekitHandoff');
            setIsInCall(true);
            setConnectionStatus('connecting');
            setTimeout(() => setConnectionStatus('connected'), 3000);
            return;
          }
        }
      } catch {
        // non-fatal
      }
      const timer = setTimeout(() => {
        initiateVideoCall({ id: appointmentIdFromUrl, patient: '', time: '', duration: '', type: 'video', status: 'in-progress' } as Consultation);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [appointmentIdFromUrl, currentDoctor, isInCall, liveKitConnection, roomFromUrl, initiateVideoCall]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopPreviewStream();
    };
  }, [stopPreviewStream]);

  // Stable callbacks for LiveKit room to prevent re-render thrashing
  const handleLiveKitDisconnect = useCallback(() => {
    setIsInCall(false);
    setIsCallMinimized(false);
    setLiveKitConnection(null);
    setConnectionStatus('disconnected');
    toast({
      title: "Call Ended",
      description: "Your video consultation has ended.",
    });
  }, [toast]);

  const handleLiveKitError = useCallback((error: Error) => {
    console.error('LiveKit error:', error);
    const isSignalError = error.message?.includes('Abort handler') ||
      error.message?.includes('signal connection') ||
      error.message?.includes('timed out');
    if (isSignalError) {
      toast({
        title: "Reconnecting...",
        description: "Temporary network issue detected. Trying to recover call.",
      });
      return;
    }
    toast({
      variant: "destructive",
      title: "Video Call Error",
      description: error.message,
    });
  }, [toast]);

  // Active video call UI — split layout: video left, clinical panel right
  if (isInCall && liveKitConnection && !isCallMinimized) {
    const panelTabs = [
      { id: 'emr'     as const, Icon: ClipboardList, label: 'EMR'       },
      { id: 'history' as const, Icon: BookOpen,       label: 'History'   },
      { id: 'scribe'  as const, Icon: Mic,            label: 'AI Scribe' },
      { id: 'vision'  as const, Icon: Eye,            label: 'AI Vision' },
    ];

    return (
      <div ref={containerRef} className="h-screen w-full flex flex-row overflow-hidden bg-slate-900">
        {/* ── Video area — fills remaining width ── */}
        <div className="flex-1 min-w-0 h-full relative">
          <Suspense fallback={
            <div className="flex items-center justify-center h-full bg-slate-900">
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
              participantName={currentDoctor?.firstName || 'Doctor'}
              onDisconnect={handleLiveKitDisconnect}
              onError={handleLiveKitError}
              iceServers={liveKitConnection.iceServers}
              onMinimize={() => setIsCallMinimized(true)}
              inline={true}
            />
          </Suspense>
        </div>

        {/* ── Right clinical panel — replaces the black half-screen ── */}
        <div className="w-[380px] flex-shrink-0 flex flex-col h-full bg-slate-900 border-l border-slate-700">
          {/* Recording bar — always visible at the top of the panel */}
          <InCallRecordingBar
            appointmentId={currentConsultation?.id}
            roomId={liveKitConnection.roomName}
            patientId={currentConsultation?.patientId}
          />
          {/* Tab bar */}
          <div className="flex items-center gap-0.5 px-2 py-2 bg-slate-800/80 border-b border-slate-700 flex-shrink-0">
            {panelTabs.map(({ id, Icon, label }) => (
              <button
                key={id}
                onClick={() => setInCallPanelTab(id)}
                className={`flex items-center gap-1 px-2 py-1.5 rounded-md text-xs font-medium flex-1 justify-center transition-colors ${
                  inCallPanelTab === id
                    ? 'bg-teal-600 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/60'
                }`}
              >
                <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="truncate">{label}</span>
              </button>
            ))}
          </div>

          {/* Panel content */}
          <div className="flex-1 overflow-hidden">
            {/* EMR — vitals, records, labs */}
            {inCallPanelTab === 'emr' && (
              currentConsultation?.patientId ? (
                <PatientInfoPane
                  patientId={currentConsultation.patientId}
                  patientName={currentConsultation.patient}
                />
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-3 p-6">
                  <ClipboardList className="w-10 h-10" />
                  <p className="text-sm text-center">Patient records will appear here once a consultation is linked to a patient.</p>
                </div>
              )
            )}

            {/* History — prescription history + health diary */}
            {inCallPanelTab === 'history' && (
              <PatientHistoryDiaryTab
                patientId={currentConsultation?.patientId}
                patientName={currentConsultation?.patient}
              />
            )}

            {/* AI Scribe — live transcription & offline mode */}
            {inCallPanelTab === 'scribe' && (
              <div className="h-full overflow-y-auto">
                <div className="p-3">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="p-1.5 rounded-lg bg-purple-500/20 flex-shrink-0">
                      <Mic className="w-4 h-4 text-purple-400" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white">AI Medical Scribe</p>
                      <p className="text-[11px] text-slate-400">Live transcription &amp; auto-prescription</p>
                    </div>
                  </div>
                  <Tabs defaultValue="online">
                    <TabsList className="w-full mb-3 bg-slate-800">
                      <TabsTrigger value="online" className="flex-1 text-xs">🎤 Online</TabsTrigger>
                      <TabsTrigger value="offline" className="flex-1 text-xs">📴 Offline</TabsTrigger>
                    </TabsList>
                    <TabsContent value="online">
                      <AIScribeConsultation
                        appointmentId={currentConsultation?.id}
                        currentFormData={undefined}
                        onPrescriptionGenerated={(prescription) => {
                          toast({ title: "✅ Prescription Generated", description: "Opening Prescriptions to review." });
                          localStorage.setItem('importedPrescription', JSON.stringify(prescription));
                          navigate('/doctor/prescriptions');
                        }}
                      />
                    </TabsContent>
                    <TabsContent value="offline">
                      <OfflineScribePanel
                        compact
                        defaultLanguage="hi"
                        defaultDocumentType="prescription"
                        patientContext={currentConsultation ? {
                          name: currentConsultation.patient,
                          patient_id: currentConsultation.patientId,
                        } : undefined}
                        onPrescriptionGenerated={(prescription) => {
                          toast({ title: "✅ Prescription Generated", description: "Opening Prescriptions to review." });
                          localStorage.setItem('importedPrescription', JSON.stringify(prescription));
                          navigate('/doctor/prescriptions');
                        }}
                      />
                    </TabsContent>
                  </Tabs>
                </div>
              </div>
            )}

            {/* AI Vision — capture & analyze patient video frame */}
            {inCallPanelTab === 'vision' && (
              <AIVisionInCallPanel consultationId={currentConsultation?.id} />
            )}
          </div>
        </div>
      </div>
    );
  }

  // Legacy URL fallback is intentionally disabled. All in-app calls must use
  // tokenized LiveKit SDK credentials; otherwise users see a false connection
  // failure even when TURN/LiveKit are healthy.
  if (false && isInCall && currentMeetingUrl) {
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
              <Button onClick={handleRefresh} variant="outline" size="sm" className="gap-2" disabled={isRefreshing}>
                <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
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

          {/* AI Scribe Panel - Collapsible */}
          {showOfflineScribe && (
            <Card className="border-indigo-200 dark:border-indigo-800">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-indigo-700 dark:text-indigo-400">
                    <Mic className="h-5 w-5" />
                    AI Medical Scribe
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
                  Record consultation → AI generates prescription → doctor reviews → saves to EHR
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="online">
                  <TabsList className="mb-4">
                    <TabsTrigger value="online">🎤 AI Scribe (Online)</TabsTrigger>
                    <TabsTrigger value="offline">📴 Offline Scribe</TabsTrigger>
                  </TabsList>
                  <TabsContent value="online">
                    <AIScribeConsultation
                      appointmentId={currentConsultation?.id}
                      currentFormData={undefined}
                      onPrescriptionGenerated={(prescription) => {
                        toast({
                          title: "✅ Prescription Generated",
                          description: "Opening Prescriptions to review and save.",
                        });
                        localStorage.setItem('importedPrescription', JSON.stringify(prescription));
                        navigate('/doctor/prescriptions');
                      }}
                    />
                  </TabsContent>
                  <TabsContent value="offline">
                    <OfflineScribePanel
                      compact
                      defaultLanguage="hi"
                      defaultDocumentType="prescription"
                      patientContext={currentConsultation ? {
                        name: currentConsultation.patient,
                        patient_id: currentConsultation.patientId,
                      } : undefined}
                      onPrescriptionGenerated={(prescription) => {
                        toast({
                          title: "✅ Prescription Generated",
                          description: "Opening Prescriptions to review and save.",
                        });
                        localStorage.setItem('importedPrescription', JSON.stringify(prescription));
                        navigate('/doctor/prescriptions');
                      }}
                    />
                  </TabsContent>
                </Tabs>
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

      {isInCall && liveKitConnection && isCallMinimized && (
        <Suspense fallback={null}>
          <LiveKitRoom
            serverUrl={liveKitConnection.serverUrl}
            token={liveKitConnection.token}
            roomName={liveKitConnection.roomName}
            participantName={currentDoctor?.name || currentDoctor?.firstName || 'Doctor'}
            onDisconnect={handleLiveKitDisconnect}
            onError={handleLiveKitError}
            iceServers={liveKitConnection.iceServers}
            isMinimized
            onRestore={() => setIsCallMinimized(false)}
          />
        </Suspense>
      )}

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

// ── In-call recording bar ─────────────────────────────────────────────────────

function InCallRecordingBar({
  appointmentId,
  roomId,
  patientId,
}: {
  appointmentId?: string;
  roomId?: string;
  patientId?: string;
}) {
  const { toast } = useToast();
  type Phase = 'idle' | 'recording' | 'uploading' | 'processing' | 'done' | 'error';
  const [phase, setPhase] = useState<Phase>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [recordingId, setRecordingId] = useState<number | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    if (phase === 'recording') {
      timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [phase]);

  const fmtTime = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  const startRecording = async () => {
    if (!appointmentId || !roomId || !patientId) {
      toast({ title: "Cannot record", description: "Link a consultation appointment to enable recording", variant: "destructive" });
      return;
    }
    try {
      // 1. Create DB record
      const res = await api.post('/consultation-recordings/start', {
        appointmentId: parseInt(appointmentId),
        roomId,
        patientId: parseInt(patientId),
      });
      setRecordingId(res.data.recording.id);

      // 2. Mix local mic + any remote audio playing through LiveKit <audio> elements
      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      const dest = ctx.createMediaStreamDestination();

      try {
        const localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        ctx.createMediaStreamSource(localStream).connect(dest);
      } catch { /* mic denied — record remote-only */ }

      document.querySelectorAll('audio').forEach((el) => {
        const audio = el as HTMLAudioElement;
        try {
          if (audio.srcObject instanceof MediaStream) {
            ctx.createMediaStreamSource(audio.srcObject as MediaStream).connect(dest);
          }
        } catch {}
      });

      // 3. Start MediaRecorder on the mixed stream
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : '';
      chunksRef.current = [];
      const recorder = new MediaRecorder(dest.stream, mimeType ? { mimeType } : {});
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.start(1000);
      mediaRecorderRef.current = recorder;

      setElapsed(0);
      setPhase('recording');
      toast({ title: "🔴 Recording started", description: "Mixed audio (doctor + patient) being captured" });
    } catch (err: any) {
      toast({ title: "Failed to start recording", description: err.message, variant: "destructive" });
    }
  };

  const stopAndUpload = async () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || !recordingId) return;

    setPhase('uploading');

    // Collect final chunks
    await new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
      recorder.stop();
    });
    audioCtxRef.current?.close().catch(() => {});

    const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
    chunksRef.current = [];
    const capturedElapsed = elapsed;

    try {
      // Mark stopped in DB (browserUpload=true skips broken processRecordingFile)
      await api.post(`/consultation-recordings/stop/${recordingId}?browserUpload=true`);

      // Upload blob → MinIO → AI transcription
      const fd = new FormData();
      fd.append('recording', blob, `consultation-${roomId}-${Date.now()}.webm`);
      fd.append('duration', String(capturedElapsed));
      await api.post(`/consultation-recordings/${recordingId}/upload-blob`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 10 * 60 * 1000, // 10 min for large uploads
      });

      setPhase('processing');
      toast({ title: "Uploaded to MinIO", description: "AI transcription running in background..." });
      pollStatus(recordingId);
    } catch (err: any) {
      setPhase('error');
      toast({ title: "Upload failed", description: err.response?.data?.message || err.message, variant: "destructive" });
    }
  };

  const pollStatus = (id: number) => {
    const iv = setInterval(async () => {
      try {
        const res = await api.get(`/consultation-recordings/${id}`);
        const status = res.data.recording?.status;
        if (status === 'completed') {
          setPhase('done');
          clearInterval(iv);
          toast({ title: "🎉 Recording ready!", description: "Transcription & AI summary are available" });
        } else if (status === 'failed') {
          setPhase('error');
          clearInterval(iv);
          toast({ title: "Transcription failed", description: "Recording saved to MinIO but AI processing failed", variant: "destructive" });
        }
      } catch { clearInterval(iv); }
    }, 5000);
  };

  const canRecord = !!(appointmentId && roomId && patientId);

  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 border-b border-slate-700 flex-shrink-0 text-xs ${
      phase === 'recording' ? 'bg-red-950/30' : 'bg-slate-800/50'
    }`}>
      {phase === 'idle' && (
        <>
          <button
            onClick={startRecording}
            disabled={!canRecord}
            title={canRecord ? 'Start recording this consultation' : 'No appointment linked — cannot record'}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded font-medium transition-colors ${
              canRecord
                ? 'bg-red-600 hover:bg-red-700 text-white'
                : 'bg-slate-700 text-slate-500 cursor-not-allowed'
            }`}
          >
            <div className="w-2 h-2 rounded-full bg-current" />
            Record
          </button>
          <span className="text-slate-500 text-[10px]">Audio saved to MinIO</span>
        </>
      )}

      {phase === 'recording' && (
        <>
          <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
          <span className="font-mono text-red-400">{fmtTime(elapsed)}</span>
          <button
            onClick={stopAndUpload}
            className="flex items-center gap-1 px-2 py-0.5 rounded font-medium bg-slate-700 hover:bg-slate-600 text-white ml-1"
          >
            <Square className="w-3 h-3" /> Stop
          </button>
          <span className="text-slate-500 text-[10px] ml-auto">Recording…</span>
        </>
      )}

      {phase === 'uploading' && (
        <div className="flex items-center gap-1.5 text-blue-400">
          <Loader2 className="w-3 h-3 animate-spin" />
          Uploading to MinIO…
        </div>
      )}

      {phase === 'processing' && (
        <div className="flex items-center gap-1.5 text-purple-400">
          <Loader2 className="w-3 h-3 animate-spin" />
          AI transcribing…
        </div>
      )}

      {phase === 'done' && (
        <div className="flex items-center gap-2 text-green-400">
          <CheckCircle className="w-3 h-3" />
          Recording saved
          <button
            onClick={() => { setPhase('idle'); setRecordingId(null); setElapsed(0); }}
            className="px-1.5 py-0.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-300 text-[10px]"
          >
            New
          </button>
        </div>
      )}

      {phase === 'error' && (
        <div className="flex items-center gap-2 text-red-400">
          <AlertCircle className="w-3 h-3" />
          Failed
          <button
            onClick={() => { setPhase('idle'); setRecordingId(null); setElapsed(0); }}
            className="px-1.5 py-0.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-300 text-[10px]"
          >
            Retry
          </button>
        </div>
      )}
    </div>
  );
}

// ── In-call helper components ─────────────────────────────────────────────────

function PatientHistoryDiaryTab({ patientId, patientName }: { patientId?: string; patientName?: string }) {
  const id = patientId ? String(patientId) : '';

  const { data: prescriptions, isLoading: rxLoading } = useQuery({
    queryKey: ['patient-rx-call', id],
    queryFn: async () => {
      const res = await api.get(`/doctors/my-patients/${id}/prescriptions`);
      return (res.data.prescriptions ?? []) as any[];
    },
    enabled: !!id,
    staleTime: 60_000,
  });

  const { data: diary, isLoading: diaryLoading } = useQuery({
    queryKey: ['patient-diary-call', id],
    queryFn: async () => {
      try {
        const res = await api.get(`/doctors/my-patients/${id}/diary`);
        return (res.data.entries ?? res.data.diary ?? []) as any[];
      } catch {
        return [] as any[];
      }
    },
    enabled: !!id,
    staleTime: 60_000,
  });

  if (!id) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-3 p-6">
        <BookOpen className="w-10 h-10" />
        <p className="text-sm text-center">Patient history &amp; diary will appear here when linked to a consultation.</p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="p-3 space-y-4">
        {/* Prescription history */}
        <section>
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <FileText className="w-3 h-3" /> Prescription History
          </p>
          {rxLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-14 w-full rounded-lg bg-slate-800" />
              <Skeleton className="h-14 w-full rounded-lg bg-slate-800" />
            </div>
          ) : !prescriptions?.length ? (
            <p className="text-xs text-slate-500 italic py-2">No prescriptions on record</p>
          ) : (
            <div className="space-y-2">
              {prescriptions.slice(0, 6).map((rx: any, i: number) => (
                <div key={rx.id ?? i} className="bg-slate-800/60 rounded-lg p-2.5">
                  <div className="flex justify-between items-center mb-0.5">
                    <p className="text-xs font-medium text-white truncate flex-1">{rx.diagnosis || 'Prescription'}</p>
                    <p className="text-[11px] text-slate-400 ml-2 flex-shrink-0">
                      {rx.date ? new Date(rx.date).toLocaleDateString() : ''}
                    </p>
                  </div>
                  {rx.medications && (
                    <p className="text-[11px] text-slate-400 line-clamp-2">
                      {Array.isArray(rx.medications)
                        ? rx.medications.map((m: any) => m.name || m).join(', ')
                        : String(rx.medications)}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Health diary */}
        <section>
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <BookOpen className="w-3 h-3" /> Health Diary
          </p>
          {diaryLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-16 w-full rounded-lg bg-slate-800" />
              <Skeleton className="h-16 w-full rounded-lg bg-slate-800" />
            </div>
          ) : !diary?.length ? (
            <p className="text-xs text-slate-500 italic py-2">No diary entries found</p>
          ) : (
            <div className="space-y-2">
              {diary.slice(0, 6).map((entry: any, i: number) => (
                <div key={entry.id ?? i} className="bg-slate-800/60 rounded-lg p-2.5">
                  <div className="flex justify-between items-center mb-0.5">
                    <p className="text-xs font-medium text-white truncate flex-1">
                      {entry.title || entry.type || 'Entry'}
                    </p>
                    <p className="text-[11px] text-slate-400 ml-2 flex-shrink-0">
                      {entry.date ? new Date(entry.date).toLocaleDateString() : ''}
                    </p>
                  </div>
                  {(entry.content || entry.notes) && (
                    <p className="text-[11px] text-slate-400 line-clamp-3">{entry.content || entry.notes}</p>
                  )}
                  {entry.mood && (
                    <span className="inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded border border-slate-600 text-slate-400">
                      {entry.mood}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </ScrollArea>
  );
}

function AIVisionInCallPanel({ consultationId }: { consultationId?: string }) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const captureAndAnalyze = async () => {
    setIsAnalyzing(true);
    setCaptureError(null);
    setResult(null);
    try {
      // Prefer the hidden remote-capture video, fall back to any visible video
      const videoEl =
        (document.getElementById('__remote-capture-video') as HTMLVideoElement | null) ??
        (document.querySelector('video:not([muted])') as HTMLVideoElement | null) ??
        (document.querySelector('video') as HTMLVideoElement | null);

      if (!videoEl || !canvasRef.current) throw new Error('No video feed available to capture');

      const canvas = canvasRef.current;
      canvas.width = videoEl.videoWidth || 640;
      canvas.height = videoEl.videoHeight || 480;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas not supported');
      ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
      const imageData = canvas.toDataURL('image/jpeg', 0.8);

      const res = await api.post('/ai/vision/analyze-frame', {
        image: imageData,
        context: 'video_consultation',
        consultation_id: consultationId,
      });
      setResult(res.data.analysis || res.data.result || 'Analysis complete.');
    } catch (err: any) {
      setCaptureError(err.response?.data?.message || err.message || 'Failed to analyze frame');
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto p-3">
      <canvas ref={canvasRef} className="hidden" />

      <div className="flex items-center gap-2 mb-4">
        <div className="p-1.5 rounded-lg bg-blue-500/20 flex-shrink-0">
          <Eye className="w-4 h-4 text-blue-400" />
        </div>
        <div>
          <p className="text-sm font-semibold text-white">AI Vision Analysis</p>
          <p className="text-[11px] text-slate-400">Analyze patient video for clinical indicators</p>
        </div>
      </div>

      <div className="space-y-3">
        <div className="bg-slate-800/60 rounded-lg p-3 space-y-1.5">
          {[
            'Captures current remote video frame',
            'Detects pallor, jaundice, respiratory effort',
            'Identifies visible skin conditions',
            'Estimates pain / distress level from expression',
          ].map((line) => (
            <p key={line} className="text-[11px] text-slate-400 flex items-center gap-1.5">
              <span className="text-teal-400 flex-shrink-0">•</span> {line}
            </p>
          ))}
        </div>

        <Button
          onClick={captureAndAnalyze}
          disabled={isAnalyzing}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm h-9"
        >
          {isAnalyzing ? (
            <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Analyzing...</>
          ) : (
            <><Eye className="w-4 h-4 mr-2" />Analyze Current Frame</>
          )}
        </Button>

        {captureError && (
          <div className="bg-red-950/40 border border-red-800/50 rounded-lg p-3">
            <p className="text-xs text-red-400">{captureError}</p>
          </div>
        )}

        {result && (
          <div className="bg-slate-800 rounded-lg p-3">
            <p className="text-xs font-semibold text-teal-400 mb-2">AI Analysis Result</p>
            <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap">{result}</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default DoctorVideoConsultation;
