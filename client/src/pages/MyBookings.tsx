import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Calendar,
  Clock,
  Video,
  CheckCircle,
  XCircle,
  AlertCircle,
  Loader2,
  Phone,
  MessageSquare,
  FileText,
  Star,
  CalendarPlus,
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/auth/AuthProvider";
import api from "@/utils/api";
import { useIncrementTeleconsult } from "@/hooks/use-plan-usage";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

interface Booking {
  id: number;
  doctorId: number;
  doctorName: string;
  specialization: string;
  appointmentDate: string;
  appointmentTime: string;
  status: "scheduled" | "confirmed" | "in-progress" | "completed" | "cancelled" | "no-show";
  consultationType: "video" | "audio" | "chat" | "in-person";
  consultationFee: number;
  paymentStatus: "pending" | "paid" | "refunded" | "failed";
  symptoms?: string;
  reason?: string;
  notes?: string;
  rating?: number;
  feedback?: string;
  createdAt: string;
}

const MyBookings = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const queryClient = useQueryClient();

  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [ratingDialogOpen, setRatingDialogOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [activeTab, setActiveTab] = useState<"upcoming" | "history" | "all">("upcoming");

  const { mutate: incrementTeleconsult } = useIncrementTeleconsult();

  const userId = currentUser?.id || currentUser?._id;

  // Fetch user's appointments (all)
  const { data: allBookings = [], isLoading: loading } = useQuery({
    queryKey: ["myBookings", userId],
    queryFn: async () => {
      const { data } = await api.get(`/appointments`);
      // Handle multiple response formats:
      // 1. Direct array: [appointment1, appointment2, ...]
      // 2. Object wrapper: { success: true, appointments: [...] }
      // 3. Object with data field: { data: { appointments: [...] } }
      if (Array.isArray(data)) return data;
      if (data?.appointments && Array.isArray(data.appointments)) return data.appointments;
      if (data?.data?.appointments && Array.isArray(data.data.appointments)) return data.data.appointments;
      console.warn('Unexpected appointments response format:', data);
      return [];
    },
    enabled: !!userId,
  });

  // Filter bookings by tab
  const bookings = allBookings.filter(booking => {
    const appointmentDate = new Date(booking.appointmentDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (activeTab === "upcoming") {
      return (
        appointmentDate >= today &&
        ["scheduled", "confirmed"].includes(booking.status)
      );
    } else if (activeTab === "history") {
      // Show all appointments in history tab regardless of status
      return true;
    }
    // "all" tab shows everything
    return true;
  });

  // Cancel appointment mutation
  const cancelMutation = useMutation({
    mutationFn: async (appointmentId: number) => {
      await api.patch(`/appointments/${appointmentId}/cancel`, {
        cancellationReason: "Cancelled by patient"
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["myBookings"] });
      toast({
        title: "Success",
        description: "Appointment cancelled successfully",
      });
      setCancelDialogOpen(false);
      setSelectedBooking(null);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.response?.data?.message || "Failed to cancel appointment",
        variant: "destructive",
      });
    },
  });

  // Rating mutation
  const ratingMutation = useMutation({
    mutationFn: async ({ id, rating, feedback }: { id: number; rating: number; feedback: string }) => {
      await api.patch(`/appointments/${id}/rating`, { rating, feedback });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["myBookings"] });

      // Increment teleconsult usage for completed appointments
      const appointment = bookings.find((b: Booking) => b.id === variables.id);
      if (appointment?.specialization && appointment.status === "completed") {
        try {
          incrementTeleconsult({
            specialty: appointment.specialization,
            count: 1
          }, {
            onSuccess: () => {
              // Invalidate MyPlans queries to show updated usage
              queryClient.invalidateQueries({ queryKey: ["myPlan"] });
              toast({
                title: "✅ Plan Usage Updated",
                description: "Your teleconsult has been tracked. Visit My Plans to see updated limits.",
              });
            },
            onError: (error: any) => {
              // Silently log if no active plan or limit exceeded
              console.log("Usage tracking skipped:", error?.response?.data?.message);
            }
          });
        } catch (e) {
          console.log("Usage tracking failed:", e);
        }
      }

      toast({
        title: "Success",
        description: "Thank you for your feedback!",
      });
      setRatingDialogOpen(false);
      setSelectedBooking(null);
      setRating(0);
      setFeedback("");
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.response?.data?.message || "Failed to submit rating",
        variant: "destructive",
      });
    },
  });

  const handleDownloadCalendar = async (booking: Booking) => {
    try {
      const response = await api.get(`/appointments/${booking.id}/calendar`, {
        responseType: 'blob',
      });

      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `appointment-${booking.id}.ics`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      toast({
        title: "Success",
        description: "Calendar file downloaded! Open it to add to your calendar.",
      });
    } catch (error: any) {
      console.error('Calendar download error:', error);
      toast({
        title: "Error",
        description: error.response?.data?.message || "Failed to download calendar file",
        variant: "destructive",
      });
    }
  };

  const handleJoinVideoCall = (booking: Booking) => {
    const resolveRoomId = (meetingLink?: string) => {
      if (!meetingLink) return `apt-${booking.id}`;
      if (meetingLink.includes('/rooms/')) return meetingLink.split('/rooms/')[1]?.split('?')[0];
      if (meetingLink.includes('/room/')) return meetingLink.split('/room/')[1]?.split('?')[0];
      if (meetingLink.includes('/join/')) return meetingLink.split('/join/')[1]?.split('?')[0];
      try {
        const parsed = new URL(meetingLink);
        return (
          parsed.searchParams.get('room') ||
          parsed.searchParams.get('roomId') ||
          parsed.searchParams.get('meetingId') ||
          meetingLink
        );
      } catch (error) {
        return meetingLink;
      }
    };

    // Navigate to embedded video consultation page with room parameter
    const roomId = resolveRoomId(booking.meetingLink);

    navigate(`/video-consultation?room=${encodeURIComponent(roomId)}`);

    toast({
      title: "Joining Video Call",
      description: `Connecting to video consultation with Dr. ${booking.doctorName}`,
    });
  };

  const getStatusBadge = (status: Booking["status"]) => {
    const statusConfig: Record<string, { color: string; icon: any; label: string }> = {
      scheduled: { color: "bg-teal-50 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300", icon: Clock, label: "Scheduled" },
      confirmed: { color: "bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300", icon: CheckCircle, label: "Confirmed" },
      "in-progress": { color: "bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300", icon: Video, label: "In Progress" },
      completed: { color: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300", icon: CheckCircle, label: "Completed" },
      cancelled: { color: "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300", icon: XCircle, label: "Cancelled" },
      "no-show": { color: "bg-slate-100 text-slate-700 dark:bg-slate-700/50 dark:text-slate-300", icon: AlertCircle, label: "No Show" },
    };

    const config = statusConfig[status] || statusConfig.scheduled;
    const Icon = config.icon;

    return (
      <Badge variant="outline" className={config.color}>
        <Icon className="h-3 w-3 mr-1" />
        {config.label}
      </Badge>
    );
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

  const handleCancelClick = (booking: Booking) => {
    setSelectedBooking(booking);
    setCancelDialogOpen(true);
  };

  const handleRatingClick = (booking: Booking) => {
    setSelectedBooking(booking);
    setRating(booking.rating || 0);
    setFeedback(booking.feedback || "");
    setRatingDialogOpen(true);
  };

  const handleJoinCall = (booking: Booking) => {
    const resolveRoomId = (meetingLink?: string) => {
      if (!meetingLink) return `apt-${booking.id}`;
      if (meetingLink.includes('/rooms/')) return meetingLink.split('/rooms/')[1]?.split('?')[0];
      if (meetingLink.includes('/room/')) return meetingLink.split('/room/')[1]?.split('?')[0];
      if (meetingLink.includes('/join/')) return meetingLink.split('/join/')[1]?.split('?')[0];
      try {
        const parsed = new URL(meetingLink);
        return (
          parsed.searchParams.get('room') ||
          parsed.searchParams.get('roomId') ||
          parsed.searchParams.get('meetingId') ||
          meetingLink
        );
      } catch (error) {
        return meetingLink;
      }
    };

    // Generate room ID from appointment or meeting link
    const roomId = resolveRoomId(booking.meetingLink);

    // Navigate to video consultation page
    navigate(`/video-consultation?room=${encodeURIComponent(roomId)}&appointmentId=${booking.id}`);

    toast({
      title: "Joining Video Call",
      description: `Connecting to consultation with Dr. ${booking.doctorName}`,
    });
  };

  const canCancel = (booking: Booking) => {
    const appointmentDateTime = new Date(`${booking.appointmentDate} ${booking.appointmentTime}`);
    const now = new Date();
    const hoursDifference = (appointmentDateTime.getTime() - now.getTime()) / (1000 * 60 * 60);
    return hoursDifference > 2 && ["scheduled", "confirmed"].includes(booking.status);
  };

  const canRate = (booking: Booking) => {
    return booking.status === "completed" && !booking.rating;
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8 flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-teal-600 dark:text-teal-400" />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold text-slate-800 dark:text-white">My Appointments</h1>
          <Button onClick={() => navigate("/consultation")} className="bg-teal-600 hover:bg-teal-700 text-white dark:bg-teal-500 dark:hover:bg-teal-600">
            Book New Appointment
          </Button>
        </div>

        {/* Appointment Tabs */}
        <div className="flex gap-2 mb-6 border-b border-slate-200 dark:border-slate-700">
          <button
            onClick={() => setActiveTab("upcoming")}
            className={`pb-3 px-1 font-medium text-sm transition-colors ${activeTab === "upcoming"
                ? "text-teal-600 dark:text-teal-400 border-b-2 border-teal-600 dark:border-teal-400"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-300"
              }`}
          >
            <Calendar className="inline w-4 h-4 mr-2" />
            Upcoming
          </button>
          <button
            onClick={() => setActiveTab("history")}
            className={`pb-3 px-1 font-medium text-sm transition-colors ${activeTab === "history"
                ? "text-teal-600 dark:text-teal-400 border-b-2 border-teal-600 dark:border-teal-400"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-300"
              }`}
          >
            <Clock className="inline w-4 h-4 mr-2" />
            History
          </button>
          <button
            onClick={() => setActiveTab("all")}
            className={`pb-3 px-1 font-medium text-sm transition-colors ${activeTab === "all"
                ? "text-teal-600 dark:text-teal-400 border-b-2 border-teal-600 dark:border-teal-400"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-300"
              }`}
          >
            All
          </button>
        </div>

        {bookings.length === 0 ? (
          <Card className="p-6 text-center bg-white dark:bg-slate-800/50 border-slate-200 dark:border-slate-700">
            <AlertCircle className="h-12 w-12 mx-auto mb-4 text-slate-400 dark:text-slate-500" />
            <h3 className="text-xl font-semibold mb-2 text-slate-800 dark:text-white">No Appointments Found</h3>
            <p className="text-slate-600 dark:text-slate-400 mb-4">
              You haven't booked any appointments yet.
            </p>
            <Button onClick={() => navigate("/consultation")} className="bg-teal-600 hover:bg-teal-700 text-white dark:bg-teal-500 dark:hover:bg-teal-600">
              Book Your First Appointment
            </Button>
          </Card>
        ) : (
          <div className="space-y-4">
            {bookings.map((booking) => (
              <Card key={booking.id} className="p-6 hover:shadow-md transition-shadow bg-white dark:bg-slate-800/50 border-slate-200 dark:border-slate-700">
                <div className="flex items-start justify-between flex-wrap gap-4 mb-4">
                  <div>
                    <h3 className="text-xl font-semibold text-slate-800 dark:text-white select-text">{booking.doctorName}</h3>
                    <p className="text-slate-600 dark:text-slate-400">{booking.specialization}</p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    {getStatusBadge(booking.status)}
                    <Badge variant="outline" className={
                      booking.paymentStatus === "paid" ? "bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300" :
                        booking.paymentStatus === "pending" ? "bg-yellow-50 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300" :
                          "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300"
                    }>
                      {(booking.paymentStatus || 'pending').toUpperCase()}
                    </Badge>
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-4 mb-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                      <Calendar className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                      <span>{new Date(booking.appointmentDate).toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric'
                      })}</span>
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
                      <span className="font-semibold">₹{booking.consultationFee}</span>
                    </div>
                  </div>
                </div>

                {booking.symptoms && (
                  <div className="mb-4 p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg border border-slate-200 dark:border-slate-600">
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Symptoms:</p>
                    <p className="text-sm text-slate-600 dark:text-slate-400">{booking.symptoms}</p>
                  </div>
                )}

                {booking.notes && (
                  <div className="mb-4 p-3 bg-teal-50 dark:bg-teal-900/30 rounded-lg border border-teal-200 dark:border-teal-700">
                    <p className="text-sm font-medium text-teal-700 dark:text-teal-300 mb-1">Doctor's Notes:</p>
                    <p className="text-sm text-slate-600 dark:text-slate-400">{booking.notes}</p>
                  </div>
                )}

                {booking.rating && (
                  <div className="mb-4 flex items-center gap-2">
                    <Star className="h-5 w-5 text-yellow-500 fill-yellow-500" />
                    <span className="font-medium text-slate-800 dark:text-white">{booking.rating}/5</span>
                    {booking.feedback && <span className="text-sm text-slate-600 dark:text-slate-400">- {booking.feedback}</span>}
                  </div>
                )}

                <div className="mt-6 flex items-center gap-4 flex-wrap">
                  {["scheduled", "confirmed"].includes(booking.status) && (
                    <>
                      {booking.consultationType === 'online' ? (
                        <Button
                          variant="default"
                          onClick={() => handleJoinVideoCall(booking)}
                          className="bg-teal-600 hover:bg-teal-700 text-white dark:bg-teal-500 dark:hover:bg-teal-600"
                        >
                          <Video className="h-4 w-4 mr-2" />
                          Join Video Call
                        </Button>
                      ) : (
                        <Button
                          variant="default"
                          onClick={() => handleJoinCall(booking)}
                          className="bg-teal-600 hover:bg-teal-700 text-white dark:bg-teal-500 dark:hover:bg-teal-600"
                        >
                          {getConsultationTypeIcon(booking.consultationType)}
                          <span className="ml-2">Join Consultation</span>
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        onClick={() => handleDownloadCalendar(booking)}
                        className="border-teal-200 text-teal-600 hover:bg-teal-50 dark:border-teal-700 dark:text-teal-400 dark:hover:bg-teal-900/30"
                      >
                        <CalendarPlus className="h-4 w-4 mr-2" />
                        Add to Calendar
                      </Button>
                      {canCancel(booking) && (
                        <Button
                          variant="outline"
                          onClick={() => handleCancelClick(booking)}
                          disabled={cancelMutation.isPending}
                          className="border-red-200 text-red-600 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/30"
                        >
                          {cancelMutation.isPending ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <XCircle className="h-4 w-4 mr-2" />
                          )}
                          Cancel
                        </Button>
                      )}
                    </>
                  )}
                  {canRate(booking) && (
                    <Button
                      variant="outline"
                      onClick={() => handleRatingClick(booking)}
                      className="border-yellow-200 text-yellow-600 hover:bg-yellow-50 dark:border-yellow-700 dark:text-yellow-400 dark:hover:bg-yellow-900/30"
                    >
                      <Star className="h-4 w-4 mr-2" />
                      Rate Doctor
                    </Button>
                  )}
                  {booking.status === "completed" && booking.notes && (
                    <Button
                      variant="outline"
                      onClick={() => navigate(`/prescriptions/${booking.id}`)}
                      className="border-teal-200 text-teal-600 hover:bg-teal-50 dark:border-teal-700 dark:text-teal-400 dark:hover:bg-teal-900/30"
                    >
                      <FileText className="h-4 w-4 mr-2" />
                      View Prescription
                    </Button>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* Cancel Confirmation Dialog */}
        <AlertDialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
          <AlertDialogContent className="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-slate-800 dark:text-white">Cancel Appointment?</AlertDialogTitle>
              <AlertDialogDescription className="text-slate-600 dark:text-slate-400">
                Are you sure you want to cancel your appointment with {selectedBooking?.doctorName}?
                This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white dark:hover:bg-slate-600">No, Keep It</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => selectedBooking && cancelMutation.mutate(selectedBooking.id)}
                className="bg-red-600 hover:bg-red-700"
              >
                Yes, Cancel Appointment
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Rating Dialog */}
        <Dialog open={ratingDialogOpen} onOpenChange={setRatingDialogOpen}>
          <DialogContent className="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700">
            <DialogHeader>
              <DialogTitle className="text-slate-800 dark:text-white">Rate Your Experience</DialogTitle>
              <DialogDescription className="text-slate-600 dark:text-slate-400">
                How was your consultation with {selectedBooking?.doctorName}?
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <Label className="text-slate-700 dark:text-slate-300">Rating</Label>
                <div className="flex gap-2 mt-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setRating(star)}
                      className="focus:outline-none focus:ring-2 focus:ring-teal-500 rounded"
                    >
                      <Star
                        className={`h-8 w-8 ${star <= rating
                            ? "text-yellow-500 fill-yellow-500"
                            : "text-slate-300 dark:text-slate-600"
                          }`}
                      />
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <Label className="text-slate-700 dark:text-slate-300">Feedback (Optional)</Label>
                <Textarea
                  placeholder="Share your experience..."
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  rows={4}
                  className="bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-800 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500"
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setRatingDialogOpen(false)}
                disabled={ratingMutation.isPending}
                className="border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white dark:hover:bg-slate-600"
              >
                Cancel
              </Button>
              <Button
                onClick={() => selectedBooking && ratingMutation.mutate({
                  id: selectedBooking.id,
                  rating,
                  feedback
                })}
                disabled={rating === 0 || ratingMutation.isPending}
                className="bg-teal-600 hover:bg-teal-700 text-white dark:bg-teal-500 dark:hover:bg-teal-600"
              >
                {ratingMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  "Submit Rating"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

export default MyBookings; 
