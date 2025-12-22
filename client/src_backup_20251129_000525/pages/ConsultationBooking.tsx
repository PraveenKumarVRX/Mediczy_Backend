import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { format, addDays, startOfToday, isWeekend } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import {
  Calendar,
  Clock,
  Video,
  CalendarCheck,
  AlertCircle,
  MessageCircle,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import MainLayout from "@/components/layout/MainLayout";
import { Badge } from "@/components/ui/badge";
import api from "@/utils/api";
import { useAuth } from "@/auth/AuthProvider";

interface TimeSlot {
  time: string;
  available: boolean;
}

// Generate next 14 available dates
const getAvailableDates = () => {
  const dates = [];
  let currentDate = startOfToday();
  
  for (let i = 0; i < 14; i++) {
    const nextDate = addDays(currentDate, i);
    dates.push({
      date: format(nextDate, "yyyy-MM-dd"),
      formatted: format(nextDate, "dd MMM, EEE"),
      dayName: format(nextDate, "EEEE"),
      dayOfWeek: nextDate.getDay()
    });
  }
  return dates;
};

const ConsultationBooking = () => {
  const { doctorId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { currentUser } = useAuth();

  const [doctor, setDoctor] = useState<any>(null);
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedTime, setSelectedTime] = useState("");
  const [consultationType, setConsultationType] = useState("online");
  const [selectedClinicId, setSelectedClinicId] = useState<string | null>(null);
  const [symptoms, setSymptoms] = useState("");
  const [reason, setReason] = useState("");
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [availableDates] = useState(getAvailableDates());
  const [bookingLoading, setBookingLoading] = useState(false);
  const [doctorLoading, setDoctorLoading] = useState(true);

  // Fetch doctor details using the enhanced doctors API
  useEffect(() => {
    const fetchDoctor = async () => {
      if (!doctorId) return;

      try {
        setDoctorLoading(true);
        const { data } = await api.get(`/doctors/${doctorId}/public`);
        setDoctor(data?.doctor || data);
      } catch (error) {
        console.error("Fetch doctor error:", error);
        toast({
          title: "Error",
          description: "Unable to load doctor details. Please try again.",
          variant: "destructive",
        });
        navigate("/consultation");
      } finally {
        setDoctorLoading(false);
      }
    };

    fetchDoctor();
  }, [doctorId, navigate, toast]);

  // Fetch available slots for selected date
  const { data: availableSlots = [], isLoading: slotsLoading } = useQuery({
    queryKey: ["availableSlots", doctorId, selectedDate],
    queryFn: async () => {
      if (!selectedDate) return [];
      const { data } = await api.get(`/doctors/${doctorId}/slots`, {
        params: {
          date: selectedDate,
          consultationType,
          clinicId: consultationType === 'walkin' ? selectedClinicId : undefined,
        },
      });
      return data.slots || [];
    },
    enabled: !!selectedDate && !!doctorId,
  });

  const handleDateSelect = (date: string) => {
    setSelectedDate(date);
    setSelectedTime("");
  };

  const handleTimeSelect = (time: string) => {
    setSelectedTime(time);
  };

  const handleBooking = () => {
    if (!symptoms.trim() && !reason.trim()) {
      toast({
        title: "Required",
        description: "Please provide symptoms or reason for consultation",
        variant: "destructive",
      });
      return;
    }
    setShowConfirmDialog(true);
  };

  const confirmBooking = async () => {
    try {
      setBookingLoading(true);

      const fee =
        doctor?.consultationFee ??
        doctor?.serviceTiers?.[0]?.price ??
        0;

      const bookingData = {
        doctorId: doctor?._id,
        appointmentDate: selectedDate,
        appointmentTime: selectedTime,
        consultationType,
        clinicId: consultationType === 'walkin' ? selectedClinicId : undefined,
        symptoms: symptoms.trim(),
        reason: reason.trim(),
        consultationFee: fee,
      };

      const { data } = await api.post("/appointments", bookingData);

      toast({
        title: "Success",
        description: "Consultation booked successfully!",
      });

      setShowConfirmDialog(false);
      
      // Redirect to my bookings page
      navigate("/my-bookings");
    } catch (error: any) {
      console.error("Booking error:", error);
      toast({
        title: "Error",
        description: error.response?.data?.message || "Failed to book consultation",
        variant: "destructive",
      });
    } finally {
      setBookingLoading(false);
    }
  };

  const handleInstantChat = () => {
    navigate(`/chat?doctorId=${doctor?._id}&instant=true`);
  };

  if (doctorLoading) {
    return (
      <MainLayout>
        <div className="container mx-auto px-4 py-12 flex justify-center">
          <div className="flex items-center gap-3 text-gray-500">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Loading doctor details...</span>
          </div>
        </div>
      </MainLayout>
    );
  }

  if (!doctor) {
    return (
      <MainLayout>
        <div className="container mx-auto px-4 py-12 flex flex-col items-center gap-3 text-center">
          <AlertCircle className="h-8 w-8 text-red-500" />
          <p className="text-gray-600">Doctor details could not be loaded.</p>
          <Button variant="outline" onClick={() => navigate("/consultation")}>
            Back to doctors
          </Button>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl font-bold mb-8">
            Book {consultationType === 'walkin' ? 'Walk-in' : 'Online'} Consultation
          </h1>

          <Card className="p-6 mb-8">
            <div className="flex items-start gap-6">
              <img
                src={doctor.profileImage || "/default-doctor.png"}
                alt={`Dr. ${doctor.firstName} ${doctor.lastName}`}
                className="w-32 h-32 rounded-lg object-cover"
              />
              <div className="flex-1">
                <div className="flex justify-between items-start">
                  <div>
                    <h2 className="text-2xl font-semibold">
                      Dr. {doctor.firstName} {doctor.lastName}
                    </h2>
                    <p className="text-gray-600">{doctor.specialization}</p>
                    <p className="text-gray-600">{doctor.experience} years experience</p>
                    <p className="text-gray-600">
                      Consultation Fee: ₹
                      {doctor.consultationFee ?? doctor.serviceTiers?.[0]?.price ?? "-"}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    className="flex items-center gap-2"
                    onClick={handleInstantChat}
                  >
                    <MessageCircle className="h-4 w-4" />
                    Chat Now
                  </Button>
                </div>
                {doctor.availability?.status === "Available" && (
                  <Badge className="mt-2 bg-green-100 text-green-800">
                    Available for Instant Consultation
                  </Badge>
                )}
              </div>
            </div>
          </Card>

          {/* Symptoms & Reason */}
          <Card className="p-6 mb-8">
            <h3 className="text-lg font-semibold mb-4">Consultation Details</h3>
            <div className="space-y-4">
              <div>
                <Label>Consultation Type</Label>
                <Select
                  value={consultationType}
                  onValueChange={(value) => {
                    setConsultationType(value);
                    setSelectedTime('');
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="online">Online</SelectItem>
                    <SelectItem value="walkin">Walk-in</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {consultationType === 'walkin' && doctor?.clinics?.length > 0 && (
                <div>
                  <Label>Clinic / Hospital</Label>
                  <Select
                    value={selectedClinicId ?? undefined}
                    onValueChange={(value) => {
                      setSelectedClinicId(value);
                      setSelectedTime('');
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select clinic" />
                    </SelectTrigger>
                    <SelectContent>
                      {doctor.clinics.map((clinic: any) => (
                        <SelectItem key={clinic.id} value={clinic.id}>
                          {clinic.name} - {clinic.city}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div>
                <Label>Symptoms (Optional)</Label>
                <Textarea
                  placeholder="Describe your symptoms..."
                  value={symptoms}
                  onChange={(e) => setSymptoms(e.target.value)}
                  rows={3}
                />
              </div>
              <div>
                <Label>Reason for Consultation</Label>
                <Textarea
                  placeholder="Why do you need this consultation?"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
          </Card>

          <div className="grid md:grid-cols-2 gap-8">
            {/* Date Selection */}
            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Select Date
              </h3>
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {availableDates.map((date) => (
                  <Button
                    key={date.date}
                    variant={selectedDate === date.date ? "default" : "outline"}
                    className="w-full justify-start"
                    onClick={() => handleDateSelect(date.date)}
                  >
                    <div className="flex flex-col items-start">
                      <span className="font-medium">{date.formatted}</span>
                      <span className="text-sm text-gray-500">{date.dayName}</span>
                    </div>
                  </Button>
                ))}
              </div>
            </Card>

            {/* Time Selection */}
            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Select Time
              </h3>
              {slotsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : selectedDate ? (
                availableSlots.length > 0 ? (
                  <div className="grid grid-cols-3 gap-2 max-h-[400px] overflow-y-auto">
                    {availableSlots.map((slot: TimeSlot) => (
                      <Button
                        key={slot.time}
                        variant={selectedTime === slot.time ? "default" : "outline"}
                        className="w-full text-sm"
                        disabled={!slot.available}
                        onClick={() => handleTimeSelect(slot.time)}
                      >
                        {slot.time}
                      </Button>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500">No slots available for this date</p>
                )
              ) : (
                <p className="text-gray-500">Please select a date first</p>
              )}
            </Card>
          </div>

          <div className="mt-8 flex justify-end gap-4">
            <Button
              variant="outline"
              onClick={() => navigate("/consultation")}
            >
              Cancel
            </Button>
            <Button
              size="lg"
              disabled={!selectedDate || !selectedTime || bookingLoading}
              onClick={handleBooking}
            >
              {bookingLoading ? (
                <>
                  <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                  Booking...
                </>
              ) : (
                <>
                  <CalendarCheck className="h-5 w-5 mr-2" />
                  Book Consultation - ₹
                  {doctor?.consultationFee ?? doctor?.serviceTiers?.[0]?.price ?? "-"}
                </>
              )}
            </Button>
          </div>

          <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Confirm Booking</DialogTitle>
                <DialogDescription>
                  Please review your booking details before confirming.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <p><strong>Doctor:</strong> Dr. {doctor?.firstName} {doctor?.lastName}</p>
                  <p><strong>Specialization:</strong> {doctor?.specialization}</p>
                  <p><strong>Date:</strong> {selectedDate}</p>
                  <p><strong>Time:</strong> {selectedTime}</p>
                  <p><strong>Type:</strong> {consultationType === 'walkin' ? 'Walk-in' : 'Online'}</p>
                  <p>
                    <strong>Fee:</strong> ₹
                    {doctor?.consultationFee ?? doctor?.serviceTiers?.[0]?.price ?? "-"}
                  </p>
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setShowConfirmDialog(false)}
                  disabled={bookingLoading}
                >
                  Cancel
                </Button>
                <Button
                  onClick={confirmBooking}
                  disabled={bookingLoading}
                >
                  {bookingLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Booking...
                    </>
                  ) : (
                    <>
                      <CalendarCheck className="h-4 w-4 mr-2" />
                      Confirm Booking
                    </>
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </MainLayout>
  );
};

export default ConsultationBooking; 