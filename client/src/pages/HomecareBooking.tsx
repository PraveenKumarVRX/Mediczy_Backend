import { useState, useEffect } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { format, addDays, startOfToday } from "date-fns";
import {
  Calendar,
  Clock,
  CalendarCheck,
  AlertCircle,
  Loader2,
  Home,
  MapPin
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
import api from "@/utils/api";
import { useAuth } from "@/auth/AuthProvider";

interface TimeSlot {
  time: string;
  available: boolean;
}

interface HomecareProvider {
  id: number;
  _id?: string;
  name: string;
  services?: string[];
  phone?: string;
  rating?: number;
  coverageArea?: string;
}

const HomecareBooking = () => {
  const { homecareId } = useParams<{ homecareId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { currentUser } = useAuth();
  const { toast } = useToast();

  // Get service type from query parameter
  const serviceTypeFromQuery = searchParams.get("type") || "doctor";

  const [provider, setProvider] = useState<HomecareProvider | null>(null);
  const [providerLoading, setProviderLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedTime, setSelectedTime] = useState("");
  const [serviceType, setServiceType] = useState<string>(serviceTypeFromQuery);
  const [duration, setDuration] = useState<number>(60);
  const [symptoms, setSymptoms] = useState("");
  const [notes, setNotes] = useState("");
  const [address, setAddress] = useState({
    street: "",
    city: "",
    state: "",
    pincode: "",
  });
  const [emergencyContact, setEmergencyContact] = useState("");
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [bookingLoading, setBookingLoading] = useState(false);

  // Fetch homecare provider details
  useEffect(() => {
    let cancelled = false;

    const fetchProvider = async () => {
      if (!homecareId) return;

      try {
        setProviderLoading(true);
        const { data } = await api.get(`/homecare/${homecareId}`);
        
        if (!cancelled) {
          setProvider(data.provider || data);
        }
      } catch (error: any) {
        console.error("Fetch homecare error:", error);
        if (!cancelled) {
          toast({
            title: "Error",
            description: "Failed to load homecare provider details",
            variant: "destructive",
          });
          navigate("/appointments");
        }
      } finally {
        if (!cancelled) {
          setProviderLoading(false);
        }
      }
    };

    fetchProvider();
    return () => {
      cancelled = true;
    };
  }, [homecareId, navigate, toast]);

  // Pre-fill address from user profile
  useEffect(() => {
    if (currentUser && currentUser.address) {
      setAddress({
        street: currentUser.address.street || "",
        city: currentUser.address.city || "",
        state: currentUser.address.state || "",
        pincode: currentUser.address.pincode || "",
      });
    }
    if (currentUser && currentUser.phoneNumber) {
      setEmergencyContact(currentUser.phoneNumber);
    }
  }, [currentUser]);

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
    { time: "17:00", available: true },
  ];

  const handleDateSelect = (date: string) => {
    setSelectedDate(date);
    setSelectedTime("");
  };

  const handleTimeSelect = (time: string) => {
    setSelectedTime(time);
  };

  const calculateFee = () => {
    const baseFees = {
      doctor: 2000,
      nurse: 1000,
      lab: 1500,
    };
    const baseFee = baseFees[serviceType as keyof typeof baseFees] || 1500;
    const durationMultiplier = Math.ceil(duration / 60);
    return baseFee * durationMultiplier;
  };

  const handleBooking = () => {
    if (!currentUser) {
      toast({
        title: "Login required",
        description: "Please sign in before booking.",
        variant: "destructive",
      });
      navigate("/login", { state: { redirectTo: `/homecare-booking/${homecareId}?type=${serviceType}` } });
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

    if (!address.street || !address.city || !address.pincode) {
      toast({
        title: "Address required",
        description: "Please provide your complete address for homecare service.",
        variant: "destructive",
      });
      return;
    }

    setShowConfirmDialog(true);
  };

  const confirmBooking = async () => {
    try {
      setBookingLoading(true);

      const providerIdentifier = (provider?.id ?? provider?._id ?? homecareId)?.toString();

      if (!providerIdentifier || !/^\d+$/.test(providerIdentifier)) {
        toast({
          title: "Booking unavailable",
          description: "Invalid homecare provider identifier. Please try again.",
          variant: "destructive",
        });
        return;
      }

      const bookingData = {
        homecareId: parseInt(providerIdentifier, 10),
        appointmentDate: selectedDate,
        appointmentTime: selectedTime,
        serviceType,
        specificService: `${serviceType} home visit`,
        duration,
        symptoms: symptoms.trim(),
        notes: notes.trim(),
        patientName: currentUser?.name || `${currentUser?.firstName} ${currentUser?.lastName}`,
        patientPhone: currentUser?.phoneNumber || currentUser?.phone,
        patientAddress: address,
        emergencyContact: emergencyContact || currentUser?.phoneNumber,
      };

      const { data } = await api.post("/homecare/book", bookingData);

      toast({
        title: "Success",
        description: "Homecare appointment booked successfully!",
      });

      setShowConfirmDialog(false);
      
      // Redirect to appointments page
      navigate("/appointments");
    } catch (error: any) {
      console.error("Booking error:", error);
      toast({
        title: "Error",
        description: error.response?.data?.message || "Failed to book homecare appointment",
        variant: "destructive",
      });
    } finally {
      setBookingLoading(false);
    }
  };

  if (providerLoading) {
    return (
      <MainLayout>
        <div className="container mx-auto px-4 py-12 flex justify-center">
          <div className="flex items-center gap-3 text-gray-500">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Loading homecare provider details...</span>
          </div>
        </div>
      </MainLayout>
    );
  }

  if (!provider) {
    return (
      <MainLayout>
        <div className="container mx-auto px-4 py-12 flex flex-col items-center gap-3 text-center">
          <AlertCircle className="h-8 w-8 text-red-500" />
          <p className="text-gray-600">Homecare provider details could not be loaded.</p>
          <Button variant="outline" onClick={() => navigate("/appointments")}>
            Back to appointments
          </Button>
        </div>
      </MainLayout>
    );
  }

  const totalFee = calculateFee();

  return (
    <MainLayout>
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl font-bold mb-8">
            Book Homecare Service
          </h1>

          <Card className="p-6 mb-8">
            <div className="flex items-start gap-6">
              <div className="w-20 h-20 rounded-lg bg-primary/10 flex items-center justify-center">
                <Home className="h-10 w-10 text-primary" />
              </div>
              <div className="flex-1">
                <div className="flex justify-between items-start">
                  <div>
                    <h2 className="text-2xl font-semibold">{provider.name}</h2>
                    {provider.coverageArea && (
                      <p className="text-gray-600 mt-1">Coverage: {provider.coverageArea}</p>
                    )}
                    {provider.phone && (
                      <p className="text-sm text-gray-500 mt-1">📞 {provider.phone}</p>
                    )}
                  </div>
                </div>
                {provider.rating && (
                  <div className="flex items-center gap-2 mt-3">
                    <Badge variant="secondary">
                      ⭐ {provider.rating.toFixed(1)}
                    </Badge>
                  </div>
                )}
                {provider.services && provider.services.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    {provider.services.map((service, index) => (
                      <Badge key={index} variant="outline">
                        {service}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </Card>

          <Card className="p-6 mb-8">
            <h3 className="text-lg font-semibold mb-4">Service Type</h3>
            <RadioGroup value={serviceType} onValueChange={setServiceType}>
              <div className="flex items-center space-x-2 p-3 border rounded-lg">
                <RadioGroupItem value="doctor" id="doctor" />
                <Label htmlFor="doctor" className="flex-1 cursor-pointer">
                  <div className="font-medium">Doctor Home Visit</div>
                  <div className="text-sm text-gray-500">Professional medical consultation at your doorstep</div>
                </Label>
              </div>
              <div className="flex items-center space-x-2 p-3 border rounded-lg">
                <RadioGroupItem value="nurse" id="nurse" />
                <Label htmlFor="nurse" className="flex-1 cursor-pointer">
                  <div className="font-medium">Nurse Home Visit</div>
                  <div className="text-sm text-gray-500">Nursing care and medical assistance at home</div>
                </Label>
              </div>
              <div className="flex items-center space-x-2 p-3 border rounded-lg">
                <RadioGroupItem value="lab" id="lab" />
                <Label htmlFor="lab" className="flex-1 cursor-pointer">
                  <div className="font-medium">Lab Sample Collection</div>
                  <div className="text-sm text-gray-500">Home sample collection for lab tests</div>
                </Label>
              </div>
            </RadioGroup>
          </Card>

          <Card className="p-6 mb-8">
            <h3 className="text-lg font-semibold mb-4">Visit Duration</h3>
            <div className="grid grid-cols-3 gap-3">
              {[60, 90, 120].map((mins) => (
                <button
                  key={mins}
                  onClick={() => setDuration(mins)}
                  className={`p-3 rounded-lg border transition-colors ${
                    duration === mins
                      ? "border-primary bg-primary/10 font-medium"
                      : "border-gray-200 hover:border-primary/50"
                  }`}
                >
                  {mins} mins
                </button>
              ))}
            </div>
          </Card>

          <Card className="p-6 mb-8">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              Service Address
            </h3>
            <div className="space-y-4">
              <div>
                <Label htmlFor="street">Street Address *</Label>
                <Input
                  id="street"
                  value={address.street}
                  onChange={(e) => setAddress({ ...address, street: e.target.value })}
                  placeholder="House/Flat No., Street Name"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="city">City *</Label>
                  <Input
                    id="city"
                    value={address.city}
                    onChange={(e) => setAddress({ ...address, city: e.target.value })}
                    placeholder="City"
                  />
                </div>
                <div>
                  <Label htmlFor="state">State</Label>
                  <Input
                    id="state"
                    value={address.state}
                    onChange={(e) => setAddress({ ...address, state: e.target.value })}
                    placeholder="State"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="pincode">Pincode *</Label>
                <Input
                  id="pincode"
                  value={address.pincode}
                  onChange={(e) => setAddress({ ...address, pincode: e.target.value })}
                  placeholder="6-digit pincode"
                  maxLength={6}
                />
              </div>
              <div>
                <Label htmlFor="emergency">Emergency Contact *</Label>
                <Input
                  id="emergency"
                  value={emergencyContact}
                  onChange={(e) => setEmergencyContact(e.target.value)}
                  placeholder="Emergency contact number"
                />
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
              disabled={
                !selectedDate ||
                !selectedTime ||
                !address.street ||
                !address.city ||
                !address.pincode
              }
              className="flex-1"
            >
              <CalendarCheck className="h-4 w-4 mr-2" />
              Book Service (₹{totalFee})
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
              <p className="text-sm text-gray-500">Provider</p>
              <p className="font-medium">{provider.name}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Service Type</p>
              <p className="font-medium capitalize">{serviceType} Home Visit</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Duration</p>
              <p className="font-medium">{duration} minutes</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Date & Time</p>
              <p className="font-medium">
                {format(new Date(selectedDate), "EEEE, MMM d, yyyy")} at {selectedTime}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Service Address</p>
              <p className="text-sm">
                {address.street}, {address.city}
                {address.state && `, ${address.state}`} - {address.pincode}
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

export default HomecareBooking;
