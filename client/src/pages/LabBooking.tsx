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
  Sparkles,
  Users
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

interface FamilyMember {
  id: number | string;
  firstName?: string;
  lastName?: string;
  name?: string;
  relationship?: string;
  phoneNumber?: string;
  gender?: string;
}

const getFamilyMemberName = (member: FamilyMember) =>
  member.name || [member.firstName, member.lastName].filter(Boolean).join(" ") || "Family member";

const LabBooking = () => {
  const { labId } = useParams<{ labId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { currentUser } = useAuth();
  const { toast } = useToast();

  // Get service type from query parameter
  const serviceTypeFromQuery = searchParams.get("serviceType") || "checkup";
  const benefitSource = searchParams.get("source") || "";
  const corporatePackageId = searchParams.get("packageId") || "";
  const corporatePackageName = searchParams.get("packageName") || "Corporate health checkup package";
  const corporatePackagePrice = Number(searchParams.get("packagePrice") || 0);
  const familyDiscountPercent = Number(searchParams.get("familyDiscount") || 20);
  const familyDiscountedPrice = Number(searchParams.get("familyPrice") || 0);
  const initialBookingFor = searchParams.get("bookingFor") === "family" || benefitSource === "corporate-family-benefit"
    ? "family"
    : "self";
  const isCorporateBenefitBooking = benefitSource === "corporate-benefit" || benefitSource === "corporate-family-benefit";

  const [lab, setLab] = useState<Lab | null>(null);
  const [labLoading, setLabLoading] = useState(Boolean(labId));
  const [corporateLabs, setCorporateLabs] = useState<Lab[]>([]);
  const [selectedLabId, setSelectedLabId] = useState(labId || "");
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([]);
  const [bookingFor, setBookingFor] = useState<"self" | "family">(initialBookingFor);
  const [selectedFamilyMemberId, setSelectedFamilyMemberId] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedTime, setSelectedTime] = useState("");
  const [serviceType, setServiceType] = useState<string>(serviceTypeFromQuery);
  const [selectedTests, setSelectedTests] = useState<number[]>([]);
  const [symptoms, setSymptoms] = useState("");
  const [notes, setNotes] = useState("");
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [bookingLoading, setBookingLoading] = useState(false);
  const effectiveLabId = labId || selectedLabId;
  const selectedFamilyMember = familyMembers.find((member) => String(member.id) === selectedFamilyMemberId);

  // Fetch lab details
  useEffect(() => {
    let cancelled = false;

    const fetchLab = async () => {
      if (!effectiveLabId) {
        setLab(null);
        setLabLoading(false);
        return;
      }

      try {
        setLabLoading(true);
        const { data } = await api.get(`/labs/${effectiveLabId}`);
        
        if (!cancelled) {
          setLab(data.lab || data.data || data);
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
  }, [effectiveLabId, isCorporateBenefitBooking, navigate, toast]);

  useEffect(() => {
    if (!isCorporateBenefitBooking) return;

    let cancelled = false;

    const fetchCorporateBookingContext = async () => {
      const [labsRes, familyRes] = await Promise.all([
        api.get("/employee/my-labs").catch(() => null),
        api.get("/family-members").catch(() => null),
      ]);

      if (cancelled) return;

      const labs = Array.isArray(labsRes?.data?.labs) ? labsRes.data.labs : [];
      setCorporateLabs(labs);
      if (!selectedLabId && labs.length === 1) {
        setSelectedLabId(String(labs[0].id));
      }

      const familyPayload = Array.isArray(familyRes?.data?.data)
        ? familyRes.data.data
        : Array.isArray(familyRes?.data?.familyMembers)
          ? familyRes.data.familyMembers
          : [];
      setFamilyMembers(familyPayload);
      if (initialBookingFor === "family" && !selectedFamilyMemberId && familyPayload.length === 1) {
        setSelectedFamilyMemberId(String(familyPayload[0].id));
      }
    };

    fetchCorporateBookingContext();

    return () => {
      cancelled = true;
    };
  }, [initialBookingFor, isCorporateBenefitBooking, selectedFamilyMemberId, selectedLabId]);

  // Fetch available tests
  const { data: availableTests = [] } = useQuery<Test[]>({
    queryKey: ["labTests", effectiveLabId, serviceType],
    queryFn: async () => {
      const { data } = await api.get(`/labs/${effectiveLabId}/tests`, {
        params: { serviceType },
      });
      return data.tests || [];
    },
    enabled: !!effectiveLabId,
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
    if (isCorporateBenefitBooking && corporatePackageId) {
      if (bookingFor === "family") {
        return familyDiscountedPrice > 0 ? familyDiscountedPrice : Math.max(0, Math.round(corporatePackagePrice * (100 - familyDiscountPercent) / 100));
      }
      return 0;
    }

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
      const redirectTo = effectiveLabId
        ? `/lab-booking/${effectiveLabId}?serviceType=${serviceType}`
        : `/lab-booking?${searchParams.toString()}`;
      navigate("/login", { state: { redirectTo } });
      return;
    }

    if (!effectiveLabId) {
      toast({
        title: "Select a lab",
        description: "Choose a corporate network lab before continuing.",
        variant: "destructive",
      });
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

    if (bookingFor === "family" && !selectedFamilyMemberId) {
      toast({
        title: "Select family member",
        description: "Choose the family member who will use this discounted checkup.",
        variant: "destructive",
      });
      return;
    }

    if (selectedTests.length === 0 && !corporatePackageId) {
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

      const labIdentifier = (lab?.id ?? lab?._id ?? effectiveLabId)?.toString();

      if (!labIdentifier || !/^\d+$/.test(labIdentifier)) {
        toast({
          title: "Booking unavailable",
          description: "Invalid lab identifier. Please try again.",
          variant: "destructive",
        });
        return;
      }

      const tests = selectedTests.length > 0
        ? selectedTests.map((testId) => {
            const test = availableTests.find((t) => t.id === testId);
            return {
              id: testId,
              name: test?.name || "",
              price: test?.price || 0,
            };
          })
        : corporatePackageId
          ? [{
              id: corporatePackageId,
              name: corporatePackageName,
              price: totalFee,
            }]
          : [];

      const patientName = bookingFor === "family" && selectedFamilyMember
        ? getFamilyMemberName(selectedFamilyMember)
        : currentUser?.name || `${currentUser?.firstName} ${currentUser?.lastName}`.trim();
      const patientPhone = bookingFor === "family" && selectedFamilyMember?.phoneNumber
        ? selectedFamilyMember.phoneNumber
        : currentUser?.phoneNumber || currentUser?.phone;

      const corporateNotes = isCorporateBenefitBooking
        ? [
            notes.trim(),
            `Corporate health checkup package: ${corporatePackageName}`,
            bookingFor === "family" ? `Family discounted booking: ${familyDiscountPercent}% off` : "Employee assigned corporate checkup",
          ].filter(Boolean).join("\n")
        : notes.trim();

      const bookingData = {
        labId: parseInt(labIdentifier, 10),
        appointmentDate: selectedDate,
        appointmentTime: selectedTime,
        serviceType,
        tests,
        testType: serviceType === "checkup" ? "Health Checkup" : "Diagnostic Test",
        symptoms: symptoms.trim(),
        notes: corporateNotes,
        patientName,
        patientPhone,
        bookingFor,
        familyMemberId: bookingFor === "family" ? selectedFamilyMemberId : null,
        corporateBenefitSource: benefitSource || null,
        corporatePackageId: corporatePackageId || null,
        corporatePackageName: corporatePackageName || null,
        corporatePackagePrice: corporatePackagePrice || null,
        familyDiscountPercent: bookingFor === "family" ? familyDiscountPercent : null,
        familyDiscountedPrice: bookingFor === "family" ? totalFee : null,
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

  if (!lab && !isCorporateBenefitBooking) {
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
    { id: 1, label: isCorporateBenefitBooking ? 'Choose lab' : 'Choose tests', done: Boolean(effectiveLabId) && (selectedTests.length > 0 || Boolean(corporatePackageId)) },
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

          {isCorporateBenefitBooking && (
            <Card className="p-6 mb-8 shadow-lg border-cyan-200/80 bg-cyan-50/60">
              <div className="flex items-start gap-3">
                <ShieldCheck className="h-5 w-5 text-cyan-700 mt-0.5" />
                <div className="flex-1">
                  <h3 className="text-base font-semibold text-cyan-950">{corporatePackageName}</h3>
                  <p className="text-sm text-cyan-800 mt-1">
                    Employee checkup is included. Family members can use the same package at {familyDiscountPercent}% off.
                  </p>
                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="corporate-lab">Corporate network lab</Label>
                      <select
                        id="corporate-lab"
                        value={selectedLabId}
                        onChange={(event) => setSelectedLabId(event.target.value)}
                        className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      >
                        <option value="">Select lab</option>
                        {corporateLabs.map((item) => (
                          <option key={item.id} value={item.id}>{item.name}</option>
                        ))}
                      </select>
                      {corporateLabs.length === 0 && (
                        <p className="text-xs text-cyan-800">No assigned corporate labs were found. Ask HR to map labs before booking.</p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label>Booking for</Label>
                      <RadioGroup value={bookingFor} onValueChange={(value) => setBookingFor(value as "self" | "family")} className="grid grid-cols-2 gap-2">
                        <div className="flex items-center space-x-2 rounded-lg border bg-white px-3 py-2">
                          <RadioGroupItem value="self" id="booking-self" />
                          <Label htmlFor="booking-self" className="cursor-pointer text-sm">Self</Label>
                        </div>
                        <div className="flex items-center space-x-2 rounded-lg border bg-white px-3 py-2">
                          <RadioGroupItem value="family" id="booking-family" />
                          <Label htmlFor="booking-family" className="cursor-pointer text-sm">Family</Label>
                        </div>
                      </RadioGroup>
                    </div>
                    {bookingFor === "family" && (
                      <div className="space-y-2 md:col-span-2">
                        <Label htmlFor="family-member">Family member</Label>
                        <select
                          id="family-member"
                          value={selectedFamilyMemberId}
                          onChange={(event) => setSelectedFamilyMemberId(event.target.value)}
                          className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        >
                          <option value="">Select family member</option>
                          {familyMembers.map((member) => (
                            <option key={member.id} value={member.id}>
                              {getFamilyMemberName(member)}{member.relationship ? ` (${member.relationship})` : ""}
                            </option>
                          ))}
                        </select>
                        <div className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm text-cyan-900">
                          <Users className="h-4 w-4 text-cyan-700" />
                          <span>Discounted payable amount: <strong>₹{totalFee}</strong></span>
                        </div>
                        {familyMembers.length === 0 && (
                          <p className="text-xs text-cyan-800">Add family members from your profile before booking a family checkup.</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          )}

          {lab && (
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
                        <p className="text-gray-600 mt-1">{typeof lab.address === "string" ? lab.address : JSON.stringify(lab.address)}</p>
                      )}
                      {lab.phone && (
                        <p className="text-sm text-gray-500 mt-1">Phone: {lab.phone}</p>
                      )}
                    </div>
                  </div>
                  {lab.rating && (
                    <div className="flex items-center gap-2 mt-3">
                      <Badge variant="secondary">
                        {(+lab.rating).toFixed(1)}
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
          )}

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
            {isCorporateBenefitBooking && corporatePackageId && (
              <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                {corporatePackageName} is selected from your corporate benefit.
              </div>
            )}
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
              disabled={!effectiveLabId || !selectedDate || !selectedTime || (selectedTests.length === 0 && !corporatePackageId)}
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
              <p className="font-medium">{lab?.name || "Selected corporate network lab"}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Patient</p>
              <p className="font-medium">
                {bookingFor === "family" && selectedFamilyMember
                  ? `${getFamilyMemberName(selectedFamilyMember)}${selectedFamilyMember.relationship ? ` (${selectedFamilyMember.relationship})` : ""}`
                  : currentUser?.name || `${currentUser?.firstName || ""} ${currentUser?.lastName || ""}`.trim()}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Service Type</p>
              <p className="font-medium capitalize">{serviceType}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Tests Selected</p>
              <ul className="list-disc list-inside">
                {selectedTests.length > 0
                  ? selectedTests.map((testId) => {
                      const test = availableTests.find((t) => t.id === testId);
                      return (
                        <li key={testId} className="text-sm">
                          {test?.name} - ₹{test?.price}
                        </li>
                      );
                    })
                  : (
                    <li className="text-sm">
                      {corporatePackageName} - ₹{totalFee}
                    </li>
                  )}
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
