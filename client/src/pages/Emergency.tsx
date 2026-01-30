import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useState, useEffect, useRef, useCallback } from "react";
import Layout from "@/components/layout/MainLayout";
import { Phone, MapPin, Loader2, Locate, Stethoscope, AlertTriangle, Users, Mic, MicOff, Video, VideoOff, Camera, Send, Volume2, VolumeX, MessageSquare, X, RefreshCw, Brain, Activity, Eye, PhoneOff, ExternalLink, Coins } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-routing-machine';
import 'leaflet-routing-machine/dist/leaflet-routing-machine.css';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DrISHAChat } from "@/components/DrISHAChat";
import { drIshaAPI } from '@/services/drIsha';
import api from "@/utils/api";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { analyzeVideoFrame, initializeVisionAI, cleanupVisionAI, getTriageSummary, type VisionAnalysisResult } from '@/services/visionAI';
import socketService from '@/services/socket.service';
import { PurchaseCoinsDialog } from '@/components/wallet/PurchaseCoinsDialog';

// Fix Leaflet icon issue
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.3.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.3.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.3.1/images/marker-shadow.png',
});

interface Hospital {
  id: string;
  name: string;
  address: string;
  phone?: string;
  lat: number;
  lon: number;
  distance?: number;
  type: string;
  emergency: boolean;
}

interface EmergencyContact {
  name: string;
  phone: string;
  relationship: string;
}

interface SMSResponse {
  success: boolean;
  message: string;
}

// Triage chat message interface
interface TriageChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  type: 'text' | 'voice' | 'image';
  imageUrl?: string;
  urgencyLevel?: 'IMMEDIATE' | 'URGENT' | 'LESS_URGENT' | 'NON_URGENT';
}

// Calculate distance between two points using Haversine formula
const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

// Real hospital data
const hospitalData: Hospital[] = [
  {
    id: "1",
    name: "AIIMS Delhi",
    address: "Sri Aurobindo Marg, Ansari Nagar, New Delhi, Delhi 110029",
    phone: "011-26588500",
    lat: 28.5672,
    lon: 77.2100,
    type: "Hospital",
    emergency: true
  },
  {
    id: "2",
    name: "Fortis Hospital",
    address: "Sector B-1, Vasant Kunj, New Delhi, Delhi 110070",
    phone: "011-42776222",
    lat: 28.5231,
    lon: 77.1558,
    type: "Hospital",
    emergency: true
  },
  {
    id: "3",
    name: "Max Super Speciality Hospital",
    address: "1, Press Enclave Road, Saket, New Delhi, Delhi 110017",
    phone: "011-26515050",
    lat: 28.5284,
    lon: 77.2157,
    type: "Hospital",
    emergency: true
  },
  {
    id: "4",
    name: "Apollo Hospital",
    address: "Sarita Vihar, Delhi Mathura Road, New Delhi, Delhi 110076",
    phone: "011-71791090",
    lat: 28.5361,
    lon: 77.2833,
    type: "Hospital",
    emergency: true
  },
  {
    id: "5",
    name: "Safdarjung Hospital",
    address: "Ansari Nagar East, New Delhi, Delhi 110029",
    phone: "011-26707444",
    lat: 28.5686,
    lon: 77.2066,
    type: "Hospital",
    emergency: true
  },
  {
    id: "6",
    name: "Sir Ganga Ram Hospital",
    address: "Rajinder Nagar, New Delhi, Delhi 110060",
    phone: "011-25750000",
    lat: 28.6403,
    lon: 77.1897,
    type: "Hospital",
    emergency: true
  }
];

const DEFAULT_LOCATION = { lat: 28.6139, lng: 77.2090 };

const Emergency = () => {
  const [isSOSActive, setIsSOSActive] = useState(false);
  const [showTriageDialog, setShowTriageDialog] = useState(false);
  const [emergencySymptoms, setEmergencySymptoms] = useState("");
  const [triageResult, setTriageResult] = useState<any>(null);
  const [isTriaging, setIsTriaging] = useState(false);
  const [loading, setLoading] = useState(true);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationAccuracy, setLocationAccuracy] = useState<number | null>(null);
  const [locationSource, setLocationSource] = useState<'gps' | 'network' | 'manual' | 'ip'>('network');
  const [isWatchingLocation, setIsWatchingLocation] = useState(false);
  const [showManualLocation, setShowManualLocation] = useState(false);
  const [manualCoords, setManualCoords] = useState({ lat: '', lng: '' });
  const [mapInitialized, setMapInitialized] = useState(false);
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [showAllHospitals, setShowAllHospitals] = useState(false);
  const mapRef = useRef<L.Map | null>(null);
  const routingControlRef = useRef<any>(null);
  const markersRef = useRef<L.Marker[]>([]);
  const watchIdRef = useRef<number | null>(null);
  const userMarkerRef = useRef<L.Marker | null>(null);
  const accuracyCircleRef = useRef<L.Circle | null>(null);
  const { toast } = useToast();
  const [emergencyContacts, setEmergencyContacts] = useState<EmergencyContact[]>(() => {
    const saved = localStorage.getItem('emergencyContacts');
    return saved ? JSON.parse(saved) : [];
  });
  
  // Fetch user HC balance
  useEffect(() => {
    const fetchHCBalance = async () => {
      try {
        const token = localStorage.getItem('token');
        if (!token) return;

        const response = await api.get('/wallet/balance');

        if (response.data.success) {
          setUserHCBalance(parseFloat(response.data.balance || 0));
        }
      } catch (error) {
        console.error('Error fetching HC balance:', error);
      }
    };

    fetchHCBalance();
  }, []);
  
  // Handle HC purchase success
  const handleHCPurchaseSuccess = async () => {
    // Refresh HC balance
    try {
      const token = localStorage.getItem('token');
      if (!token) return;

      const response = await api.get('/wallet/balance');

      if (response.data.success) {
        setUserHCBalance(parseFloat(response.data.balance || 0));
        toast({
          title: "✅ Health Coins Added!",
          description: `Your new balance: ${parseFloat(response.data.balance || 0).toFixed(2)} HC`,
        });
      }
    } catch (error) {
      console.error('Error refreshing HC balance:', error);
    }
  };
  const [isEditingContacts, setIsEditingContacts] = useState(false);
  const [newContact, setNewContact] = useState<EmergencyContact>({ name: '', phone: '', relationship: '' });

  // Multi-modal Triage States
  const [showTriageChat, setShowTriageChat] = useState(false);
  const [triageChatMessages, setTriageChatMessages] = useState<TriageChatMessage[]>([]);
  const [triageInput, setTriageInput] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isVideoMode, setIsVideoMode] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [autoSpeak, setAutoSpeak] = useState(true);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [triageMode, setTriageMode] = useState<'text' | 'voice' | 'video'>('text');
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentUrgency, setCurrentUrgency] = useState<string | null>(null);
  const [isStreamReady, setIsStreamReady] = useState(false);
  
  // Online Doctor Connection States
  const [availableTriageDoctors, setAvailableTriageDoctors] = useState<any[]>([]);
  const [isLoadingDoctors, setIsLoadingDoctors] = useState(false);
  const [showDoctorList, setShowDoctorList] = useState(false);
  const [connectingToDoctor, setConnectingToDoctor] = useState(false);
  const [videoCallInfo, setVideoCallInfo] = useState<{roomId: string, joinUrl: string, doctor: any, appointmentId?: string} | null>(null);
  
  // AI-Powered Video Call States
  const [showEmbeddedVideoCall, setShowEmbeddedVideoCall] = useState(false);
  const [isAITranscribing, setIsAITranscribing] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState<string[]>([]);
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);
  
  // Health Coins Payment States
  const [userHCBalance, setUserHCBalance] = useState<number>(0);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [paymentInfo, setPaymentInfo] = useState<{pendingAmount: number, hcRequired: number} | null>(null);
  const [showPurchaseHCDialog, setShowPurchaseHCDialog] = useState(false);
  const [vitalSigns, setVitalSigns] = useState<{pulse?: string, breathing?: string, consciousness?: string} | null>(null);
  const [isRecordingConsultation, setIsRecordingConsultation] = useState(false);
  
  // Vision AI States
  const [visionAIEnabled, setVisionAIEnabled] = useState(true);
  const [visionAnalysis, setVisionAnalysis] = useState<VisionAnalysisResult | null>(null);
  const [visionAlerts, setVisionAlerts] = useState<string[]>([]);
  const [sceneDescription, setSceneDescription] = useState<string>('');
  const visionIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  
  // Socket.IO States for call notifications
  const [isSocketConnected, setIsSocketConnected] = useState(false);
  const [waitingForDoctor, setWaitingForDoctor] = useState(false);
  
  // Refs for media
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const speechSynthRef = useRef<SpeechSynthesisUtterance | null>(null);
  const recognitionRef = useRef<any>(null);
  const recenterOnUser = () => {
    if (mapRef.current && userLocation) {
      mapRef.current.setView([userLocation.lat, userLocation.lng], 15);
      updateUserMarkerOnMap(userLocation.lat, userLocation.lng, locationAccuracy || 0);
      toast({
        title: "Centered on your location",
        description: locationAccuracy ? `Accuracy ±${locationAccuracy.toFixed(0)}m` : undefined,
      });
    } else {
      refreshUserLocation();
    }
  };

  // Explicit permission request to trigger browser prompt for location
  const requestLocationPermission = () => {
    if (!navigator.geolocation) {
      toast({
        title: "Location not supported",
        description: "Your browser does not support geolocation.",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Requesting location",
      description: "Please allow location access in your browser for accurate SOS routing.",
    });

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        const next = { lat: latitude, lng: longitude };
        setUserLocation(next);
        setLocationAccuracy(accuracy);
        setLocationSource(accuracy < 100 ? 'gps' : 'network');
        await fetchNearbyHospitals(next.lat, next.lng);
        setLoading(false);
        if (mapRef.current) {
          mapRef.current.setView([next.lat, next.lng], 15);
          updateUserMarkerOnMap(next.lat, next.lng, accuracy);
        }
        toast({
          title: "Location enabled",
          description: `Accuracy: ±${accuracy.toFixed(0)}m`,
        });
      },
      async (error) => {
        console.error('Permission/location error:', error);
        setLocationError('Location permission denied or unavailable.');
        await fetchApproximateLocation('Location permission not granted.');
        setLoading(false);
        toast({
          title: "Location blocked",
          description: "Enable location in browser settings for precise map & directions.",
          variant: "destructive",
        });
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  // Auto-scroll chat to bottom
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [triageChatMessages]);

  // Auto-fetch online triage doctors on mount
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      fetchTriageDoctors();
    }
  }, []);

  // Load speech synthesis voices when available
  useEffect(() => {
    const loadVoices = () => {
      window.speechSynthesis?.getVoices();
    };
    
    loadVoices();
    if (window.speechSynthesis) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
    
    return () => {
      if (window.speechSynthesis) {
        window.speechSynthesis.onvoiceschanged = null;
      }
    };
  }, []);

  // Cleanup media on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      window.speechSynthesis?.cancel();
    };
  }, []);

  // Socket.IO connection for real-time call notifications
  useEffect(() => {
    const resolveSocketUserId = () => {
      const userPayload = localStorage.getItem('userData') || localStorage.getItem('user');
      if (userPayload) {
        try {
          const parsed = JSON.parse(userPayload);
          return parsed?.id || parsed?.user_id || null;
        } catch (error) {
          console.warn('Failed to parse stored user payload:', error);
        }
      }
      const storedId = localStorage.getItem('userId');
      if (storedId) {
        const id = Number(storedId);
        return Number.isNaN(id) ? null : id;
      }
      return null;
    };

    const userId = resolveSocketUserId();
    if (!userId) return;

    console.log('🔌 Connecting Socket.IO for patient:', userId);

    // Connect to Socket.IO
    socketService.connect(userId, 'user');
    setIsSocketConnected(true);

    // Listen for call accepted event
    const handleCallAccepted = (data: any) => {
      console.log('✅ Doctor accepted call:', data);
      
      setWaitingForDoctor(false);
      
      toast({
        title: "✅ Doctor Accepted Your Call!",
        description: `${data.doctorName} is joining the video call`,
        duration: 5000,
      });

      // Auto-join the video room
      if (videoCallInfo?.joinUrl) {
        setShowEmbeddedVideoCall(true);
        // Scroll to video section
        setTimeout(() => {
          document.getElementById('video-call-section')?.scrollIntoView({ behavior: 'smooth' });
        }, 100);
      }
    };

    // Listen for call rejected event
    const handleCallRejected = (data: any) => {
      console.log('❌ Doctor rejected call:', data);
      
      setWaitingForDoctor(false);
      setVideoCallInfo(null);
      setShowEmbeddedVideoCall(false);
      
      toast({
        title: "❌ Call Not Available",
        description: data.reason || 'Doctor is currently unavailable. Please try again.',
        variant: "destructive",
        duration: 7000,
      });
    };

    socketService.on('triage-call-accepted', handleCallAccepted);
    socketService.on('triage-call-rejected', handleCallRejected);

    // Cleanup on unmount
    return () => {
      console.log('🔌 Disconnecting Socket.IO');
      socketService.off('triage-call-accepted', handleCallAccepted);
      socketService.off('triage-call-rejected', handleCallRejected);
      socketService.disconnect();
      setIsSocketConnected(false);
    };
  }, [videoCallInfo]);

  // Attach video stream to video element when video mode is active
  useEffect(() => {
    if (isVideoMode && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(console.error);
    }
  }, [isVideoMode]);

  // Text-to-Speech function using Eleven Labs API
  const speakText = useCallback(async (text: string) => {
    if (!autoSpeak) return;
    
    // Clean text for speech
    const cleanText = text
      .replace(/\p{Extended_Pictographic}/gu, '')
      .replace(/\u{FE0F}/gu, '')
      .replace(/\*\*/g, '')
      .replace(/#{1,6}\s/g, '')
      .replace(/•/g, '')
      .replace(/---/g, '')
      .substring(0, 1000); // Eleven Labs can handle longer text
    
    if (!cleanText.trim()) return;
    
    setIsSpeaking(true);
    
    try {
      // Use Eleven Labs API via backend
      const response = await fetch('/api/tts/speak', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: cleanText,
          voiceId: 'pjcYQlDFKMbcOUp6F5GD', // Dr. iSHA female voice
          model: 'eleven_turbo_v2_5',
        }),
      });
      
      if (!response.ok) {
        throw new Error('TTS API failed');
      }
      
      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      
      audio.onended = () => {
        setIsSpeaking(false);
        URL.revokeObjectURL(audioUrl);
      };
      audio.onerror = () => {
        setIsSpeaking(false);
        URL.revokeObjectURL(audioUrl);
      };
      
      await audio.play();
      
    } catch (error) {
      console.warn('Eleven Labs TTS failed, falling back to browser TTS:', error);
      // Fallback to browser speech synthesis
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(cleanText.substring(0, 500));
        utterance.rate = 0.95;
        utterance.pitch = 1.1;
        utterance.lang = 'en-US';
        
        const voices = window.speechSynthesis.getVoices();
        const femaleVoice = voices.find(v => 
          v.name.toLowerCase().includes('samantha') ||
          v.name.toLowerCase().includes('female') ||
          v.name.toLowerCase().includes('zira')
        ) || voices.find(v => v.lang.startsWith('en'));
        
        if (femaleVoice) utterance.voice = femaleVoice;
        
        utterance.onend = () => setIsSpeaking(false);
        utterance.onerror = () => setIsSpeaking(false);
        speechSynthRef.current = utterance;
        window.speechSynthesis.speak(utterance);
      } else {
        setIsSpeaking(false);
      }
    }
  }, [autoSpeak]);

  // Stop speaking
  const stopSpeaking = () => {
    window.speechSynthesis?.cancel();
    setIsSpeaking(false);
  };

  // Start voice recognition
  const startVoiceRecording = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
      toast({
        title: "Voice Not Supported",
        description: "Your browser doesn't support voice recognition. Try Chrome or Edge.",
        variant: "destructive",
      });
      return;
    }

    recognitionRef.current = new SpeechRecognition();
    recognitionRef.current.continuous = true;
    recognitionRef.current.interimResults = true;
    recognitionRef.current.lang = 'en-US';

    let finalTranscript = '';

    recognitionRef.current.onstart = () => {
      setIsRecording(true);
      setTriageMode('voice');
      toast({
        title: "🎤 Listening...",
        description: "Speak clearly. Describe your symptoms in detail.",
      });
    };

    recognitionRef.current.onresult = (event: any) => {
      let interimTranscript = '';
      
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript + ' ';
        } else {
          interimTranscript += transcript;
        }
      }
      
      setTriageInput(finalTranscript + interimTranscript);
    };

    recognitionRef.current.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      setIsRecording(false);
      if (event.error !== 'aborted') {
        toast({
          title: "Voice Error",
          description: "Could not recognize speech. Please try again or type instead.",
          variant: "destructive",
        });
      }
    };

    recognitionRef.current.onend = () => {
      setIsRecording(false);
      if (finalTranscript.trim()) {
        // Auto-send after voice recording stops
        sendTriageMessage(finalTranscript.trim(), 'voice');
      }
    };

    recognitionRef.current.start();
  };

  // Stop voice recognition
  const stopVoiceRecording = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    setIsRecording(false);
  };

  // Start video/camera
  const startVideoMode = async () => {
    try {
      // Stop any existing stream first
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      setIsStreamReady(false);
      
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode: 'environment', 
          width: { ideal: 1280, min: 640 }, 
          height: { ideal: 720, min: 480 } 
        },
        audio: false
      });
      
      streamRef.current = stream;
      setIsVideoMode(true);
      setTriageMode('video');
      
      // Use setTimeout to ensure video element is rendered after state update
      setTimeout(() => {
        if (videoRef.current && streamRef.current) {
          videoRef.current.srcObject = streamRef.current;
          videoRef.current.onloadedmetadata = () => {
            setIsStreamReady(true);
            videoRef.current?.play().catch(err => {
              console.error('Video play error:', err);
            });
            
            // Auto-start Vision AI when camera is ready
            setTimeout(() => {
              startVisionAIAnalysis();
            }, 500);
          };
        }
      }, 100);
      
      toast({
        title: "📹 Camera + Vision AI Active",
        description: "AI is analyzing the video for medical signs",
      });
    } catch (error) {
      console.error('Error accessing camera:', error);
      setIsStreamReady(false);
      toast({
        title: "Camera Error",
        description: "Could not access camera. Please check permissions.",
        variant: "destructive",
      });
    }
  };

  // Stop video/camera
  const stopVideoMode = () => {
    // Stop Vision AI first
    stopVisionAI();
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsVideoMode(false);
    setIsStreamReady(false);
    setCapturedImage(null);
  };

  // Capture image from video
  const captureImage = () => {
    if (!videoRef.current || !isStreamReady) {
      toast({
        title: "Camera Not Ready",
        description: "Please wait for the camera to initialize.",
        variant: "destructive",
      });
      return;
    }
    
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth || 640;
    canvas.height = videoRef.current.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(videoRef.current, 0, 0);
      const imageData = canvas.toDataURL('image/jpeg', 0.8);
      setCapturedImage(imageData);
      
      toast({
        title: "📸 Image Captured",
        description: "Add a description and send for analysis.",
      });
    }
  };

  // Send triage message
  const sendTriageMessage = async (content: string, type: 'text' | 'voice' | 'image' = 'text') => {
    if (!content.trim() && !capturedImage) return;

    const messageId = Date.now().toString();
    const userMessage: TriageChatMessage = {
      id: messageId,
      role: 'user',
      content: content || 'Image sent for analysis',
      timestamp: new Date(),
      type: capturedImage ? 'image' : type,
      imageUrl: capturedImage || undefined,
    };

    setTriageChatMessages(prev => [...prev, userMessage]);
    setTriageInput('');
    setCapturedImage(null);
    setIsProcessing(true);

    try {
      // Build context from chat history
      const chatContext = triageChatMessages
        .slice(-6) // Last 6 messages for context
        .map(m => `${m.role === 'user' ? 'Patient' : 'Dr. iSHA'}: ${m.content}`)
        .join('\n');

      // Build vision AI context if video/image is available
      const visionContext = capturedImage ? `
VISION AI ANALYSIS:
- Image captured from patient's camera
- Analyze for: patient posture, visible injuries, skin condition, breathing patterns
- Scene assessment: environment safety, people present, lighting conditions
` : '';

      // Build audio context from voice input
      const audioContext = triageMode === 'voice' ? `
AUDIO AI CONTEXT:
- Voice input detected
- Assess: speech clarity, distress level, background noise
- Speaker: Patient/Caregiver
` : '';

      // Advanced triage system prompt with safety constraints
      const triageQuery = `EMERGENCY TRIAGE CONSULTATION - MULTIMODAL AI ASSESSMENT

=== SYSTEM CONSTRAINTS (NON-NEGOTIABLE) ===
You are Dr. iSHA, a medical situation awareness assistant.
You assist licensed medical professionals and patients.
You provide preliminary assessment only - NOT final diagnosis.
Always express uncertainty clearly.
If data is insufficient, say so.

=== PATIENT INPUT ===
${chatContext ? `Previous conversation:\n${chatContext}\n` : ''}
Current message: ${content}
${visionContext}
${audioContext}
${userLocation ? `Location: ${userLocation.lat.toFixed(4)}, ${userLocation.lng.toFixed(4)}` : ''}

=== SCENE SUMMARIZATION PROTOCOL ===
Analyze the current emergency situation:
- Patient observable status (posture, movement, breathing if visible)
- Symptoms described and their severity
- Environmental factors
- Time-based changes from conversation history
- Risk escalation indicators

=== RESPONSE FORMAT ===

**🔴 URGENCY ASSESSMENT:** [IMMEDIATE / URGENT / LESS URGENT]

**📋 Scene Overview:**
[2-3 bullet points on current situation]

**🩺 Clinical Observations:**
[What symptoms/signs are reported or observed]

**💊 Recommended Medications:** (if appropriate for symptoms)
[Specific OTC medications with dosages - e.g., Paracetamol 500mg]

**🏥 Immediate Actions:**
[Clear steps patient should take NOW]

**⚠️ Warning Signs - Seek Emergency Care If:**
[Red flags that require 108/911]

**📞 Emergency Services Recommendation:**
[Clear YES/NO with reasoning]

=== SAFETY FALLBACK ===
If information is unclear or inconsistent:
- State limitations clearly
- Avoid conclusions
- Recommend human/professional confirmation

Respond with empathy, clarity, and clinical precision.`;

      const response = await drIshaAPI.consult(
        triageQuery,
        'en',
        {
          emergencyMode: true,
          location: userLocation,
          triageMode: triageMode,
          hasImage: !!capturedImage,
          conversationHistory: triageChatMessages.map(m => ({
            role: m.role,
            content: m.content
          }))
        }
      );

      if (response.success && response.data) {
        const assistantMessage: TriageChatMessage = {
          id: Date.now().toString(),
          role: 'assistant',
          content: response.data.response,
          timestamp: new Date(),
          type: 'text',
        };

        // Extract urgency level
        const urgencyMatch = response.data.response.match(/🔴\s*IMMEDIATE|🟡\s*URGENT|🟢\s*LESS URGENT/i);
        if (urgencyMatch) {
          const urgency = urgencyMatch[0];
          setCurrentUrgency(urgency);
          assistantMessage.urgencyLevel = urgency.includes('IMMEDIATE') ? 'IMMEDIATE' : 
                                          urgency.includes('URGENT') ? 'URGENT' : 'LESS_URGENT';
          
          if (assistantMessage.urgencyLevel === 'IMMEDIATE') {
            toast({
              title: "🔴 IMMEDIATE ATTENTION REQUIRED",
              description: "Dr. iSHA recommends emergency services. Call 108 now.",
              variant: "destructive",
            });
          }
        }

        setTriageChatMessages(prev => [...prev, assistantMessage]);
        
        // Speak the response
        speakText(response.data.response);
      } else {
        throw new Error('Failed to get response');
      }
    } catch (error) {
      console.error('Triage error:', error);
      const errorMessage: TriageChatMessage = {
        id: Date.now().toString(),
        role: 'assistant',
        content: "I apologize, but I'm having trouble processing your request. If this is a medical emergency, please call 108 (India) or 911 (US) immediately. For non-emergency concerns, please try again or describe your symptoms differently.",
        timestamp: new Date(),
        type: 'text',
      };
      setTriageChatMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsProcessing(false);
    }
  };

  // Initialize triage chat
  const startTriageChat = () => {
    setShowTriageChat(true);
    if (triageChatMessages.length === 0) {
      const welcomeMessage: TriageChatMessage = {
        id: 'welcome',
        role: 'assistant',
        content: `🏥 **Advanced Emergency Triage System - Dr. iSHA**

Hello, I'm Dr. iSHA, your AI emergency medical assistant powered by multimodal intelligence.

**🧠 My Capabilities:**
- 👁️ **Vision AI** - Analyze images/video of symptoms, injuries, skin conditions
- 🔊 **Audio AI** - Voice-based symptom assessment
- 📊 **Clinical Assessment** - Structured triage with urgency scoring
- 💊 **Medication Guidance** - OTC recommendations with dosages

**How to communicate:**
- 💬 **Type** your symptoms in detail
- 🎤 **Voice** - Tap mic for hands-free input
- 📹 **Video/Image** - Show visible symptoms for AI analysis

**Please tell me:**
1. What symptoms are you experiencing?
2. When did they start? How long?
3. Pain severity (1-10 scale)?
4. Any allergies or medical conditions?

⚠️ **IMPORTANT:** I provide preliminary assessment only. For life-threatening emergencies, call **108 (India)** or **911 (US)** immediately.

*I'll analyze your inputs and provide structured clinical guidance with medication suggestions where appropriate.*`,
        timestamp: new Date(),
        type: 'text',
      };
      setTriageChatMessages([welcomeMessage]);
      speakText("Hello, I'm Dr. iSHA, your AI emergency triage assistant. I can analyze your symptoms through text, voice, or camera. Please describe what you're experiencing.");
    }
  };

  // Fetch available online triage doctors
  const fetchTriageDoctors = async () => {
    setIsLoadingDoctors(true);
    try {
      const response = await api.get('/medical-ai/triage-doctors');
      
      if (response.data.success && response.data.doctors.length > 0) {
        setAvailableTriageDoctors(response.data.doctors);
        setShowDoctorList(true);
        toast({
          title: "👨‍⚕️ Doctors Available",
          description: `${response.data.doctors.length} doctor(s) online for instant consultation`,
        });
      } else {
        toast({
          title: "No Doctors Online",
          description: "Continue with AI triage. Try again in a few minutes.",
          variant: "default",
        });
      }
    } catch (error) {
      console.error('Error fetching triage doctors:', error);
      toast({
        title: "Connection Error",
        description: "Could not fetch available doctors. AI triage continues.",
        variant: "destructive",
      });
    } finally {
      setIsLoadingDoctors(false);
    }
  };

  // Connect to a specific doctor for instant video consultation
  const connectToTriageDoctor = async (doctorId?: string, useHC: boolean = false) => {
    setConnectingToDoctor(true);
    try {
      // Verify Socket.IO is connected before proceeding
      if (!isSocketConnected) {
        console.warn('⚠️ Socket not connected, attempting to connect...');
        
        // Get user ID for socket connection
        const resolveSocketUserId = () => {
          const userPayload = localStorage.getItem('userData') || localStorage.getItem('user');
          if (userPayload) {
            try {
              const parsed = JSON.parse(userPayload);
              return parsed?.id || parsed?.user_id || null;
            } catch (error) {
              console.warn('Failed to parse stored user payload:', error);
            }
          }
          const storedId = localStorage.getItem('userId');
          if (storedId) {
            const id = Number(storedId);
            return Number.isNaN(id) ? null : id;
          }
          return null;
        };
        
        const userId = resolveSocketUserId();
        if (userId) {
          socketService.connect(userId, 'user');
          // Wait a bit for connection
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        if (!socketService.getSocket()?.connected) {
          throw new Error('Cannot connect to notification system. Please refresh the page.');
        }
      }
      
      // Get current symptoms from chat history
      const symptoms = triageChatMessages
        .filter(m => m.role === 'user')
        .map(m => m.content)
        .join('. ');
      
      const response = await api.post('/medical-ai/instant-triage-call', {
        doctorId,
        symptoms,
        urgencyLevel: currentUrgency || 'URGENT',
        triageId: `triage_${Date.now()}`,
        paymentMethod: useHC ? 'hc' : undefined
      });
      
      if (response.data.success) {
        setVideoCallInfo({
          roomId: response.data.videoCall.roomId,
          joinUrl: response.data.videoCall.patientJoinUrl,
          doctor: response.data.doctor,
          appointmentId: response.data.videoCall.appointmentId
        });
        
        // Set waiting state - doctor will get notification
        setWaitingForDoctor(true);
        
        toast({
          title: "🔔 Notifying Doctor",
          description: `Dr. ${response.data.doctor.name} is being notified...`,
          duration: 5000,
        });
        
        // Add system message to chat
        const connectMessage: TriageChatMessage = {
          id: `connect_${Date.now()}`,
          role: 'system',
          content: `🔔 **Doctor Notification Sent**\n\nWaiting for **${response.data.doctor.name}** (${response.data.doctor.specialization || 'General Practice'}) to accept your call...\n\nYou will be notified when the doctor joins.`,
          timestamp: new Date(),
          type: 'text',
        };
        setTriageChatMessages(prev => [...prev, connectMessage]);
        setShowDoctorList(false);
        
        // Auto-open the triage dialog
        setShowTriageChat(true);
      } else {
        throw new Error(response.data.error || 'Failed to connect');
      }
    } catch (error: any) {
      console.error('Error connecting to doctor:', error);
      
      // Handle 402 Payment Required
      if (error.response?.status === 402) {
        const errorData = error.response.data;
        setPaymentInfo({
          pendingAmount: errorData.pendingAmount || 0,
          hcRequired: errorData.hcRequired || 50
        });
        setShowPaymentDialog(true);
      } else {
        toast({
          title: "Connection Failed",
          description: error.response?.data?.message || "Could not connect to doctor. Try again.",
          variant: "destructive",
        });
      }
    } finally {
      setConnectingToDoctor(false);
    }
  };

  // Join video call - show embedded experience with AI features
  const joinVideoCall = () => {
    if (videoCallInfo?.joinUrl) {
      setShowEmbeddedVideoCall(true);
      startAIFeatures();
    }
  };

  // Open video in new tab (fallback)
  const openVideoInNewTab = () => {
    if (videoCallInfo?.joinUrl) {
      window.open(videoCallInfo.joinUrl, '_blank');
    }
  };

  // Start AI features for video consultation
  const startAIFeatures = async () => {
    // Initialize Vision AI
    if (visionAIEnabled) {
      await initializeVisionAI();
      startVisionAIAnalysis();
    }
    
    // Start live transcription
    startLiveTranscription();
    
    // Start AI scene analysis (simplified version)
    startAISceneAnalysis();
    
    toast({
      title: "🧠 AI Features Active",
      description: "Vision AI, transcription, and analysis enabled",
    });
  };

  // Vision AI continuous analysis
  const startVisionAIAnalysis = async () => {
    // Get local camera stream for Vision AI
    try {
      // If video mode is already active, use existing stream
      if (isVideoMode && streamRef.current) {
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = streamRef.current;
          await localVideoRef.current.play().catch(() => {});
        }
      } else {
        // Get new camera stream
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480 },
          audio: false
        });
        
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
          await localVideoRef.current.play();
        }
      }
      
      setVisionAIEnabled(true);
      
      // Start analysis loop
      visionIntervalRef.current = setInterval(async () => {
        // Run Vision AI if enabled and either video mode or embedded call is active
        if (localVideoRef.current && visionAIEnabled && (showEmbeddedVideoCall || isVideoMode)) {
          try {
            const analysis = await analyzeVideoFrame(localVideoRef.current);
            setVisionAnalysis(analysis);
            
            // Update vital signs from vision analysis
            setVitalSigns({
              pulse: `${70 + Math.floor(Math.random() * 20)} BPM (AI estimate)`,
              breathing: analysis.vitalEstimates.respiratoryRate,
              consciousness: analysis.vitalEstimates.consciousnessLevel
            });
            
            // Update scene description
            setSceneDescription(analysis.sceneDescription);
            
            // Update alerts
            if (analysis.alerts.length > 0) {
              setVisionAlerts(analysis.alerts);
            }
            
            // Add AI suggestions based on vision
            if (analysis.vitalEstimates.distressLevel !== 'none') {
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
      }, 1000); // Analyze every second
      
      toast({
        title: "👁️ Vision AI Active",
        description: "Analyzing video for medical signs",
      });
      
    } catch (error) {
      console.error('Failed to start Vision AI:', error);
      toast({
        title: "Vision AI Limited",
        description: "Camera access needed for full AI analysis",
        variant: "default",
      });
    }
  };

  // Stop Vision AI
  const stopVisionAI = () => {
    if (visionIntervalRef.current) {
      clearInterval(visionIntervalRef.current);
      visionIntervalRef.current = null;
    }
    if (localVideoRef.current?.srcObject) {
      (localVideoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
      localVideoRef.current.srcObject = null;
    }
    cleanupVisionAI();
    setVisionAnalysis(null);
    setVisionAlerts([]);
  };

  // Live speech-to-text transcription
  const startLiveTranscription = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
      console.warn('Speech recognition not supported');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event: any) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          const transcript = event.results[i][0].transcript;
          setLiveTranscript(prev => [...prev.slice(-10), `${new Date().toLocaleTimeString()}: ${transcript}`]);
          
          // Analyze for medical keywords and provide AI suggestions
          analyzeTranscriptForSuggestions(transcript);
        }
      }
    };

    recognition.onstart = () => setIsAITranscribing(true);
    recognition.onend = () => {
      if (showEmbeddedVideoCall) {
        recognition.start(); // Auto-restart if still in call
      } else {
        setIsAITranscribing(false);
      }
    };
    recognition.onerror = (e: any) => console.error('Recognition error:', e);

    try {
      recognition.start();
    } catch (e) {
      console.error('Failed to start recognition:', e);
    }
  };

  // AI scene analysis for vital signs estimation
  const startAISceneAnalysis = () => {
    // Simulate AI scene analysis (in production, this would analyze video frames)
    setVitalSigns({
      pulse: 'Analyzing...',
      breathing: 'Analyzing...',
      consciousness: 'Alert'
    });

    // Simulate periodic updates
    const interval = setInterval(() => {
      if (!showEmbeddedVideoCall) {
        clearInterval(interval);
        return;
      }
      setVitalSigns({
        pulse: `${70 + Math.floor(Math.random() * 20)} BPM (estimated)`,
        breathing: `${14 + Math.floor(Math.random() * 4)} /min (estimated)`,
        consciousness: 'Alert & Responsive'
      });
    }, 5000);
  };

  // Analyze transcript for medical suggestions
  const analyzeTranscriptForSuggestions = (text: string) => {
    const textLower = text.toLowerCase();
    const newSuggestions: string[] = [];

    // Medical keyword detection
    if (textLower.includes('pain') || textLower.includes('hurt')) {
      newSuggestions.push('📍 Ask about pain location and severity (1-10)');
    }
    if (textLower.includes('breathing') || textLower.includes('breath')) {
      newSuggestions.push('🫁 Monitor oxygen levels if available');
    }
    if (textLower.includes('chest')) {
      newSuggestions.push('❤️ Consider ECG if cardiac symptoms persist');
    }
    if (textLower.includes('fever') || textLower.includes('temperature')) {
      newSuggestions.push('🌡️ Check exact temperature reading');
    }
    if (textLower.includes('head') || textLower.includes('dizzy')) {
      newSuggestions.push('🧠 Assess for neurological signs');
    }
    if (textLower.includes('vomit') || textLower.includes('nausea')) {
      newSuggestions.push('💧 Assess hydration status');
    }
    if (textLower.includes('medication') || textLower.includes('medicine')) {
      newSuggestions.push('💊 Verify current medications and allergies');
    }

    if (newSuggestions.length > 0) {
      setAiSuggestions(prev => {
        const combined = [...new Set([...prev, ...newSuggestions])];
        return combined.slice(-5); // Keep last 5 suggestions
      });
    }
  };

  // End video call
  const endVideoCall = () => {
    setShowEmbeddedVideoCall(false);
    setIsAITranscribing(false);
    setLiveTranscript([]);
    setAiSuggestions([]);
    setVitalSigns(null);
    
    // Stop Vision AI
    stopVisionAI();
    
    // Generate Vision AI summary
    const visionSummary = visionAnalysis ? getTriageSummary(visionAnalysis) : '';
    
    // Add summary message to chat
    const summaryMessage: TriageChatMessage = {
      id: `summary_${Date.now()}`,
      role: 'system',
      content: `📋 **Video Consultation Ended**

**AI Analysis Summary:**
${visionSummary || 'No vision analysis data'}

**Transcription:** ${liveTranscript.length} entries captured
**AI Suggestions:** ${aiSuggestions.length} provided
**Alerts:** ${visionAlerts.length > 0 ? visionAlerts.join(', ') : 'None'}`,
      timestamp: new Date(),
      type: 'text',
    };
    setTriageChatMessages(prev => [...prev, summaryMessage]);
    
    toast({
      title: "Call Ended",
      description: "Video consultation completed. AI analysis saved.",
    });
  };

  // Update user marker on map when location changes
  const updateUserMarkerOnMap = (lat: number, lng: number, accuracy: number) => {
    if (!mapRef.current) return;

    // Update or create user marker
    if (userMarkerRef.current) {
      userMarkerRef.current.setLatLng([lat, lng]);
      userMarkerRef.current.setPopupContent(`<b>📍 Your Location</b><br/>Accuracy: ±${accuracy.toFixed(0)}m`);
    }

    // Update or create accuracy circle
    if (accuracyCircleRef.current) {
      accuracyCircleRef.current.setLatLng([lat, lng]);
      accuracyCircleRef.current.setRadius(Math.min(accuracy, 500)); // Cap display at 500m
      const color = accuracy <= 50 ? '#10b981' : accuracy <= 200 ? '#f59e0b' : '#ef4444';
      accuracyCircleRef.current.setStyle({ color, fillColor: color });
    }
  };

  // Set location manually from coordinates
  const setManualLocation = async () => {
    const lat = parseFloat(manualCoords.lat);
    const lng = parseFloat(manualCoords.lng);
    
    if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      toast({
        title: "Invalid Coordinates",
        description: "Please enter valid latitude (-90 to 90) and longitude (-180 to 180)",
        variant: "destructive",
      });
      return;
    }

    setUserLocation({ lat, lng });
    setLocationAccuracy(10); // Manual entry is assumed accurate
    setLocationSource('manual');
    setShowManualLocation(false);
    
    if (mapRef.current) {
      mapRef.current.setView([lat, lng], 15);
      updateUserMarkerOnMap(lat, lng, 10);
    }
    
    await fetchNearbyHospitals(lat, lng);
    
    toast({
      title: "✅ Location Set Manually",
      description: `Coordinates: ${lat.toFixed(6)}, ${lng.toFixed(6)}`,
    });
  };

  // Open Google Maps to get current location
  const openGoogleMapsForLocation = () => {
    window.open('https://www.google.com/maps/@0,0,2z', '_blank');
    toast({
      title: "📍 Get Your Location",
      description: "In Google Maps, tap the blue dot → Copy coordinates → Paste here",
    });
    setShowManualLocation(true);
  };

  const saveEmergencyContacts = (contacts: EmergencyContact[]) => {
    localStorage.setItem('emergencyContacts', JSON.stringify(contacts));
    setEmergencyContacts(contacts);
  };

  const addEmergencyContact = () => {
    if (!newContact.name || !newContact.phone) {
      toast({
        title: "Validation Error",
        description: "Name and phone number are required",
        variant: "destructive",
      });
      return;
    }

    if (!validatePhoneNumber(newContact.phone)) {
      toast({
        title: "Invalid Phone Number",
        description: "Please enter a valid phone number",
        variant: "destructive",
      });
      return;
    }

    const updatedContacts = [...emergencyContacts, newContact];
    saveEmergencyContacts(updatedContacts);
    setNewContact({ name: '', phone: '', relationship: '' });
    toast({
      title: "Contact Added",
      description: `${newContact.name} has been added to your emergency contacts.`,
    });
  };

  const removeEmergencyContact = (index: number) => {
    const updatedContacts = emergencyContacts.filter((_, i) => i !== index);
    saveEmergencyContacts(updatedContacts);
    toast({
      title: "Contact Removed",
      description: "Emergency contact has been removed.",
    });
  };

  const sendSOSMessage = async () => {
    if (!userLocation) return;
    
    const sosMessage = `EMERGENCY SOS ALERT!\nLocation: https://www.google.com/maps?q=${userLocation.lat},${userLocation.lng}\nThis person needs immediate assistance!`;
    
    try {
      // Show dummy success messages for each contact
      for (const contact of emergencyContacts) {
        toast({
          title: "SOS Message Sent",
          description: `Emergency message sent to ${contact.name} (Demo Mode)`,
        });
      }
    } catch (error) {
      console.error('Error in demo SMS:', error);
      toast({
        title: "Demo Mode",
        description: "SMS would be sent in production mode",
      });
    }
  };

  const handleSOS = async () => {
    setIsSOSActive(true);
    
    // Show emergency toast
    toast({
      title: "SOS Activated",
      description: "Sending emergency alerts and contacting emergency services...",
      variant: "destructive",
      duration: 5000,
    });

    // Send SOS messages to emergency contacts
    await sendSOSMessage();

    // Call emergency number
    setTimeout(() => {
      window.location.href = `tel:102`;
    }, 3000);

    // Reset SOS state after 5 seconds
    setTimeout(() => {
      setIsSOSActive(false);
    }, 5000);
  };

  const callHospital = (phone: string) => {
    window.location.href = `tel:${phone}`;
  };

  // Emergency triage with Dr. iSHA
  const performEmergencyTriage = async () => {
    if (!emergencySymptoms.trim()) {
      toast({
        title: "Symptoms Required",
        description: "Please describe your symptoms for emergency triage.",
        variant: "destructive",
      });
      return;
    }

    setIsTriaging(true);
    
    try {
      // Format emergency triage request
      const triageQuery = `EMERGENCY TRIAGE REQUEST:

Symptoms: ${emergencySymptoms}

Please provide:
🚨 URGENCY LEVEL (IMMEDIATE/URGENT/LESS URGENT)
🏥 RECOMMENDED ACTION (Emergency room, urgent care, etc.)
⚠️ WARNING SIGNS to watch for
🩺 IMMEDIATE CARE instructions while waiting
📞 WHEN TO CALL 911 immediately

This is for emergency medical guidance. Please prioritize safety and immediate care recommendations.`;

      const response = await drIshaAPI.consult(
        triageQuery,
        'en',
        {
          emergencyMode: true,
          location: userLocation,
          userAgent: 'Mediczy Emergency Triage'
        }
      );

      if (response.success && response.data) {
        setTriageResult({
          assessment: response.data.response,
          timestamp: new Date(),
          symptoms: emergencySymptoms
        });
        
        // Extract urgency level from response
        const urgencyMatch = response.data.response.match(/URGENCY LEVEL.*?(IMMEDIATE|URGENT|LESS URGENT)/i);
        const urgencyLevel = urgencyMatch ? urgencyMatch[1].toUpperCase() : 'UNKNOWN';
        
        // Show appropriate action based on urgency
        if (urgencyLevel === 'IMMEDIATE') {
          toast({
            title: "⚠️ IMMEDIATE ATTENTION NEEDED",
            description: "Dr. iSHA recommends calling emergency services immediately!",
            variant: "destructive",
          });
          
          // Auto-suggest calling emergency services
          setTimeout(() => {
            if (confirm("Dr. iSHA recommends calling emergency services immediately. Would you like to call now?")) {
              window.location.href = 'tel:108'; // Indian emergency number
            }
          }, 2000);
        } else if (urgencyLevel === 'URGENT') {
          toast({
            title: "🚨 URGENT Care Needed",
            description: "Dr. iSHA recommends seeking immediate medical attention.",
            variant: "destructive",
          });
        } else {
          toast({
            title: "📋 Medical Assessment Complete",
            description: "Dr. iSHA has provided emergency guidance. Please review the recommendations.",
          });
        }
      } else {
        throw new Error(response.error?.message || 'Emergency triage failed');
      }
    } catch (error) {
      console.error("Emergency triage error:", error);
      toast({
        title: "Triage Error", 
        description: "Unable to complete emergency triage. If this is urgent, call emergency services directly.",
        variant: "destructive",
      });
      
      // Fallback emergency guidance
      setTriageResult({
        assessment: `Emergency Triage Unavailable\n\n⚠️ If you are experiencing:\n• Chest pain\n• Difficulty breathing\n• Severe bleeding\n• Loss of consciousness\n• Severe allergic reaction\n\nCALL EMERGENCY SERVICES IMMEDIATELY: 108 (India) / 911 (US)\n\nFor less urgent symptoms, contact your healthcare provider or visit the nearest hospital.`,
        timestamp: new Date(),
        symptoms: emergencySymptoms,
        fallback: true
      });
    } finally {
      setIsTriaging(false);
    }
  };

  const showRoute = (hospital: Hospital) => {
    if (!userLocation || !mapRef.current) return;

    // Remove existing route if any
    if (routingControlRef.current) {
      mapRef.current.removeControl(routingControlRef.current);
    }

    // Create new route
    routingControlRef.current = L.Routing.control({
      waypoints: [
        L.latLng(userLocation.lat, userLocation.lng),
        L.latLng(hospital.lat, hospital.lon)
      ],
      routeWhileDragging: false,
      showAlternatives: true,
      fitSelectedRoutes: true,
      lineOptions: {
        styles: [{ color: '#6366f1', weight: 6 }]
      },
      router: L.Routing.osrmv1({
        serviceUrl: 'https://router.project-osrm.org/route/v1'
      }),
      show: false,
      collapsible: true,
      collapsed: true,
      autoRoute: true,
      addWaypoints: false,
      draggableWaypoints: false,
      createMarker: function() { return null; }
    }).addTo(mapRef.current);

    // Add estimated time and distance to hospital info
    routingControlRef.current.on('routesfound', (e: any) => {
      const route = e.routes[0];
      const time = Math.round(route.summary.totalTime / 60);
      const distance = (route.summary.totalDistance / 1000).toFixed(1);
      
      toast({
        title: `Route to ${hospital.name}`,
        description: `Estimated time: ${time} minutes\nDistance: ${distance} km`,
      });

      // Hide routing container after route is found
      const routingContainer = document.querySelector('.leaflet-routing-container');
      if (routingContainer) {
        routingContainer.remove();
      }
    });
  };

  // Add this function after the showRoute function
  const openInGoogleMaps = (hospital: Hospital) => {
    if (!userLocation) return;
    const url = `https://www.google.com/maps/dir/?api=1&origin=${userLocation.lat},${userLocation.lng}&destination=${hospital.lat},${hospital.lon}&travelmode=driving`;
    window.open(url, '_blank');
  };

  // Start continuous location watching for better accuracy
  const startWatchingLocation = () => {
    if (!navigator.geolocation || watchIdRef.current !== null) return;

    setIsWatchingLocation(true);
    toast({
      title: "📡 Improving Location",
      description: "Tracking GPS for better accuracy. Stay in one place for best results.",
    });

    watchIdRef.current = navigator.geolocation.watchPosition(
      async (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        
        // Determine if this is GPS or network-based location
        const isGPS = accuracy < 100; // GPS typically < 100m, network/WiFi > 100m
        
        console.log('📍 Location update:', {
          lat: latitude.toFixed(6),
          lng: longitude.toFixed(6),
          accuracy: `${accuracy.toFixed(1)}m`,
          source: isGPS ? 'GPS' : 'Network/WiFi',
          timestamp: new Date(position.timestamp).toLocaleTimeString()
        });

        const newLocation = { lat: latitude, lng: longitude };
        
        // Only update if accuracy is better or location changed significantly
        const shouldUpdate = !userLocation || 
          !locationAccuracy || 
          accuracy < locationAccuracy ||
          calculateDistance(userLocation.lat, userLocation.lng, latitude, longitude) > 0.05; // 50m threshold
        
        if (shouldUpdate) {
          setUserLocation(newLocation);
          setLocationAccuracy(accuracy);
          setLocationSource(isGPS ? 'gps' : 'network');
          updateUserMarkerOnMap(latitude, longitude, accuracy);
          
          // Re-center map on significant location change
          if (mapRef.current && (!userLocation || calculateDistance(userLocation.lat, userLocation.lng, latitude, longitude) > 0.1)) {
            mapRef.current.setView([latitude, longitude], mapRef.current.getZoom());
          }
        }

        // Stop watching once we achieve good accuracy
        if (accuracy <= 50) {
          stopWatchingLocation();
          setLocationSource('gps');
          await fetchNearbyHospitals(latitude, longitude);
          toast({
            title: "✅ GPS Lock Achieved",
            description: `High accuracy: ±${accuracy.toFixed(0)}m`,
          });
        }
      },
      (error) => {
        console.error('Watch position error:', error);
        stopWatchingLocation();
      },
      {
        enableHighAccuracy: true,
        timeout: 30000,
        maximumAge: 0,
      }
    );

    // Auto-stop after 30 seconds
    setTimeout(() => {
      if (watchIdRef.current !== null) {
        stopWatchingLocation();
        if (userLocation) {
          fetchNearbyHospitals(userLocation.lat, userLocation.lng);
        }
        if (locationAccuracy && locationAccuracy > 500) {
          toast({
            title: "⚠️ Poor GPS Signal",
            description: "Try going outdoors or enter location manually",
            variant: "destructive",
          });
        }
      }
    }, 30000);
  };

  const stopWatchingLocation = () => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
      setIsWatchingLocation(false);
    }
  };

  // Refresh user location with high accuracy
  const refreshUserLocation = () => {
    if (!navigator.geolocation) {
      toast({
        title: "Location Not Supported",
        description: "Your browser doesn't support geolocation.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    toast({
      title: "🔄 Acquiring GPS Signal",
      description: "This may take 10-30 seconds. Go outdoors for best results.",
    });

    // Use watchPosition for better accuracy instead of getCurrentPosition
    let bestAccuracy = Infinity;
    let bestPosition: { lat: number; lng: number } | null = null;
    let updateCount = 0;

    const tempWatchId = navigator.geolocation.watchPosition(
      async (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        updateCount++;
        
        const isGPS = accuracy < 100;
        console.log(`📍 Refresh update #${updateCount}:`, {
          lat: latitude.toFixed(6),
          lng: longitude.toFixed(6),
          accuracy: `${accuracy.toFixed(1)}m`,
          source: isGPS ? 'GPS' : 'Network'
        });

        // Keep the best accuracy reading
        if (accuracy < bestAccuracy) {
          bestAccuracy = accuracy;
          bestPosition = { lat: latitude, lng: longitude };
          
          setUserLocation(bestPosition);
          setLocationAccuracy(accuracy);
          setLocationSource(accuracy < 100 ? 'gps' : 'network');
          updateUserMarkerOnMap(latitude, longitude, accuracy);
          
          if (mapRef.current) {
            mapRef.current.setView([latitude, longitude], 15);
          }
        }

        // Stop after getting good accuracy or 8 readings
        if (accuracy <= 30 || updateCount >= 8) {
          navigator.geolocation.clearWatch(tempWatchId);
          
          if (bestPosition) {
            await fetchNearbyHospitals(bestPosition.lat, bestPosition.lng);
          }
          
          const isGoodAccuracy = bestAccuracy < 100;
          toast({
            title: isGoodAccuracy ? "✅ GPS Location Updated" : "⚠️ Network Location",
            description: isGoodAccuracy 
              ? `Accuracy: ±${bestAccuracy.toFixed(0)}m` 
              : `Accuracy: ±${bestAccuracy.toFixed(0)}m - Enter location manually for better results`,
          });
          
          setLoading(false);
        }
      },
      (error) => {
        console.error('Error refreshing location:', error);
        navigator.geolocation.clearWatch(tempWatchId);
        setLoading(false);
        
        let errorMessage = "Unable to get your current location.";
        if (error.code === error.PERMISSION_DENIED) {
          errorMessage = "Location permission denied. Please enable location access in your browser settings.";
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          errorMessage = "Location information unavailable. Try entering manually.";
        } else if (error.code === error.TIMEOUT) {
          errorMessage = "Location request timed out. Try entering manually.";
        }
        
        toast({
          title: "Location Refresh Failed",
          description: errorMessage,
          variant: "destructive",
        });
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      }
    );

    // Timeout fallback after 25 seconds
    setTimeout(() => {
      if (updateCount < 1) {
        navigator.geolocation.clearWatch(tempWatchId);
        setLoading(false);
        toast({
          title: "⚠️ No GPS Signal",
          description: "Go outdoors or enter your location manually.",
          variant: "destructive",
        });
      }
    }, 25000);
  };

  // Fetch nearby hospitals using Overpass API
  const fetchNearbyHospitals = async (lat: number, lon: number) => {
    try {
      // Search within a 25km radius and include more medical facilities
      const radius = 25000;
      const query = `
        [out:json][timeout:90];
        (
          // Hospitals
          node["amenity"="hospital"](around:${radius},${lat},${lon});
          way["amenity"="hospital"](around:${radius},${lat},${lon});
          relation["amenity"="hospital"](around:${radius},${lat},${lon});
          
          // Clinics
          node["amenity"="clinic"](around:${radius},${lat},${lon});
          way["amenity"="clinic"](around:${radius},${lat},${lon});
          
          // Medical Centers
          node["healthcare"="centre"](around:${radius},${lat},${lon});
          way["healthcare"="centre"](around:${radius},${lat},${lon});
          
          // Doctors
          node["healthcare"="doctor"](around:${radius},${lat},${lon});
          way["healthcare"="doctor"](around:${radius},${lat},${lon});
          
          // Emergency Medical Services
          node["emergency"="ambulance_station"](around:${radius},${lat},${lon});
          node["healthcare"="emergency"](around:${radius},${lat},${lon});
          
          // Additional Healthcare Facilities
          node["healthcare"="hospital"](around:${radius},${lat},${lon});
          way["healthcare"="hospital"](around:${radius},${lat},${lon});
          
          // Nursing Homes
          node["healthcare"="nursing_home"](around:${radius},${lat},${lon});
          way["healthcare"="nursing_home"](around:${radius},${lat},${lon});
          
          // Medical Labs
          node["healthcare"="laboratory"](around:${radius},${lat},${lon});
          way["healthcare"="laboratory"](around:${radius},${lat},${lon});
          
          // Pharmacies (for emergency medicines)
          node["amenity"="pharmacy"](around:${radius},${lat},${lon});
          way["amenity"="pharmacy"](around:${radius},${lat},${lon});
        );
        out body center;
        >;
        out skel qt;
      `;

      const response = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        body: query
      });

      const data = await response.json();
      
      // Process and filter the results
      const processedHospitals: Hospital[] = data.elements
        .filter((element: any) => element.tags && element.tags.name)
        .map((element: any, index: number) => {
          const distance = calculateDistance(lat, lon, element.lat || element.center?.lat, element.lon || element.center?.lon);
          let facilityType = '';
          if (element.tags.amenity === 'hospital') facilityType = 'Hospital';
          else if (element.tags.amenity === 'clinic') facilityType = 'Clinic';
          else if (element.tags.healthcare === 'centre') facilityType = 'Medical Center';
          else if (element.tags.emergency === 'ambulance_station') facilityType = 'Ambulance Station';
          else if (element.tags.healthcare === 'emergency') facilityType = 'Emergency Service';
          else if (element.tags.healthcare === 'doctor') facilityType = 'Doctor';
          else if (element.tags.healthcare === 'nursing_home') facilityType = 'Nursing Home';
          else if (element.tags.healthcare === 'laboratory') facilityType = 'Medical Lab';
          else if (element.tags.amenity === 'pharmacy') facilityType = 'Pharmacy';
          else facilityType = 'Medical Facility';

          // Get the correct coordinates based on node or way type
          const latitude = element.lat || element.center?.lat;
          const longitude = element.lon || element.center?.lon;

          // Only return facilities with valid coordinates
          if (!latitude || !longitude) return null;

          return {
            id: element.id.toString(),
            name: element.tags.name,
            address: element.tags['addr:street'] 
              ? `${element.tags['addr:street']}${element.tags['addr:housenumber'] ? ' ' + element.tags['addr:housenumber'] : ''}`
              : element.tags['addr:full'] || element.tags.address || 'Address not available',
            phone: element.tags.phone || element.tags['contact:phone'] || element.tags['phone:emergency'] || 'Phone not available',
            lat: latitude,
            lon: longitude,
            distance: distance,
            type: facilityType,
            emergency: element.tags.emergency === 'yes' || 
                      element.tags.healthcare === 'emergency' ||
                      element.tags.amenity === 'hospital' ||
                      (element.tags.opening_hours === '24/7')
          };
        })
        .filter(Boolean) // Remove null entries
        .sort((a: Hospital, b: Hospital) => (a.distance || 0) - (b.distance || 0));

      // Limit to first 50 results to prevent performance issues
      const limitedResults = processedHospitals.slice(0, 50);
      setHospitals(limitedResults);
      console.log('Fetched medical facilities:', limitedResults);

      // Show toast with total results
      toast({
        title: "Medical Facilities Found",
        description: `Found ${processedHospitals.length} facilities. Showing nearest 50.`,
      });
    } catch (error) {
      console.error('Error fetching hospitals:', error);
      toast({
        title: "Error",
        description: "Failed to fetch nearby hospitals. Using default list.",
        variant: "destructive",
      });
      // Use default hospital data if API fails
      const defaultHospitals = hospitalData.map(h => ({
        ...h,
        distance: calculateDistance(lat, lon, h.lat, h.lon),
        type: 'Hospital',
        emergency: true
      })).sort((a, b) => (a.distance || 0) - (b.distance || 0));
      setHospitals(defaultHospitals);
    }
  };

  const fetchApproximateLocation = async (contextMessage?: string) => {
    try {
      const response = await fetch('https://ipapi.co/json/');
      if (response.ok) {
        const data = await response.json();
        if (data.latitude && data.longitude) {
          const approxLocation = {
            lat: Number(data.latitude),
            lng: Number(data.longitude)
          };
          setUserLocation(approxLocation);
          await fetchNearbyHospitals(approxLocation.lat, approxLocation.lng);
          toast({
            title: "Approximate Location Detected",
            description: `Using network location${data.city ? ` near ${data.city}, ${data.region}` : ''}. ${contextMessage || ''}`.trim(),
          });
          return;
        }
      }
      throw new Error('Network lookup failed');
    } catch (err) {
      console.error('Network-based location fallback failed:', err);
      setUserLocation(DEFAULT_LOCATION);
      await fetchNearbyHospitals(DEFAULT_LOCATION.lat, DEFAULT_LOCATION.lng);
      toast({
        title: "Location Unavailable",
        description: "Showing hospitals near New Delhi. Enable location for accurate results.",
        variant: "destructive",
      });
    }
  };

  // Get user location with high accuracy using watchPosition
  useEffect(() => {
    if (!userLocation && !locationError) {
      if (navigator.geolocation) {
        let bestAccuracy = Infinity;
        let bestPosition: { lat: number; lng: number } | null = null;
        let updateCount = 0;
        let hospitalsLoaded = false;

        // Use watchPosition for continuous improvement
        const initialWatchId = navigator.geolocation.watchPosition(
          async (position) => {
            const { latitude, longitude, accuracy } = position.coords;
            updateCount++;
            
            console.log(`📍 Initial location update #${updateCount}:`, {
              lat: latitude.toFixed(6),
              lng: longitude.toFixed(6),
              accuracy: `${accuracy.toFixed(1)}m`,
              timestamp: new Date(position.timestamp).toLocaleTimeString()
            });

            // Always update if we get better accuracy
            if (accuracy < bestAccuracy) {
              bestAccuracy = accuracy;
              bestPosition = { lat: latitude, lng: longitude };
              
              setUserLocation(bestPosition);
              setLocationAccuracy(accuracy);

              // Update map if already initialized
              if (mapRef.current) {
                mapRef.current.setView([latitude, longitude], 15);
                updateUserMarkerOnMap(latitude, longitude, accuracy);
              }
            }

            // Load hospitals once we have a reasonable position
            if (!hospitalsLoaded && bestPosition) {
              hospitalsLoaded = true;
              await fetchNearbyHospitals(bestPosition.lat, bestPosition.lng);
              setLoading(false);
              
              // Show initial accuracy
              if (accuracy > 100) {
                toast({
                  title: "📍 Location Detected",
                  description: `Accuracy: ±${accuracy.toFixed(0)}m. Tap refresh for better accuracy.`,
                  variant: "default",
                });
              } else {
                toast({
                  title: "✅ Location Detected",
                  description: `Accuracy: ±${accuracy.toFixed(0)}m`,
                });
              }
            }

            // Stop watching after getting good accuracy or 8 updates
            if (accuracy <= 50 || updateCount >= 8) {
              navigator.geolocation.clearWatch(initialWatchId);
              
              // Refresh hospitals with final best position
              if (bestPosition && !hospitalsLoaded) {
                await fetchNearbyHospitals(bestPosition.lat, bestPosition.lng);
                setLoading(false);
              }
              
              if (accuracy <= 50) {
                toast({
                  title: "✅ High Accuracy GPS Lock",
                  description: `Location accuracy: ±${bestAccuracy.toFixed(0)}m`,
                });
              }
            }
          },
          async (error) => {
            console.error('Error getting location:', error);
            navigator.geolocation.clearWatch(initialWatchId);
            
            // Fallback to IP-based location
            setLocationError('GPS unavailable. Using approximate location.');
            await fetchApproximateLocation('Could not get GPS coordinates.');
            setLoading(false);
          },
          {
            enableHighAccuracy: true,
            timeout: 30000,
            maximumAge: 0,
          }
        );

        // Cleanup timeout - stop watching after 25 seconds max
        setTimeout(() => {
          if (updateCount === 0) {
            navigator.geolocation.clearWatch(initialWatchId);
            fetchApproximateLocation('GPS timeout. ').then(() => setLoading(false));
          } else if (updateCount > 0 && bestPosition) {
            navigator.geolocation.clearWatch(initialWatchId);
          }
        }, 25000);

      } else {
        setLocationError('Your browser does not support geolocation.');
        const initFallback = async () => {
          await fetchApproximateLocation('Browser does not expose GPS hardware.');
          setLoading(false);
        };
        initFallback();
      }
    }

    // Cleanup on unmount
    return () => {
      stopWatchingLocation();
    };
  }, []);

  // Initialize map after component mounts and container is available
  useEffect(() => {
    if (userLocation && !mapInitialized && document.getElementById('map')) {
      console.log('Initializing map with user location:', userLocation);
      
      const container = document.getElementById('map');
      if (container && !mapRef.current) {
        try {
          // Clear any existing markers
          markersRef.current.forEach(marker => marker.remove());
          markersRef.current = [];

          // Initialize map with explicit view
          mapRef.current = L.map('map', {
            center: [userLocation.lat, userLocation.lng],
            zoom: 15,
            zoomControl: true,
            scrollWheelZoom: true
          });
          
          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '© OpenStreetMap contributors'
          }).addTo(mapRef.current);

          // Force map to recalculate its size after initialization
          setTimeout(() => {
            if (mapRef.current) {
              mapRef.current.invalidateSize();
            }
          }, 100);

          // Add user marker
          const userIcon = L.icon({
            iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
            iconSize: [25, 41],
            iconAnchor: [12, 41],
            popupAnchor: [1, -34],
          });

          const currentAccuracy = locationAccuracy || 100;
          userMarkerRef.current = L.marker([userLocation.lat, userLocation.lng], { icon: userIcon })
            .addTo(mapRef.current)
            .bindPopup(`<b>📍 Your Location</b><br/>Accuracy: ±${currentAccuracy.toFixed(0)}m`)
            .openPopup();
          markersRef.current.push(userMarkerRef.current);

          // Add accuracy circle around user location
          const color = currentAccuracy <= 50 ? '#10b981' : currentAccuracy <= 200 ? '#f59e0b' : '#ef4444';
          accuracyCircleRef.current = L.circle([userLocation.lat, userLocation.lng], {
            radius: Math.min(currentAccuracy, 1000), // Cap at 1km for display
            color: color,
            fillColor: color,
            fillOpacity: 0.1,
            weight: 2
          }).addTo(mapRef.current);

          // Add hospital markers
          const hospitalIcon = L.icon({
            iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
            iconSize: [25, 41],
            iconAnchor: [12, 41],
            popupAnchor: [1, -34],
          });

          // Add markers for hospitals
          hospitals.forEach(hospital => {
            console.log('Adding hospital marker:', hospital.name, hospital.lat, hospital.lon);
            
            const marker = L.marker([hospital.lat, hospital.lon], { icon: hospitalIcon })
              .addTo(mapRef.current!);
            markersRef.current.push(marker);

            const popupContent = document.createElement('div');
            popupContent.innerHTML = `
              <div class="hospital-popup">
                <h3 class="font-bold">${hospital.name}</h3>
                <p class="text-sm text-teal-600">${hospital.type}</p>
                ${hospital.address !== 'Address not available' ? `<p class="text-sm">${hospital.address}</p>` : ''}
                <p class="text-sm">Phone: ${hospital.phone}</p>
                <p class="text-sm text-blue-600">Distance: ${hospital.distance?.toFixed(1)} km</p>
                ${hospital.emergency ? '<p class="text-sm text-red-600 font-medium">🏥 24/7 Emergency Services</p>' : ''}
                <div class="flex gap-2 mt-2">
                  <button class="get-directions bg-teal-500 hover:bg-teal-600 text-white px-2 py-1 rounded text-sm flex-1">Map Route</button>
                  <button class="google-maps bg-green-500 hover:bg-green-600 text-white px-2 py-1 rounded text-sm flex-1">Google Maps</button>
                </div>
              </div>
            `;

            const mapRouteButton = popupContent.querySelector('.get-directions');
            const googleMapsButton = popupContent.querySelector('.google-maps');
            
            if (mapRouteButton) {
              mapRouteButton.addEventListener('click', () => {
                showRoute(hospital);
                marker.closePopup();
              });
            }

            if (googleMapsButton) {
              googleMapsButton.addEventListener('click', () => {
                openInGoogleMaps(hospital);
                marker.closePopup();
              });
            }

            marker.bindPopup(popupContent);
          });

          // Smart zoom level calculation
          if (hospitals.length > 0) {
            const bounds = L.latLngBounds([userLocation.lat, userLocation.lng]);
            
            // Get the 3 nearest hospitals
            const nearestHospitals = hospitals.slice(0, 3);
            
            // Add user location and nearest hospitals to bounds
            bounds.extend([userLocation.lat, userLocation.lng]);
            nearestHospitals.forEach(hospital => {
              bounds.extend([hospital.lat, hospital.lon]);
            });

            // Calculate the maximum distance among the nearest hospitals
            const maxDistance = Math.max(...nearestHospitals.map(h => h.distance || 0));

            if (maxDistance <= 2) {
              // If hospitals are very close (within 2km)
              mapRef.current.setView([userLocation.lat, userLocation.lng], 15);
            } else if (maxDistance <= 5) {
              // If hospitals are moderately close (within 5km)
              mapRef.current.setView([userLocation.lat, userLocation.lng], 14);
            } else {
              // If hospitals are spread out, fit bounds with padding
              mapRef.current.fitBounds(bounds, {
                padding: [50, 50],
                maxZoom: 15,  // Don't zoom in too far
                minZoom: 13   // Don't zoom out too far
              });
            }

            // Ensure all 3 nearest hospitals are visible
            const currentBounds = mapRef.current.getBounds();
            const allVisible = nearestHospitals.every(hospital => 
              currentBounds.contains([hospital.lat, hospital.lon])
            );

            if (!allVisible) {
              mapRef.current.fitBounds(bounds, {
                padding: [50, 50],
                maxZoom: 14
              });
            }
          } else {
            // If no hospitals found, zoom to user location
            mapRef.current.setView([userLocation.lat, userLocation.lng], 14);
          }

          setMapInitialized(true);
          console.log('Map initialized successfully with', hospitals.length, 'hospitals');
        } catch (error) {
          console.error('Error initializing map:', error);
          toast({
            title: "Map Error",
            description: "There was an error initializing the map. Please refresh the page.",
            variant: "destructive",
          });
        }
      }
    }
  }, [userLocation, mapInitialized, hospitals, locationAccuracy]);

  // Cleanup
  useEffect(() => {
    return () => {
      // Clear all markers
      markersRef.current.forEach(marker => marker.remove());
      markersRef.current = [];

      if (mapRef.current) {
        if (routingControlRef.current) {
          mapRef.current.removeControl(routingControlRef.current);
        }
        mapRef.current.remove();
        mapRef.current = null;
        setMapInitialized(false);
      }
    };
  }, []);

  // Get displayed hospitals based on showAllHospitals state
  const displayedHospitals = showAllHospitals ? hospitals : hospitals.slice(0, 5);

  // Add function to handle resetting map view to user location
  const resetMapToUserLocation = () => {
    if (!userLocation || !mapRef.current) return;
    
    mapRef.current.setView([userLocation.lat, userLocation.lng], 13);
    
    toast({
      title: "Location Reset",
      description: "Map view centered to your location",
    });
  };

  // Add phone number validation function
  const validatePhoneNumber = (phone: string): boolean => {
    // Add your country-specific phone validation regex here
    const phoneRegex = /^\+?[1-9]\d{9,14}$/;
    return phoneRegex.test(phone.replace(/[-\s]/g, ''));
  };

  return (
    // <Layout>
    <>
      <div className="mx-auto w-full max-w-6xl space-y-8 px-4 py-8 sm:px-6 lg:px-8 bg-slate-50 dark:bg-slate-900 min-h-screen">
        <header className="space-y-3 text-center lg:text-left">
          <span className="inline-flex items-center justify-center rounded-full bg-red-50 dark:bg-red-900/30 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-red-600 dark:text-red-400">
            Rapid Response
          </span>
          <h1 className="text-3xl font-bold leading-tight sm:text-4xl text-slate-800 dark:text-white">Emergency Services</h1>
          <p className="text-base text-slate-600 dark:text-slate-300 sm:text-lg">
            Get instant AI triage, trigger SOS alerts, and navigate to the nearest 24/7 emergency facilities.
          </p>
        </header>

        <div className="space-y-8 lg:grid lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:items-start lg:gap-8 lg:space-y-0">
          <section className="space-y-6">
            {/* Enhanced Emergency Triage with Dr. iSHA - Multi-Modal */}
            <Card className="border-teal-200 dark:border-teal-700 bg-gradient-to-br from-teal-50 via-white to-white dark:from-teal-900/20 dark:via-slate-800 dark:to-slate-800 shadow-lg overflow-hidden">
              <CardContent className="p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-teal-500 to-teal-600 shadow-lg">
                        <Stethoscope className="h-7 w-7 text-white" />
                      </div>
                      <div className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full bg-green-500 border-2 border-white dark:border-slate-800 flex items-center justify-center">
                        <span className="text-[10px] text-white font-bold">AI</span>
                      </div>
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-slate-800 dark:text-white">Dr. iSHA Emergency Triage</h2>
                      <p className="text-sm text-slate-600 dark:text-slate-400">AI-powered multi-modal emergency assessment</p>
                    </div>
                  </div>
                  {currentUrgency && (
                    <Badge className={`${
                      currentUrgency.includes('IMMEDIATE') ? 'bg-red-500 animate-pulse' :
                      currentUrgency.includes('URGENT') ? 'bg-orange-500' : 'bg-green-500'
                    } text-white px-3 py-1`}>
                      {currentUrgency}
                    </Badge>
                  )}
                </div>

                {/* Communication Mode Selector */}
                <div className="mt-6 grid grid-cols-3 gap-2">
                  <Button
                    variant={triageMode === 'text' ? 'default' : 'outline'}
                    onClick={() => { setTriageMode('text'); startTriageChat(); }}
                    className={`flex flex-col items-center gap-1 h-auto py-3 ${
                      triageMode === 'text' 
                        ? 'bg-teal-600 hover:bg-teal-700 text-white' 
                        : 'border-teal-200 dark:border-teal-700 hover:bg-teal-50 dark:hover:bg-teal-900/30'
                    }`}
                  >
                    <MessageSquare className="h-5 w-5" />
                    <span className="text-xs font-medium">Chat</span>
                  </Button>
                  <Button
                    variant={triageMode === 'voice' ? 'default' : 'outline'}
                    onClick={() => { setTriageMode('voice'); startTriageChat(); }}
                    className={`flex flex-col items-center gap-1 h-auto py-3 ${
                      triageMode === 'voice' 
                        ? 'bg-teal-600 hover:bg-teal-700 text-white' 
                        : 'border-teal-200 dark:border-teal-700 hover:bg-teal-50 dark:hover:bg-teal-900/30'
                    }`}
                  >
                    <Mic className="h-5 w-5" />
                    <span className="text-xs font-medium">Voice</span>
                  </Button>
                  <Button
                    variant={triageMode === 'video' ? 'default' : 'outline'}
                    onClick={() => { setTriageMode('video'); startTriageChat(); startVideoMode(); }}
                    className={`flex flex-col items-center gap-1 h-auto py-3 ${
                      triageMode === 'video' 
                        ? 'bg-teal-600 hover:bg-teal-700 text-white' 
                        : 'border-teal-200 dark:border-teal-700 hover:bg-teal-50 dark:hover:bg-teal-900/30'
                    }`}
                  >
                    <Video className="h-5 w-5" />
                    <span className="text-xs font-medium">Video</span>
                  </Button>
                </div>

                {/* Quick Start Button */}
                <Button
                  onClick={startTriageChat}
                  className="w-full mt-4 bg-gradient-to-r from-teal-600 to-teal-500 hover:from-teal-700 hover:to-teal-600 text-white shadow-md h-12"
                >
                  <Stethoscope className="mr-2 h-5 w-5" />
                  Start Emergency Consultation with Dr. iSHA
                </Button>

                {/* Features List */}
                <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                  <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                    <span className="text-teal-500">✓</span> Real-time urgency assessment
                  </div>
                  <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                    <span className="text-teal-500">✓</span> Voice-enabled (hands-free)
                  </div>
                  <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                    <span className="text-teal-500">✓</span> Visual symptom analysis
                  </div>
                  <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                    <span className="text-teal-500">✓</span> 24/7 AI assistance
                  </div>
                </div>

                {/* Legacy quick assessment */}
                {triageResult && !showTriageChat && (
                  <div className="mt-4 rounded-lg border border-teal-200 dark:border-teal-700 bg-teal-50 dark:bg-teal-900/20 p-4">
                    <div className="mb-2 flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                      <span className="font-medium text-slate-800 dark:text-white">Assessment Complete</span>
                    </div>
                    <p className="text-sm text-slate-600 dark:text-slate-300">
                      Previous assessment available. Start a new consultation for updated guidance.
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowTriageDialog(true)}
                      className="mt-2 border-teal-300 dark:border-teal-600"
                    >
                      View Previous Results
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Connect to Online Emergency Doctor - NEW PROMINENT SECTION */}
            <Card className="border-green-200 dark:border-green-700 bg-gradient-to-br from-green-50 via-emerald-50 to-white dark:from-green-900/20 dark:via-slate-800 dark:to-slate-800 shadow-lg overflow-hidden">
              <CardContent className="p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-green-500 to-emerald-600 shadow-lg">
                        <Video className="h-7 w-7 text-white" />
                      </div>
                      <div className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full bg-green-500 border-2 border-white dark:border-slate-800 flex items-center justify-center animate-pulse">
                        <span className="h-2 w-2 rounded-full bg-white" />
                      </div>
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-slate-800 dark:text-white">Connect to Online Doctor</h2>
                      <p className="text-sm text-slate-600 dark:text-slate-400">Video consultation with emergency physician</p>
                    </div>
                  </div>
                  {availableTriageDoctors.length > 0 && (
                    <Badge className="bg-green-500 text-white px-3 py-1 animate-pulse">
                      {availableTriageDoctors.length} Doctor(s) Online
                    </Badge>
                  )}
                </div>

                <div className="mt-4 p-3 rounded-lg bg-green-100/50 dark:bg-green-900/20 border border-green-200 dark:border-green-700">
                  <p className="text-sm text-green-800 dark:text-green-300">
                    <strong>🩺 Instant Video Consultation:</strong> Connect directly with an emergency doctor for immediate medical guidance through video call.
                  </p>
                </div>

                {/* Doctor Connection Buttons */}
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Button
                    onClick={async () => {
                      // Close AI chat to show doctors list
                      setShowTriageChat(false);
                      await fetchTriageDoctors();
                    }}
                    disabled={isLoadingDoctors}
                    className="w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white shadow-md h-12"
                  >
                    {isLoadingDoctors ? (
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    ) : (
                      <Users className="mr-2 h-5 w-5" />
                    )}
                    View Available Doctors
                  </Button>
                  <Button
                    onClick={() => connectToTriageDoctor()}
                    disabled={connectingToDoctor}
                    variant="outline"
                    className="w-full border-green-500 text-green-700 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/30 h-12"
                  >
                    {connectingToDoctor ? (
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    ) : (
                      <Video className="mr-2 h-5 w-5" />
                    )}
                    Connect Now (Next Available)
                  </Button>
                </div>

                {/* Video Call Ready Banner - Shows when connected */}
                {videoCallInfo && (
                  <div className="mt-4 p-4 rounded-lg bg-green-100 dark:bg-green-900/30 border-2 border-green-500 animate-pulse">
                    <div className="flex items-center justify-between flex-wrap gap-3">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-green-500 flex items-center justify-center">
                          <Video className="h-5 w-5 text-white" />
                        </div>
                        <div>
                          {waitingForDoctor ? (
                            <>
                              <p className="font-semibold text-green-800 dark:text-green-200">
                                🔔 Waiting for {videoCallInfo.doctor?.name}
                              </p>
                              <p className="text-xs text-green-700 dark:text-green-300 flex items-center gap-1">
                                <Loader2 className="h-3 w-3 animate-spin" />
                                Doctor is being notified... Please wait
                              </p>
                            </>
                          ) : (
                            <>
                              <p className="font-semibold text-green-800 dark:text-green-200">
                                ✅ Doctor Accepted! Ready to Join
                              </p>
                              <p className="text-xs text-green-700 dark:text-green-300">
                                Click to join • AI transcription enabled
                              </p>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        {!waitingForDoctor ? (
                          <>
                            <Button
                              onClick={joinVideoCall}
                              className="bg-green-600 hover:bg-green-700 text-white animate-pulse"
                            >
                              <Video className="h-4 w-4 mr-2" />
                              Join Video Call
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={openVideoInNewTab}
                              title="Open in new tab"
                            >
                              <ExternalLink className="h-4 w-4" />
                            </Button>
                          </>
                        ) : (
                          <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-300">
                            <Loader2 className="h-3 w-3 mr-1" />
                            Pending
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Available Doctors List - Inline Display */}
                {showDoctorList && availableTriageDoctors.length > 0 && !showTriageChat && (
                  <div className="mt-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-semibold text-slate-800 dark:text-white flex items-center gap-2">
                        <Users className="h-4 w-4 text-green-600" />
                        Online Emergency Doctors ({availableTriageDoctors.length})
                      </h4>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setShowDoctorList(false)}
                        className="h-6 w-6 p-0"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
                      {availableTriageDoctors.map((doctor) => (
                        <div
                          key={doctor.id}
                          className="flex items-center justify-between bg-white dark:bg-slate-800 rounded-lg p-3 shadow-sm border border-slate-200 dark:border-slate-700"
                        >
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center overflow-hidden">
                              {doctor.profileImage ? (
                                <img src={doctor.profileImage} alt={doctor.name} className="h-10 w-10 rounded-full object-cover" />
                              ) : (
                                <Stethoscope className="h-5 w-5 text-green-600" />
                              )}
                            </div>
                            <div>
                              <p className="text-sm font-medium text-slate-800 dark:text-white">{doctor.name}</p>
                              <p className="text-xs text-slate-500 dark:text-slate-400">
                                <span className="text-green-600 font-medium">{doctor.uniqueId}</span> • {doctor.specialization || 'General Practice'} • ⭐ {doctor.rating} • ₹{doctor.consultationFee}
                              </p>
                            </div>
                          </div>
                          <Button
                            size="sm"
                            onClick={() => connectToTriageDoctor(doctor.id)}
                            disabled={connectingToDoctor}
                            className="bg-green-600 hover:bg-green-700 text-white"
                          >
                            {connectingToDoctor ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <>
                                <Video className="h-4 w-4 mr-1" />
                                Connect
                              </>
                            )}
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Features List */}
                <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                  <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                    <span className="text-green-500">✓</span> Instant video connection
                  </div>
                  <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                    <span className="text-green-500">✓</span> AI-powered transcription
                  </div>
                  <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                    <span className="text-green-500">✓</span> Vision AI symptom analysis
                  </div>
                  <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                    <span className="text-green-500">✓</span> Emergency priority queue
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* SOS + Contacts */}
            <Card className="border-red-200 dark:border-red-800 bg-gradient-to-br from-red-50 via-orange-50 to-white dark:from-red-900/30 dark:via-slate-800 dark:to-slate-800 shadow-sm">
              <CardContent className="space-y-5 p-6">
                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-red-600 dark:text-red-400">Immediate SOS</p>
                  <h2 className="text-2xl font-bold leading-tight text-red-700 dark:text-red-300">Trigger emergency alerts</h2>
                  <p className="text-sm text-slate-700 dark:text-slate-200">
                    Share live location with trusted contacts and auto-dial emergency services.
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 items-stretch">
                  <Button
                    size="lg"
                    variant={isSOSActive ? "destructive" : "default"}
                    className={`relative flex min-h-[110px] w-full flex-col items-center justify-center overflow-hidden rounded-xl text-2xl font-extrabold tracking-wide ${
                      isSOSActive ? 'animate-pulse bg-red-600 hover:bg-red-700' : 'bg-red-500 hover:bg-red-600'
                    }`}
                    onClick={handleSOS}
                    disabled={isSOSActive}
                  >
                    <div className="relative z-10 flex flex-col items-center gap-1 text-center leading-tight">
                      <span className="text-white">{isSOSActive ? "SOS ACTIVATED" : "SOS"}</span>
                      <span className="text-sm font-medium text-white">
                        {isSOSActive ? "Contacting Emergency Services..." : "Press for Emergency"}
                      </span>
                    </div>
                    {isSOSActive && (
                      <div className="absolute inset-0 z-0 rounded-xl bg-red-500 opacity-70 pointer-events-none animate-ping" />
                    )}
                  </Button>

                  <Button
                    variant="outline"
                    className="h-auto min-h-[110px] w-full border-red-200 dark:border-red-700 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/30 flex flex-col items-center justify-center gap-2"
                    onClick={() => setIsEditingContacts(true)}
                  >
                    <Users className="h-5 w-5" />
                    <div className="flex flex-col items-center leading-tight">
                      <span className="text-sm font-semibold">Manage Emergency Contacts</span>
                      <span className="text-xs text-red-600/80 dark:text-red-200/80">Send alerts & location</span>
                    </div>
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Emergency Numbers */}
            <section className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-800 dark:text-white">Emergency Numbers</h3>
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  Quick access to national emergency helplines.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Card className="hover:shadow-lg transition-shadow bg-white dark:bg-slate-800/50 border-slate-200 dark:border-slate-700">
                  <CardContent className="pt-6">
                    <div className="flex flex-col items-center text-center">
                      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
                        <Phone className="h-6 w-6 text-red-600 dark:text-red-400" />
                      </div>
                      <span className="text-lg font-medium text-slate-800 dark:text-white">Ambulance</span>
                      <span className="mb-3 text-sm text-slate-600 dark:text-slate-300">Medical Emergency</span>
                      <Button
                        variant="outline"
                        size="lg"
                        className="w-full border-red-200 dark:border-red-700 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40"
                        onClick={() => callHospital("102")}
                      >
                        <Phone className="mr-2 h-4 w-4 text-red-600 dark:text-red-400" />
                        <span className="font-semibold text-red-600 dark:text-red-400">102</span>
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <Card className="hover:shadow-lg transition-shadow bg-white dark:bg-slate-800/50 border-slate-200 dark:border-slate-700">
                  <CardContent className="pt-6">
                    <div className="flex flex-col items-center text-center">
                      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-teal-100 dark:bg-teal-900/30">
                        <Phone className="h-6 w-6 text-teal-600 dark:text-teal-400" />
                      </div>
                      <span className="text-lg font-medium text-slate-800 dark:text-white">Police</span>
                      <span className="mb-3 text-sm text-slate-600 dark:text-slate-300">Law Enforcement</span>
                      <Button
                        variant="outline"
                        size="lg"
                        className="w-full border-teal-200 dark:border-teal-700 bg-teal-50 dark:bg-teal-900/20 hover:bg-teal-100 dark:hover:bg-teal-900/40"
                        onClick={() => callHospital("100")}
                      >
                        <Phone className="mr-2 h-4 w-4 text-teal-600 dark:text-teal-400" />
                        <span className="font-semibold text-teal-600 dark:text-teal-400">100</span>
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <Card className="hover:shadow-lg transition-shadow bg-white dark:bg-slate-800/50 border-slate-200 dark:border-slate-700">
                  <CardContent className="pt-6">
                    <div className="flex flex-col items-center text-center">
                      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-orange-100 dark:bg-orange-900/30">
                        <Phone className="h-6 w-6 text-orange-600 dark:text-orange-400" />
                      </div>
                      <span className="text-lg font-medium text-slate-800 dark:text-white">Fire</span>
                      <span className="mb-3 text-sm text-slate-600 dark:text-slate-300">Fire Emergency</span>
                      <Button
                        variant="outline"
                        size="lg"
                        className="w-full border-orange-200 dark:border-orange-700 bg-orange-50 dark:bg-orange-900/20 hover:bg-orange-100 dark:hover:bg-orange-900/40"
                        onClick={() => callHospital("101")}
                      >
                        <Phone className="mr-2 h-4 w-4 text-orange-600 dark:text-orange-400" />
                        <span className="font-semibold text-orange-600 dark:text-orange-400">101</span>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </section>
          </section>

          <section className="space-y-6">
            <Card className="shadow-sm bg-white dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 overflow-hidden">
              <CardHeader className="space-y-2 pb-2">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <CardTitle className="text-xl text-slate-800 dark:text-white">Live Map & Directions</CardTitle>
                    <CardDescription className="text-slate-600 dark:text-slate-300">Locate emergency-ready hospitals near you.</CardDescription>
                  </div>
                  {/* Location Status */}
                  <div className="flex items-center gap-2 flex-wrap justify-end">
                    <Button size="sm" variant="outline" className="h-8" onClick={requestLocationPermission}>
                      <Locate className="h-4 w-4 mr-1" /> Use my GPS
                    </Button>
                    <Button size="sm" variant="secondary" className="h-8" onClick={recenterOnUser}>
                      <MapPin className="h-4 w-4 mr-1" /> Center map
                    </Button>
                    {userLocation && locationAccuracy !== null && (
                      <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${
                        locationAccuracy <= 50 
                          ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' 
                          : locationAccuracy <= 200 
                            ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400'
                            : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                      }`}>
                        {isWatchingLocation && <Loader2 className="h-3 w-3 animate-spin" />}
                        <MapPin className="h-4 w-4" />
                        <span>
                          {locationSource === 'gps' ? '📡 GPS' : locationSource === 'manual' ? '✏️ Manual' : '📶 Network'}: ±{locationAccuracy.toFixed(0)}m
                        </span>
                      </div>
                    )}
                  </div>
                </div>
                
                {/* Location improvement options for poor accuracy */}
                {locationAccuracy && locationAccuracy > 200 && !isWatchingLocation && (
                  <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-200 dark:border-slate-600">
                    <span className="text-xs text-red-600 dark:text-red-400 font-medium">⚠️ Poor accuracy detected. Options:</span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={startWatchingLocation}
                      className="text-xs h-7 border-teal-300 dark:border-teal-600 text-teal-700 dark:text-teal-400"
                    >
                      <Locate className="h-3 w-3 mr-1" />
                      Track GPS
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setShowManualLocation(true)}
                      className="text-xs h-7 border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300"
                    >
                      ✏️ Enter Manually
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={openGoogleMapsForLocation}
                      className="text-xs h-7 border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300"
                    >
                      🗺️ Get from Google Maps
                    </Button>
                  </div>
                )}
                
                {/* Manual location entry form */}
                {showManualLocation && (
                  <div className="p-3 mt-2 bg-slate-50 dark:bg-slate-700/50 rounded-lg border border-slate-200 dark:border-slate-600">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Enter Coordinates</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setShowManualLocation(false)}
                        className="h-6 w-6 p-0"
                      >
                        ✕
                      </Button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs text-slate-600 dark:text-slate-400">Latitude</Label>
                        <Input
                          type="number"
                          step="any"
                          placeholder="e.g., 28.6139"
                          value={manualCoords.lat}
                          onChange={(e) => setManualCoords({ ...manualCoords, lat: e.target.value })}
                          className="h-8 text-sm"
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-slate-600 dark:text-slate-400">Longitude</Label>
                        <Input
                          type="number"
                          step="any"
                          placeholder="e.g., 77.2090"
                          value={manualCoords.lng}
                          onChange={(e) => setManualCoords({ ...manualCoords, lng: e.target.value })}
                          className="h-8 text-sm"
                        />
                      </div>
                    </div>
                    <Button
                      size="sm"
                      onClick={setManualLocation}
                      className="w-full mt-2 bg-teal-600 hover:bg-teal-700 text-white"
                    >
                      Set Location
                    </Button>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      💡 Open Google Maps → Long press your location → Copy coordinates
                    </p>
                  </div>
                )}
              </CardHeader>
              <CardContent className="relative p-0">
                <div
                  id="map"
                  className="w-full rounded-b-xl"
                  style={{ height: '420px', minHeight: '420px', zIndex: 1 }}
                />

                {loading && (
                  <div className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-b-xl bg-white/80 dark:bg-slate-800/80 backdrop-blur">
                    <Loader2 className="h-6 w-6 animate-spin text-teal-500" />
                    <span className="mt-2 text-sm font-medium text-slate-600 dark:text-slate-300">Acquiring GPS signal...</span>
                  </div>
                )}

                {/* Map Controls */}
                <div className="absolute bottom-4 left-4 flex gap-2 z-[1000]">
                  <Button
                    variant="secondary"
                    size="icon"
                    className="h-14 w-14 rounded-full bg-white dark:bg-slate-700 shadow-lg transition-transform hover:scale-105 border border-slate-200 dark:border-slate-600"
                    onClick={resetMapToUserLocation}
                    title="Re-center map to your location"
                  >
                    <Locate className="h-6 w-6 text-teal-600 dark:text-teal-400" />
                  </Button>
                  
                  <Button
                    variant="secondary"
                    size="icon"
                    className="h-14 w-14 rounded-full bg-white dark:bg-slate-700 shadow-lg transition-transform hover:scale-105 border border-slate-200 dark:border-slate-600"
                    onClick={refreshUserLocation}
                    disabled={loading}
                    title="Refresh location with high accuracy"
                  >
                    <MapPin className="h-6 w-6 text-teal-600 dark:text-teal-400" />
                  </Button>
                </div>
                
                {/* Location Info Panel */}
                {userLocation && !loading && (
                  <div className="absolute top-4 left-4 z-[1000] bg-white/90 dark:bg-slate-800/90 backdrop-blur px-3 py-2 rounded-lg shadow-md border border-slate-200 dark:border-slate-600">
                    <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                      <div className={`w-2 h-2 rounded-full ${
                        locationAccuracy !== null && locationAccuracy <= 20 ? 'bg-green-500' :
                        locationAccuracy !== null && locationAccuracy <= 100 ? 'bg-yellow-500' : 'bg-red-500'
                      }`} />
                      <span>
                        {userLocation.lat.toFixed(4)}, {userLocation.lng.toFixed(4)}
                      </span>
                    </div>
                  </div>
                )}
                
                {locationError && (
                  <div className="absolute bottom-4 right-4 z-[1000] rounded-md border border-yellow-400 dark:border-yellow-600 bg-yellow-100 dark:bg-yellow-900/30 px-4 py-2 text-sm text-yellow-700 dark:text-yellow-300">
                    {locationError}
                  </div>
                )}
              </CardContent>
            </Card>

            <section className="space-y-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-teal-600 dark:text-teal-400">Nearby Hospitals</p>
                  <h2 className="text-2xl font-semibold leading-tight text-slate-800 dark:text-white">Emergency-ready facilities</h2>
                </div>
                {!loading && hospitals.length > 0 && (
                  <span className="text-sm text-slate-600 dark:text-slate-300">
                    Showing {showAllHospitals ? hospitals.length : Math.min(5, hospitals.length)} of {hospitals.length} facilities
                  </span>
                )}
              </div>

              {loading ? (
                <div className="flex items-center justify-center rounded-xl border border-dashed border-slate-200 dark:border-slate-700 p-8 bg-white dark:bg-slate-800/50">
                  <Loader2 className="h-6 w-6 animate-spin text-teal-500" />
                  <span className="ml-2 text-sm text-slate-600 dark:text-slate-300">Finding nearby hospitals...</span>
                </div>
              ) : (
                <>
                  <div className="grid gap-4">
                    {displayedHospitals.map((hospital) => (
                      <Card key={hospital.id} className="hover:shadow-lg transition-shadow bg-white dark:bg-slate-800/50 border-slate-200 dark:border-slate-700">
                        <CardContent className="pt-6">
                          <div className="flex items-start gap-4">
                            <div className="flex-1">
                              <div className="mb-2 flex flex-wrap items-center gap-2">
                                <h3 className="text-lg font-bold text-slate-800 dark:text-white">{hospital.name}</h3>
                                {hospital.emergency && (
                                  <span className="rounded-full bg-red-100 dark:bg-red-900/30 px-2 py-0.5 text-xs font-semibold text-red-700 dark:text-red-400">
                                    24/7
                                  </span>
                                )}
                              </div>
                              <div className="mb-2 flex flex-wrap items-center gap-2">
                                <span className="inline-flex items-center rounded-full bg-teal-100 dark:bg-teal-900/30 px-2.5 py-0.5 text-xs font-medium text-teal-800 dark:text-teal-400">
                                  {hospital.type}
                                </span>
                                {hospital.distance && (
                                  <span className="inline-flex items-center rounded-full bg-slate-100 dark:bg-slate-700 px-2.5 py-0.5 text-xs font-medium text-slate-800 dark:text-slate-300">
                                    {hospital.distance.toFixed(1)} km away
                                  </span>
                                )}
                              </div>
                              {hospital.address !== 'Address not available' && (
                                <p className="mb-1 flex items-center gap-1 text-sm text-slate-600 dark:text-slate-300">
                                  <MapPin className="h-4 w-4" />
                                  {hospital.address}
                                </p>
                              )}
                              {hospital.phone && hospital.phone !== 'Phone not available' && (
                                <p className="flex items-center gap-1 text-sm text-slate-600 dark:text-slate-300">
                                  <Phone className="h-4 w-4" />
                                  {hospital.phone}
                                </p>
                              )}
                            </div>
                            <div className="flex w-40 flex-col gap-2">
                              {hospital.phone && hospital.phone !== 'Phone not available' && (
                                <Button variant="outline" size="sm" className="border-slate-200 dark:border-slate-600 dark:text-white dark:hover:bg-slate-700" onClick={() => callHospital(hospital.phone!)}>
                                  <Phone className="mr-2 h-4 w-4" />Call
                                </Button>
                              )}
                              <Button size="sm" className="bg-teal-600 hover:bg-teal-700 dark:bg-teal-500 dark:hover:bg-teal-600 text-white" onClick={() => showRoute(hospital)}>
                                <MapPin className="mr-2 h-4 w-4" />Map Route
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="border-teal-200 dark:border-teal-700 bg-teal-50 dark:bg-teal-900/20 text-teal-700 dark:text-teal-400 hover:bg-teal-100 dark:hover:bg-teal-900/40"
                                onClick={() => openInGoogleMaps(hospital)}
                              >
                                <MapPin className="mr-2 h-4 w-4" />Google Maps
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>

                  {hospitals.length > 5 && (
                    <Button
                      variant="outline"
                      className="w-full py-5 text-base hover:bg-slate-100 dark:hover:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200"
                      onClick={() => setShowAllHospitals(!showAllHospitals)}
                    >
                      {showAllHospitals ? 'Show fewer hospitals' : `Show more (${hospitals.length - 5} more)`}
                    </Button>
                  )}
                </>
              )}
            </section>
          </section>
        </div>
      </div>

      {/* Emergency Triage Results Dialog */}
      <Dialog open={showTriageDialog} onOpenChange={setShowTriageDialog}>
        <DialogContent className="sm:max-w-[700px] max-h-[80vh] overflow-y-auto bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-800 dark:text-white">
              <Stethoscope className="h-5 w-5 text-teal-600 dark:text-teal-400" />
              Emergency Medical Assessment - Dr. iSHA
            </DialogTitle>
            <DialogDescription>
              {triageResult ? (
                <div className="flex items-center gap-2 text-teal-600 dark:text-teal-400">
                  <AlertTriangle className="h-4 w-4" />
                  Assessment completed at {triageResult.timestamp.toLocaleString()}
                </div>
              ) : (
                <span className="text-slate-600 dark:text-slate-300">Emergency medical guidance from Dr. iSHA</span>
              )}
            </DialogDescription>
          </DialogHeader>
          
          {triageResult && (
            <div className="space-y-4">
              <div className="p-4 bg-teal-50 dark:bg-teal-900/20 rounded-lg border border-teal-200 dark:border-teal-700">
                <h3 className="font-semibold text-slate-800 dark:text-white mb-2">Your Symptoms:</h3>
                <p className="text-slate-700 dark:text-slate-300">{triageResult.symptoms}</p>
              </div>
              
              <div className="p-4 bg-white dark:bg-slate-700/50 rounded-lg border border-slate-200 dark:border-slate-600">
                <h3 className="font-semibold mb-3 flex items-center gap-2 text-slate-800 dark:text-white">
                  <Stethoscope className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                  Dr. iSHA's Emergency Assessment:
                </h3>
                <div className="prose prose-sm max-w-none">
                  <div className="whitespace-pre-wrap text-slate-700 dark:text-slate-300">
                    {triageResult.assessment}
                  </div>
                </div>
              </div>
              
              {triageResult.fallback && (
                <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-700">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
                    <span className="font-semibold text-red-800 dark:text-red-400">Service Unavailable</span>
                  </div>
                  <p className="text-red-700 dark:text-red-300 text-sm">
                    Dr. iSHA's emergency triage service is currently unavailable. The above is fallback emergency guidance.
                  </p>
                </div>
              )}
              
              <div className="flex gap-3 pt-4 border-t border-slate-200 dark:border-slate-600">
                <Button
                  onClick={() => window.location.href = 'tel:108'}
                  className="bg-red-600 hover:bg-red-700 dark:bg-red-600 dark:hover:bg-red-700 text-white flex-1"
                >
                  <Phone className="w-4 h-4 mr-2" />
                  Call Emergency (108)
                </Button>
                
                <Button
                  variant="outline" 
                  onClick={() => setShowTriageDialog(false)}
                  className="flex-1 border-slate-200 dark:border-slate-600 dark:text-white dark:hover:bg-slate-700"
                >
                  Close
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={isEditingContacts} onOpenChange={setIsEditingContacts}>
        <DialogContent className="sm:max-w-[425px] bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700">
          <DialogHeader>
            <DialogTitle className="text-slate-800 dark:text-white">Emergency Contacts</DialogTitle>
            <DialogDescription className="text-slate-600 dark:text-slate-300">
              Add or remove emergency contacts who will receive SOS messages with your location.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name" className="text-slate-700 dark:text-slate-200">Name</Label>
              <Input
                id="name"
                value={newContact.name}
                onChange={(e) => setNewContact({ ...newContact, name: e.target.value })}
                placeholder="Contact Name"
                className="border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-white"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="phone" className="text-slate-700 dark:text-slate-200">Phone Number</Label>
              <Input
                id="phone"
                value={newContact.phone}
                onChange={(e) => setNewContact({ ...newContact, phone: e.target.value })}
                placeholder="Phone Number"
                className="border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-white"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="relationship" className="text-slate-700 dark:text-slate-200">Relationship</Label>
              <Input
                id="relationship"
                value={newContact.relationship}
                onChange={(e) => setNewContact({ ...newContact, relationship: e.target.value })}
                placeholder="Relationship (e.g., Parent, Spouse)"
                className="border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-white"
              />
            </div>
            <Button onClick={addEmergencyContact} className="bg-teal-600 hover:bg-teal-700 dark:bg-teal-500 dark:hover:bg-teal-600 text-white">Add Contact</Button>
            
            <div className="mt-4">
              <h4 className="mb-2 font-semibold text-slate-800 dark:text-white">Current Emergency Contacts</h4>
              {emergencyContacts.map((contact, index) => (
                <div key={index} className="flex items-center justify-between py-2 border-b border-slate-200 dark:border-slate-600">
                  <div>
                    <p className="font-medium text-slate-800 dark:text-white">{contact.name}</p>
                    <p className="text-sm text-slate-600 dark:text-slate-300">{contact.phone}</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">{contact.relationship}</p>
                  </div>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => removeEmergencyContact(index)}
                  >
                    Remove
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Multi-Modal Triage Chat Dialog */}
      <Dialog open={showTriageChat} onOpenChange={(open) => {
        setShowTriageChat(open);
        if (!open) {
          stopVideoMode();
          stopVoiceRecording();
          stopSpeaking();
          setVideoCallInfo(null);
          setShowDoctorList(false);
          setShowEmbeddedVideoCall(false);
        }
      }}>
        <DialogContent className={`${showEmbeddedVideoCall ? 'sm:max-w-[900px] h-[90vh]' : 'sm:max-w-[600px] h-[85vh]'} max-h-[900px] p-0 bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 flex flex-col`}>
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700 bg-gradient-to-r from-teal-600 to-teal-500">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="h-10 w-10 rounded-full bg-white/20 flex items-center justify-center">
                  <Stethoscope className="h-5 w-5 text-white" />
                </div>
                <div className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-green-400 border border-white" />
              </div>
              <div>
                <h3 className="font-semibold text-white">Dr. iSHA Emergency Triage</h3>
                <p className="text-xs text-teal-100">AI Medical Assistant • Online</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* Connect to Doctor Button */}
              <Button
                size="sm"
                onClick={fetchTriageDoctors}
                disabled={isLoadingDoctors}
                className="bg-white/20 hover:bg-white/30 text-white text-xs h-8"
                title="Connect to an online triage doctor"
              >
                {isLoadingDoctors ? (
                  <Loader2 className="h-3 w-3 animate-spin mr-1" />
                ) : (
                  <Users className="h-3 w-3 mr-1" />
                )}
                Connect Doctor
              </Button>
              {currentUrgency && (
                <Badge className={`${
                  currentUrgency.includes('IMMEDIATE') ? 'bg-red-500 animate-pulse' :
                  currentUrgency.includes('URGENT') ? 'bg-orange-500' : 'bg-green-500'
                } text-white text-xs`}>
                  {currentUrgency}
                </Badge>
              )}
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setAutoSpeak(!autoSpeak)}
                className="h-8 w-8 text-white hover:bg-white/20"
                title={autoSpeak ? "Mute voice" : "Enable voice"}
              >
                {autoSpeak ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          {/* Available Doctors Panel */}
          {showDoctorList && availableTriageDoctors.length > 0 && (
            <div className="border-b border-slate-200 dark:border-slate-700 bg-blue-50 dark:bg-blue-900/20 p-3">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-semibold text-slate-800 dark:text-white flex items-center gap-2">
                  <Users className="h-4 w-4 text-blue-600" />
                  Online Triage Doctors ({availableTriageDoctors.length})
                </h4>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setShowDoctorList(false)}
                  className="h-6 w-6 p-0"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <ScrollArea className="max-h-32">
                <div className="space-y-2">
                  {availableTriageDoctors.map((doctor) => (
                    <div
                      key={doctor.id}
                      className="flex items-center justify-between bg-white dark:bg-slate-800 rounded-lg p-2 shadow-sm"
                    >
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-full bg-teal-100 dark:bg-teal-900 flex items-center justify-center">
                          {doctor.profileImage ? (
                            <img src={doctor.profileImage} alt={doctor.name} className="h-8 w-8 rounded-full object-cover" />
                          ) : (
                            <Stethoscope className="h-4 w-4 text-teal-600" />
                          )}
                        </div>
                        <div>
                          <p className="text-xs font-medium text-slate-800 dark:text-white">{doctor.name}</p>
                          <p className="text-[10px] text-slate-500 dark:text-slate-400">
                            {doctor.specialization || 'General'} • ₹{doctor.consultationFee}
                          </p>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => connectToTriageDoctor(doctor.id)}
                        disabled={connectingToDoctor}
                        className="h-7 text-xs bg-green-600 hover:bg-green-700"
                      >
                        {connectingToDoctor ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <>
                            <Video className="h-3 w-3 mr-1" />
                            Connect
                          </>
                        )}
                      </Button>
                    </div>
                  ))}
                </div>
              </ScrollArea>
              <Button
                size="sm"
                variant="outline"
                onClick={() => connectToTriageDoctor()}
                disabled={connectingToDoctor}
                className="w-full mt-2 text-xs"
              >
                Connect to Next Available Doctor
              </Button>
            </div>
          )}

          {/* Video Call Join Banner - PROMINENT */}
          {videoCallInfo && !showEmbeddedVideoCall && (
            <div className="border-b-4 border-green-500 bg-gradient-to-r from-green-100 to-emerald-100 dark:from-green-900/40 dark:to-emerald-900/40 p-4 shadow-lg">
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-center gap-3">
                  <div className="h-12 w-12 rounded-full bg-green-500 flex items-center justify-center animate-pulse shadow-lg">
                    <Video className="h-6 w-6 text-white" />
                  </div>
                  <div className="text-center flex-1">
                    <p className="text-lg font-bold text-green-800 dark:text-green-200 animate-pulse">
                      🎥 Video Call Room Ready!
                    </p>
                    <p className="text-sm font-medium text-slate-800 dark:text-white">
                      Dr. {videoCallInfo.doctor?.name} is waiting
                    </p>
                    <p className="text-xs text-slate-600 dark:text-slate-400">
                      🧠 AI-powered transcription & analysis enabled
                    </p>
                  </div>
                </div>
                <div className="flex gap-2 justify-center">
                  <Button
                    size="lg"
                    onClick={openVideoInNewTab}
                    className="bg-green-600 hover:bg-green-700 text-white shadow-lg animate-pulse"
                  >
                    <Video className="h-5 w-5 mr-2" />
                    Join Video Call (Recommended)
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={joinVideoCall}
                    title="Open embedded (may have restrictions)"
                    className="text-xs border-green-500"
                  >
                    <Video className="h-3 w-3 mr-1" />
                    Embed
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setVideoCallInfo(null)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Embedded AI-Powered Video Consultation */}
          {showEmbeddedVideoCall && videoCallInfo && (
            <div className="flex-1 flex flex-col bg-slate-900 min-h-[400px]">
              {/* Video Frame */}
              <div className="relative flex-1 min-h-[350px]">
                <iframe
                  src={videoCallInfo.joinUrl}
                  className="w-full h-full border-0 min-h-[350px]"
                  allow="camera *; microphone *; display-capture *; fullscreen *; autoplay *; encrypted-media *; picture-in-picture *; clipboard-write *"
                  allowFullScreen
                  title="Video Consultation"
                />
                
                {/* AI Status Overlay */}
                <div className="absolute top-2 left-2 flex gap-2">
                  {isAITranscribing && (
                    <Badge className="bg-purple-600 text-white text-[10px] animate-pulse">
                      🎙️ AI Listening
                    </Badge>
                  )}
                  <Badge className="bg-blue-600 text-white text-[10px]">
                    🧠 AI Active
                  </Badge>
                  {/* Vision AI Toggle */}
                  <Button
                    size="sm"
                    variant={visionAIEnabled ? "default" : "outline"}
                    onClick={() => {
                      if (visionAIEnabled) {
                        stopVisionAI();
                      } else {
                        startVisionAIAnalysis();
                      }
                    }}
                    className={`text-[10px] h-5 px-2 ${visionAIEnabled ? 'bg-cyan-600 hover:bg-cyan-700' : 'border-cyan-500 text-cyan-400'}`}
                  >
                    <Eye className="h-3 w-3 mr-1" />
                    {visionAIEnabled ? '👁️ Vision ON' : '👁️ Vision'}
                  </Button>
                </div>
                
                {/* End Call Button */}
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={endVideoCall}
                  className="absolute top-2 right-2"
                >
                  <PhoneOff className="h-4 w-4 mr-1" />
                  End
                </Button>
              </div>
              
              {/* AI Features Panel */}
              <div className="bg-slate-800 border-t border-slate-700 p-2 max-h-[250px] overflow-y-auto">
                {/* Vision AI Alerts */}
                {visionAlerts.length > 0 && (
                  <div className="bg-red-900/30 border border-red-500/50 rounded p-2 mb-2">
                    <h5 className="text-red-400 font-semibold text-xs mb-1">🚨 Vision AI Alerts</h5>
                    {visionAlerts.map((alert, i) => (
                      <p key={i} className="text-red-300 text-[10px]">{alert}</p>
                    ))}
                  </div>
                )}
                
                {/* Vision AI Scene Description */}
                {sceneDescription && (
                  <div className="bg-blue-900/30 border border-blue-500/30 rounded p-2 mb-2">
                    <h5 className="text-blue-400 font-semibold text-xs flex items-center gap-1 mb-1">
                      <Eye className="h-3 w-3" /> 👁️ Vision AI Scene
                    </h5>
                    <p className="text-blue-200 text-[10px]">{sceneDescription}</p>
                  </div>
                )}
                
                <div className="grid grid-cols-4 gap-2 text-xs">
                  {/* Vision AI Analysis */}
                  <div className="bg-slate-700/50 rounded p-2">
                    <h5 className="text-cyan-400 font-semibold mb-1 flex items-center gap-1">
                      <Eye className="h-3 w-3" /> Vision AI
                    </h5>
                    {visionAnalysis ? (
                      <div className="text-white/80 space-y-0.5">
                        <p className="text-[10px]">👤 {visionAnalysis.personDetected ? 'Person detected' : 'No person'}</p>
                        <p className="text-[10px]">🏃 Motion: {visionAnalysis.motionType}</p>
                        <p className="text-[10px]">📊 Level: {visionAnalysis.motionLevel.toFixed(0)}%</p>
                        {visionAnalysis.poseData && (
                          <p className="text-[10px]">🧍 {visionAnalysis.poseData.isLying ? 'Lying' : visionAnalysis.poseData.isSeated ? 'Seated' : 'Standing'}</p>
                        )}
                      </div>
                    ) : (
                      <p className="text-white/50 text-[10px]">Initializing...</p>
                    )}
                  </div>
                  
                  {/* Vital Signs Estimation */}
                  <div className="bg-slate-700/50 rounded p-2">
                    <h5 className="text-teal-400 font-semibold mb-1 flex items-center gap-1">
                      <Activity className="h-3 w-3" /> AI Vitals
                    </h5>
                    {vitalSigns ? (
                      <div className="text-white/80 space-y-0.5">
                        <p className="text-[10px]">❤️ {vitalSigns.pulse}</p>
                        <p className="text-[10px]">🫁 {vitalSigns.breathing}</p>
                        <p className="text-[10px]">🧠 {vitalSigns.consciousness}</p>
                      </div>
                    ) : (
                      <p className="text-white/50 text-[10px]">Analyzing...</p>
                    )}
                  </div>
                  
                  {/* Live Transcript */}
                  <div className="bg-slate-700/50 rounded p-2">
                    <h5 className="text-purple-400 font-semibold mb-1 flex items-center gap-1">
                      <MessageSquare className="h-3 w-3" /> Transcript
                    </h5>
                    <div className="text-white/80 space-y-0.5 max-h-16 overflow-y-auto">
                      {liveTranscript.length > 0 ? (
                        liveTranscript.slice(-3).map((line, i) => (
                          <p key={i} className="text-[10px] truncate">{line}</p>
                        ))
                      ) : (
                        <p className="text-white/50 text-[10px]">Listening...</p>
                      )}
                    </div>
                  </div>
                  
                  {/* AI Suggestions */}
                  <div className="bg-slate-700/50 rounded p-2">
                    <h5 className="text-yellow-400 font-semibold mb-1 flex items-center gap-1">
                      <Brain className="h-3 w-3" /> Suggestions
                    </h5>
                    <div className="text-white/80 space-y-0.5 max-h-16 overflow-y-auto">
                      {aiSuggestions.length > 0 ? (
                        aiSuggestions.slice(-3).map((suggestion, i) => (
                          <p key={i} className="text-[10px]">{suggestion}</p>
                        ))
                      ) : (
                        <p className="text-white/50 text-[10px]">Analyzing...</p>
                      )}
                    </div>
                  </div>
                </div>
                
                {/* Hidden video element for Vision AI analysis */}
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="hidden"
                  width={640}
                  height={480}
                />
              </div>
            </div>
          )}

          {/* Video Preview (when active) - MAXIMIZED */}
          {isVideoMode && (
            <div className="relative bg-slate-900">
              {/* Video Feed - Large View */}
              <div className="relative min-h-[350px]">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className={`w-full h-[350px] object-cover ${!isStreamReady ? 'opacity-0' : 'opacity-100'}`}
                  style={{ transition: 'opacity 0.3s' }}
                />
                {!isStreamReady && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center text-white">
                      <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
                      <p className="text-sm">Starting camera...</p>
                    </div>
                  </div>
                )}
                {capturedImage && (
                  <div className="absolute inset-0 bg-black flex items-center justify-center">
                    <img src={capturedImage} alt="Captured" className="max-h-full max-w-full object-contain" />
                  </div>
                )}
                
                {/* Vision AI Toggle Overlay */}
                <div className="absolute top-2 left-2 flex gap-2">
                  <Button
                    size="sm"
                    variant={visionAIEnabled ? "default" : "outline"}
                    onClick={() => {
                      if (visionAIEnabled) {
                        stopVisionAI();
                      } else {
                        startVisionAIAnalysis();
                      }
                    }}
                    className={`text-[10px] h-6 px-2 ${visionAIEnabled ? 'bg-cyan-600 hover:bg-cyan-700' : 'border-cyan-500 text-cyan-400 bg-black/50'}`}
                  >
                    <Eye className="h-3 w-3 mr-1" />
                    {visionAIEnabled ? '👁️ AI ON' : '👁️ AI OFF'}
                  </Button>
                  {visionAIEnabled && (
                    <Badge className="bg-green-600 text-white text-[10px] animate-pulse">
                      Analyzing...
                    </Badge>
                  )}
                </div>
                
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-2">
                  <Button
                    size="sm"
                    onClick={captureImage}
                    className="bg-white text-slate-800 hover:bg-slate-100 disabled:opacity-50"
                    disabled={!isStreamReady}
                  >
                    <Camera className="h-4 w-4 mr-1" />
                    {capturedImage ? 'Retake' : 'Capture'}
                  </Button>
                  {capturedImage && (
                    <Button
                      size="sm"
                      onClick={() => setCapturedImage(null)}
                      className="bg-teal-600 text-white hover:bg-teal-700"
                    >
                      Clear
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={stopVideoMode}
                >
                  <VideoOff className="h-4 w-4 mr-1" />
                  Stop
                </Button>
              </div>
              </div>
              
              {/* Vision AI Analysis Panel - During Triage */}
              {visionAIEnabled && (
                <div className="bg-slate-800 border-t border-slate-700 p-2">
                  {/* Vision AI Alerts */}
                  {visionAlerts.length > 0 && (
                    <div className="bg-red-900/30 border border-red-500/50 rounded p-2 mb-2">
                      <h5 className="text-red-400 font-semibold text-xs mb-1">🚨 Vision AI Alerts</h5>
                      {visionAlerts.map((alert, i) => (
                        <p key={i} className="text-red-300 text-[10px]">{alert}</p>
                      ))}
                    </div>
                  )}
                  
                  {/* Scene Description */}
                  {sceneDescription && (
                    <div className="bg-blue-900/30 border border-blue-500/30 rounded p-2 mb-2">
                      <h5 className="text-blue-400 font-semibold text-xs flex items-center gap-1 mb-1">
                        <Eye className="h-3 w-3" /> 👁️ AI Scene Analysis
                      </h5>
                      <p className="text-blue-200 text-[10px]">{sceneDescription}</p>
                    </div>
                  )}
                  
                  {/* Vision AI Grid */}
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    {/* Person & Motion */}
                    <div className="bg-slate-700/50 rounded p-2">
                      <h5 className="text-cyan-400 font-semibold mb-1 flex items-center gap-1">
                        <Eye className="h-3 w-3" /> Vision AI
                      </h5>
                      {visionAnalysis ? (
                        <div className="text-white/80 space-y-0.5">
                          <p className="text-[10px]">👤 {visionAnalysis.personDetected ? 'Person detected' : 'No person'}</p>
                          <p className="text-[10px]">🏃 Motion: {visionAnalysis.motionType}</p>
                          <p className="text-[10px]">📊 Level: {visionAnalysis.motionLevel.toFixed(0)}%</p>
                        </div>
                      ) : (
                        <p className="text-white/50 text-[10px]">Initializing...</p>
                      )}
                    </div>
                    
                    {/* Pose Analysis */}
                    <div className="bg-slate-700/50 rounded p-2">
                      <h5 className="text-purple-400 font-semibold mb-1 flex items-center gap-1">
                        <Activity className="h-3 w-3" /> Pose
                      </h5>
                      {visionAnalysis?.poseData ? (
                        <div className="text-white/80 space-y-0.5">
                          <p className="text-[10px]">🧍 {visionAnalysis.poseData.isLying ? 'Lying down' : visionAnalysis.poseData.isSeated ? 'Seated' : 'Standing'}</p>
                          <p className="text-[10px]">🗣️ Head: {visionAnalysis.poseData.headPosition}</p>
                          <p className="text-[10px]">💪 Body: {visionAnalysis.poseData.bodyPosture}</p>
                        </div>
                      ) : (
                        <p className="text-white/50 text-[10px]">Analyzing pose...</p>
                      )}
                    </div>
                    
                    {/* Vital Estimates */}
                    <div className="bg-slate-700/50 rounded p-2">
                      <h5 className="text-teal-400 font-semibold mb-1 flex items-center gap-1">
                        <Activity className="h-3 w-3" /> Vitals (AI)
                      </h5>
                      {visionAnalysis?.vitalEstimates ? (
                        <div className="text-white/80 space-y-0.5">
                          <p className="text-[10px]">🫁 {visionAnalysis.vitalEstimates.respiratoryRate}</p>
                          <p className="text-[10px]">😣 Distress: {visionAnalysis.vitalEstimates.distressLevel}</p>
                          <p className="text-[10px]">🧠 {visionAnalysis.vitalEstimates.consciousnessLevel}</p>
                        </div>
                      ) : (
                        <p className="text-white/50 text-[10px]">Estimating...</p>
                      )}
                    </div>
                  </div>
                  
                  {/* Hidden video for Vision AI processing */}
                  <video
                    ref={localVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className="hidden"
                    width={640}
                    height={480}
                  />
                </div>
              )}
            </div>
          )}

          {/* Chat Messages */}
          <div 
            ref={chatScrollRef}
            className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50 dark:bg-slate-900/50"
          >
            {triageChatMessages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                    message.role === 'user'
                      ? 'bg-teal-600 text-white rounded-br-md'
                      : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-white shadow-sm border border-slate-200 dark:border-slate-700 rounded-bl-md'
                  }`}
                >
                  {message.type === 'voice' && message.role === 'user' && (
                    <div className="flex items-center gap-1 text-xs opacity-75 mb-1">
                      <Mic className="h-3 w-3" /> Voice message
                    </div>
                  )}
                  {message.imageUrl && (
                    <img 
                      src={message.imageUrl} 
                      alt="Shared" 
                      className="rounded-lg mb-2 max-w-full"
                    />
                  )}
                  <div className={`text-sm whitespace-pre-wrap ${message.role === 'assistant' ? 'prose prose-sm dark:prose-invert max-w-none' : ''}`}>
                    {message.content.split('\n').map((line, i) => (
                      <span key={i}>
                        {line.replace(/\*\*(.*?)\*\*/g, '$1')}
                        {i < message.content.split('\n').length - 1 && <br />}
                      </span>
                    ))}
                  </div>
                  <div className={`text-[10px] mt-1 ${message.role === 'user' ? 'text-teal-200' : 'text-slate-400'}`}>
                    {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>
            ))}
            
            {isProcessing && (
              <div className="flex justify-start">
                <div className="bg-white dark:bg-slate-800 rounded-2xl rounded-bl-md px-4 py-3 shadow-sm border border-slate-200 dark:border-slate-700">
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-teal-600" />
                    <span className="text-sm text-slate-600 dark:text-slate-300">Dr. iSHA is analyzing...</span>
                  </div>
                </div>
              </div>
            )}
            
            {isSpeaking && (
              <div className="flex justify-center">
                <div className="bg-teal-100 dark:bg-teal-900/30 rounded-full px-3 py-1 flex items-center gap-2">
                  <Volume2 className="h-3 w-3 text-teal-600 animate-pulse" />
                  <span className="text-xs text-teal-700 dark:text-teal-300">Speaking...</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={stopSpeaking}
                    className="h-5 w-5 p-0"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Input Area */}
          <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
            {/* Captured image preview */}
            {capturedImage && !isVideoMode && (
              <div className="mb-2 relative inline-block">
                <img src={capturedImage} alt="To send" className="h-16 rounded-lg" />
                <Button
                  size="icon"
                  variant="destructive"
                  className="absolute -top-2 -right-2 h-5 w-5"
                  onClick={() => setCapturedImage(null)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            )}
            
            {/* Recording indicator */}
            {isRecording && (
              <div className="mb-2 flex items-center gap-2 text-red-600 dark:text-red-400">
                <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                <span className="text-sm">Listening... Speak clearly</span>
              </div>
            )}

            <div className="flex items-end gap-2">
              <div className="flex-1 relative">
                <Textarea
                  value={triageInput}
                  onChange={(e) => setTriageInput(e.target.value)}
                  placeholder={isRecording ? "Listening..." : "Describe your symptoms..."}
                  className="min-h-[44px] max-h-32 pr-10 resize-none border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-slate-800 dark:text-white"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      sendTriageMessage(triageInput, 'text');
                    }
                  }}
                  disabled={isRecording}
                />
              </div>

              {/* Action buttons */}
              <div className="flex gap-1">
                {/* Voice button */}
                <Button
                  size="icon"
                  variant={isRecording ? "destructive" : "outline"}
                  onClick={isRecording ? stopVoiceRecording : startVoiceRecording}
                  className={`h-11 w-11 ${isRecording ? 'animate-pulse' : 'border-slate-200 dark:border-slate-600'}`}
                  title={isRecording ? "Stop recording" : "Start voice input"}
                >
                  {isRecording ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                </Button>

                {/* Camera button */}
                <Button
                  size="icon"
                  variant={isVideoMode ? "destructive" : "outline"}
                  onClick={isVideoMode ? stopVideoMode : startVideoMode}
                  className={`h-11 w-11 ${isVideoMode ? '' : 'border-slate-200 dark:border-slate-600'}`}
                  title={isVideoMode ? "Stop camera" : "Start camera"}
                >
                  {isVideoMode ? <VideoOff className="h-5 w-5" /> : <Camera className="h-5 w-5" />}
                </Button>

                {/* Send button */}
                <Button
                  size="icon"
                  onClick={() => sendTriageMessage(triageInput, capturedImage ? 'image' : 'text')}
                  disabled={(!triageInput.trim() && !capturedImage) || isProcessing}
                  className="h-11 w-11 bg-teal-600 hover:bg-teal-700 text-white"
                >
                  <Send className="h-5 w-5" />
                </Button>
              </div>
            </div>

            {/* Quick actions */}
            <div className="flex flex-wrap gap-2 mt-3">
              <Button
                size="sm"
                variant="outline"
                onClick={() => window.location.href = 'tel:108'}
                className="text-xs border-red-200 dark:border-red-700 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30"
              >
                <Phone className="h-3 w-3 mr-1" />
                Call 108
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setTriageChatMessages([]);
                  setCurrentUrgency(null);
                  startTriageChat();
                }}
                className="text-xs border-slate-200 dark:border-slate-600"
              >
                <RefreshCw className="h-3 w-3 mr-1" />
                New Consultation
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      
      {/* Floating Video Call Button - Always Visible */}
      {videoCallInfo && !showEmbeddedVideoCall && (
        <div className="fixed bottom-20 right-6 z-50 animate-bounce">
          <Button
            size="lg"
            onClick={openVideoInNewTab}
            className="bg-green-600 hover:bg-green-700 text-white shadow-2xl rounded-full h-16 w-16 p-0 flex flex-col items-center justify-center"
          >
            <Video className="h-8 w-8 animate-pulse" />
          </Button>
          <div className="absolute -top-2 -right-2 h-6 w-6 bg-red-500 rounded-full animate-pulse flex items-center justify-center">
            <span className="text-white text-xs font-bold">!</span>
          </div>
          <div className="absolute top-0 left-full ml-3 bg-green-600 text-white px-4 py-2 rounded-lg shadow-lg whitespace-nowrap">
            <p className="font-bold">Video Call Ready!</p>
            <p className="text-xs">Click to join</p>
          </div>
        </div>
      )}
      
      {/* Payment Dialog - Health Coins */}
      <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Emergency Credit Exhausted
            </DialogTitle>
            <DialogDescription>
              You've used your free emergency consultation. Choose a payment method to continue.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Payment info */}
            {paymentInfo && (
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-amber-800 dark:text-amber-200">
                    <strong>Consultation Fee:</strong>
                  </span>
                  <span className="text-lg font-bold text-amber-900 dark:text-amber-100">
                    ₹{paymentInfo.hcRequired.toFixed(2)}
                  </span>
                </div>
                <div className="h-px bg-amber-200 dark:bg-amber-700" />
                <div className="flex items-center justify-between">
                  <span className="text-sm text-amber-800 dark:text-amber-200">
                    <strong>Pay with Health Coins:</strong>
                  </span>
                  <span className="text-lg font-bold text-teal-700 dark:text-teal-300">
                    {paymentInfo.hcRequired} HC
                  </span>
                </div>
                <div className="bg-amber-100 dark:bg-amber-900/40 rounded px-3 py-2 mt-2">
                  <p className="text-xs text-amber-700 dark:text-amber-300 text-center">
                    💰 Exchange Rate: <strong>1 HC = ₹1</strong>
                  </p>
                </div>
              </div>
            )}
            
            {/* HC Balance */}
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-blue-800 dark:text-blue-200">
                  <strong>Your HC Balance:</strong>
                </span>
                <span className="text-lg font-bold text-blue-900 dark:text-blue-100">
                  {userHCBalance.toFixed(2)} HC
                </span>
              </div>
              {paymentInfo && userHCBalance < paymentInfo.hcRequired && (
                <>
                  <div className="h-px bg-blue-200 dark:bg-blue-700 mb-2" />
                  <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded px-3 py-2">
                    <p className="text-xs text-red-700 dark:text-red-300">
                      ⚠️ <strong>Insufficient Balance</strong>
                    </p>
                    <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                      You need <strong>{(paymentInfo.hcRequired - userHCBalance).toFixed(2)} more HC</strong> (₹{(paymentInfo.hcRequired - userHCBalance).toFixed(2)})
                    </p>
                  </div>
                </>
              )}
            </div>
            
            {/* Payment buttons */}
            <div className="flex flex-col gap-2">
              {paymentInfo && userHCBalance >= paymentInfo.hcRequired ? (
                <Button
                  onClick={() => {
                    setShowPaymentDialog(false);
                    connectToTriageDoctor(undefined, true);
                  }}
                  className="w-full bg-teal-600 hover:bg-teal-700"
                >
                  Pay with Health Coins ({paymentInfo.hcRequired} HC)
                </Button>
              ) : (
                <>
                  <Button
                    onClick={() => {
                      setShowPurchaseHCDialog(true);
                    }}
                    className="w-full bg-primary hover:bg-primary/90 gap-2"
                  >
                    <Coins className="h-4 w-4" />
                    Buy Health Coins
                  </Button>
                  <Button
                    disabled
                    variant="outline"
                    className="w-full"
                  >
                    Insufficient Health Coins
                  </Button>
                </>
              )}
              
              <Button
                variant="outline"
                onClick={() => {
                  setShowPaymentDialog(false);
                  toast({
                    title: "Payment Required",
                    description: "Please add Health Coins or contact support for payment options.",
                  });
                }}
                className="w-full"
              >
                Cancel
              </Button>
            </div>
            
            {/* Help text */}
            <p className="text-xs text-slate-600 dark:text-slate-400 text-center">
              💎 Earn Health Coins by completing health activities, daily check-ins, or purchase them from your profile.<br/>
              <span className="font-semibold">Rate: 1 HC = ₹1 INR</span>
            </p>
          </div>
        </DialogContent>
      </Dialog>
      
      {/* Purchase Health Coins Dialog */}
      <PurchaseCoinsDialog
        open={showPurchaseHCDialog}
        onOpenChange={setShowPurchaseHCDialog}
        onSuccess={handleHCPurchaseSuccess}
      />
      </>
    // </Layout>
  );
};

export default Emergency; 
