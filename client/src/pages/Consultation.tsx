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
  averageRating: number;
  totalReviews: number;
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

export const dummyDoctors: Doctor[] = [
  {
    _id: "1",
    firstName: "John",
    lastName: "Smith",
    profileImage: "https://randomuser.me/api/portraits/men/1.jpg",
    specialization: "Cardiologist",
    experience: 15,
    serviceTiers: [
      {
        name: "Basic",
        price: 1500,
        duration: 30,
        description: "Basic video consultation with preliminary assessment",
        features: [
          "30-minute video consultation",
          "Basic health assessment",
          "Digital prescription",
          "24-hour response time"
        ],
        deliveryTime: "1-2 days",
        revisions: 1
      },
      {
        name: "Standard",
        price: 2500,
        duration: 45,
        description: "Comprehensive consultation with detailed assessment",
        features: [
          "45-minute video consultation",
          "Detailed health assessment",
          "Digital prescription",
          "Follow-up consultation",
          "Diet recommendations",
          "12-hour response time"
        ],
        deliveryTime: "1 day",
        revisions: 2
      },
      {
        name: "Premium",
        price: 4000,
        duration: 60,
        description: "Premium care with extended support",
        features: [
          "60-minute video consultation",
          "Comprehensive health assessment",
          "Priority appointment scheduling",
          "2 Follow-up consultations",
          "Detailed health report",
          "Personalized care plan",
          "6-hour response time"
        ],
        deliveryTime: "Same day",
        revisions: 3
      }
    ],
    availability: {
      status: "Available",
      nextAvailableSlot: "Today, 2:00 PM",
      responseTime: "Usually responds in 15 minutes",
      workingHours: [
        { day: "Monday", startTime: "09:00", endTime: "17:00", isAvailable: true },
        { day: "Wednesday", startTime: "09:00", endTime: "17:00", isAvailable: true },
        { day: "Friday", startTime: "09:00", endTime: "17:00", isAvailable: true }
      ],
      instantBooking: true
    },
    clinicAddress: {
      city: "Mumbai",
      state: "Maharashtra"
    },
    averageRating: 4.8,
    totalReviews: 124,
    isVerified: true,
    expertise: ["Heart Surgery", "Cardiac Rehabilitation", "Preventive Cardiology"],
    languages: ["English", "Hindi", "Marathi"],
    about: "Dr. John Smith is a renowned cardiologist with over 15 years of experience in treating heart conditions.",
    successRate: 98,
    totalConsultations: 1500,
    completionRate: 99,
    responseRate: 98,
    reviews: [
      {
        userId: { firstName: "Alice", lastName: "Johnson" },
        rating: 5,
        review: "Excellent doctor, very thorough and professional",
        date: "2024-02-15",
        serviceTier: "Premium"
      }
    ]
  },
  {
    _id: "2",
    firstName: "Sarah",
    lastName: "Patel",
    profileImage: "https://randomuser.me/api/portraits/women/2.jpg",
    specialization: "Pediatrician",
    experience: 10,
    serviceTiers: [
      {
        name: "Basic",
        price: 1000,
        duration: 30,
        description: "One-time video consultation with basic health assessment",
        features: ["Video consultation", "Digital prescription", "Basic health assessment"],
        deliveryTime: "1-2 days",
        revisions: 1
      },
      {
        name: "Standard",
        price: 2000,
        duration: 45,
        description: "Detailed consultation with follow-ups",
        features: ["Extended consultation", "2 follow-ups", "Detailed health report", "Diet plan"],
        deliveryTime: "1 day",
        revisions: 2
      }
    ],
    availability: {
      status: "Available",
      nextAvailableSlot: "Today, 3:00 PM",
      responseTime: "Usually responds in 20 minutes",
      workingHours: [
        { day: "Tuesday", startTime: "10:00", endTime: "18:00", isAvailable: true },
        { day: "Thursday", startTime: "10:00", endTime: "18:00", isAvailable: true },
        { day: "Saturday", startTime: "09:00", endTime: "14:00", isAvailable: true }
      ],
      instantBooking: false
    },
    clinicAddress: {
      city: "Delhi",
      state: "Delhi"
    },
    averageRating: 4.9,
    totalReviews: 98,
    isVerified: true,
    expertise: ["Child Healthcare", "Vaccination", "Developmental Pediatrics"],
    languages: ["English", "Hindi", "Gujarati"],
    about: "Dr. Sarah Patel specializes in pediatric care with a focus on early childhood development.",
    successRate: 95,
    totalConsultations: 1000,
    completionRate: 96,
    responseRate: 95,
    reviews: [
      {
        userId: { firstName: "Raj", lastName: "Kumar" },
        rating: 5,
        review: "Great with kids, very patient and caring",
        date: "2024-02-10",
        serviceTier: "Standard"
      }
    ]
  },
  {
    _id: "3",
    firstName: "David",
    lastName: "Kumar",
    profileImage: "https://randomuser.me/api/portraits/men/3.jpg",
    specialization: "Dermatologist",
    experience: 8,
    serviceTiers: [
      {
        name: "Basic",
        price: 1200,
        duration: 30,
        description: "One-time video consultation with basic health assessment",
        features: ["Video consultation", "Digital prescription", "Basic health assessment"],
        deliveryTime: "1-2 days",
        revisions: 1
      },
      {
        name: "Standard",
        price: 2000,
        duration: 45,
        description: "Detailed consultation with follow-ups",
        features: ["Extended consultation", "2 follow-ups", "Detailed health report", "Diet plan"],
        deliveryTime: "1 day",
        revisions: 2
      }
    ],
    availability: {
      status: "Available",
      nextAvailableSlot: "Today, 4:00 PM",
      responseTime: "Usually responds in 25 minutes",
      workingHours: [
        { day: "Monday", startTime: "11:00", endTime: "19:00", isAvailable: true },
        { day: "Thursday", startTime: "11:00", endTime: "19:00", isAvailable: true },
        { day: "Saturday", startTime: "10:00", endTime: "15:00", isAvailable: true }
      ],
      instantBooking: false
    },
    clinicAddress: {
      city: "Bangalore",
      state: "Karnataka"
    },
    averageRating: 4.7,
    totalReviews: 76,
    isVerified: true,
    expertise: ["Cosmetic Dermatology", "Skin Cancer", "Laser Treatment"],
    languages: ["English", "Hindi", "Kannada"],
    about: "Dr. David Kumar is an expert in treating various skin conditions and cosmetic procedures.",
    successRate: 90,
    totalConsultations: 800,
    completionRate: 88,
    responseRate: 87,
    reviews: [
      {
        userId: { firstName: "Priya", lastName: "Singh" },
        rating: 4,
        review: "Very knowledgeable and effective treatment",
        date: "2024-02-01",
        serviceTier: "Basic"
      }
    ]
  },
  {
    _id: "4",
    firstName: "Priya",
    lastName: "Sharma",
    profileImage: "https://randomuser.me/api/portraits/women/4.jpg",
    specialization: "Neurologist",
    experience: 12,
    serviceTiers: [
      {
        name: "Basic",
        price: 1800,
        duration: 30,
        description: "One-time video consultation with basic health assessment",
        features: ["Video consultation", "Digital prescription", "Basic health assessment"],
        deliveryTime: "1-2 days",
        revisions: 1
      },
      {
        name: "Standard",
        price: 3000,
        duration: 45,
        description: "Detailed consultation with follow-ups",
        features: ["Extended consultation", "2 follow-ups", "Detailed health report", "Diet plan"],
        deliveryTime: "1 day",
        revisions: 2
      }
    ],
    availability: {
      status: "Available",
      nextAvailableSlot: "Today, 5:00 PM",
      responseTime: "Usually responds in 30 minutes",
      workingHours: [
        { day: "Tuesday", startTime: "09:00", endTime: "17:00", isAvailable: true },
        { day: "Wednesday", startTime: "09:00", endTime: "17:00", isAvailable: true },
        { day: "Friday", startTime: "09:00", endTime: "17:00", isAvailable: true }
      ],
      instantBooking: false
    },
    clinicAddress: {
      city: "Chennai",
      state: "Tamil Nadu"
    },
    averageRating: 4.9,
    totalReviews: 112,
    isVerified: true,
    expertise: ["Stroke Treatment", "Epilepsy", "Movement Disorders"],
    languages: ["English", "Hindi", "Tamil"],
    about: "Dr. Priya Sharma is a leading neurologist specializing in stroke treatment and epilepsy management.",
    successRate: 92,
    totalConsultations: 1200,
    completionRate: 90,
    responseRate: 89,
    reviews: [
      {
        userId: { firstName: "John", lastName: "Doe" },
        rating: 5,
        review: "Excellent diagnosis and treatment plan",
        date: "2024-01-25",
        serviceTier: "Standard"
      }
    ]
  },
  {
    _id: "5",
    firstName: "Rahul",
    lastName: "Verma",
    profileImage: "https://randomuser.me/api/portraits/men/5.jpg",
    specialization: "Orthopedic",
    experience: 14,
    serviceTiers: [
      {
        name: "Basic",
        price: 1600,
        duration: 30,
        description: "One-time video consultation with basic health assessment",
        features: ["Video consultation", "Digital prescription", "Basic health assessment"],
        deliveryTime: "1-2 days",
        revisions: 1
      },
      {
        name: "Standard",
        price: 2500,
        duration: 45,
        description: "Detailed consultation with follow-ups",
        features: ["Extended consultation", "2 follow-ups", "Detailed health report", "Diet plan"],
        deliveryTime: "1 day",
        revisions: 2
      }
    ],
    availability: {
      status: "Available",
      nextAvailableSlot: "Today, 6:00 PM",
      responseTime: "Usually responds in 35 minutes",
      workingHours: [
        { day: "Monday", startTime: "10:00", endTime: "18:00", isAvailable: true },
        { day: "Wednesday", startTime: "10:00", endTime: "18:00", isAvailable: true },
        { day: "Thursday", startTime: "10:00", endTime: "18:00", isAvailable: true }
      ],
      instantBooking: false
    },
    clinicAddress: {
      city: "Hyderabad",
      state: "Telangana"
    },
    averageRating: 4.6,
    totalReviews: 89,
    isVerified: true,
    expertise: ["Joint Replacement", "Sports Injuries", "Spine Surgery"],
    languages: ["English", "Hindi", "Telugu"],
    about: "Dr. Rahul Verma is specialized in joint replacement surgery and sports medicine.",
    successRate: 88,
    totalConsultations: 1000,
    completionRate: 86,
    responseRate: 85,
    reviews: [
      {
        userId: { firstName: "Sarah", lastName: "Wilson" },
        rating: 5,
        review: "Great surgeon, explained everything clearly",
        date: "2024-02-05",
        serviceTier: "Standard"
      }
    ]
  }
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
  const averageRating = toNumber(doctor?.averageRating ?? doctor?.rating, 4.7);
  const totalReviews = toNumber(doctor?.totalReviews ?? doctor?.reviewCount, 0);
  const clinicAddress = parseClinicAddress(doctor?.clinicAddress);
  const languages = toArray(doctor?.languages, ["English"]);
  const expertise = toArray(doctor?.expertise || doctor?.services, [specialization]);
  const about =
    doctor?.about ||
    `Dr. ${firstName} ${lastName}`.trim() +
      " provides trusted online consultations through the Mediczy network.";

  const successRate = clamp(
    toNumber(doctor?.successRate, Math.round(averageRating * 18)),
    85,
    99
  );
  const totalConsultations = toNumber(
    doctor?.totalConsultations,
    300 + experience * 60
  );
  const completionRate = clamp(toNumber(doctor?.completionRate, successRate - 1), 80, 99);
  const responseRate = clamp(toNumber(doctor?.responseRate, 96), 80, 99);

  return {
    _id: String(doctor?._id ?? doctor?.id ?? `temp-${Math.random().toString(36).slice(2)}`),
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
    averageRating,
    totalReviews,
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

const Consultation = () => {
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedSpecialization, setSelectedSpecialization] = useState("all");
  const [sortBy, setSortBy] = useState("rating");
  const [selectedDoctor, setSelectedDoctor] = useState<string | null>(null);
  const [selectedTierByDoctor, setSelectedTierByDoctor] = useState<Record<string, string>>({});
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    fetchDoctors();
  }, []);

  const fetchDoctors = async () => {
    try {
      setLoading(true);
      const response = await api.get("/doctors/available");
      const apiDoctors = Array.isArray(response.data?.data)
        ? response.data.data
        : Array.isArray(response.data?.doctors)
        ? response.data.doctors
        : [];

      const normalizedDoctors = apiDoctors
        .map(normalizeDoctorFromApi)
        .filter((doctor): doctor is Doctor => Boolean(doctor));

      if (!normalizedDoctors.length) {
        setDoctors(dummyDoctors);
        toast({
          title: "Showing test doctors",
          description: "No live doctor profiles were returned. Displaying demo doctors instead.",
        });
      } else {
        setDoctors(normalizedDoctors);
      }
    } catch (error) {
      console.error("Error fetching doctors:", error);
      setDoctors(dummyDoctors);
      toast({
        title: "Info",
        description: "Using sample doctor data",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    fetchDoctors();
  };

  const handleBookAppointment = (doctor: Doctor, tierName?: string) => {
    const tierParam = tierName ? `?tier=${encodeURIComponent(tierName)}` : '';
    navigate(`/consultation/${doctor._id}${tierParam}`, {
      state: { doctor }
    });
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
            case "rating":
              return b.averageRating - a.averageRating;
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
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Header Section */}
        <div className="flex flex-col gap-6 mb-8 lg:flex-row lg:items-center lg:justify-between">
          <div className="w-full lg:w-auto">
            <h1 className="text-3xl font-bold text-foreground">Find and Consult Top Doctors</h1>
            <p className="text-muted-foreground mt-2">Connect with the best healthcare professionals</p>
          </div>
          <div className="flex w-full flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Button variant="outline" className="flex h-10 w-full items-center gap-2 sm:w-auto">
              <Filter className="h-4 w-4" />
              Advanced Filters
            </Button>
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="h-10 w-full sm:w-48">
                <SelectValue placeholder="Sort By" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="rating">Highest Rating</SelectItem>
                <SelectItem value="experience">Most Experienced</SelectItem>
                <SelectItem value="fees">Lowest Price</SelectItem>
                <SelectItem value="response">Fastest Response</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

      {/* Search and Filter Section */}
        <div className="bg-card rounded-xl shadow-sm border border-border p-6 mb-8">
          <div className="flex flex-col gap-4 md:flex-row">
        <div className="flex-1">
          <div className="relative">
            <Input
                  placeholder="Search by doctor name, specialization, or expertise..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 h-12 text-base"
            />
                <Search className="absolute left-3 top-4 h-4 w-4 text-muted-foreground" />
          </div>
        </div>
        <Select
          value={selectedSpecialization}
          onValueChange={setSelectedSpecialization}
        >
              <SelectTrigger className="h-12 w-full md:w-64">
                <SelectValue placeholder="Select Specialization" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Specializations</SelectItem>
            {specializations.map((spec) => (
              <SelectItem key={spec} value={spec}>
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
              <p className="text-muted-foreground">Loading doctors...</p>
            </div>
        ) : filteredDoctors.length === 0 ? (
            <div className="col-span-full text-center py-8">
              <p className="text-muted-foreground">No doctors found matching your criteria.</p>
            </div>
        ) : (
          filteredDoctors.map((doctor) => (
              <div key={doctor._id} className="relative">
                {selectedDoctor === doctor._id ? (
                  // Simplified Detailed View
                  <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 overflow-y-auto">
                    <div className="container mx-auto px-4 py-8 max-w-3xl">
                      <Card className="relative mt-8">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="absolute right-3 top-3 sm:right-4 sm:top-4"
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
                  src={doctor.profileImage || "/default-doctor.png"}
                  alt={`${doctor.firstName} ${doctor.lastName}`}
                                className="w-24 h-24 rounded-full object-cover border-4 border-background shadow-md"
                              />
                              <div className={`absolute -bottom-1 -right-1 w-6 h-6 rounded-full border-4 border-background ${
                                doctor.availability.status === "Available" ? "bg-green-500" :
                                doctor.availability.status === "Busy" ? "bg-red-500" :
                                "bg-yellow-500"
                              }`} />
                            </div>
                <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                <h2 className="text-2xl font-semibold text-foreground">
                      Dr. {doctor.firstName} {doctor.lastName}
                                </h2>
                    {doctor.isVerified && (
                                  <CheckCircle className="h-5 w-5 text-blue-500 fill-current" />
                    )}
                  </div>
                              <p className="text-lg text-muted-foreground">{doctor.specialization}</p>
                              <div className="flex items-center gap-3 mt-2">
                                <div className="flex items-center gap-1">
                                  <Star className="h-5 w-5 text-yellow-500 fill-current" />
                                  <span className="font-medium">{doctor.averageRating.toFixed(1)}</span>
                                  <span className="text-muted-foreground">({doctor.totalReviews} reviews)</span>
                                </div>
                                {doctor.availability.instantBooking && (
                                  <Badge variant="secondary" className="bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300">
                                    Instant Booking
                                  </Badge>
                                )}
                  </div>
                </div>
              </div>

                          {/* Quick Stats */}
                          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
                            <div className="bg-muted/50 rounded-lg p-3 text-center">
                              <div className="text-lg font-semibold text-foreground">{doctor.experience}+ yrs</div>
                              <div className="text-sm text-muted-foreground">Experience</div>
                </div>
                            <div className="bg-muted/50 rounded-lg p-3 text-center">
                              <div className="text-lg font-semibold text-foreground">{doctor.successRate}%</div>
                              <div className="text-sm text-muted-foreground">Success Rate</div>
                </div>
                            <div className="bg-muted/50 rounded-lg p-3 text-center">
                              <div className="text-lg font-semibold text-foreground">{doctor.totalConsultations}+</div>
                              <div className="text-sm text-muted-foreground">Consultations</div>
                </div>
              </div>

                          {/* Expertise */}
                          <div className="mb-6">
                            <h3 className="text-sm font-medium text-foreground mb-2">Expertise</h3>
                <div className="flex w-full flex-wrap gap-2">
                  {doctor.expertise.map((exp, index) => (
                                <Badge key={index} variant="secondary" className="bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300">
                      {exp}
                    </Badge>
                  ))}
                </div>
              </div>

                          {/* Service Tiers */}
                          <div>
                            <h3 className="text-sm font-medium text-foreground mb-4">Consultation Options</h3>
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
                                    className={`p-4 rounded-lg border transition-all duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
                                      tier.name === "Premium"
                                        ? "border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20"
                                        : "border-border"
                                    } ${
                                      isSelectedTier
                                        ? "border-primary bg-primary/5 shadow-md"
                                        : "hover:border-primary/40"
                                    }`}
                                  >
                                  <div className="flex justify-between items-center mb-2">
                                    <h4 className="font-medium text-foreground">{tier.name}</h4>
                                    <Badge variant="secondary" className="text-base font-semibold">
                                      ₹{tier.price}
                                    </Badge>
                                  </div>
                                  <p className="text-sm text-muted-foreground mb-3">{tier.duration} min consultation</p>
                                  <Button
                                    className="w-full mt-3"
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
                          <div className="mt-6 p-4 bg-muted/50 rounded-lg">
                            <div className="flex items-center justify-between">
                              <div>
                                <h3 className="font-medium text-foreground">Next Available</h3>
                                <p className="text-sm text-muted-foreground">{doctor.availability.nextAvailableSlot}</p>
                              </div>
                              <div className="text-right">
                                <h3 className="font-medium text-foreground">Response Time</h3>
                                <p className="text-sm text-muted-foreground">{doctor.availability.responseTime}</p>
                              </div>
                            </div>
                          </div>
                        </div>
                      </Card>
                    </div>
                  </div>
                ) : (
                  // Compact Card View
                  <Card 
                    className="cursor-pointer hover:shadow-md transition-all duration-200 overflow-hidden group relative bg-background"
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
                            src={doctor.profileImage || "/default-doctor.png"}
                            alt={`${doctor.firstName} ${doctor.lastName}`}
                            className="w-16 h-16 rounded-full object-cover ring-2 ring-border group-hover:ring-primary/30 transition-all"
                          />
                          {doctor.isVerified && (
                            <div className="absolute -bottom-1 -right-1 bg-primary rounded-full p-1 ring-1 ring-background">
                              <CheckCircle className="h-3 w-3 text-background" />
                            </div>
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-2 mb-0.5">
                            <h3 className="text-base font-medium text-foreground group-hover:text-primary transition-colors">
                              Dr. {doctor.firstName} {doctor.lastName}
                            </h3>
                          </div>
                          <p className="text-sm text-muted-foreground mb-2">{doctor.specialization}</p>
                          <div className="flex items-center gap-1.5">
                            <Star className="h-3.5 w-3.5 text-yellow-500 fill-current" />
                            <span className="text-sm font-medium">{doctor.averageRating.toFixed(1)}</span>
                            <span className="text-sm text-muted-foreground">({doctor.totalReviews})</span>
                          </div>
                        </div>
                      </div>

                      {/* Key Info */}
                      <div className="flex items-center justify-between text-sm text-muted-foreground mb-5">
                        <div className="flex items-center gap-1">
                          <Award className="h-4 w-4" />
                          <span>{doctor.experience}+ years</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <MapPin className="h-4 w-4" />
                          <span>{doctor.clinicAddress.city}</span>
                        </div>
                      </div>

                      {/* Bottom Section */}
                      <div className="flex flex-col gap-4 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="text-sm w-full sm:w-auto">
                          <span className="text-muted-foreground">Next Available:</span>
                          <p className="font-medium text-foreground">{doctor.availability.nextAvailableSlot}</p>
                        </div>
                        <div className="text-left sm:text-right w-full sm:w-auto">
                          <span className="text-sm text-muted-foreground">Starts from</span>
                          <p className="font-semibold text-foreground">₹{doctor.serviceTiers[0].price}</p>
                        </div>
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

