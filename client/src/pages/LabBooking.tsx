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
  FlaskConical,
  FileText,
  CheckCircle2,
  ShieldCheck,
  Sparkles
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import api from "@/utils/api";
import { useAuth } from "@/auth/AuthProvider";

interface TimeSlot {
  time: string;
  available: boolean;
}

interface Lab {
  id: number;
  _id?: string;
  name: string;
  address?: string;
  phone?: string;
  rating?: number;
  accreditation?: string[];
}

interface Test {
  id: number;
  name: string;
  price: number;
  duration: string;
}

const LabBooking = () => {
  const { labId } = useParams<{ labId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { currentUser } = useAuth();
  const { toast } = useToast();

  // Get service type from query parameter
  const serviceTypeFromQuery = searchParams.get("serviceType") || "checkup";

  const [lab, setLab] = useState<Lab | null>(null);
  const [labLoading, setLabLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedTime, setSelectedTime] = useState("");
  const [serviceType, setServiceType] = useState<string>(serviceTypeFromQuery);
  const [selectedTests, setSelectedTests] = useState<number[]>([]);
  const [symptoms, setSymptoms] = useState("");
  const [notes, setNotes] = useState("");
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [bookingLoading, setBookingLoading] = useState(false);

  // Fetch lab details
  useEffect(() => {
    let cancelled = false;

    const fetchLab = async () => {
      if (!labId) return;

      try {
        setLabLoading(true);
        const { data } = await api.get(`/labs/${labId}`);
        
        if (!cancelled) {
          setLab(data.lab || data);
        }
      } catch (error: any) {
        console.error("Fetch lab error:", error);
        if (!cancelled) {
          toast({
            title: "Error",
            description: "Failed to load lab details",
            variant: "destructive",
          });
          navigate("/appointments");
        }
      } finally {
        if (!cancelled) {
          setLabLoading(false);
        }
      }
    };

    fetchLab();
    return () => {
      cancelled = true;
    };
  }, [labId, navigate, toast]);

  // Fetch available tests
  const { data: availableTests = [] } = useQuery<Test[]>({
    queryKey: ["labTests", labId, serviceType],
    queryFn: async () => {
      const { data } = await api.get(`/labs/${labId}/tests`, {
        params: { serviceType },
      });
      return data.tests || [];
    },
    enabled: !!labId,
  });

  // Generate available dates (next 7 days)
  const availableDates = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(startOfToday(), i + 1);
    return format(date, "yyyy-MM-dd");
  });

  // Generate time slots
  const availableSlots: TimeSlot[] = [
    { time: "08:00", available: true },
    { time: "09:00", available: true },
    { time: "10:00", available: true },
    { time: "11:00", available: true },
    { time: "14:00", available: true },
    { time: "15:00", available: true },
    { time: "16:00", available: true },
  ];

  const handleDateSelect = (date: string) => {
    setSelectedDate(date);
    setSelectedTime("");
  };

  const handleTimeSelect = (time: string) => {
    setSelectedTime(time);
  };

  const handleTestToggle = (testId: number) => {
    setSelectedTests((prev) =>
      prev.includes(testId)
        ? prev.filter((id) => id !== testId)
        : [...prev, testId]
    );
  };

  const calculateTotalFee = () => {
    const testsTotal = selectedTests.reduce((sum, testId) => {
      const test = availableTests.find((t) => t.id === testId);
      return sum + (test?.price || 0);
    }, 0);
    return testsTotal;
  };

  const handleBooking = () => {
    if (!currentUser) {
      toast({
        title: "Login required",
        description: "Please sign in before booking.",
        variant: "destructive",
      });
      navigate("/login", { state: { redirectTo: `/lab-booking/${labId}?serviceType=${serviceType}` } });
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

    if (selectedTests.length === 0) {
      toast({
        title: "No tests selected",
        description: "Please select at least one test to book.",
        variant: "destructive",
      });
      return;
    }

    setShowConfirmDialog(true);
  };

  const confirmBooking = async () => {
    try {
      setBookingLoading(true);

      const labIdentifier = (lab?.id ?? lab?._id ?? labId)?.toString();

      if (!labIdentifier || !/^\d+$/.test(labIdentifier)) {
        toast({
          title: "Booking unavailable",
          description: "Invalid lab identifier. Please try again.",
          variant: "destructive",
        });
        return;
      }

      const tests = selectedTests.map((testId) => {
        const test = availableTests.find((t) => t.id === testId);
        return {
          id: testId,
          name: test?.name || "",
          price: test?.price || 0,
        };
      });

      const bookingData = {
        labId: parseInt(labIdentifier, 10),
        appointmentDate: selectedDate,
        appointmentTime: selectedTime,
        serviceType,
        tests,
        testType: serviceType === "checkup" ? "Health Checkup" : "Diagnostic Test",
        symptoms: symptoms.trim(),
        notes: notes.trim(),
        patientName: currentUser?.name || `${currentUser?.firstName} ${currentUser?.lastName}`,
        patientPhone: currentUser?.phoneNumber || currentUser?.phone,
      };

      const { data } = await api.post("/labs/book", bookingData);

      toast({
        title: "Success",
        description: "Lab appointment booked successfully!",
      });

      setShowConfirmDialog(false);
      
      // Redirect to appointments page
      navigate("/appointments");
    } catch (error: any) {
      console.error("Booking error:", error);
      toast({
        title: "Error",
        description: error.response?.data?.message || "Failed to book lab appointment",
        variant: "destructive",
      });
    } finally {
      setBookingLoading(false);
    }
  };

  if (labLoading) {
    return (
      <MainLayout>
        <div className="container mx-auto px-4 py-12 flex justify-center">
          <div className="flex items-center gap-3 text-gray-500">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Loading lab details...</span>
          </div>
        </div>
      </MainLayout>
    );
  }

  if (!lab) {
    return (
      <MainLayout>
        <div className="container mx-auto px-4 py-12 flex flex-col items-center gap-3 text-center">
          <AlertCircle className="h-8 w-8 text-red-500" />
          <p className="text-gray-600">Lab details could not be loaded.</p>
          <Button variant="outline" onClick={() => navigate("/appointments")}>
            Back to appointments
          </Button>
        </div>
      </MainLayout>
    );
  }

  const totalFee = calculateTotalFee();
  const bookingSteps = [
    { id: 1, label: 'Choose tests', done: selectedTests.length > 0 },
    { id: 2, label: 'Pick slot', done: Boolean(selectedDate && selectedTime) },
    { id: 3, label: 'Confirm booking', done: false }
  ];

  return (
    <MainLayout>
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <div className="mb-8 rounded-2xl bg-gradient-to-r from-cyan-700 via-sky-700 to-blue-700 p-6 md:p-7 text-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-medium mb-3">
                  <Sparkles className="h-3.5 w-3.5" />
                  Fast, certified diagnostics
                </div>
                <h1 className="text-2xl md:text-3xl font-bold mb-1">Book Lab Appointment</h1>
                <p className="text-sky-100 text-sm md:text-base">Schedule trusted tests with transparent pricing and quick slots.</p>
              </div>
              <div className="rounded-xl bg-white/10 px-4 py-3 backdrop-blur-sm">
                <p className="text-xs text-sky-100">Current test total</p>
                <p className="text-2xl font-bold">₹{totalFee}</p>
              </div>
            </div>
            <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {bookingSteps.map((step) => (
                <div key={step.id} className={`rounded-lg px-3 py-2 text-sm border ${step.done ? 'bg-emerald-500/20 border-emerald-300/40 text-emerald-50' : 'bg-white/10 border-white/20 text-sky-50'}`}>
                  <span className="font-semibold">Step {step.id}:</span> {step.label}
                </div>
              ))}
            </div>
          </div>

          <Card className="p-6 mb-8 shadow-lg border-slate-200/80">
            <div className="flex items-start gap-6">
              <div className="w-20 h-20 rounded-lg bg-primary/10 flex items-center justify-center">
                <FlaskConical className="h-10 w-10 text-primary" />
              </div>
              <div className="flex-1">
                <div className="flex justify-between items-start">
                  <div>
                    <h2 className="text-2xl font-semibold">{lab.name}</h2>
                    {lab.address && (
                      <p className="text-gray-600 mt-1">{lab.address}</p>
                    )}
                    {lab.phone && (
                      <p className="text-sm text-gray-500 mt-1">📞 {lab.phone}</p>
                    )}
                  </div>
                </div>
                {lab.rating && (
                  <div className="flex items-center gap-2 mt-3">
                    <Badge variant="secondary">
                      ⭐ {(+lab.rating).toFixed(1)}
                    </Badge>
                    {lab.accreditation && lab.accreditation.length > 0 && (
                      <Badge variant="outline">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Accredited
                      </Badge>
                    )}
                    <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                      <ShieldCheck className="h-3 w-3 mr-1" />
                      Safe sample handling
                    </Badge>
                  </div>
                )}
              </div>
            </div>
          </Card>

          <Card className="p-6 mb-8 shadow-lg border-slate-200/80">
            <h3 className="text-lg font-semibold mb-4">Service Type</h3>
            <RadioGroup value={serviceType} onValueChange={setServiceType}>
              <div className="flex items-center space-x-2 p-3 border rounded-lg">
                <RadioGroupItem value="checkup" id="checkup" />
                <Label htmlFor="checkup" className="flex-1 cursor-pointer">
                  <div className="font-medium">Health Checkup</div>
                  <div className="text-sm text-gray-500">Routine blood tests and general health screening</div>
                </Label>
              </div>
              <div className="flex items-center space-x-2 p-3 border rounded-lg">
                <RadioGroupItem value="diagnostic" id="diagnostic" />
                <Label htmlFor="diagnostic" className="flex-1 cursor-pointer">
                  <div className="font-medium">Diagnostic Tests</div>
                  <div className="text-sm text-gray-500">Specialized tests and imaging services</div>
                </Label>
              </div>
            </RadioGroup>
          </Card>

          <Card className="p-6 mb-8 shadow-lg border-slate-200/80">
            <h3 className="text-lg font-semibold mb-4">Select Tests</h3>
            <div className="space-y-2">
              {availableTests.map((test) => (
                <div
                  key={test.id}
                  className="flex items-start space-x-3 p-3 border rounded-lg hover:bg-gray-50"
                >
                  <Checkbox
                    id={`test-${test.id}`}
                    checked={selectedTests.includes(test.id)}
                    onCheckedChange={() => handleTestToggle(test.id)}
                  />
                  <Label
                    htmlFor={`test-${test.id}`}
                    className="flex-1 cursor-pointer"
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-medium">{test.name}</div>
                        <div className="text-sm text-gray-500">{test.duration}</div>
                      </div>
                      <div className="font-semibold text-primary">₹{test.price}</div>
                    </div>
                  </Label>
                </div>
              ))}
            </div>
            {selectedTests.length > 0 && (
              <div className="mt-4 pt-4 border-t">
                <div className="flex justify-between items-center">
                  <span className="font-semibold">Total Fee:</span>
                  <span className="text-2xl font-bold text-primary">₹{totalFee}</span>
                </div>
              </div>
            )}
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <Card className="p-6 shadow-lg border-slate-200/80">
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

            <Card className="p-6 shadow-lg border-slate-200/80">
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

          <Card className="p-6 mb-8 shadow-lg border-slate-200/80">
            <h3 className="text-lg font-semibold mb-4">Additional Information</h3>
            <div className="space-y-4">
              <div>
                <Label htmlFor="symptoms">Symptoms or Health Concerns (Optional)</Label>
                <Textarea
                  id="symptoms"
                  value={symptoms}
                  onChange={(e) => setSymptoms(e.target.value)}
                  placeholder="Describe any symptoms or health concerns..."
                  rows={3}
                />
              </div>
              <div>
                <Label htmlFor="notes">Additional Notes (Optional)</Label>
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Any additional information..."
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
              disabled={!selectedDate || !selectedTime || selectedTests.length === 0}
              className="flex-1"
            >
              <CalendarCheck className="h-4 w-4 mr-2" />
              Book Appointment (₹{totalFee})
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
              <p className="text-sm text-gray-500">Lab</p>
              <p className="font-medium">{lab.name}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Service Type</p>
              <p className="font-medium capitalize">{serviceType}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Tests Selected</p>
              <ul className="list-disc list-inside">
                {selectedTests.map((testId) => {
                  const test = availableTests.find((t) => t.id === testId);
                  return (
                    <li key={testId} className="text-sm">
                      {test?.name} - ₹{test?.price}
                    </li>
                  );
                })}
              </ul>
            </div>
            <div>
              <p className="text-sm text-gray-500">Date & Time</p>
              <p className="font-medium">
                {format(new Date(selectedDate), "EEEE, MMM d, yyyy")} at {selectedTime}
              </p>
            </div>
            <div className="pt-2 border-t">
              <p className="text-sm text-gray-500">Total Fee</p>
              <p className="text-xl font-bold text-primary">₹{totalFee}</p>
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

export default LabBooking;
