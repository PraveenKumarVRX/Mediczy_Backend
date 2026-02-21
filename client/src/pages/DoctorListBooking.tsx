import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
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
  Loader2,
  Coins,
  Wallet
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
import walletService, { HCCalculation } from "@/services/wallet.service";

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
const DOCTOR_ID_REGEX = /^\d+$/;
const DOCTOR_PUBLIC_ID_REGEX = /^D[A-Z0-9]{5}$/i;

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

// Group slots by time of day
const groupSlotsByTimeOfDay = (slots: any[]) => {
  const morning: any[] = [];
  const afternoon: any[] = [];
  const evening: any[] = [];
  
  slots.forEach(slot => {
    const time = slot.time;
    const hour = parseInt(time.split(':')[0]);
    
    if (hour >= 6 && hour < 12) {
      morning.push(slot);
    } else if (hour >= 12 && hour < 17) {
      afternoon.push(slot);
    } else {
      evening.push(slot);
    }
  });
  
  return { morning, afternoon, evening };
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

  const fallbackId = doctor?.id || doctor?.unique_id || `temp-${Math.random().toString(36).slice(2)}`;
  const hasLiveId = Boolean(doctor?.id || doctor?.unique_id);

  return {
    _id: String(fallbackId),
    isLive: hasLiveId,
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
    isLive: false,
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
  const queryClient = useQueryClient();
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
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [selectedTime, setSelectedTime] = useState<string>("");
  const [bookingStep, setBookingStep] = useState<1 | 2 | 3 | 4>(1);
  const [symptoms, setSymptoms] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [viewMode, setViewMode] = useState<"all" | "categories">("all");
  const [doctorSlots, setDoctorSlots] = useState<any>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [userType, setUserType] = useState<string | null>(() => getUserType());
  const [monthAvailability, setMonthAvailability] = useState<Record<string, boolean>>({});
  
  // Health Coins payment states
  const [paymentMethod, setPaymentMethod] = useState<"inr" | "hc">("inr");
  const [hcCalculation, setHcCalculation] = useState<HCCalculation | null>(null);
  const [loadingHC, setLoadingHC] = useState(false);
  const [walletBalance, setWalletBalance] = useState<number>(0);
  
  // Confirmation dialog state
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [bookedAppointment, setBookedAppointment] = useState<any>(null);
  
  const { toast } = useToast();
  const navigate = useNavigate();

  const isValidDoctorIdentifier = (value?: string) => {
    if (!value) return false;
    return DOCTOR_ID_REGEX.test(value) || DOCTOR_PUBLIC_ID_REGEX.test(value);
  };

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
      : Array.isArray(response.data?.data?.doctors)
      ? response.data.data.doctors
      : Array.isArray(response.data?.data?.rows)
      ? response.data.data.rows
      : Array.isArray(response.data?.data?.data)
      ? response.data.data.data
      : [];
    return apiDoctors.map(normalizeDoctorFromApi).filter(Boolean);
  };

  const fetchDoctors = async () => {
    try {
      setLoading(true);
      let primaryDoctors: Doctor[] = [];
      try {
        primaryDoctors = await fetchDoctorsFromApi("/doctors/available");
      } catch (error) {
        console.warn("Primary doctor list unavailable, falling back to /doctors:", error);
      }

      if (primaryDoctors.length) {
        setDoctors(primaryDoctors);
        return;
      }

      let secondaryDoctors: Doctor[] = [];
      try {
        secondaryDoctors = await fetchDoctorsFromApi("/doctors", { limit: 100 });
      } catch (error) {
        console.warn("Secondary doctor list failed:", error);
      }

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
    const normalizedSearch = searchTerm
      .toLowerCase()
      .replace(/\bdr\.?\b/g, "")
      .replace(/\s+/g, " ")
      .trim();

    if (normalizedSearch) {
      filtered = filtered.filter(doctor => {
        const firstName = doctor.firstName || "";
        const lastName = doctor.lastName || "";
        const specialization = doctor.specialization || "";
        const fullName = `${firstName} ${lastName}`.trim();
        const haystack = `${firstName} ${lastName} ${fullName} ${specialization}`
          .toLowerCase()
          .replace(/\bdr\.?\b/g, "")
          .replace(/\s+/g, " ")
          .trim();

        return haystack.includes(normalizedSearch);
      });
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

  const handleBookAppointment = async (doctor: Doctor) => {
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

    if (!isValidDoctorIdentifier(doctor._id)) {
      toast({
        title: "Booking unavailable",
        description: "This doctor profile is not linked to a live ID yet. Please choose another doctor.",
        variant: "destructive",
      });
      return;
    }

    setSelectedDoctor(doctor);
    setShowBookingModal(true);
    setDoctorSlots(null); // Reset slots when opening modal
    setSelectedTime(""); // Clear time selection
    
    // Smart date initialization: Try to find first available date
    const smartDate = await findNextAvailableDate(doctor._id);
    setSelectedDate(smartDate);
    fetchDoctorSlots(doctor._id, smartDate);
  };

  // Find the next available date with slots (up to 14 days ahead)
  const findNextAvailableDate = async (doctorId: string): Promise<Date> => {
    const today = new Date();
    
    // Try next 14 days to find a date with available slots
    for (let i = 0; i < 14; i++) {
      const checkDate = addDays(today, i);
      try {
        const dateParam = format(checkDate, 'yyyy-MM-dd');
        const { data } = await api.get(`/doctors/${doctorId}/user-slots`, {
          params: { date: dateParam }
        });
        
        // Check if this date has any available slots
        if (data && !data.isOff) {
          const hasAvailableOnline = data.slots?.online?.some((s: any) => s.available && !s.blocked);
          const hasAvailableInPerson = data.slots?.inPerson?.some((s: any) => s.available && !s.blocked);
          
          if (hasAvailableOnline || hasAvailableInPerson) {
            return checkDate; // Found a date with availability
          }
        }
      } catch (error) {
        // Continue checking next dates
      }
    }
    
    // If no available date found, default to today
    return today;
  };

  // Load availability for the entire month to show indicators on calendar
  const loadMonthAvailability = async (doctorId: string, month: Date) => {
    const startDate = new Date(month.getFullYear(), month.getMonth(), 1);
    const endDate = new Date(month.getFullYear(), month.getMonth() + 1, 0);
    const availability: Record<string, boolean> = {};
    
    // Check each day in the month (could be optimized with batch API in future)
    for (let date = new Date(startDate); date <= endDate; date.setDate(date.getDate() + 1)) {
      if (isBefore(date, startOfDay(new Date()))) continue; // Skip past dates
      
      try {
        const dateParam = format(date, 'yyyy-MM-dd');
        const { data } = await api.get(`/doctors/${doctorId}/user-slots`, {
          params: { date: dateParam }
        });
        
        if (data && !data.isOff) {
          const hasAvailable = 
            data.slots?.online?.some((s: any) => s.available && !s.blocked) ||
            data.slots?.inPerson?.some((s: any) => s.available && !s.blocked);
          availability[dateParam] = hasAvailable;
        } else {
          availability[dateParam] = false;
        }
      } catch (error) {
        availability[format(date, 'yyyy-MM-dd')] = false;
      }
    }
    
    setMonthAvailability(availability);
  };

  const fetchDoctorSlots = async (doctorId: string, date?: Date) => {
    if (!doctorId) return;
    if (!isValidDoctorIdentifier(doctorId)) {
      setDoctorSlots(null);
      return;
    }
    
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

  // Fetch HC calculation when doctor or consultation type changes
  useEffect(() => {
    const fetchHCCalculation = async () => {
      if (!selectedDoctor || !showBookingModal) return;
      
      const fee = consultationType === "online" 
        ? selectedDoctor.consultationFee.online 
        : selectedDoctor.consultationFee.inPerson;
      
      setLoadingHC(true);
      try {
        const calculation = await walletService.canPayWithHC(fee);
        setHcCalculation(calculation);
        setWalletBalance(calculation.currentBalance);
      } catch (error) {
        console.error('Error fetching HC calculation:', error);
        setHcCalculation(null);
      } finally {
        setLoadingHC(false);
      }
    };

    fetchHCCalculation();
  }, [selectedDoctor, consultationType, showBookingModal]);

  const renderDoctorCard = (doctor: Doctor) => {
    const SpecIcon = getSpecializationIcon(doctor.specialization);
    const firstInitial = doctor.firstName?.[0] ?? "";
    const lastInitial = doctor.lastName?.[0] ?? "";

    return (
      <Card
        key={doctor._id}
        className="overflow-hidden border-0 shadow-lg hover:shadow-xl transition-all duration-300 bg-white dark:bg-gray-900 group"
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

              <div className="flex items-center gap-2 mb-4 text-sm text-gray-500 dark:text-gray-400">
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
                    disabled={!doctor.isLive}
                    className="bg-gradient-to-r from-teal-500 to-teal-600 hover:from-teal-600 hover:to-teal-700 text-white shadow-lg hover:shadow-xl transition-all rounded-full px-6"
                    title={doctor.isLive ? "" : "This profile is not yet available for booking."}
                  >
                    {doctor.isLive ? "Book Now" : "Unavailable"}
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

      // Extract start time from range if needed (e.g., "20:00 - 20:15" -> "20:00")
      const startTimeOnly = selectedTime.includes('-') 
        ? selectedTime.split('-')[0].trim() 
        : selectedTime;
      
      const normalizedTime = toBackendTime(startTimeOnly);
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

      if (!isValidDoctorIdentifier(doctorIdentifier)) {
        toast({
          title: "Booking unavailable",
          description: "This doctor profile is not linked to a live ID yet. Please choose another doctor.",
          variant: "destructive",
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

      // Convert doctor ID to number if possible, otherwise use public doctor ID (Dxxxxx)
      let doctorId: number | string;
      if (DOCTOR_ID_REGEX.test(doctorIdentifier)) {
        doctorId = parseInt(doctorIdentifier, 10);
      } else {
        doctorId = doctorIdentifier.toUpperCase();
      }
      
      const consultationFee = consultationType === "online" 
        ? selectedDoctor.consultationFee.online 
        : selectedDoctor.consultationFee.inPerson;

      const bookingData = {
        doctorId,
        appointmentDate: format(selectedDate, "yyyy-MM-dd"),
        appointmentTime: normalizedTime,
        type: consultationType === "online" ? "online" : "in-person",
        symptoms,
        notes: null
      };

      // First, create the appointment
      const response = await api.post("/mobile/appointments", bookingData);
      const appointmentId = response.data?.appointment?.id;

      // Invalidate appointments query to refresh the list
      queryClient.invalidateQueries({ queryKey: ["enhancedAppointments"] });

      // If paying with Health Coins, process HC payment
      if (paymentMethod === "hc" && appointmentId && hcCalculation?.canPay) {
        try {
          const hcPaymentResult = await walletService.payAppointmentWithHC(appointmentId);
          
          toast({
            title: "Success! Paid with Health Coins",
            description: `Appointment booked and paid ${hcPaymentResult.payment.hcPaid} HC. New balance: ${hcPaymentResult.payment.newBalance} HC`,
            action: {
              label: "View my bookings",
              onClick: () => navigate("/my-bookings"),
            },
          });

          setShowBookingModal(false);
          // Reset payment method
          setPaymentMethod("inr");
          return;
        } catch (hcError: any) {
          const errorData = hcError?.response?.data;
          const errorMessage =
            (Array.isArray(errorData?.errors)
              ? errorData.errors.map((err) => err?.message || err?.msg).filter(Boolean).join(", ")
              : null) ||
            (typeof errorData === "string" ? errorData : null) ||
            errorData?.message ||
            errorData?.error ||
            hcError?.message;

          console.error("HC payment failed:", {
            status: hcError?.response?.status,
            message: errorMessage,
            data: errorData
          });

          toast({
            title: "Booking created, HC payment failed",
            description: errorMessage || "Health Coins payment failed. You can pay later from My Bookings.",
            variant: "destructive"
          });
          setShowBookingModal(false);
          navigate("/my-bookings");
          return;
        }
      }
      
      
      // Success - show confirmation dialog
      setBookedAppointment({
        id: appointmentId,
        doctor: selectedDoctor,
        date: selectedDate,
        time: normalizedTime,
        type: consultationType,
        fee: consultationFee,
        paymentMethod,
      });
      setShowBookingModal(false);
      setShowConfirmation(true);
      
    } catch (error: any) {
      console.error("Error booking appointment:", error);

      const errorData = error?.response?.data;
      const errorMessage =
        errorData?.message ||
        errorData?.error?.message ||
        (typeof errorData?.error === "string" ? errorData.error : null) ||
        error?.message ||
        "Failed to book appointment";

      if (error?.response?.status === 409 && selectedDoctor && selectedDate) {
        setSelectedTime("");
        fetchDoctorSlots(selectedDoctor._id, selectedDate);
      }

      toast({
        title: "Booking Failed",
        description: error?.response?.status === 409
          ? `${errorMessage} Availability has been refreshed.`
          : errorMessage,
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
                    <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">No doctors found</h3>
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
                        className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-3xl shadow-lg p-6"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-4">
                          <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-2xl bg-gray-50 dark:bg-gray-800 flex items-center justify-center">
                              <Icon className={cn("h-5 w-5", category.color)} />
                            </div>
                            <div>
                              <p className="text-sm text-gray-500 dark:text-gray-400">Specialists</p>
                              <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{category.label}</h3>
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
                    <section className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-3xl shadow-lg p-6">
                      <div className="flex flex-wrap items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded-2xl bg-gray-50 dark:bg-gray-800 flex items-center justify-center">
                            <Zap className="h-5 w-5 text-blue-600" />
                          </div>
                          <div>
                            <p className="text-sm text-gray-500 dark:text-gray-400">Additional Specialists</p>
                            <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Other Categories</h3>
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
                    <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">No categories to show</h3>
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
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-white dark:bg-gray-900">
            <DialogHeader className="pb-4 border-b">
              <DialogTitle className="text-xl flex items-center gap-2">
                <Calendar className="h-5 w-5 text-blue-600" />
                Book Appointment with Dr. {selectedDoctor?.firstName} {selectedDoctor?.lastName}
              </DialogTitle>
              
              {/* Step Indicator */}
              <div className="flex items-center justify-center gap-2 mt-4">
                <div className={cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-all",
                  consultationType ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300" : "bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500"
                )}>
                  <div className={cn(
                    "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold",
                    consultationType ? "bg-blue-600 text-white" : "bg-gray-300 dark:bg-gray-700 text-gray-600 dark:text-gray-300"
                  )}>1</div>
                  <span>Type</span>
                </div>
                <div className="h-0.5 w-8 bg-gray-200"></div>
                <div className={cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-all",
                  selectedDate && selectedTime ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300" : "bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500"
                )}>
                  <div className={cn(
                    "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold",
                    selectedDate && selectedTime ? "bg-blue-600 text-white" : "bg-gray-300 dark:bg-gray-700 text-gray-600 dark:text-gray-300"
                  )}>2</div>
                  <span>Date & Time</span>
                </div>
                <div className="h-0.5 w-8 bg-gray-200"></div>
                <div className={cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-all",
                  symptoms ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300" : "bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500"
                )}>
                  <div className={cn(
                    "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold",
                    symptoms ? "bg-blue-600 text-white" : "bg-gray-300 dark:bg-gray-700 text-gray-600 dark:text-gray-300"
                  )}>3</div>
                  <span>Details</span>
                </div>
                <div className="h-0.5 w-8 bg-gray-200"></div>
                <div className={cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-all",
                  paymentMethod ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300" : "bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500"
                )}>
                  <div className={cn(
                    "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold",
                    paymentMethod ? "bg-blue-600 text-white" : "bg-gray-300 dark:bg-gray-700 text-gray-600 dark:text-gray-300"
                  )}>4</div>
                  <span>Payment</span>
                </div>
              </div>
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
                        <h4 className="font-bold text-gray-900 dark:text-gray-100">
                          Dr. {selectedDoctor.firstName} {selectedDoctor.lastName}
                        </h4>
                        <p className="text-gray-600 dark:text-gray-300">{selectedDoctor.specialization}</p>
                        <div className="flex items-center gap-4 mt-2">
                          <div className="flex items-center gap-1 bg-yellow-100 px-2 py-0.5 rounded-full">
                            <Star className="h-3.5 w-3.5 text-yellow-500 fill-yellow-500" />
                            <span className="text-sm font-medium">{selectedDoctor.rating}</span>
                          </div>
                          <div className="flex items-center gap-1 text-gray-600 dark:text-gray-300">
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
                  onValueChange={(value: "online" | "inPerson") => {
                    setConsultationType(value);
                    // Clear selected time when switching consultation type
                    setSelectedTime("");
                  }}
                >
                  <div className={cn(
                    "flex items-center space-x-3 p-4 border-2 rounded-xl cursor-pointer transition-all",
                    consultationType === "online" ? "border-blue-500 bg-blue-50 dark:bg-blue-900/30" : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
                  )}>
                    <RadioGroupItem value="online" id="online" />
                    <Label htmlFor="online" className="flex items-center gap-3 cursor-pointer flex-1">
                      <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
                        <Video className="h-5 w-5 text-blue-600" />
                      </div>
                      <div>
                        <div className="font-semibold text-gray-900 dark:text-gray-100">Online Consultation</div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">
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
                    consultationType === "inPerson" ? "border-green-500 bg-green-50 dark:bg-green-900/30" : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
                  )}>
                    <RadioGroupItem value="inPerson" id="inPerson" />
                    <Label htmlFor="inPerson" className="flex items-center gap-3 cursor-pointer flex-1">
                      <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
                        <User className="h-5 w-5 text-green-600" />
                      </div>
                      <div>
                        <div className="font-semibold text-gray-900 dark:text-gray-100">In-Person Visit</div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">
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
                        selectedDate && "border-blue-200 bg-blue-50 dark:bg-blue-900/30"
                      )}
                    >
                      <Calendar className="mr-3 h-5 w-5 text-blue-600" />
                      {selectedDate ? format(selectedDate, "EEEE, MMMM d, yyyy") : <span>Pick a date</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700" align="start">
                    <CalendarComponent
                      mode="single"
                      selected={selectedDate}
                      onSelect={(date) => {
                        setSelectedDate(date);
                        setSelectedTime(""); // Clear time when date changes
                      }}
                      disabled={isDateDisabled}
                      modifiers={{
                        hasSlots: (date) => {
                          const dateKey = format(date, 'yyyy-MM-dd');
                          return monthAvailability[dateKey] === true;
                        }
                      }}
                      modifiersClassNames={{
                        hasSlots: "bg-green-50 text-green-900 font-semibold relative after:content-[''] after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:w-1 after:h-1 after:bg-green-500 after:rounded-full"
                      }}
                      onMonthChange={(month) => {
                        if (selectedDoctor) {
                          loadMonthAvailability(selectedDoctor._id, month);
                        }
                      }}
                      initialFocus
                    />
                    <div className="p-3 border-t bg-gray-50 dark:bg-gray-800 text-xs text-gray-600 dark:text-gray-300 dark:border-gray-700">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                        <span>Dates with available slots</span>
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>

              {/* Time Selection */}
              <div className="space-y-3">
                <Label className="text-base font-semibold">Select Time</Label>
                
                {loadingSlots ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
                    <span className="ml-2 text-gray-600 dark:text-gray-300">Loading available slots...</span>
                  </div>
                ) : doctorSlots && !doctorSlots.isOff ? (
                  <div className="space-y-4">
                    {/* Online Slots */}
                    {consultationType === "online" && doctorSlots.slots?.online?.length > 0 ? (
                      <div>
                        <div className="flex items-center gap-2 mb-3">
                          <Video className="h-4 w-4 text-blue-600" />
                          <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">Online Consultation Slots</span>
                          <Badge variant="outline" className="text-xs">
                            {doctorSlots.slotDuration || 30} min slots
                          </Badge>
                        </div>
                        
                        {(() => {
                          const { morning, afternoon, evening } = groupSlotsByTimeOfDay(doctorSlots.slots.online);
                          
                          return (
                            <div className="space-y-4">
                              {/* Morning Slots */}
                              {morning.length > 0 && (
                                <div>
                                  <div className="flex items-center gap-2 mb-2">
                                    <div className="text-xs font-medium text-orange-700 dark:text-orange-300 bg-orange-50 dark:bg-orange-900/30 px-2 py-1 rounded">
                                      🌅 Morning (6 AM - 12 PM)
                                    </div>
                                  </div>
                                  <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                                    {morning.map((slot: any) => {
                                      const slotTime = slot.time;
                                      const isAvailable = slot.available && !slot.blocked;
                                      const isBooked = !slot.available;
                                      const isBlocked = slot.blocked;
                                      
                                      return (
                                        <Button
                                          key={slotTime}
                                          variant={selectedTime === slotTime ? "default" : "outline"}
                                          size="sm"
                                          onClick={() => isAvailable && setSelectedTime(slotTime)}
                                          disabled={!isAvailable}
                                          className={cn(
                                            "text-xs rounded-lg relative",
                                            selectedTime === slotTime && "bg-gradient-to-r from-blue-600 to-blue-500 border-0",
                                            isBooked && "bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 cursor-not-allowed border-gray-200 dark:border-gray-700",
                                            isBlocked && "bg-red-50 dark:bg-red-900/30 text-red-400 dark:text-red-400 cursor-not-allowed border-red-200 dark:border-red-800"
                                          )}
                                          title={isBooked ? "Already booked" : isBlocked ? "Blocked by doctor" : "Available"}
                                        >
                                          {slotTime}
                                          {isBooked && <span className="absolute -top-1 -right-1 h-2 w-2 bg-gray-400 rounded-full" />}
                                          {isBlocked && <span className="absolute -top-1 -right-1 h-2 w-2 bg-red-400 rounded-full" />}
                                        </Button>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                              
                              {/* Afternoon Slots */}
                              {afternoon.length > 0 && (
                                <div>
                                  <div className="flex items-center gap-2 mb-2">
                                    <div className="text-xs font-medium text-yellow-700 dark:text-yellow-300 bg-yellow-50 dark:bg-yellow-900/30 px-2 py-1 rounded">
                                      ☀️ Afternoon (12 PM - 5 PM)
                                    </div>
                                  </div>
                                  <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                                    {afternoon.map((slot: any) => {
                                      const slotTime = slot.time;
                                      const isAvailable = slot.available && !slot.blocked;
                                      const isBooked = !slot.available;
                                      const isBlocked = slot.blocked;
                                      
                                      return (
                                        <Button
                                          key={slotTime}
                                          variant={selectedTime === slotTime ? "default" : "outline"}
                                          size="sm"
                                          onClick={() => isAvailable && setSelectedTime(slotTime)}
                                          disabled={!isAvailable}
                                          className={cn(
                                            "text-xs rounded-lg relative",
                                            selectedTime === slotTime && "bg-gradient-to-r from-blue-600 to-blue-500 border-0",
                                            isBooked && "bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 cursor-not-allowed border-gray-200 dark:border-gray-700",
                                            isBlocked && "bg-red-50 dark:bg-red-900/30 text-red-400 dark:text-red-400 cursor-not-allowed border-red-200 dark:border-red-800"
                                          )}
                                          title={isBooked ? "Already booked" : isBlocked ? "Blocked by doctor" : "Available"}
                                        >
                                          {slotTime}
                                          {isBooked && <span className="absolute -top-1 -right-1 h-2 w-2 bg-gray-400 rounded-full" />}
                                          {isBlocked && <span className="absolute -top-1 -right-1 h-2 w-2 bg-red-400 rounded-full" />}
                                        </Button>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                              
                              {/* Evening Slots */}
                              {evening.length > 0 && (
                                <div>
                                  <div className="flex items-center gap-2 mb-2">
                                    <div className="text-xs font-medium text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-900/30 px-2 py-1 rounded">
                                      🌙 Evening (5 PM onwards)
                                    </div>
                                  </div>
                                  <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                                    {evening.map((slot: any) => {
                                      const slotTime = slot.time;
                                      const isAvailable = slot.available && !slot.blocked;
                                      const isBooked = !slot.available;
                                      const isBlocked = slot.blocked;
                                      
                                      return (
                                        <Button
                                          key={slotTime}
                                          variant={selectedTime === slotTime ? "default" : "outline"}
                                          size="sm"
                                          onClick={() => isAvailable && setSelectedTime(slotTime)}
                                          disabled={!isAvailable}
                                          className={cn(
                                            "text-xs rounded-lg relative",
                                            selectedTime === slotTime && "bg-gradient-to-r from-blue-600 to-blue-500 border-0",
                                            isBooked && "bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 cursor-not-allowed border-gray-200 dark:border-gray-700",
                                            isBlocked && "bg-red-50 dark:bg-red-900/30 text-red-400 dark:text-red-400 cursor-not-allowed border-red-200 dark:border-red-800"
                                          )}
                                          title={isBooked ? "Already booked" : isBlocked ? "Blocked by doctor" : "Available"}
                                        >
                                          {slotTime}
                                          {isBooked && <span className="absolute -top-1 -right-1 h-2 w-2 bg-gray-400 rounded-full" />}
                                          {isBlocked && <span className="absolute -top-1 -right-1 h-2 w-2 bg-red-400 rounded-full" />}
                                        </Button>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })()}
                        
                        {doctorSlots.slots.online.filter((s: any) => s.available && !s.blocked).length === 0 && (
                          <p className="text-sm text-amber-700 dark:text-amber-300 py-4 text-center bg-amber-50 dark:bg-amber-900/30 rounded-lg border border-amber-200 dark:border-amber-800">⚠️ All online slots are booked or unavailable for this date. Please try another date.</p>
                        )}
                      </div>
                    ) : null}

                    {/* In-Person Slots */}
                    {consultationType === "inPerson" && doctorSlots.slots?.inPerson?.length > 0 ? (
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <User className="h-4 w-4 text-green-600" />
                          <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">In-Person Consultation Slots</span>
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
                                <p className="font-semibold text-gray-900 dark:text-gray-100 text-sm">{doctorSlots.slots.inPerson[0].location.name}</p>
                                <p className="text-xs text-gray-600 dark:text-gray-300">{doctorSlots.slots.inPerson[0].location.address}</p>
                                <p className="text-xs font-semibold text-green-700 mt-1">
                                  Consultation Fee: ₹{doctorSlots.slots.inPerson[0].location.fee}
                                </p>
                              </div>
                            </div>
                          </div>
                        )}
                        
                        {(() => {
                          const { morning, afternoon, evening } = groupSlotsByTimeOfDay(doctorSlots.slots.inPerson);
                          
                          return (
                            <div className="space-y-4">
                              {/* Morning Slots */}
                              {morning.length > 0 && (
                                <div>
                                  <div className="flex items-center gap-2 mb-2">
                                    <div className="text-xs font-medium text-orange-700 dark:text-orange-300 bg-orange-50 dark:bg-orange-900/30 px-2 py-1 rounded">
                                      🌅 Morning (6 AM - 12 PM)
                                    </div>
                                  </div>
                                  <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                                    {morning.map((slot: any) => {
                                      const slotTime = slot.time;
                                      const isAvailable = slot.available && !slot.blocked;
                                      const isBooked = !slot.available;
                                      const isBlocked = slot.blocked;
                                      
                                      return (
                                        <Button
                                          key={slotTime}
                                          variant={selectedTime === slotTime ? "default" : "outline"}
                                          size="sm"
                                          onClick={() => isAvailable && setSelectedTime(slotTime)}
                                          disabled={!isAvailable}
                                          className={cn(
                                            "text-xs rounded-lg relative",
                                            selectedTime === slotTime && "bg-gradient-to-r from-green-600 to-green-500 border-0",
                                            isBooked && "bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 cursor-not-allowed border-gray-200 dark:border-gray-700",
                                            isBlocked && "bg-red-50 dark:bg-red-900/30 text-red-400 dark:text-red-400 cursor-not-allowed border-red-200 dark:border-red-800"
                                          )}
                                          title={isBooked ? "Already booked" : isBlocked ? "Blocked by doctor" : "Available"}
                                        >
                                          {slotTime}
                                          {isBooked && <span className="absolute -top-1 -right-1 h-2 w-2 bg-gray-400 rounded-full" />}
                                          {isBlocked && <span className="absolute -top-1 -right-1 h-2 w-2 bg-red-400 rounded-full" />}
                                        </Button>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                              
                              {/* Afternoon Slots */}
                              {afternoon.length > 0 && (
                                <div>
                                  <div className="flex items-center gap-2 mb-2">
                                    <div className="text-xs font-medium text-yellow-700 dark:text-yellow-300 bg-yellow-50 dark:bg-yellow-900/30 px-2 py-1 rounded">
                                      ☀️ Afternoon (12 PM - 5 PM)
                                    </div>
                                  </div>
                                  <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                                    {afternoon.map((slot: any) => {
                                      const slotTime = slot.time;
                                      const isAvailable = slot.available && !slot.blocked;
                                      const isBooked = !slot.available;
                                      const isBlocked = slot.blocked;
                                      
                                      return (
                                        <Button
                                          key={slotTime}
                                          variant={selectedTime === slotTime ? "default" : "outline"}
                                          size="sm"
                                          onClick={() => isAvailable && setSelectedTime(slotTime)}
                                          disabled={!isAvailable}
                                          className={cn(
                                            "text-xs rounded-lg relative",
                                            selectedTime === slotTime && "bg-gradient-to-r from-green-600 to-green-500 border-0",
                                            isBooked && "bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 cursor-not-allowed border-gray-200 dark:border-gray-700",
                                            isBlocked && "bg-red-50 dark:bg-red-900/30 text-red-400 dark:text-red-400 cursor-not-allowed border-red-200 dark:border-red-800"
                                          )}
                                          title={isBooked ? "Already booked" : isBlocked ? "Blocked by doctor" : "Available"}
                                        >
                                          {slotTime}
                                          {isBooked && <span className="absolute -top-1 -right-1 h-2 w-2 bg-gray-400 rounded-full" />}
                                          {isBlocked && <span className="absolute -top-1 -right-1 h-2 w-2 bg-red-400 rounded-full" />}
                                        </Button>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                              
                              {/* Evening Slots */}
                              {evening.length > 0 && (
                                <div>
                                  <div className="flex items-center gap-2 mb-2">
                                    <div className="text-xs font-medium text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-900/30 px-2 py-1 rounded">
                                      🌙 Evening (5 PM onwards)
                                    </div>
                                  </div>
                                  <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                                    {evening.map((slot: any) => {
                                      const slotTime = slot.time;
                                      const isAvailable = slot.available && !slot.blocked;
                                      const isBooked = !slot.available;
                                      const isBlocked = slot.blocked;
                                      
                                      return (
                                        <Button
                                          key={slotTime}
                                          variant={selectedTime === slotTime ? "default" : "outline"}
                                          size="sm"
                                          onClick={() => isAvailable && setSelectedTime(slotTime)}
                                          disabled={!isAvailable}
                                          className={cn(
                                            "text-xs rounded-lg relative",
                                            selectedTime === slotTime && "bg-gradient-to-r from-green-600 to-green-500 border-0",
                                            isBooked && "bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 cursor-not-allowed border-gray-200 dark:border-gray-700",
                                            isBlocked && "bg-red-50 dark:bg-red-900/30 text-red-400 dark:text-red-400 cursor-not-allowed border-red-200 dark:border-red-800"
                                          )}
                                          title={isBooked ? "Already booked" : isBlocked ? "Blocked by doctor" : "Available"}
                                        >
                                          {slotTime}
                                          {isBooked && <span className="absolute -top-1 -right-1 h-2 w-2 bg-gray-400 rounded-full" />}
                                          {isBlocked && <span className="absolute -top-1 -right-1 h-2 w-2 bg-red-400 rounded-full" />}
                                        </Button>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })()}
                        
                        {doctorSlots.slots.inPerson.filter((s: any) => s.available && !s.blocked).length === 0 && (
                          <p className="text-sm text-amber-700 dark:text-amber-300 py-4 text-center bg-amber-50 dark:bg-amber-900/30 rounded-lg border border-amber-200 dark:border-amber-800">⚠️ All in-person slots are booked or unavailable for this date. Please try another date.</p>
                        )}
                      </div>
                    ) : null}

                    {/* No slots available for selected type */}
                    {consultationType === "online" && (!doctorSlots.slots?.online || doctorSlots.slots.online.length === 0) && (
                      <p className="text-sm text-gray-500 dark:text-gray-400 py-4 text-center">Doctor does not have online consultation slots configured for this day</p>
                    )}
                    {consultationType === "inPerson" && (!doctorSlots.slots?.inPerson || doctorSlots.slots.inPerson.length === 0) && (
                      <p className="text-sm text-gray-500 dark:text-gray-400 py-4 text-center">Doctor does not have in-person consultation slots configured for this day</p>
                    )}
                  </div>
                ) : doctorSlots && doctorSlots.isOff ? (
                  <div className="py-8 text-center">
                    <Calendar className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                    <p className="text-gray-600 dark:text-gray-300 font-medium">Doctor is not available on this day</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Please select a different date</p>
                  </div>
                ) : selectedDate ? (
                  <div className="py-8 text-center">
                    <Clock className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                    <p className="text-gray-600 dark:text-gray-300 font-medium">Unable to load slot availability</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Please try selecting a different date or refresh the page</p>
                  </div>
                ) : null}
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
              <Card className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900 border-0">
                <CardContent className="p-5">
                  <h4 className="font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
                    <CheckCircle className="h-5 w-5 text-green-600" />
                    Booking Summary
                  </h4>
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600 dark:text-gray-300">Consultation Type</span>
                      <span className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-1.5">
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
                      <span className="text-gray-600 dark:text-gray-300">Date & Time</span>
                      <span className="font-semibold text-gray-900 dark:text-gray-100">
                        {selectedDate && selectedTime 
                          ? `${format(selectedDate, "MMM dd")} at ${toDisplayTime(selectedTime)}`
                          : "Not selected"
                        }
                      </span>
                    </div>
                    <Separator className="my-3" />
                    <div className="flex justify-between items-center text-lg">
                      <span className="font-semibold text-gray-900 dark:text-gray-100">Total Fee</span>
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

              {/* Payment Method Selection */}
              <div className="space-y-3">
                <Label className="text-base font-semibold flex items-center gap-2">
                  <Wallet className="h-5 w-5 text-purple-600" />
                  Payment Method
                </Label>
                <RadioGroup 
                  value={paymentMethod} 
                  onValueChange={(value: "inr" | "hc") => setPaymentMethod(value)}
                >
                  {/* INR Payment Option */}
                  <div className={cn(
                    "flex items-center space-x-3 p-4 border-2 rounded-xl cursor-pointer transition-all",
                    paymentMethod === "inr" ? "border-green-500 bg-green-50 dark:bg-green-900/30" : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
                  )}>
                    <RadioGroupItem value="inr" id="pay-inr" />
                    <Label htmlFor="pay-inr" className="flex items-center gap-3 cursor-pointer flex-1">
                      <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
                        <DollarSign className="h-5 w-5 text-green-600" />
                      </div>
                      <div className="flex-1">
                        <div className="font-semibold text-gray-900 dark:text-gray-100">Pay with INR</div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">
                          Pay via UPI, Card, or Net Banking
                        </div>
                      </div>
                      <div className="text-lg font-bold text-green-600">
                        ₹{(() => {
                          if (!selectedDoctor) return 0;
                          if (consultationType === "online") {
                            return selectedDoctor.consultationFee.online;
                          } else {
                            const locationFee = doctorSlots?.slots?.inPerson?.[0]?.location?.fee;
                            return locationFee || selectedDoctor.consultationFee.inPerson;
                          }
                        })()}
                      </div>
                    </Label>
                  </div>
                  
                  {/* Health Coins Payment Option */}
                  <div className={cn(
                    "flex items-center space-x-3 p-4 border-2 rounded-xl cursor-pointer transition-all",
                    paymentMethod === "hc" ? "border-purple-500 bg-purple-50 dark:bg-purple-900/30" : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600",
                    hcCalculation && !hcCalculation.canPay && "opacity-60"
                  )}>
                    <RadioGroupItem 
                      value="hc" 
                      id="pay-hc" 
                      disabled={!hcCalculation?.canPay}
                    />
                    <Label htmlFor="pay-hc" className="flex items-center gap-3 cursor-pointer flex-1">
                      <div className="w-10 h-10 bg-purple-100 dark:bg-purple-900/30 rounded-full flex items-center justify-center">
                        <Coins className="h-5 w-5 text-purple-600" />
                      </div>
                      <div className="flex-1">
                        <div className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                          Pay with Health Coins
                          {hcCalculation?.bonusPercent > 0 && (
                            <Badge className="bg-purple-100 text-purple-700 text-xs">
                              {hcCalculation.bonusPercent}% bonus value
                            </Badge>
                          )}
                        </div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">
                          {loadingHC ? (
                            <span className="flex items-center gap-1">
                              <Loader2 className="h-3 w-3 animate-spin" />
                              Checking balance...
                            </span>
                          ) : hcCalculation ? (
                            <>
                              Balance: <span className="font-semibold text-purple-600">{walletBalance} HC</span>
                              {!hcCalculation.canPay && (
                                <span className="text-red-500 ml-2">
                                  (Need {hcCalculation.shortfall} more HC)
                                </span>
                              )}
                            </>
                          ) : (
                            "Use your earned Health Coins"
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-bold text-purple-600">
                          {hcCalculation ? `${hcCalculation.hcRequired} HC` : "..."}
                        </div>
                        {hcCalculation && hcCalculation.savings > 0 && (
                          <div className="text-xs text-green-600">
                            Save ₹{hcCalculation.savings}
                          </div>
                        )}
                      </div>
                    </Label>
                  </div>
                </RadioGroup>
                
                {/* Low balance warning */}
                {hcCalculation && !hcCalculation.canPay && paymentMethod === "hc" && (
                  <div className="p-3 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-lg text-sm text-amber-800 dark:text-amber-300">
                    <p className="font-medium">Insufficient Health Coins</p>
                    <p>You need {hcCalculation.hcRequired} HC but have {walletBalance} HC. 
                      <Button variant="link" className="h-auto p-0 ml-1 text-amber-700 underline" onClick={() => navigate("/wallet")}>
                        Buy more HC
                      </Button>
                    </p>
                  </div>
                )}
              </div>

              {/* Inline Validation Messages */}
              {!selectedDate && (
                <div className="p-3 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg text-sm text-blue-800 dark:text-blue-300 flex items-start gap-2">
                  <Calendar className="h-4 w-4 mt-0.5" />
                  <p>Please select a date for your appointment</p>
                </div>
              )}
              
              {selectedDate && !selectedTime && !loadingSlots && (
                <div className="p-3 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg text-sm text-blue-800 dark:text-blue-300 flex items-start gap-2">
                  <Clock className="h-4 w-4 mt-0.5" />
                  <p>Please select a time slot for your appointment</p>
                </div>
              )}

              {/* Slot Status Legend */}
              {selectedDate && doctorSlots && !loadingSlots && (
                <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                  <p className="text-xs font-semibold text-gray-700 dark:text-gray-200 mb-2">Slot Status:</p>
                  <div className="flex flex-wrap gap-3 text-xs">
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-3 border-2 border-blue-500 rounded"></div>
                      <span className="text-gray-600 dark:text-gray-300">Available</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-3 bg-gray-200 dark:bg-gray-700 rounded relative">
                        <span className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 bg-gray-400 rounded-full" />
                      </div>
                      <span className="text-gray-600 dark:text-gray-300">Booked</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-3 bg-red-50 dark:bg-red-900/30 rounded relative">
                        <span className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 bg-red-400 rounded-full" />
                      </div>
                      <span className="text-gray-600 dark:text-gray-300">Blocked</span>
                    </div>
                  </div>
                </div>
              )}

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
                  disabled={isSubmitting || !selectedDate || !selectedTime || (paymentMethod === "hc" && !hcCalculation?.canPay)}
                  className="flex-1 h-12 rounded-xl bg-gradient-to-r from-blue-600 to-green-600 hover:from-blue-700 hover:to-green-700 text-white"
                >
                  {isSubmitting ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Booking...
                    </span>
                  ) : paymentMethod === "hc" ? (
                    `Pay ${hcCalculation?.hcRequired || 0} HC & Book`
                  ) : (
                    "Confirm Booking"
                  )}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Booking Confirmation Dialog */}
        <Dialog open={showConfirmation} onOpenChange={setShowConfirmation}>
          <DialogContent className="max-w-md bg-white dark:bg-gray-900">
            <DialogHeader>
              <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
                <CheckCircle className="h-8 w-8 text-green-600" />
              </div>
              <DialogTitle className="text-2xl text-center">Booking Confirmed!</DialogTitle>
              <DialogDescription className="text-center">
                Your appointment has been successfully booked
              </DialogDescription>
            </DialogHeader>
            
            {bookedAppointment && (
              <div className="space-y-4">
                {/* Doctor Info */}
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-3 mb-4">
                      <Avatar className="h-12 w-12">
                        <AvatarImage src={bookedAppointment.doctor?.profileImage} />
                        <AvatarFallback>
                          {bookedAppointment.doctor?.firstName?.[0]}{bookedAppointment.doctor?.lastName?.[0]}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <h4 className="font-bold text-gray-900 dark:text-gray-100">
                          Dr. {bookedAppointment.doctor?.firstName} {bookedAppointment.doctor?.lastName}
                        </h4>
                        <p className="text-sm text-gray-600 dark:text-gray-300">{bookedAppointment.doctor?.specialization}</p>
                      </div>
                    </div>
                    
                    <Separator className="my-4" />
                    
                    {/* Appointment Details */}
                    <div className="space-y-3 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600 dark:text-gray-300">Date & Time:</span>
                        <span className="font-semibold text-gray-900 dark:text-gray-100">
                          {format(bookedAppointment.date, "MMM d, yyyy")} at {toDisplayTime(bookedAppointment.time)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600 dark:text-gray-300">Type:</span>
                        <Badge variant={bookedAppointment.type === "online" ? "default" : "secondary"}>
                          {bookedAppointment.type === "online" ? "Online Video" : "In-Person"}
                        </Badge>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600 dark:text-gray-300">Consultation Fee:</span>
                        <span className="font-semibold text-gray-900 dark:text-gray-100">₹{bookedAppointment.fee}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600 dark:text-gray-300">Payment:</span>
                        <Badge variant={bookedAppointment.paymentMethod === "hc" ? "secondary" : "outline"}>
                          {bookedAppointment.paymentMethod === "hc" ? "Health Coins" : "INR"}
                        </Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                
                {/* Action Buttons */}
                <div className="flex gap-3">
                  <Button 
                    variant="outline" 
                    onClick={() => setShowConfirmation(false)}
                    className="flex-1"
                  >
                    Book Another
                  </Button>
                  <Button 
                    onClick={() => {
                      setShowConfirmation(false);
                      navigate("/my-bookings");
                    }}
                    className="flex-1 bg-gradient-to-r from-blue-600 to-green-600 hover:from-blue-700 hover:to-green-700"
                  >
                    View My Bookings
                  </Button>
                </div>
                
                <p className="text-xs text-center text-gray-500 dark:text-gray-400">
                  A confirmation has been sent to your registered email
                </p>
              </div>
            )}
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
