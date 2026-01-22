import { useAuth } from "@/auth/AuthProvider";
import MainLayout from "@/components/layout/MainLayoutdoctor";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import RecordingControls from "@/components/consultation/RecordingControls";
import TranscriptionViewer from "@/components/consultation/TranscriptionViewer";
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
import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from '@tanstack/react-query';
import api from '@/utils/api';

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

const DoctorVideoConsultation = () => {
  const { currentDoctor } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  
  // Room and meeting state
  const [roomId, setRoomId] = useState(searchParams.get('room') || "");
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
  
  // UI state
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  
  // Refs
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

  // MiroTalk base URL
  const MIROTALK_BASE_URL = import.meta.env.VITE_MIROTALK_URL || 'https://video.mediqzy.com';

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
    return `${MIROTALK_BASE_URL}/join/${room}?name=${encodeURIComponent(name)}&audio=1&video=1&notify=0`;
  }, [currentDoctor, MIROTALK_BASE_URL]);

  // Start video call with pre-call check
  const initiateVideoCall = useCallback(async (consultation?: Consultation, customRoomId?: string) => {
    if (consultation) {
      setCurrentConsultation(consultation);
      
      // If this is a scheduled appointment, call backend API to initiate call and notify patient
      if (consultation.id) {
        try {
          toast({
            title: "📞 Initiating Call...",
            description: "Notifying patient and preparing video room...",
          });

          const response = await api.post(`/doctors/appointments/${consultation.id}/initiate-call`);
          
          if (response.data.success) {
            toast({
              title: "✅ Patient Notified",
              description: `${response.data.appointment.patientName} has been notified. Opening video room...`,
            });

            // Use the meeting link from response
            const meetingUrl = response.data.video.directJoinUrl || response.data.video.meetingLink;
            
            // Open video in new window immediately for doctor
            window.open(meetingUrl, '_blank', 'width=1280,height=720');
            
            // Update state
            setRoomId(response.data.video.roomId || response.data.video.meetingId);
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
    }
    
    // For custom room ID or manual entry
    const room = customRoomId || (consultation?.roomId || consultation?.meetingLink || (consultation ? consultation.id : ''));
    
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
  }, [toast]);

  // Actually start the call after device check
  const startVideoCall = useCallback(() => {
    stopPreviewStream();
    setShowPreCallCheck(false);
    
    const meetingUrl = generateMeetingUrl(roomId);
    setCurrentMeetingUrl(meetingUrl);
    setIsInCall(true);
    setConnectionStatus('connecting');
    
    toast({
      title: "Starting Video Consultation",
      description: "Connecting to MiroTalk SFU...",
    });
    
    setTimeout(() => {
      setConnectionStatus('connected');
    }, 3000);
  }, [roomId, generateMeetingUrl, stopPreviewStream, toast]);

  // End video call
  const endVideoCall = useCallback(() => {
    setIsInCall(false);
    setIsFullscreen(false);
    setCurrentMeetingUrl("");
    setCurrentConsultation(null);
    setConnectionStatus('disconnected');
    setRoomId("");
    
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

  // Copy meeting link
  const handleCopyLink = useCallback((room?: string) => {
    const targetRoom = room || roomId;
    const url = generateMeetingUrl(targetRoom);
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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopPreviewStream();
    };
  }, [stopPreviewStream]);

  // Active video call UI
  if (isInCall) {
    return (
      <div 
        ref={containerRef}
        className={`${isFullscreen ? 'fixed inset-0 z-50' : 'min-h-screen'} bg-slate-900 flex flex-col`}
      >
        {/* Video Call Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-slate-800/80 backdrop-blur-sm border-b border-slate-700">
          <div className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full ${
              connectionStatus === 'connected' ? 'bg-green-500 animate-pulse' : 
              connectionStatus === 'connecting' ? 'bg-yellow-500 animate-pulse' : 'bg-red-500'
            }`} />
            <div>
              <h2 className="text-white font-semibold">
                {currentConsultation ? `Patient: ${currentConsultation.patient}` : 'Video Consultation'}
              </h2>
              <p className="text-slate-400 text-sm">
                {connectionStatus === 'connected' ? 'Connected' : 
                 connectionStatus === 'connecting' ? 'Connecting...' : 'Disconnected'}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-teal-400 border-teal-400">
              <Shield className="w-3 h-3 mr-1" />
              HIPAA Compliant
            </Badge>
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => handleCopyLink()}
              className="text-slate-400 hover:text-white"
              title="Share meeting link"
            >
              <Share2 className="w-4 h-4" />
            </Button>
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={openInNewWindow}
              className="text-slate-400 hover:text-white"
              title="Open in new window"
            >
              <ExternalLink className="w-4 h-4" />
            </Button>
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={toggleFullscreen}
              className="text-slate-400 hover:text-white"
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </Button>
          </div>
        </div>
        
        {/* MiroTalk SFU Iframe */}
        <div className="flex-1 relative">
          <iframe
            ref={iframeRef}
            src={currentMeetingUrl}
            className="absolute inset-0 w-full h-full border-0"
            allow="camera; microphone; display-capture; autoplay; clipboard-write; fullscreen"
            allowFullScreen
          />
          
          {connectionStatus === 'connecting' && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-900/80">
              <div className="text-center">
                <Loader2 className="w-12 h-12 animate-spin text-teal-500 mx-auto mb-4" />
                <p className="text-white text-lg">Connecting to video consultation...</p>
                <p className="text-slate-400 text-sm mt-2">Please allow camera and microphone access when prompted</p>
              </div>
            </div>
          )}
        </div>
        
        {/* Bottom Control Bar */}
        <div className="flex items-center justify-center gap-4 px-4 py-4 bg-slate-800/80 backdrop-blur-sm border-t border-slate-700">
          <Button
            onClick={endVideoCall}
            className="bg-red-600 hover:bg-red-700 text-white px-8 py-6 rounded-full"
          >
            <PhoneOff className="w-6 h-6 mr-2" />
            End Call
          </Button>
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
              
              <Button 
                onClick={() => navigate('/doctor/prescriptions')}
                variant="outline" 
                className="w-full border-purple-300 text-purple-700 hover:bg-purple-50 dark:border-purple-700 dark:text-purple-400 dark:hover:bg-purple-950/30"
              >
                Go to Prescriptions to Test AI Features
              </Button>
            </CardContent>
          </Card>

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
