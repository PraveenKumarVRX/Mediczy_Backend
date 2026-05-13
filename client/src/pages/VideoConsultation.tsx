import { useAuth } from "@/auth/AuthProvider";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import {
  Video,
  VideoOff,
  Mic,
  MicOff,
  PhoneOff,
  Calendar,
  Clock,
  User,
  ExternalLink,
  Copy,
  CheckCircle2,
  AlertCircle,
  Info,
  Monitor,
  Smartphone,
  Loader2,
  CheckCircle,
  Maximize2,
  Minimize2,
  Settings,
  MessageSquare,
  Phone,
  RefreshCw,
  Shield,
  Wifi,
  Camera,
  X,
  Play,
  Link2
} from "lucide-react";
import { useState, useEffect, useRef, useCallback, lazy, Suspense } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from '@tanstack/react-query';
import api from '@/utils/api';
import { format } from 'date-fns';

// Lazy load LiveKit components
const LiveKitRoom = lazy(() => import('@/components/video/LiveKitRoom'));

interface Appointment {
  id: string;
  doctorId: string;
  doctorName: string;
  specialization: string;
  date: string;
  time: string;
  appointmentDate?: string;
  appointmentTime?: string;
  consultationType: string;
  status: string;
  meetingLink?: string;
  roomId?: string;
  patientName?: string;
}

// LiveKit connection state
interface LiveKitConnection {
  serverUrl: string;
  token: string;
  roomName: string;
}

const VideoConsultation = () => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  
  // Room and meeting state
  const [roomId, setRoomId] = useState(searchParams.get('room') || "");
  const appointmentIdFromUrl = searchParams.get('appointmentId');
  const [copiedLink, setCopiedLink] = useState(false);
  const [activeTab, setActiveTab] = useState("upcoming");
  
  // Video consultation state
  const [isInCall, setIsInCall] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isCallMinimized, setIsCallMinimized] = useState(false);
  const [currentMeetingUrl, setCurrentMeetingUrl] = useState("");
  const [currentAppointment, setCurrentAppointment] = useState<Appointment | null>(null);
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

  // Fetch upcoming video consultations (include both confirmed and in-progress)
  const { data: upcomingAppointments = [], isLoading, refetch } = useQuery({
    queryKey: ['patient-video-consultations', currentUser?._id],
    queryFn: async () => {
      try {
        const response = await api.get('/appointments', {
          params: {
            status: 'confirmed,in-progress,scheduled,rescheduled,accepted'
          }
        });
        const appointments = response.data.appointments || response.data.data || [];
        return appointments
          .map((appointment: any) => ({
            ...appointment,
            date: appointment.date || appointment.appointmentDate || '',
            time: appointment.time || appointment.appointmentTime || ''
          }))
          .filter((appointment: any) => {
            const type = String(appointment.consultationType || '').toLowerCase();
            return ['video', 'online', 'telemedicine'].includes(type);
          });
      } catch (err: any) {
        console.error('Failed to fetch video consultations:', err);
        return [];
      }
    },
    enabled: !!currentUser?._id,
  });

  // Check device permissions
  const checkDevicePermissions = useCallback(async () => {
    setIsCheckingDevices(true);
    
    try {
      // Check camera permission
      const cameraResult = await navigator.permissions.query({ name: 'camera' as PermissionName });
      setCameraPermission(cameraResult.state as 'granted' | 'denied' | 'prompt');
      
      // Check microphone permission
      const micResult = await navigator.permissions.query({ name: 'microphone' as PermissionName });
      setMicPermission(micResult.state as 'granted' | 'denied' | 'prompt');
      
      // Test actual device access
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      
      setCameraWorking(stream.getVideoTracks().length > 0);
      setMicWorking(stream.getAudioTracks().length > 0);
      
      // Show preview
      if (previewVideoRef.current) {
        previewVideoRef.current.srcObject = stream;
        // Ensure video plays after stream is attached
        previewVideoRef.current.onloadedmetadata = () => {
          previewVideoRef.current?.play().catch(e => console.log('Auto-play error:', e));
        };
        // Try to play immediately
        previewVideoRef.current.play().catch(e => console.log('Initial play error:', e));
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
  const generateMeetingUrl = useCallback((roomIdOrAppointment: string | Appointment) => {
    let room = '';
    const name = currentUser?.firstName || 'Patient';
    let directJoinUrl = '';
    
    if (typeof roomIdOrAppointment === 'string') {
      if (roomIdOrAppointment.startsWith('http')) {
        directJoinUrl = roomIdOrAppointment;
      } else {
        room = roomIdOrAppointment;
      }
    } else {
      if (roomIdOrAppointment.meetingLink && roomIdOrAppointment.meetingLink.startsWith('http')) {
        directJoinUrl = roomIdOrAppointment.meetingLink;
      } else {
        room = roomIdOrAppointment.roomId || roomIdOrAppointment.meetingLink || `apt-${roomIdOrAppointment.id}`;
      }
      // Extract room from full URL if needed
      if (room.includes('/join/')) {
        room = room.split('/join/')[1]?.split('?')[0] || room;
      }
    }

    if (directJoinUrl) {
      try {
        const parsed = new URL(directJoinUrl);
        const isAppRoute = parsed.pathname.includes('/video-consultation') || parsed.pathname.includes('/doctor/video');
        if (isAppRoute) {
          const roomFromQuery =
            parsed.searchParams.get('room') ||
            parsed.searchParams.get('roomId') ||
            parsed.searchParams.get('meetingId');
          if (roomFromQuery) {
            room = roomFromQuery;
          }
          directJoinUrl = '';
        } else {
          if (
            parsed.pathname.includes('/rooms/') ||
            parsed.pathname.includes('/room/') ||
            parsed.searchParams.has('access_token')
          ) {
            return parsed.toString();
          }
          if (!parsed.searchParams.has('name')) {
            parsed.searchParams.set('name', name);
          }
          if (!parsed.searchParams.has('audio')) {
            parsed.searchParams.set('audio', '1');
          }
          if (!parsed.searchParams.has('video')) {
            parsed.searchParams.set('video', '1');
          }
          if (!parsed.searchParams.has('notify')) {
            parsed.searchParams.set('notify', '0');
          }
          return parsed.toString();
        }
      } catch (error) {
        // Fall back to room-based URL if parsing fails.
      }
    }

    if (room.includes('/rooms/')) {
      room = room.split('/rooms/')[1]?.split('?')[0] || room;
    } else if (room.includes('/room/')) {
      room = room.split('/room/')[1]?.split('?')[0] || room;
    } else if (room.includes('/join/')) {
      room = room.split('/join/')[1]?.split('?')[0] || room;
    } else if (room.startsWith('http')) {
      try {
        const parsed = new URL(room);
        const parts = parsed.pathname.split('/').filter(Boolean);
        const joinIndex = parts.findIndex((segment) => ['rooms', 'room', 'join'].includes(segment));
        if (joinIndex >= 0 && parts[joinIndex + 1]) {
          room = parts[joinIndex + 1];
        }
      } catch (error) {
        // Keep original value if parsing fails.
      }
    }
    
    return `${LIVEKIT_BASE_URL}/rooms/${room}?name=${encodeURIComponent(name)}`;
  }, [currentUser, LIVEKIT_BASE_URL]);

  // Start video call with pre-call check
  const initiateVideoCall = useCallback(async (appointment?: Appointment, customRoomId?: string) => {
    if (appointment) {
      setCurrentAppointment(appointment);
    }

    const normalizeRoomName = (value?: string) => {
      if (!value) return '';
      let normalized = value.trim();
      if (!normalized) return '';

      if (normalized.startsWith('http')) {
        try {
          const parsed = new URL(normalized);
          if (parsed.pathname.includes('/rooms/')) {
            normalized = parsed.pathname.split('/rooms/')[1]?.split('/')[0] || normalized;
          } else if (parsed.pathname.includes('/room/')) {
            normalized = parsed.pathname.split('/room/')[1]?.split('/')[0] || normalized;
          }
        } catch {
          // keep original value
        }
      }

      if (normalized.includes('/rooms/')) {
        normalized = normalized.split('/rooms/')[1]?.split('?')[0] || normalized;
      } else if (normalized.includes('/room/')) {
        normalized = normalized.split('/room/')[1]?.split('?')[0] || normalized;
      }

      return normalized;
    };

    const joinWithRoomToken = async (rawRoomName: string) => {
      const roomName = normalizeRoomName(rawRoomName);
      if (!roomName) return false;

      const participantName = currentUser?.firstName || 'Patient';

      try {
        const tokenResponse = await api.post('/mobile/video/token', { roomName });
        const data = tokenResponse.data?.data || tokenResponse.data;
        if (tokenResponse.data?.success && data?.token && data?.serverUrl) {
          setLiveKitConnection({
            serverUrl: data.serverUrl,
            token: data.token,
            roomName: data.roomName || roomName,
          });
          setIsInCall(true);
          setConnectionStatus('connecting');
          toast({
            title: '🎥 Joining Video Call',
            description: 'Connecting securely to consultation room...',
          });
          return true;
        }
      } catch (mobileTokenError) {
        console.warn('Mobile token endpoint failed, trying legacy token endpoint:', mobileTokenError);
      }

      try {
        const legacyResponse = await api.post('/video/livekit/token', {
          roomName,
          participantName,
        });
        const data = legacyResponse.data || {};
        if (data?.success && data?.token && data?.serverUrl) {
          setLiveKitConnection({
            serverUrl: data.serverUrl,
            token: data.token,
            roomName: data.roomName || roomName,
          });
          setIsInCall(true);
          setConnectionStatus('connecting');
          toast({
            title: '🎥 Joining Video Call',
            description: 'Connecting securely to consultation room...',
          });
          return true;
        }
      } catch (legacyTokenError) {
        console.error('Legacy token endpoint failed:', legacyTokenError);
      }

      return false;
    };
    
    let room = customRoomId;
    let appointmentId = appointment?.id;
    
    // Extract appointment ID from room ID if it matches apt-XXX pattern
    if (customRoomId && customRoomId.match(/^apt-(\d+)$/)) {
      appointmentId = customRoomId.replace('apt-', '');
    } else if (customRoomId && /^\d+$/.test(customRoomId)) {
      // If it's just a number, treat it as appointment ID
      appointmentId = customRoomId;
    }
    
    // Fetch LiveKit token from the server for any appointment
    if (appointmentId) {
      try {
        toast({
          title: "Connecting to Video Room...",
          description: "Getting your consultation credentials...",
        });
        
        const response = await api.get(`/consultation/video/join/${appointmentId}`);
        
        if (response.data.success && response.data.video) {
          const videoData = response.data.video;
          const livekitData = videoData.livekit || videoData;
          
          console.log('📹 Video consultation data received:', {
            serverUrl: livekitData.serverUrl,
            roomName: livekitData.roomName,
            hasToken: !!livekitData.token
          });
          
          // Use native LiveKit SDK connection
          if (livekitData.serverUrl && livekitData.token) {
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
          
          room = videoData.meetingId || videoData.meetingLink || '';
        }
      } catch (err: any) {
        console.error('Failed to fetch meeting link:', err);
        const errorMessage = err.response?.data?.message || 'Failed to get meeting link';
        toast({
          variant: "destructive",
          title: "Cannot Join",
          description: errorMessage,
        });
        return;
      }
    }

    // Direct room joins (e.g., triage_... links) must use token-based SDK mode.
    if (!appointmentId && room) {
      const joinedWithToken = await joinWithRoomToken(room);
      if (joinedWithToken) {
        return;
      }

      toast({
        variant: "destructive",
        title: "Cannot Join Room",
        description: "Unable to get secure room token. Please retry from the consultation notification.",
      });
      return;
    }
    
    // If we still don't have a room and no appointment ID, show error
    if (!room && !appointmentId) {
      toast({
        variant: "destructive",
        title: "Invalid Room",
        description: "Please enter a valid appointment ID or room code (e.g., apt-123 or 123).",
      });
      return;
    }
    
    // Fallback - shouldn't normally reach here since API call should succeed
    if (!room) {
      room = appointment?.meetingLink || appointment?.roomId || (appointment ? `apt-${appointment.id}` : '');
    }
    
    if (!room) {
      toast({
        variant: "destructive",
        title: "No Room ID",
        description: "Please enter a valid room ID or meeting code.",
      });
      return;
    }
    
    setRoomId(room);
    setShowPreCallCheck(true);
  }, [currentUser, toast]);

  // Actually start the call after device check
  const startVideoCall = useCallback(() => {
    stopPreviewStream();
    setShowPreCallCheck(false);
    
    const meetingUrl = generateMeetingUrl(roomId);
    const isLiveKitMeeting = meetingUrl.includes('/rooms/') || meetingUrl.includes('/room/');
    if (isLiveKitMeeting && !preferEmbeddedJoin) {
      toast({
        title: "Opening LiveKit",
        description: "Launching LiveKit in a new window...",
      });
      window.open(meetingUrl, '_blank', 'width=1280,height=720');
      setIsInCall(false);
      setConnectionStatus('disconnected');
      setCurrentMeetingUrl("");
      return;
    }

    setCurrentMeetingUrl(meetingUrl);
    setIsInCall(true);
    setConnectionStatus('connecting');
    const providerLabel = 'LiveKit';
    
    toast({
      title: "Joining Video Consultation",
      description: `Connecting to ${providerLabel}...`,
    });
    
    // Simulate connection after iframe loads
    setTimeout(() => {
      setConnectionStatus('connected');
    }, 3000);
  }, [roomId, generateMeetingUrl, preferEmbeddedJoin, stopPreviewStream, toast]);

  // End video call
  const endVideoCall = useCallback(() => {
    setIsInCall(false);
    setIsFullscreen(false);
    setIsCallMinimized(false);
    setCurrentMeetingUrl("");
    setCurrentAppointment(null);
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

  // Open in new window (fallback)
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
    setCurrentAppointment(null);
    setConnectionStatus('disconnected');
  }, [currentMeetingUrl, roomId, generateMeetingUrl]);

  // Copy meeting link
  const handleCopyLink = useCallback((link?: string) => {
    const url = link || currentMeetingUrl || generateMeetingUrl(roomId);
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    toast({
      title: "Link Copied",
      description: "Meeting link copied to clipboard",
    });
    setTimeout(() => setCopiedLink(false), 2000);
  }, [currentMeetingUrl, roomId, generateMeetingUrl, toast]);

  // Check if appointment is joinable
  const isJoinable = (date: string, time: string) => {
    const appointmentDate = new Date(`${date} ${time}`);
    const now = new Date();
    const fifteenMinsBefore = new Date(appointmentDate.getTime() - 15 * 60000);
    const thirtyMinsAfter = new Date(appointmentDate.getTime() + 30 * 60000);
    return now >= fifteenMinsBefore && now <= thirtyMinsAfter;
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopPreviewStream();
    };
  }, [stopPreviewStream]);

  // Auto-join video call when appointmentId is passed in URL (from MyBookings)
  useEffect(() => {
    if (appointmentIdFromUrl && currentUser) {
      // Create a minimal appointment object to trigger the API call in initiateVideoCall
      const appointmentFromUrl: Appointment = {
        id: appointmentIdFromUrl,
        doctorId: '',
        doctorName: '',
        specialization: '',
        date: '',
        time: '',
        consultationType: 'video',
        status: 'in-progress',
        meetingLink: roomId || undefined
      };
      
      // Small delay to ensure component is mounted
      const timer = setTimeout(() => {
        initiateVideoCall(appointmentFromUrl);
      }, 500);
      
      return () => clearTimeout(timer);
    }
  }, [appointmentIdFromUrl, currentUser]);

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
      const aptId = appointmentIdFromUrl || currentAppointment?.id;
      if (aptId) {
        setIsInCall(false);
        setLiveKitConnection(null);
        setTimeout(() => {
          initiateVideoCall({
            id: aptId, doctorId: '', doctorName: '', specialization: '',
            date: '', time: '', consultationType: 'video', status: 'in-progress'
          } as Appointment);
        }, 1000);
        return;
      }
    }
    toast({
      variant: "destructive",
      title: "Video Call Error",
      description: error.message,
    });
  }, [toast, liveKitConnection, appointmentIdFromUrl, currentAppointment, initiateVideoCall]);

  // Active video call UI - Native LiveKit
  if (isInCall && liveKitConnection && !isCallMinimized) {
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
            participantName={currentUser?.firstName || 'Patient'}
            onDisconnect={handleLiveKitDisconnect}
            onError={handleLiveKitError}
            onMinimize={() => setIsCallMinimized(true)}
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
        className="min-h-[100svh] bg-slate-900 flex flex-col items-center justify-center"
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
                if (appointmentIdFromUrl) {
                  const appointmentFromUrl: Appointment = {
                    id: appointmentIdFromUrl,
                    doctorId: '',
                    doctorName: '',
                    specialization: '',
                    date: '',
                    time: '',
                    consultationType: 'video',
                    status: 'in-progress',
                  };
                  initiateVideoCall(appointmentFromUrl);
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
    <>
      <div className="container mx-auto py-8 px-4">
        <div className="max-w-6xl mx-auto space-y-8">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-teal-600 to-blue-600 bg-clip-text text-transparent">
                Video Consultations
              </h1>
              <p className="text-slate-600 dark:text-slate-400 mt-1">
                Connect with your doctors via secure HD video calls
              </p>
            </div>
            <Button 
              onClick={() => refetch()} 
              variant="outline" 
              size="sm"
              className="gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </Button>
          </div>

          {/* Quick Join Card */}
          <Card className="border-teal-200 dark:border-teal-800 bg-gradient-to-r from-teal-50 to-blue-50 dark:from-teal-950/30 dark:to-blue-950/30">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-teal-700 dark:text-teal-400">
                <Video className="h-5 w-5" />
                Quick Join
              </CardTitle>
              <CardDescription className="dark:text-slate-400">
                Have a meeting code? Enter it below to join your video consultation instantly
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-4 lg:flex-row">
                <div className="flex-1 min-w-0">
                  <Label htmlFor="roomId" className="text-slate-700 dark:text-slate-300">Meeting Code / Room ID</Label>
                  <Input
                    id="roomId"
                    placeholder="Enter meeting code (e.g., apt-12345)"
                    value={roomId}
                    onChange={(e) => setRoomId(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && roomId && initiateVideoCall(undefined, roomId)}
                    className="mt-1 bg-white dark:bg-slate-800"
                  />
                </div>
                <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-end sm:justify-end">
                  <Button 
                    onClick={() => initiateVideoCall(undefined, roomId)} 
                    disabled={!roomId.trim()}
                    className="w-full gap-2 bg-teal-600 hover:bg-teal-700 sm:w-auto"
                  >
                    <Play className="h-4 w-4" />
                    Join Meeting
                  </Button>
                  <Button 
                    onClick={() => handleCopyLink()}
                    variant="outline"
                    disabled={!roomId.trim()}
                    title="Copy meeting link"
                    className="w-full sm:w-auto"
                  >
                    <Link2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              
              {/* Quick Test Room */}
              <div className="mt-4 p-3 bg-white/50 dark:bg-slate-800/50 rounded-lg border border-teal-200 dark:border-teal-800">
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">
                  <Info className="w-4 h-4 inline mr-1" />
                  Test your connection with a demo room:
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setRoomId(`test-${currentUser?._id || 'demo'}-${Date.now()}`);
                    }}
                  >
                    Generate Test Room
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Tabs for Upcoming and Past */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2 bg-slate-100 dark:bg-slate-800">
              <TabsTrigger value="upcoming" className="gap-2">
                <Calendar className="w-4 h-4" />
                Upcoming ({upcomingAppointments.filter((a: Appointment) => isJoinable(a.date, a.time)).length})
              </TabsTrigger>
              <TabsTrigger value="all" className="gap-2">
                <Clock className="w-4 h-4" />
                All Appointments
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="upcoming" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Video className="h-5 w-5 text-teal-600" />
                    Ready to Join
                  </CardTitle>
                  <CardDescription>
                    Appointments you can join now (available 15 minutes before scheduled time)
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {isLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
                    </div>
                  ) : upcomingAppointments.filter((a: Appointment) => isJoinable(a.date, a.time)).length === 0 ? (
                    <div className="text-center py-12">
                      <Calendar className="h-16 w-16 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
                      <h3 className="text-lg font-semibold text-slate-800 dark:text-white mb-2">
                        No Consultations Ready to Join
                      </h3>
                      <p className="text-slate-600 dark:text-slate-400 mb-4">
                        Your scheduled appointments will appear here when it's time to join
                      </p>
                      <Button onClick={() => navigate('/consultation')} variant="outline">
                        Book New Appointment
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {upcomingAppointments
                        .filter((a: Appointment) => isJoinable(a.date, a.time))
                        .map((appointment: Appointment) => (
                          <div
                            key={appointment.id}
                            className="flex flex-col md:flex-row items-start md:items-center gap-4 p-4 border border-green-200 dark:border-green-800 rounded-lg bg-green-50/50 dark:bg-green-950/20"
                          >
                            <div className="flex items-center gap-4 flex-1">
                              <div className="h-14 w-14 rounded-full bg-teal-100 dark:bg-teal-900/50 flex items-center justify-center">
                                <User className="h-7 w-7 text-teal-600 dark:text-teal-400" />
                              </div>
                              <div className="flex-1">
                                <h3 className="font-semibold text-lg text-slate-800 dark:text-white">
                                  Dr. {appointment.doctorName}
                                </h3>
                                <p className="text-sm text-slate-600 dark:text-slate-400">
                                  {appointment.specialization}
                                </p>
                                <div className="flex items-center gap-4 mt-2 text-sm">
                                  <span className="flex items-center gap-1 text-slate-600 dark:text-slate-400">
                                    <Calendar className="h-4 w-4" />
                                    {format(new Date(`${appointment.date} ${appointment.time}`), 'MMM dd, yyyy')}
                                  </span>
                                  <span className="flex items-center gap-1 text-slate-600 dark:text-slate-400">
                                    <Clock className="h-4 w-4" />
                                    {format(new Date(`${appointment.date} ${appointment.time}`), 'hh:mm a')}
                                  </span>
                                </div>
                              </div>
                            </div>
                            <div className="flex flex-col gap-2 w-full md:w-auto">
                              <Button
                                onClick={() => initiateVideoCall(appointment)}
                                className="gap-2 bg-green-600 hover:bg-green-700 text-white"
                                size="lg"
                              >
                                <Video className="h-5 w-5" />
                                Join Now
                              </Button>
                              <Badge variant="secondary" className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 justify-center">
                                <CheckCircle2 className="h-3 w-3 mr-1" />
                                Ready to Join
                              </Badge>
                            </div>
                          </div>
                        ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
            
            <TabsContent value="all" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>All Scheduled Consultations</CardTitle>
                  <CardDescription>View all your online consultation appointments</CardDescription>
                </CardHeader>
                <CardContent>
                  {isLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
                    </div>
                  ) : upcomingAppointments.length === 0 ? (
                    <div className="text-center py-8 text-slate-600 dark:text-slate-400">
                      No scheduled consultations
                    </div>
                  ) : (
                    <ScrollArea className="h-[400px]">
                      <div className="space-y-3">
                        {upcomingAppointments.map((apt: Appointment) => {
                          const canJoin = isJoinable(apt.date, apt.time);
                          return (
                            <div
                              key={apt.id}
                              className={`flex items-center justify-between p-4 border rounded-lg ${
                                canJoin 
                                  ? 'border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-950/20' 
                                  : 'border-slate-200 dark:border-slate-700'
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                <div className={`h-10 w-10 rounded-full flex items-center justify-center ${
                                  canJoin ? 'bg-green-100 dark:bg-green-900/50' : 'bg-slate-100 dark:bg-slate-800'
                                }`}>
                                  <User className={`h-5 w-5 ${canJoin ? 'text-green-600' : 'text-slate-500'}`} />
                                </div>
                                <div>
                                  <p className="font-medium text-slate-800 dark:text-white">Dr. {apt.doctorName}</p>
                                  <p className="text-sm text-slate-600 dark:text-slate-400">
                                    {format(new Date(`${apt.date} ${apt.time}`), 'MMM dd, yyyy - hh:mm a')}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <Badge variant={canJoin ? "default" : "secondary"} className={canJoin ? 'bg-green-600' : ''}>
                                  {canJoin ? 'Ready' : apt.status}
                                </Badge>
                                {canJoin && (
                                  <Button size="sm" onClick={() => initiateVideoCall(apt)} className="gap-1">
                                    <Video className="h-4 w-4" />
                                    Join
                                  </Button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </ScrollArea>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          {/* System Requirements Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Info className="h-5 w-5 text-blue-600" />
                System Requirements & Tips
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid md:grid-cols-3 gap-4">
                <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <Monitor className="h-5 w-5 text-blue-600" />
                    <h4 className="font-medium text-slate-800 dark:text-white">Supported Browsers</h4>
                  </div>
                  <ul className="text-sm text-slate-600 dark:text-slate-400 space-y-1">
                    <li>• Chrome (Recommended)</li>
                    <li>• Firefox</li>
                    <li>• Safari 12+</li>
                    <li>• Edge</li>
                  </ul>
                </div>
                <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <Camera className="h-5 w-5 text-green-600" />
                    <h4 className="font-medium text-slate-800 dark:text-white">Required Permissions</h4>
                  </div>
                  <ul className="text-sm text-slate-600 dark:text-slate-400 space-y-1">
                    <li>• Camera access</li>
                    <li>• Microphone access</li>
                    <li>• Allow pop-ups (optional)</li>
                  </ul>
                </div>
                <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <Wifi className="h-5 w-5 text-teal-600" />
                    <h4 className="font-medium text-slate-800 dark:text-white">Connection</h4>
                  </div>
                  <ul className="text-sm text-slate-600 dark:text-slate-400 space-y-1">
                    <li>• Stable internet (5+ Mbps)</li>
                    <li>• WebRTC supported</li>
                    <li>• Low latency preferred</li>
                  </ul>
                </div>
              </div>
              <div className="bg-teal-50 dark:bg-teal-950/30 p-4 rounded-lg border border-teal-200 dark:border-teal-800">
                <p className="text-sm text-teal-700 dark:text-teal-300">
                  <strong>💡 Tip:</strong> Join 5-10 minutes before your appointment time to test your camera and microphone. 
                  Close other tabs and applications for the best video quality.
                </p>
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
            participantName={currentUser?.firstName || 'Patient'}
            onDisconnect={handleLiveKitDisconnect}
            onError={handleLiveKitError}
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
        <DialogContent className="w-[95vw] max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5 text-teal-600" />
              Pre-Call Equipment Check
            </DialogTitle>
            <DialogDescription>
              Let's make sure your camera and microphone are working before joining
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
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                Join Call
              </Button>
            </div>
            
            {/* Skip option */}
            <div className="text-center">
              <Button 
                variant="link" 
                onClick={startVideoCall}
                className="text-sm text-slate-500"
              >
                Skip check and join anyway
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default VideoConsultation;
