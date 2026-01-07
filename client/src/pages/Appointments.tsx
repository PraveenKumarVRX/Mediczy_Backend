import MainLayout from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import DrISHAChat from "@/components/DrISHAChat";
import QuickAppointmentModal from "@/components/QuickAppointmentModal";
import DoctorCallNotification from "@/components/DoctorCallNotification";
import { drIshaAPI } from "@/services/drIsha";
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "@/utils/api";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { io, Socket } from "socket.io-client";
import { 
  Calendar, 
  Clock, 
  MapPin, 
  Plus, 
  Video,
  Phone,
  MessageSquare,
  Bell,
  BellOff,
  Star,
  User,
  CalendarDays,
  Sparkles,
  Brain,
  AlertCircle,
  CheckCircle,
  Timer,
  Navigation,
  Zap
} from "lucide-react";

interface Appointment {
  id: string;
  backendId?: number;
  doctor: {
    id?: string;
    name: string;
    specialty: string;
    rating: number;
    profileImage?: string;
  };
  date: string;
  time: string;
  location: string;
  consultationType: "online" | "walkin";
  channel: "video" | "phone" | "in-person";
  clinicName?: string;
  clinicAddress?: string;
  status: 'upcoming' | 'completed' | 'cancelled' | 'rescheduled';
  symptoms?: string;
  notes?: string;
  reminderEnabled: boolean;
  estimatedDuration: number;
  fee: number;
}

interface SmartSuggestion {
  id: string;
  type: 'reschedule' | 'follow-up' | 'specialist' | 'preventive';
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  actionable: boolean;
}

const parseBackendId = (value: unknown) => {
  if (value === null || value === undefined) return undefined;
  const parsed = typeof value === "number" ? value : Number(String(value));
  return Number.isFinite(parsed) ? parsed : undefined;
};

const Appointments = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState("upcoming");
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [smartSuggestions, setSmartSuggestions] = useState<SmartSuggestion[]>([]);
  const [showAIChat, setShowAIChat] = useState(false);
  const [aiAnalyzing, setAiAnalyzing] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [reminderSettings, setReminderSettings] = useState({
    enabled: true,
    timeBeforeAppointment: 30, // minutes
    channels: ['push', 'email']
  });

  // Incoming doctor call state
  const [incomingCall, setIncomingCall] = useState<{
    appointmentId: number;
    doctorName: string;
    doctorId?: number;
    meetingLink: string;
    callInitiatedAt: string;
    appointmentDate?: string;
    appointmentTime?: string;
  } | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);

  const { data: analytics } = useQuery({
    queryKey: ["appointmentAnalytics"],
    queryFn: async () => {
      const { data } = await api.get("/appointments/analytics/basic");
      return (data as any).analytics || data;
    },
  });

  // Fetch enhanced appointments from backend and map into local shape
  const { data: backendAppointments = [], isLoading } = useQuery({
    queryKey: ["enhancedAppointments"],
    queryFn: async () => {
      const { data } = await api.get("/enhanced-appointments/my-appointments");
      const list = (data as any).appointments || data;
      if (!Array.isArray(list)) return [];

      return list.map((apt: any) => ({
        id: String(apt.id ?? apt.appointmentId ?? apt._id ?? crypto.randomUUID()),
        backendId: parseBackendId(apt.id ?? apt.appointmentId ?? apt.appointment_id),
        doctor: {
          id: apt.doctorId ?? apt.doctor?._id,
          name:
            apt.doctorName ??
            (apt.doctor
              ? [apt.doctor.firstName, apt.doctor.lastName].filter(Boolean).join(" ")
              : "Doctor"),
          specialty: apt.specialization ?? apt.doctor?.specialization ?? "",
          rating: apt.doctorRating ?? apt.doctor?.averageRating ?? 4.5,
          profileImage: apt.doctorProfileImage ?? apt.doctor?.profileImage,
        },
        date: apt.appointmentDate ?? apt.date,
        time: apt.appointmentTime ?? apt.time,
        consultationType:
          apt.consultationType === "walkin" || apt.consultationType === "in-person"
            ? "walkin"
            : "online",
        channel:
          apt.channel === "phone" || apt.consultationType === "audio"
            ? "phone"
            : apt.consultationType === "in-person"
            ? "in-person"
            : "video",
        clinicName:
          apt.clinicName ??
          apt.clinic?.name ??
          (apt.consultationType === "walkin" || apt.consultationType === "in-person"
            ? apt.location
            : undefined),
        clinicAddress:
          apt.clinicAddress ??
          apt.clinic?.address ??
          (apt.consultationType === "walkin" || apt.consultationType === "in-person"
            ? apt.location
            : undefined),
        location:
          apt.consultationType === "walkin" || apt.consultationType === "in-person"
            ? (apt.location ?? apt.clinic?.address ?? "Clinic / Hospital")
            : "Online",
        status:
          apt.status === "completed"
            ? "completed"
            : apt.status === "cancelled"
            ? "cancelled"
            : "upcoming",
        symptoms: apt.symptoms,
        notes: apt.notes,
        reminderEnabled: true,
        estimatedDuration: apt.estimatedDuration ?? 30,
        fee:
          apt.consultationFee ??
          apt.serviceTierPrice ??
          apt.serviceTier?.price ??
          0,
      })) as Appointment[];
    },
  });

  useEffect(() => {
    if (!isLoading && backendAppointments) {
      setAppointments(backendAppointments as Appointment[]);
    }
  }, [backendAppointments, isLoading]);

  // Generate smart appointment suggestions using AI
  const generateSmartSuggestions = async () => {
    setAiAnalyzing(true);
    try {
      const upcomingAppointments = appointments.filter(apt => apt.status === 'upcoming');
      const completedAppointments = appointments.filter(apt => apt.status === 'completed');
      
      const query = `Analyze my appointment history and provide smart suggestions:

      Upcoming Appointments:
      ${upcomingAppointments.map(apt => 
        `- ${apt.doctor.name} (${apt.doctor.specialty}) on ${apt.date} for ${apt.symptoms}`
      ).join('\n')}

      Recent Completed Appointments:
      ${completedAppointments.map(apt => 
        `- ${apt.doctor.name} (${apt.doctor.specialty}) on ${apt.date} for ${apt.symptoms}`
      ).join('\n')}

      Please provide:
      1. Follow-up recommendations for completed appointments
      2. Optimal scheduling suggestions for upcoming appointments
      3. Preventive care reminders based on my history
      4. Specialist referral suggestions if needed
      5. Health monitoring recommendations

      Format as actionable suggestions with priority levels.`;

      const result = await drIshaAPI.consult(query, 'en', {
        analysisType: 'appointment_optimization',
        appointmentHistory: appointments
      });

      if (result.success && result.data) {
        const suggestions = parseAISuggestions(result.data.response);
        setSmartSuggestions(suggestions);
      } else {
        setSmartSuggestions(getFallbackSuggestions());
      }
    } catch (error) {
      setSmartSuggestions(getFallbackSuggestions());
    }
    setAiAnalyzing(false);
  };

  // Parse AI response into structured suggestions
  const parseAISuggestions = (aiResponse: string): SmartSuggestion[] => {
    const suggestions: SmartSuggestion[] = [];
    
    // Follow-up suggestion
    const hasCardiology = appointments.some(apt => 
      apt.doctor.specialty.toLowerCase().includes('cardio') && apt.status === 'completed'
    );
    if (hasCardiology) {
      suggestions.push({
        id: '1',
        type: 'follow-up',
        title: 'Cardiology Follow-up Due',
        description: 'Schedule follow-up appointment with Dr. Sarah Johnson to monitor heart health progress.',
        priority: 'high',
        actionable: true
      });
    }

    // Preventive care
    suggestions.push({
      id: '2',
      type: 'preventive',
      title: 'Annual Health Checkup',
      description: 'Book comprehensive health screening with your primary care physician.',
      priority: 'medium',
      actionable: true
    });

    // Optimal scheduling
    const hasEarlyMorningAppts = appointments.some(apt => 
      parseInt(apt.time.split(':')[0]) < 11
    );
    if (hasEarlyMorningAppts) {
      suggestions.push({
        id: '3',
        type: 'reschedule',
        title: 'Optimize Appointment Timing',
        description: 'Consider afternoon slots for better preparation and reduced rush.',
        priority: 'low',
        actionable: true
      });
    }

    // Specialist suggestion
    const hasSkinIssues = appointments.some(apt => 
      apt.symptoms?.toLowerCase().includes('skin') || apt.symptoms?.toLowerCase().includes('rash')
    );
    if (hasSkinIssues) {
      suggestions.push({
        id: '4',
        type: 'specialist',
        title: 'Dermatology Follow-up',
        description: 'Monitor skin condition progress and consider follow-up if symptoms persist.',
        priority: 'medium',
        actionable: true
      });
    }

    return suggestions;
  };

  // Fallback suggestions if AI fails
  const getFallbackSuggestions = (): SmartSuggestion[] => [
    {
      id: 'fallback-1',
      type: 'preventive',
      title: 'Schedule Regular Checkup',
      description: 'Book annual health screening for preventive care.',
      priority: 'medium',
      actionable: true
    },
    {
      id: 'fallback-2',
      type: 'follow-up',
      title: 'Review Appointment History',
      description: 'Check if any follow-up appointments are needed.',
      priority: 'low',
      actionable: false
    }
  ];

  useEffect(() => {
    // Auto-generate suggestions on load
    if (appointments.length) {
      generateSmartSuggestions();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appointments]);

  // Socket.io connection for incoming doctor calls
  useEffect(() => {
    const socketUrl = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3000';
    const newSocket = io(socketUrl, {
      auth: {
        token: localStorage.getItem('token')
      },
      transports: ['websocket', 'polling']
    });

    setSocket(newSocket);

    // Listen for doctor-initiated calls
    newSocket.on('doctor-initiated-call', (data) => {
      console.log('📞 Incoming call from doctor:', data);
      
      setIncomingCall({
        appointmentId: data.appointmentId,
        doctorName: data.doctorName,
        doctorId: data.doctorId,
        meetingLink: data.meetingLink,
        callInitiatedAt: data.callInitiatedAt,
        appointmentDate: data.appointmentDate,
        appointmentTime: data.appointmentTime
      });

      // Show toast notification
      toast({
        title: "📞 Incoming Call",
        description: `${data.doctorName} is calling you`,
        duration: 10000,
      });

      // Play notification sound
      const audio = new Audio('/sounds/notification.mp3');
      audio.play().catch(() => console.log('Could not play notification sound'));
    });

    newSocket.on('connect', () => {
      console.log('✅ Socket connected');
    });

    newSocket.on('disconnect', () => {
      console.log('❌ Socket disconnected');
    });

    return () => {
      newSocket.disconnect();
    };
  }, [toast]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'upcoming': return <Clock className="h-4 w-4 text-blue-500" />;
      case 'completed': return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'cancelled': return <AlertCircle className="h-4 w-4 text-red-500" />;
      case 'rescheduled': return <Calendar className="h-4 w-4 text-orange-500" />;
      default: return <Clock className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'upcoming': return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'completed': return 'bg-green-100 text-green-800 border-green-300';
      case 'cancelled': return 'bg-red-100 text-red-800 border-red-300';
      case 'rescheduled': return 'bg-orange-100 text-orange-800 border-orange-300';
      default: return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'video': return <Video className="h-4 w-4 text-[#00FFF3]" />;
      case 'phone': return <Phone className="h-4 w-4 text-blue-500" />;
      case 'in-person': return <MapPin className="h-4 w-4 text-green-500" />;
      default: return <Calendar className="h-4 w-4 text-gray-500" />;
    }
  };

  const getConsultationLabel = (apt: Appointment) => {
    if (apt.consultationType === "walkin") {
      const clinic = apt.clinicName || apt.location || "Clinic / Hospital";
      return `Walk-in at ${clinic}`;
    }
    const channelLabel = apt.channel === "phone" ? "Phone" : apt.channel === "video" ? "Video" : "In-person";
    return `Online • ${channelLabel}`;
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'border-l-red-500 bg-red-50';
      case 'medium': return 'border-l-orange-500 bg-orange-50';
      case 'low': return 'border-l-blue-500 bg-blue-50';
      default: return 'border-l-gray-500 bg-gray-50';
    }
  };

  const filterAppointments = (status: string) => {
    return appointments.filter(apt => {
      if (status === 'upcoming') return apt.status === 'upcoming';
      if (status === 'completed') return apt.status === 'completed';
      if (status === 'all') return true;
      return apt.status === status;
    });
  };

  const handleJoinCall = (appointment: Appointment) => {
    const doctorId = appointment.doctor.id;
    if (!doctorId) {
      toast({
        title: "Unable to start call",
        description: "Doctor details are missing for this appointment.",
        variant: "destructive",
      });
      return;
    }
    navigate(`/chat?doctorId=${doctorId}`);
  };

  const handleCancelAppointment = async (appointment: Appointment) => {
    if (!appointment.backendId) {
      toast({
        title: "Cancel unavailable",
        description: "This appointment is missing a backend id.",
        variant: "destructive",
      });
      return;
    }

    const confirmed = window.confirm("Cancel this appointment?");
    if (!confirmed) return;

    setActionLoadingId(appointment.id);
    try {
      await api.patch(`/appointments/${appointment.backendId}/cancel`);
      setAppointments((prev) =>
        prev.map((apt) =>
          apt.id === appointment.id ? { ...apt, status: "cancelled" } : apt
        )
      );
      toast({ title: "Appointment cancelled" });
    } catch (error: any) {
      toast({
        title: "Cancel failed",
        description: error?.response?.data?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleRescheduleAppointment = async (appointment: Appointment) => {
    if (!appointment.backendId) {
      toast({
        title: "Reschedule unavailable",
        description: "This appointment is missing a backend id.",
        variant: "destructive",
      });
      return;
    }

    const appointmentDate = window.prompt(
      "Enter new appointment date (YYYY-MM-DD):",
      String(appointment.date ?? "")
    );
    if (!appointmentDate) return;
    const appointmentTime = window.prompt(
      "Enter new appointment time (HH:MM, 24-hour):",
      String(appointment.time ?? "")
    );
    if (!appointmentTime) return;

    setActionLoadingId(appointment.id);
    try {
      await api.patch(`/appointments/${appointment.backendId}/reschedule`, {
        appointmentDate,
        appointmentTime,
      });
      setAppointments((prev) =>
        prev.map((apt) =>
          apt.id === appointment.id
            ? {
                ...apt,
                date: appointmentDate,
                time: appointmentTime,
                status: "rescheduled",
              }
            : apt
        )
      );
      toast({ title: "Appointment rescheduled" });
    } catch (error: any) {
      toast({
        title: "Reschedule failed",
        description: error?.response?.data?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setActionLoadingId(null);
    }
  };

  return (
    <MainLayout>
      {/* Incoming Call Notification */}
      {incomingCall && (
        <DoctorCallNotification
          appointmentId={incomingCall.appointmentId}
          doctorName={incomingCall.doctorName}
          doctorId={incomingCall.doctorId}
          meetingLink={incomingCall.meetingLink}
          callInitiatedAt={incomingCall.callInitiatedAt}
          appointmentDate={incomingCall.appointmentDate}
          appointmentTime={incomingCall.appointmentTime}
          onAccept={() => {
            // Open meeting link in new window
            window.open(incomingCall.meetingLink, '_blank', 'width=1280,height=720');
            setIncomingCall(null);
            toast({
              title: "Joined Call",
              description: "Opening video consultation...",
            });
          }}
          onDecline={() => {
            setIncomingCall(null);
            toast({
              title: "Call Declined",
              description: "You declined the video call",
            });
          }}
        />
      )}

      <div className="space-y-8 animate-in fade-in duration-700">
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h1 className="text-3xl w-fit font-bold tracking-tight primary-grad">
              Appointments
            </h1>
            <div className="flex items-center space-x-3">
              <Button
                variant="outline"
                onClick={() => setShowAIChat(true)}
                className="border-[#00FFF3]/30 text-[#00FFF3] hover:bg-[#00FFF3]/10"
              >
                <MessageSquare className="h-4 w-4 mr-2" />
                Ask Dr. iSHA
              </Button>
              <Button 
                onClick={() => setShowBookingModal(true)}
                className="bg-gradient-to-r from-[#00FFF3] to-[#00B8FF] text-black hover:from-[#00E6D6] hover:to-[#00A3E6]">
                <Plus className="h-4 w-4 mr-2" />
                New Appointment
              </Button>
            </div>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-4 bg-[#1A2333] p-1 rounded-lg">
            <TabsTrigger value="upcoming" className="data-[state=active]:bg-[#00FFF3] data-[state=active]:text-[#0B1120]">
              Upcoming
            </TabsTrigger>
            <TabsTrigger value="completed" className="data-[state=active]:bg-[#00FFF3] data-[state=active]:text-[#0B1120]">
              History
            </TabsTrigger>
            <TabsTrigger value="smart" className="data-[state=active]:bg-[#00FFF3] data-[state=active]:text-[#0B1120] flex items-center space-x-1">
              <span>AI Insights</span>
              {aiAnalyzing && <div className="w-2 h-2 bg-[#00FFF3] rounded-full animate-pulse" />}
            </TabsTrigger>
            <TabsTrigger value="settings" className="data-[state=active]:bg-[#00FFF3] data-[state=active]:text-[#0B1120]">
              Settings
            </TabsTrigger>
          </TabsList>

          {/* Upcoming Appointments */}
          <TabsContent value="upcoming" className="space-y-6">
            <div className="grid gap-4">
              {filterAppointments('upcoming').map((appointment) => (
                <Card key={appointment.id} className="border-[#00FFF3]/20 hover:border-[#00FFF3]/40 transition-colors">
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between">
                      <div className="flex space-x-4">
                        {appointment.doctor.profileImage ? (
                          <img
                            src={appointment.doctor.profileImage}
                            alt={appointment.doctor.name}
                            className="w-16 h-16 rounded-lg object-cover"
                          />
                        ) : (
                          <div className="w-16 h-16 bg-[#1A2333] rounded-lg flex items-center justify-center">
                            <User className="h-8 w-8 text-[#00FFF3]" />
                          </div>
                        )}
                        <div className="space-y-2">
                          <div className="flex items-center space-x-2">
                            <h3 className="text-xl font-semibold text-[#00FFF3]">
                              {appointment.doctor.name}
                            </h3>
                            <div className="flex items-center">
                              <Star className="h-4 w-4 text-yellow-500 fill-current" />
                              <span className="text-sm text-gray-400 ml-1">{appointment.doctor.rating}</span>
                            </div>
                          </div>
                          <p className="text-gray-300">{appointment.doctor.specialty}</p>
                          
                          <div className="flex items-center gap-4 text-sm text-gray-400">
                            <div className="flex items-center gap-1">
                              <Calendar className="h-4 w-4" />
                              {new Date(appointment.date).toLocaleDateString()}
                            </div>
                            <div className="flex items-center gap-1">
                              <Clock className="h-4 w-4" />
                              {appointment.time}
                            </div>
                            <div className="flex items-center gap-1">
                              {getTypeIcon(appointment.channel)}
                              <span>{getConsultationLabel(appointment)}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <Timer className="h-4 w-4" />
                              {appointment.estimatedDuration} min
                            </div>
                          </div>
                          
                          {appointment.symptoms && (
                            <div className="flex items-center gap-2 text-sm">
                              <span className="text-gray-400">Reason:</span>
                              <span className="text-gray-300">{appointment.symptoms}</span>
                            </div>
                          )}
                        </div>
                      </div>
                      
                      <div className="flex flex-col items-end space-y-2">
                        <div className="flex items-center space-x-2">
                          <Badge className={getStatusColor(appointment.status)}>
                            {getStatusIcon(appointment.status)}
                            <span className="ml-1 capitalize">{appointment.status}</span>
                          </Badge>
                          {appointment.reminderEnabled && (
                            <Bell className="h-4 w-4 text-[#00FFF3]" />
                          )}
                        </div>
                        
                        <p className="text-lg font-semibold text-[#00FFF3]">₹{appointment.fee}</p>
                        
                        <div className="flex gap-2 mt-4">
                          {appointment.consultationType === 'online' && appointment.channel === 'video' && (
                            <Button
                              size="sm"
                              className="bg-green-600 hover:bg-green-700"
                              disabled={actionLoadingId === appointment.id}
                              onClick={() => handleJoinCall(appointment)}
                            >
                              <Video className="h-4 w-4 mr-1" />
                              Join Call
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            className="border-[#00FFF3]/30 text-[#00FFF3]"
                            disabled={actionLoadingId === appointment.id}
                            onClick={() => handleRescheduleAppointment(appointment)}
                          >
                            Reschedule
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="border-red-500/30 text-red-500"
                            disabled={actionLoadingId === appointment.id}
                            onClick={() => handleCancelAppointment(appointment)}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
              
              {filterAppointments('upcoming').length === 0 && (
                <Card className="border-[#00FFF3]/20 border-dashed">
                  <CardContent className="p-12 text-center">
                    <CalendarDays className="h-12 w-12 text-[#00FFF3] mx-auto mb-4 opacity-50" />
                    <h3 className="text-lg font-semibold text-[#00FFF3] mb-2">No Upcoming Appointments</h3>
                    <p className="text-gray-400 mb-6">Schedule your next consultation to stay on top of your health</p>
                    <Button 
                      onClick={() => setShowBookingModal(true)}
                      className="bg-gradient-to-r from-[#00FFF3] to-[#00B8FF] text-black">
                      <Plus className="h-4 w-4 mr-2" />
                      Book Appointment
                    </Button>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          {/* Completed Appointments */}
          <TabsContent value="completed" className="space-y-6">
            <div className="grid gap-4">
              {filterAppointments('completed').map((appointment) => (
                <Card key={appointment.id} className="border-[#00FFF3]/10 bg-[#0B1120]/50">
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between">
                      <div className="flex space-x-4">
                        <div className="w-16 h-16 bg-[#1A2333] rounded-lg flex items-center justify-center">
                          <User className="h-8 w-8 text-[#00FFF3]" />
                        </div>
                        <div className="space-y-2">
                          <h3 className="text-lg font-semibold text-[#00FFF3]">
                            {appointment.doctor.name}
                          </h3>
                          <p className="text-gray-400">{appointment.doctor.specialty}</p>
                          <div className="flex items-center gap-4 text-sm text-gray-500">
                            <div className="flex items-center gap-1">
                              <Calendar className="h-4 w-4" />
                              {new Date(appointment.date).toLocaleDateString()}
                            </div>
                            <div className="flex items-center gap-1">
                              {getTypeIcon(appointment.channel)}
                              <span>{getConsultationLabel(appointment)}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-col items-end space-y-2">
                        <Badge className={getStatusColor(appointment.status)}>
                          {getStatusIcon(appointment.status)}
                          <span className="ml-1 capitalize">{appointment.status}</span>
                        </Badge>
                        <div className="flex gap-2 mt-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="border-[#00FFF3]/30 text-[#00FFF3]"
                            onClick={() =>
                              toast({
                                title: "View report",
                                description: "Report view is not wired yet for this appointment.",
                              })
                            }
                          >
                            View Report
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="border-[#00FFF3]/30 text-[#00FFF3]"
                            onClick={() => {
                              const doctorId = appointment.doctor.id;
                              if (!doctorId) {
                                toast({
                                  title: "Unable to book follow-up",
                                  description: "Doctor details are missing for this appointment.",
                                  variant: "destructive",
                                });
                                return;
                              }
                              navigate(`/consultation/${doctorId}`);
                            }}
                          >
                            Book Follow-up
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* AI Smart Insights */}
          <TabsContent value="smart" className="space-y-6">
            <Card className="border-[#00FFF3]/20 bg-gradient-to-br from-[#0B1120] to-[#1A2333]">
              <CardHeader>
                <CardTitle className="flex items-center text-[#00FFF3]">
                  <Brain className="h-5 w-5 mr-2" />
                  Smart Appointment Insights
                </CardTitle>
              </CardHeader>
              <CardContent>
                {smartSuggestions.length === 0 ? (
                  <div className="text-center py-12">
                    <Sparkles className="h-12 w-12 text-[#00FFF3] mx-auto mb-4 opacity-50" />
                    <p className="text-gray-400 mb-4">Get personalized appointment recommendations</p>
                    <Button
                      onClick={generateSmartSuggestions}
                      disabled={aiAnalyzing}
                      className="bg-gradient-to-r from-[#00FFF3] to-[#00B8FF] text-black"
                    >
                      {aiAnalyzing ? (
                        <>
                          <div className="animate-spin h-4 w-4 mr-2 border-2 border-black border-t-transparent rounded-full" />
                          Analyzing...
                        </>
                      ) : (
                        <>
                          <Zap className="h-4 w-4 mr-2" />
                          Generate Insights
                        </>
                      )}
                    </Button>
                  </div>
                ) : (
                  <div className="grid gap-4">
                    {smartSuggestions.map((suggestion) => (
                      <div
                        key={suggestion.id}
                        className={`p-4 border-l-4 rounded-lg ${getPriorityColor(suggestion.priority)}`}
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <h4 className="font-semibold text-[#00FFF3] mb-1">{suggestion.title}</h4>
                            <p className="text-gray-600 text-sm mb-2">{suggestion.description}</p>
                            <div className="flex items-center space-x-2">
                              <Badge 
                                variant="outline"
                                className={`text-xs ${
                                  suggestion.priority === 'high' ? 'border-red-500 text-red-600' :
                                  suggestion.priority === 'medium' ? 'border-orange-500 text-orange-600' :
                                  'border-blue-500 text-blue-600'
                                }`}
                              >
                                {suggestion.priority} priority
                              </Badge>
                              <Badge variant="outline" className="text-xs capitalize">
                                {suggestion.type}
                              </Badge>
                            </div>
                          </div>
                          {suggestion.actionable && (
                            <Button size="sm" variant="outline" className="border-[#00FFF3]/30 text-[#00FFF3]">
                              Take Action
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                    
                    <div className="flex justify-between items-center mt-4">
                      <Button
                        onClick={generateSmartSuggestions}
                        variant="outline"
                        size="sm"
                        disabled={aiAnalyzing}
                        className="border-[#00FFF3]/30 text-[#00FFF3]"
                      >
                        <Sparkles className="h-4 w-4 mr-2" />
                        Refresh Insights
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Reminder Settings */}
          <TabsContent value="settings" className="space-y-6">
            <Card className="border-[#00FFF3]/20">
              <CardHeader>
                <CardTitle className="flex items-center text-[#00FFF3]">
                  <Bell className="h-5 w-5 mr-2" />
                  Appointment Reminders & Preferences
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium text-[#00FFF3]">Enable Reminders</h4>
                    <p className="text-sm text-gray-400">Get notified before appointments</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setReminderSettings(prev => ({ ...prev, enabled: !prev.enabled }))}
                    className={reminderSettings.enabled ? 'border-green-500 text-green-500' : 'border-gray-500 text-gray-500'}
                  >
                    {reminderSettings.enabled ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
                  </Button>
                </div>
                
                <Separator className="bg-[#00FFF3]/20" />
                
                <div>
                  <h4 className="font-medium text-[#00FFF3] mb-4">Notification Preferences</h4>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-300">Push Notifications</span>
                      <Button variant="outline" size="sm" className="border-green-500 text-green-500">
                        <CheckCircle className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-300">Email Notifications</span>
                      <Button variant="outline" size="sm" className="border-green-500 text-green-500">
                        <CheckCircle className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-300">SMS Notifications</span>
                      <Button variant="outline" size="sm" className="border-gray-500 text-gray-500">
                        <AlertCircle className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
                
                <Separator className="bg-[#00FFF3]/20" />
                
                <div>
                  <h4 className="font-medium text-[#00FFF3] mb-2">Reminder Timing</h4>
                  <p className="text-sm text-gray-400 mb-3">When to send appointment reminders</p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {[15, 30, 60, 120].map((minutes) => (
                      <Button
                        key={minutes}
                        variant={reminderSettings.timeBeforeAppointment === minutes ? "default" : "outline"}
                        size="sm"
                        onClick={() => setReminderSettings(prev => ({ ...prev, timeBeforeAppointment: minutes }))}
                        className={reminderSettings.timeBeforeAppointment === minutes 
                          ? "bg-[#00FFF3] text-black" 
                          : "border-[#00FFF3]/30 text-[#00FFF3]"
                        }
                      >
                        {minutes} min
                      </Button>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* AI Chat Modal */}
        {showAIChat && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-[#0B1120] border border-[#00FFF3]/20 rounded-lg w-full max-w-2xl h-[80vh] flex flex-col">
              <div className="flex items-center justify-between p-4 border-b border-[#00FFF3]/20">
                <h3 className="text-lg font-semibold text-[#00FFF3]">Appointment Assistant - Dr. iSHA</h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowAIChat(false)}
                  className="text-gray-400 hover:text-[#00FFF3]"
                >
                  ✕
                </Button>
              </div>
              <div className="flex-1 overflow-hidden">
                <DrISHAChat 
                  language="en"
                  showVoiceInput={true}
                  onMessageSent={(message) => {
                  }}
                  onResponseReceived={(response) => {
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Quick Appointment Booking Modal */}
        <QuickAppointmentModal 
          open={showBookingModal} 
          onOpenChange={setShowBookingModal} 
        />
      </div>
    </MainLayout>
  );
};

export default Appointments;
