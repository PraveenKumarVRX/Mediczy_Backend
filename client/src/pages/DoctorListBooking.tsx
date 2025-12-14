import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search,
  Filter,
  Star,
  MapPin,
  Clock,
  Award,
  CheckCircle,
  Calendar,
  DollarSign,
  Languages,
  X,
  Video,
  Phone,
  User,
  Heart,
  Stethoscope,
  Brain,
  Eye,
  Users,
  Baby,
  Bone,
  Activity,
  Zap,
  ArrowRight,
  Badge as BadgeIcon,
  Shield,
  SlidersHorizontal,
  Sparkles
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { format, addDays, isBefore, startOfDay, parse } from "date-fns";
import { cn } from "@/lib/utils";
import api from "@/utils/api";
import MainLayout from "@/components/layout/MainLayout";

interface Doctor {
  _id: string;
  firstName: string;
  lastName: string;
  profileImage?: string;
  specialization: string;
  experience: number;
  education: string[];
  languages: string[];
  rating: number;
  reviewCount: number;
  consultationFee: {
    online: number;
    inPerson: number;
  };
  availability: {
    status: "Available" | "Busy" | "Away";
    nextAvailableSlot: string;
  };
  clinic: {
    name: string;
    address: string;
    city: string;
    state: string;
  };
  services: string[];
  verified: boolean;
}

const specializations = [
  { id: "general", label: "General Medicine", icon: Stethoscope, color: "text-blue-500" },
  { id: "cardiology", label: "Cardiology", icon: Heart, color: "text-red-500" },
  { id: "neurology", label: "Neurology", icon: Brain, color: "text-purple-500" },
  { id: "ophthalmology", label: "Ophthalmology", icon: Eye, color: "text-green-500" },
  { id: "pediatrics", label: "Pediatrics", icon: Baby, color: "text-pink-500" },
  { id: "orthopedics", label: "Orthopedics", icon: Bone, color: "text-orange-500" },
  { id: "psychiatry", label: "Psychiatry", icon: Users, color: "text-indigo-500" },
  { id: "dermatology", label: "Dermatology", icon: Activity, color: "text-yellow-500" }
];

const timeSlots = [
  "09:00 AM", "09:30 AM", "10:00 AM", "10:30 AM", "11:00 AM", "11:30 AM",
  "12:00 PM", "12:30 PM", "02:00 PM", "02:30 PM", "03:00 PM", "03:30 PM",
  "04:00 PM", "04:30 PM", "05:00 PM", "05:30 PM", "06:00 PM", "06:30 PM"
];

const DEFAULT_CLINIC = {
  name: "Mediczy Care Center",
  address: "Telehealth & Partner Clinics",
  city: "Multi-city",
  state: "India",
};

const toNumber = (value: any, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toArray = (value: any, fallback: string[] = []) => {
  if (Array.isArray(value)) {
    return value.filter(Boolean);
  }
  if (typeof value === "string" && value.trim().length) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.filter(Boolean);
      }
    } catch (error) {
      // Ignore JSON parse errors and fallback to comma split
    }
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return fallback;
};

const parseClinicInfo = (clinicAddress: any) => {
  if (!clinicAddress) return { ...DEFAULT_CLINIC };

  if (typeof clinicAddress === "object") {
    return {
      name: clinicAddress.name || DEFAULT_CLINIC.name,
      address: clinicAddress.address || clinicAddress.street || DEFAULT_CLINIC.address,
      city: clinicAddress.city || DEFAULT_CLINIC.city,
      state: clinicAddress.state || DEFAULT_CLINIC.state,
    };
  }

  if (typeof clinicAddress === "string") {
    const trimmed = clinicAddress.trim();
    if (!trimmed) return { ...DEFAULT_CLINIC };

    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      try {
        const parsed = JSON.parse(trimmed);
        return parseClinicInfo(parsed);
      } catch (error) {
        return {
          ...DEFAULT_CLINIC,
          address: trimmed,
        };
      }
    }

    const parts = trimmed.split(",").map((part) => part.trim()).filter(Boolean);
    return {
      name: DEFAULT_CLINIC.name,
      address: trimmed,
      city: parts.at(-2) || parts.at(-1) || DEFAULT_CLINIC.city,
      state: parts.at(-1) || DEFAULT_CLINIC.state,
    };
  }

  return { ...DEFAULT_CLINIC };
};

const TIME_24H_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

const toBackendTime = (label: string) => {
  if (!label) return "";
  const trimmed = label.trim();
  if (TIME_24H_REGEX.test(trimmed)) {
    return trimmed;
  }
  const parsed = parse(trimmed, "hh:mm a", new Date());
  if (isNaN(parsed.getTime())) {
    return trimmed;
  }
  return format(parsed, "HH:mm");
};

const toDisplayTime = (value: string) => {
  if (!value || !TIME_24H_REGEX.test(value)) {
    return value;
  }
  const parsed = parse(value, "HH:mm", new Date());
  if (isNaN(parsed.getTime())) {
    return value;
  }
  return format(parsed, "hh:mm a");
};

const normalizeDoctorFromApi = (doctor: any): Doctor => {
  const clinicInfo = parseClinicInfo(doctor?.clinicAddress);
  const languages = toArray(doctor?.languages, ["English"]);
  const education = toArray(doctor?.qualifications || doctor?.qualification, ["MBBS"]);
  const services = toArray(doctor?.expertise || doctor?.services, ["General Consultation"]);

  const onlineFee = toNumber(
    doctor?.onlineConsultationFee ?? doctor?.consultationFee ?? doctor?.consultationFees,
    800
  );
  const inPersonFee = toNumber(
    doctor?.inPersonConsultationFee ?? doctor?.consultationFees,
    onlineFee || 1000
  );

  const fallbackId = doctor?.id || doctor?._id || `temp-${Math.random().toString(36).slice(2)}`;

  return {
    _id: String(fallbackId),
    firstName: doctor?.firstName || "Doctor",
    lastName: doctor?.lastName || "",
    profileImage: doctor?.profileImage || "",
    specialization: doctor?.specialization || "General Medicine",
    experience: Number(doctor?.experience) || 5,
    education,
    languages,
    rating: toNumber(doctor?.averageRating ?? doctor?.rating, 4.7),
    reviewCount: toNumber(doctor?.totalReviews ?? doctor?.reviewCount, 0),
    consultationFee: {
      online: onlineFee,
      inPerson: inPersonFee,
    },
    availability: {
      status: doctor?.isOnline ? "Available" : doctor?.isAvailable ? "Busy" : "Away",
      nextAvailableSlot:
        doctor?.nextAvailableSlot || (doctor?.isOnline ? "Available now" : "Slots update hourly"),
    },
    clinic: clinicInfo,
    services,
    verified: Boolean(doctor?.isVerified),
  } as Doctor;
};

const DoctorListBooking = () => {
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [filteredDoctors, setFilteredDoctors] = useState<Doctor[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedSpecialization, setSelectedSpecialization] = useState<string>("");
  const [selectedLocation, setSelectedLocation] = useState<string>("");
  const [sortBy, setSortBy] = useState<string>("rating");
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [selectedDoctor, setSelectedDoctor] = useState<Doctor | null>(null);
  const [consultationType, setConsultationType] = useState<"online" | "inPerson">("online");
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [selectedTime, setSelectedTime] = useState<string>("");
  const [symptoms, setSymptoms] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [viewMode, setViewMode] = useState<"all" | "categories">("all");
  
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    fetchDoctors();
  }, []);

  useEffect(() => {
    filterDoctors();
  }, [doctors, searchTerm, selectedSpecialization, selectedLocation, sortBy]);

  const categorizedDoctors = useMemo(() => {
    const categories = specializations.map((spec) => {
      const doctorsInCategory = filteredDoctors.filter((doctor) =>
        doctor.specialization.toLowerCase().includes(spec.label.toLowerCase())
      );

      return {
        ...spec,
        doctors: doctorsInCategory,
      };
    });

    const categorizedIds = new Set<string>();
    categories.forEach((category) => {
      category.doctors.forEach((doctor) => categorizedIds.add(doctor._id));
    });

    const uncategorized = filteredDoctors.filter(
      (doctor) => !categorizedIds.has(doctor._id)
    );

    return { categories, uncategorized };
  }, [filteredDoctors]);

  const fetchDoctors = async () => {
    try {
      setLoading(true);
      const response = await api.get("/doctors/available");
      const apiDoctors = Array.isArray(response.data?.data)
        ? response.data.data
        : Array.isArray(response.data?.doctors)
        ? response.data.doctors
        : [];

      const normalizedDoctors = apiDoctors.map(normalizeDoctorFromApi).filter(Boolean);

      if (!normalizedDoctors.length) {
        setDoctors(mockDoctors);
        toast({
          title: "Showing test doctors",
          description: "No live doctor profiles were returned. Displaying demo doctors instead.",
        });
      } else {
        setDoctors(normalizedDoctors);
      }
    } catch (error) {
      console.error("Error fetching doctors:", error);
      // Mock data for development
      setDoctors(mockDoctors);
      toast({
        title: "Info",
        description: "Using sample doctor data",
      });
    } finally {
      setLoading(false);
    }
  };

  const filterDoctors = () => {
    let filtered = [...doctors];

    if (searchTerm) {
      filtered = filtered.filter(doctor => 
        doctor.firstName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        doctor.lastName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        doctor.specialization.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (selectedSpecialization) {
      filtered = filtered.filter(doctor => 
        doctor.specialization.toLowerCase().includes(selectedSpecialization.toLowerCase())
      );
    }

    if (selectedLocation) {
      filtered = filtered.filter(doctor =>
        doctor.clinic.city.toLowerCase().includes(selectedLocation.toLowerCase()) ||
        doctor.clinic.state.toLowerCase().includes(selectedLocation.toLowerCase())
      );
    }

    // Sort doctors
    filtered.sort((a, b) => {
      switch (sortBy) {
        case "rating":
          return b.rating - a.rating;
        case "experience":
          return b.experience - a.experience;
        case "fee":
          return a.consultationFee.online - b.consultationFee.online;
        default:
          return 0;
      }
    });

    setFilteredDoctors(filtered);
  };

  const getSpecializationIcon = (specialization: string) => {
    const spec = specializations.find(s => 
      s.label.toLowerCase().includes(specialization.toLowerCase())
    );
    return spec ? spec.icon : Stethoscope;
  };

  const getSpecializationColor = (specialization: string) => {
    const spec = specializations.find(s => 
      s.label.toLowerCase().includes(specialization.toLowerCase())
    );
    return spec ? spec.color : "text-blue-500";
  };

  const handleBookAppointment = (doctor: Doctor) => {
    setSelectedDoctor(doctor);
    setShowBookingModal(true);
  };

  const renderDoctorCard = (doctor: Doctor) => {
    const SpecIcon = getSpecializationIcon(doctor.specialization);
    const firstInitial = doctor.firstName?.[0] ?? "";
    const lastInitial = doctor.lastName?.[0] ?? "";

    return (
      <Card 
        key={doctor._id} 
        className="overflow-hidden border-0 shadow-lg hover:shadow-xl transition-all duration-300 bg-white group"
      >
        <div className={cn(
          "h-1.5 bg-gradient-to-r",
          doctor.specialization.toLowerCase().includes("card") && "from-red-500 to-pink-500",
          doctor.specialization.toLowerCase().includes("general") && "from-blue-500 to-cyan-500",
          doctor.specialization.toLowerCase().includes("derma") && "from-yellow-500 to-orange-500",
          doctor.specialization.toLowerCase().includes("neuro") && "from-purple-500 to-indigo-500",
          doctor.specialization.toLowerCase().includes("pedia") && "from-pink-500 to-rose-500",
          doctor.specialization.toLowerCase().includes("ortho") && "from-orange-500 to-amber-500",
          !["card", "general", "derma", "neuro", "pedia", "ortho"].some(s => 
            doctor.specialization.toLowerCase().includes(s)
          ) && "from-blue-500 to-green-500"
        )} />
        
        <CardContent className="p-6">
          <div className="flex gap-5">
            <div className="relative shrink-0">
              <Avatar className="h-24 w-24 ring-4 ring-gray-100 shadow-md">
                <AvatarImage src={doctor.profileImage} />
                <AvatarFallback className="bg-gradient-to-br from-blue-500 to-green-500 text-white text-xl font-bold">
                  {firstInitial}{lastInitial}
                </AvatarFallback>
              </Avatar>
              {doctor.verified && (
                <div className="absolute -bottom-1 -right-1 bg-blue-600 rounded-full p-1.5 shadow-md">
                  <CheckCircle className="h-4 w-4 text-white" />
                </div>
              )}
            </div>
            
            <div className="flex-1 min-w-0">
              <div className="mb-2">
                <h3 className="font-bold text-xl text-gray-900 group-hover:text-blue-600 transition-colors">
                  Dr. {doctor.firstName} {doctor.lastName}
                </h3>
                <div className="flex items-center gap-2 mt-1">
                  <SpecIcon className={cn("h-4 w-4", getSpecializationColor(doctor.specialization))} />
                  <span className="text-gray-600 font-medium">{doctor.specialization}</span>
                </div>
              </div>

              <div className="flex flex-wrap gap-4 mb-4">
                <div className="flex items-center gap-1.5 bg-yellow-50 px-3 py-1.5 rounded-full">
                  <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                  <span className="font-semibold text-gray-900">{doctor.rating}</span>
                  <span className="text-gray-500 text-sm">({doctor.reviewCount})</span>
                </div>
                <div className="flex items-center gap-1.5 bg-blue-50 px-3 py-1.5 rounded-full">
                  <Award className="h-4 w-4 text-blue-500" />
                  <span className="text-gray-700">{doctor.experience} years</span>
                </div>
                <div className="flex items-center gap-1.5 bg-gray-50 px-3 py-1.5 rounded-full">
                  <MapPin className="h-4 w-4 text-gray-500" />
                  <span className="text-gray-700">{doctor.clinic.city}</span>
                </div>
              </div>

              <div className="flex items-center gap-2 mb-4 text-sm text-gray-500">
                <Languages className="h-4 w-4" />
                <span>Speaks: {doctor.languages.join(", ")}</span>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-gray-100">
                <div className="flex gap-6">
                  <div>
                    <div className="flex items-center gap-1.5 text-blue-600">
                      <Video className="h-4 w-4" />
                      <span className="text-sm font-medium">Video</span>
                    </div>
                    <div className="text-lg font-bold text-gray-900">₹{doctor.consultationFee.online}</div>
                  </div>
                  <div className="border-l border-gray-200 pl-6">
                    <div className="flex items-center gap-1.5 text-green-600">
                      <User className="h-4 w-4" />
                      <span className="text-sm font-medium">Clinic</span>
                    </div>
                    <div className="text-lg font-bold text-gray-900">₹{doctor.consultationFee.inPerson}</div>
                  </div>
                </div>
                
                <Button 
                  onClick={() => handleBookAppointment(doctor)}
                  className="bg-gradient-to-r from-blue-600 to-green-600 hover:from-blue-700 hover:to-green-700 shadow-lg hover:shadow-xl transition-all rounded-full px-6"
                >
                  Book Now
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  const handleBookingSubmit = async () => {
    if (!selectedDoctor || !selectedDate || !selectedTime) {
      toast({
        title: "Error",
        description: "Please fill in all required fields",
        variant: "destructive"
      });
      return;
    }

    try {
      setIsSubmitting(true);

      const doctorIdentifier = (selectedDoctor.id ?? selectedDoctor._id)?.toString();
      if (!doctorIdentifier || !/^\d+$/.test(doctorIdentifier)) {
        toast({
          title: "Booking unavailable",
          description: "This doctor profile is not ready for online bookings yet.",
          variant: "destructive"
        });
        return;
      }
      
      const bookingData = {
        doctorId: parseInt(doctorIdentifier, 10),
        appointmentDate: format(selectedDate, "yyyy-MM-dd"),
        appointmentTime: selectedTime,
        consultationType: consultationType === "online" ? "video" : "in-person",
        symptoms,
        consultationFee: consultationType === "online" 
          ? selectedDoctor.consultationFee.online 
          : selectedDoctor.consultationFee.inPerson
      };

      const response = await api.post("/appointments", bookingData);
      
      toast({
        title: "Success!",
        description: "Your appointment has been booked successfully",
      });

      setShowBookingModal(false);
      navigate("/my-bookings");
      
    } catch (error: any) {
      console.error("Error booking appointment:", error);
      toast({
        title: "Booking Failed",
        description: error.response?.data?.message || "Failed to book appointment",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const isDateDisabled = (date: Date) => {
    return isBefore(date, startOfDay(new Date()));
  };

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="min-h-screen bg-gradient-to-br from-blue-50/50 via-background to-green-50/30">
        {/* Hero Header */}
        <div className="bg-gradient-to-r from-blue-600 via-blue-700 to-green-600 text-white">
          <div className="container mx-auto px-4 py-8">
            <div className="max-w-3xl">
              <div className="flex items-center gap-2 text-blue-100 mb-2">
                <Sparkles className="h-4 w-4" />
                <span className="text-sm font-medium">Find Your Perfect Doctor</span>
              </div>
              <h1 className="text-3xl md:text-4xl font-bold mb-3">
                Book Appointments with Top Doctors
              </h1>
              <p className="text-blue-100 text-lg">
                Connect with verified healthcare professionals for online and in-person consultations
              </p>
            </div>
            
            {/* Search Bar in Header */}
            <div className="mt-6 bg-white rounded-2xl p-2 shadow-xl max-w-4xl">
              <div className="flex flex-col md:flex-row gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <Input
                    placeholder="Search doctors, specialties..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-12 h-12 border-0 bg-gray-50 rounded-xl text-gray-900 placeholder:text-gray-500 focus-visible:ring-blue-500"
                  />
                </div>
                <div className="relative flex-1 md:border-l border-gray-200">
                  <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <Input
                    placeholder="City or location..."
                    value={selectedLocation}
                    onChange={(e) => setSelectedLocation(e.target.value)}
                    className="pl-12 h-12 border-0 bg-gray-50 rounded-xl text-gray-900 placeholder:text-gray-500 focus-visible:ring-blue-500"
                  />
                </div>
                <Button 
                  size="lg"
                  className="h-12 px-8 bg-gradient-to-r from-blue-600 to-green-600 hover:from-blue-700 hover:to-green-700 rounded-xl"
                >
                  <Search className="h-5 w-5 mr-2" />
                  Search
                </Button>
              </div>
            </div>
          </div>
        </div>

        <div className="container mx-auto px-4 py-6">
          {/* Quick Specialty Filters */}
          <div className="mb-6">
            <ScrollArea className="w-full whitespace-nowrap">
              <div className="flex gap-3 pb-2">
                <Button
                  variant={selectedSpecialization === "" ? "default" : "outline"}
                  onClick={() => setSelectedSpecialization("")}
                  className={cn(
                    "rounded-full px-5 shrink-0",
                    selectedSpecialization === "" && "bg-gradient-to-r from-blue-600 to-green-600"
                  )}
                >
                  All Specialists
                </Button>
                {specializations.map((spec) => {
                  const Icon = spec.icon;
                  const isSelected = selectedSpecialization.toLowerCase() === spec.label.toLowerCase();
                  return (
                    <Button
                      key={spec.id}
                      variant={isSelected ? "default" : "outline"}
                      onClick={() => setSelectedSpecialization(isSelected ? "" : spec.label)}
                      className={cn(
                        "rounded-full px-5 shrink-0 gap-2",
                        isSelected && "bg-gradient-to-r from-blue-600 to-green-600"
                      )}
                    >
                      <Icon className={cn("h-4 w-4", !isSelected && spec.color)} />
                      {spec.label}
                    </Button>
                  );
                })}
              </div>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          </div>

          {/* Filter Bar */}
          <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
            <p className="text-muted-foreground">
              Found <span className="font-semibold text-foreground">{filteredDoctors.length}</span> doctor{filteredDoctors.length !== 1 ? 's' : ''} 
              {selectedSpecialization && <span> in <span className="font-medium text-blue-600">{selectedSpecialization}</span></span>}
            </p>
            
            <div className="flex items-center gap-3">
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-[180px] rounded-full">
                  <SlidersHorizontal className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="rating">
                    <div className="flex items-center gap-2">
                      <Star className="h-4 w-4 text-yellow-500" />
                      Highest Rating
                    </div>
                  </SelectItem>
                  <SelectItem value="experience">
                    <div className="flex items-center gap-2">
                      <Award className="h-4 w-4 text-blue-500" />
                      Most Experienced
                    </div>
                  </SelectItem>
                  <SelectItem value="fee">
                    <div className="flex items-center gap-2">
                      <DollarSign className="h-4 w-4 text-green-500" />
                      Lowest Fee
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Tabs
            value={viewMode}
            onValueChange={(value) => setViewMode(value as "all" | "categories")}
            className="space-y-6"
          >
            <TabsList className="bg-white rounded-full p-1 shadow-md w-full max-w-md">
              <TabsTrigger
                value="all"
                className="rounded-full px-6 data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-600 data-[state=active]:to-green-600 data-[state=active]:text-white"
              >
                All Doctors
              </TabsTrigger>
              <TabsTrigger
                value="categories"
                className="rounded-full px-6 data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-600 data-[state=active]:to-green-600 data-[state=active]:text-white"
              >
                Category View
              </TabsTrigger>
            </TabsList>

            <TabsContent value="all" className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {filteredDoctors.map(renderDoctorCard)}
              </div>

              {filteredDoctors.length === 0 && (
                <Card className="p-12 text-center border-0 shadow-lg">
                  <div className="space-y-4">
                    <div className="w-20 h-20 bg-gradient-to-br from-blue-100 to-green-100 rounded-full flex items-center justify-center mx-auto">
                      <Stethoscope className="h-10 w-10 text-blue-600" />
                    </div>
                    <h3 className="text-xl font-bold text-gray-900">No doctors found</h3>
                    <p className="text-gray-500 max-w-sm mx-auto">
                      Try adjusting your search criteria or browse all available doctors
                    </p>
                    <Button 
                      variant="outline" 
                      onClick={() => {
                        setSearchTerm("");
                        setSelectedSpecialization("");
                        setSelectedLocation("");
                      }}
                      className="rounded-full"
                    >
                      Clear All Filters
                    </Button>
                  </div>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="categories" className="space-y-8">
              {(categorizedDoctors.categories.some((category) => category.doctors.length) ||
                categorizedDoctors.uncategorized.length > 0) ? (
                <div className="space-y-8">
                  {categorizedDoctors.categories.map((category) => {
                    if (!category.doctors.length) return null;
                    const Icon = category.icon;
                    return (
                      <section
                        key={category.id}
                        className="bg-white border border-gray-100 rounded-3xl shadow-lg p-6"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-4">
                          <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-2xl bg-gray-50 flex items-center justify-center">
                              <Icon className={cn("h-5 w-5", category.color)} />
                            </div>
                            <div>
                              <p className="text-sm text-gray-500">Specialists</p>
                              <h3 className="text-xl font-semibold text-gray-900">{category.label}</h3>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <Badge variant="secondary" className="rounded-full px-4">
                              {category.doctors.length} doctor{category.doctors.length !== 1 ? "s" : ""}
                            </Badge>
                            <Button
                              variant="outline"
                              size="sm"
                              className="rounded-full"
                              onClick={() => {
                                setSelectedSpecialization(category.label);
                                setViewMode("all");
                              }}
                            >
                              View only this specialty
                            </Button>
                          </div>
                        </div>

                        <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
                          {category.doctors.map(renderDoctorCard)}
                        </div>
                      </section>
                    );
                  })}

                  {categorizedDoctors.uncategorized.length > 0 && (
                    <section className="bg-white border border-gray-100 rounded-3xl shadow-lg p-6">
                      <div className="flex flex-wrap items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded-2xl bg-gray-50 flex items-center justify-center">
                            <Zap className="h-5 w-5 text-blue-600" />
                          </div>
                          <div>
                            <p className="text-sm text-gray-500">Additional Specialists</p>
                            <h3 className="text-xl font-semibold text-gray-900">Other Categories</h3>
                          </div>
                        </div>
                        <Badge variant="secondary" className="rounded-full px-4">
                          {categorizedDoctors.uncategorized.length} doctor{categorizedDoctors.uncategorized.length !== 1 ? "s" : ""}
                        </Badge>
                      </div>

                      <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {categorizedDoctors.uncategorized.map(renderDoctorCard)}
                      </div>
                    </section>
                  )}
                </div>
              ) : (
                <Card className="p-12 text-center border-0 shadow-lg">
                  <div className="space-y-4">
                    <div className="w-20 h-20 bg-gradient-to-br from-blue-100 to-green-100 rounded-full flex items-center justify-center mx-auto">
                      <Stethoscope className="h-10 w-10 text-blue-600" />
                    </div>
                    <h3 className="text-xl font-bold text-gray-900">No categories to show</h3>
                    <p className="text-gray-500 max-w-sm mx-auto">
                      Try adjusting your filters or search text to discover doctors in each category.
                    </p>
                    <Button 
                      variant="outline" 
                      onClick={() => {
                        setSearchTerm("");
                        setSelectedSpecialization("");
                        setSelectedLocation("");
                      }}
                      className="rounded-full"
                    >
                      Clear All Filters
                    </Button>
                  </div>
                </Card>
              )}
            </TabsContent>
          </Tabs>
        </div>

        {/* Booking Modal */}
        <Dialog open={showBookingModal} onOpenChange={setShowBookingModal}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader className="pb-4 border-b">
              <DialogTitle className="text-xl flex items-center gap-2">
                <Calendar className="h-5 w-5 text-blue-600" />
                Book Appointment
              </DialogTitle>
              <DialogDescription>
                Schedule your consultation with Dr. {selectedDoctor?.firstName} {selectedDoctor?.lastName}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-6 pt-4">
              {/* Doctor Info */}
              {selectedDoctor && (
                <Card className="border-0 bg-gradient-to-r from-blue-50 to-green-50">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-4">
                      <Avatar className="h-16 w-16 ring-2 ring-white shadow-md">
                        <AvatarImage src={selectedDoctor.profileImage} />
                        <AvatarFallback className="bg-gradient-to-br from-blue-500 to-green-500 text-white font-bold">
                          {selectedDoctor.firstName?.[0] ?? ""}
                          {selectedDoctor.lastName?.[0] ?? ""}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <h4 className="font-bold text-gray-900">
                          Dr. {selectedDoctor.firstName} {selectedDoctor.lastName}
                        </h4>
                        <p className="text-gray-600">{selectedDoctor.specialization}</p>
                        <div className="flex items-center gap-4 mt-2">
                          <div className="flex items-center gap-1 bg-yellow-100 px-2 py-0.5 rounded-full">
                            <Star className="h-3.5 w-3.5 text-yellow-500 fill-yellow-500" />
                            <span className="text-sm font-medium">{selectedDoctor.rating}</span>
                          </div>
                          <div className="flex items-center gap-1 text-gray-600">
                            <Award className="h-3.5 w-3.5" />
                            <span className="text-sm">{selectedDoctor.experience} years</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Consultation Type */}
              <div className="space-y-3">
                <Label className="text-base font-semibold">Consultation Type</Label>
                <RadioGroup 
                  value={consultationType} 
                  onValueChange={(value: "online" | "inPerson") => setConsultationType(value)}
                >
                  <div className={cn(
                    "flex items-center space-x-3 p-4 border-2 rounded-xl cursor-pointer transition-all",
                    consultationType === "online" ? "border-blue-500 bg-blue-50" : "border-gray-200 hover:border-gray-300"
                  )}>
                    <RadioGroupItem value="online" id="online" />
                    <Label htmlFor="online" className="flex items-center gap-3 cursor-pointer flex-1">
                      <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                        <Video className="h-5 w-5 text-blue-600" />
                      </div>
                      <div>
                        <div className="font-semibold text-gray-900">Online Consultation</div>
                        <div className="text-sm text-gray-500">
                          Video call with the doctor
                        </div>
                      </div>
                      <div className="ml-auto text-lg font-bold text-blue-600">
                        ₹{selectedDoctor?.consultationFee.online}
                      </div>
                    </Label>
                  </div>
                  
                  <div className={cn(
                    "flex items-center space-x-3 p-4 border-2 rounded-xl cursor-pointer transition-all",
                    consultationType === "inPerson" ? "border-green-500 bg-green-50" : "border-gray-200 hover:border-gray-300"
                  )}>
                    <RadioGroupItem value="inPerson" id="inPerson" />
                    <Label htmlFor="inPerson" className="flex items-center gap-3 cursor-pointer flex-1">
                      <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                        <User className="h-5 w-5 text-green-600" />
                      </div>
                      <div>
                        <div className="font-semibold text-gray-900">In-Person Visit</div>
                        <div className="text-sm text-gray-500">
                          {selectedDoctor?.clinic.name}
                        </div>
                      </div>
                      <div className="ml-auto text-lg font-bold text-green-600">
                        ₹{selectedDoctor?.consultationFee.inPerson}
                      </div>
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              {/* Date Selection */}
              <div className="space-y-3">
                <Label className="text-base font-semibold">Select Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal h-12 rounded-xl border-2",
                        !selectedDate && "text-muted-foreground",
                        selectedDate && "border-blue-200 bg-blue-50"
                      )}
                    >
                      <Calendar className="mr-3 h-5 w-5 text-blue-600" />
                      {selectedDate ? format(selectedDate, "EEEE, MMMM d, yyyy") : <span>Pick a date</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarComponent
                      mode="single"
                      selected={selectedDate}
                      onSelect={setSelectedDate}
                      disabled={isDateDisabled}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>

              {/* Time Selection */}
              <div className="space-y-3">
                <Label className="text-base font-semibold">Select Time</Label>
                <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                  {timeSlots.map((time) => {
                    const backendTime = toBackendTime(time);
                    return (
                      <Button
                        key={time}
                        variant={selectedTime === backendTime ? "default" : "outline"}
                        size="sm"
                        onClick={() => setSelectedTime(backendTime)}
                        className={cn(
                          "text-xs rounded-lg",
                          selectedTime === backendTime && "bg-gradient-to-r from-blue-600 to-green-600 border-0"
                        )}
                      >
                        {time}
                      </Button>
                    );
                  })}
                </div>
              </div>

              {/* Symptoms */}
              <div className="space-y-3">
                <Label htmlFor="symptoms" className="text-base font-semibold">
                  Describe your symptoms (optional)
                </Label>
                <Textarea
                  id="symptoms"
                  placeholder="Please describe your symptoms, concerns, or reason for consultation..."
                  value={symptoms}
                  onChange={(e) => setSymptoms(e.target.value)}
                  rows={4}
                  className="rounded-xl border-2 focus:border-blue-300"
                />
              </div>

              {/* Booking Summary */}
              <Card className="bg-gradient-to-r from-gray-50 to-gray-100 border-0">
                <CardContent className="p-5">
                  <h4 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                    <CheckCircle className="h-5 w-5 text-green-600" />
                    Booking Summary
                  </h4>
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600">Consultation Type</span>
                      <span className="font-semibold text-gray-900 flex items-center gap-1.5">
                        {consultationType === "online" ? (
                          <>
                            <Video className="h-4 w-4 text-blue-600" />
                            Video Call
                          </>
                        ) : (
                          <>
                            <User className="h-4 w-4 text-green-600" />
                            Clinic Visit
                          </>
                        )}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600">Date & Time</span>
                      <span className="font-semibold text-gray-900">
                        {selectedDate && selectedTime 
                          ? `${format(selectedDate, "MMM dd")} at ${toDisplayTime(selectedTime)}`
                          : "Not selected"
                        }
                      </span>
                    </div>
                    <Separator className="my-3" />
                    <div className="flex justify-between items-center text-lg">
                      <span className="font-semibold text-gray-900">Total Fee</span>
                      <span className="font-bold text-green-600">
                        ₹{selectedDoctor 
                          ? (consultationType === "online" 
                              ? selectedDoctor.consultationFee.online 
                              : selectedDoctor.consultationFee.inPerson)
                          : 0
                        }
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Action Buttons */}
              <div className="flex gap-3 pt-2">
                <Button 
                  variant="outline" 
                  onClick={() => setShowBookingModal(false)}
                  className="flex-1 h-12 rounded-xl"
                >
                  Cancel
                </Button>
                <Button 
                  onClick={handleBookingSubmit} 
                  disabled={isSubmitting || !selectedDate || !selectedTime}
                  className="flex-1 h-12 rounded-xl bg-gradient-to-r from-blue-600 to-green-600 hover:from-blue-700 hover:to-green-700"
                >
                  {isSubmitting ? "Booking..." : "Confirm Booking"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
};

// Mock data for development
const mockDoctors: Doctor[] = [
  {
    _id: "1",
    firstName: "Sarah",
    lastName: "Johnson",
    profileImage: "",
    specialization: "Cardiology",
    experience: 12,
    education: ["MBBS", "MD Cardiology"],
    languages: ["English", "Hindi"],
    rating: 4.8,
    reviewCount: 156,
    consultationFee: { online: 800, inPerson: 1200 },
    availability: { status: "Available", nextAvailableSlot: "Today 2:00 PM" },
    clinic: { name: "Heart Care Center", address: "123 Medical Street", city: "Mumbai", state: "Maharashtra" },
    services: ["Heart Disease", "Hypertension", "ECG"],
    verified: true
  },
  {
    _id: "2",
    firstName: "Rajesh",
    lastName: "Kumar",
    profileImage: "",
    specialization: "General Medicine",
    experience: 8,
    education: ["MBBS", "MD General Medicine"],
    languages: ["English", "Hindi", "Bengali"],
    rating: 4.6,
    reviewCount: 89,
    consultationFee: { online: 500, inPerson: 800 },
    availability: { status: "Available", nextAvailableSlot: "Tomorrow 10:00 AM" },
    clinic: { name: "City General Hospital", address: "456 Health Avenue", city: "Delhi", state: "Delhi" },
    services: ["General Check-up", "Diabetes", "Fever"],
    verified: true
  },
  {
    _id: "3",
    firstName: "Priya",
    lastName: "Sharma",
    profileImage: "",
    specialization: "Dermatology",
    experience: 6,
    education: ["MBBS", "MD Dermatology"],
    languages: ["English", "Hindi"],
    rating: 4.9,
    reviewCount: 203,
    consultationFee: { online: 700, inPerson: 1000 },
    availability: { status: "Available", nextAvailableSlot: "Today 4:30 PM" },
    clinic: { name: "Skin Care Clinic", address: "789 Beauty Lane", city: "Bangalore", state: "Karnataka" },
    services: ["Acne Treatment", "Skin Allergies", "Hair Loss"],
    verified: true
  }
];

export default DoctorListBooking;