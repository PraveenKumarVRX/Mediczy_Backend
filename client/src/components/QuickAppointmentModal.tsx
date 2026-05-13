import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Search, Star, Clock, ArrowRight, Info, Stethoscope, Heart, FlaskConical, MapPin, Video, Building, Home, Syringe, TestTube, CheckCircle, Calendar } from "lucide-react";
import api from "@/utils/api";
import { useAuth } from "@/auth/AuthProvider";
import { useToast } from "@/hooks/use-toast";

interface Doctor {
  _id: string;
  id?: string;
  doctor_id?: string;
  firstName: string;
  lastName: string;
  profileImage?: string;
  specialization: string;
  experience: number;
  averageRating?: number;
  serviceTiers?: any[];
}

interface Nurse {
  _id: string;
  firstName: string;
  lastName: string;
  profileImage?: string;
  specialization?: string;
  experience?: number;
  rating?: number;
  availability?: string;
}

interface Lab {
  _id?: string;
  id?: number | string;
  name: string;
  logo?: string;
  type?: string;
  services?: string[] | any;
  rating?: number | string;
  location?: string;
  operatingHours?: any;
  address?: {
    city?: string;
    street?: string;
    state?: string;
    zipCode?: string;
  };
  phone?: string;
  email?: string;
  homeSampleCollection?: boolean;
  isVerified?: boolean;
  accreditation?: string;
  testCatalog?: any;
}

interface HomecareService {
  _id: string;
  name: string;
  type: 'doctor' | 'nurse' | 'lab';
  description?: string;
  rating?: number;
  availability?: string;
}

interface QuickAppointmentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type ProviderType = "doctors" | "nurses" | "labs" | "homecare";
type ConsultationType = "online" | "offline";
type LabServiceType = "checkup" | "diagnostic";
type HomecareServiceType = "doctor" | "nurse" | "lab";

const SPECIALIZATIONS = [
  "Cardiology",
  "Dermatology",
  "Neurology",
  "Pediatrics",
  "Orthopedics",
  "General Medicine",
  "Psychiatry",
  "ENT",
  "Gynecology",
  "Ophthalmology",
];

export default function QuickAppointmentModal({
  open,
  onOpenChange,
}: QuickAppointmentModalProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { userType, currentUser } = useAuth();
  const { toast } = useToast();
  const normalizedPath = location.pathname.toLowerCase();
  const [providerType, setProviderType] = useState<ProviderType>("doctors");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedSpecialty, setSelectedSpecialty] = useState<string>("all");
  const [consultationType, setConsultationType] = useState<ConsultationType>("online");
  const [labServiceType, setLabServiceType] = useState<LabServiceType>("checkup");
  const [labCity, setLabCity] = useState("");
  const [selectedLab, setSelectedLab] = useState<Lab | null>(null);
  const [showLabBookingForm, setShowLabBookingForm] = useState(false);
  const [bookingDate, setBookingDate] = useState("");
  const [bookingTime, setBookingTime] = useState("");
  const [bookingPatientName, setBookingPatientName] = useState("");
  const [bookingPhone, setBookingPhone] = useState("");
  const [bookingNotes, setBookingNotes] = useState("");
  const [bookingLoading, setBookingLoading] = useState(false);
  const [bookingConfirmed, setBookingConfirmed] = useState(false);
  const [bookingResult, setBookingResult] = useState<any>(null);
  // Employee search
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [employeeResults, setEmployeeResults] = useState<any[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<any | null>(null);
  // Package selection
  const [selectedPackageId, setSelectedPackageId] = useState("none");
  const [availablePackages, setAvailablePackages] = useState<any[]>([]);
  const [homecareServiceType, setHomecareServiceType] = useState<HomecareServiceType>("doctor");

  // Determine user context
  const isDoctorPortal = normalizedPath === "/doctor" || normalizedPath.startsWith("/doctor/");
  const isNursePortal = normalizedPath === "/nurse" || normalizedPath.startsWith("/nurse/");
  const isAssistantPortal = normalizedPath === "/assistant" || normalizedPath.startsWith("/assistant/");
  const isLabPortal = normalizedPath === "/lab" || normalizedPath.startsWith("/lab/");
  const isHomecarePortal = normalizedPath === "/homecare" || normalizedPath.startsWith("/homecare/");
  const isStaffBooking = isDoctorPortal || isNursePortal || isAssistantPortal || isLabPortal || isHomecarePortal;

  const resolveDoctorId = (doctor: Doctor) => doctor._id || doctor.id || doctor.doctor_id || "";

  // Fetch doctors
  const { data: doctors = [], isLoading: isDoctorsLoading } = useQuery({
    queryKey: ["doctors", searchTerm, selectedSpecialty],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (searchTerm) params.append("search", searchTerm);
      if (selectedSpecialty && selectedSpecialty !== "all") {
        params.append("specialization", selectedSpecialty);
      }
      const { data } = await api.get(`/doctors?${params.toString()}`);
      return (data?.doctors || data || []).slice(0, 6);
    },
    enabled: open && providerType === "doctors",
  });

  // Fetch nurses
  const { data: nurses = [], isLoading: isNursesLoading } = useQuery({
    queryKey: ["nurses", searchTerm],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (searchTerm) params.append("search", searchTerm);
      const { data } = await api.get(`/nurses?${params.toString()}`);
      return (data?.nurses || data || []).slice(0, 6);
    },
    enabled: open && providerType === "nurses",
  });

  // Fetch labs
  const { data: labs = [], isLoading: isLabsLoading } = useQuery({
    queryKey: ["labs-list", searchTerm, labCity, labServiceType],
    queryFn: async () => {
      const params = new URLSearchParams();
      // If user typed both name and city in one box (e.g. "agilus ashok nagar"),
      // send as search (backend now does multi-token AND query)
      if (searchTerm) params.append("search", searchTerm);
      if (labCity) params.append("city", labCity);
      params.append("serviceType", labServiceType);
      const { data } = await api.get(`/labs?${params.toString()}`);
      return (data?.labs || data || []).slice(0, 6);
    },
    enabled: open && providerType === "labs",
  });

  // Fetch homecare services
  const { data: homecareServices = [], isLoading: isHomecareLoading } = useQuery({
    queryKey: ["homecare-services", searchTerm, homecareServiceType],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (searchTerm) params.append("search", searchTerm);
      params.append("type", homecareServiceType);
      const { data } = await api.get(`/homecare/services?${params.toString()}`);
      return (data?.services || data || []).slice(0, 6);
    },
    enabled: open && providerType === "homecare",
  });

  const isLoading = isDoctorsLoading || isNursesLoading || isLabsLoading || isHomecareLoading;

  const handleProviderSelect = (providerId: string) => {
    onOpenChange(false);
    setSelectedLab(null);
    if (providerType === "doctors") {
      navigate(`/consultation/${providerId}?type=${consultationType}`);
    } else if (providerType === "nurses") {
      navigate(`/nurse-booking/${providerId}`);
    } else if (providerType === "labs") {
      navigate(`/lab-booking/${providerId}?serviceType=${labServiceType}`);
    } else if (providerType === "homecare") {
      navigate(`/homecare-booking/${providerId}?type=${homecareServiceType}`);
    }
  };

  const handleViewAll = () => {
    onOpenChange(false);
    if (providerType === "doctors") {
      navigate("/consultation", {
        state: { specialty: selectedSpecialty, search: searchTerm, type: consultationType },
      });
    } else if (providerType === "nurses") {
      navigate("/nurses", { state: { search: searchTerm } });
    } else if (providerType === "labs") {
      navigate("/labs", { state: { search: searchTerm, serviceType: labServiceType } });
    } else if (providerType === "homecare") {
      navigate("/homecare", { state: { search: searchTerm, type: homecareServiceType } });
    }
  };

  // Generate 30-min time slots from 9:00 AM to 6:00 PM
  const generateTimeSlots = () => {
    const slots: { value: string; label: string }[] = [];
    for (let h = 9; h < 18; h++) {
      for (const m of [0, 30]) {
        const hour12 = h > 12 ? h - 12 : h;
        const ampm = h < 12 ? "AM" : "PM";
        const label = `${hour12}:${m === 0 ? "00" : "30"} ${ampm}`;
        const value = `${String(h).padStart(2, "0")}:${m === 0 ? "00" : "30"}`;
        slots.push({ value, label });
      }
    }
    return slots;
  };

  const handleLabBooking = async () => {
    if (!selectedLab || !bookingDate || !bookingTime) {
      toast({ title: "Missing fields", description: "Please select a date and time.", variant: "destructive" });
      return;
    }
    setBookingLoading(true);
    try {
      const labId = selectedLab.id ?? selectedLab._id;
      // Resolve selected package name
      const pkgName = selectedPackageId !== "none"
        ? availablePackages.find(p => String(p.packageId) === selectedPackageId)?.packageName
        : undefined;
      const { data } = await api.post("/labs/book", {
        labId,
        appointmentDate: bookingDate,
        appointmentTime: bookingTime,
        serviceType: labServiceType,
        patientName: bookingPatientName || `${currentUser?.firstName ?? ""} ${currentUser?.lastName ?? ""}`.trim() || undefined,
        patientPhone: bookingPhone || currentUser?.phoneNumber || undefined,
        notes: bookingNotes || undefined,
        testType: pkgName || undefined,
      });
      if (data.success) {
        setBookingResult(data.appointment);
        setBookingConfirmed(true);
      } else {
        toast({ title: "Booking failed", description: data.message || "Unknown error", variant: "destructive" });
      }
    } catch (err: any) {
      toast({
        title: "Booking failed",
        description: err?.response?.data?.message || err.message || "Network error",
        variant: "destructive",
      });
    } finally {
      setBookingLoading(false);
    }
  };

  const searchEmployees = async (term: string) => {
    if (!term.trim()) { setEmployeeResults([]); return; }
    try {
      const { data } = await api.get(`/corporate-bookings/employees?corporateId=5&search=${encodeURIComponent(term)}`);
      setEmployeeResults(data.employees || []);
    } catch (_) {}
  };

  const fetchPackages = async () => {
    if (availablePackages.length > 0) return;
    try {
      const { data } = await api.get("/admin/corporate-health-packages/5");
      setAvailablePackages(data.packages || []);
    } catch (_) {}
  };

  const resetLabBookingState = () => {
    setShowLabBookingForm(false);
    setBookingDate("");
    setBookingTime("");
    setBookingPatientName("");
    setBookingPhone("");
    setBookingNotes("");
    setBookingLoading(false);
    setBookingConfirmed(false);
    setBookingResult(null);
    setEmployeeSearch("");
    setEmployeeResults([]);
    setSelectedEmployee(null);
    setSelectedPackageId("none");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold primary-grad">
            Book New Appointment
          </DialogTitle>
          <DialogDescription>
            {isStaffBooking 
              ? "Book appointments with doctors, nurses, labs, or homecare services for your patients"
              : "Choose a provider type and service to get started"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Staff Booking Notice */}
          {isStaffBooking && (
            <Alert className="border-[#00FFF3]/30 bg-[#00FFF3]/5">
              <Info className="h-4 w-4 text-[#00FFF3]" />
              <AlertDescription className="text-sm text-gray-300">
                {isDoctorPortal && "Booking appointment on behalf of your patient"}
                {isNursePortal && "Booking appointment for patient care coordination"}
                {isAssistantPortal && "Scheduling appointment as doctor's assistant"}
                {isLabPortal && "Booking follow-up appointment for lab results"}
                {isHomecarePortal && "Scheduling appointment for homecare patient"}
              </AlertDescription>
            </Alert>
          )}

          {/* Provider Type Tabs */}
          <Tabs value={providerType} onValueChange={(value) => setProviderType(value as ProviderType)}>
            <TabsList className="grid w-full grid-cols-4 bg-[#1A2333]">
              <TabsTrigger value="doctors" className="data-[state=active]:bg-[#00FFF3] data-[state=active]:text-[#0B1120]">
                <Stethoscope className="h-4 w-4 mr-2" />
                Doctors
              </TabsTrigger>
              <TabsTrigger value="labs" className="data-[state=active]:bg-[#00FFF3] data-[state=active]:text-[#0B1120]">
                <FlaskConical className="h-4 w-4 mr-2" />
                Labs
              </TabsTrigger>
              <TabsTrigger value="homecare" className="data-[state=active]:bg-[#00FFF3] data-[state=active]:text-[#0B1120]">
                <Home className="h-4 w-4 mr-2" />
                Homecare
              </TabsTrigger>
              <TabsTrigger value="nurses" className="data-[state=active]:bg-[#00FFF3] data-[state=active]:text-[#0B1120]">
                <Heart className="h-4 w-4 mr-2" />
                Nurses
              </TabsTrigger>
            </TabsList>

            {/* Service Type Selection */}
            {providerType === "doctors" && (
              <div className="space-y-3 mt-6">
                <Label className="text-sm font-medium">Consultation Type</Label>
                <RadioGroup value={consultationType} onValueChange={(value) => setConsultationType(value as ConsultationType)} className="flex gap-4">
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="online" id="online" />
                    <Label htmlFor="online" className="flex items-center gap-2 cursor-pointer">
                      <Video className="h-4 w-4 text-[#00FFF3]" />
                      Online Consultation
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="offline" id="offline" />
                    <Label htmlFor="offline" className="flex items-center gap-2 cursor-pointer">
                      <Building className="h-4 w-4 text-[#00FFF3]" />
                      Offline Consultation
                    </Label>
                  </div>
                </RadioGroup>
              </div>
            )}

            {providerType === "labs" && (
              <div className="space-y-3 mt-6">
                <Label className="text-sm font-medium">Service Type</Label>
                <RadioGroup value={labServiceType} onValueChange={(value) => setLabServiceType(value as LabServiceType)} className="flex gap-4">
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="checkup" id="checkup" />
                    <Label htmlFor="checkup" className="flex items-center gap-2 cursor-pointer">
                      <Heart className="h-4 w-4 text-[#00FFF3]" />
                      Health Checkup
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="diagnostic" id="diagnostic" />
                    <Label htmlFor="diagnostic" className="flex items-center gap-2 cursor-pointer">
                      <TestTube className="h-4 w-4 text-[#00FFF3]" />
                      Diagnostic Test
                    </Label>
                  </div>
                </RadioGroup>
              </div>
            )}

            {providerType === "homecare" && (
              <div className="space-y-3 mt-6">
                <Label className="text-sm font-medium">Homecare Service Type</Label>
                <RadioGroup value={homecareServiceType} onValueChange={(value) => setHomecareServiceType(value as HomecareServiceType)} className="flex gap-4">
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="doctor" id="hc-doctor" />
                    <Label htmlFor="hc-doctor" className="flex items-center gap-2 cursor-pointer">
                      <Stethoscope className="h-4 w-4 text-[#00FFF3]" />
                      Doctor Visit
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="nurse" id="hc-nurse" />
                    <Label htmlFor="hc-nurse" className="flex items-center gap-2 cursor-pointer">
                      <Heart className="h-4 w-4 text-[#00FFF3]" />
                      Nurse Visit
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="lab" id="hc-lab" />
                    <Label htmlFor="hc-lab" className="flex items-center gap-2 cursor-pointer">
                      <Syringe className="h-4 w-4 text-[#00FFF3]" />
                      Lab Sample Collection
                    </Label>
                  </div>
                </RadioGroup>
              </div>
            )}

            {/* Search and Filter */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder={
                    providerType === "doctors" ? "Search doctors by name or speciality..." :
                    providerType === "nurses" ? "Search nurses by name..." :
                    providerType === "labs" ? "Lab name or chain (e.g. Agilus, SRL, Thyrocare)" :
                    "Search homecare services..."
                  }
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              {providerType === "labs" && (
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="City or area (e.g. Ashok Nagar, Bandra)"
                    value={labCity}
                    onChange={(e) => setLabCity(e.target.value)}
                    className="pl-10"
                  />
                </div>
              )}
              {providerType === "doctors" && (
                <Select value={selectedSpecialty} onValueChange={setSelectedSpecialty}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select Specialty" />
                  </SelectTrigger>
                  <SelectContent className="z-[9999] max-h-60">
                    <SelectItem value="all">All Specialties</SelectItem>
                    {SPECIALIZATIONS.map((spec) => (
                      <SelectItem key={spec} value={spec}>
                        {spec}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Results */}
            <TabsContent value="doctors" className="mt-6">
              {isDoctorsLoading ? (
                <div className="text-center py-8 text-gray-400">Loading doctors...</div>
              ) : doctors.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-400 mb-4">No doctors found</p>
                  <Button variant="outline" onClick={handleViewAll} className="border-[#00FFF3]/30 text-[#00FFF3]">
                    Browse All Doctors
                  </Button>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {doctors.map((doctor: Doctor) => (
                      <Card
                        key={doctor._id || doctor.id || doctor.doctor_id || `${doctor.firstName}-${doctor.lastName}-${doctor.specialization}`}
                        className="p-4 hover:border-[#00FFF3]/40 transition-all cursor-pointer"
                        onClick={() => {
                          const doctorId = resolveDoctorId(doctor);
                          if (!doctorId) {
                            console.warn("Selected doctor is missing an id.", doctor);
                            toast({
                              title: "Unable to open doctor",
                              description: "This doctor profile is missing an id. Please choose another doctor.",
                              variant: "destructive",
                            });
                            return;
                          }
                          handleProviderSelect(doctorId);
                        }}
                      >
                        <div className="flex gap-4">
                          <img src={doctor.profileImage || "/default-doctor.png"} alt={`${doctor.firstName} ${doctor.lastName}`} className="w-16 h-16 rounded-full object-cover" />
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-lg truncate">Dr. {doctor.firstName} {doctor.lastName}</h3>
                            <Badge variant="outline" className="mb-2 text-[#00FFF3] border-[#00FFF3]/30">{doctor.specialization}</Badge>
                            <div className="flex items-center gap-4 text-sm text-gray-400">
                              <div className="flex items-center gap-1">
                                <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />
                                <span>{(doctor.averageRating != null ? +doctor.averageRating : null)?.toFixed(1) || "4.5"}</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                <span>{doctor.experience || 5}+ years</span>
                              </div>
                              <Badge variant="outline" className="text-xs">
                                {consultationType === "online" ? <Video className="h-3 w-3 mr-1" /> : <Building className="h-3 w-3 mr-1" />}
                                {consultationType === "online" ? "Online" : "Offline"}
                              </Badge>
                            </div>
                          </div>
                          <ArrowRight className="h-5 w-5 text-[#00FFF3] self-center" />
                        </div>
                      </Card>
                    ))}
                  </div>
                  <div className="flex justify-center pt-4">
                    <Button variant="outline" onClick={handleViewAll} className="border-[#00FFF3]/30 text-[#00FFF3] hover:bg-[#00FFF3]/10">
                      View All Doctors <ArrowRight className="h-4 w-4 ml-2" />
                    </Button>
                  </div>
                </>
              )}
            </TabsContent>

            <TabsContent value="nurses" className="mt-6">
              {isNursesLoading ? (
                <div className="text-center py-8 text-gray-400">Loading nurses...</div>
              ) : nurses.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-400 mb-4">No nurses found</p>
                  <Button variant="outline" onClick={handleViewAll} className="border-[#00FFF3]/30 text-[#00FFF3]">
                    Browse All Nurses
                  </Button>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {nurses.map((nurse: Nurse) => (
                      <Card key={nurse._id} className="p-4 hover:border-[#00FFF3]/40 transition-all cursor-pointer" onClick={() => handleProviderSelect(nurse._id)}>
                        <div className="flex gap-4">
                          <img src={nurse.profileImage || "/default-doctor.png"} alt={`${nurse.firstName} ${nurse.lastName}`} className="w-16 h-16 rounded-full object-cover" />
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-lg truncate">{nurse.firstName} {nurse.lastName}</h3>
                            {nurse.specialization && (
                              <Badge variant="outline" className="mb-2 text-[#00FFF3] border-[#00FFF3]/30">{nurse.specialization}</Badge>
                            )}
                            <div className="flex items-center gap-4 text-sm text-gray-400">
                              <div className="flex items-center gap-1">
                                <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />
                                <span>{(nurse.rating != null ? +nurse.rating : null)?.toFixed(1) || "4.5"}</span>
                              </div>
                              {nurse.experience && (
                                <div className="flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  <span>{nurse.experience}+ years</span>
                                </div>
                              )}
                            </div>
                          </div>
                          <ArrowRight className="h-5 w-5 text-[#00FFF3] self-center" />
                        </div>
                      </Card>
                    ))}
                  </div>
                  <div className="flex justify-center pt-4">
                    <Button variant="outline" onClick={handleViewAll} className="border-[#00FFF3]/30 text-[#00FFF3] hover:bg-[#00FFF3]/10">
                      View All Nurses <ArrowRight className="h-4 w-4 ml-2" />
                    </Button>
                  </div>
                </>
              )}
            </TabsContent>

            <TabsContent value="labs" className="mt-6">
              {/* ── Inline lab detail panel / booking form / success ── */}
              {selectedLab ? (
                bookingConfirmed && bookingResult ? (
                  // ── Success screen ──
                  <div className="space-y-4">
                    <div className="rounded-xl border border-teal-500/30 bg-teal-900/20 p-6 space-y-4 text-center">
                      <CheckCircle className="h-12 w-12 text-teal-400 mx-auto" />
                      <h3 className="text-xl font-bold text-white">Appointment Booked!</h3>
                      <div className="text-sm text-gray-300 space-y-1">
                        <p><span className="text-gray-400">Lab:</span> {bookingResult.labName}</p>
                        <p><span className="text-gray-400">Date:</span> {bookingResult.appointmentDate}</p>
                        <p><span className="text-gray-400">Time:</span> {bookingResult.appointmentTime}</p>
                        <p><span className="text-gray-400">Service:</span> {labServiceType === 'checkup' ? 'Health Checkup' : 'Diagnostic Test'}</p>
                        {bookingResult.testType && <p><span className="text-gray-400">Package:</span> {bookingResult.testType}</p>}
                        {bookingResult.totalFee && <p><span className="text-gray-400">Fee:</span> ₹{bookingResult.totalFee}</p>}
                        <p><span className="text-gray-400">Reference #:</span> {bookingResult.id}</p>
                        <p><span className="text-gray-400">Status:</span> <span className="text-teal-300 capitalize">{bookingResult.status}</span></p>
                      </div>
                      <div className="flex gap-2 justify-center pt-2 flex-wrap">
                        <Button
                          variant="outline"
                          className="border-teal-500/40 text-teal-300 hover:bg-teal-900/30"
                          onClick={() => { resetLabBookingState(); setSelectedLab(null); }}
                        >
                          Book Another
                        </Button>
                        <Button
                          variant="outline"
                          className="border-[#00FFF3]/30 text-[#00FFF3] hover:bg-[#00FFF3]/10"
                          onClick={() => { onOpenChange(false); navigate("/team/appointments"); }}
                        >
                          View All Bookings
                        </Button>
                        <Button
                          className="bg-[#00FFF3] text-[#0B1120] font-bold hover:bg-[#00FFF3]/90"
                          onClick={() => { resetLabBookingState(); onOpenChange(false); }}
                        >
                          Done
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : showLabBookingForm ? (
                  // ── Booking form ──
                  <div className="space-y-4">
                    <button
                      onClick={() => setShowLabBookingForm(false)}
                      className="flex items-center gap-2 text-sm text-gray-400 hover:text-[#00FFF3] transition-colors"
                    >
                      <ArrowRight className="h-4 w-4 rotate-180" /> Back to lab details
                    </button>
                    <div className="rounded-xl border border-[#00FFF3]/20 bg-[#0d1a2d] p-5 space-y-4">
                      <h3 className="text-lg font-bold text-white flex items-center gap-2">
                        <Calendar className="h-5 w-5 text-[#00FFF3]" />
                        Book at {selectedLab.name}
                      </h3>

                      {/* Date */}
                      <div className="space-y-1">
                        <Label className="text-sm text-gray-300">Appointment Date <span className="text-red-400">*</span></Label>
                        <Input
                          type="date"
                          min={new Date().toISOString().split("T")[0]}
                          value={bookingDate}
                          onChange={(e) => setBookingDate(e.target.value)}
                          className="bg-[#1A2333] border-white/10"
                        />
                      </div>

                      {/* Time */}
                      <div className="space-y-1">
                        <Label className="text-sm text-gray-300">Appointment Time <span className="text-red-400">*</span></Label>
                        <Select value={bookingTime} onValueChange={setBookingTime}>
                          <SelectTrigger className="bg-[#1A2333] border-white/10">
                            <SelectValue placeholder="Select time slot" />
                          </SelectTrigger>
                          <SelectContent>
                            {generateTimeSlots().map((slot) => (
                              <SelectItem key={slot.value} value={slot.value}>{slot.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Employee Search */}
                      <div className="space-y-1">
                        <Label className="text-sm text-gray-300">Book for Employee</Label>
                        <div className="relative">
                          <Input
                            placeholder="Search by name, email or phone..."
                            value={employeeSearch}
                            onChange={(e) => {
                              setEmployeeSearch(e.target.value);
                              setSelectedEmployee(null);
                              searchEmployees(e.target.value);
                            }}
                            className="bg-[#1A2333] border-white/10"
                          />
                          {employeeResults.length > 0 && !selectedEmployee && (
                            <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-[#1A2333] border border-white/10 rounded-md shadow-lg max-h-40 overflow-y-auto">
                              {employeeResults.map((emp) => (
                                <button
                                  key={emp.id}
                                  className="w-full text-left px-3 py-2 text-sm hover:bg-[#00FFF3]/10 text-gray-200 flex items-center justify-between"
                                  onClick={() => {
                                    setSelectedEmployee(emp);
                                    setEmployeeSearch(`${emp.firstName} ${emp.lastName}`);
                                    setBookingPatientName(`${emp.firstName} ${emp.lastName}`);
                                    setBookingPhone(emp.phoneNumber || "");
                                    setEmployeeResults([]);
                                  }}
                                >
                                  <span className="font-medium">{emp.firstName} {emp.lastName}</span>
                                  <span className="text-gray-400 text-xs">{emp.phoneNumber || emp.email}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                        {selectedEmployee && (
                          <div className="flex items-center justify-between bg-teal-900/20 border border-teal-700/30 rounded px-3 py-1.5 mt-1">
                            <span className="text-sm text-teal-300">
                              ✓ {selectedEmployee.firstName} {selectedEmployee.lastName}
                              {selectedEmployee.phoneNumber && <span className="text-gray-400 ml-2">{selectedEmployee.phoneNumber}</span>}
                            </span>
                            <button
                              onClick={() => { setSelectedEmployee(null); setEmployeeSearch(""); setBookingPatientName(""); setBookingPhone(""); }}
                              className="text-gray-400 hover:text-white text-xs ml-2"
                            >✕</button>
                          </div>
                        )}
                      </div>

                      {/* Eligible Package - checkup only */}
                      {labServiceType === 'checkup' && availablePackages.length > 0 && (
                        <div className="space-y-1">
                          <Label className="text-sm text-gray-300">Eligible Health Package</Label>
                          <Select value={selectedPackageId} onValueChange={setSelectedPackageId}>
                            <SelectTrigger className="bg-[#1A2333] border-white/10">
                              <SelectValue placeholder="Select package (optional)" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">No specific package</SelectItem>
                              {availablePackages.map((pkg) => (
                                <SelectItem key={pkg.packageId} value={String(pkg.packageId)}>
                                  {pkg.packageName}
                                  {pkg.packageDetails?.price && <span className="text-gray-400 ml-2"> — ₹{pkg.packageDetails.price}</span>}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}

                      {/* Patient Name */}
                      <div className="space-y-1">
                        <Label className="text-sm text-gray-300">Patient Name</Label>
                        <Input
                          placeholder="Enter patient name"
                          value={bookingPatientName}
                          onChange={(e) => setBookingPatientName(e.target.value)}
                          className="bg-[#1A2333] border-white/10"
                        />
                      </div>

                      {/* Phone */}
                      <div className="space-y-1">
                        <Label className="text-sm text-gray-300">Phone Number</Label>
                        <Input
                          placeholder="Enter phone number"
                          value={bookingPhone}
                          onChange={(e) => setBookingPhone(e.target.value)}
                          className="bg-[#1A2333] border-white/10"
                        />
                      </div>

                      {/* Notes */}
                      <div className="space-y-1">
                        <Label className="text-sm text-gray-300">Notes / Tests (optional)</Label>
                        <textarea
                          placeholder="e.g. CBC, Lipid Panel, fasting required..."
                          value={bookingNotes}
                          onChange={(e) => setBookingNotes(e.target.value)}
                          rows={3}
                          className="w-full rounded-md bg-[#1A2333] border border-white/10 text-sm text-white px-3 py-2 placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-[#00FFF3]/50 resize-none"
                        />
                      </div>

                      <Button
                        className="w-full bg-[#00FFF3] text-[#0B1120] font-bold hover:bg-[#00FFF3]/90"
                        disabled={bookingLoading || !bookingDate || !bookingTime}
                        onClick={handleLabBooking}
                      >
                        {bookingLoading ? "Booking..." : "Confirm Booking"}
                      </Button>
                    </div>
                  </div>
                ) : (
                  // ── Detail panel ──
                <div className="space-y-4">
                  <button
                    onClick={() => { resetLabBookingState(); setSelectedLab(null); }}
                    className="flex items-center gap-2 text-sm text-gray-400 hover:text-[#00FFF3] transition-colors"
                  >
                    <ArrowRight className="h-4 w-4 rotate-180" /> Back to results
                  </button>
                  <div className="rounded-xl border border-[#00FFF3]/20 bg-[#0d1a2d] p-5 space-y-4">
                    {/* Header */}
                    <div className="flex gap-4 items-start">
                      <div className="w-16 h-16 rounded-lg bg-[#1A2333] flex-shrink-0 flex items-center justify-center">
                        {selectedLab.logo
                          ? <img src={selectedLab.logo} alt={selectedLab.name} className="w-12 h-12 object-contain" />
                          : <FlaskConical className="h-8 w-8 text-[#00FFF3]" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-xl font-bold text-white">{selectedLab.name}</h3>
                        <div className="flex flex-wrap gap-2 mt-1">
                          {selectedLab.isVerified && (
                            <Badge className="bg-teal-800/40 text-teal-300 border-teal-700 text-xs">✓ Verified</Badge>
                          )}
                          {selectedLab.homeSampleCollection && (
                            <Badge className="bg-purple-800/40 text-purple-300 border-purple-700 text-xs">🏠 Home Collection</Badge>
                          )}
                          {selectedLab.accreditation && (
                            <Badge variant="outline" className="text-[#00FFF3] border-[#00FFF3]/30 text-xs">{selectedLab.accreditation}</Badge>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <Star className="h-4 w-4 fill-yellow-500 text-yellow-500" />
                        <span className="font-semibold text-white">{(selectedLab.rating != null ? +selectedLab.rating : null)?.toFixed(1) || '4.5'}</span>
                      </div>
                    </div>

                    {/* Address */}
                    {selectedLab.address && (
                      <div className="flex gap-2 text-sm text-gray-300">
                        <MapPin className="h-4 w-4 text-[#00FFF3] flex-shrink-0 mt-0.5" />
                        <span>
                          {[selectedLab.address.street, selectedLab.address.city, selectedLab.address.state, selectedLab.address.zipCode]
                            .filter(Boolean).join(', ')}
                        </span>
                      </div>
                    )}

                    {/* Phone */}
                    {selectedLab.phone && (
                      <div className="flex gap-2 text-sm text-gray-300">
                        <span className="text-[#00FFF3] text-xs">📞</span>
                        <span>{selectedLab.phone}</span>
                      </div>
                    )}

                    {/* Service type badge */}
                    <div className="flex items-center gap-2 text-sm text-gray-400 pt-1 border-t border-white/5">
                      {labServiceType === 'checkup'
                        ? <><Heart className="h-4 w-4 text-pink-400" /> <span>Health Checkup</span></>
                        : <><TestTube className="h-4 w-4 text-blue-400" /> <span>Diagnostic Test</span></>}
                    </div>

                    {/* Book button */}
                    <Button
                      className="w-full bg-[#00FFF3] text-[#0B1120] font-bold hover:bg-[#00FFF3]/90 mt-2"
                      onClick={() => {
                        setBookingPatientName(`${currentUser?.firstName ?? ""} ${currentUser?.lastName ?? ""}`.trim());
                        setBookingPhone(currentUser?.phoneNumber ?? "");
                        if (labServiceType === 'checkup') fetchPackages();
                        setShowLabBookingForm(true);
                      }}
                    >
                      Book Appointment at {selectedLab.name}
                    </Button>
                  </div>
                </div>
                )
              ) : isLabsLoading ? (
                <div className="text-center py-8 text-gray-400">Loading labs...</div>
              ) : labs.length === 0 ? (
                <div className="text-center py-8 space-y-3">
                  <FlaskConical className="h-10 w-10 text-gray-600 mx-auto" />
                  <p className="text-gray-300 font-medium">No labs found</p>
                  {(searchTerm || labCity) && (
                    <p className="text-gray-500 text-sm max-w-xs mx-auto">
                      Try searching by <span className="text-[#00FFF3]">lab name only</span> (e.g. "Agilus", "SRL") and use the city field for location.
                    </p>
                  )}
                  <div className="flex gap-2 justify-center flex-wrap">
                    {(searchTerm || labCity) && (
                      <Button variant="ghost" size="sm" className="text-gray-400 hover:text-white"
                        onClick={() => { setSearchTerm(""); setLabCity(""); }}>
                        Clear filters
                      </Button>
                    )}
                    <Button variant="outline" onClick={handleViewAll} className="border-[#00FFF3]/30 text-[#00FFF3]">
                      Browse All Labs
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {labs.map((lab: Lab) => (
                      <Card key={lab.id ?? lab._id} className="p-4 hover:border-[#00FFF3]/40 transition-all cursor-pointer" onClick={() => setSelectedLab(lab)}>
                        <div className="flex gap-4">
                          <div className="w-16 h-16 rounded-lg bg-[#1A2333] flex items-center justify-center">
                            {lab.logo ? (
                              <img src={lab.logo} alt={lab.name} className="w-12 h-12 object-contain" />
                            ) : (
                              <FlaskConical className="h-8 w-8 text-[#00FFF3]" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-lg truncate">{lab.name}</h3>
                            <div className="flex gap-2 mb-2">
                              {lab.type && (
                                <Badge variant="outline" className="text-[#00FFF3] border-[#00FFF3]/30">{lab.type}</Badge>
                              )}
                              <Badge variant="outline" className="text-xs">
                                {labServiceType === "checkup" ? <Heart className="h-3 w-3 mr-1" /> : <TestTube className="h-3 w-3 mr-1" />}
                                {labServiceType === "checkup" ? "Checkup" : "Diagnostic"}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-4 text-sm text-gray-400">
                              <div className="flex items-center gap-1">
                                <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />
                                <span>{(lab.rating != null ? +lab.rating : null)?.toFixed(1) || "4.5"}</span>
                              </div>
                              {lab.address?.city && (
                                <div className="flex items-center gap-1">
                                  <MapPin className="h-3 w-3" />
                                  <span className="truncate text-xs">{lab.address.city}{lab.address.state ? `, ${lab.address.state}` : ''}</span>
                                </div>
                              )}
                            </div>
                          </div>
                          <ArrowRight className="h-5 w-5 text-[#00FFF3] self-center" />
                        </div>
                      </Card>
                    ))}
                  </div>
                  <div className="flex justify-center pt-4">
                    <Button variant="outline" onClick={handleViewAll} className="border-[#00FFF3]/30 text-[#00FFF3] hover:bg-[#00FFF3]/10">
                      View All Labs <ArrowRight className="h-4 w-4 ml-2" />
                    </Button>
                  </div>
                </>
              )}
            </TabsContent>

            <TabsContent value="homecare" className="mt-6">
              {isHomecareLoading ? (
                <div className="text-center py-8 text-gray-400">Loading homecare services...</div>
              ) : homecareServices.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-400 mb-4">No homecare services found</p>
                  <Button variant="outline" onClick={handleViewAll} className="border-[#00FFF3]/30 text-[#00FFF3]">
                    Browse All Homecare Services
                  </Button>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {homecareServices.map((service: HomecareService) => (
                      <Card key={service._id} className="p-4 hover:border-[#00FFF3]/40 transition-all cursor-pointer" onClick={() => handleProviderSelect(service._id)}>
                        <div className="flex gap-4">
                          <div className="w-16 h-16 rounded-lg bg-[#1A2333] flex items-center justify-center">
                            {service.type === 'doctor' ? (
                              <Stethoscope className="h-8 w-8 text-[#00FFF3]" />
                            ) : service.type === 'nurse' ? (
                              <Heart className="h-8 w-8 text-[#00FFF3]" />
                            ) : (
                              <Syringe className="h-8 w-8 text-[#00FFF3]" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-lg truncate">{service.name}</h3>
                            <Badge variant="outline" className="mb-2 text-[#00FFF3] border-[#00FFF3]/30">
                              <Home className="h-3 w-3 mr-1" />
                              {service.type === 'doctor' ? 'Doctor Visit' : service.type === 'nurse' ? 'Nurse Visit' : 'Lab Collection'}
                            </Badge>
                            <div className="flex items-center gap-4 text-sm text-gray-400">
                              <div className="flex items-center gap-1">
                                <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />
                                <span>{(service.rating != null ? +service.rating : null)?.toFixed(1) || "4.5"}</span>
                              </div>
                              {service.availability && (
                                <div className="flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  <span className="truncate text-xs">{service.availability}</span>
                                </div>
                              )}
                            </div>
                          </div>
                          <ArrowRight className="h-5 w-5 text-[#00FFF3] self-center" />
                        </div>
                      </Card>
                    ))}
                  </div>
                  <div className="flex justify-center pt-4">
                    <Button variant="outline" onClick={handleViewAll} className="border-[#00FFF3]/30 text-[#00FFF3] hover:bg-[#00FFF3]/10">
                      View All Homecare Services <ArrowRight className="h-4 w-4 ml-2" />
                    </Button>
                  </div>
                </>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}
