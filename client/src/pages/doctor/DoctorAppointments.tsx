import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, isToday, isPast, isFuture, parseISO } from "date-fns";
import {
  Calendar,
  Clock,
  Video,
  Phone,
  MessageSquare,
  User,
  FileText,
  Loader2,
  Search,
  ChevronRight,
  Activity,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  MapPin,
  CreditCard,
  Stethoscope,
  X,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/auth/AuthProvider";
import api from "@/utils/api";
import MainLayout from "@/components/layout/MainLayoutdoctor";
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

interface Appointment {
  id: number;
  userId: number;
  patientName: string;
  patientEmail: string;
  patientPhone: string;
  appointmentDate: string;
  appointmentTime: string;
  status: string;
  consultationType: "online" | "walkin";
  channel?: "video" | "phone" | "in-person";
  clinicName?: string | null;
  clinicAddress?: string | null;
  consultationFee: number;
  specialization: string;
  symptoms?: string;
  reason?: string;
  notes?: string;
  paymentStatus: string;
  paymentStatusEffective?: string;
  isMembershipRenewalExemptUser?: boolean;
  isVideoPaymentEligible?: boolean;
  createdAt: string;
}

// ── helpers ────────────────────────────────────────────────────────────────
const normalizeStatus = (s?: string) =>
  String(s || "").toLowerCase().replace(/_/g, "-");

const canInitiateCall = (s?: string) =>
  ["scheduled", "confirmed", "accepted", "in-progress"].includes(normalizeStatus(s));

const getDoctorCallState = (apt: Appointment) => {
  const channel = normalizeStatus(apt.channel || "");
  const ct = normalizeStatus(apt.consultationType || "");
  const isVideo = channel.includes("video") || ct === "online" || ct.includes("video") || ct.includes("tele");
  if (!isVideo) {
    return { show: false, enabled: false, reason: "" };
  }

  const status = normalizeStatus(apt.status);
  if (!["scheduled", "confirmed", "accepted", "in-progress"].includes(status)) {
    return {
      show: true,
      enabled: false,
      reason: `Call unavailable for ${apt.status} appointments.`,
    };
  }

  const isPaymentEligible = apt.isVideoPaymentEligible === true;
  if (!isPaymentEligible) {
    const paymentStatus = normalizeStatus(apt.paymentStatusEffective || apt.paymentStatus || "");
    const consultationFee = Number(apt.consultationFee ?? 0);
    const isNominalOrFreeConsultation = Number.isFinite(consultationFee) && consultationFee <= 1;
    if (
      paymentStatus &&
      !["paid", "credit", "free", "complimentary", "coupon"].includes(paymentStatus) &&
      !isNominalOrFreeConsultation &&
      !apt.isMembershipRenewalExemptUser
    ) {
      return {
        show: true,
        enabled: false,
        reason: "Awaiting payment or active membership for this patient.",
      };
    }
  }

  const appointmentDateTime = new Date(`${apt.appointmentDate} ${apt.appointmentTime || "00:00"}`);
  if (Number.isNaN(appointmentDateTime.getTime())) {
    return {
      show: true,
      enabled: false,
      reason: "Invalid appointment date/time.",
    };
  }

  const now = new Date();
  const minutesUntilStart = (appointmentDateTime.getTime() - now.getTime()) / (1000 * 60);
  if (minutesUntilStart > 15) {
    return {
      show: true,
      enabled: false,
      reason: "Start becomes available 15 minutes before appointment time.",
    };
  }

  return { show: true, enabled: true, reason: "" };
};

const getDisplayStatus = (apt: Appointment): string => {
  const today = format(new Date(), "yyyy-MM-dd");
  const ns = normalizeStatus(apt.status);
  if (apt.appointmentDate < today && ["scheduled", "confirmed", "in-progress", "pending"].includes(ns))
    return "expired";
  return ns;
};

const formatTime = (t?: string) => {
  if (!t) return "—";
  try {
    const [h, m] = t.split(":").map(Number);
    const date = new Date();
    date.setHours(h, m);
    return date.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  } catch { return t; }
};

const formatDate = (d: string) => {
  try {
    const date = parseISO(d);
    if (isToday(date)) return "Today";
    return format(date, "d MMM yyyy");
  } catch { return d; }
};

const getInitials = (name?: string) => {
  if (!name) return "?";
  return name.split(" ").slice(0, 2).map(n => n[0]).join("").toUpperCase();
};

const AVATAR_COLORS = [
  "bg-violet-500", "bg-indigo-500", "bg-sky-500", "bg-teal-500",
  "bg-emerald-500", "bg-amber-500", "bg-rose-500", "bg-pink-500",
];
const avatarColor = (id: number) => AVATAR_COLORS[id % AVATAR_COLORS.length];

const STATUS_CONFIG: Record<string, { label: string; border: string; badge: string; dot: string }> = {
  pending:      { label: "Pending",      border: "border-l-purple-400",  badge: "bg-purple-100 text-purple-700", dot: "bg-purple-400" },
  accepted:     { label: "Accepted",     border: "border-l-teal-400",    badge: "bg-teal-100 text-teal-700",    dot: "bg-teal-400" },
  scheduled:    { label: "Scheduled",    border: "border-l-blue-400",    badge: "bg-blue-100 text-blue-700",    dot: "bg-blue-400" },
  confirmed:    { label: "Confirmed",    border: "border-l-green-400",   badge: "bg-green-100 text-green-700",  dot: "bg-green-400" },
  "in-progress":{ label: "In Progress",  border: "border-l-yellow-400",  badge: "bg-yellow-100 text-yellow-700",dot: "bg-yellow-400" },
  completed:    { label: "Completed",    border: "border-l-emerald-400", badge: "bg-emerald-100 text-emerald-700",dot: "bg-emerald-400" },
  cancelled:    { label: "Cancelled",    border: "border-l-red-400",     badge: "bg-red-100 text-red-700",      dot: "bg-red-400" },
  "no-show":    { label: "No Show",      border: "border-l-gray-400",    badge: "bg-gray-100 text-gray-600",    dot: "bg-gray-400" },
  expired:      { label: "Expired",      border: "border-l-orange-300",  badge: "bg-orange-50 text-orange-600", dot: "bg-orange-300" },
};
const statusCfg = (s: string) => STATUS_CONFIG[normalizeStatus(s)] ?? STATUS_CONFIG["scheduled"];

// ── component ──────────────────────────────────────────────────────────────
const DoctorAppointments = () => {
  const { toast } = useToast();
  const { currentDoctor } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const doctorId = (currentDoctor as any)?.id ?? (currentDoctor as any)?._id;

  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  const [notesDialogOpen, setNotesDialogOpen] = useState(false);
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rescheduleDialogOpen, setRescheduleDialogOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [newStatus, setNewStatus] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleTime, setRescheduleTime] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");

  // ── queries ──────────────────────────────────────────────────────────────
  const { data: appointments = [], isLoading } = useQuery({
    queryKey: ["doctorEnhancedAppointments", doctorId],
    queryFn: async () => {
      const { data } = await api.get(`/enhanced-appointments/doctor-appointments`);
      return (data as any).appointments || data || [];
    },
    enabled: !!doctorId,
  });

  const { data: analytics } = useQuery({
    queryKey: ["doctorAppointmentAnalytics", doctorId],
    queryFn: async () => {
      const { data } = await api.get("/appointments/analytics/basic");
      return (data as any).analytics || data;
    },
    enabled: !!doctorId,
  });

  // ── mutations ─────────────────────────────────────────────────────────────
  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string; appointment?: Appointment }) => {
      await api.patch(`/appointments/${id}/status`, { status });
      return { status };
    },
    onSuccess: ({ status }) => {
      queryClient.invalidateQueries({ queryKey: ["doctorEnhancedAppointments", doctorId] });
      toast({
        title: status === "completed" ? "✅ Consultation Completed" : "Status Updated",
        description: status === "completed"
          ? "Patient's plan usage will be tracked after feedback."
          : "Appointment status has been updated.",
      });
      setStatusDialogOpen(false);
      setSelectedAppointment(null);
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.response?.data?.message || "Failed to update status", variant: "destructive" });
      setStatusDialogOpen(false);
      setSelectedAppointment(null);
    },
  });

  const acceptMutation = useMutation({
    mutationFn: async ({ id }: { id: number }) => {
      const { data } = await api.post(`/consultation/doctor/accept/${id}`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["doctorEnhancedAppointments", doctorId] });
      toast({ title: "✅ Appointment Accepted", description: "Patient will be notified to complete payment." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.response?.data?.message || "Failed to accept appointment", variant: "destructive" });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: number; reason: string }) => {
      const { data } = await api.post(`/consultation/doctor/reject/${id}`, { reason });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["doctorEnhancedAppointments", doctorId] });
      toast({ title: "Appointment Rejected", description: "Patient has been notified." });
      setRejectDialogOpen(false);
      setSelectedAppointment(null);
      setRejectReason("");
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.response?.data?.message || "Failed to reject appointment", variant: "destructive" });
    },
  });

  const rescheduleMutation = useMutation({
    mutationFn: async ({ id, appointmentDate, appointmentTime }: { id: number; appointmentDate: string; appointmentTime: string }) => {
      const { data } = await api.patch(`/appointments/${id}/reschedule`, { appointmentDate, appointmentTime });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["doctorEnhancedAppointments", doctorId] });
      toast({ title: "📅 Appointment Rescheduled", description: "Patient has been notified of the new time." });
      setRescheduleDialogOpen(false);
      setSelectedAppointment(null);
      setRescheduleDate("");
      setRescheduleTime("");
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.response?.data?.message || "Failed to reschedule appointment", variant: "destructive" });
    },
  });

  const updateNotesMutation = useMutation({
    mutationFn: async ({ id, notes }: { id: number; notes: string }) => {
      await api.patch(`/appointments/${id}/status`, { notes });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["doctorEnhancedAppointments", doctorId] });
      toast({ title: "Notes Saved", description: "Consultation notes updated successfully." });
      setNotesDialogOpen(false);
      setSelectedAppointment(null);
      setNotes("");
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.response?.data?.message || "Failed to save notes", variant: "destructive" });
    },
  });

  // ── handlers ──────────────────────────────────────────────────────────────
  const handleStartConsultation = async (appointment: Appointment) => {
    const isExternalMeetingLink = (link?: string) => {
      if (!link) return false;
      try { return !new URL(link).hostname.endsWith("mediqzy.com"); }
      catch { return false; }
    };
    const channel = normalizeStatus(appointment.channel || "");
    const ct = normalizeStatus(appointment.consultationType || "");
    const isVideo = channel.includes("video") || ct === "online" || ct.includes("video") || ct.includes("tele");

    if (isVideo) {
      if (!canInitiateCall(appointment.status)) {
        toast({ variant: "destructive", title: "Cannot Start Call", description: `Status is ${appointment.status}.` });
        return;
      }
      toast({ title: "📞 Starting call…", description: "Notifying patient and preparing room…" });
      try {
        const response = await api.post(`/doctors/appointments/${appointment.id}/initiate-call`);
        if (response.data.success) {
          const meetingLink = response.data.video?.meetingLink;
          const roomId = response.data.video?.meetingId || `apt-${appointment.id}`;
          toast({ title: "✅ Patient Notified", description: `${response.data.appointment?.patientName || "Patient"} has been notified.` });
          if (meetingLink && isExternalMeetingLink(meetingLink)) {
            window.open(meetingLink, "_blank", "width=1280,height=720");
          } else {
            navigate(`/doctor/video?room=${encodeURIComponent(roomId)}&appointmentId=${appointment.id}&userId=${appointment.userId}`);
          }
        }
      } catch (error: any) {
        toast({ variant: "destructive", title: "Failed to Start Call", description: error.response?.data?.message || "Please try again." });
      }
    } else {
      window.location.href = `/doctor/chat?userId=${appointment.userId}`;
    }
  };

  // ── filtering & grouping ──────────────────────────────────────────────────
  const filtered = useMemo(() => appointments.filter((apt: Appointment) => {
    const q = searchQuery.toLowerCase();
    const matchSearch = !q || (apt.patientName || "").toLowerCase().includes(q) ||
      (apt.patientEmail || "").toLowerCase().includes(q) || (apt.patientPhone || "").includes(q);
    const matchStatus = filterStatus === "all" || normalizeStatus(apt.status) === filterStatus;
    return matchSearch && matchStatus;
  }), [appointments, searchQuery, filterStatus]);

  const today = format(new Date(), "yyyy-MM-dd");
  const todayApts = filtered.filter((a: Appointment) => a.appointmentDate === today)
    .sort((a: Appointment, b: Appointment) => (a.appointmentTime || "").localeCompare(b.appointmentTime || ""));
  const upcomingApts = filtered.filter((a: Appointment) => a.appointmentDate > today)
    .sort((a: Appointment, b: Appointment) => a.appointmentDate.localeCompare(b.appointmentDate) || (a.appointmentTime || "").localeCompare(b.appointmentTime || ""));
  const pastApts = filtered.filter((a: Appointment) => a.appointmentDate < today)
    .sort((a: Appointment, b: Appointment) => b.appointmentDate.localeCompare(a.appointmentDate));

  // Next upcoming appointment today
  const now = new Date();
  const nextToday = todayApts.find((a: Appointment) => {
    const ns = normalizeStatus(a.status);
    if (!["scheduled", "confirmed", "in-progress"].includes(ns)) return false;
    const [h, m] = (a.appointmentTime || "00:00").split(":").map(Number);
    const aTime = new Date(); aTime.setHours(h, m, 0, 0);
    return aTime >= now;
  });

  // Stats
  const totalToday = todayApts.length;
  const completedToday = todayApts.filter((a: Appointment) => normalizeStatus(a.status) === "completed").length;
  const pendingToday = todayApts.filter((a: Appointment) => ["scheduled", "confirmed", "pending", "accepted"].includes(normalizeStatus(a.status))).length;
  const inProgressToday = todayApts.filter((a: Appointment) => normalizeStatus(a.status) === "in-progress").length;

  // ── sub-components ────────────────────────────────────────────────────────
  const ConsultIcon = ({ apt }: { apt: Appointment }) => {
    const ch = apt.channel || apt.consultationType;
    if (ch === "video" || ch === "online") return <Video className="h-3.5 w-3.5" />;
    if (ch === "phone" || ch === "audio") return <Phone className="h-3.5 w-3.5" />;
    if (ch === "chat") return <MessageSquare className="h-3.5 w-3.5" />;
    return <MapPin className="h-3.5 w-3.5" />;
  };

  const consultLabel = (apt: Appointment) => {
    if (apt.consultationType === "walkin") return apt.clinicName || "Walk-in";
    const ch = apt.channel || "video";
    if (ch === "phone") return "Phone call";
    if (ch === "in-person") return "In-person";
    return "Video call";
  };

  const AppointmentCard = ({ apt, highlight = false }: { apt: Appointment; highlight?: boolean }) => {
    const ds = getDisplayStatus(apt);
    const cfg = statusCfg(ds);
    const initials = getInitials(apt.patientName);
    const color = avatarColor(apt.id);
    const displayPaymentStatus = normalizeStatus(apt.paymentStatusEffective || apt.paymentStatus || "");
    const isPaymentSettled = ["paid", "credit", "free", "complimentary", "coupon"].includes(displayPaymentStatus);
    const paymentLabel = apt.isMembershipRenewalExemptUser && !isPaymentSettled ? "Membership" : (isPaymentSettled ? "Paid" : "Pending");

    return (
      <div
        className={`relative bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800
          border-l-4 ${cfg.border} shadow-sm hover:shadow-md transition-all duration-200
          ${highlight ? "ring-2 ring-indigo-400/40 dark:ring-indigo-500/30" : ""}`}
      >
        {highlight && (
          <div className="absolute -top-2.5 left-5 bg-indigo-500 text-white text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-widest">
            Next Up
          </div>
        )}

        <div className="p-5">
          {/* Top row */}
          <div className="flex items-start gap-3.5 mb-4">
            <div className={`h-11 w-11 rounded-xl ${color} flex items-center justify-center text-white font-bold text-sm flex-shrink-0`}>
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-semibold text-gray-900 dark:text-gray-100 truncate">{apt.patientName || "Unknown"}</h3>
                <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full flex-shrink-0 ${cfg.badge}`}>
                  {cfg.label}
                </span>
              </div>
              <p className="text-xs text-gray-500 truncate mt-0.5">{apt.patientEmail}</p>
              {apt.patientPhone && <p className="text-xs text-gray-500">{apt.patientPhone}</p>}
            </div>
          </div>

          {/* Meta chips */}
          <div className="flex flex-wrap gap-2 mb-3.5">
            <span className="inline-flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 px-2.5 py-1 rounded-lg">
              <Calendar className="h-3 w-3" />
              {formatDate(apt.appointmentDate)}
            </span>
            <span className="inline-flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 px-2.5 py-1 rounded-lg">
              <Clock className="h-3 w-3" />
              {formatTime(apt.appointmentTime)}
            </span>
            <span className="inline-flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 px-2.5 py-1 rounded-lg">
              <ConsultIcon apt={apt} />
              {consultLabel(apt)}
            </span>
            {apt.consultationFee != null && (
              <span className="inline-flex items-center gap-1 text-xs bg-gray-50 dark:bg-gray-800 px-2.5 py-1 rounded-lg">
                <CreditCard className="h-3 w-3 text-gray-500" />
                <span className="font-medium text-gray-900 dark:text-gray-100">₹{apt.consultationFee}</span>
                <span className={`ml-0.5 font-semibold ${isPaymentSettled ? "text-emerald-600" : "text-amber-500"}`}>
                  · {paymentLabel}
                </span>
              </span>
            )}
          </div>

          {/* Symptoms / reason */}
          {(apt.symptoms || apt.reason) && (
            <div className="mb-3.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800/30 rounded-xl px-3.5 py-2.5">
              <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wider mb-1">
                {apt.symptoms ? "Symptoms" : "Reason"}
              </p>
              <p className="text-xs text-gray-700 dark:text-gray-300 line-clamp-2">
                {apt.symptoms || apt.reason}
              </p>
            </div>
          )}

          {/* Notes */}
          {apt.notes && (
            <div className="mb-3.5 bg-violet-50 dark:bg-violet-900/20 border border-violet-100 dark:border-violet-800/30 rounded-xl px-3.5 py-2.5">
              <p className="text-[11px] font-semibold text-violet-700 dark:text-violet-400 uppercase tracking-wider mb-1">Notes</p>
              <p className="text-xs text-gray-700 dark:text-gray-300 line-clamp-2">{apt.notes}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 pt-3.5 border-t border-gray-100 dark:border-gray-800 flex-wrap">
            {normalizeStatus(apt.status) === "pending" ? (
              <>
                <Button
                  size="sm"
                  onClick={() => acceptMutation.mutate({ id: apt.id })}
                  disabled={acceptMutation.isPending}
                  className="bg-green-600 hover:bg-green-700 text-white rounded-xl px-4 gap-1.5 h-8 text-xs font-semibold"
                >
                  {acceptMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                  Accept
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => { setSelectedAppointment(apt); setRejectReason(""); setRejectDialogOpen(true); }}
                  className="border-red-200 text-red-600 hover:bg-red-50 rounded-xl px-4 gap-1.5 h-8 text-xs font-semibold"
                >
                  <X className="h-3.5 w-3.5" />
                  Reject
                </Button>
              </>
            ) : (
              getDoctorCallState(apt).show && (
                <div className="flex flex-col items-start gap-1">
                  <Button
                    size="sm"
                    onClick={() => handleStartConsultation(apt)}
                    disabled={!getDoctorCallState(apt).enabled}
                    title={getDoctorCallState(apt).enabled ? "" : getDoctorCallState(apt).reason}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl px-4 gap-1.5 h-8 text-xs font-semibold disabled:opacity-60"
                  >
                    <ConsultIcon apt={apt} />
                    {getDoctorCallState(apt).enabled ? "Start Call" : "Call Locked"}
                  </Button>
                  {!getDoctorCallState(apt).enabled && (
                    <p className="text-[11px] text-amber-600 dark:text-amber-400">{getDoctorCallState(apt).reason}</p>
                  )}
                </div>
              )
            )}
            {["pending", "scheduled", "confirmed", "accepted"].includes(normalizeStatus(apt.status)) && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSelectedAppointment(apt);
                  setRescheduleDate(apt.appointmentDate);
                  setRescheduleTime(apt.appointmentTime || "");
                  setRescheduleDialogOpen(true);
                }}
                className="rounded-xl h-8 text-xs gap-1.5"
              >
                <Calendar className="h-3.5 w-3.5" />
                Reschedule
              </Button>
            )}
            {normalizeStatus(apt.status) !== "pending" && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setSelectedAppointment(apt); setNotes(apt.notes || ""); setNotesDialogOpen(true); }}
                className="rounded-xl h-8 text-xs gap-1.5"
              >
                <FileText className="h-3.5 w-3.5" />
                {apt.notes ? "Edit Notes" : "Add Notes"}
              </Button>
            )}
            {normalizeStatus(apt.status) !== "pending" && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setSelectedAppointment(apt); setNewStatus(apt.status); setStatusDialogOpen(true); }}
                className="rounded-xl h-8 text-xs ml-auto text-gray-500 hover:text-gray-800"
              >
                Update Status
                <ChevronRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  };

  const EmptyState = ({ message }: { message: string }) => (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="h-16 w-16 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4">
        <Calendar className="h-8 w-8 text-gray-400" />
      </div>
      <p className="text-gray-500 text-sm">{message}</p>
    </div>
  );

  if (isLoading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
            <p className="text-sm text-gray-500">Loading appointments…</p>
          </div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="max-w-4xl mx-auto space-y-6">

        {/* ── Page header ──────────────────────────────────────────────── */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Appointments</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {format(new Date(), "EEEE, d MMMM yyyy")}
            </p>
          </div>
          <div className="hidden sm:flex items-center gap-2 text-xs text-gray-500 bg-gray-50 dark:bg-gray-800 rounded-xl px-3 py-2">
            <Activity className="h-4 w-4 text-indigo-500" />
            <span>{appointments.length} total appointments</span>
          </div>
        </div>

        {/* ── Stats bar ────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Today", value: totalToday, icon: <Calendar className="h-4 w-4" />, color: "text-indigo-600 bg-indigo-50 dark:bg-indigo-950/40" },
            { label: "Pending", value: pendingToday, icon: <AlertCircle className="h-4 w-4" />, color: "text-amber-600 bg-amber-50 dark:bg-amber-950/40" },
            { label: "In Progress", value: inProgressToday, icon: <Activity className="h-4 w-4" />, color: "text-yellow-600 bg-yellow-50 dark:bg-yellow-950/40" },
            { label: "Completed", value: completedToday, icon: <CheckCircle2 className="h-4 w-4" />, color: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40" },
          ].map(({ label, value, icon, color }) => (
            <div key={label} className={`${color} rounded-2xl p-4`}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium opacity-70">{label}</span>
                {icon}
              </div>
              <p className="text-2xl font-bold">{value}</p>
            </div>
          ))}
        </div>

        {/* ── Search + Filter pills ─────────────────────────────────────── */}
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search patient name, email or phone…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-10 rounded-xl h-10 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {["all", "pending", "scheduled", "confirmed", "in-progress", "completed", "cancelled"].map((s) => (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                  filterStatus === s
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                }`}
              >
                {s === "all" ? "All" : s.replace("-", " ").replace(/\b\w/g, c => c.toUpperCase())}
              </button>
            ))}
          </div>
        </div>

        {/* ── Tabs ─────────────────────────────────────────────────────── */}
        <Tabs defaultValue="today" className="w-full">
          <TabsList className="grid w-full grid-cols-3 rounded-2xl bg-gray-100 dark:bg-gray-800 p-1 h-auto">
            {[
              { value: "today", label: "Today", count: todayApts.length },
              { value: "upcoming", label: "Upcoming", count: upcomingApts.length },
              { value: "past", label: "Past", count: pastApts.length },
            ].map(({ value, label, count }) => (
              <TabsTrigger
                key={value}
                value={value}
                className="rounded-xl data-[state=active]:bg-white dark:data-[state=active]:bg-gray-900 data-[state=active]:shadow-sm py-2 text-sm font-medium"
              >
                {label}
                {count > 0 && (
                  <span className="ml-1.5 bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                    {count}
                  </span>
                )}
              </TabsTrigger>
            ))}
          </TabsList>

          {/* Today */}
          <TabsContent value="today" className="space-y-3 mt-5">
            {todayApts.length === 0
              ? <EmptyState message="No appointments scheduled for today." />
              : todayApts.map((apt: Appointment) => (
                  <AppointmentCard key={apt.id} apt={apt} highlight={apt.id === nextToday?.id} />
                ))
            }
          </TabsContent>

          {/* Upcoming */}
          <TabsContent value="upcoming" className="space-y-3 mt-5">
            {upcomingApts.length === 0
              ? <EmptyState message="No upcoming appointments scheduled." />
              : upcomingApts.map((apt: Appointment) => (
                  <AppointmentCard key={apt.id} apt={apt} />
                ))
            }
          </TabsContent>

          {/* Past */}
          <TabsContent value="past" className="space-y-3 mt-5">
            {pastApts.length === 0
              ? <EmptyState message="No past appointments found." />
              : pastApts.map((apt: Appointment) => (
                  <AppointmentCard key={apt.id} apt={apt} />
                ))
            }
          </TabsContent>
        </Tabs>

        {/* ── Notes Dialog ─────────────────────────────────────────────── */}
        <Dialog open={notesDialogOpen} onOpenChange={setNotesDialogOpen}>
          <DialogContent className="rounded-2xl">
            <DialogHeader>
              <DialogTitle>Consultation Notes</DialogTitle>
              <DialogDescription>
                Notes for {selectedAppointment?.patientName}
              </DialogDescription>
            </DialogHeader>
            <div className="py-3">
              <Label className="text-xs uppercase tracking-wider text-gray-500 mb-2 block">Notes</Label>
              <Textarea
                placeholder="Enter consultation notes…"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={6}
                className="rounded-xl resize-none"
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setNotesDialogOpen(false)} disabled={updateNotesMutation.isPending} className="rounded-xl">
                Cancel
              </Button>
              <Button
                onClick={() => selectedAppointment && updateNotesMutation.mutate({ id: selectedAppointment.id, notes })}
                disabled={updateNotesMutation.isPending}
                className="rounded-xl bg-indigo-600 hover:bg-indigo-700"
              >
                {updateNotesMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving…</> : "Save Notes"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Status Dialog ─────────────────────────────────────────────── */}
        <Dialog open={statusDialogOpen} onOpenChange={setStatusDialogOpen}>
          <DialogContent className="rounded-2xl">
            <DialogHeader>
              <DialogTitle>Update Status</DialogTitle>
              <DialogDescription>
                {selectedAppointment?.patientName} · {formatDate(selectedAppointment?.appointmentDate || "")} {formatTime(selectedAppointment?.appointmentTime)}
              </DialogDescription>
            </DialogHeader>
            <div className="py-3">
              <Label className="text-xs uppercase tracking-wider text-gray-500 mb-2 block">New Status</Label>
              <Select value={newStatus} onValueChange={setNewStatus}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  {["scheduled", "confirmed", "in-progress", "completed", "cancelled", "no-show"].map(s => (
                    <SelectItem key={s} value={s}>
                      <div className="flex items-center gap-2">
                        <span className={`h-2 w-2 rounded-full ${statusCfg(s).dot}`} />
                        {statusCfg(s).label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setStatusDialogOpen(false)} disabled={updateStatusMutation.isPending} className="rounded-xl">
                Cancel
              </Button>
              <Button
                onClick={() => selectedAppointment && updateStatusMutation.mutate({ id: selectedAppointment.id, status: newStatus, appointment: selectedAppointment })}
                disabled={updateStatusMutation.isPending}
                className="rounded-xl bg-indigo-600 hover:bg-indigo-700"
              >
                {updateStatusMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Updating…</> : "Update"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Reject Dialog ─────────────────────────────────────────────── */}
        <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
          <DialogContent className="rounded-2xl">
            <DialogHeader>
              <DialogTitle>Reject Appointment</DialogTitle>
              <DialogDescription>
                {selectedAppointment?.patientName} · {formatDate(selectedAppointment?.appointmentDate || "")} {formatTime(selectedAppointment?.appointmentTime)}
              </DialogDescription>
            </DialogHeader>
            <div className="py-3">
              <Label className="text-xs uppercase tracking-wider text-gray-500 mb-2 block">Reason for rejection <span className="text-red-500">*</span></Label>
              <Textarea
                placeholder="Enter reason for rejecting this appointment…"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={4}
                className="rounded-xl resize-none"
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRejectDialogOpen(false)} disabled={rejectMutation.isPending} className="rounded-xl">
                Cancel
              </Button>
              <Button
                onClick={() => selectedAppointment && rejectMutation.mutate({ id: selectedAppointment.id, reason: rejectReason })}
                disabled={rejectMutation.isPending || !rejectReason.trim()}
                className="rounded-xl bg-red-600 hover:bg-red-700"
              >
                {rejectMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Rejecting…</> : "Reject Appointment"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Reschedule Dialog ─────────────────────────────────────────── */}
        <Dialog open={rescheduleDialogOpen} onOpenChange={setRescheduleDialogOpen}>
          <DialogContent className="rounded-2xl">
            <DialogHeader>
              <DialogTitle>Reschedule Appointment</DialogTitle>
              <DialogDescription>
                {selectedAppointment?.patientName} · currently {formatDate(selectedAppointment?.appointmentDate || "")} {formatTime(selectedAppointment?.appointmentTime)}
              </DialogDescription>
            </DialogHeader>
            <div className="py-3 space-y-4">
              <div>
                <Label className="text-xs uppercase tracking-wider text-gray-500 mb-2 block">New Date</Label>
                <Input
                  type="date"
                  value={rescheduleDate}
                  min={format(new Date(), "yyyy-MM-dd")}
                  onChange={(e) => setRescheduleDate(e.target.value)}
                  className="rounded-xl"
                />
              </div>
              <div>
                <Label className="text-xs uppercase tracking-wider text-gray-500 mb-2 block">New Time (HH:MM)</Label>
                <Input
                  type="time"
                  value={rescheduleTime}
                  onChange={(e) => setRescheduleTime(e.target.value)}
                  className="rounded-xl"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRescheduleDialogOpen(false)} disabled={rescheduleMutation.isPending} className="rounded-xl">
                Cancel
              </Button>
              <Button
                onClick={() => selectedAppointment && rescheduleMutation.mutate({ id: selectedAppointment.id, appointmentDate: rescheduleDate, appointmentTime: rescheduleTime })}
                disabled={rescheduleMutation.isPending || !rescheduleDate || !rescheduleTime}
                className="rounded-xl bg-indigo-600 hover:bg-indigo-700"
              >
                {rescheduleMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Rescheduling…</> : "Confirm Reschedule"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      </div>
    </MainLayout>
  );
};

export default DoctorAppointments;

