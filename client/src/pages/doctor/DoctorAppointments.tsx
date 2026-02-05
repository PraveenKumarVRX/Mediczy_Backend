import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Calendar,
  Clock,
  Video,
  Phone,
  MessageSquare,
  User,
  FileText,
  CheckCircle,
  XCircle,
  Loader2,
  Filter,
  Search,
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
  createdAt: string;
}

const DoctorAppointments = () => {
  const { toast } = useToast();
  const { currentDoctor } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const doctorId = (currentDoctor as any)?.id ?? (currentDoctor as any)?._id;

  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  const [notesDialogOpen, setNotesDialogOpen] = useState(false);
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [newStatus, setNewStatus] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");

  // Helper function to get display status (marks past non-completed appointments as expired)
  const getDisplayStatus = (appointment: Appointment): string => {
    const today = format(new Date(), "yyyy-MM-dd");
    const isPast = appointment.appointmentDate < today;
    // Normalize status to lowercase with hyphens for comparison
    const normalizedStatus = (appointment.status || '').toLowerCase().replace(/_/g, '-');
    const incompleteStatuses = ['scheduled', 'confirmed', 'in-progress', 'pending'];
    const isIncomplete = incompleteStatuses.includes(normalizedStatus);

    // If it's a past appointment that wasn't completed, show as expired
    if (isPast && isIncomplete) {
      return 'EXPIRED';
    }
    return appointment.status;
  };

  // Helper function to get status color including expired
  const getStatusColorWithExpired = (status: string): string => {
    // Normalize status for comparison
    const normalizedStatus = (status || '').toLowerCase().replace(/_/g, '-');
    switch (normalizedStatus) {
      case "scheduled":
        return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300";
      case "confirmed":
        return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300";
      case "in-progress":
        return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300";
      case "completed":
        return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300";
      case "cancelled":
        return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300";
      case "no-show":
        return "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-300";
      case "expired":
        return "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300";
      default:
        return "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-300";
    }
  };

  // Fetch doctor's enhanced appointments
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

  // Update status mutation
  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status, appointment }: { id: number; status: string; appointment?: Appointment }) => {
      await api.patch(`/appointments/${id}/status`, { status });
      return { status, appointment };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["doctorAppointments"] });

      // If marking as completed, notify the doctor that patient's usage will be tracked
      if (data.status === "completed") {
        toast({
          title: "✅ Consultation Completed",
          description: "Patient's plan usage will be automatically tracked when they provide feedback",
        });
      } else {
        toast({
          title: "Success",
          description: "Appointment status updated",
        });
      }

      // Note: Patient's plan usage is tracked when they submit rating/feedback in MyBookings
      // This ensures the consultation was actually completed and prevents double-counting

      setStatusDialogOpen(false);
      setSelectedAppointment(null);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.response?.data?.message || "Failed to update status",
        variant: "destructive",
      });
    },
  });

  // Update notes mutation
  const updateNotesMutation = useMutation({
    mutationFn: async ({ id, notes }: { id: number; notes: string }) => {
      await api.patch(`/appointments/${id}/status`, { notes });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["doctorAppointments"] });
      toast({
        title: "Success",
        description: "Notes saved successfully",
      });
      setNotesDialogOpen(false);
      setSelectedAppointment(null);
      setNotes("");
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.response?.data?.message || "Failed to save notes",
        variant: "destructive",
      });
    },
  });

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      scheduled: "bg-blue-100 text-blue-700",
      confirmed: "bg-green-100 text-green-700",
      "in-progress": "bg-purple-100 text-purple-700",
      completed: "bg-emerald-100 text-emerald-700",
      cancelled: "bg-red-100 text-red-700",
      "no-show": "bg-gray-100 text-gray-700",
    };
    return colors[status] || "bg-gray-100 text-gray-700";
  };

  const getConsultationIcon = (type: string) => {
    switch (type) {
      case "video":
        return <Video className="h-4 w-4" />;
      case "phone":
      case "audio":
        return <Phone className="h-4 w-4" />;
      case "chat":
        return <MessageSquare className="h-4 w-4" />;
      case "in-person":
        return <Calendar className="h-4 w-4" />;
      default:
        return <Video className="h-4 w-4" />;
    }
  };

  const getConsultationLabel = (appointment: Appointment) => {
    if (appointment.consultationType === "walkin") {
      const clinic = appointment.clinicName || appointment.clinicAddress || "Clinic / Hospital";
      return `Walk-in at ${clinic}`;
    }
    const channel = appointment.channel || "video";
    const channelLabel =
      channel === "phone" ? "Phone" : channel === "in-person" ? "In-person" : "Video";
    return `Online • ${channelLabel}`;
  };

  const handleAddNotes = (appointment: Appointment) => {
    setSelectedAppointment(appointment);
    setNotes(appointment.notes || "");
    setNotesDialogOpen(true);
  };

  const handleUpdateStatus = (appointment: Appointment) => {
    setSelectedAppointment(appointment);
    setNewStatus(appointment.status);
    setStatusDialogOpen(true);
  };

  const handleStartConsultation = async (appointment: Appointment) => {
    const isLongNumericId = (value?: string | number) => {
      if (value === null || value === undefined) return false;
      const str = String(value);
      return /^\d+$/.test(str) && str.length > 10;
    };
    const isExternalMeetingLink = (meetingLink?: string) => {
      if (!meetingLink) return false;
      try {
        const parsed = new URL(meetingLink);
        return !parsed.hostname.endsWith('mediqzy.com');
      } catch (error) {
        return false;
      }
    };

    // Navigate to video consultation page based on consultation type
    const channel = String(appointment.channel || "").toLowerCase();
    const consultType = String(appointment.consultationType || "").toLowerCase();
    const isVideoConsultation =
      channel.includes("video") ||
      consultType === "online" ||
      consultType.includes("video") ||
      consultType.includes("tele");

    if (isVideoConsultation) {
      try {
        // Call initiate-call API to notify patient and get meeting link
        toast({
          title: "📞 Starting Call...",
          description: "Notifying patient and preparing video room...",
        });

        if (isLongNumericId(appointment.id)) {
          const roomId = appointment.meetingId || appointment.meetingLink || String(appointment.id);
          navigate(`/doctor/video?room=${encodeURIComponent(roomId)}&appointmentId=${appointment.id}&userId=${appointment.userId}`);
          return;
        }

        const response = await api.post(`/doctors/appointments/${appointment.id}/initiate-call`);
        
        if (response.data.success) {
          const meetingLink = response.data.video?.meetingLink || response.data.video?.directJoinUrl;
          const roomId = response.data.video?.meetingId || `apt-${appointment.id}`;
          
          toast({
            title: "✅ Patient Notified",
            description: `${response.data.appointment?.patientName || 'Patient'} has been notified. Opening video room...`,
          });

          // Open external meeting link directly if available, otherwise use in-app video route
          if (meetingLink && isExternalMeetingLink(meetingLink)) {
            window.open(meetingLink, '_blank', 'width=1280,height=720');
          } else {
            navigate(`/doctor/video?room=${encodeURIComponent(roomId)}&appointmentId=${appointment.id}&userId=${appointment.userId}`);
          }
        }
      } catch (error: any) {
        console.error('Failed to initiate call:', error);
        toast({
          variant: "destructive",
          title: "Failed to Start Call",
          description: error.response?.data?.message || "Please try again",
        });
        // Fallback: still navigate to video page
        const roomId = `apt-${appointment.id}`;
        navigate(`/doctor/video?room=${encodeURIComponent(roomId)}&appointmentId=${appointment.id}&userId=${appointment.userId}`);
      }
    } else {
      // For phone/chat consultations, go to chat
      window.location.href = `/doctor/chat?userId=${appointment.userId}`;
    }
  };

  // Filter appointments
  const filteredAppointments = appointments.filter((appointment: Appointment) => {
    const matchesSearch =
      (appointment.patientName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (appointment.patientEmail || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (appointment.patientPhone || '').includes(searchQuery);

    const matchesStatus = filterStatus === "all" || appointment.status === filterStatus;

    return matchesSearch && matchesStatus;
  });

  // Group appointments by date
  const today = format(new Date(), "yyyy-MM-dd");
  const todayAppointments = filteredAppointments.filter(
    (apt: Appointment) => apt.appointmentDate === today
  );
  const upcomingAppointments = filteredAppointments.filter(
    (apt: Appointment) => apt.appointmentDate > today
  );
  const pastAppointments = filteredAppointments.filter(
    (apt: Appointment) => apt.appointmentDate < today
  );

  if (isLoading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </MainLayout>
    );
  }

  const AppointmentCard = ({ appointment }: { appointment: Appointment }) => (
    <Card className="p-6 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-start gap-4">
          <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
            <User className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-lg">{appointment.patientName}</h3>
            <p className="text-sm text-gray-600">{appointment.patientEmail}</p>
            <p className="text-sm text-gray-600">{appointment.patientPhone}</p>
          </div>
        </div>
        <Badge className={getStatusColorWithExpired(getDisplayStatus(appointment))}>
          {getDisplayStatus(appointment).toUpperCase().replace("-", " ")}
        </Badge>
      </div>

      <div className="grid md:grid-cols-2 gap-4 mb-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-gray-600">
            <Calendar className="h-4 w-4" />
            <span>{new Date(appointment.appointmentDate).toLocaleDateString('en-IN', {
              day: 'numeric',
              month: 'long',
              year: 'numeric'
            })}</span>
          </div>
          <div className="flex items-center gap-2 text-gray-600">
            <Clock className="h-4 w-4" />
            <span>{appointment.appointmentTime}</span>
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-gray-600">
            {getConsultationIcon(appointment.channel || appointment.consultationType)}
            <span>{getConsultationLabel(appointment)}</span>
          </div>
          <div className="text-gray-600">
            <span className="font-semibold">₹{appointment.consultationFee}</span>
            <Badge
              variant="outline"
              className={`ml-2 ${appointment.paymentStatus === "paid"
                  ? "bg-green-50 text-green-700"
                  : "bg-yellow-50 text-yellow-700"
                }`}
            >
              {(appointment.paymentStatus || 'pending').toUpperCase()}
            </Badge>
          </div>
        </div>
      </div>

      {appointment.symptoms && (
        <div className="mb-4 p-3 bg-amber-50 rounded-lg">
          <p className="text-sm font-medium text-amber-900 mb-1">Symptoms:</p>
          <p className="text-sm text-gray-700">{appointment.symptoms}</p>
        </div>
      )}

      {appointment.reason && (
        <div className="mb-4 p-3 bg-blue-50 rounded-lg">
          <p className="text-sm font-medium text-blue-900 mb-1">Reason:</p>
          <p className="text-sm text-gray-700">{appointment.reason}</p>
        </div>
      )}

      {appointment.notes && (
        <div className="mb-4 p-3 bg-purple-50 rounded-lg">
          <p className="text-sm font-medium text-purple-900 mb-1">Your Notes:</p>
          <p className="text-sm text-gray-700">{appointment.notes}</p>
        </div>
      )}

      <div className="flex items-center gap-3 flex-wrap pt-4 border-t">
        {["scheduled", "confirmed"].includes(appointment.status) && (
          <Button
            onClick={() => handleStartConsultation(appointment)}
            size="sm"
          >
            {getConsultationIcon(appointment.channel || appointment.consultationType)}
            <span className="ml-2">Start Consultation</span>
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleAddNotes(appointment)}
        >
          <FileText className="h-4 w-4 mr-2" />
          {appointment.notes ? "Edit Notes" : "Add Notes"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleUpdateStatus(appointment)}
        >
          Update Status
        </Button>
      </div>
    </Card>
  );

  return (
    <MainLayout>
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">My Appointments</h1>
            <p className="text-gray-600 mt-1">Manage your patient appointments</p>
          </div>
        </div>

        {/* Search and Filters */}
        <Card className="p-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search by patient name, email, or phone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-gray-400" />
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger>
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="scheduled">Scheduled</SelectItem>
                  <SelectItem value="confirmed">Confirmed</SelectItem>
                  <SelectItem value="in-progress">In Progress</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </Card>

        {/* Appointments Tabs */}
        <Tabs defaultValue="today" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="today">
              Today ({todayAppointments.length})
            </TabsTrigger>
            <TabsTrigger value="upcoming">
              Upcoming ({upcomingAppointments.length})
            </TabsTrigger>
            <TabsTrigger value="past">
              Past ({pastAppointments.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="today" className="space-y-4 mt-6">
            {todayAppointments.length === 0 ? (
              <Card className="p-12 text-center">
                <Calendar className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                <h3 className="text-lg font-semibold mb-2">No Appointments Today</h3>
                <p className="text-gray-600">You have no scheduled appointments for today.</p>
              </Card>
            ) : (
              todayAppointments.map((appointment: Appointment) => (
                <AppointmentCard key={appointment.id} appointment={appointment} />
              ))
            )}
          </TabsContent>

          <TabsContent value="upcoming" className="space-y-4 mt-6">
            {upcomingAppointments.length === 0 ? (
              <Card className="p-12 text-center">
                <Calendar className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                <h3 className="text-lg font-semibold mb-2">No Upcoming Appointments</h3>
                <p className="text-gray-600">You have no upcoming appointments scheduled.</p>
              </Card>
            ) : (
              upcomingAppointments.map((appointment: Appointment) => (
                <AppointmentCard key={appointment.id} appointment={appointment} />
              ))
            )}
          </TabsContent>

          <TabsContent value="past" className="space-y-4 mt-6">
            {pastAppointments.length === 0 ? (
              <Card className="p-12 text-center">
                <Calendar className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                <h3 className="text-lg font-semibold mb-2">No Past Appointments</h3>
                <p className="text-gray-600">You have no past appointments.</p>
              </Card>
            ) : (
              pastAppointments.map((appointment: Appointment) => (
                <AppointmentCard key={appointment.id} appointment={appointment} />
              ))
            )}
          </TabsContent>
        </Tabs>

        {/* Notes Dialog */}
        <Dialog open={notesDialogOpen} onOpenChange={setNotesDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add/Edit Notes</DialogTitle>
              <DialogDescription>
                Add consultation notes for {selectedAppointment?.patientName}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <Label>Consultation Notes</Label>
                <Textarea
                  placeholder="Enter your consultation notes..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={6}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setNotesDialogOpen(false)}
                disabled={updateNotesMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                onClick={() =>
                  selectedAppointment &&
                  updateNotesMutation.mutate({
                    id: selectedAppointment.id,
                    notes,
                  })
                }
                disabled={updateNotesMutation.isPending}
              >
                {updateNotesMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save Notes"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Status Update Dialog */}
        <Dialog open={statusDialogOpen} onOpenChange={setStatusDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Update Appointment Status</DialogTitle>
              <DialogDescription>
                Update status for {selectedAppointment?.patientName}'s appointment
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <Label>Status</Label>
                <Select value={newStatus} onValueChange={setNewStatus}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="scheduled">Scheduled</SelectItem>
                    <SelectItem value="confirmed">Confirmed</SelectItem>
                    <SelectItem value="in-progress">In Progress</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                    <SelectItem value="no-show">No Show</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setStatusDialogOpen(false)}
                disabled={updateStatusMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                onClick={() =>
                  selectedAppointment &&
                  updateStatusMutation.mutate({
                    id: selectedAppointment.id,
                    status: newStatus,
                    appointment: selectedAppointment,
                  })
                }
                disabled={updateStatusMutation.isPending}
              >
                {updateStatusMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Updating...
                  </>
                ) : (
                  "Update Status"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
};

export default DoctorAppointments;
