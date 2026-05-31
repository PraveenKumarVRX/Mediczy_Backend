import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import {
  AlertCircle,
  Calendar,
  CalendarPlus,
  CheckCircle,
  Clock,
  FileText,
  Loader2,
  MessageSquare,
  Phone,
  RefreshCw,
  Star,
  Video,
  XCircle,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/auth/AuthProvider";
import { useToast } from "@/hooks/use-toast";
import {
  useAppointmentCalendarDownload,
  useCancelAppointment,
  useJoinAppointmentVideo,
  useMyBookings,
} from "@/hooks/useAppointments";
import type { AppointmentBooking } from "@/types/appointments";

type BookingTab = "upcoming" | "history" | "all";

type ErrorWithResponse = {
  response?: {
    data?: {
      message?: string;
    };
  };
  message?: string;
};

const getErrorMessage = (error: unknown, fallback: string) =>
  (error as ErrorWithResponse | undefined)?.response?.data?.message ||
  (error as ErrorWithResponse | undefined)?.message ||
  fallback;

const resolveRoomId = (appointmentId: number, meetingLink?: string) => {
  if (!meetingLink) return `apt-${appointmentId}`;
  if (meetingLink.includes("/rooms/")) return meetingLink.split("/rooms/")[1]?.split("?")[0];
  if (meetingLink.includes("/room/")) return meetingLink.split("/room/")[1]?.split("?")[0];
  if (meetingLink.includes("/join/")) return meetingLink.split("/join/")[1]?.split("?")[0];

  try {
    const parsed = new URL(meetingLink);
    return (
      parsed.searchParams.get("room") ||
      parsed.searchParams.get("roomId") ||
      parsed.searchParams.get("meetingId") ||
      meetingLink
    );
  } catch {
    return meetingLink;
  }
};

const getAppointmentDateTime = (booking: AppointmentBooking) => {
  const appointmentDateTime = new Date(`${booking.appointmentDate} ${booking.appointmentTime || "00:00"}`);
  return Number.isNaN(appointmentDateTime.getTime()) ? null : appointmentDateTime;
};

const isUpcomingBooking = (booking: AppointmentBooking) => {
  const appointmentDateTime = getAppointmentDateTime(booking);
  if (!appointmentDateTime) return false;

  const now = new Date();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const isInProgressAndRecent = booking.status === "in-progress" && appointmentDateTime >= todayStart;

  return (
    (appointmentDateTime > now || isInProgressAndRecent) &&
    !["cancelled", "no-show", "completed"].includes(booking.status)
  );
};

const getStatusBadge = (status: AppointmentBooking["status"]) => {
  const statusConfig: Record<string, { color: string; icon: typeof Clock; label: string }> = {
    scheduled: {
      color: "bg-teal-50 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300",
      icon: Clock,
      label: "Scheduled",
    },
    confirmed: {
      color: "bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300",
      icon: CheckCircle,
      label: "Confirmed",
    },
    "in-progress": {
      color: "bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
      icon: Video,
      label: "In Progress",
    },
    completed: {
      color: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
      icon: CheckCircle,
      label: "Completed",
    },
    cancelled: {
      color: "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300",
      icon: XCircle,
      label: "Cancelled",
    },
    "no-show": {
      color: "bg-slate-100 text-slate-700 dark:bg-slate-700/50 dark:text-slate-300",
      icon: AlertCircle,
      label: "No Show",
    },
  };

  const config = statusConfig[status] || statusConfig.scheduled;
  const Icon = config.icon;

  return (
    <Badge variant="outline" className={config.color}>
      <Icon className="mr-1 h-3 w-3" />
      {config.label}
    </Badge>
  );
};

const getPaymentBadgeClass = (paymentStatus: AppointmentBooking["paymentStatus"]) => {
  if (paymentStatus === "paid") return "bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300";
  if (paymentStatus === "pending") return "bg-yellow-50 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300";
  return "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300";
};

const getConsultationTypeIcon = (type: string) => {
  switch (type) {
    case "video":
      return <Video className="h-4 w-4" />;
    case "audio":
      return <Phone className="h-4 w-4" />;
    case "chat":
      return <MessageSquare className="h-4 w-4" />;
    default:
      return <Video className="h-4 w-4" />;
  }
};

const canCancel = (booking: AppointmentBooking) => {
  const appointmentDateTime = getAppointmentDateTime(booking);
  if (!appointmentDateTime) return false;

  const hoursDifference = (appointmentDateTime.getTime() - Date.now()) / (1000 * 60 * 60);
  return hoursDifference > 2 && ["scheduled", "confirmed"].includes(booking.status);
};

const getJoinState = (booking: AppointmentBooking) => {
  if (!["confirmed", "in-progress"].includes(booking.status)) {
    return {
      enabled: false,
      reason: `Call becomes available after confirmation. Current status: ${booking.status}.`,
    };
  }

  const appointmentDateTime = getAppointmentDateTime(booking);
  if (!appointmentDateTime) {
    return {
      enabled: false,
      reason: "Appointment date/time is invalid.",
    };
  }

  const now = new Date();
  const windowStart = new Date(appointmentDateTime.getTime() - 15 * 60 * 1000);
  const windowEnd = new Date(appointmentDateTime.getTime() + 60 * 60 * 1000);

  if (now < windowStart) {
    return {
      enabled: false,
      reason: "Call opens 15 minutes before your appointment time.",
    };
  }

  if (now > windowEnd && booking.status !== "in-progress") {
    return {
      enabled: false,
      reason: "The consultation window has ended.",
    };
  }

  return { enabled: true, reason: "" };
};

const downloadBlob = (blob: Blob, filename: string) => {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
};

const BookingsSkeleton = () => (
  <div className="space-y-4">
    {[0, 1, 2].map((item) => (
      <Card key={item} className="p-6 bg-white dark:bg-slate-800/50 border-slate-200 dark:border-slate-700">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
          <Skeleton className="h-6 w-24" />
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
        <div className="mt-6 flex gap-3">
          <Skeleton className="h-10 w-36" />
          <Skeleton className="h-10 w-32" />
        </div>
      </Card>
    ))}
  </div>
);

const MyBookings = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { currentUser } = useAuth();

  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState<AppointmentBooking | null>(null);
  const [activeTab, setActiveTab] = useState<BookingTab>("upcoming");

  const userId = currentUser?.id || currentUser?._id;
  const bookingsQuery = useMyBookings(userId);
  const cancelMutation = useCancelAppointment(userId);
  const calendarMutation = useAppointmentCalendarDownload();
  const joinVideoMutation = useJoinAppointmentVideo();

  const allBookings = bookingsQuery.data ?? [];
  const bookings = useMemo(() => {
    if (activeTab === "upcoming") return allBookings.filter(isUpcomingBooking);
    if (activeTab === "history") return allBookings.filter((booking) => !isUpcomingBooking(booking));
    return allBookings;
  }, [activeTab, allBookings]);

  const handleDownloadCalendar = async (booking: AppointmentBooking) => {
    try {
      const blob = await calendarMutation.mutateAsync(booking.id);
      downloadBlob(blob, `appointment-${booking.id}.ics`);
      toast({
        title: "Calendar downloaded",
        description: "Open the .ics file to add this appointment to your calendar.",
      });
    } catch (error) {
      toast({
        title: "Calendar download failed",
        description: getErrorMessage(error, "Failed to download calendar file."),
        variant: "destructive",
      });
    }
  };

  const handleJoinVideoCall = async (booking: AppointmentBooking) => {
    try {
      const response = await joinVideoMutation.mutateAsync(booking.id);
      if (!response.success) {
        throw new Error(response.message || "Video call is not ready yet");
      }

      const roomId =
        response.video?.meetingId ||
        response.video?.roomId ||
        resolveRoomId(booking.id, response.video?.meetingLink || booking.meetingLink);

      navigate(`/video-consultation?room=${encodeURIComponent(roomId)}&appointmentId=${booking.id}`);
      toast({
        title: "Joining Video Call",
        description: `Connecting to consultation with Dr. ${booking.doctorName}`,
      });
    } catch (error) {
      toast({
        title: "Cannot Join Yet",
        description: getErrorMessage(error, "Consultation is not available right now."),
        variant: "destructive",
      });
    }
  };

  const handleCancelAppointment = async () => {
    if (!selectedBooking) return;

    try {
      await cancelMutation.mutateAsync(selectedBooking.id);
      toast({
        title: "Appointment cancelled",
        description: "Your appointment was cancelled successfully.",
      });
      setCancelDialogOpen(false);
      setSelectedBooking(null);
    } catch (error) {
      toast({
        title: "Cancellation failed",
        description: getErrorMessage(error, "Failed to cancel appointment."),
        variant: "destructive",
      });
    }
  };

  const handleCancelClick = (booking: AppointmentBooking) => {
    setSelectedBooking(booking);
    setCancelDialogOpen(true);
  };

  const renderContent = () => {
    if (!userId) {
      return (
        <Alert className="border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Login required</AlertTitle>
          <AlertDescription>Please login to view and manage your appointments.</AlertDescription>
        </Alert>
      );
    }

    if (bookingsQuery.isLoading) return <BookingsSkeleton />;

    if (bookingsQuery.isError) {
      return (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Unable to load appointments</AlertTitle>
          <AlertDescription className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>{getErrorMessage(bookingsQuery.error, "Please try again in a moment.")}</span>
            <Button variant="outline" size="sm" onClick={() => bookingsQuery.refetch()}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      );
    }

    if (bookings.length === 0) {
      return (
        <Card className="p-6 text-center bg-white dark:bg-slate-800/50 border-slate-200 dark:border-slate-700">
          <AlertCircle className="mx-auto mb-4 h-12 w-12 text-slate-400 dark:text-slate-500" />
          <h3 className="mb-2 text-xl font-semibold text-slate-800 dark:text-white">No Appointments Found</h3>
          <p className="mb-4 text-slate-600 dark:text-slate-400">
            {activeTab === "upcoming"
              ? "You do not have upcoming appointments right now."
              : "No appointments match this view."}
          </p>
          <Button onClick={() => navigate("/consultation")} className="bg-teal-600 hover:bg-teal-700 text-white dark:bg-teal-500 dark:hover:bg-teal-600">
            Book Your First Appointment
          </Button>
        </Card>
      );
    }

    return (
      <div className="space-y-4">
        {bookings.map((booking, index) => {
          const joinState = getJoinState(booking);
          const isCalendarDownloading = calendarMutation.isPending && calendarMutation.variables === booking.id;
          const isJoining = joinVideoMutation.isPending && joinVideoMutation.variables === booking.id;
          const isCancelling = cancelMutation.isPending && cancelMutation.variables === booking.id;

          return (
            <motion.div
              key={booking.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18, delay: Math.min(index * 0.025, 0.15) }}
            >
              <Card className="p-6 hover:shadow-md transition-shadow bg-white dark:bg-slate-800/50 border-slate-200 dark:border-slate-700">
                <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h3 className="select-text text-xl font-semibold text-slate-800 dark:text-white">{booking.doctorName}</h3>
                    <p className="text-slate-600 dark:text-slate-400">{booking.specialization}</p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    {getStatusBadge(booking.status)}
                    <Badge variant="outline" className={getPaymentBadgeClass(booking.paymentStatus)}>
                      {(booking.paymentStatus || "pending").toUpperCase()}
                    </Badge>
                  </div>
                </div>

                <div className="mb-4 grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                      <Calendar className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                      <span>
                        {new Date(booking.appointmentDate).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        })}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                      <Clock className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                      <span>{booking.appointmentTime}</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                      {getConsultationTypeIcon(booking.consultationType)}
                      <span className="capitalize">{booking.consultationType} Consultation</span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                      <span className="font-semibold">Rs. {booking.consultationFee}</span>
                    </div>
                  </div>
                </div>

                {booking.symptoms && (
                  <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-600 dark:bg-slate-700/50">
                    <p className="mb-1 text-sm font-medium text-slate-700 dark:text-slate-300">Symptoms:</p>
                    <p className="text-sm text-slate-600 dark:text-slate-400">{booking.symptoms}</p>
                  </div>
                )}

                {booking.notes && (
                  <div className="mb-4 rounded-lg border border-teal-200 bg-teal-50 p-3 dark:border-teal-700 dark:bg-teal-900/30">
                    <p className="mb-1 text-sm font-medium text-teal-700 dark:text-teal-300">Doctor notes:</p>
                    <p className="text-sm text-slate-600 dark:text-slate-400">{booking.notes}</p>
                  </div>
                )}

                {booking.rating && (
                  <div className="mb-4 flex items-center gap-2">
                    <Star className="h-5 w-5 fill-yellow-500 text-yellow-500" />
                    <span className="font-medium text-slate-800 dark:text-white">{booking.rating}/5</span>
                    {booking.feedback && <span className="text-sm text-slate-600 dark:text-slate-400">- {booking.feedback}</span>}
                  </div>
                )}

                <div className="mt-6 flex flex-wrap items-center gap-4">
                  {["video", "audio", "chat"].includes(booking.consultationType) &&
                    ["scheduled", "confirmed", "in-progress"].includes(booking.status) && (
                      <div className="flex flex-col gap-1">
                        <Button
                          variant="default"
                          onClick={() => handleJoinVideoCall(booking)}
                          disabled={!joinState.enabled || isJoining}
                          title={joinState.enabled ? "" : joinState.reason}
                          className="bg-teal-600 hover:bg-teal-700 text-white dark:bg-teal-500 dark:hover:bg-teal-600 disabled:opacity-60"
                        >
                          {isJoining ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : getConsultationTypeIcon(booking.consultationType)}
                          <span className="ml-2">{joinState.enabled ? "Join Consultation" : "Consultation Not Ready"}</span>
                        </Button>
                        {!joinState.enabled && <p className="text-xs text-amber-600 dark:text-amber-400">{joinState.reason}</p>}
                      </div>
                    )}

                  {["scheduled", "confirmed"].includes(booking.status) && (
                    <>
                      <Button
                        variant="outline"
                        onClick={() => handleDownloadCalendar(booking)}
                        disabled={isCalendarDownloading}
                        className="border-teal-200 text-teal-600 hover:bg-teal-50 dark:border-teal-700 dark:text-teal-400 dark:hover:bg-teal-900/30"
                      >
                        {isCalendarDownloading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CalendarPlus className="mr-2 h-4 w-4" />}
                        Add to Calendar
                      </Button>

                      {canCancel(booking) && (
                        <Button
                          variant="outline"
                          onClick={() => handleCancelClick(booking)}
                          disabled={isCancelling}
                          className="border-red-200 text-red-600 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/30"
                        >
                          {isCancelling ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <XCircle className="mr-2 h-4 w-4" />}
                          Cancel
                        </Button>
                      )}
                    </>
                  )}

                  {booking.status === "completed" && booking.notes && (
                    <Button
                      variant="outline"
                      onClick={() => navigate(`/prescriptions/${booking.id}`)}
                      className="border-teal-200 text-teal-600 hover:bg-teal-50 dark:border-teal-700 dark:text-teal-400 dark:hover:bg-teal-900/30"
                    >
                      <FileText className="mr-2 h-4 w-4" />
                      View Prescription
                    </Button>
                  )}
                </div>
              </Card>
            </motion.div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-800 dark:text-white">My Appointments</h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              View upcoming visits, join consultations, download calendar files, and cancel eligible bookings.
            </p>
          </div>
          <Button onClick={() => navigate("/consultation")} className="bg-teal-600 hover:bg-teal-700 text-white dark:bg-teal-500 dark:hover:bg-teal-600">
            Book New Appointment
          </Button>
        </div>

        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as BookingTab)} className="mb-6">
          <TabsList className="grid w-full grid-cols-3 sm:w-auto">
            <TabsTrigger value="upcoming">
              <Calendar className="mr-2 h-4 w-4" />
              Upcoming
            </TabsTrigger>
            <TabsTrigger value="history">
              <Clock className="mr-2 h-4 w-4" />
              History
            </TabsTrigger>
            <TabsTrigger value="all">All</TabsTrigger>
          </TabsList>
        </Tabs>

        {bookingsQuery.isFetching && !bookingsQuery.isLoading && (
          <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Refreshing appointments...
          </div>
        )}

        {renderContent()}

        <AlertDialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
          <AlertDialogContent className="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-slate-800 dark:text-white">Cancel Appointment?</AlertDialogTitle>
              <AlertDialogDescription className="text-slate-600 dark:text-slate-400">
                Are you sure you want to cancel your appointment with {selectedBooking?.doctorName}? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white dark:hover:bg-slate-600">
                No, Keep It
              </AlertDialogCancel>
              <AlertDialogAction onClick={handleCancelAppointment} className="bg-red-600 hover:bg-red-700" disabled={cancelMutation.isPending}>
                {cancelMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Yes, Cancel Appointment
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
};

export default MyBookings;
