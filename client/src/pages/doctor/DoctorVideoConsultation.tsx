import { useAuth } from "@/auth/AuthProvider";
import MainLayout from "@/components/layout/MainLayoutdoctor";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import RecordingControls from "@/components/consultation/RecordingControls";
import TranscriptionViewer from "@/components/consultation/TranscriptionViewer";
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
  Brain
} from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from '@tanstack/react-query';
import api from '@/utils/api';

interface Consultation {
  id: string;
  patient: string;
  time: string;
  duration: string;
  type: string;
  status: string;
  date?: string;
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
  const [roomId, setRoomId] = useState("");
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [selectedConsultationForRecording, setSelectedConsultationForRecording] = useState<any>(null);
  const [showTranscriptionDialog, setShowTranscriptionDialog] = useState(false);
  const [selectedRecording, setSelectedRecording] = useState<any>(null);

  // Fetch video consultation stats
  const { data: stats = { todaysConsultations: 0, totalHours: 0, activePatients: 0, avgDuration: 0 }, isLoading: statsLoading } = useQuery({
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
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Fetch upcoming consultations
  const { data: upcomingConsultations = [], isLoading: upcomingLoading } = useQuery({
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
    staleTime: 2 * 60 * 1000, // 2 minutes
  });

  // Fetch recent consultations
  const { data: recentConsultations = [], isLoading: recentLoading } = useQuery({
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
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const handleStartConsultation = (consultation: any) => {
    const baseUrl = import.meta.env.VITE_MIROTALK_URL || 'http://mediqzy.com:3010';
    const meetingUrl = `${baseUrl}/join/${consultation.id}?name=${encodeURIComponent(currentDoctor?.name || 'Doctor')}`;
    
    window.open(meetingUrl, '_blank');
    
    toast({
      title: "Starting Video Call",
      description: `Connecting to ${consultation.patient}...`,
    });
  };

  const handleJoinRoom = () => {
    if (!roomId) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Please enter a room ID",
      });
      return;
    }
    
    const baseUrl = import.meta.env.VITE_MIROTALK_URL || 'http://mediqzy.com:3010';
    const meetingUrl = `${baseUrl}/join/${roomId}?name=${encodeURIComponent(currentDoctor?.name || 'Doctor')}`;
    window.open(meetingUrl, '_blank');
    
    toast({
      title: "Joining Meeting",
      description: "Opening video consultation...",
    });
  };

  const handleQuickStart = () => {
    const quickRoomId = `dr-${currentDoctor?.id}-${Date.now()}`;
    const baseUrl = import.meta.env.VITE_MIROTALK_URL || 'http://mediqzy.com:3010';
    const meetingUrl = `${baseUrl}/join/${quickRoomId}?name=${encodeURIComponent(currentDoctor?.name || 'Doctor')}`;
    window.open(meetingUrl, '_blank');
    
    toast({
      title: "Starting Quick Call",
      description: "Opening video room...",
    });
  };

  const handleRecordingComplete = (recording: any) => {
    setSelectedRecording(recording);
    setShowTranscriptionDialog(true);
    toast({
      title: "🎉 AI Analysis Complete!",
      description: "View transcription and AI-generated prescription",
    });
  };

  const handleImportPrescription = (prescriptionData: any) => {
    // Store in localStorage for prescription page to pick up
    localStorage.setItem('importedPrescription', JSON.stringify(prescriptionData));
    navigate('/doctor/prescriptions');
  };

  return (
    <MainLayout>
      <div className="min-h-screen">
        <div className="max-w-7xl mx-auto space-y-8">
          {/* Header */}
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold primary-grad">
                Video Consultations
              </h1>
              <p className="text-muted-foreground mt-1">Connect with your patients virtually</p>
            </div>
            <Button onClick={handleQuickStart} size="lg" className="gap-2">
              <Video className="h-5 w-5" />
              Quick Start
            </Button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {statsLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <Card key={i}>
                  <CardHeader className="pb-3">
                    <div className="h-4 bg-muted rounded animate-pulse" />
                  </CardHeader>
                  <CardContent>
                    <div className="h-8 bg-muted rounded animate-pulse mb-2" />
                    <div className="h-3 bg-muted rounded animate-pulse w-2/3" />
                  </CardContent>
                </Card>
              ))
            ) : (
              <>
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Today's Consultations
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{stats.todaysConsultations}</div>
                    <p className="text-xs text-green-500">+2 from yesterday</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Total Hours
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{stats.totalHours}h</div>
                    <p className="text-xs text-blue-500">This month</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Active Patients
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{stats.activePatients}</div>
                    <p className="text-xs text-purple-500">This week</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Avg Duration
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{stats.avgDuration}min</div>
                    <p className="text-xs text-yellow-500">Per session</p>
                  </CardContent>
                </Card>
              </>
            )}
          </div>

          {/* Join Room */}
          <Card>
            <CardHeader>
              <CardTitle>Join Consultation Room</CardTitle>
              <CardDescription>
                Enter a room ID to join an existing consultation
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-4">
                <div className="flex-1">
                  <Label htmlFor="roomId">Room ID</Label>
                  <Input
                    id="roomId"
                    placeholder="Enter room ID or meeting link"
                    value={roomId}
                    onChange={(e) => setRoomId(e.target.value)}
                  />
                </div>
                <div className="flex items-end">
                  <Button onClick={handleJoinRoom}>Join Room</Button>
                </div>
              </div>
              <div className="flex gap-2 mt-4">
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
                <Button variant="outline" size="sm">
                  <Settings className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* AI Recording & Transcription Demo */}
          <Card className="border-purple-200 bg-gradient-to-r from-purple-50 to-blue-50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Brain className="h-5 w-5 text-purple-600" />
                AI-Powered Consultation Recording
              </CardTitle>
              <CardDescription>
                Record consultations with automatic AI transcription and prescription generation
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="p-4 bg-white">
                  <div className="flex items-center gap-3">
                    <FileVideo className="h-8 w-8 text-purple-600" />
                    <div>
                      <p className="font-semibold">Auto Recording</p>
                      <p className="text-xs text-muted-foreground">Start/stop with one click</p>
                    </div>
                  </div>
                </Card>
                <Card className="p-4 bg-white">
                  <div className="flex items-center gap-3">
                    <Brain className="h-8 w-8 text-blue-600" />
                    <div>
                      <p className="font-semibold">AI Transcription</p>
                      <p className="text-xs text-muted-foreground">Whisper AI powered</p>
                    </div>
                  </div>
                </Card>
                <Card className="p-4 bg-white">
                  <div className="flex items-center gap-3">
                    <MessageSquare className="h-8 w-8 text-green-600" />
                    <div>
                      <p className="font-semibold">Smart Prescription</p>
                      <p className="text-xs text-muted-foreground">Auto-extract medications</p>
                    </div>
                  </div>
                </Card>
              </div>
              
              <div className="p-4 bg-white rounded-lg border border-purple-200">
                <p className="text-sm text-muted-foreground mb-3">
                  <strong>How it works:</strong> Click "Start Recording" when consultation begins. 
                  AI automatically transcribes the conversation and extracts diagnosis, medications, 
                  lab tests, and follow-up instructions. Import directly to prescription form!
                </p>
                <Button 
                  onClick={() => navigate('/doctor/prescriptions')}
                  variant="outline" 
                  className="w-full border-purple-300 text-purple-700 hover:bg-purple-50"
                >
                  Go to Prescriptions to Test
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Upcoming Consultations */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Upcoming Consultations
              </CardTitle>
            </CardHeader>
            <CardContent>
              {upcomingLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin mr-2" />
                  <span>Loading upcoming consultations...</span>
                </div>
              ) : upcomingConsultations.length === 0 ? (
                <div className="text-center py-8">
                  <Calendar className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No upcoming consultations</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {upcomingConsultations.map((consultation) => (
                    <div
                      key={consultation.id}
                      className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent/50 transition-colors"
                    >
                      <div className="flex items-center gap-4">
                        <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                          <User className="h-6 w-6 text-primary" />
                        </div>
                        <div>
                          <h3 className="font-semibold">{consultation.patient}</h3>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground">
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
                          onClick={() => handleStartConsultation(consultation)}
                          size="sm"
                          className="gap-2"
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
                <Clock className="h-5 w-5" />
                Recent Consultations
              </CardTitle>
            </CardHeader>
            <CardContent>
              {recentLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin mr-2" />
                  <span>Loading recent consultations...</span>
                </div>
              ) : recentConsultations.length === 0 ? (
                <div className="text-center py-8">
                  <Clock className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No recent consultations</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {recentConsultations.map((consultation) => (
                    <div
                      key={consultation.id}
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                          <User className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <div>
                          <h4 className="font-medium">{consultation.patient}</h4>
                          <div className="flex items-center gap-3 text-sm text-muted-foreground">
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
              )}
            </CardContent>
          </Card>

          {/* Equipment Check */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Camera className="h-5 w-5" />
                Equipment Status
              </CardTitle>
              <CardDescription>
                Make sure your equipment is working properly before starting a call
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 border rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium">Camera</span>
                    <Badge variant="default" className="bg-green-500">Active</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">HD Webcam detected</p>
                </div>
                <div className="p-4 border rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium">Microphone</span>
                    <Badge variant="default" className="bg-green-500">Active</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">Default microphone</p>
                </div>
                <div className="p-4 border rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium">Connection</span>
                    <Badge variant="default" className="bg-green-500">Good</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">50 Mbps</p>
                </div>
              </div>
              <div className="mt-4">
                <Button variant="outline" className="w-full">
                  <Settings className="h-4 w-4 mr-2" />
                  Test Equipment
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

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
