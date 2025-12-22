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

  const { mutate: incrementTeleconsult } = useIncrementTeleconsult();

  // Fetch user's appointments
  const { data: bookings = [], isLoading: loading } = useQuery({
    queryKey: ["myBookings", currentUser?._id],
    queryFn: async () => {
      const { data } = await api.get(`/appointments`);
      return data;
    },
    enabled: !!currentUser?._id,
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
    if (booking.meetingLink) {
      window.open(booking.meetingLink, '_blank');
    } else {
      // Generate meeting link from appointment ID
      const baseUrl = import.meta.env.VITE_MIROTALK_URL || 'http://mediqzy.com:3010';
      const meetingUrl = `${baseUrl}/join/apt-${booking.id}?name=${encodeURIComponent(currentUser?.name || 'Patient')}`;
      window.open(meetingUrl, '_blank');
    }
    
    toast({
      title: "Joining Video Call",
      description: `Opening video consultation with Dr. ${booking.doctorName}`,
    });
  };

  const getStatusBadge = (status: Booking["status"]) => {
    const statusConfig: Record<string, { color: string; icon: any; label: string }> = {
      scheduled: { color: "bg-blue-50 text-blue-700", icon: Clock, label: "Scheduled" },
      confirmed: { color: "bg-green-50 text-green-700", icon: CheckCircle, label: "Confirmed" },
      "in-progress": { color: "bg-purple-50 text-purple-700", icon: Video, label: "In Progress" },
      completed: { color: "bg-emerald-50 text-emerald-700", icon: CheckCircle, label: "Completed" },
      cancelled: { color: "bg-red-50 text-red-700", icon: XCircle, label: "Cancelled" },
      "no-show": { color: "bg-gray-50 text-gray-700", icon: AlertCircle, label: "No Show" },
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
    navigate(`/chat?doctorId=${booking.doctorId}`);
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
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold">My Appointments</h1>
          <Button onClick={() => navigate("/consultation")}>
            Book New Appointment
          </Button>
        </div>

        {bookings.length === 0 ? (
          <Card className="p-6 text-center">
            <AlertCircle className="h-12 w-12 mx-auto mb-4 text-gray-400" />
            <h3 className="text-xl font-semibold mb-2">No Appointments Found</h3>
            <p className="text-gray-600 mb-4">
              You haven't booked any appointments yet.
            </p>
            <Button onClick={() => navigate("/consultation")}>
              Book Your First Appointment
            </Button>
          </Card>
        ) : (
          <div className="space-y-4">
            {bookings.map((booking) => (
              <Card key={booking.id} className="p-6 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between flex-wrap gap-4 mb-4">
                  <div>
                    <h3 className="text-xl font-semibold">{booking.doctorName}</h3>
                    <p className="text-gray-600">{booking.specialization}</p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    {getStatusBadge(booking.status)}
                    <Badge variant="outline" className={
                      booking.paymentStatus === "paid" ? "bg-green-50 text-green-700" :
                      booking.paymentStatus === "pending" ? "bg-yellow-50 text-yellow-700" :
                      "bg-red-50 text-red-700"
                    }>
                      {booking.paymentStatus.toUpperCase()}
                    </Badge>
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-4 mb-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-gray-600">
                      <Calendar className="h-4 w-4" />
                      <span>{new Date(booking.appointmentDate).toLocaleDateString('en-IN', { 
                        day: 'numeric', 
                        month: 'long', 
                        year: 'numeric' 
                      })}</span>
                    </div>
                    <div className="flex items-center gap-2 text-gray-600">
                      <Clock className="h-4 w-4" />
                      <span>{booking.appointmentTime}</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-gray-600">
                      {getConsultationTypeIcon(booking.consultationType)}
                      <span className="capitalize">{booking.consultationType} Consultation</span>
                    </div>
                    <div className="flex items-center gap-2 text-gray-600">
                      <span className="font-semibold">₹{booking.consultationFee}</span>
                    </div>
                  </div>
                </div>

                {booking.symptoms && (
                  <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                    <p className="text-sm font-medium text-gray-700 mb-1">Symptoms:</p>
                    <p className="text-sm text-gray-600">{booking.symptoms}</p>
                  </div>
                )}

                {booking.notes && (
                  <div className="mb-4 p-3 bg-blue-50 rounded-lg">
                    <p className="text-sm font-medium text-blue-700 mb-1">Doctor's Notes:</p>
                    <p className="text-sm text-gray-600">{booking.notes}</p>
                  </div>
                )}

                {booking.rating && (
                  <div className="mb-4 flex items-center gap-2">
                    <Star className="h-5 w-5 text-yellow-500 fill-yellow-500" />
                    <span className="font-medium">{booking.rating}/5</span>
                    {booking.feedback && <span className="text-sm text-gray-600">- {booking.feedback}</span>}
                  </div>
                )}

                <div className="mt-6 flex items-center gap-4 flex-wrap">
                  {["scheduled", "confirmed"].includes(booking.status) && (
                    <>
                      {booking.consultationType === 'online' ? (
                        <Button
                          variant="default"
                          onClick={() => handleJoinVideoCall(booking)}
                          className="bg-blue-600 hover:bg-blue-700"
                        >
                          <Video className="h-4 w-4 mr-2" />
                          Join Video Call
                        </Button>
                      ) : (
                        <Button
                          variant="default"
                          onClick={() => handleJoinCall(booking)}
                        >
                          {getConsultationTypeIcon(booking.consultationType)}
                          <span className="ml-2">Join Consultation</span>
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        onClick={() => handleDownloadCalendar(booking)}
                        className="border-blue-200 text-blue-600 hover:bg-blue-50"
                      >
                        <CalendarPlus className="h-4 w-4 mr-2" />
                        Add to Calendar
                      </Button>
                      {canCancel(booking) && (
                        <Button
                          variant="outline"
                          onClick={() => handleCancelClick(booking)}
                          disabled={cancelMutation.isPending}
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
                    >
                      <Star className="h-4 w-4 mr-2" />
                      Rate Doctor
                    </Button>
                  )}
                  {booking.status === "completed" && booking.notes && (
                    <Button
                      variant="outline"
                      onClick={() => navigate(`/prescriptions/${booking.id}`)}
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
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Cancel Appointment?</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to cancel your appointment with {selectedBooking?.doctorName}?
                This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>No, Keep It</AlertDialogCancel>
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
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Rate Your Experience</DialogTitle>
              <DialogDescription>
                How was your consultation with {selectedBooking?.doctorName}?
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <Label>Rating</Label>
                <div className="flex gap-2 mt-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setRating(star)}
                      className="focus:outline-none"
                    >
                      <Star
                        className={`h-8 w-8 ${
                          star <= rating
                            ? "text-yellow-500 fill-yellow-500"
                            : "text-gray-300"
                        }`}
                      />
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <Label>Feedback (Optional)</Label>
                <Textarea
                  placeholder="Share your experience..."
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  rows={4}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setRatingDialogOpen(false)}
                disabled={ratingMutation.isPending}
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