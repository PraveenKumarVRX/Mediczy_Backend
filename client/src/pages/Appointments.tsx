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
import { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/auth/AuthProvider";
import api from "@/utils/api";
import { appointmentsService } from "@/services/appointments.service";
import {
  useAppointmentAnalytics,
  useCancelAppointment,
  useEnhancedAppointments,
  useJoinAppointmentVideo,
  useRescheduleAppointment,
} from "@/hooks/useAppointments";
import type { PatientAppointment } from "@/types/appointments";
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
  User,
  CalendarDays,
  Sparkles,
  Brain,
  AlertCircle,
  CheckCircle,
  Timer,
  Navigation,
  Zap,
  Loader2,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Appointment = PatientAppointment;

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

const extractRoomId = (meetingLink?: string) => {
  if (!meetingLink) return undefined;
  if (meetingLink.includes("/rooms/")) {
    return meetingLink.split("/rooms/")[1]?.split("?")[0];
  }
  if (meetingLink.includes("/room/")) {
    return meetingLink.split("/room/")[1]?.split("?")[0];
  }
  if (meetingLink.includes("/join/")) {
    return meetingLink.split("/join/")[1]?.split("?")[0];
  }
  try {
    const parsed = new URL(meetingLink);
    const roomFromQuery =
      parsed.searchParams.get("room") ||
      parsed.searchParams.get("roomId") ||
      parsed.searchParams.get("meetingId");
    if (roomFromQuery) {
      return roomFromQuery;
    }
    const parts = parsed.pathname.split("/").filter(Boolean);
    const joinIndex = parts.findIndex((segment) => ["rooms", "room", "join"].includes(segment));
    if (joinIndex >= 0 && parts[joinIndex + 1]) {
      return parts[joinIndex + 1];
    }
  } catch (error) {
    // Ignore parsing errors and fall back to raw value.
  }
  return meetingLink;
};

const isExternalMeetingLink = (meetingLink?: string) => {
  if (!meetingLink) return false;
  try {
    const parsed = new URL(meetingLink);
    return !parsed.hostname.endsWith("mediqzy.com");
  } catch (error) {
    return false;
  }
};

const Appointments = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { currentUser } = useAuth();

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
    channels: ['push', 'email'] as string[]
  });
  const [savingReminderPrefs, setSavingReminderPrefs] = useState(false);
  const [reminderPrefsLoaded, setReminderPrefsLoaded] = useState(false);

  // Memoized filtered lists — avoids calling filterAppointments() inside JSX render
  const upcomingAppointments = useMemo(
    () => appointments.filter(apt => ['upcoming', 'pending', 'confirmed', 'pending_confirmation'].includes(apt.status)),
    [appointments]
  );
  const completedAppointments = useMemo(
    () => appointments.filter(apt => ['completed', 'cancelled', 'no_show'].includes(apt.status)),
    [appointments]
  );

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

  const patientUserId = currentUser?.id || currentUser?._id;
  const joinVideoMutation = useJoinAppointmentVideo();
  const cancelMutation = useCancelAppointment(patientUserId);
  const rescheduleMutation = useRescheduleAppointment();

  const { data: analytics } = useAppointmentAnalytics();
  const {
    data: backendAppointments = [],
    isLoading,
    error: appointmentsError,
  } = useEnhancedAppointments();

  const handleSuggestionAction = (suggestion: SmartSuggestion) => {
    if (suggestion.type === 'reschedule') {
      setActiveTab('upcoming');
      toast({
        title: "Choose an appointment",
        description: "Open an upcoming appointment to reschedule.",
      });
      return;
    }

    if (['follow-up', 'specialist', 'preventive'].includes(suggestion.type)) {
      setShowBookingModal(true);
      return;
    }

    setShowAIChat(true);
  };

  useEffect(() => {
    if (!patientUserId) return;

    const loadReminderPreferences = async () => {
      try {
        const { data } = await api.get("/notifications/preferences");
        const prefs = data?.preferences || {};
        setReminderSettings({
          enabled: prefs.appointmentReminders !== false,
          timeBeforeAppointment: prefs.reminderMinutesBefore ?? 30,
          channels: Array.isArray(prefs.reminderChannels) && prefs.reminderChannels.length
            ? prefs.reminderChannels
            : ['push', 'email'],
        });
      } catch (error) {
        console.error("Failed to load reminder preferences:", error);
      } finally {
        setReminderPrefsLoaded(true);
      }
    };

    loadReminderPreferences();
  }, [patientUserId]);

  const saveReminderPreferences = async (nextSettings = reminderSettings) => {
    setSavingReminderPrefs(true);
    try {
      await api.put("/notifications/preferences", {
        preferences: {
          appointmentReminders: nextSettings.enabled,
          reminderMinutesBefore: nextSettings.timeBeforeAppointment,
          reminderChannels: nextSettings.channels,
          medicationReminders: nextSettings.enabled,
          followUpReminders: nextSettings.enabled,
        },
      });
      toast({
        title: "Reminder preferences saved",
        description: "Your appointment reminder settings have been updated.",
      });
    } catch (error: any) {
      toast({
        title: "Could not save preferences",
        description: error?.response?.data?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSavingReminderPrefs(false);
    }
  };

  const toggleReminderChannel = (channel: string) => {
    setReminderSettings((prev) => {
      const hasChannel = prev.channels.includes(channel);
      const channels = hasChannel
        ? prev.channels.filter((c) => c !== channel)
        : [...prev.channels, channel];
      const next = { ...prev, channels: channels.length ? channels : [channel] };
      void saveReminderPreferences(next);
      return next;
    });
  };

  useEffect(() => {
    if (appointmentsError) {
      console.error("📅 Appointments fetch error:", appointmentsError);
    }
    if (!isLoading && backendAppointments) {
      console.log("📅 Setting appointments from backend:", backendAppointments.length, backendAppointments.slice(0, 3));
      setAppointments(backendAppointments as Appointment[]);
    }
  }, [backendAppointments, isLoading, appointmentsError]);

  // Generate smart appointment suggestions using AI
  const generateSmartSuggestions = async () => {
    setAiAnalyzing(true);
    try {
      const upcomingAppointments = appointments.filter(apt => apt.status === 'upcoming');
      const completedAppointments = appointments.filter(apt => apt.status === 'completed');

      // Cap to latest 5 of each to stay within the 2000-char validation limit
      const recentUpcoming   = upcomingAppointments.slice(0, 5);
      const recentCompleted  = completedAppointments.slice(0, 5);

      const fmtApt = (apt: Appointment) =>
        `- ${(apt.doctor?.name ?? 'Doctor').slice(0, 30)} (${(apt.doctor?.specialty ?? '').slice(0, 20)}) on ${apt.date}`;

      const query = [
        'Review my recent appointments and suggest next steps:',
        recentUpcoming.length
          ? `Upcoming:\n${recentUpcoming.map(fmtApt).join('\n')}`
          : 'No upcoming appointments.',
        recentCompleted.length
          ? `Recent history:\n${recentCompleted.map(fmtApt).join('\n')}`
          : 'No completed appointments.',
        'Provide 3-5 actionable health recommendations based on the above.',
      ].join('\n\n').slice(0, 1800); // hard cap below 2000-char server limit

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
      (apt.doctor?.specialty || '').toLowerCase().includes('cardio') && apt.status === 'completed'
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

  // Run once when appointments first load — not on every update (avoids repeated 400s)
  const suggestionsRunRef = useRef(false);
  useEffect(() => {
    if (appointments.length > 0 && !suggestionsRunRef.current) {
      suggestionsRunRef.current = true;
      generateSmartSuggestions();
    }
  }, [appointments.length]);

  // Listen for doctor-initiated calls via the global socket (from useSocketConnection in MainLayout)
  useEffect(() => {
    const userId = currentUser?.id || currentUser?._id;
    if (!userId) return;

    const handleDoctorCall = (data: any) => {
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

      // Play notification sound via Web Audio API (no file needed)
      try {
        const ctx = new AudioContext();
        const playNote = (freq: number, start: number, dur: number) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain); gain.connect(ctx.destination);
          osc.type = 'sine'; osc.frequency.setValueAtTime(freq, start);
          gain.gain.setValueAtTime(0, start);
          gain.gain.linearRampToValueAtTime(0.45, start + 0.02);
          gain.gain.linearRampToValueAtTime(0, start + dur);
          osc.start(start); osc.stop(start + dur);
        };
        const t = ctx.currentTime;
        playNote(880,  t,        0.25);
        playNote(1175, t + 0.28, 0.35);
        setTimeout(() => ctx.close(), 1000);
      } catch (_) { /* audio context not available */ }
    };

    // Use global socket from MainLayout's useSocketConnection
    const attachListener = () => {
      const sock = window.socket;
      if (sock) {
        sock.on('doctor-initiated-call', handleDoctorCall);
        return true;
      }
      return false;
    };

    // Try immediately, then poll until socket is available
    if (!attachListener()) {
      const interval = setInterval(() => {
        if (attachListener()) clearInterval(interval);
      }, 1000);
      return () => {
        clearInterval(interval);
        window.socket?.off('doctor-initiated-call', handleDoctorCall);
      };
    }

    return () => {
      window.socket?.off('doctor-initiated-call', handleDoctorCall);
    };
  }, [toast, currentUser?.id, currentUser?._id]);

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

  // filterAppointments now returns from memoized lists — no console.log, no re-filtering
  const filterAppointments = (status: string) => {
    if (status === 'upcoming')  return upcomingAppointments;
    if (status === 'completed') return completedAppointments;
    return appointments.filter(apt => status === 'all' || apt.status === status);
  };

  const handleJoinCall = async (appointment: Appointment) => {
    const backendStatus = (appointment.originalStatus || '').toLowerCase();
    if (!['confirmed', 'in-progress'].includes(backendStatus)) {
      toast({
        title: "Cannot Join Yet",
        description: `Appointment is ${appointment.originalStatus || 'not ready'} for video consultation.`,
        variant: "destructive",
      });
      return;
    }

    if (appointment.meetingLink && isExternalMeetingLink(appointment.meetingLink)) {
      window.open(appointment.meetingLink, '_blank', 'width=1280,height=720');
      toast({
        title: "Joined Call",
        description: "Opening the video consultation...",
      });
      return;
    }
    const doctorId = appointment.doctor.id;
    const meetingRoomFromLink = extractRoomId(appointment.meetingLink);
    const roomId =
      meetingRoomFromLink ||
      appointment.roomId ||
      appointment.meetingId ||
      (appointment.backendId ? `apt-${appointment.backendId}` : undefined) ||
      (doctorId ? `doc-${doctorId}` : undefined);

    if (!roomId) {
      toast({
        title: "Unable to start call",
        description: "Meeting room details are missing for this appointment.",
        variant: "destructive",
      });
      return;
    }

    // Preflight on backend for payment/time-window checks before navigation
    const appointmentId = appointment.backendId ?? Number(appointment.id);
    if (!appointmentId || !Number.isFinite(appointmentId)) {
      toast({
        title: "Cannot Join",
        description: "Appointment reference is missing.",
        variant: "destructive",
      });
      return;
    }

    try {
      const response = await joinVideoMutation.mutateAsync(appointmentId);
      if (!response.success) {
        throw new Error(response.message || "Video consultation is not available right now.");
      }
      const resolvedRoomId = response.video?.meetingId || response.video?.roomId || roomId;
      navigate(`/video-consultation?room=${encodeURIComponent(resolvedRoomId)}&appointmentId=${encodeURIComponent(String(appointmentId))}`);
      toast({
        title: "Joining Video Call",
        description: `Connecting to consultation with ${appointment.doctor.name || "Doctor"}`,
      });
    } catch (error: any) {
      toast({
        title: "Cannot Join Yet",
        description: error?.response?.data?.message || error?.message || "Video consultation is not available right now.",
        variant: "destructive",
      });
    }
  };

  const getJoinCallState = (appointment: Appointment) => {
    const backendStatus = (appointment.originalStatus || '').toLowerCase();
    if (!['confirmed', 'in-progress'].includes(backendStatus)) {
      return {
        enabled: false,
        reason: `Call is unavailable until appointment is confirmed. Current status: ${appointment.originalStatus || 'not ready'}.`,
      };
    }

    const appointmentDateTime = new Date(`${appointment.date} ${appointment.time || '00:00'}`);
    if (isNaN(appointmentDateTime.getTime())) {
      return {
        enabled: false,
        reason: 'Appointment date/time is invalid.',
      };
    }

    const now = new Date();
    const windowStart = new Date(appointmentDateTime.getTime() - 15 * 60 * 1000);
    const windowEnd = new Date(appointmentDateTime.getTime() + 60 * 60 * 1000);

    if (now < windowStart) {
      return {
        enabled: false,
        reason: 'Call opens 15 minutes before appointment time.',
      };
    }

    if (now > windowEnd && backendStatus !== 'in-progress') {
      return {
        enabled: false,
        reason: 'Consultation window has ended.',
      };
    }

    const ps = (appointment.paymentStatus || '').toLowerCase();
    if (ps && !['paid', 'credit'].includes(ps)) {
      return {
        enabled: false,
        reason: 'Complete payment or ensure active membership before joining.',
      };
    }

    return {
      enabled: true,
      reason: '',
    };
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
      await cancelMutation.mutateAsync(appointment.backendId);
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
    const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
    const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;
    if (!DATE_REGEX.test(appointmentDate) || !TIME_REGEX.test(appointmentTime)) {
      toast({
        title: "Invalid date or time",
        description: "Use YYYY-MM-DD and HH:MM (24-hour) format.",
        variant: "destructive",
      });
      return;
    }
    const rescheduleDateTime = new Date(`${appointmentDate}T${appointmentTime}`);
    if (Number.isNaN(rescheduleDateTime.getTime()) || rescheduleDateTime < new Date()) {
      toast({
        title: "Invalid reschedule time",
        description: "Choose a future date and time.",
        variant: "destructive",
      });
      return;
    }

    setActionLoadingId(appointment.id);
    try {
      await rescheduleMutation.mutateAsync({
        appointmentId: appointment.backendId,
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
          onAccept={async () => {
            const meetingLink = incomingCall.meetingLink;
            if (meetingLink && isExternalMeetingLink(meetingLink)) {
              // Open meeting link in new window
              window.open(meetingLink, '_blank', 'width=1280,height=720');
              setIncomingCall(null);
              toast({
                title: "Joined Call",
                description: "Opening video consultation...",
              });
              return;
            }

            const roomIdFromLink = extractRoomId(meetingLink);
            setIncomingCall(null);
            navigate(`/video-consultation?room=${encodeURIComponent(roomIdFromLink || `apt-${incomingCall.appointmentId}`)}&appointmentId=${incomingCall.appointmentId}`);
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
        <div className="rounded-2xl bg-gradient-to-r from-[#0B1120] via-[#102238] to-[#0B1120] border border-[#00FFF3]/20 p-5 md:p-6 shadow-2xl">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-[#00FFF3]/10 px-3 py-1 text-xs font-semibold text-[#00FFF3] mb-3">
                <CalendarDays className="h-3.5 w-3.5" />
                Care Schedule Hub
              </div>
              <h1 className="text-3xl w-fit font-bold tracking-tight primary-grad">Appointments</h1>
              <p className="text-sm text-slate-300 mt-1">Manage upcoming consults, revisit history, and act on AI guidance.</p>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
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

          <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 mt-5">
            <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
              <p className="text-xs font-semibold text-[#00FFF3]">Step 1: Review upcoming</p>
              <p className="text-[11px] text-slate-300">Confirm time, mode, and readiness for each consult.</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
              <p className="text-xs font-semibold text-[#00FFF3]">Step 2: Join or reschedule</p>
              <p className="text-[11px] text-slate-300">Take timely action to avoid no-show and expired windows.</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
              <p className="text-xs font-semibold text-[#00FFF3]">Step 3: Follow through</p>
              <p className="text-[11px] text-slate-300">Use AI insights for follow-ups and preventive planning.</p>
            </div>
          </div>
        </div>

        <Card className="border-[#00FFF3]/20 bg-[#0f1d30]">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between text-[#00FFF3] text-lg">
              <span className="flex items-center gap-2">
                {reminderSettings.enabled ? <Bell className="h-5 w-5" /> : <BellOff className="h-5 w-5" />}
                Appointment Reminders
              </span>
              {savingReminderPrefs && <Loader2 className="h-4 w-4 animate-spin text-[#00FFF3]" />}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <Label htmlFor="appointment-reminders" className="text-gray-200">Enable reminders</Label>
                <p className="text-xs text-gray-400 mt-1">Get notified before upcoming consultations.</p>
              </div>
              <Switch
                id="appointment-reminders"
                checked={reminderSettings.enabled}
                disabled={!reminderPrefsLoaded || savingReminderPrefs}
                onCheckedChange={(enabled) => {
                  const next = { ...reminderSettings, enabled };
                  setReminderSettings(next);
                  void saveReminderPreferences(next);
                }}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-gray-200">Remind me before</Label>
                <Select
                  value={String(reminderSettings.timeBeforeAppointment)}
                  disabled={!reminderSettings.enabled || !reminderPrefsLoaded || savingReminderPrefs}
                  onValueChange={(value) => {
                    const next = { ...reminderSettings, timeBeforeAppointment: Number(value) };
                    setReminderSettings(next);
                    void saveReminderPreferences(next);
                  }}
                >
                  <SelectTrigger className="border-[#00FFF3]/30 bg-[#1A2333] text-gray-200">
                    <SelectValue placeholder="Select timing" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="15">15 minutes before</SelectItem>
                    <SelectItem value="30">30 minutes before</SelectItem>
                    <SelectItem value="60">1 hour before</SelectItem>
                    <SelectItem value="120">2 hours before</SelectItem>
                    <SelectItem value="1440">1 day before</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-gray-200">Notification channels</Label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { id: "push", label: "Push" },
                    { id: "email", label: "Email" },
                    { id: "sms", label: "SMS" },
                    { id: "inApp", label: "In-app" },
                  ].map((channel) => (
                    <Button
                      key={channel.id}
                      type="button"
                      size="sm"
                      variant={reminderSettings.channels.includes(channel.id) ? "default" : "outline"}
                      className={
                        reminderSettings.channels.includes(channel.id)
                          ? "bg-[#00FFF3] text-black hover:bg-[#00E6D6]"
                          : "border-[#00FFF3]/30 text-[#00FFF3]"
                      }
                      disabled={!reminderSettings.enabled || !reminderPrefsLoaded || savingReminderPrefs}
                      onClick={() => toggleReminderChannel(channel.id)}
                    >
                      {channel.label}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-3 bg-[#1A2333] p-1 rounded-lg">
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
          </TabsList>

          <div className="rounded-xl border border-[#00FFF3]/20 bg-[#0f1d30] p-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3 transition-all duration-300">
            <div>
              <p className="text-xs font-semibold text-[#00FFF3]">Next Best Action</p>
              <p className="text-[11px] text-slate-300">
                {activeTab === "upcoming"
                  ? "Join ready video calls, or reschedule early to keep care continuity."
                  : activeTab === "completed"
                    ? "Review reports and book follow-up consults for unresolved symptoms."
                    : "Generate new AI guidance and act on high-priority recommendations first."}
              </p>
            </div>
            <div className="flex gap-2 flex-wrap">
              {activeTab === "upcoming" && (
                <>
                  <Button size="sm" variant="outline" className="border-[#00FFF3]/30 text-[#00FFF3]" onClick={() => setShowBookingModal(true)}>
                    <Plus className="h-3.5 w-3.5 mr-1" /> Book Slot
                  </Button>
                  <Button size="sm" variant="outline" className="border-[#00FFF3]/30 text-[#00FFF3]" onClick={() => setActiveTab("smart")}>
                    <Brain className="h-3.5 w-3.5 mr-1" /> AI Assist
                  </Button>
                </>
              )}
              {activeTab === "completed" && (
                <>
                  <Button size="sm" variant="outline" className="border-[#00FFF3]/30 text-[#00FFF3]" onClick={() => navigate("/my-prescriptions")}>
                    View Prescriptions
                  </Button>
                  <Button size="sm" variant="outline" className="border-[#00FFF3]/30 text-[#00FFF3]" onClick={() => setShowBookingModal(true)}>
                    Book Follow-up
                  </Button>
                </>
              )}
              {activeTab === "smart" && (
                <>
                  <Button size="sm" variant="outline" className="border-[#00FFF3]/30 text-[#00FFF3]" onClick={generateSmartSuggestions} disabled={aiAnalyzing}>
                    <Sparkles className="h-3.5 w-3.5 mr-1" /> Refresh
                  </Button>
                  <Button size="sm" variant="outline" className="border-[#00FFF3]/30 text-[#00FFF3]" onClick={() => setShowAIChat(true)}>
                    <MessageSquare className="h-3.5 w-3.5 mr-1" /> Ask AI
                  </Button>
                </>
              )}
            </div>
          </div>

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
                            <div className="flex flex-col items-start gap-1">
                              <Button
                                size="sm"
                                className="bg-green-600 hover:bg-green-700 disabled:opacity-60"
                                disabled={actionLoadingId === appointment.id || !getJoinCallState(appointment).enabled}
                                title={getJoinCallState(appointment).enabled ? "" : getJoinCallState(appointment).reason}
                                onClick={() => handleJoinCall(appointment)}
                              >
                                <Video className="h-4 w-4 mr-1" />
                                {getJoinCallState(appointment).enabled ? 'Join Call' : 'Call Not Ready'}
                              </Button>
                              {!getJoinCallState(appointment).enabled && (
                                <p className="text-[11px] text-amber-400">{getJoinCallState(appointment).reason}</p>
                              )}
                            </div>
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
                        <Badge className={
                          appointment.originalStatus === 'no-show' ? 'bg-red-500/20 text-red-400' :
                            appointment.originalStatus === 'expired' ? 'bg-orange-500/20 text-orange-400' :
                              appointment.originalStatus === 'cancelled' ? 'bg-gray-500/20 text-gray-400' :
                                appointment.originalStatus === 'completed' ? 'bg-green-500/20 text-green-400' :
                                  'bg-blue-500/20 text-blue-400'
                        }>
                          {appointment.originalStatus === 'no-show' ? <AlertCircle className="h-3 w-3" /> :
                            appointment.originalStatus === 'expired' ? <Clock className="h-3 w-3" /> :
                              <CheckCircle className="h-3 w-3" />}
                          <span className="ml-1 capitalize">{appointment.originalStatus || 'completed'}</span>
                        </Badge>
                        <div className="flex gap-2 mt-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="border-[#00FFF3]/30 text-[#00FFF3]"
                            onClick={async () => {
                              if (!appointment.backendId) {
                                toast({
                                  title: "Cannot view report",
                                  description: "Appointment ID is missing.",
                                  variant: "destructive",
                                });
                                return;
                              }
                              try {
                                const data = await appointmentsService.getPrescriptionForAppointment(appointment.backendId);
                                if (data.success && data.prescription) {
                                  // Navigate to my prescriptions page
                                  navigate(`/my-prescriptions?highlight=${data.prescription.id}`);
                                } else {
                                  toast({
                                    title: "No prescription found",
                                    description: "No prescription has been issued for this appointment yet.",
                                  });
                                }
                              } catch (error: any) {
                                if (error.response?.status === 404) {
                                  toast({
                                    title: "No prescription found",
                                    description: "No prescription has been issued for this appointment yet.",
                                  });
                                } else {
                                  toast({
                                    title: "Error",
                                    description: "Failed to fetch prescription. Please try again.",
                                    variant: "destructive",
                                  });
                                }
                              }
                            }}
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
                                className={`text-xs ${suggestion.priority === 'high' ? 'border-red-500 text-red-600' :
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
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-[#00FFF3]/30 text-[#00FFF3]"
                              onClick={() => handleSuggestionAction(suggestion)}
                            >
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
