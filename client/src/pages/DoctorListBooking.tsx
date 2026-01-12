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
  Sparkles,
  Loader2
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
import { getToken, getUserType } from "@/hooks/auth";

interface Doctor {
  _id: string;
  firstName: string;
  lastName: string;
  profileImage?: string;
  isLive?: boolean;
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
  { id: "general", label: "General Practitioner", icon: Stethoscope, color: "text-blue-500" },
  { id: "cardiology", label: "Cardiologist", icon: Heart, color: "text-red-500" },
  { id: "dermatology", label: "Dermatologist", icon: Activity, color: "text-yellow-500" },
  { id: "pediatrics", label: "Pediatrician", icon: Baby, color: "text-pink-500" },
  { id: "orthopedics", label: "Orthopedist", icon: Bone, color: "text-orange-500" },
  { id: "neurology", label: "Neurologist", icon: Brain, color: "text-purple-500" },
  { id: "psychiatry", label: "Psychiatrist", icon: Users, color: "text-indigo-500" },
  { id: "psychology", label: "Psychologist", icon: Brain, color: "text-purple-400" },
  { id: "gynecology", label: "Gynecologist", icon: User, color: "text-pink-600" },
  { id: "ent", label: "ENT Specialist", icon: Stethoscope, color: "text-teal-500" },
  { id: "ophthalmology", label: "Ophthalmologist", icon: Eye, color: "text-green-500" },
  { id: "rheumatology", label: "Rheumatologist", icon: Activity, color: "text-amber-500" },
  { id: "pulmonology", label: "Pulmonologist", icon: Activity, color: "text-cyan-500" },
  { id: "physiotherapy", label: "Physiotherapist", icon: Activity, color: "text-lime-500" },
  { id: "occupational", label: "Occupational Therapist", icon: Users, color: "text-emerald-500" },
  { id: "nutrition", label: "Nutritionist", icon: Heart, color: "text-green-600" },
  { id: "dietician", label: "Dietician", icon: Heart, color: "text-green-700" },
  { id: "nephrology", label: "Nephrologist", icon: Activity, color: "text-blue-600" },
  { id: "urology", label: "Urologist", icon: Stethoscope, color: "text-indigo-600" },
  { id: "diabetology", label: "Diabetologist", icon: Activity, color: "text-red-400" },
  { id: "intensive", label: "Intensivist", icon: Heart, color: "text-red-600" },
  { id: "cardiothoracic", label: "Cardio Thoracic Surgeon", icon: Heart, color: "text-red-700" },
  { id: "vascular", label: "Vascular Surgeon", icon: Activity, color: "text-rose-500" },
  { id: "neuro-surgery", label: "Neuro Surgeon", icon: Brain, color: "text-purple-600" },
  { id: "cardiovascular", label: "Cardio Vascular Surgeon", icon: Heart, color: "text-red-800" },
  { id: "gastro", label: "Gastroenterologist", icon: Stethoscope, color: "text-amber-600" },
  { id: "gastro-surgeon", label: "Gastro Surgeon", icon: Stethoscope, color: "text-amber-700" },
  { id: "general-surgeon", label: "General Surgeon", icon: Stethoscope, color: "text-slate-600" },
  { id: "proctology", label: "Proctologist", icon: Stethoscope, color: "text-stone-600" },
  { id: "podiatry", label: "Podiatrician", icon: Bone, color: "text-orange-600" },
  { id: "dentistry", label: "Dentist", icon: Stethoscope, color: "text-sky-500" },
  { id: "endocrinology", label: "Endocrinologist", icon: Activity, color: "text-violet-500" },
  { id: "oncology", label: "Oncologist", icon: Heart, color: "text-fuchsia-600" },
  { id: "other", label: "Other", icon: Stethoscope, color: "text-gray-500" }
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
    isLive: true,
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

const normalizeMasterDoctor = (doc: any): Doctor => {
  const fullName = doc?.name || "Doctor";
  const [firstName, ...rest] = fullName.split(" ");
  const lastName = rest.join(" ");
  const specialization =
    doc?.specialty ||
    doc?.specialties?.[0] ||
    doc?.specialities?.[0] ||
    doc?.specialities ||
    "General Medicine";

  return {
    _id: String(doc?.id || `master-${Math.random().toString(36).slice(2)}`),
    isLive: true,
    firstName: firstName || "Doctor",
    lastName,
    profileImage: "",
    specialization,
    experience: Number(doc?.experience || 8),
    education: toArray(doc?.qualification, ["MBBS"]),
    languages: ["English"],
    rating: 4.6,
    reviewCount: 0,
    consultationFee: {
      online: toNumber(doc?.consultationFees, 700),
      inPerson: toNumber(doc?.consultationFees, 900),
    },
    availability: {
      status: "Available",
      nextAvailableSlot: "Slots available this week",
    },
    clinic: {
      name: doc?.clinic_name || "Mediczy Partner Clinic",
      address: doc?.address || doc?.clinic_name || "Across partner locations",
      city: doc?.city || "Multiple",
      state: doc?.state || "India",
    },
    services: toArray(doc?.services, ["Consultation"]),
    verified: Boolean(doc?.isVerified ?? true),
  };
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
  const [doctorSlots, setDoctorSlots] = useState<any>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [userType, setUserType] = useState<string | null>(() => getUserType());
  
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    const handler = () => setUserType(getUserType());
    window.addEventListener('authChange', handler);
    return () => window.removeEventListener('authChange', handler);
  }, []);

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

  const fetchDoctorsFromApi = async (path: string, params?: Record<string, any>) => {
    const response = await api.get(path, params ? { params } : undefined);
    const apiDoctors = Array.isArray(response.data?.data)
      ? response.data.data
      : Array.isArray(response.data?.doctors)
      ? response.data.doctors
      : [];
    return apiDoctors.map(normalizeDoctorFromApi).filter(Boolean);
  };

  const fetchDoctors = async () => {
    try {
      setLoading(true);
      const primaryDoctors = await fetchDoctorsFromApi("/doctors/available");

      if (primaryDoctors.length) {
        setDoctors(primaryDoctors);
        return;
      }

      const secondaryDoctors = await fetchDoctorsFromApi("/doctors", { limit: 100 });
      if (secondaryDoctors.length) {
        setDoctors(secondaryDoctors);
        toast({
          title: "Loaded live doctors",
          description: "Showing doctor profiles directly from the database.",
        });
        return;
      }

      // Third fallback: masterdata providers list
      try {
        const masterRes = await api.get("/masterdata/doctors", { params: { limit: 50 } });
        const masterList = Array.isArray(masterRes.data?.data) ? masterRes.data.data : [];
        const normalizedMaster = masterList.map(normalizeMasterDoctor).filter(Boolean);
        if (normalizedMaster.length) {
          setDoctors(normalizedMaster);
          toast({
            title: "Showing provider network doctors",
            description: "Loaded doctors from the master provider directory.",
          });
          return;
        }
      } catch (e) {
        console.error("Master data doctors fetch failed:", e);
      }

      setDoctors(mockDoctors);
      toast({
        title: "Showing test doctors",
        description: "No live doctor profiles were returned. Displaying demo doctors instead.",
      });
    } catch (error) {
      console.error("Error fetching doctors:", error);
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
      const loc = selectedLocation.toLowerCase();
      filtered = filtered.filter(doctor => {
        const city = doctor.clinic?.city?.toLowerCase?.() || '';
        const state = doctor.clinic?.state?.toLowerCase?.() || '';
        return city.includes(loc) || state.includes(loc);
      });
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
    if (userType === "doctor") {
      toast({
        title: "Not available for doctors",
        description: "Doctor accounts cannot book patient appointments. Please sign in as a patient.",
        variant: "destructive",
      });
      navigate("/login", { state: { redirect: "/doctors" } });
      return;
    }

    const token = getToken();
    if (!token) {
      toast({
        title: "Login required",
        description: "Please sign in as a patient to book an appointment.",
        variant: "destructive",
      });
      navigate("/login", { state: { redirect: "/doctors" } });
      return;
    }

    if (!doctor.isLive) {
      toast({
        title: "Still loading doctors",
        description: "Please choose a doctor from the live database list once it finishes loading.",
        variant: "destructive",
      });
      return;
    }

    setSelectedDoctor(doctor);
    setShowBookingModal(true);
    setDoctorSlots(null); // Reset slots when opening modal
    fetchDoctorSlots(doctor._id, selectedDate);
  };

  const fetchDoctorSlots = async (doctorId: string, date?: Date) => {
    if (!doctorId) return;
    
    setLoadingSlots(true);
    try {
      const dateParam = date ? format(date, 'yyyy-MM-dd') : undefined;
      const { data } = await api.get(`/doctors/${doctorId}/user-slots`, {
        params: dateParam ? { date: dateParam } : {}
      });
      
      setDoctorSlots(data);
    } catch (error) {
      console.error('Error fetching doctor slots:', error);
      toast({
        title: "Info",
        description: "Could not load doctor's availability schedule",
        variant: "default",
      });
    } finally {
      setLoadingSlots(false);
    }
  };

  // Fetch slots when date changes
  useEffect(() => {
    if (selectedDoctor && selectedDate && showBookingModal) {
      fetchDoctorSlots(selectedDoctor._id, selectedDate);
    }
  }, [selectedDate, selectedDoctor, showBookingModal]);

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
              <Avatar className="h-24 w-24 ring-4 ring-slate-100 dark:ring-slate-700 shadow-md">
                <AvatarImage src={doctor.profileImage} />
                <AvatarFallback className="bg-gradient-to-br from-teal-500 to-teal-600 text-white text-xl font-bold">
                  {firstInitial}{lastInitial}
                </AvatarFallback>
              </Avatar>
              {doctor.verified && (
                <div className="absolute -bottom-1 -right-1 bg-teal-500 rounded-full p-1.5 shadow-md">
                  <CheckCircle className="h-4 w-4 text-white" />
                </div>
              )}
            </div>
            
            <div className="flex-1 min-w-0">
              <div className="mb-2">
                <h3 className="font-bold text-xl text-slate-900 dark:text-white group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors">
                  Dr. {doctor.firstName} {doctor.lastName}
                </h3>
                <div className="flex items-center gap-2 mt-1">
                  <SpecIcon className={cn("h-4 w-4", getSpecializationColor(doctor.specialization))} />
                  <span className="text-slate-600 dark:text-slate-400 font-medium">{doctor.specialization}</span>
                </div>
              </div>

              <div className="flex flex-wrap gap-4 mb-4">
                <div className="flex items-center gap-1.5 bg-yellow-50 dark:bg-yellow-900/20 px-3 py-1.5 rounded-full">
                  <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                  <span className="font-semibold text-slate-900 dark:text-white">{doctor.rating}</span>
                  <span className="text-slate-500 dark:text-slate-400 text-sm">({doctor.reviewCount})</span>
                </div>
                <div className="flex items-center gap-1.5 bg-teal-50 dark:bg-teal-900/20 px-3 py-1.5 rounded-full">
                  <Award className="h-4 w-4 text-teal-500" />
                  <span className="text-slate-700 dark:text-slate-300">{doctor.experience} years</span>
                </div>
                <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-700/50 px-3 py-1.5 rounded-full">
                  <MapPin className="h-4 w-4 text-slate-500" />
                  <span className="text-slate-700 dark:text-slate-300">{doctor.clinic.city}</span>
                </div>
              </div>

              <div className="flex items-center gap-2 mb-4 text-sm text-gray-500">
                <Languages className="h-4 w-4" />
                <span>Speaks: {doctor.languages.join(", ")}</span>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-slate-700">
                <div className="flex gap-6">
                  <div>
                    <div className="flex items-center gap-1.5 text-teal-600 dark:text-teal-400">
                      <Video className="h-4 w-4" />
                      <span className="text-sm font-medium">Video</span>
                    </div>
                    <div className="text-lg font-bold text-slate-900 dark:text-white">₹{doctor.consultationFee.online}</div>
                  </div>
                  <div className="border-l border-slate-200 dark:border-slate-700 pl-6">
                    <div className="flex items-center gap-1.5 text-green-600 dark:text-green-400">
                      <User className="h-4 w-4" />
                      <span className="text-sm font-medium">Clinic</span>
                    </div>
                    <div className="text-lg font-bold text-slate-900 dark:text-white">₹{doctor.consultationFee.inPerson}</div>
                  </div>
                </div>
                
                {userType === "doctor" ? (
                  <div className="text-sm text-muted-foreground">
                    Doctor accounts cannot book from the patient view. Please sign in as a patient to book.
                  </div>
                ) : (
                  <Button 
                    onClick={() => handleBookAppointment(doctor)}
                    className="bg-gradient-to-r from-teal-500 to-teal-600 hover:from-teal-600 hover:to-teal-700 text-white shadow-lg hover:shadow-xl transition-all rounded-full px-6"
                  >
                    Book Now
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                )}
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

      const normalizedTime = toBackendTime(selectedTime);
      if (!normalizedTime) {
        toast({
          title: "Invalid time",
          description: "Please select a valid appointment time.",
          variant: "destructive",
        });
        return;
      }

      const doctorIdentifier = selectedDoctor._id?.toString();
      if (!doctorIdentifier) {
        toast({
          title: "Booking unavailable",
          description: "Doctor information is incomplete. Please try another doctor.",
          variant: "destructive"
        });
        return;
      }

      if (!selectedDoctor.isLive) {
        toast({
          title: "Live doctor required",
          description: "Please select a doctor from the live database list to continue.",
          variant: "destructive",
        });
        return;
      }

      // Convert doctor ID to number if possible, otherwise use as string
      let doctorId: number | string;
      if (/^\d+$/.test(doctorIdentifier)) {
        doctorId = parseInt(doctorIdentifier, 10);
      } else {
        // For non-numeric IDs (like MongoDB ObjectIDs), use as string
        doctorId = doctorIdentifier;
      }
      
      const bookingData = {
        doctorId,
        appointmentDate: format(selectedDate, "yyyy-MM-dd"),
        appointmentTime: normalizedTime,
        consultationType: consultationType === "online" ? "video" : "in-person",
        symptoms,
        consultationFee: consultationType === "online" 
          ? selectedDoctor.consultationFee.online 
          : selectedDoctor.consultationFee.inPerson
      };

      const response = await api.post("/appointments", bookingData);
      
      toast({
        title: "Success!",
        description: "Your appointment has been booked successfully. View your bookings to check status.",
        action: {
          label: "View my bookings",
          onClick: () => navigate("/my-bookings"),
        },
      });

      setShowBookingModal(false);
      // Stay on the doctors page after booking; patient can navigate to My Bookings manually
      // navigate("/my-bookings");
      
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
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50/80 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800">
        {/* Hero Header */}
        <div className="bg-gradient-to-r from-slate-800 via-slate-900 to-slate-800 text-white">
          <div className="container mx-auto px-4 py-8">
            <div className="max-w-3xl">
              <div className="flex items-center gap-2 text-teal-400 mb-2">
                <Sparkles className="h-4 w-4" />
                <span className="text-sm font-medium">Find Your Perfect Doctor</span>
              </div>
              <h1 className="text-3xl md:text-4xl font-bold mb-3">
                Book Appointments with Top Doctors
              </h1>
              <p className="text-slate-300 text-lg">
                Connect with verified healthcare professionals for online and in-person consultations
              </p>
            </div>
            
            {/* Search Bar in Header */}
            <div className="mt-6 bg-white dark:bg-slate-800 rounded-2xl p-2 shadow-xl max-w-4xl">
              <div className="flex flex-col md:flex-row gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                  <Input
                    placeholder="Search doctors, specialties..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-12 h-12 border-0 bg-slate-50 dark:bg-slate-700 rounded-xl text-slate-900 dark:text-white placeholder:text-slate-500 focus-visible:ring-teal-500"
                  />
                </div>
                <div className="relative flex-1 md:border-l border-slate-200 dark:border-slate-600">
                  <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                  <Input
                    placeholder="City or location..."
                    value={selectedLocation}
                    onChange={(e) => setSelectedLocation(e.target.value)}
                    className="pl-12 h-12 border-0 bg-slate-50 dark:bg-slate-700 rounded-xl text-slate-900 dark:text-white placeholder:text-slate-500 focus-visible:ring-teal-500"
                  />
                </div>
                <Button 
                  size="lg"
                  className="h-12 px-8 bg-gradient-to-r from-teal-500 to-teal-600 hover:from-teal-600 hover:to-teal-700 rounded-xl text-white"
                  onClick={() => {
                    filterDoctors();
                  }}
                >
                  <Search className="h-5 w-5 mr-2" />
                  Search
                </Button>
              </div>
                <div className="flex justify-end mt-3 pr-1">
                  <Button
                    variant="outline"
                    className="rounded-full"
                    onClick={() => navigate("/my-bookings")}
                  >
                    View my bookings
                  </Button>
                </div>
            </div>
          </div>
        </div>

        <div className="container mx-auto px-4 py-6">
          {userType === "doctor" && (
            <div className="mb-4 rounded-xl border border-yellow-200 bg-yellow-50 text-yellow-800 px-4 py-3 text-sm">
              Doctor accounts cannot book appointments from the patient view. Please sign in as a patient to book.
            </div>
          )}
          {/* Quick Specialty Filters */}
          <div className="mb-6">
            <ScrollArea className="w-full whitespace-nowrap">
              <div className="flex gap-3 pb-2">
                <Button
                  variant={selectedSpecialization === "" ? "default" : "outline"}
                  onClick={() => setSelectedSpecialization("")}
                  className={cn(
                    "rounded-full px-5 shrink-0",
                    selectedSpecialization === "" && "bg-gradient-to-r from-teal-500 to-teal-600 text-white"
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
                        isSelected && "bg-gradient-to-r from-teal-500 to-teal-600 text-white"
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
            <p className="text-slate-500 dark:text-slate-400">
              Found <span className="font-semibold text-slate-800 dark:text-white">{filteredDoctors.length}</span> doctor{filteredDoctors.length !== 1 ? 's' : ''} 
              {selectedSpecialization && <span> in <span className="font-medium text-teal-600 dark:text-teal-400">{selectedSpecialization}</span></span>}
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
            <TabsList className="bg-white dark:bg-slate-800 rounded-full p-1 shadow-md w-full max-w-md border border-slate-200 dark:border-slate-700">
              <TabsTrigger
                value="all"
                className="rounded-full px-6 data-[state=active]:bg-gradient-to-r data-[state=active]:from-teal-500 data-[state=active]:to-teal-600 data-[state=active]:text-white"
              >
                All Doctors
              </TabsTrigger>
              <TabsTrigger
                value="categories"
                className="rounded-full px-6 data-[state=active]:bg-gradient-to-r data-[state=active]:from-teal-500 data-[state=active]:to-teal-600 data-[state=active]:text-white"
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
                          {doctorSlots?.slots?.inPerson?.[0]?.location?.name || selectedDoctor?.clinic.name}
                        </div>
                      </div>
                      <div className="ml-auto text-lg font-bold text-green-600">
                        ₹{doctorSlots?.slots?.inPerson?.[0]?.location?.fee || selectedDoctor?.consultationFee.inPerson}
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
                
                {loadingSlots ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
                    <span className="ml-2 text-gray-600">Loading available slots...</span>
                  </div>
                ) : doctorSlots && !doctorSlots.isOff ? (
                  <div className="space-y-4">
                    {/* Online Slots */}
                    {consultationType === "online" && doctorSlots.slots?.online?.length > 0 ? (
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <Video className="h-4 w-4 text-blue-600" />
                          <span className="text-sm font-semibold text-gray-700">Online Consultation Slots</span>
                          <Badge variant="outline" className="text-xs">
                            {doctorSlots.slotDuration || 30} min slots
                          </Badge>
                        </div>
                        <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                          {doctorSlots.slots.online
                            .filter((slot: any) => slot.available && !slot.blocked)
                            .map((slot: any) => {
                              const slotTime = slot.time;
                              return (
                                <Button
                                  key={slotTime}
                                  variant={selectedTime === slotTime ? "default" : "outline"}
                                  size="sm"
                                  onClick={() => setSelectedTime(slotTime)}
                                  className={cn(
                                    "text-xs rounded-lg",
                                    selectedTime === slotTime && "bg-gradient-to-r from-blue-600 to-blue-500 border-0"
                                  )}
                                >
                                  {slotTime}
                                </Button>
                              );
                            })}
                        </div>
                        {doctorSlots.slots.online.filter((s: any) => s.available && !s.blocked).length === 0 && (
                          <p className="text-sm text-gray-500 py-4 text-center">No available online slots for this date</p>
                        )}
                      </div>
                    ) : null}

                    {/* In-Person Slots */}
                    {consultationType === "inPerson" && doctorSlots.slots?.inPerson?.length > 0 ? (
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <User className="h-4 w-4 text-green-600" />
                          <span className="text-sm font-semibold text-gray-700">In-Person Consultation Slots</span>
                          <Badge variant="outline" className="text-xs">
                            {doctorSlots.slotDuration || 30} min slots
                          </Badge>
                        </div>
                        
                        {/* Location Info */}
                        {doctorSlots.slots.inPerson[0]?.location && (
                          <div className="mb-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                            <div className="flex items-start gap-2">
                              <MapPin className="h-4 w-4 text-green-600 mt-0.5" />
                              <div className="flex-1">
                                <p className="font-semibold text-gray-900 text-sm">{doctorSlots.slots.inPerson[0].location.name}</p>
                                <p className="text-xs text-gray-600">{doctorSlots.slots.inPerson[0].location.address}</p>
                                <p className="text-xs font-semibold text-green-700 mt-1">
                                  Consultation Fee: ₹{doctorSlots.slots.inPerson[0].location.fee}
                                </p>
                              </div>
                            </div>
                          </div>
                        )}
                        
                        <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                          {doctorSlots.slots.inPerson
                            .filter((slot: any) => slot.available && !slot.blocked)
                            .map((slot: any) => {
                              const slotTime = slot.time;
                              return (
                                <Button
                                  key={slotTime}
                                  variant={selectedTime === slotTime ? "default" : "outline"}
                                  size="sm"
                                  onClick={() => setSelectedTime(slotTime)}
                                  className={cn(
                                    "text-xs rounded-lg",
                                    selectedTime === slotTime && "bg-gradient-to-r from-green-600 to-green-500 border-0"
                                  )}
                                >
                                  {slotTime}
                                </Button>
                              );
                            })}
                        </div>
                        {doctorSlots.slots.inPerson.filter((s: any) => s.available && !s.blocked).length === 0 && (
                          <p className="text-sm text-gray-500 py-4 text-center">No available in-person slots for this date</p>
                        )}
                      </div>
                    ) : null}

                    {/* No slots available for selected type */}
                    {consultationType === "online" && (!doctorSlots.slots?.online || doctorSlots.slots.online.length === 0) && (
                      <p className="text-sm text-gray-500 py-4 text-center">Doctor does not have online consultation slots configured for this day</p>
                    )}
                    {consultationType === "inPerson" && (!doctorSlots.slots?.inPerson || doctorSlots.slots.inPerson.length === 0) && (
                      <p className="text-sm text-gray-500 py-4 text-center">Doctor does not have in-person consultation slots configured for this day</p>
                    )}
                  </div>
                ) : doctorSlots && doctorSlots.isOff ? (
                  <div className="py-8 text-center">
                    <Calendar className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-600 font-medium">Doctor is not available on this day</p>
                    <p className="text-sm text-gray-500 mt-1">Please select a different date</p>
                  </div>
                ) : (
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
                )}
                {selectedTime && !loadingSlots ? (
                  <p className="text-xs text-muted-foreground">
                    Selected slot: <span className="font-medium text-foreground">{selectedTime}</span>
                  </p>
                ) : null}
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
                        ₹{(() => {
                          if (!selectedDoctor) return 0;
                          if (consultationType === "online") {
                            return selectedDoctor.consultationFee.online;
                          } else {
                            // Use location-specific fee if available
                            const locationFee = doctorSlots?.slots?.inPerson?.[0]?.location?.fee;
                            return locationFee || selectedDoctor.consultationFee.inPerson;
                          }
                        })()}
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
].map((doctor) => ({ ...doctor, isLive: doctor.isLive ?? false }));

export default DoctorListBooking;
