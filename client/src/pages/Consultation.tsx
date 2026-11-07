import { useState, useEffect } from "react";
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
  MessageCircle,
  X,
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
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import api from "@/utils/api";
import MainLayout from "@/components/layout/MainLayout";

interface ServiceTier {
  name: "Basic" | "Standard" | "Premium";
  price: number;
  duration: number;
  description: string;
  features: string[];
  deliveryTime: string;
  revisions: number;
}

interface Doctor {
  _id: string;
  firstName: string;
  lastName: string;
  profileImage: string;
  isLive?: boolean;
  specialization: string;
  experience: number;
  serviceTiers: ServiceTier[];
  availability: {
    status: "Available" | "Busy" | "Away";
    nextAvailableSlot: string;
    responseTime: string;
    workingHours: {
      day: string;
      startTime: string;
      endTime: string;
      isAvailable: boolean;
    }[];
    instantBooking: boolean;
  };
  clinicAddress: {
    city: string;
    state: string;
  };
  isVerified: boolean;
  expertise: string[];
  languages: string[];
  about: string;
  successRate: number;
  totalConsultations: number;
  completionRate: number;
  responseRate: number;
  reviews: {
    userId: {
      firstName: string;
      lastName: string;
    };
    rating: number;
    review: string;
    date: string;
    serviceTier: string;
  }[];
}

export const specializations = [
  "General Physician",
  "Cardiologist",
  "Dermatologist",
  "Pediatrician",
  "Orthopedic",
  "Neurologist",
  "Psychiatrist",
  "Gynecologist",
  "ENT Specialist",
  "Ophthalmologist",
  "Dentist",
  "Urologist",
  "Endocrinologist",
  "Pulmonologist",
  "Oncologist",
];

const WEEK_DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

const DEFAULT_WORKING_HOURS = WEEK_DAYS.map((day) => ({
  day,
  startTime: "09:00",
  endTime: "17:00",
  isAvailable: ["Saturday", "Sunday"].includes(day) ? false : true,
}));

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

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

const parseClinicAddress = (clinicAddress: any) => {
  if (!clinicAddress) {
    return {
      city: "Multi-city",
      state: "India",
    };
  }

  if (typeof clinicAddress === "object") {
    return {
      city: clinicAddress.city || "Multi-city",
      state: clinicAddress.state || "India",
    };
  }

  if (typeof clinicAddress === "string") {
    const parts = clinicAddress
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    return {
      city: parts.at(-2) || parts.at(-1) || "Multi-city",
      state: parts.at(-1) || "India",
    };
  }

  return {
    city: "Multi-city",
    state: "India",
  };
};

const normalizeWorkingHours = (weeklySchedule: any) => {
  if (!weeklySchedule || typeof weeklySchedule !== "object") {
    return DEFAULT_WORKING_HOURS;
  }

  return WEEK_DAYS.map((day) => {
    const scheduleForDay =
      weeklySchedule[day] ||
      weeklySchedule[day.toLowerCase()] ||
      weeklySchedule[day.slice(0, 3).toLowerCase()];

    if (!scheduleForDay || scheduleForDay.isOff) {
      return {
        day,
        startTime: "-",
        endTime: "-",
        isAvailable: false,
      };
    }

    const window = scheduleForDay.online?.enabled
      ? scheduleForDay.online
      : scheduleForDay.inPerson;

    return {
      day,
      startTime: window?.startTime || "09:00",
      endTime: window?.endTime || "17:00",
      isAvailable: Boolean(window?.enabled ?? true),
    };
  });
};

const buildServiceTiers = (doctor: any): ServiceTier[] => {
  const basePrice = Math.max(
    toNumber(
      doctor?.onlineConsultationFee ?? doctor?.consultationFee ?? doctor?.consultationFees,
      800
    ),
    300
  );

  const standardPrice = Math.max(
    toNumber(doctor?.inPersonConsultationFee, basePrice * 1.3),
    basePrice + 400
  );

  const premiumPrice = Math.max(standardPrice + 600, Math.round(basePrice * 1.8));

  return [
    {
      name: "Basic",
      price: Math.round(basePrice),
      duration: 20,
      description: "Quick video consultation with digital prescription",
      features: [
        "20-minute video consultation",
        "Digital prescription",
        "Basic health assessment",
        "24-hour follow-up via chat",
      ],
      deliveryTime: "Within 24 hrs",
      revisions: 1,
    },
    {
      name: "Standard",
      price: Math.round(standardPrice),
      duration: 30,
      description: "Comprehensive assessment with follow-up call",
      features: [
        "30-minute consultation",
        "Detailed care plan",
        "Diet & lifestyle guidance",
        "Priority follow-up",
      ],
      deliveryTime: "Same day",
      revisions: 2,
    },
    {
      name: "Premium",
      price: Math.round(premiumPrice),
      duration: 45,
      description: "Extended consultation with concierge support",
      features: [
        "45-minute consultation",
        "Dedicated care manager",
        "2 follow-up sessions",
        "Personalized care plan",
      ],
      deliveryTime: "Priority",
      revisions: 3,
    },
  ];
};

const normalizeDoctorFromApi = (doctor: any): Doctor => {
  const firstName = doctor?.firstName || doctor?.name?.split?.(" ")?.[0] || "Doctor";
  const lastName = doctor?.lastName || doctor?.name?.split?.(" ")?.slice(1).join(" ") || "";
  const specialization = doctor?.specialization || "General Medicine";
  const experience = toNumber(doctor?.experience, 5);
  const clinicAddress = parseClinicAddress(doctor?.clinicAddress);
  const languages = toArray(doctor?.languages, ["English"]);
  const expertise = toArray(doctor?.expertise || doctor?.services, [specialization]);
  const about =
    doctor?.about ||
    `Dr. ${firstName} ${lastName}`.trim() +
      " provides trusted online consultations through the Mediczy network.";

  const successRate = clamp(toNumber(doctor?.successRate, 95), 85, 99);
  const totalConsultations = toNumber(
    doctor?.totalConsultations,
    300 + experience * 60
  );
  const completionRate = clamp(toNumber(doctor?.completionRate, successRate - 1), 80, 99);
  const responseRate = clamp(toNumber(doctor?.responseRate, 96), 80, 99);

  return {
    _id: String(doctor?._id ?? doctor?.id ?? `temp-${Math.random().toString(36).slice(2)}`),
    isLive: true,
    firstName,
    lastName,
    profileImage: doctor?.profileImage || "",
    specialization,
    experience,
    serviceTiers: buildServiceTiers(doctor),
    availability: {
      status: doctor?.isOnline ? "Available" : doctor?.isAvailable ? "Busy" : "Away",
      nextAvailableSlot:
        doctor?.nextAvailableSlot || (doctor?.isOnline ? "Available now" : "Slots update hourly"),
      responseTime: doctor?.responseTime || "Usually responds within 15 minutes",
      workingHours: normalizeWorkingHours(doctor?.weeklySchedule),
      instantBooking: Boolean(doctor?.isOnline),
    },
    clinicAddress,
    isVerified: Boolean(doctor?.isVerified),
    expertise,
    languages,
    about,
    successRate,
    totalConsultations,
    completionRate,
    responseRate,
    reviews: Array.isArray(doctor?.reviews) ? doctor.reviews : [],
  };
};

// Inline placeholder shown when a doctor has no photo or the image URL is broken, so the
// circle never collapses to the doctor's name as alt text.
const DOCTOR_AVATAR_FALLBACK = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Ccircle cx='12' cy='12' r='12' fill='%23e2e8f0'/%3E%3Cpath d='M12 12a4 4 0 100-8 4 4 0 000 8zm0 2c-4 0-7 2-7 5v1h14v-1c0-3-3-5-7-5z' fill='%2394a3b8'/%3E%3C/svg%3E";

const Consultation = () => {
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedSpecialization, setSelectedSpecialization] = useState("all");
  const [sortBy, setSortBy] = useState("experience");
  const [selectedDoctor, setSelectedDoctor] = useState<string | null>(null);
  const [selectedTierByDoctor, setSelectedTierByDoctor] = useState<Record<string, string>>({});
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    fetchDoctors();
  }, []);

  const fetchDoctorsFromApi = async (path: string, params?: Record<string, any>) => {
    const response = await api.get(path, params ? { params } : undefined);
    const apiDoctors = Array.isArray(response.data?.data)
      ? response.data.data
      : Array.isArray(response.data?.doctors)
      ? response.data.doctors
      : [];

    return apiDoctors
      .map(normalizeDoctorFromApi)
      .filter((doctor): doctor is Doctor => Boolean(doctor));
  };

  const fetchDoctors = async () => {
    try {
      setLoading(true);
      const availableDoctors = await fetchDoctorsFromApi("/doctors/available");

      if (availableDoctors.length) {
        setDoctors(availableDoctors);
        return;
      }

      const fallbackDoctors = await fetchDoctorsFromApi("/doctors", { limit: 100 });
      if (fallbackDoctors.length) {
        setDoctors(fallbackDoctors);
        toast({
          title: "Loaded live doctors",
          description: "Showing verified doctor profiles from the database.",
        });
        return;
      }

      setDoctors([]);
      toast({
        title: "No doctors available",
        description: "The live doctor directory returned no profiles. Please try again later.",
      });
    } catch (error) {
      console.error("Error fetching doctors:", error);
      setDoctors([]);
      toast({
        title: "Info",
        description: "The live doctor directory could not be loaded. Please retry.",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    fetchDoctors();
  };

  const handleBookAppointment = (doctor: Doctor, tierName?: string) => {
    if (!doctor.isLive) {
      toast({
        title: "Still loading doctors",
        description: "Please pick a doctor from the live database list once it finishes loading.",
        variant: "destructive",
      });
      return;
    }

    const doctorId = doctor?._id ?? (doctor as any)?.id;
    if (!doctorId || doctorId === "undefined" || doctorId === "null") {
      toast({
        title: "Unable to book appointment",
        description: "Doctor profile is missing an ID. Please refresh and try again.",
        variant: "destructive",
      });
      return;
    }

    const tierParam = tierName ? `?tier=${encodeURIComponent(tierName)}` : '';
    navigate(`/consultation/${doctorId}${tierParam}`, {
      state: { doctor }
    });
  };

  const handleInstantChat = (doctor: Doctor) => {
    if (!doctor.isLive) {
      toast({
        title: "Chat unavailable for demo doctor",
        description: "Please choose a doctor loaded from the live directory.",
        variant: "destructive",
      });
      return;
    }

    const doctorId = doctor?._id ?? (doctor as any)?.id;
    if (!doctorId || doctorId === "undefined" || doctorId === "null") {
      toast({
        title: "Unable to start chat",
        description: "Doctor profile is missing an ID. Please refresh and try again.",
        variant: "destructive",
      });
      return;
    }

    navigate(`/chat?doctorId=${encodeURIComponent(String(doctorId))}&instant=true`);
  };

  const handleDoctorClick = (doctorId: string) => {
    setSelectedDoctor(selectedDoctor === doctorId ? null : doctorId);
  };

  const handleTierSelection = (doctorId: string, tierName: string) => {
    setSelectedTierByDoctor((prev) => ({ ...prev, [doctorId]: tierName }));
  };

  const handleCloseDetails = () => {
    setSelectedDoctor(null);
  };

  const filteredDoctors = Array.isArray(doctors)
    ? [...doctors]
        .filter((doctor) => {
          const searchString = searchTerm.toLowerCase();
          if (!searchString) return true;
          return (
            doctor.firstName.toLowerCase().includes(searchString) ||
            doctor.lastName.toLowerCase().includes(searchString) ||
            doctor.specialization.toLowerCase().includes(searchString) ||
            doctor.expertise.some((exp) => exp.toLowerCase().includes(searchString))
          );
        })
        .filter((doctor) =>
          selectedSpecialization === "all"
            ? true
            : doctor.specialization.toLowerCase() === selectedSpecialization.toLowerCase()
        )
        .sort((a, b) => {
          switch (sortBy) {
            case "experience":
              return b.experience - a.experience;
            case "fees": {
              const priceA = a.serviceTiers[0]?.price ?? 0;
              const priceB = b.serviceTiers[0]?.price ?? 0;
              return priceA - priceB;
            }
            case "response":
              return (b.responseRate ?? 0) - (a.responseRate ?? 0);
            default:
              return 0;
          }
        })
    : [];

  return (
    // <MainLayout>
      <div className="container mx-auto px-4 py-8 max-w-7xl bg-slate-50 dark:bg-slate-900 min-h-screen">
        {/* Header Section */}
        <div className="flex flex-col gap-6 mb-8 lg:flex-row lg:items-center lg:justify-between">
          <div className="w-full lg:w-auto">
            <h1 className="text-3xl font-bold text-slate-800 dark:text-white">Find and Consult Top Doctors</h1>
            <p className="text-slate-600 dark:text-slate-400 mt-2">Connect with the best healthcare professionals</p>
          </div>
          <div className="flex w-full flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Button variant="outline" className="flex h-10 w-full items-center gap-2 sm:w-auto border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-teal-50 dark:hover:bg-teal-900/20 hover:border-teal-500">
              <Filter className="h-4 w-4" />
              Advanced Filters
            </Button>
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="h-10 w-full sm:w-48 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200">
                <SelectValue placeholder="Sort By" />
              </SelectTrigger>
              <SelectContent className="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700">
                <SelectItem value="experience" className="text-slate-700 dark:text-slate-200 focus:bg-teal-50 dark:focus:bg-teal-900/30">Most Experienced</SelectItem>
                <SelectItem value="fees" className="text-slate-700 dark:text-slate-200 focus:bg-teal-50 dark:focus:bg-teal-900/30">Lowest Price</SelectItem>
                <SelectItem value="response" className="text-slate-700 dark:text-slate-200 focus:bg-teal-50 dark:focus:bg-teal-900/30">Fastest Response</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

      {/* Search and Filter Section */}
        <div className="bg-white dark:bg-slate-800/50 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 mb-8">
          <div className="flex flex-col gap-4 md:flex-row">
        <div className="flex-1">
          <div className="relative">
            <Input
                  placeholder="Search by doctor name, specialization, or expertise..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 h-12 text-base bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-teal-500 focus:ring-teal-500"
            />
                <Search className="absolute left-3 top-4 h-4 w-4 text-slate-400 dark:text-slate-500" />
          </div>
        </div>
        <Select
          value={selectedSpecialization}
          onValueChange={setSelectedSpecialization}
        >
              <SelectTrigger className="h-12 w-full md:w-64 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200">
                <SelectValue placeholder="Select Specialization" />
          </SelectTrigger>
          <SelectContent className="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700">
            <SelectItem value="all" className="text-slate-700 dark:text-slate-200 focus:bg-teal-50 dark:focus:bg-teal-900/30">All Specializations</SelectItem>
            {specializations.map((spec) => (
              <SelectItem key={spec} value={spec} className="text-slate-700 dark:text-slate-200 focus:bg-teal-50 dark:focus:bg-teal-900/30">
                {spec}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
          </div>
      </div>

      {/* Doctors List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading ? (
            <div className="col-span-full text-center py-8">
              <p className="text-slate-600 dark:text-slate-400">Loading doctors...</p>
            </div>
        ) : filteredDoctors.length === 0 ? (
            <div className="col-span-full text-center py-8">
              <p className="text-slate-600 dark:text-slate-400">No doctors found matching your criteria.</p>
            </div>
        ) : (
          filteredDoctors.map((doctor) => (
              <div key={doctor._id} className="relative">
                {selectedDoctor === doctor._id ? (
                  // Simplified Detailed View
                  <div className="fixed inset-0 bg-slate-900/80 dark:bg-slate-950/90 backdrop-blur-sm z-50 overflow-y-auto">
                    <div className="container mx-auto px-4 py-8 max-w-3xl">
                      <Card className="relative mt-8 bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="absolute right-3 top-3 sm:right-4 sm:top-4 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-700 dark:hover:text-white"
                          onClick={handleCloseDetails}
                          aria-label="Close doctor details"
                        >
                          <X className="h-6 w-6" />
                        </Button>
                        <div className="p-6 pt-12 sm:pt-6">
                          {/* Doctor Header */}
                          <div className="flex items-start gap-6 mb-6">
                            <div className="relative">
                <img
                  src={doctor.profileImage || DOCTOR_AVATAR_FALLBACK} onError={(e) => { const t = e.currentTarget as HTMLImageElement; t.onerror = null; t.src = DOCTOR_AVATAR_FALLBACK; }}
                  alt={`${doctor.firstName} ${doctor.lastName}`}
                                className="w-24 h-24 rounded-full object-cover border-4 border-white dark:border-slate-700 shadow-md"
                              />
                              <div className={`absolute -bottom-1 -right-1 w-6 h-6 rounded-full border-4 border-white dark:border-slate-700 ${
                                doctor.availability.status === "Available" ? "bg-green-500" :
                                doctor.availability.status === "Busy" ? "bg-red-500" :
                                "bg-yellow-500"
                              }`} />
                            </div>
                <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                <h2 className="text-2xl font-semibold text-slate-800 dark:text-white">
                      Dr. {doctor.firstName} {doctor.lastName}
                                </h2>
                    {doctor.isVerified && (
                                  <CheckCircle className="h-5 w-5 text-teal-500 fill-current" />
                                )}
                              </div>
                              <p className="text-lg text-slate-600 dark:text-slate-400">{doctor.specialization}</p>
                              <div className="flex items-center gap-3 mt-2">
                                {doctor.availability.instantBooking && (
                                  <Badge variant="secondary" className="bg-teal-100 dark:bg-teal-900/30 text-teal-800 dark:text-teal-300">
                                    Instant Booking
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Quick Stats */}
                          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
                            <div className="bg-slate-100 dark:bg-slate-700/50 rounded-lg p-3 text-center">
                              <div className="text-lg font-semibold text-slate-800 dark:text-white">{doctor.experience}+ yrs</div>
                              <div className="text-sm text-slate-600 dark:text-slate-400">Experience</div>
                </div>
                            <div className="bg-slate-100 dark:bg-slate-700/50 rounded-lg p-3 text-center">
                              <div className="text-lg font-semibold text-slate-800 dark:text-white">{doctor.successRate}%</div>
                              <div className="text-sm text-slate-600 dark:text-slate-400">Success Rate</div>
                </div>
                            <div className="bg-slate-100 dark:bg-slate-700/50 rounded-lg p-3 text-center">
                              <div className="text-lg font-semibold text-slate-800 dark:text-white">{doctor.totalConsultations}+</div>
                              <div className="text-sm text-slate-600 dark:text-slate-400">Consultations</div>
                </div>
              </div>

                          {/* Expertise */}
                          <div className="mb-6">
                            <h3 className="text-sm font-medium text-slate-800 dark:text-white mb-2">Expertise</h3>
                <div className="flex w-full flex-wrap gap-2">
                  {doctor.expertise.map((exp, index) => (
                                <Badge key={index} variant="secondary" className="bg-teal-100 dark:bg-teal-900/30 text-teal-800 dark:text-teal-300">
                      {exp}
                    </Badge>
                  ))}
                </div>
              </div>

                          {/* Service Tiers */}
                          <div>
                            <h3 className="text-sm font-medium text-slate-800 dark:text-white mb-4">Consultation Options</h3>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                              {doctor.serviceTiers.map((tier, index) => {
                                const isSelectedTier = selectedTierByDoctor[doctor._id] === tier.name;
                                return (
                                  <div
                                    key={index}
                                    role="button"
                                    tabIndex={0}
                                    aria-pressed={isSelectedTier}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleTierSelection(doctor._id, tier.name);
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        handleTierSelection(doctor._id, tier.name);
                                      }
                                    }}
                                    className={`p-4 rounded-lg border transition-all duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/50 ${
                                      tier.name === "Premium"
                                        ? "border-teal-200 dark:border-teal-800 bg-teal-50 dark:bg-teal-900/20"
                                        : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                                    } ${
                                      isSelectedTier
                                        ? "border-teal-500 bg-teal-50 dark:bg-teal-900/30 shadow-md"
                                        : "hover:border-teal-400 dark:hover:border-teal-600"
                                    }`}
                                  >
                                  <div className="flex justify-between items-center mb-2">
                                    <h4 className="font-medium text-slate-800 dark:text-white">{tier.name}</h4>
                                    <Badge variant="secondary" className="text-base font-semibold bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-white">
                                      ₹{tier.price}
                                    </Badge>
                                  </div>
                                  <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">{tier.duration} min consultation</p>
                                  <Button
                                    className={`w-full mt-3 ${isSelectedTier ? 'bg-gradient-to-r from-teal-500 to-teal-600 hover:from-teal-600 hover:to-teal-700 text-white' : 'border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-teal-50 dark:hover:bg-teal-900/20 hover:border-teal-500'}`}
                                    variant={isSelectedTier ? "default" : "outline"}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (!isSelectedTier) {
                                        handleTierSelection(doctor._id, tier.name);
                                        return;
                                      }
                                      handleBookAppointment(doctor, tier.name);
                                    }}
                                  >
                                    {isSelectedTier
                                      ? (doctor.availability.instantBooking ? "Book Instantly" : "Book Now")
                                      : "Select Option"}
                                  </Button>
                                </div>
                                );
                              })}
                            </div>
                          </div>

                          {/* Next Available Slot */}
                          <div className="mt-6 p-4 bg-slate-100 dark:bg-slate-700/50 rounded-lg">
                            <div className="flex items-center justify-between">
                              <div>
                                <h3 className="font-medium text-slate-800 dark:text-white">Next Available</h3>
                                <p className="text-sm text-slate-600 dark:text-slate-400">{doctor.availability.nextAvailableSlot}</p>
                              </div>
                              <div className="text-right">
                                <h3 className="font-medium text-slate-800 dark:text-white">Response Time</h3>
                                <p className="text-sm text-slate-600 dark:text-slate-400">{doctor.availability.responseTime}</p>
                              </div>
                            </div>
                          </div>
                          <Button
                            className="mt-4 w-full bg-teal-600 text-white hover:bg-teal-700"
                            onClick={() => handleInstantChat(doctor)}
                          >
                            <MessageCircle className="mr-2 h-4 w-4" />
                            Chat Now
                          </Button>
                        </div>
                      </Card>
                    </div>
                  </div>
                ) : (
                  // Compact Card View
                  <Card 
                    className="cursor-pointer hover:shadow-lg transition-all duration-200 overflow-hidden group relative bg-white dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 hover:border-teal-400 dark:hover:border-teal-600"
                    onClick={() => handleDoctorClick(doctor._id)}
                  >
                    {/* Availability Indicator */}
                    <div className={`absolute top-4 right-4 w-2 h-2 rounded-full ${
                      doctor.availability.status === "Available" 
                        ? "bg-green-500"
                        : doctor.availability.status === "Busy"
                        ? "bg-red-500"
                        : "bg-yellow-500"
                    }`} />

                    <div className="p-6">
                      {/* Doctor Info Section */}
                      <div className="flex items-center gap-5 mb-5">
                        <div className="relative">
                          <img
                            src={doctor.profileImage || DOCTOR_AVATAR_FALLBACK} onError={(e) => { const t = e.currentTarget as HTMLImageElement; t.onerror = null; t.src = DOCTOR_AVATAR_FALLBACK; }}
                            alt={`${doctor.firstName} ${doctor.lastName}`}
                            className="w-16 h-16 rounded-full object-cover ring-2 ring-slate-200 dark:ring-slate-700 group-hover:ring-teal-400/50 dark:group-hover:ring-teal-500/50 transition-all"
                          />
                          {doctor.isVerified && (
                            <div className="absolute -bottom-1 -right-1 bg-teal-500 rounded-full p-1 ring-1 ring-white dark:ring-slate-800">
                              <CheckCircle className="h-3 w-3 text-white" />
                            </div>
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-2 mb-0.5">
                            <h3 className="text-base font-medium text-slate-800 dark:text-white group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors">
                              Dr. {doctor.firstName} {doctor.lastName}
                            </h3>
                          </div>
                          <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">{doctor.specialization}</p>
                        </div>
                      </div>

                      {/* Key Info */}
                      <div className="flex items-center justify-between text-sm text-slate-600 dark:text-slate-400 mb-5">
                        <div className="flex items-center gap-1">
                          <Award className="h-4 w-4 text-teal-500" />
                          <span>{doctor.experience}+ years</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <MapPin className="h-4 w-4 text-teal-500" />
                          <span>{doctor.clinicAddress.city}</span>
                        </div>
                      </div>

                      {/* Bottom Section */}
                      <div className="flex flex-col gap-4 border-t border-slate-200 dark:border-slate-700 pt-4 sm:flex-row sm:items-end sm:justify-between">
                        <div className="text-sm w-full sm:w-auto">
                          <span className="text-slate-600 dark:text-slate-400">Next Available:</span>
                          <p className="font-medium text-slate-800 dark:text-white">{doctor.availability.nextAvailableSlot}</p>
                        </div>
                        <div className="text-left sm:text-right w-full sm:w-auto">
                          <span className="text-sm text-slate-600 dark:text-slate-400">Starts from</span>
                          <p className="font-semibold text-teal-600 dark:text-teal-400">₹{doctor.serviceTiers[0].price}</p>
                        </div>
                        <Button
                          className="w-full bg-teal-600 text-white hover:bg-teal-700 sm:w-auto"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleInstantChat(doctor);
                          }}
                        >
                          <MessageCircle className="mr-2 h-4 w-4" />
                          Chat Now
                        </Button>
                      </div>
                    </div>
                  </Card>
                )}
              </div>
          ))
        )}
      </div>
    </div>
    // </MainLayout>
  );
};
export default Consultation; 
