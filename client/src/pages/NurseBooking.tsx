import { useState, useEffect } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { format, addDays, startOfToday } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import {
  Calendar,
  Clock,
  CalendarCheck,
  AlertCircle,
  Loader2,
  User,
  Stethoscope
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import MainLayout from "@/components/layout/MainLayout";
import { Badge } from "@/components/ui/badge";
import api from "@/utils/api";
import { useAuth } from "@/auth/AuthProvider";

interface TimeSlot {
  time: string;
  available: boolean;
}

interface Nurse {
  id: number;
  _id?: string;
  firstName: string;
  lastName: string;
  name?: string;
  specialization?: string;
  experience?: number;
  profileImage?: string;
  rating?: number;
  consultationFee?: number;
  availability?: any;
}

const NurseBooking = () => {
  const { nurseId } = useParams<{ nurseId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { currentUser } = useAuth();
  const { toast } = useToast();

  const [nurse, setNurse] = useState<Nurse | null>(null);
  const [nurseLoading, setNurseLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedTime, setSelectedTime] = useState("");
  const [symptoms, setSymptoms] = useState("");
  const [notes, setNotes] = useState("");
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [bookingLoading, setBookingLoading] = useState(false);

  // Fetch nurse details
  useEffect(() => {
    let cancelled = false;

    const fetchNurse = async () => {
      if (!nurseId) return;

      try {
        setNurseLoading(true);
        const { data } = await api.get(`/nurses/${nurseId}`);
        
        if (!cancelled) {
          setNurse(data.nurse || data);
        }
      } catch (error: any) {
        console.error("Fetch nurse error:", error);
        if (!cancelled) {
          toast({
            title: "Error",
            description: "Failed to load nurse details",
            variant: "destructive",
          });
          navigate("/appointments");
        }
      } finally {
        if (!cancelled) {
          setNurseLoading(false);
        }
      }
    };

    fetchNurse();
    return () => {
      cancelled = true;
    };
  }, [nurseId, navigate, toast]);

  // Generate available dates (next 7 days)
  const availableDates = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(startOfToday(), i + 1);
    return format(date, "yyyy-MM-dd");
  });

  // Generate time slots
  const availableSlots: TimeSlot[] = [
    { time: "09:00", available: true },
    { time: "10:00", available: true },
    { time: "11:00", available: true },
    { time: "14:00", available: true },
    { time: "15:00", available: true },
    { time: "16:00", available: true },
    { time: "17:00", available: true },
  ];

  const handleDateSelect = (date: string) => {
    setSelectedDate(date);
    setSelectedTime("");
  };

  const handleTimeSelect = (time: string) => {
    setSelectedTime(time);
  };

  const handleBooking = () => {
    if (!currentUser) {
      toast({
        title: "Login required",
        description: "Please sign in before booking.",
        variant: "destructive",
      });
      navigate("/login", { state: { redirectTo: `/nurse-booking/${nurseId}` } });
      return;
    }

    if (!selectedDate || !selectedTime) {
      toast({
        title: "Incomplete details",
        description: "Select both a date and time before continuing.",
        variant: "destructive",
      });
      return;
    }

    if (!symptoms.trim() && !notes.trim()) {
      toast({
        title: "Required",
        description: "Please provide symptoms or reason for visit",
        variant: "destructive",
      });
      return;
    }
    setShowConfirmDialog(true);
  };

  const confirmBooking = async () => {
    try {
      setBookingLoading(true);

      const nurseIdentifier = (nurse?.id ?? nurse?._id ?? nurseId)?.toString();

      if (!nurseIdentifier || !/^\d+$/.test(nurseIdentifier)) {
        toast({
          title: "Booking unavailable",
          description: "Invalid nurse identifier. Please try again.",
          variant: "destructive",
        });
        return;
      }

      const fee = nurse?.consultationFee ?? 500;

      const bookingData = {
        nurseId: parseInt(nurseIdentifier, 10),
        appointmentDate: selectedDate,
        appointmentTime: selectedTime,
        serviceType: "general",
        symptoms: symptoms.trim(),
        notes: notes.trim(),
        patientName: currentUser?.name || `${currentUser?.firstName} ${currentUser?.lastName}`,
        patientPhone: currentUser?.phoneNumber || currentUser?.phone,
      };

      const { data } = await api.post("/nurses/book", bookingData);

      toast({
        title: "Success",
        description: "Nurse appointment booked successfully!",
      });

      setShowConfirmDialog(false);
      
      // Redirect to appointments page
      navigate("/appointments");
    } catch (error: any) {
      console.error("Booking error:", error);
      toast({
        title: "Error",
        description: error.response?.data?.message || "Failed to book appointment",
        variant: "destructive",
      });
    } finally {
      setBookingLoading(false);
    }
  };

  if (nurseLoading) {
    return (
      <MainLayout>
        <div className="container mx-auto px-4 py-12 flex justify-center">
          <div className="flex items-center gap-3 text-gray-500">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Loading nurse details...</span>
          </div>
        </div>
      </MainLayout>
    );
  }

  if (!nurse) {
    return (
      <MainLayout>
        <div className="container mx-auto px-4 py-12 flex flex-col items-center gap-3 text-center">
          <AlertCircle className="h-8 w-8 text-red-500" />
          <p className="text-gray-600">Nurse details could not be loaded.</p>
          <Button variant="outline" onClick={() => navigate("/appointments")}>
            Back to appointments
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
            Book Nurse Appointment
          </h1>

          <Card className="p-6 mb-8">
            <div className="flex items-start gap-6">
              <div className="w-32 h-32 rounded-lg bg-gray-100 flex items-center justify-center">
                {nurse.profileImage ? (
                  <img
                    src={nurse.profileImage}
                    alt={`${nurse.firstName} ${nurse.lastName}`}
                    className="w-full h-full rounded-lg object-cover"
                  />
                ) : (
                  <User className="h-16 w-16 text-gray-400" />
                )}
              </div>
              <div className="flex-1">
                <div className="flex justify-between items-start">
                  <div>
                    <h2 className="text-2xl font-semibold">
                      {nurse.firstName} {nurse.lastName}
                    </h2>
                    {nurse.specialization && (
                      <p className="text-gray-600">{nurse.specialization}</p>
                    )}
                    {nurse.experience && (
                      <p className="text-sm text-gray-500 mt-1">
                        {nurse.experience} years experience
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-primary">
                      ₹{nurse.consultationFee || 500}
                    </p>
                    <p className="text-sm text-gray-500">per visit</p>
                  </div>
                </div>
                {nurse.rating && (
                  <div className="flex items-center gap-2 mt-3">
                    <Badge variant="secondary">
                      ⭐ {(+nurse.rating).toFixed(1)}
                    </Badge>
                  </div>
                )}
              </div>
            </div>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <Card className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <Calendar className="h-5 w-5 text-primary" />
                <h3 className="text-lg font-semibold">Select Date</h3>
              </div>
              <div className="space-y-2">
                {availableDates.map((date) => (
                  <button
                    key={date}
                    onClick={() => handleDateSelect(date)}
                    className={`w-full p-3 text-left rounded-lg border transition-colors ${
                      selectedDate === date
                        ? "border-primary bg-primary/10"
                        : "border-gray-200 hover:border-primary/50"
                    }`}
                  >
                    {format(new Date(date), "EEEE, MMM d, yyyy")}
                  </button>
                ))}
              </div>
            </Card>

            <Card className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <Clock className="h-5 w-5 text-primary" />
                <h3 className="text-lg font-semibold">Select Time</h3>
              </div>
              {!selectedDate ? (
                <p className="text-gray-500 text-center py-8">
                  Please select a date first
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {availableSlots.map((slot) => (
                    <button
                      key={slot.time}
                      onClick={() => handleTimeSelect(slot.time)}
                      disabled={!slot.available}
                      className={`p-3 rounded-lg border transition-colors ${
                        selectedTime === slot.time
                          ? "border-primary bg-primary/10"
                          : slot.available
                          ? "border-gray-200 hover:border-primary/50"
                          : "border-gray-100 bg-gray-50 text-gray-400 cursor-not-allowed"
                      }`}
                    >
                      {slot.time}
                    </button>
                  ))}
                </div>
              )}
            </Card>
          </div>

          <Card className="p-6 mb-8">
            <h3 className="text-lg font-semibold mb-4">Visit Details</h3>
            <div className="space-y-4">
              <div>
                <Label htmlFor="symptoms">Symptoms or Health Concerns</Label>
                <Textarea
                  id="symptoms"
                  value={symptoms}
                  onChange={(e) => setSymptoms(e.target.value)}
                  placeholder="Describe your symptoms or health concerns..."
                  rows={3}
                />
              </div>
              <div>
                <Label htmlFor="notes">Additional Notes (Optional)</Label>
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Any additional information for the nurse..."
                  rows={2}
                />
              </div>
            </div>
          </Card>

          <div className="flex gap-4">
            <Button
              variant="outline"
              onClick={() => navigate("/appointments")}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={handleBooking}
              disabled={!selectedDate || !selectedTime || (!symptoms.trim() && !notes.trim())}
              className="flex-1"
            >
              <CalendarCheck className="h-4 w-4 mr-2" />
              Book Appointment
            </Button>
          </div>
        </div>
      </div>

      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Booking</DialogTitle>
            <DialogDescription>
              Please review your appointment details
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-4">
            <div>
              <p className="text-sm text-gray-500">Nurse</p>
              <p className="font-medium">{nurse.firstName} {nurse.lastName}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Date & Time</p>
              <p className="font-medium">
                {format(new Date(selectedDate), "EEEE, MMM d, yyyy")} at {selectedTime}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Fee</p>
              <p className="font-medium">₹{nurse.consultationFee || 500}</p>
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
            <Button onClick={confirmBooking} disabled={bookingLoading}>
              {bookingLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Booking...
                </>
              ) : (
                "Confirm Booking"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
};

export default NurseBooking;
